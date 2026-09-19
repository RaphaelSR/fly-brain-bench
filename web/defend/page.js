/* Escape Reflex — a player over a recorded training run.

   The page used to train in the tab, which was a mistake: an episode cost tens of
   seconds because seven glances of a spiking network were competing with the
   renderer for one thread, and nobody is going to watch six hundred of those. The
   training happens in tools/train.mjs now, in about twenty-five seconds, and this
   plays back what it wrote.

   What is played back is a probe battery — the same twelve threats shown to the
   frozen policy every twenty-five episodes. Two checkpoints are therefore directly
   comparable, which is the whole point of the compare button: identical approach,
   identical angle, and the only difference is what she has learned. */

import { fetchGz, decodeLabels, decodePositions } from '../js/data.js';
import { BrainView } from '../js/gl.js';
import { Threat, ArenaView } from './arena.js';
import { Recording, Player, BEAT } from './replay.js';

const $ = s => document.querySelector(s);
const NT_COLOUR = {
  acetylcholine: [0.96, 0.68, 0.26], gaba: [0.28, 0.58, 0.88],
  glutamate: [0.64, 0.45, 0.87], dopamine: [0.35, 0.78, 0.55],
  serotonin: [0.90, 0.45, 0.65], octopamine: [0.30, 0.78, 0.80],
  unknown: [0.45, 0.52, 0.55],
};
const INFO = {
  arc: ['Watching her get it',
    'Every twenty-five episodes her learning is paused and she is shown the same twelve threats, with the guessing turned off. The line is how many she escaped. Two points on it are directly comparable — same approach from the same angle — so what changes between them is only what she has learned. Nothing about her brain changes: a connectome records wiring, not plasticity, so what learns is a readout sitting on top of it.'],
  probs: ['Her four options',
    'Hold still, lean left, lean right, or leap — and she only gets one leap. The bars are what the readout gave each option at that glance, before anything was chosen. Early on they sit near a quarter each, which is another way of saying she is guessing. Escaping needs both halves: off the ground when it arrives, and leaning away from it. A fly that leaps into the thing is still hit.'],
  gf: ['What her eyes put into her',
    'LPLC2 are looming detectors, and they fire when something expands in the visual field. The two eye bars are how hard each side is being driven, which is the only cue to direction she has. Urgency is how much her descending neurons rose in response, which grows as the thing closes — that is the cue to timing. DNp01 is the giant fibre: a real fly has one pair, and a single spike in them launches the escape.'],
  brain: ['The cells that were firing',
    'Her escape circuit at real coordinates, coloured by the transmitter each cell releases — amber excites, blue and violet inhibit. The bright ones were actually spiking during that glance, recorded from the simulation rather than animated. Watch the driven eye light first and the wave arrive at the descending neurons a moment later.'],
};

const S = {
  rec: null, recs: {}, wiring: 'real',
  A: null, B: null, viewA: null, viewB: null,
  threatA: null, threatB: null,
  brain: null, geom: null, labels: null, meta: null,
  actTarget: null, nActive: 0,
  playing: true, speed: 2, compare: false, follow: true,
  last: 0, cp: 0,
};

/* ------------------------------------------------------------------ boot */
async function boot() {
  const step = (label, f) => {
    $('#loadLabel').textContent = label;
    $('#loadBar').style.width = `${Math.round(f * 100)}%`;
  };
  try {
    step('Reading cell types', 0.15);
    const meta = JSON.parse(new TextDecoder().decode(await fetchGz('data/meta.json.gz')));
    S.meta = meta;
    const N = meta.n_neurons;
    S.labels = decodeLabels(await fetchGz('data/labels.bin.gz'), N);
    step('Placing neurons', 0.4);
    S.geom = decodePositions(await fetchGz('data/pos.u16.bin.gz'), N, meta.bbox_lo, meta.span);
    step('Loading the run', 0.65);
    S.recs.real = await Recording.load('data/replay.json.gz');
    S.rec = S.recs.real;
    step('Ready', 1);

    S.brain = new BrainView($('#brain'), S.geom.pos, S.labels.nt, S.geom.radius);
    S.brain.setNTColors(meta.dicts.top_nt.map(n => NT_COLOUR[n] || NT_COLOUR.unknown));
    /* The escape subcircuit is 6,203 cells out of 138,639, so the resting cloud is
       sparse where the whole brain is dense — it needs a brighter floor and a
       closer camera than the bench does, or the anatomy the firing sits inside is
       not visible at all. */
    S.brain.baseAlpha = 0.46;
    S.brain.pitch = 0.26;
    S.brain.fitMargin = 1.04;
    S.brain.bloom = 1.15;              // a sparse cloud can carry more glow
    S.brain.bloomThreshold = 0.38;
    S.actTarget = new Float32Array(N);

    S.viewA = new ArenaView($('#paneA canvas'));
    S.viewB = new ArenaView($('#paneB canvas'));
    S.A = new Player(S.rec);
    S.B = new Player(S.rec);
    setCheckpoint(0);

    wire();
    paintArc();
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

/* The page walks the arc on its own.

   Landing on the finished policy and looping it would show a fly that is simply
   good at this, which is the least interesting thing in the recording. Each
   approach advances one checkpoint, so watching for a minute and a half is
   watching six hundred episodes of training in order — and touching the scrub
   hands control over and stops the walk. */
function setCheckpoint(i, fromUser) {
  if (fromUser) { S.follow = false; $('#btnFollow')?.setAttribute('aria-pressed', 'false'); }
  S.cp = Math.max(0, Math.min(S.rec.checkpoints.length - 1, i));
  S.A.cp = S.cp; S.B.cp = 0;
  applyCheckpoint();
  armRun(S.A.angle);
}

function applyCheckpoint() {
  const cp = S.rec.checkpoints[S.cp];
  $('#scrub').value = String(S.cp);
  $('#scrubOut').textContent = `episode ${cp.ep}`;
  $('#mEp').textContent = cp.ep;
  $('#mScore').textContent = `${Math.round(cp.score * 100)}%`;
  $('#mAim').textContent = `${Math.round(cp.aimed * 100)}%`;
  $('#paneA [data-ep]').textContent = `episode ${cp.ep}`;
  $('#paneB [data-ep]').textContent = `episode ${S.rec.checkpoints[0].ep}`;
  paintArc();
}

/* set both panes up for one approach */
function armRun(angle) {
  for (const [p, v] of [[S.A, S.viewA], [S.B, S.viewB]]) {
    p.angle = angle; p.reset(); v.reset();
  }
  S.threatA = new Threat(S.rec.angles[angle]);
  S.threatB = new Threat(S.rec.angles[angle]);
  for (const el of document.querySelectorAll('[data-verdict]')) { el.textContent = ''; el.className = ''; }
  const a = S.rec.angles[angle];
  $('#hudAngle').textContent = `approach ${a > 0 ? 'right' : 'left'} ${Math.abs(a).toFixed(2)} rad`;
}

/* the next approach, and — while following — the next point in the training */
function nextRun() {
  const list = S.rec.showcase;
  const at = Math.max(0, list.indexOf(S.A.angle));
  const angle = list[(at + 1) % list.length];
  if (S.follow) {
    S.cp = (S.cp + 1) % S.rec.checkpoints.length;
    S.A.cp = S.cp;
    applyCheckpoint();
  }
  armRun(angle);
}

/* ------------------------------------------------------------------ loop */
function loop(now) {
  /* Clamped below zero as well as above. requestAnimationFrame hands back the
     timestamp of the *start* of the frame, which can predate a performance.now()
     taken at the end of a long task — and boot is a long task. One negative dt
     inverted every spring in the arena and sent the fly's radius negative, which
     surfaced as an IndexSizeError from canvas and a dead render loop. */
  const dt = Math.max(0, Math.min((now - S.last) / 1000, 0.05));
  S.last = now;
  const k = S.playing ? dt * S.speed : 0;

  S.A.update(k, {
    onGlance: (gi, s) => {
      S.viewA.glance();
      lightBrain(gi);
      paintSignal(s);
      paintProbs(s.p, s.a);
      $('#hudGlance').textContent = `glance ${gi + 1} of ${S.rec.glances}`;
    },
    onAct: (name, s) => { if (name === 'leap') S.viewA.leap(-Math.sign(S.threatA.a) || 1); },
    onEnd: (run, justEnded) => {
      if (justEnded) {
        S.threatA.step = S.rec.glances;
        markVerdict($('#paneA'), run.ok);
        if (!run.ok) S.viewA.impact(...impactPoint(S.viewA, S.threatA));
      } else nextRun();
    },
  });
  if (S.compare) {
    S.B.update(k, {
      onGlance: () => S.viewB.glance(),
      onAct: (name) => { if (name === 'leap') S.viewB.leap(-Math.sign(S.threatB.a) || 1); },
      onEnd: (run, justEnded) => {
        if (justEnded) {
          S.threatB.step = S.rec.glances;
          markVerdict($('#paneB'), run.ok);
          if (!run.ok) S.viewB.impact(...impactPoint(S.viewB, S.threatB));
        }
      },
    });
  }

  if (!document.hidden) {
    drawPane(S.viewA, S.A, S.threatA, dt);
    if (S.compare) drawPane(S.viewB, S.B, S.threatB, dt);
    decayBrain(dt);
    S.brain.draw(dt);
  }
  schedule();
}

function drawPane(view, player, threat, dt) {
  threat.step = Math.min(player.step, 7);
  threat.interpolate(dt * (S.playing ? Math.max(S.speed, 1) : 1));
  view.draw({ threat, drive: player.drive, lean: player.body.lean,
    airborne: player.body.airborne, leapUsed: player.body.leapUsed }, dt);
}
function impactPoint(view, threat) {
  const w = view.c.clientWidth, h = view.c.clientHeight;
  return [w / 2, h / 2];
}
function markVerdict(pane, ok) {
  const el = pane.querySelector('[data-verdict]');
  el.textContent = ok ? 'clear' : 'hit';
  el.className = ok ? 'safe' : 'hit';
}

/* rAF while visible, a timer while hidden. Browsers throttle rAF to about half a
   frame per second in a background tab, which stalls playback completely — and
   makes it look like the page is broken when it is only asleep. */
function schedule() {
  if (document.hidden) setTimeout(() => loop(performance.now()), 40);
  else requestAnimationFrame(loop);
}

/* ---------------------------------------------------------------- brain */
function lightBrain(gi) {
  const run = S.A.run;
  const snap = run?.snaps?.[gi];
  S.actTarget.fill(0);
  S.nActive = 0;
  if (snap) {
    for (let j = 0; j < snap.i.length; j++) S.actTarget[snap.i[j]] = snap.v[j] / 255;
    S.nActive = snap.i.length;
  }
  const act = S.brain.act;
  for (let i = 0; i < act.length; i++) if (S.actTarget[i] > act[i]) act[i] = S.actTarget[i];
  S.brain.uploadAct();

  // mark the eye that is being driven, so the input is visible as well as the response
  const step = run?.steps?.[gi];
  const sel = S.brain.sel;
  sel.fill(0);
  if (step) {
    const { left, right } = S.rec.inputs;
    for (const i of left) sel[i] = Math.min(1, step.l * 1.4);
    for (const i of right) sel[i] = Math.min(1, step.r * 1.4);
  }
  S.brain.uploadSel();
  $('#mActive').textContent = S.nActive ? `${S.nActive} firing` : '';
}
function decayBrain(dt) {
  const act = S.brain.act;
  const f = Math.pow(0.12, dt * (S.playing ? S.speed : 1) / BEAT);
  let changed = false;
  for (let i = 0; i < act.length; i++) {
    if (act[i] > 0.002) { act[i] *= f; changed = true; }
    else if (act[i]) { act[i] = 0; changed = true; }
  }
  if (changed) S.brain.uploadAct();
}

/* ---------------------------------------------------------------- panels */
function paintSignal(s) {
  $('#gfBar').style.width = `${Math.min(100, s.gf * 2)}%`;
  $('#gfVal').textContent = s.gf.toFixed(0);
  $('#loomL').style.width = `${Math.round(s.l * 100)}%`;
  $('#loomR').style.width = `${Math.round(s.r * 100)}%`;
  $('#urg').style.width = `${Math.min(100, Math.round(s.u * 1000))}%`;
}

function paintProbs(p, chosen) {
  const box = $('#probs');
  if (!box.children.length) {
    box.innerHTML = S.rec.actions.map(a =>
      `<li><span class="pl">${a}</span><span class="pb"><i></i></span><span class="pv mono"></span></li>`).join('');
  }
  [...box.children].forEach((li, i) => {
    li.querySelector('i').style.width = `${Math.round(p[i] * 100)}%`;
    li.querySelector('.pv').textContent = `${Math.round(p[i] * 100)}%`;
    li.classList.toggle('chosen', i === chosen);
  });
}

/* The arc, drawn rather than listed: probe score against episode, with the point
   you are watching called out and the training episodes as a faint ghost behind. */
function paintArc() {
  const c = $('#arcChart');
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = c.clientWidth, h = c.clientHeight || 96;
  if (!w) return;
  if (c.width !== Math.round(w * dpr)) { c.width = Math.round(w * dpr); c.height = Math.round(h * dpr); }
  const g = c.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);

  const cps = S.rec.checkpoints;
  const pad = { l: 4, r: 4, t: 8, b: 14 };
  const iw = w - pad.l - pad.r, ih = h - pad.t - pad.b;
  const X = i => pad.l + (i / Math.max(cps.length - 1, 1)) * iw;
  const Y = v => pad.t + (1 - v) * ih;

  // gridlines at a quarter — chance with four options — and at everything
  g.strokeStyle = 'rgba(46,68,76,.7)';
  g.setLineDash([2, 4]);
  for (const v of [0.25, 1]) {
    g.beginPath(); g.moveTo(pad.l, Y(v)); g.lineTo(w - pad.r, Y(v)); g.stroke();
  }
  g.setLineDash([]);
  g.font = '9px "IBM Plex Mono", ui-monospace, monospace';
  g.fillStyle = '#66787F';
  g.fillText('chance', pad.l + 1, Y(0.25) - 3);

  // the aim rate behind, which is the part the wiring is responsible for
  g.beginPath();
  cps.forEach((p, i) => (i ? g.lineTo(X(i), Y(p.aimed)) : g.moveTo(X(i), Y(p.aimed))));
  g.strokeStyle = 'rgba(89,199,140,.35)';
  g.lineWidth = 1.5; g.stroke();

  // the score
  const grad = g.createLinearGradient(0, pad.t, 0, pad.t + ih);
  grad.addColorStop(0, '#F2A93B'); grad.addColorStop(1, '#8A5F1E');
  g.beginPath();
  cps.forEach((p, i) => (i ? g.lineTo(X(i), Y(p.score)) : g.moveTo(X(i), Y(p.score))));
  g.strokeStyle = grad; g.lineWidth = 2; g.lineJoin = 'round'; g.stroke();

  // where you are
  const px = X(S.cp), py = Y(cps[S.cp].score);
  g.beginPath(); g.moveTo(px, pad.t); g.lineTo(px, pad.t + ih);
  g.strokeStyle = 'rgba(236,232,224,.18)'; g.lineWidth = 1; g.stroke();
  g.beginPath(); g.arc(px, py, 4.5, 0, Math.PI * 2);
  g.fillStyle = '#FFF1D8'; g.fill();

  const cp = cps[S.cp];
  $('#arcNote').innerHTML =
    `At episode <b>${cp.ep}</b> she escaped <b>${Math.round(cp.score * 100)}%</b> of the twelve, ` +
    `leaning the right way on <b>${Math.round(cp.aimed * 100)}%</b>.`;
}

/* ----------------------------------------------------------------- wiring */
function wire() {
  $('#btnPlay').addEventListener('click', () => {
    S.playing = !S.playing;
    $('#btnPlay').textContent = S.playing ? 'Pause' : 'Play';
  });
  $('#scrub').max = String(S.rec.checkpoints.length - 1);
  $('#scrub').addEventListener('input', e => setCheckpoint(+e.target.value, true));
  $('#speed').addEventListener('input', e => {
    S.speed = +e.target.value;
    $('#speedOut').textContent = `${S.speed}×`;
  });
  $('#btnFollow').addEventListener('click', () => {
    S.follow = !S.follow;
    $('#btnFollow').setAttribute('aria-pressed', String(S.follow));
  });
  $('#btnCompare').addEventListener('click', () => {
    S.compare = !S.compare;
    $('#paneB').hidden = !S.compare;
    $('#arenas').classList.toggle('split', S.compare);
    $('#btnCompare').setAttribute('aria-pressed', String(S.compare));
    $('#btnCompare').textContent = S.compare ? 'Single view' : 'Compare with episode 0';
    armRun(S.A.angle);
  });
  $('#btnWiring').addEventListener('click', swapWiring);
  $('#arcChart').addEventListener('pointerdown', e => {
    const move = ev => {
      const r = $('#arcChart').getBoundingClientRect();
      const f = (ev.clientX - r.left) / r.width;
      setCheckpoint(Math.round(f * (S.rec.checkpoints.length - 1)), true);
    };
    move(e);
    const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); };
    addEventListener('pointermove', move); addEventListener('pointerup', up);
  });
  addEventListener('resize', paintArc);
  bindInfo();
  $('#hudWiring').textContent = 'her own wiring';
}

/* The control, one button away: the same subcircuit rewired at random with every
   neuron's in- and out-degree preserved, trained identically. It is not a
   simulation of damage — it is the same experiment with the anatomy removed. */
async function swapWiring() {
  const to = S.wiring === 'real' ? 'shuf' : 'real';
  const btn = $('#btnWiring');
  btn.disabled = true;
  try {
    if (!S.recs[to]) {
      btn.textContent = 'Loading…';
      S.recs[to] = await Recording.load(to === 'shuf' ? 'data/replay.shuf.json.gz' : 'data/replay.json.gz');
    }
    S.wiring = to;
    S.rec = S.recs[to];
    S.A.rec = S.rec; S.B.rec = S.rec;
    setCheckpoint(Math.min(S.cp, S.rec.checkpoints.length - 1), false);
  } finally {
    btn.disabled = false;
    const shuffled = S.wiring === 'shuf';
    btn.textContent = shuffled ? 'Put her wiring back' : 'Shuffle her wiring';
    btn.setAttribute('aria-pressed', String(shuffled));
    $('#hudWiring').textContent = shuffled ? 'rewired at random — degrees preserved' : 'her own wiring';
    document.body.classList.toggle('shuffled', shuffled);
  }
}

/* One delegated listener, bound once. Rebinding this on every relabel used to
   stack handlers until the popover opened and shut in the same click. */
function bindInfo() {
  if (bindInfo.done) return;
  bindInfo.done = true;
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
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') $('#infoPop').classList.remove('open');
    if (e.key === ' ') { e.preventDefault(); $('#btnPlay').click(); }
    if (e.key === 'ArrowLeft') setCheckpoint(S.cp - 1, true);
    if (e.key === 'ArrowRight') setCheckpoint(S.cp + 1, true);
  });
}

const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
window.defend = S;
boot();
