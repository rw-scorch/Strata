import { I, toolId, armorId } from './items';
import type { ItemStack } from './inventory';

export function smithResult(template: ItemStack | null, base: ItemStack | null, add: ItemStack | null): ItemStack | null {
  if (!template || !base || !add || template.id !== I.UPGRADE_TEMPLATE || add.id !== I.CINDERITE_INGOT) return null;
  let id = -1;
  if (base.id >= toolId(4, 0) && base.id <= toolId(4, 4)) id = toolId(5, base.id - toolId(4, 0));
  else if (base.id >= armorId(3, 0) && base.id <= armorId(3, 3)) id = armorId(4, base.id - armorId(3, 0));
  if (id < 0) return null;
  return { ...base, id, count: 1, en: base.en ? { ...base.en } : undefined };
}
