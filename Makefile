# Thin wrappers over docker compose — the host only needs Docker.
DC := docker compose
RUN := $(DC) run --rm tools

.PHONY: up down logs ps sh install eval eval-t0 eval-record test test-integration test-e2e test-load smoke check lint typecheck format migrate migration-generate migration-revert build-images clean

up:            ## start the full stack (api, web, postgres, floci, mailpit)
	$(DC) up -d --build
down:
	$(DC) down
logs:
	$(DC) logs -f api web
ps:
	$(DC) ps
sh:            ## shell in a tools container
	$(RUN) bash
install:
	$(DC) run --rm deps
eval:          ## extraction eval (T0→T3→T4, LLM replayed from fixtures/llm) → eval/reports/latest.md
	$(RUN) pnpm --filter @gowcredit/api eval
eval-t0:       ## deterministic baseline only (no LLM tiers)
	$(DC) run --rm -e EVAL_TIERS=T0 tools pnpm --filter @gowcredit/api eval
eval-record:   ## call the API for requests without a fixture and record them (needs ANTHROPIC_API_KEY in .env)
	$(DC) run --rm -e LLM_MODE=record tools pnpm --filter @gowcredit/api eval
test:          ## unit tests (no services needed)
	$(RUN) pnpm test
test-integration: ## API + real Postgres (separate gowcredit_test db)
	$(DC) up -d postgres
	$(DC) run --rm -e DATABASE_URL=postgres://gowcredit:gowcredit@postgres:5432/gowcredit_test -e LOG_LEVEL=warn -e LOG_PRETTY=false tools pnpm --filter @gowcredit/api test:integration
test-e2e:      ## browser E2E with Playwright against the running stack (make up first)
	$(DC) --profile test run --rm e2e
test-load:     ## Artillery load test against the running stack (make up first)
	$(DC) --profile test run --rm load
smoke:         ## check every service of the running stack (run `make up` first)
	$(RUN) sh scripts/smoke.sh
check:         ## lint, typecheck, unit, integration (no running stack needed)
	$(MAKE) lint typecheck test test-integration
check-all:     ## check + e2e + load against a fresh stack
	$(MAKE) check up smoke test-e2e test-load
lint:
	$(RUN) pnpm lint
typecheck:
	$(RUN) sh -c "pnpm --filter @gowcredit/contracts build && pnpm typecheck"
format:
	$(RUN) pnpm format
migrate:
	$(DC) run --rm migrate
migration-generate: ## make migration-generate name=AddSomething
	$(RUN) pnpm --filter @gowcredit/api migration:generate src/infrastructure/persistence/migrations/$(name)
migration-revert:
	$(RUN) pnpm --filter @gowcredit/api migration:revert
build-images:  ## production images
	docker build -f docker/Dockerfile --target api-runtime -t gowcredit-api .
	docker build -f docker/Dockerfile --target web-runtime -t gowcredit-web .
clean:         ## remove containers AND volumes (db data, node_modules)
	$(DC) down -v
