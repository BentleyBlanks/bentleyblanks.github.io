import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repo=path.resolve(import.meta.dirname,'../..');
const controller=path.join(repo,'scripts/Script_BlenderMcp.mjs');
const tank='C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type89MediumTank';
const baseline=path.join(tank,'GeometryV55SurfaceV21');
const version=path.join(tank,'GeometryV55SurfaceV22');
const stage=process.argv.find(value=>value.startsWith('--stage='))?.slice(8)??'all';
if(process.argv.includes('--help')){
  console.log('node Taierzhuang1938/_blender/Script_RebuildType89SoilMaterial.mjs [--stage=all|maps|bind|runtime]');
  process.exit(0);
}
assert.ok(['all','maps','bind','runtime'].includes(stage));

function Run(executable,args,capture=false){
  const result=spawnSync(executable,args,{cwd:repo,windowsHide:true,encoding:'utf8',
    stdio:capture?['ignore','pipe','inherit']:'inherit'});
  if(result.error)throw result.error;
  if(result.status!==0)throw Error('Type89 soil material bake failed in '+args[0]);
  return result.stdout;
}

const Node=(args,capture)=>Run(process.execPath,[controller,...args],capture);
const Bake=phase=>Run('python',[path.join(import.meta.dirname,'Script_Type89SoilMaterialBake.py'),baseline,version,phase]);
fs.mkdirSync(path.join(version,'Review'),{recursive:true});
if(stage==='all'||stage==='maps')Bake('maps');
if(stage==='all'||stage==='bind')for(const tier of ['High','Game']){
  const relative=(tier==='Game'?'Game/':'')+'Scene_Type89MediumTank'+tier+'Pbr.blend';
  const file=path.join(version,relative);
  fs.mkdirSync(path.dirname(file),{recursive:true});
  if(!fs.existsSync(file))fs.copyFileSync(path.join(baseline,relative),file);
  const {port}=JSON.parse(Node(['start',file,'--task','Type89SoilScan','--timeout','90','--new','--json'],true));
  assert.ok(Number.isInteger(port));
  const data=['from pathlib import Path','import sys',
    'sys.path.insert(0, '+JSON.stringify(import.meta.dirname)+')','from Script_Type89SoilMaterialBind import Bind',
    'Bind(Path('+JSON.stringify(version)+'), '+JSON.stringify(tier)+')'].join('\n');
  try{Node(['exec','--port',String(port),'--timeout','220','--code',data]);}
  finally{Node(['stop','--port',String(port)]);}
}
if(stage==='all'||stage==='runtime')Bake('runtime');
