import { loadRig } from './rig.mjs';
import { SurvivalSession } from '../web/defend/survival.js';
import { checkpoint, restoreCheckpoint, clearStatistics, PROTOCOL } from '../web/defend/checkpoint.js';

const trainingSeed = 20260919, trainingEpisodes = 800;
const session = new SurvivalSession(loadRig({ seed: trainingSeed }), { expanded: true });
for (let i = 0; i < trainingEpisodes; i++) {
  session.episode({ capture: false, approach: [1.2, 1.8, 2.4][i % 3], roam: [2.7, 6, 12][Math.floor(i / 3) % 3] });
}
session.policy.flush();
clearStatistics(session); session.position = { x: 0, z: 0, height: 0, heading: 0 };
const trained = checkpoint(session);
const results = [];
for (const approach of [1.2, 1.8, 2.4]) for (const roam of [2.7, 6, 12]) {
  let escapes = 0, baselineEscapes = 0, trials = 0;
  for (const seed of [101, 211, 307, 401, 503]) {
    for (const pretrained of [false, true]) {
      const probe = new SurvivalSession(loadRig({ seed }), { expanded: true });
      if (pretrained) { restoreCheckpoint(probe, trained); probe.rig.rng.setState(seed); }
      for (let i = 0; i < 4; i++) {
        const result = probe.episode({ approach, roam, training: false, capture: false });
        if (pretrained) { trials++; escapes += Number(result.ok); } else baselineEscapes += Number(result.ok);
      }
    }
  }
  results.push({ approach, roam, trials, escapes, survival: escapes / trials, baselineEscapes, baselineSurvival: baselineEscapes / trials });
}
console.log(JSON.stringify({ protocol: PROTOCOL, training: { seed: trainingSeed, episodes: trainingEpisodes,
  algorithm: 'REINFORCE, batch 8, 8 motor actions, 49 neural features; fixed FlyWire v783 6203-cell wiring',
  command: 'node --experimental-default-type=module tools/train-arena.mjs' },
  evaluation: { seeds: [101, 211, 307, 401, 503], throwsPerSeedAndSetting: 4, frozen: true, results,
    limitation: 'Small held-out simulation evaluation, not biological validation. Successive throws share position within each seed. The blank-policy baseline uses greedy action 0 on ties.' },
  checkpoint: trained }));
