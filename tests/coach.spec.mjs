import { expect, test } from '@playwright/test';

const appUrl = process.env.APP_URL || 'http://localhost:8877';
const COACH = 'https://raed-hp.tail53bd35.ts.net:8444/search';

async function openCoach(page) {
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const tile = [...document.querySelectorAll('.profile-tile')].find((el) => /Raed/.test(el.textContent));
    if (tile) tile.click();
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    const tab = [...document.querySelectorAll('.tab')].find((el) => /المدرب/.test(el.textContent));
    if (tab) tab.click();
  });
  await page.waitForTimeout(400);
}

async function ask(page, question = 'كم مجموعة لكل عضلة') {
  await page.fill('[data-coach-input]', question);
  await page.click('[data-coach-submit]');
  await page.waitForTimeout(700);
}

test('coach shows the passages themselves, each with its book and page', async ({ page }) => {
  await page.route(COACH, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      status: 'ok',
      results: [
        { text: 'multiple sets (3-5 sets) per muscle group are thought to be required to maximize hypertrophy', work: 'High Frequency Full Body Program', page: 90, score: 0.89 },
        { text: 'When it comes to per-week volume, James Krieger recommends an absolute minimum', work: 'The Hypertrophy Handbook', page: 92, score: 0.87 },
      ],
    }),
  }));
  await openCoach(page);
  await ask(page);

  const passages = page.locator('[data-coach-passage]');
  await expect(passages).toHaveCount(2);
  await expect(passages.first()).toContainText('High Frequency Full Body Program');
  await expect(passages.first()).toContainText('صفحة 90');
  await expect(passages.first()).toContainText('maximize hypertrophy');
  // Book titles are English; h() isolates Latin runs itself, so exactly one <bdi>
  // per run and never a nested pair.
  await expect(page.locator('#page-coach bdi bdi')).toHaveCount(0);
  console.log('COACH_PASSAGES_CITED');
});

test('a no-match is its own state, never an answer and never an error', async ({ page }) => {
  await page.route(COACH, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ status: 'no_match', message: 'no match', results: [] }),
  }));
  await openCoach(page);
  await ask(page, 'سؤال لا إجابة له في الكتب');

  await expect(page.locator('[data-coach-no-match]')).toHaveCount(1);
  await expect(page.locator('[data-coach-passage]')).toHaveCount(0);
  await expect(page.locator('[data-coach-error]')).toHaveCount(0);
  await expect(page.locator('#page-coach')).toContainText('لا يوجد في كتبك');
  console.log('COACH_NO_MATCH_EXPLICIT');
});

test('an unreachable library says so; it never renders as an empty answer', async ({ page }) => {
  await page.route(COACH, (route) => route.abort('failed'));
  await openCoach(page);
  await ask(page);

  await expect(page.locator('[data-coach-error]')).toHaveCount(1);
  await expect(page.locator('[data-coach-passage]')).toHaveCount(0);
  // The distinction that matters: "cannot reach" must NOT read like "nothing found".
  await expect(page.locator('[data-coach-no-match]')).toHaveCount(0);
  await expect(page.locator('#page-coach')).toContainText('Tailscale');
  console.log('COACH_OFFLINE_DISTINGUISHED');
});

test('the passage count agrees in Arabic: singular, dual, then plural', async ({ page }) => {
  // "2 مقاطع" is wrong Arabic. Two takes the dual. English pluralisation rules do
  // not survive translation, and this string is rendered on every answer.
  const cases = [[1, 'مقطع واحد'], [2, 'مقطعان'], [3, '3 مقاطع'], [5, '5 مقاطع']];
  for (const [count, expected] of cases) {
    await page.route(COACH, (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ok',
        results: Array.from({ length: count }, (_, i) => ({ text: `p${i}`, work: 'The Hypertrophy Handbook', page: 90 + i, score: 0.8 })),
      }),
    }));
    await openCoach(page);
    await ask(page);
    await expect(page.locator('[data-coach-count]')).toHaveText(`${expected} من كتبك`);
    await page.unroute(COACH);
  }
  console.log('COACH_ARABIC_COUNT_AGREES');
});

test('the coach never generates prose of its own', async ({ page }) => {
  let sentBody = null;
  await page.route(COACH, (route) => {
    sentBody = JSON.parse(route.request().postData() || '{}');
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ status: 'ok', results: [{ text: 'RPE of 5-7 is recommended', work: 'Fundamentals Hypertrophy Program', page: 85, score: 0.76 }] }),
    });
  });
  await openCoach(page);
  await ask(page, 'ما شدة التمرين المناسبة للعائد');

  // Every word of the passage on screen came from the response. Nothing is
  // summarised, rephrased, or concluded — the whole point of the feature.
  const rendered = await page.locator('.coach-text').first().textContent();
  expect(rendered.trim()).toBe('RPE of 5-7 is recommended');
  expect(sentBody).toMatchObject({ question: 'ما شدة التمرين المناسبة للعائد', top_k: 5, min_score: 0.5 });
  // No prompt, no system message, no model name — this is a search, not a chat.
  expect(Object.keys(sentBody).sort()).toEqual(['min_score', 'question', 'top_k']);
  await expect(page.locator('#page-coach')).toContainText('لا شيء هنا من تأليف التطبيق');
  console.log('COACH_RETRIEVAL_ONLY');
});

test('the same passage from two editions of one book is shown once', async ({ page }) => {
  // Raed's library keeps file A and file B of two Nippard programmes on purpose.
  // Retrieval returns both, identical text on the same page, stacked. Reading the
  // same paragraph twice makes the answer look padded and hides the third result.
  await page.route(COACH, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      status: 'ok',
      results: [
        { text: 'When it comes to per-week volume, James Krieger recommends an absolute minimum', work: 'Intermediate-Advanced PPL Hypertrophy Program (file B)', page: 92, score: 0.826 },
        { text: 'When it comes to per-week volume,  James  Krieger recommends an absolute minimum', work: 'Intermediate-Advanced PPL Hypertrophy Program (file A)', page: 92, score: 0.826 },
        { text: 'hitting a muscle twice per week with the same amount of volume', work: 'Upper Lower Size and Strength Program', page: 69, score: 0.71 },
      ],
    }),
  }));
  await openCoach(page);
  await ask(page);

  await expect(page.locator('[data-coach-passage]')).toHaveCount(2);
  // The kept one is the highest-scoring, and the distinct third survives.
  await expect(page.locator('[data-coach-passage]').first()).toContainText('file B');
  await expect(page.locator('[data-coach-passage]').nth(1)).toContainText('Upper Lower Size and Strength Program');
  await expect(page.locator('[data-coach-count]')).toHaveText('مقطعان من كتبك');
  console.log('COACH_DEDUPES_EDITIONS');
});
