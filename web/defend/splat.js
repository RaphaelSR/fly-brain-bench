import * as THREE from '../vendor/three/three.module.min.js';

// Presentation only: no collision or reward is decided by this effect.
export class Splat {
  constructor(scene) {
    this.root = new THREE.Group(); scene.add(this.root);
    const material = new THREE.MeshStandardMaterial({ color: 0x74a82e, roughness: 0.28, metalness: 0.02 });
    this.drops = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), material, 28);
    this.stains = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 12, 6), material, 29);
    this.drops.frustumCulled = false; this.stains.frustumCulled = false;
    this.root.add(this.drops, this.stains);
    this.dummy = new THREE.Object3D();
    this.reset();
  }
  reset() { this.root.visible = false; }
  update(frame, episode, enabled) {
    if (!enabled || !frame.hit || episode.contactAt == null) { this.reset(); return 0; }
    this.root.visible = true;
    const origin = episode.frames.find(f => f.hit) || frame;
    const age = Math.max(0, frame.t - episode.contactAt), y0 = Math.max(0.1, origin.height + 0.52);
    for (let i = 0; i < 28; i++) {
      const a = i * 2.39996 + episode.angle, speed = 0.6 + (i * 7 % 13) / 6, vy = 0.6 + (i % 5) * 0.3;
      const groundAt = (vy + Math.sqrt(vy * vy + 19.6 * y0)) / 9.8;
      const t = Math.min(age, groundAt), grounded = age >= groundAt;
      const x = origin.x + Math.sin(a) * speed * t, z = origin.z + Math.cos(a) * speed * t;
      const radius = 0.035 + (i % 4) * 0.012;
      this.dummy.position.set(x, Math.max(0.015, y0 + vy * t - 4.9 * t * t), z);
      this.dummy.scale.setScalar(grounded ? 0 : radius);
      this.dummy.updateMatrix(); this.drops.setMatrixAt(i, this.dummy.matrix);
      this.dummy.position.y = 0.015;
      this.dummy.scale.set(grounded ? radius * 3 : 0, grounded ? 0.015 : 0, grounded ? radius * 2 : 0);
      this.dummy.updateMatrix(); this.stains.setMatrixAt(i, this.dummy.matrix);
    }
    const squash = 1 - Math.exp(-age * 16);
    const settled = frame.height < -0.15;
    this.dummy.position.set(frame.x, 0.012, frame.z);
    this.dummy.scale.set(settled ? 0.65 * squash : 0, 0.016, settled ? 0.85 * squash : 0);
    this.dummy.updateMatrix(); this.stains.setMatrixAt(28, this.dummy.matrix);
    this.drops.instanceMatrix.needsUpdate = true; this.stains.instanceMatrix.needsUpdate = true;
    return squash;
  }
}
