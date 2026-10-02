// Track 3: night city. Narrow streets, chicanes and hairpins.
export default {
  id: 'neon',
  name: 'Neon District',
  subtitle: 'Night city. Narrow streets, tight turns.',
  difficulty: 3,
  laps: 3,
  width: 17,
  scale: 1.35,
  shoulder: 3,
  corners: [
    [0, 0, 0], [0, 250, 28], [140, 250, 20], [140, 190, 18], [200, 190, 18], [200, 130, 18],
    [290, 130, 22], [290, 20, 22], [170, 20, 18], [170, -90, 20], [0, -90, 28],
  ],
  checkpoints: [0.12, 0.3, 0.5, 0.7, 0.88],
  boostPads: [],
  itemRows: [{ t: 0.08, count: 3 }, { t: 0.3, count: 3 }, { t: 0.55, count: 3 }, { t: 0.8, count: 3 }],
};
