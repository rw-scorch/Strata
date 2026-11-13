import type { ArenaKind } from '../core/labs/minigames/arena';
import { WorldGenerator } from '../core/worldgen/WorldGenerator';
import { LodMesher, LodTileReq } from '../rendering/lod/LodMesher';

type InMsg =
  | { t: 'init'; seed: number; arena?: ArenaKind | null; colors: Uint8Array }
  | { t: 'colors'; colors: Uint8Array }
  | { t: 'surf'; cx: number; cz: number; h: Uint8Array; id: Uint8Array }
  | ({ t: 'tile'; id: number } & LodTileReq);

const scope = self as unknown as { postMessage(m: unknown, transfer?: Transferable[]): void; onmessage: ((e: MessageEvent<InMsg>) => void) | null };
let gen: WorldGenerator | null = null;
let mesher: LodMesher | null = null;

scope.onmessage = (e) => {
  const m = e.data;
  try {
    if (m.t === 'init') { gen = new WorldGenerator(m.seed, m.arena ?? null); mesher = new LodMesher(gen, m.colors); return; }
    if (m.t === 'colors') { if (gen) { const old = mesher; mesher = new LodMesher(gen, m.colors); if (old) mesher.surf = old.surf; } return; }
    if (m.t === 'surf') { mesher?.surf.set(`${m.cx},${m.cz}`, { h: m.h, id: m.id }); return; }
    if (!mesher) throw new Error('lod worker not initialised');
    const r = mesher.build(m);
    scope.postMessage({ t: 'tile', id: m.id, mesh: r }, [r.pos.buffer, r.col.buffer, r.idx.buffer]);
  } catch (err) {
    scope.postMessage({ t: 'error', id: (m as { id?: number }).id ?? -1, message: String((err as Error)?.message ?? err) });
  }
};
