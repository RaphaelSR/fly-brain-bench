/* Loading and decoding of the packed connectome assets. */

export async function fetchGz(url, onProgress) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  const total = Number(res.headers.get('content-length')) || 0;
  let loaded = 0;
  const counted = new ReadableStream({
    start(ctrl) {
      const reader = res.body.getReader();
      (function pump() {
        reader.read().then(({ done, value }) => {
          if (done) { ctrl.close(); return; }
          loaded += value.byteLength;
          if (onProgress && total) onProgress(loaded / total);
          ctrl.enqueue(value); pump();
        }).catch(e => ctrl.error(e));
      })();
    }
  });
  const stream = counted.pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/* LEB128 reader over a Uint8Array. */
export function varintReader(bytes) {
  let p = 0;
  return {
    next() {
      let r = 0, s = 0, b;
      do { b = bytes[p++]; r |= (b & 0x7f) << s; s += 7; } while (b & 0x80);
      return r >>> 0;
    },
    read(out, n) {
      let r, s, b, q = p;
      for (let i = 0; i < n; i++) {
        r = 0; s = 0;
        do { b = bytes[q++]; r |= (b & 0x7f) << s; s += 7; } while (b & 0x80);
        out[i] = r;
      }
      p = q; return out;
    },
    get pos() { return p; }
  };
}

/* conn.bin layout: varint row_counts[N], varint dest_delta[E], varint weight[E] */
export function decodeConnectome(bytes, N, E, signBits) {
  const rd = varintReader(bytes);
  const counts = new Int32Array(N);
  rd.read(counts, N);

  const indptr = new Int32Array(N + 1);
  for (let i = 0; i < N; i++) indptr[i + 1] = indptr[i] + counts[i];
  if (indptr[N] !== E) throw new Error(`edge count mismatch: ${indptr[N]} vs ${E}`);

  const indices = new Int32Array(E);
  rd.read(indices, E);
  // undo per-row delta encoding
  for (let i = 0; i < N; i++) {
    const a = indptr[i], b = indptr[i + 1];
    for (let e = a + 1; e < b; e++) indices[e] += indices[e - 1];
  }

  const mag = new Int32Array(E);
  rd.read(mag, E);
  const WSYN = 0.275;
  const weights = new Float32Array(E);
  for (let i = 0; i < N; i++) {
    const exc = (signBits[i >> 3] >> (7 - (i & 7))) & 1;   // packbits is MSB-first
    const s = exc ? WSYN : -WSYN;
    for (let e = indptr[i], b = indptr[i + 1]; e < b; e++) weights[e] = mag[e] * s;
  }
  return { indptr, indices, weights };
}

export function decodePositions(bytes, N, lo, span) {
  const u = new Uint16Array(bytes.buffer, bytes.byteOffset, N * 3);
  const pos = new Float32Array(N * 3);
  // centre the cloud on its own bounding box, in microns
  const ext = [0, 0, 0];
  for (let k = 0; k < 3; k++) ext[k] = span;
  for (let i = 0; i < N; i++) {
    pos[i * 3 + 0] = (u[i * 3 + 0] / 65535) * span;
    pos[i * 3 + 1] = (u[i * 3 + 1] / 65535) * span;
    pos[i * 3 + 2] = (u[i * 3 + 2] / 65535) * span;
  }
  let mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) {
    const val = pos[i * 3 + k];
    if (val < mn[k]) mn[k] = val;
    if (val > mx[k]) mx[k] = val;
  }
  const c = [(mn[0] + mx[0]) / 2, (mn[1] + mx[1]) / 2, (mn[2] + mx[2]) / 2];
  for (let i = 0; i < N; i++) for (let k = 0; k < 3; k++) pos[i * 3 + k] -= c[k];
  const radius = Math.max(mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]) / 2;
  return { pos, radius, extent: [mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2]] };
}

/* labels.bin: five uint16 arrays of length N, in order. */
export function decodeLabels(bytes, N) {
  const u = new Uint16Array(bytes.buffer, bytes.byteOffset, N * 5);
  return {
    superClass: u.subarray(0, N),
    cellClass:  u.subarray(N, N * 2),
    cellType:   u.subarray(N * 2, N * 3),
    nt:         u.subarray(N * 3, N * 4),
    side:       u.subarray(N * 4, N * 5),
  };
}
