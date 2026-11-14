import type { ItemStack, PlayerInv } from '../inventory';
import { armorPoints } from '../inventory';

const SWORD_DMG = [4, 5, 6, 4, 7];
const AXE_DMG = [7, 9, 9, 7, 9];
const PICK_DMG = [2, 3, 4, 2, 5];
const SHOVEL_DMG = [2.5, 3.5, 4.5, 2.5, 5.5];
const AXE_SPD = [0.8, 0.8, 0.9, 1.0, 1.0];
const HOE_SPD = [1, 2, 3, 1, 4];

export interface AttackStats { damage: number; speed: number; sword: boolean; axe: boolean; spear?: boolean; mace?: boolean; reach?: number; wear: number }

export const SPEAR_STATS = [
  { dmg: 1, cd: 13, mult: 0.7, delay: 0.75, s1: 5, s2: 5, s3: 5, dismount: 14 },
  { dmg: 2, cd: 15, mult: 0.82, delay: 0.7, s1: 4.5, s2: 4.5, s3: 4.75, dismount: 13 },
  { dmg: 3, cd: 19, mult: 0.95, delay: 0.6, s1: 2.5, s2: 4.25, s3: 4.5, dismount: 11 },
  { dmg: 1, cd: 19, mult: 0.7, delay: 0.7, s1: 3.5, s2: 5, s3: 5.25, dismount: 13 },
  { dmg: 4, cd: 21, mult: 1.075, delay: 0.5, s1: 3, s2: 3.5, s3: 3.5, dismount: 10 },
  { dmg: 2, cd: 17, mult: 0.82, delay: 0.65, s1: 4, s2: 4.25, s3: 4.25, dismount: 12 },
];
export const SPEAR_MIN = 2, SPEAR_MAX = 4.5, SPEAR_MARGIN = 0.125;
export const CHARGE_HURT_SPEED = 4.6, CHARGE_KNOCK_SPEED = 5.1;
export const ENTITY_REACH = 3, CREATIVE_BONUS = 2;
export const SMASH_MIN_FALL = 1.5, SMASH_RANGE = 3.5, SMASH_PUSH = 0.7, SMASH_HEAVY = 5;

export function chargeDamage(mult: number, closing: number): number { return 1 + mult * closing; }
export function attackRange(stats: AttackStats, creative: boolean): number { return (stats.spear ? SPEAR_MAX : ENTITY_REACH) + (creative ? CREATIVE_BONUS : 0); }

export function attackStats(stack: ItemStack | null): AttackStats {
  const id = stack?.id ?? 0;
  if (id >= 300 && id < 325) {
    const m = Math.floor((id - 300) / 5), t = (id - 300) % 5;
    switch (t) {
      case 0: return { damage: PICK_DMG[m], speed: 1.2, sword: false, axe: false, wear: 2 };
      case 1: return { damage: AXE_DMG[m], speed: AXE_SPD[m], sword: false, axe: true, wear: 2 };
      case 2: return { damage: SHOVEL_DMG[m], speed: 1.0, sword: false, axe: false, wear: 2 };
      case 3: return { damage: SWORD_DMG[m], speed: 1.6, sword: true, axe: false, wear: 1 };
      default: return { damage: 1, speed: HOE_SPD[m], sword: false, axe: false, wear: 2 };
    }
  }
  if (id === 381) return { damage: 6, speed: 0.6, sword: false, axe: false, mace: true, wear: 1 };
  if (id >= 382 && id < 382 + SPEAR_STATS.length) { const t = SPEAR_STATS[id - 382]; return { damage: t.dmg, speed: 20 / t.cd, sword: false, axe: false, spear: true, reach: SPEAR_MAX - ENTITY_REACH, wear: 1 }; }
  return { damage: 1, speed: 4, sword: false, axe: false, wear: 0 };
}

export function maceBonus(fall: number): number {
  if (fall <= SMASH_MIN_FALL) return 0;
  return fall <= 3 ? 4 * fall : fall <= 8 ? 12 + 2 * (fall - 3) : 22 + fall - 8;
}

export function arrowDamage(speedPerTick: number, base: number, crit: boolean, rnd: (n: number) => number): number {
  let d = Math.ceil(Math.max(0, speedPerTick * base));
  if (crit) d += rnd(Math.floor(d / 2) + 2);
  return d;
}

export function attackCharge(sinceMs: number, speed: number): number {
  const period = 1000 / speed;
  return Math.max(0, Math.min(1, (sinceMs + 25) / period));
}

export function scaledDamage(base: number, charge: number): number {
  return base * (0.2 + charge * charge * 0.8);
}

export function armorReduce(inv: PlayerInv, amount: number, toughness = 0, breach = 0): number {
  const armor = Math.min(20, armorPoints(inv));
  if (armor <= 0) return amount;
  const eff = Math.min(20, Math.max(armor / 5, armor - amount / (2 + toughness / 4)));
  return amount * (1 - Math.max(0, eff / 25 - 0.15 * breach));
}

export function enchantBonus(stack: ItemStack | null, mobType: string | null): number {
  if (!stack?.en) return 0;
  let b = 0;
  const sh = stack.en.sharpness ?? 0, sm = stack.en.smite ?? 0, ba = stack.en.bane_of_arthropods ?? 0;
  if (sh > 0) b += 0.5 * sh + 0.5;
  if (sm > 0 && (mobType === 'hollowed' || mobType === 'rattlebone')) b += 2.5 * sm;
  if (ba > 0 && mobType === 'duskweaver') b += 2.5 * ba;
  return b;
}

export const WIND_BURST = [0, 1.2, 1.75, 2.2];

export function armorToughness(inv: PlayerInv): number {
  let t = 0;
  for (const a of inv.armor) if (a && a.id >= 342 && a.id < 346) t += 2;
  return t;
}
