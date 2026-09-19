export const ARENA_LIMIT = 16;
export const POTS = [[-8, -7, 1], [8, -8, 1.3], [-11, 6, 0.9]];
export const PERCHES = [
  { x: 4, z: 3, radius: 1.3, height: 0.65 },
  { x: -4, z: 5, radius: 1.6, height: 1.0 },
];
export const SOLIDS = [
  ...POTS.map(([x, z, s]) => ({ x, z, radius: s, height: 1.5 * s })),
  ...PERCHES,
];
