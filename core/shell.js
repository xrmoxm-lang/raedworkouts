/* Screen painters, registered by app.js.
 *
 * core/ must never import ui/, but core paths do have to repaint after they
 * change something. app.js registers the real functions here at boot; these
 * indirections are what core calls instead. */
let hooks = {
  render() {}, router() {}, renderWelcome() {}, renderCoach() {}, renderSettings() {},
};
export function registerShell(next) { hooks = { ...hooks, ...next }; }
export const render = () => hooks.render();
export const router = (route) => hooks.router(route);
export const renderWelcome = () => hooks.renderWelcome();
export const renderCoach = () => hooks.renderCoach();
export const renderSettings = () => hooks.renderSettings();
