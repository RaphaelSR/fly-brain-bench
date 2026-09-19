import { SurvivalWorld, WORLD_STEP } from '../defend/survival.js?v=patio2';
import { PERCHES } from '../defend/world-layout.js';
import { PROPS, newProps, propCollider, pushProp, advanceProps } from './props.js';

export class PlayWorld extends SurvivalWorld {
  constructor(options = {}) { super({ ...options, expanded: true }); this.props = options.props ? structuredClone(options.props) : newProps(); }
  get solids() { return [...PERCHES, ...this.props.map((p, i) => propCollider(p, PROPS[i]))]; }
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
  frame() { return { ...super.frame(), props: this.props.map(p => ({ ...p })) }; }
}
