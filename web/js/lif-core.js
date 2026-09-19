/* The leaky integrate-and-fire engine, as a class.

   Parameters are adapted from Shiu et al. (2024). Subthreshold integration uses
   the closed-form solution; spike timing, delays and refractory periods remain
   discretized, so the full simulation can depend on step size. This is the
   only copy — the web worker wraps it, and the headless trainer imports it
   directly, so the browser and the training run cannot drift apart. */

export const PARAMS = {
  V0: -52.0, VRST: -52.0, VTH: -45.0,
  TMBR: 20.0, TAU: 5.0, TRFC: 2.2, TDLY: 1.8,
  WSYN: 0.275, RPOI: 150.0, FPOI: 250.0,
};

export class Engine {
  constructor({ N, indptr, indices, weights, dt = 0.1 }) {
    const P = PARAMS;
    this.N = N;
    this.indptr = indptr; this.indices = indices; this.weights = weights;
    this.DT = dt;
    this.EV = Math.exp(-dt / P.TMBR);
    this.EG = Math.exp(-dt / P.TAU);
    this.KC = (P.TAU / (P.TAU - P.TMBR)) * (this.EG - this.EV);
    this.RFC_STEPS = Math.max(1, Math.round(P.TRFC / dt));
    this.DLY_STEPS = Math.max(1, Math.round(P.TDLY / dt));
    this.P_POI = P.RPOI * dt / 1000;
    this.W_POI = P.WSYN * P.FPOI;
    this.EPS = 0.02;

    this.v = new Float32Array(N); this.g = new Float32Array(N);
    this.rfc = new Int16Array(N); this.inActive = new Uint8Array(N);
    this.isStim = new Uint8Array(N); this.spikeCount = new Int32Array(N);
    this.active = new Int32Array(N);
    this.outIdx = new Int32Array(1 << 16);
    this.ring = [];
    for (let i = 0; i < this.DLY_STEPS; i++) this.ring.push({ buf: new Int32Array(1024), n: 0 });
    this.stimList = new Int32Array(0);
    this.stimRate = null;
    this.nActive = 0; this.step = 0; this.outCount = 0; this.totalSpikes = 0;
    this.rand = Math.random;
    this.reset();
  }

  get t() { return this.step * this.DT; }

  reset() {
    const P = PARAMS;
    this.v.fill(P.V0); this.g.fill(0); this.rfc.fill(0);
    this.inActive.fill(0); this.spikeCount.fill(0);
    this.nActive = 0; this.step = 0; this.totalSpikes = 0; this.outCount = 0;
    for (const r of this.ring) r.n = 0;
    for (let k = 0; k < this.stimList.length; k++) this.touch(this.stimList[k]);
  }

  /* `rates` is per-neuron Hz, index-aligned to `idx`; omit for the default drive */
  stimulate(idx, rates) {
    this.isStim.fill(0);
    this.stimList = idx instanceof Int32Array ? idx : Int32Array.from(idx || []);
    this.stimRate = rates ? Float32Array.from(rates) : null;
    for (let k = 0; k < this.stimList.length; k++) {
      this.isStim[this.stimList[k]] = 1;
      this.touch(this.stimList[k]);
    }
  }

  touch(i) {
    if (this.inActive[i]) return;
    this.inActive[i] = 1;
    this.active[this.nActive++] = i;
  }

  ringPush(slot, i) {
    const r = this.ring[slot];
    if (r.n === r.buf.length) { const b = new Int32Array(r.buf.length * 2); b.set(r.buf); r.buf = b; }
    r.buf[r.n++] = i;
  }

  advance() {
    const P = PARAMS;
    const { indptr, indices, weights, v, g, rfc, isStim, active } = this;
    const slot = this.step % this.DLY_STEPS;

    const r = this.ring[slot];
    for (let k = 0; k < r.n; k++) {
      const src = r.buf[k];
      for (let e = indptr[src], b = indptr[src + 1]; e < b; e++) {
        const j = indices[e];
        g[j] += weights[e];
        this.touch(j);
      }
    }
    r.n = 0;

    for (let k = 0; k < this.stimList.length; k++) {
      const p = this.stimRate ? this.stimRate[k] * (this.DT / 1000) : this.P_POI;
      if (p > 0 && this.rand() < p) { const i = this.stimList[k]; v[i] += this.W_POI; this.touch(i); }
    }

    let w = 0;
    this.outCount = 0;
    for (let k = 0; k < this.nActive; k++) {
      const i = active[k];
      if (rfc[i] > 0) { rfc[i]--; active[w++] = i; continue; }
      const gi = g[i], vi = v[i];
      const vn = P.V0 + (vi - P.V0) * this.EV + this.KC * gi;
      const gn = gi * this.EG;
      if (vn > P.VTH) {
        v[i] = P.VRST; g[i] = 0;
        if (!isStim[i]) rfc[i] = this.RFC_STEPS;
        this.spikeCount[i]++; this.totalSpikes++;
        this.ringPush((this.step + this.DLY_STEPS - 1) % this.DLY_STEPS, i);
        if (this.outCount < this.outIdx.length) this.outIdx[this.outCount++] = i;
        active[w++] = i;
      } else {
        v[i] = vn; g[i] = gn;
        const dv = vn - P.V0;
        if (dv < this.EPS && dv > -this.EPS && gn < this.EPS && gn > -this.EPS && !isStim[i]) {
          this.inActive[i] = 0; v[i] = P.V0; g[i] = 0;
        } else active[w++] = i;
      }
    }
    this.nActive = w;
    this.step++;
  }

  /* run n sub-steps, returning the spikes emitted across them */
  run(n, sink) {
    for (let s = 0; s < n; s++) {
      this.advance();
      if (sink) for (let k = 0; k < this.outCount; k++) sink(this.outIdx[k]);
    }
  }
}
