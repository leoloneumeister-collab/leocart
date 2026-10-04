/** Renders champion portraits (bust) and full body shots off screen into cached PNG data URLs for the UI. */
import * as THREE from 'three';
import { newAnimState } from './biped.ts';
import { buildHero } from './heroes/index.ts';
import { setupLighting } from './pipeline.ts';
import { tickMaterials } from './materials.ts';

const cache = new Map<string, string>();
let ctx: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.PerspectiveCamera } | null = null;
let broken = false;

function setup() {
  if (ctx) return ctx;
  const canvas = document.createElement('canvas');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene();
  const lights = setupLighting(scene, renderer, 'low');
  lights.sun.position.set(-6, 9, 10);
  lights.sun.castShadow = false;
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 100);
  ctx = { renderer, scene, camera };
  return ctx;
}

export type PortraitKind = 'bust' | 'full';

/** A PNG data URL for the champion, or '' if WebGL is unavailable (callers fall back to the letter icon). */
export function championPortrait(id: string, kind: PortraitKind = 'bust', team = 0): string {
  const key = `${id}:${kind}:${team}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  if (broken) return '';
  try {
    const { renderer, scene, camera } = setup();
    const w = kind === 'bust' ? 160 : 256;
    const h = kind === 'bust' ? 160 : 320;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const model = buildHero(id, team);
    model.group.rotation.y = kind === 'bust' ? 0.32 : 0.55;
    scene.add(model.group);
    const st = newAnimState();
    st.t = 0.4;
    model.update(st);
    tickMaterials(0.4);
    model.group.updateMatrixWorld(true);
    const H = model.height;
    if (kind === 'bust') {
      const head = new THREE.Vector3();
      model.anchors.head.getWorldPosition(head);
      const frame = H * 0.36;
      const dist = frame / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      camera.position.set(head.x + Math.sin(0.32) * 0.2, head.y - frame * 0.08, head.z + dist);
      camera.lookAt(head.x, head.y - frame * 0.1, head.z);
    } else {
      const frame = H * 1.12;
      const dist = frame / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)));
      camera.position.set(0, H * 0.5, dist);
      camera.lookAt(0, H * 0.48, 0);
    }
    renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL('image/png');
    scene.remove(model.group);
    model.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
    });
    cache.set(key, url);
    return url;
  } catch {
    broken = true;
    return '';
  }
}
