import * as THREE from "../../taihang/vendor/three/build/three.module.mjs";

export const World3DCacheIdentity = "EnemyRear1941_World3D_20260729_H";
export const World3DTerrainTextureUrl = new URL(
  "./Texture_TerrainPaperHigh.jpg?v=20260729h",
  import.meta.url,
).href;
export const World3DModelPackUrl = new URL(
  "./Model_EnemyRearMiniatures.glb?v=20260729h",
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
]);

export const World3DQualityProfile = Object.freeze({
  dprCap: 2,
  shadowMapSize: 2048,
  targetFps: 60,
  paperTextureSize: 2048,
  maximumAnimatedSmokePuffs: 24,
  movementDuration: 0.46,
});

export const World3DVisualProfile = Object.freeze({
  toneMappingExposure: 1.5,
  hemisphereIntensity: 2.42,
  ambientIntensity: 0.78,
  sunIntensity: 2.55,
  fillIntensity: 1.25,
  unitModelScale: 0.78,
  militiaModelScale: 0.7,
  villageHouseScale: 0.6,
  blockhouseScale: 0.88,
  trafficStationScale: 0.8,
  unitLabelWorldHeight: 0.72,
  unitLabelBaseHeight: 1.42,
  unitLabelLaneSpacing: 0.34,
  structureLabelWorldHeight: 0.7,
  structureLabelBaseHeight: 1.86,
  minimumLabelScreenPixels: 20,
  cameraHorizontalCoverage: 0.7,
  cameraVerticalCoverage: 0.84,
  roadWidth: 0.35,
  railBedWidth: 0.42,
  railWidth: 0.065,
  railGaugeOffset: 0.12,
  controlBorderWidth: 0.052,
  terrainColorVariation: 0.045,
  weatherMaximumPoints: 96,
});

export const World3DActionEffectProfile = Object.freeze({
  supportedActionIds: Object.freeze(["ambush", "sabotage"]),
  maximumConcurrentEffects: 4,
  ambushDuration: 1.55,
  sabotageDuration: 1.65,
  ambushMuzzleFlashCount: 3,
  ambushSmokeCount: 6,
  sabotageSmokeCount: 10,
});

export const World3DLayerNames = Object.freeze([
  "terrain",
  "fog",
  "units",
  "structures",
  "overlay",
]);

const terrainStyles = Object.freeze({
  mountain: Object.freeze({ color: 0xb7b09d, height: 0.86, roughness: 0.96 }),
  hill: Object.freeze({ color: 0xd0b57e, height: 0.47, roughness: 0.96 }),
  forest: Object.freeze({ color: 0x8aa680, height: 0.31, roughness: 0.94 }),
  plain: Object.freeze({ color: 0xd8c899, height: 0.18, roughness: 0.96 }),
  rivervalley: Object.freeze({ color: 0x93b5b9, height: 0.08, roughness: 0.72 }),
  village: Object.freeze({ color: 0xd2b88c, height: 0.22, roughness: 0.96 }),
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

export function GetTerrainHeight(hex) {
  const terrain = NormalizeTerrain(hex?.terrain);
  const style = terrainStyles[terrain];
  const relief = (HashNoise(hex?.q ?? 0, hex?.r ?? 0, 7) - 0.5) * (terrain === "mountain" ? 0.28 : 0.08);
  return Math.max(0.05, style.height + relief);
}

export function GetWorld3DDpr(width, deviceDpr = 1) {
  void width;
  return Math.min(Math.max(1, Number(deviceDpr) || 1), World3DQualityProfile.dprCap);
}

export function GetWorld3DWeather(turn) {
  const normalizedTurn = Math.max(1, Math.floor(Number(turn) || 1));
  const monthIndex = 8 + normalizedTurn - 1;
  const month = (monthIndex % 12) + 1;
  const year = 1941 + Math.floor(monthIndex / 12);
  if ([11, 12, 1, 2].includes(month)) {
    return Object.freeze({ year, month, mode: "winter-snow", particleCount: 96 });
  }
  if ([3, 4, 5].includes(month)) {
    return Object.freeze({ year, month, mode: "spring-dust", particleCount: 48 });
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
  return LayerSignature((state?.hexes ?? []).map((hex) =>
    `${hex.id}:${hex.q},${hex.r}:${NormalizeTerrain(hex.terrain)}`
  ));
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
      if (material.map && material.userData?.ownsMap) material.map.dispose?.();
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
    AddBox(group, new THREE.Vector3(1.1, 0.34, 0.92), materials.enemyStone, new THREE.Vector3(0, 0.18, 0));
    [-0.43, 0.43].forEach((x) => [-0.34, 0.34].forEach((z) => {
      AddCylinder(group, 0.16, 0.18, 0.53, 8, materials.enemyStone, new THREE.Vector3(x, 0.28, z));
    }));
    group.add(CreateFlag(materials, 0xe6dfc6, true));
  } else if (IsFeature(hex, "Stronghold")) {
    const blockhouse = modelFactory?.("Model_EnemyBlockhouse");
    if (blockhouse) {
      blockhouse.scale.setScalar(World3DVisualProfile.blockhouseScale);
      blockhouse.userData.importedModel = "Model_EnemyBlockhouse";
      group.add(blockhouse);
    } else {
      AddCylinder(group, 0.31, 0.4, 0.62, 8, materials.enemyStone, new THREE.Vector3(0, 0.32, 0));
      const crown = AddCylinder(group, 0.42, 0.42, 0.12, 8, materials.enemyDark, new THREE.Vector3(0, 0.68, 0));
      crown.castShadow = true;
      group.add(CreateFlag(materials, 0x504d40, false));
    }
  } else if (IsFeature(hex, "RailStation")) {
    const trafficStation = modelFactory?.("Model_TrafficStation");
    if (trafficStation) {
      trafficStation.scale.setScalar(World3DVisualProfile.trafficStationScale);
      trafficStation.userData.importedModel = "Model_TrafficStation";
      group.add(trafficStation);
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
    const flag = CreateFlag(materials, controlColors.player, true);
    flag.position.set(0.13, 0, -0.27);
    group.add(flag);
  } else if (IsFeature(hex, "Village")) {
    const offsets = [[-0.18, -0.05, 0.62], [0.2, 0.12, 0.54], [0.02, -0.28, 0.48]];
    offsets.forEach(([x, z, scale]) => {
      const house = CreateHouse(materials, scale, modelFactory);
      house.position.set(x, 0, z);
      group.add(house);
    });
    if (!enemy && ["player", "base", "network"].includes(hex.control)) {
      const flag = CreateFlag(materials, controlColors.player, false);
      flag.position.set(0.3, 0, -0.2);
      group.add(flag);
    }
  }

  if (hex.institution) {
    const institution = new THREE.Group();
    const institutionColor = {
      PartyBranch: 0xa8322c,
      Cooperative: 0xb88a3e,
      Clinic: 0xd9d2b7,
      Arsenal: 0x4e5950,
      Station: 0x556e72,
      Tunnels: 0x635441,
    }[hex.institution] ?? 0x8c7753;
    const base = AddBox(institution, new THREE.Vector3(0.32, 0.2, 0.28), materials.wall, new THREE.Vector3(0, 0.1, 0));
    base.material = base.material.clone();
    base.material.color.setHex(institutionColor);
    const mast = AddCylinder(institution, 0.018, 0.022, 0.47, 6, materials.iron, new THREE.Vector3(0, 0.39, 0));
    mast.userData.signal = hex.institution === "Station";
    institution.position.set(-0.4, 0, 0.34);
    institution.userData.signal = hex.institution === "Station";
    group.add(institution);
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

function CreateUnitMiniature(unit, enemy, materials, modelFactory = null) {
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
        material.color?.multiplyScalar(1.1);
        material.emissive?.setHex(enemy ? 0x263b35 : 0x4a2119);
        material.emissiveIntensity = Math.max(Number(material.emissiveIntensity) || 0, 0.36);
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
  const glyph = CreateLabelSprite(UnitGlyph(unit.type, enemy), {
    width: 104,
    height: 104,
    background: enemy ? "rgba(28,30,27,.95)" : "rgba(126,40,34,.96)",
    border: enemy ? "rgba(201,167,119,.9)" : "rgba(245,216,143,.95)",
    color: "#f4e5bd",
    worldHeight: World3DVisualProfile.unitLabelWorldHeight,
    radius: 52,
  });
  glyph.position.y = World3DVisualProfile.unitLabelBaseHeight;
  glyph.userData.mapLabel = true;
  group.add(glyph);
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
    this.unitVisuals = new Map();
    this.unitPedestalBatches = [];
    this.smokePuffs = [];
    this.sabotageObjects = [];
    this.signalObjects = [];
    this.warningObjects = [];
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
    this.renderer.setClearColor(0x99947d, 1);
  }

  InitializeScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x99947d);
    this.scene.fog = new THREE.Fog(0xb0ac9b, 22, 58);
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
    );

    const hemisphere = new THREE.HemisphereLight(0xf5ead0, 0x918b74, World3DVisualProfile.hemisphereIntensity);
    const ambient = new THREE.AmbientLight(0xd8ceb5, World3DVisualProfile.ambientIntensity);
    const sun = new THREE.DirectionalLight(0xffdcad, World3DVisualProfile.sunIntensity);
    sun.position.set(-8, 18, -11);
    sun.castShadow = true;
    sun.shadow.mapSize.set(World3DQualityProfile.shadowMapSize, World3DQualityProfile.shadowMapSize);
    sun.shadow.camera.left = -18;
    sun.shadow.camera.right = 18;
    sun.shadow.camera.top = 18;
    sun.shadow.camera.bottom = -18;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 55;
    sun.shadow.bias = -0.0007;
    const fill = new THREE.DirectionalLight(0xc3d2ce, World3DVisualProfile.fillIntensity);
    fill.position.set(12, 10, 15);
    fill.castShadow = false;
    this.sunLight = sun;
    this.scene.add(hemisphere, ambient, sun, fill);

    this.CreateSharedResources();
    const paper = new THREE.Mesh(
      new THREE.PlaneGeometry(80, 80),
      new THREE.MeshStandardMaterial({ color: 0xb2aa8d, roughness: 1, metalness: 0 }),
    );
    paper.rotation.x = -Math.PI / 2;
    paper.position.y = -0.035;
    paper.receiveShadow = true;
    paper.name = "PaperMapGround";
    paper.material.userData.ownsMap = true;
    this.paperGround = paper;
    this.scene.add(paper);
    this.LoadPaperGroundTexture(paper.material);
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
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.wrapS = THREE.ClampToEdgeWrapping;
        texture.wrapT = THREE.ClampToEdgeWrapping;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.magFilter = THREE.LinearFilter;
        texture.generateMipmaps = true;
        texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
        material.map = texture;
        material.color.setHex(this.weatherMode === "winter-snow" ? 0xd5d8ce : 0xc8b992);
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

  UpdateWeather() {
    const weather = GetWorld3DWeather(this.state?.turn);
    const signature = `${weather.year}-${weather.month}-${weather.mode}`;
    if (signature === this.weatherSignature) return;
    this.weatherSignature = signature;
    this.weatherMode = weather.mode;
    ClearGroup(this.weatherGroup, this.sharedGeometries, this.sharedMaterials);
    this.weatherParticles = null;

    if (weather.mode === "winter-snow") {
      this.scene.fog.color.setHex(0xc7ccc8);
      this.scene.fog.near = 17;
      this.scene.fog.far = 46;
      this.scene.background.setHex(0xaeb5b0);
      this.renderer.setClearColor(0xaeb5b0, 1);
      this.paperGround?.material.color.setHex(0xd5d8ce);
    } else if (weather.mode === "spring-dust") {
      this.scene.fog.color.setHex(0xb8aa8e);
      this.scene.fog.near = 21;
      this.scene.fog.far = 55;
      this.scene.background.setHex(0xaaa18c);
      this.renderer.setClearColor(0xaaa18c, 1);
      this.paperGround?.material.color.setHex(0xcbb991);
    } else {
      this.scene.fog.color.setHex(0xb0ac9b);
      this.scene.fog.near = 22;
      this.scene.fog.far = 58;
      this.scene.background.setHex(0x99947d);
      this.renderer.setClearColor(0x99947d, 1);
      this.paperGround?.material.color.setHex(0xc8b992);
    }

    if (weather.mode === "winter-snow") {
      const visibleHexes = (this.state?.hexes ?? []).filter((hex) => hex.visible !== false);
      if (visibleHexes.length) {
        const geometry = new THREE.RingGeometry(0.18, 0.92, 6, 1, Math.PI / 6);
        const material = new THREE.MeshBasicMaterial({
          color: 0xe6ebe5,
          transparent: true,
          opacity: 0.28,
          depthWrite: false,
          toneMapped: false,
          polygonOffset: true,
          polygonOffsetFactor: -2,
        });
        const snowDusting = new THREE.InstancedMesh(geometry, material, visibleHexes.length);
        const matrix = new THREE.Matrix4();
        const quaternion = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
        visibleHexes.forEach((hex, index) => {
          const base = this.hexPositions.get(hex.id) ?? HexToWorld(hex.q, hex.r);
          matrix.compose(
            new THREE.Vector3(base.x, (this.terrainHeights.get(hex.id) ?? GetTerrainHeight(hex)) + 0.04, base.z),
            quaternion,
            new THREE.Vector3(1, 1, 1),
          );
          snowDusting.setMatrixAt(index, matrix);
        });
        snowDusting.instanceMatrix.needsUpdate = true;
        snowDusting.renderOrder = 7;
        snowDusting.name = "WinterSnowDustingInstanced";
        this.weatherGroup.add(snowDusting);

        const mountainHexes = visibleHexes.filter((hex) => ["mountain", "hill"].includes(NormalizeTerrain(hex.terrain)));
        if (mountainHexes.length) {
          const capGeometry = new THREE.ConeGeometry(0.5, 0.16, 7);
          const capMaterial = new THREE.MeshBasicMaterial({
            color: 0xf3f6f2,
            transparent: true,
            opacity: 0.78,
            depthWrite: false,
            toneMapped: false,
          });
          const mountainCaps = new THREE.InstancedMesh(capGeometry, capMaterial, mountainHexes.length);
          mountainHexes.forEach((hex, index) => {
            const base = this.hexPositions.get(hex.id) ?? HexToWorld(hex.q, hex.r);
            const isMountain = NormalizeTerrain(hex.terrain) === "mountain";
            matrix.compose(
              new THREE.Vector3(
                base.x,
                (this.terrainHeights.get(hex.id) ?? GetTerrainHeight(hex)) + (isMountain ? 0.74 : 0.46),
                base.z,
              ),
              new THREE.Quaternion().setFromEuler(new THREE.Euler(0, HashNoise(hex.q, hex.r, 121) * Math.PI, 0)),
              new THREE.Vector3(isMountain ? 0.72 : 0.54, isMountain ? 0.7 : 0.46, isMountain ? 0.72 : 0.54),
            );
            mountainCaps.setMatrixAt(index, matrix);
          });
          mountainCaps.instanceMatrix.needsUpdate = true;
          mountainCaps.renderOrder = 9;
          mountainCaps.name = "WinterMountainCapsInstanced";
          this.weatherGroup.add(mountainCaps);
        }

        const roofHexes = visibleHexes.filter((hex) => IsFeature(
          hex,
          "Village",
          "Headquarters",
          "CountySeat",
          "Stronghold",
          "RailStation",
        ));
        if (roofHexes.length) {
          const roofGeometry = new THREE.ConeGeometry(0.42, 0.1, 4);
          const roofMaterial = new THREE.MeshBasicMaterial({
            color: 0xf1f4ef,
            transparent: true,
            opacity: 0.82,
            depthWrite: false,
            toneMapped: false,
          });
          const roofCaps = new THREE.InstancedMesh(roofGeometry, roofMaterial, roofHexes.length);
          roofHexes.forEach((hex, index) => {
            const base = this.hexPositions.get(hex.id) ?? HexToWorld(hex.q, hex.r);
            const roofHeight = IsFeature(hex, "Stronghold")
              ? 1.23
              : IsFeature(hex, "RailStation")
                ? 1.08
                : IsFeature(hex, "CountySeat")
                  ? 0.74
                  : IsFeature(hex, "Headquarters")
                    ? 0.62
                    : 0.56;
            const roofScale = IsFeature(hex, "RailStation")
              ? new THREE.Vector3(1.65, 0.48, 0.82)
              : IsFeature(hex, "Stronghold", "CountySeat")
                ? new THREE.Vector3(1.24, 0.55, 1.02)
                : new THREE.Vector3(1.04, 0.5, 0.76);
            matrix.compose(
              new THREE.Vector3(base.x, (this.terrainHeights.get(hex.id) ?? GetTerrainHeight(hex)) + roofHeight, base.z),
              new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.PI / 4, 0)),
              roofScale,
            );
            roofCaps.setMatrixAt(index, matrix);
          });
          roofCaps.instanceMatrix.needsUpdate = true;
          roofCaps.renderOrder = 10;
          roofCaps.name = "WinterRoofCapsInstanced";
          this.weatherGroup.add(roofCaps);
        }
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
        size: winter ? 0.145 : 0.038,
        transparent: true,
        opacity: winter ? 0.9 : 0.16,
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
    this.objectCounts.weather = MeasureObjectGroup(this.weatherGroup);
    this.renderRequested = true;
    this.PublishDiagnostics();
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
              material.color?.setRGB(1.16, 1.15, 1.1);
              material.emissive?.setHex(0x34352a);
              material.emissiveIntensity = 0.24;
              material.roughness = Math.min(Number(material.roughness) || 1, 0.86);
              material.metalness = 0;
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
        if (this.state) {
          this.dirty.units = true;
          this.dirty.structures = true;
          this.RebuildDirtyLayers();
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
    this.unitPedestalGeometry = new THREE.CylinderGeometry(0.35, 0.38, 0.05, 16);
    this.hexMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.9,
      metalness: 0,
      emissive: 0x575141,
      emissiveIntensity: 0.29,
      flatShading: true,
    });
    this.pickMaterial = new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, colorWrite: false });
    this.fogMaterial = new THREE.MeshBasicMaterial({
      color: 0x85877a,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -3,
    });
    this.materials = {
      wall: new THREE.MeshStandardMaterial({ color: 0xc7ae84, emissive: 0x382c20, emissiveIntensity: 0.14, roughness: 0.96 }),
      enemyWall: new THREE.MeshStandardMaterial({ color: 0xa5a597, emissive: 0x2e3936, emissiveIntensity: 0.2, roughness: 0.94 }),
      roof: new THREE.MeshStandardMaterial({ color: 0x747d74, emissive: 0x26312d, emissiveIntensity: 0.18, roughness: 0.88 }),
      wood: new THREE.MeshStandardMaterial({ color: 0x755b42, roughness: 0.94 }),
      stone: new THREE.MeshStandardMaterial({ color: 0xaaa89a, emissive: 0x30322d, emissiveIntensity: 0.14, roughness: 0.92 }),
      enemyStone: new THREE.MeshStandardMaterial({ color: 0x8e9690, emissive: 0x263431, emissiveIntensity: 0.22, roughness: 0.9 }),
      enemyDark: new THREE.MeshStandardMaterial({ color: 0x63726b, emissive: 0x1e302b, emissiveIntensity: 0.24, roughness: 0.86 }),
      iron: new THREE.MeshStandardMaterial({ color: 0x50605e, roughness: 0.5, metalness: 0.28 }),
      rail: new THREE.MeshStandardMaterial({ color: 0x263938, roughness: 0.4, metalness: 0.52 }),
      railDamaged: new THREE.MeshStandardMaterial({ color: 0x984b3b, roughness: 0.8, metalness: 0.12 }),
      road: new THREE.MeshStandardMaterial({ color: 0xb9945f, roughness: 0.96 }),
      railBed: new THREE.MeshStandardMaterial({ color: 0x8b8376, roughness: 0.94 }),
      railSleeper: new THREE.MeshStandardMaterial({ color: 0x654b35, roughness: 0.94 }),
      playerUniform: new THREE.MeshStandardMaterial({ color: 0xc36757, emissive: 0x4c1e17, emissiveIntensity: 0.24, roughness: 0.86 }),
      playerCap: new THREE.MeshStandardMaterial({ color: 0x60645a, roughness: 0.9 }),
      enemyUniform: new THREE.MeshStandardMaterial({ color: 0xb7b197, emissive: 0x2c3931, emissiveIntensity: 0.22, roughness: 0.86 }),
      enemyHelmet: new THREE.MeshStandardMaterial({ color: 0x879078, emissive: 0x263329, emissiveIntensity: 0.2, roughness: 0.74 }),
      playerPedestal: new THREE.MeshStandardMaterial({
        color: 0x8d3930, emissive: 0x451712, emissiveIntensity: 0.38, roughness: 0.82,
      }),
      enemyPedestal: new THREE.MeshStandardMaterial({
        color: 0x4d625d, emissive: 0x1b302b, emissiveIntensity: 0.38, roughness: 0.82,
      }),
      paperLight: new THREE.MeshStandardMaterial({ color: 0xcab88f, roughness: 1 }),
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
    this.hexById.clear();
    this.hexByCoordinate.clear();
    this.hexPositions.clear();
    this.terrainHeights.clear();
    const hexes = this.state.hexes ?? [];
    const terrainMesh = new THREE.InstancedMesh(this.hexGeometry, this.hexMaterial, Math.max(1, hexes.length));
    const pickMesh = new THREE.InstancedMesh(this.hexGeometry, this.pickMaterial, Math.max(1, hexes.length));
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    this.pickInstanceIds = [];
    hexes.forEach((hex, index) => {
      const position = HexToWorld(hex.q, hex.r);
      const height = GetTerrainHeight(hex);
      const terrain = NormalizeTerrain(hex.terrain);
      const style = terrainStyles[terrain];
      position.y = height / 2;
      matrix.compose(position, new THREE.Quaternion(), new THREE.Vector3(1, height, 1));
      terrainMesh.setMatrixAt(index, matrix);
      pickMesh.setMatrixAt(index, matrix);
      color.setHex(style.color);
      const tint = (HashNoise(hex.q, hex.r, 4) - 0.5) * World3DVisualProfile.terrainColorVariation;
      color.offsetHSL(0, 0, tint);
      terrainMesh.setColorAt(index, color);
      this.hexById.set(hex.id, hex);
      this.hexByCoordinate.set(CoordinateKey(hex.q, hex.r), hex);
      this.hexPositions.set(hex.id, HexToWorld(hex.q, hex.r));
      this.terrainHeights.set(hex.id, height);
      this.pickInstanceIds[index] = hex.id;
    });
    terrainMesh.instanceMatrix.needsUpdate = true;
    if (terrainMesh.instanceColor) terrainMesh.instanceColor.needsUpdate = true;
    terrainMesh.castShadow = true;
    terrainMesh.receiveShadow = true;
    terrainMesh.name = "TerrainInstancedHexes";
    pickMesh.instanceMatrix.needsUpdate = true;
    pickMesh.name = "PickInstancedHexes";
    pickMesh.userData.pickLayer = true;
    pickMesh.visible = false;
    this.pickMesh = pickMesh;
    this.terrainGroup.add(terrainMesh, pickMesh);
    const boundaryGeometry = new THREE.RingGeometry(0.91, 0.955, 6, 1, Math.PI / 6);
    const boundaryMaterial = new THREE.MeshBasicMaterial({
      color: 0x50493c,
      transparent: true,
      opacity: 0.26,
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
    this.UpdateWorldBounds();
    this.dirty.terrain = false;
    this.dirty.structures = true;
    this.dirty.fog = true;
    this.dirty.units = true;
    this.dirty.overlay = true;
    this.objectCounts.terrain = MeasureObjectGroup(this.terrainGroup);
  }

  AddTerrainDetails(hexes) {
    const treeTrunkGeometry = new THREE.CylinderGeometry(0.025, 0.055, 0.36, 6);
    const treeCrownGeometry = new THREE.ConeGeometry(0.17, 0.42, 7);
    const ridgeGeometry = new THREE.ConeGeometry(0.48, 0.72, 7);
    const terraceGeometry = new THREE.BoxGeometry(0.72, 0.035, 0.09);
    const trunkTransforms = [];
    const crownTransforms = [];
    const ridgeTransforms = [];
    const terraceTransforms = [];
    hexes.forEach((hex) => {
      const base = this.hexPositions.get(hex.id);
      const height = this.terrainHeights.get(hex.id) ?? 0;
      const terrain = NormalizeTerrain(hex.terrain);
      if (terrain === "forest") {
        for (let index = 0; index < 7; index += 1) {
          const angle = HashNoise(hex.q, hex.r, index + 10) * Math.PI * 2;
          const radius = 0.18 + HashNoise(hex.r, hex.q, index + 22) * 0.55;
          const scale = 0.72 + HashNoise(index, hex.q + hex.r, 8) * 0.42;
          const x = base.x + Math.cos(angle) * radius;
          const z = base.z + Math.sin(angle) * radius;
          trunkTransforms.push([x, height + 0.18 * scale, z, scale, angle]);
          crownTransforms.push([x, height + 0.46 * scale, z, scale, angle]);
        }
      } else if (terrain === "mountain") {
        const scale = 0.8 + HashNoise(hex.q, hex.r, 31) * 0.45;
        ridgeTransforms.push([base.x, height + 0.31 * scale, base.z, scale, HashNoise(hex.r, hex.q, 32) * Math.PI]);
      } else if (terrain === "hill") {
        const angle = HashNoise(hex.q, hex.r, 42) * Math.PI;
        for (let index = -2; index <= 2; index += 1) {
          terraceTransforms.push([
            base.x + Math.cos(angle + Math.PI / 2) * index * 0.13,
            height + 0.04 + Math.abs(index) * 0.015,
            base.z + Math.sin(angle + Math.PI / 2) * index * 0.13,
            1 - Math.abs(index) * 0.08,
            angle,
          ]);
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
      transforms.forEach(([x, y, z, scale, rotation], index) => {
        dummy.position.set(x, y, z);
        dummy.scale.setScalar(scale);
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
    AddInstances(treeTrunkGeometry, this.materials.wood, trunkTransforms, "ForestTrunks");
    AddInstances(treeCrownGeometry, new THREE.MeshStandardMaterial({
      color: 0x64865e,
      roughness: 0.9,
      emissive: 0x30442e,
      emissiveIntensity: 0.22,
    }), crownTransforms, "ForestCrowns");
    AddInstances(ridgeGeometry, new THREE.MeshStandardMaterial({
      color: 0x9d9e90,
      roughness: 0.9,
      emissive: 0x3c3d34,
      emissiveIntensity: 0.24,
    }), ridgeTransforms, "MountainRidges");
    AddInstances(terraceGeometry, new THREE.MeshStandardMaterial({ color: 0xcaa96c, roughness: 0.92 }), terraceTransforms, "HillTerraces", false);
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
        structure.position.set(base.x, height + 0.025, base.z);
        structure.userData.hexId = hex.id;
        structure.traverse((object) => {
          if (object.userData?.signal) this.signalObjects.push(object);
        });
        this.structureGroup.add(structure);
      }
      if (hex.improvement) this.AddImprovement(hex, base, height);
      if (Number(hex.railDisabledTurns) > 0) this.AddSabotageSmoke(hex, base, height);
      if (hex.feature && hex.visible !== false) {
        const label = CreateLabelSprite(hex.name ?? "据点", {
          width: 300,
          height: 72,
          worldHeight: World3DVisualProfile.structureLabelWorldHeight,
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
    const batches = {
      railBed: [],
      rail: [],
      railDamaged: [],
      railSleeper: [],
      road: [],
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
          batches.railBed.push({
            start,
            end,
            width: World3DVisualProfile.railBedWidth,
            yOffset: 0.052,
          });
          const horizontal = end.clone().sub(start);
          horizontal.y = 0;
          const side = new THREE.Vector3(-horizontal.z, 0, horizontal.x)
            .normalize()
            .multiplyScalar(World3DVisualProfile.railGaugeOffset);
          const railBatch = Number(hex.railDisabledTurns) > 0 || Number(neighbor.railDisabledTurns) > 0
            ? batches.railDamaged
            : batches.rail;
          railBatch.push(
            {
              start: start.clone().add(side),
              end: end.clone().add(side),
              width: World3DVisualProfile.railWidth,
              yOffset: 0.105,
            },
            {
              start: start.clone().sub(side),
              end: end.clone().sub(side),
              width: World3DVisualProfile.railWidth,
              yOffset: 0.105,
            },
          );
          const midpoint = start.clone().add(end).multiplyScalar(0.5);
          const sleeperSide = side.clone().normalize().multiplyScalar(0.2);
          batches.railSleeper.push({
            start: midpoint.clone().add(sleeperSide),
            end: midpoint.clone().sub(sleeperSide),
            width: 0.064,
            thickness: 0.032,
            yOffset: 0.08,
          });
        } else if (hex.road && neighbor.road) {
          batches.road.push({
            start,
            end,
            width: World3DVisualProfile.roadWidth,
            yOffset: 0.065,
          });
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
    AddLineBatch(batches.railBed, this.materials.railBed, "RailBedsInstanced");
    AddLineBatch(batches.railSleeper, this.materials.railSleeper, "RailSleepersInstanced");
    AddLineBatch(batches.rail, this.materials.rail, "RailSegmentsInstanced");
    AddLineBatch(batches.railDamaged, this.materials.railDamaged, "DamagedRailSegmentsInstanced");
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

  AddSabotageSmoke(hex, base, height) {
    const existingCount = this.smokePuffs.reduce((total, batch) =>
      total + (batch.userData.smokeInstances?.length ?? 0), 0);
    const count = Math.min(6, World3DQualityProfile.maximumAnimatedSmokePuffs - existingCount);
    if (count <= 0) return;
    const geometry = new THREE.IcosahedronGeometry(0.12, 1);
    const material = this.materials.smoke.clone();
    const batch = new THREE.InstancedMesh(geometry, material, count);
    const smokeInstances = [];
    const dummy = new THREE.Object3D();
    for (let index = 0; index < count; index += 1) {
      const smoke = {
        baseX: base.x + (HashNoise(hex.q, index, 51) - 0.5) * 0.36,
        baseY: height + 0.18 + index * 0.08,
        baseZ: base.z + (HashNoise(hex.r, index, 52) - 0.5) * 0.34,
        seed: HashNoise(index, hex.q + hex.r, 53) * Math.PI * 2,
        size: 0.82 + index * 0.11,
      };
      smokeInstances.push(smoke);
      dummy.position.set(smoke.baseX, smoke.baseY, smoke.baseZ);
      dummy.scale.setScalar(smoke.size);
      dummy.updateMatrix();
      batch.setMatrixAt(index, dummy.matrix);
    }
    batch.instanceMatrix.needsUpdate = true;
    batch.userData.smokeInstances = smokeInstances;
    batch.name = `SabotageSmoke_${hex.id}`;
    this.effectGroup.add(batch);
    this.smokePuffs.push(batch);

    [-1, 1].forEach((direction) => {
      const beam = new THREE.Mesh(this.sabotageBeamGeometry, this.materials.railDamaged);
      beam.position.set(base.x, height + 0.115, base.z);
      beam.rotation.y = direction * Math.PI / 4;
      beam.receiveShadow = true;
      beam.name = `SabotageBreak_${hex.id}`;
      this.effectGroup.add(beam);
    });
    const markerMaterial = this.materials.ember.clone();
    const marker = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.035, 6, 24), markerMaterial);
    marker.rotation.x = Math.PI / 2;
    marker.position.set(base.x, height + 0.13, base.z);
    marker.userData.baseOpacity = markerMaterial.opacity;
    marker.userData.sabotage = true;
    marker.name = `SabotageMarker_${hex.id}`;
    this.effectGroup.add(marker);
    this.sabotageObjects.push(marker);
  }

  RebuildFog() {
    ClearGroup(this.fogGroup, this.sharedGeometries, this.sharedMaterials);
    const hiddenHexes = (this.state.hexes ?? []).filter((hex) => hex.visible === false);
    if (hiddenHexes.length) {
      const geometry = new THREE.CylinderGeometry(0.96, 0.96, 0.045, 6, 1, false, Math.PI / 6);
      const mesh = new THREE.InstancedMesh(geometry, this.fogMaterial, hiddenHexes.length);
      const matrix = new THREE.Matrix4();
      hiddenHexes.forEach((hex, index) => {
        const position = this.hexPositions.get(hex.id)?.clone() ?? HexToWorld(hex.q, hex.r);
        position.y = (this.terrainHeights.get(hex.id) ?? 0) + 0.08;
        matrix.makeTranslation(position.x, position.y, position.z);
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
    const perHex = new Map();
    units.forEach((unit) => {
      const index = perHex.get(unit.hexId) ?? 0;
      perHex.set(unit.hexId, index + 1);
      const base = this.hexPositions.get(unit.hexId);
      if (!base) return;
      const height = this.terrainHeights.get(unit.hexId) ?? 0;
      const offsetAngle = (index - 0.5) * 0.7;
      const target = new THREE.Vector3(
        base.x + Math.sin(offsetAngle) * 0.34,
        height + 0.055,
        base.z + Math.cos(offsetAngle) * 0.25,
      );
      const miniature = CreateUnitMiniature(unit, unit.enemy, this.materials, this.CreateModelInstance);
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
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.032, 6, 36), material);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(base.x, height + 0.105, base.z);
      ring.renderOrder = 15;
      ring.userData.baseOpacity = opacity;
      ring.userData.hexId = hexId;
      this.overlayGroup.add(ring);
      return ring;
    };
    if (this.view?.selectedHexId) AddRing(this.view.selectedHexId, 0xffdfa0, 0.74, 0.8);
    (this.view?.reachableHexIds ?? []).forEach((hexId) => AddRing(hexId, 0xa7d477, 0.7, 0.35));
    (this.state.hexes ?? []).filter((hex) => hex.warning).forEach((hex) => this.AddWarningIndicator(hex));
    if (this.view?.mapLayer === "construction") {
      (this.state.hexes ?? []).filter((hex) => hex.institution || hex.improvement || hex.construction).forEach((hex) => {
        const ring = AddRing(hex.id, 0xf1bd66, 0.53, 0.52);
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
      player: 0.22,
      base: 0.22,
      network: 0.18,
      enemy: 0.2,
      occupied: 0.2,
      contested: 0.22,
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
        opacity: opacityByControl[control] ?? 0.68,
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
    this.cameraOffset = new THREE.Vector3(3.1, 15.8, 17.2).normalize().multiplyScalar(24);
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
        ? World3DVisualProfile.structureLabelBaseHeight + 0.42
        : unitHexIds.has(hexId)
          ? World3DVisualProfile.unitLabelBaseHeight + 0.36
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
        const minimumWorldHeight = minimumPixels * viewHeight / canvasHeight;
        const labelHeight = Math.max(baseHeight, minimumWorldHeight);
        object.scale.set(labelHeight * aspect, labelHeight, 1);
      });
    });
  }

  ResolveMapLabelLayout() {
    const canvasWidth = Number(this.canvas?.clientWidth) || 0;
    const canvasHeight = Number(this.canvas?.clientHeight) || 0;
    if (canvasWidth < 80 || canvasHeight < 80 || !this.currentViewHeight) return;
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
    const worldPosition = new THREE.Vector3();
    const projected = new THREE.Vector3();
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
        const overlap = occupied.reduce((total, other) => total + OverlapArea(box, other), 0);
        if (overlap < leastOverlap) {
          leastOverlap = overlap;
          chosen = label.position.clone();
          chosenBox = box;
        }
        if (overlap === 0) leastOverlap = -1;
      });
      if (leastOverlap > 0 && Number(label.userData.labelPriority) < 110) {
        label.visible = false;
        label.position.copy(anchor);
        return;
      }
      label.position.copy(chosen ?? anchor);
      if (chosenBox) occupied.push(chosenBox);
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
    this.camera.left = centerX - viewWidth / 2;
    this.camera.right = centerX + viewWidth / 2;
    this.camera.top = centerY + viewHeight / 2;
    this.camera.bottom = centerY - viewHeight / 2;
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
    const sourcePosition = unitVisual?.position
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

  CreateTransientActionSmoke(actionId, targetHex, options) {
    const count = Math.max(1, Math.floor(Number(options.count) || 1));
    const geometry = new THREE.IcosahedronGeometry(options.geometryRadius ?? 0.11, 1);
    const material = new THREE.MeshStandardMaterial({
      color: options.color,
      roughness: 1,
      metalness: 0,
      emissive: options.emissive ?? 0x25251f,
      emissiveIntensity: options.emissiveIntensity ?? 0.14,
      transparent: true,
      opacity: options.opacity,
      depthWrite: false,
      fog: true,
    });
    material.userData.baseOpacity = options.opacity;
    const batch = new THREE.InstancedMesh(geometry, material, count);
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
      this.animationDummy.position.set(smoke.baseX, smoke.baseY, smoke.baseZ);
      this.animationDummy.scale.setScalar(smoke.size);
      this.animationDummy.rotation.set(0, smoke.seed, 0);
      this.animationDummy.updateMatrix();
      batch.setMatrixAt(index, this.animationDummy.matrix);
    }
    batch.instanceMatrix.needsUpdate = true;
    batch.frustumCulled = false;
    batch.renderOrder = 31;
    batch.name = `${actionId === "ambush" ? "AmbushContactDust" : "SabotageActionSmoke"}Instanced`;
    batch.userData.actionSmokeInstances = smokeInstances;
    return batch;
  }

  CreateAmbushActionEffect(effectData, targetHex, targetPosition, direction) {
    const root = new THREE.Group();
    root.position.copy(targetPosition);
    const muzzleGeometry = new THREE.ConeGeometry(0.085, 0.38, 5, 1, false);
    const muzzleMaterial = new THREE.MeshBasicMaterial({
      color: 0xffd28a,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
    });
    muzzleMaterial.userData.baseOpacity = 0.92;
    const muzzleBatch = new THREE.InstancedMesh(
      muzzleGeometry,
      muzzleMaterial,
      World3DActionEffectProfile.ambushMuzzleFlashCount,
    );
    const side = new THREE.Vector3(-direction.z, 0, direction.x).normalize();
    const upwardAxis = new THREE.Vector3(0, 1, 0);
    for (let index = 0; index < World3DActionEffectProfile.ambushMuzzleFlashCount; index += 1) {
      const lane = index - (World3DActionEffectProfile.ambushMuzzleFlashCount - 1) / 2;
      const flashDirection = direction.clone().addScaledVector(side, lane * 0.08).setY(0.045).normalize();
      this.animationDummy.position.copy(direction).multiplyScalar(-0.48 - index * 0.035);
      this.animationDummy.position.addScaledVector(side, lane * 0.22);
      this.animationDummy.position.y = 0.27 + Math.abs(lane) * 0.035;
      this.animationDummy.quaternion.setFromUnitVectors(upwardAxis, flashDirection);
      this.animationDummy.scale.set(0.8 + index * 0.08, 0.9 + index * 0.05, 0.8 + index * 0.08);
      this.animationDummy.updateMatrix();
      muzzleBatch.setMatrixAt(index, this.animationDummy.matrix);
    }
    muzzleBatch.instanceMatrix.needsUpdate = true;
    muzzleBatch.frustumCulled = false;
    muzzleBatch.renderOrder = 34;
    muzzleBatch.name = "AmbushDirectionalMuzzleFlashesInstanced";
    root.add(muzzleBatch);

    const smokeBatch = this.CreateTransientActionSmoke("ambush", targetHex, {
      count: World3DActionEffectProfile.ambushSmokeCount,
      geometryRadius: 0.14,
      color: 0x8d806b,
      emissive: 0x493627,
      emissiveIntensity: 0.22,
      opacity: 0.62,
      spread: 0.5,
      baseY: 0.09,
      heightVariation: 0.28,
      minimumScale: 0.82,
      scaleVariation: 0.68,
    });
    root.add(smokeBatch);

    const pulseMaterial = new THREE.MeshBasicMaterial({
      color: 0xd5a249,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
      toneMapped: false,
    });
    pulseMaterial.userData.baseOpacity = 0.82;
    const pulseMarker = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.05, 6, 32), pulseMaterial);
    pulseMarker.rotation.x = Math.PI / 2;
    pulseMarker.position.y = 0.055;
    pulseMarker.renderOrder = 33;
    pulseMarker.name = "AmbushContactPulse";
    root.add(pulseMarker);

    return {
      id: `ActionEffect_${++this.actionEffectSequence}`,
      actionId: "ambush",
      targetHexId: String(effectData.targetHexId),
      unitId: effectData.unitId == null ? null : String(effectData.unitId),
      elapsed: 0,
      duration: World3DActionEffectProfile.ambushDuration,
      root,
      muzzleBatch,
      smokeBatch,
      pulseMarker,
      smokeRise: 0.58,
      smokeExpansion: 0.62,
      smokeFade: 0.68,
      pulseExpansion: 0.92,
      pulseFade: 0.76,
      drawCalls: 3,
    };
  }

  CreateSabotageActionEffect(effectData, targetHex, targetPosition) {
    const root = new THREE.Group();
    root.position.copy(targetPosition);
    const smokeBatch = this.CreateTransientActionSmoke("sabotage", targetHex, {
      count: World3DActionEffectProfile.sabotageSmokeCount,
      geometryRadius: 0.24,
      color: 0x756d61,
      emissive: 0x57341e,
      emissiveIntensity: 0.34,
      opacity: 0.94,
      spread: 0.86,
      baseY: 0.16,
      heightVariation: 0.9,
      minimumScale: 1.55,
      scaleVariation: 1.25,
    });
    root.add(smokeBatch);

    const sparkGeometry = new THREE.ConeGeometry(0.06, 0.36, 4, 1, false);
    const sparkMaterial = new THREE.MeshBasicMaterial({
      color: 0xffc878,
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
    });
    sparkMaterial.userData.baseOpacity = 0.96;
    const sparkCount = 7;
    const sparkBatch = new THREE.InstancedMesh(sparkGeometry, sparkMaterial, sparkCount);
    const sparkInstances = [];
    const upwardAxis = new THREE.Vector3(0, 1, 0);
    for (let index = 0; index < sparkCount; index += 1) {
      const angle = HashNoise(index, targetHex.q, 111) * Math.PI * 2;
      const direction = new THREE.Vector3(
        Math.cos(angle) * (0.38 + HashNoise(index, targetHex.r, 112) * 0.22),
        0.82 + HashNoise(index, targetHex.q, 113) * 0.42,
        Math.sin(angle) * (0.38 + HashNoise(index, targetHex.r, 114) * 0.22),
      ).normalize();
      const spark = {
        baseX: (HashNoise(index, targetHex.q, 115) - 0.5) * 0.22,
        baseY: 0.18 + HashNoise(index, targetHex.r, 116) * 0.14,
        baseZ: (HashNoise(index, targetHex.r, 117) - 0.5) * 0.22,
        direction,
        quaternion: new THREE.Quaternion().setFromUnitVectors(upwardAxis, direction),
        size: 1.08 + HashNoise(index, targetHex.q + targetHex.r, 118) * 0.52,
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

    const pulseMaterial = new THREE.MeshBasicMaterial({
      color: 0xc87938,
      transparent: true,
      opacity: 0.84,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
    });
    pulseMaterial.opacity = 1;
    pulseMaterial.userData.baseOpacity = 1;
    const pulseMarker = new THREE.Mesh(new THREE.TorusGeometry(0.86, 0.095, 6, 36), pulseMaterial);
    pulseMarker.rotation.x = Math.PI / 2;
    pulseMarker.position.y = 0.06;
    pulseMarker.renderOrder = 33;
    pulseMarker.name = "SabotageTransientPulse";
    root.add(pulseMarker);

    const blastMaterial = new THREE.MeshBasicMaterial({
      color: 0xffb45d,
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
    });
    blastMaterial.userData.baseOpacity = 0.96;
    const blastCore = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 7), blastMaterial);
    blastCore.position.y = 0.3;
    blastCore.renderOrder = 36;
    blastCore.name = "SabotageBlastCore";
    root.add(blastCore);

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
      pulseMarker,
      blastCore,
      smokeRise: 2.15,
      smokeExpansion: 1.05,
      smokeFade: 0.46,
      pulseExpansion: 0.64,
      pulseFade: 0.5,
      drawCalls: 4,
    };
  }

  ApplyStaticActionEffectPose(effect) {
    if (effect.muzzleBatch?.material) {
      effect.muzzleBatch.material.opacity = effect.muzzleBatch.material.userData.baseOpacity;
      effect.muzzleBatch.scale.setScalar(1);
    }
    if (effect.smokeBatch?.material) {
      effect.smokeBatch.material.opacity = effect.smokeBatch.material.userData.baseOpacity;
    }
    if (effect.sparkBatch?.material) {
      effect.sparkBatch.material.opacity = effect.sparkBatch.material.userData.baseOpacity;
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
    const smokeInstances = effect.smokeBatch?.userData.actionSmokeInstances ?? [];
    smokeInstances.forEach((smoke, index) => {
      const drift = progress * (0.035 + index * 0.006);
      this.animationDummy.position.set(
        smoke.baseX + Math.sin(smoke.seed + progress * 2.2) * drift,
        smoke.baseY + progress * effect.smokeRise * (0.72 + index / Math.max(1, smokeInstances.length) * 0.45),
        smoke.baseZ + Math.cos(smoke.seed + progress * 1.8) * drift,
      );
      const scale = smoke.size * (1 + progress * effect.smokeExpansion);
      this.animationDummy.scale.setScalar(scale);
      this.animationDummy.rotation.set(0, smoke.seed + progress * 0.34, 0);
      this.animationDummy.updateMatrix();
      effect.smokeBatch.setMatrixAt(index, this.animationDummy.matrix);
    });
    if (effect.smokeBatch) {
      effect.smokeBatch.instanceMatrix.needsUpdate = true;
      const baseOpacity = effect.smokeBatch.material.userData.baseOpacity;
      effect.smokeBatch.material.opacity = baseOpacity * (1 - progress * (effect.smokeFade ?? 0.72));
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
    if (effect.blastCore?.material) {
      const blastProgress = Math.min(1, progress / 0.5);
      effect.blastCore.scale.setScalar(0.78 + blastProgress * 1.45);
      const baseOpacity = effect.blastCore.material.userData.baseOpacity;
      effect.blastCore.material.opacity = baseOpacity * (1 - blastProgress * 0.68);
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
        const targetPosition = this.hexPositions.get(targetHex.id)?.clone() ?? HexToWorld(targetHex.q, targetHex.r);
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
      this.unitVisuals.size > 0
      || this.signalObjects.length > 0
      || this.warningObjects.length > 0
      || this.smokePuffs.length > 0
      || this.sabotageObjects.length > 0
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
      if (duration > 0 && visual.userData.moveElapsed < duration) {
        visual.userData.moveElapsed += delta;
        const raw = Clamp(visual.userData.moveElapsed / duration, 0, 1);
        const eased = raw * raw * (3 - 2 * raw);
        visual.position.lerpVectors(visual.userData.startPosition, visual.userData.targetPosition, eased);
      } else {
        visual.position.copy(visual.userData.targetPosition);
      }
      if (!this.reducedMotion) {
        const bob = Math.sin(time * 2.1 + visual.userData.idlePhase) * 0.014;
        visual.children.filter((child) => child.userData?.unitBody !== true && child.type === "Group")
          .forEach((child) => { child.position.y = bob; });
      }
    });
    this.UpdateUnitPedestalBatches();

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
      this.signalObjects.forEach((object, index) => {
        const pulse = 1 + Math.sin(time * 2.4 + index * 0.73) * 0.075;
        object.scale.x = pulse;
        if (object.material?.transparent) object.material.opacity = 0.78 + Math.sin(time * 2.2 + index) * 0.12;
      });
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
      this.sabotageObjects.forEach((marker, index) => {
        const pulse = 1 + Math.sin(time * 4.8 + index) * 0.085;
        marker.scale.setScalar(pulse);
        marker.material.opacity = marker.userData.baseOpacity * (0.72 + Math.sin(time * 5.2 + index) * 0.18);
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
    this.renderer.dispose();
    if (worldDiagnosticsRouter.current === this) worldDiagnosticsRouter.current = null;
  }
}

export function CreateEnemyRearWorld3D(canvas, options = {}) {
  if (!canvas) throw new Error("EnemyRear1941 Three.js world requires a canvas.");
  return new EnemyRearWorld3D(canvas, options);
}
