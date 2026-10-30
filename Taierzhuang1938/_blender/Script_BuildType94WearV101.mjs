// Local reversible current-shape wear recipe. TYPE94_WEAR101_ROOT selects replay.
import fs from'node:fs';import path from'node:path';import{spawnSync}from'node:child_process';import{fileURLToPath}from'node:url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),root=process.env.TYPE94_WEAR101_ROOT||'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette/SurfaceV101',args=process.argv.slice(2),phases=['Prepare','Raster','Apply','Verify'];
const from=args.includes('--from')?phases.indexOf(args[args.indexOf('--from')+1]):0;if(from<0)throw Error('Unknown starting phase');const selected=args.includes('--phase')?[args[args.indexOf('--phase')+1]]:phases.slice(from);if(selected.some(p=>!phases.includes(p)))throw Error('Unknown phase');
for(const phase of selected){
 const raster=phase==='Raster',exe=raster?(process.env.PYTHON_EXE||'python'):process.execPath,argv=raster?['-X','utf8','Taierzhuang1938/_blender/Script_Type94WearRasterV101.py']:['scripts/Script_BlenderMcp.mjs','start','--task','Type94Tankette','--batch','Taierzhuang1938/_blender/Script_Type94WearLayersV101.py','--json'];
 if(args.includes('--dry-run')){console.log(JSON.stringify({phase,exe,argv,root}));continue}
 const result=spawnSync(exe,argv,{cwd:repo,env:{...process.env,TYPE94_WEAR101_ROOT:root,TYPE94_WEAR101_PHASE:phase},encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');if(result.error)throw result.error;if(result.status!==0)throw Error(phase+' failed');
 const out=path.join(root,'Acceptance');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'Log_'+phase+'V101.txt'),result.stdout+result.stderr);if(!raster){const info=JSON.parse(result.stdout);if(info.log)fs.copyFileSync(info.log,path.join(out,'Log_Blender'+phase+'V101.txt'))}
}
