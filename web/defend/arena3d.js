/* The same approach, from inside it.

   The flat view is the better instrument — you can read the geometry at a glance,
   which is why it is the default. This one is the better *look*, and it makes one
   thing legible that the map cannot: the escape is a body doing something. She
   rolls away, her legs tuck, the wings come up, and she is off the ground before
   it arrives.

   Nothing here is a second simulation. It is fed exactly the state object the 2D
   arena is fed, and the fly is the bench's own renderer with three hooks added —
   somewhere else for the camera to look, a per-eye glow, and a callback for the
   rest of the world. The eye that lights is the eye being driven, which is the
   same number the flat view draws as a wedge. */

import { FlyView } from '../js/fly.js';

const WORLD = 3.1;            // arena radius, in fly-lengths
const CONTACT = 0.34;         // where the flat view draws its contact ring

export class Arena3D {
  constructor(canvas) {
    this.c = canvas;
    this.view = new FlyView(canvas);
    this.view.pitch = -0.40;
    this.view.dist = 4.9;
    this.view.onExtra = (vp, eye, part) => this._world(part);
    this.labels = { contact: 'contact' };
    this.t = 0;
    this.flare = 0;
    this.shake = 0;
    this.leapDir = 0;
    this.eye = [0, 0];
    this.threat = null;
    this.parts = [];
    this.yawGoal = 0;
  }

  /* --- the same events the flat arena takes --- */
  glance() { this.flare = 1; }
  leap(dir) {
    this.leapDir = dir || 0;
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2, s = 0.3 + Math.random() * 1.1;
      this.parts.push({ p: [0, 0.02, 0], v: [Math.cos(a) * s, 0.6 + Math.random(), Math.sin(a) * s],
        age: 0, life: 0.5 + Math.random() * 0.4, r: 0.03 + Math.random() * 0.04 });
    }
  }
  impact() {
    this.shake = 1;
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, s = 1 + Math.random() * 2.2;
      this.parts.push({ p: [0, 0.12, 0], v: [Math.cos(a) * s, 0.9 + Math.random() * 1.6, Math.sin(a) * s],
        age: 0, life: 0.4 + Math.random() * 0.4, r: 0.03 + Math.random() * 0.05, hot: true });
    }
  }
  reset() {
    this.parts.length = 0;
    this.leapDir = 0;
    this.eye = [0, 0];
    const s = this.view.s;
    s.pos[0] = 0; s.pos[2] = 0; s.heading = 0; s.roll = 0;
    s.jump = 0; s.airborne = 0; s.lift = 0; s.wing = 0;
  }

  draw(state, dt) {
    dt = Math.max(0, Math.min(dt, 0.05));
    this.t += dt;
    this.flare = Math.max(0, this.flare - dt * 2.6);
    this.shake = Math.max(0, this.shake - dt * 3.2);
    const v = this.view, s = v.s;
    const drive = state.drive || { l: 0, r: 0 };
    const boost = 1 + this.flare * 0.5;
    for (const i of [0, 1]) {
      const want = (i ? drive.r : drive.l) * boost;
      this.eye[i] += (want - this.eye[i]) * Math.min(1, dt * 9);
    }
    v.eyeGlow = this.eye;

    this.threat = state.threat || null;

    /* She leans rather than turns: the escape is a roll away from the thing and a
       leap along it, and turning would let her spin out of trouble, which is the
       exact hole the scenario was rebuilt to close. */
    const lean = state.lean || 0;
    s.heading += (lean * 0.30 - s.heading) * Math.min(1, dt * 9);
    v.update({ escape: state.airborne || 0, wing: state.airborne || 0 }, dt);
    s.roll += (-lean * 0.44 * (0.4 + (state.airborne || 0)) - s.roll) * Math.min(1, dt * 8);

    // the leap carries her clear, and her legs come up with her
    const air = state.airborne || 0;
    const want = this.leapDir * air * 0.85;
    s.pos[0] += (want - s.pos[0]) * Math.min(1, dt * 6);
    if (air > 0.08) {
      for (const f of v.feet) {
        f[0] += (s.pos[0] + (f[0] - s.pos[0]) * 0.45 - f[0]) * Math.min(1, dt * 7);
        f[2] += (s.pos[2] + (f[2] - s.pos[2]) * 0.45 - f[2]) * Math.min(1, dt * 7);
        f[1] += (s.lift * 0.55 - f[1]) * Math.min(1, dt * 7);
      }
    }

    /* Frame her and the thing coming at her, from the side of the approach, and
       pull back far enough that both stay in shot — a fixed distance put the
       threat outside the frame for the first four glances, which are exactly the
       ones where nothing has happened yet and the approach is the only thing to
       watch. */
    const tp = this._threatPos();
    v.camFocus = tp ? [(s.pos[0] + tp[0]) * 0.42, 0.16, (s.pos[2] + tp[2]) * 0.42] : [s.pos[0], 0.16, s.pos[2]];
    if (!v.userMoved) {
      if (this.threat) {
        this.yawGoal = this.threat.a + Math.PI / 2;
        let d = ((this.yawGoal - v.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        v.yaw += d * Math.min(1, dt * 1.4);
      }
      const reach = tp ? Math.hypot(tp[0] - s.pos[0], tp[2] - s.pos[2]) : WORLD;
      const want = 2.4 + reach * 0.95;
      v.dist += (want - v.dist) * Math.min(1, dt * 1.6);
      v.pitch += (-0.46 - v.pitch) * Math.min(1, dt * 1.5);
    }
    if (this.shake > 0.001) {
      const k = this.shake * this.shake * 0.05;
      v.camFocus[0] += (Math.random() - 0.5) * k;
      v.camFocus[1] += (Math.random() - 0.5) * k;
    }

    for (let i = this.parts.length - 1; i >= 0; i--) {
      const p = this.parts[i];
      p.age += dt;
      if (p.age >= p.life) { this.parts.splice(i, 1); continue; }
      for (let a = 0; a < 3; a++) p.p[a] += p.v[a] * dt;
      p.v[1] -= 4.2 * dt;
      p.v[0] *= 0.96; p.v[2] *= 0.96;
      if (p.p[1] < 0.01) { p.p[1] = 0.01; p.v[1] = Math.abs(p.v[1]) * 0.25; }
    }

    v.draw();
  }

  _threatPos() {
    if (!this.threat) return null;
    const t = this.threat;
    const r = t.r * WORLD;
    return [Math.sin(t.a) * r, 0, Math.cos(t.a) * r];
  }

  /* everything in this world that is not her, drawn with her camera */
  _world(part) {
    const gl = this.view.gl;
    const tp = this._threatPos();
    const sphere = this.view.sphere;

    const tr = (x, y, z) => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, x,y,z,1]);
    const sc = (a, b, c) => new Float32Array([a,0,0,0, 0,b,0,0, 0,0,c,0, 0,0,0,1]);
    const mul = (A, B) => {
      const o = new Float32Array(16);
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
        let s = 0; for (let k = 0; k < 4; k++) s += A[k * 4 + j] * B[i * 4 + k];
        o[i * 4 + j] = s;
      }
      return o;
    };
    const at = (x, y, z, r, ry = r, rz = r) => mul(tr(x, y, z), sc(r, ry, rz));

    // the ring that means contact, as a line of markers on the ground
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    const cr = CONTACT * WORLD;
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * Math.PI * 2;
      part(sphere, at(Math.sin(a) * cr, 0.012, Math.cos(a) * cr, 0.028, 0.004, 0.028),
        [0.91, 0.40, 0.29], 0.55, 0.5, 0.1);
    }
    // and the outer edge of the arena, quieter
    for (let i = 0; i < 64; i++) {
      const a = (i / 64) * Math.PI * 2;
      part(sphere, at(Math.sin(a) * WORLD, 0.01, Math.cos(a) * WORLD, 0.026, 0.004, 0.026),
        [0.35, 0.50, 0.55], 0.30, 0.18, 0.1);
    }

    if (tp) {
      const loom = this.threat.loom;
      const R = 0.16 + loom * 0.52;
      // the line it is coming down
      const n = 9;
      for (let i = 1; i < n; i++) {
        const f = i / n;
        part(sphere, at(tp[0] * f, 0.014, tp[2] * f, 0.022, 0.004, 0.022),
          [0.91, 0.40, 0.29], 0.10 + loom * 0.22, 0.4, 0.1);
      }
      // what it throws on the ground
      part(sphere, at(tp[0], 0.006, tp[2], R * 1.15, 0.002, R * 1.15), [0, 0, 0], 0.45, 0, 0);
      // and the leading pressure wave
      const pulse = (this.t * (1.1 + loom * 3.2)) % 1;
      part(sphere, at(tp[0], R * 0.92, tp[2], R * (1 + pulse * 0.9)),
        [0.95, 0.45, 0.32], (1 - pulse) * 0.22, 0.5, 0.1);
      gl.depthMask(true);
      gl.disable(gl.BLEND);
      part(sphere, at(tp[0], R * 0.92, tp[2], R), [0.86, 0.33, 0.22], 1, 0.30, 0.55);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      gl.depthMask(false);
    }

    for (const p of this.parts) {
      const k = 1 - p.age / p.life;
      part(sphere, at(p.p[0], p.p[1], p.p[2], p.r * (0.4 + k * 0.6)),
        p.hot ? [1.0, 0.62, 0.35] : [0.72, 0.66, 0.55], k * 0.8, p.hot ? 0.8 : 0.1, 0.1);
    }

    gl.depthMask(true);
    gl.disable(gl.BLEND);
  }
}
