# Redstone plan

This is the plan for adding Java Edition style redstone to Strata, so players can build the same contraptions and farms they know: sugar cane and wheat farms, piston doors, clocks, item sorters, and the stranger technical builds (quasi-connectivity, BUDs, item-order wireless). It is written from research into how Java Edition behaves, with the sources listed at the end.

## Status

1) **Phase 0 (engine): done in v16.** `src/core/sim/redstone.ts` has:
   - scheduled block ticks with the Java priorities, run before fluids;
   - depth-first neighbor updates in Java order;
   - a 300,000 update budget per tick;
   - entities ticked in creation order and block entities after them.
   Components in a chunk are re-checked when the chunk loads, so buttons and torches never get stuck after a restart.
2) **Phase 1 (signals): done in v16.** Dust, Ember Torch (redstone torch, with burnout), lever, stone and oak buttons and pressure plates, Ember Block, Ember Lamp, Ember Relay (repeater, with delay, pulse extension and locking), Ember Gauge (comparator, with compare, subtract and container reading), and powered oak doors.
   - Dust is solved as a whole network, with updates sent once per changed wire, nearest the source first.
   - Ember Ore appears only in newly generated chunks.
   - Strata names: Emberdust is redstone dust; Ember Relay is the repeater; Ember Gauge is the comparator. The Gauge uses a copper ingot where Java uses nether quartz.
3) **Phase 2 (motion and items): mostly done in v17.**
   - Piston and sticky piston: block events, 2-tick moving blocks, the 12-block limit, immovable blocks (obsidian, spawners, containers, extended pistons), blocks that break when pushed, entities pushed along, and quasi-connectivity (a piston also counts power at the block above it).
   - Watcher (observer): a 2-tick pulse out of its back when the block it faces changes, including when it is moved by a piston.
   - Dropper and dispenser: 4-tick delay, rising edge only, quasi-connectivity. Droppers feed a container in front or drop the item. Dispensers place and pick up water and lava, use bone meal, fire arrows, and drop anything else.
   - Hopper: 8-tick cooldown, pushes before it pulls, pulls from containers or dropped items above, feeds furnaces by Java's slot rules, and locks while powered.
   - Comparators read hoppers, droppers and dispensers.
4) **v18 additions:**
   - Java's piston structure resolver: Tidegel (slime) and Sapwax (honey) blocks drag every block stuck to them, they do not stick to each other, and the 12-block limit counts the whole structure.
   - Block states are captured before anything is destroyed, and moving blocks are placed farthest first, like Java. A Thunder Keg (TNT) that is lit by an update in the middle of a push still arrives, so TNT duplicators work. A torch, flower or other block that breaks when pushed does the job of Java's coral fan.
   - Short pulses: a sticky piston that is unpowered before its push finishes leaves the block behind ("spitting").
   - Entities move with the blocks over the 2 ticks: a piston facing up lifts you, pushed blocks shove you out of the way, and blocks moving sideways carry you only if they are sticky.
   - Smooth piston animation on the client.
   - Thunder Keg (TNT): 4-second fuse, Java's explosion rays and blast resistance, chain reactions, no block damage in water, and dispensers can place lit kegs.
5) **Not yet:** daylight detector, target block, items carried by water at Java speeds, shape (PP) updates as a separate pass, and phases 3 and 4.

## Goals

1) **Java parity first.** Builds copied from a Java tutorial should work the same in Strata, including the odd parts players rely on: quasi-connectivity, block update detectors, repeater locking, observer pulses, torch burnout and the 12-block piston limit.
2) **Deterministic and server-side.** Redstone runs only in the authoritative simulation (`WorldSim`), on the Durable Object for servers and in the local session for single player. Clients only draw results. The same inputs always give the same outputs, so timing-sensitive builds (and item-order wireless) are reliable.
3) **Cheap enough for a Durable Object.** Dust is solved as a network rather than recursively, updates have a per-tick budget, and redstone only runs inside the simulation distance.
4) **Old worlds keep working.** New blocks get new IDs; nothing existing changes meaning.

## How Java times things

1) **Ticks.** The game runs at 20 game ticks per second. A "redstone tick" is just a community name for 2 game ticks (0.1 s); there is no separate redstone clock. Repeater delays of 1 to 4 redstone ticks are 2, 4, 6 or 8 game ticks.
2) **Tick phases.** Each game tick runs, in order: scheduled block ticks, scheduled fluid ticks, raids, chunk work in random order (mob spawning, snow and ice, random ticks), block events, entities, block entities, then game events (vibrations). Strata's `WorldSim.tick()` will be reordered to match.
3) **Scheduled tick priority.** Block ticks run by priority, then in the order they were scheduled:
   - -3: a repeater facing the back or side of another repeater or comparator;
   - -2: a repeater that is turning off;
   - -1: other repeaters, and comparators facing the back or side of another diode;
   - 0: everything else.
   Fluid ticks have no priority and run after block ticks. Java caps scheduled ticks at 65,536 per game tick.
4) **When pistons start.** A piston powered during the scheduled tick, random tick or block event phase starts in the same tick's block event phase. One powered during the entity or block entity phase, or by a player, starts in the next tick's block event phase. Pushed blocks arrive in the block entity phase, and a stroke takes 2 game ticks.

## Block updates

Java has three kinds of update, and builds depend on all of them.

1) **Neighbor changed (NC).** Sent to the six neighbors in the order west, east, down, up, north, south. Redstone components react to these.
2) **Post placement, or shape (PP).** Sent in the order west, east, north, south, down, up. Attached blocks check their support, connecting blocks (dust, fences) recalculate their shape, repeaters check locking, water schedules a flow tick, observers schedule a pulse.
3) **Comparator updates.** When a container's contents change, comparators next to it, or behind one solid block, recalculate. The order is north, east, south, west.
4) **Depth first.** If A updates B and C, and B updates D and E, the order is B, D, E, C.
5) **Extra reach.** Most updates reach only the six neighbors. Exceptions: redstone torches and dust update the neighbors of their neighbors; levers, buttons and pressure plates also update the block they hang on and its neighbors; repeaters, comparators and observers update the block they face and that block's neighbors.
6) **Silent changes.** Many state changes send no NC update: crop and plant growth, repeater and comparator state, lamp toggling, doors and trapdoors. This is exactly why observers exist, and why sugar cane farms need them.

Strata today has ad hoc support checks (`checkSupport`, `scheduleFluidAround`). Phase 0 replaces these with a single update system using the orders above.

## Power rules

1) **Signal strength** runs from 0 to 15. Dust loses 1 per block of dust, so it reaches at most 15 blocks. Dust-to-block and dust-to-device transfers don't lose strength.
2) **Strong and weak power.** An opaque block powered by a power component, repeater or comparator is strongly powered: it powers dust next to it (including above and below). An opaque block powered only by dust is weakly powered: it powers repeaters, comparators and mechanisms, but not dust. One opaque block can't power another directly. Transparent blocks are never powered.
3) **Dust.**
   - An isolated wire is a cross that points all four ways; using it toggles it to a dot that only powers the block under it.
   - It connects to wire one block higher or lower unless an opaque block cuts the corner.
   - It powers the block under it and the blocks it points into.
   - In Java it doesn't bend toward mechanisms on its own.
   - Power goes down through opaque blocks but not transparent ones.
4) **Activation.**
   - Edge-triggered blocks act on a rising edge: dispensers, droppers, note blocks.
   - Level-following blocks track their input: lamps, pistons, hoppers.
   - Doors, trapdoors and fence gates open on a rising edge and close on a falling edge.
5) **Quasi-connectivity (Java only).** Pistons, sticky pistons, dispensers and droppers also activate if the space above them would be activated, even if that space is air. Crafters and powered rails don't. If the power arrives without an update reaching the piston (the source can be up to three blocks away, but updates reach two), the piston waits in that state until something updates it. That is the block update detector (BUD) behavior many builds use.

## Components and their numbers

| Component | Behavior to reproduce |
|---|---|
| Lever | On and off instantly. Strongly powers the block it is on. |
| Stone button | On for 20 game ticks. |
| Wooden button | On for 30 game ticks; an arrow keeps it pressed while it stays in the button. |
| Wooden and stone pressure plates | Wooden plates detect all entities, stone plates only players and mobs. They release at the next multiple of 10 ticks after the last entity leaves, with at least 20 ticks on. |
| Weighted pressure plates | Output depends on entity count. Light and heavy weights use different scales. |
| Redstone torch | Lit unless its attachment block is strongly powered. Changes after 2 game ticks. Strongly powers the block above and weakly powers its other neighbors, but not the block it is on. Burns out if forced off more than 8 times in 60 ticks; it may relight after 160 ticks. |
| Redstone block | Always 15. Movable by pistons. |
| Repeater | Delay of 2, 4, 6 or 8 game ticks. Restores the signal to 15 and strongly powers the block in front. Extends short on-pulses to its delay and swallows short off-pulses. A powered repeater or comparator facing its side locks it. |
| Comparator | Compare mode outputs the rear signal unless a side is stronger. Subtract mode outputs rear minus the strongest side, with a floor of 0. Takes 2 game ticks and ignores 1-tick blips. Reads containers through one solid block: output = floor(1 + (sum of slot fullness / slots) x 14), where an empty container gives 0. |
| Observer | Detects any block state change in front (crop age, sugar cane and kelp growth, dust shape), but not container contents. Pulses 15 from its back for 2 game ticks after a 2-tick delay. Pulses again after being moved, which is how flying machines work. |
| Piston and sticky piston | Pushes up to 12 blocks. Some blocks are immovable (obsidian, bedrock, spawners, vaults, extended pistons); containers break when pushed in current Java (barrels, chests, furnaces, hoppers, dispensers). Attached blocks drop. A stroke takes 2 game ticks. A pulse under 3 game ticks makes a sticky piston drop its block. Slime and honey blocks drag neighbors (honey doesn't stick to slime). |
| Dispenser and dropper | Act 4 game ticks after a rising edge, ignoring input in between. They pick a random filled slot when firing, not when triggered. Droppers feed containers. Dispensers place and pick up water and lava, use bone meal, shoot arrows and equip armor. Quasi-connectivity applies. |
| Hopper | Moves 1 item, then waits 8 game ticks. Collects item entities in the full block above unless a solid block covers it. Pushes before it pulls in the same tick. Any redstone power locks it, and it waits 2 game ticks after unlocking. Comparators read it (1 item gives 1, and one unstackable item gives 3). |
| Redstone lamp | Turns on at once and off after a short delay. |
| Daylight detector | Updates once a second from sky light and time; it can be inverted for night. |
| Target block | Output 1 to 15 by how close to the center it is hit. Arrows hold it for 20 ticks, other projectiles 8. |
| Sculk sensor | Detects vibrations within 8 blocks, travelling 1 block per tick. Output strength falls with distance. Active for 30 ticks, then a 10-tick cooldown. A comparator reads a frequency of 1 to 15 by event type (block place 13, block destroy 12, container open 10). Wool blocks it. |
| Calibrated sculk sensor | Active for 10 ticks and has twice the range. Filters by frequency. |

## Wireless redstone

Java players use three kinds of wireless:

1) **Sculk sensors.** Calibrated sensors listen for one vibration frequency, and amethyst can relay vibrations. This needs the game event system (phase 4).
2) **Item-order wireless.** Java ticks entities in one global list, sorted by when they were created. Builds drop two items in the same tick and check whether a third item from a far-away transmitter landed between them in that order. Strata's entity map already keeps insertion order, so this works if:
   - entities are always ticked in creation order;
   - items created in the same tick keep that order;
   - block events and scheduled ticks happen in Java order.
   The tick phase work in phase 0 is what makes this reliable.
3) **Chunk-based tricks** such as ender pearl loaders, which depend on chunk loading. Strata only simulates near players, so these are out of scope.

## Farms this unlocks

1) **Sugar cane.** An observer watches the cane; when it grows, the observer fires a piston that breaks the cane, and hoppers or a water stream collect it. Cane grows one block every 16 random ticks (about 18 minutes on average), up to 3 tall. This needs observers that see silent growth, pistons, breaking with drops, and hoppers.
2) **Wheat, carrots, potatoes.** Water dispensers flush the field: flowing water breaks crops and carries the items to hoppers. Farmer villagers can harvest and replant on their own. This needs dispensers placing and picking up water, water breaking crops (already true), items carried by flowing water, and hoppers.
3) **Kelp.** Observers watch the kelp grow and pistons cut it (v15 adds kelp).
4) **Cactus, bamboo, pumpkins and melons.** Pistons or flying machines harvest them. These need the plants, slime blocks and observers.
5) **Cobblestone.** Lava next to water. v15 fixes lava and water updates so generators work reliably.

## Phases

### Phase 0: engine

1) Reorder `WorldSim.tick()` into the Java phases above, and tick entities in creation order.
2) Add one scheduled tick queue with priorities (replacing the fluid-only queue) and a block event queue.
3) Add one update system with NC, PP and comparator updates in Java order, depth first. Port support checks, fluids and falling blocks onto it.
4) **Block IDs.** Strata stores an 8-bit ID and 8 bits of state per block, and IDs 179 to 255 are free. That's enough for phases 1 and 2 (about 40 blocks). Later phases need a chunk format with 16-bit IDs, migrated on load, so this is designed now.
5) **Saving:**
   - pending scheduled ticks and block events are saved with the world (Java saves tile ticks per chunk);
   - single player saves them through `WorldState`, and servers through the DO's SQLite store.
6) **Budget:** a per-tick update and scheduled-tick budget (initially 20,000 updates). Work beyond the budget is deferred and logged for operators, so a lag machine slows only itself.
7) **Simulation distance.** Redstone only runs in ticking chunks. Updates that reach an unloaded chunk are dropped, as in Java.
8) **Anti-xray.** Pistons and observers must call `revealAround` when they move or expose blocks, so they can't be used to find hidden ores.

### Phase 1: signals

1) Dust, using a network solver like Alternate Current: compute the whole network's power first, then send updates once per changed wire in a fixed order.
   - The order follows Java's Redstone Experiments: segments nearer the source first, with ties going left first.
   - This keeps behavior close to Java while being up to 20 to 30 times cheaper than recursive dust.
2) Redstone torch with burnout, lever, buttons, pressure plates, redstone block, lamp.
3) Repeater, with delay, locking and priorities.
4) Comparator, with both modes and container reading.
5) Iron door, iron trapdoor, and redstone on wooden doors, trapdoors and fence gates.
6) Recipes and textures. Original Strata textures, and pack textures when a pack is active.
7) Mesher work: dust shapes and colors by power, the diode models, and torch sides.

### Phase 2: motion and items

1) Piston and sticky piston:
   - block events and the moving-block entity, rendered as smooth motion on the client;
   - the 12-block limit, the immovable and break-on-push lists, short pulses and quasi-connectivity;
   - entities pushed along.
2) Observer.
3) Dispenser and dropper, with their item behaviors.
4) Hopper, with the timing above.
5) Slime and honey blocks.
6) Daylight detector and target block.
7) Items carried by flowing water at Java speeds, which farms need.

### Phase 3: farms and villagers

1) Farmer villagers harvest and replant.
2) Pumpkins and melons, cactus farms and bamboo.
3) Test farms built from well-known tutorial designs, measuring output per hour against Java numbers.

### Phase 4: advanced

1) Sculk sensors, calibrated sensors, the vibration frequency table, and amethyst relays.
2) Minecarts and rails: powered, detector and activator rails, hopper and chest minecarts.
3) TNT, the crafter, and copper bulbs (Strata's copper lamp becomes a toggling bulb).
4) Item-order wireless verified with a test build.

## Testing

1) **Golden circuits.** Each circuit is built in a unit test and stepped tick by tick, checking power levels against Java behavior: repeater clock, observer clock, hopper clock, RS NOR latch, T flip-flop, 2x2 piston door, BUD, torch burnout, comparator subtraction, and a QC piston that only fires on update.
2) **Determinism.** The same build run twice, and on client and server code paths, gives identical tick-by-tick traces.
3) **Performance.** A 1,000-dust network and a 64-piston flying machine are timed against the DO tick budget.
4) **Farms.** Output per simulated hour for the sugar cane and wheat farms matches the expected rates within tolerance.

## Sources

1) https://minecraft.wiki/w/Redstone, https://minecraft.wiki/w/Redstone_circuits (could not be fetched; the same articles were read from the November 2025 mirror at wiki.ronlab.site)
2) https://minecraft.fandom.com/wiki/Redstone_mechanics
3) https://redstone.build/chapter1
4) https://minecraft-archive.fandom.com/wiki/Redstone (could not be fetched)
5) Minecraft Wiki (fandom): Tick, Block update, Piston, Observer, Redstone Comparator, Redstone Repeater, Redstone Dust, Hopper, Sculk Sensor, Tutorials/Sugar cane farming
6) Minecraft Wiki mirror (wiki.ronlab.site, November 2025): Redstone torch, Redstone circuits, Quasi-connectivity, Redstone Experiments, Redstone components, Piston, Dispenser, Tutorial:Crop farming, Lava, Water
7) Alternate Current (SpaceWalkerRS), an efficient non-locational dust algorithm: https://modrinth.com/mod/alternate-current
8) r/redstone discussion of Java item-order wireless redstone
