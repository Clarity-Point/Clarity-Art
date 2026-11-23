# Точка Ясности · Clarity-Art

[![CI](https://github.com/Clarity-Point/Clarity-Art/actions/workflows/ci.yml/badge.svg)](https://github.com/Clarity-Point/Clarity-Art/actions/workflows/ci.yml)
[![License: Apache-2.0](https://img.shields.io/badge/License-Apache--2.0-blue.svg)](LICENSE)
· [English](#english)

Платформа для самостоятельной установки. В ней есть дневник, творческие практики,
дыхательные упражнения, курсы с заданиями, галерея и опциональный ИИ-собеседник.
Ролевые кабинеты используют согласие пользователя и ограничение доступа.
Проект предназначен для самоподдержки и образования. За клинической и экстренной
помощью обращайтесь к профильным службам.

## Запуск

Для готовых Docker-образов достаточно [docker-compose.yml](docker-compose.yml)
и [.env.example](.env.example). Сохраните пример окружения как `.env`, задайте
`JWT_SECRET` и `POSTGRES_PASSWORD`, затем запустите приложение:

```bash
docker compose up -d
```

Приложение откроется на [localhost](http://localhost). Backend применяет
миграции при запуске. Для работы из исходников используйте
[инструкцию по разработке](docs/operations/runbook.md#локальная-разработка).

## Документация

| Раздел                                   | Где читать                                                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| Разработка, установка и поддержка        | [Инструкция по эксплуатации](docs/operations/runbook.md)                                                                             |
| Модули, каталоги и тесты                 | [Карта проекта](docs/architecture/project-map.md)                                                                                    |
| Согласие, черновики, задания и модерация | [Продуктовые сценарии](docs/operations/product-features.md)                                                                          |
| Проверки и открытые дефекты              | [Актуальный аудит](docs/audits/2026-11-23.md), [архив аудитов](docs/audits/archive)                                                  |
| Партнёрства и безопасный пилот           | [Дорожная карта](docs/outreach/RUSSIA_OUTREACH_AND_SAFE_PILOT_ROADMAP.md), [шаблон обращения](docs/outreach/OUTREACH_TEMPLATE_RU.md) |
| Участие в проекте                        | [Руководство для участников](CONTRIBUTING.md), [правила общения](CODE_OF_CONDUCT.md), [сообщение об уязвимости](SECURITY.md)         |

Проект распространяется по лицензии [Apache-2.0](LICENSE). Название и логотипы
регулирует отдельная [политика товарных знаков](TRADEMARKS.md).

## English

Clarity-Art is a self-hosted platform for reflective art practices and wellbeing
support. It includes a diary, courses, creative exercises and an optional AI chat.
The project is educational. Seek professional or emergency services for clinical care.

For a local installation, save [docker-compose.yml](docker-compose.yml) and
[.env.example](.env.example) in one directory. Rename the environment file to
`.env`, set `JWT_SECRET` and `POSTGRES_PASSWORD`, then run `docker compose up -d`.
Open [localhost](http://localhost). See the
[operations guide](docs/operations/runbook.md) for source setup and AI
configuration, and [Contributing](CONTRIBUTING.md) for development checks.
