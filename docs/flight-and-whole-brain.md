# Sustained flight and the wider-brain experiment

## What is implemented

The playable mode now has lift and bounded acceleration, hover/braking, climbing,
descending, lateral motion, takeoff and landing: twelve discrete actions in a
continuous 120 Hz world. The ceiling is six **scene units**, not calibrated metres.
The camera and thrower follow the fly during aiming; the projectile launch origin
freezes on release. Props and their changing colliders remain part of the world.

Two independent trainable softmax readouts control navigation and escape.
Navigation chooses actions between throws rather than following a scripted walk
or hop. Its random 3D destination is an artificial task objective, not an inferred
biological drive. Progress rewards are capped and arrival adds a bonus.
Escape retains terminal outcome rewards and the immobile-fly counterfactual.
Existing motion can avoid contact too: a scored dodge is not proof of perception.

Both heads see 49 computed neural features plus 27 engineered features: current
body state, observed angular size and its change, relative threat motion between
observations, obstacle clearances, boundaries and the current navigation goal.
The motor controller cannot read the player’s aim, power, projectile velocity
field or future trajectory. However, these engineered geometry inputs mean that
successful behavior cannot be attributed to the connectome alone.

Learning starts enabled. Disabling it freezes both heads, including normalization.
Navigation and escape do not update one another’s weights. The connectome itself
never learns. The navigation imitation teacher runs only in the offline trainer.

## What the wider brain means

The existing FlyWire v783 package contains 138,639 neurons and 2,700,513 directed
connected pairs. It retains pairs with at least five synapses; it is **not an
unfiltered complete brain**. The escape package has 6,203 neurons and 108,237 pairs
at a threshold of eight. Pairs are not individual synapses.

The wider mode actually loads and simulates the larger graph. It keeps the same
49 output feature populations, using the full package’s cell indices. It does
not acquire additional senses, a ventral nerve cord model, detailed muscles,
biological plasticity rules or complete cognition simply by adding neurons.
The inspector uses that same active graph. Fourteen cells lacking annotated
positions are hidden rather than assigned invented locations.

The motor weights currently transfer from training on the smaller circuit.
Independent whole-brain offline training remains future work; online learning
can adapt each profile separately. Neither profile is a living fly or a
validated reconstruction of all fly intelligence.

## Training and held-out results

See [trainer](../tools/train-flight.mjs), [artifact](../web/play/pretrained.json)
and [archived courtyard checkpoint](../tools/fixtures/patio-v2.json).
Training inherited 4,400 escape episodes, added 400 navigation-imitation episodes,
then tried 1,800 mixed reinforcement episodes. Validation selected the checkpoint
with 6,000 total inherited/new episodes by negative hits plus 0.2 times navigation
distance gain. Held-out seeds were not used to select that checkpoint.

A preceding single-head attempt worsened escape performance. Its report is
[preserved, but not shipped](../tools/fixtures/flight-joint-unshipped.json).
After separating heads, fresh held-out seeds were used:
26029, 27143, 28247, 29363 and 30469.

| Frozen controller in the new body | Hits / 120 throws | Avoided initial threats |
| --- | ---: | ---: |
| Shipped subcircuit | 33 | 44 |
| Old escape weights padded into the new body | 33 | 44 |
| Wider graph with transferred shipped heads | 39 | 39 |

There were 77 actual initial threats: the bounded rejection sampler did not find
all requested threats. A moving fly can also enter a trajectory that would miss
an immobile fly, so hits and avoided initial threats need not sum to 77.
The artifact includes random-action and hover/brake controls, per-seed rows and
navigation probes. Navigation reached only two goals in forty 3.6-second probes.
Short-term distance reduction is not robust long-horizon planning.

The wider graph was worse in this exploratory transfer test. More neurons do
not automatically mean better decisions. One training initialization and a small
seed set do not establish statistical superiority or biological validity.
The old-weight comparison uses the **new body**, not the old published physics.

Reproduce the shipped evaluation:

```sh
node --experimental-default-type=module tools/train-flight.mjs --evaluate
node --experimental-default-type=module --test tests/*.test.mjs
```

## Cost and persistence

[CPU benchmark](../web/play/brain-benchmark.json):
Node 20.14.0, macOS ARM64, five warm-ups and forty observations per profile.
A 180-biological-ms neural observation had local median / p95 times of
4.67 / 6.88 ms for the subcircuit and 17.83 / 21.62 ms for the wider graph.
This measures neural computation, not total application memory, browser frame
rate or mobile performance. The wider profile remains optional.

Saves are isolated as `fly-play-flight-v2-escape` and
`fly-play-flight-v2-whole`. The old `fly-play-save-v1` is left untouched.
Explicit transfer pads old motor weights into the larger action/input space,
resets incompatible optimizer state and scores, and adds the pretrained
navigation head. Exported backups contain both heads and identify the profile.

## Research direction, not a claim of completion

[FlyGM (2026)](https://arxiv.org/abs/2602.17997) explores a whole-brain-connectome
graph as a neural controller trained with deep reinforcement learning for
biomechanical locomotion. This supports investigating connectome-informed
control, not equating a connectivity graph with complete intelligence.

[Shiu et al. (2024)](https://pmc.ncbi.nlm.nih.gov/articles/PMC11446845/)
study a computational brain model and sensorimotor processing. Their experiments
do not validate this slipper game, its engineered sensors or its motor rewards.

Useful next experiments are independent training on the wider graph, matched
geometry-only and shuffled-connectome controls, longer navigation evaluations,
multiple training seeds and richer validated sensory/body models. These are
uncompleted research tasks, not hidden features already running in the game.
