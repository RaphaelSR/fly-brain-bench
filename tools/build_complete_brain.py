"""Preserve every source pair and synapse count; reuse the v783 cell index space."""
import gzip
import hashlib
import json
from pathlib import Path
import numpy as np
import pyarrow.parquet as pq

root = Path(__file__).resolve().parent.parent
raw = root / 'data/raw'
out = root / 'web/play/brain-data'
out.mkdir(exist_ok=True)
pre, post, weights, excitatory = [np.load(raw / ('_cache_' + key + '.npy')) for key in ['pre', 'post', 'w', 'exc']]
source = pq.read_table(raw / 'connectivity_783.parquet', columns=['Presynaptic_Index', 'Postsynaptic_Index', 'Connectivity', 'Excitatory'])
for array, column in zip([pre, post, weights, excitatory], source.columns):
    assert np.array_equal(array, column.to_numpy()), 'Cached data must match the source exactly'
del source
meta = json.loads(gzip.decompress((root / 'web/data/meta.json.gz').read_bytes()))
n = meta['n_neurons']
assert len(pre) == len(post) == len(weights) == len(excitatory)
assert pre.min() >= 0 and post.min() >= 0 and max(pre.max(), post.max()) < n
assert weights.min() >= 1 and weights.max() < 2**31
order = np.lexsort((post, pre))
pre, post, weights, excitatory = [a[order] for a in [pre, post, weights, excitatory]]
assert not np.any((pre[1:] == pre[:-1]) & (post[1:] == post[:-1]))
sign = np.zeros(n, dtype=np.int8)
sign[pre] = (excitatory > 0).astype(np.int8)
assert np.all(sign[pre] == (excitatory > 0))
counts = np.bincount(pre, minlength=n)
first = np.r_[True, pre[1:] != pre[:-1]]
delta = np.where(first, post, post - np.roll(post, 1))

def varints(values):
    encoded = bytearray()
    for value in values.tolist():
        while value >= 128:
            encoded.append((value & 127) | 128)
            value >>= 7
        encoded.append(value)
    return encoded

packed = varints(counts) + varints(delta) + varints(weights)
signs = np.packbits(sign).tobytes()
meta.update(threshold=1, n_edges=len(pre), synapse_count=int(weights.sum()), weight_cap=None,
            source='https://github.com/philshiu/Drosophila_brain_model/blob/main/Connectivity_783.parquet',
            source_sha256=hashlib.sha256((raw / 'connectivity_783.parquet').read_bytes()).hexdigest(),
            conn_sha256=hashlib.sha256(packed).hexdigest(), sign_sha256=hashlib.sha256(signs).hexdigest())
for name, data in [('conn.bin', packed), ('sign.bin', signs), ('meta.json', json.dumps(meta, separators=(',', ':')).encode())]:
    payload = gzip.compress(data, compresslevel=9, mtime=0)
    (out / (name + '.gz')).write_bytes(payload)
    print(name, len(payload), 'bytes')
print({key: meta[key] for key in ['n_neurons', 'n_edges', 'synapse_count', 'threshold', 'weight_cap', 'conn_sha256']})
