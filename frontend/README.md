# frontend

The Vue 3 single-page app for «Точка Ясности». Part of an npm-workspaces
monorepo — see the [root README](../README.md) for running the full stack, and
[CONTRIBUTING.md](../CONTRIBUTING.md) for the development setup.

## Stack

Vue 3 (`<script setup>`) · Vite · Pinia · Vue Router · TypeScript, built as a PWA.

## Commands

Run these from the repository root so the workspace resolves correctly:

```bash
npm run dev   --workspace frontend   # dev server with HMR on :5173
npm run build --workspace frontend   # production build to dist/
npx vue-tsc --noEmit -p frontend/tsconfig.app.json   # type-check
```

`vue-tsc` replaces the `tsc` CLI because TypeScript cannot type `.vue` imports on
its own. TypeScript is pinned to 5.9 in the root `overrides`: the TypeScript 7
native compiler does not yet work with `vue-tsc`.

## Configuration

Vite inlines `VITE_*` variables **at build time**, so they are baked into the
bundle rather than read at runtime — see [.env.example](.env.example).

| Variable            | Purpose                                                   |
| ------------------- | --------------------------------------------------------- |
| `VITE_API_URL`      | Base path for API calls (`/api`, proxied to the backend). |
| `VITE_APP_NAME`     | Application name shown in the PWA manifest.               |
| `VITE_PROXY_TARGET` | Dev only: where the dev server proxies `/api` (`:3100`).  |

In the production image these are fixed at build time; the `/api` proxy target
is instead configured on the container through `BACKEND_URL`, which is
substituted into [nginx.conf.template](nginx.conf.template) at start.

## Layout

```
src/
  components/   reusable UI, including Icon.vue
  composables/  shared logic extracted from large views (use*.ts)
  router/       routes and navigation guards
  stores/       Pinia stores
  views/        routed pages
```
