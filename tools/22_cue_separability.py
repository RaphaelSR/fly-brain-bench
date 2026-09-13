"""Can the descending readout tell the training cues apart?

The pet game teaches by operant conditioning: a cue appears, the fly acts, you
reward. That only works if different cues leave different traces in the neurons
the policy reads. Odours failed this test in tools/13 — modalities should not,
but 'should not' is not evidence.
"""
import numpy as np, pandas as pd, json, sys
sys.path.insert(0, 'tools')
from lif import build, run, N

j = pd.read_pickle('data/raw/_cache_meta.pkl')
ct = j['cell_type'].fillna('').astype(str).to_numpy()
cc = j['cell_class'].fillna('').to_numpy()

CUES = {
    'light':  np.flatnonzero(np.isin(ct, ['R7', 'R8'])),
    'sound':  np.flatnonzero(pd.Series(ct).str.startswith('JO-B').to_numpy()),
    'smell':  np.flatnonzero(np.isin(ct, ['ORN_DM1', 'ORN_DM2'])),
    'touch':  np.flatnonzero(ct == 'BM_InOm'),
    'sugar':  np.flatnonzero(ct == 'LB3'),
    'threat': np.flatnonzero(ct == 'LPLC2'),
}
feats = json.load(open('web/data/channels.json'))['features']
names = list(feats)
fidx = [np.array(feats[k], dtype=np.int64) for k in names]

indptr, ind, wts = build(5)
sat = lambda x, k: 1 - np.exp(-np.maximum(x, 0) / k)

def vector(rates):
    return np.array([sat(rates[ix].mean(), 40) for ix in fidx])

print(f"{'cue':>7} {'cells':>6} | descending features above 0.02 | strongest")
V, labels = [], []
REPS = 3
for name, idx in CUES.items():
    for r in range(REPS):
        rates = run(indptr, ind, wts, idx, t_ms=400.0, seed=100 + r)
        v = vector(rates)
        V.append(v); labels.append(name)
        if r == 0:
            top = np.argsort(-v)[:3]
            print(f"{name:>7} {len(idx):>6} | {int((v > 0.02).sum()):>30} | "
                  + ", ".join(f"{names[t]}={v[t]:.2f}" for t in top if v[t] > 0.01))
V = np.array(V)

print("\n--- pairwise cosine similarity between cue means ---")
uniq = list(CUES)
means = {c: V[[i for i, l in enumerate(labels) if l == c]].mean(0) for c in uniq}
print("        " + " ".join(f"{c[:6]:>7}" for c in uniq))
for a in uniq:
    row = []
    for b in uniq:
        na, nb = np.linalg.norm(means[a]), np.linalg.norm(means[b])
        row.append((means[a] @ means[b]) / (na * nb) if na and nb else 0.0)
    print(f"{a:>7} " + " ".join(f"{x:>7.2f}" for x in row))

# nearest-centroid accuracy with the repeats held out one at a time
ok = 0
for i, l in enumerate(labels):
    d = {c: np.linalg.norm(V[i] - V[[k for k, ll in enumerate(labels) if ll == c and k != i]].mean(0)) for c in uniq}
    if min(d, key=d.get) == l: ok += 1
print(f"\nleave-one-out nearest-centroid accuracy: {ok}/{len(labels)} ({100*ok/len(labels):.0f}%)")
