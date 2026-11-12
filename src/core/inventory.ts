import { getItem, maxStack, fuelSeconds } from './items';
import { findRecipe, findSmelt, ingredientMatches, Recipe, RecipeBook, BASE_BOOK, Ingredient } from './crafting';

export interface ItemStack { id: number; count: number; dmg?: number; }

export const INV_SIZE = 36;
export const CHEST_SIZE = 27;
export const FURNACE_SIZE = 3;

export interface PlayerInv {
  slots: (ItemStack | null)[];
  armor: (ItemStack | null)[];
  craft: (ItemStack | null)[];
  craftSize: 2 | 3;
  cursor: ItemStack | null;
  selected: number;
}

export type ContainerKind = 'chest' | 'furnace';
export type SlotGroup = 'inv' | 'armor' | 'craft' | 'out' | 'cont';
export interface SlotRef { c: SlotGroup; i: number; }

export type InvOp =
  | { t: 'click'; s: SlotRef; b: 0 | 1 }
  | { t: 'quick'; s: SlotRef }
  | { t: 'quickOne'; s: SlotRef }
  | { t: 'drop'; s: SlotRef; all: boolean }
  | { t: 'dropCursor'; all: boolean }
  | { t: 'creative'; id: number; count: number; s?: SlotRef }
  | { t: 'creativeDelete' }
  | { t: 'select'; i: number }
  | { t: 'fill'; r: string; all: boolean }
  | { t: 'close' }
  | { t: 'swap'; s: SlotRef; h: number };

export interface InvContext {
  inv: PlayerInv;
  container: (ItemStack | null)[] | null;
  containerKind: ContainerKind | null;
  creative: boolean;
  drop: (stack: ItemStack) => void;
  crafted?: (recipe: Recipe, times: number) => void;
  split?: ((joined: (ItemStack | null)[]) => void) | null;
  book?: RecipeBook;
}

export function emptyInv(): PlayerInv {
  return {
    slots: new Array(INV_SIZE).fill(null),
    armor: new Array(4).fill(null),
    craft: new Array(9).fill(null),
    craftSize: 2,
    cursor: null,
    selected: 0,
  };
}

export function cloneStack(s: ItemStack | null): ItemStack | null {
  if (!s) return null;
  const c: ItemStack = { id: s.id, count: s.count };
  if (s.dmg) c.dmg = s.dmg;
  return c;
}

export function cloneInv(inv: PlayerInv): PlayerInv {
  return {
    slots: inv.slots.map(cloneStack),
    armor: inv.armor.map(cloneStack),
    craft: inv.craft.map(cloneStack),
    craftSize: inv.craftSize,
    cursor: cloneStack(inv.cursor),
    selected: inv.selected,
  };
}

export function sameKind(a: ItemStack | null, b: ItemStack | null): boolean {
  return !!a && !!b && a.id === b.id && (a.dmg ?? 0) === (b.dmg ?? 0);
}

export function validStack(s: unknown): s is ItemStack {
  if (!s || typeof s !== 'object') return false;
  const o = s as ItemStack;
  return Number.isInteger(o.id) && !!getItem(o.id) && Number.isInteger(o.count) && o.count > 0 && o.count <= maxStack(o.id)
    && (o.dmg === undefined || (Number.isInteger(o.dmg) && o.dmg >= 0));
}

export function sanitizeInv(raw: unknown): PlayerInv {
  const inv = emptyInv();
  if (!raw || typeof raw !== 'object') return inv;
  const r = raw as Partial<PlayerInv>;
  const fill = (dst: (ItemStack | null)[], src: unknown) => {
    if (!Array.isArray(src)) return;
    for (let i = 0; i < dst.length && i < src.length; i++) dst[i] = validStack(src[i]) ? cloneStack(src[i]) : null;
  };
  fill(inv.slots, r.slots);
  fill(inv.armor, r.armor);
  fill(inv.craft, r.craft);
  inv.cursor = validStack(r.cursor) ? cloneStack(r.cursor) : null;
  inv.selected = Number.isInteger(r.selected) && r.selected! >= 0 && r.selected! < 9 ? r.selected! : 0;
  inv.craftSize = r.craftSize === 3 ? 3 : 2;
  return inv;
}

function slotArray(ctx: InvContext, g: SlotGroup): (ItemStack | null)[] | null {
  switch (g) {
    case 'inv': return ctx.inv.slots;
    case 'armor': return ctx.inv.armor;
    case 'craft': return ctx.inv.craft;
    case 'cont': return ctx.container;
    default: return null;
  }
}

function slotCount(ctx: InvContext, g: SlotGroup): number {
  if (g === 'craft') return ctx.inv.craftSize * ctx.inv.craftSize;
  if (g === 'out') return 1;
  return slotArray(ctx, g)?.length ?? 0;
}

export function canPlaceIn(ctx: InvContext, s: SlotRef, stack: ItemStack): boolean {
  if (s.c === 'out') return false;
  if (s.c === 'armor') return getItem(stack.id)?.armor?.slot === s.i;
  if (s.c === 'cont' && ctx.containerKind === 'furnace') {
    if (s.i === 2) return false;
    if (s.i === 1) return fuelSeconds(stack.id) > 0;
  }
  return true;
}

function slotLimit(s: SlotRef, id: number): number {
  if (s.c === 'armor') return 1;
  return maxStack(id);
}

export function craftGrid(inv: PlayerInv): (ItemStack | null)[] {
  return inv.craft.slice(0, inv.craftSize * inv.craftSize);
}

export function craftResult(inv: PlayerInv, book: RecipeBook = BASE_BOOK): { recipe: Recipe; stack: ItemStack } | null {
  const r = findRecipe(craftGrid(inv), inv.craftSize, book);
  if (!r) return null;
  return { recipe: r, stack: { id: r.result, count: r.count } };
}

function consumeCraft(inv: PlayerInv): void {
  const n = inv.craftSize * inv.craftSize;
  for (let i = 0; i < n; i++) {
    const s = inv.craft[i];
    if (!s) continue;
    s.count--;
    if (s.count <= 0) inv.craft[i] = null;
  }
}

export function addToSlots(slots: (ItemStack | null)[], stack: ItemStack, order?: number[]): number {
  const idx = order ?? slots.map((_, i) => i);
  const limit = maxStack(stack.id);
  for (const i of idx) {
    const s = slots[i];
    if (s && sameKind(s, stack) && s.count < limit) {
      const n = Math.min(limit - s.count, stack.count);
      s.count += n;
      stack.count -= n;
      if (stack.count <= 0) return 0;
    }
  }
  for (const i of idx) {
    if (!slots[i]) {
      const n = Math.min(limit, stack.count);
      slots[i] = { ...stack, count: n };
      stack.count -= n;
      if (stack.count <= 0) return 0;
    }
  }
  return stack.count;
}

const HOTBAR_FIRST = [...Array(9).keys(), ...Array.from({ length: 27 }, (_, i) => i + 9)];
const MAIN_FIRST = [...Array.from({ length: 27 }, (_, i) => i + 9), ...Array(9).keys()];

export function giveItem(inv: PlayerInv, stack: ItemStack): number {
  const s = { ...stack };
  return addToSlots(inv.slots, s, HOTBAR_FIRST);
}

export function countItem(inv: PlayerInv, id: number): number {
  let n = 0;
  for (const s of inv.slots) if (s && s.id === id) n += s.count;
  return n;
}

export function removeItem(inv: PlayerInv, pred: (id: number) => boolean, count: number): number {
  let left = count;
  for (let i = 0; i < inv.slots.length && left > 0; i++) {
    const s = inv.slots[i];
    if (s && pred(s.id)) {
      const n = Math.min(s.count, left);
      s.count -= n;
      left -= n;
      if (s.count <= 0) inv.slots[i] = null;
    }
  }
  return count - left;
}

function takeOutput(ctx: InvContext, toInventory: boolean): boolean {
  const inv = ctx.inv;
  const res = craftResult(inv, ctx.book);
  if (!res) return false;
  if (toInventory) {
    let times = 0;
    for (let guard = 0; guard < 64; guard++) {
      const cur = craftResult(inv, ctx.book);
      if (!cur || cur.recipe.id !== res.recipe.id) break;
      const probe = inv.slots.map(cloneStack);
      if (addToSlots(probe, { ...cur.stack }, MAIN_FIRST) > 0) break;
      addToSlots(inv.slots, { ...cur.stack }, MAIN_FIRST);
      consumeCraft(inv);
      times++;
    }
    if (times > 0) ctx.crafted?.(res.recipe, times);
    return times > 0;
  }
  const c = inv.cursor;
  if (c) {
    if (!sameKind(c, res.stack) || c.count + res.stack.count > maxStack(c.id)) return false;
    c.count += res.stack.count;
  } else {
    inv.cursor = { ...res.stack };
  }
  consumeCraft(inv);
  ctx.crafted?.(res.recipe, 1);
  return true;
}

function click(ctx: InvContext, s: SlotRef, button: 0 | 1): boolean {
  if (s.c === 'out') return takeOutput(ctx, false);
  const arr = slotArray(ctx, s.c);
  if (!arr || s.i < 0 || s.i >= slotCount(ctx, s.c)) return false;
  const inv = ctx.inv;
  const slot = arr[s.i];
  const cur = inv.cursor;
  if (!cur && !slot) return true;
  if (!cur && slot) {
    if (button === 0) { inv.cursor = slot; arr[s.i] = null; }
    else {
      const half = Math.ceil(slot.count / 2);
      inv.cursor = { ...slot, count: half };
      slot.count -= half;
      if (slot.count <= 0) arr[s.i] = null;
    }
    return true;
  }
  if (cur && !canPlaceIn(ctx, s, cur)) {
    if (s.c === 'cont' && ctx.containerKind === 'furnace' && s.i === 2 && slot) {
      if (sameKind(cur, slot) && cur.count + slot.count <= maxStack(cur.id)) { cur.count += slot.count; arr[s.i] = null; return true; }
    }
    return false;
  }
  const limit = slotLimit(s, cur!.id);
  if (cur && !slot) {
    if (button === 0) {
      const n = Math.min(limit, cur.count);
      arr[s.i] = { ...cur, count: n };
      cur.count -= n;
    } else {
      arr[s.i] = { ...cur, count: 1 };
      cur.count -= 1;
    }
    if (cur.count <= 0) inv.cursor = null;
    return true;
  }
  if (cur && slot) {
    if (sameKind(cur, slot)) {
      const space = limit - slot.count;
      if (space <= 0) {
        if (button === 0 && slot.count < cur.count) return false;
        return true;
      }
      const n = button === 0 ? Math.min(space, cur.count) : 1;
      slot.count += n;
      cur.count -= n;
      if (cur.count <= 0) inv.cursor = null;
      return true;
    }
    if (cur.count > limit) return false;
    arr[s.i] = cur;
    inv.cursor = slot;
    return true;
  }
  return false;
}

function quickMove(ctx: InvContext, s: SlotRef, one = false): boolean {
  if (s.c === 'out') return one ? false : takeOutput(ctx, true);
  const arr = slotArray(ctx, s.c);
  if (!arr || s.i < 0 || s.i >= slotCount(ctx, s.c)) return false;
  const stack = arr[s.i];
  if (!stack) return false;
  const inv = ctx.inv;
  const moving = { ...stack, count: one ? 1 : stack.count };
  let left = moving.count;
  if (s.c === 'inv') {
    if (ctx.container) {
      if (ctx.containerKind === 'furnace') {
        const target = findSmelt(moving.id, ctx.book) ? 0 : fuelSeconds(moving.id) > 0 ? 1 : -1;
        if (target < 0) return false;
        left = addToSlots(ctx.container, moving, [target]);
      } else {
        left = addToSlots(ctx.container, moving);
      }
    } else {
      const ar = getItem(moving.id)?.armor;
      if (ar && !inv.armor[ar.slot]) {
        inv.armor[ar.slot] = { ...moving, count: 1 };
        left = moving.count - 1;
      } else {
        const order = s.i < 9 ? Array.from({ length: 27 }, (_, i) => i + 9) : [...Array(9).keys()];
        left = addToSlots(inv.slots, moving, order);
      }
    }
  } else {
    left = addToSlots(inv.slots, moving, s.c === 'cont' ? [...Array.from({ length: 9 }, (_, i) => 8 - i), ...Array.from({ length: 27 }, (_, i) => 35 - i)] : MAIN_FIRST);
  }
  const moved = moving.count - Math.max(0, left);
  if (moved <= 0) return false;
  stack.count -= moved;
  if (stack.count <= 0) arr[s.i] = null;
  return true;
}

function dropFrom(ctx: InvContext, s: SlotRef, all: boolean): boolean {
  if (s.c === 'out') return false;
  const arr = slotArray(ctx, s.c);
  if (!arr || s.i < 0 || s.i >= arr.length) return false;
  const st = arr[s.i];
  if (!st) return false;
  const n = all ? st.count : 1;
  ctx.drop({ ...st, count: n });
  st.count -= n;
  if (st.count <= 0) arr[s.i] = null;
  return true;
}

function returnCraft(ctx: InvContext): void {
  const inv = ctx.inv;
  for (let i = 0; i < 9; i++) {
    const s = inv.craft[i];
    if (!s) continue;
    const left = giveItem(inv, s);
    if (left > 0) ctx.drop({ ...s, count: left });
    inv.craft[i] = null;
  }
}

function fillRecipe(ctx: InvContext, recipeId: string, all: boolean): boolean {
  const r = (ctx.book ?? BASE_BOOK).byId.get(recipeId);
  if (!r) return false;
  const inv = ctx.inv;
  const size = inv.craftSize;
  const cells: (Ingredient | null)[] = new Array(size * size).fill(null);
  if (r.pattern) {
    const w = Math.max(...r.pattern.map((p) => p.length));
    if (w > size || r.pattern.length > size) return false;
    r.pattern.forEach((row, y) => {
      for (let x = 0; x < row.length; x++) if (row[x] !== ' ') cells[y * size + x] = r.key![row[x]];
    });
  } else {
    if (r.shapeless!.length > size * size) return false;
    r.shapeless!.forEach((ing, i) => { cells[i] = ing; });
  }
  returnCraft(ctx);
  const per = new Map<number, number>();
  const placed: (number | null)[] = cells.map((ing) => {
    if (ing === null) return null;
    for (const s of inv.slots) {
      if (s && ingredientMatches(ing, s.id)) {
        const used = per.get(s.id) ?? 0;
        if (countItem(inv, s.id) - used > 0) { per.set(s.id, used + 1); return s.id; }
      }
    }
    return -1;
  });
  if (placed.some((p) => p === -1)) return false;
  let times = 1;
  if (all) {
    times = 64;
    for (const [id, n] of per) times = Math.min(times, Math.floor(countItem(inv, id) / n), maxStack(id));
    times = Math.max(1, times);
  }
  placed.forEach((id, i) => {
    if (id === null) return;
    const got = removeItem(inv, (x) => x === id, times);
    inv.craft[i] = { id, count: got };
  });
  return true;
}

export function applyInvOp(ctx: InvContext, op: InvOp): boolean {
  const inv = ctx.inv;
  switch (op.t) {
    case 'click': return click(ctx, op.s, op.b);
    case 'quick': return quickMove(ctx, op.s);
    case 'quickOne': return quickMove(ctx, op.s, true);
    case 'drop': return dropFrom(ctx, op.s, op.all);
    case 'dropCursor': {
      if (!inv.cursor) return false;
      const n = op.all ? inv.cursor.count : 1;
      ctx.drop({ ...inv.cursor, count: n });
      inv.cursor.count -= n;
      if (inv.cursor.count <= 0) inv.cursor = null;
      return true;
    }
    case 'creative': {
      if (!ctx.creative || !getItem(op.id) || op.count < 1) return false;
      const count = Math.min(op.count, maxStack(op.id));
      if (op.s) {
        const arr = slotArray(ctx, op.s.c);
        if (!arr || op.s.c !== 'inv' || op.s.i < 0 || op.s.i >= arr.length) return false;
        arr[op.s.i] = { id: op.id, count };
        return true;
      }
      inv.cursor = { id: op.id, count };
      return true;
    }
    case 'creativeDelete': {
      if (!ctx.creative) return false;
      inv.cursor = null;
      return true;
    }
    case 'select': {
      if (!Number.isInteger(op.i) || op.i < 0 || op.i > 8) return false;
      inv.selected = op.i;
      return true;
    }
    case 'fill': return fillRecipe(ctx, op.r, op.all);
    case 'close': {
      returnCraft(ctx);
      if (inv.cursor) {
        const left = giveItem(inv, inv.cursor);
        if (left > 0) ctx.drop({ ...inv.cursor, count: left });
        inv.cursor = null;
      }
      inv.craftSize = 2;
      return true;
    }
    case 'swap': {
      if (op.h < 0 || op.h > 8 || op.s.c === 'out') return false;
      const arr = slotArray(ctx, op.s.c);
      if (!arr || op.s.i < 0 || op.s.i >= slotCount(ctx, op.s.c)) return false;
      const a = arr[op.s.i];
      const b = inv.slots[op.h];
      if (b && !canPlaceIn(ctx, op.s, b)) return false;
      if (b && b.count > slotLimit(op.s, b.id)) return false;
      arr[op.s.i] = b;
      inv.slots[op.h] = a;
      return true;
    }
  }
  return false;
}

export function validateOp(raw: unknown): InvOp | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const ref = (v: unknown): SlotRef | null => {
    if (!v || typeof v !== 'object') return null;
    const r = v as Record<string, unknown>;
    if (!['inv', 'armor', 'craft', 'out', 'cont'].includes(r.c as string)) return null;
    if (!Number.isInteger(r.i) || (r.i as number) < 0 || (r.i as number) > 64) return null;
    return { c: r.c as SlotGroup, i: r.i as number };
  };
  switch (o.t) {
    case 'click': { const s = ref(o.s); return s && (o.b === 0 || o.b === 1) ? { t: 'click', s, b: o.b } : null; }
    case 'quick': { const s = ref(o.s); return s ? { t: 'quick', s } : null; }
    case 'quickOne': { const s = ref(o.s); return s ? { t: 'quickOne', s } : null; }
    case 'drop': { const s = ref(o.s); return s ? { t: 'drop', s, all: !!o.all } : null; }
    case 'dropCursor': return { t: 'dropCursor', all: !!o.all };
    case 'creative': {
      if (!Number.isInteger(o.id) || !Number.isInteger(o.count)) return null;
      const s = o.s === undefined ? undefined : ref(o.s);
      if (s === null) return null;
      return { t: 'creative', id: o.id as number, count: o.count as number, s };
    }
    case 'creativeDelete': return { t: 'creativeDelete' };
    case 'select': return Number.isInteger(o.i) ? { t: 'select', i: o.i as number } : null;
    case 'fill': return typeof o.r === 'string' && o.r.length <= 96 ? { t: 'fill', r: o.r, all: !!o.all } : null;
    case 'close': return { t: 'close' };
    case 'swap': { const s = ref(o.s); return s && Number.isInteger(o.h) ? { t: 'swap', s, h: o.h as number } : null; }
  }
  return null;
}

export function invHash(inv: PlayerInv): number {
  let h = 2166136261 >>> 0;
  const mixStack = (s: ItemStack | null) => {
    const v = s ? (s.id * 131 + s.count * 7 + (s.dmg ?? 0) * 3 + 1) : 0;
    h ^= v;
    h = Math.imul(h, 16777619) >>> 0;
  };
  inv.slots.forEach(mixStack);
  inv.armor.forEach(mixStack);
  inv.craft.forEach(mixStack);
  mixStack(inv.cursor);
  h ^= inv.selected;
  return Math.imul(h, 16777619) >>> 0;
}

export function armorPoints(inv: PlayerInv): number {
  let n = 0;
  for (const a of inv.armor) if (a) n += getItem(a.id)?.armor?.points ?? 0;
  return n;
}

export function heldStack(inv: PlayerInv): ItemStack | null {
  return inv.slots[inv.selected] ?? null;
}

export function damageHeld(inv: PlayerInv, amount = 1): boolean {
  const s = inv.slots[inv.selected];
  if (!s) return false;
  const d = getItem(s.id);
  const max = d?.tool?.durability ?? d?.durability;
  if (!max) return false;
  s.dmg = (s.dmg ?? 0) + amount;
  if (s.dmg >= max) { inv.slots[inv.selected] = null; return true; }
  return false;
}

export function damageArmor(inv: PlayerInv, amount: number): void {
  for (let i = 0; i < 4; i++) {
    const a = inv.armor[i];
    if (!a) continue;
    const max = getItem(a.id)?.armor?.durability ?? 0;
    a.dmg = (a.dmg ?? 0) + Math.max(1, Math.floor(amount / 4));
    if (a.dmg >= max) inv.armor[i] = null;
  }
}

export function consumeHeld(inv: PlayerInv, n = 1): void {
  const s = inv.slots[inv.selected];
  if (!s) return;
  s.count -= n;
  if (s.count <= 0) inv.slots[inv.selected] = null;
}

export function allStacks(inv: PlayerInv): ItemStack[] {
  const out: ItemStack[] = [];
  for (const s of [...inv.slots, ...inv.armor, ...inv.craft, inv.cursor]) if (s) out.push(cloneStack(s)!);
  return out;
}
