import { it, expect } from 'vitest';
import { importWaypoints, exportJson, exportXaero, exportText, findCoords } from '../src/ui/waypointData';

it('round-trips Strata JSON, Xaero and text exports', () => {
  const src = importWaypoints('Home: 10 64 -20 #ff0000\nMines/Iron cave: -300 12 450');
  expect(src.waypoints).toHaveLength(2);
  expect(src.waypoints[1].group).toBe('Mines');
  const j = importWaypoints(exportJson('w', src.waypoints));
  expect(j.format).toBe('Strata');
  expect(j.waypoints.map((w) => [w.name, w.x, w.y, w.z, w.color])).toEqual(src.waypoints.map((w) => [w.name, w.x, w.y, w.z, w.color]));
  const x = importWaypoints(exportXaero(src.waypoints));
  expect(x.format).toBe('Xaero');
  expect(x.waypoints.map((w) => [w.name, w.x, w.y, w.z, w.group])).toEqual([['Home', 10, 64, -20, undefined], ['Iron cave', -300, 12, 450, 'Mines']]);
  expect(importWaypoints(exportText(src.waypoints)).waypoints).toHaveLength(2);
});

it('reads wWaypoints-style clipboard JSON, JourneyMap and VoxelMap', () => {
  const ww = JSON.stringify({ format: 'wwaypoints-waypoint-clipboard', formatVersion: 3, root: { members: [{ type: 'NORMAL', name: 'Base', pos: { x: 1, y: 70, z: 2 }, color: { hue: 0.33, sat: 1, val: 1 } }, { type: 'FOLDER', name: 'Farms', members: [{ name: 'Sugar', pos: [5, 64, 9], hidden: true }] }] } });
  const r = importWaypoints(ww);
  expect(r.format).toBe('wWaypoints');
  expect(r.waypoints.map((w) => [w.name, w.x, w.y, w.z, w.group, w.shown])).toEqual([['Base', 1, 70, 2, undefined, true], ['Sugar', 5, 64, 9, 'Farms', false]]);
  expect(importWaypoints('{"name":"JM","x":3,"y":4,"z":5,"r":255,"g":0,"b":0}').waypoints[0].color).toBe('#ff0000');
  expect(importWaypoints('name:Village,x:100,z:200,y:70,enabled:true,red:0.0,green:1.0,blue:0.0').waypoints[0]).toMatchObject({ name: 'Village', x: 100, y: 70, z: 200, color: '#00ff00' });
});

it('finds coordinates in chat', () => {
  expect(findCoords('meet me at 120 64 -300 ok')).toEqual({ x: 120, y: 64, z: -300 });
  expect(findCoords('x: 5, y: 70, z: -9')).toEqual({ x: 5, y: 70, z: -9 });
  expect(findCoords('I have 3 apples')).toBeNull();
});
