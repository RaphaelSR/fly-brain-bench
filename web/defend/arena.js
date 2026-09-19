/* The defence arena, drawn flat and from above.

   Deliberately 2D. The point of this scenario is the arc — watching her get hit,
   and hit, and then not — and a clean top-down read of who is where beats a
   prettier perspective that hides the geometry. The 3D fly and the neuron cloud
   live beside it.

   Nothing here touches the DOM at module scope: the headless trainer imports
   Threat and the glance count from this file and must load under Node. */

export const ARENA_R = 1.0;          // normalised; the canvas scales it
export const GLANCES_PER_APPROACH = 7;

export class Threat {
  constructor(angle) {
    this.a = angle;
    this.step_ = 0;                  // how many glances have passed
    this.r = 1.15;                   // drawn radius, eased toward the target
    this.target = 1.15;
    this.size = 0.09;
    this.dead = false;
    this.hit = false;
  }
  /* one glance closer */
  advance() {
    this.step_++;
    const u = this.step_ / GLANCES_PER_APPROACH;
    this.target = 1.15 - u * 1.03;
  }
  /* smooth the jump between glances so it reads as motion */
  interpolate(dt) {
    this.r += (this.target - this.r) * Math.min(1, dt * 7);
  }
  get step() { return this.step_; }
  set step(v) { this.step_ = v; this.target = 1.15 - (v / GLANCES_PER_APPROACH) * 1.03; }
  get arrived() { return this.step_ >= GLANCES_PER_APPROACH; }
  get pos() { return [Math.sin(this.a) * this.r, Math.cos(this.a) * this.r]; }
  get loom() { return Math.max(0, Math.min(1, 1 - (this.r - 0.12) / 1.03)); }
  sideOf(heading) {
    let d = ((this.a - heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    return Math.max(-1, Math.min(1, d / (Math.PI / 2)));
  }
}

/* ---------------------------------------------------------------- palette */
const C = {
  ink: '#ECE8E0', ink2: '#9EACB1', ink3: '#66787F',
  line: '#22343B', line2: '#2E444C',
  amber: '#F2A93B', hot: '#FFF1D8', danger: '#E8654B', safe: '#59C78C',
  eye: '#4CC7CC',
};

/* critically-damped spring: reaches the target without overshooting past it */
class Spring {
  constructor(v = 0, stiffness = 16) { this.v = v; this.x = v; this.k = stiffness; }
  to(target, dt) {
    if (!(dt > 0)) return this.x;          // a negative step would invert the spring
    const f = 1 - Math.exp(-this.k * dt);
    this.x += (target - this.x) * f;
    return this.x;
  }
  set(v) { this.x = v; }
}

/* ------------------------------------------------------------------ view */
export class ArenaView {
  constructor(canvas) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.t = 0;
    this.flash = 0;
    this.shake = 0;
    this.sweep = 0;
    this.scans = [];          // expanding rings, one per glance
    this.parts = [];          // dust and sparks
    this.trail = [];          // where the threat has been
    this.lean = new Spring(0, 13);
    this.hop = new Spring(0, 22);
    this.eyeL = new Spring(0, 11);
    this.eyeR = new Spring(0, 11);
    this.leapDir = 0;
    this.wing = 0;
    this.labels = { contact: 'contact' };
  }

  /* --- events the page fires at it --- */
  /* A glance is an event — the ring — but the drive it reveals is a *level*, held
     for as long as that glance lasts. The first version flashed the eye wedges and
     let them fall to zero over a third of a second, so the one part of the picture
     that is genuinely the simulation's input was on screen too briefly to read.
     The wedges now track the drive itself and climb with the approach. */
  glance() {
    this.scans.push({ age: 0, life: 0.85 });
    this.flare = 1;
  }
  leap(dir) {
    this.leapDir = dir || 0;
    this.hop.set(1);
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, s = 0.18 + Math.random() * 0.55;
      this.parts.push({ x: 0, y: 0, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        age: 0, life: 0.5 + Math.random() * 0.4, r: 1 + Math.random() * 2.2, kind: 'dust' });
    }
  }
  impact(x, y) {
    this.flash = 1; this.shake = 1;
    for (let i = 0; i < 34; i++) {
      const a = Math.random() * Math.PI * 2, s = 0.5 + Math.random() * 1.5;
      this.parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        age: 0, life: 0.34 + Math.random() * 0.4, r: 1 + Math.random() * 2, kind: 'spark' });
    }
  }
  reset() {
    this.scans.length = 0; this.parts.length = 0; this.trail.length = 0;
    this.hop.set(0); this.lean.set(0); this.eyeL.set(0); this.eyeR.set(0);
    this.leapDir = 0;
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = this.c.clientWidth, h = this.c.clientHeight;
    const cw = Math.round(w * dpr), ch = Math.round(h * dpr);
    // both dimensions, not just the width: splitting the stage into two panes
    // changes only the height, and a width-only check left the canvas backing
    // store at its old size, drawing a cropped arena into a shorter box
    if (this.c.width !== cw || this.c.height !== ch) { this.c.width = cw; this.c.height = ch; }
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return [w, h];
  }

  /* state: { threat, lean, airborne, leapUsed, drive:{l,r}, outcome, dim } */
  draw(state, dt) {
    const g = this.g;
    const [w, h] = this.resize();
    if (!w || !h) return;
    dt = Math.max(0, Math.min(dt, 0.05));
    this.t += dt;
    const cx = w / 2, cy = h / 2;
    const R = Math.min(w, h) * 0.39;

    const drive = state.drive || { l: 0, r: 0 };
    this.flare = Math.max(0, (this.flare || 0) - dt * 2.6);
    const boost = 1 + this.flare * 0.5;
    this.eyeL.to(drive.l * boost, dt); this.eyeR.to(drive.r * boost, dt);
    this.lean.to(state.lean || 0, dt);
    this.hop.to(state.airborne > 0.02 ? state.airborne : 0, dt);
    this.sweep += dt * 0.55;
    this.flash = Math.max(0, this.flash - dt * 2.4);
    this.shake = Math.max(0, this.shake - dt * 3.4);
    this.wing += dt * (state.airborne > 0.05 ? 58 : 22);

    g.clearRect(0, 0, w, h);
    g.save();
    if (this.shake > 0.001) {
      const s = this.shake * this.shake * 13;
      g.translate((Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    }

    this._well(g, w, h, cx, cy, R);
    this._rings(g, cx, cy, R, state);
    this._sweepArc(g, cx, cy, R);
    this._eyes(g, cx, cy, R);
    if (state.threat) this._threat(g, cx, cy, R, state, dt);
    this._scans(g, cx, cy, R, dt);
    this._fly(g, cx, cy, R, state);
    this._particles(g, cx, cy, R, dt);
    g.restore();

    if (this.flash > 0) {
      g.fillStyle = `rgba(232,101,75,${(this.flash * 0.3).toFixed(3)})`;
      g.fillRect(0, 0, w, h);
    }
    this._vignette(g, w, h, cx, cy);
  }

  /* the floor she stands on */
  _well(g, w, h, cx, cy, R) {
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, R * 1.9);
    grad.addColorStop(0, '#0D171B');
    grad.addColorStop(0.55, '#091013');
    grad.addColorStop(1, '#05090B');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  }

  /* range rings, with the one that means contact called out */
  _rings(g, cx, cy, R, state) {
    g.lineWidth = 1;
    for (const f of [1, 0.78, 0.56, 0.34]) {
      g.beginPath(); g.arc(cx, cy, R * f, 0, Math.PI * 2);
      g.strokeStyle = f === 0.34 ? 'rgba(232,101,75,.30)' : C.line;
      g.stroke();
    }
    // ticks around the outer ring
    g.strokeStyle = 'rgba(46,68,76,.85)';
    for (let i = 0; i < 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const long = i % 6 === 0;
      const r0 = R * (long ? 1.04 : 1.07), r1 = R * 1.11;
      g.beginPath();
      g.moveTo(cx + Math.sin(a) * r0, cy - Math.cos(a) * r0);
      g.lineTo(cx + Math.sin(a) * r1, cy - Math.cos(a) * r1);
      g.stroke();
    }
    g.font = '9px "IBM Plex Mono", ui-monospace, monospace';
    g.fillStyle = 'rgba(232,101,75,.55)';
    g.textAlign = 'center';
    g.fillText(this.labels.contact, cx, cy + R * 0.34 + 13);
    g.textAlign = 'left';
  }

  /* the slow instrument sweep — decoration, and it makes the well feel alive */
  _sweepArc(g, cx, cy, R) {
    const a = this.sweep % (Math.PI * 2);
    g.save();
    g.translate(cx, cy); g.rotate(a);
    const grad = g.createLinearGradient(0, 0, 0, -R * 1.1);
    grad.addColorStop(0, 'rgba(150,200,214,0)');
    grad.addColorStop(1, 'rgba(150,200,214,.028)');
    g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, R * 1.1, -Math.PI / 2 - 0.26, -Math.PI / 2); g.closePath();
    g.fillStyle = grad; g.fill();
    g.restore();
  }

  /* What each eye is being driven with, drawn where that eye looks.

     This is the one part of the picture that is not decoration: it is the actual
     input to the simulation, and when the left wedge lights and the right does
     not, that asymmetry is the only thing standing between her and a coin flip. */
  _eyes(g, cx, cy, R) {
    const sides = [[-1, this.eyeL.x], [1, this.eyeR.x]];
    for (const [sgn, v] of sides) {
      if (v < 0.004) continue;
      const mid = sgn * 1.05 - Math.PI / 2;
      const half = 0.66;
      g.save(); g.translate(cx, cy);

      // the field that eye covers, brightest at its rim
      const grad = g.createRadialGradient(0, 0, R * 0.22, 0, 0, R * 1.06);
      grad.addColorStop(0, 'rgba(76,199,204,0)');
      grad.addColorStop(0.72, `rgba(76,199,204,${(v * 0.20).toFixed(3)})`);
      grad.addColorStop(1, `rgba(120,230,235,${(v * 0.42).toFixed(3)})`);
      g.beginPath(); g.moveTo(0, 0);
      g.arc(0, 0, R * 1.06, mid - half, mid + half);
      g.closePath(); g.fillStyle = grad; g.fill();

      // a bright rim, so a driven eye is unmistakable against an undriven one
      g.beginPath();
      g.arc(0, 0, R * 1.06, mid - half, mid + half);
      g.strokeStyle = `rgba(150,240,244,${(0.25 + v * 0.65).toFixed(3)})`;
      g.lineWidth = 1 + v * 2.6;
      g.stroke();

      g.font = '9px "IBM Plex Mono", ui-monospace, monospace';
      g.fillStyle = `rgba(150,240,244,${(0.3 + v * 0.6).toFixed(3)})`;
      const lx = Math.cos(mid) * R * 1.16, ly = Math.sin(mid) * R * 1.16;
      g.textAlign = sgn < 0 ? 'right' : 'left';
      g.fillText(`${Math.round(v * 100)}%`, lx, ly);
      g.textAlign = 'left';
      g.restore();
    }
  }

  _threat(g, cx, cy, R, state, dt) {
    const t = state.threat;
    const [tx, ty] = t.pos;
    const x = cx + tx * R, y = cy - ty * R;
    const loom = t.loom;
    const rad = Math.max(3.5, t.size * R * (0.55 + loom * 1.9));

    // where it has been
    this.trail.push({ x, y, r: rad, age: 0 });
    if (this.trail.length > 22) this.trail.shift();
    for (const p of this.trail) p.age += dt;
    for (const p of this.trail) {
      const k = Math.max(0, 1 - p.age / 0.55);
      if (k <= 0) continue;
      g.beginPath(); g.arc(p.x, p.y, p.r * k * 0.8, 0, Math.PI * 2);
      g.fillStyle = `rgba(232,101,75,${(k * 0.07).toFixed(3)})`;
      g.fill();
    }

    // the line it is travelling down, and how much of it is left
    g.save();
    g.setLineDash([3, 6]);
    g.lineDashOffset = -this.t * 26;
    g.beginPath(); g.moveTo(x, y); g.lineTo(cx, cy);
    g.strokeStyle = `rgba(232,101,75,${(0.10 + loom * 0.22).toFixed(3)})`;
    g.lineWidth = 1; g.stroke();
    g.restore();

    // leading shock ring, faster as it closes
    const pulse = (this.t * (1.1 + loom * 3.4)) % 1;
    g.beginPath(); g.arc(x, y, rad + pulse * (14 + loom * 26), 0, Math.PI * 2);
    g.strokeStyle = `rgba(232,101,75,${((1 - pulse) * (0.10 + loom * 0.3)).toFixed(3)})`;
    g.lineWidth = 1.5; g.stroke();

    // the mass itself
    const grad = g.createRadialGradient(x - rad * 0.3, y - rad * 0.35, rad * 0.1, x, y, rad);
    grad.addColorStop(0, t.hit ? '#FFD9CF' : '#F09077');
    grad.addColorStop(0.6, C.danger);
    grad.addColorStop(1, '#7E2A1B');
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2);
    g.fillStyle = grad; g.fill();
    g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2);
    g.strokeStyle = `rgba(255,200,180,${(0.2 + loom * 0.4).toFixed(3)})`;
    g.lineWidth = 1; g.stroke();
  }

  /* one ring per glance, expanding out from her: when she looked */
  _scans(g, cx, cy, R, dt) {
    for (let i = this.scans.length - 1; i >= 0; i--) {
      const s = this.scans[i];
      s.age += dt;
      const k = s.age / s.life;
      if (k >= 1) { this.scans.splice(i, 1); continue; }
      const e = 1 - Math.pow(1 - k, 2.4);
      g.beginPath(); g.arc(cx, cy, 8 + e * R * 1.05, 0, Math.PI * 2);
      g.strokeStyle = `rgba(150,200,214,${((1 - k) * 0.30).toFixed(3)})`;
      g.lineWidth = 1.4 * (1 - k * 0.6);
      g.stroke();
    }
  }

  /* Her, seen from above. Drawn rather than sprited so the lean and the leap are
     the same numbers the policy produced, not an animation approximating them. */
  _fly(g, cx, cy, R, state) {
    const lean = this.lean.x;
    const hop = Math.max(0, Math.min(1, this.hop.x));
    const s = Math.max(9, Math.min(R * 0.070, 23)) * (1 + hop * 0.38);
    // the leap carries her along the lean
    const off = hop * R * 0.16 * this.leapDir;
    const x = cx + off, y = cy;

    // shadow separates as she leaves the ground
    g.save();
    g.beginPath();
    g.ellipse(cx + off * 0.45, cy + hop * s * 0.9, s * 1.25 * (1 - hop * 0.2), s * 0.85 * (1 - hop * 0.2), 0, 0, Math.PI * 2);
    g.fillStyle = `rgba(0,0,0,${(0.42 - hop * 0.2).toFixed(3)})`;
    g.filter = 'blur(2px)';
    g.fill();
    g.restore();

    g.save();
    g.translate(x, y);
    g.rotate(lean * 0.40);

    // legs — six, splayed, pulled in when airborne
    g.strokeStyle = 'rgba(126,96,58,.95)';
    g.lineWidth = Math.max(1.1, s * 0.09);
    g.lineCap = 'round';
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const base = (-0.42 + i * 0.44) * s;
        const spread = (1 - hop * 0.7) * (0.95 + i * 0.14);
        const ex = side * s * 1.55 * spread, ey = base + (i - 1) * s * 0.78 * spread;
        g.beginPath();
        g.moveTo(side * s * 0.42, base);
        g.quadraticCurveTo(side * s * 1.18, base + (i - 1) * s * 0.16, ex, ey);
        g.stroke();
      }
    }

    // wings, swept back, blurred while she is beating them
    const beating = state.airborne > 0.05;
    const beat = Math.sin(this.wing) * (beating ? 0.36 : 0.09);
    for (const side of [-1, 1]) {
      g.save();
      g.translate(side * s * 0.3, -s * 0.12);
      g.rotate(side * (0.34 + beat));
      g.beginPath();
      g.ellipse(side * s * 0.4, s * 0.78, s * 0.27, s * 1.05, 0, 0, Math.PI * 2);
      const wg = g.createLinearGradient(0, 0, side * s * 0.8, s * 1.6);
      wg.addColorStop(0, `rgba(226,244,250,${beating ? 0.30 : 0.36})`);
      wg.addColorStop(1, 'rgba(180,215,228,.06)');
      g.fillStyle = wg; g.fill();
      g.strokeStyle = `rgba(226,244,250,${beating ? 0.16 : 0.26})`;
      g.lineWidth = 0.8; g.stroke();
      g.restore();
    }

    // abdomen, banded the way a real one is
    g.save();
    g.beginPath(); g.ellipse(0, s * 0.78, s * 0.5, s * 0.95, 0, 0, Math.PI * 2);
    const ab = g.createLinearGradient(-s * 0.4, 0, s * 0.4, s * 1.6);
    ab.addColorStop(0, '#9A6C22'); ab.addColorStop(0.5, '#5E3F14'); ab.addColorStop(1, '#241804');
    g.fillStyle = ab; g.fill();
    g.clip();
    g.strokeStyle = 'rgba(18,12,4,.75)';
    g.lineWidth = Math.max(1, s * 0.1);
    for (let i = 1; i <= 3; i++) {
      const y = s * (0.16 + i * 0.42);
      g.beginPath(); g.moveTo(-s * 0.6, y); g.lineTo(s * 0.6, y); g.stroke();
    }
    g.restore();

    // thorax
    const th = g.createRadialGradient(-s * 0.22, -s * 0.3, s * 0.06, 0, -s * 0.05, s * 0.9);
    th.addColorStop(0, '#E8B455'); th.addColorStop(0.6, '#A87A22'); th.addColorStop(1, '#5E3F12');
    g.beginPath(); g.ellipse(0, -s * 0.12, s * 0.54, s * 0.64, 0, 0, Math.PI * 2);
    g.fillStyle = th; g.fill();

    // head and the two red eyes that make her a fly and not a dot
    g.beginPath(); g.ellipse(0, -s * 0.88, s * 0.42, s * 0.36, 0, 0, Math.PI * 2);
    g.fillStyle = '#8A5F1E'; g.fill();
    for (const side of [-1, 1]) {
      const eg = g.createRadialGradient(side * s * 0.34, -s * 1.0, s * 0.03, side * s * 0.3, -s * 0.92, s * 0.34);
      eg.addColorStop(0, '#FFB79A'); eg.addColorStop(0.5, '#E4553A'); eg.addColorStop(1, '#8E2414');
      g.beginPath(); g.ellipse(side * s * 0.3, -s * 0.94, s * 0.27, s * 0.31, side * 0.32, 0, Math.PI * 2);
      g.fillStyle = eg; g.fill();
    }

    g.restore();

    // which way she is committed to going
    if (Math.abs(lean) > 0.05) {
      g.save(); g.translate(x, y);
      const dir = Math.sign(lean);
      g.beginPath();
      g.moveTo(dir * s * 1.9, 0);
      g.lineTo(dir * s * 2.9, -s * 0.34);
      g.lineTo(dir * s * 2.9, s * 0.34);
      g.closePath();
      g.fillStyle = `rgba(89,199,140,${(Math.abs(lean) * 0.7).toFixed(3)})`;
      g.fill();
      g.restore();
    }
  }

  _particles(g, cx, cy, R, dt) {
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.age += dt;
      const k = p.age / p.life;
      if (k >= 1) { this.parts.splice(i, 1); continue; }
      p.x += p.vx * dt * R * 0.5;
      p.y += p.vy * dt * R * 0.5;
      p.vx *= 0.94; p.vy *= 0.94;
      const px = p.kind === 'dust' ? cx + p.x : p.x;
      const py = p.kind === 'dust' ? cy + p.y : p.y;
      g.beginPath();
      g.arc(px, py, p.r * (1 - k * 0.6), 0, Math.PI * 2);
      g.fillStyle = p.kind === 'dust'
        ? `rgba(200,180,150,${((1 - k) * 0.30).toFixed(3)})`
        : `rgba(255,190,140,${(1 - k).toFixed(3)})`;
      g.fill();
    }
  }

  _vignette(g, w, h, cx, cy) {
    const grad = g.createRadialGradient(cx, cy, Math.min(w, h) * 0.32, cx, cy, Math.max(w, h) * 0.78);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,.5)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
  }
}
