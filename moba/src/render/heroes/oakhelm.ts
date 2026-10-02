/** Oakhelm, the Rootwarden: a walking old-growth guardian with bark armour, stone shoulders, antlers, a mossy beard and a glowing heartwood core. */
import * as THREE from 'three';
import { ease, easeOut, makeBiped, poseBiped, resetPose, strike } from '../biped.ts';
import type { AnimState } from '../biped.ts';
import { RigBuilder, SpringChain } from '../rig.ts';
import * as S from '../shapes.ts';
import { eyes, makeAnchor, strand, teamPalette } from './common.ts';
import type { HeroModel } from './common.ts';

const BARK = 0x7c5538;
const BARK_DARK = 0x56392a;
const BARK_LIGHT = 0xb48a62;
const MOSS = 0x6cb44c;
const MOSS_DARK = 0x3f7a34;
const STONE = 0x727c82;
const AMBER = 0xffb83c;
const LEAF = 0x8bd25a;
const SHROOM = 0xd8503c;
const CREAM = 0xf0e6c8;

const LEAF_SHAPE: [number, number][] = [[0, 0], [0.18, 0.2], [0.2, 0.5], [0.1, 0.85], [0, 1.0], [-0.1, 0.85], [-0.2, 0.5], [-0.18, 0.2]];

export function buildOakhelm(team: number): HeroModel {
  const pal = teamPalette(team);
  const rb = new RigBuilder();
  rb.rimColor = 0xc8ff90;
  const J = makeBiped(rb, { legLen: 1.5, thighFrac: 0.45, hipW: 0.62, torsoLen: 1.7, shoulderW: 1.5, armLen: 2.3, neckLen: 0.5 });
  const hipY = J.hip[1];
  const chestY = J.chest[1];
  const neckY = J.neck[1];
  const headY = J.head[1];

  rb.bone('beard1', 'head', 0, headY - 0.3, 0.4).bone('beard2', 'beard1', 0, headY - 0.75, 0.46).bone('beard3', 'beard2', 0, headY - 1.2, 0.5);
  rb.bone('sap1', 'chest', 0.35, neckY - 0.1, -0.85).bone('sap2', 'sap1', 0.4, neckY + 0.6, -0.95).bone('sap3', 'sap2', 0.35, neckY + 1.3, -0.9);
  rb.bone('vl1', 'armL', J.shoulderL[0] + 0.1, J.shoulderL[1] - 0.2, 0.3).bone('vl2', 'vl1', J.shoulderL[0] + 0.15, J.shoulderL[1] - 0.9, 0.35).bone('vl3', 'vl2', J.shoulderL[0] + 0.2, J.shoulderL[1] - 1.6, 0.35);
  rb.bone('vr1', 'armR', J.shoulderR[0] - 0.1, J.shoulderR[1] - 0.2, -0.3).bone('vr2', 'vr1', J.shoulderR[0] - 0.15, J.shoulderR[1] - 0.8, -0.35).bone('vr3', 'vr2', J.shoulderR[0] - 0.2, J.shoulderR[1] - 1.3, -0.35);
  rb.bone('weapon', 'handR', J.wristR[0], J.wristR[1], 0.1);

  // ---- legs: trunk-like with root toes
  for (const sx of [1, -1]) {
    const thigh = sx > 0 ? 'thighL' : 'thighR';
    const shin = sx > 0 ? 'shinL' : 'shinR';
    const foot = sx > 0 ? 'footL' : 'footR';
    const hip: [number, number, number] = sx > 0 ? J.hipL : J.hipR;
    const knee: [number, number, number] = sx > 0 ? J.kneeL : J.kneeR;
    const ankle: [number, number, number] = sx > 0 ? J.ankleL : J.ankleR;
    rb.part(thigh, S.limb(hip, knee, 0.55, 0.46), BARK, { grad: [0.8, 1.15] });
    rb.part(thigh, S.sphere(0.3, 1.2, 0.7, 1), MOSS, { p: [hip[0] + sx * 0.2, hip[1] - 0.3, 0.3], noOutline: true });
    rb.part(shin, S.sphere(0.5), BARK_DARK, { p: [knee[0], knee[1], knee[2] + 0.05] });
    rb.part(shin, S.limb(knee, ankle, 0.46, 0.4), BARK, { grad: [0.8, 1.15] });
    for (let i = 0; i < 2; i++) rb.part(shin, S.torus(0.44 - i * 0.04, 0.07, 18), BARK_DARK, { p: [knee[0], knee[1] - 0.3 - i * 0.35, knee[2]], r: [Math.PI / 2, 0, 0] });
    rb.part(foot, S.plate(0.85, 0.36, 1.2, 0.16), BARK_DARK, { p: [ankle[0], 0.2, 0.25] });
    for (let i = 0; i < 3; i++) rb.part(foot, S.spike(0.12, 0.55), BARK_LIGHT, { p: [ankle[0] + (i - 1) * 0.28, 0.2, 0.75], r: [Math.PI / 2 - 0.1, 0, 0] });
  }

  // ---- hips with a ring of leaves
  rb.part('hips', S.band([0, hipY - 0.2, 0], [0, hipY + 0.35, 0], 0.72, 0.68, 20), BARK_DARK, { s: [1.1, 1, 0.85] });
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    rb.part('hips', S.extrudeShape(LEAF_SHAPE, 0.035, 0.01), i % 2 ? LEAF : MOSS, { p: [Math.sin(a) * 0.82, hipY + 0.1, Math.cos(a) * 0.62], r: [Math.PI - 0.5 * Math.cos(a), a, 0], s: [0.9, 0.95, 1], noOutline: true });
  }

  // ---- torso: barrel with bark plates and glowing heartwood
  rb.part('spine', S.sphere(0.8, 1.2, 1.0, 0.95), BARK, { p: [0, hipY + 0.75, 0], grad: [0.75, 1.15] });
  rb.part('chest', S.sphere(1.0, 1.3, 0.88, 0.95), BARK, { p: [0, chestY - 0.05, -0.02], grad: [0.75, 1.15] });
  for (let i = 0; i < 4; i++) {
    const y = chestY - 0.35 + i * 0.36;
    rb.part('chest', S.plate(1.3 - Math.abs(i - 1.5) * 0.15, 0.3, 0.3, 0.1), i % 2 ? BARK_DARK : BARK_LIGHT, { p: [0, y, 0.82 - Math.abs(i - 1.5) * 0.1], r: [-0.08, 0, 0.05 * (i - 1.5)] });
  }
  rb.part('chest', S.sphere(0.5, 1.0, 1.0, 0.5), BARK_DARK, { p: [0, chestY + 0.3, 0.8], noOutline: true });
  rb.part('chest', S.torus(0.42, 0.1, 20), BARK_LIGHT, { p: [0, chestY + 0.3, 0.9] });
  rb.part('chest', S.icosa(0.28, 1), AMBER, { bucket: 'glow', p: [0, chestY + 0.3, 0.9], boost: 2.6, noOutline: true });
  for (let i = 0; i < 3; i++) rb.part('chest', S.plate(0.05, 0.5, 0.05, 0.02), AMBER, { bucket: 'glow', p: [(i - 1) * 0.55, chestY + 0.3 - Math.abs(i - 1) * 0.2, 0.92], r: [0, 0, (i - 1) * 0.7], boost: 1.7, noOutline: true });
  rb.part('chest', S.sphere(0.6, 1.2, 0.35, 0.4), MOSS_DARK, { p: [-0.1, chestY + 0.35, -0.85], r: [0.3, 0, 0], noOutline: true });

  // ---- shoulders: mossy boulders with mushrooms
  for (const sx of [1, -1]) {
    const armBone = sx > 0 ? 'armL' : 'armR';
    const foreBone = sx > 0 ? 'foreL' : 'foreR';
    const handBone = sx > 0 ? 'handL' : 'handR';
    const sh: [number, number, number] = sx > 0 ? J.shoulderL : J.shoulderR;
    const el: [number, number, number] = sx > 0 ? J.elbowL : J.elbowR;
    const wr: [number, number, number] = sx > 0 ? J.wristL : J.wristR;
    rb.part(armBone, S.icosa(0.78, 2), STONE, { p: [sh[0] + sx * 0.1, sh[1] + 0.2, 0], s: [1, 0.85, 1], grad: [0.75, 1.15], jitter: 0.12 });
    rb.part(armBone, S.sphere(0.6, 1.1, 0.4, 1), MOSS, { p: [sh[0] + sx * 0.1, sh[1] + 0.62, 0], noOutline: true });
    rb.part(armBone, S.limb(sh, el, 0.5, 0.42), BARK, { grad: [0.8, 1.15] });
    rb.part(foreBone, S.limb(el, wr, 0.44, 0.5), BARK, { grad: [0.8, 1.15] });
    for (let i = 0; i < 3; i++) rb.part(foreBone, S.torus(0.5 + i * 0.01, 0.07, 18), BARK_DARK, { p: [el[0], el[1] - 0.45 - i * 0.4, el[2]], r: [Math.PI / 2, 0, 0] });
    rb.part(foreBone, S.plate(0.16, 0.6, 0.1, 0.04), AMBER, { bucket: 'glow', p: [wr[0], wr[1] + 0.7, wr[2] + 0.5], boost: 1.8, noOutline: true });
    rb.part(handBone, S.sphere(0.58, 1, 0.95, 1), BARK, { p: [wr[0], wr[1] - 0.3, wr[2] + 0.1], grad: [0.8, 1.15] });
    for (let i = 0; i < 4; i++) rb.part(handBone, S.spike(0.1, 0.42), BARK_LIGHT, { p: [wr[0] + (i - 1.5) * 0.24, wr[1] - 0.2, wr[2] + 0.55], r: [Math.PI / 2 - 0.2, 0, 0] });
  }
  for (let i = 0; i < 3; i++) {
    const x = J.shoulderL[0] + 0.2 + i * 0.22;
    const h = 0.4 + (i % 2) * 0.2;
    rb.part('armL', S.cyl(0.06, 0.08, h, 8), CREAM, { p: [x, J.shoulderL[1] + 0.7 + h / 2 - 0.1, 0.2 - i * 0.15], noOutline: true });
    rb.part('armL', S.sphere(0.2 - i * 0.03, 1, 0.6, 1), SHROOM, { p: [x, J.shoulderL[1] + 0.75 + h, 0.2 - i * 0.15], noOutline: true });
  }

  // ---- head: carved face, beard, antlers
  rb.part('neck', S.cyl(0.42, 0.5, 0.7, 12), BARK_DARK, { p: [0, neckY + 0.15, 0] });
  rb.part('head', S.sphere(0.58, 1, 0.95, 0.95), BARK_LIGHT, { p: [0, headY + 0.05, 0], grad: [0.8, 1.15] });
  rb.part('head', S.plate(0.9, 0.16, 0.2, 0.06), BARK_DARK, { p: [0, headY + 0.18, 0.5], r: [-0.1, 0, 0] });
  rb.part('head', S.sphere(0.12, 1, 1.6, 1), BARK, { p: [0, headY - 0.05, 0.6], noOutline: true });
  eyes(rb, 'head', headY + 0.08, 0.52, 0.23, 0.1, AMBER, 2.8);
  rb.part('head', S.plate(0.36, 0.05, 0.05, 0.02), AMBER, { bucket: 'glow', p: [0, headY - 0.3, 0.55], boost: 1.6, noOutline: true });
  rb.part('head', S.sphere(0.6, 1.0, 0.45, 1.0), MOSS, { p: [0, headY + 0.4, -0.1], noOutline: true });
  strand(rb, ['beard1', 'beard2', 'beard3'], [[0, headY - 0.3, 0.42], [0, headY - 0.75, 0.5], [0, headY - 1.2, 0.54]], 1.0, 0.25, (v) => (v > 0.6 ? MOSS_DARK : MOSS), 'x', 8);
  strand(rb, ['beard1', 'beard2', 'beard3'], [[0, headY - 0.3, 0.42], [0, headY - 0.75, 0.5], [0, headY - 1.2, 0.54]], 0.6, 0.15, (v) => (v > 0.6 ? MOSS_DARK : MOSS), 'z', 8);
  for (const sx of [1, -1]) {
    const m = [[sx * 0.42, headY + 0.35, -0.05], [sx * 0.75, headY + 0.75, -0.1], [sx * 0.95, headY + 1.3, -0.05], [sx * 0.8, headY + 1.9, 0.05]] as [number, number, number][];
    rb.part('head', S.taperTube(m, 0.16, 0.05, 8, 20), BARK_DARK);
    rb.part('head', S.taperTube([[sx * 0.8, headY + 0.85, -0.1], [sx * 1.25, headY + 1.05, -0.05], [sx * 1.5, headY + 1.45, 0.0]], 0.1, 0.03, 8, 12), BARK_DARK);
    rb.part('head', S.taperTube([[sx * 0.95, headY + 1.3, -0.05], [sx * 0.55, headY + 1.55, 0.1], [sx * 0.45, headY + 2.0, 0.15]], 0.09, 0.03, 8, 12), BARK_DARK);
    for (const [px, py] of [[1.5, 1.45], [0.8, 1.9], [0.45, 2.0]]) rb.part('head', S.sphere(0.08), AMBER, { bucket: 'glow', p: [sx * px, headY + py + 0.04, 0.02], boost: 2.4, noOutline: true });
    rb.part('head', S.extrudeShape(LEAF_SHAPE, 0.03, 0.01), LEAF, { p: [sx * 0.95, headY + 1.2, 0.05], r: [0, 0, -sx * 0.9], s: [0.45, 0.45, 1], noOutline: true });
    rb.part('head', S.extrudeShape(LEAF_SHAPE, 0.03, 0.01), MOSS, { p: [sx * 0.7, headY + 0.75, 0.05], r: [0, 0, sx * 0.9], s: [0.4, 0.4, 1], noOutline: true });
  }

  // ---- sapling on the back + hanging vines
  rb.part('sap1', S.taperTube([[0.35, neckY - 0.1, -0.85], [0.4, neckY + 0.6, -0.95]], 0.14, 0.1, 8, 8), BARK_DARK);
  rb.part('sap2', S.taperTube([[0.4, neckY + 0.6, -0.95], [0.35, neckY + 1.3, -0.9]], 0.1, 0.06, 8, 8), BARK_DARK);
  rb.part('sap3', S.sphere(0.4, 1, 0.8, 1), LEAF, { p: [0.35, neckY + 1.5, -0.9], noOutline: true });
  rb.part('sap3', S.sphere(0.28, 1, 0.8, 1), MOSS, { p: [0.65, neckY + 1.3, -0.8], noOutline: true });
  rb.part('sap2', S.sphere(0.3, 1, 0.8, 1), MOSS_DARK, { p: [0.1, neckY + 1.0, -1.0], noOutline: true });
  strand(rb, ['vl1', 'vl2', 'vl3'], [[J.shoulderL[0] + 0.1, J.shoulderL[1] - 0.2, 0.3], [J.shoulderL[0] + 0.15, J.shoulderL[1] - 0.9, 0.35], [J.shoulderL[0] + 0.2, J.shoulderL[1] - 1.6, 0.35]], 0.35, 0.15, (v) => (v > 0.85 ? AMBER : MOSS_DARK), 'z', 8);
  strand(rb, ['vr1', 'vr2', 'vr3'], [[J.shoulderR[0] - 0.1, J.shoulderR[1] - 0.2, -0.3], [J.shoulderR[0] - 0.15, J.shoulderR[1] - 0.8, -0.35], [J.shoulderR[0] - 0.2, J.shoulderR[1] - 1.3, -0.35]], 0.35, 0.15, (v) => (v > 0.85 ? AMBER : MOSS_DARK), 'z', 8);
  // team banner strip on the belt
  rb.part('hips', S.plate(0.4, 0.9, 0.08, 0.03), pal.main, { p: [0, hipY - 0.35, 0.78] });
  rb.part('hips', S.plate(0.44, 0.08, 0.1, 0.03), AMBER, { bucket: 'glow', p: [0, hipY - 0.8, 0.8], boost: 1.5, noOutline: true });

  const ch = rb.build(0x1a1208, 0.055, true);
  const B = ch.bones;
  const group = new THREE.Group();
  group.add(ch.group);
  const beard = new SpringChain([B.beard1, B.beard2, B.beard3], 26, 5, 1);
  const sap = new SpringChain([B.sap1, B.sap2, B.sap3], 20, 3.5, 1.1);
  const vineL = new SpringChain([B.vl1, B.vl2, B.vl3], 30, 5, 1);
  const vineR = new SpringChain([B.vr1, B.vr2, B.vr3], 30, 5, 1);

  const anchors = {
    weaponTip: makeAnchor(rb, ch, 'handR', [J.wristR[0], J.wristR[1] - 0.3, 0.6]),
    weaponHead: makeAnchor(rb, ch, 'handR', [J.wristR[0], J.wristR[1] - 0.3, 0.6]),
    handR: makeAnchor(rb, ch, 'handR', [J.wristR[0], J.wristR[1] - 0.3, 0.1]),
    handL: makeAnchor(rb, ch, 'handL', [J.wristL[0], J.wristL[1] - 0.3, 0.1]),
    head: makeAnchor(rb, ch, 'head', [0, headY + 1.2, 0]),
    chest: makeAnchor(rb, ch, 'chest', [0, chestY + 0.3, 0.9]),
    feet: makeAnchor(rb, ch, 'root', [0, 0.1, 0]),
  };

  function update(st: AnimState) {
    resetPose(ch);
    poseBiped(ch, st, { stride: 0.55, bounce: 0.14, armSwing: 0.5, lean: 0.06, armOut: 0.28, elbowRest: 0.5, crouch: 0.18, twist: 0.08, stance: 0.1, hipSway: 0.1 });
    B.chest.scale.setScalar(1 + Math.sin(st.t * 1.5) * 0.012);
    const k = st.moveK;
    if (st.atk > 0) {
      const left = st.atkIdx % 2 === 1;
      const s = strike(st.atk);
      const wind = Math.max(0, -s);
      const hit = Math.max(0, s);
      const arm = left ? B.armL : B.armR;
      const fore = left ? B.foreL : B.foreR;
      arm.rotation.x = -2.5 * wind + 0.2 * hit;
      arm.rotation.z = (left ? 0.2 : -0.2) * (1 - hit);
      fore.rotation.x = -0.6 * wind - 0.2;
      B.spine.rotation.x += 0.45 * hit - 0.2 * wind;
      B.spine.rotation.y += (left ? 0.4 : -0.4) * hit;
      B.hips.position.z += 0.25 * hit;
      B.hips.position.y -= 0.12 * hit;
    }
    if (st.cast > 0) {
      const t = st.cast;
      const up = ease(Math.min(1, t * 3)) * (1 - ease((t - 0.65) / 0.35));
      const s = st.castSlot;
      if (s === 0) {
        const punch = easeOut(Math.min(1, t * 3));
        B.armL.rotation.x = -1.7 * punch * (1 - ease((t - 0.7) / 0.3));
        B.armR.rotation.x = -1.7 * punch * (1 - ease((t - 0.7) / 0.3));
        B.spine.rotation.x += 0.4 * up;
        B.hips.position.y -= 0.2 * up;
      } else if (s === 1) {
        B.armL.rotation.x = -1.0 * up;
        B.armR.rotation.x = -1.0 * up;
        B.armL.rotation.z = -0.6 * up;
        B.armR.rotation.z = 0.6 * up;
        B.foreL.rotation.x = -1.8 * up;
        B.foreR.rotation.x = -1.8 * up;
        B.spine.rotation.x += 0.25 * up;
        B.chest.scale.setScalar(1 + 0.08 * up);
        B.hips.position.y -= 0.3 * up;
      } else if (s === 2) {
        const lift = ease(Math.min(1, t / 0.35));
        const slam = easeOut((t - 0.35) / 0.15);
        B.armL.rotation.x = -2.4 * lift * (1 - slam);
        B.armR.rotation.x = -2.4 * lift * (1 - slam);
        B.hips.position.y += 0.8 * lift * (1 - slam) - 0.2 * slam * (1 - ease((t - 0.7) / 0.3));
        B.thighL.rotation.x -= 0.5 * lift * (1 - slam);
        B.thighR.rotation.x -= 0.5 * lift * (1 - slam);
        B.spine.rotation.x += 0.5 * slam;
      } else {
        const lift = ease(Math.min(1, t / 0.45));
        const slam = easeOut((t - 0.45) / 0.15);
        B.armL.rotation.x = -3.0 * lift * (1 - slam) + 0.3 * slam;
        B.armR.rotation.x = -3.0 * lift * (1 - slam) + 0.3 * slam;
        B.armL.rotation.z = 0.35 * lift;
        B.armR.rotation.z = -0.35 * lift;
        B.spine.rotation.x += -0.2 * lift + 0.7 * slam;
        B.head.rotation.x = -0.3 * lift;
        B.hips.position.y -= 0.4 * slam;
      }
    }
    const sway = st.speed * 0.03 + st.leanX * 1.2;
    beard.update(st.dt, sway + 0.04, st.leanZ, 0.02, st.t);
    sap.update(st.dt, sway * 1.3, st.leanZ * 1.2, 0.025 + k * 0.02, st.t);
    vineL.update(st.dt, sway, st.leanZ + 0.1, 0.03, st.t);
    vineR.update(st.dt, sway, st.leanZ - 0.1, 0.03, st.t + 1);
  }

  return { group, height: 5.6, character: ch, update, anchors, extras: [] };
}
