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
    } else if (path === '/api/ai/status') {
      data = { enabled: false, requiresConsent: false };
    } else if (path === '/api/analytics/correlations') {
      data = { insights: [] };
    } else if (path === '/api/org/stats') {
      data = { orgName: 'Проверка', memberCount: 0, riskStats: [], heatmapData: {}, trends: [] };
    }
    await route.fulfill({ status: failure && path !== '/api/profile' ? 503 : 200, json: data });
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
];
for (const theme of ['light', 'dark']) {
  for (const width of [320, 768, 1440]) {
    test(`${theme} ${width}px: routes reflow and expose accessible controls`, async ({ page }) => {
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
  await expect(page.getByRole('alert')).toContainText('Не удалось сохранить');
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
  await page.route('**/api/gallery', (route) =>
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
