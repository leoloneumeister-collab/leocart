// Six original racers. Stats are on a 1..5 scale and every racer sums to 12, so the
// trade-offs are real: nobody is simply better than anybody else.
//
//   speed    top speed
//   accel    how fast they reach top speed (and recover after boosts and hits)
//   handling turn rate and grip, also how tight drifts are
//   weight   bump power and resistance to being shoved, and a smaller off-road penalty

export const CHARACTERS = [
  {
    id: 'ember',
    name: 'Ember',
    species: 'Fox',
    blurb: 'Quick off the line and light on her feet. Great at recovering from hits.',
    stats: { speed: 3, accel: 4, handling: 3, weight: 2 },
    colors: { body: 0xff7a1a, accent: 0xfff1d6, kart: 0xe8341c, trim: 0x2b1a14 },
    ai: { skill: 0.945, aggression: 0.6 },
  },
  {
    id: 'bruno',
    name: 'Bruno',
    species: 'Bear',
    blurb: 'A slow starter, but nobody pushes him around. Strong top end.',
    stats: { speed: 4, accel: 1, handling: 2, weight: 5 },
    colors: { body: 0x8a5a36, accent: 0xe9c79a, kart: 0x2f6fd6, trim: 0x1b1b24 },
    ai: { skill: 0.915, aggression: 0.8 },
  },
  {
    id: 'zip',
    name: 'Zip',
    species: 'Robot',
    blurb: 'Rockets to speed and corners sharp, but gets bounced around easily.',
    stats: { speed: 2, accel: 5, handling: 4, weight: 1 },
    colors: { body: 0xffd21f, accent: 0x4ef0ff, kart: 0x1ec8d8, trim: 0x20263a },
    ai: { skill: 0.955, aggression: 0.5 },
  },
  {
    id: 'mochi',
    name: 'Mochi',
    species: 'Bunny',
    blurb: 'Glued to the road. The best handling in the field, but a lower top speed.',
    stats: { speed: 2, accel: 3, handling: 5, weight: 2 },
    colors: { body: 0xffb3d1, accent: 0xffffff, kart: 0xe84a9a, trim: 0x3a1b30 },
    ai: { skill: 0.935, aggression: 0.4 },
  },
  {
    id: 'vex',
    name: 'Vex',
    species: 'Dragon',
    blurb: 'Fastest kart on the grid and a handful to steer. Born for the straights.',
    stats: { speed: 5, accel: 2, handling: 1, weight: 4 },
    colors: { body: 0x38c76a, accent: 0xffe14a, kart: 0x7b2fd0, trim: 0x16241c },
    ai: { skill: 0.965, aggression: 0.9 },
  },
  {
    id: 'nova',
    name: 'Nova',
    species: 'Owl',
    blurb: 'The all-rounder. Nothing flashy, nothing weak. A safe pick for any track.',
    stats: { speed: 3, accel: 3, handling: 3, weight: 3 },
    colors: { body: 0x6a5acd, accent: 0xf2e6ff, kart: 0xf2c230, trim: 0x1d1840 },
    ai: { skill: 0.94, aggression: 0.55 },
  },
];

export const CHARACTER_BY_ID = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]));

/** Convert 1..5 stats into physics numbers. */
export function deriveStats(st) {
  return {
    vmax: 33 + (st.speed - 1) * 1.35, // m/s, 33..38.4
    accelK: 0.4 + (st.accel - 1) * 0.13, // 1/s, how hard the engine pulls toward top speed
    turn: 1.5 + (st.handling - 1) * 0.36, // rad/s at low speed
    driftTurn: 1.4 + (st.handling - 1) * 0.3,
    grip: 9 + (st.handling - 1) * 1.6, // sideways-velocity decay in 1/s
    driftGrip: 2.2 + (st.handling - 1) * 0.35,
    driftSlip: 0.5 - (st.handling - 1) * 0.025,
    mass: 0.8 + (st.weight - 1) * 0.3,
    offroad: 0.5 + (st.weight - 1) * 0.03, // fraction of top speed kept on rough ground
  };
}

export const POINTS = [15, 12, 10, 8, 6, 4];
