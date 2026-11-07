# syntax=docker/dockerfile:1.7
# One Dockerfile for the whole pnpm workspace. Targets:
#   dev          → used by docker compose (source bind-mounted, hot reload)
#   api-runtime  → production image for API and worker (ECS Fargate)
#   web-runtime  → static build served by nginx (prod uses S3 + CloudFront; this is for local/preview)

ARG NODE_IMAGE=node:24-bookworm-slim

FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH COREPACK_ENABLE_DOWNLOAD_PROMPT=0 CI=true
# OCR tier (T1) needs tesseract + Spanish data; poppler rasterizes PDF pages for OCR and LLM images.
# git is needed by commitlint (husky commit-msg hook runs inside this image).
RUN apt-get update \
 && apt-get install -y --no-install-recommends tesseract-ocr tesseract-ocr-spa poppler-utils ca-certificates curl git \
 && rm -rf /var/lib/apt/lists/* \
 && git config --system --add safe.directory /app \
 && corepack enable
WORKDIR /app

FROM base AS dev
# Dependencies are installed by the `deps` compose service into named volumes.
CMD ["pnpm", "--version"]

FROM base AS build
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @gowcredit/contracts build \
 && pnpm --filter @gowcredit/api build \
 && pnpm --filter @gowcredit/web build \
 && pnpm --filter @gowcredit/api deploy --prod --legacy /out/api

FROM base AS api-runtime
ENV NODE_ENV=production
WORKDIR /srv
COPY --from=build --chown=node:node /out/api ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=3s CMD curl -fsS http://localhost:3000/health || exit 1
CMD ["node", "dist/main.js"]

FROM nginx:1.29-alpine AS web-runtime
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
