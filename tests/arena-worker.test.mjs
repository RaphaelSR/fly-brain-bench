import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateCheckpoint } from '../web/defend/checkpoint.js';

test('actual worker initializes, trains exactly 50, imports, resets stats, loads pretrained and isolates game rounds', async () => {
  const oldFetch = globalThis.fetch, oldSelf = globalThis.self;
  const messages = [];
  globalThis.fetch = async path => new Response(readFileSync(new URL(`../web/defend/${path}`, import.meta.url)));
  globalThis.self = { postMessage: value => messages.push(value) };
  try {
    await import('../web/defend/survival.worker.js');
    let id = 0;
    const request = async (type, options = {}) => {
      messages.length = 0;
      await self.onmessage({ data: { id: ++id, type, approach: 1.8, roam: 6, training: true, ...options } });
      const result = messages.at(-1);
      assert.equal(result.error, undefined, result.error);
      validateCheckpoint(result.checkpoint);
      return result;
    };
    const initial = await request('init'); assert.equal(initial.episode, undefined);
    const trained = await request('train');
    assert.equal(trained.checkpoint.policy.episodes, 50); assert.equal(trained.checkpoint.stats.trials, 50);
    const cleared = await request('stats');
    assert.equal(cleared.checkpoint.stats.trials, 0);
    assert.deepEqual(cleared.checkpoint.policy, trained.checkpoint.policy);
    assert.deepEqual((await request('import', { checkpoint: trained.checkpoint })).checkpoint, trained.checkpoint);
    const first = await request('game', { checkpoint: trained.checkpoint, seed: 1234 });
    const resumed = await request('game', { checkpoint: trained.checkpoint, seed: 1234 });
    assert.deepEqual(first.episode, resumed.episode);
    assert.deepEqual(first.checkpoint, trained.checkpoint);
    const pretrained = await request('pretrained');
    assert.equal(pretrained.checkpoint.policy.episodes, 800); assert.equal(pretrained.checkpoint.stats.trials, 0);
    assert.ok(pretrained.checkpoint.policy.W.some(v => v !== 0));
    const reset = await request('reset'); assert.equal(reset.checkpoint.policy.episodes, 0);
    assert.ok(reset.checkpoint.policy.W.every(v => v === 0));
  } finally { globalThis.fetch = oldFetch; globalThis.self = oldSelf; }
});
