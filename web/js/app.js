import { fetchGz, decodeConnectome, decodePositions, decodeLabels } from './data.js';
import { BrainView } from './gl.js';
import { PRESETS, TAG_ORDER, resolvePreset } from './presets.js';

const $ = s => document.querySelector(s);
const NT_COLOR = {
  acetylcholine: [0.96, 0.68, 0.26], gaba: [0.28, 0.58, 0.88],
  glutamate: [0.64, 0.45, 0.87], dopamine: [0.35, 0.78, 0.55],
  serotonin: [0.90, 0.45, 0.65], octopamine: [0.30, 0.78, 0.80],
  unknown: [0.45, 0.52, 0.55],
};
const NT_LABEL = {
  acetylcholine: 'Acetylcholine — excites', gaba: 'GABA — inhibits',
  glutamate: 'Glutamate — inhibits', dopamine: 'Dopamine', serotonin: 'Serotonin',
  octopamine: 'Octopamine', unknown: 'Not determined',
};

const S = {
  meta: null, labels: null, view: null, worker: null,
  selected: [], running: false, t: 0, nActive: 0, totalSpikes: 0,
  spikeAccum: null, ratesWindow: null, lastReadout: 0, ready: false,
  typeCounts: null, filterSuper: null,
};

/* ---------------- boot ---------------- */
const stages = [
  ['meta.json.gz', 'index'], ['pos.u16.bin.gz', 'positions'],
  ['labels.bin.gz', 'annotations'], ['sign.bin.gz', 'signs'], ['conn.bin.gz', 'connectome'],
];

const T = {}; const mark = (k) => { T[k] = performance.now(); };
async function boot() {
  mark('t0');
  const setStatus = (txt, frac) => {
    $('#loadLabel').textContent = txt;
    $('#loadBar').style.width = `${Math.round(frac * 100)}%`;
    $('#loadPct').textContent = `${Math.round(frac * 100)}%`;
  };
  try {
    setStatus('Reading the index', 0.01);
    const metaRaw = await fetchGz('data/meta.json.gz');
    const meta = JSON.parse(new TextDecoder().decode(metaRaw));
    S.meta = meta;
    const N = meta.n_neurons, E = meta.n_edges;
    $('#statNeurons').textContent = N.toLocaleString('en-US');
    $('#statEdges').textContent = E.toLocaleString('en-US');

    setStatus('Loading neuron positions', 0.06);
    const posRaw = await fetchGz('data/pos.u16.bin.gz', f => setStatus('Loading neuron positions', 0.06 + f * 0.08));
    const { pos, radius } = decodePositions(posRaw, N, meta.bbox_lo, meta.span);

    setStatus('Loading cell-type annotations', 0.16);
    const labRaw = await fetchGz('data/labels.bin.gz', f => setStatus('Loading cell-type annotations', 0.16 + f * 0.06));
    const labels = decodeLabels(labRaw, N);
    S.labels = labels;

    const signRaw = await fetchGz('data/sign.bin.gz');
    mark('assets');

    setStatus('Loading 2.7 million connections', 0.24);
    const connRaw = await fetchGz('data/conn.bin.gz', f => setStatus('Loading 2.7 million connections', 0.24 + f * 0.62));

    setStatus('Rebuilding the wiring diagram', 0.88);
    await frame();
    mark('gunzip');
    const conn = decodeConnectome(connRaw, N, E, signRaw);
    mark('decode');

    setStatus('Starting the renderer', 0.95);
    await frame();
    const view = new BrainView($('#well'), pos, labels.nt, radius);
    view.setNTColors(meta.dicts.top_nt.map(n => NT_COLOR[n] || NT_COLOR.unknown));
    S.view = view;

    S.worker = new Worker('js/sim.worker.js');
    S.worker.onmessage = onWorker;
    S.worker.postMessage({
      cmd: 'init', N, indptr: conn.indptr, indices: conn.indices, weights: conn.weights
    }, [conn.indptr.buffer, conn.indices.buffer, conn.weights.buffer]);

    S.spikeAccum = new Float32Array(N);
    S.ratesWindow = new Float32Array(N);
    buildUI();
    mark('ui');
    console.log('boot timing (ms):', {
      assets: (T.assets - T.t0) | 0, gunzipConn: (T.gunzip - T.assets) | 0,
      decodeConn: (T.decode - T.gunzip) | 0, ui: (T.ui - T.decode) | 0,
      total: (T.ui - T.t0) | 0
    });
    setStatus('Ready', 1);
  } catch (err) {
    $('#loadLabel').textContent = 'Could not start';
    $('#loadDetail').innerHTML = `<strong>${escapeHtml(err.message)}</strong><br>
      This page needs WebGL2 and must be served over http — opening the file directly will not work.`;
    $('#loadDetail').classList.add('err');
    console.error(err);
  }
}
// yields to the event loop so the status can paint. Deliberately not rAF:
// rAF is paused in background tabs, which would stall the whole boot.
const frame = () => new Promise(r => setTimeout(r, 0));

function onWorker(ev) {
  const m = ev.data;
  if (m.type === 'ready') {
    S.ready = true;
    $('#boot').classList.add('done');
    setTimeout(() => $('#boot').remove(), 700);
    selectPreset(PRESETS[0]);
    setRunning(true);
    return;
  }
  if (m.type === 'frame') {
    const sp = m.spikes;
    for (let k = 0; k < sp.length; k++) {
      const i = sp[k];
      S.spikeAccum[i] = 1;
      S.ratesWindow[i] += 1;
    }
    S.t = m.t; S.nActive = m.nActive; S.totalSpikes = m.totalSpikes;
  }
}

/* ---------------- ui ---------------- */
function buildUI() {
  const lib = $('#library');
  for (const tag of TAG_ORDER) {
    const group = PRESETS.filter(p => p.tag === tag);
    if (!group.length) continue;
    const h = document.createElement('div');
    h.className = 'lib-head'; h.textContent = tag;
    lib.appendChild(h);
    for (const p of group) {
      const b = document.createElement('button');
      b.className = 'preset'; b.dataset.id = p.id;
      b.innerHTML = `<span class="p-name">${escapeHtml(p.name)}</span><span class="p-count"></span>`;
      b.addEventListener('click', () => selectPreset(p));
      lib.appendChild(b);
      const idx = resolvePreset(p, S.labels, S.meta.dicts);
      p._idx = idx;
      b.querySelector('.p-count').textContent = idx.length;
      if (!idx.length) { b.disabled = true; b.title = 'no annotated neurons in this release'; }
    }
  }

  $('#btnPlay').addEventListener('click', () => setRunning(!S.running));
  $('#btnReset').addEventListener('click', () => {
    S.spikeAccum.fill(0); S.ratesWindow.fill(0);
    S.view.act.fill(0); S.view.uploadAct();
    S.worker.postMessage({ cmd: 'reset' });
  });
  $('#speed').addEventListener('input', e => {
    const v = +e.target.value;
    S.worker.postMessage({ cmd: 'speed', value: v });
    $('#speedOut').textContent = `${(v * 0.1).toFixed(1)} ms/frame`;
  });
  $('#glow').addEventListener('input', e => { S.view.baseAlpha = +e.target.value; });
  $('#btnHelp').addEventListener('click', () => $('#explainer').classList.add('open'));
  $('#btnCloseHelp').addEventListener('click', () => $('#explainer').classList.remove('open'));
  $('#explainer').addEventListener('click', e => { if (e.target.id === 'explainer') $('#explainer').classList.remove('open'); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') $('#explainer').classList.remove('open');
    if (e.key === ' ' && S.ready) { e.preventDefault(); setRunning(!S.running); }
  });

  $('#well').addEventListener('click', e => {
    const r = $('#well').getBoundingClientRect();
    const i = S.view.pick(e.clientX - r.left, e.clientY - r.top);
    showNeuron(i);
  });

  // legend
  const leg = $('#legend');
  S.meta.dicts.top_nt.forEach((n, i) => {
    const c = NT_COLOR[n] || NT_COLOR.unknown;
    const el = document.createElement('span');
    el.className = 'leg';
    el.innerHTML = `<i style="background:rgb(${c.map(x => Math.round(x * 255)).join(',')})"></i>${escapeHtml(NT_LABEL[n] || n)}`;
    leg.appendChild(el);
  });

  schedule();
}

function selectPreset(p) {
  document.querySelectorAll('.preset').forEach(b => b.classList.toggle('on', b.dataset.id === p.id));
  const idx = p._idx || resolvePreset(p, S.labels, S.meta.dicts);
  S.selected = idx;
  S.view.sel.fill(0);
  for (const i of idx) S.view.sel[i] = 1;
  S.view.uploadSel();
  S.spikeAccum.fill(0); S.ratesWindow.fill(0);
  S.view.act.fill(0); S.view.uploadAct();
  S.worker.postMessage({ cmd: 'stim', idx: Int32Array.from(idx) });
  $('#selName').textContent = p.name;
  $('#selWhy').textContent = p.why;
  $('#selCount').textContent = idx.length;
  const types = new Map();
  for (const i of idx) {
    const t = S.meta.dicts.cell_type[S.labels.cellType[i]];
    types.set(t, (types.get(t) || 0) + 1);
  }
  $('#selTypes').innerHTML = [...types.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([t, n]) => `<code>${escapeHtml(t)}</code><span>${n}</span>`).join('');
  setRunning(true);
}

function setRunning(on) {
  S.running = on;
  S.worker.postMessage({ cmd: 'run', on });
  $('#btnPlay').textContent = on ? 'Pause' : 'Run';
  $('#btnPlay').classList.toggle('on', on);
}

function showNeuron(i) {
  const box = $('#inspect');
  if (i < 0) { box.classList.remove('show'); return; }
  const d = S.meta.dicts, L = S.labels;
  const rootId = '—';
  box.classList.add('show');
  box.innerHTML = `
    <div class="ins-type">${escapeHtml(d.cell_type[L.cellType[i]])}</div>
    <dl>
      <dt>Region</dt><dd>${escapeHtml(d.super_class[L.superClass[i]])}</dd>
      <dt>Class</dt><dd>${escapeHtml(d.cell_class[L.cellClass[i]])}</dd>
      <dt>Transmitter</dt><dd>${escapeHtml(d.top_nt[L.nt[i]])}</dd>
      <dt>Side</dt><dd>${escapeHtml(d.side[L.side[i]])}</dd>
      <dt>Rate now</dt><dd class="num">${(S.ratesWindow[i] * 2).toFixed(0)} Hz</dd>
    </dl>`;
}

/* ---------------- frame loop ---------------- */
let last = performance.now(), fpsAcc = 0, fpsN = 0;
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.1); last = now;
  fpsAcc += dt; fpsN++;

  const act = S.view.act, sp = S.spikeAccum;
  const decay = Math.pow(0.02, dt);        // visible trail ~0.5 s
  for (let i = 0; i < act.length; i++) {
    const a = act[i] * decay;
    act[i] = sp[i] > a ? sp[i] : a;
    sp[i] = 0;
  }
  S.view.uploadAct();
  S.view.draw(dt);

  if (now - S.lastReadout > 220) { readout(now); S.lastReadout = now; }
  schedule();
}

function readout(now) {
  $('#statT').textContent = S.t.toFixed(1);
  $('#statActive').textContent = S.nActive.toLocaleString('en-US');
  $('#statSpikes').textContent = S.totalSpikes.toLocaleString('en-US');
  if (fpsAcc > 0) { $('#statFps').textContent = (fpsN / fpsAcc).toFixed(0); fpsAcc = 0; fpsN = 0; }

  // strongest responding cell types over the running window
  const d = S.meta.dicts, L = S.labels, rw = S.ratesWindow;
  const agg = new Map();
  const selSet = S.view.sel;
  for (let i = 0; i < rw.length; i++) {
    const r = rw[i];
    if (r < 1 || selSet[i]) continue;
    const k = L.cellType[i];
    const cur = agg.get(k);
    if (cur) { cur[0] += r; cur[1]++; }
    else agg.set(k, [r, 1, prettyClass(d, L, i)]);
  }
  const rows = [...agg.entries()].map(([k, [sum, n, cls]]) => [d.cell_type[k], sum, n, cls])
    .sort((a, b) => b[1] - a[1]).slice(0, 12);
  const max = rows.length ? rows[0][1] : 1;
  $('#respBody').innerHTML = rows.length ? rows.map(([t, sum, n, cls]) =>
    `<div class="resp"><span class="r-name">${escapeHtml(t)}<i>${escapeHtml(cls)}</i></span>
       <span class="r-bar"><i style="width:${Math.max(2, 100 * sum / max)}%"></i></span>
       <span class="r-n">${n}</span></div>`).join('')
    : `<p class="empty">Nothing downstream is firing yet.</p>`;
  $('#respCount').textContent = agg.size.toLocaleString('en-US');
  // slow leak so the window tracks the present
  for (let i = 0; i < rw.length; i++) rw[i] *= 0.86;
}

function prettyClass(d, L, i) {
  const sc = d.super_class[L.superClass[i]];
  const cc = d.cell_class[L.cellClass[i]];
  if (sc === 'motor') return 'motor neuron';
  if (sc === 'descending') return 'descending — to the body';
  if (sc === 'ascending') return 'ascending — from the body';
  if (sc === 'sensory') return cc && cc !== 'unknown' ? cc : 'sensory';
  if (sc === 'visual_projection') return 'visual projection';
  if (cc === 'brain_motor_neuron') return 'motor neuron';
  if (cc && cc !== 'unknown') return cc;
  return sc === 'unknown' ? '' : sc;
}

/* rAF while visible, timer while hidden, so a backgrounded tab keeps stepping */
function schedule() {
  if (document.hidden) setTimeout(() => loop(performance.now()), 120);
  else requestAnimationFrame(loop);
}

const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

boot();
