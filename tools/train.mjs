/* Headless trainer for the escape scenario.

   The browser could not answer the only question that matters — is this task
   learnable at all — because every episode competed with rendering for CPU and
   took tens of seconds. This runs the same engine and the same policy with
   nothing else on the thread, so a few hundred episodes take minutes.

   Everything here is imported from the page's own modules. There is no second
   implementation to drift.

   Usage:  node tools/train.mjs [episodes] [--shuffled] [--out run.json]
*/

import { readFileSync, writeFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { Engine } from '../web/js/lif-core.js';
import { decodeConnectome, decodeLabels } from '../web/js/data.js';
import { Threat, GLANCES_PER_APPROACH } from '../web/defend/arena.js';
import { Policy, ACTIONS, GLANCE, blankBody, applyAction, decayBody, survived } from '../web/defend/policy.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, '..', 'web', 'defend', 'data');

const args = process.argv.slice(2);
const EPISODES = Number(args.find(a => /^\d+$/.test(a)) || 300);
const SHUFFLED = args.includes('--shuffled');
const OUT = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const SEED = Number(args.includes('--seed') ? args[args.indexOf('--seed') + 1] : 20260919);

/* a seeded generator, so a run can be repeated exactly */
function mulberry(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rng = mulberry(SEED);

const gz = f => gunzipSync(readFileSync(join(DATA, f)));
const meta = JSON.parse(gz('meta.json.gz').toString());
const N = meta.n_neurons, E = meta.n_edges;
const labels = decodeLabels(gz('labels.bin.gz'), N);
const suffix = SHUFFLED ? '.shuf' : '';
const conn = decodeConnectome(gz(`conn${suffix}.bin.gz`), N, E, gz(`sign${suffix}.bin.gz`));
const channels = JSON.parse(readFileSync(join(DATA, 'channels.json')));

const featNames = Object.keys(channels.features);
const featIdx = featNames.map(n => Int32Array.from(channels.features[n]));

const d = meta.dicts;
const lpType = d.cell_type.indexOf('LPLC2');
const gfType = d.cell_type.indexOf('DNp01');
const lSide = d.side.indexOf('left'), rSide = d.side.indexOf('right');
const loomL = [], loomR = [], gf = [];
for (let i = 0; i < N; i++) {
  if (labels.cellType[i] === lpType) (labels.side[i] === lSide ? loomL : loomR).push(i);
  if (labels.cellType[i] === gfType) gf.push(i);
}
const stimIdx = Int32Array.from([...loomL, ...loomR]);
const rates = new Float32Array(stimIdx.length);

const eng = new Engine({ N, indptr: conn.indptr, indices: conn.indices, weights: conn.weights, dt: 0.5 });
eng.rand = rng;

if (!args.includes('--quiet')) {
  console.log(`${SHUFFLED ? 'shuffled control' : 'real connectome'}: ` +
    `${N.toLocaleString('en-US')} neurons, ${E.toLocaleString('en-US')} edges`);
  console.log(`LPLC2 ${loomL.length} left / ${loomR.length} right, DNp01 ${gf.length}`);
}

const hz = new Float32Array(N);
const win = new Float32Array(N);
function advanceBio(ms) {
  const steps = Math.round(ms / eng.DT);
  eng.run(steps, i => { win[i]++; });
  const secs = ms / 1000;
  for (let i = 0; i < N; i++) { hz[i] = win[i] / secs; win[i] = 0; }
}
function features() {
  const x = new Float32Array(featIdx.length);
  for (let f = 0; f < featIdx.length; f++) {
    const ids = featIdx[f];
    let s = 0;
    for (let i = 0; i < ids.length; i++) s += hz[ids[i]];
    x[f] = 1 - Math.exp(-Math.max(0, s / ids.length) / 40);
  }
  return x;
}
const giantFibre = () => { let s = 0; for (const i of gf) s += hz[i]; return s / Math.max(gf.length, 1); };

/* one glance: baseline, a short pulse, read the transient */
function glance(threat, heading) {
  advanceBio(GLANCE.gap);
  const base = features();
  const side = threat.sideOf(heading), w = threat.loom;
  let l = side < 0 ? w * -side : 0, r = side > 0 ? w * side : 0;
  const ahead = Math.max(0, 1 - Math.abs(side) * 2.2) * w;
  l = Math.max(l, ahead * 0.8); r = Math.max(r, ahead * 0.8);
  for (let i = 0; i < loomL.length; i++) rates[i] = l * 150;
  for (let i = 0; i < loomR.length; i++) rates[loomL.length + i] = r * 150;
  eng.stimulate(stimIdx, rates);
  advanceBio(GLANCE.width);
  eng.stimulate(new Int32Array(0));
  advanceBio(GLANCE.readAt - GLANCE.width);
  const f = features();
  const ev = new Float32Array(f.length);
  let peak = 1e-6;
  for (let i = 0; i < f.length; i++) { ev[i] = Math.max(0, f[i] - base[i]); if (ev[i] > peak) peak = ev[i]; }
  if (peak > 0.01) for (let i = 0; i < ev.length; i++) ev[i] /= peak;
  else ev.fill(0);
  return { x: ev, gf: giantFibre(), drive: { l, r } };
}

const pol = new Policy(featIdx.length);
const log = [];
const t0 = Date.now();

for (let ep = 0; ep < EPISODES; ep++) {
  const fromLeft = rng() < 0.5;
  const threat = new Threat((fromLeft ? -1 : 1) * (0.35 + rng() * 0.9));
  const body = blankBody();
  const steps = [];
  const temp = Math.max(0.65, 1.7 - pol.episodes * 0.03);

  for (let k = 0; k < GLANCES_PER_APPROACH; k++) {
    const { x } = glance(threat, body.heading);
    const a = pol.act(x, temp);
    const r = applyAction(body, a);
    steps.push({ x, a, r });
    threat.advance();
    threat.r = threat.target;
    decayBody(body);
  }
  const dodged = survived(body, threat);
  steps[steps.length - 1].r += dodged ? 3 : -3;
  pol.learn(steps);
  log.push(dodged ? 1 : 0);

  if (!args.includes('--quiet') && (ep + 1) % 25 === 0) {
    const w = log.slice(-25);
    const pc = Math.round(100 * w.reduce((a, b) => a + b, 0) / w.length);
    const el = ((Date.now() - t0) / 1000).toFixed(0);
    process.stdout.write(`  ep ${String(ep + 1).padStart(4)}  last 25: ${String(pc).padStart(3)}% survived   [${el}s]\n`);
  }
}

const pc = a => a.length ? Math.round(100 * a.reduce((x, y) => x + y, 0) / a.length) : 0;
if (args.includes('--quiet')) {
  console.log(`${SHUFFLED ? 'shuf' : 'real'} seed=${SEED} first50=${pc(log.slice(0, 50))} last50=${pc(log.slice(-50))} overall=${pc(log)}`);
} else {
  console.log(`\nfirst 50: ${pc(log.slice(0, 50))}%   last 50: ${pc(log.slice(-50))}%   overall: ${pc(log)}%`);
  console.log(`chance is 25% with four actions; ${((Date.now() - t0) / 1000).toFixed(0)}s total`);
}
if (OUT) {
  writeFileSync(OUT, JSON.stringify({ shuffled: SHUFFLED, episodes: EPISODES, log, policy: pol.serialise() }));
  console.log(`wrote ${OUT}`);
}
