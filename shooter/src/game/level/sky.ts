import * as THREE from 'three';
import { makeCanvas } from '../../engine/util';

export interface SkyOpts {
  top: number; horizon: number; ground: number;
  sunDir: THREE.Vector3; sunColor: number; sunSize: number;
  stars: boolean;
}

export function makeSky(o: SkyOpts) {
  const group = new THREE.Group();
  const geo = new THREE.SphereGeometry(400, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(o.top) }, horizon: { value: new THREE.Color(o.horizon) }, ground: { value: new THREE.Color(o.ground) } },
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 top, horizon, ground; varying vec3 vP;
      void main(){ float h = normalize(vP).y;
        vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.55)) : mix(horizon, ground, smoothstep(0.0, -0.25, h));
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const dome = new THREE.Mesh(geo, mat);
  dome.renderOrder = -10;
  group.add(dome);

  // sun / moon glow
  const cv = makeCanvas(128, 128);
  const g = cv.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 2, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.12, 'rgba(255,255,255,0.95)');
  grd.addColorStop(0.2, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(cv), color: o.sunColor, fog: false, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending,
  }));
  sprite.scale.setScalar(o.sunSize);
  sprite.position.copy(o.sunDir).normalize().multiplyScalar(380);
  group.add(sprite);

  if (o.stars) {
    const n = 700;
    const p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const v = new THREE.Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.08, Math.random() - 0.5).normalize().multiplyScalar(390);
      p.set([v.x, v.y, v.z], i * 3);
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(p, 3));
    const stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xbfd4ff, size: 1.6, sizeAttenuation: false, fog: false, transparent: true, opacity: 0.8, depthWrite: false }));
    group.add(stars);
  }
  return group;
}

export function makeEnv(renderer: THREE.WebGLRenderer, sky: THREE.Object3D) {
  const pm = new THREE.PMREMGenerator(renderer);
  const s = new THREE.Scene();
  s.add(sky.clone(true));
  const rt = pm.fromScene(s, 0.02);
  pm.dispose();
  return rt.texture;
}

export function makeSea(w: number, d: number, cx: number, cz: number, color: number) {
  const geo = new THREE.PlaneGeometry(w, d, 1, 1);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.12, metalness: 0.7, transparent: true, opacity: 0.95 });
  const m = new THREE.Mesh(geo, mat);
  m.position.set(cx, -0.25, cz);
  m.receiveShadow = false;
  return m;
}
