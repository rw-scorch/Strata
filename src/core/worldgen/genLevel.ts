export const GEN_LEVEL = 4;
export const LEGACY_LEVEL = 2;
export const LEGACY_RADIUS = 10;
const CELL = 8;

export class GenRegistry {
  private recorded = new Map<string, number>();
  private cells = new Map<string, [number, number][]>();
  readonly points: [number, number][] = [];

  constructor(
    readonly base: number,
    points: [number, number][] = [],
    saved?: Record<string, string>,
    private lookup?: (k: string) => number | undefined,
    private onRecord?: (k: string, level: number) => void,
  ) {
    const seen = new Set<string>();
    for (const [cx, cz] of points) {
      const qx = Math.floor(cx / 2), qz = Math.floor(cz / 2), qk = `${qx},${qz}`;
      if (seen.has(qk)) continue;
      seen.add(qk);
      this.points.push([cx, cz]);
      const ck = `${Math.floor(cx / CELL)},${Math.floor(cz / CELL)}`;
      let a = this.cells.get(ck);
      if (!a) this.cells.set(ck, (a = []));
      a.push([cx, cz]);
    }
    if (saved) for (const [lv, list] of Object.entries(saved)) {
      const n = Number(lv);
      if (!Number.isInteger(n) || n < 1 || n > GEN_LEVEL) continue;
      for (const k of list.split(';')) if (k) this.recorded.set(k, n);
    }
  }

  defaultLevel(cx: number, cz: number): number {
    if (!this.points.length) return GEN_LEVEL;
    const r = Math.ceil(LEGACY_RADIUS / CELL);
    const qx = Math.floor(cx / CELL), qz = Math.floor(cz / CELL);
    for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const a = this.cells.get(`${qx + dx},${qz + dz}`);
      if (!a) continue;
      for (const [px, pz] of a) if (Math.max(Math.abs(px - cx), Math.abs(pz - cz)) <= LEGACY_RADIUS) return LEGACY_LEVEL;
    }
    return GEN_LEVEL;
  }

  level(cx: number, cz: number, record = true): number {
    const k = `${cx},${cz}`;
    let v = this.recorded.get(k);
    if (v !== undefined) return v;
    v = this.lookup?.(k);
    if (v === undefined) {
      v = this.defaultLevel(cx, cz);
      if (!record) return v;
      this.onRecord?.(k, v);
    }
    this.recorded.set(k, v);
    return v;
  }

  encode(): Record<string, string> {
    const out: Record<string, string[]> = {};
    for (const [k, v] of this.recorded) (out[v] ??= []).push(k);
    return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.join(';')]));
  }
}
