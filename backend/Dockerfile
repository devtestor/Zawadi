# syntax=docker/dockerfile:1.7
# Debian-slim base. Trades ~25 MB vs Alpine for:
#   - openssl + ca-certificates already present (Prisma needs libssl)
#   - apt mirrors that are far more reliable than dl-cdn.alpinelinux.org
#   - no musl ↔ glibc gotchas with native modules

# ---- deps ----
FROM oven/bun:1.2-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*
COPY package.json bun.lock ./
# Default install includes devDependencies (prisma CLI lives there).
# `--production` would skip them, which breaks `bunx prisma generate`.
RUN bun install --frozen-lockfile

# ---- build (generate prisma client against the Postgres schema) ----
FROM deps AS build
WORKDIR /app
COPY prisma ./prisma
COPY tsconfig.json ./
COPY src ./src
# In production we use Postgres. Swap the schema before generating.
RUN cp prisma/schema.postgresql.prisma prisma/schema.prisma
RUN bunx prisma generate

# ---- runtime ----
FROM oven/bun:1.2-slim AS runtime
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates openssl tini wget \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd -r app && useradd -r -g app -d /app app
ENV NODE_ENV=production
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/prisma ./prisma
COPY --from=build --chown=app:app /app/src ./src
COPY --chown=app:app package.json bun.lock tsconfig.json ./

USER app
EXPOSE 3000

ENTRYPOINT ["/usr/bin/tini", "--"]
# Run pending migrations then start the server. Falls back to `db push` if no
# migration history exists (dev convenience).
CMD ["sh", "-c", "bunx prisma migrate deploy || bunx prisma db push --accept-data-loss; bun run src/index.ts"]
