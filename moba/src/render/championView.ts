/** Scene object for one champion: the skinned hero model, team ring, and the mapping from sim state to animation inputs. */
import * as THREE from 'three';
import { CHAMPIONS } from '../data/champions.ts';
import type { Unit } from '../sim/types.ts';
import type { World } from '../sim/world.ts';
import { angleLerp } from '../sim/math.ts';
import { newAnimState } from './biped.ts';
import type { AnimState } from './biped.ts';
import { teamColor } from './geo.ts';
import { buildHero } from './heroes/index.ts';
import type { HeroModel } from './heroes/index.ts';

const FIXED_DT = 1 / 30;
const ATTACK_DUR = 0.46;
const CAST_DUR = 0.75;
const DEATH_SHOW = 1.5;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export class ChampionView {
  readonly group = new THREE.Group();
  readonly model: HeroModel;
  readonly ring: THREE.Mesh;
  private readonly st: AnimState = newAnimState();
  private yaw: number;
  private prevYaw: number;
  private speed = 0;
  private prevSpeed = 0;
  private attackT = 0;
  private castT = 0;
  private castSlot = 0;
  private hurtT = 0;
  private deadT = 0;
  private atkCount = 0;
  private leanX = 0;
  private leanZ = 0;

  constructor(u: Unit, isPlayer: boolean) {
    const def = CHAMPIONS[u.defId];
    this.model = buildHero(u.defId, u.team);
    const s = (def.height * 1.05) / this.model.height;
    this.model.group.scale.setScalar(s);
    this.group.add(this.model.group);
    const col = teamColor(u.team);
    const ringMat = new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide });
    this.ring = new THREE.Mesh(new THREE.RingGeometry(u.radius * 1.15, u.radius * 1.5, 40), ringMat);
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.08;
    this.ring.renderOrder = 1;
    this.group.add(this.ring);
    if (isPlayer) {
      const sel = new THREE.Mesh(new THREE.RingGeometry(u.radius * 1.7, u.radius * 1.85, 48), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false, side: THREE.DoubleSide }));
      sel.rotation.x = -Math.PI / 2;
      sel.position.y = 0.09;
      this.group.add(sel);
    }
    this.yaw = u.facing;
    this.prevYaw = u.facing;
    this.st.spawn = 9;
  }

  onAttack() {
    this.attackT = ATTACK_DUR;
    this.atkCount++;
  }

  onCast(slot: number) {
    this.castT = CAST_DUR;
    this.castSlot = slot;
  }

  onHurt() {
    this.hurtT = 0.22;
  }

  /** Position the view for this frame and drive the animation. */
  update(u: Unit, w: World, alpha: number, dt: number, t: number, visible: boolean) {
    const st = this.st;
    if (u.alive) this.deadT = 0;
    else this.deadT += dt;
    const show = visible && (u.alive || this.deadT < DEATH_SHOW);
    this.group.visible = show;
    if (!show) return;
    let x = u.px + (u.x - u.px) * alpha;
    let z = u.pz + (u.z - u.pz) * alpha;
    if (Math.hypot(u.x - u.px, u.z - u.pz) > 7) {
      x = u.x;
      z = u.z;
    }
    const airborne = u.statuses.some((s) => s.type === 'stun' && s.tag === 'airborne' && s.until > w.time);
    let y = 0;
    if (airborne) y = 2.4 * Math.sin(Math.min(1, (w.time % 1) * 1.6) * Math.PI * 0.5 + 0.3);
    if (u.dash) y = 1.0;
    this.group.position.set(x, y, z);
    this.ring.visible = u.alive;
    if (u.alive) this.yaw = angleLerp(this.yaw, u.facing, Math.min(1, dt * 14));
    this.group.rotation.y = this.yaw;

    const sp = u.alive ? u.moved / FIXED_DT : 0;
    this.speed += (sp - this.speed) * Math.min(1, dt * 12);
    const acc = dt > 0 ? (this.speed - this.prevSpeed) / dt : 0;
    this.prevSpeed = this.speed;
    let dyaw = this.yaw - this.prevYaw;
    dyaw = Math.atan2(Math.sin(dyaw), Math.cos(dyaw));
    this.prevYaw = this.yaw;
    this.leanX += (clamp(acc * 0.0035, -0.3, 0.3) - this.leanX) * Math.min(1, dt * 6);
    this.leanZ += (clamp(dt > 0 ? (dyaw / dt) * 0.02 : 0, -0.3, 0.3) - this.leanZ) * Math.min(1, dt * 6);

    this.attackT = Math.max(0, this.attackT - dt);
    this.castT = Math.max(0, this.castT - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);

    st.t = t;
    st.dt = dt;
    st.moveK = clamp(this.speed / 4, 0, 1);
    st.speed = this.speed;
    st.phase += this.speed * dt * 1.9;
    st.atk = this.attackT > 0 ? 1 - this.attackT / ATTACK_DUR : 0;
    st.atkIdx = this.atkCount;
    st.cast = this.castT > 0 ? 1 - this.castT / CAST_DUR : 0;
    st.castSlot = this.castSlot;
    st.dead = u.alive ? 0 : Math.max(0.001, this.deadT);
    st.dash = !!u.dash;
    st.air = airborne;
    st.stun = !airborne && u.statuses.some((s) => s.type === 'stun' && s.until > w.time);
    st.recall = u.alive && u.order.t === 'recall';
    st.leanX = this.leanX;
    st.leanZ = this.leanZ;
    st.hurt = this.hurtT / 0.22;
    this.model.update(st);
    (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.7 + Math.sin(t * 4) * 0.12;
  }
}
