# Contributing

Thanks for taking the time to contribute. This guide covers everything needed for
a smooth pull request — most of it is a one-time setup.

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md).

## Ways to contribute

- **Report a bug** — open an issue with reproduction steps.
- **Suggest a feature** — describe the use case before the solution.
- **Improve documentation** — including the English and Russian sections of the README.
- **Write code** — see below.

Vulnerabilities are the one exception: **never** open a public issue for them.
Follow [SECURITY.md](SECURITY.md) instead.

## Getting started

```bash
git clone https://github.com/Clarity-Point/Clarity-Art.git
cd Clarity-Art
git checkout -b feat/short-description
```

Follow the [development setup](docs/operations/runbook.md#локальная-разработка)
for Docker or host instructions.

## Before opening a pull request

Run the repository checks from the root:

```bash
npm run check
npx playwright install chromium
npm run test:browser
```

The [operations guide](docs/operations/runbook.md#проверки-перед-изменением-окружения)
describes how to enable the PostgreSQL integration tests. Autofix formatting and
lint with `npm run format` and `npm run lint:fix`.

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

See the [project map](docs/architecture/project-map.md) for package, test and
documentation directories.

## Licence

Contributions are licensed under [Apache-2.0](LICENSE), matching the project.
The project name and logos are not covered — see [TRADEMARKS.md](TRADEMARKS.md).
