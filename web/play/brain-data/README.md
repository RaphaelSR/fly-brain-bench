# Complete source connectome

Generated with `.venv/bin/python tools/build_complete_brain.py`.
Source: [Shiu et al. public FlyWire v783 model input](https://github.com/philshiu/Drosophila_brain_model/blob/main/Connectivity_783.parquet).
The derived connectome remains CC-BY; see the project README for attribution.

All 15,091,983 source directed pairs, 54,492,922 aggregated synapses and the
138,639-cell index space are preserved. No pair pruning and no clipping of
synapse counts (maximum 2,405). Weights in the simulator remain signed counts
times the model gain 0.275, not measured physiological conductances.
Source signs are preserved using the same per-neuron sign encoding, validated
against every source row. Anatomical labels and positions reuse `web/data/`;
fourteen missing positions stay hidden.

The builder checks cached arrays against the source Parquet and emits source
and payload SHA-256 hashes. Runtime validates metadata and graph integrity;
it fails instead of replacing this graph with a smaller one. The inspector
queries this same graph in the worker, avoiding a second full copy.

Complete here means **all entries of this particular source file**, not all
biological mechanisms, a complete body or a conscious animal. The 49 neural
readouts, 27 engineered inputs, synthetic visual stimulation, simplified LIF
dynamics and learned motor policies remain approximations. The neural state
is reset on release; persistent learning lives in the two motor readouts.
