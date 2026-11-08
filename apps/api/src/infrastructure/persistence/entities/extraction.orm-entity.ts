import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { CfdiInvoice } from '../../../domain/cfdi/cfdi-invoice';
import type { CfdiCheck } from '../../../domain/cfdi/cfdi-validators';
import type { BankStatement, Tier } from '../../../domain/statement/bank-statement';
import type { ValidationReport } from '../../../domain/validation/statement-validators';
import type { TierAttempt } from '../../../application/use-cases/extract-bank-statement.use-case';
import { DocumentOrmEntity } from './document.orm-entity';

/** One extraction run of a document. JSONB keeps the full statement, checks and tier attempts. */
@Entity({ name: 'extractions' })
export class ExtractionOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => DocumentOrmEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document: DocumentOrmEntity;

  @Column({ name: 'document_id', type: 'uuid' })
  documentId: string;

  @Column({ name: 'resolved_by', type: 'varchar', length: 4 })
  resolvedBy: Tier;

  @Column({ name: 'needs_review', type: 'boolean' })
  needsReview: boolean;

  @Column({ type: 'varchar', length: 16 })
  kind: 'bank_statement' | 'cfdi';

  @Column({ type: 'jsonb', nullable: true })
  statement: BankStatement | null;

  @Column({ type: 'jsonb', nullable: true })
  validation: ValidationReport | null;

  @Column({ type: 'jsonb', nullable: true })
  invoice: CfdiInvoice | null;

  @Column({ name: 'invoice_checks', type: 'jsonb', nullable: true })
  invoiceChecks: CfdiCheck[] | null;

  @Column({ type: 'jsonb' })
  attempts: TierAttempt[];

  /** numeric comes back from pg as a string; the repository converts it. */
  @Column({ name: 'cost_usd', type: 'numeric', precision: 10, scale: 6, default: 0 })
  costUsd: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
