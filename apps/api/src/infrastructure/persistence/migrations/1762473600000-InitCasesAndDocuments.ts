import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitCasesAndDocuments1762473600000 implements MigrationInterface {
  name = 'InitCasesAndDocuments1762473600000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "cases" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "status" varchar(32) NOT NULL,
        "as_of" date NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "updated_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_cases" PRIMARY KEY ("id"),
        CONSTRAINT "ck_cases_status" CHECK ("status" IN ('RECEIVED','EXTRACTING','AWAITING_OWNER','DECIDED','FAILED'))
      )`);
    await q.query(`
      CREATE TABLE "documents" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "case_id" uuid NOT NULL,
        "original_name" varchar(255) NOT NULL,
        "mime_type" varchar(100) NOT NULL,
        "sha256" char(64) NOT NULL,
        "storage_key" varchar(512) NOT NULL,
        "doc_type" varchar(32) NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT "pk_documents" PRIMARY KEY ("id"),
        CONSTRAINT "fk_documents_case" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE
      )`);
    await q.query(`CREATE INDEX "ix_documents_case_id" ON "documents" ("case_id")`);
    await q.query(`CREATE INDEX "ix_documents_sha256" ON "documents" ("sha256")`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "documents"`);
    await q.query(`DROP TABLE "cases"`);
  }
}
