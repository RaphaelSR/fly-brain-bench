import * as THREE from '../vendor/three/three.module.min.js';

const material = (color, roughness = 0.8) => new THREE.MeshStandardMaterial({ color, roughness });
const mesh = (parent, geometry, mat, x, y, z) => {
  const m = new THREE.Mesh(geometry, mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true;
  parent.add(m);
  return m;
};

export function createCourtyard(view) {
  view.ground.visible = false;
  view.grid.visible = false;
  view.scene.background.setHex(0x657678);
  view.scene.fog.color.setHex(0x657678);
  const desk = new THREE.Group();
  view.scene.add(desk);
  mesh(desk, new THREE.BoxGeometry(70, 0.24, 70), material(0x847a69), 0, -0.15, 0);
  const tiles = new THREE.InstancedMesh(new THREE.BoxGeometry(2.96, 0.06, 2.96), material(0xc1b59b), 225);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < 225; i++) {
    dummy.position.set((i % 15 - 7) * 3, -0.03, (Math.floor(i / 15) - 7) * 3);
    dummy.updateMatrix(); tiles.setMatrixAt(i, dummy.matrix);
    tiles.setColorAt(i, new THREE.Color().setScalar(0.86 + (i * 17 % 19) / 130));
  }
  tiles.receiveShadow = true; desk.add(tiles);
  const leafMat = material(0x415f40);
  for (const [x, z, scale] of [[-8, -7, 1], [8, -8, 1.3], [-11, 6, 0.9]]) {
    const pot = new THREE.Group(); pot.position.set(x, 0, z); pot.scale.setScalar(scale); desk.add(pot);
    mesh(pot, new THREE.CylinderGeometry(1, 0.73, 1.45, 24), material(0x9c6650), 0, 0.73, 0);
    mesh(pot, new THREE.CylinderGeometry(0.88, 0.88, 0.08, 24), material(0x3a3428), 0, 1.46, 0);
    for (let i = 0; i < 7; i++) {
      const a = i * 2.4;
      const leaf = mesh(pot, new THREE.SphereGeometry(1, 12, 8), leafMat, Math.sin(a) * 0.6, 2.1 + (i % 3) * 0.3, Math.cos(a) * 0.6);
      leaf.scale.set(0.3, 1.1, 0.16); leaf.rotation.z = Math.sin(a) * 0.8; leaf.rotation.y = a;
    }
  }
  return desk;
}

export function createObjects() {
  const slipper = new THREE.Group();
  const shape = new THREE.Shape();
  shape.moveTo(0, -1.5);
  shape.bezierCurveTo(0.75, -1.5, 0.67, -0.65, 0.47, -0.15);
  shape.bezierCurveTo(0.37, 0.35, 0.67, 1.42, 0, 1.5);
  shape.bezierCurveTo(-0.69, 1.47, -0.49, 0.42, -0.46, -0.1);
  shape.bezierCurveTo(-0.7, -0.75, -0.73, -1.5, 0, -1.5);
  const rubber = new THREE.ExtrudeGeometry(shape, { depth: 0.12, steps: 1, bevelEnabled: true,
    bevelSize: 0.025, bevelThickness: 0.025, bevelSegments: 2, curveSegments: 18 });
  rubber.rotateX(-Math.PI / 2);
  mesh(slipper, rubber, material(0x225460), 0, 0, 0);
  const top = mesh(slipper, rubber, material(0x56a9ae), 0, 0.09, 0);
  top.scale.set(0.97, 0.3, 0.98);
  const strapMat = material(0xe9dbc1, 0.6);
  for (const side of [-1, 1]) {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.44, 0.13, -0.45),
      new THREE.Vector3(side * 0.31, 0.5, 0.05),
      new THREE.Vector3(0, 0.43, 0.8),
    ]);
    mesh(slipper, new THREE.TubeGeometry(curve, 18, 0.075, 8, false), strapMat, 0, 0, 0);
  }
  mesh(slipper, new THREE.CylinderGeometry(0.045, 0.06, 0.3, 10), strapMat, 0, 0.28, 0.8);
  const sphere = new THREE.Group();
  mesh(sphere, new THREE.SphereGeometry(0.48, 24, 16), material(0x638b97, 0.25), 0, 0.48, 0);
  return { slipper, sphere };
}

export function createThrower() {
  const hand = new THREE.Group(), skin = material(0xb78b70, 0.7);
  const palm = mesh(hand, new THREE.SphereGeometry(1, 18, 12), skin, 0, 0, 0.4);
  palm.scale.set(0.75, 0.25, 0.78);
  const arm = mesh(hand, new THREE.CapsuleGeometry(0.4, 2.5, 5, 12), skin, 0, 0.1, 2.35);
  arm.rotation.x = Math.PI / 2;
  for (let i = 0; i < 4; i++) {
    const finger = mesh(hand, new THREE.CapsuleGeometry(0.14, 0.65 + (i === 1 ? 0.18 : 0), 4, 10), skin, (i - 1.5) * 0.34, -0.03, -0.5);
    finger.rotation.x = Math.PI / 2 - 0.18;
  }
  const thumb = mesh(hand, new THREE.CapsuleGeometry(0.19, 0.58, 4, 10), skin, -0.8, -0.05, 0.1);
  thumb.rotation.z = 0.8; thumb.rotation.x = 0.8;
  return hand;
}
