import pandas as pd, numpy as np, pyarrow.parquet as pq

comp = pd.read_csv('data/raw/completeness_783.csv', index_col=0)
print("completeness rows:", len(comp), "cols:", list(comp.columns))
ids = comp.index.to_numpy()

# verify index alignment against the connectivity table
t = pq.ParquetFile('data/raw/connectivity_783.parquet').read_row_group(0).to_pandas()
chk = t[['Presynaptic_ID','Presynaptic_Index','Postsynaptic_ID','Postsynaptic_Index']].head(200000)
ok_pre  = (ids[chk['Presynaptic_Index'].to_numpy()]  == chk['Presynaptic_ID'].to_numpy()).all()
ok_post = (ids[chk['Postsynaptic_Index'].to_numpy()] == chk['Postsynaptic_ID'].to_numpy()).all()
print(f"index alignment: pre={ok_pre} post={ok_post}")

ann = pd.read_csv('data/raw/annotations_783.tsv', sep='\t', low_memory=False)
print("annotation rows:", len(ann))
ann = ann.drop_duplicates(subset='root_id').set_index('root_id')
j = ann.reindex(ids)
print(f"\nmatched {j['pos_x'].notna().sum():,} / {len(ids):,} neurons ({100*j['pos_x'].notna().mean():.2f}%)")
for c in ['super_class','cell_class','cell_type','hemibrain_type','top_nt','side','nerve']:
    print(f"  {c:<16} non-null {j[c].notna().sum():>7,} ({100*j[c].notna().mean():5.1f}%)  unique {j[c].nunique():>6,}")

print("\n--- super_class distribution ---")
print(j['super_class'].value_counts(dropna=False).to_string())
print("\n--- top_nt distribution ---")
print(j['top_nt'].value_counts(dropna=False).to_string())
j.to_pickle('data/raw/_cache_meta.pkl')
