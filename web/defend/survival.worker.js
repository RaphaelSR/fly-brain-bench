import { fetchGz, decodeConnectome, decodeLabels } from '../js/data.js';
import { createRig } from './neural-rig.js';
import { SurvivalSession } from './survival.js';

let session;
self.onmessage = async ({ data }) => {
  const { id, type, approach, training } = data;
  try {
    if (!session || type === 'reset') {
      const [metaBytes, labelBytes, connBytes, signs, channels] = await Promise.all([
        fetchGz('data/meta.json.gz'), fetchGz('data/labels.bin.gz'), fetchGz('data/conn.bin.gz'),
        fetchGz('data/sign.bin.gz'), fetch('data/channels.json').then(r => { if (!r.ok) throw new Error('Channel load failed'); return r.json(); }),
      ]);
      const meta = JSON.parse(new TextDecoder().decode(metaBytes));
      const rig = createRig({ meta, labels: decodeLabels(labelBytes, meta.n_neurons),
        conn: decodeConnectome(connBytes, meta.n_neurons, meta.n_edges, signs), channels, seed: 20260919 });
      session = new SurvivalSession(rig);
    }
    if (type === 'train') {
      for (let i = 0; i < 50; i++) {
        session.episode({ approach, training: true, capture: false });
        if (i % 10 === 9) self.postMessage({ id, progress: i + 1 });
      }
      session.policy.flush();
    }
    self.postMessage({ id, episode: session.episode({ approach, training }) });
  } catch (error) { self.postMessage({ id, error: error.message }); }
};
