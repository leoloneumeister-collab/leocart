import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import type { Settings } from './save';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uVig: { value: 0.55 },
    uHurt: { value: 0 },
    uDesat: { value: 0 },
    uAb: { value: 0.004 },
    uGrain: { value: 0.022 },
    uFlash: { value: 0 },
    uShadow: { value: new THREE.Color(0.86, 1.0, 1.08) },
    uHigh: { value: new THREE.Color(1.1, 1.0, 0.88) },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uTime, uVig, uHurt, uDesat, uAb, uGrain, uFlash;
    uniform vec3 uShadow, uHigh;
    varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + uTime) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5;
      float r = length(c);
      float ab = uAb * r * r * 4.0;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + c * ab).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - c * ab).b;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(col, vec3(l), uDesat);
      col *= mix(uShadow, uHigh, smoothstep(0.0, 1.2, l));
      col *= 1.0 - uVig * smoothstep(0.28, 0.82, r);
      float edge = smoothstep(0.15, 0.75, r);
      col = mix(col, col * vec3(1.7, 0.25, 0.25) + vec3(0.12, 0.0, 0.0) * edge, uHurt * edge);
      col += vec3(1.0, 0.85, 0.6) * uFlash;
      col += (hash(vUv * 1024.0) - 0.5) * uGrain;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }
  `,
};

export type Quality = Settings['quality'];

export class GameRenderer {
  renderer: THREE.WebGLRenderer;
  composer: EffectComposer;
  worldPass!: RenderPass;
  viewPass!: RenderPass;
  bloom: UnrealBloomPass;
  grade: ShaderPass;
  fxaa: ShaderPass;
  quality: Quality = 'medium';
  pixelRatio = 1;
  private adaptScale = 1;
  private slowTime = 0;
  private fastTime = 0;
  shadows = true;

  constructor(private canvas: HTMLCanvasElement, scene: THREE.Scene, cam: THREE.Camera, viewScene: THREE.Scene, viewCam: THREE.Camera) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.autoClear = true;

    this.composer = new EffectComposer(this.renderer);
    this.worldPass = new RenderPass(scene, cam);
    this.viewPass = new RenderPass(viewScene, viewCam);
    this.viewPass.clear = false;
    this.viewPass.clearDepth = true;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.5, 0.55, 0.82);
    this.grade = new ShaderPass(GradeShader);
    this.composer.addPass(this.worldPass);
    this.composer.addPass(this.viewPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
    this.fxaa = new ShaderPass(FXAAShader);
    this.composer.addPass(this.fxaa);
    this.setQuality('medium');
    window.addEventListener('resize', () => this.resize());
  }

  setScenes(scene: THREE.Scene, cam: THREE.Camera) {
    this.worldPass.scene = scene;
    this.worldPass.camera = cam;
  }

  setQuality(q: Quality) {
    this.quality = q;
    const dpr = window.devicePixelRatio || 1;
    this.pixelRatio = q === 'low' ? Math.min(dpr, 1) * 0.75 : q === 'medium' ? Math.min(dpr, 1.25) : Math.min(dpr, 2);
    this.adaptScale = 1;
    this.shadows = q !== 'low';
    this.renderer.shadowMap.enabled = this.shadows;
    this.bloom.enabled = q !== 'low';
    this.fxaa.enabled = q !== 'low';
    this.grade.uniforms.uAb.value = q === 'low' ? 0 : 0.004;
    this.resize();
  }

  resize() {
    const w = window.innerWidth, h = window.innerHeight;
    const pr = Math.max(0.5, this.pixelRatio * this.adaptScale);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.bloom.resolution.set(w * pr * 0.5, h * pr * 0.5);
    this.fxaa.material.uniforms['resolution'].value.set(1 / (w * pr), 1 / (h * pr));
  }

  get uniforms() { return this.grade.uniforms; }

  render(dt: number, time: number) {
    this.grade.uniforms.uTime.value = time % 100;
    // adaptive resolution
    if (dt > 0.034) { this.slowTime += dt; this.fastTime = 0; } else if (dt < 0.02) { this.fastTime += dt; this.slowTime = Math.max(0, this.slowTime - dt); }
    if (this.slowTime > 2.5 && this.adaptScale > 0.55) { this.adaptScale -= 0.12; this.slowTime = 0; this.resize(); }
    else if (this.fastTime > 12 && this.adaptScale < 1) { this.adaptScale = Math.min(1, this.adaptScale + 0.08); this.fastTime = 0; this.resize(); }
    this.composer.render(dt);
  }
}
