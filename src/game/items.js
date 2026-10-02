// Item boxes, the eight items, projectiles and track hazards.
//
//   bolt    thrown projectile, forward or backward, bounces off walls
//   seeker  homing projectile that locks on to the racer ahead
//   turbo   one speed boost
//   trio    three small speed boosts
//   oil     slick dropped behind you
//   aegis   shield that blocks the next hit
//   comet   comeback: a few seconds of invulnerable autopilot at huge speed
//   pulse   comeback: shocks every racer ahead of you

import * as THREE from 'three';
import { clamp, wrapPi } from '../util/math.js';
import { TrackProbe, posAt } from './trackMath.js';
import { KART_RADIUS } from './kart.js';
import { oilTexture, itemBoxTexture, glowTexture } from '../render/textures.js';
import { box, cone, cyl, sph, merge } from '../render/geo.js';

export const ITEMS = {
  bolt: { id: 'bolt', name: 'Bolt', color: '#ffd23f', desc: 'Throw forward, or backward while holding brake. Bounces off walls.' },
  seeker: { id: 'seeker', name: 'Seeker', color: '#ff5a4a', desc: 'Homing missile that hunts the racer ahead of you.' },
  turbo: { id: 'turbo', name: 'Turbo Cell', color: '#ff9a2a', desc: 'One strong burst of speed.' },
  trio: { id: 'trio', name: 'Turbo Trio', color: '#ffb84a', desc: 'Three short bursts of speed.' },
  oil: { id: 'oil', name: 'Oil Slick', color: '#8a6bff', desc: 'Drops a slick behind you. Rivals spin out.' },
  aegis: { id: 'aegis', name: 'Aegis', color: '#4ad8ff', desc: 'Shield that absorbs the next hit.' },
  comet: { id: 'comet', name: 'Comet', color: '#ffe066', desc: 'Comeback item. Autopilot at huge speed, and nothing can hurt you.' },
  pulse: { id: 'pulse', name: 'Pulse', color: '#5dffb0', desc: 'Comeback item. Shocks every racer ahead of you.' },
};

// Weights per race position (index 0 = 1st place). Back markers get stronger items.
const ORDER = ['bolt', 'seeker', 'turbo', 'trio', 'oil', 'aegis', 'comet', 'pulse'];
export const ITEM_WEIGHTS = [
  [30, 4, 16, 5, 30, 15, 0, 0],
  [26, 12, 18, 8, 16, 16, 0, 0],
  [18, 20, 20, 12, 10, 15, 5, 0],
  [12, 22, 18, 15, 5, 13, 15, 0],
  [8, 22, 14, 16, 3, 10, 22, 5],
  [4, 18, 10, 16, 2, 8, 30, 12],
];

export function rollItem(place, rng = Math.random) {
  const w = ITEM_WEIGHTS[clamp(place - 1, 0, ITEM_WEIGHTS.length - 1)];
  let total = 0;
  for (const v of w) total += v;
  let r = rng() * total;
  for (let i = 0; i < w.length; i++) {
    r -= w[i];
    if (r <= 0) return ORDER[i];
  }
  return 'bolt';
}

const BOX_RESPAWN = 4;
const BOX_RADIUS = 2.3;

export class ItemSystem {
  constructor(race) {
    this.race = race;
    this.track = race.track;
    this.scene = race.scene;
    this.boxes = [];
    this.projectiles = [];
    this.hazards = [];
    this.time = 0;
    this._build();
  }

  _build() {
    const t = this.track;
    for (const row of t.itemRows) {
      const spacing = Math.min(4.6, (t.w[row.i] * 0.78) / Math.max(1, row.count - 1 || 1));
      for (let k = 0; k < row.count; k++) {
        const lat = (k - (row.count - 1) / 2) * spacing;
        const p = posAt(t, row.s, lat);
        this.boxes.push({ x: p.x, z: p.z, active: true, timer: 0, phase: Math.random() * 6, hue: Math.random(), scale: 1 });
      }
    }
    const n = this.boxes.length;
    const tex = itemBoxTexture();
    this.shells = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1.9, 1.9, 1.9),
      new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.85, depthWrite: false }),
      Math.max(1, n),
    );
    this.shells.renderOrder = 5;
    this.cores = new THREE.InstancedMesh(
      new THREE.OctahedronGeometry(0.55),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      Math.max(1, n),
    );
    this.shells.frustumCulled = false;
    this.cores.frustumCulled = false;
    this.boxTex = tex;
    this.glowPos = new Float32Array(Math.max(1, n) * 3);
    this.glowCol = new Float32Array(Math.max(1, n) * 3);
    this.glowGeo = new THREE.BufferGeometry();
    this.glowGeo.setAttribute('position', new THREE.BufferAttribute(this.glowPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.glowGeo.setAttribute('color', new THREE.BufferAttribute(this.glowCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.glowTex = glowTexture('rgba(255,255,255,1)');
    this.glow = new THREE.Points(
      this.glowGeo,
      new THREE.PointsMaterial({ map: this.glowTex, size: 7, vertexColors: true, transparent: true, opacity: 0.65, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.glow.frustumCulled = false;
    this.scene.add(this.shells, this.cores, this.glow);
    this._d = new THREE.Object3D();
    this._col = new THREE.Color();

    this.oilTex = oilTexture();
    this.oilGeo = new THREE.PlaneGeometry(5, 5);
    this.oilGeo.rotateX(-Math.PI / 2);

    this.boltGeo = merge([
      cyl(0xffd23f, 0.35, 1.2, [0, 0, 0], [Math.PI / 2, 0, 0]),
      sph(0xfff3b0, 0.5, 0.5, 0.5, [0, 0, 0]),
      cone(0xff8a1f, 0.28, 0.7, [0, 0, -0.8], [-Math.PI / 2, 0, 0]),
    ]);
    this.boltMat = new THREE.MeshBasicMaterial({ vertexColors: true });
    this.seekerGeo = merge([
      cyl(0xe8e8f0, 0.28, 1.8, [0, 0, 0], [Math.PI / 2, 0, 0]),
      cone(0xff4a3a, 0.28, 0.7, [0, 0, 1.2], [Math.PI / 2, 0, 0]),
      box(0xff4a3a, 0.9, 0.08, 0.5, [0, 0, -0.7]),
      box(0xff4a3a, 0.08, 0.9, 0.5, [0, 0, -0.7]),
    ]);
    this.seekerMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  }

  dispose() {
    this.scene.remove(this.shells, this.cores, this.glow);
    this.glowGeo.dispose();
    this.glow.material.dispose();
    this.glowTex.dispose();
    this.boxTex.dispose();
    this.shells.geometry.dispose();
    this.cores.geometry.dispose();
    this.shells.material.dispose();
    this.cores.material.dispose();
    for (const p of this.projectiles) this.scene.remove(p.mesh);
    for (const h of this.hazards) this.scene.remove(h.mesh);
    this.oilTex.dispose();
    this.oilGeo.dispose();
    this.boltGeo.dispose();
    this.seekerGeo.dispose();
  }

  // ---------------------------------------------------------------- pickup

  _grant(kart) {
    const race = this.race;
    const id = rollItem(kart.place, race.rng);
    const rolling = kart.isPlayer ? 1.4 : 0.35;
    kart.item = { id, count: id === 'trio' ? 3 : 1, rollT: rolling, ready: false };
    race.emit('itemGet', kart, { id });
  }

  update(dt) {
    this.time += dt;
    const race = this.race;
    const karts = race.karts;

    // boxes
    const d = this._d;
    const c = this._col;
    for (let i = 0; i < this.boxes.length; i++) {
      const b = this.boxes[i];
      if (!b.active) {
        b.timer -= dt;
        if (b.timer <= 0) b.active = true;
      } else {
        for (const k of karts) {
          if (k.item || k.finished) continue;
          const dx = k.x - b.x;
          const dz = k.z - b.z;
          if (dx * dx + dz * dz < BOX_RADIUS * BOX_RADIUS) {
            b.active = false;
            b.timer = BOX_RESPAWN;
            this._grant(k);
            race.emit('boxBreak', k, { x: b.x, z: b.z });
            break;
          }
        }
      }
      b.scale += ((b.active ? 1 : 0) - b.scale) * Math.min(1, dt * 10);
      const s = b.scale;
      d.position.set(b.x, 1.6 + Math.sin(this.time * 2.2 + b.phase) * 0.22, b.z);
      d.rotation.set(0, this.time * 1.1 + b.phase, 0);
      d.scale.setScalar(Math.max(0.0001, s));
      d.updateMatrix();
      this.shells.setMatrixAt(i, d.matrix);
      c.setHSL((b.hue + this.time * 0.25) % 1, 0.9, 0.58);
      this.shells.setColorAt(i, c);
      d.rotation.set(this.time * 1.7, -this.time * 1.3, 0);
      d.scale.setScalar(Math.max(0.0001, s));
      d.updateMatrix();
      this.cores.setMatrixAt(i, d.matrix);
      // glow halo so boxes read from far away, especially at night
      this.glowPos[i * 3] = b.x;
      this.glowPos[i * 3 + 1] = s > 0.2 ? 1.6 + Math.sin(this.time * 2.2 + b.phase) * 0.22 : -50;
      this.glowPos[i * 3 + 2] = b.z;
      this.glowCol[i * 3] = c.r;
      this.glowCol[i * 3 + 1] = c.g;
      this.glowCol[i * 3 + 2] = c.b;
    }
    this.shells.instanceMatrix.needsUpdate = true;
    this.cores.instanceMatrix.needsUpdate = true;
    this.glowGeo.attributes.position.needsUpdate = true;
    this.glowGeo.attributes.color.needsUpdate = true;
    if (this.shells.instanceColor) this.shells.instanceColor.needsUpdate = true;

    // item roulette timers
    for (const k of karts) {
      if (k.item && !k.item.ready) {
        k.item.rollT -= dt;
        if (k.item.rollT <= 0) {
          k.item.ready = true;
          race.emit('itemReady', k, { id: k.item.id });
        }
      }
    }

    this._updateProjectiles(dt);
    this._updateHazards(dt);
  }

  // ---------------------------------------------------------------- using items

  /** Returns true if an item was consumed/used. */
  tryUse(kart, back = false) {
    const it = kart.item;
    if (!it || !it.ready || kart.itemCool > 0 || kart.spin > 0 || kart.comet > 0) return false;
    const race = this.race;
    let used = true;
    switch (it.id) {
      case 'bolt':
        this._spawnBolt(kart, back);
        break;
      case 'seeker':
        this._spawnSeeker(kart);
        break;
      case 'turbo':
        kart.boost(1.7, 1.45, race);
        race.emit('itemUse', kart, { id: 'turbo' });
        break;
      case 'trio':
        kart.boost(1.2, 1.4, race);
        race.emit('itemUse', kart, { id: 'trio' });
        break;
      case 'oil':
        this._dropOil(kart);
        break;
      case 'aegis':
        kart.shield = 9;
        race.emit('shield', kart);
        break;
      case 'comet':
        kart.comet = 4.4;
        kart.cancelDrift();
        race.emit('cometStart', kart);
        break;
      case 'pulse':
        this._pulse(kart);
        break;
      default:
        used = false;
    }
    if (!used) return false;
    kart.itemCool = 0.45;
    it.count -= 1;
    if (it.count <= 0) kart.item = null;
    return true;
  }

  _spawnBolt(kart, back) {
    const dir = back ? -1 : 1;
    const fx = Math.sin(kart.h) * dir;
    const fz = Math.cos(kart.h) * dir;
    const speed = back ? 64 : 82;
    const mesh = new THREE.Mesh(this.boltGeo, this.boltMat);
    this.scene.add(mesh);
    const probe = new TrackProbe(this.track);
    const x = kart.x + fx * 2.8;
    const z = kart.z + fz * 2.8;
    probe.reset(x, z, kart.probe.distance);
    this.projectiles.push({
      type: 'bolt', x, z, vx: fx * speed + kart.vx * 0.25, vz: fz * speed + kart.vz * 0.25,
      owner: kart, life: 7, bounces: 0, probe, mesh, grace: 0.3,
    });
    this.race.emit('itemUse', kart, { id: 'bolt', back });
  }

  _spawnSeeker(kart) {
    const mesh = new THREE.Mesh(this.seekerGeo, this.seekerMat);
    this.scene.add(mesh);
    const fx = Math.sin(kart.h);
    const fz = Math.cos(kart.h);
    const probe = new TrackProbe(this.track);
    const x = kart.x + fx * 3;
    const z = kart.z + fz * 3;
    probe.reset(x, z, kart.probe.distance);
    this.projectiles.push({
      type: 'seeker', x, z, vx: fx * 40, vz: fz * 40, h: kart.h, owner: kart, life: 12, probe, mesh,
      grace: 0.5, target: null, retarget: 0,
    });
    this.race.emit('itemUse', kart, { id: 'seeker' });
  }

  _dropOil(kart) {
    const fx = Math.sin(kart.h);
    const fz = Math.cos(kart.h);
    const x = kart.x - fx * 3.0;
    const z = kart.z - fz * 3.0;
    const mat = new THREE.MeshBasicMaterial({ map: this.oilTex, transparent: true, depthWrite: false });
    const mesh = new THREE.Mesh(this.oilGeo, mat);
    mesh.position.set(x, 0.055, z);
    mesh.rotation.y = Math.random() * 6;
    mesh.renderOrder = 1;
    this.scene.add(mesh);
    const probe = new TrackProbe(this.track);
    probe.reset(x, z, kart.probe.distance);
    this.hazards.push({ type: 'oil', x, z, r: 2.2, life: 30, owner: kart, grace: 1.0, mesh, probe });
    this.race.emit('itemUse', kart, { id: 'oil', x, z });
  }

  _pulse(kart) {
    const race = this.race;
    race.emit('pulse', kart, { x: kart.x, z: kart.z });
    for (const k of race.karts) {
      if (k === kart) continue;
      if (k.probe.distance > kart.probe.distance && !k.finished) k.hit('pulse', race, kart);
    }
  }

  // ---------------------------------------------------------------- projectiles

  _updateProjectiles(dt) {
    const race = this.race;
    const t = this.track;
    for (let n = this.projectiles.length - 1; n >= 0; n--) {
      const p = this.projectiles[n];
      p.life -= dt;
      p.grace -= dt;
      let dead = p.life <= 0;

      if (p.type === 'seeker') {
        this._steerSeeker(p, dt);
      }
      p.x += p.vx * dt;
      p.z += p.vz * dt;
      p.probe.update(p.x, p.z);

      // walls
      const i = p.probe.idx;
      const lim = (p.probe.lat >= 0 ? t.limR[i] : t.limL[i]) - 0.8;
      const over = Math.abs(p.probe.lat) - lim;
      if (over > 0) {
        const sg = p.probe.lat >= 0 ? 1 : -1;
        const ox = t.nx[i] * sg;
        const oz = t.nz[i] * sg;
        p.x -= ox * over;
        p.z -= oz * over;
        if (p.type === 'bolt') {
          const vn = p.vx * ox + p.vz * oz;
          if (vn > 0) {
            p.vx -= 2 * vn * ox;
            p.vz -= 2 * vn * oz;
            p.bounces++;
            race.emit('bounce', p.owner, { x: p.x, z: p.z });
            if (p.bounces > 3) dead = true;
          }
        }
        p.probe.update(p.x, p.z);
      }

      // kart hits
      if (!dead) {
        for (const k of race.karts) {
          if (k === p.owner && p.grace > 0) continue;
          const dx = k.x - p.x;
          const dz = k.z - p.z;
          const rr = KART_RADIUS + (p.type === 'seeker' ? 0.9 : 0.8);
          if (dx * dx + dz * dz < rr * rr) {
            const res = k.hit(p.type, race, p.owner);
            if (res !== 'ignored') {
              race.emit('projectileHit', k, { x: p.x, z: p.z, type: p.type, result: res });
              dead = true;
              break;
            }
          }
        }
      }

      if (dead) {
        this.scene.remove(p.mesh);
        this.projectiles.splice(n, 1);
        continue;
      }
      p.mesh.position.set(p.x, 0.9, p.z);
      if (p.type === 'bolt') {
        p.mesh.rotation.y = Math.atan2(p.vx, p.vz);
        p.mesh.rotation.z += dt * 12;
        race.particles.spark(p.x, 0.9, p.z, (Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2, 0xffd23f, 0.25, 0.3);
      } else {
        p.mesh.rotation.y = Math.atan2(p.vx, p.vz);
        race.particles.flame(p.x - Math.sin(p.mesh.rotation.y) * 1.2, 0.9, p.z - Math.cos(p.mesh.rotation.y) * 1.2, 0, 0.5, 0, 0xff7a2a, 0.3, 0.8);
        race.particles.smoke(p.x - Math.sin(p.mesh.rotation.y) * 1.6, 0.9, p.z - Math.cos(p.mesh.rotation.y) * 1.6, 0, 0.2, 0, 0xaaaaaa, 0.5, 0.7, 0.35);
      }
    }
  }

  _steerSeeker(p, dt) {
    const race = this.race;
    const t = this.track;
    const speed = Math.min(66, Math.hypot(p.vx, p.vz) + 90 * dt);
    p.retarget -= dt;
    if (p.retarget <= 0 || (p.target && p.target.finished)) {
      p.retarget = 0.4;
      let best = null;
      let bd = Infinity;
      const own = p.owner.probe.distance;
      for (const k of race.karts) {
        if (k === p.owner || k.finished) continue;
        const gap = k.probe.distance - p.probe.distance;
        if (gap > -3 && gap < bd && k.probe.distance > own - 5) {
          bd = gap;
          best = k;
        }
      }
      p.target = best;
    }
    let aimX;
    let aimZ;
    const tg = p.target;
    if (tg && tg.probe.distance - p.probe.distance < 22) {
      aimX = tg.x;
      aimZ = tg.z;
    } else {
      // run along the track toward the target's lateral position
      const ahead = 26;
      const iT = (p.probe.idx + Math.round(ahead / t.ds)) % t.N;
      const lat = tg ? clamp(tg.probe.lat, -t.w[iT] / 2 + 2, t.w[iT] / 2 - 2) : 0;
      aimX = t.x[iT] + t.nx[iT] * lat;
      aimZ = t.z[iT] + t.nz[iT] * lat;
    }
    const want = Math.atan2(aimX - p.x, aimZ - p.z);
    const cur = Math.atan2(p.vx, p.vz);
    const diff = wrapPi(want - cur);
    const turn = clamp(diff, -6 * dt, 6 * dt);
    const nh = cur + turn;
    p.vx = Math.sin(nh) * speed;
    p.vz = Math.cos(nh) * speed;
  }

  // ---------------------------------------------------------------- hazards

  _updateHazards(dt) {
    const race = this.race;
    for (let n = this.hazards.length - 1; n >= 0; n--) {
      const h = this.hazards[n];
      h.life -= dt;
      h.grace -= dt;
      let dead = h.life <= 0;
      if (!dead) {
        for (const k of race.karts) {
          if (k === h.owner && h.grace > 0) continue;
          const dx = k.x - h.x;
          const dz = k.z - h.z;
          const rr = h.r + KART_RADIUS * 0.4;
          if (dx * dx + dz * dz < rr * rr && k.airY < 0.6) {
            const res = k.hit('oil', race, h.owner);
            if (res !== 'ignored') {
              if (res === 'hit') k.slick = 0.8;
              race.emit('projectileHit', k, { x: h.x, z: h.z, type: 'oil', result: res });
              dead = res === 'blocked' || res === 'hit';
              if (dead) break;
            }
          }
        }
      }
      if (h.life < 3) h.mesh.material.opacity = Math.max(0, h.life / 3);
      if (dead) {
        this.scene.remove(h.mesh);
        h.mesh.material.dispose();
        this.hazards.splice(n, 1);
      }
    }
  }
}
