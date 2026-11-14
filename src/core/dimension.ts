export const NETHER_X = 440000;
export const NETHER_EDGE = 300000;
export const OVERWORLD_LIMIT = 240000;
export const NETHER_HEIGHT = 128;
export const NETHER_LAVA = 31;

export function isNether(x: number): boolean { return x >= NETHER_EDGE; }
export function toNether(x: number, z: number): [number, number] { return [NETHER_X + Math.floor(x / 8), Math.floor(z / 8)]; }
export function toOverworld(x: number, z: number): [number, number] { return [Math.floor((x - NETHER_X) * 8), Math.floor(z * 8)]; }
export function localX(x: number): number { return isNether(x) ? x - NETHER_X : x; }
