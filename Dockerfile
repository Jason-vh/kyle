FROM oven/bun:1 AS base
WORKDIR /app

# Server dependencies
FROM base AS server-deps
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Web build
FROM base AS web-build
COPY web/package.json web/bun.lock ./web/
RUN cd web && bun install --frozen-lockfile
COPY web/ ./web/
COPY shared/ ./shared/
RUN cd web && bun run build

# Runtime
FROM base AS runner
COPY --from=server-deps /app/node_modules ./node_modules
COPY --from=web-build /app/web/dist ./web/dist
COPY . .

ENV NODE_ENV=production
EXPOSE 3000

CMD ["bun", "run", "index.ts"]
