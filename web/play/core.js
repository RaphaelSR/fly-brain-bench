import { PlayWorld } from './world.js';
import { Policy } from '../defend/policy.js';
import { makeShot, launch, traceShot, WORLD_STEP, SHOT_SECONDS } from './physics.js?v=patio2';

export const PROTOCOL = 'fly-play-hybrid-v1';
export const EXTRA = 8;
export const OBSERVE_TICKS = 18;

// Hand-built visual/proprioceptive measurements, not additional FlyWire neurons.
// Only current and previous observed geometry is used, never aim/force/trace.
export function sense(world, previous) {
  const p = world.projectile, dx = p.x - world.x, dz = p.z - world.z;
  const dy = p.y + 0.16 - (world.height + 0.52), distance = Math.hypot(dx, dy, dz);
  const bearing = Math.atan2(dx, dz) - world.heading;
  const size = 2 * Math.atan2(0.75, Math.max(0.1, distance));
  const expansion = previous == null ? 0 : Math.max(-2, Math.min(2, (size - previous) / (OBSERVE_TICKS * WORLD_STEP)));
  const loom = Math.min(1, size * 0.8 + Math.max(0, expansion) * 0.4);
  return { size, side: Math.max(-1, Math.min(1, Math.atan2(Math.sin(bearing), Math.cos(bearing)) / (Math.PI / 2))), loom,
    extra: [Math.sin(bearing), Math.cos(bearing), size, expansion, dy / Math.max(1, distance),
      world.height - (world.floor || 0), world.vy / 4, world.used ? 1 : 0] };
}

export function packPolicy(policy) {
  return Object.fromEntries(['W', 'b', 'gW', 'gb', 'mu', 'vr', 'base', 'seen', 'scale', 'pending', 'episodes'].map(k =>
    [k, ArrayBuffer.isView(policy[k]) ? Array.from(policy[k]) : policy[k]]));
}
export function unpackPolicy(policy, p) {
  const finite = x => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) < 1e7;
  const vector = (v, n) => Array.isArray(v) && v.length === n && v.every(finite);
  if (!p || !['W', 'b', 'gW', 'gb', 'mu', 'vr'].every(k => vector(p[k], policy[k].length)) ||
      p.vr.some(v => v < 0) || !(p.base === null || Array.isArray(p.base) && p.base.length <= 32 && p.base.every(finite)) ||
      !['seen', 'episodes', 'pending'].every(k => Number.isSafeInteger(p[k]) && p[k] >= 0 && p[k] < 1e9) ||
      p.pending > 7 || !finite(p.scale) || p.scale < 0) throw new Error('Invalid play policy');
  for (const k of ['W', 'b', 'gW', 'gb', 'mu', 'vr']) policy[k].set(p[k]);
  policy.base = p.base === null ? null : Float64Array.from(p.base);
  for (const k of ['seen', 'episodes', 'pending', 'scale']) policy[k] = p[k];
}

export class PlaySession {
  constructor(rig, { capture = false } = {}) {
    this.capture = capture; this.observation = 0;
    this.rig = rig; this.policy = new Policy(rig.D + EXTRA, 8); this.policy.rand = rig.rng;
    this.stats = { throws: 0, hits: 0, dodges: 0, misses: 0 };
    this.learning = true; this.phase = 'aim'; this.clock = 0; this.idleTicks = 0;
    this.world = new PlayWorld(); this.prepare();
  }
  prepare() {
    if (this.world.hit) this.world = new PlayWorld({ props: this.world.props, x: (this.rig.rng() - 0.5) * 3, z: (this.rig.rng() - 0.5) * 3 });
    this.world.projectileActive = false; this.world.projectile.y = -30;
    this.world.used = false; this.world.walk = 0;
    this.home = { x: this.world.x, z: this.world.z };
    this.origin = { x: this.home.x + 3.8, y: 2.8 + this.world.height, z: this.home.z + 5.9 };
    this.phase = 'aim'; this.steps = []; this.previous = null; this.signal = null; this.episode = null;
  }
  throw(parameters, { learning = this.learning, mode = 'policy' } = {}) {
    if (this.phase !== 'aim') throw new Error('One slipper at a time');
    const shot = makeShot(this.origin, parameters.aim, parameters.power, parameters.elevation);
    const control = traceShot(shot, this.world);
    this.control = control.wouldHit; this.controlAt = control.contactAt;
    this.training = learning; this.mode = mode; this.result = null;
    this.rig.eng.reset(); this.previous = null; this.steps = []; this.shotTicks = 0;
    launch(this.world, shot); this.phase = 'flight';
    this.episode = { launch: { ...shot.origin }, angle: shot.angle, approach: 1.8, contactAt: null, frames: [] };
    return shot;
  }
  observe() {
    const observation = sense(this.world, this.previous); this.previous = observation.size;
    const signal = this.rig.glance(observation.side, observation.loom);
    const x = new Float32Array(this.policy.D); x.set(signal.x); x.set(observation.extra, signal.x.length);
    const temp = Math.max(0.6, 1.4 - this.policy.episodes * 0.0005);
    const probabilities = this.policy.probs(x);
    const action = this.mode === 'still' ? 0 : this.mode === 'random' ? Math.floor(this.rig.rng() * 8) :
      this.training ? this.policy.act(x, temp) : probabilities.indexOf(Math.max(...probabilities));
    const cost = this.world.act(action);
    this.steps.push({ x, a: action, r: cost, temp, t: this.world.time });
    this.signal = { id: ++this.observation, gf: signal.gf, left: signal.drive.l, right: signal.drive.r, action, urgency: signal.urgency };
    if (this.capture) this.signal.snap = this.rig.snapshot();
  }
  step() {
    this.clock += WORLD_STEP;
    if (this.phase === 'aim') {
      if (this.idleTicks++ % 120 === 0) {
        const w = this.world, dx = this.home.x - w.x, dz = this.home.z - w.z;
        if (Math.hypot(dx, dz) > 2.5) w.heading = Math.atan2(dx, dz);
        else w.heading += (this.rig.rng() - 0.5) * 1.4;
        w.act(4);
        if (this.idleTicks % 600 === 1 && w.height <= (w.floor || 0) + 0.01) { w.used = false; w.act(3); }
      }
      this.world.step(); return;
    }
    if (this.phase === 'result') { this.world.step(); this.cooldown--; if (this.cooldown <= 0) this.prepare(); return; }
    if (this.shotTicks % OBSERVE_TICKS === 0 && !this.world.hit) this.observe();
    this.world.step(); this.shotTicks++;
    if (this.world.hit && this.episode.contactAt == null) {
      this.episode.contactAt = this.world.contactAt; this.episode.frames = [this.world.frame()];
    }
    if (this.shotTicks >= Math.round(SHOT_SECONDS / WORLD_STEP)) this.finish();
  }
  finish() {
    const hit = this.world.hit, kind = hit ? 'hit' : this.control ? 'dodge' : 'miss';
    const reward = hit ? -3 : this.control ? 3 : 0;
    // Assign successful-escape credit near the avoided contact, not seconds later.
    // The counterfactual is a training label after the outcome, never a policy input.
    const credit = !hit && this.controlAt != null ? this.steps.filter(s => s.t <= this.controlAt + OBSERVE_TICKS * WORLD_STEP) : this.steps;
    if (this.training && credit.length >= 2) { credit.at(-1).r += reward; this.policy.learn(credit); }
    this.stats.throws++; this.stats[kind === 'hit' ? 'hits' : kind === 'dodge' ? 'dodges' : 'misses']++;
    this.result = { kind, reward, control: this.control, learned: this.training && credit.length >= 2 };
    this.phase = 'result'; this.cooldown = Math.round(1.3 / WORLD_STEP);
  }
  state() {
    return { phase: this.phase, frame: this.world.frame(), origin: this.origin, home: this.home,
      signal: this.signal, result: this.result, stats: { ...this.stats }, trained: this.policy.episodes,
      episode: this.episode, clock: this.clock };
  }
  save() { return { protocol: PROTOCOL, policy: packPolicy(this.policy), stats: { ...this.stats } }; }
  load(saved) {
    const s = saved?.stats;
    if (saved?.protocol !== PROTOCOL || !s || !['throws', 'hits', 'dodges', 'misses'].every(k => Number.isSafeInteger(s[k]) && s[k] >= 0 && s[k] < 1e9) ||
        s.hits + s.dodges + s.misses !== s.throws) throw new Error('Invalid play save');
    unpackPolicy(this.policy, saved.policy); this.stats = { ...s };
  }
}
