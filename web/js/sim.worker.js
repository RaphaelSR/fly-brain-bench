/* Web-worker wrapper around the shared engine in lif-core.js.

   The engine itself lives in one place so the browser and the headless trainer
   cannot drift apart; this file only handles messages and paces the posts. */

import { Engine } from './lif-core.js';

let eng = null, running = false, speed = 8;
let acc = null, accN = 0, lastPost = 0;
const POST_MS = 33;      // wall-clock cadence for frames to the main thread

self.onmessage = (ev) => {
  const m = ev.data;
  if (m.cmd === 'init') {
    eng = new Engine({ N: m.N, indptr: m.indptr, indices: m.indices,
                       weights: m.weights, dt: m.dt || 0.1 });
    self.postMessage({ type: 'ready', N: m.N, edges: m.indices.length });
    return;
  }
  if (!eng) return;
  if (m.cmd === 'stim') {
    eng.stimulate(m.idx, m.rates);
    // The bench wants a clean slate per stimulus, so reset stays the default. A
    // caller that samples the same brain over and over must pass reset:false —
    // resetting rewinds the step counter and therefore the clock this worker
    // reports, and anything pacing itself on that clock then waits forever.
    if (m.reset !== false) eng.reset();
    return;
  }
  if (m.cmd === 'run') { const was = running; running = m.on; if (running && !was) tick(); return; }
  if (m.cmd === 'speed') { speed = m.value; return; }
  if (m.cmd === 'eps') { eng.EPS = m.v; return; }
  if (m.cmd === 'reset') { eng.reset(); post(true); return; }
};

function post(force) {
  const now = Date.now();
  if (!force && now - lastPost < POST_MS) return;
  lastPost = now;
  const buf = new Int32Array(accN);
  buf.set(acc.subarray(0, accN));
  accN = 0;
  self.postMessage({ type: 'frame', spikes: buf, step: eng.step, t: eng.t,
                     nActive: eng.nActive, totalSpikes: eng.totalSpikes }, [buf.buffer]);
}

function tick() {
  if (!running) return;
  // Spikes accumulate across sub-steps and go out on a wall clock: under load a
  // single tick carries six figures of them, and posting each one starved the
  // main thread badly enough to drop the page to about one frame per second.
  if (!acc) acc = new Int32Array(1 << 18);
  eng.run(speed, i => { if (accN < acc.length) acc[accN++] = i; });
  post(false);
  setTimeout(tick, 0);
}
