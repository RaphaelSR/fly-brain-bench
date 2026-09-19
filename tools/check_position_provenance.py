"""Audit displayed positions against the source annotation table (no asset writes)."""
import gzip
import json
import numpy as np
import pandas as pd

j = pd.read_pickle('data/raw/_cache_meta.pkl')
pre = np.load('data/raw/_cache_pre.npy')
post = np.load('data/raw/_cache_post.npy')
w = np.load('data/raw/_cache_w.npy')
mask = w >= 8
p, q = pre[mask], post[mask]
n = len(j)

def reach(seeds, source, target):
    seen = np.zeros(n, bool)
    seen[seeds] = True
    front = seen.copy()
    for _ in range(2):
        nxt = np.zeros(n, bool)
        nxt[target[front[source]]] = True
        front = nxt & ~seen
        seen |= nxt
    return seen

seeds = np.flatnonzero(j.cell_type.fillna('').to_numpy() == 'LPLC2')
dn = np.flatnonzero(j.super_class.fillna('').to_numpy() == 'descending')
fwd, bwd = reach(seeds, p, q), reach(dn, q, p)
keep = fwd & bwd
keep[seeds] = True
keep[dn[bwd[dn] | fwd[dn]]] = True
sub = np.flatnonzero(keep)

for folder, ids in [('web/data', np.arange(n)), ('web/defend/data', sub)]:
    meta = json.loads(gzip.decompress(open(f'{folder}/meta.json.gz', 'rb').read()))
    assert len(ids) == meta['n_neurons']
    source = j.iloc[ids]
    labels = np.frombuffer(gzip.decompress(open(f'{folder}/labels.bin.gz', 'rb').read()), '<u2').reshape(5, -1)
    for k, name in enumerate(['super_class', 'cell_class', 'cell_type', 'top_nt', 'side']):
        expected = source[name].fillna('unknown').astype(str).to_numpy()
        assert np.array_equal(np.array(meta['dicts'][name])[labels[k]], expected)
    xyz = source[['pos_x', 'pos_y', 'pos_z']].to_numpy(float) * [0.004, 0.004, 0.04]
    valid = np.isfinite(xyz).all(axis=1)
    packed = np.frombuffer(gzip.decompress(open(f'{folder}/pos.u16.bin.gz', 'rb').read()), '<u2').reshape(-1, 3)
    decoded = packed / 65535 * meta['span'] + meta['bbox_lo']
    assert np.max(np.abs(decoded[valid] - xyz[valid])) <= meta['span'] / 65535
    if folder == 'web/data':
        provenance = json.load(open(f'{folder}/position-provenance.json'))
        assert provenance['n_neurons'] == len(ids)
        assert provenance['missing'] == np.flatnonzero(~valid).tolist()
    print(folder, json.dumps({'source': 'FlyWire v783 annotation positions', 'n_neurons': len(ids),
                             'missing': np.flatnonzero(~valid).tolist()}))
