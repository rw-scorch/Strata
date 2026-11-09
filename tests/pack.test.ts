import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { importPack } from '../src/resources/ResourcePackImporter';

const PACK = '/mnt/user-data/uploads/f7010b96-vanilla-26.3.zip';

describe.skipIf(!existsSync(PACK))('java resource pack import', () => {
  it('maps vanilla blocks, items and animations', async () => {
    const t0 = performance.now();
    const res = await importPack('vanilla-26.3.zip', new Uint8Array(readFileSync(PACK)));
    const m = res.manifest;
    console.log('ms', Math.round(performance.now() - t0), 'format', m.format, m.formatVersion, 'name', m.name, '|', m.description);
    console.log('report', JSON.stringify({ ...m.report, warnings: m.report.warnings, missing: m.report.missing }));
    console.log('grass', JSON.stringify(m.blockFaces.grass), 'furnace', JSON.stringify(m.blockFaces.furnace), 'workbench', JSON.stringify(m.blockFaces.crafting_table));
    console.log('special', Object.keys(m.special).join(','), 'anim', Object.keys(m.animations).join(','));
    console.log('items sample', m.itemTextures.aetherite_pickaxe, m.itemTextures.raw_pork, m.itemTextures.leather_helmet);
    expect(m.format).toBe('java');
    expect(m.report.mappedBlocks).toBeGreaterThan(50);
    expect(m.report.mappedItems).toBeGreaterThan(60);
    expect(m.hash).toHaveLength(64);
  });
});
