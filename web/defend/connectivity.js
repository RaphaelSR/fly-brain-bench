// These are directed edges from the packed CSR, never inferred from proximity.
export function neighborhood(conn, focus, limit = 160) {
  const selected = new Set(focus), edges = [];
  for (let pre = 0; pre < conn.indptr.length - 1; pre++) {
    for (let e = conn.indptr[pre]; e < conn.indptr[pre + 1]; e++) {
      const post = conn.indices[e];
      if (selected.has(pre) || selected.has(post)) {
        edges.push({ pre, post, weight: conn.weights[e], outgoing: selected.has(pre) });
      }
    }
  }
  edges.sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight) || a.pre - b.pre || a.post - b.post);
  return { total: edges.length, edges: edges.slice(0, limit) };
}

export function populations(meta, labels, pos) {
  const groups = [];
  for (const type of ['LPLC2', 'DNp01']) {
    for (const side of ['left', 'right']) {
      const ids = [], p = [0, 0, 0];
      for (let i = 0; i < labels.cellType.length; i++) {
        if (meta.dicts.cell_type[labels.cellType[i]] !== type || meta.dicts.side[labels.side[i]] !== side) continue;
        ids.push(i);
        for (let k = 0; k < 3; k++) p[k] += pos[i * 3 + k];
      }
      if (ids.length) groups.push({ type, side, ids, p: p.map(v => v / ids.length) });
    }
  }
  return groups;
}
