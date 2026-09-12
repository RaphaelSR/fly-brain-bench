"""Exact-integration LIF (matches Shiu et al. Brian2 'linear' method) to test edge pruning."""
import numpy as np, pandas as pd, time, sys

N=138639
V0=-52.0; VRST=-52.0; VTH=-45.0; TMBR=20.0; TAU=5.0; TRFC=2.2; TDLY=1.8
WSYN=0.275; RPOI=150.0; FPOI=250.0
DT=0.1
EV=np.exp(-DT/TMBR); EG=np.exp(-DT/TAU); K=TAU/(TAU-TMBR)   # = -1/3
RFC_STEPS=int(round(TRFC/DT)); DLY_STEPS=int(round(TDLY/DT))

pre=np.load('data/raw/_cache_pre.npy'); post=np.load('data/raw/_cache_post.npy')
w=np.load('data/raw/_cache_w.npy');     exc=np.load('data/raw/_cache_exc.npy')

def build(thr):
    m=w>=thr
    p,q,ww=pre[m],post[m],(w[m]*exc[m]).astype(np.float64)*WSYN
    o=np.argsort(p,kind='stable'); p,q,ww=p[o],q[o],ww[o]
    indptr=np.zeros(N+1,dtype=np.int64); np.add.at(indptr,p+1,1); indptr=np.cumsum(indptr)
    return indptr,q.astype(np.int32),ww.astype(np.float32)

def run(indptr,ind,wts,stim_idx,t_ms=1000.0,seed=0):
    rng=np.random.default_rng(seed)
    steps=int(t_ms/DT)
    v=np.full(N,V0,dtype=np.float32); g=np.zeros(N,dtype=np.float32)
    rfc=np.zeros(N,dtype=np.int32); nspk=np.zeros(N,dtype=np.int32)
    ring=[np.empty(0,dtype=np.int64) for _ in range(DLY_STEPS)]
    is_stim=np.zeros(N,dtype=bool); is_stim[stim_idx]=True
    p_poi=RPOI*DT/1000.0; w_poi=WSYN*FPOI
    for s in range(steps):
        # deliver spikes from DLY_STEPS ago
        src=ring[s%DLY_STEPS]
        if src.size:
            cnt=(indptr[src+1]-indptr[src])
            if cnt.sum():
                idx=np.concatenate([ind[indptr[i]:indptr[i+1]] for i in src])
                val=np.concatenate([wts[indptr[i]:indptr[i+1]] for i in src])
                g+=np.bincount(idx,weights=val,minlength=N).astype(np.float32)
        # poisson drive on stimulated neurons
        if stim_idx.size:
            k=rng.random(stim_idx.size)<p_poi
            if k.any(): v[stim_idx[k]]+=w_poi
        free=rfc<=0
        # exact integration
        vn=V0+(v-V0)*EV+K*(EG-EV)*g
        gn=g*EG
        v=np.where(free,vn,v); g=np.where(free,gn,g)
        rfc[~free]-=1
        fired=np.flatnonzero((v>VTH)&free)
        if fired.size:
            v[fired]=VRST; g[fired]=0.0
            r=fired[~is_stim[fired]]; rfc[r]=RFC_STEPS   # stim targets have rfc=0
            nspk[fired]+=1
        ring[s%DLY_STEPS]=fired.astype(np.int64)
    return nspk/(t_ms/1000.0)   # Hz

j=pd.read_pickle('data/raw/_cache_meta.pkl')
ids=j.index.to_numpy()
sugar=[720575940624963786,720575940630233916,720575940637568838,720575940638202345,
720575940617000768,720575940630797113,720575940632889389,720575940621754367,
720575940621502051,720575940640649691,720575940639332736,720575940616885538,
720575940639198653,720575940620900446,720575940617937543,720575940632425919,
720575940633143833,720575940612670570,720575940628853239,720575940629176663,720575940611875570]
pos={int(f):i for i,f in enumerate(ids)}
stim=np.array([pos[f] for f in sugar if f in pos],dtype=np.int64)
print(f"stimulating {len(stim)} sugar (LB3) neurons for 1000 ms\n")

ref=None
for thr in [1,3,5,10]:
    t0=time.time(); indptr,ind,wts=build(thr)
    rates=run(indptr,ind,wts,stim,seed=1)
    act=rates>0.1
    line=f"thr>={thr:<3} edges={len(ind):>10,}  active neurons={act.sum():>6,}  mean rate(active)={rates[act].mean():6.2f} Hz  [{time.time()-t0:.0f}s]"
    if ref is None:
        ref=rates; ref_act=act; print(line+"   <- REFERENCE (full model)")
    else:
        inter=(act&ref_act).sum(); recall=inter/max(ref_act.sum(),1); prec=inter/max(act.sum(),1)
        both=ref_act&act
        cor=np.corrcoef(ref[both],rates[both])[0,1] if both.sum()>2 else float('nan')
        print(line+f"   recall={100*recall:5.1f}% precision={100*prec:5.1f}% rate_corr={cor:.3f}")
    np.save(f'data/raw/_rates_thr{thr}.npy',rates)
