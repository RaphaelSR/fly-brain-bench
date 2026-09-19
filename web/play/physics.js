import { WORLD_STEP, WINDUP } from '../defend/survival.js?v=patio2';
import { PlayWorld } from './world.js';
import { advanceProps } from './props.js';
export { WORLD_STEP };

export const SHOT_SECONDS = 3.6;
const bounded = (v, lo, hi) => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;

export function makeShot(origin, aim, power, elevation) {
  if (!origin || !aim || !bounded(origin.x, -24, 24) || !bounded(origin.z, -24, 24) ||
      !bounded(origin.y, 0.1, 8) || !bounded(aim.x, -16, 16) || !bounded(aim.z, -16, 16) ||
      !bounded(power, 25, 100) || !bounded(elevation, -35, 40)) throw new Error('Invalid shot');
  const dx = aim.x - origin.x, dz = aim.z - origin.z, length = Math.hypot(dx, dz);
  if (length < 0.25) throw new Error('Aim farther from the thrower');
  const speed = 4 + power * 0.095, angle = elevation * Math.PI / 180;
  return { origin: { ...origin }, vx: dx / length * speed * Math.cos(angle),
    vz: dz / length * speed * Math.cos(angle), vy: speed * Math.sin(angle),
    angle: Math.atan2(-dx, -dz) };
}

export function launch(world, shot) {
  world.time = WINDUP; world.projectileActive = true; world.used = false;
  world.angle = shot.angle; world.launch = { ...shot.origin };
  world.projectile = { ...shot.origin, yaw: shot.angle };
  world.pvx = shot.vx; world.pvy = shot.vy; world.pvz = shot.vz;
}

// The preview and immobile control use the exact projectile integrator/colliders.
// Neither predicts the live fly or passes a predicted contact to its controller.
export function traceShot(shot, fly = null, props = fly?.props) {
  const world = new PlayWorld({ props });
  launch(world, shot);
  if (fly) Object.assign(world, { x: fly.x, z: fly.z, height: fly.height });
  const points = [{ ...world.projectile }]; let wouldHit = false, contactAt = null;
  for (let i = 0; i < Math.round(SHOT_SECONDS / WORLD_STEP); i++) {
    world.time += WORLD_STEP; advanceProps(world.props, WORLD_STEP); world.advanceProjectile();
    if (fly && world.collides()) { wouldHit = true; contactAt ??= world.time; }
    if (i % 4 === 3) points.push({ ...world.projectile });
  }
  return { points, wouldHit, contactAt };
}
