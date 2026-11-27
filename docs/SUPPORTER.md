# Supporter rank (Stripe)

Strata sells a monthly Supporter subscription through Stripe Checkout. No keys are stored in the code: everything comes from Cloudflare secrets.

## Perks
1) Two extra homes in every world, on top of the world's home limit.
2) A bigger minimap that zooms out three times further on the full map.
3) A gold star next to your name, in chat and above your head.
4) A name colour you choose from the profile screen.

Perks are tied to the signed-in account. Guests cannot subscribe.

Until `STRIPE_SECRET_KEY` is set, the Supporter section is hidden from the Profile screen and no paid feature is shown anywhere. Stripe lets people aged 13 to 17 open a standard account, but a parent or legal guardian has to be added as the account's owner before it can take payments or pay out.

## Setting it up
1) In the Stripe dashboard, start in **test mode**.
2) Add the secret key as a Cloudflare secret. Run `npx wrangler secret put STRIPE_SECRET_KEY` and paste the key (it starts with `sk_test_` in test mode) when asked. Never paste it into chat, code or a commit.
3) In Stripe, go to Developers, then Webhooks, and add an endpoint:
   - URL: `https://<your site>/api/stripe/webhook`
   - Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`
4) Copy that endpoint's signing secret (it starts with `whsec_`) and run `npx wrangler secret put STRIPE_WEBHOOK_SECRET`.
5) Set the price. Choose one of these:
   - Create a recurring monthly Price in Stripe and put its `price_...` id in `STRIPE_PRICE_ID` under `vars` in `wrangler.jsonc` (price ids are not secret). This is already done for the live Supporter price.
   - Or skip the Price, and Strata creates the line item itself. It defaults to 200 cents USD a month. Change that with the `SUPPORTER_CURRENCY` (for example `nzd`) and `SUPPORTER_AMOUNT` (in cents) variables in the Cloudflare dashboard.
6) In Stripe, under Settings, then Billing, then Customer portal, turn the portal on so players can cancel or update their card from the game.
7) Test with Stripe's test card `4242 4242 4242 4242`. When it works, repeat steps 2 to 5 with your live keys.

## How it works
- `POST /api/supporter/checkout` checks the player's account, then creates a Checkout Session in subscription mode. The player's id is stored on the session and on the subscription.
- `POST /api/stripe/webhook` checks the `Stripe-Signature` header with the signing secret. It rejects anything older than 5 minutes and ignores events it has already handled. It then records the subscription's status and the end of the paid period in the Accounts Durable Object.
- A player counts as a Supporter while the subscription is active, trialing or past due, and the paid period has not ended more than 3 days ago.
- World rooms look up the status when a player joins.
- `POST /api/supporter/portal` opens the Stripe customer portal.
