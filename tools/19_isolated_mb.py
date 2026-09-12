"""The mushroom body on its own: ORN -> PN -> KC -> MBON, with APL and the DANs.

Whole-brain simulation swamps MBONs with non-olfactory drive (tools/18). The MB
is normally studied as a circuit in its own right, so this restricts the network
to it and asks the two questions that matter:
  1. are Kenyon-cell codes sparse and odour-SPECIFIC?
  2. does dopaminergic depression produce odour-specific learning?
"""
import numpy as np, pandas as pd, sys
sys.path.insert(0,'tools')
import lif
from lif import WSYN, run

pre=np.load('data/raw/_cache_pre.npy'); post=np.load('data/raw/_cache_post.npy')
w=np.load('data/raw/_cache_w.npy'); exc=np.load('data/raw/_cache_exc.npy')
j=pd.read_pickle('data/raw/_cache_meta.pkl'); Nfull=138639
cc=j['cell_class'].fillna('').to_numpy(); ct=j['cell_type'].fillna('').astype(str).to_numpy()

keep_classes={'olfactory','ALPN','ALLN','Kenyon_Cell','MBON','DAN','MBIN','LHLN','LHCENT','ALIN','ALON'}
member=np.isin(cc,list(keep_classes))
apl=pd.Series(ct).str.startswith('APL').to_numpy()
member|=apl
sub=np.flatnonzero(member)
print(f"isolated circuit: {len(sub):,} neurons "
      f"(KC {int((cc=='Kenyon_Cell').sum())}, MBON {int((cc=='MBON').sum())}, DAN {int((cc=='DAN').sum())}, ORN {int((cc=='olfactory').sum())}, APL {int(apl.sum())})")

remap=-np.ones(Nfull,np.int64); remap[sub]=np.arange(len(sub))
m=(w>=5)&member[pre]&member[post]
p2,q2=remap[pre[m]],remap[post[m]]
ww=(w[m]*exc[m]).astype(np.float64)*WSYN
o=np.argsort(p2,kind='stable'); p2,q2,ww=p2[o],q2[o],ww[o]
Ns=len(sub)
indptr=np.zeros(Ns+1,np.int64); np.add.at(indptr,p2+1,1); indptr=np.cumsum(indptr)
ind=q2.astype(np.int32); wts=ww.astype(np.float32)
print(f"edges kept inside the circuit: {len(ind):,}")

lif.N=Ns   # the engine works on the sub-network
sub_cc=cc[sub]; sub_ct=ct[sub]
kc_mask=np.zeros(Ns,bool); kc_mask[sub_cc=='Kenyon_Cell']=True
KC=np.flatnonzero(kc_mask); MB=np.flatnonzero(sub_cc=='MBON')
isMB=np.zeros(Ns,bool); isMB[MB]=True
src=np.zeros(len(ind),np.int32)
for i in range(Ns): src[indptr[i]:indptr[i+1]]=i
into_mb=np.flatnonzero(isMB[ind]); from_kc=into_mb[kc_mask[src[into_mb]]]

def probe(w_,od,gain,seed=31):
    return run(indptr,ind,w_,np.flatnonzero(sub_ct==od),t_ms=600.0,seed=seed,
               kc_mask=kc_mask,apl_gain=gain)
def kcdrive(r): return float(np.sum(r[src[from_kc]]*wts[from_kc]))

odours=['ORN_DM1','ORN_DA1','ORN_VA1v']
print(f"\n{'APL gain':>8} | " + " | ".join(f"{o.replace('ORN_',''):>7}" for o in odours) + " | Jaccard overlap")
best=None
for gain in [0.0,0.05,0.12,0.3,0.8]:
    pats=[probe(wts,o,gain)[KC]>0.1 for o in odours]
    jac=lambda a,b:(a&b).sum()/max((a|b).sum(),1)
    ov=np.mean([jac(pats[0],pats[1]),jac(pats[0],pats[2]),jac(pats[1],pats[2])])
    print(f"{gain:>8.2f} | " + " | ".join(f"{100*p.mean():>6.1f}%" for p in pats) + f" | {100*ov:>6.1f}%")
    if 0.02 < pats[0].mean() < 0.15 and best is None: best=gain
GAIN = best if best is not None else 0.12
print(f"\n--- conditioning at APL gain {GAIN} ---")
A,B=odours[0],odours[1]
rA0=probe(wts,A,GAIN); rB0=probe(wts,B,GAIN)
d0A,d0B=kcdrive(rA0),kcdrive(rB0)
owner=src
activeA=rA0>0.1
mask=activeA[owner[from_kc]]
w2=wts.copy(); w2[from_kc[mask]]*=0.25
rA1=probe(w2,A,GAIN); rB1=probe(w2,B,GAIN)
d1A,d1B=kcdrive(rA1),kcdrive(rB1)
print(f"KC->MBON drive   before: {A}={d0A:8.0f}  {B}={d0B:8.0f}")
print(f"                  after: {A}={d1A:8.0f}  {B}={d1B:8.0f}")
dA=(d0A-d1A)/max(abs(d0A),1); dB=(d0B-d1B)/max(abs(d0B),1)
print(f"  trained {A}: {-100*dA:+6.1f}%   control {B}: {-100*dB:+6.1f}%")
print(f"  SPECIFICITY: {100*(dA-dB):+.1f} percentage points")
