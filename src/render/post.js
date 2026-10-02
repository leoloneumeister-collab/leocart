// Optional post-processing for High quality: multisampled HDR render, bloom, filmic tone mapping.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

export class Post {
  constructor(renderer, scene, camera, { strength = 0.4, threshold = 0.85 } = {}) {
    this.renderer = renderer;
    const size = renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.addPass(new RenderPass(scene, camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), strength, 0.55, threshold);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.resize();
  }

  resize() {
    const r = this.renderer;
    const s = r.getSize(new THREE.Vector2());
    this.composer.setPixelRatio(r.getPixelRatio());
    this.composer.setSize(s.x, s.y);
  }

  render() {
    this.composer.render();
  }

  dispose() {
    this.composer.dispose();
  }
}
