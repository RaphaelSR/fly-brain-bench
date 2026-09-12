"""Emit the descending-neuron channel map used by the body decoder."""
import numpy as np, pandas as pd, json
j=pd.read_pickle('data/raw/_cache_meta.pkl')
sc=j['super_class'].fillna('').to_numpy(); cc=j['cell_class'].fillna('').to_numpy()
ct=j['cell_type'].fillna('').astype(str).to_numpy(); side=j['side'].fillna('').to_numpy()

named = {
 'escape'   : (['DNp01'],                'Giant fibre. One spike triggers the escape takeoff.'),
 'turn'     : (['DNa02'],                'Steering. Left/right imbalance sets turn direction.'),
 'stop'     : (['DNp09'],                'Freezing and stopping.'),
 'backward' : (['MDN'],                  'Moonwalker. Drives backward walking.'),
 'landing'  : (['DNp10','DNp07'],        'Leg extension for landing.'),
 'wing'     : (['DNp18','DNp01','DNg12'],'Wing power and steering drive.'),
 'walk'     : (['DNa01','DNb01','DNg13'],'General forward locomotion drive.'),
}
out={}
for k,(types,desc) in named.items():
    idx=[]; found=[]
    for t in types:
        w=np.flatnonzero(ct==t)
        if len(w): idx+=w.tolist(); found.append(f"{t}({len(w)})")
    out[k]={'types':types,'found':found,'n':len(idx),
            'left':[int(i) for i in idx if side[i]=='left'],
            'right':[int(i) for i in idx if side[i]=='right'],
            'all':[int(i) for i in idx],'desc':desc}
    print(f"{k:<9} {out[k]['n']:>3} cells  {found}")

# proboscis / feeding motor neurons
pro=np.flatnonzero(np.isin(ct,['MN9','MN10','MNx01'])|((sc=='motor')&(pd.Series(ct).str.startswith('MN').to_numpy())))
out['proboscis']={'types':['MN9','MN10','MNx01'],'n':len(pro),'all':[int(i) for i in pro],
                  'left':[],'right':[],'desc':'Proboscis motor neurons. Firing extends the proboscis to feed.'}
print(f"proboscis {len(pro):>3} cells  {sorted(set(ct[pro]))}")

# feature vector for the trainable decoder: every descending cell type with >=2 cells
DN=np.flatnonzero(sc=='descending')
vc=pd.Series(ct[DN]).value_counts()
feats=[t for t,c in vc.items() if c>=2 and t][:64]
fmap={t:[int(i) for i in np.flatnonzero(ct==t)] for t in feats}
print(f"\nfeature channels for the learned decoder: {len(feats)} descending cell types, "
      f"{sum(len(v) for v in fmap.values())} cells")
json.dump({'channels':out,'features':fmap}, open('web/data/channels.json','w'), separators=(',',':'))
import os; print("wrote web/data/channels.json", os.path.getsize('web/data/channels.json'), "bytes")
