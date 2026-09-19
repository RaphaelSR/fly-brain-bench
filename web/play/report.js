export function reportValues(artifact, brain = 'escape') {
  const sum = mode => (brain === 'whole' ? artifact.evaluation.whole : artifact.evaluation.rows).filter(r => r.mode === mode).reduce((a, r) => ({
    throws: a.throws + r.throws, threats: a.threats + r.threats, dodges: a.dodges + r.dodges, hits: a.hits + r.hits,
  }), { throws: 0, threats: 0, dodges: 0, hits: 0 });
  const current = sum('policy'), previous = sum('transfer');
  return { episodes: artifact.training.episodes, total: current.throws, threats: current.threats,
    hits: current.hits, dodges: current.dodges, previousHits: previous.hits, previous: previous.dodges, random: sum('random').dodges };
}
export const formatReport = (template, artifact, locale, brain = 'escape') => template.replace(/\{(\w+)\}/g,
  (_, key) => reportValues(artifact, brain)[key].toLocaleString(locale));
