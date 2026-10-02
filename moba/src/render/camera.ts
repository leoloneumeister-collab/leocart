/** Angled top-down camera with edge panning, zoom limits and lock-on. */
import * as THREE from 'three';
import { MAP_HALF } from '../data/map.ts';

export class CameraRig {
  x = -80;
  z = 80;
  dist = 66;
  readonly minDist = 36;
  readonly maxDist = 110;
  pitch = THREE.MathUtils.degToRad(56);
  locked = false;
  private shakeT = 0;
  private shakeAmp = 0;

  zoom(delta: number) {
    this.dist = THREE.MathUtils.clamp(this.dist * (1 + delta * 0.0012), this.minDist, this.maxDist);
  }

  shake(amp: number, dur = 0.25) {
    this.shakeAmp = Math.max(this.shakeAmp, amp);
    this.shakeT = Math.max(this.shakeT, dur);
  }

  setTarget(x: number, z: number) {
    this.x = x;
    this.z = z;
    this.clampTarget();
  }

  pan(dx: number, dz: number) {
    this.x += dx;
    this.z += dz;
    this.clampTarget();
  }

  private clampTarget() {
    const lim = MAP_HALF + 4;
    this.x = THREE.MathUtils.clamp(this.x, -lim, lim);
    this.z = THREE.MathUtils.clamp(this.z, -lim, lim);
  }

  apply(camera: THREE.PerspectiveCamera, dt: number) {
    let sx = 0;
    let sz = 0;
    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const k = Math.max(0, this.shakeT) * 4;
      sx = (Math.random() - 0.5) * this.shakeAmp * k;
      sz = (Math.random() - 0.5) * this.shakeAmp * k;
      if (this.shakeT <= 0) this.shakeAmp = 0;
    }
    const h = Math.sin(this.pitch) * this.dist;
    const d = Math.cos(this.pitch) * this.dist;
    camera.position.set(this.x + sx, h, this.z + d + sz);
    camera.lookAt(this.x + sx, 0, this.z + sz);
  }
}
