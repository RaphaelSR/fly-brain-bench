import * as THREE from '../vendor/three/three.module.min.js';
import { cameraDistance } from '../js/fly.js';

export const selectBrain = () => 'whole';

// Low ballistic arc to the point the player touched, not the fly's future path.
export function aimElevation(origin, point, power) {
  const range = Math.max(0.25, Math.hypot(point.x - origin.x, point.z - origin.z));
  const height = point.y - origin.y, speed = 4 + power * 0.095, v2 = speed * speed;
  const discriminant = v2 * v2 - 4 * (4 * range * range + 2 * height * v2);
  const angle = discriminant >= 0 ? Math.atan2(v2 - Math.sqrt(discriminant), 4 * range) : Math.atan2(height, range) / 2 + Math.PI / 4;
  return Math.max(-35, Math.min(70, angle * 180 / Math.PI));
}

export function aimingFraming(frame, origin, aspect) {
  const gap = Math.hypot(frame.x - origin.x, frame.z - origin.z);
  const target = new THREE.Vector3(frame.x * 0.65 + origin.x * 0.35, 0.8 + frame.height * 0.55, frame.z * 0.65 + origin.z * 0.35);
  const horizontal = 15 + gap * 0.45, vertical = 5.2 - target.y;
  return { target, distance: Math.hypot(horizontal, vertical) / cameraDistance(1, aspect, true),
    pitch: Math.atan2(vertical, horizontal), yaw: Math.atan2(origin.x - frame.x, origin.z - frame.z) + 0.22 };
}
