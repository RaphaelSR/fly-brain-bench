import test from 'node:test';
import assert from 'node:assert/strict';
import { cameraDistance } from '../web/js/fly.js';
import { bindSceneLayout } from '../web/defend/scene-layout.js';
import { LOCALES } from '../web/js/i18n.js';
import { IntroGate } from '../web/js/intro.js';

function fixture(fail = false) {
  const handlers = new Map();
  function node(id) {
    return { id, parent: 'page', dataset: {}, attrs: {},
      addEventListener(type, fn) { handlers.set(`${id}:${type}`, fn); },
      setAttribute(key, value) { this.attrs[key] = value; },
      focus() { doc.focused = this; },
      before(marker) { marker.parent = this.parent; },
      replaceWith(other) { other.parent = this.parent; },
    };
  }
  const stage = node('stage'), transport = node('transport');
  const nodes = Object.fromEntries(['sceneDialog', 'sceneSize', 'btnSceneFull', 'btnSceneExit'].map(id => [id, node(id)]));
  const classes = new Set();
  const doc = { body: { classList: { add: c => classes.add(c), remove: c => classes.delete(c) } },
    querySelector: selector => selector === '.stage' ? stage : transport,
    getElementById: id => nodes[id], createComment: () => node('marker') };
  const dialog = nodes.sceneDialog;
  dialog.append = child => { child.parent = dialog; };
  dialog.showModal = () => { if (fail) throw new Error('Unavailable'); dialog.open = true; };
  dialog.close = () => { dialog.open = false; handlers.get('sceneDialog:close')(); };
  const win = { scrollX: 0, scrollY: 420, scrollTo(x, y) { this.restored = [x, y]; } };
  bindSceneLayout(doc, win);
  return { doc, nodes, stage, transport, dialog, win, classes, fire: (id, type = 'click') => handlers.get(`${id}:${type}`)() };
}

test('immersive mode moves the same stage and playback controls, restores layout and focus', () => {
  const f = fixture();
  for (let i = 0; i < 3; i++) {
    f.fire('btnSceneFull');
    assert.equal(f.stage.parent, f.dialog); assert.equal(f.transport.parent, f.dialog);
    assert.equal(f.doc.focused, f.nodes.btnSceneExit); assert.ok(f.classes.has('scene-open'));
    f.fire('btnSceneFull');
    if (i === 1) f.dialog.close(); else f.fire('btnSceneExit');
    assert.equal(f.stage.parent, 'page'); assert.equal(f.transport.parent, 'page');
    assert.deepEqual(f.win.restored, [0, 420]); assert.equal(f.doc.focused, f.nodes.btnSceneFull);
    assert.equal(f.nodes.btnSceneFull.attrs['aria-expanded'], 'false'); assert.equal(f.classes.size, 0);
  }
});
test('sizing is presentation-only and failed modal opening restores both nodes', () => {
  const f = fixture(true);
  f.nodes.sceneSize.value = 'large'; f.fire('sceneSize', 'change');
  assert.equal(f.stage.dataset.sceneSize, 'large');
  f.nodes.sceneSize.value = 'half'; f.fire('sceneSize', 'change');
  assert.equal(f.stage.dataset.sceneSize, 'half');
  f.fire('btnSceneFull');
  assert.equal(f.stage.parent, 'page'); assert.equal(f.transport.parent, 'page'); assert.equal(f.classes.size, 0);
});
test('portrait framing cannot zoom the fly arbitrarily far away; bench and landscape are unchanged', () => {
  for (const aspect of [0.2, 390 / 724, 390 / 422, 844 / 270, 16 / 9]) {
    const d = cameraDistance(10.5, aspect, true);
    assert.ok(d >= 10.5 && d <= 10.5 * 1.35);
    assert.equal(cameraDistance(4.5, aspect), 4.5 * Math.max(1, 0.95 / aspect));
  }
  assert.equal(cameraDistance(10.5, 16 / 9, true), 10.5);
  for (const locale of Object.values(LOCALES)) for (const key of ['size', 'half', 'large', 'full', 'exit']) assert.ok(locale[`scene.${key}`]);
});

test('entering the arena focuses its visible scene controls without scrolling to the footer', () => {
  const previous = globalThis.document;
  let enter, options;
  const root = { focus() {} }, button = { disabled: false, addEventListener(type, fn) { enter = fn; } };
  const sceneButton = { focus(value) { options = value; } };
  globalThis.document = {
    body: { children: [root] },
    querySelector: selector => ({ '#boot': root, '#btnEnter': button, '#btnSceneFull': sceneButton })[selector],
  };
  try {
    new IntroGate(() => {}); enter();
    assert.deepEqual(options, { preventScroll: true }); assert.equal(root.hidden, true);
  } finally { globalThis.document = previous; }
});
