// Track 2: desert canyon at sunset. Long straights, two hairpins, and shortcuts across them.
export default {
  id: 'dunes',
  name: 'Dune Canyon',
  subtitle: 'Sunset desert. Hairpins and risky shortcuts.',
  difficulty: 2,
  laps: 3,
  width: 20,
  scale: 1.15,
  shoulder: 6,
  corners: [
    [200, 0, 0], [420, 0, 80], [420, 260, 70], [230, 260, 26], [370, 95, 30], [250, 95, 40],
    [110, 60, 40], [-35, 95, 30], [-35, 0, 30],
  ],
  // Shortcuts cut across the inside of the two hairpins (corner indices into `corners`).
  shortcuts: [{ corner: 3, lead: 26, width: 13 }, { corner: 4, lead: 26, width: 13 }],
  checkpoints: [0.12, 0.27, 0.464, 0.66, 0.85],
  boostPads: [],
  itemRows: [{ t: 0.07, count: 4 }, { t: 0.22, count: 4 }, { t: 0.6, count: 4 }, { t: 0.78, count: 4 }],
};
