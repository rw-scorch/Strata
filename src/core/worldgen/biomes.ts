export type BiomeId =
  | 'ocean' | 'deep_ocean' | 'beach' | 'river' | 'plains' | 'forest' | 'birch_forest' | 'desert'
  | 'mountains' | 'snowy_mountains' | 'snowy_tundra' | 'taiga' | 'swamp' | 'jungle' | 'island';

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
];

export const BIOMES: Biome[] = list.map((b, i) => ({ ...b, index: i }));
export const BIOME_BY_ID = new Map<BiomeId, Biome>(BIOMES.map((b) => [b.id, b]));
export function biome(id: BiomeId): Biome { return BIOME_BY_ID.get(id)!; }
