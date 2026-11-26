import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repo = path.resolve(import.meta.dirname,'../..');
const controller = path.join(repo,'scripts/Script_BlenderMcp.mjs');
const directory = 'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type89MediumTank/GeometryV55SurfaceV16';
const phase = process.argv.find(value => value.startsWith('--stage='))?.slice(8) ?? 'all';
if (process.argv.includes('--help')) {
  console.log('node Taierzhuang1938/_blender/Script_RebuildType89MetalFinish.mjs [--stage=all|high|bake|package]');
  console.log(directory);
  process.exit(0);
}
assert.ok(['all','high','bake','package'].includes(phase));

function Run(executable, args) {
  const result = spawnSync(executable,args,{cwd:repo,stdio:'inherit',windowsHide:true});
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error('Build failed in '+args[0]+': '+result.status);
}

function Blender(stage) {
  const scratch = path.join(repo,'tmp/Type89MetalFinish');
  fs.mkdirSync(scratch,{recursive:true});
  const argsFile = path.join(scratch,'Data_'+stage+'Args.json');
  fs.writeFileSync(argsFile,JSON.stringify(['--phase',stage,'--output',directory]));
  Run(process.execPath,[controller,'start','--batch',path.join(import.meta.dirname,'Script_Type89MetalFinish.py'),
    '--batch-args',argsFile,'--task','Type89Metal'+stage]);
}

const runtime = path.join(import.meta.dirname,'Script_Type89MetalFinishRuntime.mjs');
const glb = path.join(directory,'Game/Runtime/Model_Type89MediumTank.glb');
if (phase==='all'||phase==='high') Blender('high');
if (phase==='all'||phase==='bake') Blender('bake');
if (phase==='all'||phase==='package') {
  Run(process.execPath,[runtime,'--phase=snapshot']);
  Run('python',[path.join(import.meta.dirname,'Script_Type89MetalFinishMaps.py'),'--output',directory]);
  Blender('bind');
  Run(process.execPath,[runtime,'--phase=build']);
  Run(process.execPath,[path.join(import.meta.dirname,'Script_Type89Package.mjs'),'--file='+glb,'--effort=3']);
  Run(process.execPath,[runtime,'--phase=verify']);
}
