import * as THREE from '../vendor/three/three.module.min.js';
import { FlyRig } from './fly-rig.js';

export function cameraDistance(distance, aspect, arena = false) {
  const compensation = Math.max(1, (arena ? 1.25 : 0.95) / aspect);
  return distance * (arena ? Math.min(1.35, compensation) : compensation);
}

export class FlyView {
  constructor(canvas, { arena = false } = {}) {
    this.canvas = canvas;
    this.arena = arena;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x101c22);
    this.scene.fog = new THREE.FogExp2(0x101c22, 0.025);
    this.camera = new THREE.PerspectiveCamera(36, 1, 0.05, 65);
    this.focus = new THREE.Vector3(0, 0.35, 0);
    this.target = this.focus.clone();
    this.yaw = 0.65; this.pitch = 0.48;
    this.dist = arena ? 8.4 : 4.5;
    this.userMoved = false;
    this.rig = new FlyRig();
    this.scene.add(this.rig.root);
    this.scene.add(new THREE.HemisphereLight(0xc2e8ff, 0x4b3622, 2.1));
    const key = new THREE.DirectionalLight(0xffdfad, 3.6);
    key.position.set(-3, 6, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 0.1, far: 18 });
    key.shadow.normalBias = 0.018;
    key.shadow.bias = -0.00015;
    this.scene.add(key, key.target);
    this.key = key;
    const rim = new THREE.DirectionalLight(0x79becd, 2.8);
    rim.position.set(3, 3, -4);
    this.scene.add(rim);
    this.ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120),
      new THREE.MeshStandardMaterial({ color: 0x17272d, roughness: 0.92, metalness: 0.12 }));
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.scene.add(this.ground);
    const grid = new THREE.GridHelper(100, 200, 0x2f4951, 0x243a42);
    grid.position.y = 0.002;
    grid.material.transparent = true; grid.material.opacity = 0.28;
    this.scene.add(grid);
    this.grid = grid;
    this._bind();
  }

  _bind() {
    const c = this.canvas;
    let dragging = false, lx = 0, ly = 0;
    this.handlers = {
      pointerdown: e => { if (e.button !== 0) return; c.setPointerCapture(e.pointerId);
        dragging = true; lx = e.clientX; ly = e.clientY; this.userMoved = true; },
      pointermove: e => { if (!dragging) return;
        this.yaw -= (e.clientX - lx) * 0.006;
        this.pitch = THREE.MathUtils.clamp(this.pitch + (e.clientY - ly) * 0.006, 0.12, 1.35);
        lx = e.clientX; ly = e.clientY; },
      pointerup: () => { dragging = false; },
      pointercancel: () => { dragging = false; },
      wheel: e => { e.preventDefault(); this.userMoved = true;
        this.dist = THREE.MathUtils.clamp(this.dist * Math.exp(e.deltaY * 0.001), 2.4, 14); },
      dblclick: () => this.resetCamera(),
    };
    for (const [event, fn] of Object.entries(this.handlers)) c.addEventListener(event, fn, { passive: false });
  }

  resetCamera() {
    this.yaw = 0.65; this.pitch = 0.48;
    this.dist = this.arena ? 8.4 : 4.5;
    this.userMoved = false;
  }

  update(d, dt) {
    this.rig.update(d, Math.max(0, Math.min(dt, 0.05)));
    this.target.set(this.rig.root.position.x, 0.35, this.rig.root.position.z);
  }

  draw(dt = 1 / 60) {
    const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
    if (!w || !h) return;
    if (w !== this.width || h !== this.height) {
      this.width = w; this.height = h;
      this.renderer.setSize(w, h, false);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }
    this.focus.lerp(this.target, 1 - Math.exp(-dt * 6));
    if (this.cinematic && !this.userMoved) {
      const f = 1 - Math.exp(-dt * 2.5);
      this.dist += (this.cinematic.distance - this.dist) * f;
      this.pitch += (this.cinematic.pitch - this.pitch) * f;
      this.yaw += (this.cinematic.yaw - this.yaw) * f;
    }
    const distance = cameraDistance(this.dist, this.camera.aspect, this.arena);
    const horizontal = Math.cos(this.pitch) * distance;
    this.camera.position.set(this.focus.x + Math.sin(this.yaw) * horizontal,
      this.focus.y + Math.sin(this.pitch) * distance, this.focus.z + Math.cos(this.yaw) * horizontal);
    this.camera.lookAt(this.focus);
    this.key.position.set(this.focus.x - 3, 6, this.focus.z + 4);
    this.key.target.position.set(this.focus.x, 0, this.focus.z);
    this.ground.position.set(this.focus.x, 0, this.focus.z);
    this.grid.position.set(Math.round(this.focus.x), 0.002, Math.round(this.focus.z));
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    for (const [event, fn] of Object.entries(this.handlers)) this.canvas.removeEventListener(event, fn);
    const geometries = new Set(), materials = new Set();
    this.scene.traverse(o => { if (o.geometry) geometries.add(o.geometry);
      if (o.material) for (const m of [o.material].flat()) materials.add(m); });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose());
    this.renderer.dispose();
  }
}
