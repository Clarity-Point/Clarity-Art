# Frontend — Точка Ясности

Vue 3, TypeScript, Vite, Vue Router и Pinia. Общая тема: `src/assets/theme.css`.
Страницы: `src/views`; общие компоненты: `src/components`; логика: `src/composables`.

Из корня репозитория:

```bash
npm ci
npm run dev -w frontend
npm run build -w frontend
npm test -w frontend
npm run test:browser
```

Vite проксирует `/api` на `http://localhost:3100`; адрес можно изменить через
`VITE_PROXY_TARGET`. Для production API использует тот же origin и путь `/api`.
Внешний адрес API потребует согласованных CORS, cookie и CSP.

Браузерные проверки находятся в `tests/browser`, конфигурация — в корне.
Они используют тестовые ответы API. Для первого запуска установите Chromium:
`npx playwright install chromium`.

[Карта проекта](../docs/architecture/project-map.md) ·
[Эксплуатация](../docs/operations/runbook.md) ·
[Аудит](../docs/audits/2026-10-16.md)
