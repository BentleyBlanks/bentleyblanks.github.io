// Reproducible external BN/BS inputs -> editable high/game .blend -> packaged GLB.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
const scriptRoot=path.dirname(fileURLToPath(import.meta.url));
const repoRoot=path.resolve(scriptRoot,'../..');
const argumentsList=process.argv.slice(2);
function Option(name,fallback){return argumentsList.find(value=>value.startsWith(`--${name}=`))?.slice(name.length+3)??fallback;}
const sourceRoot=Option('source-root','C:/Users/Bentl/OneDrive/AI/Models/Blender/PatchedTimberBed20261020');
const reviewRoot=path.resolve(repoRoot,Option('review-root','tmp/BedBnBs50kAcceptance'));
const outputFile=path.resolve(repoRoot,Option('output','Model/PatchedTimberBed/Model_PatchedTimberBed.glb'));
const stage=Option('stage','all');
const mcpPort=Option('mcp-port',null);
if(!['all','wood-reference','uv-cloth','wood-texture','craft','reference-fidelity'].includes(stage))throw new Error('Unsupported bed rebuild stage');
if(mcpPort!==null&&(!/^\d+$/.test(mcpPort)||stage==='all'))throw new Error('Use an explicit managed MCP port for a single refresh stage');
fs.mkdirSync(reviewRoot,{recursive:true});
for(const input of ['Inputs/BN/Restored/Bed_BN_Complete_Editable_Checkpoint.blend','Inputs/BS/BedBS/BS_material_only.blend','Inputs/BS/BedBS/BR_lowfrequency_corner_colors.npz','Inputs/BS/BedBS/BS_BaseColor.webp','Inputs/BS/BedBS/BS_Normal.webp','Inputs/BS/BedBS/BS_fiber_bundle_Base_1024.png']){
 if(!fs.existsSync(path.join(sourceRoot,input)))throw new Error(`Missing read-only input: ${path.join(sourceRoot,input)}`);
}
if(stage!=='all')for(const filename of ['Scene_PatchedTimberBedHigh.blend','Scene_PatchedTimberBedGame.blend']){
 if(!fs.existsSync(path.join(sourceRoot,filename)))throw new Error(`Wood refresh requires the saved editable project: ${path.join(sourceRoot,filename)}`);
}
if(stage!=='all'&&!fs.existsSync(path.join(reviewRoot,'Data_PreviousAsset.json'))){
 fs.copyFileSync(path.join(scriptRoot,'Data_Asset.json'),path.join(reviewRoot,'Data_PreviousAsset.json'));
}
function Run(command,args){
 const result=spawnSync(command,args,{cwd:repoRoot,stdio:'inherit',windowsHide:true});
 if(result.error)throw result.error;
 if(result.status!==0)throw new Error(`${path.basename(command)} exited ${result.status}`);
}
const argumentFile=path.join(reviewRoot,'Data_BlenderArguments.json');
fs.writeFileSync(argumentFile,JSON.stringify(['--source-root',sourceRoot,'--review-root',reviewRoot,'--stage',stage]));
if(mcpPort!==null){
 const mcpScript=path.join(reviewRoot,'Script_RunBedMcpRefresh.py');
 const bakeFile=path.join(scriptRoot,'Script_PatchedTimberBedBake.py');
 const argv=[bakeFile,'--','--source-root',sourceRoot,'--review-root',reviewRoot,'--stage',stage];
 fs.writeFileSync(mcpScript,`import bpy,sys,runpy,importlib\nfrom pathlib import Path\nassert Path(bpy.data.filepath).resolve().parent==Path(${JSON.stringify(sourceRoot)}).resolve(), 'MCP scene is outside this bed task'\nimportlib.invalidate_caches()\nfor name in list(sys.modules):\n if name.startswith('Script_PatchedTimberBed'):sys.modules.pop(name)\npreviousArguments=list(sys.argv)\ntry:\n sys.argv=${JSON.stringify(argv)}\n runpy.run_path(${JSON.stringify(bakeFile)},run_name='__main__')\nfinally:\n sys.argv=previousArguments\n`);
 Run(process.execPath,['scripts/Script_BlenderMcp.mjs','exec','--port',mcpPort,'--file',mcpScript,'--timeout','900']);
}else Run(process.execPath,['scripts/Script_BlenderMcp.mjs','start','--batch',path.join(scriptRoot,'Script_PatchedTimberBedBake.py'),'--batch-args',argumentFile,'--task','PatchedTimberBedRebuild']);
if(stage==='all'){
 fs.writeFileSync(argumentFile,JSON.stringify(['--source-root',sourceRoot,'--review-root',reviewRoot,'--stage','uv-cloth']));
 Run(process.execPath,['scripts/Script_BlenderMcp.mjs','start','--batch',path.join(scriptRoot,'Script_PatchedTimberBedBake.py'),'--batch-args',argumentFile,'--task','PatchedTimberBedMetricSurfaces']);
 fs.writeFileSync(argumentFile,JSON.stringify(['--source-root',sourceRoot,'--review-root',reviewRoot,'--stage','reference-fidelity']));
 Run(process.execPath,['scripts/Script_BlenderMcp.mjs','start','--batch',path.join(scriptRoot,'Script_PatchedTimberBedBake.py'),'--batch-args',argumentFile,'--task','PatchedTimberBedCraft']);
}
Run(Option('python','python'),['-B',path.join(scriptRoot,'Script_PatchedTimberBedPack.py'),path.join(reviewRoot,'Model_PatchedTimberBedStandard.glb'),outputFile,'--bs-dir',path.join(sourceRoot,'Inputs/BS/BedBS'),'--receipt',path.join(reviewRoot,'Data_PackReport.json')]);
if(argumentsList.includes('--comparison')){
 fs.writeFileSync(argumentFile,JSON.stringify(['--source-root',sourceRoot,'--review-root',reviewRoot]));
 Run(process.execPath,['scripts/Script_BlenderMcp.mjs','start','--batch',path.join(scriptRoot,'Script_PatchedTimberBedComparison.py'),'--batch-args',argumentFile,'--task','OriginalBedComparison']);
}
// Successful packaging leaves the editable High/Game projects and protected
// Inputs. These named files are reproducible intermediate checkpoints only.
for(const filename of ['Scene_OriginalBed.blend','Scene_BedBakeProgress.blend','Scene_WoodFrameTransfer.blend','Scene_SurfaceRevisionTransfer.blend'])fs.rmSync(path.join(sourceRoot,filename),{force:true});
const intermediateGlb=path.join(reviewRoot,'Model_PatchedTimberBedStandard.glb');
if(path.resolve(intermediateGlb).toLowerCase()!==outputFile.toLowerCase())fs.rmSync(intermediateGlb,{force:true});
console.log(`Rebuilt complete GLB: ${outputFile}`);
