import { I, toolId, armorId } from '../../items';
import { B } from '../../blocks';
import { emptyInv, type ItemStack, type PlayerInv } from '../../inventory';

export type DuelKitId = 'blade' | 'bulwark' | 'ranger' | 'voidstep';
export type BotTier = 'squire' | 'knight' | 'champion' | 'warlord';

export interface DuelKit { id: DuelKitId; name: string; desc: string; build: boolean; }

export const DUEL_KITS: DuelKit[] = [
  { id: 'blade', name: 'Blade', desc: 'Diamond sword and full diamond armour. Pure aim, crits and spacing.', build: false },
  { id: 'bulwark', name: 'Bulwark', desc: 'Sword, axe and shield. Block hits, then break their shield with the axe.', build: false },
  { id: 'ranger', name: 'Ranger', desc: 'Sword, bow, golden apples, a water bucket and blocks to build cover.', build: true },
  { id: 'voidstep', name: 'Voidstep', desc: 'Netherite gear, ender pearls, golden apples and a totem.', build: false },
];
export const KIT_BY_ID = new Map(DUEL_KITS.map((k) => [k.id, k]));

export const BOT_TIERS: { id: BotTier; name: string; desc: string }[] = [
  { id: 'squire', name: 'Squire', desc: 'Slow to react and easy to read. Good for learning.' },
  { id: 'knight', name: 'Knight', desc: 'Strafes, crits now and then, W-taps sometimes.' },
  { id: 'champion', name: 'Champion', desc: 'Quick, accurate, combos with W-taps and crits, uses pearls and shields well.' },
  { id: 'warlord', name: 'Warlord', desc: 'Near-perfect timing. Only for the sharpest.' },
];

const T_DIA = 4, T_NETH = 5, A_DIA = 3, A_NETH = 4;
const sword = (m: number, sharp = 0): ItemStack => ({ id: toolId(m, 3), count: 1, ...(sharp ? { en: { sharpness: sharp } } : {}) });
const axe = (m: number): ItemStack => ({ id: toolId(m, 1), count: 1 });
const piece = (m: number, slot: number, prot = 0): ItemStack => ({ id: armorId(m, slot), count: 1, ...(prot ? { en: { protection: prot } } : {}) });

export function kitInventory(kit: DuelKitId): PlayerInv {
  const inv = emptyInv();
  const put = (i: number, s: ItemStack) => { inv.slots[i] = s; };
  const armour = (m: number, prot = 0) => { for (let s = 0; s < 4; s++) inv.armor[s] = piece(m, s, prot); };
  switch (kit) {
    case 'blade':
      armour(A_DIA);
      put(0, sword(T_DIA));
      break;
    case 'bulwark':
      armour(A_DIA);
      put(0, sword(T_DIA));
      put(1, axe(T_DIA));
      inv.off[0] = { id: I.SHIELD, count: 1 };
      break;
    case 'ranger':
      armour(A_DIA);
      put(0, sword(T_DIA));
      put(1, { id: I.BOW, count: 1 });
      put(2, { id: I.GOLDEN_APPLE, count: 3 });
      put(3, { id: I.WATER_BUCKET, count: 1 });
      put(4, { id: B.OAK_PLANKS, count: 64 });
      put(5, { id: B.COBBLESTONE, count: 64 });
      put(8, { id: I.ARROW, count: 24 });
      break;
    case 'voidstep':
      armour(A_NETH, 2);
      put(0, sword(T_NETH, 1));
      put(1, { id: I.ENDER_PEARL, count: 8 });
      put(2, { id: I.GOLDEN_APPLE, count: 6 });
      inv.off[0] = { id: I.TOTEM, count: 1 };
      break;
  }
  inv.selected = 0;
  return inv;
}
