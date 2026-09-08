/* The coach screen: his notebook of questions.
 *
 * The idle screen used to be a form with a slogan — an icon, a title, a box,
 * three chips and a footer over 481px of empty paper — and every answer he had
 * ever paid for was thrown away except the last one. It reads like the rest of
 * the app now: a composer, and under it the log of what he has already asked.
 */

import {
  COACH_EXAMPLES,
  COACH_LAST_KEY,
  COACH_LOG_KEY,
  activeCoachContext,
  askCoach,
  coachAnswerKind,
  coachAnswerText,
  coachEnglish,
  coachFoundLabel,
  coachMoreLabel,
  coachOpen,
  coachState,
  setCoachState,
  webAnswerText,
} from '../core/coach.js';
import { $, h } from '../core/dom.js';
import { fmtDateShort, fmtUsd, t, tf } from '../core/i18n.js';
import { saveLocal, settings, state } from '../core/store.js';
import { isSafeHttpUrl } from '../core/videos.js';

// «صفحة 92» with the digits in Plex Mono. The locale keeps the whole sentence —
// duplicating it as a bare word plus a number would put the word order in the
// renderer, where Arabic and English disagree about it.
function numbered(key, value) {
  const text = tf(key, { n: value });
  const mark = String(value);
  const at = text.indexOf(mark);
  if (at < 0) return [text];
  return [text.slice(0, at), h('span', { class: 'num' }, mark), text.slice(at + mark.length)];
}

// Only the numerals wear the mono face: «8 سبتمبر» is one date, not one number.
// It is ONE element, because `.row-trail` is a flex row — returning the day and
// the month as siblings made them two flex items with the row's 8px gap
// between them, and laid them out in flex order rather than in Arabic order.
function dateNode(at) {
  const text = fmtDateShort(at);
  const nodes = [];
  let cursor = 0;
  for (const match of text.matchAll(/\d+/g)) {
    const index = match.index ?? 0;
    if (index > cursor) nodes.push(text.slice(cursor, index));
    nodes.push(h('span', { class: 'num' }, match[0]));
    cursor = index + match[0].length;
  }
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return h('span', { class: 'coach-log-date' }, nodes);
}

// The opening of the answer. Its citation markers come out — «[2]» in a
// 90-character preview points at a passage that is not on this screen — and so
// does the markdown a web answer is stored in, which otherwise opened the
// preview with «## البداية».
function answerSnippet(text) {
  const flat = String(text || '')
    .replace(/\[\d{1,2}\]/g, ' ')
    .replace(/\[([^\]]*)\]\((?:https?:)?[^)]*\)/g, '$1')
    .replace(/^\s*#{1,6}\s+/gm, '')
    .replace(/^\s*(?:[-+*]|•|\d+[.)])\s+/gm, '')
    .replace(/[*`_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length > 90 ? `${flat.slice(0, 90)}…` : flat;
}

// An entry has to have both halves to be worth a row: tapping one that carries
// no answer opens an empty screen. Nothing is deleted — a malformed record
// stays in `state`, it just does not get listed as something to read.
const coachLog = () => (Array.isArray(state[COACH_LOG_KEY]) ? state[COACH_LOG_KEY] : [])
  .filter((entry) => entry && typeof entry === 'object' && entry.question && entry.text);

// Whether what is on screen came out of the log rather than off the network.
// «اسأل شيئًا جديدًا» must not delete `coach_last_answer` when he is only
// reading an older entry — that would throw away the genuine last answer.
let fromLog = false;
// What he has typed but not sent. renderCoach() runs again on every passage
// expanded and every language flipped, and rebuilding the field from
// coachState dropped the half-written question each time.
let draft = '';

// A logged answer is given the shape a fresh one has, so the answer layout
// below renders it through exactly one code path.
function openLogEntry(entry) {
  fromLog = true;
  coachEnglish.clear();
  coachOpen.clear();
  const cited = Array.isArray(entry.cited) ? entry.cited : [];
  setCoachState({
    status: 'ok',
    question: entry.question || '',
    results: cited.map((passage) => ({ work: passage.work, page: passage.page, text: passage.text })),
    answer: {
      status: 'ok',
      answered: true,
      text: entry.text || '',
      used: cited.map((_, index) => index),
      ...(entry.source === 'web'
        ? { source: 'web', citations: (entry.citations || []).filter(isSafeHttpUrl) }
        : {}),
    },
    error: '',
    restored: true,
  });
  renderCoach();
}

function coachLogSection(log) {
  return h('section', { class: 'section coach-log', 'data-coach-log': 'true' },
    h('div', { class: 'section-head' },
      h('div', { class: 'eyebrow' }, t('coach_log_title')),
      h('span', { class: 'num' }, String(log.length)),
    ),
    h('div', { class: 'list' }, log.map((entry) => h('button', {
      type: 'button', class: 'row is-button coach-log-row',
      'data-coach-log-entry': String(entry.id || entry.asked_at || ''),
      onClick: () => openLogEntry(entry),
    },
      h('span', { class: 'row-body' },
        h('span', { class: 'row-title' }, entry.question || ''),
        h('span', { class: 'row-hint' },
          h('span', { class: 'coach-tag' }, t(entry.source === 'web' ? 'coach_source_web' : 'coach_from_books')),
          answerSnippet(entry.text),
        ),
      ),
      h('span', { class: 'row-trail' }, dateNode(entry.asked_at || Date.now())),
    ))),
  );
}

export function renderCoach() {
  const root = $('#page-coach');
  root.innerHTML = '';
  root.appendChild(h('div', { class: 'page-header' }, h('h1', {}, t('coach'))));

  const idle = coachState.status === 'idle';
  // Disabled while a question is in flight. They were rendered before the
  // loading branch and never disabled, so a double tap on «اسأل» — easy on a
  // phone — fired a second metered request before the first had answered.
  const busy = coachState.status === 'loading';
  const input = h('input', {
    type: 'text', class: 'coach-input', value: draft,
    placeholder: t('coach_placeholder'), 'data-coach-input': 'true',
    ...(busy ? { disabled: 'disabled' } : {}),
    onInput: (ev) => { draft = ev.target.value; },
    onKeydown: (ev) => { if (ev.key === 'Enter') submit(); },
  });
  const submit = () => {
    if (coachState.status === 'loading') return;
    const question = input.value.trim();
    // The service rejects anything under 3 characters; catching it here keeps a
    // stray tap from rendering as a server error.
    if (question.length < 3) return;
    draft = '';
    fromLog = false;
    // The movement name rides along with the question rather than replacing it,
    // so "كم راحة؟" becomes a question about the machine he is standing at.
    const ctx = activeCoachContext();
    const useContext = ctx && settings.coach_use_context !== false;
    askCoach(question, useContext ? ctx : null);
  };
  // The composer. The old head — icon, title, slogan — is gone: the page
  // header already says «المدرب», and it said it twice.
  const composer = h('section', {
    class: 'coach-ask' + (idle ? '' : ' answered'), 'data-coach-ask': 'true',
  }, h('div', { class: 'coach-row' },
    input,
    h('button', {
      class: 'btn primary', onClick: submit, 'data-coach-submit': 'true',
      ...(busy ? { disabled: 'disabled' } : {}),
    }, busy ? t('coach_asking') : t('coach_ask')),
  ));

  // The handoff. Shown only while a session is actually running, because the
  // rest of the time there is nothing to hand off and the row would be chrome.
  const context = activeCoachContext();
  const contextRow = context ? h('div', { class: 'coach-context', 'data-coach-context': 'true' },
    h('div', { class: 'coach-context-text' },
      h('span', { class: 'coach-context-label' }, t('coach_context_label')),
      ' ',
      h('bdi', { class: 'ltr-run' }, context.name),
    ),
    h('label', { class: 'coach-context-toggle' },
      h('input', {
        type: 'checkbox', 'data-coach-context-toggle': 'true',
        ...(settings.coach_use_context !== false ? { checked: 'checked' } : {}),
        onChange: (event) => {
          settings.coach_use_context = event.target.checked;
          saveLocal();
          renderCoach();
        },
      }),
      h('span', {}, t('coach_context_use')),
    ),
  ) : null;

  if (idle) {
    fromLog = false;
    if (contextRow) root.appendChild(contextRow);
    root.appendChild(composer);

    const log = coachLog();
    // A question he asked that produced no answer worth keeping is not in the
    // log, so the chip is the only way back to it. One that IS in the log sits
    // below with what it answered, and does not need to be offered twice.
    const answered = new Set(log.map((entry) => entry.question));
    const recent = (state.coach_recent || []).filter((question) => question && !answered.has(question));
    // The chips go through the same path as the typed question, context and
    // all. They used to call askCoach() bare, so tapping a chip mid-session
    // silently ignored the switch he had just left on.
    const askThis = (question) => () => { input.value = question; submit(); };
    root.appendChild(h('div', {
      class: 'coach-chips', ...(recent.length ? { 'data-coach-recent': 'true' } : {}),
    },
      recent.map((question) => h('button', {
        type: 'button', class: 'chip coach-chip-recent', onClick: askThis(question),
      }, question)),
      COACH_EXAMPLES.map((example) => h('button', {
        type: 'button', class: 'chip', onClick: askThis(t(example)),
      }, t(example))),
    ));

    if (log.length) root.appendChild(coachLogSection(log));
    // Kept in the DOM in every idle state; when the log is empty it is the
    // whole empty state, and it is an honest one — it says what the coach can
    // and cannot answer rather than inventing something to fill the page.
    root.appendChild(h('footer', {
      class: 'coach-scope' + (log.length ? '' : ' alone'), 'data-coach-scope': 'true',
    },
      h('div', { class: 'coach-scope-line' }, t('coach_scope_books')),
      h('div', { class: 'coach-scope-note' }, t('coach_scope_note')),
    ));
    return;
  }

  // Say so when this is an answer he already has rather than one just returned.
  if (coachState.restored) {
    root.appendChild(h('div', { class: 'coach-restored', 'data-coach-restored': 'true' },
      h('span', {}, t(fromLog ? 'coach_log_past' : 'coach_restored')),
      h('button', {
        type: 'button', class: 'btn tiny ghost',
        onClick: () => {
          const wasLog = fromLog;
          setCoachState({ status: 'idle', question: '', results: [], answer: null, error: '' });
          fromLog = false;
          // Reading an older entry must not throw away the last answer.
          if (!wasLog) {
            delete state[COACH_LAST_KEY];
            saveLocal();
          }
          renderCoach();
        },
      }, t(fromLog ? 'coach_ask_new' : 'coach_clear')),
    ));
  }
  // The question stands over its answer, so the field below can be empty and
  // ready for the next one instead of holding the one already answered.
  if (coachState.question) {
    root.appendChild(h('div', { class: 'eyebrow coach-question' }, coachState.question));
  }

  renderCoachBody(root);

  // The way back to the notebook. Without it a fresh answer is a dead end: the
  // restored banner is the only other exit and it is not rendered for an answer
  // that has just arrived, so the log he came for was unreachable until he paid
  // for another question. Not shown beside the banner, which already exits.
  const log = coachLog();
  const backToLog = log.length && !coachState.restored
    ? h('button', {
        type: 'button', class: 'btn tiny ghost coach-back',
        onClick: () => {
          setCoachState({ status: 'idle', question: '', results: [], answer: null, error: '' });
          fromLog = false;
          renderCoach();
        },
      }, t('coach_log_title'))
    : null;
  root.appendChild(h('section', { class: 'section coach-again' },
    h('div', { class: 'section-head' }, h('div', { class: 'eyebrow' }, t('coach_another')), backToLog),
    // Inside the section, so the band stays directly above the field it
    // changes rather than above the heading of the block that holds it.
    contextRow,
    composer,
  ));
}

// Everything between the question and the composer: the notice, or the answer
// and the passages it was built from.
function renderCoachBody(root) {
  if (coachState.status === 'loading') {
    root.appendChild(h('div', { class: 'notice', 'data-coach-loading': 'true' }, t('coach_searching')));
    return;
  }

  // Three outcomes, three different things on screen. Collapsing them is how
  // a retrieval failure turns into a training answer Raed trusts and
  // shouldn't. The monthly ceiling was reached.
  if (coachState.answer && coachState.answer.status === 'over_budget') {
    const a = coachState.answer;
    root.appendChild(h('div', { class: 'notice warn', 'data-coach-over-budget': 'true' },
      h('strong', {}, t('coach_over_budget')),
      h('p', { class: 'tiny muted coach-notice-hint' }, tf('coach_over_budget_hint', {
        month: fmtUsd(a.month_usd), cap: fmtUsd(a.cap_usd),
      })),
    ));
    if ((coachState.results || []).length) renderCoachAnswer(root);
    return;
  }
  if (coachState.status === 'no_match') {
    // Deliberately NOT `.warn`: the library answered, and «nothing here» is an
    // answer. Painting it in the failure colour is the exact conflation the
    // spec for this state exists to prevent.
    root.appendChild(h('div', { class: 'notice', 'data-coach-no-match': 'true' },
      h('strong', {}, t('coach_no_match')),
      h('p', { class: 'tiny muted coach-notice-hint' }, t('coach_no_match_hint')),
    ));
    return;
  }
  if (coachState.status === 'unauthorized') {
    root.appendChild(h('div', { class: 'notice warn', 'data-coach-error': 'true' },
      h('strong', {}, t('coach_unauthorized')),
      h('p', { class: 'tiny muted coach-notice-hint' }, t('coach_unauthorized_hint')),
    ));
    return;
  }
  if (coachState.status === 'offline' || coachState.status === 'error') {
    root.appendChild(h('div', { class: 'notice warn', 'data-coach-error': 'true' },
      h('strong', {}, t(coachState.status === 'offline' ? 'coach_offline' : 'coach_error')),
      h('p', { class: 'tiny muted coach-notice-hint' }, t(coachState.status === 'offline' ? 'coach_offline_hint' : 'coach_error_hint')),
      // The raw failure, verbatim. It is diagnostic text from the network
      // stack, not copy, so it is never translated — only isolated.
      h('p', { class: 'tiny muted coach-notice-hint' }, h('bdi', { class: 'ltr-run' }, coachState.error)),
    ));
    return;
  }

  renderCoachAnswer(root);
}

// One passage. Shows the Arabic translation when the library has one and keeps
// the English original one tap away, because the Arabic is machine translation
// of a book he paid for and he should be able to check it.
function coachPassageCard(passage, index, cited) {
  const arabic = passage.text_ar;
  const showEnglish = coachEnglish.has(index) || !arabic;
  const open = coachOpen.has(index);
  // The fade only belongs on text that is actually cut off.
  const textNode = h('p', {
    class: 'coach-text' + (showEnglish ? ' ltr-run' : ''),
    ...(showEnglish ? { dir: 'ltr' } : {}),
  }, showEnglish ? passage.text : arabic);
  if (!open) {
    requestAnimationFrame(() => {
      if (!textNode.isConnected) return;
      // The max-height the .clipped rule imposes, checked against the real
      // content height before committing to it.
      const limit = parseFloat(getComputedStyle(textNode).fontSize) * 8.5;
      if (textNode.scrollHeight > limit + 2) {
        textNode.classList.add('clipped');
      } else {
        // Nothing is hidden, so «اقرأ المقطع كاملاً» would reveal nothing.
        textNode.dataset.coachFits = 'true';
        expandBtn.hidden = true;
      }
    });
  }

  const card = h('article', {
    class: 'coach-passage' + (cited ? ' cited' : ''),
    'data-coach-passage': 'true',
    ...(cited ? { 'data-coach-cited': 'true' } : {}),
  },
    h('div', { class: 'coach-source' },
      // The number the answer cites. Same numbering, so "[3]" up there and "3"
      // down here are the same passage — that is the whole verification path.
      h('span', { class: 'coach-cite num' }, String(index + 1)),
      // Book titles are English and stay English (T1). h() isolates Latin runs
      // on its own, so no manual <bdi> here — that is what produced nested bdi.
      h('strong', {}, passage.work),
      h('span', { class: 'tiny muted coach-page' }, ' · ', numbered('coach_page', passage.page)),
      arabic && !showEnglish
        ? h('span', { class: 'coach-tag' }, t('coach_translated'))
        : null,
    ),
    textNode,
  );
  // Two small actions on one row. Both are about reading the evidence, so they
  // belong together rather than stacked.
  const actions = h('div', { class: 'coach-actions' });
  const expandBtn = h('button', {
    class: 'btn tiny ghost coach-more-text',
    'data-coach-expand': String(index),
    onClick: () => {
      if (coachOpen.has(index)) coachOpen.delete(index);
      else coachOpen.add(index);
      renderCoach();
    },
  }, t(open ? 'coach_read_less' : 'coach_read_full'));
  actions.appendChild(expandBtn);
  if (arabic) {
    actions.appendChild(h('button', {
      class: 'btn tiny ghost coach-lang',
      'data-coach-lang': String(index),
      onClick: () => {
        if (coachEnglish.has(index)) coachEnglish.delete(index);
        else coachEnglish.add(index);
        renderCoach();
      },
    }, t(showEnglish ? 'coach_show_arabic' : 'coach_show_english')));
  }
  card.appendChild(actions);
  return card;
}

// The answer, then the passages it was built from, then the rest.
function renderCoachAnswer(root) {
  const answer = coachState.answer;
  const results = coachState.results;

  // The «this is one you already have» banner is rendered by renderCoach()
  // above the question, so an older answer is labelled before it is read
  // rather than after — and so the over-budget branch cannot print it twice.

  // `answered` alone is not enough: the model returns the flag and the source
  // list independently, so {answered: true, used: []} is reachable. An answer
  // that names no passage is treated as no answer.
  const cited = answer && Array.isArray(answer.used) ? answer.used : [];
  // An answer off the open internet is a different kind of thing from a line
  // in a book he paid for, so it is a separate state rather than a badge on
  // the same card.
  const webUrls = answer && Array.isArray(answer.citations) ? answer.citations.filter(isSafeHttpUrl) : [];
  // The same judgement the log writes by, so the notebook can never hold a
  // sentence this screen would refuse to print.
  const kind = coachAnswerKind(answer);
  const fromWeb = kind === 'web';
  const isAnswer = kind === 'books';
  const unsourced = answer && answer.status === 'ok' && answer.answered && answer.text
    && cited.length === 0 && !fromWeb;
  const isRefusal = (answer && answer.status === 'ok' && !answer.answered) || unsourced;

  if (fromWeb) {
    const card = h('article', { class: 'coach-answer from-web', 'data-coach-web': 'true' },
      h('div', { class: 'coach-answer-label web' }, t('coach_from_web')),
      webAnswerText(answer.text),
      h('p', { class: 'tiny muted' }, t('coach_web_note')),
    );
    const urls = webUrls;
    if (urls.length) {
      const list = h('div', { class: 'coach-cites' },
        h('div', { class: 'm-label tiny muted' }, t('coach_web_sources')));
      urls.forEach((url) => {
        let label = url;
        // The host is what tells him whether to trust it; the rest of a
        // tracking-laden URL is noise he cannot read on a phone anyway.
        try { label = new URL(url).hostname.replace(/^www\./, ''); } catch (_) { /* keep raw */ }
        list.appendChild(h('a', {
          class: 'coach-cite-link', href: url, target: '_blank', rel: 'noopener noreferrer',
        }, h('bdi', { class: 'ltr-run' }, label)));
      });
      card.appendChild(list);
    }
    root.appendChild(card);
  } else if (isAnswer) {
    root.appendChild(h('article', { class: 'coach-answer', 'data-coach-answer': 'true' },
      h('div', { class: 'coach-answer-label' }, t('coach_answer_label')),
      coachAnswerText(answer.text, results.length),
      // Says so when the first search missed and the rewrite found it, because
      // "your books do not cover this" was wrong a moment earlier and he should
      // be able to see that the second look is what changed the answer.
      answer.pass === 2 && answer.rewritten_as
        ? h('p', { class: 'tiny muted coach-retry' },
            tf('coach_searched_again', { q: answer.rewritten_as }))
        : null,
    ));
  } else if (unsourced) {
    // The model claimed an answer and named no passage for it. Its sentence is NOT
    // printed: reprinting it under a «not in your books» heading would put an
    // unsupported claim in front of him while looking careful.
    root.appendChild(h('article', { class: 'coach-answer unanswered', 'data-coach-unanswered': 'true' },
      h('strong', {}, t('coach_unanswered')),
      h('p', { class: 'tiny muted' }, t('coach_unsourced_hint')),
    ));
  } else if (isRefusal) {
    // Not an error state. The search worked; the books do not cover it.
    root.appendChild(h('article', { class: 'coach-answer unanswered', 'data-coach-unanswered': 'true' },
      h('strong', {}, t('coach_unanswered')),
      h('p', { class: 'tiny muted' }, t('coach_unanswered_hint')),
    ));
  } else if (answer && answer.status === 'unconfigured') {
    root.appendChild(h('div', { class: 'notice', 'data-coach-answer-off': 'true' },
      t('coach_answer_off')));
  } else if (!answer || answer.status === 'failed') {
    root.appendChild(h('div', { class: 'notice', 'data-coach-answer-off': 'true' },
      t('coach_answer_failed')));
  }

  if (fromWeb) {
    // Nothing from the library is shown under a web answer. The passages that
    // came back are the ones the model judged did NOT answer the question,
    // and printing them here would look exactly like sourcing.
    return;
  }
  const rest = results.map((_, i) => i).filter((i) => !cited.includes(i));

  if (cited.length) {
    root.appendChild(h('div', { class: 'eyebrow coach-section', 'data-coach-count': 'true' },
      t('coach_sources_used')));
    cited.forEach((i) => root.appendChild(coachPassageCard(results[i], i, true)));
  }

  if (rest.length) {
    // Collapsed whenever the passages are not the answer — either because the
    // answer named the ones it used, or because there IS no answer and these
    // are the near-misses.
    const collapse = cited.length > 0 || isRefusal;
    if (collapse) {
      const more = h('details', { class: 'coach-more', 'data-coach-more': 'true' },
        // The label goes inside a span. The summary is a flex row, so a bare
        // «3 مقاطع أخرى وُجدت» became two flex items — the isolated numeral and
        // the rest — and flex drops the space between them: «3مقاطع».
        h('summary', {}, h('span', {}, coachMoreLabel(rest.length))));
      rest.forEach((i) => more.appendChild(coachPassageCard(results[i], i, false)));
      root.appendChild(more);
    } else {
      // No answer was written at all — the passages are the whole product, so
      // they stay open, exactly as the coach behaved before this layer existed.
      root.appendChild(h('div', { class: 'eyebrow coach-section', 'data-coach-count': 'true' },
        coachFoundLabel(results.length)));
      rest.forEach((i) => root.appendChild(coachPassageCard(results[i], i, false)));
    }
  }

  root.appendChild(h('p', { class: 'tiny muted coach-footer' }, t('coach_footer')));
}
