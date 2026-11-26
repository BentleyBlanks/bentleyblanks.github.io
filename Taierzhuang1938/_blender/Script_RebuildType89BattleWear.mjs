import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repo = path.resolve(import.meta.dirname, '../..');
const controller = path.join(repo, 'scripts/Script_BlenderMcp.mjs');
const assetRoot = 'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type89MediumTank';
const source = path.join(assetRoot, 'GeometryV55SurfaceV16');
const version = path.join(assetRoot, 'GeometryV55SurfaceV17');
const baseline = path.join(source, 'Game/Runtime/Model_Type89MediumTank.glb');
const output = path.join(version, 'Game/Runtime/Model_Type89MediumTank.glb');
const stage = process.argv.find(value => value.startsWith('--stage='))?.slice(8) ?? 'all';
if (process.argv.includes('--help')) {
  console.log('node Taierzhuang1938/_blender/Script_RebuildType89BattleWear.mjs [--stage=all|controls|high|game]');
  console.log(version);
  process.exit(0);
}
assert.ok(['all', 'controls', 'high', 'game'].includes(stage));

function Run(command, args, capture = false) {
  const result = spawnSync(command, args, {
    cwd: repo, windowsHide: true, encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'inherit'] : 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw Error('Type89 battle wear build failed in ' + args[0]);
  return result.stdout;
}

function Python(file, args) {
  Run('python', [path.join(import.meta.dirname, file), ...args]);
}

function Blender(relative, script, entry) {
  const target = path.join(version, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (!fs.existsSync(target)) fs.copyFileSync(path.join(source, relative), target);
  const start = Run(process.execPath, [controller, 'start', target, '--new', '--task', 'Type89BattleWear',
    '--timeout', '75', '--json'], true);
  const { port } = JSON.parse(start);
  assert.ok(Number.isInteger(port));
  const args = ['from pathlib import Path', 'import sys',
    'sys.path.insert(0, ' + JSON.stringify(import.meta.dirname) + ')',
    'from ' + script + ' import ' + entry, entry + '(Path(' + JSON.stringify(version) + '))'];
  try {
    Run(process.execPath, [controller, 'exec', '--port', String(port), '--timeout', '600',
      '--code', args.join('\n')]);
  } finally {
    Run(process.execPath, [controller, 'stop', '--port', String(port)]);
  }
}

if (stage === 'all' || stage === 'controls') {
  Python('Script_Type89BattleWearMasks.py', [baseline, path.join(version, 'Maps/Controls')]);
}
if (stage === 'all' || stage === 'high') {
  Blender('Scene_Type89MediumTankHighPbr.blend', 'Script_Type89BattleWearHigh', 'Author');
}
if (stage === 'all' || stage === 'game') {
  Python('Script_Type89BattleWearGame.py', [baseline, version]);
  Blender('Game/Scene_Type89MediumTankGamePbr.blend', 'Script_Type89BattleWearBind', 'Bind');
  Run(process.execPath, [path.join(import.meta.dirname, 'Script_Type89Package.mjs'), '--file=' + output, '--effort=3']);
}
