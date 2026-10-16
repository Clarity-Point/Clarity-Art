# syntax=docker/dockerfile:1

# Production image for the backend. Build from the REPO ROOT, because this is an
# npm-workspaces monorepo and the lockfile lives there:
#   docker build -f backend/Dockerfile -t clarity-backend .

ARG NODE_VERSION=22-alpine

# ── Build ───────────────────────────────────────────────────────────────────
# Runs on the builder's own platform: `tsc` emits plain JavaScript, so the output
# is architecture-independent and there is no reason to compile it under QEMU
# once per target platform. Only the runtime dependencies below, which include
# Prisma's native engines, actually have to be built for the target.
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION} AS build
WORKDIR /app
# Manifests first, so this layer is reused by every build that does not change a
# dependency. The frontend manifest is needed for workspace resolution, but its
# dependencies are scoped out — otherwise Vite and Rolldown reach a server image.
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
RUN npm ci --workspace backend --include-workspace-root
COPY backend/ backend/
RUN npm run prisma:generate --workspace backend \
 && npm run build --workspace backend

# ── Runtime dependencies ────────────────────────────────────────────────────
# Built for the target platform, because Prisma ships native query engines.
# Installing only production dependencies also keeps TypeScript, Vitest and
# ts-node out of the final image.
FROM node:${NODE_VERSION} AS prod-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY backend/package.json backend/
COPY frontend/package.json frontend/
COPY backend/prisma backend/prisma
COPY backend/prisma.config.ts backend/
# `--omit=optional` drops the frontend toolchain's platform-specific native
# binaries (Rolldown, LightningCSS), which npm hoists into the root regardless of
# the workspace filter. Nothing the server needs at runtime is optional.
RUN npm ci --omit=dev --omit=optional --workspace backend --include-workspace-root \
 && npm run prisma:generate --workspace backend \
 && npm cache clean --force

# ── Runtime ─────────────────────────────────────────────────────────────────
FROM node:${NODE_VERSION} AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3100 \
    LOG_FORMAT=json

# dumb-init reaps zombies and forwards SIGTERM, so graceful shutdown actually
# fires when the container is stopped.
RUN apk add --no-cache dumb-init ttf-dejavu \
 && mkdir -p /app/data/images \
 && chown -R node:node /app/data

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/backend/dist ./backend/dist
COPY backend/package.json backend/prisma.config.ts ./backend/
COPY backend/prisma ./backend/prisma
COPY package.json ./
COPY backend/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

# `node` is an unprivileged user that ships with the base image.
USER node
WORKDIR /app/backend

EXPOSE 3100

# Hits the dependency-free liveness probe; readiness is checked separately by the
# orchestrator via /health/ready.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3100)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--", "docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]
