"""Does driving one odour channel actually reach the mushroom body and the MBONs?"""
import numpy as np, pandas as pd, time
exec(open('tools/09_validate.py').read().split("j=pd.read_pickle")[0])   # reuse build()/run()

j=pd.read_pickle('data/raw/_cache_meta.pkl')
cc=j['cell_class'].fillna('').to_numpy(); ct=j['cell_type'].fillna('').astype(str).to_numpy()
KC=np.flatnonzero(cc=='Kenyon_Cell'); MB=np.flatnonzero(cc=='MBON'); DAN=np.flatnonzero(cc=='DAN')
print("PPL1 present:", sorted({t for t in ct[DAN] if t.startswith('PPL')})[:8])
print("PAM present :", sorted({t for t in ct[DAN] if t.startswith('PAM')})[:6], "...")

indptr,ind,wts = build(5)
for odour in ['ORN_DM1','ORN_DA1','ORN_VA1v']:
    stim=np.flatnonzero(ct==odour)
    t0=time.time(); rates=run(indptr,ind,wts,stim,t_ms=600.0,seed=3)
    kc_act=(rates[KC]>0.1).sum(); mb_act=(rates[MB]>0.1).sum()
    top=np.argsort(-rates[MB])[:5]
    print(f"\n{odour}: driving {len(stim)} ORNs  [{time.time()-t0:.0f}s]")
    print(f"   Kenyon cells firing : {kc_act:>5} / {len(KC)}  ({100*kc_act/len(KC):.1f}%  <- sparse coding)")
    print(f"   MBONs firing        : {mb_act:>5} / {len(MB)}")
    print(f"   top MBONs: " + ", ".join(f"{ct[MB[i]]}@{rates[MB[i]]:.0f}Hz" for i in top if rates[MB[i]]>0.1))
