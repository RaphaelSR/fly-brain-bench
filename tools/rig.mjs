/* File-system loader for the same neural rig used by the browser worker. */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { decodeConnectome, decodeLabels } from '../web/js/data.js';
import { createRig } from '../web/defend/neural-rig.js';
export { mulberry, DRIVE_HZ } from '../web/defend/neural-rig.js';

export const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'web', 'defend', 'data');
export function loadRig({ shuffled = false, seed = 1, dt = 0.5, brain = 'escape' } = {}) {
  const path = brain === 'whole' || brain === 'complete' ? join(DATA, '..', '..', 'data') : DATA;
  if (brain !== 'escape' && shuffled) throw new Error('No shuffled whole-brain package');
  const graphPath = brain === 'complete' ? join(DATA, '..', '..', 'play', 'brain-data') : path;
  const gz = f => gunzipSync(readFileSync(join(['meta.json.gz', 'conn.bin.gz', 'sign.bin.gz'].includes(f) ? graphPath : path, f)));
  const meta = JSON.parse(gz('meta.json.gz').toString());
  const N = meta.n_neurons, E = meta.n_edges;
  const labels = decodeLabels(gz('labels.bin.gz'), N);
  const sfx = shuffled ? '.shuf' : '';
  const conn = decodeConnectome(gz(`conn${sfx}.bin.gz`), N, E, gz(`sign${sfx}.bin.gz`));
  const channels = JSON.parse(readFileSync(join(path, 'channels.json')));
  if (brain !== 'escape') {
    const names = Object.keys(JSON.parse(readFileSync(join(DATA, 'channels.json'))).features);
    channels.features = Object.fromEntries(names.map(name => [name, channels.features[name]]));
  }
  return createRig({ meta, labels, conn, channels, seed, dt });
}
