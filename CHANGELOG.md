# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and
the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Container images are published for each release:

- `ghcr.io/clarity-point/clarity-art-backend`
- `ghcr.io/clarity-point/clarity-art-frontend`

Both are built for `linux/amd64` and `linux/arm64`. A release tag `vX.Y.Z`
publishes `X.Y.Z`, `X.Y` and `X` tags; `main` publishes `latest`.

## [Unreleased]

## [1.0.0] — 2026-07-25

First public release.

### Added

- **Reflective diary** with an activity calendar and optional non-clinical reflection.
- **Optional AI companion** — streaming replies and session history, speaking the
  OpenAI-compatible `/chat/completions` protocol, so any such server works,
  including a fully local one. With no provider configured the app still runs
  end to end and degrades to calm canned responses.
- **Creative reflection** — upload or draw on a canvas for optional prompts.
- **Courses** with modules, lessons and homework, and guided breathing practices.
- **Progress** — activity tracking, achievements, challenges, leaderboard, gallery.
- **Role-based spaces** for therapists (only with explicit user sharing),
  organisation admins (privacy-protected aggregates) and platform admins.
- **Prebuilt multi-architecture container images**, so the stack runs without
  cloning or building the repository.
- **Separate development and production stacks** — `docker-compose.dev.yml`
  builds from source and hot-reloads; `docker-compose.yml` runs published images
  with no bind mounts.
- **Structured logging** via pino, configured with `LOG_LEVEL` and `LOG_FORMAT`
  (`pretty` for humans, `json` for log shippers). Every request carries an
  `X-Request-Id` echoed in error responses. Credentials and auth headers are
  redacted centrally, and request bodies are never logged.
- **Health endpoints** — `/health` (liveness, dependency-free) and
  `/health/ready` (readiness), plus graceful shutdown on `SIGTERM`.
- **CI** covering lint, formatting, types, tests, secret scanning, a dependency
  audit and image builds, with automated image publishing on release.

### Security

- The backend refuses to start without a strong, non-placeholder `JWT_SECRET`.
- API responses are marked `no-store`; Swagger is disabled in production.
- Containers run as an unprivileged user.
- `trust proxy` is configured, so rate limiting keys on the real client address
  rather than the reverse proxy.
- The dependency audit blocks on advisories in the shipped runtime tree; any
  waiver carries a written justification in `.audit-allowlist.json`.

### Notes

This is a demonstration and educational project. It is **not** a medical device
and is no replacement for professional care. It performs no diagnosis, triage or
emergency handling.

[unreleased]: https://github.com/Clarity-Point/Clarity-Art/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Clarity-Point/Clarity-Art/releases/tag/v1.0.0
