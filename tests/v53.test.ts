import { describe, it, expect, vi, afterEach } from 'vitest';
import { COSMETICS, COS_BY_ID, CRATES, crateOffer, cleanEquipped, parsePacks, priceOf, RARITY_PRICE } from '../src/core/shop';
import { supporterRoute } from '../workers/stripe';
import { shopRoute } from '../workers/shop';

describe('v53 cosmetics catalogue', () => {
  it('has unique ids, every kind, and only cosmetic items', () => {
    expect(new Set(COSMETICS.map((c) => c.id)).size).toBe(COSMETICS.length);
    for (const k of ['title', 'trail', 'cape']) expect(COSMETICS.filter((c) => c.kind === k).length).toBeGreaterThanOrEqual(8);
    for (const c of COSMETICS) expect(priceOf(c)).toBe(RARITY_PRICE[c.rarity]);
  });

  it('cache offers are fixed, visible before paying, and skip owned items', () => {
    const w = CRATES.find((c) => c.id === 'wanderer')!;
    const a = crateOffer(w, 'p1', 0, 100, new Set());
    expect(a).toHaveLength(3);
    expect(new Set(a).size).toBe(3);
    expect(crateOffer(w, 'p1', 0, 100, new Set())).toEqual(a);
    expect(a.every((id) => ['common', 'rare'].includes(COS_BY_ID.get(id)!.rarity))).toBe(true);
    const owned = new Set(a);
    expect(crateOffer(w, 'p1', 0, 100, owned).some((id) => owned.has(id))).toBe(false);
    const all = new Set(COSMETICS.filter((c) => w.pool.includes(c.rarity)).map((c) => c.id));
    expect(crateOffer(w, 'p1', 0, 100, all)).toEqual([]);
  });

  it('cleans equipped slots and shard pack config', () => {
    expect(cleanEquipped({ title: 'c_ember', cape: 'c_ember', trail: 'nope', x: 1 })).toEqual({ cape: 'c_ember' });
    expect(parsePacks('')).toEqual([]);
    expect(parsePacks('not json')).toEqual([]);
    expect(parsePacks('[{"price":"price_a1","shards":500,"label":"$1.99"},{"price":"bad","shards":5,"label":"x"},{"price":"price_b","shards":-3,"label":"x"}]')).toEqual([{ price: 'price_a1', shards: 500, label: '$1.99' }]);
  });
});

describe('v53 shard payments', () => {
  afterEach(() => vi.unstubAllGlobals());
  const SECRET = 'whsec_unit';
  const sign = async (payload: string) => {
    const t = Math.floor(Date.now() / 1000);
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const hex = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`)))].map((b) => b.toString(16).padStart(2, '0')).join('');
    return `t=${t},v1=${hex}`;
  };
  const env = (grants: unknown[]) => ({
    STRIPE_SECRET_KEY: 'sk_test_x', STRIPE_WEBHOOK_SECRET: SECRET,
    SHARD_PACKS: '[{"price":"price_small","shards":500,"label":"$1.99"},{"price":"price_big","shards":1300,"label":"$4.99"}]',
    ACCOUNTS: { idFromName: () => 'id', get: () => ({ fetch: async (url: string, init?: RequestInit) => { grants.push({ url, body: JSON.parse(String(init?.body ?? '{}')) }); return new Response('{"ok":true}'); } }) },
  });

  it('grants shards from the price paid, never from metadata', async () => {
    const grants: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      expect(url).toContain('/checkout/sessions/cs_1/line_items');
      return new Response(JSON.stringify({ data: [{ price: { id: 'price_big' }, quantity: 1 }] }));
    }));
    const payload = JSON.stringify({ id: 'evt_1', type: 'checkout.session.completed', data: { object: { id: 'cs_1', mode: 'payment', payment_status: 'paid', client_reference_id: 'a-player', metadata: { kind: 'shards', pid: 'a-player', shards: '99999' } } } });
    const r = await supporterRoute(new Request('https://x/api/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': await sign(payload) }, body: payload }), env(grants) as never, '/api/stripe/webhook');
    expect(r.status).toBe(200);
    expect(grants).toHaveLength(1);
    expect(grants[0].url).toContain('/shop/grant');
    expect(grants[0].body).toEqual({ session: 'cs_1', pid: 'a-player', shards: 1300 });
  });

  it('ignores a paid session for a price that is not a shard pack', async () => {
    const grants: unknown[] = [];
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [{ price: { id: 'price_other' }, quantity: 1 }] }))));
    const payload = JSON.stringify({ id: 'evt_2', type: 'checkout.session.completed', data: { object: { id: 'cs_2', mode: 'payment', payment_status: 'paid', client_reference_id: 'a-player', metadata: { kind: 'shards' } } } });
    const r = await supporterRoute(new Request('https://x/api/stripe/webhook', { method: 'POST', headers: { 'stripe-signature': await sign(payload) }, body: payload }), env(grants) as never, '/api/stripe/webhook');
    expect(r.status).toBe(200);
    expect(grants).toHaveLength(0);
  });

  it('keeps the shop closed until Stripe and the shard packs are configured', async () => {
    const cfg = async (e: object) => (await (await shopRoute(new Request('https://x/api/shop/config'), e as never, '/api/shop/config')).json()) as { enabled: boolean };
    expect((await cfg({ ACCOUNTS: {} })).enabled).toBe(false);
    expect((await cfg({ ACCOUNTS: {}, STRIPE_SECRET_KEY: 'sk' })).enabled).toBe(false);
    expect((await cfg({ ACCOUNTS: {}, STRIPE_SECRET_KEY: 'sk', SHARD_PACKS: '[{"price":"price_a","shards":5,"label":"x"}]' })).enabled).toBe(true);
  });
});
