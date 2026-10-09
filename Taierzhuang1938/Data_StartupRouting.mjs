// Gameplay and explicit developer views retain their original entry contracts.
export function IsMenuStartup(params) {
  return params.get('menu') !== '0' && !['phase', 'shot', 'preview', 'editor', 'range', 'movement',
    'explosions', 'weapons', 'melee', 'gore', 'whitebox', 'jiehe', 'missionStage', 'poseTest'].some(key => params.has(key));
}

export function SandboxUrl(href, key, {stage = null} = {}) {
  const url = new URL(href);
  for (const name of ['menuPreview', 'menuPreviewUi', 'movement', 'range', 'explosions', 'weapons',
    'melee', 'gore', 'whitebox', 'missionStage', 'jiehe', 'phase', 'preview', 'menu', 'editor']) url.searchParams.delete(name);
  const params = {movement: 'movement', weapons: 'weapons', range: 'range', explosions: 'explosions',
    melee: 'melee', gore: 'gore', firstLevelP012Whitebox: 'whitebox', jiehe: 'jiehe'};
  if (params[key]) url.searchParams.set(params[key], key === 'firstLevelP012Whitebox' ? 'p012' : '1');
  if (key === 'firstLevelP012Whitebox' && stage != null) url.searchParams.set('missionStage', stage);
  return url.href;
}
