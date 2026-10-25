// Fit the bare V37 donkey from its frozen V3 intermediate; preserve prior sources.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

const scriptDir=path.dirname(fileURLToPath(import.meta.url));
const project=path.dirname(scriptDir),root=path.dirname(project);
const helper=path.join(root,'scripts/Script_BlenderMcp.mjs');
const source='C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Donkey/20261023/ReferenceFitV4/Scene_DonkeyBeforeReferenceFit.blend';
if(!fs.statSync(path.join(root,'.git')).isFile())throw Error('Use an exclusive Git worktree');
if(!fs.existsSync(source))throw Error('Missing preserved V3 source: '+source);
if(!fs.existsSync(path.join(scriptDir,'Data_DonkeyJointFitV35.json')))throw Error('Missing authored V35 joint-fit recipe');
function Control(args,stdio='pipe'){
 return execFileSync(process.execPath,[helper,...args],{cwd:root,encoding:'utf8',stdio,maxBuffer:16*1024*1024});
}
const state=JSON.parse(Control(['status','--json']));
if(state.instances.some(instance=>instance.alive))throw Error('Finish and stop this worktree\'s active Blender before rebuilding');
const temporary=path.join(root,'tmp/Donkey');fs.mkdirSync(temporary,{recursive:true});
const resumeIndex=process.argv.indexOf('--resume');
const argumentsFile=path.join(temporary,'Data_BatchRebuildArguments.json');
const batchArgs=resumeIndex>=0?['--resume',path.resolve(process.argv[resumeIndex+1])]:[];
if(process.argv.includes('--refresh-leg-pigment'))batchArgs.push('--refresh-leg-pigment');
if(process.argv.includes('--measurements-only'))batchArgs.push('--measurements-only');
fs.writeFileSync(argumentsFile,JSON.stringify(batchArgs));
try{
 Control(['start','--batch',path.join(scriptDir,'Script_DonkeyRebuildBatch.py'),'--batch-args',argumentsFile,'--task','DonkeyRebuild','--json'],'inherit');
 console.log('Rebuilt '+path.join(project,'Model/Donkey/Model_Donkey.glb'));
}finally{
 Control(['status','--scan','--json'],'inherit');
}
