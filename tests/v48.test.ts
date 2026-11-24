import { describe, it, expect } from 'vitest';
import { playLagged, NETS } from './lagnet';
import { wardClock, newWardState } from '../src/core/sim/anticheat';
import { B } from '../src/core/blocks';
import { toolId } from '../src/core/items';

const run = (i: { moveZ: number; sprint: boolean; jump: boolean; moveX: number }, t: number, pl: { yaw: number }) => { i.moveZ = 1; i.sprint = true; i.jump = (t % 4000) < 2500; i.moveX = Math.sin(t / 1500) * 0.6; pl.yaw += Math.sin(t / 3000) * 0.01; };

describe('v48 Warden: honest players on laggy connections are never flagged', () => {
  for (const [name, net] of Object.entries(NETS)) for (const legacy of [false, true]) {
    it(`${name}${legacy ? ' (older client)' : ''}`, () => {
      const r = playLagged({ ...net, seed: 11, legacy }, 60, run);
      expect({ flags: r.log.map((f) => `${f.check}: ${f.info}`), setbacks: r.setbacks }).toEqual({ flags: [], setbacks: 0 });
    }, 60000);
  }

  it('mining through lag spikes is not fast-breaking', () => {
    const blocks: [number, number, number][] = [];
    for (let k = 0; k < 30; k++) blocks.push([2, 10, k - 15]);
    let cur = 0, startAt = -1;
    const r = playLagged(NETS.bad, 50, (i, t) => {
      i.moveZ = 0;
      if (cur >= blocks.length) return;
      const [x, y, z] = blocks[cur];
      if (startAt < 0) { startAt = t; return [{ t, kind: 'dig', a: 'start', x, y, z }]; }
      if (t - startAt >= 1550) { cur++; startAt = -1; return [{ t, kind: 'dig', a: 'done', x, y, z }]; }
    }, { build: (s) => { for (let z = -15; z < 15; z++) s.setBlock(2, 10, z, B.STONE); }, setup: (p) => { p.x = 1.5; p.inv.slots[0] = { id: toolId(0, 0), count: 1 }; p.inv.selected = 0; } });
    expect(r.log.filter((f) => f.check === 'fastbreak')).toEqual([]);
    expect(r.w.store.getBlock(2, 10, 0)).toBe(0);
  }, 60000);
});

describe('v48 Warden: lag cannot be faked to cheat', () => {
  it('a sped-up game clock is caught', () => {
    const r = playLagged({ ...NETS.wifi, seed: 4, speedup: 1.6, skew: 1.6 }, 30, run);
    expect(r.log.some((f) => /game clock ran/.test(f.info))).toBe(true);
  }, 60000);

  it('moving faster while reporting honest time is caught as speed', () => {
    const r = playLagged({ ...NETS.wifi, seed: 4, speedup: 1.6 }, 30, run);
    expect(r.byCheck.speed ?? 0).toBeGreaterThan(0);
  }, 60000);

  it('backdated timestamps cannot run ahead of the server', () => {
    const s = newWardState(0);
    wardClock(s, 1000, 5000);
    const a = wardClock(s, 1100, 5100).mt;
    const b = wardClock(s, 1150, 4000).mt;
    const c = wardClock(s, 1200, 99999).mt;
    expect(a).toBe(1100);
    expect(b).toBeGreaterThanOrEqual(a);
    expect(c).toBeLessThanOrEqual(1200);
  });
});
