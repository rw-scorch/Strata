export interface StripeEnv {
  ACCOUNTS?: DurableObjectNamespace;
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRICE_ID?: string;
  SUPPORTER_CURRENCY?: string;
  SUPPORTER_AMOUNT?: string;
  HOSTING_PRICE_ID?: string;
  HOSTING_LABEL?: string;
  SHARD_PACKS?: string;
}

import { grantShards, shardPacks } from './shop';

export type RoomLookup = (code: string) => Promise<{ target: string; stub: { fetch(input: string | Request, init?: RequestInit): Promise<Response> } } | null>;

const API = 'https://api.stripe.com/v1';

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}

function form(obj: Record<string, unknown>, prefix = '', out = new URLSearchParams()): URLSearchParams {
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (Array.isArray(v)) v.forEach((item, i) => (typeof item === 'object' ? form(item as Record<string, unknown>, `${key}[${i}]`, out) : out.append(`${key}[${i}]`, String(item))));
    else if (typeof v === 'object') form(v as Record<string, unknown>, key, out);
    else out.append(key, String(v));
  }
  return out;
}

async function stripe<T>(env: StripeEnv, method: 'GET' | 'POST', path: string, params?: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'content-type': 'application/x-www-form-urlencoded', 'stripe-version': '2025-03-31.basil' },
    body: method === 'POST' && params ? form(params).toString() : undefined,
  });
  const data = (await res.json()) as T & { error?: { message?: string } };
  if (!res.ok) throw new Error(data.error?.message ?? `Stripe request failed (${res.status})`);
  return data;
}

function accounts(env: StripeEnv): DurableObjectStub {
  return env.ACCOUNTS!.get(env.ACCOUNTS!.idFromName('global'));
}

async function accountsPost<T>(env: StripeEnv, path: string, body: unknown): Promise<T> {
  const r = await accounts(env).fetch(`https://accounts${path}`, { method: 'POST', body: JSON.stringify(body) });
  return (await r.json()) as T;
}

function hexOf(buf: ArrayBuffer): string { return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join(''); }

export async function verifyStripeSignature(payload: string, header: string, secret: string, now = Date.now(), tolerance = 300): Promise<boolean> {
  const parts = header.split(',').map((p) => p.trim().split('='));
  const t = parts.find(([k]) => k === 't')?.[1];
  const sigs = parts.filter(([k]) => k === 'v1').map(([, v]) => v);
  if (!t || !sigs.length || Math.abs(now / 1000 - Number(t)) > tolerance) return false;
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const expected = hexOf(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`)));
  return sigs.some((s) => s.length === expected.length && [...s].reduce((d, c, i) => d | (c.charCodeAt(0) ^ expected.charCodeAt(i)), 0) === 0);
}

interface Sub { id: string; status: string; customer: string; metadata?: Record<string, string>; current_period_end?: number; items?: { data?: { current_period_end?: number }[] } }

function periodEnd(s: Sub): number {
  const t = s.current_period_end ?? Math.max(0, ...(s.items?.data ?? []).map((i) => i.current_period_end ?? 0));
  return t * 1000;
}

function priceLabel(env: StripeEnv): string {
  const amount = Number(env.SUPPORTER_AMOUNT ?? 200);
  const cur = (env.SUPPORTER_CURRENCY ?? 'usd').toUpperCase();
  return `${cur === 'USD' || cur === 'NZD' || cur === 'AUD' || cur === 'CAD' ? '$' : ''}${(amount / 100).toFixed(2).replace(/\.00$/, '')} ${cur} a month`;
}

async function readBody(req: Request): Promise<Record<string, string>> {
  try { return JSON.parse((await req.text()).slice(0, 2048)) as Record<string, string>; } catch { return {}; }
}

export async function supporterRoute(req: Request, env: StripeEnv, path: string, rooms?: RoomLookup): Promise<Response> {
  if (path === '/api/stripe/webhook') return webhook(req, env, rooms);
  if (!env.ACCOUNTS) return json({ error: 'Accounts are not enabled on this server.' }, 503);
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const body = await readBody(req);
  const me = await accountsPost<{ ok?: boolean; error?: string; pid: string; name: string; customerId: string | null; active: boolean; until: number; color: string | null; status: string | null }>(env, '/sup/verify', { id: body.id, secret: body.secret });
  if (!me.ok) return json({ error: me.error ?? 'Sign in first.' }, 401);
  const enabled = !!env.STRIPE_SECRET_KEY;
  if (path === '/api/supporter/status') return json({ enabled, price: priceLabel(env), active: me.active, until: me.until, color: me.color, status: me.status, canManage: !!me.customerId });
  if (path === '/api/supporter/color') {
    const r = await accountsPost<{ ok?: boolean; error?: string; color?: string }>(env, '/sup/color', { id: body.id, secret: body.secret, color: body.color });
    return json(r, r.ok ? 200 : 400);
  }
  if (!enabled) return json({ error: 'Supporter payments are not set up on this server yet.' }, 503);
  const origin = new URL(req.url).origin;
  try {
    if (path === '/api/supporter/checkout') {
      if (me.active) return json({ error: 'You are already a Supporter. Thank you!' }, 409);
      const line = env.STRIPE_PRICE_ID
        ? { price: env.STRIPE_PRICE_ID, quantity: 1 }
        : { quantity: 1, price_data: { currency: (env.SUPPORTER_CURRENCY ?? 'usd').toLowerCase(), unit_amount: Number(env.SUPPORTER_AMOUNT ?? 200), recurring: { interval: 'month' }, product_data: { name: 'Strata Supporter' } } };
      const session = await stripe<{ url: string }>(env, 'POST', '/checkout/sessions', {
        mode: 'subscription',
        line_items: [line],
        client_reference_id: me.pid,
        customer: me.customerId ?? undefined,
        metadata: { pid: me.pid, name: me.name },
        subscription_data: { metadata: { pid: me.pid, name: me.name } },
        allow_promotion_codes: true,
        success_url: `${origin}/?supporter=thanks`,
        cancel_url: `${origin}/?supporter=cancelled`,
      });
      return json({ url: session.url });
    }
    if (path === '/api/supporter/portal') {
      if (!me.customerId) return json({ error: 'There is no subscription on this account yet.' }, 404);
      const session = await stripe<{ url: string }>(env, 'POST', '/billing_portal/sessions', { customer: me.customerId, return_url: `${origin}/` });
      return json({ url: session.url });
    }
  } catch (e) {
    return json({ error: `Payment service error: ${(e as Error).message}` }, 502);
  }
  return json({ error: 'Not found' }, 404);
}

async function webhook(req: Request, env: StripeEnv, rooms?: RoomLookup): Promise<Response> {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!env.STRIPE_WEBHOOK_SECRET || !env.STRIPE_SECRET_KEY) return json({ error: 'Webhook not configured' }, 503);
  const payload = await req.text();
  if (payload.length > 512_000) return json({ error: 'Too large' }, 413);
  if (!(await verifyStripeSignature(payload, req.headers.get('stripe-signature') ?? '', env.STRIPE_WEBHOOK_SECRET))) return json({ error: 'Bad signature' }, 400);
  const evt = JSON.parse(payload) as { id: string; type: string; data: { object: Record<string, unknown> } };
  const obj = evt.data.object;
  try {
    const md = (obj.metadata ?? {}) as Record<string, string>;
    if (evt.type === 'checkout.session.completed' && obj.mode === 'payment' && md.kind === 'shards') {
      if (obj.payment_status !== 'paid') return json({ received: true, pending: true });
      const items = await stripe<{ data: { price?: { id: string }; quantity?: number }[] }>(env, 'GET', `/checkout/sessions/${obj.id as string}/line_items`);
      const packs = shardPacks(env);
      let total = 0;
      for (const li of items.data) { const pk = packs.find((p) => p.price === li.price?.id); if (pk) total += pk.shards * (li.quantity ?? 1); }
      const pid = (obj.client_reference_id as string | null) ?? md.pid ?? '';
      if (total > 0 && pid) await grantShards(env, obj.id as string, pid, total);
      else console.warn('shard checkout with no known pack', obj.id);
    } else if (evt.type === 'checkout.session.completed' && obj.mode === 'subscription' && typeof obj.subscription === 'string' && md.kind === 'hosting') {
      const sub = await stripe<Sub>(env, 'GET', `/subscriptions/${obj.subscription}`);
      await hostEvent(rooms, md.room ?? sub.metadata?.room ?? '', { event: evt.id, sub: sub.id, status: sub.status, until: periodEnd(sub), customer: typeof obj.customer === 'string' ? obj.customer : null });
    } else if (evt.type.startsWith('customer.subscription.') && md.kind === 'hosting') {
      const sub = obj as unknown as Sub;
      await hostEvent(rooms, md.room ?? '', { event: evt.id, sub: sub.id, status: evt.type.endsWith('deleted') ? 'canceled' : sub.status, until: periodEnd(sub), customer: sub.customer });
    } else if (!env.ACCOUNTS) {
      return json({ received: true, ignored: 'accounts off' });
    } else if (evt.type === 'checkout.session.completed' && obj.mode === 'subscription' && typeof obj.subscription === 'string') {
      const sub = await stripe<Sub>(env, 'GET', `/subscriptions/${obj.subscription}`);
      const pid = (obj.client_reference_id as string | null) ?? sub.metadata?.pid ?? '';
      await accountsPost(env, '/sup/event', { event: evt.id, pid, customer: obj.customer, sub: sub.id, status: sub.status, until: periodEnd(sub) });
    } else if (evt.type === 'customer.subscription.created' || evt.type === 'customer.subscription.updated' || evt.type === 'customer.subscription.deleted') {
      const sub = obj as unknown as Sub;
      await accountsPost(env, '/sup/event', { event: evt.id, pid: sub.metadata?.pid ?? '', customer: sub.customer, sub: sub.id, status: evt.type.endsWith('deleted') ? 'canceled' : sub.status, until: periodEnd(sub) });
    }
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
  return json({ received: true });
}

async function hostEvent(rooms: RoomLookup | undefined, code: string, e: { event: string; sub: string; status: string; until: number; customer: string | null }): Promise<void> {
  if (!rooms || !code) throw new Error('Hosting event without a world');
  const found = await rooms(`@${code}`);
  if (!found) { console.warn('hosting event for missing world', code); return; }
  const r = await found.stub.fetch('https://room/host/event', { method: 'POST', body: JSON.stringify(e) });
  if (!r.ok && r.status !== 404) throw new Error(`World rejected hosting event (${r.status})`);
}

export function hostingEnabled(env: StripeEnv): boolean {
  return !!(env.STRIPE_SECRET_KEY && env.HOSTING_PRICE_ID);
}

export async function hostingRoute(req: Request, env: StripeEnv, path: string, rooms: RoomLookup): Promise<Response> {
  const enabled = hostingEnabled(env);
  const label = env.HOSTING_LABEL ?? '$3 USD a month';
  if (path === '/api/hosting/config') return json({ enabled, price: label });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  if (!enabled) return json({ error: 'Paid hosting is not set up on this server.' }, 503);
  const body = await readBody(req);
  const code = String(body.code ?? '').toUpperCase();
  const found = await rooms(code);
  if (!found) return json({ error: 'No world uses that code.' }, 404);
  const or = await found.stub.fetch('https://room/host/owner', { method: 'POST', body: JSON.stringify({ ownerId: body.ownerId, ownerSecret: body.ownerSecret }) });
  const owner = (await or.json()) as { ok?: boolean; error?: string; name: string; ownerId: string; customer: string | null; view: { renewing: boolean } };
  if (!owner.ok) return json({ error: owner.error ?? 'Only the world owner can manage hosting.' }, or.status);
  const origin = new URL(req.url).origin;
  try {
    if (path === '/api/hosting/checkout') {
      if (owner.view.renewing) return json({ error: 'Hosting for this world is already active. Use Manage billing to change it.' }, 409);
      const meta = { kind: 'hosting', room: found.target, code, name: owner.name.slice(0, 60) };
      const session = await stripe<{ url: string }>(env, 'POST', '/checkout/sessions', {
        mode: 'subscription',
        line_items: [{ price: env.HOSTING_PRICE_ID, quantity: 1 }],
        client_reference_id: owner.ownerId,
        customer: owner.customer ?? undefined,
        metadata: meta,
        subscription_data: { metadata: meta, description: `Realm Hosting for ${owner.name.slice(0, 60)} (${code})` },
        allow_promotion_codes: true,
        success_url: `${origin}/?hosting=thanks&world=${encodeURIComponent(code)}`,
        cancel_url: `${origin}/?hosting=cancelled&world=${encodeURIComponent(code)}`,
      });
      return json({ url: session.url });
    }
    if (path === '/api/hosting/portal') {
      if (!owner.customer) return json({ error: 'This world has no hosting subscription yet.' }, 404);
      const session = await stripe<{ url: string }>(env, 'POST', '/billing_portal/sessions', { customer: owner.customer, return_url: `${origin}/` });
      return json({ url: session.url });
    }
  } catch (e) {
    return json({ error: `Payment service error: ${(e as Error).message}` }, 502);
  }
  return json({ error: 'Not found' }, 404);
}
