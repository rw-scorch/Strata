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

export class ChunkData {
  readonly cx: number;
  readonly cz: number;
  readonly blocks: Uint16Array;
  modified = false;
  version = 0;

  constructor(cx: number, cz: number, blocks?: Uint16Array) {
    this.cx = cx;
    this.cz = cz;
    this.blocks = blocks ?? new Uint16Array(CHUNK_VOLUME);
  }

  get(x: number, y: number, z: number): number {
    if (y < 0 || y >= WORLD_HEIGHT) return 0;
    return this.blocks[(y * CHUNK_SIZE + z) * CHUNK_SIZE + x];
  }

  set(x: number, y: number, z: number, v: number): void {
    if (y < 0 || y >= WORLD_HEIGHT) return;
    this.blocks[(y * CHUNK_SIZE + z) * CHUNK_SIZE + x] = v;
    this.version++;
  }
}

export function encodeRLE(data: Uint16Array): Uint16Array {
  const out: number[] = [];
  let i = 0;
  while (i < data.length) {
    const v = data[i];
    let run = 1;
    while (i + run < data.length && data[i + run] === v && run < 65535) run++;
    out.push(run, v);
    i += run;
  }
  return Uint16Array.from(out);
}

export function decodeRLE(rle: Uint16Array, length = CHUNK_VOLUME): Uint16Array {
  const out = new Uint16Array(length);
  let o = 0;
  for (let i = 0; i + 1 < rle.length; i += 2) {
    const run = rle[i], v = rle[i + 1];
    if (o + run > length) throw new Error('RLE overflow');
    out.fill(v, o, o + run);
    o += run;
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
