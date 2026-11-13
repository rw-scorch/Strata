import { dbAll, dbDelete, dbGet, dbPut, dbPutMany, dbKeys, prefixRange } from '../storage/db';
import { importPack, ImportedPack, PackManifest, FaceOverride, AnimInfo, packStale } from './ResourcePackImporter';
import { isRawImage, rawToImageData } from './tga';
import { getSettings, updateSettings } from '../storage/Settings';

export type ImageSource = ImageBitmap | ImageData | HTMLCanvasElement | OffscreenCanvas;

export interface ComposedPack {
  ids: string[];
  names: string[];
  hash: string;
  files: Map<string, ImageSource>;
  blockFaces: Map<string, FaceOverride>;
  itemTextures: Map<string, string>;
  animations: Map<string, AnimInfo>;
  special: Map<string, string>;
  sounds: Map<string, Uint8Array[]>;
}

export interface InstalledPack { manifest: PackManifest; iconURL: string | null; }

const MAX_PACK_BYTES = 80 * 1024 * 1024;

export async function decodeImage(bytes: Uint8Array): Promise<ImageSource> {
  if (isRawImage(bytes)) return rawToImageData(bytes);
  const blob = new Blob([bytes as BlobPart], { type: 'image/png' });
  if (typeof createImageBitmap === 'function') {
    try { return await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' }); } catch { /* fall through */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d')!.drawImage(img, 0, 0);
    return c;
  } finally { URL.revokeObjectURL(url); }
}

class Manager {
  private listeners = new Set<() => void>();

  onChange(fn: () => void): () => void { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  private changed(): void { for (const l of this.listeners) l(); }

  async list(): Promise<InstalledPack[]> {
    const manifests = await dbAll<PackManifest>('packs');
    const out: InstalledPack[] = [];
    for (const m of manifests) {
      const icon = await dbGet<Uint8Array>('packfiles', `${m.id}|__icon`);
      out.push({ manifest: m, iconURL: icon ? URL.createObjectURL(new Blob([icon as BlobPart], { type: 'image/png' })) : null });
    }
    return out.sort((a, b) => b.manifest.importedAt - a.manifest.importedAt);
  }

  async importFile(file: File): Promise<PackManifest> {
    if (file.size > MAX_PACK_BYTES) throw new Error(`That file is ${(file.size / 1048576).toFixed(0)} MB. The limit is 80 MB.`);
    const data = new Uint8Array(await file.arrayBuffer());
    const res: ImportedPack = await importPack(file.name, data);
    await this.store(res, data, file.name);
    return res.manifest;
  }

  async stale(): Promise<PackManifest[]> {
    const all = await dbAll<PackManifest>('packs');
    return all.filter((m) => packStale(m));
  }

  async upgrade(ids: string[], onStart?: (name: string) => void): Promise<{ upgraded: string[]; missing: string[] }> {
    const upgraded: string[] = [], missing: string[] = [];
    for (const id of ids) {
      const m = await dbGet<PackManifest>('packs', id);
      if (!m || !packStale(m)) continue;
      const zip = await dbGet<Uint8Array>('packfiles', `${id}|__zip`);
      const fname = (await dbGet<string>('packfiles', `${id}|__name`)) ?? `${m.name}.zip`;
      if (!zip) { missing.push(m.name); continue; }
      onStart?.(m.name);
      try {
        const res = await importPack(fname, zip);
        res.manifest.importedAt = m.importedAt;
        await this.store(res, zip, fname);
        upgraded.push(m.name);
      } catch (e) { console.error(e); missing.push(m.name); }
    }
    return { upgraded, missing };
  }

  private async store(res: ImportedPack, zip?: Uint8Array, fileName?: string): Promise<void> {
    const id = res.manifest.id;
    const old = await dbKeys('packfiles', prefixRange(`${id}|`));
    for (const k of old) await dbDelete('packfiles', k);
    const entries: [string, unknown][] = Object.entries(res.files).map(([p, d]) => [`${id}|${p}`, d]);
    if (res.icon) entries.push([`${id}|__icon`, res.icon]);
    if (zip) { entries.push([`${id}|__zip`, zip]); entries.push([`${id}|__name`, fileName ?? 'pack.zip']); }
    for (let i = 0; i < entries.length; i += 200) await dbPutMany('packfiles', entries.slice(i, i + 200));
    await dbPut('packs', id, res.manifest);
    this.changed();
  }

  async remove(id: string): Promise<void> {
    const keys = await dbKeys('packfiles', prefixRange(`${id}|`));
    for (const k of keys) await dbDelete('packfiles', k);
    await dbDelete('packs', id);
    updateSettings({ activePacks: getSettings().activePacks.filter((x) => x !== id) });
    this.changed();
  }

  async findByHash(hash: string): Promise<PackManifest | null> {
    const all = await dbAll<PackManifest>('packs');
    return all.find((m) => m.hash === hash) ?? null;
  }

  setActive(ids: string[]): void {
    updateSettings({ activePacks: ids });
    this.changed();
  }

  async compose(ids: string[]): Promise<ComposedPack> {
    const out: ComposedPack = {
      ids: [], names: [], hash: 'default', files: new Map(), blockFaces: new Map(), itemTextures: new Map(),
      animations: new Map(), special: new Map(), sounds: new Map(),
    };
    const hashes: string[] = [];
    for (const id of [...ids].reverse()) {
      const m = await dbGet<PackManifest>('packs', id);
      if (!m) continue;
      out.ids.unshift(id);
      out.names.unshift(m.name);
      hashes.unshift(m.hash);
      const keys = (await dbKeys('packfiles', prefixRange(`${id}|`))) as string[];
      for (const k of keys) {
        const path = k.slice(id.length + 1);
        if (path === '__icon' || path === '__zip' || path === '__name') continue;
        const bytes = await dbGet<Uint8Array>('packfiles', k);
        if (!bytes) continue;
        if (path.startsWith('sounds/')) continue;
        try { out.files.set(path, await decodeImage(bytes)); } catch { /* skip undecodable */ }
      }
      for (const [k, v] of Object.entries(m.blockFaces)) out.blockFaces.set(k, { ...(out.blockFaces.get(k) ?? {}), ...v });
      for (const [k, v] of Object.entries(m.itemTextures)) out.itemTextures.set(k, v);
      for (const [k, v] of Object.entries(m.animations)) out.animations.set(k, v);
      for (const [k, v] of Object.entries(m.special)) out.special.set(k, v);
      for (const [ev, paths] of Object.entries(m.sounds)) {
        const bufs: Uint8Array[] = [];
        for (const p of paths) { const b = await dbGet<Uint8Array>('packfiles', `${id}|${p}`); if (b) bufs.push(b); }
        if (bufs.length) out.sounds.set(ev, bufs);
      }
    }
    if (hashes.length) out.hash = hashes.join('+');
    return out;
  }
}

export const ResourcePackManager = new Manager();
