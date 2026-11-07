import { tinyPdf } from './tiny-pdf';

/**
 * A synthetic, healthy bank statement for last month (relative to `today`), so eligibility with
 * asOf = today sees a recent statement. T0 parses it; the numbers reconcile.
 */
export function demoStatementPdf(today = new Date()): Uint8Array {
  const y = today.getUTCMonth() === 0 ? today.getUTCFullYear() - 1 : today.getUTCFullYear();
  const m = today.getUTCMonth() === 0 ? 12 : today.getUTCMonth();
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, '0');
  const d = (day: number) => `${String(day).padStart(2, '0')}/${mm}/${y}`;
  return tinyPdf([
    'BANCO DEMO                                   ESTADO DE CUENTA',
    `Periodo: del ${d(1)} al ${d(last)}`,
    'Saldo anterior                                100,000.00',
    'Saldo final                                   130,000.00',
    '',
    'FECHA        CONCEPTO                         CARGOS         ABONOS          SALDO',
    `${d(3)}   SPEI RECIBIDO CLIENTE ALFA                      120,000.00     220,000.00`,
    `${d(5)}   PAGO NOMINA                       90,000.00                    130,000.00`,
    `${d(12)}   SPEI RECIBIDO CLIENTE BETA                       90,000.00     220,000.00`,
    `${d(18)}   PAGO PROVEEDOR ACEROS             80,000.00                    140,000.00`,
    `${d(25)}   DEPOSITO CLIENTE GAMMA                           60,000.00     200,000.00`,
    `${d(28)}   PAGO RENTA                        70,000.00                    130,000.00`,
  ]);
}
