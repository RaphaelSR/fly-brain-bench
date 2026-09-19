/* The learning layer, kept free of anything browser-shaped.

   Imported by the page and by the headless trainer, so a run trained offline and
   a run trained in the tab are the same algorithm on the same engine. */

/* Her escape is a lean and a leap, which is what a real one is.

   A fruit fly does not simply jump when something looms: before the legs fire she
   shifts her body away from it, and the leap goes along that lean. A fly that
   leaps into the thing is still hit.

   The first version of this scenario gave her `left`, `right` and `jump` as
   separate moves, with survival granted for being turned far enough away at
   contact. Turning accumulated, so four turns in *either* direction put the threat
   behind her and she escaped — and that is exactly what she learned to do: every
   probe run opened `r r r r`. Direction was never needed, and a control network
   with no response at all scored as well as the real one.

   A lean does not accumulate. The last one is the one she leaps with, so getting
   it wrong cannot be fixed by doing it more. Direction has to come from her eyes,
   and timing has to come from her eyes, and she needs both. */
export const ACTIONS = ['hold', 'lean left', 'lean right', 'leap'];

/* The measurement protocol, in biological milliseconds.

   `gap` settles the network and is where the baseline is taken; `width` is the
   pulse; `readAt` is how long after pulse onset the response window runs.

   readAt was 60 with the window opened only after the pulse had ended, which
   measured the tail of the response rather than the response: over a few dozen
   cells that is one or two spikes, so the urgency channel came out quantised and
   dropped to zero on half the glances. Reading the whole ninety milliseconds from
   onset makes it climb with the approach — rank correlation 0.97 against
   distance, measured by tools/29_urgency_check.mjs. */
export const GLANCE = { width: 30, readAt: 90, gap: 90 };

export const RULES = { leapDecay: 0.25, airborneAt: 0.2, actCost: 0.04, wastedLeap: 0.12 };

/* Where a threat comes from, and why from there.

   tools/28_direction_check.mjs measures both edges of this band. Nearer the front
   than about 0.8 rad the model gives her nothing to go on: the frontal term drives
   both eyes identically, and left and right readouts sit at cosine 0.96–0.999
   against a repeat floor of 0.99, so there is no direction in the signal to find.
   From 0.8 rad out they separate by 0.07–0.17 below that floor, which is real.

   Threats therefore arrive from the side she can actually read. */
export const THREAT_BAND = [0.80, 1.25];
export function randomThreatAngle(rand = Math.random) {
  const [lo, hi] = THREAT_BAND;
  return (rand() < 0.5 ? -1 : 1) * (lo + rand() * (hi - lo));
}

export const TRAIN = { gamma: 0.92, lr: 0.05, batch: 8, baseRate: 0.06, trust: 1.0 };

/* How much of the policy is still exploration. Annealed slowly: with batched
   updates the early episodes are the ones the baseline is still calibrating on,
   and collapsing to a near-greedy policy before then locks in whatever the first
   few lucky episodes happened to do. */
export function temperature(episodes) {
  return Math.max(0.7, 1.6 - episodes * 0.012);
}

export function blankBody() {
  return { lean: 0, airborne: 0, leapUsed: false };
}

/* returns the step reward for taking `a` */
export function applyAction(body, a) {
  const name = ACTIONS[a];
  if (name === 'leap') {
    if (body.leapUsed) return -RULES.wastedLeap;   // she only gets the one
    body.leapUsed = true;
    body.airborne = 1;
    return -RULES.actCost;
  }
  if (name === 'lean left') body.lean = -1;
  else if (name === 'lean right') body.lean = 1;
  else return 0;
  return -RULES.actCost;
}

export function decayBody(body) {
  body.airborne = Math.max(0, body.airborne - RULES.leapDecay);
}

/* which way she would have to go to clear it: -1 is left, +1 is right */
export const awayFrom = threat => (threat.a >= 0 ? -1 : 1);

export function survived(body, threat) {
  return body.airborne > RULES.airborneAt && body.lean === awayFrom(threat);
}

/* Partial credit, because all-or-nothing gave her nothing to climb.

   Getting both right by chance is roughly an 8% event, and REINFORCE against a
   baseline needs successes to be better *than* something: seeds that never found
   one sat at zero for four hundred episodes. Scoring the two halves separately
   turns one cliff into two slopes — timing is learnable from the urgency channel
   alone, direction from the pattern alone, and only both together pay full.
   Both networks get the same shaping, so it does not favour the real one. */
export function outcomeReward(body, threat) {
  const timed = body.airborne > RULES.airborneAt;
  const aimed = body.lean === awayFrom(threat);
  if (timed && aimed) return 3;
  return timed || aimed ? -0.5 : -3;
}

/* ---------------- what the readout actually sees ----------------

   One channel more than there are feature populations. The pattern has to be
   normalised — sustained drive saturates the network, and without dividing by the
   peak the vector mostly encodes how excited the whole brain is rather than
   where the threat is. But dividing by the peak throws away the *only* cue to
   how close the thing is, and with a single jump per episode the entire task is
   when to use it. So the peak goes back in as its own channel: direction from
   the shape, urgency from the size. Both are measured from her own cells. */
export function featureSize(nPopulations) { return nPopulations + 1; }

/* The urgency channel is the *mean* rise across populations, not the largest one.

   Taking the maximum meant one population, and one population over a short window
   is a handful of spikes: the channel jumped between a few quantised values and
   carried no usable ordering. Averaging the rise over all fifty-eight is the same
   quantity estimated from fifty-eight times the evidence, and it climbs with the
   approach the way the drive does.

   The pattern is still divided by its own peak, because direction has to survive
   the fact that a near threat excites everything more than a far one. Scaling is
   left to the policy, which standardises every channel against its own history. */
export function evokedInto(before, after, out) {
  const n = before.length;
  let peak = 0, sum = 0;
  for (let i = 0; i < n; i++) {
    const d = after[i] - before[i];
    out[i] = d > 0 ? d : 0;
    sum += out[i];
    if (out[i] > peak) peak = out[i];
  }
  if (peak > 1e-3) { for (let i = 0; i < n; i++) out[i] /= peak; }
  else { for (let i = 0; i < n; i++) out[i] = 0; }
  out[n] = sum / n;
  return out[n];
}

/* ---------------- linear softmax policy, batched REINFORCE ---------------- */
export class Policy {
  constructor(D, K = ACTIONS.length) {
    this.D = D; this.K = K;
    this.W = new Float32Array(K * D); this.b = new Float32Array(K);
    this.gW = new Float32Array(K * D); this.gb = new Float32Array(K);
    this.base = null;          // running return per step index — the baseline
    this.scale = 1;            // running size of the advantage, so lr is unitless
    this.mu = new Float64Array(D);          // running feature mean...
    this.vr = new Float64Array(D).fill(1);  // ...and variance
    this.seen = 0;
    this._z = new Float32Array(D);
    this.pending = 0;
    this.episodes = 0;
    this.rand = Math.random;
  }

  /* Why the input is standardised before it reaches the weights.

     The evoked vector is normalised by its own peak, so most of its channels sit
     near the top of their range on every single glance: left and right patterns
     measure at cosine 0.6–0.9, which is to say they are largely the *same* vector
     with a small difference riding on it. Fed in raw, those fifty-eight channels
     behave like fifty-eight redundant bias terms. They soak up a bounded update
     that ought to be going into the one real bias and into the few directions
     that actually vary, and the policy spends its budget learning noise — which
     is exactly what it did, sitting at chance for four hundred episodes while a
     blind control with four parameters climbed past 40%.

     Centring by a running mean and dividing by a running deviation leaves only
     the part of each channel that moves. The constant part is what a bias is for. */
  observe(x) {
    this.seen++;
    const r = Math.max(1 / this.seen, 0.003);
    for (let d = 0; d < this.D; d++) {
      const dx = x[d] - this.mu[d];
      this.mu[d] += r * dx;
      this.vr[d] += r * (dx * dx - this.vr[d]);
    }
  }
  standardise(x) {
    const z = this._z;
    for (let d = 0; d < this.D; d++) {
      const v = (x[d] - this.mu[d]) / Math.sqrt(Math.max(this.vr[d], 1e-3));
      z[d] = v > 4 ? 4 : v < -4 ? -4 : v;
    }
    return z;
  }

  probs(xRaw, temp = 1) {
    const x = this.standardise(xRaw);
    const z = new Float32Array(this.K);
    let max = -Infinity;
    for (let k = 0; k < this.K; k++) {
      let s = this.b[k]; const off = k * this.D;
      for (let d = 0; d < this.D; d++) s += this.W[off + d] * x[d];
      z[k] = s / temp; if (z[k] > max) max = z[k];
    }
    let sum = 0;
    for (let k = 0; k < this.K; k++) { z[k] = Math.exp(z[k] - max); sum += z[k]; }
    for (let k = 0; k < this.K; k++) z[k] /= sum;
    return z;
  }
  act(x, temp = 1) {
    this.observe(x);
    const p = this.probs(x, temp);
    let r = this.rand(), k = 0;
    while (k < this.K - 1 && (r -= p[k]) > 0) k++;
    return k;
  }

  /* Why the advantage is measured against a *per-step* running baseline.

     The first version standardised the returns inside one episode. With a fixed
     horizon and a terminal reward that dominates, that is close to useless: in a
     win the returns rise toward the end, in a loss they fall toward it, and
     standardising leaves nearly the same profile either way — late steps
     positive, early steps negative. A losing episode therefore *reinforced* the
     decisions that opened it. The outcome had almost no effect on the update,
     which is what made the learning arc swing from -14 to +52 between seeds.

     Against a running average of the return at the same step index, a win comes
     out above the line at every step and a loss below it. The sign of the update
     is the sign of the outcome, which is the whole idea. */
  learn(steps) {
    if (steps.length < 2) return;
    const H = steps.length;
    if (!this.base || this.base.length < H) {
      const b = new Float64Array(H);
      if (this.base) b.set(this.base);
      this.base = b;
    }
    const ret = new Float64Array(H);
    let G = 0;
    for (let t = H - 1; t >= 0; t--) { G = steps[t].r + TRAIN.gamma * G; ret[t] = G; }

    const adv = new Float64Array(H);
    let sq = 0;
    for (let t = 0; t < H; t++) {
      adv[t] = ret[t] - this.base[t];
      sq += adv[t] * adv[t];
      this.base[t] += TRAIN.baseRate * (ret[t] - this.base[t]);
    }
    this.scale += TRAIN.baseRate * (Math.sqrt(sq / H) - this.scale);
    const s = Math.max(this.scale, 0.05);

    for (let t = 0; t < H; t++) {
      const st = steps[t], temp = st.temp || 1;
      const a = adv[t] / s;
      const p = this.probs(st.x, temp);
      const z = this._z;                     // probs() just standardised st.x
      for (let k = 0; k < this.K; k++) {
        // gradient of log pi under the temperature it was actually sampled at
        const g = ((k === st.a ? 1 : 0) - p[k]) * a / temp;
        this.gb[k] += g;
        const off = k * this.D;
        for (let d = 0; d < this.D; d++) this.gW[off + d] += g * z[d];
      }
    }
    this.pending++;
    this.episodes++;
    if (this.pending >= TRAIN.batch) this.flush();
  }

  /* One update per batch of episodes, of bounded length.

     A single episode is seven samples of a stochastic policy against a stochastic
     brain, so averaging a handful before touching the weights is the cheapest
     variance reduction available. The length cap matters just as much: the update
     is a sum over roughly sixty steps of a fifty-nine dimensional feature, and at
     a plain learning rate it grew the weights fast enough to saturate the softmax
     within the first few batches. Once saturated the gradient vanishes and she is
     locked into whichever action she happened to be doing — which looked, from
     the outside, exactly like a network that cannot learn. Capping the step at a
     fixed length in parameter space fixes it without tuning per feature count. */
  flush() {
    if (!this.pending) return;
    let sq = 0;
    for (let i = 0; i < this.gW.length; i++) sq += this.gW[i] * this.gW[i];
    for (let i = 0; i < this.gb.length; i++) sq += this.gb[i] * this.gb[i];
    const norm = Math.sqrt(sq);
    const k = norm > 1e-9 ? TRAIN.lr / Math.max(norm, TRAIN.trust) : 0;
    for (let i = 0; i < this.W.length; i++) { this.W[i] += k * this.gW[i]; this.gW[i] = 0; }
    for (let i = 0; i < this.b.length; i++) { this.b[i] += k * this.gb[i]; this.gb[i] = 0; }
    this.pending = 0;
  }

  serialise() {
    return { W: Array.from(this.W, v => Math.round(v * 1e4) / 1e4),
             b: Array.from(this.b, v => Math.round(v * 1e4) / 1e4),
             base: this.base ? Array.from(this.base, v => Math.round(v * 1e4) / 1e4) : null,
             mu: Array.from(this.mu, v => Math.round(v * 1e4) / 1e4),
             vr: Array.from(this.vr, v => Math.round(v * 1e5) / 1e5),
             seen: this.seen, scale: this.scale, episodes: this.episodes };
  }
  restore(s) {
    if (!s?.W || s.W.length !== this.W.length) return false;
    this.W.set(s.W); this.b.set(s.b);
    if (Array.isArray(s.base)) this.base = Float64Array.from(s.base);
    if (typeof s.scale === 'number') this.scale = s.scale;
    if (Array.isArray(s.mu) && s.mu.length === this.D) { this.mu.set(s.mu); this.vr.set(s.vr); this.seen = s.seen || 0; }
    this.episodes = s.episodes || 0;
    this.gW.fill(0); this.gb.fill(0); this.pending = 0;
    return true;
  }
  forget() {
    this.W.fill(0); this.b.fill(0); this.gW.fill(0); this.gb.fill(0);
    this.mu.fill(0); this.vr.fill(1); this.seen = 0;
    this.base = null; this.scale = 1; this.pending = 0; this.episodes = 0;
  }
}
