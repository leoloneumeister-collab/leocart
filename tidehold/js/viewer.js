// Dev tool: look at the Blender models in Three.js the way the game will.
// ?m=units/squire,units/brute&clip=run&cols=4&yaw=35&pitch=30&zoom=1&t=0.4  (t freezes time at t seconds into the clip)
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';

const q = new URLSearchParams(location.search);
const names = (q.get('m') || 'units/squire').split(',');
const clipName = q.get('clip') || 'idle';
const cols = Number(q.get('cols') || Math.min(names.length, 5));
const yaw = Number(q.get('yaw') || 35);
const pitch = Number(q.get('pitch') || 30);
const zoom = Number(q.get('zoom') || 1);
const freeze = q.has('t') ? Number(q.get('t')) : null;
const spacing = Number(q.get('gap') || 1.6);

const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#6fb7e6');
scene.add(new THREE.HemisphereLight(q.get('sky') || '#dff0ff', q.get('gnd') || '#6a8f4a', Number(q.get('hemi') || 1.35)));
const sun = new THREE.DirectionalLight('#fff1d6', Number(q.get('sun') || 2.0));
if (q.get('tm') === 'neutral') renderer.toneMapping = THREE.NeutralToneMapping;
if (q.get('tm') === 'aces') renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = Number(q.get('exp') || 1);
sun.position.set(-6, 10, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 40 });
sun.shadow.bias = -0.0005;
scene.add(sun);
const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshLambertMaterial({ color: '#8fd46d' }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const loader = new GLTFLoader();
const mixers = [];
const info = [];
const rows = Math.ceil(names.length / cols);
let n = 0;
for (const name of names) {
  const gltf = await loader.loadAsync(`./public/models/${name}.glb`);
  const root = SkeletonUtils.clone(gltf.scene);
  root.traverse((o) => {
    if (o.isMesh || o.isSkinnedMesh) {
      const old = o.material;
      if (old.emissive && old.emissive.getHex() > 0) o.material = new THREE.MeshBasicMaterial({ color: old.emissive.clone() });
      else o.material = new THREE.MeshLambertMaterial({ vertexColors: !!o.geometry.attributes.color, color: o.geometry.attributes.color ? 0xffffff : old.color });
      o.castShadow = true;
      o.frustumCulled = false;
    }
  });
  const c = n % cols;
  const r = Math.floor(n / cols);
  root.position.set((c - (cols - 1) / 2) * spacing, 0, (r - (rows - 1) / 2) * spacing);
  scene.add(root);
  if (gltf.animations.length) {
    const mixer = new THREE.AnimationMixer(root);
    const clip = gltf.animations.find((a) => a.name === clipName) || gltf.animations[0];
    const act = mixer.clipAction(clip);
    if (clip.name === 'die' || clip.name === 'attack') act.setLoop(THREE.LoopOnce, 1);
    act.clampWhenFinished = true;
    act.play();
    if (freeze !== null) { mixer.setTime(freeze); }
    mixers.push(mixer);
  }
  info.push(`${name}: ${gltf.animations.map((a) => `${a.name}(${a.duration.toFixed(2)}s)`).join(' ') || 'static'}`);
  n++;
}
document.getElementById('info').textContent = info.join('\n');

const cam = new THREE.PerspectiveCamera(30, window.innerWidth / window.innerHeight, 0.1, 200);
const dist = (3.2 + Math.max(cols, rows) * spacing * 1.25) / zoom;
const yr = (yaw * Math.PI) / 180;
const pr = (pitch * Math.PI) / 180;
cam.position.set(Math.sin(yr) * Math.cos(pr) * dist, Math.sin(pr) * dist + 0.4, Math.cos(yr) * Math.cos(pr) * dist);
cam.lookAt(0, 0.45, 0);
let last = performance.now();
let frames = 0;
function loop() {
  const now = performance.now();
  const dt = (now - last) / 1000;
  last = now;
  if (freeze === null) for (const m of mixers) m.update(dt);
  renderer.render(scene, cam);
  frames++;
  window.__frames = frames;
  requestAnimationFrame(loop);
}
loop();
window.__ready = true;
