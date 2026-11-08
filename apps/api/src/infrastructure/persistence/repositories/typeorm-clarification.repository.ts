import { In, MoreThan, type DataSource } from 'typeorm';
import type {
  ClarificationRecord,
  ClarificationRepositoryPort,
} from '../../../application/ports/clarification.ports';
import type { Answer } from '../../../domain/clarification/questions';
import { ClarificationOrmEntity } from '../entities';

export class TypeOrmClarificationRepository implements ClarificationRepositoryPort {
  constructor(private readonly ds: DataSource) {}

  private get repo() {
    return this.ds.getRepository(ClarificationOrmEntity);
  }

  async create(
    r: Parameters<ClarificationRepositoryPort['create']>[0],
  ): Promise<ClarificationRecord> {
    const saved = await this.repo.save(
      this.repo.create({ ...r, answers: null, forAnalyst: null, answeredAt: null }),
    );
    return toRecord(saved);
  }

  async findById(id: string) {
    const r = await this.repo.findOneBy({ id });
    return r ? toRecord(r) : null;
  }

  async findOpenByTokenHash(hash: string, now: Date) {
    const r = await this.repo.findOneBy({
      tokenHash: hash,
      status: 'open',
      expiresAt: MoreThan(now),
    });
    return r ? toRecord(r) : null;
  }

  async findOpenByCase(caseId: string) {
    const r = await this.repo.findOne({
      where: { caseId, status: 'open' },
      order: { createdAt: 'DESC' },
    });
    return r ? toRecord(r) : null;
  }

  async listByCase(caseId: string) {
    return (await this.repo.find({ where: { caseId }, order: { createdAt: 'ASC' } })).map(toRecord);
  }

  countOwnerRounds(caseId: string): Promise<number> {
    return this.repo.countBy({ caseId, status: In(['open', 'answered', 'superseded']) });
  }

  async markAnswered(id: string, answers: Answer[], forAnalyst: ClarificationRecord['forAnalyst']) {
    // Single use: only an open request can be answered, and the token hash is cleared.
    await this.repo.update(
      { id, status: 'open' },
      { status: 'answered', answers, forAnalyst, answeredAt: new Date(), tokenHash: null },
    );
  }

  async markSuperseded(id: string) {
    await this.repo.update({ id, status: 'open' }, { status: 'superseded', tokenHash: null });
  }

  async rotateToken(id: string, tokenHash: string, expiresAt: Date) {
    const r = await this.repo.update({ id, status: 'open' }, { tokenHash, expiresAt });
    return (r.affected ?? 0) > 0;
  }
}

const toRecord = (r: ClarificationOrmEntity): ClarificationRecord => ({
  id: r.id,
  caseId: r.caseId,
  round: r.round,
  status: r.status,
  questions: r.questions,
  answers: r.answers,
  forAnalyst: r.forAnalyst,
  reason: r.reason,
  expiresAt: r.expiresAt,
  createdAt: r.createdAt,
  answeredAt: r.answeredAt,
});
