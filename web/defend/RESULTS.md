# Escape Reflex — what the training runs measured

Reproduce with `node tools/train.mjs 600 --seed <n> [--shuffled] --quiet`
from the repository root. Roughly 17 s per run.

## Does the real wiring help?

The control is the same subcircuit rewired at random with **every in-degree and
out-degree preserved**, so it differs from the connectome only in which neuron
connects to which. Four seeds, 600 episodes each, share of episodes she got out
of the way:

| seed | real connectome | shuffled control | gap |
|-----:|----------------:|-----------------:|----:|
| 11 | 57% | 45% | +12 |
| 22 | 64% | 33% | +31 |
| 33 | 60% | 46% | +14 |
| 44 | 63% | 40% | +23 |
| **mean** | **61%** | **41%** | **+20** |

Chance is 25% with four actions. The real connectome wins on every seed.

That is the result worth having: the fly's actual wiring carries something a
degree-matched random network does not, and the readout can use it.

## What is not established

The **learning arc is noisy**. First-50 versus last-50 swings from -14 to +52
points between seeds, so while the overall level is reliably better with the real
wiring, "watch her learn within one run" is not yet a claim this supports. That is
REINFORCE variance on a short run, not evidence against learning.

## Why the task has one jump

With unlimited jumps, random play survived 84% of episodes from the very first
one — the task was trivial and there was nothing to learn. A real fly's escape is
a single giant-fibre event, so the scenario now allows one. That turns it into a
timing problem, which is what the looming system is for, and the survival rate
drops to something a policy can actually improve on.

## Why sampling is in glances

Sustained drive saturates the network: within about 80 ms the readout stops
reflecting the input, and two opposite looming patterns measure at cosine 0.9995.
A 30 ms pulse read 60 ms after onset, against the pattern from just before it,
keeps the information.

## Why left and right, never front and back

With equal cell counts, left and right LPLC2 populations give descending patterns
at cosine 0.84–0.91. The repeat-noise floor — the same population resampled — is
0.964, so that is real signal. Front versus back within one side sits at
0.95–0.97 and is not. `tools/25_loom_direction.py` and `tools/26_loom_balanced.py`.
