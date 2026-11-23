import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { practiceCatalog } from '../../backend/src/services/practiceCatalog';

const userId = 'practice-owner';
const therapistId = 'practice-specialist';
const completed: string[] = [];
const date = '2026-11-23T09:00:00.000Z';
const thumbnail =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9WlEkYQAAAAASUVORK5CYII=';

test('a guest can browse and print the whole A4 deck or a single card', async ({ page }) => {
  let authRequest = false;
  await page.route('**/api/profile', (route) => {
    authRequest = true;
    return route.fulfill({ status: 401, json: {} });
  });
  await page.route('**/api/practices/catalog', (route) => route.fulfill({ json: practiceCatalog }));
  await page.addInitScript(() => {
    window.print = () => {
      document.documentElement.dataset.printCalled = 'true';
    };
  });
  await page.goto('/practice-cards');
  await expect(page.getByRole('heading', { name: 'Карточки для печати' })).toBeVisible();
  await expect(page.getByRole('article')).toHaveCount(5);
  await page.getByRole('button', { name: 'Печатать все карточки' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-print-called', 'true');
  const pdf = await page.pdf({ preferCSSPageSize: true });
  expect(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)).toHaveLength(5);

  await page
    .getByRole('article')
    .filter({ hasText: 'Две линии' })
    .getByRole('link', { name: 'Подготовить карточку к печати' })
    .click();
  await expect(page).toHaveURL(/\/practice-cards\/two-lines$/);
  await expect(page.getByRole('article')).toHaveCount(1);
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: 'Печатать карточку' })).toBeFocused();
  await page.emulateMedia({ media: 'print' });
  await expect(page.getByRole('button', { name: 'Печатать карточку' })).toBeHidden();
  const single = await page.pdf({ preferCSSPageSize: true });
  expect(single.toString('latin1').match(/\/Type\s*\/Page\b/g)).toHaveLength(1);
  expect(authRequest).toBe(false);
});

test('complete a series step, download a drawing and share only the selected album caption', async ({
  page,
}) => {
  type AlbumWork = {
    id: string;
    title: string;
    note: string;
    hasImage: boolean;
    createdAt: string;
    reflections: Array<{ id: string; content: string; createdAt: string }>;
  };
  const practiceProgress = [...completed];
  let work: AlbumWork | undefined;
  let shared: { id: string; items: unknown[] } | undefined;
  let providerCalls = 0;
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const path = new URL(req.url()).pathname;
    if (
      (path.startsWith('/api/practices/') && path !== '/api/practices/catalog') ||
      path === '/api/therapists'
    )
      expect(req.headers()['x-expected-user-id']).toBe(userId);
    if (path === '/api/profile')
      return route.fulfill({ json: { id: userId, name: 'Автор', role: 'USER' } });
    if (path === '/api/practices/catalog') return route.fulfill({ json: practiceCatalog });
    if (path === '/api/practices/progress') return route.fulfill({ json: practiceProgress });
    if (path.startsWith('/api/practices/progress/')) {
      const id = path.split('/').pop()!;
      if (!practiceProgress.includes(id)) practiceProgress.push(id);
      return route.fulfill({ status: 204 });
    }
    if (path === '/api/practices/works') {
      if (req.method() === 'GET') return route.fulfill({ json: work ? [work] : [] });
      const data = req.postDataJSON();
      expect(data.image.mimeType).toBe('image/png');
      expect(data.practiceId).toBe('two-lines');
      work = {
        id: data.id,
        title: data.title,
        note: data.note,
        hasImage: true,
        createdAt: date,
        reflections: [],
      };
      return route.fulfill({ status: 201, json: work });
    }
    if (path.endsWith('/image') && path.startsWith('/api/practices/works/'))
      return route.fulfill({ body: Buffer.from(thumbnail, 'base64'), contentType: 'image/png' });
    if (path.endsWith('/reflections')) {
      const note = { ...req.postDataJSON(), createdAt: date };
      work?.reflections.push(note);
      return route.fulfill({ status: 201, json: note });
    }
    if (path === '/api/therapists')
      return route.fulfill({ json: [{ id: therapistId, name: 'Мария' }] });
    if (path === '/api/practices/shares') {
      if (req.method() === 'POST') {
        shared = req.postDataJSON();
        return route.fulfill({ status: 201, json: { id: shared?.id } });
      }
      return route.fulfill({
        json: shared
          ? [
              {
                id: shared.id,
                therapistId,
                therapistName: 'Мария',
                items: [{ title: 'Две линии' }],
                createdAt: date,
              },
            ]
          : [],
      });
    }
    if (path.startsWith('/api/practices/shares/') && req.method() === 'DELETE') {
      expect(path).toBe(`/api/practices/shares/${shared?.id}`);
      shared = undefined;
      return route.fulfill({ status: 204 });
    }
    if (path.startsWith('/api/analyze-image') || (path === '/api/diary' && req.method() === 'POST'))
      providerCalls++;
    return route.fulfill({ json: [] });
  });

  await page.goto('/');
  await page.getByRole('link', { name: 'Начать творческую паузу' }).click();
  await page
    .getByRole('article')
    .filter({ hasText: 'От линии к коллажу' })
    .getByRole('link', { name: 'Две линии' })
    .click();
  await expect(page.getByRole('heading', { name: 'Две линии' })).toBeVisible();
  await page.getByRole('button', { name: 'Завершить практику' }).click();
  await expect(page.getByText('Выполнено', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Следующая практика' })).toHaveAttribute(
    'href',
    /three-shapes/,
  );

  await page.getByRole('radio', { name: 'На холсте' }).check();
  const box = await page.locator('canvas').boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + 20, box!.y + 20);
  await page.mouse.down();
  await page.mouse.move(box!.x + 85, box!.y + 65, { steps: 6 });
  await page.mouse.up();
  const downloads = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать рисунок' }).click();
  expect((await downloads).suggestedFilename()).toBe('two-lines.png');

  await page.getByText('Сохранить рисунок или заметку', { exact: true }).click();
  await page.getByLabel('Подпись к работе').fill('Личная исходная подпись');
  await page.getByRole('button', { name: 'Сохранить работу' }).click();
  await page.getByRole('link', { name: 'Открыть альбом' }).click();
  await expect(page.getByText('Личная исходная подпись', { exact: false })).toBeVisible();
  await page.getByLabel('Новая подпись').fill('Подпись для встречи');
  await page.getByRole('button', { name: 'Добавить подпись' }).click();
  await expect(page.getByText('Подпись для встречи', { exact: false })).toBeVisible();
  await page.getByRole('button', { name: 'Собрать подборку' }).click();
  await page.getByLabel('Специалист').selectOption(therapistId);
  await page.getByRole('checkbox', { name: /Две линии/ }).check();
  await expect(page.getByRole('checkbox', { name: 'Рисунок', exact: true })).not.toBeChecked();
  await page.getByRole('checkbox', { name: /Подпись для встречи/ }).check();
  await page.getByRole('button', { name: 'Проверить подборку' }).click();
  await expect(page.getByRole('heading', { name: 'Что увидит специалист' })).toBeFocused();
  await expect(page.getByText('Личная исходная подпись')).toHaveCount(0);
  await expect(page.getByText('Подпись для встречи')).toBeVisible();
  await page.getByRole('button', { name: 'Поделиться подборкой' }).click();
  await expect(page.getByText('Специалист получил доступ к подборке.')).toBeVisible();
  expect(shared?.items).toEqual([
    {
      workId: work?.id,
      includeImage: false,
      includeNote: false,
      reflectionIds: [work?.reflections[0].id],
    },
  ]);
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Отозвать доступ' }).click();
  await expect(page.getByText('Доступ к подборке отозван.')).toBeVisible();
  expect(shared).toBeUndefined();
  await page.goto('/practices');
  await expect(page.getByText('1 из 3 выполнено')).toBeVisible();
  expect(providerCalls).toBe(0);
});

test('the specialist rechecks a selection before opening it and on tab focus', async ({ page }) => {
  let available = true;
  await page.route('**/api/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/profile')
      return route.fulfill({ json: { id: therapistId, name: 'Мария', role: 'THERAPIST' } });
    if (path === '/api/therapist/practice-shares') {
      expect(route.request().headers()['x-expected-user-id']).toBe(therapistId);
      return route.fulfill({
        json: {
          nextCursor: null,
          items: available
            ? [
                {
                  id: 'meeting-one',
                  ownerName: 'Автор',
                  createdAt: date,
                  workCount: 1,
                },
              ]
            : [],
        },
      });
    }
    if (path === '/api/therapist/practice-shares/meeting-one') {
      expect(route.request().headers()['x-expected-user-id']).toBe(therapistId);
      if (!available) return route.fulfill({ status: 404, json: {} });
      return route.fulfill({
        json: {
          items: [
            {
              workId: 'drawing-1',
              title: 'Работа на бумаге',
              note: null,
              reflections: [{ content: 'Выбранная подпись', createdAt: date }],
              includesImage: false,
            },
          ],
        },
      });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto('/therapist');
  await page.getByRole('link', { name: 'Подборки к встрече' }).click();
  await expect(page.getByRole('button', { name: /Автор/ })).toBeVisible();
  available = false;
  await page.getByRole('button', { name: /Автор/ }).click();
  await expect(page.getByText('Доступ к подборке закрыт.')).toBeVisible();
  await expect(page.getByText('Выбранная подпись')).toHaveCount(0);
  available = true;
  await page.getByRole('button', { name: 'Обновить подборки' }).click();
  await page.getByRole('button', { name: /Автор/ }).click();
  await expect(page.getByText('Выбранная подпись')).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  available = false;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('Доступ к подборке закрыт.')).toBeVisible();
  await expect(page.getByText('Выбранная подпись')).toHaveCount(0);
});

test('a background album clears the previous account when it receives focus', async ({ page }) => {
  let activeId = userId;
  const nextId = 'practice-new-owner';
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path === '/api/profile')
      return route.fulfill({ json: { id: activeId, name: 'Участник', role: 'USER' } });
    if (path === '/api/practices/session') {
      if (route.request().headers()['x-expected-user-id'] !== activeId)
        return route.fulfill({ status: 409, json: { code: 'SESSION_CHANGED' } });
      return route.fulfill({ status: 204 });
    }
    if (path === '/api/practices/works' && activeId === userId)
      return route.fulfill({
        json: [
          {
            id: 'old-work',
            title: 'Работа первого аккаунта',
            note: 'Приватная подпись первого аккаунта',
            createdAt: date,
            hasImage: false,
            reflections: [],
          },
        ],
      });
    return route.fulfill({ json: [] });
  });
  await page.goto('/practice-album');
  await expect(page.getByText('Приватная подпись первого аккаунта')).toBeVisible();
  activeId = nextId;
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect(page.getByText('Приватная подпись первого аккаунта')).toHaveCount(0);
  await expect(page.getByText('Здесь появятся ваши рисунки и заметки.')).toBeVisible();
});
