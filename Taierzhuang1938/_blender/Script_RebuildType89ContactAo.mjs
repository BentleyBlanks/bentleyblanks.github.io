import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repo = path.resolve(import.meta.dirname, '../..');
const controller = path.join(repo,'scripts/Script_BlenderMcp.mjs');
const asset = 'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type89MediumTank';
const baseline = path.join(asset,'GeometryV55SurfaceV17');
const version = path.join(asset,'GeometryV55SurfaceV18');
const stages = ['bake','maps','bind','runtime'];
const phase = process.argv.find(value=>value.startsWith('--stage='))?.slice(8) ?? 'all';
if (process.argv.includes('--help')) {
  console.log('node Taierzhuang1938/_blender/Script_RebuildType89ContactAo.mjs [--stage=all|bake|maps|bind|runtime]');
  console.log(version);
  process.exit(0);
}
assert.ok(phase==='all'||stages.includes(phase));

function Run(executable,args,capture=false) {
  const result = spawnSync(executable,args,{cwd:repo,windowsHide:true,encoding:'utf8',
    stdio:capture?['ignore','pipe','inherit']:'inherit'});
  if (result.error) throw result.error;
  if (result.status!==0) throw Error('Type89 AO build failed in '+args[0]);
  return result.stdout;
}

const Node = (args,capture) => Run(process.execPath,[controller,...args],capture);
const Relative = tier => (tier==='Game'?'Game/':'')+'Scene_Type89MediumTank'+tier+'Pbr.blend';
const tiers = ['High','Game'];
const scratch = path.join(repo,'tmp/Type89AmbientOcclusion');
fs.mkdirSync(scratch,{recursive:true});
fs.mkdirSync(path.join(version,'Review'),{recursive:true});

if (phase==='all'||phase==='bake') for (const tier of tiers) {
  const args = path.join(scratch,'Data_Bake'+tier+'Args.json');
  fs.writeFileSync(args,JSON.stringify([path.join(baseline,Relative(tier)),path.join(version,'Bake/AmbientOcclusion',tier)]));
  Node(['start','--batch',path.join(import.meta.dirname,'Script_Type89ContactAoBake.py'),
    '--batch-args',args,'--task','Type89Ao'+tier]);
}
if (phase==='all'||phase==='maps') {
  Run('python',[path.join(import.meta.dirname,'Script_Type89ContactAoPack.py'),baseline,version,'maps']);
}
if (phase==='all'||phase==='bind') for (const tier of tiers) {
  const blend = path.join(version,Relative(tier));
  fs.mkdirSync(path.dirname(blend),{recursive:true});
  if (!fs.existsSync(blend)) fs.copyFileSync(path.join(baseline,Relative(tier)),blend);
  const {port} = JSON.parse(Node(['start',blend,'--task','Type89AmbientOcclusion','--new','--timeout','75','--json'],true));
  assert.ok(Number.isInteger(port));
  const driver = ['from pathlib import Path','import sys',
    'sys.path.insert(0, '+JSON.stringify(import.meta.dirname)+')',
    'from Script_Type89ContactAoBind import Bind',
    'Bind(Path('+JSON.stringify(version)+'), '+JSON.stringify(tier)+')'].join('\n');
  try {
    Node(['exec','--port',String(port),'--timeout','360','--code',driver]);
  } finally {
    Node(['stop','--port',String(port)]);
  }
}
if (phase==='all'||phase==='runtime') {
  Run('python',[path.join(import.meta.dirname,'Script_Type89ContactAoPack.py'),baseline,version,'runtime']);
}
