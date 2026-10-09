// Title-screen runtime: no battlefield, actors, physics, gameplay textures or shader warmup.
import * as THREE from 'three';
import {SetTextureImportRenderer} from './Script_TextureImports.mjs';
import {MainMenu, Progress} from './Script_Menu.mjs';
import {CommandRoom} from './Script_CommandRoom.mjs';
import {CommandRoomPreview} from './Script_CommandRoomPreview.mjs';
import {BootPaper} from './Script_BootPaper.mjs';
import {AudioEngine} from './Script_Audio.mjs';
import {GraphicsSettings, AudioSettings, ControlsSettings, ApplySavedSettings, NormalizeGraphicsDetails} from './Script_EditorSettings.mjs';
import {LoadGraphicsProfile, LoadWhiteboxConfig, CreateGraphicsProfileApi} from './Script_GraphicsProfile.mjs';
import {QUALITY_PRESETS} from './Data_Tuning_Graphics.mjs';
import {CreateGameGraphics} from './Data_Tuning_GameGraphics.mjs';
import {WhiteboxGraphicsOverrides} from './Data_Tuning_Whitebox.mjs';
import {CAMPAIGN_ENTRIES} from './Data_Menu.mjs';
import {MOVEMENT_RANGE_PHASE} from './Data_MovementRange.mjs';
import {WEAPON_RANGE_PHASE} from './Data_WeaponRange.mjs';
import {RANGE_PHASE} from './Data_Range.mjs';
import {EXPLOSION_RANGE_PHASE} from './Data_ExplosionRange.mjs';
import {MELEE_QTE_PHASE} from './Data_MeleeQte.mjs';
import {GORE_RANGE_PHASE} from './Data_GoreRange.mjs';
import {FIRST_LEVEL_STAGES} from './Data_FirstLevelMissionStages.mjs';
import {DebugOptions} from './Script_DebugOptions.mjs';
import {SandboxUrl} from './Data_StartupRouting.mjs';
import {T} from './Script_Text.mjs';

window.__bootMainAlive = true;
window.__bootGuardDismiss?.();
const params = new URLSearchParams(location.search), canvas = document.getElementById('view');
const boot = document.getElementById('boot'), bootStep = document.getElementById('bootStep');
const paper = new BootPaper({img: document.getElementById('bootPaper'), sub: document.getElementById('bootSub'),
  name: document.getElementById('bootPaperName'), note: document.getElementById('bootPaperNote')});
paper.Show(); bootStep.textContent = T('boot.step.dressSet');
const renderer = new THREE.WebGLRenderer({canvas, antialias: false, powerPreference: 'high-performance'});
SetTextureImportRenderer(renderer);
renderer.setPixelRatio(Math.min(1.5, devicePixelRatio || 1));
renderer.setSize(innerWidth, innerHeight, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true; renderer.shadowMap.autoUpdate = false;
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, .05, 80);
const audio = new AudioEngine({enabled: params.get('audio') !== '0', recordedPacks: false});
const debugOptions = new DebugOptions();
const state = {ready: false, running: false, menu: true, warming: false, builtPhase: null, standaloneMenu: true};
const profile = LoadGraphicsProfile(location.search), quality = profile === 'whitebox' ? 'high' : profile;
const preset = QUALITY_PRESETS[quality], config = LoadWhiteboxConfig();
const graphics = CreateGameGraphics({profile, preset, gi: params.get('gi') === '1'});
NormalizeGraphicsDetails(graphics, {preset});
if (profile === 'whitebox') Object.assign(graphics, WhiteboxGraphicsOverrides(config));
const graphicsProfile = CreateGraphicsProfileApi({profile, config,
  post: {quality, passes: [{name: 'commandRoom'}], lastRenderedPasses: ['commandRoom']}, renderer: null});
let menu, active = null, activeId = null, frameId = 0;
const settingsRoot = document.createElement('div'); settingsRoot.id = 'edRoot';
settingsRoot.className = 'menuSettings off'; document.body.appendChild(settingsRoot);
const host = {renderer, camera, canvas, audio, post: null,
  game: {graphics, GraphicsProfile: graphicsProfile, ApplyGraphics() {}}, Close: CloseSettings};
ApplySavedSettings(host);
const room = new CommandRoom(renderer, {isActive: () => !!menu?.open || !!active,
  getMenuMode: () => activeId || menu?.mode || 'title'});
const previewValue = params.get('menuPreview');
const preview = new CommandRoomPreview(room, () => Progress.Read(), /^[0-6]$/.test(previewValue ?? '') ? Number(previewValue) : null);
function CloseSettings() {
  active?.Exit(); active = null; activeId = null;
  settingsRoot.classList.add('off'); audio.SetPaused(false);
  menu?.root.classList.remove('off');
  menu?.Show('settings');
}
function OpenSettings(id) {
  if (id === 'tools') return OpenTools();
  const Settings = [GraphicsSettings, AudioSettings, ControlsSettings].find(item => item.id === id);
  if (!Settings) return;
  active?.Exit(); activeId = id; active = new Settings(host);
  settingsRoot.classList.remove('off'); menu.root.classList.add('off');
  active.Enter(settingsRoot); audio.SetPaused(true);
}
function OpenTools() {
  const url = new URL(SandboxUrl(location.href, null)); url.searchParams.set('phase', '2'); url.searchParams.set('editor', 'tools');
  location.assign(url.href);
}
document.addEventListener('keydown', event => {
  if (active && event.key === 'Escape') {
    event.preventDefault(); event.stopImmediatePropagation(); CloseSettings();
  }
  if (event.code === 'Backquote' && !event.repeat && !event.target.closest?.('input, textarea, select')) {
    // Developer tools need the game host; load it only after this explicit shortcut.
    event.preventDefault();
    OpenTools();
  }
}, true);
settingsRoot.addEventListener('keydown', event => event.stopPropagation());
async function PreviewCommandRoom(stage = null, {hideUi = false} = {}) {
  if (!menu?.open || !menu.live) throw Error('Open the title menu before previewing command-room artwork');
  const result = await preview.SetStage(stage);
  if (!result) return {...preview.State(), superseded: true};
  if (!result.active) {
    const url = new URL(location.href); url.searchParams.delete('menuPreview'); url.searchParams.delete('menuPreviewUi');
    history.replaceState(history.state, '', url);
  }
  menu.Show('title'); menu.RefreshCommandRoomPreview(); menu.SetCommandRoomPreviewUi(hideUi && result.active);
  room.Update(0); room.Render(); return {...result, hideUi: menu.commandRoomPreviewHidden};
}
const GoToSandbox = (key, options) => location.assign(SandboxUrl(location.href, key, options));
function StartLevel(index) {
  const url = new URL(SandboxUrl(location.href, null)); url.searchParams.set('phase', index); url.searchParams.set('autoplay', '1');
  location.assign(url.href);
}
function StepFrames(count = 1, dt = 1 / 60, render = true) {
  for (let i = 0; i < count; i++) { menu.Update(dt); active?.Update?.(dt); room.Update(dt); if (render) room.Render(); }
}
await preview.Load();
menu = new MainMenu({root: document.getElementById('menu'), camera, staticBackdrop: true,
  campaign: CAMPAIGN_ENTRIES, sandboxes: [MOVEMENT_RANGE_PHASE, WEAPON_RANGE_PHASE, RANGE_PHASE, EXPLOSION_RANGE_PHASE, MELEE_QTE_PHASE, GORE_RANGE_PHASE],
  CommandRoomPreview: () => preview.State(), PreviewCommandRoom, PrepareBackdrop: () => preview.Load(),
  SliceIndex: () => null, Unlock: () => audio.Unlock(), Settings: OpenSettings,
  PlaySandbox: GoToSandbox, ExitSandbox: () => GoToSandbox(null), Play: StartLevel,
  DebugOptions: () => debugOptions.Get(), SetDebugOption: (id, enabled) => debugOptions.Set(id, enabled),
  FirstLevelStages: () => FIRST_LEVEL_STAGES.map(stage => ({...stage, current: false})),
  FirstLevelJump: stage => GoToSandbox('firstLevelP012Whitebox', {stage}),
});
const api = {renderer, camera, scene: room.scene, audio, state, menu, graphics, GraphicsProfile: graphicsProfile, StepFrames,
  get MenuParticles() { return room.atmosphere?.particles ?? null; },
  Debug: {
    Menu: () => ({open: menu.open, live: menu.live, mode: menu.mode, items: menu.items.map(item => item.id),
      item: menu.items[menu.itemIndex]?.id || null, selected: menu.selected, shot: menu.shots[menu.shotIndex]?.id || null,
      shotCount: menu.shots.length, slice: null, camera: {x: camera.position.x, y: camera.position.y, z: camera.position.z, fov: camera.fov},
      progress: Progress.Read(), debugOptions: debugOptions.Get(), standalone: true}),
    CommandRoom: () => room.State(), PreviewCommandRoom,
    CommandRoomPreview: () => ({...preview.State(), hideUi: !!menu.commandRoomPreviewHidden}),
    MenuAct: id => menu.Activate(id), MenuShow: mode => menu.Show(mode), MenuPlay: (index, options) => menu.Play(index, options),
    StartLevel, ResetProgress: () => Progress.Reset(), DebugOptions: () => debugOptions.Get(),
    SetDebugOption: (id, enabled) => debugOptions.Set(id, enabled), Level: () => ({id: 'CommandRoom', standalone: true}),
    Editor: () => ({active: activeId, capturing: !!active, panelOpen: false, hidden: settingsRoot.classList.contains('off')}),
  }};
window.Taierzhuang = window.Tengxian = api;
menu.Open(); menu.RefreshCommandRoomPreview();
if (preview.State().active && params.get('menuPreviewUi') === '0') menu.SetCommandRoomPreviewUi(true);
document.getElementById('hud').style.display = 'none';
document.getElementById('bootStart').textContent = T('boot.start.play');
bootStep.textContent = T('boot.step.ready'); document.querySelector('#bootBar i').style.width = '100%';
room.Update(0); room.Render();
state.ready = true; boot.classList.add('gone'); paper.Hide();
let previous = performance.now();
function Frame(now) {
  const dt = Math.min(.05, Math.max(0, (now - previous) / 1000)); previous = now;
  StepFrames(1, dt); frameId = requestAnimationFrame(Frame);
}
frameId = requestAnimationFrame(Frame);
window.addEventListener('resize', () => {renderer.setSize(innerWidth, innerHeight, false);});
window.addEventListener('pagehide', event => {
  cancelAnimationFrame(frameId);
  if (!event.persisted) {paper.Hide(); active?.Exit(); room.Dispose(); audio.Dispose(); renderer.dispose();}
});
window.addEventListener('pageshow', event => {
  if (event.persisted) {previous = performance.now(); frameId = requestAnimationFrame(Frame);}
});
