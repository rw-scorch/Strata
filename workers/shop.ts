import { parsePacks, type ShardPack } from '../src/core/shop';
import type { StripeEnv } from './stripe';

export interface ShopEnv extends StripeEnv { SHARD_PACKS?: string; }

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

export function shardPacks(env: ShopEnv): ShardPack[] { return parsePacks(env.SHARD_PACKS); }

export function shopEnabled(env: ShopEnv): boolean { return !!(env.ACCOUNTS && env.STRIPE_SECRET_KEY && shardPacks(env).length); }

function accounts(env: ShopEnv): DurableObjectStub { return env.ACCOUNTS!.get(env.ACCOUNTS!.idFromName('global')); }

async function acc(env: ShopEnv, path: string, body: unknown): Promise<Response> {
  return accounts(env).fetch(`https://accounts${path}`, { method: 'POST', body: JSON.stringify(body) });
}

export async function grantShards(env: ShopEnv, session: string, pid: string, shards: number): Promise<void> {
  const r = await acc(env, '/shop/grant', { session, pid, shards });
  if (!r.ok && r.status !== 404) throw new Error(`Shard grant failed (${r.status})`);
}

export async function adminShards(env: ShopEnv, body: Record<string, unknown>): Promise<Response> {
  if (!env.ACCOUNTS) return json({ error: 'Accounts are not enabled.' }, 503);
  const r = await acc(env, '/shop/adjust', { name: body.name, shards: body.shards, keys: body.keys, item: body.item, revoke: body.revoke });
  return new Response(r.body, { status: r.status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

async function stripePost<T>(env: ShopEnv, path: string, params: URLSearchParams): Promise<T> {
  const res = await fetch(`https://api.stripe.com/v1${path}`, { method: 'POST', headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded', 'stripe-version': '2025-03-31.basil' }, body: params.toString() });
  const data = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(data.error?.message ?? `Stripe request failed (${res.status})`);
  return data;
}

export async function shopRoute(req: Request, env: ShopEnv, path: string): Promise<Response> {
  const enabled = shopEnabled(env);
  if (path === '/api/shop/config') return json({ enabled });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!enabled) return json({ error: 'The shard shop is not open on this server.' }, 503);
  let body: Record<string, unknown> = {};
  try { body = JSON.parse((await req.text()).slice(0, 2048)) as Record<string, unknown>; } catch { /* empty */ }
  const auth = { id: body.id, secret: body.secret };
  const op = path.slice('/api/shop/'.length);
  if (op === 'state' || op === 'daily' || op === 'buy' || op === 'crate' || op === 'equip') {
    const r = await acc(env, `/shop/${op}`, { ...auth, item: body.item, crate: body.crate, pay: body.pay, kind: body.kind });
    const data = (await r.json()) as Record<string, unknown>;
    if (op === 'state' && r.ok) data.packs = shardPacks(env).map((p, i) => ({ i, shards: p.shards, label: p.label }));
    return json(data, r.status);
  }
  if (op === 'checkout') {
    const pack = shardPacks(env)[Number(body.pack)];
    if (!pack) return json({ error: 'Pick a shard pack.' }, 400);
    const st = await acc(env, '/shop/state', auth);
    if (!st.ok) return json(await st.json(), st.status);
    const me = (await (await acc(env, '/sup/verify', auth)).json()) as { ok?: boolean; pid: string; name: string; customerId: string | null };
    if (!me.ok) return json({ error: 'Sign in again.' }, 401);
    const origin = new URL(req.url).origin;
    const p = new URLSearchParams();
    p.set('mode', 'payment');
    p.set('line_items[0][price]', pack.price);
    p.set('line_items[0][quantity]', '1');
    p.set('client_reference_id', me.pid);
    if (me.customerId) p.set('customer', me.customerId); else p.set('customer_creation', 'if_required');
    for (const [k, v] of Object.entries({ kind: 'shards', pid: me.pid, name: me.name.slice(0, 60), shards: String(pack.shards) })) { p.set(`metadata[${k}]`, v); p.set(`payment_intent_data[metadata][${k}]`, v); }
    p.set('payment_intent_data[description]', `${pack.shards} Amethyst Shards for ${me.name.slice(0, 60)}`);
    p.set('success_url', `${origin}/?shards=thanks`);
    p.set('cancel_url', `${origin}/?shards=cancelled`);
    try {
      const session = await stripePost<{ url: string }>(env, '/checkout/sessions', p);
      return json({ url: session.url });
    } catch (e) {
      return json({ error: `Payment service error: ${(e as Error).message}` }, 502);
    }
  }
  return json({ error: 'Not found' }, 404);
}
