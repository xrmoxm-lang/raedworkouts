/* The exercise library: one catalogue, one sheet.
 *
 * v17r2 — Raed: «ما أحس أنها مرتبة بشكل جيد». It was three levels of nested
 * accordions (part → muscle → exercise) whose rows all looked alike, each one
 * expanding INLINE into clips, chips and buttons, so the page never read as a
 * list of exercises. Now: a filter rail of parts, one flat `.section` per
 * muscle, and everything an exercise carries lives in its bottom sheet. */

import { $, confirmAction, h, icon, toast, toastSaved } from '../core/dom.js';
import { muscleLabel, t, tf } from '../core/i18n.js';
import { render } from '../core/shell.js';
import { saveLocal, state } from '../core/store.js';
import {
  LIB_HIERARCHY,
  addCustomExercise,
  addCustomVideo,
  buildExerciseVideos,
  deleteCustomExercise,
  exerciseInGroup,
  getAllExercises,
  getJNUrl,
  isVideoHidden,
  jnHasCustomOverride,
  setJNUrl,
  toggleVideoVisibility,
  videoIdentity,
} from '../core/videos.js';
import { figure } from '../ui/figure.js';
import { buildVideoTile } from '../ui/kit.js';

// LIB_HIERARCHY carries English labels because it is data, not copy. Each group
// id maps to its own semantic locale key so the screen never looks a string up
// by its English source.
const GROUP_LABEL_KEY = { upper: 'upper_body', arms: 'arms', lower: 'lower_body', core: 'core' };
// Every muscle key a part owns, so an exercise can be counted against the part
// without walking its sub-groups twice.
const groupKeys = (group) => Object.values(group.submuscles).flatMap((sub) => sub.keys);

const closeSheet = () => $('#modal-overlay').classList.remove('show');
const openSheet = () => $('#modal-overlay').classList.add('show');

// Was a native prompt(): English, unstyled, and suppressible by an installed PWA
// shell. Missed by the earlier sweep because it interpolates the exercise name
// instead of taking a quoted literal.
function editJNUrlPrompt(exerciseId) {
  const ex = getAllExercises().find(e => e.id === exerciseId);
  if (!ex) return;
  const modal = $('#modal');
  modal.innerHTML = '';
  const input = h('input', {
    type: 'url', class: 'search-input', dir: 'ltr',
    'aria-label': t('video_edit_jn_plain'),
    placeholder: 'https://youtube.com/…',
    value: getJNUrl(exerciseId) || '',
  });
  modal.appendChild(h('div', { class: 'xs-head' },
    h('h3', {}, t('video_edit_jn_plain')),
    h('div', { class: 'xs-sub' }, h('bdi', { class: 'ltr-run' }, ex.name)),
  ));
  modal.appendChild(h('div', { class: 'xs-section' },
    h('div', { class: 'field' },
      h('div', { class: 'desc' }, t('jn_url_hint')),
      input,
    ),
  ));
  modal.appendChild(h('div', { class: 'confirm-actions' },
    h('button', {
      class: 'btn primary full',
      onClick: () => {
        const next = input.value.trim();
        closeSheet();
        setJNUrl(exerciseId, next);
        toastSaved(t('jn_url_updated'));
        render();
      },
    }, t('save')),
    h('button', { class: 'btn ghost full', onClick: closeSheet }, t('cancel')),
  ));
  openSheet();
}

// The library's search box and its part filter, held here instead of on
// `window._libSearch`. Same behaviour: they survive a re-render, reset on reload.
let libSearch = '';
let libFilter = 'all';
// exercise id -> its rendered list row, so hiding one clip redraws that row
// instead of the whole catalogue (which used to scroll him away from it).
const rowIndex = new Map();

const matchesSearch = (ex) => {
  const q = libSearch.trim().toLowerCase();
  if (!q) return true;
  return (ex.name + ' ' + (ex.name_ar || '') + ' ' + (ex.primary || []).join(' ')).toLowerCase().includes(q);
};

export function renderLibrary() {
  const root = $('#page-library');
  root.innerHTML = '';
  rowIndex.clear();
  const allEx = getAllExercises();

  root.appendChild(h('div', { class: 'page-header' },
    h('h1', {}, t('exercise_library')),
    h('div', { class: 'sub' },
      h('span', { class: 'num' }, String(allEx.length)),
      ' ',
      t('library_count_word'),
    ),
  ));

  // The input is built ONCE and kept. It used to be destroyed and rebuilt on
  // every keystroke by re-rendering the whole page, so the field lost focus
  // after the first character and he could not type a second one.
  const searchInput = h('input', {
    type: 'search', class: 'search-input',
    placeholder: t('library_search_placeholder'),
    'aria-label': t('library_search_placeholder'),
    value: libSearch,
    onInput: (e) => { libSearch = e.target.value; paint(); },
  });
  root.appendChild(h('div', { class: 'search-row' }, searchInput));

  const rail = h('div', { class: 'cluster lib-filters', role: 'group', 'aria-label': t('library_filter_label') });
  const results = h('div', { class: 'lib-results' });
  // The rail's counts follow the search, so when a word matches nothing under
  // the part he is filtered to, the rail says which part it DID match in.
  const paint = () => { paintRail(rail, paint); paintResults(results); };

  root.appendChild(rail);
  root.appendChild(results);
  root.appendChild(h('button', {
    class: 'btn full lib-add',
    onClick: () => openAddCustomExerciseModal(),
  }, icon('plus', 16), h('span', {}, t('custom_exercise_button'))));

  paint();
}

function paintRail(rail, paint) {
  rail.innerHTML = '';
  const matches = getAllExercises().filter(matchesSearch);
  const chip = (id, label, n) => h('button', {
    type: 'button',
    class: 'chip' + (libFilter === id ? ' active' : ''),
    'aria-pressed': libFilter === id ? 'true' : 'false',
    onClick: () => { libFilter = id; paint(); },
  }, h('span', {}, label), h('span', { class: 'num' }, String(n)));

  rail.appendChild(chip('all', t('library_filter_all'), matches.length));
  for (const group of LIB_HIERARCHY) {
    const keys = groupKeys(group);
    rail.appendChild(chip(
      group.id,
      t(GROUP_LABEL_KEY[group.id] || 'exercise_library'),
      matches.filter(ex => exerciseInGroup(ex, keys)).length,
    ));
  }
}

function paintResults(results) {
  results.innerHTML = '';
  rowIndex.clear();
  const matches = getAllExercises().filter(matchesSearch);
  let shown = 0;

  for (const group of LIB_HIERARCHY) {
    if (libFilter !== 'all' && libFilter !== group.id) continue;
    for (const sub of Object.values(group.submuscles)) {
      const list = matches.filter(ex => exerciseInGroup(ex, sub.keys));
      if (!list.length) continue;
      shown += list.length;
      results.appendChild(h('section', { class: 'section lib-section' },
        h('div', { class: 'section-head' },
          h('div', { class: 'eyebrow' }, muscleLabel(sub.keys[0])),
          h('span', { class: 'num' }, String(list.length)),
        ),
        h('div', { class: 'list' }, list.map(exerciseRow)),
      ));
    }
  }

  if (!shown) results.appendChild(h('div', { class: 'empty' }, t('library_no_name_match')));
}

// One catalogue row. `.ex` stays on it so `#page-library .ex` still matches.
// A div with role=button rather than a <button>: the row is flow content
// (two stacked lines and a figure), which a <button> may not contain.
function exerciseRow(ex) {
  const clips = buildExerciseVideos(ex.id, ex).length;
  const open = () => openExerciseSheet(ex.id);
  const row = h('div', {
    class: 'row is-button ex', role: 'button', tabindex: '0',
    'data-library-exercise': ex.id,
    onClick: open,
    onKeydown: (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      open();
    },
  },
    h('div', { class: 'row-lead' }, figure(ex.primary || [], ex.secondary || [], 's40')),
    h('div', { class: 'row-body' },
      h('div', { class: 'row-title' }, h('bdi', { class: 'ltr-run' }, ex.name)),
      // The Arabic name where there is one; 45 of the 78 have none, and the
      // muscle it trains is the next most useful thing to say about it.
      h('div', { class: 'row-hint' }, ex.name_ar || muscleLabel((ex.primary || [])[0])),
    ),
    h('div', { class: 'row-trail' },
      // The mark is a drawn ::before, so on its own the row would announce the
      // bare number. The label names it inside the row's own accessible name.
      clips ? h('span', {
        class: 'lib-clips',
        title: tf('library_clip_count', { n: clips }),
        'aria-label': tf('library_clip_count', { n: clips }),
      }, h('span', { class: 'num' }, String(clips))) : null,
      ex.is_custom ? h('span', { class: 'chip lib-mark' }, t('library_custom_mark')) : null,
      // Plain `.chevron`, not `.chevron.forward`: measured at 390×844 in RTL
      // the `.forward` rule rotates it 135° and it points UP.
      h('span', { class: 'chevron', 'aria-hidden': 'true' }),
    ),
  );
  rowIndex.set(ex.id, row);
  return row;
}

// Redraw ONE row in place. Toggling a clip used to re-render the whole screen,
// which collapsed the exercise he was looking at and scrolled him away from it.
function refreshRow(exerciseId) {
  const row = rowIndex.get(exerciseId);
  const ex = getAllExercises().find(e => e.id === exerciseId);
  if (!row || !ex || !row.isConnected) return;
  row.replaceWith(exerciseRow(ex));
}

// «+ فيديو» and «عدّل رابط JN» each replace the sheet's own content with their
// own. When that one closes, the exercise comes back rather than dropping him
// on the list with no idea which exercise he was reading.
function subSheet(exerciseId, open) {
  const overlay = $('#modal-overlay');
  const watch = new MutationObserver(() => {
    if (overlay.classList.contains('show')) return;
    watch.disconnect();
    setTimeout(() => openExerciseSheet(exerciseId), 0);
  });
  watch.observe(overlay, { attributes: true, attributeFilter: ['class'] });
  open();
}

// Everything the inline card used to hold, in the sheet: the cue, the clip
// strip with its per-clip visibility toggles, both clip actions, the
// alternatives, and the delete for a custom exercise.
function openExerciseSheet(exerciseId) {
  const ex = getAllExercises().find(e => e.id === exerciseId);
  if (!ex) { renderLibrary(); return; }
  const m = $('#modal');
  m.innerHTML = '';

  const tags = [
    ...(ex.primary || []).map(key => h('span', { class: 'muscle-tag' }, muscleLabel(key))),
    ...(ex.secondary || []).map(key => h('span', { class: 'muscle-tag secondary' }, muscleLabel(key))),
  ];
  m.appendChild(h('div', { class: 'xs-head' },
    h('h3', {}, h('bdi', { class: 'ltr-run' }, ex.name)),
    ex.name_ar ? h('div', { class: 'xs-sub' }, ex.name_ar) : null,
    tags.length ? h('div', { class: 'cluster lib-tags' }, tags) : null,
  ));

  if (ex.cue) {
    m.appendChild(h('section', { class: 'xs-section' },
      h('div', { class: 'cue' }, icon('spark', 15), h('span', {}, ex.cue))));
  }

  const clipSection = h('section', { class: 'xs-section' });
  const paintClips = () => {
    clipSection.innerHTML = '';
    const allVideos = buildExerciseVideos(ex.id, ex, { includeHidden: true });
    clipSection.appendChild(h('div', { class: 'xs-label' }, t('library_clips_label')));
    if (allVideos.length) {
      clipSection.appendChild(h('div', { class: 'tiny muted clip-hint' }, t('video_tap_hint')));
      clipSection.appendChild(h('div', { class: 'video-row' },
        allVideos.map(v => {
          const hidden = isVideoHidden(ex.id, videoIdentity(v));
          const wrap = h('div', { class: 'video-thumb-wrap' + (hidden ? ' hidden-video' : '') });
          wrap.appendChild(buildVideoTile(v));
          wrap.appendChild(h('button', {
            type: 'button',
            class: 'video-toggle' + (hidden ? ' off' : ' on'),
            title: hidden ? t('hidden_video') : t('showing_video'),
            'aria-label': hidden ? t('hidden_video') : t('showing_video'),
            onClick: (e) => {
              e.preventDefault(); e.stopPropagation();
              toggleVideoVisibility(ex.id, videoIdentity(v));
              paintClips();
              refreshRow(ex.id);
            },
          }, hidden ? '⊘' : '✓'));
          return wrap;
        })));
    } else {
      clipSection.appendChild(h('div', { class: 'xs-empty' }, t('no_saved_video')));
    }

    const actions = h('div', { class: 'xs-grid' });
    actions.appendChild(h('button', {
      class: 'btn xs-action',
      // Same validation as the training screen: one path, one rule.
      onClick: () => subSheet(ex.id, () => addCustomVideo(ex.id)),
      // One <span>, not the label passed straight in: `.xs-action` is a COLUMN
      // flex box, and h() splits «عدّل رابط JN» into a text node plus a
      // <bdi> — two flex items, which stacked «JN» under its own label.
    }, h('span', {}, t('video_add_button'))));
    actions.appendChild(h('button', {
      class: 'btn xs-action',
      onClick: () => subSheet(ex.id, () => editJNUrlPrompt(ex.id)),
    }, h('span', {}, jnHasCustomOverride(ex.id) ? t('video_edit_jn_custom_plain') : t('video_edit_jn_plain'))));
    if ((state.custom_videos[ex.id] || []).length) {
      actions.appendChild(h('button', {
        class: 'btn xs-action xs-wide danger',
        onClick: () => {
          confirmAction({
            title: t('video_clear_custom'),
            body: t('video_clear_confirm'),
            confirmLabel: t('video_clear_custom'),
          }).then((yes) => {
            if (yes) {
              delete state.custom_videos[ex.id];
              saveLocal();
            }
            // confirmAction closes the sheet to ask; either answer comes back
            // to the exercise he was reading.
            openExerciseSheet(ex.id);
          });
        },
      }, h('span', {}, t('video_clear_custom'))));
    }
    clipSection.appendChild(actions);
  };
  paintClips();
  m.appendChild(clipSection);

  const alternatives = (ex.alternatives || [])
    .map(altId => getAllExercises().find(e => e.id === altId))
    .filter(Boolean);
  if (alternatives.length) {
    m.appendChild(h('section', { class: 'xs-section' },
      h('div', { class: 'xs-label' }, t('library_alternatives')),
      // These used to call router('library') — they scrolled the page to the
      // top and did nothing else. A named alternative opens that exercise.
      h('div', { class: 'cluster alt-row' }, alternatives.map(alt => h('button', {
        type: 'button', class: 'chip',
        onClick: () => openExerciseSheet(alt.id),
      }, h('bdi', { class: 'ltr-run' }, alt.name)))),
    ));
  }

  if (ex.is_custom) {
    m.appendChild(h('section', { class: 'xs-section' },
      h('button', {
        class: 'btn full danger',
        onClick: () => {
          confirmAction({
            title: t('delete_custom_exercise'),
            body: tf('delete_custom_exercise_body', { name: ex.name }),
            confirmLabel: t('delete_custom_exercise'),
          }).then((yes) => {
            if (!yes) { openExerciseSheet(ex.id); return; }
            deleteCustomExercise(ex.id);
            closeSheet();
            renderLibrary();
            toastSaved(t('deleted'));
          });
        },
      }, icon('trash', 16), h('span', {}, t('delete_custom_exercise_plain'))),
    ));
  }

  m.appendChild(h('button', { class: 'btn full xs-done', onClick: closeSheet }, t('done')));
  openSheet();
}

// ---- Add custom exercise modal -------------------------------
function openAddCustomExerciseModal() {
  const m = $('#modal');
  m.innerHTML = '';
  // Form state captured locally
  const form = { name: '', name_ar: '', primary: 'chest', jeff_nippard: '', mohannad_url: '' };
  const muscleOptions = Object.entries(RW.MUSCLES).map(([k]) =>
    h('option', { value: k, ...(form.primary === k ? { selected: '' } : {}) }, muscleLabel(k))
  );
  m.appendChild(h('div', { class: 'xs-head' },
    h('h3', {}, t('add_custom_exercise')),
    h('div', { class: 'xs-sub' }, t('custom_exercise_intro')),
  ));

  const field = (labelKey, descKey, input) => h('label', { class: 'field' },
    h('span', {}, t(labelKey)),
    h('span', { class: 'desc' }, t(descKey)),
    input,
  );
  m.appendChild(h('div', { class: 'xs-section stack' },
    field('name_english', 'required', h('input', {
      type: 'text', dir: 'ltr', placeholder: t('cable_pec_example'),
      onInput: (e) => { form.name = e.target.value; },
    })),
    field('name_arabic', 'optional', h('input', {
      type: 'text', placeholder: t('arabic_name_example'),
      onInput: (e) => { form.name_ar = e.target.value; },
    })),
    field('primary_muscle', 'library_section_hint', h('select', {
      onChange: (e) => { form.primary = e.target.value; },
    }, muscleOptions)),
    field('jeff_nippard_url', 'form_video_hint', h('input', {
      type: 'url', dir: 'ltr', placeholder: 'https://youtube.com/…',
      onInput: (e) => { form.jeff_nippard = e.target.value; },
    })),
    field('demo_video_url', 'short_video_hint', h('input', {
      type: 'url', dir: 'ltr', placeholder: 'https://youtube.com/shorts/…',
      onInput: (e) => { form.mohannad_url = e.target.value; },
    })),
  ));

  m.appendChild(h('div', { class: 'confirm-actions' },
    h('button', {
      class: 'btn primary full',
      onClick: () => {
        if (!form.name || !form.name.trim()) { toast(t('name_required')); return; }
        addCustomExercise(form);
        closeSheet();
        renderLibrary();
        toast(tf('added_to_library', { name: form.name }));
      },
    }, t('save')),
    h('button', { class: 'btn ghost full', onClick: closeSheet }, t('cancel')),
  ));
  openSheet();
}
