import { fetchGz, decodeLabels, decodeConnectome } from '../js/data.js';
import { createRig } from '../defend/neural-rig.js';
import { PlaySession } from './core.js';

let session, rigData;
self.onmessage = async ({ data }) => {
  const { id, type } = data;
  try {
    if (type === 'init') {
      const [m, l, c, s, channels] = await Promise.all([
        fetchGz('../defend/data/meta.json.gz'), fetchGz('../defend/data/labels.bin.gz'),
        fetchGz('../defend/data/conn.bin.gz'), fetchGz('../defend/data/sign.bin.gz'),
        fetch('../defend/data/channels.json').then(r => { if (!r.ok) throw new Error('Missing channels'); return r.json(); }),
      ]);
      const meta = JSON.parse(new TextDecoder().decode(m));
      rigData = { meta, labels: decodeLabels(l, meta.n_neurons), conn: decodeConnectome(c, meta.n_neurons, meta.n_edges, s), channels };
      session = new PlaySession(createRig({ ...rigData, seed: data.seed }), { capture: true });
      if (data.saved) session.load(data.saved);
    } else if (!session) throw new Error('Not ready');
    const before = session.stats.throws;
    if (type === 'step') {
      if (!Number.isInteger(data.ticks) || data.ticks < 1 || data.ticks > 12) throw new Error('Invalid time step');
      for (let i = 0; i < data.ticks; i++) session.step();
    }
    if (type === 'throw') session.throw(data.parameters, { learning: data.learning === true });
    if (type === 'restore') {
      if (session.phase !== 'aim') throw new Error('Wait for this throw to finish');
      const next = new PlaySession(createRig({ ...rigData, seed: data.seed }), { capture: true });
      next.load(data.saved); session = next;
    }
    const save = type === 'init' || type === 'restore' || before !== session.stats.throws ? session.save() : null;
    self.postMessage({ id, state: session.state(), save });
  } catch (error) { self.postMessage({ id, error: error.message }); }
};
