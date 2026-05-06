FROM node:22-bookworm-slim AS builder

ARG NEXT_PUBLIC_API_BASE_URL=/api
ARG NEXT_PUBLIC_ENABLE_YAMLI=0
ARG NEXT_PUBLIC_AUTH_ENABLED=0
ARG QBASAIR_API_ORIGIN=http://api:8001
ARG QBASAIR_SESSION_COOKIE_NAME=qbasair_session

ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_STANDALONE=1 \
    NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL} \
    NEXT_PUBLIC_ENABLE_YAMLI=${NEXT_PUBLIC_ENABLE_YAMLI} \
    NEXT_PUBLIC_AUTH_ENABLED=${NEXT_PUBLIC_AUTH_ENABLED} \
    QBASAIR_API_ORIGIN=${QBASAIR_API_ORIGIN} \
    QBASAIR_SESSION_COOKIE_NAME=${QBASAIR_SESSION_COOKIE_NAME}

WORKDIR /app

RUN corepack enable

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/api-client/package.json packages/api-client/package.json
COPY packages/shared/package.json packages/shared/package.json

RUN pnpm install --frozen-lockfile

COPY apps/web ./apps/web
COPY packages/api-client ./packages/api-client
COPY packages/shared ./packages/shared

RUN pnpm --filter @q-basair/web build

FROM node:22-bookworm-slim AS runner

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

WORKDIR /app

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./.next/static
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./public
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000

CMD ["sh", "-c", "if [ -f server.js ]; then exec node server.js; elif [ -f apps/web/server.js ]; then exec node apps/web/server.js; else echo 'Next standalone server.js not found' >&2; exit 1; fi"]
