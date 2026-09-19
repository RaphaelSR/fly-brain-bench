"""Same test, equal cell counts — so any difference is position, not population size."""
import numpy as np, pandas as pd, json, sys
sys.path.insert(0,'tools'); from lif import build, run, N
j=pd.read_pickle('data/raw/_cache_meta.pkl')
ct=j['cell_type'].fillna('').astype(str).to_numpy(); sc=j['super_class'].fillna('').to_numpy()
side=j['side'].fillna('').to_numpy()
LP=np.flatnonzero(ct=='LPLC2'); pz=j['pos_z'].to_numpy()[LP]*40/1000
feats=json.load(open('web/data/channels.json'))['features']
fidx=[np.array(feats[k],np.int64) for k in feats]
GF=np.flatnonzero(ct=='DNp01'); DN=np.flatnonzero(sc=='descending')
sat=lambda x,k: 1-np.exp(-max(x,0)/k)
indptr,ind,wts=build(5)
rng=np.random.default_rng(3)
def probe(cells,seed=5):
    r=run(indptr,ind,wts,cells,t_ms=350.0,seed=seed)
    return np.array([sat(r[ix].mean(),40) for ix in fidx]), float(r[GF].mean()), int((r[DN]>0.1).sum())
def cos(a,b):
    na,nb=np.linalg.norm(a),np.linalg.norm(b); return float(a@b/(na*nb)) if na and nb else 0.

med=np.median(pz)
pools={'esq-frente':LP[(side[LP]=='left')&(pz>med)], 'esq-tras':LP[(side[LP]=='left')&(pz<=med)],
       'dir-frente':LP[(side[LP]=='right')&(pz>med)], 'dir-tras':LP[(side[LP]=='right')&(pz<=med)]}
K=16
print(f"{K} celulas por grupo (media de 3 amostragens)")
print(f"{'grupo':<12} {'DNp01 Hz':>10} {'DNs':>6}")
V={k:[] for k in pools}; stats={}
for k,pool in pools.items():
    gfs=[];dns=[]
    for rep in range(3):
        sel=rng.choice(pool,K,replace=False)
        v,gf,dn=probe(sel,seed=10+rep); V[k].append(v); gfs.append(gf); dns.append(dn)
    stats[k]=(np.mean(gfs),np.mean(dns))
    print(f"{k:<12} {stats[k][0]:>10.1f} {stats[k][1]:>6.0f}")
M={k:np.mean(V[k],0) for k in pools}
print("\n--- cosseno entre grupos balanceados ---")
ks=list(pools)
print("            "+" ".join(f"{k[:10]:>11}" for k in ks))
for a in ks: print(f"{a:<12}"+" ".join(f"{cos(M[a],M[b]):>11.3f}" for b in ks))
# ruido de repeticao: o mesmo grupo consigo mesmo, amostras diferentes
rep=np.mean([cos(V[k][0],V[k][1]) for k in ks])
print(f"\nrepetibilidade (mesmo grupo, amostras diferentes): {rep:.3f}")
print("  -> a diferenca entre grupos so conta se for MENOR que isso")
