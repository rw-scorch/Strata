import { h, clear, toast, modal, confirmDialog } from './dom';
import { ResourcePackManager, InstalledPack } from '../resources/ResourcePackManager';
import { getSettings } from '../storage/Settings';
import { TextureAtlas } from '../resources/TextureAtlas';
import { packStale, type PackManifest } from '../resources/ResourcePackImporter';

export function showResourcePacks(parent: HTMLElement, apply: (ids: string[]) => Promise<void>, onClose: () => void, lockedNote?: string, autoImport = false): void {
  const list = h('div', { class: 'list' });
  const fileInput = h('input', { type: 'file', accept: '.zip,.mcpack,application/zip', style: 'display:none' }) as HTMLInputElement;
  let busy = false;
  const status = h('div', { class: 'small muted' });
  let order = [...getSettings().activePacks];
  let packs: InstalledPack[] = [];
  let replaceId: string | null = null;

  const commit = async () => {
    busy = true;
    status.textContent = 'Rebuilding textures...';
    try { ResourcePackManager.setActive(order); await apply(order); status.textContent = ''; }
    catch (e) { status.textContent = `Could not apply packs: ${(e as Error).message}`; }
    busy = false;
    render();
  };

  const render = () => {
    clear(list);
    const active = order.map((id) => packs.find((p) => p.manifest.id === id)).filter(Boolean) as InstalledPack[];
    const inactive = packs.filter((p) => !order.includes(p.manifest.id));
    const row = (p: InstalledPack, isActive: boolean, idx: number) => {
      const m = p.manifest;
      const r = m.report;
      return h('div', { class: 'list-item' },
        p.iconURL ? h('img', { class: 'pack-icon', src: p.iconURL, alt: '' }) : h('div', { class: 'pack-icon' }),
        h('div', { class: 'meta' },
          h('div', { class: 'name' }, m.name, ' ', h('span', { class: `badge ${m.format === 'java' ? 'gold' : 'teal'}` }, m.format === 'java' ? `Java ${m.formatVersion}` : `Bedrock ${m.formatVersion}`)),
          h('div', { class: 'sub' }, `${r.mappedBlocks}/${r.totalBlocks} blocks · ${r.mappedItems}/${r.totalItems} items · ${r.animated} animated · ${(m.sizeBytes / 1048576).toFixed(1)} MB`),
          packStale(m) ? h('div', { class: 'sub outdated' }, 'Imported by an older version, so newer blocks, items, villagers and screens use Strata textures. ', h('button', { class: 'btn small primary', onclick: () => { replaceId = m.id; fileInput.click(); } }, 'Re-import this pack')) : null,
          m.description ? h('div', { class: 'sub' }, m.description) : null,
        ),
        h('div', { class: 'actions' },
          isActive && idx > 0 ? h('button', { class: 'btn small ghost', title: 'Higher priority', onclick: () => { [order[idx - 1], order[idx]] = [order[idx], order[idx - 1]]; void commit(); } }, '↑') : null,
          isActive && idx < order.length - 1 ? h('button', { class: 'btn small ghost', title: 'Lower priority', onclick: () => { [order[idx + 1], order[idx]] = [order[idx], order[idx + 1]]; void commit(); } }, '↓') : null,
          h('button', { class: 'btn small ghost', onclick: () => showDetails(m) }, 'Details'),
          h('button', { class: `btn small ${isActive ? '' : 'primary'}`, disabled: busy, onclick: () => { order = isActive ? order.filter((x) => x !== m.id) : [m.id, ...order]; void commit(); } }, isActive ? 'Deactivate' : 'Activate'),
          h('button', { class: 'btn small danger', onclick: async () => { if (await confirmDialog('Remove pack', `Remove "${m.name}" from this device?`, 'Remove', true)) { await ResourcePackManager.remove(m.id); order = order.filter((x) => x !== m.id); await load(); void commit(); } } }, 'Remove'),
        ),
      );
    };
    list.appendChild(h('div', { class: 'section-title' }, 'Active (top wins)'));
    if (!active.length) list.appendChild(h('div', { class: 'small muted' }, 'No packs active. Strata\'s original textures are in use.'));
    active.forEach((p, i) => list.appendChild(row(p, true, i)));
    list.appendChild(h('div', { class: 'list-item', style: 'opacity:0.8' }, h('div', { class: 'pack-icon', style: 'background:linear-gradient(#e8a838 0 33%,#8a5a36 33% 66%,#4e4a50 66%)' }), h('div', { class: 'meta' }, h('div', { class: 'name' }, 'Strata Originals'), h('div', { class: 'sub' }, 'Built-in textures. Always available as the fallback for anything a pack does not provide.'))));
    if (inactive.length) {
      list.appendChild(h('div', { class: 'section-title' }, 'Installed'));
      for (const p of inactive) list.appendChild(row(p, false, -1));
    }
  };

  const showDetails = async (m: PackManifest) => {
    const r = m.report;
    const grid = h('div', { class: 'tex-grid' });
    const body = h('div', { class: 'stack' },
      h('div', { class: 'kv small' },
        h('dt', {}, 'Format'), h('dd', {}, m.format === 'java' ? `Java Edition (pack format ${m.formatVersion})` : `Bedrock Edition (${m.formatVersion})`),
        h('dt', {}, 'Blocks mapped'), h('dd', {}, `${r.mappedBlocks} of ${r.totalBlocks}`),
        h('dt', {}, 'Items mapped'), h('dd', {}, `${r.mappedItems} of ${r.totalItems}`),
        h('dt', {}, 'Textures stored'), h('dd', {}, String(r.textures)),
        h('dt', {}, 'Animated'), h('dd', {}, String(r.animated)),
        h('dt', {}, 'Sounds'), h('dd', {}, String(r.sounds)),
        h('dt', {}, 'Fingerprint'), h('dd', { style: 'word-break:break-all;font-family:monospace;font-size:11px' }, m.hash),
      ),
      r.warnings.length ? h('div', { class: 'error-box small' }, ...r.warnings.map((w) => h('div', {}, w))) : null,
      r.missing.length ? h('div', { class: 'small muted' }, `Not provided by this pack (Strata textures used instead): ${r.missing.slice(0, 40).join(', ')}${r.missing.length > 40 ? ' ...' : ''}`) : null,
      h('div', { class: 'section-title' }, 'Compatibility notes'),
      ...r.unsupported.map((u) => h('div', { class: 'small muted' }, u)),
      h('div', { class: 'section-title' }, 'Texture preview'),
      grid,
    );
    modal(m.name, body, [{ label: 'Close', kind: 'primary' }], { wide: true });
    grid.appendChild(h('div', { class: 'small muted' }, 'Building preview...'));
    try {
      const composed = await ResourcePackManager.compose([m.id]);
      const atlas = new TextureAtlas(composed, 32);
      clear(grid);
      for (let i = 0; i < 160; i++) {
        const c = atlas.tileCanvas(i);
        if (!c) break;
        const cv = document.createElement('canvas');
        cv.width = cv.height = 16;
        const g = cv.getContext('2d')!;
        g.imageSmoothingEnabled = false;
        g.drawImage(c, 0, 0, c.width, c.width, 0, 0, 16, 16);
        grid.appendChild(cv);
      }
      atlas.dispose();
    } catch (e) { clear(grid); grid.appendChild(h('div', { class: 'error-box' }, `Preview failed: ${(e as Error).message}`)); }
  };

  const load = async () => { packs = await ResourcePackManager.list(); order = order.filter((id) => packs.some((p) => p.manifest.id === id)); render(); };

  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    fileInput.value = '';
    if (!f) return;
    status.textContent = `Importing ${f.name}...`;
    try {
      const m = await ResourcePackManager.importFile(f);
      if (replaceId && replaceId !== m.id) { const wasActive = order.includes(replaceId); await ResourcePackManager.remove(replaceId); order = order.filter((x) => x !== replaceId); if (!wasActive) order = order.filter((x) => x !== m.id); }
      replaceId = null;
      status.textContent = '';
      toast(`Imported and activated "${m.name}"`, 'success');
      await load();
      order = [m.id, ...order.filter((x) => x !== m.id)];
      await commit();
    } catch (e) { status.textContent = ''; modal('Import failed', (e as Error).message, [{ label: 'OK', kind: 'primary' }]); }
  });

  const el = h('div', { class: 'screen dim', style: 'z-index:35' },
    h('div', { class: 'card panel wide' },
      h('div', { class: 'card-head' }, h('h2', {}, 'Resource packs'), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => { el.remove(); onClose(); }, html: '&times;' })),
      h('div', { class: 'card-body' },
        h('div', { class: 'info-box small' }, 'To play with vanilla Minecraft textures, import the Java Edition resource pack zip you own (it contains pack.mcmeta). Blocks, items, mobs, player skins, sky, clouds and HUD will use it. You can also import a Java Edition (.zip with pack.mcmeta) or Bedrock Edition (.zip or .mcpack with manifest.json) resource pack. Packs are stored only on this device and are never uploaded. Only images, JSON and sounds are read; scripts are ignored.'),
        lockedNote ? h('div', { class: 'error-box small' }, lockedNote) : null,
        h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: () => fileInput.click() }, 'Import pack'), status),
        list, fileInput,
      ),
    ),
  );
  parent.appendChild(el);
  if (autoImport) fileInput.click();
  void load();
}
