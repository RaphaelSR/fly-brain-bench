import { loadRig } from './rig.mjs';
const rows = [];
for (const brain of ['escape', 'whole', 'complete']) {
  const start = performance.now(), rig = loadRig({ brain, seed: 4041 });
  const loadMs = performance.now() - start;
  for (let i = 0; i < 5; i++) rig.glance(i % 2 ? -0.8 : 0.8, 0.8);
  const times = [];
  for (let i = 0; i < 40; i++) {
    const t = performance.now(), signal = rig.glance(i % 2 ? -0.8 : 0.8, 0.2 + (i % 5) * 0.2);
    if (!Array.from(signal.x).every(Number.isFinite)) throw new Error('Invalid neural response');
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  rows.push({ brain, neurons: rig.N, connectedPairs: rig.E, features: rig.D, threshold: rig.meta.threshold,
    loadMs: +loadMs.toFixed(2), medianMs: +times[20].toFixed(2), p95Ms: +times[37].toFixed(2),
    graphArrayBytes: (rig.N + 1 + 2 * rig.E) * 4, activeSnapshotCells: rig.snapshot().i.length });
}
console.log(JSON.stringify({ runtime: process.version, platform: process.platform, architecture: process.arch,
  dtBiologicalMs: 0.5, neuralWindowBiologicalMs: 180, samples: 40, warmup: 5, rows,
  limitation: 'Local Node CPU test, not mobile/browser FPS or total application memory. Complete preserves source pairs/counts; whole is the historical threshold-5 package. Neither is complete biology. Latency says nothing about intelligence.' }));
