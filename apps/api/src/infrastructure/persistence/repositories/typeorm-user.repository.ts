import { IsNull, type DataSource } from 'typeorm';
import type {
  ApiKeyRecord,
  ApiKeyRepositoryPort,
  UserRecord,
  UserRepositoryPort,
} from '../../../application/ports/auth.ports';
import { ApiKeyOrmEntity, UserOrmEntity } from '../entities';

export class TypeOrmUserRepository implements UserRepositoryPort, ApiKeyRepositoryPort {
  constructor(private readonly ds: DataSource) {}

  async findByEmail(email: string): Promise<UserRecord | null> {
    return this.ds.getRepository(UserOrmEntity).findOneBy({ email });
  }

  async findById(id: string): Promise<UserRecord | null> {
    return this.ds.getRepository(UserOrmEntity).findOneBy({ id });
  }

  async findBySecretHash(hash: string): Promise<ApiKeyRecord | null> {
    const k = await this.ds
      .getRepository(ApiKeyOrmEntity)
      .findOneBy({ secretHash: hash, revokedAt: IsNull() });
    return k ? { id: k.id, name: k.name, supplierId: k.supplierId } : null;
  }
}
