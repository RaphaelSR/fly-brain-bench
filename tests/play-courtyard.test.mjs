import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../web/vendor/three/three.module.min.js';
import { ThrowGesture } from '../web/play/gesture.js';
import { PlayWorld } from '../web/play/world.js';
import { PROPS, newProps, advanceProps, propCollider } from '../web/play/props.js';
import { makeShot, traceShot, launch, WORLD_STEP, SHOT_SECONDS } from '../web/play/physics.js';
import { createHomeCourtyard } from '../web/play/home-scene.js';
import { sampleEpisode } from '../web/defend/live.js';

test('gesture separates taps, throws, cancellation, multitouch and force bounds', () => {
  const g = new ThrowGesture();
  g.begin(1, 10, 20, 65, 400); assert.equal(g.end(1, 15, 25, true), 'tap');
  g.begin(1, 10, 20, 65, 400); assert.deepEqual(g.move(1, 10, 420), { armed: true, power: 100 });
  assert.equal(g.end(1, 10, 420, true), 'throw'); assert.equal(g.end(1, 10, 420, true), 'cancel');
  g.begin(1, 10, 20, 65, 400); assert.equal(g.move(1, 10, -400).power, 25);
  assert.equal(g.end(1, 10, -400, false), 'cancel');
  g.begin(1, 10, 20, 65, 400); assert.equal(g.move(2, 10, 200), null);
  assert.equal(g.begin(2, 10, 20, 65, 400), false); assert.equal(g.active, null);
  g.begin(1, 10, 20, 65, 400); g.cancel(); assert.equal(g.end(1, 10, 200, true), 'cancel');
});

test('objects tip, settle, change colliders and snapshot without aliasing', () => {
  const w = new PlayWorld(); w.projectileActive = false;
  const before = w.frame(); w.nudge('fern', 1, 0);
  for (let i = 0; i < 1200; i++) w.step();
  assert.equal(before.props[0].angle, 0); assert.equal(w.props[0].angle, Math.PI / 2);
  assert.ok(w.props[0].x > before.props[0].x); assert.ok(Math.abs(w.props[0].vx) < 1e-9);
  assert.ok(propCollider(w.props[0], PROPS[0]).radius > PROPS[0].radius);
  for (const p of w.props) for (const value of Object.values(p)) if (typeof value === 'number') assert.ok(Number.isFinite(value));
  assert.throws(() => w.nudge('unknown', 1, 0)); assert.throws(() => w.nudge('fern', NaN, 0));
});

test('slipper impacts transfer momentum to props; moving-prop preview matches live integrator', () => {
  const w = new PlayWorld({ x: 15, z: 15 }); w.projectileActive = false;
  const p = PROPS.find(d => d.id === 'bottle');
  const shot = makeShot({ x: p.x, y: 0.4, z: p.z + 3 }, p, 65, 0);
  w.nudge('fern', 1, 0);
  const original = structuredClone(w.props), guide = traceShot(shot, null, w.props);
  assert.deepEqual(w.props, original); launch(w, shot);
  for (let i = 0; i < Math.round(SHOT_SECONDS / WORLD_STEP); i++) {
    w.step(); if (i % 4 === 3) assert.deepEqual(w.projectile, guide.points[(i + 1) / 4]);
  }
  assert.ok(w.props.find(d => d.id === 'bottle').angle > 1);
});

test('house geometry is finite and render roots follow all physical props', async () => {
  const view = { scene: new THREE.Scene(), ground: {}, grid: {}, renderer: {}, key: new THREE.DirectionalLight() };
  view.scene.background = new THREE.Color();
  const env = createHomeCourtyard(view, { textures: false }); await env.ready;
  assert.equal(env.pickables.length, PROPS.length);
  env.root.traverse(o => {
    for (const n of o.geometry?.attributes.position.array || []) assert.ok(Number.isFinite(n));
  });
  const props = newProps(); props[0].angle = Math.PI / 2; advanceProps(props, WORLD_STEP); env.update(props);
  assert.equal(env.pickables[0].position.x, props[0].x);
  assert.ok(env.pickables[0].quaternion.angleTo(new THREE.Quaternion()) > 1);
});

test('replay interpolates prop poses without changing the recorded world', () => {
  const w = new PlayWorld(); w.projectileActive = false;
  const a = w.frame(); w.nudge('fern', 1, 0);
  for (let i = 0; i < 120; i++) w.step();
  const b = w.frame(), recorded = { frames: [a, b] }, before = structuredClone(recorded);
  const halfway = sampleEpisode(recorded, (a.t + b.t) / 2);
  assert.equal(halfway.props[0].angle, b.props[0].angle / 2);
  halfway.props[0].angle = 99; assert.deepEqual(recorded, before);
});
