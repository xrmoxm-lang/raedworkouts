/* The screen he gets when this phone's saved copy will not open.
 *
 * Reached only from core/store.js's quarantine (loadLocal found a state blob
 * that does not parse). Everything about it is deliberate:
 *   - it BLOCKS. The app behind it is an empty default state, and every tap on
 *     an empty app is another chance to write that emptiness somewhere.
 *   - it says nothing was deleted, because nothing was: the unreadable text is
 *     kept under `raedworkouts.<user>.corrupt.v1` and the state key is left
 *     exactly as it was found.
 *   - it offers the two copies that actually exist — the server's head, and the
 *     server's older revisions — and nothing else. «Start fresh» is not on this
 *     screen; losing twelve sessions must never be one tap away.
 */
import { $, h, toast } from '../core/dom.js';
import { t } from '../core/i18n.js';
import { openRestoreModal } from '../ui/history.js';
import { corruptReport, isStateCorrupt, settings } from '../core/store.js';
import { pullFromCloud } from '../core/sync.js';
import { render } from '../core/shell.js';
import { applyTheme } from '../core/theme.js';

let blockTimer = null;

async function restoreFromCloud(button) {
  button.disabled = true;
  try {
    const pulled = await pullFromCloud();
    if (!pulled || isStateCorrupt()) {
      // A 404 (no row yet) or an unchanged-revision answer both land here: the
      // server has nothing that would replace what is quarantined.
      toast(t('state_corrupt_no_cloud'), 6000);
      button.disabled = false;
      return;
    }
    $('#modal-overlay').classList.remove('show');
    delete $('#modal-overlay').dataset.required;
    applyTheme();
    render();
    toast(t('state_corrupt_restored'), 5000);
  } catch (err) {
    console.error('[raedworkouts] cloud restore after quarantine failed', err);
    toast(t('state_corrupt_no_cloud'), 6000);
    button.disabled = false;
  }
}

export function showStateRecovery() {
  const overlay = $('#modal-overlay');
  const modal = $('#modal');
  modal.innerHTML = '';
  // `data-required` is what app.js checks before closing on a backdrop tap.
  overlay.dataset.required = 'true';
  modal.appendChild(h('div', { class: 'xs-head confirm-head' }, h('h3', {}, t('state_corrupt_title'))));
  modal.appendChild(h('p', { class: 'confirm-body' }, t('state_corrupt_body')));
  if (corruptReport?.bytes) {
    // One quiet fact, so he can tell a truncated blob from an empty one when he
    // reads this back to me. The numeral is its own `.num` node: an Arabic
    // sentence with a multi-digit run inside ONE text node is the shape the
    // bidi algorithm reorders (tests/bidi-isolation.spec.mjs).
    modal.appendChild(h('div', { class: 'tiny muted' },
      t('state_corrupt_kept'), ' ',
      h('span', { class: 'num' }, String(corruptReport.bytes))));
  }
  const cloudBtn = h('button', { class: 'btn primary full', 'data-recover-cloud': 'true' }, t('state_corrupt_cloud'));
  cloudBtn.addEventListener('click', () => restoreFromCloud(cloudBtn));
  modal.appendChild(h('div', { class: 'confirm-actions' },
    cloudBtn,
    h('button', {
      class: 'btn ghost full', 'data-recover-revisions': 'true',
      onClick: () => openRestoreModal(),
    }, t('state_corrupt_revisions')),
  ));
  overlay.classList.add('show');
  keepBlocking();
}

// The revisions list reuses the one modal, and closing it would otherwise leave
// him inside an empty app with no way back to this screen. A poll rather than a
// MutationObserver because it also covers a modal closed by any other path, and
// it stops itself the moment a restore clears the quarantine.
function keepBlocking() {
  if (blockTimer) return;
  blockTimer = setInterval(() => {
    if (!isStateCorrupt() || !settings.user_id) {
      clearInterval(blockTimer);
      blockTimer = null;
      delete $('#modal-overlay').dataset.required;
      return;
    }
    if (!$('#modal-overlay').classList.contains('show')) showStateRecovery();
  }, 800);
}
