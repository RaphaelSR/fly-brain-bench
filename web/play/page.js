import * as THREE from '../vendor/three/three.module.min.js';
import { Arena3D } from '../defend/arena3d.js?v=play1';
import { bindSceneLayout } from '../defend/scene-layout.js';
import { BrainView } from '../js/gl.js';
import { BrainInspector } from '../defend/brain-inspector.js?v=play1';
import { fetchGz, decodeLabels, decodePositions, decodeConnectome } from '../js/data.js';
import { detectLocale, setLocale, getLocale, applyDom } from '../js/i18n.js';
import { sampleEpisode } from '../defend/live.js';
import { PlayStore, validateSave } from './storage.js';
import { Policy } from '../defend/policy.js';
import { PROTOCOL, packPolicy } from './core.js';
import { makeShot, traceShot } from './physics.js';
import { COPY } from './copy.js';

const $ = id => document.getElementById(id), c = key => COPY[getLocale()][key];
const label = (id, value) => { const el = $(id), text = String(value); if (el.textContent !== text) el.textContent = text; };
const seed = () => crypto.getRandomValues(new Uint32Array(1))[0];
setLocale(new URLSearchParams(location.search).get('lang') || detectLocale());
let state, previous, received = 0, running = false, entered = false, busy = false, throwing = false, restoring = false;
let renderer, brain, inspector, store, saved, pretrained, hasSaved = false, saveFailed = false;
let trace, ring, lastPhase, lastSignal = -1, recording = [], lastReplay = null, replay = null;
let saveQueue = Promise.resolve(), sequence = 0, lastTime = 0, lastStep = 0;
const worker = new Worker(new URL('./play.worker.js', import.meta.url), { type: 'module' });
const requests = new Map();
worker.onmessage = ({ data }) => {
  const pending = requests.get(data.id);
  if (!pending) return;
  requests.delete(data.id);
  if (data.error) pending.reject(new Error(data.error)); else pending.resolve(data);
};
worker.onerror = e => { for (const pending of requests.values()) pending.reject(new Error(e.message)); requests.clear(); fail(); };
function request(type, options = {}) {
  return new Promise((resolve, reject) => {
    const id = ++sequence; requests.set(id, { resolve, reject }); worker.postMessage({ id, type, ...options });
  });
}
const fresh = policy => ({ protocol: PROTOCOL, policy: structuredClone(policy), stats: { throws: 0, hits: 0, dodges: 0, misses: 0 } });
function fail(saving = false) {
  running = false; saveFailed ||= saving;
  $('error').hidden = false; $('error').textContent = c(saving ? 'saveError' : 'error'); paint();
}
function persist(data, replace = false) {
  saved = data;
  saveQueue = saveQueue.then(async () => {
    try {
      if (!store) throw new Error('Storage unavailable');
      await store.save(data, { replace }); hasSaved = true; saveFailed = false; $('error').hidden = true;
    } catch { fail(true); }
    paint();
  });
  return saveQueue;
}
function accept(response, initial = false) {
  previous = state; state = response.state; received = performance.now();
  if (initial) saved = response.save; else if (response.save) persist(response.save);
  if (state.phase === 'flight') recording.push(structuredClone(state.frame));
  if (state.phase === 'result' && previous?.phase === 'flight') {
    recording.push(structuredClone(state.frame));
    lastReplay = { frames: recording, episode: structuredClone(state.episode) };
  }
  if (state.phase !== lastPhase) {
    if (state.phase === 'aim' || state.phase === 'flight') renderer.reset();
    if (state.phase === 'aim') updateAim();
    lastPhase = state.phase;
  }
  if (brain && state.signal?.id !== lastSignal && state.signal?.snap) {
    lastSignal = state.signal.id;
    brain.act.fill(0);
    const snap = state.signal.snap;
    for (let j = 0; j < snap.i.length; j++) brain.act[snap.i[j]] = snap.v[j] / 255;
    brain.uploadAct(); $('mActive').textContent = snap.i.length.toLocaleString(getLocale());
  }
  paint();
}
function parameters() {
  const base = Math.atan2(state.home.x - state.origin.x, state.home.z - state.origin.z);
  const angle = base + Number($('direction').value) * Math.PI / 180;
  return { aim: { x: Math.max(-16, Math.min(16, state.origin.x + Math.sin(angle) * 9)),
    z: Math.max(-16, Math.min(16, state.origin.z + Math.cos(angle) * 9)) },
    power: Number($('power').value), elevation: Number($('elevation').value) };
}
function updateAim() {
  for (const id of ['direction', 'power', 'elevation']) $(id + 'Value').textContent = $(id).value + (id === 'power' ? '%' : '°');
  if (!state || !trace) return;
  const p = parameters(), points = traceShot(makeShot(state.origin, p.aim, p.power, p.elevation)).points;
  trace.geometry.dispose();
  const path = new THREE.CurvePath();
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    path.add(new THREE.LineCurve3(new THREE.Vector3(a.x, a.y + 0.04, a.z), new THREE.Vector3(b.x, b.y + 0.04, b.z)));
  }
  trace.geometry = new THREE.TubeGeometry(path, 216, 0.025, 5, false);
  const end = points.at(-1); ring.position.set(end.x, end.y + 0.08, end.z);
}
function paint() {
  if (!state) return;
  const aiming = state.phase === 'aim' && !replay && !throwing && !restoring;
  $('btnThrow').disabled = !entered || !running || !aiming;
  for (const id of ['direction', 'power', 'elevation', 'learning', 'reset', 'blank', 'import']) $(id).disabled = !aiming;
  $('btnReplay').disabled = !lastReplay || !aiming;
  const playing = replay ? !replay.paused : running;
  label('btnPlay', c(playing ? 'pause' : 'resume'));
  label('phase', c(!playing ? 'paused' : replay ? 'replaying' : state.phase));
  label('roundLabel', `${c('attempts')} ${state.stats.throws + (state.phase === 'flight' ? 1 : 0)}`);
  label('roundScore', ['hits', 'dodges', 'misses'].map(key => `${c(key)}: ${state.stats[key]}`).join(' · '));
  label('roundOutcome', state.result ? c(state.result.kind) : '');
  for (const id of ['hits', 'dodges', 'misses']) label(id, state.stats[id]);
  label('trained', state.trained.toLocaleString(getLocale()));
  label('saveStatus', c(saveFailed ? 'saveError' : hasSaved ? 'saved' : 'ephemeral'));
  label('outcome', c(state.result?.kind || 'waiting'));
  label('reward', state.result ? `${c('reward')}: ${state.result.reward > 0 ? '+' : ''}${state.result.reward} · ${c(state.result.learned ? 'learned' : 'frozen')}` : '');
  if (trace) trace.visible = ring.visible = aiming;
  document.querySelector('.aim-hint').hidden = !aiming;
}
function translate() {
  applyDom();
  for (const el of document.querySelectorAll('[data-copy]')) el.textContent = c(el.dataset.copy);
  $('lang').value = getLocale(); document.title = `Fly Brain · ${c('title')}`;
  $('labLink').href = `../defend/?lang=${getLocale()}`;
  $('loading').textContent = c($('enter').disabled ? 'loading' : 'ready');
  inspector?.relabel(); updateAim(); paint();
}
async function throwSlipper() {
  if (!running || state?.phase !== 'aim' || replay || throwing || restoring) return;
  throwing = true; recording = []; paint();
  try { accept(await request('throw', { parameters: parameters(), learning: $('learning').checked })); }
  catch { fail(); } finally { throwing = false; paint(); }
}
async function replace(data) {
  if (state?.phase !== 'aim' || throwing || restoring || replay) return;
  const wasRunning = running; running = false; restoring = true; paint();
  try {
    await saveQueue;
    const response = await request('restore', { saved: validateSave(data), seed: seed() });
    accept(response, true); await persist(response.save, true);
    lastReplay = null; lastSignal = -1; brain.act.fill(0); brain.uploadAct(); $('mActive').textContent = '';
    running = wasRunning && !saveFailed;
  } catch { fail(); } finally { restoring = false; paint(); }
}
function exportBackup() {
  if (!saved) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(saved)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = 'fly-play-backup.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function animate(now) {
  const dt = Math.min(0.05, Math.max(0, (now - lastTime) / 1000)); lastTime = now;
  if (entered && state && !document.hidden) {
    if (running && !busy && !replay && !throwing && !restoring && now - lastStep >= 45) {
      busy = true; lastStep = now;
      request('step', { ticks: 6 }).then(accept).catch(() => fail()).finally(() => { busy = false; });
    }
    let frame = state.frame, episode = state.episode;
    if (replay) {
      if (!replay.paused) replay.time += dt;
      frame = sampleEpisode(lastReplay, replay.time); episode = lastReplay.episode;
      if (replay.time >= lastReplay.frames.at(-1).t) { replay = null; renderer.reset(); paint(); }
    } else if (previous?.phase === state.phase && state.frame.t >= previous.frame.t) {
      const u = Math.min(1, (now - received) / 50);
      frame = sampleEpisode({ frames: [previous.frame, state.frame] }, previous.frame.t + (state.frame.t - previous.frame.t) * u);
    }
    const aiming = state.phase === 'aim' && !replay;
    if (aiming) {
      const p = parameters(), shot = makeShot(state.origin, p.aim, p.power, p.elevation);
      frame = { ...frame, t: 0, projectile: { ...state.origin, yaw: shot.angle } };
      episode = { launch: state.origin, angle: shot.angle, approach: 1.8, contactAt: null, frames: [] };
    }
    const framing = aiming || !$('cinematic').checked ? {
      target: new THREE.Vector3(state.home.x + 0.5, 0.65, state.home.z + 0.8), distance: 15, pitch: 0.78, yaw: 0.57,
    } : null;
    const playing = replay ? !replay.paused : running;
    renderer.drawLive(frame, episode, playing ? dt : 0, $('cinematic').checked, framing);
    if (brain && !$('sceneDialog').open) { brain.draw(dt); inspector.draw(); }
  }
  requestAnimationFrame(animate);
}
function bindAim() {
  const canvas = $('scene');
  for (const [event, fn] of Object.entries(renderer.view.handlers)) canvas.removeEventListener(event, fn);
  let pointer = null;
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), point = new THREE.Vector3();
  const aim = e => {
    if (state?.phase !== 'aim' || replay || throwing || restoring) return;
    const rect = canvas.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2((e.clientX - rect.left) / rect.width * 2 - 1, 1 - (e.clientY - rect.top) / rect.height * 2), renderer.view.camera);
    if (!ray.ray.intersectPlane(plane, point)) return;
    const bearing = Math.atan2(point.x - state.origin.x, point.z - state.origin.z);
    const base = Math.atan2(state.home.x - state.origin.x, state.home.z - state.origin.z);
    const delta = Math.atan2(Math.sin(bearing - base), Math.cos(bearing - base)) * 180 / Math.PI;
    $('direction').value = Math.round(Math.max(-65, Math.min(65, delta))); updateAim();
  };
  canvas.addEventListener('pointerdown', e => {
    if (e.button !== 0 || pointer !== null) return;
    pointer = e.pointerId; canvas.setPointerCapture(pointer); aim(e);
  });
  canvas.addEventListener('pointermove', e => { if (e.pointerId === pointer) aim(e); });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, () => { pointer = null; });
}

translate(); $('intro').showModal(); bindSceneLayout();
$('lang').addEventListener('change', () => {
  setLocale($('lang').value);
  const url = new URL(location.href); url.searchParams.set('lang', getLocale()); history.replaceState(null, '', url);
  translate();
});
for (const id of ['direction', 'power', 'elevation']) $(id).addEventListener('input', updateAim);
$('btnThrow').addEventListener('click', throwSlipper);
$('btnPlay').addEventListener('click', () => { if (replay) replay.paused = !replay.paused; else running = !running; paint(); });
$('btnReplay').addEventListener('click', () => {
  if (!lastReplay || state.phase !== 'aim' || restoring || throwing) return;
  replay = { time: lastReplay.frames[0].t, paused: false }; renderer.reset(); paint();
});
$('intense').addEventListener('change', () => { renderer.intense = $('intense').checked; });
$('export').addEventListener('click', exportBackup);
$('reset').addEventListener('click', () => { if (confirm(c('confirmReset'))) replace(fresh(pretrained.policy)); });
$('blank').addEventListener('click', () => { if (confirm(c('confirmReset'))) replace(fresh(packPolicy(new Policy(57, 8)))); });
$('import').addEventListener('change', async () => {
  try {
    const file = $('import').files[0]; if (!file) return;
    if (file.size > 200000) throw new Error('Oversized backup');
    const data = validateSave(JSON.parse(await file.text()));
    if (confirm(c('confirmImport'))) await replace(data);
  } catch { fail(); } finally { $('import').value = ''; }
});
$('intro').addEventListener('cancel', e => e.preventDefault());
$('enter').addEventListener('click', () => { entered = true; running = !saveFailed; $('intro').close(); $('btnSceneFull').focus({ preventScroll: true }); paint(); });
document.addEventListener('visibilitychange', () => { previous = null; lastStep = performance.now(); });

try {
  renderer = new Arena3D($('scene'));
  trace = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0xeb9a24, transparent: true, opacity: 0.95, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
  trace.renderOrder = 10; renderer.view.scene.add(trace);
  ring = new THREE.Mesh(new THREE.RingGeometry(0.16, 0.22, 32), new THREE.MeshBasicMaterial({ color: 0xeb9a24, side: THREE.DoubleSide, transparent: true, depthTest: false, depthWrite: false, fog: false, toneMapped: false }));
  ring.rotation.x = -Math.PI / 2; ring.renderOrder = 11; renderer.view.scene.add(ring); bindAim();
  let local = null;
  try { store = new PlayStore(localStorage); local = store.load(); hasSaved = !!local; } catch { saveFailed = true; }
  const response = await fetch('pretrained.json'); if (!response.ok) throw new Error('Missing pretrained policy');
  pretrained = await response.json(); validateSave(fresh(pretrained.policy));
  accept(await request('init', { seed: seed(), saved: local || fresh(pretrained.policy) }), true);
  const [m, l, p, b, s] = await Promise.all(['meta.json.gz', 'labels.bin.gz', 'pos.u16.bin.gz', 'conn.bin.gz', 'sign.bin.gz'].map(name => fetchGz('../defend/data/' + name)));
  const meta = JSON.parse(new TextDecoder().decode(m)), n = meta.n_neurons;
  const labels = decodeLabels(l, n), geom = decodePositions(p, n, meta.bbox_lo, meta.span);
  brain = new BrainView($('brain'), geom.pos, labels.nt, geom.radius);
  const colors = { acetylcholine: [0.96, 0.68, 0.26], gaba: [0.28, 0.58, 0.88], glutamate: [0.64, 0.45, 0.87], dopamine: [0.35, 0.78, 0.55], serotonin: [0.90, 0.45, 0.65], octopamine: [0.30, 0.78, 0.80], unknown: [0.45, 0.52, 0.55] };
  brain.setNTColors(meta.dicts.top_nt.map(name => colors[name] || colors.unknown));
  inspector = new BrainInspector(brain, meta, labels, decodeConnectome(b, n, meta.n_edges, s));
  $('cinematic').checked = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  $('enter').disabled = false; translate(); requestAnimationFrame(animate);
} catch { $('loading').textContent = c('error'); }
