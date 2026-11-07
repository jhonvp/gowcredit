import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import type { ClarificationStatus } from '../../../application/ports/clarification.ports';
import type { Answer, Question } from '../../../domain/clarification/questions';
import type { MissingInfoCode } from '../../../domain/eligibility/engine';

@Entity({ name: 'clarification_requests' })
export class ClarificationOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'case_id', type: 'uuid' })
  caseId: string;

  @Column({ type: 'integer' })
  round: number;

  @Column({ type: 'varchar', length: 16 })
  status: ClarificationStatus;

  @Column({ name: 'token_hash', type: 'char', length: 64, nullable: true, unique: true })
  tokenHash: string | null;

  @Column({ name: 'expires_at', type: 'timestamptz', nullable: true })
  expiresAt: Date | null;

  @Column({ type: 'jsonb' })
  questions: Question[];

  @Column({ type: 'jsonb', nullable: true })
  answers: Answer[] | null;

  @Column({ name: 'for_analyst', type: 'jsonb', nullable: true })
  forAnalyst: { code: MissingInfoCode; text: string }[] | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  reason: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'answered_at', type: 'timestamptz', nullable: true })
  answeredAt: Date | null;
}
