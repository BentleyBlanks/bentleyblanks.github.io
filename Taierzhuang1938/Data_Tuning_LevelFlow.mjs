// Encounter preview terrain budgets, measured with a 640 × 640 Scene viewport
// on 2026-11-13. Small cells refine height detail, and flat cells stop early.
export const FLOW_RENDERING = {
  terrainCellPixels: 10,
  terrainFlatHeightPixels: 0.5,
  terrainNormalSampleM: 0.5,
  navigation: {wheelSettleMs:120},
  sky: {zenith:"#517f9c", horizon:"#a6bdc5", below:"#879b9f", sun:"#ead6a8", sunDirection:[0.35,0.6,-0.72]},
};

// Screenshot reference supplied by the user on 2026-11-13.
export const FLOW_DEFAULT_VIEWS = [
  {type:"scene", distance:48, yaw:-2.6, pitch:-0.72, lookHeight:0.8},
  {type:"scene", distance:6, yaw:-1.5707963267948966, pitch:-0.06, lookHeight:1.6},
];

// Screen-space comic speech HUD, anchored above the sampled actor's head.
export const FLOW_SPEECH_HUD = {
  fontSize:15, lineHeight:21, maxWidth:280, padding:12, margin:8,
  tailHeight:16, headGap:8, cornerRadius:14, nameHeight:19,
  fill:"#fff8e8", ink:"#302b24", outline:"#494034", nameColor:"#756246",
  headHeight:{person:1.85, child:1.25, quilt:0.65, kneel:1.2, crouch:1.2, drag:1.25, down:0.65},
};
