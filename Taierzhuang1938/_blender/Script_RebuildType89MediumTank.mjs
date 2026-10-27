// Reproducible source pair -> macro PBR -> fine film/cast surface -> scoped AO.
// Produces a validated local candidate; publication remains a separate action.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {LoadGlb,ReadAccessor} from '../_import/Script_LugouGlbPose.mjs';
const repo=path.resolve(import.meta.dirname,'../..'),project=path.join(repo,'Taierzhuang1938');
const Arg=(name,fallback)=>process.argv.find(v=>v.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;
if(process.argv.includes('--help')){
 console.log('Build this single reference vehicle into ignored local review output.\n --finish-from=<macro build JSON> reuses an already completed full macro bake\n --source-subdir=Prototypes/Type89ReleaseCandidate\n --review-subdir=Type89ReleaseCandidate\n --revision=SurfaceV12\nSources remain under the prescribed OneDrive model directory; no canonical asset is overwritten.');process.exit(0);
}
const sourceRoot='C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type89MediumTank';
const sourceSubdir=Arg('source-subdir','Prototypes/Type89ReleaseCandidate'),reviewSubdir=Arg('review-subdir','Type89ReleaseCandidate'),revision=Arg('revision','SurfaceV12');
const source=path.join(sourceRoot,sourceSubdir),review=path.join(project,'_shots/Type89MediumTank',reviewSubdir),out=path.join(repo,'tmp/Type89Rebuild',reviewSubdir);
for(const [root,file]of [[sourceRoot,source],[path.join(project,'_shots/Type89MediumTank'),review],[path.join(repo,'tmp/Type89Rebuild'),out]])assert(!path.relative(root,file).startsWith('..')&&!path.isAbsolute(path.relative(root,file)),'Output must remain in its designated directory');
fs.mkdirSync(out,{recursive:true});fs.mkdirSync(review,{recursive:true});
const Read=file=>JSON.parse(fs.readFileSync(file,'utf8')),Write=(file,data)=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(data,null,2)+'\n')},Sha=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const state={runnerPid:process.pid,startedAt:new Date().toISOString(),checks:[]};
function State(phase,extra={}){Object.assign(state,{phase,...extra});Write(path.join(out,'Data_RebuildState.json'),state);console.log(phase);}
function Run(label,args){State(label);const log=path.join(out,'Log_'+label+'.txt'),fd=fs.openSync(log,'w');let result;try{result=spawnSync(process.execPath,args,{cwd:repo,stdio:['ignore',fd,fd],windowsHide:true});}finally{fs.closeSync(fd);}state.checks.push({label,exitCode:result.status,log});assert.equal(result.status,0,'Inspect '+log);}
function Batch(label,script,args){const argsFile=path.join(out,'Data_'+label+'Args.json');Write(argsFile,args);Run(label,['scripts/Script_BlenderMcp.mjs','start','--batch',script,'--batch-args',argsFile,'--task','Type89'+label]);}
function Counts(file){const glb=LoadGlb(file),g=glb.json;let triangles=0;function Visit(i){const n=g.nodes[i];if(n.mesh!==undefined)for(const p of g.meshes[n.mesh].primitives)triangles+=ReadAccessor(glb,p.indices).count/3;for(const c of n.children??[])Visit(c);}for(const i of g.scenes[g.scene??0].nodes)Visit(i);return{triangles,triangulation:g.asset.extras?.Type89TriangulationAccounting?.removedRenderedZeroAreaTriangles??0,zero:(g.asset.extras?.Type89ZeroAreaCleanup??[]).reduce((s,r)=>s+r.removedRenderedTriangles,0),enclosed:g.asset.extras?.Type89EnclosedShoeCleanup?.removedRenderedTriangles??0};}
try{
 let macroFile=Arg('finish-from');
 if(!macroFile){
  for(const quality of ['High','Game'])Run(quality+'Gray',['Taierzhuang1938/_blender/Script_BuildType89MediumTank.mjs',`--quality=${quality}`,`--source-subdir=${sourceSubdir}`,`--review-subdir=${reviewSubdir}`,'--no-render']);
  Run('MacroPbr',['Taierzhuang1938/_blender/Script_BuildType89MediumTank.mjs','--stage=Pbr',`--source-subdir=${sourceSubdir}`,`--review-subdir=${reviewSubdir}`,`--revision=${revision}Macro`,'--stage-only','--no-render']);
  macroFile=path.join(review,'Data_Pbr'+revision+'MacroBuild.json');
 }
 const macro=Read(path.resolve(macroFile));assert(!macro.probe&&macro.stagedOnly,'Only a complete staged macro bake can be finished');
 const macroReview=path.dirname(macro.gameGlb),track=path.join(macroReview,'Data_TrackPath.json'),motionPath=Read(track),gameGray=Read(path.join(macroReview,'Data_GameGrayBuild.json')),highGray=Read(path.join(macroReview,'Data_HighGrayBuild.json'));
 const counts=Counts(macro.gameGlb),contract=Read(path.join(project,'Model/Type89MediumTank/Data_ReferenceContract.json'));
 Object.assign(contract,{geometryVersion:macro.geometryVersion,materialRevision:revision,runtimeTriangleTarget:400000,runtimeTriangleCeiling:420000,runtimeRenderedTriangles:counts.triangles,sourceTrianglesBeforeExportCleanup:highGray.triangles,selectedGameSourceTrianglesBeforeCleanup:gameGray.triangles,selectedGameVisibleSourceTrianglesBeforeZeroAreaCleanup:gameGray.triangles-counts.enclosed,exportRemovedZeroAreaTriangles:counts.zero,exportRemovedWhollyEnclosedTriangles:counts.enclosed,budgetPolicy:'PreserveSelectedVisibleGameTopologyWithinFivePercentWithCertifiedEnclosure',linksPerSide:motionPath.linksPerSide,castingPitchM:motionPath.pitchM,materialCount:9,activePackedImages:25,userApproved:false,status:'CandidateValidation'});
 contract.exportTriangulationZeroAreaTriangles=counts.triangulation;
 const contractFile=path.join(out,'Data_CandidateContract.json');Write(contractFile,contract);
 Run('MacroRaw',['Taierzhuang1938/Script_Type89MediumTankTest.mjs',`--file=${macro.gameGlb}`,`--contract=${contractFile}`]);
 const fine=[];
 for(const quality of ['Game','High']){
  const blend=path.join(source,'Fine',`Scene_Type89MediumTank${quality}Fine.blend`),glb=path.join(review,`Model_Type89MediumTank${quality}Fine.glb`);
  Batch(quality+'Fine','Taierzhuang1938/_blender/Script_Type89MicroSurface.py',[`--quality=${quality}`,`--geometry-version=${macro.geometryVersion}`,`--revision=${revision}`,'--working=true',`--input=${macro[quality.toLowerCase()+'Blend']}`,`--blend=${blend}`,`--export=${glb}`,`--report=${path.join(out,'Data_'+quality+'Fine.json')}`,`--maps=${path.join(source,'Fine/Maps')}`,'--tile-slope=.11','--film-tile-m=.168','--cast-tile-m=.224']);
  Run(quality+'FineTangents',['Taierzhuang1938/_blender/Script_Type89SurfaceTangents.mjs',`--baseline=${macro[quality.toLowerCase()+'Glb']}`,`--file=${glb}`,`--report=${path.join(out,'Data_'+quality+'FineTangents.json')}`]);fine.push({quality,blend,glb});
 }
 const highFine=fine.find(row=>row.quality==='High'),aoSource=path.join(source,'PoseAo/Scene_Type89MediumTankHighPoseAoSource.blend');
 Batch('HighAoSource','Taierzhuang1938/_blender/Script_Type89PoseOcclusion.py',[`--input=${highFine.blend}`,`--blend=${aoSource}`,`--export=${path.join(review,'Model_Type89MediumTankHighAoSource.glb')}`,`--report=${path.join(out,'Data_HighAoSource.json')}`,`--maps=${path.join(source,'PoseAo/HighSourceMaps')}`]);
 const finalSource=path.join(source,'Finished'),rows=[];
 for(const row of fine){
  const {quality}=row,blend=path.join(finalSource,`Scene_Type89MediumTank${quality}Pbr.blend`),glb=path.join(review,`Model_Type89MediumTank${quality}Pbr.glb`);
  Batch(quality+'Ao','Taierzhuang1938/_blender/Script_Type89PoseOcclusionProject.py',[`--source=${aoSource}`,`--target=${row.blend}`,`--quality=${quality}`,`--revision=${revision}`,'--working=true',`--blend=${blend}`,`--export=${glb}`,`--report=${path.join(out,'Data_'+quality+'Ao.json')}`,`--maps=${path.join(source,'PoseAo',quality+'Maps')}`]);
  Run(quality+'AoTangents',['Taierzhuang1938/_blender/Script_Type89SurfaceTangents.mjs',`--baseline=${row.glb}`,`--file=${glb}`,`--report=${path.join(out,'Data_'+quality+'AoTangents.json')}`]);
  Run(quality+'AoAudit',['Taierzhuang1938/_blender/Script_Type89PoseAoAudit.mjs',`--baseline=${row.glb}`,`--file=${glb}`,`--quality=${quality}`,`--out=${path.join(out,quality+'AoAudit')}`]);
  rows.push({quality,blend,glb});
 }
 const game=rows.find(row=>row.quality==='Game');Run('Pack',['Taierzhuang1938/_blender/Script_Type89Package.mjs',`--file=${game.glb}`,'--effort=1']);assert.deepEqual(Counts(game.glb),counts,'Fine/AO/packing changed exported triangle accounting');
 Batch('SourceReopen','Taierzhuang1938/_blender/Script_Type89SourceAudit.py',[`--source-dir=${finalSource}`,`--contract=${contractFile}`]);
 if(path.resolve(track)!==path.resolve(review,'Data_TrackPath.json'))fs.copyFileSync(track,path.join(review,'Data_TrackPath.json'));
 for(const row of rows)Batch(row.quality+'FinalMotion','Taierzhuang1938/_blender/Script_Type89ImportAudit.py',[row.glb,`--track-path=${track}`,`--out=${path.join(out,'Data_'+row.quality+'FinalMotion.json')}`]);
 Run('FinalRaw',['Taierzhuang1938/Script_Type89MediumTankTest.mjs',`--file=${game.glb}`,`--contract=${contractFile}`]);
 const web='/'+path.relative(repo,game.glb).replaceAll('\\','/'),webTrack='/'+path.relative(repo,path.join(review,'Data_TrackPath.json')).replaceAll('\\','/');
 Run('Renderer',['Taierzhuang1938/Script_Type89MediumTankBrowserTest.mjs',`--model=${web}`,`--track-path=${webTrack}`]);
 for(const row of rows)Object.assign(row,{sha256:Sha(row.glb),sourceSha256:Sha(row.blend)});
 const report={status:'ValidatedCandidate_VisualReviewRequired',geometryVersion:macro.geometryVersion,geometryRecipe:macro.geometryRecipeSha256,materialRevision:revision,macroBuild:path.resolve(macroFile),contractFile,rows,trackPath:path.join(review,'Data_TrackPath.json'),counts,checks:state.checks,canonicalReplaced:false,published:false};Write(path.join(out,'Data_FinishedBuild.json'),report);State('ReadyForVisualReview',{report:path.join(out,'Data_FinishedBuild.json'),terminal:true});
}catch(error){State('Failed',{error:String(error),stack:error.stack,terminal:true});process.exitCode=1;}
