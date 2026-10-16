<div align="center">

# Точка Ясности · Tochka Yasnosti

**A self-hostable platform for reflective art practices and wellbeing support — not clinical care.**

A reflective diary, an optional AI companion, creative-work reflection, courses, breathing
practices and gentle gamification — in a warm, calm, light-first interface. Runs
locally; no mandatory cloud.

[![CI](https://github.com/Clarity-Point/Clarity-Art/actions/workflows/ci.yml/badge.svg)](../../actions)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
[![Vue 3](https://img.shields.io/badge/Vue-3-42b883.svg)](https://vuejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6.svg)](https://www.typescriptlang.org/)

English · [Русский](README.ru.md)

</div>

> **Disclaimer.** This is a demonstration/educational project — **not** a medical
> device, and no replacement for professional care. If you or someone you know is
> in crisis, contact your local emergency services or a crisis hotline immediately.

## What it is

A full-stack web app where a person can keep a mood diary, use an optional
supportive AI companion, upload or draw a picture for **reflective** prompts,
follow structured courses with homework, and track activity through streaks,
challenges and a leaderboard. It also has role-based spaces for **therapists**
(only with explicit user sharing), **organization admins** (privacy-protected
group aggregates) and **platform admins** (manage courses).

Everything AI is **optional and provider-agnostic** (see below). Analytics
"insights" are transparent rule-based heuristics, not clinical assessments.

## Features

- **Diary** — entries with an activity calendar and optional non-clinical reflection.
- **AI chat** — an optional supportive companion with streaming replies and session history.
- **Creative reflection** — upload or draw on a canvas for optional reflective prompts; not art diagnosis.
- **Courses** — art-practice programs with modules, lessons and homework.
- **Practices** — guided breathing exercises and a calming-audio player (built-in).
- **Progress** — activity tracking, achievements, challenges, leaderboard and a gallery.
- **Safety notice** — a conservative keyword prompt can display support resources; it is not crisis detection, triage or emergency care.

## Stack

Monorepo (npm workspaces) of two packages:

| Package    | Stack                                          | Dev port |
| ---------- | ---------------------------------------------- | -------- |
| `frontend` | Vue 3 · Vite · Pinia · Vue Router              | 5173     |
| `backend`  | Express 5 · TypeScript · Prisma 7 · PostgreSQL | 3100     |

## Quick start — Docker (no clone, no build)

Prebuilt multi-arch images (amd64 · arm64) are published on every release, so
running the whole stack takes two files and one command:

```bash
curl -O https://raw.githubusercontent.com/Clarity-Point/Clarity-Art/main/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/Clarity-Point/Clarity-Art/main/.env.example

# Set the two required values
sed -i "s/^JWT_SECRET=.*/JWT_SECRET=$(openssl rand -hex 32)/" .env
sed -i "s/^POSTGRES_PASSWORD=.*/POSTGRES_PASSWORD=$(openssl rand -hex 16)/" .env

docker compose up -d
```

The app is then on **http://localhost**. Migrations run automatically on start.

| Image                                        | Purpose                     |
| -------------------------------------------- | --------------------------- |
| `ghcr.io/clarity-point/clarity-art-backend`  | API (Express · Prisma)      |
| `ghcr.io/clarity-point/clarity-art-frontend` | SPA + nginx, proxies `/api` |

Pin a release instead of tracking `latest` by setting `BACKEND_IMAGE` and
`FRONTEND_IMAGE` in `.env`. Useful commands:

```bash
docker compose logs -f          # follow logs
docker compose pull && docker compose up -d   # upgrade
docker compose down             # stop (add -v to also drop the database)
```

## Quick start — from source

Requires **Node.js 22.12+** and **Docker** (for PostgreSQL).

The dev stack builds from your checkout and hot-reloads both services:

```bash
cp .env.example .env    # set JWT_SECRET and POSTGRES_PASSWORD
docker compose -f docker-compose.dev.yml up --build
```

Frontend http://localhost:5173 · backend http://localhost:3100 · Swagger
http://localhost:3100/api-docs.

<details>
<summary>Or run it directly on the host</summary>

```bash
npm install                       # installs both workspaces
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

docker compose -f docker-compose.dev.yml up -d db   # PostgreSQL (host port 5433)
cd backend
npx prisma migrate deploy         # apply migrations
npx prisma generate               # generate Prisma Client
npm run prisma:seed               # courses, achievements, demo accounts
cd .. && npm start                # frontend :5173 + backend :3100
```

Fill in `backend/.env` — only two variables are required:

| Variable       | Required | Purpose                                             |
| -------------- | -------- | --------------------------------------------------- |
| `DATABASE_URL` | yes      | PostgreSQL connection string                        |
| `JWT_SECRET`   | yes      | Token secret — generate with `openssl rand -hex 32` |

> The backend **refuses to start** without a strong, non-placeholder `JWT_SECRET`.
> Swagger (dev only): http://localhost:3100/api-docs.

</details>

## AI: optional, local, no vendor lock-in

AI features (chat, creative reflection, profile reflection and an optional text safety signal) speak the
**OpenAI-compatible `/chat/completions`** protocol, so any such server works —
including a fully local one. Point the backend at it via `backend/.env`:

```bash
AI_BASE_URL=http://localhost:11434/v1   # e.g. Ollama / LM Studio / vLLM / LocalAI
AI_MODEL=llama3.1
AI_VISION_MODEL=llava                    # for drawing analysis
AI_DATA_PROCESSING_MODE=local            # provider runs on your infrastructure
# AI_API_KEY — leave empty for keyless local servers
```

With **no** AI provider configured the app still runs end to end: AI features
degrade to calm canned responses. There is no mandatory cloud dependency of any
kind, and no data has to leave your machine.

For a hosted provider, set `AI_DATA_PROCESSING_MODE=external`. The application
then blocks transmission until the user gives explicit consent in the profile;
that consent can be revoked at any time. If the mode is omitted for a configured
provider, the privacy-safe `external` mode is assumed.

## Tests & checks

```bash
npm run lint                                               # eslint (root)
cd backend  && npm test && npx tsc --noEmit                # vitest + types
cd frontend && npx vue-tsc --noEmit -p tsconfig.app.json   # frontend types
cd frontend && npm test                                    # frontend tests
cd frontend && npm run build                               # production build
```

## Logging

Structured logging via [pino](https://getpino.io), configured entirely through
the environment — the same image works in every mode without a rebuild.

| Variable     | Values                                                               | Default                                         |
| ------------ | -------------------------------------------------------------------- | ----------------------------------------------- |
| `LOG_LEVEL`  | `trace` `debug` `info` `warn` `error` `fatal` `silent`               | `debug` (dev) · `info` (prod) · `silent` (test) |
| `LOG_FORMAT` | `pretty` (colourised, human-readable) · `json` (one object per line) | `pretty` (dev) · `json` (prod)                  |

```jsonc
// LOG_FORMAT=json — ready for Loki, Datadog, CloudWatch or ELK
{
  "level": "info",
  "time": 1730000000000,
  "service": "clarity-backend",
  "requestId": "a1b2…",
  "method": "GET",
  "path": "/api/courses",
  "status": 200,
  "durationMs": 12.4,
  "msg": "GET /api/courses 200",
}
```

- Every request gets a **`X-Request-Id`** header; the same id appears in each log
  line and in error responses, so one id pins the exact server-side entry.
- Request level follows the status code: `5xx` → error, `4xx` → warn, else info.
- **Credentials and auth headers are redacted centrally**, and request bodies are
  never logged — they routinely carry diary text and chat messages.
- Container logs rotate at 10 MB × 3 files, so a long-running host cannot fill up.

## Health checks

| Endpoint        | Meaning                                                              |
| --------------- | -------------------------------------------------------------------- |
| `/health`       | Liveness — dependency-free, stays up even when the database is down. |
| `/health/ready` | Readiness — `503` unless the database answers. Use this for routing. |

Both images ship a Docker `HEALTHCHECK`, and the backend shuts down gracefully on
`SIGTERM` (drains connections, disconnects Prisma, then exits).

For a public HTTPS deployment, also set `COOKIE_SECURE=true`; terminate TLS at
the reverse proxy and do not expose PostgreSQL outside the host.

## Demo data

`npm run prisma:seed` creates demo accounts (password `Demo1234!`):
`user@demo.ru`, `therapist@demo.ru`, `orgadmin@demo.ru`, `admin@demo.ru` and
others. The seed **refuses to run** under `NODE_ENV=production`.
`node backend/prisma/enrich-demo.js` fills them with presentation-friendly data.

## Contributing & security

Contributions welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) and the
[Code of Conduct](CODE_OF_CONDUCT.md). To report a vulnerability, see
[SECURITY.md](SECURITY.md). Never commit real secrets — use `.env` (git-ignored).

## License

[Apache-2.0](LICENSE)

## Project documentation

[Documentation index](docs/README.md) · [Project map](docs/architecture/project-map.md) ·
[Operations](docs/operations/runbook.md) · [Audit](docs/audits/2026-10-16.md).

Run `npm run check` for local verification and `npm run test:browser` for browser
interface checks (install Chromium first with `npx playwright install chromium`).
