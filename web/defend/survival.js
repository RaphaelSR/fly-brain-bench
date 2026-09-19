import { Policy, temperature, randomThreatAngle } from './policy.js';
import { ImpactBody } from './impact.js';
import { ARENA_LIMIT, SOLIDS } from './world-layout.js';

export const ARENA_ACTIONS = ['hold', 'lean left', 'lean right', 'take off', 'forward', 'turn left', 'turn right', 'land'];

export const WORLD_STEP = 1 / 120;
export const WINDUP = 0.55;

export class SurvivalWorld {
  constructor({ x = 0, z = 0, heading = 0, height = 0, angle = 1, approach = 1.8, expanded = false, roam = 6 } = {}) {
    this.x = x; this.z = z; this.height = 0; this.heading = heading;
    this.vx = 0; this.vz = 0; this.vy = 0; this.lean = 0; this.used = false;
    this.expanded = expanded; this.height = height; this.walk = 0;
    this.angle = angle + heading; this.approach = approach;
    this.duration = WINDUP + approach + (expanded ? roam : 2.7);
    this.time = 0; this.hit = false; this.contactAt = null; this.impact = null;
    this.origin = { x, z };
    this.projectile = { x: x + Math.sin(this.angle) * 7, y: 2.8, z: z + Math.cos(this.angle) * 7, yaw: this.angle };
    this.launch = { ...this.projectile };
    this.pvx = -Math.sin(this.angle) * 7 / approach;
    this.pvz = -Math.cos(this.angle) * 7 / approach;
    this.pvy = (height + 0.22 - 2.8 + 2 * approach * approach) / approach;
  }

  act(action) {
    if (this.hit) return -0.1;
    if (this.expanded) {
      if (action === 0) this.walk = 0;
      if (action === 4) {
        this.walk = 1;
        this.vx = Math.sin(this.heading) * (this.height > 0.05 ? 2.4 : 0.8);
        this.vz = Math.cos(this.heading) * (this.height > 0.05 ? 2.4 : 0.8);
      }
      if (action === 5 || action === 6) {
        this.heading += (action === 5 ? -1 : 1) * 0.55;
        this.heading = Math.atan2(Math.sin(this.heading), Math.cos(this.heading));
        const speed = Math.hypot(this.vx, this.vz);
        this.vx = Math.sin(this.heading) * speed; this.vz = Math.cos(this.heading) * speed;
      }
      if (action === 7) { this.vy = Math.min(this.vy, -1.5); this.walk = 0; }
    }
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
      if (this.expanded) for (const solid of SOLIDS) {
        const dx = p.x - solid.x, dz = p.z - solid.z, distance = Math.hypot(dx, dz);
        if (p.y < solid.height && distance < solid.radius + 0.7) {
          const nx = distance > 1e-8 ? dx / distance : 1, nz = distance > 1e-8 ? dz / distance : 0;
          p.x = solid.x + nx * (solid.radius + 0.7); p.z = solid.z + nz * (solid.radius + 0.7);
          this.pvx = 0; this.pvz = 0;
        }
      }
    }
    if (this.impact) {
      this.impact.update(dt);
      this.x = this.impact.x; this.z = this.impact.z;
      this.height = this.impact.y - 0.52;
      return;
    }
    const oldHeight = this.height;
    this.vy -= 5.8 * dt;
    this.height += this.vy * dt;
    this.x += this.vx * dt; this.z += this.vz * dt;
    let floor = 0;
    if (this.expanded) for (const solid of SOLIDS) {
      const dx = this.x - solid.x, dz = this.z - solid.z, d = Math.hypot(dx, dz);
      if (d < solid.radius + 0.25) {
        if (oldHeight >= solid.height - 0.02 && this.vy <= 0) floor = Math.max(floor, solid.height);
        else if (this.height < solid.height) {
          const nx = d > 1e-8 ? dx / d : 1, nz = d > 1e-8 ? dz / d : 0;
          this.x = solid.x + nx * (solid.radius + 0.25); this.z = solid.z + nz * (solid.radius + 0.25);
          this.vx = 0; this.vz = 0;
        }
      }
    }
    if (this.height <= floor) {
      this.height = floor; this.vy = 0;
      this.vx *= Math.exp(-14 * dt); this.vz *= Math.exp(-14 * dt);
      if (this.expanded && this.walk) {
        this.vx = Math.sin(this.heading) * 0.8; this.vz = Math.cos(this.heading) * 0.8;
      }
    }
    this.floor = floor;
    const limit = this.expanded ? ARENA_LIMIT : 8;
    for (const key of ['x', 'z']) {
      if (Math.abs(this[key]) > limit) { this[key] = Math.sign(this[key]) * limit; this[`v${key}`] *= -0.2; }
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
      lean: this.lean, air: Math.max(0, Math.min(1, (this.height - (this.floor || 0)) * 1.8)), speed: Math.hypot(this.vx, this.vz), hit: this.hit,
      pitch: this.impact?.pitch || 0, roll: this.impact?.roll || 0,
      tuck: this.impact?.tuck || 0, projectile: { ...this.projectile } };
  }
}

export class SurvivalSession {
  constructor(rig, { expanded = false } = {}) {
    this.expanded = expanded;
    this.rig = rig; this.policy = new Policy(rig.D, expanded ? ARENA_ACTIONS.length : 4); this.policy.rand = rig.rng;
    this.position = { x: 0, z: 0, heading: 0 };
    this.trials = 0; this.streak = 0; this.best = 0; this.deaths = 0; this.history = [];
    this.lifeSeconds = 0; this.bestLife = 0;
  }

  episode({ approach = 1.8, training = true, capture = true, roam = 6 } = {}) {
    const rig = this.rig, policy = this.policy;
    if (this.expanded) rig.eng.reset();
    const before = { trained: policy.episodes, trials: this.trials, streak: this.streak,
      best: this.best, deaths: this.deaths, history: this.history.slice(-100), lifeSeconds: this.lifeSeconds, bestLife: this.bestLife };
    const angle = randomThreatAngle(rig.rng);
    const world = new SurvivalWorld({ ...this.position, angle, approach, expanded: this.expanded, roam });
    const steps = [], observations = [], frames = [];
    const temp = training ? temperature(policy.episodes) : 1;
    let glance = 0, ticks = 0;
    while (world.time < world.duration - WORLD_STEP / 2) {
      const nextGlance = glance < 7 ? WINDUP + glance / 7 * approach : WINDUP + approach + (glance - 6) * roam / 5;
      if (glance < (this.expanded ? 11 : 7) && world.time + 1e-9 >= nextGlance && !world.hit) {
        const dx = world.projectile.x - world.x, dz = world.projectile.z - world.z;
        const bearing = Math.atan2(dx, dz) - world.heading;
        const side = Math.atan2(Math.sin(bearing), Math.cos(bearing)) / (Math.PI / 2);
        const loom = Math.max(0, Math.min(1, 1 - Math.hypot(dx, dz) / 7));
        const signal = rig.glance(this.expanded ? Math.max(-1, Math.min(1, side)) : angle / (Math.PI / 2), this.expanded ? loom : glance / 7);
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
    this.history = this.history.slice(-100);
    const lived = this.lifeSeconds + (world.contactAt ?? world.duration);
    this.bestLife = Math.max(this.bestLife, lived);
    this.lifeSeconds = ok ? lived : 0;
    if (ok) {
      this.position = { x: world.x, z: world.z, height: Math.max(0, world.height),
        heading: Math.hypot(world.x, world.z) > 4 ? Math.atan2(-world.x, -world.z) : world.heading };
    } else {
      this.position = { x: (rig.rng() - 0.5) * 3, z: (rig.rng() - 0.5) * 3, heading: 0 };
    }
    return { frames, observations, before, duration: world.duration, ok, contactAt: world.contactAt,
      launch: world.launch, origin: world.origin, angle: world.angle, approach,
      trials: this.trials, trained: policy.episodes, streak: this.streak, best: this.best,
      deaths: this.deaths, history: this.history.slice(-100), lifeSeconds: this.lifeSeconds, bestLife: this.bestLife, training };
  }
}
