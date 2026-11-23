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
  await page.route(/\/api\/profile(?:\?[^/]*)?$/, (route) => {
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
  const emptyDraft = { title: '', note: '', mode: 'paper', attachmentKind: null, image: null };
  let draft = { version: 0, mutationId: null, snapshot: emptyDraft };
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
    if (path === '/api/practices/drafts') {
      return route.fulfill({
        json:
          draft.snapshot.note || draft.snapshot.image
            ? [{ practiceId: 'two-lines', updatedAt: date }]
            : [],
      });
    }
    if (path === '/api/practices/drafts/two-lines') {
      if (req.method() === 'GET') return route.fulfill({ json: draft });
      const data = req.postDataJSON();
      expect(data.version).toBe(draft.version);
      draft = {
        version: data.version + 1,
        mutationId: data.mutationId,
        snapshot: data.snapshot || emptyDraft,
      };
      return route.fulfill({ json: { version: draft.version } });
    }
    if (path === '/api/practices/drafts/two-lines/finalize') {
      const data = req.postDataJSON();
      expect(data.version).toBe(draft.version);
      expect(draft.snapshot.image).toMatchObject({ mimeType: 'image/png' });
      work = {
        id: data.id,
        title: draft.snapshot.title,
        note: draft.snapshot.note,
        hasImage: true,
        createdAt: date,
        reflections: [],
      };
      draft = { version: draft.version + 1, mutationId: null, snapshot: emptyDraft };
      return route.fulfill({ status: 201, json: work });
    }
    if (path === '/api/practices/works') return route.fulfill({ json: work ? [work] : [] });
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
  await expect(page.getByText('Черновик сохранён', { exact: true })).toBeVisible({
    timeout: 25000,
  });
  await page.goto('/');
  await page.getByRole('link', { name: 'Продолжить практику' }).click();
  await expect(page.getByRole('radio', { name: 'На холсте' })).toBeChecked();
  await expect(page.getByRole('button', { name: 'Скачать рисунок' })).toBeEnabled();
  const existingDrawing = await page
    .locator('canvas')
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
  await page.locator('canvas').click({ position: { x: 120, y: 35 } });
  await expect
    .poll(() => page.locator('canvas').evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL()))
    .not.toBe(existingDrawing);
  await page.getByText('Сохранить рисунок или заметку', { exact: true }).click();
  await expect(page.getByLabel('Подпись к работе')).toHaveValue('Личная исходная подпись');
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
  let acknowledged = false;
  let recommended = false;
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
    if (path.endsWith('/meeting-one/acknowledgement')) {
      acknowledged = true;
      return route.fulfill({ json: { acknowledgedAt: date } });
    }
    if (path.endsWith('/meeting-one/recommendation')) {
      expect(route.request().postDataJSON()).toEqual({ practiceId: 'two-lines' });
      recommended = true;
      return route.fulfill({ json: { practiceId: 'two-lines' } });
    }
    if (path === '/api/practices/catalog') return route.fulfill({ json: practiceCatalog });
    if (path === '/api/therapist/practice-shares/meeting-one') {
      expect(route.request().headers()['x-expected-user-id']).toBe(therapistId);
      if (!available) return route.fulfill({ status: 404, json: {} });
      return route.fulfill({
        json: {
          acknowledgedAt: acknowledged ? date : null,
          allowRecommendation: true,
          recommendedPracticeId: recommended ? 'two-lines' : null,
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
  await page.getByRole('button', { name: 'Отметить как просмотренную' }).click();
  await expect(page.getByText('Подборка отмечена как просмотренная.')).toBeVisible();
  await page.getByLabel('Практика к следующей встрече').selectOption('two-lines');
  await page.getByRole('button', { name: 'Предложить практику' }).click();
  await expect(page.getByText('Практика предложена.')).toBeVisible();
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

test('a guest draws and downloads ink without sending a drawing or requesting an account', async ({
  page,
}) => {
  const requests: string[] = [];
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    requests.push(path);
    return route.fulfill({ json: path === '/api/practices/catalog' ? practiceCatalog : {} });
  });
  await page.goto('/practice-demo');
  const canvas = page.locator('canvas');
  await canvas.click({ position: { x: 50, y: 55 } });
  const hasInk = await canvas.evaluate((element: HTMLCanvasElement) =>
    [...element.getContext('2d')!.getImageData(0, 0, element.width, element.height).data].some(
      (value, index) => index % 4 !== 3 && value < 100,
    ),
  );
  expect(hasInk).toBe(true);
  const downloaded = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать рисунок' }).click();
  expect((await downloaded).suggestedFilename()).toBe('two-lines.png');
  expect(requests).toEqual(['/api/practices/catalog']);
});

test('the catalog restores the selected intention from an exercise link', async ({ page }) => {
  await page.route('**/api/**', (route) => {
    const path = new URL(route.request().url()).pathname;
    const json =
      path === '/api/profile'
        ? { id: userId, role: 'USER' }
        : path === '/api/practices/catalog'
          ? practiceCatalog
          : path === '/api/practices/drafts/day-frame'
            ? {
                version: 0,
                mutationId: null,
                snapshot: { title: '', note: '', mode: 'paper', attachmentKind: null, image: null },
              }
            : [];
    return route.fulfill({ json });
  });
  await page.goto('/practices');
  await page.getByLabel('Чего хочется сейчас').selectOption('notice-the-day');
  const list = page.getByRole('region', { name: 'Одно упражнение' });
  await expect(list.getByRole('link')).toHaveCount(2);
  await list.getByRole('link', { name: /Кадр из дня/ }).click();
  await page.getByRole('link', { name: 'Все практики' }).click();
  await expect(page.getByLabel('Чего хочется сейчас')).toHaveValue('notice-the-day');
  await page.getByLabel('Материалы').selectOption('collage');
  await expect(page.getByRole('button', { name: 'Сбросить фильтры' })).toBeVisible();
});

test('guest strokes preserve other ink on erasure and encode only on download', async ({
  page,
}) => {
  await page.route('**/api/practices/catalog', (route) => route.fulfill({ json: practiceCatalog }));
  await page.addInitScript(() => {
    const encode = HTMLCanvasElement.prototype.toDataURL;
    const counts = { png: 0 };
    Object.defineProperty(window, 'testDrawingCounts', { value: counts });
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      counts.png++;
      return encode.apply(this, args);
    };
  });
  await page.goto('/practice-demo');
  const canvas = page.locator('canvas');
  const first = { x: 36, y: 30 };
  const second = { x: 76, y: 70 };
  await canvas.click({ position: first });
  await canvas.click({ position: second });
  const download = page.getByRole('button', { name: 'Скачать рисунок' });
  await expect(download).toBeEnabled();
  await page.getByRole('button', { name: 'Ластик' }).click();
  await canvas.click({ position: first });
  await expect(download).toBeEnabled();
  await canvas.click({ position: second });
  await expect(download).toBeDisabled();
  await page.getByRole('button', { name: 'Кисть' }).click();
  await page.locator('input[type=color]').fill('#ffffff');
  await canvas.click({ position: second });
  await expect(download).toBeDisabled();
  await page.locator('input[type=color]').fill('#000000');
  await canvas.click({ position: first });
  const counts = () => page.evaluate(() => Reflect.get(window, 'testDrawingCounts').png as number);
  expect(await counts()).toBe(0);
  const event = page.waitForEvent('download');
  await download.click();
  await event;
  expect(await counts()).toBe(1);
});

test('a failed PNG encode keeps the pending canvas and retries without erasing it', async ({
  page,
}) => {
  let writes = 0;
  await page.addInitScript(() => {
    const encode = HTMLCanvasElement.prototype.toDataURL;
    let first = true;
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      if (first) {
        first = false;
        return 'data:,';
      }
      return encode.apply(this, args);
    };
  });
  await page.route('**/api/**', (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/profile') return route.fulfill({ json: { id: userId, role: 'USER' } });
    if (path === '/api/practices/catalog') return route.fulfill({ json: practiceCatalog });
    if (path === '/api/practices/drafts/two-lines') {
      if (request.method() === 'PUT') {
        writes++;
        expect(request.postDataJSON().snapshot).toMatchObject({
          attachmentKind: 'canvas',
          image: { mimeType: 'image/png', base64: expect.any(String) },
        });
        return route.fulfill({ json: { version: 1 } });
      }
      return route.fulfill({
        json: {
          version: 0,
          mutationId: null,
          snapshot: { title: '', note: '', mode: 'paper', attachmentKind: null, image: null },
        },
      });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto('/practices/two-lines');
  await page.getByRole('radio', { name: 'На холсте' }).check();
  await page.locator('canvas').click({ position: { x: 25, y: 40 } });
  await expect(page.getByRole('alert')).toContainText('Не удалось подготовить рисунок');
  expect(writes).toBe(0);
  await page.getByRole('button', { name: 'Повторить автосохранение' }).click();
  await expect(page.getByText('Черновик сохранён', { exact: true })).toBeVisible();
  expect(writes).toBe(1);
});

test('secondary touches do not reset the active stroke or the remaining ink', async ({ page }) => {
  await page.route('**/api/practices/catalog', (route) => route.fulfill({ json: practiceCatalog }));
  await page.goto('/practice-demo');
  const canvas = page.locator('canvas');
  await canvas.evaluate((element: HTMLCanvasElement) => {
    const bounds = element.getBoundingClientRect();
    const touch = (identifier: number, x: number, y: number) =>
      new Touch({ identifier, target: element, clientX: bounds.left + x, clientY: bounds.top + y });
    const send = (type: string, touches: Touch[], changedTouches: Touch[]) =>
      element.dispatchEvent(new TouchEvent(type, { touches, changedTouches, bubbles: true }));
    const firstStart = touch(1, 35, 40);
    const firstEnd = touch(1, 130, 40);
    const second = touch(2, 165, 65);
    send('touchstart', [firstStart], [firstStart]);
    send('touchmove', [firstEnd], [firstEnd]);
    send('touchstart', [firstEnd, second], [second]);
    send('touchend', [firstEnd], [second]);
    send('touchend', [], [firstEnd]);
  });
  const download = page.getByRole('button', { name: 'Скачать рисунок' });
  await expect(download).toBeEnabled();
  await page.getByRole('button', { name: 'Ластик' }).click();
  await canvas.click({ position: { x: 130, y: 40 } });
  await expect(download).toBeEnabled();
});
