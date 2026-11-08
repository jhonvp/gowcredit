import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { CaseStatus } from '../../../domain/case/case-status';
import { DocumentOrmEntity } from './document.orm-entity';

/** Persistence model. Mapped to/from domain objects in repositories; never leaks into domain. */
@Entity({ name: 'cases' })
export class CaseOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 32 })
  status: CaseStatus;

  @Column({ name: 'as_of', type: 'date', nullable: true })
  asOf: string | null;

  @OneToMany(() => DocumentOrmEntity, (d) => d.case)
  documents: DocumentOrmEntity[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
