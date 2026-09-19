import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SurvivalWorld } from '../web/defend/survival.js';
import { PlaySession, sense, packPolicy, unpackPolicy, PROTOCOL } from '../web/play/core.js';
import { makeShot, launch, traceShot, WORLD_STEP, SHOT_SECONDS } from '../web/play/physics.js';
import { PlayStore, SAVE_KEY, validateSave } from '../web/play/storage.js';
import { Policy } from '../web/defend/policy.js';
import { COPY } from '../web/play/copy.js';
import { loadRig, mulberry } from '../tools/rig.mjs';

const artifact = JSON.parse(readFileSync(new URL('../web/play/pretrained.json', import.meta.url)));
const fakeRig = (seed = 1) => ({ D: 49, rng: mulberry(seed), eng: { reset() {} },
  glance: () => ({ x: new Float32Array(49), gf: 0, drive: { l: 0, r: 0 }, urgency: 0 }),
  snapshot: () => ({ i: [], v: [] }) });
const fresh = () => ({ protocol: PROTOCOL, policy: structuredClone(artifact.policy), stats: { throws: 0, hits: 0, dodges: 0, misses: 0 } });
const parameters = { aim: { x: 0, z: 0 }, power: 65, elevation: -12 };
const complete = s => { while (s.phase === 'flight') s.step(); };

test('preview and actual projectile use identical time steps, bounces and obstacle collisions', () => {
  for (const origin of [{ x: 3.8, y: 2.8, z: 5.9 }, { x: 4, y: 1, z: 7 }]) {
    for (const power of [25, 65, 100]) for (const elevation of [-35, -12, 40]) {
      const shot = makeShot(origin, parameters.aim, power, elevation), guide = traceShot(shot);
      const world = new SurvivalWorld({ expanded: true, x: 15, z: -15 }); launch(world, shot);
      for (let i = 0; i < Math.round(SHOT_SECONDS / WORLD_STEP); i++) {
        world.step();
        if (i % 4 === 3) assert.deepEqual(world.projectile, guide.points[(i + 1) / 4]);
      }
    }
  }
  const a = makeShot({ x: 3.8, y: 2.8, z: 5.9 }, parameters.aim, 25, -12);
  const b = makeShot(a.origin, parameters.aim, 100, 40);
  assert.notDeepEqual(traceShot(a).points[10], traceShot(b).points[10]);
  for (const power of [NaN, Infinity, 0, 101, '65']) assert.throws(() => makeShot(a.origin, parameters.aim, power, 0));
  assert.throws(() => makeShot(a.origin, a.origin, 65, 0));
});

test('observations cannot read aim, power, future trajectory or counterfactual result', () => {
  const world = new SurvivalWorld({ expanded: true }), baseline = sense(world, 0.1);
  Object.assign(world, { aim: { x: 100, z: 50 }, power: 99, trajectory: ['future'], control: true, pvx: 999, pvz: -999 });
  assert.deepEqual(sense(world, 0.1), baseline);
  assert.equal(baseline.extra.length, 8); assert.ok(baseline.extra.every(Number.isFinite));
  assert.equal(sense(world, null).extra[3], 0);
});

test('idle movement is continuous, throwing is one-at-a-time, frozen weights never change', () => {
  const s = new PlaySession(fakeRig()); s.load(fresh()); const before = packPolicy(s.policy);
  for (let i = 0; i < 480; i++) s.step();
  assert.ok(Math.hypot(s.world.x, s.world.z) > 0.01); assert.equal(s.stats.throws, 0); assert.equal(s.world.hit, false);
  s.throw(parameters); assert.throws(() => s.throw(parameters), /One slipper/);
  complete(s); assert.equal(s.stats.throws, 1); assert.deepEqual(packPolicy(s.policy), before);
  for (let i = 0; i < 156; i++) s.step(); assert.equal(s.phase, 'aim');
  assert.equal(s.stats.throws, 1); assert.equal(s.world.projectileActive, false);
});

test('immobile control distinguishes misses, hits and movement-based dodges with terminal rewards', () => {
  const hit = new PlaySession(fakeRig()); hit.throw(parameters, { mode: 'still' }); complete(hit);
  assert.equal(hit.control, true); assert.equal(hit.result.kind, 'hit'); assert.equal(hit.result.reward, -3);
  const dodge = new PlaySession(fakeRig()); dodge.world.act(1); dodge.world.act(3);
  dodge.throw(parameters, { mode: 'still' }); complete(dodge);
  // A pre-existing motion can explain a dodge; this score is not a causal policy test.
  assert.equal(dodge.result.kind, 'dodge'); assert.equal(dodge.result.reward, 3);
  const miss = new PlaySession(fakeRig()); miss.throw({ ...parameters, aim: { x: -12, z: 12 }, elevation: 40 }, { mode: 'still' }); complete(miss);
  assert.equal(miss.control, false); assert.equal(miss.result.kind, 'miss'); assert.equal(miss.result.reward, 0);
});

test('optional learning is outcome-only; partial batches and normalization survive backups', () => {
  const s = new PlaySession(fakeRig()); s.load(fresh()); const before = s.policy.episodes;
  s.throw(parameters, { learning: true });
  s.step(); assert.equal(s.policy.episodes, before);
  complete(s); assert.equal(s.policy.episodes, before + 1); assert.equal(s.policy.pending, 1);
  const restored = new PlaySession(fakeRig()); restored.load(JSON.parse(JSON.stringify(s.save())));
  assert.deepEqual(restored.save(), s.save());
  assert.equal(restored.phase, 'aim');
});

test('malformed checkpoints are rejected before mutating state', () => {
  const s = new PlaySession(fakeRig()); s.load(fresh()); const before = s.save();
  for (const mutate of [p => { p.protocol = 'laboratory'; }, p => { p.policy.W[2] = NaN; },
    p => { p.policy.vr[0] = -1; }, p => { p.policy.pending = 8; }, p => { p.policy.base = [Infinity]; },
    p => { p.stats.hits = 1; }, p => { p.policy.W.pop(); }]) {
    const invalid = structuredClone(before); mutate(invalid);
    assert.throws(() => s.load(invalid)); assert.throws(() => validateSave(invalid)); assert.deepEqual(s.save(), before);
  }
  const policy = new Policy(57, 8); unpackPolicy(policy, before.policy); assert.deepEqual(packPolicy(policy), before.policy);
});

test('isolated storage handles roundtrip, conflicts, quota and explicitly approved replacement', async () => {
  const data = new Map([['laboratory', 'do not change'], ['predictions', 'keep']]);
  const storage = { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
  const first = new PlayStore(storage), other = new PlayStore(storage);
  assert.equal(first.load(), null); other.load(); await first.save(fresh());
  await assert.rejects(other.save(fresh()), /Another tab/);
  const restored = new PlayStore(storage); assert.deepEqual(restored.load(), fresh());
  const quota = new PlayStore({ ...storage, setItem() { throw new Error('Quota'); } }); quota.load();
  await assert.rejects(quota.save(fresh()), /Quota/); assert.equal(quota.revision, 1);
  data.set(SAVE_KEY, '{corrupt'); const corrupt = new PlayStore(storage);
  assert.throws(() => corrupt.load()); await assert.rejects(corrupt.save(fresh()));
  await corrupt.save(fresh(), { replace: true }); assert.deepEqual(corrupt.load(), fresh());
  assert.equal(data.get('laboratory'), 'do not change'); assert.equal(data.get('predictions'), 'keep');
});

test('published weights, held-out report and all localized UI copy agree', () => {
  validateSave(fresh()); assert.equal(artifact.policy.episodes, 2400);
  assert.equal(artifact.protocol, PROTOCOL); assert.equal(artifact.policy.W.length, 57 * 8);
  for (const [mode, expected] of [['policy', 37], ['random', 11], ['still', 0]]) {
    const rows = artifact.evaluation.rows.filter(r => r.mode === mode);
    assert.equal(rows.length, 5); assert.equal(rows.reduce((n, r) => n + r.throws, 0), 120);
    assert.equal(rows.reduce((n, r) => n + r.threats, 0), 80);
    assert.equal(rows.reduce((n, r) => n + r.dodges, 0), expected);
  }
  const html = readFileSync(new URL('../web/play/index.html', import.meta.url), 'utf8');
  const keys = [...html.matchAll(/data-copy="([^"]+)"/g)].map(m => m[1]);
  for (const copy of Object.values(COPY)) {
    assert.deepEqual(Object.keys(copy), Object.keys(COPY.pt));
    for (const key of keys) assert.ok(copy[key]?.length, key);
    assert.ok(copy.evaluationText.includes('37')); assert.ok(copy.evaluationText.includes('11'));
  }
});

test('real FlyWire rig yields actual neural snapshots and valid actions in a human-controlled throw', () => {
  const s = new PlaySession(loadRig({ seed: 77 }), { capture: true }); s.load(fresh());
  s.throw(parameters); s.step();
  assert.equal(s.signal.snap.i.length, s.signal.snap.v.length);
  assert.ok(s.signal.snap.i.length > 0); assert.ok(s.signal.snap.i.every(i => i >= 0 && i < 6203));
  assert.ok(s.signal.action >= 0 && s.signal.action < 8);
  complete(s); assert.equal(s.stats.throws, 1); validateSave(s.save());
});
