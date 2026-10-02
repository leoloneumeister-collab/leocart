/** Ysolde, the Ember Scholar: a slender pyromancer in a long plum coat, tall hat, ember staff and a floating spellbook. */
import * as THREE from 'three';
import { ease, easeOut, makeBiped, poseBiped, resetPose } from '../biped.ts';
import type { AnimState } from '../biped.ts';
import { RigBuilder, SpringChain } from '../rig.ts';
import * as S from '../shapes.ts';
import { eyes, keepUpright, makeAnchor, skirtPanel, strand, teamPalette } from './common.ts';
import type { HeroModel } from './common.ts';

const PLUM = 0x7a3a8e;
const PLUM_DARK = 0x4a2560;
const PLUM_LIGHT = 0xa86cc4;
const CREAM = 0xf6e9cc;
const GOLD = 0xf0bc4a;
const EMBER = 0xff7a28;
const SKIN = 0xf3c9a6;
const HAIR = 0xd2c8e4;
const BOOT = 0x3c2a3c;

export function buildYsolde(team: number): HeroModel {
  const pal = teamPalette(team);
  const rb = new RigBuilder();
  rb.rimColor = 0xffb070;
  const J = makeBiped(rb, { legLen: 1.7, thighFrac: 0.5, hipW: 0.3, torsoLen: 1.35, shoulderW: 0.8, armLen: 1.6, neckLen: 0.3 });
  const hipY = J.hip[1];
  const chestY = J.chest[1];
  const neckY = J.neck[1];
  const headY = J.head[1];

  // ---- extra bones
  rb.bone('weapon', 'handR', J.wristR[0], J.wristR[1], 0.05);
  rb.bone('book', 'handL', J.wristL[0] + 0.1, J.wristL[1] + 0.55, 0.55);
  rb.bone('orbit', 'root', 0, chestY + 0.2, 0);
  rb.bone('hat1', 'head', 0, headY + 0.95, -0.08).bone('hat2', 'hat1', 0, headY + 1.35, -0.2);
  rb.bone('hair1', 'head', 0, headY + 0.15, -0.46).bone('hair2', 'hair1', 0, headY - 0.3, -0.62).bone('hair3', 'hair2', 0, headY - 0.85, -0.7).bone('hair4', 'hair3', 0, headY - 1.4, -0.72);
  const skirtBones: Record<string, string[]> = { f: [], l: [], b: [], r: [] };
  const sectors: Record<string, number> = { f: 0, l: Math.PI / 2, b: Math.PI, r: -Math.PI / 2 };
  for (const k of ['f', 'l', 'b', 'r']) {
    const th = sectors[k];
    const R = 0.58;
    const px = Math.sin(th) * R;
    const pz = Math.cos(th) * R * 0.82;
    rb.bone(`sk${k}1`, 'hips', px, hipY + 0.12, pz).bone(`sk${k}2`, `sk${k}1`, px * 1.12, hipY - 0.4, pz * 1.12).bone(`sk${k}3`, `sk${k}2`, px * 1.25, hipY - 0.95, pz * 1.25);
    skirtBones[k] = [`sk${k}1`, `sk${k}2`, `sk${k}3`];
  }
  rb.bone('sash1', 'hips', -0.3, hipY + 0.1, 0.5).bone('sash2', 'sash1', -0.34, hipY - 0.5, 0.58).bone('sash3', 'sash2', -0.4, hipY - 1.1, 0.6);

  // ---- boots and legs (mostly hidden by the coat)
  for (const sx of [1, -1]) {
    const thigh = sx > 0 ? 'thighL' : 'thighR';
    const shin = sx > 0 ? 'shinL' : 'shinR';
    const foot = sx > 0 ? 'footL' : 'footR';
    const hip: [number, number, number] = sx > 0 ? J.hipL : J.hipR;
    const knee: [number, number, number] = sx > 0 ? J.kneeL : J.kneeR;
    const ankle: [number, number, number] = sx > 0 ? J.ankleL : J.ankleR;
    rb.part(thigh, S.limb(hip, knee, 0.27, 0.22), PLUM_DARK);
    rb.part(shin, S.limb(knee, ankle, 0.22, 0.18), PLUM_DARK);
    rb.part(shin, S.band([ankle[0], ankle[1] - 0.05, ankle[2]], [knee[0], knee[1] + 0.08, knee[2]], 0.25, 0.27, 16, true), BOOT, { grad: [0.85, 1.15] });
    rb.part(shin, S.torus(0.27, 0.05, 18), GOLD, { bucket: 'metal', p: [knee[0], knee[1] + 0.08, knee[2]], r: [Math.PI / 2, 0, 0] });
    rb.part(foot, S.plate(0.38, 0.28, 0.82, 0.12), BOOT, { p: [ankle[0], 0.16, 0.16] });
    rb.part(foot, S.sphere(0.2, 1, 0.8, 1.2), BOOT, { p: [ankle[0], 0.17, 0.5] });
    rb.part(foot, S.plate(0.4, 0.06, 0.3, 0.03), GOLD, { bucket: 'metal', p: [ankle[0], 0.25, 0.38] });
  }

  // ---- hips, belt, torso
  rb.part('hips', S.band([0, hipY - 0.05, 0], [0, hipY + 0.3, 0], 0.5, 0.46, 20), PLUM_DARK, { s: [1, 1, 0.78] });
  rb.part('hips', S.torus(0.5, 0.08, 24), GOLD, { bucket: 'metal', p: [0, hipY + 0.28, 0], r: [Math.PI / 2, 0, 0], s: [1, 0.78, 1] });
  rb.part('hips', S.gem(0.14, 1.2), EMBER, { bucket: 'glow', p: [0, hipY + 0.28, 0.42], boost: 2.4, noOutline: true });
  rb.part('spine', S.band([0, hipY + 0.3, 0], [0, hipY + 0.95, 0], 0.44, 0.4, 18), PLUM, { s: [1, 1, 0.78] });
  rb.part('chest', S.sphere(0.5, 1.15, 1.25, 0.8), PLUM, { p: [0, chestY + 0.05, 0.02], grad: [0.8, 1.15] });
  rb.part('chest', S.plate(0.5, 0.95, 0.08, 0.04), CREAM, { p: [0, chestY + 0.02, 0.4], r: [-0.08, 0, 0] });
  for (let i = 0; i < 3; i++) rb.part('chest', S.plate(0.08, 0.08, 0.06, 0.02), GOLD, { bucket: 'metal', p: [0, chestY + 0.3 - i * 0.28, 0.46] });
  rb.part('chest', S.gem(0.12, 1.4), EMBER, { bucket: 'glow', p: [0, chestY + 0.52, 0.5], boost: 2.2, noOutline: true });
  // stiff high collar standing behind the head
  for (const sx of [1, -1]) {
    rb.part('chest', S.plate(0.5, 0.95, 0.07, 0.04), PLUM_DARK, { p: [sx * 0.34, neckY + 0.22, -0.28], r: [-0.25, sx * 0.5, sx * -0.12] });
    rb.part('chest', S.plate(0.44, 0.07, 0.09, 0.03), GOLD, { bucket: 'metal', p: [sx * 0.36, neckY + 0.68, -0.4], r: [-0.25, sx * 0.5, sx * -0.12] });
  }
  rb.part('neck', S.band([0, neckY - 0.1, 0], [0, neckY + 0.3, 0], 0.2, 0.17, 12), SKIN);
  rb.part('neck', S.torus(0.3, 0.09, 20), CREAM, { p: [0, neckY - 0.05, 0], r: [Math.PI / 2, 0, 0] });

  // ---- arms with flared sleeves
  for (const sx of [1, -1]) {
    const armBone = sx > 0 ? 'armL' : 'armR';
    const foreBone = sx > 0 ? 'foreL' : 'foreR';
    const handBone = sx > 0 ? 'handL' : 'handR';
    const sh: [number, number, number] = sx > 0 ? J.shoulderL : J.shoulderR;
    const el: [number, number, number] = sx > 0 ? J.elbowL : J.elbowR;
    const wr: [number, number, number] = sx > 0 ? J.wristL : J.wristR;
    rb.part(armBone, S.sphere(0.34), PLUM_LIGHT, { p: [sh[0] + sx * 0.04, sh[1] + 0.05, 0] });
    rb.part(armBone, S.plate(0.5, 0.12, 0.5, 0.05), GOLD, { bucket: 'metal', p: [sh[0] + sx * 0.12, sh[1] + 0.28, 0], r: [0, 0, -sx * 0.35] });
    rb.part(armBone, S.gem(0.09, 1.2), EMBER, { bucket: 'glow', p: [sh[0] + sx * 0.12, sh[1] + 0.36, 0.2], boost: 2.2, noOutline: true });
    rb.part(armBone, S.limb(sh, el, 0.25, 0.2), PLUM);
    rb.part(foreBone, S.limb(el, wr, 0.2, 0.17), PLUM);
    rb.part(foreBone, S.band([el[0], el[1] - 0.2, el[2]], [wr[0], wr[1] - 0.12, wr[2]], 0.2, 0.36, 18, false), PLUM_LIGHT, { s: [1, 1, 1] });
    rb.part(foreBone, S.torus(0.34, 0.05, 20), GOLD, { bucket: 'metal', p: [wr[0], wr[1] - 0.12, wr[2]], r: [Math.PI / 2, 0, 0] });
    rb.part(handBone, S.sphere(0.17), SKIN, { p: [wr[0], wr[1] - 0.16, wr[2] + 0.04] });
    for (let i = 0; i < 3; i++) rb.part(handBone, S.sphere(0.06, 1, 1.4, 1), SKIN, { p: [wr[0] + (i - 1) * 0.07, wr[1] - 0.3, wr[2] + 0.08], noOutline: true });
  }

  // ---- head: face, hair, big hat
  rb.part('head', S.sphere(0.48, 1, 1.05, 1.0), SKIN, { p: [0, headY + 0.02, 0], grad: [0.9, 1.1], jitter: 0.02 });
  rb.part('head', S.sphere(0.075, 1, 1, 1.2), SKIN, { p: [0, headY - 0.06, 0.49], noOutline: true });
  eyes(rb, 'head', headY + 0.04, 0.44, 0.2, 0.075, EMBER, 2.4);
  for (const sx of [1, -1]) rb.part('head', S.plate(0.2, 0.04, 0.05, 0.015), PLUM_DARK, { p: [sx * 0.2, headY + 0.2, 0.44], r: [0, 0, -sx * 0.2], noOutline: true });
  rb.part('head', S.plate(0.13, 0.03, 0.04, 0.012), 0xc4604c, { p: [0, headY - 0.2, 0.45], noOutline: true });
  // hair cap and bangs
  rb.part('head', S.sphere(0.53, 1.0, 0.9, 1.0), HAIR, { p: [0, headY + 0.2, -0.12], grad: [0.88, 1.12] });
  for (const sx of [1, -1]) {
    rb.part('head', S.sphere(0.16, 0.8, 1.6, 0.8), HAIR, { p: [sx * 0.43, headY - 0.04, 0.12], r: [0.1, 0, sx * 0.2] });
    rb.part('head', S.sphere(0.15, 0.9, 0.7, 0.8), HAIR, { p: [sx * 0.2, headY + 0.36, 0.34], r: [0.3, 0, sx * 0.7] });
  }
  // hat: wide brim, body, bendy tip, ember band
  rb.part('head', S.sphere(1.05, 1, 0.09, 1, 24), PLUM_DARK, { p: [0, headY + 0.4, 0.04], r: [-0.08, 0, 0], grad: [0.9, 1.1] });
  rb.part('head', S.torus(1.02, 0.045, 36), GOLD, { bucket: 'metal', p: [0, headY + 0.41, 0.04], r: [Math.PI / 2 - 0.08, 0, 0], noOutline: true });
  rb.part('head', S.cone(0.52, 1.05, 18), PLUM, { p: [0, headY + 0.9, -0.02], grad: [0.85, 1.1] });
  rb.part('head', S.torus(0.5, 0.07, 22), pal.main, { p: [0, headY + 0.53, -0.02], r: [Math.PI / 2, 0, 0] });
  rb.part('head', S.gem(0.13, 1.3), EMBER, { bucket: 'glow', p: [0, headY + 0.55, 0.5], boost: 2.5, noOutline: true });
  rb.part('hat1', S.cone(0.28, 0.65, 14), PLUM, { p: [0, headY + 1.3, -0.1], r: [-0.3, 0, 0] });
  rb.part('hat2', S.sphere(0.1), EMBER, { bucket: 'glow', p: [0, headY + 1.8, -0.26], boost: 2.8, noOutline: true });
  // flowing ponytail with a ribbon
  strand(rb, ['hair1', 'hair2', 'hair3', 'hair4'], [[0, headY + 0.15, -0.46], [0, headY - 0.3, -0.62], [0, headY - 0.85, -0.7], [0, headY - 1.4, -0.72]], 0.5, 0.1, (v) => (v > 0.88 ? EMBER : HAIR), 'x', 10);
  strand(rb, ['hair1', 'hair2', 'hair3', 'hair4'], [[0, headY + 0.15, -0.46], [0, headY - 0.3, -0.62], [0, headY - 0.85, -0.7], [0, headY - 1.4, -0.72]], 0.5, 0.1, (v) => (v > 0.88 ? EMBER : HAIR), 'z', 10);
  rb.part('hair1', S.torus(0.14, 0.05, 12), pal.main, { p: [0, headY + 0.1, -0.48], r: [Math.PI / 2, 0, 0], noOutline: true });

  // ---- staff
  const w = J.wristR;
  rb.part('weapon', S.band([w[0], w[1] - 1.4, 0.05], [w[0], w[1] + 3.0, 0.05], 0.075, 0.075, 10), 0x6a3f2e);
  rb.part('weapon', S.band([w[0], w[1] - 0.2, 0.05], [w[0], w[1] + 0.2, 0.05], 0.1, 0.1, 10), PLUM_DARK);
  rb.part('weapon', S.sphere(0.12), GOLD, { bucket: 'metal', p: [w[0], w[1] - 1.42, 0.05] });
  rb.part('weapon', S.torus(0.38, 0.06, 22), GOLD, { bucket: 'metal', p: [w[0], w[1] + 3.15, 0.05], r: [0.5, 0.9, 0.2] });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    rb.part('weapon', S.spike(0.06, 0.55), GOLD, { bucket: 'metal', p: [w[0] + Math.cos(a) * 0.2, w[1] + 2.88, 0.05 + Math.sin(a) * 0.2], r: [Math.sin(a) * 0.5, 0, -Math.cos(a) * 0.5] });
  }
  rb.part('weapon', S.icosa(0.3, 1), EMBER, { bucket: 'glow', p: [w[0], w[1] + 3.15, 0.05], boost: 2.4, noOutline: true });

  // ---- floating spellbook + orbiting embers
  rb.part('book', S.plate(0.7, 0.1, 0.5, 0.04), PLUM_DARK, { p: [J.wristL[0] + 0.1, J.wristL[1] + 0.5, 0.55], r: [0.4, 0, 0] });
  rb.part('book', S.plate(0.62, 0.07, 0.42, 0.03), CREAM, { p: [J.wristL[0] + 0.1, J.wristL[1] + 0.56, 0.55], r: [0.4, 0, 0], noOutline: true });
  rb.part('book', S.plate(0.5, 0.02, 0.3, 0.01), EMBER, { bucket: 'glow', p: [J.wristL[0] + 0.1, J.wristL[1] + 0.6, 0.55], r: [0.4, 0, 0], boost: 1.6, noOutline: true });
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    rb.part('orbit', S.gem(0.12, 1.5), EMBER, { bucket: 'glow', p: [Math.cos(a) * 1.5, 0.35 * Math.sin(a * 2), Math.sin(a) * 1.5], boost: 2.6, noOutline: true });
  }

  // ---- coat skirts + sash
  const hem = (v: number) => (v > 0.92 ? GOLD : v > 0.86 ? PLUM_DARK : 0);
  skirtPanel(rb, skirtBones.f, -0.85, 0.85, hipY + 0.14, 1.15, 0.5, 0.82, 0.85, (u, v) => hem(v) || (u > 0.44 && u < 0.56 ? PLUM_LIGHT : PLUM));
  skirtPanel(rb, skirtBones.l, 0.85, 2.3, hipY + 0.14, 1.2, 0.5, 0.86, 0.85, (_u, v) => hem(v) || PLUM_DARK);
  skirtPanel(rb, skirtBones.r, -2.3, -0.85, hipY + 0.14, 1.2, 0.5, 0.86, 0.85, (_u, v) => hem(v) || PLUM_DARK);
  skirtPanel(rb, skirtBones.b, 2.3, 3.98, hipY + 0.14, 1.55, 0.5, 0.98, 0.9, (u, v) => hem(v) || (u > 0.45 && u < 0.55 ? pal.main : PLUM), 0.07);
  rb.cloth(['sash1', 'sash2', 'sash3'], 8, 2, (u, v) => [-0.3 - v * 0.1 + (u - 0.5) * 0.26, hipY + 0.12 - v * 1.2, 0.6 + v * 0.05], (_u, v) => (v > 0.88 ? GOLD : pal.main));

  const ch = rb.build(0x1a0f26, 0.04, true);
  const B = ch.bones;
  const group = new THREE.Group();
  group.add(ch.group);
  const sk: Record<string, SpringChain> = {};
  for (const k of ['f', 'l', 'b', 'r']) sk[k] = new SpringChain(skirtBones[k].map((n) => B[n]), 36, 6, 0.9);
  const hatSpring = new SpringChain([B.hat1, B.hat2], 28, 4, 1.2);
  const hairSpring = new SpringChain([B.hair1, B.hair2, B.hair3, B.hair4], 24, 4, 1.1);
  const sashSpring = new SpringChain([B.sash1, B.sash2, B.sash3], 36, 5, 1);

  const anchors = {
    weaponTip: makeAnchor(rb, ch, 'weapon', [w[0], w[1] + 3.15, 0.05]),
    weaponHead: makeAnchor(rb, ch, 'weapon', [w[0], w[1] + 3.15, 0.05]),
    handR: makeAnchor(rb, ch, 'handR', [w[0], w[1], 0.05]),
    handL: makeAnchor(rb, ch, 'handL', [J.wristL[0], J.wristL[1], 0.1]),
    head: makeAnchor(rb, ch, 'head', [0, headY + 0.5, 0]),
    chest: makeAnchor(rb, ch, 'chest', [0, chestY, 0.3]),
    feet: makeAnchor(rb, ch, 'root', [0, 0.1, 0]),
  };
  let orbitA = 0;

  function update(st: AnimState) {
    resetPose(ch);
    poseBiped(ch, st, { stride: 0.7, bounce: 0.14, armSwing: 0.35, lean: 0.1, armOut: 0.14, elbowRest: 0.25, twist: 0.1, stance: 0.04, hipSway: 0.09 });
    const k = st.moveK;
    // idle: staff planted forward-right, book hovering at the left hand
    B.armR.rotation.x = -0.3 + Math.sin(st.t * 1.4) * 0.02;
    B.armR.rotation.z = -0.32;
    B.foreR.rotation.x = -0.5;
    B.armL.rotation.x = -0.7 + Math.sin(st.t * 1.2 + 1) * 0.03 + 0.3 * Math.sin(st.phase) * k;
    B.foreL.rotation.x = -1.0;
    B.book.position.y = ch.rest.book.y + Math.sin(st.t * 2.3) * 0.08;
    B.book.rotation.y = Math.sin(st.t * 1.1) * 0.2;
    let lift = 0;
    let orbitSpeed = 1.2;
    let orbitR = 1;

    if (st.atk > 0) {
      const t = st.atk;
      const wind = 1 - ease(t / 0.3);
      const hit = t < 0.3 ? 0 : t < 0.55 ? easeOut((t - 0.3) / 0.25) : 1 - ease((t - 0.55) / 0.45);
      B.armR.rotation.x = -0.45 - 0.9 * hit + 0.5 * wind * (t < 0.3 ? 1 : 0);
      B.foreR.rotation.x = -0.55 + 0.1 * hit;
      B.spine.rotation.x += 0.15 * hit - 0.1 * wind;
      B.spine.rotation.y += -0.25 * hit;
      orbitSpeed += 4 * hit;
    }
    if (st.cast > 0) {
      const t = st.cast;
      const up = ease(Math.min(1, t * 3)) * (1 - ease((t - 0.62) / 0.38));
      const s = st.castSlot;
      if (s === 0) {
        B.armR.rotation.x = -1.4 * up - 0.45 * (1 - up);
        B.foreR.rotation.x = -0.2;
        B.armR.rotation.z = 0.05;
        B.spine.rotation.x += 0.18 * up;
        B.armL.rotation.x = -1.2 * up;
        orbitSpeed += 5 * up;
      } else if (s === 1) {
        B.armR.rotation.x = -2.5 * up;
        B.armL.rotation.x = -2.2 * up;
        B.armL.rotation.z = 0.4 * up;
        B.foreL.rotation.x = -0.4;
        B.spine.rotation.x -= 0.18 * up;
        orbitSpeed += 6 * up;
        orbitR += 0.5 * up;
      } else if (s === 2) {
        B.armR.rotation.z = -1.1 * up;
        B.armL.rotation.z = 1.1 * up;
        B.armR.rotation.x = -0.2;
        B.armL.rotation.x = -0.2;
        B.spine.rotation.y += Math.sin(up * Math.PI) * 1.1;
        B.hips.position.y -= 0.12 * up;
        orbitSpeed += 9 * up;
        orbitR += 0.6 * up;
      } else {
        const rise = ease(Math.min(1, t * 2.4)) * (1 - ease((t - 0.85) / 0.15));
        lift = 0.55 * rise;
        B.armR.rotation.x = -2.8 * up;
        B.armR.rotation.z = -0.3 * up;
        B.armL.rotation.x = -2.5 * up;
        B.armL.rotation.z = 0.5 * up;
        B.foreR.rotation.x = -0.2;
        B.foreL.rotation.x = -0.3;
        B.spine.rotation.x -= 0.25 * up;
        B.head.rotation.x = -0.25 * up;
        orbitSpeed += 8 * up;
        orbitR += 1.2 * up;
        B.thighL.rotation.x += 0.2 * up;
        B.thighR.rotation.x -= 0.1 * up;
      }
    }
    // keep the staff pointing along the arm line, tilted slightly outward
    keepUpright(B, 'R', 0.2, 0);
    if (st.atk > 0 || st.cast > 0) B.weapon.rotation.x += st.cast > 0 && st.castSlot === 0 ? -0.9 : 0;
    B.hips.position.y += lift;
    B.orbit.position.y = ch.rest.orbit.y + Math.sin(st.t * 2) * 0.1 - lift * 0;
    orbitA += st.dt * orbitSpeed;
    B.orbit.rotation.y = orbitA;
    B.orbit.scale.setScalar(orbitR);

    // secondary motion: everything trails behind the movement (positive x swings backward)
    const sway = st.speed * 0.045 + st.leanX * 1.4;
    sk.f.update(st.dt, sway * 0.5 - 0.12 * k, st.leanZ, 0.01 + k * 0.012, st.t);
    sk.b.update(st.dt, sway * 1.2 + 0.05, st.leanZ, 0.012 + k * 0.02, st.t + 1);
    sk.l.update(st.dt, sway * 0.7, st.leanZ + 0.08 * k, 0.01, st.t + 2);
    sk.r.update(st.dt, sway * 0.7, st.leanZ - 0.08 * k, 0.01, st.t + 3);
    hatSpring.update(st.dt, sway * 1.1, st.leanZ * 1.2, 0.02, st.t);
    hairSpring.update(st.dt, sway * 1.4 + 0.1, st.leanZ * 1.4, 0.03 + k * 0.03, st.t);
    sashSpring.update(st.dt, sway * 0.9, st.leanZ, 0.02, st.t);
  }

  return { group, height: 5.0, character: ch, update, anchors, extras: [] };
}
