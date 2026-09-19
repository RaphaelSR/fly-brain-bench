import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PlayWorld, MAX_ALTITUDE } from '../web/play/world.js';
import { PlaySession, sense, packPolicy, DIMENSIONS, ACTION_COUNT, THROW_ORIGIN } from '../web/play/core.js';
import { selectBrain, aimElevation, aimingFraming } from '../web/play/aiming.js';
import { cameraDistance } from '../web/js/fly.js';
import { makeShot, traceShot } from '../web/play/physics.js';
import { transferLegacy, PlayStore, LEGACY_KEY, validateSave } from '../web/play/storage.js';
import { loadRig } from '../tools/rig.mjs';
const step = (w, seconds) => { for (let i = 0; i < seconds * 120; i++) w.step(); };
test('sustained flight climbs above the old jump, hovers, descends, lands and takes off again', () => {
  const w = new PlayWorld(); w.projectileActive = false;
  for (let i = 0; i < 8; i++) { w.act(8); step(w, 1); }
  assert.ok(w.height > 5); assert.ok(w.height <= MAX_ALTITUDE);
  w.act(0); const height = w.height; step(w, 4); assert.ok(Math.abs(w.height - height) < 0.2);
  for (let i = 0; i < 3; i++) { w.act(9); step(w, 1); }
  assert.ok(w.height < height - 1);
  w.act(7); step(w, 6); assert.equal(w.height, 0); assert.equal(w.flying, false);
  w.act(3); step(w, 2); assert.ok(w.height > 1); assert.equal(w.flying, true);
});
test('flight uses bounded acceleration and real obstacles; high-altitude throws are valid', () => {
  const w = new PlayWorld({ height: 4 }); w.projectileActive = false; w.act(10);
  step(w, 1); assert.ok(w.x < -1); assert.ok(Math.abs(w.vx) <= 3.4);
  for (let i = 0; i < 8; i++) { w.act(8); step(w, 1); }
  assert.ok(w.height <= MAX_ALTITUDE); assert.ok(w.x >= -16);
  assert.throws(() => w.act(12)); assert.throws(() => w.act(NaN));
});
test('observations include present obstacles and observed motion, never future projectile velocity', () => {
  const w = new PlayWorld(), first = sense(w, null); w.projectile.x += 0.3;
  const next = sense(w, first.sample); assert.notDeepEqual(next.extra.slice(13, 16), first.extra.slice(13, 16));
  w.pvx = 10000; w.power = 100; w.aim = { x: 5, z: 6 }; assert.deepEqual(sense(w, first.sample), next);
  w.projectileActive = false; const absent = sense(w, next.sample);
  assert.equal(absent.loom, 0); assert.equal(absent.extra[12], 0); assert.ok(absent.extra.every(Number.isFinite));
});
test('navigation learning is separate from escape weights and runs outside throws', () => {
  const s = new PlaySession(loadRig({ seed: 13 })); const escape = packPolicy(s.policy);
  step(s, 4); assert.equal(s.stats.throws, 0); assert.ok(s.navigationPolicy.episodes > 0);
  assert.deepEqual(packPolicy(s.policy), escape);
  s.learning = false; const before = s.save(); step(s, 4); assert.deepEqual(s.save(), before);
  s.world.height = 6; s.positionThrower(); assert.deepEqual(s.origin, THROW_ORIGIN);
});
test('throw origin is grounded and stationary while the fly explores; camera tilts without rising', () => {
  const s = new PlaySession(loadRig({ seed: 13 }));
  for (const [x, height, z] of [[0, 0, 0], [10, 6, -10], [-12, 3, 14]]) {
    Object.assign(s.world, { x, height, z }); s.positionThrower();
    assert.deepEqual(s.origin, THROW_ORIGIN);
    for (const aspect of [390 / 844, 844 / 390, 1]) {
      const camera = aimingFraming(s.world, s.origin, aspect);
      assert.ok(Math.abs(camera.target.y + Math.sin(camera.pitch) * cameraDistance(camera.distance, aspect, true) - 5.2) < 1e-9);
    }
  }
  s.throw({ aim: { x: 0, z: 0 }, power: 100, elevation: 60 }, { learning: false });
  const launch = { ...s.episode.launch }; step(s, 0.3);
  assert.deepEqual(s.episode.launch, launch); assert.equal(s.episode.grounded, true);
});
test('touch aim can reach a high target from the grounded hand and defaults to the wider brain', () => {
  assert.equal(selectBrain(null), 'whole'); assert.equal(selectBrain('whole'), 'whole');
  assert.equal(selectBrain('escape'), 'escape'); assert.equal(selectBrain('unknown'), 'whole');
  const target = { x: 0, y: 6.52, z: 0 };
  const elevation = aimElevation(THROW_ORIGIN, target, 100);
  assert.ok(elevation > 0 && elevation <= 70);
  const points = traceShot(makeShot(THROW_ORIGIN, target, 100, elevation)).points;
  assert.ok(Math.min(...points.map(p => Math.hypot(p.x - target.x, p.y - target.y, p.z - target.z))) < 0.3);
  assert.ok(Number.isFinite(aimElevation(THROW_ORIGIN, { x: 16, y: 30, z: -16 }, 25)));
});
test('legacy transfer pads weights, clears stale optimizer and never overwrites original or other brain saves', async () => {
  const prior = JSON.parse(readFileSync(new URL('../tools/fixtures/patio-v2.json', import.meta.url)));
  const old = { ...prior, stats: { throws: 10, hits: 3, dodges: 4, misses: 3 } };
  const migrated = transferLegacy(old); validateSave(migrated);
  assert.equal(migrated.policy.W.length, DIMENSIONS * ACTION_COUNT); assert.equal(migrated.policy.pending, 0);
  assert.equal(migrated.stats.throws, 0); assert.equal(migrated.policy.W[DIMENSIONS + 5], old.policy.W[57 + 5]);
  const data = new Map([[LEGACY_KEY, JSON.stringify(old)]]), original = data.get(LEGACY_KEY);
  const storage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  const first = new PlayStore(storage), whole = new PlayStore(storage, 'whole');
  await first.save(migrated); assert.equal(whole.load(), null); assert.equal(data.get(LEGACY_KEY), original);
  await assert.rejects(whole.save(migrated));
});
test('whole-brain rig uses full-package indices and matches feature channel order', () => {
  const small = loadRig(), whole = loadRig({ brain: 'whole' });
  assert.equal(whole.N, 138639); assert.equal(whole.E, 2700513); assert.equal(whole.D, 49);
  assert.deepEqual(whole.featNames, small.featNames);
  for (const ids of whole.featIdx) assert.ok(ids.length > 0 && Array.from(ids).every(i => i >= 0 && i < whole.N));
  const signal = whole.glance(0.8, 0.9); assert.ok(Array.from(signal.x).every(Number.isFinite));
  assert.ok(whole.snapshot().i.some(i => i > 6203));
});
