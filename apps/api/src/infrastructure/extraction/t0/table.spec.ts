import { describe, expect, it } from 'vitest';
import type { RepairedPage } from './text-quality';
import { parseTransactions, readHeader } from './table';

/** Synthetic pages reproducing the layout patterns seen in the dev set (no real data). */
const page = (number: number, lines: string[]): RepairedPage => ({
  number,
  lines,
  quality: 1,
  repair: 'none',
});
const period = { start: '2025-04-01', end: '2025-04-30' };

const HEADER = 'FECHA      CONCEPTO                         CARGOS        ABONOS         SALDO';

describe('readHeader', () => {
  it('finds column roles and positions', () => {
    const h = readHeader(HEADER);
    expect(h?.columns.map((c) => c.role)).toEqual(['debit', 'credit', 'balance']);
    expect(h?.dayOnly).toBe(false);
  });

  it('ignores lines with amounts (summary lines are not headers)', () => {
    expect(readHeader('ABONOS   924,405.41   CARGOS  923,070.02')).toBeNull();
  });

  it('detects day columns and signed tables', () => {
    expect(readHeader('DIA   CONCEPTO     CARGOS   ABONOS   SALDO')?.dayOnly).toBe(true);
    expect(readHeader('FECHA   Descripción     Valor    Saldo')?.signed).toBe(true);
  });
});

describe('parseTransactions', () => {
  it('decides the side from the running balance, not the column', () => {
    const { transactions } = parseTransactions(
      [
        page(1, [
          HEADER,
          // Amount printed slightly off-column: the balance delta still says debit.
          '01-ABR-2025 PAGO PROVEEDOR                        78.58                    921.42',
          '02-ABR-2025 DEPOSITO CLIENTE                                  100.00     1,021.42',
        ]),
      ],
      period,
      100_000,
    );
    expect(transactions.map((t) => [t.debit, t.credit, t.balance, t.sideBy])).toEqual([
      [7858, 0, 92142, 'balance-delta'],
      [0, 10000, 102142, 'balance-delta'],
    ]);
  });

  it('keeps a record open across a page break until its amounts appear', () => {
    const { transactions } = parseTransactions(
      [
        page(1, [HEADER, '03 ABR   OXXO SUCURSAL', '         CAJA 0021 AUT 0054']),
        page(2, [
          'ESTADO DE CUENTA',
          'Página: 2 de 5',
          HEADER,
          '         HORA 06:03 SUC 0342        1,098.01                  998.01',
        ]),
      ],
      period,
      209_602,
    );
    expect(transactions).toHaveLength(1);
    expect(transactions[0]).toMatchObject({ debit: 109801, balance: 99801, page: 1 });
    expect(transactions[0]?.description).not.toContain('Página');
  });

  it('ignores 0.00 printed in the empty column', () => {
    const { transactions } = parseTransactions(
      [
        page(1, [
          HEADER,
          '01/04/2025 Depósito SPEI de CLIENTE            0.00     17,631.47     42,998.76',
        ]),
      ],
      period,
      2_536_729,
    );
    expect(transactions[0]).toMatchObject({ credit: 1763147, debit: 0 });
  });

  it('skips opening, closing and balance-only rows', () => {
    const { transactions, openingFromTable } = parseTransactions(
      [
        page(1, [
          HEADER,
          '01 ABR   SALDO ANTERIOR                                                  500.00',
          '02 ABR   COMPRA                                 100.00                   400.00',
          '27 ABR   DISPOSICIONES EN CAJERO EXENTAS 11                              400.00',
          '30 ABR   SALDO AL 30 DE ABRIL                                            400.00',
        ]),
      ],
      period,
      null,
    );
    expect(openingFromTable).toBe(50000);
    expect(transactions).toHaveLength(1);
  });

  it('drops amounts inside the description area', () => {
    const { transactions } = parseTransactions(
      [
        page(1, [
          HEADER,
          '01-ABR-2025 CONSUMO INTERNACIONAL                 3,294.70                48,359.71',
          '            (MONEDA EXTRANJERA) 670,687.00 COP',
        ]),
      ],
      period,
      5_165_441,
    );
    expect(transactions[0]).toMatchObject({ debit: 329470 });
  });

  it('reads signed tables (unsigned = money in) and day-only tables', () => {
    const signed = parseTransactions(
      [
        page(1, [
          'Fecha      Descripción                 Valor          Saldo',
          '14-04-2025 Pago servicio            $ -40.00        $ 29.30',
          '15-04-2025 Transferencia recibida   $ 215.87       $ 245.17',
        ]),
      ],
      period,
      6_930,
    ).transactions;
    expect(signed.map((t) => [t.debit, t.credit])).toEqual([
      [4000, 0],
      [0, 21587],
    ]);

    const dayOnly = parseTransactions(
      [
        page(1, [
          'DIA  CONCEPTO                       CARGOS     ABONOS      SALDO',
          '07 EFE RETIRO CAJERO              4,000.00               2,478.04',
          '19 MAR SEGURO VIDA                  100.00               2,378.04',
        ]),
      ],
      period,
      647_804,
    ).transactions;
    expect(dayOnly.map((t) => t.date)).toEqual(['2025-04-07', '2025-04-19']);
  });

  it('stops at totals and resumes at the next header', () => {
    const { transactions } = parseTransactions(
      [
        page(1, [
          HEADER,
          '02 ABR   COMPRA                                 100.00                   400.00',
          '         TOTAL                                  100.00         0.00',
          '05 ABR   texto fuera de tabla                   999.99                   999.99',
        ]),
      ],
      period,
      50_000,
    );
    expect(transactions).toHaveLength(1);
  });
});
