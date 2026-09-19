import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PROTOCOL } from '../web/play/core.js';
import { validateSave } from '../web/play/storage.js';

test('actual play worker advances live, locks throws, saves one outcome and restores only between rounds', async () => {
  const oldFetch = globalThis.fetch, oldSelf = globalThis.self, messages = [];
  globalThis.fetch = async path => new Response(readFileSync(new URL(`../web/play/${path}`, import.meta.url)));
  globalThis.self = { postMessage: value => messages.push(value) };
  try {
    await import('../web/play/play.worker.js'); let id = 0;
    const request = async (type, options = {}) => {
      messages.length = 0; await self.onmessage({ data: { id: ++id, type, ...options } });
      return messages.at(-1);
    };
    const artifact = JSON.parse(readFileSync(new URL('../web/play/pretrained.json', import.meta.url)));
    const saved = { protocol: PROTOCOL, brain: 'whole', policy: artifact.policy, navigationPolicy: artifact.navigationPolicy, stats: { throws: 0, hits: 0, dodges: 0, misses: 0 } };
    const initial = await request('init', { seed: 77, saved }); validateSave(initial.save);
    assert.equal(initial.state.neural.neurons, 138639); assert.equal(initial.state.neural.pairs, 15091983);
    assert.equal(initial.state.neural.threshold, 1); assert.equal(initial.state.neural.learning, true);
    assert.ok((await request('init', { seed: 77, brain: 'escape' })).error);
    assert.ok((await request('inspect', { focus: [-1] })).error);
    const inspected = await request('inspect', { focus: [0] });
    assert.ok(inspected.graph.total > 0); assert.ok(inspected.graph.edges.every(e => e.pre === 0 || e.post === 0));
    const moved = await request('step', { ticks: 12 }); assert.notDeepEqual(moved.state.frame, initial.state.frame);
    const nudged = await request('nudge', { object: 'fern', dx: 1, dz: 0 });
    assert.equal(nudged.save, null); assert.deepEqual(nudged.state.stats, initial.state.stats);
    assert.ok(nudged.state.frame.props[0].omega > 0);
    assert.ok((await request('nudge', { object: 'bad', dx: 1, dz: 0 })).error);
    const tidy = await request('tidy'); assert.equal(tidy.state.frame.props[0].omega, 0);
    assert.equal(tidy.state.trained, initial.state.trained);
    assert.ok((await request('step', { ticks: 13 })).error);
    const shot = { parameters: { aim: { x: 0, z: 0 }, power: 65, elevation: -12 } };
    assert.equal((await request('throw', shot)).state.phase, 'flight');
    assert.ok((await request('throw', shot)).error);
    assert.ok((await request('nudge', { object: 'fern', dx: 1, dz: 0 })).error);
    assert.ok((await request('tidy')).error);
    assert.ok((await request('restore', { seed: 2, saved })).error);
    let outcomes = 0, result;
    for (let i = 0; i < 36; i++) {
      result = await request('step', { ticks: 12 }); assert.equal(result.error, undefined);
      if (result.save) { outcomes++; validateSave(result.save); }
    }
    assert.equal(outcomes, 1); assert.equal(result.state.stats.throws, 1); assert.equal(result.state.trained, artifact.training.episodes + 1);
    for (let i = 0; i < 13; i++) result = await request('step', { ticks: 12 });
    assert.equal(result.state.phase, 'aim');
    assert.ok((await request('restore', { seed: 2, saved: {} })).error);
    assert.equal((await request('step', { ticks: 1 })).state.stats.throws, 1);
    const restored = await request('restore', { seed: 2, saved }); assert.deepEqual(restored.save, saved);
    await request('configure', { learning: false });
    for (let i = 0; i < 48; i++) {
      const frozen = await request('step', { ticks: 12 });
      assert.equal(frozen.state.trained, restored.state.trained);
      assert.equal(frozen.save, null);
    }
    const wider = await request('init', { seed: 77, brain: 'whole', saved: { ...saved, brain: 'whole' } });
    assert.equal(wider.error, undefined); validateSave(wider.save);
    assert.equal(wider.state.brain, 'whole');
    assert.ok((await request('restore', { seed: 77, saved: { ...saved, brain: 'escape' } })).error);
    const widerStep = await request('step', { ticks: 12 });
    assert.equal(widerStep.error, undefined);
    assert.equal(widerStep.state.brain, 'whole');
  } finally { globalThis.fetch = oldFetch; globalThis.self = oldSelf; }
});
