import * as THREE from "../../taihang/vendor/three/build/three.module.mjs";

export const World3DCacheIdentity = "EnemyRear1941_World3D_20260730_Q";
export const World3DTerrainTextureUrl = new URL(
  "./Texture_TerrainPaperHigh.jpg?v=20260730q",
  import.meta.url,
).href;
export const World3DTerrainAlbedoUrl = new URL(
  "./Texture_TerrainGroundAlbedo.png?v=20260730q",
  import.meta.url,
).href;
export const World3DModelPackUrl = new URL(
  "./Model_EnemyRearMiniatures.glb?v=20260730q",
  import.meta.url,
).href;
export const World3DMiniatureDetailUrl = new URL(
  "./Texture_MiniatureSurfaceDetail.png?v=20260730q",
  import.meta.url,
).href;
export const World3DModelNames = Object.freeze([
  "Model_WorkTeam",
  "Model_Guerrilla",
  "Model_MainForce",
  "Model_Militia",
  "Model_Courier",
  "Model_EnemyPatrol",
  "Model_VillageHouse",
  "Model_EnemyBlockhouse",
  "Model_TrafficStation",
  "Model_RailwayStation",
]);

export const World3DQualityProfile = Object.freeze({
  dprCap: 2,
  shadowMapSize: 4096,
  targetFps: 60,
  paperTextureSize: 2048,
  maximumAnimatedSmokePuffs: 24,
  movementDuration: 0.46,
});

export const World3DVisualProfile = Object.freeze({
  toneMappingExposure: 1.08,
  hemisphereIntensity: 0.92,
  ambientIntensity: 0.14,
  sunIntensity: 2.24,
  fillIntensity: 0.38,
  unitModelScale: 1.05,
  militiaModelScale: 1.0,
  villageHouseScale: 1.16,
  blockhouseScale: 1.22,
  trafficStationScale: 1.16,
  railwayStationScale: 1.16,
  unitLabelWorldHeight: 0.3,
  unitLabelBaseHeight: 1.16,
  unitLabelLaneSpacing: 0.34,
  structureLabelWorldHeight: 0.38,
  structureLabelBaseHeight: 1.25,
  minimumLabelScreenPixels: 16,
  maximumStructureLabelScreenPixels: 22,
  maximumUnitLabelScreenPixels: 20,
  cameraHorizontalCoverage: 1.1,
  cameraVerticalCoverage: 1.08,
  roadWidth: 0.19,
  railBedWidth: 0.3,
  railWidth: 0.026,
  railGaugeOffset: 0.112,
  controlBorderWidth: 0.02,
  terrainColorVariation: 0.038,
  terrainTileThickness: 0.055,
  terrainReliefScale: 2.62,
  terrainTextureWorldScale: 0.34,
  terrainAlbedoOpacity: 0.16,
  weatherMaximumPoints: 128,
});

export const World3DActionEffectProfile = Object.freeze({
  supportedActionIds: Object.freeze(["ambush", "sabotage"]),
  maximumConcurrentEffects: 4,
  ambushDuration: 1.75,
  sabotageDuration: 2.05,
  ambushMuzzleFlashCount: 4,
  ambushSmokeCount: 18,
  sabotageSmokeCount: 20,
});

export const World3DLayerNames = Object.freeze([
  "terrain",
  "fog",
  "units",
  "structures",
  "overlay",
]);

const terrainStyles = Object.freeze({
  mountain: Object.freeze({ color: 0x84877d, height: 0.48, roughness: 0.99 }),
  hill: Object.freeze({ color: 0xad7648, height: 0.265, roughness: 0.99 }),
  forest: Object.freeze({ color: 0x3d6948, height: 0.18, roughness: 0.98 }),
  plain: Object.freeze({ color: 0xbc9258, height: 0.098, roughness: 0.99 }),
  rivervalley: Object.freeze({ color: 0x45827c, height: 0.038, roughness: 0.86 }),
  village: Object.freeze({ color: 0xb77a4e, height: 0.118, roughness: 0.99 }),
});

const controlColors = Object.freeze({
  player: 0xc34c3d,
  base: 0xd15b42,
  network: 0xd68b4c,
  enemy: 0x52645f,
  occupied: 0x384541,
  contested: 0xd2a640,
  neutral: 0x6c705e,
});

const neighborDirections = Object.freeze([
  [1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1],
]);

function Clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function NormalizeTerrain(value) {
  const key = String(value ?? "plain").toLowerCase().replaceAll("_", "");
  if (key === "river" || key === "riverbed" || key === "valley") return "rivervalley";
  if (key === "hills") return "hill";
  return terrainStyles[key] ? key : "plain";
}

function HashNoise(first, second, seed = 0) {
  const value = Math.sin((Number(first) * 127.1) + (Number(second) * 311.7) + seed * 17.13) * 43758.5453;
  return value - Math.floor(value);
}

function FindNearestTerrainSamples(samples, x, z, limit = 4) {
  const nearest = [];
  samples.forEach((sample) => {
    const distanceSquared = ((sample.position.x - x) ** 2) + ((sample.position.z - z) ** 2);
    let insertAt = nearest.length;
    while (insertAt > 0 && nearest[insertAt - 1].distanceSquared > distanceSquared) insertAt -= 1;
    if (insertAt >= limit) return;
    nearest.splice(insertAt, 0, { sample, distanceSquared });
    if (nearest.length > limit) nearest.pop();
  });
  return nearest.map(({ sample, distanceSquared }) => ({ ...sample, distanceSquared }));
}

function ComputeFormationSlots(count, hasStructure = false, seed = 0) {
  const resolvedCount = Math.max(1, Math.floor(Number(count) || 1));
  const baseAngle = seed * Math.PI * 2 + (hasStructure ? Math.PI * 0.16 : 0);
  const primaryRadius = hasStructure ? 0.76 : 0.66;
  if (resolvedCount === 1) {
    return [new THREE.Vector2(
      Math.cos(baseAngle) * primaryRadius,
      Math.sin(baseAngle) * primaryRadius,
    )];
  }
  const slots = [];
  for (let index = 0; index < resolvedCount; index += 1) {
    const ring = Math.floor(index / 6);
    const indexOnRing = index % 6;
    const countOnRing = Math.min(6, resolvedCount - ring * 6);
    const angle = baseAngle + (indexOnRing / countOnRing) * Math.PI * 2 + ring * Math.PI / 6;
    const radius = primaryRadius + ring * 0.34;
    slots.push(new THREE.Vector2(Math.cos(angle) * radius, Math.sin(angle) * radius));
  }
  return slots;
}

function GetLandscapeMacroRelief(x, z, terrain) {
  const broadFold = Math.sin(x * 0.57 + z * 0.31 + 0.8) * 0.5
    + Math.sin(z * 0.94 - x * 0.22 - 1.35) * 0.32
    + Math.sin((x + z) * 1.48 + 0.24) * 0.18;
  if (terrain === "mountain") {
    const ridge = Math.pow(1 - Math.abs(Math.sin(x * 1.06 + z * 0.63 + 0.52)), 1.65);
    return broadFold * 0.068 + ridge * 0.245;
  }
  if (terrain === "hill") {
    const shoulder = Math.pow(1 - Math.abs(Math.sin(x * 0.82 - z * 0.7 - 0.24)), 1.9);
    return broadFold * 0.046 + shoulder * 0.12;
  }
  if (terrain === "forest") return broadFold * 0.028;
  if (terrain === "rivervalley") return broadFold * 0.01 - 0.016;
  return broadFold * 0.018;
}

function GetLandscapeMicroRelief(x, z, terrain) {
  const fineFold = Math.sin(x * 2.7 + z * 1.55) * 0.52
    + Math.sin(z * 3.45 - x * 1.14 + 1.1) * 0.31
    + Math.sin((x - z) * 5.2 - 0.7) * 0.17;
  if (terrain === "mountain" || terrain === "hill") {
    const drainage = Math.pow(
      Math.max(0, 1 - Math.abs(Math.sin(x * 1.54 - z * 2.18 + 0.38)) * 4.2),
      1.4,
    );
    return fineFold * (terrain === "mountain" ? 0.032 : 0.021)
      - drainage * (terrain === "mountain" ? 0.075 : 0.045);
  }
  if (terrain === "rivervalley") {
    const dryChannel = Math.pow(
      Math.max(0, 1 - Math.abs(Math.sin(x * 0.68 + z * 1.32 - 0.55)) * 5.4),
      1.7,
    );
    return fineFold * 0.008 - dryChannel * 0.046;
  }
  return fineFold * (terrain === "forest" ? 0.014 : 0.01);
}

function GetWinterTerrainSnowCoverage(x, z, mountainWeight, visibleWeight) {
  const windBand = Math.sin(
    x * 0.72
      + z * 1.04
      + Math.sin(z * 0.31 - 0.45) * 0.74
      + 0.58,
  ) * 0.5 + 0.5;
  const broadPocket = Math.sin(x * 0.29 - z * 0.41 + 1.72) * 0.5 + 0.5;
  const brokenDrift = Math.sin(x * 1.83 + z * 0.67 - 0.9) * 0.5 + 0.5;
  const leewardCoverage = THREE.MathUtils.smoothstep(windBand, 0.53, 0.86);
  const pocketCoverage = THREE.MathUtils.smoothstep(broadPocket, 0.58, 0.92);
  const brokenCoverage = THREE.MathUtils.smoothstep(brokenDrift, 0.7, 0.96);
  const visibility = THREE.MathUtils.smoothstep(visibleWeight, 0.36, 0.74);
  return Clamp(
    (
      0.045
      + leewardCoverage * 0.29
      + pocketCoverage * 0.13
      + brokenCoverage * 0.075
      + mountainWeight * 0.18
    ) * visibility,
    0,
    0.5,
  );
}

export function GetTerrainHeight(hex) {
  const terrain = NormalizeTerrain(hex?.terrain);
  const style = terrainStyles[terrain];
  const relief = (HashNoise(hex?.q ?? 0, hex?.r ?? 0, 7) - 0.5)
    * (terrain === "mountain" ? 0.13 : terrain === "hill" ? 0.075 : 0.04);
  return Math.max(0.025, style.height + relief);
}

export function GetWorld3DDpr(width, deviceDpr = 1) {
  void width;
  void deviceDpr;
  return World3DQualityProfile.dprCap;
}

export function GetWorld3DWeather(turn) {
  const normalizedTurn = Math.max(1, Math.floor(Number(turn) || 1));
  const monthIndex = 8 + normalizedTurn - 1;
  const month = (monthIndex % 12) + 1;
  const year = 1941 + Math.floor(monthIndex / 12);
  if ([12, 2].includes(month)) {
    return Object.freeze({ year, month, mode: "winter-snow", particleCount: 44 });
  }
  if ([11, 1].includes(month)) {
    return Object.freeze({ year, month, mode: "winter-dry", particleCount: 0 });
  }
  if ([3, 4, 5].includes(month)) {
    return Object.freeze({ year, month, mode: "spring-dust", particleCount: 38 });
  }
  return Object.freeze({ year, month, mode: "clear", particleCount: 0 });
}

export function CreateWorld3DLayerState() {
  return {
    terrain: true,
    fog: true,
    units: true,
    structures: true,
    overlay: true,
  };
}

function GetTargetFrameRate() {
  return World3DQualityProfile.targetFps;
}

function MeasureObjectGroup(group) {
  const metrics = {
    object3D: 0,
    meshes: 0,
    visibleMeshes: 0,
    instancedMeshes: 0,
    instances: 0,
    sprites: 0,
  };
  group?.traverse?.((object) => {
    if (object === group) return;
    metrics.object3D += 1;
    if (object.isMesh) {
      metrics.meshes += 1;
      if (object.visible !== false && object.material?.visible !== false) metrics.visibleMeshes += 1;
    }
    if (object.isInstancedMesh) {
      metrics.instancedMeshes += 1;
      metrics.instances += Number(object.count) || 0;
    }
    if (object.isSprite) metrics.sprites += 1;
  });
  return Object.freeze(metrics);
}

function HexToWorld(q, r) {
  return new THREE.Vector3(
    Math.sqrt(3) * (Number(q) + Number(r) / 2),
    0,
    1.5 * Number(r),
  );
}

function CoordinateKey(q, r) {
  return `${Number(q)},${Number(r)}`;
}

function IsFeature(hex, ...featureIds) {
  const normalized = String(hex?.feature ?? "").toLowerCase();
  return featureIds.some((featureId) => normalized === String(featureId).toLowerCase());
}

function UnitGlyph(type, enemy = false) {
  if (enemy) return "敌";
  return {
    workteam: "工",
    guerrilla: "游",
    mainforce: "八",
    militia: "民",
    courier: "交",
  }[String(type ?? "").toLowerCase()] ?? "队";
}

function LayerSignature(items) {
  return items.join("|");
}

function TerrainSignature(state) {
  const weatherMode = GetWorld3DWeather(state?.turn).mode;
  return `${weatherMode}|${LayerSignature((state?.hexes ?? []).map((hex) =>
    `${hex.id}:${hex.q},${hex.r}:${NormalizeTerrain(hex.terrain)}:${hex.visible === false ? 0 : 1}`
  ))}`;
}

function FogSignature(state) {
  return LayerSignature((state?.hexes ?? []).map((hex) => `${hex.id}:${hex.visible === false ? 0 : 1}`));
}

function StructureSignature(state) {
  return LayerSignature((state?.hexes ?? []).map((hex) => [
    hex.id,
    hex.visible === false ? 0 : 1,
    hex.feature ?? "",
    hex.control ?? "",
    hex.rail ? 1 : 0,
    hex.road ? 1 : 0,
    hex.railDisabledTurns ?? 0,
    hex.institution ?? "",
    hex.improvement ?? "",
    hex.construction?.institutionId ?? "",
    hex.construction?.progress ?? "",
    hex.warning?.turn ?? "",
    hex.warning?.intensity ?? "",
    hex.contact ?? "",
  ].join(":")));
}

function UnitSignature(state) {
  const player = (state?.units ?? []).map((unit) =>
    `p:${unit.id}:${unit.hexId}:${unit.type}:${unit.acted ? 1 : 0}:${unit.strength ?? unit.health ?? ""}`
  );
  const enemy = (state?.enemies ?? []).map((unit) =>
    `e:${unit.id}:${unit.hexId}:${unit.type}:${unit.active === false ? 0 : 1}:${unit.visible === false ? 0 : 1}:${unit.strength ?? ""}`
  );
  return LayerSignature([...player, ...enemy]);
}

function OverlaySignature(state, view) {
  const hexOverlays = (state?.hexes ?? []).map((hex) => [
    hex.id,
    hex.visible === false ? 0 : 1,
    hex.control ?? "",
    hex.contact ?? "",
    hex.institution ?? "",
    hex.improvement ?? "",
    hex.construction?.institutionId ?? "",
    hex.warning?.intensity ?? "",
  ].join(":"));
  return LayerSignature([
    view?.selectedHexId ?? "",
    view?.selectedUnitId ?? "",
    view?.mapLayer ?? "situation",
    ...(view?.reachableHexIds ?? []),
    ...hexOverlays,
  ]);
}

function DisposeObject(object, sharedGeometries = new Set(), sharedMaterials = new Set()) {
  const disposedGeometries = new Set();
  const disposedMaterials = new Set();
  object?.traverse?.((child) => {
    if (child.geometry
      && !sharedGeometries.has(child.geometry)
      && !disposedGeometries.has(child.geometry)) {
      disposedGeometries.add(child.geometry);
      child.geometry.dispose?.();
    }
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    materials.filter(Boolean).forEach((material) => {
      if (sharedMaterials.has(material) || disposedMaterials.has(material)) return;
      disposedMaterials.add(material);
      if (material.userData?.ownsMap) {
        const ownedTextures = new Set([material.map, material.roughnessMap].filter(Boolean));
        ownedTextures.forEach((texture) => texture.dispose?.());
      }
      material.dispose?.();
    });
  });
}

function ClearGroup(group, sharedGeometries, sharedMaterials) {
  while (group.children.length) {
    const child = group.children[group.children.length - 1];
    group.remove(child);
    DisposeObject(child, sharedGeometries, sharedMaterials);
  }
}

function CreateCanvasTexture(label, options = {}) {
  const canvas = document.createElement("canvas");
  const width = options.width ?? 256;
  const height = options.height ?? 80;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, width, height);
  context.fillStyle = options.background ?? "rgba(28, 27, 22, .9)";
  context.strokeStyle = options.border ?? "rgba(226, 207, 158, .9)";
  context.lineWidth = options.lineWidth ?? 4;
  const radius = options.radius ?? 13;
  context.beginPath();
  context.roundRect(3, 3, width - 6, height - 6, radius);
  context.fill();
  context.stroke();
  context.fillStyle = options.color ?? "#f0dfb8";
  context.font = options.font ?? `700 ${Math.round(height * 0.62)}px "Microsoft YaHei", sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(String(label ?? ""), width / 2, height / 2 + 1, width - 18);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

function CreateLabelSprite(label, options = {}) {
  const texture = CreateCanvasTexture(label, options);
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: options.depthTest ?? false,
    depthWrite: false,
    toneMapped: false,
  });
  material.userData.ownsMap = true;
  const sprite = new THREE.Sprite(material);
  const aspect = (options.width ?? 256) / (options.height ?? 80);
  const height = options.worldHeight ?? 0.42;
  sprite.scale.set(height * aspect, height, 1);
  sprite.userData.labelAspect = aspect;
  sprite.userData.labelBaseWorldHeight = height;
  sprite.userData.minimumScreenPixels = options.minimumScreenPixels
    ?? World3DVisualProfile.minimumLabelScreenPixels;
  sprite.userData.maximumScreenPixels = options.maximumScreenPixels ?? 20;
  sprite.renderOrder = options.renderOrder ?? 20;
  return sprite;
}

function ComposeLineMatrix(start, end, width, thickness = 0.035, yOffset = 0.04) {
  const raisedStart = start.clone();
  const raisedEnd = end.clone();
  raisedStart.y += yOffset;
  raisedEnd.y += yOffset;
  const direction = raisedEnd.clone().sub(raisedStart);
  const distance = Math.max(0.001, direction.length());
  const midpoint = raisedStart.clone().add(raisedEnd).multiplyScalar(0.5);
  const rotation = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, 0, 1),
    direction.normalize(),
  );
  return new THREE.Matrix4().compose(
    midpoint,
    rotation,
    new THREE.Vector3(width, thickness, distance),
  );
}

function CreateTaihangRidgeGeometry() {
  const alongSegments = 8;
  const crossProfile = Object.freeze([
    Object.freeze({ ratio: -1, height: 0 }),
    Object.freeze({ ratio: -0.58, height: 0.24 }),
    Object.freeze({ ratio: -0.2, height: 0.72 }),
    Object.freeze({ ratio: 0.12, height: 1 }),
    Object.freeze({ ratio: 0.5, height: 0.38 }),
    Object.freeze({ ratio: 1, height: 0 }),
  ]);
  const positions = [];
  const colors = [];
  const indices = [];
  const footColor = new THREE.Color(0x5f685e);
  const shoulderColor = new THREE.Color(0x8a8c7e);
  for (let alongIndex = 0; alongIndex <= alongSegments; alongIndex += 1) {
    const alongRatio = alongIndex / alongSegments;
    const x = (alongRatio - 0.5) * 1.88;
    const crestPulse = 0.82
      + Math.sin(alongRatio * Math.PI) * 0.2
      + Math.sin(alongRatio * Math.PI * 3.2 + 0.45) * 0.075;
    const crestWander = Math.sin(alongRatio * Math.PI * 2.25 - 0.6) * 0.11;
    crossProfile.forEach((profile, crossIndex) => {
      const z = profile.ratio * 0.57
        + crestWander * (1 - Math.abs(profile.ratio))
        + Math.sin(alongIndex * 1.7 + crossIndex * 0.9) * 0.018;
      const fracture = 0.96
        + Math.sin(alongIndex * 2.3 + crossIndex * 1.17) * 0.055;
      const y = Math.max(0, profile.height * crestPulse * fracture * 0.66);
      positions.push(x, y, z);
      const color = footColor.clone().lerp(shoulderColor, Clamp(profile.height * 0.9, 0, 0.9));
      color.offsetHSL(
        -0.006,
        -0.025,
        (alongIndex % 2 ? -0.018 : 0.016) + (crossIndex % 2 ? 0.008 : -0.006),
      );
      colors.push(color.r, color.g, color.b);
    });
  }
  const rowLength = crossProfile.length;
  for (let alongIndex = 0; alongIndex < alongSegments; alongIndex += 1) {
    for (let crossIndex = 0; crossIndex < rowLength - 1; crossIndex += 1) {
      const topLeft = alongIndex * rowLength + crossIndex;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + rowLength;
      const bottomRight = bottomLeft + 1;
      indices.push(
        topLeft, topRight, bottomLeft,
        topRight, bottomRight, bottomLeft,
      );
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

function CreateIrregularFieldGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.47, -0.18);
  shape.lineTo(-0.16, -0.23);
  shape.lineTo(0.19, -0.2);
  shape.lineTo(0.47, -0.12);
  shape.lineTo(0.43, 0.13);
  shape.lineTo(0.14, 0.21);
  shape.lineTo(-0.23, 0.19);
  shape.lineTo(-0.49, 0.1);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape, 2);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function CreateWindblownSnowStripGeometry() {
  const shape = new THREE.Shape();
  shape.moveTo(-0.5, -0.12);
  shape.lineTo(-0.34, -0.19);
  shape.lineTo(-0.03, -0.16);
  shape.lineTo(0.24, -0.13);
  shape.lineTo(0.5, -0.04);
  shape.lineTo(0.42, 0.11);
  shape.lineTo(0.1, 0.16);
  shape.lineTo(-0.2, 0.13);
  shape.lineTo(-0.47, 0.07);
  shape.closePath();
  const geometry = new THREE.ShapeGeometry(shape, 3);
  geometry.rotateX(-Math.PI / 2);
  return geometry;
}

function CreateCurvedGroundStripGeometry(length = 0.88, width = 0.016, bend = 0.055) {
  const segmentCount = 8;
  const positions = [];
  const indices = [];
  for (let index = 0; index <= segmentCount; index += 1) {
    const ratio = index / segmentCount;
    const x = (ratio - 0.5) * length;
    const z = Math.sin((ratio - 0.5) * Math.PI) * bend
      + Math.sin(ratio * Math.PI * 2.4) * bend * 0.12;
    positions.push(x, 0, z - width / 2, x, 0, z + width / 2);
  }
  for (let index = 0; index < segmentCount; index += 1) {
    const current = index * 2;
    const next = current + 2;
    indices.push(current, next, current + 1, current + 1, next, next + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function AddBox(group, size, material, position, rotationY = 0) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
  mesh.position.copy(position);
  mesh.rotation.y = rotationY;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function AddCylinder(group, radiusTop, radiusBottom, height, segments, material, position) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    material,
  );
  mesh.position.copy(position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);
  return mesh;
}

function CreateHouse(materials, scale = 1, modelFactory = null) {
  const importedHouse = modelFactory?.("Model_VillageHouse");
  if (importedHouse) {
    importedHouse.scale.setScalar(World3DVisualProfile.villageHouseScale * scale);
    importedHouse.userData.importedModel = "Model_VillageHouse";
    return importedHouse;
  }
  const group = new THREE.Group();
  AddBox(group, new THREE.Vector3(0.5 * scale, 0.29 * scale, 0.42 * scale), materials.wall, new THREE.Vector3(0, 0.16 * scale, 0));
  const roof = new THREE.Mesh(new THREE.ConeGeometry(0.4 * scale, 0.22 * scale, 4), materials.roof);
  roof.position.y = 0.41 * scale;
  roof.rotation.y = Math.PI / 4;
  roof.castShadow = true;
  group.add(roof);
  const door = AddBox(group, new THREE.Vector3(0.1 * scale, 0.17 * scale, 0.02), materials.wood, new THREE.Vector3(0.11 * scale, 0.11 * scale, -0.22 * scale));
  door.castShadow = false;
  return group;
}

function CreateFlag(materials, color, tall = false) {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.017, tall ? 1.12 : 0.82, 6), materials.wood);
  pole.position.y = tall ? 0.56 : 0.41;
  pole.castShadow = true;
  group.add(pole);
  const flagMaterial = new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.92 });
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(tall ? 0.48 : 0.34, tall ? 0.25 : 0.19, 3, 1), flagMaterial);
  cloth.position.set(tall ? 0.25 : 0.18, tall ? 0.88 : 0.64, 0);
  cloth.userData.signal = true;
  group.add(cloth);
  group.userData.signal = true;
  return group;
}

function CreateStructureModel(hex, materials, modelFactory = null) {
  const group = new THREE.Group();
  const enemy = ["enemy", "occupied"].includes(String(hex.control ?? "").toLowerCase())
    || IsFeature(hex, "CountySeat", "Stronghold", "RailStation");
  if (IsFeature(hex, "CountySeat")) {
    AddBox(group, new THREE.Vector3(1.18, 0.22, 0.12), materials.enemyStone, new THREE.Vector3(0, 0.13, 0.43));
    AddBox(group, new THREE.Vector3(1.18, 0.22, 0.12), materials.enemyStone, new THREE.Vector3(0, 0.13, -0.43));
    AddBox(group, new THREE.Vector3(0.12, 0.22, 0.76), materials.enemyStone, new THREE.Vector3(-0.53, 0.13, 0));
    AddBox(group, new THREE.Vector3(0.12, 0.22, 0.76), materials.enemyStone, new THREE.Vector3(0.53, 0.13, 0));
    AddBox(group, new THREE.Vector3(0.34, 0.5, 0.24), materials.enemyWall, new THREE.Vector3(0, 0.26, -0.41));
    const gateRoof = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.13, 4), materials.roof);
    gateRoof.position.set(0, 0.56, -0.41);
    gateRoof.rotation.y = Math.PI / 4;
    gateRoof.scale.set(1.18, 1, 0.82);
    gateRoof.castShadow = true;
    group.add(gateRoof);
    [
      [-0.27, 0.08, 0.64],
      [0.24, 0.17, 0.58],
      [0.1, -0.12, 0.48],
    ].forEach(([x, z, scale]) => {
      const house = CreateHouse({ ...materials, wall: materials.enemyWall }, scale, modelFactory);
      house.position.set(x, 0.08, z);
      group.add(house);
    });
  } else if (IsFeature(hex, "Stronghold")) {
    const blockhouse = modelFactory?.("Model_EnemyBlockhouse");
    if (blockhouse) {
      blockhouse.scale.setScalar(World3DVisualProfile.blockhouseScale);
      blockhouse.userData.importedModel = "Model_EnemyBlockhouse";
      group.add(blockhouse);
    } else {
      AddBox(group, new THREE.Vector3(0.56, 0.68, 0.5), materials.enemyWall, new THREE.Vector3(0, 0.35, 0));
      AddBox(group, new THREE.Vector3(0.66, 0.12, 0.6), materials.enemyDark, new THREE.Vector3(0, 0.73, 0));
      [-0.19, 0.19].forEach((x) => {
        AddBox(group, new THREE.Vector3(0.13, 0.045, 0.025), materials.enemyDark, new THREE.Vector3(x, 0.49, -0.255));
      });
      AddBox(group, new THREE.Vector3(1.12, 0.12, 0.09), materials.enemyStone, new THREE.Vector3(0, 0.07, 0.48));
    }
  } else if (IsFeature(hex, "RailStation")) {
    const railwayStation = modelFactory?.("Model_RailwayStation");
    if (railwayStation) {
      railwayStation.scale.setScalar(World3DVisualProfile.railwayStationScale);
      railwayStation.position.z = 0.62;
      railwayStation.userData.importedModel = "Model_RailwayStation";
      group.add(railwayStation);
    } else {
      AddBox(group, new THREE.Vector3(0.92, 0.12, 0.46), materials.stone, new THREE.Vector3(0, 0.07, 0));
      const house = CreateHouse({ ...materials, wall: materials.enemyWall }, 0.8);
      house.position.set(-0.12, 0.1, 0);
      group.add(house);
      const signal = AddBox(group, new THREE.Vector3(0.04, 0.58, 0.04), materials.iron, new THREE.Vector3(0.38, 0.33, 0.11));
      signal.userData.signal = true;
    }
  } else if (IsFeature(hex, "Headquarters")) {
    const offsets = [[-0.23, -0.14, 0.72], [0.22, -0.06, 0.82], [0, 0.25, 0.62]];
    offsets.forEach(([x, z, scale]) => {
      const house = CreateHouse(materials, scale, modelFactory);
      house.position.set(x, 0, z);
      group.add(house);
    });
  } else if (IsFeature(hex, "Village")) {
    const offsets = [[-0.18, -0.05, 0.62], [0.2, 0.12, 0.54], [0.02, -0.28, 0.48]];
    offsets.forEach(([x, z, scale]) => {
      const house = CreateHouse(materials, scale, modelFactory);
      house.position.set(x, 0, z);
      group.add(house);
    });
  }

  if (hex.institution) {
    const institution = new THREE.Group();
    if (hex.institution === "Station") {
      const trafficStation = modelFactory?.("Model_TrafficStation");
      if (trafficStation) {
        trafficStation.scale.setScalar(World3DVisualProfile.trafficStationScale * 0.82);
        trafficStation.userData.importedModel = "Model_TrafficStation";
        institution.add(trafficStation);
        institution.position.set(-0.38, 0, 0.29);
        group.add(institution);
      }
    } else {
    const institutionColor = {
      PartyBranch: 0xa8322c,
      Cooperative: 0xb88a3e,
      Clinic: 0xd9d2b7,
      Arsenal: 0x4e5950,
      Tunnels: 0x635441,
    }[hex.institution] ?? 0x8c7753;
    const base = AddBox(institution, new THREE.Vector3(0.32, 0.2, 0.28), materials.wall, new THREE.Vector3(0, 0.1, 0));
    base.material = base.material.clone();
    base.material.color.setHex(institutionColor);
    const mast = AddCylinder(institution, 0.018, 0.022, 0.47, 6, materials.iron, new THREE.Vector3(0, 0.39, 0));
    institution.position.set(-0.4, 0, 0.34);
    group.add(institution);
    }
  }

  if (hex.construction) {
    const scaffold = new THREE.Group();
    const wood = materials.wood;
    [-0.2, 0.2].forEach((x) => [-0.17, 0.17].forEach((z) => {
      AddBox(scaffold, new THREE.Vector3(0.025, 0.42, 0.025), wood, new THREE.Vector3(x, 0.21, z));
    }));
    AddBox(scaffold, new THREE.Vector3(0.48, 0.025, 0.025), wood, new THREE.Vector3(0, 0.37, -0.17));
    scaffold.position.set(0.36, 0, 0.27);
    group.add(scaffold);
  }
  return group;
}

function GetUnitModelName(unit, enemy) {
  if (enemy) return "Model_EnemyPatrol";
  return {
    workteam: "Model_WorkTeam",
    guerrilla: "Model_Guerrilla",
    mainforce: "Model_MainForce",
    militia: "Model_Militia",
    courier: "Model_Courier",
  }[String(unit?.type ?? "").toLowerCase()] ?? null;
}

function CreateUnitMiniature(
  unit,
  enemy,
  materials,
  modelFactory = null,
  selected = false,
  markerLabel = null,
) {
  const group = new THREE.Group();
  const bodyMaterial = enemy ? materials.enemyUniform : materials.playerUniform;
  const edgeMaterial = enemy ? materials.enemyDark : materials.paperLight;
  const modelName = GetUnitModelName(unit, enemy);
  const importedMiniature = modelName ? modelFactory?.(modelName) : null;
  if (importedMiniature) {
    const importedScale = String(unit?.type ?? "").toLowerCase() === "militia"
      ? World3DVisualProfile.militiaModelScale
      : World3DVisualProfile.unitModelScale;
    importedMiniature.scale.setScalar(importedScale);
    importedMiniature.traverse((object) => {
      if (!object.isMesh) return;
      const TintMaterial = (sourceMaterial) => {
        const material = sourceMaterial.clone();
        material.color?.multiplyScalar(1.04);
        material.emissive?.setHex(0x000000);
        material.emissiveIntensity = 0;
        material.roughness = Math.max(0.82, Number(material.roughness) || 0.92);
        material.metalness = Math.min(0.12, Number(material.metalness) || 0);
        material.needsUpdate = true;
        return material;
      };
      object.material = Array.isArray(object.material)
        ? object.material.map(TintMaterial)
        : TintMaterial(object.material);
    });
    importedMiniature.userData.importedModel = modelName;
    group.add(importedMiniature);
  } else {
    const positions = unit.type === "Courier" || String(unit.type).toLowerCase() === "courier"
      ? [[0, 0]]
      : [[-0.11, 0.03], [0.1, 0.04], [0, -0.12]];
    positions.forEach(([x, z], index) => {
      const person = new THREE.Group();
      AddCylinder(person, 0.065, 0.085, 0.25, 7, bodyMaterial, new THREE.Vector3(0, 0.19, 0));
      AddCylinder(person, 0.07, 0.07, 0.12, 8, edgeMaterial, new THREE.Vector3(0, 0.39, 0));
      if (enemy) {
        const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.083, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2), materials.enemyHelmet);
        helmet.position.y = 0.45;
        person.add(helmet);
      } else if (index === 0) {
        const cap = AddCylinder(person, 0.082, 0.082, 0.025, 8, materials.playerCap, new THREE.Vector3(0, 0.46, 0));
        cap.castShadow = false;
      }
      person.position.set(x, 0, z);
      person.userData.idlePhase = HashNoise(index, unit.id?.length ?? 1, 3) * Math.PI * 2;
      group.add(person);
    });
  }
  const resolvedMarkerLabel = markerLabel === false
    ? null
    : markerLabel ?? (enemy || selected ? UnitGlyph(unit.type, enemy) : null);
  if (resolvedMarkerLabel) {
    const wideMarker = String(resolvedMarkerLabel).length > 1;
    const glyph = CreateLabelSprite(resolvedMarkerLabel, {
      width: wideMarker ? 156 : 104,
      height: 104,
      background: enemy ? "rgba(28,30,27,.95)" : "rgba(126,40,34,.96)",
      border: enemy ? "rgba(201,167,119,.9)" : "rgba(245,216,143,.95)",
      color: "#f4e5bd",
      worldHeight: World3DVisualProfile.unitLabelWorldHeight,
      maximumScreenPixels: World3DVisualProfile.maximumUnitLabelScreenPixels,
      radius: wideMarker ? 28 : 52,
    });
    glyph.position.y = World3DVisualProfile.unitLabelBaseHeight;
    glyph.userData.mapLabel = true;
    group.add(glyph);
  }
  group.userData.unitBody = true;
  return group;
}

const worldDiagnosticsRouter = Object.seal({ current: null });

class EnemyRearWorld3D {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.onSelectHex = options.onSelectHex ?? (() => {});
    this.state = null;
    this.view = null;
    this.dirty = CreateWorld3DLayerState();
    this.signatures = { terrain: "", fog: "", units: "", structures: "", overlay: "" };
    this.frameCount = 0;
    this.animationFrameCount = 0;
    this.lastFrameAt = performance.now();
    this.lastRenderAt = 0;
    this.nextRenderAt = 0;
    this.fpsSampleStartedAt = this.lastFrameAt;
    this.fpsSampleFrames = 0;
    this.framesPerSecond = 0;
    this.lastFrameDurationMs = 0;
    this.renderRequested = true;
    this.ambientAnimationDeadline = performance.now() + 4800;
    this.resizePending = true;
    this.pauseReason = "initializing";
    this.reducedMotion = false;
    this.disposed = false;
    this.objectCounts = {
      terrain: MeasureObjectGroup(),
      fog: MeasureObjectGroup(),
      units: MeasureObjectGroup(),
      structures: MeasureObjectGroup(),
      overlay: MeasureObjectGroup(),
      effects: MeasureObjectGroup(),
      actionEffects: MeasureObjectGroup(),
      weather: MeasureObjectGroup(),
    };
    this.hexById = new Map();
    this.hexByCoordinate = new Map();
    this.hexPositions = new Map();
    this.terrainHeights = new Map();
    this.terrainAlbedoTexture = null;
    this.terrainAlbedoMaterials = new Set();
    this.terrainAlbedoStatus = "loading";
    this.seasonalTerrainMaterials = Object.create(null);
    this.unitVisuals = new Map();
    this.unitPedestalBatches = [];
    this.smokePuffs = [];
    this.sabotageObjects = [];
    this.signalObjects = [];
    this.warningObjects = [];
    this.labelLeaders = [];
    this.weatherMode = "pending";
    this.weatherSignature = "";
    this.weatherParticles = null;
    this.activeActionEffects = [];
    this.actionEffectSequence = 0;
    this.animationDummy = new THREE.Object3D();
    this.pickInstanceIds = [];
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.sharedGeometries = new Set();
    this.sharedMaterials = new Set();
    this.modelPrototypes = new Map();
    this.modelPackStatus = "loading";
    this.modelPackScene = null;
    this.modelPackMeshCount = 0;
    this.miniatureDetailTexture = null;
    this.miniatureDetailStatus = "loading";
    this.CreateModelInstance = this.CloneModelAsset.bind(this);
    this.InitializeRenderer();
    this.InitializeScene();
    this.InitializeDiagnostics();
    this.InitializeResizeMonitoring();
    this.HandleVisibilityChange = () => {
      this.renderRequested = true;
      this.lastFrameAt = performance.now();
      this.nextRenderAt = 0;
      this.pauseReason = document.hidden ? "hidden" : "resuming";
      this.PublishDiagnostics();
    };
    document.addEventListener("visibilitychange", this.HandleVisibilityChange);
    this.Animate = this.Animate.bind(this);
    this.animationHandle = requestAnimationFrame(this.Animate);
  }

  InitializeRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
      powerPreference: "high-performance",
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = World3DVisualProfile.toneMappingExposure;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.setClearColor(0x56635d, 1);
  }

  InitializeScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x3f514a);
    this.scene.fog = new THREE.Fog(0x526159, 30, 76);
    this.camera = new THREE.OrthographicCamera(-8, 8, 5, -5, 0.1, 120);
    this.camera.position.set(9.5, 13.5, 12.5);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(0, 0, 0);

    this.terrainGroup = new THREE.Group();
    this.fogGroup = new THREE.Group();
    this.structureGroup = new THREE.Group();
    this.unitGroup = new THREE.Group();
    this.overlayGroup = new THREE.Group();
    this.effectGroup = new THREE.Group();
    this.actionEffectGroup = new THREE.Group();
    this.weatherGroup = new THREE.Group();
    this.labelLeaderGroup = new THREE.Group();
    this.labelLeaderGroup.name = "MapLabelLeaderLines";
    this.actionEffectGroup.name = "TransientActionEffects";
    this.scene.add(
      this.terrainGroup,
      this.structureGroup,
      this.unitGroup,
      this.fogGroup,
      this.overlayGroup,
      this.effectGroup,
      this.actionEffectGroup,
      this.weatherGroup,
      this.labelLeaderGroup,
    );

    const hemisphere = new THREE.HemisphereLight(0xe4eee6, 0x40372b, World3DVisualProfile.hemisphereIntensity);
    const ambient = new THREE.AmbientLight(0x9dad9f, World3DVisualProfile.ambientIntensity);
    const sun = new THREE.DirectionalLight(0xffd8a6, World3DVisualProfile.sunIntensity);
    sun.position.set(-16, 24, -13);
    sun.castShadow = true;
    sun.shadow.mapSize.set(World3DQualityProfile.shadowMapSize, World3DQualityProfile.shadowMapSize);
    sun.shadow.camera.left = -18;
    sun.shadow.camera.right = 18;
    sun.shadow.camera.top = 18;
    sun.shadow.camera.bottom = -18;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 55;
    sun.shadow.bias = -0.00035;
    sun.shadow.normalBias = 0.014;
    sun.shadow.radius = 1.35;
    const fill = new THREE.DirectionalLight(0x8faeb2, World3DVisualProfile.fillIntensity);
    fill.position.set(13, 9, 17);
    fill.castShadow = false;
    this.sunLight = sun;
    this.scene.add(hemisphere, ambient, sun, fill);

    this.CreateSharedResources();
    const paper = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshStandardMaterial({ color: 0x6a6655, roughness: 0.94, metalness: 0 }),
    );
    paper.rotation.x = -Math.PI / 2;
    paper.position.y = -0.035;
    paper.receiveShadow = true;
    paper.name = "PaperMapGround";
    paper.material.userData.ownsMap = true;
    this.paperGround = paper;
    this.scene.add(paper);
    this.LoadPaperGroundTexture(paper.material);
    this.LoadTerrainAlbedoTexture();
    this.LoadMiniatureDetailTexture();
    this.LoadMiniatureModelPack();
  }

  LoadPaperGroundTexture(material) {
    const loader = new THREE.TextureLoader();
    this.paperTextureStatus = "loading";
    loader.load(
      World3DTerrainTextureUrl,
      (loadedTexture) => {
        if (this.disposed) {
          loadedTexture.dispose();
          return;
        }
        const texture = loadedTexture;
        const sourceWidth = Number(loadedTexture.image?.naturalWidth ?? loadedTexture.image?.width) || 0;
        const sourceHeight = Number(loadedTexture.image?.naturalHeight ?? loadedTexture.image?.height) || 0;
        texture.colorSpace = THREE.NoColorSpace;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        material.map = null;
        material.roughnessMap = texture;
        material.color.setHex(this.weatherMode === "winter-snow" ? 0x858d83 : 0x716b58);
        material.needsUpdate = true;
        this.paperTextureStatus = "ready";
        this.paperTextureSize = `${Number(texture.image?.width) || sourceWidth}x${Number(texture.image?.height) || sourceHeight}`;
        this.renderRequested = true;
        this.PublishDiagnostics();
      },
      undefined,
      () => {
        this.paperTextureStatus = "fallback-color";
      },
    );
  }

  LoadTerrainAlbedoTexture() {
    const loader = new THREE.TextureLoader();
    loader.load(
      World3DTerrainAlbedoUrl,
      (texture) => {
        if (this.disposed) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.MirroredRepeatWrapping;
        texture.wrapT = THREE.MirroredRepeatWrapping;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        this.terrainAlbedoTexture = texture;
        this.terrainAlbedoStatus = "ready";
        this.terrainAlbedoMaterials.forEach((material) => {
          material.map = texture;
          material.bumpMap = texture;
          material.bumpScale = 0.03;
          material.opacity = this.weatherMode === "winter-snow"
            ? World3DVisualProfile.terrainAlbedoOpacity * 0.68
            : World3DVisualProfile.terrainAlbedoOpacity;
          material.needsUpdate = true;
        });
        this.renderRequested = true;
        this.PublishDiagnostics();
      },
      undefined,
      () => {
        this.terrainAlbedoStatus = "fallback-vertex-color";
        this.PublishDiagnostics();
      },
    );
  }

  UpdateWeather() {
    const weather = GetWorld3DWeather(this.state?.turn);
    const signature = `${weather.year}-${weather.month}-${weather.mode}`;
    if (signature === this.weatherSignature) return;
    this.weatherSignature = signature;
    this.weatherMode = weather.mode;
    ClearGroup(this.weatherGroup, this.sharedGeometries, this.sharedMaterials);
    this.weatherParticles = null;

    if (weather.mode === "winter-snow") {
      this.scene.fog.color.setHex(0x82908a);
      this.scene.fog.near = 28;
      this.scene.fog.far = 66;
      this.scene.background.setHex(0x66746f);
      this.renderer.setClearColor(0x66746f, 1);
      this.paperGround?.material.color.setHex(0x7a8379);
      this.sunLight.color.setHex(0xffeee0);
      this.sunLight.intensity = 2.12;
    } else if (weather.mode === "winter-dry") {
      this.scene.fog.color.setHex(0x606b63);
      this.scene.fog.near = 30;
      this.scene.fog.far = 70;
      this.scene.background.setHex(0x4a574f);
      this.renderer.setClearColor(0x4a574f, 1);
      this.paperGround?.material.color.setHex(0x68695a);
      this.sunLight.color.setHex(0xffe7d1);
      this.sunLight.intensity = 2.2;
    } else if (weather.mode === "spring-dust") {
      this.scene.fog.color.setHex(0x756f5c);
      this.scene.fog.near = 28;
      this.scene.fog.far = 67;
      this.scene.background.setHex(0x5e5949);
      this.renderer.setClearColor(0x5e5949, 1);
      this.paperGround?.material.color.setHex(0x746b54);
      this.sunLight.color.setHex(0xffdfc1);
      this.sunLight.intensity = 2.18;
    } else {
      const summer = weather.month >= 6 && weather.month <= 8;
      this.scene.fog.color.setHex(summer ? 0x516c61 : 0x58665d);
      this.scene.fog.near = summer ? 32 : 31;
      this.scene.fog.far = summer ? 76 : 73;
      this.scene.background.setHex(summer ? 0x3e5d51 : 0x43534b);
      this.renderer.setClearColor(summer ? 0x3e5d51 : 0x43534b, 1);
      this.paperGround?.material.color.setHex(summer ? 0x687760 : 0x706852);
      this.sunLight.color.setHex(summer ? 0xffeed9 : 0xffe7cf);
      this.sunLight.intensity = summer ? 2.3 : World3DVisualProfile.sunIntensity;
    }

    if (weather.mode === "winter-snow") {
      const visibleHexes = (this.state?.hexes ?? []).filter((hex) => hex.visible !== false);

      const capTransforms = [];
      this.structureGroup.children
        .filter((object) => object.userData?.hexId && !object.isSprite && !object.userData?.labelKind)
        .forEach((structure) => {
          const box = new THREE.Box3().setFromObject(structure);
          if (box.isEmpty()) return;
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const hex = this.hexById.get(structure.userData.hexId);
          const capCount = IsFeature(hex, "Village", "Headquarters") ? 2 : 1;
          const stripRotation = structure.rotation.y + (size.z > size.x ? Math.PI / 2 : 0);
          const crossX = -Math.sin(stripRotation);
          const crossZ = Math.cos(stripRotation);
          for (let capIndex = 0; capIndex < capCount; capIndex += 1) {
            const stripOffset = (capIndex - (capCount - 1) / 2)
              * Math.min(size.x, size.z) * 0.2;
            capTransforms.push({
              position: new THREE.Vector3(
                center.x + crossX * stripOffset,
                box.max.y + 0.008 + capIndex * 0.002,
                center.z + crossZ * stripOffset,
              ),
              rotation: stripRotation
                + (HashNoise(hex?.r ?? 0, capIndex, 129) - 0.5) * 0.16,
              scaleX: Clamp(Math.max(size.x, size.z) * (capCount > 1 ? 0.34 : 0.42), 0.24, 0.68),
              scaleZ: Clamp(Math.min(size.x, size.z) * (capCount > 1 ? 0.22 : 0.27), 0.11, 0.25),
            });
          }
        });
      visibleHexes
        .filter((hex) => NormalizeTerrain(hex.terrain) === "mountain")
        .forEach((hex) => {
          const base = this.hexPositions.get(hex.id) ?? HexToWorld(hex.q, hex.r);
          capTransforms.push({
            position: new THREE.Vector3(
              base.x - 0.08,
              (this.terrainHeights.get(hex.id) ?? GetTerrainHeight(hex)) + 0.43,
              base.z + 0.02,
            ),
            rotation: Math.PI * 0.335,
            scaleX: 0.52,
            scaleZ: 0.24,
          });
        });
      if (capTransforms.length) {
        const capGeometry = CreateWindblownSnowStripGeometry();
        const capMaterial = new THREE.MeshStandardMaterial({
          color: 0xd7d9d3,
          roughness: 1,
          transparent: true,
          opacity: 0.48,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
        });
        const capMesh = new THREE.InstancedMesh(capGeometry, capMaterial, capTransforms.length);
        const capMatrix = new THREE.Matrix4();
        capTransforms.forEach((cap, index) => {
          capMatrix.compose(
            cap.position,
            new THREE.Quaternion().setFromEuler(new THREE.Euler(0, cap.rotation, 0)),
            new THREE.Vector3(cap.scaleX, 1, cap.scaleZ),
          );
          capMesh.setMatrixAt(index, capMatrix);
        });
        capMesh.instanceMatrix.needsUpdate = true;
        capMesh.renderOrder = 8;
        capMesh.name = "WinterRoofAndRidgeSnowCaps";
        this.weatherGroup.add(capMesh);
      }

      const branchCatchTransforms = [];
      visibleHexes
        .filter((hex) => NormalizeTerrain(hex.terrain) === "forest")
        .forEach((hex) => {
          const base = this.hexPositions.get(hex.id) ?? HexToWorld(hex.q, hex.r);
          for (let catchIndex = 0; catchIndex < 3; catchIndex += 1) {
            const angle = HashNoise(hex.q, hex.r, catchIndex + 130) * Math.PI * 2;
            const radius = 0.18 + HashNoise(hex.r, catchIndex, 131) * 0.48;
            branchCatchTransforms.push({
              position: new THREE.Vector3(
                base.x + Math.cos(angle) * radius,
                (this.terrainHeights.get(hex.id) ?? GetTerrainHeight(hex))
                  + 0.42 + HashNoise(hex.q, catchIndex, 132) * 0.24,
                base.z + Math.sin(angle) * radius,
              ),
              scale: 0.45 + HashNoise(hex.r, catchIndex, 133) * 0.5,
            });
          }
        });
      if (branchCatchTransforms.length) {
        const catchGeometry = new THREE.IcosahedronGeometry(0.032, 1);
        const catchMaterial = new THREE.MeshStandardMaterial({
          color: 0xe1e2dc,
          roughness: 1,
          transparent: true,
          opacity: 0.58,
        });
        const catchMesh = new THREE.InstancedMesh(
          catchGeometry,
          catchMaterial,
          branchCatchTransforms.length,
        );
        const catchMatrix = new THREE.Matrix4();
        branchCatchTransforms.forEach((catchTransform, index) => {
          catchMatrix.compose(
            catchTransform.position,
            new THREE.Quaternion(),
            new THREE.Vector3().setScalar(catchTransform.scale),
          );
          catchMesh.setMatrixAt(index, catchMatrix);
        });
        catchMesh.instanceMatrix.needsUpdate = true;
        catchMesh.name = "WinterBranchSnowCatch";
        this.weatherGroup.add(catchMesh);
      }
    }

    const particleCount = Math.min(
      World3DVisualProfile.weatherMaximumPoints,
      weather.particleCount,
    );
    if (particleCount > 0) {
      const bounds = this.worldBounds ?? { minX: -5, maxX: 5, minZ: -4, maxZ: 4 };
      const width = Math.max(1, bounds.maxX - bounds.minX);
      const depth = Math.max(1, bounds.maxZ - bounds.minZ);
      const positions = new Float32Array(particleCount * 3);
      for (let index = 0; index < particleCount; index += 1) {
        positions[index * 3] = bounds.minX + HashNoise(index, weather.month, 81) * width;
        positions[index * 3 + 1] = 0.85 + HashNoise(index, weather.year, 82) * 3.7;
        positions[index * 3 + 2] = bounds.minZ + HashNoise(index, weather.month, 83) * depth;
      }
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.computeBoundingSphere();
      const winter = weather.mode === "winter-snow";
      const material = new THREE.PointsMaterial({
        color: winter ? 0xf5f4e8 : 0xc7ae78,
        size: winter ? 0.052 : 0.032,
        transparent: true,
        opacity: winter ? 0.48 : 0.22,
        depthWrite: false,
        depthTest: true,
        sizeAttenuation: true,
        fog: true,
        toneMapped: false,
      });
      const particles = new THREE.Points(geometry, material);
      particles.name = winter ? "WeatherWinterSnow" : "WeatherSpringDust";
      particles.renderOrder = 8;
      particles.frustumCulled = false;
      particles.userData.weatherMode = weather.mode;
      this.weatherGroup.add(particles);
      this.weatherParticles = particles;
    }
    this.ApplySeasonalTerrainPalette();
    this.objectCounts.weather = MeasureObjectGroup(this.weatherGroup);
    this.renderRequested = true;
    this.PublishDiagnostics();
  }

  ApplySeasonalTerrainPalette() {
    const winter = this.weatherMode === "winter-snow" || this.weatherMode === "winter-dry";
    const spring = this.weatherMode === "spring-dust";
    const palette = winter
      ? { olive: 0x626a5d, ochre: 0x746a58, crop: 0x595a46, hay: 0x70644e }
      : spring
        ? { olive: 0x68775f, ochre: 0x7a7258, crop: 0x62674b, hay: 0x786b4d }
        : { olive: 0x737c55, ochre: 0x897653, crop: 0x6e7142, hay: 0x817044 };
    Object.entries(palette).forEach(([key, color]) => {
      const material = this.seasonalTerrainMaterials[key];
      if (!material) return;
      material.color.setHex(color);
      material.needsUpdate = true;
    });
  }

  LoadMiniatureModelPack() {
    this.modelPackStatus = "loading";
    import("../../taihang/vendor/three/examples/jsm/loaders/GLTFLoader.mjs")
      .then(({ GLTFLoader }) => new GLTFLoader().loadAsync(World3DModelPackUrl))
      .then((gltf) => {
        if (this.disposed) {
          DisposeObject(gltf.scene, new Set(), new Set());
          return;
        }
        const prototypes = new Map();
        World3DModelNames.forEach((modelName) => {
          const prototype = gltf.scene.getObjectByName(modelName);
          if (prototype) prototypes.set(modelName, prototype);
        });
        if (prototypes.size !== World3DModelNames.length) {
          DisposeObject(gltf.scene, new Set(), new Set());
          throw new Error(`EnemyRear1941 model pack is incomplete: ${prototypes.size}/${World3DModelNames.length}`);
        }
        let modelPackMeshCount = 0;
        for (const [modelName, prototype] of prototypes) {
          let assetMeshCount = 0;
          let missingVertexColors = false;
          prototype.traverse((object) => {
            if (!object.isMesh) return;
            assetMeshCount += 1;
            modelPackMeshCount += 1;
            if (!object.geometry?.getAttribute("color")) missingVertexColors = true;
          });
          if (missingVertexColors) {
            DisposeObject(gltf.scene, new Set(), new Set());
            throw new Error(`${modelName} is missing its optimized vertex-color palette.`);
          }
          if (assetMeshCount > 8) {
            DisposeObject(gltf.scene, new Set(), new Set());
            throw new Error(`${modelName} exceeds the eight-mesh runtime budget: ${assetMeshCount}`);
          }
        }
        if (modelPackMeshCount > 55) {
          DisposeObject(gltf.scene, new Set(), new Set());
          throw new Error(`EnemyRear1941 model pack exceeds the 55-mesh runtime budget: ${modelPackMeshCount}`);
        }
        gltf.scene.traverse((object) => {
          if (object.geometry) this.sharedGeometries.add(object.geometry);
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.filter(Boolean).forEach((material) => {
            if (object.geometry?.getAttribute("color")) {
              material.vertexColors = true;
              material.color?.setRGB(1.075, 1.06, 1.03);
              material.emissive?.setHex(0x000000);
              material.emissiveIntensity = 0;
              material.roughness = Math.max(0.82, Number(material.roughness) || 0.9);
              material.metalness = Math.min(0.1, Number(material.metalness) || 0);
              material.needsUpdate = true;
            }
            this.sharedMaterials.add(material);
          });
          if (object.isMesh) {
            object.castShadow = true;
            object.receiveShadow = true;
          }
        });
        this.modelPackScene = gltf.scene;
        this.modelPrototypes = prototypes;
        this.modelPackMeshCount = modelPackMeshCount;
        this.modelPackStatus = "ready";
        this.ApplyMiniatureDetailTexture();
        if (this.state) {
          this.dirty.units = true;
          this.dirty.structures = true;
          this.RebuildDirtyLayers();
          this.weatherSignature = "";
          this.UpdateWeather();
        }
        this.renderRequested = true;
        this.PublishDiagnostics();
      })
      .catch(() => {
        this.modelPackMeshCount = 0;
        this.modelPackStatus = "fallback-procedural";
        this.renderRequested = true;
        this.PublishDiagnostics();
      });
  }

  CloneModelAsset(modelName) {
    const prototype = this.modelPrototypes.get(modelName);
    if (!prototype) return null;
    const clone = prototype.clone(true);
    clone.position.set(0, 0, 0);
    clone.userData.modelPackAsset = modelName;
    return clone;
  }

  CreateSharedResources() {
    this.hexGeometry = new THREE.CylinderGeometry(0.97, 0.97, 1, 6, 1, false, Math.PI / 6);
    this.lineGeometry = new THREE.BoxGeometry(1, 1, 1);
    this.warningDashGeometry = new THREE.BoxGeometry(0.22, 0.035, 0.07);
    this.warningArrowGeometry = new THREE.BufferGeometry();
    this.warningArrowGeometry.setAttribute("position", new THREE.Float32BufferAttribute([
      0, 0, 0.19,
      -0.13, 0, -0.11,
      0.13, 0, -0.11,
    ], 3));
    this.warningArrowGeometry.computeVertexNormals();
    this.sabotageBeamGeometry = new THREE.BoxGeometry(0.46, 0.055, 0.075);
    this.unitPedestalGeometry = new THREE.CylinderGeometry(0.3, 0.33, 0.035, 20);
    this.hexMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.98,
      metalness: 0,
      emissive: 0x000000,
      emissiveIntensity: 0,
      flatShading: false,
    });
    this.pickMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
    this.fogMaterial = new THREE.MeshBasicMaterial({
      color: 0x202c28,
      transparent: true,
      opacity: 0.18,
      depthWrite: false,
      toneMapped: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
    });
    this.materials = {
      wall: new THREE.MeshStandardMaterial({ color: 0xa99f88, roughness: 0.98 }),
      enemyWall: new THREE.MeshStandardMaterial({ color: 0xa5a597, roughness: 0.96 }),
      roof: new THREE.MeshStandardMaterial({ color: 0x747d74, roughness: 0.9 }),
      wood: new THREE.MeshStandardMaterial({ color: 0x755b42, roughness: 0.94 }),
      stone: new THREE.MeshStandardMaterial({ color: 0xaaa89a, roughness: 0.95 }),
      enemyStone: new THREE.MeshStandardMaterial({ color: 0x8e9690, roughness: 0.94 }),
      enemyDark: new THREE.MeshStandardMaterial({ color: 0x63726b, roughness: 0.9 }),
      iron: new THREE.MeshStandardMaterial({ color: 0x50605e, roughness: 0.5, metalness: 0.28 }),
      rail: new THREE.MeshStandardMaterial({ color: 0x3f4745, roughness: 0.46, metalness: 0.5 }),
      railDamaged: new THREE.MeshStandardMaterial({ color: 0x574842, roughness: 0.9, metalness: 0.18 }),
      road: new THREE.MeshStandardMaterial({ color: 0x80633e, roughness: 1 }),
      roadDust: new THREE.MeshStandardMaterial({ color: 0x4f412c, roughness: 1 }),
      railBed: new THREE.MeshStandardMaterial({ color: 0x77766c, roughness: 0.98 }),
      railSleeper: new THREE.MeshStandardMaterial({ color: 0x4f3928, roughness: 0.98 }),
      playerUniform: new THREE.MeshStandardMaterial({ color: 0x687c82, roughness: 0.92 }),
      playerCap: new THREE.MeshStandardMaterial({ color: 0x59696d, roughness: 0.92 }),
      enemyUniform: new THREE.MeshStandardMaterial({ color: 0xa7a17e, roughness: 0.9 }),
      enemyHelmet: new THREE.MeshStandardMaterial({ color: 0x777d63, roughness: 0.82 }),
      playerPedestal: new THREE.MeshStandardMaterial({
        color: 0x8d3930, roughness: 0.88,
      }),
      enemyPedestal: new THREE.MeshStandardMaterial({
        color: 0x4d625d, roughness: 0.88,
      }),
      paperLight: new THREE.MeshStandardMaterial({ color: 0xa59a7d, roughness: 1 }),
      smoke: new THREE.MeshBasicMaterial({ color: 0x353530, transparent: true, opacity: 0.34, depthWrite: false }),
      ember: new THREE.MeshBasicMaterial({ color: 0xd0633f, transparent: true, opacity: 0.78, depthWrite: false }),
    };
    [
      this.hexGeometry,
      this.lineGeometry,
      this.warningDashGeometry,
      this.warningArrowGeometry,
      this.sabotageBeamGeometry,
      this.unitPedestalGeometry,
    ].forEach((geometry) => this.sharedGeometries.add(geometry));
    [this.hexMaterial, this.pickMaterial, this.fogMaterial, ...Object.values(this.materials)]
      .forEach((material) => this.sharedMaterials.add(material));
  }

  InitializeResizeMonitoring() {
    const requestResize = () => {
      this.resizePending = true;
      this.renderRequested = true;
    };
    if (typeof ResizeObserver === "function") {
      this.resizeObserver = new ResizeObserver(requestResize);
      this.resizeObserver.observe(this.canvas);
      return;
    }
    this.HandleWindowResize = requestResize;
    window.addEventListener("resize", this.HandleWindowResize, { passive: true });
  }

  RefreshObjectCounts() {
    this.objectCounts = {
      terrain: MeasureObjectGroup(this.terrainGroup),
      fog: MeasureObjectGroup(this.fogGroup),
      units: MeasureObjectGroup(this.unitGroup),
      structures: MeasureObjectGroup(this.structureGroup),
      overlay: MeasureObjectGroup(this.overlayGroup),
      effects: MeasureObjectGroup(this.effectGroup),
      actionEffects: MeasureObjectGroup(this.actionEffectGroup),
      weather: MeasureObjectGroup(this.weatherGroup),
    };
    return this.objectCounts;
  }

  PublishDiagnostics() {
    if (!this.canvas || !this.renderer) return;
    const sceneMetrics = MeasureObjectGroup(this.scene);
    const info = this.renderer.info;
    const targetFps = GetTargetFrameRate();
    const hidden = typeof document !== "undefined" && document.hidden;
    const paused = hidden ? "hidden" : this.pauseReason;
    Object.assign(this.canvas.dataset, {
      worldFrameCount: String(this.frameCount),
      worldAnimationFrames: String(this.animationFrameCount),
      worldCalls: String(info.render.calls),
      worldTriangles: String(info.render.triangles),
      worldObjects: String(sceneMetrics.object3D),
      worldMeshes: String(sceneMetrics.meshes),
      worldVisibleMeshes: String(sceneMetrics.visibleMeshes),
      worldInstancedMeshes: String(sceneMetrics.instancedMeshes),
      worldInstances: String(sceneMetrics.instances),
      worldGeometries: String(info.memory.geometries),
      worldTextures: String(info.memory.textures),
      worldFps: this.framesPerSecond.toFixed(1),
      worldTargetFps: String(targetFps),
      worldFrameMs: this.lastFrameDurationMs.toFixed(2),
      worldPaused: paused,
      worldDpr: this.renderer.getPixelRatio().toFixed(2),
      worldShadows: this.renderer.shadowMap.enabled ? "enabled" : "error-disabled",
      worldPaperTexture: this.paperTextureSize ?? this.paperTextureStatus ?? "loading",
      worldModelPack: this.modelPackStatus,
      worldModelMeshes: String(this.modelPackMeshCount),
      worldModelDetail: this.miniatureDetailStatus,
      worldWeather: this.weatherMode,
      worldActionEffect: this.activeActionEffects.map((effect) => effect.actionId).join(",") || "none",
      worldActionEffectCount: String(this.activeActionEffects.length),
    });
  }

  InitializeDiagnostics() {
    worldDiagnosticsRouter.current = this;
    const diagnosticsProxy = Object.freeze({
      cacheIdentity: World3DCacheIdentity,
      get active() { return Boolean(worldDiagnosticsRouter.current); },
      get mode() { return worldDiagnosticsRouter.current ? "three-orthographic" : "unavailable"; },
      get frameCount() { return worldDiagnosticsRouter.current?.frameCount ?? 0; },
      get performance() {
        const world = worldDiagnosticsRouter.current;
        return Object.freeze({
          framesPerSecond: world?.framesPerSecond ?? 0,
          targetFramesPerSecond: GetTargetFrameRate(),
          renderedFrames: world?.frameCount ?? 0,
          animationFrames: world?.animationFrameCount ?? 0,
          lastFrameDurationMs: world?.lastFrameDurationMs ?? 0,
          paused: world?.pauseReason ?? "unavailable",
        });
      },
      get rendererInfo() {
        const info = worldDiagnosticsRouter.current?.renderer?.info;
        return Object.freeze({
          render: Object.freeze({
            calls: info?.render.calls ?? 0,
            triangles: info?.render.triangles ?? 0,
            points: info?.render.points ?? 0,
            lines: info?.render.lines ?? 0,
          }),
          memory: Object.freeze({
            geometries: info?.memory.geometries ?? 0,
            textures: info?.memory.textures ?? 0,
          }),
        });
      },
      get objectCounts() { return Object.freeze({ ...(worldDiagnosticsRouter.current?.objectCounts ?? {}) }); },
      get sceneMetrics() { return MeasureObjectGroup(worldDiagnosticsRouter.current?.scene); },
      get dirtyLayers() { return Object.freeze({ ...(worldDiagnosticsRouter.current?.dirty ?? {}) }); },
      get actionEffects() {
        const world = worldDiagnosticsRouter.current;
        return Object.freeze({
          activeCount: world?.activeActionEffects.length ?? 0,
          actionIds: Object.freeze(world?.activeActionEffects.map((effect) => effect.actionId) ?? []),
          reducedMotionStatic: Boolean(world?.reducedMotion && world?.activeActionEffects.length),
        });
      },
      projectHex(hexId) {
        const world = worldDiagnosticsRouter.current;
        const worldPosition = world?.hexPositions.get(String(hexId))?.clone();
        if (!world || !worldPosition || !world.camera || !world.canvas) return null;
        worldPosition.y = (world.terrainHeights.get(String(hexId)) ?? 0) + 0.08;
        worldPosition.project(world.camera);
        return Object.freeze({
          x: (worldPosition.x + 1) * 0.5 * world.canvas.clientWidth,
          y: (1 - worldPosition.y) * 0.5 * world.canvas.clientHeight,
        });
      },
      get quality() {
        const world = worldDiagnosticsRouter.current;
        return Object.freeze({
          dpr: world?.renderer?.getPixelRatio() ?? 0,
          reducedMotion: world?.reducedMotion ?? false,
          dprCap: World3DQualityProfile.dprCap,
          targetFramesPerSecond: GetTargetFrameRate(),
          shadows: world?.renderer?.shadowMap.enabled ?? null,
          paperTextureStatus: world?.paperTextureStatus ?? "unavailable",
          paperTextureSize: world?.paperTextureSize ?? "unavailable",
          modelPackStatus: world?.modelPackStatus ?? "unavailable",
          modelPackAssets: world?.modelPrototypes.size ?? 0,
          modelPackMeshes: world?.modelPackMeshCount ?? 0,
          miniatureDetailStatus: world?.miniatureDetailStatus ?? "unavailable",
          weather: world?.weatherMode ?? "unavailable",
        });
      },
    });
    if (typeof window !== "undefined" && !Object.prototype.hasOwnProperty.call(window, "__EnemyRearWorld3D")) {
      Object.defineProperty(window, "__EnemyRearWorld3D", {
        value: diagnosticsProxy,
        writable: false,
        enumerable: true,
        configurable: false,
      });
    }
    this.PublishDiagnostics();
  }

  SetState(state, view = {}) {
    this.state = state;
    this.view = view;
    const nextWeatherMode = GetWorld3DWeather(state?.turn).mode;
    if (nextWeatherMode !== this.weatherMode) this.dirty.terrain = true;
    this.weatherMode = nextWeatherMode;
    const wasReducedMotion = this.reducedMotion;
    this.reducedMotion = Boolean(view.reducedMotion);
    if (this.reducedMotion && !wasReducedMotion) {
      this.activeActionEffects.forEach((effect) => this.ApplyStaticActionEffectPose(effect));
    }
    const nextSignatures = {
      terrain: TerrainSignature(state),
      fog: FogSignature(state),
      units: UnitSignature(state),
      structures: StructureSignature(state),
      overlay: OverlaySignature(state, view),
    };
    World3DLayerNames.forEach((layerName) => {
      if (this.signatures[layerName] !== nextSignatures[layerName]) this.dirty[layerName] = true;
      this.signatures[layerName] = nextSignatures[layerName];
    });
    this.RebuildDirtyLayers();
    this.UpdateWeather();
    this.ApplyView(view.camera ?? {});
    this.Resize();
    this.renderRequested = true;
    this.ambientAnimationDeadline = performance.now() + 3600;
    this.pauseReason = "active";
    this.RefreshObjectCounts();
    this.PublishDiagnostics();
  }

  MarkDirty(...layerNames) {
    layerNames.forEach((layerName) => {
      if (World3DLayerNames.includes(layerName)) this.dirty[layerName] = true;
    });
    this.renderRequested = true;
  }

  RebuildDirtyLayers() {
    if (!this.state) return;
    if (this.dirty.terrain) this.RebuildTerrain();
    if (this.dirty.structures) this.RebuildStructures();
    if (this.dirty.fog) this.RebuildFog();
    if (this.dirty.units) this.RebuildUnits();
    if (this.dirty.overlay) this.RebuildOverlay();
  }

  RebuildTerrain() {
    ClearGroup(this.terrainGroup, this.sharedGeometries, this.sharedMaterials);
    this.terrainAlbedoMaterials.clear();
    this.hexById.clear();
    this.hexByCoordinate.clear();
    this.hexPositions.clear();
    this.terrainHeights.clear();
    const hexes = this.state.hexes ?? [];
    const matrix = new THREE.Matrix4();
    this.pickInstanceIds = [];
    hexes.forEach((hex) => {
      const position = HexToWorld(hex.q, hex.r);
      const terrain = NormalizeTerrain(hex.terrain);
      const unscaledHeight = GetTerrainHeight(hex)
        + GetLandscapeMacroRelief(position.x, position.z, terrain);
      const height = Math.max(
        0.022,
        0.022 + (unscaledHeight - 0.022) * World3DVisualProfile.terrainReliefScale,
      );
      this.hexById.set(hex.id, hex);
      this.hexByCoordinate.set(CoordinateKey(hex.q, hex.r), hex);
      this.hexPositions.set(hex.id, position);
      this.terrainHeights.set(hex.id, height);
    });
    this.UpdateWorldBounds();

    const terrainColorCache = new Map();
    const GetHexColor = (hex) => {
      if (terrainColorCache.has(hex.id)) return terrainColorCache.get(hex.id);
      const color = new THREE.Color(terrainStyles[NormalizeTerrain(hex.terrain)].color);
      const tint = (HashNoise(hex.q, hex.r, 4) - 0.5) * World3DVisualProfile.terrainColorVariation;
      color.offsetHSL(0, 0, tint);
      terrainColorCache.set(hex.id, color);
      return color;
    };
    const bounds = this.worldBounds;
    const landscapeMinX = bounds.minX - 2.8;
    const landscapeMaxX = bounds.maxX + 2.8;
    const landscapeMinZ = bounds.minZ - 2.8;
    const landscapeMaxZ = bounds.maxZ + 2.8;
    const landscapeWidth = landscapeMaxX - landscapeMinX;
    const landscapeDepth = landscapeMaxZ - landscapeMinZ;
    const segmentsX = 96;
    const segmentsZ = Math.max(40, Math.round(segmentsX * landscapeDepth / landscapeWidth));
    const surfacePositions = [];
    const surfaceColors = [];
    const surfaceUvs = [];
    const surfaceIndices = [];
    const earthColor = new THREE.Color(0x716c59);
    const unknownTerrainColor = new THREE.Color(0x4b5750);
    const winterSnowColor = new THREE.Color(0xc5c8c0);
    const hexSamples = hexes.map((hex) => ({
      hex,
      position: this.hexPositions.get(hex.id),
      height: this.terrainHeights.get(hex.id) ?? GetTerrainHeight(hex),
      color: GetHexColor(hex),
    }));
    for (let row = 0; row <= segmentsZ; row += 1) {
      const zRatio = row / segmentsZ;
      const z = THREE.MathUtils.lerp(landscapeMinZ, landscapeMaxZ, zRatio);
      for (let column = 0; column <= segmentsX; column += 1) {
        const xRatio = column / segmentsX;
        const x = THREE.MathUtils.lerp(landscapeMinX, landscapeMaxX, xRatio);
        const nearest = FindNearestTerrainSamples(hexSamples, x, z, 4);
        let totalWeight = 0;
        let height = 0;
        let mountainWeight = 0;
        let hillWeight = 0;
        let visibleWeight = 0;
        const color = new THREE.Color(0, 0, 0);
        nearest.forEach((sample) => {
          const weight = 1 / ((sample.distanceSquared + 0.045) ** 1.7);
          totalWeight += weight;
          height += sample.height * weight;
          const sampleTerrain = NormalizeTerrain(sample.hex.terrain);
          if (sampleTerrain === "mountain") mountainWeight += weight;
          if (sampleTerrain === "hill") hillWeight += weight;
          if (sample.hex.visible !== false) visibleWeight += weight;
          color.r += sample.color.r * weight;
          color.g += sample.color.g * weight;
          color.b += sample.color.b * weight;
        });
        height /= Math.max(0.0001, totalWeight);
        mountainWeight /= Math.max(0.0001, totalWeight);
        hillWeight /= Math.max(0.0001, totalWeight);
        visibleWeight /= Math.max(0.0001, totalWeight);
        color.multiplyScalar(1 / Math.max(0.0001, totalWeight));
        const edgeDistance = Math.min(
          x - landscapeMinX,
          landscapeMaxX - x,
          z - landscapeMinZ,
          landscapeMaxZ - z,
        );
        const edgeFade = THREE.MathUtils.smoothstep(edgeDistance, 0, 1.7);
        const nearestTerrain = NormalizeTerrain(nearest[0]?.hex?.terrain);
        const reliefNoise = (
          (HashNoise(column, row, 171) - 0.5) * 0.55
          + (HashNoise(column >> 1, row >> 1, 172) - 0.5) * 0.45
        ) * (nearestTerrain === "mountain" ? 0.038 : nearestTerrain === "hill" ? 0.024 : 0.012);
        const carvedRelief = GetLandscapeMicroRelief(x, z, nearestTerrain);
        const limestoneFold = Math.pow(
          Math.max(0, 1 - Math.abs(Math.sin(x * 0.88 + z * 0.53 + 0.52)) * 1.32),
          1.48,
        );
        const secondaryFold = Math.pow(
          Math.max(0, 1 - Math.abs(Math.sin(x * 1.31 - z * 0.36 - 0.84)) * 1.8),
          1.8,
        );
        const mountainRidge = mountainWeight * (limestoneFold * 0.15 + secondaryFold * 0.065);
        const hillShoulder = hillWeight * Math.pow(
          Math.max(0, 1 - Math.abs(Math.sin(x * 0.68 - z * 0.58 - 0.18)) * 1.48),
          1.7,
        ) * 0.052;
        const localRelief = (
          reliefNoise
          + carvedRelief
          + mountainRidge
          + hillShoulder
        ) * World3DVisualProfile.terrainReliefScale;
        const y = 0.024 + (height + localRelief - 0.024) * edgeFade;
        color.lerp(earthColor, 1 - edgeFade);
        const coolSlope = nearestTerrain === "mountain" || nearestTerrain === "rivervalley";
        const elevationLight = nearestTerrain === "mountain"
          ? Clamp((y - 0.64) * 0.055, -0.025, 0.055)
          : nearestTerrain === "hill"
            ? Clamp((y - 0.34) * 0.04, -0.018, 0.035)
            : 0;
        color.offsetHSL(
          coolSlope ? -0.012 : 0.006,
          coolSlope ? -0.015 : 0.012,
          (HashNoise(column, row, 173) - 0.5) * 0.026
            + elevationLight
            + mountainWeight * (limestoneFold - 0.38) * 0.045,
        );
        color.lerp(
          unknownTerrainColor,
          Clamp((1 - visibleWeight) * 0.48, 0, 0.48),
        );
        if (this.weatherMode === "winter-snow") {
          color.lerp(
            winterSnowColor,
            GetWinterTerrainSnowCoverage(x, z, mountainWeight, visibleWeight),
          );
        }
        surfacePositions.push(x, y, z);
        surfaceColors.push(color.r, color.g, color.b);
        surfaceUvs.push(
          x * World3DVisualProfile.terrainTextureWorldScale,
          -z * World3DVisualProfile.terrainTextureWorldScale,
        );
      }
    }
    const rowLength = segmentsX + 1;
    for (let row = 0; row < segmentsZ; row += 1) {
      for (let column = 0; column < segmentsX; column += 1) {
        const topLeft = row * rowLength + column;
        const topRight = topLeft + 1;
        const bottomLeft = topLeft + rowLength;
        const bottomRight = bottomLeft + 1;
        surfaceIndices.push(
          topLeft,
          bottomLeft,
          topRight,
          topRight,
          bottomLeft,
          bottomRight,
        );
      }
    }
    const terrainGeometry = new THREE.BufferGeometry();
    terrainGeometry.setAttribute("position", new THREE.Float32BufferAttribute(surfacePositions, 3));
    terrainGeometry.setAttribute("color", new THREE.Float32BufferAttribute(surfaceColors, 3));
    terrainGeometry.setAttribute("uv", new THREE.Float32BufferAttribute(surfaceUvs, 2));
    terrainGeometry.setIndex(surfaceIndices);
    terrainGeometry.computeVertexNormals();
    terrainGeometry.computeBoundingSphere();
    const terrainMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.94,
      metalness: 0,
      emissive: 0x000000,
      side: THREE.FrontSide,
    });
    const terrainMesh = new THREE.Mesh(terrainGeometry, terrainMaterial);
    terrainMesh.castShadow = true;
    terrainMesh.receiveShadow = true;
    terrainMesh.name = "TerrainContinuousCountyLandscape";
    this.terrainGroup.add(terrainMesh);

    const terrainAlbedoMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: this.terrainAlbedoTexture,
      bumpMap: this.terrainAlbedoTexture,
      bumpScale: 0.03,
      vertexColors: false,
      roughness: 0.93,
      metalness: 0,
      transparent: true,
      opacity: this.terrainAlbedoTexture
        ? World3DVisualProfile.terrainAlbedoOpacity
          * (this.weatherMode === "winter-snow" ? 0.68 : 1)
        : 0,
      depthWrite: false,
      blending: THREE.NormalBlending,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    });
    const terrainAlbedoOverlay = new THREE.Mesh(terrainGeometry.clone(), terrainAlbedoMaterial);
    terrainAlbedoOverlay.receiveShadow = true;
    terrainAlbedoOverlay.renderOrder = 2;
    terrainAlbedoOverlay.name = "TerrainImageGenAlbedoOverlay";
    this.terrainAlbedoMaterials.add(terrainAlbedoMaterial);
    this.terrainGroup.add(terrainAlbedoOverlay);

    const countyGround = new THREE.Mesh(
      new THREE.PlaneGeometry(
        landscapeWidth + 3.6,
        landscapeDepth + 3.6,
      ),
      new THREE.MeshStandardMaterial({ color: 0x586257, roughness: 1, metalness: 0 }),
    );
    countyGround.rotation.x = -Math.PI / 2;
    countyGround.position.set(bounds.centerX, 0.009, bounds.centerZ);
    countyGround.receiveShadow = true;
    countyGround.name = "CountyLandscapeGround";
    this.terrainGroup.add(countyGround);

    const pickMesh = new THREE.InstancedMesh(this.hexGeometry, this.pickMaterial, Math.max(1, hexes.length));
    hexes.forEach((hex, index) => {
      const position = this.hexPositions.get(hex.id).clone();
      const height = this.terrainHeights.get(hex.id) ?? GetTerrainHeight(hex);
      position.y = height / 2;
      matrix.compose(position, new THREE.Quaternion(), new THREE.Vector3(1, Math.max(0.06, height), 1));
      pickMesh.setMatrixAt(index, matrix);
      this.pickInstanceIds[index] = hex.id;
    });
    pickMesh.instanceMatrix.needsUpdate = true;
    pickMesh.name = "PickInstancedHexes";
    pickMesh.userData.pickLayer = true;
    pickMesh.visible = false;
    this.pickMesh = pickMesh;
    this.terrainGroup.add(pickMesh);
    const boundaryGeometry = new THREE.RingGeometry(0.91, 0.955, 6, 1, Math.PI / 6);
    const boundaryMaterial = new THREE.MeshBasicMaterial({
      color: 0x5b5548,
      transparent: true,
      opacity: 0.045,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      toneMapped: false,
    });
    const boundaryMesh = new THREE.InstancedMesh(boundaryGeometry, boundaryMaterial, Math.max(1, hexes.length));
    const boundaryQuaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
    hexes.forEach((hex, index) => {
      const base = this.hexPositions.get(hex.id);
      matrix.compose(
        new THREE.Vector3(base.x, (this.terrainHeights.get(hex.id) ?? 0) + 0.018, base.z),
        boundaryQuaternion,
        new THREE.Vector3(1, 1, 1),
      );
      boundaryMesh.setMatrixAt(index, matrix);
    });
    boundaryMesh.instanceMatrix.needsUpdate = true;
    boundaryMesh.renderOrder = 3;
    boundaryMesh.name = "TerrainBoundaryInstanced";
    this.terrainGroup.add(boundaryMesh);
    this.AddTerrainDetails(hexes);
    this.dirty.terrain = false;
    this.dirty.structures = true;
    this.dirty.fog = true;
    this.dirty.units = true;
    this.dirty.overlay = true;
    this.objectCounts.terrain = MeasureObjectGroup(this.terrainGroup);
  }

  AddTerrainDetails(hexes) {
    const treeTrunkGeometry = new THREE.CylinderGeometry(0.022, 0.046, 0.32, 7);
    const treeCrownGeometry = new THREE.IcosahedronGeometry(0.19, 2);
    const bareBranchGeometry = new THREE.CylinderGeometry(0.009, 0.015, 1, 5);
    const shrubGeometry = new THREE.IcosahedronGeometry(0.1, 1);
    const screeGeometry = new THREE.DodecahedronGeometry(0.11, 0);
    const limestoneRidgeGeometry = CreateTaihangRidgeGeometry();
    const terraceGeometry = CreateCurvedGroundStripGeometry(1.04, 0.034, 0.13);
    const fieldGeometry = CreateIrregularFieldGeometry();
    const furrowGeometry = CreateCurvedGroundStripGeometry();
    const channelGeometry = new THREE.BoxGeometry(1.38, 0.018, 0.22);
    const wallGeometry = new THREE.BoxGeometry(0.68, 0.13, 0.075);
    const cropGeometry = new THREE.CylinderGeometry(0.008, 0.012, 0.13, 5);
    const haystackGeometry = new THREE.ConeGeometry(0.105, 0.19, 9);
    const trunkTransforms = [];
    const oliveCrownTransforms = [];
    const ochreCrownTransforms = [];
    const bareBranchSegments = [];
    const limestoneRidgeTransforms = [];
    const terraceTransforms = [];
    const fieldTransforms = [];
    const furrowTransforms = [];
    const channelTransforms = [];
    const cropTransforms = [];
    const haystackTransforms = [];
    const shrubTransforms = [];
    const screeTransforms = [];
    const wallTransforms = [];
    const terrainWeather = GetWorld3DWeather(this.state?.turn);
    const winterTrees = terrainWeather.mode === "winter-dry"
      || terrainWeather.mode === "winter-snow";
    hexes.forEach((hex) => {
      const base = this.hexPositions.get(hex.id);
      const height = this.terrainHeights.get(hex.id) ?? 0;
      const terrain = NormalizeTerrain(hex.terrain);
      const isVillageHex = IsFeature(hex, "Village", "Headquarters");
      if (hex.visible === false) return;
      if (terrain === "forest") {
        for (let index = 0; index < 12; index += 1) {
          const angle = HashNoise(hex.q, hex.r, index + 10) * Math.PI * 2;
          const radius = 0.15 + HashNoise(hex.r, hex.q, index + 22) * 0.62;
          const scale = 0.72 + HashNoise(index, hex.q + hex.r, 8) * 0.46;
          const x = base.x + Math.cos(angle) * radius;
          const z = base.z + Math.sin(angle) * radius;
          trunkTransforms.push([x, height + 0.16 * scale, z, scale, scale, scale, angle]);
          const crownTransform = [
            x,
            height + 0.39 * scale,
            z,
            scale * (0.88 + HashNoise(index, hex.q, 26) * 0.25),
            scale * (0.76 + HashNoise(index, hex.r, 27) * 0.25),
            scale,
            angle,
          ];
          const keepWinterCrown = HashNoise(hex.q + index, hex.r, 232) > 0.7;
          if (!winterTrees || keepWinterCrown) {
            (index % 3 === 0 ? ochreCrownTransforms : oliveCrownTransforms).push(crownTransform);
          } else {
            const BranchEnd = (branchAngle, radius, branchHeight) => [
              x + Math.cos(branchAngle) * radius * scale,
              height + branchHeight * scale,
              z + Math.sin(branchAngle) * radius * scale,
            ];
            bareBranchSegments.push(
              [
                [x, height + 0.25 * scale, z],
                [x, height + 0.57 * scale, z],
                scale,
              ],
              [
                [x, height + 0.34 * scale, z],
                BranchEnd(angle + 0.62, 0.18, 0.49),
                scale * 0.9,
              ],
              [
                [x, height + 0.39 * scale, z],
                BranchEnd(angle + 2.72, 0.17, 0.54),
                scale * 0.86,
              ],
              [
                [x, height + 0.46 * scale, z],
                BranchEnd(angle + 1.56, 0.135, 0.61),
                scale * 0.7,
              ],
              [
                [x, height + 0.47 * scale, z],
                BranchEnd(angle + 4.48, 0.13, 0.59),
                scale * 0.68,
              ],
            );
          }
          if (index < 7) {
            const shrubAngle = angle + 0.62;
            const shrubRadius = radius * 0.72;
            shrubTransforms.push([
              base.x + Math.cos(shrubAngle) * shrubRadius,
              height + 0.075,
              base.z + Math.sin(shrubAngle) * shrubRadius,
              0.8,
              0.55,
              1,
              shrubAngle,
            ]);
          }
        }
      } else if (terrain === "mountain") {
        const ridgeAngle = Math.PI * 0.335
          + (HashNoise(Math.floor(hex.q / 3), Math.floor(hex.r / 3), 32) - 0.5) * 0.18;
        const ridgeAlongX = Math.cos(ridgeAngle);
        const ridgeAlongZ = Math.sin(ridgeAngle);
        const ridgeSideX = -Math.sin(ridgeAngle);
        const ridgeSideZ = Math.cos(ridgeAngle);
        const ridgeShift = (HashNoise(hex.q, hex.r, 233) - 0.5) * 0.16;
        limestoneRidgeTransforms.push([
          base.x + ridgeAlongX * ridgeShift,
          height - 0.14,
          base.z + ridgeAlongZ * ridgeShift,
          0.9 + HashNoise(hex.q, hex.r, 234) * 0.14,
          0.9 + HashNoise(hex.r, hex.q, 235) * 0.16,
          0.92 + HashNoise(hex.q + hex.r, hex.q, 236) * 0.14,
          ridgeAngle,
        ]);
        limestoneRidgeTransforms.push([
          base.x - ridgeAlongX * 0.18 + ridgeSideX * 0.31,
          height - 0.1,
          base.z - ridgeAlongZ * 0.18 + ridgeSideZ * 0.31,
          0.62 + HashNoise(hex.r, hex.q, 237) * 0.1,
          0.58 + HashNoise(hex.q, hex.r, 238) * 0.12,
          0.66,
          ridgeAngle + 0.2,
        ]);
        limestoneRidgeTransforms.push([
          base.x + ridgeAlongX * 0.28 - ridgeSideX * 0.27,
          height - 0.13,
          base.z + ridgeAlongZ * 0.28 - ridgeSideZ * 0.27,
          0.48 + HashNoise(hex.q, hex.r, 246) * 0.12,
          0.46 + HashNoise(hex.r, hex.q, 247) * 0.12,
          0.54,
          ridgeAngle - 0.15,
        ]);
        for (let index = 0; index < 11; index += 1) {
          const along = (index - 5) * 0.145
            + (HashNoise(hex.q, index, 239) - 0.5) * 0.08;
          const side = (index % 2 ? -1 : 1)
            * (0.46 + HashNoise(hex.r, index, 240) * 0.2);
          screeTransforms.push([
            base.x + ridgeAlongX * along + ridgeSideX * side,
            height + 0.035 + HashNoise(index, hex.q, 241) * 0.045,
            base.z + ridgeAlongZ * along + ridgeSideZ * side,
            0.55 + HashNoise(index, hex.r, 242) * 0.65,
            0.38 + HashNoise(hex.q, index, 243) * 0.38,
            0.52 + HashNoise(hex.r, index, 244) * 0.54,
            ridgeAngle + HashNoise(index, hex.q + hex.r, 245) * Math.PI,
          ]);
        }
        for (let index = 0; index < 3; index += 1) {
          const shrubAngle = Math.PI * 0.18 + index * 2.1;
          shrubTransforms.push([
            base.x + Math.cos(shrubAngle) * (0.58 + index * 0.06),
            height + 0.072,
            base.z + Math.sin(shrubAngle) * (0.58 + index * 0.06),
            0.68,
            0.48,
            0.84,
            shrubAngle,
          ]);
        }
      } else if (terrain === "hill") {
        const angle = HashNoise(hex.q, hex.r, 42) * Math.PI;
        [-2, -1, 0, 1, 2].forEach((index) => {
          const terraceAngle = angle + index * 0.028;
          terraceTransforms.push([
            base.x + Math.cos(angle + Math.PI / 2) * index * 0.112,
            height + 0.021 + Math.abs(index) * 0.008,
            base.z + Math.sin(angle + Math.PI / 2) * index * 0.112,
            0.52 + HashNoise(hex.r + index, hex.q, 222) * 0.26,
            0.72 + Math.abs(index) * 0.12,
            1,
            terraceAngle,
          ]);
        });
        for (let index = 0; index < 3; index += 1) {
          const shrubAngle = angle + index * 2.1;
          shrubTransforms.push([
            base.x + Math.cos(shrubAngle) * (0.55 + index * 0.08),
            height + 0.072,
            base.z + Math.sin(shrubAngle) * (0.55 + index * 0.08),
            0.76,
            0.52,
            0.92,
            shrubAngle,
          ]);
        }
      } else if (terrain === "rivervalley") {
        const riverNeighbors = neighborDirections
          .map(([dq, dr]) => this.hexByCoordinate.get(CoordinateKey(hex.q + dq, hex.r + dr)))
          .filter((neighbor) => NormalizeTerrain(neighbor?.terrain) === "rivervalley")
          .map((neighbor) => this.hexPositions.get(neighbor.id))
          .filter(Boolean);
        const direction = riverNeighbors.length >= 2
          ? riverNeighbors.at(-1).clone().sub(riverNeighbors[0])
          : riverNeighbors.length === 1
            ? riverNeighbors[0].clone().sub(base)
            : new THREE.Vector3(1, 0, 0.36);
        const angle = Math.atan2(-direction.z, direction.x);
        channelTransforms.push([
          base.x,
          height + 0.017,
          base.z,
          1,
          1,
          0.82 + HashNoise(hex.q, hex.r, 44) * 0.18,
          angle,
        ]);
      } else {
        const angle = HashNoise(hex.q, hex.r, 46) * Math.PI;
        const shouldPlantField = isVillageHex || HashNoise(hex.q, hex.r, 49) > 0.2;
        const fieldLanes = isVillageHex
          ? [-0.52, 0, 0.52]
          : HashNoise(hex.r, hex.q, 50) > 0.32
            ? [-0.38, 0.38]
            : [HashNoise(hex.r, hex.q, 51) > 0.5 ? -0.34 : 0.34];
        if (shouldPlantField) fieldLanes.forEach((side, patchIndex) => {
          const patchAngle = angle + (HashNoise(hex.q, patchIndex, 223) - 0.5) * 0.28;
          const patchX = base.x + Math.cos(patchAngle + Math.PI / 2) * side;
          const patchZ = base.z + Math.sin(patchAngle + Math.PI / 2) * side;
          fieldTransforms.push([
            patchX,
            height + 0.038,
            patchZ,
            0.82 + HashNoise(hex.q, patchIndex, 47) * 0.16,
            1,
            0.78 + HashNoise(hex.r, patchIndex, 48) * 0.16,
            patchAngle,
          ]);
          for (let lineIndex = -2; lineIndex <= 2; lineIndex += 1) {
            const furrowAngle = patchAngle
              + (HashNoise(hex.q, hex.r + patchIndex, 224) - 0.5) * 0.025;
            furrowTransforms.push([
              patchX
                + Math.cos(patchAngle + Math.PI / 2) * lineIndex * 0.06,
              height + 0.052,
              patchZ
                + Math.sin(patchAngle + Math.PI / 2) * lineIndex * 0.06,
              0.78 + HashNoise(lineIndex, hex.r, 225) * 0.12,
              1,
              1,
              furrowAngle,
            ]);
          }
          if (isVillageHex) for (let cropIndex = -2; cropIndex <= 2; cropIndex += 1) {
            const along = cropIndex * 0.14;
            const across = ((cropIndex + patchIndex) % 2 ? -1 : 1) * 0.075;
            cropTransforms.push([
              patchX + Math.cos(patchAngle) * along + Math.cos(patchAngle + Math.PI / 2) * across,
              height + 0.092,
              patchZ + Math.sin(patchAngle) * along + Math.sin(patchAngle + Math.PI / 2) * across,
              0.78 + HashNoise(cropIndex, hex.q, 151) * 0.4,
              0.72 + HashNoise(cropIndex, hex.r, 152) * 0.54,
              0.78 + HashNoise(cropIndex, patchIndex, 153) * 0.36,
              patchAngle,
            ]);
          }
        });
        if (
          terrain === "plain"
          && shouldPlantField
          && HashNoise(hex.q, hex.r, 154) > 0.62
        ) {
          haystackTransforms.push([
            base.x + Math.cos(angle) * 0.48,
            height + 0.105,
            base.z + Math.sin(angle) * 0.48,
            0.88,
            0.88 + HashNoise(hex.q, hex.r, 155) * 0.32,
            0.88,
            angle,
          ]);
        }
        for (let scrubIndex = 0; scrubIndex < (isVillageHex ? 4 : 2); scrubIndex += 1) {
          const scrubAngle = angle + scrubIndex * 2.17;
          const scrubRadius = 0.48 + HashNoise(hex.q, scrubIndex, 256) * 0.25;
          shrubTransforms.push([
            base.x + Math.cos(scrubAngle) * scrubRadius,
            height + 0.07,
            base.z + Math.sin(scrubAngle) * scrubRadius,
            0.52 + HashNoise(hex.r, scrubIndex, 257) * 0.34,
            0.36 + HashNoise(hex.q, scrubIndex, 258) * 0.24,
            0.58,
            scrubAngle,
          ]);
        }
        if (isVillageHex) {
          const along = new THREE.Vector2(Math.cos(angle), Math.sin(angle));
          const across = new THREE.Vector2(-Math.sin(angle), Math.cos(angle));
          [
            [along.x * 0.53, along.y * 0.53, angle + Math.PI / 2, 0.86],
            [-along.x * 0.53, -along.y * 0.53, angle + Math.PI / 2, 0.8],
            [across.x * 0.49, across.y * 0.49, angle, 0.94],
            [
              -across.x * 0.49 + along.x * 0.3,
              -across.y * 0.49 + along.y * 0.3,
              angle,
              0.3,
            ],
            [
              -across.x * 0.49 - along.x * 0.3,
              -across.y * 0.49 - along.y * 0.3,
              angle,
              0.3,
            ],
          ].forEach(([offsetX, offsetZ, wallAngle, wallScale]) => {
            wallTransforms.push([
              base.x + offsetX,
              height + 0.066,
              base.z + offsetZ,
              wallScale,
              1,
              1,
              wallAngle,
            ]);
          });
        }
      }
    });
    const AddInstances = (geometry, material, transforms, name, shadows = true) => {
      if (!transforms.length) {
        geometry.dispose();
        return;
      }
      const mesh = new THREE.InstancedMesh(geometry, material, transforms.length);
      const dummy = new THREE.Object3D();
      transforms.forEach(([x, y, z, scaleX, scaleY, scaleZ, rotation], index) => {
        dummy.position.set(x, y, z);
        dummy.scale.set(scaleX, scaleY, scaleZ);
        dummy.rotation.set(0, rotation, 0);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = shadows;
      mesh.receiveShadow = shadows;
      mesh.name = name;
      this.terrainGroup.add(mesh);
    };
    const AddBareBranches = () => {
      if (!bareBranchSegments.length) {
        bareBranchGeometry.dispose();
        return;
      }
      const mesh = new THREE.InstancedMesh(
        bareBranchGeometry,
        this.materials.wood,
        bareBranchSegments.length,
      );
      const dummy = new THREE.Object3D();
      const up = new THREE.Vector3(0, 1, 0);
      const start = new THREE.Vector3();
      const end = new THREE.Vector3();
      const direction = new THREE.Vector3();
      bareBranchSegments.forEach(([startValues, endValues, thickness], index) => {
        start.fromArray(startValues);
        end.fromArray(endValues);
        direction.copy(end).sub(start);
        const length = Math.max(0.001, direction.length());
        dummy.position.copy(start).add(end).multiplyScalar(0.5);
        dummy.quaternion.setFromUnitVectors(up, direction.normalize());
        dummy.scale.set(thickness, length, thickness);
        dummy.updateMatrix();
        mesh.setMatrixAt(index, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.name = "WinterBareBranches";
      this.terrainGroup.add(mesh);
    };
    const oliveCrownMaterial = new THREE.MeshStandardMaterial({ color: 0x506a45, roughness: 0.96 });
    const ochreCrownMaterial = new THREE.MeshStandardMaterial({ color: 0x7c673f, roughness: 0.97 });
    const cropMaterial = new THREE.MeshStandardMaterial({ color: 0x68703f, roughness: 0.98 });
    const hayMaterial = new THREE.MeshStandardMaterial({ color: 0x817044, roughness: 1 });
    this.seasonalTerrainMaterials = {
      olive: oliveCrownMaterial,
      ochre: ochreCrownMaterial,
      crop: cropMaterial,
      hay: hayMaterial,
    };
    this.ApplySeasonalTerrainPalette();
    AddInstances(treeTrunkGeometry, this.materials.wood, trunkTransforms, "ForestTrunks");
    AddInstances(treeCrownGeometry, oliveCrownMaterial, oliveCrownTransforms, "ForestOliveCrowns");
    AddInstances(treeCrownGeometry, ochreCrownMaterial, ochreCrownTransforms, "ForestOchreCrowns");
    AddBareBranches();
    AddInstances(
      limestoneRidgeGeometry,
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        vertexColors: true,
        roughness: 1,
        flatShading: true,
      }),
      limestoneRidgeTransforms,
      "TaihangContinuousLimestoneRidges",
      true,
    );
    AddInstances(terraceGeometry, new THREE.MeshStandardMaterial({ color: 0x846f4d, roughness: 1 }), terraceTransforms, "CurvedLoessTerraceEmbankments");
    AddInstances(fieldGeometry, new THREE.MeshStandardMaterial({
      color: 0x6b5737,
      roughness: 1,
      transparent: true,
      opacity: 0.58,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }), fieldTransforms, "IrregularDryFieldPlots", false);
    AddInstances(furrowGeometry, new THREE.MeshStandardMaterial({
      color: 0x4f4129,
      roughness: 1,
      side: THREE.DoubleSide,
    }), furrowTransforms, "CurvedFieldFurrows", false);
    AddInstances(screeGeometry, new THREE.MeshStandardMaterial({
      color: 0x6d6f63,
      roughness: 1,
      flatShading: true,
    }), screeTransforms, "TaihangRidgeFootScree");
    AddInstances(cropGeometry, cropMaterial, cropTransforms, "StandingMilletRows");
    AddInstances(haystackGeometry, hayMaterial, haystackTransforms, "HarvestHaystacks");
    AddInstances(channelGeometry, new THREE.MeshStandardMaterial({
      color: 0x356e70,
      roughness: 0.8,
      metalness: 0,
    }), channelTransforms, "DryRiverChannel", false);
    AddInstances(shrubGeometry, new THREE.MeshStandardMaterial({ color: 0x4e6543, roughness: 0.98 }), shrubTransforms, "ScrubBushes");
    AddInstances(wallGeometry, new THREE.MeshStandardMaterial({ color: 0x82745c, roughness: 1 }), wallTransforms, "VillageCourtyardWalls");
  }

  RebuildStructures() {
    ClearGroup(this.structureGroup, this.sharedGeometries, this.sharedMaterials);
    ClearGroup(this.effectGroup, this.sharedGeometries, this.sharedMaterials);
    this.signalObjects = [];
    this.smokePuffs = [];
    this.sabotageObjects = [];
    this.AddInfrastructure();
    (this.state.hexes ?? []).forEach((hex) => {
      if (hex.visible === false) return;
      const base = this.hexPositions.get(hex.id);
      if (!base) return;
      const height = this.terrainHeights.get(hex.id) ?? 0;
      if (hex.feature || hex.institution || hex.construction) {
        const structure = CreateStructureModel(hex, this.materials, this.CreateModelInstance);
        const structureAngle = HashNoise(hex.q, hex.r, 184) * Math.PI * 2;
        const structureRadius = IsFeature(hex, "RailStation")
          ? 0
          : IsFeature(hex, "Stronghold")
            ? 0.25
          : IsFeature(hex, "CountySeat")
            ? 0.18
            : 0.15;
        structure.position.set(
          base.x + Math.cos(structureAngle) * structureRadius,
          height + 0.025,
          base.z + Math.sin(structureAngle) * structureRadius,
        );
        if (IsFeature(hex, "RailStation")) {
          const inlineRailPositions = neighborDirections
            .map(([deltaQ, deltaR]) => this.hexByCoordinate.get(CoordinateKey(hex.q + deltaQ, hex.r + deltaR)))
            .filter((neighbor) => neighbor?.rail && neighbor.q === hex.q)
            .map((neighbor) => this.hexPositions.get(neighbor.id))
            .filter(Boolean);
          if (inlineRailPositions.length >= 2) {
            const railDirection = inlineRailPositions.at(-1).clone().sub(inlineRailPositions[0]);
            structure.rotation.y = Math.atan2(-railDirection.z, railDirection.x);
          }
        } else {
          structure.rotation.y = (HashNoise(hex.r, hex.q, 185) - 0.5) * 0.28;
        }
        if (IsFeature(hex, "CountySeat", "Headquarters")) structure.scale.setScalar(1.08);
        structure.userData.hexId = hex.id;
        structure.traverse((object) => {
          if (object.userData?.signal) this.signalObjects.push(object);
        });
        this.structureGroup.add(structure);
      }
      if (hex.improvement) this.AddImprovement(hex, base, height);
      if (Number(hex.railDisabledTurns) > 0) this.AddSabotageDamage(hex, base, height);
      if (hex.feature && hex.visible !== false) {
        const label = CreateLabelSprite(hex.name ?? "据点", {
          width: 300,
          height: 72,
          worldHeight: World3DVisualProfile.structureLabelWorldHeight,
          maximumScreenPixels: World3DVisualProfile.maximumStructureLabelScreenPixels,
          background: ["enemy", "occupied"].includes(hex.control)
            ? "rgba(42,51,48,.96)"
            : "rgba(92,47,36,.95)",
          border: "rgba(240,218,164,.94)",
          renderOrder: 27,
        });
        const labelLane = Math.abs((Number(hex.q) || 0) * 7 + (Number(hex.r) || 0) * 11) % 3;
        label.position.set(
          base.x + (labelLane - 1) * 0.24,
          height + World3DVisualProfile.structureLabelBaseHeight + labelLane * 0.14,
          base.z - 0.1,
        );
        label.userData.hexId = hex.id;
        label.userData.labelLane = labelLane;
        const labelName = String(hex.name ?? "");
        const keyFeature = /石门村|南坡村|东河车站/u.test(labelName);
        label.userData.labelPriority = keyFeature
          ? 140
          : IsFeature(hex, "RailStation")
            ? 132
            : IsFeature(hex, "Headquarters")
              ? 128
              : IsFeature(hex, "CountySeat", "Stronghold")
                ? 124
                : 92;
        label.userData.labelKind = "feature";
        label.userData.labelKey = `Feature_${hex.id}`;
        label.userData.labelAnchorLocal = label.position.clone();
        this.structureGroup.add(label);
      }
    });
    this.dirty.structures = false;
    this.objectCounts.structures = MeasureObjectGroup(this.structureGroup);
    this.objectCounts.effects = MeasureObjectGroup(this.effectGroup);
    if (this.currentViewHeight) {
      this.UpdateLabelScreenScale(this.currentViewHeight);
      this.ResolveMapLabelLayout();
    }
  }

  AddInfrastructure() {
    const drawn = new Set();
    const telegraphPostsDrawn = new Set();
    const batches = {
      railBed: [],
      rail: [],
      railDamaged: [],
      railSleeper: [],
      road: [],
      roadDust: [],
      telegraphPost: [],
      telegraphCrossbar: [],
      telegraphWire: [],
    };
    (this.state.hexes ?? []).forEach((hex) => {
      neighborDirections.forEach(([deltaQ, deltaR]) => {
        const neighbor = this.hexByCoordinate.get(CoordinateKey(hex.q + deltaQ, hex.r + deltaR));
        if (!neighbor) return;
        const key = [hex.id, neighbor.id].sort().join("|");
        if (drawn.has(key)) return;
        drawn.add(key);
        const start = this.hexPositions.get(hex.id)?.clone();
        const end = this.hexPositions.get(neighbor.id)?.clone();
        if (!start || !end) return;
        start.y = this.terrainHeights.get(hex.id) ?? 0;
        end.y = this.terrainHeights.get(neighbor.id) ?? 0;
        if (hex.rail && neighbor.rail) {
          if (hex.q !== neighbor.q && hex.r !== neighbor.r) return;
          const damagedStart = Number(hex.railDisabledTurns) > 0;
          const damagedEnd = Number(neighbor.railDisabledTurns) > 0;
          batches.railBed.push({
            start,
            end,
            width: World3DVisualProfile.railBedWidth,
            thickness: 0.026,
            yOffset: 0.026,
          });
          const horizontal = end.clone().sub(start);
          horizontal.y = 0;
          const side = new THREE.Vector3(-horizontal.z, 0, horizontal.x)
            .normalize()
            .multiplyScalar(World3DVisualProfile.railGaugeOffset);
          const railBatch = damagedStart || damagedEnd
            ? batches.railDamaged
            : batches.rail;
          const segmentLength = Math.max(0.001, horizontal.length());
          const railDirection = horizontal.clone().normalize();
          const telegraphSide = side.clone().normalize().multiplyScalar(0.44);
          const AddTelegraphPost = (postHex, point) => {
            const basePoint = point.clone().add(telegraphSide);
            const topPoint = basePoint.clone();
            topPoint.y += 0.74;
            if (!telegraphPostsDrawn.has(postHex.id)) {
              telegraphPostsDrawn.add(postHex.id);
              batches.telegraphPost.push({
                start: basePoint,
                end: topPoint,
                width: 0.022,
                thickness: 0.022,
                yOffset: 0.018,
              });
              const crossSide = railDirection.clone().multiplyScalar(0.15);
              batches.telegraphCrossbar.push({
                start: topPoint.clone().sub(crossSide),
                end: topPoint.clone().add(crossSide),
                width: 0.016,
                thickness: 0.016,
                yOffset: 0,
              });
            }
            return topPoint;
          };
          const startPostTop = AddTelegraphPost(hex, start);
          const endPostTop = AddTelegraphPost(neighbor, end);
          if (startPostTop && endPostTop) {
            batches.telegraphWire.push({
              start: startPostTop.clone().addScaledVector(railDirection, -0.11),
              end: endPostTop.clone().addScaledVector(railDirection, -0.11),
              width: 0.006,
              thickness: 0.006,
              yOffset: 0.015,
            });
          }
          const railStart = start.clone();
          const railEnd = end.clone();
          const startDamageGapInset = IsFeature(hex, "RailStation") ? 0.68 : 0.42;
          const endDamageGapInset = IsFeature(neighbor, "RailStation") ? 0.68 : 0.42;
          if (damagedStart) railStart.addScaledVector(railDirection, startDamageGapInset);
          if (damagedEnd) railEnd.addScaledVector(railDirection, -endDamageGapInset);
          if (railStart.distanceTo(railEnd) > 0.16) {
            railBatch.push(
              {
                start: railStart.clone().add(side),
                end: railEnd.clone().add(side),
                width: World3DVisualProfile.railWidth,
                thickness: 0.038,
                yOffset: 0.063,
              },
              {
                start: railStart.clone().sub(side),
                end: railEnd.clone().sub(side),
                width: World3DVisualProfile.railWidth,
                thickness: 0.038,
                yOffset: 0.063,
              },
            );
          }
          const sleeperCount = Math.max(4, Math.floor(segmentLength / 0.24));
          const sleeperSide = side.clone().normalize().multiplyScalar(0.235);
          for (let sleeperIndex = 1; sleeperIndex <= sleeperCount; sleeperIndex += 1) {
            const ratio = sleeperIndex / (sleeperCount + 1);
            const distanceFromStart = segmentLength * ratio;
            const distanceFromEnd = segmentLength * (1 - ratio);
            if ((damagedStart && distanceFromStart < startDamageGapInset + 0.1)
              || (damagedEnd && distanceFromEnd < endDamageGapInset + 0.1)) {
              continue;
            }
            const midpoint = start.clone().lerp(end, ratio);
            batches.railSleeper.push({
              start: midpoint.clone().add(sleeperSide),
              end: midpoint.clone().sub(sleeperSide),
              width: 0.052,
              thickness: 0.022,
              yOffset: 0.042,
            });
          }
        } else if (hex.road && neighbor.road) {
          const startHexIsStation = IsFeature(hex, "RailStation");
          const endHexIsStation = IsFeature(neighbor, "RailStation");
          if (startHexIsStation) {
            const approach = end.clone().sub(start);
            approach.y = 0;
            start.addScaledVector(approach.normalize(), 0.54);
          }
          if (endHexIsStation) {
            const approach = start.clone().sub(end);
            approach.y = 0;
            end.addScaledVector(approach.normalize(), 0.54);
          }
          const roadDirection = end.clone().sub(start);
          roadDirection.y = 0;
          const roadSide = new THREE.Vector3(-roadDirection.z, 0, roadDirection.x).normalize();
          const bend = (HashNoise(hex.q + neighbor.q, hex.r + neighbor.r, 204) - 0.5) * 0.38;
          const control = start.clone().add(end).multiplyScalar(0.5).addScaledVector(roadSide, bend);
          const RoadPoint = (ratio) => {
            const inverse = 1 - ratio;
            return start.clone().multiplyScalar(inverse * inverse)
              .add(control.clone().multiplyScalar(2 * inverse * ratio))
              .add(end.clone().multiplyScalar(ratio * ratio));
          };
          let previous = start.clone();
          for (let roadStep = 1; roadStep <= 12; roadStep += 1) {
            const next = RoadPoint(roadStep / 12);
            batches.road.push({
              start: previous,
              end: next,
              width: World3DVisualProfile.roadWidth,
              thickness: 0.008,
              yOffset: 0.016,
            });
            const segmentDirection = next.clone().sub(previous).setY(0).normalize();
            const rutSide = new THREE.Vector3(-segmentDirection.z, 0, segmentDirection.x)
              .multiplyScalar(World3DVisualProfile.roadWidth * 0.23);
            batches.roadDust.push(
              {
                start: previous.clone().add(rutSide),
                end: next.clone().add(rutSide),
                width: 0.021,
                thickness: 0.004,
                yOffset: 0.023,
              },
              {
                start: previous.clone().sub(rutSide),
                end: next.clone().sub(rutSide),
                width: 0.021,
                thickness: 0.004,
                yOffset: 0.023,
              },
            );
            previous = next;
          }
        }
      });
    });
    const AddLineBatch = (segments, material, name) => {
      if (!segments.length) return;
      const mesh = new THREE.InstancedMesh(this.lineGeometry, material, segments.length);
      segments.forEach((segment, index) => {
        mesh.setMatrixAt(index, ComposeLineMatrix(
          segment.start,
          segment.end,
          segment.width,
          segment.thickness ?? 0.035,
          segment.yOffset,
        ));
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.receiveShadow = true;
      mesh.name = name;
      this.structureGroup.add(mesh);
    };
    AddLineBatch(batches.road, this.materials.road, "RoadSegmentsInstanced");
    AddLineBatch(batches.roadDust, this.materials.roadDust, "RoadDustCenterInstanced");
    AddLineBatch(batches.railBed, this.materials.railBed, "RailBedsInstanced");
    AddLineBatch(batches.railSleeper, this.materials.railSleeper, "RailSleepersInstanced");
    AddLineBatch(batches.rail, this.materials.rail, "RailSegmentsInstanced");
    AddLineBatch(batches.railDamaged, this.materials.railDamaged, "DamagedRailSegmentsInstanced");
    AddLineBatch(batches.telegraphPost, this.materials.wood, "RailTelegraphPostsInstanced");
    AddLineBatch(batches.telegraphCrossbar, this.materials.wood, "RailTelegraphCrossbarsInstanced");
    AddLineBatch(batches.telegraphWire, this.materials.iron, "RailTelegraphWiresInstanced");
  }

  ApplyMiniatureDetailTexture() {
    if (!this.modelPackScene || !this.miniatureDetailTexture) return;
    this.modelPackScene.traverse((object) => {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.filter(Boolean).forEach((material) => {
        material.bumpMap = this.miniatureDetailTexture;
        material.bumpScale = 0.012;
        material.needsUpdate = true;
      });
    });
    this.miniatureDetailStatus = "ready-applied";
  }

  LoadMiniatureDetailTexture() {
    const loader = new THREE.TextureLoader();
    loader.load(
      World3DMiniatureDetailUrl,
      (texture) => {
        if (this.disposed) {
          texture.dispose();
          return;
        }
        texture.colorSpace = THREE.NoColorSpace;
        texture.wrapS = THREE.MirroredRepeatWrapping;
        texture.wrapT = THREE.MirroredRepeatWrapping;
        texture.repeat.set(1.6, 1.6);
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        this.miniatureDetailTexture = texture;
        this.ApplyMiniatureDetailTexture();
        this.renderRequested = true;
        this.PublishDiagnostics();
      },
      undefined,
      () => {
        this.miniatureDetailStatus = "fallback-no-detail";
        this.PublishDiagnostics();
      },
    );
  }

  AddImprovement(hex, base, height) {
    const improvement = String(hex.improvement ?? "").toLowerCase();
    const group = new THREE.Group();
    if (improvement.includes("terrace")) {
      for (let index = -2; index <= 2; index += 1) {
        AddBox(group, new THREE.Vector3(0.62, 0.025, 0.065), this.materials.road, new THREE.Vector3(0, 0.04, index * 0.13));
      }
    } else if (improvement.includes("workshop")) {
      const house = CreateHouse({ ...this.materials, wall: this.materials.enemyWall }, 0.58);
      group.add(house);
      const chimney = AddCylinder(group, 0.035, 0.045, 0.32, 6, this.materials.enemyDark, new THREE.Vector3(0.17, 0.43, 0));
      chimney.userData.signal = true;
      this.signalObjects.push(chimney);
    } else {
      const tower = AddBox(group, new THREE.Vector3(0.2, 0.48, 0.2), this.materials.wood, new THREE.Vector3(0, 0.25, 0));
      tower.userData.signal = true;
      this.signalObjects.push(tower);
    }
    group.position.set(base.x + 0.32, height + 0.02, base.z - 0.32);
    group.userData.hexId = hex.id;
    this.structureGroup.add(group);
  }

  AddSabotageDamage(hex, base, height) {
    const railNeighborPositions = neighborDirections
      .map(([deltaQ, deltaR]) => this.hexByCoordinate.get(CoordinateKey(hex.q + deltaQ, hex.r + deltaR)))
      .filter((neighbor) => neighbor?.rail)
      .map((neighbor) => this.hexPositions.get(neighbor.id))
      .filter(Boolean);
    const stationRailDirection = railNeighborPositions[0]?.clone().sub(base);
    const railDirection = IsFeature(hex, "RailStation") && stationRailDirection
      ? stationRailDirection
      : railNeighborPositions.length >= 2
        ? railNeighborPositions.at(-1).clone().sub(railNeighborPositions[0])
      : railNeighborPositions[0]?.clone().sub(base)
        ?? new THREE.Vector3(1, 0, 0);
    railDirection.y = 0;
    if (railDirection.lengthSq() < 0.001) railDirection.set(1, 0, 0);
    railDirection.normalize();
    const railSide = new THREE.Vector3(-railDirection.z, 0, railDirection.x);
    const damageCenter = base.clone().addScaledVector(
      railDirection,
      IsFeature(hex, "RailStation") ? 0.46 : 0,
    );

    const scorchMaterial = new THREE.MeshStandardMaterial({
      color: 0x2f2c28,
      roughness: 1,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
    });
    const scorch = new THREE.Mesh(new THREE.CircleGeometry(0.5, 18), scorchMaterial);
    scorch.rotation.x = -Math.PI / 2;
    scorch.scale.set(1.08, 0.72, 1);
    scorch.position.set(damageCenter.x, height + 0.073, damageCenter.z);
    scorch.renderOrder = 12;
    scorch.name = `SabotageScorchedTrackBed_${hex.id}`;
    this.effectGroup.add(scorch);

    [-1, 1].forEach((endDirection) => {
      [-1, 1].forEach((railLane) => {
        const intactEnd = damageCenter.clone()
          .addScaledVector(railDirection, endDirection * 0.52)
          .addScaledVector(railSide, railLane * World3DVisualProfile.railGaugeOffset);
        intactEnd.y = height + 0.01;
        const tornEnd = damageCenter.clone()
          .addScaledVector(railDirection, endDirection * 0.06)
          .addScaledVector(
            railSide,
            railLane * World3DVisualProfile.railGaugeOffset
              + endDirection * railLane * 0.1,
          );
        tornEnd.y = height + 0.13 + (railLane > 0 ? 0.035 : 0);
        const beam = new THREE.Mesh(this.lineGeometry, this.materials.railDamaged);
        ComposeLineMatrix(
          intactEnd,
          tornEnd,
          World3DVisualProfile.railWidth * 1.35,
          0.052,
          0.035,
        ).decompose(beam.position, beam.quaternion, beam.scale);
        beam.castShadow = true;
        beam.receiveShadow = true;
        beam.name = `SabotageTwistedRail_${hex.id}_${endDirection}_${railLane}`;
        this.effectGroup.add(beam);
      });
    });

    for (let index = -2; index <= 2; index += 1) {
      const sleeper = new THREE.Mesh(
        new THREE.BoxGeometry(0.48, 0.04, 0.075),
        this.materials.railSleeper,
      );
      sleeper.position.copy(damageCenter)
        .addScaledVector(railDirection, index * 0.13)
        .addScaledVector(railSide, ((index % 2) - 0.5) * 0.24);
      sleeper.position.y = height + 0.095 + Math.abs(index) * 0.012;
      sleeper.rotation.y = Math.atan2(railDirection.x, railDirection.z)
        + Math.PI / 2
        + index * 0.19;
      sleeper.rotation.z = index * 0.045;
      sleeper.castShadow = true;
      sleeper.receiveShadow = true;
      sleeper.name = `SabotageBrokenSleeper_${hex.id}_${index + 3}`;
      this.effectGroup.add(sleeper);
    }

    const ballastGeometry = new THREE.DodecahedronGeometry(0.045, 0);
    const ballastMaterial = new THREE.MeshStandardMaterial({
      color: 0x4a4640,
      roughness: 1,
      flatShading: true,
    });
    const ballastCount = 14;
    const ballast = new THREE.InstancedMesh(ballastGeometry, ballastMaterial, ballastCount);
    for (let index = 0; index < ballastCount; index += 1) {
      const angle = HashNoise(index, hex.q, 243) * Math.PI * 2;
      const distance = 0.25 + HashNoise(index, hex.r, 244) * 0.39;
      this.animationDummy.position.set(
        damageCenter.x + Math.cos(angle) * distance,
        height + 0.085 + HashNoise(index, hex.q, 245) * 0.045,
        damageCenter.z + Math.sin(angle) * distance,
      );
      this.animationDummy.rotation.set(angle * 0.3, angle, angle * 0.17);
      this.animationDummy.scale.setScalar(0.7 + HashNoise(index, hex.r, 246) * 0.8);
      this.animationDummy.updateMatrix();
      ballast.setMatrixAt(index, this.animationDummy.matrix);
    }
    ballast.instanceMatrix.needsUpdate = true;
    ballast.castShadow = true;
    ballast.receiveShadow = true;
    ballast.name = `SabotageScatteredBallast_${hex.id}`;
    this.effectGroup.add(ballast);
  }

  RebuildFog() {
    ClearGroup(this.fogGroup, this.sharedGeometries, this.sharedMaterials);
    const hiddenHexes = (this.state.hexes ?? []).filter((hex) => hex.visible === false);
    if (hiddenHexes.length) {
      const geometry = new THREE.RingGeometry(0.932, 0.955, 6, 1, Math.PI / 6);
      const mesh = new THREE.InstancedMesh(geometry, this.fogMaterial, hiddenHexes.length);
      const matrix = new THREE.Matrix4();
      const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
      hiddenHexes.forEach((hex, index) => {
        const position = this.hexPositions.get(hex.id)?.clone() ?? HexToWorld(hex.q, hex.r);
        position.y = (this.terrainHeights.get(hex.id) ?? 0) + 0.045;
        matrix.compose(position, quaternion, new THREE.Vector3(1, 1, 1));
        mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.name = "PaperMapFogInstanced";
      mesh.renderOrder = 11;
      this.fogGroup.add(mesh);
    }
    this.dirty.fog = false;
    this.objectCounts.fog = MeasureObjectGroup(this.fogGroup);
  }

  RebuildUnits() {
    const previousPositions = new Map();
    this.unitVisuals.forEach((visual, unitId) => previousPositions.set(unitId, visual.position.clone()));
    ClearGroup(this.unitGroup, this.sharedGeometries, this.sharedMaterials);
    this.unitVisuals.clear();
    this.unitPedestalBatches = [];
    const units = [
      ...(this.state.units ?? []).map((unit) => ({ ...unit, enemy: false })),
      ...(this.state.enemies ?? [])
        .filter((unit) => unit.active !== false && unit.visible !== false)
        .map((unit) => ({ ...unit, enemy: true })),
    ];
    const enemyCountByHex = new Map();
    const unitCountByHex = new Map();
    units.forEach((unit) => {
      unitCountByHex.set(unit.hexId, (unitCountByHex.get(unit.hexId) ?? 0) + 1);
    });
    units.filter((unit) => unit.enemy).forEach((unit) => {
      enemyCountByHex.set(unit.hexId, (enemyCountByHex.get(unit.hexId) ?? 0) + 1);
    });
    const enemySeenByHex = new Map();
    const perHex = new Map();
    const formationSlotsByHex = new Map();
    units.forEach((unit) => {
      const index = perHex.get(unit.hexId) ?? 0;
      perHex.set(unit.hexId, index + 1);
      const base = this.hexPositions.get(unit.hexId);
      if (!base) return;
      const height = this.terrainHeights.get(unit.hexId) ?? 0;
      const hex = this.hexById.get(unit.hexId);
      if (!formationSlotsByHex.has(unit.hexId)) {
        formationSlotsByHex.set(unit.hexId, ComputeFormationSlots(
          unitCountByHex.get(unit.hexId) ?? 1,
          Boolean(hex?.feature),
          HashNoise(hex?.q ?? 0, hex?.r ?? 0, 188),
        ));
      }
      const slot = formationSlotsByHex.get(unit.hexId)[index] ?? new THREE.Vector2(0.68, 0);
      const offsetAngle = Math.atan2(slot.y, slot.x);
      const target = new THREE.Vector3(
        base.x + slot.x,
        height + 0.055,
        base.z + slot.y,
      );
      let markerLabel = null;
      if (unit.enemy) {
        const enemyIndex = enemySeenByHex.get(unit.hexId) ?? 0;
        enemySeenByHex.set(unit.hexId, enemyIndex + 1);
        const enemyCount = enemyCountByHex.get(unit.hexId) ?? 1;
        markerLabel = enemyIndex === 0
          ? (enemyCount > 1 ? `敌×${enemyCount}` : "敌")
          : false;
      }
      const miniature = CreateUnitMiniature(
        unit,
        unit.enemy,
        this.materials,
        this.CreateModelInstance,
        unit.id === this.view?.selectedUnitId,
        markerLabel,
      );
      miniature.rotation.y = -offsetAngle + Math.PI * 0.5;
      const unitLabel = miniature.children.find((child) => child.userData?.mapLabel);
      if (unitLabel) {
        const labelLane = index % 3;
        unitLabel.position.x = (labelLane - 1) * World3DVisualProfile.unitLabelLaneSpacing;
        unitLabel.position.y = World3DVisualProfile.unitLabelBaseHeight
          + labelLane * 0.11
          + Math.floor(index / 3) * 0.25;
        unitLabel.position.z = labelLane === 1 ? -0.08 : 0.04;
        unitLabel.renderOrder = 31 + index;
        unitLabel.userData.labelLane = labelLane;
        const unitType = String(unit.type ?? "").toLowerCase();
        unitLabel.userData.labelPriority = unit.id === this.view?.selectedUnitId
          ? 150
          : unit.enemy
            ? 130
            : ({ mainforce: 126, guerrilla: 123, militia: 120, workteam: 117, courier: 114 }[unitType] ?? 112);
        unitLabel.userData.labelKind = "unit";
        unitLabel.userData.labelKey = `Unit_${unit.id}`;
        unitLabel.userData.labelAnchorLocal = unitLabel.position.clone();
      }
      const previous = previousPositions.get(unit.id);
      miniature.position.copy(previous ?? target);
      miniature.userData.unitId = unit.id;
      miniature.userData.hexId = unit.hexId;
      miniature.userData.targetPosition = target;
      miniature.userData.startPosition = miniature.position.clone();
      miniature.userData.moveElapsed = 0;
      miniature.userData.moveDuration = this.reducedMotion ? 0 : World3DQualityProfile.movementDuration;
      miniature.userData.idlePhase = HashNoise(unit.id?.length ?? 1, index, 64) * Math.PI * 2;
      this.unitGroup.add(miniature);
      this.unitVisuals.set(unit.id, miniature);
    });
    [false, true].forEach((enemy) => {
      const sideUnits = units.filter((unit) => unit.enemy === enemy && this.unitVisuals.has(unit.id));
      if (!sideUnits.length) return;
      const batch = new THREE.InstancedMesh(
        this.unitPedestalGeometry,
        enemy ? this.materials.enemyPedestal : this.materials.playerPedestal,
        sideUnits.length,
      );
      batch.userData.unitIds = sideUnits.map((unit) => unit.id);
      batch.name = enemy ? "EnemyMiniaturePedestalsInstanced" : "PlayerMiniaturePedestalsInstanced";
      batch.receiveShadow = true;
      batch.renderOrder = 9;
      this.unitGroup.add(batch);
      this.unitPedestalBatches.push(batch);
    });
    this.UpdateUnitPedestalBatches();
    this.dirty.units = false;
    this.objectCounts.units = MeasureObjectGroup(this.unitGroup);
    if (this.currentViewHeight) {
      this.UpdateLabelScreenScale(this.currentViewHeight);
      this.ResolveMapLabelLayout();
    }
  }

  GetWarningApproachVector(hex) {
    const target = this.hexPositions.get(hex.id);
    if (!target) return new THREE.Vector3(-1, 0, 0);
    const visibleSources = (this.state.enemies ?? [])
      .filter((enemy) => enemy.active !== false && enemy.visible !== false)
      .map((enemy) => this.hexPositions.get(enemy.hexId))
      .filter(Boolean)
      .sort((first, second) => first.distanceToSquared(target) - second.distanceToSquared(target));
    const source = visibleSources[0] ?? new THREE.Vector3(
      this.worldBounds?.maxX ?? target.x + 1,
      target.y,
      this.worldBounds?.centerZ ?? target.z,
    );
    const approach = target.clone().sub(source);
    approach.y = 0;
    if (approach.lengthSq() < 0.001) approach.set(-1, 0, 0);
    return approach.normalize();
  }

  AddWarningIndicator(hex) {
    const base = this.hexPositions.get(hex.id);
    if (!base) return;
    const height = this.terrainHeights.get(hex.id) ?? 0;
    const intensity = Clamp(Number(hex.warning?.intensity) || 1, 1, 3);
    const segmentCount = 9 + intensity * 3;
    const radius = 0.61 + intensity * 0.035;
    const group = new THREE.Group();
    group.position.set(base.x, height + 0.115, base.z);
    group.userData.warning = true;
    group.userData.intensity = intensity;
    group.userData.baseScale = 1;
    group.userData.hexId = hex.id;

    const warningColor = intensity >= 3 ? 0xff4935 : intensity === 2 ? 0xee5a3d : 0xd96745;
    const dashMaterial = new THREE.MeshBasicMaterial({
      color: warningColor,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      toneMapped: false,
    });
    dashMaterial.userData.baseOpacity = dashMaterial.opacity;
    const dashes = new THREE.InstancedMesh(this.warningDashGeometry, dashMaterial, segmentCount);
    const dummy = new THREE.Object3D();
    for (let index = 0; index < segmentCount; index += 1) {
      const angle = (index / segmentCount) * Math.PI * 2;
      dummy.position.set(Math.cos(angle) * radius, 0, -Math.sin(angle) * radius);
      dummy.rotation.set(0, angle + Math.PI / 2, 0);
      dummy.scale.set(0.76 + intensity * 0.08, 1, 1);
      dummy.updateMatrix();
      dashes.setMatrixAt(index, dummy.matrix);
    }
    dashes.instanceMatrix.needsUpdate = true;
    dashes.renderOrder = 15;
    dashes.name = `SweepWarningSegments_${hex.id}`;
    group.add(dashes);

    const approach = this.GetWarningApproachVector(hex);
    const arrowMaterial = new THREE.MeshBasicMaterial({
      color: 0xffd080,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    arrowMaterial.userData.baseOpacity = arrowMaterial.opacity;
    const arrow = new THREE.Mesh(this.warningArrowGeometry, arrowMaterial);
    arrow.position.copy(approach).multiplyScalar(-(radius + 0.18));
    arrow.position.y = 0.025;
    arrow.rotation.y = Math.atan2(approach.x, approach.z);
    arrow.scale.setScalar(0.9 + intensity * 0.13);
    arrow.renderOrder = 16;
    arrow.name = `SweepApproach_${hex.id}`;
    group.add(arrow);

    group.userData.warningMaterials = [dashMaterial, arrowMaterial];
    group.userData.arrow = arrow;
    this.overlayGroup.add(group);
    this.warningObjects.push(group);
  }

  RebuildOverlay() {
    ClearGroup(this.overlayGroup, this.sharedGeometries, this.sharedMaterials);
    this.warningObjects = [];
    this.AddControlOverlays();
    const AddRing = (hexId, color, radius, opacity) => {
      const base = this.hexPositions.get(hexId);
      if (!base) return null;
      const height = this.terrainHeights.get(hexId) ?? 0;
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.02, 6, 36), material);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(base.x, height + 0.105, base.z);
      ring.renderOrder = 15;
      ring.userData.baseOpacity = opacity;
      ring.userData.hexId = hexId;
      this.overlayGroup.add(ring);
      return ring;
    };
    if (this.view?.selectedHexId) AddRing(this.view.selectedHexId, 0xffdfa0, 0.74, 0.72);
    (this.view?.reachableHexIds ?? []).forEach((hexId) => AddRing(hexId, 0x91bc76, 0.7, 0.16));
    (this.state.hexes ?? []).filter((hex) => hex.warning).forEach((hex) => this.AddWarningIndicator(hex));
    if (this.view?.mapLayer === "construction") {
      (this.state.hexes ?? []).filter((hex) => hex.institution || hex.improvement || hex.construction).forEach((hex) => {
        const ring = AddRing(hex.id, 0xc39c5d, 0.53, 0.12);
        if (ring) ring.scale.setScalar(0.92);
      });
    }
    this.dirty.overlay = false;
    this.objectCounts.overlay = MeasureObjectGroup(this.overlayGroup);
  }

  AddControlOverlays() {
    const groups = new Map();
    (this.state.hexes ?? []).forEach((hex) => {
      if (hex.visible === false) return;
      const control = String(hex.control ?? "neutral").toLowerCase();
      if (control === "neutral" || controlColors[control] == null) return;
      if (!groups.has(control)) groups.set(control, []);
      groups.get(control).push(hex);
    });
    const opacityByControl = {
      player: 0.1,
      base: 0.1,
      network: 0.08,
      enemy: 0.1,
      occupied: 0.11,
      contested: 0.12,
    };
    const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0));
    const scale = new THREE.Vector3(1, 1, 1);
    groups.forEach((hexes, control) => {
      const geometry = new THREE.TorusGeometry(
        0.875,
        World3DVisualProfile.controlBorderWidth,
        6,
        36,
      );
      const material = new THREE.MeshBasicMaterial({
        color: controlColors[control],
        transparent: true,
        opacity: opacityByControl[control] ?? 0.1,
        depthWrite: false,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
      });
      const mesh = new THREE.InstancedMesh(geometry, material, hexes.length);
      const matrix = new THREE.Matrix4();
      hexes.forEach((hex, index) => {
        const base = this.hexPositions.get(hex.id);
        const height = this.terrainHeights.get(hex.id) ?? 0;
        matrix.compose(
          new THREE.Vector3(base.x, height + 0.085, base.z),
          quaternion,
          scale,
        );
        mesh.setMatrixAt(index, matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
      mesh.name = `ControlOverlay_${control}`;
      mesh.renderOrder = 12;
      this.overlayGroup.add(mesh);
    });
  }

  UpdateWorldBounds() {
    const positions = [...this.hexPositions.values()];
    if (!positions.length) {
      this.worldBounds = { minX: -4, maxX: 4, minZ: -3, maxZ: 3, centerX: 0, centerZ: 0 };
      return;
    }
    const minX = Math.min(...positions.map((position) => position.x)) - 1.3;
    const maxX = Math.max(...positions.map((position) => position.x)) + 1.3;
    const minZ = Math.min(...positions.map((position) => position.z)) - 1.3;
    const maxZ = Math.max(...positions.map((position) => position.z)) + 1.3;
    this.worldBounds = {
      minX, maxX, minZ, maxZ,
      centerX: (minX + maxX) / 2,
      centerZ: (minZ + maxZ) / 2,
    };
  }

  ApplyView(cameraState = {}) {
    const bounds = this.worldBounds ?? { minX: -4, maxX: 4, minZ: -3, maxZ: 3, centerX: 0, centerZ: 0 };
    const zoom = Clamp(Number(cameraState.zoom) || 1, 0.65, 2.25);
    const fitScale = Math.max(0.001, Number(cameraState.fitScale) || 1);
    const panUnit = 42 * fitScale * zoom;
    this.cameraFitTarget = new THREE.Vector3(bounds.centerX, 0, bounds.centerZ);
    const target = new THREE.Vector3(
      bounds.centerX - (Number(cameraState.panX) || 0) / panUnit,
      0,
      bounds.centerZ - (Number(cameraState.panY) || 0) / panUnit,
    );
    this.cameraTarget = target;
    this.cameraOffset = new THREE.Vector3(7.6, 13.2, 18.2).normalize().multiplyScalar(23.5);
    this.camera.position.copy(target).add(this.cameraOffset);
    this.camera.lookAt(target);
    this.camera.updateMatrixWorld(true);
    this.UpdateProjection(zoom);
  }

  MeasureProjectedMapBounds() {
    if (!this.hexPositions.size || !this.cameraFitTarget || !this.cameraOffset) return null;
    const cameraRight = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0).normalize();
    const cameraUp = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1).normalize();
    const fitCameraPosition = this.cameraFitTarget.clone().add(this.cameraOffset);
    const unitHexIds = new Set([
      ...(this.state?.units ?? []).map((unit) => unit.hexId),
      ...(this.state?.enemies ?? []).map((unit) => unit.hexId),
    ]);
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    const IncludePoint = (point) => {
      const relative = point.clone().sub(fitCameraPosition);
      const projectedX = relative.dot(cameraRight);
      const projectedY = relative.dot(cameraUp);
      minX = Math.min(minX, projectedX);
      maxX = Math.max(maxX, projectedX);
      minY = Math.min(minY, projectedY);
      maxY = Math.max(maxY, projectedY);
    };
    this.hexPositions.forEach((base, hexId) => {
      const hex = this.hexById.get(hexId);
      const height = this.terrainHeights.get(hexId) ?? 0;
      const top = height + (hex?.feature
        ? 0.92
        : unitHexIds.has(hexId)
          ? 0.78
          : 0.24);
      IncludePoint(new THREE.Vector3(base.x - 1.02, height, base.z));
      IncludePoint(new THREE.Vector3(base.x + 1.02, height, base.z));
      IncludePoint(new THREE.Vector3(base.x, height, base.z - 1.02));
      IncludePoint(new THREE.Vector3(base.x, height, base.z + 1.02));
      IncludePoint(new THREE.Vector3(base.x, top, base.z));
    });
    if (![minX, maxX, minY, maxY].every(Number.isFinite)) return null;
    return { minX, maxX, minY, maxY };
  }

  UpdateLabelScreenScale(viewHeight) {
    const canvasHeight = Number(this.canvas?.clientHeight) || 0;
    if (canvasHeight < 40) return;
    [this.structureGroup, this.unitGroup].forEach((group) => {
      group?.traverse((object) => {
        const aspect = Number(object.userData?.labelAspect);
        const baseHeight = Number(object.userData?.labelBaseWorldHeight);
        if (!object.isSprite || !aspect || !baseHeight) return;
        const minimumPixels = Number(object.userData.minimumScreenPixels)
          || World3DVisualProfile.minimumLabelScreenPixels;
        const maximumPixels = Number(object.userData.maximumScreenPixels)
          || World3DVisualProfile.maximumStructureLabelScreenPixels;
        const minimumWorldHeight = minimumPixels * viewHeight / canvasHeight;
        const maximumWorldHeight = maximumPixels * viewHeight / canvasHeight;
        const labelHeight = Math.min(
          Math.max(baseHeight, minimumWorldHeight),
          Math.max(minimumWorldHeight, maximumWorldHeight),
        );
        object.scale.set(labelHeight * aspect, labelHeight, 1);
      });
    });
  }

  ResolveMapLabelLayout() {
    const canvasWidth = Number(this.canvas?.clientWidth) || 0;
    const canvasHeight = Number(this.canvas?.clientHeight) || 0;
    if (canvasWidth < 80 || canvasHeight < 80 || !this.currentViewHeight) return;
    ClearGroup(this.labelLeaderGroup, this.sharedGeometries, this.sharedMaterials);
    this.labelLeaders = [];
    this.scene.updateMatrixWorld(true);
    const worldPerPixel = this.currentViewHeight / canvasHeight;
    const cameraRight = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 0).normalize();
    const cameraUp = new THREE.Vector3().setFromMatrixColumn(this.camera.matrixWorld, 1).normalize();
    const labels = [];
    [this.structureGroup, this.unitGroup].forEach((group) => group?.traverse((object) => {
      if (!object.isSprite || !object.userData?.labelAnchorLocal) return;
      labels.push(object);
    }));
    labels.sort((first, second) =>
      (Number(second.userData.labelPriority) || 0) - (Number(first.userData.labelPriority) || 0)
      || String(first.userData.labelKey).localeCompare(String(second.userData.labelKey)));
    const occupied = [];
    const safeRect = {
      left: 8,
      right: canvasWidth - 58,
      top: 66,
      bottom: canvasHeight - 54,
    };
    const worldPosition = new THREE.Vector3();
    const projected = new THREE.Vector3();
    const modelOccupied = [...this.unitVisuals.values()].map((visual) => {
      worldPosition.copy(visual.position);
      worldPosition.y += 0.48;
      projected.copy(worldPosition).project(this.camera);
      const centerX = (projected.x * 0.5 + 0.5) * canvasWidth;
      const centerY = (-projected.y * 0.5 + 0.5) * canvasHeight;
      return {
        left: centerX - 18,
        right: centerX + 18,
        top: centerY - 24,
        bottom: centerY + 24,
      };
    });
    const featureCandidates = [
      [0, 0], [0, -28], [0, 30], [44, -18], [-44, -18], [48, 22], [-48, 22],
      [0, -54], [66, -34], [-66, -34], [68, 32], [-68, 32], [0, 58],
    ];
    const unitCandidates = [
      [0, 0], [26, -24], [-26, -24], [38, 0], [-38, 0], [28, 26], [-28, 26],
      [0, -42], [52, -32], [-52, -32], [54, 24], [-54, 24], [0, 46],
    ];
    const GetBox = (label) => {
      label.updateWorldMatrix(true, false);
      label.getWorldPosition(worldPosition);
      projected.copy(worldPosition).project(this.camera);
      const centerX = (projected.x * 0.5 + 0.5) * canvasWidth;
      const centerY = (-projected.y * 0.5 + 0.5) * canvasHeight;
      const width = Math.max(20, label.scale.x / worldPerPixel);
      const height = Math.max(20, label.scale.y / worldPerPixel);
      return {
        left: centerX - width / 2 - 3,
        right: centerX + width / 2 + 3,
        top: centerY - height / 2 - 3,
        bottom: centerY + height / 2 + 3,
      };
    };
    const Intersects = (first, second) =>
      first.left < second.right && first.right > second.left
      && first.top < second.bottom && first.bottom > second.top;
    const FitsSafeRect = (box) =>
      box.left >= safeRect.left
      && box.right <= safeRect.right
      && box.top >= safeRect.top
      && box.bottom <= safeRect.bottom;
    const OverlapArea = (first, second) => Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left))
      * Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
    labels.forEach((label) => {
      label.visible = true;
      const anchor = label.userData.labelAnchorLocal;
      const candidates = label.userData.labelKind === "unit" ? unitCandidates : featureCandidates;
      let chosen = null;
      let chosenBox = null;
      let leastOverlap = Infinity;
      candidates.forEach(([offsetX, offsetY]) => {
        const offset = cameraRight.clone().multiplyScalar(offsetX * worldPerPixel)
          .addScaledVector(cameraUp, -offsetY * worldPerPixel);
        label.position.copy(anchor).add(offset);
        const box = GetBox(label);
        if (!FitsSafeRect(box)) return;
        const overlap = [...occupied, ...modelOccupied]
          .reduce((total, other) => total + OverlapArea(box, other), 0);
        if (overlap < leastOverlap) {
          leastOverlap = overlap;
          chosen = label.position.clone();
          chosenBox = box;
        }
        if (overlap === 0) leastOverlap = -1;
      });
      if (!chosen || (leastOverlap > 0 && Number(label.userData.labelPriority) < 120)) {
        label.visible = false;
        label.position.copy(anchor);
        return;
      }
      label.position.copy(chosen ?? anchor);
      if (chosenBox) occupied.push(chosenBox);
      if (
        label.userData.labelKind === "feature"
        && label.position.distanceTo(anchor) > worldPerPixel * 18
        && label.parent
      ) {
        label.parent.updateWorldMatrix(true, false);
        const anchorWorld = label.parent.localToWorld(anchor.clone());
        label.updateWorldMatrix(true, false);
        const labelWorld = new THREE.Vector3();
        label.getWorldPosition(labelWorld);
        const leaderGeometry = new THREE.BufferGeometry().setFromPoints([
          anchorWorld,
          labelWorld,
        ]);
        const leaderMaterial = new THREE.LineBasicMaterial({
          color: 0x4b463c,
          transparent: true,
          opacity: 0.56,
          depthTest: false,
          depthWrite: false,
          toneMapped: false,
        });
        const leader = new THREE.Line(leaderGeometry, leaderMaterial);
        leader.renderOrder = 25;
        leader.name = `LabelLeader_${label.userData.labelKey}`;
        this.labelLeaderGroup.add(leader);
        this.labelLeaders.push(leader);
      }
    });
    this.scene.updateMatrixWorld(true);
  }

  UpdateUnitPedestalBatches() {
    this.unitPedestalBatches.forEach((batch) => {
      (batch.userData.unitIds ?? []).forEach((unitId, index) => {
        const visual = this.unitVisuals.get(unitId);
        if (!visual) return;
        this.animationDummy.position.set(visual.position.x, visual.position.y - 0.025, visual.position.z);
        this.animationDummy.quaternion.identity();
        this.animationDummy.scale.setScalar(1);
        this.animationDummy.updateMatrix();
        batch.setMatrixAt(index, this.animationDummy.matrix);
      });
      batch.instanceMatrix.needsUpdate = true;
    });
  }

  UpdateProjection(zoom = 1) {
    const aspect = Math.max(0.4, this.canvas.clientWidth / Math.max(1, this.canvas.clientHeight));
    const projected = this.MeasureProjectedMapBounds();
    const projectedWidth = projected ? Math.max(5, projected.maxX - projected.minX) : 9;
    const projectedHeight = projected ? Math.max(4, projected.maxY - projected.minY) : 6;
    const fittedWidth = Math.max(
      projectedWidth / World3DVisualProfile.cameraHorizontalCoverage,
      projectedHeight * aspect / World3DVisualProfile.cameraVerticalCoverage,
    );
    const viewWidth = fittedWidth / Math.max(0.001, zoom);
    const viewHeight = viewWidth / aspect;
    const centerX = projected ? (projected.minX + projected.maxX) / 2 : 0;
    const centerY = projected ? (projected.minY + projected.maxY) / 2 : 0;
    const compositionLift = viewHeight * 10 / Math.max(1, this.canvas.clientHeight);
    this.camera.left = centerX - viewWidth / 2;
    this.camera.right = centerX + viewWidth / 2;
    this.camera.top = centerY - compositionLift + viewHeight / 2;
    this.camera.bottom = centerY - compositionLift - viewHeight / 2;
    this.camera.updateProjectionMatrix();
    this.currentViewHeight = viewHeight;
    this.UpdateLabelScreenScale(viewHeight);
    this.ResolveMapLabelLayout();
  }

  Resize() {
    const width = Math.max(1, Math.round(this.canvas.clientWidth));
    const height = Math.max(1, Math.round(this.canvas.clientHeight));
    const dpr = GetWorld3DDpr(width, window.devicePixelRatio || 1);
    let changed = false;
    if (this.renderer.getPixelRatio() !== dpr) {
      this.renderer.setPixelRatio(dpr);
      changed = true;
    }
    if (!this.renderer.shadowMap.enabled) {
      this.renderer.shadowMap.enabled = true;
      if (this.sunLight?.shadow) this.sunLight.shadow.needsUpdate = true;
      changed = true;
    }
    const targetWidth = Math.round(width * dpr);
    const targetHeight = Math.round(height * dpr);
    if (this.canvas.width !== targetWidth || this.canvas.height !== targetHeight) {
      this.renderer.setSize(width, height, false);
      this.UpdateProjection(Number(this.view?.camera?.zoom) || 1);
      changed = true;
    }
    this.resizePending = false;
    if (changed) this.renderRequested = true;
    return changed;
  }

  GetActionEffectDirection(effectData, targetPosition, targetHex) {
    const unitKey = effectData?.unitId;
    const unitVisual = this.unitVisuals.get(unitKey) ?? this.unitVisuals.get(String(unitKey ?? ""));
    const sourceHexKey = effectData?.sourceHexId;
    const sourcePosition = unitVisual?.userData?.targetPosition
      ?? unitVisual?.position
      ?? this.hexPositions.get(sourceHexKey)
      ?? this.hexPositions.get(String(sourceHexKey ?? ""));
    if (sourcePosition) {
      const direction = targetPosition.clone().sub(sourcePosition);
      direction.y = 0;
      if (direction.lengthSq() > 0.001) return direction.normalize();
    }
    const angle = HashNoise(targetHex?.q ?? 0, targetHex?.r ?? 0, 97) * Math.PI * 2;
    return new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle));
  }

  GetActionEffectTargetPosition(actionId, targetHex) {
    const fallback = this.hexPositions.get(targetHex.id)?.clone()
      ?? HexToWorld(targetHex.q, targetHex.r);
    if (actionId !== "ambush") return fallback;
    const enemyPositions = (this.state.enemies ?? [])
      .filter((enemy) => enemy.active !== false
        && enemy.visible !== false
        && String(enemy.hexId) === String(targetHex.id))
      .map((enemy) => this.unitVisuals.get(enemy.id))
      .filter(Boolean)
      .map((visual) => visual.userData?.targetPosition?.clone() ?? visual.position.clone());
    if (!enemyPositions.length) return fallback;
    return enemyPositions
      .reduce((sum, position) => sum.add(position), new THREE.Vector3())
      .multiplyScalar(1 / enemyPositions.length);
  }

  CreateTransientActionSmoke(actionId, targetHex, options) {
    const count = Math.max(1, Math.floor(Number(options.count) || 1));
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const seeds = new Float32Array(count);
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(options.color) },
        uOpacity: { value: Number(options.opacity) || 0.5 },
      },
      vertexShader: `
        attribute float aSize;
        attribute float aSeed;
        varying float vSeed;
        void main() {
          vSeed = aSeed;
          vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * viewPosition;
          gl_PointSize = clamp(aSize * abs(projectionMatrix[1][1]) * 340.0, 4.0, 92.0);
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform float uOpacity;
        varying float vSeed;
        void main() {
          vec2 centered = gl_PointCoord - vec2(0.5);
          float radius = length(centered) * 2.0;
          float contour = radius
            + sin((centered.x + vSeed) * 15.0) * 0.055
            + sin((centered.y - vSeed) * 19.0) * 0.045;
          float softMask = 1.0 - smoothstep(0.34, 1.0, contour);
          float innerBreakup = 0.84
            + sin((gl_PointCoord.x + vSeed) * 31.0)
              * sin((gl_PointCoord.y - vSeed) * 27.0) * 0.12;
          float verticalFade = mix(0.82, 1.0, 1.0 - gl_PointCoord.y);
          float alpha = uOpacity * softMask * innerBreakup * verticalFade;
          if (alpha < 0.012) discard;
          vec3 smokeColor = mix(uColor * 0.72, uColor * 1.08, (1.0 - radius) * 0.42);
          gl_FragColor = vec4(smokeColor, alpha);
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
    });
    material.userData.baseOpacity = options.opacity;
    const batch = new THREE.Points(geometry, material);
    const smokeInstances = [];
    for (let index = 0; index < count; index += 1) {
      const angle = HashNoise(index, targetHex?.q ?? 0, 101) * Math.PI * 2;
      const distance = (0.12 + HashNoise(index, targetHex?.r ?? 0, 102) * 0.88) * options.spread;
      const smoke = {
        baseX: Math.cos(angle) * distance,
        baseY: options.baseY + HashNoise(index, count, 103) * options.heightVariation,
        baseZ: Math.sin(angle) * distance,
        seed: HashNoise(index, count, 104) * Math.PI * 2,
        size: options.minimumScale + HashNoise(index, targetHex?.q ?? 0, 105) * options.scaleVariation,
      };
      smokeInstances.push(smoke);
      positions[index * 3] = smoke.baseX;
      positions[index * 3 + 1] = smoke.baseY;
      positions[index * 3 + 2] = smoke.baseZ;
      sizes[index] = smoke.size * (options.geometryRadius ?? 0.11) * 5.4;
      seeds[index] = smoke.seed;
    }
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
    geometry.computeBoundingSphere();
    batch.frustumCulled = false;
    batch.renderOrder = 31;
    batch.name = `${actionId === "ambush" ? "AmbushContactDust" : "SabotageActionSmoke"}SoftParticles`;
    batch.userData.actionSmokeInstances = smokeInstances;
    batch.userData.baseSizes = sizes.slice();
    return batch;
  }

  CreateAmbushActionEffect(effectData, targetHex, targetPosition, direction) {
    const root = new THREE.Group();
    root.position.copy(targetPosition);
    const unitVisual = this.unitVisuals.get(effectData?.unitId)
      ?? this.unitVisuals.get(String(effectData?.unitId ?? ""));
    const sourcePosition = unitVisual?.userData?.targetPosition
      ?? unitVisual?.position
      ?? this.hexPositions.get(effectData?.sourceHexId)
      ?? this.hexPositions.get(String(effectData?.sourceHexId ?? ""));
    const measuredRange = sourcePosition
      ? sourcePosition.clone().setY(0).distanceTo(targetPosition.clone().setY(0))
      : 0;
    const contactRange = Clamp(measuredRange, 0.95, 1.62);
    const muzzleGeometry = new THREE.ConeGeometry(0.055, 0.24, 6, 1, false);
    const muzzleMaterial = new THREE.MeshBasicMaterial({
      color: 0xffd79a,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
    });
    muzzleMaterial.userData.baseOpacity = 0.78;
    const muzzleBatch = new THREE.InstancedMesh(
      muzzleGeometry,
      muzzleMaterial,
      World3DActionEffectProfile.ambushMuzzleFlashCount,
    );
    const side = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
    const upwardAxis = new THREE.Vector3(0, 1, 0);
    for (let index = 0; index < World3DActionEffectProfile.ambushMuzzleFlashCount; index += 1) {
      const lane = index - (World3DActionEffectProfile.ambushMuzzleFlashCount - 1) / 2;
      const flashDirection = direction.clone().addScaledVector(side, lane * 0.045).setY(0.035).normalize();
      this.animationDummy.position.copy(direction).multiplyScalar(-contactRange * (0.82 + index * 0.012));
      this.animationDummy.position.addScaledVector(side, lane * 0.17);
      this.animationDummy.position.y = 0.3 + Math.abs(lane) * 0.026;
      this.animationDummy.quaternion.setFromUnitVectors(upwardAxis, flashDirection);
      this.animationDummy.scale.set(
        0.94 + index * 0.055,
        1.05 + index * 0.035,
        0.94 + index * 0.055,
      );
      this.animationDummy.updateMatrix();
      muzzleBatch.setMatrixAt(index, this.animationDummy.matrix);
    }
    muzzleBatch.instanceMatrix.needsUpdate = true;
    muzzleBatch.frustumCulled = false;
    muzzleBatch.renderOrder = 34;
    muzzleBatch.name = "AmbushDirectionalMuzzleFlashesInstanced";
    root.add(muzzleBatch);

    const tracerGeometry = new THREE.BoxGeometry(0.011, 0.011, 1);
    const tracerMaterial = new THREE.MeshBasicMaterial({
      color: 0xffd9a0,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
    });
    tracerMaterial.userData.baseOpacity = 0.48;
    const tracerCount = 3;
    const tracerBatch = new THREE.InstancedMesh(tracerGeometry, tracerMaterial, tracerCount);
    const tracerRotation = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      direction,
    );
    for (let index = 0; index < tracerCount; index += 1) {
      const lane = index - (tracerCount - 1) / 2;
      const tracerLength = contactRange * (0.7 + (index % 2) * 0.08);
      const midpointDistance = contactRange * (0.46 + index * 0.018);
      this.animationDummy.position.copy(direction).multiplyScalar(-midpointDistance);
      this.animationDummy.position.addScaledVector(side, lane * 0.1);
      this.animationDummy.position.y = 0.25 + Math.abs(lane) * 0.026;
      this.animationDummy.quaternion.copy(tracerRotation);
      this.animationDummy.scale.set(0.9 + index * 0.04, 1, tracerLength);
      this.animationDummy.updateMatrix();
      tracerBatch.setMatrixAt(index, this.animationDummy.matrix);
    }
    tracerBatch.instanceMatrix.needsUpdate = true;
    tracerBatch.frustumCulled = false;
    tracerBatch.renderOrder = 33;
    tracerBatch.name = "AmbushShortTracerBurstsInstanced";
    root.add(tracerBatch);

    const smokeBatch = this.CreateTransientActionSmoke("ambush", targetHex, {
      count: World3DActionEffectProfile.ambushSmokeCount,
      geometryRadius: 0.18,
      color: 0x86775f,
      opacity: 0.5,
      spread: 0.84,
      baseY: 0.11,
      heightVariation: 0.42,
      minimumScale: 0.86,
      scaleVariation: 0.82,
    });
    root.add(smokeBatch);

    const debrisGeometry = new THREE.TetrahedronGeometry(0.068, 0);
    const debrisMaterial = new THREE.MeshStandardMaterial({
      color: 0x544c3f,
      roughness: 1,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    });
    debrisMaterial.userData.baseOpacity = 0.9;
    const debrisCount = 11;
    const debrisBatch = new THREE.InstancedMesh(debrisGeometry, debrisMaterial, debrisCount);
    const debrisInstances = [];
    for (let index = 0; index < debrisCount; index += 1) {
      const debrisAngle = HashNoise(index, targetHex.q, 195) * Math.PI * 2;
      const debris = {
        baseX: (HashNoise(index, targetHex.r, 196) - 0.5) * 0.38,
        baseY: 0.08 + HashNoise(index, targetHex.q, 197) * 0.14,
        baseZ: (HashNoise(index, targetHex.r, 198) - 0.5) * 0.38,
        velocity: new THREE.Vector3(
          Math.cos(debrisAngle) * (0.34 + HashNoise(index, targetHex.q, 199) * 0.38),
          0.62 + HashNoise(index, targetHex.r, 200) * 0.46,
          Math.sin(debrisAngle) * (0.34 + HashNoise(index, targetHex.q, 201) * 0.38),
        ),
        rotation: debrisAngle,
        size: 0.72 + HashNoise(index, targetHex.r, 202) * 0.62,
      };
      debrisInstances.push(debris);
      this.animationDummy.position.set(debris.baseX, debris.baseY, debris.baseZ);
      this.animationDummy.rotation.set(debris.rotation, debris.rotation * 0.7, 0);
      this.animationDummy.scale.setScalar(debris.size);
      this.animationDummy.updateMatrix();
      debrisBatch.setMatrixAt(index, this.animationDummy.matrix);
    }
    debrisBatch.instanceMatrix.needsUpdate = true;
    debrisBatch.frustumCulled = false;
    debrisBatch.renderOrder = 32;
    debrisBatch.name = "AmbushImpactEarthFragmentsInstanced";
    debrisBatch.userData.debrisInstances = debrisInstances;
    root.add(debrisBatch);

    const flashLight = new THREE.PointLight(0xffc36e, 2.2, 3.4, 2);
    flashLight.position.set(0, 0.38, 0);
    flashLight.name = "AmbushBriefWarmLight";
    flashLight.userData.baseIntensity = 2.2;
    root.add(flashLight);

    return {
      id: `ActionEffect_${++this.actionEffectSequence}`,
      actionId: "ambush",
      targetHexId: String(effectData.targetHexId),
      unitId: effectData.unitId == null ? null : String(effectData.unitId),
      elapsed: 0,
      duration: World3DActionEffectProfile.ambushDuration,
      root,
      muzzleBatch,
      tracerBatch,
      smokeBatch,
      debrisBatch,
      flashLight,
      pulseMarker: null,
      smokeRise: 0.72,
      smokeExpansion: 0.76,
      smokeFade: 0.62,
      pulseExpansion: 0.92,
      pulseFade: 0.76,
      drawCalls: 4,
    };
  }

  CreateSabotageActionEffect(effectData, targetHex, targetPosition) {
    const root = new THREE.Group();
    root.position.copy(targetPosition);
    const blastGeometry = new THREE.CircleGeometry(0.34, 9);
    const blastMaterial = new THREE.MeshBasicMaterial({
      color: 0xffb35f,
      transparent: true,
      opacity: 0.84,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    blastMaterial.userData.baseOpacity = 0.84;
    const blastCore = new THREE.Mesh(blastGeometry, blastMaterial);
    blastCore.rotation.x = -Math.PI / 2;
    blastCore.rotation.z = HashNoise(targetHex.q, targetHex.r, 236) * Math.PI;
    blastCore.scale.set(0.92, 0.68, 1);
    blastCore.position.y = 0.018;
    blastCore.renderOrder = 36;
    blastCore.name = "SabotageBriefGroundFlash";
    root.add(blastCore);

    const smokeBatch = this.CreateTransientActionSmoke("sabotage", targetHex, {
      count: World3DActionEffectProfile.sabotageSmokeCount,
      geometryRadius: 0.17,
      color: 0x716e66,
      opacity: 0.54,
      spread: 0.86,
      baseY: 0.12,
      heightVariation: 0.48,
      minimumScale: 0.84,
      scaleVariation: 0.74,
    });
    root.add(smokeBatch);

    const sparkGeometry = new THREE.ConeGeometry(0.032, 0.22, 4, 1, false);
    const sparkMaterial = new THREE.MeshBasicMaterial({
      color: 0xffc878,
      transparent: true,
      opacity: 0.78,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
    });
    sparkMaterial.userData.baseOpacity = 0.78;
    const sparkCount = 12;
    const sparkBatch = new THREE.InstancedMesh(sparkGeometry, sparkMaterial, sparkCount);
    const sparkInstances = [];
    const upwardAxis = new THREE.Vector3(0, 1, 0);
    for (let index = 0; index < sparkCount; index += 1) {
      const angle = HashNoise(index, targetHex.q, 111) * Math.PI * 2;
      const direction = new THREE.Vector3(
        Math.cos(angle) * (0.34 + HashNoise(index, targetHex.r, 112) * 0.24),
        0.7 + HashNoise(index, targetHex.q, 113) * 0.34,
        Math.sin(angle) * (0.34 + HashNoise(index, targetHex.r, 114) * 0.24),
      ).normalize();
      const spark = {
        baseX: (HashNoise(index, targetHex.q, 115) - 0.5) * 0.34,
        baseY: 0.2 + HashNoise(index, targetHex.r, 116) * 0.2,
        baseZ: (HashNoise(index, targetHex.r, 117) - 0.5) * 0.34,
        direction,
        quaternion: new THREE.Quaternion().setFromUnitVectors(upwardAxis, direction),
        size: 0.72 + HashNoise(index, targetHex.q + targetHex.r, 118) * 0.34,
      };
      sparkInstances.push(spark);
      this.animationDummy.position.set(spark.baseX, spark.baseY, spark.baseZ);
      this.animationDummy.quaternion.copy(spark.quaternion);
      this.animationDummy.scale.setScalar(spark.size);
      this.animationDummy.updateMatrix();
      sparkBatch.setMatrixAt(index, this.animationDummy.matrix);
    }
    sparkBatch.instanceMatrix.needsUpdate = true;
    sparkBatch.frustumCulled = false;
    sparkBatch.renderOrder = 35;
    sparkBatch.name = "SabotageWarmSparksInstanced";
    sparkBatch.userData.sparkInstances = sparkInstances;
    root.add(sparkBatch);

    const debrisGeometry = new THREE.BoxGeometry(0.058, 0.058, 0.24);
    const debrisMaterial = new THREE.MeshStandardMaterial({
      color: 0x4b4640,
      roughness: 0.92,
      metalness: 0.16,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    });
    debrisMaterial.userData.baseOpacity = 0.92;
    const debrisCount = 10;
    const debrisBatch = new THREE.InstancedMesh(debrisGeometry, debrisMaterial, debrisCount);
    const debrisInstances = [];
    for (let index = 0; index < debrisCount; index += 1) {
      const debrisAngle = HashNoise(index, targetHex.q, 211) * Math.PI * 2;
      const debris = {
        baseX: (HashNoise(index, targetHex.r, 212) - 0.5) * 0.34,
        baseY: 0.14 + HashNoise(index, targetHex.q, 213) * 0.18,
        baseZ: (HashNoise(index, targetHex.r, 214) - 0.5) * 0.34,
        velocity: new THREE.Vector3(
          Math.cos(debrisAngle) * (0.42 + HashNoise(index, targetHex.q, 215) * 0.42),
          0.76 + HashNoise(index, targetHex.r, 216) * 0.5,
          Math.sin(debrisAngle) * (0.42 + HashNoise(index, targetHex.q, 217) * 0.42),
        ),
        rotation: debrisAngle,
        size: 0.68 + HashNoise(index, targetHex.r, 218) * 0.58,
      };
      debrisInstances.push(debris);
      this.animationDummy.position.set(debris.baseX, debris.baseY, debris.baseZ);
      this.animationDummy.rotation.set(0.1, debris.rotation, debris.rotation * 0.25);
      this.animationDummy.scale.setScalar(debris.size);
      this.animationDummy.updateMatrix();
      debrisBatch.setMatrixAt(index, this.animationDummy.matrix);
    }
    debrisBatch.instanceMatrix.needsUpdate = true;
    debrisBatch.frustumCulled = false;
    debrisBatch.renderOrder = 33;
    debrisBatch.name = "SabotageRailAndBallastFragmentsInstanced";
    debrisBatch.userData.debrisInstances = debrisInstances;
    root.add(debrisBatch);

    const flashLight = new THREE.PointLight(0xffa34c, 2.8, 3.8, 2);
    flashLight.position.set(0, 0.34, 0);
    flashLight.name = "SabotageBriefWarmLight";
    flashLight.userData.baseIntensity = 2.8;
    root.add(flashLight);

    return {
      id: `ActionEffect_${++this.actionEffectSequence}`,
      actionId: "sabotage",
      targetHexId: String(effectData.targetHexId),
      unitId: effectData.unitId == null ? null : String(effectData.unitId),
      elapsed: 0,
      duration: World3DActionEffectProfile.sabotageDuration,
      root,
      muzzleBatch: null,
      smokeBatch,
      sparkBatch,
      debrisBatch,
      flashLight,
      pulseMarker: null,
      blastCore,
      blastDuration: 0.28,
      smokeRise: 0.82,
      smokeExpansion: 0.78,
      smokeFade: 0.64,
      pulseExpansion: 0,
      pulseFade: 1,
      drawCalls: 5,
    };
  }

  ApplyStaticActionEffectPose(effect) {
    if (effect.muzzleBatch?.material) {
      effect.muzzleBatch.material.opacity = effect.muzzleBatch.material.userData.baseOpacity;
      effect.muzzleBatch.scale.setScalar(1);
    }
    if (effect.tracerBatch?.material) {
      effect.tracerBatch.material.opacity = effect.tracerBatch.material.userData.baseOpacity;
    }
    if (effect.smokeBatch?.material) {
      const baseOpacity = effect.smokeBatch.material.userData.baseOpacity;
      effect.smokeBatch.material.opacity = baseOpacity;
      if (effect.smokeBatch.material.uniforms?.uOpacity) {
        effect.smokeBatch.material.uniforms.uOpacity.value = baseOpacity;
      }
    }
    if (effect.sparkBatch?.material) {
      effect.sparkBatch.material.opacity = effect.sparkBatch.material.userData.baseOpacity;
    }
    if (effect.debrisBatch?.material) {
      effect.debrisBatch.material.opacity = effect.debrisBatch.material.userData.baseOpacity;
    }
    if (effect.flashLight) {
      effect.flashLight.intensity = Number(effect.flashLight.userData.baseIntensity) || 1.4;
    }
    if (effect.blastCore?.material) {
      effect.blastCore.scale.setScalar(1.25);
      effect.blastCore.material.opacity = effect.blastCore.material.userData.baseOpacity;
    }
    if (effect.pulseMarker?.material) {
      effect.pulseMarker.scale.setScalar(1.14);
      effect.pulseMarker.material.opacity = effect.pulseMarker.material.userData.baseOpacity;
    }
  }

  UpdateActionEffectMotion(effect) {
    const progress = Clamp(effect.elapsed / effect.duration, 0, 1);
    if (effect.muzzleBatch?.material) {
      const burst = Math.max(0, Math.sin((progress * 3 + 0.18) * Math.PI));
      const envelope = Math.pow(1 - progress, 0.32);
      effect.muzzleBatch.material.opacity = 0.22 + burst * 0.74 * envelope;
      effect.muzzleBatch.scale.setScalar(0.94 + burst * 0.12);
    }
    if (effect.tracerBatch?.material) {
      const baseOpacity = effect.tracerBatch.material.userData.baseOpacity;
      effect.tracerBatch.material.opacity = baseOpacity * Math.max(0, 1 - progress * 2.8);
    }
    const smokeInstances = effect.smokeBatch?.userData.actionSmokeInstances ?? [];
    const smokePositions = effect.smokeBatch?.geometry?.getAttribute?.("position");
    const smokeSizes = effect.smokeBatch?.geometry?.getAttribute?.("aSize");
    const smokeBaseSizes = effect.smokeBatch?.userData.baseSizes ?? [];
    smokeInstances.forEach((smoke, index) => {
      const drift = progress * (0.035 + index * 0.006);
      const x = smoke.baseX + Math.sin(smoke.seed + progress * 2.2) * drift;
      const y = smoke.baseY + progress * effect.smokeRise
        * (0.72 + index / Math.max(1, smokeInstances.length) * 0.45);
      const z = smoke.baseZ + Math.cos(smoke.seed + progress * 1.8) * drift;
      const scale = smoke.size * (1 + progress * effect.smokeExpansion);
      if (effect.smokeBatch?.isPoints && smokePositions && smokeSizes) {
        smokePositions.setXYZ(index, x, y, z);
        smokeSizes.setX(index, (smokeBaseSizes[index] ?? 0.5) * (1 + progress * effect.smokeExpansion));
      } else {
        this.animationDummy.position.set(x, y, z);
        this.animationDummy.scale.setScalar(scale);
        this.animationDummy.rotation.set(0, smoke.seed + progress * 0.34, 0);
        this.animationDummy.updateMatrix();
        effect.smokeBatch?.setMatrixAt?.(index, this.animationDummy.matrix);
      }
    });
    if (effect.smokeBatch) {
      if (effect.smokeBatch.isPoints) {
        smokePositions.needsUpdate = true;
        smokeSizes.needsUpdate = true;
      } else if (effect.smokeBatch.instanceMatrix) {
        effect.smokeBatch.instanceMatrix.needsUpdate = true;
      }
      const baseOpacity = effect.smokeBatch.material.userData.baseOpacity;
      const opacity = baseOpacity * (1 - progress * (effect.smokeFade ?? 0.72));
      effect.smokeBatch.material.opacity = opacity;
      if (effect.smokeBatch.material.uniforms?.uOpacity) {
        effect.smokeBatch.material.uniforms.uOpacity.value = opacity;
      }
    }
    const sparkInstances = effect.sparkBatch?.userData.sparkInstances ?? [];
    const sparkProgress = Math.min(1, progress / 0.72);
    sparkInstances.forEach((spark, index) => {
      const travel = sparkProgress * (0.52 + index * 0.035);
      this.animationDummy.position.set(
        spark.baseX + spark.direction.x * travel,
        spark.baseY + spark.direction.y * travel - sparkProgress * sparkProgress * 0.18,
        spark.baseZ + spark.direction.z * travel,
      );
      this.animationDummy.quaternion.copy(spark.quaternion);
      this.animationDummy.scale.setScalar(spark.size * (1 - sparkProgress * 0.28));
      this.animationDummy.updateMatrix();
      effect.sparkBatch.setMatrixAt(index, this.animationDummy.matrix);
    });
    if (effect.sparkBatch) {
      effect.sparkBatch.instanceMatrix.needsUpdate = true;
      const baseOpacity = effect.sparkBatch.material.userData.baseOpacity;
      effect.sparkBatch.material.opacity = baseOpacity * (1 - sparkProgress * 0.58);
    }
    const debrisInstances = effect.debrisBatch?.userData.debrisInstances ?? [];
    const debrisProgress = Math.min(1, progress / 0.68);
    debrisInstances.forEach((debris, index) => {
      const travel = debrisProgress * (0.7 + index * 0.018);
      this.animationDummy.position.set(
        debris.baseX + debris.velocity.x * travel,
        debris.baseY + debris.velocity.y * travel - debrisProgress * debrisProgress * 0.55,
        debris.baseZ + debris.velocity.z * travel,
      );
      this.animationDummy.rotation.set(
        debris.rotation + debrisProgress * (2.1 + index * 0.11),
        debris.rotation * 0.7 + debrisProgress * (3.2 + index * 0.13),
        debrisProgress * 1.8,
      );
      this.animationDummy.scale.setScalar(debris.size * (1 - debrisProgress * 0.18));
      this.animationDummy.updateMatrix();
      effect.debrisBatch.setMatrixAt(index, this.animationDummy.matrix);
    });
    if (effect.debrisBatch) {
      effect.debrisBatch.instanceMatrix.needsUpdate = true;
      const baseOpacity = effect.debrisBatch.material.userData.baseOpacity;
      effect.debrisBatch.material.opacity = baseOpacity * (1 - debrisProgress * 0.7);
    }
    if (effect.flashLight) {
      const baseIntensity = Number(effect.flashLight.userData.baseIntensity) || 1.4;
      effect.flashLight.intensity = baseIntensity * Math.max(0, 1 - progress * 4.4);
    }
    if (effect.blastCore?.material) {
      const blastProgress = Math.min(1, effect.elapsed / (effect.blastDuration ?? 0.22));
      effect.blastCore.scale.set(
        0.92 + blastProgress * 0.78,
        0.68 + blastProgress * 0.54,
        1,
      );
      const baseOpacity = effect.blastCore.material.userData.baseOpacity;
      effect.blastCore.material.opacity = baseOpacity * (1 - blastProgress);
    }
    if (effect.pulseMarker?.material) {
      const pulseScale = 0.92 + progress * (effect.pulseExpansion ?? 0.92)
        + Math.sin(progress * Math.PI * 4) * 0.055;
      effect.pulseMarker.scale.setScalar(pulseScale);
      const baseOpacity = effect.pulseMarker.material.userData.baseOpacity;
      effect.pulseMarker.material.opacity = baseOpacity * (1 - progress * (effect.pulseFade ?? 0.8));
    }
  }

  RemoveActionEffect(effect, publish = true) {
    const index = this.activeActionEffects.indexOf(effect);
    if (index >= 0) this.activeActionEffects.splice(index, 1);
    if (effect?.root?.parent) effect.root.parent.remove(effect.root);
    DisposeObject(effect?.root, this.sharedGeometries, this.sharedMaterials);
    this.objectCounts.actionEffects = MeasureObjectGroup(this.actionEffectGroup);
    this.renderRequested = true;
    if (publish) this.PublishDiagnostics();
  }

  ClearActionEffects(publish = true) {
    [...this.activeActionEffects].forEach((effect) => this.RemoveActionEffect(effect, false));
    ClearGroup(this.actionEffectGroup, this.sharedGeometries, this.sharedMaterials);
    this.activeActionEffects = [];
    this.objectCounts.actionEffects = MeasureObjectGroup(this.actionEffectGroup);
    this.renderRequested = true;
    if (publish) this.PublishDiagnostics();
  }

  PlayActionEffects(effects) {
    const requestedEffects = Array.isArray(effects) ? effects : [effects];
    if (this.disposed) {
      return Object.freeze({ requestedCount: requestedEffects.length, activeCount: 0, skippedCount: requestedEffects.length, actionIds: Object.freeze([]) });
    }
    this.ClearActionEffects(false);
    requestedEffects
      .slice(0, World3DActionEffectProfile.maximumConcurrentEffects)
      .forEach((effectData) => {
        const actionId = String(effectData?.actionId ?? "").toLowerCase();
        if (!World3DActionEffectProfile.supportedActionIds.includes(actionId)) return;
        const targetHexId = String(effectData?.targetHexId ?? "");
        const targetHex = this.hexById.get(effectData?.targetHexId) ?? this.hexById.get(targetHexId);
        if (!targetHex || targetHex.visible === false) return;
        const targetPosition = this.GetActionEffectTargetPosition(actionId, targetHex);
        targetPosition.y = (this.terrainHeights.get(targetHex.id) ?? GetTerrainHeight(targetHex)) + 0.12;
        const direction = this.GetActionEffectDirection(effectData, targetPosition, targetHex);
        const normalizedData = { ...effectData, actionId, targetHexId };
        const effect = actionId === "ambush"
          ? this.CreateAmbushActionEffect(normalizedData, targetHex, targetPosition, direction)
          : this.CreateSabotageActionEffect(normalizedData, targetHex, targetPosition);
        effect.root.name = `${effect.id}_${actionId}_${targetHexId}`;
        effect.root.userData.actionId = actionId;
        effect.root.userData.targetHexId = targetHexId;
        effect.root.userData.duration = effect.duration;
        this.actionEffectGroup.add(effect.root);
        this.activeActionEffects.push(effect);
        if (this.reducedMotion) this.ApplyStaticActionEffectPose(effect);
      });
    this.objectCounts.actionEffects = MeasureObjectGroup(this.actionEffectGroup);
    this.renderRequested = true;
    this.pauseReason = "active";
    this.PublishDiagnostics();
    const actionIds = Object.freeze(this.activeActionEffects.map((effect) => effect.actionId));
    return Object.freeze({
      requestedCount: requestedEffects.length,
      activeCount: this.activeActionEffects.length,
      skippedCount: requestedEffects.length - this.activeActionEffects.length,
      actionIds,
    });
  }

  UpdateActionEffects(delta) {
    if (!this.activeActionEffects.length) return;
    const expiredEffects = [];
    this.activeActionEffects.forEach((effect) => {
      effect.elapsed += delta;
      if (effect.elapsed >= effect.duration) {
        expiredEffects.push(effect);
      } else if (!this.reducedMotion) {
        this.UpdateActionEffectMotion(effect);
      }
    });
    expiredEffects.forEach((effect) => this.RemoveActionEffect(effect, false));
    if (expiredEffects.length) this.PublishDiagnostics();
    this.renderRequested = true;
  }

  PickHex(screenX, screenY) {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || !this.pickMesh) return null;
    this.pointer.set(
      ((Number(screenX) / rect.width) * 2) - 1,
      -((Number(screenY) / rect.height) * 2) + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObject(this.pickMesh, false)[0];
    if (!hit || hit.instanceId == null) return null;
    const hexId = this.pickInstanceIds[hit.instanceId];
    return this.hexById.get(hexId) ?? null;
  }

  Animate(frameAt) {
    if (this.disposed) return;
    this.animationHandle = requestAnimationFrame(this.Animate);
    this.animationFrameCount += 1;
    if (typeof document !== "undefined" && document.hidden) {
      this.lastFrameAt = frameAt;
      if (this.pauseReason !== "hidden") {
        this.pauseReason = "hidden";
        this.PublishDiagnostics();
      }
      return;
    }
    if (this.resizePending) this.Resize();
    const hasMovement = [...this.unitVisuals.values()].some((visual) =>
      (visual.userData.moveDuration || 0) > 0
      && visual.userData.moveElapsed < visual.userData.moveDuration);
    const hasActionEffects = this.activeActionEffects.length > 0;
    const hasAmbientMotion = !this.reducedMotion && (
      (this.unitVisuals.size > 0 && frameAt < this.ambientAnimationDeadline)
      || this.warningObjects.length > 0
      || this.smokePuffs.length > 0
      || this.weatherParticles
    );
    if (!this.renderRequested && !hasMovement && !hasAmbientMotion && !hasActionEffects) {
      if (this.pauseReason !== "idle") {
        this.pauseReason = "idle";
        this.PublishDiagnostics();
      }
      return;
    }
    const targetFramesPerSecond = GetTargetFrameRate();
    const targetFrameInterval = 1000 / targetFramesPerSecond;
    if (this.nextRenderAt <= 0 || frameAt - this.nextRenderAt > targetFrameInterval * 3) {
      this.nextRenderAt = frameAt;
    }
    if (frameAt + 0.5 < this.nextRenderAt) return;
    this.nextRenderAt += targetFrameInterval;
    const delta = Math.min(0.08, Math.max(0, (frameAt - this.lastFrameAt) / 1000));
    this.lastFrameAt = frameAt;
    this.lastRenderAt = frameAt;
    const time = frameAt / 1000;
    this.frameCount += 1;
    this.fpsSampleFrames += 1;
    this.pauseReason = "active";

    this.unitVisuals.forEach((visual) => {
      const duration = visual.userData.moveDuration || 0;
      let movementProgress = 1;
      if (duration > 0 && visual.userData.moveElapsed < duration) {
        visual.userData.moveElapsed += delta;
        const raw = Clamp(visual.userData.moveElapsed / duration, 0, 1);
        movementProgress = raw;
        const eased = raw * raw * (3 - 2 * raw);
        visual.position.lerpVectors(visual.userData.startPosition, visual.userData.targetPosition, eased);
      } else {
        visual.position.copy(visual.userData.targetPosition);
      }
      if (!this.reducedMotion) {
        const bob = Math.sin(time * 2.1 + visual.userData.idlePhase) * 0.014;
        const moving = movementProgress < 1;
        const gait = Math.sin(movementProgress * Math.PI * 8 + visual.userData.idlePhase);
        visual.children.filter((child) => child.userData?.unitBody !== true && child.type === "Group")
          .forEach((child, childIndex) => {
            child.position.y = bob + (moving ? Math.abs(gait) * 0.018 : 0);
            child.rotation.z = moving
              ? gait * (0.022 + childIndex * 0.003)
              : Math.sin(time * 0.7 + visual.userData.idlePhase + childIndex) * 0.006;
            child.rotation.x = moving ? Math.sin(movementProgress * Math.PI * 4) * 0.012 : 0;
          });
      }
    });
    if (hasMovement || this.renderRequested) this.UpdateUnitPedestalBatches();

    this.UpdateActionEffects(delta);

    if (!this.reducedMotion) {
      if (this.weatherParticles) {
        if (this.weatherMode === "winter-snow") {
          this.weatherParticles.position.set(
            Math.sin(time * 0.24) * 0.09,
            -((time * 0.075) % 0.48),
            Math.cos(time * 0.19) * 0.055,
          );
        } else {
          this.weatherParticles.position.set(
            Math.sin(time * 0.17) * 0.16,
            Math.sin(time * 0.11) * 0.025,
            Math.cos(time * 0.13) * 0.09,
          );
        }
      }
      this.warningObjects.forEach((indicator, index) => {
        const intensity = Number(indicator.userData.intensity) || 1;
        const pulse = 1 + Math.sin(time * (3.1 + intensity * 0.35) + index) * (0.05 + intensity * 0.014);
        indicator.scale.setScalar(pulse);
        (indicator.userData.warningMaterials ?? []).forEach((material, materialIndex) => {
          const baseOpacity = Number(material.userData.baseOpacity) || 0.8;
          material.opacity = baseOpacity * (0.72 + Math.sin(time * 4.2 + index + materialIndex) * 0.2);
        });
        if (indicator.userData.arrow) {
          indicator.userData.arrow.position.y = 0.025 + Math.sin(time * 4.4 + index) * 0.018;
        }
      });
      this.smokePuffs.forEach((batch, batchIndex) => {
        (batch.userData.smokeInstances ?? []).forEach((smoke, index) => {
          const rise = (time * 0.11 + index * 0.07 + batchIndex * 0.03) % 0.32;
          this.animationDummy.position.set(
            smoke.baseX + Math.sin(time * 0.7 + smoke.seed) * 0.055,
            smoke.baseY + rise,
            smoke.baseZ + Math.cos(time * 0.53 + smoke.seed) * 0.035,
          );
          const scale = smoke.size * (0.88 + ((time * 0.23 + index * 0.09) % 0.42));
          this.animationDummy.scale.setScalar(scale);
          this.animationDummy.rotation.set(0, time * 0.08 + smoke.seed, 0);
          this.animationDummy.updateMatrix();
          batch.setMatrixAt(index, this.animationDummy.matrix);
        });
        batch.instanceMatrix.needsUpdate = true;
      });
    }
    const renderStartedAt = performance.now();
    this.renderer.render(this.scene, this.camera);
    this.lastFrameDurationMs = performance.now() - renderStartedAt;
    this.renderRequested = false;
    const sampleElapsed = frameAt - this.fpsSampleStartedAt;
    if (sampleElapsed >= 1000) {
      this.framesPerSecond = (this.fpsSampleFrames * 1000) / sampleElapsed;
      this.fpsSampleFrames = 0;
      this.fpsSampleStartedAt = frameAt;
      this.RefreshObjectCounts();
      this.PublishDiagnostics();
    }
  }

  Dispose() {
    if (this.disposed) return;
    this.disposed = true;
    cancelAnimationFrame(this.animationHandle);
    this.ClearActionEffects(false);
    this.pauseReason = "disposed";
    this.PublishDiagnostics();
    this.resizeObserver?.disconnect();
    if (this.HandleWindowResize) window.removeEventListener("resize", this.HandleWindowResize);
    document.removeEventListener("visibilitychange", this.HandleVisibilityChange);
    const modelPackGeometries = new Set();
    const modelPackMaterials = new Set();
    this.modelPackScene?.traverse((object) => {
      if (object.geometry) modelPackGeometries.add(object.geometry);
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.filter(Boolean).forEach((material) => modelPackMaterials.add(material));
    });
    DisposeObject(this.scene, modelPackGeometries, modelPackMaterials);
    if (this.modelPackScene) DisposeObject(this.modelPackScene, new Set(), new Set());
    this.terrainAlbedoTexture?.dispose?.();
    this.terrainAlbedoTexture = null;
    this.miniatureDetailTexture?.dispose?.();
    this.miniatureDetailTexture = null;
    this.terrainAlbedoMaterials.clear();
    this.renderer.dispose();
    if (worldDiagnosticsRouter.current === this) worldDiagnosticsRouter.current = null;
  }
}

export function CreateEnemyRearWorld3D(canvas, options = {}) {
  if (!canvas) throw new Error("EnemyRear1941 Three.js world requires a canvas.");
  return new EnemyRearWorld3D(canvas, options);
}
