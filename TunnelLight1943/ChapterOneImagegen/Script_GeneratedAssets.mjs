import * as THREE from "three";

// Keep generated image URLs in one place so every consumer gets the same
// cache-busted module graph and the same browser-side texture configuration.
export const TEXTURE_BACKGROUND_DAWN_FIELDS_URL = "./Texture/Texture_BackgroundDawnFields.png?v=one009";
export const BACKGROUND_DAWN_FIELDS_URL = TEXTURE_BACKGROUND_DAWN_FIELDS_URL;

// Accepted Scene One production assets.  Keep these URLs beside the loader so
// every world-space consumer shares the same cache-busted request and texture
// configuration.  Rejected candidates intentionally stay out of this map.
export const TEXTURE_HOUSE_FACADE_DAMAGED_URL =
  "./Texture/Generated/SceneOne/Texture_HouseFacadeDamaged.png?v=one009";
export const TEXTURE_DOOR_FRAME_TIMBER_URL =
  "./Texture/Generated/SceneOne/Texture_DoorFrameTimber.png?v=one009";
export const TEXTURE_KANG_BED_URL =
  "./Texture/Generated/SceneOne/Texture_KangBed.png?v=one009";
export const TEXTURE_STOOL_LOW_URL =
  "./Texture/Generated/SceneOne/Texture_StoolLow.png?v=one009";
export const TEXTURE_WATER_JAR_CRACKED_URL =
  "./Texture/Generated/SceneOne/Texture_WaterJarCracked.png?v=one009";
export const TEXTURE_BEDDING_RAGGED_URL =
  "./Texture/Generated/SceneOne/Texture_BeddingRagged.png?v=one009";
export const TEXTURE_STOVE_COLD_PAPER_CUT_URL =
  "./Texture/Generated/SceneOne/Texture_StoveColdPaperCut.png?v=one009";

// Accepted surface props shared by village chapters.  Cellar openings,
// character art, and rejected candidates intentionally stay out of this map.
export const TEXTURE_ELM_SPARSE_URL =
  "./Texture/Generated/SharedSurface/Texture_ElmNearBare.png?v=one009";
export const TEXTURE_WELL_WINCH_FRAME_URL =
  "./Texture/Generated/SharedSurface/Texture_WellWinchFrame.png?v=one009";
export const TEXTURE_WELL_STONE_BASE_URL =
  "./Texture/Generated/SharedSurface/Texture_WellStoneBase.png?v=one009";
export const TEXTURE_WELL_BUCKET_URL =
  "./Texture/Generated/SharedSurface/Texture_WellBucket.png?v=one009";
export const TEXTURE_SHED_BURNED_URL =
  "./Texture/Generated/SharedSurface/Texture_ShedBurned.png?v=one009";
export const TEXTURE_ASH_DEBRIS_PILE_URL =
  "./Texture/Generated/SharedSurface/Texture_AshDebrisPile.png?v=one009";
export const TEXTURE_WELL_ROPE_DRUM_URL =
  "./Texture/Generated/SharedSurface/Texture_WellRopeDrum.png?v=one009";
export const TEXTURE_WELL_CRANK_HANDLE_URL =
  "./Texture/Generated/SharedSurface/Texture_WellCrankHandle.png?v=one009";
export const TEXTURE_SHED_LOOSE_TIMBER_TOOLS_URL =
  "./Texture/Generated/SharedSurface/Texture_ShedLooseTimberTools.png?v=one009";
export const TEXTURE_SHED_THATCH_MAT_URL =
  "./Texture/Generated/SharedSurface/Texture_ShedThatchMat.png?v=one009";
export const TEXTURE_SHED_REED_MAT_URL =
  "./Texture/Generated/SharedSurface/Texture_ShedReedMat.png?v=one009";
export const TEXTURE_SHED_CHARRED_DOOR_PLANK_URL =
  "./Texture/Generated/SharedSurface/Texture_ShedCharredDoorPlank.png?v=one009";
export const TEXTURE_SHED_FEED_TROUGH_URL =
  "./Texture/Generated/SharedSurface/Texture_ShedFeedTrough.png?v=one009";

export const TEXTURE_ASH_GROUND_CRACKED_STRIP_URL =
  "./Texture/Generated/SharedSurface/Texture_AshGroundCrackedStrip.png?v=one009";
export const TEXTURE_DISTANT_VILLAGE_WATCHTOWERS_URL =
  "./Texture/Generated/SharedSurface/Texture_DistantVillageWatchtowers.png?v=one009";
export const TEXTURE_VILLAGE_HOUSE_FACADE_QISHU_URL =
  "./Texture/Generated/SharedSurface/Texture_VillageHouseFacadeQishu.png?v=one009";
export const TEXTURE_VILLAGE_HOUSE_FACADE_B_URL =
  "./Texture/Generated/SharedSurface/Texture_VillageHouseFacadeB.png?v=one009";
export const TEXTURE_VILLAGE_HOUSE_FACADE_C_URL =
  "./Texture/Generated/SharedSurface/Texture_VillageHouseFacadeC.png?v=one009";
export const TEXTURE_VILLAGE_HOUSE_FACADE_D_URL =
  "./Texture/Generated/SharedSurface/Texture_VillageHouseFacadeD.png?v=one009";
export const TEXTURE_HAYSTACK_FULL_URL =
  "./Texture/Generated/SharedSurface/Texture_HaystackFull.png?v=one009";
export const TEXTURE_HAYSTACK_RAIDED_URL =
  "./Texture/Generated/SharedSurface/Texture_HaystackRaided.png?v=one009";
export const TEXTURE_YARD_WALL_INTACT_URL =
  "./Texture/Generated/SharedSurface/Texture_YardWallIntact.png?v=one009";
export const TEXTURE_YARD_WALL_GATE_URL =
  "./Texture/Generated/SharedSurface/Texture_YardWallGate.png?v=one009";
export const TEXTURE_YARD_WALL_BROKEN_URL =
  "./Texture/Generated/SharedSurface/Texture_YardWallBroken.png?v=one009";
export const TEXTURE_OLD_WOOD_DOORS_URL =
  "./Texture/Generated/SharedSurface/Texture_OldWoodDoors.png?v=one009";
export const TEXTURE_NOTICE_WALL_URL =
  "./Texture/Generated/SharedSurface/Texture_NoticeWall.png?v=one009";
export const TEXTURE_PIGPEN_EMPTY_URL =
  "./Texture/Generated/SharedSurface/Texture_PigpenEmpty.png?v=one009";
export const TEXTURE_STALK_FENCE_URL =
  "./Texture/Generated/SharedSurface/Texture_StalkFence.png?v=one009";
export const TEXTURE_CROP_ROWS_SPARSE_URL =
  "./Texture/Generated/SharedSurface/Texture_CropRowsSparse.png?v=one009";
export const TEXTURE_STUBBLE_FIELD_URL =
  "./Texture/Generated/SharedSurface/Texture_StubbleField.png?v=one009";
export const TEXTURE_SOWN_FIELD_URL =
  "./Texture/Generated/SharedSurface/Texture_SownField.png?v=one009";
export const TEXTURE_WOODPILE_URL =
  "./Texture/Generated/SharedSurface/Texture_Woodpile.png?v=one009";
export const TEXTURE_FIREWOOD_BUNDLE_URL =
  "./Texture/Generated/SharedSurface/Texture_FirewoodBundle.png?v=one009";

export const TEXTURE_CELLAR_EARTH_WALL_TILE_URL =
  "./Texture/Generated/Cellar/Texture_CellarEarthWallTile.png?v=one009";
export const TEXTURE_CELLAR_TIMBER_POST_URL =
  "./Texture/Generated/Cellar/Texture_CellarTimberPost.png?v=one009";
export const TEXTURE_CELLAR_TIMBER_BEAM_URL =
  "./Texture/Generated/Cellar/Texture_CellarTimberBeam.png?v=one009";
export const TEXTURE_OIL_LAMP_WEAK_URL =
  "./Texture/Generated/Cellar/Texture_OilLampWeak.png?v=one009";
export const TEXTURE_CLOTH_BUNDLE_OLD_URL =
  "./Texture/Generated/Cellar/Texture_ClothBundleOld.png?v=one009";
export const TEXTURE_FRESH_EARTH_MOUND_URL =
  "./Texture/Generated/Cellar/Texture_FreshEarthMound.png?v=one009";
export const TEXTURE_CELLAR_LONG_LADDER_URL =
  "./Texture/Generated/Cellar/Texture_CellarLongLadder.png?v=one009";
export const TEXTURE_CELLAR_STORAGE_CLUSTER_URL =
  "./Texture/Generated/Cellar/Texture_CellarStorageCluster.png?v=one009";

export const TEXTURE_BROTHER_HEAD_SIDE_URL =
  "./Texture/Generated/CharacterRig/Texture_BrotherHeadSide.png?v=one009";
export const TEXTURE_BROTHER_TORSO_SIDE_URL =
  "./Texture/Generated/CharacterRig/Texture_BrotherTorsoSide.png?v=one009";
export const TEXTURE_BROTHER_UPPER_ARM_SIDE_URL =
  "./Texture/Generated/CharacterRig/Texture_BrotherUpperArmSide.png?v=one009";
export const TEXTURE_BROTHER_FOREARM_HAND_SIDE_URL =
  "./Texture/Generated/CharacterRig/Texture_BrotherForearmHandSide.png?v=one009";
export const TEXTURE_BROTHER_THIGH_SIDE_URL =
  "./Texture/Generated/CharacterRig/Texture_BrotherThighSide.png?v=one009";
export const TEXTURE_BROTHER_SHIN_SIDE_URL =
  "./Texture/Generated/CharacterRig/Texture_BrotherShinSide.png?v=one009";
export const TEXTURE_BROTHER_FOOT_SIDE_URL =
  "./Texture/Generated/CharacterRig/Texture_BrotherFootSide.png?v=one009";
export const TEXTURE_SISTER_HEAD_SIDE_URL =
  "./Texture/Generated/CharacterRig/Texture_SisterHeadSide.png?v=one009";
export const TEXTURE_SISTER_TORSO_SIDE_URL =
  "./Texture/Generated/CharacterRig/Texture_SisterTorsoSide.png?v=one009";
export const TEXTURE_SISTER_UPPER_ARM_SIDE_URL =
  "./Texture/Generated/CharacterRig/Texture_SisterUpperArmSide.png?v=one009";
export const TEXTURE_SISTER_FOREARM_HAND_SIDE_URL =
  "./Texture/Generated/CharacterRig/Texture_SisterForearmHandSide.png?v=one009";
export const TEXTURE_SISTER_THIGH_SIDE_URL =
  "./Texture/Generated/CharacterRig/Texture_SisterThighSide.png?v=one009";
export const TEXTURE_SISTER_SHIN_SIDE_URL =
  "./Texture/Generated/CharacterRig/Texture_SisterShinSide.png?v=one009";
export const TEXTURE_SISTER_FOOT_SIDE_URL =
  "./Texture/Generated/CharacterRig/Texture_SisterFootSide.png?v=one009";

export const SCENE_ONE_GENERATED_ASSETS = Object.freeze({
  houseFacadeDamaged: TEXTURE_HOUSE_FACADE_DAMAGED_URL,
  doorFrameTimber: TEXTURE_DOOR_FRAME_TIMBER_URL,
  kangBed: TEXTURE_KANG_BED_URL,
  stoolLow: TEXTURE_STOOL_LOW_URL,
  waterJarCracked: TEXTURE_WATER_JAR_CRACKED_URL,
  beddingRagged: TEXTURE_BEDDING_RAGGED_URL,
  stoveColdPaperCut: TEXTURE_STOVE_COLD_PAPER_CUT_URL,
});

export const SURFACE_GENERATED_ASSETS = Object.freeze({
  elmSparse: TEXTURE_ELM_SPARSE_URL,
  wellWinchFrame: TEXTURE_WELL_WINCH_FRAME_URL,
  wellStoneBase: TEXTURE_WELL_STONE_BASE_URL,
  wellBucket: TEXTURE_WELL_BUCKET_URL,
  shedBurned: TEXTURE_SHED_BURNED_URL,
  ashDebrisPile: TEXTURE_ASH_DEBRIS_PILE_URL,
  wellRopeDrum: TEXTURE_WELL_ROPE_DRUM_URL,
  wellCrankHandle: TEXTURE_WELL_CRANK_HANDLE_URL,
  shedLooseTimberTools: TEXTURE_SHED_LOOSE_TIMBER_TOOLS_URL,
  shedThatchMat: TEXTURE_SHED_THATCH_MAT_URL,
  shedReedMat: TEXTURE_SHED_REED_MAT_URL,
  shedCharredDoorPlank: TEXTURE_SHED_CHARRED_DOOR_PLANK_URL,
  shedFeedTrough: TEXTURE_SHED_FEED_TROUGH_URL,
  ashGroundCrackedStrip: TEXTURE_ASH_GROUND_CRACKED_STRIP_URL,
  distantVillageWatchtowers: TEXTURE_DISTANT_VILLAGE_WATCHTOWERS_URL,
  qishuHouse: TEXTURE_VILLAGE_HOUSE_FACADE_QISHU_URL,
  houseB: TEXTURE_VILLAGE_HOUSE_FACADE_B_URL,
  houseC: TEXTURE_VILLAGE_HOUSE_FACADE_C_URL,
  houseD: TEXTURE_VILLAGE_HOUSE_FACADE_D_URL,
  haystackFull: TEXTURE_HAYSTACK_FULL_URL,
  haystackRaided: TEXTURE_HAYSTACK_RAIDED_URL,
  yardWallIntact: TEXTURE_YARD_WALL_INTACT_URL,
  yardWallGate: TEXTURE_YARD_WALL_GATE_URL,
  yardWallBroken: TEXTURE_YARD_WALL_BROKEN_URL,
  oldWoodDoors: TEXTURE_OLD_WOOD_DOORS_URL,
  noticeWall: TEXTURE_NOTICE_WALL_URL,
  pigpenEmpty: TEXTURE_PIGPEN_EMPTY_URL,
  stalkFence: TEXTURE_STALK_FENCE_URL,
  cropRowsSparse: TEXTURE_CROP_ROWS_SPARSE_URL,
  stubbleField: TEXTURE_STUBBLE_FIELD_URL,
  sownField: TEXTURE_SOWN_FIELD_URL,
  woodpile: TEXTURE_WOODPILE_URL,
  firewoodBundle: TEXTURE_FIREWOOD_BUNDLE_URL,
});

export const CELLAR_GENERATED_ASSETS = Object.freeze({
  cellarEarthWallTile: TEXTURE_CELLAR_EARTH_WALL_TILE_URL,
  cellarTimberPost: TEXTURE_CELLAR_TIMBER_POST_URL,
  cellarTimberBeam: TEXTURE_CELLAR_TIMBER_BEAM_URL,
  oilLampWeak: TEXTURE_OIL_LAMP_WEAK_URL,
  clothBundleOld: TEXTURE_CLOTH_BUNDLE_OLD_URL,
  freshEarthMound: TEXTURE_FRESH_EARTH_MOUND_URL,
  cellarLongLadder: TEXTURE_CELLAR_LONG_LADDER_URL,
  cellarStorageCluster: TEXTURE_CELLAR_STORAGE_CLUSTER_URL,
});

export const CHARACTER_RIG_GENERATED_ASSETS = Object.freeze({
  brother: Object.freeze({
    head: TEXTURE_BROTHER_HEAD_SIDE_URL,
    torso: TEXTURE_BROTHER_TORSO_SIDE_URL,
    upperArm: TEXTURE_BROTHER_UPPER_ARM_SIDE_URL,
    forearmHand: TEXTURE_BROTHER_FOREARM_HAND_SIDE_URL,
    thigh: TEXTURE_BROTHER_THIGH_SIDE_URL,
    shin: TEXTURE_BROTHER_SHIN_SIDE_URL,
    foot: TEXTURE_BROTHER_FOOT_SIDE_URL,
  }),
  sister: Object.freeze({
    head: TEXTURE_SISTER_HEAD_SIDE_URL,
    torso: TEXTURE_SISTER_TORSO_SIDE_URL,
    upperArm: TEXTURE_SISTER_UPPER_ARM_SIDE_URL,
    forearmHand: TEXTURE_SISTER_FOREARM_HAND_SIDE_URL,
    thigh: TEXTURE_SISTER_THIGH_SIDE_URL,
    shin: TEXTURE_SISTER_SHIN_SIDE_URL,
    foot: TEXTURE_SISTER_FOOT_SIDE_URL,
  }),
});

const textureLoader = new THREE.TextureLoader();
const textureCache = new Map();
const texturePromises = new Map();
const textureErrors = new Map();

function ConfigureGeneratedTexture(texture, options = {}) {
  texture.colorSpace = options.colorSpace || THREE.SRGBColorSpace;
  texture.magFilter = options.magFilter || THREE.LinearFilter;
  texture.minFilter = options.minFilter || THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = options.generateMipmaps !== false;
  if (options.anisotropy !== false) {
    texture.anisotropy = Math.max(1, options.anisotropy || 4);
  }
  texture.needsUpdate = true;
  return texture;
}

// Load once per URL.  The cache is deliberately shared by all generated
// assets so later prop/rig loaders can reuse a texture without duplicating
// GPU memory or racing duplicate Image requests.
export function LoadGeneratedTexture(url, options = {}) {
  if (!url) return Promise.reject(new TypeError("generated texture URL is required"));
  const cached = textureCache.get(url);
  if (cached) return Promise.resolve(cached);
  const pending = texturePromises.get(url);
  if (pending) return pending;

  const promise = new Promise((resolve, reject) => {
    textureLoader.load(
      url,
      (texture) => {
        textureErrors.delete(url);
        textureCache.set(url, ConfigureGeneratedTexture(texture, options));
        texturePromises.delete(url);
        resolve(textureCache.get(url));
      },
      undefined,
      (error) => {
        texturePromises.delete(url);
        textureErrors.set(url, error || new Error(`failed to load generated texture: ${url}`));
        reject(textureErrors.get(url));
      },
    );
  });
  texturePromises.set(url, promise);
  return promise;
}

export function PreloadGeneratedTextures(urls, options = {}) {
  return Promise.all((Array.isArray(urls) ? urls : [urls]).map((url) => LoadGeneratedTexture(url, options)));
}

// Character parts are independent rig bones.  A missing image must therefore
// leave only that bone on its procedural fallback instead of rejecting the
// whole character set.  The returned shape mirrors CHARACTER_RIG_GENERATED_ASSETS
// and contains either a configured Three texture or null for each failed bone.
export function LoadCharacterRigAssets(registry = CHARACTER_RIG_GENERATED_ASSETS, options = {}) {
  const characters = Object.entries(registry || {});
  return Promise.all(
    characters.map(async ([character, bones]) => {
      const loadedBones = await Promise.all(
        Object.entries(bones || {}).map(async ([bone, url]) => {
          try {
            return [bone, await LoadGeneratedTexture(url, options)];
          } catch {
            return [bone, null];
          }
        }),
      );
      return [character, Object.freeze(Object.fromEntries(loadedBones))];
    }),
  ).then((loadedCharacters) => Object.freeze(Object.fromEntries(loadedCharacters)));
}

export function GetGeneratedTexture(url) {
  return textureCache.get(url) || null;
}

export function GetGeneratedTextureState(url) {
  if (textureCache.has(url)) return { status: "ready", texture: textureCache.get(url), error: null };
  if (texturePromises.has(url)) return { status: "loading", texture: null, error: null };
  if (textureErrors.has(url)) return { status: "error", texture: null, error: textureErrors.get(url) };
  return { status: "idle", texture: null, error: null };
}

// Generic aliases keep the cache useful for future generated props and rig
// atlases without making those consumers depend on the backdrop's name.
export const LoadGeneratedAsset = LoadGeneratedTexture;
export const PreloadGeneratedAssets = PreloadGeneratedTextures;
export const GetGeneratedAsset = GetGeneratedTexture;
export const GetGeneratedAssetState = GetGeneratedTextureState;
