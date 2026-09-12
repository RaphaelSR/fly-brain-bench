import numpy as np
pre=np.load('data/raw/_cache_pre.npy'); exc=np.load('data/raw/_cache_exc.npy')
N=138639
# is sign constant per presynaptic neuron?
pos=np.zeros(N,dtype=np.int64); neg=np.zeros(N,dtype=np.int64)
np.add.at(pos,pre[exc>0],1); np.add.at(neg,pre[exc<0],1)
mixed=((pos>0)&(neg>0)).sum()
active=((pos+neg)>0).sum()
print(f"presynaptic neurons with outgoing edges: {active:,}")
print(f"  ... with MIXED signs: {mixed:,}  ({100*mixed/active:.3f}%)")
print("=> sign is a per-NEURON property" if mixed==0 else "=> sign varies per edge for some neurons")
