// Rebuild the game derivative from the hash-protected finished high author.
// Outputs are isolated; this command never writes the canonical asset itself.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";

const repo=path.resolve(import.meta.dirname,"../.."),project=path.join(repo,"Taierzhuang1938");
const recipePath=path.join(project,"Model/NakajimaKi4/Data_ReleaseRecipe.json");
const recipe=JSON.parse(fs.readFileSync(recipePath,"utf8"));
const Hash=file=>crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const highSource=recipe.highSource.path;
if(Hash(highSource)!==recipe.highSource.sha256)throw Error("Finished high source differs from the release recipe");
const stamp=new Date().toISOString().replaceAll(/[-:.TZ]/g,"");
const sourceRoot=path.join(path.dirname(highSource),"Rebuilds","Game_"+stamp);
const assetRoot=path.join(repo,"tmp/NakajimaKi4","RebuiltGame_"+stamp);
if(fs.existsSync(sourceRoot)||fs.existsSync(assetRoot))throw Error("Rebuild output already exists");
fs.mkdirSync(sourceRoot,{recursive:true});fs.mkdirSync(assetRoot,{recursive:true});
for(const name of ["Textures","Exports","Game","Evidence"])fs.mkdirSync(path.join(sourceRoot,name));
fs.mkdirSync(path.join(assetRoot,"Evidence"));
fs.copyFileSync(highSource,path.join(sourceRoot,"Scene_NakajimaKi4.blend"));
fs.cpSync(path.join(path.dirname(highSource),"Textures"),path.join(sourceRoot,"Textures"),{recursive:true});
fs.copyFileSync(recipe.highExport.path,path.join(sourceRoot,"Exports/Model_NakajimaKi4High.glb"));
const seed={stage:"RebuildFromFinishedHighAuthor",sourceSha256:recipe.highSource.sha256,highGlbSha256:Hash(recipe.highExport.path)};
fs.writeFileSync(path.join(assetRoot,"Evidence/Data_ReleaseHigh.json"),JSON.stringify(seed,null,2));
const env={...process.env,KI4_RELEASE_ASSET_ROOT:assetRoot,KI4_RELEASE_SOURCE_ROOT:sourceRoot,
  KI4_ASSET_ROOT:assetRoot,KI4_SOURCE_ROOT:sourceRoot,KI4_AO_FIELD_REPORT:path.join(assetRoot,"Evidence/Data_AoFieldAgreement.json")};
function Run(executable,args){
 const result=spawnSync(executable,args,{cwd:repo,env,encoding:"utf8",windowsHide:true,maxBuffer:64*1024*1024});
 if(result.stdout)process.stdout.write(result.stdout);if(result.stderr)process.stderr.write(result.stderr);
 if(result.status!==0)throw Error(`${path.basename(executable)} failed: ${result.status}`);
}
const mcp=path.join(repo,"scripts/Script_BlenderMcp.mjs");
const ExecFile=file=>Run(process.execPath,[mcp,"exec","--file",file,"--timeout","1200"]);
let started=false;
try{
 Run(process.execPath,[mcp,"start",path.join(sourceRoot,"Scene_NakajimaKi4.blend"),"--task","NakajimaKi4"]);started=true;
 const settings={KI4_RELEASE_ASSET_ROOT:assetRoot,KI4_RELEASE_SOURCE_ROOT:sourceRoot,KI4_RELEASE_STAGE:"derive",
   KI4_RELEASE_RESUME:"0",KI4_RELEASE_REMERGE:"0"};
 Run(process.execPath,[mcp,"exec","--code","import os; os.environ.update("+JSON.stringify(settings)+")"]);
 ExecFile("Taierzhuang1938/_blender/Script_NakajimaKi4Release.py");
 Run(process.env.PYTHON??"python",["Taierzhuang1938/_blender/Script_NakajimaKi4ReleaseReceipt.py","--images"]);
 Run(process.env.PYTHON??"python",["Taierzhuang1938/_blender/Script_NakajimaKi4ReleaseReceipt.py","--finalize"]);
 ExecFile("Taierzhuang1938/_blender/Script_NakajimaKi4ReleaseAudit.py");
 Run(process.execPath,["Taierzhuang1938/Script_NakajimaKi4AoFieldTest.mjs"]);
 Run(process.env.PYTHON??"python",["Taierzhuang1938/_blender/Script_NakajimaKi4ReleaseReceipt.py"]);
 Run(process.execPath,["Taierzhuang1938/Script_NakajimaKi4ReleaseAssetTest.mjs"]);
 console.log(JSON.stringify({ok:true,assetRoot,sourceRoot,canonicalPromoted:false}));
}finally{
 if(started)Run(process.execPath,[mcp,"stop"]);
}
