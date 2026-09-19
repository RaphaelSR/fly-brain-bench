import { Policy } from '../defend/policy.js';
import { PROTOCOL, unpackPolicy, packPolicy, DIMENSIONS, ACTION_COUNT } from './core.js?v=flight3';
export const SAVE_KEY = 'fly-play-flight-v2';
export const LEGACY_KEY = 'fly-play-save-v1';

export function transferLegacy(data, brain = 'escape') {
  if (data?.protocol !== 'fly-play-hybrid-v1') throw new Error('Not a legacy play backup');
  const old = new Policy(57, 8); unpackPolicy(old, data.policy);
  const policy = new Policy(DIMENSIONS, ACTION_COUNT);
  for (let k = 0; k < 8; k++) {
    policy.W.set(old.W.subarray(k * 57, (k + 1) * 57), k * DIMENSIONS);
    policy.b[k] = old.b[k];
  }
  policy.mu.set(old.mu); policy.vr.set(old.vr); policy.seen = old.seen; policy.episodes = old.episodes;
  return { protocol: PROTOCOL, brain, policy: packPolicy(policy), navigationPolicy: packPolicy(new Policy(DIMENSIONS, ACTION_COUNT)), stats: { throws: 0, hits: 0, dodges: 0, misses: 0 } };
}

export function validateSave(data) {
  const s = data?.stats;
  if (data?.protocol !== PROTOCOL || !['escape', 'whole'].includes(data.brain) || !s || !['throws', 'hits', 'dodges', 'misses'].every(k => Number.isSafeInteger(s[k]) && s[k] >= 0 && s[k] < 1e9) ||
      s.hits + s.dodges + s.misses !== s.throws) throw new Error('Invalid play backup');
  unpackPolicy(new Policy(DIMENSIONS, ACTION_COUNT), data.policy);
  unpackPolicy(new Policy(DIMENSIONS, ACTION_COUNT), data.navigationPolicy);
  return data;
}

export class PlayStore {
  constructor(storage, brain = 'escape') { this.storage = storage; this.revision = 0; this.key = SAVE_KEY + '-' + brain; this.brain = brain; }
  load() {
    const raw = this.storage.getItem(this.key);
    if (!raw) return null;
    const envelope = JSON.parse(raw);
    if (!Number.isSafeInteger(envelope.revision) || envelope.revision < 0) throw new Error('Invalid revision');
    validateSave(envelope.data); if (envelope.data.brain !== this.brain) throw new Error('Different brain profile');
    this.revision = envelope.revision; return envelope.data;
  }
  async save(data, { replace = false } = {}) {
    validateSave(data);
    if (data.brain !== this.brain) throw new Error('Different brain profile');
    const commit = () => {
      const raw = this.storage.getItem(this.key);
      let current = 0;
      try { current = raw ? JSON.parse(raw).revision : 0; } catch (error) { if (!replace) throw error; }
      if (!Number.isSafeInteger(current) || current < 0) { if (!replace) throw new Error('Invalid revision'); current = 0; }
      if (!replace && current !== this.revision) throw new Error('Another tab changed this save');
      const revision = current + 1;
      this.storage.setItem(this.key, JSON.stringify({ revision, data }));
      this.revision = revision;
    };
    if (globalThis.navigator?.locks) return navigator.locks.request(this.key, commit);
    commit();
  }
}
