/**
 * Ashen Route 1942 presentation layer.
 *
 * All presentation work is original. World geometry, effects, and audio are
 * procedural; the two friendly characters can safely upgrade to local GLB
 * assets while enemies retain their procedural rigs. THREE is injected by the
 * host so the page can pin its own vendored version.
 */

import { BeginFriendlyCharacterModelUpgrades } from "./Script_CharacterModelLoader.mjs?v=20260820a";

const DesktopRenderingProfile = Object.freeze({
  terrainSegments: 64,
  roadSamples: 62,
  ridgeSamples: 52,
  ridgeLayers: 3,
  wallStones: 46,
  fieldRows: 12,
  dustCount: 72,
  emberCount: 22,
  shadowMapSize: 2048,
  pixelRatio: 2,
  lanternLights: 5,
  groundStones: 168,
  grassClumps: 228,
  fallenLeaves: 196,
  puddles: 22,
});

const environmentPanoramaUrl = new URL("./Texture_EnvironmentPanorama.png?v=20260730s", import.meta.url).href;
const wetLoessGroundUrl = new URL("./Texture_WetLoessGround.png?v=20260730s", import.meta.url).href;

const CharacterPalettes = Object.freeze({
  player: Object.freeze({
    jacket: 0x40585c,
    jacketDark: 0x293a3d,
    trousers: 0x343a37,
    cloth: 0x897353,
    accent: 0x6f3d32,
    skin: 0xb98363,
    hair: 0x211a17,
  }),
  companion: Object.freeze({
    jacket: 0x62664b,
    jacketDark: 0x3d4232,
    trousers: 0x454238,
    cloth: 0x968563,
    accent: 0x4d5e60,
    skin: 0xa97656,
    hair: 0x29231f,
  }),
  enemy: Object.freeze({
    jacket: 0x65644d,
    jacketDark: 0x444536,
    trousers: 0x4c4c3d,
    cloth: 0x796d51,
    accent: 0x393b32,
    skin: 0xb78664,
    hair: 0x221d19,
  }),
});

const MissionRouteAnchors = Object.freeze([
  Object.freeze([-37, 84]),
  Object.freeze([-35, 64]),
  Object.freeze([-29, 52]),
  Object.freeze([-18, 32]),
  Object.freeze([2, 13]),
  Object.freeze([12, 4]),
  Object.freeze([24, -8]),
  Object.freeze([24, -25]),
  Object.freeze([8, -42]),
  Object.freeze([-4, -58]),
  Object.freeze([-9, -67]),
  Object.freeze([-27, -79]),
  Object.freeze([-35, -96]),
  Object.freeze([-43, -110]),
]);

function Clamp(value, minimum = 0, maximum = 1) {
  return Math.max(minimum, Math.min(maximum, Number(value) || 0));
}

function Damp(current, target, smoothing, delta) {
  return current + (target - current) * (1 - Math.exp(-smoothing * Math.max(0, delta)));
}

function CreateSeededRandom(seed = 1942) {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function ResolveReducedMotion(explicitValue) {
  if (typeof explicitValue === "boolean") return explicitValue;
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

function ReadPosition(position, fallback = { x: 0, y: 0, z: 0 }) {
  if (Array.isArray(position)) {
    return { x: Number(position[0]) || 0, y: Number(position[1]) || 0, z: Number(position[2]) || 0 };
  }
  if (position && typeof position === "object") {
    return { x: Number(position.x) || 0, y: Number(position.y) || 0, z: Number(position.z) || 0 };
  }
  return fallback;
}

function MarkMesh(mesh, castShadow = true, receiveShadow = true) {
  mesh.castShadow = castShadow;
  mesh.receiveShadow = receiveShadow;
  return mesh;
}

function DisposeHierarchy(root, disposeMaterials = true) {
  const geometries = new Set();
  const materials = new Set();
  root?.traverse?.((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (disposeMaterials && object.material) {
      const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
      objectMaterials.forEach((material) => materials.add(material));
    }
  });
  geometries.forEach((geometry) => geometry.dispose?.());
  materials.forEach((material) => {
    material.map?.dispose?.();
    material.dispose?.();
  });
}

export function GetTerrainHeight(x, z) {
  const broadSlope = -0.008 * z;
  const longRidge = Math.sin((x + 17) * 0.052) * 1.15 + Math.cos((z - 8) * 0.041) * 0.78;
  const brokenEarth = Math.sin((x + z) * 0.117) * 0.22 + Math.cos((x - z) * 0.089) * 0.18;
  const routeCenter = GetRouteCenterX(z);
  const roadBasin = -0.55 * Math.exp(-Math.pow((x - routeCenter) * 0.085, 2));
  return broadSlope + longRidge + brokenEarth + roadBasin - 0.45;
}

export function GetRouteCenterX(z) {
  if (z >= MissionRouteAnchors[0][1]) return MissionRouteAnchors[0][0];
  const last = MissionRouteAnchors[MissionRouteAnchors.length - 1];
  if (z <= last[1]) return last[0];
  for (let index = 0; index < MissionRouteAnchors.length - 1; index += 1) {
    const current = MissionRouteAnchors[index];
    const next = MissionRouteAnchors[index + 1];
    if (z <= current[1] && z >= next[1]) {
      const t = (current[1] - z) / Math.max(0.001, current[1] - next[1]);
      return current[0] + (next[0] - current[0]) * t;
    }
  }
  return last[0];
}

function CreateSurfaceTexture(THREE, options = {}) {
  if (typeof document === "undefined" || !THREE.CanvasTexture) return null;
  const size = 192;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const random = CreateSeededRandom(options.seed ?? 1942);
  const pattern = options.pattern || "soil";
  context.fillStyle = options.base || "#dedbd2";
  context.fillRect(0, 0, size, size);

  if (pattern === "fog") {
    context.clearRect(0, 0, size, size);
    const gradient = context.createLinearGradient(0, 0, 0, size);
    gradient.addColorStop(0, "rgba(220,230,232,0)");
    gradient.addColorStop(0.28, "rgba(210,222,225,0.42)");
    gradient.addColorStop(0.64, "rgba(194,208,212,0.6)");
    gradient.addColorStop(1, "rgba(184,199,203,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  } else {
    const speckCount = 420;
    for (let index = 0; index < speckCount; index += 1) {
      const value = Math.floor(112 + random() * 120);
      const alpha = 0.035 + random() * 0.13;
      context.fillStyle = `rgba(${value},${value},${value},${alpha})`;
      const radius = 0.35 + random() * (pattern === "stone" ? 3.2 : 1.7);
      context.beginPath();
      context.ellipse(random() * size, random() * size, radius, radius * (0.45 + random()), random() * Math.PI, 0, Math.PI * 2);
      context.fill();
    }

    context.lineCap = "round";
    if (pattern === "wall") {
      for (let y = 8; y < size; y += 13 + Math.floor(random() * 7)) {
        context.strokeStyle = `rgba(86,72,55,${0.09 + random() * 0.08})`;
        context.lineWidth = 1 + random();
        context.beginPath();
        context.moveTo(0, y + (random() - 0.5) * 3);
        for (let x = 0; x <= size; x += 12) context.lineTo(x, y + Math.sin(x * 0.11 + y) * 1.5 + (random() - 0.5));
        context.stroke();
      }
      for (let index = 0; index < 8; index += 1) {
        const x = random() * size;
        const y = random() * size;
        context.strokeStyle = "rgba(71,61,49,0.15)";
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + (random() - 0.5) * 8, y + 7 + random() * 17);
        context.stroke();
      }
    } else if (pattern === "roof") {
      context.strokeStyle = "rgba(64,68,69,0.28)";
      context.lineWidth = Math.max(1, size / 90);
      const columnWidth = size / 8;
      for (let column = -1; column <= 8; column += 1) {
        const x = column * columnWidth;
        context.beginPath();
        context.moveTo(x, 0);
        context.bezierCurveTo(x - columnWidth * 0.2, size * 0.34, x + columnWidth * 0.2, size * 0.66, x, size);
        context.stroke();
      }
      for (let row = 1; row < 6; row += 1) {
        context.strokeStyle = "rgba(235,236,229,0.08)";
        context.beginPath();
        context.moveTo(0, (row / 6) * size);
        context.lineTo(size, (row / 6) * size + 1);
        context.stroke();
      }
    } else if (pattern === "wood") {
      for (let index = 0; index < 18; index += 1) {
        const x = (index / 18) * size + (random() - 0.5) * 3;
        context.strokeStyle = `rgba(69,46,31,${0.08 + random() * 0.14})`;
        context.lineWidth = 0.6 + random() * 1.5;
        context.beginPath();
        context.moveTo(x, 0);
        context.bezierCurveTo(x + 4, size * 0.28, x - 4, size * 0.72, x + 2, size);
        context.stroke();
      }
      for (let index = 0; index < 4; index += 1) {
        context.strokeStyle = "rgba(48,31,22,0.18)";
        context.beginPath();
        context.ellipse(random() * size, random() * size, 3 + random() * 5, 1.4 + random() * 2, random() * 0.3, 0, Math.PI * 2);
        context.stroke();
      }
    } else if (pattern === "stone") {
      context.strokeStyle = "rgba(70,78,77,0.2)";
      context.lineWidth = 1;
      for (let index = 0; index < 16; index += 1) {
        const x = random() * size;
        const y = random() * size;
        context.beginPath();
        context.moveTo(x, y);
        context.lineTo(x + (random() - 0.5) * 17, y + (random() - 0.5) * 12);
        context.lineTo(x + (random() - 0.5) * 22, y + (random() - 0.5) * 19);
        context.stroke();
      }
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.name = options.name || `Texture_Procedural${pattern}`;
  if (THREE.RepeatWrapping != null && pattern !== "fog") texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat?.set?.(options.repeatX ?? 1, options.repeatY ?? 1);
  if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

function CreateImageSurfaceTexture(THREE, url, options = {}) {
  if (typeof document === "undefined" || !THREE.TextureLoader) return null;
  function ConfigureTexture(texture) {
    if (!texture) return;
    texture.name = options.name || "Texture_ImageSurface";
    const wrapMode = options.mirroredRepeat && THREE.MirroredRepeatWrapping != null
      ? THREE.MirroredRepeatWrapping
      : THREE.RepeatWrapping;
    if (wrapMode != null) texture.wrapS = texture.wrapT = wrapMode;
    texture.repeat?.set?.(options.repeatX ?? 1, options.repeatY ?? 1);
    texture.offset?.set?.(options.offsetX ?? 0, options.offsetY ?? 0);
    texture.center?.set?.(0.5, 0.5);
    texture.rotation = Number(options.rotation) || 0;
    if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
    if (THREE.LinearMipmapLinearFilter != null) texture.minFilter = THREE.LinearMipmapLinearFilter;
    if (THREE.LinearFilter != null) texture.magFilter = THREE.LinearFilter;
    texture.generateMipmaps = true;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
  }
  let texture = null;
  texture = new THREE.TextureLoader().load(
    url,
    (loadedTexture) => ConfigureTexture(loadedTexture),
    undefined,
    () => {
      if (options.fallbackTexture?.image) {
        texture.image = options.fallbackTexture.image;
        texture.needsUpdate = true;
      }
    },
  );
  ConfigureTexture(texture);
  return texture;
}

function ConfigureTerrainMaterial(material, detailTexture) {
  if (!material || !detailTexture) return material;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.terrainDetailMap = { value: detailTexture };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vTerrainWorldPosition;`,
      )
      .replace(
        "#include <project_vertex>",
        `vTerrainWorldPosition = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;
#include <project_vertex>`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vTerrainWorldPosition;
uniform sampler2D terrainDetailMap;

float TerrainHash( vec2 position ) {
  return fract( sin( dot( position, vec2( 127.1, 311.7 ) ) ) * 43758.5453123 );
}

float TerrainValueNoise( vec2 position ) {
  vec2 cell = floor( position );
  vec2 localPosition = fract( position );
  localPosition = localPosition * localPosition * ( 3.0 - 2.0 * localPosition );
  float valueA = TerrainHash( cell );
  float valueB = TerrainHash( cell + vec2( 1.0, 0.0 ) );
  float valueC = TerrainHash( cell + vec2( 0.0, 1.0 ) );
  float valueD = TerrainHash( cell + vec2( 1.0, 1.0 ) );
  return mix( mix( valueA, valueB, localPosition.x ), mix( valueC, valueD, localPosition.x ), localPosition.y );
}`,
      )
      .replace(
        "#include <map_fragment>",
        `#ifdef USE_MAP
  vec2 terrainPosition = vTerrainWorldPosition.xz;
  mat2 terrainRotation = mat2( 0.8480, -0.5299, 0.5299, 0.8480 );
  vec3 imageLayerA = texture2D( map, terrainPosition / 42.0 + vec2( 0.17, 0.31 ) ).rgb;
  vec3 imageLayerB = texture2D( map, terrainRotation * terrainPosition / 57.0 + vec2( 0.63, 0.09 ) ).rgb;
  float twelveMeterMask = smoothstep( 0.24, 0.76, TerrainValueNoise( terrainPosition / 12.0 + vec2( 4.2, -2.7 ) ) );
  vec3 imageLayer = mix( imageLayerA, imageLayerB, twelveMeterMask );

  float viewDistance = length( vViewPosition );
  float farDetailFade = smoothstep( 20.0, 92.0, viewDistance );
  float imageContrast = mix( 0.54, 0.35, farDetailFade );
  imageLayer = mix( vec3( 0.38, 0.315, 0.255 ), imageLayer, imageContrast );

  vec3 threeMeterSample = texture2D(
    terrainDetailMap,
    terrainRotation * terrainPosition / 3.0 + vec2( 0.21, 0.48 )
  ).rgb;
  vec3 halfMeterSample = texture2D(
    terrainDetailMap,
    terrainPosition / 0.5 + vec2( 0.37, 0.14 )
  ).rgb;
  float macroTone = ( TerrainValueNoise( terrainPosition / 12.0 ) - 0.5 ) * 0.19;
  float threeMeterTone = ( dot( threeMeterSample, vec3( 0.299, 0.587, 0.114 ) ) - 0.55 ) * 0.24;
  float halfMeterTone = ( dot( halfMeterSample, vec3( 0.299, 0.587, 0.114 ) ) - 0.55 ) * 0.075;
  float farFrequencyContrast = mix( 1.0, 0.35, farDetailFade );
  float surfaceTone = macroTone
    + threeMeterTone * farFrequencyContrast
    + halfMeterTone * farFrequencyContrast;
  diffuseColor.rgb *= max( imageLayer * ( 1.0 + surfaceTone ), vec3( 0.055 ) );
#endif`,
      );
  };
  material.customProgramCacheKey = () => "AshenRouteTerrainThreeScaleV2";
  material.userData.terrainScaleMeters = Object.freeze({
    micro: 0.5,
    intermediate: 3,
    macro: 12,
    farContrast: 0.35,
  });
  material.needsUpdate = true;
  return material;
}

export function CreateMaterialLibrary(THREE) {
  const flatShading = true;
  const CreateStandard = (name, color, options = {}) => {
    const parameters = {
      color,
      roughness: options.roughness ?? 0.92,
      metalness: options.metalness ?? 0,
      flatShading: options.flatShading ?? flatShading,
      vertexColors: options.vertexColors ?? false,
      transparent: options.transparent ?? false,
      opacity: options.opacity ?? 1,
      emissive: options.emissive ?? 0x000000,
      emissiveIntensity: options.emissiveIntensity ?? 0,
      depthWrite: options.depthWrite ?? true,
      dithering: true,
    };
    if (options.side != null) parameters.side = options.side;
    if (options.map) parameters.map = options.map;
    if (options.bumpMap) {
      parameters.bumpMap = options.bumpMap;
      parameters.bumpScale = options.bumpScale ?? 0.04;
    }
    if (options.roughnessMap) parameters.roughnessMap = options.roughnessMap;
    const material = new THREE.MeshStandardMaterial(parameters);
    material.name = name;
    return material;
  };

  const soilTexture = CreateSurfaceTexture(THREE, { name: "Texture_WetLoess", pattern: "soil", seed: 321, repeatX: 12, repeatY: 16 });
  const soilReliefTexture = CreateSurfaceTexture(THREE, {
    name: "Texture_WetLoessMicroRelief",
    pattern: "soil",
    seed: 1642,
    repeatX: 34,
    repeatY: 42,
    base: "#928778",
  });
  if (soilReliefTexture && THREE.NoColorSpace != null) soilReliefTexture.colorSpace = THREE.NoColorSpace;
  const groundTexture = CreateImageSurfaceTexture(THREE, wetLoessGroundUrl, {
    name: "Texture_WetLoessGround",
    repeatX: 1,
    repeatY: 1,
    offsetX: 0.11,
    offsetY: 0.19,
    rotation: 0.072,
    mirroredRepeat: true,
    fallbackTexture: soilTexture,
  });
  const wallTexture = CreateSurfaceTexture(THREE, { name: "Texture_RammedEarth", pattern: "wall", seed: 614, repeatX: 3, repeatY: 2 });
  const stoneTexture = CreateSurfaceTexture(THREE, { name: "Texture_FieldStone", pattern: "stone", seed: 907, repeatX: 3, repeatY: 3 });
  const roofTexture = CreateSurfaceTexture(THREE, { name: "Texture_WeatheredTile", pattern: "roof", seed: 114, repeatX: 6, repeatY: 4 });
  const woodTexture = CreateSurfaceTexture(THREE, { name: "Texture_AgedTimber", pattern: "wood", seed: 739, repeatX: 2, repeatY: 5 });
  const materials = {
    terrain: CreateStandard("Material_TerrainLoess", 0xffffff, {
      vertexColors: true,
      map: groundTexture || soilTexture,
      bumpMap: soilReliefTexture,
      bumpScale: 0.055,
      flatShading: false,
      roughness: 0.97,
      metalness: 0,
    }),
    road: CreateStandard("Material_RoadPackedEarth", 0x725a43, { vertexColors: true, map: soilTexture, flatShading: false, roughness: 0.88 }),
    roadRut: CreateStandard("Material_RoadCartRut", 0x3f342b, { map: soilTexture, flatShading: false, roughness: 0.98 }),
    roadWash: CreateStandard("Material_RoadIrregularMudWash", 0x4d4036, {
      flatShading: false,
      roughness: 1,
      transparent: true,
      opacity: 0.38,
      depthWrite: false,
    }),
    wall: CreateStandard("Material_WallRammedEarth", 0xa08761, { map: wallTexture }),
    wallDark: CreateStandard("Material_WallSoot", 0x62584d, { map: wallTexture }),
    wallDamp: CreateStandard("Material_WallGroundDamp", 0x554b3f, {
      map: wallTexture,
      roughness: 1,
    }),
    stone: CreateStandard("Material_StoneBlueGrey", 0x747c77, { map: stoneTexture }),
    roof: CreateStandard("Material_RoofWeatheredTile", 0x565b5c, { map: roofTexture, roughness: 0.88 }),
    roofStraw: CreateStandard("Material_RoofDryStraw", 0x7b6844),
    timber: CreateStandard("Material_TimberCharred", 0x514238, { map: woodTexture }),
    field: CreateStandard("Material_FieldStubble", 0x75613d),
    foliage: CreateStandard("Material_FoliageWinterOlive", 0x59634d, { side: THREE.DoubleSide }),
    mountainNear: CreateStandard("Material_MountainNear", 0x293438, { flatShading: true }),
    mountain: CreateStandard("Material_MountainMiddle", 0x3b484d, { flatShading: true }),
    mountainFar: CreateStandard("Material_MountainFar", 0x536269, { flatShading: true }),
    ash: CreateStandard("Material_AshCharcoal", 0x373a38),
    limeDust: CreateStandard("Material_WeatheredLimeDust", 0xb0aa98, {
      roughness: 1,
      emissive: 0x3d362a,
      emissiveIntensity: 0.08,
    }),
    wetMud: CreateStandard("Material_PuddleWetMud", 0x3b342c, {
      map: soilTexture,
      flatShading: false,
      roughness: 0.78,
    }),
    mudEdge: CreateStandard("Material_PuddleRaisedMudEdge", 0x514437, {
      map: soilTexture,
      flatShading: true,
      roughness: 0.96,
    }),
    wetEarth: CreateStandard("Material_ShallowRainwater", 0x45565b, {
      roughness: 0.42,
      metalness: 0.03,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    clothMarker: CreateStandard("Material_ClothFadedCinnabar", 0x6d332c, { side: THREE.DoubleSide }),
    glassWarm: CreateStandard("Material_LanternWarm", 0x8d5a31, {
      emissive: 0xe38742,
      emissiveIntensity: 2.1,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    }),
  };
  const fogTexture = CreateSurfaceTexture(THREE, { name: "Texture_LowMistBand", pattern: "fog" });
  materials.fogBand = new THREE.MeshBasicMaterial({
    name: "Material_LowMistBand",
    color: 0xb5c2c5,
    map: fogTexture,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  ConfigureTerrainMaterial(materials.terrain, soilReliefTexture);
  return materials;
}

function CreateTerrain(THREE, materials, profile) {
  const geometry = new THREE.PlaneGeometry(238, 304, profile.terrainSegments, profile.terrainSegments + 12);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.getAttribute("position");
  const colors = new Float32Array(position.count * 3);
  const lowColor = new THREE.Color(0xb7b3aa);
  const highColor = new THREE.Color(0xf1e4ce);
  const dustColor = new THREE.Color(0xd1b68d);
  const wetColor = new THREE.Color(0x819195);
  const clayColor = new THREE.Color(0x9c8168);
  const mossColor = new THREE.Color(0x6f7770);
  for (let index = 0; index < position.count; index += 1) {
    const x = position.getX(index);
    const z = position.getZ(index) - 18;
    const y = GetTerrainHeight(x, z);
    position.setXYZ(index, x, y, z);
    const mix = Clamp((y + 2.5) / 6.5);
    const color = lowColor.clone().lerp(highColor, mix);
    const moisture = Clamp(
      0.36
      + Math.sin(x * 0.18 + z * 0.11) * 0.16
      + Math.cos(x * 0.07 - z * 0.13) * 0.1
      - y * 0.055,
    );
    color.lerp(wetColor, moisture * 0.24);
    const macroClay = Clamp(0.5 + Math.sin(x * 0.031 + z * 0.018) * 0.28 + Math.cos(z * 0.026 - x * 0.014) * 0.22);
    const drainage = Clamp(0.5 + Math.sin(x * 0.052 - z * 0.037) * 0.3 + Math.cos((x + z) * 0.021) * 0.2);
    color.lerp(clayColor, macroClay * 0.13);
    color.lerp(mossColor, moisture * drainage * 0.09);
    if (Math.abs(x - GetRouteCenterX(z)) < 7 + Math.sin(z * 0.06) * 2) color.lerp(dustColor, 0.38);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, materials.terrain);
  mesh.name = "Scene_LoessTerrain";
  mesh.receiveShadow = true;
  return mesh;
}

function CreateRoadRibbon(THREE, materials, profile) {
  const anchors = MissionRouteAnchors.map(([x, z]) => new THREE.Vector3(x, GetTerrainHeight(x, z) + 0.07, z));
  const curve = new THREE.CatmullRomCurve3(anchors, false, "centripetal", 0.5);
  const vertices = [];
  const colors = [];
  const indices = [];
  const roadA = new THREE.Color(0x594735);
  const roadB = new THREE.Color(0x6a533b);
  for (let index = 0; index <= profile.roadSamples; index += 1) {
    const t = index / profile.roadSamples;
    const point = curve.getPoint(t);
    const tangent = curve.getTangent(t);
    const lateral = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const width = 2.25 + Math.sin(t * Math.PI * 5) * 0.24;
    for (const side of [-1, 1]) {
      const edge = point.clone().addScaledVector(lateral, width * side);
      edge.y = GetTerrainHeight(edge.x, edge.z) + 0.11;
      vertices.push(edge.x, edge.y, edge.z);
      const color = roadA.clone().lerp(roadB, 0.35 + 0.3 * Math.sin(t * 14 + side));
      colors.push(color.r, color.g, color.b);
    }
    if (index < profile.roadSamples) {
      const base = index * 2;
      indices.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, materials.road);
  mesh.name = "Scene_SecretTrafficTrack";
  mesh.receiveShadow = true;
  mesh.userData.curve = curve;
  return mesh;
}

function CreateRoadDetailStrip(THREE, curve, materials, profile, lateralOffset, width, name, material = materials.roadRut) {
  const vertices = [];
  const indices = [];
  const sampleCount = Math.max(18, Math.floor(profile.roadSamples * 0.82));
  for (let index = 0; index <= sampleCount; index += 1) {
    const t = index / sampleCount;
    const point = curve.getPoint(t);
    const tangent = curve.getTangent(t);
    const lateral = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const center = point.clone().addScaledVector(lateral, lateralOffset + Math.sin(t * 38) * 0.055);
    const localWidth = width * (
      0.82
      + Math.sin(t * 31 + lateralOffset * 2.7) * 0.12
      + Math.sin(t * 83 - lateralOffset) * 0.06
    );
    for (const side of [-1, 1]) {
      const edge = center.clone().addScaledVector(lateral, localWidth * 0.5 * side);
      edge.y = GetTerrainHeight(edge.x, edge.z) + 0.125;
      vertices.push(edge.x, edge.y, edge.z);
    }
    if (index < sampleCount) {
      const base = index * 2;
      indices.push(base, base + 2, base + 1, base + 2, base + 3, base + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const strip = new THREE.Mesh(geometry, material);
  strip.name = name;
  strip.receiveShadow = true;
  return strip;
}

function CreateIrregularGroundPatchGeometry(THREE, seed, segments = 18) {
  const random = CreateSeededRandom(seed);
  const vertices = [0, 0, 0];
  const indices = [];
  const radii = Array.from({ length: segments }, (_, index) => (
    0.82
    + random() * 0.22
    + Math.sin(index * 1.91 + seed * 0.013) * 0.055
  ));
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    vertices.push(Math.cos(angle) * radii[index], 0, Math.sin(angle) * radii[index]);
    indices.push(0, index + 1, ((index + 1) % segments) + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function CreateIrregularGroundRingGeometry(THREE, seed, segments = 18) {
  const random = CreateSeededRandom(seed);
  const vertices = [];
  const indices = [];
  for (let index = 0; index < segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    const outerRadius = 0.9 + random() * 0.19 + Math.sin(index * 2.17) * 0.045;
    const rimWidth = 0.13 + random() * 0.055;
    vertices.push(
      Math.cos(angle) * outerRadius, 0.006 + (index % 3) * 0.003, Math.sin(angle) * outerRadius,
      Math.cos(angle) * (outerRadius - rimWidth), 0, Math.sin(angle) * (outerRadius - rimWidth),
    );
  }
  for (let index = 0; index < segments; index += 1) {
    const next = (index + 1) % segments;
    const outer = index * 2;
    const inner = outer + 1;
    const nextOuter = next * 2;
    const nextInner = nextOuter + 1;
    indices.push(outer, nextOuter, inner, nextOuter, nextInner, inner);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function CreateWinterGrassGeometry(THREE) {
  const vertices = [];
  const indices = [];
  const bladeAngles = [0.18, 1.16, 2.08, 2.82, 4.1, 5.22];
  bladeAngles.forEach((angle, bladeIndex) => {
    const baseIndex = vertices.length / 3;
    const offsetRadius = bladeIndex % 2 ? 0.055 : 0.025;
    const offsetX = Math.cos(angle * 1.7) * offsetRadius;
    const offsetZ = Math.sin(angle * 1.7) * offsetRadius;
    const halfWidth = 0.035 + (bladeIndex % 3) * 0.007;
    const sideX = Math.cos(angle) * halfWidth;
    const sideZ = Math.sin(angle) * halfWidth;
    const lean = 0.11 + (bladeIndex % 2) * 0.045;
    const height = 0.42 + (bladeIndex % 3) * 0.105;
    vertices.push(
      offsetX - sideX, 0, offsetZ - sideZ,
      offsetX + sideX, 0, offsetZ + sideZ,
      offsetX + Math.sin(angle) * lean, height, offsetZ + Math.cos(angle) * lean,
    );
    indices.push(baseIndex, baseIndex + 1, baseIndex + 2);
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function CreateGroundDetails(THREE, materials, profile, road) {
  const group = new THREE.Group();
  group.name = "Scene_GroundStoryDetails";
  const curve = road.userData.curve;
  group.add(
    CreateRoadDetailStrip(THREE, curve, materials, profile, -0.66, 0.72, "Scene_LeftWagonMudWash", materials.roadWash),
    CreateRoadDetailStrip(THREE, curve, materials, profile, 0, 0.42, "Scene_CenterFootTrafficMudWash", materials.roadWash),
    CreateRoadDetailStrip(THREE, curve, materials, profile, 0.69, 0.78, "Scene_RightWagonMudWash", materials.roadWash),
    CreateRoadDetailStrip(THREE, curve, materials, profile, -0.78, 0.2, "Scene_LeftCartRut"),
    CreateRoadDetailStrip(THREE, curve, materials, profile, 0.78, 0.2, "Scene_RightCartRut"),
  );

  const dummy = new THREE.Object3D();
  const random = CreateSeededRandom(28011942);
  const stoneGeometry = new THREE.DodecahedronGeometry(0.22, 0);
  const stones = new THREE.InstancedMesh(stoneGeometry, materials.stone, profile.groundStones);
  stones.name = "Scene_InstancedRoadsideStoneScatter";
  stones.castShadow = true;
  stones.receiveShadow = true;
  for (let index = 0; index < profile.groundStones; index += 1) {
    const z = 78 - random() * 183;
    const side = random() < 0.5 ? -1 : 1;
    const x = GetRouteCenterX(z) + side * (3 + random() * 18);
    const scale = 0.45 + random() * 1.45;
    dummy.position.set(x, GetTerrainHeight(x, z) + 0.08 * scale, z);
    dummy.rotation.set(random() * 0.45, random() * Math.PI * 2, random() * 0.35);
    dummy.scale.set(scale * (0.75 + random() * 0.5), scale * (0.45 + random() * 0.42), scale);
    dummy.updateMatrix();
    stones.setMatrixAt(index, dummy.matrix);
    stones.setColorAt?.(index, new THREE.Color(index % 4 === 0 ? 0x5b625d : 0x74756c));
  }
  stones.instanceMatrix.needsUpdate = true;
  if (stones.instanceColor) stones.instanceColor.needsUpdate = true;
  group.add(stones);

  const grassGeometry = CreateWinterGrassGeometry(THREE);
  const grass = new THREE.InstancedMesh(grassGeometry, materials.foliage, profile.grassClumps);
  grass.name = "Scene_InstancedWinterGrass";
  grass.castShadow = false;
  grass.receiveShadow = true;
  for (let index = 0; index < profile.grassClumps; index += 1) {
    const z = 76 - random() * 177;
    const side = random() < 0.5 ? -1 : 1;
    const x = GetRouteCenterX(z) + side * (2.7 + random() * 21);
    dummy.position.set(x, GetTerrainHeight(x, z) + 0.025, z);
    dummy.rotation.set((random() - 0.5) * 0.12, random() * Math.PI * 2, (random() - 0.5) * 0.25);
    const scale = 0.6 + random() * 1.15;
    dummy.scale.set(0.8 + random() * 0.7, scale, 0.8 + random() * 0.7);
    dummy.updateMatrix();
    grass.setMatrixAt(index, dummy.matrix);
    grass.setColorAt?.(index, new THREE.Color(index % 3 === 0 ? 0x6b6746 : 0x4c5844));
  }
  grass.instanceMatrix.needsUpdate = true;
  if (grass.instanceColor) grass.instanceColor.needsUpdate = true;
  group.add(grass);

  const leafGeometry = new THREE.CircleGeometry(0.16, 3);
  leafGeometry.rotateX(-Math.PI / 2);
  const leaves = new THREE.InstancedMesh(leafGeometry, materials.field, profile.fallenLeaves);
  leaves.name = "Scene_InstancedWindblownLeaves";
  leaves.receiveShadow = true;
  for (let index = 0; index < profile.fallenLeaves; index += 1) {
    const z = 70 - random() * 165;
    const x = GetRouteCenterX(z) + (random() - 0.5) * 15;
    dummy.position.set(x, GetTerrainHeight(x, z) + 0.055, z);
    dummy.rotation.set((random() - 0.5) * 0.18, random() * Math.PI * 2, (random() - 0.5) * 0.18);
    const scale = 0.6 + random() * 1.5;
    dummy.scale.set(scale * (0.45 + random()), scale, scale);
    dummy.updateMatrix();
    leaves.setMatrixAt(index, dummy.matrix);
  }
  leaves.instanceMatrix.needsUpdate = true;
  group.add(leaves);

  const puddleGeometry = new THREE.CircleGeometry(1, 16);
  puddleGeometry.rotateX(-Math.PI / 2);
  const puddleRimGeometry = CreateIrregularGroundRingGeometry(THREE, 19420918, 18);
  const puddleRims = new THREE.InstancedMesh(puddleRimGeometry, materials.mudEdge, profile.puddles);
  puddleRims.name = "Scene_InstancedPuddleErodedRims";
  puddleRims.receiveShadow = true;
  const puddleBeds = new THREE.InstancedMesh(puddleGeometry, materials.wetMud, profile.puddles);
  puddleBeds.name = "Scene_InstancedPuddleDarkMud";
  puddleBeds.receiveShadow = true;
  const puddles = new THREE.InstancedMesh(puddleGeometry, materials.wetEarth, profile.puddles);
  puddles.name = "Scene_InstancedShallowPuddles";
  puddles.receiveShadow = true;
  for (let index = 0; index < profile.puddles; index += 1) {
    const t = 0.06 + ((index + 0.45) / profile.puddles) * 0.88;
    const point = curve.getPoint(t);
    const lateral = curve.getTangent(t);
    const yaw = Math.atan2(lateral.x, lateral.z);
    const side = index % 2 ? -0.48 : 0.53;
    point.x += Math.cos(yaw) * side;
    point.z -= Math.sin(yaw) * side;
    dummy.position.set(point.x, GetTerrainHeight(point.x, point.z) + 0.115, point.z);
    dummy.rotation.set(0, yaw, 0);
    dummy.scale.set(0.41 + random() * 0.52, 1, 1.02 + random() * 1.38);
    dummy.updateMatrix();
    puddleBeds.setMatrixAt(index, dummy.matrix);
    dummy.position.y += 0.006;
    dummy.scale.set(dummy.scale.x * 1.14, 1, dummy.scale.z * 1.1);
    dummy.updateMatrix();
    puddleRims.setMatrixAt(index, dummy.matrix);
    dummy.position.y += 0.006;
    dummy.scale.set(dummy.scale.x * 0.77, 1, dummy.scale.z * 0.8);
    dummy.updateMatrix();
    puddles.setMatrixAt(index, dummy.matrix);
  }
  puddleRims.instanceMatrix.needsUpdate = true;
  puddleBeds.instanceMatrix.needsUpdate = true;
  puddles.instanceMatrix.needsUpdate = true;
  group.add(puddleBeds, puddleRims, puddles);

  const dampPatchCount = profile.puddles + 8;
  const dampPatchGeometry = CreateIrregularGroundPatchGeometry(THREE, 19421103, 17);
  const dampPatches = new THREE.InstancedMesh(dampPatchGeometry, materials.roadWash, dampPatchCount);
  dampPatches.name = "Scene_InstancedRoadShoulderDampPatches";
  dampPatches.receiveShadow = true;
  for (let index = 0; index < dampPatchCount; index += 1) {
    const t = 0.035 + ((index + 0.35) / dampPatchCount) * 0.93;
    const point = curve.getPoint(t);
    const tangent = curve.getTangent(t);
    const lateral = new THREE.Vector3(-tangent.z, 0, tangent.x).normalize();
    const side = index % 2 ? -1 : 1;
    point.addScaledVector(lateral, side * (1.25 + random() * 0.82));
    dummy.position.set(point.x, GetTerrainHeight(point.x, point.z) + 0.121, point.z);
    dummy.rotation.set(0, Math.atan2(tangent.x, tangent.z) + (random() - 0.5) * 0.28, 0);
    dummy.scale.set(0.34 + random() * 0.45, 1, 0.78 + random() * 1.48);
    dummy.updateMatrix();
    dampPatches.setMatrixAt(index, dummy.matrix);
    dampPatches.setColorAt?.(index, new THREE.Color(index % 3 === 0 ? 0x403830 : 0x5d4b3d));
  }
  dampPatches.instanceMatrix.needsUpdate = true;
  if (dampPatches.instanceColor) dampPatches.instanceColor.needsUpdate = true;
  group.add(dampPatches);
  return group;
}

function CreateGableRoofGeometry(THREE, width, depth, height) {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const vertices = new Float32Array([
    -halfWidth, 0, -halfDepth,
    halfWidth, 0, -halfDepth,
    -halfWidth, 0, halfDepth,
    halfWidth, 0, halfDepth,
    0, height, -halfDepth,
    0, height, halfDepth,
  ]);
  const indices = [
    0, 2, 5, 0, 5, 4,
    1, 4, 5, 1, 5, 3,
    0, 4, 1,
    2, 3, 5,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function CreateErodedWallBlockGeometry(THREE, width, height, depth, seed, chamfer = 0.14) {
  const halfWidth = width * 0.5;
  const halfDepth = depth * 0.5;
  const edgeCut = Math.min(chamfer, halfWidth * 0.22, halfDepth * 0.22);
  const random = CreateSeededRandom(seed);
  const outline = [
    [-halfWidth + edgeCut, -halfDepth],
    [halfWidth - edgeCut, -halfDepth],
    [halfWidth, -halfDepth + edgeCut],
    [halfWidth, halfDepth - edgeCut],
    [halfWidth - edgeCut, halfDepth],
    [-halfWidth + edgeCut, halfDepth],
    [-halfWidth, halfDepth - edgeCut],
    [-halfWidth, -halfDepth + edgeCut],
  ];
  const vertices = [];
  outline.forEach(([x, z], index) => {
    const inset = index % 3 === 0 ? (random() - 0.5) * 0.055 : 0;
    vertices.push(x * (1 - inset), (random() - 0.5) * 0.025, z * (1 - inset));
  });
  outline.forEach(([x, z], index) => {
    const weathering = 0.025 + random() * 0.085 + (index % 3 === 1 ? 0.045 : 0);
    const inset = 0.006 + random() * 0.018;
    vertices.push(x * (1 - inset), height - weathering, z * (1 - inset));
  });
  const indices = [];
  for (let index = 0; index < outline.length; index += 1) {
    const next = (index + 1) % outline.length;
    indices.push(index, index + 8, next, next, index + 8, next + 8);
  }
  for (let index = 1; index < outline.length - 1; index += 1) {
    indices.push(0, index + 1, index);
    indices.push(8, index + 8, index + 9);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function CreateVillageHouse(THREE, materials, options = {}) {
  const group = new THREE.Group();
  group.name = options.name || "Scene_VillageHouse";
  const width = options.width ?? 6.2;
  const depth = options.depth ?? 4.6;
  const wallHeight = options.wallHeight ?? 2.8;
  const wallMaterial = options.sooted ? materials.wallDark : materials.wall;
  const houseSeed = Math.round(width * 137 + depth * 83 + wallHeight * 47 + (options.sooted ? 911 : 0));
  const foundation = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(width + 0.24, 0.38, depth + 0.24), materials.stone));
  foundation.position.y = 0.19;
  foundation.scale.z = 0.98;
  group.add(foundation);
  const walls = MarkMesh(new THREE.Mesh(
    CreateErodedWallBlockGeometry(THREE, width, wallHeight, depth, houseSeed, 0.16),
    wallMaterial,
  ));
  walls.position.y = 0.2;
  const dampSkirt = MarkMesh(new THREE.Mesh(
    CreateErodedWallBlockGeometry(THREE, width + 0.075, 0.38, depth + 0.075, houseSeed + 31, 0.19),
    materials.wallDamp,
  ));
  dampSkirt.position.y = 0.17;
  group.add(walls, dampSkirt);

  const contactStoneCount = 8;
  const contactStoneGeometry = new THREE.DodecahedronGeometry(0.16, 0);
  const contactStones = new THREE.InstancedMesh(contactStoneGeometry, materials.stone, contactStoneCount);
  contactStones.name = "Scene_HouseFoundationContactStones";
  contactStones.castShadow = true;
  contactStones.receiveShadow = true;
  const contactDummy = new THREE.Object3D();
  const contactRandom = CreateSeededRandom(houseSeed + 73);
  for (let index = 0; index < contactStoneCount; index += 1) {
    const front = index < contactStoneCount * 0.65;
    const x = (contactRandom() - 0.5) * (width - 0.45);
    const z = front
      ? depth * 0.5 + 0.12 + contactRandom() * 0.11
      : (contactRandom() < 0.5 ? -1 : 1) * (depth * 0.5 + 0.08);
    const scale = 0.62 + contactRandom() * 0.72;
    contactDummy.position.set(x, 0.14 + contactRandom() * 0.08, z);
    contactDummy.rotation.set(contactRandom() * 0.35, contactRandom() * Math.PI, contactRandom() * 0.25);
    contactDummy.scale.set(scale * (0.9 + contactRandom() * 0.5), scale * 0.58, scale);
    contactDummy.updateMatrix();
    contactStones.setMatrixAt(index, contactDummy.matrix);
  }
  contactStones.instanceMatrix.needsUpdate = true;
  group.add(contactStones);

  const roofGeometry = CreateGableRoofGeometry(THREE, width + 0.75, depth + 0.65, 1.45);
  const roof = MarkMesh(new THREE.Mesh(roofGeometry, options.straw ? materials.roofStraw : materials.roof));
  roof.position.y = wallHeight + 0.18;
  group.add(roof);

  const ridge = MarkMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.12, depth + 0.94, 8), materials.roof));
  ridge.rotation.x = Math.PI / 2;
  ridge.position.y = wallHeight + 1.64;
  group.add(ridge);
  for (const side of [-1, 1]) {
    const eave = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(width + 0.85, 0.13, 0.2), materials.timber));
    eave.position.set(0, wallHeight + 0.15, side * (depth / 2 + 0.3));
    group.add(eave);
  }
  for (const side of [-1, 1]) {
    const gableTie = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(width + 0.28, 0.12, 0.14), materials.timber));
    gableTie.position.set(0, wallHeight + 0.21, side * (depth / 2 + 0.09));
    group.add(gableTie);
  }
  for (const x of [-width / 2 + 0.12, width / 2 - 0.12]) {
    for (const z of [-depth / 2 - 0.025, depth / 2 + 0.025]) {
      const cornerPost = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(0.16, wallHeight - 0.12, 0.16), materials.timber));
      cornerPost.position.set(x, wallHeight / 2 + 0.23, z);
      group.add(cornerPost);
    }
  }
  if (!options.straw) {
    const ribCount = 5;
    for (let index = 0; index < ribCount; index += 1) {
      const x = ((index + 1) / (ribCount + 1) - 0.5) * width;
      const rib = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.07, depth + 0.76), materials.roof));
      rib.position.set(x, wallHeight + 0.28 + (1 - Math.abs(x) / (width * 0.5)) * 1.26, 0);
      rib.rotation.z = -Math.sign(x || 1) * 0.43;
      group.add(rib);
    }
  }

  const door = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(1.15, 2.1, 0.12), materials.timber));
  door.position.set(options.doorOffset ?? 0.7, 1.23, depth / 2 + 0.07);
  group.add(door);
  const lintel = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(1.55, 0.17, 0.22), materials.timber));
  lintel.position.set(door.position.x, 2.38, depth / 2 + 0.12);
  group.add(lintel);
  for (const side of [-1, 1]) {
    const doorPost = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(0.16, 2.25, 0.2), materials.timber));
    doorPost.position.set(door.position.x + side * 0.67, 1.23, depth / 2 + 0.12);
    group.add(doorPost);
  }
  for (const offset of [-0.36, -0.12, 0.12, 0.36]) {
    const doorSeam = new THREE.Mesh(new THREE.BoxGeometry(0.018, 1.95, 0.022), materials.wallDark);
    doorSeam.position.set(door.position.x + offset, 1.23, depth / 2 + 0.145);
    group.add(doorSeam);
  }
  const brace = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(1.01, 0.1, 0.08), materials.wallDark));
  brace.position.set(door.position.x, 1.31, depth / 2 + 0.17);
  brace.rotation.z = -0.18;
  group.add(brace);
  const step = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(1.75, 0.22, 0.72), materials.stone));
  step.position.set(door.position.x, 0.11, depth / 2 + 0.43);
  group.add(step);

  const windowOpening = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.72, 0.1), materials.wallDark));
  windowOpening.position.set(-1.45, 1.73, depth / 2 + 0.06);
  group.add(windowOpening);
  const crossbarA = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.72, 0.16), materials.timber));
  const crossbarB = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(0.78, 0.06, 0.16), materials.timber));
  crossbarA.position.copy(windowOpening.position).z += 0.07;
  crossbarB.position.copy(windowOpening.position).z += 0.07;
  group.add(crossbarA, crossbarB);

  if (options.warmInterior) {
    const warmWindow = new THREE.Mesh(new THREE.PlaneGeometry(0.64, 0.56), materials.glassWarm);
    warmWindow.name = "Scene_TrafficStationWindowGlow";
    warmWindow.position.copy(windowOpening.position);
    warmWindow.position.z += 0.085;
    group.add(warmWindow);
    const marker = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.2), materials.clothMarker);
    marker.position.set(door.position.x + 0.37, 1.72, depth / 2 + 0.16);
    group.add(marker);
  }

  if (options.mill) {
    const wheel = new THREE.Group();
    wheel.name = "Scene_OldMillWoodenWheel";
    const rim = MarkMesh(new THREE.Mesh(new THREE.TorusGeometry(1.02, 0.075, 7, 20), materials.timber));
    wheel.add(rim);
    for (let index = 0; index < 8; index += 1) {
      const spoke = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(1.84, 0.065, 0.065), materials.timber));
      spoke.rotation.z = (index / 8) * Math.PI;
      wheel.add(spoke);
    }
    const axle = MarkMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.16, 0.42, 8), materials.stone));
    axle.rotation.x = Math.PI / 2;
    wheel.add(axle);
    wheel.position.set(-width * 0.25, 1.3, depth / 2 + 0.28);
    wheel.rotation.z = -0.13;
    group.add(wheel);
  }

  if (options.sooted) {
    const scorch = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.3), materials.ash);
    scorch.position.set(-0.65, 2.3, depth / 2 + 0.12);
    group.add(scorch);
  }
  return group;
}

function PlaceAtTerrain(object, x, z, yaw = 0, yOffset = 0) {
  object.position.set(x, GetTerrainHeight(x, z) + yOffset, z);
  object.rotation.y = yaw;
  return object;
}

function CreateStoneWall(THREE, materials, profile, start, end, seed) {
  const group = new THREE.Group();
  group.name = "Scene_FieldStoneWall";
  const random = CreateSeededRandom(seed);
  const length = Math.hypot(end.x - start.x, end.z - start.z);
  const baseCount = Math.max(7, Math.round((profile.wallStones * length) / 55));
  const upperCount = Math.max(4, Math.floor(baseCount * 0.72));
  const totalCount = baseCount + upperCount;
  const tangentYaw = Math.atan2(end.x - start.x, end.z - start.z);
  const stoneGeometry = new THREE.DodecahedronGeometry(0.5, 0);
  const stones = new THREE.InstancedMesh(stoneGeometry, materials.stone, totalCount);
  stones.name = "Scene_InstancedErodedFieldStoneCourses";
  stones.castShadow = true;
  stones.receiveShadow = true;
  const dummy = new THREE.Object3D();
  let instanceIndex = 0;
  for (let course = 0; course < 2; course += 1) {
    const courseCount = course === 0 ? baseCount : upperCount;
    for (let index = 0; index < courseCount; index += 1) {
      const stagger = course === 0 ? 0 : 0.46;
      const t = Clamp((index + stagger) / Math.max(1, courseCount - 0.05), 0.015, 0.985);
      const x = start.x + (end.x - start.x) * t + (random() - 0.5) * 0.24;
      const z = start.z + (end.z - start.z) * t + (random() - 0.5) * 0.24;
      const width = (course === 0 ? 0.74 : 0.59) + random() * 0.5;
      const height = (course === 0 ? 0.42 : 0.34) + random() * 0.24;
      const depth = (course === 0 ? 0.72 : 0.56) + random() * 0.28;
      const baseY = GetTerrainHeight(x, z) + (course === 0 ? 0 : 0.48 + random() * 0.08);
      dummy.position.set(x, baseY + height * 0.5, z);
      dummy.rotation.set((random() - 0.5) * 0.2, tangentYaw + (random() - 0.5) * 0.42, (random() - 0.5) * 0.17);
      dummy.scale.set(width, height, depth);
      dummy.updateMatrix();
      stones.setMatrixAt(instanceIndex, dummy.matrix);
      stones.setColorAt?.(instanceIndex, new THREE.Color((instanceIndex + seed) % 4 === 0 ? 0x626b67 : 0x7b7e75));
      instanceIndex += 1;
    }
  }
  stones.instanceMatrix.needsUpdate = true;
  if (stones.instanceColor) stones.instanceColor.needsUpdate = true;
  group.add(stones);

  const contactGeometry = new THREE.DodecahedronGeometry(0.22, 0);
  const contactClumps = new THREE.InstancedMesh(contactGeometry, materials.wallDamp, baseCount);
  contactClumps.name = "Scene_InstancedWallRootContactMud";
  contactClumps.receiveShadow = true;
  for (let index = 0; index < baseCount; index += 1) {
    const t = (index + 0.3) / baseCount;
    const x = start.x + (end.x - start.x) * t + (random() - 0.5) * 0.38;
    const z = start.z + (end.z - start.z) * t + (random() - 0.5) * 0.38;
    dummy.position.set(x, GetTerrainHeight(x, z) + 0.07, z);
    dummy.rotation.set(0, tangentYaw + random() * Math.PI, 0);
    dummy.scale.set(0.85 + random() * 1.25, 0.28 + random() * 0.34, 0.55 + random() * 0.72);
    dummy.updateMatrix();
    contactClumps.setMatrixAt(index, dummy.matrix);
  }
  contactClumps.instanceMatrix.needsUpdate = true;
  group.add(contactClumps);
  return group;
}

function CreateLeaflessTree(THREE, materials, seed = 3) {
  const random = CreateSeededRandom(seed);
  const group = new THREE.Group();
  group.name = "Scene_WinterJujubeTree";
  const trunkHeight = 3.65 + random() * 1.15;
  const leanX = (random() - 0.5) * 0.42;
  const leanZ = (random() - 0.5) * 0.34;
  const lowerFork = new THREE.Vector3(leanX * 0.26, trunkHeight * 0.48, leanZ * 0.22);
  const upperFork = new THREE.Vector3(leanX * 0.72, trunkHeight * 0.76, leanZ * 0.68);
  const crown = new THREE.Vector3(leanX, trunkHeight, leanZ);
  const segments = [];
  const AddSegment = (startPoint, endPoint, radius) => segments.push({ startPoint, endPoint, radius });
  AddSegment(new THREE.Vector3(0, 0, 0), lowerFork, 0.31);
  AddSegment(lowerFork, upperFork, 0.235);
  AddSegment(upperFork, crown, 0.16);

  for (let branchIndex = 0; branchIndex < 5; branchIndex += 1) {
    const junction = (branchIndex < 2 ? lowerFork : upperFork).clone();
    junction.y += (random() - 0.5) * 0.24;
    const angle = (branchIndex / 5) * Math.PI * 2 + random() * 0.72;
    const branchLength = 1.18 + random() * 1.1;
    const branchTip = junction.clone().add(new THREE.Vector3(
      Math.cos(angle) * branchLength,
      0.72 + random() * 0.86,
      Math.sin(angle) * branchLength,
    ));
    AddSegment(junction, branchTip, 0.115 + random() * 0.038);
    for (let twigIndex = 0; twigIndex < 2; twigIndex += 1) {
      const twigStart = junction.clone().lerp(branchTip, 0.52 + twigIndex * 0.24);
      const twigAngle = angle + (twigIndex ? 1 : -1) * (0.48 + random() * 0.62);
      const twigLength = 0.58 + random() * 0.66;
      const twigTip = twigStart.clone().add(new THREE.Vector3(
        Math.cos(twigAngle) * twigLength,
        0.38 + random() * 0.58,
        Math.sin(twigAngle) * twigLength,
      ));
      AddSegment(twigStart, twigTip, 0.047 + random() * 0.025);
    }
  }
  for (let rootIndex = 0; rootIndex < 5; rootIndex += 1) {
    const angle = (rootIndex / 5) * Math.PI * 2 + random() * 0.42;
    AddSegment(
      new THREE.Vector3(0, 0.23, 0),
      new THREE.Vector3(Math.cos(angle) * (0.48 + random() * 0.24), 0.035, Math.sin(angle) * (0.48 + random() * 0.24)),
      0.13 + random() * 0.045,
    );
  }

  const branchGeometry = new THREE.CylinderGeometry(0.56, 1, 1, 6, 1, false);
  const branches = new THREE.InstancedMesh(branchGeometry, materials.timber, segments.length);
  branches.name = "Scene_InstancedJujubeForkedBranches";
  branches.castShadow = true;
  branches.receiveShadow = true;
  const upward = new THREE.Vector3(0, 1, 0);
  const midpoint = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const matrix = new THREE.Matrix4();
  segments.forEach(({ startPoint, endPoint, radius }, index) => {
    midpoint.copy(startPoint).add(endPoint).multiplyScalar(0.5);
    direction.copy(endPoint).sub(startPoint);
    const segmentLength = Math.max(0.01, direction.length());
    quaternion.setFromUnitVectors(upward, direction.normalize());
    scale.set(radius, segmentLength, radius);
    matrix.compose(midpoint, quaternion, scale);
    branches.setMatrixAt(index, matrix);
    branches.setColorAt?.(index, new THREE.Color(index % 5 === 0 ? 0x45372f : 0x5a493d));
  });
  branches.instanceMatrix.needsUpdate = true;
  if (branches.instanceColor) branches.instanceColor.needsUpdate = true;
  group.add(branches);
  return group;
}

function CreateFieldRows(THREE, materials, profile) {
  const group = new THREE.Group();
  group.name = "Scene_WinterTerraceFields";
  for (let index = 0; index < profile.fieldRows; index += 1) {
    const z = 36 - index * 3.1;
    const x = 36 + Math.sin(index * 0.7) * 1.4;
    const ridge = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(20 - index * 0.28, 0.22, 0.68), materials.field), false, true);
    ridge.position.set(x, GetTerrainHeight(x, z) + 0.12, z);
    ridge.rotation.y = -0.08 + Math.sin(index) * 0.025;
    group.add(ridge);
  }
  return group;
}

function CreateContinuousRidgeGeometry(THREE, profile, layer, random) {
  const sampleCount = Math.max(34, profile.ridgeSamples - layer * 5);
  const depthRows = 5;
  const width = 244 + layer * 34;
  const nearZ = -142 - layer * 29;
  const depth = 27 + layer * 7;
  const ridgeHeights = [];
  const roughness = Array.from({ length: sampleCount + 1 }, () => random() * 2 - 1);
  for (let index = 0; index <= sampleCount; index += 1) {
    const x = -width / 2 + (index / sampleCount) * width;
    const smoothedNoise = (
      (roughness[Math.max(0, index - 2)] ?? 0)
      + (roughness[Math.max(0, index - 1)] ?? 0) * 2
      + roughness[index] * 3
      + (roughness[Math.min(sampleCount, index + 1)] ?? 0) * 2
      + (roughness[Math.min(sampleCount, index + 2)] ?? 0)
    ) / 9;
    const broadMass = Math.pow(Math.abs(Math.sin(x * 0.022 + layer * 0.83)), 1.45) * 7.2;
    const brokenPlateau = Math.pow(Math.abs(Math.sin(x * 0.047 - layer * 0.61)), 2.6) * 4.6;
    const strata = Math.sin(x * 0.012 + layer * 1.4) * 2.1;
    ridgeHeights.push(8.5 + layer * 3.4 + broadMass + brokenPlateau + strata + smoothedNoise * 3.2);
  }

  const vertices = [];
  const indices = [];
  for (let row = 0; row < depthRows; row += 1) {
    const t = row / (depthRows - 1);
    const slope = t * t * (3 - 2 * t);
    for (let index = 0; index <= sampleCount; index += 1) {
      const x = -width / 2 + (index / sampleCount) * width;
      const ridgeHeight = ridgeHeights[index];
      const terracing = Math.sin(index * 0.72 + row * 1.8 + layer) * (1 - t) * 0.38;
      const y = -4.8 + slope * (ridgeHeight + 4.8) + terracing;
      const z = nearZ - t * depth + Math.sin(index * 0.31 + layer) * (0.55 + t * 0.4);
      vertices.push(x, y, z);
    }
  }
  for (let row = 0; row < depthRows - 1; row += 1) {
    for (let index = 0; index < sampleCount; index += 1) {
      const current = row * (sampleCount + 1) + index;
      const next = current + sampleCount + 1;
      if ((index + row + layer) % 2 === 0) {
        indices.push(current, next, current + 1, next, next + 1, current + 1);
      } else {
        indices.push(current, next, next + 1, current, next + 1, current + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function CreateDistantMountains(THREE, materials, profile) {
  const group = new THREE.Group();
  group.name = "Scene_TaihangSilhouette";
  const random = CreateSeededRandom(821942);
  const layerMaterials = [materials.mountainNear, materials.mountain, materials.mountainFar];
  for (let layer = profile.ridgeLayers - 1; layer >= 0; layer -= 1) {
    const ridge = new THREE.Mesh(
      CreateContinuousRidgeGeometry(THREE, profile, layer, random),
      layerMaterials[layer],
    );
    ridge.name = `Scene_ContinuousTaihangRidge_${layer + 1}`;
    ridge.receiveShadow = false;
    ridge.castShadow = false;
    ridge.renderOrder = -4 + layer;
    group.add(ridge);
  }
  return group;
}

function CreateLowMistBands(THREE, materials, profile) {
  const group = new THREE.Group();
  group.name = "Scene_LayeredValleyMist";
  const count = 3;
  for (let index = 0; index < count; index += 1) {
    const mist = new THREE.Mesh(new THREE.PlaneGeometry(270 + index * 24, 17 + index * 5), materials.fogBand);
    mist.name = `Scene_LowMistBand_${index + 1}`;
    mist.position.set(index % 2 ? -11 : 7, 5.5 + index * 2.1, -112 - index * 38);
    mist.renderOrder = -1 + index;
    group.add(mist);
  }
  return group;
}

function CreateHandcart(THREE, materials) {
  const group = new THREE.Group();
  group.name = "Scene_EvacuationHandcart";
  const bed = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.18, 1.15), materials.timber));
  bed.position.y = 0.82;
  const axle = MarkMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 2.25, 6), materials.ash));
  axle.rotation.z = Math.PI / 2;
  axle.position.y = 0.57;
  group.add(bed, axle);
  for (const x of [-1.05, 1.05]) {
    const wheel = MarkMesh(new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.075, 5, 12), materials.timber));
    wheel.rotation.y = Math.PI / 2;
    wheel.position.set(x, 0.58, 0);
    group.add(wheel);
  }
  const shaft = MarkMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.075, 2.7, 5), materials.timber));
  shaft.rotation.x = Math.PI / 2;
  shaft.position.set(0, 0.75, 1.75);
  group.add(shaft);
  return group;
}

function CreateEvacuationTableau(THREE, materials, profile) {
  const root = new THREE.Group();
  root.name = "Scene_CivilianEvacuationTableau";
  root.userData.presentationOnly = true;
  const figuresRoot = new THREE.Group();
  figuresRoot.name = "Scene_EvacueeSilhouettes";
  root.add(figuresRoot);
  const figureCount = 7;
  const dummy = new THREE.Object3D();
  const random = CreateSeededRandom(12091942);
  const torsoGeometry = new THREE.CylinderGeometry(0.15, 0.22, 0.64, 7);
  const headGeometry = new THREE.SphereGeometry(0.13, 7, 5);
  const legGeometry = new THREE.CylinderGeometry(0.055, 0.07, 0.52, 6);
  const bundleGeometry = new THREE.BoxGeometry(0.32, 0.28, 0.2);
  const torsos = new THREE.InstancedMesh(torsoGeometry, materials.wallDark, figureCount);
  const heads = new THREE.InstancedMesh(headGeometry, materials.ash, figureCount);
  const legs = new THREE.InstancedMesh(legGeometry, materials.timber, figureCount * 2);
  const bundles = new THREE.InstancedMesh(bundleGeometry, materials.field, figureCount);
  torsos.name = "Scene_InstancedEvacueeCoats";
  heads.name = "Scene_InstancedEvacueeHeads";
  legs.name = "Scene_InstancedEvacueeLegs";
  bundles.name = "Scene_InstancedEvacueeBundles";
  for (let index = 0; index < figureCount; index += 1) {
    const row = Math.floor(index / 2);
    const x = (index % 2 ? 0.52 : -0.46) + (random() - 0.5) * 0.22;
    const z = -row * 0.92 + (random() - 0.5) * 0.18;
    const heightScale = 0.86 + random() * 0.18;
    dummy.position.set(x, 0.87 * heightScale, z);
    dummy.rotation.set(0, (random() - 0.5) * 0.34, (random() - 0.5) * 0.035);
    dummy.scale.set(0.92 + random() * 0.14, heightScale, 0.86 + random() * 0.2);
    dummy.updateMatrix();
    torsos.setMatrixAt(index, dummy.matrix);
    dummy.position.set(x, 1.31 * heightScale, z - 0.015);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.setScalar(heightScale);
    dummy.updateMatrix();
    heads.setMatrixAt(index, dummy.matrix);
    for (const side of [-1, 1]) {
      dummy.position.set(x + side * 0.085, 0.32 * heightScale, z);
      dummy.rotation.set((index % 2 ? -1 : 1) * side * 0.08, 0, side * 0.025);
      dummy.scale.set(1, heightScale, 1);
      dummy.updateMatrix();
      legs.setMatrixAt(index * 2 + (side > 0 ? 1 : 0), dummy.matrix);
    }
    dummy.position.set(x + (index % 2 ? -0.18 : 0.18), 0.92 * heightScale, z + 0.18);
    dummy.rotation.set(0, (index % 2 ? -1 : 1) * 0.18, 0);
    dummy.scale.set(0.8 + random() * 0.35, 0.82 + random() * 0.25, 0.88 + random() * 0.24);
    dummy.updateMatrix();
    bundles.setMatrixAt(index, dummy.matrix);
  }
  [torsos, heads, legs, bundles].forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = true;
    mesh.raycast = () => {};
    figuresRoot.add(mesh);
  });

  const cart = CreateHandcart(THREE, materials);
  cart.name = "Scene_WoundedEvacuationHandcart";
  cart.position.set(1.12, 0, -2.35);
  cart.scale.setScalar(0.76);
  const patient = MarkMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 1.28, 8), materials.wallDark), false, true);
  patient.name = "Scene_BlanketedWoundedEvacuee";
  patient.rotation.x = Math.PI / 2;
  patient.position.set(0, 1.03, -0.05);
  const patientHead = MarkMesh(new THREE.Mesh(new THREE.SphereGeometry(0.17, 8, 6), materials.ash), false, true);
  patientHead.position.set(0, 1.03, -0.77);
  const blanket = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.1, 1.18), materials.clothMarker), false, true);
  blanket.position.set(0, 1.15, 0.02);
  blanket.rotation.x = -0.04;
  cart.add(patient, patientHead, blanket);
  root.add(cart);

  const signal = new THREE.Group();
  signal.name = "Scene_HoodedPassageSignal";
  signal.userData.presentationOnly = true;
  const signalCase = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.38), materials.timber), false, true);
  const signalGlow = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), materials.glassWarm);
  signalGlow.position.z = -0.205;
  const signalSlit = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.12), materials.glassWarm);
  signalSlit.position.set(0, 0, -0.216);
  const signalLight = new THREE.PointLight(0xeaa064, 0, 7, 2);
  signalLight.position.set(0, 0, -0.3);
  signal.add(signalCase, signalGlow, signalSlit, signalLight);
  signal.position.set(-5.2, GetTerrainHeight(-5.2, -59.5) + 1.48, -59.5);
  signal.traverse((object) => {
    if (object.isMesh) object.raycast = () => {};
  });

  const phaseTargets = Object.freeze({
    prepareQuietPassage: [15.5, -2],
    prepareThePassage: [15.5, -2],
    reachIrrigationDitch: [22, -19],
    disableWarningLine: [18, -31],
    crossTheBlockade: [18, -31],
    crossDrainageCulvert: [3, -49],
    reachCulvertNorth: [-3, -57],
    holdKilnMouth: [-17, -69],
    buyTheMinutes: [-17, -69],
    waitForClearSignal: [-25, -77],
    waitForPassageSignal: [-25, -77],
  });
  const signalPhases = new Set(["crossDrainageCulvert", "reachCulvertNorth", "holdKilnMouth", "waitForClearSignal", "waitForPassageSignal"]);
  const target = new THREE.Vector3();
  let elapsed = 0;
  let hasEntered = false;

  function Update(delta, phase) {
    elapsed += Math.max(0, delta);
    const destination = phaseTargets[phase];
    root.visible = Boolean(destination);
    if (destination) {
      target.set(destination[0], GetTerrainHeight(destination[0], destination[1]) + 0.03, destination[1]);
      if (!hasEntered) root.position.copy(target);
      else root.position.lerp(target, 1 - Math.exp(-Math.max(0, delta) * 0.42));
      figuresRoot.position.y = Math.sin(elapsed * 2.4) * 0.018;
      cart.rotation.y = Math.sin(elapsed * 0.38) * 0.035;
      hasEntered = true;
    }
    const showSignal = signalPhases.has(phase);
    signal.visible = showSignal;
    if (showSignal) {
      const pulse = elapsed % 4.8;
      const lit = pulse < 0.32 || (pulse > 1.12 && pulse < 1.34);
      signalGlow.visible = lit;
      signalSlit.visible = lit;
      signalLight.intensity = lit ? 58 : 0;
    } else {
      signalLight.intensity = 0;
    }
  }

  root.visible = false;
  signal.visible = false;
  return { root, signal, Update };
}

function CreateMillstoneSignal(THREE, materials) {
  const group = new THREE.Group();
  group.name = "Scene_MillstoneSignal";
  const lowerStone = MarkMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.82, 0.88, 0.22, 12), materials.stone));
  lowerStone.position.y = 0.18;
  const upperStone = MarkMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.77, 0.18, 12), materials.stone));
  upperStone.position.set(0.08, 0.38, -0.04);
  group.add(lowerStone, upperStone);
  for (let index = 0; index < 3; index += 1) {
    const signalStone = MarkMesh(new THREE.Mesh(new THREE.DodecahedronGeometry(0.09 + index * 0.008, 0), materials.wall), false, true);
    signalStone.position.set(-0.42 + index * 0.22, 0.09, 0.63);
    signalStone.rotation.set(index * 0.3, index * 0.7, 0.1);
    group.add(signalStone);
  }
  return group;
}

function CreateIrrigationDitch(THREE, materials) {
  const group = new THREE.Group();
  group.name = "Scene_OldIrrigationDitch";
  for (const side of [-1, 1]) {
    const bank = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.72, 27), materials.wall), false, true);
    bank.position.set(side * 5.2, 0.28, 0);
    bank.rotation.z = side * -0.06;
    group.add(bank);
    for (let index = 0; index < 8; index += 1) {
      const reed = MarkMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.026, 1.25 + (index % 3) * 0.2, 4), materials.field), false, true);
      reed.position.set(side * (4.35 + (index % 2) * 0.3), 0.66, -11 + index * 3.1);
      reed.rotation.z = side * 0.08 + (index % 2) * 0.04;
      group.add(reed);
    }
  }
  return group;
}

function CreateBlockadePost(THREE, materials) {
  const group = new THREE.Group();
  group.name = "Scene_PracticalBlockadePost";
  const hut = CreateVillageHouse(THREE, materials, { width: 3.7, depth: 3.1, wallHeight: 2.25, straw: false, doorOffset: 0.45 });
  hut.position.set(4.8, 0, -1.4);
  hut.scale.setScalar(0.82);
  group.add(hut);
  const postA = MarkMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 2.3, 6), materials.timber));
  const postB = postA.clone();
  postA.position.set(-3.7, 1.15, 0);
  postB.position.set(3.7, 1.15, 0);
  const barrier = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(7.4, 0.13, 0.16), materials.timber));
  barrier.position.set(0, 1.14, 0);
  barrier.rotation.z = -0.09;
  group.add(postA, postB, barrier);
  return group;
}

function CreateDrainageCulvert(THREE, materials) {
  const group = new THREE.Group();
  group.name = "Scene_DrainageCulvert";
  const leftWall = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(1.25, 2.4, 5.2), materials.stone));
  const rightWall = leftWall.clone();
  leftWall.position.set(-2.1, 1.05, 0);
  rightWall.position.set(2.1, 1.05, 0);
  const lintel = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(5.45, 0.7, 5.2), materials.stone));
  lintel.position.y = 2.45;
  const darkInterior = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.9), materials.ash);
  darkInterior.position.set(0, 1.1, -2.63);
  group.add(leftWall, rightWall, lintel, darkInterior);
  return group;
}

function CreateLimeKiln(THREE, materials) {
  const group = new THREE.Group();
  group.name = "Scene_AbandonedLimeKiln";
  const stoneCount = 14;
  for (let index = 0; index < stoneCount; index += 1) {
    const angle = (index / stoneCount) * Math.PI * 2;
    if (Math.abs(Math.sin(angle)) < 0.24 && Math.cos(angle) < 0) continue;
    const stone = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.05, 1.15), index % 3 ? materials.stone : materials.wall));
    stone.position.set(Math.sin(angle) * 3.05, 0.55 + (index % 2) * 0.16, Math.cos(angle) * 3.05);
    stone.rotation.y = angle;
    group.add(stone);
  }
  const upperRing = MarkMesh(new THREE.Mesh(new THREE.TorusGeometry(2.62, 0.45, 5, 14), materials.stone));
  upperRing.rotation.x = Math.PI / 2;
  upperRing.position.y = 2.08;
  const sootMouth = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.15), materials.ash);
  sootMouth.position.set(0, 1.18, -3.15);
  group.add(upperRing, sootMouth);
  return group;
}

function CreateLimeSieveCache(THREE, materials) {
  const group = new THREE.Group();
  group.name = "Scene_LimeSieveAndBaskets";
  for (const [index, x] of [-0.55, 0.5].entries()) {
    const basket = MarkMesh(new THREE.Mesh(
      new THREE.CylinderGeometry(0.47, 0.37, 0.72, 12, 1, true),
      materials.roofStraw,
    ));
    basket.name = `Model_WovenLimeBasket_${index + 1}`;
    basket.position.set(x, 0.37, index ? 0.1 : -0.08);
    basket.rotation.z = index ? -0.08 : 0.05;
    const powder = MarkMesh(new THREE.Mesh(new THREE.CircleGeometry(0.39, 12), materials.limeDust), false, true);
    powder.rotation.x = -Math.PI / 2;
    powder.position.set(x, 0.73, index ? 0.1 : -0.08);
    group.add(basket, powder);
  }
  const sieve = new THREE.Group();
  sieve.name = "Model_WoodenAshSieve";
  const sieveRim = MarkMesh(new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.055, 7, 20), materials.timber));
  const sieveMesh = MarkMesh(new THREE.Mesh(new THREE.CircleGeometry(0.56, 18), materials.limeDust), false, true);
  sieveMesh.position.z = 0.015;
  sieve.add(sieveRim, sieveMesh);
  sieve.position.set(-0.08, 0.92, 0.18);
  sieve.rotation.set(1.08, 0.2, -0.12);
  group.add(sieve);
  const spill = MarkMesh(new THREE.Mesh(new THREE.CircleGeometry(0.92, 18), materials.limeDust), false, true);
  spill.name = "Scene_LimeDustSpill";
  spill.rotation.x = -Math.PI / 2;
  spill.position.set(0.2, 0.025, 0.42);
  spill.scale.set(1, 0.6, 1);
  group.add(spill);
  return group;
}

function CreateReedScreenCover(THREE, materials) {
  const group = new THREE.Group();
  group.name = "Scene_ReedScreenGreyWallCover";
  const wall = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(3.8, 1.65, 0.62), materials.wallDark));
  wall.name = "Model_KilnGreyStoneWall";
  wall.position.y = 0.82;
  group.add(wall);
  const screen = new THREE.Group();
  screen.name = "Model_WovenReedScreen";
  for (let index = 0; index < 15; index += 1) {
    const reed = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(0.045, 1.82, 0.04), materials.roofStraw), true, true);
    reed.position.set(-1.58 + index * 0.225, 0.94 + Math.sin(index * 1.9) * 0.035, -0.36);
    reed.rotation.z = Math.sin(index * 2.4) * 0.018;
    screen.add(reed);
  }
  for (let index = 0; index < 5; index += 1) {
    const binding = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(3.25, 0.035, 0.055), materials.timber), true, true);
    binding.position.set(0, 0.23 + index * 0.35, -0.385);
    screen.add(binding);
  }
  screen.rotation.y = -0.035;
  group.add(screen);
  const limeMark = MarkMesh(new THREE.Mesh(new THREE.PlaneGeometry(0.48, 0.68), materials.limeDust), false, true);
  limeMark.name = "Scene_FadedLimeRouteMark";
  limeMark.position.set(-1.32, 1.05, -0.392);
  limeMark.rotation.z = -0.1;
  group.add(limeMark);
  return group;
}

function CreateLooseScreeSlope(THREE, materials) {
  const group = new THREE.Group();
  group.name = "Scene_LooseScreeRetreatSlope";
  const random = CreateSeededRandom(36881942);
  const stoneCount = 42;
  const stoneGeometry = new THREE.DodecahedronGeometry(0.34, 0);
  const stones = new THREE.InstancedMesh(stoneGeometry, materials.stone, stoneCount);
  stones.name = "Scene_InstancedLooseScree";
  stones.castShadow = true;
  stones.receiveShadow = true;
  const dummy = new THREE.Object3D();
  for (let index = 0; index < stoneCount; index += 1) {
    const row = Math.floor(Math.sqrt(index));
    const spread = 0.65 + row * 0.42;
    const angle = random() * Math.PI * 2;
    const radius = random() * spread;
    const scale = 0.52 + random() * 1.15;
    dummy.position.set(Math.cos(angle) * radius, 0.12 + (1 - radius / Math.max(0.2, spread)) * 0.65, Math.sin(angle) * radius * 0.72);
    dummy.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
    dummy.scale.set(scale * (0.75 + random() * 0.45), scale * (0.46 + random() * 0.36), scale);
    dummy.updateMatrix();
    stones.setMatrixAt(index, dummy.matrix);
    stones.setColorAt?.(index, new THREE.Color(index % 5 === 0 ? 0x9a9588 : 0x626966));
  }
  stones.instanceMatrix.needsUpdate = true;
  if (stones.instanceColor) stones.instanceColor.needsUpdate = true;
  group.add(stones);
  const exposedFace = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(2.4, 1.05, 1.15), materials.wallDark));
  exposedFace.name = "Model_ScreeExposedRockFace";
  exposedFace.position.set(0.65, 0.65, 0.65);
  exposedFace.rotation.set(-0.12, 0.36, -0.18);
  group.add(exposedFace);
  return group;
}

function CreateKilnRetreatRoute(THREE, materials) {
  const group = new THREE.Group();
  group.name = "Scene_KilnRetreatReadabilityRoute";
  const routeProps = [
    { object: CreateLimeSieveCache(THREE, materials), x: -24.6, z: -76.8, yaw: -0.38 },
    { object: CreateReedScreenCover(THREE, materials), x: -31.6, z: -82.2, yaw: -0.64 },
    { object: CreateLooseScreeSlope(THREE, materials), x: -36.6, z: -88, yaw: 0.22 },
  ];
  routeProps.forEach(({ object, x, z, yaw }, index) => {
    PlaceAtTerrain(object, x, z, yaw, index === 2 ? -0.08 : 0);
    group.add(object);
    const spill = MarkMesh(new THREE.Mesh(new THREE.CircleGeometry(0.52 + index * 0.14, 14), materials.limeDust), false, true);
    spill.name = `Scene_KilnRetreatLimeTrace_${index + 1}`;
    spill.rotation.x = -Math.PI / 2;
    spill.position.set(x + 1.15, GetTerrainHeight(x + 1.15, z + 0.45) + 0.04, z + 0.45);
    spill.scale.set(1.3, 0.58, 1);
    group.add(spill);
    const rimLight = new THREE.PointLight(index === 0 ? 0xc99566 : 0xa9bbc1, 17 - index * 2, 9.5, 2);
    rimLight.name = `Light_KilnRetreatRim_${index + 1}`;
    rimLight.position.set(x - 0.5, GetTerrainHeight(x - 0.5, z) + 2.1, z + 0.5);
    rimLight.castShadow = false;
    group.add(rimLight);
  });
  return group;
}

function CreateLantern(THREE, materials, x, z, lanternIndex, lights, profile) {
  const group = new THREE.Group();
  group.name = `Scene_OilLantern_${lanternIndex + 1}`;
  const frame = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.38, 0.25), materials.timber));
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.11, 8, 6), materials.glassWarm);
  frame.position.y = 2.15;
  glow.position.y = 2.14;
  group.add(frame, glow);
  if (lanternIndex < profile.lanternLights) {
    const light = new THREE.PointLight(0xe58b4d, 68, 18, 2);
    light.position.y = 2.14;
    light.castShadow = false;
    group.add(light);
    lights.push({ light, phase: lanternIndex * 1.79, baseIntensity: 68 });
  }
  PlaceAtTerrain(group, x, z);
  return group;
}

function CreateLightingRig(THREE, profile) {
  const group = new THREE.Group();
  group.name = "Scene_BlueHourLighting";
  const sky = new THREE.HemisphereLight(0xa9bcc7, 0x493b31, 1.72);
  sky.name = "Light_OvercastSky";
  const moon = new THREE.DirectionalLight(0xd7e3e8, 2.65);
  moon.name = "Light_ColdDawnKey";
  moon.position.set(-28, 38, 24);
  moon.castShadow = true;
  moon.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);
  moon.shadow.camera.left = -48;
  moon.shadow.camera.right = 48;
  moon.shadow.camera.top = 55;
  moon.shadow.camera.bottom = -55;
  moon.shadow.camera.near = 1;
  moon.shadow.camera.far = 125;
  moon.shadow.bias = -0.00035;
  const horizon = new THREE.DirectionalLight(0xc27d52, 0.9);
  horizon.name = "Light_HearthRim";
  horizon.position.set(22, 8, -38);
  group.add(sky, moon, moon.target, horizon, horizon.target);
  return { group, sky, moon, horizon };
}

export function CreateVillageEnvironment(THREE, options = {}) {
  if (!THREE?.Group || !THREE?.MeshStandardMaterial) throw new Error("CreateVillageEnvironment requires a THREE namespace.");
  const profile = DesktopRenderingProfile;
  const materials = options.materials || CreateMaterialLibrary(THREE);
  const ownsMaterials = !options.materials;
  const root = new THREE.Group();
  root.name = "Scene_AshenRouteVillage1942";
  const terrain = CreateTerrain(THREE, materials, profile);
  const road = CreateRoadRibbon(THREE, materials, profile);
  const lighting = CreateLightingRig(THREE, profile);
  const evacuation = CreateEvacuationTableau(THREE, materials, profile);
  root.add(
    terrain,
    road,
    CreateGroundDetails(THREE, materials, profile, road),
    lighting.group,
    CreateDistantMountains(THREE, materials, profile),
    CreateLowMistBands(THREE, materials, profile),
    evacuation.root,
    evacuation.signal,
  );

  const houses = [
    { x: -29, z: 52, yaw: 0.18, width: 7.2, depth: 5.1, straw: false, sceneName: "Scene_OldMill", mill: true },
    { x: -20, z: 32, yaw: 0.14, width: 6.2, depth: 4.5, straw: true },
    { x: -7, z: 20, yaw: 0.08, width: 5.8, depth: 4.2, straw: true },
    { x: 3, z: 13, yaw: -0.15, width: 6.7, depth: 4.7, straw: false },
    { x: 13, z: 4, yaw: -0.11, width: 7.4, depth: 5.1, straw: false, sceneName: "Scene_TrafficStationHouse", warmInterior: true },
    { x: 20, z: -7, yaw: -0.05, width: 5.6, depth: 4.0, straw: true },
  ];
  houses.forEach((houseOptions, index) => {
    const house = CreateVillageHouse(THREE, materials, {
      ...houseOptions,
      name: houseOptions.sceneName || `Scene_VillageHouse_${index + 1}`,
      doorOffset: index % 2 ? -0.55 : 0.75,
    });
    PlaceAtTerrain(house, houseOptions.x, houseOptions.z, houseOptions.yaw);
    root.add(house);
  });

  root.add(
    CreateStoneWall(THREE, materials, profile, { x: -31, z: 37 }, { x: -15, z: 32 }, 44),
    CreateStoneWall(THREE, materials, profile, { x: 8, z: 28 }, { x: 29, z: 23 }, 91),
    CreateFieldRows(THREE, materials, profile),
  );

  const treeLocations = [
    [-49, 58, 11],
    [-55, 42, 14],
    [-18, 25, 18],
    [-43, 18, 24],
    [31, 17, 27],
    [20, -4, 31],
    [-34, -13, 37],
    [39, -19, 43],
    [27, -32, 52],
    [37, -51, 57],
    [-29, -58, 59],
    [-18, -73, 63],
    [9, -87, 68],
    [-48, -96, 71],
  ];
  treeLocations.forEach(([x, z, seed]) => root.add(PlaceAtTerrain(CreateLeaflessTree(THREE, materials, seed), x, z)));
  root.add(
    PlaceAtTerrain(CreateMillstoneSignal(THREE, materials), -28.8, 51.6, -0.12),
    PlaceAtTerrain(CreateHandcart(THREE, materials), 16.8, -0.8, 0.34),
    PlaceAtTerrain(CreateIrrigationDitch(THREE, materials), 24, -25, 0.02, -0.12),
    PlaceAtTerrain(CreateBlockadePost(THREE, materials), 8, -42, -0.08),
    PlaceAtTerrain(CreateDrainageCulvert(THREE, materials), -4, -58, 0.02, -0.22),
    PlaceAtTerrain(CreateLimeKiln(THREE, materials), -27, -79, -0.1),
    CreateKilnRetreatRoute(THREE, materials),
  );

  const lanterns = [];
  root.add(
    CreateLantern(THREE, materials, 10.4, 5.8, 0, lanterns, profile),
    CreateLantern(THREE, materials, -27.2, 52.5, 1, lanterns, profile),
    CreateLantern(THREE, materials, -5.4, 21.4, 2, lanterns, profile),
    CreateLantern(THREE, materials, 11.4, -41.5, 3, lanterns, profile),
  );

  const fogColor = new THREE.Color(options.fogColor ?? 0x53616a);
  const baseFogDensity = 0.0087;
  const fog = new THREE.FogExp2(fogColor, baseFogDensity);
  let appliedScene = null;
  let previousFog = null;
  let previousBackground = null;
  let previousBackgroundIntensity = null;
  let previousBackgroundBlurriness = null;
  let panoramaTexture = null;
  let panoramaReady = false;
  let elapsed = 0;

  function ConfigurePanorama(texture) {
    if (!texture) return;
    texture.name = "Texture_EnvironmentPanorama";
    if (THREE.EquirectangularReflectionMapping != null) texture.mapping = THREE.EquirectangularReflectionMapping;
    if (THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
    texture.generateMipmaps = true;
    texture.anisotropy = 8;
    texture.needsUpdate = true;
  }

  if (typeof document !== "undefined" && THREE.TextureLoader) {
    panoramaTexture = new THREE.TextureLoader().load(
      environmentPanoramaUrl,
      (loadedTexture) => {
        ConfigurePanorama(loadedTexture);
        panoramaReady = true;
        if (appliedScene) appliedScene.background = loadedTexture;
      },
      undefined,
      () => {
        panoramaReady = false;
        if (appliedScene) appliedScene.background = fogColor;
      },
    );
    ConfigurePanorama(panoramaTexture);
  }

  function ApplyToScene(scene) {
    if (!scene) return;
    if (appliedScene && appliedScene !== scene) RestoreScene();
    appliedScene = scene;
    previousFog = scene.fog;
    previousBackground = scene.background;
    previousBackgroundIntensity = "backgroundIntensity" in scene ? scene.backgroundIntensity : null;
    previousBackgroundBlurriness = "backgroundBlurriness" in scene ? scene.backgroundBlurriness : null;
    scene.fog = fog;
    scene.background = panoramaReady && panoramaTexture ? panoramaTexture : fogColor;
    if ("backgroundIntensity" in scene) scene.backgroundIntensity = 0.82;
    if ("backgroundBlurriness" in scene) scene.backgroundBlurriness = 0;
  }

  function RestoreScene() {
    if (!appliedScene) return;
    appliedScene.fog = previousFog;
    appliedScene.background = previousBackground;
    if (previousBackgroundIntensity != null && "backgroundIntensity" in appliedScene) {
      appliedScene.backgroundIntensity = previousBackgroundIntensity;
    }
    if (previousBackgroundBlurriness != null && "backgroundBlurriness" in appliedScene) {
      appliedScene.backgroundBlurriness = previousBackgroundBlurriness;
    }
    appliedScene = null;
  }

  function Update(delta, state = {}) {
    elapsed += Math.max(0, delta);
    const alert = Clamp(state.alert ?? state.tension ?? 0);
    lanterns.forEach(({ light, phase, baseIntensity }) => {
      const flutter = 0.9 + Math.sin(elapsed * 2.1 + phase) * 0.055 + Math.sin(elapsed * 4.7 + phase * 0.7) * 0.025;
      light.intensity = baseIntensity * flutter * (1 - alert * 0.08);
    });
    lighting.horizon.intensity = Damp(lighting.horizon.intensity, 0.9 + alert * 0.12, 1.4, delta);
    fog.density = Damp(fog.density, baseFogDensity + alert * 0.00055, 0.8, delta);
    evacuation.Update(delta, state.phase);
  }

  function Dispose() {
    RestoreScene();
    root.removeFromParent();
    DisposeHierarchy(root, ownsMaterials);
    panoramaTexture?.dispose?.();
  }

  if (options.scene) ApplyToScene(options.scene);
  return {
    root,
    terrain,
    road,
    materials,
    lights: lighting,
    fog,
    evacuation,
    GetTerrainHeight,
    ApplyToScene,
    RestoreScene,
    Update,
    Dispose,
  };
}

function ConfigureFriendlyCharacterMaterial(THREE, material, options = {}) {
  const fillStrength = Number(options.fillStrength) || 0;
  const rimStrength = Number(options.rimStrength) || 0;
  const rimColor = new THREE.Color(options.rimColor ?? 0x91aeb9);
  material.emissive.copy(material.color);
  material.emissiveIntensity = fillStrength;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.characterRimColor = { value: rimColor };
    shader.uniforms.characterRimStrength = { value: rimStrength };
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform vec3 characterRimColor;
uniform float characterRimStrength;`,
      )
      .replace(
        "#include <emissivemap_fragment>",
        `#include <emissivemap_fragment>
float characterRim = pow(
  1.0 - saturate( dot( normalize( normal ), normalize( vViewPosition ) ) ),
  3.0
);
totalEmissiveRadiance += characterRimColor * characterRim * characterRimStrength;`,
      );
  };
  material.customProgramCacheKey = () => "AshenRouteFriendlyFillRimV2";
  material.userData.friendlyLighting = Object.freeze({ fillStrength, rimStrength });
  material.needsUpdate = true;
  return material;
}

function CreateCharacterMaterials(THREE, role) {
  const palette = CharacterPalettes[role] || CharacterPalettes.player;
  const isFriendly = role === "player" || role === "companion";
  const friendlyRimColor = role === "companion" ? 0xaeb69a : 0x92b3c0;
  const CreateCloth = (name, color, roughness = 0.96) => {
    const material = new THREE.MeshStandardMaterial({
      name,
      color,
      roughness,
      metalness: 0,
      flatShading: false,
      dithering: true,
    });
    if (!isFriendly) return material;
    const isSkin = name.includes("Skin");
    const isUpperBody = name.includes("Jacket") || name.includes("Canvas") || name.includes("Accent");
    const isDarkFeature = name.includes("Hair") || name.includes("FaceFeature");
    return ConfigureFriendlyCharacterMaterial(THREE, material, {
      fillStrength: isSkin ? 0.18 : isUpperBody ? 0.09 : isDarkFeature ? 0.018 : 0.055,
      rimStrength: isSkin ? 0.11 : isUpperBody ? 0.13 : isDarkFeature ? 0.045 : 0.075,
      rimColor: friendlyRimColor,
    });
  };
  return {
    jacket: CreateCloth("Material_CharacterJacket", palette.jacket),
    jacketDark: CreateCloth("Material_CharacterJacketShadow", palette.jacketDark),
    trousers: CreateCloth("Material_CharacterTrousers", palette.trousers),
    cloth: CreateCloth("Material_CharacterCanvas", palette.cloth),
    accent: CreateCloth("Material_CharacterAccent", palette.accent),
    skin: CreateCloth("Material_CharacterSkin", palette.skin, 0.84),
    hair: CreateCloth("Material_CharacterHair", palette.hair),
    eyeWhite: CreateCloth("Material_CharacterEyeWhite", 0xc7c1ad, 0.88),
    feature: CreateCloth("Material_CharacterFaceFeature", 0x241b17, 0.9),
    lips: CreateCloth("Material_CharacterWeatheredLips", role === "enemy" ? 0x65443a : 0x70453d, 0.92),
    leather: CreateCloth("Material_CharacterLeather", 0x34271e, 0.88),
    wood: CreateCloth("Material_RifleWood", 0x4c3323, 0.84),
    metal: new THREE.MeshStandardMaterial({
      name: "Material_RifleDarkMetal",
      color: 0x252827,
      roughness: 0.62,
      metalness: 0.28,
      flatShading: false,
      dithering: true,
    }),
  };
}

function CreateLimbSegment(THREE, parent, name, length, topRadius, bottomRadius, material, radialSegments = 8) {
  const radius = (topRadius + bottomRadius) * 0.5;
  const geometry = THREE.CapsuleGeometry
    ? new THREE.CapsuleGeometry(radius, Math.max(0.04, length - radius * 2), 5, radialSegments)
    : new THREE.CylinderGeometry(topRadius, bottomRadius, length, radialSegments);
  const mesh = MarkMesh(new THREE.Mesh(geometry, material));
  mesh.name = name;
  mesh.position.y = -length / 2;
  mesh.scale.x = topRadius / Math.max(0.001, radius);
  mesh.scale.z = 0.94;
  parent.add(mesh);
  return mesh;
}

function CreateRifleProp(THREE, materials) {
  const group = new THREE.Group();
  group.name = "Model_BoltActionRifleProp";
  const stock = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.12, 0.72), materials.wood));
  stock.position.z = 0.16;
  const receiver = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.075, 0.34), materials.metal));
  receiver.position.z = -0.35;
  const barrel = MarkMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.92, 6), materials.metal));
  barrel.rotation.x = Math.PI / 2;
  barrel.position.z = -0.91;
  const sling = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.025, 1.25), materials.leather), false, false);
  sling.position.set(0.08, -0.1, -0.36);
  sling.rotation.x = 0.08;
  group.add(stock, receiver, barrel, sling);
  return group;
}

function CreateSickleProp(THREE, materials) {
  const group = new THREE.Group();
  group.name = "Model_ShortHandledSickleProp";
  const handle = MarkMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.032, 0.58, 6), materials.wood));
  handle.position.y = -0.2;
  const blade = MarkMesh(new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.024, 4, 9, Math.PI * 1.18), materials.metal));
  blade.position.set(0.11, 0.08, 0);
  blade.rotation.set(Math.PI / 2, 0, -0.42);
  group.add(handle, blade);
  return group;
}

/**
 * Creates a sober, adult-proportioned articulated character. The hierarchy is
 * deliberately exposed; gameplay can rotate joints without depending on a
 * skinned-mesh loader.
 */
export function CreateCharacterRig(THREE, options = {}) {
  if (!THREE?.Group) throw new Error("CreateCharacterRig requires a THREE namespace.");
  const radialSegments = 16;
  const role = Object.prototype.hasOwnProperty.call(CharacterPalettes, options.role) ? options.role : "player";
  const materials = CreateCharacterMaterials(THREE, role);
  const root = new THREE.Group();
  root.name = options.name || `Model_Character_${role}`;
  root.userData.characterRole = role;
  const motionRoot = new THREE.Group();
  motionRoot.name = "Bone_MotionRoot";
  root.add(motionRoot);

  const pelvis = new THREE.Group();
  pelvis.name = "Bone_Pelvis";
  pelvis.position.y = 1.05;
  motionRoot.add(pelvis);
  const pelvisMesh = MarkMesh(new THREE.Mesh(new THREE.SphereGeometry(0.245, radialSegments, 9), materials.jacketDark));
  pelvisMesh.position.y = 0.02;
  pelvisMesh.scale.set(1, 0.68, 0.76);
  pelvis.add(pelvisMesh);

  const spine = new THREE.Group();
  spine.name = "Bone_Spine";
  spine.position.y = 0.08;
  pelvis.add(spine);
  const torsoMesh = MarkMesh(new THREE.Mesh(new THREE.SphereGeometry(0.36, radialSegments, 12), materials.jacket));
  torsoMesh.name = "Model_PaddedJacket";
  torsoMesh.position.y = 0.35;
  torsoMesh.scale.set(role === "companion" ? 0.86 : 0.88, 0.98, role === "companion" ? 0.65 : 0.62);
  spine.add(torsoMesh);
  const jacketHem = MarkMesh(new THREE.Mesh(new THREE.CylinderGeometry(
    0.255,
    role === "companion" ? 0.295 : 0.275,
    role === "companion" ? 0.31 : 0.25,
    radialSegments,
  ), materials.jacket));
  jacketHem.name = "Model_LayeredPaddedJacketHem";
  jacketHem.position.y = role === "companion" ? 0.075 : 0.095;
  jacketHem.scale.z = role === "companion" ? 0.83 : 0.79;
  spine.add(jacketHem);
  const jacketPanel = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.51, 0.032), materials.jacketDark));
  jacketPanel.position.set(0, 0.36, -0.237);
  spine.add(jacketPanel);
  for (const y of [0.22, 0.38, 0.54]) {
    const button = MarkMesh(new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), materials.accent), false, false);
    button.position.set(0.045, y, -0.256);
    spine.add(button);
  }
  for (const y of [0.24, 0.42, 0.58]) {
    const quiltSeam = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(0.47, 0.012, 0.018), materials.jacketDark), false, true);
    quiltSeam.name = "Model_PaddedJacketQuiltSeam";
    quiltSeam.position.set(0, y, -0.243);
    spine.add(quiltSeam);
  }
  const belt = MarkMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.222, 0.222, 0.075, radialSegments), materials.leather));
  belt.position.y = 0.05;
  belt.scale.z = 0.78;
  spine.add(belt);

  const neck = MarkMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.1, 0.14, radialSegments), materials.skin));
  neck.position.y = 0.735;
  spine.add(neck);
  const scarf = MarkMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.145, 0.13, radialSegments), materials.accent));
  scarf.position.y = 0.7;
  scarf.scale.z = 0.8;
  spine.add(scarf);
  for (const side of [-1, 1]) {
    const collar = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.14, 0.035), materials.jacketDark));
    collar.position.set(side * 0.075, 0.655, -0.22);
    collar.rotation.z = side * 0.48;
    spine.add(collar);
  }

  const head = new THREE.Group();
  head.name = "Bone_Head";
  head.position.y = 0.88;
  spine.add(head);
  const face = MarkMesh(new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.08, 6, radialSegments), materials.skin));
  face.scale.set(1.02, 1, 1.04);
  head.add(face);
  const hair = MarkMesh(new THREE.Mesh(new THREE.SphereGeometry(0.174, radialSegments, 5, 0, Math.PI * 2, 0, Math.PI * 0.56), materials.hair));
  hair.position.y = 0.035;
  hair.scale.set(0.98, 1.03, 0.98);
  head.add(hair);
  const nose = MarkMesh(new THREE.Mesh(new THREE.DodecahedronGeometry(0.043, 0), materials.skin), false, false);
  nose.position.set(0, -0.004, -0.165);
  nose.scale.set(0.48, 0.95, 0.62);
  head.add(nose);
  for (const side of [-1, 1]) {
    const ear = MarkMesh(new THREE.Mesh(new THREE.SphereGeometry(0.037, 10, 7), materials.skin), false, true);
    ear.name = "Model_CharacterEar";
    ear.position.set(side * 0.166, -0.004, 0.004);
    ear.scale.set(0.5, 1, 0.68);
    head.add(ear);

    const eye = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.011, 0.012), materials.feature), false, false);
    eye.name = "Model_CharacterEye";
    eye.position.set(side * 0.057, 0.035, -0.153);
    eye.rotation.z = side * -0.055;
    head.add(eye);
    const eyebrow = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(0.052, 0.011, 0.012), materials.feature), false, false);
    eyebrow.name = "Model_CharacterEyebrow";
    eyebrow.position.set(side * 0.058, 0.073, -0.153);
    eyebrow.rotation.z = side * -0.1;
    head.add(eyebrow);
  }
  const mouth = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(0.064, 0.011, 0.012), materials.lips), false, false);
  mouth.name = "Model_CharacterMouth";
  mouth.position.set(0, -0.075, -0.157);
  mouth.rotation.z = role === "companion" ? -0.035 : 0.02;
  head.add(mouth);
  const lowerLip = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.007, 0.01), materials.lips), false, false);
  lowerLip.name = "Model_CharacterLowerLip";
  lowerLip.position.set(0, -0.086, -0.153);
  head.add(lowerLip);

  if (role === "enemy") {
    const helmet = MarkMesh(new THREE.Mesh(
      new THREE.SphereGeometry(0.215, 9, 5, 0, Math.PI * 2, 0, Math.PI * 0.52),
      materials.jacketDark,
    ));
    helmet.position.y = 0.065;
    helmet.scale.z = 1.06;
    head.add(helmet);
    const brim = MarkMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.225, 0.025, 10), materials.jacketDark));
    brim.position.y = 0.055;
    head.add(brim);
  } else if (role === "companion") {
    const headWrap = MarkMesh(new THREE.Mesh(new THREE.SphereGeometry(0.19, radialSegments, 5, 0, Math.PI * 2, 0, Math.PI * 0.53), materials.accent));
    headWrap.name = "Model_CompanionHeadScarf";
    headWrap.position.y = 0.055;
    headWrap.scale.set(1.04, 1, 1.06);
    head.add(headWrap);
    const hairBun = MarkMesh(new THREE.Mesh(new THREE.SphereGeometry(0.085, 8, 6), materials.hair));
    hairBun.name = "Model_CompanionHairBun";
    hairBun.position.set(0, 0.045, 0.165);
    head.add(hairBun);
    const scarfTail = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.3, 0.035), materials.accent));
    scarfTail.position.set(0.135, -0.075, 0.155);
    scarfTail.rotation.set(-0.08, 0.13, -0.24);
    head.add(scarfTail);
    const scarfTailSecondary = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.23, 0.028), materials.cloth));
    scarfTailSecondary.name = "Model_CompanionHeadScarfTailSecondary";
    scarfTailSecondary.position.set(0.045, -0.065, 0.17);
    scarfTailSecondary.rotation.set(0.08, -0.12, 0.2);
    head.add(scarfTailSecondary);
  } else {
    const capCrown = MarkMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.18, 0.11, radialSegments), materials.jacketDark));
    capCrown.position.y = 0.165;
    capCrown.rotation.x = -0.06;
    const capBrim = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.035, 0.16), materials.jacketDark));
    capBrim.position.set(0.025, 0.125, -0.12);
    capBrim.rotation.set(-0.12, -0.025, -0.045);
    head.add(capCrown, capBrim);
  }

  const CreateArm = (side) => {
    const direction = side === "left" ? -1 : 1;
    const shoulderLift = role === "player"
      ? (side === "left" ? 0.018 : -0.018)
      : role === "companion"
        ? (side === "left" ? -0.014 : 0.026)
        : 0;
    const shoulderDepth = role === "player"
      ? (side === "left" ? 0.012 : -0.018)
      : role === "companion"
        ? (side === "left" ? -0.025 : 0.012)
        : 0;
    const shoulder = new THREE.Group();
    shoulder.name = `Bone_${side === "left" ? "Left" : "Right"}Shoulder`;
    shoulder.position.set(direction * 0.278, 0.62 + shoulderLift, shoulderDepth);
    spine.add(shoulder);
    const upperArm = CreateLimbSegment(THREE, shoulder, "Model_UpperArm", 0.43, 0.12, 0.095, materials.jacket, radialSegments);
    const elbow = new THREE.Group();
    elbow.name = `Bone_${side === "left" ? "Left" : "Right"}Elbow`;
    elbow.position.y = -0.42;
    shoulder.add(elbow);
    const forearm = CreateLimbSegment(THREE, elbow, "Model_Forearm", 0.39, 0.095, 0.075, materials.jacketDark, radialSegments);
    const cuff = MarkMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.083, 0.087, 0.095, radialSegments), materials.accent));
    cuff.position.y = -0.355;
    elbow.add(cuff);
    const hand = MarkMesh(new THREE.Mesh(new THREE.CapsuleGeometry(0.052, 0.045, 4, 8), materials.skin));
    hand.position.y = -0.415;
    hand.scale.set(0.9, 1, 0.76);
    elbow.add(hand);
    return { shoulder, upperArm, elbow, forearm, hand };
  };
  const leftArm = CreateArm("left");
  const rightArm = CreateArm("right");

  const CreateLeg = (side) => {
    const direction = side === "left" ? -1 : 1;
    const hip = new THREE.Group();
    hip.name = `Bone_${side === "left" ? "Left" : "Right"}Hip`;
    hip.position.set(direction * 0.135, -0.075, 0);
    pelvis.add(hip);
    const thigh = CreateLimbSegment(THREE, hip, "Model_Thigh", 0.49, 0.135, 0.105, materials.trousers, radialSegments);
    const knee = new THREE.Group();
    knee.name = `Bone_${side === "left" ? "Left" : "Right"}Knee`;
    knee.position.y = -0.47;
    hip.add(knee);
    const calf = CreateLimbSegment(THREE, knee, "Model_Calf", 0.45, 0.102, 0.082, materials.trousers, radialSegments);
    const legWrap = MarkMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.095, 0.1, 0.29, radialSegments), materials.cloth));
    legWrap.name = "Model_ClothLegWrap";
    legWrap.position.y = -0.31;
    knee.add(legWrap);
    const foot = MarkMesh(new THREE.Mesh(new THREE.SphereGeometry(0.135, radialSegments, 6), materials.jacketDark));
    foot.name = "Model_ClothShoe";
    foot.position.set(0, -0.46, -0.07);
    foot.scale.set(0.72, 0.46, 1.35);
    knee.add(foot);
    return { hip, thigh, knee, calf, foot };
  };
  const leftLeg = CreateLeg("left");
  const rightLeg = CreateLeg("right");

  const packDimensions = role === "player"
    ? { width: 0.46, height: 0.34, depth: 0.18 }
    : role === "companion"
      ? { width: 0.42, height: 0.56, depth: 0.21 }
      : { width: 0.4, height: 0.5, depth: 0.2 };
  const pack = MarkMesh(new THREE.Mesh(
    new THREE.BoxGeometry(packDimensions.width, packDimensions.height, packDimensions.depth, 2, 2, 1),
    materials.cloth,
  ));
  pack.name = role === "player" ? "Model_MedicalSatchel" : "Model_CanvasPack";
  pack.position.set(
    role === "player" ? 0.31 : role === "companion" ? -0.075 : 0,
    role === "player" ? 0.16 : role === "companion" ? 0.36 : 0.4,
    role === "player" ? 0.225 : 0.245,
  );
  pack.rotation.set(role === "player" ? 0.05 : 0, role === "player" ? -0.08 : 0, role === "player" ? -0.22 : 0.025);
  spine.add(pack);
  const packFlap = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(role === "companion" ? 0.34 : 0.39, 0.18, 0.045), materials.leather));
  const packBackZ = pack.position.z + packDimensions.depth * 0.5;
  packFlap.position.set(pack.position.x, pack.position.y + packDimensions.height * 0.22, packBackZ + 0.025);
  packFlap.rotation.z = pack.rotation.z;
  spine.add(packFlap);
  const shoulderStrap = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.76, 0.028), materials.cloth), false, true);
  shoulderStrap.name = "Model_CrossBodyCanvasStrap";
  shoulderStrap.position.set(0, 0.38, -0.247);
  shoulderStrap.rotation.z = role === "player" ? -0.48 : 0.42;
  spine.add(shoulderStrap);

  if (role === "player") {
    const satchelPatch = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.105, 0.018), materials.accent), false, true);
    satchelPatch.name = "Model_CourierSatchelClothPatch";
    satchelPatch.position.set(pack.position.x + 0.015, pack.position.y + 0.055, packBackZ + 0.052);
    satchelPatch.rotation.z = pack.rotation.z;
    spine.add(satchelPatch);
    const bandageRoll = MarkMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.052, 0.19, 10), materials.cloth));
    bandageRoll.name = "Model_CourierBandageRoll";
    bandageRoll.position.set(0.31, -0.015, -0.04);
    bandageRoll.rotation.z = -0.26;
    spine.add(bandageRoll);
  } else if (role === "companion") {
    const shawl = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.73, 0.038), materials.accent));
    shawl.name = "Model_CompanionAsymmetricShoulderShawl";
    shawl.position.set(-0.105, 0.39, 0.275);
    shawl.rotation.set(-0.055, -0.045, 0.34);
    spine.add(shawl);
    const shoulderFold = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.16, 0.065), materials.cloth));
    shoulderFold.name = "Model_CompanionShawlShoulderFold";
    shoulderFold.position.set(-0.215, 0.62, 0.17);
    shoulderFold.rotation.set(-0.08, 0.1, -0.2);
    spine.add(shoulderFold);
    const shawlTail = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.36, 0.035), materials.accent));
    shawlTail.name = "Model_CompanionShawlTail";
    shawlTail.position.set(-0.275, 0.035, 0.15);
    shawlTail.rotation.set(0.04, 0.08, 0.18);
    spine.add(shawlTail);
  }
  const rollLength = role === "companion" ? 0.56 : 0.45;
  const roll = MarkMesh(new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.085, rollLength, 9), materials.cloth));
  roll.name = role === "companion" ? "Model_CompanionVerticalBedroll" : "Model_HorizontalBedroll";
  roll.rotation.z = role === "companion" ? 0.1 : Math.PI / 2;
  roll.position.set(role === "companion" ? 0.205 : 0, role === "companion" ? 0.37 : 0.64, 0.285);
  spine.add(roll);
  const pouch = MarkMesh(new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 0.1), materials.leather));
  pouch.position.set(-0.2, 0.02, -0.14);
  spine.add(pouch);

  const contactShadowMaterial = new THREE.MeshBasicMaterial({
    name: "Material_CharacterContactShadow",
    color: 0x080b0a,
    transparent: true,
    opacity: role === "enemy" ? 0.16 : 0.21,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const contactShadow = new THREE.Mesh(new THREE.CircleGeometry(0.38, 16), contactShadowMaterial);
  contactShadow.name = "Effect_CharacterContactShadow";
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = 0.018;
  contactShadow.scale.set(0.72, 1, 1.25);
  contactShadow.renderOrder = -1;
  root.add(contactShadow);

  const weaponPivot = new THREE.Group();
  weaponPivot.name = "Bone_Weapon";
  const carriedTool = role === "companion" ? CreateSickleProp(THREE, materials) : CreateRifleProp(THREE, materials);
  weaponPivot.add(carriedTool);
  spine.add(weaponPivot);
  if (role === "enemy") {
    weaponPivot.position.set(0.18, 0.42, -0.32);
    weaponPivot.rotation.set(-0.18, 0, 0.08);
  } else if (role === "companion") {
    weaponPivot.position.set(-0.37, 0.25, -0.08);
    weaponPivot.rotation.set(0.12, 0.14, 0.35);
  } else {
    weaponPivot.position.set(0.05, 0.42, 0.28);
    weaponPivot.rotation.set(0.12, 0.08, -0.42);
  }

  const characterScale = Number(options.scale) || (role === "companion" ? 0.9 : role === "enemy" ? 0.94 : 0.93);
  root.scale.setScalar(characterScale);
  root.traverse((object) => {
    if (object.isMesh) {
      const isContactShadow = object.name === "Effect_CharacterContactShadow";
      object.castShadow = !isContactShadow;
      object.receiveShadow = !isContactShadow;
    }
  });

  const nodes = {
    root,
    motionRoot,
    pelvis,
    pelvisMesh,
    spine,
    torsoMesh,
    head,
    leftShoulder: leftArm.shoulder,
    leftElbow: leftArm.elbow,
    rightShoulder: rightArm.shoulder,
    rightElbow: rightArm.elbow,
    leftHip: leftLeg.hip,
    leftKnee: leftLeg.knee,
    leftFoot: leftLeg.foot,
    rightHip: rightLeg.hip,
    rightKnee: rightLeg.knee,
    rightFoot: rightLeg.foot,
    weaponPivot,
    pack,
  };

  let disposed = false;
  function Dispose() {
    if (disposed) return;
    disposed = true;
    root.removeFromParent();
    DisposeHierarchy(root, true);
  }

  const rig = { root, group: root, role, nodes, materials, Dispose };
  root.userData.presentationRig = rig;
  return rig;
}

/**
 * Layered procedural motion: locomotion remains readable with reduced motion,
 * while camera-like bob, breathing, and secondary sway are heavily subdued.
 */
export function CreateCharacterAnimator(rig, options = {}) {
  if (!rig?.nodes) throw new Error("CreateCharacterAnimator expects a character rig.");
  const nodes = rig.nodes;
  let reducedMotion = ResolveReducedMotion(options.reducedMotion);
  let secondaryMotion = reducedMotion ? 0.16 : 1;
  let elapsed = 0;
  let phase = Number(options.phase) || 0;
  const blend = { speed: 0, crouch: 0, injured: 0, aiming: 0, alert: 0, bandaging: 0 };
  const state = { mode: "idle", speed: 0, crouch: 0, injured: 0, aiming: 0, alert: 0, bandaging: 0 };
  const basePelvisY = nodes.pelvis.position.y;
  const baseTorsoScaleY = nodes.torsoMesh.scale.y;
  const baseWeaponRotation = nodes.weaponPivot.rotation.clone();
  const basePose = rig.role === "player"
    ? Object.freeze({
      pelvisRoll: 0.035,
      spineRoll: -0.085,
      headYaw: 0.06,
      leftShoulderX: -0.12,
      rightShoulderX: 0.11,
      leftShoulderZ: -0.16,
      rightShoulderZ: 0.08,
      leftElbowX: 0.62,
      rightElbowX: 0.25,
      leftElbowZ: 0.34,
      rightElbowZ: -0.1,
    })
    : rig.role === "companion"
      ? Object.freeze({
        pelvisRoll: -0.04,
        spineRoll: 0.09,
        headYaw: -0.075,
        leftShoulderX: 0.18,
        rightShoulderX: -0.1,
        leftShoulderZ: -0.13,
        rightShoulderZ: 0.15,
        leftElbowX: 0.28,
        rightElbowX: 0.66,
        leftElbowZ: 0.12,
        rightElbowZ: -0.32,
      })
      : Object.freeze({
        pelvisRoll: 0,
        spineRoll: 0,
        headYaw: 0,
        leftShoulderX: -0.025,
        rightShoulderX: 0.025,
        leftShoulderZ: -0.07,
        rightShoulderZ: 0.07,
        leftElbowX: 0.26,
        rightElbowX: 0.22,
        leftElbowZ: -0.025,
        rightElbowZ: 0.025,
      });

  function SetState(nextState = {}) {
    Object.assign(state, nextState);
    if (typeof nextState.mode === "string") {
      if (nextState.mode === "walk" && nextState.speed == null) state.speed = 0.7;
      if (nextState.mode === "run" && nextState.speed == null) state.speed = 1;
      if (nextState.mode === "crouch") state.crouch = 1;
      if (nextState.mode === "injured") state.injured = 1;
      if (nextState.mode === "aim") state.aiming = 1;
      if (nextState.mode === "idle") state.speed = 0;
    }
  }

  function SetReducedMotion(value) {
    reducedMotion = Boolean(value);
    secondaryMotion = reducedMotion ? 0.16 : 1;
  }

  function Update(delta, nextState) {
    if (nextState) SetState(nextState);
    const safeDelta = Math.min(0.05, Math.max(0, delta));
    elapsed += safeDelta;
    const speedTarget = Clamp(state.speed);
    const crouchTarget = Clamp(typeof state.crouch === "boolean" ? Number(state.crouch) : state.crouch);
    const injuryTarget = Clamp(typeof state.injured === "boolean" ? Number(state.injured) : state.injured);
    const aimingTarget = Clamp(typeof state.aiming === "boolean" ? Number(state.aiming) : state.aiming);
    const alertTarget = Clamp(state.alert);
    const bandageTarget = Clamp(typeof state.bandaging === "boolean" ? Number(state.bandaging) : state.bandaging);
    blend.speed = Damp(blend.speed, speedTarget, 8, safeDelta);
    blend.crouch = Damp(blend.crouch, crouchTarget, 7, safeDelta);
    blend.injured = Damp(blend.injured, injuryTarget, 4.5, safeDelta);
    blend.aiming = Damp(blend.aiming, aimingTarget, 10, safeDelta);
    blend.alert = Damp(blend.alert, alertTarget, 5, safeDelta);
    blend.bandaging = Damp(blend.bandaging, bandageTarget, bandageTarget > blend.bandaging ? 15 : 9, safeDelta);

    phase += safeDelta * (1.4 + blend.speed * (5.5 - blend.crouch * 1.4));
    const strideWave = Math.sin(phase);
    const strideLift = Math.max(0, Math.sin(phase + Math.PI / 2));
    const strideAmount = blend.speed * (0.62 - blend.crouch * 0.2) * (1 - blend.injured * 0.28);
    const breath = Math.sin(elapsed * (1.45 + blend.alert * 0.75)) * 0.014 * secondaryMotion;
    const bob = Math.abs(Math.sin(phase * 2)) * 0.045 * blend.speed * secondaryMotion;

    nodes.pelvis.position.y = basePelvisY - blend.crouch * 0.31 - blend.injured * 0.035 + bob;
    nodes.pelvis.rotation.y = strideWave * strideAmount * 0.07 * secondaryMotion;
    nodes.pelvis.rotation.z = basePose.pelvisRoll + blend.injured * 0.075 + Math.sin(elapsed * 0.7) * blend.injured * 0.012 * secondaryMotion;
    nodes.spine.rotation.x = blend.crouch * 0.42 + blend.speed * 0.055 + blend.injured * 0.11;
    nodes.spine.rotation.y = -strideWave * strideAmount * 0.06 * secondaryMotion;
    nodes.spine.rotation.z = basePose.spineRoll + blend.injured * 0.105;
    nodes.torsoMesh.scale.y = baseTorsoScaleY + breath;
    nodes.head.rotation.x = -blend.crouch * 0.12 - blend.injured * 0.05 + blend.alert * 0.04;
    nodes.head.rotation.y = basePose.headYaw + Math.sin(elapsed * 0.45) * 0.025 * (1 - blend.speed) * secondaryMotion;

    nodes.leftHip.rotation.x = strideWave * strideAmount;
    nodes.rightHip.rotation.x = -strideWave * strideAmount * (1 - blend.injured * 0.45);
    nodes.leftKnee.rotation.x = Math.max(0, -strideWave) * strideAmount * 0.72 + blend.crouch * 0.43;
    nodes.rightKnee.rotation.x = Math.max(0, strideWave) * strideAmount * 0.72 + blend.crouch * 0.43 + blend.injured * 0.08;
    nodes.leftFoot.rotation.x = -strideLift * strideAmount * 0.16;
    nodes.rightFoot.rotation.x = -Math.max(0, Math.sin(phase - Math.PI / 2)) * strideAmount * 0.16;

    const armSwing = strideWave * strideAmount * 0.72 * (1 - blend.aiming) * (1 - blend.bandaging);
    const aimPoseBlend = 1 - blend.aiming * 0.72;
    const friendlyIdleWeight = rig.role === "enemy" ? 0 : (1 - blend.speed) * (1 - blend.aiming);
    const idleGesture = Math.sin(elapsed * 0.72 + (rig.role === "companion" ? 1.4 : 0.25))
      * 0.032
      * friendlyIdleWeight
      * secondaryMotion;
    nodes.leftShoulder.rotation.x = basePose.leftShoulderX * aimPoseBlend - armSwing + idleGesture - blend.crouch * 0.12 - blend.aiming * 0.86;
    nodes.rightShoulder.rotation.x = basePose.rightShoulderX * aimPoseBlend + armSwing - idleGesture * 0.35 - blend.crouch * 0.12 - blend.aiming * 0.82;
    nodes.leftShoulder.rotation.z = basePose.leftShoulderZ + blend.aiming * -0.16;
    nodes.rightShoulder.rotation.z = basePose.rightShoulderZ + blend.aiming * 0.22 + blend.injured * 0.1;
    nodes.leftElbow.rotation.x = basePose.leftElbowX + blend.crouch * 0.18 - blend.aiming * (basePose.leftElbowX + 0.62);
    nodes.rightElbow.rotation.x = basePose.rightElbowX + blend.crouch * 0.18 - blend.aiming * (basePose.rightElbowX + 0.65);
    nodes.leftElbow.rotation.z = basePose.leftElbowZ * (1 - blend.aiming * 0.86) + idleGesture * 0.55;
    nodes.rightElbow.rotation.z = basePose.rightElbowZ * (1 - blend.aiming * 0.86) - idleGesture * 0.18;
    if (rig.role === "player" && blend.bandaging > 0.001) {
      const wrapWave = Math.sin(elapsed * 11.5) * 0.16 * secondaryMotion;
      nodes.leftShoulder.rotation.x += (-1.02 - nodes.leftShoulder.rotation.x) * blend.bandaging;
      nodes.rightShoulder.rotation.x += (-0.92 - nodes.rightShoulder.rotation.x) * blend.bandaging;
      nodes.leftShoulder.rotation.z += (0.58 + wrapWave - nodes.leftShoulder.rotation.z) * blend.bandaging;
      nodes.rightShoulder.rotation.z += (-0.52 - wrapWave - nodes.rightShoulder.rotation.z) * blend.bandaging;
      nodes.leftElbow.rotation.x += (-0.42 - nodes.leftElbow.rotation.x) * blend.bandaging;
      nodes.rightElbow.rotation.x += (-0.5 - nodes.rightElbow.rotation.x) * blend.bandaging;
      nodes.leftElbow.rotation.z += (0.52 + wrapWave - nodes.leftElbow.rotation.z) * blend.bandaging;
      nodes.rightElbow.rotation.z += (-0.46 - wrapWave - nodes.rightElbow.rotation.z) * blend.bandaging;
      nodes.head.rotation.x -= blend.bandaging * 0.12;
    }
    nodes.weaponPivot.rotation.x = baseWeaponRotation.x - blend.aiming * 0.48;
    nodes.weaponPivot.rotation.y = baseWeaponRotation.y + blend.aiming * 0.1;
    nodes.weaponPivot.rotation.z = baseWeaponRotation.z + blend.aiming * (rig.role === "enemy" ? -0.03 : 0.38);
  }

  function Reset() {
    SetState({ mode: "idle", speed: 0, crouch: 0, injured: 0, aiming: 0, alert: 0, bandaging: 0 });
    blend.bandaging = 0;
    Update(1, state);
    elapsed = 0;
  }

  const animator = {
    Update,
    SetState,
    SetReducedMotion,
    Reset,
    state,
    blend,
    get reducedMotion() { return reducedMotion; },
  };
  rig.animator = animator;
  return animator;
}

export function CreateCharacterRoster(THREE, options = {}) {
  const root = new THREE.Group();
  root.name = "Model_CharacterRoster";
  const common = { reducedMotion: options.reducedMotion };
  const player = CreateCharacterRig(THREE, { ...common, role: "player", name: "Model_RouteCourier" });
  const companion = CreateCharacterRig(THREE, { ...common, role: "companion", name: "Model_VillageGuide" });
  const requestedEnemyCount = Number(options.enemyCount);
  const enemyCount = Math.max(0, Math.min(8, Number.isFinite(requestedEnemyCount) ? Math.floor(requestedEnemyCount) : 3));
  const enemies = Array.from({ length: enemyCount }, (_, index) => CreateCharacterRig(THREE, {
    ...common,
    role: "enemy",
    name: `Model_OccupationPatrol_${index + 1}`,
    scale: 0.88 + (index % 3) * 0.025,
  }));
  player.group.position.set(-37, GetTerrainHeight(-37, 69), 69);
  companion.group.position.set(-34.5, GetTerrainHeight(-34.5, 67.5), 67.5);
  player.group.rotation.y = 0;
  companion.group.rotation.y = 0;
  const enemyPositions = [[24, -24], [8, -42], [-2, -48], [-13, -70], [-20, -76]];
  enemies.forEach((enemy, index) => {
    const [x, z] = enemyPositions[index % enemyPositions.length];
    enemy.group.position.set(x, GetTerrainHeight(x, z), z);
    enemy.group.rotation.y = index % 2 ? 0.25 : -0.3;
  });
  [player, companion, ...enemies].forEach((rig, index) => {
    root.add(rig.group);
    CreateCharacterAnimator(rig, { reducedMotion: options.reducedMotion, phase: index * 1.7 });
  });
  const modelUpgrades = options.loadFriendlyModels === false || typeof window === "undefined"
    ? null
    : BeginFriendlyCharacterModelUpgrades(THREE, {
      playerRig: player,
      companionRig: companion,
      reducedMotion: options.reducedMotion,
      onComplete: (results) => {
        root.userData.friendlyModelResults = results.map((result) => ({
          ok: Boolean(result.ok),
          role: result.role,
          characterId: result.characterId || null,
          reason: result.reason || null,
        }));
      },
    });

  function Update(delta, state = {}) {
    player.animator.Update(delta, state.player);
    companion.animator.Update(delta, state.companion);
    enemies.forEach((enemy, index) => enemy.animator.Update(delta, state.enemies?.[index]));
  }

  function SetReducedMotion(value) {
    [player, companion, ...enemies].forEach((rig) => rig.animator.SetReducedMotion(value));
  }

  function Dispose() {
    modelUpgrades?.Cancel?.();
    [player, companion, ...enemies].forEach((rig) => rig.Dispose());
    root.removeFromParent();
  }

  return {
    root,
    player,
    companion,
    enemies,
    modelUpgrades,
    modelsReady: modelUpgrades?.ready || Promise.resolve([]),
    SetReducedMotion,
    Update,
    Dispose,
  };
}

function CreateRadialParticleTexture(THREE, innerColor, outerColor) {
  if (typeof document === "undefined" || !THREE.CanvasTexture) return null;
  const canvas = document.createElement("canvas");
  canvas.width = 32;
  canvas.height = 32;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const gradient = context.createRadialGradient(16, 16, 1, 16, 16, 15);
  gradient.addColorStop(0, innerColor);
  gradient.addColorStop(0.36, outerColor);
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 32, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = "Texture_ProceduralParticleSoftDisc";
  texture.needsUpdate = true;
  return texture;
}

function CreatePointCloud(THREE, name, count, material, random, initializer) {
  const positions = new Float32Array(count * 3);
  const velocities = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const initial = initializer(index, random);
    positions[index * 3] = initial.x;
    positions[index * 3 + 1] = initial.y;
    positions[index * 3 + 2] = initial.z;
    velocities[index * 3] = initial.velocityX;
    velocities[index * 3 + 1] = initial.velocityY;
    velocities[index * 3 + 2] = initial.velocityZ;
    phases[index] = random() * Math.PI * 2;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(geometry, material);
  points.name = name;
  points.frustumCulled = false;
  return { points, geometry, positions, velocities, phases, count };
}

export function CreateAtmosphericEffects(THREE, options = {}) {
  if (!THREE?.Points) throw new Error("CreateAtmosphericEffects requires a THREE namespace.");
  const profile = DesktopRenderingProfile;
  let reducedMotion = ResolveReducedMotion(options.reducedMotion);
  const random = CreateSeededRandom(19421107);
  const root = new THREE.Group();
  root.name = "Scene_AtmosphericEffects";
  const dustTexture = CreateRadialParticleTexture(THREE, "rgba(210,184,145,0.8)", "rgba(135,113,84,0.26)");
  const emberTexture = CreateRadialParticleTexture(THREE, "rgba(255,230,154,1)", "rgba(221,89,37,0.5)");
  const dustMaterial = new THREE.PointsMaterial({
    name: "Material_DriftingDust",
    color: 0xb49b77,
    map: dustTexture,
    transparent: true,
    opacity: reducedMotion ? 0.18 : 0.34,
    size: 0.9,
    sizeAttenuation: true,
    depthWrite: false,
    alphaTest: dustTexture ? 0.025 : 0,
    blending: THREE.NormalBlending,
    fog: true,
  });
  const emberMaterial = new THREE.PointsMaterial({
    name: "Material_RisingEmbers",
    color: 0xe98543,
    map: emberTexture,
    transparent: true,
    opacity: reducedMotion ? 0.22 : 0.72,
    size: 0.3,
    sizeAttenuation: true,
    depthWrite: false,
    alphaTest: emberTexture ? 0.03 : 0,
    blending: THREE.AdditiveBlending,
    fog: true,
  });
  const dustCount = reducedMotion ? Math.min(8, profile.dustCount) : profile.dustCount;
  const emberCount = reducedMotion ? Math.min(3, profile.emberCount) : profile.emberCount;
  const dust = CreatePointCloud(THREE, "Effect_RoadDust", dustCount, dustMaterial, random, () => {
    const z = -90 + random() * 168;
    const x = GetRouteCenterX(z) + (random() - 0.5) * 18;
    return {
      x,
      y: GetTerrainHeight(x, z) + 0.15 + random() * 2.6,
      z,
      velocityX: 0.08 + random() * 0.2,
      velocityY: 0.018 + random() * 0.04,
      velocityZ: (random() - 0.5) * 0.09,
    };
  });
  const emberOrigin = ReadPosition(options.emberOrigin, { x: -29, y: GetTerrainHeight(-29, 52) + 0.55, z: 52 });
  const embers = CreatePointCloud(THREE, "Effect_CartEmbers", emberCount, emberMaterial, random, () => ({
    x: emberOrigin.x + (random() - 0.5) * 1.6,
    y: emberOrigin.y + random() * 1.2,
    z: emberOrigin.z + (random() - 0.5) * 1.3,
    velocityX: (random() - 0.5) * 0.18,
    velocityY: 0.26 + random() * 0.42,
    velocityZ: (random() - 0.5) * 0.18,
  }));
  const muzzleCoreMaterial = new THREE.MeshBasicMaterial({
    name: "Material_MuzzleFlashCore",
    color: 0xffedbd,
    transparent: true,
    opacity: 0.94,
    depthWrite: false,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
  });
  const muzzleFlameMaterial = new THREE.MeshBasicMaterial({
    name: "Material_MuzzleFlashFlame",
    color: 0xff9d45,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const muzzleCrossMaterial = new THREE.MeshBasicMaterial({
    name: "Material_MuzzleFlashPeripheralGlow",
    color: 0xffbc68,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
  });
  const muzzleGlow = new THREE.Group();
  muzzleGlow.name = "Effect_MuzzleFlash";
  const muzzleCore = new THREE.Mesh(new THREE.OctahedronGeometry(0.065, 0), muzzleCoreMaterial);
  muzzleCore.name = "Effect_MuzzleFlashCore";
  const muzzleInnerFlame = new THREE.Mesh(new THREE.ConeGeometry(0.026, 0.11, 7, 1, true), muzzleCoreMaterial);
  muzzleInnerFlame.name = "Effect_MuzzleFlashInnerFlame";
  muzzleInnerFlame.rotation.x = -Math.PI / 2;
  muzzleInnerFlame.position.z = -0.055;
  const muzzleFlame = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.2, 7, 1, true), muzzleFlameMaterial);
  muzzleFlame.name = "Effect_MuzzleFlashFlame";
  muzzleFlame.rotation.x = -Math.PI / 2;
  muzzleFlame.position.z = -0.1;
  const muzzleTongue = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.28, 6, 1, true), muzzleFlameMaterial);
  muzzleTongue.name = "Effect_MuzzleFlashOrangeTongue";
  muzzleTongue.rotation.x = -Math.PI / 2;
  muzzleTongue.position.z = -0.14;
  const muzzleCrossA = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.026), muzzleCrossMaterial);
  muzzleCrossA.name = "Effect_MuzzleFlashCross";
  muzzleCrossA.position.z = -0.012;
  const muzzleCrossB = muzzleCrossA.clone();
  muzzleCrossB.rotation.z = Math.PI / 2;
  muzzleGlow.add(muzzleCore, muzzleInnerFlame, muzzleFlame, muzzleTongue, muzzleCrossA, muzzleCrossB);
  muzzleGlow.renderOrder = 6;
  muzzleGlow.visible = false;
  const muzzleLight = new THREE.PointLight(0xff8a3d, 0, 4.8, 2);
  muzzleLight.name = "Effect_MuzzleLight";
  muzzleLight.visible = false;

  const sparkMaterial = new THREE.MeshBasicMaterial({
    name: "Material_ImpactSpark",
    color: 0xf0aa63,
    transparent: true,
    opacity: 0.94,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const debrisMaterial = new THREE.MeshStandardMaterial({
    name: "Material_ImpactDebris",
    color: 0x71624f,
    roughness: 1,
    flatShading: true,
  });
  const transientPool = [];
  const sparkGeometry = new THREE.BoxGeometry(0.028, 0.028, 0.22);
  const debrisGeometry = new THREE.TetrahedronGeometry(0.045, 0);
  for (let index = 0; index < 32; index += 1) {
    const spark = index % 2 === 0;
    const mesh = new THREE.Mesh(
      spark ? sparkGeometry : debrisGeometry,
      spark ? sparkMaterial : debrisMaterial,
    );
    mesh.name = spark ? "Effect_ImpactSpark" : "Effect_ImpactDebris";
    mesh.visible = false;
    root.add(mesh);
    transientPool.push({ mesh, spark, velocity: new THREE.Vector3(), life: 0 });
  }

  const impactFlashMaterial = new THREE.MeshBasicMaterial({
    name: "Material_ImpactFlash",
    color: 0xffbd71,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const impactHaloTexture = CreateRadialParticleTexture(THREE, "rgba(255,232,191,0.88)", "rgba(231,126,61,0.3)");
  const impactHaloMaterial = new THREE.SpriteMaterial({
    name: "Material_ImpactHalo",
    color: 0xffb36b,
    map: impactHaloTexture,
    transparent: true,
    opacity: 0.48,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    fog: true,
  });
  const impactFlashGeometry = new THREE.SphereGeometry(0.115, 9, 6);
  const impactFlashPool = [];
  for (let index = 0; index < 4; index += 1) {
    const flash = new THREE.Group();
    flash.name = `Effect_ImpactFlash_${index + 1}`;
    const glow = new THREE.Mesh(impactFlashGeometry, impactFlashMaterial);
    const halo = new THREE.Sprite(impactHaloMaterial);
    halo.name = "Effect_ImpactHalo";
    halo.scale.set(0.62, 0.62, 1);
    const light = new THREE.PointLight(0xffa75e, 0, 4.2, 2);
    flash.add(halo, glow, light);
    flash.visible = false;
    root.add(flash);
    impactFlashPool.push({ flash, glow, halo, light, life: 0, duration: 0.12 });
  }
  const hitPulseTexture = CreateRadialParticleTexture(THREE, "rgba(255,218,188,0.9)", "rgba(125,42,31,0.34)");
  const hitPulsePool = [];
  for (let index = 0; index < 4; index += 1) {
    const material = new THREE.SpriteMaterial({
      name: "Material_HitConfirmationPulse",
      color: 0xb75f49,
      map: hitPulseTexture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: THREE.NormalBlending,
      fog: true,
    });
    const pulse = new THREE.Sprite(material);
    pulse.name = `Effect_HitConfirmationPulse_${index + 1}`;
    pulse.visible = false;
    root.add(pulse);
    hitPulsePool.push({ pulse, material, life: 0, duration: 0.18 });
  }
  root.add(dust.points, embers.points, muzzleGlow, muzzleLight);
  let elapsed = 0;
  let effectIntensity = 1;
  let muzzleLife = 0;
  let muzzleDuration = 0.115;

  function SetEmberOrigin(position) {
    Object.assign(emberOrigin, ReadPosition(position, emberOrigin));
  }

  function SetIntensity(value) {
    effectIntensity = Clamp(value, 0, 1.5);
  }

  function SetReducedMotion(value) {
    reducedMotion = Boolean(value);
  }

  function BurstDust(position, strength = 1) {
    if (!dust.count) return;
    const origin = ReadPosition(position);
    const burstCount = Math.min(dust.count, Math.max(2, Math.round(8 * Clamp(strength, 0.1, 2))));
    for (let index = 0; index < burstCount; index += 1) {
      dust.positions[index * 3] = origin.x + (random() - 0.5) * 0.6;
      dust.positions[index * 3 + 1] = origin.y + random() * 0.3;
      dust.positions[index * 3 + 2] = origin.z + (random() - 0.5) * 0.6;
      dust.velocities[index * 3] = (random() - 0.35) * 0.65 * strength;
      dust.velocities[index * 3 + 1] = (0.1 + random() * 0.3) * strength;
      dust.velocities[index * 3 + 2] = (random() - 0.5) * 0.42 * strength;
    }
    dust.geometry.getAttribute("position").needsUpdate = true;
  }

  function ResolveEffectPosition(target) {
    if (target?.nodes?.muzzleAnchor?.getWorldPosition) {
      target.group?.updateWorldMatrix?.(true, true);
      return target.nodes.muzzleAnchor.getWorldPosition(new THREE.Vector3());
    }
    if (target?.nodes?.weaponPivot?.getWorldPosition) {
      target.group?.updateWorldMatrix?.(true, true);
      const point = target.nodes.weaponPivot.getWorldPosition(new THREE.Vector3());
      const direction = new THREE.Vector3(0, 0, -1);
      direction.applyQuaternion(target.nodes.weaponPivot.getWorldQuaternion(new THREE.Quaternion()));
      return point.addScaledVector(direction, 1.15);
    }
    const point = ReadPosition(target);
    return new THREE.Vector3(point.x, point.y, point.z);
  }

  function ActivateTransient(position, sparkOnly = false, amount = 4, strength = 1) {
    const point = ResolveEffectPosition(position);
    let activated = 0;
    transientPool.forEach((particle) => {
      if (activated >= amount || particle.life > 0 || (sparkOnly && !particle.spark)) return;
      particle.mesh.position.copy(point);
      particle.mesh.position.x += (random() - 0.5) * 0.1;
      particle.mesh.position.y += random() * 0.08;
      particle.mesh.position.z += (random() - 0.5) * 0.1;
      particle.velocity.set(
        (random() - 0.5) * 1.6 * strength,
        (0.3 + random() * 1.2) * strength,
        (random() - 0.5) * 1.6 * strength,
      );
      particle.mesh.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
      particle.life = particle.spark ? 0.18 + random() * 0.14 : 0.26 + random() * 0.22;
      particle.mesh.visible = true;
      activated += 1;
    });
  }

  function ActivateImpactFlash(position, strength = 1) {
    const point = ResolveEffectPosition(position);
    const flashEntry = impactFlashPool.find((entry) => entry.life <= 0) || impactFlashPool[0];
    flashEntry.flash.position.copy(point);
    flashEntry.flash.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
    flashEntry.flash.scale.setScalar(0.76 + Clamp(strength, 0.25, 1.5) * 0.5);
    flashEntry.halo.scale.set(0.62, 0.62, 1);
    flashEntry.duration = reducedMotion ? 0.055 : 0.13;
    flashEntry.life = flashEntry.duration;
    flashEntry.light.intensity = reducedMotion ? 0.65 : 2.9 * Clamp(strength, 0.25, 1.5);
    flashEntry.flash.visible = true;
  }

  function ActivateHitPulse(position, strength = 1) {
    const point = ResolveEffectPosition(position);
    const entry = hitPulsePool.find((candidate) => candidate.life <= 0) || hitPulsePool[0];
    entry.pulse.position.copy(point);
    entry.duration = reducedMotion ? 0.075 : 0.19;
    entry.life = entry.duration;
    entry.material.opacity = reducedMotion ? 0.38 : 0.72 * Clamp(strength, 0.4, 1.25);
    entry.pulse.scale.set(0.34, 0.34, 1);
    entry.pulse.visible = true;
  }

  function MuzzleFlash(rigOrPosition) {
    const point = ResolveEffectPosition(rigOrPosition);
    muzzleGlow.position.copy(point);
    muzzleLight.position.copy(point);
    const muzzleOrientation = rigOrPosition?.nodes?.muzzleAnchor || rigOrPosition?.nodes?.weaponPivot;
    if (muzzleOrientation?.getWorldQuaternion) {
      muzzleOrientation.getWorldQuaternion(muzzleGlow.quaternion);
    } else {
      muzzleGlow.quaternion.identity();
    }
    muzzleGlow.rotation.z += random() * Math.PI * 0.5;
    muzzleGlow.scale.setScalar(0.96);
    muzzleGlow.visible = true;
    muzzleLight.visible = true;
    muzzleLight.intensity = (reducedMotion ? 0.8 : 3.2) * Clamp(effectIntensity, 0.4, 1.15);
    muzzleDuration = reducedMotion ? 0.055 : 0.115;
    muzzleLife = muzzleDuration;
  }

  function HitSpark(position) {
    ActivateImpactFlash(position, 1.05);
    ActivateHitPulse(position, 1);
    ActivateTransient(position, true, reducedMotion ? 3 : 10, reducedMotion ? 0.42 : 1.06);
  }

  function BulletImpact(position) {
    const point = ResolveEffectPosition(position);
    ActivateImpactFlash(point, 0.68);
    BurstDust(point, reducedMotion ? 0.4 : 0.82);
    ActivateTransient(point, false, reducedMotion ? 3 : 12, reducedMotion ? 0.34 : 0.86);
  }

  function Update(delta, state = {}) {
    const safeDelta = Math.min(0.05, Math.max(0, delta));
    elapsed += safeDelta;
    if (state.effectIntensity != null || state.intensity != null) SetIntensity(state.effectIntensity ?? state.intensity);
    const motionScale = reducedMotion ? 0.12 : 1;
    for (let index = 0; index < dust.count; index += 1) {
      const offset = index * 3;
      dust.positions[offset] += (dust.velocities[offset] + Math.sin(elapsed * 0.22 + dust.phases[index]) * 0.04) * safeDelta * motionScale;
      dust.positions[offset + 1] += dust.velocities[offset + 1] * safeDelta * motionScale;
      dust.positions[offset + 2] += dust.velocities[offset + 2] * safeDelta * motionScale;
      if (dust.positions[offset + 1] > GetTerrainHeight(dust.positions[offset], dust.positions[offset + 2]) + 3.4) {
        const z = -90 + random() * 168;
        dust.positions[offset] = GetRouteCenterX(z) + (random() - 0.5) * 16;
        dust.positions[offset + 1] = GetTerrainHeight(dust.positions[offset], z) + 0.12;
        dust.positions[offset + 2] = z;
      }
    }
    for (let index = 0; index < embers.count; index += 1) {
      const offset = index * 3;
      embers.positions[offset] += (embers.velocities[offset] + Math.sin(elapsed * 2 + embers.phases[index]) * 0.08) * safeDelta * motionScale;
      embers.positions[offset + 1] += embers.velocities[offset + 1] * safeDelta * motionScale;
      embers.positions[offset + 2] += embers.velocities[offset + 2] * safeDelta * motionScale;
      if (embers.positions[offset + 1] > emberOrigin.y + 3 + random() * 0.5) {
        embers.positions[offset] = emberOrigin.x + (random() - 0.5) * 1.4;
        embers.positions[offset + 1] = emberOrigin.y + random() * 0.3;
        embers.positions[offset + 2] = emberOrigin.z + (random() - 0.5) * 1.2;
      }
    }
    dust.geometry.getAttribute("position").needsUpdate = true;
    embers.geometry.getAttribute("position").needsUpdate = true;
    dustMaterial.opacity = (reducedMotion ? 0.18 : 0.34) * effectIntensity;
    emberMaterial.opacity = (reducedMotion ? 0.22 : 0.72) * effectIntensity;
    if (muzzleLife > 0) {
      muzzleLife -= safeDelta;
      const muzzleProgress = Clamp(muzzleLife / Math.max(0.001, muzzleDuration));
      muzzleGlow.rotation.z += safeDelta * 12;
      muzzleGlow.scale.setScalar(0.84 + muzzleProgress * 0.42);
      const muzzleVisibility = Clamp(effectIntensity, 0, 1.2);
      muzzleCoreMaterial.opacity = (0.28 + muzzleProgress * 0.66) * muzzleVisibility;
      muzzleFlameMaterial.opacity = (0.16 + muzzleProgress * 0.62) * muzzleVisibility;
      muzzleCrossMaterial.opacity = (0.06 + muzzleProgress * 0.42) * muzzleVisibility;
      muzzleLight.intensity = Math.max(0, muzzleLight.intensity * Math.exp(-safeDelta * 23));
      if (muzzleLife <= 0) {
        muzzleGlow.visible = false;
        muzzleLight.visible = false;
      }
    }
    impactFlashPool.forEach((entry) => {
      if (entry.life <= 0) return;
      entry.life -= safeDelta;
      const progress = Clamp(entry.life / Math.max(0.001, entry.duration));
      entry.glow.scale.setScalar(0.72 + (1 - progress) * 1.55);
      const haloSize = 0.58 + (1 - progress) * 0.52;
      entry.halo.scale.set(haloSize, haloSize, 1);
      entry.light.intensity *= Math.exp(-safeDelta * 26);
      if (entry.life <= 0) entry.flash.visible = false;
    });
    hitPulsePool.forEach((entry) => {
      if (entry.life <= 0) return;
      entry.life -= safeDelta;
      const progress = Clamp(entry.life / Math.max(0.001, entry.duration));
      const pulseSize = 0.34 + (1 - progress) * 0.46;
      entry.pulse.scale.set(pulseSize, pulseSize, 1);
      entry.material.opacity = progress * (reducedMotion ? 0.38 : 0.72) * Clamp(effectIntensity, 0, 1.2);
      if (entry.life <= 0) entry.pulse.visible = false;
    });
    transientPool.forEach((particle) => {
      if (particle.life <= 0) return;
      particle.life -= safeDelta;
      particle.mesh.position.addScaledVector(particle.velocity, safeDelta);
      particle.velocity.y -= 4.8 * safeDelta;
      particle.mesh.rotation.x += safeDelta * 7;
      particle.mesh.rotation.z += safeDelta * 5;
      if (particle.life <= 0) particle.mesh.visible = false;
    });
  }

  function Dispose() {
    root.removeFromParent();
    DisposeHierarchy(root, true);
  }

  return {
    root,
    dust: dust.points,
    embers: embers.points,
    get reducedMotion() { return reducedMotion; },
    SetEmberOrigin,
    SetIntensity,
    SetReducedMotion,
    BurstDust,
    MuzzleFlash,
    HitSpark,
    BulletImpact,
    Update,
    Dispose,
  };
}

function SetAudioParam(audioParam, value, time, smoothing = 0.04) {
  if (!audioParam) return;
  audioParam.cancelScheduledValues?.(time);
  audioParam.setTargetAtTime?.(value, time, smoothing);
}

function SetPannerPosition(panner, position, time) {
  const point = ReadPosition(position);
  if (panner.positionX) {
    panner.positionX.setValueAtTime(point.x, time);
    panner.positionY.setValueAtTime(point.y, time);
    panner.positionZ.setValueAtTime(point.z, time);
  } else {
    panner.setPosition?.(point.x, point.y, point.z);
  }
}

/**
 * WebAudio soundscape made from filtered noise and restrained oscillators.
 * It never starts before a user gesture and contains no sampled external IP.
 */
export function CreateAudioDirector(options = {}) {
  const AudioConstructor = typeof window !== "undefined"
    ? window.AudioContext || window.webkitAudioContext
    : null;
  let context = options.context || null;
  const ownsContext = !options.context;
  let started = false;
  let disposed = false;
  let muted = Boolean(options.muted);
  let intensity = 0.25;
  let masterGain = null;
  let ambienceGain = null;
  let cueGain = null;
  let windGain = null;
  let tensionGain = null;
  const loopingSources = new Set();
  const activeSources = new Set();
  const unlockTarget = options.unlockTarget || (typeof document !== "undefined" ? document : null);
  const unlockEvents = ["pointerdown", "keydown"];

  function CreateContext() {
    if (context || !AudioConstructor || disposed) return context;
    context = new AudioConstructor({ latencyHint: "interactive" });
    return context;
  }

  function CreateNoiseBuffer(duration = 2.4, color = "brown") {
    const sampleRate = context.sampleRate;
    const frameCount = Math.max(1, Math.floor(duration * sampleRate));
    const buffer = context.createBuffer(1, frameCount, sampleRate);
    const channel = buffer.getChannelData(0);
    let previous = 0;
    for (let index = 0; index < frameCount; index += 1) {
      const white = Math.random() * 2 - 1;
      if (color === "brown") {
        previous = (previous + 0.018 * white) / 1.018;
        channel[index] = previous * 3.1;
      } else {
        channel[index] = white;
      }
    }
    return buffer;
  }

  function RegisterSource(source, looping = false) {
    activeSources.add(source);
    if (looping) loopingSources.add(source);
    source.addEventListener?.("ended", () => {
      activeSources.delete(source);
      loopingSources.delete(source);
    }, { once: true });
    return source;
  }

  function CreateSpatialBus(position, gainValue = 1) {
    const input = context.createGain();
    input.gain.value = gainValue;
    if (!position || !context.createPanner) {
      input.connect(cueGain);
      return { input, panner: null };
    }
    const panner = context.createPanner();
    panner.panningModel = "HRTF";
    panner.distanceModel = "inverse";
    panner.refDistance = 2.5;
    panner.maxDistance = 85;
    panner.rolloffFactor = 0.88;
    panner.coneInnerAngle = 280;
    panner.coneOuterAngle = 360;
    panner.coneOuterGain = 0.35;
    SetPannerPosition(panner, position, context.currentTime);
    input.connect(panner).connect(cueGain);
    return { input, panner };
  }

  function CreateLoopingNoise(position, filterType, frequency, gainValue) {
    const source = RegisterSource(context.createBufferSource(), true);
    source.buffer = CreateNoiseBuffer(3.2, "brown");
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = 0.72;
    const gain = context.createGain();
    gain.gain.value = gainValue;
    source.connect(filter).connect(gain);
    if (position && context.createPanner) {
      const panner = context.createPanner();
      panner.panningModel = "HRTF";
      panner.distanceModel = "inverse";
      panner.refDistance = 5;
      panner.maxDistance = 120;
      panner.rolloffFactor = 0.45;
      SetPannerPosition(panner, position, context.currentTime);
      gain.connect(panner).connect(ambienceGain);
    } else {
      gain.connect(ambienceGain);
    }
    source.start();
    return { source, gain };
  }

  function StartAmbience() {
    if (started || !context) return;
    started = true;
    masterGain = context.createGain();
    ambienceGain = context.createGain();
    cueGain = context.createGain();
    masterGain.gain.value = muted ? 0 : Clamp(options.volume ?? 0.72);
    ambienceGain.gain.value = 0.72;
    cueGain.gain.value = 0.9;
    ambienceGain.connect(masterGain);
    cueGain.connect(masterGain);
    masterGain.connect(context.destination);

    const wind = CreateLoopingNoise(null, "lowpass", 520, 0.032);
    windGain = wind.gain;
    CreateLoopingNoise({ x: 8, y: 2, z: -42 }, "bandpass", 1850, 0.014);
    CreateLoopingNoise({ x: 30, y: 1.5, z: 28 }, "highpass", 2600, 0.006);

    const tensionOscillator = RegisterSource(context.createOscillator(), true);
    tensionOscillator.type = "sine";
    tensionOscillator.frequency.value = 42;
    tensionGain = context.createGain();
    tensionGain.gain.value = 0.0001;
    tensionOscillator.connect(tensionGain).connect(ambienceGain);
    tensionOscillator.start();
  }

  async function Enable() {
    if (disposed || !CreateContext()) return false;
    if (context.state === "suspended") {
      try {
        await context.resume();
      } catch {
        return false;
      }
    }
    StartAmbience();
    RemoveUnlockListeners();
    return context.state === "running";
  }

  function AddUnlockListeners() {
    if (!unlockTarget || options.autoUnlock === false) return;
    unlockEvents.forEach((eventName) => unlockTarget.addEventListener(eventName, Enable, { once: true, passive: true }));
  }

  function RemoveUnlockListeners() {
    if (!unlockTarget) return;
    unlockEvents.forEach((eventName) => unlockTarget.removeEventListener(eventName, Enable));
  }

  function ScheduleEnvelope(gainNode, startTime, peak, attack, duration, release) {
    const gain = gainNode.gain;
    gain.cancelScheduledValues(startTime);
    gain.setValueAtTime(0.0001, startTime);
    gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), startTime + attack);
    gain.exponentialRampToValueAtTime(0.0001, startTime + Math.max(attack + 0.01, duration - release));
    gain.setValueAtTime(0.0001, startTime + duration);
  }

  function PlayNoise(bus, configuration) {
    const now = context.currentTime;
    const duration = configuration.duration ?? 0.18;
    const source = RegisterSource(context.createBufferSource());
    source.buffer = CreateNoiseBuffer(Math.max(0.08, duration), configuration.color || "white");
    const filter = context.createBiquadFilter();
    filter.type = configuration.filterType || "bandpass";
    filter.frequency.value = configuration.frequency ?? 700;
    filter.Q.value = configuration.q ?? 0.8;
    const envelope = context.createGain();
    ScheduleEnvelope(envelope, now, configuration.gain ?? 0.1, configuration.attack ?? 0.004, duration, configuration.release ?? duration * 0.65);
    source.connect(filter).connect(envelope).connect(bus.input);
    source.start(now);
    source.stop(now + duration + 0.02);
  }

  function PlayTone(bus, configuration) {
    const now = context.currentTime + (configuration.delay || 0);
    const duration = configuration.duration ?? 0.16;
    const oscillator = RegisterSource(context.createOscillator());
    oscillator.type = configuration.type || "sine";
    oscillator.frequency.setValueAtTime(configuration.frequency ?? 220, now);
    if (configuration.endFrequency) oscillator.frequency.exponentialRampToValueAtTime(configuration.endFrequency, now + duration);
    const envelope = context.createGain();
    ScheduleEnvelope(envelope, now, configuration.gain ?? 0.035, configuration.attack ?? 0.008, duration, configuration.release ?? duration * 0.55);
    oscillator.connect(envelope).connect(bus.input);
    oscillator.start(now);
    oscillator.stop(now + duration + 0.025);
  }

  async function PlayCue(cueId, position, cueOptions = {}) {
    if (!(await Enable())) return false;
    const cueName = String(cueId || "cloth").toLowerCase();
    const bus = CreateSpatialBus(position, Clamp(cueOptions.gain ?? 1, 0, 2));
    if (cueName === "footstep" || cueName === "stepdirt" || cueName === "crouchstep") {
      PlayNoise(bus, {
        duration: cueName === "crouchstep" ? 0.1 : 0.14,
        frequency: cueName === "crouchstep" ? 520 : 390,
        q: 0.68,
        gain: cueName === "crouchstep" ? 0.045 : 0.085,
      });
      PlayTone(bus, { frequency: 78, endFrequency: 54, duration: 0.1, gain: cueName === "crouchstep" ? 0.008 : 0.015 });
    } else if (cueName === "stepstone") {
      PlayNoise(bus, { duration: 0.095, frequency: 1180, q: 1.5, gain: 0.08, release: 0.07 });
    } else if (cueName === "rifle" || cueName === "gunshot") {
      PlayNoise(bus, { duration: 0.24, filterType: "highpass", frequency: 980, q: 0.4, gain: 0.42, attack: 0.001, release: 0.2 });
      PlayTone(bus, { frequency: 92, endFrequency: 39, duration: 0.31, gain: 0.18, attack: 0.001, release: 0.27 });
    } else if (cueName === "detected" || cueName === "danger") {
      PlayTone(bus, { frequency: 108, endFrequency: 76, duration: 0.48, gain: 0.075, attack: 0.018, release: 0.28 });
      PlayTone(bus, { frequency: 162, endFrequency: 128, duration: 0.38, gain: 0.026, delay: 0.065 });
    } else if (cueName === "hurt") {
      PlayTone(bus, { frequency: 66, endFrequency: 38, duration: 0.38, gain: 0.13, attack: 0.004, release: 0.3 });
      PlayNoise(bus, { duration: 0.22, filterType: "lowpass", frequency: 310, gain: 0.1, attack: 0.002, release: 0.18 });
    } else if (cueName === "objective" || cueName === "discover") {
      PlayTone(bus, { frequency: 293.66, duration: 0.36, gain: 0.023, attack: 0.06, release: 0.22 });
      PlayTone(bus, { frequency: 392, duration: 0.42, gain: 0.018, delay: 0.17, attack: 0.06, release: 0.24 });
    } else if (cueName === "heal") {
      PlayNoise(bus, { duration: 0.35, filterType: "bandpass", frequency: 1450, gain: 0.032, attack: 0.04, release: 0.2 });
    } else if (cueName === "dryfire") {
      PlayNoise(bus, { duration: 0.05, filterType: "highpass", frequency: 2100, gain: 0.075, attack: 0.001, release: 0.035 });
    } else if (cueName === "glass") {
      PlayNoise(bus, { duration: 0.16, filterType: "highpass", frequency: 2400, gain: 0.12, attack: 0.001, release: 0.12 });
      PlayTone(bus, { frequency: 1840, endFrequency: 980, duration: 0.13, gain: 0.018, attack: 0.001, release: 0.1 });
      PlayTone(bus, { frequency: 1320, endFrequency: 710, duration: 0.17, gain: 0.014, delay: 0.035, attack: 0.001, release: 0.13 });
    } else {
      PlayNoise(bus, { duration: 0.19, filterType: "bandpass", frequency: 1300, gain: 0.036, attack: 0.012, release: 0.13 });
    }
    return true;
  }

  function SetListener(position, forward = { x: 0, y: 0, z: -1 }, up = { x: 0, y: 1, z: 0 }) {
    if (!context) return;
    const listener = context.listener;
    const point = ReadPosition(position);
    const facing = ReadPosition(forward, { x: 0, y: 0, z: -1 });
    const upward = ReadPosition(up, { x: 0, y: 1, z: 0 });
    const now = context.currentTime;
    if (listener.positionX) {
      listener.positionX.setValueAtTime(point.x, now);
      listener.positionY.setValueAtTime(point.y, now);
      listener.positionZ.setValueAtTime(point.z, now);
      listener.forwardX.setValueAtTime(facing.x, now);
      listener.forwardY.setValueAtTime(facing.y, now);
      listener.forwardZ.setValueAtTime(facing.z, now);
      listener.upX.setValueAtTime(upward.x, now);
      listener.upY.setValueAtTime(upward.y, now);
      listener.upZ.setValueAtTime(upward.z, now);
    } else {
      listener.setPosition?.(point.x, point.y, point.z);
      listener.setOrientation?.(facing.x, facing.y, facing.z, upward.x, upward.y, upward.z);
    }
  }

  function SetIntensity(value) {
    intensity = Clamp(value);
    if (!context || !started) return;
    const now = context.currentTime;
    SetAudioParam(windGain?.gain, 0.025 + intensity * 0.025, now, 0.3);
    SetAudioParam(tensionGain?.gain, 0.0001 + intensity * intensity * 0.018, now, 0.22);
  }

  function SetMuted(value) {
    muted = Boolean(value);
    if (context && masterGain) SetAudioParam(masterGain.gain, muted ? 0 : Clamp(options.volume ?? 0.72), context.currentTime, 0.025);
  }

  function SetVolume(value) {
    options.volume = Clamp(value);
    if (context && masterGain && !muted) SetAudioParam(masterGain.gain, options.volume, context.currentTime, 0.025);
  }

  function Update(delta, state = {}) {
    if (state.intensity != null || state.tension != null || state.alert != null) {
      SetIntensity(state.intensity ?? state.tension ?? state.alert);
    }
    if (state.listenerPosition) SetListener(state.listenerPosition, state.listenerForward, state.listenerUp);
  }

  async function Dispose() {
    if (disposed) return;
    disposed = true;
    RemoveUnlockListeners();
    activeSources.forEach((source) => {
      try { source.stop(); } catch { /* A stopped WebAudio node is harmless. */ }
      source.disconnect?.();
    });
    activeSources.clear();
    loopingSources.clear();
    masterGain?.disconnect?.();
    if (ownsContext && context && context.state !== "closed") {
      try { await context.close(); } catch { /* Browser may already be closing. */ }
    }
  }

  AddUnlockListeners();
  return {
    get context() { return context; },
    get supported() { return Boolean(AudioConstructor || context); },
    get enabled() { return Boolean(context && started && context.state === "running"); },
    Enable,
    PlayCue,
    SetListener,
    SetIntensity,
    SetMuted,
    SetVolume,
    Update,
    Dispose,
  };
}

function CreateNullInterface() {
  const noOperation = () => {};
  return {
    root: null,
    SetObjective: noOperation,
    SetResources: noOperation,
    SetExposure: noOperation,
    SetHealth: noOperation,
    SetPrompt: noOperation,
    SetCompanion: noOperation,
    ShowSubtitle: noOperation,
    ShowChapter: noOperation,
    ShowLetterbox: noOperation,
    Announce: noOperation,
    Update: noOperation,
    Dispose: noOperation,
  };
}

export function CreateGameInterface(options = {}) {
  if (typeof document === "undefined") return CreateNullInterface();
  const container = options.container || document.body;
  const reducedMotion = ResolveReducedMotion(options.reducedMotion);
  const root = document.createElement("div");
  root.className = "ashenRouteHud";
  if (reducedMotion) root.classList.add("reducedMotion");
  root.setAttribute("aria-label", "余烬交通线游戏界面");
  root.innerHTML = `
    <div class="screenGrade" aria-hidden="true"></div>
    <div class="damageVeil" aria-hidden="true"></div>
    <div class="letterbox letterboxTop" aria-hidden="true"></div>
    <div class="letterbox letterboxBottom" aria-hidden="true"></div>

    <section class="missionCard" aria-label="任务目标">
      <div class="missionKicker"><span class="missionPulse" aria-hidden="true"></span><span>当前目标</span></div>
      <h1 class="objectiveTitle">沿干河沟抵达旧磨坊</h1>
      <p class="objectiveDetail">核对磨盘下的三颗石子，不要惊动村口。</p>
      <div class="objectiveProgress" aria-hidden="true"><i></i></div>
    </section>

    <section class="resourceStrip" aria-label="随身物资">
      <span class="resourceItem"><i class="resourceMark resourceCloth" aria-hidden="true"></i><small>布条</small><b dataResource="cloth">2</b></span>
      <span class="resourceItem"><i class="resourceMark resourceMedicine" aria-hidden="true"></i><small>药</small><b dataResource="medicine">1</b></span>
      <span class="resourceItem"><i class="resourceMark resourceAmmo" aria-hidden="true"></i><small>弹</small><b dataResource="ammo">4</b></span>
    </section>

    <section class="awarenessCard" aria-label="暴露风险">
      <div class="awarenessDial" aria-hidden="true"><i></i></div>
      <div><small>暴露</small><strong class="awarenessLabel">隐蔽</strong></div>
    </section>

    <section class="companionCard" aria-label="同伴状态">
      <i class="companionLine" aria-hidden="true"></i>
      <div><small class="companionName">杜湘云</small><strong class="companionState">跟随</strong></div>
    </section>

    <section class="chapterCard" aria-live="polite" aria-atomic="true">
      <small class="chapterKicker">1942年9月下旬 · 黎明前</small>
      <strong class="chapterTitle">天亮以前</strong>
      <i aria-hidden="true"></i>
    </section>

    <section class="subtitleCard" aria-live="polite" aria-atomic="true">
      <span class="subtitleSpeaker"></span>
      <p class="subtitleText"></p>
    </section>

    <div class="interactionPrompt" role="status">
      <kbd class="promptKey">E</kbd><span class="promptText">查看路标</span>
    </div>

    <div class="accessibilityAnnouncer" aria-live="assertive" aria-atomic="true"></div>
  `;
  container.appendChild(root);

  const objectiveTitle = root.querySelector(".objectiveTitle");
  const objectiveDetail = root.querySelector(".objectiveDetail");
  const objectiveProgress = root.querySelector(".objectiveProgress i");
  const awarenessLabel = root.querySelector(".awarenessLabel");
  const companionName = root.querySelector(".companionName");
  const companionState = root.querySelector(".companionState");
  const subtitleCard = root.querySelector(".subtitleCard");
  const subtitleSpeaker = root.querySelector(".subtitleSpeaker");
  const subtitleText = root.querySelector(".subtitleText");
  const chapterCard = root.querySelector(".chapterCard");
  const chapterKicker = root.querySelector(".chapterKicker");
  const chapterTitle = root.querySelector(".chapterTitle");
  const prompt = root.querySelector(".interactionPrompt");
  const promptKey = root.querySelector(".promptKey");
  const promptText = root.querySelector(".promptText");
  const announcer = root.querySelector(".accessibilityAnnouncer");
  let subtitleTimer = 0;
  let chapterTimer = 0;

  function SetObjective(titleOrData, detail, progress) {
    const data = titleOrData && typeof titleOrData === "object"
      ? titleOrData
      : { title: titleOrData, detail, progress };
    if (data.title != null) objectiveTitle.textContent = String(data.title);
    if (data.detail != null) objectiveDetail.textContent = String(data.detail);
    const value = Clamp(data.progress ?? progress ?? 0);
    objectiveProgress.style.transform = `scaleX(${value})`;
    root.querySelector(".missionCard").classList.toggle("hasProgress", value > 0);
    if (data.announce) Announce(`${data.title || "目标更新"}。${data.detail || ""}`);
  }

  function SetResources(resources = {}) {
    root.querySelectorAll("[dataResource]").forEach((element) => {
      const key = element.getAttribute("dataResource");
      if (resources[key] != null) element.textContent = String(Math.max(0, Math.floor(Number(resources[key]) || 0)));
      element.closest(".resourceItem")?.classList.toggle("empty", Number(resources[key]) <= 0);
    });
  }

  function SetExposure(value, label) {
    const exposure = Clamp(value);
    root.style.setProperty("--exposure", String(exposure));
    root.classList.toggle("isDanger", exposure >= 0.72);
    awarenessLabel.textContent = label || (exposure < 0.22 ? "隐蔽" : exposure < 0.55 ? "可疑" : exposure < 0.82 ? "暴露" : "危险");
  }

  function SetHealth(value) {
    const health = Clamp(value);
    root.style.setProperty("--health", String(health));
    root.classList.toggle("isInjured", health < 0.42);
    root.classList.toggle("isCritical", health < 0.2);
  }

  function SetPrompt(text, key = "E", visible = true) {
    promptText.textContent = String(text || "");
    promptKey.textContent = String(key || "");
    prompt.classList.toggle("visible", Boolean(visible && text));
  }

  function SetCompanion(name, status = "跟随", visible = true) {
    companionName.textContent = String(name || "同伴");
    companionState.textContent = String(status || "");
    root.querySelector(".companionCard").classList.toggle("hidden", !visible);
  }

  function ShowSubtitle(speakerOrData, text, duration = 4800) {
    const data = speakerOrData && typeof speakerOrData === "object"
      ? speakerOrData
      : { speaker: speakerOrData, text, duration };
    globalThis.clearTimeout(subtitleTimer);
    subtitleSpeaker.textContent = data.speaker ? `${data.speaker}` : "";
    subtitleText.textContent = String(data.text || "");
    subtitleCard.classList.toggle("visible", Boolean(data.text));
    if (data.text && Number(data.duration ?? duration) > 0) {
      subtitleTimer = globalThis.setTimeout(() => subtitleCard.classList.remove("visible"), Number(data.duration ?? duration));
    }
  }

  function ShowChapter(titleOrData, kicker = "", duration = 4800) {
    const data = titleOrData && typeof titleOrData === "object"
      ? titleOrData
      : { title: titleOrData, kicker, duration };
    globalThis.clearTimeout(chapterTimer);
    chapterTitle.textContent = String(data.title || "");
    chapterKicker.textContent = String(data.kicker || "");
    chapterCard.classList.toggle("visible", Boolean(data.title));
    if (data.title && Number(data.duration ?? duration) > 0) {
      chapterTimer = globalThis.setTimeout(() => chapterCard.classList.remove("visible"), Number(data.duration ?? duration));
    }
  }

  function ShowLetterbox(visible) {
    root.classList.toggle("letterboxed", Boolean(visible));
  }

  function Announce(message) {
    announcer.textContent = "";
    globalThis.setTimeout(() => { announcer.textContent = String(message || ""); }, 12);
  }

  function Update(delta, state = {}) {
    if (state.objective) SetObjective(state.objective);
    if (state.resources) SetResources(state.resources);
    if (state.exposure != null) SetExposure(state.exposure, state.exposureLabel);
    if (state.health != null) SetHealth(state.health);
    if (state.prompt) SetPrompt(state.prompt.text ?? state.prompt, state.prompt.key, state.prompt.visible ?? true);
    if (state.companion) SetCompanion(state.companion.name, state.companion.status, state.companion.visible ?? true);
  }

  function Dispose() {
    globalThis.clearTimeout(subtitleTimer);
    globalThis.clearTimeout(chapterTimer);
    root.remove();
  }

  SetExposure(0);
  SetHealth(1);
  SetPrompt("", "", false);
  return {
    root,
    SetObjective,
    SetResources,
    SetExposure,
    SetHealth,
    SetPrompt,
    SetCompanion,
    ShowSubtitle,
    ShowChapter,
    ShowLetterbox,
    Announce,
    Update,
    Dispose,
  };
}

export function ApplyMaximumRendererPresentation(THREE, renderer) {
  if (!renderer) return null;
  const profile = DesktopRenderingProfile;
  if (THREE.SRGBColorSpace && "outputColorSpace" in renderer) renderer.outputColorSpace = THREE.SRGBColorSpace;
  if (THREE.ACESFilmicToneMapping != null) renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  if (renderer.shadowMap) {
    renderer.shadowMap.enabled = true;
    if (THREE.PCFSoftShadowMap != null) renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.shadowMap.autoUpdate = true;
  }
  renderer.setPixelRatio?.(Math.min(profile.pixelRatio, typeof devicePixelRatio === "number" ? devicePixelRatio : 1));
  renderer.setClearColor?.(0x53616a, 1);
  return renderer;
}

export function ApplyCameraComposition(camera) {
  if (!camera) return;
  camera.position.set(-32.8, 4.25, 75);
  camera.lookAt(-36, 1.35, 60);
  camera.userData.presentationTarget = { x: -36, y: 1.35, z: 60 };
  camera.updateProjectionMatrix?.();
}

/**
 * Complete integration entry point used by the host game. The host may replace
 * scene, camera, or renderer, while keeping all presentation modules intact.
 */
export function CreatePresentation(THREE, options = {}) {
  if (!THREE?.Scene || !THREE?.PerspectiveCamera) throw new Error("CreatePresentation requires a THREE namespace.");
  const profile = DesktopRenderingProfile;
  const reducedMotion = ResolveReducedMotion(options.reducedMotion);
  const container = options.container || (typeof document !== "undefined" ? document.body : null);
  const canvas = options.canvas || null;
  canvas?.classList?.add("ashenRouteCanvas");
  container?.classList?.add?.("ashenRouteViewport");
  container?.classList?.toggle?.("reducedMotion", reducedMotion);
  const ownsScene = !options.scene;
  const ownsCamera = !options.camera;
  const ownsRenderer = !options.renderer && Boolean(canvas);
  const scene = options.scene || new THREE.Scene();
  const initialWidth = Math.max(1, options.width || container?.clientWidth || canvas?.clientWidth || (typeof window !== "undefined" ? window.innerWidth : 1280));
  const initialHeight = Math.max(1, options.height || container?.clientHeight || canvas?.clientHeight || (typeof window !== "undefined" ? window.innerHeight : 720));
  const camera = options.camera || new THREE.PerspectiveCamera(48, initialWidth / initialHeight, 0.08, 280);
  if (ownsCamera) ApplyCameraComposition(camera);

  let renderer = options.renderer || null;
  if (!renderer && canvas && THREE.WebGLRenderer) {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
      stencil: false,
      depth: true,
    });
  }
  ApplyMaximumRendererPresentation(THREE, renderer);

  const root = new THREE.Group();
  root.name = "Scene_AshenRoutePresentationRoot";
  const environment = CreateVillageEnvironment(THREE, { reducedMotion });
  const characters = CreateCharacterRoster(THREE, {
    reducedMotion,
    enemyCount: options.enemyCount ?? 3,
    loadFriendlyModels: options.loadFriendlyModels !== false,
  });
  const effects = CreateAtmosphericEffects(THREE, { reducedMotion });
  root.add(environment.root, characters.root, effects.root);
  scene.add(root);
  environment.ApplyToScene(scene);
  const audio = CreateAudioDirector({
    context: options.audioContext,
    unlockTarget: options.unlockTarget || container,
    autoUnlock: options.autoUnlockAudio,
    volume: options.volume,
    muted: options.muted,
  });
  const ui = options.createInterface === false
    ? CreateNullInterface()
    : CreateGameInterface({ container, reducedMotion });
  const raycaster = new THREE.Raycaster();
  const clockState = { elapsed: 0 };
  let disposed = false;
  let activeReducedMotion = reducedMotion;

  function Resize(width, height, pixelRatio) {
    const resolvedWidth = Math.max(1, Math.floor(width || container?.clientWidth || canvas?.clientWidth || (typeof window !== "undefined" ? window.innerWidth : initialWidth)));
    const resolvedHeight = Math.max(1, Math.floor(height || container?.clientHeight || canvas?.clientHeight || (typeof window !== "undefined" ? window.innerHeight : initialHeight)));
    camera.aspect = resolvedWidth / resolvedHeight;
    camera.updateProjectionMatrix?.();
    if (renderer) {
      const ratio = Math.min(profile.pixelRatio, Number(pixelRatio) || (typeof devicePixelRatio === "number" ? devicePixelRatio : 1));
      renderer.setPixelRatio?.(ratio);
      renderer.setSize?.(resolvedWidth, resolvedHeight, false);
    }
    return { width: resolvedWidth, height: resolvedHeight };
  }

  function Render(renderScene = scene, renderCamera = camera) {
    renderer?.render?.(renderScene, renderCamera);
  }

  function SetReducedMotion(value) {
    activeReducedMotion = Boolean(value);
    characters.SetReducedMotion(activeReducedMotion);
    effects.SetReducedMotion(activeReducedMotion);
    ui.root?.classList?.toggle("reducedMotion", activeReducedMotion);
  }

  function Update(delta, state = {}) {
    if (disposed) return;
    const safeDelta = Math.min(0.05, Math.max(0, Number(delta) || 0));
    clockState.elapsed += safeDelta;
    if (container?.classList) {
      const requestedReducedMotion = container.classList.contains("reducedMotion");
      if (requestedReducedMotion !== activeReducedMotion) SetReducedMotion(requestedReducedMotion);
    }
    environment.Update(safeDelta, state.environment || state.world || state);
    characters.Update(safeDelta, state.characters || {
      player: state.player,
      companion: state.companion,
      enemies: state.enemies,
    });
    effects.Update(safeDelta, state.effects || state);
    if (audio.enabled && camera.getWorldDirection) {
      const direction = camera.getWorldDirection(new THREE.Vector3());
      audio.SetListener(camera.position, direction, camera.up);
    }
    audio.Update(safeDelta, state.audio || { intensity: state.tension ?? state.alert });
    ui.Update(safeDelta, state.ui || state.hud || {});
    if (options.autoRender !== false && state.skipRender !== true) Render();
  }

  async function Dispose() {
    if (disposed) return;
    disposed = true;
    if (typeof window !== "undefined") window.removeEventListener("resize", HandleResize);
    ui.Dispose();
    await audio.Dispose();
    effects.Dispose();
    characters.Dispose();
    environment.Dispose();
    root.removeFromParent();
    if (ownsRenderer) {
      renderer?.renderLists?.dispose?.();
      renderer?.dispose?.();
    }
    if (ownsScene) {
      scene.background?.dispose?.();
      scene.environment?.dispose?.();
    }
  }

  function HandleResize() {
    Resize();
  }

  Resize(initialWidth, initialHeight);
  if (options.autoResize !== false && typeof window !== "undefined") window.addEventListener("resize", HandleResize, { passive: true });

  return {
    scene,
    camera,
    renderer,
    raycaster,
    root,
    world: environment.root,
    playerRig: characters.player,
    companionRig: characters.companion,
    enemies: characters.enemies,
    environment,
    characters,
    characterModelsReady: characters.modelsReady,
    effects,
    audio,
    ui,
    get reducedMotion() { return activeReducedMotion; },
    clockState,
    SetReducedMotion,
    Update,
    Render,
    Resize,
    Dispose,
  };
}

export default CreatePresentation;
