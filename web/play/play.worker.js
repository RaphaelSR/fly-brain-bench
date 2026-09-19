import { fetchGz, decodeLabels } from '../js/data.js';
import { decodeCompleteBrain } from './complete-brain.js?v=complete1';
import { neighborhood } from '../defend/connectivity.js';
import { createRig } from '../defend/neural-rig.js?v=complete1';
import { PlaySession } from './core.js?v=complete1';
import { newProps } from './props.js';

let session, rigData;
self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    if (type === 'init') {
      if (data.brain && data.brain !== 'whole') throw new Error('The playable mode requires the complete source connectome');
      const brain = 'whole', path = '../data/';
      const [m, l, c, s, channels] = await Promise.all([
        fetchGz('./brain-data/meta.json.gz'), fetchGz(path + 'labels.bin.gz'),
        fetchGz('./brain-data/conn.bin.gz'), fetchGz('./brain-data/sign.bin.gz'),
        fetch(path + 'channels.json').then(r => { if (!r.ok) throw new Error('Missing channels'); return r.json(); }),
      ]);
      if (brain === 'whole') {
        const sub = await fetch('../defend/data/channels.json').then(r => r.json());
        channels.features = Object.fromEntries(Object.keys(sub.features).map(name => [name, channels.features[name]]));
      }
      const meta = JSON.parse(new TextDecoder().decode(m));
      rigData = { meta, labels: decodeLabels(l, meta.n_neurons), conn: await decodeCompleteBrain(meta, c, s), channels };
      session = new PlaySession(createRig({ ...rigData, seed: data.seed }), { capture: true, brain });
      if (data.saved) session.load(data.saved);
    } else if (!session) throw new Error('Not ready');
    if (type === 'inspect') {
      if (!Array.isArray(data.focus) || data.focus.length > 1000 || data.focus.some(i => !Number.isInteger(i) || i < 0 || i >= rigData.meta.n_neurons)) throw new Error('Invalid neuron selection');
      const graph = data.focus.length ? neighborhood(rigData.conn, data.focus) : { total: 0, edges: [] };
      self.postMessage({ id, graph }); return;
    }
    const before = session.policy.episodes + session.navigationPolicy.episodes, beforeThrows = session.stats.throws;
    if (type === 'configure') {
      if (session.phase !== 'aim') throw new Error('Wait for this throw to finish');
      session.learning = data.learning === true;
      session.navigation = [];
    }
    if (type === 'step') {
      if (!Number.isInteger(data.ticks) || data.ticks < 1 || data.ticks > 12) throw new Error('Invalid time step');
      for (let i = 0; i < data.ticks; i++) session.step();
    }
    if (type === 'throw') { session.learning = data.learning !== false; session.throw(data.parameters); }
    if (type === 'nudge' || type === 'tidy') {
      if (session.phase !== 'aim') throw new Error('Wait for this throw to finish');
      if (type === 'nudge') session.world.nudge(data.object, data.dx, data.dz);
      else session.world.props = newProps();
    }
    if (type === 'restore') {
      if (session.phase !== 'aim') throw new Error('Wait for this throw to finish');
      const next = new PlaySession(createRig({ ...rigData, seed: data.seed }), { capture: true, brain: session.brain });
      next.load(data.saved); session = next;
    }
    const save = type === 'init' || type === 'restore' || before !== session.policy.episodes + session.navigationPolicy.episodes || beforeThrows !== session.stats.throws ? session.save() : null;
    self.postMessage({ id, state: { ...session.state(), neural: { neurons: session.rig.N, pairs: session.rig.E,
      synapses: rigData.meta.synapse_count, threshold: rigData.meta.threshold, learning: session.learning } }, save });
  } catch (error) { self.postMessage({ id, error: error.message }); }
};
