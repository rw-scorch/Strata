import { h, clear, toggle, slider, segmented, select, toast } from './dom';
import { getSettings, updateSettings, GraphicsPreset, isTouchDevice } from '../storage/Settings';
import { storageEstimate, requestPersistence } from '../storage/db';
import { GAME_VERSION, PROTOCOL_VERSION } from '../core/constants';
import { MobileControls } from '../controls/MobileControls';
import { InputState } from '../controls/InputState';
import { drawAvatar } from './avatar';
import { apiURL } from '../multiplayer/RemoteSession';

export const REGIONS: [string, string][] = [
  ['auto', 'Automatic (nearest to the host)'], ['oc', 'Oceania'], ['apac', 'Asia-Pacific'], ['wnam', 'North America (West)'], ['enam', 'North America (East)'],
  ['sam', 'South America'], ['weur', 'Europe (West)'], ['eeur', 'Europe (East)'], ['me', 'Middle East'], ['afr', 'Africa'],
];

export interface SettingsContext {
  netStats?: () => { rtt: number; inRate: number; outRate: number; state: string } | null;
  install?: () => void;
  canInstall?: () => boolean;
}

type Tab = 'graphics' | 'controls' | 'audio' | 'network' | 'gameplay' | 'profile' | 'about';

export function showSettings(parent: HTMLElement, ctx: SettingsContext, onClose: () => void, initial: Tab = 'graphics'): void {
  let tab: Tab = initial;
  const body = h('div', { class: 'card-body' });
  const tabs = h('div', { class: 'tabs' });
  const el = h('div', { class: 'screen dim', style: 'z-index:35' },
    h('div', { class: 'card panel wide' },
      h('div', { class: 'card-head' }, h('h2', {}, 'Settings'), h('button', { class: 'icon-btn', 'aria-label': 'Close', onclick: () => { el.remove(); onClose(); }, html: '&times;' })),
      tabs, body,
    ),
  );
  const labels: [Tab, string][] = [['graphics', 'Graphics'], ['controls', 'Controls'], ['audio', 'Audio'], ['network', 'Network'], ['gameplay', 'Gameplay'], ['profile', 'Profile'], ['about', 'About']];
  const renderTabs = () => {
    clear(tabs);
    for (const [t, l] of labels) tabs.appendChild(h('button', { class: t === tab ? 'on' : '', onclick: () => { tab = t; renderTabs(); render(); } }, l));
  };
  let netTimer = 0;
  const render = () => {
    clear(body);
    clearInterval(netTimer);
    const s = getSettings();
    const set = (p: Parameters<typeof updateSettings>[0], rerender = false) => { updateSettings(p); if (rerender) render(); };
    if (tab === 'graphics') {
      body.append(
        h('div', { class: 'section-title' }, 'Shader quality'),
        segmented<GraphicsPreset>([['low', 'Low'], ['medium', 'Medium'], ['high', 'High'], ['ultra', 'Ultra'], ['custom', 'Custom']], s.preset, (v) => set({ preset: v }, true)),
        h('div', { class: 'small muted' }, 'Low suits phones. Medium suits most iPads: bloom, wet surfaces, cloud shadows. High adds soft shadows, reflective water, god rays and fog. Ultra adds enhanced ambient occlusion and screen-space reflections. Changing any option below switches to Custom.'),
        slider('Render distance', 2, isTouchDevice() ? 10 : 16, 1, s.renderDistance, (v) => `${v} chunks`, (v) => set({ renderDistance: v })),
        slider('Render resolution', 0.5, 1, 0.05, s.resolutionScale, (v) => `${Math.round(v * 100)}%`, (v) => set({ resolutionScale: v })),
        toggle('Dynamic resolution', s.adaptiveResolution, (v) => set({ adaptiveResolution: v }), 'Lowers resolution, then heavy effects, to keep the frame rate steady.'),
        select('Frame rate limit', [['0', 'Unlimited (display rate)'], ['30', '30 FPS (saves battery)'], ['60', '60 FPS'], ['120', '120 FPS']], String(s.fpsLimit) as '0', (v) => set({ fpsLimit: Number(v) })),
        h('div', { class: 'section-title' }, 'Lighting and shadows'),
        segmented<'off' | 'low' | 'high' | 'ultra'>([['off', 'Off'], ['low', 'Low'], ['high', 'High'], ['ultra', 'Ultra']], s.shadowQuality, (v) => set({ shadowQuality: v }, true)),
        slider('Shadow distance', 24, 128, 8, s.shadowDistance, (v) => `${v} blocks`, (v) => set({ shadowDistance: v })),
        toggle('Smooth lighting', s.smoothLighting, (v) => set({ smoothLighting: v }), 'Soft light and corner shading between blocks.'),
        select('Ambient occlusion', [['standard', 'Standard'], ['enhanced', 'Enhanced (screen-space)']], s.ambientOcclusion, (v) => set({ ambientOcclusion: v })),
        toggle('God rays', s.godRays, (v) => set({ godRays: v }), 'Light shafts streaming past terrain toward the sun.'),
        toggle('Volumetric fog', s.volumetricFog, (v) => set({ volumetricFog: v }), 'Height fog with sun scattering, and dusty air in caves.'),
        toggle('Cloud shadows', s.cloudShadows, (v) => set({ cloudShadows: v })),
        toggle('Foliage lighting', s.foliageLighting, (v) => set({ foliageLighting: v }), 'Sunlight glows through leaves and grass.'),
        toggle('Glowing ores', s.glowingOres, (v) => set({ glowingOres: v })),
        h('div', { class: 'section-title' }, 'Water and weather'),
        segmented<'low' | 'high' | 'ultra'>([['low', 'Low'], ['high', 'High'], ['ultra', 'Ultra']], s.waterQuality, (v) => set({ waterQuality: v })),
        select('Reflections', [['off', 'Off'], ['low', 'Low'], ['high', 'High']], s.reflections, (v) => set({ reflections: v })),
        toggle('Wet surfaces and puddles', s.wetSurfaces, (v) => set({ wetSurfaces: v })),
        toggle('Clouds', s.clouds, (v) => set({ clouds: v })),
        h('div', { class: 'section-title' }, 'Camera and post-processing'),
        select('Anti-aliasing', [['off', 'Off'], ['fxaa', 'FXAA'], ['msaa', 'MSAA 4x']], s.antiAliasing, (v) => set({ antiAliasing: v })),
        slider('Bloom', 0, 1, 0.05, s.bloom, (v) => (v === 0 ? 'Off' : `${Math.round(v * 100)}%`), (v) => set({ bloom: v })),
        toggle('Auto exposure', s.autoExposure, (v) => set({ autoExposure: v }), 'Your eyes adjust when moving between caves and daylight.'),
        select('Tone mapping', [['vanilla', 'Vanilla (keeps original colours)'], ['filmic', 'Filmic']], s.toneMapping, (v) => set({ toneMapping: v })),
        slider('Saturation', 0.5, 1.5, 0.05, s.saturation, (v) => `${Math.round(v * 100)}%`, (v) => set({ saturation: v })),
        slider('Contrast', 0.8, 1.3, 0.02, s.contrast, (v) => `${Math.round(v * 100)}%`, (v) => set({ contrast: v })),
        slider('Motion blur', 0, 1, 0.05, s.motionBlur, (v) => (v === 0 ? 'Off' : `${Math.round(v * 100)}%`), (v) => set({ motionBlur: v })),
        toggle('Depth of field', s.depthOfField, (v) => set({ depthOfField: v })),
        toggle('Lens flare and sun glare', s.lensFlare, (v) => set({ lensFlare: v })),
        toggle('Vignette', s.vignette, (v) => set({ vignette: v })),
        toggle('Film grain', s.filmGrain, (v) => set({ filmGrain: v })),
        toggle('Chromatic aberration', s.chromaticAberration, (v) => set({ chromaticAberration: v })),
        select('Texture quality', [['high', 'High'], ['low', 'Low (softer, lighter on memory bandwidth)']], s.textureQuality, (v) => set({ textureQuality: v })),
        h('div', { class: 'section-title' }, 'Particles'),
        segmented<'off' | 'low' | 'high'>([['off', 'Off'], ['low', 'Reduced'], ['high', 'Full']], s.particles, (v) => set({ particles: v })),
        slider('Field of view', 50, 110, 1, s.fov, (v) => `${v}°`, (v) => set({ fov: v })),
        slider('Brightness', 0, 1, 0.05, s.brightness, (v) => (v < 0.2 ? 'Moody' : v > 0.8 ? 'Bright' : `${Math.round(v * 100)}%`), (v) => set({ brightness: v })),
        toggle('View bobbing', s.viewBobbing, (v) => set({ viewBobbing: v })),
        toggle('Show frame rate', s.showFps, (v) => set({ showFps: v })),
      );
    } else if (tab === 'controls') {
      body.append(
        h('div', { class: 'section-title' }, 'Touch'),
        slider('Touch camera sensitivity', 0.3, 2.5, 0.05, s.touchSensitivity, (v) => v.toFixed(2), (v) => set({ touchSensitivity: v })),
        slider('Joystick size', 0.6, 1.6, 0.05, s.joystickSize, (v) => `${Math.round(v * 100)}%`, (v) => set({ joystickSize: v })),
        slider('Button size', 0.6, 1.6, 0.05, s.buttonSize, (v) => `${Math.round(v * 100)}%`, (v) => set({ buttonSize: v })),
        toggle('Left-handed layout', s.leftHanded, (v) => set({ leftHanded: v, buttonLayout: {} }), 'Joystick on the right, action buttons on the left.'),
        toggle('Auto-jump', s.autoJump, (v) => set({ autoJump: v }), 'Step up single blocks automatically while walking.'),
        toggle('Tap and hold the world', s.tapToInteract, (v) => set({ tapToInteract: v }), 'Tap to place or use, hold to break where your finger is. The buttons always work.'),
        h('button', { class: 'btn', onclick: () => {
          el.style.display = 'none';
          const root = document.getElementById('touch-root')!;
          const existing = root.querySelector('.touch-layer') as HTMLElement | null;
          const temp = existing ? null : new MobileControls(root, new InputState(), { onPause() {}, onChat() {}, onPlayers() {}, onCamera() {}, isFlying: () => false, canFly: () => true, isMultiplayer: () => true, setCrouchToggled() {} });
          const ctl = temp ?? ((existing as HTMLElement & { _ctl?: MobileControls })._ctl);
          if (!ctl) { el.style.display = ''; toast('Open the world on a touch device to edit buttons', 'error'); return; }
          ctl.enterEdit(() => { if (temp) temp.root.remove(); el.style.display = ''; });
        } }, 'Edit button layout'),
        h('div', { class: 'section-title' }, 'Mouse and keyboard'),
        slider('Mouse sensitivity', 0.2, 3, 0.05, s.sensitivity, (v) => v.toFixed(2), (v) => set({ sensitivity: v })),
        toggle('Invert vertical look', s.invertY, (v) => set({ invertY: v })),
        h('div', { class: 'kv small' },
          ...[['Move', 'W A S D'], ['Jump / fly up', 'Space (double-tap to fly in Architect)'], ['Crouch / fly down', 'Shift'], ['Sprint', 'Ctrl or double-tap W'], ['Break / attack', 'Left mouse'], ['Place / use', 'Right mouse'],
            ['Pick block', 'Middle mouse'], ['Hotbar', '1-9 or scroll'], ['Inventory', 'E'], ['Drop item', 'Q (Ctrl+Q for stack)'], ['Chat / command', 'T or / '], ['Third person', 'F5'], ['Hide HUD', 'F1'], ['Debug info', 'F3'], ['Pause', 'Esc']]
            .flatMap(([a, b]) => [h('dt', {}, a), h('dd', {}, b)]),
        ),
      );
    } else if (tab === 'audio') {
      body.append(
        toggle('Mute all sound', s.muted, (v) => set({ muted: v })),
        slider('Master volume', 0, 1, 0.05, s.master, (v) => `${Math.round(v * 100)}%`, (v) => set({ master: v })),
        slider('Music', 0, 1, 0.05, s.music, (v) => `${Math.round(v * 100)}%`, (v) => set({ music: v })),
        slider('Effects', 0, 1, 0.05, s.effects, (v) => `${Math.round(v * 100)}%`, (v) => set({ effects: v })),
        slider('Ambience and weather', 0, 1, 0.05, s.ambient, (v) => `${Math.round(v * 100)}%`, (v) => set({ ambient: v })),
        h('div', { class: 'small muted' }, 'All sounds and music are synthesised live in your browser. Resource packs with OGG or WAV sounds replace block, step and pickup sounds where your browser can decode them.'),
      );
    } else if (tab === 'network') {
      const status = h('div', { class: 'info-box' }, 'Not connected to a multiplayer world.');
      const update = () => {
        const n = ctx.netStats?.();
        if (!n) return;
        clear(status);
        status.append(h('div', { class: 'kv' }, h('dt', {}, 'Status'), h('dd', {}, n.state), h('dt', {}, 'Round trip'), h('dd', {}, `${n.rtt} ms`), h('dt', {}, 'Messages in'), h('dd', {}, `${n.inRate.toFixed(1)}/s`), h('dt', {}, 'Messages out'), h('dd', {}, `${n.outRate.toFixed(1)}/s`)));
      };
      update();
      netTimer = window.setInterval(update, 1000);
      const testOut = h('span', { class: 'small muted' });
      body.append(
        h('div', { class: 'section-title' }, 'Connection'), status,
        h('div', { class: 'row' }, h('button', { class: 'btn small', onclick: async () => {
          testOut.textContent = 'Testing...';
          const t0 = performance.now();
          try { const r = await fetch(apiURL('/api/health'), { cache: 'no-store' }); const j = await r.json() as { protocol: number }; testOut.textContent = `Server reachable in ${Math.round(performance.now() - t0)} ms (protocol ${j.protocol}${j.protocol !== PROTOCOL_VERSION ? ', version mismatch: reload to update' : ''}).`; }
          catch { testOut.textContent = 'Server not reachable. Multiplayer needs an internet connection.'; }
        } }, 'Test server'), testOut),
        h('div', { class: 'section-title' }, 'Hosting'),
        select('Preferred server region for new worlds', REGIONS as [string, string][], s.region, (v) => set({ region: v })),
        h('div', { class: 'small muted' }, 'Region is a hint used when a world is first created. Each world stays in the region where it started.'),
        toggle('Reconnect automatically', s.reconnect, (v) => set({ reconnect: v })),
      );
    } else if (tab === 'gameplay') {
      body.append(
        h('div', { class: 'section-title' }, 'Default difficulty for new worlds'),
        segmented([['peaceful', 'Peaceful'], ['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']], s.difficulty, (v) => set({ difficulty: v as typeof s.difficulty })),
        slider('Interface scale', 0.75, 1.4, 0.05, s.hudScale, (v) => `${Math.round(v * 100)}%`, (v) => set({ hudScale: v })),
        slider('Chat background', 0, 1, 0.05, s.chatOpacity, (v) => `${Math.round(v * 100)}%`, (v) => set({ chatOpacity: v })),
      );
    } else if (tab === 'profile') {
      const prev = h('div', { class: 'player-preview', style: 'width:110px;height:170px' });
      const redraw = () => { clear(prev); prev.appendChild(drawAvatar(getSettings().appearance, 5, true)); };
      redraw();
      const pick = (label: string, key: 'skin' | 'hair' | 'shirt' | 'pants', n: number) => {
        const row = h('div', { class: 'row' }, h('span', { style: 'width:70px' }, label));
        const btn = (d: number) => h('button', { class: 'btn small', onclick: () => { const a = { ...getSettings().appearance }; a[key] = (a[key] + d + n) % n; updateSettings({ appearance: a }); redraw(); val.textContent = String(a[key] + 1); } }, d < 0 ? '‹' : '›');
        const val = h('span', { style: 'width:28px;text-align:center' }, String(s.appearance[key] + 1));
        row.append(btn(-1), val, btn(1));
        return row;
      };
      body.append(
        h('label', { class: 'field' }, h('span', {}, 'Player name'), h('input', { class: 'input', value: s.playerName, maxlength: 16, placeholder: 'Wayfarer', oninput: (e: Event) => set({ playerName: (e.target as HTMLInputElement).value.replace(/[<>]/g, '').slice(0, 16) }) })),
        h('div', { class: 'row', style: 'align-items:flex-start;gap:18px' }, prev, h('div', { class: 'stack' }, pick('Skin', 'skin', 8), pick('Hair', 'hair', 8), pick('Shirt', 'shirt', 12), pick('Trousers', 'pants', 12))),
        h('div', { class: 'small muted' }, 'Your look is shared with other players in multiplayer worlds.'),
      );
    } else {
      const est = h('div', { class: 'small muted' }, 'Checking storage...');
      void storageEstimate().then((e) => { est.textContent = e ? `Using ${(e.usage / 1048576).toFixed(1)} MB of about ${(e.quota / 1048576).toFixed(0)} MB available on this device.` : 'Storage usage is not reported by this browser.'; });
      const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone;
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      body.append(
        h('div', { class: 'kv' }, h('dt', {}, 'Version'), h('dd', {}, `Strata ${GAME_VERSION}`), h('dt', {}, 'Network protocol'), h('dd', {}, String(PROTOCOL_VERSION)), h('dt', {}, 'Installed as app'), h('dd', {}, standalone ? 'Yes' : 'No')),
        h('div', { class: 'section-title' }, 'Install'),
        standalone ? h('p', { class: 'small muted' }, 'Strata is installed. Single-player worlds work offline.') :
          ios ? h('p', { class: 'small' }, 'On iPad or iPhone: open Strata in Safari, tap the Share button, then choose "Add to Home Screen". It launches full screen and single-player works offline.') :
            ctx.canInstall?.() ? h('button', { class: 'btn primary', onclick: () => ctx.install?.() }, 'Install Strata') : h('p', { class: 'small muted' }, 'Use your browser menu and choose "Install app" or "Add to Home screen".'),
        h('div', { class: 'section-title' }, 'Storage'), est,
        h('button', { class: 'btn small', onclick: async () => toast((await requestPersistence()) ? 'Storage marked as persistent' : 'The browser declined persistent storage', 'info') }, 'Keep my worlds safe from cleanup'),
      );
    }
  };
  renderTabs();
  render();
  parent.appendChild(el);
}
