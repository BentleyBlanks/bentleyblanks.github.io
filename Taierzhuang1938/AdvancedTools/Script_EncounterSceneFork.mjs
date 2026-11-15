// One-time fork; refuses to overwrite the independent authored scene.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BuildEncounterMap } from "./Script_LevelFlowMap.mjs";
import { BuildEncounterTerrain } from "./Script_LevelFlowTerrain.mjs";
import { FormatSceneJson } from "../Script_SceneDoc.mjs";
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const source=path.join(root,"Scenes/FirstLevelWhitebox");
const target=path.join(root,"Scenes/FirstLevelEncounter");
const output=path.join(target,"Scene_FirstLevelEncounter.json");
if(fs.existsSync(output)) throw new Error("Independent scene already exists; edit it directly.");
const scene=JSON.parse(fs.readFileSync(path.join(source,"Scene_FirstLevelWhitebox.json")));
const map=BuildEncounterMap(scene);
const terrain=BuildEncounterTerrain(scene,fs.readFileSync(path.join(source,scene.terrain.file)),fs.readFileSync(path.join(source,scene.trenches.datum.file)),map);
scene.surface={
  schema:"tengxian-scene-surface/1",
  pockets:map.planningPockets.map(p=>({...p,height:terrain.heightAt((p.box[0]+p.box[1])/2,(p.box[2]+p.box[3])/2),featherM:1.5})),
  ramps:map.ramps.map(r=>({...r,from:terrain.heightAt(...r.points[0]),to:terrain.heightAt(...r.points.at(-1))})),
};
const materialNames={Earth:"EarthDark",Stone:"Plaster",Sandbag:"Cover",Wood:"Timber"};
for(const {planning,...object} of map.objects.filter(o=>o.planning)) scene.objects.push({...object,meta:{planning:true},
  material:"Whitebox/"+materialNames[object.material.split("/")[1]],pos:[object.pos[0],terrain.heightAt(object.pos[0],object.pos[2]),object.pos[2]],
  asset:"Whitebox/Box",solid:true,cover:{faceX:0,faceZ:-1}});
scene.id="FirstLevelEncounter";
scene.title="第一关 · Encounter Play";
scene.source={forkedFrom:"FirstLevelWhitebox",forkedAt:"2026-11-15",notes:"Independent authored scene. Subsequent layout and encounter edits belong here; never regenerate from the old scene."};
fs.mkdirSync(target,{recursive:true});
fs.copyFileSync(path.join(source,scene.terrain.file),path.join(target,"Scene_FirstLevelEncounter.height.bin"));
fs.copyFileSync(path.join(source,scene.trenches.datum.file),path.join(target,"Scene_FirstLevelEncounter.trench.bin"));
scene.terrain.file="Scene_FirstLevelEncounter.height.bin";
scene.trenches.datum.file="Scene_FirstLevelEncounter.trench.bin";
fs.writeFileSync(output,FormatSceneJson(scene));
const environment=JSON.parse(fs.readFileSync(path.join(source,"Environment_FirstLevelWhitebox.json")));
environment.scene=scene.id;
for(const volume of environment.volumes) volume.preset="FirstLevelEncounter";
fs.writeFileSync(path.join(target,"Environment_FirstLevelEncounter.json"),JSON.stringify(environment,null,2)+"\n");
const preset=JSON.parse(fs.readFileSync(path.join(root,"Environment/EnvPreset_FirstLevelWhitebox.json")));
preset.id="FirstLevelEncounter";
fs.writeFileSync(path.join(root,"Environment/EnvPreset_FirstLevelEncounter.json"),JSON.stringify(preset,null,2)+"\n");
console.log("Created independent FirstLevelEncounter scene, terrain, surface patches and lighting.");
