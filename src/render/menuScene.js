// The 3D backdrop behind the menus: a sunny showroom platform with the karts on it.
// Modes: 'title' (all six lined up), 'select' (one big showcase kart), 'podium' (cup finale).

import * as THREE from 'three';
import { THEMES } from '../game/themes.js';
import { skyTexture, groundTexture, blobShadowTexture } from './textures.js';
import { KartModel } from './kartModel.js';
import { CHARACTERS } from '../game/characters.js';
import { Particles } from './particles.js';
import { damp } from '../util/math.js';

export class MenuScene {
  constructor(renderer) {
    this.renderer = renderer;
    const th = THEMES.meadow;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(th.fog.color);
    this.scene.fog = new THREE.Fog(th.fog.color, 90, 600);
    this.camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.3, 3000);

    this.scene.add(new THREE.HemisphereLight(0xdcefff, 0x6e9a58, 1.65));
    const sun = new THREE.DirectionalLight(0xfff0d0, 2.8);
    sun.position.set(-30, 40, 24);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.left = -18;
    sun.shadow.camera.right = 18;
    sun.shadow.camera.top = 18;
    sun.shadow.camera.bottom = -18;
    sun.shadow.camera.near = 5;
    sun.shadow.camera.far = 120;
    sun.shadow.bias = -0.0006;
    this.scene.add(sun, sun.target);

    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(1500, 32, 20),
      new THREE.MeshBasicMaterial({ map: skyTexture({ ...th, sun: { ...th.sun, u: 0.1, v: 0.3 } }), side: THREE.BackSide, fog: false, depthWrite: false }),
    );
    this.sky.renderOrder = -10;
    this.scene.add(this.sky);

    const gTex = groundTexture('grass', 21);
    gTex.repeat.set(120, 120);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(2400, 2400, 32, 32), new THREE.MeshLambertMaterial({ map: gTex }));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.4;
    ground.receiveShadow = true;
    this.scene.add(ground);

    // platform with a checkered rim
    const plat = new THREE.Group();
    const top = new THREE.Mesh(new THREE.CylinderGeometry(15, 15.6, 0.5, 48), new THREE.MeshLambertMaterial({ color: 0x4d5566 }));
    top.position.y = -0.15;
    top.receiveShadow = true;
    plat.add(top);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(15.2, 0.28, 8, 64), new THREE.MeshLambertMaterial({ color: 0xffcf2e }));
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.12;
    plat.add(ring);
    this.scene.add(plat);

    this.shadowTex = blobShadowTexture();
    const skyTex = this.sky.material.map;
    skyTex.mapping = THREE.EquirectangularReflectionMapping;
    const pm = new THREE.PMREMGenerator(renderer);
    this.envRT = pm.fromEquirectangular(skyTex);
    pm.dispose();
    this.models = CHARACTERS.map((c) => {
      const m = new KartModel(c, { shadowTexture: this.shadowTex, envMap: this.envRT.texture });
      m.addTo(this.scene);
      m.shadow.visible = false;
      return m;
    });
    // fake kart state so KartModel.update can drive wheels and lean
    this.fake = CHARACTERS.map(() => ({
      x: 0, z: 0, h: 0, vx: 0, vz: 0, speed: 4, steer: 0, drifting: false, driftDir: 0, spinAngle: 0, airY: 0, hopT: 0,
      shield: 0, boostTimer: 0, comet: 0, invuln: 0, spin: 0, surface: 'road', speedNorm: 0.2,
      controls: { throttle: 0 }, stats: { vmax: 36 },
    }));
    this.slots = this.models.map(() => ({ x: 0, y: 0, z: 0, h: 0, s: 1, visible: false, tx: 0, ty: 0, tz: 0, th: 0, ts: 1, tv: false }));

    this.particles = new Particles(this.scene, 'medium');
    this.podiumBlocks = new THREE.Group();
    this.podiumBlocks.visible = false;
    this.scene.add(this.podiumBlocks);
    const blockMat = [0xffd23f, 0xdfe6f0, 0xffab6e].map((c) => new THREE.MeshLambertMaterial({ color: c }));
    [[0, 1.5, 0], [-3.6, 1.0, 1], [3.6, 0.7, 2]].forEach(([x, h, i]) => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(3.2, h, 3.2), blockMat[i]);
      b.position.set(x, h / 2 - 0.1, 0);
      b.castShadow = true;
      b.receiveShadow = true;
      this.podiumBlocks.add(b);
    });

    this.mode = 'title';
    this.selected = 0;
    this.time = 0;
    this.camPos = new THREE.Vector3(0, 4, 18);
    this.camLook = new THREE.Vector3(0, 1.2, 0);
    this.camTargetPos = new THREE.Vector3();
    this.camTargetLook = new THREE.Vector3();
    this.podiumOrder = [];
    this.setMode('title', true);
  }

  resize(w, h) {
    this.camera.aspect = w / h;
    // keep the framing readable on tall/narrow screens
    this.camera.fov = w / h < 1 ? 62 : 42;
    this.camera.updateProjectionMatrix();
    this.aspect = w / h;
  }

  select(index) {
    this.selected = index;
    if (this.mode === 'select') this._layoutSelect(true);
  }

  setMode(mode, snap = false, podiumOrder = []) {
    this.mode = mode;
    this.podiumOrder = podiumOrder;
    this.podiumBlocks.visible = mode === 'podium';
    if (mode === 'title') this._layoutTitle();
    else if (mode === 'select') this._layoutSelect(false);
    else if (mode === 'podium') this._layoutPodium();
    if (snap) this._snap();
  }

  _snap() {
    for (const s of this.slots) {
      s.x = s.tx; s.y = s.ty; s.z = s.tz; s.h = s.th; s.s = s.ts; s.visible = s.tv;
    }
    this.camPos.copy(this.camTargetPos);
    this.camLook.copy(this.camTargetLook);
  }

  _layoutTitle() {
    this.slots.forEach((s, i) => {
      const row = Math.floor(i / 6);
      const col = i % 6;
      s.tx = (col - 2.5) * 4.7 + row * 2.2;
      s.tz = -row * 6.2 - col * 0.5 + 3;
      s.ty = 0;
      s.th = 0.7 + (col - 2.5) * -0.05;
      s.ts = 1;
      s.tv = true;
    });
    this.camTargetPos.set(13, 6, 19);
    this.camTargetLook.set(-6.5, 1.2, -2);
    this.titleBase = this.camTargetPos.clone();
  }

  _layoutSelect() {
    this.slots.forEach((s, i) => {
      s.tx = 0;
      s.tz = 0;
      s.ty = 0;
      s.ts = i === this.selected ? 1.3 : 0.001;
      s.tv = i === this.selected;
      if (i === this.selected) {
        s.visible = true;
        s.s = 0.6; // pop in
      }
    });
    this.camTargetPos.set(0, 3.6, 12.5);
    this.camTargetLook.set(0, 1.5, 0);
  }

  _layoutPodium() {
    const order = this.podiumOrder.length ? this.podiumOrder : [0, 1, 2, 3, 4, 5];
    const pos = [[0, 1.5], [-3.6, 1.0], [3.6, 0.7]];
    this.slots.forEach((s) => (s.tv = false));
    order.forEach((ci, place) => {
      const s = this.slots[ci];
      if (place < 3) {
        s.tx = pos[place][0];
        s.ty = pos[place][1] - 0.1;
        s.tz = 0;
        s.th = 0.0;
        s.ts = 1.15;
        s.tv = true;
      } else {
        s.tx = -7 + (place - 3) * 3.4 - 0.5;
        s.ty = 0;
        s.tz = -5;
        s.th = 0.3;
        s.ts = 0.9;
        s.tv = true;
      }
    });
    this.camTargetPos.set(1.5, 3.8, 14.5);
    this.camTargetLook.set(-3.4, 1.9, 0);
  }

  celebrate() {
    for (let i = 0; i < 5; i++) {
      this.particles.confetti((Math.random() - 0.5) * 12, 3, (Math.random() - 0.5) * 6, 36);
    }
  }

  update(dt) {
    this.time += dt;
    const t = this.time;
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      s.x = damp(s.x, s.tx, 9, dt);
      s.y = damp(s.y, s.ty, 9, dt);
      s.z = damp(s.z, s.tz, 9, dt);
      s.s = damp(s.s, s.ts, this.mode === 'select' ? 12 : 9, dt);
      let hTarget = s.th;
      if (this.mode === 'select') hTarget = t * 0.6 + 0.4;
      if (this.mode === 'title') hTarget = s.th + Math.sin(t * 0.5 + i) * 0.05;
      if (this.mode === 'select') s.h = hTarget;
      else s.h = damp(s.h, hTarget, 6, dt);

      const m = this.models[i];
      const f = this.fake[i];
      f.x = s.x;
      f.z = s.z;
      f.h = s.h;
      f.airY = s.y;
      f.speed = this.mode === 'select' && i === this.selected ? 3 : 0;
      f.steer = this.mode === 'select' ? Math.sin(t * 1.3) * 0.5 : 0;
      f.speedNorm = 0.1;
      m.update(dt, f, t);
      const vis = s.tv || s.s > 0.05;
      m.root.visible = vis && s.s > 0.02;
      m.root.scale.setScalar(Math.max(0.001, s.s));
      m.root.position.y = s.y;
      m.shadow.visible = m.root.visible;
      m.shadow.position.set(s.x, s.y + 0.07, s.z);
      m.shadow.scale.setScalar(Math.max(0.001, s.s));
      if (this.mode === 'podium') m.head.rotation.z = Math.sin(t * 4 + i) * 0.15;
    }

    // camera
    const cs = 5;
    this.camPos.x = damp(this.camPos.x, this.camTargetPos.x, cs, dt);
    this.camPos.y = damp(this.camPos.y, this.camTargetPos.y, cs, dt);
    this.camPos.z = damp(this.camPos.z, this.camTargetPos.z, cs, dt);
    this.camLook.x = damp(this.camLook.x, this.camTargetLook.x, cs, dt);
    this.camLook.y = damp(this.camLook.y, this.camTargetLook.y, cs, dt);
    this.camLook.z = damp(this.camLook.z, this.camTargetLook.z, cs, dt);
    const sway = this.mode === 'title' ? Math.sin(t * 0.25) * 1.6 : 0;
    this.camera.position.set(this.camPos.x + sway, this.camPos.y, this.camPos.z);
    this.camera.lookAt(this.camLook);
    // portrait screens: pull back so the subject stays in frame
    if (this.aspect && this.aspect < 1) {
      this.camera.position.z += (1 - this.aspect) * 9;
      this.camera.position.y += (1 - this.aspect) * 2;
    }
    this.sky.position.copy(this.camera.position);
    this.particles.update(dt);
  }

  render() {
    this.particles.setScale(this.renderer, this.camera);
    this.renderer.render(this.scene, this.camera);
  }
}
