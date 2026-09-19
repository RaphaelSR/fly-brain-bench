import { Policy } from '../defend/policy.js';
import { PROTOCOL, unpackPolicy } from './core.js';
export const SAVE_KEY = 'fly-play-save-v1';

export function validateSave(data) {
  const s = data?.stats;
  if (data?.protocol !== PROTOCOL || !s || !['throws', 'hits', 'dodges', 'misses'].every(k => Number.isSafeInteger(s[k]) && s[k] >= 0 && s[k] < 1e9) ||
      s.hits + s.dodges + s.misses !== s.throws) throw new Error('Invalid play backup');
  unpackPolicy(new Policy(57, 8), data.policy);
  return data;
}

export class PlayStore {
  constructor(storage) { this.storage = storage; this.revision = 0; }
  load() {
    const raw = this.storage.getItem(SAVE_KEY);
    if (!raw) return null;
    const envelope = JSON.parse(raw);
    if (!Number.isSafeInteger(envelope.revision) || envelope.revision < 0) throw new Error('Invalid revision');
    validateSave(envelope.data); this.revision = envelope.revision; return envelope.data;
  }
  async save(data, { replace = false } = {}) {
    validateSave(data);
    const commit = () => {
      const raw = this.storage.getItem(SAVE_KEY);
      let current = 0;
      try { current = raw ? JSON.parse(raw).revision : 0; } catch (error) { if (!replace) throw error; }
      if (!Number.isSafeInteger(current) || current < 0) { if (!replace) throw new Error('Invalid revision'); current = 0; }
      if (!replace && current !== this.revision) throw new Error('Another tab changed this save');
      const revision = current + 1;
      this.storage.setItem(SAVE_KEY, JSON.stringify({ revision, data }));
      this.revision = revision;
    };
    if (globalThis.navigator?.locks) return navigator.locks.request(SAVE_KEY, commit);
    commit();
  }
}
