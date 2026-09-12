# Fly Brain Bench

Stimulate a population of neurons in a real fruit fly's brain, watch the spikes
spread through 2.7 million measured connections, and see the body they drive — in a
browser tab, at 60 fps, with no dependencies.

Available in English, Portuguese and Spanish.

**[Open the bench →](https://raphaelsr.github.io/fly-brain-bench/)**

---

## What this actually is

In 2024 the FlyWire consortium published the complete wiring diagram of an adult
*Drosophila melanogaster* brain: a real fly brain, sliced into ~7,000 sections,
imaged with an electron microscope, traced by machine learning and corrected by
hand. Every neuron, and every synapse between them.

This page loads that wiring diagram and runs a leaky integrate-and-fire simulation
over it. You pick a sense — sugar on the mouthparts, the smell of fermenting fruit,
a shadow expanding overhead — and those sensory neurons start firing. Everything
after that is the connectome doing its own thing.

**There is no model to train, no weights to fit, and no routing logic.** The only
inputs are five biophysical constants and a wiring diagram somebody measured.

### Things that fall out of it on their own

| You stimulate | What lights up downstream | Why that matters |
|---|---|---|
| `LB3` — sugar taste bristles | `MN10`, `MNx01` — proboscis motor neurons | This is the published benchmark of the model this page implements: taste in, feeding motion out |
| `LPLC2` — looming detectors | `DNp01` — the giant fibre | `DNp01` is *the* escape-triggering neuron in the fly. Nothing here aims at it; the wiring gets there by itself |
| `R7`/`R8` — colour photoreceptors | `Dm9`, `Mi15`, `Tm20` — medulla interneurons | Both optic lobes light up in the correct anatomical order |

---

## The body

The connectome stops at the neck. To move a fly you have to decide what descending
neuron activity *means*, and that decision is engineering, not measurement — the
page labels it as such.

What *is* measured is which descending neurons exist and what each one does. Those
are named, well-studied channels, and the decoder reads them directly:

| channel | cells | what it does in a real fly |
|---|---|---|
| `DNp01` | 2 | The giant fibre. One spike triggers the escape takeoff. |
| `DNa02` | 2 | Steering; the left/right imbalance sets turn direction. |
| `DNp09` | 2 | Freezing and stopping. |
| `MDN` | 4 | The moonwalker — drives backward walking. |
| `DNp10`, `DNp07` | 4 | Leg extension for landing. |
| `MN10`, `MNx01`, `MNx03` | 8 | Proboscis motor neurons — extend to feed. |

The fly itself is procedural geometry — no mesh, no library — and she lives in a
small world rather than floating in space:

- **Axes follow the fly convention**: +Z anterior, +Y dorsal, +X to her right; yaw
  about Y, pitch about X, roll about Z. She banks into turns and pitches nose-up on
  takeoff.
- **Real tripod gait**: front-left, mid-right and hind-left swing together, then the
  other three. Feet are tracked in *world* space, so a planted foot stays where it
  is while the body travels over it.
- **Legs are solved by two-link inverse kinematics** onto those footholds — coxa,
  femur, tibia, tarsus — so the pose is geometry rather than a canned animation.
- Wings fold back over the abdomen at rest and sweep into a tilted figure-eight
  stroke in flight; halteres beat in antiphase, as they do in a real fly.
- She walks across a ground plane, casts a contact shadow, and the camera trails her.

Two results worth trying:

- **Sugar** drives the proboscis channel and the fly extends to feed.
- **Looming** drives `DNp01` to ~200 Hz and the fly takes off. Nothing aims at the
  giant fibre; the wiring reaches it on its own.

Every panel carries an **info button** explaining what it shows and, where it
matters, which half is measured and which half is engineering — in all three
languages.

## Teaching the decoder

You can fit the readout yourself. Run a stimulus, pick what the fly should be doing,
capture it a few times, repeat for other stimuli, then train. It fits a multinomial
logistic regression over 58 descending/motor cell-type rates, in the browser, in
about a second.

Feature types were not hand-picked: `tools/21_feature_select.py` runs every preset
through the model and keeps the cell types that actually respond and discriminate.
`DNp103` and `DNp01` come out top for looming, `CB0700` for sugar, `DNg84` for touch.

In testing, four lessons (sugar→feed, looming→escape, touch→groom, food→walk) at
four captures each reached 100% on its own examples, and generalised: pheromone,
never shown during training, was classified as walking — the same behaviour as the
other odour.

**This trains the readout, not the brain.** No synapse changes. Which brings us to:

## What I tried that does not work

The fly has a real learning centre in this connectome — the mushroom body, with
5,177 Kenyon cells, 96 MBONs, 331 dopaminergic neurons, and 21,438 KC→MBON synapses
that survive pruning. Real flies learn odours by dopaminergic depression of exactly
those synapses. I implemented it. It does not produce odour learning, for a reason
worth writing down:

1. **The model does not discriminate odours.** Driving `ORN_DM1`, `ORN_DA1` and
   `ORN_VA1v` — completely different odours — activates 60.7% of Kenyon cells in
   every case, with **99.3% overlap**. Real Kenyon-cell coding is ~5% and specific.
2. **Pruning is not the cause.** The full unpruned model is worse: 74.9% active,
   99.6% overlap. APL, the inhibitory neuron that sparsifies the code, survives
   pruning at 99.3% — its contacts onto Kenyon cells have a median of 17 synapses.
3. **The missing piece is physiology, not anatomy.** Adding APL-style *divisive*
   feedback inhibition (`tools/16_sparsify.py`) recovers realistic sparseness — gain
   0.12 gives 5.4% of Kenyon cells active and drops MBON rates from 145 Hz to 39 Hz —
   but overlap only falls to ~70%, and MBONs are swamped anyway: during an odour they
   receive **−513,232** of non-olfactory drive against **+33,960** from the odour
   pathway. Isolating the mushroom body from the rest of the brain does not fix it.

So conditioning on this model would be a lie: training "avoid odour A" would change
the response to odour B just as much, because to this model A and B are nearly the
same pattern. A uniform 0.275 mV per synapse cannot express the physiology that makes
Kenyon-cell coding sparse. Reproduce any of it with `tools/13_sparsity.py`,
`tools/16_sparsify.py`, `tools/17_train.py` and `tools/19_isolated_mb.py`.

---

## How it works

**One neuron** holds a voltage that decays back to −52 mV on its own. Incoming
spikes push it up or down depending on the sender's neurotransmitter. Cross
−45 mV and it fires: dumps into everything downstream, resets, and goes
refractory for 2.2 ms.

Constants follow Shiu et al. exactly:

| | |
|---|---|
| resting / reset | −52 mV |
| threshold | −45 mV |
| membrane time constant | 20 ms |
| synaptic time constant | 5 ms |
| refractory period | 2.2 ms |
| synaptic delay | 1.8 ms |
| weight per synapse | 0.275 mV |
| stimulation | Poisson, 150 Hz |

Integration is the **closed-form solution** of the two-variable system, not Euler,
so results do not drift with step size. The engine keeps an *active set*: a neuron
that is exactly at rest with no synaptic charge is skipped entirely, and only
rejoins when something sends to it. That is what makes the whole brain tractable in
JavaScript — activity in this model is extremely sparse.

### Measured performance

Chrome, Apple Silicon, full 138,639-neuron brain with 2,700,513 connections:

| | |
|---|---|
| render, all 138,639 points | **0.11 ms** per frame |
| per-frame activity decay (main thread) | **0.21 ms** |
| → main thread total | ~0.3 ms/frame, so **60 fps** with room to spare |
| boot, cached | **227 ms** — 51 ms gunzip, 33 ms to rebuild the CSR |
| transfer | **7.9 MB** gzipped |

Simulation throughput is not a single number, because the active-set scheduler
makes cost track *activity* rather than neuron count:

| neurons holding charge | biological time per wall second |
|---:|---:|
| ~6,000 | **348 ms** (0.35× real time) |
| ~48,000 | **190 ms** (0.19× real time) |

Roughly 126,000 simulated spikes per wall-clock second at the upper end. Running
slower than real time is fine here, and arguably better — you want to *watch* the
activity spread.

For scale: the native Rust + Metal engine [flyBrain](https://github.com/mehrantsi/flyBrain)
reaches 2.6× real time on an M3 Max and ships a 149 MB pack requiring WebGPU. This
is roughly an order of magnitude slower, in plain JavaScript, with no WASM, no GPU
compute, and no dependencies — for 4.5% of the download.

---

## The size problem, and what was done about it

The full v783 connectome is 15,091,983 directed neuron pairs. Packed as tightly as
is reasonable — CSR, per-row delta-encoded destinations, LEB128 varints, sign as a
per-neuron bitmask (neurotransmitter obeys Dale's law, so it is a property of the
cell, not the edge) — that is still **30.7 MB gzipped**. Too heavy for a web page.

But the weight distribution is very long-tailed: **half of all connections are a
single synapse, and together they carry only 14% of the total synaptic weight.**

| min synapses | edges kept | % of synaptic weight | neurons retained | gzipped |
|---:|---:|---:|---:|---:|
| 1 (full) | 15,091,983 | 100.0% | 138,639 | 30.7 MB |
| 3 | 4,916,231 | 76.4% | 136,482 | 11.7 MB |
| **5** | **2,700,513** | **62.7%** | **134,181** | **6.8 MB** |
| 10 | 1,066,822 | 43.4% | 124,445 | 2.9 MB |
| 20 | 366,864 | 26.5% | 89,793 | 1.1 MB |

This build uses **≥ 5 synapses**. That is not a free lunch, so it was checked rather
than assumed: the same LIF model was run on the sugar benchmark at each threshold
and compared against the unpruned model.

| threshold | responding neurons | recall vs full | precision | firing-rate correlation |
|---:|---:|---:|---:|---:|
| 1 (reference) | 372 | — | — | — |
| 3 | 372 | 96.5% | 96.5% | 0.997 |
| **5** | **354** | **92.5%** | **97.2%** | **0.988** |
| 10 | 340 | 87.4% | 95.6% | 0.950 |

Reproduce with `tools/09_validate.py`.

---

## Running it locally

```bash
git clone https://github.com/RaphaelSR/fly-brain-bench.git
cd fly-brain-bench/web
python3 -m http.server 8000
```

Then open <http://localhost:8000>. It must be served over http — ES modules and
web workers do not work from `file://`. Requires WebGL2.

### Rebuilding the data from source

`web/data/` is committed, so the page works out of the box. To regenerate it:

```bash
tools/00_fetch.sh                  # ~135 MB of public source data
python3 -m venv .venv && .venv/bin/pip install pandas pyarrow numpy
.venv/bin/python tools/02_measure.py
.venv/bin/python tools/06_meta.py
.venv/bin/python tools/10_build_web_data.py
```

Change `THR` at the top of `tools/10_build_web_data.py` to trade size for fidelity.

---

## Layout

```
web/
  index.html        the bench; the loading screen doubles as the primer
  style.css         one committed dark instrument palette
  js/
    sim.worker.js   the LIF engine — closed-form integration, active set
    gl.js           WebGL2 point cloud, ~230 lines, no library
    data.js         gzip + LEB128 + CSR reconstruction
    presets.js      stimulus groups, resolved against real cell-type annotations
    fly.js          procedural articulated fly, tripod gait, own WebGL2 context
    decoder.js      descending-neuron channels + the trainable logistic readout
    i18n.js         English / Portuguese / Spanish
    app.js          UI and the frame loop
  data/             8.4 MB of packed connectome
tools/              Python pipeline: fetch, measure, validate, pack
```

---

## Honest limits

- A connectome gives **wiring, not physiology**. Real synaptic strengths,
  neuromodulation and plasticity were never measured. Here "strength" is simply the
  number of anatomical contacts.
- Neurotransmitter assignment is *predicted* from EM imagery for most neurons, not
  measured.
- Nothing learns. There is no memory between runs and no behaviour — activity
  spreads, then settles.
- Connections below 5 synapses are dropped (see the table above).
- This is a visualisation built on other people's data. It is not affiliated with
  FlyWire, Janelia, or the authors of the model.

## Credits

- **Connectome** — Dorkenwald et al., *FlyWire: online community for whole-brain
  connectomics*, and the FlyWire consortium. Release 783. Licensed CC-BY.
- **Cell-type annotations** — Schlegel et al.,
  [flyconnectome/flywire_annotations](https://github.com/flyconnectome/flywire_annotations).
- **Model and constants** — Shiu et al., *A leaky integrate-and-fire computational
  model based on the connectome of the entire adult Drosophila brain*,
  [philshiu/Drosophila_brain_model](https://github.com/philshiu/Drosophila_brain_model).

## Licence

Code MIT. The connectome data in `web/data/` is derived from FlyWire and remains
CC-BY 4.0 — keep the attribution if you reuse it.
