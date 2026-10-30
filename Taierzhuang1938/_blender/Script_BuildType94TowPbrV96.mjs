import fs from'node:fs';import path from'node:path';import{spawnSync}from'node:child_process';import{fileURLToPath}from'node:url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),phases=['Atlas','Prepare','Bake','Composite','Finalize','Ao','Verify'],args=process.argv.slice(2);
if(args.includes('--help')){console.log('V95 geometry into preserved V92 PBR. --dry-run; --phase Atlas|Prepare|Bake|Composite|Finalize|Ao|Verify. TYPE94_PBR_ROOT selects isolated external output.');process.exit(0)}
const selected=args.includes('--phase')?args[args.indexOf('--phase')+1]:null;if(selected&&!phases.includes(selected))throw Error('Unknown phase');
for(const phase of selected?[selected]:phases){
 const python=phase==='Atlas'||phase==='Composite',executable=python?(process.env.PYTHON_EXE||'python'):process.execPath;
 const argv=phase==='Atlas'?['-X','utf8','Taierzhuang1938/_import/Script_Type94PaintAtlasSpaceV96.py']:phase==='Composite'?['-X','utf8','Taierzhuang1938/_blender/Script_Type94TowCompositeV96.py']:['scripts/Script_BlenderMcp.mjs','start','--task','Type94Tankette','--batch','Taierzhuang1938/_blender/Script_Type94TowPbrV96.py','--json'];
 if(args.includes('--dry-run')){console.log(JSON.stringify({executable,args:argv,phase}));continue}
 const result=spawnSync(executable,argv,{cwd:repo,encoding:'utf8',windowsHide:true,env:{...process.env,TYPE94_PBR_PHASE:phase}});process.stdout.write(result.stdout||'');process.stderr.write(result.stderr||'');
 const out=path.join(process.env.TYPE94_PBR_ROOT||'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette/SurfaceV96','Acceptance');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'Log_TowPbr'+phase+'V96.txt'),(result.stdout||'')+(result.stderr||''));
 if(result.error)throw result.error;if(result.status!==0)throw Error('Tow PBR phase failed: '+phase);
 if(!python){const info=JSON.parse(result.stdout);if(info.log)fs.copyFileSync(info.log,path.join(out,'Log_BlenderTowPbr'+phase+'V96.txt'))}
}
