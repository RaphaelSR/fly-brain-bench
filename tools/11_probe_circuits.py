import numpy as np, pandas as pd
pre=np.load('data/raw/_cache_pre.npy'); post=np.load('data/raw/_cache_post.npy')
w=np.load('data/raw/_cache_w.npy')
j=pd.read_pickle('data/raw/_cache_meta.pkl'); N=138639
cc=j['cell_class'].fillna('').to_numpy(); ct=j['cell_type'].fillna('').astype(str).to_numpy()
sc=j['super_class'].fillna('').to_numpy()

KC=np.flatnonzero(cc=='Kenyon_Cell'); MB=np.flatnonzero(cc=='MBON'); DAN=np.flatnonzero(cc=='DAN')
print(f"Kenyon cells {len(KC):,} | MBONs {len(MB)} | DANs {len(DAN)}")

isKC=np.zeros(N,bool); isKC[KC]=True
isMB=np.zeros(N,bool); isMB[MB]=True
isDAN=np.zeros(N,bool); isDAN[DAN]=True
m5=w>=5
for label,mask in [("all edges", np.ones(len(w),bool)), ("edges >=5 syn", m5)]:
    kc2mb=mask&isKC[pre]&isMB[post]
    dan2mb=mask&isDAN[pre]&isMB[post]
    dan2kc=mask&isDAN[pre]&isKC[post]
    print(f"\n[{label}]")
    print(f"  KC -> MBON : {kc2mb.sum():>7,} edges, {len(np.unique(post[kc2mb])):>3} MBONs receive, {len(np.unique(pre[kc2mb])):>5} KCs send")
    print(f"  DAN -> MBON: {dan2mb.sum():>7,} edges, {len(np.unique(post[dan2mb])):>3} MBONs receive")
    print(f"  DAN -> KC  : {dan2kc.sum():>7,} edges")

print("\n--- MBON types receiving KC input (>=5 syn) ---")
kc2mb=m5&isKC[pre]&isMB[post]
tgt,cnt=np.unique(post[kc2mb],return_counts=True)
o=np.argsort(-cnt)
for i in o[:14]:
    print(f"  {ct[tgt[i]]:<12} {cnt[i]:>5} KC inputs   nt={j['top_nt'].to_numpy()[tgt[i]]}")

print("\n--- DAN types (>=5 syn) reaching MBONs ---")
dan2mb=m5&isDAN[pre]&isMB[post]
src,cnt=np.unique(pre[dan2mb],return_counts=True)
d=pd.Series(ct[src]).value_counts()
print(d.head(12).to_string())

print("\n=== descending neurons: named output channels ===")
DN=np.flatnonzero(sc=='descending')
print(f"total descending: {len(DN)}")
for name in ['DNp01','DNa02','DNp09','DNp10','DNp07','DNg12','DNp18','DNp11','DNa01','DNb01','DNp63','DNpe008']:
    k=np.flatnonzero(ct==name)
    if len(k): print(f"  {name:<9} {len(k):>3} cells")
print("\n--- MDN / moonwalker (backward walking) ---")
print([t for t in np.unique(ct) if 'MDN' in t][:10])
print("\n--- motor neurons in brain ---")
mn=np.flatnonzero((sc=='motor'))
print(pd.Series(ct[mn]).value_counts().head(12).to_string())
