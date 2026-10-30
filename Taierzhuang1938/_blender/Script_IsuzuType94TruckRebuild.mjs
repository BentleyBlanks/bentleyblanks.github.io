// Rebuild this single truck, preserve its high source, package the game derivative,
// then reopen the actual delivered GLB. Nothing here publishes or claims reference acceptance.
import fs from 'node:fs/promises';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const source='C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/IsuzuType94Truck';
const qa=path.join(root,'tmp/IsuzuType94Truck');
if(process.argv.includes('--help')){
 console.log('node Taierzhuang1938/_blender/Script_IsuzuType94TruckRebuild.mjs [--textures] [--no-renders] [--mcp-port N] [--authoring-timeout SECONDS]\nBuilds only IsuzuType94Truck, preserves the high source, losslessly packages PBR and reimports the real game GLB. BlenderMCP is stopped in finally. --textures regenerates the eight deterministic physical PBR sets. --no-renders skips optional Cycles studio preview images; all geometry, image, motion and real reimport checks still run. --mcp-port reserves the same explicit worktree-owned port for both fresh Blender stages; ownership checks remain active. --authoring-timeout sets60..3600seconds for the authoring request (default900). Reference acceptance is a separate visual review.');
 process.exit(0);
}
if(process.argv.includes('--motions-only'))throw new Error('The delta-export option is no longer supported; run the complete reconstruction command instead.');
const portIndex=process.argv.indexOf('--mcp-port'),mcpPort=portIndex<0?null:Number(process.argv[portIndex+1]);
if(portIndex>=0&&(!Number.isInteger(mcpPort)||mcpPort<1024||mcpPort>65535))throw new Error('--mcp-port requires an integer in1024..65535');
const portArgs=mcpPort===null?[]:['--port',String(mcpPort)];
const timeoutIndex=process.argv.indexOf('--authoring-timeout'),authoringTimeout=timeoutIndex<0?900:Number(process.argv[timeoutIndex+1]);
if(!Number.isInteger(authoringTimeout)||authoringTimeout<60||authoringTimeout>3600)throw new Error('--authoring-timeout requires seconds in60..3600');
await fs.mkdir(qa,{recursive:true});
async function Run(command,args,log){
 return new Promise((resolve,reject)=>{
  const child=spawn(command,args,{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});let output='';
  child.stdout.on('data',d=>output+=d);child.stderr.on('data',d=>output+=d);
  child.on('error',reject);child.on('close',async code=>{await fs.writeFile(path.join(qa,log),output);code===0?resolve(output):reject(new Error(`${command} failed (${code}); see ${path.join(qa,log)}\n${output.slice(-1600)}`))});
 });
}
const mcp=path.join(root,'scripts/Script_BlenderMcp.mjs');
const bind=`import os, runpy; os.environ['ISUZU_WORKSPACE'] = ${JSON.stringify(root.replaceAll('\\','/'))}; os.environ['ISUZU_SKIP_STUDIO_RENDERS'] = '${process.argv.includes('--no-renders')?'1':'0'}'`;
const Recipe=name=>`runpy.run_path(${JSON.stringify(path.join(root,'Taierzhuang1938/_blender',name).replaceAll('\\','/'))}, run_name='__main__')`;
try{
 let textures=true;try{await fs.access(path.join(source,'Textures/Texture_IsuzuRustOrm.png'))}catch{textures=false}
 if(!textures||process.argv.includes('--textures')){console.log('Authoring eight physical PBR sets');await Run('python',[path.join(root,'Taierzhuang1938/_blender/Script_IsuzuType94TruckTextures.py')],'Log_RebuildTextures.txt')}
 const highFile=path.join(source,'Scene_IsuzuType94Truck.blend');
 const startArgs=[mcp,'start','--task','IsuzuType94TruckRebuild','--timeout','360',...portArgs];
 try{await fs.access(highFile);startArgs.push('--blend',highFile)}catch{}
 console.log('Starting this worktree\'s dedicated BlenderMCP');await Run(process.execPath,startArgs,'Log_RebuildStart.txt');
 // Keep this request short and both authoring stages in the same scene. The
 // grey export adds triangulation AFTER saving its editable checkpoint, so a
 // cold-grey continuation is not the canonical PBR input. A single request
 // also avoids protocol re-probing during Blender's heavy post-export redraw.
 console.log('Building Grey and Pbr in the same owned scene');
 await Run(process.execPath,[mcp,'exec','--code',`${bind}; ${Recipe('Script_IsuzuType94TruckBuild.py')}; import bpy; bpy.context.view_layer.update(); ${Recipe('Script_IsuzuType94TruckPbr.py')}`,'--timeout',String(authoringTimeout)],'Log_RebuildAuthoring.txt');
 await Run(process.execPath,[mcp,'stop'],'Log_RebuildAuthoringStop.txt');
 const {CompressEmbeddedTextures,InspectEmbeddedTextures}=await import('../_import/Script_CompressEmbeddedTextures.mjs');
 await Run(process.execPath,[path.join(root,'Taierzhuang1938/_blender/Script_IsuzuType94TruckClean.mjs')],'Log_RebuildGeometryCleanup.txt');
 const metal=path.join(root,'Taierzhuang1938/_blender/Script_IsuzuType94TruckMetalWear.py');
 await Run('python',[metal,'--glb',path.join(root,'Taierzhuang1938/Model/IsuzuType94Truck/Model_IsuzuType94Truck.glb'),'--report',path.join(qa,'Data_MetalWearRuntime.json')],'Log_RebuildMetalRuntime.txt');
 await Run('python',[metal,'--glb',path.join(source,'Exports/Model_IsuzuType94TruckHigh.glb'),'--report',path.join(qa,'Data_MetalWearHigh.json')],'Log_RebuildMetalHigh.txt');
 // Apply broad material dirt only after the immutable geometry islands have
 // their final positions. The same field is packed into editable natives.
 const weather=path.join(root,'Taierzhuang1938/_blender/Script_IsuzuType94TruckWeathering.py');
 await Run('python',[weather,'--glb',path.join(root,'Taierzhuang1938/Model/IsuzuType94Truck/Model_IsuzuType94Truck.glb'),'--report',path.join(qa,'Data_WeatheringRuntime.json')],'Log_RebuildWeatheringRuntime.txt');
 await Run('python',[weather,'--glb',path.join(source,'Exports/Model_IsuzuType94TruckHigh.glb'),'--report',path.join(qa,'Data_WeatheringHigh.json')],'Log_RebuildWeatheringHigh.txt');
 const file=path.join(root,'Taierzhuang1938/Model/IsuzuType94Truck/Model_IsuzuType94Truck.glb');
 const bytes=await fs.readFile(file),packed=await CompressEmbeddedTextures(bytes);await fs.writeFile(file,packed);
 await fs.writeFile(path.join(qa,'Data_RebuildTexturePackaging.json'),JSON.stringify({before:bytes.length,after:packed.length,inspection:await InspectEmbeddedTextures(packed)},null,2));
 await Run(process.execPath,[path.join(root,'Taierzhuang1938/_blender/Script_IsuzuType94TruckSurfaceAudit.mjs')],'Log_RebuildSurfacePixels.txt');
 // Reimport is deliberately independent of the authoring scene. Starting a
 // fresh owned process avoids the busy UI left by the large runtime save.
 console.log('Reopening the actual packaged GLB');await Run(process.execPath,[mcp,'start','--blend',highFile,'--task','IsuzuType94TruckVerify','--timeout','360',...portArgs],'Log_RebuildVerifyStart.txt');
 await Run(process.execPath,[mcp,'exec','--code',`${bind}; ${Recipe('Script_IsuzuType94TruckVerify.py')}`,'--timeout','900'],'Log_RebuildVerify.txt');
 await Run(process.execPath,[path.join(root,'Taierzhuang1938/_blender/Script_IsuzuType94TruckRecord.mjs')],'Log_RebuildIdentity.txt');
 console.log('Technical rebuild complete. Strict photographic matching remains a separate acceptance gate.');
}finally{
 // Each authoring/verification stage saves its own task-scoped source. A
 // failed startup must never save whatever unrelated file happened to open.
 console.log(await Run(process.execPath,[mcp,'stop'],'Log_RebuildStop.txt'));
 console.log(await Run(process.execPath,[mcp,'status','--scan'],'Log_RebuildStatus.txt'));
}
