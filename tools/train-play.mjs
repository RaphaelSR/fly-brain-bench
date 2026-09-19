import { loadRig, mulberry } from './rig.mjs';
import { PlaySession, packPolicy, unpackPolicy, PROTOCOL } from '../web/play/core.js';
import { SurvivalWorld } from '../web/defend/survival.js';
import { makeShot, traceShot } from '../web/play/physics.js';

const session = new PlaySession(loadRig({ seed: 81473 })), rng = mulberry(124778);
function task(s, random, threat) {
  s.world = new SurvivalWorld({ expanded: true, x: (random() - 0.5) * 5, z: (random() - 0.5) * 5, heading: random() * Math.PI * 2 });
  s.prepare();
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
const evaluateOnly = process.argv[2] === '--evaluate';
const published = evaluateOnly ? JSON.parse(readFileSync(new URL('../web/play/pretrained.json', import.meta.url))) : null;
const episodes = evaluateOnly ? published.training.episodes : Number(process.argv[2] || 2400);
if (!Number.isSafeInteger(episodes) || episodes < 1) throw new Error('Expected a positive episode count');
for (let i = 0; !evaluateOnly && i < episodes; i++) {
  const parameters = task(session, rng, i % 3 !== 0);
  session.throw(parameters, { learning: true });
  while (session.phase === 'flight') session.step();
  if ((i + 1) % 200 === 0) console.error(`Training ${i + 1}/${episodes}`);
}
session.policy.flush();
const policy = published?.policy || packPolicy(session.policy), rows = [];
for (const seed of [883, 1549, 2671, 3917, 4513]) {
  for (const mode of ['policy', 'random', 'still']) {
    const probe = new PlaySession(loadRig({ seed })), shots = mulberry(seed);
    unpackPolicy(probe.policy, policy);
    let threats = 0, dodges = 0, hits = 0;
    for (let i = 0; i < 24; i++) {
      probe.throw(task(probe, shots, i % 3 !== 0), { mode, learning: false });
      while (probe.phase === 'flight') probe.step();
      threats += Number(probe.control); dodges += Number(probe.result.kind === 'dodge'); hits += Number(probe.result.kind === 'hit');
    }
    rows.push({ seed, mode, throws: 24, threats, dodges, hits });
  }
}
console.log('ARTIFACT ' + JSON.stringify({ protocol: PROTOCOL, training: { seed: 81473, taskSeed: 124778, episodes, algorithm: 'REINFORCE-inspired, 49 neural + 8 constructed visual/proprioceptive features; frozen FlyWire wiring' },
  evaluation: { rows, limitation: 'Exploratory held-out simulation, one training seed, shared shot seeds. Not a biological validation or evidence that the connectome is necessary. Random/still controls share shots and starting poses.' },
  policy }));
import { readFileSync } from 'node:fs';
