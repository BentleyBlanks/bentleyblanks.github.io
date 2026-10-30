// Local latest-high game checkpoint. Blender ownership stays with the shared launcher.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const directory=path.dirname(fileURLToPath(import.meta.url)),repo=path.resolve(directory,'../..');
const root=process.env.TYPE94_GAME_ROOT||'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette/GameTrialV70',acceptance=path.join(root,'Acceptance');
const phases=[
 ['Delta','Script_Type94GameDeltaV70.py',{}],
 ['Geometry','Script_Type94GameGeometryV70.py',{}],
 ['Planes','Script_Type94GamePlanePatchV70.py',{}],
 ['Prepare','Script_Type94GameProjectionV70.py',{TYPE94_GAME_PHASE:'Prepare'}],
 ...['Paint','Track','Steel','Rubber'].map(role=>[role,'Script_Type94GameProjectionV70.py',{TYPE94_GAME_PHASE:'Bake',TYPE94_GAME_ROLE:role}]),
 ['Repair','Script_Type94GameProjectionRepairV70.py',{}],
 ['Finalize','Script_Type94GameProjectionV70.py',{TYPE94_GAME_PHASE:'Finalize'}],
 ['SourceAudit','Script_Type94GameSourceAuditV70.py',{}],
 ['Running','Script_Type94GameRunningV70.py',{}],
];
const args=process.argv.slice(2);
if(args.includes('--help')){
 console.log('Build local V70 game geometry and fresh high-to-low PBR.\nUsage: node Script_BuildType94GameV70.mjs [--dry-run] [--phase '+phases.map(p=>p[0]).join('|')+'] [--from phase]\nTYPE94_GAME_ROOT optionally selects an isolated replay output folder.\nAll Blender sources and maps remain in OneDrive. Canonical game assets are unchanged.');
 process.exit(0);
}
const phaseIndex=args.indexOf('--phase'),fromIndex=args.indexOf('--from'),startIndex=fromIndex<0?0:phases.findIndex(p=>p[0]===args[fromIndex+1]);if(startIndex<0)throw Error('Unknown starting phase');const selected=phaseIndex<0?phases.slice(startIndex):phases.filter(p=>p[0]===args[phaseIndex+1]);
if(!selected.length)throw Error('Unknown phase');
if(args.includes('--dry-run')){console.log(JSON.stringify({repo,outputRoot:root,phases:selected.map(([name,file,env])=>({name,script:path.join(directory,file),env})),canonicalReplacement:false},null,2));process.exit(0)}
fs.mkdirSync(acceptance,{recursive:true});
for(const[name,file,extra]of selected){
 const env={...process.env,TYPE94_REPO_ROOT:repo,TYPE94_GAME_ROOT:root};delete env.TYPE94_GAME_PHASE;delete env.TYPE94_GAME_ROLE;Object.assign(env,extra);
 const result=spawnSync(process.execPath,[path.join(repo,'scripts/Script_BlenderMcp.mjs'),'start','--task','Type94Tankette','--batch',path.join(directory,file),'--json'],{cwd:repo,env,encoding:'utf8',maxBuffer:16*1024*1024,windowsHide:true});
 if(result.error)throw result.error;
 if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);
 if(result.status!==0)throw Error(name+' failed; retain its actual diagnostic outputs before resuming');
 const completion=JSON.parse(result.stdout.trim());if(completion.exitCode!==0)throw Error(name+' Blender batch failed');
 fs.copyFileSync(completion.log,path.join(acceptance,'Log_'+name+'V70.txt'));
 if(name==='Repair'){
  const raster=spawnSync(process.env.PYTHON_EXE||'python',[path.join(directory,'Script_Type94GameProjectionPixelsV70.py')],{cwd:repo,env,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});
  if(raster.stdout)process.stdout.write(raster.stdout);if(raster.stderr)process.stderr.write(raster.stderr);if(raster.error)throw raster.error;if(raster.status!==0)throw Error('Actual-surface repair raster failed');
 }
}
if(selected.some(p=>p[0]==='SourceAudit')){
 const pbr=JSON.parse(fs.readFileSync(path.join(acceptance,'Data_GamePbrV70.json'),'utf8'));
 for(const argv of [[path.join(repo,'Taierzhuang1938/_import/Script_VerifyType94GameV70.py')],[path.join(repo,'Taierzhuang1938/_import/Script_VerifyType94GameSectionsV70.py')],[path.join(repo,'Taierzhuang1938/_import/Script_VerifyType94Export.py'),pbr.sourceGlb,'--out',path.join(acceptance,'Data_RawGameExportV70.json')]]){
  const result=spawnSync(process.env.PYTHON_EXE||'python',argv,{cwd:repo,env:{...process.env,TYPE94_GAME_ROOT:root},encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});
  if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);if(result.error)throw result.error;if(result.status!==0)throw Error('Actual-buffer verification failed');
 }
}
