import { describe, it, expect } from 'vitest';
import { defaultSellPrices, money, parseMoney, fee, SHOP, sellValue } from '../src/core/economy';
import { I, toolId } from '../src/core/items';
import { B } from '../src/core/blocks';

describe('economy data', () => {
  it('derives sell prices from recipes without loops', () => {
    const p = defaultSellPrices();
    expect(p.get(I.IRON_INGOT)).toBe(25);
    expect(p.get(B.IRON_BLOCK)).toBe(Math.floor(25 * 9 * 0.9));
    expect(p.get(B.OAK_PLANKS)).toBe(1);
    expect(p.get(toolId(2, 0))! > 0).toBe(true);
    expect(p.get(I.WATER_BUCKET)).toBe(0);
  });
  it('never lets you buy from the shop and sell back for profit', () => {
    const p = defaultSellPrices();
    for (const c of SHOP) for (const e of c.items) expect(sellValue({ id: e.id, count: e.count }, p)).toBeLessThan(e.price);
  });
  it('formats and parses money like DonutSMP', () => {
    expect(money(950)).toBe('$950');
    expect(money(1500)).toBe('$1.5K');
    expect(money(2_340_000)).toBe('$2.3M');
    expect(parseMoney('2.5k')).toBe(2500);
    expect(parseMoney('$10M')).toBe(10_000_000);
    expect(parseMoney('-5')).toBeNull();
    expect(fee(10)).toBe(1);
    expect(fee(10_000)).toBe(200);
  });
});
