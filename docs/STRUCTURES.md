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

## v23 addition: ruined portals

Built from the public wiki description, not from Mojang structure files. Layouts are original voxel plans that follow the wiki's sizes and block mix (frame shape, missing blocks, stone brick debris, gold blocks, chest). Placement rules, moss levels, block replacement odds and the loot table follow the wiki numbers. One portal per 640x640 block region, placed in the first 400x400 of it. Generation level 5, so only land generated after the update gets them.

Nether structures are complete as of v26.

## v24 addition: Nether features

Huge fungi, Nether fossils (bone block spine and ribs), basalt pillars and columns, delta pools and Nether ruined portals are all generated from rules in code, written from the wiki's descriptions. No Mojang structure files are used. Fortress (v25) and Bastion Remnant (v26) come next.

## v25 addition: Nether Fortress

Fortresses are built by `src/core/worldgen/fortress.ts`, which is written from the wiki's description of the layout. No Mojang structure files are used.

1) Placement: one roll per 432 by 432 block region, with a 40 percent chance of a fortress. The start crossing sits in a chunk inside the region, leaving a gap near the region's south and east edges. The deck height is 48 to 63.
2) Layout: the pieces sit on a 12-block lattice.
   - Exterior: bridges span two cells and link crossings (up to 6), two Blaze spawner platforms, up to two stair rooms and one lava well room.
   - Interior: grows out of the well room into corridor turns, crossings (any piece with three or more links), up to two Nether Wart rooms and up to two balconies.
3) Building: each chunk stamps only the parts of the pieces that fall inside it.
   - First it clears air inside the pieces, so the fortress tunnels through netherrack.
   - Bridges get decks, arches and fence railings. Corridors get walls, a roof and 1 by 2 fence windows.
   - Piers run down through air and lava until they reach solid ground.
4) Contents:
   - Spawners hold Blazes.
   - Corridor dead ends and some corridor turns hold a chest filled from the fortress loot table.
   - Wart rooms have soul sand beds with Nether Wart at random growth stages.
5) Mobs: inside a fortress's bounds, a spawn on nether bricks uses the fortress mob list in place of the biome's list.
6) Old chunks: fortresses are only stamped into chunks generated at gen level 6 or above, so Nether land saved before v25 does not change.

## v26 addition: Bastion Remnant

Bastions are built by `src/core/worldgen/bastion.ts`, written from the wiki's descriptions. No Mojang structure files are used.

1) Placement: the regions that miss the 40 percent fortress roll pick a site. If the site is in Basalt Deltas a fortress is built there instead; otherwise a bastion is. The base sits just above the lava sea (y 34 to 37), with a random rotation.
2) Kinds: housing units, hoglin stables, treasure room and bridge, as listed in the README. Every kind uses decayed polished blackstone bricks: a mix of cracked bricks, blackstone and gilded blackstone, with piers down to the ground.
3) Contents: chests filled from the treasure table or the general table, Magma Cube spawners in the treasure room, and guard mobs (piglins, brutes and hoglins). The mobs are spawned once, when the chunk is first generated.
4) Old chunks: bastions, deltas fortresses and ancient debris are only stamped into chunks generated at gen level 7 or above.
