"""Do looming detectors from different parts of the visual field read differently?

A defence scenario needs direction: she has to know where the threat is coming
from, not just that one exists. LPLC2 is retinotopic — 210 cells laid out across
the lobula — so subsets from different positions should carry different
directions. Odour failed exactly this test (cosine 0.9995 between opposite sides),
so it gets measured before anything is built on it.
"""
import numpy as np, pandas as pd, json, sys
sys.path.insert(0, 'tools')
from lif import build, run, N

j = pd.read_pickle('data/raw/_cache_meta.pkl')
ct = j['cell_type'].fillna('').astype(str).to_numpy()
sc = j['super_class'].fillna('').to_numpy()
side = j['side'].fillna('').to_numpy()
LP = np.flatnonzero(ct == 'LPLC2')
px = j['pos_x'].to_numpy()[LP] * 4 / 1000
pz = j['pos_z'].to_numpy()[LP] * 40 / 1000

feats = json.load(open('web/data/channels.json'))['features']
names = list(feats)
fidx = [np.array(feats[k], np.int64) for k in names]
DN = np.flatnonzero(sc == 'descending')
GF = np.flatnonzero(ct == 'DNp01')          # the giant fibre
sat = lambda x, k: 1 - np.exp(-max(x, 0) / k)

indptr, ind, wts = build(5)

def probe(cells, t_ms=350.0, seed=5):
    r = run(indptr, ind, wts, cells, t_ms=t_ms, seed=seed)
    v = np.array([sat(r[ix].mean(), 40) for ix in fidx])
    return v, float(r[GF].mean()), int((r[DN] > 0.1).sum())

def cos(a, b):
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    return float(a @ b / (na * nb)) if na and nb else 0.0

# four quadrants of the visual field, by anatomical position within the lobula
groups = {
    'esq-frente': LP[(side[LP] == 'left')  & (pz > np.median(pz))],
    'esq-tras':   LP[(side[LP] == 'left')  & (pz <= np.median(pz))],
    'dir-frente': LP[(side[LP] == 'right') & (pz > np.median(pz))],
    'dir-tras':   LP[(side[LP] == 'right') & (pz <= np.median(pz))],
}
print(f"{'grupo':<12} {'celulas':>8} {'DNp01 Hz':>10} {'DNs ativos':>11}")
V = {}
for k, cells in groups.items():
    v, gf, dn = probe(cells)
    V[k] = v
    print(f"{k:<12} {len(cells):>8} {gf:>10.1f} {dn:>11}")

print("\n--- semelhanca entre os padroes descendentes (cosseno) ---")
ks = list(groups)
print("            " + " ".join(f"{k[:10]:>11}" for k in ks))
for a in ks:
    print(f"{a:<12}" + " ".join(f"{cos(V[a], V[b]):>11.3f}" for b in ks))

print("\n--- referencia: todos os LPLC2 juntos, e o olfato para comparar ---")
vAll, gfAll, dnAll = probe(LP)
print(f"todos LPLC2   DNp01={gfAll:.1f} Hz   DNs ativos={dnAll}")
orn = np.flatnonzero(np.isin(ct, ['ORN_DM1', 'ORN_DM2']))
vOrn, _, _ = probe(orn)
print(f"cos(LPLC2 total, olfato) = {cos(vAll, vOrn):.3f}   <- modalidades diferentes devem diferir")
