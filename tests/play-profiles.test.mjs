import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { readPreferences, savePreferences, selectBrain, applyGraphics, PREFERENCES_KEY } from '../web/play/profiles.js';
import { decodeLightBrain } from '../web/play/complete-brain.js';
import { PlayStore } from '../web/play/storage.js';
import { PROTOCOL } from '../web/play/core.js';

const memory = () => { const data = new Map(); return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) }; };
test('preferences default to Full, persist explicit choices and handle blocked/corrupt storage', () => {
  const storage = memory();
  assert.deepEqual(readPreferences(storage), { brain: 'whole', graphics: 'standard' });
  assert.equal(savePreferences(storage, { brain: 'light', graphics: 'light' }), true);
  assert.deepEqual(readPreferences(storage), { brain: 'light', graphics: 'light' });
  assert.equal(readPreferences(storage, 'whole').brain, 'whole');
  assert.equal(selectBrain('escape'), 'whole'); assert.equal(selectBrain('unknown'), 'whole');
  storage.setItem(PREFERENCES_KEY, '{broken'); assert.equal(readPreferences(storage).brain, 'whole');
  const blocked = { getItem() { throw Error(); }, setItem() { throw Error(); } };
  assert.equal(readPreferences(blocked).brain, 'whole'); assert.equal(savePreferences(blocked, {}), false);
});

test('Light validates exact historical payload and cannot substitute a corrupt or Full package', async () => {
  const gz = name => gunzipSync(readFileSync(new URL('../web/data/' + name + '.gz', import.meta.url)));
  const meta = JSON.parse(gz('meta.json')), bytes = gz('conn.bin'), signs = gz('sign.bin');
  const conn = await decodeLightBrain(meta, bytes, signs);
  assert.equal(conn.indptr.length, 138640); assert.equal(conn.indices.length, 2700513);
  let maximum = 0, minimum = Infinity;
  for (const w of conn.weights) { const n = Math.round(Math.abs(w) / .275); maximum = Math.max(maximum, n); minimum = Math.min(minimum, n); }
  assert.equal(minimum, 5); assert.equal(maximum, 127);
  await assert.rejects(decodeLightBrain({ ...meta, threshold: 1 }, bytes, signs));
  bytes[0] ^= 1; await assert.rejects(decodeLightBrain(meta, bytes, signs));
});

test('Light memory is independent of existing Full and legacy subcircuit saves', async () => {
  const storage = memory(), artifact = JSON.parse(readFileSync(new URL('../web/play/pretrained.json', import.meta.url)));
  const full = new PlayStore(storage, 'whole'), light = new PlayStore(storage, 'light'), escape = new PlayStore(storage, 'escape');
  const data = { protocol: PROTOCOL, brain: 'whole', policy: artifact.policy, navigationPolicy: artifact.navigationPolicy, stats: { throws: 0, hits: 0, dodges: 0, misses: 0 } };
  await full.save(data); await escape.save({ ...data, brain: 'escape' });
  assert.equal(light.load(), null);
  await light.save({ ...data, brain: 'light', stats: { throws: 1, hits: 1, dodges: 0, misses: 0 } });
  assert.equal(full.load().stats.throws, 0); assert.equal(escape.load().stats.throws, 0); assert.equal(light.load().stats.throws, 1);
  await assert.rejects(light.save(data));
});

test('light graphics only change rendering and can be reversed without changing neural data', () => {
  const material = {}, brain = { act: new Float32Array([1, 2]), N: 138639 };
  const view = { renderer: { setPixelRatio(value) { this.ratio = value; }, shadowMap: { enabled: true } }, scene: { traverse(fn) { fn({ material }); } } };
  applyGraphics(view, brain, 'light', 3);
  assert.equal(view.renderer.ratio, 1); assert.equal(view.renderer.shadowMap.enabled, false); assert.equal(brain.pixelRatioLimit, 1);
  applyGraphics(view, brain, 'standard', 3);
  assert.equal(view.renderer.ratio, 1.75); assert.equal(view.renderer.shadowMap.enabled, true); assert.equal(brain.pixelRatioLimit, 2);
  assert.equal(brain.N, 138639); assert.deepEqual([...brain.act], [1, 2]);
});

test('download initialization is behind the explicit choice and entry remains a separate action', () => {
  const page = readFileSync(new URL('../web/play/page.js', import.meta.url), 'utf8');
  assert.match(page, /download'\).addEventListener\('click', \(\) => initialize\(\)\)/);
  const initialization = page.slice(page.indexOf('async function initialize()'));
  assert.match(initialization, /startWorker\(\)/); assert.match(initialization, /new Arena3D/);
  assert.match(initialization, /initStatus !== 'choose'/); assert.doesNotMatch(initialization, /entered = true/);
  assert.doesNotMatch(page.slice(0, page.indexOf('async function initialize()')), /await fetch\('pretrained/);
});
