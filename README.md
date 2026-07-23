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

## Quick start

Requires **Node.js 22+** and **Docker** (for PostgreSQL).

```bash
npm install                       # installs both workspaces
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

docker compose up -d db           # PostgreSQL (host port 5433)
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

## AI: optional, local, no vendor lock-in

AI features (chat, creative reflection, profile reflection and an optional text safety signal) speak the
**OpenAI-compatible `/chat/completions`** protocol, so any such server works —
including a fully local one. Point the backend at it via `backend/.env`:

```bash
AI_BASE_URL=http://localhost:11434/v1   # e.g. Ollama / LM Studio / vLLM / LocalAI
AI_MODEL=llama3.1
AI_VISION_MODEL=llava                    # for drawing analysis
# AI_API_KEY — leave empty for keyless local servers
```

With **no** AI provider configured the app still runs end to end: AI features
degrade to calm canned responses. There is no mandatory cloud dependency of any
kind, and no data has to leave your machine.

## Tests & checks

```bash
npm run lint                                               # eslint (root)
cd backend  && npm test && npx tsc --noEmit                # vitest + types
cd frontend && npx vue-tsc --noEmit -p tsconfig.app.json   # frontend types
cd frontend && npm run build                               # production build
```

## Docker

```bash
docker compose up --build   # served on http://localhost (nginx proxies /api)
```

Migrations run automatically when the backend container starts.

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
