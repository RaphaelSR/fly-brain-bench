import { SurvivalWorld, WORLD_STEP } from '../defend/survival.js?v=patio2';
import { PERCHES } from '../defend/world-layout.js';
import { PROPS, newProps, propCollider, pushProp, advanceProps } from './props.js';

export const MAX_ALTITUDE = 6;
export const FLIGHT_ACTIONS = ['hover', 'lean left', 'lean right', 'take off', 'forward', 'turn left', 'turn right', 'land', 'climb', 'descend', 'strafe left', 'strafe right'];
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export class PlayWorld extends SurvivalWorld {
  constructor(options = {}) {
    super({ ...options, expanded: true }); this.props = options.props ? structuredClone(options.props) : newProps();
    this.flying = this.height > 0; this.altitude = this.height; this.landing = false;
    this.forward = 0; this.strafe = 0;
  }
  get solids() { return [...PERCHES, ...this.props.map((p, i) => propCollider(p, PROPS[i]))]; }
  act(action) {
    if (!Number.isInteger(action) || action < 0 || action >= FLIGHT_ACTIONS.length) throw new Error('Invalid flight action');
    if (this.hit) return -0.1;
    if (action === 0) { this.forward = 0; this.strafe = 0; this.altitude = this.height; }
    if (action === 1 || action === 2) this.lean = action === 1 ? -1 : 1;
    if (action === 3 || action === 8) {
      this.landing = false; this.flying = true; this.used = true;
      this.altitude = clamp(action === 3 ? Math.max(this.height + 1.5, this.altitude) : this.altitude + 0.75, 0, MAX_ALTITUDE);
      if (action === 3) this.strafe = this.lean;
    }
    if (action === 4) { this.forward = 1; this.strafe = 0; }
    if (action === 5 || action === 6) this.heading = Math.atan2(Math.sin(this.heading + (action === 5 ? -0.35 : 0.35)), Math.cos(this.heading + (action === 5 ? -0.35 : 0.35)));
    if (action === 7) { this.landing = true; this.altitude = 0; this.forward = 0; this.strafe = 0; }
    if (action === 9) this.altitude = Math.max(0, this.altitude - 0.75);
    if (action === 10 || action === 11) { this.strafe = action === 10 ? -1 : 1; this.forward = 0; }
    return action === 0 ? 0 : -0.01;
  }
  advanceFly(dt) {
    if (this.impact) { super.advanceFly(dt); return; }
    // Bounded motor/lift model in scene units, not calibrated insect aerodynamics.
    if (this.flying) {
      const vertical = clamp((this.altitude - this.height) * 2.5, -2.8, 2.8);
      this.vy += (5.8 + clamp((vertical - this.vy) * 6, -9, 9)) * dt;
    }
    const speed = this.flying ? 3.4 : 0.8, c = Math.cos(this.heading), s = Math.sin(this.heading);
    const tx = (s * this.forward + c * this.strafe) * speed, tz = (c * this.forward - s * this.strafe) * speed;
    this.vx += clamp((tx - this.vx) * 5, -10, 10) * dt;
    this.vz += clamp((tz - this.vz) * 5, -10, 10) * dt;
    super.advanceFly(dt);
    if (this.height >= MAX_ALTITUDE) { this.height = MAX_ALTITUDE; this.vy = Math.min(0, this.vy); }
    if (this.height <= (this.floor || 0) + 0.005 && (this.landing || this.altitude <= (this.floor || 0))) {
      this.flying = false; this.landing = false; this.altitude = this.height;
    }
  }
  nudge(id, dx, dz) {
    const i = PROPS.findIndex(p => p.id === id);
    if (i < 0 || !Number.isFinite(dx) || !Number.isFinite(dz) || Math.hypot(dx, dz) < 0.01) throw new Error('Invalid object');
    pushProp(this.props[i], PROPS[i], dx, dz, 5);
  }
  step() { advanceProps(this.props, WORLD_STEP); super.step(); }
  advanceProjectile() {
    const dt = WORLD_STEP, p = this.projectile;
    this.pvy -= 4 * dt;
    p.x += this.pvx * dt; p.z += this.pvz * dt; p.y += this.pvy * dt;
    p.yaw = this.angle + Math.sin((this.time - 0.55) * 2) * 0.12;
    if (p.y < 0.06) {
      p.y = 0.06; this.pvy = this.pvy < -0.4 ? -this.pvy * 0.18 : 0;
      this.pvx *= Math.exp(-6 * dt); this.pvz *= Math.exp(-6 * dt);
    }
    for (const solid of this.solids) {
      const dx = p.x - solid.x, dz = p.z - solid.z, distance = Math.hypot(dx, dz);
      if (p.y > solid.height || distance >= solid.radius + 0.7) continue;
      const nx = distance > 1e-8 ? dx / distance : 1, nz = distance > 1e-8 ? dz / distance : 0;
      const toward = this.pvx * nx + this.pvz * nz;
      p.x = solid.x + nx * (solid.radius + 0.7); p.z = solid.z + nz * (solid.radius + 0.7);
      if (toward >= 0) continue;
      const i = PROPS.findIndex(d => d.id === solid.id);
      if (i >= 0) pushProp(this.props[i], PROPS[i], -nx, -nz, -toward * 0.75);
      this.pvx -= toward * nx * 1.25; this.pvz -= toward * nz * 1.25;
      this.pvx *= 0.65; this.pvz *= 0.65;
    }
    for (const key of ['x', 'z']) if (p[key] < -18.5 && p.y < 7) {
      p[key] = -18.5; this[`pv${key}`] = Math.abs(this[`pv${key}`]) * 0.25;
    }
  }
  frame() { return { ...super.frame(), flying: this.flying, altitude: this.altitude, props: this.props.map(p => ({ ...p })) }; }
}
