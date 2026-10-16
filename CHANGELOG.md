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

### Security

- Validate browser mutation origins, sanitize JSON parser errors and bound request IDs.
- Preserve nginx security headers for cached assets and bypass static-file matching for API paths.
- Fail dependency audits closed on registry errors and block high build-tooling advisories.
- Require CI before image publication and emit SBOM/provenance metadata.
- Exclude environment variants and private drawings from Git and Docker build context.

- Cleared every known dependency advisory in the runtime tree. Runtime
  dependencies now report zero vulnerabilities from `npm audit`, including the
  previously critical `proxy-addr` IP-spoofing advisory and twelve advisories
  in `axios`, plus the `vue`, `dompurify`, `qs`, `js-yaml`, `fast-uri`,
  `source-map-js`, `markdown-it`, `fast-copy` and `ip-address` advisories.
- Pinned patched versions of Prisma CLI transitives (`mysql2`, `deepmerge-ts`)
  that previously had no non-breaking upgrade path.
- Replaced `nodemon` with Node's built-in `--watch`, which removes the
  vulnerable `chokidar`/`braces` chain and a `shell-quote` advisory from the
  build toolchain.
- The dependency audit gate now fails on critical advisories in build tooling
  and rejects allowlist entries that no longer match a real advisory, so a
  fixed vulnerability cannot leave a permanent waiver behind.
- `.audit-allowlist.json` is now empty: no advisory is waived.

### Changed

- Remove unused image assets, Vue DevTools/phone parsing packages and redundant type stubs.
- Use Express JSON parsing and Node UUID generation directly instead of extra direct dependencies.
- Remove unreachable local-profile storage, offline diary branches and unused store actions.
- Remove the obsolete startup script, consolidate ignore rules and trim generated config boilerplate.

- Organisation analytics now require at least eight distinct active members in
  every released risk, time and trend bucket.
- Course progress and rewards are calculated from course-owned lesson IDs and
  persisted homework submissions instead of client-provided percentages.
- Challenges can only be joined and completed during their configured period.
- Replaced the ApexCharts runtime with lightweight native SVG/CSS charts,
  substantially reducing production JavaScript and PWA precache size.

### Fixed

- Prevent delayed profile and mutation responses from restoring data after logout or an account switch.
- Keep logout retryable after network errors and ignore stale 401 responses from a previous session.
- Preserve authoritative activity streaks and diary creation dates when entries are edited.
- Return service-unavailable responses for authentication database outages instead of invalidating sessions.
- Reuse the freshly loaded database role without a second user lookup on role-gated routes.

- Repair narrow layouts, theme contrast, mobile navigation and nested modal focus.
- Include diary entries in the PDF diary export and keep error notifications until dismissed.
- Give homework and administrative fields accessible names.

- Editing or deleting a diary entry now updates or removes its derived safety
  signal, tags and attention score instead of leaving stale analytics behind.
- Homework submissions immediately synchronize canonical course progress.

### Tests

- Add Chromium/axe checks for 20 routes in both themes at three viewport widths,
  plus focus, API failure, reduced motion and editor checks.
- Cover request origin validation, HTTP error privacy, PDF content and audit gate failures.

- CI now applies every migration to a clean PostgreSQL 16 database and verifies
  that the resulting database matches the Prisma schema.
- Added regression coverage for aggregate privacy, diary-derived data, course
  progress, challenge periods and the lightweight chart components.

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
