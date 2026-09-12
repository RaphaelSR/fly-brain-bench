import pyarrow.parquet as pq, numpy as np, sys

cols = ['Presynaptic_Index','Postsynaptic_Index','Connectivity','Excitatory']
t = pq.read_table('data/raw/connectivity_783.parquet', columns=cols)
pre  = t['Presynaptic_Index'].to_numpy().astype(np.int32)
post = t['Postsynaptic_Index'].to_numpy().astype(np.int32)
w    = t['Connectivity'].to_numpy().astype(np.int32)
exc  = t['Excitatory'].to_numpy().astype(np.int8)
del t
E = len(w)
N = int(max(pre.max(), post.max())) + 1
print(f"edges={E:,}  neuron index space={N:,}")
print(f"Excitatory values: {np.unique(exc)}  counts={np.bincount((exc>0).astype(int))}")
print(f"synapse count (Connectivity): min={w.min()} max={w.max()} mean={w.mean():.2f} median={np.median(w):.0f}")
print(f"total synapses = {w.sum():,}")

print("\n--- weight histogram (synapses per neuron pair) ---")
for lo,hi in [(1,1),(2,2),(3,3),(4,4),(5,5),(6,10),(11,20),(21,50),(51,100),(101,10**9)]:
    m = (w>=lo)&(w<=hi); c=int(m.sum())
    print(f"  {lo:>4}-{hi if hi<10**9 else '+':<4} : {c:>12,}  ({100*c/E:5.2f}%)")

print("\n--- pruning thresholds ---")
print(f"{'thr':>4} {'edges kept':>13} {'% edges':>8} {'% synapses':>11} {'neurons w/ deg>0':>17}")
res={}
for thr in [1,2,3,4,5,7,10,15,20,30,50]:
    m = w>=thr
    ek=int(m.sum())
    deg = np.zeros(N, dtype=np.int32)
    np.add.at(deg, pre[m], 1); np.add.at(deg, post[m], 1)
    nk=int((deg>0).sum())
    syn=int(w[m].sum())
    res[thr]=(ek,nk)
    print(f"{thr:>4} {ek:>13,} {100*ek/E:>7.2f}% {100*syn/w.sum():>10.2f}% {nk:>17,}")
np.save('data/raw/_cache_pre.npy', pre); np.save('data/raw/_cache_post.npy', post)
np.save('data/raw/_cache_w.npy', w);    np.save('data/raw/_cache_exc.npy', exc)
print("\ncached arrays to data/raw/_cache_*.npy")
