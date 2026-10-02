/** Fog of war visuals: a low resolution visibility texture sampled by terrain materials. */
import * as THREE from 'three';
import { visionRadius } from '../sim/vision.ts';
import type { Team } from '../sim/types.ts';
import type { World } from '../sim/world.ts';
import { GROUND_SIZE } from './terrain.ts';
import { MAP_HALF } from '../data/map.ts';

const RES = 256;
const PAD = (GROUND_SIZE - MAP_HALF * 2) / 2;

export class FogOfWar {
  readonly texture: THREE.CanvasTexture;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private enabled = true;
  private acc = 0;
  private uniforms = { fogMap: { value: null as THREE.Texture | null }, fogOn: { value: 1 }, fogSize: { value: GROUND_SIZE } };

  constructor() {
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.canvas.height = RES;
    this.ctx = this.canvas.getContext('2d')!;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.magFilter = THREE.LinearFilter;
    this.uniforms.fogMap.value = this.texture;
    this.ctx.fillStyle = '#fff';
    this.ctx.fillRect(0, 0, RES, RES);
    this.texture.needsUpdate = true;
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.uniforms.fogOn.value = on ? 1 : 0;
  }

  /** Patch a lit material so it darkens where the viewer's team has no vision. */
  patch(mat: THREE.Material, instanced = false) {
    const u = this.uniforms;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.fogMap = u.fogMap;
      shader.uniforms.fogOn = u.fogOn;
      shader.uniforms.fogSize = u.fogSize;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vFogXZ;')
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>\n#ifdef USE_INSTANCING\n vec4 fogW = modelMatrix * instanceMatrix * vec4(transformed, 1.0);\n#else\n vec4 fogW = modelMatrix * vec4(transformed, 1.0);\n#endif\n vFogXZ = fogW.xz;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec2 vFogXZ;\nuniform sampler2D fogMap;\nuniform float fogOn;\nuniform float fogSize;')
        .replace(
          '#include <dithering_fragment>',
          `#include <dithering_fragment>\n float fogV = texture2D(fogMap, vFogXZ / fogSize + 0.5).r;\n gl_FragColor.rgb *= mix(1.0, mix(0.34, 1.0, fogV), fogOn);`,
        );
    };
    mat.needsUpdate = true;
    void instanced;
  }

  update(w: World, team: Team, dt: number) {
    if (!this.enabled) return;
    this.acc += dt;
    if (this.acc < 0.12) return;
    this.acc = 0;
    const ctx = this.ctx;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, RES, RES);
    ctx.globalCompositeOperation = 'lighten';
    const k = RES / GROUND_SIZE;
    for (const u of w.units) {
      if (u.team !== team || !u.alive) continue;
      const r = visionRadius(u);
      if (r <= 0) continue;
      const x = (u.x + MAP_HALF + PAD) * k;
      const z = (u.z + MAP_HALF + PAD) * k;
      const rr = r * k;
      const g = ctx.createRadialGradient(x, z, rr * 0.55, x, z, rr * 1.05);
      g.addColorStop(0, '#fff');
      g.addColorStop(1, '#000');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, z, rr * 1.05, 0, Math.PI * 2);
      ctx.fill();
    }
    this.texture.needsUpdate = true;
  }
}
