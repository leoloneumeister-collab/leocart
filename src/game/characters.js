// Twelve original racers. Stats are on a 1..5 scale and every racer sums to 12, so the
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
  {
    id: 'pip', name: 'Pip', species: 'Penguin',
    blurb: 'Slides through corners like she is on ice. Good grip, average everything else.',
    stats: { speed: 3, accel: 2, handling: 4, weight: 3 },
    colors: { body: 0x27355f, accent: 0xffffff, kart: 0x3ec8ff, trim: 0x14203a },
    ai: { skill: 0.94, aggression: 0.5 },
  },
  {
    id: 'hopper', name: 'Hopper', species: 'Frog',
    blurb: 'Springs back from hits and out of corners. Easy to throw around, hard to hold back.',
    stats: { speed: 2, accel: 4, handling: 4, weight: 2 },
    colors: { body: 0x6bd36b, accent: 0xf5ffb0, kart: 0xff8a1f, trim: 0x20361c },
    ai: { skill: 0.945, aggression: 0.6 },
  },
  {
    id: 'kiko', name: 'Kiko', species: 'Panda',
    blurb: 'Big, calm and heavy. Cruises at a high speed once the engine wakes up.',
    stats: { speed: 4, accel: 2, handling: 2, weight: 4 },
    colors: { body: 0xf4f4f4, accent: 0x2a2a2e, kart: 0x2fbf71, trim: 0x1a1a1e },
    ai: { skill: 0.93, aggression: 0.7 },
  },
  {
    id: 'rusty', name: 'Rusty', species: 'Raccoon',
    blurb: 'Sneaky and sturdy. Handles off-road bumps better than most.',
    stats: { speed: 3, accel: 3, handling: 2, weight: 4 },
    colors: { body: 0x8d90a0, accent: 0x2b2b33, kart: 0xd9602b, trim: 0x23232a },
    ai: { skill: 0.935, aggression: 0.75 },
  },
  {
    id: 'zed', name: 'Zed', species: 'Alien',
    blurb: 'Fast and nimble but light. Wins on clean lines, loses every shoving match.',
    stats: { speed: 4, accel: 3, handling: 3, weight: 2 },
    colors: { body: 0xa6f04a, accent: 0x7a2bd9, kart: 0xe8e8ee, trim: 0x2b1f4a },
    ai: { skill: 0.95, aggression: 0.55 },
  },
  {
    id: 'sol', name: 'Sol', species: 'Lion',
    blurb: 'Top speed king with a heavy frame. Needs room to turn, rewards bold drifting.',
    stats: { speed: 4, accel: 3, handling: 1, weight: 4 },
    colors: { body: 0xf0b030, accent: 0xa05a1a, kart: 0xc2185b, trim: 0x3a1b10 },
    ai: { skill: 0.955, aggression: 0.85 },
  },
];

export const CHARACTER_BY_ID = Object.fromEntries(CHARACTERS.map((c) => [c.id, c]));

/** Convert 1..5 stats into physics numbers. */
export function deriveStats(st) {
  return {
    vmax: 33 + (st.speed - 1) * 1.35, // m/s, 33..38.4
    accelK: 0.4 + (st.accel - 1) * 0.13, // 1/s, how hard the engine pulls toward top speed
    turn: 1.95 + (st.handling - 1) * 0.36, // rad/s at low speed
    driftTurn: 1.75 + (st.handling - 1) * 0.3,
    grip: 9 + (st.handling - 1) * 1.6, // sideways-velocity decay in 1/s
    driftGrip: 2.2 + (st.handling - 1) * 0.35,
    driftSlip: 0.5 - (st.handling - 1) * 0.025,
    mass: 0.8 + (st.weight - 1) * 0.3,
    offroad: 0.68 + (st.weight - 1) * 0.03, // fraction of top speed kept on rough ground
  };
}

export const POINTS = [15, 12, 10, 8, 6, 4];
