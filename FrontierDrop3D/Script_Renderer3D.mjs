import * as THREE from "three";

import {
  Clamp3D,
  DirectionFromYaw3D,
  HashColor3D,
  Lerp3D,
  TerrainHeightAt3D,
  WorldToScene3D,
  worldHalf3D,
  worldSize3D,
} from "./Script_World3D.mjs";

const lootColors = Object.freeze({
  weapon: 0xd8ff72,
  ammo: 0xffb45c,
  armor: 0x72c4ff,
  medkit: 0xff655c,
});

const roofColors = Object.freeze([0x6c7468, 0x766858, 0x52665e, 0x7b7d69]);
const treeColors = Object.freeze([0x294b35, 0x345a39, 0x23422f, 0x3d5f3c]);

function DisposeMaterial(material) {
  if (Array.isArray(material)) {
    material.forEach(DisposeMaterial);
    return;
  }
  material?.dispose?.();
}

function DisposeObject(object) {
  object.traverse((child) => {
    child.geometry?.dispose?.();
    DisposeMaterial(child.material);
  });
}

function CreateBox(width, height, depth, color, roughness = 0.86, metalness = 0.02) {
  return new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({ color, roughness, metalness }),
  );
}

function SetShadowFlags(object, castShadow = true, receiveShadow = true) {
  object.traverse((child) => {
    if (!child.isMesh) return;
    child.castShadow = castShadow;
    child.receiveShadow = receiveShadow;
  });
}

function CreateTerrainStripGeometry(startX, startY, endX, endY, width, verticalOffset = 0.12) {
  const differenceX = endX - startX;
  const differenceY = endY - startY;
  const length = Math.max(0.001, Math.hypot(differenceX, differenceY));
  const perpendicularX = -differenceY / length;
  const perpendicularY = differenceX / length;
  const segmentCount = Math.max(1, Math.ceil(length / 18));
  const positions = [];
  const textureCoordinates = [];
  const indices = [];
  for (let segmentIndex = 0; segmentIndex <= segmentCount; segmentIndex += 1) {
    const amount = segmentIndex / segmentCount;
    const centerX = Lerp3D(startX, endX, amount);
    const centerY = Lerp3D(startY, endY, amount);
    for (const side of [-1, 1]) {
      const worldX = centerX + perpendicularX * width * 0.5 * side;
      const worldY = centerY + perpendicularY * width * 0.5 * side;
      positions.push(worldX - worldHalf3D, TerrainHeightAt3D(worldX, worldY) + verticalOffset, worldY - worldHalf3D);
      textureCoordinates.push(amount, side < 0 ? 0 : 1);
    }
    if (segmentIndex < segmentCount) {
      const first = segmentIndex * 2;
      indices.push(first, first + 2, first + 1, first + 2, first + 3, first + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(textureCoordinates, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export class BattleRenderer3D {
  constructor({ canvas, minimapCanvas, fullMapCanvas }) {
    if (!(canvas instanceof HTMLCanvasElement)) throw new TypeError("BattleRenderer3D requires a canvas");
    this.canvas = canvas;
    this.minimapCanvas = minimapCanvas;
    this.fullMapCanvas = fullMapCanvas;
    this.minimapContext = minimapCanvas?.getContext("2d") ?? null;
    this.fullMapContext = fullMapCanvas?.getContext("2d") ?? null;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: "high-performance" });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x101d19);
    this.scene.fog = new THREE.FogExp2(0x182721, 0.00185);
    this.camera = new THREE.PerspectiveCamera(63, 1, 0.12, 1700);
    this.camera.position.set(18, 14, 18);
    this.worldGroup = new THREE.Group();
    this.dynamicGroup = new THREE.Group();
    this.effectsGroup = new THREE.Group();
    this.scene.add(this.worldGroup, this.dynamicGroup, this.effectsGroup);
    this.view = null;
    this.mapSeed = "";
    this.actorGroups = new Map();
    this.lootMeshes = new Map();
    this.cameraObstacles = [];
    this.cameraRaycaster = new THREE.Raycaster();
    this.effects = [];
    this.lastEventId = 0;
    this.yaw = Math.PI * 0.82;
    this.pitch = 0.16;
    this.pointer = { active: true, worldX: worldHalf3D, worldY: worldHalf3D, x: 0, y: 0 };
    this.pointerLast = null;
    this.cameraTarget = new THREE.Vector3();
    this.cameraVelocity = new THREE.Vector3();
    this.shakeEnabled = true;
    this.reducedMotion = false;
    this.cameraShake = 0;
    this.lastPlayerHealth = 100;
    this.lastMinimapTime = -Infinity;
    this.zoneRing = null;
    this.zoneWall = null;
    this.targetZoneRing = null;
    this.planeGroup = this.CreatePlaneModel();
    this.dynamicGroup.add(this.planeGroup);
    this.SetupLighting();
    this.Resize();
  }

  SetupLighting() {
    const hemisphere = new THREE.HemisphereLight(0xa9c6af, 0x243127, 2.25);
    this.scene.add(hemisphere);
    this.sun = new THREE.DirectionalLight(0xffe0aa, 3.1);
    this.sun.position.set(-210, 330, -90);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(1024, 1024);
    this.sun.shadow.camera.left = -150;
    this.sun.shadow.camera.right = 150;
    this.sun.shadow.camera.top = 150;
    this.sun.shadow.camera.bottom = -150;
    this.sun.shadow.camera.near = 10;
    this.sun.shadow.camera.far = 650;
    this.scene.add(this.sun);
    this.scene.add(this.sun.target);
    const rim = new THREE.DirectionalLight(0x8fd9ff, 0.72);
    rim.position.set(240, 90, 260);
    this.scene.add(rim);
  }

  SetPreferences(preferences = {}) {
    this.shakeEnabled = preferences.shake !== false;
    this.reducedMotion = preferences.reducedMotion === true;
    const highContrast = preferences.highContrast === true;
    this.renderer.toneMappingExposure = highContrast ? 1.22 : 1.08;
    this.scene.fog.density = highContrast ? 0.00145 : 0.00185;
  }

  SetView(view) {
    if (!view) return;
    const previousHealth = this.view?.player?.health ?? view.player?.health ?? 100;
    this.view = view;
    if (view.seed !== this.mapSeed) this.BuildWorld(view);
    if ((view.player?.health ?? 100) < previousHealth - 0.1) {
      this.cameraShake = this.shakeEnabled && !this.reducedMotion ? Math.min(1.1, this.cameraShake + 0.46) : 0;
    }
    this.lastPlayerHealth = view.player?.health ?? 100;
    this.UpdateAimPointer();
    this.ConsumeEvents();
  }

  BuildWorld(view) {
    DisposeObject(this.worldGroup);
    this.scene.remove(this.worldGroup);
    this.worldGroup = new THREE.Group();
    this.scene.add(this.worldGroup);
    this.mapSeed = view.seed;
    this.actorGroups.forEach((group) => {
      this.dynamicGroup.remove(group);
      DisposeObject(group);
    });
    this.actorGroups.clear();
    this.lootMeshes.clear();
    this.cameraObstacles.length = 0;
    for (const effect of this.effects) {
      this.effectsGroup.remove(effect.object);
      DisposeObject(effect.object);
    }
    this.BuildTerrain();
    this.BuildRoads(view.map.roads ?? []);
    this.BuildBuildings(view.map.buildings ?? []);
    this.BuildTrees(view.map.trees ?? []);
    this.BuildRocks(view.map.rocks ?? []);
    this.BuildLoot(view.map.loot ?? []);
    this.BuildZoneMeshes();
    this.lastEventId = 0;
    this.effects.length = 0;
  }

  BuildTerrain() {
    const geometry = new THREE.PlaneGeometry(worldSize3D, worldSize3D, 42, 42);
    geometry.rotateX(-Math.PI / 2);
    const positions = geometry.getAttribute("position");
    const colors = [];
    const color = new THREE.Color();
    for (let index = 0; index < positions.count; index += 1) {
      const sceneX = positions.getX(index);
      const sceneZ = positions.getZ(index);
      const worldX = sceneX + worldHalf3D;
      const worldY = sceneZ + worldHalf3D;
      const height = TerrainHeightAt3D(worldX, worldY);
      positions.setY(index, height);
      const variation = Clamp3D((height + 8) / 18, 0, 1);
      color.setRGB(0.105 + variation * 0.04, 0.205 + variation * 0.07, 0.145 + variation * 0.035);
      colors.push(color.r, color.g, color.b);
    }
    geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geometry.computeVertexNormals();
    const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 });
    const terrain = new THREE.Mesh(geometry, material);
    terrain.receiveShadow = true;
    this.worldGroup.add(terrain);

    const boundary = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(worldSize3D, 22, worldSize3D)),
      new THREE.LineBasicMaterial({ color: 0x6f8c75, transparent: true, opacity: 0.38 }),
    );
    boundary.position.y = 10;
    this.worldGroup.add(boundary);

    const waterMaterial = new THREE.MeshPhysicalMaterial({ color: 0x244c4e, roughness: 0.24, metalness: 0.05, transparent: true, opacity: 0.82, depthWrite: false });
    const riverPoints = [[132, -40], [158, 190], [135, 390], [185, 575], [160, 790], [204, 1040]];
    for (let index = 0; index < riverPoints.length - 1; index += 1) {
      const start = riverPoints[index];
      const end = riverPoints[index + 1];
      const river = new THREE.Mesh(CreateTerrainStripGeometry(start[0], start[1], end[0], end[1], 43, 0.2), waterMaterial);
      river.receiveShadow = true;
      this.worldGroup.add(river);
    }
  }

  BuildRoads(roads) {
    const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x4e554d, roughness: 0.98, metalness: 0 });
    const lineMaterial = new THREE.MeshBasicMaterial({ color: 0xc5c288, transparent: true, opacity: 0.48 });
    for (const road of roads) {
      const roadMesh = new THREE.Mesh(CreateTerrainStripGeometry(road.x1, road.y1, road.x2, road.y2, road.width, 0.14), roadMaterial);
      roadMesh.receiveShadow = true;
      this.worldGroup.add(roadMesh);
      const line = new THREE.Mesh(CreateTerrainStripGeometry(road.x1, road.y1, road.x2, road.y2, 0.32, 0.18), lineMaterial);
      this.worldGroup.add(line);
    }
  }

  BuildBuildings(buildings) {
    for (const building of buildings) {
      const scenePosition = WorldToScene3D(building.x, building.y);
      const visualHeight = 7.5 + ((building.roofTone + building.id.length) % 5) * 2.15;
      const wallColor = [0x7a7768, 0x706b61, 0x65726a, 0x817b6c][building.roofTone % 4];
      const structure = new THREE.Group();
      const body = CreateBox(building.width, visualHeight, building.height, wallColor, 0.96);
      body.position.y = visualHeight * 0.5;
      const roof = CreateBox(building.width + 0.7, 0.65, building.height + 0.7, roofColors[building.roofTone % roofColors.length], 0.8, 0.04);
      roof.position.y = visualHeight + 0.33;
      structure.add(body, roof);
      this.cameraObstacles.push(body);
      if (building.id.charCodeAt(building.id.length - 1) % 4 === 0) {
        const antenna = CreateBox(0.18, 6.5, 0.18, 0x94a88d, 0.55, 0.45);
        antenna.position.y = visualHeight + 3.4;
        structure.add(antenna);
      }
      structure.position.set(scenePosition.x, TerrainHeightAt3D(building.x, building.y), scenePosition.z);
      SetShadowFlags(structure, true, true);
      this.worldGroup.add(structure);
    }
  }

  BuildTrees(trees) {
    for (const tree of trees) {
      const scenePosition = WorldToScene3D(tree.x, tree.y);
      const height = 5.8 + tree.radius * 1.4;
      const group = new THREE.Group();
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.34, 0.48, height * 0.47, 6),
        new THREE.MeshStandardMaterial({ color: 0x564839, roughness: 1 }),
      );
      trunk.position.y = height * 0.235;
      const crown = new THREE.Mesh(
        new THREE.ConeGeometry(tree.radius * 1.12, height * 0.78, 7),
        new THREE.MeshStandardMaterial({ color: treeColors[tree.crownTone % treeColors.length], roughness: 0.92 }),
      );
      crown.position.y = height * 0.69;
      crown.rotation.y = tree.x * 0.07;
      group.add(trunk, crown);
      group.position.set(scenePosition.x, TerrainHeightAt3D(tree.x, tree.y), scenePosition.z);
      SetShadowFlags(group, true, true);
      this.worldGroup.add(group);
    }
  }

  BuildRocks(rocks) {
    for (const rock of rocks) {
      const scenePosition = WorldToScene3D(rock.x, rock.y);
      const mesh = new THREE.Mesh(
        new THREE.DodecahedronGeometry(rock.radius, 0),
        new THREE.MeshStandardMaterial({ color: 0x59645e, roughness: 1 }),
      );
      mesh.scale.set(1.25, 0.72, 0.92);
      mesh.rotation.set(rock.rotation * 0.4, rock.rotation, rock.rotation * 0.18);
      mesh.position.set(scenePosition.x, TerrainHeightAt3D(rock.x, rock.y) + rock.radius * 0.5, scenePosition.z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.worldGroup.add(mesh);
    }
  }

  BuildLoot(lootItems) {
    for (const item of lootItems) {
      const color = lootColors[item.type] ?? 0xe9eee3;
      let geometry;
      if (item.type === "weapon") geometry = new THREE.BoxGeometry(2.4, 0.42, 0.55);
      else if (item.type === "armor") geometry = new THREE.OctahedronGeometry(0.8, 0);
      else if (item.type === "medkit") geometry = new THREE.BoxGeometry(1.05, 0.58, 0.86);
      else geometry = new THREE.CylinderGeometry(0.42, 0.42, 0.58, 8);
      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.55, roughness: 0.42, metalness: 0.22 }),
      );
      const scenePosition = WorldToScene3D(item.x, item.y);
      mesh.position.set(scenePosition.x, TerrainHeightAt3D(item.x, item.y) + 0.82, scenePosition.z);
      mesh.castShadow = true;
      mesh.userData.baseY = mesh.position.y;
      mesh.userData.itemId = item.id;
      this.worldGroup.add(mesh);
      this.lootMeshes.set(item.id, mesh);
    }
  }

  BuildZoneMeshes() {
    const ringMaterial = new THREE.MeshBasicMaterial({ color: 0x86d3ff, transparent: true, opacity: 0.88, side: THREE.DoubleSide, depthWrite: false });
    this.zoneRing = new THREE.Mesh(new THREE.RingGeometry(0.988, 1.012, 128), ringMaterial);
    this.zoneRing.rotation.x = -Math.PI / 2;
    this.zoneRing.renderOrder = 4;
    this.worldGroup.add(this.zoneRing);
    const wallMaterial = new THREE.MeshBasicMaterial({ color: 0x55b8ff, transparent: true, opacity: 0.075, side: THREE.DoubleSide, depthWrite: false });
    this.zoneWall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 34, 96, 1, true), wallMaterial);
    this.zoneWall.renderOrder = 2;
    this.worldGroup.add(this.zoneWall);
    this.targetZoneRing = new THREE.Mesh(
      new THREE.RingGeometry(0.985, 1.015, 96),
      new THREE.MeshBasicMaterial({ color: 0xd8ff72, transparent: true, opacity: 0.48, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.targetZoneRing.rotation.x = -Math.PI / 2;
    this.worldGroup.add(this.targetZoneRing);
  }

  CreatePlaneModel() {
    const group = new THREE.Group();
    const darkMaterial = new THREE.MeshStandardMaterial({ color: 0x39453f, roughness: 0.68, metalness: 0.32 });
    const accentMaterial = new THREE.MeshStandardMaterial({ color: 0xbad46d, emissive: 0x40551d, emissiveIntensity: 0.35, roughness: 0.58 });
    const fuselage = new THREE.Mesh(new THREE.CapsuleGeometry(2.25, 13, 7, 12), darkMaterial);
    fuselage.rotation.x = Math.PI / 2;
    const wings = new THREE.Mesh(new THREE.BoxGeometry(22, 0.55, 4), darkMaterial);
    wings.position.z = 0.5;
    const tail = new THREE.Mesh(new THREE.BoxGeometry(8, 0.38, 2.2), darkMaterial);
    tail.position.z = -6.2;
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.42, 4.1, 3.2), accentMaterial);
    fin.position.set(0, 2, -6.2);
    const lightLeft = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff685e }));
    lightLeft.position.set(-10.5, 0, 0.5);
    const lightRight = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 8), new THREE.MeshBasicMaterial({ color: 0x85ff9b }));
    lightRight.position.set(10.5, 0, 0.5);
    group.add(fuselage, wings, tail, fin, lightLeft, lightRight);
    group.scale.setScalar(1.2);
    SetShadowFlags(group, true, false);
    return group;
  }

  CreateActorModel(actor) {
    const group = new THREE.Group();
    const hash = HashColor3D(actor.id);
    const local = actor.id === this.view?.player?.id;
    const bodyColor = local ? 0xd8ff72 : actor.isHuman ? 0x72c4ff : new THREE.Color().setHSL(0.19 + hash.hue * 0.08, 0.28, 0.38).getHex();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.52, 1.05, 5, 8), new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.82 }));
    body.position.y = 1.3;
    const vest = new THREE.Mesh(new THREE.BoxGeometry(1.18, 0.82, 0.72), new THREE.MeshStandardMaterial({ color: 0x27332d, roughness: 0.91 }));
    vest.position.set(0, 1.42, 0.04);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.39, 10, 8), new THREE.MeshStandardMaterial({ color: 0xc69e79, roughness: 0.9 }));
    head.position.y = 2.43;
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.43, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.58), new THREE.MeshStandardMaterial({ color: 0x344039, roughness: 0.72 }));
    helmet.position.y = 2.5;
    const weapon = CreateBox(0.15, 0.16, 1.45, 0x171d1b, 0.48, 0.48);
    weapon.position.set(0.47, 1.56, 0.67);
    weapon.rotation.x = -0.08;
    const marker = new THREE.Mesh(
      new THREE.RingGeometry(0.65, 0.82, 24),
      new THREE.MeshBasicMaterial({ color: bodyColor, transparent: true, opacity: local ? 0.92 : 0.34, side: THREE.DoubleSide, depthWrite: false }),
    );
    marker.rotation.x = -Math.PI / 2;
    marker.position.y = 0.04;
    const canopy = new THREE.Group();
    const canopyMesh = new THREE.Mesh(
      new THREE.SphereGeometry(3.25, 14, 7, 0, Math.PI * 2, 0, Math.PI * 0.48),
      new THREE.MeshStandardMaterial({ color: local ? 0xc9ef6a : 0x8f9e7d, side: THREE.DoubleSide, roughness: 0.88 }),
    );
    canopyMesh.position.y = 6.2;
    canopy.add(canopyMesh);
    for (const side of [-1, 1]) {
      const points = [new THREE.Vector3(side * 2.3, 5.8, 0), new THREE.Vector3(side * 0.35, 2.35, 0)];
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), new THREE.LineBasicMaterial({ color: 0xd6dbcd }));
      canopy.add(line);
    }
    canopy.visible = false;
    canopy.name = "ParachuteCanopy";
    group.add(body, vest, head, helmet, weapon, marker, canopy);
    SetShadowFlags(group, true, true);
    return group;
  }

  BuildActorIfNeeded(actor) {
    if (this.actorGroups.has(actor.id)) return this.actorGroups.get(actor.id);
    const group = this.CreateActorModel(actor);
    this.dynamicGroup.add(group);
    this.actorGroups.set(actor.id, group);
    return group;
  }

  UpdateActors(timestamp) {
    if (!this.view) return;
    const activeIds = new Set();
    for (const actor of this.view.actors ?? []) {
      activeIds.add(actor.id);
      const group = this.BuildActorIfNeeded(actor);
      const worldPosition = WorldToScene3D(actor.x, actor.y);
      const groundHeight = TerrainHeightAt3D(actor.x, actor.y);
      const airborneHeight = Math.max(2.2, (actor.z ?? 0) * 0.18);
      const actorHeight = actor.status === "ground" || actor.status === "dead" ? groundHeight : groundHeight + airborneHeight;
      group.position.set(worldPosition.x, actorHeight, worldPosition.z);
      group.rotation.y = Math.PI * 0.5 - actor.angle;
      group.visible = actor.alive && actor.status !== "plane";
      const canopy = group.getObjectByName("ParachuteCanopy");
      if (canopy) canopy.visible = actor.status === "parachute";
      if (actor.status === "freefall") group.rotation.z = Math.sin(timestamp * 0.004 + actor.x) * 0.12;
      else group.rotation.z = 0;
    }
    for (const [actorId, group] of this.actorGroups) {
      if (activeIds.has(actorId)) continue;
      this.dynamicGroup.remove(group);
      DisposeObject(group);
      this.actorGroups.delete(actorId);
    }
  }

  UpdatePlane() {
    if (!this.view?.plane) {
      this.planeGroup.visible = false;
      return;
    }
    const plane = this.view.plane;
    const scenePosition = WorldToScene3D(plane.x, plane.y);
    const height = TerrainHeightAt3D(plane.x, plane.y) + (plane.altitude ?? 260) * 0.18;
    this.planeGroup.position.set(scenePosition.x, height, scenePosition.z);
    this.planeGroup.rotation.y = Math.atan2(plane.direction.x, plane.direction.y);
    this.planeGroup.visible = this.view.phase === "flight" || this.view.phase === "drop";
  }

  UpdateLoot(timestamp) {
    const availability = new Map((this.view?.map?.loot ?? []).map((item) => [item.id, item.available]));
    for (const [itemId, mesh] of this.lootMeshes) {
      mesh.visible = availability.get(itemId) !== false;
      if (!mesh.visible) continue;
      mesh.rotation.y = timestamp * 0.0012 + mesh.position.x * 0.01;
      mesh.position.y = mesh.userData.baseY + Math.sin(timestamp * 0.003 + mesh.position.z) * 0.14;
    }
  }

  UpdateZones(timestamp) {
    const safeZone = this.view?.safeZone;
    if (!safeZone || safeZone.phaseIndex < 0 || safeZone.stage === "inactive") {
      if (this.zoneRing) this.zoneRing.visible = false;
      if (this.zoneWall) this.zoneWall.visible = false;
      if (this.targetZoneRing) this.targetZoneRing.visible = false;
      return;
    }
    const center = WorldToScene3D(safeZone.center.x, safeZone.center.y);
    const groundHeight = TerrainHeightAt3D(safeZone.center.x, safeZone.center.y);
    this.zoneRing.visible = true;
    this.zoneWall.visible = true;
    this.zoneRing.position.set(center.x, groundHeight + 0.34, center.z);
    this.zoneRing.scale.setScalar(Math.max(0.1, safeZone.radius));
    this.zoneRing.material.opacity = 0.7 + Math.sin(timestamp * 0.005) * 0.18;
    this.zoneWall.position.set(center.x, groundHeight + 17, center.z);
    this.zoneWall.scale.set(safeZone.radius, 1, safeZone.radius);
    const showTarget = safeZone.stage === "waiting" && Number.isFinite(safeZone.targetRadius);
    this.targetZoneRing.visible = showTarget;
    if (showTarget) {
      const targetCenter = WorldToScene3D(safeZone.targetCenter.x, safeZone.targetCenter.y);
      this.targetZoneRing.position.set(targetCenter.x, TerrainHeightAt3D(safeZone.targetCenter.x, safeZone.targetCenter.y) + 0.3, targetCenter.z);
      this.targetZoneRing.scale.setScalar(Math.max(0.1, safeZone.targetRadius));
    }
  }

  ConsumeEvents() {
    for (const event of this.view?.recentEvents ?? []) {
      if (event.id <= this.lastEventId) continue;
      this.lastEventId = Math.max(this.lastEventId, event.id);
      if (event.type === "shotHit") this.CreateTracer(event.actorId, event.targetId);
      if (event.type === "actorEliminated") this.CreateEliminationPulse(event.victimId);
    }
  }

  CreateTracer(actorId, targetId) {
    const actor = this.view?.actors.find((candidate) => candidate.id === actorId);
    const target = this.view?.actors.find((candidate) => candidate.id === targetId);
    if (!actor || !target) return;
    const actorScene = WorldToScene3D(actor.x, actor.y);
    const targetScene = WorldToScene3D(target.x, target.y);
    const points = [
      new THREE.Vector3(actorScene.x, TerrainHeightAt3D(actor.x, actor.y) + 1.65, actorScene.z),
      new THREE.Vector3(targetScene.x, TerrainHeightAt3D(target.x, target.y) + 1.2, targetScene.z),
    ];
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({ color: 0xffd46f, transparent: true, opacity: 0.96 }),
    );
    this.effectsGroup.add(line);
    this.effects.push({ object: line, life: 0.22, maximumLife: 0.22, kind: "line" });
  }

  CreateEliminationPulse(actorId) {
    const actor = this.view?.actors.find((candidate) => candidate.id === actorId);
    if (!actor) return;
    const scenePosition = WorldToScene3D(actor.x, actor.y);
    const pulse = new THREE.Mesh(
      new THREE.SphereGeometry(1, 12, 8),
      new THREE.MeshBasicMaterial({ color: 0xff6b61, wireframe: true, transparent: true, opacity: 0.9 }),
    );
    pulse.position.set(scenePosition.x, TerrainHeightAt3D(actor.x, actor.y) + 1.2, scenePosition.z);
    this.effectsGroup.add(pulse);
    this.effects.push({ object: pulse, life: 0.8, maximumLife: 0.8, kind: "pulse" });
  }

  UpdateEffects(deltaTime) {
    for (let index = this.effects.length - 1; index >= 0; index -= 1) {
      const effect = this.effects[index];
      effect.life -= deltaTime;
      const progress = 1 - Clamp3D(effect.life / effect.maximumLife, 0, 1);
      effect.object.material.opacity = 1 - progress;
      if (effect.kind === "pulse") effect.object.scale.setScalar(1 + progress * 5.5);
      if (effect.life > 0) continue;
      this.effectsGroup.remove(effect.object);
      DisposeObject(effect.object);
      this.effects.splice(index, 1);
    }
    this.cameraShake = Math.max(0, this.cameraShake - deltaTime * 2.8);
  }

  UpdateAimPointer() {
    const player = this.view?.player;
    if (!player) return;
    const forward = DirectionFromYaw3D(this.yaw);
    this.pointer.worldX = player.x + forward.x * 220;
    this.pointer.worldY = player.y + forward.y * 220;
    this.pointer.active = true;
  }

  GetForward2D() {
    return DirectionFromYaw3D(this.yaw);
  }

  CapturePointer() {
    if (typeof this.canvas.requestPointerLock !== "function") return false;
    if (document.pointerLockElement === this.canvas) return true;
    const pointerRequest = this.canvas.requestPointerLock();
    pointerRequest?.catch?.(() => {});
    return true;
  }

  SetPointer(clientX, clientY, active = true, movementX = 0, movementY = 0) {
    this.pointer.x = clientX;
    this.pointer.y = clientY;
    this.pointer.active = active;
    const player = this.view?.player;
    const inAction = player && player.alive && player.status !== "plane";
    if (inAction && (document.pointerLockElement === this.canvas || movementX !== 0 || movementY !== 0)) {
      this.yaw -= movementX * 0.00235;
      this.pitch = Clamp3D(this.pitch - movementY * 0.00175, -0.2, 0.72);
    } else if (inAction && this.pointerLast) {
      const differenceX = clientX - this.pointerLast.x;
      const differenceY = clientY - this.pointerLast.y;
      if (Math.abs(differenceX) < 120 && Math.abs(differenceY) < 120) {
        this.yaw -= differenceX * 0.0015;
        this.pitch = Clamp3D(this.pitch - differenceY * 0.0011, -0.2, 0.72);
      }
    }
    this.pointerLast = { x: clientX, y: clientY };
    this.UpdateAimPointer();
  }

  UpdateCamera(timestamp, deltaTime) {
    const view = this.view;
    const player = view?.player;
    let desiredPosition = new THREE.Vector3(28, 18, 28);
    let focus = new THREE.Vector3(0, 4, 0);
    if (!view || !player) {
      const orbit = timestamp * 0.00008;
      desiredPosition.set(Math.cos(orbit) * 185, 86, Math.sin(orbit) * 185);
      focus.set(0, 4, 0);
    } else if (player.status === "plane") {
      const planePosition = this.planeGroup.position;
      const planeForward = new THREE.Vector3(Math.sin(this.planeGroup.rotation.y), 0, Math.cos(this.planeGroup.rotation.y));
      desiredPosition.copy(planePosition).addScaledVector(planeForward, -34).add(new THREE.Vector3(18, 20, 0));
      focus.copy(planePosition).addScaledVector(planeForward, 24);
      this.yaw = this.planeGroup.rotation.y;
    } else {
      const scenePosition = WorldToScene3D(player.x, player.y);
      const groundHeight = TerrainHeightAt3D(player.x, player.y);
      const altitude = player.status === "ground" || player.status === "dead" ? 0 : Math.max(2.2, (player.z ?? 0) * 0.18);
      focus.set(scenePosition.x, groundHeight + altitude + (player.status === "ground" ? 1.55 : 1), scenePosition.z);
      const horizontalDistance = player.status === "ground" ? 9.8 : 15.5;
      const forward = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      desiredPosition.copy(focus).addScaledVector(forward, -horizontalDistance);
      desiredPosition.y += player.status === "ground" ? 4.4 + this.pitch * 4 : 7.5;
      focus.addScaledVector(forward, player.status === "ground" ? 8 : 13);
      focus.y += this.pitch * 6;
    }
    const cameraDirection = desiredPosition.clone().sub(focus);
    const cameraDistance = cameraDirection.length();
    if (cameraDistance > 0.001 && this.cameraObstacles.length > 0) {
      cameraDirection.normalize();
      this.cameraRaycaster.set(focus, cameraDirection);
      this.cameraRaycaster.near = 0.2;
      this.cameraRaycaster.far = cameraDistance;
      const obstacleHit = this.cameraRaycaster.intersectObjects(this.cameraObstacles, false)[0];
      if (obstacleHit) desiredPosition.copy(focus).addScaledVector(cameraDirection, Math.max(1.8, obstacleHit.distance - 0.55));
    }
    const desiredWorldX = desiredPosition.x + worldHalf3D;
    const desiredWorldY = desiredPosition.z + worldHalf3D;
    const cameraGround = TerrainHeightAt3D(desiredWorldX, desiredWorldY) + 1.05;
    desiredPosition.y = Math.max(desiredPosition.y, cameraGround);
    const smoothing = this.reducedMotion ? 1 : 1 - Math.exp(-deltaTime * 7.8);
    this.camera.position.lerp(desiredPosition, smoothing);
    this.cameraTarget.lerp(focus, smoothing);
    if (this.cameraShake > 0.001) {
      const shake = this.cameraShake * 0.34;
      this.camera.position.x += Math.sin(timestamp * 0.051) * shake;
      this.camera.position.y += Math.cos(timestamp * 0.043) * shake * 0.6;
    }
    this.camera.lookAt(this.cameraTarget);
    this.sun.position.set(this.camera.position.x - 190, 330, this.camera.position.z - 90);
    this.sun.target.position.copy(this.cameraTarget);
  }

  Render(timestamp = performance.now(), deltaTime = 1 / 60) {
    if (this.view) {
      this.UpdateActors(timestamp);
      this.UpdatePlane();
      this.UpdateLoot(timestamp);
      this.UpdateZones(timestamp);
    }
    this.UpdateEffects(deltaTime);
    this.UpdateCamera(timestamp, deltaTime);
    this.renderer.render(this.scene, this.camera);
    if (timestamp - this.lastMinimapTime > 80) {
      this.RenderMinimap();
      this.lastMinimapTime = timestamp;
    }
  }

  Resize() {
    const width = Math.max(1, this.canvas.clientWidth || globalThis.innerWidth || 1);
    const height = Math.max(1, this.canvas.clientHeight || globalThis.innerHeight || 1);
    const pixelRatio = Math.min(globalThis.devicePixelRatio || 1, width < 760 ? 1.35 : 1.8);
    this.renderer.setPixelRatio(pixelRatio);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  DrawMap(context, width, height, includeActors = true) {
    if (!context || !this.view?.map) return;
    const scaleX = width / worldSize3D;
    const scaleY = height / worldSize3D;
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#14241e";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "rgba(199,214,188,.28)";
    context.lineCap = "round";
    for (const road of this.view.map.roads ?? []) {
      context.lineWidth = Math.max(1, road.width * scaleX);
      context.beginPath();
      context.moveTo(road.x1 * scaleX, road.y1 * scaleY);
      context.lineTo(road.x2 * scaleX, road.y2 * scaleY);
      context.stroke();
    }
    context.fillStyle = "rgba(206,213,192,.34)";
    for (const building of this.view.map.buildings ?? []) {
      context.fillRect((building.x - building.width * 0.5) * scaleX, (building.y - building.height * 0.5) * scaleY, building.width * scaleX, building.height * scaleY);
    }
    const safeZone = this.view.safeZone;
    if (safeZone?.phaseIndex >= 0) {
      context.strokeStyle = "#72c4ff";
      context.lineWidth = 2;
      context.beginPath();
      context.arc(safeZone.center.x * scaleX, safeZone.center.y * scaleY, safeZone.radius * scaleX, 0, Math.PI * 2);
      context.stroke();
      if (safeZone.stage === "waiting") {
        context.setLineDash([5, 4]);
        context.strokeStyle = "#d8ff72";
        context.beginPath();
        context.arc(safeZone.targetCenter.x * scaleX, safeZone.targetCenter.y * scaleY, safeZone.targetRadius * scaleX, 0, Math.PI * 2);
        context.stroke();
        context.setLineDash([]);
      }
    }
    if (includeActors) {
      for (const actor of this.view.actors ?? []) {
        if (!actor.alive || (actor.id !== this.view.player?.id && !actor.isHuman)) continue;
        context.fillStyle = actor.id === this.view.player?.id ? "#d8ff72" : actor.isHuman ? "#72c4ff" : "rgba(238,238,218,.55)";
        context.beginPath();
        context.arc(actor.x * scaleX, actor.y * scaleY, actor.id === this.view.player?.id ? 3.5 : 1.7, 0, Math.PI * 2);
        context.fill();
      }
    }
    if (this.view.plane && this.view.phase === "flight") {
      context.strokeStyle = "#ff9d4d";
      context.lineWidth = 1.4;
      context.setLineDash([5, 4]);
      context.beginPath();
      context.moveTo(this.view.plane.start.x * scaleX, this.view.plane.start.y * scaleY);
      context.lineTo(this.view.plane.end.x * scaleX, this.view.plane.end.y * scaleY);
      context.stroke();
      context.setLineDash([]);
    }
    context.strokeStyle = "rgba(230,242,222,.34)";
    context.strokeRect(0.5, 0.5, width - 1, height - 1);
  }

  RenderMinimap() {
    if (!this.minimapCanvas || !this.minimapContext) return;
    const width = Math.max(1, this.minimapCanvas.clientWidth || 180);
    const height = Math.max(1, this.minimapCanvas.clientHeight || 180);
    const ratio = Math.min(globalThis.devicePixelRatio || 1, 1.5);
    const pixelWidth = Math.round(width * ratio);
    const pixelHeight = Math.round(height * ratio);
    if (this.minimapCanvas.width !== pixelWidth || this.minimapCanvas.height !== pixelHeight) {
      this.minimapCanvas.width = pixelWidth;
      this.minimapCanvas.height = pixelHeight;
    }
    this.minimapContext.save();
    this.minimapContext.scale(ratio, ratio);
    this.DrawMap(this.minimapContext, width, height, true);
    this.minimapContext.restore();
  }

  RenderFullMap() {
    if (!this.fullMapCanvas || !this.fullMapContext) return;
    const width = Math.max(1, this.fullMapCanvas.clientWidth || 720);
    const height = Math.max(1, this.fullMapCanvas.clientHeight || 720);
    const ratio = Math.min(globalThis.devicePixelRatio || 1, 1.6);
    const size = Math.min(width, height);
    const pixelSize = Math.round(size * ratio);
    if (this.fullMapCanvas.width !== pixelSize || this.fullMapCanvas.height !== pixelSize) {
      this.fullMapCanvas.width = pixelSize;
      this.fullMapCanvas.height = pixelSize;
    }
    this.fullMapContext.save();
    this.fullMapContext.scale(ratio, ratio);
    this.DrawMap(this.fullMapContext, size, size, true);
    this.fullMapContext.restore();
  }
}

export function CreateBattleRenderer(options) {
  return new BattleRenderer3D(options);
}

export default BattleRenderer3D;
