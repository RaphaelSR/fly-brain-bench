# Data attribution

Everything in this directory is derived from public connectome releases and is
licensed **CC-BY 4.0**. If you reuse it, keep the attribution.

- **Connectivity and neuron positions** — FlyWire release 783.
  Dorkenwald et al., *FlyWire: online community for whole-brain connectomics*;
  Schlegel et al., *Whole-brain annotation and multi-connectome cell typing of Drosophila*.
  https://flywire.ai
- **Cell-type annotations** — https://github.com/flyconnectome/flywire_annotations
- **Model neuron list and synapse counts** — https://github.com/philshiu/Drosophila_brain_model
  (Shiu et al., leaky integrate-and-fire model of the adult Drosophila brain)

## What was changed

- Connections with fewer than 5 synapses between a neuron pair were dropped
  (15,091,983 → 2,700,513 edges). See the README for the fidelity check.
- Positions are quantised to 16 bits per axis (max error 6.2 nm).
- Synapse counts are clamped to 127 and stored as LEB128 varints.
- Excitatory/inhibitory sign is stored once per neuron rather than per edge.
