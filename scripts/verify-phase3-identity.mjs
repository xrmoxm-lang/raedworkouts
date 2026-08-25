#!/usr/bin/env node
/** Verify the widened Phase 3 retired-identity scan across the worktree. */
import { readdir, readFile } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const excludedDirectories = new Set(['.git', 'node_modules']);
const excludedDocumentation = /(?:SKILL|HOW_TO_USE|README|DEPLOY_FROM_ZERO|GATES)\.md$/;
const retiredIdentity = /0[f]766e|19[c]2b0|0[a]574f|0[f]8d7f|d3[f]0eb|accent[-]glow|te[a]l|0[a]7d6c|2[e]e6c5/i;
const findings = [];

async function scan(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!excludedDirectories.has(entry.name)) await scan(resolve(directory, entry.name));
      continue;
    }
    if (!entry.isFile() || excludedDocumentation.test(entry.name)) continue;
    const path = resolve(directory, entry.name);
    let contents;
    try {
      contents = await readFile(path, 'utf8');
    } catch {
      continue;
    }
    const match = contents.match(retiredIdentity);
    if (match) findings.push(`${relative(root, path)}:${match[0]}`);
  }
}

await scan(root);
if (findings.length) {
  for (const finding of findings) console.error(`PHASE3_IDENTITY_FAIL: ${finding}`);
  process.exit(1);
}
console.log('PHASE3_IDENTITY_VERIFIED');
