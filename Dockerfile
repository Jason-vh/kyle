# Stage 1: build the Vue SPA under web/
FROM oven/bun:1 AS web-build
WORKDIR /app/web
COPY web/package.json web/bun.lock ./
RUN bun install --frozen-lockfile
COPY web ./
RUN bun run build

# Stage 2: server deps only (Bun runs the TypeScript source directly)
FROM oven/bun:1 AS server-deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# Stage 3: runtime
FROM oven/bun:1
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
ENV HOST=0.0.0.0
ENV PORT=3000
EXPOSE 3000
CMD ["bun", "run", "index.ts"]
