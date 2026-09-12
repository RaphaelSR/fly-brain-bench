"""Pick decoder features by which descending cell types actually respond."""
import numpy as np, pandas as pd, json, sys
sys.path.insert(0,'tools'); from lif import build, run, N

j=pd.read_pickle('data/raw/_cache_meta.pkl')
sc=j['super_class'].fillna('').to_numpy(); cc=j['cell_class'].fillna('').to_numpy()
ct=j['cell_type'].fillna('').astype(str).to_numpy(); side=j['side'].fillna('').to_numpy()
ctS=pd.Series(ct)

PRESETS={
 'sugar':  ct=='LB3',
 'food':   np.isin(ct,['ORN_DM1','ORN_DM2']),
 'pherom': ct=='ORN_DA1',
 'loom':   ct=='LPLC2',
 'song':   ctS.str.startswith('JO-B').to_numpy(),
 'colour': np.isin(ct,['R7','R8']),
 'humid':  cc=='hygrosensory',
 'heat':   cc=='thermosensory',
 'touch':  ct=='BM_InOm',
 'bitter': (ctS.str.startswith('LB1')|ctS.str.startswith('LB2')).to_numpy(),
}
# readout pool: descending neurons + brain motor neurons
pool=np.flatnonzero((sc=='descending')|(sc=='motor')|(cc=='brain_motor_neuron'))
types=sorted({ct[i] for i in pool if ct[i]})
tidx={t:np.flatnonzero((ct==t)&np.isin(np.arange(N),pool)) for t in types}
print(f"readout pool: {len(pool)} neurons in {len(types)} cell types")

indptr,ind,wts=build(5)
resp=pd.DataFrame(0.0,index=types,columns=list(PRESETS))
for name,mask in PRESETS.items():
    stim=np.flatnonzero(mask)
    if not len(stim): continue
    r=run(indptr,ind,wts,stim,t_ms=400.0,seed=13)
    for t_ in types:
        k=tidx[t_]
        if len(k): resp.loc[t_,name]=float(r[k].mean())
    print(f"  {name:<7} driven {len(stim):>5}  -> {int((resp[name]>0.5).sum()):>3} responsive types, peak {resp[name].max():.0f} Hz")

# a type is useful if it responds to something and discriminates between stimuli
score = resp.max(axis=1) * (1 + resp.std(axis=1) / (resp.mean(axis=1) + 1e-6)).clip(0, 4)
NAMED=['DNp01','DNa02','DNp09','MDN','DNp10','DNp07','DNp18','DNa01','DNb01','DNg13','MN9','MN10','MNx01','MNx03']
chosen=[t for t in score.sort_values(ascending=False).index if resp.loc[t].max()>0.5][:48]
for n in NAMED:
    if n in types and n not in chosen: chosen.append(n)
print(f"\nselected {len(chosen)} feature types; top 12 by score:")
for t_ in chosen[:12]:
    print(f"  {t_:<10} peak {resp.loc[t_].max():>6.0f} Hz  best-for={resp.loc[t_].idxmax()}")

cfg=json.load(open('web/data/channels.json'))
cfg['features']={t_:[int(i) for i in tidx[t_]] for t_ in chosen}
json.dump(cfg, open('web/data/channels.json','w'), separators=(',',':'))
import os; print(f"\nrewrote web/data/channels.json ({os.path.getsize('web/data/channels.json')} bytes), "
      f"{sum(len(v) for v in cfg['features'].values())} neurons across {len(chosen)} features")
