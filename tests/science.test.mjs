import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { softmax, wilson, expectedPoints, summarizeEvaluation } from '../web/science/math.js';
import { CONTENT, SOURCES } from '../web/science/content.js';
import { Policy } from '../web/defend/policy.js';
import { Engine, PARAMS } from '../web/js/lif-core.js';

const near = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
test('teaching softmax matches the policy and is stable under score shifts', () => {
  const scores = [0, 0, 0, 2, 1, 0, 0, -1], policy = new Policy(1, 8);
  policy.b.set(scores);
  for (const t of [0.25, 1, 3]) {
    const p = softmax(scores, t), actual = policy.probs([0], t);
    near(p.reduce((s, v) => s + v, 0), 1);
    p.forEach((v, i) => { near(v, softmax(scores.map(s => s + 10000), t)[i]); near(v, actual[i], 1e-7); });
  }
  assert.ok(softmax(scores, 0.25)[3] > softmax(scores, 3)[3]);
  assert.deepEqual(softmax([0, 0]), [0.5, 0.5]);
  for (const args of [[[], 1], [[NaN], 1], [[1], 0], [[1], -1]]) assert.throws(() => softmax(...args));
});
test('Wilson handles perfect and zero outcomes without claiming certainty', () => {
  near(wilson(20, 20).low, 0.8388748419471806);
  near(wilson(20, 20).high, 1);
  near(wilson(0, 20).high, 1 - wilson(20, 20).low);
  near(wilson(5, 10).low, 0.236593090512564);
  for (const args of [[0, 0], [-1, 20], [21, 20], [2.5, 20], [1, Infinity]]) assert.throws(() => wilson(...args));
});
test('point expectations distinguish gross return from net profit', () => {
  near(expectedPoints(50, 0.7), 20); near(expectedPoints(50, 0.5), 0);
  near(expectedPoints(50, 0), -50); near(expectedPoints(50, 1), 50);
  assert.throws(() => expectedPoints(-1, 0.5)); assert.throws(() => expectedPoints(50, 2));
});
test('published evaluation is counted from outcomes, not averaged percentages', () => {
  const data = JSON.parse(readFileSync(new URL('../web/defend/data/pretrained-arena.json', import.meta.url)));
  const summary = summarizeEvaluation(data);
  assert.equal(summary.trials, 180); assert.equal(summary.escapes, 153); near(summary.rate, 0.85);
  const row = (trials, escapes) => ({ trials, escapes, baselineEscapes: 0, approach: 1.2, roam: 6 });
  near(summarizeEvaluation({ evaluation: { results: [row(1, 1), row(9, 0)] } }).rate, 0.1);
  for (const report of [{}, { evaluation: { results: [] } }, { evaluation: { results: [row(10, 11)] } }]) assert.throws(() => summarizeEvaluation(report));
});
test('guide translations, accessible copy and citations are complete', () => {
  const markup = readFileSync(new URL('../web/science/index.html', import.meta.url), 'utf8');
  const keys = [...markup.matchAll(/data-copy="([^"]+)"/g)].map(m => m[1]);
  for (const c of Object.values(CONTENT)) {
    assert.deepEqual(Object.keys(c), Object.keys(CONTENT.pt));
    for (const key of keys) assert.ok(typeof c[key] === 'string' && c[key].length, key);
    assert.equal(c.actions.length, 8); assert.equal(c.math.length, 5); assert.equal(c.faq.length, 13);
    assert.equal(new Set(c.faq.map(row => row[0])).size, c.faq.length);
    assert.equal(c.sourceNotes.length, Object.keys(SOURCES).length);
    for (const row of [...c.evidence, ...c.math, ...c.faq]) for (const ref of row[3]) assert.ok(SOURCES[ref]);
  }
});
test('documented subthreshold solution matches actual engine transition', () => {
  const engine = new Engine({ N: 1, indptr: new Uint32Array(2), indices: new Uint32Array(0), weights: new Float32Array(0), dt: 0.5 });
  engine.v[0] = -50; engine.g[0] = 0.2; engine.touch(0);
  const initialG = engine.g[0], ev = Math.exp(-0.5 / PARAMS.TMBR), eg = Math.exp(-0.5 / PARAMS.TAU);
  const expected = PARAMS.V0 + (-50 - PARAMS.V0) * ev + PARAMS.TAU / (PARAMS.TAU - PARAMS.TMBR) * (eg - ev) * initialG;
  engine.advance();
  near(engine.v[0], expected, 3e-6); near(engine.g[0], initialG * eg, 2e-8);
  assert.equal(engine.totalSpikes, 0); assert.equal(engine.RFC_STEPS, 4);
});
