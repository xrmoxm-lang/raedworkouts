// Every app spec imports `test` from here instead of '@playwright/test'.
//
// The app ships real sync credentials and loads YouTube thumbnails, and the
// service worker used to answer sync-host GETs from its own fetch() — which a
// page.route() never sees. Proven 2026-09-08: with both host routes aborted, a
// page fetch of the live /health still returned 200. So the guard lives here,
// on the CONTEXT, before any spec runs: nothing that is not the local test
// server ever leaves the browser, and a blocked request fails at once instead
// of hanging `networkidle`. The per-spec route() calls are kept as a second
// fence. tests/pwa-deploy.spec.mjs is the one spec that needs the real network;
// it imports from '@playwright/test' directly and runs in its own project.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test as base, expect } from '@playwright/test';

// Twelve completed sessions (three weeks of Block A, every programmed movement,
// every set logged) for the Raed profile, generated from data.js. Until
// 2026-09-08 these specs got their history from Raed's LIVE server through the
// service worker; with the fence honest, the profile boots empty and every
// «last time» / calibrated-ramp / varying-effort assertion had nothing to stand
// on. Seeded only when the profile's state key is absent, so a spec that seeds
// or clears its own state keeps control.
const SEED_STATE = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '_seed-state.json'), 'utf8');

const LOCAL = /^(?:https?:\/\/)?(?:127\.0\.0\.1|localhost)(?::\d+)?(?:\/|$)/;
// YouTube thumbnails are answered with one local 480×360 JPEG, so a clip
// «previews» deterministically and the app's small-image fallback chain (which
// treats anything ≤120px wide as YouTube's grey stub) is not tripped.
const THUMB = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), '_thumb.jpg'));

export const test = base.extend({
  context: async ({ context }, use) => {
    await context.route('**/*', (route) => {
      const url = route.request().url();
      if (LOCAL.test(url) || url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('file:')) return route.continue();
      if (/^https:\/\/(?:img\.youtube\.com|i\.ytimg\.com)\//.test(url)) return route.fulfill({ status: 200, contentType: 'image/jpeg', body: THUMB });
      return route.abort('blockedbyclient');
    });
    await context.addInitScript((seed) => {
      try {
        const key = 'raedworkouts.Raed.state.v1';
        if (localStorage.getItem(key) == null && !localStorage.getItem('raedworkouts.__noseed')) localStorage.setItem(key, seed);
      } catch (_) { /* storage blocked: the spec decides */ }
    }, SEED_STATE);
    await use(context);
  },
});
export { expect };
