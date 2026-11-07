import { XMLParser } from 'fast-xml-parser';
import { type CfdiParserPort, CfdiParseError } from '../../application/ports/eligibility.ports';
import type { CfdiInvoice } from '../../domain/cfdi/cfdi-invoice';
import { toCents } from '../../domain/shared/money';

type Node = Record<string, unknown>;

/**
 * CFDI 3.3 / 4.0 XML parser (SAT Anexo 20). Namespace prefixes are stripped; entities are not
 * processed and DTDs are never fetched, so there is no XXE surface.
 */
export class CfdiXmlParser implements CfdiParserPort {
  private readonly xml = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@',
    removeNSPrefix: true,
    processEntities: false,
    parseAttributeValue: false,
    isArray: (name) => name === 'Concepto',
  });

  parse(bytes: Uint8Array): CfdiInvoice {
    let doc: Node;
    try {
      doc = this.xml.parse(new TextDecoder('utf-8').decode(bytes)) as Node;
    } catch (e) {
      throw new CfdiParseError(`Invalid XML: ${(e as Error).message}`);
    }
    const root = doc.Comprobante as Node | undefined;
    if (!root) throw new CfdiParseError('Not a CFDI: no cfdi:Comprobante root');

    const attr = (n: Node | undefined, k: string): string | null => {
      const v = n?.[`@${k}`];
      return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
    };
    const money = (n: Node | undefined, k: string): number | null => {
      const v = attr(n, k);
      if (v === null) return null;
      const num = Number(v);
      if (!Number.isFinite(num)) throw new CfdiParseError(`Bad amount in ${k}: ${v}`);
      return toCents(num);
    };
    const issuer = root.Emisor as Node | undefined;
    const receiver = root.Receptor as Node | undefined;
    const taxes = root.Impuestos as Node | undefined;
    const stamp = (root.Complemento as Node | undefined)?.TimbreFiscalDigital as Node | undefined;
    const concepts =
      ((root.Conceptos as Node | undefined)?.Concepto as unknown[] | undefined) ?? [];
    const date = attr(root, 'Fecha');
    const rate = attr(root, 'TipoCambio');

    return {
      uuid: attr(stamp, 'UUID')?.toUpperCase() ?? null,
      version: attr(root, 'Version'),
      voucherType: attr(root, 'TipoDeComprobante'),
      paymentMethod: attr(root, 'MetodoPago'),
      issuerRfc: attr(issuer, 'Rfc')?.toUpperCase() ?? null,
      issuerName: attr(issuer, 'Nombre'),
      receiverRfc: attr(receiver, 'Rfc')?.toUpperCase() ?? null,
      receiverName: attr(receiver, 'Nombre'),
      currency: attr(root, 'Moneda'),
      exchangeRate: rate === null ? null : Number(rate),
      issueDate: date && /^\d{4}-\d{2}-\d{2}/.test(date) ? date.slice(0, 10) : null,
      subtotal: money(root, 'SubTotal'),
      discount: money(root, 'Descuento') ?? 0,
      transferredTaxes: money(taxes, 'TotalImpuestosTrasladados') ?? 0,
      withheldTaxes: money(taxes, 'TotalImpuestosRetenidos') ?? 0,
      total: money(root, 'Total'),
      conceptCount: concepts.length,
    };
  }
}
