import { fetchGz, decodeConnectome, decodeLabels } from '../js/data.js';
import { createRig } from './neural-rig.js';
import { SurvivalSession } from './survival.js';
import { checkpoint, restoreCheckpoint, clearStatistics } from './checkpoint.js';

let session, rigData;
self.onmessage = async ({ data }) => {
  const { id, type, approach, training, roam } = data;
  try {
    if (!session || type === 'reset') {
      if (!rigData) {
        const [metaBytes, labelBytes, connBytes, signs, channels] = await Promise.all([
          fetchGz('data/meta.json.gz'), fetchGz('data/labels.bin.gz'), fetchGz('data/conn.bin.gz'),
          fetchGz('data/sign.bin.gz'), fetch('data/channels.json').then(r => { if (!r.ok) throw new Error('Channel load failed'); return r.json(); }),
        ]);
        const meta = JSON.parse(new TextDecoder().decode(metaBytes));
        rigData = { meta, labels: decodeLabels(labelBytes, meta.n_neurons),
          conn: decodeConnectome(connBytes, meta.n_neurons, meta.n_edges, signs), channels };
      }
      session = new SurvivalSession(createRig({ ...rigData, seed: data.seed ?? 20260919 }), { expanded: true });
      if (data.checkpoint && type !== 'reset') restoreCheckpoint(session, data.checkpoint);
    }
    if (type === 'import') restoreCheckpoint(session, data.checkpoint);
    if (type === 'stats') clearStatistics(session);
    if (type === 'pretrained') {
      const response = await fetch('data/pretrained-arena.json');
      if (!response.ok) throw new Error('Could not load pretrained policy');
      restoreCheckpoint(session, (await response.json()).checkpoint);
      clearStatistics(session); session.position = { x: 0, z: 0, height: 0, heading: 0 };
    }
    if (['init', 'reset', 'stats', 'import', 'pretrained'].includes(type)) {
      self.postMessage({ id, checkpoint: checkpoint(session) }); return;
    }
    if (type === 'game') {
      const round = new SurvivalSession(createRig({ ...rigData, seed: data.seed }), { expanded: true });
      restoreCheckpoint(round, data.checkpoint);
      round.rig.rng.setState(data.seed);
      self.postMessage({ id, episode: round.episode({ approach, roam, training: false }), checkpoint: checkpoint(session) });
      return;
    }
    if (type === 'train') {
      let episode;
      for (let i = 0; i < 50; i++) {
        episode = session.episode({ approach, roam, training: true, capture: i === 49 });
        if (i % 10 === 9) self.postMessage({ id, progress: i + 1 });
      }
      session.policy.flush();
      self.postMessage({ id, episode, checkpoint: checkpoint(session) }); return;
    }
    self.postMessage({ id, episode: session.episode({ approach, roam, training }), checkpoint: checkpoint(session) });
  } catch (error) { self.postMessage({ id, error: error.message }); }
};
