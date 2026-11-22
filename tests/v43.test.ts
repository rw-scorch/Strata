import { describe, it, expect } from 'vitest';
import { LocalPlayer as Player } from '../src/game/Player';
import { InputState } from '../src/controls/InputState';
import { I, toolId, armorId } from '../src/core/items';
import { B } from '../src/core/blocks';
import { ENCH } from '../src/core/enchants';
import { DRAGON_HEAD_PARTS, headBox, headLocalFace } from '../src/core/dragonHead';
import { world } from './v40.test';

const sky = { getBlock: () => 0, isLoaded: () => true };

function javaGlide(v: { x: number; y: number; z: number }, yaw: number, pitch: number, rocket: boolean) {
  const xr = -pitch, lx = -Math.sin(yaw) * Math.cos(xr), ly = -Math.sin(xr), lz = -Math.cos(yaw) * Math.cos(xr);
  if (rocket) { v.x += lx * 0.1 + (lx * 1.5 - v.x) * 0.5; v.y += ly * 0.1 + (ly * 1.5 - v.y) * 0.5; v.z += lz * 0.1 + (lz * 1.5 - v.z) * 0.5; }
  const d = Math.hypot(lx, lz), e = Math.hypot(v.x, v.z), hh = Math.cos(xr) ** 2;
  v.y += 0.08 * (-1 + hh * 0.75);
  if (v.y < 0 && d > 0) { const i = v.y * -0.1 * hh; v.x += (lx * i) / d; v.y += i; v.z += (lz * i) / d; }
  if (xr < 0 && d > 0) { const j = e * -Math.sin(xr) * 0.04; v.x += (-lx * j) / d; v.y += j * 3.2; v.z += (-lz * j) / d; }
  if (d > 0) { v.x += ((lx / d) * e - v.x) * 0.1; v.z += ((lz / d) * e - v.z) * 0.1; }
  v.x *= 0.99; v.y *= 0.98; v.z *= 0.99;
}

const glider = () => {
  const p = new Player();
  p.setPos(0.5, 200, 0.5);
  p.elytra = true;
  const i = new InputState();
  p.update(0.05, i, sky, 'survival', false);
  i.jump = true; p.update(0.05, i, sky, 'survival', false); i.jump = false;
  return { p, i };
};

describe('v43 elytra flight follows the Java equations', () => {
  it('matches a reference glide tick for tick at several pitches', () => {
    for (const pitch of [0.6, 0, -0.35, -0.9]) {
      const { p, i } = glider();
      expect(p.gliding).toBe(true);
      p.yaw = 0.7; p.pitch = pitch;
      const v = { x: p.body.vx, y: p.body.vy, z: p.body.vz };
      for (let t = 0; t < 120; t++) {
        javaGlide(v, p.yaw, p.pitch, false);
        p.update(0.05, i, sky, 'survival', false);
        expect(p.body.vx).toBeCloseTo(v.x, 9);
        expect(p.body.vy).toBeCloseTo(v.y, 9);
        expect(p.body.vz).toBeCloseTo(v.z, 9);
      }
    }
  });

  it('applies firework boosts before the glide step, as the rocket entity does in Java', () => {
    const { p, i } = glider();
    p.yaw = -1.1; p.pitch = 0.2;
    p.rocketT = 25;
    const v = { x: p.body.vx, y: p.body.vy, z: p.body.vz };
    let top = 0;
    for (let t = 0; t < 40; t++) {
      javaGlide(v, p.yaw, p.pitch, t < 25);
      p.update(0.05, i, sky, 'survival', false);
      expect(p.body.vx).toBeCloseTo(v.x, 9);
      expect(p.body.vy).toBeCloseTo(v.y, 9);
      top = Math.max(top, Math.hypot(v.x, v.y, v.z));
    }
    expect(top).toBeGreaterThan(1.5);
  });
});

describe('v43 barrel roll controls', () => {
  it('strafing rolls and banks into a turn, then the wings level out', () => {
    const { p, i } = glider();
    p.yaw = 0; p.pitch = 0.1;
    for (let t = 0; t < 30; t++) p.update(0.05, i, sky, 'survival', false);
    const yaw0 = p.yaw;
    i.moveX = 1;
    for (let t = 0; t < 12; t++) p.update(0.05, i, sky, 'survival', false);
    expect(p.roll).toBeGreaterThan(0.4);
    expect(p.yaw).toBeLessThan(yaw0 - 0.05);
    i.moveX = 0;
    for (let t = 0; t < 60; t++) p.update(0.05, i, sky, 'survival', false);
    expect(Math.abs(p.roll)).toBeLessThan(0.05);
  });

  it('a double tap does a full barrel roll', () => {
    const { p, i } = glider();
    const tap = () => { i.moveX = -1; p.update(0.05, i, sky, 'survival', false); i.moveX = 0; p.update(0.05, i, sky, 'survival', false); };
    tap(); tap();
    const seen: number[] = [];
    for (let t = 0; t < 14; t++) { p.update(0.05, i, sky, 'survival', false); seen.push(p.roll); }
    expect(Math.min(...seen)).toBeLessThan(-5.5);
    for (let k = 1; k < seen.length; k++) { const d = seen[k] - seen[k - 1]; expect(Math.abs(Math.atan2(Math.sin(d), Math.cos(d)))).toBeLessThan(1.2); }
    expect(Math.abs(Math.sin(seen[seen.length - 1]))).toBeLessThan(0.3);
  });

  it('classic style leaves the roll at zero', () => {
    const { p, i } = glider();
    p.rollStyle = false;
    i.moveX = 1;
    for (let t = 0; t < 20; t++) p.update(0.05, i, sky, 'survival', false);
    expect(Math.abs(p.roll)).toBeLessThan(1e-6);
  });
});

describe('v43 Sovereign tools', () => {
  it('maxed kits arm the player fully', () => {
    const w = world();
    w.p.op = true;
    expect(w.sim.command(w.p, '/kit maxnetherite')).toMatch(/Netherite kit/);
    expect(w.p.inv.armor.map((a) => a?.id)).toEqual([0, 1, 2, 3].map((s) => armorId(4, s)));
    expect(w.p.inv.armor[1]!.en!.protection).toBe(4);
    const sword = w.p.inv.slots.find((s) => s?.id === toolId(5, 3))!;
    expect(sword.en!.sharpness).toBe(ENCH.get('sharpness')!.max);
    expect(w.p.inv.slots.some((s) => s?.id === I.MACE && s.en?.density)).toBe(true);
    w.sim.command(w.p, '/kit maxdiamond');
    expect(w.p.inv.slots.some((s) => s?.id === armorId(3, 0) && s.en?.protection === 4)).toBe(true);
  });

  it('removes one enchantment or all of them', () => {
    const w = world();
    w.p.op = true;
    w.p.inv.slots[w.p.inv.selected] = { id: toolId(4, 3), count: 1, en: { sharpness: 5, looting: 3 } };
    w.sim.command(w.p, '/unenchant looting');
    expect(w.p.inv.slots[w.p.inv.selected]!.en).toEqual({ sharpness: 5 });
    w.sim.command(w.p, '/unenchant all');
    expect(w.p.inv.slots[w.p.inv.selected]!.en).toBeUndefined();
  });

  it('a lootdrop builds chests, tells everyone and offers a teleport', () => {
    const w = world();
    w.p.op = true;
    w.sim.settings.tpDelay = 0;
    for (let x = -6; x <= 6; x++) for (let z = -18; z <= -6; z++) w.store.setBlock(x, 9, z, B.STONE);
    const msgs: string[] = [];
    w.sim.on?.((e: { e: string; text?: string; to?: string }) => { if (e.e === 'msg' && !e.to) msgs.push(e.text!); });
    w.p.x = 0.5; w.p.y = 10; w.p.z = -11.5;
    expect(w.sim.command(w.p, '/lootdrop c=8')).toMatch(/Lootdrop placed.*8 chests/);
    let chests = 0;
    for (let x = -8; x <= 8; x++) for (let z = -20; z <= -3; z++) for (let y = 8; y < 20; y++) if ((w.store.getBlock(x, y, z) & 0xff) === B.CHEST) chests++;
    expect(chests).toBe(8);
    expect(w.sim.lootdrop).toBeTruthy();
    w.p.op = false; w.p.x = 40; w.p.z = 40;
    expect(w.sim.command(w.p, '/lootdrop tp')).toMatch(/lootdrop/);
    expect(Math.hypot(w.p.x - 0.5, w.p.z + 11.5)).toBeLessThan(1.5);
    expect(w.sim.command(w.p, '/lootdrop')).toMatch(/permission/);
  });
});

describe('v43 dragon head model', () => {
  it('points its snout the way it faces and keeps the Java proportions', () => {
    expect(headLocalFace(0, 0)).toBe('f');
    expect(headLocalFace(4, 1)).toBe('f');
    expect(headLocalFace(1, 2)).toBe('f');
    expect(headLocalFace(5, 3)).toBe('f');
    expect(headLocalFace(1, 0)).toBe('k');
    const head = headBox(DRAGON_HEAD_PARTS[0].b, 0), lip = headBox(DRAGON_HEAD_PARTS[1].b, 0);
    expect(head[3] - head[0]).toBeCloseTo(12);
    expect(lip[3]).toBeGreaterThan(head[3]);
    expect(Math.min(...DRAGON_HEAD_PARTS.map((p) => p.b[1]))).toBe(0);
  });
});
