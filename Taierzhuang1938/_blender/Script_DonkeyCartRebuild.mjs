// Rebuild only from an exclusive worktree; manage and close our own Blender PID.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const scriptDir=path.dirname(fileURLToPath(import.meta.url));
const project=path.dirname(scriptDir),root=path.dirname(project);
const helper=path.join(root,'scripts','Script_BlenderMcp.mjs');
const source='C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/DonkeyCart/20261020';
if(!fs.statSync(path.join(root,'.git')).isFile())throw Error('Run this script from an exclusive Git worktree');
function Control(args,stdio='pipe'){
 return execFileSync(process.execPath,[helper,...args],{cwd:root,encoding:'utf8',stdio,maxBuffer:16*1024*1024});
}
const state=JSON.parse(Control(['status','--json']));
if(state.instances.some(instance=>instance.alive))throw Error('This worktree already has an active Blender; finish and stop it before rebuilding');
for(const file of ['ReuseAudit/Scene_Round14Candidate.blend','SourceTextures/Texture_DonkeyShortFurSource.png','SourceTextures/Texture_DonkeyCartWeatheredElmSource.png']){
 if(!fs.existsSync(path.join(source,file)))throw Error('Missing preserved source: '+path.join(source,file));
}
const instance=JSON.parse(Control(['start','--new','--task','DonkeyCartRebuild','--json']));
try{
 const temporary=path.join(root,'tmp','DonkeyCart');fs.mkdirSync(temporary,{recursive:true});
 const configuration=path.join(temporary,'Script_SetDonkeyCartProject.py');
 fs.writeFileSync(configuration,`import bpy\nbpy.context.scene['DonkeyCartProject']=${JSON.stringify(project.replaceAll('\\','/'))}\n`, 'utf8');
 function Run(file){Control(['exec','--port',String(instance.port),'--file',file,'--timeout','1200'],'inherit')}
 Run(configuration);
 for(const file of ['Script_DonkeyCartBake.py','Script_DonkeyCartAnimate.py','Script_DonkeyCartIntegrity.py','Script_DonkeyCartExport.py'])Run(path.join(scriptDir,file));
 execFileSync(process.env.DONKEY_CART_PYTHON||'python',[path.join(scriptDir,'Script_DonkeyCartPack.py')],{cwd:root,stdio:'inherit'});
 Run(path.join(scriptDir,'Script_DonkeyCartVerify.py'));
 Run(path.join(scriptDir,'Script_DonkeyCartDescribe.py'));
 Run(path.join(scriptDir,'Script_DonkeyCartFinalize.py'));
 console.log('Rebuilt '+path.join(project,'Model/DonkeyCart/Model_DonkeyCart.glb'));
}finally{
 Control(['stop','--port',String(instance.port),'--save','--json'],'inherit');
 Control(['status','--scan','--json'],'inherit');
}
