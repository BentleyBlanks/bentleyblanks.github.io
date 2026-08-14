import * as THREE from "three";
import {
  AI_SUBSCRIPTION_LEVELS,
  COLLATERAL_OPTIONS,
  DIRECTIVES,
  FEATURE_CHOICES,
  FindCollateral,
  FindDirective,
  FindFoodPlan,
  FindGameType,
  FindProject,
  FindStaff,
  FOOD_PLANS,
  GAME_TYPES,
  MARKETING_CAMPAIGNS,
  MODULE_KEYS,
  MODULE_META,
  PROJECTS,
  SPECULATION_OPTIONS,
  STAFF_CATALOG,
  STUDENT_PAY_LEVELS,
} from "./Data_Game.mjs";
import {
  AdvanceMonth,
  BuyMarketingCampaign,
  CalculateTensions,
  CreateInitialState,
  CustomizeProject,
  EvaluateProject,
  FireStaff,
  ForecastMonthlyCosts,
  ForecastPivotCost,
  GetAnxietyState,
  GetIdleLine,
  GetMemberMonthlyCost,
  HireStaff,
  PerformOwnerTask,
  PivotProject,
  ReleaseBuild,
  SAVE_KEY,
  SelectDirective,
  SelectFoodPlan,
  SetStaffInvestmentLevel,
  Speculate,
  StartProject,
  TakeLoan,
  TalkToStaff,
  ValidateState,
} from "./Script_Rules.mjs";
import {
  WorldBounds,
  Collectibles as WorldCollectibles,
  MovingHazards as WorldHazards,
  InteractionPoints as WorldInteractions,
  Platforms as WorldPlatforms,
} from "./Data_World.mjs";
import {
  CreateWorldState,
  NearestInteraction,
  ResetWorldMonth,
  TickWorld,
} from "./Script_World.mjs";

const dom = Object.fromEntries([
  "loadingScreen", "sceneCanvas", "sceneVignette", "monthValue", "cashValue", "revenueValue", "goalBar",
  "hungerBar", "hungerValue", "anxietyBar", "anxietyValue", "soundButton", "helpButton", "projectType",
  "projectTitle", "missionText", "moduleStrip", "interactionPrompt", "interactionTitle", "interactionDetail",
  "moveLeftButton", "moveRightButton", "jumpButton", "interactButton", "toastStack", "setupScreen",
  "projectChoices", "typeChoices", "startButton", "continueButton", "modalLayer", "modalBackdrop", "sheetKicker",
  "sheetTitle", "sheetBody", "sheetCloseButton", "resultLayer", "resultKicker", "resultTitle", "resultBody",
  "resultCloseButton", "endingScreen", "endingTitle", "endingSubtitle", "endingStats", "restartButton",
].map((id) => [id, document.getElementById(id)]));

const FormatMoney = (value) => `¥${Math.round(value || 0).toLocaleString("zh-CN")}`;
const FormatGoalMoney = (value) => value >= 100000000
  ? `${(value / 100000000).toFixed(value >= 1000000000 ? 1 : 2)}亿元`
  : value >= 10000 ? `${(value / 10000).toFixed(1)}万` : FormatMoney(value);
const Clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const EscapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

function LoadSavedState() {
  try {
    const candidate = JSON.parse(localStorage.getItem(SAVE_KEY));
    return ValidateState(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

let savedState = LoadSavedState();
let state = savedState || CreateInitialState();
let selectedProjectId = state.project?.templateId || PROJECTS[0].id;
let selectedGameTypeId = state.project?.gameTypeId || GAME_TYPES[0].id;
let landingOpen = true;
let worldState = CreateWorldState(state.month);
let soundEnabled = true;
let audioContext = null;
let activeInteraction = null;
let resultCloseHandler = null;
let actionCooldown = 0;
let rebuildingWorld = false;
const inputState = { left: false, right: false, jump: false };

function IsOverlayOpen() {
  return landingOpen
    || !dom.modalLayer.classList.contains("hidden")
    || !dom.resultLayer.classList.contains("hidden")
    || !dom.endingScreen.classList.contains("hidden")
    || state.status !== "playing";
}

function SaveState() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch { /* Local saves are optional. */ }
}

function PlayTone(kind = "tap") {
  if (!soundEnabled) return;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const now = audioContext.currentTime;
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const profiles = {
      tap: [310, 0.035, "square"], good: [520, 0.11, "sine"], warning: [145, 0.12, "sawtooth"],
      jump: [240, 0.08, "triangle"], hit: [88, 0.16, "sawtooth"], coin: [740, 0.1, "sine"], release: [440, 0.2, "triangle"],
    };
    const [frequency, duration, wave] = profiles[kind] || profiles.tap;
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(frequency, now);
    if (kind === "jump") oscillator.frequency.exponentialRampToValueAtTime(390, now + duration);
    if (kind === "hit") oscillator.frequency.exponentialRampToValueAtTime(55, now + duration);
    gain.gain.setValueAtTime(0.055, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  } catch { /* Sound should never block play. */ }
}

function ShowToast(message, tone = "normal") {
  const toast = document.createElement("div");
  toast.className = `toast ${tone}`;
  toast.textContent = message;
  dom.toastStack.append(toast);
  window.setTimeout(() => toast.remove(), 2800);
}

function ApplyRuleResult(result, tone = "normal", options = {}) {
  if (!result?.ok) {
    ShowToast(result?.message || "这件事现在做不了。", "warning");
    PlayTone("warning");
    return false;
  }
  state = result.state;
  SaveState();
  RenderHud();
  if (options.rebuildStaff) RebuildStaffActors();
  UpdateWorldFromGameState();
  ShowToast(result.message || "完成", tone);
  PlayTone(tone === "warning" ? "warning" : "good");
  if (state.status !== "playing") RenderEnding();
  return true;
}

// Three.js world -------------------------------------------------------------

const renderer = new THREE.WebGLRenderer({ canvas: dom.sceneCanvas, antialias: true, powerPreference: "high-performance" });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.55));

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x090c17);
scene.fog = new THREE.Fog(0x090c17, 18, 46);
const camera = new THREE.OrthographicCamera(-8, 8, 5, -5, 0.1, 100);
const clock = new THREE.Clock();
const roomGroup = new THREE.Group();
const facilityGroup = new THREE.Group();
const actorGroup = new THREE.Group();
const collectibleGroup = new THREE.Group();
const hazardGroup = new THREE.Group();
const fxGroup = new THREE.Group();
scene.add(roomGroup, facilityGroup, actorGroup, collectibleGroup, hazardGroup, fxGroup);

const facilityVisuals = new Map();
const staffActors = new Map();
const collectibleVisuals = new Map();
const hazardVisuals = new Map();
const particles = [];
let playerActor = null;
let playerParts = null;
let nearbyRing = null;

function HexColor(value) { return Number.parseInt(String(value).replace("#", ""), 16); }

function Box(width, height, depth, color, options = {}) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    new THREE.MeshStandardMaterial({
      color, roughness: options.roughness ?? .76, metalness: options.metalness ?? .06,
      emissive: options.emissive ?? 0, emissiveIntensity: options.emissiveIntensity ?? 0,
      transparent: Boolean(options.transparent), opacity: options.opacity ?? 1,
    }),
  );
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  return mesh;
}

function Cylinder(radiusTop, radiusBottom, height, color, radialSegments = 12) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments),
    new THREE.MeshStandardMaterial({ color, roughness: .72 }),
  );
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function TextTexture(primary, secondary = "", color = "#ffffff") {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 190;
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = '900 58px "Microsoft YaHei UI", sans-serif';
  context.fillStyle = color;
  context.fillText(primary, 384, secondary ? 73 : 96);
  if (secondary) {
    context.font = '600 27px "Microsoft YaHei UI", sans-serif';
    context.fillStyle = "rgba(230,232,245,.72)";
    context.fillText(secondary, 384, 137);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  return texture;
}

function TextPlane(primary, secondary, width, color = "#ffffff") {
  const texture = TextTexture(primary, secondary, color);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, width * .247),
    new THREE.MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false, toneMapped: false }),
  );
  mesh.userData.texture = texture;
  return mesh;
}

function BuildHumanActor(color = 0x8d7cff, owner = false) {
  const group = new THREE.Group();
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(.48, 24),
    new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: .28, depthWrite: false }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = .018;
  group.add(shadow);
  const torso = Box(.74, .88, .42, color);
  torso.position.y = 1.24;
  group.add(torso);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(.31, 14, 10),
    new THREE.MeshStandardMaterial({ color: owner ? 0xe2ad86 : 0xd9a985, roughness: .88 }),
  );
  head.position.set(0, 1.96, 0);
  head.castShadow = true;
  group.add(head);
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(.325, 14, 9, 0, Math.PI * 2, 0, Math.PI * .48),
    new THREE.MeshStandardMaterial({ color: owner ? 0x11121a : 0x24212a, roughness: .96 }),
  );
  hair.position.set(0, 2.07, 0);
  group.add(hair);
  const leftLeg = Box(.22, .72, .28, 0x24283a);
  const rightLeg = Box(.22, .72, .28, 0x24283a);
  leftLeg.position.set(-.2, .46, 0);
  rightLeg.position.set(.2, .46, 0);
  group.add(leftLeg, rightLeg);
  const leftArm = Box(.18, .72, .22, color);
  const rightArm = Box(.18, .72, .22, color);
  leftArm.position.set(-.48, 1.3, 0);
  rightArm.position.set(.48, 1.3, 0);
  group.add(leftArm, rightArm);
  group.userData.parts = { torso, head, leftLeg, rightLeg, leftArm, rightArm, shadow };
  return group;
}

function BuildAiActor(color = 0x66b8ff) {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(.42, .04, 8, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .7, toneMapped: false }),
  );
  ring.rotation.x = Math.PI / 2;
  ring.position.y = .35;
  const body = new THREE.Mesh(
    new THREE.OctahedronGeometry(.48, 0),
    new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .4, roughness: .3, metalness: .45 }),
  );
  body.position.y = 1.25;
  body.castShadow = true;
  const face = Box(.4, .2, .06, 0x080a10, { roughness: .3 });
  face.position.set(0, 1.26, .37);
  group.add(ring, body, face);
  group.userData.parts = { ring, body };
  return group;
}

function DisposeGroup(group) {
  while (group.children.length) {
    const child = group.children.pop();
    child.traverse?.((object) => {
      object.geometry?.dispose?.();
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.filter(Boolean).forEach((material) => { material.map?.dispose?.(); material.dispose?.(); });
    });
  }
}

const FacilityLooks = {
  fridge: ["冰箱", "吃饭不是 DLC", 0xffd166],
  bank: ["抵押银行", "电脑禁止入内", 0x68e0a0],
  speculation: ["彩票 · 妖股", "本月限疯一次", 0xff6eae],
  talent: ["人才机", "工资 / 月租", 0x9d8cff],
  terminal: ["AI 群聊", "也可自己硬做", 0x66b8ff],
  art: ["美术工位", "自己画会长债", 0xff6eae],
  design: ["策划工位", "需求正在繁殖", 0xffd166],
  client: ["客户端工位", "能编译不等于能玩", 0x66b8ff],
  performance: ["性能工位", "先救一下帧率", 0x68e0a0],
  directive: ["失控白板", "方向 / 换赛道", 0xf0a6ff],
  marketing: ["宣发墙", "吹大了会退款", 0xff8c69],
  release: ["上线闸门", "把垃圾推出去", 0x68e0a0],
  calendar: ["下班门", "结算并进入下月", 0xffffff],
};

function GetFacilityKind(interaction) {
  if (interaction.kind === "workstation") return interaction.moduleKey;
  return {
    lotteryMachine: "speculation",
    talentMachine: "talent",
    aiTerminal: "terminal",
    whiteboard: "directive",
    promoSign: "marketing",
    releaseDoor: "release",
    monthCalendar: "calendar",
    offWorkDoor: "calendar",
  }[interaction.kind] || interaction.kind;
}

function GetCollectibleModule(item, index = 0) {
  return item.moduleKey || MODULE_KEYS[index % MODULE_KEYS.length];
}

function BuildFacility(interaction) {
  const group = new THREE.Group();
  const kind = GetFacilityKind(interaction);
  const [title, subtitle, color] = FacilityLooks[kind] || [interaction.label || interaction.id, "靠近按 E", 0x9d8cff];
  group.position.set(interaction.x, interaction.y || 0, 0);
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(.72, .86, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .34, side: THREE.DoubleSide, toneMapped: false }),
  );
  marker.rotation.x = -Math.PI / 2;
  marker.position.y = .025;
  group.add(marker);
  if (["art", "design", "client", "performance"].includes(kind)) {
    const desk = Box(2.1, .16, 1.05, 0x363345);
    desk.position.y = 1.05;
    group.add(desk);
    for (const offset of [-.78, .78]) {
      const leg = Box(.1, 1, .1, 0x20232e, { metalness: .35 });
      leg.position.set(offset, .52, 0);
      group.add(leg);
    }
    const monitor = Box(.82, .57, .09, 0x080a11, { roughness: .3 });
    monitor.position.set(0, 1.48, -.18);
    const screen = Box(.68, .43, .02, color, { emissive: color, emissiveIntensity: .9, castShadow: false });
    screen.position.set(0, 1.48, -.125);
    group.add(monitor, screen);
  } else if (kind === "fridge") {
    const fridge = Box(1.25, 2.55, 1.05, 0x343a4b, { metalness: .18 });
    fridge.position.y = 1.28;
    const glow = Box(.78, .15, .04, color, { emissive: color, emissiveIntensity: 1.1, castShadow: false });
    glow.position.set(0, 1.75, .55);
    group.add(fridge, glow);
  } else if (["bank", "speculation", "talent", "terminal"].includes(kind)) {
    const kiosk = Box(1.35, 2.1, .8, 0x242838, { metalness: .22 });
    kiosk.position.y = 1.05;
    const screen = Box(.88, .72, .03, color, { emissive: color, emissiveIntensity: .92, castShadow: false });
    screen.position.set(0, 1.42, .42);
    group.add(kiosk, screen);
  } else if (kind === "directive" || kind === "marketing") {
    const board = Box(2.45, 1.65, .15, 0x25283a);
    board.position.y = 1.65;
    const inner = Box(2.14, 1.32, .03, color, { emissive: color, emissiveIntensity: .25, castShadow: false });
    inner.position.set(0, 1.65, .1);
    group.add(board, inner);
  } else {
    const gate = Box(1.8, 3.15, .38, 0x252839, { metalness: .2 });
    gate.position.y = 1.58;
    const light = Box(1.24, .18, .04, color, { emissive: color, emissiveIntensity: 1, castShadow: false });
    light.position.set(0, 2.72, .23);
    group.add(gate, light);
  }
  const sign = TextPlane(title, subtitle, 2.5, `#${color.toString(16).padStart(6, "0")}`);
  sign.position.set(0, kind === "calendar" || kind === "release" ? 3.65 : 2.9, .4);
  group.add(sign);
  group.userData.marker = marker;
  group.userData.interactionId = interaction.id;
  group.userData.kind = kind;
  facilityVisuals.set(interaction.id, group);
  facilityGroup.add(group);
}

function BuildRoom() {
  const width = Math.abs(WorldBounds.maxX - WorldBounds.minX) + 4;
  const floor = Box(width, .24, 5.6, 0x181b27, { castShadow: false, roughness: .95 });
  floor.position.set((WorldBounds.maxX + WorldBounds.minX) / 2, -.14, 0);
  roomGroup.add(floor);
  const backWall = Box(width, 6.6, .28, 0x10141f, { castShadow: false });
  backWall.position.set((WorldBounds.maxX + WorldBounds.minX) / 2, 3.2, -2.7);
  roomGroup.add(backWall);
  const grid = new THREE.GridHelper(width, Math.round(width), 0x34394f, 0x232738);
  grid.position.y = .015;
  grid.scale.z = .18;
  grid.material.transparent = true;
  grid.material.opacity = .32;
  roomGroup.add(grid);
  for (let index = 0; index < Math.ceil(width / 5); index += 1) {
    const x = WorldBounds.minX - 1 + index * 5;
    const windowFrame = Box(3.5, 2.2, .12, 0x080b12, { castShadow: false });
    windowFrame.position.set(x, 4.35, -2.5);
    const glass = Box(3.16, 1.86, .03, index % 2 ? 0x1e3351 : 0x192b47, { emissive: 0x132848, emissiveIntensity: .45, castShadow: false });
    glass.position.set(x, 4.35, -2.32);
    roomGroup.add(windowFrame, glass);
  }
  WorldPlatforms.forEach((platform) => {
    if ((platform.y || 0) <= .05) return;
    const mesh = Box(platform.width, .24, 1.35, 0x3b3d52, { metalness: .08 });
    mesh.position.set(platform.x + platform.width / 2, platform.y - .12, 0);
    roomGroup.add(mesh);
  });
  WorldInteractions.forEach(BuildFacility);
  const sign = TextPlane("甲方是我", "RUN · JUMP · BUILD · SURVIVE", 6.5, "#d7d1ff");
  sign.position.set(0, 5.72, -2.28);
  roomGroup.add(sign);
  const ambient = new THREE.HemisphereLight(0xaeb9ff, 0x251a31, 1.45);
  const key = new THREE.DirectionalLight(0xdce2ff, 2.25);
  key.position.set(4, 12, 8);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -12;
  key.shadow.camera.right = 12;
  key.shadow.camera.top = 10;
  key.shadow.camera.bottom = -5;
  const pink = new THREE.PointLight(0xff6eae, 2.6, 14, 2);
  pink.position.set(-10, 3, 3);
  const blue = new THREE.PointLight(0x66b8ff, 2.7, 14, 2);
  blue.position.set(10, 3, 2);
  scene.add(ambient, key, pink, blue);
}

function BuildCollectibles() {
  DisposeGroup(collectibleGroup);
  collectibleVisuals.clear();
  WorldCollectibles.forEach((item, index) => {
    const moduleKey = GetCollectibleModule(item, index);
    const color = MODULE_META[moduleKey]?.color ? HexColor(MODULE_META[moduleKey].color) : 0xffd166;
    const mesh = new THREE.Mesh(
      new THREE.DodecahedronGeometry(.27, 0),
      new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: .85, roughness: .25, metalness: .3 }),
    );
    mesh.position.set(item.x, item.y, .2);
    mesh.userData.baseY = item.y;
    mesh.userData.phase = index * 1.4;
    collectibleVisuals.set(item.id, mesh);
    collectibleGroup.add(mesh);
  });
}

function BuildHazards() {
  DisposeGroup(hazardGroup);
  hazardVisuals.clear();
  WorldHazards.forEach((hazard, index) => {
    const group = new THREE.Group();
    const body = Box(.7, .7, .64, 0x9d263c, { emissive: 0x5f1025, emissiveIntensity: .6, roughness: .5 });
    body.position.y = .38;
    group.add(body);
    const label = TextPlane(hazard.label || "BUG", "别碰", 1.25, "#ff9aa2");
    label.position.set(0, 1.15, .36);
    group.add(label);
    group.position.set(hazard.x, hazard.y || 0, .25);
    group.userData.phase = index * 1.9;
    hazardVisuals.set(hazard.id, group);
    hazardGroup.add(group);
  });
}

function RebuildStaffActors() {
  staffActors.clear();
  DisposeGroup(actorGroup);
  playerActor = BuildHumanActor(0x9d8cff, true);
  playerActor.position.set(worldState.x, worldState.y, .65);
  playerParts = playerActor.userData.parts;
  actorGroup.add(playerActor);
  const moduleInteractions = Object.fromEntries(WorldInteractions.filter((item) => item.kind === "workstation").map((item) => [item.moduleKey, item]));
  state.team.forEach((member, index) => {
    const staff = FindStaff(member.id);
    const station = moduleInteractions[staff.specialty] || moduleInteractions[MODULE_KEYS[index % MODULE_KEYS.length]];
    if (!station) return;
    const color = HexColor(staff.color);
    const actor = staff.kind === "ai" ? BuildAiActor(color) : BuildHumanActor(color, false);
    actor.position.set(station.x + (index % 2 ? .62 : -.62), station.y || 0, -.72);
    actor.userData.baseY = actor.position.y;
    actor.userData.staffId = staff.id;
    actor.userData.phase = index * 1.7;
    actor.userData.label = TextPlane(staff.name, staff.kind === "ai" ? "按月计费" : staff.role, 1.65, staff.color);
    actor.userData.label.position.set(0, staff.kind === "ai" ? 2.25 : 2.55, .1);
    actor.add(actor.userData.label);
    staffActors.set(staff.id, actor);
    actorGroup.add(actor);
  });
}

function SpawnParticles(x, y, color = 0x9d8cff, count = 9) {
  for (let index = 0; index < count; index += 1) {
    const particle = Box(.09, .09, .09, color, { emissive: color, emissiveIntensity: .8, castShadow: false });
    particle.position.set(x + (Math.random() - .5) * .3, y + .4, .4 + (Math.random() - .5) * .4);
    particle.userData.velocity = new THREE.Vector3((Math.random() - .5) * 3.2, 2 + Math.random() * 2.5, (Math.random() - .5) * 1.2);
    particle.userData.life = .7 + Math.random() * .6;
    fxGroup.add(particle);
    particles.push(particle);
  }
}

function ResizeScene() {
  const width = Math.max(1, window.innerWidth);
  const height = Math.max(1, window.innerHeight);
  renderer.setSize(width, height, false);
  const aspect = width / height;
  const viewHeight = height < 520 ? 7.1 : 8.8;
  camera.left = -viewHeight * aspect * .5;
  camera.right = viewHeight * aspect * .5;
  camera.top = viewHeight * .5;
  camera.bottom = -viewHeight * .5;
  camera.updateProjectionMatrix();
}

function UpdateInteractionPrompt() {
  const baseInteraction = NearestInteraction(worldState);
  let nearest = baseInteraction;
  let nearestDistance = baseInteraction ? Math.hypot(worldState.x - baseInteraction.x, worldState.y - baseInteraction.y) : Infinity;
  staffActors.forEach((actor, staffId) => {
    const distance = Math.hypot(worldState.x - actor.position.x, worldState.y - actor.userData.baseY);
    if (distance < 1.15 && distance < nearestDistance) {
      const staff = FindStaff(staffId);
      nearest = { id: `staff_${staffId}`, kind: "staff", staffId, x: actor.position.x, label: `和 ${staff.name} 对话`, detail: staff.kind === "ai" ? "调教上下文，也可能被它教育" : staff.intro };
      nearestDistance = distance;
    }
  });
  activeInteraction = nearest;
  if (!nearest || IsOverlayOpen()) {
    dom.interactionPrompt.classList.add("hidden");
    facilityVisuals.forEach((visual) => { visual.userData.marker.material.opacity = .25; });
    return;
  }
  const nearestKind = nearest.kind === "staff" ? "staff" : GetFacilityKind(nearest);
  const look = FacilityLooks[nearestKind] || [nearest.label || "交互", nearest.detail || "按 E", 0x9d8cff];
  dom.interactionTitle.textContent = nearest.label || look[0];
  dom.interactionDetail.textContent = nearest.detail || look[1];
  dom.interactionPrompt.classList.remove("hidden");
  facilityVisuals.forEach((visual, id) => { visual.userData.marker.material.opacity = id === nearest.id ? .9 : .25; });
}

function UpdateWorldFromGameState() {
  const modules = state.project?.modules || {};
  MODULE_KEYS.forEach((moduleKey) => {
    const interaction = WorldInteractions.find((item) => item.kind === "workstation" && item.moduleKey === moduleKey);
    const facility = interaction ? facilityVisuals.get(interaction.id) : null;
    if (!facility) return;
    const intensity = .25 + (modules[moduleKey] || 0) / 100 * .8;
    facility.traverse((object) => {
      if (object.material?.emissive && object.material.emissive.getHex() !== 0) object.material.emissiveIntensity = intensity;
    });
  });
}

function HandleWorldEvents(events = []) {
  events.forEach((event) => {
    if (event.type === "jump") PlayTone("jump");
    if (event.type === "collectible") {
      const item = WorldCollectibles.find((candidate) => candidate.id === event.id);
      let consumed = false;
      if (item && state.status === "playing") {
        const itemIndex = WorldCollectibles.findIndex((candidate) => candidate.id === event.id);
        const moduleKey = GetCollectibleModule(item, itemIndex);
        const result = PerformOwnerTask(state, moduleKey);
        if (result.ok) {
          state = result.state;
          consumed = true;
          SaveState();
          RenderHud();
          ShowToast(`捡到 ${MODULE_META[moduleKey].label} 碎片：老板被迫亲自干了一段`, "good");
          if (state.status !== "playing") RenderEnding();
        } else {
          worldState.collectedIds = worldState.collectedIds.filter((id) => id !== event.id);
          ShowToast(result.message, "warning");
        }
      }
      const visual = collectibleVisuals.get(event.id);
      if (visual && consumed) {
        SpawnParticles(visual.position.x, visual.position.y, visual.material.color.getHex(), 12);
        visual.visible = false;
      }
      PlayTone(consumed ? "coin" : "warning");
    }
    if (event.type === "hazardHit") {
      state.anxiety = Clamp(state.anxiety + 8, 0, 100);
      SaveState();
      RenderHud();
      SpawnParticles(worldState.x, worldState.y + .5, 0xff425d, 14);
      ShowToast("你撞上了会移动的 Bug：焦虑 +8。它拒绝提供复现步骤。", "warning");
      PlayTone("hit");
      if (state.anxiety >= 100) {
        state.status = "gameover";
        state.outcome = { kind: "mentalBreakdown", title: "Bug 把现实撞散了", subtitle: "焦虑到达 100。你开始对着碰撞箱开需求评审。" };
        SaveState();
        RenderEnding();
      }
    }
    if (event.type === "playerDown" && state.status === "playing") {
      worldState = ResetWorldMonth(worldState, state.month);
      ShowToast("你被 Bug 撞回入口。需求碎片也趁机恢复了。", "warning");
      BuildCollectibles();
      BuildHazards();
    }
  });
}

function Animate() {
  requestAnimationFrame(Animate);
  const delta = Math.min(clock.getDelta(), .05);
  const time = clock.elapsedTime;
  actionCooldown = Math.max(0, actionCooldown - delta);
  const canMove = !IsOverlayOpen();
  const previousY = worldState.y;
  const controls = canMove ? { ...inputState, paused: false } : { left: false, right: false, jump: false, paused: true };
  const result = TickWorld(worldState, controls, delta);
  worldState = result.state;
  inputState.jump = false;
  HandleWorldEvents(result.events);

  if (playerActor) {
    playerActor.position.x = worldState.x;
    playerActor.position.y = worldState.y;
    const moving = Math.abs(worldState.vx || 0) > .12;
    const stride = moving && worldState.grounded ? Math.sin(time * 10) * .65 : 0;
    playerParts.leftLeg.rotation.x = stride;
    playerParts.rightLeg.rotation.x = -stride;
    playerParts.leftArm.rotation.x = -stride * .8;
    playerParts.rightArm.rotation.x = stride * .8;
    playerActor.scale.x += ((worldState.facing || 1) - playerActor.scale.x) * .28;
    playerParts.torso.rotation.z = moving ? -(worldState.vx || 0) * .015 : Math.sin(time * 1.7) * .008;
    if (worldState.y > previousY + .02) playerParts.leftArm.rotation.x = -1.05;
  }

  staffActors.forEach((actor) => {
    if (actor.userData.parts?.ring) {
      actor.position.y = actor.userData.baseY + Math.sin(time * 2 + actor.userData.phase) * .08;
      actor.userData.parts.body.rotation.y += delta * .55;
    } else actor.rotation.z = Math.sin(time * 1.25 + actor.userData.phase) * .01;
  });

  collectibleVisuals.forEach((visual, id) => {
    visual.visible = !worldState.collectedIds?.includes(id);
    if (!visual.visible) return;
    visual.position.y = visual.userData.baseY + Math.sin(time * 2.6 + visual.userData.phase) * .16;
    visual.rotation.y += delta * 1.8;
    visual.rotation.x += delta * .65;
  });
  hazardVisuals.forEach((visual, id) => {
    const hazardState = worldState.hazards?.find?.((item) => item.id === id);
    if (hazardState) {
      visual.position.x = hazardState.x;
      visual.position.y = hazardState.y || 0;
    }
    visual.rotation.z = Math.sin(time * 3.2 + visual.userData.phase) * .09;
  });
  for (let index = particles.length - 1; index >= 0; index -= 1) {
    const particle = particles[index];
    particle.userData.life -= delta;
    particle.userData.velocity.y -= 5.8 * delta;
    particle.position.addScaledVector(particle.userData.velocity, delta);
    particle.rotation.x += delta * 4;
    if (particle.userData.life <= 0) { fxGroup.remove(particle); particle.geometry.dispose(); particle.material.dispose(); particles.splice(index, 1); }
  }

  const anxiety = Clamp((state.anxiety - 45) / 55, 0, 1);
  const shake = anxiety * anxiety;
  const targetCameraX = (worldState.cameraX ?? Math.max(0, worldState.x - 6)) + 6;
  camera.position.set(targetCameraX + Math.sin(time * 17) * shake * .11, 5.7 + Math.cos(time * 14) * shake * .07, 14.2);
  camera.lookAt(targetCameraX, 1.55, 0);
  renderer.toneMappingExposure = 1.08 + Math.sin(time * 8) * shake * .08;
  scene.background.setRGB(.035 + shake * .08, .047 - shake * .015, .09 + shake * .015);
  UpdateInteractionPrompt();
  renderer.render(scene, camera);
}

// Compact world interactions -------------------------------------------------

function RenderSetupChoices() {
  dom.projectChoices.innerHTML = PROJECTS.map((project) => `
    <button class="choiceCard ${project.id === selectedProjectId ? "selected" : ""}" style="--choiceColor:${project.accent}" data-project-id="${project.id}" type="button">
      <strong>${EscapeHtml(project.title)}</strong>
      <p>${EscapeHtml(project.pitch)}</p>
      <small>${EscapeHtml(project.genre)} · ${EscapeHtml(project.trend)}</small>
    </button>`).join("");
  dom.typeChoices.innerHTML = GAME_TYPES.map((gameType) => `
    <button class="choiceCard ${gameType.id === selectedGameTypeId ? "selected" : ""}" style="--choiceColor:${gameType.accent}" data-type-id="${gameType.id}" type="button">
      <strong>${gameType.icon} ${EscapeHtml(gameType.name)}</strong>
      <p>${EscapeHtml(gameType.description)}</p>
      <small>${EscapeHtml(gameType.warning)}</small>
    </button>`).join("");
  dom.continueButton.classList.toggle("hidden", !savedState?.project);
}

function RenderHud() {
  const project = state.project;
  const template = project ? FindProject(project.templateId) : null;
  const gameType = project ? FindGameType(project.gameTypeId) : null;
  dom.monthValue.textContent = `M${String(state.month).padStart(2, "0")}`;
  dom.cashValue.textContent = FormatMoney(state.cash);
  dom.revenueValue.textContent = `${FormatGoalMoney(state.gameRevenue)} / 100亿元`;
  const directProgress = Clamp(state.gameRevenue / state.revenueGoal, 0, 1);
  const readableProgress = state.gameRevenue > 0
    ? Math.max(directProgress, Math.log10(state.gameRevenue + 1) / Math.log10(state.revenueGoal + 1) * .22)
    : 0;
  dom.goalBar.style.width = `${readableProgress * 100}%`;
  dom.goalBar.title = `真实目标进度 ${(directProgress * 100).toFixed(6)}%`;
  dom.hungerBar.style.width = `${Clamp(state.hunger, 0, 100)}%`;
  dom.hungerValue.textContent = Math.round(state.hunger);
  dom.anxietyBar.style.width = `${Clamp(state.anxiety, 0, 100)}%`;
  dom.anxietyValue.textContent = Math.round(state.anxiety);
  dom.sceneVignette.style.opacity = String(.72 + Clamp(state.anxiety / 100, 0, 1) * .28);
  dom.projectTitle.textContent = template?.title || "先开一家公司";
  dom.projectType.textContent = gameType ? `${gameType.name} · ${project.isReleased ? `v${project.version}.0 已上线` : `开发第 ${project.age + 1} 月`}` : "尚未立项";
  const tensions = project ? CalculateTensions(project) : [];
  const anxietyState = GetAnxietyState(state.anxiety);
  dom.missionText.textContent = tensions[0]?.title
    || project?.buildStatus?.detail
    || `${anxietyState.label}。移动到设施旁按 E。`;
  dom.moduleStrip.innerHTML = MODULE_KEYS.map((moduleKey) => {
    const value = project?.modules?.[moduleKey] || 0;
    const meta = MODULE_META[moduleKey];
    return `<div class="modulePip"><span>${meta.shortLabel} ${Math.round(value)}</span><div><i style="width:${value}%;background:${meta.color}"></i></div></div>`;
  }).join("");
}

function OpenPanel(kicker, title, html, onReady = null) {
  if (state.status !== "playing" || !state.project) return;
  dom.sheetKicker.textContent = kicker;
  dom.sheetTitle.textContent = title;
  dom.sheetBody.innerHTML = html;
  dom.sheetBody.onclick = null;
  dom.sheetBody.onchange = null;
  dom.modalLayer.classList.remove("hidden");
  inputState.left = false;
  inputState.right = false;
  onReady?.();
}

function ClosePanel() {
  dom.modalLayer.classList.add("hidden");
  dom.sheetBody.onclick = null;
  dom.sheetBody.onchange = null;
}

function ShowResult(kicker, title, html, onClose = null) {
  ClosePanel();
  dom.resultKicker.textContent = kicker;
  dom.resultTitle.textContent = title;
  dom.resultBody.innerHTML = html;
  resultCloseHandler = onClose;
  dom.resultLayer.classList.remove("hidden");
}

function CloseResult() {
  dom.resultLayer.classList.add("hidden");
  const handler = resultCloseHandler;
  resultCloseHandler = null;
  handler?.();
  if (state.status !== "playing") RenderEnding();
}

function ApplyInteractiveResult(result, options = {}) {
  if (!result?.ok) {
    if (result?.state) state = result.state;
    ShowToast(result?.message || "这件事现在做不了。", "warning");
    PlayTone("warning");
    return false;
  }
  state = result.state;
  SaveState();
  RenderHud();
  if (options.rebuildStaff) RebuildStaffActors();
  UpdateWorldFromGameState();
  if (options.toast !== false) ShowToast(result.message || "完成", options.tone || "good");
  PlayTone(options.tone === "warning" ? "warning" : "good");
  if (state.status !== "playing" && !options.deferEnding) RenderEnding();
  return true;
}

function RenderBar(label, value, color = "#9d8cff") {
  return `<div class="barRow"><span>${EscapeHtml(label)}</span><div><i style="width:${Clamp(value, 0, 100)}%;--barColor:${color}"></i></div><b>${Math.round(value)}</b></div>`;
}

function RenderLog(limit = 5) {
  const lines = [...(state.log || [])].slice(0, limit);
  return lines.length ? `<div class="logList">${lines.map((line) => `
    <div class="logLine"><b>M${String(line.month || state.month).padStart(2, "0")}</b><span>${EscapeHtml(line.text || line.message || String(line))}</span></div>`).join("")}</div>` : `<p class="panelIntro">项目群暂时安静得可疑。</p>`;
}

function OpenFoodSheet() {
  OpenPanel("FRIDGE · MONTHLY FUEL", "冰箱：决定这个月怎么活", `
    <p class="panelIntro">食物不是装饰。选择会在月结时扣钱，并直接影响饥饿、焦虑和全组有效产出。</p>
    <div class="worldGrid three">${FOOD_PLANS.map((food) => `
      <button class="worldChoice ${state.foodPlan === food.id ? "selected" : ""}" data-food-id="${food.id}" type="button">
        <div class="choiceTop"><strong>${food.icon} ${EscapeHtml(food.name)}</strong><span>${FormatMoney(food.monthlyCost)}/月</span></div>
        <p>${EscapeHtml(food.description)}</p>
        <div class="choiceFooter"><span>饥饿 ${food.hungerDelta >= 0 ? "+" : ""}${food.hungerDelta}</span><b>产出 ×${food.outputMultiplier}</b></div>
      </button>`).join("")}</div>`, () => {
    dom.sheetBody.onclick = (event) => {
      const button = event.target.closest("[data-food-id]");
      if (!button) return;
      if (ApplyInteractiveResult(SelectFoodPlan(state, button.dataset.foodId))) OpenFoodSheet();
    };
  });
}

function OpenInvestmentSheet(staffId) {
  const member = state.team.find((item) => item.id === staffId);
  const staff = FindStaff(staffId);
  if (!member || !staff) return OpenTalentSheet();
  const plans = staff.kind === "ai" ? AI_SUBSCRIPTION_LEVELS : STUDENT_PAY_LEVELS;
  OpenPanel("PAY / RENT", `${staff.name}：${staff.kind === "ai" ? "月租档位" : "工资档位"}`, `
    <p class="speechLine">${EscapeHtml(staff.kind === "ai" ? "买贵模型，速度和质量真会涨；月租也真会吞掉房租。" : "加薪能改善状态与产出，但大学生不会因四千块突然进化成主程。")}</p>
    <div class="panelSection worldGrid three">${plans.map((plan) => {
      const previewMember = { ...member, investmentLevel: plan.level };
      return `<button class="worldChoice ${member.investmentLevel === plan.level ? "selected" : ""}" data-level="${plan.level}" type="button">
        <div class="choiceTop"><strong>${EscapeHtml(plan.name)}</strong><span>${FormatMoney(GetMemberMonthlyCost(previewMember))}/月</span></div>
        <p>${EscapeHtml(plan.description)}</p><div class="choiceFooter"><span>产出 ×${plan.outputMultiplier}</span><b>质量 +${Math.round(plan.qualityBonus * 100)}%</b></div>
      </button>`;
    }).join("")}</div>
    <div class="panelSection"><button class="miniButton" data-back type="button">← 返回人才机</button></div>`, () => {
    dom.sheetBody.onclick = (event) => {
      if (event.target.closest("[data-back]")) return OpenTalentSheet();
      const button = event.target.closest("[data-level]");
      if (!button) return;
      if (ApplyInteractiveResult(SetStaffInvestmentLevel(state, staffId, Number(button.dataset.level)))) OpenInvestmentSheet(staffId);
    };
  });
}

function OpenTalentSheet() {
  const costs = ForecastMonthlyCosts(state);
  const RenderStaffCard = (staff) => {
    const member = state.team.find((item) => item.id === staff.id);
    const hired = Boolean(member);
    return `<article class="staffCard">
      <div class="staffTop"><strong style="color:${staff.color}">${EscapeHtml(staff.name)} · ${EscapeHtml(staff.role)}</strong><span>${EscapeHtml(staff.kind === "ai" ? "AI 月租" : "大学生工资")}</span></div>
      <p>${EscapeHtml(staff.tagline)}<br>${EscapeHtml(staff.intro)}</p>
      <div class="chipRow"><span class="chip">${EscapeHtml(MODULE_META[staff.specialty].label)}</span><span class="chip">${EscapeHtml(staff.quirk)}</span><span class="chip">${FormatMoney(hired ? GetMemberMonthlyCost(member) : staff.monthlyCost)}/月</span></div>
      <div class="choiceFooter" style="margin-top:9px"><span>${hired ? "已占用一张工位" : "雇了下月开始烧钱"}</span><span>${hired
        ? `<button class="miniButton" data-staff-action="talk" data-staff-id="${staff.id}" type="button">聊聊</button> <button class="miniButton" data-staff-action="pay" data-staff-id="${staff.id}" type="button">调待遇</button> <button class="dangerButton" data-staff-action="fire" data-staff-id="${staff.id}" type="button">${staff.kind === "ai" ? "退订" : "开除"}</button>`
        : `<button class="miniButton" data-staff-action="hire" data-staff-id="${staff.id}" type="button">${staff.kind === "ai" ? "开始月租" : "雇佣"}</button>`}</span></div>
    </article>`;
  };
  OpenPanel("TALENT VENDING MACHINE", `人才机 · ${state.team.length}/4 工位`, `
    <p class="panelIntro">大学生有真实姓名、工资和情绪；AI 有月租、上下文漂移和自动续费。当前预计人力成本 ${FormatMoney(costs.studentWages + costs.aiRent)}/月。</p>
    <div class="sectionHeading"><strong>大学生</strong><span>加薪提升有限，但会少想跑路</span></div>
    <div class="worldGrid">${STAFF_CATALOG.filter((staff) => staff.kind === "student").map(RenderStaffCard).join("")}</div>
    <div class="panelSection sectionHeading"><strong>AI 订阅</strong><span>贵模型速度和质量提升更明显</span></div>
    <div class="worldGrid">${STAFF_CATALOG.filter((staff) => staff.kind === "ai").map(RenderStaffCard).join("")}</div>`, () => {
    dom.sheetBody.onclick = (event) => {
      const button = event.target.closest("[data-staff-action]");
      if (!button) return;
      const staffId = button.dataset.staffId;
      if (button.dataset.staffAction === "talk") return OpenStaffSheet(staffId);
      if (button.dataset.staffAction === "pay") return OpenInvestmentSheet(staffId);
      const result = button.dataset.staffAction === "hire" ? HireStaff(state, staffId) : FireStaff(state, staffId);
      if (ApplyInteractiveResult(result, { rebuildStaff: true, tone: button.dataset.staffAction === "fire" ? "warning" : "good" })) OpenTalentSheet();
    };
  });
}

function OpenStaffSheet(staffId, spokenLine = "") {
  const member = state.team.find((item) => item.id === staffId);
  const staff = FindStaff(staffId);
  if (!member || !staff) return OpenTalentSheet();
  const pressureValue = staff.kind === "student" ? member.stress : member.drift;
  OpenPanel("PRESET CHAT", `和 ${staff.name} 对话`, `
    <p class="speechLine">“${EscapeHtml(spokenLine || GetIdleLine(state, staffId))}”</p>
    <div class="panelSection">${staff.kind === "student" ? `${RenderBar("士气", member.morale, "#68e0a0")}${RenderBar("压力", member.stress, "#ff626e")}` : `${RenderBar("漂移", member.drift, "#ff626e")}${RenderBar("本月加速", member.boost, "#66b8ff")}`}</div>
    <div class="talkGrid">
      <button data-tone="pressure" type="button">催死线<br><small>快，但人会裂</small></button>
      <button data-tone="encourage" type="button">说人话<br><small>稳住情绪</small></button>
      <button data-tone="roast" type="button">互喷垃圾话<br><small>有一点产出</small></button>
      <button data-tone="sync" type="button">拉群联调<br><small>减两种债</small></button>
    </div>
    <div class="panelSection choiceFooter"><span>本月还可有效对话/拍板 ${state.talkPoints} 次 · ${staff.kind === "student" ? `压力 ${Math.round(pressureValue)}` : `上下文漂移 ${Math.round(pressureValue)}`}</span><button class="miniButton" data-customize type="button">让 TA 定制玩法</button></div>`, () => {
    dom.sheetBody.onclick = (event) => {
      if (event.target.closest("[data-customize]")) return OpenCustomizationSheet(staffId);
      const button = event.target.closest("[data-tone]");
      if (!button) return;
      const result = TalkToStaff(state, staffId, button.dataset.tone);
      if (ApplyInteractiveResult(result)) OpenStaffSheet(staffId, result.line);
    };
  });
}

function OpenCustomizationSheet(sourceId = "owner") {
  const staff = sourceId === "owner" ? null : FindStaff(sourceId);
  const sourceLabel = staff ? staff.name : "你自己";
  const usedIds = new Set(state.project.features.map((item) => item.id));
  OpenPanel("DESIGN BY DIALOGUE", `${sourceLabel}：给垃圾加一点灵魂`, `
    <p class="panelIntro">选择一个玩法提案。自己做不花工资，但饥饿 +10、焦虑 +7，质量也更像教程半成品；交给员工或 AI 会消耗他们的状态。</p>
    <div class="choiceFooter"><span>本月有效对话/拍板 ${state.talkPoints} 次</span><b>已塞 ${state.project.features.length}/6 个玩法</b></div>
    <div class="panelSection worldGrid">${FEATURE_CHOICES.map((feature) => `
      <button class="featureCard" data-feature-id="${feature.id}" type="button" ${usedIds.has(feature.id) ? "disabled" : ""}>
        <div class="choiceTop"><strong>${EscapeHtml(feature.title)}</strong><span>热度 +${feature.hype}</span></div>
        <p>${EscapeHtml(feature.pitch)}</p>
        <div class="chipRow">${MODULE_KEYS.filter((key) => feature.modules[key]).map((key) => `<span class="chip">${MODULE_META[key].label} ${feature.modules[key] > 0 ? "+" : ""}${feature.modules[key]}</span>`).join("")}</div>
      </button>`).join("")}</div>
    <div class="panelSection"><button class="miniButton" data-source-select type="button">← 换个提案人</button></div>`, () => {
    dom.sheetBody.onclick = (event) => {
      if (event.target.closest("[data-source-select]")) return OpenAiTerminalSheet();
      const button = event.target.closest("[data-feature-id]");
      if (!button) return;
      const result = CustomizeProject(state, sourceId, button.dataset.featureId);
      if (!ApplyInteractiveResult(result, { tone: sourceId === "owner" ? "warning" : "good" })) return;
      ShowResult("FEATURE LOCKED", result.feature.title, `
        <div class="resultHero"><b>${sourceId === "owner" ? "我" : "TA"}</b><p>${EscapeHtml(result.consequence)}</p></div>
        <div class="noteList"><div class="note">${EscapeHtml(result.feature.pitch)}</div><div class="note danger">现在它真的写进需求了，不能靠删聊天记录撤回。</div></div>`, () => {
        if (state.status !== "playing") RenderEnding();
      });
    };
  });
}

function OpenAiTerminalSheet() {
  const hired = state.team.map((member) => FindStaff(member.id)).filter(Boolean);
  OpenPanel("COMPUTER CHAT", "电脑：跟自己、大学生和蠢 AI 开会", `
    <p class="speechLine">电脑：“本月还有 ${state.talkPoints} 次有效沟通。其余消息会自动归档为情绪劳动。”</p>
    <div class="sectionHeading panelSection"><strong>选择谁来拍板一个玩法</strong><span>对话会改变项目和人</span></div>
    <div class="worldGrid three">
      <button class="worldChoice danger" data-source-id="owner" type="button"><div class="choiceTop"><strong>老板脑内群聊</strong><span>免费但很贵</span></div><p>你和自己聊天，然后亲自做。容易饿、容易焦虑、还很容易做烂。</p></button>
      ${hired.map((staff) => `<button class="worldChoice" data-source-id="${staff.id}" type="button"><div class="choiceTop"><strong>${EscapeHtml(staff.name)}</strong><span>${staff.kind === "ai" ? "AI" : "大学生"}</span></div><p>${EscapeHtml(staff.intro)}</p></button>`).join("")}
    </div>
    <div class="panelSection sectionHeading"><strong>群聊最近的精神状态</strong><span>点击成员也可先聊垃圾话</span></div>
    <div class="chipRow">${hired.length ? hired.map((staff) => `<button class="miniButton" data-chat-id="${staff.id}" type="button">${EscapeHtml(staff.name)}</button>`).join("") : `<span class="chip">没人。去人才机雇一个会回消息的。</span>`}</div>`, () => {
    dom.sheetBody.onclick = (event) => {
      const chat = event.target.closest("[data-chat-id]");
      if (chat) return OpenStaffSheet(chat.dataset.chatId);
      const source = event.target.closest("[data-source-id]");
      if (source) OpenCustomizationSheet(source.dataset.sourceId);
    };
  });
}

function OpenWorkstationSheet(interaction) {
  const moduleKey = interaction.moduleKey;
  const meta = MODULE_META[moduleKey];
  const workers = state.team.map((member) => ({ member, staff: FindStaff(member.id) })).filter((item) => item.staff?.specialty === moduleKey);
  const relatedTensions = CalculateTensions(state.project).filter((tension) => tension.from === moduleKey || tension.to === moduleKey);
  OpenPanel("REALTIME WORKSTATION", `${meta.icon} ${meta.label}工位`, `
    <p class="panelIntro">在场景里亲自干活会立刻得到 2–4 点低质量进度，也会产生 Bug、范围债和技术债。老板每月最多硬干三次。</p>
    ${RenderBar(`${meta.label}进度`, state.project.modules[moduleKey], meta.color)}
    <div class="metricGrid">
      <div class="metricTile"><span>老板本月硬干</span><strong>${state.ownerWorkCount}/3</strong></div>
      <div class="metricTile"><span>Bug</span><strong>${Math.round(state.project.bugs)}</strong></div>
      <div class="metricTile"><span>技术债 / 范围债</span><strong>${Math.round(state.project.technicalDebt)} / ${Math.round(state.project.scopeDebt)}</strong></div>
    </div>
    <div class="panelSection choiceFooter"><span>${EscapeHtml(meta.description)}</span><button class="primaryButton" data-owner-work type="button" ${state.ownerWorkCount >= 3 ? "disabled" : ""}>亲自干一次</button></div>
    <div class="panelSection sectionHeading"><strong>这个工位上的人</strong><span>${workers.length ? "月结时才产出" : "目前只有老板的背影"}</span></div>
    <div class="chipRow">${workers.length ? workers.map(({ staff }) => `<button class="miniButton" data-worker-id="${staff.id}" type="button">跟 ${EscapeHtml(staff.name)} 聊</button>`).join("") : `<button class="miniButton" data-talent type="button">去人才机找人</button>`}</div>
    ${relatedTensions.length ? `<div class="noteList">${relatedTensions.map((tension) => `<div class="note ${tension.severity === "critical" ? "danger" : ""}"><b>${EscapeHtml(tension.title)}</b><br>${EscapeHtml(tension.description)}</div>`).join("")}</div>` : `<div class="noteList"><div class="note good">当前没有明显跨模块互殴，像暴风雨前的 stand-up。</div></div>`}`, () => {
    dom.sheetBody.onclick = (event) => {
      if (event.target.closest("[data-talent]")) return OpenTalentSheet();
      const worker = event.target.closest("[data-worker-id]");
      if (worker) return OpenStaffSheet(worker.dataset.workerId);
      if (!event.target.closest("[data-owner-work]")) return;
      const result = PerformOwnerTask(state, moduleKey);
      if (ApplyInteractiveResult(result, { tone: "warning" })) OpenWorkstationSheet(interaction);
    };
  });
}

function OpenBankSheet() {
  const costs = ForecastMonthlyCosts(state);
  const activeLoans = state.loans.filter((loan) => loan.status === "active");
  OpenPanel("COLLATERAL BANK", "抵押银行：未来的你已读不回", `
    <p class="panelIntro">贷款只增加现金，不算游戏收入。月供在月结时扣；断供会没收抵押物。开发电脑一旦抵押，立即结束。</p>
    <div class="metricGrid">
      <div class="metricTile"><span>下月总成本</span><strong>${FormatMoney(costs.total)}</strong></div>
      <div class="metricTile"><span>现有贷款月供</span><strong>${FormatMoney(costs.loanPayments)}</strong></div>
      <div class="metricTile"><span>现金缺口</span><strong>${FormatMoney(Math.max(0, costs.total - state.cash))}</strong></div>
    </div>
    <div class="panelSection worldGrid">${COLLATERAL_OPTIONS.map((asset) => {
      const assetState = state.assets[asset.id];
      return `<button class="worldChoice ${asset.fatal ? "danger" : ""}" data-collateral-id="${asset.id}" type="button" ${assetState !== "free" ? "disabled" : ""}>
        <div class="choiceTop"><strong>${asset.icon} ${EscapeHtml(asset.name)}</strong><span>${assetState === "free" ? `到账 ${FormatMoney(asset.principal)}` : EscapeHtml(assetState === "pledged" ? "已抵押" : "已没收")}</span></div>
        <p>${EscapeHtml(asset.consequence)}</p><div class="choiceFooter"><span>${asset.term} 个月</span><b>月供 ${FormatMoney(asset.monthlyPayment)}</b></div>
      </button>`;
    }).join("")}</div>
    <div class="panelSection sectionHeading"><strong>贷款簿</strong><span>${activeLoans.length} 笔还在追你</span></div>
    <div class="noteList">${activeLoans.length ? activeLoans.map((loan) => { const asset = FindCollateral(loan.collateralId); return `<div class="note">${EscapeHtml(asset.name)} · 剩 ${loan.remaining} 期 · 月供 ${FormatMoney(loan.monthlyPayment)}</div>`; }).join("") : `<div class="note good">暂时没有贷款。银行替你感到遗憾。</div>`}</div>`, () => {
    dom.sheetBody.onclick = (event) => {
      const button = event.target.closest("[data-collateral-id]");
      if (!button) return;
      const asset = FindCollateral(button.dataset.collateralId);
      if (asset?.fatal && !window.confirm("抵押开发电脑会立即结束游戏。真的要亲手拔掉项目的电源吗？")) return;
      const result = TakeLoan(state, button.dataset.collateralId);
      if (!ApplyInteractiveResult(result, { tone: "warning", deferEnding: true })) return;
      if (result.fatal) RenderEnding(); else OpenBankSheet();
    };
  });
}

function OutcomeOdds(option) {
  let previous = 0;
  return option.outcomes.map((outcome) => {
    const chance = Math.max(0, outcome.ceiling - previous);
    previous = outcome.ceiling;
    return { ...outcome, chance };
  });
}

function OpenSpeculationSheet() {
  const used = state.lastSpeculationMonth === state.month;
  OpenPanel("LOTTERY / STOCKS", "彩票机与妖股终端", `
    <p class="panelIntro">每月只能疯一次。贷款和投机所得都不计入 100 亿元目标；妖股可以让公司比游戏先上线最终字幕。</p>
    <div class="worldGrid">${SPECULATION_OPTIONS.map((option) => `
      <article class="oddsCard">
        <div class="choiceTop"><strong>${option.icon} ${EscapeHtml(option.name)}</strong><span>${EscapeHtml(option.risk)}</span></div>
        <p>${EscapeHtml(option.description)}</p>
        <div class="oddsList">${OutcomeOdds(option).map((outcome) => `<div class="oddsLine"><span>${(outcome.chance * 100).toFixed(outcome.chance < .01 ? 1 : 0)}% · ${EscapeHtml(outcome.label)}</span><b>返还 ×${outcome.payoutMultiplier}</b></div>`).join("")}</div>
        <div class="choiceFooter" style="margin-top:9px"><span>本金 ${option.stakeMode === "allIn" ? "全部现金" : FormatMoney(option.stake)}</span><button class="${option.stakeMode === "allIn" ? "dangerButton" : "miniButton"}" data-speculation-id="${option.id}" type="button" ${used ? "disabled" : ""}>${used ? "本月已赌" : "下注"}</button></div>
      </article>`).join("")}</div>
    <div class="panelSection sectionHeading"><strong>投机历史</strong><span>累计 ${state.speculationProfit >= 0 ? "赚" : "亏"} ${FormatMoney(Math.abs(state.speculationProfit))}</span></div>
    <div class="logList">${state.speculationHistory.length ? [...state.speculationHistory].reverse().map((item) => `<div class="logLine"><b>M${String(item.month).padStart(2, "0")}</b><span>${EscapeHtml(SPECULATION_OPTIONS.find((option) => option.id === item.optionId)?.name || item.optionId)}：${EscapeHtml(item.label)}，${item.profit >= 0 ? "+" : "-"}${FormatMoney(Math.abs(item.profit))}</span></div>`).join("") : `<div class="note">还没有历史。你的现金正在享受最后的宁静。</div>`}</div>`, () => {
    dom.sheetBody.onclick = (event) => {
      const button = event.target.closest("[data-speculation-id]");
      if (!button) return;
      const option = SPECULATION_OPTIONS.find((item) => item.id === button.dataset.speculationId);
      if (option?.stakeMode === "allIn" && !window.confirm("这会押上当前全部现金，并有 42% 概率直接破产。确定？")) return;
      const result = Speculate(state, button.dataset.speculationId);
      if (!ApplyInteractiveResult(result, { deferEnding: true, tone: result?.profit >= 0 ? "good" : "warning", toast: false })) return;
      ShowResult("SPECULATION RESULT", result.outcome.label, `
        <div class="resultHero"><b>${result.profit >= 0 ? "+" : "−"}${FormatGoalMoney(Math.abs(result.profit))}</b><p>本金 ${FormatMoney(result.stake)}，返还 ${FormatMoney(result.payout)}。<br>这不是游戏收入，只是命运临时借你一张 Excel。</p></div>`, () => { if (state.status !== "playing") RenderEnding(); });
    };
  });
}

function OpenDirectiveSheet() {
  const pivotCost = ForecastPivotCost(state);
  OpenPanel("WALL OF CHANGING MINDS", "失控白板：方向、玩法与换赛道", `
    <p class="panelIntro">策略只在本月月结时生效。美术过强会压垮性能，策划飞太高会让客户端接不住；联调不是口号，是防止产出被直接浪费。</p>
    <div class="worldGrid three">${DIRECTIVES.map((directive) => `
      <button class="worldChoice ${state.selectedDirective === directive.id ? "selected" : ""}" data-directive-id="${directive.id}" type="button">
        <div class="choiceTop"><strong style="color:${directive.color}">${directive.icon} ${EscapeHtml(directive.name)}</strong><span>${state.selectedDirective === directive.id ? "本月采用" : "改方向"}</span></div><p>${EscapeHtml(directive.description)}</p>
      </button>`).join("")}</div>
    <div class="panelSection choiceFooter"><span>自己和自己开会也算一次有效沟通</span><button class="miniButton" data-owner-customize type="button">脑内群聊：定制玩法</button></div>
    <div class="panelSection sectionHeading"><strong>承认做错了：换赛道</strong><span>预计烧掉 ${FormatMoney(pivotCost)}</span></div>
    <div class="worldGrid">
      <label class="worldChoice"><div class="choiceTop"><strong>换题材</strong><span>不可抗力生成器</span></div><select id="pivotProjectSelect">${PROJECTS.map((project) => `<option value="${project.id}" ${project.id === state.project.templateId ? "selected" : ""}>${EscapeHtml(project.title)} · ${EscapeHtml(project.genre)}</option>`).join("")}</select></label>
      <label class="worldChoice"><div class="choiceTop"><strong>换商业形态</strong><span>旧代码只保留债务</span></div><select id="pivotTypeSelect">${GAME_TYPES.map((gameType) => `<option value="${gameType.id}" ${gameType.id === state.project.gameTypeId ? "selected" : ""}>${EscapeHtml(gameType.name)} · ${EscapeHtml(gameType.warning)}</option>`).join("")}</select></label>
    </div>
    <div class="panelSection choiceFooter"><span>进度、宣发、玩法都会大量损失；焦虑 +14，饥饿 +4</span><button class="dangerButton" data-pivot type="button" ${state.project.isReleased ? "disabled" : ""}>花 ${FormatMoney(pivotCost)} 强行转向</button></div>`, () => {
    dom.sheetBody.onclick = (event) => {
      const directiveButton = event.target.closest("[data-directive-id]");
      if (directiveButton) {
        if (ApplyInteractiveResult(SelectDirective(state, directiveButton.dataset.directiveId))) OpenDirectiveSheet();
        return;
      }
      if (event.target.closest("[data-owner-customize]")) return OpenCustomizationSheet("owner");
      if (!event.target.closest("[data-pivot]")) return;
      const projectId = document.getElementById("pivotProjectSelect")?.value;
      const typeId = document.getElementById("pivotTypeSelect")?.value;
      if (!window.confirm(`换赛道将立即烧掉 ${FormatMoney(pivotCost)}，大量进度作废。还换吗？`)) return;
      const result = PivotProject(state, projectId, typeId);
      if (!ApplyInteractiveResult(result, { tone: "warning", deferEnding: true })) return;
      ShowResult("FORCE MAJEURE", "赛道被迫重做", `
        <div class="resultHero"><b>−${FormatGoalMoney(result.cost)}</b><p>${EscapeHtml(result.reason)}<br>丢失愿望单 ${result.lostWishlists.toLocaleString("zh-CN")}，废弃玩法 ${result.discardedFeatures} 个。</p></div>
        <div class="note danger">旧项目能复用的只有启动图标、几行代码和全部心理阴影。</div>`, () => { if (state.status !== "playing") RenderEnding(); });
    };
  });
}

function OpenMarketingSheet() {
  OpenPanel("HYPE BEFORE QUALITY", "宣发墙：先吹，还是先做", `
    <p class="panelIntro">宣发提高热度和愿望单，也提高玩家预期。上线质量接不住时，会被喷、退款、掉口碑，甚至把巨额曝光变成巨额处刑。</p>
    <div class="metricGrid">
      <div class="metricTile"><span>累计宣发</span><strong>${FormatMoney(state.project.marketingSpent)}</strong></div>
      <div class="metricTile"><span>愿望单</span><strong>${state.project.wishlists.toLocaleString("zh-CN")}</strong></div>
      <div class="metricTile"><span>预期压力</span><strong>${Math.round(state.project.expectation)} / 60</strong></div>
    </div>
    <div class="panelSection worldGrid three">${MARKETING_CAMPAIGNS.map((campaign) => {
      const bought = state.project.campaigns.includes(campaign.id);
      return `<button class="worldChoice ${campaign.id === "everywhereCampaign" ? "danger" : ""}" data-campaign-id="${campaign.id}" type="button" ${bought || state.project.isReleased ? "disabled" : ""}>
        <div class="choiceTop"><strong>${campaign.icon} ${EscapeHtml(campaign.name)}</strong><span>${FormatMoney(campaign.cost)}</span></div>
        <p>${EscapeHtml(campaign.description)}</p><div class="choiceFooter"><span>愿望单 +${campaign.wishlists.toLocaleString("zh-CN")}</span><b>${bought ? "已投放" : `预期 +${campaign.expectation}`}</b></div>
      </button>`;
    }).join("")}</div>`, () => {
    dom.sheetBody.onclick = (event) => {
      const button = event.target.closest("[data-campaign-id]");
      if (!button) return;
      const result = BuyMarketingCampaign(state, button.dataset.campaignId);
      if (ApplyInteractiveResult(result, { tone: "warning", deferEnding: true })) {
        if (state.status === "playing") OpenMarketingSheet(); else RenderEnding();
      }
    };
  });
}

function RevenueChart(history = state.incomeHistory) {
  const points = history.slice(-16);
  if (!points.length) return `<div class="revenueEmpty">还没有真实游戏收入。贷款和彩票被曲线礼貌地拒绝了。</div>`;
  const width = 560;
  const height = 128;
  const maximum = Math.max(1, ...points.map((item) => item.income || 0));
  const polyline = points.map((item, index) => {
    const x = points.length === 1 ? width / 2 : index / (points.length - 1) * width;
    const y = height - 12 - (item.income || 0) / maximum * (height - 28);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return `<div class="revenueChart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="最近游戏收入曲线">
    <defs><linearGradient id="revenueGlow" x1="0" x2="1"><stop stop-color="#9d8cff"/><stop offset="1" stop-color="#68e0a0"/></linearGradient></defs>
    <path d="M0 ${height - 12}H${width}" class="chartAxis"/><polyline points="${polyline}" fill="none" stroke="url(#revenueGlow)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    ${points.map((item, index) => { const x = points.length === 1 ? width / 2 : index / (points.length - 1) * width; const y = height - 12 - (item.income || 0) / maximum * (height - 28); return `<circle cx="${x}" cy="${y}" r="4"/><text x="${x}" y="${height - 1}" text-anchor="middle">M${item.month}</text>`; }).join("")}
  </svg><div class="choiceFooter"><span>最高 ${FormatGoalMoney(maximum)}</span><b>只统计游戏净收入</b></div></div>`;
}

function RevenueAnalysis() {
  const entries = state.incomeHistory.slice(-6);
  if (!entries.length) return "先做满两个月并上线，分析师才有东西可以过度解读。";
  const recent = entries.slice(-3);
  const earlier = entries.slice(-6, -3);
  const recentAverage = recent.reduce((sum, item) => sum + (item.income || 0), 0) / recent.length;
  const earlierAverage = earlier.length ? earlier.reduce((sum, item) => sum + (item.income || 0), 0) / earlier.length : recentAverage;
  const trend = recentAverage > earlierAverage * 1.12 ? "正在上行" : recentAverage < earlierAverage * .88 ? "正在下坠" : "暂时横盘";
  const losses = recent.reduce((sum, item) => sum + (item.refunds || 0) + (item.eventLoss || 0), 0);
  return `近 ${recent.length} 笔平均 ${FormatGoalMoney(recentAverage)}，曲线${trend}；退款与随机事件少拿 ${FormatGoalMoney(losses)}。`;
}

function OpenReleaseSheet() {
  const evaluation = EvaluateProject(state);
  const canRelease = state.project.age >= 2 && state.project.lastReleaseMonth !== state.month;
  const tensions = evaluation?.tensions || [];
  OpenPanel("SHIP IT / REGRET IT", state.project.isReleased ? "上线闸门：发布更新" : "上线闸门：把垃圾推出去", `
    <div class="resultHero"><b>${evaluation.rating.toFixed(1)}</b><p>当前预测评分。${EscapeHtml(state.project.buildStatus.detail)}<br>${tensions[0] ? EscapeHtml(tensions[0].description) : "四模块暂时没互相掐死。"}</p></div>
    <div class="metricGrid">
      <div class="metricTile"><span>开发时长</span><strong>${state.project.age} 个月</strong></div>
      <div class="metricTile"><span>热度 / 愿望单</span><strong>${Math.round(state.project.hype)} / ${state.project.wishlists.toLocaleString("zh-CN")}</strong></div>
      <div class="metricTile"><span>Bug / 两种债</span><strong>${Math.round(state.project.bugs)} / ${Math.round(state.project.scopeDebt + state.project.technicalDebt)}</strong></div>
    </div>
    <div class="noteList">${tensions.length ? tensions.slice(0, 3).map((tension) => `<div class="note ${tension.severity === "critical" ? "danger" : ""}">${EscapeHtml(tension.title)}：${EscapeHtml(tension.description)}</div>`).join("") : `<div class="note good">没有严重跨模块冲突。这个状态很珍贵，也很短暂。</div>`}</div>
    <div class="panelSection">${RevenueChart()}</div>
    <div class="note">收入分析：${EscapeHtml(RevenueAnalysis())}</div>
    <div class="panelSection choiceFooter"><span>${state.project.age < 2 ? `还要开发 ${2 - state.project.age} 个月才能提交商店` : state.project.lastReleaseMonth === state.month ? "本月已经发布过" : "评分差也能发，只是玩家也能退款"}</span><button class="primaryButton" data-release type="button" ${canRelease ? "" : "disabled"}>${state.project.isReleased ? "发布更新" : "现在上线"}</button></div>`, () => {
    dom.sheetBody.onclick = (event) => {
      if (!event.target.closest("[data-release]")) return;
      const result = ReleaseBuild(state);
      if (!ApplyInteractiveResult(result, { deferEnding: true, toast: false })) return;
      const commercial = result.commercial;
      ShowResult(result.isUpdate ? "UPDATE LIVE" : "LAUNCH LIVE", `${result.evaluation.rating.toFixed(1)} 分 · ${result.review}`, `
        <div class="resultHero"><b>+${FormatGoalMoney(result.revenue)}</b><p>净游戏收入已计入 100 亿元目标。<br>${commercial.backlash ? "宣发反噬：玩家把退款键当成核心玩法。" : "至少这次商店页没有立刻变成追悼会。"}</p></div>
        <div class="metricGrid"><div class="metricTile"><span>毛收入</span><strong>${FormatGoalMoney(commercial.grossRevenue)}</strong></div><div class="metricTile"><span>退款</span><strong>${FormatGoalMoney(commercial.refunds)}</strong></div><div class="metricTile"><span>退款率</span><strong>${(commercial.refundRate * 100).toFixed(1)}%</strong></div></div>
        <div class="panelSection">${RevenueChart()}</div>`, () => { if (state.status !== "playing") RenderEnding(); });
      PlayTone("release");
    };
  });
}

function OpenMonthSheet() {
  const costs = ForecastMonthlyCosts(state);
  const shortfall = Math.max(0, costs.total - state.cash - (state.project.isReleased ? state.project.monthlyRevenue : 0));
  OpenPanel("END THE MONTH", "下班门：让所有痛苦一起结算", `
    <p class="panelIntro">穿过这扇门，工资、AI 月租、房租水电、车贷房贷、饭钱和贷款月供一起扣；随后团队才开始产出。钱不够会退订、开人、断供、挨饿或丢东西。</p>
    <div class="metricGrid">
      <div class="metricTile"><span>现金</span><strong>${FormatMoney(state.cash)}</strong></div>
      <div class="metricTile"><span>预计总支出</span><strong>${FormatMoney(costs.total)}</strong></div>
      <div class="metricTile"><span>危险缺口</span><strong>${FormatMoney(shortfall)}</strong></div>
    </div>
    <div class="panelSection worldGrid three">
      <div class="worldChoice"><div class="choiceTop"><strong>生活硬账</strong><span>${FormatMoney(costs.living)}</span></div><p>工作室、房贷、车贷、水电网。现实世界的四大模块。</p></div>
      <div class="worldChoice"><div class="choiceTop"><strong>人类工资</strong><span>${FormatMoney(costs.studentWages)}</span></div><p>大学生也要活着，且比老板更懂劳动法。</p></div>
      <div class="worldChoice"><div class="choiceTop"><strong>AI 月租</strong><span>${FormatMoney(costs.aiRent)}</span></div><p>不发工资，但订阅扣款从不幻觉。</p></div>
      <div class="worldChoice"><div class="choiceTop"><strong>食物</strong><span>${FormatMoney(costs.food)}</span></div><p>${EscapeHtml(FindFoodPlan(state.foodPlan)?.description || "")}</p></div>
      <div class="worldChoice"><div class="choiceTop"><strong>贷款月供</strong><span>${FormatMoney(costs.loanPayments)}</span></div><p>断供会没收抵押物；电脑被抬走即结束。</p></div>
      <div class="worldChoice"><div class="choiceTop"><strong>上线服务</strong><span>${FormatMoney(costs.service)}</span></div><p>网游和手游在你睡觉时也继续烧钱。</p></div>
    </div>
    <div class="noteList">${CalculateTensions(state.project).slice(0, 3).map((tension) => `<div class="note ${tension.severity === "critical" ? "danger" : ""}">${EscapeHtml(tension.title)}：${EscapeHtml(tension.description)}</div>`).join("") || `<div class="note good">本月四组关系勉强可以出现在同一张合影里。</div>`}</div>
    <div class="panelSection choiceFooter"><span>策略：${EscapeHtml(FindDirective(state.selectedDirective).name)} · 老板已硬干 ${state.ownerWorkCount}/3 · 有效沟通剩 ${state.talkPoints}</span><button class="primaryButton" data-advance-month type="button">结算并进入下月</button></div>`, () => {
    dom.sheetBody.onclick = (event) => {
      if (!event.target.closest("[data-advance-month]")) return;
      const result = AdvanceMonth(state);
      if (!ApplyInteractiveResult(result, { rebuildStaff: true, deferEnding: true, toast: false })) return;
      worldState = ResetWorldMonth(worldState, state.month);
      BuildCollectibles();
      BuildHazards();
      const finance = result.finance;
      const removed = finance.removedStaff || [];
      const defaults = finance.defaults || [];
      const originalMonth = state.lastSettlement?.month || Math.max(1, state.month - 1);
      ShowResult("MONTHLY DAMAGE REPORT", `M${String(originalMonth).padStart(2, "0")} 熬过去了`, `
        <div class="resultHero"><b>${result.buildStatus?.label || "还活着"}</b><p>收入 ${FormatMoney(finance.income)}，支出 ${FormatMoney(finance.costs?.total || 0)}。<br>${EscapeHtml(result.painEvents?.[0] || "这个月居然没有第一时间能想起的痛。")}</p></div>
        <div class="metricGrid"><div class="metricTile"><span>本月游戏收入</span><strong>${FormatGoalMoney(finance.income)}</strong></div><div class="metricTile"><span>浪费产出</span><strong>${(result.wastedTotal || 0).toFixed(1)}</strong></div><div class="metricTile"><span>焦虑变化</span><strong>${result.anxiety.delta >= 0 ? "+" : ""}${result.anxiety.delta.toFixed(1)}</strong></div></div>
        <div class="noteList">
          ${(result.painEvents || []).slice(0, 5).map((note) => `<div class="note danger">${EscapeHtml(note)}</div>`).join("")}
          ${removed.map((staff) => `<div class="note danger">付不起费用，${EscapeHtml(staff.name)} ${staff.kind === "ai" ? "被自动退订" : "收拾东西走了"}。</div>`).join("")}
          ${defaults.map((loan) => `<div class="note danger">贷款断供：${EscapeHtml(FindCollateral(loan.collateralId)?.name || loan.collateralId)} 被没收。</div>`).join("")}
          ${finance.skippedFood ? `<div class="note danger">饭钱没付出来，本月自动改成硬扛不吃。</div>` : ""}
          ${finance.appliedEvents?.map((liveEvent) => `<div class="note danger">收入事件：${EscapeHtml(liveEvent.title)}，流水乘数 ×${liveEvent.multiplier}。</div>`).join("") || ""}
          ${result.anxiety.idea ? `<div class="note good">焦虑迸发抽象创意：${EscapeHtml(result.anxiety.idea.title)}——${EscapeHtml(result.anxiety.idea.pitch)}</div>` : ""}
        </div>
        <div class="panelSection">${RevenueChart()}</div>`, () => { if (state.status !== "playing") RenderEnding(); });
    };
  });
}

function OpenHelpSheet() {
  OpenPanel("HOW TO SUFFER", "这不是经营表：你得跑过去", `
    <div class="resultHero"><b>A/D</b><p>左右跑；W、↑ 或空格跳；靠近设施按 E。移动端横屏使用屏幕底部四个按钮。</p></div>
    <div class="noteList">
      <div class="note">跳上平台捡发光需求碎片，会让老板亲自完成一次低质量开发，同时更饿、更焦虑、债更多。</div>
      <div class="note danger">红色移动 Bug 会撞掉“今天还能扛几次”的体力并提高焦虑；被撞趴会回到入口。</div>
      <div class="note">所有业务都在世界里：冰箱吃饭、人才机雇人、工位开发、白板换方向、宣发墙吹牛、发布门上线、下班门月结。</div>
      <div class="note good">唯一胜利：累计游戏收入达到 100 亿元。贷款、彩票和炒股发财都不算。</div>
    </div>
    <div class="panelSection">${RenderLog(6)}</div>`);
}

function RenderEnding() {
  if (state.status === "playing" || state.status === "setup") return;
  landingOpen = false;
  dom.setupScreen.classList.add("hidden");
  dom.modalLayer.classList.add("hidden");
  dom.resultLayer.classList.add("hidden");
  dom.endingTitle.textContent = state.outcome?.title || (state.status === "ended" ? "你影响了世界" : "工作室倒下了");
  dom.endingSubtitle.textContent = state.outcome?.subtitle || "至少电脑在日志里留下了最后一句话。";
  dom.endingStats.innerHTML = `
    <div><span>撑过</span><strong>${state.month} 个月</strong></div>
    <div><span>游戏收入</span><strong>${FormatGoalMoney(state.gameRevenue)}</strong></div>
    <div><span>最好评分</span><strong>${state.bestRating ? state.bestRating.toFixed(1) : "没发出来"}</strong></div>`;
  dom.endingScreen.classList.remove("hidden");
}

function BeginWorld(nextState) {
  state = nextState;
  landingOpen = false;
  worldState = CreateWorldState(state.month);
  dom.setupScreen.classList.add("hidden");
  dom.endingScreen.classList.add("hidden");
  SaveState();
  RebuildStaffActors();
  BuildCollectibles();
  BuildHazards();
  RenderHud();
  UpdateWorldFromGameState();
  if (state.status !== "playing") RenderEnding();
}

function TriggerInteraction() {
  if (actionCooldown > 0 || IsOverlayOpen() || !activeInteraction) return;
  actionCooldown = .28;
  PlayTone("tap");
  if (activeInteraction.kind === "staff") return OpenStaffSheet(activeInteraction.staffId);
  switch (activeInteraction.kind) {
    case "fridge": return OpenFoodSheet();
    case "bank": return OpenBankSheet();
    case "lotteryMachine": return OpenSpeculationSheet();
    case "talentMachine": return OpenTalentSheet();
    case "workstation": return OpenWorkstationSheet(activeInteraction);
    case "whiteboard": return OpenDirectiveSheet();
    case "promoSign": return OpenMarketingSheet();
    case "releaseDoor": return OpenReleaseSheet();
    case "monthCalendar":
    case "offWorkDoor": return OpenMonthSheet();
    case "aiTerminal": return OpenAiTerminalSheet();
    default: ShowToast("这个物件还在等需求评审。", "warning");
  }
}

function SetMovement(key, pressed) {
  inputState[key] = pressed;
  if (pressed && audioContext?.state === "suspended") audioContext.resume();
}

function BindHoldButton(button, key) {
  const release = (event) => { event.preventDefault(); SetMovement(key, false); };
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    button.setPointerCapture?.(event.pointerId);
    SetMovement(key, true);
  });
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", () => SetMovement(key, false));
}

function BindControls() {
  window.addEventListener("resize", ResizeScene);
  window.addEventListener("blur", () => { inputState.left = false; inputState.right = false; inputState.jump = false; });
  window.addEventListener("keydown", (event) => {
    if (["INPUT", "SELECT", "TEXTAREA"].includes(document.activeElement?.tagName)) return;
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "Space"].includes(event.code)) event.preventDefault();
    if (event.code === "KeyA" || event.code === "ArrowLeft") SetMovement("left", true);
    if (event.code === "KeyD" || event.code === "ArrowRight") SetMovement("right", true);
    if (["KeyW", "ArrowUp", "Space"].includes(event.code) && !event.repeat) inputState.jump = true;
    if (event.code === "KeyE" && !event.repeat) TriggerInteraction();
    if (event.code === "Escape") { if (!dom.resultLayer.classList.contains("hidden")) CloseResult(); else ClosePanel(); }
  }, { passive: false });
  window.addEventListener("keyup", (event) => {
    if (event.code === "KeyA" || event.code === "ArrowLeft") SetMovement("left", false);
    if (event.code === "KeyD" || event.code === "ArrowRight") SetMovement("right", false);
  });
  BindHoldButton(dom.moveLeftButton, "left");
  BindHoldButton(dom.moveRightButton, "right");
  dom.jumpButton.addEventListener("pointerdown", (event) => { event.preventDefault(); inputState.jump = true; PlayTone("jump"); });
  dom.interactButton.addEventListener("click", (event) => { event.preventDefault(); TriggerInteraction(); });
  dom.modalBackdrop.addEventListener("click", ClosePanel);
  dom.sheetCloseButton.addEventListener("click", ClosePanel);
  dom.resultCloseButton.addEventListener("click", CloseResult);
  dom.helpButton.addEventListener("click", OpenHelpSheet);
  dom.soundButton.addEventListener("click", () => {
    soundEnabled = !soundEnabled;
    dom.soundButton.textContent = soundEnabled ? "♪" : "×";
    dom.soundButton.setAttribute("aria-label", soundEnabled ? "关闭音效" : "开启音效");
    if (soundEnabled) PlayTone("good");
  });
  dom.projectChoices.addEventListener("click", (event) => {
    const button = event.target.closest("[data-project-id]");
    if (!button) return;
    selectedProjectId = button.dataset.projectId;
    RenderSetupChoices();
  });
  dom.typeChoices.addEventListener("click", (event) => {
    const button = event.target.closest("[data-type-id]");
    if (!button) return;
    selectedGameTypeId = button.dataset.typeId;
    RenderSetupChoices();
  });
  dom.startButton.addEventListener("click", () => {
    const fresh = CreateInitialState();
    const result = StartProject(fresh, selectedProjectId, selectedGameTypeId);
    if (result.ok) BeginWorld(result.state);
  });
  dom.continueButton.addEventListener("click", () => BeginWorld(savedState));
  dom.restartButton.addEventListener("click", () => {
    state = CreateInitialState();
    selectedProjectId = PROJECTS[0].id;
    selectedGameTypeId = GAME_TYPES[0].id;
    localStorage.removeItem(SAVE_KEY);
    savedState = null;
    landingOpen = true;
    dom.endingScreen.classList.add("hidden");
    dom.setupScreen.classList.remove("hidden");
    RenderSetupChoices();
    RenderHud();
  });
}

function Initialize() {
  BuildRoom();
  BuildCollectibles();
  BuildHazards();
  RebuildStaffActors();
  ResizeScene();
  RenderSetupChoices();
  RenderHud();
  BindControls();
  UpdateWorldFromGameState();
  window.setTimeout(() => dom.loadingScreen.classList.add("loaded"), 180);
  Animate();
}

Initialize();
