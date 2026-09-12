"""APL-style divisive feedback inhibition on Kenyon cells.

The connectome gives APL's anatomy but not its physiology: in the real fly APL
provides *divisive* gain control that holds KC population activity near a few
percent. A uniform 0.275 mV per synapse cannot express that. This adds the one
missing knob and asks whether odour-specific sparse coding comes back.
"""
import numpy as np, pandas as pd
exec(open('tools/09_validate.py').read().split("j=pd.read_pickle")[0])

def run_apl(indptr,ind,wts,stim_idx,kc_mask,target=0.05,tau_apl=50.0,gain=0.0,t_ms=600.0,seed=0):
    rng=np.random.default_rng(seed); steps=int(t_ms/DT)
    v=np.full(N,V0,np.float32); g=np.zeros(N,np.float32)
    rfc=np.zeros(N,np.int32); nspk=np.zeros(N,np.int32)
    ring=[np.empty(0,np.int64) for _ in range(DLY_STEPS)]
    is_stim=np.zeros(N,bool); is_stim[stim_idx]=True
    p_poi=RPOI*DT/1000.0; w_poi=WSYN*FPOI
    nKC=kc_mask.sum(); apl=0.0; decay=np.exp(-DT/tau_apl)
    for s in range(steps):
        srcs=ring[s%DLY_STEPS]
        if srcs.size:
            idx=np.concatenate([ind[indptr[i]:indptr[i+1]] for i in srcs])
            val=np.concatenate([wts[indptr[i]:indptr[i+1]] for i in srcs])
            g+=np.bincount(idx,weights=val,minlength=N).astype(np.float32)
        if stim_idx.size:
            k=rng.random(stim_idx.size)<p_poi
            if k.any(): v[stim_idx[k]]+=w_poi
        # APL: divide KC drive by recent KC population activity
        if gain>0:
            g[kc_mask]/= (1.0 + gain*apl)
        free=rfc<=0
        vn=V0+(v-V0)*EV+K*(EG-EV)*g; gn=g*EG
        v=np.where(free,vn,v); g=np.where(free,gn,g); rfc[~free]-=1
        fired=np.flatnonzero((v>VTH)&free)
        nkc_fired=0
        if fired.size:
            v[fired]=VRST; g[fired]=0.0
            r=fired[~is_stim[fired]]; rfc[r]=RFC_STEPS
            nspk[fired]+=1
            nkc_fired=kc_mask[fired].sum()
        apl = apl*decay + (nkc_fired/max(nKC,1))/ (DT/1000.0) * (1-decay)
        ring[s%DLY_STEPS]=fired.astype(np.int64)
    return nspk/(t_ms/1000.0)

j=pd.read_pickle('data/raw/_cache_meta.pkl')
cc=j['cell_class'].fillna('').to_numpy(); ct=j['cell_type'].fillna('').astype(str).to_numpy()
kc_mask=np.zeros(N,bool); kc_mask[cc=='Kenyon_Cell']=True
KC=np.flatnonzero(kc_mask); MB=np.flatnonzero(cc=='MBON')
indptr,ind,wts=build(5)
odours=['ORN_DM1','ORN_DA1','ORN_VA1v']
print(f"{'APL gain':>9} | " + " | ".join(f"{o.replace('ORN_',''):>7}" for o in odours) + " | overlap | MBON Hz")
for gain in [0.0, 0.02, 0.05, 0.12, 0.3, 0.8, 2.0]:
    pats=[]; mbr=[]
    for o in odours:
        r=run_apl(indptr,ind,wts,np.flatnonzero(ct==o),kc_mask,gain=gain,seed=5)
        pats.append(r[KC]>0.1); mbr.append(r[MB][r[MB]>0.1].mean() if (r[MB]>0.1).any() else 0)
    def jac(a,b):
        u=(a|b).sum(); return (a&b).sum()/u if u else 0
    ov=np.mean([jac(pats[0],pats[1]),jac(pats[0],pats[2]),jac(pats[1],pats[2])])
    print(f"{gain:>9.2f} | " + " | ".join(f"{100*p.mean():>6.1f}%" for p in pats) + f" | {100*ov:>6.1f}% | {np.mean(mbr):>7.0f}")
