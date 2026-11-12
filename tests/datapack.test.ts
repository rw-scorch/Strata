import { describe, it, expect } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { importDataPack } from '../src/resources/DataPackImporter';
import { makeBook, findRecipe, findSmelt } from '../src/core/crafting';
import { cleanPackList, mergeData } from '../src/core/datapack';
import { B } from '../src/core/blocks';
import { I } from '../src/core/items';

const j = (o: unknown) => strToU8(JSON.stringify(o));

function pack() {
  return zipSync({
    'pack.mcmeta': j({ pack: { pack_format: 48, description: 'Test' }, filter: { block: [{ namespace: 'minecraft', path: 'recipes?/bread(\\.json)?' }] } }),
    'data/test/recipe/saddle_like.json': j({ type: 'minecraft:crafting_shaped', category: 'equipment', pattern: ['LLL', 'S S'], key: { L: 'minecraft:leather', S: '#minecraft:planks' }, result: { id: 'minecraft:bookshelf', count: 2 } }),
    'data/test/recipes/old_style.json': j({ type: 'minecraft:crafting_shaped', pattern: ['X', 'X'], key: { X: { item: 'minecraft:diamond' } }, result: { item: 'minecraft:stick', count: 7 } }),
    'data/test/recipe/flowers.json': j({ type: 'minecraft:crafting_shapeless', ingredients: ['#test:pretty', 'minecraft:bone_meal'], result: { id: 'minecraft:emerald' } }),
    'data/test/tags/item/pretty.json': j({ values: ['minecraft:poppy', 'minecraft:dandelion', 'othermod:thing'] }),
    'data/test/recipe/rotten.json': j({ type: 'minecraft:smelting', ingredient: { item: 'minecraft:rotten_flesh' }, result: 'minecraft:leather', experience: 0.2 }),
    'data/test/recipe/modded.json': j({ type: 'minecraft:crafting_shapeless', ingredients: ['othermod:gear'], result: { id: 'minecraft:stick' } }),
    'data/test/recipe/cut.json': j({ type: 'minecraft:stonecutting', ingredient: 'minecraft:stone', result: { id: 'minecraft:stone_bricks' } }),
  });
}

describe('data pack import', () => {
  it('converts Java recipes', async () => {
    const { pack: p, report } = await importDataPack('test_pack.zip', pack());
    expect(report.crafting).toBe(3);
    expect(report.smelting).toBe(1);
    expect(report.unsupported).toBe(1);
    expect(report.skippedItems).toBe(1);
    expect(p.remove).toContain('bread');
    expect(report.missing).toContain('othermod:gear');
    const book = makeBook(p);
    const L = { id: I.LEATHER, count: 1 }, P = { id: B.BIRCH_PLANKS, count: 1 };
    const r = findRecipe([L, L, L, P, null, P, null, null, null], 3, book);
    expect(r?.result).toBe(B.BOOKSHELF);
    expect(r?.count).toBe(2);
    const old = findRecipe([{ id: I.AETHERITE, count: 1 }, null, { id: I.AETHERITE, count: 1 }, null], 2, book);
    expect(old?.count).toBe(7);
    const fl = findRecipe([{ id: I.BONE_MEAL, count: 1 }, { id: B.DANDELION, count: 1 }, null, null], 2, book);
    expect(fl?.result).toBe(I.EMERALD);
    expect(findSmelt(I.ROTTEN_FLESH, book)?.result).toBe(I.LEATHER);
    const W = { id: I.WHEAT, count: 1 };
    expect(findRecipe([W, W, W, null, null, null, null, null, null], 3, book)).toBeNull();
    expect(findRecipe([W, W, W, null, null, null, null, null, null], 3)?.result).toBe(I.BREAD);
  });

  it('survives sanitising and merging', async () => {
    const { pack: p } = await importDataPack('a.zip', pack());
    const list = cleanPackList(JSON.parse(JSON.stringify([p, { name: 'bad', crafting: [{ id: 'x', result: 99999, pattern: ['A'], key: { A: 1 } }] }])));
    expect(list.length).toBe(1);
    expect(mergeData(list)?.crafting.length).toBe(3);
    expect(cleanPackList([{ name: 'evil', crafting: [{ id: 'y', result: I.STICK, pattern: ['AAAA'], key: { A: 1 } }] }]).length).toBe(0);
  });
});
