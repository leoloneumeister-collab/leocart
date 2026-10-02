/** Sable, the Gloam Blade: a lean shadow assassin with a cat-eared hood, long scarf, asymmetric spiked pauldron and twin glowing daggers. */
import * as THREE from 'three';
import { ease, easeOut, makeBiped, poseBiped, resetPose, strike } from '../biped.ts';
import type { AnimState } from '../biped.ts';
import { RigBuilder, SpringChain } from '../rig.ts';
import * as S from '../shapes.ts';
import { eyes, makeAnchor, strand, teamPalette } from './common.ts';
import type { HeroModel } from './common.ts';

const INK = 0x2e2e52;
const INK_DARK = 0x1a1a30;
const INK_LIGHT = 0x50508a;
const VIOLET = 0xb46cff;
const SILVER = 0xa8b2c8;
const SKIN = 0xb89cb8;
const LEATHER = 0x5a4458;

export function buildSable(team: number): HeroModel {
  const pal = teamPalette(team);
  const rb = new RigBuilder();
  rb.rimColor = 0xc89cff;
  const J = makeBiped(rb, { legLen: 1.8, thighFrac: 0.5, hipW: 0.28, torsoLen: 1.2, shoulderW: 0.68, armLen: 1.55, neckLen: 0.3 });
  const hipY = J.hip[1];
  const chestY = J.chest[1];
  const neckY = J.neck[1];
  const headY = J.head[1];

  rb.bone('daggerR', 'handR', J.wristR[0], J.wristR[1], 0.05);
  rb.bone('daggerL', 'handL', J.wristL[0], J.wristL[1], 0.05);
  rb.bone('scarf1', 'chest', 0, neckY - 0.1, -0.3).bone('scarf2', 'scarf1', 0, neckY - 0.6, -0.5).bone('scarf3', 'scarf2', 0, neckY - 1.2, -0.65).bone('scarf4', 'scarf3', 0, neckY - 1.9, -0.75).bone('scarf5', 'scarf4', 0, neckY - 2.5, -0.8);
  rb.bone('tail1', 'head', 0, headY + 0.1, -0.55).bone('tail2', 'tail1', 0, headY - 0.2, -0.85).bone('tail3', 'tail2', 0, headY - 0.7, -1.05);
  rb.bone('sash1', 'hips', 0.35, hipY + 0.1, 0.45).bone('sash2', 'sash1', 0.4, hipY - 0.5, 0.5).bone('sash3', 'sash2', 0.4, hipY - 1.1, 0.5);

  // ---- legs: wrapped, with knee spikes and pointed boots
  for (const sx of [1, -1]) {
    const thigh = sx > 0 ? 'thighL' : 'thighR';
    const shin = sx > 0 ? 'shinL' : 'shinR';
    const foot = sx > 0 ? 'footL' : 'footR';
    const hip: [number, number, number] = sx > 0 ? J.hipL : J.hipR;
    const knee: [number, number, number] = sx > 0 ? J.kneeL : J.kneeR;
    const ankle: [number, number, number] = sx > 0 ? J.ankleL : J.ankleR;
    rb.part(thigh, S.limb(hip, knee, 0.27, 0.21), INK_DARK);
    rb.part(thigh, S.band([hip[0], hip[1] - 0.45, hip[2]], [knee[0], knee[1] + 0.15, knee[2]], 0.28, 0.24, 14, true), INK, { s: [1, 1, 1.05] });
    rb.part(shin, S.sphere(0.24, 1, 1, 1.05), INK_LIGHT, { bucket: 'metal', p: [knee[0], knee[1], knee[2] + 0.04] });
    rb.part(shin, S.spike(0.07, 0.3), SILVER, { bucket: 'metal', p: [knee[0], knee[1], knee[2] + 0.22], r: [Math.PI / 2 - 0.2, 0, 0] });
    rb.part(shin, S.limb(knee, ankle, 0.2, 0.15), INK_DARK);
    for (let i = 0; i < 3; i++) rb.part(shin, S.torus(0.2 - i * 0.015, 0.04, 14), pal.main, { p: [knee[0], knee[1] - 0.3 - i * 0.3, knee[2]], r: [Math.PI / 2, 0, 0], noOutline: true });
    rb.part(shin, S.plate(0.34, 0.8, 0.12, 0.05), INK_LIGHT, { bucket: 'metal', p: [knee[0], (knee[1] + ankle[1]) / 2, 0.2] });
    rb.part(foot, S.plate(0.32, 0.24, 0.8, 0.1), INK_DARK, { p: [ankle[0], 0.14, 0.16] });
    rb.part(foot, S.spike(0.14, 0.55), INK_LIGHT, { p: [ankle[0], 0.17, 0.5], r: [Math.PI / 2, 0, 0] });
  }

  // ---- hips: belt, hanging cloth, crossed sheaths
  rb.part('hips', S.band([0, hipY - 0.1, 0], [0, hipY + 0.3, 0], 0.44, 0.4, 20), INK_DARK, { s: [1, 1, 0.78] });
  rb.part('hips', S.torus(0.44, 0.07, 22), LEATHER, { p: [0, hipY + 0.25, 0], r: [Math.PI / 2, 0, 0], s: [1, 0.78, 1] });
  rb.part('hips', S.gem(0.11, 1.3), VIOLET, { bucket: 'glow', p: [0, hipY + 0.25, 0.37], boost: 2.4, noOutline: true });
  rb.part('hips', S.plate(0.26, 0.3, 0.2, 0.07), LEATHER, { p: [-0.5, hipY - 0.05, 0.1] });
  for (const sx of [1, -1]) rb.part('hips', S.band([sx * 0.3, hipY + 0.2, -0.45], [-sx * 0.4, hipY - 0.7, -0.55], 0.07, 0.06, 8), LEATHER);
  rb.part('spine', S.band([0, hipY + 0.3, 0], [0, hipY + 0.85, 0], 0.38, 0.36, 18), INK, { s: [1, 1, 0.78] });
  rb.part('chest', S.sphere(0.44, 1.1, 1.1, 0.8), INK, { p: [0, chestY + 0.05, 0.02], grad: [0.8, 1.15] });
  rb.part('chest', S.plate(0.46, 0.7, 0.08, 0.04), INK_LIGHT, { bucket: 'metal', p: [0, chestY + 0.05, 0.36], r: [-0.08, 0, 0] });
  rb.part('chest', S.plate(0.07, 0.62, 0.05, 0.02), VIOLET, { bucket: 'glow', p: [0, chestY + 0.05, 0.42], boost: 2.0, noOutline: true });
  rb.part('chest', S.band([-0.4, chestY + 0.5, 0.25], [0.42, chestY - 0.5, 0.25], 0.09, 0.09, 10), pal.main);
  rb.part('neck', S.band([0, neckY - 0.1, 0], [0, neckY + 0.3, 0], 0.16, 0.14, 12), SKIN);
  rb.part('neck', S.cyl(0.34, 0.38, 0.28, 14), INK_DARK, { p: [0, neckY - 0.02, 0] });

  // ---- arms: sleeves, bracers, asymmetrical pauldron on the left
  for (const sx of [1, -1]) {
    const armBone = sx > 0 ? 'armL' : 'armR';
    const foreBone = sx > 0 ? 'foreL' : 'foreR';
    const handBone = sx > 0 ? 'handL' : 'handR';
    const sh: [number, number, number] = sx > 0 ? J.shoulderL : J.shoulderR;
    const el: [number, number, number] = sx > 0 ? J.elbowL : J.elbowR;
    const wr: [number, number, number] = sx > 0 ? J.wristL : J.wristR;
    rb.part(armBone, S.sphere(0.27), INK, { p: [sh[0], sh[1] + 0.02, 0] });
    rb.part(armBone, S.limb(sh, el, 0.22, 0.18), INK);
    rb.part(foreBone, S.limb(el, wr, 0.18, 0.15), INK_DARK);
    rb.part(foreBone, S.band([el[0], el[1] - 0.35, el[2]], [wr[0], wr[1] + 0.05, wr[2]], 0.2, 0.19, 14, true), INK_LIGHT, { bucket: 'metal', s: [1, 1, 1] });
    rb.part(foreBone, S.spike(0.06, 0.4), SILVER, { bucket: 'metal', p: [el[0] + sx * 0.18, el[1] - 0.2, el[2] - 0.05], r: [0.2, 0, -sx * 1.1] });
    rb.part(handBone, S.sphere(0.16), INK_DARK, { p: [wr[0], wr[1] - 0.12, wr[2] + 0.04] });
  }
  rb.part('armL', S.sphere(0.5, 1, 0.55, 1), INK_LIGHT, { bucket: 'metal', p: [J.shoulderL[0] + 0.1, J.shoulderL[1] + 0.15, 0], grad: [0.75, 1.2] });
  rb.part('armL', S.sphere(0.42, 1, 0.45, 1), INK, { bucket: 'metal', p: [J.shoulderL[0] + 0.12, J.shoulderL[1] - 0.12, 0] });
  for (let i = 0; i < 3; i++) rb.part('armL', S.spike(0.12, 0.8 - i * 0.12), SILVER, { bucket: 'metal', p: [J.shoulderL[0] + 0.3 + i * 0.1, J.shoulderL[1] + 0.35 - i * 0.12, -0.2 + i * 0.2], r: [0.1 * (i - 1), 0, -0.9 - i * 0.2] });
  rb.part('armL', S.torus(0.46, 0.05, 20), VIOLET, { bucket: 'glow', p: [J.shoulderL[0] + 0.1, J.shoulderL[1] + 0.12, 0], r: [Math.PI / 2 - 0.2, 0, 0], boost: 1.7, noOutline: true });
  rb.part('armR', S.sphere(0.3, 1, 0.55, 1), INK_LIGHT, { bucket: 'metal', p: [J.shoulderR[0] - 0.05, J.shoulderR[1] + 0.12, 0] });

  // ---- head: pale face, mask, glowing eyes, cat-eared hood
  rb.part('head', S.sphere(0.46, 1, 1.05, 1), SKIN, { p: [0, headY + 0.02, 0], grad: [0.9, 1.1], jitter: 0.02 });
  rb.part('head', S.sphere(0.48, 1.0, 0.55, 1.0), INK_DARK, { p: [0, headY - 0.2, 0.04] });
  rb.part('head', S.plate(0.5, 0.06, 0.08, 0.025), VIOLET, { bucket: 'glow', p: [0, headY - 0.02, 0.45], boost: 1.6, noOutline: true });
  eyes(rb, 'head', headY + 0.12, 0.42, 0.19, 0.075, VIOLET, 2.8);
  for (const sx of [1, -1]) rb.part('head', S.plate(0.24, 0.045, 0.05, 0.015), INK_DARK, { p: [sx * 0.2, headY + 0.27, 0.42], r: [0, 0, sx * 0.35], noOutline: true });
  rb.part('head', S.sphere(0.58, 1.02, 1.0, 1.0), INK, { p: [0, headY + 0.17, -0.22], grad: [0.8, 1.15] });
  rb.part('head', S.torus(0.46, 0.08, 22), INK_DARK, { p: [0, headY + 0.34, 0.1], r: [0.2, 0, 0] });
  rb.part('head', S.torus(0.45, 0.06, 22), pal.main, { p: [0, headY + 0.24, 0.08], r: [0.05, 0, 0], noOutline: true });
  for (const sx of [1, -1]) {
    rb.part('head', S.cone(0.2, 0.7, 8), INK, { p: [sx * 0.36, headY + 0.78, -0.12], r: [-0.15, 0, -sx * 0.35] });
    rb.part('head', S.cone(0.11, 0.45, 8), VIOLET, { bucket: 'glow', p: [sx * 0.36, headY + 0.68, -0.05], r: [-0.15, 0, -sx * 0.35], boost: 1.1, noOutline: true });
  }
  strand(rb, ['tail1', 'tail2', 'tail3'], [[0, headY + 0.1, -0.55], [0, headY - 0.2, -0.85], [0, headY - 0.7, -1.05]], 0.55, 0.15, INK, 'x', 8);
  strand(rb, ['tail1', 'tail2', 'tail3'], [[0, headY + 0.1, -0.55], [0, headY - 0.2, -0.85], [0, headY - 0.7, -1.05]], 0.4, 0.1, INK_DARK, 'z', 8);

  // ---- twin daggers
  for (const sx of [1, -1]) {
    const bone = sx > 0 ? 'daggerL' : 'daggerR';
    const wr = sx > 0 ? J.wristL : J.wristR;
    const tilt = Math.PI / 2 + 0.3;
    rb.part(bone, S.blade(1.45, 0.24, 0.07, sx * 0.28, 0.55), SILVER, { bucket: 'metal', p: [wr[0], wr[1] - 0.12, wr[2] + 0.28], r: [tilt, 0, sx > 0 ? 0 : Math.PI], grad: [0.9, 1.15] });
    rb.part(bone, S.blade(1.38, 0.1, 0.1, sx * 0.28 * 1.38 / 1.45, 0.55), VIOLET, { bucket: 'glow', p: [wr[0], wr[1] - 0.12, wr[2] + 0.28], r: [tilt, 0, sx > 0 ? 0 : Math.PI], boost: 1.7, noOutline: true });
    rb.part(bone, S.plate(0.5, 0.1, 0.12, 0.04), INK_LIGHT, { bucket: 'metal', p: [wr[0], wr[1] - 0.1, wr[2] + 0.28] });
    rb.part(bone, S.sphere(0.1), VIOLET, { bucket: 'glow', p: [wr[0], wr[1] - 0.12, wr[2] - 0.05], boost: 2.2, noOutline: true });
  }

  // ---- long scarf and sash
  strand(rb, ['scarf1', 'scarf2', 'scarf3', 'scarf4', 'scarf5'], [[0, neckY - 0.05, -0.28], [0, neckY - 0.6, -0.5], [0, neckY - 1.2, -0.65], [0, neckY - 1.9, -0.75], [0, neckY - 2.5, -0.8]], 0.6, 0.3, (v) => (v > 0.88 ? VIOLET : pal.main), 'x', 14);
  strand(rb, ['scarf1', 'scarf2', 'scarf3', 'scarf4', 'scarf5'], [[0, neckY - 0.05, -0.28], [0, neckY - 0.6, -0.5], [0, neckY - 1.2, -0.65], [0, neckY - 1.9, -0.75], [0, neckY - 2.5, -0.8]], 0.4, 0.2, (v) => (v > 0.88 ? VIOLET : pal.dark), 'z', 14);
  rb.part('chest', S.torus(0.36, 0.12, 18), pal.main, { p: [0, neckY - 0.1, 0], r: [Math.PI / 2, 0, 0] });
  rb.cloth(['sash1', 'sash2', 'sash3'], 8, 2, (u, v) => [0.35 + v * 0.05 + (u - 0.5) * 0.3, hipY + 0.1 - v * 1.2, 0.5 + v * 0.05], (_u, v) => (v > 0.88 ? VIOLET : INK));

  const ch = rb.build(0x0d0b18, 0.04, true);
  const B = ch.bones;
  const group = new THREE.Group();
  group.add(ch.group);
  const scarf = new SpringChain([B.scarf1, B.scarf2, B.scarf3, B.scarf4, B.scarf5], 22, 3.5, 1.15);
  const tail = new SpringChain([B.tail1, B.tail2, B.tail3], 28, 4.5, 1.1);
  const sash = new SpringChain([B.sash1, B.sash2, B.sash3], 36, 5, 1);

  const anchors = {
    weaponTip: makeAnchor(rb, ch, 'daggerR', [J.wristR[0], J.wristR[1] - 0.4, 1.4]),
    weaponHead: makeAnchor(rb, ch, 'daggerR', [J.wristR[0], J.wristR[1] - 0.4, 1.0]),
    handR: makeAnchor(rb, ch, 'handR', [J.wristR[0], J.wristR[1], 0.1]),
    handL: makeAnchor(rb, ch, 'handL', [J.wristL[0], J.wristL[1], 0.1]),
    head: makeAnchor(rb, ch, 'head', [0, headY + 0.5, 0]),
    chest: makeAnchor(rb, ch, 'chest', [0, chestY, 0.3]),
    feet: makeAnchor(rb, ch, 'root', [0, 0.1, 0]),
  };

  function update(st: AnimState) {
    resetPose(ch);
    poseBiped(ch, st, { stride: 1.0, bounce: 0.1, armSwing: 0.35, lean: 0.34, armOut: 0.22, elbowRest: 0.7, crouch: 0.22, twist: 0.18, stance: 0.12, hipSway: 0.08 });
    const k = st.moveK;
    // idle: predatory crouch, daggers forward and low
    B.armL.rotation.x += -0.5 * (1 - k);
    B.armR.rotation.x += -0.5 * (1 - k);
    B.armL.rotation.z = 0.35;
    B.armR.rotation.z = -0.35;
    B.foreL.rotation.x = -0.9 - k * 0.3;
    B.foreR.rotation.x = -0.9 - k * 0.3;
    B.daggerL.rotation.x = -0.3;
    B.daggerR.rotation.x = -0.3;
    if (st.moveK > 0.5) {
      // daggers swept back while running
      B.armL.rotation.x = 0.4 + Math.sin(st.phase) * 0.35;
      B.armR.rotation.x = 0.4 - Math.sin(st.phase) * 0.35;
      B.foreL.rotation.x = -0.6;
      B.foreR.rotation.x = -0.6;
    }

    if (st.atk > 0) {
      const left = st.atkIdx % 2 === 1;
      const s = strike(st.atk);
      const wind = Math.max(0, -s);
      const hit = Math.max(0, s);
      const arm = left ? B.armL : B.armR;
      const fore = left ? B.foreL : B.foreR;
      const sgn = left ? 1 : -1;
      arm.rotation.x = -1.2 * hit - 0.3 * wind;
      arm.rotation.z = sgn * (1.1 * wind - 0.8 * hit);
      fore.rotation.x = -0.4 - 0.3 * wind;
      B.spine.rotation.y += -sgn * (0.7 * hit - 0.4 * wind);
      B.spine.rotation.x += 0.2 * hit;
      B.hips.position.z += 0.25 * hit;
    }
    if (st.cast > 0) {
      const t = st.cast;
      const up = ease(Math.min(1, t * 3)) * (1 - ease((t - 0.65) / 0.35));
      const s = st.castSlot;
      if (s === 0) {
        // dart throw with the right hand
        const wind = ease(Math.min(1, t / 0.35));
        const throwK = easeOut((t - 0.35) / 0.2);
        B.armR.rotation.x = -2.6 * wind * (1 - throwK) - 1.4 * throwK * (1 - ease((t - 0.7) / 0.3));
        B.armR.rotation.z = -0.3;
        B.foreR.rotation.x = -0.3;
        B.spine.rotation.y += -0.5 * wind * (1 - throwK) + 0.4 * throwK;
      } else if (s === 1) {
        B.armL.rotation.x = -1.4 * up;
        B.armR.rotation.x = -1.4 * up;
        B.armL.rotation.z = -0.9 * up;
        B.armR.rotation.z = 0.9 * up;
        B.hips.position.y -= 0.5 * up;
        B.spine.rotation.x += 0.5 * up;
        B.thighL.rotation.x -= 0.8 * up;
        B.thighR.rotation.x -= 0.8 * up;
        B.shinL.rotation.x += 1.0 * up;
        B.shinR.rotation.x += 1.0 * up;
      } else if (s === 2) {
        B.hips.rotation.y = easeOut(Math.min(1, t * 1.4)) * Math.PI * 4;
        B.armL.rotation.z = 1.4 * up;
        B.armR.rotation.z = -1.4 * up;
        B.armL.rotation.x = -0.2;
        B.armR.rotation.x = -0.2;
        B.hips.position.y -= 0.3 * up;
      } else {
        const lift = ease(Math.min(1, t / 0.5));
        B.armL.rotation.x = -1.3 * up;
        B.armR.rotation.x = -1.3 * up;
        B.armL.rotation.z = -0.6 * up;
        B.armR.rotation.z = 0.6 * up;
        B.foreL.rotation.x = -1.2 * up;
        B.foreR.rotation.x = -1.2 * up;
        B.hips.position.y += 0.7 * Math.sin(lift * Math.PI) * 0.5;
        B.spine.rotation.x += 0.4 * up;
      }
    }
    const sway = st.speed * 0.05 + st.leanX * 1.4;
    scarf.update(st.dt, sway + 0.06, st.leanZ * 1.2, 0.03 + k * 0.04, st.t);
    tail.update(st.dt, sway * 1.1 + 0.04, st.leanZ, 0.02, st.t);
    sash.update(st.dt, sway * 0.9, st.leanZ, 0.02, st.t);
  }

  return { group, height: 4.8, character: ch, update, anchors, extras: [] };
}
