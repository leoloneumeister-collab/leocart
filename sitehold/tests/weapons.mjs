// Snapshot of every weapon's shots to kill at 15 m. If you change weapon numbers on purpose, update the table.
import { check, done } from './helpers.mjs';
import { WEAPONS, falloff, sprayPattern, PATTERN_LEN, weaponsFor } from '../src/sim/weapons.ts';
import { computeDamage } from '../src/sim/combat.ts';

//            body head armor-body armor-head
const EXPECT = {
  marshal: [4, 1, 7, 2], viper: [4, 1, 9, 2], cobra: [2, 1, 2, 1],
  hornet: [5, 2, 8, 2], wasp: [5, 2, 8, 2], mantis: [5, 2, 7, 2],
  vk47: [3, 1, 4, 1], carbine: [4, 1, 5, 2], reaper: [4, 1, 5, 2], ranger: [4, 1, 5, 2],
  scout: [2, 1, 2, 1], bolt50: [1, 1, 1, 1], pump12: [2, 1, 3, 1],
};

console.log('weapons');
for (const w of Object.values(WEAPONS)) {
  if (w.cls === 'knife') continue;
  const f = falloff(w, 15);
  const kill = (group, armored) => {
    let hp = 100, shots = 0;
    const raw = w.damage * f * (w.pellets > 1 ? 4 : 1);
    while (hp > 0 && shots < 30) { hp -= computeDamage(raw, group, w.armorPen, { armor: armored ? 100 : 0, helmet: armored }).health; shots++; }
    return shots;
  };
  const got = [kill('chest', false), kill('head', false), kill('chest', true), kill('head', true)];
  check(`${w.name}: shots to kill ${got.join('/')}`, JSON.stringify(got) === JSON.stringify(EXPECT[w.id]), `expected ${EXPECT[w.id]}`);
}
for (const t of [0, 1]) {
  const list = weaponsFor(t);
  check(`team ${t} can buy at least 2 rifles, an SMG, a sniper and a pistol`, list.filter((w) => w.cls === 'rifle').length >= 2 && list.some((w) => w.cls === 'smg') && list.some((w) => w.cls === 'sniper') && list.some((w) => w.cls === 'pistol'));
}
for (const w of Object.values(WEAPONS)) {
  if (w.cls === 'knife') continue;
  const p = sprayPattern(w);
  check(`${w.id} spray pattern has ${PATTERN_LEN} entries and a clean first bullet`, p.length === PATTERN_LEN && p[0][0] === 0 && p[0][1] === 0);
}
const rifle = sprayPattern(WEAPONS.vk47), carbine = sprayPattern(WEAPONS.carbine);
check('the big rifle kicks harder than the easy one', rifle[10][0] > carbine[10][0] + 1.5, `${rifle[10][0].toFixed(1)} vs ${carbine[10][0].toFixed(1)}`);
done('weapons');
