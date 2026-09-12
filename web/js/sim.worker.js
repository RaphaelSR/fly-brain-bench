/* Leaky integrate-and-fire engine for the FlyWire connectome.
   Parameters follow Shiu et al. (2024) exactly; integration is the closed-form
   solution of the two-variable system, so results do not depend on step size. */

const V0 = -52.0, VRST = -52.0, VTH = -45.0;   // mV
const TMBR = 20.0, TAU = 5.0;                   // ms
const TRFC = 2.2, TDLY = 1.8;                   // ms
const WSYN = 0.275;                             // mV per synapse
const RPOI = 150.0, FPOI = 250.0;               // Poisson drive
const DT = 0.1;                                 // ms

const EV = Math.exp(-DT / TMBR);
const EG = Math.exp(-DT / TAU);
const KC = (TAU / (TAU - TMBR)) * (EG - EV);    // exact g -> v coupling
const RFC_STEPS = Math.round(TRFC / DT);
const DLY_STEPS = Math.round(TDLY / DT);
const P_POI = RPOI * DT / 1000;
const W_POI = WSYN * FPOI;
const EPS_V = 0.02, EPS_G = 0.02;               // drop from active set below this

let N = 0, indptr = null, indices = null, weights = null;
let v, g, rfc, inActive, isStim, spikeCount;
let active, nActive = 0;
let ring, ringLen;
let stimList = new Int32Array(0);
let step = 0, running = false, speed = 8;
let outIdx, outCount = 0;
let totalSpikes = 0;

function reset() {
  v.fill(V0); g.fill(0); rfc.fill(0); inActive.fill(0); spikeCount.fill(0);
  nActive = 0; step = 0; totalSpikes = 0; outCount = 0;
  for (let i = 0; i < ringLen; i++) ring[i].n = 0;
  for (let k = 0; k < stimList.length; k++) touch(stimList[k]);
}

function touch(i) {
  if (inActive[i]) return;
  inActive[i] = 1; active[nActive++] = i;
}

function ringPush(slot, i) {
  const r = ring[slot];
  if (r.n === r.buf.length) { const b = new Int32Array(r.buf.length * 2); b.set(r.buf); r.buf = b; }
  r.buf[r.n++] = i;
}

function advance() {
  const slot = step % DLY_STEPS;

  // 1. deliver spikes emitted TDLY ago
  const r = ring[slot];
  for (let k = 0; k < r.n; k++) {
    const src = r.buf[k];
    const a = indptr[src], b = indptr[src + 1];
    for (let e = a; e < b; e++) {
      const j = indices[e];
      g[j] += weights[e];
      touch(j);
    }
  }
  r.n = 0;

  // 2. Poisson drive on the stimulated set
  for (let k = 0; k < stimList.length; k++) {
    if (Math.random() < P_POI) { const i = stimList[k]; v[i] += W_POI; touch(i); }
  }

  // 3. integrate + threshold, active set only
  let w = 0;
  outCount = 0;
  for (let k = 0; k < nActive; k++) {
    const i = active[k];
    if (rfc[i] > 0) { rfc[i]--; active[w++] = i; continue; }
    const gi = g[i], vi = v[i];
    let vn = V0 + (vi - V0) * EV + KC * gi;
    const gn = gi * EG;
    if (vn > VTH) {
      v[i] = VRST; g[i] = 0;
      if (!isStim[i]) rfc[i] = RFC_STEPS;
      spikeCount[i]++; totalSpikes++;
      ringPush((step + DLY_STEPS - 1) % DLY_STEPS, i);
      if (outCount < outIdx.length) outIdx[outCount++] = i;
      active[w++] = i;
    } else {
      v[i] = vn; g[i] = gn;
      const dv = vn - V0;
      if ((dv < EPS_V && dv > -EPS_V) && gn < EPS_G && gn > -EPS_G && !isStim[i]) {
        inActive[i] = 0; v[i] = V0; g[i] = 0;     // retire: exactly at rest
      } else active[w++] = i;
    }
  }
  nActive = w;
  step++;
}

self.onmessage = (ev) => {
  const m = ev.data;

  if (m.cmd === 'init') {
    N = m.N; indptr = m.indptr; indices = m.indices; weights = m.weights;
    v = new Float32Array(N); g = new Float32Array(N);
    rfc = new Int16Array(N); inActive = new Uint8Array(N); isStim = new Uint8Array(N);
    spikeCount = new Int32Array(N); active = new Int32Array(N);
    outIdx = new Int32Array(1 << 16);
    ringLen = DLY_STEPS; ring = [];
    for (let i = 0; i < ringLen; i++) ring.push({ buf: new Int32Array(1024), n: 0 });
    reset();
    self.postMessage({ type: 'ready', N, edges: indices.length });
    return;
  }

  if (m.cmd === 'stim') {
    isStim.fill(0);
    stimList = new Int32Array(m.idx);
    for (let k = 0; k < stimList.length; k++) isStim[stimList[k]] = 1;
    reset();
    return;
  }
  if (m.cmd === 'run') {
    const was = running; running = m.on;
    if (running && !was) tick();   // never start a second tick chain
    return;
  }
  if (m.cmd === 'speed') { speed = m.value; return; }
  if (m.cmd === 'reset') { reset(); emit(); return; }
};

function emit() {
  const buf = new Int32Array(outCount);
  buf.set(outIdx.subarray(0, outCount));
  self.postMessage({
    type: 'frame', spikes: buf, step,
    t: step * DT, nActive, totalSpikes
  }, [buf.buffer]);
}

let acc = null, accN = 0;
function tick() {
  if (!running) return;
  // collect spikes across all sub-steps of this frame
  if (!acc || acc.length < 1 << 18) acc = new Int32Array(1 << 18);
  accN = 0;
  for (let s = 0; s < speed; s++) {
    advance();
    for (let k = 0; k < outCount && accN < acc.length; k++) acc[accN++] = outIdx[k];
  }
  const buf = new Int32Array(accN); buf.set(acc.subarray(0, accN));
  self.postMessage({ type: 'frame', spikes: buf, step, t: step * DT, nActive, totalSpikes }, [buf.buffer]);
  setTimeout(tick, 0);
}
