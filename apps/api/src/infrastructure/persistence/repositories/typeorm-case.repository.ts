import { DataSource, In } from 'typeorm';
import type {
  CaseRecord,
  CaseRepositoryPort,
  DecisionRecord,
  DocumentRecord,
  ExtractionRecord,
  NewDocument,
} from '../../../application/ports/case-repository.port';
import { type CaseStatus, canTransition } from '../../../domain/case/case-status';
import type { Decision, DecisionFacts } from '../../../domain/eligibility/engine';
import {
  CaseOrmEntity,
  DecisionOrmEntity,
  DocumentOrmEntity,
  ExtractionOrmEntity,
} from '../entities';

/** CaseRepositoryPort over TypeORM/Postgres. Maps ORM rows to plain records; no ORM types leak out. */
export class TypeOrmCaseRepository implements CaseRepositoryPort {
  constructor(private readonly ds: DataSource) {}

  async createCase(caseId: string, document: NewDocument): Promise<CaseRecord> {
    await this.ds.transaction(async (tx) => {
      await tx.insert(CaseOrmEntity, { id: caseId, status: 'RECEIVED' });
      await tx.insert(DocumentOrmEntity, { ...document, caseId, docType: null });
    });
    return (await this.findCase(caseId)) as CaseRecord;
  }

  async addDocument(caseId: string, document: NewDocument): Promise<void> {
    await this.ds.getRepository(DocumentOrmEntity).insert({ ...document, caseId, docType: null });
  }

  async saveDecision(caseId: string, d: Decision): Promise<void> {
    await this.ds.getRepository(DecisionOrmEntity).insert({
      caseId,
      outcome: d.outcome,
      score: d.score,
      policyVersion: d.policyVersion,
      asOf: d.asOf,
      suggestedAdvanceCents: d.suggestedAdvance === null ? null : String(d.suggestedAdvance),
      rules: d.rules,
      missing: d.missing,
      signals: d.signals,
    } as unknown as DecisionOrmEntity);
  }

  async setFacts(caseId: string, facts: DecisionFacts): Promise<void> {
    await this.ds.getRepository(CaseOrmEntity).update({ id: caseId }, { facts: facts as never });
  }

  async findCase(caseId: string): Promise<CaseRecord | null> {
    const row = await this.ds.getRepository(CaseOrmEntity).findOne({
      where: { id: caseId },
      relations: { documents: true },
      order: { documents: { createdAt: 'ASC' } },
    });
    if (!row) return null;
    const documents = row.documents.map(toDocument);
    const extractions = documents.length
      ? await this.ds
          .getRepository(ExtractionOrmEntity)
          .createQueryBuilder('e')
          .distinctOn(['e.document_id'])
          .where({ documentId: In(documents.map((d) => d.id)) })
          .orderBy('e.document_id')
          .addOrderBy('e.created_at', 'DESC')
          .getMany()
      : [];
    const decision = await this.ds
      .getRepository(DecisionOrmEntity)
      .findOne({ where: { caseId }, order: { createdAt: 'DESC' } });
    return {
      id: row.id,
      status: row.status,
      facts: row.facts ?? {},
      decision: decision ? toDecision(decision) : null,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      documents,
      extractions: extractions.map(toExtraction),
    };
  }

  async findDocument(documentId: string): Promise<DocumentRecord | null> {
    const row = await this.ds.getRepository(DocumentOrmEntity).findOneBy({ id: documentId });
    return row ? toDocument(row) : null;
  }

  async transition(caseId: string, from: CaseStatus, to: CaseStatus): Promise<boolean> {
    if (!canTransition(from, to)) return false;
    const result = await this.ds
      .createQueryBuilder()
      .update(CaseOrmEntity)
      .set({ status: to })
      .where('id = :caseId AND status = :from', { caseId, from })
      .execute();
    return (result.affected ?? 0) === 1;
  }

  async setDocumentType(
    documentId: string,
    docType: NonNullable<DocumentRecord['docType']>,
  ): Promise<void> {
    await this.ds.getRepository(DocumentOrmEntity).update({ id: documentId }, { docType });
  }

  async saveExtraction(e: Omit<ExtractionRecord, 'createdAt'>): Promise<void> {
    await this.ds.getRepository(ExtractionOrmEntity).insert({
      documentId: e.documentId,
      kind: e.kind,
      resolvedBy: e.resolvedBy,
      needsReview: e.needsReview,
      statement: e.statement,
      validation: e.validation,
      invoice: e.invoice,
      invoiceChecks: e.invoiceChecks,
      attempts: e.attempts,
      costUsd: e.costUsd.toFixed(6),
    } as unknown as ExtractionOrmEntity);
  }
}

const toDocument = (d: DocumentOrmEntity): DocumentRecord => ({
  id: d.id,
  caseId: d.caseId,
  originalName: d.originalName,
  mimeType: d.mimeType,
  sha256: d.sha256,
  storageKey: d.storageKey,
  docType: d.docType as DocumentRecord['docType'],
  createdAt: d.createdAt,
});

const toDecision = (d: DecisionOrmEntity): DecisionRecord => ({
  outcome: d.outcome,
  score: d.score,
  rules: d.rules,
  missing: d.missing,
  signals: d.signals,
  suggestedAdvance: d.suggestedAdvanceCents === null ? null : Number(d.suggestedAdvanceCents),
  policyVersion: d.policyVersion,
  asOf: d.asOf,
  createdAt: d.createdAt,
});

const toExtraction = (e: ExtractionOrmEntity): ExtractionRecord => ({
  documentId: e.documentId,
  kind: e.kind,
  resolvedBy: e.resolvedBy,
  needsReview: e.needsReview,
  statement: e.statement,
  validation: e.validation,
  invoice: e.invoice,
  invoiceChecks: e.invoiceChecks,
  attempts: e.attempts,
  costUsd: Number(e.costUsd),
  createdAt: e.createdAt,
});
