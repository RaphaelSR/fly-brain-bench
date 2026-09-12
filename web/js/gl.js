/* Minimal WebGL2 point-cloud renderer for the connectome. No dependencies. */

const VS = `#version 300 es
precision highp float;
in vec3 aPos;
in float aAct;      // 0..1 recent spiking
in float aNT;       // neurotransmitter index
in float aSel;      // 1 = in the stimulated set
in float aDim;      // 0 = filtered out
uniform mat4 uMVP;
uniform float uPointScale;
uniform float uBaseAlpha;
uniform vec3 uNTColor[8];
out vec3 vRGB;
out float vAct;
void main() {
  vec4 clip = uMVP * vec4(aPos, 1.0);
  gl_Position = clip;
  float act = aAct;
  float size = uPointScale / max(clip.w, 0.001);
  gl_PointSize = clamp(size * (1.0 + act * 4.5 + aSel * 2.2), 1.2, 34.0);
  vec3 base = uNTColor[int(aNT)];
  // resting cells draw the anatomy; firing cells burn toward white
  vec3 hot = mix(base, vec3(1.0, 0.95, 0.84), min(act * 1.05, 0.9));
  // brightness lives entirely in rgb because the blend is additive
  vRGB = hot * (uBaseAlpha * aDim + act * 2.6 + aSel * 0.55);
  vAct = act + aSel * 0.45;
}`;

const FS = `#version 300 es
precision highp float;
in vec3 vRGB;
in float vAct;
out vec4 frag;
void main() {
  vec2 d = gl_PointCoord - vec2(0.5);
  float r2 = dot(d, d);
  if (r2 > 0.25) discard;
  float core = exp(-r2 * 7.0);
  float halo = exp(-r2 * 2.2) * vAct * 0.8;
  frag = vec4(vRGB * (core + halo), 1.0);
}`;

/* --- tiny mat4 --- */
const m4 = {
  mul(a, b) {
    const o = new Float32Array(16);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k];
      o[i * 4 + j] = s;
    }
    return o;
  },
  perspective(fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([f / aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0]);
  },
  lookAt(eye, center, up) {
    const z = norm(sub(eye, center)), x = norm(cross(up, z)), y = cross(z, x);
    return new Float32Array([
      x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0,
      -dot(x,eye), -dot(y,eye), -dot(z,eye), 1]);
  }
};
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const norm=(a)=>{const l=Math.hypot(...a)||1;return [a[0]/l,a[1]/l,a[2]/l];};

export class BrainView {
  constructor(canvas, pos, nt, radius) {
    this.canvas = canvas;
    this.N = pos.length / 3;
    this.pos = pos;
    this.radius = radius;
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, premultipliedAlpha: false });
    if (!gl) throw new Error('WebGL2 is required for this page.');
    this.gl = gl;

    this.prog = link(gl, VS, FS);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.bufPos = attrib(gl, this.prog, 'aPos', pos, 3);
    this.act = new Float32Array(this.N);
    this.sel = new Float32Array(this.N);
    this.dim = new Float32Array(this.N).fill(1);
    const ntf = new Float32Array(this.N);
    for (let i = 0; i < this.N; i++) ntf[i] = nt[i];
    this.bufAct = attrib(gl, this.prog, 'aAct', this.act, 1, gl.DYNAMIC_DRAW);
    this.bufNT  = attrib(gl, this.prog, 'aNT', ntf, 1);
    this.bufSel = attrib(gl, this.prog, 'aSel', this.sel, 1, gl.DYNAMIC_DRAW);
    this.bufDim = attrib(gl, this.prog, 'aDim', this.dim, 1, gl.DYNAMIC_DRAW);
    gl.bindVertexArray(null);

    this.uMVP = gl.getUniformLocation(this.prog, 'uMVP');
    this.uPS = gl.getUniformLocation(this.prog, 'uPointScale');
    this.uBA = gl.getUniformLocation(this.prog, 'uBaseAlpha');
    this.uNT = gl.getUniformLocation(this.prog, 'uNTColor');

    this.yaw = 0.0; this.pitch = 0.0; this.dist = radius * 2.05;
    this.target = [0, 0, 0];
    this.autoRotate = true;
    this.baseAlpha = 0.34;
    this.ntColors = new Float32Array(24);
    this._bindControls();
  }

  setNTColors(list) {           // list of [r,g,b] 0..1, up to 8
    for (let i = 0; i < 8; i++) {
      const c = list[i] || [0.5, 0.5, 0.5];
      this.ntColors[i * 3] = c[0]; this.ntColors[i * 3 + 1] = c[1]; this.ntColors[i * 3 + 2] = c[2];
    }
  }

  _bindControls() {
    const c = this.canvas;
    let drag = false, lx = 0, ly = 0;
    const down = (x, y) => { drag = true; lx = x; ly = y; this.autoRotate = false; };
    const move = (x, y) => {
      if (!drag) return;
      this.yaw += (x - lx) * 0.006; this.pitch += (y - ly) * 0.006;
      this.pitch = Math.max(-1.5, Math.min(1.5, this.pitch));
      lx = x; ly = y;
    };
    c.addEventListener('pointerdown', e => { c.setPointerCapture(e.pointerId); down(e.clientX, e.clientY); });
    c.addEventListener('pointermove', e => move(e.clientX, e.clientY));
    c.addEventListener('pointerup', () => { drag = false; });
    c.addEventListener('pointercancel', () => { drag = false; });
    c.addEventListener('wheel', e => {
      e.preventDefault();
      this.dist *= Math.exp(e.deltaY * 0.0012);
      this.dist = Math.max(this.radius * 0.35, Math.min(this.radius * 9, this.dist));
    }, { passive: false });
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.floor(this.canvas.clientWidth * dpr), h = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    return [w, h];
  }

  mvp() {
    const [w, h] = [this.canvas.width, this.canvas.height];
    // the brain is ~2x wider than tall, so pull back when the viewport is narrow
    const aspect = w / Math.max(h, 1);
    const dist = this.dist * Math.max(1, 1.2 / aspect);
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const eye = [
      this.target[0] + dist * cp * Math.sin(this.yaw),
      this.target[1] + dist * sp,
      this.target[2] + dist * cp * Math.cos(this.yaw)];
    const proj = m4.perspective(0.9, aspect, this.radius * 0.05, this.radius * 30);
    const view = m4.lookAt(eye, this.target, [0, -1, 0]);   // fly brain data is y-down
    this._eye = eye;
    return m4.mul(proj, view);
  }

  draw(dtSec) {
    const gl = this.gl;
    const [w, h] = this.resize();
    if (this.autoRotate) this.yaw += dtSec * 0.12;
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.043, 0.067, 0.078, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);          // additive: density reads as structure
    gl.disable(gl.DEPTH_TEST);
    gl.useProgram(this.prog);
    gl.bindVertexArray(this.vao);
    this._mvp = this.mvp();
    gl.uniformMatrix4fv(this.uMVP, false, this._mvp);
    gl.uniform1f(this.uPS, h * 0.0034 * this.radius);
    gl.uniform1f(this.uBA, this.baseAlpha);
    gl.uniform3fv(this.uNT, this.ntColors);
    gl.drawArrays(gl.POINTS, 0, this.N);
    gl.bindVertexArray(null);
  }

  uploadAct() { upload(this.gl, this.bufAct, this.act); }
  uploadSel() { upload(this.gl, this.bufSel, this.sel); }
  uploadDim() { upload(this.gl, this.bufDim, this.dim); }

  /* world point -> CSS pixels inside the canvas, or null when behind the camera */
  project(p) {
    const m = this._mvp || this.mvp();
    const w = m[3]*p[0] + m[7]*p[1] + m[11]*p[2] + m[15];
    if (w <= 0) return null;
    const x = (m[0]*p[0] + m[4]*p[1] + m[8]*p[2] + m[12]) / w;
    const y = (m[1]*p[0] + m[5]*p[1] + m[9]*p[2] + m[13]) / w;
    return [(x * 0.5 + 0.5) * this.canvas.clientWidth,
            (1 - (y * 0.5 + 0.5)) * this.canvas.clientHeight, w];
  }

  /* nearest neuron to a screen point, in screen space */
  pick(px, py) {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const x = px * dpr, y = py * dpr;
    const m = this._mvp || this.mvp();
    const W = this.canvas.width, H = this.canvas.height;
    let best = -1, bestD = 26 * dpr * (26 * dpr);
    const p = this.pos;
    for (let i = 0; i < this.N; i++) {
      if (this.dim[i] < 0.5 && this.sel[i] < 0.5 && this.act[i] < 0.05) continue;
      const ox = p[i * 3], oy = p[i * 3 + 1], oz = p[i * 3 + 2];
      const cw = m[3] * ox + m[7] * oy + m[11] * oz + m[15];
      if (cw <= 0) continue;
      const cx = (m[0] * ox + m[4] * oy + m[8] * oz + m[12]) / cw;
      const cy = (m[1] * ox + m[5] * oy + m[9] * oz + m[13]) / cw;
      const sx = (cx * 0.5 + 0.5) * W, sy = (1 - (cy * 0.5 + 0.5)) * H;
      const d = (sx - x) * (sx - x) + (sy - y) * (sy - y);
      // prefer active/selected neurons when several overlap
      const bias = 1 - 0.55 * Math.min(1, this.act[i] + this.sel[i]);
      if (d * bias < bestD) { bestD = d * bias; best = i; }
    }
    return best;
  }
}

function upload(gl, buf, arr) {
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, arr);
}
function attrib(gl, prog, name, data, size, usage) {
  const b = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, data, usage || gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, name);
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
  return b;
}
function link(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  return p;
}
