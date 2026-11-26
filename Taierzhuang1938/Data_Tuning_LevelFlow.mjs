// Encounter preview terrain budgets, measured with a 640 × 640 Scene viewport
// on 2026-11-13. Small cells refine height detail, and flat cells stop early.
// Curved banks refine to 25 cm for close views and share height-field normals.
export const FLOW_RENDERING = {
  terrainPatchSizeM: 8,
  terrainCellPixels: 40,
  terrainPaintCellPixels: 32,
  terrainFlatHeightPixels: 2,
  terrainNormalSampleM: 0.5,
  terrainDetailCellM: 0.25,
  terrainDetailHeightErrorM: 0.025,
  terrainSceneCellM: 8,
  terrainHeightErrorM: 0.18,
  terrainBackdropCellM: 32,
  roofSurfaceSeparationM: 0.005,
  backdropPaint: {maxPx:2048, minTexelM:2},
  terrainSurface: {texelM:0.5, maxPixels:4000000, maxTexturePx:4096, paddingM:2, anisotropy:8},
  haze: {startM:300, endM:1800, strength:0.82},
  tree: {minHeightM:2.5, crownWidthRatio:0.27, crownMaxM:3, crownBaseRatio:0.45, trunkMaxM:0.5},
  navigation: {wheelSettleMs:120},
  depthReadback: {tilePixels:8, sampleWidth:256},
  residentGeometry: {initialBytes:8388608, maxBytes:134217728, owners:2},
  terrainBuild: {prewarmRadiusM:512, prewarmBytes:16777216, cacheEntries:4, cacheChunkBytes:8388608},
  mapTerrain: {tileCells:128,maxTiles:96,minStepM:0.5,maxLevel:7},
  sky: {zenith:"#517f9c", horizon:"#a6bdc5", below:"#879b9f", sun:"#ead6a8", sunDirection:[0.35,0.6,-0.72]},
  lighting: {
    ambient:0.48, direct:0.52,
    shadowMapSize:4096, shadowMinRadiusM:32, shadowMaxRadiusM:800,
    shadowDepthM:2048, shadowBiasM:0.12, shadowStrength:0.95,
    aoRadiusM:1.6, aoStrength:2.4, aoMaxPixels:36, aoMinLight:0.52,
    aoTerrainScale:0.4, aoTerrainBias:0.16,
    aoRenderScale:0.5,
  },
};

// Beishahe dusk for the 3D viewports: the sky, sun direction (toward the sun: due west, a little south, 8 degrees
// up) and light balance blend with the camera focus z between fromZ and toZ. 2D maps always use the day sky.
export const FLOW_DUSK = {
  fromZ: 820, toZ: 960, steps: 32,
  sky: {zenith:"#3f4c6e", horizon:"#e9965a", below:"#6d5b58", sun:"#ffb272", sunDirection:[-0.985,0.139,0.104]},
  lighting: {ambient:0.4, direct:0.6},
};

// The final bridge sequence darkens toward the night march.
export const FLOW_NIGHT = {
  sky:{zenith:"#111b31",horizon:"#444457",below:"#252c3b",sun:"#887f75",sunDirection:[-0.995,-0.06,0.08]},
  lighting:{ambient:0.34,direct:0.1},
};

export const FLOW_FIELD_COLORS = {
  wheat: "#b6bf88",
  plowed: "#b59c7a",
  fallow: "#b6b197",
  wheatRich: "#889668",
  wheatSparse: "#9ea479",
  plowedFresh: "#957c5e",
  stubble: "#b8a382",
  garden: "#768a5c",
  sandy: "#bfb193",
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

// Detail inspection requested on 2026-11-15, with the full overview still available.
export const FLOW_ZOOM = {
  minScale:0.08, maxScale:320,
  minChaseDistanceM:1.5, minEyeFovDeg:12,
};

// Scene camera FOV is vertical like Unity's Camera.fieldOfView (default 60).
// Other perspective views (oblique, chase) keep a fixed horizontal FOV.
export const FLOW_VIEW_HORIZONTAL_FOV_DEG = 65;
export const FLOW_SCENE_CAMERA = {verticalFov:60, near:0.15, far:1500, speed:12};
export const FLOW_SCENE_CAMERA_LIMITS = {
  verticalFov:[10,150], near:[0.01,1000], far:[0.02,10000], speed:[0.1,120],
};
