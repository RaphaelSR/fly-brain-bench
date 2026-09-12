import numpy as np, gzip
pre=np.load('data/raw/_cache_pre.npy'); post=np.load('data/raw/_cache_post.npy')
w=np.load('data/raw/_cache_w.npy');     exc=np.load('data/raw/_cache_exc.npy')
N=138639

def varint(arr):
    out=bytearray()
    for v in arr.tolist():
        while True:
            b=v&0x7F; v>>=7
            if v: out.append(b|0x80)
            else: out.append(b); break
    return bytes(out)

def pack(thr, wcap=127):
    m=w>=thr
    p,q,ww=pre[m],post[m],w[m]
    o=np.lexsort((q,p)); p,q,ww=p[o],q[o],ww[o]
    E=len(p)
    counts=np.bincount(p,minlength=N).astype(np.int64)
    starts=np.concatenate(([0],np.cumsum(counts)))[:-1]
    first=np.zeros(E,dtype=bool); first[starts[counts>0]]=True
    prev=np.roll(q.astype(np.int64),1); prev[0]=0
    delta=np.where(first,q.astype(np.int64),q.astype(np.int64)-prev)   # sorted asc within row => positive
    sign=np.zeros(N,dtype=np.int8); sign[pre]=exc                      # per-neuron sign
    signbits=np.packbits((sign[:N]>0).astype(np.uint8))
    parts={
      'row_counts': varint(counts),
      'dest_delta': varint(delta),
      'weight':     varint(np.clip(ww,1,wcap).astype(np.int64)),
      'sign_bits':  signbits.tobytes(),
    }
    raw=b''.join(parts.values()); gz=len(gzip.compress(raw,9))
    return E,{k:len(v) for k,v in parts.items()},len(raw),gz

print(f"{'thr':>4} {'edges':>11} {'raw MB':>8} {'gzip MB':>8} {'B/edge':>7}  breakdown (gzip-input bytes)")
for thr in [1,3,5,7,10,15,20]:
    E,parts,raw,gz=pack(thr)
    bd=" ".join(f"{k}={v/1e6:.2f}M" for k,v in parts.items())
    print(f"{thr:>4} {E:>11,} {raw/1e6:>7.1f} {gz/1e6:>8.2f} {gz/E:>6.2f}   {bd}")
