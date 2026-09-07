/* The coach searches the 33 Nippard works Raed owns and answers out of them,
 * showing the passages it used with book and page. The rule underneath: no
 * passages means the model is never called, and an answer that names no
 * passage is not shown. */

import { $, h, localizedTextNode } from '../core/dom.js';
import { activeLanguage, t, tf } from '../core/i18n.js';
import { focusExerciseIdx } from '../core/session.js';
import { renderCoach } from '../core/shell.js';
import { saveLocal, state } from '../core/store.js';
import { getAllExercises } from '../core/videos.js';

// Same-origin, through api/coach.js on Vercel. The access key used to ship in
// this file and /answer is metered, so anyone who viewed source could spend his
// credit. There is deliberately NO fallback to the direct funnel URL.
export const COACH_URL = '/api/coach';
export const coachRoute = (name) => `${COACH_URL}?route=${name}`;
export const COACH_EXAMPLES = ['coach_eg_volume', 'coach_eg_failure', 'coach_eg_protein'];
export let coachState = { status: 'idle', question: '', results: [], answer: null, error: '' };

export function setCoachState(value) { coachState = value; }
// The last answer survives leaving the tab.
export const COACH_LAST_KEY = 'coach_last_answer';
export function rememberCoachAnswer() {
  if (coachState.status !== 'ok') return;
  try {
    state[COACH_LAST_KEY] = {
      question: coachState.question,
      answer: coachState.answer,
      // Passages carry the citation targets, so the answer is unreadable
      // without them — but they are also the bulk.
      results: (coachState.results || []).slice(0, 6),
      at: Date.now(),
    };
    saveLocal();
  } catch (_) { /* a record of an answer is never worth breaking the answer */ }
}
export function restoreCoachAnswer() {
  const saved = state[COACH_LAST_KEY];
  if (!saved || !saved.answer || !Array.isArray(saved.results)) return;
  coachState = {
    status: 'ok', question: saved.question || '',
    results: saved.results, answer: saved.answer, error: '', restored: true,
  };
}
// Which passages he has flipped to English, and which he has opened in full,
// keyed by index within the current answer.
export let coachEnglish = new Set();
export function setCoachEnglish(value) { coachEnglish = value; }
export let coachOpen = new Set();
export function setCoachOpen(value) { coachOpen = value; }
// Monotonic, so a slow earlier request cannot overwrite a newer answer.
export let coachRequestId = 0;
export let coachAbort = null;

// Raed's library deliberately keeps both editions of two Nippard programmes,
// because their bytes differ and no supersession was ever proven.
export function dedupePassages(results) {
  const seen = new Map();
  const passages = [];
  const moved = new Map();
  results.forEach((passage, index) => {
    // The WHOLE passage, not its opening: 160 characters collapsed two genuinely
    // different chunks, and because the answer cites passages by index,
    // collapsing them also redirects a citation onto the survivor.
    const key = String(passage.text || '').replace(/\s+/g, ' ').trim().toLowerCase();
    if (seen.has(key)) {
      // A citation of the copy still points at the one that was kept.
      moved.set(index, seen.get(key));
      return;
    }
    seen.set(key, passages.length);
    moved.set(index, passages.length);
    passages.push(passage);
  });
  return { passages, moved };
}

// Arabic counts do not work like English ones. "2 مقاطع" is wrong: two takes the
// dual (مقطعان), one takes the singular, and 3–10 take the plural. top_k caps at
// 10 so those three cases are the whole range. English keeps its own simple rule.
export function coachFoundLabel(count) {
  if (activeLanguage() !== 'ar') return tf('coach_found', { n: count });
  if (count === 1) return t('coach_found_one_ar');
  if (count === 2) return t('coach_found_two_ar');
  return tf('coach_found', { n: count });
}

// Same three cases for the collapsed remainder.
export function coachMoreLabel(count) {
  if (activeLanguage() !== 'ar') return tf('coach_sources_more', { n: count });
  if (count === 1) return t('coach_sources_more_one_ar');
  if (count === 2) return t('coach_sources_more_two_ar');
  return tf('coach_sources_more', { n: count });
}

export async function askCoach(question, context = null) {
  // Only the NAME is sent, and it travels in its own field. Sets, loads and
  // history stay on the device — he asked for a coach that knows which
  // exercise he is on, not one that reads his session.
  if (coachAbort) { try { coachAbort.abort(); } catch (_) { /* already gone */ } }
  coachAbort = typeof AbortController === 'function' ? new AbortController() : null;
  // Kept so the idle screen can offer them back. Mid-set he re-asks the same
  // few things — «كم راحة بين المجموعات؟» — and retyping Arabic on a phone
  // with chalk on your hands is the friction worth removing.
  if (question) {
    const recent = (state.coach_recent || []).filter((q) => q !== question);
    state.coach_recent = [question, ...recent].slice(0, 5);
    saveLocal();
  }
  const ticket = ++coachRequestId;
  coachState = { status: 'loading', question, results: [], answer: null, error: '' };
  coachEnglish = new Set();
  coachOpen = new Set();
  renderCoach();
  try {
    // /answer, not /search: the server runs the identical retrieval and then
    // writes the answer from what it found. The OpenAI key never leaves the
    // server, and when retrieval finds nothing the model is never called.
    const res = await fetch(coachRoute('answer'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // 0.35, and it is NOT an answerability guard: measured over 26 questions,
      // real questions his books answer score BELOW nonsense. It is only a cheap
      // early exit for the absurd; the model, holding the passages, decides.
      body: JSON.stringify({
        question,
        ...(context ? { context: context.name } : {}),
        // 10, not 5. Measured: of the questions his books answer but the coach
        // refused, the answering passage ranked 10th, 16th and 19th — just
        // outside a top_k of 5 — for +19% cost on a $0.0006 question.
        top_k: 10,
        min_score: 0.35,
        // The server may leave the library only because this says it may, and
        // only after two passes over his books have failed.
        allow_web: true,
      }),
      // Both the 30s ceiling AND this request's own abort, so a newer question
      // actually cancels the paid call rather than leaving it to finish unread.
      signal: coachAbort
        ? (AbortSignal.any ? AbortSignal.any([coachAbort.signal, AbortSignal.timeout(30000)]) : coachAbort.signal)
        : AbortSignal.timeout(30000),
    });
    if (ticket !== coachRequestId) return;
    // Status first, body second. res.json() on an HTML error page from a proxy
    // throws, and the catch reports «the library is unreachable» — which sends
    // him looking for a network fault that does not exist.
    let data;
    try {
      data = await res.json();
    } catch (_) {
      coachState = res.status === 401
        ? { status: 'unauthorized', question, results: [], answer: null, error: '' }
        : { status: 'error', question, results: [], answer: null, error: `HTTP ${res.status}` };
      renderCoach();
      return;
    }
    if (data.status === 'no_match') {
      // A 200 carrying "nothing matched". Its own state — not an error, and not
      // an empty result list dressed up as an answer.
      coachState = { status: 'no_match', question, results: [], answer: null, error: '' };
    } else if (data.status === 'ok' && Array.isArray(data.results) && data.results.length) {
      // Deduping removes passages, and the answer's `used` indices point at the
      // list the SERVER sent. Remap them, or a citation would silently move to
      // whichever passage happened to slide into that slot.
      const { passages, moved } = dedupePassages(data.results);
      const answer = data.answer && typeof data.answer === 'object' ? { ...data.answer } : null;
      if (answer && Array.isArray(answer.used)) {
        answer.used = answer.used.map((i) => moved.get(i)).filter((i) => i !== undefined);
      }
      // The answer cites "[3]" using the server's numbering, which dedupe just
      // changed. Renumber the markers with the same map, or a citation would
      // point at whichever passage slid into that slot.
      if (answer && typeof answer.text === 'string') {
        answer.text = answer.text.replace(/\[(\d{1,2})\]/g, (whole, digits) => {
          const to = moved.get(Number(digits) - 1);
          return to === undefined ? '' : `[${to + 1}]`;
        });
      }
      coachState = { status: 'ok', question, results: passages, answer, error: '' };
    } else if (res.status === 401 || data.status === 'unauthorized') {
      // Distinct from "the server is down": the library answered, and refused.
      coachState = { status: 'unauthorized', question, results: [], answer: null, error: '' };
    } else {
      coachState = { status: 'error', question, results: [], answer: null, error: data.error || data.status || 'unknown' };
    }
  } catch (err) {
    if (ticket !== coachRequestId) return;
    // Unreachable is reported as unreachable. The library is on Raed's own
    // server, so the honest cause is almost always "phone is off Tailscale" —
    // saying that beats a spinner that never resolves.
    coachState = { status: 'offline', question, results: [], error: String(err?.message || err) };
  }
  rememberCoachAnswer();
  renderCoach();
}

// Only the movement's NAME crosses over — Raed turned down a coach that reads
// his sets. The switch that turns even that off is on the coach screen.
export function activeCoachContext() {
  const session = state.active_session;
  if (!session || session.phase === 'warmup') return null;
  const entries = Object.entries(session.exercises || {});
  if (!entries.length) return null;
  const index = Math.min(Math.max(focusExerciseIdx ?? 0, 0), entries.length - 1);
  const [plannedId, exState] = entries[index];
  const actualId = exState?.swapped_to || plannedId;
  const exercise = getAllExercises().find((item) => item.id === actualId);
  if (!exercise) return null;
  return { id: actualId, name: exercise.name, sessionName: session.session_name || '' };
}

// The web answer arrives as markdown. Inline links are DROPPED rather than
// rendered: every one is already in `citations` below the answer, so keeping
// them inline would be the same source twice, once unreadably.
export function webAnswerInline(text) {
  const nodes = [];
  const pattern = /`([^`\n]+)`|\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g;
  let cursor = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) nodes.push(localizedTextNode(text.slice(cursor, match.index)));
    if (match[1] != null) nodes.push(h('code', {}, match[1]));
    else if (match[2] != null) nodes.push(h('strong', {}, match[2]));
    else nodes.push(h('em', {}, match[3]));
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) nodes.push(localizedTextNode(text.slice(cursor)));
  return nodes;
}

export function webAnswerSentences(text) {
  const sentences = [];
  let start = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (!'.!?؟'.includes(text[i])) continue;
    let end = i + 1;
    while (end < text.length && /[\])}"'»]/.test(text[end])) end += 1;
    if (end >= text.length || !/[ \t]/.test(text[end])) continue;
    let next = end;
    while (next < text.length && /[ \t]/.test(text[next])) next += 1;
    if (next >= text.length) continue;
    sentences.push(text.slice(start, end).trim());
    start = next;
    i = next - 1;
  }
  sentences.push(text.slice(start).trim());
  return sentences.filter(Boolean);
}

export function webAnswerText(text) {
  const cleaned = String(text || '')
    .replace(/\r\n?/g, '\n')
    // [label](url) and bare (url) — the citation list has these.
    .replace(/\(?\[([^\]]*)\]\((https?:[^)]*)\)\)?/g, '')
    .replace(/\(https?:\/\/[^\s)]+\)/g, '')
    // Stripping a link out of "(**term** (English))" leaves a doubled or
    // orphaned bracket behind. Collapse those rather than shipping "((" into
    // the middle of a sentence.
    .replace(/\(\s*\)/g, '')
    .replace(/\({2,}/g, '(')
    .replace(/\){2,}/g, ')')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([،.!؟])/g, '$1')
    .trim();
  const root = h('div', { class: 'coach-answer-text' });
  let list = null;
  let listType = '';

  cleaned.split('\n').forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) { list = null; listType = ''; return; }

    const heading = line.match(/^#{1,6}\s+(.+?)\s*#*$/);
    if (heading) {
      list = null;
      listType = '';
      // A four-sentence answer does not need a document outline, but the line
      // still has to keep the emphasis the model intended instead of showing ##.
      const label = heading[1].replace(/^\*\*(.+)\*\*$/, '$1');
      root.appendChild(h('p', { class: 'web-answer-heading' },
        h('strong', {}, webAnswerInline(label))));
      return;
    }

    const ordered = line.match(/^\d+[.)]\s+(.+)$/);
    const unordered = line.match(/^(?:[-+*]|•)\s+(.+)$/);
    const type = ordered ? 'ol' : unordered ? 'ul' : '';
    if (type) {
      if (!list || listType !== type) {
        list = h(type, {});
        listType = type;
        root.appendChild(list);
      }
      list.appendChild(h('li', {}, webAnswerInline((ordered || unordered)[1])));
      return;
    }

    list = null;
    listType = '';
    // Open-web answers often arrive as four complete sentences on one line.
    // Keeping that as one block recreates the dense paragraph Raed rejected.
    webAnswerSentences(line).forEach((sentence) => {
      root.appendChild(h('p', {}, webAnswerInline(sentence)));
    });
  });
  return root;
}

// The answer's citations, as markers rather than titles.
//
// The model used to cite inline as "(The Ultimate Guide to Body Recomposition،
// صفحة ١٠٤)". In an RTL paragraph a title that long wraps, so "(The" ended one
// line and the rest opened the next, and Raed had to reassemble an English name
// across a direction change to see which book a number came from. It now cites
// "[3]", which is two characters, survives RTL untouched, and points at the
// passage card below that already carries the book and the page.
//
// Any marker outside the range of passages actually sent is dropped rather than
// rendered: a citation that points nowhere is worse than no citation.
export function coachAnswerText(text, passageCount) {
  const node = h('p', { class: 'coach-answer-text' });
  const pattern = /\[(\d{1,2})\]/g;
  let cursor = 0;
  let match;
  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) node.appendChild(localizedTextNode(text.slice(cursor, match.index)));
    const index = Number(match[1]);
    if (index >= 1 && index <= passageCount) {
      node.appendChild(h('span', {
        class: 'coach-cite', 'data-coach-cite': String(index),
      }, String(index)));
    }
    cursor = match.index + match[0].length;
  }
  if (cursor < text.length) node.appendChild(localizedTextNode(text.slice(cursor)));
  return node;
}

// Usage is fetched once per Settings visit and cached, so opening the page does
// not hammer the server, and a failure degrades to a line saying so rather than
// an empty card pretending the coach is free.
export let coachUsage = null;
export function setCoachUsage(usage, at) { coachUsage = usage; coachUsageAt = at; }
export let coachUsageAt = 0;

export function setCoachUsageAt(at) { coachUsageAt = at; }
// Switching models is a server-side setting, not a client preference: the key
// and the price table live there, and the app must not be able to disagree with
// it about which model is answering.
export async function setCoachModel(model) {
  try {
    const res = await fetch(coachRoute('model'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model }),
      signal: AbortSignal.timeout(15000),
    });
    return res.ok;
  } catch (_) {
    return false;
  }
}

