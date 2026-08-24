import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.mjs";
import { GLTFLoader } from "./vendor/three/examples/jsm/loaders/GLTFLoader.mjs";
import { GetOperationLayoutByCampaignIndex } from "./Data_Operations.mjs";
import { GetCharacterDefinition, GetEnemyRoleDefinition } from "./Data_Characters.mjs";
import { FindPath2D, GetEnemyIntelRenderState, GetSoundRadius, GetTerrainElevation } from "./Script_Rules.mjs";
import { CalculateStartupTacticalFrame, tacticalFramingContract } from "./Script_CameraFraming.mjs";

let activeMissionDefinition = GetOperationLayoutByCampaignIndex(0);
const firstOperationEnvironmentId = "infiltrateSignalStation";

const terrainPalette = Object.freeze({
  earth: 0x554f3e,
  earthLight: 0x716a51,
  terrace: 0x82795a,
  crop: 0x948852,
  reed: 0x6e7958,
  water: 0x436168,
  stone: 0x918a73,
  wood: 0x70573a,
  roof: 0x4a4940,
  friendly: 0x94d8bd,
  enemy: 0xdf9472,
  objective: 0xffdc87,
});

const artAssetPaths = Object.freeze({
  qinSuqiu: "./Models/Model_OperativeScout.glb?v=20260824j",
  hanShilei: "./Models/Model_OperativeSapper.glb?v=20260824j",
  luLanzhi: "./Models/Model_OperativeMedic.glb?v=20260824j",
  weiShouyi: "./Models/Model_OperativeGunner.glb?v=20260824j",
  enemyRifleman: "./Models/Model_EnemyRifleman.glb?v=20260824j",
  enemyLeader: "./Models/Model_EnemyLeader.glb?v=20260824j",
});

const environmentArtAssets = Object.freeze({
  infiltrateSignalStation: Object.freeze({
    path: "./Models/Model_EnvironmentCounty.glb",
    runtimeName: "Model_EnvironmentCounty_Runtime",
  }),
  nightRendezvous: Object.freeze({
    path: "./Models/Model_EnvironmentNorthVillage.glb",
    runtimeName: "Model_EnvironmentNorthVillage_Runtime",
  }),
  quarryInterdiction: Object.freeze({
    path: "./Models/Model_EnvironmentQuarrySlope.glb",
    runtimeName: "Model_EnvironmentQuarrySlope_Runtime",
  }),
});

// Static visual QA contract: a moonless operation stays chromatically dark, but its combined
// ambient/key contribution and dedicated cool fill/rim lights may not fall below these floors.
const nightReadabilityContract = Object.freeze({
  minimumExposure: 1.25,
  minimumHemisphereIntensity: 1.5,
  minimumKeyIntensity: 1.7,
  minimumActorFillIntensity: 0.85,
  minimumActorRimIntensity: 1.1,
  maximumFogDensity: 0.016,
});

function GetAtmosphereProfile(definition) {
  const timeOfDay = String(definition?.timeOfDay ?? "");
  const weather = String(definition?.weather ?? "");
  if (timeOfDay.includes("深夜") || weather.includes("细雨") || weather.includes("无月")) {
    return Object.freeze({
      id: "moonlessRain",
      timeOfDay,
      weather,
      background: 0x07131c,
      fogColor: 0x152733,
      fogDensity: 0.015,
      hemisphereSky: 0x405d72,
      hemisphereGround: 0x182321,
      hemisphereIntensity: 1.62,
      keyColor: 0xa6c2d7,
      keyIntensity: 1.86,
      keyPosition: [-22, 52, 34],
      exposure: 1.3,
      actorFillColor: 0x6f9cba,
      actorFillIntensity: 0.92,
      actorFillPosition: [38, 24, -46],
      actorRimColor: 0xb6d9e8,
      actorRimIntensity: 1.2,
      actorRimPosition: [-48, 32, 58],
      hillColor: 0x172a33,
      weatherKind: "rain",
      weatherDrift: [-2.8, -17.5, 0.9],
      readabilityContract: nightReadabilityContract,
    });
  }
  if (timeOfDay.includes("午后") || weather.includes("扬尘") || weather.includes("大风")) {
    return Object.freeze({
      id: "windblownAfternoon",
      timeOfDay,
      weather,
      background: 0x8b8b78,
      fogColor: 0x9b8b70,
      fogDensity: 0.0072,
      hemisphereSky: 0xd2d5c4,
      hemisphereGround: 0x584836,
      hemisphereIntensity: 1.62,
      keyColor: 0xffd3a0,
      keyIntensity: 3.05,
      keyPosition: [-42, 70, -30],
      exposure: 1.12,
      hillColor: 0x5d6257,
      weatherKind: "dust",
      weatherDrift: [8.5, 0.35, 3.1],
    });
  }
  return Object.freeze({
    id: "mistBeforeDawn",
    timeOfDay,
    weather,
    background: 0x1a2a30,
    fogColor: 0x354842,
    fogDensity: 0.0125,
    hemisphereSky: 0x7899a6,
    hemisphereGround: 0x302d25,
    hemisphereIntensity: 1.34,
    keyColor: 0xffbd87,
    keyIntensity: 2.22,
    keyPosition: [-48, 48, -58],
    exposure: 0.94,
    hillColor: 0x293831,
    weatherKind: "mist",
    weatherDrift: [1.7, 0.08, -3.4],
  });
}

function UsesFirstOperationDressing() {
  return activeMissionDefinition.id === firstOperationEnvironmentId;
}

function GetSurfaceHeight(x, z) {
  return GetTerrainElevation({ x, z }, activeMissionDefinition);
}

function CreateTerrainAxis(minimum, maximum, axisKey, sizeKey) {
  const values = new Set([minimum, maximum]);
  const maximumCellSize = 2;
  const segmentCount = Math.max(1, Math.ceil((maximum - minimum) / maximumCellSize));
  for (let index = 0; index <= segmentCount; index += 1) {
    values.add(THREE.MathUtils.lerp(minimum, maximum, index / segmentCount));
  }
  const heightRegions = [
    ...(activeMissionDefinition.zones ?? []).filter((zone) => Number.isFinite(zone.elevation)),
  ];
  for (const region of heightRegions) {
    const lower = region[axisKey] - region[sizeKey] * 0.5;
    const upper = region[axisKey] + region[sizeKey] * 0.5;
    for (const boundary of [lower, upper]) {
      if (boundary <= minimum || boundary >= maximum) continue;
      values.add(boundary);
      values.add(Math.max(minimum, boundary - 0.05));
      values.add(Math.min(maximum, boundary + 0.05));
    }
  }
  return [...values].sort((left, right) => left - right);
}

function CreateTerrainGeometry() {
  const bounds = activeMissionDefinition.bounds;
  const xValues = CreateTerrainAxis(bounds.minimumX, bounds.maximumX, "x", "width");
  const zValues = CreateTerrainAxis(bounds.minimumZ, bounds.maximumZ, "z", "depth");
  const positions = [];
  const uvs = [];
  const indices = [];
  const width = Math.max(1, bounds.maximumX - bounds.minimumX);
  const depth = Math.max(1, bounds.maximumZ - bounds.minimumZ);
  for (const z of zValues) {
    for (const x of xValues) {
      positions.push(x, GetSurfaceHeight(x, z) - 0.06, z);
      uvs.push((x - bounds.minimumX) / width, (z - bounds.minimumZ) / depth);
    }
  }
  const rowWidth = xValues.length;
  for (let row = 0; row < zValues.length - 1; row += 1) {
    for (let column = 0; column < xValues.length - 1; column += 1) {
      const topLeft = row * rowWidth + column;
      const topRight = topLeft + 1;
      const bottomLeft = topLeft + rowWidth;
      const bottomRight = bottomLeft + 1;
      indices.push(topLeft, bottomLeft, topRight, topRight, bottomLeft, bottomRight);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData = {
    terrainColumns: xValues.length,
    terrainRows: zValues.length,
    terrainTriangles: indices.length / 3,
  };
  return geometry;
}

function CreateOverlayMaterial(parameters) {
  const material = new THREE.MeshBasicMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    ...parameters,
  });
  return material;
}

function CreateCanvasTexture(seed = 1) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  const gradient = context.createLinearGradient(0, 0, 512, 512);
  gradient.addColorStop(0, "#4f4939");
  gradient.addColorStop(0.55, "#39372f");
  gradient.addColorStop(1, "#292b28");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 512, 512);
  for (let index = 0; index < 5400; index += 1) {
    const hash = Math.sin(seed * 17.31 + index * 71.73) * 43758.5453;
    const fraction = hash - Math.floor(hash);
    const x = (fraction * 9271) % 512;
    const y = ((fraction * 13177) % 512 + index * 0.19) % 512;
    const shade = 38 + Math.floor(fraction * 44);
    context.fillStyle = `rgba(${shade + 15},${shade + 12},${shade},${0.05 + fraction * 0.1})`;
    context.fillRect(x, y, 1 + fraction * 2, 1 + fraction * 2);
  }
  context.strokeStyle = "rgba(205,187,135,.08)";
  context.lineWidth = 2;
  for (let index = -512; index < 1024; index += 46) {
    context.beginPath();
    context.moveTo(index, 0);
    context.lineTo(index - 220, 512);
    context.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 4);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function CreateMaterial(color, roughness = 0.9, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function Deterministic(index, salt = 1) {
  const raw = Math.sin(index * 78.233 + salt * 12.9898) * 43758.5453;
  return raw - Math.floor(raw);
}

function BakeMeshRoots(roots, predicate = () => true) {
  const sourceMeshes = [];
  const sourceMaterials = new Set();
  for (const root of roots) {
    root.updateMatrixWorld(true);
    root.traverse((object) => {
      if (!object.isMesh || object.isInstancedMesh || !predicate(object)) return;
      sourceMeshes.push(object);
    });
  }
  if (sourceMeshes.length === 0) return null;
  const geometries = sourceMeshes.map((mesh) => {
    const geometry = mesh.geometry.clone();
    for (const attributeName of Object.keys(geometry.attributes)) {
      if (attributeName !== "position" && attributeName !== "normal") geometry.deleteAttribute(attributeName);
    }
    if (!geometry.getAttribute("normal")) geometry.computeVertexNormals();
    geometry.applyMatrix4(mesh.matrixWorld);
    const color = mesh.material?.color ?? new THREE.Color(0x777777);
    const colors = new Float32Array(geometry.getAttribute("position").count * 3);
    for (let index = 0; index < colors.length; index += 3) {
      colors[index] = color.r;
      colors[index + 1] = color.g;
      colors[index + 2] = color.b;
    }
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    if (Array.isArray(mesh.material)) mesh.material.forEach((material) => sourceMaterials.add(material));
    else if (mesh.material) sourceMaterials.add(mesh.material);
    return geometry;
  });
  const mergedGeometry = mergeGeometries(geometries, false);
  geometries.forEach((geometry) => geometry.dispose());
  if (!mergedGeometry) return null;
  const baked = new THREE.Mesh(
    mergedGeometry,
    new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0.02 }),
  );
  baked.castShadow = true;
  baked.receiveShadow = true;
  baked.userData.sourceMaterials = [...sourceMaterials];
  return { baked, sourceMeshes };
}

function ReplaceRootMeshesWithBaked(root, predicate = () => true) {
  const result = BakeMeshRoots([root], predicate);
  if (!result) return null;
  for (const mesh of result.sourceMeshes) {
    mesh.parent?.remove(mesh);
    mesh.geometry.dispose();
  }
  root.add(result.baked);
  return result.baked;
}

function CreateRoof(width, depth, color = terrainPalette.roof) {
  const halfWidth = width * 0.5;
  const halfDepth = depth * 0.5;
  const ridgeHeight = Math.min(width, depth) * 0.34;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(
      [
        -halfWidth, 0, -halfDepth,
        halfWidth, 0, -halfDepth,
        -halfWidth, 0, halfDepth,
        halfWidth, 0, halfDepth,
        -halfWidth, ridgeHeight, 0,
        halfWidth, ridgeHeight, 0,
      ],
      3,
    ),
  );
  geometry.setIndex([
    0, 1, 5, 0, 5, 4,
    2, 4, 5, 2, 5, 3,
    0, 4, 2,
    1, 3, 5,
    0, 2, 3, 0, 3, 1,
  ]);
  geometry.computeVertexNormals();
  const roof = new THREE.Mesh(geometry, CreateMaterial(color, 0.96));
  roof.castShadow = true;
  return roof;
}

function CreateBuilding(obstacle) {
  const group = new THREE.Group();
  const isTelephoneExchange = obstacle.id === "relayHouse";
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(obstacle.width, obstacle.height, obstacle.depth),
    CreateMaterial(isTelephoneExchange ? 0x806a4d : obstacle.color, 0.94),
  );
  wall.position.y = obstacle.height * 0.5;
  wall.castShadow = true;
  wall.receiveShadow = true;
  group.add(wall);
  const roof = CreateRoof(
    obstacle.width + 1.2,
    obstacle.depth + 1.2,
    isTelephoneExchange ? 0x51473a : terrainPalette.roof,
  );
  roof.position.y = obstacle.height + Math.min(obstacle.width, obstacle.depth) * 0.2;
  group.add(roof);

  const door = new THREE.Mesh(
    new THREE.BoxGeometry(Math.min(1.5, obstacle.width * 0.2), obstacle.height * 0.52, 0.13),
    CreateMaterial(0x2f271e, 1),
  );
  door.position.set(0, obstacle.height * 0.26, obstacle.depth * 0.505);
  group.add(door);

  for (const side of [-1, 1]) {
    const windowFrame = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.9, 0.15),
      new THREE.MeshStandardMaterial({
        color: 0x9b794a,
        emissive: 0x3b2711,
        emissiveIntensity: 0.5,
        roughness: 0.8,
      }),
    );
    windowFrame.position.set(side * obstacle.width * 0.28, obstacle.height * 0.58, obstacle.depth * 0.507);
    group.add(windowFrame);
  }

  if (isTelephoneExchange) {
    const porcelain = CreateMaterial(0xd5d8c4, 0.42, 0.04);
    const darkWood = CreateMaterial(0x35271c, 0.94);
    const copper = CreateMaterial(0x8c633b, 0.68, 0.18);
    const canvas = CreateMaterial(0xc9b77d, 0.96);

    // A broad cross-arm and drop wires make the exchange legible from the tactical camera.
    const entryArm = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.16, 0.18), darkWood);
    entryArm.position.set(-obstacle.width * 0.34, obstacle.height + 1.55, -obstacle.depth * 0.18);
    entryArm.rotation.y = Math.PI * 0.5;
    entryArm.castShadow = true;
    group.add(entryArm);
    const entryInsulators = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.1, 0.14, 0.28, 8),
      porcelain,
      4,
    );
    const detailMatrix = new THREE.Matrix4();
    [-1.65, -0.55, 0.55, 1.65].forEach((z, index) => {
      detailMatrix.makeTranslation(-obstacle.width * 0.34, obstacle.height + 1.78, z - obstacle.depth * 0.18);
      entryInsulators.setMatrixAt(index, detailMatrix);
    });
    group.add(entryInsulators);
    const dropPositions = [];
    for (const z of [-1.65, -0.55, 0.55, 1.65]) {
      dropPositions.push(
        -obstacle.width * 0.34, obstacle.height + 1.68, z - obstacle.depth * 0.18,
        -obstacle.width * 0.46, 2.4, z * 0.32 - obstacle.depth * 0.34,
      );
    }
    const drops = new THREE.LineSegments(
      new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(dropPositions, 3)),
      new THREE.LineBasicMaterial({ color: 0x252927, transparent: true, opacity: 0.92 }),
    );
    group.add(drops);

    // The outdoor service alcove exposes a period hand-cranked switchboard without opening the whole house.
    const alcove = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.65, 0.32), darkWood);
    alcove.position.set(-obstacle.width * 0.22, 1.45, -obstacle.depth * 0.525);
    group.add(alcove);
    const panel = new THREE.Mesh(new THREE.BoxGeometry(3.5, 1.9, 0.18), canvas);
    panel.position.set(-obstacle.width * 0.22, 1.55, -obstacle.depth * 0.555);
    panel.rotation.x = -0.12;
    group.add(panel);
    const sockets = new THREE.InstancedMesh(new THREE.SphereGeometry(0.07, 6, 4), copper, 12);
    for (let socketIndex = 0; socketIndex < 12; socketIndex += 1) {
      detailMatrix.makeTranslation(
        -obstacle.width * 0.22 - 1.2 + (socketIndex % 4) * 0.8,
        1.12 + Math.floor(socketIndex / 4) * 0.48,
        -obstacle.depth * 0.58,
      );
      sockets.setMatrixAt(socketIndex, detailMatrix);
    }
    group.add(sockets);
    const crank = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.06, 6, 12, Math.PI * 1.45), copper);
    crank.position.set(-obstacle.width * 0.22 + 1.25, 0.94, -obstacle.depth * 0.61);
    crank.rotation.x = Math.PI * 0.5;
    group.add(crank);
    const placard = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.48, 0.1), CreateMaterial(0xb9a56d, 0.95));
    placard.position.set(obstacle.width * 0.22, obstacle.height * 0.78, -obstacle.depth * 0.56);
    group.add(placard);
  }
  if (isTelephoneExchange) ReplaceRootMeshesWithBaked(group);
  group.position.set(obstacle.x, GetSurfaceHeight(obstacle.x, obstacle.z), obstacle.z);
  return group;
}

function CreateWall(obstacle) {
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(obstacle.width, obstacle.height, obstacle.depth),
    CreateMaterial(obstacle.color, 1),
  );
  wall.position.set(obstacle.x, obstacle.height * 0.5, obstacle.z);
  wall.castShadow = true;
  wall.receiveShadow = true;
  return wall;
}

function CreateTower(obstacle) {
  const group = new THREE.Group();
  const timberMaterial = CreateMaterial(0x453729, 0.95);
  for (const x of [-1, 1]) {
    for (const z of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.25, obstacle.height, 0.25), timberMaterial);
      leg.position.set(x * 1.15, obstacle.height * 0.5, z * 1.15);
      leg.rotation.z = x * 0.045;
      group.add(leg);
    }
  }
  const deck = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.28, 3.6), timberMaterial);
  deck.position.y = obstacle.height - 1.2;
  deck.castShadow = true;
  group.add(deck);
  const roof = CreateRoof(4.4, 4.4, 0x34342f);
  roof.position.y = obstacle.height + 0.15;
  group.add(roof);
  group.position.set(obstacle.x, 0, obstacle.z);
  return group;
}

function CreateWagon(obstacle) {
  const group = new THREE.Group();
  const bed = new THREE.Mesh(
    new THREE.BoxGeometry(obstacle.width, 0.75, obstacle.depth),
    CreateMaterial(obstacle.color, 0.96),
  );
  bed.position.y = 1.2;
  bed.castShadow = true;
  group.add(bed);
  const wheelGeometry = new THREE.CylinderGeometry(0.8, 0.8, 0.24, 16);
  const wheelMaterial = CreateMaterial(0x2b2720, 1);
  for (const x of [-2.2, 2.2]) {
    for (const z of [-1.55, 1.55]) {
      const wheel = new THREE.Mesh(wheelGeometry, wheelMaterial);
      wheel.rotation.x = Math.PI * 0.5;
      wheel.position.set(x, 0.75, z);
      group.add(wheel);
    }
  }
  group.position.set(obstacle.x, 0, obstacle.z);
  group.rotation.y = -0.2;
  return group;
}

function CloneArtTemplate(template) {
  if (!template) return null;
  const artRoot = template.clone(true);
  const materials = [];
  artRoot.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = true;
    object.receiveShadow = false;
    const sourceMaterials = Array.isArray(object.material) ? object.material : [object.material];
    const clonedMaterials = sourceMaterials.map((sourceMaterial) => {
      const material = sourceMaterial.clone();
      material.transparent = true;
      material.opacity = 1;
      material.depthWrite = true;
      material.userData.baseColor = material.color?.clone?.() ?? null;
      material.userData.baseEmissive = material.emissive?.clone?.() ?? null;
      material.userData.baseEmissiveIntensity = material.emissiveIntensity ?? 0;
      materials.push(material);
      return material;
    });
    object.material = Array.isArray(object.material) ? clonedMaterials : clonedMaterials[0];
  });
  const FindPivot = (fragment) => {
    let pivot = null;
    artRoot.traverse((object) => {
      if (!pivot && object.name.includes(fragment)) pivot = object;
    });
    return pivot;
  };
  return {
    root: artRoot,
    materials,
    armPivots: [FindPivot("Arm_L_Pivot"), FindPivot("Arm_R_Pivot")],
    legPivots: [FindPivot("Leg_L_Pivot"), FindPivot("Leg_R_Pivot")],
  };
}

function CreateCharacterModel(color, enemy = false, role = "", artTemplate = null) {
  const root = new THREE.Group();
  const uniform = CreateMaterial(color, 0.88);
  const skin = CreateMaterial(enemy ? 0xa87d5d : 0x9f775b, 0.92);
  const clothDark = CreateMaterial(enemy ? 0x4d4334 : 0x353c38, 0.95);
  let body = new THREE.Mesh(new THREE.CapsuleGeometry(0.42, 0.9, 4, 8), uniform);
  body.position.y = 1.35;
  body.castShadow = true;
  root.add(body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.34, 10, 8), skin);
  head.position.y = 2.25;
  head.castShadow = true;
  root.add(head);
  const hatRadius = role === "leader" ? 0.49 : 0.43;
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(hatRadius, hatRadius * 0.88, 0.18, 10), clothDark);
  hat.position.y = 2.54;
  hat.castShadow = true;
  root.add(hat);
  if (role === "leader") {
    const capBrim = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.07, 0.34), clothDark);
    capBrim.position.set(0, 2.52, -0.31);
    root.add(capBrim);
  }

  const limbInstances = new THREE.InstancedMesh(
    new THREE.CapsuleGeometry(0.13, 0.7, 3, 6),
    CreateMaterial(0xffffff, 0.92),
    4,
  );
  // One colored instance batch carries all four limbs; the baked torso carries the readable shadow.
  limbInstances.castShadow = false;
  limbInstances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const limbRig = {
    limbInstances,
    armPivots: [-1, 1].map((side) => {
      const pivot = new THREE.Object3D();
      pivot.position.set(side * 0.48, 1.75, 0);
      return pivot;
    }),
    legPivots: [-1, 1].map((side) => {
      const pivot = new THREE.Object3D();
      pivot.position.set(side * 0.22, 0.82, 0);
      return pivot;
    }),
    armOffset: new THREE.Matrix4().makeTranslation(0, -0.44, 0),
    legOffset: new THREE.Matrix4().makeTranslation(0, -0.5, 0),
    matrix: new THREE.Matrix4(),
  };
  for (let index = 0; index < 2; index += 1) {
    limbRig.armPivots[index].updateMatrix();
    limbRig.matrix.copy(limbRig.armPivots[index].matrix).multiply(limbRig.armOffset);
    limbInstances.setMatrixAt(index, limbRig.matrix);
    limbInstances.setColorAt(index, uniform.color);
    limbRig.legPivots[index].updateMatrix();
    limbRig.matrix.copy(limbRig.legPivots[index].matrix).multiply(limbRig.legOffset);
    limbInstances.setMatrixAt(index + 2, limbRig.matrix);
    limbInstances.setColorAt(index + 2, clothDark.color);
  }
  root.add(limbInstances);

  const weaponLength = role === "weiShouyi" ? 1.8 : 1.35;
  const weapon = new THREE.Mesh(
    new THREE.BoxGeometry(0.1, 0.11, weaponLength),
    CreateMaterial(0x252522, 0.62, 0.2),
  );
  weapon.position.set(0.4, 1.58, -0.35);
  weapon.rotation.x = -0.22;
  root.add(weapon);

  // Strong role silhouettes remain readable in a steep tactical camera without floating labels.
  if (role === "qinSuqiu") {
    const scarf = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 1.05), CreateMaterial(0xc7d6a1, 0.96));
    scarf.position.set(-0.32, 1.93, 0.48);
    scarf.rotation.x = 0.18;
    root.add(scarf);
    const binoculars = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.18, 0.18), clothDark);
    binoculars.position.set(0, 1.92, -0.42);
    root.add(binoculars);
  } else if (role === "hanShilei") {
    const toolPack = new THREE.Mesh(new THREE.BoxGeometry(0.88, 0.8, 0.38), CreateMaterial(0x6f5534, 0.98));
    toolPack.position.set(0, 1.38, 0.47);
    root.add(toolPack);
    const longTool = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.3, 0.1), CreateMaterial(0x8c744c, 0.8, 0.08));
    longTool.position.set(-0.43, 1.52, 0.54);
    longTool.rotation.z = -0.18;
    root.add(longTool);
  } else if (role === "luLanzhi") {
    const satchel = new THREE.Mesh(new THREE.BoxGeometry(0.64, 0.56, 0.32), CreateMaterial(0xa89c72, 0.98));
    satchel.position.set(-0.55, 1.15, 0.12);
    root.add(satchel);
    const blanketRoll = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.92, 8), CreateMaterial(0xc3b984, 0.98));
    blanketRoll.rotation.z = Math.PI * 0.5;
    blanketRoll.position.set(0, 1.82, 0.43);
    root.add(blanketRoll);
  } else if (role === "weiShouyi") {
    const ammunition = new THREE.Mesh(new THREE.BoxGeometry(1.06, 0.38, 0.34), CreateMaterial(0x5f5134, 0.98));
    ammunition.position.set(0, 1.18, 0.48);
    root.add(ammunition);
    const shoulderPad = new THREE.Mesh(new THREE.BoxGeometry(1.28, 0.22, 0.5), uniform);
    shoulderPad.position.set(0, 1.83, 0);
    root.add(shoulderPad);
  } else if (role === "operator") {
    const linePack = new THREE.Mesh(new THREE.BoxGeometry(0.84, 0.92, 0.4), CreateMaterial(0x484438, 0.98));
    linePack.position.set(0, 1.38, 0.49);
    root.add(linePack);
    const wireReel = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.08, 6, 12), CreateMaterial(0x8b724b, 0.82, 0.1));
    wireReel.position.set(0.5, 1.4, 0.42);
    wireReel.rotation.y = Math.PI * 0.5;
    root.add(wireReel);
  } else if (role === "leader") {
    const mapCase = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.64, 0.28), CreateMaterial(0x6f462d, 0.92));
    mapCase.position.set(0.55, 1.15, 0.12);
    root.add(mapCase);
    const commandSash = new THREE.Mesh(new THREE.BoxGeometry(0.11, 1.18, 0.08), CreateMaterial(0xc8aa69, 0.94));
    commandSash.position.set(0, 1.48, -0.43);
    commandSash.rotation.z = -0.56;
    root.add(commandSash);
  }

  const factionSegments = enemy ? 3 : 4;
  const factionGlyph = new THREE.Mesh(
    new THREE.RingGeometry(enemy ? 0.7 : 0.67, enemy ? 0.92 : 0.9, factionSegments),
    CreateOverlayMaterial({
      color: enemy ? 0xe87a62 : 0x83e5bc,
      opacity: enemy ? 0.3 : 0.4,
      side: THREE.DoubleSide,
    }),
  );
  factionGlyph.rotation.x = -Math.PI * 0.5;
  factionGlyph.rotation.z = enemy ? 0 : Math.PI * 0.25;
  factionGlyph.position.y = 0.055;
  factionGlyph.renderOrder = 12;
  root.add(factionGlyph);

  const selection = new THREE.Mesh(
    new THREE.RingGeometry(0.92, 1.08, factionSegments),
    CreateOverlayMaterial({
      color: enemy ? 0xd37562 : 0x86d8b7,
      opacity: 0,
      side: THREE.DoubleSide,
    }),
  );
  selection.rotation.x = -Math.PI * 0.5;
  selection.rotation.z = enemy ? 0 : Math.PI * 0.25;
  selection.position.y = 0.04;
  selection.renderOrder = 13;
  selection.visible = false;
  root.add(selection);

  const memoryRing = enemy
    ? new THREE.Mesh(
        new THREE.RingGeometry(1.12, 1.28, 40),
        CreateOverlayMaterial({ color: 0x87a8bd, opacity: 0, side: THREE.DoubleSide }),
      )
    : null;
  if (memoryRing) {
    memoryRing.rotation.x = -Math.PI * 0.5;
    memoryRing.position.y = 0.07;
    memoryRing.renderOrder = 14;
    memoryRing.visible = false;
    root.add(memoryRing);
  }

  const pick = new THREE.Mesh(
    new THREE.CylinderGeometry(0.75, 0.75, 2.7, 8),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  pick.position.y = 1.35;
  pick.userData.pickType = enemy ? "enemy" : "unit";
  pick.visible = false;
  root.add(pick);
  body =
    ReplaceRootMeshesWithBaked(
      root,
      (mesh) =>
        !mesh.isInstancedMesh &&
        mesh !== selection &&
        mesh !== factionGlyph &&
        mesh !== memoryRing &&
        mesh !== pick,
    ) ?? body;
  if (enemy) {
    body.material.transparent = true;
    limbInstances.material.transparent = true;
  }
  const artRig = CloneArtTemplate(artTemplate);
  if (artRig) {
    body.visible = false;
    limbInstances.visible = false;
    root.add(artRig.root);
  }
  root.userData = {
    body,
    head,
    limbRig,
    artRig,
    selection,
    factionGlyph,
    memoryRing,
    weapon: body,
    pick,
    previousX: 0,
    previousZ: 0,
    previousShotCooldown: null,
    fireRecoil: 0,
    phase: 0,
  };
  return root;
}

function CreateVisionMesh(range, fov, segments, color, opacity, renderOrder) {
  const positions = new Float32Array((segments + 2) * 3);
  const indices = [];
  positions[1] = 0.12;
  for (let index = 0; index <= segments; index += 1) {
    const angle = -fov * 0.5 + (index / segments) * fov;
    const offset = (index + 1) * 3;
    positions[offset] = Math.sin(angle) * range;
    positions[offset + 1] = 0.12;
    positions[offset + 2] = Math.cos(angle) * range;
    if (index > 0) indices.push(0, index, index + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  const mesh = new THREE.Mesh(
    geometry,
    CreateOverlayMaterial({
      color,
      opacity,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    }),
  );
  mesh.renderOrder = renderOrder;
  const outlineGeometry = new THREE.BufferGeometry();
  outlineGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array((segments + 3) * 3), 3));
  const outline = new THREE.Line(
    outlineGeometry,
    new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity: renderOrder >= 10 ? 0.92 : 0.42,
      depthWrite: false,
      depthTest: false,
    }),
  );
  outline.renderOrder = renderOrder + 1;
  mesh.add(outline);
  mesh.userData = { range, fov, segments, outline };
  return mesh;
}

function CreateVisionCone(range, fov, peripheralRange) {
  const group = new THREE.Group();
  const peripheral = CreateVisionMesh(peripheralRange, Math.PI * 1.44, 48, 0xe3a16a, 0.11, 9);
  const central = CreateVisionMesh(range, fov, 30, 0xffbd72, 0.32, 10);
  group.add(peripheral, central);
  group.userData = { central, peripheral, clipElapsed: 1 };
  return group;
}

function PointInsideVisionObstacle(point, obstacle, padding = -0.08) {
  return (
    point.x >= obstacle.x - obstacle.width * 0.5 - padding &&
    point.x <= obstacle.x + obstacle.width * 0.5 + padding &&
    point.z >= obstacle.z - obstacle.depth * 0.5 - padding &&
    point.z <= obstacle.z + obstacle.depth * 0.5 + padding
  );
}

function GetClippedSightDistance(origin, angle, maximumRange) {
  const directionX = Math.sin(angle);
  const directionZ = Math.cos(angle);
  let clippedRange = maximumRange;
  for (const obstacle of activeMissionDefinition.obstacles) {
    if (!["building", "wall", "crate", "wagon", "tower"].includes(obstacle.kind)) continue;
    if (obstacle.kind === "tower" && PointInsideVisionObstacle(origin, obstacle, -0.05)) continue;
    const padding = -0.08;
    const minimumX = obstacle.x - obstacle.width * 0.5 - padding;
    const maximumX = obstacle.x + obstacle.width * 0.5 + padding;
    const minimumZ = obstacle.z - obstacle.depth * 0.5 - padding;
    const maximumZ = obstacle.z + obstacle.depth * 0.5 + padding;
    let enter = 0;
    let leave = clippedRange;
    for (const [rayOrigin, direction, minimum, maximum] of [
      [origin.x, directionX, minimumX, maximumX],
      [origin.z, directionZ, minimumZ, maximumZ],
    ]) {
      if (Math.abs(direction) < 0.00001) {
        if (rayOrigin < minimum || rayOrigin > maximum) {
          enter = Number.POSITIVE_INFINITY;
          break;
        }
        continue;
      }
      let axisEnter = (minimum - rayOrigin) / direction;
      let axisLeave = (maximum - rayOrigin) / direction;
      if (axisEnter > axisLeave) [axisEnter, axisLeave] = [axisLeave, axisEnter];
      enter = Math.max(enter, axisEnter);
      leave = Math.min(leave, axisLeave);
      if (enter > leave) break;
    }
    if (enter <= leave && leave >= 0 && enter <= clippedRange) clippedRange = Math.max(0, enter);
  }
  return clippedRange;
}

function UpdateClippedVisionMesh(mesh, actor) {
  const { range, fov, segments } = mesh.userData;
  const positions = mesh.geometry.getAttribute("position");
  const baseHeight = GetSurfaceHeight(actor.x, actor.z);
  positions.setXYZ(0, 0, 0.12, 0);
  for (let index = 0; index <= segments; index += 1) {
    const localAngle = -fov * 0.5 + (index / segments) * fov;
    const worldAngle = actor.facing + localAngle;
    const clippedRange = GetClippedSightDistance(actor, worldAngle, range);
    const localX = Math.sin(localAngle) * clippedRange;
    const localZ = Math.cos(localAngle) * clippedRange;
    const worldX = actor.x + Math.sin(worldAngle) * clippedRange;
    const worldZ = actor.z + Math.cos(worldAngle) * clippedRange;
    positions.setXYZ(index + 1, localX, GetSurfaceHeight(worldX, worldZ) - baseHeight + 0.12, localZ);
  }
  positions.needsUpdate = true;
  const outlinePositions = mesh.userData.outline.geometry.getAttribute("position");
  outlinePositions.setXYZ(0, 0, 0.16, 0);
  for (let index = 0; index <= segments; index += 1) {
    outlinePositions.setXYZ(
      index + 1,
      positions.getX(index + 1),
      positions.getY(index + 1) + 0.04,
      positions.getZ(index + 1),
    );
  }
  outlinePositions.setXYZ(segments + 2, 0, 0.16, 0);
  outlinePositions.needsUpdate = true;
  mesh.geometry.computeBoundingSphere();
  mesh.userData.outline.geometry.computeBoundingSphere();
}

function UpdateClippedVision(group, actor, deltaTime) {
  group.userData.clipElapsed += deltaTime;
  if (group.userData.clipElapsed < 0.1) return;
  UpdateClippedVisionMesh(group.userData.central, actor);
  UpdateClippedVisionMesh(group.userData.peripheral, actor);
  group.userData.clipElapsed = 0;
}

function CreateMarker(definition) {
  const group = new THREE.Group();
  const color =
    definition.kind === "objective"
      ? terrainPalette.objective
      : definition.kind === "rescue"
        ? 0x8cc6b4
        : definition.kind === "civilian"
          ? 0xb8aa74
          : definition.kind === "environment"
            ? 0x8ea7b1
            : 0x92ad7b;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.85, 1.05, 32),
    CreateOverlayMaterial({ color, opacity: 0.76, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI * 0.5;
  ring.position.y = 0.08;
  ring.renderOrder = 14;
  group.add(ring);
  const beacon = new THREE.Mesh(
    new THREE.CylinderGeometry(0.04, 0.32, 2.5, 10, 1, true),
    CreateOverlayMaterial({ color, opacity: 0.2, side: THREE.DoubleSide }),
  );
  beacon.position.y = 1.25;
  group.add(beacon);
  const pick = new THREE.Mesh(
    new THREE.CylinderGeometry(1.4, 1.4, 2.8, 10),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
  );
  pick.position.y = 1.4;
  pick.userData = { pickType: "interactable", id: definition.id };
  pick.visible = false;
  group.add(pick);
  beacon.renderOrder = 14;
  group.position.set(definition.x, GetSurfaceHeight(definition.x, definition.z), definition.z);
  group.userData = { ring, beacon, pick, definition };
  return group;
}

function CreateTelephoneMast() {
  const group = new THREE.Group();
  const wood = CreateMaterial(0x3e3124, 0.95);
  const insulatorGeometry = new THREE.SphereGeometry(0.12, 8, 6);
  const insulatorMaterial = new THREE.MeshStandardMaterial({ color: 0x798486, roughness: 0.35, metalness: 0.15 });
  const insulators = new THREE.InstancedMesh(insulatorGeometry, insulatorMaterial, 8);
  const matrix = new THREE.Matrix4();
  let insulatorIndex = 0;
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.23, 10, 8), wood);
  pole.position.y = 5;
  pole.castShadow = true;
  group.add(pole);
  for (const height of [7.4, 8.6]) {
    const cross = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.18, 0.22), wood);
    cross.position.y = height;
    cross.castShadow = true;
    group.add(cross);
    for (const x of [-1.8, -0.9, 0.9, 1.8]) {
      matrix.makeTranslation(x, height + 0.18, 0);
      insulators.setMatrixAt(insulatorIndex, matrix);
      insulatorIndex += 1;
    }
  }
  group.add(insulators);
  ReplaceRootMeshesWithBaked(group, (mesh) => !mesh.isInstancedMesh);
  group.position.set(37, 0, 7);
  return group;
}

function CreateTelephoneNetwork() {
  const group = new THREE.Group();
  const polePoints = [
    { x: -5, z: -7 },
    { x: 5, z: -5 },
    { x: 15, z: -2 },
    { x: 25, z: 2 },
    { x: 37, z: 7 },
    { x: 49, z: 10 },
    { x: 58, z: 12 },
  ];
  const poleGeometry = new THREE.CylinderGeometry(0.11, 0.18, 5.8, 7);
  const crossGeometry = new THREE.BoxGeometry(1.7, 0.12, 0.16);
  const insulatorGeometry = new THREE.SphereGeometry(0.08, 7, 5);
  const poleMaterial = CreateMaterial(0x433426, 0.98);
  const insulatorMaterial = CreateMaterial(0x8c9691, 0.48, 0.08);
  const poles = new THREE.InstancedMesh(poleGeometry, poleMaterial, polePoints.length);
  const crossbars = new THREE.InstancedMesh(crossGeometry, poleMaterial, polePoints.length);
  const insulators = new THREE.InstancedMesh(insulatorGeometry, insulatorMaterial, polePoints.length * 4);
  const matrix = new THREE.Matrix4();
  polePoints.forEach((point, index) => {
    matrix.makeTranslation(point.x, 2.9, point.z);
    poles.setMatrixAt(index, matrix);
    matrix.makeTranslation(point.x, 5.58, point.z);
    crossbars.setMatrixAt(index, matrix);
    for (let insulatorIndex = 0; insulatorIndex < 4; insulatorIndex += 1) {
      matrix.makeTranslation(point.x - 0.66 + insulatorIndex * 0.44, 5.72, point.z);
      insulators.setMatrixAt(index * 4 + insulatorIndex, matrix);
    }
  });
  poles.castShadow = true;
  crossbars.castShadow = true;
  group.add(poles, crossbars, insulators);

  const wirePositions = [];
  for (const lateral of [-0.55, 0.55]) {
    for (let segmentIndex = 0; segmentIndex < polePoints.length - 1; segmentIndex += 1) {
      const start = polePoints[segmentIndex];
      const end = polePoints[segmentIndex + 1];
      const samples = 8;
      for (let sample = 0; sample < samples; sample += 1) {
        const firstT = sample / samples;
        const secondT = (sample + 1) / samples;
        for (const t of [firstT, secondT]) {
          const sag = Math.sin(t * Math.PI) * 0.34;
          wirePositions.push(
            THREE.MathUtils.lerp(start.x, end.x, t) + lateral,
            5.78 - sag,
            THREE.MathUtils.lerp(start.z, end.z, t),
          );
        }
      }
    }
  }
  const wireGeometry = new THREE.BufferGeometry();
  wireGeometry.setAttribute("position", new THREE.Float32BufferAttribute(wirePositions, 3));
  const wires = new THREE.LineSegments(
    wireGeometry,
    new THREE.LineBasicMaterial({ color: 0x282b28, transparent: true, opacity: 0.9 }),
  );
  group.add(wires);
  group.userData.wires = wires;
  return group;
}

function CreateGroundDetails(scene) {
  const stoneGeometry = new THREE.DodecahedronGeometry(0.35, 0);
  const stoneMaterial = CreateMaterial(terrainPalette.stone, 1);
  const stoneCount = 180;
  const stones = new THREE.InstancedMesh(stoneGeometry, stoneMaterial, stoneCount);
  const matrix = new THREE.Matrix4();
  for (let index = 0; index < stoneCount; index += 1) {
    const x = -52 + Deterministic(index, 2) * 108;
    const z = -38 + Deterministic(index, 3) * 78;
    const scale = 0.35 + Deterministic(index, 4) * 0.9;
    matrix.compose(
      new THREE.Vector3(x, GetSurfaceHeight(x, z) + 0.08, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(Deterministic(index, 5), Deterministic(index, 6) * Math.PI, 0)),
      new THREE.Vector3(scale, scale * 0.55, scale),
    );
    stones.setMatrixAt(index, matrix);
  }
  stones.castShadow = true;
  stones.receiveShadow = true;
  scene.add(stones);

  const stalkGeometry = new THREE.CylinderGeometry(0.035, 0.055, 1.6, 5);
  const stalkMaterial = CreateMaterial(terrainPalette.crop, 0.96);
  const cropCount = 620;
  const crops = new THREE.InstancedMesh(stalkGeometry, stalkMaterial, cropCount);
  for (let index = 0; index < cropCount; index += 1) {
    const zone = index % 4 === 0 ? activeMissionDefinition.zones[1] : activeMissionDefinition.zones[0];
    const x = zone.x - zone.width * 0.5 + Deterministic(index, 11) * zone.width;
    const z = zone.z - zone.depth * 0.5 + Deterministic(index, 13) * zone.depth;
    const height = 0.72 + Deterministic(index, 17) * 0.75;
    matrix.compose(
      new THREE.Vector3(x, GetSurfaceHeight(x, z) + height * 0.8, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0.06 * (Deterministic(index, 19) - 0.5), 0, 0.09 * (Deterministic(index, 23) - 0.5))),
      new THREE.Vector3(0.8, height, 0.8),
    );
    crops.setMatrixAt(index, matrix);
  }
  crops.castShadow = true;
  scene.add(crops);

  const treeTrunkGeometry = new THREE.CylinderGeometry(0.16, 0.28, 3.4, 8);
  const treeCrownGeometry = new THREE.DodecahedronGeometry(1.25, 1);
  const trunkMaterial = CreateMaterial(0x4b3b2c, 1);
  const crownMaterial = CreateMaterial(0x3f5544, 1);
  const treeCount = 48;
  const trunks = new THREE.InstancedMesh(treeTrunkGeometry, trunkMaterial, treeCount);
  const crowns = new THREE.InstancedMesh(treeCrownGeometry, crownMaterial, treeCount);
  for (let index = 0; index < treeCount; index += 1) {
    const edge = index % 3;
    const x = edge === 0 ? -49 + Deterministic(index, 31) * 18 : -45 + Deterministic(index, 37) * 98;
    const z = edge === 0 ? -34 + Deterministic(index, 41) * 70 : 24 + Deterministic(index, 43) * 15;
    const height = 0.8 + Deterministic(index, 47) * 0.8;
    matrix.compose(new THREE.Vector3(x, 1.7 * height, z), new THREE.Quaternion(), new THREE.Vector3(1, height, 1));
    trunks.setMatrixAt(index, matrix);
    matrix.compose(
      new THREE.Vector3(x, 3.9 * height, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Deterministic(index, 51) * Math.PI, 0)),
      new THREE.Vector3(1.2, 1.65 * height, 1.2),
    );
    crowns.setMatrixAt(index, matrix);
  }
  trunks.castShadow = true;
  crowns.castShadow = true;
  scene.add(trunks, crowns);
}

function CreateAtmosphere(scene, profile) {
  const hillMaterial = CreateMaterial(profile.hillColor, 1);
  const hills = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 7), hillMaterial, 18);
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  for (let index = 0; index < 18; index += 1) {
    const radius = 16 + Deterministic(index, 61) * 19;
    const height = 10 + Deterministic(index, 67) * 18;
    const angle = (index / 18) * Math.PI * 2;
    quaternion.setFromEuler(new THREE.Euler(0, Deterministic(index, 79) * Math.PI, 0));
    matrix.compose(
      new THREE.Vector3(
        Math.cos(angle) * (83 + Deterministic(index, 71) * 18),
        -1.5,
        Math.sin(angle) * (75 + Deterministic(index, 73) * 20),
      ),
      quaternion,
      new THREE.Vector3(radius, height, radius),
    );
    hills.setMatrixAt(index, matrix);
  }
  scene.add(hills);
}

function WrapWeatherCoordinate(value, minimum, maximum) {
  const span = Math.max(0.001, maximum - minimum);
  return minimum + (((value - minimum) % span) + span) % span;
}

function CreateWeatherEffect(profile, quality) {
  const bounds = activeMissionDefinition.bounds;
  const lowQuality = quality === "low";
  const count = lowQuality ? 72 : 132;
  if (profile.weatherKind === "rain") {
    const positions = new Float32Array(count * 6);
    for (let index = 0; index < count; index += 1) {
      const offset = index * 6;
      const x = THREE.MathUtils.lerp(bounds.minimumX, bounds.maximumX, Deterministic(index, 401));
      const y = 1.2 + Deterministic(index, 409) * 18;
      const z = THREE.MathUtils.lerp(bounds.minimumZ, bounds.maximumZ, Deterministic(index, 419));
      positions[offset] = x;
      positions[offset + 1] = y;
      positions[offset + 2] = z;
      positions[offset + 3] = x - profile.weatherDrift[0] * 0.035;
      positions[offset + 4] = y - (0.78 + Deterministic(index, 421) * 0.62);
      positions[offset + 5] = z - profile.weatherDrift[2] * 0.035;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    const effect = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({
        color: 0x9bb1bd,
        transparent: true,
        opacity: lowQuality ? 0.19 : 0.25,
        depthWrite: false,
      }),
    );
    effect.frustumCulled = false;
    effect.renderOrder = 2;
    effect.userData.weatherKind = profile.weatherKind;
    effect.userData.drift = [...profile.weatherDrift];
    effect.userData.bounds = bounds;
    return effect;
  }

  const positions = new Float32Array(count * 3);
  const dust = profile.weatherKind === "dust";
  for (let index = 0; index < count; index += 1) {
    const offset = index * 3;
    positions[offset] = THREE.MathUtils.lerp(bounds.minimumX, bounds.maximumX, Deterministic(index, 431));
    positions[offset + 1] = dust
      ? 0.35 + Deterministic(index, 433) * 4.6
      : 0.8 + Deterministic(index, 439) * 7.5;
    positions[offset + 2] = THREE.MathUtils.lerp(bounds.minimumZ, bounds.maximumZ, Deterministic(index, 443));
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const effect = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: dust ? 0xc9ad7b : 0xb4c6bd,
      size: dust ? (lowQuality ? 0.42 : 0.55) : lowQuality ? 1.7 : 2.25,
      transparent: true,
      opacity: dust ? 0.2 : 0.105,
      depthWrite: false,
      sizeAttenuation: true,
    }),
  );
  effect.frustumCulled = false;
  effect.renderOrder = 2;
  effect.userData.weatherKind = profile.weatherKind;
  effect.userData.drift = [...profile.weatherDrift];
  effect.userData.bounds = bounds;
  return effect;
}

function UpdateWeatherEffect(effect, deltaTime, elapsed) {
  if (!effect) return;
  const positions = effect.geometry.getAttribute("position");
  const { weatherKind, drift, bounds } = effect.userData;
  const rain = weatherKind === "rain";
  const stride = rain ? 6 : 3;
  const particleCount = positions.array.length / stride;
  for (let index = 0; index < particleCount; index += 1) {
    const offset = index * stride;
    let x = positions.array[offset] + drift[0] * deltaTime;
    let y = positions.array[offset + 1] + drift[1] * deltaTime;
    let z = positions.array[offset + 2] + drift[2] * deltaTime;
    x = WrapWeatherCoordinate(x, bounds.minimumX, bounds.maximumX);
    z = WrapWeatherCoordinate(z, bounds.minimumZ, bounds.maximumZ);
    if (rain && y < 0.25) y = 15 + Deterministic(index + Math.floor(elapsed * 2), 449) * 6;
    if (!rain) {
      const maximumY = weatherKind === "dust" ? 5 : 8.5;
      if (y > maximumY) y = 0.35;
      y += Math.sin(elapsed * (weatherKind === "dust" ? 1.7 : 0.55) + index) * deltaTime * 0.08;
    }
    positions.array[offset] = x;
    positions.array[offset + 1] = y;
    positions.array[offset + 2] = z;
    if (rain) {
      positions.array[offset + 3] = x - drift[0] * 0.035;
      positions.array[offset + 4] = y - 1.08;
      positions.array[offset + 5] = z - drift[2] * 0.035;
    }
  }
  positions.needsUpdate = true;
}

function ResolveActorPose(actor, context) {
  const commandKind = actor.command?.kind ?? null;
  const commandProgress = actor.command?.progress ?? actor.command?.aim ?? 0;
  const locomotionSwing =
    !context.isLastKnown && context.moved > 0.01 ? Math.sin(context.phase) * 0.48 : 0;
  const pose = {
    scaleY:
      context.isLastKnown
        ? 0.92
        : actor.state === "downed"
          ? 0.22
          : actor.stance === "crouch"
            ? 0.72
            : actor.state === "wounded"
              ? 0.84
              : 1,
    bodyPitch: 0,
    armPitch: [locomotionSwing, -locomotionSwing],
    armRoll: [0, 0],
    legPitch: [-locomotionSwing, locomotionSwing],
  };
  const isAiming =
    ["attack", "suppress", "overwatch"].includes(commandKind) ||
    (context.enemy && actor.state === "combat" && Boolean(actor.fireIntent));
  if (isAiming) {
    const aimWeight = THREE.MathUtils.clamp(0.5 + commandProgress * 1.4, 0.5, 1);
    pose.bodyPitch -= 0.12 * aimWeight;
    pose.armPitch[0] = THREE.MathUtils.lerp(pose.armPitch[0], 0.94, aimWeight);
    pose.armPitch[1] = THREE.MathUtils.lerp(pose.armPitch[1], 1.08, aimWeight);
    pose.armRoll[0] = -0.2 * aimWeight;
    pose.armRoll[1] = 0.12 * aimWeight;
  } else if (commandKind === "observe") {
    pose.bodyPitch = -0.08;
    pose.armPitch = [1.28, 1.28];
    pose.armRoll = [-0.16, 0.16];
  } else if (commandKind === "stone") {
    const throwCycle = THREE.MathUtils.clamp(commandProgress * 1.7, 0, 1);
    pose.bodyPitch = -0.08 + throwCycle * 0.22;
    pose.armPitch = [0.24, 1.3 - throwCycle * 0.45];
    pose.armRoll = [-0.08, 0.32];
  } else if (commandKind === "takedown") {
    pose.scaleY = Math.min(pose.scaleY, 0.78);
    pose.bodyPitch = 0.34;
    pose.armPitch = [0.92, 0.78];
    pose.armRoll = [-0.28, 0.28];
  } else if (commandKind === "hideBody" || actor.carrying) {
    pose.scaleY = Math.min(pose.scaleY, 0.74);
    pose.bodyPitch = 0.5;
    pose.armPitch = [0.86, 0.86];
    pose.armRoll = [-0.34, 0.34];
    pose.legPitch = [-0.12, 0.34];
  } else if (
    actor.id === "hanShilei" &&
    (commandKind === "interact" || commandKind === "charge")
  ) {
    const workCycle = Math.sin(context.phase * 1.65) * 0.12;
    pose.scaleY = 0.64;
    pose.bodyPitch = 0.42;
    pose.armPitch = [0.76 + workCycle, 0.96 - workCycle];
    pose.armRoll = [-0.22, 0.18];
    pose.legPitch = [1.06, 0.18];
  } else if (
    actor.id === "luLanzhi" &&
    (commandKind === "aid" || commandKind === "interact")
  ) {
    const careCycle = Math.sin(context.phase) * 0.06;
    pose.scaleY = 0.58;
    pose.bodyPitch = 0.54;
    pose.armPitch = [0.72 + careCycle, 0.88 - careCycle];
    pose.armRoll = [-0.3, 0.3];
    pose.legPitch = [1.12, 0.24];
  } else if (commandKind === "interact" || commandKind === "charge") {
    pose.scaleY = Math.min(pose.scaleY, 0.76);
    pose.bodyPitch = 0.34;
    pose.armPitch = [0.68, 0.82];
    pose.armRoll = [-0.2, 0.2];
  } else if (commandKind === "steady") {
    pose.armPitch = [0.54, 0.62];
    pose.armRoll = [-0.18, 0.18];
  }

  if (context.suppressionRatio > 0.05 && actor.state !== "downed") {
    const curl = context.suppressionRatio;
    pose.scaleY *= 1 - curl * 0.2;
    pose.bodyPitch += curl * 0.38;
    pose.armPitch[0] += curl * 0.52;
    pose.armPitch[1] += curl * 0.52;
    pose.armRoll[0] -= curl * 0.32;
    pose.armRoll[1] += curl * 0.32;
  }
  pose.bodyPitch -= context.fireRecoil * 0.2;
  pose.armPitch[0] -= context.fireRecoil * 0.26;
  pose.armPitch[1] -= context.fireRecoil * 0.34;
  return pose;
}

function CreateRoad(scene) {
  const roadMaterial = CreateMaterial(0x675b43, 1);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(112, 7), roadMaterial);
  road.rotation.x = -Math.PI * 0.5;
  road.rotation.z = -0.08;
  road.position.set(4, 0.035, -6);
  road.receiveShadow = true;
  scene.add(road);
  const path = new THREE.Mesh(new THREE.PlaneGeometry(68, 3.2), roadMaterial);
  path.rotation.x = -Math.PI * 0.5;
  path.rotation.z = 1.15;
  path.position.set(-7, 0.038, 20);
  scene.add(path);
}

function CreateProductionDetails() {
  const root = new THREE.Group();
  const stone = CreateMaterial(0x817a67, 1);
  const timber = CreateMaterial(0x5a432d, 0.98);
  const dark = CreateMaterial(0x302d27, 1);
  const earth = CreateMaterial(0x756346, 1);

  const wellCurb = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.24, 6, 18), stone);
  wellCurb.rotation.x = Math.PI * 0.5;
  wellCurb.position.set(4.1, 0.48, 23.8);
  root.add(wellCurb);
  const wellMouth = new THREE.Mesh(new THREE.CylinderGeometry(0.78, 0.78, 0.08, 18), dark);
  wellMouth.position.set(4.1, 0.45, 23.8);
  root.add(wellMouth);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 2.8, 7), timber);
    post.position.set(4.1 + side * 1.25, 1.45, 23.8);
    root.add(post);
  }
  const spindle = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 2.6, 8), timber);
  spindle.rotation.z = Math.PI * 0.5;
  spindle.position.set(4.1, 1.85, 23.8);
  root.add(spindle);

  for (let index = 0; index < 16; index += 1) {
    const log = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.13, 1.9, 6), timber);
    log.rotation.z = Math.PI * 0.5;
    log.rotation.y = (Deterministic(index, 307) - 0.5) * 0.16;
    log.position.set(
      -10.5 + (index % 4) * 0.12,
      0.16 + Math.floor(index / 4) * 0.22,
      16 + (index % 4) * 0.42,
    );
    root.add(log);
  }

  for (const z of [-8.5, -5.65]) {
    const rut = new THREE.Mesh(new THREE.BoxGeometry(31, 0.045, 0.14), earth);
    rut.rotation.y = -0.08;
    rut.position.set(15, 0.03, z);
    root.add(rut);
  }

  const result = BakeMeshRoots([root]);
  if (!result) return root;
  result.sourceMeshes.forEach((mesh) => mesh.geometry.dispose());
  result.baked.castShadow = false;
  result.baked.receiveShadow = true;
  result.baked.userData.productionDetails = true;
  return result.baked;
}

function CreateOperationFallbackDetails() {
  const root = new THREE.Group();
  if (activeMissionDefinition.id === "nightRendezvous") {
    const water = CreateMaterial(0x17363e, 0.42, 0.04);
    const stone = CreateMaterial(0x5c5c50, 1);
    const timber = CreateMaterial(0x4f3825, 0.96);
    const creek = new THREE.Mesh(new THREE.BoxGeometry(10, 0.18, 86), stone);
    creek.position.set(16, -0.12, 4);
    root.add(creek);
    const creekWater = new THREE.Mesh(new THREE.BoxGeometry(8.7, 0.055, 85.2), water);
    creekWater.position.set(16, 0.005, 4);
    root.add(creekWater);
    for (const side of [-1, 1]) {
      const sluicePost = new THREE.Mesh(new THREE.BoxGeometry(0.28, 2.7, 0.42), timber);
      sluicePost.position.set(26 + side * 1.35, 1.35, 34);
      root.add(sluicePost);
    }
    const sluiceGate = new THREE.Mesh(new THREE.BoxGeometry(2.55, 1.9, 0.34), timber);
    sluiceGate.position.set(26, 1, 34);
    root.add(sluiceGate);
  } else if (activeMissionDefinition.id === "quarryInterdiction") {
    const timber = CreateMaterial(0x493725, 0.98);
    const metal = CreateMaterial(0x343735, 0.5, 0.45);
    for (const z of [-5.72, -4.28]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(88, 0.13, 0.11), metal);
      rail.position.set(5, GetSurfaceHeight(5, z) + 0.17, z);
      root.add(rail);
    }
    for (let index = 0; index < 29; index += 1) {
      const x = -38 + index * 3.05;
      const sleeper = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 2.45), timber);
      sleeper.position.set(x, GetSurfaceHeight(x, -5) + 0.08, -5);
      root.add(sleeper);
    }
    for (const x of [41.8, 45, 48.2]) {
      const support = new THREE.Mesh(new THREE.BoxGeometry(0.42, 5.4, 0.42), timber);
      support.position.set(x, GetSurfaceHeight(x, 23) + 2.7, 23);
      support.rotation.z = THREE.MathUtils.degToRad((x - 45) * 4.4);
      root.add(support);
    }
  }
  const result = BakeMeshRoots([root]);
  if (!result) return root;
  result.sourceMeshes.forEach((mesh) => mesh.geometry.dispose());
  result.baked.castShadow = false;
  result.baked.receiveShadow = true;
  result.baked.userData.operationFallback = activeMissionDefinition.id;
  return result.baked;
}

const digitSegments = Object.freeze([
  Object.freeze([-0.22, -0.34, 0.22, -0.34]),
  Object.freeze([0.22, -0.34, 0.22, 0]),
  Object.freeze([0.22, 0, 0.22, 0.34]),
  Object.freeze([-0.22, 0.34, 0.22, 0.34]),
  Object.freeze([-0.22, 0, -0.22, 0.34]),
  Object.freeze([-0.22, -0.34, -0.22, 0]),
  Object.freeze([-0.22, 0, 0.22, 0]),
]);
const digitSegmentIndices = Object.freeze({
  1: Object.freeze([1, 2]),
  2: Object.freeze([0, 1, 6, 4, 3]),
  3: Object.freeze([0, 1, 6, 2, 3]),
  4: Object.freeze([5, 6, 1, 2]),
});

function CreatePlanningOverlay() {
  const root = new THREE.Group();
  root.renderOrder = 16;
  const createLines = (opacity = 0.9) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute([], 3));
    geometry.setAttribute("color", new THREE.Float32BufferAttribute([], 3));
    const lines = new THREE.LineSegments(
      geometry,
      new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity,
        depthWrite: false,
        depthTest: false,
      }),
    );
    lines.renderOrder = 16;
    root.add(lines);
    return lines;
  };
  const paths = createLines(0.88);
  const digits = createLines(1);
  const previews = createLines(0.76);
  const patrols = createLines(0.72);
  const nodeGeometry = new THREE.BufferGeometry();
  nodeGeometry.setAttribute("position", new THREE.Float32BufferAttribute([], 3));
  nodeGeometry.setAttribute("color", new THREE.Float32BufferAttribute([], 3));
  const nodes = new THREE.Points(
    nodeGeometry,
    new THREE.PointsMaterial({
      size: 0.72,
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      depthTest: false,
      sizeAttenuation: true,
    }),
  );
  nodes.renderOrder = 17;
  root.add(nodes);

  const sectorGeometry = new THREE.BufferGeometry();
  sectorGeometry.setAttribute("position", new THREE.Float32BufferAttribute([], 3));
  sectorGeometry.setAttribute("color", new THREE.Float32BufferAttribute([], 3));
  const sectors = new THREE.Mesh(
    sectorGeometry,
    CreateOverlayMaterial({
      vertexColors: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    }),
  );
  sectors.renderOrder = 15;
  root.add(sectors);
  const awarenessGeometry = new THREE.BufferGeometry();
  awarenessGeometry.setAttribute("position", new THREE.Float32BufferAttribute([], 3));
  awarenessGeometry.setAttribute("color", new THREE.Float32BufferAttribute([], 3));
  const awareness = new THREE.Mesh(
    awarenessGeometry,
    CreateOverlayMaterial({ vertexColors: true, opacity: 0.92, side: THREE.DoubleSide }),
  );
  awareness.renderOrder = 18;
  root.add(awareness);
  return { root, paths, digits, previews, patrols, nodes, sectors, awareness };
}

function SetDynamicGeometry(object, positions, colors) {
  object.geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  object.geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  object.geometry.setDrawRange(0, positions.length / 3);
  object.visible = positions.length > 0;
}

function PushColoredVertex(positions, colors, x, y, z, color) {
  positions.push(x, y, z);
  colors.push(color.r, color.g, color.b);
}

function PushColoredQuad(positions, colors, minimumX, maximumX, minimumZ, maximumZ, y, color) {
  for (const [x, z] of [
    [minimumX, minimumZ], [maximumX, minimumZ], [maximumX, maximumZ],
    [minimumX, minimumZ], [maximumX, maximumZ], [minimumX, maximumZ],
  ]) PushColoredVertex(positions, colors, x, y, z, color);
}

function ResolveCommandPosition(command, state) {
  if (Number.isFinite(command?.x) && Number.isFinite(command?.z)) return command;
  if (!command?.targetId) return null;
  const unit = state.units.find((candidate) => candidate.id === command.targetId);
  if (unit) return unit;
  const enemy = state.enemies.find((candidate) => candidate.id === command.targetId);
  if (enemy) return GetEnemyIntelRenderState(enemy).position;
  const runtime = state.interactables[command.targetId];
  if (runtime?.droppedAt) return runtime.droppedAt;
  return activeMissionDefinition.interactables.find((candidate) => candidate.id === command.targetId) ?? null;
}

function GetPreviewWaypoints(origin, command, target) {
  if (command.kind !== "move") return [target];
  if (command.waypoints?.length) {
    return command.waypoints.slice(Math.min(command.waypointIndex ?? 0, command.waypoints.length));
  }
  return FindPath2D(origin, target, { clearance: 0.68 });
}

function SampleRoute(start, waypoints, spacing = 4) {
  const samples = [];
  let previous = start;
  for (const waypoint of waypoints) {
    const distance = Math.hypot(waypoint.x - previous.x, waypoint.z - previous.z);
    const steps = Math.max(1, Math.ceil(distance / spacing));
    for (let step = 1; step <= steps; step += 1) {
      const ratio = step / steps;
      samples.push({
        x: THREE.MathUtils.lerp(previous.x, waypoint.x, ratio),
        z: THREE.MathUtils.lerp(previous.z, waypoint.z, ratio),
      });
    }
    previous = waypoint;
  }
  return samples;
}

function UpdatePlanningOverlay(overlay, state) {
  const pathPositions = [];
  const pathColors = [];
  const nodePositions = [];
  const nodeColors = [];
  const digitPositions = [];
  const digitColors = [];
  const previewPositions = [];
  const previewColors = [];
  const sectorPositions = [];
  const sectorColors = [];
  const patrolPositions = [];
  const patrolColors = [];
  const awarenessPositions = [];
  const awarenessColors = [];
  const suppressColor = new THREE.Color(0xff7857);
  const stoneColor = new THREE.Color(0xf6cf74);
  const patrolColor = new THREE.Color(0xffa15e);
  const blastColor = new THREE.Color(0xff4c42);

  for (const unit of state.units) {
    if (unit.state === "dead" || unit.state === "evacuated") continue;
    const commands = [unit.command, ...(unit.queue ?? [])].filter(Boolean);
    const unitColor = new THREE.Color(GetCharacterDefinition(unit.id)?.accent ?? terrainPalette.friendly);
    let previous = unit;
    commands.forEach((command, commandIndex) => {
      const target = ResolveCommandPosition(command, state);
      if (!target) return;
      const routeWaypoints = GetPreviewWaypoints(previous, command, target);
      let routePrevious = previous;
      for (const waypoint of routeWaypoints) {
        const previousY = GetSurfaceHeight(routePrevious.x, routePrevious.z) + 0.24;
        const waypointY = GetSurfaceHeight(waypoint.x, waypoint.z) + 0.24;
        PushColoredVertex(pathPositions, pathColors, routePrevious.x, previousY, routePrevious.z, unitColor);
        PushColoredVertex(pathPositions, pathColors, waypoint.x, waypointY, waypoint.z, unitColor);
        routePrevious = waypoint;
      }
      const targetY = GetSurfaceHeight(target.x, target.z) + 0.24;
      PushColoredVertex(nodePositions, nodeColors, target.x, targetY + 0.05, target.z, unitColor);

      const segments = digitSegmentIndices[Math.min(4, commandIndex + 1)] ?? digitSegmentIndices[4];
      for (const segmentIndex of segments) {
        const segment = digitSegments[segmentIndex];
        PushColoredVertex(digitPositions, digitColors, target.x + segment[0], targetY + 0.09, target.z + segment[1], unitColor);
        PushColoredVertex(digitPositions, digitColors, target.x + segment[2], targetY + 0.09, target.z + segment[3], unitColor);
      }

      if (command.kind === "stone") {
        const radius = 14;
        for (let segmentIndex = 0; segmentIndex < 42; segmentIndex += 1) {
          const firstAngle = (segmentIndex / 42) * Math.PI * 2;
          const secondAngle = ((segmentIndex + 0.64) / 42) * Math.PI * 2;
          for (const angle of [firstAngle, secondAngle]) {
            const x = target.x + Math.sin(angle) * radius;
            const z = target.z + Math.cos(angle) * radius;
            PushColoredVertex(previewPositions, previewColors, x, GetSurfaceHeight(x, z) + 0.19, z, stoneColor);
          }
        }
      } else if (command.kind === "suppress") {
        const direction = Math.atan2(target.x - unit.x, target.z - unit.z);
        const range = 18;
        const halfAngle = 0.52;
        const left = { x: unit.x + Math.sin(direction - halfAngle) * range, z: unit.z + Math.cos(direction - halfAngle) * range };
        const right = { x: unit.x + Math.sin(direction + halfAngle) * range, z: unit.z + Math.cos(direction + halfAngle) * range };
        for (const point of [left, right]) {
          PushColoredVertex(previewPositions, previewColors, unit.x, GetSurfaceHeight(unit.x, unit.z) + 0.2, unit.z, suppressColor);
          PushColoredVertex(previewPositions, previewColors, point.x, GetSurfaceHeight(point.x, point.z) + 0.2, point.z, suppressColor);
        }
        for (const point of [unit, left, right]) {
          PushColoredVertex(sectorPositions, sectorColors, point.x, GetSurfaceHeight(point.x, point.z) + 0.17, point.z, suppressColor);
        }
      } else if (command.kind === "charge") {
        const blastRadius = command.targetId === "rockfall" ? 13 : 12;
        for (let segmentIndex = 0; segmentIndex < 48; segmentIndex += 1) {
          const firstAngle = (segmentIndex / 48) * Math.PI * 2;
          const secondAngle = ((segmentIndex + 0.72) / 48) * Math.PI * 2;
          for (const angle of [firstAngle, secondAngle]) {
            const x = target.x + Math.sin(angle) * blastRadius;
            const z = target.z + Math.cos(angle) * blastRadius;
            PushColoredVertex(previewPositions, previewColors, x, GetSurfaceHeight(x, z) + 0.22, z, blastColor);
          }
        }
        for (let tickIndex = 0; tickIndex < 8; tickIndex += 1) {
          const angle = (tickIndex / 8) * Math.PI * 2;
          for (const radius of [blastRadius * 0.82, blastRadius]) {
            const x = target.x + Math.sin(angle) * radius;
            const z = target.z + Math.cos(angle) * radius;
            PushColoredVertex(previewPositions, previewColors, x, GetSurfaceHeight(x, z) + 0.22, z, blastColor);
          }
        }
      }
      if (state.paused && command.kind === "move") {
        const soundSamples = SampleRoute(previous, routeWaypoints, Math.max(3.4, GetSoundRadius(unit) * 0.8));
        for (const sample of soundSamples) {
          const routeActor = { ...unit, x: sample.x, z: sample.z };
          const soundRadius = GetSoundRadius(routeActor);
          const soundColor = new THREE.Color(
            unit.stance === "crouch" ? 0x79c9ad : unit.stance === "sprint" ? 0xff6650 : 0xe9c16c,
          );
          for (let segmentIndex = 0; segmentIndex < 24; segmentIndex += 1) {
            const firstAngle = (segmentIndex / 24) * Math.PI * 2;
            const secondAngle = ((segmentIndex + 0.58) / 24) * Math.PI * 2;
            for (const angle of [firstAngle, secondAngle]) {
              const x = sample.x + Math.sin(angle) * soundRadius;
              const z = sample.z + Math.cos(angle) * soundRadius;
              PushColoredVertex(previewPositions, previewColors, x, GetSurfaceHeight(x, z) + 0.21, z, soundColor);
            }
          }
          for (const enemy of state.enemies) {
            const intel = GetEnemyIntelRenderState(enemy);
            if (!intel.canTarget || !intel.position || enemy.disabled || enemy.health <= 0) continue;
            if (Math.hypot(intel.position.x - sample.x, intel.position.z - sample.z) > soundRadius) continue;
            PushColoredVertex(previewPositions, previewColors, sample.x, GetSurfaceHeight(sample.x, sample.z) + 0.23, sample.z, blastColor);
            PushColoredVertex(
              previewPositions,
              previewColors,
              intel.position.x,
              GetSurfaceHeight(intel.position.x, intel.position.z) + 0.23,
              intel.position.z,
              blastColor,
            );
          }
        }
      }
      previous = target;
    });
  }

  const renderedPatrols = new Set();
  for (const enemy of state.enemies) {
    const intel = GetEnemyIntelRenderState(enemy);
    if (!intel.showPatrol || !enemy.patrol || renderedPatrols.has(enemy.patrol)) continue;
    const patrol = activeMissionDefinition.patrols.find((candidate) => candidate.id === enemy.patrol);
    if (!patrol || patrol.points.length < 2) continue;
    renderedPatrols.add(enemy.patrol);
    for (let pointIndex = 0; pointIndex < patrol.points.length; pointIndex += 1) {
      const start = patrol.points[pointIndex];
      const end = patrol.points[(pointIndex + 1) % patrol.points.length];
      PushColoredVertex(patrolPositions, patrolColors, start.x, GetSurfaceHeight(start.x, start.z) + 0.28, start.z, patrolColor);
      PushColoredVertex(patrolPositions, patrolColors, end.x, GetSurfaceHeight(end.x, end.z) + 0.28, end.z, patrolColor);
    }
  }

  for (const enemy of state.enemies) {
    const intel = GetEnemyIntelRenderState(enemy);
    if (!intel.showAwareness || enemy.disabled || enemy.health <= 0) continue;
    const awareness = THREE.MathUtils.clamp((enemy.awareness ?? 0) / 100, 0, 1);
    const y = GetSurfaceHeight(enemy.x, enemy.z) + 0.34;
    const minimumX = enemy.x - 0.9;
    const maximumX = enemy.x + 0.9;
    const minimumZ = enemy.z + 1.02;
    const maximumZ = minimumZ + 0.24;
    const backgroundColor = new THREE.Color(0x252521);
    const stateColor = new THREE.Color(
      enemy.state === "combat" || enemy.state === "report"
        ? 0xff4f45
        : enemy.state === "investigate" || enemy.state === "search"
          ? 0xf0b34e
          : enemy.state === "routed"
            ? 0x729cba
            : 0x8bb18a,
    );
    PushColoredQuad(awarenessPositions, awarenessColors, minimumX, maximumX, minimumZ, maximumZ, y, backgroundColor);
    PushColoredQuad(
      awarenessPositions,
      awarenessColors,
      minimumX,
      minimumX + 0.09,
      minimumZ,
      maximumZ,
      y + 0.014,
      stateColor,
    );
    if (awareness > 0.01) {
      PushColoredQuad(
        awarenessPositions,
        awarenessColors,
        minimumX + 0.04,
        THREE.MathUtils.lerp(minimumX + 0.04, maximumX - 0.04, awareness),
        minimumZ + 0.04,
        maximumZ - 0.04,
        y + 0.012,
        stateColor,
      );
    }
  }

  SetDynamicGeometry(overlay.paths, pathPositions, pathColors);
  SetDynamicGeometry(overlay.nodes, nodePositions, nodeColors);
  SetDynamicGeometry(overlay.digits, digitPositions, digitColors);
  SetDynamicGeometry(overlay.previews, previewPositions, previewColors);
  SetDynamicGeometry(overlay.sectors, sectorPositions, sectorColors);
  SetDynamicGeometry(overlay.patrols, patrolPositions, patrolColors);
  SetDynamicGeometry(overlay.awareness, awarenessPositions, awarenessColors);
}

function CreateDustCloudEffect() {
  const root = new THREE.Group();
  root.visible = false;
  const groundRange = new THREE.Mesh(
    new THREE.CircleGeometry(1, 40),
    CreateOverlayMaterial({
      color: 0xa88e69,
      opacity: 0,
      side: THREE.DoubleSide,
    }),
  );
  groundRange.rotation.x = -Math.PI * 0.5;
  groundRange.position.y = 0.14;
  groundRange.renderOrder = 8;
  root.add(groundRange);

  const cloudMaterial = new THREE.MeshBasicMaterial({
    color: 0xa89473,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: true,
  });
  const clouds = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), cloudMaterial, 7);
  clouds.renderOrder = 7;
  root.add(clouds);
  root.userData = {
    groundRange,
    clouds,
    maximumRemaining: 0,
    geometryKey: "",
    wasActive: false,
  };
  return root;
}

function UpdateDustCloudEffect(effect, dustCloud, elapsed) {
  if (!dustCloud || !(dustCloud.remaining > 0) || !(dustCloud.radius > 0)) {
    effect.visible = false;
    effect.userData.wasActive = false;
    return;
  }
  effect.visible = true;
  if (!effect.userData.wasActive) effect.userData.maximumRemaining = dustCloud.remaining;
  effect.userData.wasActive = true;
  const radius = dustCloud.radius;
  const geometryKey = `${dustCloud.x.toFixed(2)}:${dustCloud.z.toFixed(2)}:${radius.toFixed(2)}`;
  if (geometryKey !== effect.userData.geometryKey) {
    effect.userData.geometryKey = geometryKey;
    effect.userData.maximumRemaining = dustCloud.remaining;
    const baseHeight = GetSurfaceHeight(dustCloud.x, dustCloud.z);
    effect.position.set(dustCloud.x, baseHeight, dustCloud.z);
    effect.userData.groundRange.scale.setScalar(radius);
    const matrix = new THREE.Matrix4();
    for (let index = 0; index < effect.userData.clouds.count; index += 1) {
      const angle = (index / effect.userData.clouds.count) * Math.PI * 2 + Deterministic(index, 211) * 0.8;
      const distance = radius * (index === 0 ? 0.08 : 0.22 + Deterministic(index, 223) * 0.5);
      const worldX = dustCloud.x + Math.sin(angle) * distance;
      const worldZ = dustCloud.z + Math.cos(angle) * distance;
      const localHeight = GetSurfaceHeight(worldX, worldZ) - baseHeight + 0.8 + Deterministic(index, 227) * 1.4;
      const width = radius * (0.16 + Deterministic(index, 229) * 0.13);
      matrix.compose(
        new THREE.Vector3(worldX - dustCloud.x, localHeight, worldZ - dustCloud.z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Deterministic(index, 233) * Math.PI, 0)),
        new THREE.Vector3(width, width * (0.45 + Deterministic(index, 239) * 0.28), width),
      );
      effect.userData.clouds.setMatrixAt(index, matrix);
    }
    effect.userData.clouds.instanceMatrix.needsUpdate = true;
  }
  effect.userData.maximumRemaining = Math.max(effect.userData.maximumRemaining, dustCloud.remaining);
  const fade = THREE.MathUtils.clamp(dustCloud.remaining / Math.max(0.01, effect.userData.maximumRemaining), 0, 1);
  effect.userData.groundRange.material.opacity = 0.11 * fade;
  effect.userData.clouds.material.opacity = 0.22 * Math.sqrt(fade);
  effect.userData.clouds.rotation.y = elapsed * 0.045;
}

export function CreateWorld(canvas, options = {}) {
  activeMissionDefinition = options.missionDefinition ?? GetOperationLayoutByCampaignIndex(0);
  const useFirstOperationDressing = UsesFirstOperationDressing();
  const atmosphereProfile = GetAtmosphereProfile(activeMissionDefinition);
  const environmentArtDefinition = environmentArtAssets[activeMissionDefinition.id] ?? null;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(atmosphereProfile.background);
  const renderedFogDensity = atmosphereProfile.readabilityContract
    ? Math.min(atmosphereProfile.fogDensity, atmosphereProfile.readabilityContract.maximumFogDensity)
    : atmosphereProfile.fogDensity;
  scene.fog = new THREE.FogExp2(atmosphereProfile.fogColor, renderedFogDensity);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: options.quality !== "low",
    powerPreference: "high-performance",
    alpha: false,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = atmosphereProfile.exposure;
  renderer.shadowMap.enabled = options.quality !== "low";
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const pixelRatioLimit = options.quality === "low" ? 1 : options.quality === "ultra" ? 1.5 : 1.25;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, pixelRatioLimit));

  const camera = new THREE.PerspectiveCamera(44, 1, 0.1, 900);
  const cameraTarget = new THREE.Vector3(
    activeMissionDefinition.camera.target.x,
    activeMissionDefinition.camera.target.y,
    activeMissionDefinition.camera.target.z,
  );
  camera.position.set(
    activeMissionDefinition.camera.position.x,
    activeMissionDefinition.camera.position.y,
    activeMissionDefinition.camera.position.z,
  );
  camera.lookAt(cameraTarget);
  const overviewDirection = camera.position.clone().sub(cameraTarget).normalize();
  const initialCameraDistance = camera.position.distanceTo(cameraTarget);
  camera.userData.overviewMode = true;
  camera.userData.framingMode = "titleOverview";
  camera.userData.overviewRequestedDistance = initialCameraDistance;

  const ambient = new THREE.HemisphereLight(
    atmosphereProfile.hemisphereSky,
    atmosphereProfile.hemisphereGround,
    atmosphereProfile.hemisphereIntensity,
  );
  scene.add(ambient);
  const keyLight = new THREE.DirectionalLight(atmosphereProfile.keyColor, atmosphereProfile.keyIntensity);
  keyLight.position.set(...atmosphereProfile.keyPosition);
  keyLight.target.position.set(16, 0, 5);
  keyLight.castShadow = options.quality !== "low";
  const operationBounds = activeMissionDefinition.bounds;
  const shadowCoverage =
    Math.hypot(
      operationBounds.maximumX - operationBounds.minimumX,
      operationBounds.maximumZ - operationBounds.minimumZ,
    ) * 0.5 + 8;
  keyLight.shadow.camera.left = -shadowCoverage;
  keyLight.shadow.camera.right = shadowCoverage;
  keyLight.shadow.camera.top = shadowCoverage;
  keyLight.shadow.camera.bottom = -shadowCoverage;
  keyLight.shadow.mapSize.set(options.quality === "ultra" ? 2048 : 1024, options.quality === "ultra" ? 2048 : 1024);
  scene.add(keyLight, keyLight.target);
  let actorFillLight = null;
  let actorRimLight = null;
  if (atmosphereProfile.id === "moonlessRain") {
    const contract = atmosphereProfile.readabilityContract;
    renderer.toneMappingExposure = Math.max(renderer.toneMappingExposure, contract.minimumExposure);
    ambient.intensity = Math.max(ambient.intensity, contract.minimumHemisphereIntensity);
    keyLight.intensity = Math.max(keyLight.intensity, contract.minimumKeyIntensity);
    actorFillLight = new THREE.DirectionalLight(
      atmosphereProfile.actorFillColor,
      Math.max(atmosphereProfile.actorFillIntensity, contract.minimumActorFillIntensity),
    );
    actorFillLight.name = "MoonlessRain_ActorFill";
    actorFillLight.position.set(...atmosphereProfile.actorFillPosition);
    actorFillLight.target.position.set(-12, 2.4, 8);
    actorRimLight = new THREE.DirectionalLight(
      atmosphereProfile.actorRimColor,
      Math.max(atmosphereProfile.actorRimIntensity, contract.minimumActorRimIntensity),
    );
    actorRimLight.name = "MoonlessRain_ActorRim";
    actorRimLight.position.set(...atmosphereProfile.actorRimPosition);
    actorRimLight.target.position.set(-12, 2.4, 8);
    scene.add(actorFillLight, actorFillLight.target, actorRimLight, actorRimLight.target);
  }

  const groundTexture = CreateCanvasTexture(1941);
  const ground = new THREE.Mesh(
    CreateTerrainGeometry(),
    new THREE.MeshStandardMaterial({ color: terrainPalette.earth, map: groundTexture, roughness: 1 }),
  );
  ground.receiveShadow = true;
  ground.userData.pickType = "ground";
  scene.add(ground);

  CreateAtmosphere(scene, atmosphereProfile);
  const weatherEffect = CreateWeatherEffect(atmosphereProfile, options.quality);
  scene.add(weatherEffect);
  if (useFirstOperationDressing) {
    CreateRoad(scene);
    CreateGroundDetails(scene);
  }
  const productionRoot = useFirstOperationDressing ? CreateProductionDetails() : new THREE.Group();
  scene.add(productionRoot);
  const operationFallbackRoot = CreateOperationFallbackDetails();
  scene.add(operationFallbackRoot);

  const propRoot = new THREE.Group();
  scene.add(propRoot);
  const staticObstacleRoots = [];
  for (const obstacle of activeMissionDefinition.obstacles) {
    let object;
    if (obstacle.kind === "building") object = CreateBuilding(obstacle);
    else if (obstacle.kind === "tower") object = CreateTower(obstacle);
    else if (obstacle.kind === "wagon") object = CreateWagon(obstacle);
    else object = CreateWall(obstacle);
    if (obstacle.id === "relayHouse") propRoot.add(object);
    else staticObstacleRoots.push(object);
  }
  const bakedObstacles = BakeMeshRoots(staticObstacleRoots);
  if (bakedObstacles) {
    bakedObstacles.sourceMeshes.forEach((mesh) => mesh.geometry.dispose());
    propRoot.add(bakedObstacles.baked);
  }
  const telephoneMast = CreateTelephoneMast();
  const telephoneNetwork = CreateTelephoneNetwork();
  if (useFirstOperationDressing) propRoot.add(telephoneMast, telephoneNetwork);

  const artTemplates = new Map();
  const artStatus = {
    environmentLoaded: false,
    environmentAsset: environmentArtDefinition?.path ?? null,
    charactersLoaded: [],
    errors: [],
  };
  let environmentArt = null;
  let artLoadPromise = null;

  function LoadArtAssets() {
    if (artLoadPromise) return artLoadPromise;
    artLoadPromise = (async () => {
      const loader = new GLTFLoader();
      const entries = [
        ...(environmentArtDefinition ? [["environment", environmentArtDefinition.path]] : []),
        ...Object.entries(artAssetPaths),
      ];
      const results = await Promise.allSettled(
        entries.map(async ([assetKey, assetPath]) => [assetKey, (await loader.loadAsync(assetPath)).scene]),
      );
      results.forEach((result, index) => {
        const [assetKey, assetPath] = entries[index];
        if (result.status === "rejected") {
          artStatus.errors.push(`${assetKey}: ${result.reason?.message ?? result.reason ?? assetPath}`);
          return;
        }
        const [, assetRoot] = result.value;
        if (assetKey === "environment") {
          environmentArt = assetRoot;
          environmentArt.name = environmentArtDefinition.runtimeName;
          environmentArt.traverse((object) => {
            if (!object.isMesh) return;
            object.castShadow = options.quality !== "low";
            object.receiveShadow = true;
            const materials = Array.isArray(object.material) ? object.material : [object.material];
            materials.forEach((material) => {
              if (material?.map) {
                material.map.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
                material.map.needsUpdate = true;
              }
            });
          });
          scene.add(environmentArt);
          // Each GLB is authored against exactly one operation's blocker contract. Keep that
          // operation's procedural set visible as a load-failure fallback, then replace it atomically.
          propRoot.visible = false;
          productionRoot.visible = false;
          operationFallbackRoot.visible = false;
          artStatus.environmentLoaded = true;
          return;
        }
        artTemplates.set(assetKey, assetRoot);
        artStatus.charactersLoaded.push(assetKey);
      });
      return {
        environmentLoaded: artStatus.environmentLoaded,
        charactersLoaded: [...artStatus.charactersLoaded],
        errors: [...artStatus.errors],
      };
    })();
    return artLoadPromise;
  }

  const objectiveRoot = new THREE.Group();
  const markerObjects = new Map();
  const dynamicBlockerObjects = new Map();
  const activeDynamicBlockerIds = new Set();
  for (const definition of activeMissionDefinition.interactables) {
    const marker = CreateMarker(definition);
    markerObjects.set(definition.id, marker);
    objectiveRoot.add(marker);
  }
  scene.add(objectiveRoot);

  const extractionObjects = new Map();
  for (const zone of activeMissionDefinition.extractionZones) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(zone.radius - 0.3, zone.radius, 48),
      CreateOverlayMaterial({
        color: 0x77c7a1,
        opacity: zone.unlocked ? 0.42 : 0,
        side: THREE.DoubleSide,
      }),
    );
    ring.rotation.x = -Math.PI * 0.5;
    ring.position.set(zone.x, GetSurfaceHeight(zone.x, zone.z) + 0.08, zone.z);
    ring.renderOrder = 11;
    ring.userData = { unlocked: zone.unlocked, id: zone.id };
    extractionObjects.set(zone.id, ring);
    scene.add(ring);
  }

  const playerObjects = new Map();
  const enemyObjects = new Map();
  const civilianObjects = new Map();
  const pickObjects = [];
  const visionRoot = new THREE.Group();
  scene.add(visionRoot);
  const planningOverlay = CreatePlanningOverlay();
  scene.add(planningOverlay.root);

  const effectRoot = new THREE.Group();
  scene.add(effectRoot);
  const effects = [];
  const dustCloudEffect = CreateDustCloudEffect();
  scene.add(dustCloudEffect);

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const worldPoint = new THREE.Vector3();
  const drawingBufferSize = new THREE.Vector2();
  let elapsed = 0;
  let planningRefreshElapsed = 1;
  const cameraFitState = {
    aspect: 1,
    fitDistance: initialCameraDistance,
    tacticalDistance: null,
    tacticalActorSpan: null,
    tacticalActorPixels: null,
    tacticalThreatIncluded: null,
    tacticalSquadWithinSafeViewport: null,
    tacticalSafeViewport: null,
    tacticalSquadProjections: null,
    minimumDistance: 24,
    maximumDistance: 104,
    framingMode: "titleOverview",
  };
  const cameraImpact = {
    kind: "shot",
    amplitude: 0,
    duration: 0,
    remaining: 0,
    seed: 0,
  };
  const cameraImpactBase = new THREE.Vector3();
  const cameraImpactRight = new THREE.Vector3();
  const cameraImpactUp = new THREE.Vector3();

  function GetCameraFitDistance(aspect = camera.aspect, target = cameraTarget) {
    const safeAspect = Math.max(0.25, aspect);
    const tangentVertical = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
    const tangentHorizontal = tangentVertical * safeAspect;
    const worldUp = new THREE.Vector3(0, 1, 0);
    const cameraRight = new THREE.Vector3().crossVectors(worldUp, overviewDirection).normalize();
    const cameraUp = new THREE.Vector3().crossVectors(overviewDirection, cameraRight).normalize();
    const bounds = activeMissionDefinition.bounds;
    const maximumAuthoredElevation = (activeMissionDefinition.zones ?? []).reduce(
      (maximum, zone) => Math.max(maximum, Number.isFinite(zone.elevation) ? zone.elevation : 0),
      0,
    );
    const maximumSceneHeight = Math.max(10, maximumAuthoredElevation + 9);
    let requiredDistance = 0;
    for (const x of [bounds.minimumX, bounds.maximumX]) {
      for (const y of [0, maximumSceneHeight]) {
        for (const z of [bounds.minimumZ, bounds.maximumZ]) {
          const relative = new THREE.Vector3(x - target.x, y - target.y, z - target.z);
          const depthOffset = relative.dot(overviewDirection);
          requiredDistance = Math.max(
            requiredDistance,
            depthOffset + Math.abs(relative.dot(cameraRight)) / tangentHorizontal,
            depthOffset + Math.abs(relative.dot(cameraUp)) / tangentVertical,
          );
        }
      }
    }
    return Math.max(42, requiredDistance * 1.08 + 3);
  }

  function ConstrainCameraToTerrain(target, desiredPosition) {
    const targetSurface = GetSurfaceHeight(target.x, target.z);
    target.y = Math.max(
      target.y,
      targetSurface + tacticalFramingContract.targetSurfaceClearance,
    );
    const cameraSurface = GetSurfaceHeight(desiredPosition.x, desiredPosition.z);
    desiredPosition.y = Math.max(
      desiredPosition.y,
      cameraSurface + tacticalFramingContract.cameraSurfaceClearance,
      target.y + tacticalFramingContract.minimumVerticalViewingClearance,
    );
    return { targetSurface, cameraSurface };
  }

  function SetCameraDistance(target, distance, snap = false, direction = overviewDirection) {
    const safeTarget = target.clone();
    const desiredPosition = safeTarget.clone().add(direction.clone().multiplyScalar(distance));
    const surface = ConstrainCameraToTerrain(safeTarget, desiredPosition);
    camera.userData.desiredTarget = safeTarget;
    camera.userData.desiredPosition = desiredPosition;
    camera.userData.targetSurfaceElevation = surface.targetSurface;
    camera.userData.cameraSurfaceElevation = surface.cameraSurface;
    if (snap) {
      cameraTarget.copy(safeTarget);
      camera.position.copy(desiredPosition);
      camera.lookAt(cameraTarget);
    }
  }

  function GetStartupTacticalFrame(
    fallbackPosition,
    requestedDistance,
    viewportWidth = canvas.clientWidth || 390,
    viewportHeight = canvas.clientHeight || 844,
  ) {
    const frame = CalculateStartupTacticalFrame({
      definition: activeMissionDefinition,
      squadPositions: [...playerObjects.values()].map((object) => object.position),
      fallbackPosition,
      requestedDistance,
      aspect: camera.aspect,
      fieldOfView: camera.fov,
      viewportWidth,
      viewportHeight,
      overviewDirection,
    });
    return {
      ...frame,
      target: new THREE.Vector3(frame.target.x, frame.target.y, frame.target.z),
      direction: new THREE.Vector3(frame.direction.x, frame.direction.y, frame.direction.z),
    };
  }

  function ApplyCameraImpact(kind = "shot", intensity = 0.5) {
    const profile =
      kind === "explosion"
        ? { amplitude: 1.05, duration: 0.52 }
        : kind === "damage"
          ? { amplitude: 0.52, duration: 0.32 }
          : kind === "alert"
            ? { amplitude: 0.28, duration: 0.36 }
            : { amplitude: 0.22, duration: 0.18 };
    const strength = THREE.MathUtils.clamp(Number.isFinite(intensity) ? intensity : 0.5, 0, 1.5);
    const amplitude = profile.amplitude * strength;
    if (amplitude >= cameraImpact.amplitude || cameraImpact.remaining <= 0) {
      cameraImpact.kind = kind;
      cameraImpact.amplitude = amplitude;
      cameraImpact.duration = profile.duration;
    } else {
      cameraImpact.amplitude = Math.min(1.5, cameraImpact.amplitude + amplitude * 0.35);
      cameraImpact.duration = Math.max(cameraImpact.duration, profile.duration);
    }
    cameraImpact.remaining = Math.max(cameraImpact.remaining, profile.duration);
    cameraImpact.seed += 1;
  }

  function BuildActors(state) {
    for (const unit of state.units) {
      if (playerObjects.has(unit.id)) continue;
      const definition = GetCharacterDefinition(unit.id);
      const object = CreateCharacterModel(
        definition?.color ?? terrainPalette.friendly,
        false,
        unit.id,
        artTemplates.get(unit.id),
      );
      object.userData.pick.userData.id = unit.id;
      object.position.set(unit.x, GetSurfaceHeight(unit.x, unit.z), unit.z);
      object.rotation.y = unit.facing;
      playerObjects.set(unit.id, object);
      pickObjects.push(object.userData.pick);
      scene.add(object);
    }
    for (const enemy of state.enemies) {
      if (enemyObjects.has(enemy.id)) continue;
      const role = GetEnemyRoleDefinition(enemy.role);
      const enemyArtKey = enemy.role === "leader" ? "enemyLeader" : "enemyRifleman";
      const object = CreateCharacterModel(
        enemy.role === "leader" ? 0x78634c : 0x6f5d47,
        true,
        enemy.role,
        artTemplates.get(enemyArtKey),
      );
      object.userData.pick.userData.id = enemy.id;
      object.userData.pick.userData.hiddenByIntel = true;
      object.position.set(enemy.x, GetSurfaceHeight(enemy.x, enemy.z) + (enemy.elevated ? 6.7 : 0), enemy.z);
      object.rotation.y = enemy.facing;
      object.userData.vision = CreateVisionCone(role.sight, role.fov, role.peripheralSight);
      object.userData.vision.position.set(enemy.x, GetSurfaceHeight(enemy.x, enemy.z), enemy.z);
      object.userData.vision.rotation.y = enemy.facing;
      object.userData.vision.visible = false;
      visionRoot.add(object.userData.vision);
      enemyObjects.set(enemy.id, object);
      pickObjects.push(object.userData.pick);
      object.visible = false;
      scene.add(object);
    }
    for (const civilian of state.civilians ?? []) {
      if (civilianObjects.has(civilian.id)) continue;
      const object = CreateCharacterModel(0x8f8067, false, "civilian", null);
      object.userData.pick.visible = false;
      object.userData.pick.raycast = () => {};
      object.position.set(civilian.x, GetSurfaceHeight(civilian.x, civilian.z), civilian.z);
      object.rotation.y = civilian.facing ?? 0;
      civilianObjects.set(civilian.id, object);
      scene.add(object);
    }
    for (const marker of markerObjects.values()) {
      if (!pickObjects.includes(marker.userData.pick)) pickObjects.push(marker.userData.pick);
    }
  }

  function UpdateActorObject(object, actor, deltaTime, selected, enemy = false) {
    const intel = enemy ? GetEnemyIntelRenderState(actor) : null;
    const isLastKnown = intel?.mode === "lastKnown";
    const memoryStrength = isLastKnown
      ? THREE.MathUtils.clamp((actor.lastSeenTimer ?? 0) / 12, 0, 1)
      : 0;
    const displayActor = enemy && intel?.position
      ? { ...actor, ...intel.position, facing: intel.position.facing ?? actor.facing }
      : actor;
    const suppressionRatio = enemy && !intel?.showAwareness
      ? 0
      : THREE.MathUtils.clamp((displayActor.suppression ?? 0) / 100, 0, 1);
    const previousX = object.userData.previousX;
    const previousZ = object.userData.previousZ;
    const moved = Math.hypot(displayActor.x - previousX, displayActor.z - previousZ);
    object.userData.previousX = displayActor.x;
    object.userData.previousZ = displayActor.z;
    object.userData.phase += deltaTime * (moved > 0.01 ? 10 : 2);
    const shotCooldown = Math.max(0, displayActor.shotCooldown ?? 0);
    const previousShotCooldown = object.userData.previousShotCooldown;
    if (previousShotCooldown !== null && shotCooldown > previousShotCooldown + 0.16) {
      object.userData.fireRecoil = 1;
    }
    object.userData.previousShotCooldown = shotCooldown;
    object.userData.fireRecoil = Math.max(0, object.userData.fireRecoil - deltaTime * 7.5);
    const baseY = GetSurfaceHeight(displayActor.x, displayActor.z) + (displayActor.elevated ? 6.7 : 0);
    const bob = moved > 0.01 ? Math.abs(Math.sin(object.userData.phase)) * 0.08 : Math.sin(object.userData.phase) * 0.015;
    object.userData.hitReaction = Math.max(0, (object.userData.hitReaction ?? 0) - deltaTime * 4.8);
    const hitReaction = object.userData.hitReaction;
    const fireRecoil = object.userData.fireRecoil;
    const recoil = hitReaction + fireRecoil * 0.38;
    const pose = ResolveActorPose(displayActor, {
      enemy,
      moved,
      isLastKnown,
      suppressionRatio,
      phase: object.userData.phase,
      fireRecoil,
    });
    object.position.set(
      displayActor.x - Math.sin(displayActor.facing) * recoil * 0.16,
      baseY + bob,
      displayActor.z - Math.cos(displayActor.facing) * recoil * 0.16,
    );
    object.rotation.y = displayActor.facing;
    object.scale.y += (pose.scaleY - object.scale.y) * Math.min(1, deltaTime * 12);
    object.rotation.z += ((!isLastKnown && actor.state === "downed" ? Math.PI * 0.5 : 0) - object.rotation.z) * Math.min(1, deltaTime * 9);
    object.userData.selection.visible =
      !enemy || (intel?.showAwareness && (selected || Boolean(actor.awareness > 24))) || isLastKnown;
    object.userData.selection.material.opacity = isLastKnown ? 0.12 + memoryStrength * 0.24 : selected ? 0.9 : enemy && actor.awareness > 24 ? 0.25 : 0.22;
    object.userData.selection.material.color.setHex(isLastKnown ? 0x729cba : enemy ? 0xe87a62 : 0x83e5bc);
    object.userData.body.material.color.setHex(isLastKnown ? 0x8299a8 : 0xffffff);
    object.userData.body.material.opacity = isLastKnown ? 0.16 + memoryStrength * 0.34 : 1;
    object.userData.body.material.depthWrite = !isLastKnown;
    object.userData.body.material.emissive.setHex(isLastKnown ? 0x213b4d : enemy ? 0x6b1f13 : 0x6b4b16);
    object.userData.body.material.emissiveIntensity = isLastKnown
      ? 0.12 + memoryStrength * 0.13
      : suppressionRatio * (0.32 + Math.abs(Math.sin(elapsed * 11)) * 0.34);
    object.userData.body.rotation.x = pose.bodyPitch + Math.sin(hitReaction * Math.PI) * 0.18;
    if (object.userData.artRig) {
      const artRig = object.userData.artRig;
      artRig.root.rotation.x = pose.bodyPitch + Math.sin(hitReaction * Math.PI) * 0.18;
      const ghostOpacity = 0.16 + memoryStrength * 0.34;
      for (const material of artRig.materials) {
        if (material.color && material.userData.baseColor) {
          if (isLastKnown) material.color.setHex(0x8299a8);
          else material.color.copy(material.userData.baseColor);
        }
        material.opacity = isLastKnown ? ghostOpacity : 1;
        material.depthWrite = !isLastKnown;
        if (material.emissive) {
          if (isLastKnown) material.emissive.setHex(0x213b4d);
          else if (material.userData.baseEmissive) material.emissive.copy(material.userData.baseEmissive);
          material.emissiveIntensity = isLastKnown
            ? 0.16
            : (material.userData.baseEmissiveIntensity ?? 0) + suppressionRatio * 0.38;
        }
      }
    }
    if (object.userData.limbRig) {
      object.userData.limbRig.limbInstances.material.color.setHex(isLastKnown ? 0x8299a8 : 0xffffff);
      object.userData.limbRig.limbInstances.material.opacity = isLastKnown ? 0.14 + memoryStrength * 0.3 : 1;
      object.userData.limbRig.limbInstances.material.depthWrite = !isLastKnown;
    }
    if (object.userData.memoryRing) {
      object.userData.memoryRing.visible = isLastKnown;
      object.userData.memoryRing.material.opacity = isLastKnown ? 0.08 + memoryStrength * 0.5 : 0;
      object.userData.memoryRing.scale.setScalar(1 + (1 - memoryStrength) * 0.42);
    }
    object.userData.factionGlyph.material.opacity = enemy
      ? isLastKnown ? 0.06 + memoryStrength * 0.12 : 0.3 + suppressionRatio * 0.35
      : 0.4 + suppressionRatio * 0.25;
    const glyphPulse = 1 + suppressionRatio * (0.08 + Math.abs(Math.sin(elapsed * 8)) * 0.08);
    object.userData.factionGlyph.scale.setScalar(glyphPulse);
    object.visible =
      (isLastKnown || (displayActor.state !== "evacuated" && displayActor.state !== "dead")) &&
      (!enemy || (intel.showModel && (isLastKnown || !actor.bodyHidden)));
    if (enemy) object.userData.pick.userData.hiddenByIntel = !intel.canTarget;
    if (object.userData.limbRig) {
      const rig = object.userData.limbRig;
      for (let index = 0; index < 2; index += 1) {
        rig.armPivots[index].rotation.set(pose.armPitch[index], 0, pose.armRoll[index]);
        rig.armPivots[index].updateMatrix();
        rig.matrix.copy(rig.armPivots[index].matrix).multiply(rig.armOffset);
        rig.limbInstances.setMatrixAt(index, rig.matrix);
        rig.legPivots[index].rotation.set(pose.legPitch[index], 0, 0);
        rig.legPivots[index].updateMatrix();
        rig.matrix.copy(rig.legPivots[index].matrix).multiply(rig.legOffset);
        rig.limbInstances.setMatrixAt(index + 2, rig.matrix);
      }
      rig.limbInstances.instanceMatrix.needsUpdate = true;
      if (object.userData.artRig) {
        const artRig = object.userData.artRig;
        for (let index = 0; index < 2; index += 1) {
          if (artRig.armPivots[index]) {
            artRig.armPivots[index].rotation.set(pose.armPitch[index], 0, pose.armRoll[index]);
          }
          if (artRig.legPivots[index]) {
            artRig.legPivots[index].rotation.set(pose.legPitch[index], 0, 0);
          }
        }
      }
    }
    if (enemy && object.userData.vision) {
      object.userData.vision.position.set(displayActor.x, GetSurfaceHeight(displayActor.x, displayActor.z), displayActor.z);
      object.userData.vision.rotation.y = displayActor.facing;
      object.userData.vision.visible =
        intel.showVision && actor.health > 0 && !actor.disabled && actor.state !== "surrendered";
      if (object.userData.vision.visible) UpdateClippedVision(object.userData.vision, displayActor, deltaTime);
      const alertOpacity =
        actor.state === "combat" || actor.state === "report"
          ? 0.52
          : actor.state === "investigate" || actor.state === "search"
            ? 0.43
            : actor.revealedTimer > 0
              ? 0.38
              : 0.32;
      const central = object.userData.vision.userData.central;
      const peripheral = object.userData.vision.userData.peripheral;
      central.material.opacity += (alertOpacity - central.material.opacity) * Math.min(1, deltaTime * 8);
      peripheral.material.opacity += (Math.max(0.11, alertOpacity * 0.34) - peripheral.material.opacity) * Math.min(1, deltaTime * 8);
      const visionColor = actor.state === "combat" ? 0xff6650 : actor.state === "search" ? 0xffbd62 : 0xeaa060;
      central.material.color.setHex(visionColor);
      peripheral.material.color.setHex(actor.state === "combat" ? 0xd96d54 : 0xc89965);
      central.userData.outline.material.color.setHex(visionColor);
      central.userData.outline.material.opacity = actor.state === "combat" ? 1 : 0.92;
      peripheral.userData.outline.material.color.setHex(actor.state === "combat" ? 0xe78264 : 0xd7a16a);
      peripheral.userData.outline.material.opacity = actor.state === "combat" ? 0.56 : 0.42;
    }
  }

  function SpawnRing(position, color, maximumRadius = 10, duration = 0.9) {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1.08, 48),
      CreateOverlayMaterial({ color, opacity: 0.86, side: THREE.DoubleSide }),
    );
    mesh.rotation.x = -Math.PI * 0.5;
    mesh.position.set(position.x, GetSurfaceHeight(position.x, position.z) + 0.13, position.z);
    mesh.renderOrder = 18;
    effectRoot.add(mesh);
    effects.push({ kind: "ring", mesh, age: 0, duration, maximumRadius });
  }

  function SpawnTracer(start, end, color = 0xffd17a) {
    const startY = GetSurfaceHeight(start.x, start.z) + (start.elevated ? 8.25 : 1.65);
    const endY = GetSurfaceHeight(end.x, end.z) + (end.elevated ? 7.9 : 1.25);
    const geometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(start.x, startY, start.z),
      new THREE.Vector3(end.x, endY, end.z),
    ]);
    const line = new THREE.Line(
      geometry,
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1, depthWrite: false, depthTest: false }),
    );
    line.renderOrder = 20;
    effectRoot.add(line);
    effects.push({ kind: "tracer", mesh: line, age: 0, duration: 0.18, maximumRadius: 1 });

    const flashGeometry = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(start.x, startY, start.z),
      new THREE.Vector3(end.x, endY, end.z),
    ]);
    const flash = new THREE.Points(
      flashGeometry,
      new THREE.PointsMaterial({
        color,
        size: color === 0xffc16d ? 1.0 : 0.74,
        transparent: true,
        opacity: 1,
        depthWrite: false,
        depthTest: false,
        blending: THREE.AdditiveBlending,
        sizeAttenuation: true,
      }),
    );
    flash.renderOrder = 21;
    effectRoot.add(flash);
    effects.push({ kind: "flash", mesh: flash, age: 0, duration: 0.24, maximumRadius: 1 });
    if (color === 0xffc16d) SpawnRing(end, 0xff7a4f, 2.1, 0.3);
  }

  function SpawnImpact(position, kind = "earth") {
    const palette =
      kind === "body"
        ? [0xa54f3f, 0x713c34, 0xd0a071]
        : kind === "metal"
        ? [0xfff0b3, 0xff9f43, 0xc76e32]
        : kind === "wood"
          ? [0xd5b06e, 0x8a653d, 0x61513d]
          : kind === "stone"
            ? [0xc9c0a7, 0x88806c, 0x5d5a51]
        : kind === "takedown"
            ? [0xb7a078, 0x766d55, 0x514f43]
            : [0xb7a27b, 0x7f745b, 0x5b5849];
    const count = options.quality === "low" ? 7 : 11;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const color = new THREE.Color();
    const surfaceHeight = GetSurfaceHeight(position.x, position.z) + (position.elevated ? 6.7 : 0);
    for (let index = 0; index < count; index += 1) {
      positions[index * 3] = position.x;
      positions[index * 3 + 1] = surfaceHeight + 0.65 + Deterministic(index, 271) * 0.65;
      positions[index * 3 + 2] = position.z;
      const spread = kind === "metal" ? 5.2 : kind === "body" ? 2.8 : 3.5;
      velocities[index * 3] = (Deterministic(index, 277) - 0.5) * spread;
      velocities[index * 3 + 1] = 1.2 + Deterministic(index, 281) * (kind === "metal" ? 4.8 : 2.8);
      velocities[index * 3 + 2] = (Deterministic(index, 283) - 0.5) * spread;
      color.setHex(palette[index % palette.length]);
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const cloud = new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        size: kind === "metal" ? 0.28 : kind === "body" ? 0.32 : 0.38,
        vertexColors: true,
        transparent: true,
        opacity: 0.94,
        depthWrite: false,
        blending: kind === "metal" ? THREE.AdditiveBlending : THREE.NormalBlending,
        sizeAttenuation: true,
      }),
    );
    cloud.userData.velocities = velocities;
    effectRoot.add(cloud);
    effects.push({ kind: "particleCloud", mesh: cloud, age: 0, duration: kind === "metal" ? 0.48 : 0.72, maximumRadius: 1 });
    const actorObject = playerObjects.get(position.id) ?? enemyObjects.get(position.id);
    if (actorObject && (kind === "body" || kind === "takedown")) actorObject.userData.hitReaction = 1;
  }

  function SpawnExplosion(position, large = false) {
    const count = options.quality === "low" ? (large ? 16 : 10) : large ? 28 : 18;
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const color = new THREE.Color();
    for (let index = 0; index < count; index += 1) {
      positions[index * 3] = position.x;
      positions[index * 3 + 1] = GetSurfaceHeight(position.x, position.z) + 0.4;
      positions[index * 3 + 2] = position.z;
      velocities[index * 3] = (Deterministic(index, 89) - 0.5) * (large ? 10 : 6);
      velocities[index * 3 + 1] = 2 + Deterministic(index, 97) * (large ? 8 : 5);
      velocities[index * 3 + 2] = (Deterministic(index, 101) - 0.5) * (large ? 10 : 6);
      color.setHex(index % 3 === 0 ? 0xffcf79 : index % 2 === 0 ? 0xc15f37 : 0x62584c);
      colors[index * 3] = color.r;
      colors[index * 3 + 1] = color.g;
      colors[index * 3 + 2] = color.b;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: large ? 0.62 : 0.44,
      vertexColors: true,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const cloud = new THREE.Points(geometry, material);
    cloud.userData.velocities = velocities;
    effectRoot.add(cloud);
    effects.push({ kind: "particleCloud", mesh: cloud, age: 0, duration: large ? 1.8 : 1.25, maximumRadius: 1 });
    SpawnRing(position, 0xff8b55, large ? 18 : 10, 1.1);
  }

  function UpdateEffects(deltaTime) {
    for (let index = effects.length - 1; index >= 0; index -= 1) {
      const effect = effects[index];
      effect.age += deltaTime;
      const progress = effect.age / effect.duration;
      if (effect.kind === "ring") {
        const scale = 1 + progress * effect.maximumRadius;
        effect.mesh.scale.setScalar(scale);
        effect.mesh.material.opacity = Math.max(0, 0.75 * (1 - progress));
      } else if (effect.kind === "tracer" || effect.kind === "flash") {
        effect.mesh.material.opacity = Math.max(0, 1 - progress);
      } else if (effect.kind === "particleCloud") {
        const positions = effect.mesh.geometry.getAttribute("position");
        const velocities = effect.mesh.userData.velocities;
        for (let particleIndex = 0; particleIndex < positions.count; particleIndex += 1) {
          const offset = particleIndex * 3;
          velocities[offset + 1] -= deltaTime * 6.5;
          positions.array[offset] += velocities[offset] * deltaTime;
          positions.array[offset + 1] += velocities[offset + 1] * deltaTime;
          positions.array[offset + 2] += velocities[offset + 2] * deltaTime;
        }
        positions.needsUpdate = true;
        effect.mesh.material.opacity = Math.max(0, 0.92 * (1 - progress));
      }
      if (progress >= 1) {
        effectRoot.remove(effect.mesh);
        effect.mesh.geometry?.dispose?.();
        effect.mesh.material?.dispose?.();
        effects.splice(index, 1);
      }
    }
  }

  function Sync(state, view, deltaTime = 1 / 60) {
    if (
      playerObjects.size !== state.units.length ||
      state.enemies.some((enemy) => !enemyObjects.has(enemy.id)) ||
      (state.civilians ?? []).some((civilian) => !civilianObjects.has(civilian.id))
    ) {
      BuildActors(state);
    }
    for (const unit of state.units) {
      const object = playerObjects.get(unit.id);
      if (object) UpdateActorObject(object, unit, deltaTime, state.selectedUnitIds.includes(unit.id), false);
    }
    for (const enemy of state.enemies) {
      const object = enemyObjects.get(enemy.id);
      if (object) UpdateActorObject(object, enemy, deltaTime, view?.hoverEnemyId === enemy.id, true);
    }
    for (const civilian of state.civilians ?? []) {
      const object = civilianObjects.get(civilian.id);
      if (!object) continue;
      object.visible = civilian.state !== "evacuated" && civilian.state !== "harmed";
      if (object.visible) UpdateActorObject(object, civilian, deltaTime, false, false);
    }
    activeDynamicBlockerIds.clear();
    for (const obstacle of state.environment?.dynamicObstacles ?? []) {
      activeDynamicBlockerIds.add(obstacle.id);
      let object = dynamicBlockerObjects.get(obstacle.id);
      if (!object) {
        object = obstacle.kind === "wagon" ? CreateWagon(obstacle) : CreateWall(obstacle);
        dynamicBlockerObjects.set(obstacle.id, object);
        scene.add(object);
      }
      object.visible = true;
    }
    for (const [obstacleId, object] of dynamicBlockerObjects) {
      if (!activeDynamicBlockerIds.has(obstacleId)) object.visible = false;
    }
    for (const [interactableId, marker] of markerObjects) {
      const runtime = state.interactables[interactableId];
      const markerPosition = runtime?.droppedAt ?? marker.userData.definition;
      marker.position.set(
        markerPosition.x,
        GetSurfaceHeight(markerPosition.x, markerPosition.z),
        markerPosition.z,
      );
      marker.visible = Boolean(runtime?.discovered) && !runtime?.completed;
      const pulse = 0.78 + Math.sin(elapsed * 2.4 + marker.position.x) * 0.2;
      marker.userData.ring.scale.setScalar(pulse);
      marker.userData.beacon.material.opacity = 0.1 + pulse * 0.1;
    }
    for (const zone of state.extractionZones) {
      const ring = extractionObjects.get(zone.id);
      if (!ring) continue;
      ring.material.opacity = zone.unlocked ? 0.27 + Math.sin(elapsed * 2) * 0.1 : 0;
      ring.visible = zone.unlocked;
    }
    telephoneMast.rotation.z += ((state.environment.eastRoadBlocked ? 0.012 : 0) - telephoneMast.rotation.z) * Math.min(1, deltaTime * 2.1);
    telephoneNetwork.userData.wires.material.opacity +=
      ((state.objectives.relay ? 0.28 : 0.9) - telephoneNetwork.userData.wires.material.opacity) *
      Math.min(1, deltaTime * 5);
    UpdateDustCloudEffect(dustCloudEffect, state.environment?.dustCloud, elapsed);
    planningRefreshElapsed += deltaTime;
    if (planningRefreshElapsed >= 0.1) {
      UpdatePlanningOverlay(planningOverlay, state);
      planningRefreshElapsed = 0;
    }
  }

  function UpdateCamera(deltaTime) {
    const desired = camera.userData.desiredPosition;
    const desiredTarget = camera.userData.desiredTarget;
    if (desired) camera.position.lerp(desired, 1 - Math.exp(-deltaTime * 5));
    if (desiredTarget) cameraTarget.lerp(desiredTarget, 1 - Math.exp(-deltaTime * 5));
    camera.lookAt(cameraTarget);
  }

  function Frame(deltaTime, state, view) {
    elapsed += deltaTime;
    Sync(state, view, deltaTime);
    UpdateEffects(deltaTime);
    UpdateWeatherEffect(weatherEffect, deltaTime, elapsed);
    UpdateCamera(deltaTime);
    cameraImpactBase.copy(camera.position);
    if (cameraImpact.remaining > 0 && cameraImpact.duration > 0) {
      const envelope = Math.pow(cameraImpact.remaining / cameraImpact.duration, 1.8);
      const oscillation = elapsed * (cameraImpact.kind === "explosion" ? 47 : 67) + cameraImpact.seed * 2.17;
      cameraImpactRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
      cameraImpactUp.set(0, 1, 0).applyQuaternion(camera.quaternion);
      camera.position.addScaledVector(
        cameraImpactRight,
        Math.sin(oscillation) * cameraImpact.amplitude * envelope,
      );
      camera.position.addScaledVector(
        cameraImpactUp,
        Math.cos(oscillation * 1.37) * cameraImpact.amplitude * envelope * 0.68,
      );
    }
    renderer.render(scene, camera);
    camera.position.copy(cameraImpactBase);
    camera.updateMatrixWorld();
    cameraImpact.remaining = Math.max(0, cameraImpact.remaining - deltaTime);
    if (cameraImpact.remaining === 0) cameraImpact.amplitude = 0;
  }

  function Resize(width, height) {
    const safeWidth = Math.max(1, width);
    const safeHeight = Math.max(1, height);
    renderer.setSize(safeWidth, safeHeight, false);
    camera.aspect = safeWidth / safeHeight;
    camera.updateProjectionMatrix();
    cameraFitState.aspect = camera.aspect;
    const target = (camera.userData.desiredTarget ?? cameraTarget).clone();
    cameraFitState.fitDistance = GetCameraFitDistance(camera.aspect, target);
    cameraFitState.maximumDistance = Math.max(104, cameraFitState.fitDistance * 1.12);
    if (camera.userData.overviewMode) {
      const requestedDistance = camera.userData.overviewRequestedDistance ?? initialCameraDistance;
      const resizeDistance =
        camera.aspect < 0.78
          ? Math.max(requestedDistance, cameraFitState.fitDistance)
          : requestedDistance;
      SetCameraDistance(target, resizeDistance, true);
      cameraFitState.framingMode = camera.userData.framingMode ?? "manualOverview";
    } else if (camera.userData.framingMode === "tactical") {
      const tacticalFrame = GetStartupTacticalFrame(
        camera.userData.tacticalFocus ?? target,
        camera.userData.tacticalRequestedDistance ?? 46,
        safeWidth,
        safeHeight,
      );
      cameraFitState.tacticalDistance = tacticalFrame.distance;
      cameraFitState.tacticalActorSpan = tacticalFrame.actorSpan;
      cameraFitState.tacticalActorPixels = tacticalFrame.projectedActorPixels;
      cameraFitState.tacticalThreatIncluded = tacticalFrame.threatIncluded;
      cameraFitState.tacticalSquadWithinSafeViewport = tacticalFrame.squadWithinSafeViewport;
      cameraFitState.tacticalSafeViewport = tacticalFrame.safeViewport;
      cameraFitState.tacticalSquadProjections = tacticalFrame.squadProjections;
      camera.userData.tacticalDirection = tacticalFrame.direction;
      SetCameraDistance(tacticalFrame.target, tacticalFrame.distance, true, tacticalFrame.direction);
    }
  }

  function SetPointer(clientX, clientY) {
    const rectangle = canvas.getBoundingClientRect();
    pointer.x = ((clientX - rectangle.left) / rectangle.width) * 2 - 1;
    pointer.y = -((clientY - rectangle.top) / rectangle.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
  }

  function ProjectCurrentRayToGround() {
    groundPlane.constant = 0;
    if (!raycaster.ray.intersectPlane(groundPlane, worldPoint)) return null;
    for (let iteration = 0; iteration < 2; iteration += 1) {
      groundPlane.constant = -GetSurfaceHeight(worldPoint.x, worldPoint.z);
      if (!raycaster.ray.intersectPlane(groundPlane, worldPoint)) break;
    }
    groundPlane.constant = 0;
    return { x: worldPoint.x, z: worldPoint.z };
  }

  function ScreenToGround(clientX, clientY) {
    SetPointer(clientX, clientY);
    return ProjectCurrentRayToGround();
  }

  function Pick(clientX, clientY) {
    SetPointer(clientX, clientY);
    const intersections = raycaster
      .intersectObjects(pickObjects, false)
      .filter((intersection) => !intersection.object.userData.hiddenByIntel);
    const position = ProjectCurrentRayToGround();
    if (intersections.length === 0) return { kind: "ground", position };
    const data = intersections[0].object.userData;
    return { kind: data.pickType, id: data.id, position };
  }

  function FocusPosition(position, distance = 46, options = {}) {
    const startupTacticalFocus = options.startup === true && playerObjects.size > 0;
    const tacticalFrame = startupTacticalFocus
      ? GetStartupTacticalFrame(position, distance)
      : null;
    const desiredTarget = tacticalFrame?.target ?? new THREE.Vector3(
      position.x,
      GetSurfaceHeight(position.x, position.z),
      position.z,
    );
    camera.userData.overviewMode = false;
    camera.userData.framingMode = startupTacticalFocus ? "tactical" : "localFocus";
    camera.userData.tacticalFocus = startupTacticalFocus ? { x: position.x, z: position.z } : null;
    camera.userData.tacticalRequestedDistance = startupTacticalFocus ? distance : null;
    camera.userData.tacticalDirection = tacticalFrame?.direction ?? null;
    cameraFitState.fitDistance = GetCameraFitDistance(camera.aspect, desiredTarget);
    cameraFitState.maximumDistance = Math.max(104, cameraFitState.fitDistance * 1.12);
    cameraFitState.tacticalDistance = tacticalFrame?.distance ?? null;
    cameraFitState.tacticalActorSpan = tacticalFrame?.actorSpan ?? null;
    cameraFitState.tacticalActorPixels = tacticalFrame?.projectedActorPixels ?? null;
    cameraFitState.tacticalThreatIncluded = tacticalFrame?.threatIncluded ?? null;
    cameraFitState.tacticalSquadWithinSafeViewport = tacticalFrame?.squadWithinSafeViewport ?? null;
    cameraFitState.tacticalSafeViewport = tacticalFrame?.safeViewport ?? null;
    cameraFitState.tacticalSquadProjections = tacticalFrame?.squadProjections ?? null;
    cameraFitState.framingMode = camera.userData.framingMode;
    SetCameraDistance(
      desiredTarget,
      tacticalFrame?.distance ?? distance,
      startupTacticalFocus,
      tacticalFrame?.direction ?? overviewDirection,
    );
  }

  function Pan(deltaX, deltaZ) {
    const nextTarget = (camera.userData.desiredTarget ?? cameraTarget).clone();
    nextTarget.x = THREE.MathUtils.clamp(nextTarget.x + deltaX, activeMissionDefinition.bounds.minimumX, activeMissionDefinition.bounds.maximumX);
    nextTarget.z = THREE.MathUtils.clamp(nextTarget.z + deltaZ, activeMissionDefinition.bounds.minimumZ, activeMissionDefinition.bounds.maximumZ);
    const offset = camera.position.clone().sub(cameraTarget);
    const desiredPosition = nextTarget.clone().add(offset);
    const surface = ConstrainCameraToTerrain(nextTarget, desiredPosition);
    camera.userData.desiredTarget = nextTarget;
    camera.userData.desiredPosition = desiredPosition;
    camera.userData.targetSurfaceElevation = surface.targetSurface;
    camera.userData.cameraSurfaceElevation = surface.cameraSurface;
  }

  function Zoom(delta) {
    const target = camera.userData.desiredTarget ?? cameraTarget;
    const position = camera.userData.desiredPosition ?? camera.position;
    const offset = position.clone().sub(target);
    const nextLength = THREE.MathUtils.clamp(
      offset.length() * (delta > 0 ? 1.12 : 0.88),
      cameraFitState.minimumDistance,
      cameraFitState.maximumDistance,
    );
    const safeTarget = target.clone();
    const desiredPosition = safeTarget.clone().add(offset.normalize().multiplyScalar(nextLength));
    const surface = ConstrainCameraToTerrain(safeTarget, desiredPosition);
    camera.userData.desiredTarget = safeTarget;
    camera.userData.desiredPosition = desiredPosition;
    camera.userData.targetSurfaceElevation = surface.targetSurface;
    camera.userData.cameraSurfaceElevation = surface.cameraSurface;
    const manualOverview = delta > 0 && nextLength >= cameraFitState.fitDistance * 0.92;
    camera.userData.overviewMode = manualOverview;
    camera.userData.framingMode = manualOverview ? "manualOverview" : "manual";
    camera.userData.overviewRequestedDistance = manualOverview ? nextLength : null;
    cameraFitState.framingMode = camera.userData.framingMode;
  }

  function GetStats() {
    return {
      missionId: activeMissionDefinition.id,
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      points: renderer.info.render.points,
      lines: renderer.info.render.lines,
      geometries: renderer.info.memory.geometries,
      textures: renderer.info.memory.textures,
      effects: effects.length,
      terrain: {
        vertices: ground.geometry.getAttribute("position").count,
        triangles: ground.geometry.userData.terrainTriangles,
        columns: ground.geometry.userData.terrainColumns,
        rows: ground.geometry.userData.terrainRows,
      },
      pixelRatio: renderer.getPixelRatio(),
      drawingBuffer: renderer.getDrawingBufferSize(drawingBufferSize).toArray(),
      atmosphere: {
        id: atmosphereProfile.id,
        timeOfDay: atmosphereProfile.timeOfDay,
        weather: atmosphereProfile.weather,
        weatherKind: atmosphereProfile.weatherKind,
        fogDensity: scene.fog.density,
        exposure: atmosphereProfile.exposure,
        renderedExposure: renderer.toneMappingExposure,
        hemisphereIntensity: ambient.intensity,
        keyIntensity: keyLight.intensity,
        actorFillIntensity: actorFillLight?.intensity ?? 0,
        actorRimIntensity: actorRimLight?.intensity ?? 0,
      },
      camera: {
        aspect: cameraFitState.aspect,
        fitDistance: cameraFitState.fitDistance,
        overviewFitDistance: cameraFitState.fitDistance,
        tacticalDistance: cameraFitState.tacticalDistance,
        tacticalActorSpan: cameraFitState.tacticalActorSpan,
        tacticalActorPixels: cameraFitState.tacticalActorPixels,
        tacticalThreatIncluded: cameraFitState.tacticalThreatIncluded,
        tacticalSquadWithinSafeViewport: cameraFitState.tacticalSquadWithinSafeViewport,
        tacticalSafeViewport: cameraFitState.tacticalSafeViewport,
        tacticalSquadProjections: cameraFitState.tacticalSquadProjections,
        minimumDistance: cameraFitState.minimumDistance,
        maximumDistance: cameraFitState.maximumDistance,
        overviewMode: Boolean(camera.userData.overviewMode),
        framingMode: cameraFitState.framingMode,
        portraitTactical: cameraFitState.aspect < 0.78 && cameraFitState.framingMode === "tactical",
        impactActive: cameraImpact.remaining > 0,
        targetSurfaceElevation: camera.userData.targetSurfaceElevation ?? null,
        targetSurfaceClearance:
          camera.userData.targetSurfaceElevation === undefined
            ? null
            : (camera.userData.desiredTarget ?? cameraTarget).y - camera.userData.targetSurfaceElevation,
        cameraSurfaceElevation: camera.userData.cameraSurfaceElevation ?? null,
        cameraSurfaceClearance:
          camera.userData.cameraSurfaceElevation === undefined
            ? null
            : (camera.userData.desiredPosition ?? camera.position).y - camera.userData.cameraSurfaceElevation,
      },
      art: {
        environmentEligible: Boolean(environmentArtDefinition),
        environmentAsset: artStatus.environmentAsset,
        environmentLoaded: artStatus.environmentLoaded,
        proceduralFallbackVisible: propRoot.visible || productionRoot.visible || operationFallbackRoot.visible,
        charactersLoaded: [...artStatus.charactersLoaded],
        errors: [...artStatus.errors],
      },
    };
  }

  function HasActiveEffects() {
    return effects.length > 0 || cameraImpact.remaining > 0;
  }

  function Dispose() {
    const geometries = new Set();
    const materials = new Set();
    scene.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (Array.isArray(object.material)) object.material.forEach((material) => materials.add(material));
      else if (object.material) materials.add(object.material);
      object.userData?.sourceMaterials?.forEach((material) => materials.add(material));
    });
    geometries.forEach((geometry) => geometry.dispose?.());
    materials.forEach((material) => material.dispose?.());
    effects.length = 0;
    pickObjects.length = 0;
    playerObjects.clear();
    enemyObjects.clear();
    civilianObjects.clear();
    markerObjects.clear();
    extractionObjects.clear();
    dynamicBlockerObjects.clear();
    renderer.dispose();
    groundTexture.dispose();
  }

  return {
    scene,
    camera,
    renderer,
    LoadArtAssets,
    BuildActors,
    Frame,
    Resize,
    Pick,
    ScreenToGround,
    FocusPosition,
    Pan,
    Zoom,
    SpawnRing,
    SpawnTracer,
    SpawnImpact,
    SpawnExplosion,
    ApplyCameraImpact,
    HasActiveEffects,
    GetStats,
    Dispose,
  };
}
