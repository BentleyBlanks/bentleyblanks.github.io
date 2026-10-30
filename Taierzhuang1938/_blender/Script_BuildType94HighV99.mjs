// Immutable V96 surface plus the separate V98 lug; use an external replay root.
import fs from'node:fs';import path from'node:path';import{spawnSync}from'node:child_process';import{fileURLToPath}from'node:url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),root=process.env.TYPE94_HIGH_ROOT||'C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette/SurfaceV99',args=process.argv.slice(2);
const phases=[['Atlas','_import/Script_Type94LugAtlasV99.py'],['Bake','_blender/Script_Type94LugPbrV99.py'],['Composite','_import/Script_Type94LugCompositeV99.py'],['Finalize','_blender/Script_Type94LugPbrV99.py'],['Verify','_import/Script_VerifyType94LugPbrV99.py']];
for(const[name,file]of phases){
 const native=name==='Bake'||name==='Finalize',exe=native?process.execPath:(process.env.PYTHON_EXE||'python'),argv=native?['scripts/Script_BlenderMcp.mjs','start','--task','Type94Tankette','--batch','Taierzhuang1938/'+file,'--json']:['-X','utf8','Taierzhuang1938/'+file];if(args.includes('--dry-run')){console.log(JSON.stringify({name,exe,argv,root}));continue}
 const r=spawnSync(exe,argv,{cwd:repo,env:{...process.env,TYPE94_HIGH_ROOT:root,TYPE94_LUG_PHASE:name},encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});process.stdout.write(r.stdout||'');process.stderr.write(r.stderr||'');if(r.error)throw r.error;if(r.status!==0)throw Error(name+' failed');if(native){const info=JSON.parse(r.stdout);fs.copyFileSync(info.log,path.join(root,'Acceptance','Log_'+name+'V99.txt'))}
}
