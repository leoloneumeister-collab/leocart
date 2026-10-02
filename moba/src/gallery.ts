/** Debug page (`?gallery=1`): lines up every model so they can be inspected and screenshotted. */
import * as THREE from 'three';
import { CHAMPION_IDS, CHAMPIONS } from './data/champions.ts';
import { MINIONS } from './data/units.ts';
import { lambert } from './render/geo.ts';
import { buildChampion, buildInhibitor, buildMinionGeometry, buildMonster, buildNexus, buildTower } from './render/models.ts';
import type { MinionType } from './sim/types.ts';

export function startGallery(parent: HTMLElement) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  parent.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x2a3140);
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x35432e, 1.3));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.4);
  sun.position.set(-20, 40, 30);
  scene.add(sun);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 60), new THREE.MeshStandardMaterial({ color: 0x4a6a44 }));
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  let x = -34;
  const champs: ReturnType<typeof buildChampion>[] = [];
  for (const id of CHAMPION_IDS) {
    const rig = buildChampion(CHAMPIONS[id]);
    rig.root.position.set(x, 0, 6);
    rig.root.rotation.y = 0.5;
    scene.add(rig.root);
    champs.push(rig);
    x += 8;
  }
  x = -34;
  for (const type of ['melee', 'caster', 'cannon', 'super'] as MinionType[]) {
    for (const team of [0, 1]) {
      const m = new THREE.Mesh(buildMinionGeometry(type, team), lambert(0xffffff, { vertexColors: true }));
      m.position.set(x, 0, -2);
      m.rotation.y = 0.5;
      scene.add(m);
      x += MINIONS[type].radius * 2 + 2.5;
    }
  }
  const t1 = buildTower(0, 2.6, 11);
  t1.root.position.set(-28, 0, -14);
  const t2 = buildTower(1, 2.6, 11);
  t2.root.position.set(-20, 0, -14);
  const ih = buildInhibitor(0, 3.2);
  ih.root.position.set(-12, 0, -14);
  const nx = buildNexus(1, 5.5);
  nx.root.position.set(2, 0, -14);
  scene.add(t1.root, t2.root, ih.root, nx.root);
  let mx = 16;
  for (const [n, big, r, h] of [['Moss Brute', true, 1.6, 3.8], ['Thornback', true, 1.3, 3], ['Crystal Golem', true, 2, 4.6]] as [string, boolean, number, number][]) {
    const g = buildMonster(n, big, r, h);
    g.position.set(mx, 0, -14);
    scene.add(g);
    mx += 7;
  }
  const cam = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.5, 400);
  cam.position.set(-6, 22, 42);
  cam.lookAt(-6, 3, -2);
  const clock = new THREE.Clock();
  const loop = () => {
    const t = clock.getElapsedTime();
    champs.forEach((c, i) => {
      c.legL.rotation.x = Math.sin(t * 5 + i) * 0.7;
      c.legR.rotation.x = -Math.sin(t * 5 + i) * 0.7;
      c.armL.rotation.x = -Math.sin(t * 5 + i) * 0.5;
      c.armR.rotation.x = Math.sin(t * 5 + i) * 0.5;
    });
    renderer.render(scene, cam);
    requestAnimationFrame(loop);
  };
  loop();
}
