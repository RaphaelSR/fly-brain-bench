import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { decodeConnectome, decodeLabels, decodePositions } from '../web/js/data.js';
import { neighborhood, populations } from '../web/defend/connectivity.js';
import { IntroGate } from '../web/js/intro.js';
import { BrainView } from '../web/js/gl.js';

const gz = name => new Uint8Array(gunzipSync(readFileSync(new URL(`../web/defend/data/${name}.gz`, import.meta.url))));
const meta = JSON.parse(new TextDecoder().decode(gz('meta.json')));
const labels = decodeLabels(gz('labels.bin'), meta.n_neurons);
const conn = decodeConnectome(gz('conn.bin'), meta.n_neurons, meta.n_edges, gz('sign.bin'));
const geom = decodePositions(gz('pos.u16.bin'), meta.n_neurons, meta.bbox_lo, meta.span);

test('every displayed connection exists in the packaged directed connectome with the same weight', () => {
  const groups = populations(meta, labels, geom.pos);
  assert.equal(groups.length, 4);
  for (const type of ['LPLC2', 'DNp01']) {
    const ids = groups.filter(g => g.type === type).flatMap(g => g.ids);
    const graph = neighborhood(conn, ids);
    let total = 0;
    for (let pre = 0; pre < meta.n_neurons; pre++) {
      for (let e = conn.indptr[pre]; e < conn.indptr[pre + 1]; e++) {
        if (ids.includes(pre) || ids.includes(conn.indices[e])) total++;
      }
    }
    assert.equal(graph.total, total);
    assert.equal(graph.edges.length, Math.min(160, total));
    graph.edges.forEach((edge, i) => {
      assert.ok(ids.includes(edge.pre) || ids.includes(edge.post));
      const row = Array.from(conn.indices.subarray(conn.indptr[edge.pre], conn.indptr[edge.pre + 1]));
      const e = conn.indptr[edge.pre] + row.indexOf(edge.post);
      assert.ok(row.includes(edge.post));
      assert.equal(conn.weights[e], edge.weight);
      assert.equal(edge.outgoing, ids.includes(edge.pre));
      if (i) assert.ok(Math.abs(graph.edges[i - 1].weight) >= Math.abs(edge.weight));
    });
  }
  assert.deepEqual(neighborhood(conn, []), { total: 0, edges: [] });
});

test('anatomical labels use the mean position of annotated cells, not a decorative layout', () => {
  for (const g of populations(meta, labels, geom.pos)) {
    assert.ok(g.ids.length);
    for (const i of g.ids) {
      assert.equal(meta.dicts.cell_type[labels.cellType[i]], g.type);
      assert.equal(meta.dicts.side[labels.side[i]], g.side);
    }
    for (let k = 0; k < 3; k++) assert.equal(g.p[k], g.ids.reduce((sum, i) => sum + geom.pos[i * 3 + k], 0) / g.ids.length);
  }
});

test('the introduction never auto-enters and keeps background controls inert until a deliberate click', () => {
  const previous = globalThis.document;
  let clicked, starts = 0, focused = false;
  const root = { focus() {}, hidden: false };
  const button = { disabled: true, addEventListener(name, cb) { clicked = cb; } };
  const hint = { dataset: {} }, background = { tagName: 'MAIN' };
  globalThis.document = {
    body: { children: [root, background] },
    querySelector(sel) { return ({ '#boot': root, '#btnEnter': button, '#introHint': hint, '#btnPlay': { focus() { focused = true; } } })[sel]; },
  };
  try {
    const gate = new IntroGate(() => starts++);
    clicked(); assert.equal(starts, 0); assert.equal(background.inert, true);
    gate.ready(); assert.equal(starts, 0); assert.equal(root.hidden, false); assert.equal(button.disabled, false);
    clicked(); assert.equal(starts, 1); assert.equal(root.hidden, true); assert.equal(background.inert, false); assert.equal(focused, true);
    clicked(); assert.equal(starts, 1);
  } finally { globalThis.document = previous; }
});

test('cells with missing annotation positions cannot be picked even when active', () => {
  const previous = globalThis.devicePixelRatio;
  globalThis.devicePixelRatio = 1;
  try {
    const view = Object.create(BrainView.prototype);
    Object.assign(view, { N: 2, canvas: { width: 100, height: 100 },
      valid: [0, 1], dim: [1, 1], sel: [1, 0], act: [1, 0], pos: [0, 0, 0, 0, 0, 0],
      _mvp: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] });
    assert.equal(view.pick(50, 50), 1);
    view.valid[1] = 0;
    assert.equal(view.pick(50, 50), -1);
  } finally { globalThis.devicePixelRatio = previous; }
});
