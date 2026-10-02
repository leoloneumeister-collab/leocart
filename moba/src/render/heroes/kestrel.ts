/** Kestrel, the Windstring: a lean hooded hunter with a long recurve bow, quiver, feathered hood and a team coloured scarf. */
import * as THREE from 'three';
import { ease, easeOut, makeBiped, poseBiped, resetPose } from '../biped.ts';
import type { AnimState } from '../biped.ts';
import { RigBuilder, SpringChain } from '../rig.ts';
import * as S from '../shapes.ts';
import { eyes, keepUpright, makeAnchor, strand, teamPalette } from './common.ts';
import type { HeroModel } from './common.ts';

const TEAL = 0x2fb0a6;
const TEAL_DARK = 0x1c6670;
const LEATHER = 0x9a6a3c;
const LEATHER_DARK = 0x57392a;
const CREAM = 0xf4ead0;
const GOLD = 0xe9b94c;
const SKIN = 0xe6b088;
const AMBER = 0xffc84a;
const WIND = 0x9af0e0;

export function buildKestrel(team: number): HeroModel {
  const pal = teamPalette(team);
  const rb = new RigBuilder();
  rb.rimColor = 0xb0fff0;
  const J = makeBiped(rb, { legLen: 1.8, thighFrac: 0.5, hipW: 0.3, torsoLen: 1.3, shoulderW: 0.74, armLen: 1.7, neckLen: 0.28 });
  const hipY = J.hip[1];
  const chestY = J.chest[1];
  const neckY = J.neck[1];
  const headY = J.head[1];

  rb.bone('weapon', 'handL', J.wristL[0], J.wristL[1], 0.05);
  rb.bone('arrow', 'weapon', J.wristL[0], J.wristL[1], 0.05);
  rb.bone('scarf1', 'chest', 0, neckY - 0.1, -0.35).bone('scarf2', 'scarf1', 0, neckY - 0.7, -0.5).bone('scarf3', 'scarf2', 0, neckY - 1.4, -0.6).bone('scarf4', 'scarf3', 0, neckY - 2.1, -0.7);
  rb.bone('hood1', 'head', 0, headY + 0.1, -0.62).bone('hood2', 'hood1', 0, headY - 0.15, -0.9);
  rb.bone('feath1', 'head', 0.4, headY + 0.45, -0.1).bone('feath2', 'feath1', 0.7, headY + 0.85, -0.35).bone('feath3', 'feath2', 0.85, headY + 1.2, -0.6);
  rb.bone('tail1', 'hips', 0, hipY - 0.1, -0.5).bone('tail2', 'tail1', 0, hipY - 0.6, -0.6).bone('tail3', 'tail2', 0, hipY - 1.1, -0.65);

  // ---- legs, tall boots with feather anklets
  for (const sx of [1, -1]) {
    const thigh = sx > 0 ? 'thighL' : 'thighR';
    const shin = sx > 0 ? 'shinL' : 'shinR';
    const foot = sx > 0 ? 'footL' : 'footR';
    const hip: [number, number, number] = sx > 0 ? J.hipL : J.hipR;
    const knee: [number, number, number] = sx > 0 ? J.kneeL : J.kneeR;
    const ankle: [number, number, number] = sx > 0 ? J.ankleL : J.ankleR;
    rb.part(thigh, S.limb(hip, knee, 0.26, 0.2), LEATHER_DARK);
    rb.part(shin, S.limb(knee, ankle, 0.2, 0.16), LEATHER_DARK);
    rb.part(shin, S.band([ankle[0], ankle[1] - 0.05, ankle[2]], [knee[0], knee[1] + 0.12, knee[2]], 0.22, 0.25, 16, true), LEATHER, { grad: [0.85, 1.15] });
    rb.part(shin, S.torus(0.25, 0.045, 18), GOLD, { bucket: 'metal', p: [knee[0], knee[1] + 0.12, knee[2]], r: [Math.PI / 2, 0, 0] });
    for (let i = 0; i < 3; i++) rb.part(shin, S.spike(0.05, 0.4), CREAM, { p: [knee[0] + sx * 0.2, ankle[1] + 0.3 - i * 0.02, -0.08 + i * 0.1], r: [0.15 * (i - 1), 0, -sx * 0.9] });
    rb.part(foot, S.plate(0.34, 0.26, 0.8, 0.1), LEATHER, { p: [ankle[0], 0.15, 0.16] });
    rb.part(foot, S.sphere(0.18, 1, 0.8, 1.3), LEATHER, { p: [ankle[0], 0.16, 0.5] });
  }

  // ---- hips, tunic, belt with pouch
  rb.part('hips', S.band([0, hipY - 0.15, 0], [0, hipY + 0.3, 0], 0.46, 0.42, 20), TEAL_DARK, { s: [1, 1, 0.78] });
  rb.part('hips', S.torus(0.46, 0.07, 24), LEATHER, { p: [0, hipY + 0.25, 0], r: [Math.PI / 2, 0, 0], s: [1, 0.78, 1] });
  rb.part('hips', S.plate(0.2, 0.2, 0.1, 0.04), GOLD, { bucket: 'metal', p: [0, hipY + 0.25, 0.4] });
  rb.part('hips', S.plate(0.3, 0.34, 0.22, 0.08), LEATHER, { p: [0.5, hipY - 0.05, 0.12] });
  rb.part('hips', S.plate(0.16, 0.34, 0.16, 0.06), LEATHER_DARK, { p: [-0.5, hipY - 0.05, 0.1] });
  rb.part('spine', S.band([0, hipY + 0.3, 0], [0, hipY + 0.9, 0], 0.4, 0.38, 18), CREAM, { s: [1, 1, 0.8] });
  rb.part('chest', S.sphere(0.46, 1.12, 1.2, 0.8), TEAL, { p: [0, chestY + 0.06, 0.02], grad: [0.8, 1.15] });
  rb.part('chest', S.plate(0.5, 0.75, 0.06, 0.03), LEATHER, { p: [0, chestY + 0.05, 0.38], r: [-0.08, 0, 0] });
  // bandolier and quiver
  rb.part('chest', S.band([-0.45, chestY + 0.55, 0.1], [0.45, chestY - 0.5, 0.1], 0.07, 0.07, 10), LEATHER_DARK, { s: [1, 1, 1] });
  rb.part('chest', S.cyl(0.2, 0.17, 1.3, 14), LEATHER, { p: [0.28, chestY + 0.3, -0.5], r: [0.18, 0, -0.35] });
  rb.part('chest', S.torus(0.2, 0.04, 14), GOLD, { bucket: 'metal', p: [0.15, chestY + 0.9, -0.55], r: [Math.PI / 2 + 0.18, 0, 0.35] });
  for (let i = 0; i < 4; i++) {
    const a = i * 1.6;
    rb.part('chest', S.cone(0.07, 0.4, 6), i % 2 ? CREAM : pal.main, { p: [0.12 + Math.cos(a) * 0.08 + i * 0.03, chestY + 1.12 + i * 0.03, -0.58 + Math.sin(a) * 0.08], r: [0.18, 0, -0.35] });
  }
  rb.part('neck', S.band([0, neckY - 0.12, 0], [0, neckY + 0.3, 0], 0.17, 0.15, 12), SKIN);
  rb.part('neck', S.torus(0.3, 0.1, 18), TEAL_DARK, { p: [0, neckY - 0.08, 0], r: [Math.PI / 2, 0, 0] });

  // ---- arms: bracers, one pauldron
  for (const sx of [1, -1]) {
    const armBone = sx > 0 ? 'armL' : 'armR';
    const foreBone = sx > 0 ? 'foreL' : 'foreR';
    const handBone = sx > 0 ? 'handL' : 'handR';
    const sh: [number, number, number] = sx > 0 ? J.shoulderL : J.shoulderR;
    const el: [number, number, number] = sx > 0 ? J.elbowL : J.elbowR;
    const wr: [number, number, number] = sx > 0 ? J.wristL : J.wristR;
    rb.part(armBone, S.sphere(0.28), TEAL, { p: [sh[0], sh[1] + 0.02, 0] });
    rb.part(armBone, S.limb(sh, el, 0.23, 0.19), TEAL);
    rb.part(foreBone, S.limb(el, wr, 0.19, 0.16), SKIN, { grad: [0.9, 1.05] });
    rb.part(foreBone, S.band([el[0], el[1] - 0.45, el[2]], [wr[0], wr[1] + 0.05, wr[2]], 0.21, 0.2, 14, true), LEATHER, { s: [1, 1, 1] });
    rb.part(foreBone, S.torus(0.2, 0.035, 14), GOLD, { bucket: 'metal', p: [wr[0], wr[1] + 0.05, wr[2]], r: [Math.PI / 2, 0, 0] });
    rb.part(handBone, S.sphere(0.17), LEATHER_DARK, { p: [wr[0], wr[1] - 0.14, wr[2] + 0.04] });
  }
  rb.part('armL', S.plate(0.55, 0.2, 0.55, 0.08), LEATHER, { p: [J.shoulderL[0] + 0.1, J.shoulderL[1] + 0.2, 0], r: [0, 0, -0.4] });
  for (let i = 0; i < 3; i++) rb.part('armL', S.spike(0.05, 0.45), CREAM, { p: [J.shoulderL[0] + 0.18 + i * 0.1, J.shoulderL[1] + 0.3 - i * 0.05, -0.12 + i * 0.12], r: [0, 0, -1.0 - i * 0.2] });

  // ---- head: face, goggles, hood, feather
  rb.part('head', S.sphere(0.47, 1, 1.05, 1), SKIN, { p: [0, headY + 0.02, 0], grad: [0.9, 1.1], jitter: 0.02 });
  rb.part('head', S.sphere(0.07, 1, 1, 1.2), SKIN, { p: [0, headY - 0.06, 0.48], noOutline: true });
  eyes(rb, 'head', headY + 0.05, 0.43, 0.19, 0.075, WIND, 2.2);
  for (const sx of [1, -1]) rb.part('head', S.plate(0.24, 0.045, 0.05, 0.015), LEATHER_DARK, { p: [sx * 0.2, headY + 0.2, 0.43], r: [0, 0, sx * 0.15], noOutline: true });
  rb.part('head', S.plate(0.12, 0.03, 0.04, 0.01), 0xb85a48, { p: [0, headY - 0.2, 0.44], noOutline: true });
  rb.part('head', S.torus(0.5, 0.05, 20), LEATHER_DARK, { p: [0, headY + 0.28, 0.02], r: [Math.PI / 2 - 0.2, 0, 0], s: [1, 1, 1] });
  rb.part('head', S.sphere(0.12, 1.4, 0.7, 0.5), WIND, { bucket: 'glow', p: [0, headY + 0.3, 0.5], boost: 2.0, noOutline: true });
  rb.part('head', S.sphere(0.58, 1.02, 1.0, 1.0), TEAL, { p: [0, headY + 0.14, -0.25], grad: [0.8, 1.15] });
  rb.part('head', S.torus(0.46, 0.07, 22), TEAL_DARK, { p: [0, headY + 0.08, 0.13], r: [0.05, 0, 0] });
  rb.part('hood1', S.cone(0.3, 0.8, 12), TEAL, { p: [0, headY - 0.05, -0.76], r: [-1.9, 0, 0] });
  rb.part('hood2', S.sphere(0.1), pal.main, { p: [0, headY - 0.26, -0.98], noOutline: true });
  // feathers in the hood
  for (let i = 0; i < 3; i++) {
    const bone = `feath${i + 1}`;
    const base = [0.4 + i * 0.22, headY + 0.45 + i * 0.4, -0.1 - i * 0.25];
    rb.part(bone, S.extrudeShape([[0, 0], [0.14, 0.35], [0.1, 0.8], [0, 1.05], [-0.1, 0.8], [-0.14, 0.35]], 0.04, 0.012), i === 1 ? 0xd8cdb0 : pal.dark, { p: base as [number, number, number], r: [-0.3, 0, -0.5], s: [0.7, 0.7, 1], grad: [0.8, 1.0], noOutline: true });
  }

  // ---- recurve bow (left hand) with string, glowing limb tips and a nocked arrow
  const w = J.wristL;
  rb.part('weapon', S.taperTube([[w[0], w[1] - 1.75, 0.0], [w[0], w[1] - 1.0, 0.4], [w[0], w[1], 0.5], [w[0], w[1] + 1.0, 0.4], [w[0], w[1] + 1.75, 0.0]], 0.05, 0.05, 8, 30), LEATHER, { grad: [0.9, 1.1] });
  rb.part('weapon', S.taperTube([[w[0], w[1] - 1.45, 0.2], [w[0], w[1] - 0.6, 0.45], [w[0], w[1] - 0.2, 0.52]], 0.12, 0.1, 8, 10), TEAL_DARK);
  rb.part('weapon', S.taperTube([[w[0], w[1] + 1.45, 0.2], [w[0], w[1] + 0.6, 0.45], [w[0], w[1] + 0.2, 0.52]], 0.12, 0.1, 8, 10), TEAL_DARK);
  rb.part('weapon', S.plate(0.12, 0.5, 0.14, 0.05), LEATHER_DARK, { p: [w[0], w[1], 0.5] });
  rb.part('weapon', S.sphere(0.09), WIND, { bucket: 'glow', p: [w[0], w[1] + 1.78, 0.0], boost: 2.6, noOutline: true });
  rb.part('weapon', S.sphere(0.09), WIND, { bucket: 'glow', p: [w[0], w[1] - 1.78, 0.0], boost: 2.6, noOutline: true });
  rb.part('weapon', S.plate(0.02, 3.5, 0.02, 0.008), CREAM, { p: [w[0], w[1], 0.02], noOutline: true });
  rb.part('arrow', S.band([w[0], w[1] + 0.08, -0.7], [w[0], w[1] + 0.08, 1.4], 0.03, 0.03, 8), LEATHER_DARK);
  rb.part('arrow', S.cone(0.075, 0.3, 8), 0xdfe6ee, { bucket: 'metal', p: [w[0], w[1] + 0.08, 1.55], r: [Math.PI / 2, 0, 0] });
  for (let i = 0; i < 2; i++) rb.part('arrow', S.plate(0.02, 0.22, 0.34, 0.01), i ? pal.main : CREAM, { p: [w[0], w[1] + 0.08 + (i ? 0.1 : -0.1) * 0, -0.52], r: [0, 0, i * Math.PI / 2], noOutline: true });

  // ---- cloth: scarf, back tail
  strand(rb, ['scarf1', 'scarf2', 'scarf3', 'scarf4'], [[0, neckY - 0.05, -0.3], [0, neckY - 0.7, -0.5], [0, neckY - 1.4, -0.6], [0, neckY - 2.1, -0.7]], 0.62, 0.34, (v) => (v > 0.9 ? GOLD : pal.main), 'x', 12);
  strand(rb, ['scarf1', 'scarf2', 'scarf3', 'scarf4'], [[0, neckY - 0.05, -0.3], [0, neckY - 0.7, -0.5], [0, neckY - 1.4, -0.6], [0, neckY - 2.1, -0.7]], 0.4, 0.2, (v) => (v > 0.9 ? GOLD : pal.dark), 'z', 12);
  rb.part('chest', S.torus(0.36, 0.1, 18), pal.main, { p: [0, neckY - 0.1, 0.0], r: [Math.PI / 2, 0, 0], s: [1, 1, 1] });
  strand(rb, ['tail1', 'tail2', 'tail3'], [[0, hipY, -0.4], [0, hipY - 0.6, -0.55], [0, hipY - 1.15, -0.62]], 0.9, 0.75, (v) => (v > 0.9 ? GOLD : v > 0.8 ? TEAL_DARK : TEAL), 'x', 8);

  const ch = rb.build(0x0f1d20, 0.04, true);
  const B = ch.bones;
  const group = new THREE.Group();
  group.add(ch.group);
  const scarf = new SpringChain([B.scarf1, B.scarf2, B.scarf3, B.scarf4], 24, 4, 1.1);
  const tail = new SpringChain([B.tail1, B.tail2, B.tail3], 34, 6, 0.9);
  const hood = new SpringChain([B.hood1, B.hood2], 30, 5, 1);
  const feath = new SpringChain([B.feath1, B.feath2, B.feath3], 26, 4, 1);

  const anchors = {
    weaponTip: makeAnchor(rb, ch, 'weapon', [w[0], w[1] + 0.08, 1.2]),
    weaponHead: makeAnchor(rb, ch, 'weapon', [w[0], w[1] + 0.08, 0.5]),
    handR: makeAnchor(rb, ch, 'handR', [J.wristR[0], J.wristR[1], 0.1]),
    handL: makeAnchor(rb, ch, 'handL', [w[0], w[1], 0.1]),
    head: makeAnchor(rb, ch, 'head', [0, headY + 0.5, 0]),
    chest: makeAnchor(rb, ch, 'chest', [0, chestY, 0.3]),
    feet: makeAnchor(rb, ch, 'root', [0, 0.1, 0]),
  };

  function update(st: AnimState) {
    resetPose(ch);
    poseBiped(ch, st, { stride: 0.9, bounce: 0.18, armSwing: 0.55, lean: 0.18, armOut: 0.12, elbowRest: 0.3, twist: 0.12, stance: 0.06, crouch: 0.05 });
    const k = st.moveK;
    // idle: bow held low in the left hand, right hand near the belt
    B.armL.rotation.x = -0.25 + 0.5 * Math.sin(st.phase) * k;
    B.armL.rotation.z = 0.15;
    B.foreL.rotation.x = -0.5;
    B.armR.rotation.x = -0.1 - 0.5 * Math.sin(st.phase) * k;
    B.arrow.scale.set(0.001, 0.001, 0.001);
    let flip = 0;

    const draw = (amount: number, aimUp = 0) => {
      // left arm extends forward holding the bow, right arm pulls the string back to the cheek
      B.armL.rotation.x = -1.45 - aimUp;
      B.armL.rotation.z = 0.05;
      B.foreL.rotation.x = -0.05;
      B.armR.rotation.x = -1.3 - aimUp * 0.8;
      B.armR.rotation.z = -0.95 * amount - 0.2;
      B.foreR.rotation.x = -1.9 * amount - 0.2;
      B.spine.rotation.y = 0.55 * amount;
      B.spine.rotation.x += 0.05 - aimUp * 0.2;
      B.head.rotation.y = -0.45 * amount;
      B.arrow.scale.set(1, 1, 1);
    };

    if (st.atk > 0) {
      const t = st.atk;
      const a = t < 0.4 ? ease(t / 0.4) : 1 - easeOut((t - 0.4) / 0.2);
      if (t < 0.6) draw(Math.max(0, a));
      if (t > 0.4) B.arrow.scale.set(0.001, 0.001, 0.001);
    }
    if (st.cast > 0) {
      const t = st.cast;
      const up = ease(Math.min(1, t * 3)) * (1 - ease((t - 0.7) / 0.3));
      const s = st.castSlot;
      if (s === 0) {
        // rapid volley: bow flourish overhead
        B.armL.rotation.x = -2.2 * up - 0.25 * (1 - up);
        B.armR.rotation.x = -2.0 * up;
        B.armR.rotation.z = -0.5 * up;
        B.spine.rotation.x -= 0.12 * up;
      } else if (s === 1) {
        draw(up);
      } else if (s === 2) {
        // backflip
        const f = ease(Math.min(1, t / 0.8));
        flip = f;
        B.armL.rotation.x = -2.0 * up;
        B.armR.rotation.x = -2.0 * up;
        B.thighL.rotation.x = -1.2 * up;
        B.thighR.rotation.x = -1.0 * up;
        B.shinL.rotation.x = 1.5 * up;
        B.shinR.rotation.x = 1.6 * up;
      } else {
        draw(up, 0.7);
      }
    }
    if (flip > 0) {
      B.root.rotation.x = flip * Math.PI * 2;
      B.root.position.y = ch.rest.root.y + Math.sin(flip * Math.PI) * 1.8;
    }
    keepUpright(B, 'L', 0, 0);
    B.weapon.rotation.z += -0.1;

    const sway = st.speed * 0.05 + st.leanX * 1.4;
    scarf.update(st.dt, sway + 0.05, st.leanZ * 1.2, 0.03 + k * 0.03, st.t);
    tail.update(st.dt, sway * 0.8, st.leanZ, 0.015, st.t);
    hood.update(st.dt, sway * 1.2, st.leanZ, 0.02, st.t);
    feath.update(st.dt, sway * 1.2 + 0.05, st.leanZ * 1.3, 0.04, st.t);
  }

  return { group, height: 4.9, character: ch, update, anchors, extras: [] };
}
