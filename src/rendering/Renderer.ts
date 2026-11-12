import * as THREE from 'three';
import { WORLD_HEIGHT } from '../core/constants';
import { createWorldUniforms, createChunkMaterial, chunkGeometry, DEPTH_MATERIAL, WorldUniforms, createTerrainDepthMaterial, setChunkFx, FX_LOW } from './ChunkMaterial';
import { PostFX } from './PostFX';
import { deriveGfx, GfxConfig } from './Graphics';
import type { Settings } from '../storage/Settings';
import { POS_SCALE } from './Mesher';
import type { MeshResult } from './Mesher';
import { Sky, computeSky, SkyState } from './Sky';
import { Particles } from './Particles';
import { Weather } from './Weather';
import { EntityRenderer, LightProbe } from './EntityRenderer';
import { ChestRenderer } from './ChestRenderer';
import type { TextureAtlas } from '../resources/TextureAtlas';
import { getItem } from '../core/items';
import { firstPersonArmMatrix } from './VanillaModels';

interface ChunkMeshes { meshes: THREE.Mesh[]; }

export interface FrameEnv {
  time: number;
  rain: number;
  thunder: number;
  underwater: boolean;
  inLava: boolean;
  renderDistance: number;
  flash: number;
  cave?: number;
  lensRain?: number;
  wind?: number;
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
  readonly chests: ChestRenderer;
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
  private armVanilla = false;
  private shadowRT: THREE.WebGLRenderTarget | null = null;
  private shadowCam = new THREE.OrthographicCamera(-48, 48, 48, -48, 1, 400);
  private terrainDepth: THREE.ShaderMaterial;
  shadows = false;
  private gfx: GfxConfig;
  private post: PostFX | null = null;
  private postKey = '';
  private pressure = 0;
  private slowT = 0;
  private settingsRef: Settings | null = null;
  private tmpV = new THREE.Vector3();
  private viewW = 1;
  private viewH = 1;
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
    this.gfx = { post: null, fx: FX_LOW, shadowRes: 0, shadowDist: 48, entityShadows: false, lodScale: 1, lensRain: false };
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
    this.terrainDepth = createTerrainDepthMaterial(this.uniforms);
    this.sky = new Sky(atlas);
    this.particles = new Particles(this.uniforms);
    this.weather = new Weather();
    this.entities = new EntityRenderer(this.uniforms, atlas, probe);
    this.chests = new ChestRenderer(this.uniforms, atlas, probe);
    this.scene.add(this.sky.group, this.terrain, this.sky.cloudMesh, this.particles.points, this.weather.group, this.entities.group, this.chests.group);
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
    for (const o of [this.outline, this.crack, this.particles.points]) o.layers.set(2);
    this.weather.group.traverse((o) => o.layers.set(2));
    this.uniforms.uCloudMap.value = atlas.cloudTexture;
    this.handScene.add(this.hand);
    this.handScene.add(new THREE.AmbientLight(0xffffff, 1));
    this.resize();
  }

  private applyAtlasUniforms(): void {
    const d = this.atlas.data;
    this.uniforms.uAtlas.value = this.atlas.texture;
    this.uniforms.uAtlasGrid.value.set(d.cols, d.rows);
    this.uniforms.uTexel.value = 0.5 / d.tileSize;
    this.uniforms.uCloudMap.value = this.atlas.cloudTexture;
  }

  applyGraphics(s: Settings): void {
    this.settingsRef = s;
    this.gfx = deriveGfx(s, this.pressure);
    const g = this.gfx;
    this.shadows = g.shadowRes > 0;
    setChunkFx(this.mats.opaque, g.fx, 'opaque');
    setChunkFx(this.mats.cutout, g.fx, 'cutout');
    setChunkFx(this.mats.trans, g.fx, 'trans');
    this.uniforms.uLodScale.value = g.lodScale;
    this.uniforms.uCloudShadow.value = g.fx.cloudShadows ? 1 : 0;
    if (this.shadowRT && this.shadowRT.width !== g.shadowRes) { this.shadowRT.dispose(); this.shadowRT = null; }
    const key = g.post ? `${g.post.msaa}|${g.post.sceneTextures}` : '';
    if (key !== this.postKey) {
      this.post?.dispose();
      this.post = g.post ? new PostFX(this.gl, g.post) : null;
      this.postKey = key;
    } else if (this.post && g.post) this.post.cfg = g.post;
    this.uniforms.uEmitBoost.value = this.post?.hdr ? 1.6 : 1.0;
    this.resize();
  }

  get postActive(): boolean { return !!this.post; }
  get pressureLevel(): number { return this.pressure; }

  capturePanorama(x: number, y: number, z: number, size = 512): string[] | null {
    try {
      const rt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.UnsignedByteType });
      const cc = new THREE.CubeCamera(0.1, 1000, rt);
      cc.position.set(x, y, z);
      const outline = this.outline.visible, crack = this.crack.visible, ent = this.entities.group.visible;
      this.outline.visible = this.crack.visible = false;
      this.scene.add(cc);
      cc.update(this.gl, this.scene);
      this.scene.remove(cc);
      this.outline.visible = outline; this.crack.visible = crack; this.entities.group.visible = ent;
      const buf = new Uint8Array(size * size * 4);
      const out: string[] = [];
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const g = c.getContext('2d')!;
      for (let f = 0; f < 6; f++) {
        this.gl.readRenderTargetPixels(rt as unknown as THREE.WebGLRenderTarget, 0, 0, size, size, buf, f);
        const img = g.createImageData(size, size);
        img.data.set(buf);
        for (let i = 3; i < img.data.length; i += 4) img.data[i] = 255;
        g.putImageData(img, 0, 0);
        out.push(c.toDataURL('image/jpeg', 0.82));
      }
      rt.dispose();
      return out;
    } catch (e) {
      console.warn('panorama capture failed', e);
      return null;
    }
  }

  setAtlas(a: TextureAtlas): void {
    const old = this.atlas;
    this.atlas = a;
    this.applyAtlasUniforms();
    this.sky.setTextures(a);
    this.entities.setAtlas(a);
    this.chests.setAtlas(a);
    this.handItemId = -2;
    if (old !== a) old.dispose();
  }

  resize(): void {
    const w = window.innerWidth, h = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const scale = dpr * this.resScale * this.maxResScale;
    if (this.post) {
      this.gl.setPixelRatio(dpr);
      this.gl.setSize(w, h, false);
      this.post.setSize(w * scale, h * scale);
      this.viewW = this.post.width; this.viewH = this.post.height;
    } else {
      this.gl.setPixelRatio(scale);
      this.gl.setSize(w, h, false);
      const v = this.gl.getDrawingBufferSize(new THREE.Vector2());
      this.viewW = v.x; this.viewH = v.y;
    }
    this.uniforms.uResolution.value.set(this.viewW, this.viewH);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.handCam.aspect = w / h;
    this.handCam.updateProjectionMatrix();
    this.particles.setScale(h * dpr * this.resScale * this.maxResScale * 0.9);
  }

  setFov(f: number): void { this.camera.fov = f; this.camera.updateProjectionMatrix(); }

  setChunkMesh(key: string, cx: number, cz: number, r: MeshResult): void {
    this.removeTerrain(key);
    const meshes: THREE.Mesh[] = [];
    const add = (b: MeshResult['opaque'], mat: THREE.ShaderMaterial, order: number, castShadow: boolean) => {
      if (!b) return;
      const m = new THREE.Mesh(chunkGeometry(b, WORLD_HEIGHT), mat);
      m.position.set(cx * 16, 0, cz * 16);
      m.scale.setScalar(1 / POS_SCALE);
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      m.renderOrder = order;
      if (castShadow) m.layers.enable(1);
      if (order === 2) m.layers.set(2);
      this.terrain.add(m);
      meshes.push(m);
    };
    add(r.opaque, this.mats.opaque, 0, true);
    add(r.cutout, this.mats.cutout, 1, true);
    add(r.trans, this.mats.trans, 2, false);
    this.chunks.set(key, { meshes });
    this.chests.setChunk(key, cx, cz, r.chests);
  }

  private removeTerrain(key: string): void {
    const c = this.chunks.get(key);
    if (!c) return;
    for (const m of c.meshes) { this.terrain.remove(m); m.geometry.dispose(); }
    this.chunks.delete(key);
  }

  removeChunk(key: string): void {
    this.removeTerrain(key);
    this.chests.remove(key);
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
      this.armVanilla = m.vanilla;
      if (m.vanilla) { m.obj.matrixAutoUpdate = false; firstPersonArmMatrix(0, m.obj.matrix); }
      else { m.obj.position.set(0.5, -0.5, -0.62); m.obj.rotation.set(1.2, 0.1, 0.25); }
      for (const mat of m.mats) { mat.uniforms.uFogFar = { value: 1e9 }; mat.uniforms.uFogNear = { value: 1e9 }; }
      this.handItem = m.obj;
      (this.handItem as THREE.Object3D & { mats?: THREE.ShaderMaterial[] }).mats = m.mats;
    } else {
      this.armVanilla = false;
      const m = this.entities.itemModel(id);
      const it = getItem(id);
      const isBlock = it?.kind === 'block' && it.blockIcon;
      m.obj.scale.setScalar(isBlock ? 0.4 : 0.62);
      m.obj.position.set(isBlock ? 0.5 : 0.52, isBlock ? -0.42 : -0.38, isBlock ? -0.78 : -0.72);
      m.obj.rotation.set(isBlock ? 0.1 : -0.2, isBlock ? 0.75 : -1.2, isBlock ? 0 : 0.35);
      for (const mat of m.mats) { mat.uniforms.uFogFar = { value: 1e9 }; mat.uniforms.uFogNear = { value: 1e9 }; }
      this.handItem = m.obj;
      (this.handItem as THREE.Object3D & { mats?: THREE.ShaderMaterial[] }).mats = m.mats;
    }
    this.hand.add(this.handItem);
  }

  private updateHand(dt: number, light: number): void {
    const swing = this.handSwing;
    if (this.armVanilla && this.handItem) {
      const prog = swing > 0 ? 1 - swing : 0;
      firstPersonArmMatrix(prog, this.handItem.matrix);
      this.hand.position.set(Math.sin(this.handBob) * 0.012, -Math.abs(Math.cos(this.handBob)) * 0.015, 0);
      this.hand.rotation.set(0, 0, 0);
      if (this.handSwing > 0) this.handSwing = Math.max(0, this.handSwing - dt * 3.6);
      const mats = (this.handItem as THREE.Object3D & { mats?: THREE.ShaderMaterial[] }).mats;
      if (mats) for (const m of mats) m.uniforms.uLight.value = Math.max(0.12, light);
      return;
    }
    const s = Math.sin(swing * Math.PI);
    this.hand.position.set(-s * 0.18 + Math.sin(this.handBob) * 0.012, -s * 0.12 - Math.abs(Math.cos(this.handBob)) * 0.015 + (this.handEat > 0 ? Math.sin(this.handEat * 30) * 0.03 - 0.06 : 0), -s * 0.05);
    this.hand.rotation.set(-s * 0.9, -s * 0.25, s * 0.15);
    if (this.handSwing > 0) this.handSwing = Math.max(0, this.handSwing - dt * 4.2);
    const mats = (this.handItem as THREE.Object3D & { mats?: THREE.ShaderMaterial[] } | null)?.mats;
    if (mats) for (const m of mats) m.uniforms.uLight.value = Math.max(0.12, light);
  }

  private updateShadows(): void {
    const g = this.gfx;
    if (!g.shadowRes || this.skyState.sunDir.y < 0.08) { this.uniforms.uShadowOn.value = 0; return; }
    const size = g.shadowRes;
    if (!this.shadowRT) {
      this.shadowRT = new THREE.WebGLRenderTarget(size, size, { depthBuffer: true });
      this.shadowRT.depthTexture = new THREE.DepthTexture(size, size, THREE.UnsignedIntType);
    }
    this.uniforms.uShadowTexel.value = 1 / size;
    const range = g.shadowDist;
    const cam = this.shadowCam;
    if (cam.right !== range) { cam.left = -range; cam.right = range; cam.top = range; cam.bottom = -range; cam.updateProjectionMatrix(); }
    const c = this.camera.position;
    const sd = this.skyState.sunDir;
    const texel = (range * 2) / size;
    const center = this.tmpV.set(Math.round(c.x / texel) * texel, Math.round(c.y / texel) * texel, Math.round(c.z / texel) * texel);
    cam.position.copy(center).addScaledVector(sd, 180);
    cam.up.set(0, 0, 1);
    cam.lookAt(center);
    cam.updateMatrixWorld();
    const hide = [this.sky.group, this.sky.cloudMesh, this.particles.points, this.weather.group, this.outline, this.crack];
    const was = hide.map((o) => o.visible);
    for (const o of hide) o.visible = false;
    const entVis = this.entities.group.visible;
    this.entities.group.visible = false;
    this.gl.setRenderTarget(this.shadowRT);
    this.gl.clear(true, true, false);
    cam.layers.set(1);
    this.scene.overrideMaterial = this.terrainDepth;
    this.gl.render(this.scene, cam);
    if (g.entityShadows && entVis) {
      this.terrain.visible = false;
      this.entities.group.visible = true;
      cam.layers.set(0);
      this.scene.overrideMaterial = DEPTH_MATERIAL;
      this.gl.render(this.scene, cam);
      this.terrain.visible = true;
    }
    this.entities.group.visible = entVis;
    hide.forEach((o, i) => { o.visible = was[i]; });
    this.scene.overrideMaterial = null;
    this.gl.setRenderTarget(null);
    this.uniforms.uShadowMatrix.value.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse);
    this.uniforms.uShadowMap.value = this.shadowRT.depthTexture;
    this.uniforms.uShadowOn.value = 1;
  }

  render(dt: number, env: FrameEnv, playerLight: number): void {
    const u = this.uniforms;
    this.skyState = computeSky(env.time, env.rain, env.thunder);
    const st = this.skyState;
    u.uDay.value = st.day;
    u.uSkyColor.value.copy(st.skyLight);
    u.uSkyTop.value.copy(st.skyTop);
    u.uSunDir.value.copy(st.sunDir);
    u.uTime.value += dt;
    u.uFlash.value = env.flash;
    u.uRain.value = env.rain;
    u.uWind.value = env.wind ?? env.rain * 0.8 + env.thunder * 0.6;
    u.uUnderwater.value = env.underwater ? 1 : 0;
    u.uCloudShift.value = env.time * 0.03;
    const fogFar = Math.max(24, env.renderDistance * 16 - 6);
    if (env.inLava) { u.uFogColor.value.setRGB(0.9, 0.35, 0.05); u.uFogNear.value = 0; u.uFogFar.value = 2.5; }
    else if (env.underwater) { u.uFogColor.value.setRGB(0.05, 0.16, 0.35).multiplyScalar(0.3 + st.day * 0.7); u.uFogNear.value = 1; u.uFogFar.value = 22; }
    else {
      u.uFogColor.value.copy(st.horizon);
      u.uFogNear.value = fogFar * (env.rain > 0.3 ? 0.35 : 0.62);
      u.uFogFar.value = fogFar * (env.rain > 0.3 ? 0.85 : 1);
    }
    this.camera.updateMatrixWorld();
    u.uProj.value.copy(this.camera.projectionMatrix);
    u.uCamNear.value = this.camera.near;
    u.uCamFar.value = this.camera.far;
    this.sky.update(this.camera, st, env.time, env.rain);
    this.sky.group.visible = !env.underwater && !env.inLava;
    this.updateShadows();
    const post = this.post;
    const hand = this.showHand && !this.thirdPerson;
    if (hand) this.updateHand(dt, playerLight);
    if (!post) {
      this.gl.setRenderTarget(null);
      this.gl.setClearColor(u.uFogColor.value, 1);
      this.gl.clear(true, true, false);
      this.camera.layers.enableAll();
      this.gl.render(this.scene, this.camera);
      this.drawCalls = this.gl.info.render.calls;
      this.triangles = this.gl.info.render.triangles;
      if (hand) { this.gl.clearDepth(); this.gl.render(this.handScene, this.handCam); }
      this.overlay.style.background = env.underwater ? 'rgba(20,60,140,0.28)' : env.inLava ? 'rgba(255,90,10,0.55)' : 'transparent';
      this.adapt(dt);
      return;
    }
    this.overlay.style.background = 'transparent';
    this.gl.setRenderTarget(post.sceneRT);
    this.gl.setClearColor(u.uFogColor.value, 1);
    this.gl.clear(true, true, false);
    let calls = 0, tris = 0;
    if (post.cfg.sceneTextures) {
      this.camera.layers.set(0);
      this.gl.render(this.scene, this.camera);
      calls += this.gl.info.render.calls; tris += this.gl.info.render.triangles;
      u.uSceneColor.value = post.sceneRT.texture;
      u.uSceneDepth.value = post.sceneRT.depthTexture;
      this.gl.setRenderTarget(post.sceneRT);
      this.camera.layers.set(2);
      this.gl.render(this.scene, this.camera);
      calls += this.gl.info.render.calls; tris += this.gl.info.render.triangles;
    } else {
      this.camera.layers.enableAll();
      this.gl.render(this.scene, this.camera);
      calls += this.gl.info.render.calls; tris += this.gl.info.render.triangles;
    }
    this.camera.layers.enableAll();
    this.drawCalls = calls;
    this.triangles = tris;
    const sharpen = this.effectiveScale < 0.95 ? 0.35 : 0;
    const needFinal = post.cfg.fxaa || sharpen > 0;
    const sunColor = new THREE.Color(1, 0.92, 0.78).lerp(new THREE.Color(1, 0.55, 0.3), Math.max(0, 1 - Math.abs(st.sunDir.y) * 4));
    post.process({
      camera: this.camera, sunDir: st.sunDir, sunColor, fogColor: u.uFogColor.value, day: st.day, night: st.night, rain: env.rain,
      underwater: env.underwater ? 1 : 0, lava: env.inLava ? 1 : 0, flash: env.flash, time: u.uTime.value, dt,
      cave: env.cave ?? 0, lensRain: this.gfx.lensRain && !this.thirdPerson ? env.lensRain ?? 0 : 0,
    }, !needFinal && !hand);
    if (needFinal || hand) {
      if (hand) {
        this.gl.setRenderTarget(post.ldrRT);
        this.gl.clearDepth();
        this.gl.render(this.handScene, this.handCam);
      }
      post.final(sharpen);
    }
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
    const floor = 0.6;
    let changed = false;
    if (p50 > 1 / 27 && this.resScale > floor) { this.resScale = Math.max(floor, this.resScale - 0.08); changed = true; }
    else if (p50 < 1 / 52 && this.resScale < 1) { this.resScale = Math.min(1, this.resScale + 0.05); changed = true; }
    if (p50 > 1 / 24 && this.resScale <= floor) this.slowT += (now - this.lastAdapt) / 1000; else this.slowT = 0;
    if (this.slowT > 4 && this.pressure < 3 && this.settingsRef) { this.pressure++; this.slowT = 0; this.applyGraphics(this.settingsRef); changed = false; }
    this.lastAdapt = now;
    if (changed) { this.frameTimes.length = 0; this.resize(); }
  }

  get effectiveScale(): number { return this.resScale * this.maxResScale; }
}
