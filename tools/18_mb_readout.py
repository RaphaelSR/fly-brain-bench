"""Where does MBON drive actually come from, and can plasticity move it?"""
import numpy as np, pandas as pd, sys
sys.path.insert(0,'tools'); from lif import build, run, N

j=pd.read_pickle('data/raw/_cache_meta.pkl')
cc=j['cell_class'].fillna('').to_numpy(); ct=j['cell_type'].fillna('').astype(str).to_numpy()
kc_mask=np.zeros(N,bool); kc_mask[cc=='Kenyon_Cell']=True
KC=np.flatnonzero(kc_mask); MB=np.flatnonzero(cc=='MBON')
isMB=np.zeros(N,bool); isMB[MB]=True; isKC=kc_mask
indptr,ind,wts=build(5)

# per-edge source
src=np.zeros(len(ind),np.int32)
for i in range(N): src[indptr[i]:indptr[i+1]]=i
into_mb=np.flatnonzero(isMB[ind])
from_kc=into_mb[isKC[src[into_mb]]]
print(f"edges into MBONs: {len(into_mb):,}  of which from Kenyon cells: {len(from_kc):,} ({100*len(from_kc)/len(into_mb):.1f}%)")
print(f"synaptic weight mass into MBONs: total {np.abs(wts[into_mb]).sum():,.0f}  from KCs {np.abs(wts[from_kc]).sum():,.0f} "
      f"({100*np.abs(wts[from_kc]).sum()/np.abs(wts[into_mb]).sum():.1f}%)")

GAIN=0.12
def rates(w_,od,seed=21):
    return run(indptr,ind,w_,np.flatnonzero(ct==od),t_ms=600.0,seed=seed,kc_mask=kc_mask,apl_gain=GAIN)

def drive(r, edges):
    """total excitatory+inhibitory current delivered along `edges` given firing rates"""
    return float(np.sum(r[src[edges]] * wts[edges]))

A,B='ORN_DM1','ORN_DA1'
rA=rates(wts,A); rB=rates(wts,B)
print(f"\nKC-pathway drive into MBONs   {A}={drive(rA,from_kc):9.0f}   {B}={drive(rB,from_kc):9.0f}")
print(f"non-KC drive into MBONs       {A}={drive(rA,np.setdiff1d(into_mb,from_kc)):9.0f}   {B}={drive(rB,np.setdiff1d(into_mb,from_kc)):9.0f}")
kcA=set(KC[rA[KC]>0.1]); kcB=set(KC[rB[KC]>0.1])
print(f"\nactive KCs: {A}={len(kcA)}  {B}={len(kcB)}  shared={len(kcA&kcB)}  "
      f"unique to {A}={len(kcA-kcB)}  Jaccard={len(kcA&kcB)/max(len(kcA|kcB),1):.2f}")
