import { PlayWorld, MAX_ALTITUDE, FLIGHT_ACTIONS } from './world.js?v=flight3';
import { Policy } from '../defend/policy.js';
import { makeShot, launch, traceShot, WORLD_STEP, SHOT_SECONDS } from './physics.js?v=flight3';

export const PROTOCOL = 'fly-play-flight-v2';
export const EXTRA = 27;
export const DIMENSIONS = 49 + EXTRA;
export const ACTION_COUNT = FLIGHT_ACTIONS.length;
export const OBSERVE_TICKS = 18;

// Hand-built visual/proprioceptive measurements, not additional FlyWire neurons.
// Only current and previous observed geometry is used, never aim/force/trace.
export function sense(world, previous) {
  const present = world.projectileActive !== false;
  const p = world.projectile, dx = present ? p.x - world.x : 0, dz = present ? p.z - world.z : 0;
  const dy = present ? p.y + 0.16 - (world.height + 0.52) : 0, distance = Math.hypot(dx, dy, dz);
  const bearing = Math.atan2(dx, dz) - world.heading;
  const size = present ? 2 * Math.atan2(0.75, Math.max(0.1, distance)) : 0;
  const previousSize = typeof previous === 'number' ? previous : previous?.size;
  const expansion = previousSize == null || !present ? 0 : Math.max(-2, Math.min(2, (size - previousSize) / (OBSERVE_TICKS * WORLD_STEP)));
  const loom = Math.min(1, size * 0.8 + Math.max(0, expansion) * 0.4);
  const s = Math.sin(world.heading), c = Math.cos(world.heading), local = (x, z) => [x * c - z * s, x * s + z * c];
  const velocity = local(world.vx, world.vz).map(v => v / 3.4);
  const motion = ['dx', 'dy', 'dz'].map((key, i) => present && previous?.present ? Math.max(-1, Math.min(1, ([dx, dy, dz][i] - previous[key]) / (OBSERVE_TICKS * WORLD_STEP * 18))) : 0);
  const obstacles = [0, Math.PI / 2, Math.PI, -Math.PI / 2].map(a => {
    const sx = Math.sin(world.heading + a), sz = Math.cos(world.heading + a); let nearest = 6;
    for (const solid of world.solids) {
      if (solid.height < world.height + 0.2) continue;
      const x = solid.x - world.x, z = solid.z - world.z, along = x * sx + z * sz, across = x * sz - z * sx;
      const radius = solid.radius + 0.3;
      if (along >= 0 && Math.abs(across) < radius) nearest = Math.min(nearest, Math.max(0, along - Math.sqrt(radius * radius - across * across)));
    }
    return nearest / 6;
  });
  const goal = world.goal || { x: world.x, y: world.height, z: world.z }, direction = local(goal.x - world.x, goal.z - world.z);
  return { size, sample: { size, dx, dy, dz, present }, side: Math.max(-1, Math.min(1, Math.atan2(Math.sin(bearing), Math.cos(bearing)) / (Math.PI / 2))), loom,
    extra: [Math.sin(bearing), Math.cos(bearing), size, expansion, dy / Math.max(1, distance),
      world.height - (world.floor || 0), world.vy / 4, world.used ? 1 : 0,
      ...velocity, world.height / MAX_ALTITUDE, Number(!!world.flying), Number(present), ...motion, ...obstacles,
      (16 - world.x) / 32, (16 + world.x) / 32, (16 - world.z) / 32, (16 + world.z) / 32,
      direction[0] / 24, (goal.y - world.height) / MAX_ALTITUDE, direction[1] / 24] };
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
  constructor(rig, { capture = false, brain = 'escape' } = {}) {
    this.capture = capture; this.observation = 0;
    this.brain = brain; this.rig = rig; this.policy = new Policy(rig.D + EXTRA, ACTION_COUNT); this.policy.rand = rig.rng;
    this.navigationPolicy = new Policy(rig.D + EXTRA, ACTION_COUNT); this.navigationPolicy.rand = rig.rng;
    this.stats = { throws: 0, hits: 0, dodges: 0, misses: 0 };
    this.learning = true; this.phase = 'aim'; this.clock = 0; this.idleTicks = 0;
    this.world = new PlayWorld(); this.navigation = []; this.navTicks = 0; this.goals = 0; this.navGainTotal = 0; this.prepare();
  }
  nextGoal() {
    let goal;
    do { goal = { x: (this.rig.rng() - 0.5) * 22, y: this.rig.rng() < 0.25 ? 0 : 1.5 + this.rig.rng() * 4, z: (this.rig.rng() - 0.5) * 22 }; }
    while (this.world.solids.some(p => Math.hypot(p.x - goal.x, p.z - goal.z) < p.radius + 0.8));
    this.world.goal = goal; this.goalAge = 0; this.navDistance = this.goalDistance();
  }
  goalDistance() { const w = this.world, g = w.goal; return Math.hypot(w.x - g.x, w.height - g.y, w.z - g.z); }
  positionThrower() {
    this.home = { x: this.world.x, z: this.world.z };
    this.origin = { x: this.home.x + 3.8, y: Math.min(7.4, 2.8 + this.world.height), z: this.home.z + 5.9 };
  }
  prepare() {
    if (this.world.hit) this.world = new PlayWorld({ props: this.world.props, x: (this.rig.rng() - 0.5) * 3, z: (this.rig.rng() - 0.5) * 3 });
    this.world.projectileActive = false; this.world.projectile.y = -30;
    this.world.used = false; this.world.walk = 0;
    this.positionThrower();
    this.navigation = []; this.navTicks = 0; this.nextGoal();
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
  observe(training = this.training, record = true) {
    const observation = sense(this.world, this.previous); this.previous = observation.sample;
    const signal = this.rig.glance(observation.side, observation.loom);
    const policy = record ? this.policy : this.navigationPolicy;
    const x = new Float32Array(policy.D); x.set(signal.x); x.set(observation.extra, signal.x.length);
    const temp = Math.max(0.6, 1.4 - policy.episodes * 0.0005);
    const probabilities = policy.probs(x);
    const action = this.mode === 'still' ? 0 : this.mode === 'random' ? Math.floor(this.rig.rng() * ACTION_COUNT) :
      training ? policy.act(x, temp) : probabilities.indexOf(Math.max(...probabilities));
    const cost = this.world.act(action);
    const step = { x, a: action, r: cost, temp, t: this.world.time };
    if (record) this.steps.push(step);
    this.signal = { id: ++this.observation, gf: signal.gf, left: signal.drive.l, right: signal.drive.r, action, urgency: signal.urgency };
    if (this.capture) this.signal.snap = this.rig.snapshot();
    return step;
  }
  step() {
    this.clock += WORLD_STEP;
    if (this.phase === 'aim') {
      if (this.navTicks++ % OBSERVE_TICKS === 0) {
        this.mode = 'policy';
        const distance = this.goalDistance(), reached = distance < 0.65;
        this.navGainTotal += this.navDistance - distance;
        const progress = Math.max(-0.2, Math.min(0.2, (this.navDistance - distance) * 0.5));
        if (this.navigation.length) this.navigation.at(-1).r += progress + (reached ? 2 : 0);
        this.navDistance = distance;
        if (this.navigation.length >= 24 || reached) {
          if (this.learning && this.navigation.length >= 2) this.navigationPolicy.learn(this.navigation);
          this.navigation = [];
        }
        if (reached || this.goalAge++ > 200) { if (reached) this.goals++; this.nextGoal(); }
        this.navigation.push(this.observe(this.learning, false));
      }
      this.world.step(); this.positionThrower(); return;
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
      signal: this.signal, result: this.result, stats: { ...this.stats }, trained: this.policy.episodes + this.navigationPolicy.episodes,
      escapeTrained: this.policy.episodes, navigationTrained: this.navigationPolicy.episodes,
      episode: this.episode, clock: this.clock, brain: this.brain, goal: this.world.goal, goals: this.goals };
  }
  save() { return { protocol: PROTOCOL, brain: this.brain, policy: packPolicy(this.policy), navigationPolicy: packPolicy(this.navigationPolicy), stats: { ...this.stats } }; }
  load(saved) {
    const s = saved?.stats;
    if (saved?.protocol !== PROTOCOL || saved.brain !== this.brain || !s || !['throws', 'hits', 'dodges', 'misses'].every(k => Number.isSafeInteger(s[k]) && s[k] >= 0 && s[k] < 1e9) ||
        s.hits + s.dodges + s.misses !== s.throws) throw new Error('Invalid play save');
    const policy = new Policy(DIMENSIONS, ACTION_COUNT), navigation = new Policy(DIMENSIONS, ACTION_COUNT);
    unpackPolicy(policy, saved.policy); unpackPolicy(navigation, saved.navigationPolicy);
    unpackPolicy(this.policy, saved.policy); unpackPolicy(this.navigationPolicy, saved.navigationPolicy); this.stats = { ...s };
  }
}
