# Structures plan

This is the plan for adding structures to Strata. It covers vanilla-style structures, ideas in the style of the Towns and Towers and vanilla structure update mods, and how to do this without breaking licences or old worlds.

## Status (v14)

1) Done: strongholds and trial chambers (`src/core/worldgen/structures.ts`). Rooms and corridors are joined by a small branching layout with overlap checks, then stamped chunk by chunk.
2) Both use the secret world seed, so clients and seed-map tools cannot predict them; the server sends structure chunks in full.
3) Next: slabs and stairs as blocks, then the JSON structure format and jigsaw villages below.

## Licensing rules

1) Strata ships only original structure designs. Structure files (`.nbt`, jigsaw pools, template pools) from Minecraft, Towns and Towers or any other mod are not copied into the repository or the build.
2) Mod ideas are fine to follow (a "taller pillager outpost", "biome-themed villages"), but the block layouts are drawn fresh for Strata.
3) A player may import structure files from a jar or data pack they own, the same way resource packs work today. Imported files stay on that device, are never uploaded to a server, and only affect single-player worlds.
4) Multiplayer worlds generate on the server, so they only use Strata's own structures.

## Engine work

1) **Structure format.** A small JSON format: size, a palette of block keys, packed block indices, block entity data (chests with loot table ids), and jigsaw connectors. A converter for Java `.nbt` files (gzip plus NBT reader) maps block names through the same name table the data pack importer uses (`javaIdMap`). Unknown blocks become air or a configured fallback.
2) **Placement pass.** Structures are chosen per region (for example 32×32 chunks) with a seeded random, like Java's spacing and separation settings. Each chunk generates only the parts of a structure that overlap it, so chunk generation stays independent and works in workers and on the server.
3) **Jigsaw assembly.** Pieces connect through named connectors up to a depth limit, with a bounding-box overlap check. This is what villages, outposts, trail ruins and the Towns and Towers style towns need.
4) **Terrain fitting.** Rigid pieces sit on the average ground height; "terrain matching" pieces (paths, farms) follow the surface. A beard pass fills under floating floors and carves above sunk ones.
5) **Loot.** Chests get a loot table id, rolled when first opened, so the world file stays small.
6) **Locate.** `/locate structure <name>` searches nearby regions using the same seeded placement.

## Compatibility

1) Each structure set has a version. A chunk records which version generated it, so old chunks never change.
2) New structures appear only in newly generated chunks. Old worlds keep working and get new structures as players explore.
3) The village generator in `village.ts` stays as it is until the jigsaw village replaces it behind a world option. Existing worlds keep the old villages.

## Structure list

### Phase 1: overworld basics

1) Desert well, buried treasure, boulders and fossils (single-piece structures that test the format).
2) Ruined portal-style ruins and shipwreck-style wrecks (single piece, random rotation and mirroring, decay).
3) Dungeon rooms with a spawner and chests.

### Phase 2: jigsaw structures

1) Villages per biome (plains, desert, snowy, taiga, jungle), built from original pieces.
2) Pillager-style outposts, with Towns and Towers style variants per biome.
3) Trail ruins and an underground stronghold-style maze.

### Phase 3: larger and themed

1) Towns and Towers style ideas: small hamlets, larger towns, watchtowers, biome-themed variants, and ship and dock pieces for coasts.
2) Vanilla structure update style ideas: richer interiors, more varied ruins, better integration with terrain.
3) Mineshafts and ocean monuments, which need cave and ocean generation work first.

## Testing

1) Unit tests check that placement is the same for a seed and region on the client and server.
2) A worker test generates a 64×64 chunk area and checks that pieces stay connected and inside their bounding boxes.
3) A browser tool flies over generated villages and outposts and takes screenshots for review.
