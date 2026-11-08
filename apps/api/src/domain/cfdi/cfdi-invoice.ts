import type { Cents } from '../shared/money';
import type { IsoDate } from '../shared/iso-date';

/** CFDI 3.3/4.0 invoice, as far as eligibility needs it (SAT Anexo 20). Money in cents. */
export interface CfdiInvoice {
  uuid: string | null;
  version: string | null;
  /** TipoDeComprobante: I ingreso, E egreso, T traslado, N nómina, P pago. */
  voucherType: string | null;
  /** MetodoPago: PUE (paid in one exhibition) or PPD (deferred / in installments). */
  paymentMethod: string | null;
  issuerRfc: string | null;
  issuerName: string | null;
  receiverRfc: string | null;
  receiverName: string | null;
  currency: string | null;
  exchangeRate: number | null;
  issueDate: IsoDate | null;
  subtotal: Cents | null;
  discount: Cents;
  transferredTaxes: Cents;
  withheldTaxes: Cents;
  total: Cents | null;
  conceptCount: number;
}
