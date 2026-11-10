import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const exampleCourse = {
  id: 'audit-course',
  slug: 'audit-course',
  title: 'Творческая практика',
  description: 'Учимся замечать своё состояние через рисунок.',
  category: 'adult',
  modules: [
    {
      id: 'module-1',
      title: 'Начало',
      lessons: [{ id: 'lesson-1', title: 'Первый рисунок', content: 'Нарисуйте линию.' }],
    },
  ],
  relatedHomework: [
    { id: 'homework-1', title: 'Свободный рисунок', description: 'Опишите свои впечатления.' },
  ],
};

async function mockApi(page: Page, failure = false) {
  const drafts = new Map<string, { text: string; version: number }>();
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path === '/api/profile') {
      data = {
        id: 'audit-user',
        name: 'Проверка интерфейса',
        email: 'audit@example.test',
        role: 'ADMIN',
        points: 0,
        streak: 0,
      };
    } else if (path === '/api/courses/audit-course') {
      data = exampleCourse;
    } else if (path === '/api/homework/homework-1') {
      data = {
        ...exampleCourse.relatedHomework[0],
        courseSlug: exampleCourse.slug,
        courseTitle: exampleCourse.title,
        submission: null,
      };
    } else if (path.startsWith('/api/drafts/')) {
      if (route.request().method() === 'PUT') {
        const body = route.request().postDataJSON();
        drafts.set(path, { text: body.text, version: body.version + 1 });
      }
      data = drafts.get(path) || { text: '', version: 0 };
    } else if (
      path === '/api/history' ||
      path === '/api/mood-checkins' ||
      path === '/api/admin/reports'
    ) {
      data = { items: [], nextCursor: null };
    } else if (path === '/api/ai/status') {
      data = { enabled: false, requiresConsent: false };
    } else if (path === '/api/analytics/correlations') {
      data = { insights: [] };
    } else if (path === '/api/org/stats') {
      data = { orgName: 'Проверка', memberCount: 0, riskStats: [], heatmapData: {}, trends: [] };
    }
    await route.fulfill({
      status:
        failure &&
        path !== '/api/profile' &&
        !(path.startsWith('/api/drafts/') && route.request().method() === 'GET')
          ? 503
          : 200,
      json: data,
    });
  });
}

const routes = [
  '/',
  '/diary',
  '/chat',
  '/image-analysis',
  '/courses',
  '/courses/audit-course',
  '/homework/homework-1?courseContext=audit-course',
  '/analytics',
  '/profile',
  '/leaderboard',
  '/gallery',
  '/challenges',
  '/breathing',
  '/art-therapy-music',
  '/knowledge',
  '/admin',
  '/therapist',
  '/org-admin',
  '/login',
  '/register',
  '/history',
  '/forgot-password',
  '/reset-password',
  '/admin/moderation',
];
for (const theme of ['light', 'dark']) {
  for (const width of [320, 768, 1440]) {
    test(`${theme} ${width}px: routes reflow and expose accessible controls`, async ({ page }) => {
      test.setTimeout(90_000);
      await mockApi(page);
      await page.setViewportSize({ width, height: 900 });
      await page.addInitScript((value) => localStorage.setItem('theme', value), theme);
      for (const path of routes) {
        const errors: string[] = [];
        const onError = (error: Error) => errors.push(error.message);
        page.on('pageerror', onError);
        await page.goto(path);
        await expect(page.locator('main')).toBeVisible();
        await page.waitForTimeout(450);
        // Contrast must be measured after finite entrance animations settle;
        // their temporary opacity otherwise produces timing-dependent results.
        await page.evaluate(() =>
          Promise.all(
            document
              .getAnimations()
              .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
              .map((animation) => animation.finished.catch(() => {})),
          ),
        );
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${path}: horizontal overflow`,
        ).toBe(true);
        expect(errors, `${path}: uncaught JavaScript errors`).toEqual([]);
        const audit = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
          .analyze();
        expect(
          audit.violations.map((v) => ({ id: v.id, nodes: v.nodes.map((n) => n.target) })),
          path,
        ).toEqual([]);
        page.off('pageerror', onError);
      }
    });
  }
}

test('mobile drawer and emergency dialog contain focus and restore it', async ({ page }) => {
  await mockApi(page);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/');
  const menu = page.getByRole('button', { name: 'Открыть меню', exact: true });
  await menu.click();
  await expect(page.locator('#primary-navigation a').first()).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: /Нужна помощь сейчас/ })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
  await menu.click();
  await page.getByRole('button', { name: /Нужна помощь сейчас/ }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.keyboard.press('Shift+Tab');
  await expect(page.getByRole('button', { name: 'Закрыть окно' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(menu).toBeFocused();
});

test('reduced motion keeps breathing instructions without scaling', async ({ page }) => {
  await mockApi(page);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/breathing');
  await page.getByRole('button', { name: 'Начать практику' }).click();
  await expect(page.locator('.breathing-circle')).toHaveCSS('transform', 'none');
  await expect(page.locator('.phase-label')).toHaveText('Вдох');
});

test('API failure states show recovery actions without overflowing', async ({ page }) => {
  await mockApi(page, true);
  await page.setViewportSize({ width: 320, height: 800 });
  await page.goto('/diary');
  await page
    .getByRole('textbox', { name: 'Новая запись' })
    .fill('Текст должен сохраниться в редакторе');
  await page.getByRole('button', { name: 'Добавить запись' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Не удалось сохранить' })).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Новая запись' })).toHaveValue(
    'Текст должен сохраниться в редакторе',
  );
  for (const path of ['/gallery', '/courses', '/therapist', '/org-admin']) {
    await page.goto(path);
    await expect(page.getByText(/Не удалось/).first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
});

test('course editor contains focus and closes with Escape', async ({ page }) => {
  await mockApi(page);
  await page.goto('/admin');
  const trigger = page.getByRole('button', { name: /Добавить курс|Новый курс/ });
  await trigger.click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(page.getByLabel('ID (латиницей)')).toBeFocused();
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(audit.violations.map((v) => v.id)).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(trigger).toBeFocused();
});

test('failed logout stays on the current screen and supports retry', async ({ page }) => {
  await mockApi(page);
  let failLogout = true;
  await page.route('**/api/logout', (route) => route.fulfill({ status: failLogout ? 503 : 204 }));
  await page.goto('/diary');
  await page.getByRole('button', { name: 'Меню профиля' }).click();
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Не удалось выйти');
  await expect(page).toHaveURL(/\/diary$/);
  failLogout = false;
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
});

test('an expired session redirects once and keeps the intended destination', async ({ page }) => {
  await mockApi(page);
  await page.route('**/api/gallery?*', (route) =>
    route.fulfill({ status: 401, json: { error: 'Expired' } }),
  );
  await page.goto('/');
  await page.locator('.sb-item[href="/gallery"]').click();
  await expect(page).toHaveURL(/\/login\?redirect=(?:%2F|\/)gallery$/);
  await expect(page.getByText('Сессия завершилась. Войдите снова, чтобы продолжить.')).toHaveCount(
    1,
  );
});

test('invalid login shows the form error without a session-expired notification', async ({
  page,
}) => {
  await mockApi(page);
  await page.route('**/api/login', (route) =>
    route.fulfill({ status: 401, json: { error: 'Invalid credentials' } }),
  );
  await page.goto('/login');
  await page.getByLabel('Email', { exact: true }).fill('user@example.test');
  await page.getByLabel('Пароль', { exact: true }).fill('incorrect-password');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Не удалось войти');
  await expect(page.getByText('Сессия завершилась. Войдите снова, чтобы продолжить.')).toHaveCount(
    0,
  );
});

test('a late 401 from the previous session does not log out a newly signed-in user', async ({
  page,
}) => {
  await mockApi(page);
  let account = 'old-account';
  await page.route('**/api/profile', (route) =>
    route.fulfill({ json: { id: account, name: account, role: 'USER', streak: 0 } }),
  );
  let release!: () => void;
  let started!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  const notificationStarted = new Promise<void>((resolve) => {
    started = resolve;
  });
  let firstNotification = true;
  await page.route('**/api/notifications', async (route) => {
    if (firstNotification) {
      firstNotification = false;
      started();
      await delayed;
      await route.fulfill({ status: 401, json: { error: 'Old session' } });
    } else await route.fulfill({ json: [] });
  });
  await page.goto('/');
  await notificationStarted;
  await page.getByRole('button', { name: 'Меню профиля' }).click();
  await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  account = 'new-account';
  await page.getByLabel('Email', { exact: true }).fill('new@example.test');
  await page.getByLabel('Пароль', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page).toHaveURL('http://127.0.0.1:5173/');
  const oldResponse = page.waitForResponse(
    (response) => response.url().endsWith('/api/notifications') && response.status() === 401,
  );
  release();
  await oldResponse;
  await page.waitForTimeout(150);
  await expect(page.getByRole('button', { name: 'Меню профиля' })).toContainText('new-account');
  await expect(page.getByText('Сессия завершилась. Войдите снова, чтобы продолжить.')).toHaveCount(
    0,
  );
});

test('diary draft autosaves and is restored after reload', async ({ page }) => {
  await mockApi(page);
  await page.goto('/diary');
  const input = page.getByRole('textbox', { name: 'Новая запись' });
  await input.fill('Сохранённый на сервере черновик');
  await expect(page.getByText('Черновик сохранён', { exact: true })).toBeVisible();
  await page.reload();
  await expect(input).toHaveValue('Сохранённый на сервере черновик');
  await expect(page.getByText('Черновик восстановлен', { exact: true })).toBeVisible();
});

test('draft conflict preserves text and offers explicit recovery', async ({ page }) => {
  await mockApi(page);
  await page.route('**/api/drafts/diary/new', async (route) => {
    if (route.request().method() === 'PUT')
      await route.fulfill({ status: 409, json: { error: 'Conflict' } });
    else await route.fulfill({ json: { text: 'Предыдущая версия', version: 2 } });
  });
  await page.goto('/diary');
  const input = page.getByRole('textbox', { name: 'Новая запись' });
  await input.fill('Моя новая версия');
  await expect(page.getByRole('alert')).toContainText('другой вкладке');
  await expect(input).toHaveValue('Моя новая версия');
});

test('recovery removes token from address and submits it only in request body', async ({
  page,
}) => {
  await mockApi(page);
  const token = 'a'.repeat(64);
  let body: unknown;
  await page.route('**/api/auth/reset-password', async (route) => {
    body = route.request().postDataJSON();
    await route.fulfill({ json: { message: 'Пароль изменён. Войдите с новым паролем.' } });
  });
  await page.goto(`/reset-password#token=${token}`);
  await expect(page).toHaveURL(/\/reset-password$/);
  await page.getByLabel('Новый пароль', { exact: true }).fill('new-password-123');
  await page.getByLabel('Повторите пароль').fill('new-password-123');
  await page.getByRole('button', { name: 'Сохранить пароль' }).click();
  await expect(page.getByRole('status')).toContainText('Пароль изменён');
  expect(body).toEqual({ token, password: 'new-password-123' });
});

test('manual check-in is saved independently of AI analysis', async ({ page }) => {
  await mockApi(page);
  let body: Record<string, unknown> = {};
  await page.route('**/api/mood-checkins', async (route) => {
    if (route.request().method() === 'PUT') {
      body = route.request().postDataJSON();
      await route.fulfill({ json: { ...body, id: 'mood-1' } });
    } else await route.fulfill({ json: { items: [], nextCursor: null } });
  });
  await page.goto('/diary');
  await page.getByRole('button', { name: 'Хорошо', exact: true }).click();
  await page.getByLabel('Что помогло').fill('Прогулка');
  await page.getByRole('button', { name: 'Сохранить отметку' }).click();
  await expect(page.getByText('Ваша отметка сохранена.', { exact: false })).toBeVisible();
  expect(body.score).toBe(4);
  expect(body.note).toBe('Прогулка');
});

test('lesson reader saves reading position without marking lesson complete', async ({ page }) => {
  await mockApi(page);
  let position: unknown;
  await page.route('**/api/courses/audit-course/position', async (route) => {
    position = route.request().postDataJSON();
    await route.fulfill({ status: 204 });
  });
  await page.goto('/courses/audit-course');
  await expect(page.getByText('Нарисуйте линию.', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Читать: Первый рисунок' }).click();
  await expect.poll(() => position).toEqual({ lessonId: 'lesson-1' });
  await expect(page.locator('.lesson-main input')).not.toBeChecked();
});

test('history keeps filters while paging and opens an older diary entry', async ({ page }) => {
  await mockApi(page);
  const requests: URL[] = [];
  await page.route('**/api/history?*', async (route) => {
    const url = new URL(route.request().url());
    requests.push(url);
    await route.fulfill({
      json: {
        items: [
          {
            id: url.searchParams.has('cursor') ? 'old-2' : 'old-1',
            title: 'Запись дневника',
            text: 'Старая запись из полной истории',
            date: '2025-01-01T12:00:00Z',
            href: '/diary?entry=old-1',
          },
        ],
        nextCursor: url.searchParams.has('cursor') ? null : 'next-page',
      },
    });
  });
  await page.route('**/api/diary/old-1', (route) =>
    route.fulfill({
      json: {
        id: 'old-1',
        content: 'Старая запись из полной истории',
        date: '2025-01-01T12:00:00Z',
      },
    }),
  );
  await page.goto('/history');
  await page.getByLabel('Поиск по тексту').fill('Старая запись');
  await page.getByLabel('С даты', { exact: true }).fill('2025-01-01');
  await page.getByLabel('По дату включительно').fill('2025-01-31');
  await page.getByRole('button', { name: 'Найти', exact: true }).click();
  await expect(page.locator('.history-item')).toHaveCount(1);
  await page.getByRole('button', { name: 'Загрузить ещё' }).click();
  await expect(page.locator('.history-item')).toHaveCount(2);
  expect(requests.at(-1)?.searchParams.get('q')).toBe('Старая запись');
  expect(requests.at(-1)?.searchParams.get('cursor')).toBe('next-page');
  await page.getByRole('link', { name: 'Открыть запись' }).first().click();
  await expect(page.locator('#entry-old-1')).toContainText('Старая запись из полной истории');
});

test('homework has an independent autosaved draft and keeps submitted work visible', async ({
  page,
}) => {
  await mockApi(page);
  await page.route('**/api/homework/homework-1', (route) =>
    route.fulfill({
      json: {
        ...exampleCourse.relatedHomework[0],
        courseSlug: exampleCourse.slug,
        courseTitle: exampleCourse.title,
        submission: {
          submittedContent: 'Уже отправленная работа',
          submissionDate: '2026-01-01T10:00:00Z',
        },
      },
    }),
  );
  await page.goto('/homework/homework-1');
  await page.getByLabel('Ваш ответ', { exact: true }).fill('Новый вариант ответа');
  await expect(page.getByText('Черновик сохранён', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Ваш ответ', { exact: true })).toHaveValue('Новый вариант ответа');
  await expect(page.getByText('Уже отправленная работа', { exact: true })).toBeVisible();
});

test('reporting a gallery work hides it and submits the selected reason', async ({ page }) => {
  await mockApi(page);
  await page.setViewportSize({ width: 320, height: 900 });
  let body: unknown;
  await page.route('**/api/gallery?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'work-1',
          prompt: 'Работа участника',
          result: 'Текст публикации',
          date: '2026-01-01T10:00:00Z',
          userName: 'Участник',
          likes: 0,
        },
      ],
    }),
  );
  await page.route('**/api/gallery/work-1/report', async (route) => {
    body = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { message: 'Reported' } });
  });
  await page.goto('/gallery');
  await page.getByText('Пожаловаться', { exact: true }).click();
  await page.getByLabel('Причина', { exact: true }).selectOption('privacy');
  await page.getByLabel('Комментарий', { exact: true }).fill('На работе есть личные сведения.');
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(audit.violations.map((item) => item.id)).toEqual([]);
  await page.screenshot({ path: '/tmp/clarity-feature-gallery.png', fullPage: true });
  await page.getByRole('button', { name: 'Отправить жалобу' }).click();
  await expect(page.locator('.gallery-card')).toHaveCount(0);
  expect(body).toEqual({ reason: 'privacy', detail: 'На работе есть личные сведения.' });
  await expect(page.getByRole('status').filter({ hasText: 'Жалоба отправлена' })).toBeVisible();
});

test('moderator reviews a report and can restore the blocked work', async ({ page }) => {
  await mockApi(page);
  await page.setViewportSize({ width: 320, height: 900 });
  let blocked = false;
  const report = {
    id: 'report-1',
    imageId: 'work-1',
    reason: 'privacy',
    detail: 'Личные сведения в публикации',
    status: 'PENDING',
    createdAt: '2026-01-01T10:00:00Z',
    image: { prompt: 'Работа участника', result: 'Текст публикации', moderationStatus: 'VISIBLE' },
  };
  await page.route('**/api/admin/reports?*', (route) => {
    const status = new URL(route.request().url()).searchParams.get('status');
    return route.fulfill({
      json: {
        items:
          status === 'PENDING' && blocked
            ? []
            : [
                {
                  ...report,
                  status: blocked ? 'ACTIONED' : 'PENDING',
                  image: { ...report.image, moderationStatus: blocked ? 'BLOCKED' : 'VISIBLE' },
                },
              ],
        nextCursor: null,
      },
    });
  });
  await page.route('**/api/admin/reports/report-1/resolve', async (route) => {
    expect(route.request().postDataJSON()).toEqual({ action: 'hide' });
    blocked = true;
    await route.fulfill({ status: 204 });
  });
  await page.route('**/api/admin/gallery/work-1/restore', async (route) => {
    blocked = false;
    await route.fulfill({ status: 204 });
  });
  await page.goto('/admin/moderation');
  const audit = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
    .analyze();
  expect(audit.violations.map((item) => item.id)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: '/tmp/clarity-feature-moderation.png', fullPage: true });
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Заблокировать публикацию' }).click();
  await expect(page.getByText('Жалоб с таким статусом нет.')).toBeVisible();
  await page.getByLabel('Статус', { exact: true }).selectOption('ACTIONED');
  await page.getByRole('button', { name: 'Восстановить публикацию' }).click();
  await expect.poll(() => blocked).toBe(false);
});
