/* WebGL2 point-cloud renderer for the connectome. No dependencies.

   Two things make a hundred thousand additive points read as a brain rather than
   a flat smear, and both are here: depth, and bloom.

   Depth, because additive blending throws away occlusion by construction — every
   point contributes equally wherever it sits, so the cloud has no front and no
   back and rotating it tells you nothing. Fading and shrinking by distance from
   the camera puts the near half in front of the far half again.

   Bloom, because a firing neuron is one pixel. A pixel cannot look bright; it can
   only look white. Spilling its light into the pixels around it is what makes the
   difference between a cell that is on and a cell that is *firing*, and it is the
   whole reason a wave running through the cloud is visible at all. */

const VS = `#version 300 es
precision highp float;
in vec3 aPos;
in float aAct;      // 0..1 recent spiking
in float aNT;       // neurotransmitter index
in float aSel;      // 1 = in the stimulated set
in float aDim;      // 0 = filtered out
in float aValid;    // 0 = no annotated position: never draw an invented location
uniform mat4 uMVP;
uniform float uPointScale;
uniform float uBaseAlpha;
uniform vec2 uFog;          // (near, far) in view depth
uniform vec3 uNTColor[8];
out vec3 vRGB;
out float vAct;
void main() {
  vec4 clip = uMVP * vec4(aPos, 1.0);
  gl_Position = clip;

  // clip.w is view-space distance under a standard perspective: the depth cue
  float near = 1.0 - smoothstep(uFog.x, uFog.y, clip.w);
  float depth = 0.30 + 0.70 * near;

  float act = aAct;
  float size = uPointScale / max(clip.w, 0.001);
  gl_PointSize = clamp(size * (1.0 + act * 4.5 + aSel * 2.2) * (0.72 + 0.28 * near), 1.0, 40.0);

  vec3 base = uNTColor[int(aNT)];
  // resting cells draw the anatomy; firing cells burn toward white
  vec3 hot = mix(base, vec3(1.0, 0.95, 0.84), min(act * 1.05, 0.9));
  // brightness lives entirely in rgb because the blend is additive
  vRGB = hot * (uBaseAlpha * aDim * depth + act * 2.2 + aSel * 0.6);
  vAct = act + aSel * 0.45;
  if (aValid < 0.5) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vRGB = vec3(0.0); }
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
  float halo = exp(-r2 * 2.2) * vAct * 0.55;
  frag = vec4(vRGB * (core + halo), 1.0);
}`;

/* --- post chain: one triangle, three fragment programs --- */
const QUAD_VS = `#version 300 es
precision highp float;
out vec2 vUV;
void main() {
  vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
  vUV = p;
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

const BRIGHT_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform float uThreshold;
out vec4 frag;
void main() {
  vec3 c = texture(uTex, vUV).rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  frag = vec4(c * smoothstep(uThreshold, uThreshold + 0.45, l), 1.0);
}`;

/* separable Gaussian, nine taps, radius in texels */
const BLUR_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform vec2 uDir;
out vec4 frag;
const float W[5] = float[5](0.2270270, 0.1945945, 0.1216216, 0.0540540, 0.0162162);
void main() {
  vec3 c = texture(uTex, vUV).rgb * W[0];
  for (int i = 1; i < 5; i++) {
    vec2 o = uDir * float(i);
    c += texture(uTex, vUV + o).rgb * W[i];
    c += texture(uTex, vUV - o).rgb * W[i];
  }
  frag = vec4(c, 1.0);
}`;

const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uScene;
uniform sampler2D uBloomA;
uniform sampler2D uBloomB;
uniform float uBloom;
uniform vec3 uClear;
out vec4 frag;

// filmic curve, so a hot core rolls off instead of clipping to a white disc
vec3 tone(vec3 c) {
  c = max(vec3(0.0), c);
  return clamp((c * (2.51 * c + 0.03)) / (c * (2.43 * c + 0.59) + 0.14), 0.0, 1.0);
}
void main() {
  vec3 c = texture(uScene, vUV).rgb;
  c += (texture(uBloomA, vUV).rgb * 0.40 + texture(uBloomB, vUV).rgb * 0.72) * uBloom;
  c = tone(c);
  // a light vignette, which reads as the instrument it is drawn inside
  vec2 d = vUV - 0.5;
  c *= 1.0 - dot(d, d) * 0.55;
  frag = vec4(c + uClear * 0.6, 1.0);
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

const CLEAR = [0.043, 0.067, 0.078];

export class BrainView {
  constructor(canvas, pos, nt, radius) {
    this.canvas = canvas;
    this.N = pos.length / 3;
    this.pos = pos;
    this.radius = radius;
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false });
    if (!gl) throw new Error('WebGL2 is required for this page.');
    this.gl = gl;

    this.prog = link(gl, VS, FS);
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);
    this.bufPos = attrib(gl, this.prog, 'aPos', pos, 3);
    this.act = new Float32Array(this.N);
    this.sel = new Float32Array(this.N);
    this.dim = new Float32Array(this.N).fill(1);
    this.valid = new Float32Array(this.N).fill(1);
    const ntf = new Float32Array(this.N);
    for (let i = 0; i < this.N; i++) ntf[i] = nt[i];
    this.bufAct = attrib(gl, this.prog, 'aAct', this.act, 1, gl.DYNAMIC_DRAW);
    this.bufNT  = attrib(gl, this.prog, 'aNT', ntf, 1);
    this.bufSel = attrib(gl, this.prog, 'aSel', this.sel, 1, gl.DYNAMIC_DRAW);
    this.bufDim = attrib(gl, this.prog, 'aDim', this.dim, 1, gl.DYNAMIC_DRAW);
    this.bufValid = attrib(gl, this.prog, 'aValid', this.valid, 1, gl.DYNAMIC_DRAW);
    gl.bindVertexArray(null);

    this.uMVP = gl.getUniformLocation(this.prog, 'uMVP');
    this.uPS = gl.getUniformLocation(this.prog, 'uPointScale');
    this.uBA = gl.getUniformLocation(this.prog, 'uBaseAlpha');
    this.uFog = gl.getUniformLocation(this.prog, 'uFog');
    this.uNT = gl.getUniformLocation(this.prog, 'uNTColor');

    // the cloud's own extent, so the camera can be framed on it rather than on a
    // guess scaled off its radius
    const ext = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      let mn = Infinity, mx = -Infinity;
      for (let i = 0; i < this.N; i++) { const v = pos[i * 3 + k]; if (v < mn) mn = v; if (v > mx) mx = v; }
      ext[k] = mx - mn;
    }
    this.extent = ext;
    this.fov = 0.9;
    this.fitMargin = 1.14;
    this.userFramed = false;      // true once the viewer has zoomed it themselves
    this.yaw = 0.0; this.pitch = 0.0; this.dist = radius * 2.05;
    this.target = [0, 0, 0];
    this.autoRotate = true;
    this.baseAlpha = 0.34;
    /* Bloom is what makes a firing cell read as firing rather than as a white
       pixel, but the blend is additive and a dense region is thousands of points
       deep — too much and the whole active area becomes one flat white blob with
       no structure left in it. */
    this.bloom = 0.85;
    this.bloomThreshold = 0.55;
    this.ntColors = new Float32Array(24);
    this._initPost();
    this._bindControls();
  }

  /* Half-float targets when the driver has them, so a firing core can carry a
     value above 1 into the bright pass instead of being clipped on the way in. */
  _initPost() {
    const gl = this.gl;
    this.float = !!gl.getExtension('EXT_color_buffer_half_float') || !!gl.getExtension('EXT_color_buffer_float');
    this.quadVAO = gl.createVertexArray();
    this.pBright = link(gl, QUAD_VS, BRIGHT_FS);
    this.pBlur = link(gl, QUAD_VS, BLUR_FS);
    this.pComp = link(gl, QUAD_VS, COMPOSITE_FS);
    this.rt = {};
    this._fw = this._fh = 0;
  }

  _target(name, w, h) {
    const gl = this.gl;
    let t = this.rt[name];
    if (t && t.w === w && t.h === h) return t;
    if (t) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fbo); }
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    const internal = this.float ? gl.RGBA16F : gl.RGBA8;
    const type = this.float ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE;
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, gl.RGBA, type, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    t = { tex, fbo, w, h };
    this.rt[name] = t;
    return t;
  }

  setNTColors(list) {           // list of [r,g,b] 0..1, up to 8
    for (let i = 0; i < 8; i++) {
      const c = list[i] || [0.5, 0.5, 0.5];
      this.ntColors[i * 3] = c[0]; this.ntColors[i * 3 + 1] = c[1]; this.ntColors[i * 3 + 2] = c[2];
    }
  }

  /* Fit the camera to the cloud's actual bounding box at the current aspect.

     This used to be a fixed multiple of the radius with a fudge for narrow
     viewports, which framed a brain twice as wide as it is tall either cropped or
     lost in the middle of the panel depending on the shape of the canvas. */
  fit(margin = this.fitMargin) {
    const aspect = this.canvas.width / Math.max(this.canvas.height, 1);
    const th = Math.tan(this.fov / 2);
    const dh = (this.extent[1] / 2 * margin) / th;
    const dw = (this.extent[0] / 2 * margin) / (th * Math.max(aspect, 0.2));
    this.dist = Math.max(dh, dw, this.radius * 0.2);
  }

  _bindControls() {
    const c = this.canvas;
    let drag = false, lx = 0, ly = 0;
    /* The wheel only zooms once the viewer has actually grabbed this canvas.

       Zooming on any wheel event over it meant that on a narrow screen, where the
       panel sits in the page flow rather than beside it, scrolling past the brain
       was impossible: every notch was swallowed as zoom and the page never moved. */
    let engaged = false;
    const down = (x, y) => { drag = true; engaged = true; lx = x; ly = y; this.autoRotate = false; };
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
    c.addEventListener('pointerleave', () => { engaged = false; });
    c.addEventListener('wheel', e => {
      if (!engaged && !e.ctrlKey) return;      // let the page scroll
      e.preventDefault();
      this.userFramed = true;
      this.dist *= Math.exp(e.deltaY * 0.0012);
      this.dist = Math.max(this.radius * 0.2, Math.min(this.radius * 9, this.dist));
    }, { passive: false });
  }

  resize() {
    const dpr = Math.min(devicePixelRatio || 1, this.pixelRatioLimit ?? 2);
    const w = Math.floor(this.canvas.clientWidth * dpr), h = Math.floor(this.canvas.clientHeight * dpr);
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    return [w, h];
  }

  mvp() {
    const [w, h] = [this.canvas.width, this.canvas.height];
    const aspect = w / Math.max(h, 1);
    const dist = this.dist;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const eye = [
      this.target[0] + dist * cp * Math.sin(this.yaw),
      this.target[1] + dist * sp,
      this.target[2] + dist * cp * Math.cos(this.yaw)];
    const proj = m4.perspective(this.fov, aspect, this.radius * 0.05, this.radius * 30);
    const view = m4.lookAt(eye, this.target, [0, -1, 0]);   // fly brain data is y-down
    this._eye = eye;
    this._dist = dist;
    return m4.mul(proj, view);
  }

  draw(dtSec) {
    const gl = this.gl;
    const [w, h] = this.resize();
    if (!w || !h) return;
    if (!this.userFramed) this.fit();
    if (this.autoRotate) this.yaw += dtSec * 0.12;

    const post = this.bloom > 0.01;
    const scene = post ? this._target('scene', w, h) : null;
    gl.bindFramebuffer(gl.FRAMEBUFFER, post ? scene.fbo : null);
    gl.viewport(0, 0, w, h);
    gl.clearColor(CLEAR[0], CLEAR[1], CLEAR[2], 1);
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
    gl.uniform2f(this.uFog, Math.max(this._dist - this.radius * 1.05, 0.01), this._dist + this.radius * 1.5);
    gl.uniform3fv(this.uNT, this.ntColors);
    gl.drawArrays(gl.POINTS, 0, this.N);
    gl.bindVertexArray(null);
    if (!post) return;

    gl.disable(gl.BLEND);
    gl.bindVertexArray(this.quadVAO);
    const hw = Math.max(2, w >> 1), hh = Math.max(2, h >> 1);
    const qw = Math.max(2, w >> 2), qh = Math.max(2, h >> 2);
    const a = this._target('a', hw, hh), b = this._target('b', hw, hh);
    const c = this._target('c', qw, qh), d = this._target('d', qw, qh);

    const pass = (prog, fbo, vw, vh, setup) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.viewport(0, 0, vw, vh);
      gl.useProgram(prog);
      setup(prog);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };
    const bind = (unit, tex, prog, name) => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.uniform1i(gl.getUniformLocation(prog, name), unit);
    };

    // bright pass at half resolution
    pass(this.pBright, a.fbo, hw, hh, p => {
      bind(0, scene.tex, p, 'uTex');
      gl.uniform1f(gl.getUniformLocation(p, 'uThreshold'), this.bloomThreshold);
    });
    // a tight glow at half res...
    pass(this.pBlur, b.fbo, hw, hh, p => { bind(0, a.tex, p, 'uTex'); gl.uniform2f(gl.getUniformLocation(p, 'uDir'), 1.2 / hw, 0); });
    pass(this.pBlur, a.fbo, hw, hh, p => { bind(0, b.tex, p, 'uTex'); gl.uniform2f(gl.getUniformLocation(p, 'uDir'), 0, 1.2 / hh); });
    // ...and a wide one at quarter res, which is what makes it look like light
    pass(this.pBlur, c.fbo, qw, qh, p => { bind(0, a.tex, p, 'uTex'); gl.uniform2f(gl.getUniformLocation(p, 'uDir'), 2.0 / qw, 0); });
    pass(this.pBlur, d.fbo, qw, qh, p => { bind(0, c.tex, p, 'uTex'); gl.uniform2f(gl.getUniformLocation(p, 'uDir'), 0, 2.0 / qh); });
    pass(this.pBlur, c.fbo, qw, qh, p => { bind(0, d.tex, p, 'uTex'); gl.uniform2f(gl.getUniformLocation(p, 'uDir'), 3.4 / qw, 0); });
    pass(this.pBlur, d.fbo, qw, qh, p => { bind(0, c.tex, p, 'uTex'); gl.uniform2f(gl.getUniformLocation(p, 'uDir'), 0, 3.4 / qh); });

    pass(this.pComp, null, w, h, p => {
      bind(0, scene.tex, p, 'uScene');
      bind(1, a.tex, p, 'uBloomA');
      bind(2, d.tex, p, 'uBloomB');
      gl.uniform1f(gl.getUniformLocation(p, 'uBloom'), this.bloom);
      gl.uniform3f(gl.getUniformLocation(p, 'uClear'), CLEAR[0], CLEAR[1], CLEAR[2]);
    });
    gl.bindVertexArray(null);
    gl.enable(gl.BLEND);
  }

  uploadAct() { upload(this.gl, this.bufAct, this.act); }
  uploadSel() { upload(this.gl, this.bufSel, this.sel); }
  uploadDim() { upload(this.gl, this.bufDim, this.dim); }
  hideMissingPositions(indices) {
    for (const i of indices) this.valid[i] = 0;
    upload(this.gl, this.bufValid, this.valid);
  }

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
      if (!this.valid[i]) continue;
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
