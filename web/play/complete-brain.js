import { decodeConnectome } from '../js/data.js';

export const COMPLETE_BRAIN = Object.freeze({ neurons: 138639, pairs: 15091983, synapses: 54492922,
  sha256: '2ba8cf910f9ce98a290e84640565158fce924931de74056944691ea0822c437a',
  signs: '9e80b8675fa38e8a96fdd86a666a9edb7a9c46bba16eb55df237ee92648c0c5a' });
const sha256 = async bytes => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), b => b.toString(16).padStart(2, '0')).join('');

export const LIGHT_BRAIN = Object.freeze({ neurons: 138639, pairs: 2700513, threshold: 5, weightCap: 127,
  sha256: '3c2e2d74f34b72a77e8eb032bd60fd66157efa8c74a92490fa37d29f25c701ce' });

export async function decodeLightBrain(meta, bytes, signs) {
  const expected = LIGHT_BRAIN;
  if (meta.version !== 'flywire-783' || meta.threshold !== expected.threshold || meta.n_neurons !== expected.neurons ||
      meta.n_edges !== expected.pairs || await sha256(bytes) !== expected.sha256 || await sha256(signs) !== COMPLETE_BRAIN.signs) {
    throw new Error('Light connectome validation failed; no other graph will be substituted');
  }
  return decodeConnectome(bytes, meta.n_neurons, meta.n_edges, signs);
}

export async function decodeCompleteBrain(meta, bytes, signs) {
  const expected = COMPLETE_BRAIN;
  if (meta.version !== 'flywire-783' || meta.threshold !== 1 || meta.weight_cap !== null ||
      meta.n_neurons !== expected.neurons || meta.n_edges !== expected.pairs || meta.synapse_count !== expected.synapses ||
      meta.conn_sha256 !== expected.sha256 || await sha256(bytes) !== expected.sha256 || meta.sign_sha256 !== expected.signs || await sha256(signs) !== expected.signs) {
    throw new Error('Complete connectome validation failed; no smaller graph will be substituted');
  }
  return decodeConnectome(bytes, meta.n_neurons, meta.n_edges, signs);
}
