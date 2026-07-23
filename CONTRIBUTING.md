# Contributing to Точка Ясности

Thanks for your interest in improving the project! This guide covers the
essentials for a smooth contribution.

## Getting started

1. Fork and clone the repository.
2. Follow the [Quick start](README.md#quick-start) to get the app running.
3. Create a branch from `main`: `git checkout -b feat/short-description`.

## Development workflow

This is an npm-workspaces monorepo (`frontend`, `backend`).

```bash
npm install            # install all workspaces
npm start              # run all three dev servers
```

Before opening a pull request, make sure the checks pass:

```bash
# Backend
cd backend && npx tsc --noEmit && npm test

# Frontend
cd frontend && npx vue-tsc --noEmit -p tsconfig.app.json && npm run build

# Formatting & lint (from the repo root)
npm run format:check
npm run lint
```

## Code style

- **Formatting** is handled by Prettier — run `npm run format` before committing.
- **Linting** is handled by ESLint — run `npm run lint` (autofix: `npm run lint:fix`).
- **Comments** in the backend and shared config are written in **English**.
- Keep changes focused; avoid drive-by refactors unrelated to your PR.
- Prefer real domain types over `any`. `strict` mode is on.

## Commit messages

Use short, imperative summaries. [Conventional Commits](https://www.conventionalcommits.org/)
are encouraged but not required:

```
feat(diary): add mood trend chart
fix(auth): reject known placeholder JWT secrets
docs: clarify docker setup
```

## Pull requests

- Describe **what** changed and **why**.
- Link any related issue.
- Include screenshots for UI changes.
- Keep the PR green in CI (type-check, tests, lint).

## Security

Please do **not** open public issues for security vulnerabilities. Follow the
process in [SECURITY.md](SECURITY.md). Never commit secrets — use `.env`
(git-ignored) and keep `.env.example` as the documented template.

## Working with the database

- Schema lives in `backend/prisma/schema.prisma`.
- Prisma 7 connects through a driver adapter (`@prisma/adapter-pg`); the CLI
  reads the connection string from `backend/prisma.config.ts`.
- Create migrations with `npx prisma migrate dev --name <change>`.

## Reporting bugs & requesting features

Open an issue with clear reproduction steps (for bugs) or a concrete use case
(for features). This is a mental-health product — for anything touching crisis
handling, please describe the safety implications.
