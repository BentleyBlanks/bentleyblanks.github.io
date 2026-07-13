import {
  difficultyDefinitions,
  gameConfig,
  historicalSources,
  historicalTerms,
  phaseDefinitions,
  tutorialSteps,
} from "./Data_History.mjs";
import {
  AdvanceGame,
  buildingDefinitions,
  CanAfford,
  CheckInvariants,
  CreateGameState,
  DeserializeGame,
  FindPath,
  FormatGameTime,
  GetBuildPreview,
  GetCampaignScore,
  GetMetric,
  GetObjectiveStatuses,
  GetPopulation,
  GetTileAtWorld,
  IssueAttackCommand,
  IssueBuildCommand,
  IssueGatherCommand,
  IssueMoveCommand,
  IssueSabotageCommand,
  IssueStopCommand,
  nodeDefinitions,
  PlaceBuilding,
  QueueTraining,
  SerializeGame,
  SetRallyPoint,
  SetUnitStance,
  unitDefinitions,
  worldConfig,
} from "./Script_Rules.mjs";

const GetElement = (id) => document.getElementById(id);
const canvas = GetElement("GameCanvas");
const context = canvas.getContext("2d", { alpha: false });
const miniCanvas = GetElement("MiniCanvas");
const miniContext = miniCanvas.getContext("2d");

let state = null;
let selectedDifficultyId = "standard";
let selection = { kind: "none", ids: [] };
let lastPlayerUnitIds = [];
let buildMode = null;
let commandMode = null;
let buildMenuOpen = false;
let camera = { x: 0, y: 0, zoom: 0.88 };
let pointerState = null;
let pointerPosition = { x: 0, y: 0, inside: false };
let keyboardState = new Set();
let controlGroups = new Map();
let frameHandle = 0;
let previousFrameTime = performance.now();
let uiAccumulator = 0;
let miniAccumulator = 0;
let knownTransitionSerial = 0;
let knownEventId = null;
let resultShown = false;
let tutorialIndex = -1;
let tutorialRequested = true;
let historyPauseState = false;
let activeModalCount = 0;
let modalStack = [];
const modalFocusOrigins = new Map();
let hintTimeout = 0;
let startSeedOffset = 0;
let audioContext = null;

const terrainColors = Object.freeze({
  plain: [91, 104, 73],
  field: [117, 111, 66],
  grove: [58, 77, 55],
  rough: [102, 91, 69],
  road: [121, 105, 76],
  rail: [93, 89, 72],
  water: [46, 74, 74],
  bridge: [110, 92, 67],
});

function Clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function Distance(left, right) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function PlayTone(frequency = 260, duration = 0.045, volume = 0.025, type = "sine") {
  try {
    const AudioConstructor = window.AudioContext || window.webkitAudioContext;
    if (!AudioConstructor) return;
    if (!audioContext) audioContext = new AudioConstructor();
    if (audioContext.state === "suspended") audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + duration);
  } catch {
    // Audio is optional and never blocks play.
  }
}

function ResizeCanvas() {
  const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  const width = window.innerWidth;
  const height = window.innerHeight;
  const requiredWidth = Math.round(width * pixelRatio);
  const requiredHeight = Math.round(height * pixelRatio);
  if (canvas.width !== requiredWidth || canvas.height !== requiredHeight) {
    canvas.width = requiredWidth;
    canvas.height = requiredHeight;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }
  ClampCamera();
}

function WorldToScreen(worldX, worldY) {
  return {
    x: worldX * camera.zoom - camera.x,
    y: worldY * camera.zoom - camera.y,
  };
}

function ScreenToWorld(screenX, screenY) {
  return {
    x: (screenX + camera.x) / camera.zoom,
    y: (screenY + camera.y) / camera.zoom,
  };
}

function ClampCamera() {
  const worldWidth = worldConfig.mapWidth * worldConfig.tileSize * camera.zoom;
  const worldHeight = worldConfig.mapHeight * worldConfig.tileSize * camera.zoom;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const margin = 90;
  camera.x = Clamp(camera.x, -margin, Math.max(-margin, worldWidth - viewportWidth + margin));
  camera.y = Clamp(camera.y, -margin, Math.max(-margin, worldHeight - viewportHeight + margin));
}

function CenterCameraOn(worldX, worldY, immediate = true) {
  const targetX = worldX * camera.zoom - window.innerWidth * 0.5;
  const targetY = worldY * camera.zoom - window.innerHeight * 0.48;
  if (immediate) {
    camera.x = targetX;
    camera.y = targetY;
  } else {
    camera.x += (targetX - camera.x) * 0.6;
    camera.y += (targetY - camera.y) * 0.6;
  }
  ClampCamera();
}

function VisualNoise(tileX, tileY, seed = 0) {
  const value = Math.sin((tileX * 127.1 + tileY * 311.7 + seed * 0.013) * 0.017) * 43758.5453;
  return value - Math.floor(value);
}

function GetViewportTiles() {
  const tileSize = worldConfig.tileSize;
  const left = Math.max(0, Math.floor(camera.x / camera.zoom / tileSize) - 2);
  const top = Math.max(0, Math.floor(camera.y / camera.zoom / tileSize) - 2);
  const right = Math.min(worldConfig.mapWidth - 1, Math.ceil((camera.x + window.innerWidth) / camera.zoom / tileSize) + 2);
  const bottom = Math.min(worldConfig.mapHeight - 1, Math.ceil((camera.y + window.innerHeight) / camera.zoom / tileSize) + 2);
  return { left, top, right, bottom };
}

function DrawTerrainTile(tile) {
  const tileSize = worldConfig.tileSize * camera.zoom;
  const screen = WorldToScreen(tile.tileX * worldConfig.tileSize, tile.tileY * worldConfig.tileSize);
  const base = terrainColors[tile.terrain] || terrainColors.plain;
  const noise = (VisualNoise(tile.tileX, tile.tileY, state.seed) - 0.5) * 12;
  context.fillStyle = `rgb(${base[0] + noise}, ${base[1] + noise}, ${base[2] + noise})`;
  context.fillRect(Math.floor(screen.x), Math.floor(screen.y), Math.ceil(tileSize + 1), Math.ceil(tileSize + 1));

  if (camera.zoom < 0.52) return;
  context.save();
  context.translate(screen.x, screen.y);
  context.globalAlpha = 0.42;
  if (tile.terrain === "field") {
    context.strokeStyle = "rgba(224, 196, 112, 0.32)";
    context.lineWidth = Math.max(0.7, camera.zoom);
    for (let offset = 6; offset < worldConfig.tileSize; offset += 7) {
      context.beginPath();
      context.moveTo(offset * camera.zoom, 2 * camera.zoom);
      context.lineTo(offset * camera.zoom - 3 * camera.zoom, (worldConfig.tileSize - 2) * camera.zoom);
      context.stroke();
    }
  } else if (tile.terrain === "grove") {
    for (let index = 0; index < 3; index += 1) {
      const treeX = (7 + VisualNoise(tile.tileX, tile.tileY, index + 4) * 18) * camera.zoom;
      const treeY = (7 + VisualNoise(tile.tileY, tile.tileX, index + 9) * 18) * camera.zoom;
      context.fillStyle = index === 1 ? "rgba(29, 52, 34, 0.72)" : "rgba(36, 61, 40, 0.78)";
      context.beginPath();
      context.arc(treeX, treeY, (4.5 + index * 0.7) * camera.zoom, 0, Math.PI * 2);
      context.fill();
    }
  } else if (tile.terrain === "rough") {
    context.fillStyle = "rgba(63, 56, 45, 0.55)";
    for (let index = 0; index < 4; index += 1) {
      const stoneX = (4 + VisualNoise(tile.tileX, tile.tileY, index + 17) * 24) * camera.zoom;
      const stoneY = (4 + VisualNoise(tile.tileY, tile.tileX, index + 21) * 24) * camera.zoom;
      context.fillRect(stoneX, stoneY, 2.5 * camera.zoom, 1.5 * camera.zoom);
    }
  } else if (tile.terrain === "water") {
    context.strokeStyle = "rgba(158, 191, 174, 0.22)";
    context.lineWidth = Math.max(0.7, camera.zoom);
    for (let offset = 8; offset < 32; offset += 10) {
      context.beginPath();
      context.moveTo(2 * camera.zoom, offset * camera.zoom);
      context.quadraticCurveTo(16 * camera.zoom, (offset - 3) * camera.zoom, 30 * camera.zoom, offset * camera.zoom);
      context.stroke();
    }
  } else if (tile.terrain === "road" || tile.terrain === "bridge") {
    context.strokeStyle = "rgba(51, 44, 32, 0.21)";
    context.lineWidth = Math.max(0.8, camera.zoom);
    context.setLineDash([4 * camera.zoom, 5 * camera.zoom]);
    context.beginPath();
    context.moveTo(0, tileSize * 0.52);
    context.lineTo(tileSize, tileSize * 0.48);
    context.stroke();
  } else if (tile.terrain === "rail") {
    context.strokeStyle = "rgba(35, 33, 27, 0.72)";
    context.lineWidth = 1.2 * camera.zoom;
    context.beginPath();
    context.moveTo(0, tileSize * 0.39);
    context.lineTo(tileSize, tileSize * 0.39);
    context.moveTo(0, tileSize * 0.61);
    context.lineTo(tileSize, tileSize * 0.61);
    context.stroke();
    for (let offset = 2; offset < 32; offset += 7) {
      context.fillStyle = "rgba(38, 30, 23, 0.64)";
      context.fillRect(offset * camera.zoom, tileSize * 0.29, 2 * camera.zoom, tileSize * 0.43);
    }
  }
  context.restore();
}

function DrawMapBase() {
  context.fillStyle = "#0d120e";
  context.fillRect(0, 0, window.innerWidth, window.innerHeight);
  if (!state) return;
  const bounds = GetViewportTiles();
  for (let tileY = bounds.top; tileY <= bounds.bottom; tileY += 1) {
    for (let tileX = bounds.left; tileX <= bounds.right; tileX += 1) {
      DrawTerrainTile(state.tiles[tileY * worldConfig.mapWidth + tileX]);
    }
  }
  const topLeft = WorldToScreen(0, 0);
  const bottomRight = WorldToScreen(worldConfig.mapWidth * worldConfig.tileSize, worldConfig.mapHeight * worldConfig.tileSize);
  context.strokeStyle = "rgba(223, 205, 161, 0.16)";
  context.lineWidth = 2;
  context.strokeRect(topLeft.x, topLeft.y, bottomRight.x - topLeft.x, bottomRight.y - topLeft.y);
}

function IsTileVisible(tileX, tileY) {
  if (!state || tileX < 0 || tileY < 0 || tileX >= worldConfig.mapWidth || tileY >= worldConfig.mapHeight) return false;
  return Boolean(state.visible[tileY * worldConfig.mapWidth + tileX]);
}

function IsTileExplored(tileX, tileY) {
  if (!state || tileX < 0 || tileY < 0 || tileX >= worldConfig.mapWidth || tileY >= worldConfig.mapHeight) return false;
  return Boolean(state.explored[tileY * worldConfig.mapWidth + tileX]);
}

function DrawWorldLabel(text, worldX, worldY, options = {}) {
  if (camera.zoom < (options.minimumZoom || 0.58)) return;
  const screen = WorldToScreen(worldX, worldY);
  const fontSize = Clamp((options.fontSize || 10) * camera.zoom, 8, 13);
  context.save();
  context.font = `${options.bold ? 600 : 500} ${fontSize}px "Microsoft YaHei", sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  const width = context.measureText(text).width + 13;
  const height = fontSize + 8;
  context.fillStyle = options.background || "rgba(19, 24, 20, 0.82)";
  context.fillRect(screen.x - width * 0.5, screen.y - height * 0.5, width, height);
  context.strokeStyle = options.border || "rgba(221, 204, 164, 0.18)";
  context.strokeRect(screen.x - width * 0.5, screen.y - height * 0.5, width, height);
  context.fillStyle = options.color || "#d6caae";
  context.fillText(text, screen.x, screen.y + 0.5);
  context.restore();
}

function DrawResourceNodes() {
  for (const node of state.nodes) {
    if (!node.discovered || node.amount <= 0) continue;
    const screen = WorldToScreen(node.x, node.y);
    if (screen.x < -60 || screen.x > window.innerWidth + 60 || screen.y < -60 || screen.y > window.innerHeight + 60) continue;
    const definition = nodeDefinitions[node.type];
    const visible = IsTileVisible(node.tileX, node.tileY);
    context.save();
    context.globalAlpha = visible ? 1 : 0.38;
    const radius = 18 * camera.zoom;
    if (node.type === "field") {
      context.strokeStyle = "#d1b361";
      context.lineWidth = 1.5 * camera.zoom;
      for (let index = -2; index <= 2; index += 1) {
        context.beginPath();
        context.moveTo(screen.x + index * 4 * camera.zoom, screen.y + 11 * camera.zoom);
        context.lineTo(screen.x + index * 3 * camera.zoom, screen.y - 10 * camera.zoom);
        context.stroke();
      }
    } else if (node.type === "grove") {
      context.fillStyle = "#39563d";
      [[-7,3,8],[2,-5,10],[9,5,7]].forEach(([offsetX, offsetY, treeRadius]) => {
        context.beginPath();
        context.arc(screen.x + offsetX * camera.zoom, screen.y + offsetY * camera.zoom, treeRadius * camera.zoom, 0, Math.PI * 2);
        context.fill();
      });
    } else {
      context.fillStyle = node.type === "contact" ? "#a96a57" : "#78858a";
      context.strokeStyle = "rgba(238, 220, 177, 0.55)";
      context.lineWidth = 1 * camera.zoom;
      context.beginPath();
      context.moveTo(screen.x, screen.y - radius);
      context.lineTo(screen.x + radius, screen.y);
      context.lineTo(screen.x, screen.y + radius);
      context.lineTo(screen.x - radius, screen.y);
      context.closePath();
      context.fill();
      context.stroke();
      context.fillStyle = "#f0e2c2";
      context.font = `bold ${Clamp(11 * camera.zoom, 8, 13)}px serif`;
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(definition.glyph, screen.x, screen.y);
    }
    const ratio = Clamp(node.amount / node.maximumAmount, 0, 1);
    context.fillStyle = "rgba(18, 22, 19, 0.86)";
    context.fillRect(screen.x - 18 * camera.zoom, screen.y + 19 * camera.zoom, 36 * camera.zoom, 3 * camera.zoom);
    context.fillStyle = node.type === "field" ? "#c8aa5b" : node.type === "grove" ? "#708c64" : "#88999d";
    context.fillRect(screen.x - 18 * camera.zoom, screen.y + 19 * camera.zoom, 36 * camera.zoom * ratio, 3 * camera.zoom);
    context.restore();
    if (visible) DrawWorldLabel(definition.name, node.x, node.y + 34, { fontSize: 8, minimumZoom: 0.72 });
  }
}

function DrawVillage(village) {
  if (!IsTileExplored(village.tileX, village.tileY)) return;
  const screen = WorldToScreen(village.x, village.y);
  const visible = IsTileVisible(village.tileX, village.tileY);
  const scale = camera.zoom;
  context.save();
  context.globalAlpha = visible ? 1 : 0.44;
  const houseColor = village.contacted ? "#aa794e" : "#776f5d";
  [[-16,7,0.85],[2,-5,1],[17,9,0.76],[-3,14,0.68]].forEach(([offsetX, offsetY, size]) => {
    const width = 18 * size * scale;
    const height = 12 * size * scale;
    const houseX = screen.x + offsetX * scale;
    const houseY = screen.y + offsetY * scale;
    context.fillStyle = houseColor;
    context.fillRect(houseX - width * 0.5, houseY - height * 0.5, width, height);
    context.fillStyle = village.contacted ? "#633c2e" : "#4d493f";
    context.beginPath();
    context.moveTo(houseX - width * 0.62, houseY - height * 0.48);
    context.lineTo(houseX, houseY - height * 1.18);
    context.lineTo(houseX + width * 0.62, houseY - height * 0.48);
    context.closePath();
    context.fill();
  });
  context.strokeStyle = village.contacted ? "rgba(220, 181, 103, 0.72)" : "rgba(197, 190, 165, 0.34)";
  context.lineWidth = 1.4 * scale;
  context.beginPath();
  context.arc(screen.x, screen.y, 31 * scale, 0, Math.PI * 2);
  context.stroke();
  if (village.contacted) {
    context.fillStyle = village.safety >= 55 ? "#88a06f" : village.safety >= 30 ? "#bd9256" : "#bd5542";
    context.fillRect(screen.x - 22 * scale, screen.y + 28 * scale, 44 * scale * (village.safety / 100), 4 * scale);
    context.strokeStyle = "rgba(15,18,15,0.8)";
    context.strokeRect(screen.x - 22 * scale, screen.y + 28 * scale, 44 * scale, 4 * scale);
  }
  context.restore();
  DrawWorldLabel(village.contacted ? `${village.name} · 已联络` : `${village.name} · 未联络`, village.x, village.y + 49, {
    fontSize: 9,
    color: village.contacted ? "#e0c98f" : "#b7b1a0",
    border: village.contacted ? "rgba(203, 161, 82, 0.38)" : undefined,
  });
}

function DrawBuilding(building) {
  if (!building.active) return;
  const screen = WorldToScreen(building.x, building.y);
  const definition = buildingDefinitions[building.type];
  const scale = camera.zoom;
  const selected = selection.kind === "building" && selection.ids.includes(building.id);
  context.save();
  if (selected) {
    context.strokeStyle = "rgba(242, 206, 122, 0.9)";
    context.lineWidth = 2 * scale;
    context.beginPath();
    context.ellipse(screen.x, screen.y + 8 * scale, 35 * scale, 22 * scale, 0, 0, Math.PI * 2);
    context.stroke();
  }
  context.globalAlpha = building.completed ? 1 : 0.72;
  const width = (building.type === "headquarters" ? 54 : 42) * scale;
  const height = (building.type === "watchpost" ? 38 : 30) * scale;
  context.fillStyle = building.hitFlash > 0 ? "#d9c6a5" : building.type === "shelter" ? "#53684e" : "#8c6f4e";
  context.strokeStyle = "rgba(226, 207, 163, 0.52)";
  context.lineWidth = 1.2 * scale;
  context.fillRect(screen.x - width * 0.5, screen.y - height * 0.42, width, height);
  context.strokeRect(screen.x - width * 0.5, screen.y - height * 0.42, width, height);
  context.fillStyle = building.type === "shelter" ? "#334333" : "#563a2c";
  context.beginPath();
  context.moveTo(screen.x - width * 0.58, screen.y - height * 0.4);
  context.lineTo(screen.x, screen.y - height * 1.08);
  context.lineTo(screen.x + width * 0.58, screen.y - height * 0.4);
  context.closePath();
  context.fill();
  if (building.type === "watchpost") {
    context.strokeStyle = "#827052";
    context.lineWidth = 3 * scale;
    context.beginPath();
    context.moveTo(screen.x - 10 * scale, screen.y + 18 * scale);
    context.lineTo(screen.x, screen.y - 27 * scale);
    context.lineTo(screen.x + 10 * scale, screen.y + 18 * scale);
    context.stroke();
  }
  context.fillStyle = "#eadbb9";
  context.font = `bold ${Clamp(11 * scale, 8, 13)}px "KaiTi", serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(definition.glyph, screen.x, screen.y + 2 * scale);
  const healthRatio = Clamp(building.health / building.maxHealth, 0, 1);
  const barWidth = 48 * scale;
  context.fillStyle = "rgba(18, 20, 17, 0.88)";
  context.fillRect(screen.x - barWidth * 0.5, screen.y + 25 * scale, barWidth, 4 * scale);
  context.fillStyle = healthRatio > 0.55 ? "#7e9a68" : healthRatio > 0.25 ? "#c09251" : "#b54d3b";
  context.fillRect(screen.x - barWidth * 0.5, screen.y + 25 * scale, barWidth * healthRatio, 4 * scale);
  if (!building.completed) {
    context.fillStyle = "rgba(17, 21, 18, 0.88)";
    context.fillRect(screen.x - barWidth * 0.5, screen.y + 31 * scale, barWidth, 3 * scale);
    context.fillStyle = "#c9a35d";
    context.fillRect(screen.x - barWidth * 0.5, screen.y + 31 * scale, barWidth * building.progress, 3 * scale);
  }
  context.restore();
  if (building.completed) DrawWorldLabel(definition.name, building.x, building.y + 47, { fontSize: 8, minimumZoom: 0.72 });
}

function DrawEnemySite(site) {
  if (!site.discovered) return;
  const screen = WorldToScreen(site.x, site.y);
  const visible = IsTileVisible(site.tileX, site.tileY);
  const scale = camera.zoom;
  const inactive = site.sabotaged || site.disabled || site.health <= 0;
  context.save();
  context.globalAlpha = visible ? 1 : 0.34;
  if (inactive) {
    context.strokeStyle = "rgba(149, 92, 67, 0.7)";
    context.lineWidth = 3 * scale;
    context.beginPath();
    context.moveTo(screen.x - 18 * scale, screen.y - 13 * scale);
    context.lineTo(screen.x + 18 * scale, screen.y + 13 * scale);
    context.moveTo(screen.x + 18 * scale, screen.y - 13 * scale);
    context.lineTo(screen.x - 18 * scale, screen.y + 13 * scale);
    context.stroke();
  } else if (site.type === "garrison") {
    context.fillStyle = "#5d5b53";
    context.strokeStyle = "#a5a092";
    context.lineWidth = 1.4 * scale;
    context.fillRect(screen.x - 26 * scale, screen.y - 22 * scale, 52 * scale, 44 * scale);
    context.strokeRect(screen.x - 26 * scale, screen.y - 22 * scale, 52 * scale, 44 * scale);
    for (let offset = -21; offset <= 21; offset += 14) {
      context.fillStyle = "#77736a";
      context.fillRect(screen.x + offset * scale, screen.y - 29 * scale, 9 * scale, 11 * scale);
    }
    context.fillStyle = "#292a27";
    context.fillRect(screen.x - 7 * scale, screen.y - 4 * scale, 14 * scale, 15 * scale);
  } else {
    context.fillStyle = site.type === "relay" ? "#6c6860" : "#766b57";
    context.strokeStyle = "#b1aa9a";
    context.lineWidth = 1.2 * scale;
    context.fillRect(screen.x - 20 * scale, screen.y - 18 * scale, 40 * scale, 36 * scale);
    context.strokeRect(screen.x - 20 * scale, screen.y - 18 * scale, 40 * scale, 36 * scale);
    context.fillStyle = "#292a27";
    context.fillRect(screen.x - 5 * scale, screen.y - 2 * scale, 10 * scale, 9 * scale);
    if (site.type === "relay") {
      context.strokeStyle = "#8e8a80";
      context.beginPath();
      context.moveTo(screen.x, screen.y - 18 * scale);
      context.lineTo(screen.x, screen.y - 45 * scale);
      context.stroke();
      context.beginPath();
      context.arc(screen.x, screen.y - 46 * scale, 8 * scale, Math.PI * 1.15, Math.PI * 1.85);
      context.stroke();
    }
  }
  if (!inactive && site.sabotageProgress > 0) {
    context.fillStyle = "rgba(20, 22, 19, 0.9)";
    context.fillRect(screen.x - 24 * scale, screen.y + 27 * scale, 48 * scale, 4 * scale);
    context.fillStyle = "#c8944f";
    context.fillRect(screen.x - 24 * scale, screen.y + 27 * scale, 48 * scale * site.sabotageProgress, 4 * scale);
  }
  context.restore();
  DrawWorldLabel(inactive ? `${site.name} · 已失效` : site.name, site.x, site.y + 48, {
    fontSize: 8,
    color: inactive ? "#a4806e" : "#d5d0c1",
    minimumZoom: 0.66,
  });
}

function DrawExitZone() {
  if (!state.exitZone.discovered && state.phaseIndex < 4) return;
  const screen = WorldToScreen(state.exitZone.x, state.exitZone.y);
  const scale = camera.zoom;
  const pulse = 0.76 + Math.sin(state.elapsedSeconds * 2.2) * 0.12;
  context.save();
  context.strokeStyle = `rgba(213, 177, 97, ${pulse})`;
  context.lineWidth = 2 * scale;
  context.setLineDash([7 * scale, 6 * scale]);
  context.beginPath();
  context.arc(screen.x, screen.y, state.exitZone.radius * scale, 0, Math.PI * 2);
  context.stroke();
  context.setLineDash([]);
  context.fillStyle = "rgba(165, 137, 75, 0.1)";
  context.beginPath();
  context.arc(screen.x, screen.y, state.exitZone.radius * scale, 0, Math.PI * 2);
  context.fill();
  context.restore();
  DrawWorldLabel("东南苇荡 · 转移出口", state.exitZone.x, state.exitZone.y - 73, { fontSize: 9, color: "#e3c983", border: "rgba(214, 177, 94, 0.4)" });
}

function DrawUnit(unit) {
  if (!unit.alive || (unit.side === "enemy" && !unit.visibleToPlayer)) return;
  const screen = WorldToScreen(unit.x, unit.y);
  if (screen.x < -70 || screen.x > window.innerWidth + 70 || screen.y < -70 || screen.y > window.innerHeight + 70) return;
  const definition = unitDefinitions[unit.type];
  const scale = camera.zoom;
  const selected = selection.kind === "unit" && selection.ids.includes(unit.id);
  context.save();
  if (selected) {
    context.strokeStyle = "rgba(247, 211, 126, 0.95)";
    context.lineWidth = 2 * scale;
    context.beginPath();
    context.ellipse(screen.x, screen.y + 8 * scale, 24 * scale, 13 * scale, 0, 0, Math.PI * 2);
    context.stroke();
  }
  if (unit.carriesArchive) {
    context.strokeStyle = "rgba(227, 190, 101, 0.78)";
    context.lineWidth = 1.3 * scale;
    context.setLineDash([3 * scale, 3 * scale]);
    context.beginPath();
    context.arc(screen.x, screen.y, 30 * scale, 0, Math.PI * 2);
    context.stroke();
    context.setLineDash([]);
  }
  const player = unit.side === "player";
  const bodyColor = unit.hitFlash > 0 ? "#f0ddbc" : player ? "#a84636" : "#d4cdbb";
  const edgeColor = player ? "#e09a79" : "#7e6b60";
  const offsets = unit.type === "work" || unit.type === "scout" ? [[-6,2],[7,3],[1,-7]] : [[-8,4],[0,-7],[8,4],[0,7]];
  offsets.forEach(([offsetX, offsetY], index) => {
    context.fillStyle = bodyColor;
    context.strokeStyle = edgeColor;
    context.lineWidth = 0.8 * scale;
    context.beginPath();
    context.arc(screen.x + offsetX * scale, screen.y + offsetY * scale - 4 * scale, (3.4 + (index % 2) * 0.3) * scale, 0, Math.PI * 2);
    context.fill();
    context.stroke();
    context.fillRect(screen.x + (offsetX - 2.5) * scale, screen.y + (offsetY - 1) * scale, 5 * scale, 9 * scale);
  });
  context.fillStyle = player ? "rgba(79, 33, 27, 0.94)" : "rgba(58, 55, 49, 0.94)";
  context.strokeStyle = player ? "rgba(225, 144, 109, 0.72)" : "rgba(222, 214, 194, 0.5)";
  context.lineWidth = 1 * scale;
  context.beginPath();
  context.arc(screen.x, screen.y - 22 * scale, 10 * scale, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.fillStyle = player ? "#f2dec0" : "#efe8d5";
  context.font = `bold ${Clamp(10 * scale, 7, 12)}px "KaiTi", serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(definition.glyph, screen.x, screen.y - 22 * scale + 0.5);
  const barWidth = 38 * scale;
  const healthRatio = Clamp(unit.health / unit.maxHealth, 0, 1);
  const moraleRatio = Clamp(unit.morale / unit.maxMorale, 0, 1);
  context.fillStyle = "rgba(16, 18, 16, 0.9)";
  context.fillRect(screen.x - barWidth * 0.5, screen.y + 18 * scale, barWidth, 4 * scale);
  context.fillStyle = healthRatio > 0.55 ? "#7f9e69" : healthRatio > 0.28 ? "#c29150" : "#b84d3d";
  context.fillRect(screen.x - barWidth * 0.5, screen.y + 18 * scale, barWidth * healthRatio, 4 * scale);
  context.fillStyle = "rgba(16, 18, 16, 0.9)";
  context.fillRect(screen.x - barWidth * 0.5, screen.y + 23 * scale, barWidth, 2 * scale);
  context.fillStyle = "#8ca0a2";
  context.fillRect(screen.x - barWidth * 0.5, screen.y + 23 * scale, barWidth * moraleRatio, 2 * scale);
  context.restore();
  if (camera.zoom >= 0.86 && selected) DrawWorldLabel(definition.name, unit.x, unit.y + 39, { fontSize: 8 });
}

function DrawSelectionPaths() {
  if (selection.kind !== "unit") return;
  context.save();
  context.strokeStyle = "rgba(236, 202, 119, 0.62)";
  context.lineWidth = 1.4;
  context.setLineDash([4, 5]);
  for (const unitId of selection.ids) {
    const unit = state.units.find((candidate) => candidate.id === unitId && candidate.alive);
    if (!unit || !unit.path.length) continue;
    const start = WorldToScreen(unit.x, unit.y);
    context.beginPath();
    context.moveTo(start.x, start.y);
    unit.path.forEach((point) => {
      const screen = WorldToScreen(point.x, point.y);
      context.lineTo(screen.x, screen.y);
    });
    context.stroke();
  }
  context.restore();
}

function DrawProjectilesAndEffects() {
  context.save();
  for (const projectile of state.projectiles) {
    const progress = 1 - projectile.life / projectile.maximumLife;
    const worldX = projectile.x + (projectile.targetX - projectile.x) * progress;
    const worldY = projectile.y + (projectile.targetY - projectile.y) * progress;
    const screen = WorldToScreen(worldX, worldY);
    context.fillStyle = projectile.side === "player" ? "#eacb78" : "#f3e4c5";
    context.beginPath();
    context.arc(screen.x, screen.y, Math.max(1.3, camera.zoom * 1.8), 0, Math.PI * 2);
    context.fill();
  }
  for (const effect of state.effects) {
    const screen = WorldToScreen(effect.x, effect.y);
    const progress = 1 - effect.life / effect.maximumLife;
    if (effect.type === "sabotage") {
      context.strokeStyle = `rgba(209, 132, 71, ${1 - progress})`;
      context.lineWidth = Math.max(1, 3 * camera.zoom * (1 - progress));
      context.beginPath();
      context.arc(screen.x, screen.y, (15 + progress * 56) * camera.zoom, 0, Math.PI * 2);
      context.stroke();
      context.fillStyle = `rgba(113, 75, 48, ${(1 - progress) * 0.28})`;
      context.beginPath();
      context.arc(screen.x, screen.y, (11 + progress * 35) * camera.zoom, 0, Math.PI * 2);
      context.fill();
    } else {
      context.fillStyle = `rgba(199, 190, 167, ${(1 - progress) * 0.32})`;
      context.beginPath();
      context.arc(screen.x, screen.y - progress * 14, (8 + progress * 14) * camera.zoom, 0, Math.PI * 2);
      context.fill();
    }
  }
  context.restore();
}

function DrawFog() {
  const bounds = GetViewportTiles();
  const size = worldConfig.tileSize * camera.zoom;
  context.save();
  for (let tileY = bounds.top; tileY <= bounds.bottom; tileY += 1) {
    for (let tileX = bounds.left; tileX <= bounds.right; tileX += 1) {
      const index = tileY * worldConfig.mapWidth + tileX;
      if (state.visible[index]) continue;
      const screen = WorldToScreen(tileX * worldConfig.tileSize, tileY * worldConfig.tileSize);
      if (state.explored[index]) {
        context.fillStyle = "rgba(12, 17, 14, 0.58)";
      } else {
        const noise = VisualNoise(tileX, tileY, state.seed + 92);
        context.fillStyle = `rgba(7, 11, 9, ${0.94 + noise * 0.035})`;
      }
      context.fillRect(Math.floor(screen.x), Math.floor(screen.y), Math.ceil(size + 1), Math.ceil(size + 1));
    }
  }
  context.restore();
}

function DrawPausedOverlay() {
  if (!state?.paused || HasBlockingModal()) return;
  context.save();
  context.fillStyle = "rgba(8, 11, 9, 0.26)";
  context.fillRect(0, 0, window.innerWidth, window.innerHeight);
  context.fillStyle = "rgba(22, 27, 23, 0.86)";
  context.strokeStyle = "rgba(219, 198, 152, 0.3)";
  context.lineWidth = 1;
  context.fillRect(window.innerWidth * 0.5 - 70, 92, 140, 36);
  context.strokeRect(window.innerWidth * 0.5 - 70, 92, 140, 36);
  context.fillStyle = "#d7c9a8";
  context.font = "12px Microsoft YaHei, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("部署暂停 · 仍可下令", window.innerWidth * 0.5, 110);
  context.restore();
}

function DrawGame() {
  const pixelRatio = Math.min(2, window.devicePixelRatio || 1);
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.imageSmoothingEnabled = true;
  DrawMapBase();
  if (!state) return;
  DrawExitZone();
  DrawResourceNodes();
  state.villages.forEach(DrawVillage);
  state.buildings.forEach(DrawBuilding);
  state.sites.forEach(DrawEnemySite);
  DrawSelectionPaths();
  state.units.filter((unit) => unit.side === "enemy").forEach(DrawUnit);
  state.units.filter((unit) => unit.side === "player").forEach(DrawUnit);
  DrawProjectilesAndEffects();
  DrawFog();
  DrawPausedOverlay();
}

function GetSelectedUnits() {
  if (!state || selection.kind !== "unit") return [];
  return selection.ids
    .map((unitId) => state.units.find((candidate) => candidate.id === unitId && candidate.alive))
    .filter(Boolean);
}

function GetSelectedPlayerUnits() {
  return GetSelectedUnits().filter((unit) => unit.side === "player");
}

function GetSelectedBuilding() {
  if (!state || selection.kind !== "building") return null;
  return state.buildings.find((building) => building.id === selection.ids[0] && building.active) || null;
}

function SetSelection(nextSelection, options = {}) {
  selection = nextSelection || { kind: "none", ids: [] };
  buildMenuOpen = false;
  if (!options.preserveCommand) CancelCommandModes(false);
  const playerUnits = GetSelectedPlayerUnits();
  if (playerUnits.length) lastPlayerUnitIds = playerUnits.map((unit) => unit.id);
  UpdateSelectionPanel();
  UpdateCommandPanel();
}

function SelectAllPlayerUnits(filter = null) {
  if (!state) return;
  const ids = state.units
    .filter((unit) => unit.alive && unit.side === "player" && (!filter || filter(unit)))
    .map((unit) => unit.id);
  if (ids.length) SetSelection({ kind: "unit", ids });
}

function CycleUnit() {
  if (!state) return;
  const units = state.units.filter((unit) => unit.alive && unit.side === "player");
  if (!units.length) return;
  const currentId = selection.kind === "unit" ? selection.ids[0] : null;
  const currentIndex = units.findIndex((unit) => unit.id === currentId);
  const unit = units[(currentIndex + 1 + units.length) % units.length];
  SetSelection({ kind: "unit", ids: [unit.id] });
  CenterCameraOn(unit.x, unit.y, false);
}

function GetEntityAtWorld(worldX, worldY) {
  if (!state) return null;
  const unitRadius = 25 / camera.zoom;
  const visibleUnits = state.units
    .filter((unit) => unit.alive && (unit.side === "player" || unit.visibleToPlayer))
    .filter((unit) => Distance(unit, { x: worldX, y: worldY }) <= unitRadius)
    .sort((left, right) => Distance(left, { x: worldX, y: worldY }) - Distance(right, { x: worldX, y: worldY }));
  if (visibleUnits.length) return { kind: "unit", value: visibleUnits[0] };
  const building = state.buildings
    .filter((candidate) => candidate.active && Distance(candidate, { x: worldX, y: worldY }) <= 40 / camera.zoom)
    .sort((left, right) => Distance(left, { x: worldX, y: worldY }) - Distance(right, { x: worldX, y: worldY }))[0];
  if (building) return { kind: "building", value: building };
  const site = state.sites
    .filter((candidate) => candidate.discovered && Distance(candidate, { x: worldX, y: worldY }) <= 38 / camera.zoom)
    .sort((left, right) => Distance(left, { x: worldX, y: worldY }) - Distance(right, { x: worldX, y: worldY }))[0];
  if (site) return { kind: "site", value: site };
  const village = state.villages
    .filter((candidate) => IsTileExplored(candidate.tileX, candidate.tileY) && Distance(candidate, { x: worldX, y: worldY }) <= 43 / camera.zoom)
    .sort((left, right) => Distance(left, { x: worldX, y: worldY }) - Distance(right, { x: worldX, y: worldY }))[0];
  if (village) return { kind: "village", value: village };
  const node = state.nodes
    .filter((candidate) => candidate.discovered && candidate.amount > 0 && Distance(candidate, { x: worldX, y: worldY }) <= 35 / camera.zoom)
    .sort((left, right) => Distance(left, { x: worldX, y: worldY }) - Distance(right, { x: worldX, y: worldY }))[0];
  if (node) return { kind: "node", value: node };
  return null;
}

function SelectEntity(entity, additive = false) {
  if (!entity) {
    if (!additive) SetSelection({ kind: "none", ids: [] });
    return;
  }
  if (entity.kind === "unit") {
    if (additive && selection.kind === "unit" && entity.value.side === "player") {
      const ids = new Set(selection.ids);
      if (ids.has(entity.value.id)) ids.delete(entity.value.id);
      else ids.add(entity.value.id);
      SetSelection({ kind: "unit", ids: [...ids] });
    } else {
      SetSelection({ kind: "unit", ids: [entity.value.id] });
    }
  } else {
    SetSelection({ kind: entity.kind, ids: [entity.value.id] });
  }
  PlayTone(entity.kind === "unit" ? 270 : 220, 0.035, 0.014);
}

function IssueContextCommand(worldX, worldY, options = {}) {
  if (!state) return;
  const playerUnits = GetSelectedPlayerUnits();
  if (!playerUnits.length) return;
  const entity = GetEntityAtWorld(worldX, worldY);
  let result = null;
  if (entity?.kind === "node" && playerUnits.some((unit) => unit.type === "work")) {
    result = IssueGatherCommand(state, playerUnits.map((unit) => unit.id), entity.value.id);
  } else if (entity?.kind === "building" && !entity.value.completed && playerUnits.some((unit) => unit.type === "work")) {
    result = IssueBuildCommand(state, playerUnits.map((unit) => unit.id), entity.value.id);
  } else if (entity?.kind === "unit" && entity.value.side === "enemy") {
    result = IssueAttackCommand(state, playerUnits.map((unit) => unit.id), entity.value.id);
  } else if (entity?.kind === "site" && !entity.value.sabotaged && !entity.value.disabled && entity.value.health > 0) {
    if (entity.value.type !== "garrison" && playerUnits.some((unit) => unit.type === "guerrilla")) {
      result = IssueSabotageCommand(state, playerUnits.map((unit) => unit.id), entity.value.id);
    } else {
      result = IssueAttackCommand(state, playerUnits.map((unit) => unit.id), entity.value.id);
    }
  } else {
    result = IssueMoveCommand(state, playerUnits.map((unit) => unit.id), worldX, worldY, {
      queue: options.queue,
      attackMove: options.attackMove,
    });
  }
  if (result?.valid) {
    PlayTone(options.attackMove ? 330 : 250, 0.045, 0.02, "triangle");
    ShowWorldHint(options.attackMove ? "搜索前进" : entity?.kind === "node" ? "开始组织生产" : entity?.kind === "site" ? "执行目标命令" : "移动命令已下达", 1000);
  } else if (result?.reason) {
    ShowWorldHint(result.reason, 1800);
    PlayTone(135, 0.07, 0.025, "sawtooth");
  }
  UpdateCommandPanel();
}

function ExecuteCommandMode(worldX, worldY) {
  if (!commandMode) return false;
  const playerIds = GetSelectedPlayerUnits().map((unit) => unit.id);
  if (!playerIds.length) {
    CancelCommandModes();
    return false;
  }
  if (commandMode.type === "move") {
    IssueContextCommand(worldX, worldY, { queue: keyboardState.has("Shift") });
  } else if (commandMode.type === "attackMove") {
    IssueContextCommand(worldX, worldY, { queue: keyboardState.has("Shift"), attackMove: true });
  } else if (commandMode.type === "sabotage") {
    const entity = GetEntityAtWorld(worldX, worldY);
    if (entity?.kind === "site") {
      const result = IssueSabotageCommand(state, playerIds, entity.value.id);
      if (!result.valid) ShowWorldHint(result.reason, 1800);
      else PlayTone(315, 0.05, 0.02, "triangle");
    } else {
      ShowWorldHint("请选择已侦察的封锁设施。", 1600);
      return true;
    }
  } else if (commandMode.type === "rally") {
    const building = GetSelectedBuilding();
    if (building) {
      const result = SetRallyPoint(state, building.id, worldX, worldY);
      ShowWorldHint(result.valid ? "集结点已设置" : result.reason, 1200);
    }
  }
  CancelCommandModes();
  return true;
}

function CancelCommandModes(showHint = true) {
  buildMode = null;
  commandMode = null;
  const buildCursor = GetElement("BuildCursor");
  buildCursor.classList.add("hidden");
  buildCursor.classList.remove("shelterCoverage", "invalid");
  buildCursor.querySelector("small").textContent = "左键选址 · 右键取消";
  GetElement("TouchCommandBanner").classList.add("hidden");
  canvas.style.cursor = "default";
  if (showHint) UpdateCommandPanel();
}

function EnterCommandMode(type, text) {
  buildMode = null;
  commandMode = { type };
  GetElement("BuildCursor").classList.add("hidden");
  const banner = GetElement("TouchCommandBanner");
  banner.textContent = `${text} · 点击地图指定目标 · 右键或 Esc 取消`;
  banner.classList.remove("hidden");
  canvas.style.cursor = "crosshair";
}

function EnterBuildMode(buildingType) {
  const workers = GetSelectedPlayerUnits().filter((unit) => unit.type === "work");
  if (!workers.length) {
    ShowWorldHint("先选择至少一支工作队。", 1500);
    return;
  }
  buildMode = { buildingType, workerIds: workers.map((unit) => unit.id) };
  commandMode = null;
  const cursor = GetElement("BuildCursor");
  cursor.classList.remove("hidden");
  cursor.classList.toggle("shelterCoverage", buildingType === "shelter");
  GetElement("TouchCommandBanner").textContent = `修建${buildingDefinitions[buildingType].name} · 点击地图选址 · 右键或 Esc 取消`;
  GetElement("TouchCommandBanner").classList.remove("hidden");
  canvas.style.cursor = "none";
}

function UpdateBuildCursor(clientX, clientY) {
  if (!buildMode || !state) return;
  const cursor = GetElement("BuildCursor");
  cursor.style.left = `${clientX}px`;
  cursor.style.top = `${clientY}px`;
  const world = ScreenToWorld(clientX, clientY);
  const preview = GetBuildPreview(state, buildMode.buildingType, world.x, world.y);
  cursor.classList.toggle("invalid", !preview.valid);
  if (buildMode.buildingType === "shelter") {
    cursor.style.setProperty("--coverageSize", `${600 * camera.zoom}px`);
    const center = preview.valid ? preview : world;
    const coveredVillages = state.villages.filter((village) => Distance(village, center) < 300).map((village) => village.name);
    cursor.querySelector("small").textContent = coveredVillages.length
      ? `可掩护：${coveredVillages.join("、")} · 左键选址`
      : "未覆盖村庄 · 左键选址";
  } else {
    cursor.querySelector("small").textContent = "左键选址 · 右键取消";
  }
}

function PlaceBuildAt(worldX, worldY) {
  if (!buildMode || !state) return;
  const result = PlaceBuilding(state, buildMode.buildingType, worldX, worldY, buildMode.workerIds);
  if (result.valid) {
    SetSelection({ kind: "building", ids: [result.building.id] }, { preserveCommand: true });
    PlayTone(205, 0.065, 0.024, "triangle");
    ShowWorldHint(`${buildingDefinitions[buildMode.buildingType].name}已选址`, 1300);
    CancelCommandModes();
  } else {
    ShowWorldHint(result.reason, 1700);
    PlayTone(130, 0.065, 0.022, "sawtooth");
  }
}

function SelectUnitsInRectangle(startX, startY, endX, endY, additive = false) {
  if (!state) return;
  const left = Math.min(startX, endX);
  const right = Math.max(startX, endX);
  const top = Math.min(startY, endY);
  const bottom = Math.max(startY, endY);
  const ids = state.units
    .filter((unit) => unit.alive && unit.side === "player")
    .filter((unit) => {
      const screen = WorldToScreen(unit.x, unit.y);
      return screen.x >= left && screen.x <= right && screen.y >= top && screen.y <= bottom;
    })
    .map((unit) => unit.id);
  if (additive && selection.kind === "unit") ids.push(...selection.ids);
  const uniqueIds = [...new Set(ids)];
  if (uniqueIds.length) SetSelection({ kind: "unit", ids: uniqueIds });
  else if (!additive) SetSelection({ kind: "none", ids: [] });
}

function HandlePointerDown(event) {
  if (!state || HasBlockingModal()) return;
  pointerPosition = { x: event.clientX, y: event.clientY, inside: true };
  if (event.button === 2) {
    event.preventDefault();
    if (buildMode || commandMode) {
      CancelCommandModes();
      return;
    }
    const world = ScreenToWorld(event.clientX, event.clientY);
    IssueContextCommand(world.x, world.y, { queue: event.shiftKey });
    return;
  }
  if (event.button !== 0) return;
  canvas.setPointerCapture?.(event.pointerId);
  pointerState = {
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    startX: event.clientX,
    startY: event.clientY,
    currentX: event.clientX,
    currentY: event.clientY,
    startCameraX: camera.x,
    startCameraY: camera.y,
    dragging: false,
    additive: event.shiftKey,
  };
}

function HandlePointerMove(event) {
  pointerPosition = { x: event.clientX, y: event.clientY, inside: true };
  UpdateBuildCursor(event.clientX, event.clientY);
  if (!pointerState || pointerState.pointerId !== event.pointerId) return;
  pointerState.currentX = event.clientX;
  pointerState.currentY = event.clientY;
  const distance = Math.hypot(pointerState.currentX - pointerState.startX, pointerState.currentY - pointerState.startY);
  if (distance > 8) pointerState.dragging = true;
  if (!pointerState.dragging) return;
  if (pointerState.pointerType === "touch" || event.altKey || event.button === 1) {
    camera.x = pointerState.startCameraX - (pointerState.currentX - pointerState.startX);
    camera.y = pointerState.startCameraY - (pointerState.currentY - pointerState.startY);
    ClampCamera();
  } else if (!buildMode && !commandMode) {
    const box = GetElement("SelectionBox");
    box.classList.remove("hidden");
    box.style.left = `${Math.min(pointerState.startX, pointerState.currentX)}px`;
    box.style.top = `${Math.min(pointerState.startY, pointerState.currentY)}px`;
    box.style.width = `${Math.abs(pointerState.currentX - pointerState.startX)}px`;
    box.style.height = `${Math.abs(pointerState.currentY - pointerState.startY)}px`;
  }
}

function HandlePointerUp(event) {
  if (!pointerState || pointerState.pointerId !== event.pointerId) return;
  const current = pointerState;
  pointerState = null;
  GetElement("SelectionBox").classList.add("hidden");
  if (current.dragging) {
    if (current.pointerType !== "touch" && !event.altKey && !buildMode && !commandMode) {
      SelectUnitsInRectangle(current.startX, current.startY, current.currentX, current.currentY, current.additive);
    }
    return;
  }
  const world = ScreenToWorld(event.clientX, event.clientY);
  if (buildMode) {
    PlaceBuildAt(world.x, world.y);
    return;
  }
  if (ExecuteCommandMode(world.x, world.y)) return;
  const entity = GetEntityAtWorld(world.x, world.y);
  const touchCommandTarget = entity && (
    entity.kind === "node"
    || entity.kind === "village"
    || entity.kind === "site"
    || (entity.kind === "building" && !entity.value.completed)
    || (entity.kind === "unit" && entity.value.side === "enemy")
  );
  if (current.pointerType === "touch" && GetSelectedPlayerUnits().length && (!entity || touchCommandTarget)) {
    IssueContextCommand(world.x, world.y);
  } else {
    SelectEntity(entity, current.additive);
  }
}

function HandleWheel(event) {
  if (!state || HasBlockingModal()) return;
  event.preventDefault();
  const worldBefore = ScreenToWorld(event.clientX, event.clientY);
  const zoomFactor = Math.exp(-event.deltaY * 0.0012);
  camera.zoom = Clamp(camera.zoom * zoomFactor, 0.48, 1.62);
  camera.x = worldBefore.x * camera.zoom - event.clientX;
  camera.y = worldBefore.y * camera.zoom - event.clientY;
  ClampCamera();
}

function HandleMiniPointer(event) {
  if (!state || HasBlockingModal()) return;
  const rectangle = miniCanvas.getBoundingClientRect();
  const ratioX = (event.clientX - rectangle.left) / rectangle.width;
  const ratioY = (event.clientY - rectangle.top) / rectangle.height;
  CenterCameraOn(
    ratioX * worldConfig.mapWidth * worldConfig.tileSize,
    ratioY * worldConfig.mapHeight * worldConfig.tileSize,
  );
}

function HandleKeyDown(event) {
  if (["INPUT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
  if (HasBlockingModal()) {
    if (event.key === "Tab") TrapTopModalFocus(event);
    if (event.key === "Escape") CloseTopModal();
    return;
  }
  if (![document.body, canvas].includes(document.activeElement)) return;
  keyboardState.add(event.key);
  if (!state) return;
  if (event.key === " " || event.code === "Space") {
    event.preventDefault();
    TogglePause();
  } else if (event.key === "Escape") {
    if (buildMode || commandMode) CancelCommandModes();
    else OpenMenu();
  } else if (event.key.toLowerCase() === "x") {
    IssueStopCommand(state, GetSelectedPlayerUnits().map((unit) => unit.id));
    UpdateCommandPanel();
  } else if (event.key.toLowerCase() === "f") {
    EnterCommandMode("attackMove", "搜索前进");
  } else if (event.key.toLowerCase() === "m") {
    EnterCommandMode("move", "移动");
  } else if (event.key.toLowerCase() === "h") {
    CenterOnHeadquarters();
  } else if (event.key.toLowerCase() === "c") {
    CycleUnit();
  } else if (event.key.toLowerCase() === "b" && GetSelectedPlayerUnits().some((unit) => unit.type === "work")) {
    buildMenuOpen = true;
    UpdateCommandPanel();
  } else if (event.key.toLowerCase() === "r" && GetSelectedPlayerUnits().some((unit) => unit.type === "guerrilla")) {
    EnterCommandMode("sabotage", "破袭目标");
  } else if (event.key === "[") {
    SetSpeed(state.speed === 2 ? 1 : 0.5);
  } else if (event.key === "]") {
    SetSpeed(state.speed === 0.5 ? 1 : 2);
  } else if (/^[1-5]$/.test(event.key)) {
    const groupNumber = Number(event.key);
    if (event.ctrlKey) {
      event.preventDefault();
      controlGroups.set(groupNumber, GetSelectedPlayerUnits().map((unit) => unit.id));
      ShowWorldHint(`编组 ${groupNumber} 已记录`, 1000);
    } else {
      const ids = (controlGroups.get(groupNumber) || []).filter((unitId) => state.units.some((unit) => unit.id === unitId && unit.alive));
      if (ids.length) SetSelection({ kind: "unit", ids });
    }
  }
}

function HandleKeyUp(event) {
  keyboardState.delete(event.key);
}

function UpdateCameraFromInput(deltaSeconds) {
  if (!state || HasBlockingModal()) return;
  let horizontal = 0;
  let vertical = 0;
  if (keyboardState.has("a") || keyboardState.has("A") || keyboardState.has("ArrowLeft")) horizontal -= 1;
  if (keyboardState.has("d") || keyboardState.has("D") || keyboardState.has("ArrowRight")) horizontal += 1;
  if (keyboardState.has("w") || keyboardState.has("W") || keyboardState.has("ArrowUp")) vertical -= 1;
  if (keyboardState.has("s") || keyboardState.has("S") || keyboardState.has("ArrowDown")) vertical += 1;
  if (!pointerState && pointerPosition.inside && !buildMode && !commandMode) {
    const edge = 9;
    if (pointerPosition.x < edge) horizontal -= 0.65;
    if (pointerPosition.x > window.innerWidth - edge) horizontal += 0.65;
    if (pointerPosition.y < edge) vertical -= 0.65;
    if (pointerPosition.y > window.innerHeight - edge) vertical += 0.65;
  }
  if (horizontal || vertical) {
    const length = Math.hypot(horizontal, vertical) || 1;
    const speed = 540 * deltaSeconds;
    camera.x += (horizontal / length) * speed;
    camera.y += (vertical / length) * speed;
    ClampCamera();
  }
}

function FormatNumber(value) {
  return Math.max(0, Math.floor(value)).toLocaleString("zh-CN");
}

function GetAlertLabel(alert) {
  if (alert >= 75) return "高压搜索";
  if (alert >= 50) return "扩大搜索";
  if (alert >= 25) return "警戒上升";
  return "敌方警戒";
}

function UpdateTopBar() {
  if (!state) return;
  GetElement("GrainValue").textContent = FormatNumber(state.resources.grain);
  GetElement("TimberValue").textContent = FormatNumber(state.resources.timber);
  GetElement("MaterielValue").textContent = FormatNumber(state.resources.materiel);
  GetElement("IntelValue").textContent = FormatNumber(state.resources.intel);
  const population = GetPopulation(state);
  GetElement("PopulationValue").textContent = `${population.used} / ${population.capacity}`;
  const support = Math.round(state.resources.support);
  const alert = Math.round(state.alert);
  GetElement("SupportValue").textContent = support;
  GetElement("SupportFill").style.width = `${support}%`;
  GetElement("SupportFill").style.background = support >= 55 ? "#839b70" : support >= 30 ? "#bd9256" : "#c25440";
  GetElement("AlertValue").textContent = alert;
  GetElement("AlertLabel").textContent = GetAlertLabel(alert);
  GetElement("AlertFill").style.width = `${alert}%`;
  GetElement("AlertFill").style.background = alert >= 75 ? "#c25440" : alert >= 50 ? "#c58d4f" : "#9b8058";
  GetElement("GameClock").textContent = FormatGameTime(state.elapsedSeconds);
  GetElement("PauseButton").textContent = state.paused ? "▶" : "Ⅱ";
  GetElement("PauseButton").setAttribute("aria-label", state.paused ? "继续" : "暂停");
  document.querySelectorAll(".speedButton").forEach((button) => {
    const selected = Number(button.dataset.speed) === state.speed;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
}

function FormatObjectiveValue(status) {
  if (status.metric === "sweepSeconds") return `${Math.floor(status.value / 60)}:${String(status.value % 60).padStart(2, "0")} / 12:00`;
  if (["support", "grain", "timber", "intel", "protectedCivilians"].includes(status.metric)) return `${Math.floor(status.value)} / ${status.target}`;
  return `${Math.floor(status.value)} / ${status.target}`;
}

function UpdateMissionPanel() {
  if (!state) return;
  const phase = phaseDefinitions[state.phaseIndex];
  GetElement("PhaseDate").textContent = phase.dateLabel;
  GetElement("PhaseTitle").textContent = phase.name;
  GetElement("PhaseBriefing").textContent = phase.briefing;
  GetElement("HistoryCardTitle").textContent = phase.historyTitle;
  const list = GetElement("ObjectiveList");
  list.replaceChildren();
  GetObjectiveStatuses(state).forEach((status) => {
    const item = document.createElement("div");
    item.className = `objectiveItem${status.complete ? " complete" : ""}`;
    item.setAttribute("aria-label", `${status.label}，${status.complete ? "已完成" : `进度 ${FormatObjectiveValue(status)}`}`);
    item.style.setProperty("--progress", `${status.ratio * 100}%`);
    const check = document.createElement("span");
    check.className = "objectiveCheck";
    check.textContent = "✓";
    check.setAttribute("aria-hidden", "true");
    const label = document.createElement("span");
    label.className = "objectiveLabel";
    label.textContent = status.label;
    const value = document.createElement("span");
    value.className = "objectiveValue";
    value.textContent = FormatObjectiveValue(status);
    item.append(check, label, value);
    list.append(item);
  });
}

function CreateSelectionBar(label, value, maximum, tone = "health") {
  const wrapper = document.createElement("div");
  wrapper.className = "selectionBar";
  const name = document.createElement("span");
  name.textContent = label;
  const track = document.createElement("i");
  const fill = document.createElement("em");
  fill.style.width = `${Clamp((value / maximum) * 100, 0, 100)}%`;
  if (tone === "morale") fill.style.background = "#839da0";
  if (tone === "build") fill.style.background = "#c39d57";
  track.append(fill);
  const text = document.createElement("b");
  text.textContent = `${Math.ceil(value)}/${Math.ceil(maximum)}`;
  wrapper.append(name, track, text);
  return wrapper;
}

function UpdateSelectionPanel() {
  const icon = GetElement("SelectionIcon");
  const name = GetElement("SelectionName");
  const count = GetElement("SelectionCount");
  const description = GetElement("SelectionDescription");
  const bars = GetElement("SelectionBars");
  bars.replaceChildren();
  if (!state || selection.kind === "none" || !selection.ids.length) {
    icon.textContent = "—";
    name.textContent = "未选择";
    count.textContent = "";
    description.textContent = "点选小队或建筑查看详情。";
    return;
  }
  if (selection.kind === "unit") {
    const units = GetSelectedUnits();
    if (!units.length) {
      SetSelection({ kind: "none", ids: [] });
      return;
    }
    const first = units[0];
    const definition = unitDefinitions[first.type];
    icon.textContent = definition.glyph;
    name.textContent = units.length > 1 ? "混合编队" : definition.name;
    count.textContent = units.length > 1 ? `${units.length} 支小队` : first.side === "enemy" ? "已发现敌情" : first.order.type === "idle" ? "待命" : GetOrderLabel(first.order.type);
    description.textContent = units.length > 1 ? "可统一移动、停止或设置姿态；生产与建造命令只由具备相应职能的小队执行。" : definition.description;
    const health = units.reduce((sum, unit) => sum + unit.health, 0);
    const maxHealth = units.reduce((sum, unit) => sum + unit.maxHealth, 0);
    const morale = units.reduce((sum, unit) => sum + unit.morale, 0);
    const maxMorale = units.reduce((sum, unit) => sum + unit.maxMorale, 0);
    bars.append(CreateSelectionBar("行动力", health, maxHealth), CreateSelectionBar("士气", morale, maxMorale, "morale"));
  } else if (selection.kind === "building") {
    const building = GetSelectedBuilding();
    if (!building) return;
    const definition = buildingDefinitions[building.type];
    icon.textContent = definition.glyph;
    name.textContent = definition.name;
    count.textContent = building.completed ? building.queue.length ? `组织队列 ${building.queue.length}` : "运转中" : `施工 ${Math.round(building.progress * 100)}%`;
    description.textContent = definition.description;
    bars.append(CreateSelectionBar("结构", building.health, building.maxHealth));
    if (!building.completed) bars.append(CreateSelectionBar("施工", building.progress * 100, 100, "build"));
    else if (building.queue.length) bars.append(CreateSelectionBar("集结", building.queue[0].total - building.queue[0].remaining, building.queue[0].total, "build"));
  } else if (selection.kind === "node") {
    const node = state.nodes.find((candidate) => candidate.id === selection.ids[0]);
    if (!node) return;
    const definition = nodeDefinitions[node.type];
    icon.textContent = definition.glyph;
    name.textContent = definition.name;
    count.textContent = `余量 ${Math.ceil(node.amount)}`;
    description.textContent = node.type === "field" ? "组织互助生产并接收群众支援；不是从村庄强征粮食。" : node.type === "grove" ? "采集和修整可用木料，注意不要让长期施工暴露工作站。" : node.type === "contact" ? "分散情报来源；需要工作队谨慎接取与整理。" : "可修复、拆解并重新利用的旧器材。";
    bars.append(CreateSelectionBar("余量", node.amount, node.maximumAmount, "build"));
  } else if (selection.kind === "village") {
    const village = state.villages.find((candidate) => candidate.id === selection.ids[0]);
    if (!village) return;
    icon.textContent = village.contacted ? "联" : "村";
    name.textContent = village.name;
    count.textContent = village.contacted ? `${village.protectedCivilians} 人已获掩护` : "尚未联络";
    description.textContent = village.contacted ? "村哨、交通路线与隐蔽点正在协同；安全期与村旁隐蔽点会缓慢恢复群众支持。" : "让交通组接近村庄即可建立联络。不要把战斗引到村口。";
    bars.append(CreateSelectionBar("安全", village.safety, 100), CreateSelectionBar("压力", village.pressure, 100, "morale"));
  } else if (selection.kind === "site") {
    const site = state.sites.find((candidate) => candidate.id === selection.ids[0]);
    if (!site) return;
    const inactive = site.sabotaged || site.disabled || site.health <= 0;
    icon.textContent = inactive ? "断" : site.type === "garrison" ? "据" : site.type === "relay" ? "讯" : "卡";
    name.textContent = site.name;
    count.textContent = inactive ? "已失效" : site.type === "garrison" ? "坚固目标" : "可实施破袭";
    description.textContent = site.type === "garrison" ? "不建议正面攻坚。侦察、绕行或破坏外围封锁设施更符合任务目标。" : "游击组可消耗军需与情报实施隐蔽破袭；附近有敌军时进度会受阻。";
    if (!inactive) bars.append(CreateSelectionBar("结构", site.health, site.maxHealth));
  }
}

function GetOrderLabel(orderType) {
  return {
    move: "移动中",
    attackMove: "搜索前进",
    gather: "组织生产",
    build: "施工中",
    attack: "交火中",
    sabotage: "实施破袭",
    retreat: "撤离接触",
  }[orderType] || "执行任务";
}

function GetCostText(cost) {
  const labels = { grain: "粮", timber: "木", materiel: "需", intel: "情" };
  return Object.entries(cost)
    .filter(([, amount]) => amount > 0)
    .map(([resourceId, amount]) => `${labels[resourceId]}${amount}`)
    .join(" · ");
}

function CreateCommandButton(options) {
  const button = document.createElement("button");
  button.className = "commandButton";
  button.type = "button";
  button.title = options.title || options.label;
  const glyph = document.createElement("strong");
  glyph.textContent = options.glyph;
  const label = document.createElement("span");
  label.textContent = options.label;
  button.append(glyph, label);
  if (options.hotkey) {
    const hotkey = document.createElement("small");
    hotkey.textContent = options.hotkey;
    button.append(hotkey);
  }
  let progress = null;
  if (options.progress !== undefined) {
    progress = document.createElement("em");
    button.append(progress);
  }
  button.RefreshCommandState = () => {
    const disabled = typeof options.disabled === "function" ? options.disabled() : options.disabled;
    button.disabled = Boolean(disabled);
    if (progress) {
      const progressValue = typeof options.progress === "function" ? options.progress() : options.progress;
      const hasProgress = Number.isFinite(progressValue);
      progress.classList.toggle("hidden", !hasProgress);
      if (hasProgress) progress.style.setProperty("--queueProgress", `${Clamp(progressValue, 0, 1) * 100}%`);
    }
  };
  button.RefreshCommandState();
  button.addEventListener("click", () => {
    button.RefreshCommandState();
    if (button.disabled) return;
    PlayTone(245, 0.035, 0.014);
    options.onClick?.();
  });
  return button;
}

function RefreshCommandPanel() {
  GetElement("CommandGrid").querySelectorAll(".commandButton").forEach((button) => button.RefreshCommandState?.());
}

function UpdateCommandPanel() {
  const grid = GetElement("CommandGrid");
  grid.replaceChildren();
  if (!state || selection.kind === "none" || !selection.ids.length) {
    grid.append(
      CreateCommandButton({ glyph: "全", label: "全选小队", hotkey: "", onClick: () => SelectAllPlayerUnits() }),
      CreateCommandButton({ glyph: "工", label: "选择工作队", hotkey: "", onClick: () => SelectAllPlayerUnits((unit) => unit.type === "work") }),
      CreateCommandButton({ glyph: "战", label: "选择战斗队", hotkey: "", onClick: () => SelectAllPlayerUnits((unit) => ["militia", "guerrilla"].includes(unit.type)) }),
      CreateCommandButton({ glyph: "站", label: "回到工作站", hotkey: "H", onClick: CenterOnHeadquarters }),
      CreateCommandButton({ glyph: "史", label: "战役说明", hotkey: "", onClick: OpenHistory }),
    );
    return;
  }

  if (selection.kind === "unit") {
    const units = GetSelectedUnits();
    const playerUnits = units.filter((unit) => unit.side === "player");
    if (!playerUnits.length) {
      grid.append(CreateCommandButton({ glyph: "退", label: "返回我方", onClick: () => {
        if (lastPlayerUnitIds.length) SetSelection({ kind: "unit", ids: lastPlayerUnitIds.filter((unitId) => state.units.some((unit) => unit.id === unitId && unit.alive)) });
        else SelectAllPlayerUnits();
      } }));
      return;
    }
    const hasWorker = playerUnits.some((unit) => unit.type === "work");
    const hasGuerrilla = playerUnits.some((unit) => unit.type === "guerrilla");
    if (buildMenuOpen && hasWorker) {
      Object.values(buildingDefinitions)
        .filter((definition) => definition.id !== "headquarters")
        .forEach((definition) => {
          grid.append(CreateCommandButton({
            glyph: definition.glyph,
            label: definition.name,
            title: `${definition.description}\n${GetCostText(definition.cost)}`,
            disabled: () => !CanAfford(state, definition.cost),
            onClick: () => EnterBuildMode(definition.id),
          }));
        });
      grid.append(CreateCommandButton({ glyph: "返", label: "返回命令", onClick: () => { buildMenuOpen = false; UpdateCommandPanel(); } }));
      return;
    }
    grid.append(
      CreateCommandButton({ glyph: "移", label: "移动", hotkey: "M", onClick: () => EnterCommandMode("move", "移动") }),
      CreateCommandButton({ glyph: "搜", label: "搜索前进", hotkey: "F", disabled: playerUnits.every((unit) => ["work", "scout"].includes(unit.type)), onClick: () => EnterCommandMode("attackMove", "搜索前进") }),
      CreateCommandButton({ glyph: "止", label: "停止", hotkey: "X", onClick: () => { IssueStopCommand(state, playerUnits.map((unit) => unit.id)); UpdateSelectionPanel(); } }),
      CreateCommandButton({ glyph: "隐", label: "保持位置", hotkey: "", onClick: () => { SetUnitStance(state, playerUnits.map((unit) => unit.id), "hold"); ShowWorldHint("小队将保持位置并减少追击", 1200); } }),
    );
    if (hasWorker) grid.append(CreateCommandButton({ glyph: "筑", label: "建造", hotkey: "B", onClick: () => { buildMenuOpen = true; UpdateCommandPanel(); } }));
    if (hasGuerrilla) grid.append(CreateCommandButton({ glyph: "破", label: "实施破袭", hotkey: "R", onClick: () => EnterCommandMode("sabotage", "破袭目标") }));
    if (!hasWorker && !hasGuerrilla) grid.append(CreateCommandButton({ glyph: "游", label: "机动姿态", onClick: () => { SetUnitStance(state, playerUnits.map((unit) => unit.id), "defensive"); ShowWorldHint("小队只应对近距离威胁", 1100); } }));
    return;
  }

  if (selection.kind === "building") {
    const building = GetSelectedBuilding();
    if (!building) return;
    const definition = buildingDefinitions[building.type];
    if (!building.completed) {
      grid.append(
        CreateCommandButton({ glyph: "续", label: "派工作队续建", onClick: () => {
          const workerIds = state.units.filter((unit) => unit.alive && unit.side === "player" && unit.type === "work").map((unit) => unit.id);
          const result = IssueBuildCommand(state, workerIds, building.id);
          ShowWorldHint(result.valid ? "工作队已恢复施工" : result.reason, 1500);
          if (result.valid) SetSelection({ kind: "unit", ids: workerIds });
        } }),
        CreateCommandButton({ glyph: "工", label: "选择施工队", onClick: () => {
          const ids = state.units.filter((unit) => unit.alive && unit.side === "player" && unit.order.type === "build" && unit.order.buildingId === building.id).map((unit) => unit.id);
          if (ids.length) SetSelection({ kind: "unit", ids });
        } }),
        CreateCommandButton({ glyph: "站", label: "回到工作站", onClick: CenterOnHeadquarters }),
      );
      return;
    }
    definition.trains.forEach((unitType) => {
      const unitDefinition = unitDefinitions[unitType];
      grid.append(CreateCommandButton({
        glyph: unitDefinition.glyph,
        label: `组织${unitDefinition.name}`,
        title: `${unitDefinition.description}\n${GetCostText(unitDefinition.cost)}`,
        disabled: () => {
          const population = GetPopulation(state);
          const queuedPopulation = building.queue.reduce((sum, item) => sum + unitDefinitions[item.unitType].population, 0);
          return !building.active
            || !building.completed
            || building.queue.length >= 3
            || !CanAfford(state, unitDefinition.cost)
            || population.used + queuedPopulation + unitDefinition.population > population.capacity
            || (unitType === "guerrilla" && state.phaseIndex < 2);
        },
        progress: () => (building.queue[0]?.unitType === unitType ? (building.queue[0].total - building.queue[0].remaining) / building.queue[0].total : undefined),
        onClick: () => {
          const result = QueueTraining(state, building.id, unitType);
          ShowWorldHint(result.valid ? `${unitDefinition.name}开始集结` : result.reason, 1500);
          UpdateSelectionPanel();
          UpdateCommandPanel();
        },
      }));
    });
    grid.append(
      CreateCommandButton({ glyph: "集", label: "设置集结点", onClick: () => EnterCommandMode("rally", "设置集结点") }),
      CreateCommandButton({ glyph: "全", label: "选择全部小队", onClick: () => SelectAllPlayerUnits() }),
      CreateCommandButton({ glyph: "站", label: "镜头居中", onClick: () => CenterCameraOn(building.x, building.y, false) }),
    );
    return;
  }

  if (selection.kind === "node") {
    const nodeId = selection.ids[0];
    grid.append(
      CreateCommandButton({ glyph: "产", label: "派工作队生产", onClick: () => {
        const workerIds = state.units.filter((unit) => unit.alive && unit.side === "player" && unit.type === "work").map((unit) => unit.id);
        const result = IssueGatherCommand(state, workerIds, nodeId);
        ShowWorldHint(result.valid ? "工作队已前往生产点" : result.reason, 1500);
        if (result.valid) SetSelection({ kind: "unit", ids: workerIds });
      } }),
      CreateCommandButton({ glyph: "工", label: "选择工作队", onClick: () => SelectAllPlayerUnits((unit) => unit.type === "work") }),
      CreateCommandButton({ glyph: "站", label: "回到工作站", onClick: CenterOnHeadquarters }),
    );
  } else if (selection.kind === "village") {
    grid.append(
      CreateCommandButton({ glyph: "联", label: "选择交通组", onClick: () => SelectAllPlayerUnits((unit) => unit.type === "scout") }),
      CreateCommandButton({ glyph: "护", label: "选择战斗队", onClick: () => SelectAllPlayerUnits((unit) => ["militia", "guerrilla"].includes(unit.type)) }),
      CreateCommandButton({ glyph: "中", label: "镜头居中", onClick: () => {
        const village = state.villages.find((candidate) => candidate.id === selection.ids[0]);
        if (village) CenterCameraOn(village.x, village.y, false);
      } }),
    );
  } else if (selection.kind === "site") {
    const site = state.sites.find((candidate) => candidate.id === selection.ids[0]);
    grid.append(
      CreateCommandButton({ glyph: "游", label: "选择游击组", onClick: () => SelectAllPlayerUnits((unit) => unit.type === "guerrilla") }),
      CreateCommandButton({ glyph: "察", label: "选择交通组", onClick: () => SelectAllPlayerUnits((unit) => unit.type === "scout") }),
      CreateCommandButton({ glyph: "中", label: "镜头居中", onClick: () => site && CenterCameraOn(site.x, site.y, false) }),
    );
  }
}

function DrawMiniMap() {
  if (!state) return;
  const width = miniCanvas.width;
  const height = miniCanvas.height;
  const scaleX = width / worldConfig.mapWidth;
  const scaleY = height / worldConfig.mapHeight;
  miniContext.clearRect(0, 0, width, height);
  for (let tileY = 0; tileY < worldConfig.mapHeight; tileY += 1) {
    for (let tileX = 0; tileX < worldConfig.mapWidth; tileX += 1) {
      const index = tileY * worldConfig.mapWidth + tileX;
      if (!state.explored[index]) {
        miniContext.fillStyle = "#0b0e0c";
      } else {
        const tile = state.tiles[index];
        const color = terrainColors[tile.terrain] || terrainColors.plain;
        const factor = state.visible[index] ? 0.82 : 0.46;
        miniContext.fillStyle = `rgb(${color[0] * factor},${color[1] * factor},${color[2] * factor})`;
      }
      miniContext.fillRect(tileX * scaleX, tileY * scaleY, Math.ceil(scaleX), Math.ceil(scaleY));
    }
  }
  state.villages.filter((village) => village.contacted).forEach((village) => {
    miniContext.fillStyle = village.safety >= 42 ? "#d0ad62" : "#b85a45";
    miniContext.fillRect(village.tileX * scaleX - 2, village.tileY * scaleY - 2, 5, 5);
  });
  state.buildings.filter((building) => building.active).forEach((building) => {
    miniContext.fillStyle = "#cf5541";
    miniContext.fillRect(building.tileX * scaleX - 1.5, building.tileY * scaleY - 1.5, 4, 4);
  });
  state.units.filter((unit) => unit.alive && unit.side === "player").forEach((unit) => {
    miniContext.fillStyle = "#e46a50";
    miniContext.fillRect((unit.x / worldConfig.tileSize) * scaleX - 1, (unit.y / worldConfig.tileSize) * scaleY - 1, 3, 3);
  });
  state.units.filter((unit) => unit.alive && unit.side === "enemy" && unit.visibleToPlayer).forEach((unit) => {
    miniContext.fillStyle = "#e2dccc";
    miniContext.fillRect((unit.x / worldConfig.tileSize) * scaleX - 1, (unit.y / worldConfig.tileSize) * scaleY - 1, 3, 3);
  });
  const worldViewportWidth = window.innerWidth / camera.zoom / worldConfig.tileSize;
  const worldViewportHeight = window.innerHeight / camera.zoom / worldConfig.tileSize;
  const viewportX = camera.x / camera.zoom / worldConfig.tileSize;
  const viewportY = camera.y / camera.zoom / worldConfig.tileSize;
  miniContext.strokeStyle = "rgba(240, 215, 158, 0.78)";
  miniContext.lineWidth = 1;
  miniContext.strokeRect(viewportX * scaleX, viewportY * scaleY, worldViewportWidth * scaleX, worldViewportHeight * scaleY);
}

function UpdateEventLog() {
  if (!state?.lastEvent || state.lastEvent.id === knownEventId) return;
  knownEventId = state.lastEvent.id;
  const log = GetElement("EventLog");
  const event = state.lastEvent;
  const toast = document.createElement("article");
  toast.className = `eventToast ${event.tone}`;
  const title = document.createElement("strong");
  title.textContent = event.title;
  const text = document.createElement("p");
  text.textContent = event.text;
  toast.append(title, text);
  log.prepend(toast);
  while (log.children.length > 4) log.lastElementChild.remove();
  window.setTimeout(() => toast.remove(), event.tone === "danger" ? 9000 : 6500);
  if (["warning", "danger", "success"].includes(event.tone)) PlayTone(event.tone === "danger" ? 150 : event.tone === "success" ? 410 : 240, 0.08, 0.018, "triangle");
}

function UpdateInterface() {
  UpdateTopBar();
  UpdateMissionPanel();
  UpdateSelectionPanel();
  RefreshCommandPanel();
  UpdateEventLog();
}

function ShowWorldHint(text, duration = 1500) {
  const hint = GetElement("WorldHint");
  hint.textContent = text;
  hint.classList.remove("hidden");
  window.clearTimeout(hintTimeout);
  hintTimeout = window.setTimeout(() => hint.classList.add("hidden"), duration);
  GetElement("ScreenReaderStatus").textContent = text;
}

function CenterOnHeadquarters() {
  const headquarters = state?.buildings.find((building) => building.active && building.type === "headquarters");
  if (headquarters) CenterCameraOn(headquarters.x, headquarters.y, false);
}

function HasBlockingModal() {
  return activeModalCount > 0;
}

function GetVisibleModals() {
  return [...GetElement("ModalLayer").children].filter((modal) => !modal.classList.contains("hidden"));
}

function GetTopModal() {
  const visible = GetVisibleModals();
  for (let index = modalStack.length - 1; index >= 0; index -= 1) {
    const modal = visible.find((candidate) => candidate.id === modalStack[index]);
    if (modal) return modal;
  }
  return visible.at(-1) || null;
}

function GetFocusableElements(container) {
  if (!container) return [];
  return [...container.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')]
    .filter((element) => !element.closest(".hidden") && !element.inert);
}

function SyncModalLayer() {
  const layer = GetElement("ModalLayer");
  const visible = GetVisibleModals();
  const top = GetTopModal();
  activeModalCount = visible.length;
  layer.classList.toggle("blocking", activeModalCount > 0);
  document.querySelectorAll(".gameShell > *").forEach((element) => {
    if (!["ModalLayer", "ScreenReaderStatus"].includes(element.id)) element.inert = activeModalCount > 0;
  });
  [...layer.children].forEach((modal) => {
    const isTop = modal === top;
    modal.inert = !isTop;
    modal.setAttribute("aria-hidden", String(!isTop));
  });
}

function FocusTopModal() {
  const top = GetTopModal();
  if (!top) return;
  const first = GetFocusableElements(top)[0];
  if (first) first.focus({ preventScroll: true });
  else {
    top.tabIndex = -1;
    top.focus({ preventScroll: true });
  }
}

function TrapTopModalFocus(event) {
  const top = GetTopModal();
  const focusable = GetFocusableElements(top);
  if (!top || !focusable.length) {
    event.preventDefault();
    FocusTopModal();
    return;
  }
  const first = focusable[0];
  const last = focusable.at(-1);
  if (!top.contains(document.activeElement)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
  } else if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function ShowModal(id) {
  const modal = GetElement(id);
  if (!modal || !modal.classList.contains("hidden")) return;
  modalFocusOrigins.set(id, document.activeElement);
  modal.classList.remove("hidden");
  modalStack = modalStack.filter((modalId) => modalId !== id);
  modalStack.push(id);
  SyncModalLayer();
  window.requestAnimationFrame(FocusTopModal);
}

function HideModal(id) {
  const modal = GetElement(id);
  if (!modal || modal.classList.contains("hidden")) return;
  modal.classList.add("hidden");
  modalStack = modalStack.filter((modalId) => modalId !== id);
  SyncModalLayer();
  const origin = modalFocusOrigins.get(id);
  modalFocusOrigins.delete(id);
  if (origin?.isConnected && !origin.inert) window.requestAnimationFrame(() => origin.focus({ preventScroll: true }));
  else if (HasBlockingModal()) window.requestAnimationFrame(FocusTopModal);
}

function CloseTopModal() {
  if (!GetElement("HistoryModal").classList.contains("hidden")) {
    CloseHistory();
  } else if (!GetElement("TutorialModal").classList.contains("hidden")) {
    FinishTutorial();
  } else if (!GetElement("MenuModal").classList.contains("hidden")) {
    ResumeGame();
  } else if (!GetElement("BriefingModal").classList.contains("hidden")) {
    AcceptBriefing();
  }
}

function TogglePause() {
  if (!state || HasBlockingModal()) return;
  state.paused = !state.paused;
  UpdateTopBar();
  ShowWorldHint(state.paused ? "部署暂停 · 仍可下达命令" : "战役继续", 900);
}

function SetSpeed(speed) {
  if (!state) return;
  state.speed = [0.5, 1, 2].includes(speed) ? speed : 1;
  UpdateTopBar();
}

function PopulateHistoryModal() {
  GetElement("HistoryBoundaryText").textContent = gameConfig.playerRole + gameConfig.historyBoundary;
  GetElement("HistoryRespectText").textContent = gameConfig.respectNote;
  const termList = GetElement("TermList");
  termList.replaceChildren();
  historicalTerms.forEach((item) => {
    const wrapper = document.createElement("article");
    wrapper.className = "termItem";
    const title = document.createElement("strong");
    title.textContent = item.term;
    const description = document.createElement("p");
    description.textContent = item.definition;
    wrapper.append(title, description);
    termList.append(wrapper);
  });
  const sourceList = GetElement("SourceList");
  sourceList.replaceChildren();
  historicalSources.forEach((source) => {
    const link = document.createElement("a");
    link.className = "sourceItem";
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    const organization = document.createElement("span");
    organization.textContent = source.organization;
    const title = document.createElement("strong");
    title.textContent = source.title;
    const use = document.createElement("p");
    use.textContent = source.usedFor;
    link.append(organization, title, use);
    sourceList.append(link);
  });
}

function OpenHistory() {
  if (!GetElement("HistoryModal").classList.contains("hidden")) return;
  historyPauseState = state?.paused || false;
  if (state) state.paused = true;
  ShowModal("HistoryModal");
}

function CloseHistory() {
  HideModal("HistoryModal");
  if (state && GetElement("MenuModal").classList.contains("hidden") && GetElement("BriefingModal").classList.contains("hidden") && GetElement("TutorialModal").classList.contains("hidden")) {
    state.paused = historyPauseState;
  }
}

function ShowBriefing(phaseIndex) {
  if (!state) return;
  const phase = phaseDefinitions[phaseIndex];
  state.paused = true;
  GetElement("BriefingDate").textContent = phase.dateLabel;
  GetElement("BriefingTitle").textContent = phase.name;
  GetElement("BriefingText").textContent = phase.briefing;
  GetElement("BriefingHistoryTitle").textContent = phase.historyTitle;
  GetElement("BriefingHistoryText").textContent = phase.historyText;
  GetElement("BriefingContinueButton").textContent = phaseIndex === 0 ? "进入战场" : "继续部署";
  ShowModal("BriefingModal");
}

function AcceptBriefing() {
  HideModal("BriefingModal");
  if (state?.phaseIndex === 0 && tutorialRequested && tutorialIndex < 0) {
    tutorialIndex = 0;
    ShowTutorialStep();
  } else if (state) {
    state.paused = false;
  }
}

function ShowTutorialStep() {
  if (tutorialIndex < 0 || tutorialIndex >= tutorialSteps.length) {
    FinishTutorial();
    return;
  }
  const step = tutorialSteps[tutorialIndex];
  state.paused = true;
  GetElement("TutorialCount").textContent = `快速教学 · ${tutorialIndex + 1} / ${tutorialSteps.length}`;
  GetElement("TutorialTitle").textContent = step.title;
  GetElement("TutorialText").textContent = step.text;
  GetElement("NextTutorialButton").textContent = tutorialIndex === tutorialSteps.length - 1 ? "开始部署" : "下一条";
  ShowModal("TutorialModal");
}

function NextTutorialStep() {
  tutorialIndex += 1;
  if (tutorialIndex >= tutorialSteps.length) FinishTutorial();
  else ShowTutorialStep();
}

function FinishTutorial() {
  HideModal("TutorialModal");
  tutorialIndex = tutorialSteps.length;
  if (state) state.paused = false;
  ShowWorldHint("先选择工作队，开始组织生产。", 2600);
}

function OpenMenu() {
  if (!state || HasBlockingModal() || !GetElement("MenuModal").classList.contains("hidden")) return;
  state.paused = true;
  GetElement("MenuTime").textContent = FormatGameTime(state.elapsedSeconds);
  GetElement("MenuPhase").textContent = phaseDefinitions[state.phaseIndex].shortName;
  GetElement("MenuSaveState").textContent = "每30秒自动保存";
  ShowModal("MenuModal");
}

function ResumeGame() {
  HideModal("MenuModal");
  if (state && !HasBlockingModal()) state.paused = false;
}

function SaveGame(showConfirmation = false) {
  if (!state || state.status !== "playing") return false;
  const previousAutosaveTime = state.lastAutosaveTime;
  try {
    state.lastAutosaveTime = state.elapsedSeconds;
    localStorage.setItem(gameConfig.saveKey, SerializeGame(state));
    if (showConfirmation) ShowWorldHint("战役进度已保存在本机", 1400);
    return true;
  } catch {
    state.lastAutosaveTime = previousAutosaveTime;
    if (showConfirmation) ShowWorldHint("浏览器未允许本地保存", 1800);
    return false;
  }
}

function ReadSavedGame() {
  try {
    const serialized = localStorage.getItem(gameConfig.saveKey);
    if (!serialized) return null;
    const saved = DeserializeGame(serialized);
    if (saved.status !== "playing") return null;
    return saved;
  } catch {
    try { localStorage.removeItem(gameConfig.saveKey); } catch { /* Ignore cleanup failure. */ }
    return null;
  }
}

function RefreshContinueButton() {
  const saved = ReadSavedGame();
  const button = GetElement("ContinueButton");
  if (!saved) {
    button.classList.add("hidden");
    return;
  }
  button.classList.remove("hidden");
  GetElement("ContinueMeta").textContent = `${phaseDefinitions[saved.phaseIndex].name} · ${FormatGameTime(saved.elapsedSeconds)}`;
}

function PrepareGameView() {
  selection = { kind: "none", ids: [] };
  lastPlayerUnitIds = [];
  buildMode = null;
  commandMode = null;
  buildMenuOpen = false;
  controlGroups = new Map();
  resultShown = false;
  knownEventId = null;
  knownTransitionSerial = state.transitionSerial;
  tutorialIndex = -1;
  const headquarters = state.buildings.find((building) => building.active && building.type === "headquarters");
  camera.zoom = 0.9;
  if (headquarters) CenterCameraOn(headquarters.x, headquarters.y);
  const workers = state.units.filter((unit) => unit.alive && unit.side === "player" && unit.type === "work").map((unit) => unit.id);
  if (workers.length) SetSelection({ kind: "unit", ids: workers });
  UpdateInterface();
  DrawMiniMap();
}

function StartNewGame() {
  startSeedOffset += 1;
  state = CreateGameState({ seed: 19420501 + startSeedOffset, difficultyId: selectedDifficultyId });
  tutorialRequested = true;
  HideModal("StartScreen");
  PrepareGameView();
  ShowBriefing(0);
  SaveGame(false);
}

function ContinueSavedGame() {
  const saved = ReadSavedGame();
  if (!saved) {
    RefreshContinueButton();
    return;
  }
  state = saved;
  state.paused = true;
  SetDifficultySelection(state.difficultyId);
  tutorialRequested = false;
  HideModal("StartScreen");
  PrepareGameView();
  ShowBriefing(state.phaseIndex);
}

function RestartCurrentGame() {
  if (!state) return;
  const difficultyId = state.difficultyId;
  HideModal("MenuModal");
  HideModal("ResultModal");
  state = CreateGameState({ seed: state.seed + 1, difficultyId });
  tutorialRequested = false;
  PrepareGameView();
  ShowBriefing(0);
  SaveGame(false);
}

function ReturnToTitle() {
  if (state?.status === "playing") SaveGame(false);
  HideModal("MenuModal");
  HideModal("ResultModal");
  CancelCommandModes(false);
  state = null;
  selection = { kind: "none", ids: [] };
  modalStack = [];
  GetElement("StartScreen").classList.remove("hidden");
  modalStack.push("StartScreen");
  SyncModalLayer();
  window.requestAnimationFrame(FocusTopModal);
  RefreshContinueButton();
}

function ShowResult() {
  if (!state || resultShown) return;
  resultShown = true;
  state.paused = true;
  const score = GetCampaignScore(state);
  GetElement("ResultEyebrow").textContent = state.status === "won" ? "战役完成 · 局部网络得以保存" : "战役中止 · 保存力量仍是下一步";
  GetElement("ResultTitle").textContent = state.status === "won" ? score.summary : "转移未能完成";
  GetElement("ResultSummary").textContent = state.status === "won"
    ? `用时 ${FormatGameTime(score.elapsedSeconds)}。评价不统计击杀，而依据群众安全、联络保存、队伍保全和隐蔽纪律。`
    : `本局在 ${FormatGameTime(score.elapsedSeconds)} 结束。敌后坚持不等于守住每一处阵地；可以重新安排预警、隐蔽与转移顺序。`;
  GetElement("ScoreValue").textContent = score.total;
  const components = GetElement("ScoreComponents");
  components.replaceChildren();
  Object.values(score.components).forEach((component) => {
    const item = document.createElement("div");
    item.className = "scoreComponent";
    const label = document.createElement("span");
    label.textContent = component.label;
    const value = document.createElement("strong");
    value.textContent = component.value;
    item.append(label, value);
    components.append(item);
  });
  GetElement("NationalOutcome").textContent = score.nationalOutcome;
  try { localStorage.removeItem(gameConfig.saveKey); } catch { /* Local storage is optional. */ }
  ShowModal("ResultModal");
}

function CheckTransitions() {
  if (!state) return;
  if (state.transitionSerial !== knownTransitionSerial) {
    knownTransitionSerial = state.transitionSerial;
    SaveGame(false);
    ShowBriefing(state.phaseIndex);
  }
  if (state.status !== "playing") ShowResult();
}

function SetDifficultySelection(difficultyId) {
  selectedDifficultyId = difficultyDefinitions[difficultyId] ? difficultyId : "standard";
  document.querySelectorAll("[data-difficulty]").forEach((button) => {
    const selected = button.dataset.difficulty === selectedDifficultyId;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-checked", String(selected));
  });
}

function InitializeStartScreen() {
  PopulateHistoryModal();
  document.querySelectorAll("[data-difficulty]").forEach((button) => {
    button.addEventListener("click", () => {
      SetDifficultySelection(button.dataset.difficulty);
      PlayTone(245, 0.035, 0.014);
    });
  });
  SetDifficultySelection(selectedDifficultyId);
  RefreshContinueButton();
  modalStack = ["StartScreen"];
  SyncModalLayer();
}

function ToggleMissionPanel() {
  const panel = GetElement("MissionPanel");
  const button = GetElement("CollapseMissionButton");
  const collapsed = panel.classList.toggle("collapsed");
  button.setAttribute("aria-expanded", String(!collapsed));
  button.setAttribute("aria-label", collapsed ? "展开任务面板" : "折叠任务面板");
}

function BindInterface() {
  GetElement("NewGameButton").addEventListener("click", StartNewGame);
  GetElement("ContinueButton").addEventListener("click", ContinueSavedGame);
  GetElement("StartHistoryButton").addEventListener("click", OpenHistory);
  GetElement("BrandButton").addEventListener("click", OpenHistory);
  GetElement("HistoryCardButton").addEventListener("click", OpenHistory);
  GetElement("CloseHistoryButton").addEventListener("click", CloseHistory);
  GetElement("BriefingContinueButton").addEventListener("click", AcceptBriefing);
  GetElement("NextTutorialButton").addEventListener("click", NextTutorialStep);
  GetElement("SkipTutorialButton").addEventListener("click", FinishTutorial);
  GetElement("PauseButton").addEventListener("click", TogglePause);
  GetElement("MenuButton").addEventListener("click", OpenMenu);
  GetElement("ResumeButton").addEventListener("click", ResumeGame);
  GetElement("SaveButton").addEventListener("click", () => SaveGame(true));
  GetElement("MenuHistoryButton").addEventListener("click", OpenHistory);
  GetElement("RestartButton").addEventListener("click", RestartCurrentGame);
  GetElement("ReturnTitleButton").addEventListener("click", ReturnToTitle);
  GetElement("ResultRestartButton").addEventListener("click", RestartCurrentGame);
  GetElement("ResultHistoryButton").addEventListener("click", OpenHistory);
  GetElement("CollapseMissionButton").addEventListener("click", ToggleMissionPanel);
  GetElement("CenterBaseButton").addEventListener("click", CenterOnHeadquarters);
  GetElement("SupportButton").addEventListener("click", () => ShowWorldHint("保护群众、遵守纪律并减轻负担，才能维持支持。", 2400));
  GetElement("AlertButton").addEventListener("click", () => ShowWorldHint("建造、被发现、交火和破袭都会提高警戒；脱离接触后逐步下降。", 2600));
  document.querySelectorAll(".speedButton").forEach((button) => button.addEventListener("click", () => SetSpeed(Number(button.dataset.speed))));

  canvas.addEventListener("pointerdown", HandlePointerDown);
  canvas.addEventListener("pointermove", HandlePointerMove);
  canvas.addEventListener("pointerup", HandlePointerUp);
  canvas.addEventListener("pointercancel", () => {
    pointerState = null;
    GetElement("SelectionBox").classList.add("hidden");
  });
  canvas.addEventListener("pointerleave", () => { pointerPosition.inside = false; });
  canvas.addEventListener("pointerenter", () => { pointerPosition.inside = true; });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  canvas.addEventListener("wheel", HandleWheel, { passive: false });
  miniCanvas.addEventListener("pointerdown", HandleMiniPointer);
  window.addEventListener("keydown", HandleKeyDown);
  window.addEventListener("keyup", HandleKeyUp);
  window.addEventListener("resize", ResizeCanvas);
  window.addEventListener("blur", () => {
    keyboardState.clear();
    if (state?.status === "playing") SaveGame(false);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state?.status === "playing") SaveGame(false);
  });
}

function Frame(frameTime) {
  const realDeltaSeconds = Clamp((frameTime - previousFrameTime) / 1000, 0, 0.12);
  previousFrameTime = frameTime;
  UpdateCameraFromInput(realDeltaSeconds);
  if (state) {
    AdvanceGame(state, realDeltaSeconds);
    CheckTransitions();
    if (state.status === "playing" && state.elapsedSeconds - state.lastAutosaveTime >= worldConfig.autosaveSeconds) SaveGame(false);
  }
  uiAccumulator += realDeltaSeconds;
  miniAccumulator += realDeltaSeconds;
  if (uiAccumulator >= 0.18) {
    uiAccumulator = 0;
    if (state) UpdateInterface();
  }
  if (miniAccumulator >= 0.35) {
    miniAccumulator = 0;
    if (state) DrawMiniMap();
  }
  DrawGame();
  frameHandle = requestAnimationFrame(Frame);
}

function Initialize() {
  ResizeCanvas();
  InitializeStartScreen();
  BindInterface();
  frameHandle = requestAnimationFrame(Frame);
}

Initialize();

export const gameDebug = Object.freeze({
  GetState: () => state,
  GetSelection: () => selection,
  StartNewGame,
  ContinueSavedGame,
  SaveGame,
  CenterCameraOn,
  Stop: () => cancelAnimationFrame(frameHandle),
});
