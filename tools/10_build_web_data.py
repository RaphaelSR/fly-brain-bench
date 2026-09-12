"""Build the web assets: positions, metadata, packed connectome."""
import numpy as np, pandas as pd, gzip, json, os
THR=5; N=138639
OUT='web/data'; os.makedirs(OUT,exist_ok=True)

pre=np.load('data/raw/_cache_pre.npy'); post=np.load('data/raw/_cache_post.npy')
w=np.load('data/raw/_cache_w.npy');     exc=np.load('data/raw/_cache_exc.npy')
j=pd.read_pickle('data/raw/_cache_meta.pkl')

# ---------- positions ----------
px=j['pos_x'].to_numpy(dtype=np.float64); py=j['pos_y'].to_numpy(dtype=np.float64); pz=j['pos_z'].to_numpy(dtype=np.float64)
# fill missing with centroid
for a in (px,py,pz):
    m=np.isnan(a); a[m]=np.nanmedian(a)
# FlyWire voxel -> nm -> um
px*=4/1000; py*=4/1000; pz*=40/1000
print(f"extent um  x[{px.min():.0f},{px.max():.0f}] y[{py.min():.0f},{py.max():.0f}] z[{pz.min():.0f},{pz.max():.0f}]")
lo=np.array([px.min(),py.min(),pz.min()]); hi=np.array([px.max(),py.max(),pz.max()])
span=(hi-lo).max()
q=np.stack([((px-lo[0])/span),((py-lo[1])/span),((pz-lo[2])/span)],1)
qi=np.clip(np.round(q*65535),0,65535).astype('<u2')
err=np.abs(q-qi/65535).max()*span
print(f"position quantization max error: {err*1000:.1f} nm")
pos_bytes=qi.tobytes()

# ---------- metadata: dictionary-encoded categoricals ----------
def dict_encode(series, fill='unknown'):
    s=series.fillna(fill).astype(str)
    cats=sorted(s.unique()); idx={c:i for i,c in enumerate(cats)}
    return cats, s.map(idx).to_numpy().astype('<u2' if len(cats)<65536 else '<u4')
sc_cats,sc_i   = dict_encode(j['super_class'])
cc_cats,cc_i   = dict_encode(j['cell_class'])
ct_cats,ct_i   = dict_encode(j['cell_type'])
nt_cats,nt_i   = dict_encode(j['top_nt'])
sd_cats,sd_i   = dict_encode(j['side'])
print(f"dicts: super_class={len(sc_cats)} cell_class={len(cc_cats)} cell_type={len(ct_cats)} nt={len(nt_cats)} side={len(sd_cats)}")
assert len(ct_cats)<65536

# ---------- connectome (CSR, threshold) ----------
m=w>=THR
p,q2,ww=pre[m],post[m],w[m]
o=np.lexsort((q2,p)); p,q2,ww=p[o],q2[o],ww[o]
E=len(p)
counts=np.bincount(p,minlength=N).astype(np.int64)
indptr=np.concatenate(([0],np.cumsum(counts)))
sign=np.zeros(N,dtype=np.int8); sign[pre]=exc
signbits=np.packbits((sign>0).astype(np.uint8))
print(f"connectome: {E:,} edges, {int((counts>0).sum()):,} neurons with outputs")

def varint(a):
    out=bytearray()
    for v in a.tolist():
        while True:
            b=v&0x7F; v>>=7
            if v: out.append(b|0x80)
            else: out.append(b); break
    return bytes(out)
starts=indptr[:-1]
first=np.zeros(E,dtype=bool); first[starts[counts>0]]=True
prev=np.roll(q2.astype(np.int64),1); prev[0]=0
delta=np.where(first,q2.astype(np.int64),q2.astype(np.int64)-prev)
conn = varint(counts) + varint(delta) + varint(np.clip(ww,1,127).astype(np.int64))

# ---------- write ----------
def wr(name,data,gz=True):
    path=f'{OUT}/{name}'+('.gz' if gz else '')
    b=gzip.compress(data,9) if gz else data
    open(path,'wb').write(b)
    print(f"  {path:<34} {len(b)/1e6:>7.2f} MB")
    return len(b)

hdr={'version':'flywire-783','threshold':THR,'n_neurons':int(N),'n_edges':int(E),
     'bbox_lo':lo.tolist(),'span':float(span),
     'dicts':{'super_class':sc_cats,'cell_class':cc_cats,'cell_type':ct_cats,'top_nt':nt_cats,'side':sd_cats}}
print("\nwriting web assets:")
t=0
t+=wr('meta.json', json.dumps(hdr,separators=(',',':')).encode())
t+=wr('pos.u16.bin', pos_bytes)
t+=wr('labels.bin', sc_i.tobytes()+cc_i.tobytes()+ct_i.tobytes()+nt_i.tobytes()+sd_i.tobytes())
t+=wr('conn.bin', conn)
t+=wr('sign.bin', signbits.tobytes())
ids=j.index.to_numpy().astype('<u8')
t+=wr('rootids.bin', ids.tobytes())
print(f"\n  TOTAL TRANSFER {t/1e6:.2f} MB")
