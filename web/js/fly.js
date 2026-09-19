/* Procedural Drosophila in a small world.

   Axes follow the usual fly convention: +Z is anterior (forward), +Y is dorsal
   (up), +X is to the fly's right. Yaw turns about Y, pitch about X, roll about Z.

   Legs are a real kinematic chain — coxa attachment, then femur and tibia solved
   by two-link inverse kinematics onto a foot target. During stance the foot stays
   planted on the ground while the body moves over it; during swing it lifts and
   swings forward. That is what makes the tripod gait read as walking rather than
   as legs waving in the air. */

const VS = `#version 300 es
precision highp float;
in vec3 aPos; in vec3 aNrm;
uniform mat4 uVP; uniform mat4 uModel; uniform mat3 uNormal;
out vec3 vN; out vec3 vP; out vec3 vObj;
void main(){ vec4 wp = uModel * vec4(aPos,1.0); vP = wp.xyz; vObj = aPos; vN = uNormal * aNrm;
  gl_Position = uVP * wp; }`;

const FS = `#version 300 es
precision highp float;
in vec3 vN; in vec3 vP; in vec3 vObj;
uniform vec3 uColor; uniform float uAlpha; uniform float uEmit;
uniform float uShine; uniform int uPattern; uniform vec3 uEye;
out vec4 frag;

/* three cosines at 60 degrees tile the plane hexagonally — close enough to the
   ommatidial lattice of a compound eye at this scale */
float hexLattice(vec2 p){
  float a = cos(p.x * 6.2831853);
  float b = cos((p.x * 0.5 + p.y * 0.8660254) * 6.2831853);
  float c = cos((p.x * 0.5 - p.y * 0.8660254) * 6.2831853);
  return (a + b + c) / 3.0;
}

void main(){
  vec3 n = normalize(vN);
  vec3 V = normalize(uEye - vP);
  vec3 key = normalize(vec3(0.42, 0.82, 0.55));
  vec3 fill = normalize(vec3(-0.62, 0.28, -0.52));
  float d = max(dot(n, key), 0.0);
  float f = max(dot(n, fill), 0.0);
  float spec = pow(max(dot(n, normalize(key + V)), 0.0), 26.0) * uShine;
  float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);

  vec3 base = uColor;
  if (uPattern == 1) {                     // compound eye
    vec3 en = normalize(vObj);
    vec2 uv = vec2(atan(en.x, en.z), asin(clamp(en.y, -1.0, 1.0))) * 7.5;
    float cell = hexLattice(uv);
    base *= 0.72 + 0.45 * smoothstep(-0.1, 0.9, cell);
    spec += pow(max(cell, 0.0), 8.0) * 0.30;
  } else if (uPattern == 2) {              // abdominal banding
    float band = smoothstep(0.18, 0.42, abs(fract(vObj.z * 2.2 + 0.25) - 0.5));
    base *= 0.55 + 0.60 * band;
  }

  vec3 c = base * (0.34 + 1.15 * d + 0.32 * f)
         + vec3(1.0, 0.88, 0.62) * spec
         + base * uEmit * 2.0
         + vec3(0.32, 0.46, 0.52) * fres * 0.28;
  frag = vec4(c, uAlpha);
}`;

/* wings get their own program: a translucent membrane with real venation and a
   thin-film sheen, because at this size a plain alpha quad reads as nothing */
const WVS = `#version 300 es
precision highp float;
in vec3 aPos; in vec2 aUV;
uniform mat4 uVP; uniform mat4 uModel;
out vec2 vUV; out vec3 vP; out vec3 vNw;
void main(){
  vec4 wp = uModel * vec4(aPos, 1.0);
  vP = wp.xyz; vUV = aUV;
  vNw = normalize(cross(vec3(uModel[0]), vec3(uModel[2])));
  gl_Position = uVP * wp;
}`;

const WFS = `#version 300 es
precision highp float;
in vec2 vUV; in vec3 vP; in vec3 vNw;
uniform vec3 uEye; uniform float uAlpha;
out vec4 frag;

/* Drosophila has five longitudinal veins that fan towards the margin, plus two
   cross-veins. These positions are eyeballed from a wing plate, not measured. */
float veins(vec2 uv){
  float u = uv.x, v = uv.y;
  float k = 0.0;
  float fan = mix(0.35, 1.0, u);
  float pos[5] = float[5](-0.72, -0.34, 0.04, 0.42, 0.78);
  for (int i = 0; i < 5; i++){
    float c = pos[i] * fan;
    float wdt = 0.030 + 0.012 * float(i);
    k = max(k, smoothstep(wdt, 0.0, abs(v - c)) * smoothstep(0.02, 0.12, u));
  }
  // the two cross-veins
  k = max(k, smoothstep(0.020, 0.0, abs(u - 0.46)) * smoothstep(0.55, 0.15, abs(v)) * 0.9);
  k = max(k, smoothstep(0.020, 0.0, abs(u - 0.70)) * smoothstep(0.42, 0.10, abs(v + 0.15)) * 0.8);
  // thickened costa along the leading edge
  k = max(k, smoothstep(0.045, 0.0, abs(v - 0.92 * fan)) * 1.1);
  return clamp(k, 0.0, 1.0);
}

void main(){
  vec3 V = normalize(uEye - vP);
  float fres = pow(1.0 - abs(dot(normalize(vNw), V)), 2.2);
  float vn = veins(vUV);
  // thin-film interference: hue slides with viewing angle
  vec3 sheen = 0.5 + 0.5 * cos(6.2831853 * (fres * 2.6 + vec3(0.0, 0.33, 0.67)));
  vec3 membrane = vec3(0.74, 0.82, 0.88) + sheen * 0.30 * fres;
  vec3 c = mix(membrane, vec3(0.42, 0.35, 0.26), vn * 0.85);
  float a = uAlpha * (0.42 + 0.58 * fres) + vn * 0.55;
  frag = vec4(c * (0.65 + 0.9 * fres + vn * 0.5), clamp(a, 0.0, 0.95));
}`;

/* ground: a grid whose lines come from world position, so the fly visibly travels */
const GVS = `#version 300 es
precision highp float;
in vec3 aPos;
uniform mat4 uVP; uniform vec2 uOrigin;
out vec2 vXZ; out vec2 vLocal;
void main(){
  // the ground follows the fly; the grid pattern stays in world coordinates,
  // so walking visibly carries her across it
  vec2 world = aPos.xz * 14.0 + uOrigin;
  vXZ = world;
  vLocal = aPos.xz;
  gl_Position = uVP * vec4(world.x, 0.0, world.y, 1.0);
}`;

const GFS = `#version 300 es
precision highp float;
in vec2 vXZ; in vec2 vLocal;
out vec4 frag;
float grid(vec2 p, float scale){
  vec2 c = p * scale;
  vec2 g = abs(fract(c - 0.5) - 0.5) / max(fwidth(c), vec2(1e-5));
  return 1.0 - min(min(g.x, g.y), 1.0);
}
void main(){
  float minor = grid(vXZ, 2.0);
  float major = grid(vXZ, 0.4);
  float fade = smoothstep(1.0, 0.12, length(vLocal));
  vec3 c = vec3(0.052,0.082,0.094)
         + vec3(0.10,0.16,0.18) * minor * 0.75
         + vec3(0.26,0.34,0.36) * major * 0.95;
  frag = vec4(c, fade);
}`;

/* ---- geometry ---- */
function sphere(seg = 16, ring = 12) {
  const pos = [], nrm = [], idx = [];
  for (let y = 0; y <= ring; y++) {
    const phi = (y / ring) * Math.PI;
    for (let x = 0; x <= seg; x++) {
      const th = (x / seg) * Math.PI * 2;
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
  const pos = [], uv = [], idx = [];
  const n = 30;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    // Drosophila wing outline: widens fast, then tapers to a rounded tip
    const half = Math.sin(Math.pow(t, 0.72) * Math.PI) * 0.30 * (1 - 0.30 * t) + 0.012;
    pos.push(t, 0, half * 1.00); uv.push(t, 1);
    pos.push(t, 0, -half * 0.62); uv.push(t, -1);
  }
  for (let i = 0; i < n; i++) { const a = i * 2, b = a + 2; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  return { pos: new Float32Array(pos), uv: new Float32Array(uv), idx: new Uint16Array(idx) };
}

function quad() {
  return { pos: new Float32Array([-1,0,-1, 1,0,-1, 1,0,1, -1,0,1]),
           nrm: new Float32Array([0,1,0, 0,1,0, 0,1,0, 0,1,0]),
           idx: new Uint16Array([0,1,2, 0,2,3]) };
}

/* ---- vec / mat ---- */
const sub3=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const add3=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const mul3=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const dot3=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross3=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const len3=(a)=>Math.hypot(a[0],a[1],a[2]);
const nrm3=(a)=>{const l=len3(a)||1;return [a[0]/l,a[1]/l,a[2]/l];};
const M = {
  mul(a,b){const o=new Float32Array(16);
    for(let i=0;i<4;i++)for(let j=0;j<4;j++){let s=0;for(let k=0;k<4;k++)s+=a[k*4+j]*b[i*4+k];o[i*4+j]=s;}return o;},
  perspective(f,a,n,fa){const q=1/Math.tan(f/2),nf=1/(n-fa);
    return new Float32Array([q/a,0,0,0, 0,q,0,0, 0,0,(fa+n)*nf,-1, 0,0,2*fa*n*nf,0]);},
  lookAt(e,c,u){const z=nrm3(sub3(e,c)),x=nrm3(cross3(u,z)),y=cross3(z,x);
    return new Float32Array([x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0,
      -dot3(x,e),-dot3(y,e),-dot3(z,e),1]);},
  /* body frame: yaw about Y, then pitch about X, then roll about Z, at t */
  body(t,yaw,pitch,roll){
    const cy=Math.cos(yaw),sy=Math.sin(yaw),cx=Math.cos(pitch),sx=Math.sin(pitch),cz=Math.cos(roll),sz=Math.sin(roll);
    const r=[ cy*cz+sy*sx*sz, cx*sz, -sy*cz+cy*sx*sz,
             -cy*sz+sy*sx*cz, cx*cz,  sy*sz+cy*sx*cz,
              sy*cx,         -sx,     cy*cx];
    return new Float32Array([r[0],r[1],r[2],0, r[3],r[4],r[5],0, r[6],r[7],r[8],0, t[0],t[1],t[2],1]);
  },
  scaleRot(s){ return new Float32Array([s[0],0,0,0, 0,s[1],0,0, 0,0,s[2],0, 0,0,0,1]); },
  /* a capsule-ish segment running from p0 to p1 with a given thickness */
  bone(p0,p1,thick){
    const d=sub3(p1,p0), L=len3(d)||1e-4, y=mul3(d,1/L);
    const ref=Math.abs(y[1])>0.92?[1,0,0]:[0,1,0];
    const x=nrm3(cross3(ref,y)), z=cross3(x,y);
    const m=[(p0[0]+p1[0])/2,(p0[1]+p1[1])/2,(p0[2]+p1[2])/2];
    return new Float32Array([x[0]*thick,x[1]*thick,x[2]*thick,0,
                             y[0]*L,y[1]*L,y[2]*L,0,
                             z[0]*thick,z[1]*thick,z[2]*thick,0,
                             m[0],m[1],m[2],1]);
  },
  normalOf(m){ return new Float32Array([m[0],m[1],m[2], m[4],m[5],m[6], m[8],m[9],m[10]]); },
  translate(t){ return new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, t[0],t[1],t[2],1]); },
};

const COL = {
  thorax:[0.54,0.39,0.22], abdomen:[0.33,0.25,0.15], head:[0.47,0.34,0.20],
  eye:[0.86,0.22,0.13], coxa:[0.34,0.26,0.17], femur:[0.31,0.24,0.15],
  tibia:[0.27,0.21,0.14], tarsus:[0.22,0.17,0.11], wing:[0.80,0.86,0.90],
  proboscis:[0.70,0.55,0.33], halter:[0.66,0.50,0.29], antenna:[0.40,0.30,0.19],
  bristle:[0.18,0.14,0.10],
};

/* Body height, and the three leg pairs. Coxae sit ventro-laterally on the thorax;
   pro/meso/metathoracic legs get progressively longer, as in a real fly. */
const H = 0.30;
const LEGS = [
  { side:-1, z: 0.26, tripod:0, femur:0.30, tibia:0.34, reach:[-0.40, 0.34], phase:0.00 },
  { side: 1, z: 0.26, tripod:1, femur:0.30, tibia:0.34, reach:[ 0.40, 0.34], phase:0.00 },
  { side:-1, z: 0.02, tripod:1, femur:0.33, tibia:0.37, reach:[-0.50, 0.02], phase:0.00 },
  { side: 1, z: 0.02, tripod:0, femur:0.33, tibia:0.37, reach:[ 0.50, 0.02], phase:0.00 },
  { side:-1, z:-0.22, tripod:0, femur:0.37, tibia:0.44, reach:[-0.46,-0.34], phase:0.00 },
  { side: 1, z:-0.22, tripod:1, femur:0.37, tibia:0.44, reach:[ 0.46,-0.34], phase:0.00 },
];
const STRIDE = 0.30;

export class FlyView {
  constructor(canvas) {
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false });
    if (!gl) throw new Error('WebGL2 required');
    this.gl = gl; this.canvas = canvas;
    this.prog = link(gl, VS, FS);
    this.gprog = link(gl, GVS, GFS);
    this.wprog = link(gl, WVS, WFS);
    this.sphere = mesh(gl, this.prog, sphere());
    this.wing = mesh(gl, this.wprog, wingMesh());
    this.ground = mesh(gl, this.gprog, quad());
    this.u = {
      VP: gl.getUniformLocation(this.prog,'uVP'), model: gl.getUniformLocation(this.prog,'uModel'),
      normal: gl.getUniformLocation(this.prog,'uNormal'), color: gl.getUniformLocation(this.prog,'uColor'),
      alpha: gl.getUniformLocation(this.prog,'uAlpha'), emit: gl.getUniformLocation(this.prog,'uEmit'),
      shine: gl.getUniformLocation(this.prog,'uShine'), pattern: gl.getUniformLocation(this.prog,'uPattern'),
      eye: gl.getUniformLocation(this.prog,'uEye'),
    };
    this.wu = {
      VP: gl.getUniformLocation(this.wprog,'uVP'), model: gl.getUniformLocation(this.wprog,'uModel'),
      eye: gl.getUniformLocation(this.wprog,'uEye'), alpha: gl.getUniformLocation(this.wprog,'uAlpha'),
    };
    this.gu = { VP: gl.getUniformLocation(this.gprog,'uVP'), origin: gl.getUniformLocation(this.gprog,'uOrigin') };

    this.yaw = 0.75; this.pitch = -0.26; this.dist = 3.4; this.userMoved = false;
    this.camAt = [0, 0, 0];
    /* Three hooks, so a scenario can put her in a different world without a second
       copy of the renderer: somewhere else for the camera to follow, a per-eye
       glow, and a callback that runs after she is drawn with the same view matrix
       and the same part() helper she was drawn with. */
    this.camFocus = null;
    this.eyeGlow = [0, 0];
    this.onExtra = null;
    this.s = {
      pos:[0,0,0], heading:0, pitch:0, roll:0, h:H,
      speed:0, turn:0, gait:0, wing:0, wingPhase:0,
      proboscis:0, groom:0, groomPhase:0, jump:0, lift:0, airborne:0,
    };
    // feet live in world space; stance feet stay planted
    this.feet = LEGS.map(L => [L.reach[0], 0, L.reach[1]]);
    this.planted = LEGS.map(() => true);
    this._bind();
  }

  _bind(){
    const c=this.canvas; let drag=false,lx=0,ly=0;
    c.addEventListener('pointerdown',e=>{c.setPointerCapture(e.pointerId);drag=true;this.userMoved=true;lx=e.clientX;ly=e.clientY;});
    c.addEventListener('pointermove',e=>{ if(!drag)return;
      this.yaw+=(e.clientX-lx)*0.008;
      this.pitch=Math.max(-1.25,Math.min(0.25,this.pitch+(e.clientY-ly)*0.006));
      lx=e.clientX; ly=e.clientY;});
    c.addEventListener('pointerup',()=>drag=false);
    c.addEventListener('pointercancel',()=>drag=false);
    c.addEventListener('wheel',e=>{e.preventDefault();
      this.dist=Math.max(1.5,Math.min(9,this.dist*Math.exp(e.deltaY*0.0012)));},{passive:false});
  }

  /* drive values are 0..1 except turn which is -1..1 */
  update(d, dt){
    const s = this.s;
    dt = Math.min(dt, 0.05);
    const stop = d.stop || 0;
    const fwd = ((d.walk || 0) - (d.backward || 0)) * (1 - stop);
    s.speed += (fwd - s.speed) * Math.min(1, dt * 5);
    s.turn  += ((d.turn || 0) * (1 - stop) - s.turn) * Math.min(1, dt * 4);
    s.jump  += ((d.escape || 0) - s.jump) * Math.min(1, dt * (d.escape > s.jump ? 20 : 2.5));
    s.wing  += (Math.max(d.wing || 0, d.escape || 0) - s.wing) * Math.min(1, dt * 7);
    s.proboscis += ((d.proboscis || 0) - s.proboscis) * Math.min(1, dt * 8);
    s.groom += ((d.groom || 0) - s.groom) * Math.min(1, dt * 4);

    // takeoff: rise, pitch nose-up, and stop caring about the ground
    s.airborne += (s.jump - s.airborne) * Math.min(1, dt * 5);
    s.lift += (s.jump * 0.55 - s.lift) * Math.min(1, dt * 6);
    s.h = H + s.lift;
    s.pitch += (-s.jump * 0.42 - s.pitch) * Math.min(1, dt * 6);
    s.roll  += (s.turn * -0.20 - s.roll) * Math.min(1, dt * 5);

    // travel through the world
    s.heading += s.turn * dt * 1.9;
    const v = s.speed * 1.15;
    s.pos[0] += Math.sin(s.heading) * v * dt;
    s.pos[2] += Math.cos(s.heading) * v * dt;
    s.pos[1] = s.lift;

    // gait clock only advances while actually walking
    const moving = Math.abs(s.speed) > 0.03 && s.airborne < 0.5;
    s.gait += dt * (3.4 + Math.abs(s.speed) * 9) * (moving ? 1 : 0);
    s.wingPhase += dt * (14 + s.wing * 46);
    s.groomPhase += dt * 9.0;   // grooming has its own clock; the gait clock stops when standing

    this._steps(moving, dt);
  }

  /* stance/swing bookkeeping: a planted foot stays where it is until its turn to swing */
  _steps(moving, dt){
    const s = this.s;
    const fwdv = [Math.sin(s.heading), 0, Math.cos(s.heading)];
    const rightv = [Math.cos(s.heading), 0, -Math.sin(s.heading)];
    for (let i = 0; i < LEGS.length; i++) {
      const L = LEGS[i];
      const home = add3(add3(s.pos, mul3(rightv, L.reach[0])), mul3(fwdv, L.reach[1]));
      if (!moving || s.airborne > 0.5) {
        // stand (or tuck up in flight): ease every foot back to its home spot
        const k = Math.min(1, dt * (s.airborne > 0.5 ? 7 : 4));
        for (let a = 0; a < 3; a++) this.feet[i][a] += (home[a] - this.feet[i][a]) * k;
        this.feet[i][1] = s.airborne * 0.12;
        this.planted[i] = s.airborne < 0.5;
        continue;
      }
      const ph = (s.gait / (Math.PI * 2) + (L.tripod ? 0.5 : 0)) % 1;
      const swinging = ph > 0.5;
      if (!swinging) {
        this.planted[i] = true;                     // stance: the ground holds it
        this.feet[i][1] = 0;
      } else {
        // swing: arc forward to the landing spot for the next stance
        const u = (ph - 0.5) * 2;
        const target = add3(home, mul3(fwdv, STRIDE * 0.5 * Math.sign(s.speed || 1)));
        const from = add3(home, mul3(fwdv, -STRIDE * 0.5 * Math.sign(s.speed || 1)));
        for (let a = 0; a < 3; a++) this.feet[i][a] = from[a] + (target[a] - from[a]) * u;
        this.feet[i][1] = Math.sin(u * Math.PI) * 0.13;
        this.planted[i] = false;
      }
    }
  }

  resize(){
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.floor(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.floor(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    return [w, h];
  }

  draw(){
    const gl = this.gl, s = this.s;
    const [w, h] = this.resize();
    gl.viewport(0, 0, w, h);
    gl.clearColor(0.031, 0.051, 0.059, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.enable(gl.DEPTH_TEST);

    // camera trails the fly — or whatever the scenario points it at — instead of
    // being glued to it
    const follow = this.camFocus || s.pos;
    for (let a = 0; a < 3; a++) this.camAt[a] += (follow[a] - this.camAt[a]) * 0.16;
    if (!this.userMoved) this.yaw += 0.0022;
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    const focus = [this.camAt[0], this.camAt[1] + 0.22, this.camAt[2]];
    const eye = [focus[0] + this.dist * cp * Math.sin(this.yaw),
                 focus[1] - this.dist * sp + 0.30,
                 focus[2] + this.dist * cp * Math.cos(this.yaw)];
    const vp = M.mul(M.perspective(0.70, w / h, 0.05, 80), M.lookAt(eye, focus, [0, 1, 0]));

    // ground
    gl.useProgram(this.gprog);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.depthMask(false);
    gl.uniformMatrix4fv(this.gu.VP, false, vp);
    gl.uniform2f(this.gu.origin, s.pos[0], s.pos[2]);
    gl.bindVertexArray(this.ground.vao);
    gl.drawElements(gl.TRIANGLES, this.ground.count, gl.UNSIGNED_SHORT, 0);
    gl.depthMask(true);

    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.u.VP, false, vp);
    gl.uniform3fv(this.u.eye, eye);
    const part = (mObj, m, color, alpha = 1, emit = 0, shine = 0.25, pattern = 0) => {
      gl.uniformMatrix4fv(this.u.model, false, m);
      gl.uniformMatrix3fv(this.u.normal, false, M.normalOf(m));
      gl.uniform3fv(this.u.color, color);
      gl.uniform1f(this.u.alpha, alpha); gl.uniform1f(this.u.emit, emit);
      gl.uniform1f(this.u.shine, shine); gl.uniform1i(this.u.pattern, pattern);
      gl.bindVertexArray(mObj.vao);
      gl.drawElements(gl.TRIANGLES, mObj.count, gl.UNSIGNED_SHORT, 0);
    };
    const wingPart = (m, alpha) => {
      gl.useProgram(this.wprog);
      gl.uniformMatrix4fv(this.wu.VP, false, vp);
      gl.uniformMatrix4fv(this.wu.model, false, m);
      gl.uniform3fv(this.wu.eye, eye);
      gl.uniform1f(this.wu.alpha, alpha);
      gl.bindVertexArray(this.wing.vao);
      gl.drawElements(gl.TRIANGLES, this.wing.count, gl.UNSIGNED_SHORT, 0);
      gl.useProgram(this.prog);
    };

    // contact shadow, fading as she lifts off
    const sh = Math.max(0, 1 - s.lift * 2.2);
    if (sh > 0.02) {
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      const m = M.mul(M.translate([s.pos[0], 0.004, s.pos[2]]), M.scaleRot([1.05 + s.lift, 0.001, 1.5 + s.lift]));
      part(this.sphere, m, [0.0, 0.0, 0.0], 0.42 * sh);
    }

    const body = M.body([s.pos[0], s.h, s.pos[2]], s.heading, s.pitch, s.roll);
    const L2W = (p) => [                                   // body-local point -> world
      body[0]*p[0] + body[4]*p[1] + body[8]*p[2] + body[12],
      body[1]*p[0] + body[5]*p[1] + body[9]*p[2] + body[13],
      body[2]*p[0] + body[6]*p[1] + body[10]*p[2] + body[14]];
    const local = (m) => M.mul(body, m);
    const headY = 0.055 + s.groom * Math.sin(s.groomPhase) * 0.025;

    gl.disable(gl.BLEND);
    // abdomen in three tapering segments
    for (let k = 0; k < 3; k++) {
      const f = k / 2;
      part(this.sphere, local(M.mul(M.translate([0, 0.012 - f * 0.012, -0.20 - k * 0.155]),
        M.scaleRot([0.235 - f * 0.075, 0.215 - f * 0.07, 0.20 - f * 0.03]))), COL.abdomen, 1, 0, 0.30, 2);
    }
    part(this.sphere, local(M.mul(M.translate([0, 0.02, 0.03]), M.scaleRot([0.255, 0.245, 0.34]))), COL.thorax, 1, 0, 0.45);
    part(this.sphere, local(M.mul(M.translate([0, headY, 0.30]), M.scaleRot([0.215, 0.205, 0.185]))), COL.head);
    for (const sd of [-1, 1]) {
      const glow = this.eyeGlow[sd < 0 ? 0 : 1] || 0;
      part(this.sphere, local(M.mul(M.translate([sd * 0.085, headY + 0.02, 0.325]),
        M.scaleRot([0.125 + glow * 0.02, 0.16 + glow * 0.02, 0.14 + glow * 0.02]))),
        COL.eye, 1, 0.14 + glow * 1.5, 0.8, 1);
      // antenna: a short pedicel and the arista
      const a0 = [sd * 0.045, headY - 0.03, 0.40], a1 = [sd * 0.075, headY - 0.10, 0.45];
      part(this.sphere, M.bone(L2W(a0), L2W(a1), 0.030), COL.antenna);
      part(this.sphere, M.bone(L2W(a1), L2W([sd * 0.13, headY - 0.15, 0.52]), 0.012), COL.bristle);
      // halteres, beating out of phase with the wings as they really do
      const hb = Math.sin(s.wingPhase + Math.PI) * (0.05 + s.wing * 0.10);
      part(this.sphere, local(M.mul(M.translate([sd * 0.135, 0.02 + hb, -0.10]), M.scaleRot([0.05, 0.05, 0.05]))), COL.halter);
    }
    // proboscis, extending straight down from the mouthparts
    const pl = 0.05 + s.proboscis * 0.26;
    part(this.sphere, M.bone(L2W([0, headY - 0.10, 0.31]), L2W([0, headY - 0.10 - pl, 0.31]), 0.075), COL.proboscis);

    // macrochaetae — the large bristles are a signature of the thorax and head
    const BRISTLE = [
      [ 0.085, 0.145, -0.24, 0.20, 0.30, -0.55],  [-0.085, 0.145, -0.24, -0.20, 0.30, -0.55],
      [ 0.045, 0.160, -0.14, 0.13, 0.33, -0.34],  [-0.045, 0.160, -0.14, -0.13, 0.33, -0.34],
      [ 0.115, 0.120,  0.10, 0.26, 0.28,  0.16],  [-0.115, 0.120,  0.10, -0.26, 0.28,  0.16],
      [ 0.075, 0.150,  0.34, 0.16, 0.30,  0.48],  [-0.075, 0.150,  0.34, -0.16, 0.30,  0.48],
    ];
    for (const b of BRISTLE) {
      part(this.sphere, M.bone(L2W([b[0], b[1] + headY * 0.3, b[2]]), L2W([b[3], b[4] + headY * 0.3, b[5]]), 0.016),
        COL.bristle, 1, 0, 0.1);
    }

    // legs, solved by two-link IK onto the foot targets
    for (let i = 0; i < LEGS.length; i++) {
      const L = LEGS[i];
      const coxaL = [L.side * 0.125, -0.045, L.z];
      const coxa = L2W(coxaL);
      const hipL = [L.side * 0.20, -0.105, L.z];
      const hip = L2W(hipL);
      part(this.sphere, M.bone(coxa, hip, 0.075), COL.coxa);

      const groomLift = (i < 2) ? s.groom : 0;
      let foot = this.feet[i];
      if (groomLift > 0.05) {          // front legs sweep over the head when grooming
        const sweep = Math.sin(s.groomPhase) * 0.06;
        const target = L2W([L.side * (0.12 + sweep), headY + 0.09 + Math.cos(s.groomPhase) * 0.05, 0.33]);
        foot = [foot[0] * (1 - groomLift) + target[0] * groomLift,
                foot[1] * (1 - groomLift) + target[1] * groomLift,
                foot[2] * (1 - groomLift) + target[2] * groomLift];
      }
      const knee = solveIK(hip, foot, L.femur, L.tibia, L2W([L.side * 2.0, 1.4, 0]), hip);
      part(this.sphere, M.bone(hip, knee, 0.058), COL.femur);
      const ankle = [knee[0] + (foot[0] - knee[0]) * 0.82,
                     knee[1] + (foot[1] - knee[1]) * 0.82,
                     knee[2] + (foot[2] - knee[2]) * 0.82];
      part(this.sphere, M.bone(knee, ankle, 0.044), COL.tibia);
      part(this.sphere, M.bone(ankle, foot, 0.030), COL.tarsus);
      part(this.sphere, M.mul(M.translate(foot), M.scaleRot([0.042, 0.042, 0.042])), COL.bristle, 1, 0, 0.4);
    }

    // wings last, translucent, with a tilted stroke plane
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    const fly = s.wing;                                   // 0 = folded at rest, 1 = beating
    const amp = fly * 1.15;
    const stroke = Math.sin(s.wingPhase) * amp;
    const dev = Math.cos(s.wingPhase * 2) * amp * 0.22;   // figure-eight deviation
    for (const sd of [-1, 1]) {
      const root = [sd * 0.10, 0.115, 0.00];
      // at rest the wings lie back along the abdomen; in flight they sweep out and up
      const restTip   = [sd * 0.090, 0.090, -0.82];
      const flightTip = [sd * (0.30 + Math.cos(stroke) * 0.52),
                         0.13 + Math.sin(stroke) * 0.42 + dev,
                         -0.34 + Math.abs(stroke) * 0.20];
      const tip = [restTip[0] + (flightTip[0] - restTip[0]) * fly,
                   restTip[1] + (flightTip[1] - restTip[1]) * fly,
                   restTip[2] + (flightTip[2] - restTip[2]) * fly];
      const m = wingMatrix(L2W(root), L2W(tip), L2W([root[0] + sd * 0.12, root[1] + 0.30, root[2]]), sd);
      wingPart(m, 0.50 + fly * 0.22);
    }
    gl.disable(gl.BLEND);
    // whatever else belongs in this world, drawn with the same camera and the
    // same shading she was drawn with
    this.onExtra?.(vp, eye, part);
    gl.bindVertexArray(null);
  }
}

/* two-link IK: knee position given hip, foot, segment lengths and a bend hint */
function solveIK(hip, foot, l1, l2, hint, origin) {
  const d = sub3(foot, hip);
  let D = len3(d);
  const maxD = (l1 + l2) * 0.995, minD = Math.abs(l1 - l2) + 1e-3;
  D = Math.max(minD, Math.min(maxD, D));
  const dir = mul3(d, 1 / (len3(d) || 1e-4));
  // cosine rule for the angle between the femur and the hip->foot line
  const cosA = Math.max(-1, Math.min(1, (l1 * l1 + D * D - l2 * l2) / (2 * l1 * D)));
  const a = Math.acos(cosA);
  // bend the knee away from the body: build a perpendicular in the hint direction
  let up = sub3(hint, origin);
  up = sub3(up, mul3(dir, dot3(up, dir)));
  if (len3(up) < 1e-4) up = [0, 1, 0];
  up = nrm3(up);
  const fem = add3(mul3(dir, Math.cos(a) * l1), mul3(up, Math.sin(a) * l1));
  return add3(hip, fem);
}

/* place the wing quad so its x axis runs root->tip and it stays roughly flat */
function wingMatrix(root, tip, upRef, sd) {
  const x = sub3(tip, root), L = len3(x) || 1e-4;
  const xn = mul3(x, 1 / L);
  let up = nrm3(sub3(upRef, root));
  let z = nrm3(cross3(xn, up));
  if (sd < 0) z = mul3(z, -1);
  const y = cross3(z, xn);
  return new Float32Array([xn[0]*L, xn[1]*L, xn[2]*L, 0,
                           y[0], y[1], y[2], 0,
                           z[0]*L, z[1]*L, z[2]*L, 0,
                           root[0], root[1], root[2], 1]);
}

function mesh(gl, prog, m) {
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const attrs = [['aPos', m.pos, 3]];
  if (m.nrm) attrs.push(['aNrm', m.nrm, 3]);
  if (m.uv) attrs.push(['aUV', m.uv, 2]);
  for (const [name, data, size] of attrs) {
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, name);
    if (loc < 0) continue;
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
