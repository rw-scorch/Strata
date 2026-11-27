# Realm Hosting (paid world hosting)

Online worlds cost $3 USD a month to keep running. It is billed through Stripe as a monthly subscription for each world, paid by the world's owner.

## When it is on
Paid hosting only switches on when both `STRIPE_SECRET_KEY` (secret) and `HOSTING_PRICE_ID` (a plain variable in `wrangler.jsonc`) are set. With either missing, every world stays online for free and nothing about hosting is shown.

## What players see
1) Worlds that existed before hosting was switched on get 30 free days. The 30 days start the first time anyone opens or joins the world after the switch.
2) New worlds get a 3-day trial (`HOSTING_TRIAL_DAYS` changes it, 0 to 60).
3) The owner's world page in Multiplayer shows the status, with Keep online ($3/month), Manage billing and Export to singleplayer buttons. Owners and operators get a chat reminder when fewer than 7 days are left.
4) When hosting lapses (12 hours of grace after the paid or free time ends), the world freezes: nobody can join, everyone online is saved and disconnected, and the page offers Renew and unfreeze and Export.
5) A frozen world is deleted 60 days after it froze, unless it is renewed. Renewing at any point before then unfreezes it straight away with everything intact.
6) Cancelling in the billing portal keeps the world online until the end of the month already paid for.
7) Game mode worlds (Hearthfall, Spires and the other arenas) never need hosting.

## Admin controls
Server admin console > Hosting on any world: free hosting on or off (a free world never freezes or gets deleted), add 7 or 30 free days, and download a full backup.

## Stripe setup
1) The Realm Hosting product and its $3 monthly price, the webhook endpoint and the customer portal are already set up on the RwStudio Stripe account.
2) The webhook `https://strata.rwscorch.workers.dev/api/stripe/webhook` is shared with the Supporter rank. Hosting events are told apart by `kind=hosting` in the subscription metadata, which also records the world.
3) Secrets, entered on your own machine: `npx wrangler secret put STRIPE_SECRET_KEY` and `npx wrangler secret put STRIPE_WEBHOOK_SECRET`.

## Exports
Export to singleplayer streams the whole world (changed chunks, chests and other block entities, structure progress, the owner's inventory and position, and the world's hidden generation seed so untouched land regenerates identically) and saves it into Singleplayer on that device, with an option to download the file. Files import through Singleplayer > Import.
