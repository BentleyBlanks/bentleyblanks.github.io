// Fit the bare V5 donkey from its frozen V3 intermediate; preserve prior sources.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const scriptDir=path.dirname(fileURLToPath(import.meta.url));
const project=path.dirname(scriptDir),root=path.dirname(project);
const helper=path.join(root,'scripts/Script_BlenderMcp.mjs');
const destination='C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Donkey/20261024/ReferenceFitV5';
const source='C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Donkey/20261023/ReferenceFitV4/Scene_DonkeyBeforeReferenceFit.blend';
if(!fs.statSync(path.join(root,'.git')).isFile())throw Error('Use an exclusive Git worktree');
if(!fs.existsSync(source))throw Error('Missing preserved V3 source: '+source);
function Control(args,stdio='pipe'){
 return execFileSync(process.execPath,[helper,...args],{cwd:root,encoding:'utf8',stdio,maxBuffer:16*1024*1024});
}
const state=JSON.parse(Control(['status','--json']));
if(state.instances.some(instance=>instance.alive))throw Error('Finish and stop this worktree\'s active Blender before rebuilding');
const instance=JSON.parse(Control(['start','--new','--task','DonkeyRebuild','--json']));
try{
 const temporary=path.join(root,'tmp/Donkey');fs.mkdirSync(temporary,{recursive:true});
 function Run(file){Control(['exec','--port',String(instance.port),'--file',file,'--timeout','1200'],'inherit')}
 const configure=path.join(temporary,'Script_SetProject.py');
 fs.writeFileSync(configure,`import bpy\nbpy.context.scene['DonkeyCartProject']=${JSON.stringify(project.replaceAll('\\','/'))}\n`);
 Run(configure);Run(path.join(scriptDir,'Script_DonkeyReferenceBake.py'));
 // Opening a .blend changes the UI context; export in a separate MCP request.
 function Shared(file){
  const driver=path.join(temporary,'Script_RunShared.py');
  fs.writeFileSync(driver,`from pathlib import Path\nfile=Path(${JSON.stringify(path.join(scriptDir,file).replaceAll('\\','/'))})\nexec(compile(file.read_text(encoding='utf-8'),file.name,'exec'),{'DonkeyAssetName':'Donkey'})\n`);
  Run(driver);
 }
 Run(path.join(scriptDir,'Script_DonkeyReferenceRefine.py'));
 Shared('Script_DonkeyCartAnimate.py');Shared('Script_DonkeyCartExport.py');
 execFileSync(process.env.DONKEY_CART_PYTHON||'python',[path.join(scriptDir,'Script_DonkeyCartPack.py'),
  '--input',destination+'/Model_DonkeyUnpacked.glb','--output',path.join(project,'Model/Donkey/Model_Donkey.glb')],{cwd:root,stdio:'inherit'});
 Shared('Script_DonkeyCartVerify.py');Run(path.join(scriptDir,'Script_DonkeyFinalize.py'));
 console.log('Rebuilt '+path.join(project,'Model/Donkey/Model_Donkey.glb'));
}finally{
 Control(['stop','--port',String(instance.port),'--json'],'inherit');
 Control(['status','--scan','--json'],'inherit');
}
