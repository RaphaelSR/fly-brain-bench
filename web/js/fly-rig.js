import * as THREE from '../vendor/three/three.module.min.js';

const UP = new THREE.Vector3(0, 1, 0);
const damp = (a, b, rate, dt) => THREE.MathUtils.damp(a, b, rate, dt);
const v3 = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);

export class FlyRig {
  constructor() {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.sphere = new THREE.SphereGeometry(1, 24, 16);
    this.bone = new THREE.CylinderGeometry(1, 0.7, 1, 8);
    this.shell = new THREE.MeshStandardMaterial({ color: 0x9e7643, roughness: 0.4, metalness: 0.25 });
    this.dark = new THREE.MeshStandardMaterial({ color: 0x30291e, roughness: 0.48 });
    this.gold = new THREE.MeshStandardMaterial({ color: 0xc19960, roughness: 0.5, metalness: 0.15 });
    this.joints = new THREE.MeshStandardMaterial({ color: 0x7d5932, roughness: 0.4 });
    this.eyeMaterials = [];
    this.legs = [];
    this.wings = [];
    this.antennae = [];
    this.halteres = [];
    this.tmp = { a: v3(), b: v3(), c: v3(), d: v3(), e: v3(), q: new THREE.Quaternion(), direction: v3() };
    this.body.name = 'thorax';
    this.ellipsoid(this.body, this.shell, [0, 0, 0], [0.26, 0.25, 0.37]);
    this.ellipsoid(this.body, this.dark, [0, 0.2, -0.03], [0.13, 0.07, 0.28]);
    this.abdomen = new THREE.Group();
    this.abdomen.position.set(0, -0.04, -0.28);
    this.body.add(this.abdomen);
    this.ellipsoid(this.abdomen, this.shell, [0, -0.04, -0.25], [0.245, 0.18, 0.4]);
    for (let i = 0; i < 5; i++) {
      const z = -0.14 - i * 0.1;
      const w = Math.sqrt(1 - ((z + 0.25) / 0.4) ** 2);
      this.ellipsoid(this.abdomen, this.dark,
        [0, -0.04, z], [0.247 * w, 0.183 * w, 0.028]);
    }
    this.head = new THREE.Group();
    this.head.position.set(0, 0.035, 0.37);
    this.body.add(this.head);
    this.ellipsoid(this.head, this.shell, [0, 0, 0], [0.265, 0.225, 0.205]);
    for (const side of [-1, 1]) {
      const mat = new THREE.MeshStandardMaterial({ color: 0x8f2921, roughness: 0.34,
        metalness: 0.18, emissive: 0xeb672d, emissiveIntensity: 0.02 });
      this.eyeMaterials.push(mat);
      this.ellipsoid(this.head, mat, [side * 0.205, 0.035, 0.054], [0.151, 0.194, 0.163]);
      const facets = new THREE.InstancedMesh(new THREE.CircleGeometry(0.012, 6), mat, 400);
      const dummy = new THREE.Object3D();
      const normal = v3(), front = v3(0, 0, 1);
      for (let i = 0; i < 400; i++) {
        const y = 1 - 2 * (i + 0.5) / 400, a = i * 2.399963;
        const r = Math.sqrt(1 - y * y);
        dummy.position.set(side * 0.205 + Math.cos(a) * r * 0.152, 0.035 + y * 0.195, 0.054 + Math.sin(a) * r * 0.164);
        normal.set(Math.cos(a) * r / 0.151, y / 0.194, Math.sin(a) * r / 0.163).normalize();
        dummy.quaternion.setFromUnitVectors(front, normal);
        dummy.updateMatrix();
        facets.setMatrixAt(i, dummy.matrix);
        facets.setColorAt(i, new THREE.Color().setScalar(0.7 + (i % 7) * 0.045));
      }
      this.head.add(facets);
      const antenna = new THREE.Group();
      antenna.position.set(side * 0.085, 0.13, 0.15);
      this.head.add(antenna);
      this.ellipsoid(antenna, this.gold, [side * 0.025, 0.02, 0.07], [0.043, 0.045, 0.075]);
      this.line(antenna, [[side * 0.02, 0.06, 0.08], [side * 0.11, 0.25, 0.15], [side * 0.17, 0.29, 0.17]], 0xc1b39a);
      this.antennae.push(antenna);
      this.buildWing(side);
      for (let row = 0; row < 3; row++) this.buildLeg(side, row);
      const haltere = new THREE.Group();
      haltere.position.set(side * 0.2, 0, -0.2);
      this.ellipsoid(haltere, this.gold, [side * 0.13, 0.02, -0.07], [0.034, 0.042, 0.034]);
      this.line(haltere, [[0, 0, 0], [side * 0.13, 0.02, -0.07]], 0xc8a06c);
      this.body.add(haltere);
      this.halteres.push({ pivot: haltere, side });
    }
    this.proboscis = this.ellipsoid(this.head, this.gold, [0, -0.17, 0.15], [0.04, 0.04, 0.08]);
    this.bristles();
    this.reset();
  }

  ellipsoid(parent, material, position, scale) {
    const mesh = new THREE.Mesh(this.sphere, material);
    mesh.position.set(...position); mesh.scale.set(...scale);
    mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  line(parent, points, color, opacity = 1) {
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points.map(p => v3(...p))),
      new THREE.LineBasicMaterial({ color, transparent: opacity < 1, opacity }));
    parent.add(line);
    return line;
  }

  buildWing(side) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.19, 0.19, -0.1);
    this.body.add(pivot);
    const wing = new THREE.Group();
    wing.scale.x = side;
    pivot.add(wing);
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.bezierCurveTo(0.42, 0.2, 1.08, 0.24, 1.36, -0.08);
    shape.bezierCurveTo(1.53, -0.4, 0.93, -0.56, 0.46, -0.34);
    shape.quadraticCurveTo(0.16, -0.23, 0, 0);
    const geo = new THREE.ShapeGeometry(shape, 28);
    geo.rotateX(Math.PI / 2);
    const membrane = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ color: 0xc5dbdf,
      side: THREE.DoubleSide, transparent: true, opacity: 0.34, roughness: 0.22,
      metalness: 0.08, iridescence: 0.8, iridescenceIOR: 1.3, depthWrite: false }));
    wing.add(membrane);
    this.line(wing, shape.getPoints(40).map(p => [p.x, 0.002, p.y]), 0xa3b5ae, 0.55);
    for (const end of [[1.28, -0.02], [1.33, -0.19], [1.13, -0.33], [0.88, -0.39]]) {
      this.line(wing, [[0, 0.004, 0], [0.48, 0.004, end[1] * 0.5], [end[0], 0.004, end[1]]], 0x89948a, 0.55);
    }
    this.line(wing, [[0.42, 0.004, 0.12], [0.58, 0.004, -0.24], [0.78, 0.004, -0.32]], 0x89948a, 0.4);
    this.wings.push({ pivot, side });
  }

  buildLeg(side, row) {
    const hip = v3(side * 0.18, -0.09, 0.22 - row * 0.21);
    const home = v3(side * (row === 1 ? 0.76 : 0.61), 0.02, [0.67, -0.08, -0.79][row]);
    const bones = [0.033, 0.023, 0.013].map(r => {
      const mesh = new THREE.Mesh(this.bone, this.joints);
      mesh.castShadow = true;
      this.root.add(mesh);
      return { mesh, r };
    });
    const knee = this.ellipsoid(this.root, this.gold, [0, 0, 0], [0.032, 0.032, 0.032]);
    this.legs.push({ hip, home, foot: home.clone(), start: home.clone(), end: home.clone(),
      side, row, tripod: (row + (side > 0 ? 1 : 0)) % 2, swinging: false, bones, knee });
  }

  bristles() {
    const points = [];
    for (let i = 0; i < 92; i++) {
      const a = i * 2.399963, y = 0.15 + (i % 9) / 12;
      const r = Math.sqrt(1 - y * y);
      const p = v3(Math.cos(a) * r * 0.26, y * 0.25, Math.sin(a) * r * 0.36);
      points.push(p, p.clone().add(v3(p.x, y * 0.3, p.z).normalize().multiplyScalar(0.065)));
    }
    this.body.add(new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: 0x544b37, transparent: true, opacity: 0.8 })));
  }

  reset() {
    this.time = 0; this.gait = 0;
    this.s = { x: 0, z: 0, heading: 0, speed: 0, air: 0, lean: 0, wing: 0, proboscis: 0, groom: 0 };
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this.body.position.set(0, 0.52, 0);
    this.body.rotation.set(0, 0, 0);
    for (const leg of this.legs) { leg.foot.copy(leg.home); leg.swinging = false; }
    this.pose({}, 0);
  }

  update(d, dt) {
    const s = this.s;
    const forward = ((d.walk || 0) - (d.backward || 0)) * (1 - (d.stop || 0));
    s.speed = damp(s.speed, forward, 6, dt);
    s.heading += (d.turn || 0) * (1 - (d.stop || 0)) * dt * 1.6;
    s.x += Math.sin(s.heading) * s.speed * dt;
    s.z += Math.cos(s.heading) * s.speed * dt;
    s.air = damp(s.air, d.escape || 0, 9, dt);
    this.pose({ x: s.x, z: s.z, heading: s.heading, height: s.air * 0.85,
      air: s.air, lean: -(d.turn || 0) * 0.3, wing: Math.max(d.wing || 0, s.air),
      speed: s.speed, proboscis: d.proboscis || 0, groom: d.groom || 0 }, dt);
  }

  pose(p, dt) {
    this.time += dt;
    const air = p.air || 0, speed = p.speed || 0;
    const s = this.s;
    s.lean = damp(s.lean, p.lean || 0, 12, dt);
    s.wing = damp(s.wing, p.wing ?? air, 14, dt);
    s.proboscis = damp(s.proboscis, p.proboscis || 0, 10, dt);
    s.groom = damp(s.groom, p.groom || 0, 9, dt);
    this.root.position.set(p.x || 0, 0, p.z || 0);
    this.root.rotation.y = p.heading || 0;
    const breathe = Math.sin(this.time * 3) * 0.006;
    this.body.position.set(s.lean * 0.035, 0.52 + (p.height || 0) - (p.crouch || 0) * 0.1 + breathe, 0);
    this.body.rotation.set(-air * 0.32 + (p.crouch || 0) * 0.08, 0, -s.lean * 0.38);
    this.head.rotation.y = Math.sin(this.time * 1.4) * 0.035 * (1 - air);
    this.abdomen.rotation.x = -air * 0.12 + breathe;
    this.proboscis.scale.set(0.035, 0.045 + s.proboscis * 0.15, 0.04);
    this.proboscis.position.set(0, -0.17 - s.proboscis * 0.12, 0.15 + s.proboscis * 0.06);
    this.proboscis.rotation.x = -0.35;
    for (let i = 0; i < 2; i++) {
      this.antennae[i].rotation.z = Math.sin(this.time * 4 + i * 2) * 0.045;
      this.eyeMaterials[i].emissiveIntensity = 0.02 + (p.eyes?.[i] || 0) * 1.4;
    }
    for (const { pivot, side } of this.wings) {
      pivot.rotation.y = side * (1.22 * (1 - s.wing) + Math.sin(this.time * 38) * 0.16 * s.wing);
      pivot.rotation.z = side * (0.08 + s.wing * (0.28 + Math.sin(this.time * 76) * 0.62));
      pivot.rotation.x = -0.05 + s.wing * Math.cos(this.time * 76) * 0.13;
    }
    for (const { pivot, side } of this.halteres) {
      pivot.rotation.z = -side * Math.sin(this.time * 76) * s.wing * 0.65;
    }
    this.gait += dt * Math.abs(speed) * 2.5;
    this.root.updateMatrixWorld(true);
    this.updateLegs(speed, air, p.height || 0);
  }

  updateLegs(speed, air, height) {
    const { a: hip, b: foot, c: axis, d: bend, e: knee, q } = this.tmp;
    q.copy(this.root.quaternion).invert();
    for (const leg of this.legs) {
      hip.copy(leg.hip).applyMatrix4(this.body.matrix);
      const ph = (this.gait + leg.tripod * 0.5) % 1;
      if (Math.abs(speed) > 0.03 && air < 0.15) {
        const swing = ph >= 0.58;
        if (swing && !leg.swinging) {
          leg.start.copy(leg.foot);
          leg.end.copy(leg.home); leg.end.z += Math.sign(speed) * 0.22;
          leg.end.applyQuaternion(this.root.quaternion).add(this.root.position);
        }
        leg.swinging = swing;
        if (swing) {
          const u = (ph - 0.58) / 0.42, e = u * u * (3 - 2 * u);
          leg.foot.lerpVectors(leg.start, leg.end, e);
          leg.foot.y = 0.02 + Math.sin(u * Math.PI) * 0.13;
        }
        foot.copy(leg.foot).sub(this.root.position).applyQuaternion(q);
      } else {
        foot.copy(leg.home);
        foot.x *= 1 - air * 0.58;
        foot.z = THREE.MathUtils.lerp(foot.z, leg.hip.z - 0.14, air * 0.75);
        foot.y += height + air * 0.22;
        leg.foot.copy(foot).applyQuaternion(this.root.quaternion).add(this.root.position);
        leg.swinging = false;
      }
      if (leg.row === 0 && this.s.groom > 0.05) {
        foot.lerp(bend.set(leg.side * (0.12 + Math.sin(this.time * 12) * 0.04), 0.52, 0.62), this.s.groom);
      }
      axis.subVectors(foot, hip);
      const distance = Math.max(0.001, axis.length()), l1 = 0.43, l2 = 0.5;
      axis.divideScalar(distance);
      const reach = Math.min(distance, l1 + l2 - 0.001);
      const along = (l1 * l1 - l2 * l2 + reach * reach) / (2 * reach);
      bend.set(leg.side, 0.65, leg.row === 0 ? 0.3 : -0.2);
      bend.addScaledVector(axis, -bend.dot(axis)).normalize();
      knee.copy(hip).addScaledVector(axis, along).addScaledVector(bend, Math.sqrt(Math.max(0, l1 * l1 - along * along)));
      leg.knee.position.copy(knee);
      this.segment(leg.bones[0], hip, knee);
      bend.copy(foot).addScaledVector(axis, -0.1);
      this.segment(leg.bones[1], knee, bend);
      this.segment(leg.bones[2], bend, foot);
    }
  }

  segment({ mesh, r }, from, to) {
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    const direction = this.tmp.direction.subVectors(to, from);
    const length = direction.length();
    direction.divideScalar(length || 1);
    mesh.quaternion.setFromUnitVectors(UP, direction);
    mesh.scale.set(r, length, r);
  }
}
