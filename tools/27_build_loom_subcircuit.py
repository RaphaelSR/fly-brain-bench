"""Pack the looming -> descending subcircuit for the escape scenario.

The whole brain runs at 0.03-0.16x real time once it is stimulated, because
roughly a third of it stays active. Foraging does not need the whole brain: the
anatomical path from the odour receptors to the command neurons is three synapses
deep. This keeps exactly that path and drops the optic lobes, which we measured do
not propagate at all (tools/23_light_latency.py).

Also writes a degree-preserving shuffled control. Permuting the destination array
as a whole keeps every out-degree (row lengths untouched) and every in-degree (the
multiset of destinations is unchanged), so the control differs from the real
connectome only in *which* neuron connects to which.
"""
import numpy as np, pandas as pd, gzip, json, os, sys

HOPS, THR = 2, 8
OUT = 'web/defend/data'
SEEDS = ['LPLC2']

pre = np.load('data/raw/_cache_pre.npy'); post = np.load('data/raw/_cache_post.npy')
w = np.load('data/raw/_cache_w.npy');     exc = np.load('data/raw/_cache_exc.npy')
j = pd.read_pickle('data/raw/_cache_meta.pkl')
N = 138639
ct = j['cell_type'].fillna('').astype(str).to_numpy()
cc = j['cell_class'].fillna('').to_numpy()
sc = j['super_class'].fillna('').to_numpy()

m = w >= THR
P, Q, W, X = pre[m], post[m], w[m], exc[m]

# The pathway, not the neighbourhood: forward reachability from LPLC2 intersected
# with backward reachability from the descending neurons. Forward-only pulled in
# 80,747 neurons because LPLC2 sits in the optic lobe and three hops from there
# touch most of the visual system — the intersection keeps only what actually
# carries looming to a command neuron.
order = np.argsort(P, kind='stable')
Ps, Qs = P[order], Q[order]
rowp = np.zeros(N + 1, np.int64); np.add.at(rowp, Ps + 1, 1); rowp = np.cumsum(rowp)
rorder = np.argsort(Q, kind='stable')
Pr, Qr = P[rorder], Q[rorder]
rrow = np.zeros(N + 1, np.int64); np.add.at(rrow, Qr + 1, 1); rrow = np.cumsum(rrow)

def reach(front, ptr, dest, hops):
    seen = np.zeros(N, bool); seen[front] = True
    for _ in range(hops):
        nxt = [dest[ptr[i]:ptr[i + 1]] for i in front]
        if not nxt: break
        nxt = np.unique(np.concatenate(nxt))
        nxt = nxt[~seen[nxt]]
        if not len(nxt): break
        seen[nxt] = True; front = nxt
    return seen

seeds = np.flatnonzero(np.isin(ct, SEEDS))
DNall = np.flatnonzero(sc == 'descending')
fwd = reach(seeds, rowp, Qs, HOPS)
bwd = reach(DNall, rrow, Pr, HOPS)
seen = (fwd & bwd)
seen[seeds] = True
seen[DNall[bwd[DNall] | fwd[DNall]]] = True
print(f"alcance direto {int(fwd.sum()):,} | reverso {int(bwd.sum()):,} | intersecao {int(seen.sum()):,}")

keep = seen.copy()
# LPLC2 lives in the optic lobe, so unlike the olfactory build the optic lobe
# cannot simply be dropped — only the parts of it nothing on this path reaches.
keep = seen.copy()
sub = np.flatnonzero(keep)
remap = -np.ones(N, np.int64); remap[sub] = np.arange(len(sub))
edge = keep[P] & keep[Q]
p2, q2, w2, x2 = remap[P[edge]], remap[Q[edge]], W[edge], X[edge]
Ns, Es = len(sub), len(p2)
print(f"subcircuit: {Ns:,} neurons, {Es:,} edges "
      f"({100*Ns/N:.1f}% of neurons, {100*Es/m.sum():.1f}% of pruned edges)")
for s in ['sensory', 'central', 'descending', 'motor', 'ascending', 'visual_projection']:
    n = int((sc[sub] == s).sum())
    if n: print(f"  {s:<20} {n:>7,}")

def pack(p, q, ww, xx, tag):
    o = np.lexsort((q, p)); p, q, ww, xx = p[o], q[o], ww[o], xx[o]
    counts = np.bincount(p, minlength=Ns).astype(np.int64)
    indptr = np.concatenate(([0], np.cumsum(counts)))
    first = np.zeros(len(p), bool); first[indptr[:-1][counts > 0]] = True
    prev = np.roll(q.astype(np.int64), 1); prev[0] = 0
    delta = np.where(first, q.astype(np.int64), q.astype(np.int64) - prev)
    sign = np.zeros(Ns, np.int8); sign[p] = xx
    def varint(a):
        out = bytearray()
        for v in a.tolist():
            while True:
                b = v & 0x7F; v >>= 7
                if v: out.append(b | 0x80)
                else: out.append(b); break
        return bytes(out)
    body = varint(counts) + varint(delta) + varint(np.clip(ww, 1, 127).astype(np.int64))
    for name, data in [(f'conn{tag}.bin', body),
                       (f'sign{tag}.bin', np.packbits((sign > 0).astype(np.uint8)).tobytes())]:
        path = f'{OUT}/{name}.gz'
        blob = gzip.compress(data, 9)
        open(path, 'wb').write(blob)
        print(f"  {path.split('/')[-1]:<22} {len(blob)/1e6:>6.2f} MB")

print("\nreal connectome:")
pack(p2, q2, w2, x2, '')
# degree-preserving control: same row lengths, same in-degrees, different wiring
rng = np.random.default_rng(7)
print("shuffled control (same in- and out-degree, rewired):")
pack(p2, rng.permutation(q2), w2, x2, '.shuf')

# metadata, labels and positions for the subcircuit only
def dict_encode(series):
    s = series.fillna('unknown').astype(str)
    cats = sorted(s.unique()); idx = {c: i for i, c in enumerate(cats)}
    return cats, s.map(idx).to_numpy().astype('<u2')
jj = j.iloc[sub]
dicts, cols = {}, []
for key, col in [('super_class', 'super_class'), ('cell_class', 'cell_class'),
                 ('cell_type', 'cell_type'), ('top_nt', 'top_nt'), ('side', 'side')]:
    cats, enc = dict_encode(jj[col]); dicts[key] = cats; cols.append(enc)
px = jj['pos_x'].to_numpy(float) * 4 / 1000
py = jj['pos_y'].to_numpy(float) * 4 / 1000
pz = jj['pos_z'].to_numpy(float) * 40 / 1000
for a in (px, py, pz):
    a[np.isnan(a)] = np.nanmedian(a)
lo = np.array([px.min(), py.min(), pz.min()]); span = float(max(np.ptp(px), np.ptp(py), np.ptp(pz)))
qpos = np.clip(np.round(np.stack([(px-lo[0])/span, (py-lo[1])/span, (pz-lo[2])/span], 1) * 65535), 0, 65535).astype('<u2')

hdr = {'version': 'flywire-783-olfactory-subcircuit', 'threshold': THR, 'hops': HOPS,
       'n_neurons': int(Ns), 'n_edges': int(Es), 'bbox_lo': lo.tolist(), 'span': span,
       'seeds': SEEDS, 'dicts': dicts}
for name, blob in [('meta.json', json.dumps(hdr, separators=(',', ':')).encode()),
                   ('labels.bin', b''.join(c.tobytes() for c in cols)),
                   ('pos.u16.bin', qpos.tobytes())]:
    b = gzip.compress(blob, 9); open(f'{OUT}/{name}.gz', 'wb').write(b)
    print(f"  {name+'.gz':<22} {len(b)/1e6:>6.2f} MB")

# remap channels.json onto subcircuit indices
ch = json.load(open('web/data/channels.json'))
def rm(lst): return [int(remap[i]) for i in lst if remap[i] >= 0]
out = {'channels': {}, 'features': {}}
for k, v in ch['channels'].items():
    e = {kk: v[kk] for kk in ('types', 'desc') if kk in v}
    e['all'], e['left'], e['right'] = rm(v['all']), rm(v.get('left', [])), rm(v.get('right', []))
    e['n'] = len(e['all'])
    out['channels'][k] = e
    print(f"  channel {k:<10} {v['n']:>3} -> {e['n']:>3} kept")
for k, v in ch['features'].items():
    r = rm(v)
    if r: out['features'][k] = r
print(f"  features {len(ch['features'])} -> {len(out['features'])} kept")
json.dump(out, open(f'{OUT}/channels.json', 'w'), separators=(',', ':'))
total = sum(os.path.getsize(f'{OUT}/{f}') for f in os.listdir(OUT) if f.endswith('.gz') and '.shuf' not in f)
print(f"\nTRANSFER (real only): {total/1e6:.2f} MB")
