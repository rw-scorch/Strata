import { I } from '../items';
import { B } from '../blocks';

export type MobType = 'woolhorn' | 'mudsnout' | 'fernhen' | 'hollowed' | 'rattlebone' | 'duskweaver';

export interface MobDrop { item: number; min: number; max: number; chance?: number; }

export interface MobDef {
  type: MobType;
  code: number;
  name: string;
  hostile: boolean;
  health: number;
  speed: number;
  hw: number;
  h: number;
  damage: number;
  drops: MobDrop[];
  xp: number;
  lure?: number[];
  burnsInDay?: boolean;
  ranged?: boolean;
  climbs?: boolean;
  desc: string;
}

export const MOBS: Record<MobType, MobDef> = {
  woolhorn: {
    type: 'woolhorn', code: 0, name: 'Woolhorn', hostile: false, health: 8, speed: 1.6, hw: 0.45, h: 1.3, damage: 0,
    drops: [{ item: B.WHITE_WOOL, min: 1, max: 2 }, { item: I.RAW_MUTTON, min: 1, max: 2 }], xp: 2, lure: [I.WHEAT],
    desc: 'A curly-horned grazer with a coat of thick fleece.',
  },
  mudsnout: {
    type: 'mudsnout', code: 1, name: 'Mudsnout', hostile: false, health: 10, speed: 1.5, hw: 0.45, h: 0.9, damage: 0,
    drops: [{ item: I.RAW_PORK, min: 1, max: 3 }, { item: I.LEATHER, min: 0, max: 2 }], xp: 2, lure: [I.WHEAT, I.APPLE],
    desc: 'A stout, snuffling forager that loves apples.',
  },
  fernhen: {
    type: 'fernhen', code: 2, name: 'Fernhen', hostile: false, health: 4, speed: 1.4, hw: 0.25, h: 0.7, damage: 0,
    drops: [{ item: I.FEATHER, min: 0, max: 2 }, { item: I.RAW_POULTRY, min: 1, max: 1 }], xp: 1, lure: [I.SEEDS],
    desc: 'A skittish ground bird with leaf-green plumage.',
  },
  hollowed: {
    type: 'hollowed', code: 3, name: 'Hollowed', hostile: true, health: 20, speed: 2.4, hw: 0.3, h: 1.9, damage: 3,
    drops: [{ item: I.ROTTEN_FLESH, min: 0, max: 2 }, { item: I.IRON_INGOT, min: 1, max: 1, chance: 0.025 }], xp: 5, burnsInDay: true,
    desc: 'A shambling husk that hungers in the dark. Sunlight sets it smouldering.',
  },
  rattlebone: {
    type: 'rattlebone', code: 4, name: 'Rattlebone', hostile: true, health: 20, speed: 2.5, hw: 0.3, h: 1.95, damage: 2,
    drops: [{ item: I.BONE, min: 0, max: 2 }, { item: I.ARROW, min: 0, max: 2 }], xp: 5, burnsInDay: true, ranged: true,
    desc: 'A clattering skeleton archer that keeps its distance.',
  },
  duskweaver: {
    type: 'duskweaver', code: 5, name: 'Duskweaver', hostile: true, health: 16, speed: 3.2, hw: 0.65, h: 0.9, damage: 2,
    drops: [{ item: I.STRING, min: 0, max: 2 }], xp: 5, climbs: true,
    desc: 'A many-eyed spider that pounces from the gloom. Calm in daylight unless provoked.',
  },
};

export const MOB_BY_CODE: MobDef[] = Object.values(MOBS).sort((a, b) => a.code - b.code);
export const PASSIVE_TYPES: MobType[] = ['woolhorn', 'mudsnout', 'fernhen'];
export const HOSTILE_TYPES: MobType[] = ['hollowed', 'rattlebone', 'duskweaver'];
