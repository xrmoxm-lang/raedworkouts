#!/usr/bin/env node
/** Build the offline root dashboard from the live repository state. */
import { execFileSync } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const worktree = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const repository = resolve(worktree, '..');
const read = (relative, root = worktree) => readFile(resolve(root, relative), 'utf8');
const has = async (relative, needle) => (await read(relative)).includes(needle);

function parseGovernor() {
  let output = '';
  try {
    output = execFileSync(resolve(process.env.HOME || '/Users/raedmohammed', 'bin/governor'), ['status'], { encoding: 'utf8', timeout: 8000 });
  } catch (error) {
    output = `${error.stdout || ''}${error.stderr || ''}`.trim() || 'Governor status unavailable.';
  }
  const enabled = !/Kill switch:\s*ENGAGED|State:\s*kill-switch/i.test(output);
  const usageLine = output.split('\n').find((line) => /^Usage:/i.test(line)) || 'Usage: unavailable';
  const percentages = [...output.matchAll(/([A-Za-z][\w .-]{1,30})\s*[:=]\s*(\d{1,3}(?:\.\d+)?)%/g)]
    .map((match) => ({ label: match[1].trim(), value: Number(match[2]) }));
  return { enabled, usage: usageLine.replace(/^Usage:\s*/i, ''), percentages, raw: output };
}

function parseOpenDecisionItems(decisions) {
  return decisions.split('\n')
    .filter((line) => /^\|\s*D\d+\s*\|/.test(line))
    .filter((line) => /open|needs|to be confirmed|still to be confirmed/i.test(line))
    .map((line) => line.split('|').map((value) => value.trim()).filter(Boolean));
}

async function sourceData() {
  const source = await read('data.js');
  const context = { window: {} };
  vm.runInNewContext(source, context, { filename: 'data.js' });
  const rw = context.window.RW;
  const exercises = new Map(rw.EXERCISES.map((exercise) => [exercise.id, exercise]));
  const plan = [rw.PROGRAMME].map((programme) => ({
    name: programme.block_name,
    sessions: programme.sessions.map((session) => ({
      name: session.name,
      exercises: session.exercises.map((item) => ({
        name: exercises.get(item.exercise_id)?.name || item.exercise_id,
        sets: item.sets,
        reps: item.reps,
        start_kg: item.start_kg,
      })),
    })),
  }));
  return plan;
}

const [gates, decisions, plan] = await Promise.all([
  read('GATES.md'),
  read('DECISIONS.md', repository),
  sourceData(),
]);
const phases = [
  {
    name: 'Phase 1 · foundation',
    checks: [
      { label: 'Domain safety gates', done: /\[x\] G1/.test(gates) && /\[x\] G2/.test(gates) && /\[x\] G3/.test(gates) },
      { label: 'Event migration tests', done: await has('tests/phase1.test.mjs', 'migrations export before mutation') },
      { label: 'Native modules import', done: await has('tests/verify-phase1-modules.mjs', 'PHASE1_MODULES_IMPORTABLE') },
    ],
  },
  {
    name: 'Phase 2 · session structure',
    checks: [
      { label: 'Final-set effort brake', done: await has('domain/progression.js', 'very_hard on the final working set blocked') },
      { label: '8–10 compound programme', done: await has('data.js', "reps: '8-10'") },
      { label: 'Real ordered warm-up phase', done: await has('app.js', 'renderWarmupPhase') && await has('data.js', 'SESSION_WARMUPS') },
      { label: 'Scoped ledger substitutions', done: await has('domain/substitutions.js', 'classifySubstitutionLedger') && await has('app.js', 'showSubstitutionScopeModal') },
      { label: 'Phase 2 behaviour tests', done: await has('tests/phase2.test.mjs', 'D16/D17 effort') },
    ],
  },
];
const snapshot = {
  generated_at: new Date().toISOString(),
  phases,
  plan,
  governor: parseGovernor(),
  open_decisions: parseOpenDecisionItems(decisions),
};
const serialised = JSON.stringify(snapshot).replace(/</g, '\\u003c');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>RaedWorkouts dashboard</title>
<style>
  :root{--bg:#f7f1e8;--card:#fff;--elev:#f4ece0;--line:#e6dccd;--ink:#1c1510;--muted:#75685a;--accent:#b8451a;--good:#147a3a;--warn:#823c07;--bad:#d11442;--field:#fff;--accent-fg:#fff}
  @media(prefers-color-scheme:dark){:root:not([data-theme="light"]){--bg:#17130f;--card:#211a14;--elev:#2b211a;--line:#33281f;--ink:#f4ece3;--muted:#9d8773;--accent:#e8622d;--good:#229e71;--warn:#f09a0a;--bad:#fa4862;--field:#2b211a;--accent-fg:#180d06}}
  :root[data-theme="dark"]{--bg:#17130f;--card:#211a14;--elev:#2b211a;--line:#33281f;--ink:#f4ece3;--muted:#9d8773;--accent:#e8622d;--good:#229e71;--warn:#f09a0a;--bad:#fa4862;--field:#2b211a;--accent-fg:#180d06}
  .themes{display:flex;gap:4px;border:1px solid var(--line);border-radius:99px;padding:3px;background:var(--card)}
  .themes button{border:0;background:none;color:var(--muted);padding:5px 11px;border-radius:99px;font-size:12px;font-weight:700;cursor:pointer}
  .themes button[aria-pressed="true"]{background:var(--elev);color:var(--ink)}
  *{box-sizing:border-box} body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif}
  main{max-width:960px;margin:auto;padding:24px 16px 64px}.eyebrow{color:var(--accent);font-size:11px;font-weight:800;letter-spacing:.12em}.top{display:flex;align-items:start;justify-content:space-between;gap:16px;margin-bottom:24px}h1{margin:2px 0 4px;font-size:30px;letter-spacing:-.035em}h2{font-size:17px;margin:0 0 12px}p{margin:6px 0;color:var(--muted)}.snapshot{font-size:12px;color:var(--muted);text-align:right}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.wide{grid-column:1/-1}.card{background:var(--card);border:1px solid var(--line);border-radius:15px;padding:16px}.phase{padding:12px;border-top:1px solid var(--line)}.phase:first-of-type{border-top:0}.phase-top{display:flex;justify-content:space-between;gap:10px;font-weight:750}.done{color:var(--good)}.pending{color:var(--muted)}.checks{margin:8px 0 0;padding:0;list-style:none;color:var(--muted);font-size:13px}.checks li{margin:4px 0}.pill{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--line);padding:5px 9px;border-radius:99px;font-size:12px;font-weight:700}.pill.good{border-color:color-mix(in srgb,var(--good) 50%,var(--line));color:var(--good)}.pill.bad{border-color:color-mix(in srgb,var(--bad) 50%,var(--line));color:var(--bad)}.usage{margin-top:10px;font-size:13px;color:var(--muted)}.meters{display:grid;gap:7px;margin-top:10px}.meter{display:grid;grid-template-columns:92px 1fr 38px;gap:8px;align-items:center;font-size:12px}.bar{height:7px;background:var(--elev);border-radius:99px;overflow:hidden}.bar i{display:block;height:100%;background:var(--accent)}.decision{padding:9px 0;border-top:1px solid var(--line);font-size:13px}.decision:first-of-type{border-top:0}.plan details{border-top:1px solid var(--line);padding:10px 0}.plan details:first-of-type{border-top:0}.plan summary{cursor:pointer;font-weight:700}.exercise{display:flex;justify-content:space-between;gap:12px;padding:5px 0 0 12px;color:var(--muted);font-size:13px}.exercise b{font-variant-numeric:tabular-nums;color:var(--ink);white-space:nowrap}.picker{display:grid;gap:10px}.pick-row{padding:12px;border:1px solid var(--line);border-radius:12px}.pick-title{font-weight:750}.pick-ar{color:var(--muted);font-size:13px}.picker input{width:100%;min-height:46px;margin-top:8px;padding:8px 10px;border:1px solid var(--line);border-radius:9px;background:var(--field);color:var(--ink);font:inherit;direction:ltr}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}button,a.button{border:1px solid var(--line);border-radius:9px;background:var(--elev);color:var(--ink);padding:9px 12px;font:inherit;font-weight:700;text-decoration:none;cursor:pointer}.primary{background:var(--accent);border-color:var(--accent);color:var(--accent-fg)}textarea{width:100%;min-height:140px;margin-top:12px;background:var(--field);color:var(--ink);border:1px solid var(--line);border-radius:9px;padding:10px;font:12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;direction:ltr}@media(max-width:680px){.grid{grid-template-columns:1fr}.wide{grid-column:auto}.top{display:block}.snapshot{text-align:left;margin-top:10px}.exercise{padding-left:0}.meter{grid-template-columns:80px 1fr 34px}}
</style>
</head>
<body><main><header class="top"><div><div class="eyebrow">ONE LOCAL PLACE · OFFLINE</div><h1>RaedWorkouts</h1><p>Plan, build state, the two missing video links, and governor status.</p></div><div><div class="themes" role="group" aria-label="Theme"><button data-t="light" aria-pressed="false">Light</button><button data-t="dark" aria-pressed="false">Dark</button><button data-t="system" aria-pressed="true">Auto</button></div><div class="snapshot" id="snapshot"></div></div></header><section class="grid"><article class="card wide"><h2>Build progress</h2><div id="phases"></div></article><article class="card wide plan"><h2>Current programme</h2><div id="plan"></div><div class="actions"><a class="button primary" href="./worktree-v16/index.html">Open workout app</a></div></article><article class="card"><h2>Governor</h2><div id="governor"></div></article><article class="card"><h2>Still needs Raed</h2><div id="decisions"></div></article><article class="card wide"><h2>Video link picker</h2><p>Only the two deliberately blank exercises are here. Links are stored locally and export as JSON; this page makes no network request.</p><div class="picker" id="picker"></div><div class="actions"><button class="primary" id="export">Export links</button><button id="clear">Clear these two</button></div><textarea id="output" hidden readonly></textarea></article></section></main>
<script>const SNAPSHOT=${serialised};
const el=id=>document.getElementById(id);const esc=value=>String(value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[c]));
el('snapshot').textContent='Repository snapshot · '+new Date(SNAPSHOT.generated_at).toLocaleString();
el('phases').innerHTML=SNAPSHOT.phases.map(phase=>{const complete=phase.checks.filter(x=>x.done).length;return '<div class="phase"><div class="phase-top"><span>'+esc(phase.name)+'</span><span class="'+(complete===phase.checks.length?'done':'pending')+'">'+complete+' / '+phase.checks.length+'</span></div><ul class="checks">'+phase.checks.map(check=>'<li class="'+(check.done?'done':'pending')+'">'+(check.done?'✓':'○')+' '+esc(check.label)+'</li>').join('')+'</ul></div>'}).join('');
el('plan').innerHTML=SNAPSHOT.plan.map(programme=>'<details><summary>'+esc(programme.name)+'</summary>'+programme.sessions.map(session=>'<details><summary>'+esc(session.name)+'</summary>'+session.exercises.map(item=>'<div class="exercise"><span>'+esc(item.name)+'</span><b>'+item.sets+' × '+item.reps+' · '+item.start_kg+' kg</b></div>').join('')+'</details>').join('')+'</details>').join('');
const THEME_KEY='rw_dash_theme';
function applyTheme(t){if(t==='system')document.documentElement.removeAttribute('data-theme');else document.documentElement.setAttribute('data-theme',t);for(const b of document.querySelectorAll('.themes button'))b.setAttribute('aria-pressed',String(b.dataset.t===t));localStorage.setItem(THEME_KEY,t);}
for(const b of document.querySelectorAll('.themes button'))b.addEventListener('click',()=>applyTheme(b.dataset.t));
applyTheme(localStorage.getItem(THEME_KEY)||'system');
const gov=SNAPSHOT.governor;
function meters(list,note){return(list.length?'<div class="meters">'+list.map(m=>'<div class="meter"><span>'+esc(m.label)+'</span><div class="bar"><i style="width:'+Math.min(100,m.value)+'%"></i></div><b>'+m.value+'%</b></div>').join('')+'</div>':'')+(note?'<p>'+esc(note)+'</p>':'');}
function renderGov(list,note){el('governor').innerHTML='<span class="pill '+(gov.enabled?'good':'bad')+'">'+(gov.enabled?'Enabled':'Disabled')+'</span>'+meters(list,note);}
// Usage percentages must be read when the page is OPENED, not baked in when it is
// built. A number frozen at build time still looks authoritative while being hours
// stale, which is the exact failure the limit governor exists to avoid. OpenUsage
// serves Access-Control-Allow-Origin:* so a local file may read it directly.
renderGov([], 'Reading usage…');
fetch('http://127.0.0.1:6736/v1/usage',{cache:'no-store'})
  .then(r=>r.ok?r.json():Promise.reject(new Error('HTTP '+r.status)))
  .then(data=>{
    const rows=[],now=Date.now();let stale=false;
    for(const p of data){
      const age=(now-Date.parse(p.fetchedAt))/60000;
      if(age>10)stale=true;
      for(const line of p.lines||[])if(line.type==='progress')rows.push({label:p.providerId+' '+line.label,value:line.used});
    }
    renderGov(rows, stale?'Reading is more than 10 minutes old — treat it as unconfirmed.':'');
  })
  .catch(()=>renderGov([], 'Cannot reach OpenUsage, so no usage is shown. A stale number would be worse than none.'));
el('decisions').innerHTML=SNAPSHOT.open_decisions.length?SNAPSHOT.open_decisions.map(row=>'<div class="decision"><b>'+esc(row[0])+' · '+esc(row[1])+'</b><br>'+esc(row[2]||'')+'</div>').join(''):'<p>No open items were found in DECISIONS.md.</p>';
const rows=[{id:'reverse_curl',en:'Reverse Curl',ar:'باي عكسي'},{id:'standing_leg_curl',en:'Standing Leg Curl',ar:'ثني الرجل واقف'}],KEY='rw_linkpicker_v1',saved=JSON.parse(localStorage.getItem(KEY)||'{}');const parse=raw=>{const s=(raw||'').trim();if(!s)return null;const id=(s.match(/(?:v=|youtu\\.be\\/|\\/shorts\\/|\\/embed\\/)([A-Za-z0-9_-]{11})/)||s.match(/^([A-Za-z0-9_-]{11})$/)||[])[1];if(!id)return {error:'Could not read a YouTube video ID'};const plain=s.match(/[?&#](?:t|start)=(\\d+)/);return {video_id:id,start_seconds:plain?+plain[1]:null};};
el('picker').innerHTML=rows.map(row=>'<div class="pick-row"><div class="pick-title">'+row.en+'</div><div class="pick-ar">'+row.ar+'</div><input data-id="'+row.id+'" placeholder="Paste a YouTube link" value="'+esc(saved[row.id]?.raw||'')+'"><div class="usage" data-hint="'+row.id+'"></div></div>').join('');
function refresh(input){const row=rows.find(x=>x.id===input.dataset.id),parsed=parse(input.value),hint=document.querySelector('[data-hint="'+row.id+'"]');if(!parsed){delete saved[row.id];hint.textContent='';}else if(parsed.error){hint.textContent=parsed.error;}else{saved[row.id]={raw:input.value.trim(),exercise_id:row.id,exercise_name:row.en,...parsed};hint.textContent='✓ '+parsed.video_id+(parsed.start_seconds!=null?' · '+parsed.start_seconds+'s':'');}localStorage.setItem(KEY,JSON.stringify(saved));}document.querySelectorAll('#picker input').forEach(input=>{input.addEventListener('input',()=>refresh(input));refresh(input)});el('export').onclick=()=>{const out=el('output');out.hidden=false;out.value=JSON.stringify(rows.map(row=>saved[row.id]).filter(Boolean),null,2);out.select();out.scrollIntoView({behavior:'smooth'});};el('clear').onclick=()=>{rows.forEach(row=>delete saved[row.id]);localStorage.setItem(KEY,JSON.stringify(saved));location.reload();};
</script></body></html>`;

const dashboardPath = resolve(repository, 'dashboard.html');
await writeFile(dashboardPath, html, 'utf8');
const emittedDashboard = await readFile(dashboardPath, 'utf8');
const retiredIdentity = /0[f]766e|19[c]2b0|0[a]574f|0[f]8d7f|d3[f]0eb|accent[-]glow|te[a]l|0[a]7d6c|2[e]e6c5/i;
const snapshotMatch = emittedDashboard.match(/<script>const SNAPSHOT=([\s\S]*?);\nconst el=/);
if (!snapshotMatch) throw new Error('dashboard invariant failed: emitted snapshot is unreadable');
const emittedPlan = JSON.parse(snapshotMatch[1]).plan;
const retiredSessionLabel = /^(?:push|pull|legs|ppl)(?:\b|\s|[—–-])/i;
const retiredSession = emittedPlan
  .flatMap((programme) => programme.sessions || [])
  .find((session) => retiredSessionLabel.test(session.name || ''));
if (retiredIdentity.test(emittedDashboard)) throw new Error('dashboard invariant failed: retired identity remains in emitted HTML');
if (retiredSession) throw new Error(`dashboard invariant failed: retired Push/Pull/Legs session label remains in emitted HTML (${retiredSession.name})`);
console.log('DASHBOARD_BUILT');
