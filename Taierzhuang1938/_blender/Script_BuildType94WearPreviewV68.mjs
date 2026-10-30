import path from'node:path';import{spawnSync}from'node:child_process';import{fileURLToPath}from'node:url';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),python=process.env.PYTHON_EXE||'python',dry=process.argv.includes('--dry-run');
if(process.argv.includes('--help')){console.log('Rebuild locked-UV wear study V68 from preserved V66.\nUsage: node Taierzhuang1938/_blender/Script_BuildType94WearPreviewV68.mjs [--dry-run]\nRequires owned Blender batch launcher and Python NumPy/Pillow.');process.exit(0)}
if(process.argv.slice(2).some(a=>a!=='--dry-run'))throw Error('Unknown argument');
function Run(exe,args,env={}){if(dry){console.log(JSON.stringify({exe,args,phase:env.TYPE94_WEAR_PHASE}));return}const r=spawnSync(exe,args,{cwd:repo,env:{...process.env,...env},stdio:'inherit',windowsHide:true});if(r.error)throw r.error;if(r.status!==0)throw Error('Wear stage failed')}
function Blender(phase){Run(process.execPath,['scripts/Script_BlenderMcp.mjs','start','--task','Type94Tankette','--batch','Taierzhuang1938/_blender/Script_Type94WearPreviewV68.py','--json'],{TYPE94_WEAR_PHASE:phase})}
Blender('Prepare');Run(python,['Taierzhuang1938/_blender/Script_Type94WearRasterV68.py']);Blender('Apply');Blender('Normal');Blender('Finalize');
