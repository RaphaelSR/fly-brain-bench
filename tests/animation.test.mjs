import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { Recording, Player, BEAT, VERDICT } from '../web/defend/replay.js';
import { escapePose } from '../web/defend/arena3d.js';
import { FlyRig } from '../web/js/fly-rig.js';
import { ImpactBody } from '../web/defend/impact.js';
import { SurvivalWorld, SurvivalSession } from '../web/defend/survival.js';
import { sampleEpisode } from '../web/defend/live.js';
import { loadRig } from '../tools/rig.mjs';
import { createObjects, createThrower } from '../web/defend/courtyard.js';

const recordings = ['replay.json.gz', 'replay.shuf.json.gz'].map(file =>
  new Recording(JSON.parse(gunzipSync(readFileSync(new URL(`../web/defend/data/${file}`, import.meta.url))))));
const [rec] = recordings;

test('the escape animation follows the recorded lean, including wrong-way jumps', () => {
  for (const lean of [-1, 0, 1]) {
    const pose = escapePose({ airborne: 0.7, leapLean: lean, lean, leapAge: 0.5 });
    assert.equal(Math.sign(pose.x), lean);
    assert.ok(pose.height > 0);
  }
  assert.equal(escapePose({ airborne: 0, leapAge: 3, leapLean: 1 }).height, 0);
  assert.equal(escapePose({}).x, 0);
});

test('pause freezes playback and reset discards pending actions', () => {
  const p = new Player(rec);
  p.update(0.15);
  const snapshot = JSON.stringify(p);
  p.update(0);
  assert.equal(JSON.stringify(p), snapshot);
  assert.ok(p._pendingAct);
  p.reset();
  assert.equal(p._pendingAct, null);
  assert.equal(p.leapAge, 0);
  assert.equal(p.leapLean, 0);
});

test('all shipped checkpoints play the same decisions at 30/60 fps and 1×/4×', () => {
  for (const rec of recordings) {
    for (let cp = 0; cp < rec.checkpoints.length; cp++) {
      for (const angle of rec.showcase) {
        const sequences = [];
        for (const dt of [1 / 60, 1 / 30, 4 / 30, 0.4, 8]) {
          const p = new Player(rec); p.cp = cp; p.angle = angle;
          const actions = [];
          while (!p.done) p.update(dt, { onAct: (name, s) => actions.push([name, s.lean]) });
          sequences.push(actions);
        }
        assert.deepEqual(sequences[1], sequences[0]);
        assert.deepEqual(sequences[2], sequences[0]);
        assert.deepEqual(sequences[3], sequences[0]);
        assert.deepEqual(sequences[4], sequences[0]);
        const expected = rec.run(cp, angle).steps.map(s => [rec.actions[s.a], s.lean]);
        assert.deepEqual(sequences[0], expected);
      }
    }
  }
});

test('a completed replay emits one final event and holds its last frame', () => {
  const p = new Player(rec), events = [];
  p.update(rec.glances * BEAT + VERDICT + 1, { onEnd: (_, justEnded) => events.push(!!justEnded) });
  assert.deepEqual(events, [true, false]);
  assert.equal(p.finished, true);
  const snapshot = JSON.stringify(p);
  p.update(20, { onEnd: () => events.push('duplicate') });
  assert.equal(JSON.stringify(p), snapshot);
  assert.equal(events.length, 2);
});

test('impact physics is frame-rate independent, pauses, bounces and settles', () => {
  const bodies = [1 / 60, 1 / 30, 0.25].map(dt => {
    const b = new ImpactBody({ x: 0, z: 0, height: 0 }, 1);
    for (let t = 0; t < 3 - 1e-8; t += dt) b.update(dt);
    return b;
  });
  for (const b of bodies) {
    assert.ok(b.x < -0.5 && b.z < 0);
    assert.ok(b.contacts > 0);
    assert.ok(Math.abs(b.roll) < 0.03 && Math.abs(b.pitch) < 0.03);
    assert.ok(Math.abs(b.y - 0.52) < 0.01);
    for (const k of ['x', 'y', 'z', 'pitch', 'roll']) assert.ok(Math.abs(b[k] - bodies[0][k]) < 1e-9);
    const paused = JSON.stringify(b); b.update(0); b.update(-1);
    assert.equal(JSON.stringify(b), paused);
  }
});

test('actual projectile contact hits a stationary fly; a lateral jump clears it and lands elsewhere', () => {
  for (const angle of [-1, 1]) {
    for (const jumping of [false, true]) {
      const w = new SurvivalWorld({ angle });
      while (w.time < w.duration) {
        if (jumping && w.time > 1.1 && !w.used) { w.act(angle < 0 ? 2 : 1); w.act(3); }
        w.step();
        assert.ok([w.x, w.z, w.height, w.projectile.y].every(Number.isFinite));
        assert.ok(w.height >= -0.23);
      }
      assert.equal(w.hit, !jumping);
      if (jumping) { assert.ok(Math.abs(w.x) > 2); assert.equal(w.height, 0); }
    }
  }
});

test('flight duration changes projectile physics, not just playback speed', () => {
  const fast = new SurvivalWorld({ approach: 1.2 }), slow = new SurvivalWorld({ approach: 2.4 });
  while (!fast.hit && fast.time < fast.duration) fast.step();
  while (!slow.hit && slow.time < slow.duration) slow.step();
  assert.ok(fast.hit && slow.hit);
  assert.ok(slow.contactAt > fast.contactAt + 0.8);
});

test('live sessions use real neural activity, learn only when enabled and keep safe landing positions', () => {
  const session = new SurvivalSession(loadRig({ seed: 11 }));
  const first = session.episode();
  assert.ok(first.frames.length > 100);
  assert.ok(first.observations.some(s => s.snap.i.length > 0 && s.gf > 0));
  assert.equal(session.policy.episodes, 1);
  assert.equal(first.ok, true);
  assert.ok(Math.abs(session.position.x) > 2);
  const weights = JSON.stringify(session.policy.serialise());
  const next = session.episode({ training: false });
  assert.equal(JSON.stringify(session.policy.serialise()), weights);
  assert.equal(next.origin.x, first.frames.at(-1).x);
  for (const t of [0, 0.5, 1.8, first.duration, first.duration + 1]) {
    const f = sampleEpisode(first, t);
    assert.ok([f.x, f.z, f.height, f.projectile.x].every(Number.isFinite));
  }
});

test('slipper, hand and impact rig have finite geometry and transforms', () => {
  const objects = createObjects();
  for (const root of [...Object.values(objects), createThrower()]) {
    root.updateMatrixWorld(true);
    root.traverse(o => {
      assert.ok(o.matrixWorld.elements.every(Number.isFinite));
      if (o.geometry) assert.ok(o.geometry.attributes.position.array.every(Number.isFinite));
    });
  }
});

test('the fly has six finite articulated legs across walking, turning, flight and feeding', () => {
  const rig = new FlyRig();
  assert.equal(rig.legs.length, 6);
  assert.equal(rig.wings.length, 2);
  for (const drive of [{ walk: 1 }, { walk: 1, turn: -1 }, { backward: 1 }, { escape: 1 }, { proboscis: 1 }, { groom: 1 }, {}]) {
    for (let i = 0; i < 120; i++) rig.update(drive, 1 / 60);
    rig.root.updateMatrixWorld(true);
    rig.root.traverse(o => assert.ok(o.matrixWorld.elements.every(Number.isFinite)));
  }
  const pose = rig.body.matrix.clone();
  rig.update({}, 0);
  assert.deepEqual(rig.body.matrix.elements, pose.elements);
});

test('stance feet stay planted in world space while the body advances', () => {
  const rig = new FlyRig();
  rig.update({ walk: 1 }, 1 / 60);
  const feet = rig.legs.map(l => l.foot.clone());
  rig.update({ walk: 1 }, 1 / 60);
  for (let i = 0; i < rig.legs.length; i++) {
    if (!rig.legs[i].swinging) assert.ok(rig.legs[i].foot.distanceTo(feet[i]) < 1e-10);
  }
});
