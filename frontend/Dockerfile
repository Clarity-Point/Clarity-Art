# syntax=docker/dockerfile:1

# Production image for the frontend: a static nginx server holding the built SPA.
# Build from the REPO ROOT (the lockfile lives there):
#   docker build -f frontend/Dockerfile -t clarity-frontend .

ARG NODE_VERSION=22-alpine

# ── Build ───────────────────────────────────────────────────────────────────
# Pinned to the builder's own platform. The output is static HTML/CSS/JS, which
# is architecture-independent, so there is nothing to gain from running Vite
# under QEMU emulation once per target platform — and a great deal to lose:
# emulated arm64 builds take tens of minutes against roughly one natively.
FROM --platform=$BUILDPLATFORM node:${NODE_VERSION} AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY frontend/package.json frontend/
COPY backend/package.json backend/
RUN npm ci --workspace frontend --include-workspace-root

COPY frontend/ frontend/

# Vite inlines env vars at build time, so anything site-specific must be supplied
# here rather than at container start.
ARG VITE_API_URL=/api
ARG VITE_APP_NAME="Точка Ясности"
ENV VITE_API_URL=${VITE_API_URL} \
    VITE_APP_NAME=${VITE_APP_NAME}

RUN npm run build --workspace frontend

# ── Runtime ─────────────────────────────────────────────────────────────────
FROM nginx:alpine AS runtime

COPY --from=build /app/frontend/dist /usr/share/nginx/html
COPY frontend/nginx.conf.template /etc/nginx/templates/default.conf.template

# Where /api/* is proxied. Override to point the SPA at a backend living
# somewhere other than the compose service named `backend`.
ENV BACKEND_URL=http://backend:3100

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
