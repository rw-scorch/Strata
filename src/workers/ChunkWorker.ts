import { WorldGenerator } from '../core/worldgen/WorldGenerator';
import { meshChunk, MeshBuffers } from '../rendering/Mesher';
import type { AtlasData } from '../resources/TextureAtlas';

let gen: WorldGenerator | null = null;
let atlas: AtlasData | null = null;

type InMsg =
  | { t: 'init'; seed: number; atlas: AtlasData }
  | { t: 'atlas'; atlas: AtlasData }
  | { t: 'gen'; id: number; cx: number; cz: number }
  | { t: 'mesh'; id: number; cx: number; cz: number; chunks: (Uint16Array | null)[]; smooth: boolean };

const scope = self as unknown as { postMessage(m: unknown, transfer?: Transferable[]): void; onmessage: ((e: MessageEvent<InMsg>) => void) | null };

function transfers(b: MeshBuffers | null, out: Transferable[]): void {
  if (!b) return;
  out.push(b.pos.buffer, b.uv.buffer, b.light.buffer, b.tint.buffer, b.idx.buffer);
}

scope.onmessage = (e) => {
  const m = e.data;
  try {
    if (m.t === 'init') { gen = new WorldGenerator(m.seed); atlas = m.atlas; return; }
    if (m.t === 'atlas') { atlas = m.atlas; return; }
    if (!gen || !atlas) throw new Error('worker not initialised');
    if (m.t === 'gen') {
      const g = gen.generate(m.cx, m.cz);
      scope.postMessage({ t: 'gen', id: m.id, cx: m.cx, cz: m.cz, blocks: g.blocks, entities: g.entities }, [g.blocks.buffer]);
      return;
    }
    if (m.t === 'mesh') {
      const t0 = performance.now();
      const r = meshChunk({ atlas, gen }, m.cx, m.cz, m.chunks, m.smooth);
      const tr: Transferable[] = [];
      transfers(r.opaque, tr); transfers(r.cutout, tr); transfers(r.trans, tr);
      scope.postMessage({ t: 'mesh', id: m.id, cx: m.cx, cz: m.cz, result: r, ms: performance.now() - t0 }, tr);
    }
  } catch (err) {
    scope.postMessage({ t: 'error', id: (m as { id?: number }).id ?? -1, message: String((err as Error)?.message ?? err) });
  }
};
