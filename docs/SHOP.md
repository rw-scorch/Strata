# Shard Shop

Players buy Amethyst Shards with Stripe and spend them on cosmetics: titles, trails and capes. Nothing in the shop affects gameplay.

## What is for sale
1) 9 titles, shown in brackets before your name in chat and above your head.
2) 8 trails, particles that follow you as you move.
3) 8 capes, worn on your back. A cape is hidden while you wear an elytra.

Prices by rarity: common 250, rare 500, epic 900, mythic 1,400 shards.

## Caches (pick-your-reward crates)
1) A cache always shows the three cosmetics inside it before you pay. You choose one of them, so nothing is random at the point of sale.
2) **Wanderer's Cache:** common and rare cosmetics, for 350 shards or 3 cache keys.
3) **Gilded Reliquary:** rare, epic and mythic cosmetics, for 900 shards.
4) After you open a cache, a new set of three appears. The set also changes each day. Cosmetics you already own are never offered.
5) Each player can claim one free cache key a day, and hold up to 9.

## Shard packs
The packs are one-off Stripe prices on the "Amethyst Shards" product, listed in `SHARD_PACKS` in `wrangler.jsonc`:
1) 500 shards for $1.99 USD
2) 1,300 shards for $4.99 USD
3) 2,800 shards for $9.99 USD

To change a pack, create a new one-off price in Stripe and edit `SHARD_PACKS`. Each entry needs `price` (the `price_...` id), `shards` and `label`. Price ids are not secret.

The shop stays hidden until `STRIPE_SECRET_KEY` is set and `SHARD_PACKS` lists at least one pack.

## How payment works
1) `POST /api/shop/checkout` creates a Checkout Session in payment mode, with the player's account id on it.
2) When Stripe sends `checkout.session.completed` and the session is paid, the webhook reads the session's line items from Stripe and works out the shards from the price ids in `SHARD_PACKS`. The shard count in metadata is never trusted.
3) Each session is credited once, so Stripe retries can't add shards twice.
4) Balances, owned cosmetics and equipped slots are stored in the Accounts Durable Object.
5) World rooms read a player's equipped cosmetics when they join, so changes show the next time you join a world.

## Admin
An admin can correct a balance, for example after a refund:
```
POST /api/admin/shards
x-admin-key: <your admin key>
{"name": "PlayerName", "shards": -500, "keys": 0}
```
Add `"item": "c_ember"` to grant a cosmetic, or with `"revoke": true` to take one away.

Refunds in Stripe don't remove shards automatically.
