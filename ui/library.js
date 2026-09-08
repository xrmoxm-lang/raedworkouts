/* The exercise library. */

import { $, confirmAction, h, icon, toast, toastSaved } from '../core/dom.js';
import { muscleLabel, t, tf } from '../core/i18n.js';
import { render, router } from '../core/shell.js';
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

// The library's search box, held here instead of on `window._libSearch`. Same
// behaviour: it survives a re-render and resets on reload.
let libSearch = '';

export function renderLibrary() {
  const root = $('#page-library');
  root.innerHTML = '';
  const allEx = getAllExercises();
  root.appendChild(h('div', { class: 'page-header' },
    h('h1', {}, t('exercise_library')),
    h('div', { class: 'sub' },
      h('span', { class: 'num' }, String(allEx.length)),
      ' ',
      t('library_count_hint'),
    ),
  ));

  // The input is built ONCE and kept. It used to be destroyed and rebuilt on
  // every keystroke by re-rendering the whole page, so the field lost focus
  // after the first character and he could not type a second one.
  const results = h('div', { class: 'lib-results' });
  const searchInput = h('input', {
    type: 'search', class: 'search-input',
    placeholder: t('library_search_placeholder'),
    'aria-label': t('library_search_placeholder'),
    value: libSearch,
    onInput: (e) => { libSearch = e.target.value; renderResults(results); },
  });
  root.appendChild(h('div', { class: 'search-row' }, searchInput));

  root.appendChild(h('button', {
    class: 'btn full',
    onClick: () => openAddCustomExerciseModal(),
  }, icon('plus', 16), h('span', {}, t('custom_exercise_button'))));

  root.appendChild(results);
  renderResults(results);
}

function renderResults(results) {
  results.innerHTML = '';
  const allEx = getAllExercises();
  const search = libSearch || '';
  const searching = search.trim().length > 0;

  // Filter exercises by search (applied globally, then re-grouped)
  const q = search.toLowerCase();
  const matchesSearch = (ex) => {
    if (!searching) return true;
    return (ex.name + ' ' + (ex.name_ar || '') + ' ' + (ex.primary || []).join(' ')).toLowerCase().includes(q);
  };

  const filteredEx = allEx.filter(matchesSearch);

  if (!filteredEx.length) {
    results.appendChild(h('div', { class: 'empty' }, t('no_exercises_match')));
    return;
  }

  // Render hierarchy
  for (const group of LIB_HIERARCHY) {
    const groupExercises = [];
    const groupSections = [];
    for (const [subKey, subInfo] of Object.entries(group.submuscles)) {
      const subExercises = filteredEx.filter(ex => exerciseInGroup(ex, subInfo.keys));
      if (subExercises.length === 0) continue;
      groupExercises.push(...subExercises);
      groupSections.push({ key: subKey, info: subInfo, exercises: subExercises });
    }
    if (groupExercises.length === 0) continue;

    const groupCount = groupExercises.length;
    const groupOpen = searching || group.id === 'upper'; // open Upper by default; open all when searching
    const groupDetails = h('details', {
      class: 'lib-group',
      ...(groupOpen ? { open: '' } : {}),
    });
    groupDetails.appendChild(h('summary', { class: 'lib-group-summary' },
      h('span', { class: 'label' }, t(GROUP_LABEL_KEY[group.id] || 'exercise_library')),
      h('span', { class: 'count num' }, String(groupCount)),
    ));

    for (const section of groupSections) {
      const subDetails = h('details', {
        class: 'lib-sub',
        ...(searching ? { open: '' } : {}),
      });
      subDetails.appendChild(h('summary', { class: 'lib-sub-summary' },
        h('span', { class: 'label' }, muscleLabel(section.info.keys[0])),
        h('span', { class: 'count num' }, String(section.exercises.length)),
      ));
      const grid = h('div', { class: 'lib-grid' });
      section.exercises.forEach(ex => grid.appendChild(renderLibExerciseCard(ex)));
      subDetails.appendChild(grid);
      groupDetails.appendChild(subDetails);
    }
    results.appendChild(groupDetails);
  }
}

// Redraw ONE card in place. Toggling a clip used to re-render the whole screen,
// which collapsed the exercise he was looking at and scrolled him away from it.
function refreshCard(exerciseId, card) {
  const ex = getAllExercises().find(e => e.id === exerciseId);
  if (!ex) { renderLibrary(); return; }
  const next = renderLibExerciseCard(ex);
  if (card.classList.contains('expanded')) next.classList.add('expanded');
  card.replaceWith(next);
}

// Per-exercise card builder, shared between Library renders
function renderLibExerciseCard(ex) {
  const card = h('div', { class: 'ex' });
  const head = h('div', { class: 'ex-head', onClick: () => card.classList.toggle('expanded') },
    figure(ex.primary || [], ex.secondary || [], 's40'),
    h('div', { class: 'ex-info' },
      h('h4', {}, h('bdi', { class: 'ltr-run' }, ex.name)),
      h('div', { class: 'meta' },
        h('span', { class: 'muscle-tag' }, muscleLabel(ex.primary[0])),
        ex.name_ar || '',
      ),
    ),
    // The chevron is drawn by the stylesheet; the element stays so the rotation
    // has something to hang on.
    h('div', { class: 'ex-status', 'aria-hidden': 'true' }),
  );
  const body = h('div', { class: 'ex-body' });
  if (ex.cue) body.appendChild(h('div', { class: 'cue' }, icon('spark', 15), h('span', {}, ex.cue)));
  const customVids = state.custom_videos[ex.id] || [];
  const allVideos = buildExerciseVideos(ex.id, ex, { includeHidden: true });
  if (allVideos.length) {
    body.appendChild(h('div', { class: 'tiny muted clip-hint' }, t('video_tap_hint')));
    body.appendChild(h('div', { class: 'video-row' },
      allVideos.map(v => {
        const hidden = isVideoHidden(ex.id, videoIdentity(v));
        const wrap = h('div', { class: 'video-thumb-wrap' + (hidden ? ' hidden-video' : '') });
        const link = buildVideoTile(v);
        // Toggle button overlay
        const toggle = h('button', {
          type: 'button',
          class: 'video-toggle' + (hidden ? ' off' : ' on'),
          title: hidden ? t('hidden_video') : t('showing_video'),
          'aria-label': hidden ? t('hidden_video') : t('showing_video'),
          onClick: (e) => {
            e.preventDefault(); e.stopPropagation();
            toggleVideoVisibility(ex.id, videoIdentity(v));
            refreshCard(ex.id, card);
          },
        }, hidden ? '⊘' : '✓');
        wrap.appendChild(link);
        wrap.appendChild(toggle);
        return wrap;
      })
    ));
  }

  const actions = h('div', { class: 'cluster ex-actions' });
  actions.appendChild(h('button', { class: 'btn tiny', onClick: () => {
    // Same validation as the training screen: one path, one rule.
    addCustomVideo(ex.id);
    refreshCard(ex.id, card);
  }}, t('video_add_button')));
  actions.appendChild(h('button', {
    class: 'btn tiny',
    onClick: () => editJNUrlPrompt(ex.id),
  }, jnHasCustomOverride(ex.id) ? t('video_edit_jn_custom_plain') : t('video_edit_jn_plain')));
  if (customVids.length) {
    actions.appendChild(h('button', { class: 'btn tiny ghost', onClick: () => {
      confirmAction({
        title: t('video_clear_custom'),
        body: t('video_clear_confirm'),
        confirmLabel: t('video_clear_custom'),
      }).then((yes) => {
        if (!yes) return;
        delete state.custom_videos[ex.id];
        saveLocal();
        refreshCard(ex.id, card);
      });
    }}, t('video_clear_custom')));
  }
  body.appendChild(actions);

  if (ex.alternatives?.length) {
    body.appendChild(h('div', { class: 'alt-row' },
      h('span', { class: 'tiny muted' }, t('alternatives')),
      ex.alternatives.map(altId => {
        const alt = getAllExercises().find(e => e.id === altId);
        return alt ? h('a', { class: 'chip', onClick: (e) => { e.preventDefault(); router('library'); }, href: '#library' },
          h('bdi', { class: 'ltr-run' }, alt.name)) : null;
      })
    ));
  }
  // Custom-exercise: allow delete
  if (ex.is_custom) {
    body.appendChild(h('div', { class: 'cluster ex-actions' },
      h('button', {
        class: 'btn tiny danger ghost',
        onClick: () => {
          confirmAction({
            title: t('delete_custom_exercise'),
            body: tf('delete_custom_exercise_body', { name: ex.name }),
            confirmLabel: t('delete_custom_exercise'),
          }).then((yes) => {
            if (!yes) return;
            deleteCustomExercise(ex.id);
            renderLibrary();
            toastSaved(t('deleted'));
          });
        },
      }, icon('trash', 16), h('span', {}, t('delete_custom_exercise_plain'))),
    ));
  }
  card.appendChild(head);
  card.appendChild(body);
  return card;
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
