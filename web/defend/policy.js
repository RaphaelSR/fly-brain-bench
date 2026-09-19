/* The learning layer, kept free of anything browser-shaped.

   Imported by the page and by the headless trainer, so a run trained offline and
   a run trained in the tab are the same algorithm on the same engine. */

export const ACTIONS = ['hold', 'jump', 'left', 'right'];
export const GLANCE = { width: 30, readAt: 60, gap: 90 };   // biological ms

/* The rules of an episode, in one place so the page and the headless trainer
   cannot disagree about what counts as escaping.

   A real fly gets one escape: the giant fibre fires, she goes, and that is the
   move. Allowing repeated jumps made the task trivial — random play survived 84%
   of episodes from the very first one, so there was no arc to watch. With a
   single jump the problem becomes timing, which is what the looming system is
   actually for. */
export const RULES = { jumpDecay: 0.34, dodgeAir: 0.2, dodgeFacing: 0.7, actCost: 0.04 };

export function blankBody() {
  return { heading: 0, airborne: 0, jumpUsed: false };
}

/* returns the step reward for taking `a` */
export function applyAction(body, a) {
  const name = ACTIONS[a];
  if (name === 'jump') {
    if (body.jumpUsed) return -0.12;        // nothing left to jump with
    body.jumpUsed = true;
    body.airborne = 1;
    return -RULES.actCost;
  }
  if (name === 'left') body.heading -= 0.42;
  else if (name === 'right') body.heading += 0.42;
  return name === 'hold' ? 0 : -RULES.actCost;
}

export function decayBody(body) {
  body.airborne = Math.max(0, body.airborne - RULES.jumpDecay);
}

export function survived(body, threat) {
  const facing = Math.abs(threat.sideOf(body.heading));
  return body.airborne > RULES.dodgeAir || facing > RULES.dodgeFacing;
}

/* linear softmax policy, REINFORCE with a discounted return */
export class Policy {
  constructor(D, K = ACTIONS.length) {
    this.D = D; this.K = K;
    this.W = new Float32Array(K * D); this.b = new Float32Array(K);
    this.episodes = 0;
  }
  probs(x, temp = 1) {
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
    const p = this.probs(x, temp);
    let r = Math.random(), k = 0;
    while (k < this.K - 1 && (r -= p[k]) > 0) k++;
    return k;
  }
  learn(steps, gamma = 0.92, lr = 0.11) {
    if (steps.length < 2) return;
    const ret = new Float64Array(steps.length);
    let G = 0;
    for (let t = steps.length - 1; t >= 0; t--) { G = steps[t].r + gamma * G; ret[t] = G; }
    let m = 0; for (const v of ret) m += v; m /= ret.length;
    let sd = 0; for (const v of ret) sd += (v - m) ** 2;
    sd = Math.sqrt(sd / ret.length) || 1;
    for (let t = 0; t < steps.length; t++) {
      const s = steps[t], adv = (ret[t] - m) / sd, p = this.probs(s.x);
      for (let k = 0; k < this.K; k++) {
        const g = ((k === s.a ? 1 : 0) - p[k]) * adv;
        this.b[k] += lr * g * 0.25;
        const off = k * this.D;
        for (let d = 0; d < this.D; d++) this.W[off + d] += lr * g * s.x[d];
      }
    }
    this.episodes++;
  }
  serialise() {
    return { W: Array.from(this.W, v => Math.round(v * 1e4) / 1e4),
             b: Array.from(this.b, v => Math.round(v * 1e4) / 1e4), episodes: this.episodes };
  }
  restore(s) {
    if (!s?.W || s.W.length !== this.W.length) return false;
    this.W.set(s.W); this.b.set(s.b); this.episodes = s.episodes || 0; return true;
  }
  forget() { this.W.fill(0); this.b.fill(0); this.episodes = 0; }
}

