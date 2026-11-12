import type { ItemStack, PlayerInv } from '../inventory';
import { armorPoints } from '../inventory';

const SWORD_DMG = [4, 5, 6, 4, 7];
const AXE_DMG = [7, 9, 9, 7, 9];
const PICK_DMG = [2, 3, 4, 2, 5];
const SHOVEL_DMG = [2.5, 3.5, 4.5, 2.5, 5.5];
const AXE_SPD = [0.8, 0.8, 0.9, 1.0, 1.0];
const HOE_SPD = [1, 2, 3, 1, 4];

export interface AttackStats { damage: number; speed: number; sword: boolean; axe: boolean }

export function attackStats(stack: ItemStack | null): AttackStats {
  const id = stack?.id ?? 0;
  if (id >= 300 && id < 325) {
    const m = Math.floor((id - 300) / 5), t = (id - 300) % 5;
    switch (t) {
      case 0: return { damage: PICK_DMG[m], speed: 1.2, sword: false, axe: false };
      case 1: return { damage: AXE_DMG[m], speed: AXE_SPD[m], sword: false, axe: true };
      case 2: return { damage: SHOVEL_DMG[m], speed: 1.0, sword: false, axe: false };
      case 3: return { damage: SWORD_DMG[m], speed: 1.6, sword: true, axe: false };
      default: return { damage: 1, speed: HOE_SPD[m], sword: false, axe: false };
    }
  }
  return { damage: 1, speed: 4, sword: false, axe: false };
}

export function attackCharge(sinceMs: number, speed: number): number {
  const period = 1000 / speed;
  return Math.max(0, Math.min(1, (sinceMs + 25) / period));
}

export function scaledDamage(base: number, charge: number): number {
  return base * (0.2 + charge * charge * 0.8);
}

export function armorReduce(inv: PlayerInv, amount: number, toughness = 0): number {
  const armor = Math.min(20, armorPoints(inv));
  if (armor <= 0) return amount;
  const eff = Math.min(20, Math.max(armor / 5, armor - amount / (2 + toughness / 4)));
  return amount * (1 - eff / 25);
}

export function armorToughness(inv: PlayerInv): number {
  let t = 0;
  for (const a of inv.armor) if (a && a.id >= 342 && a.id < 346) t += 2;
  return t;
}
