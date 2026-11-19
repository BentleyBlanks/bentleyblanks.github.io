import fs from "node:fs/promises";
import path from "node:path";
import {execFile} from "node:child_process";
import {promisify} from "node:util";

const Run=promisify(execFile);
async function Stamp(file) {
  const stat=await fs.stat(file,{bigint:true});
  return [file,stat.size,stat.mtimeNs,stat.ctimeNs].join(":");
}

// Mounted worktrees and static --root directories are served as snapshots.
// Only the checkout that started LocalPreview is permitted to run its importer.
export function PrepareEncounterLibraryRequest(root) {
  const project=path.join(root,"Taierzhuang1938"),tools=path.join(project,"AdvancedTools");
  const script=path.join(tools,"Script_EncounterLibrary.mjs"),index=path.join(tools,"Library/Data_Cast.json");
  const jobs=new Map(),terrainChecks=new Map();
  let castRevision;
  function Import(type) {
    if(!jobs.has(type)){
      const job=Run(process.execPath,[script,type],{cwd:root,windowsHide:true});
      jobs.set(type,job.finally(()=>jobs.delete(type)));
    }
    return jobs.get(type);
  }
  async function CastStamp() {
    const files=[script,index,path.join(project,"Data_Tuning_EncounterPlayStartup.mjs"),
      path.join(project,"Data_XBotCharacters.mjs"),path.join(project,"Script_StrictTexturePublish.mjs"),
      path.join(project,"Script_PublishAssetPaths.mjs"),path.join(root,"package.json")];
    const sourceDir=path.join(project,"Model/Character");
    for(const name of (await fs.readdir(sourceDir)).sort())if(name.endsWith(".glb"))files.push(path.join(sourceDir,name));
    const manifest=JSON.parse(await fs.readFile(index,"utf8"));
    for(const {file} of Object.values(manifest.models)) {
      if(!/^[a-f0-9]{64}\.glb$/.test(file))throw Error("Invalid character library filename");
      const product=path.join(tools,"Library/Cast",file);
      files.push(product,product+".json");
    }
    return (await Promise.all(files.map(Stamp))).join("|");
  }
  return async (route,file)=>{
    if(route==="/Taierzhuang1938/AdvancedTools/Library/Data_Cast.json"){
      let revision=await CastStamp().catch(()=>null);
      for(let attempt=0;(!revision||revision!==castRevision)&&attempt<3;attempt++) {
        await Import("cast");
        const next=await CastStamp();
        if(next===revision)castRevision=next;
        revision=next;
      }
      if(revision!==castRevision)throw Error("Character inputs changed during import");
      return true;
    }
    if(/^\/Taierzhuang1938\/AdvancedTools\/Library\/Terrain\/[a-f0-9]{64}\.bin\.gz$/.test(route)){
      const stamp=await Stamp(file).catch(()=>null);
      if(!stamp||terrainChecks.get(file)!==stamp){
        await Import("terrain");
        const verified=await Stamp(file).catch(()=>null);
        if(!verified)return false;
        terrainChecks.set(file,verified);
      }
      return true;
    }
    if(route==="/Taierzhuang1938/AdvancedTools/Tool_LevelFlow.html"){
      // Begin missing imports while the browser reads the editor and scene.
      for(const [type,asset] of [["cast",index],["terrain",path.join(tools,"Library/Terrain")]]){
        try {await fs.access(asset);} catch {
          Import(type).catch(error=>console.warn("[Encounter Library]",error.message));
        }
      }
    }
    return false;
  };
}
