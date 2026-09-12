import numpy as np, pandas as pd, gzip
pre=np.load('data/raw/_cache_pre.npy'); post=np.load('data/raw/_cache_post.npy'); w=np.load('data/raw/_cache_w.npy')
j=pd.read_pickle('data/raw/_cache_meta.pkl'); N=138639
sc=j['super_class'].fillna('unknown').to_numpy()
optic = (sc=='optic')
print(f"optic neurons: {optic.sum():,} / {N:,}")
both_optic = optic[pre]&optic[post]
any_optic  = optic[pre]|optic[post]
print(f"edges optic<->optic : {both_optic.sum():>12,} ({100*both_optic.mean():5.1f}%)")
print(f"edges touching optic: {any_optic.sum():>12,} ({100*any_optic.mean():5.1f}%)")
print(f"edges core-only     : {(~any_optic).sum():>12,} ({100*(~any_optic).mean():5.1f}%)")

def varint(a):
    out=bytearray()
    for v in a.tolist():
        while True:
            b=v&0x7F; v>>=7
            if v: out.append(b|0x80)
            else: out.append(b); break
    return bytes(out)

def size_of(mask, label):
    p,q,ww=pre[mask],post[mask],w[mask]
    keep=np.zeros(N,dtype=bool); keep[p]=True; keep[q]=True
    remap=-np.ones(N,dtype=np.int64); nk=int(keep.sum()); remap[keep]=np.arange(nk)
    p2,q2=remap[p],remap[q]
    o=np.lexsort((q2,p2)); p2,q2,ww=p2[o],q2[o],ww[o]
    counts=np.bincount(p2,minlength=nk)
    starts=np.concatenate(([0],np.cumsum(counts)))[:-1]
    first=np.zeros(len(p2),dtype=bool); first[starts[counts>0]]=True
    prev=np.roll(q2,1); prev[0]=0
    delta=np.where(first,q2,q2-prev)
    raw=varint(counts)+varint(delta)+varint(np.clip(ww,1,127).astype(np.int64))+np.packbits(np.zeros(nk,np.uint8)).tobytes()
    gz=len(gzip.compress(raw,9))
    print(f"  {label:<34} neurons={nk:>8,} edges={mask.sum():>10,} gzip={gz/1e6:>6.2f} MB")

print("\n--- size by scope x threshold (gzip MB) ---")
for thr in [1,3,5,10]:
    m=w>=thr
    print(f"threshold >={thr}")
    size_of(m, "full brain")
    size_of(m&~any_optic, "core (no optic lobe)")
