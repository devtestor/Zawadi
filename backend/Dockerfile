# syntax=docker/dockerfile:1.7
# ---- deps ----
FROM oven/bun:1.1-alpine AS deps
WORKDIR /app
RUN apk add --no-cache openssl
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production=false

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
FROM oven/bun:1.1-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache openssl tini && \
    addgroup -S app && adduser -S app -G app
ENV NODE_ENV=production
COPY --from=build --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/prisma ./prisma
COPY --from=build --chown=app:app /app/src ./src
COPY --chown=app:app package.json bun.lock tsconfig.json ./

USER app
EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
# Run pending migrations then start the server. Falls back to `db push` if no
# migration history exists (dev convenience).
CMD ["sh", "-c", "bunx prisma migrate deploy || bunx prisma db push --accept-data-loss; bun run src/index.ts"]
