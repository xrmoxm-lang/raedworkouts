/* The coach screen: question, answer, passages. */

import {
  COACH_EXAMPLES,
  COACH_LAST_KEY,
  activeCoachContext,
  askCoach,
  coachAnswerText,
  coachEnglish,
  coachFoundLabel,
  coachMoreLabel,
  coachOpen,
  coachState,
  setCoachState,
  webAnswerText,
} from '../core/coach.js';
import { $, h, icon } from '../core/dom.js';
import { fmtUsd, t, tf } from '../core/i18n.js';
import { saveLocal, settings, state } from '../core/store.js';
import { isSafeHttpUrl } from '../core/videos.js';

export function renderCoach() {
  const root = $('#page-coach');
  root.innerHTML = '';
  root.appendChild(h('div', { class: 'page-header' }, h('h1', {}, t('coach'))));

  // Disabled while a question is in flight. They were rendered before the
  // loading branch and never disabled, so a double tap on «اسأل» — easy on a
  // phone — fired a second metered request before the first had answered.
  const busy = coachState.status === 'loading';
  const input = h('input', {
    type: 'text', class: 'coach-input', value: coachState.question,
    placeholder: t('coach_placeholder'), 'data-coach-input': 'true',
    ...(busy ? { disabled: 'disabled' } : {}),
    onKeydown: (ev) => { if (ev.key === 'Enter') submit(); },
  });
  const submit = () => {
    if (coachState.status === 'loading') return;
    const question = input.value.trim();
    // The service rejects anything under 3 characters; catching it here keeps a
    // stray tap from rendering as a server error.
    if (question.length < 3) return;
    // The movement name rides along with the question rather than replacing it,
    // so "كم راحة؟" becomes a question about the machine he is standing at.
    const ctx = activeCoachContext();
    const useContext = ctx && settings.coach_use_context !== false;
    askCoach(question, useContext ? ctx : null);
  };

  // The handoff. Shown only while a session is actually running, because the
  // rest of the time there is nothing to hand off and the row would be chrome.
  const context = activeCoachContext();
  if (context) {
    root.appendChild(h('div', { class: 'coach-context', 'data-coach-context': 'true' },
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
    ));
  }

  // The ask box is the subject of this screen ONLY while the screen is empty.
  const answered = coachState.status !== 'idle';
  root.appendChild(h('section', { class: 'coach-ask' + (answered ? ' answered' : ''), 'data-coach-ask': 'true' },
    answered ? null : h('div', { class: 'coach-ask-head' },
      h('span', { class: 'coach-ask-mark' }, icon('coach', 22)),
      h('div', {},
        h('div', { class: 'coach-ask-title' }, t('coach_ask_title')),
        h('div', { class: 'coach-ask-sub' }, t('coach_intro')),
      ),
    ),
    h('div', { class: 'coach-row' },
      input,
      h('button', {
        class: 'btn primary', onClick: submit, 'data-coach-submit': 'true',
        ...(busy ? { disabled: 'disabled' } : {}),
      }, busy ? t('coach_asking') : t('coach_ask')),
    ),
  ));

  if (coachState.status === 'idle') {
    root.appendChild(h('div', { class: 'coach-block' },
      h('div', { class: 'coach-block-label' }, t('coach_try')),
      // The chips go through the same path as the typed question, context and
      // all. They used to call askCoach() bare, so tapping a chip mid-session
      // silently ignored the switch he had just left on.
      h('div', { class: 'coach-chips' }, COACH_EXAMPLES.map((example) => h('button', {
        class: 'btn tiny',
        onClick: () => { input.value = t(example); submit(); },
      }, t(example)))),
    ));

    // Roughly 57% of this screen was empty — measured, 481px of 844.
    const recent = (state.coach_recent || []).filter(Boolean);
    if (recent.length) {
      root.appendChild(h('div', { class: 'coach-block', 'data-coach-recent': 'true' },
        h('div', { class: 'coach-block-label' }, t('coach_recent')),
        h('div', { class: 'coach-chips' }, recent.map((question) => h('button', {
          class: 'btn tiny ghost',
          onClick: () => { input.value = question; submit(); },
        }, question))),
      ));
    }
    root.appendChild(h('footer', { class: 'coach-scope', 'data-coach-scope': 'true' },
      h('div', { class: 'coach-scope-line' }, t('coach_scope_books')),
      h('div', { class: 'coach-scope-note' }, t('coach_scope_note')),
    ));
    return;
  }

  if (coachState.status === 'loading') {
    root.appendChild(h('div', { class: 'card compact tiny muted', 'data-coach-loading': 'true' }, t('coach_searching')));
    return;
  }

  // Three outcomes, three different things on screen. Collapsing them is how
  // a retrieval failure turns into a training answer Raed trusts and
  // shouldn't. The monthly ceiling was reached.
  if (coachState.answer && coachState.answer.status === 'over_budget') {
    const a = coachState.answer;
    root.appendChild(h('div', { class: 'card compact warn', 'data-coach-over-budget': 'true' },
      h('strong', {}, t('coach_over_budget')),
      h('p', { class: 'tiny muted' }, tf('coach_over_budget_hint', {
        month: fmtUsd(a.month_usd), cap: fmtUsd(a.cap_usd),
      })),
    ));
    if ((coachState.results || []).length) renderCoachAnswer(root);
    return;
  }
  if (coachState.status === 'no_match') {
    root.appendChild(h('div', { class: 'card compact', 'data-coach-no-match': 'true' },
      h('strong', {}, t('coach_no_match')),
      h('p', { class: 'tiny muted' }, t('coach_no_match_hint')),
    ));
    return;
  }
  if (coachState.status === 'unauthorized') {
    root.appendChild(h('div', { class: 'card compact warn', 'data-coach-error': 'true' },
      h('strong', {}, t('coach_unauthorized')),
      h('p', { class: 'tiny muted' }, t('coach_unauthorized_hint')),
    ));
    return;
  }
  if (coachState.status === 'offline' || coachState.status === 'error') {
    root.appendChild(h('div', { class: 'card compact warn', 'data-coach-error': 'true' },
      h('strong', {}, t(coachState.status === 'offline' ? 'coach_offline' : 'coach_error')),
      h('p', { class: 'tiny muted' }, t(coachState.status === 'offline' ? 'coach_offline_hint' : 'coach_error_hint')),
      h('p', { class: 'tiny muted' }, h('bdi', { class: 'ltr-run' }, coachState.error)),
    ));
    return;
  }

  renderCoachAnswer(root);
}

// One passage card. Shows the Arabic translation when the library has one and
// keeps the English original one tap away, because the Arabic is machine
// translation of a book he paid for and he should be able to check it.
export function coachPassageCard(passage, index, cited) {
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
    class: 'card compact coach-passage' + (cited ? ' cited' : ''),
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
      h('span', { class: 'tiny muted' }, ' · ', tf('coach_page', { n: passage.page })),
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
export function renderCoachAnswer(root) {
  const answer = coachState.answer;
  const results = coachState.results;

  // Say so when this is yesterday's answer rather than one just returned.
  if (coachState.restored) {
    root.appendChild(h('div', { class: 'coach-restored', 'data-coach-restored': 'true' },
      h('span', {}, t('coach_restored')),
      h('button', {
        type: 'button', class: 'btn tiny ghost',
        onClick: () => {
          setCoachState({ status: 'idle', question: '', results: [], answer: null, error: '' });
          delete state[COACH_LAST_KEY];
          saveLocal();
          renderCoach();
        },
      }, t('coach_clear')),
    ));
  }

  // `answered` alone is not enough: the model returns the flag and the source
  // list independently, so {answered: true, used: []} is reachable. An answer
  // that names no passage is treated as no answer.
  const cited = answer && Array.isArray(answer.used) ? answer.used : [];
  // An answer off the open internet is a different kind of thing from a line
  // in a book he paid for, so it is a separate state rather than a badge on
  // the same card.
  const webUrls = answer && Array.isArray(answer.citations) ? answer.citations.filter(isSafeHttpUrl) : [];
  const fromWeb = answer && answer.status === 'ok' && answer.source === 'web' && answer.text
    && webUrls.length > 0;
  const isAnswer = answer && answer.status === 'ok' && answer.answered && answer.text && cited.length > 0 && !fromWeb;
  const unsourced = answer && answer.status === 'ok' && answer.answered && answer.text
    && cited.length === 0 && !fromWeb;
  const isRefusal = (answer && answer.status === 'ok' && !answer.answered) || unsourced;

  if (fromWeb) {
    const card = h('article', { class: 'card coach-answer from-web', 'data-coach-web': 'true' },
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
    root.appendChild(h('article', { class: 'card coach-answer', 'data-coach-answer': 'true' },
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
    root.appendChild(h('article', { class: 'card coach-answer unanswered', 'data-coach-unanswered': 'true' },
      h('strong', {}, t('coach_unanswered')),
      h('p', { class: 'tiny muted' }, t('coach_unsourced_hint')),
    ));
  } else if (isRefusal) {
    // Not an error state. The search worked; the books do not cover it.
    root.appendChild(h('article', { class: 'card coach-answer unanswered', 'data-coach-unanswered': 'true' },
      h('strong', {}, t('coach_unanswered')),
      h('p', { class: 'tiny muted' }, t('coach_unanswered_hint')),
    ));
  } else if (answer && answer.status === 'unconfigured') {
    root.appendChild(h('div', { class: 'card compact tiny muted', 'data-coach-answer-off': 'true' },
      t('coach_answer_off')));
  } else if (!answer || answer.status === 'failed') {
    root.appendChild(h('div', { class: 'card compact tiny muted', 'data-coach-answer-off': 'true' },
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
    root.appendChild(h('div', { class: 'tiny muted coach-section', 'data-coach-count': 'true' },
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
        h('summary', {}, coachMoreLabel(rest.length)));
      rest.forEach((i) => more.appendChild(coachPassageCard(results[i], i, false)));
      root.appendChild(more);
    } else {
      // No answer was written at all — the passages are the whole product, so
      // they stay open, exactly as the coach behaved before this layer existed.
      root.appendChild(h('div', { class: 'tiny muted coach-section', 'data-coach-count': 'true' },
        coachFoundLabel(results.length)));
      rest.forEach((i) => root.appendChild(coachPassageCard(results[i], i, false)));
    }
  }

  root.appendChild(h('p', { class: 'tiny muted', style: 'text-align:center;margin-top:4px;' }, t('coach_footer')));
}

