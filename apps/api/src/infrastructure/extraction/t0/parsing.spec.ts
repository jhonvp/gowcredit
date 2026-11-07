import { describe, expect, it } from 'vitest';
import { findAmounts } from './amounts';
import { findPeriod, readRowDate, resolveRowDate } from './dates';
import { fuzzyFind } from './fuzzy';
import { decodeEbcdicLine, repairPage, textQuality } from './text-quality';

describe('findAmounts', () => {
  it.each([
    ['SALDO ANTERIOR          98.52', [9852], [null]],
    ['Compra          -$82.00', [8200], [-1]],
    ['Retiro de Cajita   +$100.00', [10000], [1]],
    ['Pago Google   164165252020   $ -40.00   $ 29.30', [4000, 2930], [-1, null]],
    ['ref 20260114594625$ 15,185.06 $ 393,682.37', [1518506, 39368237], [null, null]],
  ])('%s', (line, cents, signs) => {
    const found = findAmounts(line);
    expect(found.map((a) => a.cents)).toEqual(cents);
    expect(found.map((a) => a.sign)).toEqual(signs);
  });

  it('ignores percentages, integers and glued references', () => {
    expect(findAmounts('GAT 3.04% DIAS 31 REF 0082208 12345.678')).toEqual([]);
  });

  it('reports column spans', () => {
    const [a] = findAmounts('    1,433.91 x');
    expect(a).toMatchObject({ start: 4, end: 12 });
  });
});

describe('findPeriod', () => {
  it.each([
    ['PERIODO   Del 01 Ene. 2025 al 31 Ene. 2025', '2025-01-01', '2025-01-31'],
    ['del 01 al 30 de ABRIL 2025', '2025-04-01', '2025-04-30'],
    ['Periodo 1 de octubre de 2025 al 31 de octubre de 2025', '2025-10-01', '2025-10-31'],
    ['RESUMEN DEL:                01/FEB/2026AL 28/FEB/2026', '2026-02-01', '2026-02-28'],
    ['Periodo     DEL 01/09/2025 AL 30/09/2025', '2025-09-01', '2025-09-30'],
    ['Periodo: Del 13 de June al 11 de septiembre de 2026', '2026-06-13', '2026-09-11'],
    ['PERIODO       DEL 01-ABR-2025 AL 30-ABR-2025', '2025-04-01', '2025-04-30'],
    ['Periodo: del 01 al 31 jul 2025', '2025-07-01', '2025-07-31'],
    ['Período del 01/12/2025 al 15/01/2026', '2025-12-01', '2026-01-15'],
  ])('%s', (text, start, end) => {
    expect(findPeriod(text)).toEqual({ start, end });
  });
});

describe('row dates', () => {
  const period = { start: '2025-04-01', end: '2025-04-30' };
  it.each([
    ['ENE. 16 3275780559   DEPOSITO SPEI', false, { day: 16, month: 1, year: null }],
    ['01/10/2025          Depósito SPEI', false, { day: 1, month: 10, year: 2025 }],
    ['03 FEB   OXXO BENITO JUAREZ', false, { day: 3, month: 2, year: null }],
    ['01/SEP   01/SEP N06 PAGO', false, { day: 1, month: 9, year: null }],
    ['14-06-2026      Pago Google', false, { day: 14, month: 6, year: 2026 }],
    ['01-ABR-2025 0082208 CONSUMO', false, { day: 1, month: 4, year: 2025 }],
    [' 31 JUL 2025          MERCADOPAGO', false, { day: 31, month: 7, year: 2025 }],
    ['07 EFE   -RETIRO CAJERO', true, { day: 7, month: null, year: null }],
    ['06CGO Pago', true, { day: 6, month: null, year: null }],
  ])('%s', (line, dayOnly, date) => {
    expect(readRowDate(line, dayOnly)?.date).toEqual(date);
  });

  it('rejects bare days unless the table has a day column, and numeric references', () => {
    expect(readRowDate('07 EFE', false)).toBeNull();
    expect(readRowDate('832008', true)).toBeNull();
    expect(readRowDate('         SUC 0342', true)).toBeNull();
  });

  it('resolves day-only dates monotonically across months', () => {
    const p = { start: '2026-06-13', end: '2026-09-11' };
    expect(resolveRowDate({ day: 30, month: null, year: null }, p, null)).toBe('2026-06-30');
    expect(resolveRowDate({ day: 2, month: null, year: null }, p, '2026-06-30')).toBe('2026-07-02');
    expect(
      resolveRowDate(
        { day: 16, month: 1, year: null },
        { start: '2025-01-01', end: '2025-01-31' },
        null,
      ),
    ).toBe('2025-01-16');
    expect(
      resolveRowDate(
        { day: 20, month: 12, year: null },
        { start: '2025-12-15', end: '2026-01-14' },
        null,
      ),
    ).toBe('2025-12-20');
    expect(resolveRowDate({ day: 7, month: null, year: null }, period, '2025-04-07')).toBe(
      '2025-04-07',
    );
  });
});

describe('fuzzyFind', () => {
  it('matches labels with dropped letters (EBCDIC/OCR damage)', () => {
    expect(fuzzyFind('4 Saldo Final d l    $ 128,377.78', 'saldo final del', 2)).not.toBeNull();
    expect(fuzzyFind('4 D pósitos/   $ 177,438.67', 'depositos', 1)).not.toBeNull();
  });

  it('respects the error budget', () => {
    expect(fuzzyFind('Saldo Promedio', 'saldo inicial', 2)).toBeNull();
  });

  it('returns the match span', () => {
    expect(fuzzyFind('xx Saldo Anterior yy', 'saldo anterior', 0)).toEqual({
      start: 3,
      end: 17,
      errors: 0,
    });
  });
});

describe('text quality and EBCDIC repair', () => {
  const garbage = 'ÃäÅÕãÁ@ÔÁÅâãÙÁ';
  it('scores EBCDIC garbage low and normal text high', () => {
    expect(textQuality([garbage])).toBeLessThan(0.75);
    expect(textQuality(['Saldo Inicial $ 408,867.43'])).toBe(1);
  });

  it('decodes cp500 while keeping layout spaces', () => {
    expect(decodeEbcdicLine('ÃäÅÕãÁ   ðKðð')).toBe('CUENTA   0.00');
  });

  it('repairs only when decoding clearly improves the page', () => {
    expect(repairPage({ number: 1, lines: [garbage] }).repair).toBe('ebcdic');
    expect(repairPage({ number: 1, lines: ['ESTADO DE CUENTA'] }).repair).toBe('none');
  });
});
