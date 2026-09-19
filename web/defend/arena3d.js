import * as THREE from '../vendor/three/three.module.min.js';
import { FlyView } from '../js/fly.js';

const WORLD = 2.2;

// The replay owns timing and decisions; the renderer only interpolates the pose.
export function escapePose(state) {
  const air = Math.max(0, Math.min(1, state.airborne || 0));
  const elapsed = state.leapAge ?? 0;
  const takeoff = 1 - Math.exp(-elapsed * 14);
  const lift = Math.sin(Math.PI * air * 0.85) * takeoff;
  const travel = Math.min(1, elapsed / 0.7);
  return { x: (state.leapLean || 0) * travel * 0.85, z: -travel * 0.14,
    height: lift * 0.9, air: lift, wing: Math.min(1, lift * 2),
    lean: state.lean || 0, crouch: state.anticipation || 0,
    eyes: [state.drive?.l || 0, state.drive?.r || 0] };
}

export class Arena3D {
  constructor(canvas) {
    this.c = canvas;
    this.view = new FlyView(canvas, { arena: true });
    this.labels = {};
    const scene = this.view.scene;
    this.threat = new THREE.Group();
    const core = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3),
      new THREE.MeshStandardMaterial({ color: 0x762f28, roughness: 0.28, metalness: 0.5,
        emissive: 0x9e3929, emissiveIntensity: 0.22 }));
    core.castShadow = true;
    this.threat.add(core);
    const cage = new THREE.Mesh(new THREE.IcosahedronGeometry(1.012, 1),
      new THREE.MeshBasicMaterial({ color: 0xf3a17b, wireframe: true, transparent: true, opacity: 0.22 }));
    this.threat.add(cage);
    scene.add(this.threat);
    this.halo = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 80),
      new THREE.MeshBasicMaterial({ color: 0xf47752, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
    this.halo.rotation.x = -Math.PI / 2;
    scene.add(this.halo);
    for (const r of [0.95, WORLD]) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(r, r + 0.012, 128),
        new THREE.MeshBasicMaterial({ color: r < 1 ? 0xb4764e : 0x52727c, transparent: true, opacity: 0.4, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.006;
      scene.add(ring);
    }
    const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    this.approach = new THREE.Line(geo, new THREE.LineDashedMaterial({ color: 0xb8664c, dashSize: 0.09, gapSize: 0.09, transparent: true, opacity: 0.45 }));
    scene.add(this.approach);
    this.pulse = new THREE.Mesh(new THREE.RingGeometry(0.97, 1, 64),
      new THREE.MeshBasicMaterial({ color: 0x74c7d4, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
    this.pulse.rotation.x = -Math.PI / 2; this.pulse.position.y = 0.012;
    scene.add(this.pulse);
    this.reset();
  }

  glance() { this.flare = 1; }
  leap() { this.flare = 1; }
  impact() { this.hit = 1; }
  reset() {
    this.time = 0; this.flare = 0; this.hit = 0;
    this.view.rig.reset();
  }

  draw(state, dt) {
    this.time += dt;
    this.flare = Math.max(0, this.flare - dt * 2);
    this.hit = Math.max(0, this.hit - dt * 1.5);
    this.view.rig.pose(escapePose(state), dt);
    const threat = state.threat;
    if (threat) {
      const radius = 0.19 + threat.loom * 0.28;
      const x = Math.sin(threat.a) * threat.r * WORLD;
      const z = Math.cos(threat.a) * threat.r * WORLD;
      this.threat.position.set(x, radius + 0.05, z);
      this.threat.scale.setScalar(radius);
      this.threat.rotation.y = this.time * 0.22;
      this.threat.rotation.z = this.time * 0.12;
      this.halo.position.set(x, 0.009, z);
      this.halo.scale.setScalar(radius * (1.5 + Math.sin(this.time * 4) * 0.08));
      const pos = this.approach.geometry.attributes.position;
      pos.setXYZ(0, 0, 0.008, 0); pos.setXYZ(1, x, 0.008, z);
      pos.needsUpdate = true;
      this.approach.computeLineDistances();
      this.approach.geometry.computeBoundingSphere();
    }
    this.pulse.scale.setScalar(0.5 + (1 - this.flare) * 0.7);
    this.pulse.material.opacity = this.flare * 0.3;
    this.pulse.material.color.setHex(this.hit > 0 ? 0xf07556 : 0x74c7d4);
    this.view.draw();
  }

  dispose() { this.view.dispose(); }
}
