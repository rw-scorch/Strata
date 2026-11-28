# Staff ranks and official worlds

## Owners
Owner accounts come from the `OWNER_ACCOUNTS` var in `wrangler.jsonc`, a comma separated list of account names (case does not matter). Owners can't be changed in game. To add another owner, add the name to the list and deploy.

Owners can:
1) Give and remove ranks: `/rank <player> admin`, `/rank <player> mod`, `/rank <player> none`. The player needs a registered account.
2) Mark an official world: `/official smp` in a normal world they own, `/official pvp` in a Proving Grounds world they own, `/official off` to undo.
3) Keep any world alive: `/keepalive`, `/keepalive off`.

Every world an owner account creates is hosted for free and never expires.

## Admins and mods
1) Admins are operators in every world, can use `/keepalive`, and can open the admin console by signing in with their account.
2) Mods are operators on the official worlds only.
3) Lower ranks can't kick or mute higher ranks.

Ranks are checked against the account secret every time a player joins, so a copied player id doesn't carry a rank. `/ranks` lists the current staff.

## Official worlds
The title screen shows a button for each official world with its live player count. Only one SMP and one PvP world can be official at a time; marking a new one replaces the old one.

## Starfall
Runs only in the official SMP.
1) The first star falls 10 to 20 minutes after the world starts; after that, every 35 to 60 minutes while someone is online in the overworld.
2) A 60 second warning names the landing spot, with reminders at 30 and 10 seconds.
3) Stars land 28 to 80 blocks from a random online player, on open natural ground, never on or near player builds.
4) The crater holds Starfall Ore (iron pickaxe, drops 1 to 2 Starshards) and a Star Cache chest (Starshards, bottles o' enchanting, and a chance of aetherite, golden apples, ender pearls and an enchanted book).
5) `/starfall` shows the timer, `/starfall last` the last landing, `/starfall now` (operators) drops a star near you.

## Proving Grounds
Create a world in Multiplayer with the Proving Grounds game mode. Talk to the Herald or tap Open duel menu to pick a kit and a bot tier, queue, or challenge someone.

Commands: `/duel bot <kit> <tier>`, `/duel queue <kit>`, `/duel cancel`, `/duel challenge <player> <kit>`, `/duel accept`, `/duel decline`, `/duel leave`, `/duel stats`.

Kits: blade, bulwark, ranger, voidstep. Tiers: squire, knight, champion, warlord.

Duel stats are kept in memory and reset when the world restarts.
