import { describe, it, expect } from 'vitest';
import { applyInvOp, emptyInv, InvContext, InvOp, ItemStack, SlotRef } from '../src/core/inventory';
import { B } from '../src/core/blocks';
import { I } from '../src/core/items';
import { Rng } from '../src/core/rng';

function tally(ctx: InvContext, dropped: ItemStack[]): Map<number, number> {
  const m = new Map<number, number>();
  const add = (s: ItemStack | null) => { if (s) m.set(s.id, (m.get(s.id) ?? 0) + s.count); };
  ctx.inv.slots.forEach(add); ctx.inv.armor.forEach(add); ctx.inv.craft.forEach(add); add(ctx.inv.cursor); ctx.inv.off.forEach(add);
  ctx.container?.forEach(add); dropped.forEach(add);
  return m;
}

describe('inventory fuzz', () => {
  it('never creates items outside crafting', { timeout: 60000 }, () => {
    const ids = [B.OAK_LOG, B.OAK_PLANKS, I.STICK, B.COBBLESTONE, I.COAL, B.SAND, I.IRON_INGOT, I.WHEAT];
    for (let seed = 1; seed <= 150; seed++) {
      const r = new Rng(seed);
      const inv = emptyInv();
      for (let i = 0; i < 36; i++) if (r.chance(0.6)) inv.slots[i] = { id: ids[r.int(ids.length)], count: 1 + r.int(64) };
      const dropped: ItemStack[] = [];
      let crafted: { result: number; count: number; times: number } | null = null;
      const container: (ItemStack | null)[] | null = r.chance(0.5) ? new Array(27).fill(null) : null;
      inv.craftSize = container ? 2 : r.chance(0.5) ? 3 : 2;
      const ctx: InvContext = { inv, container, containerKind: container ? 'chest' : null, creative: false, drop: (s) => dropped.push({ ...s }),
        crafted: (rec, times) => { crafted = { result: rec.result, count: rec.count, times }; } };
      const groups: SlotRef['c'][] = ['inv', 'craft', 'out', 'armor', 'off', ...(container ? ['cont' as const] : [])];
      for (let step = 0; step < 400; step++) {
        const s: SlotRef = { c: groups[r.int(groups.length)], i: r.int(40) };
        const kinds: InvOp[] = [
          { t: 'click', s, b: r.chance(0.5) ? 0 : 1 }, { t: 'quick', s }, { t: 'quickOne', s }, { t: 'drop', s, all: r.chance(0.5) },
          { t: 'dropCursor', all: r.chance(0.5) }, { t: 'swap', s, h: r.int(9) }, { t: 'fill', r: ['oak_planks', 'stick', 'workbench', 'torch', 'chest', 'furnace'][r.int(6)], all: r.chance(0.5) },
          { t: 'close' }, { t: 'swapHand' },
        ];
        const op = kinds[r.int(kinds.length)];
        const before = tally(ctx, dropped);
        const gridBefore = inv.craft.map((c) => (c ? { ...c } : null));
        crafted = null;
        applyInvOp(ctx, op);
        if (op.t === 'close' && !container) inv.craftSize = r.chance(0.5) ? 3 : 2;
        const after = tally(ctx, dropped);
        const expect_ = new Map(before);
        if (crafted) {
          const c = crafted as { result: number; count: number; times: number };
          gridBefore.forEach((g, i) => { if (!g) return; const now = inv.craft[i]; const used = g.count - (now && now.id === g.id ? now.count : 0); expect_.set(g.id, (expect_.get(g.id) ?? 0) - used); });
          expect_.set(c.result, (expect_.get(c.result) ?? 0) + c.count * c.times);
        }
        for (const id of new Set([...expect_.keys(), ...after.keys()])) {
          const want = expect_.get(id) ?? 0, got = after.get(id) ?? 0;
          if (want !== got) throw new Error(`seed ${seed} step ${step} op ${JSON.stringify(op)} id ${id}: expected ${want}, got ${got}`);
        }
        for (const c of [...inv.slots, ...inv.craft, inv.cursor, ...(container ?? [])]) if (c) expect(c.count).toBeGreaterThan(0);
      }
    }
  });
});
