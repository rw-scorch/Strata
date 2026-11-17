import { h, clear, modal, toast } from './dom';
import { itemName } from '../core/items';
import { countItem, type PlayerInv } from '../core/inventory';
import { BP_SLOTS, BP_MAX, captureBlueprint, bpCosts, type Blueprint } from '../core/blueprint';
import { loadBlueprints, saveBlueprint, deleteBlueprint } from '../storage/blueprints';

export interface BlueprintPanelOpts {
  studio: boolean;
  placeBlocked: string | null;
  creative: boolean;
  inv: PlayerInv;
  sel: () => [number[] | null, number[] | null];
  get: (x: number, y: number, z: number) => number;
  onPlace: (bp: Blueprint) => void;
  onShaper?: () => void;
}

export function showBlueprints(o: BlueprintPanelOpts): void {
  const body = h('div', { class: 'stack bp-panel' });
  let close: () => void = () => {};
  const render = async () => {
    const slots = await loadBlueprints();
    clear(body);
    body.append(h('div', { class: 'small muted' }, o.studio
      ? `You are in a Drafting Studio. Mark two corners with the World Shaper (or /pos1 and /pos2), then save the build into one of your ${BP_SLOTS} slots. Up to ${BP_MAX} blocks on each side.`
      : 'Build a saved blueprint here if you carry every block it needs and the spot is clear. Make blueprints in a Drafting Studio world.'));
    if (o.studio && o.onShaper) body.append(h('button', { class: 'btn small', onclick: () => { close(); o.onShaper!(); } }, 'Open World Shaper'));
    slots.forEach((bp, i) => body.append(card(i, bp)));
  };
  const card = (slot: number, bp: Blueprint | null): HTMLElement => {
    const el = h('div', { class: 'card bp-card' }, h('div', { class: 'section-title' }, `Slot ${slot + 1}`));
    if (bp) {
      const c = bpCosts(bp);
      el.append(h('div', { class: 'bp-name' }, bp.name), h('div', { class: 'small muted' }, `${bp.w} x ${bp.h} x ${bp.d}, ${c.blocks} blocks, saved ${new Date(bp.at).toLocaleDateString()}`));
      const rows = [...c.items.entries()].sort((a, b) => b[1] - a[1]);
      let short = 0;
      const list = h('div', { class: 'bp-mats' }, ...rows.slice(0, 12).map(([id, n]) => {
        const have = o.creative ? n : countItem(o.inv, id);
        if (have < n) short++;
        return h('div', { class: `bp-mat${have < n ? ' short' : ''}` }, h('span', {}, itemName(id)), h('span', {}, o.creative ? `${n}` : `${Math.min(have, n)} / ${n}`));
      }));
      if (!o.creative) for (const [id, n] of rows.slice(12)) if (countItem(o.inv, id) < n) short++;
      el.append(list);
      if (rows.length > 12) el.append(h('div', { class: 'small muted' }, `and ${rows.length - 12} more kinds of block`));
      const acts = h('div', { class: 'row' });
      if (!o.studio) {
        const why = o.placeBlocked ?? (short ? `Missing ${short} kind${short === 1 ? '' : 's'} of block` : null);
        acts.append(h('button', { class: 'btn primary', disabled: !!why, onclick: () => { close(); o.onPlace(bp); } }, 'Place'));
        if (why) acts.append(h('span', { class: 'small muted' }, why));
      }
      if (o.studio) acts.append(h('button', { class: 'btn', onclick: () => save(slot, bp.name) }, 'Overwrite with selection'));
      acts.append(h('button', { class: 'btn danger', onclick: async () => { await deleteBlueprint(slot); toast(`Slot ${slot + 1} cleared`); void render(); } }, 'Delete'));
      el.append(acts);
    } else {
      el.append(h('div', { class: 'small muted' }, 'Empty'));
      if (o.studio) el.append(h('button', { class: 'btn primary', onclick: () => save(slot, '') }, 'Save selection here'));
    }
    return el;
  };
  const save = (slot: number, prev: string) => {
    const [a, b] = o.sel();
    if (!a || !b) { toast('Mark both corners first (World Shaper, or /pos1 and /pos2)', 'error'); return; }
    const input = h('input', { type: 'text', maxlength: 32, value: prev || `Build ${slot + 1}`, placeholder: 'Blueprint name' }) as HTMLInputElement;
    modal('Save blueprint', h('div', { class: 'stack' }, h('label', {}, 'Name'), input), [
      { label: 'Cancel', kind: 'ghost' },
      { label: 'Save', kind: 'primary', onClick: async () => {
        const r = captureBlueprint(o.get, a, b, input.value.trim());
        if (typeof r === 'string') { toast(r, 'error', 5000); return false; }
        await saveBlueprint(slot, r.bp);
        toast(`Saved ${r.bp.name} (${r.bp.w} x ${r.bp.h} x ${r.bp.d})${r.stripped ? `. Left out ${r.stripped} block${r.stripped === 1 ? '' : 's'} that cannot be placed (fluids, fire, portals, bedrock)` : ''}`, 'success', 5000);
        void render();
      } },
    ]);
    setTimeout(() => input.select(), 50);
  };
  close = modal('Blueprints', body, [{ label: 'Close', kind: 'primary' }], { wide: true }).close;
  void render();
}
