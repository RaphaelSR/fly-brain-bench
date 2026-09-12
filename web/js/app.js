import { fetchGz, decodeConnectome, decodePositions, decodeLabels } from './data.js';
import { BrainView } from './gl.js';
import { FlyView } from './fly.js';
import { Decoder, BEHAVIOURS } from './decoder.js';
import { PRESETS, TAG_ORDER, resolvePreset } from './presets.js';
import { LOCALES, detectLocale, setLocale, getLocale, t, applyDom } from './i18n.js';

const $ = s => document.querySelector(s);
const NT_COLOR = {
  acetylcholine: [0.96, 0.68, 0.26], gaba: [0.28, 0.58, 0.88],
  glutamate: [0.64, 0.45, 0.87], dopamine: [0.35, 0.78, 0.55],
  serotonin: [0.90, 0.45, 0.65], octopamine: [0.30, 0.78, 0.80],
  unknown: [0.45, 0.52, 0.55],
};
const CHAN_ORDER = ['walk', 'turn', 'stop', 'backward', 'escape', 'wing', 'landing', 'proboscis'];

const S = {
  meta: null, labels: null, view: null, fly: null, dec: null, channels: null,
  worker: null, selected: [], running: false, t: 0, nActive: 0, totalSpikes: 0,
  spikeAccum: null, winCount: null, hz: null, lastReadout: 0, ready: false,
  selKey: null, selVars: null, pickedBehaviour: 'walk', drive: null,
  regions: null, regionEls: null, showRegions: false, shareKey: null, flyPos: null,
};

/* ---------------- boot ---------------- */
const setStatus = (key, frac) => {
  $('#loadLabel').textContent = t(key);
  $('#loadLabel').dataset.i18n = key;
  $('#loadBar').style.width = `${Math.round(frac * 100)}%`;
  $('#loadPct').textContent = `${Math.round(frac * 100)}%`;
};
const yieldFrame = () => new Promise(r => setTimeout(r, 0));
const T = {}; const mark = k => { T[k] = performance.now(); };

/* ---------------- shareable state ---------------- */
function urlState() { return new URLSearchParams(location.search); }
function shareUrl() {
  const u = new URL(location.href);
  u.search = '';
  if (S.shareKey) u.searchParams.set(S.shareKey[0], S.shareKey[1]);
  u.searchParams.set('lang', getLocale());
  if (S.showRegions) u.searchParams.set('regions', '1');
  return u.toString();
}
function rememberUrl() {
  try { history.replaceState(null, '', shareUrl()); } catch (_) { /* file:// or blocked */ }
}

async function boot() {
  const qs = urlState();
  setLocale(LOCALES[qs.get('lang')] ? qs.get('lang') : detectLocale());
  buildLangPickers();
  applyDom();
  mark('t0');
  try {
    setStatus('boot.index', 0.01);
    const meta = JSON.parse(new TextDecoder().decode(await fetchGz('data/meta.json.gz')));
    S.meta = meta;
    const N = meta.n_neurons, E = meta.n_edges;

    setStatus('boot.positions', 0.06);
    const posRaw = await fetchGz('data/pos.u16.bin.gz', f => setStatus('boot.positions', 0.06 + f * 0.08));
    const { pos, radius } = decodePositions(posRaw, N, meta.bbox_lo, meta.span);

    setStatus('boot.annotations', 0.16);
    const labels = decodeLabels(await fetchGz('data/labels.bin.gz'), N);
    S.labels = labels;
    const signRaw = await fetchGz('data/sign.bin.gz');
    S.channels = await (await fetch('data/channels.json')).json();
    mark('assets');

    setStatus('boot.connections', 0.24);
    const connRaw = await fetchGz('data/conn.bin.gz', f => setStatus('boot.connections', 0.24 + f * 0.62));
    mark('gunzip');

    setStatus('boot.rebuild', 0.88);
    await yieldFrame();
    const conn = decodeConnectome(connRaw, N, E, signRaw);
    mark('decode');

    setStatus('boot.renderer', 0.95);
    await yieldFrame();
    S.view = new BrainView($('#well'), pos, labels.nt, radius);
    S.view.setNTColors(meta.dicts.top_nt.map(n => NT_COLOR[n] || NT_COLOR.unknown));
    try { S.fly = new FlyView($('#flywell')); } catch (e) { console.warn('fly view unavailable', e); }
    S.dec = new Decoder(S.channels.channels, S.channels.features);

    S.worker = new Worker('js/sim.worker.js');
    S.worker.onmessage = onWorker;
    S.worker.postMessage({ cmd: 'init', N, indptr: conn.indptr, indices: conn.indices, weights: conn.weights },
      [conn.indptr.buffer, conn.indices.buffer, conn.weights.buffer]);

    S.flyPos = pos;
    S.spikeAccum = new Float32Array(N);
    S.winCount = new Float32Array(N);
    S.hz = new Float32Array(N);
    buildUI();
    mark('ui');
    console.log('boot timing (ms):', { assets: (T.assets - T.t0) | 0, gunzipConn: (T.gunzip - T.assets) | 0,
      decodeConn: (T.decode - T.gunzip) | 0, ui: (T.ui - T.decode) | 0, total: (T.ui - T.t0) | 0 });
    setStatus('boot.ready', 1);
  } catch (err) {
    $('#loadLabel').textContent = t('boot.failed');
    $('#loadDetail').innerHTML = `<strong>${esc(err.message)}</strong><br>${t('boot.failhint')}`;
    $('#loadDetail').classList.add('err');
    console.error(err);
  }
}

function onWorker(ev) {
  const m = ev.data;
  if (m.type === 'ready') {
    S.ready = true;
    $('#boot').classList.add('done');
    setTimeout(() => $('#boot').remove(), 700);
    buildRegions(S.flyPos);
    const qs = urlState();
    S.showRegions = qs.get('regions') === '1';
    $('#regions').classList.toggle('on', S.showRegions);
    $('#btnRegions').classList.toggle('on', S.showRegions);
    const want = PRESETS.find(p => p.id === qs.get('stim'));
    const typeName = qs.get('type');
    if (typeName) {
      const ti = S.meta.dicts.cell_type.indexOf(typeName);
      if (ti >= 0) { driveType(ti, typeName, countType(ti)); setRunning(true); return; }
    }
    selectPreset(want || PRESETS[0]);
    setRunning(true);
    return;
  }
  if (m.type === 'frame') {
    const sp = m.spikes;
    for (let k = 0; k < sp.length; k++) { const i = sp[k]; S.spikeAccum[i] = 1; S.winCount[i]++; }
    S.t = m.t; S.nActive = m.nActive; S.totalSpikes = m.totalSpikes;
  }
}

/* ---------------- language ---------------- */
function buildLangPickers() {
  for (const id of ['#lang', '#langBoot']) {
    const sel = $(id); if (!sel) continue;
    sel.innerHTML = Object.keys(LOCALES)
      .map(c => `<option value="${c}">${LOCALES[c]['lang.name']}</option>`).join('');
    sel.value = getLocale();
    sel.addEventListener('change', () => switchLang(sel.value));
  }
}
function switchLang(code) {
  setLocale(code);
  rememberUrl();
  for (const id of ['#lang', '#langBoot']) { const s = $(id); if (s) s.value = code; }
  applyDom();
  relabel();
}
/* everything rendered from JS has to be redrawn when the language changes */
function relabel() {
  document.querySelectorAll('.preset').forEach(b => {
    const p = PRESETS.find(x => x.id === b.dataset.id);
    if (p) b.querySelector('.p-name').textContent = t(`preset.${p.id}.name`);
  });
  document.querySelectorAll('.lib-head').forEach(h => { h.textContent = t(`tag.${h.dataset.tag}`); });
  if (S.selKey) {
    $('#selName').textContent = S.selKey.literal || t(S.selKey.name, S.selVars);
    $('#selWhy').textContent = t(S.selKey.why, S.selVars);
  }
  buildLegend(); buildBehaviourPicker(); updateTrainUI(); paintInfo(); paintRegions();
  $('#btnRegions').title = t('ui.regions');
  $('#btnShare').title = t('ui.share');
  $('#btnPlay').textContent = t(S.running ? 'tp.pause' : 'tp.run');
  $('#speedOut').textContent = t('tp.perframe', { v: (+$('#speed').value * 0.1).toFixed(1) });
  const ld = $('#loadLabel'); if (ld && ld.dataset.i18n) ld.textContent = t(ld.dataset.i18n);
}

/* ---------------- ui ---------------- */
function buildUI() {
  const lib = $('#library');
  for (const tag of TAG_ORDER) {
    const group = PRESETS.filter(p => p.tag === tag);
    if (!group.length) continue;
    const h = document.createElement('div');
    h.className = 'lib-head'; h.dataset.tag = tag; h.textContent = t(`tag.${tag}`);
    lib.appendChild(h);
    for (const p of group) {
      const b = document.createElement('button');
      b.className = 'preset'; b.dataset.id = p.id;
      b.innerHTML = `<span class="p-name"></span><span class="p-count"></span>`;
      b.querySelector('.p-name').textContent = t(`preset.${p.id}.name`);
      b.addEventListener('click', () => selectPreset(p));
      lib.appendChild(b);
      p._idx = resolvePreset(p, S.labels, S.meta.dicts);
      b.querySelector('.p-count').textContent = p._idx.length;
      if (!p._idx.length) b.disabled = true;
    }
  }
  $('#btnPlay').addEventListener('click', () => setRunning(!S.running));
  $('#btnReset').addEventListener('click', () => {
    S.spikeAccum.fill(0); S.winCount.fill(0); S.hz.fill(0);
    S.view.act.fill(0); S.view.uploadAct();
    S.worker.postMessage({ cmd: 'reset' });
  });
  $('#speed').addEventListener('input', e => {
    S.worker.postMessage({ cmd: 'speed', value: +e.target.value });
    $('#speedOut').textContent = t('tp.perframe', { v: (+e.target.value * 0.1).toFixed(1) });
  });
  $('#glow').addEventListener('input', e => { S.view.baseAlpha = +e.target.value; });
  $('#btnHelp').addEventListener('click', () => $('#explainer').classList.add('open'));
  $('#btnCloseHelp').addEventListener('click', () => $('#explainer').classList.remove('open'));
  $('#explainer').addEventListener('click', e => { if (e.target.id === 'explainer') $('#explainer').classList.remove('open'); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') $('#explainer').classList.remove('open');
    if (e.key === ' ' && S.ready && e.target === document.body) { e.preventDefault(); setRunning(!S.running); }
  });
  $('#well').addEventListener('click', e => {
    const r = $('#well').getBoundingClientRect();
    showNeuron(S.view.pick(e.clientX - r.left, e.clientY - r.top));
  });
  $('#modeRules').addEventListener('click', () => setMode('rules'));
  $('#modeLearned').addEventListener('click', () => setMode('learned'));
  $('#btnTrain').addEventListener('click', doTrain);
  $('#btnClear').addEventListener('click', () => { S.dec.clear(); setMode('rules'); updateTrainUI(); });

  $('#btnRegions').addEventListener('click', () => {
    S.showRegions = !S.showRegions;
    $('#regions').classList.toggle('on', S.showRegions);
    $('#btnRegions').classList.toggle('on', S.showRegions);
    if (S.showRegions) placeRegions();
    rememberUrl();
  });
  $('#btnShare').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(shareUrl()); } catch (_) { /* denied */ }
    const b = $('#btnShare'); const old = b.textContent;
    b.textContent = t('ui.copied'); b.classList.add('ok');
    setTimeout(() => { b.textContent = old; b.classList.remove('ok'); }, 1600);
  });
  buildLegend(); buildChannels(); buildBehaviourPicker(); updateTrainUI(); bindInfo();
  $('#speedOut').textContent = t('tp.perframe', { v: (+$('#speed').value * 0.1).toFixed(1) });
  schedule();
}

function buildLegend() {
  const leg = $('#legend'); leg.innerHTML = '';
  S.meta.dicts.top_nt.forEach(n => {
    const c = NT_COLOR[n] || NT_COLOR.unknown;
    const el = document.createElement('span');
    el.className = 'leg';
    el.innerHTML = `<i style="background:rgb(${c.map(x => Math.round(x * 255)).join(',')})"></i>${esc(t('nt.' + n))}`;
    leg.appendChild(el);
  });
}

function buildChannels() {
  const box = $('#chanBody'); box.innerHTML = '';
  for (const k of CHAN_ORDER) {
    const c = S.channels.channels[k]; if (!c) continue;
    const row = document.createElement('div');
    row.className = 'chan'; row.dataset.k = k;
    row.innerHTML = `<span class="c-name">${esc(k)}<i>${esc((c.found || c.types).join(' '))}</i></span>
      <span class="c-bar"><em></em></span><span class="c-hz mono">0</span>`;
    box.appendChild(row);
  }
}

function buildBehaviourPicker() {
  const box = $('#behavePick'); box.innerHTML = '';
  for (const b of BEHAVIOURS) {
    const el = document.createElement('button');
    el.className = 'beh-btn' + (b === S.pickedBehaviour ? ' on' : '');
    el.textContent = t('behave.' + (b === 'rest' ? 'rest' : b));
    el.addEventListener('click', () => {
      S.pickedBehaviour = b;
      if (S.hz) S.dec.capture(S.hz, b);
      buildBehaviourPicker(); updateTrainUI();
    });
    box.appendChild(el);
  }
}

function updateTrainUI() {
  const n = S.dec ? S.dec.samples.length : 0;
  const counts = S.dec ? S.dec.labelCounts() : {};
  const classes = Object.keys(counts).length;
  $('#btnTrain').textContent = t('train.trainBtn', { n });
  $('#btnTrain').disabled = classes < 2;
  const parts = Object.entries(counts).map(([k, v]) => `${t('behave.' + k)} ${v}`).join(' · ');
  $('#trainStat').textContent = classes < 2 ? t('train.need') : parts;
  $('#modeLearned').disabled = !S.dec || !S.dec.model;
  $('#modeRules').classList.toggle('on', !S.dec || S.dec.mode === 'rules');
  $('#modeLearned').classList.toggle('on', S.dec && S.dec.mode === 'learned');
}

function setMode(m) {
  if (m === 'learned' && (!S.dec || !S.dec.model)) return;
  S.dec.mode = m; updateTrainUI();
}

function doTrain() {
  $('#btnTrain').textContent = t('train.training');
  setTimeout(() => {
    const r = S.dec.train();
    if (r) { setMode('learned'); $('#trainStat').textContent = t('train.acc', { p: Math.round(r.accuracy * 100) }); }
    updateTrainUI();
    if (r) $('#trainStat').textContent = t('train.acc', { p: Math.round(r.accuracy * 100) });
  }, 30);
}

function selectPreset(p) {
  document.querySelectorAll('.preset').forEach(b => b.classList.toggle('on', b.dataset.id === p.id));
  S.shareKey = ['stim', p.id];
  applyStimulus(p._idx || resolvePreset(p, S.labels, S.meta.dicts),
    { name: `preset.${p.id}.name`, why: `preset.${p.id}.why` }, null);
}

function applyStimulus(idx, keys, vars) {
  if (!idx.length) return;
  S.selected = idx; S.selKey = keys; S.selVars = vars;
  S.view.sel.fill(0);
  for (const i of idx) S.view.sel[i] = 1;
  S.view.uploadSel();
  S.spikeAccum.fill(0); S.winCount.fill(0); S.hz.fill(0);
  S.view.act.fill(0); S.view.uploadAct();
  S.worker.postMessage({ cmd: 'stim', idx: Int32Array.from(idx) });
  $('#selName').textContent = keys.literal || t(keys.name, vars);
  $('#selWhy').textContent = t(keys.why, vars);
  $('#selMeta').innerHTML = t('rail.atrate', { n: idx.length });
  rememberUrl();
  setRunning(true);
}

function setRunning(on) {
  S.running = on;
  S.worker.postMessage({ cmd: 'run', on });
  $('#btnPlay').textContent = t(on ? 'tp.pause' : 'tp.run');
  $('#btnPlay').classList.toggle('on', on);
}

let rootIdsPromise = null;
const rootIds = () => (rootIdsPromise ||= fetchGz('data/rootids.bin.gz')
  .then(b => new BigUint64Array(b.buffer, b.byteOffset, S.meta.n_neurons)).catch(() => null));

function showNeuron(i) {
  const box = $('#inspect');
  if (i < 0) { box.classList.remove('show'); return; }
  const d = S.meta.dicts, L = S.labels;
  const type = d.cell_type[L.cellType[i]];
  const n = countType(L.cellType[i]);
  box.classList.add('show');
  box.innerHTML = `
    <div class="ins-type">${esc(type)}</div>
    <dl>
      <dt>${t('ins.region')}</dt><dd>${esc(d.super_class[L.superClass[i]])}</dd>
      <dt>${t('ins.class')}</dt><dd>${esc(d.cell_class[L.cellClass[i]])}</dd>
      <dt>${t('ins.nt')}</dt><dd>${esc(d.top_nt[L.nt[i]])}</dd>
      <dt>${t('ins.side')}</dt><dd>${esc(d.side[L.side[i]])}</dd>
      <dt>${t('ins.rate')}</dt><dd class="num">${S.hz[i].toFixed(0)} Hz</dd>
    </dl>
    <button class="ins-go" id="insDrive">${n === 1 ? t('ins.driveOne', { t: type }) : t('ins.driveMany', { n, t: type })}</button>
    <a class="ins-link" id="insCodex" target="_blank" rel="noopener">${t('ins.codex')}</a>`;
  $('#insDrive').addEventListener('click', () => driveType(L.cellType[i], type, n));
  rootIds().then(ids => {
    const a = $('#insCodex'); if (!a) return;
    if (!ids) { a.remove(); return; }
    a.href = `https://codex.flywire.ai/app/cell_details?root_id=${ids[i].toString()}`;
  });
}
function countType(ti) {
  if (!S.typeTally) {
    S.typeTally = new Int32Array(S.meta.dicts.cell_type.length);
    const ct = S.labels.cellType;
    for (let k = 0; k < ct.length; k++) S.typeTally[ct[k]]++;
  }
  return S.typeTally[ti];
}
function driveType(ti, name, n) {
  const ct = S.labels.cellType, idx = [];
  for (let k = 0; k < ct.length; k++) if (ct[k] === ti) idx.push(k);
  document.querySelectorAll('.preset').forEach(b => b.classList.remove('on'));
  S.shareKey = ['type', name];
  applyStimulus(idx, { literal: name, why: n === 1 ? 'ins.customOne' : 'ins.customMany' }, { n, t: name });
  $('#inspect').classList.remove('show');
}

/* ---------------- anatomical regions ---------------- */
/* Each label sits at the centre of mass of a real annotated population, so it
   tracks the brain as you turn it. */
const REGIONS = [
  { key: 'region.optic',   pick: (d, L, i) => d.super_class[L.superClass[i]] === 'optic' && d.side[L.side[i]] === 'left' },
  { key: 'region.optic',   pick: (d, L, i) => d.super_class[L.superClass[i]] === 'optic' && d.side[L.side[i]] === 'right' },
  { key: 'region.central', pick: (d, L, i) => d.super_class[L.superClass[i]] === 'central' },
  { key: 'region.sez',     pick: (d, L, i) => d.cell_class[L.cellClass[i]] === 'gustatory' },
  { key: 'region.al',      pick: (d, L, i) => d.cell_class[L.cellClass[i]] === 'ALPN' },
  { key: 'region.mb',      pick: (d, L, i) => d.cell_class[L.cellClass[i]] === 'Kenyon_Cell' },
  { key: 'region.cx',      pick: (d, L, i) => d.cell_class[L.cellClass[i]] === 'CX' },
  { key: 'region.dn',      pick: (d, L, i) => d.super_class[L.superClass[i]] === 'descending' },
];

function buildRegions(pos) {
  const d = S.meta.dicts, L = S.labels;
  S.regions = REGIONS.map(r => {
    let n = 0, x = 0, y = 0, z = 0;
    for (let i = 0; i < L.cellType.length; i++) {
      if (!r.pick(d, L, i)) continue;
      x += pos[i*3]; y += pos[i*3+1]; z += pos[i*3+2]; n++;
    }
    return n ? { key: r.key, n, p: [x/n, y/n, z/n] } : null;
  }).filter(Boolean);
  const box = $('#regions');
  box.innerHTML = S.regions.map((_, i) => `<span class="reg" data-i="${i}"></span>`).join('');
  S.regionEls = [...box.querySelectorAll('.reg')];
  paintRegions();
}
function paintRegions() {
  if (!S.regions) return;
  S.regions.forEach((r, i) => { S.regionEls[i].textContent = t(r.key); });
}
function placeRegions() {
  if (!S.regions || !S.showRegions) return;
  // project, then greedily drop labels that would land on one already placed —
  // nearer ones win, so the front of the brain stays readable
  const cand = [];
  for (let i = 0; i < S.regions.length; i++) {
    const p = S.view.project(S.regions[i].p);
    if (p) cand.push({ i, x: p[0], y: p[1], d: p[2] });
    else S.regionEls[i].style.opacity = '0';
  }
  cand.sort((a, b) => a.d - b.d);
  const placed = [];
  for (const c of cand) {
    const el = S.regionEls[c.i];
    const w = el.offsetWidth || 90, h = 15;
    const clash = placed.some(q => Math.abs(q.x - c.x) < (q.w + w) / 2 + 4 && Math.abs(q.y - c.y) < h + 3);
    if (clash) { el.style.opacity = '0'; continue; }
    placed.push({ x: c.x, y: c.y, w });
    el.style.transform = `translate(${c.x.toFixed(0)}px, ${c.y.toFixed(0)}px)`;
    el.style.opacity = '1';
  }
}

/* ---------------- info popovers ---------------- */
function bindInfo() {
  if (bindInfo.done) return;          // delegated once; re-binding would stack handlers
  bindInfo.done = true;
  const pop = $('#infoPop');
  const close = () => {
    pop.classList.remove('open');
    document.querySelectorAll('.info.on').forEach(b => b.classList.remove('on'));
  };
  document.addEventListener('click', e => {
    const btn = e.target.closest('.info');
    if (!btn) { if (!e.target.closest('#infoPop')) close(); return; }
    const wasOpen = btn.classList.contains('on');
    close();
    if (wasOpen) return;
    btn.classList.add('on');
    pop.dataset.key = btn.dataset.info;
    paintInfo();
    pop.classList.add('open');
    pop.style.visibility = 'hidden'; pop.style.left = '0px'; pop.style.top = '0px';
    const r = btn.getBoundingClientRect(), pr = pop.getBoundingClientRect();
    const x = Math.min(Math.max(8, r.left + r.width / 2 - pr.width / 2), innerWidth - pr.width - 8);
    let y = r.bottom + 8;
    if (y + pr.height > innerHeight - 8) y = Math.max(8, r.top - pr.height - 8);
    pop.style.left = `${Math.round(x)}px`; pop.style.top = `${Math.round(y)}px`;
    pop.style.visibility = '';
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
}

function paintInfo() {
  const pop = $('#infoPop');
  if (!pop || !pop.dataset.key) return;
  pop.querySelector('h4').textContent = t(`info.${pop.dataset.key}.t`);
  pop.querySelector('p').textContent = t(`info.${pop.dataset.key}.b`);
}

/* ---------------- frame loop ---------------- */
let last = performance.now(), fpsAcc = 0, fpsN = 0;
function loop(now) {
  const dt = Math.min((now - last) / 1000, 0.1); last = now;
  fpsAcc += dt; fpsN++;

  const act = S.view.act, sp = S.spikeAccum;
  const decay = Math.pow(0.02, dt);
  for (let i = 0; i < act.length; i++) {
    const a = act[i] * decay;
    act[i] = sp[i] > a ? sp[i] : a;
    sp[i] = 0;
  }
  S.view.uploadAct();
  S.view.draw(dt);
  placeRegions();

  if (S.fly) { S.fly.update(S.drive || {}, dt); S.fly.draw(); }
  if (now - S.lastReadout > 200) { readout(now); S.lastReadout = now; }
  schedule();
}
function schedule() {
  if (document.hidden) setTimeout(() => loop(performance.now()), 120);
  else requestAnimationFrame(loop);
}

function readout(now) {
  const dtSec = S.lastReadout ? Math.min(Math.max((now - S.lastReadout) / 1000, 0.05), 1.0) : 0.2;
  $('#statT').textContent = S.t.toFixed(1);
  $('#statActive').textContent = S.nActive.toLocaleString(getLocale());
  $('#statSpikes').textContent = S.totalSpikes.toLocaleString(getLocale());
  if (fpsAcc > 0) { $('#statFps').textContent = (fpsN / fpsAcc).toFixed(0); fpsAcc = 0; fpsN = 0; }

  // firing rate in Hz, smoothed, then reset the window
  const hz = S.hz, wc = S.winCount;
  for (let i = 0; i < hz.length; i++) { hz[i] += ((wc[i] / dtSec) - hz[i]) * 0.45; wc[i] = 0; }

  // body
  if (S.dec) {
    const d = S.dec.decode(hz);
    S.drive = d;
    const label = d._label || dominant(d);
    $('#behaveNow').textContent = t('behave.' + label);
    for (const k of CHAN_ORDER) {
      const row = document.querySelector(`.chan[data-k="${k}"]`); if (!row) continue;
      const v = S.dec.chanRate(hz, k);
      row.querySelector('em').style.width = `${Math.min(100, v * 7).toFixed(0)}%`;
      row.querySelector('.c-hz').textContent = v.toFixed(0);
    }
  }

  // strongest responding cell types
  const d = S.meta.dicts, L = S.labels, sel = S.view.sel;
  const agg = new Map();
  for (let i = 0; i < hz.length; i++) {
    const r = hz[i];
    if (r < 1 || sel[i]) continue;
    const k = L.cellType[i], cur = agg.get(k);
    if (cur) { cur[0] += r; cur[1]++; } else agg.set(k, [r, 1, prettyClass(d, L, i)]);
  }
  const rows = [...agg.entries()].map(([k, [sum, n, cls]]) => [d.cell_type[k], sum, n, cls])
    .sort((a, b) => b[1] - a[1]).slice(0, 10);
  const max = rows.length ? rows[0][1] : 1;
  $('#respBody').innerHTML = rows.length ? rows.map(([ty, sum, n, cls]) =>
    `<div class="resp"><span class="r-name">${esc(ty)}<i>${esc(cls)}</i></span>
       <span class="r-bar"><i style="width:${Math.max(2, 100 * sum / max)}%"></i></span>
       <span class="r-n">${n}</span></div>`).join('')
    : `<p class="empty">${t('rail.empty')}</p>`;
  $('#respCount').textContent = agg.size.toLocaleString(getLocale());
}

function dominant(d) {
  if (d.escape > 0.4) return 'escape';
  if (d.proboscis > 0.35) return 'feed';
  if (d.stop > 0.45) return 'stop';
  if (d.backward > 0.3) return 'backward';
  if (d.turn < -0.18) return 'turnL';
  if (d.turn > 0.18) return 'turnR';
  if (d.walk > 0.2) return 'walk';
  return 'rest';
}
function prettyClass(d, L, i) {
  const sc = d.super_class[L.superClass[i]], cc = d.cell_class[L.cellClass[i]];
  if (sc === 'motor' || cc === 'brain_motor_neuron') return 'motor neuron';
  if (sc === 'descending') return 'descending';
  if (sc === 'ascending') return 'ascending';
  if (sc === 'sensory') return cc && cc !== 'unknown' ? cc : 'sensory';
  if (sc === 'visual_projection') return 'visual projection';
  if (cc && cc !== 'unknown') return cc;
  return sc === 'unknown' ? '' : sc;
}
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

window.bench = S;
boot();
