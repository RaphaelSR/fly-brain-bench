# Fly Brain Bench

Stimulate a population of neurons in a real fruit fly's brain, watch the spikes
spread through 2.7 million measured connections, and see the body they drive — in a
browser tab. The articulated fly is rendered in Three.js; the neural engine is
plain JavaScript with no runtime dependencies.

Available in English, Portuguese and Spanish.

**[Open the bench →](https://flybrain.raphaelrocha.com/)**  ·  **[Escape Reflex →](https://flybrain.raphaelrocha.com/defend/)**

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
| `R7`/`R8` — colour photoreceptors | `Dm9`, `Mi15`, `Tm20` — a few medulla interneurons | The first synapse of the visual pathway responds — but only just, see the limits below |

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

The fly is procedural geometry rendered with a locally bundled, pinned Three.js
r180. She is the primary view on the bench, with the connectome beside her. The
scene uses physically based materials, translucent veined wings, compound eyes,
directional lighting and ground shadows:

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
- She walks across a ground plane and casts a shadow. The camera follows her
  position without rotating on its own. Drag to orbit, scroll to zoom, and use
  **Reset camera** (or double-click) to return to the initial view.

Two results worth trying:

- **Sugar** drives the proboscis channel and the fly extends to feed.
- **Looming** drives `DNp01` to ~200 Hz and the fly takes off. Nothing aims at the
  giant fibre; the wiring reaches it on its own.

Every panel carries an **info button** explaining what it shows and, where it
matters, which half is measured and which half is engineering — in all three
languages.

**Anatomical labels** sit at the real centre of mass of each population and track
the brain as you turn it: both optic lobes, the central brain, the taste centre,
the antennal lobes, the mushroom body, the central complex, and where the
descending neurons leave for the body. Labels that would collide are dropped,
nearest first.

**The view is shareable.** The URL carries the stimulus, the language and whether
labels are on, so a link opens on exactly what you were looking at:
`?stim=loom&lang=pt&regions=1`, or `?type=LPLC2` for a cell type you picked
yourself.

## Escape Reflex — the scenario at `/defend`

The bench lets you poke her and watch what happens. The scenario asks a harder
question: **can anything be learned on top of this wiring, and does the wiring
matter?**

Something closes on her over seven glances. Each glance she can hold still, lean
left, lean right, or leap — and she only gets one leap. She escapes if she is off
the ground when it arrives *and* leaning away from it, because a fly that leaps
into the thing is still hit. A linear readout over 48 descending populations is
trained by REINFORCE; her brain does not change, because a connectome has no
plasticity.

The page does not train — six hundred episodes of a spiking network is not
something you watch in a tab. It plays back a recording made by
`tools/train.mjs`, which is the same engine and the same policy with nothing else
on the thread, and takes about twenty-five seconds. Every twenty-five episodes the
recorder freezes the policy and shows her **the same twelve threats**, so any two
points in the training are directly comparable: same approach, same angle, and the
only difference is what she has learned. That is what the compare button does.

The scenario opens in **3D**, sharing the bench's fly. Preparation, leaning,
takeoff, leg tucking and landing follow the recorded decisions; a wrong-way leap
is shown going the wrong way. The camera keeps a stable angle across trials,
including side-by-side comparisons. The **2D map** remains available. Pausing
freezes the body and approach, and playback speed controls their animation together.
The eye that lights up is the eye being driven. Both pages start paused when the
device requests reduced motion.

**The control is one button.** "Shuffle her wiring" loads the same run on the same
subcircuit rewired at random with every neuron's in- and out-degree preserved. It
differs from the connectome only in which neuron connects to which.

| six seeds, 600 episodes | real connectome | shuffled control |
|---|---:|---:|
| escaped, last 50 episodes | **81%** | 46% |
| frozen policy on 12 fixed threats | **78%** | 53% |
| — leaned the right way | **97%** | 78% |

Per seed the last-50 figures are 74–88% against 32–54%: no overlap. The aim number
is the one that matters — with her own wiring she leans away from the threat on 97%
of trials, and five of six seeds get it right every single time. Timing survives a
shuffle far better than direction does, which is what you would expect: knowing
*when* needs only that something is getting louder, and knowing *which way* needs
the anatomy.

[**web/defend/RESULTS.md**](web/defend/RESULTS.md) has the rest, including the
three earlier versions of the task that the control caught as solvable without the
connectome, and the three bugs in the learning rule that made a working setup look
like a network that could not learn.

---

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

These are the original neural-engine and point-cloud benchmarks, excluding the
current Three.js body. They are not an end-to-end benchmark of the new 3D scene.

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
cd fly-brain-bench
python3 tools/serve.py 8123
```

Then open <http://localhost:8123>. It must be served over http — ES modules and
web workers do not work from `file://`. Requires WebGL2.

Three.js is served from `web/vendor/three/`, including its MIT license; no npm
install or build step is required to run the site. The renderer caps pixel ratio
at 1.75, reuses geometry and only creates the second 3D scene when comparing.

Animation regression checks (Node 20+):

```bash
node --experimental-default-type=module --test tests/animation.test.mjs
```

`tools/serve.py` is `http.server` with caching switched off, which matters more
than it sounds: Python's default sends no `Cache-Control`, browsers fall back to
heuristic caching, and an edited ES module simply does not load. That fails in a
way that looks like a logic bug rather than a stale file, and it has cost this
project real time twice.

### Training the escape scenario yourself

```bash
node tools/train.mjs 600 --seed 66 --lr 0.8 --replay   # ~25 s, writes what the page plays
node tools/train.mjs 600 --seed 66 --lr 0.8 --shuffled --quiet
node tools/28_direction_check.mjs                      # can she tell left from right?
node tools/29_urgency_check.mjs                        # does her response track distance?
```

No dependencies — it imports the page's own modules through `tools/rig.mjs`, so
there is no second implementation to drift.

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
    fly.js          Three.js scene, lighting, camera controls and rendering
    fly-rig.js      procedural fly, articulated legs, planted tripod gait and wings
    lif-core.js     the LIF engine as a class — the worker and the trainer share it
    decoder.js      descending-neuron channels + the trainable logistic readout
    i18n.js         English / Portuguese / Spanish
    app.js          UI and the frame loop
  defend/           the Escape Reflex scenario
    policy.js       the task rules and the learning rule, browser-free
    arena.js        the flat arena
    arena3d.js      the same state, seen from inside it
    replay.js       playback over a recorded run
    page.js         UI and the frame loop
    data/           the looming subcircuit, plus two recorded runs
    RESULTS.md      every number the scenario claims, and how to reproduce it
  data/             8.4 MB of packed connectome
tools/
  serve.py          dev server with caching off
  rig.mjs           the measurement rig the trainer and the diagnostics share
  train.mjs         headless trainer and replay recorder
  *.py              pipeline: fetch, measure, validate, pack
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
- **The visual pathway barely propagates.** Driving all 2,650 R7/R8 photoreceptors
  for 3 s leaves 106 of 77,530 optic neurons firing and *nothing at all* in the
  central brain, descending neurons or motor neurons. Most of what you see light up
  under that preset is the driven photoreceptors themselves. Real R7/R8 are
  histaminergic and sign-inverting, which this model's transmitter set cannot
  express, so the first visual synapse is mis-signed. Looming works because `LPLC2`
  is driven directly, several stages downstream of that break. Measured in
  `tools/23_light_latency.py`.
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
