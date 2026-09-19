/* Defence: something is coming, and she has to act before it arrives.

   Why this scenario and not another: the looming pathway is the one that measurably
   works in this model. LPLC2 drives DNp01 — the giant fibre, the single neuron that
   triggers a real fly's escape — hard and reliably. And it carries direction, which
   odour did not: with equal cell counts, left and right LPLC2 populations give
   descending patterns at cosine 0.84–0.91 against a repeat-noise floor of 0.96.
   Front versus back within one side does not separate (0.95–0.97), so this scenario
   asks her only which side, never how far round. tools/25 and tools/26 measure it.

   The circuit here is the pathway only — neurons reachable from LPLC2 in two
   synapses that also reach a descending neuron, at 8 or more contacts: 6,203
   cells and 108,237 edges against the whole brain's 138,639 and 2.7 million. The
   full brain managed 10 ms of biological time per wall second once the main
   thread was also drawing it, which put an episode at 35 s and made the learning
   arc unwatchable.

   She is glanced, not stared at: a 30 ms pulse read 60 ms later against the pattern
   from just before it. Sustained drive saturates the network and the readout stops
   carrying anything — the same failure that killed the odour-maze attempt. */

import { fetchGz, decodeConnectome, decodeLabels, decodePositions } from '../js/data.js';
import { BrainView } from '../js/gl.js';
import { Threat, ArenaView } from './arena.js';

const DT_MS = 0.5;
import { GLANCE, ACTIONS } from './policy.js';

export class Defender {
  constructor() { this.ready = false; this.t = 0; this.nActive = 0; }

  async load(onProgress) {
    const meta = JSON.parse(new TextDecoder().decode(await fetchGz('data/meta.json.gz')));
    this.meta = meta;
    const N = meta.n_neurons, E = meta.n_edges;
    onProgress?.('annotations', 0.12);
    this.labels = decodeLabels(await fetchGz('data/labels.bin.gz'), N);
    const sign = await fetchGz('data/sign.bin.gz');
    this.channels = await (await fetch('data/channels.json')).json();
    onProgress?.('positions', 0.18);
    const posRaw = await fetchGz('data/pos.u16.bin.gz');
    this.geom = decodePositions(posRaw, N, meta.bbox_lo, meta.span);
    onProgress?.('connections', 0.24);
    const raw = await fetchGz('data/conn.bin.gz', f => onProgress?.('connections', 0.24 + f * 0.6));
    onProgress?.('rebuild', 0.88);
    await new Promise(r => setTimeout(r, 0));
    const conn = decodeConnectome(raw, N, E, sign);

    this.featNames = Object.keys(this.channels.features);
    this.featIdx = this.featNames.map(n => Int32Array.from(this.channels.features[n]));
    this.hz = new Float32Array(N);
    this.win = new Float32Array(N);

    // looming detectors, split by the side of the brain they sit in
    const d = meta.dicts, L = this.labels;
    const lpIdx = d.cell_type.indexOf('LPLC2');
    const lSide = d.side.indexOf('left'), rSide = d.side.indexOf('right');
    this.loomL = []; this.loomR = [];
    for (let i = 0; i < L.cellType.length; i++) {
      if (L.cellType[i] !== lpIdx) continue;
      (L.side[i] === lSide ? this.loomL : this.loomR).push(i);
    }
    this.gf = [];
    const gfIdx = d.cell_type.indexOf('DNp01');
    for (let i = 0; i < L.cellType.length; i++) if (L.cellType[i] === gfIdx) this.gf.push(i);

    this.worker = new Worker('../js/sim.worker.js', { type: 'module' });
    this.worker.onmessage = e => this._msg(e.data);
    this.worker.postMessage({ cmd: 'init', N, dt: DT_MS, indptr: conn.indptr,
      indices: conn.indices, weights: conn.weights },
      [conn.indptr.buffer, conn.indices.buffer, conn.weights.buffer]);
  }

  _msg(m) {
    if (m.type === 'ready') {
      this.ready = true;
      this.worker.postMessage({ cmd: 'speed', value: 24 });
      this.worker.postMessage({ cmd: 'run', on: true });
      this.onReady?.();
      return;
    }
    if (m.type === 'frame') {
      const sp = m.spikes;
      for (let i = 0; i < sp.length; i++) this.win[sp[i]]++;
      this.t = m.t; this.nActive = m.nActive;
    }
  }

  tick(now) {
    if (!this.ready) return;
    const dt = this.last ? Math.min(Math.max((now - this.last) / 1000, 0.05), 1) : 0.2;
    this.last = now;
    for (let i = 0; i < this.hz.length; i++) {
      this.hz[i] += ((this.win[i] / dt) - this.hz[i]) * 0.5;
      this.win[i] = 0;
    }
  }

  features() {
    const x = new Float32Array(this.featIdx.length);
    for (let f = 0; f < this.featIdx.length; f++) {
      const ids = this.featIdx[f];
      let s = 0;
      for (let i = 0; i < ids.length; i++) s += this.hz[ids[i]];
      x[f] = 1 - Math.exp(-Math.max(0, s / ids.length) / 40);
    }
    return x;
  }

  giantFibre() {
    let s = 0;
    for (const i of this.gf) s += this.hz[i];
    return this.gf.length ? s / this.gf.length : 0;
  }

  /* drive the side the threat is on, at a rate set by how large it looms */
  glance(threats, heading, maxHz = 150) {
    let l = 0, r = 0;
    for (const t of threats) {
      if (t.dead) continue;
      const s = t.sideOf(heading), w = t.loom;
      if (s < 0) l = Math.max(l, w * -s); else r = Math.max(r, w * s);
      // straight ahead lights both, as it would on a real pair of eyes
      const ahead = Math.max(0, 1 - Math.abs(s) * 2.2) * w;
      l = Math.max(l, ahead * 0.8); r = Math.max(r, ahead * 0.8);
    }
    const idx = [...this.loomL, ...this.loomR];
    const rates = new Float32Array(idx.length);
    for (let i = 0; i < this.loomL.length; i++) rates[i] = l * maxHz;
    for (let i = 0; i < this.loomR.length; i++) rates[this.loomL.length + i] = r * maxHz;
    this.worker.postMessage({ cmd: 'stim', idx: Int32Array.from(idx), rates, reset: false });
    return { l, r };
  }
  quiet() { this.worker.postMessage({ cmd: 'stim', idx: new Int32Array(0), reset: false }); }
}

/* the glance cycle, kept against biological time */
export class Glancer {
  constructor(brain) { this.b = brain; this.phase = 'gap'; this.mark = 0; this.evoked = null; this.drive = { l: 0, r: 0 }; }
  update(threats, heading) {
    const t = this.b.t;
    if (!this.evoked) this.evoked = new Float32Array(this.b.featIdx.length);
    if (this.phase === 'gap') {
      if (t - this.mark < GLANCE.gap) return false;
      this.base = this.b.features();
      this.drive = this.b.glance(threats, heading);
      this.phase = 'pulse'; this.mark = t;
      return false;
    }
    if (this.phase === 'pulse') {
      if (t - this.mark < GLANCE.width) return false;
      this.b.quiet(); this.phase = 'read';
      return false;
    }
    if (t - this.mark < GLANCE.readAt) return false;
    const f = this.b.features();
    let peak = 1e-6;
    for (let i = 0; i < f.length; i++) {
      this.evoked[i] = Math.max(0, f[i] - this.base[i]);
      if (this.evoked[i] > peak) peak = this.evoked[i];
    }
    if (peak > 0.01) for (let i = 0; i < f.length; i++) this.evoked[i] /= peak;
    else this.evoked.fill(0);
    this.phase = 'gap'; this.mark = t;
    return true;
  }
  reset() { this.phase = 'gap'; this.mark = this.b.t; if (this.evoked) this.evoked.fill(0); }
}

export { Policy, ACTIONS, GLANCE } from './policy.js';

export { Threat, ArenaView, BrainView };
