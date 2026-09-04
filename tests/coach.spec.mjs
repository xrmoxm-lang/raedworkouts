import { expect, test } from '@playwright/test';

const appUrl = process.env.APP_URL || 'http://localhost:8877';
// The coach moved off :8444 — Tailscale Funnel serves only 443, 8443 and 10000,
// so :8444 answered nobody from the internet and the coach needed Tailscale
// switched on. It rides the 443 funnel on /coach now, and the path is /answer:
// the server runs the same retrieval and then writes the answer from what it
// found, so the OpenAI key never reaches this page.
const COACH = 'https://raed-hp.tail53bd35.ts.net/coach/answer';

const answer = (text, used) => ({ status: 'ok', answered: true, text, used, model: 'gpt-5.6-luna' });
const refusal = (text) => ({ status: 'ok', answered: false, text, used: [] });

async function openCoach(page) {
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const tile = [...document.querySelectorAll('.profile-tile')].find((el) => /Raed/.test(el.textContent));
    if (tile) tile.click();
  });
  await page.waitForTimeout(600);
  // Selecting the profile seeds a running session, so the coach appends the
  // exercise name to every question. That is a real feature with its own spec
  // (coach-context.spec.mjs); here it would silently rewrite what these tests
  // think they sent. Clear it in storage and reload — app.js is a module, so
  // the state is not reachable on window, but its key is.
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (!/^raedworkouts\..*\.state\.v1$/.test(key)) continue;
      try {
        const parsed = JSON.parse(localStorage.getItem(key));
        if (parsed && typeof parsed === 'object') {
          parsed.active_session = null;
          localStorage.setItem(key, JSON.stringify(parsed));
        }
      } catch (_) { /* a value we cannot parse is not a session */ }
    }
  });
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const tab = [...document.querySelectorAll('.tab')].find((el) => /المدرب/.test(el.textContent));
    if (tab) tab.click();
  });
  await page.waitForTimeout(400);
  // The band is the visible proof the session is gone; without it the tests
  // below would pass on the wrong question and nobody would know.
  await expect(page.locator('[data-coach-context]')).toHaveCount(0);
}

async function ask(page, question = 'كم مجموعة لكل عضلة') {
  await page.fill('[data-coach-input]', question);
  await page.click('[data-coach-submit]');
  await page.waitForTimeout(700);
}

test('the answer is shown above the passages it was built from', async ({ page }) => {
  await page.route(COACH, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      status: 'ok',
      answer: answer('استهدف 10 مجموعات على الأقل لكل عضلة أسبوعياً. (The Hypertrophy Handbook، صفحة ٩٢)', [1]),
      results: [
        { text: 'multiple sets (3-5 sets) per muscle group are thought to be required to maximize hypertrophy', work: 'High Frequency Full Body Program', page: 90, score: 0.89 },
        { text: 'When it comes to per-week volume, James Krieger recommends an absolute minimum of 10 sets', work: 'The Hypertrophy Handbook', page: 92, score: 0.87 },
      ],
    }),
  }));
  await openCoach(page);
  await ask(page);

  await expect(page.locator('[data-coach-answer]')).toHaveCount(1);
  await expect(page.locator('[data-coach-answer]')).toContainText('10 مجموعات');
  // Cited first and marked; the uncited one is collapsed behind a disclosure.
  await expect(page.locator('[data-coach-cited]')).toHaveCount(1);
  await expect(page.locator('[data-coach-cited]')).toContainText('The Hypertrophy Handbook');
  await expect(page.locator('[data-coach-cited]')).toContainText('صفحة 92');
  await expect(page.locator('[data-coach-more]')).toHaveCount(1);
  // Book titles are English; h() isolates Latin runs itself, so exactly one <bdi>
  // per run and never a nested pair.
  await expect(page.locator('#page-coach bdi bdi')).toHaveCount(0);
  console.log('COACH_ANSWER_OVER_SOURCES');
});

test('"the books do not cover this" never renders as an answer', async ({ page }) => {
  // The single most important guarantee in the feature. Retrieval always returns
  // its top matches, whatever was asked — so on an off-topic question the model
  // is handed five real passages about something else. If a refusal rendered in
  // the answer slot with confident-looking sources underneath, the coach would
  // be doing exactly what it was built not to do.
  await page.route(COACH, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      status: 'ok',
      answer: refusal('كتب رائد لا تغطي وصفة كبسة اللحم.'),
      results: [
        { text: 'you would end up consuming an additional 109 grams of carbohydrates from quinoa', work: 'The Ultimate Guide to Body Recomposition', page: 140, score: 0.51 },
      ],
    }),
  }));
  await openCoach(page);
  await ask(page, 'وش أفضل وصفة كبسة لحم؟');

  await expect(page.locator('[data-coach-unanswered]')).toHaveCount(1);
  await expect(page.locator('[data-coach-answer]')).toHaveCount(0);
  await expect(page.locator('#page-coach')).toContainText('ليس في كتبك');
  // No passage is marked as a source, because none was used.
  await expect(page.locator('[data-coach-cited]')).toHaveCount(0);
  console.log('COACH_REFUSAL_NOT_AN_ANSWER');
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
  await expect(page.locator('[data-coach-answer]')).toHaveCount(0);
  await expect(page.locator('[data-coach-error]')).toHaveCount(0);
  await expect(page.locator('#page-coach')).toContainText('لا يوجد في كتبك');
  console.log('COACH_NO_MATCH_EXPLICIT');
});

test('a failed written answer still hands over the passages', async ({ page }) => {
  // The passages are the product; the written answer sits on top of them. A
  // timeout at OpenAI must degrade to what the coach did before, not to nothing.
  await page.route(COACH, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      status: 'ok',
      answer: { status: 'failed', error: 'TimeoutError' },
      results: [
        { text: 'RPE of 5-7 is recommended', work: 'Fundamentals Hypertrophy Program', page: 85, score: 0.76 },
      ],
    }),
  }));
  await openCoach(page);
  await ask(page);

  await expect(page.locator('[data-coach-answer-off]')).toHaveCount(1);
  await expect(page.locator('[data-coach-passage]')).toHaveCount(1);
  await expect(page.locator('[data-coach-passage]')).toContainText('RPE of 5-7');
  console.log('COACH_DEGRADES_TO_PASSAGES');
});

test('an unreachable library says so; it never renders as an empty answer', async ({ page }) => {
  await page.route(COACH, (route) => route.abort('failed'));
  await openCoach(page);
  await ask(page);

  await expect(page.locator('[data-coach-error]')).toHaveCount(1);
  await expect(page.locator('[data-coach-passage]')).toHaveCount(0);
  // The distinction that matters: "cannot reach" must NOT read like "nothing found".
  await expect(page.locator('[data-coach-no-match]')).toHaveCount(0);
  // The copy no longer names Tailscale: the endpoint works without it now, and
  // telling him to connect would send him chasing the wrong fix.
  await expect(page.locator('#page-coach')).toContainText('لا يستجيب');
  console.log('COACH_OFFLINE_DISTINGUISHED');
});

test('the passage count agrees in Arabic: singular, dual, then plural', async ({ page }) => {
  // "2 مقاطع" is wrong Arabic. Two takes the dual. English pluralisation rules do
  // not survive translation, and this string is rendered whenever the answer
  // cites nothing in particular.
  const cases = [[1, 'مقطع واحد'], [2, 'مقطعان'], [3, '3 مقاطع'], [5, '5 مقاطع']];
  for (const [count, expected] of cases) {
    await page.route(COACH, (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ok',
        answer: { status: 'unconfigured' },
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

test('nothing about the answer is invented on this page', async ({ page }) => {
  let sentBody = null;
  await page.route(COACH, (route) => {
    sentBody = JSON.parse(route.request().postData() || '{}');
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ok',
        answer: answer('الشدة المناسبة RPE من 5 إلى 7. [1]', [0]),
        results: [{ text: 'RPE of 5-7 is recommended', work: 'Fundamentals Hypertrophy Program', page: 85, score: 0.76 }],
      }),
    });
  });
  await openCoach(page);
  await ask(page, 'ما شدة التمرين المناسبة للعائد');

  // The answer on screen is the server's, character for character apart from the
  // citation markers being turned into elements. The app does not summarise,
  // trim or re-word it, so what he reads is what was grounded.
  const rendered = await page.locator('.coach-answer-text').first().textContent();
  expect(rendered.trim()).toBe('الشدة المناسبة RPE من 5 إلى 7. 1');
  // And the passage under it is verbatim too.
  const passage = await page.locator('.coach-text').first().textContent();
  expect(passage.trim()).toBe('RPE of 5-7 is recommended');
  // No prompt, no system message, no model name, no API key leaves this page.
  // The question, how many passages, and the floor — nothing else. With no
  // session running there is no context field either.
  expect(sentBody).toMatchObject({
    question: 'ما شدة التمرين المناسبة للعائد', top_k: 10, min_score: 0.35, allow_web: true,
  });
  // allow_web is the app's permission for the server to leave the library. It
  // must be an explicit field, not a server default, so the internet can never
  // answer a request that did not ask for it.
  expect(Object.keys(sentBody).sort()).toEqual(['allow_web', 'min_score', 'question', 'top_k']);
  await expect(page.locator('#page-coach')).toContainText('مكتوبة من المقاطع بالأسفل');
  console.log('COACH_GROUNDED_VERBATIM');
});

test('the Arabic translation is shown, with the English original one tap away', async ({ page }) => {
  // 3,265 passages were translated and then sat unused in the database while the
  // coach served English only. The translation is machine-made, so it is labelled
  // as such and the original stays reachable.
  await page.route(COACH, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      status: 'ok',
      answer: answer('الراحة بين المجموعات من دقيقتين إلى ثلاث. (ACSM، صفحة ١٣)', [0]),
      results: [{
        text: 'eight to twenty repetitions per set, 2-3 min rest between sets',
        text_ar: 'من ثمانية إلى عشرين تكراراً لكل مجموعة، وراحة من دقيقتين إلى ثلاث بين المجموعات',
        work: 'ACSM Position Stand', page: 13, score: 0.61,
      }],
    }),
  }));
  await openCoach(page);
  await ask(page, 'كم راحة بين المجموعات؟');

  await expect(page.locator('.coach-text').first()).toContainText('راحة من دقيقتين');
  await expect(page.locator('[data-coach-passage]').first()).toContainText('ترجمة آلية');
  await page.click('[data-coach-lang="0"]');
  await page.waitForTimeout(200);
  await expect(page.locator('.coach-text').first()).toContainText('2-3 min rest between sets');
  console.log('COACH_TRANSLATION_WITH_ORIGINAL');
});

test('the same passage from two editions of one book is shown once, and citations follow it', async ({ page }) => {
  // Raed's library keeps file A and file B of two Nippard programmes on purpose.
  // Retrieval returns both, identical text on the same page. Deduping them shifts
  // every later index, and the answer cites passages BY INDEX — so a citation of
  // passage 2 has to land on the passage that used to be 2, not on whatever slid
  // into that slot.
  await page.route(COACH, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      status: 'ok',
      answer: answer('استهدف مرتين لكل عضلة أسبوعياً. [3]', [2]),
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
  // Server index 2 became index 1 after the duplicate was dropped. The cited
  // passage must still be the Upper Lower one, not the Krieger duplicate.
  await expect(page.locator('[data-coach-cited]')).toHaveCount(1);
  await expect(page.locator('[data-coach-cited]')).toContainText('Upper Lower Size and Strength Program');
  // The inline marker was renumbered with it: [3] became [2], and the card it
  // points at shows 2. Leaving the marker at 3 would point past the list.
  await expect(page.locator('.coach-answer-text .coach-cite')).toHaveText('2');
  await expect(page.locator('[data-coach-cited] .coach-cite')).toHaveText('2');
  console.log('COACH_DEDUPE_REMAPS_CITATIONS');
});

test('a long passage is clipped until he asks for it, and the remainder count agrees', async ({ page }) => {
  // A passage is a 900-character window out of a book, and some are transcribed
  // programme tables. Printed in full under a three-line answer they bury it,
  // which is the opposite of the less-scrolling he asked for.
  const wall = 'الأسبوع 1 التمرين مجموعات الإحماء التكرارات الحمل الراحة RPE '.repeat(12);
  await page.route(COACH, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      status: 'ok',
      answer: answer('الراحة بين المجموعات 2–3 دقائق. [1]', [0]),
      results: [
        { text: 'rest 2-3 min', text_ar: wall, work: 'ACSM Position Stand', page: 13, score: 0.6 },
        { text: 'a', work: 'B1', page: 1, score: 0.5 },
        { text: 'b', work: 'B2', page: 2, score: 0.5 },
      ],
    }),
  }));
  await openCoach(page);
  await ask(page);

  const text = page.locator('[data-coach-cited] .coach-text');
  await expect(text).toHaveClass(/clipped/);
  await page.click('[data-coach-expand="0"]');
  await page.waitForTimeout(200);
  await expect(page.locator('[data-coach-cited] .coach-text')).not.toHaveClass(/clipped/);

  // Two left over, so the summary takes the Arabic dual — not "2 مقاطع".
  await expect(page.locator('[data-coach-more] > summary')).toHaveText('مقطعان آخران وُجدا');
  console.log('COACH_PASSAGE_CLIPPED_AND_COUNT_AGREES');
});

test('an answer that names no passage is not shown as an answer', async ({ page }) => {
  // The model returns `answered` and `used` independently, so {answered:true,
  // used:[]} is reachable — a confident sentence with no evidence, which is the
  // exact shape this whole feature exists to prevent. The claim must not be
  // printed at all: reprinting it under a "not in your books" heading would put
  // the unsupported sentence on screen while looking careful.
  await page.route(COACH, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      status: 'ok',
      answer: { status: 'ok', answered: true, text: 'خذ ٥ غرام كرياتين يومياً.', used: [] },
      results: [{ text: 'unrelated passage about quinoa', work: 'Body Recomp', page: 140, score: 0.5 }],
    }),
  }));
  await openCoach(page);
  await ask(page);

  await expect(page.locator('[data-coach-answer]')).toHaveCount(0);
  await expect(page.locator('[data-coach-unanswered]')).toHaveCount(1);
  await expect(page.locator('#page-coach')).not.toContainText('٥ غرام كرياتين');
  await expect(page.locator('[data-coach-cited]')).toHaveCount(0);
  console.log('COACH_UNSOURCED_IS_NOT_AN_ANSWER');
});

test('a slow earlier question cannot overwrite the answer to a newer one', async ({ page }) => {
  // Two questions in a row on a bad connection. If the first resolves last it
  // used to replace the second's answer — with citation markers pointing into
  // the wrong passage list, because the open/English toggles are keyed by index
  // into whichever list is on screen.
  let call = 0;
  await page.route(COACH, async (route) => {
    call += 1;
    const first = call === 1;
    if (first) await new Promise((r) => setTimeout(r, 2500));
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ok',
        answer: answer(first ? 'جواب السؤال الأول' : 'جواب السؤال الثاني', [0]),
        results: [{ text: first ? 'first' : 'second', work: first ? 'Book One' : 'Book Two', page: 1, score: 0.8 }],
      }),
    });
  });
  await openCoach(page);
  await page.fill('[data-coach-input]', 'السؤال الأول');
  await page.click('[data-coach-submit]');
  await page.waitForTimeout(300);
  await page.fill('[data-coach-input]', 'السؤال الثاني');
  await page.click('[data-coach-submit]');

  await expect(page.locator('[data-coach-answer]')).toContainText('جواب السؤال الثاني');
  // Wait past the slow first response and confirm it never lands.
  await page.waitForTimeout(3000);
  await expect(page.locator('[data-coach-answer]')).toContainText('جواب السؤال الثاني');
  await expect(page.locator('#page-coach')).not.toContainText('جواب السؤال الأول');
  console.log('COACH_STALE_ANSWER_DISCARDED');
});

test('an HTML error page reads as an error, not as an unreachable server', async ({ page }) => {
  // Tailscale Serve rewrites some failures into its own HTML page. res.json()
  // used to run before anything checked res.status, so the parse threw and the
  // catch reported "the library is not answering" — sending Raed to look for a
  // network fault when the server was up and refusing.
  await page.route(COACH, (route) => route.fulfill({
    status: 502, contentType: 'text/html', body: '<html><body>Bad Gateway</body></html>',
  }));
  await openCoach(page);
  await ask(page);

  await expect(page.locator('[data-coach-error]')).toHaveCount(1);
  await expect(page.locator('#page-coach')).toContainText('502');
  await expect(page.locator('#page-coach')).not.toContainText('لا يستجيب');
  console.log('COACH_HTTP_ERROR_NAMED');
});

test('an internet answer is marked as such, strips its markdown, and never widens the page', async ({ page }) => {
  // This is the shape the live model uses: a heading, Arabic prose containing
  // Latin exercise names, and two kinds of list. Flattening it left ##, bullets,
  // and numbers embedded in one paragraph instead of giving the answer a scan path.
  await page.route(COACH, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      status: 'ok',
      answer: {
        status: 'ok', answered: true, source: 'web', pass: 3,
        text: [
          '## البداية الآمنة',
          'ابدأ بـ **شدّ عضلة الفخذ** (Quadriceps isometric). هذه خطوة أولى.',
          '- اجعل الألم *محتملًا* ويهدأ خلال ساعتين.',
          '- استخدم `sit-to-stand` بمدى مريح.',
          '1. اضغط 10 ثوانٍ.',
          '2. كرّر 7–10 مرات.',
          'راجع ([nice.org.uk](https://www.nice.org.uk/guidance/NG226/chapter/recommendations?utm_source=openai)) عند الحاجة.',
        ].join('\n'),
        citations: ['https://www.nice.org.uk/guidance/NG226/chapter/recommendations?utm_source=openai'],
        used: [],
      },
      results: [{ text: 'unrelated', work: 'Some Book', page: 3, score: 0.4 }],
    }),
  }));
  await openCoach(page);
  await ask(page, 'كم أنزل بالأسبوع؟');

  await expect(page.locator('[data-coach-web]')).toHaveCount(1);
  await expect(page.locator('#page-coach')).toContainText('من الإنترنت');
  // The content survives; markdown punctuation becomes semantic DOM.
  await expect(page.locator('.web-answer-heading strong')).toHaveText('البداية الآمنة');
  await expect(page.locator('.coach-answer-text > ul > li')).toHaveCount(2);
  await expect(page.locator('.coach-answer-text > ol > li')).toHaveCount(2);
  await expect(page.locator('.coach-answer-text em')).toHaveText('محتملًا');
  await expect(page.locator('.coach-answer-text code')).toHaveText('sit-to-stand');
  await expect(page.locator('.coach-answer-text strong').last()).toHaveText('شدّ عضلة الفخذ');
  await expect(page.locator('.coach-answer-text')).not.toContainText('**');
  await expect(page.locator('.coach-answer-text')).not.toContainText('##');
  await expect(page.locator('.coach-answer-text')).not.toContainText('utm_source');
  // h() owns Latin isolation here too; the formatter must not wrap its output
  // again and recreate the <bdi><bdi> regression.
  await expect(page.locator('.coach-answer-text bdi.ltr-run', { hasText: 'Quadriceps isometric' })).toHaveCount(1);
  await expect(page.locator('.coach-answer-text code bdi.ltr-run')).toHaveText('sit-to-stand');
  await expect(page.locator('.coach-answer-text bdi bdi')).toHaveCount(0);
  // The source is a tappable host, once.
  await expect(page.locator('.coach-cite-link')).toHaveCount(1);
  await expect(page.locator('.coach-cite-link')).toContainText('nice.org.uk');
  // No library passage is shown under a web answer — that would read as sourcing.
  await expect(page.locator('[data-coach-passage]')).toHaveCount(0);
  await expect(page.locator('#page-coach')).not.toContainText('مكتوبة من المقاطع');
  // And the page must not scroll sideways.
  const overflow = await page.evaluate(() =>
    document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, 'the page must not scroll horizontally').toBeLessThanOrEqual(1);
  console.log('COACH_WEB_ANSWER_LABELLED_AND_CLEAN');
});

test('a citation marker points at a real passage, and one that does not is dropped', async ({ page }) => {
  // The marker is the whole verification path: [2] in the answer and 2 on the
  // card are the same passage, so Raed can check any claim against the book it
  // came from. A marker pointing past the end of the list would send him looking
  // for evidence that was never there, so it is removed rather than rendered.
  await page.route(COACH, (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({
      status: 'ok',
      answer: answer('راحة دقيقتين. [2] وهذا مصدر غير موجود. [9]', [1]),
      results: [
        { text: 'first passage', work: 'Book One', page: 10, score: 0.8 },
        { text: 'second passage about rest', work: 'Book Two', page: 20, score: 0.7 },
      ],
    }),
  }));
  await openCoach(page);
  await ask(page);

  const markers = page.locator('.coach-answer-text .coach-cite');
  await expect(markers).toHaveCount(1);
  await expect(markers).toHaveText('2');
  // The out-of-range one left no marker and no stray "[9]" in the prose.
  await expect(page.locator('[data-coach-answer]')).not.toContainText('[9]');
  await expect(page.locator('[data-coach-answer]')).not.toContainText('9');
  // And the card it points at carries the same number.
  await expect(page.locator('[data-coach-cited] .coach-cite')).toHaveText('2');
  await expect(page.locator('[data-coach-cited]')).toContainText('Book Two');
  console.log('COACH_CITATION_MARKERS_RESOLVE');
});

test('a refused key reads as a refusal, not as a dead server or an empty answer', async ({ page }) => {
  // The endpoint is public now, so 401 is a state Raed can actually hit — an
  // expired or rotated key. Collapsing it into "server down" would send him
  // restarting a service that is running perfectly.
  await page.route(COACH, (route) => route.fulfill({
    status: 401,
    contentType: 'application/json',
    body: JSON.stringify({ status: 'unauthorized' }),
  }));
  await openCoach(page);
  await ask(page);

  await expect(page.locator('[data-coach-error]')).toHaveCount(1);
  await expect(page.locator('#page-coach')).toContainText('رفضت المكتبة');
  await expect(page.locator('[data-coach-passage]')).toHaveCount(0);
  await expect(page.locator('[data-coach-no-match]')).toHaveCount(0);
  console.log('COACH_UNAUTHORIZED_DISTINGUISHED');
});

test('every request carries the access key', async ({ page }) => {
  let sentKey = null;
  await page.route(COACH, (route) => {
    sentKey = route.request().headers()['x-coach-key'] || null;
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ status: 'no_match', message: 'no match', results: [] }) });
  });
  await openCoach(page);
  await ask(page);
  // Without it the public endpoint answers 401 and the coach is simply dead.
  expect(sentKey).toBeTruthy();
  expect(sentKey.length).toBeGreaterThan(20);
});
