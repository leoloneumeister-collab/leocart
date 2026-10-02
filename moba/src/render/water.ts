/** Animated river along the map diagonal: shifting colour, glints, soft banks and foam. */
import * as THREE from 'three';
import { MAP_HALF } from '../data/map.ts';
import { NOISE, SHARED, chainPatch } from './materials.ts';

export const RIVER_HALF_WIDTH = 8.5;

export function buildWater(hook: (m: THREE.Material) => void): THREE.Mesh {
  const len = MAP_HALF * 2 * Math.SQRT2 + 30;
  const geo = new THREE.PlaneGeometry(len, RIVER_HALF_WIDTH * 2 + 6, 1, 1);
  geo.rotateX(-Math.PI / 2);
  // river runs along x = z: rotate the plane's long axis (x) onto the (1,0,1) diagonal
  geo.rotateY(-Math.PI / 4);
  const mat = new THREE.MeshStandardMaterial({ color: 0x2f8fa8, roughness: 0.3, metalness: 0.0, transparent: true, depthWrite: false, envMapIntensity: 0.5 });
  chainPatch(mat, 'water', (shader) => {
    shader.uniforms.uTime = SHARED.uTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWaterW;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvWaterW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWaterW;\nuniform float uTime;\n${NOISE}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  float wd = (vWaterW.x - vWaterW.z) * 0.70710678;
  float wa = (vWaterW.x + vWaterW.z) * 0.70710678;
  float aw = abs(wd);
  float mid = 1.0 - smoothstep(2.0, ${(RIVER_HALF_WIDTH).toFixed(1)}, aw);
  vec2 q = vec2(wa * 0.045, wd * 0.11);
  float n1 = lfFbm(vec3(q * 3.0 + vec2(uTime * 0.18, 0.0), uTime * 0.12));
  float n2 = lfNoise(vec3(q * 9.0 + vec2(uTime * 0.42, uTime * 0.05), uTime * 0.35 + 7.0));
  float n3 = lfNoise(vec3(q * 22.0 - vec2(uTime * 0.6, 0.0), uTime * 0.5));
  vec3 shallow = vec3(0.10, 0.40, 0.44);
  vec3 deep = vec3(0.03, 0.17, 0.30);
  vec3 wc = mix(shallow, deep, clamp(mid * 0.85 + (n1 - 0.5) * 0.5, 0.0, 1.0));
  float glint = smoothstep(0.66, 0.86, n2 * 0.65 + n3 * 0.45);
  wc += vec3(0.35, 0.6, 0.7) * glint * 0.28;
  float foam = smoothstep(${(RIVER_HALF_WIDTH - 2.4).toFixed(1)}, ${(RIVER_HALF_WIDTH - 0.3).toFixed(1)}, aw + (n2 - 0.5) * 1.4);
  wc = mix(wc, vec3(0.55, 0.65, 0.68), foam * 0.7 * (0.55 + 0.45 * n3));
  diffuseColor.rgb = wc;
  diffuseColor.a = (1.0 - smoothstep(${(RIVER_HALF_WIDTH - 0.6).toFixed(1)}, ${(RIVER_HALF_WIDTH + 1.6).toFixed(1)}, aw)) * 0.94;
}`,
      );
  });
  hook(mat);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.06;
  mesh.renderOrder = 0.5;
  mesh.receiveShadow = false;
  return mesh;
}
