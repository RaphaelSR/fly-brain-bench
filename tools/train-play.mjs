import { readFileSync } from 'node:fs';
import { loadRig, mulberry } from './rig.mjs';
import { PlaySession, packPolicy, unpackPolicy, PROTOCOL } from '../web/play/core.js';
import { PlayWorld } from '../web/play/world.js';
import { makeShot, traceShot } from '../web/play/physics.js';

const previous = JSON.parse(readFileSync(new URL('./fixtures/play-v1.json', import.meta.url)));
const session = new PlaySession(loadRig({ seed: 81473 })), rng = mulberry(334891);
function task(s, random, threat, moving = false) {
  s.world = new PlayWorld({ x: (random() - 0.5) * 5, z: (random() - 0.5) * 5, heading: random() * Math.PI * 2 });
  if (random() < 0.3) s.world.props[Math.floor(random() * s.world.props.length)].angle = Math.PI / 2;
  s.world.projectileActive = false; s.world.step(); s.prepare();
  if (moving) {
    s.world.height += random() * 0.9;
    s.world.vx = (random() - 0.5) * 2; s.world.vz = (random() - 0.5) * 2; s.world.vy = (random() - 0.5) * 3;
  }
  const angle = random() * Math.PI * 2, range = 5 + random() * 3;
  s.origin = { x: s.world.x + Math.sin(angle) * range, y: 2.5 + random(), z: s.world.z + Math.cos(angle) * range };
  let parameters;
  for (let n = 0; n < 60; n++) {
    const spread = threat ? 0.5 : 6;
    parameters = { aim: { x: s.world.x + (random() - 0.5) * spread, z: s.world.z + (random() - 0.5) * spread }, power: 25 + random() * 75, elevation: -35 + random() * 75 };
    if (traceShot(makeShot(s.origin, parameters.aim, parameters.power, parameters.elevation), s.world).wouldHit === threat) break;
  }
  return parameters;
}
function evaluate(policy, seeds, modes, count) {
  const rows = [];
  for (const seed of seeds) for (const mode of modes) {
    const probe = new PlaySession(loadRig({ seed })), shots = mulberry(seed);
    unpackPolicy(probe.policy, mode === 'previous' ? previous.policy : policy);
    let threats = 0, dodges = 0, hits = 0;
    for (let i = 0; i < count; i++) {
      probe.throw(task(probe, shots, i % 3 !== 0), { mode: mode === 'previous' ? 'policy' : mode === 'hold' ? 'still' : mode, learning: false });
      while (probe.phase === 'flight') probe.step();
      threats += Number(probe.control); dodges += Number(probe.result.kind === 'dodge'); hits += Number(probe.result.kind === 'hit');
    }
    rows.push({ seed, mode, throws: count, threats, dodges, hits });
  }
  return rows;
}
const validationSeeds = [1103, 2207, 3301], testSeeds = [10601, 11717, 12821, 13901, 14009];
const evaluateOnly = process.argv[2] === '--evaluate';
const published = evaluateOnly ? JSON.parse(readFileSync(new URL('../web/play/pretrained.json', import.meta.url))) : null;
const additional = evaluateOnly ? 0 : Number(process.argv[2] || 8000);
if (!Number.isSafeInteger(additional) || additional < 0) throw new Error('Expected a non-negative episode count');
unpackPolicy(session.policy, previous.policy);
let policy = published?.policy || previous.policy;
const score = rows => rows.reduce((sum, row) => sum - row.hits, 0);
let bestScore = evaluateOnly ? 0 : score(evaluate(policy, validationSeeds, ['policy'], 24));
const candidates = [];
for (let i = 0; i < additional; i++) {
  session.throw(task(session, rng, i % 3 !== 0, i % 4 === 0), { learning: true });
  while (session.phase === 'flight') session.step();
  if ((i + 1) % 500 === 0) console.error('Training ' + (i + 1) + '/' + additional);
  if ((i + 1) % 2000 === 0 || i + 1 === additional) {
    session.policy.flush();
    const candidate = packPolicy(session.policy), rows = evaluate(candidate, validationSeeds, ['policy'], 24), result = score(rows);
    candidates.push({ episodes: candidate.episodes, hits: -result, rows });
    console.error('Validation ' + candidate.episodes + ' episodes: ' + (-result) + ' hits / 72; best ' + (-bestScore));
    if (result > bestScore) { policy = candidate; bestScore = result; }
  }
}
const rows = evaluate(policy, testSeeds, ['policy', 'previous', 'random', 'hold'], 48);
const training = published?.training || { seed: 81473, taskSeed: 334891, episodes: policy.episodes, attemptedEpisodes: 2400 + additional,
  warmStart: 'tools/fixtures/play-v1.json', validationSeeds, candidates, selection: 'Fewest hits on validation only; test seeds never used for checkpoint selection',
  algorithm: 'REINFORCE-inspired; success credit truncated just after avoided counterfactual contact, labeled only after outcome; 49 neural + 8 constructed visual/proprioceptive features; frozen FlyWire wiring; moving starts and fallen objects in training' };
console.log('ARTIFACT ' + JSON.stringify({ protocol: PROTOCOL, environment: 'living-courtyard-v2', training,
  evaluation: { rows, limitation: 'Exploratory held-out simulation, one training seed, matched shot seeds and starting scenes. Hold is no action, not a rigidly fixed body. Not biological validation or evidence of connectome necessity.' }, policy }));
