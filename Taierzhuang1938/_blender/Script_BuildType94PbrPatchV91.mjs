import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const stages=['Prepare','Bake','Composite','Finalize','Ao','Verify'];
const args=process.argv.slice(2),dry=args.includes('--dry-run');
if(args.includes('--help')){
  console.log('V89 geometry with retained V77 finish, bounded new-detail paint and current geometry AO.\nUsage: node Taierzhuang1938/_blender/Script_BuildType94PbrPatchV91.mjs [--dry-run] [--phase Prepare|Bake|Composite|Finalize|Ao|Verify]\nTYPE94_PATCH_ROOT selects an isolated external output root.');
  process.exit(0);
}
const selected=args.includes('--phase')?args[args.indexOf('--phase')+1]:null;
if(selected&&!stages.includes(selected))throw Error('Unknown stage');
for(const phase of selected?[selected]:stages){
  const python=phase==='Composite';
  const executable=python?(process.env.PYTHON_EXE||'python'):process.execPath;
  const argv=python?['Taierzhuang1938/_blender/Script_Type94PbrCompositeV91.py']:['scripts/Script_BlenderMcp.mjs','start','--task','Type94Tankette','--batch','Taierzhuang1938/_blender/Script_Type94PbrPatchV91.py','--json'];
  if(dry){console.log(JSON.stringify({executable,args:argv,phase}));continue;}
  const result=spawnSync(executable,argv,{cwd:repo,env:{...process.env,TYPE94_PATCH_PHASE:phase},encoding:'utf8',windowsHide:true});
  process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
  const out=path.join(process.env.TYPE94_PATCH_ROOT||'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette/SurfaceV91','Acceptance');
  fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,'Log_PbrStage'+phase+'V91.txt'),(result.stdout||'')+(result.stderr||''));
  if(result.error)throw result.error;
  if(result.status!==0)throw Error('PBR patch stage failed: '+phase);
  if(!python){const info=JSON.parse(result.stdout);if(info.log)fs.copyFileSync(info.log,path.join(out,'Log_Blender'+phase+'V91.txt'));}
}
