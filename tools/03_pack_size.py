import numpy as np, gzip, io, zlib

pre=np.load('data/raw/_cache_pre.npy'); post=np.load('data/raw/_cache_post.npy')
w=np.load('data/raw/_cache_w.npy');     exc=np.load('data/raw/_cache_exc.npy')
N=138639

def varint(arr):
    """LEB128 encode a uint array -> bytes"""
    out=bytearray(); 
    for v in arr:
        v=int(v)
        while True:
            b=v&0x7F; v>>=7
            if v: out.append(b|0x80)
            else: out.append(b); break
    return bytes(out)

def zig(a): return (a.astype(np.int64)<<1)^(a.astype(np.int64)>>63)

def pack(thr, wbits=8):
    m=w>=thr
    p,q,ww,ee=pre[m],post[m],w[m],exc[m]
    order=np.lexsort((q,p))
    p,q,ww,ee=p[order],q[order],ww[order],ee[order]
    E=len(p)
    # CSR row pointers -> per-row counts, varint
    counts=np.bincount(p,minlength=N).astype(np.int64)
    # destinations delta-encoded within each row
    d=q.astype(np.int64).copy()
    starts=np.concatenate(([0],np.cumsum(counts)))[:-1]
    first=np.zeros(E,dtype=bool); first[starts[counts>0]]=True
    prev=np.roll(q.astype(np.int64),1); prev[0]=0
    delta=np.where(first, q, q-prev)
    # signed weight, clamped
    lim=(1<<(wbits-1))-1
    sw=np.clip(ww,0,lim).astype(np.int64)*ee.astype(np.int64)
    parts={
      'row_counts(varint)': varint(counts),
      'dest_delta(varint)': varint(zig(delta)),
      'weight(int%d)'%wbits: sw.astype(np.int8 if wbits==8 else np.int16).tobytes(),
    }
    raw=b''.join(parts.values())
    gz=len(gzip.compress(raw,9))
    return E, {k:len(v) for k,v in parts.items()}, len(raw), gz

print(f"{'thr':>4} {'edges':>11} {'raw MB':>8} {'gzip MB':>8} {'bytes/edge':>11}  breakdown")
for thr in [1,3,5,7,10,15,20]:
    E,parts,raw,gz = pack(thr)
    bd=" ".join(f"{k.split('(')[0]}={v/1e6:.1f}M" for k,v in parts.items())
    print(f"{thr:>4} {E:>11,} {raw/1e6:>7.1f} {gz/1e6:>8.2f} {gz/E:>10.2f}   {bd}")
