# Faza 2.9 — API deploy: VPS + Docker Compose.
#
# Runtime to czysty `node dist/main` (Express adapter, standalone — spec 19.1:
# żaden kod API nie zakłada serverless). Obraz buduje całe poddrzewo `api...`
# (turbo dociąga `@repo/*` w kolejności zależności), a warstwa runtime kopiuje
# tylko to, co potrzebne do startu: dist API + dist pakietów + node_modules.
#
# Kontekst buildu to ROOT repo (pakiety `@repo/*` sąsiadują z `apps/api`).
#   docker build -f apps/api/Dockerfile -t saas-api .
#
# Konfiguracja wyłącznie przez env (fail-fast w `common/config.ts`, spec 19.1):
# produkcja wstrzykuje zmienne, brakujący plik `.env` jest ignorowany
# (patrz `main.ts`). Sekrety NIGDY nie wchodzą do obrazu (`.dockerignore`
# wycina `**/.env*`) — podaje je `docker-compose.yml` / środowisko VPS-a.

FROM node:22-slim AS build
RUN corepack enable && corepack prepare pnpm@10.6.3 --activate
WORKDIR /app
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml turbo.json ./
COPY packages ./packages
COPY apps/api ./apps/api
RUN pnpm install --frozen-lockfile
RUN pnpm exec turbo build --filter=api...

FROM node:22-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app/apps/api
# Rozwiązywanie modułów idzie w górę od `dist/`: najpierw
# `apps/api/node_modules` (linki pnpm), potem root `node_modules`
# (magazyn `.pnpm` + linki `@repo/*` → `/app/packages/*`).
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/apps/api/node_modules ./node_modules
COPY --from=build /app/packages /app/packages
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/package.json ./
EXPOSE 3001
CMD ["node", "dist/main"]
