# Fly Brain Bench

Stimulate a population of neurons in a real fruit fly's brain, watch the spikes
spread through 2.7 million measured connections, and see the body they drive — in a
browser tab. The articulated fly is rendered in Three.js; the neural engine is
plain JavaScript with no runtime dependencies.

Available in English, Portuguese and Spanish.

**[Open the bench →](https://flybrain.raphaelrocha.com/)**  ·  **[Survival Arena →](https://flybrain.raphaelrocha.com/defend/)**  ·  **[Science & FAQ →](https://flybrain.raphaelrocha.com/science/)**

---

## What this actually is

In 2024 the FlyWire consortium published the complete wiring diagram of an adult
*Drosophila melanogaster* brain: a real fly brain, sliced into ~7,000 sections,
imaged with an electron microscope, traced by machine learning and corrected by
hand. This project uses a filtered package derived from that reconstruction, not
every cell and synaptic contact in the published dataset.

This page loads that wiring diagram and runs a leaky integrate-and-fire simulation
over it. You pick a sense — sugar on the mouthparts, the smell of fermenting fruit,
a shadow expanding overhead — and those sensory neurons receive modeled input.
Propagation depends on the measured wiring, preprocessing, shared parameters and
the numerical implementation; it is not a recording of the original animal.

**The bench's neural circuit has no weights to fit or hand-written routing logic.**
It uses shared approximate parameters and a measured wiring diagram. The
separate survival arena adds a trainable action policy on top of that fixed circuit.

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

## Survival arena and recorded benchmark — `/defend`

Both entry screens keep their introduction visible until **Enter** is pressed.
Loading happens in the background; neither neural time nor survival attempts
advance behind the introduction. Keyboard focus stays in the introduction until
entry, then moves to the playback control.

The arena's neural inspector uses the same WebGL renderer as the bench, with a
larger, expandable viewport, annotated population labels, transmitter legend and
click-to-inspect cells. It displays the **6,203-cell escape subcircuit**, not an
invented whole-brain silhouette. All these cells have valid annotation positions,
verified against the local source table by `tools/check_position_provenance.py`.
The full bench omits the 14 cells without annotated positions from the rendering
(and region centroids), while retaining them in the neural simulation.

Connection lines come only from the packed directed CSR. They are schematic
links between neuron positions, **not axon reconstructions or individual synapse
locations**. For readability the inspector shows at most 160 adjacent links with
the strongest packed weights and reports the displayed/available counts. The
subcircuit package retains pairs with at least 8 synapses and caps weights at 127.
The shuffled control hides empirical connection lines rather than combining them
with rewired activity. Neural glow summarizes normalized per-observation spike
snapshots and visually fades; it does not imply an exact propagation timeline or
a biological recording.

The default is an open 3D courtyard. A procedural hand throws a flip-flop at the
fly's position at release; the projectile does not home in on her. She can lean,
jump laterally, land elsewhere, and face another throw from that location.
Contact ends the current life. The next attempt respawns her while keeping the
session's policy. Learning now **autosaves in this browser** between throws, including
full-precision weights, feature normalization, pending gradients, RNG state and
statistics. Reloading continues that learning. It does not resume mid-throw; the
LIF transient resets between expanded-arena throws, including during uninterrupted
sessions, so restored checkpoints reproduce the next experiment deterministically.

**Learning and backups** offers JSON export/import, a genuinely pretrained policy,
and separate **Clear statistics** and **Erase learning** actions. Destructive choices
ask for confirmation. Saves are versioned and validated before restoration. A
revision check (under Web Locks where available) rejects stale-tab writes. Failed
writes are reported, never labeled saved. Backups matter: local browser storage is
not cloud sync, can be cleared, and cannot recover training lost before this release.

The HUD reports escapes, deaths, their ratio (not literal kills by the fly), total
survival, current-life seconds and best life; the header retains last-50 survival
and streak. Replaying a trajectory does not count or train again.

This mode computes new experiments locally in a module worker. It uses the same
6,203-cell escape subcircuit, LIF engine, neural measurement rig, and REINFORCE
policy as the offline tools. `neural-rig.js` is shared with `tools/rig.mjs`.
An episode is calculated first and then presented with its actual neural snapshots,
actions, and physical trajectory; this is not an old recording, nor a wall-clock
live neural stream. **Train 50 throws** calculates 50 additional training attempts
and presents the last one. Disable **Learn from attempts** to evaluate the
current policy without updating its weights or feature normalisation.

The connectome is fixed. Only the action readout learns. Jump propulsion, flight,
landing and cinematic camera control are engineered. The body is not NeuroMechFly:
contact uses a thorax sphere against an oriented sole/strap box at a fixed 120 Hz;
the subsequent body response uses gravity, impulse, angular damping, floor
restitution and friction at 240 Hz. The expanded 32×32 arena adds forward movement,
left/right heading changes, in-air steering and descent to the original four motor
actions. Eight actions use the same 49 neural features; there is no ground-truth
collision answer supplied to the policy. Engineered looming input is now calculated
from current projectile bearing and distance, not a prerecorded side/time sequence.
Pots and two stone perches share simplified cylindrical geometry with collision
code; leaves remain decorative. One takeoff is available per throw. Safe positions
and perch height carry into the next throw. Free time between throws (2.7, 6 or 12 s)
changes physical duration, separately from playback duration. This is a discrete
throw-based arena, not continuous neural/whole-brain biomechanics.

**Intense impacts** enables presentation-only compression, splayed wings, ballistic
green droplets and ground stains, triggered only by computed contact. It can be
disabled. Green fluid is deliberately stylized, not a claim about fly hemolymph.
There is no biological claim about a real fly surviving a sandal strike.

**Predictions** is a separate, local game with 1,000 free starting points, stakes
from 10 to 100, and a 2× gross return for correctly predicting escape/hit. Outcome
probabilities are not advertised as equal or calibrated. There are no purchases,
transfers, withdrawals, money, or public rankings. A bet is persisted before the
worker computes a frozen copy of the laboratory policy. Laboratory training and
statistics are untouched. Pending rounds retain seed, policy and settings across
reloads; settlement is idempotent and replays cannot award points again. Local
storage is user-editable, so this is not an anti-cheat or real-money system.

`tools/train-arena.mjs` reproduces `web/defend/data/pretrained-arena.json`: 800
training throws, then frozen evaluation on five held-out seeds across all nine
flight/free-time combinations (180 throws). The shipped model escaped 153/180
(85%); by flight time, 70%, 85%, and 100% in this small sample. This is neither a
survival guarantee nor biological validation. Its report includes the zero-weight
greedy baseline, which selects action 0 on ties, not a random-action baseline.

**Scene length** (4–20 seconds at 1×) and **Speed** (0.25–4×) retime presentation
without changing decisions or collision outcomes. **Throw flight** (1.2, 1.8 or
2.4 seconds) changes the next physical experiment. Turn off **Auto advance** to
hold the final state. Replaying an attempt does not train again. Cinematic framing
is optional; dragging gives the camera back to the user. Reduced motion starts
paused with cinematic camera tracking disabled.

Historical four-action arena smoke test (not the expanded protocol), 600 training
attempts per seed, default 1.8 s throws:

| seed | survived, first 50 | survived, last 50 |
|---|---:|---:|
| 11 | 21/50 | 46/50 |
| 31 | 17/50 | 41/50 |
| 20260919 | 17/50 | 49/50 |

These are exploratory training returns, not held-out evaluation or evidence that
connectome anatomy is necessary. The new geometric task can reward early jumps
and does **not** inherit the scientific controls of the recorded benchmark below.

### Recorded escape benchmark

The bench lets you poke her and watch what happens. The scenario asks a harder
question: **can anything be learned on top of this wiring, and does the wiring
matter?**

Something closes on her over seven glances. Each glance she can hold still, lean
left, lean right, or leap — and she only gets one leap. She escapes if she is off
the ground when it arrives *and* leaning away from it, because a fly that leaps
into the thing is still hit. A linear readout over 48 descending populations is
trained by a REINFORCE-inspired update; this implementation holds the neural
circuit fixed. A static anatomical map does not supply plasticity rules; this is
not a claim that biological brains lack plasticity.

The **Recorded benchmark** mode plays back a recording made by
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
refractory for a nominal 2.2 ms in non-stimulated cells (rounded to whole steps).

Nominal parameters are adapted from Shiu et al.; this browser implementation is
not an exact reproduction of every numerical and stimulation detail:

| | |
|---|---|
| resting / reset | −52 mV |
| threshold | −45 mV |
| membrane time constant | 20 ms |
| synaptic time constant | 5 ms |
| refractory period | 2.2 ms |
| synaptic delay | 1.8 ms |
| weight per synapse | 0.275 mV |
| stimulation | Bernoulli-per-step approximation to a 150 Hz Poisson input |

Subthreshold integration uses the **closed-form solution** of the two-variable
system, not Euler. Spike events, refractory periods and delays remain discrete;
the full result can still depend on step size and the active-set tolerance.
The engine keeps an *active set*: a neuron
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
- The neural circuit itself does not learn. The arena's separate motor policy
  can learn and persist locally; the bench also offers a trainable readout.
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

### Science guide and reproducible checks

The [science guide](https://flybrain.raphaelrocha.com/science/) distinguishes
anatomical data, modeled dynamics and engineered behavior. It includes a searchable
FAQ in English, Portuguese and Spanish, illustrative softmax/Wilson calculators,
and a table derived from the published pretrained policy's evaluation JSON.
The 153/180 escape frequency is descriptive: reused seeds and carried positions
make these trials dependent. The zero-weight greedy baseline waits on ties; it
is not a random-action control. No biological probability or naive confidence
interval is inferred from this evaluation.

Run software regressions with `node --experimental-default-type=module --test tests/*.test.mjs`.
For exact symbolic checks of the subthreshold solution, softmax gradient, Wilson
score inversion and expected points, install the optional development dependency
`sympy==1.14.0` and run `.venv/bin/python tools/check_science_math.py`.
The guide does not access or change saved learning or points.

The `sympy` and `scientific-critical-thinking` procedural skills assisted the
mathematical audit and interpretation review. Software/method credit (not
neuroscience evidence): Kassis et al. (2026),
[*Scientific Agent Skills: A Library of Procedural Knowledge for Research Agents*](https://doi.org/10.48550/arXiv.2609.00065).

### Data and model

- **Connectome** — Dorkenwald et al., *FlyWire: online community for whole-brain
  connectomics*, and the FlyWire consortium. Release 783. Licensed CC-BY.
- **Cell-type annotations** — Schlegel et al.,
  [flyconnectome/flywire_annotations](https://github.com/flyconnectome/flywire_annotations).
- **Model and constants** — Shiu et al.,
  [*A Drosophila computational brain model reveals sensorimotor processing*](https://www.nature.com/articles/s41586-024-07763-9),
  [philshiu/Drosophila_brain_model](https://github.com/philshiu/Drosophila_brain_model).

## Licence

Code MIT. The connectome data in `web/data/` is derived from FlyWire and remains
CC-BY 4.0 — keep the attribution if you reuse it.
