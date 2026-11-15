// Encounter Play keeps game quality; only unrelated startup work is excluded.
export const ENCOUNTER_PLAY_STARTUP = {
  weaponsOnly:false,
  craterDebris:true,
  pbrSets:["Steel","WoodStock","GrenadePbr","DadaoPbr","Ground","GroundRubble","CraterScorched","Type89Armor","Type89Track",
    "HandcartWood","WoodCrate","LugouqiaoType11AmmoBox","LugouqiaoType11Body","LugouqiaoType11BodyAlt","LugouqiaoType11Fore"],
  // Scene BGM is on-demand and remains available; legacy music/voice packs are not used.
  audio:{voice:false,ambience:false,music:false},
  shaderSubmitBatch:32,
  idleCacheMs:120000,
  maxLoadMs:120000,
};
