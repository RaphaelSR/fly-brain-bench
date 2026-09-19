import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { Recording, Player } from '../web/defend/replay.js';
import { escapePose } from '../web/defend/arena3d.js';
import { FlyRig } from '../web/js/fly-rig.js';

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
        for (const dt of [1 / 60, 1 / 30, 4 / 30]) {
          const p = new Player(rec); p.cp = cp; p.angle = angle;
          const actions = [];
          while (!p.done) p.update(dt, { onAct: (name, s) => actions.push([name, s.lean]) });
          sequences.push(actions);
        }
        assert.deepEqual(sequences[1], sequences[0]);
        assert.deepEqual(sequences[2], sequences[0]);
        const expected = rec.run(cp, angle).steps.map(s => [rec.actions[s.a], s.lean]);
        assert.deepEqual(sequences[0], expected);
      }
    }
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
