"""Is the saturation caused by pruning, or is it the published model itself?"""
import numpy as np, pandas as pd
exec(open('tools/09_validate.py').read().split("j=pd.read_pickle")[0])
j=pd.read_pickle('data/raw/_cache_meta.pkl')
cc=j['cell_class'].fillna('').to_numpy(); ct=j['cell_type'].fillna('').astype(str).to_numpy()
KC=np.flatnonzero(cc=='Kenyon_Cell')
for thr in [1,5]:
    indptr,ind,wts=build(thr)
    pats=[]
    for o in ['ORN_DM1','ORN_DA1']:
        r=run(indptr,ind,wts,np.flatnonzero(ct==o),t_ms=600.0,seed=11)
        pats.append(r[KC]>0.1)
    u=(pats[0]|pats[1]).sum()
    print(f"threshold >={thr}:  KC active DM1 {100*pats[0].mean():5.1f}%   DA1 {100*pats[1].mean():5.1f}%   "
          f"overlap {100*(pats[0]&pats[1]).sum()/max(u,1):5.1f}%")
