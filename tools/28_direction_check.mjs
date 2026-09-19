/* How much direction is in the readout, as a function of where the threat is.

   Answers the question that a badly chosen approach band got wrong: at which
   angles can a linear readout tell left from right at all?

   Usage: node tools/28_direction_check.mjs [--shuffled] */

import { loadRig } from './rig.mjs';
import { Threat } from '../web/defend/arena.js';

const SHUFFLED = process.argv.includes('--shuffled');
const REPS = 8;
const rig = loadRig({ seed: 7717, shuffled: SHUFFLED });

/* cosine over the pattern channels only — the last one is urgency, not direction */
const cos = (a, b) => {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length - 1; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return d / (Math.sqrt(na * nb) || 1);
};
const mean = arr => {
  const o = new Float32Array(arr[0].length);
  for (const v of arr) for (let i = 0; i < o.length; i++) o[i] += v[i] / arr.length;
  return o;
};

/* loom part-way through an approach, where the drive is strong but not yet at contact */
const t = new Threat(0.8);
for (let k = 0; k < 4; k++) { t.advance(); t.r = t.target; }
const LOOM = t.loom;

console.log(`${SHUFFLED ? 'shuffled control' : 'real connectome'} — left against right, at loom ${LOOM.toFixed(2)}`);
console.log('angle  sideOf   eyeL  eyeR   urgency   cos(L,R)   repeat floor   verdict');
for (const ang of [0.20, 0.35, 0.50, 0.65, 0.80, 0.95, 1.10, 1.25]) {
  const probe = new Threat(ang);
  const side = probe.sideOf(0);
  const L = [], R = [], L2 = [];
  let urg = 0;
  for (let k = 0; k < REPS; k++) { const g = rig.glance(-Math.abs(side), LOOM); L.push(g.x); urg += g.urgency / (REPS * 2); }
  for (let k = 0; k < REPS; k++) { const g = rig.glance(Math.abs(side), LOOM); R.push(g.x); urg += g.urgency / (REPS * 2); }
  for (let k = 0; k < REPS; k++) L2.push(rig.glance(-Math.abs(side), LOOM).x);
  const d = rig.eyeDrive(Math.abs(side), LOOM);
  const c = cos(mean(L), mean(R));
  const floor = cos(mean(L), mean(L2));
  const sep = floor - c;
  const verdict = urg < 0.004 ? 'NO RESPONSE AT ALL'
    : sep > 0.03 ? `separable (+${sep.toFixed(3)})` : 'no direction';
  console.log(`${ang.toFixed(2)}   ${Math.abs(side).toFixed(3)}   ${d.l.toFixed(2)}  ${d.r.toFixed(2)}   ` +
    `${urg.toFixed(4)}    ${c.toFixed(3)}        ${floor.toFixed(3)}        ${verdict}`);
}
