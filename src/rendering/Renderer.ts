import * as THREE from 'three';
import { WORLD_HEIGHT } from '../core/constants';
import { createWorldUniforms, createChunkMaterial, chunkGeometry, DEPTH_MATERIAL, WorldUniforms } from './ChunkMaterial';
import type { MeshResult } from './Mesher';
import { Sky, computeSky, SkyState } from './Sky';
import { Particles } from './Particles';
import { Weather } from './Weather';
import { EntityRenderer, LightProbe } from './EntityRenderer';
import type { TextureAtlas } from '../resources/TextureAtlas';
import { getItem } from '../core/items';

interface ChunkMeshes { meshes: THREE.Mesh[]; }

export interface FrameEnv {
  time: number;
  rain: number;
  thunder: number;
  underwater: boolean;
  inLava: boolean;
  renderDistance: number;
  flash: number;
}

export class Renderer {
  readonly gl: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly uniforms: WorldUniforms;
  readonly terrain = new THREE.Group();
  readonly sky: Sky;
  readonly particles: Particles;
  readonly weather: Weather;
  readonly entities: EntityRenderer;
  atlas: TextureAtlas;
  private mats: { opaque: THREE.ShaderMaterial; cutout: THREE.ShaderMaterial; trans: THREE.ShaderMaterial };
  private chunks = new Map<string, ChunkMeshes>();
  private outline: THREE.LineSegments;
  private crack: THREE.Mesh;
  private crackMat: THREE.ShaderMaterial;
  private handScene = new THREE.Scene();
  private handCam: THREE.PerspectiveCamera;
  private hand = new THREE.Group();
  private handItem: THREE.Object3D | null = null;
  private handItemId = -2;
  private handSkin = 0;
  private shadowRT: THREE.WebGLRenderTarget | null = null;
  private shadowCam = new THREE.OrthographicCamera(-48, 48, 48, -48, 1, 400);
  shadows = false;
  private resScale = 1;
  maxResScale = 1;
  adaptive = true;
  private frameTimes: number[] = [];
  private lastAdapt = 0;
  skyState: SkyState = computeSky(6000, 0, 0);
  handSwing = 0;
  handEat = 0;
  handBob = 0;
  showHand = true;
  thirdPerson = false;
  private overlay: HTMLDivElement;
  drawCalls = 0;
  triangles = 0;

  constructor(canvas: HTMLCanvasElement, atlas: TextureAtlas, probe: LightProbe, overlay: HTMLDivElement) {
    this.overlay = overlay;
    this.gl = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false, stencil: false, preserveDrawingBuffer: false });
    this.gl.outputColorSpace = THREE.LinearSRGBColorSpace;
    this.gl.toneMapping = THREE.NoToneMapping;
    this.gl.autoClear = false;
    this.gl.setClearColor(0x87b5ff, 1);
    this.camera = new THREE.PerspectiveCamera(72, 1, 0.08, 1000);
    this.camera.rotation.order = 'YXZ';
    this.handCam = new THREE.PerspectiveCamera(70, 1, 0.01, 10);
    this.atlas = atlas;
    this.uniforms = createWorldUniforms();
    this.applyAtlasUniforms();
    this.mats = { opaque: createChunkMaterial(this.uniforms, 'opaque'), cutout: createChunkMaterial(this.uniforms, 'cutout'), trans: createChunkMaterial(this.uniforms, 'trans') };
    this.sky = new Sky(atlas);
    this.particles = new Particles(this.uniforms);
    this.weather = new Weather();
    this.entities = new EntityRenderer(this.uniforms, atlas, probe);
    this.scene.add(this.sky.group, this.terrain, this.sky.cloudMesh, this.particles.points, this.weather.group, this.entities.group);
    const eg = new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1));
    this.outline = new THREE.LineSegments(eg, new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false }));
    this.outline.visible = false;
    this.outline.renderOrder = 10;
    this.crackMat = new THREE.ShaderMaterial({
      uniforms: { uAtlas: this.uniforms.uAtlas, uAtlasGrid: this.uniforms.uAtlasGrid, uTile: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `uniform sampler2D uAtlas; uniform vec2 uAtlasGrid; uniform float uTile; varying vec2 vUv;
        void main(){ float col = mod(uTile, uAtlasGrid.x); float row = floor(uTile / uAtlasGrid.x + 0.0001);
        vec4 c = texture2D(uAtlas, (vec2(col,row) + clamp(vec2(vUv.x, 1.0 - vUv.y), 0.01, 0.99)) / uAtlasGrid);
        if (c.a < 0.1) discard; gl_FragColor = vec4(c.rgb * 0.3, c.a * 0.85); }`,
      transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    this.crack = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), this.crackMat);
    this.crack.visible = false;
    this.crack.renderOrder = 9;
    this.scene.add(this.outline, this.crack);
    this.handScene.add(this.hand);
    this.handScene.add(new THREE.AmbientLight(0xffffff, 1));
    this.resize();
  }

  private applyAtlasUniforms(): void {
    const d = this.atlas.data;
    this.uniforms.uAtlas.value = this.atlas.texture;
    this.uniforms.uAtlasGrid.value.set(d.cols, d.rows);
    this.uniforms.uTexel.value = 0.5 / d.tileSize;
  }

  setAtlas(a: TextureAtlas): void {
    const old = this.atlas;
    this.atlas = a;
    this.applyAtlasUniforms();
    this.sky.setTextures(a);
    this.entities.setAtlas(a);
    this.handItemId = -2;
    if (old !== a) old.dispose();
  }

  resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.gl.setPixelRatio(dpr * this.resScale * this.maxResScale);
    this.gl.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.handCam.aspect = w / h;
    this.handCam.updateProjectionMatrix();
    this.particles.setScale(h * dpr * this.resScale * this.maxResScale * 0.9);
  }

  setFov(f: number): void { this.camera.fov = f; this.camera.updateProjectionMatrix(); }

  setChunkMesh(key: string, cx: number, cz: number, r: MeshResult): void {
    this.removeChunk(key);
    const meshes: THREE.Mesh[] = [];
    const add = (b: MeshResult['opaque'], mat: THREE.ShaderMaterial, order: number, castShadow: boolean) => {
      if (!b) return;
      const m = new THREE.Mesh(chunkGeometry(b, WORLD_HEIGHT), mat);
      m.position.set(cx * 16, 0, cz * 16);
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      m.renderOrder = order;
      if (castShadow) m.layers.enable(1);
      this.terrain.add(m);
      meshes.push(m);
    };
    add(r.opaque, this.mats.opaque, 0, true);
    add(r.cutout, this.mats.cutout, 1, true);
    add(r.trans, this.mats.trans, 2, false);
    this.chunks.set(key, { meshes });
  }

  removeChunk(key: string): void {
    const c = this.chunks.get(key);
    if (!c) return;
    for (const m of c.meshes) { this.terrain.remove(m); m.geometry.dispose(); }
    this.chunks.delete(key);
  }

  clearChunks(): void { for (const k of [...this.chunks.keys()]) this.removeChunk(k); }

  get chunkCount(): number { return this.chunks.size; }

  setSelection(box: [number, number, number, number, number, number] | null, x = 0, y = 0, z = 0, stage = -1): void {
    if (!box) { this.outline.visible = false; this.crack.visible = false; return; }
    const sx = box[3] - box[0], sy = box[4] - box[1], sz = box[5] - box[2];
    this.outline.visible = true;
    this.outline.position.set(x + box[0] + sx / 2, y + box[1] + sy / 2, z + box[2] + sz / 2);
    this.outline.scale.set(sx + 0.004, sy + 0.004, sz + 0.004);
    if (stage >= 0) {
      this.crack.visible = true;
      this.crack.position.copy(this.outline.position);
      this.crack.scale.set(sx + 0.006, sy + 0.006, sz + 0.006);
      this.crackMat.uniforms.uTile.value = this.atlas.data.special[`destroy${Math.min(9, stage)}`];
    } else this.crack.visible = false;
  }

  setHeld(itemId: number | null, skin: number): void {
    const id = itemId ?? -1;
    if (id === this.handItemId && skin === this.handSkin) return;
    this.handItemId = id;
    this.handSkin = skin;
    if (this.handItem) { this.hand.remove(this.handItem); this.handItem.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); }); }
    if (id < 0) {
      const m = this.entities.armModel(skin);
      m.obj.position.set(0.56, -0.62, -0.78);
      m.obj.rotation.set(-1.15, 0.18, 0.32);
      for (const mat of m.mats) { mat.uniforms.uFogFar = { value: 1e9 }; mat.uniforms.uFogNear = { value: 1e9 }; }
      this.handItem = m.obj;
      (this.handItem as THREE.Object3D & { mats?: THREE.ShaderMaterial[] }).mats = m.mats;
    } else {
      const m = this.entities.itemModel(id);
      const it = getItem(id);
      const isBlock = it?.kind === 'block' && it.blockIcon;
      m.obj.scale.setScalar(isBlock ? 1.5 : 1.6);
      m.obj.position.set(0.42, isBlock ? -0.36 : -0.32, -0.6);
      m.obj.rotation.set(isBlock ? 0.1 : -0.2, isBlock ? 0.75 : -1.2, isBlock ? 0 : 0.35);
      for (const mat of m.mats) { mat.uniforms.uFogFar = { value: 1e9 }; mat.uniforms.uFogNear = { value: 1e9 }; }
      this.handItem = m.obj;
      (this.handItem as THREE.Object3D & { mats?: THREE.ShaderMaterial[] }).mats = m.mats;
    }
    this.hand.add(this.handItem);
  }

  private updateHand(dt: number, light: number): void {
    const swing = this.handSwing;
    const s = Math.sin(swing * Math.PI);
    this.hand.position.set(-s * 0.18 + Math.sin(this.handBob) * 0.012, -s * 0.12 - Math.abs(Math.cos(this.handBob)) * 0.015 + (this.handEat > 0 ? Math.sin(this.handEat * 30) * 0.03 - 0.06 : 0), -s * 0.05);
    this.hand.rotation.set(-s * 0.9, -s * 0.25, s * 0.15);
    if (this.handSwing > 0) this.handSwing = Math.max(0, this.handSwing - dt * 4.2);
    const mats = (this.handItem as THREE.Object3D & { mats?: THREE.ShaderMaterial[] } | null)?.mats;
    if (mats) for (const m of mats) m.uniforms.uLight.value = Math.max(0.12, light);
  }

  private updateShadows(): void {
    if (!this.shadows || this.skyState.sunDir.y < 0.08) { this.uniforms.uShadowOn.value = 0; return; }
    if (!this.shadowRT) {
      const size = 2048;
      this.shadowRT = new THREE.WebGLRenderTarget(size, size, { depthBuffer: true });
      this.shadowRT.depthTexture = new THREE.DepthTexture(size, size, THREE.UnsignedIntType);
      this.uniforms.uShadowTexel.value = 0.6 / size;
    }
    const c = this.camera.position;
    const sd = this.skyState.sunDir;
    const texel = 96 / 2048;
    const snap = (v: number) => Math.round(v / texel) * texel;
    const center = new THREE.Vector3(snap(c.x), snap(c.y), snap(c.z));
    this.shadowCam.position.copy(center).addScaledVector(sd, 180);
    this.shadowCam.up.set(0, 0, 1);
    this.shadowCam.lookAt(center);
    this.shadowCam.updateMatrixWorld();
    this.shadowCam.layers.set(1);
    this.scene.overrideMaterial = DEPTH_MATERIAL;
    const bg = this.scene.background;
    this.gl.setRenderTarget(this.shadowRT);
    this.gl.clear(true, true, false);
    this.gl.render(this.scene, this.shadowCam);
    this.gl.setRenderTarget(null);
    this.scene.overrideMaterial = null;
    this.scene.background = bg;
    const m = new THREE.Matrix4().multiplyMatrices(this.shadowCam.projectionMatrix, this.shadowCam.matrixWorldInverse);
    this.uniforms.uShadowMatrix.value.copy(m);
    this.uniforms.uShadowMap.value = this.shadowRT.depthTexture;
    this.uniforms.uShadowOn.value = 1;
  }

  render(dt: number, env: FrameEnv, playerLight: number): void {
    const u = this.uniforms;
    this.skyState = computeSky(env.time, env.rain, env.thunder);
    const st = this.skyState;
    u.uDay.value = st.day;
    u.uSkyColor.value.copy(st.skyLight);
    u.uSunDir.value.copy(st.sunDir);
    u.uTime.value += dt;
    u.uFlash.value = env.flash;
    const fogFar = Math.max(24, env.renderDistance * 16 - 6);
    if (env.inLava) { u.uFogColor.value.setRGB(0.9, 0.35, 0.05); u.uFogNear.value = 0; u.uFogFar.value = 2.5; }
    else if (env.underwater) { u.uFogColor.value.setRGB(0.05, 0.16, 0.35).multiplyScalar(0.3 + st.day * 0.7); u.uFogNear.value = 1; u.uFogFar.value = 22; }
    else {
      u.uFogColor.value.copy(st.horizon);
      u.uFogNear.value = fogFar * (env.rain > 0.3 ? 0.35 : 0.62);
      u.uFogFar.value = fogFar * (env.rain > 0.3 ? 0.85 : 1);
    }
    this.gl.setClearColor(u.uFogColor.value, 1);
    this.sky.update(this.camera, st, env.time, env.rain);
    this.sky.group.visible = !env.underwater && !env.inLava;
    this.updateShadows();
    this.gl.setRenderTarget(null);
    this.gl.clear(true, true, false);
    this.camera.layers.enableAll();
    this.gl.render(this.scene, this.camera);
    this.drawCalls = this.gl.info.render.calls;
    this.triangles = this.gl.info.render.triangles;
    if (this.showHand && !this.thirdPerson) {
      this.updateHand(dt, playerLight);
      this.gl.clearDepth();
      this.gl.render(this.handScene, this.handCam);
    }
    this.overlay.style.background = env.underwater ? 'rgba(20,60,140,0.28)' : env.inLava ? 'rgba(255,90,10,0.55)' : 'transparent';
    this.adapt(dt);
  }

  private adapt(dt: number): void {
    if (!this.adaptive) return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length > 60) this.frameTimes.shift();
    const now = performance.now();
    if (now - this.lastAdapt < 1500 || this.frameTimes.length < 40) return;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    let changed = false;
    if (p50 > 1 / 27 && this.resScale > 0.5) { this.resScale = Math.max(0.5, this.resScale - 0.1); changed = true; }
    else if (p50 < 1 / 52 && this.resScale < 1) { this.resScale = Math.min(1, this.resScale + 0.05); changed = true; }
    if (changed) { this.lastAdapt = now; this.frameTimes.length = 0; this.resize(); }
  }

  get effectiveScale(): number { return this.resScale * this.maxResScale; }
}
