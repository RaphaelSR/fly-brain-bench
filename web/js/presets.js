/* Stimulus presets. Every entry selects real annotated cell types from the
   FlyWire v783 release; `why` is what that population actually reports. */
export const PRESETS = [
  { id: 'sugar', name: 'Sugar on the proboscis', icon: '·',
    match: { cellType: ['LB3'] },
    why: 'Labellar bristle taste neurons. Stimulating these is the published benchmark for this model — in the paper it drives the motor neurons that extend the proboscis to feed.',
    tag: 'taste' },
  { id: 'food', name: 'Smell of food', icon: '·',
    match: { cellType: ['ORN_DM1', 'ORN_DM2'] },
    why: 'Olfactory receptor neurons tuned to apple cider vinegar and other fermenting fruit. The classic "there is food nearby" channel.',
    tag: 'smell' },
  { id: 'pheromone', name: 'Pheromone (cVA)', icon: '·',
    match: { cellType: ['ORN_DA1'] },
    why: 'The DA1 glomerulus carries cis-vaccenyl acetate, the courtship pheromone. This is the most studied labelled line in the fly.',
    tag: 'smell' },
  { id: 'loom', name: 'Something coming at you', icon: '·',
    match: { cellType: ['LPLC2'] },
    why: 'Looming detectors: they fire when a dark object expands in the visual field. Watch the responding list for DNp01 — the giant fibre, the single neuron that triggers the escape jump. Nothing here aims at it; the wiring gets there on its own.',
    tag: 'vision' },
  { id: 'song', name: 'Courtship song', icon: '·',
    match: { cellTypePrefix: ['JO-B'] },
    why: 'Johnston\'s organ, subgroup B: the antennal hearing neurons tuned to the low-frequency wingbeat song a courting male produces.',
    tag: 'hearing' },
  { id: 'colour', name: 'Colour photoreceptors', icon: '·',
    match: { cellType: ['R7', 'R8'] },
    why: 'The two inner photoreceptors of every ommatidium, carrying UV/blue and blue/green. Firing these lights up the whole optic lobe.',
    tag: 'vision' },
  { id: 'humid', name: 'Humidity', icon: '·',
    match: { cellClass: ['hygrosensory'] },
    why: 'Hygrosensory neurons in the antenna. Flies dehydrate fast at their size, so moisture gets its own dedicated sensory channel.',
    tag: 'body' },
  { id: 'heat', name: 'Temperature', icon: '·',
    match: { cellClass: ['thermosensory'] },
    why: 'Thermosensory neurons of the arista. A handful of cells carries the whole hot/cold sense.',
    tag: 'body' },
  { id: 'touch', name: 'Touch on the eye', icon: '·',
    match: { cellType: ['BM_InOm'] },
    why: 'Bristle mechanosensory neurons between the ommatidia. This is what a speck of dust landing on the eye feels like, and it triggers grooming.',
    tag: 'body' },
  { id: 'bitter', name: 'Bitter taste', icon: '·',
    match: { cellTypePrefix: ['LB1', 'LB2'] },
    why: 'Other labellar bristle classes, including the ones carrying aversive taste. Compare the response with sugar — different neurons, different downstream target.',
    tag: 'taste' },
];

export const TAG_ORDER = ['taste', 'smell', 'vision', 'hearing', 'body'];

export function resolvePreset(p, labels, dicts) {
  const wantType = new Set((p.match.cellType || []).map(s => dicts.cell_type.indexOf(s)).filter(i => i >= 0));
  const wantClass = new Set((p.match.cellClass || []).map(s => dicts.cell_class.indexOf(s)).filter(i => i >= 0));
  const prefixes = p.match.cellTypePrefix || [];
  const prefixIdx = new Set();
  if (prefixes.length) {
    dicts.cell_type.forEach((name, i) => {
      if (prefixes.some(pre => name.startsWith(pre))) prefixIdx.add(i);
    });
  }
  const out = [];
  const N = labels.cellType.length;
  for (let i = 0; i < N; i++) {
    if (wantType.has(labels.cellType[i]) || wantClass.has(labels.cellClass[i]) || prefixIdx.has(labels.cellType[i])) out.push(i);
  }
  return out;
}
