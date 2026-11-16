import { CHUNK_SIZE, WORLD_HEIGHT, CHUNK_VOLUME } from './constants';

export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

export function parseChunkKey(k: string): [number, number] {
  const i = k.indexOf(',');
  return [Number(k.slice(0, i)), Number(k.slice(i + 1))];
}

export function blockIndex(x: number, y: number, z: number): number {
  return (y * CHUNK_SIZE + z) * CHUNK_SIZE + x;
}

export type BlockArray = Uint16Array | Uint32Array;

export function compactBlocks(b: BlockArray): BlockArray {
  if (b instanceof Uint16Array) return b;
  for (let i = 0; i < b.length; i++) if (b[i] > 0xffff) return b;
  return Uint16Array.from(b);
}

export class ChunkData {
  readonly cx: number;
  readonly cz: number;
  blocks: BlockArray;
  modified = false;
  version = 0;

  constructor(cx: number, cz: number, blocks?: BlockArray) {
    this.cx = cx;
    this.cz = cz;
    this.blocks = blocks ? compactBlocks(blocks) : new Uint16Array(CHUNK_VOLUME);
  }

  get(x: number, y: number, z: number): number {
    if (y < 0 || y >= WORLD_HEIGHT) return 0;
    return this.blocks[(y * CHUNK_SIZE + z) * CHUNK_SIZE + x];
  }

  set(x: number, y: number, z: number, v: number): void {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    if (v > 0xffff && this.blocks instanceof Uint16Array) this.blocks = Uint32Array.from(this.blocks);
    this.blocks[(y * CHUNK_SIZE + z) * CHUNK_SIZE + x] = v;
    this.version++;
  }
}

const WIDE_MARK = 0x5744;

export function encodeRLE(data: Uint32Array | Uint16Array): Uint16Array {
  let wide = false;
  for (let i = 0; i < data.length; i++) if (data[i] > 0xffff) { wide = true; break; }
  const out: number[] = wide ? [0, WIDE_MARK] : [];
  let i = 0;
  while (i < data.length) {
    const v = data[i];
    let run = 1;
    while (i + run < data.length && data[i + run] === v && run < 65535) run++;
    if (wide) out.push(run, v & 0xffff, v >>> 16); else out.push(run, v);
    i += run;
  }
  return Uint16Array.from(out);
}

export function decodeRLE(rle: Uint16Array, length = CHUNK_VOLUME): Uint32Array {
  const out = new Uint32Array(length);
  let o = 0;
  if (rle.length >= 2 && rle[0] === 0 && rle[1] === WIDE_MARK) {
    for (let i = 2; i + 2 < rle.length; i += 3) {
      const run = rle[i], v = (rle[i + 1] | (rle[i + 2] << 16)) >>> 0;
      if (o + run > length) throw new Error('RLE overflow');
      out.fill(v, o, o + run);
      o += run;
    }
  } else {
    for (let i = 0; i + 1 < rle.length; i += 2) {
      const run = rle[i], v = rle[i + 1];
      if (o + run > length) throw new Error('RLE overflow');
      out.fill(v, o, o + run);
      o += run;
    }
  }
  if (o !== length) throw new Error('RLE length mismatch');
  return out;
}

export function u16ToBase64(a: Uint16Array): string {
  const bytes = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  let s = '';
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) s += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + step)));
  return btoa(s);
}

export function base64ToU16(b64: string): Uint16Array {
  const s = atob(b64);
  const bytes = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i);
  return new Uint16Array(bytes.buffer, 0, bytes.length >> 1);
}
