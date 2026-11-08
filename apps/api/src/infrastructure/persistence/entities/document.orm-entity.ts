import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CaseOrmEntity } from './case.orm-entity';

@Entity({ name: 'documents' })
export class DocumentOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => CaseOrmEntity, (c) => c.documents, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'case_id' })
  case: CaseOrmEntity;

  @Column({ name: 'case_id', type: 'uuid' })
  caseId: string;

  @Column({ name: 'original_name', type: 'varchar', length: 255 })
  originalName: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 100 })
  mimeType: string;

  /** sha256 of the file bytes: idempotency + LLM fixture keys (ADR 0004). */
  @Column({ type: 'char', length: 64 })
  sha256: string;

  @Column({ name: 'storage_key', type: 'varchar', length: 512 })
  storageKey: string;

  @Column({ name: 'doc_type', type: 'varchar', length: 32, nullable: true })
  docType: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
