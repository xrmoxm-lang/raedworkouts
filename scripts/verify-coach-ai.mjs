import { readFileSync } from 'node:fs';

const requirements = readFileSync(new URL('../server/requirements-coach.txt', import.meta.url), 'utf8');
const graph = readFileSync(new URL('../server/coach_graph.py', import.meta.url), 'utf8');
const progression = readFileSync(new URL('../domain/progression.js', import.meta.url), 'utf8');
const qa = readFileSync(new URL('../server/coach_qa.py', import.meta.url), 'utf8');

if (!requirements.includes('fastembed==0.8.0') || /\b(?:openai|anthropic)\b/i.test(requirements)) {
  throw new Error('The local retrieval runtime must use fastembed only, with no paid provider dependency.');
}
if (!graph.includes('domain/clamps.js') || !graph.includes('cannot emit a weight or load')) {
  throw new Error('The graph must preserve the deterministic clamp boundary.');
}
if (!progression.includes("import { clampWorkingWeight } from './clamps.js'")) {
  throw new Error('Progression is no longer wired to domain/clamps.js.');
}
if (!qa.includes('QueryRewriteError') || !qa.includes('not_in_sources')) {
  throw new Error('Q&A must distinguish query rewrite errors from genuine source refusals.');
}
console.log('COACH_AI_STATIC_BOUNDARIES_PASSED');
