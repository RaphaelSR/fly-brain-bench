#!/usr/bin/env bash
# Downloads the public source data needed to rebuild web/data (~135 MB).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/raw && cd data/raw

echo "1/3  FlyWire v783 neuron list (Shiu et al. model input)"
curl -fL# -o completeness_783.csv \
  https://raw.githubusercontent.com/philshiu/Drosophila_brain_model/main/Completeness_783.csv

echo "2/3  FlyWire v783 connectivity, 15.1M neuron pairs"
curl -fL# -o connectivity_783.parquet \
  https://raw.githubusercontent.com/philshiu/Drosophila_brain_model/main/Connectivity_783.parquet

echo "3/3  Cell-type annotations (Schlegel et al.)"
curl -fL# -o annotations_783.tsv \
  https://raw.githubusercontent.com/flyconnectome/flywire_annotations/main/supplemental_files/Supplemental_file1_neuron_annotations.tsv

echo
echo "Done. Now run:"
echo "  python3 -m venv .venv && .venv/bin/pip install pandas pyarrow numpy"
echo "  .venv/bin/python tools/02_measure.py       # caches arrays, prints pruning table"
echo "  .venv/bin/python tools/06_meta.py          # joins annotations"
echo "  .venv/bin/python tools/10_build_web_data.py  # writes web/data/"
