// The client used to be one file, and several gates read it as TEXT: the Arabic
// scan, the locale-key check, the dead-function fence, the credential check.
// app.js is now a boot file over core/ and ui/, so every one of those readers
// has to see the whole client or it stops checking most of it.
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function jsIn(dir) {
  try {
    return (await readdir(path.join(repoRoot, dir)))
      .filter((name) => name.endsWith('.js'))
      .sort()
      .map((name) => `${dir}/${name}`);
  } catch (_) { return []; }
}

// Relative paths, in load order: the entry point first, then the engine, then
// the screens. `core/shell.js` and everything else under core/ and ui/ is
// included automatically, so a new module is covered the moment it exists.
export async function appSourceFiles() {
  const names = ['app.js', ...(await jsIn('core')), ...(await jsIn('ui'))];
  return Promise.all(names.map(async (name) => ({
    name,
    source: await readFile(path.join(repoRoot, name), 'utf8'),
  })));
}

// One string. A gate that matches a pattern anywhere in the client uses this.
export async function appSource() {
  return (await appSourceFiles()).map((file) => file.source).join('\n');
}
