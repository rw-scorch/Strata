import { dbGet, dbPut, dbDelete } from './db';
import { Blueprint, encodeBlueprint, decodeBlueprint, BP_SLOTS } from '../core/blueprint';

interface Stored { name: string; enc: string; at: number }

export async function loadBlueprints(): Promise<(Blueprint | null)[]> {
  const out: (Blueprint | null)[] = [];
  for (let i = 0; i < BP_SLOTS; i++) {
    const r = await dbGet<Stored>('kv', `bp:${i}`).catch(() => undefined);
    const bp = r ? decodeBlueprint(r.enc, r.name) : null;
    if (bp) bp.at = r!.at;
    out.push(bp);
  }
  return out;
}

export async function saveBlueprint(slot: number, bp: Blueprint): Promise<void> {
  await dbPut('kv', `bp:${slot}`, { name: bp.name, enc: encodeBlueprint(bp), at: bp.at } satisfies Stored);
}

export async function deleteBlueprint(slot: number): Promise<void> {
  await dbDelete('kv', `bp:${slot}`);
}
