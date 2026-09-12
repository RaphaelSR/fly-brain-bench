"""Reference LIF engine in NumPy.

Closed-form integration of the two-variable system used by Shiu et al., so
results do not depend on step size. Shared by every validation script here and
by the JavaScript engine in web/js/sim.worker.js.
"""
import numpy as np

N = 138639
V0 = VRST = -52.0
VTH = -45.0
TMBR, TAU = 20.0, 5.0
TRFC, TDLY = 2.2, 1.8
WSYN, RPOI, FPOI = 0.275, 150.0, 250.0
DT = 0.1

EV = np.exp(-DT / TMBR)
EG = np.exp(-DT / TAU)
KC_COUPLE = (TAU / (TAU - TMBR)) * (EG - EV)
RFC_STEPS = int(round(TRFC / DT))
DLY_STEPS = int(round(TDLY / DT))


def load_arrays(root='data/raw'):
    return (np.load(f'{root}/_cache_pre.npy'), np.load(f'{root}/_cache_post.npy'),
            np.load(f'{root}/_cache_w.npy'), np.load(f'{root}/_cache_exc.npy'))


def build(thr, root='data/raw'):
    """CSR connectome at a synapse-count threshold."""
    pre, post, w, exc = load_arrays(root)
    m = w >= thr
    p, q, ww = pre[m], post[m], (w[m] * exc[m]).astype(np.float64) * WSYN
    o = np.argsort(p, kind='stable')
    p, q, ww = p[o], q[o], ww[o]
    indptr = np.zeros(N + 1, np.int64)
    np.add.at(indptr, p + 1, 1)
    indptr = np.cumsum(indptr)
    return indptr, q.astype(np.int32), ww.astype(np.float32)


def run(indptr, ind, wts, stim_idx, t_ms=1000.0, seed=0, rate=RPOI,
        kc_mask=None, apl_gain=0.0, tau_apl=50.0):
    """Returns per-neuron firing rate in Hz.

    `apl_gain` > 0 adds APL-style *divisive* feedback inhibition onto the
    neurons in `kc_mask`. The connectome carries APL's anatomy but not its gain
    control, and without it Kenyon-cell coding saturates instead of staying
    sparse — see tools/16_sparsify.py.
    """
    rng = np.random.default_rng(seed)
    steps = int(t_ms / DT)
    v = np.full(N, V0, np.float32); g = np.zeros(N, np.float32)
    rfc = np.zeros(N, np.int32); nspk = np.zeros(N, np.int32)
    ring = [np.empty(0, np.int64) for _ in range(DLY_STEPS)]
    is_stim = np.zeros(N, bool); is_stim[stim_idx] = True
    p_poi = rate * DT / 1000.0
    w_poi = WSYN * FPOI
    use_apl = apl_gain > 0 and kc_mask is not None
    n_kc = int(kc_mask.sum()) if use_apl else 1
    apl = 0.0
    decay = np.exp(-DT / tau_apl)

    for s in range(steps):
        srcs = ring[s % DLY_STEPS]
        if srcs.size:
            idx = np.concatenate([ind[indptr[i]:indptr[i + 1]] for i in srcs])
            val = np.concatenate([wts[indptr[i]:indptr[i + 1]] for i in srcs])
            g += np.bincount(idx, weights=val, minlength=N).astype(np.float32)
        if len(stim_idx):
            k = rng.random(len(stim_idx)) < p_poi
            if k.any():
                v[stim_idx[k]] += w_poi
        if use_apl:
            g[kc_mask] /= (1.0 + apl_gain * apl)
        free = rfc <= 0
        vn = V0 + (v - V0) * EV + KC_COUPLE * g
        gn = g * EG
        v = np.where(free, vn, v); g = np.where(free, gn, g)
        rfc[~free] -= 1
        fired = np.flatnonzero((v > VTH) & free)
        n_kc_fired = 0
        if fired.size:
            v[fired] = VRST; g[fired] = 0.0
            rfc[fired[~is_stim[fired]]] = RFC_STEPS
            nspk[fired] += 1
            if use_apl:
                n_kc_fired = int(kc_mask[fired].sum())
        if use_apl:
            inst = (n_kc_fired / n_kc) / (DT / 1000.0)
            apl = apl * decay + inst * (1 - decay)
        ring[s % DLY_STEPS] = fired.astype(np.int64)
    return nspk / (t_ms / 1000.0)
