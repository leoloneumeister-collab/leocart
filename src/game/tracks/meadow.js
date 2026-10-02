// Track 1: sunny beginner loop. Wide road, gentle sweepers, one friendly S-bend.
export default {
  id: 'meadow',
  name: 'Meadow Run',
  subtitle: 'Sunny hills. Wide road, gentle curves.',
  difficulty: 1,
  laps: 3,
  width: 24,
  scale: 1.25,
  shoulder: 5,
  corners: [
    [0, 0, 0], [0, 190, 60], [140, 290, 70], [300, 250, 60], [350, 120, 60], [300, 10, 60],
    [200, -20, 45], [110, -115, 50], [0, -125, 55],
  ],
  checkpoints: [0.2, 0.4, 0.6, 0.8],
  boostPads: [{ t: 0.3, lat: 0, width: 8 }, { t: 0.72, lat: -5, width: 7 }],
  itemRows: [{ t: 0.1, count: 5 }, { t: 0.36, count: 5 }, { t: 0.62, count: 5 }, { t: 0.86, count: 5 }],
};
