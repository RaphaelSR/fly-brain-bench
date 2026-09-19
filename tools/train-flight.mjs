import { readFileSync } from 'node:fs';
import { loadRig, mulberry } from './rig.mjs';
import { PlaySession, packPolicy, unpackPolicy, sense, PROTOCOL, OBSERVE_TICKS } from '../web/play/core.js';
import { PlayWorld } from '../web/play/world.js';
import { WORLD_STEP, makeShot, traceShot } from '../web/play/physics.js';
import { transferLegacy } from '../web/play/storage.js';

const seed = 90491, taskSeed = 813701, rng = mulberry(taskSeed);
const prior = JSON.parse(readFileSync(new URL('./fixtures/patio-v2.json', import.meta.url)));
const transferred = transferLegacy(prior).policy;
const session = new PlaySession(loadRig({ seed })); unpackPolicy(session.policy, transferred);
const zeroStats = () => ({ throws: 0, hits: 0, dodges: 0, misses: 0 });
function setup(s, random) {
  s.world = new PlayWorld({ x: (random() - 0.5) * 12, z: (random() - 0.5) * 12,
    height: random() < 0.4 ? 0 : random() * 5.8, heading: random() * Math.PI * 2 });
  if (random() < 0.3) s.world.props[Math.floor(random() * 8)].angle = Math.PI / 2;
  s.world.projectileActive = false; s.world.step(); s.prepare(); s.stats = zeroStats();
  // Environment goals use the task RNG, independent of action sampling/neural noise.
  s.world.goal = { x: (random() - 0.5) * 20, y: random() < 0.25 ? 0 : 1.5 + random() * 4, z: (random() - 0.5) * 20 };
  s.navDistance = s.goalDistance();
}
function shot(s, random, threat) {
  setup(s, random);
  const angle = random() * Math.PI * 2, range = 4 + random() * 5;
  s.origin = { x: s.world.x + Math.sin(angle) * range, y: 0.7 + random() * 6.7, z: s.world.z + Math.cos(angle) * range };
  let p;
  for (let i = 0; i < 100; i++) {
    p = { aim: { x: s.world.x + (random() - 0.5) * (threat ? 0.5 : 8), z: s.world.z + (random() - 0.5) * (threat ? 0.5 : 8) }, power: 25 + random() * 75, elevation: -35 + random() * 75 };
    if (traceShot(makeShot(s.origin, p.aim, p.power, p.elevation), s.world).wouldHit === threat) break;
  }
  return p;
}
const complete = s => { while (s.phase === 'flight') s.step(); };
function teacher(w) {
  const dx = w.goal.x - w.x, dz = w.goal.z - w.z, dy = w.goal.y - w.height;
  const angle = Math.atan2(Math.sin(Math.atan2(dx, dz) - w.heading), Math.cos(Math.atan2(dx, dz) - w.heading));
  if (Math.hypot(dx, dz) < 0.7 && Math.abs(dy) < 0.35) return w.goal.y === 0 ? 7 : 0;
  if (Math.abs(angle) > 0.3 && Math.hypot(dx, dz) > 0.7) return angle < 0 ? 5 : 6;
  if (dy > 0.5) return 8;
  if (dy < -0.5) return w.goal.y === 0 && Math.hypot(dx, dz) < 1 ? 7 : 9;
  return Math.hypot(dx, dz) > 0.7 ? 4 : 0;
}
function imitate(s) {
  const policy = s.navigationPolicy;
  const observation = sense(s.world, null), signal = s.rig.glance(0, 0);
  const x = new Float32Array(policy.D); x.set(signal.x); x.set(observation.extra, signal.x.length);
  policy.observe(x); const probs = policy.probs(x), z = policy._z;
  const action = teacher(s.world);
  for (let k = 0; k < policy.K; k++) {
    const g = ((k === action ? 1 : 0) - probs[k]) * 0.035;
    policy.b[k] += g;
    for (let d = 0; d < policy.D; d++) policy.W[k * policy.D + d] += g * z[d];
  }
  s.world.act(action); for (let i = 0; i < OBSERVE_TICKS; i++) s.world.step();
}
function evaluate(bundle, seeds, modes, count, brain = 'escape') {
  const rows = [];
  for (const seed of seeds) for (const mode of modes) {
    const s = new PlaySession(loadRig({ seed, brain }), { brain }), random = mulberry(seed);
    unpackPolicy(s.policy, mode === 'transfer' ? transferred : bundle.policy);
    unpackPolicy(s.navigationPolicy, bundle.navigationPolicy); s.learning = false;
    let threats = 0, hits = 0, dodges = 0, navGain = 0, goals = 0;
    for (let i = 0; i < count; i++) {
      s.throw(shot(s, random, i % 3 !== 0), { mode: mode === 'hold' ? 'still' : mode === 'transfer' ? 'policy' : mode, learning: false }); complete(s);
      threats += +s.control; hits += +(s.result.kind === 'hit'); dodges += +(s.result.kind === 'dodge');
      if (i % 3 === 0 && mode === 'policy') {
        setup(s, random); const gain = s.navGainTotal, g = s.goals;
        for (let t = 0; t < 432; t++) s.step();
        navGain += s.navGainTotal - gain; goals += s.goals - g;
      } else if (i % 3 === 0) {
        // Consume identical environment RNG draws even for non-navigation baselines.
        setup(s, random);
      }
    }
    rows.push({ seed, brain, mode, throws: count, threats, hits, dodges, navGain: Number(navGain.toFixed(3)), goals });
  }
  return rows;
}
const validationSeeds = [17231, 18341, 19447], testSeeds = [26029, 27143, 28247, 29363, 30469];
const only = process.argv[2] === '--evaluate';
const published = only ? JSON.parse(readFileSync(new URL('../web/play/pretrained.json', import.meta.url))) : null;
let bundle = published, candidates = [], best = -Infinity;
const additional = only ? 0 : Number(process.argv[2] || 1800);
if (!Number.isSafeInteger(additional) || additional < 0) throw new Error('Invalid episode count');
if (!only) {
  for (let i = 0; i < 400; i++) {
    setup(session, rng); for (let t = 0; t < 32; t++) imitate(session);
    session.navigationPolicy.episodes++;
    if (i % 100 === 99) console.error('Navigation imitation ' + (i + 1) + '/400');
  }
  for (let i = 0; i < additional; i++) {
    if (i % 3 === 0) {
      setup(session, rng); session.learning = true;
      const before = session.navigationPolicy.episodes;
      while (session.navigationPolicy.episodes === before) session.step();
    } else { session.throw(shot(session, rng, i % 4 !== 0), { learning: true }); complete(session); }
    if (i % 200 === 199) console.error('Reinforcement ' + (i + 1) + '/' + additional);
    if ((i + 1) % 600 === 0 || i + 1 === additional) {
      session.policy.flush(); session.navigationPolicy.flush();
      const candidate = { policy: packPolicy(session.policy), navigationPolicy: packPolicy(session.navigationPolicy) };
      const rows = evaluate(candidate, validationSeeds, ['policy'], 18);
      const score = rows.reduce((n, r) => n - r.hits + 0.2 * r.navGain, 0);
      const episodes = candidate.policy.episodes + candidate.navigationPolicy.episodes;
      candidates.push({ episodes, score, rows });
      console.error('Validation ' + episodes + ': ' + score);
      if (score > best) { best = score; bundle = candidate; }
    }
  }
}
const rows = evaluate(bundle, testSeeds, ['policy', 'transfer', 'random', 'hold'], 24);
const whole = evaluate(bundle, testSeeds, ['policy'], 24, 'whole');
console.log('ARTIFACT ' + JSON.stringify({ protocol: PROTOCOL, environment: 'sustained-flight-v3',
  training: published?.training || { seed, taskSeed, episodes: bundle.policy.episodes + bundle.navigationPolicy.episodes, inheritedEpisodes: prior.policy.episodes,
    imitationEpisodes: 400, reinforcementEpisodes: additional, validationSeeds, candidates,
    selection: 'Validation only: negative hits plus 0.2 times navigation distance gain; held-out seeds not used to select checkpoints',
    algorithm: 'Separate navigation and escape softmax heads. Navigation imitation of a geometric teacher then REINFORCE-inspired flight and navigation rewards; 49 neural + 27 engineered features; 12 actions; neural wiring fixed' },
  evaluation: { rows, whole, limitation: 'Exploratory simulator, one training seed. Transfer is old weights padded into the NEW body, not old gameplay. Whole brain uses transferred escape-trained weights, not whole-brain retraining. Full package prunes connections below 5 synapses. Not complete biological intelligence.' }, policy: bundle.policy, navigationPolicy: bundle.navigationPolicy }));
