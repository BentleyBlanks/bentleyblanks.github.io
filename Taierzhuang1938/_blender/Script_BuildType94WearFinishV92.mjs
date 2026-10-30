import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const phases=['Prepare','Raster','Apply','Verify'],args=process.argv.slice(2);
if(args.includes('--help')){console.log('V92 selective steel wear on V91 geometry. --dry-run, --phase Prepare|Raster|Apply|Verify. TYPE94_FINISH_ROOT selects isolated output.');process.exit(0)}
const selected=args.includes('--phase')?args[args.indexOf('--phase')+1]:null;
if(selected&&!phases.includes(selected))throw Error('Unknown phase');
for(const phase of selected?[selected]:phases){
  const raster=phase==='Raster',executable=raster?(process.env.PYTHON_EXE||'python'):process.execPath;
  const argv=raster?['Taierzhuang1938/_blender/Script_Type94WearFinishRasterV92.py']:['scripts/Script_BlenderMcp.mjs','start','--task','Type94Tankette','--batch','Taierzhuang1938/_blender/Script_Type94WearFinishV92.py','--json'];
  if(args.includes('--dry-run')){console.log(JSON.stringify({executable,args:argv,phase}));continue}
  const result=spawnSync(executable,argv,{cwd:repo,encoding:'utf8',windowsHide:true,env:{...process.env,TYPE94_FINISH_PHASE:phase}});
  process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
  const out=path.join(process.env.TYPE94_FINISH_ROOT||'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette/SurfaceV92','Acceptance');
  fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'Log_Finish'+phase+'V92.txt'),(result.stdout||'')+(result.stderr||''));
  if(result.error)throw result.error;if(result.status!==0)throw Error('Finish phase failed: '+phase);
  if(!raster){const info=JSON.parse(result.stdout);if(info.log)fs.copyFileSync(info.log,path.join(out,'Log_BlenderFinish'+phase+'V92.txt'))}
}
