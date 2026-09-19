import { Policy, temperature, randomThreatAngle } from './policy.js';
import { ImpactBody } from './impact.js';

export const WORLD_STEP = 1 / 120;
export const WINDUP = 0.55;

export class SurvivalWorld {
  constructor({ x = 0, z = 0, heading = 0, angle = 1, approach = 1.8 } = {}) {
    this.x = x; this.z = z; this.height = 0; this.heading = heading;
    this.vx = 0; this.vz = 0; this.vy = 0; this.lean = 0; this.used = false;
    this.angle = angle + heading; this.approach = approach;
    this.duration = WINDUP + approach + 2.7;
    this.time = 0; this.hit = false; this.contactAt = null; this.impact = null;
    this.origin = { x, z };
    this.projectile = { x: x + Math.sin(this.angle) * 7, y: 2.8, z: z + Math.cos(this.angle) * 7, yaw: this.angle };
    this.launch = { ...this.projectile };
    this.pvx = -Math.sin(this.angle) * 7 / approach;
    this.pvz = -Math.cos(this.angle) * 7 / approach;
    this.pvy = (0.22 - 2.8 + 2 * approach * approach) / approach;
  }

  act(action) {
    if (this.hit) return -0.1;
    if (action === 1) this.lean = -1;
    if (action === 2) this.lean = 1;
    if (action === 3) {
      if (this.used) return -0.08;
      this.used = true; this.vy = 3.7;
      this.vx = Math.cos(this.heading) * this.lean * 2.5;
      this.vz = -Math.sin(this.heading) * this.lean * 2.5;
      return -0.03;
    }
    return action === 0 ? 0 : -0.01;
  }

  step() {
    const dt = WORLD_STEP;
    this.time += dt;
    if (this.time > WINDUP) {
      const p = this.projectile;
      this.pvy -= 4 * dt;
      p.x += this.pvx * dt; p.z += this.pvz * dt; p.y += this.pvy * dt;
      p.yaw = this.angle + Math.sin((this.time - WINDUP) * 2) * 0.12;
      if (p.y < 0.06) {
        p.y = 0.06; this.pvy = this.pvy < -0.4 ? -this.pvy * 0.18 : 0;
        this.pvx *= Math.exp(-6 * dt); this.pvz *= Math.exp(-6 * dt);
      }
    }
    if (this.impact) {
      this.impact.update(dt);
      this.x = this.impact.x; this.z = this.impact.z;
      this.height = this.impact.y - 0.52;
      return;
    }
    this.vy -= 5.8 * dt;
    this.height += this.vy * dt;
    this.x += this.vx * dt; this.z += this.vz * dt;
    if (this.height <= 0) {
      this.height = 0; this.vy = 0;
      this.vx *= Math.exp(-14 * dt); this.vz *= Math.exp(-14 * dt);
    }
    for (const key of ['x', 'z']) {
      if (Math.abs(this[key]) > 8) { this[key] = Math.sign(this[key]) * 8; this[`v${key}`] *= -0.2; }
    }
    if (this.time > WINDUP && this.collides()) {
      this.hit = true; this.contactAt = this.time;
      this.impact = new ImpactBody({ x: this.x, z: this.z, height: this.height, lean: this.lean }, this.angle, { recover: false });
    }
  }

  collides() {
    const p = this.projectile, dx = this.x - p.x, dz = this.z - p.z;
    const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
    const across = dx * c - dz * s, along = dx * s + dz * c;
    // An oriented sole/strap box against a thorax sphere, not an anatomical collision mesh.
    const qx = Math.max(0, Math.abs(across) - 0.63);
    const qz = Math.max(0, Math.abs(along) - 1.5);
    const qy = Math.max(0, Math.abs(this.height + 0.52 - (p.y + 0.16)) - 0.18);
    return qx * qx + qy * qy + qz * qz <= 0.25 * 0.25;
  }

  frame() {
    return { t: this.time, x: this.x, z: this.z, height: this.height, heading: this.heading,
      lean: this.lean, air: Math.min(1, this.height * 1.8), hit: this.hit,
      pitch: this.impact?.pitch || 0, roll: this.impact?.roll || 0,
      tuck: this.impact?.tuck || 0, projectile: { ...this.projectile } };
  }
}

export class SurvivalSession {
  constructor(rig) {
    this.rig = rig; this.policy = new Policy(rig.D); this.policy.rand = rig.rng;
    this.position = { x: 0, z: 0, heading: 0 };
    this.trials = 0; this.streak = 0; this.best = 0; this.deaths = 0; this.history = [];
  }

  episode({ approach = 1.8, training = true, capture = true } = {}) {
    const rig = this.rig, policy = this.policy;
    const before = { trained: policy.episodes, trials: this.trials, streak: this.streak,
      best: this.best, deaths: this.deaths, history: this.history.slice(-100) };
    const angle = randomThreatAngle(rig.rng);
    const world = new SurvivalWorld({ ...this.position, angle, approach });
    const steps = [], observations = [], frames = [];
    const temp = training ? temperature(policy.episodes) : 1;
    let glance = 0, ticks = 0;
    while (world.time < world.duration - WORLD_STEP / 2) {
      const nextGlance = WINDUP + glance / 7 * approach;
      if (glance < 7 && world.time + 1e-9 >= nextGlance && !world.hit) {
        const signal = rig.glance(angle / (Math.PI / 2), glance / 7);
        let action;
        if (training) action = policy.act(signal.x, temp);
        const probs = policy.probs(signal.x, temp);
        if (!training) action = probs.indexOf(Math.max(...probs));
        steps.push({ x: signal.x, a: action, r: world.act(action), temp });
        if (capture) observations.push({ t: world.time, a: action, p: Array.from(probs),
          lean: world.lean, l: signal.drive.l, r: signal.drive.r, u: signal.urgency,
          gf: signal.gf, snap: rig.snapshot() });
        glance++;
      }
      world.step();
      if (capture && ticks++ % 2 === 0) frames.push(world.frame());
    }
    if (capture) frames.push(world.frame());
    const ok = !world.hit;
    if (training && steps.length) {
      steps.at(-1).r += ok ? 3 : -3;
      policy.learn(steps);
    }
    this.trials++;
    this.streak = ok ? this.streak + 1 : 0;
    this.best = Math.max(this.best, this.streak);
    this.deaths += ok ? 0 : 1;
    this.history.push(ok ? 1 : 0);
    if (ok) {
      this.position = { x: world.x, z: world.z,
        heading: Math.hypot(world.x, world.z) > 4 ? Math.atan2(-world.x, -world.z) : world.heading };
    } else {
      this.position = { x: (rig.rng() - 0.5) * 3, z: (rig.rng() - 0.5) * 3, heading: 0 };
    }
    return { frames, observations, before, duration: world.duration, ok, contactAt: world.contactAt,
      launch: world.launch, origin: world.origin, angle: world.angle, approach,
      trials: this.trials, trained: policy.episodes, streak: this.streak, best: this.best,
      deaths: this.deaths, history: this.history.slice(-100), training };
  }
}
