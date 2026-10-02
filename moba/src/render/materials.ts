/**
 * Stylised material helpers. Heroes, minions and props use PBR materials patched with a few
 * painterly touches: a soft fresnel rim light, fake ambient occlusion on undersides and a
 * low-frequency "brush stroke" variation of the base colour. Glowing parts use unlit materials
 * with colours above 1.0 so the bloom pass picks them up.
 */
import * as THREE from 'three';

export const SHARED = {
  uTime: { value: 0 },
};

export function tickMaterials(t: number) {
  SHARED.uTime.value = t;
}

/**
 * Compose shader patches on one material. Each patch gets the shader after the earlier patches ran,
 * and the program cache key accumulates so differently patched materials never share a program.
 */
export function chainPatch(mat: THREE.Material, key: string, fn: (shader: THREE.WebGLProgramParametersWithUniforms) => void) {
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey;
  const hadKey = prev !== THREE.Material.prototype.onBeforeCompile;
  const base = hadKey ? prevKey.call(mat) : '';
  mat.onBeforeCompile = (shader, renderer) => {
    prev.call(mat, shader, renderer);
    fn(shader);
  };
  mat.customProgramCacheKey = () => `${base}|${key}`;
  mat.needsUpdate = true;
}

export const NOISE = /* glsl */ `
float lfHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float lfNoise(vec3 x){
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(lfHash(i + vec3(0,0,0)), lfHash(i + vec3(1,0,0)), f.x), mix(lfHash(i + vec3(0,1,0)), lfHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(lfHash(i + vec3(0,0,1)), lfHash(i + vec3(1,0,1)), f.x), mix(lfHash(i + vec3(0,1,1)), lfHash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float lfFbm(vec3 p){ return lfNoise(p) * 0.55 + lfNoise(p * 2.07) * 0.28 + lfNoise(p * 4.3) * 0.17; }
`;

export interface StyleOpts {
  /** Rim light strength (0 disables). */
  rim?: number;
  rimPower?: number;
  rimColor?: number;
  /** Strength of the painted colour variation. */
  paint?: number;
  paintScale?: number;
  /** Darkening of surfaces that face down. */
  ao?: number;
}


/** Patch a lit three.js material with the house style. Safe to call once per material. */
export function stylize<T extends THREE.Material>(mat: T, o: StyleOpts = {}): T {
  const rim = o.rim ?? 0.5;
  const rimPower = o.rimPower ?? 2.6;
  const rimColor = new THREE.Color(o.rimColor ?? 0xbfd8ff);
  const paint = o.paint ?? 0.18;
  const paintScale = o.paintScale ?? 0.9;
  const ao = o.ao ?? 0.32;
  chainPatch(mat, `lf:${rim}:${rimPower}:${rimColor.getHex()}:${paint}:${paintScale}:${ao}`, (shader) => {
    shader.uniforms.uTime = SHARED.uTime;
    shader.uniforms.uRimColor = { value: rimColor };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vLfWPos;\nuniform float uTime;`)
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>\n{ vec4 lfW = vec4(transformed, 1.0);\n#ifdef USE_INSTANCING\n lfW = instanceMatrix * lfW;\n#endif\n lfW = modelMatrix * lfW; vLfWPos = lfW.xyz; }`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vLfWPos;\nuniform vec3 uRimColor;\nuniform float uTime;\n${NOISE}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>\n{ float lfN = lfNoise(vLfWPos * ${paintScale.toFixed(3)}) * 0.65 + lfNoise(vLfWPos * ${(paintScale * 3.1).toFixed(3)}) * 0.35; diffuseColor.rgb *= 1.0 + (lfN - 0.5) * ${(paint * 2).toFixed(3)}; }`,
      )
      .replace(
        '#include <opaque_fragment>',
        `{
  vec3 lfWN = inverseTransformDirection(normal, viewMatrix);
  outgoingLight *= mix(${(1 - ao).toFixed(3)}, 1.0, clamp(lfWN.y * 0.5 + 0.5, 0.0, 1.0));
  ${
    rim > 0
      ? `float lfNdV = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
  float lfRim = pow(1.0 - lfNdV, ${rimPower.toFixed(2)});
  outgoingLight += uRimColor * lfRim * ${rim.toFixed(3)} * (0.55 + 0.45 * clamp(lfWN.y + 0.4, 0.0, 1.0));`
      : ''
  }
}
#include <opaque_fragment>`,
      );
  });
  return mat;
}

export type Bucket = 'base' | 'metal' | 'cloth' | 'glow' | 'glass';

const cache = new Map<string, THREE.Material>();

/** Shared materials per bucket. Vertex colours carry the per-part colour. */
export function bucketMaterial(bucket: Bucket, o: { rimColor?: number } = {}): THREE.Material {
  const key = `${bucket}:${o.rimColor ?? 0}`;
  let m = cache.get(key);
  if (m) return m;
  switch (bucket) {
    case 'base':
      m = stylize(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.62, metalness: 0.04 }), { rimColor: o.rimColor });
      break;
    case 'metal':
      m = stylize(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.46, metalness: 0.42 }), { rim: 0.4, paint: 0.1, rimColor: o.rimColor });
      break;
    case 'cloth':
      m = stylize(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, metalness: 0, side: THREE.DoubleSide }), { rim: 0.4, paint: 0.22, rimColor: o.rimColor });
      break;
    case 'glass':
      m = stylize(
        new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.82, clearcoat: 1, emissiveIntensity: 0.4 }),
        { rim: 0.8, paint: 0.02, ao: 0.1, rimColor: o.rimColor },
      );
      break;
    case 'glow':
    default:
      m = new THREE.MeshBasicMaterial({ vertexColors: true, toneMapped: false });
      break;
  }
  cache.set(key, m);
  return m;
}

/** Inverted-hull outline: draw the same geometry again, pushed out along its normals, back faces only. */
export function outlineMaterial(color = 0x140f1e, thickness = 0.045): THREE.MeshBasicMaterial {
  const m = new THREE.MeshBasicMaterial({ color, side: THREE.BackSide });
  chainPatch(m, `outline:${thickness}`, (shader) => {
    shader.uniforms.uThick = { value: thickness };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uThick;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += normalize(normal) * uThick;');
  });
  return m;
}

/** Make a colour brighter than 1.0 so it blooms. */
export function hdr(color: number, boost = 1.8): THREE.Color {
  return new THREE.Color(color).multiplyScalar(boost);
}
