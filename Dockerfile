ARG BUN_VERSION=1.3.11

# Stage 1: build the Vue SPA under web/
# web/ imports from ../shared/ via the @shared/* path alias (see web/tsconfig.json
# + web/vite.config.ts), so shared/ has to be present at /app/shared during the build.
FROM oven/bun:${BUN_VERSION} AS web-build
WORKDIR /app/web
COPY web/package.json web/bun.lock ./
RUN bun install --frozen-lockfile
COPY web ./
COPY shared /app/shared
RUN bun run build

# Stage 2: server deps only (Bun runs the TypeScript source directly)
FROM oven/bun:${BUN_VERSION} AS server-deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Stage 3: runtime
FROM oven/bun:${BUN_VERSION}
WORKDIR /app
COPY --from=server-deps /app/node_modules ./node_modules
COPY package.json bun.lock ./
COPY index.ts ./
COPY tsconfig.server.json ./
COPY server ./server
COPY shared ./shared
COPY drizzle ./drizzle
COPY drizzle.config.ts ./
COPY --from=web-build /app/web/dist ./web/dist
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=6s --start-period=15s --retries=18 CMD ["bun", "run", "server/healthcheck.ts"]
CMD ["bun", "run", "index.ts"]
