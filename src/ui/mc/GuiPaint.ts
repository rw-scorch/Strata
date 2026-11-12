const C = { face: '#c6c6c6', light: '#ffffff', dark: '#555555', edge: '#000000', slot: '#8b8b8b', slotDark: '#373737', slotLight: '#ffffff' };

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  return [c, g];
}

function panel(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  g.fillStyle = C.edge;
  g.fillRect(x + 2, y, w - 4, 1); g.fillRect(x + 2, y + h - 1, w - 4, 1); g.fillRect(x, y + 2, 1, h - 4); g.fillRect(x + w - 1, y + 2, 1, h - 4);
  g.fillRect(x + 1, y + 1, 1, 1); g.fillRect(x + w - 2, y + 1, 1, 1); g.fillRect(x + 1, y + h - 2, 1, 1); g.fillRect(x + w - 2, y + h - 2, 1, 1);
  g.fillStyle = C.face; g.fillRect(x + 1, y + 2, w - 2, h - 4); g.fillRect(x + 2, y + 1, w - 4, h - 2);
  g.fillStyle = C.light; g.fillRect(x + 2, y + 1, w - 5, 2); g.fillRect(x + 1, y + 2, 2, h - 5);
  g.fillStyle = C.dark; g.fillRect(x + 3, y + h - 3, w - 5, 2); g.fillRect(x + w - 3, y + 3, 2, h - 5);
}

function slot(g: CanvasRenderingContext2D, x: number, y: number, s = 18): void {
  g.fillStyle = C.slotDark; g.fillRect(x, y, s - 1, 1); g.fillRect(x, y, 1, s - 1);
  g.fillStyle = C.slotLight; g.fillRect(x + 1, y + s - 1, s - 1, 1); g.fillRect(x + s - 1, y + 1, 1, s - 1);
  g.fillStyle = C.slot; g.fillRect(x + 1, y + 1, s - 2, s - 2);
  g.fillRect(x + s - 1, y, 1, 1); g.fillRect(x, y + s - 1, 1, 1);
}

function grid(g: CanvasRenderingContext2D, x: number, y: number, cols: number, rows: number): void {
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) slot(g, x + c * 18, y + r * 18);
}

function arrow(g: CanvasRenderingContext2D, x: number, y: number, color = C.slot): void {
  g.fillStyle = color;
  g.fillRect(x, y + 6, 16, 4);
  for (let i = 0; i < 8; i++) g.fillRect(x + 15 + i, y + i, 1, 16 - i * 2);
}

function inventoryPart(g: CanvasRenderingContext2D, x: number, y: number): void {
  grid(g, x, y, 9, 3);
  grid(g, x, y + 58, 9, 1);
}

const cache = new Map<string, HTMLCanvasElement>();

export function guiFallback(key: string): HTMLCanvasElement | null {
  if (cache.has(key)) return cache.get(key)!;
  const c = paint(key);
  if (c) cache.set(key, c);
  return c;
}

function paint(key: string): HTMLCanvasElement | null {
  switch (key) {
    case 'gt:container/inventory': {
      const [c, g] = canvas(256, 256);
      panel(g, 0, 0, 176, 166);
      for (let i = 0; i < 4; i++) slot(g, 7, 7 + i * 18);
      g.fillStyle = '#000'; g.fillRect(25, 7, 51, 72);
      slot(g, 76, 61);
      grid(g, 97, 17, 2, 2);
      arrow(g, 134, 28);
      slot(g, 153, 27);
      inventoryPart(g, 7, 83);
      return c;
    }
    case 'gt:container/crafting_table': {
      const [c, g] = canvas(256, 256);
      panel(g, 0, 0, 176, 166);
      grid(g, 29, 16, 3, 3);
      arrow(g, 89, 34);
      slot(g, 119, 30, 26);
      inventoryPart(g, 7, 83);
      return c;
    }
    case 'gt:container/furnace': {
      const [c, g] = canvas(256, 256);
      panel(g, 0, 0, 176, 166);
      slot(g, 55, 16); slot(g, 55, 52);
      g.fillStyle = C.slot; for (let i = 0; i < 3; i++) g.fillRect(58 + i * 4, 38, 2, 10);
      arrow(g, 79, 34);
      slot(g, 111, 30, 26);
      inventoryPart(g, 7, 83);
      return c;
    }
    case 'gt:container/generic_54': {
      const [c, g] = canvas(256, 256);
      panel(g, 0, 0, 176, 222);
      grid(g, 7, 17, 9, 6);
      inventoryPart(g, 7, 139);
      return c;
    }
    case 'gt:container/villager': {
      const [c, g] = canvas(512, 256);
      panel(g, 0, 0, 276, 166);
      g.fillStyle = C.slot; g.fillRect(4, 17, 88, 140);
      g.fillStyle = C.slotDark; g.fillRect(93, 17, 6, 140);
      slot(g, 135, 36); slot(g, 161, 36);
      arrow(g, 186, 35);
      slot(g, 214, 31, 26);
      inventoryPart(g, 107, 83);
      return c;
    }
    case 'gt:container/creative_inventory/tab_items': case 'gt:container/creative_inventory/tab_inventory': {
      const [c, g] = canvas(256, 256);
      panel(g, 0, 0, 195, 136);
      if (key.endsWith('tab_items')) {
        grid(g, 8, 17, 9, 5);
        g.fillStyle = C.slotDark; g.fillRect(174, 17, 14, 112);
        grid(g, 8, 111, 9, 1);
      } else {
        slot(g, 53, 5); slot(g, 53, 32); slot(g, 107, 5); slot(g, 107, 32);
        g.fillStyle = '#000'; g.fillRect(73, 5, 32, 43);
        grid(g, 8, 53, 9, 3); grid(g, 8, 111, 9, 1); slot(g, 172, 111);
      }
      return c;
    }
    case 'gt:container/creative_inventory/tab_item_search': {
      const [c, g] = canvas(256, 256);
      panel(g, 0, 0, 195, 136);
      g.fillStyle = '#000'; g.fillRect(80, 4, 90, 12);
      grid(g, 8, 17, 9, 5);
      g.fillStyle = C.slotDark; g.fillRect(174, 17, 14, 112);
      grid(g, 8, 111, 9, 1);
      return c;
    }
    case 'gt:recipe_book': {
      const [c, g] = canvas(256, 256);
      panel(g, 1, 1, 147, 166);
      g.fillStyle = '#000'; g.fillRect(25, 13, 81, 14);
      return c;
    }
    case 'gs:container/furnace/lit_progress': {
      const [c, g] = canvas(14, 14);
      g.fillStyle = '#ff8a00'; g.fillRect(3, 5, 8, 9); g.fillStyle = '#ffd200'; g.fillRect(5, 2, 4, 11); g.fillStyle = '#fff3a0'; g.fillRect(6, 8, 2, 5);
      return c;
    }
    case 'gs:container/furnace/burn_progress': {
      const [c, g] = canvas(24, 16);
      arrow(g, 0, 0, '#ffffff');
      return c;
    }
    case 'gs:recipe_book/button': case 'gs:recipe_book/button_highlighted': {
      const [c, g] = canvas(20, 18);
      g.fillStyle = key.endsWith('highlighted') ? '#4fd56a' : '#2f9e48'; g.fillRect(1, 1, 18, 16);
      g.fillStyle = '#e8e8e8'; g.fillRect(4, 4, 12, 10); g.fillStyle = '#7a4a1a'; g.fillRect(9, 4, 2, 10);
      return c;
    }
    case 'gs:recipe_book/slot_craftable': case 'gs:recipe_book/slot_uncraftable': case 'gs:recipe_book/slot_many_craftable': case 'gs:recipe_book/slot_many_uncraftable': {
      const [c, g] = canvas(25, 25);
      g.fillStyle = key.includes('uncraftable') ? '#a33' : '#8b8b8b'; g.fillRect(0, 0, 25, 25);
      g.fillStyle = C.slotDark; g.fillRect(0, 0, 25, 1); g.fillRect(0, 0, 1, 25);
      g.fillStyle = '#ddd'; g.fillRect(0, 24, 25, 1); g.fillRect(24, 0, 1, 25);
      return c;
    }
    case 'gs:recipe_book/page_forward': case 'gs:recipe_book/page_backward': case 'gs:recipe_book/page_forward_highlighted': case 'gs:recipe_book/page_backward_highlighted': {
      const [c, g] = canvas(12, 17);
      g.fillStyle = key.includes('highlighted') ? '#fff' : '#ddd';
      for (let i = 0; i < 8; i++) { const x = key.includes('forward') ? 2 + i : 9 - i; g.fillRect(x, 1 + i, 1, 15 - i * 2); }
      return c;
    }
    case 'gs:container/creative_inventory/scroller': case 'gs:container/creative_inventory/scroller_disabled': case 'gs:container/villager/scroller': case 'gs:container/villager/scroller_disabled': {
      const v = key.includes('villager');
      const [c, g] = canvas(v ? 6 : 12, v ? 27 : 15);
      panel(g, 0, 0, c.width, c.height);
      if (key.endsWith('disabled')) { g.fillStyle = 'rgba(80,80,80,0.5)'; g.fillRect(0, 0, c.width, c.height); }
      return c;
    }
    case 'gs:container/villager/trade_arrow': case 'gs:container/villager/trade_arrow_out_of_stock': {
      const [c, g] = canvas(10, 9);
      g.fillStyle = key.endsWith('stock') ? '#a00' : '#fff';
      g.fillRect(0, 3, 6, 3); for (let i = 0; i < 5; i++) g.fillRect(5 + i, i, 1, 9 - i * 2);
      return c;
    }
    case 'gs:container/villager/out_of_stock': {
      const [c, g] = canvas(28, 21);
      g.strokeStyle = '#d00'; g.lineWidth = 2; g.beginPath(); g.moveTo(4, 2); g.lineTo(24, 19); g.moveTo(24, 2); g.lineTo(4, 19); g.stroke();
      return c;
    }
    case 'gs:container/villager/experience_bar_background': case 'gs:container/villager/experience_bar_current': case 'gs:hud/experience_bar_background': case 'gs:hud/experience_bar_progress': {
      const hud = key.includes('hud');
      const [c, g] = canvas(hud ? 182 : 102, 5);
      const fill = key.endsWith('background') ? '#2b2b2b' : '#80ff20';
      g.fillStyle = '#000'; g.fillRect(0, 0, c.width, 5);
      g.fillStyle = fill; g.fillRect(1, 1, c.width - 2, 3);
      if (hud) { g.fillStyle = '#000'; for (let x = 20; x < c.width - 1; x += 20) g.fillRect(x, 1, 1, 3); }
      return c;
    }
    case 'gs:widget/button': case 'gs:widget/button_highlighted': case 'gs:widget/button_disabled': {
      const [c, g] = canvas(200, 20);
      const hi = key.endsWith('highlighted'), dis = key.endsWith('disabled');
      g.fillStyle = dis ? '#2c2c2c' : hi ? '#fff' : '#000'; g.fillRect(0, 0, 200, 20);
      g.fillStyle = dis ? '#4a4a4a' : hi ? '#7c88d0' : '#6f6f6f'; g.fillRect(1, 1, 198, 18);
      g.fillStyle = dis ? '#555' : hi ? '#a8b4ff' : '#aaaaaa'; g.fillRect(1, 1, 198, 1); g.fillRect(1, 1, 1, 17);
      g.fillStyle = dis ? '#333' : hi ? '#4b5698' : '#4a4a4a'; g.fillRect(1, 17, 198, 2); g.fillRect(198, 2, 1, 16);
      return c;
    }
  }
  if (key === 'gs:widget/slider' || key === 'gs:widget/slider_highlighted' || key === 'gs:widget/text_field' || key === 'gs:widget/text_field_highlighted') {
    const [c, g] = canvas(200, 20);
    const hi = key.endsWith('highlighted');
    g.fillStyle = hi ? '#ffffff' : '#a0a0a0'; g.fillRect(0, 0, 200, 20);
    g.fillStyle = key.includes('slider') ? '#2a2a2a' : '#000000'; g.fillRect(1, 1, 198, 18);
    return c;
  }
  if (key === 'gs:widget/slider_handle' || key === 'gs:widget/slider_handle_highlighted') {
    const [c, g] = canvas(8, 20);
    const hi = key.endsWith('highlighted');
    g.fillStyle = hi ? '#fff' : '#000'; g.fillRect(0, 0, 8, 20);
    g.fillStyle = '#8a8a8a'; g.fillRect(1, 1, 6, 17);
    g.fillStyle = '#c6c6c6'; g.fillRect(1, 1, 6, 1); g.fillRect(1, 1, 1, 16);
    g.fillStyle = '#555'; g.fillRect(1, 17, 6, 2);
    return c;
  }
  if (key === 'gt:menu_background' || key === 'gt:inworld_menu_background') {
    const [c, g] = canvas(16, 16);
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) { const v = 22 + ((x * 7 + y * 13 + x * y) % 9); g.fillStyle = `rgb(${v},${v},${v + 2})`; g.fillRect(x, y, 1, 1); }
    return c;
  }
  if (key === 'gt:header_separator' || key === 'gt:footer_separator') {
    const [c, g] = canvas(32, 2);
    g.fillStyle = key.includes('header') ? '#000' : '#555'; g.fillRect(0, 0, 32, 1);
    g.fillStyle = key.includes('header') ? '#555' : '#000'; g.fillRect(0, 1, 32, 1);
    return c;
  }
  if (key === 'gs:hud/crosshair_attack_indicator_background' || key === 'gs:hud/crosshair_attack_indicator_progress') {
    const [c, g] = canvas(16, 4);
    g.fillStyle = key.endsWith('background') ? 'rgba(60,60,60,0.8)' : '#ffffff';
    g.fillRect(0, key.endsWith('background') ? 0 : 1, 16, key.endsWith('background') ? 4 : 2);
    return c;
  }
  if (key === 'gs:hud/hotbar') {
    const [c, g] = canvas(182, 22);
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(0, 0, 182, 22);
    g.fillStyle = 'rgba(20,20,20,0.9)'; g.fillRect(0, 0, 182, 1); g.fillRect(0, 21, 182, 1); g.fillRect(0, 0, 1, 22); g.fillRect(181, 0, 1, 22);
    g.fillStyle = 'rgba(150,150,150,0.55)';
    for (let i = 0; i < 9; i++) { const x = 1 + i * 20; g.fillRect(x, 1, 20, 1); g.fillRect(x, 20, 20, 1); g.fillRect(x, 1, 1, 20); g.fillRect(x + 19, 1, 1, 20); }
    return c;
  }
  if (key === 'gs:hud/hotbar_offhand_left') {
    const [c, g] = canvas(29, 24);
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(1, 1, 22, 22);
    g.fillStyle = 'rgba(20,20,20,0.9)'; g.fillRect(1, 1, 22, 1); g.fillRect(1, 22, 22, 1); g.fillRect(1, 1, 1, 22); g.fillRect(22, 1, 1, 22);
    g.fillStyle = 'rgba(150,150,150,0.55)'; g.fillRect(2, 2, 20, 1); g.fillRect(2, 21, 20, 1); g.fillRect(2, 2, 1, 20); g.fillRect(21, 2, 1, 20);
    return c;
  }
  if (key === 'gs:recipe_book/filter_enabled' || key === 'gs:recipe_book/filter_disabled' || key === 'gs:recipe_book/filter_enabled_highlighted' || key === 'gs:recipe_book/filter_disabled_highlighted') {
    const [c, g] = canvas(26, 16);
    panel(g, 0, 0, 26, 16);
    g.fillStyle = '#8a5a2b'; g.fillRect(8, 3, 10, 10); g.fillStyle = '#c08a4a'; g.fillRect(9, 4, 8, 3);
    if (key.includes('enabled')) { g.fillStyle = '#d02020'; for (let i = 0; i < 8; i++) { g.fillRect(9 + i, 4 + i, 2, 1); g.fillRect(16 - i, 4 + i, 2, 1); } }
    if (key.includes('highlighted')) { g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(1, 1, 24, 14); }
    return c;
  }
  if (key === 'gs:recipe_book/tab' || key === 'gs:recipe_book/tab_selected') {
    const [c, g] = canvas(35, 27);
    panel(g, 0, 0, 39, 27);
    if (key === 'gs:recipe_book/tab') { g.fillStyle = 'rgba(0,0,0,0.2)'; g.fillRect(0, 0, 35, 27); }
    return c;
  }
  if (key === 'gs:hud/hotbar_selection') {
    const [c, g] = canvas(24, 23);
    g.fillStyle = '#000'; g.fillRect(0, 0, 24, 23);
    g.clearRect(3, 3, 18, 18);
    g.fillStyle = '#e8e8e8'; g.fillRect(1, 1, 22, 2); g.fillRect(1, 20, 22, 2); g.fillRect(1, 1, 2, 21); g.fillRect(21, 1, 2, 21);
    g.clearRect(3, 3, 18, 17);
    return c;
  }
  if (key.startsWith('gs:container/creative_inventory/tab_')) {
    const top = key.includes('_top_'), sel = key.includes('_selected_');
    const [c, g] = canvas(26, 32);
    panel(g, 0, top ? 0 : -4, 26, 36);
    if (!sel) { g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, 0, 26, 32); }
    if (sel) { g.fillStyle = C.face; if (top) g.fillRect(1, 28, 24, 4); else g.fillRect(1, 0, 24, 4); }
    return c;
  }
  return null;
}
