export type BiomeId =
  | 'ocean' | 'deep_ocean' | 'beach' | 'river' | 'plains' | 'forest' | 'birch_forest' | 'desert'
  | 'mountains' | 'snowy_mountains' | 'snowy_tundra' | 'taiga' | 'swamp' | 'jungle' | 'island'
  | 'savanna' | 'badlands' | 'dark_forest' | 'meadow' | 'old_growth_taiga'
  | 'cherry_grove' | 'mangrove_swamp' | 'mushroom_fields' | 'ice_spikes' | 'warm_ocean';

export interface Biome {
  id: BiomeId;
  index: number;
  name: string;
  grass: [number, number, number];
  foliage: [number, number, number];
  water: [number, number, number];
  cold: boolean;
  rain: boolean;
}

const list: Omit<Biome, 'index'>[] = [
  { id: 'ocean', name: 'Saltmere Ocean', grass: [142, 185, 113], foliage: [113, 167, 77], water: [63, 118, 228], cold: false, rain: true },
  { id: 'deep_ocean', name: 'Abyssal Deep', grass: [142, 185, 113], foliage: [113, 167, 77], water: [40, 90, 200], cold: false, rain: true },
  { id: 'beach', name: 'Shellstrand', grass: [145, 189, 89], foliage: [119, 171, 47], water: [68, 175, 245], cold: false, rain: true },
  { id: 'river', name: 'Winding River', grass: [142, 185, 113], foliage: [113, 167, 77], water: [63, 118, 228], cold: false, rain: true },
  { id: 'plains', name: 'Greenreach Plains', grass: [145, 189, 89], foliage: [119, 171, 47], water: [63, 118, 228], cold: false, rain: true },
  { id: 'forest', name: 'Oakhollow Forest', grass: [121, 192, 90], foliage: [89, 174, 48], water: [63, 118, 228], cold: false, rain: true },
  { id: 'birch_forest', name: 'Silverbark Wood', grass: [136, 187, 103], foliage: [107, 169, 65], water: [63, 118, 228], cold: false, rain: true },
  { id: 'desert', name: 'Sunscour Desert', grass: [191, 183, 85], foliage: [174, 164, 42], water: [50, 165, 152], cold: false, rain: false },
  { id: 'mountains', name: 'Greyspire Highlands', grass: [138, 182, 137], foliage: [109, 163, 107], water: [63, 118, 228], cold: false, rain: true },
  { id: 'snowy_mountains', name: 'Frostcrown Peaks', grass: [128, 180, 151], foliage: [96, 161, 123], water: [61, 87, 214], cold: true, rain: true },
  { id: 'snowy_tundra', name: 'Paleveil Tundra', grass: [128, 180, 151], foliage: [96, 161, 123], water: [61, 87, 214], cold: true, rain: true },
  { id: 'taiga', name: 'Pinewatch Taiga', grass: [134, 183, 131], foliage: [104, 164, 100], water: [40, 112, 160], cold: false, rain: true },
  { id: 'swamp', name: 'Mirewood Swamp', grass: [106, 112, 57], foliage: [106, 112, 57], water: [97, 123, 100], cold: false, rain: true },
  { id: 'jungle', name: 'Verdant Tangle', grass: [89, 201, 60], foliage: [48, 187, 11], water: [20, 160, 180], cold: false, rain: true },
  { id: 'island', name: 'Castaway Isle', grass: [145, 189, 89], foliage: [119, 171, 47], water: [68, 175, 245], cold: false, rain: true },
  { id: 'savanna', name: 'Sunbleached Savanna', grass: [191, 183, 85], foliage: [174, 164, 42], water: [44, 160, 160], cold: false, rain: false },
  { id: 'badlands', name: 'Rustmesa Badlands', grass: [144, 129, 77], foliage: [158, 129, 77], water: [78, 127, 129], cold: false, rain: false },
  { id: 'dark_forest', name: 'Gloomroot Thicket', grass: [80, 122, 50], foliage: [64, 120, 34], water: [59, 107, 210], cold: false, rain: true },
  { id: 'meadow', name: 'Bloomvale Meadow', grass: [131, 187, 109], foliage: [99, 165, 79], water: [14, 78, 207], cold: false, rain: true },
  { id: 'old_growth_taiga', name: 'Elderspire Taiga', grass: [134, 183, 131], foliage: [104, 164, 100], water: [40, 112, 160], cold: false, rain: true },
  { id: 'cherry_grove', name: 'Petalfall Grove', grass: [182, 219, 97], foliage: [182, 219, 97], water: [93, 183, 239], cold: false, rain: true },
  { id: 'mangrove_swamp', name: 'Tanglewater Mangroves', grass: [106, 112, 57], foliage: [141, 177, 39], water: [58, 122, 106], cold: false, rain: true },
  { id: 'mushroom_fields', name: 'Sporecap Isle', grass: [85, 201, 63], foliage: [43, 187, 15], water: [63, 118, 228], cold: false, rain: true },
  { id: 'ice_spikes', name: 'Frostspire Barrens', grass: [128, 180, 151], foliage: [96, 161, 123], water: [57, 56, 201], cold: true, rain: true },
  { id: 'warm_ocean', name: 'Coralreach Shallows', grass: [145, 189, 89], foliage: [119, 171, 47], water: [67, 213, 238], cold: false, rain: true },
];

export const BIOMES: Biome[] = list.map((b, i) => ({ ...b, index: i }));
export const BIOME_BY_ID = new Map<BiomeId, Biome>(BIOMES.map((b) => [b.id, b]));
export function biome(id: BiomeId): Biome { return BIOME_BY_ID.get(id)!; }
