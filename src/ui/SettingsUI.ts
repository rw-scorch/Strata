import { h, toast } from './dom';
import { getSettings, updateSettings, GraphicsPreset, isTouchDevice, Settings } from '../storage/Settings';
import { storageEstimate, requestPersistence } from '../storage/db';
import { GAME_VERSION, PROTOCOL_VERSION } from '../core/constants';
import { MobileControls } from '../controls/MobileControls';
import { InputState } from '../controls/InputState';
import { drawAvatar } from './avatar';
import { apiURL } from '../multiplayer/RemoteSession';
import { mcScreen, mcButton, mcCycle, mcToggle, mcSlider, mcRow, mcHeading, mcText, mcInput } from './mc/Widgets';

const LOD_STOPS = [0, 16, 32, 64, 128, 256, 512];

export const REGIONS: [string, string][] = [
  ['auto', 'Automatic (nearest to the host)'], ['oc', 'Oceania'], ['apac', 'Asia-Pacific'], ['wnam', 'North America (West)'], ['enam', 'North America (East)'],
  ['sam', 'South America'], ['weur', 'Europe (West)'], ['eeur', 'Europe (East)'], ['me', 'Middle East'], ['afr', 'Africa'],
];

export interface SettingsContext {
  netStats?: () => { rtt: number; inRate: number; outRate: number; state: string } | null;
  install?: () => void;
  canInstall?: () => boolean;
  openPacks?: (done: () => void) => void;
  inGame?: boolean;
}

type Page = 'root' | 'video' | 'audio' | 'controls' | 'touch' | 'chat' | 'skin' | 'access' | 'network' | 'about' | 'labs';

const pct = (v: number) => `${Math.round(v * 100)}%`;
const onOff = (v: number) => (v === 0 ? 'OFF' : pct(v));

export function showSettings(parent: HTMLElement, ctx: SettingsContext, onClose: () => void, initial: Page | string = 'root'): void {
  const set = (p: Partial<Settings>) => updateSettings(p);
  const open = (page: Page, back: () => void) => {
    const s = getSettings();
    const go = (p: Page) => () => { scr.close(); open(p, () => open(page, back)); };
    let scr: ReturnType<typeof mcScreen>;
    const screen = (title: string, ...rows: (HTMLElement | null)[]) => mcScreen({ title, onDone: back, inGame: ctx.inGame }, ...rows);
    switch (page) {
      case 'root':
        scr = screen('Options',
          mcRow(mcSlider('FOV', 30, 110, 1, s.fov, (v) => (v === 70 ? 'Normal' : v === 110 ? 'Quake Pro' : String(v)), (v) => set({ fov: v })),
            mcCycle('Difficulty', [['peaceful', 'Peaceful'], ['easy', 'Easy'], ['normal', 'Normal'], ['hard', 'Hard']], s.difficulty, (v) => set({ difficulty: v }), { tip: 'Default difficulty for new worlds.' })),
          h('div', { class: 'mc-gap' }),
          mcRow(mcButton('Skin Customization...', go('skin')), mcButton('Music & Sounds...', go('audio'))),
          mcRow(mcButton('Video Settings...', go('video')), mcButton('Controls...', go('controls'))),
          mcRow(mcButton('Touch Controls...', go('touch')), mcButton('Chat & HUD...', go('chat'))),
          mcRow(mcButton('Resource Packs...', () => { if (ctx.openPacks) { scr.close(); ctx.openPacks(() => open('root', back)); } }, 150, { disabled: !ctx.openPacks }), mcButton('Accessibility...', go('access'))),
          mcRow(mcButton('Multiplayer...', go('network')), mcButton('About & Install...', go('about'))),
          mcRow(mcButton('Labs...', go('labs'), 150, { tip: 'Unfinished features, off by default.' })),
        );
        break;
      case 'video': {
        const presets: [GraphicsPreset, string][] = [['low', 'Fast'], ['medium', 'Fancy'], ['high', 'Fabulous'], ['ultra', 'Ultra'], ['custom', 'Custom']];
        const maxRd = 32;
        scr = screen('Video Settings',
          mcRow(mcCycle('Graphics', presets, s.preset, (v) => { set({ preset: v }); scr.close(); open('video', back); }, { tip: 'Fast suits phones. Fancy suits most iPads. Fabulous adds soft shadows and reflective water. Ultra adds screen-space reflections.' }),
            mcSlider('Render Distance', 2, maxRd, 1, Math.min(s.renderDistance, maxRd), (v) => `${v} chunks`, (v) => set({ renderDistance: v }))),
          mcRow(mcSlider('Max Framerate', 30, 260, 10, s.fpsLimit || 260, (v) => (v >= 260 ? 'Unlimited' : `${v} fps`), (v) => set({ fpsLimit: v >= 260 ? 0 : v })),
            mcCycle('GUI Scale', [[0, 'Auto'], [1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']], s.guiScale, (v) => set({ guiScale: v }))),
          mcRow(mcSlider('Brightness', 0, 1, 0.05, s.brightness, (v) => (v === 0 ? 'Moody' : v === 1 ? 'Bright' : `+${Math.round(v * 100)}%`), (v) => set({ brightness: v })),
            mcToggle('View Bobbing', s.viewBobbing, (v) => set({ viewBobbing: v }))),
          mcRow(mcSlider('Render Resolution', 0.5, 1, 0.05, s.resolutionScale, pct, (v) => set({ resolutionScale: v })),
            mcToggle('Dynamic Resolution', s.adaptiveResolution, (v) => set({ adaptiveResolution: v }), 'Lowers resolution, then heavy effects, to hold a steady frame rate.')),
          mcRow(mcToggle('Clouds', s.clouds, (v) => set({ clouds: v })),
            mcCycle('Particles', [['high', 'All'], ['low', 'Decreased'], ['off', 'Minimal']], s.particles, (v) => set({ particles: v }))),
          mcRow(mcToggle('Smooth Lighting', s.smoothLighting, (v) => set({ smoothLighting: v })),
            mcToggle('Show FPS', s.showFps, (v) => set({ showFps: v }))),
          mcHeading('Distant Terrain'),
          mcRow(mcSlider('Distant Terrain', 0, LOD_STOPS.length - 1, 1, Math.max(0, LOD_STOPS.indexOf(LOD_STOPS.reduce((a, b) => (Math.abs(b - s.lodDistance) < Math.abs(a - s.lodDistance) ? b : a)))),
            (v) => (LOD_STOPS[v] ? `${LOD_STOPS[v]} chunks` : 'OFF'), (v) => set({ lodDistance: LOD_STOPS[v] })),
            mcCycle('Distant Detail', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']], s.lodQuality, (v) => set({ lodQuality: v }))),
          mcText('Draws simplified terrain far past your render distance, built from the world seed (like Distant Horizons). Blocks you change far away show up once you get close.', { center: true, small: true }),
          mcHeading('Performance'),
          mcRow(mcToggle('Cave Culling', s.caveCulling, (v) => set({ caveCulling: v }), 'Skips drawing caves and rooms you cannot see, like Minecraft and Sodium.'),
            mcToggle('Idle Frame Saver', s.idleFps, (v) => set({ idleFps: v }), 'Drops to 15 fps when the window is in the background and 30 fps when paused or idle, to save battery.')),
          mcHeading('Shaders'),
          mcRow(mcCycle('Shadows', [['off', 'OFF'], ['low', 'Low'], ['high', 'High'], ['ultra', 'Ultra']], s.shadowQuality, (v) => set({ shadowQuality: v })),
            mcSlider('Shadow Distance', 24, 128, 8, s.shadowDistance, (v) => `${v} blocks`, (v) => set({ shadowDistance: v }))),
          mcRow(mcCycle('Ambient Occlusion', [['standard', 'Standard'], ['enhanced', 'Enhanced']], s.ambientOcclusion, (v) => set({ ambientOcclusion: v })),
            mcCycle('Water', [['low', 'Low'], ['high', 'High'], ['ultra', 'Ultra']], s.waterQuality, (v) => set({ waterQuality: v }))),
          mcRow(mcCycle('Reflections', [['off', 'OFF'], ['low', 'Low'], ['high', 'High']], s.reflections, (v) => set({ reflections: v })),
            mcToggle('Wet Surfaces', s.wetSurfaces, (v) => set({ wetSurfaces: v }))),
          mcRow(mcToggle('Cloud Shadows', s.cloudShadows, (v) => set({ cloudShadows: v })),
            mcToggle('Foliage Glow', s.foliageLighting, (v) => set({ foliageLighting: v }), 'Sunlight shines through leaves and grass.')),
          mcRow(mcToggle('Glowing Ores', s.glowingOres, (v) => set({ glowingOres: v })),
            mcCycle('Anti-aliasing', [['off', 'OFF'], ['fxaa', 'FXAA'], ['msaa', 'MSAA 4x']], s.antiAliasing, (v) => set({ antiAliasing: v }))),
          mcRow(mcSlider('Bloom', 0, 1, 0.05, s.bloom, onOff, (v) => set({ bloom: v })),
            mcToggle('Auto Exposure', s.autoExposure, (v) => set({ autoExposure: v }))),
          mcRow(mcCycle('Tone Mapping', [['vanilla', 'Vanilla'], ['filmic', 'Filmic']], s.toneMapping, (v) => set({ toneMapping: v })),
            mcCycle('Textures', [['high', 'Sharp'], ['low', 'Soft']], s.textureQuality, (v) => set({ textureQuality: v }))),
          mcRow(mcSlider('Saturation', 0.5, 1.5, 0.05, s.saturation, pct, (v) => set({ saturation: v })),
            mcSlider('Contrast', 0.8, 1.3, 0.02, s.contrast, pct, (v) => set({ contrast: v }))),
          mcRow(mcSlider('Motion Blur', 0, 1, 0.05, s.motionBlur, onOff, (v) => set({ motionBlur: v })),
            mcToggle('Depth of Field', s.depthOfField, (v) => set({ depthOfField: v }))),
          mcRow(mcToggle('Lens Flare', s.lensFlare, (v) => set({ lensFlare: v })),
            mcToggle('Vignette', s.vignette, (v) => set({ vignette: v }))),
          mcRow(mcToggle('Film Grain', s.filmGrain, (v) => set({ filmGrain: v })),
            mcToggle('Colour Fringe', s.chromaticAberration, (v) => set({ chromaticAberration: v }))),
        );
        break;
      }
      case 'audio':
        scr = screen('Music & Sounds',
          mcRow(mcSlider('Master Volume', 0, 1, 0.05, s.master, onOff, (v) => set({ master: v }), { w: 310 })),
          mcRow(mcSlider('Music', 0, 1, 0.05, s.music, onOff, (v) => set({ music: v })), mcSlider('Blocks & Mobs', 0, 1, 0.05, s.effects, onOff, (v) => set({ effects: v }))),
          mcRow(mcSlider('Ambient/Environment', 0, 1, 0.05, s.ambient, onOff, (v) => set({ ambient: v })), mcToggle('Mute All', s.muted, (v) => set({ muted: v }))),
          mcText('Sounds are made live in your browser. Resource pack sounds replace block, step and pickup sounds.', { center: true, small: true }),
        );
        break;
      case 'controls':
        scr = screen('Controls',
          mcRow(mcCycle('Controls', [['auto', 'Automatic'], ['mouse', 'Mouse & Keys'], ['touch', 'Touch']], s.controlScheme, (v) => set({ controlScheme: v }), { tip: 'Automatic switches between touch and mouse when you use them.' }),
            mcToggle('Auto-Jump', s.autoJump, (v) => set({ autoJump: v }))),
          mcRow(mcSlider('Sensitivity', 0.2, 3, 0.05, s.sensitivity, (v) => pct(v / 2), (v) => set({ sensitivity: v })),
            mcToggle('Invert Mouse', s.invertY, (v) => set({ invertY: v }))),
          mcHeading('Key Binds'),
          ...[['Move', 'W A S D'], ['Jump', 'Space'], ['Sneak', 'Shift'], ['Sprint', 'Ctrl'], ['Attack/Destroy', 'Left Button'], ['Use Item/Place', 'Right Button'], ['Pick Block', 'Middle Button'],
            ['Hotbar', '1-9, Scroll'], ['Inventory', 'E'], ['Drop Item', 'Q'], ['Chat', 'T'], ['Command', '/'], ['Perspective', 'F5'], ['Hide HUD', 'F1'], ['Debug Screen', 'F3'], ['Advanced Tooltips', 'F3 + H']]
            .map(([a, b]) => mcRow(h('div', { class: 'mct mc-kb-label' }, a), mcButton(b, () => {}, 75, { disabled: true }))),
        );
        break;
      case 'touch': {
        const edit = () => {
          scr.el.style.display = 'none';
          const root = document.getElementById('touch-root')!;
          const existing = root.querySelector('.touch-layer') as HTMLElement | null;
          const temp = existing ? null : new MobileControls(root, new InputState(), { onPause() {}, onChat() {}, onPlayers() {}, onCamera() {}, isFlying: () => false, canFly: () => true, isMultiplayer: () => true, setCrouchToggled() {} });
          const ctl = temp ?? ((existing as HTMLElement & { _ctl?: MobileControls })._ctl);
          if (!ctl) { scr.el.style.display = ''; toast('Open a world on a touch device to edit buttons', 'error'); return; }
          ctl.enterEdit(() => { if (temp) temp.root.remove(); scr.el.style.display = ''; });
        };
        scr = screen('Touch Controls',
          mcRow(mcCycle('Buttons', [['full', 'All Buttons'], ['minimal', 'Jump & Crouch'], ['none', 'None']], s.touchLayout, (v) => set({ touchLayout: v }), { tip: 'All Buttons shows break, place and interact. Jump & Crouch leaves only movement buttons: tap the world to place, hold to break. None hides action buttons too.' }),
            mcToggle('Tap & Hold World', s.tapToInteract, (v) => set({ tapToInteract: v }), 'Tap to place or use, hold to break where your finger is.')),
          mcRow(mcSlider('Look Sensitivity', 0.3, 2.5, 0.05, s.touchSensitivity, (v) => v.toFixed(2), (v) => set({ touchSensitivity: v })),
            mcSlider('Button Opacity', 0.2, 1, 0.05, s.buttonOpacity ?? 0.85, pct, (v) => set({ buttonOpacity: v }))),
          mcRow(mcSlider('Joystick Size', 0.6, 1.6, 0.05, s.joystickSize, pct, (v) => set({ joystickSize: v })),
            mcSlider('Button Size', 0.6, 1.6, 0.05, s.buttonSize, pct, (v) => set({ buttonSize: v }))),
          mcRow(mcToggle('Left-Handed', s.leftHanded, (v) => set({ leftHanded: v, buttonLayout: {} })),
            mcToggle('Auto-Jump', s.autoJump, (v) => set({ autoJump: v }))),
          mcRow(mcButton('Edit Button Layout...', edit, 150, { tip: 'Drag buttons to move them. Tap one to resize or hide it.' }),
            mcButton('Reset Layout', () => { set({ buttonLayout: {} }); toast('Button layout reset', 'info'); })),
        );
        break;
      }
      case 'chat':
        scr = screen('Chat & HUD',
          mcRow(mcSlider('Chat Background', 0, 1, 0.05, s.chatOpacity, pct, (v) => set({ chatOpacity: v })),
            mcToggle('Chat Timestamps', s.chatTimestamps, (v) => set({ chatTimestamps: v }))),
          mcRow(mcToggle('Show Coordinates', s.showCoords, (v) => set({ showCoords: v }), 'Servers can turn coordinates off for everyone.'),
            mcToggle('Show Minimap', s.showMinimap, (v) => set({ showMinimap: v }), 'Servers can turn the minimap off for everyone.')),
          mcRow(mcSlider('HUD Size', 0.5, 1.5, 0.25, s.hudScale, pct, (v) => set({ hudScale: v })),
            mcToggle('Advanced Tooltips', s.advancedTooltips, (v) => set({ advancedTooltips: v }), 'Shows item ids and full durability in tooltips. F3 + H also toggles this.')),
        );
        break;
      case 'skin': {
        const prev = h('div', { class: 'mc-skin-prev' });
        const redraw = () => { prev.replaceChildren(drawAvatar(getSettings().appearance, 5, true)); };
        redraw();
        const pick = (label: string, key: 'skin' | 'hair' | 'shirt' | 'pants', n: number) =>
          mcCycle(label, Array.from({ length: n }, (_, i) => [i, String(i + 1)] as [number, string]), s.appearance[key], (v) => { updateSettings({ appearance: { ...getSettings().appearance, [key]: v } }); redraw(); });
        scr = screen('Skin Customization',
          prev,
          mcRow(mcInput(s.playerName, 'Wayfarer', (v) => set({ playerName: v.replace(/[<>]/g, '').slice(0, 16) }), 310, 16)),
          mcRow(pick('Skin', 'skin', 8), pick('Hair', 'hair', 8)),
          mcRow(pick('Shirt', 'shirt', 12), pick('Trousers', 'pants', 12)),
          mcText('Custom skin files arrive in a later update.', { center: true, small: true }),
        );
        break;
      }
      case 'access':
        scr = screen('Accessibility',
          mcRow(mcCycle('Fire Overlay', [['low', 'Low'], ['normal', 'Normal']], s.fireOverlay, (v) => set({ fireOverlay: v }), { tip: 'Low keeps the flames near the bottom of the screen so you can still see.' }),
            mcSlider('Menu Blur', 0, 10, 1, s.menuBlur, (v) => (v === 0 ? 'OFF' : String(v)), (v) => set({ menuBlur: v }))),
          mcRow(mcToggle('View Bobbing', s.viewBobbing, (v) => set({ viewBobbing: v })),
            mcSlider('Brightness', 0, 1, 0.05, s.brightness, (v) => (v === 0 ? 'Moody' : v === 1 ? 'Bright' : `+${Math.round(v * 100)}%`), (v) => set({ brightness: v }))),
          mcRow(mcToggle('Lens Flare', s.lensFlare, (v) => set({ lensFlare: v })), mcSlider('Motion Blur', 0, 1, 0.05, s.motionBlur, onOff, (v) => set({ motionBlur: v }))),
        );
        break;
      case 'network': {
        const status = mcText('Not connected to a multiplayer world.', { center: true, small: true });
        const tick = () => { const n = ctx.netStats?.(); if (n) status.textContent = `${n.state}: ${n.rtt} ms, ${n.inRate.toFixed(1)} in/s, ${n.outRate.toFixed(1)} out/s`; };
        tick();
        const timer = window.setInterval(() => { if (!status.isConnected) clearInterval(timer); else tick(); }, 1000);
        const testOut = mcText('', { center: true, small: true });
        scr = screen('Multiplayer',
          status,
          mcRow(mcCycle('Region', REGIONS.map(([k, v]) => [k, v.replace(/ \(.*\)$/, '')] as [string, string]), s.region, (v) => set({ region: v }), { tip: 'A hint used when a world is first created. Worlds stay where they started.', w: 200 }),
            mcToggle('Reconnect', s.reconnect, (v) => set({ reconnect: v }))),
          mcRow(mcButton('Test Server', async () => {
            testOut.textContent = 'Testing...';
            const t0 = performance.now();
            try { const r = await fetch(apiURL('/api/health'), { cache: 'no-store' }); const j = await r.json() as { protocol: number }; testOut.textContent = `Reachable in ${Math.round(performance.now() - t0)} ms (protocol ${j.protocol}${j.protocol !== PROTOCOL_VERSION ? ', reload to update' : ''})`; }
            catch { testOut.textContent = 'Server not reachable.'; }
          })),
          testOut,
        );
        break;
      }
      case 'about': {
        const est = mcText('Checking storage...', { center: true, small: true });
        void storageEstimate().then((e) => { est.textContent = e ? `Using ${(e.usage / 1048576).toFixed(1)} MB of about ${(e.quota / 1048576).toFixed(0)} MB.` : 'Storage use is not reported by this browser.'; });
        const standalone = matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone;
        const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        scr = screen('About & Install',
          mcText(`Strata ${GAME_VERSION}, protocol ${PROTOCOL_VERSION}`, { center: true }),
          mcText('Fan-made. Not affiliated with Mojang or Microsoft.', { center: true, small: true }),
          standalone ? mcText('Installed as an app. Single-player works offline.', { center: true, small: true })
            : ios ? mcText('On iPad: Share, then Add to Home Screen.', { center: true, small: true })
              : mcRow(mcButton('Install Strata', () => ctx.install?.(), 150, { disabled: !ctx.canInstall?.() })),
          est,
          mcRow(mcButton('Keep Worlds Safe', async () => toast((await requestPersistence()) ? 'Storage marked as persistent' : 'The browser declined persistent storage', 'info'), 150, { tip: 'Asks the browser not to clear your worlds when space runs low.' })),
        );
        break;
      }
      case 'labs':
        scr = screen('Labs',
          mcText('These are unfinished and may change or break.', { center: true, small: true }),
          mcRow(mcToggle('Arena Modes', s.labs, (v) => set({ labs: v }), 'Shows Fortune Spires and Hearthfall on the title screen.')),
        );
        break;
    }
    parent.appendChild(scr!.el);
  };
  const start = (['root', 'video', 'audio', 'controls', 'touch', 'chat', 'skin', 'access', 'network', 'about', 'labs'] as Page[]).includes(initial as Page) ? initial as Page : 'root';
  open(start, onClose);
}
