import * as THREE from "three";
import {
  BriefingPages,
  MissionConfig,
  ParseTileKey,
  SoilCatalog,
  TerrainCatalog,
} from "./Data_Level.mjs";
import {
  ActionIds,
  ApplyPlayerAction,
  ApplyPlayerActionPath,
  CreateInitialState,
  FindTunnelPath,
  GetActionPathPlans,
  GetActionTargets,
  GetAvailableActions,
  GetCombatPreview,
  GetCivilianTransitEstimate,
  GetDecoyResponder,
  GetExitWindow,
  GetObjectiveSummary,
  GetRouteSurvey,
  GetTunnelNeighbors,
  HexDistance,
  IsSoilKnown,
  LayerIds,
} from "./Script_Rules.mjs";

const saveKey = "tunnelfront1942_campaign_v1";
const canvas = document.querySelector("#GameCanvas");
const gameShell = document.querySelector("#GameShell");
const ui = Object.fromEntries(
  [
    "LayerWatermark",
    "TurnValue",
    "PhaseValue",
    "SweepReadout",
    "SweepText",
    "SweepFill",
    "ToolsValue",
    "OrganizationValue",
    "IntelValue",
    "ExposureValue",
    "SafetyValue",
    "ObjectivePrimary",
    "ObjectiveFill",
    "ObjectiveRecon",
    "ObjectiveDig",
    "ObjectiveSweep",
    "ExitWindowBoard",
    "CivilianLedger",
    "InspectorEyebrow",
    "InspectorTitle",
    "InspectorLayer",
    "InspectorDescription",
    "InspectorStats",
    "NetworkCard",
    "ActionButtons",
    "EndTurnButton",
    "SurfaceLayerButton",
    "TunnelLayerButton",
    "PreviewPanel",
    "PreviewEyebrow",
    "PreviewTitle",
    "PreviewBody",
    "CancelPreviewButton",
    "ConfirmPreviewButton",
    "EventLog",
    "TitleScreen",
    "StartButton",
    "OpenBriefingButton",
    "BriefingScreen",
    "BriefingEyebrow",
    "BriefingTitle",
    "BriefingBody",
    "BriefingDots",
    "BriefingBackButton",
    "BriefingNextButton",
    "HelpButton",
    "HelpScreen",
    "CloseHelpButton",
    "CloseHelpConfirmButton",
    "RestartButton",
    "OutcomeScreen",
    "OutcomeEyebrow",
    "OutcomeTitle",
    "OutcomeSummary",
    "OutcomeRoute",
    "OutcomeCauses",
    "OutcomeTip",
    "OutcomeRestartButton",
    "Toast",
  ].map((id) => [id, document.querySelector(`#${id}`)]),
);

const ActionCopy = Object.freeze({
  [ActionIds.MOVE]: {
    label: "移动",
    hint: "选择本回合可达终点",
  },
  [ActionIds.ENTER_TUNNEL]: {
    label: "进入地道",
    hint: "1 AP · 暴露 +2",
  },
  [ActionIds.EXIT_TUNNEL]: {
    label: "返回地面",
    hint: "1 AP · 会留下脚印",
  },
  [ActionIds.DIG]: {
    label: "向前开挖",
    hint: "已知走廊可连续施工",
  },
  [ActionIds.BRACE]: {
    label: "支护当前段",
    hint: "1 AP · 工具 1",
  },
  [ActionIds.RECON]: {
    label: "侦察",
    hint: "首次选主出口 · 后续复查当前格",
  },
  [ActionIds.DECOY]: {
    label: "布置假迹",
    hint: "组织 1 · 诱使搜索组改道一次",
  },
  [ActionIds.AMBUSH]: {
    label: "洞口伏击",
    hint: "弹药 1 · 离开不返还",
  },
  [ActionIds.TRAP]: {
    label: "洞口陷阱",
    hint: "工具 1 · 一次性",
  },
  [ActionIds.ATTACK]: {
    label: "地表压制",
    hint: "相邻敌军 · 暴露 +14",
  },
  [ActionIds.EVACUATE]: {
    label: "组织疏散",
    hint: "三批全撤 · 速度/负载各异",
  },
  [ActionIds.CLEAR_SEAL]: {
    label: "抢通封口",
    hint: "工具 2 · 动静很大",
  },
});

let gameState = CreateInitialState();
let selectedTileKey = null;
let actionMode = ActionIds.MOVE;
let previewAction = null;
let previewTileKey = null;
let selectedEvacGroupId = "Wounded";
let toastTimer = 0;
let briefingIndex = 0;
let gameStarted = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x111613);
scene.fog = new THREE.FogExp2(0x111613, 0.025);

const camera = new THREE.OrthographicCamera(-8, 8, 5, -5, 0.1, 100);
const cameraTarget = new THREE.Vector3(7.1, 0, 3.7);
const cameraOffset = new THREE.Vector3(7.6, 11.5, 9.2);
let cameraZoom = 1;

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

scene.add(new THREE.HemisphereLight(0xd8dcc8, 0x25231e, 2.3));
const keyLight = new THREE.DirectionalLight(0xffedc5, 2.4);
keyLight.position.set(7, 16, 8);
scene.add(keyLight);
const fillLight = new THREE.DirectionalLight(0x75a9a1, 0.8);
fillLight.position.set(-5, 8, -3);
scene.add(fillLight);

const surfaceStaticGroup = new THREE.Group();
const tunnelStaticGroup = new THREE.Group();
const surfaceDynamicGroup = new THREE.Group();
const tunnelDynamicGroup = new THREE.Group();
const overlayGroup = new THREE.Group();
scene.add(
  surfaceStaticGroup,
  tunnelStaticGroup,
  surfaceDynamicGroup,
  tunnelDynamicGroup,
  overlayGroup,
);

const tileMeshesByLayer = {
  [LayerIds.SURFACE]: new Map(),
  [LayerIds.TUNNEL]: new Map(),
};
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const pointerState = {
  down: false,
  moved: false,
  startX: 0,
  startY: 0,
  lastX: 0,
  lastY: 0,
};

function WorldPosition(tileKey, height = 0) {
  const { q, r } = ParseTileKey(tileKey);
  return new THREE.Vector3(1.66 * (q + r * 0.5), height, 1.44 * r);
}

function UpdateCamera() {
  camera.position.copy(cameraTarget).add(cameraOffset);
  camera.lookAt(cameraTarget);
  camera.zoom = cameraZoom;
  camera.updateProjectionMatrix();
}

function ResizeRenderer() {
  const width = Math.max(1, canvas.clientWidth);
  const height = Math.max(1, canvas.clientHeight);
  renderer.setSize(width, height, false);
  const aspect = width / height;
  const viewHeight = width < 760 ? 10.8 : 9.2;
  camera.left = -viewHeight * aspect * 0.5;
  camera.right = viewHeight * aspect * 0.5;
  camera.top = viewHeight * 0.5;
  camera.bottom = -viewHeight * 0.5;
  camera.updateProjectionMatrix();
}

function CreateLabelSprite(text, color = "#f1ead4", background = "rgba(15,17,15,.82)") {
  const labelCanvas = document.createElement("canvas");
  labelCanvas.width = 384;
  labelCanvas.height = 96;
  const context = labelCanvas.getContext("2d");
  context.clearRect(0, 0, labelCanvas.width, labelCanvas.height);
  context.fillStyle = background;
  context.fillRect(4, 12, 376, 70);
  context.strokeStyle = "rgba(255,255,255,.18)";
  context.strokeRect(4.5, 12.5, 375, 69);
  context.fillStyle = color;
  context.font = "700 30px Microsoft YaHei, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, 192, 48);
  const texture = new THREE.CanvasTexture(labelCanvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  }));
  sprite.scale.set(2.45, 0.61, 1);
  sprite.userData.disposableTexture = texture;
  return sprite;
}

function DisposeObject(object) {
  object.traverse((child) => {
    if (child.geometry) {
      child.geometry.dispose();
    }
    if (Array.isArray(child.material)) {
      child.material.forEach((material) => material.dispose());
    } else if (child.material) {
      if (child.userData.disposableTexture) {
        child.userData.disposableTexture.dispose();
      }
      child.material.dispose();
    }
  });
}

function ClearGroup(group) {
  for (const child of [...group.children]) {
    group.remove(child);
    DisposeObject(child);
  }
}

function CreateHexMesh(color, height = 0.18, opacity = 1) {
  const geometry = new THREE.CylinderGeometry(0.91, 0.91, height, 6);
  geometry.rotateY(Math.PI / 6);
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.93,
    metalness: 0.02,
    transparent: opacity < 1,
    opacity,
  });
  return new THREE.Mesh(geometry, material);
}

function CreateRing(color, radius = 0.72, opacity = 1) {
  const geometry = new THREE.TorusGeometry(radius, 0.055, 8, 48);
  geometry.rotateX(Math.PI / 2);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: false,
  });
  return new THREE.Mesh(geometry, material);
}

function AddStaticMap() {
  for (const tile of Object.values(gameState.tiles)) {
    const surfaceMesh = CreateHexMesh(TerrainCatalog[tile.terrainId].color, 0.17, 0.98);
    surfaceMesh.position.copy(WorldPosition(tile.tileKey, 0));
    surfaceMesh.userData.tileKey = tile.tileKey;
    surfaceMesh.userData.layer = LayerIds.SURFACE;
    surfaceMesh.receiveShadow = false;
    surfaceStaticGroup.add(surfaceMesh);
    tileMeshesByLayer[LayerIds.SURFACE].set(tile.tileKey, surfaceMesh);

    const tunnelMesh = CreateHexMesh(0x28261f, 0.1, 0.94);
    tunnelMesh.position.copy(WorldPosition(tile.tileKey, -0.02));
    tunnelMesh.userData.tileKey = tile.tileKey;
    tunnelMesh.userData.layer = LayerIds.TUNNEL;
    tunnelStaticGroup.add(tunnelMesh);
    tileMeshesByLayer[LayerIds.TUNNEL].set(tile.tileKey, tunnelMesh);

    if (tile.kind !== "normal") {
      const markerColor = tile.kind === "enemyPost"
        ? 0xbf5548
        : tile.kind === "safeExit"
          ? 0x80bf90
          : tile.kind === "origin"
            ? 0xd6b365
            : 0xa58f68;
      const marker = new THREE.Mesh(
        new THREE.CylinderGeometry(0.33, 0.42, 0.42, 6),
        new THREE.MeshStandardMaterial({ color: markerColor, roughness: 0.82 }),
      );
      marker.position.copy(WorldPosition(tile.tileKey, 0.29));
      marker.userData.tileKey = tile.tileKey;
      surfaceStaticGroup.add(marker);
      const label = CreateLabelSprite(tile.name);
      label.position.copy(WorldPosition(tile.tileKey, 1.04));
      surfaceStaticGroup.add(label);

      if (["origin", "safeExit"].includes(tile.kind)) {
        const undergroundProjection = CreateRing(markerColor, 0.46, 0.72);
        undergroundProjection.position.copy(WorldPosition(tile.tileKey, 0.18));
        tunnelStaticGroup.add(undergroundProjection);
        const undergroundLabel = CreateLabelSprite(
          tile.kind === "origin" ? `起点 · ${tile.name}` : `候选出口 · ${tile.name}`,
          "#dce7d8",
          "rgba(28,34,28,.9)",
        );
        undergroundLabel.position.copy(WorldPosition(tile.tileKey, 0.88));
        tunnelStaticGroup.add(undergroundLabel);
      }
    }
  }

  const roadMaterial = new THREE.LineBasicMaterial({
    color: 0xaaa080,
    transparent: true,
    opacity: 0.42,
  });
  const roadPoints = ["4,0", "4,1", "4,2", "4,3"]
    .map((tileKey) => WorldPosition(tileKey, 0.16));
  const roadLine = new THREE.Line(
    new THREE.BufferGeometry().setFromPoints(roadPoints),
    roadMaterial,
  );
  surfaceStaticGroup.add(roadLine);
}

function AddUnitMarker(unit, group) {
  const root = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.31, 0.54, 8),
    new THREE.MeshStandardMaterial({
      color: unit.color,
      roughness: 0.7,
      emissive: unit.unitId === gameState.selectedUnitId ? unit.color : 0x000000,
      emissiveIntensity: unit.unitId === gameState.selectedUnitId ? 0.22 : 0,
    }),
  );
  body.position.y = 0.35;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.17, 12, 8),
    new THREE.MeshStandardMaterial({ color: 0xdfc5a0, roughness: 0.9 }),
  );
  head.position.y = 0.74;
  root.add(body, head);
  if (unit.unitId === gameState.selectedUnitId) {
    const ring = CreateRing(0xf5f0de, 0.48);
    ring.position.y = 0.13;
    root.add(ring);
  }
  const label = CreateLabelSprite(
    `${unit.shortName} · ${unit.actionPoints}AP`,
    unit.health <= 1 ? "#ff8a76" : "#f1ead4",
  );
  label.position.y = 1.3;
  label.scale.multiplyScalar(0.82);
  root.add(label);
  root.position.copy(WorldPosition(unit.tileKey, unit.layer === LayerIds.TUNNEL ? 0.15 : 0.12));
  root.userData.tileKey = unit.tileKey;
  root.userData.unitId = unit.unitId;
  group.add(root);
}

function AddEnemyMarker(enemy) {
  if (enemy.health <= 0 || (enemy.inactiveUntilTurn ?? 0) > gameState.turn) {
    return;
  }
  const root = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.ConeGeometry(0.36, 0.72, 7),
    new THREE.MeshStandardMaterial({ color: enemy.color, roughness: 0.72 }),
  );
  body.position.y = 0.5;
  root.add(body);
  const healthPips = new THREE.Group();
  for (let index = 0; index < enemy.maxHealth; index += 1) {
    const pip = new THREE.Mesh(
      new THREE.BoxGeometry(0.12, 0.05, 0.05),
      new THREE.MeshBasicMaterial({
        color: index < enemy.health ? 0xe48b75 : 0x4c3632,
      }),
    );
    pip.position.set((index - (enemy.maxHealth - 1) / 2) * 0.15, 1.03, 0);
    healthPips.add(pip);
  }
  root.add(healthPips);
  const label = CreateLabelSprite(enemy.name, "#ffd0c5", "rgba(63,22,19,.88)");
  label.position.y = 1.37;
  label.scale.multiplyScalar(0.84);
  root.add(label);
  root.position.copy(WorldPosition(enemy.tileKey, 0.1));
  root.userData.tileKey = enemy.tileKey;
  root.userData.enemyId = enemy.enemyId;
  surfaceDynamicGroup.add(root);

  if (enemy.intent && enemy.intentRevealed) {
    const start = WorldPosition(enemy.tileKey, 0.19);
    const end = WorldPosition(enemy.intent.targetKey, 0.19);
    const lineGeometry = new THREE.BufferGeometry().setFromPoints([start, end]);
    const line = new THREE.Line(
      lineGeometry,
      new THREE.LineDashedMaterial({
        color: enemy.intent.intentId.includes("Seal") || enemy.intent.intentId.includes("Smoke")
          ? 0xff5d4a
          : 0xf0a45a,
        dashSize: 0.22,
        gapSize: 0.14,
      }),
    );
    line.computeLineDistances();
    surfaceDynamicGroup.add(line);
    const intentLabel = CreateLabelSprite(
      enemy.intent.label,
      "#ffd1c4",
      "rgba(80,29,24,.9)",
    );
    intentLabel.position.copy(end).add(new THREE.Vector3(0, 0.83, 0));
    intentLabel.scale.multiplyScalar(0.72);
    surfaceDynamicGroup.add(intentLabel);
  }
}

function AddEntranceMarker(tileKey, node, group, underground = false) {
  const tile = gameState.tiles[tileKey];
  if (!tile?.hasEntrance) {
    return;
  }
  const exitWindow = tile.kind === "safeExit" ? GetExitWindow(gameState, tileKey) : null;
  const color = node.sealed
    ? 0xe05248
    : exitWindow?.status === "Clear"
      ? 0x84c77c
      : ["Watched", "Sealing", "Smoking"].includes(exitWindow?.status)
        ? 0xe06a4f
    : tile.entranceKnownByEnemy
      ? 0xe1a04f
      : 0x76c7be;
  const ring = CreateRing(color, 0.43, 0.94);
  ring.position.copy(WorldPosition(tileKey, underground ? 0.2 : 0.2));
  group.add(ring);
  if (node.sealed) {
    const bar = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.08, 0.09),
      new THREE.MeshBasicMaterial({ color: 0xff5a4b }),
    );
    bar.position.copy(WorldPosition(tileKey, 0.25));
    bar.rotation.y = Math.PI / 6;
    group.add(bar);
  }
}

function AddPlanningOverlay() {
  if (!gameState.planningReconCompleted || !gameState.plannedExitKey) {
    return;
  }
  const routeStyles = [
    {
      path: gameState.plannedFastPath ?? [],
      color: 0xe2ad58,
      label: "快掘走廊",
      height: 0.11,
    },
    {
      path: gameState.plannedQuietPath ?? [],
      color: 0x75bfc2,
      label: "静掘走廊",
      height: 0.18,
    },
  ];
  for (const route of routeStyles) {
    if (route.path.length < 2) {
      continue;
    }
    const points = route.path.map((tileKey) => WorldPosition(tileKey, route.height));
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({
        color: route.color,
        transparent: true,
        opacity: 0.72,
      }),
    );
    tunnelDynamicGroup.add(line);
    const divergenceIndex = route.path.findIndex((tileKey, index) => (
      index > 0
      && routeStyles.some((candidate) => (
        candidate !== route
        && candidate.path[index] !== tileKey
      ))
    ));
    const labelTileKey = route.path[divergenceIndex >= 1 ? divergenceIndex : 1];
    const label = CreateLabelSprite(route.label, "#f6edce", "rgba(32,31,24,.88)");
    label.scale.multiplyScalar(0.72);
    label.position.copy(WorldPosition(labelTileKey, 0.76));
    tunnelDynamicGroup.add(label);
  }
}

function AddTunnelNetwork() {
  const nodeKeys = Object.keys(gameState.tunnels);
  const seenEdges = new Set();
  for (const tileKey of nodeKeys) {
    const node = gameState.tunnels[tileKey];
    const nodeColor = node.collapsed
      ? 0x6f3532
      : node.smoke > 0
        ? 0x77736b
        : node.braced
          ? 0xd3b268
          : node.cracked
            ? 0xd5794f
            : 0xa88c54;
    const disc = CreateHexMesh(nodeColor, 0.2, node.collapsed ? 0.64 : 0.98);
    disc.scale.setScalar(0.68);
    disc.position.copy(WorldPosition(tileKey, 0.12));
    tunnelDynamicGroup.add(disc);

    if (node.braced && !node.collapsed) {
      const braceRing = CreateRing(0xe7c981, 0.52, 0.82);
      braceRing.position.copy(WorldPosition(tileKey, 0.24));
      tunnelDynamicGroup.add(braceRing);
    }
    if (node.cracked && !node.collapsed) {
      const crack = new THREE.Mesh(
        new THREE.BoxGeometry(0.75, 0.05, 0.08),
        new THREE.MeshBasicMaterial({ color: 0x5a1e18 }),
      );
      crack.position.copy(WorldPosition(tileKey, 0.27));
      crack.rotation.y = Math.PI * 0.25;
      tunnelDynamicGroup.add(crack);
    }
    if (node.smoke > 0) {
      const smoke = new THREE.Mesh(
        new THREE.SphereGeometry(0.68, 14, 10),
        new THREE.MeshBasicMaterial({
          color: 0xaaa69a,
          transparent: true,
          opacity: 0.24,
          depthWrite: false,
        }),
      );
      smoke.position.copy(WorldPosition(tileKey, 0.45));
      tunnelDynamicGroup.add(smoke);
    }
    AddEntranceMarker(tileKey, node, tunnelDynamicGroup, true);
    AddEntranceMarker(tileKey, node, surfaceDynamicGroup, false);

    for (const neighborKey of GetTunnelNeighbors(gameState, tileKey, true)) {
      const edgeId = [tileKey, neighborKey].sort().join("|");
      if (seenEdges.has(edgeId)) {
        continue;
      }
      seenEdges.add(edgeId);
      const neighbor = gameState.tunnels[neighborKey];
      const color = node.collapsed || neighbor.collapsed ? 0x793c36 : 0xb59759;
      const points = [
        WorldPosition(tileKey, 0.18),
        WorldPosition(neighborKey, 0.18),
      ];
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(points),
        new THREE.LineBasicMaterial({
          color,
          transparent: true,
          opacity: node.collapsed || neighbor.collapsed ? 0.34 : 0.9,
        }),
      );
      tunnelDynamicGroup.add(line);
    }
  }
}

function AddCivilians() {
  for (const group of gameState.civilians) {
    if (!["Moving", "Trapped"].includes(group.status)) {
      continue;
    }
    const root = new THREE.Group();
    for (let index = 0; index < Math.min(group.people, 3); index += 1) {
      const figure = new THREE.Mesh(
        new THREE.CylinderGeometry(0.09, 0.13, 0.33, 7),
        new THREE.MeshStandardMaterial({
          color: group.status === "Trapped" ? 0xd86154 : 0xd9d0ad,
          roughness: 0.9,
        }),
      );
      figure.position.set((index - 1) * 0.22, 0.26, 0.05 * (index % 2));
      root.add(figure);
    }
    const label = CreateLabelSprite(
      `${group.name} · ${group.people}人`,
      group.status === "Trapped" ? "#ff9c8f" : "#eee5c6",
    );
    label.position.y = 0.95;
    label.scale.multiplyScalar(0.74);
    root.add(label);
    root.position.copy(WorldPosition(group.tileKey, 0.14));
    tunnelDynamicGroup.add(root);
  }
}

function AddDecoys() {
  for (const decoy of gameState.decoys.filter((entry) => {
    const evidenceId = entry.evidenceId
      ?? entry.decoyId?.replace(/^Decoy/, "Evidence");
    return !gameState.usedDecoyIds?.includes(evidenceId);
  })) {
    const ring = CreateRing(0xf0b968, 0.62, 0.8);
    ring.position.copy(WorldPosition(decoy.tileKey, 0.22));
    surfaceDynamicGroup.add(ring);
    const label = CreateLabelSprite("假迹", "#ffd690", "rgba(65,49,23,.88)");
    label.position.copy(WorldPosition(decoy.tileKey, 0.9));
    label.scale.multiplyScalar(0.65);
    surfaceDynamicGroup.add(label);
  }
}

function AddWarnings() {
  for (const warning of gameState.warnings.filter((entry) => !entry.resolved)) {
    const group = gameState.selectedLayer === LayerIds.TUNNEL
      ? tunnelDynamicGroup
      : surfaceDynamicGroup;
    const ring = CreateRing(0xff5547, 0.74, 0.95);
    ring.position.copy(WorldPosition(warning.targetKey, 0.31));
    group.add(ring);
    const label = CreateLabelSprite(
      `${warning.kind === "Smoke" ? "灌烟" : warning.kind === "Seal" ? "封洞" : "塌方"} · T${warning.resolvesTurn}`,
      "#ffd0ca",
      "rgba(92,25,21,.92)",
    );
    label.position.copy(WorldPosition(warning.targetKey, 1.08));
    label.scale.multiplyScalar(0.7);
    group.add(label);
  }
}

function AddSoilLabels() {
  if (gameState.selectedLayer !== LayerIds.TUNNEL) {
    return;
  }
  for (const tile of Object.values(gameState.tiles)) {
    if (!IsSoilKnown(gameState, tile.tileKey) || gameState.tunnels[tile.tileKey]) {
      continue;
    }
    const label = CreateLabelSprite(
      SoilCatalog[tile.soilId].label,
      tile.soilId === "loose" ? "#ff9e7c" : "#b9b2a0",
      "rgba(24,24,21,.7)",
    );
    label.position.copy(WorldPosition(tile.tileKey, 0.62));
    label.scale.multiplyScalar(0.48);
    tunnelDynamicGroup.add(label);
  }
}

function AddActionTargets() {
  ClearGroup(overlayGroup);
  const unit = CurrentUnit();
  if (!unit || unit.layer !== gameState.selectedLayer) {
    return;
  }
  const pathPlans = GetInterfacePathPlans(gameState.selectedUnitId, actionMode);
  const targets = pathPlans.length
    ? pathPlans.map((plan) => plan.targetKey)
    : GetActionTargets(gameState, gameState.selectedUnitId, actionMode);
  const color = actionMode === ActionIds.ATTACK
    ? 0xe95c4d
    : actionMode === ActionIds.DIG
      ? 0xd7aa57
      : actionMode === ActionIds.EVACUATE
        ? 0x8ecb8b
        : 0x68c4bd;
  for (const tileKey of targets) {
    const ring = CreateRing(color, 0.72, 0.88);
    ring.position.copy(WorldPosition(tileKey, 0.34));
    ring.userData.tileKey = tileKey;
    overlayGroup.add(ring);
  }
  if (previewAction?.targetKeys?.length) {
    const routeKeys = [unit.tileKey, ...previewAction.targetKeys];
    const routePoints = routeKeys.map((tileKey) => WorldPosition(tileKey, 0.48));
    const routeLine = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(routePoints),
      new THREE.LineDashedMaterial({
        color: 0xffffff,
        dashSize: 0.22,
        gapSize: 0.12,
        transparent: true,
        opacity: 0.92,
      }),
    );
    routeLine.computeLineDistances();
    overlayGroup.add(routeLine);
    previewAction.targetKeys.forEach((tileKey, index) => {
      const label = CreateLabelSprite(
        String(index + 1),
        "#fff7dc",
        "rgba(24,24,21,.92)",
      );
      label.position.copy(WorldPosition(tileKey, 0.76));
      label.scale.multiplyScalar(0.42);
      overlayGroup.add(label);
    });
  }
  if (previewTileKey) {
    const previewRing = CreateRing(0xffffff, 0.82, 1);
    previewRing.position.copy(WorldPosition(previewTileKey, 0.39));
    overlayGroup.add(previewRing);
  }
}

function RenderScene() {
  ClearGroup(surfaceDynamicGroup);
  ClearGroup(tunnelDynamicGroup);
  AddPlanningOverlay();
  AddTunnelNetwork();
  AddCivilians();
  AddDecoys();
  AddWarnings();
  AddSoilLabels();
  for (const unit of gameState.units) {
    if (unit.health <= 0) {
      continue;
    }
    AddUnitMarker(
      unit,
      unit.layer === LayerIds.SURFACE ? surfaceDynamicGroup : tunnelDynamicGroup,
    );
  }
  gameState.enemies.forEach(AddEnemyMarker);
  AddActionTargets();
  surfaceStaticGroup.visible = gameState.selectedLayer === LayerIds.SURFACE;
  surfaceDynamicGroup.visible = gameState.selectedLayer === LayerIds.SURFACE;
  tunnelStaticGroup.visible = gameState.selectedLayer === LayerIds.TUNNEL;
  tunnelDynamicGroup.visible = gameState.selectedLayer === LayerIds.TUNNEL;
  overlayGroup.visible = true;
  renderer.render(scene, camera);
}

function ActionNeedsTarget(actionId) {
  return [
    ActionIds.MOVE,
    ActionIds.DIG,
    ActionIds.DECOY,
    ActionIds.ATTACK,
    ActionIds.EVACUATE,
    ActionIds.RECON,
  ].includes(actionId);
}

function IsPathAction(actionId) {
  return [ActionIds.MOVE, ActionIds.DIG].includes(actionId);
}

function GetInterfacePathPlans(unitId, actionId) {
  return IsPathAction(actionId)
    ? GetActionPathPlans(gameState, unitId, actionId)
    : [];
}

function GetInterfaceActionTargets(unitId, actionId) {
  const pathPlans = GetInterfacePathPlans(unitId, actionId);
  return pathPlans.length
    ? pathPlans.map((plan) => plan.targetKey)
    : GetActionTargets(gameState, unitId, actionId);
}

function GetPreviewPathPlan(action) {
  if (!IsPathAction(action.actionId) || !action.targetKeys?.length) {
    return null;
  }
  const result = ApplyPlayerActionPath(gameState, action);
  return result.ok ? result.plan : null;
}

function CurrentUnit() {
  return gameState.units.find((unit) => unit.unitId === gameState.selectedUnitId) ?? null;
}

function TunnelNetworkSummary(unit) {
  if (!unit || unit.layer !== LayerIds.TUNNEL || !gameState.tunnels[unit.tileKey]) {
    return {
      title: "地道网未进入",
      body: "切换到地下层可查看已挖节点、土层、洞口状态与敌军反制预警。",
      danger: false,
    };
  }
  const component = [];
  const queue = [unit.tileKey];
  const seen = new Set(queue);
  while (queue.length) {
    const currentKey = queue.shift();
    component.push(currentKey);
    for (const neighborKey of GetTunnelNeighbors(gameState, currentKey, true)) {
      if (!seen.has(neighborKey)) {
        seen.add(neighborKey);
        queue.push(neighborKey);
      }
    }
  }
  const entrances = component.filter((tileKey) => gameState.tiles[tileKey]?.hasEntrance);
  const openEntrances = entrances.filter((tileKey) => (
    !gameState.tunnels[tileKey].sealed
    && !gameState.tunnels[tileKey].collapsed
  ));
  const unstable = component.filter((tileKey) => (
    gameState.tunnels[tileKey].cracked
    || gameState.tunnels[tileKey].collapsed
  ));
  return {
    title: `当前网络 · ${component.length} 格 / ${openEntrances.length} 个可用出口`,
    body: `总出口 ${entrances.length} · 薄弱段 ${unstable.length} · 敌军确认 ${entrances.filter((tileKey) => gameState.tiles[tileKey].entranceKnownByEnemy).length} 个。${openEntrances.length < 2 ? "单出口容易被封堵和灌烟，请尽快规划支路。" : "双出口可分流群众并削弱灌烟。"} `,
    danger: openEntrances.length < 2,
  };
}

function ActionButtonHtml(actionId) {
  const copy = ActionCopy[actionId];
  return `<button type="button" data-action="${actionId}" class="${actionMode === actionId ? "active" : ""}"><span>${copy.label}</span><small>${copy.hint}</small></button>`;
}

function PathChoiceButtonHtml(plan) {
  const destination = gameState.tiles[plan.targetKey];
  const route = plan.targetKeys
    .map((tileKey) => `${gameState.tiles[tileKey].name}(${tileKey})`)
    .join(" → ");
  const actionLabel = plan.actionId === ActionIds.DIG ? "连续开挖" : "连续移动";
  const cost = `${plan.apCost}行动点${plan.toolsCost ? `，工具${plan.toolsCost}` : ""}，暴露增加${plan.exposureDelta}`;
  return `<button type="button" class="pathChoice" data-path-target="${plan.targetKey}" aria-label="预览${actionLabel}${plan.steps}步到${destination.name}${plan.targetKey}，路线${route}，消耗${cost}"><span>${actionLabel} ${plan.steps} 步 → ${destination.name} ${plan.targetKey}</span><small>${route} · ${plan.apCost} AP${plan.toolsCost ? ` · 工具 ${plan.toolsCost}` : ""}</small></button>`;
}

function RenderInspector() {
  const unit = CurrentUnit();
  if (!unit) {
    return;
  }
  const tile = gameState.tiles[unit.tileKey];
  ui.InspectorEyebrow.textContent = `${tile.name} · ${tile.tileKey}`;
  ui.InspectorTitle.textContent = unit.name;
  ui.InspectorLayer.textContent = unit.layer === LayerIds.SURFACE ? "地面" : "地下";
  ui.InspectorDescription.textContent = unit.description;
  ui.InspectorStats.innerHTML = `
    <div><small>行动点</small><b>${unit.actionPoints}/${unit.maxActionPoints}</b></div>
    <div><small>状态</small><b>${unit.health}/${unit.maxHealth}</b></div>
    <div><small>${unit.ammo !== undefined ? "弹药" : "战力"}</small><b>${unit.ammo !== undefined ? unit.ammo : unit.attack}</b></div>
  `;
  const network = TunnelNetworkSummary(unit);
  ui.NetworkCard.classList.toggle("danger", network.danger);
  ui.NetworkCard.innerHTML = `<strong>${network.title}</strong>${network.body}`;
  const actions = unit.layer === gameState.selectedLayer
    ? GetAvailableActions(gameState, unit.unitId)
    : [];
  if (unit.layer !== gameState.selectedLayer) {
    ui.NetworkCard.classList.add("danger");
    ui.NetworkCard.innerHTML = `<strong>当前仅查看${gameState.selectedLayer === LayerIds.TUNNEL ? "地下" : "地面"}层</strong>${unit.shortName}仍在${unit.layer === LayerIds.TUNNEL ? "地下" : "地面"}；先切回其所在层，或从洞口执行跨层命令。`;
  }
  if (!actions.includes(actionMode)) {
    actionMode = actions.includes(ActionIds.MOVE) ? ActionIds.MOVE : (actions[0] ?? ActionIds.MOVE);
  }
  ui.ActionButtons.innerHTML = actions.length
    ? actions.map(ActionButtonHtml).join("")
    : "<p class=\"noActions\">本回合已无可用行动</p>";
  for (const button of ui.ActionButtons.querySelectorAll("[data-action]")) {
    button.addEventListener("click", () => BeginAction(button.dataset.action));
  }
  const pathPlans = GetInterfacePathPlans(unit.unitId, actionMode)
    .filter((plan) => plan.steps > 1);
  if (pathPlans.length) {
    ui.ActionButtons.insertAdjacentHTML(
      "beforeend",
      `<p class="pathChoiceLabel">本回合连续终点 · 仍逐格结算</p>${pathPlans.map(PathChoiceButtonHtml).join("")}`,
    );
    for (const button of ui.ActionButtons.querySelectorAll("[data-path-target]")) {
      button.addEventListener("click", () => SetPreview({
        actionId: actionMode,
        unitId: unit.unitId,
        targetKey: button.dataset.pathTarget,
      }));
    }
  }
}

function CivilianStatusLabel(group) {
  switch (group.status) {
    case "Safe":
      return "已安全撤出";
    case "Moving":
      return group.waitingForSignal
        ? `${gameState.tiles[group.exitKey]?.name ?? "出口"}下方 · 等待信号`
        : `第 ${group.launchOrder ?? "?"} 批 · ${gameState.tiles[group.tileKey]?.name ?? "地下转移"}`;
    case "Trapped":
      return `被困 · ${gameState.tiles[group.tileKey]?.name ?? "地道内"}`;
    default:
      return "赵庄待命";
  }
}

function CivilianMobileStatus(group) {
  if (group.status === "Safe") {
    return "已撤";
  }
  if (group.status === "Trapped") {
    return "被困";
  }
  if (group.status === "Moving") {
    return group.waitingForSignal ? "等信号" : `第${group.launchOrder ?? "?"}批`;
  }
  return "待命";
}

function CivilianShortName(group) {
  return {
    Wounded: "伤员担架",
    Families: "两户乡亲",
    Contacts: "交通骨干",
  }[group.groupId] ?? group.name;
}

function ExitWindowCardHtml(exitKey, actionTargets) {
  const windowState = GetExitWindow(gameState, exitKey);
  const tile = gameState.tiles[exitKey];
  const actionable = actionTargets.includes(exitKey);
  const selected = previewAction?.actionId === actionMode
    && previewAction?.targetKey === exitKey;
  const statusLabels = {
    Unknown: "未复查",
    Clear: `安全至 T${windowState.checkedUntilTurn}`,
    Watched: "敌军监视",
    Sealing: "封洞中",
    Smoking: "烟流威胁",
  };
  const threat = windowState.threatName
    ? `${windowState.threatName}${windowState.threatDistance <= 1 ? "已到近旁" : `距洞口 ${windowState.threatDistance} 格`}`
    : "暂无可见敌军威胁";
  const actionHint = actionMode === ActionIds.RECON
    ? "选择为主勘线"
    : "预览群众转移";
  const actionLabel = actionMode === ActionIds.RECON
    ? `侦察${tile.name}主出口走廊`
    : `从${tile.name}预览群众转移`;
  return `
    <button type="button" data-exit-key="${exitKey}" class="exitWindowCard ${windowState.status.toLowerCase()} ${actionable ? "actionable" : ""} ${selected ? "selected" : ""}" ${actionable ? `aria-label="${actionLabel}"` : 'aria-disabled="true" tabindex="-1"'}>
      <span>${tile.name}</span><b>${statusLabels[windowState.status]}</b>
      <small>${windowState.connected ? windowState.detail : "地道尚未接通"} · ${threat}</small>
      ${actionable ? `<em>${actionHint}</em>` : ""}
    </button>
  `;
}

function RenderHud() {
  const objective = GetObjectiveSummary(gameState);
  ui.TurnValue.textContent = String(Math.min(gameState.turn, gameState.maxTurns));
  ui.PhaseValue.textContent = gameState.phase === "Player" ? "我方行动" : "敌军结算";
  ui.SweepText.textContent = objective.sweep;
  ui.SweepReadout.classList.toggle("active", gameState.sweepActive);
  ui.SweepFill.style.width = `${Math.min(100, (gameState.turn / gameState.sweepTurn) * 100)}%`;
  ui.ToolsValue.textContent = String(gameState.tools);
  ui.OrganizationValue.textContent = String(gameState.organization);
  ui.IntelValue.textContent = String(gameState.intel);
  ui.ExposureValue.textContent = String(gameState.exposure);
  ui.SafetyValue.textContent = String(gameState.peopleSafety);
  ui.SafetyValue.style.color = gameState.peopleSafety <= 60 ? "#ef877a" : "";
  ui.ObjectivePrimary.textContent = objective.primary;
  ui.ObjectiveFill.style.width = `${Math.min(100, (gameState.civiliansSafe / MissionConfig.requiredEvacuees) * 100)}%`;
  ui.ObjectiveRecon.querySelector("span").textContent = objective.planningReconCompleted
    ? `主勘线：${objective.plannedExitName}；出口另需上浮复查`
    : "首次开挖前选择北/南主出口勘线；出口另需上浮复查";
  ui.ObjectiveRecon.classList.toggle("complete", gameState.planningReconCompleted);
  ui.ObjectiveDig.classList.toggle("complete", gameState.tunnelsDug > 0);
  ui.ObjectiveSweep.querySelector("span").textContent = objective.sweep;
  ui.ObjectiveSweep.classList.toggle("complete", gameState.sweepActive);
  const exitCardActionTargets = [ActionIds.RECON, ActionIds.EVACUATE].includes(actionMode)
    ? GetActionTargets(gameState, gameState.selectedUnitId, actionMode)
    : [];
  ui.ExitWindowBoard.innerHTML = ["2,1", "0,5"]
    .map((exitKey) => ExitWindowCardHtml(exitKey, exitCardActionTargets))
    .join("");
  for (const button of ui.ExitWindowBoard.querySelectorAll(".exitWindowCard.actionable")) {
    button.addEventListener("click", () => {
      SetPreview({
        actionId: actionMode,
        unitId: gameState.selectedUnitId,
        targetKey: button.dataset.exitKey,
        groupId: actionMode === ActionIds.EVACUATE ? selectedEvacGroupId : undefined,
      });
      for (const card of ui.ExitWindowBoard.querySelectorAll(".exitWindowCard")) {
        card.classList.toggle("selected", card === button);
      }
    });
  }
  if (!gameState.civilians.some((group) => (
    group.groupId === selectedEvacGroupId
    && group.status === "Waiting"
  ))) {
    selectedEvacGroupId = gameState.civilians.find((group) => group.status === "Waiting")?.groupId
      ?? selectedEvacGroupId;
  }
  ui.CivilianLedger.innerHTML = gameState.civilians.map((group) => `
    <button type="button" data-group="${group.groupId}" class="civilianEntry ${group.status.toLowerCase()} ${group.groupId === selectedEvacGroupId ? "selected" : ""}" ${group.status === "Waiting" ? "" : "disabled"}>
      <b><span class="desktopCivilianName">${group.name}</span><span class="mobileCivilianName">${CivilianShortName(group)}</span> · ${group.people}人</b>
      <span>${CivilianStatusLabel(group)}</span>
      <small class="desktopCivilianSummary">${group.moveSteps ?? 2} 段/回合 · 负载 ${group.trafficLoad ?? 1}${group.trafficDelays ? ` · 已堵 ${group.trafficDelays} 回合` : ""}<br>${group.logisticsNote ?? "标准转移批次"}</small>
      <small class="mobileCivilianSummary">${CivilianMobileStatus(group)} · 速${group.moveSteps ?? 2} · 载${group.trafficLoad ?? 1}${group.trafficDelays ? ` · 堵${group.trafficDelays}` : ""}</small>
    </button>
  `).join("");
  for (const button of ui.CivilianLedger.querySelectorAll("[data-group]")) {
    button.addEventListener("click", () => {
      selectedEvacGroupId = button.dataset.group;
      actionMode = ActionIds.EVACUATE;
      CancelPreview(false);
      RenderAll();
      ShowToast("已选择这批群众；现在点地图上的安全出口预览路线。");
    });
  }
  ui.SurfaceLayerButton.classList.toggle("active", gameState.selectedLayer === LayerIds.SURFACE);
  ui.TunnelLayerButton.classList.toggle("active", gameState.selectedLayer === LayerIds.TUNNEL);
  ui.LayerWatermark.textContent = gameState.selectedLayer === LayerIds.SURFACE ? "地面态势" : "地下网络";
  document.body.classList.toggle("tunnelLayer", gameState.selectedLayer === LayerIds.TUNNEL);
  RenderInspector();
  ui.EventLog.innerHTML = gameState.log.map((entry) => (
    `<li class="${entry.kind}"><b>T${entry.turn}</b>${entry.text}</li>`
  )).join("");
  ui.EventLog.scrollTop = ui.EventLog.scrollHeight;
}

function RenderAll() {
  RenderHud();
  RenderScene();
  SaveCheckpoint();
  if (gameState.outcome) {
    ShowOutcome();
  }
}

function ShowToast(message) {
  window.clearTimeout(toastTimer);
  ui.Toast.textContent = message;
  ui.Toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    ui.Toast.hidden = true;
  }, 3100);
}

function SetLayer(layerId) {
  if (!Object.values(LayerIds).includes(layerId)) {
    return;
  }
  gameState.selectedLayer = layerId;
  const unit = CurrentUnit();
  if (unit?.layer !== layerId) {
    const sameLayerUnit = gameState.units.find((candidate) => (
      candidate.health > 0
      && candidate.layer === layerId
    ));
    if (sameLayerUnit) {
      gameState.selectedUnitId = sameLayerUnit.unitId;
    }
  }
  CancelPreview();
  RenderAll();
}

function SelectUnit(unitId) {
  const unit = gameState.units.find((candidate) => (
    candidate.unitId === unitId
    && candidate.health > 0
  ));
  if (!unit) {
    return;
  }
  gameState.selectedUnitId = unit.unitId;
  gameState.selectedLayer = unit.layer;
  selectedTileKey = unit.tileKey;
  actionMode = GetAvailableActions(gameState, unit.unitId).includes(ActionIds.MOVE)
    ? ActionIds.MOVE
    : (GetAvailableActions(gameState, unit.unitId)[0] ?? ActionIds.MOVE);
  CancelPreview(false);
  RenderAll();
}

function CycleUnit() {
  const aliveUnits = gameState.units.filter((unit) => unit.health > 0);
  const index = aliveUnits.findIndex((unit) => unit.unitId === gameState.selectedUnitId);
  SelectUnit(aliveUnits[(index + 1) % aliveUnits.length].unitId);
}

function BeginAction(actionId) {
  const available = GetAvailableActions(gameState, gameState.selectedUnitId);
  if (!available.includes(actionId)) {
    ShowToast("当前单位无法执行这个命令。");
    return;
  }
  actionMode = actionId;
  CancelPreview(false);
  if (!ActionNeedsTarget(actionId)) {
    SetPreview({
      actionId,
      unitId: gameState.selectedUnitId,
    });
  } else {
    ShowToast("选择高亮六角格查看行动预览；确认前不会扣除资源。");
  }
  RenderAll();
}

function BuildPreview(action) {
  const unit = CurrentUnit();
  const tile = action.targetKey ? gameState.tiles[action.targetKey] : gameState.tiles[unit.tileKey];
  const pathPlan = GetPreviewPathPlan(action);
  switch (action.actionId) {
    case ActionIds.MOVE: {
      const routeText = action.targetKeys
        ?.map((tileKey) => `${gameState.tiles[tileKey].name}(${tileKey})`)
        .join(" → ");
      const exposureText = pathPlan?.exposureDelta
        ? `｜暴露 +${pathPlan.exposureDelta}`
        : unit.layer === LayerIds.TUNNEL
          ? "｜暴露不变"
          : `｜终点掩护 ${TerrainCatalog[tile.terrainId].cover}`;
      const healthText = pathPlan?.healthLoss
        ? `｜烟害 ${pathPlan.healthLoss}`
        : "";
      const stopText = pathPlan?.decisionStop
        ? `｜抵达后强制停下：${pathPlan.decisionStop}`
        : "";
      return {
        eyebrow: unit.layer === LayerIds.SURFACE ? "地面移动预览" : "地下移动预览",
        title: `${pathPlan?.steps > 1 ? `连续移动 ${pathPlan.steps} 步至` : "移动到"}${tile.name}`,
        body: `${pathPlan?.apCost ?? 1} AP${exposureText}${healthText}｜路线：${routeText ?? tile.name}${stopText}｜执行后仍在我方回合；敌军预警只在手动结束回合后结算`,
      };
    }
    case ActionIds.DIG: {
      const soil = SoilCatalog[tile.soilId];
      const pathTiles = (action.targetKeys ?? [tile.tileKey])
        .map((tileKey) => gameState.tiles[tileKey]);
      const known = pathTiles.every((entry) => IsSoilKnown(gameState, entry.tileKey));
      const routeText = pathTiles
        .map((entry) => `${entry.name}(${entry.tileKey})`)
        .join(" → ");
      const soilText = pathTiles
        .map((entry) => `${entry.name}:${SoilCatalog[entry.soilId].label}`)
        .join("、");
      const stopText = pathPlan?.decisionStop
        ? `｜抵达后强制停下：${pathPlan.decisionStop}`
        : "";
      return {
        eyebrow: "开挖预览",
        title: `${pathPlan?.steps > 1 ? `连续开挖 ${pathPlan.steps} 段至` : "向"}${tile.name}${pathPlan?.steps > 1 ? "" : "下方开挖"}`,
        body: known
          ? `${pathPlan?.apCost ?? 1} AP｜工具 ${pathPlan?.toolsCost ?? soil.digCost}｜暴露 +${pathPlan?.exposureDelta ?? soil.noise}｜路线：${routeText}｜${soilText}${stopText}｜逐段留下开挖证据；本次不自动支护或结束回合`
          : `1 AP｜工具 1–2｜暴露约 +6–11｜路线：${routeText}｜土层未知：只执行这一段，实际消耗与塌方风险须停下核对${stopText}`,
      };
    }
    case ActionIds.RECON:
      if (gameState.tunnelsDug === 0 && !gameState.planningReconCompleted) {
        const survey = GetRouteSurvey(gameState, action.targetKey);
        return {
          eyebrow: "主走廊勘线预览",
          title: `以${survey.exitName}为主出口`,
          body: `快掘：${survey.fast.segments} 段 / 工具 ${survey.fast.tools} / 噪音 ${survey.fast.noise}${survey.fast.unstable ? ` / 返沙 ${survey.fast.unstable}` : ""}；静掘：${survey.quiet.segments} 段 / 工具 ${survey.quiet.tools} / 噪音 ${survey.quiet.noise}${survey.quiet.knownEntrances ? ` / 已知旧洞 ${survey.quiet.knownEntrances}` : ""}。最近威胁：${survey.nearestThreat?.name ?? "无"}，距出口 ${survey.nearestThreat?.distance ?? "-"} 格。确认后揭示两条候选走廊；主出口接通前不能改用另一出口发车。`,
        };
      }
      if (tile.kind === "safeExit") {
        const windowState = GetExitWindow(gameState, tile.tileKey);
        return {
          eyebrow: "出口复查预览",
          title: `在${tile.name}发出地面信号`,
          body: `1 AP｜组织 ${gameState.reconActions > 0 ? 1 : 0}｜情报净 +1｜暴露 ${gameState.reconActions > 0 ? "-5" : "+1"}｜信号持续本回合与下一回合；当前：${windowState.detail}`,
        };
      }
      return {
        eyebrow: "侦察预览",
        title: `查明${tile.name}周边土层与意图`,
        body: gameState.reconActions > 0
          ? "1 AP｜组织 1｜情报 +2｜暴露 -5｜每回合限一次；同一格须间隔一回合"
          : "1 AP｜情报 +2｜暴露 +1｜揭示半径 2",
      };
    case ActionIds.DECOY: {
      const responder = GetDecoyResponder(gameState, action.targetKey);
      return {
        eyebrow: "欺骗预览",
        title: `在${tile.name}布置假迹`,
        body: `1 AP｜组织 1｜暴露 -8｜假迹持续 4 回合；${responder ? `预计响应：${responder.name}（距 ${responder.distance} 格，下次敌军规划时响应）` : "五格内没有可响应敌军，可能自然落空"}；成功诱导只浪费该敌军一次调查行动`,
      };
    }
    case ActionIds.AMBUSH: {
      const warningReserved = gameState.warnings.some((warning) => (
        !warning.resolved
        && warning.targetKey === tile.tileKey
        && ["Seal", "Smoke"].includes(warning.kind)
      ));
      return {
        eyebrow: "伏击预览",
        title: `在${tile.name}洞口伏击`,
        body: `1 AP｜预留弹药 1｜离开洞口不返还｜${warningReserved ? "锁定当前预警工兵，其他敌军不会抢先消耗" : "优先打断敌军进逼、封洞或灌烟"}；会暴露洞口`,
      };
    }
    case ActionIds.TRAP: {
      const warningReserved = gameState.warnings.some((warning) => (
        !warning.resolved
        && warning.targetKey === tile.tileKey
        && ["Seal", "Smoke"].includes(warning.kind)
      ));
      return {
        eyebrow: "洞口防御预览",
        title: `在${tile.name}布置一次性陷阱`,
        body: `1 AP｜工具 1｜${warningReserved ? "锁定当前预警工兵，其他敌军不会抢先消耗" : "打断下一次洞口进入、近旁攻击、封洞或灌烟"}`,
      };
    }
    case ActionIds.ATTACK: {
      const combat = GetCombatPreview(gameState, unit.unitId, action.targetKey);
      return {
        eyebrow: "压制预估",
        title: `${combat.attacker} → ${combat.defender}`,
        body: `造成 ${combat.damage}｜还击 ${combat.retaliation}｜暴露 +${combat.exposureGain}｜${combat.note}`,
      };
    }
    case ActionIds.ENTER_TUNNEL:
      return {
        eyebrow: "跨层预览",
        title: `从${tile.name}进入地下`,
        body: "1 AP｜暴露 +2｜洞口一旦被封将不能跨层，但地下横向路线仍可通行",
      };
    case ActionIds.EXIT_TUNNEL:
      return {
        eyebrow: "上浮预览",
        title: `从${tile.name}返回地面`,
        body: `1 AP｜暴露 +${tile.entranceKnownByEnemy ? 5 : 2}｜留下两回合可追踪脚印`,
      };
    case ActionIds.BRACE:
      return {
        eyebrow: "工程预览",
        title: `支护${tile.name}地下薄弱段`,
        body: "1 AP｜工具 1｜通行容量 2→3｜解除返沙层塌方预警；可让重载 2 与轻载 1 同回合并行，但两支重载仍会冲突",
      };
    case ActionIds.EVACUATE: {
      const group = gameState.civilians.find((entry) => entry.groupId === action.groupId)
        ?? gameState.civilians.find((entry) => entry.status === "Waiting");
      const estimate = group
        ? GetCivilianTransitEstimate(gameState, group.groupId, action.targetKey)
        : null;
      const projectedExitKey = estimate?.projectedExitKey ?? action.targetKey;
      const projectedExit = gameState.tiles[projectedExitKey];
      const windowState = GetExitWindow(gameState, projectedExitKey);
      const readyText = estimate?.readyTurn === null || estimate?.readyTurn === undefined
        ? "当前路线无法进入出洞窗口"
        : `约 T${estimate.readyTurn} 进入出洞窗口`;
      const rerouteText = estimate?.rerouted
        ? `当前已知反制会让本批改走${projectedExit.name}`
        : `按${projectedExit.name}现有路线`;
      const deadlineText = estimate?.deadlineSlack === null || estimate?.deadlineSlack === undefined
        ? "时限未知"
        : estimate.deadlineSlack < 0
          ? `晚于 T${gameState.maxTurns}，可能来不及`
          : estimate.deadlineSlack === 0
            ? `压线到 T${gameState.maxTurns}`
            : `期限余 ${estimate.deadlineSlack} 回合`;
      const bottleneckTile = estimate?.bottleneckKey
        ? gameState.tiles[estimate.bottleneckKey]
        : null;
      const braceText = estimate?.firstBottleneckBraceRelief === "Helps"
        ? "；支护后容量 3 可缓解此处"
        : estimate?.firstBottleneckBraceRelief === "Insufficient"
          ? estimate.bottleneckCapacity >= 3
            ? "；该段容量已为 3，仍不足"
            : "；支护后容量 3 仍不足"
          : "";
      const queueText = bottleneckTile
        ? `预计被容量卡住 ${estimate.congestionTurns} 回合、出洞窗口延后 ${estimate.etaDelayTurns} 回合 · 首个冲突：${bottleneckTile.name}（${estimate.bottleneckUsedLoad}+${estimate.trafficLoad} > 容量 ${estimate.bottleneckCapacity}${braceText}）`
        : "当前已发队列未见拥堵";
      const signalText = estimate?.signalCoverage === "Covered"
        ? `预计到达时信号仍覆盖至 T${windowState.checkedUntilTurn}`
        : estimate?.signalCoverage === "ExpiresBefore"
          ? `现有信号至 T${windowState.checkedUntilTurn}，预计不覆盖`
          : `预计到达时：${estimate?.signalDetailAtReady ?? windowState.detail}；仍需复查并取得安全信号`;
      return {
        eyebrow: "群众转移预览",
        title: `第 ${estimate?.queueOrder ?? "?"} 批：${group?.name ?? "群众"} → ${projectedExit.name}`,
        body: `${rerouteText} · ${readyText} · ${deadlineText}｜${queueText}｜1 AP · 组织 1 · 速 ${estimate?.moveSteps ?? "?"} · 载 ${estimate?.trafficLoad ?? "?"}｜${signalText}｜已计当前烟流、封口与已知反制；未计后续新增敌情、烟流、封口、塌方或玩家改道`,
      };
    }
    case ActionIds.CLEAR_SEAL:
      return {
        eyebrow: "抢通预览",
        title: `从地下抢通${tile.name}`,
        body: "1 AP｜工具 2｜暴露 +10；会再次留下强证据",
      };
    default:
      return {
        eyebrow: "行动预览",
        title: ActionCopy[action.actionId]?.label ?? "行动",
        body: "确认后执行。",
      };
  }
}

function SetPreview(action) {
  let preparedAction = { ...action };
  const pathPlan = IsPathAction(action.actionId)
    ? GetInterfacePathPlans(action.unitId, action.actionId)
      .find((candidate) => candidate.targetKey === action.targetKey)
    : null;
  if (IsPathAction(action.actionId) && pathPlan) {
    preparedAction = {
      ...preparedAction,
      targetKeys: [...pathPlan.targetKeys],
    };
  }
  const targets = ActionNeedsTarget(action.actionId)
    ? GetInterfaceActionTargets(action.unitId, action.actionId)
    : null;
  if (targets && !targets.includes(action.targetKey)) {
    ShowToast("该格不是当前命令的合法目标。");
    return;
  }
  previewAction = preparedAction;
  previewTileKey = preparedAction.targetKey ?? CurrentUnit()?.tileKey ?? null;
  const preview = BuildPreview(preparedAction);
  ui.PreviewEyebrow.textContent = preview.eyebrow;
  ui.PreviewTitle.textContent = preview.title;
  ui.PreviewBody.textContent = preview.body;
  const steps = preparedAction.targetKeys?.length ?? 1;
  ui.ConfirmPreviewButton.innerHTML = steps > 1
    ? `确认执行 ${steps} 步 <kbd>Enter</kbd>`
    : "确认 <kbd>Enter</kbd>";
  ui.PreviewPanel.hidden = false;
  gameShell.classList.add("previewOpen");
  RenderScene();
}

function CancelPreview(render = true) {
  previewAction = null;
  previewTileKey = null;
  ui.PreviewPanel.hidden = true;
  ui.ConfirmPreviewButton.innerHTML = "确认 <kbd>Enter</kbd>";
  gameShell.classList.remove("previewOpen");
  if (render) {
    RenderScene();
  }
}

function CommitPreview() {
  if (!previewAction) {
    return;
  }
  const action = previewAction;
  const eventCountBefore = gameState.eventLedger.length;
  CancelPreview(false);
  const result = IsPathAction(action.actionId) && action.targetKeys?.length
    ? ApplyPlayerActionPath(gameState, action)
    : ApplyPlayerAction(gameState, action);
  if (!result.ok) {
    ShowToast(result.reason ?? "行动无法执行。");
    RenderAll();
    return;
  }
  gameState = result.state;
  const unit = CurrentUnit();
  if (unit) {
    gameState.selectedLayer = unit.layer;
  }
  selectedTileKey = action.targetKeys?.at(-1) ?? action.targetKey ?? unit?.tileKey ?? null;
  const stepText = action.targetKeys?.length > 1
    ? `连续执行 ${action.targetKeys.length} 步，抵达${gameState.tiles[selectedTileKey]?.name ?? "终点"} ${selectedTileKey}；`
    : "";
  const newLogText = gameState.eventLedger.slice(eventCountBefore).at(-1)?.text;
  ShowToast(`${stepText}${newLogText ?? (stepText ? "仍在我方回合。" : "行动已执行。")}`);
  RenderAll();
}

function EndTurn() {
  if (previewAction) {
    ShowToast("请先确认或取消当前预览。");
    return;
  }
  const result = ApplyPlayerAction(gameState, { actionId: ActionIds.END_TURN });
  if (!result.ok) {
    ShowToast(result.reason);
    return;
  }
  gameState = result.state;
  actionMode = ActionIds.MOVE;
  selectedTileKey = CurrentUnit()?.tileKey ?? null;
  ShowToast(gameState.log.at(-1)?.text ?? `第 ${gameState.turn} 回合开始。`);
  RenderAll();
}

function ClickTile(tileKey) {
  const unit = gameState.units.find((candidate) => (
    candidate.health > 0
    && candidate.layer === gameState.selectedLayer
    && candidate.tileKey === tileKey
  ));
  if (unit) {
    SelectUnit(unit.unitId);
    return;
  }
  const targets = GetInterfaceActionTargets(gameState.selectedUnitId, actionMode);
  if (targets.includes(tileKey)) {
    SetPreview({
      actionId: actionMode,
      unitId: gameState.selectedUnitId,
      targetKey: tileKey,
      groupId: actionMode === ActionIds.EVACUATE ? selectedEvacGroupId : undefined,
    });
    return;
  }
  const enemy = gameState.enemies.find((candidate) => (
    candidate.health > 0
    && candidate.tileKey === tileKey
  ));
  if (enemy && gameState.selectedLayer === LayerIds.SURFACE) {
    ShowToast(
      enemy.intent && enemy.intentRevealed
        ? `${enemy.name}：${enemy.intent.label}`
        : `${enemy.name}：意图尚未侦明。`,
    );
    return;
  }
  const tile = gameState.tiles[tileKey];
  if (gameState.selectedLayer === LayerIds.TUNNEL && !gameState.tunnels[tileKey]) {
    const soilText = IsSoilKnown(gameState, tileKey)
      ? `${SoilCatalog[tile.soilId].label}：${SoilCatalog[tile.soilId].risk}`
      : "土层未知；先让交通员在地面侦察。";
    ShowToast(`${tile.name}地下尚未挖通。${soilText}`);
    return;
  }
  if (tile.kind === "safeExit") {
    const windowState = GetExitWindow(gameState, tileKey);
    ShowToast(`${tile.name} · ${windowState.detail}${windowState.threatName ? `；${windowState.threatName}预计 ${windowState.threatEta} 回合抵近` : ""}`);
    return;
  }
  ShowToast(`${tile.name} · ${tile.description || TerrainCatalog[tile.terrainId].label}`);
}

function RaycastTile(event) {
  const bounds = canvas.getBoundingClientRect();
  pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const meshes = [...tileMeshesByLayer[gameState.selectedLayer].values()];
  const intersections = raycaster.intersectObjects(meshes, false);
  return intersections[0]?.object?.userData?.tileKey ?? null;
}

function HandlePointerDown(event) {
  if (!gameStarted || !ui.TitleScreen.hidden || !ui.OutcomeScreen.hidden) {
    return;
  }
  pointerState.down = true;
  pointerState.moved = false;
  pointerState.startX = event.clientX;
  pointerState.startY = event.clientY;
  pointerState.lastX = event.clientX;
  pointerState.lastY = event.clientY;
  canvas.setPointerCapture?.(event.pointerId);
}

function HandlePointerMove(event) {
  if (!pointerState.down) {
    return;
  }
  const totalDistance = Math.hypot(
    event.clientX - pointerState.startX,
    event.clientY - pointerState.startY,
  );
  if (totalDistance > 9) {
    pointerState.moved = true;
  }
  if (!pointerState.moved) {
    return;
  }
  const dx = event.clientX - pointerState.lastX;
  const dy = event.clientY - pointerState.lastY;
  const panScale = 0.013 / cameraZoom;
  cameraTarget.x -= dx * panScale;
  cameraTarget.z -= dy * panScale;
  cameraTarget.x = THREE.MathUtils.clamp(cameraTarget.x, 3.8, 10.2);
  cameraTarget.z = THREE.MathUtils.clamp(cameraTarget.z, 1.2, 6.4);
  pointerState.lastX = event.clientX;
  pointerState.lastY = event.clientY;
  UpdateCamera();
}

function HandlePointerUp(event) {
  if (!pointerState.down) {
    return;
  }
  const wasMoved = pointerState.moved;
  pointerState.down = false;
  canvas.releasePointerCapture?.(event.pointerId);
  if (!wasMoved) {
    const tileKey = RaycastTile(event);
    if (tileKey) {
      ClickTile(tileKey);
    }
  }
}

function HandleWheel(event) {
  if (!gameStarted) {
    return;
  }
  event.preventDefault();
  cameraZoom = THREE.MathUtils.clamp(
    cameraZoom * (event.deltaY > 0 ? 0.9 : 1.1),
    0.72,
    1.75,
  );
  UpdateCamera();
}

function SaveCheckpoint() {
  if (!gameStarted || gameState.outcome) {
    return;
  }
  try {
    localStorage.setItem(saveKey, JSON.stringify(gameState));
  } catch {
    // A disabled storage context does not block play.
  }
}

function StartGame({ reset = false } = {}) {
  if (reset) {
    gameState = CreateInitialState();
    try {
      localStorage.removeItem(saveKey);
    } catch {
      // Ignore restricted storage.
    }
  }
  gameStarted = true;
  ui.TitleScreen.hidden = true;
  ui.BriefingScreen.hidden = true;
  ui.HelpScreen.hidden = true;
  ui.OutcomeScreen.hidden = true;
  window.scrollTo(0, 0);
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
  SetLayer(gameState.selectedLayer ?? LayerIds.SURFACE);
  ShowToast("第一步：让交通员侦察，并在地图上选择北枣窖或西南苇井作为主勘线出口。");
}

function RestartGame() {
  const confirmed = window.confirm("用相同固定局面重新开始？当前检查点会被覆盖。");
  if (!confirmed) {
    return;
  }
  gameState = CreateInitialState();
  selectedTileKey = null;
  actionMode = ActionIds.MOVE;
  CancelPreview(false);
  StartGame({ reset: true });
}

function RenderBriefing() {
  const page = BriefingPages[briefingIndex];
  ui.BriefingEyebrow.textContent = page.eyebrow;
  ui.BriefingTitle.textContent = page.title;
  ui.BriefingBody.textContent = page.body;
  ui.BriefingDots.innerHTML = BriefingPages
    .map((_, index) => `<i class="${index === briefingIndex ? "active" : ""}"></i>`)
    .join("");
  ui.BriefingBackButton.disabled = briefingIndex === 0;
  ui.BriefingNextButton.textContent = briefingIndex === BriefingPages.length - 1
    ? "开始任务"
    : "下一页";
}

function OpenBriefing() {
  briefingIndex = 0;
  ui.BriefingScreen.hidden = false;
  RenderBriefing();
}

function ShowOutcome() {
  const outcome = gameState.outcome;
  if (!outcome) {
    return;
  }
  ui.OutcomeEyebrow.textContent = outcome.status === "Victory" ? "任务完成" : "任务未完成";
  ui.OutcomeTitle.textContent = outcome.title;
  ui.OutcomeSummary.textContent = `${outcome.summary} 群众安全 ${outcome.peopleSafety}；出口信号 ${gameState.exitSignalsIssued ?? 0} 次；暴露 ${gameState.exposure}；工具 ${gameState.tools}；组织 ${gameState.organization}；${outcome.survivingUnits} 支行动单位仍能工作。`;
  const pathLabels = {
    stealth: "静默分流路线",
    deception: "假迹欺骗路线",
    ambush: "洞口反伏击路线",
    interdiction: "地表压制开窗路线",
    none: "未形成有效转移路线",
  };
  ui.OutcomeRoute.textContent = `本局主要策略：${pathLabels[outcome.path] ?? "混合路线"}`;
  ui.OutcomeCauses.innerHTML = (outcome.causeChain ?? [])
    .map((event) => `<li>T${event.turn} · ${event.text}</li>`)
    .join("");
  ui.OutcomeTip.textContent = outcome.status === "Victory"
    ? "可重开尝试另一种窗口答案：双出口静默改道、假迹诱敌、地表压制，或在洞口设陷与伏击。"
    : `重规划建议：${outcome.tip ?? "把最后一次红色预警当作必须回答的下一回合问题。"} `;
  ui.OutcomeScreen.hidden = false;
}

function HandleKeyDown(event) {
  if (!ui.BriefingScreen.hidden || !ui.HelpScreen.hidden || !ui.TitleScreen.hidden) {
    return;
  }
  if (event.key === "Tab") {
    event.preventDefault();
    CycleUnit();
  } else if (event.key.toLowerCase() === "q") {
    SetLayer(
      gameState.selectedLayer === LayerIds.SURFACE
        ? LayerIds.TUNNEL
        : LayerIds.SURFACE,
    );
  } else if (event.key.toLowerCase() === "e") {
    EndTurn();
  } else if (event.key === "Enter") {
    CommitPreview();
  } else if (event.key === "Escape") {
    CancelPreview();
  }
}

ui.StartButton.addEventListener("click", () => StartGame());
ui.OpenBriefingButton.addEventListener("click", OpenBriefing);
ui.BriefingBackButton.addEventListener("click", () => {
  briefingIndex = Math.max(0, briefingIndex - 1);
  RenderBriefing();
});
ui.BriefingNextButton.addEventListener("click", () => {
  if (briefingIndex >= BriefingPages.length - 1) {
    StartGame();
  } else {
    briefingIndex += 1;
    RenderBriefing();
  }
});
ui.SurfaceLayerButton.addEventListener("click", () => SetLayer(LayerIds.SURFACE));
ui.TunnelLayerButton.addEventListener("click", () => SetLayer(LayerIds.TUNNEL));
ui.CancelPreviewButton.addEventListener("click", () => CancelPreview());
ui.ConfirmPreviewButton.addEventListener("click", CommitPreview);
ui.EndTurnButton.addEventListener("click", EndTurn);
ui.RestartButton.addEventListener("click", RestartGame);
ui.OutcomeRestartButton.addEventListener("click", () => {
  ui.OutcomeScreen.hidden = true;
  gameState = CreateInitialState();
  StartGame({ reset: true });
});
ui.HelpButton.addEventListener("click", () => {
  ui.HelpScreen.hidden = false;
});
ui.CloseHelpButton.addEventListener("click", () => {
  ui.HelpScreen.hidden = true;
});
ui.CloseHelpConfirmButton.addEventListener("click", () => {
  ui.HelpScreen.hidden = true;
});

canvas.addEventListener("pointerdown", HandlePointerDown);
canvas.addEventListener("pointermove", HandlePointerMove);
canvas.addEventListener("pointerup", HandlePointerUp);
canvas.addEventListener("pointercancel", HandlePointerUp);
canvas.addEventListener("wheel", HandleWheel, { passive: false });
window.addEventListener("keydown", HandleKeyDown);
window.addEventListener("resize", ResizeRenderer);

AddStaticMap();
ResizeRenderer();
UpdateCamera();
RenderAll();

function AnimationLoop() {
  renderer.render(scene, camera);
  window.requestAnimationFrame(AnimationLoop);
}
AnimationLoop();

window.TunnelFront1942Debug = Object.freeze({
  GetState: () => JSON.parse(JSON.stringify(gameState)),
  SetState: (nextState) => {
    gameState = JSON.parse(JSON.stringify(nextState));
    RenderAll();
  },
  StartGame: () => StartGame(),
  ApplyAction: (action) => {
    const result = ApplyPlayerAction(gameState, action);
    if (result.ok) {
      gameState = result.state;
      RenderAll();
    }
    return result;
  },
  SetLayer,
  SelectUnit,
  WorldPosition: (tileKey) => WorldPosition(tileKey).toArray(),
});
