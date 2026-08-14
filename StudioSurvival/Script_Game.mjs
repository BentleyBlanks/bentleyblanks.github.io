import * as THREE from "three";
import {
  COLLATERAL_OPTIONS,
  DIRECTIVES,
  FindCollateral,
  FindDirective,
  FindGameType,
  FindProject,
  FindStaff,
  GAME_TYPES,
  LIVING_BILLS,
  MODULE_KEYS,
  MODULE_META,
  PROJECTS,
  STAFF_CATALOG,
} from "./Data_Game.mjs";
import {
  AdvanceMonth,
  CalculateTensions,
  CreateInitialState,
  EvaluateProject,
  FireStaff,
  ForecastMonthlyCosts,
  GetIdleLine,
  HireStaff,
  ReleaseBuild,
  SAVE_KEY,
  SelectDirective,
  StartProject,
  TakeLoan,
  TalkToStaff,
  ValidateState,
} from "./Script_Rules.mjs";

const dom = Object.fromEntries([
  "loadingScreen", "gameRoot", "sceneCanvas", "sceneLabels", "monthValue", "cashValue", "burnValue",
  "ratingValue", "goalBar", "soundButton", "helpButton", "projectPanel", "gameTypeBadge", "projectTitle",
  "versionBadge", "projectPitch", "moduleGrid", "debtValue", "tensionList", "financePanel",
  "financeDetailButton", "costBreakdown", "forecastValue", "teamCount", "teamMiniList", "hungerBar",
  "hungerValue", "worldHint", "talentButton", "directiveButton", "directiveLabel", "moneyButton",
  "releaseButton", "releaseLabel", "nextMonthButton", "toastStack", "setupScreen", "projectChoices",
  "typeChoices", "startButton", "continueButton", "modalLayer", "modalBackdrop", "sheetKicker", "sheetTitle",
  "sheetBody", "sheetCloseButton", "conversationLayer", "conversationBackdrop", "conversationCloseButton",
  "conversationPortrait", "conversationKind", "conversationName", "conversationRole", "conversationLine",
  "conversationStats", "talkPointsValue", "conversationActions", "resultLayer", "resultKicker", "resultTitle",
  "resultBody", "resultCloseButton", "endingScreen", "endingTitle", "endingSubtitle", "endingStats",
  "restartButton",
].map((id) => [id, document.getElementById(id)]));

const FormatMoney = (value) => `¥${Math.round(value).toLocaleString("zh-CN")}`;
const FormatGoalMoney = (value) => value >= 100000000
  ? `${(value / 100000000).toFixed(value >= 1000000000 ? 1 : 2)} 亿元`
  : value >= 10000
    ? `${(value / 10000).toFixed(1)} 万元`
    : FormatMoney(value);
const Clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const EscapeHtml = (value) => String(value)
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#039;");

function LoadSavedState() {
  try {
    const candidate = JSON.parse(localStorage.getItem(SAVE_KEY));
    return ValidateState(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

const savedState = LoadSavedState();
let state = savedState || CreateInitialState();
let selectedProjectId = state.project?.templateId || PROJECTS[0].id;
let selectedGameTypeId = state.project?.gameTypeId || GAME_TYPES[0].id;
let landingOpen = true;
let activeStaffId = null;
let soundEnabled = true;
let audioContext = null;
let resultCloseHandler = null;

function SaveState() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch {
    // The game remains playable when storage is unavailable.
  }
}

function PlayTone(kind = "tap") {
  if (!soundEnabled) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const profiles = {
      tap: [320, 0.045, "sine", 0.032],
      good: [620, 0.12, "sine", 0.05],
      warning: [180, 0.12, "triangle", 0.045],
      danger: [95, 0.2, "sawtooth", 0.045],
      release: [440, 0.42, "triangle", 0.055],
    };
    const [frequency, duration, type, volume] = profiles[kind] || profiles.tap;
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (kind === "release") oscillator.frequency.exponentialRampToValueAtTime(880, now + duration);
    else oscillator.frequency.exponentialRampToValueAtTime(Math.max(60, frequency * 0.75), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  } catch {
    soundEnabled = false;
  }
}

function ShowToast(message, tone = "normal") {
  const item = document.createElement("div");
  item.className = `toastItem ${tone}`;
  item.textContent = message;
  dom.toastStack.append(item);
  window.setTimeout(() => item.remove(), 3100);
}

function ApplyResult(result, tone = "normal") {
  state = result.state;
  SaveState();
  RenderAll();
  if (result.message) ShowToast(result.message, result.ok ? tone : "warning");
  PlayTone(result.ok ? (tone === "danger" ? "danger" : "tap") : "warning");
  return result.ok;
}

// Three.js office scene -------------------------------------------------------

const renderer = new THREE.WebGLRenderer({
  canvas: dom.sceneCanvas,
  antialias: true,
  alpha: false,
  powerPreference: "high-performance",
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0d19);
scene.fog = new THREE.FogExp2(0x0a0d19, 0.025);

const camera = new THREE.OrthographicCamera(-10, 10, 7, -7, 0.1, 80);
camera.position.set(10.5, 12.6, 14.2);
camera.lookAt(0, 0.4, -0.5);

const roomGroup = new THREE.Group();
const staffGroup = new THREE.Group();
const tensionGroup = new THREE.Group();
const celebrationGroup = new THREE.Group();
scene.add(roomGroup, staffGroup, tensionGroup, celebrationGroup);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2(0, 0);
const pointerTarget = new THREE.Vector2(0, 0);
const clock = new THREE.Clock();
const staffInteractiveObjects = [];
const staticInteractiveObjects = [];
const staffVisuals = new Map();
const moduleVisuals = new Map();
const celebrationParticles = [];
let billboardTexture = null;
let pointerDownPosition = null;
let hoveredStaffId = null;
let terminalLabel = null;
const terminalLabelPosition = new THREE.Vector3(0, 2.72, 4.18);
const terminalHistory = new Map();

const stationSlots = [
  { moduleKey: "art", position: new THREE.Vector3(-4.7, 0, -2.3), rotation: 0.07 },
  { moduleKey: "design", position: new THREE.Vector3(-1.65, 0, -2.72), rotation: 0.025 },
  { moduleKey: "client", position: new THREE.Vector3(1.65, 0, -2.72), rotation: -0.025 },
  { moduleKey: "performance", position: new THREE.Vector3(4.7, 0, -2.3), rotation: -0.07 },
];

const towerPositions = {
  art: new THREE.Vector3(-4.75, 0.5, -5.18),
  design: new THREE.Vector3(-1.6, 0.5, -5.18),
  client: new THREE.Vector3(1.6, 0.5, -5.18),
  performance: new THREE.Vector3(4.75, 0.5, -5.18),
};

function HexColor(value) {
  return Number.parseInt(value.replace("#", ""), 16);
}

function Box(width, height, depth, color, options = {}) {
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: options.roughness ?? 0.72,
    metalness: options.metalness ?? 0.08,
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    transparent: Boolean(options.transparent),
    opacity: options.opacity ?? 1,
  });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  return mesh;
}

function Cylinder(radiusTop, radiusBottom, height, color, radialSegments = 12) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments),
    new THREE.MeshStandardMaterial({ color, roughness: 0.68, metalness: 0.06 }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function MakeTextTexture(lines, foreground = "#ffffff", background = "rgba(0,0,0,0)", width = 512, height = 160) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);
  context.textAlign = "center";
  context.textBaseline = "middle";
  const content = Array.isArray(lines) ? lines : [lines];
  content.forEach((line, index) => {
    const isFirst = index === 0;
    context.font = `${isFirst ? 900 : 600} ${isFirst ? 52 : 25}px "Microsoft YaHei UI", sans-serif`;
    context.fillStyle = isFirst ? foreground : "rgba(225,228,240,.72)";
    context.fillText(line, width / 2, content.length === 1 ? height / 2 : (index === 0 ? height * 0.38 : height * 0.7));
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

function AddTextPlane(parent, text, position, size, color = "#ffffff") {
  const texture = MakeTextTexture(text, color, "rgba(0,0,0,0)", 512, 128);
  const material = new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size * 0.25), material);
  mesh.position.copy(position);
  parent.add(mesh);
  return { mesh, texture };
}

function BuildRoom() {
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(16, 12),
    new THREE.MeshStandardMaterial({ color: 0x181b28, roughness: 0.92, metalness: 0.02 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = -0.2;
  floor.receiveShadow = true;
  roomGroup.add(floor);

  const grid = new THREE.GridHelper(16, 16, 0x30364b, 0x222638);
  grid.position.y = 0.008;
  grid.position.z = -0.2;
  grid.material.opacity = 0.37;
  grid.material.transparent = true;
  roomGroup.add(grid);

  const rug = new THREE.Mesh(
    new THREE.PlaneGeometry(7.4, 3.6),
    new THREE.MeshStandardMaterial({ color: 0x27263c, roughness: 0.95 }),
  );
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.012, 1.8);
  rug.receiveShadow = true;
  roomGroup.add(rug);

  const backWall = Box(16, 5.8, 0.25, 0x111523, { castShadow: false });
  backWall.position.set(0, 2.9, -5.78);
  roomGroup.add(backWall);
  const leftWall = Box(0.25, 5.8, 12, 0x0e1220, { castShadow: false });
  leftWall.position.set(-7.88, 2.9, -0.1);
  roomGroup.add(leftWall);

  const trim = Box(15.8, 0.1, 0.12, 0x46425f, { emissive: 0x5b4fd0, emissiveIntensity: 0.35, castShadow: false });
  trim.position.set(0, 4.95, -5.6);
  roomGroup.add(trim);

  const windowFrame = Box(5.4, 2.05, 0.12, 0x080b13, { castShadow: false });
  windowFrame.position.set(0, 3.55, -5.58);
  roomGroup.add(windowFrame);
  const windowGlass = new THREE.Mesh(
    new THREE.PlaneGeometry(5.05, 1.75),
    new THREE.MeshBasicMaterial({ color: 0x172948, transparent: true, opacity: 0.78, toneMapped: false }),
  );
  windowGlass.position.set(0, 3.55, -5.505);
  roomGroup.add(windowGlass);
  for (let index = 0; index < 11; index += 1) {
    const width = 0.22 + (index % 3) * 0.12;
    const height = 0.35 + ((index * 7) % 5) * 0.13;
    const building = Box(width, height, 0.08, index % 2 ? 0x1d3151 : 0x273b60, { castShadow: false, receiveShadow: false });
    building.position.set(-2.25 + index * 0.45, 2.73 + height / 2, -5.43);
    roomGroup.add(building);
    const light = Box(0.04, 0.04, 0.015, index % 3 ? 0xffd27a : 0x7abfff, { emissive: index % 3 ? 0xffc45f : 0x5faaff, emissiveIntensity: 1.6, castShadow: false });
    light.position.set(building.position.x, building.position.y, -5.375);
    roomGroup.add(light);
  }

  const signFrame = Box(5.2, 0.94, 0.1, 0x0b0e19, { castShadow: false });
  signFrame.position.set(0, 5.2, -5.5);
  roomGroup.add(signFrame);
  const texture = MakeTextTexture(["甲方是我", "BUILD · BORROW · SURVIVE"], "#d8d3ff", "#0b0e19", 1024, 180);
  billboardTexture = texture;
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(5, 0.88),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
  );
  sign.position.set(0, 5.2, -5.44);
  roomGroup.add(sign);

  const door = Box(1.7, 3.8, 0.16, 0x242637, { castShadow: false });
  door.position.set(6.6, 1.9, -5.56);
  roomGroup.add(door);
  const doorLight = Box(0.56, 0.12, 0.04, 0x74e4aa, { emissive: 0x68e0a0, emissiveIntensity: 0.8, castShadow: false });
  doorLight.position.set(6.6, 4.08, -5.44);
  roomGroup.add(doorLight);

  stationSlots.forEach((slot) => BuildStation(slot));
  MODULE_KEYS.forEach((moduleKey) => BuildModuleTower(moduleKey));
  BuildMeetingArea();
  BuildOwnerDesk();

  const ambient = new THREE.HemisphereLight(0xa7b6ff, 0x2a1c36, 1.35);
  scene.add(ambient);
  const keyLight = new THREE.DirectionalLight(0xd8ddff, 2.1);
  keyLight.position.set(5, 11, 8);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(1024, 1024);
  keyLight.shadow.camera.left = -10;
  keyLight.shadow.camera.right = 10;
  keyLight.shadow.camera.top = 8;
  keyLight.shadow.camera.bottom = -8;
  scene.add(keyLight);
  const pinkLight = new THREE.PointLight(0xff6eae, 3.2, 10, 2);
  pinkLight.position.set(-5, 3.2, 1.8);
  scene.add(pinkLight);
  const blueLight = new THREE.PointLight(0x66b8ff, 3.4, 10, 2);
  blueLight.position.set(5, 3, -0.4);
  scene.add(blueLight);
}

function BuildStation(slot) {
  const meta = MODULE_META[slot.moduleKey];
  const color = HexColor(meta.color);
  const group = new THREE.Group();
  group.position.copy(slot.position);
  group.rotation.y = slot.rotation;

  const desk = Box(2.45, 0.12, 1.12, 0x3b3545, { roughness: 0.82 });
  desk.position.y = 1.05;
  group.add(desk);
  for (const x of [-0.93, 0.93]) {
    const leg = Box(0.11, 1, 0.11, 0x242533, { metalness: 0.45 });
    leg.position.set(x, 0.52, 0);
    group.add(leg);
  }

  const monitor = Box(0.94, 0.62, 0.09, 0x0a0c13, { roughness: 0.35, metalness: 0.4 });
  monitor.position.set(0.18, 1.49, -0.27);
  group.add(monitor);
  const screen = Box(0.79, 0.46, 0.015, color, { emissive: color, emissiveIntensity: 0.82, castShadow: false });
  screen.position.set(0.18, 1.49, -0.218);
  group.add(screen);
  const stand = Box(0.07, 0.29, 0.07, 0x272936, { metalness: 0.4 });
  stand.position.set(0.18, 1.18, -0.25);
  group.add(stand);
  const keyboard = Box(0.75, 0.04, 0.27, 0x161823, { roughness: 0.55 });
  keyboard.position.set(0.1, 1.14, 0.16);
  group.add(keyboard);
  const mug = Cylinder(0.09, 0.09, 0.2, color, 12);
  mug.position.set(-0.75, 1.22, 0.12);
  group.add(mug);

  const chairSeat = Box(0.76, 0.12, 0.74, 0x292b3b);
  chairSeat.position.set(0, 0.66, 0.96);
  group.add(chairSeat);
  const chairBack = Box(0.76, 0.94, 0.12, 0x292b3b);
  chairBack.position.set(0, 1.09, 1.3);
  chairBack.rotation.x = -0.08;
  group.add(chairBack);
  const chairStem = Cylinder(0.055, 0.055, 0.58, 0x1c1e29, 10);
  chairStem.position.set(0, 0.33, 0.96);
  group.add(chairStem);

  const groundLight = Box(2.35, 0.025, 0.035, color, { emissive: color, emissiveIntensity: 1.35, castShadow: false, receiveShadow: false });
  groundLight.position.set(0, 0.026, 0.76);
  group.add(groundLight);
  roomGroup.add(group);
}

function BuildModuleTower(moduleKey) {
  const meta = MODULE_META[moduleKey];
  const color = HexColor(meta.color);
  const position = towerPositions[moduleKey];
  const group = new THREE.Group();
  group.position.copy(position);

  const frame = Box(2.48, 1.04, 0.14, 0x171b2a, { castShadow: false });
  frame.position.y = 0.84;
  group.add(frame);
  const inner = Box(2.25, 0.78, 0.04, 0x0a0d17, { castShadow: false });
  inner.position.set(0, 0.84, 0.09);
  group.add(inner);
  const progress = Box(0.12, 0.54, 0.055, color, { emissive: color, emissiveIntensity: 1, castShadow: false });
  progress.position.set(-0.98, 0.84, 0.13);
  group.add(progress);
  const bar = Box(1.7, 0.18, 0.05, color, { emissive: color, emissiveIntensity: 0.9, castShadow: false });
  bar.position.set(-0.08, 0.65, 0.13);
  bar.scale.x = 0.12;
  group.add(bar);
  const label = AddTextPlane(group, [meta.label, "12 / 100"], new THREE.Vector3(0.08, 0.94, 0.145), 1.75, meta.color);
  roomGroup.add(group);
  moduleVisuals.set(moduleKey, { group, bar, label, screen: inner });
}

function BuildMeetingArea() {
  const table = Cylinder(1.55, 1.55, 0.18, 0x373142, 32);
  table.position.set(0, 0.76, 1.65);
  table.castShadow = true;
  roomGroup.add(table);
  const tableStem = Cylinder(0.16, 0.34, 0.72, 0x20222e, 14);
  tableStem.position.set(0, 0.37, 1.65);
  roomGroup.add(tableStem);

  const papers = [
    [-0.55, 0.88, 1.55, -0.2, 0xff6eae],
    [0.15, 0.89, 1.15, 0.3, 0xffd166],
    [0.52, 0.89, 1.82, -0.45, 0x66b8ff],
  ];
  papers.forEach(([x, y, z, rotation, color]) => {
    const paper = Box(0.58, 0.018, 0.42, color, { castShadow: false });
    paper.position.set(x, y, z);
    paper.rotation.y = rotation;
    roomGroup.add(paper);
  });
}

function BuildOwnerDesk() {
  const desk = Box(3.1, 0.14, 0.96, 0x332d3d);
  desk.position.set(0, 1.02, 4.45);
  roomGroup.add(desk);
  for (const x of [-1.2, 1.2]) {
    const leg = Box(0.12, 0.95, 0.12, 0x20222e, { metalness: 0.4 });
    leg.position.set(x, 0.52, 4.45);
    roomGroup.add(leg);
  }
  const monitor = Box(1.35, 0.8, 0.09, 0x080a11, { roughness: 0.35 });
  monitor.position.set(0, 1.58, 4.18);
  roomGroup.add(monitor);
  const screen = Box(1.18, 0.63, 0.018, 0x8d7cff, { emissive: 0x8d7cff, emissiveIntensity: 0.8, castShadow: false });
  screen.position.set(0, 1.58, 4.128);
  screen.userData.terminal = true;
  staticInteractiveObjects.push(screen);
  roomGroup.add(screen);
  const owner = BuildHumanVisual({ color: "#8d7cff", name: "你", id: "owner" });
  owner.position.set(0, 0, 5.38);
  owner.rotation.y = Math.PI;
  owner.scale.setScalar(1.04);
  roomGroup.add(owner);
  const emptyWallet = Box(0.43, 0.07, 0.3, 0x8a4755);
  emptyWallet.position.set(-1.0, 1.14, 4.35);
  roomGroup.add(emptyWallet);
}

function MarkInteractive(group, staffId) {
  group.traverse((object) => {
    if (!object.isMesh) return;
    object.userData.staffId = staffId;
    staffInteractiveObjects.push(object);
  });
}

function BuildHumanVisual(staff) {
  const group = new THREE.Group();
  const color = typeof staff.color === "string" ? HexColor(staff.color) : staff.color;
  const shoes = Box(0.58, 0.16, 0.38, 0x171821);
  shoes.position.y = 0.1;
  group.add(shoes);
  const legs = Box(0.62, 0.65, 0.42, 0x24283a);
  legs.position.y = 0.48;
  group.add(legs);
  const torso = Box(0.86, 0.96, 0.5, color, { roughness: 0.78 });
  torso.position.y = 1.25;
  group.add(torso);
  const neck = Cylinder(0.13, 0.13, 0.2, 0xd4a480, 12);
  neck.position.y = 1.82;
  group.add(neck);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(0.36, 16, 12),
    new THREE.MeshStandardMaterial({ color: 0xe1b08b, roughness: 0.86 }),
  );
  head.position.y = 2.13;
  head.castShadow = true;
  group.add(head);
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(0.375, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.48),
    new THREE.MeshStandardMaterial({ color: staff.id === "owner" ? 0x161520 : 0x27222a, roughness: 0.95 }),
  );
  hair.position.y = 2.24;
  hair.rotation.x = -0.12;
  group.add(hair);
  for (const x of [-0.12, 0.12]) {
    const eye = new THREE.Mesh(
      new THREE.SphereGeometry(0.027, 8, 6),
      new THREE.MeshBasicMaterial({ color: 0x17131b }),
    );
    eye.position.set(x, 2.16, 0.337);
    group.add(eye);
  }
  return group;
}

function BuildAiVisual(staff) {
  const group = new THREE.Group();
  const color = HexColor(staff.color);
  const hoverRing = new THREE.Mesh(
    new THREE.TorusGeometry(0.47, 0.045, 8, 28),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.7, toneMapped: false }),
  );
  hoverRing.rotation.x = Math.PI / 2;
  hoverRing.position.y = 0.54;
  group.add(hoverRing);
  const body = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.52, 0),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.34, roughness: 0.32, metalness: 0.42 }),
  );
  body.position.y = 1.24;
  body.castShadow = true;
  group.add(body);
  const face = Box(0.48, 0.24, 0.07, 0x090b12, { roughness: 0.25, metalness: 0.3 });
  face.position.set(0, 1.27, 0.38);
  group.add(face);
  for (const x of [-0.12, 0.12]) {
    const eye = Box(0.07, 0.055, 0.02, color, { emissive: color, emissiveIntensity: 1.4, castShadow: false });
    eye.position.set(x, 1.29, 0.422);
    group.add(eye);
  }
  const antenna = Cylinder(0.025, 0.025, 0.42, 0x6f7485, 8);
  antenna.position.y = 1.83;
  antenna.rotation.z = 0.16;
  group.add(antenna);
  const tip = new THREE.Mesh(
    new THREE.SphereGeometry(0.08, 10, 8),
    new THREE.MeshBasicMaterial({ color, toneMapped: false }),
  );
  tip.position.set(-0.035, 2.04, 0);
  group.add(tip);
  return group;
}

function AssignTeamSlots() {
  const available = new Set(stationSlots.map((_, index) => index));
  return state.team.map((member) => {
    const staff = FindStaff(member.id);
    let slotIndex = stationSlots.findIndex((slot, index) => available.has(index) && slot.moduleKey === staff.specialty);
    if (slotIndex < 0) slotIndex = [...available][0];
    available.delete(slotIndex);
    return { member, staff, slotIndex };
  });
}

function RebuildStaffVisuals() {
  staffVisuals.clear();
  staffInteractiveObjects.length = 0;
  while (staffGroup.children.length) staffGroup.remove(staffGroup.children[0]);
  dom.sceneLabels.replaceChildren();
  terminalLabel = null;
  if (!state.project || state.status === "setup") return;

  terminalLabel = document.createElement("button");
  terminalLabel.type = "button";
  terminalLabel.className = "sceneTag terminalTag";
  terminalLabel.style.setProperty("--tagColor", "#a99eff");
  terminalLabel.innerHTML = '<span class="sceneTagDot"></span><span><strong>AI 群聊终端</strong><small>点击电脑，质问那些蠢货 AI</small></span>';
  terminalLabel.addEventListener("click", () => OpenAiTerminalSheet());
  dom.sceneLabels.append(terminalLabel);

  AssignTeamSlots().forEach(({ member, staff, slotIndex }, teamIndex) => {
    const slot = stationSlots[slotIndex];
    const visual = staff.kind === "ai" ? BuildAiVisual(staff) : BuildHumanVisual(staff);
    visual.position.copy(slot.position).add(new THREE.Vector3(0, 0, 0.95));
    visual.rotation.y = Math.PI + slot.rotation;
    visual.userData.staffId = staff.id;
    visual.userData.baseY = visual.position.y;
    visual.userData.phase = teamIndex * 1.7;
    staffGroup.add(visual);
    MarkInteractive(visual, staff.id);

    const label = document.createElement("button");
    label.type = "button";
    label.className = "sceneTag";
    label.style.setProperty("--tagColor", staff.color);
    label.innerHTML = `<span class="sceneTagDot"></span><span><strong>${EscapeHtml(staff.name)}</strong><small>${staff.kind === "ai" ? "点击调教上下文" : "点击进行绩效沟通"}</small></span>`;
    label.addEventListener("click", () => OpenConversation(staff.id));
    dom.sceneLabels.append(label);
    staffVisuals.set(staff.id, {
      group: visual,
      label,
      labelPosition: visual.position.clone().add(new THREE.Vector3(0, staff.kind === "ai" ? 2.35 : 2.75, 0)),
      member,
      staff,
    });
  });
}

function UpdateBillboard() {
  if (!billboardTexture) return;
  const canvas = billboardTexture.image;
  const context = canvas.getContext("2d");
  context.fillStyle = "#0b0e19";
  context.fillRect(0, 0, canvas.width, canvas.height);
  const project = state.project ? FindProject(state.project.templateId) : null;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillStyle = project ? project.accent : "#d8d3ff";
  context.font = '900 50px "Microsoft YaHei UI", sans-serif';
  context.fillText(project ? project.title : "甲方是我", canvas.width / 2, canvas.height * 0.38);
  context.fillStyle = "rgba(225,228,240,.68)";
  context.font = '600 24px "Microsoft YaHei UI", sans-serif';
  const subtitle = state.project?.isReleased
    ? `LIVE v${state.project.version}.0 · ${state.project.lastRating?.toFixed(1)} / 10`
    : state.project?.age > 0
      ? `BUILD · ${state.project.buildStatus?.label || "还在憋"}`
      : "BUILD · BORROW · SURVIVE";
  context.fillText(subtitle, canvas.width / 2, canvas.height * 0.72);
  billboardTexture.needsUpdate = true;
}

function UpdateModuleVisuals() {
  MODULE_KEYS.forEach((moduleKey) => {
    const visual = moduleVisuals.get(moduleKey);
    if (!visual) return;
    const value = state.project?.modules[moduleKey] ?? 12;
    visual.bar.scale.x = Clamp(value / 100, 0.035, 1);
    visual.bar.position.x = -0.93 + 0.85 * visual.bar.scale.x;
    const canvas = visual.label.texture.image;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.font = '900 52px "Microsoft YaHei UI", sans-serif';
    context.fillStyle = MODULE_META[moduleKey].color;
    context.fillText(MODULE_META[moduleKey].label, canvas.width / 2, canvas.height * 0.38);
    context.font = '600 25px "Microsoft YaHei UI", sans-serif';
    context.fillStyle = "rgba(225,228,240,.72)";
    context.fillText(`${Math.round(value)} / 100`, canvas.width / 2, canvas.height * 0.72);
    visual.label.texture.needsUpdate = true;
  });
}

function RebuildTensionLines() {
  while (tensionGroup.children.length) tensionGroup.remove(tensionGroup.children[0]);
  if (!state.project) return;
  CalculateTensions(state.project).slice(0, 5).forEach((tension, index) => {
    const start = towerPositions[tension.from]?.clone();
    const end = towerPositions[tension.to]?.clone();
    if (!start || !end) return;
    start.y = 1.25 + index * 0.03;
    end.y = 1.25 + index * 0.03;
    start.z = -5.01;
    end.z = -5.01;
    const middle = start.clone().lerp(end, 0.5);
    middle.y += 0.45 + Math.abs(end.x - start.x) * 0.06;
    const curve = new THREE.QuadraticBezierCurve3(start, middle, end);
    const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(28));
    const material = new THREE.LineBasicMaterial({
      color: tension.severity === "critical" ? 0xff6565 : tension.severity === "warning" ? 0xffc45f : 0xb197fc,
      transparent: true,
      opacity: tension.severity === "critical" ? 0.9 : 0.56,
      toneMapped: false,
    });
    const line = new THREE.Line(geometry, material);
    line.userData.phase = index * 0.8;
    tensionGroup.add(line);
  });
}

function UpdateSceneFromState(rebuildStaff = true) {
  if (rebuildStaff) RebuildStaffVisuals();
  UpdateModuleVisuals();
  RebuildTensionLines();
  UpdateBillboard();
}

function SpawnCelebration(color = "#8d7cff") {
  const numericColor = HexColor(color);
  for (let index = 0; index < 42; index += 1) {
    const particle = Box(0.08 + Math.random() * 0.1, 0.08 + Math.random() * 0.18, 0.05, numericColor, { castShadow: false });
    particle.material.emissive.setHex(numericColor);
    particle.material.emissiveIntensity = 0.7;
    particle.position.set((Math.random() - 0.5) * 2, 1.4 + Math.random(), 1.4 + (Math.random() - 0.5) * 1.5);
    particle.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    particle.userData.velocity = new THREE.Vector3((Math.random() - 0.5) * 3.8, 2.4 + Math.random() * 2.4, (Math.random() - 0.5) * 3.5);
    particle.userData.life = 1.8 + Math.random() * 0.8;
    celebrationGroup.add(particle);
    celebrationParticles.push(particle);
  }
}

function UpdateLabels() {
  const width = renderer.domElement.clientWidth;
  const height = renderer.domElement.clientHeight;
  staffVisuals.forEach((visual) => {
    const projected = visual.labelPosition.clone();
    projected.y += visual.staff.kind === "ai" ? Math.sin(clock.elapsedTime * 1.8 + visual.group.userData.phase) * 0.08 : 0;
    projected.project(camera);
    const x = (projected.x * 0.5 + 0.5) * width;
    const y = (-projected.y * 0.5 + 0.5) * height;
    const visible = projected.z > -1 && projected.z < 1 && x > -80 && x < width + 80 && y > 10 && y < height + 50;
    visual.label.style.left = `${x}px`;
    visual.label.style.top = `${y}px`;
    visual.label.style.opacity = visible ? "1" : "0";
    visual.label.style.pointerEvents = visible ? "auto" : "none";
  });
  if (terminalLabel) {
    const projected = terminalLabelPosition.clone().project(camera);
    const x = (projected.x * 0.5 + 0.5) * width;
    const y = (-projected.y * 0.5 + 0.5) * height;
    terminalLabel.style.left = `${x}px`;
    terminalLabel.style.top = `${y}px`;
    terminalLabel.style.opacity = projected.z > -1 && projected.z < 1 ? "1" : "0";
  }
}

function ResizeScene() {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  renderer.setSize(width, height, false);
  const aspect = width / height;
  const viewHeight = height < 610 ? 10.7 : 12.8;
  camera.left = -viewHeight * aspect * 0.5;
  camera.right = viewHeight * aspect * 0.5;
  camera.top = viewHeight * 0.5;
  camera.bottom = -viewHeight * 0.5;
  camera.updateProjectionMatrix();
}

function FindTargetFromIntersection(intersection) {
  let object = intersection?.object;
  while (object) {
    if (object.userData.staffId) return { staffId: object.userData.staffId, terminal: false };
    if (object.userData.terminal) return { staffId: null, terminal: true };
    object = object.parent;
  }
  return null;
}

function UpdatePointerFromEvent(event) {
  const rect = dom.sceneCanvas.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  pointerTarget.set(pointer.x, pointer.y);
}

function RaycastTarget() {
  raycaster.setFromCamera(pointer, camera);
  const intersections = raycaster.intersectObjects([...staffInteractiveObjects, ...staticInteractiveObjects], false);
  return FindTargetFromIntersection(intersections[0]);
}

function Animate() {
  requestAnimationFrame(Animate);
  const delta = Math.min(clock.getDelta(), 0.05);
  const time = clock.elapsedTime;

  staffVisuals.forEach((visual) => {
    if (visual.staff.kind === "ai") {
      visual.group.position.y = visual.group.userData.baseY + Math.sin(time * 1.8 + visual.group.userData.phase) * 0.09;
      visual.group.rotation.y += delta * 0.18;
    } else {
      visual.group.rotation.z = Math.sin(time * 1.25 + visual.group.userData.phase) * 0.012;
    }
  });
  tensionGroup.children.forEach((line, index) => {
    line.material.opacity = 0.42 + Math.sin(time * 2.2 + index) * 0.18;
  });
  for (let index = celebrationParticles.length - 1; index >= 0; index -= 1) {
    const particle = celebrationParticles[index];
    particle.userData.life -= delta;
    particle.userData.velocity.y -= 5.2 * delta;
    particle.position.addScaledVector(particle.userData.velocity, delta);
    particle.rotation.x += delta * 3;
    particle.rotation.z += delta * 2;
    if (particle.userData.life <= 0 || particle.position.y < 0) {
      celebrationGroup.remove(particle);
      celebrationParticles.splice(index, 1);
    }
  }

  const cameraOffsetX = pointerTarget.x * 0.32;
  const cameraOffsetY = pointerTarget.y * 0.16;
  camera.position.x += (10.5 + cameraOffsetX - camera.position.x) * 0.035;
  camera.position.y += (12.6 + cameraOffsetY - camera.position.y) * 0.035;
  camera.lookAt(0, 0.45, -0.5);
  UpdateLabels();
  renderer.render(scene, camera);
}

BuildRoom();
ResizeScene();
Animate();

window.addEventListener("resize", ResizeScene);
window.addEventListener("orientationchange", () => window.setTimeout(ResizeScene, 180));
dom.sceneCanvas.addEventListener("pointerdown", (event) => {
  UpdatePointerFromEvent(event);
  pointerDownPosition = { x: event.clientX, y: event.clientY };
});
dom.sceneCanvas.addEventListener("pointermove", (event) => {
  UpdatePointerFromEvent(event);
  const target = RaycastTarget();
  const targetKey = target?.terminal ? "terminal" : target?.staffId || null;
  if (targetKey !== hoveredStaffId) {
    hoveredStaffId = targetKey;
    dom.sceneCanvas.style.cursor = targetKey ? "pointer" : "grab";
  }
});
dom.sceneCanvas.addEventListener("pointerup", (event) => {
  UpdatePointerFromEvent(event);
  if (!pointerDownPosition) return;
  const distance = Math.hypot(event.clientX - pointerDownPosition.x, event.clientY - pointerDownPosition.y);
  pointerDownPosition = null;
  if (distance > 7 || state.status !== "playing") return;
  const target = RaycastTarget();
  if (target?.staffId) OpenConversation(target.staffId);
  else if (target?.terminal) OpenAiTerminalSheet();
});

// UI rendering and interaction ------------------------------------------------

function RenderSetupChoices() {
  dom.projectChoices.innerHTML = PROJECTS.map((project) => `
    <button type="button" class="choiceCard ${selectedProjectId === project.id ? "selected" : ""}" data-project-choice="${project.id}" style="--choiceColor:${project.accent}">
      <strong>${EscapeHtml(project.title)}</strong>
      <p>${EscapeHtml(project.pitch)}</p>
      <small>${EscapeHtml(project.trend)}</small>
    </button>
  `).join("");
  dom.typeChoices.innerHTML = GAME_TYPES.map((gameType) => `
    <button type="button" class="choiceCard ${selectedGameTypeId === gameType.id ? "selected" : ""}" data-type-choice="${gameType.id}" style="--choiceColor:${gameType.accent}">
      <strong>${gameType.icon} ${EscapeHtml(gameType.name)}</strong>
      <p>${EscapeHtml(gameType.description)}</p>
      <small>${EscapeHtml(gameType.warning)}</small>
    </button>
  `).join("");
  dom.projectChoices.querySelectorAll("[data-project-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedProjectId = button.dataset.projectChoice;
      RenderSetupChoices();
      PlayTone("tap");
    });
  });
  dom.typeChoices.querySelectorAll("[data-type-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedGameTypeId = button.dataset.typeChoice;
      RenderSetupChoices();
      PlayTone("tap");
    });
  });
  const hasRun = state.status !== "setup" && Boolean(state.project);
  dom.continueButton.classList.toggle("hidden", !hasRun);
  if (hasRun) {
    const project = FindProject(state.project.templateId);
    dom.continueButton.textContent = `继续上一次融资事故 · M${String(state.month).padStart(2, "0")} · ${project.title}`;
  }
}

function EstimatedLiveIncome() {
  if (!state.project?.isReleased) return 0;
  const gameType = FindGameType(state.project.gameTypeId);
  return Math.round(state.project.monthlyRevenue * Math.pow(gameType.liveDecay, state.project.monthsSinceUpdate) / 100) * 100;
}

function ModuleStatusText(moduleKey, value) {
  const teamCount = state.team.filter((member) => FindStaff(member.id)?.specialty === moduleKey).length;
  if (value >= 82) return teamCount ? `${teamCount} 人 · 接近成片` : "无人维护 · 靠惯性";
  if (value >= 58) return teamCount ? `${teamCount} 人 · 可玩构建` : "无人维护 · 风险中";
  if (value >= 32) return teamCount ? `${teamCount} 人 · 正在施工` : "空工位 · 老板兼任";
  return teamCount ? `${teamCount} 人 · 刚建文件夹` : "空工位 · 只有愿景";
}

function RenderModules() {
  if (!state.project) {
    dom.moduleGrid.innerHTML = MODULE_KEYS.map((moduleKey) => {
      const meta = MODULE_META[moduleKey];
      return `<div class="moduleRow" style="--moduleColor:${meta.color}">
        <div class="moduleTop"><span class="moduleName"><i>${meta.icon}</i>${meta.label}</span><strong>12</strong></div>
        <div class="moduleTrack"><i style="width:12%"></i></div>
        <div class="moduleNote"><span>等待立项</span><span>12 / 100</span></div>
      </div>`;
    }).join("");
    return;
  }
  dom.moduleGrid.innerHTML = MODULE_KEYS.map((moduleKey) => {
    const meta = MODULE_META[moduleKey];
    const value = state.project.modules[moduleKey];
    return `<div class="moduleRow" style="--moduleColor:${meta.color}">
      <div class="moduleTop"><span class="moduleName"><i>${meta.icon}</i>${meta.label}</span><strong>${Math.round(value)}</strong></div>
      <div class="moduleTrack"><i style="width:${Clamp(value, 0, 100)}%"></i></div>
      <div class="moduleNote"><span>${EscapeHtml(ModuleStatusText(moduleKey, value))}</span><span>${Math.round(value)} / 100</span></div>
    </div>`;
  }).join("");
}

function RenderTensions() {
  if (!state.project) {
    dom.tensionList.innerHTML = '<div class="emptyTension">四组还没开始互相甩锅。</div>';
    dom.debtValue.textContent = "范围债 0 · 技术债 0";
    return;
  }
  const tensions = CalculateTensions(state.project);
  dom.debtValue.textContent = `范围债 ${Math.round(state.project.scopeDebt)} · 技术债 ${Math.round(state.project.technicalDebt)}`;
  dom.tensionList.innerHTML = tensions.length
    ? tensions.slice(0, 3).map((tension) => `
      <div class="tensionItem ${tension.severity}">
        <strong>${EscapeHtml(tension.title)}</strong>
        <p>${EscapeHtml(tension.description)}</p>
      </div>
    `).join("")
    : '<div class="emptyTension">难得：四组做的是同一款游戏。</div>';
}

function RenderFinance() {
  const costs = ForecastMonthlyCosts(state);
  const income = EstimatedLiveIncome();
  const projected = state.cash + income - costs.total;
  dom.costBreakdown.innerHTML = [
    ["生活与硬账单", costs.living],
    ["大学生工资", costs.studentWages],
    ["AI 月租", costs.aiRent],
    ["贷款月供", costs.loanPayments],
    ["服务器", costs.service],
  ].filter(([, value], index) => value > 0 || index < 3).map(([label, value]) => `
    <div class="costRow"><span>${label}</span><strong>−${FormatMoney(value)}</strong></div>
  `).join("");
  dom.forecastValue.textContent = FormatMoney(projected);
  dom.forecastValue.classList.toggle("negative", projected < 0);
  dom.hungerValue.textContent = Math.round(state.hunger);
  dom.hungerBar.style.width = `${state.hunger}%`;
  dom.teamCount.textContent = `${state.team.length} / 4`;
  dom.teamMiniList.innerHTML = state.team.length ? state.team.map((member) => {
    const staff = FindStaff(member.id);
    const condition = staff.kind === "ai" ? 100 - member.drift : member.morale;
    const conditionLabel = staff.kind === "ai" ? `稳${Math.round(condition)}` : `心${Math.round(condition)}`;
    return `<button type="button" class="teamMini" data-team-member="${staff.id}" style="--staffColor:${staff.color}">
      <span class="teamAvatar">${EscapeHtml(staff.portrait)}</span>
      <div><strong>${EscapeHtml(staff.name)}</strong><small>${EscapeHtml(staff.role)}</small></div>
      <span class="teamCondition">${conditionLabel}</span>
    </button>`;
  }).join("") : '<div class="teamEmpty">还没雇人。老板目前兼任四组、财务和保洁。</div>';
  dom.teamMiniList.querySelectorAll("[data-team-member]").forEach((button) => {
    button.addEventListener("click", () => OpenConversation(button.dataset.teamMember));
  });
}

function RenderProjectHeader() {
  if (!state.project) {
    dom.gameTypeBadge.textContent = "尚未立项";
    dom.projectTitle.textContent = "商业计划书加载中";
    dom.versionBadge.textContent = "DEV";
    dom.projectPitch.textContent = "先选一个足够荒唐、又似乎能卖钱的点子。";
    return;
  }
  const project = FindProject(state.project.templateId);
  const gameType = FindGameType(state.project.gameTypeId);
  dom.gameTypeBadge.textContent = `${gameType.icon} ${gameType.name}`;
  dom.gameTypeBadge.style.borderColor = `${gameType.accent}66`;
  dom.gameTypeBadge.style.color = gameType.accent;
  dom.projectTitle.textContent = project.title;
  const estimate = state.project.age > 0 ? EvaluateProject(state).rating.toFixed(1) : null;
  dom.versionBadge.textContent = state.project.isReleased
    ? `LIVE v${state.project.version}.0 · ${state.project.lastRating?.toFixed(1)}`
    : estimate
      ? `DEV · 预估 ${estimate}`
      : "DEV";
  dom.projectPitch.textContent = project.pitch;
}

function RenderTopBar() {
  const costs = ForecastMonthlyCosts(state);
  const income = EstimatedLiveIncome();
  dom.monthValue.textContent = `M${String(state.month).padStart(2, "0")}`;
  dom.cashValue.textContent = FormatMoney(state.cash);
  const netBurn = costs.total - income;
  dom.burnValue.textContent = `${netBurn >= 0 ? "−" : "+"}${FormatMoney(Math.abs(netBurn))}`;
  const goal = state.revenueGoal || 10000000000;
  const gameRevenue = state.gameRevenue || 0;
  dom.ratingValue.textContent = `${FormatGoalMoney(gameRevenue)} / 100 亿元`;
  const goalProgress = gameRevenue / goal * 100;
  dom.goalBar.style.width = `${Clamp(goalProgress, 0, 100)}%`;
}

function RenderActions() {
  const directive = FindDirective(state.selectedDirective);
  dom.directiveLabel.textContent = directive?.name || "四组联调";
  const canRelease = state.status === "playing"
    && state.project
    && state.project.age >= 2
    && state.project.lastReleaseMonth !== state.month;
  dom.releaseButton.disabled = !canRelease;
  dom.nextMonthButton.disabled = state.status !== "playing";
  dom.talentButton.disabled = state.status !== "playing";
  dom.directiveButton.disabled = state.status !== "playing";
  dom.releaseLabel.textContent = state.project?.isReleased ? `发布 v${state.project.version + 1}.0` : "上线游戏";
}

function RenderEnding() {
  const visible = !landingOpen && ["ended", "gameover"].includes(state.status);
  dom.endingScreen.classList.toggle("hidden", !visible);
  if (!visible) return;
  const outcome = state.outcome || { title: "本局结束", subtitle: "电脑尚未对此发表评论。" };
  dom.endingTitle.textContent = outcome.title;
  dom.endingSubtitle.textContent = outcome.subtitle;
  dom.endingStats.innerHTML = [
    ["累计游戏收入", FormatGoalMoney(state.gameRevenue || 0)],
    ["最高评分", state.bestRating ? state.bestRating.toFixed(1) : "—"],
    ["最终现金", FormatMoney(state.cash)],
    ["创业月份", `M${state.month}`],
  ].map(([label, value]) => `<div class="endingStat"><span>${label}</span><strong>${value}</strong></div>`).join("");
}

function RenderAll(options = {}) {
  const rebuildStaff = options.rebuildStaff ?? true;
  dom.setupScreen.classList.toggle("hidden", !landingOpen);
  RenderSetupChoices();
  RenderTopBar();
  RenderProjectHeader();
  RenderModules();
  RenderTensions();
  RenderFinance();
  RenderActions();
  RenderEnding();
  const hintText = dom.worldHint.querySelector("span:last-child");
  if (hintText) {
    hintText.textContent = state.project?.age > 0
      ? `当前构建：${state.project.buildStatus?.label || "还在憋"} · 点击员工继续施压`
      : "点击工位上的人，亲自画饼或互怼";
  }
  UpdateSceneFromState(rebuildStaff);
  SaveState();
}

function StartNewRun() {
  const fresh = CreateInitialState();
  const result = StartProject(fresh, selectedProjectId, selectedGameTypeId);
  state = result.state;
  landingOpen = false;
  SaveState();
  RenderAll();
  PlayTone("good");
  ShowToast("立项成功。先雇人，再决定这个月往哪边失控。", "good");
}

function ContinueRun() {
  landingOpen = false;
  RenderAll();
  PlayTone("tap");
}

function ResetRun() {
  state = CreateInitialState();
  selectedProjectId = PROJECTS[0].id;
  selectedGameTypeId = GAME_TYPES[0].id;
  landingOpen = true;
  activeStaffId = null;
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ }
  CloseSheet();
  CloseConversation();
  CloseResult();
  RenderAll();
}

function OpenSheet(kicker, title, html) {
  dom.sheetKicker.textContent = kicker;
  dom.sheetTitle.textContent = title;
  dom.sheetBody.innerHTML = html;
  dom.modalLayer.classList.remove("hidden");
  PlayTone("tap");
}

function CloseSheet() {
  dom.modalLayer.classList.add("hidden");
}

function OutputDotHtml(staff, moduleKey) {
  const value = staff.output[moduleKey] || 0;
  const sign = value > 0 ? "+" : "";
  return `<div class="outputDot" style="--dotColor:${MODULE_META[moduleKey].color}">${MODULE_META[moduleKey].shortLabel}<strong>${sign}${value}</strong></div>`;
}

function OpenTalentSheet() {
  const cards = STAFF_CATALOG.map((staff) => {
    const member = state.team.find((candidate) => candidate.id === staff.id);
    const teamFull = state.team.length >= 4 && !member;
    const employment = staff.kind === "ai" ? "AI 月租" : "大学生工资";
    const action = member
      ? `<button type="button" class="smallDangerButton" data-fire="${staff.id}">${staff.kind === "ai" ? "取消订阅" : "解除雇用"}</button>`
      : `<button type="button" class="actionButton" data-hire="${staff.id}" ${teamFull ? "disabled" : ""}>${teamFull ? "工位已满" : staff.kind === "ai" ? "开始租用" : "发 Offer"}</button>`;
    return `<article class="staffCard ${member ? "hired" : ""}" style="--staffColor:${staff.color}">
      <div class="staffTop">
        <span class="staffPortrait">${EscapeHtml(staff.portrait)}</span>
        <div><h3>${EscapeHtml(staff.name)}</h3><p>${EscapeHtml(staff.role)}</p></div>
        <span class="employmentBadge">${employment}</span>
      </div>
      <p class="staffTagline">${EscapeHtml(staff.tagline)}<br><b>怪癖：</b>${EscapeHtml(staff.quirk)}</p>
      <div class="outputDots">${MODULE_KEYS.map((moduleKey) => OutputDotHtml(staff, moduleKey)).join("")}</div>
      <div class="staffBottom">
        <div class="staffPrice"><strong>${FormatMoney(staff.monthlyCost)} / 月</strong><small>${staff.kind === "ai" ? "每月自动续费" : "月底必须发薪"}</small></div>
        ${action}
      </div>
    </article>`;
  }).join("");
  OpenSheet("TALENT MARKET", "人才与算力市场", `
    <div class="sheetIntro"><span>只有 4 张工位。<strong>大学生拿工资，AI 收月租</strong>；两者断供都不会留下来陪你追梦。</span><span>${state.team.length} / 4</span></div>
    <div class="catalogGrid">${cards}</div>
  `);
  dom.sheetBody.querySelectorAll("[data-hire]").forEach((button) => {
    button.addEventListener("click", () => {
      const result = HireStaff(state, button.dataset.hire);
      if (ApplyResult(result, "good")) OpenTalentSheet();
    });
  });
  dom.sheetBody.querySelectorAll("[data-fire]").forEach((button) => {
    button.addEventListener("click", () => {
      const result = FireStaff(state, button.dataset.fire);
      if (ApplyResult(result, "warning")) OpenTalentSheet();
    });
  });
}

function OpenDirectiveSheet() {
  const currentTensions = state.project ? CalculateTensions(state.project) : [];
  const warning = currentTensions[0]?.title || "当前没有明显失衡，可以放心制造新的失衡。";
  const cards = DIRECTIVES.map((directive) => `
    <button type="button" class="directiveCard ${state.selectedDirective === directive.id ? "selected" : ""}" data-directive="${directive.id}" style="--directiveColor:${directive.color}">
      <span class="directiveIcon">${directive.icon}</span>
      <span><strong>${EscapeHtml(directive.name)}</strong><p>${EscapeHtml(directive.description)}</p></span>
      <span class="directiveCheck">${state.selectedDirective === directive.id ? "✓" : ""}</span>
    </button>
  `).join("");
  OpenSheet("MONTHLY FOCUS", "本月制作策略", `
    <div class="sheetIntro"><span>策略在<strong>进入下月</strong>时生效。当前头号问题：${EscapeHtml(warning)}</span><span>每月 1 项</span></div>
    <div class="directiveList">${cards}</div>
  `);
  dom.sheetBody.querySelectorAll("[data-directive]").forEach((button) => {
    button.addEventListener("click", () => {
      const result = SelectDirective(state, button.dataset.directive);
      if (ApplyResult(result, "good")) {
        ShowToast(result.message, "good");
        OpenDirectiveSheet();
      }
    });
  });
}

function CostTableRows(costs) {
  const rows = LIVING_BILLS.map((bill) => [bill.icon, bill.label, bill.amount]);
  state.team.forEach((member) => {
    const staff = FindStaff(member.id);
    rows.push([staff.kind === "ai" ? "AI" : "人", `${staff.name} · ${staff.kind === "ai" ? "月租" : "工资"}`, staff.monthlyCost]);
  });
  state.loans.filter((loan) => loan.status === "active").forEach((loan) => {
    rows.push(["¥", `${FindCollateral(loan.collateralId).name} · 月供（余 ${loan.remaining} 期）`, loan.monthlyPayment]);
  });
  if (costs.service > 0) rows.push(["◎", `${FindGameType(state.project.gameTypeId).name} · 服务器`, costs.service]);
  return rows.map(([icon, label, amount]) => `<div class="costRow"><span>${icon} ${EscapeHtml(label)}</span><strong>−${FormatMoney(amount)}</strong></div>`).join("");
}

function AssetStatusText(assetId) {
  const status = state.assets[assetId];
  if (status === "free") return "可抵押";
  if (status === "pledged") return "抵押中";
  if (status === "seized") return "已被收走";
  return status;
}

function OpenFinanceSheet() {
  const costs = ForecastMonthlyCosts(state);
  const income = EstimatedLiveIncome();
  const runway = costs.total > 0 ? Math.max(0, state.cash / Math.max(1, costs.total - income)) : 99;
  const loanCards = COLLATERAL_OPTIONS.map((asset) => {
    const available = state.assets[asset.id] === "free" && state.status === "playing";
    return `<article class="loanCard ${asset.fatal ? "fatal" : ""}">
      <div class="loanTitle"><span class="loanIcon">${asset.icon}</span><strong>${EscapeHtml(asset.name)}</strong><span class="loanState">${AssetStatusText(asset.id)}</span></div>
      <p>${EscapeHtml(asset.consequence)}。借 ${FormatMoney(asset.principal)}，${asset.term} 期 × ${FormatMoney(asset.monthlyPayment)}。</p>
      <div class="loanBottom">
        <div class="loanPrice"><strong>到账 ${FormatMoney(asset.principal)}</strong><small>违约立即处置抵押物</small></div>
        <button type="button" class="actionButton" data-loan="${asset.id}" ${available ? "" : "disabled"}>${asset.fatal ? "抵押并结束" : "抵押借款"}</button>
      </div>
    </article>`;
  }).join("");
  const logs = state.log.length ? state.log.slice(0, 10).map((entry) => `
    <div class="logItem ${entry.tone}"><span>M${String(entry.month).padStart(2, "0")}</span><div>${EscapeHtml(entry.text)}</div></div>
  `).join("") : '<div class="teamEmpty">账本还很干净，像暴风雨前的新建表格。</div>';
  OpenSheet("CASH FLOW", "账单、流水与抵押", `
    <div class="financeSummaryGrid">
      <div class="summaryTile good"><span>当前现金</span><strong>${FormatMoney(state.cash)}</strong></div>
      <div class="summaryTile danger"><span>每月净燃烧</span><strong>${FormatMoney(Math.max(0, costs.total - income))}</strong></div>
      <div class="summaryTile"><span>预计跑道</span><strong>${Number.isFinite(runway) ? runway.toFixed(1) : "∞"} 月</strong></div>
    </div>
    <div class="financeSectionTitle"><strong>下月账单</strong><span>合计 −${FormatMoney(costs.total)} · 预估流水 +${FormatMoney(income)}</span></div>
    <div class="financeTable">${CostTableRows(costs)}</div>
    <div class="financeSectionTitle"><strong>抵押家当</strong><span>钱不够时，贷款抵押物会先被收走</span></div>
    <div class="loanGrid">${loanCards}</div>
    <div class="financeSectionTitle"><strong>创业流水账</strong><span>最近 10 条</span></div>
    <div class="logList">${logs}</div>
  `);
  dom.sheetBody.querySelectorAll("[data-loan]").forEach((button) => {
    button.addEventListener("click", () => {
      const asset = FindCollateral(button.dataset.loan);
      if (asset.fatal && button.dataset.armed !== "true") {
        button.dataset.armed = "true";
        button.textContent = "再点一次，电脑抬走";
        button.classList.add("smallDangerButton");
        ShowToast("警告：电脑一旦抵押，本局立即结束。没有撤销键。", "danger");
        PlayTone("danger");
        return;
      }
      const result = TakeLoan(state, asset.id);
      state = result.state;
      SaveState();
      CloseSheet();
      RenderAll();
      ShowToast(result.message, result.fatal ? "danger" : "warning");
      PlayTone(result.fatal ? "danger" : "warning");
    });
  });
}

const terminalPrompts = [
  { id: "status", text: "这月你到底做了什么？", tone: null },
  { id: "deadline", text: "今晚能上线吗？别解释。", tone: "pressure" },
  { id: "scope", text: "把需求砍到真的能做。", tone: "sync" },
  { id: "broken", text: "为什么你又把东西做坏了？", tone: "roast" },
  { id: "praise", text: "这次居然能跑，夸你一下。", tone: "encourage" },
];

function EnsureTerminalHistory(staff) {
  if (!terminalHistory.has(staff.id)) {
    terminalHistory.set(staff.id, [
      { role: "system", text: `${staff.name} 已接入。本月订阅费 ${FormatMoney(staff.monthlyCost)}。` },
      { role: "ai", text: staff.intro },
    ]);
  }
  return terminalHistory.get(staff.id);
}

function OpenAiTerminalSheet(preferredAiId = null) {
  const hiredAi = state.team
    .map((member) => FindStaff(member.id))
    .filter((staff) => staff?.kind === "ai");
  if (!hiredAi.length) {
    OpenSheet("OWNER COMPUTER", "AI 群聊终端", `
      <div class="terminalEmpty">
        <span class="terminalEmptyIcon">▣</span>
        <h3>联系人列表为空</h3>
        <p>你还没租任何 AI。电脑目前只能用来搜索“独立游戏众筹失败怎么办”。</p>
        <button id="terminalMarketButton" type="button" class="actionButton">去租一个蠢货 AI</button>
      </div>
    `);
    document.getElementById("terminalMarketButton").addEventListener("click", OpenTalentSheet);
    return;
  }
  const activeAi = hiredAi.find((staff) => staff.id === preferredAiId) || hiredAi[0];
  const member = state.team.find((candidate) => candidate.id === activeAi.id);
  const history = EnsureTerminalHistory(activeAi);
  const aiTabs = hiredAi.map((staff) => `
    <button type="button" class="terminalContact ${staff.id === activeAi.id ? "selected" : ""}" data-ai-contact="${staff.id}" style="--staffColor:${staff.color}">
      <span>${EscapeHtml(staff.portrait)}</span><div><strong>${EscapeHtml(staff.name)}</strong><small>${EscapeHtml(staff.role)}</small></div><i></i>
    </button>
  `).join("");
  const messages = history.slice(-10).map((message) => `
    <div class="terminalMessage ${message.role}">
      <span>${message.role === "user" ? "老板" : message.role === "ai" ? EscapeHtml(activeAi.name) : "系统"}</span>
      <p>${EscapeHtml(message.text)}</p>
    </div>
  `).join("");
  const promptButtons = terminalPrompts.map((prompt) => `
    <button type="button" data-terminal-prompt="${prompt.id}" ${prompt.tone && state.talkPoints <= 0 ? "disabled" : ""}>${prompt.tone ? "⚡ " : ""}${EscapeHtml(prompt.text)}</button>
  `).join("");
  OpenSheet("OWNER COMPUTER", "AI 群聊终端", `
    <div class="terminalShell">
      <aside class="terminalContacts">
        <div class="terminalLogo"><span>▣</span><div><strong>笨蛋协作台</strong><small>DUMB OPS v0.9</small></div></div>
        ${aiTabs}
        <div class="terminalBudget"><span>本月可用嘴遁</span><strong>${state.talkPoints} / 2</strong></div>
      </aside>
      <section class="terminalChat">
        <header class="terminalChatHeader" style="--staffColor:${activeAi.color}">
          <div><strong>${EscapeHtml(activeAi.name)}</strong><small>${EscapeHtml(activeAi.role)} · ${FormatMoney(activeAi.monthlyCost)} / 月</small></div>
          <span>上下文漂移 ${Math.round(member.drift)}%</span>
        </header>
        <div class="terminalMessages">${messages}</div>
        <div class="terminalPromptLabel">预设开发问题 · 带 ⚡ 的回复会消耗本月谈话次数</div>
        <div class="terminalPrompts">${promptButtons}</div>
      </section>
    </div>
  `);
  dom.sheetBody.querySelectorAll("[data-ai-contact]").forEach((button) => {
    button.addEventListener("click", () => OpenAiTerminalSheet(button.dataset.aiContact));
  });
  dom.sheetBody.querySelectorAll("[data-terminal-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      const prompt = terminalPrompts.find((candidate) => candidate.id === button.dataset.terminalPrompt);
      if (!prompt) return;
      history.push({ role: "user", text: prompt.text });
      if (!prompt.tone) {
        history.push({ role: "ai", text: GetIdleLine(state, activeAi.id) });
        OpenAiTerminalSheet(activeAi.id);
        PlayTone("tap");
        return;
      }
      const result = TalkToStaff(state, activeAi.id, prompt.tone);
      if (!result.ok) {
        history.push({ role: "system", text: result.message });
        OpenAiTerminalSheet(activeAi.id);
        PlayTone("warning");
        return;
      }
      state = result.state;
      history.push({ role: "ai", text: result.line });
      SaveState();
      RenderAll({ rebuildStaff: false });
      OpenAiTerminalSheet(activeAi.id);
      PlayTone(prompt.tone === "pressure" || prompt.tone === "roast" ? "warning" : "good");
    });
  });
}

function OpenHelpSheet() {
  OpenSheet("HOW TO SURVIVE", "玩法说明与自救指南", `
    <div class="helpFlow">
      <div class="helpStep"><b>1 · 雇人 / 租 AI</b><p>四张工位，月底分别付工资与月租。</p></div>
      <div class="helpStep"><b>2 · 对话鞭策</b><p>每月两次，催得越狠，副作用越真。</p></div>
      <div class="helpStep"><b>3 · 选制作策略</b><p>补短板、联调，或继续假装风险不存在。</p></div>
      <div class="helpStep"><b>4 · 冲 100 亿元</b><p>高分版本扩大市场规模，持续迭代形成收入复利。</p></div>
    </div>
    <div class="helpRule" style="--ruleColor:${MODULE_META.art.color}"><span>◆</span><div><strong>美术 ↔ 性能</strong><p>美术领先会堆显存与资源压力，拖慢客户端、制造技术债；性能领先太多则变成稳定的土豆画质。</p></div></div>
    <div class="helpRule" style="--ruleColor:${MODULE_META.design.color}"><span>✦</span><div><strong>策划 ↔ 客户端</strong><p>策划领先会产生范围债，客户端产出先拿去填坑；客户端领先太多，则得到一套优雅但无聊的程序。</p></div></div>
    <div class="helpRule" style="--ruleColor:#ff9b73"><span>¥</span><div><strong>人能饿，电脑不能抵押</strong><p>现金不足时会先违约丢抵押物，再停 AI、欠工资。饭钱可以跳过并增加饥饿；抵押开发电脑则立即结束。</p></div></div>
    <div class="helpRule" style="--ruleColor:#8d7cff"><span>◎</span><div><strong>唯一胜利目标：游戏收入 100 亿元</strong><p>高评分更新会让市场规模加速复利；低分版本增长很慢。贷款到账不算游戏收入，别想抵押房本刷成世界制作人。</p></div></div>
    <div class="resetArea"><button id="resetRunButton" type="button" class="smallDangerButton">清空存档，重新创业</button></div>
  `);
  document.getElementById("resetRunButton").addEventListener("click", ResetRun);
}

function RenderConversation() {
  const staff = FindStaff(activeStaffId);
  const member = state.team.find((candidate) => candidate.id === activeStaffId);
  if (!staff || !member) {
    CloseConversation();
    return;
  }
  dom.conversationLayer.style.setProperty("--staffColor", staff.color);
  dom.conversationPortrait.style.setProperty("--staffColor", staff.color);
  dom.conversationPortrait.innerHTML = `<span>${EscapeHtml(staff.portrait)}</span>`;
  dom.conversationKind.textContent = staff.kind === "ai" ? `AI 月租 · ${FormatMoney(staff.monthlyCost)} / 月` : `大学生工资 · ${FormatMoney(staff.monthlyCost)} / 月`;
  dom.conversationName.textContent = staff.name;
  dom.conversationRole.textContent = `${staff.role} · ${staff.quirk}`;
  if (!dom.conversationLine.dataset.locked) dom.conversationLine.textContent = GetIdleLine(state, staff.id);
  const conditionLabel = staff.kind === "ai" ? "上下文稳定" : "心态";
  const conditionValue = staff.kind === "ai" ? 100 - member.drift : member.morale;
  const pressureLabel = staff.kind === "ai" ? "幻觉漂移" : "压力";
  const pressureValue = staff.kind === "ai" ? member.drift : member.stress;
  dom.conversationStats.innerHTML = `
    <div class="conversationStat"><span>主产出</span><strong>${MODULE_META[staff.specialty].label} +${staff.output[staff.specialty]}</strong></div>
    <div class="conversationStat"><span>${conditionLabel}</span><strong>${Math.round(conditionValue)} / 100</strong></div>
    <div class="conversationStat"><span>${pressureLabel}</span><strong>${Math.round(pressureValue)} / 100</strong></div>
  `;
  dom.talkPointsValue.textContent = `${state.talkPoints} / 2`;
  dom.conversationActions.querySelectorAll("button").forEach((button) => {
    button.disabled = state.talkPoints <= 0 || state.status !== "playing";
  });
}

function OpenConversation(staffId) {
  if (!state.team.some((member) => member.id === staffId) || state.status !== "playing") return;
  activeStaffId = staffId;
  delete dom.conversationLine.dataset.locked;
  dom.conversationLayer.classList.remove("hidden");
  RenderConversation();
  PlayTone("tap");
}

function CloseConversation() {
  activeStaffId = null;
  dom.conversationLayer.classList.add("hidden");
  delete dom.conversationLine.dataset.locked;
}

function OpenResult(kicker, title, html, color, closeLabel = "好的，继续燃烧现金", onClose = null) {
  dom.endingScreen.classList.add("hidden");
  dom.resultLayer.style.setProperty("--resultColor", color);
  dom.resultKicker.textContent = kicker;
  dom.resultTitle.textContent = title;
  dom.resultBody.innerHTML = html;
  dom.resultCloseButton.textContent = closeLabel;
  resultCloseHandler = onClose;
  dom.resultLayer.classList.remove("hidden");
}

function CloseResult() {
  if (dom.resultLayer.classList.contains("hidden")) return;
  dom.resultLayer.classList.add("hidden");
  const handler = resultCloseHandler;
  resultCloseHandler = null;
  if (handler) handler();
  RenderEnding();
}

function OpenReleaseResult(result) {
  const { evaluation, revenue, review, isUpdate, oldRating } = result;
  const project = FindProject(state.project.templateId);
  const ratingDelta = oldRating == null ? "首发" : `${evaluation.rating - oldRating >= 0 ? "+" : ""}${(evaluation.rating - oldRating).toFixed(1)}`;
  const primaryTensions = evaluation.tensions.slice(0, 2);
  const tensionHtml = primaryTensions.length
    ? primaryTensions.map((tension) => `<div class="reportNote ${tension.severity}">${EscapeHtml(tension.title)}：${EscapeHtml(tension.description)}</div>`).join("")
    : '<div class="reportNote">难得：评测员认为四个模块像同一款游戏。</div>';
  OpenResult(
    isUpdate ? "PATCH NOTES ARE REAL" : "LAUNCH DAY",
    isUpdate ? `v${state.project.version}.0 更新上线` : `${project.title} 首发`,
    `<div class="ratingHero">
      <div class="ratingNumber" style="color:${project.accent}">${evaluation.rating.toFixed(1)}<small>/10</small></div>
      <div class="ratingMeta"><strong>${evaluation.rating >= 8.2 ? "玩家开始替你宣传" : evaluation.rating >= 6.7 ? "能玩，而且有点东西" : evaluation.rating >= 4.7 ? "想法比帧率稳定" : "商店页比游戏完整"}</strong><p>${isUpdate ? `较上版 ${ratingDelta} 分。` : "第一批玩家已把你的梦想编译成评价。"} 本次到账 ${FormatMoney(revenue)}。</p></div>
    </div>
    <div class="resultMetrics">
      <div class="resultMetric"><span>版本收入</span><strong>+${FormatMoney(revenue)}</strong></div>
      <div class="resultMetric"><span>月流水基准</span><strong>${FormatMoney(state.project.monthlyRevenue)}</strong></div>
      <div class="resultMetric"><span>累计目标</span><strong>${FormatGoalMoney(state.gameRevenue || 0)} / 100亿</strong></div>
    </div>
    <blockquote class="reviewQuote">${EscapeHtml(review)}</blockquote>
    <div class="reportNotes">${tensionHtml}</div>`,
    project.accent,
    isUpdate ? "收到，继续把下个版本做坏" : "上线了，接着迭代",
  );
}

function SettlementNotes(result) {
  const notes = [];
  if (result.finance.income > 0) notes.push({ tone: "", text: `在线流水到账 +${FormatMoney(result.finance.income)}。` });
  notes.push({ tone: "", text: `本月支出 −${FormatMoney(result.finance.costs.total)}，剩余现金 ${FormatMoney(state.cash)}。` });
  if (result.finance.defaults.length) result.finance.defaults.forEach((loan) => notes.push({ tone: "danger", text: `${FindCollateral(loan.collateralId).name} 断供，被处置。` }));
  if (result.finance.removedStaff.length) result.finance.removedStaff.forEach((staff) => notes.push({ tone: "danger", text: `${staff.name} 因断供离开团队。` }));
  if (result.finance.skippedFood) notes.push({ tone: "warning", text: "饭钱被砍：人先饿着，电脑继续开机。" });
  if (result.wastedTotal > 0.4) notes.push({ tone: "danger", text: `本月 ${result.wastedTotal.toFixed(1)} 点工时被返工、等待和部门互害吃掉。` });
  result.painEvents.slice(0, 3).forEach((event) => notes.push({ tone: "warning", text: event }));
  if (result.buildStatus) notes.push({ tone: result.buildStatus.level === "broken" ? "danger" : result.buildStatus.level === "fragile" ? "warning" : "", text: `构建：${result.buildStatus.label}。${result.buildStatus.detail}` });
  if (result.tensions.length) notes.push({ tone: result.tensions[0].severity, text: `头号互害：${result.tensions[0].title}。` });
  else notes.push({ tone: "", text: "四组本月没有公开互相拉黑。" });
  return notes;
}

function OpenMonthResult(result) {
  const settledMonth = result.state.lastSettlement.month;
  const directive = FindDirective(result.state.lastSettlement.directiveId);
  const notes = SettlementNotes(result);
  const outputHtml = MODULE_KEYS.map((moduleKey) => `
    <div class="outputTile" style="--outputColor:${MODULE_META[moduleKey].color}"><span>${MODULE_META[moduleKey].label}</span><strong>+${Math.max(0, result.output[moduleKey]).toFixed(1)}</strong><small>吞掉 ${Math.max(0, result.wastedOutput[moduleKey]).toFixed(1)}</small></div>
  `).join("");
  OpenResult(
    "MONTHLY REPORT",
    `M${String(settledMonth).padStart(2, "0")} 创业月报`,
    `<div class="reportHeadline"><strong>${EscapeHtml(directive.name)}</strong><span>${state.status === "playing" ? `进入 M${String(state.month).padStart(2, "0")}` : "100 亿元目标已达成"}</span></div>
    <div class="outputGrid">${outputHtml}</div>
    <div class="reportNotes">${notes.map((note) => `<div class="reportNote ${note.tone}">${EscapeHtml(note.text)}</div>`).join("")}</div>`,
    directive.color,
    state.status === "playing" ? "月报已读，继续创业" : "查看影响世界的自己",
  );
}

function HandleRelease() {
  const result = ReleaseBuild(state);
  if (!result.ok) {
    ShowToast(result.message, "warning");
    PlayTone("warning");
    return;
  }
  state = result.state;
  SaveState();
  RenderAll();
  const project = FindProject(state.project.templateId);
  SpawnCelebration(project.accent);
  OpenReleaseResult(result);
  PlayTone("release");
}

function HandleAdvanceMonth() {
  const result = AdvanceMonth(state);
  if (!result.ok) {
    ShowToast(result.message, "warning");
    PlayTone("warning");
    return;
  }
  state = result.state;
  SaveState();
  RenderAll();
  OpenMonthResult(result);
  PlayTone(result.buildStatus?.level === "broken" ? "danger" : "good");
}

dom.startButton.addEventListener("click", StartNewRun);
dom.continueButton.addEventListener("click", ContinueRun);
dom.restartButton.addEventListener("click", ResetRun);
dom.talentButton.addEventListener("click", OpenTalentSheet);
dom.directiveButton.addEventListener("click", OpenDirectiveSheet);
dom.moneyButton.addEventListener("click", OpenFinanceSheet);
dom.financeDetailButton.addEventListener("click", OpenFinanceSheet);
dom.helpButton.addEventListener("click", OpenHelpSheet);
dom.releaseButton.addEventListener("click", HandleRelease);
dom.nextMonthButton.addEventListener("click", HandleAdvanceMonth);
dom.modalBackdrop.addEventListener("click", CloseSheet);
dom.sheetCloseButton.addEventListener("click", CloseSheet);
dom.conversationBackdrop.addEventListener("click", CloseConversation);
dom.conversationCloseButton.addEventListener("click", CloseConversation);
dom.resultCloseButton.addEventListener("click", CloseResult);

dom.conversationActions.querySelectorAll("[data-tone]").forEach((button) => {
  button.addEventListener("click", () => {
    if (!activeStaffId) return;
    const result = TalkToStaff(state, activeStaffId, button.dataset.tone);
    if (!result.ok) {
      ShowToast(result.message, "warning");
      PlayTone("warning");
      return;
    }
    state = result.state;
    dom.conversationLine.textContent = result.line;
    dom.conversationLine.dataset.locked = "true";
    SaveState();
    RenderAll({ rebuildStaff: false });
    RenderConversation();
    PlayTone(button.dataset.tone === "roast" || button.dataset.tone === "pressure" ? "warning" : "good");
  });
});

dom.soundButton.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  dom.soundButton.classList.toggle("muted", !soundEnabled);
  dom.soundButton.textContent = soundEnabled ? "♪" : "×";
  dom.soundButton.setAttribute("aria-label", soundEnabled ? "关闭音效" : "开启音效");
  if (soundEnabled) PlayTone("good");
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (!dom.resultLayer.classList.contains("hidden")) CloseResult();
    else if (!dom.conversationLayer.classList.contains("hidden")) CloseConversation();
    else if (!dom.modalLayer.classList.contains("hidden")) CloseSheet();
  }
  if (event.key === "Enter" && !landingOpen && state.status === "playing"
      && dom.modalLayer.classList.contains("hidden")
      && dom.conversationLayer.classList.contains("hidden")
      && dom.resultLayer.classList.contains("hidden")) {
    HandleAdvanceMonth();
  }
});

document.addEventListener("pointerdown", () => {
  if (audioContext?.state === "suspended") audioContext.resume().catch(() => {});
}, { once: false });

RenderAll();
requestAnimationFrame(() => {
  dom.loadingScreen.classList.add("loaded");
});
