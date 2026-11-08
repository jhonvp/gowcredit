import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { MissingInfo, Outcome, RuleResult } from '../../../domain/eligibility/engine';
import type { StatementSignals } from '../../../domain/eligibility/statement-signals';
import { CaseOrmEntity } from './case.orm-entity';

@Entity({ name: 'decisions' })
export class DecisionOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => CaseOrmEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'case_id' })
  case: CaseOrmEntity;

  @Column({ name: 'case_id', type: 'uuid' })
  caseId: string;

  @Column({ type: 'varchar', length: 20 })
  outcome: Outcome;

  @Column({ type: 'integer', nullable: true })
  score: number | null;

  @Column({ name: 'policy_version', type: 'varchar', length: 20 })
  policyVersion: string;

  @Column({ name: 'as_of', type: 'date' })
  asOf: string;

  /** bigint comes back from pg as a string; the repository converts it. */
  @Column({ name: 'suggested_advance_cents', type: 'bigint', nullable: true })
  suggestedAdvanceCents: string | null;

  @Column({ type: 'jsonb' })
  rules: RuleResult[];

  @Column({ type: 'jsonb' })
  missing: MissingInfo[];

  @Column({ type: 'jsonb', nullable: true })
  signals: StatementSignals | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
