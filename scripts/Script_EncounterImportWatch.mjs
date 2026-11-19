import {watch} from "node:fs";
import path from "node:path";

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
    for(const dir of ["Model/Character","Scenes/FirstLevelEncounter","AdvancedTools","."]){
      const watcher=watch(path.join(project,dir),(_event,file)=>{
        if(!file)return;
        if(dir==="Model/Character"&&file.endsWith(".glb"))pending.add("cast");
        if(dir==="Scenes/FirstLevelEncounter"&&/\.(?:bin|json|mjs)$/.test(file))pending.add("terrain");
        if((dir==="."||dir==="AdvancedTools")&&file.endsWith(".mjs")){
          pending.add("terrain");
          if(["Script_EncounterLibrary.mjs","Script_StrictTexturePublish.mjs","Script_PublishAssetPaths.mjs",
            "Data_XBotCharacters.mjs","Data_Tuning_EncounterPlayStartup.mjs"].includes(file))pending.add("cast");
        }
        if(pending.size){clearTimeout(timer);timer=setTimeout(Drain,350);}
      });
      watcher.on("error",error=>console.warn("[Encounter Library]",error.message));
      watchers.push(watcher);
    }
  } catch(error) {Close();throw error;}
  return Close;
}
