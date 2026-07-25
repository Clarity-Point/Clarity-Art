# Contributing

Thanks for taking the time to contribute. This guide covers everything needed for
a smooth pull request — most of it is a one-time setup.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- **Report a bug** — open an issue with reproduction steps.
- **Suggest a feature** — describe the use case before the solution.
- **Improve documentation** — including translations; the docs are bilingual (EN/RU).
- **Write code** — see below.

Vulnerabilities are the one exception: **never** open a public issue for them.
Follow [SECURITY.md](SECURITY.md) instead.

## Getting started

Requires **Node.js 22+**, and either Docker or a local PostgreSQL.

```bash
git clone https://github.com/Clarity-Point/Clarity-Art.git
cd Clarity-Art
git checkout -b feat/short-description
```

### Option A — Docker (nothing to install)

```bash
cp .env.example .env                       # set JWT_SECRET and POSTGRES_PASSWORD
docker compose -f docker-compose.dev.yml up --build
```

Frontend http://localhost:5173 · backend http://localhost:3100 · Swagger
http://localhost:3100/api-docs. Both hot-reload on save.

### Option B — On the host

```bash
npm install
cp backend/.env.example backend/.env       # JWT_SECRET is required
cp frontend/.env.example frontend/.env

docker compose -f docker-compose.dev.yml up -d db   # or your own PostgreSQL

cd backend
npx prisma migrate deploy
npx prisma generate
npm run prisma:seed                        # courses, achievements, demo accounts
cd .. && npm start
```

Demo accounts (password `Demo1234!`): `user@demo.ru`, `therapist@demo.ru`,
`orgadmin@demo.ru`, `admin@demo.ru`.

## Before opening a pull request

Run the same checks CI runs — all must pass:

```bash
npm run lint                                             # ESLint (root)
npm run format:check                                     # Prettier
cd backend  && npx tsc --noEmit && npm test              # types + Vitest
cd frontend && npx vue-tsc --noEmit -p tsconfig.app.json # frontend types
cd frontend && npm run build                             # production build
```

Autofix formatting and lint with `npm run format` and `npm run lint:fix`.

## Code style

- **Prettier** owns formatting — don't hand-format, don't fight it.
- **ESLint** owns correctness. `strict` TypeScript is on; prefer real domain types
  over `any`.
- **Comments** in the backend and shared config are written in **English**, and
  explain _why_, not _what_.
- Keep changes focused. Avoid drive-by refactors unrelated to your PR.
- User-facing strings are Russian; keep tone calm, plain and non-clinical.

### Logging

Use the shared pino logger — never `console.*` (ESLint will reject it):

```ts
import { createLogger } from '../config/logger';
const log = createLogger('myModule');

log.info({ userId }, 'Subscription renewed'); // object first, message second
log.error({ err }, 'Failed to renew');
```

**Never log user content** — diary text, chat messages, images or credentials.
Log identifiers and counts instead. Credentials and auth headers are redacted
centrally in `backend/src/config/logger.ts`; add any new sensitive field there.

Control output with `LOG_LEVEL` and `LOG_FORMAT` (`pretty` locally, `json` in
production). See [backend/.env.example](backend/.env.example).

## Commit messages

Short, imperative summaries. [Conventional Commits](https://www.conventionalcommits.org/)
are encouraged but not required:

```
feat(diary): add mood trend chart
fix(auth): reject known placeholder JWT secrets
docs: clarify docker setup
```

## Pull requests

- Describe **what** changed and **why**; link any related issue.
- Include screenshots for UI changes.
- Add or update tests for behavioural changes.
- Keep CI green (lint, format, types, tests, Docker build).
- Small, reviewable PRs get merged faster than large ones.

Maintainers may ask for changes — it is about the code, never about you.

## Working with the database

- Schema lives in [backend/prisma/schema.prisma](backend/prisma/schema.prisma).
- Prisma 7 connects through a driver adapter (`@prisma/adapter-pg`); the CLI reads
  the connection string from `backend/prisma.config.ts`.
- Create a migration: `npx prisma migrate dev --name <change>`.
- **Commit the generated migration** alongside the schema change.

## Safety-sensitive areas

This is a wellbeing product. Changes to AI prompts, the crisis/safety keyword
path, authentication, or anything touching therapist or organisation data access
need extra care — describe the safety and privacy implications in the PR.

The app is **not** a medical device and must never claim clinical effectiveness,
diagnosis, triage or emergency capability.

## Project layout

```
backend/     Express 5 · TypeScript · Prisma 7 · PostgreSQL
  src/
    config/       logger, prisma, swagger, secrets, AI provider
    controllers/  route handlers
    middleware/   auth, error handling, request logging, gamification
    services/     AI, analytics, crisis screening
    tests/        Vitest
frontend/    Vue 3 · Vite · Pinia · Vue Router
```

## Licence

Contributions are licensed under [Apache-2.0](LICENSE), matching the project.
The project name and logos are not covered — see [TRADEMARKS.md](TRADEMARKS.md).
