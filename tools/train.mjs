/* Headless trainer and replay recorder for the escape scenario.

   The browser could not answer the only question that matters — is this task
   learnable at all — because every episode competed with rendering for CPU and
   took tens of seconds. This runs the same engine and the same policy with
   nothing else on the thread, so a few hundred episodes take under a minute.

   The engine, the decoders, the protocol and the learning rule are all imported.
   There is no second implementation to drift.

   It also writes what the page plays back. Training is not a spectator sport at
   one episode every few seconds, so the page is a player over a recording made
   here: the arc, and — every PROBE_EVERY episodes — the *same fixed threats*
   re-presented to the frozen policy, with her neurons captured while she answers.
   That is what makes early and late comparable: same situation, different answer.

   Usage:
     node tools/train.mjs 600 --seed 11                  train and report
     node tools/train.mjs 600 --seed 11 --shuffled       degree-matched control
     node tools/train.mjs 600 --seed 11 --replay         also write the recording
*/

import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

import { loadRig, DATA } from './rig.mjs';
import { Threat, GLANCES_PER_APPROACH } from '../web/defend/arena.js';
import {
  Policy, ACTIONS, TRAIN, THREAT_BAND, RULES, temperature,
  blankBody, applyAction, decayBody, survived, outcomeReward, randomThreatAngle, awayFrom,
} from '../web/defend/policy.js';

const args = process.argv.slice(2);
const flag = n => args.includes(n);
const opt = (n, d) => (flag(n) ? args[args.indexOf(n) + 1] : d);
const EPISODES = Number(args.find(a => /^\d+$/.test(a)) || 300);
const SHUFFLED = flag('--shuffled');
const QUIET = flag('--quiet');
const REPLAY = flag('--replay') ? opt('--replay-out', join(DATA, 'replay.json.gz')) : null;
const SEED = Number(opt('--seed', 20260919));
if (flag('--lr')) TRAIN.lr = Number(opt('--lr'));
if (flag('--batch')) TRAIN.batch = Number(opt('--batch'));

/* the probe battery: fixed angles across the readable band, never learned from */
const [BLO, BHI] = THREAT_BAND;
const PROBE_N = 6;               // angles per side, evenly spaced across the band
const PROBE_ANGLES = [];
for (let s = -1; s <= 1; s += 2) {
  for (let i = 0; i < PROBE_N; i++) {
    PROBE_ANGLES.push(Math.round(s * (BLO + (BHI - BLO) * (i / (PROBE_N - 1))) * 100) / 100);
  }
}
const PROBE_EVERY = Number(opt('--probe-every', 25));
/* Which approaches get her neurons written down. Not all twelve: the snapshots
   are most of the file, and four — two from each side, near and far — carry the
   whole story while keeping the recording under a couple of hundred kilobytes.
   The page plays back only these, so the brain panel is never dark. */
const SHOWCASE = [1, 4, 7, 10];
const SNAP_EVERY = Number(opt('--snap-every', 1));   // how often her neurons get captured

const rig = loadRig({ shuffled: SHUFFLED, seed: SEED });
const { rng } = rig;

if (!QUIET) {
  console.log(`${SHUFFLED ? 'shuffled control' : 'real connectome'}: ` +
    `${rig.N.toLocaleString('en-US')} neurons, ${rig.E.toLocaleString('en-US')} edges`);
  console.log(`LPLC2 ${rig.loomL.length} left / ${rig.loomR.length} right, DNp01 ${rig.gf.length}`);
}

const pol = new Policy(rig.D);
pol.rand = rng;
const log = [];
const probes = [];
const t0 = Date.now();
const r3 = v => Math.round(v * 1e3) / 1e3;

/* Run the fixed battery against the current weights, without learning from it
   and without exploration noise: this is what she would do, not what she is
   trying. Reads the policy, never writes to it. */
function probe(epIndex, withSnaps) {
  const runs = [];
  for (let ai = 0; ai < PROBE_ANGLES.length; ai++) {
    const threat = new Threat(PROBE_ANGLES[ai]);
    const body = blankBody();
    const steps = [];
    const snaps = [];
    const wantSnap = withSnaps && SHOWCASE.includes(ai);
    for (let k = 0; k < GLANCES_PER_APPROACH; k++) {
      const g = rig.glance(threat.sideOf(0), threat.loom);
      const p = pol.probs(g.x, 1);
      let a = 0;
      for (let j = 1; j < p.length; j++) if (p[j] > p[a]) a = j;   // her answer, not a sample
      if (wantSnap) snaps.push(rig.snapshot());
      applyAction(body, a);
      steps.push({
        a, p: Array.from(p, r3), lean: body.lean, used: body.leapUsed ? 1 : 0,
        air: r3(body.airborne), u: r3(g.urgency), l: r3(g.drive.l), r: r3(g.drive.r),
        gf: r3(g.gf), rad: r3(threat.r),
      });
      threat.advance();
      threat.r = threat.target;
      decayBody(body);
    }
    runs.push({
      ang: r3(PROBE_ANGLES[ai]), away: awayFrom(threat),
      ok: survived(body, threat) ? 1 : 0,
      timed: body.airborne > RULES.airborneAt ? 1 : 0,      // left the ground in time
      aimed: body.lean === awayFrom(threat) ? 1 : 0,        // ...and away from it
      steps, snaps: snaps.length ? snaps : undefined,
    });
  }
  probes.push({ ep: epIndex, ok: runs.map(r => r.ok),
    timed: runs.map(r => r.timed), aimed: runs.map(r => r.aimed), runs });
  return runs.reduce((s, r) => s + r.ok, 0) / runs.length;
}

let probeCount = 0;
if (REPLAY) { probe(0, true); probeCount++; }

for (let ep = 0; ep < EPISODES; ep++) {
  const threat = new Threat(randomThreatAngle(rng));
  const body = blankBody();
  const steps = [];
  const temp = temperature(pol.episodes);

  for (let k = 0; k < GLANCES_PER_APPROACH; k++) {
    const { x } = rig.glance(threat.sideOf(0), threat.loom);
    const a = pol.act(x, temp);
    const r = applyAction(body, a);
    steps.push({ x, a, r, temp });
    threat.advance();
    threat.r = threat.target;
    decayBody(body);
  }
  steps[steps.length - 1].r += outcomeReward(body, threat);
  pol.learn(steps);
  log.push(survived(body, threat) ? 1 : 0);

  if (REPLAY && (ep + 1) % PROBE_EVERY === 0) {
    probe(ep + 1, probeCount % SNAP_EVERY === 0);
    probeCount++;
  }

  if (!QUIET && (ep + 1) % 25 === 0) {
    const w = log.slice(-25);
    const pc = Math.round(100 * w.reduce((a, b) => a + b, 0) / w.length);
    const el = ((Date.now() - t0) / 1000).toFixed(0);
    const last = probes[probes.length - 1];
    const pr = last ? `   probe ${Math.round(100 * last.ok.reduce((a, b) => a + b, 0) / PROBE_ANGLES.length)}%` : '';
    process.stdout.write(`  ep ${String(ep + 1).padStart(4)}  last 25: ${String(pc).padStart(3)}% escaped${pr}   [${el}s]\n`);
  }
}
pol.flush();
if (REPLAY) probe(EPISODES, true);

const pc = a => (a.length ? Math.round(100 * a.reduce((x, y) => x + y, 0) / a.length) : 0);
if (QUIET) {
  const last = probes[probes.length - 1];
  console.log(`${SHUFFLED ? 'shuf' : 'real'} seed=${SEED} first50=${pc(log.slice(0, 50))} last50=${pc(log.slice(-50))} overall=${pc(log)}` +
    (probes.length ? ` probe=${pc(last.ok)} timed=${pc(last.timed)} aimed=${pc(last.aimed)}` : ''));
} else {
  console.log(`\nfirst 50: ${pc(log.slice(0, 50))}%   last 50: ${pc(log.slice(-50))}%   overall: ${pc(log)}%`);
  if (probes.length) {
    const last = probes[probes.length - 1];
    console.log(`probe battery (frozen policy, ${PROBE_ANGLES.length} fixed threats): ` +
      `${pc(probes[0].ok)}% at the start, ${pc(last.ok)}% at the end`);
    console.log(`  of which: left the ground in time ${pc(last.timed)}%, leaned away from it ${pc(last.aimed)}%`);
  }
  console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s total`);
}

if (REPLAY) {
  const rec = {
    v: 2, seed: SEED, shuffled: SHUFFLED, episodes: EPISODES,
    neurons: rig.N, glances: GLANCES_PER_APPROACH,
    actions: ACTIONS, features: rig.featNames,
    probeAngles: PROBE_ANGLES, probeEvery: PROBE_EVERY, showcase: SHOWCASE,
    // the driven populations, so the page can light the eye that is being fed
    inputs: { left: Array.from(rig.loomL), right: Array.from(rig.loomR) },
    rules: { airborneAt: RULES.airborneAt, leapDecay: RULES.leapDecay },
    train: log, probes,
    policy: pol.serialise(),
    built: new Date().toISOString().slice(0, 10),
  };
  const buf = gzipSync(Buffer.from(JSON.stringify(rec)), { level: 9 });
  writeFileSync(REPLAY, buf);
  const snapRuns = probes.reduce((s, p) => s + p.runs.filter(r => r.snaps).length, 0);
  const cells = probes.flatMap(p => p.runs.filter(r => r.snaps)).flatMap(r => r.snaps.map(s => s.i.length));
  console.log(`wrote ${REPLAY}  (${(buf.length / 1024).toFixed(0)} KB gzipped, ${probes.length} probes, ` +
    `${snapRuns} recorded runs, ${Math.round(cells.reduce((a, b) => a + b, 0) / Math.max(cells.length, 1))} cells per snapshot)`);
}
