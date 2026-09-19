export const PROPS = [
  { id: 'fern', kind: 'plant', x: -4.8, z: -3.2, radius: 0.65, height: 1.25, mass: 2.4 },
  { id: 'palm', kind: 'plant', x: 3, z: -4.5, radius: 0.8, height: 1.6, mass: 3 },
  { id: 'jade', kind: 'plant', x: -7, z: 2, radius: 0.7, height: 1.3, mass: 2.6 },
  { id: 'bottle', kind: 'bottle', x: 2.1, z: 1.5, radius: 0.23, height: 0.85, mass: 0.65 },
  { id: 'mug', kind: 'mug', x: -2.3, z: -0.8, radius: 0.32, height: 0.55, mass: 0.8 },
  { id: 'bucket', kind: 'bucket', x: 6, z: 0.2, radius: 0.65, height: 1.05, mass: 1.5 },
  { id: 'back-plant', kind: 'plant', x: -8, z: -9, radius: 1, height: 1.8, mass: 3.5 },
  { id: 'door-plant', kind: 'plant', x: 8, z: -10, radius: 0.9, height: 1.7, mass: 3.2 },
];
export function newProps() {
  return PROPS.map(p => ({ id: p.id, x: p.x, z: p.z, angle: 0, omega: 0, dx: 1, dz: 0, vx: 0, vz: 0 }));
}
export function propCollider(p, definition) {
  const lean = Math.sin(p.angle);
  return { id: p.id, x: p.x + p.dx * lean * definition.height * 0.4,
    z: p.z + p.dz * lean * definition.height * 0.4,
    radius: definition.radius + lean * definition.height * 0.35,
    height: Math.cos(p.angle) * definition.height + lean * definition.radius * 1.6 };
}
export function pushProp(p, definition, dx, dz, strength) {
  const length = Math.hypot(dx, dz) || 1;
  if (p.angle < 0.1) { p.dx = dx / length; p.dz = dz / length; }
  const impulse = Math.min(8, Math.max(0, strength)) / definition.mass;
  p.omega = Math.min(5, p.omega + impulse * 0.7);
  p.vx += dx / length * impulse * 0.4; p.vz += dz / length * impulse * 0.4;
}
export function advanceProps(props, dt) {
  for (const p of props) {
    if (p.angle > 0 || p.omega > 0) {
      p.omega += Math.sin(p.angle) * 3.2 * dt;
      p.omega *= Math.exp(-1.4 * dt);
      p.angle = Math.min(Math.PI / 2, Math.max(0, p.angle + p.omega * dt));
      if (p.angle >= Math.PI / 2) p.omega = 0;
    }
    p.x = Math.max(-15, Math.min(15, p.x + p.vx * dt));
    p.z = Math.max(-15, Math.min(15, p.z + p.vz * dt));
    p.vx *= Math.exp(-3 * dt); p.vz *= Math.exp(-3 * dt);
  }
}
