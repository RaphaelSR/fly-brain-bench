"""Does the photoreceptor drive ever reach the descending neurons, given time?"""
import numpy as np, pandas as pd, json, sys
sys.path.insert(0,'tools'); from lif import build, run, N
j=pd.read_pickle('data/raw/_cache_meta.pkl')
ct=j['cell_type'].fillna('').astype(str).to_numpy()
sc=j['super_class'].fillna('').to_numpy()
feats=json.load(open('web/data/channels.json'))['features']
names=list(feats); fidx=[np.array(feats[k],dtype=np.int64) for k in names]
DN=np.flatnonzero(sc=='descending')
indptr,ind,wts=build(5)
sat=lambda x,k: 1-np.exp(-max(x,0)/k)
for t_ms in [400, 900, 1800, 3000]:
    r=run(indptr,ind,wts,np.flatnonzero(np.isin(ct,['R7','R8'])),t_ms=float(t_ms),seed=7)
    v=np.array([sat(r[ix].mean(),40) for ix in fidx])
    dn_any=int((r[DN]>0.1).sum())
    top=np.argsort(-v)[:3]
    print(f"{t_ms:>5} ms | descending cells firing {dn_any:>4}/{len(DN)} | features>0.02 {int((v>0.02).sum()):>2} | "
          + ", ".join(f"{names[t]}={v[t]:.2f}" for t in top if v[t]>0.005))
# where does it stop? count active cells per super_class at 1800 ms
r=run(indptr,ind,wts,np.flatnonzero(np.isin(ct,['R7','R8'])),t_ms=1800.0,seed=7)
print("\nactive cells by region at 1800 ms:")
for s in ['optic','visual_projection','central','descending','motor','visual_centrifugal']:
    m=np.flatnonzero(sc==s); print(f"  {s:<20} {int((r[m]>0.1).sum()):>6} / {len(m)}")
