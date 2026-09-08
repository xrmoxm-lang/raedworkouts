/* The gym-launcher button. */

import { settings } from '../core/store.js';

// Tries the user's override first, then a URL scheme.
const EXECUTING_SCHEMES = /^\s*(?:javascript|data|vbscript|blob|file)\s*:/i;
function safeLaunchUrl(value) {
  const url = String(value || '').trim();
  if (!url || EXECUTING_SCHEMES.test(url)) return '';
  // A scheme-relative URL inherits the page's scheme and is fine; a bare path is
  // fine; anything else must at least look like scheme:rest.
  return url;
}
export function launchGymApp() {
  const override = safeLaunchUrl(settings.gym_launch_override);
  if (override) {
    // User has set a custom URL (Shortcut, different scheme, etc.) — use it directly.
    window.location.href = override;
    return;
  }
  const scheme = safeLaunchUrl(settings.gym_launch_scheme) || 'scope.bit://';
  const fallback = safeLaunchUrl(settings.gym_launch_fallback) || 'https://apps.apple.com/sa/app/in2-fitness/id1536137282';

  // Heuristic: try the scheme; if the page is still visible after a moment, open fallback.
  const before = Date.now();
  let opened = false;
  const onVisChange = () => { if (document.visibilityState === 'hidden') opened = true; };
  document.addEventListener('visibilitychange', onVisChange, { once: true });

  // Attempt the scheme
  try { window.location.href = scheme; } catch (_) {}

  // Fallback after 1.2s if we're still here
  setTimeout(() => {
    document.removeEventListener('visibilitychange', onVisChange);
    if (opened) return;
    if (Date.now() - before < 800) return;  // animation lag
    if (document.visibilityState === 'visible') {
      // Scheme didn't open the app → open App Store
      window.location.href = fallback;
    }
  }, 1200);
}

