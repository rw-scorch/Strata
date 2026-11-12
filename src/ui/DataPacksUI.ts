import { h, clear, toast, modal, confirmDialog } from './dom';
import type { DataRecipes } from '../core/crafting';
import { MAX_DATA_PACKS } from '../core/datapack';
import { getItem } from '../core/items';

export function showDataPacks(current: DataRecipes[], canEdit: boolean, multiplayer: boolean, apply: (list: DataRecipes[]) => void): void {
  let list = [...current];
  const box = h('div', { class: 'stack dp-list' });
  const input = h('input', { type: 'file', accept: '.zip,.jar,application/zip,application/java-archive', style: 'display:none' }) as HTMLInputElement;
  const render = () => {
    clear(box);
    box.appendChild(h('p', { class: 'small muted' },
      multiplayer
        ? 'Data packs add crafting and smelting recipes to this world for everyone. Only recipes are read; functions, loot tables and structures are ignored.'
        : 'Data packs add crafting and smelting recipes to this world. Only recipes are read; functions, loot tables and structures are ignored.'));
    if (!list.length) box.appendChild(h('div', { class: 'info-box small' }, 'No data packs in this world.'));
    list.forEach((p, i) => {
      const sample = p.crafting.slice(0, 4).map((r) => getItem(r.result)?.name).filter(Boolean).join(', ');
      box.appendChild(h('div', { class: 'dp-row' },
        h('div', { class: 'dp-info' },
          h('div', { class: 'dp-name' }, p.name),
          h('div', { class: 'small muted' }, `${p.crafting.length} crafting, ${p.smelting.length} smelting${p.remove.length ? `, ${p.remove.length} removed` : ''}${sample ? ` · ${sample}` : ''}`),
        ),
        canEdit ? h('div', { class: 'row' },
          i > 0 ? h('button', { class: 'btn small ghost', title: 'Higher priority', onclick: () => { [list[i - 1], list[i]] = [list[i], list[i - 1]]; render(); } }, 'Up') : null,
          h('button', { class: 'btn small danger', onclick: async () => { if (await confirmDialog('Remove data pack', `Remove "${p.name}" from this world?`, 'Remove', true)) { list.splice(i, 1); render(); } } }, 'Remove'),
        ) : null,
      ));
    });
    if (canEdit && list.length < MAX_DATA_PACKS) box.appendChild(h('button', { class: 'btn block', onclick: () => input.click() }, 'Add data pack (.zip or .jar)'));
    if (!canEdit) box.appendChild(h('div', { class: 'small muted' }, 'Only the world owner and operators can change data packs.'));
  };
  input.addEventListener('change', async () => {
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    if (f.size > 64 * 1024 * 1024) { toast('That file is too large', 'error'); return; }
    try {
      const { importDataPack } = await import('../resources/DataPackImporter');
      const { pack, report } = await importDataPack(f.name, new Uint8Array(await f.arrayBuffer()));
      if (list.some((p) => p.hash === pack.hash)) { toast('That pack is already added', 'info'); return; }
      list.push(pack);
      render();
      const skipped = report.skippedItems + report.unsupported;
      toast(`Read ${report.crafting + report.smelting} recipes${skipped ? `, skipped ${skipped} (unknown items or unsupported types)` : ''}`, skipped ? 'info' : 'success');
    } catch (e) {
      toast((e as Error).message || 'Could not read that pack', 'error');
    }
  });
  render();
  box.appendChild(input);
  modal('Data Packs', box, canEdit ? [
    { label: 'Cancel', kind: 'ghost' },
    { label: 'Apply', kind: 'primary', onClick: () => { apply(list); } },
  ] : [{ label: 'Close', kind: 'primary' }], { wide: true });
}
