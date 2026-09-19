/* The defence arena, drawn flat and from above.

   Deliberately 2D. The point of this scenario is the arc — watching her get hit,
   and hit, and then not — and a clean top-down read of who is where beats a
   prettier perspective that hides the geometry. The 3D fly and the neuron cloud
   live beside it. */

export const ARENA_R = 1.0;          // normalised; the canvas scales it

export class Threat {
  constructor(angle, speed, size = 0.09) {
    this.a = angle;                  // where it comes from, radians
    this.r = 1.25;                   // starts outside the arena
    this.speed = speed;
    this.size = size;
    this.dead = false;
    this.hit = false;
  }
  step(dt) { this.r -= this.speed * dt; }
  get pos() { return [Math.sin(this.a) * this.r, Math.cos(this.a) * this.r]; }
  /* how large it looms, 0 far to 1 upon her — this is what drives the detectors */
  get loom() { return Math.max(0, Math.min(1, 1 - (this.r - 0.12) / 1.0)); }
  /* which side of her it is on, -1 left to +1 right, given her heading */
  sideOf(heading) {
    let d = ((this.a - heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    return Math.max(-1, Math.min(1, d / (Math.PI / 2)));
  }
}

export class ArenaView {
  constructor(canvas) {
    this.c = canvas;
    this.g = canvas.getContext('2d');
    this.flash = 0;
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = this.c.clientWidth, h = this.c.clientHeight;
    if (this.c.width !== w * dpr) { this.c.width = w * dpr; this.c.height = h * dpr; }
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    return [w, h];
  }

  draw(state, dt) {
    const g = this.g;
    const [w, h] = this.resize();
    const cx = w / 2, cy = h / 2;
    const R = Math.min(w, h) * 0.40;
    const css = getComputedStyle(document.documentElement);
    const ink3 = css.getPropertyValue('--ink3').trim() || '#66787F';
    const line = css.getPropertyValue('--line').trim() || '#22343B';
    const amber = css.getPropertyValue('--ach').trim() || '#F2A93B';
    const bad = css.getPropertyValue('--danger').trim() || '#E8654B';

    g.clearRect(0, 0, w, h);
    this.flash = Math.max(0, this.flash - dt * 3.2);
    if (this.flash > 0) {
      g.fillStyle = `rgba(232,101,75,${(this.flash * 0.22).toFixed(3)})`;
      g.fillRect(0, 0, w, h);
    }

    // the arena floor and the rings that give distance a scale
    for (const f of [1, 0.66, 0.33]) {
      g.beginPath(); g.arc(cx, cy, R * f, 0, Math.PI * 2);
      g.strokeStyle = line; g.lineWidth = 1; g.stroke();
    }
    // her field of view, so "left" and "right" are readable
    g.beginPath();
    g.moveTo(cx, cy);
    g.arc(cx, cy, R * 1.02, -state.heading - Math.PI / 2 - 1.05, -state.heading - Math.PI / 2 + 1.05);
    g.closePath();
    g.fillStyle = 'rgba(150,200,214,.045)'; g.fill();

    // threats
    for (const t of state.threats) {
      const [tx, ty] = t.pos;
      const x = cx + tx * R, y = cy - ty * R;
      const rad = Math.max(3, t.size * R * (0.6 + t.loom * 1.6));
      g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2);
      g.fillStyle = t.hit ? bad : `rgba(232,101,75,${(0.30 + t.loom * 0.6).toFixed(3)})`;
      g.fill();
      g.beginPath(); g.arc(x, y, rad + 4 + t.loom * 8, 0, Math.PI * 2);
      g.strokeStyle = `rgba(232,101,75,${(0.16 * (1 - t.loom)).toFixed(3)})`;
      g.lineWidth = 1.5; g.stroke();
    }

    // her, as a heading marker — the 3D fly is beside this, this is the map
    const fx = cx, fy = cy;
    g.save();
    g.translate(fx, fy);
    g.rotate(-state.heading);
    g.beginPath();
    g.moveTo(0, -11); g.lineTo(7, 8); g.lineTo(0, 4); g.lineTo(-7, 8);
    g.closePath();
    g.fillStyle = state.airborne > 0.2 ? '#FFF1D8' : amber;
    g.fill();
    g.restore();
    if (state.airborne > 0.05) {
      g.beginPath(); g.arc(fx, fy, 13 + state.airborne * 16, 0, Math.PI * 2);
      g.strokeStyle = `rgba(255,241,216,${(state.airborne * 0.5).toFixed(3)})`;
      g.lineWidth = 2; g.stroke();
    }

    // label the inner ring: crossing it is contact, so distance reads as time left
    g.fillStyle = ink3;
    g.font = '9.5px "IBM Plex Mono", ui-monospace, monospace';
    g.fillText('contact', cx + R * 0.33 + 6, cy - 3);
  }
}
