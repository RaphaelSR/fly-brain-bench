import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRig } from '../tools/rig.mjs';
import { SurvivalSession, SurvivalWorld } from '../web/defend/survival.js';
import { checkpoint, restoreCheckpoint, validateCheckpoint, clearStatistics } from '../web/defend/checkpoint.js';
import { ArenaStore, emptySave, SAVE_KEY } from '../web/defend/storage.js';
import { newGame, placePrediction, settlePrediction } from '../web/defend/game.js';
import { Splat } from '../web/defend/splat.js';
import { Group } from '../web/vendor/three/three.module.min.js';
import { PERCHES } from '../web/defend/world-layout.js';

const session = seed => new SurvivalSession(loadRig({ seed }), { expanded: true });
const clone = v => JSON.parse(JSON.stringify(v));

test('checkpoint retains full precision, pending gradients and deterministic continuation after reload', () => {
  const original = session(41);
  for (let i = 0; i < 3; i++) original.episode({ capture: false });
  const state = clone(checkpoint(original));
  assert.equal(state.policy.pending, 3);
  const resumed = session(900);
  restoreCheckpoint(resumed, state);
  assert.deepEqual(checkpoint(resumed), state);
  const a = original.episode(), b = resumed.episode();
  assert.deepEqual(b, a);
  assert.deepEqual(checkpoint(resumed), checkpoint(original));
});

test('incompatible and malformed backups fail before mutating learned state', () => {
  const s = session(15), initial = checkpoint(s);
  for (const mutate of [v => { v.protocol = 'old'; }, v => { v.policy.W[0] = NaN; },
    v => { v.policy.vr[0] = -1; }, v => { v.policy.pending = 8; }, v => { v.policy.b.pop(); },
    v => { v.stats.deaths = 100; }, v => { v.position.x = 200; }, v => { v.history = [2]; }]) {
    const invalid = clone(initial); mutate(invalid);
    assert.throws(() => restoreCheckpoint(s, invalid));
    assert.deepEqual(checkpoint(s), initial);
  }
});

test('clearing only statistics preserves all learning and reset creates blank weights', () => {
  const s = session(21); s.episode({ capture: false });
  const policy = checkpoint(s).policy;
  clearStatistics(s);
  assert.deepEqual(checkpoint(s).policy, policy);
  assert.deepEqual(s.history, []); assert.equal(s.deaths, 0); assert.equal(s.trials, 0);
  assert.ok(session(21).policy.W.every(v => v === 0));
});

test('storage roundtrip, quota failure and concurrent tabs never silently overwrite a newer save', async () => {
  const items = new Map();
  const storage = { getItem: k => items.get(k) || null, setItem: (k, v) => items.set(k, v) };
  const a = new ArenaStore(storage), b = new ArenaStore(storage);
  a.load(); b.load();
  const saved = await a.save({ ...emptySave(), checkpoint: checkpoint(session(1)) });
  assert.deepEqual(new ArenaStore(storage).load(), saved);
  await assert.rejects(b.save(emptySave()), /Another tab/);
  const prior = items.get(SAVE_KEY);
  storage.setItem = () => { throw new Error('QuotaExceededError'); };
  await assert.rejects(a.save(saved), /Quota/);
  assert.equal(items.get(SAVE_KEY), prior);
  assert.equal(a.revision, 1);
});

test('prediction stakes lock before calculation and settle exactly once, including restored pending rounds', async () => {
  const cp = checkpoint(session(8));
  const pending = placePrediction(newGame(), { id: 'one', seed: 42, stake: 100, escape: true, checkpoint: cp, approach: 1.8, roam: 6 });
  assert.equal(pending.balance, 900);
  assert.throws(() => placePrediction(pending, { stake: 100, escape: false }));
  const restored = clone(pending);
  const won = settlePrediction(restored, 'one', true);
  assert.equal(won.balance, 1100); assert.equal(won.rounds, 1);
  assert.deepEqual(settlePrediction(won, 'one', true), won);
  assert.equal(settlePrediction(restored, 'one', false).balance, 900);
  assert.deepEqual(settlePrediction(restored, 'another', true), restored);
  for (const stake of [-10, 0, 101, 20.5, NaN]) assert.throws(() => placePrediction(newGame(), { stake, escape: true }));
});

test('frozen game evaluation cannot change laboratory learning or statistics', () => {
  const lab = session(8); lab.episode({ capture: false });
  const before = checkpoint(lab), game = session(88);
  restoreCheckpoint(game, before); game.rig.rng.setState(99);
  const policy = checkpoint(game).policy;
  game.episode({ training: false, capture: false });
  assert.deepEqual(checkpoint(game).policy, policy);
  assert.deepEqual(checkpoint(lab), before);
});

test('expanded world walks beyond old bounds, turns, steers, lands on real perches and respects boundaries', () => {
  const w = new SurvivalWorld({ expanded: true, x: 10, z: 10 });
  w.act(4);
  for (let i = 0; i < 60; i++) w.step();
  assert.ok(w.z > 10); assert.ok(w.x > 8);
  w.act(5); assert.ok(w.heading < 0);
  w.act(3); w.act(4); assert.ok(w.vx < 0); w.act(7); assert.ok(w.vy < 0);
  const p = PERCHES[0], landing = new SurvivalWorld({ expanded: true, x: p.x, z: p.z, height: 1.8 });
  for (let i = 0; i < 90; i++) landing.step();
  assert.equal(landing.height, p.height); assert.equal(landing.frame().air, 0);
  const edge = new SurvivalWorld({ expanded: true, x: 16, z: 16 }); edge.vx = 20; edge.vz = 20; edge.step();
  assert.equal(edge.x, 16); assert.equal(edge.z, 16);
});

test('green splat is contact-only, deterministic on pause/replay, bounded and does not mutate physics', () => {
  const s = new Splat(new Group());
  const frame = { hit: true, t: 3, height: -0.22, x: 0, z: 0 };
  const episode = { contactAt: 1, angle: 1, frames: [{ ...frame, t: 1, height: 0 }] };
  const original = JSON.stringify(episode);
  assert.ok(s.update(frame, episode, true) > 0.99);
  const transforms = s.stains.instanceMatrix.array.slice();
  s.update(frame, episode, true); assert.deepEqual(s.stains.instanceMatrix.array, transforms);
  assert.ok(s.drops.instanceMatrix.array.every(Number.isFinite));
  assert.equal(JSON.stringify(episode), original);
  assert.equal(s.update({ ...frame, hit: false }, episode, true), 0); assert.equal(s.root.visible, false);
  s.update(frame, episode, false); assert.equal(s.root.visible, false);
  s.update(frame, episode, true); s.reset(); assert.equal(s.root.visible, false);
});
