import type { MigrationInterface, QueryRunner } from 'typeorm';

/** CFDI extractions, owner facts per case, and eligibility decisions (ADR 0007). */
export class AddDecisionsAndCfdi1762646400000 implements MigrationInterface {
  name = 'AddDecisionsAndCfdi1762646400000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE "extractions" ADD "kind" varchar(16) NOT NULL DEFAULT 'bank_statement'`,
    );
    await q.query(`ALTER TABLE "extractions" ALTER COLUMN "statement" DROP NOT NULL`);
    await q.query(`ALTER TABLE "extractions" ALTER COLUMN "validation" DROP NOT NULL`);
    await q.query(`ALTER TABLE "extractions" ADD "invoice" jsonb NULL`);
    await q.query(`ALTER TABLE "extractions" ADD "invoice_checks" jsonb NULL`);
    await q.query(
      `ALTER TABLE "extractions" ADD CONSTRAINT "ck_extractions_kind" CHECK ("kind" IN ('bank_statement','cfdi'))`,
    );
    await q.query(`ALTER TABLE "cases" ADD "facts" jsonb NOT NULL DEFAULT '{}'`);
    await q.query(`
      CREATE TABLE "decisions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "case_id" uuid NOT NULL,
        "outcome" varchar(20) NOT NULL,
        "score" integer NULL,
        "policy_version" varchar(20) NOT NULL,
        "as_of" date NOT NULL,
        "suggested_advance_cents" bigint NULL,
        "rules" jsonb NOT NULL,
        "missing" jsonb NOT NULL,
        "signals" jsonb NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_decisions" PRIMARY KEY ("id"),
        CONSTRAINT "fk_decisions_case" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE,
        CONSTRAINT "ck_decisions_outcome" CHECK ("outcome" IN ('QUALIFIES','DOES_NOT_QUALIFY','NEEDS_INFO'))
      )`);
    await q.query(
      `CREATE INDEX "ix_decisions_case_created" ON "decisions" ("case_id", "created_at" DESC)`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "decisions"`);
    await q.query(`ALTER TABLE "cases" DROP COLUMN "facts"`);
    await q.query(`DELETE FROM "extractions" WHERE "kind" = 'cfdi'`);
    await q.query(`ALTER TABLE "extractions" DROP CONSTRAINT "ck_extractions_kind"`);
    await q.query(`ALTER TABLE "extractions" DROP COLUMN "invoice_checks"`);
    await q.query(`ALTER TABLE "extractions" DROP COLUMN "invoice"`);
    await q.query(`ALTER TABLE "extractions" ALTER COLUMN "validation" SET NOT NULL`);
    await q.query(`ALTER TABLE "extractions" ALTER COLUMN "statement" SET NOT NULL`);
    await q.query(`ALTER TABLE "extractions" DROP COLUMN "kind"`);
  }
}
