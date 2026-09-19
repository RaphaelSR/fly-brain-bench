export function sampleEpisode(episode, time) {
  const frames = episode.frames;
  let lo = 0, hi = frames.length - 1;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (frames[mid].t <= time) lo = mid; else hi = mid - 1;
  }
  const a = frames[lo], b = frames[Math.min(lo + 1, frames.length - 1)];
  const u = Math.max(0, Math.min(1, (time - a.t) / (b.t - a.t || 1)));
  const lerp = key => a[key] + (b[key] - a[key]) * u;
  const p = a.projectile, q = b.projectile;
  return { ...a, t: time, x: lerp('x'), z: lerp('z'), height: lerp('height'),
    pitch: lerp('pitch'), roll: lerp('roll'), air: lerp('air'), tuck: lerp('tuck'),
    projectile: Object.fromEntries(['x', 'y', 'z', 'yaw'].map(k => [k, p[k] + (q[k] - p[k]) * u])) };
}

export class LiveSession {
  constructor(onProgress) {
    this.worker = new Worker(new URL('./survival.worker.js', import.meta.url), { type: 'module' });
    this.id = 0; this.busy = false; this.time = 0; this.episode = null;
    this.worker.onmessage = ({ data }) => {
      if (data.id !== this.id || !this.pending) return;
      if (data.progress) { onProgress(data.progress); return; }
      this.busy = false;
      const { resolve, reject } = this.pending; this.pending = null;
      if (data.error) reject(new Error(data.error));
      else { this.episode = data.episode; this.time = 0; this.observation = -1; resolve(data.episode); }
    };
    this.worker.onerror = e => {
      this.busy = false;
      this.pending?.reject(new Error(e.message || 'Simulation worker failed'));
      this.pending = null;
    };
  }
  request(type, options) {
    if (this.busy) return Promise.reject(new Error('Simulation is already running'));
    this.busy = true;
    return new Promise((resolve, reject) => {
      this.pending = { resolve, reject };
      this.worker.postMessage({ type, id: ++this.id, ...options });
    });
  }
  get finished() { return this.episode && this.time >= this.episode.duration; }
  get frame() { return this.episode ? sampleEpisode(this.episode, this.time) : null; }
  restart() { this.time = 0; this.observation = -1; }
  dispose() { this.worker.terminate(); this.pending?.reject(new Error('Session closed')); this.pending = null; }
}
