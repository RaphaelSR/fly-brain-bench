import * as THREE from '../vendor/three/three.module.min.js';
import { FlyView } from '../js/fly.js';
import { ImpactBody } from './impact.js';
import { createCourtyard, createObjects, createThrower } from './courtyard.js';

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
    createCourtyard(this.view);
    this.carrier = new THREE.Group();
    this.carrier.add(this.view.rig.root);
    scene.add(this.carrier);
    this.threat = new THREE.Group();
    this.objects = createObjects();
    this.threat.add(...Object.values(this.objects));
    this.setObject('slipper');
    scene.add(this.threat);
    this.hand = createThrower(); scene.add(this.hand); this.hand.visible = false;
    this.halo = new THREE.Mesh(new THREE.RingGeometry(0.9, 1, 80),
      new THREE.MeshBasicMaterial({ color: 0xf47752, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false }));
    this.halo.rotation.x = -Math.PI / 2;
    scene.add(this.halo);
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
  setObject(name) {
    for (const [key, object] of Object.entries(this.objects)) object.visible = key === name;
  }
  reset() {
    this.time = 0; this.flare = 0; this.hit = 0;
    this.physics = null;
    this.carrier.position.set(0, 0, 0); this.carrier.rotation.set(0, 0, 0);
    this.view.rig.reset();
    this.hand.visible = false;
    this.view.cinematic = null;
  }

  drawLive(frame, episode, dt, cinematic = true) {
    const rig = this.view.rig;
    this.halo.visible = false; this.approach.visible = false; this.pulse.visible = false;
    this.setObject('slipper');
    if (frame.hit) {
      rig.pose({ air: frame.tuck * 0.7, wing: frame.tuck * 0.2 }, dt);
      rig.root.position.y = -0.52;
      this.carrier.position.set(frame.x, 0.52 + frame.height, frame.z);
      this.carrier.rotation.set(frame.pitch, frame.heading, frame.roll);
    } else {
      this.carrier.position.set(0, 0, 0); this.carrier.rotation.set(0, 0, 0);
      rig.pose({ x: frame.x, z: frame.z, heading: frame.heading, height: frame.height,
        air: frame.air, wing: frame.air, lean: frame.lean }, dt);
    }
    const p = frame.projectile;
    this.threat.position.set(p.x, p.y, p.z); this.threat.rotation.set(0, p.yaw, 0);
    this.hand.visible = frame.t < 1.1;
    const withdraw = Math.max(0, frame.t - 0.5) * 5;
    this.hand.position.set(episode.launch.x + Math.sin(episode.angle) * withdraw,
      episode.launch.y + 0.3 + withdraw, episode.launch.z + Math.cos(episode.angle) * withdraw);
    this.hand.rotation.set(-Math.min(0.6, frame.t) * 0.5, episode.angle, -0.12);
    const gap = Math.hypot(p.x - frame.x, p.z - frame.z);
    const mix = frame.t < episode.approach + 0.55 ? 0.18 : 0;
    this.view.target.set(frame.x + (p.x - frame.x) * mix, 0.5 + Math.max(0, frame.height) * 0.6,
      frame.z + (p.z - frame.z) * mix);
    this.view.cinematic = cinematic ? { distance: 10.5 + Math.min(6, gap) * 0.6, pitch: 0.43, yaw: 0.65 } : null;
    this.view.draw(dt);
  }

  draw(state, dt) {
    this.hand.visible = false;
    this.halo.visible = true; this.approach.visible = true; this.pulse.visible = true;
    this.view.target.set(0, 0.35, 0);
    this.time += dt;
    this.flare = Math.max(0, this.flare - dt * 2);
    this.hit = Math.max(0, this.hit - dt * 1.5);
    const pose = escapePose(state);
    if (state.done && !state.ok) {
      if (!this.physics) this.physics = new ImpactBody(pose, state.threat.a);
      const body = this.physics;
      body.update(Math.max(0, state.outcomeAge - body.age - body.remainder));
      this.view.rig.pose({ air: body.tuck * 0.7, wing: body.tuck * 0.25 }, dt);
      this.view.rig.root.position.y = -0.52;
      this.carrier.position.set(body.x, body.y, body.z);
      this.carrier.rotation.set(body.pitch, 0, body.roll);
    } else {
      if (state.done) {
        const landing = Math.max(0, 1 - state.outcomeAge / 0.7);
        pose.height *= landing; pose.air *= landing; pose.wing *= landing;
      }
      this.view.rig.pose(pose, dt);
    }
    const threat = state.threat;
    if (threat) {
      const distance = state.done ? 1.03 - Math.min(2.5, state.outcomeAge * 1.6) : 3.7 - state.progress * 2.67;
      const x = Math.sin(threat.a) * distance;
      const z = Math.cos(threat.a) * distance;
      this.threat.position.set(x, 0, z);
      this.threat.rotation.y = threat.a;
      this.halo.position.set(x, 0.009, z);
      this.halo.scale.setScalar(0.72);
      this.halo.material.opacity = state.done ? 0 : 0.1;
      const pos = this.approach.geometry.attributes.position;
      pos.setXYZ(0, 0, 0.008, 0); pos.setXYZ(1, x, 0.008, z);
      pos.needsUpdate = true;
      this.approach.computeLineDistances();
      this.approach.geometry.computeBoundingSphere();
    }
    this.pulse.scale.setScalar(0.5 + (1 - this.flare) * 0.7);
    this.pulse.position.x = this.physics?.x || 0;
    this.pulse.position.z = this.physics?.z || 0;
    this.pulse.material.opacity = this.hit * 0.35 + this.flare * 0.14;
    this.pulse.material.color.setHex(this.hit > 0 ? 0xf07556 : 0x74c7d4);
    this.view.draw();
  }

  dispose() { this.view.dispose(); }
}
