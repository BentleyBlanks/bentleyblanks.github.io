import { MakeBlockoutPhase } from "./Script_EditorBlockoutLevels.mjs";
export const ENCOUNTER_PLAY_PHASE=MakeBlockoutPhase({
  key:"FirstLevelEncounter",label:"第一关 · Encounter Play",
  scene:{kind:"scene",url:"./Scenes/FirstLevelEncounter/Scene_FirstLevelEncounter.json",
    region:{minX:-160,maxX:320,minZ:-480,maxZ:560},priorSignals:["Stage0105Done"],
    placeholder:{bounds:{minX:-160,maxX:320,minZ:-480,maxZ:560},spawn:{x:66.5,z:64.5,yawDeg:90}}},
});
