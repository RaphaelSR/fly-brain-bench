// Presentation-only contact response. The recorded policy still owns the verdict.
export const IMPACT_STEP = 1 / 240;

export class ImpactBody {
  constructor(pose, angle, { recover = true } = {}) {
    this.recover = recover;
    this.x = pose.x; this.y = 0.52 + pose.height; this.z = pose.z;
    this.vx = -Math.sin(angle) * 2.7;
    this.vy = 2.5;
    this.vz = -Math.cos(angle) * 2.7;
    this.pitch = -(pose.air || 0) * 0.32;
    this.roll = -(pose.lean || 0) * 0.38;
    this.wx = -Math.cos(angle) * 6;
    this.wz = Math.sin(angle) * 7;
    this.age = 0; this.remainder = 0; this.contacts = 0;
  }

  update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;
    this.remainder += dt;
    while (this.remainder + 1e-10 >= IMPACT_STEP) {
      this.integrate(IMPACT_STEP);
      this.remainder = Math.max(0, this.remainder - IMPACT_STEP);
    }
  }

  integrate(h) {
    this.age += h;
    const recovering = this.recover && this.age > 0.85;
    const support = 0.3 + (this.recover ? 0.22 * Math.min(1, Math.max(0, (this.age - 1.05) / 0.65)) : 0);
    this.vy -= 12 * h;
    this.x += this.vx * h; this.y += this.vy * h; this.z += this.vz * h;
    const grounded = this.y <= support;
    if (grounded) {
      this.y = support;
      if (this.vy < -0.5) this.contacts++;
      this.vy = this.vy < -0.65 ? -this.vy * 0.22 : 0;
    }
    const friction = Math.exp(-(grounded ? 9 : 0.7) * h);
    this.vx *= friction; this.vz *= friction;
    const stiffness = recovering ? 40 : 0;
    const damping = recovering ? 12 : grounded ? 8 : 2.4;
    this.wx += (-stiffness * this.pitch - damping * this.wx) * h;
    this.wz += (-stiffness * this.roll - damping * this.wz) * h;
    this.pitch += this.wx * h; this.roll += this.wz * h;
  }

  get tuck() { return this.recover ? Math.max(0, 1 - Math.max(0, this.age - 0.85) / 0.85) : 0.7; }
}
