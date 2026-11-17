import { getSettings, updateSettings } from '../storage/Settings';

export type BindAction =
  | 'forward' | 'back' | 'left' | 'right' | 'jump' | 'sneak' | 'sprint'
  | 'attack' | 'use' | 'pick' | 'inventory' | 'drop' | 'swap' | 'chat' | 'command'
  | 'perspective' | 'hud' | 'zoom' | 'talk' | 'mute' | 'map' | 'waypoint'
  | 'hot1' | 'hot2' | 'hot3' | 'hot4' | 'hot5' | 'hot6' | 'hot7' | 'hot8' | 'hot9';

export const BIND_DEFAULTS: Record<BindAction, string> = {
  forward: 'KeyW', back: 'KeyS', left: 'KeyA', right: 'KeyD', jump: 'Space', sneak: 'ShiftLeft', sprint: 'ControlLeft',
  attack: 'Mouse0', use: 'Mouse2', pick: 'Mouse1', inventory: 'KeyE', drop: 'KeyQ', swap: 'KeyF', chat: 'KeyT', command: 'Slash',
  perspective: 'F5', hud: 'F1', zoom: 'KeyC', talk: 'KeyV', mute: 'KeyM', map: 'KeyN', waypoint: 'KeyB',
  hot1: 'Digit1', hot2: 'Digit2', hot3: 'Digit3', hot4: 'Digit4', hot5: 'Digit5', hot6: 'Digit6', hot7: 'Digit7', hot8: 'Digit8', hot9: 'Digit9',
};

export const BIND_GROUPS: [string, [BindAction, string][]][] = [
  ['Movement', [['forward', 'Walk Forwards'], ['back', 'Walk Backwards'], ['left', 'Strafe Left'], ['right', 'Strafe Right'], ['jump', 'Jump'], ['sneak', 'Sneak'], ['sprint', 'Sprint']]],
  ['Gameplay', [['attack', 'Attack/Destroy'], ['use', 'Use Item/Place Block'], ['pick', 'Pick Block']]],
  ['Inventory', [['inventory', 'Open/Close Inventory'], ['drop', 'Drop Selected Item'], ['swap', 'Swap Item With Offhand'], ...([1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [`hot${n}`, `Hotbar Slot ${n}`]) as [BindAction, string][])]],
  ['Multiplayer', [['chat', 'Open Chat'], ['command', 'Open Command'], ['talk', 'Push to Talk'], ['mute', 'Mute Voice']]],
  ['Miscellaneous', [['perspective', 'Toggle Perspective'], ['hud', 'Hide HUD'], ['zoom', 'Zoom'], ['map', 'Open Map'], ['waypoint', 'Drop Waypoint']]],
];

let cache: { src: unknown; byCode: Map<string, BindAction[]>; byAction: Record<BindAction, string> } | null = null;

function table(): { byCode: Map<string, BindAction[]>; byAction: Record<BindAction, string> } {
  const custom = getSettings().keybinds;
  if (cache && cache.src === custom) return cache;
  const byAction = { ...BIND_DEFAULTS, ...(custom ?? {}) } as Record<BindAction, string>;
  const byCode = new Map<string, BindAction[]>();
  for (const [a, c] of Object.entries(byAction) as [BindAction, string][]) {
    if (!c) continue;
    const l = byCode.get(c);
    if (l) l.push(a); else byCode.set(c, [a]);
  }
  cache = { src: custom, byCode, byAction };
  return cache;
}

export function bindOf(a: BindAction): string { return table().byAction[a]; }
export function actionsFor(code: string): BindAction[] { return table().byCode.get(code) ?? []; }
export function bound(code: string, a: BindAction): boolean { return table().byAction[a] === code; }

export function setBind(a: BindAction, code: string): void {
  const kb = { ...(getSettings().keybinds ?? {}) };
  if (code === BIND_DEFAULTS[a]) delete kb[a]; else kb[a] = code;
  updateSettings({ keybinds: kb });
}

export function resetBinds(): void { updateSettings({ keybinds: {} }); }

export function conflicts(a: BindAction): boolean {
  const c = bindOf(a);
  return !!c && actionsFor(c).length > 1;
}

const NAMES: Record<string, string> = {
  Mouse0: 'Left Button', Mouse1: 'Middle Button', Mouse2: 'Right Button', Mouse3: 'Button 4', Mouse4: 'Button 5',
  Space: 'Space', ShiftLeft: 'Left Shift', ShiftRight: 'Right Shift', ControlLeft: 'Left Ctrl', ControlRight: 'Right Ctrl', AltLeft: 'Left Alt', AltRight: 'Right Alt',
  MetaLeft: 'Left Cmd', MetaRight: 'Right Cmd', Slash: '/', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\',
  Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Enter: 'Enter', Tab: 'Tab', CapsLock: 'Caps Lock', Backspace: 'Backspace',
  ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', '': 'Not Bound',
};

export function keyName(code: string): string {
  if (code in NAMES) return NAMES[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Keypad ${code.slice(6)}`;
  return code;
}
