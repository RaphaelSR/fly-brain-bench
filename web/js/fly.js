/* Procedural articulated Drosophila, rendered in its own WebGL2 context.
   Proportions follow a real fly: body ~2.5 mm, wings slightly longer than the
   abdomen, legs in the 3-segment coxa/femur/tibia arrangement. The gait is the
   tripod pattern flies actually use (L1 R2 L3 alternating with R1 L2 R3). */

const VS = `#version 300 es
precision highp float;
in vec3 aPos; in vec3 aNrm;
uniform mat4 uVP; uniform mat4 uModel; uniform mat3 uNormal;
out vec3 vN; out vec3 vP;
void main(){ vec4 wp = uModel * vec4(aPos,1.0); vP = wp.xyz; vN = uNormal * aNrm;
  gl_Position = uVP * wp; }`;

const FS = `#version 300 es
precision highp float;
in vec3 vN; in vec3 vP;
uniform vec3 uColor; uniform float uAlpha; uniform float uEmit;
out vec4 frag;
void main(){
  vec3 n = normalize(vN);
  vec3 key = normalize(vec3(0.45, 0.8, 0.55));
  vec3 rim = normalize(vec3(-0.6, 0.15, -0.5));
  float d = max(dot(n, key), 0.0);
  float r = pow(max(dot(n, rim), 0.0), 2.0);
  vec3 c = uColor * (0.40 + 1.30 * d) + vec3(0.95,0.76,0.42) * r * 0.55 + uColor * uEmit * 2.0;
  frag = vec4(c, uAlpha);
}`;

/* ---- geometry ---- */
function sphere(seg = 14, ring = 10) {
  const pos = [], nrm = [], idx = [];
  for (let y = 0; y <= ring; y++) {
    const v = y / ring, phi = v * Math.PI;
    for (let x = 0; x <= seg; x++) {
      const u = x / seg, th = u * Math.PI * 2;
      const nx = Math.sin(phi) * Math.cos(th), ny = Math.cos(phi), nz = Math.sin(phi) * Math.sin(th);
      pos.push(nx * .5, ny * .5, nz * .5); nrm.push(nx, ny, nz);
    }
  }
  for (let y = 0; y < ring; y++) for (let x = 0; x < seg; x++) {
    const a = y * (seg + 1) + x, b = a + seg + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), idx: new Uint16Array(idx) };
}
function wingMesh() {
  // a flat teardrop in the x/z plane
  const pos = [], nrm = [], idx = [];
  const n = 22;
  pos.push(0, 0, 0); nrm.push(0, 1, 0);
  for (let i = 0; i <= n; i++) {
    const t = i / n, a = t * Math.PI;
    const x = t, z = Math.sin(a) * 0.23 * (1 - 0.45 * t);
    pos.push(x, 0, z); nrm.push(0, 1, 0);
    pos.push(x, 0, -z * 0.55); nrm.push(0, 1, 0);
  }
  for (let i = 0; i < n; i++) {
    const a = 1 + i * 2, b = a + 2;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  return { pos: new Float32Array(pos), nrm: new Float32Array(nrm), idx: new Uint16Array(idx) };
}

/* ---- tiny matrix helpers ---- */
const M = {
  ident: () => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]),
  mul(a, b) { const o = new Float32Array(16);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0;
      for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; },
  trs(t, rx, ry, rz, s) {
    const cx=Math.cos(rx),sx=Math.sin(rx),cy=Math.cos(ry),sy=Math.sin(ry),cz=Math.cos(rz),sz=Math.sin(rz);
    const r = [cy*cz+sy*sx*sz, cx*sz, -sy*cz+cy*sx*sz,
               -cy*sz+sy*sx*cz, cx*cz, sy*sz+cy*sx*cz,
               sy*cx, -sx, cy*cx];
    const sc = Array.isArray(s) ? s : [s, s, s];
    return new Float32Array([
      r[0]*sc[0], r[1]*sc[0], r[2]*sc[0], 0,
      r[3]*sc[1], r[4]*sc[1], r[5]*sc[1], 0,
      r[6]*sc[2], r[7]*sc[2], r[8]*sc[2], 0,
      t[0], t[1], t[2], 1]);
  },
  perspective(f, a, n, fa) { const q = 1 / Math.tan(f / 2), nf = 1 / (n - fa);
    return new Float32Array([q/a,0,0,0, 0,q,0,0, 0,0,(fa+n)*nf,-1, 0,0,2*fa*n*nf,0]); },
  lookAt(e, c, u) {
    const z = nrm3(sub3(e, c)), x = nrm3(cross3(u, z)), y = cross3(z, x);
    return new Float32Array([x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0,
      -dot3(x,e), -dot3(y,e), -dot3(z,e), 1]); },
  normalOf(m) { return new Float32Array([m[0],m[1],m[2], m[4],m[5],m[6], m[8],m[9],m[10]]); },
};
const sub3=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const dot3=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross3=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const nrm3=(a)=>{const l=Math.hypot(...a)||1;return [a[0]/l,a[1]/l,a[2]/l];};

/* ---- the fly ---- */
const COL = {
  thorax: [0.52, 0.38, 0.21], abdomen: [0.34, 0.26, 0.16], head: [0.46, 0.33, 0.19],
  eye: [0.86, 0.21, 0.13], leg: [0.30, 0.23, 0.15], wing: [0.78, 0.84, 0.88],
  proboscis: [0.68, 0.53, 0.32], halter: [0.62, 0.47, 0.27],
};
// tripod groups: front-left, mid-right, hind-left | front-right, mid-left, hind-right
const LEGS = [
  { side: -1, z:  0.30, group: 0, spread: 0.95, len: 0.58 },
  { side:  1, z:  0.30, group: 1, spread: 0.95, len: 0.58 },
  { side: -1, z:  0.02, group: 1, spread: 1.15, len: 0.62 },
  { side:  1, z:  0.02, group: 0, spread: 1.15, len: 0.62 },
  { side: -1, z: -0.26, group: 0, spread: 1.05, len: 0.74 },
  { side:  1, z: -0.26, group: 1, spread: 1.05, len: 0.74 },
];

export class FlyView {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!gl) throw new Error('WebGL2 required');
    this.gl = gl; this.canvas = canvas;
    this.prog = link(gl, VS, FS);
    this.sphere = upload(gl, this.prog, sphere());
    this.wing = upload(gl, this.prog, wingMesh());
    this.u = {
      VP: gl.getUniformLocation(this.prog, 'uVP'),
      model: gl.getUniformLocation(this.prog, 'uModel'),
      normal: gl.getUniformLocation(this.prog, 'uNormal'),
      color: gl.getUniformLocation(this.prog, 'uColor'),
      alpha: gl.getUniformLocation(this.prog, 'uAlpha'),
      emit: gl.getUniformLocation(this.prog, 'uEmit'),
    };
    this.yaw = 0.85; this.pitch = -0.28; this.dist = 3.8;
    this.state = {
      speed: 0, turn: 0, gait: 0, wing: 0, wingPhase: 0,
      proboscis: 0, jump: 0, groom: 0, heading: 0, bob: 0, lift: 0,
    };
    this._bind();
  }

  _bind() {
    const c = this.canvas; let drag = false, lx = 0, ly = 0;
    c.addEventListener('pointerdown', e => { c.setPointerCapture(e.pointerId); drag = true; this.userMoved = true; lx = e.clientX; ly = e.clientY; });
    c.addEventListener('pointermove', e => { if (!drag) return;
      this.yaw += (e.clientX - lx) * 0.008; this.pitch = Math.max(-1.3, Math.min(0.5, this.pitch + (e.clientY - ly) * 0.006));
      lx = e.clientX; ly = e.clientY; });
    c.addEventListener('pointerup', () => drag = false);
    c.addEventListener('pointercancel', () => drag = false);
    c.addEventListener('wheel', e => { e.preventDefault();
      this.dist = Math.max(2.2, Math.min(11, this.dist * Math.exp(e.deltaY * 0.0012))); }, { passive: false });
  }

  /* drive: {walk, turn, stop, backward, escape, proboscis, wing, groom} all 0..1 */
  update(drive, dt) {
    const s = this.state;
    const stop = drive.stop || 0;
    const fwd = (drive.walk || 0) * (1 - stop) - (drive.backward || 0) * (1 - stop);
    s.speed += (fwd - s.speed) * Math.min(1, dt * 6);
    s.turn += ((drive.turn || 0) * (1 - stop) - s.turn) * Math.min(1, dt * 5);
    s.gait += dt * (2.0 + Math.abs(s.speed) * 13) * (Math.abs(s.speed) > 0.02 ? 1 : 0);
    s.heading += s.turn * dt * 2.1;
    const wingTarget = Math.max(drive.wing || 0, drive.escape || 0);
    s.wing += (wingTarget - s.wing) * Math.min(1, dt * 7);
    s.wingPhase += dt * 60 * (0.2 + s.wing);
    s.proboscis += ((drive.proboscis || 0) - s.proboscis) * Math.min(1, dt * 8);
    s.groom += ((drive.groom || 0) - s.groom) * Math.min(1, dt * 5);
    s.jump += ((drive.escape || 0) - s.jump) * Math.min(1, dt * (drive.escape > s.jump ? 22 : 3));
    s.lift += (s.jump * 0.62 - s.lift) * Math.min(1, dt * 8);
    s.bob = Math.sin(s.gait * 2) * 0.018 * Math.abs(s.speed);
    if (!this.userMoved) this.yaw += dt * 0.22;
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    return [w, h];
  }

  draw() {
    const gl = this.gl, s = this.state;
    const [w, h] = this.resize();
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.035, 0.055, 0.064, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK);
    gl.useProgram(this.prog);

    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const eye = [this.dist * cp * Math.sin(this.yaw), -this.dist * sp + 0.42 + s.lift * 0.75, this.dist * cp * Math.cos(this.yaw)];
    // the camera tracks the takeoff so the fly cannot leave the frame
    const look = [0, 0.1 + s.lift * 0.75, 0];
    const vp = M.mul(M.perspective(0.72, w / h, 0.1, 60), M.lookAt(eye, look, [0, 1, 0]));
    gl.uniformMatrix4fv(this.u.VP, false, vp);

    const root = M.trs([0, s.lift + s.bob, 0], s.jump * -0.35, s.heading, 0, 1);
    const part = (mesh, local, color, alpha = 1, emit = 0) => {
      const m = M.mul(root, local);
      gl.uniformMatrix4fv(this.u.model, false, m);
      gl.uniformMatrix3fv(this.u.normal, false, M.normalOf(m));
      gl.uniform3fv(this.u.color, color);
      gl.uniform1f(this.u.alpha, alpha);
      gl.uniform1f(this.u.emit, emit);
      gl.bindVertexArray(mesh.vao);
      gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
    };

    // body
    part(this.sphere, M.trs([0, 0.30, -0.52], 0, 0, 0, [0.46, 0.42, 0.86]), COL.abdomen);
    part(this.sphere, M.trs([0, 0.34, -0.06], 0, 0, 0, [0.50, 0.46, 0.62]), COL.thorax);
    const headBob = s.groom * Math.sin(s.gait * 6) * 0.05;
    part(this.sphere, M.trs([0, 0.36 + headBob, 0.42], 0, 0, 0, [0.42, 0.40, 0.38]), COL.head);
    for (const sd of [-1, 1])
      part(this.sphere, M.trs([sd * 0.16, 0.40 + headBob, 0.48], 0, 0, 0, [0.22, 0.30, 0.26]), COL.eye, 1, 0.18);
    // proboscis
    const pl = 0.06 + s.proboscis * 0.24;
    part(this.sphere, M.trs([0, 0.24 + headBob - pl * 0.5, 0.50], 0, 0, 0, [0.08, pl, 0.08]), COL.proboscis);
    // halteres
    for (const sd of [-1, 1])
      part(this.sphere, M.trs([sd * 0.17, 0.33, -0.24], 0, 0, 0, 0.055), COL.halter);

    // legs
    for (let i = 0; i < LEGS.length; i++) {
      const L = LEGS[i];
      const ph = s.gait + (L.group ? Math.PI : 0);
      const swing = Math.sin(ph), lift = Math.max(0, Math.sin(ph)) * Math.abs(s.speed);
      const groomFront = (i < 2) ? s.groom : 0;
      const base = [L.side * 0.17, 0.30, L.z];
      const outward = L.side * L.spread;
      const femRot = 0.5 + swing * 0.32 * Math.abs(s.speed) + groomFront * 1.15 + s.jump * 0.9;
      const tibRot = -1.05 - lift * 0.5 - groomFront * 1.5 - s.jump * 1.3;
      const seg = (off, rot, len, thick) => M.trs(
        [base[0] + outward * off * 0.42, base[1] - off * 0.30 + lift * 0.10, base[2] + off * 0.08],
        rot, 0, L.side * (0.55 + off * 0.25), [thick, len, thick]);
      part(this.sphere, seg(0.0, femRot, L.len * 0.55, 0.052), COL.leg);
      part(this.sphere, seg(0.9, femRot + tibRot, L.len * 0.62, 0.042), COL.leg);
      part(this.sphere, seg(1.8, femRot + tibRot * 1.6, L.len * 0.45, 0.030), COL.leg);
    }

    // wings — drawn last, translucent
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.CULL_FACE);
    const beat = Math.sin(s.wingPhase) * (0.18 + s.wing * 1.05);
    for (const sd of [-1, 1]) {
      const m = M.trs([sd * 0.13, 0.48, -0.10], beat * 0.55, sd * (0.35 + beat * 0.30), sd * (0.55 + beat), [1.05, 1, 1.05]);
      part(this.wing, M.mul(m, M.trs([0, 0, 0], 0, 0, 0, [1, 1, sd])), COL.wing, 0.24 + s.wing * 0.12);
    }
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }
}

function upload(gl, prog, m) {
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  for (const [name, data, size] of [['aPos', m.pos, 3], ['aNrm', m.nrm, 3]]) {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, name);
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  }
  const ib = gl.createBuffer();
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.idx, gl.STATIC_DRAW);
  gl.bindVertexArray(null);
  return { vao, count: m.idx.length };
}
function link(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}
