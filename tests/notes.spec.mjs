import { expect, test } from '@playwright/test';

const appUrl = process.env.APP_URL || 'http://localhost:8877';

async function enterApp(page) {
  // Notes sync to Raed's server by design -- that is how they reach Claude at
  // all -- so they survive a localStorage wipe via the next pull. Cut the sync
  // origin, and wipe BEFORE the app boots: clearing after it has loaded state
  // into memory just gets overwritten by the next saveLocal().
  await page.route('https://raed-hp.tail53bd35.ts.net:8443/**', (route) => route.abort());
  await page.addInitScript(() => {
    for (const key of Object.keys(localStorage)) {
      if (!/\.state\./.test(key)) continue;
      try {
        const parsed = JSON.parse(localStorage[key]);
        parsed.claude_notes = [];
        parsed.custom_videos = {};
        localStorage[key] = JSON.stringify(parsed);
      } catch { /* a malformed key is not this test's problem */ }
    }
  });
  await page.goto(appUrl, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.evaluate(() => {
    const tile = [...document.querySelectorAll('.profile-tile')].find((el) => /Raed/.test(el.textContent));
    if (tile) tile.click();
  });
  await page.waitForTimeout(700);
}

async function readNotes(page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /\.state\./.test(k) && /raed/i.test(k));
    return key ? (JSON.parse(localStorage[key]).claude_notes || []) : [];
  });
}

async function intoSession(page) {
  await page.evaluate(() => document.querySelector('#page-home button.btn.primary.full')?.click());
  await page.waitForTimeout(900);
  await page.evaluate(() => document.querySelector('[data-warmup-skip]')?.click());
  await page.waitForTimeout(900);
}

test('a note reaches the store from the training screen, tagged with its exercise', async ({ page }) => {
  await enterApp(page);
  await intoSession(page);

  // Both controls sit on the exercise itself. Raed will not leave a running
  // session to hunt for them in the Library tab.
  await expect(page.locator('[data-note-add]').first()).toBeVisible();
  await expect(page.locator('[data-video-add]').first()).toBeVisible();

  // Delta, not absolute: notes persist and sync on purpose, so a prior run's
  // notes are legitimately still there. What must hold is that this click adds
  // exactly one, carrying exactly what was typed.
  const before = await readNotes(page);
  const text = `اختبار ${Date.now()} — الجهاز هذا مو موجود في ناديي`;
  page.once('dialog', (dialog) => dialog.accept(text));
  await page.locator('[data-note-add]').first().click();
  await page.waitForTimeout(600);

  const notes = await readNotes(page);
  expect(notes).toHaveLength(before.length + 1);
  expect(notes.at(-1).text).toBe(text);
  const [added] = [notes.at(-1)];
  expect(added.text).toBe(text);
  // The exercise is captured by id AND by name, so the note still means
  // something after a swap or a rename.
  expect(added.exercise_id).toBeTruthy();
  expect(added.exercise_name).toBeTruthy();
  expect(added.status).toBe('new');
  console.log('NOTE_CAPTURED_WITH_EXERCISE');
});

test('a note is readable back and deletable in Settings', async ({ page }) => {
  await enterApp(page);
  await intoSession(page);
  const unique = `الوزن المقترح عالي ${Date.now()}`;
  const startCount = (await readNotes(page)).length;
  page.once('dialog', (dialog) => dialog.accept(unique));
  await page.locator('[data-note-add]').first().click();
  await page.waitForTimeout(500);

  // A JS click, like the other suites: during a session a toast can sit over
  // the tab bar and a real click times out waiting for it to clear.
  await page.evaluate(() => document.querySelector('.tab[data-route="settings"]')?.click());
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const el = [...document.querySelectorAll('summary')].find((s) => /ملاحظاتي لكلود/.test(s.textContent));
    if (el) el.click();
  });
  await page.waitForTimeout(400);

  await expect(page.locator('[data-note-item]')).toHaveCount(startCount + 1);
  // Newest first, so the one just written is the top card.
  await expect(page.locator('[data-note-item]').first()).toContainText(unique);

  await page.locator('[data-note-delete]').first().click();
  await page.waitForTimeout(500);
  await expect(page.locator('[data-note-item]')).toHaveCount(startCount);
  expect((await readNotes(page)).some((n) => n.text === unique)).toBe(false);
  console.log('NOTE_READABLE_AND_DELETABLE');
});

test('a non-YouTube link is refused rather than stored as a broken video', async ({ page }) => {
  await enterApp(page);
  await intoSession(page);

  // D8 in miniature: a mistyped link is a wrong video, and a wrong video is
  // worse than none. The refusal must leave the store untouched.
  // A prompt then an alert: two dialogs from one click, so the handler has to
  // persist rather than fire once.
  const seen = [];
  page.on('dialog', (dialog) => {
    seen.push(dialog.type());
    return dialog.type() === 'prompt' ? dialog.accept('https://vimeo.com/12345') : dialog.accept();
  });
  await page.locator('[data-video-add]').first().click();
  await page.waitForTimeout(600);

  const stored = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /state/i.test(k) && /raed/i.test(k));
    return JSON.parse(localStorage[key]).custom_videos || {};
  });
  expect(Object.values(stored).flat()).not.toContain('https://vimeo.com/12345');
  // The alert is the proof it was actively refused, not silently dropped.
  expect(seen).toEqual(['prompt', 'alert']);
  console.log('BAD_VIDEO_URL_REFUSED');
});

test('a real YouTube link is added and shows up as a tile', async ({ page }) => {
  await enterApp(page);
  await intoSession(page);

  const before = await page.locator('.video-row a, .video-row .video-thumb-wrap').count();
  page.once('dialog', (dialog) => dialog.accept('https://www.youtube.com/shorts/dQw4w9WgXcQ'));
  await page.locator('[data-video-add]').first().click();
  await page.waitForTimeout(800);

  const stored = await page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => /state/i.test(k) && /raed/i.test(k));
    return JSON.parse(localStorage[key]).custom_videos || {};
  });
  expect(Object.values(stored).flat()).toContain('https://www.youtube.com/shorts/dQw4w9WgXcQ');
  const after = await page.locator('.video-row a, .video-row .video-thumb-wrap').count();
  expect(after).toBeGreaterThan(before);
  console.log('CUSTOM_VIDEO_ADDED');
});
