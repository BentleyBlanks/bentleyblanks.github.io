import {existsSync,watch} from "node:fs";
import path from "node:path";

const TERRAIN_MODULES = new Set([
  "Script_EncounterLibrary.mjs", "Script_LevelFlowTerrain.mjs", "Script_LevelFlowTerrainKey.mjs",
  "Script_LevelFlowTerrainWorker.mjs", "Script_LevelFlowTerrainCache.mjs", "Script_LevelFlowTerrainLoader.mjs",
  "Script_LevelFlowGeometry.mjs", "Script_LevelFlowMap.mjs", "Script_TerrainSnapshot.mjs",
  "Script_GroundPaint.mjs", "Script_SceneDoc.mjs", "Script_SceneTrenches.mjs", "Script_SceneSurface.mjs",
  "Script_SceneInherit.mjs", "Script_RoadPath.mjs", "Script_EncounterFarmland.mjs", "Script_BeishaheGeography.mjs",
  "Script_EncounterVariants.mjs", "Data_EncounterVariants.mjs", "Data_Tuning_LevelFlow.mjs",
  "Data_SceneGroundLayers.mjs", "Data_Tuning_Terrain.mjs", "Data_LevelFlow.mjs",
  "Data_EditorBlockoutFirstLevel0105Space.mjs", "Data_EditorBlockoutFirstLevel0610Space.mjs",
]);

const CAST_MODULES = new Set([
  "Script_EncounterLibrary.mjs", "Script_StrictTexturePublish.mjs", "Script_PublishAssetPaths.mjs",
  "Data_XBotCharacters.mjs", "Data_Tuning_EncounterPlayStartup.mjs",
]);

// One set of native file notifications per active preview. Debounce saves and
// remember edits arriving while an importer is still running.
export function WatchEncounterImports(project,importData) {
  const pending=new Set(),watchers=[];
  let timer,active=false,closed=false;
  async function Drain() {
    if(active||closed)return;
    active=true;
    try {
      while(!closed&&pending.size){
        const types=[...pending];pending.clear();
        for(const type of types) {
          try {await importData(type);} catch(error) {console.warn("[Encounter Library]",error.message);}
        }
      }
    } finally {active=false;}
  }
  function Close() {
    closed=true;clearTimeout(timer);
    for(const watcher of watchers)watcher.close();
  }
  try {
    const watchDirs=[
      ["Model/Character",true],
      ["Scenes/FirstLevelEncounter",true],
      ["Scenes/FirstLevelMerged",false],
      ["AdvancedTools",true],
      [".",true],
    ];
    for(const [dir,required] of watchDirs){
      const targetDir=path.join(project,dir);
      if(!required&&!existsSync(targetDir))continue;
      const watcher=watch(targetDir,(_event,file)=>{
        if(!file)return;
        if(dir==="Model/Character"&&file.endsWith(".glb"))pending.add("cast");
        if((dir==="Scenes/FirstLevelEncounter"||dir==="Scenes/FirstLevelMerged")&&/\.(?:bin|json|mjs)$/.test(file))pending.add("terrain");
        if((dir==="."||dir==="AdvancedTools")&&file.endsWith(".mjs")){
          if(TERRAIN_MODULES.has(file))pending.add("terrain");
          if(CAST_MODULES.has(file))pending.add("cast");
        }
        if(pending.size){clearTimeout(timer);timer=setTimeout(Drain,350);}
      });
      watcher.on("error",error=>console.warn("[Encounter Library]",error.message));
      watchers.push(watcher);
    }
  } catch(error) {Close();throw error;}
  return Close;
}
