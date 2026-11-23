// Encounter Play keeps game quality; only unrelated startup work is excluded.
export const ENCOUNTER_PLAY_STARTUP = {
  weaponsOnly:false,
  minimalCharacterRig:true,
  craterDebris:true,
  pbrSets:["Steel","WoodStock","GrenadePbr","DadaoPbr","Ground","GroundRubble","CraterScorched","Type89Armor","Type89Track",
    "HandcartWood","WoodCrate","LugouqiaoType11AmmoBox","LugouqiaoType11Body","LugouqiaoType11BodyAlt","LugouqiaoType11Fore"],
  // Scene BGM is on-demand and remains available; legacy music/voice packs are not used.
  audio:{voice:false,ambience:false,music:false},
  shaderSubmitBatch:32,
  // Linked materials can share a draw. Full post frames per two meshes dominate loading.
  shaderDrawBatch:64,
  meshRevealBatch:2048,
  // Warm draws need the real formats and quality, while pixel count can stay small.
  warmupHeight:144,
  // Local GLBs contain the authoring images. Ship-size the encounter cast
  // before its first upload, matching Model/Character in Data_PublishPathRules.
  castTextureMaxSize:2048,
  settleFrames:4,
  settleDt:1/60,
  idleCacheMs:120000,
  editorIdleCacheMs:600000,
  maxLoadMs:120000,
};
