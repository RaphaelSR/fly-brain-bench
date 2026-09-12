/* Turning neural activity into a body pose.

   IMPORTANT: this layer is engineering, not measurement. The connectome stops
   at the neck. Which descending neurons exist, and what each of them does, is
   published biology; the mapping from their firing rate to a leg angle is a
   choice made here. Every embodied fly simulation makes some version of it. */

export const BEHAVIOURS = ['rest', 'walk', 'turnL', 'turnR', 'backward', 'stop', 'escape', 'feed', 'groom'];

/* Rates arrive as spike counts per readout window; normalise into 0..1 drive. */
const sat = (x, k) => 1 - Math.exp(-Math.max(0, x) / k);

export class Decoder {
  constructor(channels, features) {
    this.ch = channels;
    this.featNames = Object.keys(features);
    this.featIdx = this.featNames.map(n => Int32Array.from(features[n]));
    this.model = null;               // trained weights, once the user fits one
    this.samples = [];               // {x: Float32Array, y: label index}
    this.mode = 'rules';
  }

  /* mean rate over a named channel, optionally one hemisphere */
  chanRate(rates, name, side) {
    const c = this.ch[name];
    if (!c) return 0;
    const list = side ? c[side] : c.all;
    if (!list || !list.length) return 0;
    let s = 0;
    for (let i = 0; i < list.length; i++) s += rates[list[i]];
    return s / list.length;
  }

  /* the feature vector the learned decoder sees: one number per descending cell type */
  features(rates) {
    const x = new Float32Array(this.featIdx.length);
    for (let f = 0; f < this.featIdx.length; f++) {
      const ids = this.featIdx[f];
      let s = 0;
      for (let i = 0; i < ids.length; i++) s += rates[ids[i]];
      x[f] = sat(s / ids.length, 40);   // graded across the 0-300 Hz range these types reach
    }
    return x;
  }

  /* hand-written mapping from the named, well-studied channels */
  rules(rates) {
    const escape = sat(this.chanRate(rates, 'escape'), 2);
    const stop = sat(this.chanRate(rates, 'stop'), 4);
    const back = sat(this.chanRate(rates, 'backward'), 4);
    const walkC = sat(this.chanRate(rates, 'walk'), 6);
    const wing = Math.max(sat(this.chanRate(rates, 'wing'), 5), escape);
    const pro = sat(this.chanRate(rates, 'proboscis'), 3);
    const land = sat(this.chanRate(rates, 'landing'), 4);
    const tl = this.chanRate(rates, 'turn', 'left');
    const tr = this.chanRate(rates, 'turn', 'right');
    const turn = Math.max(-1, Math.min(1, (tr - tl) / 6));
    return {
      walk: Math.max(walkC, land * 0.4), turn, stop, backward: back,
      escape, proboscis: pro, wing, groom: 0,
    };
  }

  /* argmax of the learned classifier, expressed as the same drive object */
  learned(rates) {
    if (!this.model) return this.rules(rates);
    const x = this.features(rates);
    const p = this.predict(x);
    let best = 0;
    for (let i = 1; i < p.length; i++) if (p[i] > p[best]) best = i;
    const d = { walk: 0, turn: 0, stop: 0, backward: 0, escape: 0, proboscis: 0, wing: 0, groom: 0 };
    const c = BEHAVIOURS[best], w = p[best];
    if (c === 'walk') d.walk = w;
    else if (c === 'turnL') { d.walk = w * 0.8; d.turn = -w; }
    else if (c === 'turnR') { d.walk = w * 0.8; d.turn = w; }
    else if (c === 'backward') d.backward = w;
    else if (c === 'stop') d.stop = w;
    else if (c === 'escape') { d.escape = w; d.wing = w; }
    else if (c === 'feed') d.proboscis = w;
    else if (c === 'groom') d.groom = w;
    d._label = c; d._conf = w;
    return d;
  }

  decode(rates) { return this.mode === 'learned' && this.model ? this.learned(rates) : this.rules(rates); }

  /* ---- training: multinomial logistic regression, plain gradient descent ---- */
  capture(rates, label) {
    this.samples.push({ x: this.features(rates), y: BEHAVIOURS.indexOf(label) });
  }
  clear() { this.samples = []; this.model = null; }

  labelCounts() {
    const c = {};
    for (const s of this.samples) c[BEHAVIOURS[s.y]] = (c[BEHAVIOURS[s.y]] || 0) + 1;
    return c;
  }

  train(epochs = 260, lr = 0.6, l2 = 1e-3) {
    const K = BEHAVIOURS.length, D = this.featIdx.length, n = this.samples.length;
    if (n < 2) return null;
    const used = new Set(this.samples.map(s => s.y));
    if (used.size < 2) return null;
    const W = new Float32Array(K * D), b = new Float32Array(K);
    const p = new Float32Array(K);
    for (let e = 0; e < epochs; e++) {
      const gW = new Float32Array(K * D), gb = new Float32Array(K);
      for (const s of this.samples) {
        let max = -1e9;
        for (let k = 0; k < K; k++) {
          let z = b[k]; const off = k * D;
          for (let d = 0; d < D; d++) z += W[off + d] * s.x[d];
          p[k] = z; if (z > max) max = z;
        }
        let sum = 0;
        for (let k = 0; k < K; k++) { p[k] = Math.exp(p[k] - max); sum += p[k]; }
        for (let k = 0; k < K; k++) {
          const err = (p[k] / sum) - (k === s.y ? 1 : 0);
          gb[k] += err; const off = k * D;
          for (let d = 0; d < D; d++) gW[off + d] += err * s.x[d];
        }
      }
      const step = lr / n;
      for (let k = 0; k < K; k++) {
        b[k] -= step * gb[k]; const off = k * D;
        for (let d = 0; d < D; d++) W[off + d] -= step * (gW[off + d] + l2 * W[off + d]);
      }
    }
    this.model = { W, b, K, D };
    let ok = 0;
    for (const s of this.samples) {
      const q = this.predict(s.x);
      let best = 0;
      for (let k = 1; k < K; k++) if (q[k] > q[best]) best = k;
      if (best === s.y) ok++;
    }
    return { accuracy: ok / n, n, classes: used.size };
  }

  predict(x) {
    const { W, b, K, D } = this.model;
    const p = new Float32Array(K);
    let max = -1e9;
    for (let k = 0; k < K; k++) {
      let z = b[k]; const off = k * D;
      for (let d = 0; d < D; d++) z += W[off + d] * x[d];
      p[k] = z; if (z > max) max = z;
    }
    let sum = 0;
    for (let k = 0; k < K; k++) { p[k] = Math.exp(p[k] - max); sum += p[k]; }
    for (let k = 0; k < K; k++) p[k] /= sum;
    return p;
  }
}
