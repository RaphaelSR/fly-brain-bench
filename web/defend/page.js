import { Defender, Glancer, Policy, Threat, ArenaView, BrainView, ACTIONS } from './defend.js';

const $ = s => document.querySelector(s);
const SAVE = 'bench.defend.v1';
const NT_COLOUR = {
  acetylcholine: [0.96, 0.68, 0.26], gaba: [0.28, 0.58, 0.88],
  glutamate: [0.64, 0.45, 0.87], dopamine: [0.35, 0.78, 0.55],
  serotonin: [0.90, 0.45, 0.65], octopamine: [0.30, 0.78, 0.80],
  unknown: [0.45, 0.52, 0.55],
};
const INFO = {
  arc: ['Watching her get it',
    'One square per episode: red where the threat reached her, green where it did not. She starts with no idea — the policy is all zeros, so she picks at random and mostly gets hit. The row turning green is the whole point of this page. Nothing about her brain changes; what learns is a readout on top of it, because a connectome records wiring and not plasticity.'],
  gf: ['DNp01, the giant fibre',
    'A real fly has one pair of these, and a single spike in them launches the escape. Here it is driven by LPLC2, the looming detectors, which fire when something expands in the visual field. Both are in the connectome and neither is scripted — the bar is their measured firing rate. The eye meters show how hard each side is being driven, which is what gives her any idea of direction.'],
  brain: ['All 138,639 of them',
    'Every neuron in the simulation at its real coordinate, coloured by the transmitter it releases. Amber excites, blue and violet inhibit. Watch the looming detectors flare in one optic lobe as a threat closes, and the wave run inward to the descending neurons.'],
};

const S = {
  brain: null, glance: null, pol: null, arena: null, brainView: null,
  threats: [], heading: 0, airborne: 0, ep: [], steps: [], hitsThisEp: 0,
  training: false, speed: 2, last: 0, epStart: 0, verdict: '', verdictT: 0,
  loom: { l: 0, r: 0 },
};

async function boot() {
  const step = (k, f) => {
    $('#loadLabel').textContent = { annotations: 'Reading cell types', positions: 'Placing neurons',
      connections: 'Loading 2.7 million connections', rebuild: 'Wiring her up' }[k] || 'Starting';
    $('#loadBar').style.width = `${Math.round(f * 100)}%`;
  };
  try {
    S.brain = new Defender();
    await new Promise((res, rej) => { S.brain.onReady = res; S.brain.load(step).catch(rej); });
    S.glance = new Glancer(S.brain);
    S.pol = new Policy(S.brain.featIdx.length);
    S.arena = new ArenaView($('#arena'));
    S.brainView = new BrainView($('#brain'), S.brain.geom.pos, S.brain.labels.nt, S.brain.geom.radius);
    S.brainView.setNTColors(S.brain.meta.dicts.top_nt.map(n => NT_COLOUR[n] || NT_COLOUR.unknown));
    S.brainView.baseAlpha = 0.18;
    restore();
    wire();
    newEpisode();
    $('#boot').classList.add('done');
    setTimeout(() => $('#boot').remove(), 600);
    S.last = performance.now();
    schedule();
  } catch (err) {
    $('#loadLabel').textContent = 'Could not start';
    $('#loadDetail').innerHTML = `<strong>${esc(err.message)}</strong><br>Needs WebGL2 and an http origin.`;
    $('#loadDetail').classList.add('err');
    console.error(err);
  }
}

function wire() {
  $('#btnTrain').addEventListener('click', () => {
    S.training = !S.training;
    $('#btnTrain').textContent = S.training ? 'Pause' : 'Train';
  });
  $('#btnReset').addEventListener('click', () => {
    S.pol.forget(); S.ep = []; save(); paintStrip(); newEpisode();
  });
  $('#speed').addEventListener('input', e => {
    S.speed = +e.target.value;
    $('#speedOut').textContent = `${S.speed}×`;
  });
  document.addEventListener('click', e => {
    const b = e.target.closest('.info'), pop = $('#infoPop');
    if (!b) { if (!e.target.closest('#infoPop')) pop.classList.remove('open'); return; }
    if (pop.classList.contains('open') && pop.dataset.k === b.dataset.info) { pop.classList.remove('open'); return; }
    pop.dataset.k = b.dataset.info;
    const [h, p] = INFO[b.dataset.info];
    pop.querySelector('h4').textContent = h;
    pop.querySelector('p').textContent = p;
    pop.classList.add('open');
    const r = b.getBoundingClientRect();
    pop.style.visibility = 'hidden'; pop.style.left = '0'; pop.style.top = '0';
    const pr = pop.getBoundingClientRect();
    pop.style.left = `${Math.round(Math.min(Math.max(8, r.left + r.width / 2 - pr.width / 2), innerWidth - pr.width - 8))}px`;
    pop.style.top = `${Math.round(r.bottom + 8 + pr.height > innerHeight - 8 ? Math.max(8, r.top - pr.height - 8) : r.bottom + 8)}px`;
    pop.style.visibility = '';
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') $('#infoPop').classList.remove('open'); });
}

/* ---------------- episode ---------------- */
function newEpisode() {
  S.threats = [];
  S.steps = [];
  S.hitsThisEp = 0;
  S.heading = 0;
  S.airborne = 0;
  S.epStart = performance.now();
  S.glance.reset();
  spawn();
}
function spawn() {
  // one threat at a time, from a random side, so direction is what she must read
  const fromLeft = Math.random() < 0.5;
  const a = (fromLeft ? -1 : 1) * (0.35 + Math.random() * 0.9);
  // ~6 s of approach, long enough for a dozen glances at default speed
  S.threats.push(new Threat(a, 0.16 + Math.random() * 0.06));
}

function decide() {
  const x = S.glance.evoked;
  const temp = Math.max(0.65, 1.7 - S.pol.episodes * 0.03);
  const a = S.pol.act(x, temp);
  S.action = a;

  // acting costs a little, so doing nothing is not punished into oblivion
  let r = a === 0 ? 0 : -0.04;
  S.steps.push({ x: Float32Array.from(x), a, r });
  applyAction(a);
}

function applyAction(a) {
  if (ACTIONS[a] === 'jump') S.airborne = 1;
  else if (ACTIONS[a] === 'left') S.heading -= 0.42;
  else if (ACTIONS[a] === 'right') S.heading += 0.42;
}

function endEpisode(survived) {
  if (S.steps.length) {
    S.steps[S.steps.length - 1].r += survived ? 3 : -3;
    S.pol.learn(S.steps);
  }
  S.ep.push(survived ? 1 : 0);
  if (S.ep.length > 240) S.ep.shift();
  S.verdict = survived ? 'out of the way' : 'hit';
  S.verdictT = performance.now();
  save(); paintStrip();
  newEpisode();
}

/* ---------------- loop ---------------- */
function loop(now) {
  const dt = Math.min((now - S.last) / 1000, 0.05);
  S.last = now;
  S.brain.tick(now);

  /* The world runs on wall time; her looking runs on hers.

     Two failed arrangements before this one. Scaling wall time let the threat
     close faster than the brain could glance, so 67 episodes produced a single
     policy update. Driving the world by biological time instead stalled it
     completely: the engine manages 91-500 ms of biological time per wall second,
     so a threat took half a minute to arrive. What works is leaving the approach
     on a watchable clock and letting the glance rate follow the brain — a slow
     brain simply gets fewer looks before impact, which is honest. The speed
     control raises engine throughput, so faster means more looks, not a faster
     threat. */
  const step = dt;

  if (S.glance.update(S.threats, S.heading)) decide();
  S.loom = S.glance.drive;

  S.airborne = Math.max(0, S.airborne - step * 1.4);
  for (const t of S.threats) {
    if (t.dead) continue;
    t.step(step);
    if (t.r < 0.14) {
      // contact, unless she is off the ground or has turned it out of her path
      const facing = Math.abs(t.sideOf(S.heading));
      const dodged = S.airborne > 0.25 || facing > 0.72;
      t.dead = true; t.hit = !dodged;
      if (!dodged) S.hitsThisEp++;
      endEpisode(dodged);
      return schedule();
    }
  }
  if (!S.threats.some(t => !t.dead)) spawn();

  if (!document.hidden) S.arena.draw({ threats: S.threats, heading: S.heading, airborne: S.airborne }, dt);
  if (S.brainView && !document.hidden) {
    const act = S.brainView.act, hz = S.brain.hz;
    const decay = Math.pow(0.04, dt);
    for (let i = 0; i < act.length; i++) {
      const v = hz[i] > 1 ? Math.min(1, hz[i] / 120) : 0;
      const a = act[i] * decay;
      act[i] = v > a ? v : a;
    }
    S.brainView.uploadAct();
    S.brainView.draw(dt);
  }
  if (now - (S._paint || 0) > 150) { paint(now); S._paint = now; }
  schedule();
}

/* rAF while visible, a timer while hidden. Browsers throttle rAF to about half a
   frame per second in a background tab, which stalls training completely — and
   makes it look like the scenario is broken when it is only asleep. */
function schedule() {
  if (document.hidden) setTimeout(() => loop(performance.now()), 24);
  else requestAnimationFrame(loop);
}

/* ---------------- painting ---------------- */
function paint(now) {
  const gf = S.brain.giantFibre();
  $('#gfBar').style.width = `${Math.min(100, gf / 2.2)}%`;
  $('#gfVal').textContent = gf.toFixed(0);
  $('#loomL').style.width = `${Math.round(S.loom.l * 100)}%`;
  $('#loomR').style.width = `${Math.round(S.loom.r * 100)}%`;
  $('#mGF').textContent = gf.toFixed(0);
  $('#mEp').textContent = S.pol.episodes;
  const last = S.ep.slice(-20);
  const rate = last.length ? Math.round(100 * last.reduce((a, b) => a + b, 0) / last.length) : 0;
  $('#mSurv').textContent = `${rate}%`;
  let firing = 0;
  for (let i = 0; i < S.brain.hz.length; i++) if (S.brain.hz[i] > 1) firing++;
  $('#mActive').textContent = `${firing.toLocaleString('en-US')} firing`;
  const v = $('#verdict');
  if (now - S.verdictT < 1100) {
    v.textContent = S.verdict;
    v.className = 'verdict ' + (S.verdict === 'hit' ? 'hit' : 'safe');
  } else v.textContent = '';
  $('#dockStat').textContent = S.training ? `training at ${S.speed}×` : 'watching';
}

function paintStrip() {
  const box = $('#strip');
  box.innerHTML = S.ep.slice(-120).map((v, i, a) =>
    `<i class="${v ? 'safe' : 'hit'}${i === a.length - 1 ? ' now' : ''}"></i>`).join('');
  const first = S.ep.slice(0, 20), last = S.ep.slice(-20);
  const pc = a => a.length ? Math.round(100 * a.reduce((x, y) => x + y, 0) / a.length) : 0;
  $('#arcNote').textContent = S.ep.length < 3
    ? 'No episodes yet. Press Train.'
    : S.ep.length < 20
      ? `${pc(S.ep)}% survived so far, over ${S.ep.length} episodes.`
      : `First 20 episodes: ${pc(first)}% survived. Last 20: ${pc(last)}%.`;
}

function save() {
  try { localStorage.setItem(SAVE, JSON.stringify({ policy: S.pol.serialise(), ep: S.ep.slice(-240) })); }
  catch (_) { /* private mode */ }
}
function restore() {
  try {
    const raw = JSON.parse(localStorage.getItem(SAVE) || 'null');
    if (!raw) return;
    if (raw.policy) S.pol.restore(raw.policy);
    if (Array.isArray(raw.ep)) S.ep = raw.ep;
    paintStrip();
  } catch (_) { /* corrupt */ }
}
addEventListener('beforeunload', save);

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
window.defend = S;
boot();
