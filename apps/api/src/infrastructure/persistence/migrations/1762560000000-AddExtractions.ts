import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Extraction results per document (JSONB) and the EXTRACTED case status. */
export class AddExtractions1762560000000 implements MigrationInterface {
  name = 'AddExtractions1762560000000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE "cases" DROP CONSTRAINT "ck_cases_status"`);
    await q.query(
      `ALTER TABLE "cases" ADD CONSTRAINT "ck_cases_status" CHECK ("status" IN ('RECEIVED','EXTRACTING','EXTRACTED','AWAITING_OWNER','DECIDED','FAILED'))`,
    );
    await q.query(`
      CREATE TABLE "extractions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "document_id" uuid NOT NULL,
        "resolved_by" varchar(4) NOT NULL,
        "needs_review" boolean NOT NULL,
        "statement" jsonb NOT NULL,
        "validation" jsonb NOT NULL,
        "attempts" jsonb NOT NULL,
        "cost_usd" numeric(10,6) NOT NULL DEFAULT 0,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_extractions" PRIMARY KEY ("id"),
        CONSTRAINT "fk_extractions_document" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE
      )`);
    await q.query(
      `CREATE INDEX "ix_extractions_document_created" ON "extractions" ("document_id", "created_at" DESC)`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "extractions"`);
    await q.query(`UPDATE "cases" SET "status" = 'EXTRACTING' WHERE "status" = 'EXTRACTED'`);
    await q.query(`ALTER TABLE "cases" DROP CONSTRAINT "ck_cases_status"`);
    await q.query(
      `ALTER TABLE "cases" ADD CONSTRAINT "ck_cases_status" CHECK ("status" IN ('RECEIVED','EXTRACTING','AWAITING_OWNER','DECIDED','FAILED'))`,
    );
  }
}
