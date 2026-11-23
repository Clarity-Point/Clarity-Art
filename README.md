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

## Для преподавателей ИЗО

Карточка «Три формы» подходит для короткого упражнения по композиции. В
развёрнутом приложении откройте `/practice-cards/three-shapes`, чтобы распечатать
карточку. Для работы на цифровом холсте войдите в аккаунт и откройте «Три формы»
в разделе «Творческая пауза».

1. Предложите ученику расположить три простые фигуры и назвать, куда должен
   сначала посмотреть зритель. Отложите первый эскиз на бумаге или скачайте его
   с холста до правки.
2. Обсудите, какая деталь притягивает взгляд. Испытайте одно изменение размера,
   положения или расстояния и сохраните второй эскиз.
3. Сравните оба рисунка. Попросите ученика описать изменение и объяснить, какой
   вариант он выбрал и почему.

Для обратной связи достаточно двух выбранных эскизов и короткого объяснения.
Используйте согласованный в учреждении способ обмена учебными работами.
Подробнее о печати, холсте и альбоме читайте в описании
[творческих практик](docs/operations/product-features.md#творческая-пауза-и-альбом).

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

### For visual arts educators

Use the “Three Shapes” exercise («Три формы») to discuss one compositional
decision. Ask the learner where the viewer should look first. Save the first
sketch, test one change in size, position, or spacing, and save the trial. Ask
the learner to describe the change and explain which version they chose.

Print the card from `/practice-cards/three-shapes` on your deployed instance. To
work digitally, sign in and open the exercise in the creative practices section
(«Творческая пауза»). Download the first sketch before editing the canvas. Use
your institution’s approved channel to exchange the selected sketches.
