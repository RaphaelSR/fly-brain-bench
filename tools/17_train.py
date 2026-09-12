"""Does dopaminergic depression of KC->MBON synapses produce ODOUR-SPECIFIC learning?

Mirrors real Drosophila olfactory conditioning:
  1. test odour A and odour B          -> baseline MBON drive
  2. pair A with a punishment signal   -> depress the KC->MBON synapses of the
                                          Kenyon cells that were active during A
  3. test A and B again
Specific learning means A drops substantially more than the untrained control B.
"""
import numpy as np, pandas as pd, sys
sys.path.insert(0, 'tools')
from lif import build, run, N

GAIN = 0.12          # APL divisive gain -> ~5% Kenyon-cell sparseness
DEPRESS = 0.25       # residual synaptic weight after one pairing

j = pd.read_pickle('data/raw/_cache_meta.pkl')
cc = j['cell_class'].fillna('').to_numpy()
ct = j['cell_type'].fillna('').astype(str).to_numpy()
kc_mask = np.zeros(N, bool); kc_mask[cc == 'Kenyon_Cell'] = True
KC = np.flatnonzero(kc_mask); MB = np.flatnonzero(cc == 'MBON')
isMB = np.zeros(N, bool); isMB[MB] = True

indptr, ind, wts = build(5)
kc_src = np.zeros(len(ind), bool)
owner = np.full(len(ind), -1, np.int32)
for i in KC:
    a, b = indptr[i], indptr[i + 1]
    kc_src[a:b] = True; owner[a:b] = i
plastic = np.flatnonzero(kc_src & isMB[ind])
print(f"plastic synapses (KC -> MBON): {len(plastic):,}")

def probe(w_, odour, seed=21):
    r = run(indptr, ind, w_, np.flatnonzero(ct == odour), t_ms=600.0, seed=seed,
            kc_mask=kc_mask, apl_gain=GAIN)
    return r, float(r[MB].sum())

A, B = 'ORN_DM1', 'ORN_DA1'
rA0, dA0 = probe(wts, A); rB0, dB0 = probe(wts, B)
print(f"\nbefore   MBON drive   {A}={dA0:9.0f}   {B}={dB0:9.0f}")

activeA = rA0 > 0.1
mask = activeA[owner[plastic]]
w2 = wts.copy(); w2[plastic[mask]] *= DEPRESS
print(f"pairing {A} with punishment: depressed {mask.sum():,}/{len(plastic):,} synapses "
      f"({100*mask.mean():.1f}%) from {int(activeA[KC].sum())} active Kenyon cells")

rA1, dA1 = probe(w2, A); rB1, dB1 = probe(w2, B)
print(f"after    MBON drive   {A}={dA1:9.0f}   {B}={dB1:9.0f}")
dropA = (dA0 - dA1) / max(dA0, 1); dropB = (dB0 - dB1) / max(dB0, 1)
print(f"\n  trained odour {A}: {-100*dropA:+6.1f}%")
print(f"  control odour {B}: {-100*dropB:+6.1f}%")
print(f"  SPECIFICITY: {100*(dropA-dropB):+.1f} percentage points")
