import * as THREE from 'three';
import { WEAPONS, WeaponId } from './defs';
import { damp, lerp, makeCanvas, smoothstep, easeInOut } from '../../engine/util';

const MAT = {
  metal: new THREE.MeshStandardMaterial({ color: 0x2a2f34, metalness: 0.8, roughness: 0.36 }),
  steel: new THREE.MeshStandardMaterial({ color: 0x707a82, metalness: 0.85, roughness: 0.3 }),
  poly: new THREE.MeshStandardMaterial({ color: 0x343a3f, metalness: 0.2, roughness: 0.6 }),
  tan: new THREE.MeshStandardMaterial({ color: 0x8a7a57, metalness: 0.15, roughness: 0.6 }),
  orange: new THREE.MeshStandardMaterial({ color: 0xd2631c, metalness: 0.2, roughness: 0.5 }),
  wood: new THREE.MeshStandardMaterial({ color: 0x5a3c22, metalness: 0.05, roughness: 0.7 }),
  glove: new THREE.MeshStandardMaterial({ color: 0x17181a, metalness: 0.05, roughness: 0.85 }),
  sleeve: new THREE.MeshStandardMaterial({ color: 0x2d3b2c, metalness: 0.0, roughness: 0.95 }),
  lens: new THREE.MeshStandardMaterial({ color: 0x1a4a6a, emissive: 0x2a8acc, emissiveIntensity: 0.9, metalness: 0.9, roughness: 0.1 }),
  dot: new THREE.MeshBasicMaterial({ color: 0xff3a2a }),
};

function bx(parent: THREE.Object3D, w: number, h: number, d: number, x: number, y: number, z: number, mat: THREE.Material, rx = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z); m.rotation.x = rx;
  parent.add(m);
  return m;
}
function cyl(parent: THREE.Object3D, r: number, len: number, x: number, y: number, z: number, mat: THREE.Material, r2 = r) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r2, r, len, 14), mat);
  m.rotation.x = Math.PI / 2;
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

interface GunModel {
  group: THREE.Group;
  mag: THREE.Group | null;
  magRest: THREE.Vector3;
  slide: THREE.Object3D | null;
  slideRest: THREE.Vector3;
  muzzle: THREE.Object3D;
  eject: THREE.Object3D;
  leftGrip: THREE.Vector3;
  leftMag: THREE.Vector3;
  hip: THREE.Vector3;
  ads: THREE.Vector3;
  shell: boolean;
  stock: THREE.Group;
}

function buildVK7(): GunModel {
  const g = new THREE.Group();
  bx(g, 0.05, 0.085, 0.3, 0, 0, 0, MAT.metal);
  bx(g, 0.032, 0.022, 0.22, 0, 0.054, -0.01, MAT.steel);
  bx(g, 0.012, 0.03, 0.012, 0, 0.082, -0.1, MAT.metal); // rear sight
  bx(g, 0.012, 0.034, 0.012, 0, 0.082, -0.46, MAT.metal); // front sight
  bx(g, 0.058, 0.062, 0.3, 0, -0.005, -0.3, MAT.poly);
  bx(g, 0.04, 0.01, 0.26, 0, 0.034, -0.3, MAT.steel);
  cyl(g, 0.0105, 0.22, 0, 0.012, -0.55, MAT.steel);
  cyl(g, 0.017, 0.055, 0, 0.012, -0.66, MAT.metal);
  const stock = new THREE.Group(); g.add(stock);
  bx(stock, 0.046, 0.1, 0.2, 0, -0.012, 0.26, MAT.poly, 0.12);
  bx(stock, 0.05, 0.12, 0.02, 0, -0.016, 0.375, MAT.metal, 0.12);
  bx(g, 0.038, 0.1, 0.05, 0, -0.085, 0.09, MAT.poly, -0.35);
  bx(g, 0.052, 0.012, 0.1, 0, 0.0, -0.02, MAT.tan);
  const mag = new THREE.Group();
  bx(mag, 0.04, 0.15, 0.07, 0, -0.075, 0, MAT.poly, 0.12);
  bx(mag, 0.042, 0.02, 0.072, 0, -0.15, 0.012, MAT.steel, 0.12);
  mag.position.set(0, -0.04, -0.03);
  g.add(mag);
  const bolt = bx(g, 0.012, 0.02, 0.05, 0.03, 0.02, -0.02, MAT.steel);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.012, -0.7); g.add(muzzle);
  const eject = new THREE.Object3D(); eject.position.set(0.03, 0.02, -0.02); g.add(eject);
  return {
    group: g, mag, magRest: mag.position.clone(), slide: bolt, slideRest: bolt.position.clone(), muzzle, eject,
    leftGrip: new THREE.Vector3(0, -0.055, -0.32), leftMag: new THREE.Vector3(0, -0.14, -0.03),
    hip: new THREE.Vector3(0.17, -0.2, -0.42), ads: new THREE.Vector3(0, -0.092, -0.36), shell: false, stock,
  };
}

function buildHornet(): GunModel {
  const g = new THREE.Group();
  bx(g, 0.052, 0.09, 0.26, 0, 0, 0, MAT.poly);
  bx(g, 0.04, 0.02, 0.24, 0, 0.055, -0.01, MAT.metal);
  bx(g, 0.04, 0.045, 0.06, 0, 0.083, -0.02, MAT.metal); // reflex housing
  bx(g, 0.034, 0.03, 0.006, 0, 0.085, -0.048, MAT.lens);
  bx(g, 0.006, 0.006, 0.004, 0, 0.085, -0.052, MAT.dot);
  bx(g, 0.05, 0.05, 0.2, 0, 0, -0.22, MAT.orange);
  bx(g, 0.048, 0.01, 0.2, 0, 0.03, -0.22, MAT.metal);
  cyl(g, 0.012, 0.12, 0, 0.005, -0.38, MAT.steel);
  cyl(g, 0.02, 0.07, 0, 0.005, -0.46, MAT.metal);
  const stock = new THREE.Group(); g.add(stock);
  bx(stock, 0.03, 0.045, 0.16, 0, -0.01, 0.2, MAT.metal);
  bx(g, 0.04, 0.09, 0.05, 0, -0.08, 0.07, MAT.poly, -0.3);
  bx(g, 0.03, 0.1, 0.05, 0, -0.07, -0.14, MAT.poly, 0.1); // fore grip
  const mag = new THREE.Group();
  bx(mag, 0.036, 0.17, 0.05, 0, -0.085, 0, MAT.poly);
  bx(mag, 0.038, 0.02, 0.052, 0, -0.17, 0, MAT.orange);
  mag.position.set(0, -0.04, 0.03);
  g.add(mag);
  const bolt = bx(g, 0.012, 0.02, 0.05, 0.028, 0.02, 0.0, MAT.steel);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.005, -0.5); g.add(muzzle);
  const eject = new THREE.Object3D(); eject.position.set(0.03, 0.02, 0.0); g.add(eject);
  return {
    group: g, mag, magRest: mag.position.clone(), slide: bolt, slideRest: bolt.position.clone(), muzzle, eject,
    leftGrip: new THREE.Vector3(0, -0.1, -0.16), leftMag: new THREE.Vector3(0, -0.14, 0.03),
    hip: new THREE.Vector3(0.17, -0.19, -0.38), ads: new THREE.Vector3(0, -0.1, -0.3), shell: false, stock,
  };
}

function buildBreaker(): GunModel {
  const g = new THREE.Group();
  bx(g, 0.052, 0.085, 0.3, 0, 0, 0, MAT.metal);
  bx(g, 0.04, 0.02, 0.5, 0, 0.05, -0.28, MAT.steel);
  cyl(g, 0.014, 0.65, 0, 0.012, -0.5, MAT.steel);
  cyl(g, 0.017, 0.5, 0, -0.025, -0.42, MAT.metal); // tube mag
  cyl(g, 0.013, 0.04, 0, 0.012, -0.84, MAT.metal);
  bx(g, 0.01, 0.02, 0.01, 0, 0.065, -0.82, MAT.dot);
  const pump = new THREE.Group();
  bx(pump, 0.06, 0.05, 0.2, 0, -0.025, 0, MAT.wood);
  bx(pump, 0.062, 0.012, 0.2, 0, -0.005, 0, MAT.metal);
  pump.position.set(0, 0, -0.38);
  g.add(pump);
  const stock = new THREE.Group(); g.add(stock);
  bx(stock, 0.05, 0.11, 0.26, 0, -0.025, 0.26, MAT.wood, 0.14);
  bx(stock, 0.052, 0.12, 0.025, 0, -0.03, 0.4, MAT.metal, 0.14);
  bx(g, 0.04, 0.1, 0.05, 0, -0.085, 0.09, MAT.wood, -0.35);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.012, -0.9); g.add(muzzle);
  const eject = new THREE.Object3D(); eject.position.set(0.03, 0.01, -0.05); g.add(eject);
  return {
    group: g, mag: null, magRest: new THREE.Vector3(), slide: pump, slideRest: pump.position.clone(), muzzle, eject,
    leftGrip: new THREE.Vector3(0, -0.05, -0.38), leftMag: new THREE.Vector3(0, -0.12, -0.05),
    hip: new THREE.Vector3(0.18, -0.2, -0.45), ads: new THREE.Vector3(0, -0.085, -0.34), shell: true, stock,
  };
}

function buildLongbow(): GunModel {
  const g = new THREE.Group();
  bx(g, 0.05, 0.09, 0.34, 0, 0, 0, MAT.metal);
  bx(g, 0.034, 0.014, 0.3, 0, 0.052, -0.02, MAT.steel);
  // scope
  cyl(g, 0.022, 0.26, 0, 0.098, -0.02, MAT.metal);
  cyl(g, 0.03, 0.06, 0, 0.098, -0.17, MAT.metal, 0.034);
  cyl(g, 0.026, 0.05, 0, 0.098, 0.13, MAT.metal, 0.03);
  const lens = new THREE.Mesh(new THREE.CircleGeometry(0.026, 20), MAT.lens);
  lens.position.set(0, 0.098, 0.162); lens.rotation.y = Math.PI; g.add(lens);
  bx(g, 0.02, 0.03, 0.03, 0, 0.068, -0.07, MAT.metal);
  bx(g, 0.02, 0.03, 0.03, 0, 0.068, 0.06, MAT.metal);
  bx(g, 0.058, 0.07, 0.4, 0, -0.005, -0.35, MAT.poly);
  cyl(g, 0.011, 0.38, 0, 0.012, -0.76, MAT.steel);
  cyl(g, 0.019, 0.09, 0, 0.012, -0.98, MAT.metal);
  const stock = new THREE.Group(); g.add(stock);
  bx(stock, 0.05, 0.12, 0.26, 0, -0.02, 0.28, MAT.poly, 0.1);
  bx(stock, 0.054, 0.025, 0.1, 0, 0.04, 0.3, MAT.tan, 0.1);
  bx(g, 0.04, 0.1, 0.05, 0, -0.085, 0.1, MAT.poly, -0.35);
  const mag = new THREE.Group();
  bx(mag, 0.042, 0.12, 0.08, 0, -0.06, 0, MAT.poly);
  mag.position.set(0, -0.04, -0.05);
  g.add(mag);
  const bolt = bx(g, 0.012, 0.014, 0.07, 0.03, 0.025, 0.02, MAT.steel);
  const muzzle = new THREE.Object3D(); muzzle.position.set(0, 0.012, -1.06); g.add(muzzle);
  const eject = new THREE.Object3D(); eject.position.set(0.03, 0.02, 0.0); g.add(eject);
  return {
    group: g, mag, magRest: mag.position.clone(), slide: bolt, slideRest: bolt.position.clone(), muzzle, eject,
    leftGrip: new THREE.Vector3(0, -0.06, -0.5), leftMag: new THREE.Vector3(0, -0.12, -0.05),
    hip: new THREE.Vector3(0.18, -0.21, -0.45), ads: new THREE.Vector3(0, -0.1, -0.24), shell: false, stock,
  };
}

export interface VMState {
  ads: number;
  sprint: number;
  moveAmt: number;
  bobPhase: number;
  lookDX: number;
  lookDY: number;
  reloadT: number; // -1 when not reloading
  equipT: number;
  grounded: boolean;
  landKick: number;
}

export class Viewmodel {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(58, 1, 0.01, 10);
  root = new THREE.Group();
  private models = new Map<WeaponId, GunModel>();
  private current: GunModel | null = null;
  private currentId: WeaponId | null = null;
  private leftHand = new THREE.Group();
  private rightHand = new THREE.Group();
  private flash: THREE.Mesh;
  private flashT = 0;
  private flashLight: THREE.PointLight;
  private swayX = 0; private swayY = 0;
  private kickZ = 0; private kickV = 0;
  private kickRot = 0; private kickRotV = 0;
  private slideT = 0;
  private knifeT = -1;
  private knife: THREE.Group;
  private tmp = new THREE.Vector3();

  constructor() {
    this.scene.add(new THREE.HemisphereLight(0xbfd6ff, 0x30281e, 0.55));
    const key = new THREE.DirectionalLight(0xffeedd, 1.5); key.position.set(-1, 2, 1.5); this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x6ab0ff, 1.8); rim.position.set(2, 0.5, -1); this.scene.add(rim);
    this.flashLight = new THREE.PointLight(0xffc27a, 0, 3, 2);
    this.scene.add(this.flashLight);
    this.scene.add(this.camera);
    this.camera.add(this.root);
    this.scene.add(this.camera);

    this.models.set('vk7', buildVK7());
    this.models.set('hornet', buildHornet());
    this.models.set('breaker', buildBreaker());
    this.models.set('longbow', buildLongbow());

    // hands: simple gloved fist + sleeve
    const mk = (g: THREE.Group, mirror: number) => {
      bx(g, 0.05, 0.05, 0.075, 0, 0, 0, MAT.glove);
      bx(g, 0.052, 0.018, 0.05, 0, 0.026, -0.006, MAT.glove);
      const arm = bx(g, 0.07, 0.07, 0.5, mirror * 0.01, -0.04, 0.3, MAT.sleeve);
      arm.rotation.x = 0.28; arm.rotation.y = mirror * -0.15;
      bx(g, 0.074, 0.074, 0.05, 0, 0, 0.06, MAT.poly);
    };
    mk(this.leftHand, -1);
    mk(this.rightHand, 1);

    // flash
    const cv = makeCanvas(128, 128);
    const c = cv.getContext('2d')!;
    const grd = c.createRadialGradient(64, 64, 2, 64, 64, 62);
    grd.addColorStop(0, 'rgba(255,255,230,1)'); grd.addColorStop(0.25, 'rgba(255,200,110,0.9)'); grd.addColorStop(1, 'rgba(255,120,30,0)');
    c.fillStyle = grd; c.fillRect(0, 0, 128, 128);
    c.translate(64, 64); c.fillStyle = 'rgba(255,230,160,0.85)';
    for (let i = 0; i < 6; i++) { c.rotate(Math.PI / 3); c.beginPath(); c.moveTo(0, -4); c.lineTo(60, 0); c.lineTo(0, 4); c.fill(); }
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(cv), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, color: 0xffffff,
    }));
    this.flash.visible = false;
    this.flash.renderOrder = 10;

    // knife
    this.knife = new THREE.Group();
    bx(this.knife, 0.02, 0.03, 0.14, 0, 0, 0, MAT.glove);
    bx(this.knife, 0.006, 0.034, 0.22, 0, 0.002, -0.17, MAT.steel);
    bx(this.knife, 0.03, 0.04, 0.012, 0, 0, -0.07, MAT.metal);
    this.knife.visible = false;
    this.root.add(this.knife);
  }

  get muzzleWorld(): THREE.Vector3 {
    const out = new THREE.Vector3();
    if (this.current) this.current.muzzle.getWorldPosition(out);
    return out;
  }
  get ejectWorld(): THREE.Vector3 {
    const out = new THREE.Vector3();
    if (this.current) this.current.eject.getWorldPosition(out);
    return out;
  }
  get scopeGun() { return this.currentId === 'longbow'; }

  setWeapon(id: WeaponId) {
    if (this.current) this.root.remove(this.current.group);
    const m = this.models.get(id)!;
    this.current = m; this.currentId = id;
    this.root.add(m.group);
    m.group.add(this.leftHand, this.rightHand);
    this.rightHand.position.set(0.0, -0.1, 0.1);
    this.rightHand.rotation.set(0, 0, 0);
    this.leftHand.position.copy(m.leftGrip);
    m.group.add(this.flash);
    this.flash.position.copy(m.muzzle.position);
    this.knife.visible = false;
    m.group.visible = true;
  }

  fire(kick: number, id: WeaponId) {
    this.kickV += 1.6 * kick;
    this.kickRotV += 0.9 * kick;
    this.slideT = 1;
    this.flashT = 0.045;
    this.flash.visible = true;
    (this.flash.material as THREE.MeshBasicMaterial).opacity = 1;
    this.flash.rotation.z = Math.random() * 6.28;
    const s = id === 'breaker' ? 1.7 : id === 'hornet' ? 0.8 : id === 'longbow' ? 1.3 : 1;
    this.flash.scale.setScalar(s * (0.8 + Math.random() * 0.5));
    this.flashLight.intensity = 5 * s;
    this.flashLight.position.copy(this.current!.muzzle.position).add(this.tmp.set(0, 0, -0.1));
    if (this.current) this.current.group.add(this.flashLight);
  }

  stab() { this.knifeT = 0; }
  get stabbing() { return this.knifeT >= 0; }

  update(dt: number, s: VMState, aspect: number, hasKnifeOut: boolean) {
    const m = this.current!;
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
    // sway
    this.swayX = damp(this.swayX, -s.lookDX * 0.0011, 9, dt);
    this.swayY = damp(this.swayY, s.lookDY * 0.0011, 9, dt);
    const swayMax = 0.035 * (1 - s.ads * 0.8);
    const sx = Math.max(-swayMax, Math.min(swayMax, this.swayX));
    const sy = Math.max(-swayMax, Math.min(swayMax, this.swayY));
    // kick spring
    this.kickV += (-this.kickZ * 220 - this.kickV * 18) * dt;
    this.kickZ += this.kickV * dt;
    this.kickRotV += (-this.kickRot * 180 - this.kickRotV * 16) * dt;
    this.kickRot += this.kickRotV * dt;
    this.slideT = Math.max(0, this.slideT - dt * 9);

    const pos = this.tmp.copy(m.hip).lerp(m.ads, easeInOut(s.ads));
    // bob
    const bobAmt = s.moveAmt * (1 - s.ads * 0.85);
    const bx_ = Math.sin(s.bobPhase) * 0.008 * bobAmt;
    const by_ = Math.abs(Math.cos(s.bobPhase)) * 0.01 * bobAmt;
    const adsKick = 1 - s.ads * 0.55;
    let rx = this.kickRot * 0.06 * adsKick;
    let ry = 0, rz = 0;
    let px = pos.x + sx + bx_;
    let py = pos.y + sy + by_ - s.landKick * 0.04;
    let pz = pos.z + this.kickZ * 0.035 * adsKick;

    // sprint pose
    if (s.sprint > 0.01) {
      const e = easeInOut(s.sprint);
      px += -0.1 * e; py += -0.07 * e; pz += 0.02 * e;
      rx += 0.35 * e; ry += 0.55 * e; rz += -0.2 * e;
    }
    // equip
    if (s.equipT < 1) {
      const e = 1 - easeInOut(s.equipT);
      py -= 0.35 * e; rx -= 0.9 * e; px += 0.05 * e;
    }

    // reload pose
    let magOffY = 0, magVis = true, leftHandT = 0;
    let slideOff = this.slideT * 0.045;
    if (s.reloadT >= 0) {
      const t = s.reloadT;
      if (m.shell) {
        const lower = smoothstep(0, 0.12, t) * (1 - smoothstep(0.88, 1, t));
        py -= 0.06 * lower; rx += 0.5 * lower; rz += 0.3 * lower; px -= 0.03 * lower;
        // insertion bobs
        const ins = Math.abs(Math.sin(t * Math.PI * 6)) * 0.015 * lower;
        leftHandT = 0.5 * lower;
        py -= ins;
        slideOff = Math.max(slideOff, (smoothstep(0.88, 0.94, t) * (1 - smoothstep(0.94, 1, t))) * 0.1);
      } else {
        const tilt = smoothstep(0, 0.16, t) * (1 - smoothstep(0.82, 0.97, t));
        rz += 0.55 * tilt; rx += 0.3 * tilt; px -= 0.05 * tilt; py -= 0.04 * tilt;
        // mag out / in
        const out = smoothstep(0.16, 0.34, t), inn = smoothstep(0.52, 0.68, t);
        magOffY = -0.3 * out * (1 - inn);
        magVis = !(t > 0.3 && t < 0.52);
        leftHandT = smoothstep(0.1, 0.25, t) * (1 - smoothstep(0.7, 0.78, t));
        const bolt = smoothstep(0.76, 0.82, t) * (1 - smoothstep(0.82, 0.9, t));
        slideOff = Math.max(slideOff, bolt * 0.05);
        if (t > 0.3 && t < 0.52) leftHandT = 1 - Math.abs((t - 0.41) / 0.11) * 0.4;
      }
    }

    // knife
    if (this.knifeT >= 0) {
      this.knifeT += dt * 3.2;
      const k = this.knifeT;
      if (k >= 1) { this.knifeT = -1; this.knife.visible = false; m.group.visible = true; }
      else {
        this.knife.visible = true; m.group.visible = false;
        const sw = Math.sin(k * Math.PI);
        this.knife.position.set(0.12 - sw * 0.2 + (1 - k) * 0.1, -0.16 + sw * 0.05, -0.32 - sw * 0.08);
        this.knife.rotation.set(0.2 - sw * 0.5, 0.8 - k * 1.6, -0.4 + sw * 0.9);
        if (!this.knife.children.includes(this.rightHand)) this.knife.add(this.rightHand);
      }
    }
    if (this.knifeT < 0 && this.rightHand.parent === this.knife) {
      m.group.add(this.rightHand);
    }

    this.root.position.set(px, py, pz);
    this.root.rotation.set(rx, ry, rz);
    m.group.position.set(0, 0, 0);
    m.stock.visible = s.ads < 0.45;
    this.leftHand.visible = s.ads < 0.8 || s.reloadT >= 0;
    this.rightHand.visible = s.ads < 0.45;
    if (m.mag) {
      m.mag.position.copy(m.magRest); m.mag.position.y += magOffY; m.mag.visible = magVis;
    }
    if (m.slide) {
      m.slide.position.copy(m.slideRest);
      if (m.shell) m.slide.position.z += slideOff * 1.2; else m.slide.position.z += slideOff;
    }
    this.leftHand.position.copy(m.leftGrip).lerp(this.tmp.set(m.leftMag.x, m.leftMag.y - magOffY * 0 + (leftHandT > 0 ? -0.02 : 0), m.leftMag.z), leftHandT);
    this.leftHand.position.y += magOffY * leftHandT * 0.9;
    this.leftHand.rotation.set(0, 0, 0);
    this.leftHand.rotation.z = leftHandT * 0.5;
    void hasKnifeOut;

    // flash fade
    if (this.flashT > 0) {
      this.flashT -= dt;
      if (this.flashT <= 0) { this.flash.visible = false; this.flashLight.intensity = 0; }
      else this.flashLight.intensity *= 0.75;
    }
    void lerp;
  }
}
