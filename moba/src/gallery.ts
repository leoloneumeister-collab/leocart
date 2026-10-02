/**
 * Look-dev page (`?gallery=1`). Lines up the hero models under the real lighting and post
 * processing so they can be inspected and screenshotted. `window.__lab` lets tests pose them.
 */
import * as THREE from 'three';
import { newAnimState } from './render/biped.ts';
import type { AnimState } from './render/biped.ts';
import { buildHero, hasHero } from './render/heroes/index.ts';
import type { HeroModel } from './render/heroes/index.ts';
import { RenderPipeline, setupLighting } from './render/pipeline.ts';
import { tickMaterials } from './render/materials.ts';
import { CHAMPION_IDS } from './data/champions.ts';
import { Crowd } from './render/crowd.ts';
import { MONSTER_KEYS, buildMinionModel, buildMonsterModel } from './render/minions.ts';

declare global {
  interface Window {
    __lab?: {
      set: (o: { state?: string; t?: number; angle?: number; cam?: string; team?: number; only?: string; zoom?: number }) => void;
      frame: () => void;
    };
  }
}

export function startGallery(parent: HTMLElement) {
  const params = new URLSearchParams(location.search);
  const quality = (params.get('quality') as 'low' | 'medium' | 'high') ?? 'medium';
  const renderer = new THREE.WebGLRenderer({ antialias: quality === 'low', powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = quality !== 'low';
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  parent.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x24303a);
  const lights = setupLighting(scene, renderer, quality);
  lights.sun.position.set(-18, 40, 28);
  lights.sun.target.position.set(0, 0, 0);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(60, 48), new THREE.MeshStandardMaterial({ color: 0x5a7a4c, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);
  const cam = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.5, 400);
  const pipeline = new RenderPipeline(renderer, scene, cam, quality, window.innerWidth, window.innerHeight);

  const showCrowd = params.get('crowd') === '1';
  const crowd = showCrowd ? new Crowd(scene, () => {}, quality) : null;
  const crowdKeys: string[] = [];
  if (crowd) {
    for (const team of [0, 1]) for (const t of ['melee', 'caster', 'cannon', 'super'] as const) {
      const key = `minion:${t}:${team}`;
      crowd.register(key, buildMinionModel(t, team), 8);
      crowdKeys.push(key);
    }
    for (const n of MONSTER_KEYS) {
      const key = `monster:${n}`;
      crowd.register(key, buildMonsterModel(n), 8);
      crowdKeys.push(key);
    }
  }
  let team = Number(params.get('team') ?? 0);
  let heroes: { id: string; model: HeroModel; st: AnimState }[] = [];
  let only = params.get('only') ?? '';
  let state = params.get('state') ?? 'idle';
  let tNow = Number(params.get('t') ?? 0);
  let angle = Number(params.get('angle') ?? 0.5);
  let camMode = params.get('cam') ?? 'front';
  let zoom = Number(params.get('zoom') ?? 1);

  function rebuild() {
    for (const h of heroes) scene.remove(h.model.group);
    heroes = [];
    const ids = CHAMPION_IDS.filter((id) => hasHero(id) && (!only || only === id) && !showCrowd);
    const spacing = 9;
    ids.forEach((id, i) => {
      const model = buildHero(id, team);
      model.group.position.set((i - (ids.length - 1) / 2) * spacing, 0, 0);
      model.group.rotation.y = angle;
      scene.add(model.group);
      heroes.push({ id, model, st: newAnimState() });
    });
  }

  function pose(h: { model: HeroModel; st: AnimState }) {
    const st = h.st;
    st.t = tNow;
    st.dt = 1 / 60;
    st.moveK = state === 'run' ? 1 : 0;
    st.phase = tNow * 9;
    st.speed = state === 'run' ? 7 : 0;
    st.atk = state === 'attack' ? (tNow % 0.9) / 0.9 : 0;
    st.cast = state.startsWith('cast') ? (tNow % 1.2) / 1.2 : 0;
    st.castSlot = state.startsWith('cast') ? Number(state.slice(4)) : 0;
    st.dead = state === 'dead' ? tNow : 0;
    st.stun = state === 'stun';
    st.air = state === 'air';
    st.dash = state === 'dash';
    h.model.update(st);
  }

  function frame() {
    tickMaterials(tNow);
    if (crowd) {
      crowd.begin();
      crowdKeys.forEach((k, i) => {
        const x = (i - (crowdKeys.length - 1) / 2) * 6.2;
        const moving = state === 'run';
        crowd.push(k, x, 0, 0, angle, tNow * 9, moving ? 1 : 0, state === 'attack' ? (tNow % 0.9) / 0.9 : 0, state === 'dead' ? tNow % 1.2 : 0);
      });
      crowd.end();
    }
    for (const h of heroes) {
      h.model.group.rotation.y = angle;
      pose(h);
    }
    const n = crowd ? crowdKeys.length * 0.7 : Math.max(1, heroes.length);
    const span = n * 9 * 0.62 * zoom;
    if (camMode === 'game') {
      const pitch = THREE.MathUtils.degToRad(62);
      const d = 56 * zoom * (n > 1 ? 0.9 : 0.42);
      cam.position.set(0, Math.sin(pitch) * d + 0, Math.cos(pitch) * d);
      cam.lookAt(0, 0.5, 0);
    } else {
      cam.position.set(0, 5.2 * zoom + (n > 1 ? 3 : 0), span + 6);
      cam.lookAt(0, 2.4, 0);
    }
    pipeline.render(1 / 60);
  }

  window.__lab = {
    set: (o) => {
      if (o.state !== undefined) state = o.state;
      if (o.t !== undefined) tNow = o.t;
      if (o.angle !== undefined) angle = o.angle;
      if (o.cam !== undefined) camMode = o.cam;
      if (o.zoom !== undefined) zoom = o.zoom;
      if (o.team !== undefined && o.team !== team) {
        team = o.team;
        rebuild();
      }
      if (o.only !== undefined && o.only !== only) {
        only = o.only;
        rebuild();
      }
      frame();
    },
    frame,
  };
  rebuild();
  const loop = () => {
    if (params.get('anim') !== '0') tNow += 1 / 60;
    frame();
    requestAnimationFrame(loop);
  };
  if (params.get('anim') === '0') frame();
  else loop();
  window.addEventListener('resize', () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    cam.aspect = window.innerWidth / window.innerHeight;
    cam.updateProjectionMatrix();
    pipeline.setSize(window.innerWidth, window.innerHeight);
  });
}
