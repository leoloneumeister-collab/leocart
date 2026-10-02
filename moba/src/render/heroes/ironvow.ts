/** Ironvow, the Oathbreaker: a horned plate-armour bruiser with an ember-runed warhammer and a tattered cape. */
import * as THREE from 'three';
import { ease, makeBiped, poseBiped, strike, easeOut } from '../biped.ts';
import type { AnimState } from '../biped.ts';
import { RigBuilder, SpringChain } from '../rig.ts';
import * as S from '../shapes.ts';
import { makeAnchor, teamPalette } from './common.ts';
import type { HeroModel } from './common.ts';

const STEEL = 0x7384a2;
const STEEL_DARK = 0x4d5a76;
const STEEL_LIGHT = 0xb4c2da;
const LEATHER = 0x84502c;
const LEATHER_DARK = 0x453848;
const BONE = 0xe6dcc2;
const EMBER = 0xff8a30;

export function buildIronvow(team: number): HeroModel {
  const pal = teamPalette(team);
  const rb = new RigBuilder();
  rb.rimColor = 0xffc890;
  const J = makeBiped(rb, { legLen: 1.85, thighFrac: 0.52, hipW: 0.46, torsoLen: 1.5, shoulderW: 1.28, armLen: 1.9, neckLen: 0.26 });
  const hipY = J.hip[1];
  const chestY = J.chest[1];
  const neckY = J.neck[1];
  const headY = J.head[1];

  // extra bones
  rb.bone('weapon', 'handR', J.wristR[0], J.wristR[1], 0.05);
  rb.bone('cape1', 'chest', 0, neckY - 0.1, -0.45).bone('cape2', 'cape1', 0, neckY - 0.7, -0.52).bone('cape3', 'cape2', 0, neckY - 1.25, -0.6).bone('cape4', 'cape3', 0, neckY - 1.8, -0.68);
  rb.bone('tab1', 'hips', 0, hipY + 0.12, 0.46).bone('tab2', 'tab1', 0, hipY - 0.45, 0.5).bone('tab3', 'tab2', 0, hipY - 0.95, 0.5);
  rb.bone('plume1', 'head', 0, headY + 0.52, -0.1).bone('plume2', 'plume1', 0, headY + 0.5, -0.5).bone('plume3', 'plume2', 0, headY + 0.2, -0.95);
  rb.bone('chain1', 'foreL', J.wristL[0] + 0.1, J.wristL[1] + 0.15, 0.12).bone('chain2', 'chain1', J.wristL[0] + 0.1, J.wristL[1] - 0.15, 0.12).bone('chain3', 'chain2', J.wristL[0] + 0.1, J.wristL[1] - 0.45, 0.12);

  // ---- pelvis, belt, legs
  rb.part('hips', S.plate(1.2, 0.5, 0.8, 0.14), STEEL_DARK, { bucket: 'metal', p: [0, hipY - 0.02, 0] });
  rb.part('hips', S.band([0, hipY + 0.05, 0], [0, hipY + 0.32, 0], 0.62, 0.6, 20), LEATHER, { s: [1, 1, 0.8] });
  rb.part('hips', S.plate(0.34, 0.3, 0.12, 0.05), STEEL_LIGHT, { bucket: 'metal', p: [0, hipY + 0.19, 0.55] });
  rb.part('hips', S.plate(0.18, 0.18, 0.1, 0.04), EMBER, { bucket: 'glow', p: [0, hipY + 0.19, 0.62], boost: 2.2 });
  for (const sx of [1, -1]) {
    rb.part('hips', S.plate(0.52, 0.78, 0.14, 0.06), STEEL, { bucket: 'metal', p: [sx * 0.4, hipY - 0.42, 0.42], r: [0.22, 0, sx * 0.12] });
    const thighBone = sx > 0 ? 'thighL' : 'thighR';
    const shinBone = sx > 0 ? 'shinL' : 'shinR';
    const footBone = sx > 0 ? 'footL' : 'footR';
    const hip: [number, number, number] = sx > 0 ? J.hipL : J.hipR;
    const knee: [number, number, number] = sx > 0 ? J.kneeL : J.kneeR;
    const ankle: [number, number, number] = sx > 0 ? J.ankleL : J.ankleR;
    rb.part(thighBone, S.limb(hip, knee, 0.4, 0.33), LEATHER_DARK);
    rb.part(thighBone, S.band([hip[0], hip[1] - 0.15, hip[2]], [knee[0], knee[1] + 0.15, knee[2]], 0.43, 0.36, 16, false), STEEL_DARK, { bucket: 'metal', s: [1, 1, 1.05] });
    rb.part(shinBone, S.sphere(0.3, 1, 1, 1.05), STEEL, { bucket: 'metal', p: [knee[0], knee[1], knee[2] + 0.06] });
    rb.part(shinBone, S.spike(0.09, 0.36), STEEL_LIGHT, { bucket: 'metal', p: [knee[0], knee[1], knee[2] + 0.3], r: [Math.PI / 2, 0, 0] });
    rb.part(shinBone, S.limb(knee, ankle, 0.3, 0.23), LEATHER_DARK);
    rb.part(shinBone, S.plate(0.5, 0.86, 0.42, 0.12), STEEL, { bucket: 'metal', p: [knee[0], (knee[1] + ankle[1]) / 2 + 0.02, 0.06], grad: [0.8, 1.1] });
    rb.part(shinBone, S.plate(0.16, 0.7, 0.1, 0.04), STEEL_LIGHT, { bucket: 'metal', p: [knee[0], (knee[1] + ankle[1]) / 2, 0.3] });
    rb.part(footBone, S.plate(0.52, 0.32, 0.95, 0.12), LEATHER, { p: [ankle[0], 0.17, 0.2] });
    rb.part(footBone, S.sphere(0.26, 1.05, 0.8, 1.1), STEEL, { bucket: 'metal', p: [ankle[0], 0.2, 0.55] });
  }

  // ---- torso
  rb.part('spine', S.band([0, hipY + 0.3, 0], [0, hipY + 0.95, 0], 0.55, 0.6, 18), LEATHER_DARK, { s: [1.05, 1, 0.78] });
  for (let i = 0; i < 3; i++) {
    const y = hipY + 0.5 + i * 0.27;
    rb.part('spine', S.plate(1.05 - i * 0.04, 0.3, 0.7 - i * 0.02, 0.1), STEEL, { bucket: 'metal', p: [0, y, 0.02], grad: [0.8, 1.1] });
  }
  rb.part('chest', S.sphere(0.78, 1.38, 1.0, 1.0), STEEL, { bucket: 'metal', p: [0, chestY + 0.12, 0.02], grad: [0.75, 1.15] });
  rb.part('chest', S.plate(0.9, 0.62, 0.22, 0.1), STEEL_LIGHT, { bucket: 'metal', p: [0, chestY + 0.22, 0.74], r: [-0.12, 0, 0] });
  rb.part('chest', S.gem(0.17, 1.3), EMBER, { bucket: 'glow', p: [0, chestY + 0.22, 0.88], boost: 2.4 });
  for (let i = 0; i < 4; i++) {
    const y = chestY + 0.62 - i * 0.34;
    rb.part('chest', S.plate(1.28 - i * 0.07, 0.36, 0.2, 0.09), i % 2 ? STEEL_DARK : STEEL, { bucket: 'metal', p: [0, y, -0.66 + i * 0.03], r: [0.12 * (i - 1.5), 0, 0] });
  }
  rb.part('chest', S.plate(0.1, 1.35, 0.06, 0.03), EMBER, { bucket: 'glow', p: [0, chestY + 0.1, -0.78], boost: 1.9 });
  for (let i = 0; i < 5; i++) {
    const a = (i / 4 - 0.5) * 2.2;
    rb.part('neck', S.spike(0.1, 0.42), BONE, { p: [Math.sin(a) * 0.55, neckY + 0.02, -Math.cos(a) * 0.5], r: [-0.8, 0, -a * 0.6] });
  }
  rb.part('neck', S.torus(0.46, 0.14, 24), STEEL_DARK, { bucket: 'metal', p: [0, neckY - 0.05, 0], r: [Math.PI / 2, 0, 0], s: [1, 1, 1.2] });
  rb.part('neck', S.band([0, neckY - 0.1, 0], [0, neckY + 0.3, 0], 0.28, 0.24, 12), LEATHER_DARK);

  // ---- arms and pauldrons
  for (const sx of [1, -1]) {
    const armBone = sx > 0 ? 'armL' : 'armR';
    const foreBone = sx > 0 ? 'foreL' : 'foreR';
    const handBone = sx > 0 ? 'handL' : 'handR';
    const sh: [number, number, number] = sx > 0 ? J.shoulderL : J.shoulderR;
    const el: [number, number, number] = sx > 0 ? J.elbowL : J.elbowR;
    const wr: [number, number, number] = sx > 0 ? J.wristL : J.wristR;
    const big = sx < 0 ? 1.12 : 1;
    // pauldron stack
    rb.part(armBone, S.sphere(0.66 * big, 1, 0.78, 1), STEEL, { bucket: 'metal', p: [sh[0] + sx * 0.1, sh[1] + 0.16, 0], grad: [0.75, 1.2] });
    rb.part(armBone, S.sphere(0.6 * big, 1, 0.5, 1), STEEL_DARK, { bucket: 'metal', p: [sh[0] + sx * 0.12, sh[1] - 0.14, 0] });
    rb.part(armBone, S.sphere(0.5 * big, 1, 0.42, 1), STEEL, { bucket: 'metal', p: [sh[0] + sx * 0.14, sh[1] - 0.4, 0] });
    rb.part(armBone, S.torus(0.62 * big, 0.06, 24), EMBER, { bucket: 'glow', p: [sh[0] + sx * 0.1, sh[1] + 0.14, 0], r: [Math.PI / 2 - 0.15 * sx, 0, 0.0], s: [1, 1, 0.8], boost: 1.5 });
    for (let i = 0; i < 3; i++) {
      const a = -0.35 + i * 0.5;
      rb.part(armBone, S.spike(0.13 * big, 0.55 * big), BONE, { p: [sh[0] + sx * (0.42 + i * 0.12), sh[1] + 0.52 - i * 0.08, a * 0.6], r: [a * 0.5, 0, -sx * (0.55 + i * 0.25)] });
    }
    rb.part(armBone, S.limb(sh, el, 0.3, 0.25), LEATHER);
    rb.part(foreBone, S.limb(el, wr, 0.25, 0.21), LEATHER);
    rb.part(foreBone, S.band([el[0], el[1] - 0.1, el[2]], [wr[0], wr[1] + 0.12, wr[2]], 0.3, 0.27, 16, true), STEEL, { bucket: 'metal', s: [1, 1, 1.05] });
    rb.part(foreBone, S.sphere(0.2), STEEL_LIGHT, { bucket: 'metal', p: [el[0], el[1] - 0.02, el[2] - 0.2] });
    rb.part(handBone, S.plate(0.36, 0.36, 0.4, 0.12), STEEL_DARK, { bucket: 'metal', p: [wr[0], wr[1] - 0.12, wr[2] + 0.05] });
    for (let i = 0; i < 3; i++) rb.part(handBone, S.spike(0.05, 0.14), STEEL_LIGHT, { bucket: 'metal', p: [wr[0] + (i - 1) * 0.1, wr[1] - 0.1, wr[2] + 0.28], r: [Math.PI / 2, 0, 0] });
  }

  // ---- head
  rb.part('head', S.sphere(0.5, 1, 1.08, 1.1), STEEL, { bucket: 'metal', p: [0, headY + 0.02, 0], grad: [0.78, 1.2] });
  rb.part('head', S.plate(0.64, 0.5, 0.26, 0.1), STEEL_DARK, { bucket: 'metal', p: [0, headY - 0.1, 0.42] });
  rb.part('head', S.plate(0.5, 0.07, 0.06, 0.02), EMBER, { bucket: 'glow', p: [0, headY + 0.0, 0.56], boost: 2.6 });
  rb.part('head', S.plate(0.14, 0.34, 0.1, 0.04), EMBER, { bucket: 'glow', p: [0, headY - 0.2, 0.56], boost: 1.6 });
  for (const sx of [1, -1]) {
    rb.part('head', S.plate(0.12, 0.5, 0.45, 0.05), STEEL_DARK, { bucket: 'metal', p: [sx * 0.48, headY - 0.12, 0.08], r: [0, 0, -sx * 0.1] });
    const hx = sx;
    rb.part(
      'head',
      S.taperTube(
        [
          [hx * 0.44, headY + 0.28, 0.0],
          [hx * 0.78, headY + 0.4, 0.04],
          [hx * 1.0, headY + 0.78, 0.1],
          [hx * 0.9, headY + 1.2, 0.26],
        ],
        0.13,
        0.025,
        10,
        18,
      ),
      BONE,
    );
    rb.part('head', S.torus(0.14, 0.04, 10), STEEL_LIGHT, { bucket: 'metal', p: [hx * 0.62, headY + 0.34, 0.02], r: [0, 1.1 * hx, 0] });
  }
  rb.part('head', S.plate(0.12, 0.2, 0.9, 0.05), STEEL_LIGHT, { bucket: 'metal', p: [0, headY + 0.5, -0.02] });

  // ---- warhammer
  const w = J.wristR;
  rb.part('weapon', S.band([w[0], w[1] - 0.6, 0.05], [w[0], w[1] + 1.85, 0.05], 0.085, 0.085, 10), 0x5a3a26);
  rb.part('weapon', S.band([w[0], w[1] - 0.25, 0.05], [w[0], w[1] + 0.25, 0.05], 0.11, 0.11, 12), LEATHER_DARK);
  rb.part('weapon', S.sphere(0.14), STEEL_LIGHT, { bucket: 'metal', p: [w[0], w[1] - 0.62, 0.05] });
  rb.part('weapon', S.plate(1.5, 0.9, 0.9, 0.14), STEEL, { bucket: 'metal', p: [w[0], w[1] + 2.0, 0.05], grad: [0.8, 1.15] });
  rb.part('weapon', S.plate(0.22, 0.95, 0.95, 0.08), STEEL_DARK, { bucket: 'metal', p: [w[0] + 0.78, w[1] + 2.0, 0.05] });
  rb.part('weapon', S.plate(0.22, 0.95, 0.95, 0.08), STEEL_DARK, { bucket: 'metal', p: [w[0] - 0.78, w[1] + 2.0, 0.05] });
  rb.part('weapon', S.plate(1.1, 0.07, 0.05, 0.02), EMBER, { bucket: 'glow', p: [w[0], w[1] + 2.15, 0.52], boost: 2.3 });
  rb.part('weapon', S.plate(0.7, 0.07, 0.05, 0.02), EMBER, { bucket: 'glow', p: [w[0], w[1] + 1.88, 0.52], boost: 2.0 });
  rb.part('weapon', S.plate(1.1, 0.07, 0.05, 0.02), EMBER, { bucket: 'glow', p: [w[0], w[1] + 2.15, -0.42], boost: 2.0 });
  rb.part('weapon', S.spike(0.2, 0.7), STEEL_LIGHT, { bucket: 'metal', p: [w[0], w[1] + 2.45, 0.05] });
  rb.part('weapon', S.sphere(0.2), EMBER, { bucket: 'glow', p: [w[0], w[1] + 1.52, 0.05], boost: 1.7 });

  // ---- cloth: cape, tabard, plume
  rb.cloth(
    ['cape1', 'cape2', 'cape3', 'cape4'],
    14,
    9,
    (u, v) => {
      const width = 1.3 + v * 0.8;
      const tatter = v > 0.72 ? (0.5 + 0.5 * Math.sin(u * Math.PI * 7 + 0.6)) * 0.42 * ((v - 0.72) / 0.28) ** 1.4 : 0;
      const drop = 2.0 * v - tatter * 0.9;
      const fold = Math.sin(u * Math.PI * 4.5) * 0.07 * v;
      return [(u - 0.5) * width, neckY - 0.1 - drop, -0.5 - v * 0.24 - Math.sin(u * Math.PI) * 0.1 + fold];
    },
    (u, v) => (v > 0.9 ? EMBER : v > 0.84 ? pal.dark : u > 0.46 && u < 0.54 ? pal.light : (Math.sin(u * Math.PI * 4.5) > 0.4 ? pal.dark : pal.main)),
  );
  rb.cloth(
    ['tab1', 'tab2', 'tab3'],
    8,
    5,
    (u, v) => [(u - 0.5) * (0.78 - v * 0.1), hipY + 0.12 - v * 1.1, 0.46 + v * 0.1 + Math.sin(u * Math.PI) * 0.05],
    (u, v) => (v > 0.9 ? EMBER : pal.main),
  );
  rb.cloth(
    ['plume1', 'plume2', 'plume3'],
    8,
    3,
    (u, v) => [(u - 0.5) * 0.22 * (1 - v * 0.5), headY + 0.52 - v * 0.2, -0.1 - v * 0.95],
    (u, v) => (v > 0.5 ? pal.dark : pal.main),
  );
  // hanging chain links
  for (let i = 0; i < 3; i++) {
    const bone = `chain${i + 1}`;
    const y = J.wristL[1] + 0.15 - i * 0.3;
    rb.part(bone, S.torus(0.1, 0.03, 12), STEEL_LIGHT, { bucket: 'metal', p: [J.wristL[0] + 0.1, y, 0.12], r: [0, i % 2 ? Math.PI / 2 : 0, 0] });
    rb.part(bone, S.torus(0.1, 0.03, 12), STEEL_LIGHT, { bucket: 'metal', p: [J.wristL[0] + 0.1, y - 0.13, 0.12], r: [0, i % 2 ? 0 : Math.PI / 2, 0] });
  }

  const ch = rb.build(0x15101c, 0.045, true);
  const B = ch.bones;
  const group = new THREE.Group();
  group.add(ch.group);
  const capeSpring = new SpringChain([B.cape1, B.cape2, B.cape3, B.cape4], 30, 5, 1);
  const tabSpring = new SpringChain([B.tab1, B.tab2, B.tab3], 40, 6, 0.8);
  const plumeSpring = new SpringChain([B.plume1, B.plume2, B.plume3], 36, 5, 1);
  const chainSpring = new SpringChain([B.chain1, B.chain2, B.chain3], 50, 7, 1);

  const anchors = {
    weaponTip: makeAnchor(rb, ch, 'weapon', [w[0], w[1] + 2.0, 0.05]),
    weaponHead: makeAnchor(rb, ch, 'weapon', [w[0], w[1] + 2.0, 0.05]),
    handR: makeAnchor(rb, ch, 'handR', [w[0], w[1], 0.05]),
    head: makeAnchor(rb, ch, 'head', [0, headY + 0.5, 0]),
    chest: makeAnchor(rb, ch, 'chest', [0, chestY, 0.3]),
    feet: makeAnchor(rb, ch, 'root', [0, 0.1, 0]),
  };

  function update(st: AnimState) {
    for (const k in ch.bones) {
      ch.bones[k].rotation.set(0, 0, 0);
      ch.bones[k].position.copy(ch.rest[k]);
    }
    poseBiped(ch, st, { stride: 0.78, bounce: 0.2, armSwing: 0.45, lean: 0.12, armOut: 0.2, elbowRest: 0.4, crouch: 0.12, twist: 0.1, stance: 0.1 });
    // hammer rests on the right shoulder: raise the arm, then counter-rotate the weapon so it stays upright
    B.armR.rotation.x = -0.95 + Math.sin(st.t * 1.6) * 0.02;
    B.armR.rotation.z = -0.25;
    B.foreR.rotation.x = -1.35 + st.moveK * Math.sin(st.phase * 2) * 0.05;
    B.weapon.rotation.x = 2.3 - 0.55;

    if (st.atk > 0) {
      const s = strike(st.atk);
      const wind = Math.max(0, -s);
      const hit = Math.max(0, s);
      B.armR.rotation.x = -2.9 * wind + 0.3 * hit - 0.5 * (1 - wind - hit);
      B.armR.rotation.z = -0.2;
      B.foreR.rotation.x = -0.9 * wind - 0.4;
      B.weapon.rotation.x = 0.4 + 1.2 * hit - 0.5 * wind;
      B.armL.rotation.x = -0.8 * wind - 0.6 * hit;
      B.spine.rotation.x += 0.7 * hit - 0.3 * wind;
      B.spine.rotation.y += -0.5 * hit + 0.3 * wind;
      B.hips.position.z += 0.35 * hit;
      B.hips.position.y -= 0.15 * hit;
    }
    if (st.cast > 0) {
      const t = st.cast;
      const slot = st.castSlot;
      const up = ease(Math.min(1, t * 3)) * (1 - ease((t - 0.6) / 0.4));
      if (slot === 0) {
        // lunge: hammer thrust forward and body low
        B.spine.rotation.x += 0.6 * up;
        B.armR.rotation.x = -1.6 * up;
        B.foreR.rotation.x = -0.4;
        B.weapon.rotation.x = 1.3;
        B.armL.rotation.x = 0.9 * up;
      } else if (slot === 1) {
        // guard: hammer across the chest
        B.armR.rotation.x = -1.1 * up;
        B.armR.rotation.z = 0.7 * up;
        B.foreR.rotation.x = -1.4 * up;
        B.armL.rotation.x = -1.0 * up;
        B.armL.rotation.z = -0.5 * up;
        B.foreL.rotation.x = -1.5 * up;
        B.weapon.rotation.z = 1.2 * up;
        B.weapon.rotation.x = 0.2;
        B.spine.rotation.x -= 0.1 * up;
      } else if (slot === 2) {
        // stomp: hammer raised then slammed
        const raise = ease(Math.min(1, t / 0.35));
        const slam = easeOut((t - 0.35) / 0.2);
        B.armR.rotation.x = -3.0 * raise * (1 - slam) - 0.2 * slam;
        B.armL.rotation.x = -2.8 * raise * (1 - slam);
        B.weapon.rotation.x = 0.4 + 0.9 * slam;
        B.spine.rotation.x += 0.7 * slam - 0.2 * raise;
        B.hips.position.y -= 0.35 * slam;
      } else {
        // ultimate: leap pose, both arms overhead
        B.armR.rotation.x = -2.9 * up;
        B.armL.rotation.x = -2.9 * up;
        B.foreR.rotation.x = -0.5;
        B.weapon.rotation.x = 0.3;
        B.spine.rotation.x += 0.3 * up;
        B.thighL.rotation.x = -0.9 * up;
        B.thighR.rotation.x = -0.4 * up;
        B.shinL.rotation.x = 1.0 * up;
        B.shinR.rotation.x = 1.2 * up;
      }
    }
    // secondary motion
    const sway = st.speed * 0.04 + st.leanX * 1.4;
    capeSpring.update(st.dt, sway + 0.04, st.leanZ * 1.2, 0.012 + st.moveK * 0.02, st.t);
    tabSpring.update(st.dt, sway * 0.7, st.leanZ * 0.6, 0.01, st.t);
    plumeSpring.update(st.dt, sway * 1.4 + 0.1, st.leanZ * 1.0, 0.02, st.t);
    chainSpring.update(st.dt, sway * 0.4, st.leanZ * 0.8 + Math.sin(st.t * 2) * 0.05, 0.03, st.t);
  }

  return { group, height: 4.7, character: ch, update, anchors, extras: [] };
}
