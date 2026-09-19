import { t } from '../js/i18n.js';
import { neighborhood, populations } from './connectivity.js';

export class BrainInspector {
  constructor(view, meta, labels, conn) {
    this.view = view; this.meta = meta; this.labels = labels; this.conn = conn;
    this.groups = populations(meta, labels, view.pos);
    this.focus = this.groups.filter(g => g.type === 'DNp01').flatMap(g => g.ids);
    this.name = 'DNp01'; this.picked = -1; this.shuffled = false;
    this.canvas = document.querySelector('#brainOverlay');
    this.ctx = this.canvas.getContext('2d');
    this.card = document.querySelector('#brainCard');
    this.labelBox = document.querySelector('#brainLabels');
    this.labelEls = this.groups.map(() => {
      const el = document.createElement('span'); this.labelBox.append(el); return el;
    });
    document.querySelector('#brainFocus').addEventListener('change', e => {
      this.picked = -1; this.name = e.target.value;
      this.focus = this.name === 'all' ? [] : this.groups.filter(g => g.type === this.name).flatMap(g => g.ids);
      this.refresh();
    });
    document.querySelector('#brainEdges').addEventListener('change', () => this.refresh());
    document.querySelector('#brainReset').addEventListener('click', () => {
      view.yaw = 0; view.pitch = 0; view.target = [0, 0, 0]; view.userFramed = false;
    });
    document.querySelector('#brainExpand').addEventListener('click', () => this.expand(!this.expanded));
    document.addEventListener('keydown', e => {
      if (!this.expanded) return;
      if (e.key === 'Escape') this.expand(false);
      if (e.key === 'Tab') {
        const items = [...this.card.querySelectorAll('button, select, input, summary')].filter(el => !el.disabled);
        const first = items[0], last = items.at(-1);
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });
    let start;
    view.canvas.addEventListener('pointerdown', e => { start = [e.clientX, e.clientY]; });
    view.canvas.addEventListener('pointerup', e => {
      if (!start || Math.hypot(e.clientX - start[0], e.clientY - start[1]) > 5) return;
      const r = view.canvas.getBoundingClientRect(), i = view.pick(e.clientX - r.left, e.clientY - r.top);
      if (i < 0) return;
      this.picked = i; this.focus = [i];
      this.name = meta.dicts.cell_type[labels.cellType[i]];
      document.querySelector('#brainFocus').value = 'cell';
      this.refresh();
    });
    view.autoRotate = false;
    view.pitch = 0; view.fitMargin = 1.18; view.bloom = 0.7; view.bloomThreshold = 0.55; view.baseAlpha = 0.7;
    this.refresh();
  }

  expand(on) {
    this.expanded = on;
    this.card.classList.toggle('expanded', on);
    this.card.setAttribute('role', on ? 'dialog' : 'region');
    this.card.setAttribute('aria-label', t('brain.title'));
    if (on) this.card.setAttribute('aria-modal', 'true');
    else this.card.removeAttribute('aria-modal');
    for (const el of document.querySelectorAll('.top, .stage, .transport, .rail > .card:not(#brainCard), .play .methods, .play .scoreboard, .play .round-result')) el.inert = on;
    document.querySelector('#brainExpand').setAttribute('aria-expanded', String(on));
    document.querySelector('#brainExpand').focus();
    this.relabel();
  }

  setWiring(shuffled) { this.shuffled = shuffled; this.refresh(); }

  refresh() {
    // Never put empirical edges behind the shuffled-control activity.
    this.graph = this.shuffled ? { total: 0, edges: [] } : neighborhood(this.conn, this.focus);
    const visible = new Set(this.focus);
    for (const edge of this.graph.edges) { visible.add(edge.pre); visible.add(edge.post); }
    for (let i = 0; i < this.view.N; i++) this.view.dim[i] = !this.focus.length || visible.has(i) ? 1 : 0.7;
    this.view.uploadDim();
    this.relabel();
  }

  relabel() {
    document.querySelector('#brainExpand').textContent = t(this.expanded ? 'brain.collapse' : 'brain.expand');
    document.querySelector('#brainCount').textContent = t('brain.count', { n: this.meta.n_neurons.toLocaleString(), e: this.meta.n_edges.toLocaleString() });
    document.querySelector('#brainEdgeCount').textContent = this.shuffled ? t('brain.shuffled') : !this.focus.length ? t('brain.overview') : t('brain.edges', { n: this.graph.edges.length, total: this.graph.total, name: this.name });
    const legend = document.querySelector('#brainNT');
    legend.replaceChildren();
    this.meta.dicts.top_nt.forEach((name, i) => {
      const item = document.createElement('span'), dot = document.createElement('i');
      dot.style.background = `rgb(${Array.from(this.view.ntColors.subarray(i * 3, i * 3 + 3), n => Math.round(n * 255)).join(',')})`;
      item.append(dot, t('nt.' + name).split(' — ')[0]); legend.append(item);
    });
    const detail = document.querySelector('#brainDetail');
    if (this.picked >= 0) {
      const i = this.picked, d = this.meta.dicts, L = this.labels;
      detail.textContent = `${this.name} · ${t('brain.index', { n: i })} · ${d.side[L.side[i]]} · ${d.top_nt[L.nt[i]]} · ${d.cell_class[L.cellClass[i]]}`;
    } else detail.textContent = t('brain.hint');
    this.groups.forEach((g, i) => { this.labelEls[i].textContent = `${g.type} · ${t('brain.' + g.side)}`; });
  }

  draw() {
    const view = this.view, ctx = this.ctx, c = this.canvas;
    const w = view.canvas.clientWidth, h = view.canvas.clientHeight, dpr = Math.min(devicePixelRatio || 1, 2);
    if (c.width !== Math.round(w * dpr) || c.height !== Math.round(h * dpr)) {
      c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, w, h);
    const project = i => view.project(view.pos.subarray(i * 3, i * 3 + 3));
    if (document.querySelector('#brainEdges').checked) {
      for (const edge of this.graph.edges) {
        const a = project(edge.pre), b = project(edge.post);
        if (!a || !b) continue;
        ctx.strokeStyle = edge.outgoing ? 'rgba(242,169,59,.23)' : 'rgba(76,199,204,.23)';
        ctx.lineWidth = 0.65 + Math.min(1, Math.abs(edge.weight) / 35);
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
      }
    }
    ctx.strokeStyle = '#fff1d8'; ctx.lineWidth = 1.5;
    for (const i of this.focus) {
      const p = project(i); if (!p) continue;
      ctx.beginPath(); ctx.arc(p[0], p[1], this.focus.length > 8 ? 2 : 5, 0, Math.PI * 2); ctx.stroke();
    }
    const placed = [];
    this.groups.forEach((g, i) => {
      const p = view.project(g.p), el = this.labelEls[i];
      const x = p ? Math.max(58, Math.min(w - 58, p[0])) : 0;
      const y = p ? Math.max(12, Math.min(h - 22, p[1] - 18)) : 0;
      const clash = placed.some(q => Math.abs(q[0] - x) < 112 && Math.abs(q[1] - y) < 24);
      el.hidden = !p || clash;
      if (!el.hidden) { el.style.transform = `translate(${x}px,${y}px)`; placed.push([x, y]); }
    });
  }
}
