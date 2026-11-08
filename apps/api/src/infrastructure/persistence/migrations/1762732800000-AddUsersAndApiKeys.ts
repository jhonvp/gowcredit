import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Users (supplier / analyst), integration API keys, and case ownership (ADR 0005). */
export class AddUsersAndApiKeys1762732800000 implements MigrationInterface {
  name = 'AddUsersAndApiKeys1762732800000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "email" varchar(254) NOT NULL,
        "name" varchar(120) NOT NULL,
        "role" varchar(16) NOT NULL,
        "password_hash" varchar(255) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_users" PRIMARY KEY ("id"),
        CONSTRAINT "uq_users_email" UNIQUE ("email"),
        CONSTRAINT "ck_users_role" CHECK ("role" IN ('supplier','analyst'))
      )`);
    await q.query(`
      CREATE TABLE "api_keys" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" varchar(120) NOT NULL,
        "supplier_id" uuid NOT NULL,
        "secret_hash" char(64) NOT NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "revoked_at" timestamptz NULL,
        CONSTRAINT "pk_api_keys" PRIMARY KEY ("id"),
        CONSTRAINT "uq_api_keys_secret_hash" UNIQUE ("secret_hash"),
        CONSTRAINT "fk_api_keys_supplier" FOREIGN KEY ("supplier_id") REFERENCES "users"("id") ON DELETE CASCADE
      )`);
    await q.query(`ALTER TABLE "cases" ADD "supplier_id" uuid NULL`);
    await q.query(`ALTER TABLE "cases" ADD "owner_email" varchar(254) NULL`);
    await q.query(
      `ALTER TABLE "cases" ADD CONSTRAINT "fk_cases_supplier" FOREIGN KEY ("supplier_id") REFERENCES "users"("id") ON DELETE SET NULL`,
    );
    await q.query(
      `CREATE INDEX "ix_cases_supplier_created" ON "cases" ("supplier_id", "created_at" DESC)`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX "ix_cases_supplier_created"`);
    await q.query(`ALTER TABLE "cases" DROP CONSTRAINT "fk_cases_supplier"`);
    await q.query(`ALTER TABLE "cases" DROP COLUMN "owner_email"`);
    await q.query(`ALTER TABLE "cases" DROP COLUMN "supplier_id"`);
    await q.query(`DROP TABLE "api_keys"`);
    await q.query(`DROP TABLE "users"`);
  }
}
