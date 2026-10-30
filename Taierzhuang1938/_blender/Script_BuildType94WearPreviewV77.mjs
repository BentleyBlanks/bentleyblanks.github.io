import path from 'node:path';
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const phases=['Prepare','Atlas','Transfer','Clips','Raster','Apply','Normal','Verify'];
const args=process.argv.slice(2),dry=args.includes('--dry-run');
if(args.includes('--help')){
  console.log('V68 geometry with weighted UV packing and selective wear V77.\nUsage: node Taierzhuang1938/_blender/Script_BuildType94WearPreviewV77.mjs [--dry-run] [--phase Prepare|Atlas|Transfer|Clips|Raster|Apply|Normal|Verify]\nTYPE94_WEAR_ROOT selects an isolated external output folder.');
  process.exit(0);
}
const phase=args.includes('--phase')?args[args.indexOf('--phase')+1]:null;
if(phase&&!phases.includes(phase))throw Error('Unknown phase');
for(const stage of phase?[phase]:phases){
  const raster=['Raster','Transfer'].includes(stage);
  const exe=raster?(process.env.PYTHON_EXE||'python'):process.execPath;
  const argv=raster?['Taierzhuang1938/_blender/'+(stage==='Transfer'?'Script_Type94WearAtlasV77.py':'Script_Type94WearRasterV77.py')]:['scripts/Script_BlenderMcp.mjs','start','--task','Type94Tankette','--batch','Taierzhuang1938/_blender/Script_Type94WearPreviewV77.py','--json'];
  if(dry){console.log(JSON.stringify({exe,args:argv,phase:stage}));continue;}
  const result=spawnSync(exe,argv,{cwd:repo,env:{...process.env,TYPE94_WEAR_PHASE:stage},encoding:'utf8',windowsHide:true});
  process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
  const acceptance=path.join(process.env.TYPE94_WEAR_ROOT||'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette/SurfaceV77','Acceptance');
  fs.mkdirSync(acceptance,{recursive:true});
  fs.writeFileSync(path.join(acceptance,'Log_WearStage'+stage+'V77.txt'),(result.stdout||'')+(result.stderr||''));
  if(!raster&&result.status===0){
    const info=JSON.parse(result.stdout);
    if(info.log&&fs.existsSync(info.log))fs.copyFileSync(info.log,path.join(acceptance,'Log_Blender'+stage+'V77.txt'));
  }
  if(result.error)throw result.error;
  if(result.status!==0)throw Error('Wear V77 stage failed: '+stage);
}
