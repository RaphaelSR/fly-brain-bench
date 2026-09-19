import * as THREE from '../vendor/three/three.module.min.js';
import { PROPS, newProps } from './props.js';
import { PERCHES } from '../defend/world-layout.js';

const mat = (color, roughness = 0.8) => new THREE.MeshStandardMaterial({ color, roughness });
function mesh(parent, geometry, material, x = 0, y = 0, z = 0) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(x, y, z); object.castShadow = true; object.receiveShadow = true; parent.add(object); return object;
}
const box = (parent, material, w, h, d, x, y, z) => mesh(parent, new THREE.BoxGeometry(w, h, d), material, x, y, z);
function ring(parent, radius, thickness, material, y) {
  const object = mesh(parent, new THREE.TorusGeometry(radius, thickness, 8, 32), material, 0, y, 0);
  object.rotation.x = Math.PI / 2; return object;
}
function plant(root, d, index) {
  const clay = mat(index % 2 ? 0xc18561 : 0xac603f), soil = mat(0x332820);
  const points = [[0, 0], [d.radius * 0.72, 0], [d.radius, d.height], [d.radius - 0.08, d.height],
    [d.radius * 0.72 - 0.05, 0.12]].map(([x, y]) => new THREE.Vector2(x, y));
  mesh(root, new THREE.LatheGeometry(points, 28), clay);
  ring(root, d.radius, 0.065, clay, d.height - 0.08);
  mesh(root, new THREE.CylinderGeometry(d.radius - 0.08, d.radius - 0.08, 0.06, 28), soil, 0, d.height - 0.13);
  const green = mat(index % 2 ? 0x376849 : 0x5b7335), vein = mat(0x74834a);
  const leaf = new THREE.Shape(); leaf.moveTo(0, 0); leaf.bezierCurveTo(-0.5, 0.45, -0.38, 1.1, 0, 1.7);
  leaf.bezierCurveTo(0.38, 1.1, 0.5, 0.45, 0, 0);
  const leafGeometry = new THREE.ShapeGeometry(leaf, 8); green.side = THREE.DoubleSide;
  const positions = leafGeometry.attributes.position;
  for (let i = 0; i < positions.count; i++) positions.setZ(i, Math.sin(positions.getY(i) / 1.7 * Math.PI) * 0.18);
  leafGeometry.computeVertexNormals();
  for (let i = 0; i < 13; i++) {
    const stem = new THREE.Group(); stem.position.y = d.height - 0.1;
    stem.rotation.y = i * 2.39996; stem.rotation.z = 0.22 + (i % 4) * 0.2; root.add(stem);
    const scale = d.radius * (0.95 + (i % 3) * 0.24);
    const blade = mesh(stem, leafGeometry, green, 0, 0.18, 0); blade.scale.setScalar(scale);
    mesh(stem, new THREE.CylinderGeometry(0.012, 0.024, scale * 1.2, 5), vein, 0, scale * 0.6, 0.04);
  }
}
function makeProp(d, index) {
  const root = new THREE.Group(); root.userData.propId = d.id;
  if (d.kind === 'plant') plant(root, d, index);
  if (d.kind === 'bottle') {
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x326957, roughness: 0.18, metalness: 0.12, clearcoat: 1 });
    const profile = [[0, 0], [0.2, 0], [0.22, 0.1], [0.22, 0.5], [0.1, 0.64], [0.1, 0.84], [0, 0.84]].map(p => new THREE.Vector2(...p));
    mesh(root, new THREE.LatheGeometry(profile, 24), glass);
    ring(root, 0.105, 0.025, mat(0xd9b976, 0.4), 0.83);
    mesh(root, new THREE.CylinderGeometry(0.226, 0.226, 0.24, 24), mat(0xe1d6b4), 0, 0.33);
  }
  if (d.kind === 'mug') {
    const ceramic = mat(0xe7d7b9, 0.25);
    mesh(root, new THREE.CylinderGeometry(0.3, 0.25, 0.5, 28, 1, true), ceramic, 0, 0.25);
    ring(root, 0.3, 0.025, ceramic, 0.5);
    mesh(root, new THREE.CylinderGeometry(0.27, 0.27, 0.025, 24), mat(0x3d251b, 0.25), 0, 0.4);
    const handle = mesh(root, new THREE.TorusGeometry(0.18, 0.05, 8, 18), ceramic, 0.34, 0.3); handle.rotation.y = Math.PI / 2;
  }
  if (d.kind === 'bucket') {
    const metal = new THREE.MeshStandardMaterial({ color: 0x6b9192, roughness: 0.4, metalness: 0.5 });
    mesh(root, new THREE.CylinderGeometry(0.65, 0.46, 1.02, 28, 1, true), metal, 0, 0.51);
    mesh(root, new THREE.CylinderGeometry(0.46, 0.46, 0.04, 28), metal, 0, 0.04);
    ring(root, 0.65, 0.035, metal, 1.02);
    const handle = mesh(root, new THREE.TorusGeometry(0.61, 0.024, 6, 24, Math.PI), metal, 0, 0.9); handle.rotation.y = Math.PI / 2;
  }
  return root;
}

export function createHomeCourtyard(view, { textures = true } = {}) {
  view.ground.visible = false; view.grid.visible = false;
  view.scene.background.setHex(0xc4d6d2); view.scene.fog = new THREE.Fog(0xc4d6d2, 38, 75);
  view.renderer.toneMappingExposure = 1.05;
  view.key.color.setHex(0xffd4a0); view.key.intensity = 3.1;
  Object.assign(view.key.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, far: 35 });
  view.key.shadow.camera.updateProjectionMatrix();
  const root = new THREE.Group(); view.scene.add(root);
  const floor = mat(0xffffff), plaster = mat(0xf7ebd7), wood = mat(0x79583f), teal = mat(0x345e60), trim = mat(0xe9d9b7);
  const promises = [], loader = textures ? new THREE.TextureLoader() : null;
  function materialMaps(material, id, repeat) {
    if (!loader) return;
    for (const [suffix, property] of [['diff', 'map'], ['nor_gl', 'normalMap'], ['rough', 'roughnessMap']]) {
      promises.push(loader.loadAsync(new URL('./assets/' + id + '_' + suffix + '.jpg', import.meta.url).href).then(texture => {
        texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(...repeat);
        texture.anisotropy = Math.min(4, view.renderer.capabilities.getMaxAnisotropy());
        if (property === 'map') texture.colorSpace = THREE.SRGBColorSpace;
        material[property] = texture; material.needsUpdate = true;
      }));
    }
    material.normalScale.setScalar(0.55);
  }
  materialMaps(floor, 'terracotta_floor_tiles', [7, 7]);
  materialMaps(plaster, 'painted_plaster_wall', [10, 3]);
  const ground = mesh(root, new THREE.PlaneGeometry(46, 46), floor, 0, -0.005); ground.rotation.x = -Math.PI / 2;
  box(root, plaster, 46, 7, 0.4, 0, 3.5, -19);
  box(root, plaster, 0.4, 7, 42, -19, 3.5, 2);
  box(root, teal, 46, 0.4, 0.12, 0, 0.2, -18.72);
  box(root, teal, 0.12, 0.4, 42, -18.72, 0.2, 2);
  box(root, wood, 46, 0.3, 1.6, 0, 6.7, -18.4);
  for (let i = 0; i < 36; i++) {
    const tile = mesh(root, new THREE.CylinderGeometry(0.2, 0.2, 1.9, 8, 1, true, 0, Math.PI), mat(i % 2 ? 0x94503a : 0xad6245), -17.5 + i, 6.92, -18.4);
    tile.rotation.x = Math.PI / 2;
  }
  box(root, trim, 3.7, 5.1, 0.2, 4, 2.55, -18.7);
  box(root, teal, 3.3, 4.8, 0.22, 4, 2.4, -18.55);
  for (let i = 0; i < 4; i++) box(root, wood, 1.24, 1.65, 0.06, 3.25 + (i % 2) * 1.5, 1.2 + Math.floor(i / 2) * 2.1, -18.39);
  mesh(root, new THREE.SphereGeometry(0.095, 12, 8), mat(0xc1a568, 0.25), 5.12, 2.4, -18.2);
  box(root, trim, 5.5, 3.7, 0.22, -6, 3.4, -18.7);
  box(root, mat(0x253b40, 0.25), 4.9, 3.2, 0.08, -6, 3.4, -18.5);
  for (const x of [-8.1, -3.9]) for (let i = 0; i < 11; i++) {
    const slat = box(root, teal, 1.2, 0.14, 0.15, x, 2 + i * 0.27, -18.3); slat.rotation.x = 0.3;
  }
  for (const x of [-6.65, -5.35]) box(root, trim, 0.08, 3.1, 0.08, x, 3.4, -18.25);
  box(root, trim, 3, 0.08, 0.08, -6, 3.4, -18.25);
  box(root, trim, 5.9, 0.2, 0.8, -6, 1.6, -18.25);
  for (const p of PERCHES) {
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 + i * Math.PI / 2;
      box(root, wood, 0.13, p.height, 0.13, p.x + Math.sin(a) * p.radius * 0.7, p.height / 2, p.z + Math.cos(a) * p.radius * 0.7);
    }
    mesh(root, new THREE.CylinderGeometry(p.radius, p.radius, 0.12, 32), wood, p.x, p.height - 0.06, p.z);
    for (let i = -2; i <= 2; i++) box(root, trim, p.radius * 1.5, 0.008, 0.025, p.x, p.height + 0.003, p.z + i * p.radius * 0.28);
  }
  // Background furniture is outside the playable boundary; movable props below have colliders.
  for (const x of [-13, 12]) {
    box(root, wood, 4.2, 0.2, 1.4, x, 0.85, -17.5);
    box(root, teal, 4.2, 1.5, 0.15, x, 1.65, -18.1);
    for (const sign of [-1, 1]) box(root, teal, 0.2, 0.85, 1.1, x + sign * 1.6, 0.42, -17.5);
  }
  const lantern = mat(0x263c3c), warm = new THREE.MeshStandardMaterial({ color: 0xffdfaa, emissive: 0xffb35a, emissiveIntensity: 0.45 });
  for (const x of [1.5, 6.5]) {
    box(root, lantern, 0.5, 0.8, 0.3, x, 4.6, -18.6);
    box(root, warm, 0.34, 0.56, 0.32, x, 4.6, -18.48);
  }
  const propRoots = PROPS.map((d, i) => { const object = makeProp(d, i); root.add(object); return object; });
  const axis = new THREE.Vector3();
  const update = states => {
    if (!states) return;
    states.forEach((p, i) => {
      const object = propRoots[i], definition = PROPS[i];
      object.position.set(p.x, Math.sin(p.angle) * definition.radius, p.z);
      axis.set(p.dz, 0, -p.dx).normalize(); object.quaternion.setFromAxisAngle(axis, p.angle);
    });
  };
  update(newProps());
  return { root, pickables: propRoots, update, ready: Promise.allSettled(promises) };
}
