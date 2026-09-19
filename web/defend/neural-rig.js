import { Engine } from '../js/lif-core.js';
import { GLANCE, featureSize, evokedInto } from './policy.js';

export function mulberry(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

export const DRIVE_HZ = 150;

export function createRig({ meta, labels, conn, channels, seed = 1, dt = 0.5 }) {
  const N = meta.n_neurons, E = meta.n_edges;
  const featNames = Object.keys(channels.features);
  const featIdx = featNames.map(n => Int32Array.from(channels.features[n]));
  const D = featureSize(featNames.length);

  const d = meta.dicts;
  const lpType = d.cell_type.indexOf('LPLC2');
  const gfType = d.cell_type.indexOf('DNp01');
  const lSide = d.side.indexOf('left');
  const loomL = [], loomR = [], gf = [];
  for (let i = 0; i < N; i++) {
    if (labels.cellType[i] === lpType) (labels.side[i] === lSide ? loomL : loomR).push(i);
    if (labels.cellType[i] === gfType) gf.push(i);
  }
  const stimIdx = Int32Array.from([...loomL, ...loomR]);
  const rates = new Float32Array(stimIdx.length);

  const rng = mulberry(seed);
  const eng = new Engine({ N, indptr: conn.indptr, indices: conn.indices, weights: conn.weights, dt });
  eng.rand = rng;

  const hz = new Float32Array(N);       // rate over the window just closed
  const win = new Float32Array(N);      // spikes so far in the open window
  const snapAcc = new Float32Array(N);  // spikes across a whole glance, for the replay

  /* A window is opened, advanced through as many phases as needed, then closed.

     The first version closed the window after every phase, which put the response
     measurement entirely *after* the pulse had ended — the transient it was meant
     to catch had already passed, and what got measured was the tail, a couple of
     spikes wide and quantised to nothing. Phases accumulate into one window now. */
  function advance(ms) {
    eng.run(Math.round(ms / eng.DT), i => { win[i]++; snapAcc[i]++; });
  }
  function close(ms) {
    const secs = ms / 1000;
    for (let i = 0; i < N; i++) { hz[i] = win[i] / secs; win[i] = 0; }
  }
  function popRates(out) {
    for (let f = 0; f < featIdx.length; f++) {
      const ids = featIdx[f];
      let s = 0;
      for (let i = 0; i < ids.length; i++) s += hz[ids[i]];
      out[f] = 1 - Math.exp(-Math.max(0, s / ids.length) / 40);
    }
    return out;
  }

  const before = new Float32Array(featNames.length);
  const after = new Float32Array(featNames.length);

  /* How hard each eye is driven by a threat this big, this far round.

     Straight ahead lights both, as it would on a real pair of eyes — which is
     also why threats never come from straight ahead in this scenario: there the
     two sides are driven identically and there is no direction to read. */
  function eyeDrive(side, loom) {
    let l = side < 0 ? loom * -side : 0;
    let r = side > 0 ? loom * side : 0;
    const ahead = Math.max(0, 1 - Math.abs(side) * 2.2) * loom;
    return { l: Math.max(l, ahead * 0.8), r: Math.max(r, ahead * 0.8) };
  }

  /* One glance: settle and take a baseline, pulse, then read the whole response
     window — pulse included — against it. */
  function glance(side, loom, maxHz = DRIVE_HZ) {
    snapAcc.fill(0);
    advance(GLANCE.gap); close(GLANCE.gap); popRates(before);
    const drive = eyeDrive(side, loom);
    for (let i = 0; i < loomL.length; i++) rates[i] = drive.l * maxHz;
    for (let i = 0; i < loomR.length; i++) rates[loomL.length + i] = drive.r * maxHz;
    eng.stimulate(stimIdx, rates);
    advance(GLANCE.width);
    eng.stimulate(new Int32Array(0));
    advance(GLANCE.readAt - GLANCE.width);
    close(GLANCE.readAt); popRates(after);
    const x = new Float32Array(D);
    const urgency = evokedInto(before, after, x);
    let g = 0;
    for (const i of gf) g += hz[i];
    return { x, urgency, drive, gf: gf.length ? g / gf.length : 0 };
  }

  /* The busiest cells across the glance just taken, for the replay's brain view.
     Counted over the whole glance rather than one window, so what the page draws
     is the wave running through her, not a 30 ms slice of it. */
  function snapshot({ max = 1400, floorHz = 4 } = {}) {
    const secs = (GLANCE.gap + GLANCE.readAt) / 1000;
    const idx = [];
    for (let i = 0; i < N; i++) if (snapAcc[i] / secs >= floorHz) idx.push(i);
    if (idx.length > max) {
      idx.sort((a, b) => snapAcc[b] - snapAcc[a]);
      idx.length = max;
      idx.sort((a, b) => a - b);
    }
    let top = 1;
    for (const i of idx) top = Math.max(top, snapAcc[i] / secs);
    return { i: idx, v: idx.map(i => Math.max(1, Math.round((snapAcc[i] / secs / top) * 255))), top: Math.round(top) };
  }

  return { meta, N, E, labels, featNames, featIdx, D, loomL, loomR, gf, eng, rng,
           hz, glance, snapshot, popRates, eyeDrive, advance, close };
}
