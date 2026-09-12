import numpy as np, pandas as pd
pre=np.load('data/raw/_cache_pre.npy'); post=np.load('data/raw/_cache_post.npy'); w=np.load('data/raw/_cache_w.npy')
j=pd.read_pickle('data/raw/_cache_meta.pkl'); N=138639
ct=j['cell_type'].fillna('').astype(str).to_numpy(); cc=j['cell_class'].fillna('').to_numpy()
KC=np.flatnonzero(cc=='Kenyon_Cell'); isKC=np.zeros(N,bool); isKC[KC]=True

apl=np.flatnonzero(pd.Series(ct).str.startswith('APL').to_numpy())
print("APL neurons:", [(ct[i], j['top_nt'].to_numpy()[i]) for i in apl])
for i in apl:
    out=pre==i
    tokc=out&isKC[post]
    kept=tokc&(w>=5)
    print(f"  {ct[i]}: {out.sum():,} outgoing, {tokc.sum():,} onto KCs; "
          f"synapse counts onto KCs -> median {np.median(w[tokc]):.0f}, "
          f"surviving >=5 threshold: {kept.sum():,} ({100*kept.sum()/max(tokc.sum(),1):.1f}%)")

# how much inhibition onto KCs survives overall?
inh = np.flatnonzero(j['top_nt'].isin(['gaba','glutamate']).to_numpy())
isInh=np.zeros(N,bool); isInh[inh]=True
for lab,m in [("all", np.ones(len(w),bool)), (">=5", w>=5)]:
    onkc=m&isKC[post]
    inhkc=onkc&isInh[pre]
    print(f"[{lab}] edges onto KCs {onkc.sum():>8,} | inhibitory {inhkc.sum():>7,} ({100*inhkc.sum()/max(onkc.sum(),1):.1f}%) "
          f"| inhibitory synapse mass {w[inhkc].sum():>9,} / {w[onkc].sum():>9,}")
