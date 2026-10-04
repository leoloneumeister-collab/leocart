/** Post-processing and lighting: MSAA scene buffer, bloom, filmic output, environment reflections. */
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

export type Quality = 'low' | 'medium' | 'high';

/** Final colour grade on the display-referred image: saturation, gentle contrast curve, warm highlights, vignette. */
const GradeShader = {
  uniforms: { tDiffuse: { value: null as THREE.Texture | null }, sat: { value: 1.2 }, contrast: { value: 1.08 }, vignette: { value: 0.3 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float sat; uniform float contrast; uniform float vignette; varying vec2 vUv;
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, sat);
      c = (c - 0.5) * contrast + 0.5;
      c *= mix(vec3(0.97, 0.98, 1.03), vec3(1.04, 1.01, 0.96), smoothstep(0.25, 0.85, l));
      vec2 d = vUv - 0.5;
      c *= 1.0 - vignette * smoothstep(0.25, 0.85, dot(d, d) * 2.2);
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }`,
};

export interface Lighting {
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  fill: THREE.DirectionalLight;
}

/** Sun, sky light, a cool fill from the opposite side and an environment map for reflections. */
export function setupLighting(scene: THREE.Scene, renderer: THREE.WebGLRenderer, quality: Quality): Lighting {
  const hemi = new THREE.HemisphereLight(0xcfe2ff, 0x3b4a30, 0.95);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d6, 2.2);
  sun.position.set(-40, 80, 35);
  sun.castShadow = quality !== 'low';
  const sc = sun.shadow.camera;
  sc.left = -62;
  sc.right = 62;
  sc.top = 62;
  sc.bottom = -62;
  sc.near = 10;
  sc.far = 240;
  const size = quality === 'high' ? 4096 : quality === 'medium' ? 2048 : 1024;
  sun.shadow.mapSize.set(size, size);
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.04;
  sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  const fill = new THREE.DirectionalLight(0x9bbcff, 0.55);
  fill.position.set(45, 40, -40);
  scene.add(fill);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.65;
  pmrem.dispose();
  return { sun, hemi, fill };
}

export class RenderPipeline {
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  readonly usesComposer: boolean;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.Camera;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, quality: Quality, w: number, h: number) {
    this.renderer = renderer;
    this.scene = scene;
    this.camera = camera;
    this.usesComposer = quality !== 'low';
    if (this.usesComposer) {
      const pr = renderer.getPixelRatio();
      const rt = new THREE.WebGLRenderTarget(Math.floor(w * pr), Math.floor(h * pr), {
        type: THREE.HalfFloatType,
        samples: quality === 'high' ? 4 : 2,
      });
      const composer = new EffectComposer(renderer, rt);
      composer.addPass(new RenderPass(scene, camera));
      const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), quality === 'high' ? 0.6 : 0.48, 0.6, 1.7);
      composer.addPass(bloom);
      composer.addPass(new OutputPass());
      composer.addPass(new ShaderPass(GradeShader));
      this.composer = composer;
      this.bloom = bloom;
    }
  }

  setSize(w: number, h: number) {
    if (!this.composer) return;
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    this.bloom?.resolution.set(w, h);
  }

  render(dt: number) {
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
}
