import { describe, it, expect } from 'vitest';
import { freshHost, hostView, applySubEvent, hostLine, DAY, HOST_GRACE, HOST_PURGE_DAYS } from '../src/core/hosting';
import { verifyStripeSignature } from '../workers/stripe';

describe('v50 realm hosting state', () => {
  const t0 = Date.UTC(2026, 11, 1);
  it('grandfathered worlds run free for 30 days, then freeze, then purge after 60 more', () => {
    const h = freshHost(t0, 30);
    expect(hostView(h, t0 + 29 * DAY).phase).toBe('active');
    expect(hostView(h, t0 + 30 * DAY + HOST_GRACE - 1).phase).toBe('active');
    expect(hostView(h, t0 + 30 * DAY + HOST_GRACE + 1).phase).toBe('locked');
    expect(hostView(h, t0 + 30 * DAY + HOST_GRACE + (HOST_PURGE_DAYS - 1) * DAY).phase).toBe('locked');
    expect(hostView(h, t0 + 30 * DAY + HOST_GRACE + HOST_PURGE_DAYS * DAY + 1).phase).toBe('purge');
  });
  it('a payment unfreezes and extends, renewals keep extending, cancellation stops extending', () => {
    const h = freshHost(t0, 3);
    const late = t0 + 20 * DAY;
    expect(hostView(h, late).phase).toBe('locked');
    expect(applySubEvent(h, { event: 'evt_1', sub: 'sub_1', status: 'active', until: late + 30 * DAY, customer: 'cus_1' })).toBe(true);
    const v = hostView(h, late);
    expect(v.phase).toBe('active');
    expect(v.renewing).toBe(true);
    expect(h.customer).toBe('cus_1');
    expect(applySubEvent(h, { event: 'evt_1', sub: 'sub_1', status: 'active', until: late + 90 * DAY })).toBe(false);
    applySubEvent(h, { event: 'evt_2', sub: 'sub_1', status: 'active', until: late + 60 * DAY });
    expect(hostView(h, late + 50 * DAY).phase).toBe('active');
    applySubEvent(h, { event: 'evt_3', sub: 'sub_1', status: 'canceled', until: late + 90 * DAY });
    const after = hostView(h, late + 50 * DAY);
    expect(after.renewing).toBe(false);
    expect(after.until).toBe(late + 60 * DAY);
    expect(hostView(h, late + 61 * DAY).phase).toBe('locked');
  });
  it('an old subscription ending does not override a newer live one', () => {
    const h = freshHost(t0, 0);
    applySubEvent(h, { event: 'a', sub: 'sub_new', status: 'active', until: t0 + 30 * DAY });
    expect(applySubEvent(h, { event: 'b', sub: 'sub_old', status: 'canceled', until: t0 })).toBe(false);
    expect(hostView(h, t0 + DAY).renewing).toBe(true);
  });
  it('comped worlds never lock and lines read well', () => {
    const h = freshHost(t0, 0);
    h.comp = true;
    expect(hostView(h, t0 + 400 * DAY).phase).toBe('comp');
    expect(hostView(null, t0).phase).toBe('off');
    expect(hostLine(hostView(freshHost(t0, 30), t0), t0)).toMatch(/Free hosting ends in 30 days/);
    expect(hostLine(hostView(freshHost(t0, 1), t0 + 5 * DAY), t0 + 5 * DAY)).toMatch(/frozen/);
  });
  it('webhook signatures are checked', async () => {
    const secret = 'whsec_test', payload = '{"id":"evt"}', t = Math.floor(Date.now() / 1000);
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = [...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`)))].map((b) => b.toString(16).padStart(2, '0')).join('');
    expect(await verifyStripeSignature(payload, `t=${t},v1=${sig}`, secret)).toBe(true);
    expect(await verifyStripeSignature(payload + ' ', `t=${t},v1=${sig}`, secret)).toBe(false);
  });
});
