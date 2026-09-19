/* Playback over a recorded training run.

   Training is not a spectator sport at one episode every few seconds, so the page
   does not train — it plays back what tools/train.mjs recorded. What is in the
   file is not a prettified summary: it is her actual decisions, the probabilities
   behind each one, and the cells that were firing when she made it.

   The recording is built around a probe battery. Every twenty-five episodes the
   policy is frozen and shown the *same twelve threats*, with exploration off, and
   every glance of that is written down. Two runs from different points in the
   training are therefore directly comparable — same approach, same angle, same
   everything except what she has learned in between. That is the only honest way
   to show an arc, because two ordinary training episodes differ in where the
   threat came from as much as in what she knew. */

import { fetchGz } from '../js/data.js';

export class Recording {
  constructor(raw) {
    this.raw = raw;
    this.actions = raw.actions;
    this.angles = raw.probeAngles;
    this.glances = raw.glances;
    // the approaches her neurons were recorded for, which are the ones worth playing
    const sc = raw.showcase;
    this.showcase = Array.isArray(sc) ? sc : [sc ?? 0];
    this.checkpoints = raw.probes.map(p => ({
      ep: p.ep,
      score: mean(p.ok),
      timed: mean(p.timed || []),
      aimed: mean(p.aimed || []),
      runs: p.runs,
    }));
  }
  static async load(url) {
    const bytes = await fetchGz(url);
    return new Recording(JSON.parse(new TextDecoder().decode(bytes)));
  }
  run(cp, angle) { return this.checkpoints[cp]?.runs[angle] || null; }
  /* the training episodes themselves, as a win/loss strip */
  get train() { return this.raw.train; }
  get inputs() { return this.raw.inputs || { left: [], right: [] }; }
}

const mean = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

/* One run, beaten out over time.

   A beat is one glance: she looks, then she moves. The threat eases between the
   positions it actually held, so the approach reads as motion rather than as the
   seven discrete steps it is underneath. */
export const BEAT = 0.68;          // seconds per glance at 1x
export const VERDICT = 1.15;       // seconds to sit on the outcome

export class Player {
  constructor(rec) {
    this.rec = rec;
    this.cp = 0;
    this.angle = rec.showcase[0];
    this.reset();
  }
  reset() {
    this.k = -1;                   // glance index
    this.t = 0;
    this.done = false;
    this.body = { lean: 0, airborne: 0, leapUsed: false };
    this.leapAge = 0;
    this.leapLean = 0;
    this._pendingAct = null;
    this.step = 0;
    this.lastP = null;
    this.urgency = 0; this.gf = 0; this.drive = { l: 0, r: 0 };
  }
  get run() { return this.rec.run(this.cp, this.angle); }
  get angleValue() { return this.rec.angles[this.angle]; }

  /* advances the clock; calls back on the frames where something happens */
  update(dt, { onGlance, onAct, onEnd } = {}) {
    if (!(dt > 0)) return;
    const run = this.run;
    if (!run) return;
    this.t += dt;
    if (this.done) {
      if (this.t >= VERDICT) { this.t = 0; onEnd?.(run); }
      return;
    }
    const want = Math.floor(this.t / BEAT);
    if (want > this.k) {
      this.k = want;
      if (this.k >= this.rec.glances) {
        this.done = true; this.t = 0;
        this.step = this.rec.glances;
        onEnd?.(run, true);
        return;
      }
      const s = run.steps[this.k];
      this.step = this.k;
      this.lastP = s.p;
      this.urgency = s.u; this.gf = s.gf;
      this.drive = { l: s.l, r: s.r };
      onGlance?.(this.k, s);
      this._pendingAct = s;
    }
    // she moves partway through the beat, after she has looked
    if (this._pendingAct && this.t - this.k * BEAT > BEAT * 0.46) {
      const s = this._pendingAct;
      this._pendingAct = null;
      const name = this.rec.actions[s.a];
      const wasUsed = this.body.leapUsed;
      this.body.lean = s.lean;
      this.body.leapUsed = !!s.used;
      if (name === 'leap' && !wasUsed) {
        this.body.airborne = 1;
        this.leapAge = 0;
        this.leapLean = s.lean;
        onAct?.(name, s);
      }
      else onAct?.(name, s);
      this.step = this.k + 1;
    }
    // airborne decays across the remaining beats exactly as it did in training
    const decay = this.rec.raw.rules?.leapDecay ?? 0.25;
    this.body.airborne = Math.max(0, this.body.airborne - decay * (dt / BEAT));
    if (this.body.leapUsed) this.leapAge += dt;
  }

  get anticipation() {
    if (!this._pendingAct || this.body.leapUsed || this.rec.actions[this._pendingAct.a] !== 'leap') return 0;
    return Math.min(1, (this.t - this.k * BEAT) / (BEAT * 0.46));
  }

  /* fractional position of the threat, for smooth motion between glances */
  get approach() {
    const g = this.rec.glances;
    const u = this.done ? 1 : Math.min(1, Math.max(0, this.t / BEAT) / g);
    return Math.min(1, u);
  }
}
