import * as THREE from 'three';

export class Panorama {
  readonly canvas: HTMLCanvasElement;
  private gl: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private cam = new THREE.PerspectiveCamera(85, 1, 0.1, 10);
  private raf = 0;
  private t0 = performance.now();
  private tex: THREE.CubeTexture | null = null;
  private onResize = () => this.resize();

  constructor(faces: string[]) {
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'mc-panorama';
    try {
      this.gl = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, alpha: false, powerPreference: 'low-power' });
      this.gl.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
    } catch { this.gl = null; return; }
    this.cam.rotation.order = 'YXZ';
    const loader = new THREE.CubeTextureLoader();
    this.tex = loader.load(faces);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = this.tex;
    window.addEventListener('resize', this.onResize);
    this.resize();
    const loop = () => {
      if (!this.gl) return;
      const t = (performance.now() - this.t0) / 1000;
      this.cam.rotation.y = -t * 0.04;
      this.cam.rotation.x = 0.17 + Math.sin(t * 0.03) * 0.06;
      this.gl.render(this.scene, this.cam);
      this.raf = requestAnimationFrame(loop);
    };
    loop();
  }

  get ok(): boolean { return !!this.gl; }

  private resize(): void {
    if (!this.gl) return;
    const w = window.innerWidth, h = window.innerHeight;
    this.gl.setSize(w, h, false);
    this.cam.aspect = w / h;
    this.cam.updateProjectionMatrix();
  }

  dispose(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.onResize);
    this.tex?.dispose();
    this.gl?.dispose();
    this.gl?.forceContextLoss();
    this.gl = null;
    this.canvas.remove();
  }

  static stored(): string[] | null {
    try {
      const raw = localStorage.getItem('strata.panorama');
      const f = raw ? JSON.parse(raw) as string[] : null;
      return f && f.length === 6 ? f : null;
    } catch { return null; }
  }
}
