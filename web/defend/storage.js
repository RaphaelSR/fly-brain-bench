import { validateCheckpoint } from './checkpoint.js';
import { newGame } from './game.js';

export const SAVE_KEY = 'fly-brain-arena-v2';
export const emptySave = () => ({ version: 2, revision: 0, checkpoint: null, game: newGame() });

export function validateSave(s) {
  if (!s || s.version !== 2 || !Number.isSafeInteger(s.revision) || s.revision < 0) throw new Error('Invalid save');
  if (s.checkpoint) validateCheckpoint(s.checkpoint);
  const g = s.game;
  if (!g || ![g.balance, g.rounds, g.wins].every(n => Number.isSafeInteger(n) && n >= 0) || g.wins > g.rounds ||
      !Array.isArray(g.history) || g.history.length > 20) throw new Error('Invalid points');
  if (g.pending) {
    const b = g.pending;
    validateCheckpoint(b.checkpoint);
    if (typeof b.id !== 'string' || !Number.isInteger(b.seed) || b.seed < 0 || b.seed > 0xffffffff ||
        !Number.isInteger(b.stake) || b.stake < 10 || b.stake > 100 || typeof b.escape !== 'boolean' ||
        ![1.2, 1.8, 2.4].includes(b.approach) || ![2.7, 6, 12].includes(b.roam) ||
        !(b.outcome === null || typeof b.outcome === 'boolean')) throw new Error('Invalid pending round');
  }
  return s;
}

export class ArenaStore {
  constructor(storage) { this.storage = storage; this.revision = 0; }
  load() {
    const raw = this.storage.getItem(SAVE_KEY);
    const s = raw ? validateSave(JSON.parse(raw)) : emptySave();
    this.revision = s.revision;
    return s;
  }
  async save(state) {
    const commit = () => {
      const raw = this.storage.getItem(SAVE_KEY);
      const revision = raw ? JSON.parse(raw).revision : 0;
      if (revision !== this.revision) throw new Error('Another tab changed this save. Reload before continuing.');
      const next = validateSave({ ...state, revision: revision + 1 });
      this.storage.setItem(SAVE_KEY, JSON.stringify(next));
      this.revision = next.revision;
      return next;
    };
    if (globalThis.navigator?.locks) return navigator.locks.request(SAVE_KEY, commit);
    return commit();
  }
}
