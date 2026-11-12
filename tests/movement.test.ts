import { it, expect } from 'vitest';
import { LocalPlayer as Player } from '../src/game/Player';
import { InputState } from '../src/controls/InputState';
import { B } from '../src/core/blocks';

const floor = { getBlock: (_x: number, y: number, _z: number) => (y < 10 ? B.STONE : 0), isLoaded: () => true };

function run(set: (i: InputState) => void, ticks: number) {
  const p = new Player();
  p.setPos(0.5, 10, 0.5);
  const i = new InputState();
  for (let t = 0; t < 5; t++) p.update(0.05, i, floor, 'survival', false);
  set(i);
  const xs: number[] = [];
  let maxY = 10;
  for (let t = 0; t < ticks; t++) { p.update(0.05, i, floor, 'survival', false); xs.push(p.body.z); maxY = Math.max(maxY, p.body.y); }
  const per = Math.abs(xs[xs.length - 1] - xs[xs.length - 21]);
  return { bps: per, jump: maxY - 10 };
}

it('matches Java walking, sprinting and sneaking speeds', () => {
  expect(run((i) => { i.moveZ = 1; }, 60).bps).toBeCloseTo(4.317, 1);
  expect(run((i) => { i.moveZ = 1; i.sprint = true; }, 60).bps).toBeCloseTo(5.612, 1);
  expect(run((i) => { i.moveZ = 1; i.crouch = true; }, 60).bps).toBeCloseTo(1.295, 1);
});

it('matches Java jump height and sprint-jump speed', () => {
  expect(run((i) => { i.jump = true; }, 14).jump).toBeCloseTo(1.2522, 2);
  expect(run((i) => { i.moveZ = 1; i.sprint = true; i.jump = true; }, 240).bps).toBeGreaterThan(6.8);
});
