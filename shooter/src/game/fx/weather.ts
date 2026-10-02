import * as THREE from 'three';

/** GPU-animated rain streaks or drifting ash around the player. */
export class Weather {
  mesh: THREE.LineSegments | THREE.Points;
  private u = { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() } };

  constructor(scene: THREE.Scene, kind: 'rain' | 'ash', count = 1800) {
    const R = 28, H = 22;
    const pos = new Float32Array(count * (kind === 'rain' ? 6 : 3));
    const seeds = new Float32Array(count * (kind === 'rain' ? 2 : 1));
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * R * 2, y = Math.random() * H, z = (Math.random() - 0.5) * R * 2;
      if (kind === 'rain') {
        pos.set([x, y, z, x, y, z], i * 6);
        seeds[i * 2] = 0; seeds[i * 2 + 1] = 1;
      } else {
        pos.set([x, y, z], i * 3);
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    if (kind === 'rain') geo.setAttribute('endFlag', new THREE.BufferAttribute(new Float32Array(count * 2).map((_, i) => i % 2), 1));
    const common = `
      uniform float uTime; uniform vec3 uCenter;
      vec3 wrap(vec3 p, float speed, float sway){
        p.y = mod(p.y - uTime * speed, ${H.toFixed(1)});
        p.x += sin(uTime * 0.7 + p.z) * sway; p.z += cos(uTime * 0.5 + p.x) * sway;
        vec3 rel = p;
        rel.x = mod(rel.x - uCenter.x + ${R.toFixed(1)}, ${(R * 2).toFixed(1)}) - ${R.toFixed(1)};
        rel.z = mod(rel.z - uCenter.z + ${R.toFixed(1)}, ${(R * 2).toFixed(1)}) - ${R.toFixed(1)};
        return vec3(uCenter.x + rel.x, p.y + uCenter.y - 1.0, uCenter.z + rel.z);
      }`;
    let mat: THREE.ShaderMaterial;
    if (kind === 'rain') {
      mat = new THREE.ShaderMaterial({
        uniforms: this.u, transparent: true, depthWrite: false,
        vertexShader: `${common}
          attribute float endFlag; varying float vA;
          void main(){
            vec3 p = wrap(position, 16.0, 0.0);
            p.y -= endFlag * 0.55; p.x -= endFlag * 0.06;
            vA = 0.12 + 0.18 * (1.0 - endFlag);
            gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
          }`,
        fragmentShader: `varying float vA; void main(){ gl_FragColor = vec4(0.65, 0.75, 0.85, vA); }`,
      });
      this.mesh = new THREE.LineSegments(geo, mat);
    } else {
      mat = new THREE.ShaderMaterial({
        uniforms: this.u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        vertexShader: `${common}
          varying float vA;
          void main(){
            vec3 p = wrap(position, -0.35, 1.2);
            vec4 mv = viewMatrix * vec4(p, 1.0);
            gl_PointSize = clamp(40.0 / max(1.0, -mv.z), 1.0, 3.0);
            vA = 0.35;
            gl_Position = projectionMatrix * mv;
          }`,
        fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.1, d) * vA; gl_FragColor = vec4(1.0, 0.75, 0.45, a); }`,
      });
      this.mesh = new THREE.Points(geo, mat);
    }
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 4;
    scene.add(this.mesh);
  }

  update(time: number, center: THREE.Vector3) {
    this.u.uTime.value = time;
    this.u.uCenter.value.copy(center);
  }
}
