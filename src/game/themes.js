// Per-track look and feel: sky, fog, lights, ground, road and barrier styles.

const sunDirFrom = (u, v) => {
  const phi = u * Math.PI * 2;
  const el = (0.5 - v) * Math.PI;
  return [-Math.cos(phi) * Math.cos(el), Math.sin(el), Math.sin(phi) * Math.cos(el)];
};

export const THEMES = {
  meadow: {
    id: 'meadow',
    music: 'sunny',
    seed: 21,
    sky: [[0, '#2a7fe0'], [0.3, '#5aa9f0'], [0.46, '#b9e0ff'], [0.5, '#dff1ff'], [1, '#dff1ff']],
    sun: { u: 0.22, v: 0.3, size: 20, core: '#fffbe6', glow: [[260, 'rgba(255,244,200,0.55)'], [90, 'rgba(255,250,225,0.9)']] },
    clouds: { count: 34, color: 'rgba(255,255,255,0.85)', minY: 0.22, maxY: 0.44 },
    fog: { color: 0xdff1ff, near: 160, far: 900 },
    hemi: { sky: 0xcfe8ff, ground: 0x7aa060, intensity: 1.55 },
    sunLight: { color: 0xfff1d6, intensity: 2.6 },
    ground: 'grass',
    groundTint: 0xffffff,
    road: 'asphalt',
    kerb: ['#e23b2e', '#ffffff'],
    barrier: ['#ffffff', '#d83a2a'],
    barrierTop: 0x444a55,
    wallHeight: 1.3,
    stars: false,
    exposure: 1,
  },
  dunes: {
    id: 'dunes',
    music: 'desert',
    seed: 34,
    sky: [[0, '#2a2f6e'], [0.22, '#8a4a7a'], [0.38, '#f08a5a'], [0.47, '#ffc884'], [0.5, '#ffd9a0'], [1, '#ffd9a0']],
    sun: { u: 0.62, v: 0.455, size: 34, core: '#fff3d0', glow: [[340, 'rgba(255,170,90,0.6)'], [120, 'rgba(255,220,150,0.95)']] },
    clouds: { count: 16, color: 'rgba(255,170,130,0.55)', minY: 0.3, maxY: 0.45 },
    fog: { color: 0xf5b98a, near: 140, far: 820 },
    hemi: { sky: 0xffc9a0, ground: 0x9a6a46, intensity: 1.45 },
    sunLight: { color: 0xffa862, intensity: 2.7 },
    ground: 'sand',
    groundTint: 0xffffff,
    road: 'desert',
    kerb: ['#d4552b', '#f3e3c2'],
    barrier: ['#c98f52', '#8b5a34'],
    barrierTop: 0x6e4a2c,
    wallHeight: 1.5,
    stars: false,
    exposure: 1,
  },
  neon: {
    id: 'neon',
    music: 'night',
    seed: 55,
    sky: [[0, '#04041a'], [0.25, '#0c0a35'], [0.42, '#2a1458'], [0.5, '#5a2468'], [1, '#5a2468']],
    sun: { u: 0.12, v: 0.2, size: 26, core: '#f4f6ff', glow: [[200, 'rgba(150,170,255,0.35)'], [70, 'rgba(220,230,255,0.8)']] },
    clouds: { count: 14, color: 'rgba(120,90,190,0.35)', minY: 0.28, maxY: 0.44 },
    fog: { color: 0x3a1a56, near: 90, far: 620 },
    hemi: { sky: 0x6a74d8, ground: 0x241a44, intensity: 1.35 },
    sunLight: { color: 0x8fa8ff, intensity: 1.5 },
    ground: 'concrete',
    groundTint: 0xffffff,
    road: 'neon',
    kerb: ['#ff3fb4', '#16171f'],
    barrier: ['#252a45', '#3fe8ff'],
    barrierTop: 0x1a1d33,
    wallHeight: 1.6,
    stars: true,
    exposure: 1,
  },
};

for (const t of Object.values(THEMES)) {
  t.sunDir = sunDirFrom(t.sun.u, t.sun.v);
}
