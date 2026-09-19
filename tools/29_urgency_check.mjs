/* Does her response actually grow as the thing gets closer?

   The readout can only time an escape if something in it tracks distance. This
   prints the evoked urgency at each glance of an approach, at a few drive levels.

   Usage: node tools/29_urgency_check.mjs [maxHz ...] */

import { loadRig } from './rig.mjs';
import { Threat, GLANCES_PER_APPROACH } from '../web/defend/arena.js';

const LEVELS = process.argv.slice(2).filter(a => /^\d+$/.test(a)).map(Number);
const DRIVES = LEVELS.length ? LEVELS : [150, 90, 55];
const REPS = 8;

const rig = loadRig({ seed: 4242, shuffled: process.argv.includes('--shuffled') });

const t = new Threat(0.8);
const looms = [];
for (let k = 0; k < GLANCES_PER_APPROACH; k++) { looms.push(t.loom); t.advance(); t.r = t.target; }
const side = 0.509;

console.log(`${process.argv.includes('--shuffled') ? 'shuffled control' : 'real connectome'}`);
console.log('loom per glance:', looms.map(v => v.toFixed(2)).join('  '));
console.log(`\nevoked urgency at each glance, mean of ${REPS} repeats:\n`);
console.log('drive     ' + looms.map((_, i) => `g${i}`.padStart(7)).join('') + '     rank corr');
for (const mx of DRIVES) {
  const acc = new Float64Array(looms.length);
  const all = looms.map(() => []);
  for (let rep = 0; rep < REPS; rep++) {
    for (let k = 0; k < looms.length; k++) {
      const p = rig.glance(side, looms[k], mx).urgency;
      acc[k] += p / REPS;
      all[k].push(p);
    }
  }
  // Spearman between glance index and urgency, over every individual sample
  const pts = [];
  for (let k = 0; k < looms.length; k++) for (const v of all[k]) pts.push([k, v]);
  const rank = arr => { const s = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]); const r = new Array(arr.length); s.forEach(([, i], j) => r[i] = j); return r; };
  const rx = rank(pts.map(p => p[0])), ry = rank(pts.map(p => p[1]));
  const n = pts.length;
  const mean = a => a.reduce((x, y) => x + y, 0) / a.length;
  const mx_ = mean(rx), my_ = mean(ry);
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { num += (rx[i] - mx_) * (ry[i] - my_); dx += (rx[i] - mx_) ** 2; dy += (ry[i] - my_) ** 2; }
  const rho = num / Math.sqrt(dx * dy);
  console.log(`${String(mx).padStart(4)} Hz  ` + Array.from(acc, v => v.toFixed(4).padStart(7)).join('') +
    `      ${rho.toFixed(3)}  ${rho > 0.6 ? 'tracks distance' : rho > 0.3 ? 'weak' : 'no use'}`);
}
