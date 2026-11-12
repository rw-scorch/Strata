import * as THREE from 'three';

export interface BeamSource { id: string; x: number; y: number; z: number; color: string; beam?: boolean }

const VS = `varying float vH; void main(){ vH = uv.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FS = `uniform vec3 uColor; uniform float uAlpha; varying float vH; void main(){ float a = (1.0 - vH) * (1.0 - vH) * uAlpha; gl_FragColor = vec4(uColor * a, a); }`;

export class WaypointBeams {
  readonly group = new THREE.Group();
  private beams = new Map<string, { root: THREE.Group; beam: THREE.Mesh; box: THREE.LineSegments; mat: THREE.ShaderMaterial; lineMat: THREE.LineBasicMaterial }>();
  private geo: THREE.BufferGeometry;
  private boxGeo = new THREE.EdgesGeometry(new THREE.BoxGeometry(1.02, 1.02, 1.02));
  private version = -1;

  constructor() {
    const a = new THREE.PlaneGeometry(1, 1, 1, 1);
    a.translate(0, 0.5, 0);
    const b = a.clone();
    b.rotateY(Math.PI / 2);
    const merged = new THREE.BufferGeometry();
    const pos = new Float32Array([...a.attributes.position.array, ...b.attributes.position.array]);
    const uv = new Float32Array([...a.attributes.uv.array, ...b.attributes.uv.array]);
    const ia = Array.from(a.index!.array);
    merged.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    merged.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    merged.setIndex([...ia, ...ia.map((i) => i + 4)]);
    this.geo = merged;
    this.group.renderOrder = 6;
  }

  set(list: BeamSource[], version: number): void {
    if (version === this.version) return;
    this.version = version;
    const keep = new Set<string>();
    for (const w of list) {
      keep.add(w.id);
      let b = this.beams.get(w.id);
      if (!b) {
        const mat = new THREE.ShaderMaterial({ vertexShader: VS, fragmentShader: FS, uniforms: { uColor: { value: new THREE.Color() }, uAlpha: { value: 0.55 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
        const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, depthTest: false });
        const root = new THREE.Group();
        const beam = new THREE.Mesh(this.geo, mat);
        beam.frustumCulled = false;
        const box = new THREE.LineSegments(this.boxGeo, lineMat);
        box.renderOrder = 7;
        root.add(beam, box);
        this.group.add(root);
        b = { root, beam, box, mat, lineMat };
        this.beams.set(w.id, b);
      }
      b.root.position.set(w.x + 0.5, w.y, w.z + 0.5);
      b.box.position.set(0, 0.5, 0);
      b.mat.uniforms.uColor.value.set(w.color);
      b.lineMat.color.set(w.color);
      b.beam.visible = w.beam !== false;
    }
    for (const [id, b] of this.beams) if (!keep.has(id)) { this.group.remove(b.root); b.mat.dispose(); b.lineMat.dispose(); this.beams.delete(id); }
  }

  update(cam: THREE.Vector3): void {
    for (const b of this.beams.values()) {
      const p = b.root.position;
      const d = Math.hypot(p.x - cam.x, p.z - cam.z);
      const w = Math.max(0.35, d / 90);
      b.beam.scale.set(w, 256, w);
      b.mat.uniforms.uAlpha.value = d < 6 ? 0.15 : Math.min(0.6, 0.25 + d / 400);
      b.box.visible = d < 96;
    }
  }
}
