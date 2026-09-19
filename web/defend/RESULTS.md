# Escape Reflex — what the training runs measured

Everything here is reproducible from the repository root:

```
node tools/28_direction_check.mjs [--shuffled]     can she tell left from right?
node tools/29_urgency_check.mjs                    does her response track distance?
node tools/train.mjs 600 --seed 66 --lr 0.8 --replay
```

A 600-episode run takes about 25 seconds. The control is the same subcircuit
rewired at random with **every in-degree and out-degree preserved**, so it differs
from the connectome only in which neuron connects to which.

## The headline

Six seeds, 600 episodes each, both arms run identically:

| | real connectome | shuffled control |
|---|---:|---:|
| escaped, first 50 episodes | 20% | 17% |
| escaped, last 50 episodes | **81%** | 46% |
| frozen policy on 12 fixed threats | **78%** | 53% |
| — leaned the right way | **97%** | 78% |
| — left the ground in time | 81% | 71% |

Per seed the last-50 figures are 74–88% real against 32–54% shuffled: no overlap.
The probe figures overlap on one seed of six.

**The aim number is the one that matters.** With the real wiring she leans away
from the threat on 97% of probe trials — five of six seeds get it right every
single time. Rewired, that falls to 78%. Timing survives the shuffle far better
than direction does, which is what you would expect: knowing *when* needs only
that something is getting louder, and knowing *which way* needs the anatomy.

## Why the control is so much worse than it looks

The shuffle does not merely scramble the signal, it nearly extinguishes it.
`28_direction_check.mjs` measures the evoked response reaching the descending
populations:

| | real | shuffled |
|---|---:|---:|
| evoked response, across the band | 0.037 – 0.081 | 0.0003 – 0.004 |

Two orders of magnitude. A degree-preserving rewiring of this subcircuit does not
carry looming to the descending neurons at all. What the control still learns, it
learns from the residue of that signal after the readout standardises its inputs.

## Where direction exists, and where it does not

Left against right, cosine between the mean evoked patterns, against the floor set
by repeating the same side:

| approach angle | cos(L,R) | repeat floor | |
|---:|---:|---:|---|
| 0.20 rad | 0.999 | 0.998 | both eyes driven equally — nothing to read |
| 0.50 | 0.999 | 0.995 | nothing to read |
| 0.65 | 0.964 | 0.992 | marginal |
| **0.80** | **0.822** | 0.990 | separable |
| **0.95** | **0.867** | 0.996 | separable |
| **1.10** | **0.915** | 0.994 | separable |
| **1.25** | **0.928** | 0.997 | separable |

Threats therefore arrive from 0.80–1.25 rad. Nearer the front the frontal term
drives both eyes identically and there is genuinely no direction in the signal —
an earlier version of this scenario put the whole approach band inside that blind
region and then reported, wrongly, that the network could not learn.

## Does anything track distance?

Yes, once it is measured properly. Evoked response at each glance of an approach:

```
loom     0.00   0.14   0.29   0.43   0.57   0.71   0.86
urgency  0.000  0.018  0.022  0.039  0.055  0.062  0.069
```

Rank correlation against distance 0.97. This is the channel the timing is learned
from, and getting it required two corrections. The response window originally
opened *after* the pulse ended, measuring the tail rather than the transient; over
a few dozen cells that is one or two spikes, and the channel came out quantised
with outright dropouts — `0.00 0.82 0.82 0.00 0.82` across an approach. And it was
built from the single largest population rather than the mean of all 48, which is
the same quantity estimated from 48 times less evidence.

## The task, and why it is shaped the way it is

She gets seven glances as something closes on her. Each glance she can hold, lean
left, lean right, or leap — **once**. She escapes only if she is off the ground at
contact *and* leaning away from the threat.

Three earlier versions were each solvable without the connectome, and each was
caught by the control scoring as well as the real network:

- **Unlimited jumps.** Random play survived 84% from the first episode. A real
  fly's escape is one giant-fibre event, so she gets one.
- **Either condition sufficient.** Jumping is direction-free, so the task
  collapsed to timing and the shuffled control matched the real one at 98%.
- **Turning instead of leaning.** Turns accumulated, so four turns in *either*
  direction put the threat behind her. Every probe run opened `r r r r`: she had
  learned to spin. A lean does not accumulate — the last one is the one she leaps
  with — so getting it wrong cannot be fixed by doing it more.

## The learning rule, and three things that were wrong with it

The readout is a linear softmax over 48 descending and motor populations plus one
urgency channel, trained by REINFORCE. Her brain does not change; a connectome
records wiring, not plasticity.

- **The advantage was normalised inside each episode.** With a fixed horizon and a
  dominant terminal reward that leaves nearly the same profile whatever the
  outcome — late steps positive, early steps negative — so a losing episode
  *reinforced* the decisions that opened it. Against a running baseline per step
  index, a win is above the line everywhere and a loss below it.
- **The inputs went in raw.** The evoked vector is normalised by its own peak, so
  most channels sit near the top of their range on every glance and behave like 48
  redundant bias terms. The policy spent its budget learning noise, sat at chance
  for 400 episodes, and was beaten by a control with four parameters. Standardising
  each channel against its own running statistics leaves only the part that moves.
- **The step had no length limit.** The update sums roughly sixty steps of a
  49-dimensional feature, which saturated the softmax within a few batches; once
  saturated the gradient vanishes and she is locked into whatever she was doing.
  From the outside this is indistinguishable from a network that cannot learn.

## What is still not established

The arc **within** a run is noisy — the probe battery on the shipped recording
reads `0 42 0 42 83 92 58 75 83 …`, climbing but not monotonically. The direction
of travel is reliable across seeds; a smooth curve is not what this shows.
