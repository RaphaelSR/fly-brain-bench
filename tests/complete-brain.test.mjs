import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { Engine } from '../web/js/lif-core.js';
import { decodeCompleteBrain } from '../web/play/complete-brain.js';
import { loadRig } from '../tools/rig.mjs';
import { PlaySession } from '../web/play/core.js';
import { PlayStore } from '../web/play/storage.js';
import { BrainInspector } from '../web/defend/brain-inspector.js';

test('complete graph preserves every source count and rejects pruned/corrupt packages', async () => {
  const gz = name => gunzipSync(readFileSync(new URL('../web/play/brain-data/' + name + '.gz', import.meta.url)));
  const meta = JSON.parse(gz('meta.json')), bytes = gz('conn.bin'), signs = gz('sign.bin');
  const conn = await decodeCompleteBrain(meta, bytes, signs);
  assert.equal(conn.indptr.length, 138640); assert.equal(conn.indices.length, 15091983);
  let sum = 0, maximum = 0, ones = 0;
  for (const weight of conn.weights) { const count = Math.round(Math.abs(weight) / 0.275); sum += count; maximum = Math.max(maximum, count); if (count === 1) ones++; }
  assert.equal(sum, 54492922); assert.equal(maximum, 2405); assert.ok(ones > 7000000);
  await assert.rejects(decodeCompleteBrain({ ...meta, threshold: 5 }, bytes, signs));
  bytes[bytes.length - 1] ^= 1; await assert.rejects(decodeCompleteBrain(meta, bytes, signs));
});

test('spike reporting cannot silently truncate a whole-brain simultaneous event', () => {
  const N = 70000, engine = new Engine({ N, indptr: new Int32Array(N + 1), indices: new Int32Array(), weights: new Float32Array() });
  for (let i = 0; i < N; i++) { engine.touch(i); engine.v[i] = 0; }
  let events = 0; engine.run(1, () => events++);
  assert.equal(events, N); assert.equal(engine.totalSpikes, N);
});

test('complete graph supports persistent motor learning without editing anatomical weights', async () => {
  const rig = loadRig({ brain: 'complete', seed: 311 }), s = new PlaySession(rig, { brain: 'whole' });
  const digest = () => createHash('sha256').update(new Uint8Array(rig.eng.weights.buffer)).digest('hex');
  const before = Array.from(s.navigationPolicy.W), anatomy = digest();
  for (let i = 0; i < 120 * 32; i++) s.step();
  assert.ok(s.navigationPolicy.episodes >= 8); assert.notDeepEqual(Array.from(s.navigationPolicy.W), before);
  assert.equal(digest(), anatomy);
  const values = new Map(), store = new PlayStore({ getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) }, 'whole');
  await store.save(s.save()); const restored = store.load(); assert.deepEqual(restored, s.save());
  s.learning = false; const frozen = s.save(); for (let i = 0; i < 120 * 4; i++) s.step();
  assert.deepEqual(s.save(), frozen);
});

test('asynchronous graph inspection cannot replace a newer neuron selection with stale edges', async () => {
  const pending = [], inspector = Object.create(BrainInspector.prototype);
  Object.assign(inspector, { focus: [0], revision: 0, shuffled: false, relabel() {},
    view: { N: 3, dim: new Float32Array(3), uploadDim() {} },
    query: () => new Promise(resolve => pending.push(resolve)) });
  inspector.refresh(); assert.equal(inspector.queryPending, true);
  inspector.focus = [1]; inspector.refresh();
  pending[0]({ total: 1, edges: [{ pre: 0, post: 2 }] }); await Promise.resolve();
  assert.equal(inspector.queryPending, true); assert.equal(inspector.graph.total, 0);
  const graph = { total: 1, edges: [{ pre: 1, post: 2 }] };
  pending[1](graph); await Promise.resolve();
  assert.equal(inspector.queryPending, false); assert.deepEqual(inspector.graph, graph);
  assert.equal(inspector.view.dim[1], 1); assert.equal(inspector.view.dim[2], 1);
});
