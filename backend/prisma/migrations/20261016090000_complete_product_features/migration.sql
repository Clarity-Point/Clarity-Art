-- AlterTable
ALTER TABLE "ImageAnalysis" ADD COLUMN     "moderationStatus" TEXT NOT NULL DEFAULT 'VISIBLE';

-- AlterTable
ALTER TABLE "CourseProgress" ADD COLUMN     "lastLessonId" TEXT;

-- CreateTable
CREATE TABLE "Draft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "text" TEXT NOT NULL DEFAULT '',
    "version" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Draft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordReset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "sessionVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GalleryReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "detail" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "reviewedBy" TEXT,

    CONSTRAINT "GalleryReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HiddenImage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,

    CONSTRAINT "HiddenImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoodCheckIn" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" DATE NOT NULL,
    "score" INTEGER NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MoodCheckIn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Draft_userId_kind_key_key" ON "Draft"("userId", "kind", "key");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordReset_userId_key" ON "PasswordReset"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordReset_tokenHash_key" ON "PasswordReset"("tokenHash");

-- CreateIndex
CREATE INDEX "GalleryReport_status_createdAt_idx" ON "GalleryReport"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "GalleryReport_reporterId_imageId_key" ON "GalleryReport"("reporterId", "imageId");

-- CreateIndex
CREATE INDEX "HiddenImage_imageId_idx" ON "HiddenImage"("imageId");

-- CreateIndex
CREATE UNIQUE INDEX "HiddenImage_userId_imageId_key" ON "HiddenImage"("userId", "imageId");

-- CreateIndex
CREATE UNIQUE INDEX "MoodCheckIn_userId_day_key" ON "MoodCheckIn"("userId", "day");

-- AddForeignKey
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalleryReport" ADD CONSTRAINT "GalleryReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalleryReport" ADD CONSTRAINT "GalleryReport_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "ImageAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiddenImage" ADD CONSTRAINT "HiddenImage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HiddenImage" ADD CONSTRAINT "HiddenImage_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "ImageAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoodCheckIn" ADD CONSTRAINT "MoodCheckIn_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "MoodCheckIn" ADD CONSTRAINT "MoodCheckIn_score_check" CHECK ("score" BETWEEN 1 AND 5);
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_version_check" CHECK ("version" > 0);
ALTER TABLE "Draft" ADD CONSTRAINT "Draft_kind_check" CHECK ("kind" IN ('diary', 'homework'));
ALTER TABLE "ImageAnalysis" ADD CONSTRAINT "ImageAnalysis_moderationStatus_check" CHECK ("moderationStatus" IN ('VISIBLE', 'BLOCKED'));
ALTER TABLE "GalleryReport" ADD CONSTRAINT "GalleryReport_status_check" CHECK ("status" IN ('PENDING', 'ACTIONED', 'DISMISSED'));

-- Populate introductory material only for existing, empty demo lessons.
UPDATE "Lesson" AS l SET "content" = $lesson$## Творчество как способ заметить своё состояние

Для этой практики не нужны навыки рисования. Линии, пятна и формы могут помочь описать то, для чего пока трудно подобрать слова. В этом курсе мы предлагаем упражнения для самостоятельного наблюдения; они не заменяют индивидуальную работу со специалистом.

### Подготовьте пространство

Выберите спокойное место и выделите 5–10 минут. Возьмите лист бумаги и любой удобный инструмент: карандаш, ручку или мелок. Разрешите себе остановиться в любой момент.

### Практика «Линия моего дня»

1. Посмотрите вокруг и выберите предмет, на котором приятно задержать взгляд.
2. Проведите на листе линию, которая сейчас кажется подходящей. Она может быть прямой, прерывистой или волнистой.
3. При желании добавьте цвет или ещё несколько линий. Не старайтесь сделать красиво.
4. Дайте рисунку название, если хочется.

### Вопросы для наблюдения

Что вы замечали во время рисования? Какой участок листа привлекает внимание? Что хотелось бы оставить таким, как есть?

Не нужно искать «правильное» значение цвета или формы. Смысл рисунка определяете вы. Можно записать пару слов в дневник или просто закончить упражнение.$lesson$ FROM "Module" AS m JOIN "Course" AS c ON c.id = m."courseId" WHERE l."moduleId" = m.id AND c.slug = 'adult-self-discovery' AND l.title = 'Урок 1.1: Что такое арт-терапия' AND (l.content IS NULL OR l.content = '');
UPDATE "Lesson" AS l SET "content" = $lesson$## Соберите небольшой набор

Начните с того, что уже есть дома: бумага и обычная ручка подходят. Покупать специальный набор не требуется.

- **Карандаш или ручка** — удобно пробовать линии и небольшие наброски.
- **Цветные карандаши или мелки** — можно выбирать цвет и силу нажима.
- **Бумага для коллажа** — подойдут ненужные журналы и упаковка; элементы можно рвать руками.
- **Краски** — используйте, если вам приятен этот материал и есть место для воды и уборки.

Выбирайте нетоксичные материалы по возрасту участника. Для совместных занятий с ребёнком подготовьте безопасные инструменты и оставайтесь рядом.

### Практика «Три следа»

1. Сделайте три разных следа одним инструментом: точку, линию и пятно.
2. Попробуйте изменить нажим или направление.
3. Выберите след, который сейчас нравится больше других.
4. Из выбранного следа создайте небольшой свободный рисунок в течение 3–5 минут.

### Завершение

Посмотрите на работу с небольшого расстояния. Какие ощущения вызывает сам процесс? Хотите ли вы попробовать этот инструмент снова?

При желании выполните домашнее задание «Моё настроение сегодня»: создайте рисунок и опишите свой опыт своими словами. Можно сохранить черновик и вернуться позже.$lesson$ FROM "Module" AS m JOIN "Course" AS c ON c.id = m."courseId" WHERE l."moduleId" = m.id AND c.slug = 'adult-self-discovery' AND l.title = 'Урок 1.2: Материалы' AND (l.content IS NULL OR l.content = '');
UPDATE "Lesson" AS l SET "content" = $lesson$## Начните с того, что подходит сегодня

Вы сами выбираете продолжительность и глубину упражнения. Не нужно изображать трудные события или рассказывать о них. Можно работать только с простыми формами, нейтральными предметами и цветом.

### Перед началом

Проверьте, удобно ли вы сидите. Посмотрите вокруг и назовите несколько обычных предметов рядом. Подготовьте бумагу и знакомый инструмент. Выберите короткое время — например, 2–5 минут.

### Практика «Предмет рядом»

1. Выберите простой предмет: чашку, лист растения или камень.
2. Рассмотрите его контур. Изобразите несколько линий, не стремясь к сходству.
3. При желании добавьте фон или узор.
4. Остановитесь, когда решите, что достаточно. Незаконченная работа тоже допустима.

### После упражнения

Обратите внимание на своё состояние. Хотелось бы сейчас отдохнуть, выпить воды или поговорить с человеком, которому доверяете? В дневнике можно записать, что было комфортно, а что хотелось бы изменить в следующий раз.

Если упражнение вызывает неприятные ощущения, отложите материалы и вернитесь к обычным действиям. Вы можете пропустить любую практику. При необходимости обратитесь за поддержкой к специалисту.$lesson$ FROM "Module" AS m JOIN "Course" AS c ON c.id = m."courseId" WHERE l."moduleId" = m.id AND c.slug = 'art-practice-difficult-experience' AND l.title = 'Урок 1.1: Выбор посильной арт-практики' AND (l.content IS NULL OR l.content = '');
