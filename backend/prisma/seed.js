require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');
const bcrypt = require('bcryptjs');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  // Refuse to run the demo seed in production: it creates well-known demo
  // accounts (e.g. admin@demo.ru) with a public password.
  if (process.env.NODE_ENV === 'production') {
    console.warn(
      'Refusing to run demo seed in production (NODE_ENV=production). No demo accounts were created.',
    );
    return;
  }

  const initialCourses = [
    {
      slug: 'adult-self-discovery',
      category: 'adult',
      title: 'Арт-терапия для взрослых: Путь к гармонии и самопознанию',
      description:
        'Этот курс предназначен для взрослых, желающих использовать арт-терапию как инструмент для самопознания, эмоциональной регуляции, снятия стресса и развития творческого потенциала.',
      targetAudience: [
        'Взрослые, ищущие эффективные методы самопомощи',
        'Люди, стремящиеся к глубокому самопознанию',
      ],
      goals: ['Познакомить с принципами арт-терапии', 'Развить навыки саморегуляции'],
      modules: {
        create: [
          {
            title: 'Модуль 1: Введение',
            lessons: {
              create: [
                { title: 'Урок 1.1: Что такое арт-терапия' },
                { title: 'Урок 1.2: Материалы' },
              ],
            },
          },
        ],
      },
      homework: {
        create: [
          {
            title: 'Задание 1: Рисунок "Мое настроение сегодня"',
            description: 'Нарисуйте ваше текущее настроение.',
          },
        ],
      },
    },
    {
      slug: 'art-practice-difficult-experience',
      category: 'svo',
      title: 'Арт-практики после трудного опыта',
      description:
        'Небольшой курс бережной саморефлексии и творческих практик в собственном темпе.',
      targetAudience: ['Люди, пережившие сложный период и желающие попробовать арт-практики'],
      goals: ['Выбрать посильные способы саморефлексии и творческой самоподдержки'],
      modules: {
        create: [
          {
            title: 'Модуль 1: Бережный старт',
            lessons: {
              create: [{ title: 'Урок 1.1: Выбор посильной арт-практики' }],
            },
          },
        ],
      },
      homework: {
        create: [
          {
            title: 'Дневник наблюдений',
            description: 'Отмечайте, что помогло вам немного восстановиться сегодня.',
          },
        ],
      },
    },
  ];

  for (const courseData of initialCourses) {
    await prisma.course.upsert({
      where: { slug: courseData.slug },
      update: {},
      create: courseData,
    });
  }

  const achievements = [
    {
      title: 'Первый шаг',
      description: 'Сделайте свою первую запись в дневнике',
      icon: '📝',
      criteria: 'DIARY_COUNT:1',
    },
    {
      title: 'Дневниковед',
      description: 'Сделайте 10 записей в дневнике',
      icon: '📚',
      criteria: 'DIARY_COUNT:10',
    },
    {
      title: 'Исследователь',
      description: 'Завершите свой первый курс',
      icon: '🎓',
      criteria: 'COURSE_COMPLETED:1',
    },
    {
      title: 'Огонь внутри',
      description: 'Поддерживайте стрик 7 дней подряд',
      icon: '🔥',
      criteria: 'STREAK:7',
    },
    {
      title: 'Неугасаемый',
      description: 'Поддерживайте стрик 30 дней подряд',
      icon: '🎇',
      criteria: 'STREAK:30',
    },
    {
      title: 'Художник души',
      description: 'Проанализируйте 5 своих рисунков',
      icon: '🎨',
      criteria: 'IMAGE_ANALYSIS_COUNT:5',
    },
    {
      title: 'Арт-мастер',
      description: 'Проанализируйте 20 рисунков',
      icon: '🖼️',
      criteria: 'IMAGE_ANALYSIS_COUNT:20',
    },
    {
      title: 'Собеседник',
      description: 'Отправьте 50 сообщений ИИ-ассистенту',
      icon: '💬',
      criteria: 'CHAT_COUNT:50',
    },
    {
      title: 'Академик',
      description: 'Сдайте 5 домашних заданий',
      icon: '🏫',
      criteria: 'HOMEWORK_COUNT:5',
    },
  ];

  for (const ach of achievements) {
    await prisma.achievement.upsert({
      where: { title: ach.title },
      update: {},
      create: ach,
    });
  }

  // --- Challenges (so the Challenges page has content to join/complete) ---
  const now = new Date();
  const inDays = (d) => new Date(now.getTime() + d * 24 * 60 * 60 * 1000);
  const challenges = [
    {
      title: 'Неделя благодарности',
      description: 'Каждый день записывайте одну вещь, за которую вы благодарны.',
      pointsAward: 70,
    },
    {
      title: '7 дней осознанности',
      description: 'Ежедневная короткая практика осознанного дыхания.',
      pointsAward: 50,
    },
    {
      title: 'Творческий марафон',
      description: 'Создайте 5 рисунков на тему своих эмоций за две недели.',
      pointsAward: 120,
    },
    {
      title: 'Цифровой детокс',
      description: 'Проведите час в день без экранов и опишите ощущения.',
      pointsAward: 60,
    },
  ];
  // Challenge has no unique text field, so avoid duplicating on re-seed.
  const existingChallenges = await prisma.challenge.count();
  if (existingChallenges === 0) {
    for (const c of challenges) {
      await prisma.challenge.create({
        data: { ...c, startDate: now, endDate: inDays(14) },
      });
    }
  }

  // --- Demo accounts (one per role, so every part of the UI can be exercised) ---
  const org = await prisma.organization.upsert({
    where: { inviteCode: 'DEMO2024' },
    update: {},
    create: { name: 'Демо-организация «Ясность»', inviteCode: 'DEMO2024' },
  });

  const DEMO_PASSWORD = 'Demo1234!';
  const hashed = await bcrypt.hash(DEMO_PASSWORD, 10);

  const demoUsers = [
    { email: 'user@demo.ru', role: 'USER', name: 'Анна Пользователь', category: 'adult' },
    { email: 'admin@demo.ru', role: 'ADMIN', name: 'Админ Демо', category: 'general' },
    { email: 'therapist@demo.ru', role: 'THERAPIST', name: 'Терапевт Демо', category: 'general' },
    { email: 'orgadmin@demo.ru', role: 'ORG_ADMIN', name: 'Орг-Админ Демо', category: 'general' },
    { email: 'mentor@demo.ru', role: 'MENTOR', name: 'Ментор Демо', category: 'general' },
    { email: 'child@demo.ru', role: 'USER', name: 'Дима Ребёнок', category: 'child' },
    {
      email: 'recovery@demo.ru',
      role: 'USER',
      name: 'Демо: восстановление',
      category: 'svo_participant',
    },
  ];

  const created = {};
  for (const u of demoUsers) {
    created[u.email] = await prisma.user.upsert({
      where: { email: u.email },
      update: { role: u.role, organizationId: org.id },
      create: {
        email: u.email,
        password: hashed,
        role: u.role,
        organizationId: org.id,
        points: 120,
        streak: 3,
        profile: {
          create: { name: u.name, category: u.category, preferredStyle: 'neutral' },
        },
      },
    });
  }

  // Attach the regular demo users to the demo therapist so /therapist has patients to show.
  await prisma.user.updateMany({
    where: { email: { in: ['user@demo.ru', 'child@demo.ru', 'recovery@demo.ru'] } },
    data: { therapistId: created['therapist@demo.ru'].id },
  });

  console.log('Seed data inserted');
  console.log(`Demo accounts (password: ${DEMO_PASSWORD}):`);
  demoUsers.forEach((u) => console.log(`  ${u.role.padEnd(10)} ${u.email}`));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
