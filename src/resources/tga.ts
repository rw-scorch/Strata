export const RAW_MAGIC = [0x53, 0x52, 0x41, 0x57];

export function isRawImage(d: Uint8Array): boolean {
  return d.length > 8 && d[0] === RAW_MAGIC[0] && d[1] === RAW_MAGIC[1] && d[2] === RAW_MAGIC[2] && d[3] === RAW_MAGIC[3];
}

export function rawToImageData(d: Uint8Array): ImageData {
  const w = d[4] | (d[5] << 8), h = d[6] | (d[7] << 8);
  return new ImageData(new Uint8ClampedArray(d.slice(8, 8 + w * h * 4)), w, h);
}

export function decodeTGA(src: Uint8Array): Uint8Array {
  const idLen = src[0];
  const cmapType = src[1];
  const type = src[2];
  const w = src[12] | (src[13] << 8);
  const h = src[14] | (src[15] << 8);
  const bpp = src[16];
  const desc = src[17];
  if (cmapType !== 0 || ![2, 3, 10, 11].includes(type) || ![8, 24, 32].includes(bpp) || w <= 0 || h <= 0 || w > 4096 || h > 4096) {
    throw new Error('Unsupported TGA variant');
  }
  const bytesPer = bpp / 8;
  const pixels = new Uint8Array(w * h * 4);
  let p = 18 + idLen;
  const rle = type === 10 || type === 11;
  const gray = type === 3 || type === 11;
  const total = w * h;
  let i = 0;
  const read = (o: number) => {
    if (gray) { const g = src[p]; pixels[o] = g; pixels[o + 1] = g; pixels[o + 2] = g; pixels[o + 3] = 255; }
    else { pixels[o] = src[p + 2]; pixels[o + 1] = src[p + 1]; pixels[o + 2] = src[p]; pixels[o + 3] = bytesPer === 4 ? src[p + 3] : 255; }
  };
  while (i < total) {
    if (rle) {
      const hdr = src[p++];
      const count = (hdr & 0x7f) + 1;
      if (hdr & 0x80) {
        const o0 = i * 4;
        read(o0);
        p += bytesPer;
        for (let k = 1; k < count && i + k < total; k++) pixels.copyWithin((i + k) * 4, o0, o0 + 4);
        i += count;
      } else {
        for (let k = 0; k < count && i < total; k++) { read(i * 4); p += bytesPer; i++; }
      }
    } else {
      read(i * 4);
      p += bytesPer;
      i++;
    }
    if (p > src.length) throw new Error('Truncated TGA');
  }
  const topOrigin = (desc & 0x20) !== 0;
  const out = new Uint8Array(8 + total * 4);
  out.set(RAW_MAGIC, 0);
  out[4] = w & 255; out[5] = w >> 8; out[6] = h & 255; out[7] = h >> 8;
  for (let y = 0; y < h; y++) {
    const sy = topOrigin ? y : h - 1 - y;
    out.set(pixels.subarray(sy * w * 4, (sy + 1) * w * 4), 8 + y * w * 4);
  }
  return out;
}
