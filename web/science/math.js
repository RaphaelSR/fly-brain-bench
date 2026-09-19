export function softmax(scores, temperature = 1) {
  if (!scores.length || scores.some(v => !Number.isFinite(v)) || !Number.isFinite(temperature) || temperature <= 0) {
    throw new RangeError('Finite scores and positive temperature required');
  }
  const peak = Math.max(...scores);
  const weights = scores.map(v => Math.exp((v - peak) / temperature));
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map(v => v / sum);
}

export function wilson(successes, trials, z = 1.959963984540054) {
  if (!Number.isSafeInteger(trials) || trials < 1 || !Number.isSafeInteger(successes) || successes < 0 || successes > trials || !Number.isFinite(z) || z <= 0) {
    throw new RangeError('Require 0 ≤ successes ≤ trials and trials > 0');
  }
  const rate = successes / trials, z2 = z * z, denominator = 1 + z2 / trials;
  const centre = (rate + z2 / (2 * trials)) / denominator;
  const margin = z * Math.sqrt(rate * (1 - rate) / trials + z2 / (4 * trials * trials)) / denominator;
  return { rate, low: Math.max(0, centre - margin), high: Math.min(1, centre + margin) };
}

export function expectedPoints(stake, probability) {
  if (!Number.isFinite(stake) || stake < 0 || !Number.isFinite(probability) || probability < 0 || probability > 1) throw new RangeError('Invalid example');
  return stake * (2 * probability - 1);
}

export function summarizeEvaluation(report) {
  const rows = report?.evaluation?.results;
  if (!Array.isArray(rows) || !rows.length || rows.some(r => !Number.isSafeInteger(r.trials) || r.trials < 1 ||
      !Number.isSafeInteger(r.escapes) || r.escapes < 0 || r.escapes > r.trials ||
      !Number.isSafeInteger(r.baselineEscapes) || r.baselineEscapes < 0 || r.baselineEscapes > r.trials ||
      !Number.isFinite(r.approach) || !Number.isFinite(r.roam))) throw new Error('Invalid evaluation report');
  const trials = rows.reduce((s, r) => s + r.trials, 0), escapes = rows.reduce((s, r) => s + r.escapes, 0);
  return { trials, escapes, rate: escapes / trials, rows };
}
