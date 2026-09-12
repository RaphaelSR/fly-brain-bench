import pandas as pd, numpy as np
j = pd.read_pickle('data/raw/_cache_meta.pkl')
sugar = [720575940624963786,720575940630233916,720575940637568838,720575940638202345,
720575940617000768,720575940630797113,720575940632889389,720575940621754367,
720575940621502051,720575940640649691,720575940639332736,720575940616885538,
720575940639198653,720575940620900446,720575940617937543,720575940632425919,
720575940633143833,720575940612670570,720575940628853239,720575940629176663,
720575940611875570]
s = j.reindex(sugar)
print("=== Shiu et al. 'sugarR' neurons: what are they? ===")
print(s[['super_class','cell_class','cell_type','side','top_nt']].to_string())
print("\ncell_type value_counts:"); print(s['cell_type'].value_counts().to_string())

print("\n\n=== candidate stimulus groups by cell_type (searching known names) ===")
ct = j['cell_type'].astype(str)
cc = j['cell_class'].astype(str)
for label, pat in [
    ('sugar (Gr64f-ish)', r'^Gr64|sugar'),
    ('bitter',            r'bitter|Gr66'),
    ('water',             r'water|ppk28'),
    ('ORN (olfactory)',   r'^ORN_'),
    ('DA1 pheromone',     r'DA1'),
    ('DM1/DM2 food odor', r'^ORN_DM[12]$'),
    ('LC looming',        r'^LC(4|6|9|10|11|12|15|16|17|18|20|21|22|24|25|26)$'),
    ('LPLC',              r'^LPLC'),
    ('DNp descending',    r'^DNp'),
    ('DNa descending',    r'^DNa'),
    ('MN9 proboscis',     r'^MN9'),
    ('photoreceptor',     r'^R[1-8]$|^R7|^R8'),
    ('Johnston organ',    r'^JO-'),
    ('mushroom body KC',  r'^KC'),
    ('MBON',              r'^MBON'),
    ('DAN',               r'^PAM|^PPL1'),
    ('central complex',   r'^EPG$|^PEN|^PEG|^Delta7|^ER[0-9]'),
]:
    m = ct.str.contains(pat, regex=True, na=False)
    print(f"  {label:<20} {int(m.sum()):>7,} neurons   e.g. {sorted(ct[m].unique())[:6]}")

print("\n\n=== cell_class categories (curated groups) ===")
print(j['cell_class'].value_counts().head(50).to_string())
