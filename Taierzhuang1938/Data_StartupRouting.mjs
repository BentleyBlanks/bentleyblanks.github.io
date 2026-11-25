// Gameplay and explicit developer views retain their original entry contracts.
// Test-range switches come from the one registry (Data_SandboxRanges, zero imports, safe for the router bundle).
import { SANDBOX_RANGE_KEYS } from './Data_SandboxRanges.mjs';
import { LOCAL_CONTROL_CENTER } from './Data_DevToolsSplit.mjs';

const GAME_KEYS = ['phase', 'shot', 'whitebox', 'jiehe', 'missionStage', 'poseTest', ...SANDBOX_RANGE_KEYS];

export function IsMenuStartup(params) {
  return params.get('menu') !== '0' && !params.has('editor') && !GAME_KEYS.some(key => params.has(key));
}

export function LocalControlCenterUrl(href, params) {
  if (!LOCAL_CONTROL_CENTER || params.get('editor') !== 'tools' || params.has('tool')
    || params.get('menu') === '0' || GAME_KEYS.some(key => params.has(key))) return null;
  const url = new URL(LOCAL_CONTROL_CENTER, href);
  url.search = params.toString();
  url.searchParams.delete('editor');
  return url;
}

export function SandboxUrl(href, key, {stage = null} = {}) {
  const url = new URL(href);
  for (const name of ['menuPreview', 'menuPreviewUi', ...SANDBOX_RANGE_KEYS, 'whitebox', 'missionStage', 'jiehe', 'phase', 'preview', 'menu', 'editor', 'level', 'kf', 'tool']) url.searchParams.delete(name);
  const params = {...Object.fromEntries(SANDBOX_RANGE_KEYS.map(id => [id, id])), firstLevelP012Whitebox: 'whitebox', jiehe: 'jiehe'};
  if (params[key]) url.searchParams.set(params[key], key === 'firstLevelP012Whitebox' ? 'p012' : '1');
  if (key === 'firstLevelP012Whitebox' && stage != null) url.searchParams.set('missionStage', stage);
  return url.href;
}
