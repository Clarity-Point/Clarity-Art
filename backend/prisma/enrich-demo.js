/**
 * Synthetic demo-data enrichment for «Точка Ясности».
 * Idempotent: wipes previously generated rows for the target demo users, then
 * recreates a rich, presentation-friendly dataset (diary, mood/chat history,
 * drawing analyses, gallery, course progress, achievements, challenges,
 * submissions, notifications, health metrics, peer support).
 *
 * Run:  node prisma/enrich-demo.js
 */
require('dotenv/config');
const { PrismaClient } = require('@prisma/client');
const { PrismaPg } = require('@prisma/adapter-pg');

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const daysAgo = (d, hour = 9) => {
  const dt = new Date(now - d * DAY);
  dt.setHours(hour, (d * 7) % 60, 0, 0);
  return dt;
};
const pick = (arr, i) => arr[i % arr.length];
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

// ---- content pools -------------------------------------------------------
const diaryPool = [
  {
    content:
      'Сегодня впервые за долгое время почувствовала спокойствие. Утренняя практика дыхания реально помогла собраться перед сложным разговором.',
    risk: 'low',
    tags: ['спокойствие', 'дыхание', 'прогресс'],
  },
  {
    content:
      'Было тревожно из-за дедлайна, но я нарисовала свои эмоции и стало легче отпустить напряжение.',
    risk: 'low',
    tags: ['тревога', 'арт-терапия'],
  },
  {
    content:
      'Немного накрыла грусть вечером. Записала три вещи, за которые благодарна — помогло сместить фокус.',
    risk: 'medium',
    tags: ['грусть', 'благодарность'],
  },
  {
    content: 'Отличный день! Завершила модуль курса и почувствовала гордость за себя.',
    risk: 'low',
    tags: ['радость', 'достижение', 'курс'],
  },
  {
    content:
      'Поругалась с близким человеком, внутри буря. Дала себе паузу и подышала по квадрату 4-4-4-4.',
    risk: 'medium',
    tags: ['злость', 'отношения', 'дыхание'],
  },
  {
    content: 'Спала плохо, чувствую усталость. Но прогулка на 6000 шагов немного вернула тонус.',
    risk: 'low',
    tags: ['усталость', 'активность'],
  },
  {
    content:
      'Поговорила с ИИ-ассистентом о своих страхах перед выступлением — стало понятнее, что именно меня пугает.',
    risk: 'low',
    tags: ['страх', 'ассистент', 'рефлексия'],
  },
  {
    content: 'Сегодня спокойный ровный день. Ничего особенного, и это тоже приятно.',
    risk: 'low',
    tags: ['стабильность'],
  },
  {
    content:
      'Ощущение, что справляюсь. Стрик уже больше недели, и это мотивирует продолжать заботиться о себе.',
    risk: 'low',
    tags: ['мотивация', 'прогресс'],
  },
  {
    content: 'Вернулись навязчивые мысли, было тяжело. Использовала технику заземления 5-4-3-2-1.',
    risk: 'medium',
    tags: ['тревога', 'заземление'],
  },
  {
    content: 'Творческий вечер: рисовала мандалу под музыку, полностью погрузилась в процесс.',
    risk: 'low',
    tags: ['творчество', 'поток', 'музыка'],
  },
  {
    content: 'Много размышляла о своих ценностях. Кажется, я начинаю лучше понимать, чего хочу.',
    risk: 'low',
    tags: ['самопознание', 'ценности'],
  },
];

const chatPool = [
  {
    title: 'Как справиться с тревогой перед встречей',
    risk: 'low',
    q: 'Завтра важная встреча и я очень нервничаю, что делать?',
    a: 'Давай разберём тревогу по шагам. Попробуй технику дыхания 4-7-8 и выпиши свои опасения на бумагу — так они станут конкретнее и управляемее.',
  },
  {
    title: 'Проблемы со сном',
    risk: 'medium',
    q: 'Последнюю неделю плохо сплю, просыпаюсь среди ночи.',
    a: 'Нарушения сна часто связаны с накопленным напряжением. Попробуем вечерний ритуал без экранов и короткую практику расслабления. Расскажи, что обычно крутится в голове ночью?',
  },
  {
    title: 'Разговор о самооценке',
    risk: 'low',
    q: 'Мне кажется, я недостаточно хорош во всём, что делаю.',
    a: 'Это знакомое многим чувство. Давай посмотрим на факты: назови три вещи, которые у тебя получились на этой неделе, даже небольшие.',
  },
  {
    title: 'Конфликт в семье',
    risk: 'medium',
    q: 'Постоянно ссорюсь с мамой, чувствую вину.',
    a: 'Вина — тяжёлое чувство. Важно отделить свою ответственность от чужой. Что именно ты хотела бы донести до мамы, но не получается?',
  },
  {
    title: 'Поиск ресурса и опоры',
    risk: 'low',
    q: 'Хочу найти то, что меня наполняет.',
    a: 'Отличный запрос! Вспомни момент, когда ты чувствовала себя живой и включённой. Что ты тогда делала? Начнём с этого.',
  },
  {
    title: 'Работа со страхом выступлений',
    risk: 'low',
    q: 'Боюсь публичных выступлений до дрожи.',
    a: 'Страх сцены очень распространён. Он говорит о том, что тебе важен результат. Давай подготовим тело: заземление, дыхание и репетиция первых 30 секунд.',
  },
  {
    title: 'Прокрастинация',
    risk: 'low',
    q: 'Откладываю важное дело уже месяц.',
    a: 'Часто за прокрастинацией стоит не лень, а страх или перегруз. Разобьём задачу на очень маленький первый шаг — на 5 минут. С чего можно начать?',
  },
  {
    title: 'Эмоциональное выгорание',
    risk: 'medium',
    q: 'Чувствую полное опустошение, ничего не радует.',
    a: 'Спасибо, что поделилась — это важный сигнал. Выгорание требует восстановления, а не усилий. Давай найдём, где можно снизить нагрузку уже сегодня.',
  },
  {
    title: 'Благодарность и хорошие новости',
    risk: 'low',
    q: 'Хочу поделиться — у меня получилось！',
    a: 'Как здорово! Расскажи подробнее, что именно получилось и как ты себя при этом чувствуешь? Такие моменты важно замечать и присваивать.',
  },
  {
    title: 'Одиночество',
    risk: 'medium',
    q: 'Чувствую себя одиноко в последнее время.',
    a: 'Одиночество бывает очень болезненным. Давай подумаем о маленьких шагах к связи с людьми — кому ты могла бы написать сегодня хотя бы короткое сообщение?',
  },
];

const imagePool = [
  {
    prompt: 'Анализ рисунка «Моё настроение сегодня»',
    result:
      'Тёплая цветовая гамма и плавные линии говорят о состоянии внутреннего равновесия. Заметен рост уверенности по сравнению с прошлыми работами.',
    likes: 24,
  },
  {
    prompt: 'Анализ рисунка «Дерево жизни»',
    result:
      'Крепкий ствол и развитая крона символизируют опору и ресурсность. Корни прорисованы уверенно — есть ощущение устойчивости.',
    likes: 41,
  },
  {
    prompt: 'Анализ рисунка «Мой страх»',
    result:
      'Тёмные тона в верхней части листа отражают тревогу, но наличие светлого пятна в центре указывает на внутренний ресурс для преодоления.',
    likes: 12,
  },
  {
    prompt: 'Анализ рисунка «Дом моей мечты»',
    result:
      'Открытые окна и распахнутая дверь символизируют готовность к контактам и новым возможностям. Композиция гармонична.',
    likes: 33,
  },
  {
    prompt: 'Анализ мандалы',
    result:
      'Симметрия и повторяющиеся узоры говорят о стремлении к порядку и самоуспокоению. Работа выполнена в состоянии потока.',
    likes: 57,
  },
  {
    prompt: 'Анализ рисунка «Моя семья»',
    result:
      'Фигуры расположены близко друг к другу — это отражает ощущение поддержки и тёплых связей. Хороший знак эмоциональной вовлечённости.',
    likes: 19,
  },
  {
    prompt: 'Анализ рисунка «Что меня радует»',
    result:
      'Яркие насыщенные цвета и динамичные линии передают радость и энергию. Виден творческий подъём.',
    likes: 28,
  },
  {
    prompt: 'Анализ абстракции «Поток эмоций»',
    result:
      'Плавные переходы цвета отражают способность проживать и отпускать эмоции. Заметна эмоциональная гибкость.',
    likes: 15,
  },
];

const notifPool = [
  {
    title: 'Новое достижение!',
    message: 'Вы получили значок «Огонь внутри» за стрик 7 дней 🔥',
    type: 'success',
  },
  {
    title: 'Напоминание о практике',
    message: 'Пора сделать дыхательную практику. Уделите себе 5 минут.',
    type: 'info',
  },
  {
    title: 'Ответ терапевта',
    message: 'Ваш терапевт оставил комментарий к домашнему заданию.',
    type: 'info',
  },
  {
    title: 'Новый вызов недели',
    message: 'Присоединяйтесь к челленджу «Неделя благодарности» и получите 70 баллов!',
    type: 'info',
  },
  {
    title: 'Прогресс по курсу',
    message: 'Вы прошли уже 65% курса «Путь к гармонии». Так держать!',
    type: 'success',
  },
  {
    title: 'Забота о себе',
    message: 'Не забудьте записать сегодняшнее настроение в дневник.',
    type: 'info',
  },
];

const peerPool = [
  {
    content:
      'Друзья, сегодня получилось впервые за месяц спокойно уснуть. Маленькая победа, но так приятно!',
    authorTitle: 'Участница сообщества',
  },
  {
    content:
      'Спасибо этому пространству за поддержку. Дыхательные практики реально работают в моменты паники.',
    authorTitle: 'Аноним',
  },
  {
    content:
      'Начал вести дневник эмоций — не думал, что это так помогает раскладывать мысли по полочкам.',
    authorTitle: 'Участник сообщества',
  },
  {
    content:
      'Кто-нибудь пробовал рисовать мандалы под музыку из раздела арт-терапии? Затягивает и успокаивает.',
    authorTitle: 'Творческая душа',
  },
  {
    content: 'Держитесь все, кому сейчас тяжело. Мы справляемся по одному дню за раз. ❤️',
    authorTitle: 'Наставник',
  },
  {
    content: 'Прошла половину курса и чувствую, что стала мягче к себе. Рекомендую не бросать!',
    authorTitle: 'Участница сообщества',
  },
];

// weight = how much data to generate. hero gets the most.
const targets = [
  {
    email: 'user@demo.ru',
    weight: 1.0,
    points: 1480,
    streak: 12,
    age: 29,
    avatarLevel: 5,
    goals:
      'Снизить уровень тревоги, лучше понимать свои эмоции и выстроить устойчивые практики заботы о себе.',
    concerns: 'Тревожность, перфекционизм, сложности с балансом работы и отдыха.',
    interests: ['рисование', 'йога', 'чтение', 'музыка', 'прогулки'],
    sleep: 5,
    steps: 8600,
    heart: 78,
    attention: 82,
  },
  {
    email: 'svo@demo.ru',
    weight: 0.7,
    points: 940,
    streak: 8,
    age: 34,
    avatarLevel: 3,
    goals: 'Работа с последствиями травматического опыта, восстановление чувства безопасности.',
    concerns: 'Флешбэки, нарушения сна, повышенная тревожность.',
    interests: ['спорт', 'музыка', 'природа'],
    sleep: 6,
    steps: 5200,
    heart: 88,
    attention: 61,
  },
  {
    email: 'child@demo.ru',
    weight: 0.6,
    points: 620,
    streak: 5,
    age: 11,
    avatarLevel: 2,
    goals: 'Научиться распознавать и называть свои чувства, справляться со злостью.',
    concerns: 'Вспышки злости, трудности в общении со сверстниками.',
    interests: ['рисование', 'игры', 'мультики', 'животные'],
    sleep: 9,
    steps: 11000,
    heart: 92,
    attention: 55,
  },
];

async function main() {
  const org = await prisma.organization.findFirst({ where: { inviteCode: 'DEMO2024' } });
  const therapist = await prisma.user.findUnique({ where: { email: 'therapist@demo.ru' } });
  const courses = await prisma.course.findMany({ include: { homework: true } });
  const achievements = await prisma.achievement.findMany();
  const challenges = await prisma.challenge.findMany();

  for (const t of targets) {
    const user = await prisma.user.findUnique({ where: { email: t.email } });
    if (!user) {
      console.warn('skip missing', t.email);
      continue;
    }
    const uid = user.id;

    // wipe previously generated data (idempotent)
    await prisma.chatSession.deleteMany({ where: { userId: uid } }); // cascades messages
    await prisma.diaryEntry.deleteMany({ where: { userId: uid } });
    await prisma.imageAnalysis.deleteMany({ where: { userId: uid } });
    await prisma.sentimentTrend.deleteMany({ where: { userId: uid } });
    await prisma.notification.deleteMany({ where: { userId: uid } });
    await prisma.userAchievement.deleteMany({ where: { userId: uid } });
    await prisma.userChallenge.deleteMany({ where: { userId: uid } });
    await prisma.courseProgress.deleteMany({ where: { userId: uid } });
    await prisma.submission.deleteMany({ where: { userId: uid } });

    // user + profile
    await prisma.user.update({
      where: { id: uid },
      data: {
        points: t.points,
        streak: t.streak,
        lastActivity: daysAgo(0, 20),
        // link every enriched patient to the demo therapist so /therapist is full
        ...(therapist && uid !== therapist.id ? { therapistId: therapist.id } : {}),
      },
    });
    await prisma.profile.update({
      where: { userId: uid },
      data: {
        age: t.age,
        avatarLevel: t.avatarLevel,
        attentionScore: t.attention,
        therapyGoals: t.goals,
        mainConcerns: t.concerns,
        interests: t.interests,
        sleepHours: t.sleep,
        stepsCount: t.steps,
        heartRateAvg: t.heart,
        preferredStyle: 'supportive',
        isSharedWithTherapist: true,
        additionalInfo:
          'Активно использует дневник и дыхательные практики. Демонстрирует стабильный прогресс.',
      },
    });

    // diary
    const nDiary = Math.round(18 * t.weight);
    for (let i = 0; i < nDiary; i++) {
      const d = pick(diaryPool, i + (t.email.length % 3));
      await prisma.diaryEntry.create({
        data: {
          userId: uid,
          content: d.content,
          riskLevel: d.risk,
          tags: d.tags,
          date: daysAgo(Math.round((nDiary - i) * (38 / nDiary)), 21),
        },
      });
    }

    // chat sessions (drive the mood chart) + messages
    const nChat = Math.round(14 * t.weight);
    for (let i = 0; i < nChat; i++) {
      const c = pick(chatPool, i + (t.email.length % 4));
      const date = daysAgo(Math.round((nChat - i) * (30 / nChat)), 15);
      await prisma.chatSession.create({
        data: {
          userId: uid,
          title: c.title,
          riskLevel: c.risk,
          date,
          tags: [c.risk === 'medium' ? 'внимание' : 'поддержка'],
          tokensPrompt: rand(120, 400),
          tokensCompletion: rand(200, 700),
          cost: +(Math.random() * 0.02).toFixed(4),
          messages: {
            create: [
              { role: 'user', content: c.q, createdAt: date },
              { role: 'assistant', content: c.a, createdAt: new Date(date.getTime() + 60000) },
            ],
          },
        },
      });
    }

    // sentiment trends (extra analytics history)
    const nTrend = Math.round(22 * t.weight);
    for (let i = 0; i < nTrend; i++) {
      const score = rand(55, 92);
      await prisma.sentimentTrend.create({
        data: {
          userId: uid,
          riskLevel: score < 65 ? 'medium' : 'low',
          score,
          tags: ['настроение'],
          date: daysAgo(Math.round((nTrend - i) * (30 / nTrend)), 22),
        },
      });
    }

    // image analyses (gallery + history)
    const nImg = Math.round(8 * t.weight);
    for (let i = 0; i < nImg; i++) {
      const im = pick(imagePool, i);
      await prisma.imageAnalysis.create({
        data: {
          userId: uid,
          prompt: im.prompt,
          result: im.result,
          isPublic: i % 2 === 0,
          likes: i % 2 === 0 ? im.likes : rand(0, 5),
          tokensPrompt: rand(300, 600),
          tokensCompletion: rand(200, 500),
          cost: +(Math.random() * 0.03).toFixed(4),
          date: daysAgo(Math.round((nImg - i) * (35 / nImg)), 17),
        },
      });
    }

    // course progress
    const progVals = [72, 45];
    for (let i = 0; i < courses.length; i++) {
      await prisma.courseProgress.create({
        data: {
          userId: uid,
          courseId: courses[i].id,
          progress: Math.min(
            100,
            Math.round(progVals[i % progVals.length] * (0.7 + t.weight * 0.3)),
          ),
          lastAccessed: daysAgo(rand(0, 4), 12),
        },
      });
    }

    // achievements earned (hero earns most)
    const earnCount = Math.max(2, Math.round(achievements.length * t.weight * 0.7));
    for (let i = 0; i < earnCount && i < achievements.length; i++) {
      await prisma.userAchievement.create({
        data: { userId: uid, achievementId: achievements[i].id, earnedAt: daysAgo(rand(1, 25)) },
      });
    }

    // challenges joined / completed
    for (let i = 0; i < challenges.length; i++) {
      await prisma.userChallenge.create({
        data: { userId: uid, challengeId: challenges[i].id, completed: i % 2 === 0 },
      });
    }

    // homework submissions (graded)
    for (const course of courses) {
      for (const hw of course.homework) {
        await prisma.submission.create({
          data: {
            userId: uid,
            homeworkId: hw.id,
            submittedContent:
              'Выполнил задание: описал свои ощущения и приложил рисунок. Было непросто начать, но в процессе стало легче.',
            grade: pick(['Отлично', 'Хорошо', 'Зачёт'], uid.length),
            analysisText:
              'Работа выполнена вдумчиво. Виден искренний контакт с эмоциями и готовность к рефлексии. Рекомендую продолжать в том же направлении.',
            submissionDate: daysAgo(rand(2, 15), 14),
          },
        });
      }
    }

    // notifications
    for (let i = 0; i < notifPool.length; i++) {
      const n = notifPool[i];
      await prisma.notification.create({
        data: {
          userId: uid,
          title: n.title,
          message: n.message,
          type: n.type,
          isRead: i > 2,
          date: daysAgo(i, 10),
        },
      });
    }

    console.log(
      `enriched ${t.email}: ${nDiary} diary, ${nChat} chats, ${nImg} analyses, ${nTrend} trends`,
    );
  }

  // peer support messages for the org
  if (org) {
    await prisma.peerSupportMessage.deleteMany({ where: { organizationId: org.id } });
    for (let i = 0; i < peerPool.length; i++) {
      const p = peerPool[i];
      await prisma.peerSupportMessage.create({
        data: {
          organizationId: org.id,
          content: p.content,
          authorTitle: p.authorTitle,
          createdAt: daysAgo(peerPool.length - i, 13),
        },
      });
    }
    console.log(`peer support: ${peerPool.length} messages`);
  }

  console.log('\n✅ Synthetic demo data ready.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
