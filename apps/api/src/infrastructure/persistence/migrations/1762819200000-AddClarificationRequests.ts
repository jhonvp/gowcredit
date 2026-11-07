import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Clarification rounds with the owner: questions, magic-link hash, answers, escalations (ADR 0008). */
export class AddClarificationRequests1762819200000 implements MigrationInterface {
  name = 'AddClarificationRequests1762819200000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE "clarification_requests" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "case_id" uuid NOT NULL,
        "round" integer NOT NULL,
        "status" varchar(16) NOT NULL,
        "token_hash" char(64) NULL,
        "expires_at" timestamptz NULL,
        "questions" jsonb NOT NULL,
        "answers" jsonb NULL,
        "for_analyst" jsonb NULL,
        "reason" varchar(200) NULL,
        "created_at" timestamptz NOT NULL DEFAULT now(),
        "answered_at" timestamptz NULL,
        CONSTRAINT "pk_clarification_requests" PRIMARY KEY ("id"),
        CONSTRAINT "uq_clarification_token_hash" UNIQUE ("token_hash"),
        CONSTRAINT "fk_clarification_case" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE CASCADE,
        CONSTRAINT "ck_clarification_status" CHECK ("status" IN ('open','answered','superseded','escalated'))
      )`);
    await q.query(
      `CREATE INDEX "ix_clarification_case_created" ON "clarification_requests" ("case_id", "created_at")`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE "clarification_requests"`);
  }
}
