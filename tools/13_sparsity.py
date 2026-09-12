"""Find a drive rate where Kenyon-cell coding is sparse AND odour-specific."""
import numpy as np, pandas as pd, time
src=open('tools/09_validate.py').read().split("j=pd.read_pickle")[0]
exec(src)

def run_rate(indptr,ind,wts,stim_idx,rate,t_ms=600.0,seed=0):
    rng=np.random.default_rng(seed); steps=int(t_ms/DT)
    v=np.full(N,V0,np.float32); g=np.zeros(N,np.float32)
    rfc=np.zeros(N,np.int32); nspk=np.zeros(N,np.int32)
    ring=[np.empty(0,np.int64) for _ in range(DLY_STEPS)]
    is_stim=np.zeros(N,bool); is_stim[stim_idx]=True
    p_poi=rate*DT/1000.0; w_poi=WSYN*FPOI
    for s in range(steps):
        srcs=ring[s%DLY_STEPS]
        if srcs.size:
            idx=np.concatenate([ind[indptr[i]:indptr[i+1]] for i in srcs])
            val=np.concatenate([wts[indptr[i]:indptr[i+1]] for i in srcs])
            g+=np.bincount(idx,weights=val,minlength=N).astype(np.float32)
        if stim_idx.size:
            k=rng.random(stim_idx.size)<p_poi
            if k.any(): v[stim_idx[k]]+=w_poi
        free=rfc<=0
        vn=V0+(v-V0)*EV+K*(EG-EV)*g; gn=g*EG
        v=np.where(free,vn,v); g=np.where(free,gn,g); rfc[~free]-=1
        fired=np.flatnonzero((v>VTH)&free)
        if fired.size:
            v[fired]=VRST; g[fired]=0.0
            r=fired[~is_stim[fired]]; rfc[r]=RFC_STEPS
            nspk[fired]+=1
        ring[s%DLY_STEPS]=fired.astype(np.int64)
    return nspk/(t_ms/1000.0)

j=pd.read_pickle('data/raw/_cache_meta.pkl')
cc=j['cell_class'].fillna('').to_numpy(); ct=j['cell_type'].fillna('').astype(str).to_numpy()
KC=np.flatnonzero(cc=='Kenyon_Cell'); MB=np.flatnonzero(cc=='MBON')
indptr,ind,wts=build(5)
odours=['ORN_DM1','ORN_DA1','ORN_VA1v']
print(f"{'rate':>6} | " + " | ".join(f"{o:>10}" for o in odours) + " | KC overlap (Jaccard) | mean MBON Hz")
for rate in [200,100,50,25,12,6,3]:
    pats=[]; mb=[]
    for o in odours:
        stim=np.flatnonzero(ct==o)
        r=run_rate(indptr,ind,wts,stim,rate,seed=7)
        pats.append(r[KC]>0.1); mb.append(r[MB][r[MB]>0.1].mean() if (r[MB]>0.1).any() else 0)
    fr=[100*p.mean() for p in pats]
    def jac(a,b): 
        u=(a|b).sum(); return (a&b).sum()/u if u else 0
    ov=np.mean([jac(pats[0],pats[1]),jac(pats[0],pats[2]),jac(pats[1],pats[2])])
    print(f"{rate:>5}H | " + " | ".join(f"{f:>9.1f}%" for f in fr) + f" | {100*ov:>18.1f}% | {np.mean(mb):>11.0f}")
