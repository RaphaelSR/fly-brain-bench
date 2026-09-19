import { fetchGz, decodeLabels, decodeConnectome } from '../js/data.js';
import { createRig } from '../defend/neural-rig.js';
import { PlaySession } from './core.js?v=flight3';
import { newProps } from './props.js';

let session, rigData;
self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    if (type === 'init') {
      const brain = data.brain === 'whole' ? 'whole' : 'escape';
      const path = brain === 'whole' ? '../data/' : '../defend/data/';
      const [m, l, c, s, channels] = await Promise.all([
        fetchGz(path + 'meta.json.gz'), fetchGz(path + 'labels.bin.gz'),
        fetchGz(path + 'conn.bin.gz'), fetchGz(path + 'sign.bin.gz'),
        fetch(path + 'channels.json').then(r => { if (!r.ok) throw new Error('Missing channels'); return r.json(); }),
      ]);
      if (brain === 'whole') {
        const sub = await fetch('../defend/data/channels.json').then(r => r.json());
        channels.features = Object.fromEntries(Object.keys(sub.features).map(name => [name, channels.features[name]]));
      }
      const meta = JSON.parse(new TextDecoder().decode(m));
      rigData = { meta, labels: decodeLabels(l, meta.n_neurons), conn: decodeConnectome(c, meta.n_neurons, meta.n_edges, s), channels };
      session = new PlaySession(createRig({ ...rigData, seed: data.seed }), { capture: true, brain });
      if (data.saved) session.load(data.saved);
    } else if (!session) throw new Error('Not ready');
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
    self.postMessage({ id, state: session.state(), save });
  } catch (error) { self.postMessage({ id, error: error.message }); }
};
