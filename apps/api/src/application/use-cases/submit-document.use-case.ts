import type { CaseRecord, CaseRepositoryPort } from '../ports/case-repository.port';
import type { JobQueuePort } from '../ports/job-queue.port';
import type { LoggerPort } from '../ports/logger.port';
import type { ObjectStoragePort } from '../ports/object-storage.port';

export interface UploadedFile {
  originalName: string;
  mimeType: string;
  bytes: Uint8Array;
  sha256: string;
}

export interface IdGenerator {
  uuid(): string;
}

/** 20 MB: the largest dev statement is ~2 MB; the cap keeps the worker's memory bounded. */
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

export class UnsupportedDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnsupportedDocumentError';
  }
}

/** Sniffs the real type from the bytes; the client's mime type is not trusted. */
export function sniffKind(bytes: Uint8Array): 'pdf' | 'xml' | null {
  // Strip a UTF-8 BOM (EF BB BF) before looking at the first characters.
  const start = bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
  const head = new TextDecoder('latin1').decode(bytes.subarray(start, start + 64));
  if (head.startsWith('%PDF-')) return 'pdf';
  if (/^\s*<(\?xml|cfdi:Comprobante)/.test(head)) return 'xml';
  return null;
}

/**
 * Receives a document: stores the bytes, creates the case, and queues extraction (ADR 0002/0006).
 * The API answers immediately with the case id; the worker does the slow part.
 */
export class SubmitDocumentUseCase {
  constructor(
    private readonly storage: ObjectStoragePort,
    private readonly queue: JobQueuePort,
    private readonly cases: CaseRepositoryPort,
    private readonly ids: IdGenerator,
    private readonly logger: LoggerPort,
  ) {}

  async execute(file: UploadedFile): Promise<CaseRecord> {
    if (file.bytes.byteLength === 0) throw new UnsupportedDocumentError('Empty file');
    if (file.bytes.byteLength > MAX_DOCUMENT_BYTES)
      throw new UnsupportedDocumentError(`File larger than ${MAX_DOCUMENT_BYTES / 1024 / 1024} MB`);
    const kind = sniffKind(file.bytes);
    if (!kind) throw new UnsupportedDocumentError('Only PDF statements and CFDI XML are accepted');

    const caseId = this.ids.uuid();
    const documentId = this.ids.uuid();
    const storageKey = `cases/${caseId}/${documentId}.${kind}`;
    const mimeType = kind === 'pdf' ? 'application/pdf' : 'application/xml';
    await this.storage.put(storageKey, file.bytes, mimeType);
    const created = await this.cases.createCase(caseId, {
      id: documentId,
      originalName: file.originalName.slice(0, 255),
      mimeType,
      sha256: file.sha256,
      storageKey,
    });
    await this.queue.send({ type: 'extract-document', caseId, documentId });
    this.logger.info('document received', {
      caseId,
      documentId,
      kind,
      bytes: file.bytes.byteLength,
    });
    return created;
  }
}
