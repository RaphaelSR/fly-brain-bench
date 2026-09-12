import pyarrow.parquet as pq, pandas as pd
f = pq.ParquetFile('data/raw/connectivity_783.parquet')
print("schema:\n", f.schema_arrow)
print("rows:", f.metadata.num_rows, "row_groups:", f.metadata.num_row_groups)
df = f.read_row_group(0).to_pandas()
print(df.head(10)); print(df.dtypes)
