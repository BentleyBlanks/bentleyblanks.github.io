// Rebuild the editable Type89 high source, then derive its game GLB in OneDrive.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repo = path.resolve(import.meta.dirname, '../..');
const blenderControl = path.join(repo, 'scripts/Script_BlenderMcp.mjs');
const stage = process.argv.find(value => value.startsWith('--stage='))?.slice(8) ?? 'all';
const version = path.resolve('C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type89MediumTank/GeometryV55SurfaceV15');

if (process.argv.includes('--help')) {
  console.log('node Taierzhuang1938/_blender/Script_RebuildType89Restoration.mjs [--stage=high|game|all]');
  console.log(version);
  process.exit(0);
}
if (!['high', 'game', 'all'].includes(stage)) throw new Error(`Unknown stage ${stage}`);

function Run(phase, args) {
  const scratch = path.join(repo, 'tmp/Type89Restoration');
  fs.mkdirSync(scratch, { recursive: true });
  const argsFile = path.join(scratch, `Data_Rebuild${phase}Args.json`);
  fs.writeFileSync(argsFile, JSON.stringify(args));
  const script = path.join(import.meta.dirname, `Script_Type89Restoration${phase}.py`);
  const result = spawnSync(process.execPath, [blenderControl, 'start', '--batch', script,
    '--batch-args', argsFile, '--task', `Type89Restoration${phase}`], { cwd: repo, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${phase} rebuild failed with exit ${result.status}`);
}

if (stage !== 'game') Run('High', ['--output', version]);
if (stage !== 'high') {
  Run('Game', ['--source', version]);
  const runtime = path.join(version, 'Game/Runtime');
  fs.mkdirSync(runtime, { recursive: true });
  const glb = path.join(runtime, 'Model_Type89MediumTank.glb');
  fs.copyFileSync(path.join(version, 'Game/Model_Type89MediumTank.glb'), glb);
  const packer = path.join(import.meta.dirname, 'Script_Type89Package.mjs');
  const result = spawnSync(process.execPath, [packer, `--file=${glb}`, '--effort=3'], {
    cwd: repo, stdio: 'inherit', windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Texture packaging failed with exit ${result.status}`);
}
