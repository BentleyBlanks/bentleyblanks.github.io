// Gameplay and explicit developer views retain their original entry contracts.
// Test-range switches come from the one registry (Data_SandboxRanges, zero imports, safe for the router bundle).
import { SANDBOX_RANGE_KEYS } from './Data_SandboxRanges.mjs';

const DEVELOPER_KEYS = ['phase', 'shot', 'editor', 'whitebox', 'jiehe', 'missionStage', 'poseTest'];

export function IsMenuStartup(params) {
  return params.get('menu') !== '0' && ![...DEVELOPER_KEYS, ...SANDBOX_RANGE_KEYS].some(key => params.has(key));
}

export function SandboxUrl(href, key, {stage = null} = {}) {
  const url = new URL(href);
  for (const name of ['menuPreview', 'menuPreviewUi', ...SANDBOX_RANGE_KEYS, 'whitebox', 'missionStage', 'jiehe', 'phase', 'preview', 'menu', 'editor', 'level', 'kf', 'tool']) url.searchParams.delete(name);
  const params = {...Object.fromEntries(SANDBOX_RANGE_KEYS.map(id => [id, id])), firstLevelP012Whitebox: 'whitebox', jiehe: 'jiehe'};
  if (params[key]) url.searchParams.set(params[key], key === 'firstLevelP012Whitebox' ? 'p012' : '1');
  if (key === 'firstLevelP012Whitebox' && stage != null) url.searchParams.set('missionStage', stage);
  return url.href;
}
