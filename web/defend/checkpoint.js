export const PROTOCOL = 'flywire-v783-6203-arena-8actions-v2';
const integer = (v, max = 1e9) => Number.isSafeInteger(v) && v >= 0 && v <= max;
const finite = v => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e9;
const vector = (v, n) => Array.isArray(v) && v.length === n && v.every(finite);

export function checkpoint(session) {
  const p = session.policy;
  const policy = Object.fromEntries(['W', 'b', 'gW', 'gb', 'mu', 'vr'].map(k => [k, Array.from(p[k])]));
  Object.assign(policy, { base: p.base ? Array.from(p.base) : null, seen: p.seen, scale: p.scale, pending: p.pending, episodes: p.episodes });
  return { protocol: PROTOCOL, D: p.D, K: p.K, policy, position: { ...session.position },
    stats: Object.fromEntries(['trials', 'streak', 'best', 'deaths', 'lifeSeconds', 'bestLife'].map(k => [k, session[k]])),
    history: [...session.history], rng: session.rig.rng.state() };
}

export function validateCheckpoint(s, D = 49, K = 8) {
  const fail = () => { throw new Error('Invalid or incompatible arena backup'); };
  if (!s || s.protocol !== PROTOCOL || s.D !== D || s.K !== K) fail();
  const p = s.policy;
  if (!p || !vector(p.W, K * D) || !vector(p.gW, K * D) || !vector(p.b, K) || !vector(p.gb, K) ||
      !vector(p.mu, D) || !vector(p.vr, D) || p.vr.some(v => v < 0) ||
      !(p.base === null || (Array.isArray(p.base) && p.base.length <= 11 && p.base.every(finite))) ||
      !integer(p.seen) || !integer(p.episodes) || !integer(p.pending, 7) || !finite(p.scale) || p.scale < 0) fail();
  const a = s.stats, pos = s.position;
  if (!a || !['trials', 'streak', 'best', 'deaths'].every(k => integer(a[k])) || a.deaths > a.trials ||
      a.streak > a.best || a.best > a.trials || !['lifeSeconds', 'bestLife'].every(k => finite(a[k]) && a[k] >= 0) ||
      a.lifeSeconds > a.bestLife || !pos || !['x', 'z', 'heading'].every(k => finite(pos[k])) ||
      Math.abs(pos.x) > 16 || Math.abs(pos.z) > 16 || !finite(pos.height ?? 0) || (pos.height ?? 0) < 0 || (pos.height ?? 0) > 10 ||
      !Array.isArray(s.history) || s.history.length > 100 || s.history.length > a.trials ||
      !s.history.every(v => v === 0 || v === 1) || !integer(s.rng, 0xffffffff)) fail();
  return s;
}

export function restoreCheckpoint(session, state) {
  const s = validateCheckpoint(state, session.policy.D, session.policy.K), p = session.policy;
  for (const k of ['W', 'b', 'gW', 'gb', 'mu', 'vr']) p[k].set(s.policy[k]);
  p.base = s.policy.base === null ? null : Float64Array.from(s.policy.base);
  for (const k of ['seen', 'scale', 'pending', 'episodes']) p[k] = s.policy[k];
  session.position = { ...s.position };
  for (const k of ['trials', 'streak', 'best', 'deaths', 'lifeSeconds', 'bestLife']) session[k] = s.stats[k];
  session.history = [...s.history];
  session.rig.rng.setState(s.rng);
}

export function clearStatistics(session) {
  for (const k of ['trials', 'streak', 'best', 'deaths', 'lifeSeconds', 'bestLife']) session[k] = 0;
  session.history = [];
}
