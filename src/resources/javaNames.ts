export const JAVA_BLOCK_NAMES: Record<string, { name: string; state?: string }> = {
  aetherite_ore: { name: 'diamond_ore' }, deepslate_aetherite_ore: { name: 'deepslate_diamond_ore' }, aetherite_block: { name: 'diamond_block' }, cinderite_block: { name: 'netherite_block' }, tall_grass: { name: 'short_grass' },
  snowy_grass: { name: 'grass_block', state: 'snowy=true' }, copper_lamp: { name: 'copper_bulb', state: 'lit=true,powered=false' }, trial_spawner: { name: 'trial_spawner', state: 'ominous=false,trial_spawner_state=inactive' }, vault: { name: 'vault', state: 'facing=north,ominous=false,vault_state=inactive' }, furnace: { name: 'furnace', state: 'facing=north,lit=false' },
  furnace_lit: { name: 'furnace', state: 'facing=north,lit=true' }, grass: { name: 'grass_block', state: 'snowy=false' },
  farmland: { name: 'farmland', state: 'moisture=7' }, wheat: { name: 'wheat', state: 'age=0' },
};
