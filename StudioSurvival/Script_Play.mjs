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
  GetOwnerHairStage,
  HireStaff,
  OWNER_HAIR_STAGES,
  PerformOwnerTask,
  PivotProject,
  PurchaseWorkstation,
  RepayStartupLoan,
  ReleaseBuild,
  SAVE_KEY,
  SelectDirective,
  SelectFoodPlan,
  SetStaffInvestmentLevel,
  Speculate,
  StartProject,
  STARTUP_LOAN_TERMS,
  TakeLoan,
  TalkToStaff,
  ValidateState,
  WORKSTATION_COSTS,
} from "./Script_Rules.mjs?v=20260815c";
import {
  FindLocationAt,
  Locations as WorldLocations,
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
  "hungerBar", "hungerValue", "anxietyBar", "anxietyValue", "soundButton", "soundButtonIcon", "helpButton", "studioMonogram",
  "studioNameHud", "startupDebtValue", "locationValue", "locationRoute", "projectTitle", "missionText", "moduleStrip", "interactionPrompt", "interactionTitle", "interactionDetail",
  "moveLeftButton", "moveRightButton", "jumpButton", "interactButton", "toastStack", "setupScreen",
  "ceremonyIntro", "ceremonyStartButton", "skipCeremonyButton", "ceremonyCaption", "ceremonyCaptionText",
  "foundingNamePanel", "studioNameInput", "studioNameSuggestions", "nameConfirmButton", "setupError",
  "projectContract", "contractStudioName", "gameNameInput", "contractSignatureName", "contractError", "sealButton",
  "projectChoices", "typeChoices", "continueButton", "modalLayer", "modalBackdrop", "sheetKicker",
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
let draftStudioName = state.studioName || "";
let landingOpen = true;
let worldState = CreateWorldState(state.month);
let soundEnabled = true;
let audioContext = null;
let activeInteraction = null;
let resultCloseHandler = null;
let actionCooldown = 0;
let rebuildingWorld = false;
let onboardingPhase = "intro";
let ceremonyElapsed = 0;
let ceremonyBurstStep = -1;
let sealHoldTimer = null;
let sealHoldComplete = false;
let sealKeyboardMode = false;
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
const ceremonyGroup = new THREE.Group();
scene.add(roomGroup, facilityGroup, actorGroup, collectibleGroup, hazardGroup, fxGroup, ceremonyGroup);

const facilityVisuals = new Map();
const staffActors = new Map();
const collectibleVisuals = new Map();
const hazardVisuals = new Map();
const particles = [];
let playerActor = null;
let playerParts = null;
let nearbyRing = null;
let ceremonyFounder = null;
let ceremonyParts = null;
let ceremonyCurtains = null;
let ceremonyPlaque = null;
let ceremonySpotlights = [];

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

function BuildFlatHumanActor(color = 0x8d7cff, owner = false) {
  const group = new THREE.Group();
  const material = (fill) => new THREE.MeshBasicMaterial({ color: fill, toneMapped: false });
  const rectangle = (width, height, fill, z = 0) => {
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(width, height), material(fill));
    mesh.position.z = z;
    return mesh;
  };
  const shadow = new THREE.Mesh(
    new THREE.CircleGeometry(.48, 24),
    new THREE.MeshBasicMaterial({ color: 0x05050a, transparent: true, opacity: .25, depthWrite: false, toneMapped: false }),
  );
  shadow.scale.y = .24;
  shadow.position.set(0, .07, -.02);
  group.add(shadow);
  const torso = rectangle(.76, .88, color, .04);
  torso.position.y = 1.23;
  group.add(torso);
  const head = new THREE.Mesh(new THREE.CircleGeometry(.31, 20), material(owner ? 0xe2ad86 : 0xd9a985));
  head.position.set(0, 1.95, .05);
  group.add(head);
  const hair = new THREE.Mesh(new THREE.CircleGeometry(.32, 20, 0, Math.PI), material(owner ? 0x11121a : 0x24212a));
  hair.position.set(0, 2.04, .06);
  group.add(hair);
  let thinningHair = null;
  let scalpShine = null;
  if (owner) {
    thinningHair = new THREE.Group();
    const hairMaterial = material(0x11121a);
    const tuftOffsets = [-.19, 0, .19];
    tuftOffsets.forEach((xOffset, tuftIndex) => {
      const tuft = new THREE.Mesh(new THREE.PlaneGeometry(.045, tuftIndex === 1 ? .16 : .2), hairMaterial);
      tuft.position.set(xOffset, 2.17 - Math.abs(xOffset) * .1, .07);
      tuft.rotation.z = xOffset * -2.8;
      thinningHair.add(tuft);
    });
    group.add(thinningHair);
    scalpShine = new THREE.Mesh(
      new THREE.CircleGeometry(.065, 12),
      new THREE.MeshBasicMaterial({ color: 0xffead7, transparent: true, opacity: .72, depthWrite: false, toneMapped: false }),
    );
    scalpShine.scale.set(.58, 1, 1);
    scalpShine.position.set(.095, 2.14, .071);
    group.add(scalpShine);
    thinningHair.visible = false;
    scalpShine.visible = false;
  }
  const leftLeg = rectangle(.21, .7, 0x24283a, .02);
  const rightLeg = rectangle(.21, .7, 0x24283a, .02);
  leftLeg.position.set(-.2, .46, .02);
  rightLeg.position.set(.2, .46, .02);
  group.add(leftLeg, rightLeg);
  const leftArm = rectangle(.17, .68, color, .03);
  const rightArm = rectangle(.17, .68, color, .03);
  leftArm.position.set(-.48, 1.3, .03);
  rightArm.position.set(.48, 1.3, .03);
  group.add(leftArm, rightArm);
  group.userData.flat = true;
  group.userData.parts = { torso, head, hair, thinningHair, scalpShine, leftLeg, rightLeg, leftArm, rightArm, shadow };
  return group;
}

function ApplyOwnerHairStage() {
  if (!playerParts?.hair) return;
  const hairStage = GetOwnerHairStage(state.month);
  playerParts.hair.visible = hairStage === OWNER_HAIR_STAGES.full;
  if (playerParts.thinningHair) playerParts.thinningHair.visible = hairStage === OWNER_HAIR_STAGES.thinning;
  if (playerParts.scalpShine) playerParts.scalpShine.visible = hairStage !== OWNER_HAIR_STAGES.full;
  if (playerActor) playerActor.userData.hairStage = hairStage;
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

function BuildFlatAiActor(color = 0x66b8ff) {
  const group = new THREE.Group();
  const glow = new THREE.Mesh(
    new THREE.CircleGeometry(.54, 24),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .18, toneMapped: false }),
  );
  glow.position.set(0, 1.25, -.02);
  const body = new THREE.Mesh(
    new THREE.CircleGeometry(.43, 4),
    new THREE.MeshBasicMaterial({ color, toneMapped: false }),
  );
  body.rotation.z = Math.PI / 4;
  body.position.set(0, 1.25, .03);
  const face = Box(.42, .18, .03, 0x080a10, { castShadow: false });
  face.position.set(0, 1.25, .07);
  const stand = Box(.11, .7, .02, color, { castShadow: false });
  stand.position.set(0, .55, .01);
  group.add(glow, body, face, stand);
  group.userData.flat = true;
  group.userData.parts = { ring: glow, body };
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
  homeComputer: ["家里的电脑", "唯一的初始工位", 0x9d8cff],
  homeFridge: ["自己家的冰箱", "剩饭也有保质期", 0x9fd7ff],
  diner: ["小菜馆", "便宜充饥套餐", 0xffd166],
  snackShelf: ["零食架", "泡面饼干顶一顶", 0x68e0a0],
  speculation: ["彩票柜台", "本月限疯一次", 0xff6eae],
  equipmentShop: ["设备柜台", "先买电脑再招人", 0x66b8ff],
  talentMarket: ["人才市场", "工资 / AI 月租", 0x9d8cff],
  bank: ["银行", "启动贷 M08 到期", 0xff6eae],
  hotel: ["大酒店", "吃顿像人的饭", 0xffb45f],
};

function GetFacilityKind(interaction) {
  return {
    lotteryMachine: "speculation",
  }[interaction.kind] || interaction.kind;
}

function GetCollectibleModule(item, index = 0) {
  return item.moduleKey || MODULE_KEYS[index % MODULE_KEYS.length];
}

function BuildFacility(interaction) {
  const group = new THREE.Group();
  const kind = GetFacilityKind(interaction);
  const [title, subtitle, color] = FacilityLooks[kind] || [interaction.label || interaction.id, "靠近按 E", 0x9d8cff];
  group.position.set(interaction.x, interaction.y || 0, .08);
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(.72, .86, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .34, side: THREE.DoubleSide, toneMapped: false }),
  );
  marker.scale.y = .28;
  marker.position.set(0, .08, -.02);
  group.add(marker);
  if (kind === "homeComputer" || kind === "equipmentShop") {
    const desk = Box(1.9, .16, .08, 0x302f42, { castShadow: false });
    desk.position.y = .92;
    const monitor = Box(.92, .66, .08, 0x10111a, { castShadow: false });
    monitor.position.set(0, 1.38, .02);
    const screen = Box(.75, .49, .02, color, { emissive: color, emissiveIntensity: .65, castShadow: false });
    screen.position.set(0, 1.38, .07);
    const legLeft = Box(.1, .9, .06, 0x242534, { castShadow: false });
    const legRight = legLeft.clone();
    legLeft.position.set(-.7, .46, 0);
    legRight.position.set(.7, .46, 0);
    group.add(desk, monitor, screen, legLeft, legRight);
  } else if (kind === "homeFridge") {
    const fridge = Box(1.25, 2.55, 1.05, 0x343a4b, { metalness: .18 });
    fridge.position.y = 1.28;
    const glow = Box(.78, .15, .04, color, { emissive: color, emissiveIntensity: 1.1, castShadow: false });
    glow.position.set(0, 1.75, .55);
    group.add(fridge, glow);
  } else if (["bank", "speculation"].includes(kind)) {
    const kiosk = Box(1.35, 2.1, .8, 0x242838, { metalness: .22 });
    kiosk.position.y = 1.05;
    const screen = Box(.88, .72, .03, color, { emissive: color, emissiveIntensity: .92, castShadow: false });
    screen.position.set(0, 1.42, .42);
    group.add(kiosk, screen);
  } else if (kind === "talentMarket") {
    const counter = Box(2.4, .85, .08, 0x28314a, { castShadow: false });
    counter.position.y = .43;
    const personA = BuildFlatHumanActor(0x66b8ff, false);
    const personB = BuildFlatHumanActor(0xffd166, false);
    personA.scale.setScalar(.72);
    personB.scale.setScalar(.72);
    personA.position.set(-.58, .78, -.03);
    personB.position.set(.58, .78, -.03);
    group.add(counter, personA, personB);
  } else if (kind === "snackShelf") {
    const shelf = Box(2.2, 2.1, .08, 0x28423c, { castShadow: false });
    shelf.position.y = 1.05;
    for (const y of [.5, 1.05, 1.6]) {
      const row = Box(1.85, .12, .04, color, { emissive: color, emissiveIntensity: .3, castShadow: false });
      row.position.set(0, y, .08);
      group.add(row);
    }
    group.add(shelf);
  } else {
    const counter = Box(2.4, 1.05, .12, kind === "hotel" ? 0x6b4d32 : 0x4b3a2e, { castShadow: false });
    counter.position.y = .53;
    const bowl = Cylinder(.34, .24, .18, color, 18);
    bowl.rotation.x = Math.PI / 2;
    bowl.position.set(0, 1.18, .05);
    group.add(counter, bowl);
  }
  const sign = TextPlane(title, subtitle, 2.5, `#${color.toString(16).padStart(6, "0")}`);
  sign.position.set(0, 3.05, .22);
  group.add(sign);
  group.userData.marker = marker;
  group.userData.interactionId = interaction.id;
  group.userData.kind = kind;
  facilityVisuals.set(interaction.id, group);
  facilityGroup.add(group);
}

function BuildRoom() {
  const width = Math.abs(WorldBounds.maxX - WorldBounds.minX) + 4;
  const floor = Box(width, .24, .18, 0x171925, { castShadow: false, roughness: .95 });
  floor.position.set((WorldBounds.maxX + WorldBounds.minX) / 2, -.14, 0);
  roomGroup.add(floor);
  WorldLocations.forEach((location, index) => {
    const locationWidth = location.endX - location.startX;
    const centerX = location.startX + locationWidth / 2;
    const wall = Box(locationWidth - .08, 6.5, .08, HexColor(location.color), { castShadow: false, roughness: 1 });
    wall.position.set(centerX, 3.15, -.32);
    roomGroup.add(wall);
    const lowerBand = Box(locationWidth - .08, .75, .05, index % 2 ? 0x161824 : 0x1d1d2b, { castShadow: false });
    lowerBand.position.set(centerX, .38, -.18);
    roomGroup.add(lowerBand);
    const locationSign = TextPlane(location.name, location.subtitle, 5.4, location.accent);
    locationSign.position.set(centerX, 5.55, -.12);
    roomGroup.add(locationSign);
    const divider = Box(.1, 6.55, .05, 0x090b12, { castShadow: false });
    divider.position.set(location.endX, 3.15, -.08);
    roomGroup.add(divider);
    for (let windowIndex = 0; windowIndex < 2; windowIndex += 1) {
      const pane = Box(1.7, 1.4, .03, index % 2 ? 0x222b3b : 0x1e293a, { emissive: HexColor(location.accent), emissiveIntensity: .06, castShadow: false });
      pane.position.set(location.startX + 2.2 + windowIndex * 5.4, 3.85, -.22);
      roomGroup.add(pane);
    }
  });
  WorldInteractions.forEach(BuildFacility);
  const ambient = new THREE.HemisphereLight(0xd8deff, 0x6a506e, 2.55);
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(4, 8, 10);
  scene.add(ambient, key);
}

function BuildCeremonyScene() {
  DisposeGroup(ceremonyGroup);
  ceremonySpotlights = [];
  const stageX = 6;
  const floor = Box(13, .42, 4.8, 0x191726, { roughness: .45, metalness: .08 });
  floor.position.set(stageX, -.15, 0);
  const carpet = Box(10.5, .04, 1.75, 0x5b1734, { roughness: .9, castShadow: false });
  carpet.position.set(stageX - 2, .08, .9);
  const backdrop = Box(9.4, 6.2, .25, 0x131525, { castShadow: false });
  backdrop.position.set(stageX, 3.05, -2.05);
  ceremonyGroup.add(floor, carpet, backdrop);
  for (const offset of [-4.35, 4.35]) {
    const column = Cylinder(.32, .48, 5.6, 0x3a3454, 16);
    column.position.set(stageX + offset, 2.7, -1.72);
    ceremonyGroup.add(column);
  }
  const header = TextPlane("公司成立仪式", "FOUNDING · DEBT · SURVIVAL", 6.8, "#ffd166");
  header.position.set(stageX, 5.35, -1.75);
  ceremonyGroup.add(header);
  ceremonyPlaque = TextPlane("等待命名", "今天成立 · M08 可能清算", 5.6, "#f5f0dd");
  ceremonyPlaque.position.set(stageX, 3.55, -1.68);
  ceremonyPlaque.scale.set(.82, .82, .82);
  ceremonyGroup.add(ceremonyPlaque);
  const leftCurtain = Box(2.75, 3.2, .18, 0x6f1736, { roughness: .92 });
  const rightCurtain = leftCurtain.clone();
  leftCurtain.position.set(stageX - 1.38, 3.55, -1.48);
  rightCurtain.position.set(stageX + 1.38, 3.55, -1.48);
  ceremonyCurtains = { left: leftCurtain, right: rightCurtain, closedLeftX: stageX - 1.38, closedRightX: stageX + 1.38 };
  ceremonyGroup.add(leftCurtain, rightCurtain);
  const ribbon = Box(5.3, .1, .08, 0xffd166, { emissive: 0xffb347, emissiveIntensity: .45 });
  ribbon.position.set(stageX, 1.08, 1.22);
  ceremonyGroup.add(ribbon);
  ceremonyFounder = BuildHumanActor(0x9d8cff, true);
  ceremonyFounder.position.set(-2.2, 0, .72);
  ceremonyParts = ceremonyFounder.userData.parts;
  ceremonyGroup.add(ceremonyFounder);
  for (const [index, x] of [1.25, 10.7].entries()) {
    const cameraBody = Box(.75, .52, .55, 0x171923, { metalness: .35 });
    cameraBody.position.set(x, 1.25, 1.75);
    const lens = Cylinder(.18, .23, .3, 0x0a0b11, 16);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(x, 1.25, 1.42);
    const flash = new THREE.PointLight(0xeaf3ff, 0, 8, 2);
    flash.position.set(x, 2.1, 2.2);
    flash.userData.phase = index * 1.7;
    ceremonySpotlights.push(flash);
    ceremonyGroup.add(cameraBody, lens, flash);
  }
  const warm = new THREE.SpotLight(0xffd166, 42, 24, .42, .5, 1.5);
  warm.position.set(stageX - 4, 8, 6);
  warm.target.position.set(stageX, 1.5, 0);
  const violet = new THREE.SpotLight(0x9d8cff, 35, 24, .46, .55, 1.5);
  violet.position.set(stageX + 4, 7, 5);
  violet.target.position.set(stageX, 1.7, 0);
  ceremonySpotlights.push(warm, violet);
  ceremonyGroup.add(warm, warm.target, violet, violet.target);
  ceremonyGroup.visible = false;
}

function ReplaceCeremonyPlaque(studioName) {
  if (ceremonyPlaque) {
    ceremonyGroup.remove(ceremonyPlaque);
    ceremonyPlaque.geometry?.dispose?.();
    ceremonyPlaque.material?.map?.dispose?.();
    ceremonyPlaque.material?.dispose?.();
  }
  ceremonyPlaque = TextPlane(studioName, "今日成立 · 全部身家担保", 5.8, "#fff1b8");
  ceremonyPlaque.position.set(6, 3.55, -1.68);
  ceremonyPlaque.scale.set(.35, .35, .35);
  ceremonyGroup.add(ceremonyPlaque);
}

function SetPlayableWorldVisible(visible) {
  roomGroup.visible = visible;
  facilityGroup.visible = visible;
  actorGroup.visible = visible;
  collectibleGroup.visible = visible;
  hazardGroup.visible = visible;
  ceremonyGroup.visible = !visible && onboardingPhase !== "intro";
}

function ShowFoundingNamePanel() {
  if (onboardingPhase === "naming") return;
  onboardingPhase = "naming";
  ceremonyElapsed = 0;
  dom.skipCeremonyButton.classList.add("hidden");
  dom.ceremonyCaption.classList.add("hidden");
  dom.foundingNamePanel.classList.remove("hidden");
  dom.studioNameInput.focus({ preventScroll: true });
}

function ShowProjectContract() {
  onboardingPhase = "contract";
  ceremonyElapsed = 0;
  dom.foundingNamePanel.classList.add("hidden");
  dom.projectContract.classList.remove("hidden");
  dom.contractStudioName.textContent = draftStudioName;
  dom.contractSignatureName.textContent = draftStudioName;
  if (!dom.gameNameInput.value.trim()) {
    const template = FindProject(selectedProjectId);
    dom.gameNameInput.value = template?.title?.replace(/[《》]/g, "") || "";
  }
  RenderSetupChoices();
  window.setTimeout(() => dom.gameNameInput.focus({ preventScroll: true }), 220);
}

function UpdateCeremony(delta, time) {
  if (onboardingPhase === "intro" || onboardingPhase === "game") return false;
  ceremonyElapsed += delta;
  const stageX = 6;
  const founder = ceremonyFounder;
  ceremonyGroup.visible = true;
  if (onboardingPhase === "cinematic") {
    const walk = Clamp((ceremonyElapsed - .35) / 2.45, 0, 1);
    founder.position.x = -2.2 + (stageX - .55 + 2.2) * (1 - Math.pow(1 - walk, 3));
    const stride = walk < 1 ? Math.sin(ceremonyElapsed * 11) * .72 : 0;
    ceremonyParts.leftLeg.rotation.x = stride;
    ceremonyParts.rightLeg.rotation.x = -stride;
    ceremonyParts.leftArm.rotation.x = -stride * .75;
    ceremonyParts.rightArm.rotation.x = stride * .75;
    founder.rotation.y = 0;
    const open = Clamp((ceremonyElapsed - 2.75) / 1.15, 0, 1);
    ceremonyCurtains.left.position.x = ceremonyCurtains.closedLeftX - open * 2.05;
    ceremonyCurtains.right.position.x = ceremonyCurtains.closedRightX + open * 2.05;
    ceremonyPlaque.scale.setScalar(.82 + open * .18);
    const caption = ceremonyElapsed < 1.55 ? "创始人入场"
      : ceremonyElapsed < 2.8 ? "全部身家担保文件已生效"
        : ceremonyElapsed < 4.25 ? "为一家尚未赚钱的公司揭牌"
          : "请为公司命名";
    dom.ceremonyCaptionText.textContent = caption;
    if (ceremonyElapsed > 3.75 && ceremonyBurstStep < 0) {
      ceremonyBurstStep = 0;
      SpawnParticles(stageX, 3.9, 0xffd166, 34);
      PlayTone("release");
    }
    ceremonySpotlights.slice(0, 2).forEach((light, index) => {
      const pulse = Math.sin(ceremonyElapsed * 8 + index * 2.3) > .93 ? 9 : 0;
      light.intensity = pulse;
    });
    if (ceremonyElapsed >= 5.25) ShowFoundingNamePanel();
  } else {
    founder.position.set(stageX - .55, 0, .72);
    ceremonyParts.leftLeg.rotation.x = 0;
    ceremonyParts.rightLeg.rotation.x = 0;
    ceremonyParts.leftArm.rotation.x = -.18 + Math.sin(time * 1.7) * .05;
    ceremonyParts.rightArm.rotation.x = .18;
    ceremonyCurtains.left.position.x = ceremonyCurtains.closedLeftX - 2.05;
    ceremonyCurtains.right.position.x = ceremonyCurtains.closedRightX + 2.05;
  }
  if (onboardingPhase === "plaque") {
    const reveal = Clamp(ceremonyElapsed / .9, 0, 1);
    ceremonyPlaque.scale.setScalar(.35 + (1 - Math.pow(1 - reveal, 3)) * .65);
    ceremonyPlaque.rotation.z = (1 - reveal) * -.08;
    if (ceremonyElapsed > .35 && ceremonyBurstStep < 1) {
      ceremonyBurstStep = 1;
      SpawnParticles(stageX, 3.9, 0x9d8cff, 42);
      PlayTone("release");
    }
    if (ceremonyElapsed > 1.85) ShowProjectContract();
  }
  camera.position.set(stageX + Math.sin(time * .38) * .12, 5.35, 13.4);
  camera.lookAt(stageX, 2.15, 0);
  renderer.toneMappingExposure = 1.15;
  scene.background.setHex(0x080910);
  return true;
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
  playerActor = BuildFlatHumanActor(0x9d8cff, true);
  playerActor.position.set(worldState.x, worldState.y, .65);
  playerParts = playerActor.userData.parts;
  actorGroup.add(playerActor);
  playerActor.visible = onboardingPhase === "game";
  for (let index = 0; index < (state.workstations || 0); index += 1) {
    const desk = new THREE.Group();
    const tabletop = Box(.78, .08, .04, 0x343247, { castShadow: false });
    tabletop.position.y = .82;
    const monitor = Box(.44, .34, .025, 0x10121b, { castShadow: false });
    monitor.position.set(0, 1.08, .02);
    const screen = Box(.34, .24, .015, index < state.team.length ? 0x66b8ff : 0x292c38, { emissive: index < state.team.length ? 0x66b8ff : 0, emissiveIntensity: .45, castShadow: false });
    screen.position.set(0, 1.08, .04);
    desk.position.set(3.75 + index * 1.02, 0, .02);
    desk.add(tabletop, monitor, screen);
    actorGroup.add(desk);
  }
  state.team.forEach((member, index) => {
    const staff = FindStaff(member.id);
    const color = HexColor(staff.color);
    const actor = staff.kind === "ai" ? BuildFlatAiActor(color) : BuildFlatHumanActor(color, false);
    actor.scale.setScalar(.72);
    actor.position.set(3.75 + index * 1.02, .02, .12);
    actor.userData.baseY = actor.position.y;
    actor.userData.staffId = staff.id;
    actor.userData.phase = index * 1.7;
    actor.userData.label = TextPlane(staff.name, staff.kind === "ai" ? "按月计费" : staff.role, 1.65, staff.color);
    actor.userData.label.position.set(0, staff.kind === "ai" ? 2.25 : 2.55, .1);
    actor.add(actor.userData.label);
    staffActors.set(staff.id, actor);
    actorGroup.add(actor);
  });
  ApplyOwnerHairStage();
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
  });
}

function UpdateLocationIndicator() {
  const location = FindLocationAt(worldState.x);
  if (!location) return;
  dom.locationValue.textContent = location.name;
  dom.locationRoute.innerHTML = WorldLocations.map((item) => `<i class="${item.id === location.id ? "active" : ""}" title="${EscapeHtml(item.name)}"></i>`).join("");
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
    const rotationAxis = playerActor.userData.flat ? "z" : "x";
    playerParts.leftLeg.rotation[rotationAxis] = stride;
    playerParts.rightLeg.rotation[rotationAxis] = -stride;
    playerParts.leftArm.rotation[rotationAxis] = -stride * .8;
    playerParts.rightArm.rotation[rotationAxis] = stride * .8;
    playerActor.scale.x += ((worldState.facing || 1) - playerActor.scale.x) * .28;
    playerParts.torso.rotation.z = moving ? -(worldState.vx || 0) * .015 : Math.sin(time * 1.7) * .008;
    if (worldState.y > previousY + .02) playerParts.leftArm.rotation[rotationAxis] = -1.05;
  }

  staffActors.forEach((actor) => {
    if (actor.userData.parts?.ring) {
      actor.position.y = actor.userData.baseY + Math.sin(time * 2 + actor.userData.phase) * .08;
      actor.userData.parts.body.rotation[actor.userData.flat ? "z" : "y"] += delta * .55;
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

  const ceremonyActive = UpdateCeremony(delta, time);
  if (!ceremonyActive) {
    const anxiety = Clamp((state.anxiety - 45) / 55, 0, 1);
    const shake = anxiety * anxiety;
    const targetCameraX = (worldState.cameraX ?? Math.max(0, worldState.x - 7)) + 7;
    camera.position.set(targetCameraX + Math.sin(time * 17) * shake * .1, 3.4 + Math.cos(time * 14) * shake * .06, 13.5);
    camera.lookAt(targetCameraX, 3.1, 0);
    renderer.toneMappingExposure = 1.42 + Math.sin(time * 8) * shake * .06;
    scene.background.setRGB(.028 + shake * .075, .034 - shake * .01, .06 + shake * .012);
  }
  UpdateLocationIndicator();
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
  const studioName = state.studioName || "尚未成立";
  dom.studioNameHud.textContent = studioName;
  dom.studioMonogram.textContent = studioName === "尚未成立" ? "未" : Array.from(studioName)[0] || "创";
  dom.monthValue.textContent = `M${String(state.month).padStart(2, "0")}`;
  ApplyOwnerHairStage();
  dom.cashValue.textContent = FormatMoney(state.cash);
  const startupLoan = state.startupLoan;
  dom.startupDebtValue.textContent = startupLoan?.status === "repaid"
    ? "已结清"
    : startupLoan?.status === "defaulted"
      ? "已清算"
      : `M${String(startupLoan?.dueMonth || STARTUP_LOAN_TERMS.dueMonth).padStart(2, "0")} / ${FormatGoalMoney(startupLoan?.remaining ?? STARTUP_LOAN_TERMS.totalDue)}`;
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
  dom.sceneVignette.style.opacity = String(.38 + Clamp(state.anxiety / 100, 0, 1) * .4);
  dom.projectTitle.textContent = project?.name ? `《${project.name}》` : template?.title || "先开一家公司";
  const tensions = project ? CalculateTensions(project) : [];
  const anxietyState = GetAnxietyState(state.anxiety);
  dom.missionText.textContent = tensions[0]?.title
    || project?.buildStatus?.detail
    || (gameType ? `${gameType.name} · ${project.isReleased ? `v${project.version}.0 已上线` : `开发第 ${project.age + 1} 月`} · ${anxietyState.label}` : `${anxietyState.label}。移动到对应地点按 E。`);
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

function OpenFoodSheet(planId, placeName) {
  const plan = FindFoodPlan(planId);
  if (!plan) return;
  const options = planId === "leftovers" ? [plan, FindFoodPlan("skip")] : [plan];
  OpenPanel("FOOD IS PRODUCTION", placeName, `
    <p class="panelIntro">你是在决定这个月的主要吃法。月结时扣钱，并直接改变饥饿、焦虑和整个团队的有效产出。</p>
    <div class="worldGrid">${options.map((food) => `
      <button class="worldChoice ${state.foodPlan === food.id ? "selected" : ""}" data-food-id="${food.id}" type="button">
        <div class="choiceTop"><strong>${food.icon} ${EscapeHtml(food.name)}</strong><span>${FormatMoney(food.monthlyCost)}/月</span></div>
        <p>${EscapeHtml(food.description)}</p>
        <div class="choiceFooter"><span>饥饿 ${food.hungerDelta >= 0 ? "+" : ""}${food.hungerDelta}</span><b>产出 ×${food.outputMultiplier}</b></div>
      </button>`).join("")}</div>
    <div class="noteList"><div class="note ${planId === "feast" ? "good" : ""}">${state.foodPlan === planId ? "本月已经决定在这里解决吃饭。" : `当前吃法：${EscapeHtml(FindFoodPlan(state.foodPlan)?.name || "未知")}`}</div></div>`, () => {
    dom.sheetBody.onclick = (event) => {
      const button = event.target.closest("[data-food-id]");
      if (!button) return;
      if (ApplyInteractiveResult(SelectFoodPlan(state, button.dataset.foodId))) OpenFoodSheet(planId, placeName);
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
    <div class="panelSection"><button class="miniButton" data-back type="button">← 返回人才市场</button></div>`, () => {
    dom.sheetBody.onclick = (event) => {
      if (event.target.closest("[data-back]")) return OpenTalentSheet();
      const button = event.target.closest("[data-level]");
      if (!button) return;
      if (ApplyInteractiveResult(SetStaffInvestmentLevel(state, staffId, Number(button.dataset.level)))) OpenInvestmentSheet(staffId);
    };
  });
}

function OpenEquipmentSheet() {
  const count = state.workstations || 0;
  const nextCost = WORKSTATION_COSTS[count];
  const freeSeats = Math.max(0, count - state.team.length);
  OpenPanel("EQUIPMENT COUNTER", "人才市场：先买设备，再谈梦想", `
    <p class="panelIntro">老板自己的电脑只能老板用。大学生和 AI 每人都要占一套额外工位：电脑、显示器、桌椅和一只假装能保护颈椎的支架。员工离开后，设备会留下。</p>
    <div class="metricGrid">
      <div class="metricTile"><span>已购工位</span><strong>${count}/4</strong></div>
      <div class="metricTile"><span>已被占用</span><strong>${state.team.length}</strong></div>
      <div class="metricTile"><span>空工位</span><strong>${freeSeats}</strong></div>
    </div>
    <div class="workstationPreview">${WORKSTATION_COSTS.map((cost, index) => `<div class="${index < count ? "owned" : index === count ? "next" : ""}"><span>${index < count ? "✓" : index + 1}</span><strong>工位 ${index + 1}</strong><small>${index < count ? "已经搬回家" : FormatMoney(cost)}</small></div>`).join("")}</div>
    <div class="noteList"><div class="note danger">第一次招聘也不例外：没有第一套设备，就不能雇第一个人或租第一个 AI。</div></div>
    <div class="panelSection choiceFooter"><span>${nextCost ? `下一套设备 ${FormatMoney(nextCost)}` : "家里已经塞不下第五套"}</span><button class="primaryButton" data-buy-workstation type="button" ${!nextCost || state.cash < nextCost ? "disabled" : ""}>${nextCost ? `购买第 ${count + 1} 套` : "已买满"}</button></div>`, () => {
    dom.sheetBody.onclick = (event) => {
      if (!event.target.closest("[data-buy-workstation]")) return;
      const result = PurchaseWorkstation(state);
      if (ApplyInteractiveResult(result, { rebuildStaff: true, tone: "warning" })) OpenEquipmentSheet();
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
      <div class="choiceFooter" style="margin-top:9px"><span>${hired ? "已占用一套设备" : state.team.length < state.workstations ? "有空工位，雇了下月开始烧钱" : "没有空工位"}</span><span>${hired
        ? `<button class="miniButton" data-staff-action="talk" data-staff-id="${staff.id}" type="button">聊聊</button> <button class="miniButton" data-staff-action="pay" data-staff-id="${staff.id}" type="button">调待遇</button> <button class="dangerButton" data-staff-action="fire" data-staff-id="${staff.id}" type="button">${staff.kind === "ai" ? "退订" : "开除"}</button>`
        : `<button class="miniButton" data-staff-action="hire" data-staff-id="${staff.id}" type="button" ${state.team.length >= state.workstations ? "disabled" : ""}>${staff.kind === "ai" ? "开始月租" : "雇佣"}</button>`}</span></div>
    </article>`;
  };
  OpenPanel("TALENT MARKET", `人才市场 · ${state.team.length}/${state.workstations || 0} 工位`, `
    <p class="panelIntro">大学生有真实姓名、工资和情绪；AI 有月租、上下文漂移和自动续费。当前预计人力成本 ${FormatMoney(costs.studentWages + costs.aiRent)}/月。${state.workstations ? "" : "你还没买第一套员工设备。"}</p>
    <div class="choiceFooter"><span>设备不会随员工离开，但每个人都必须有空工位</span><button class="miniButton" data-equipment type="button">去设备柜台</button></div>
    <div class="sectionHeading"><strong>大学生</strong><span>加薪提升有限，但会少想跑路</span></div>
    <div class="worldGrid">${STAFF_CATALOG.filter((staff) => staff.kind === "student").map(RenderStaffCard).join("")}</div>
    <div class="panelSection sectionHeading"><strong>AI 订阅</strong><span>贵模型速度和质量提升更明显</span></div>
    <div class="worldGrid">${STAFF_CATALOG.filter((staff) => staff.kind === "ai").map(RenderStaffCard).join("")}</div>`, () => {
    dom.sheetBody.onclick = (event) => {
      if (event.target.closest("[data-equipment]")) return OpenEquipmentSheet();
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
    <div class="chipRow">${hired.length ? hired.map((staff) => `<button class="miniButton" data-chat-id="${staff.id}" type="button">${EscapeHtml(staff.name)}</button>`).join("") : `<span class="chip">没人。先去人才市场买设备，再雇一个会回消息的。</span>`}</div>`, () => {
    dom.sheetBody.onclick = (event) => {
      const chat = event.target.closest("[data-chat-id]");
      if (chat) return OpenStaffSheet(chat.dataset.chatId);
      const source = event.target.closest("[data-source-id]");
      if (source) OpenCustomizationSheet(source.dataset.sourceId);
    };
  });
}

function OpenHomeComputerSheet() {
  const evaluation = EvaluateProject(state);
  const loan = state.startupLoan;
  const monthsLeft = loan?.status === "active" ? Math.max(0, loan.dueMonth - state.month + 1) : 0;
  OpenPanel("HOME COMPUTER", `家里的电脑 · 《${EscapeHtml(state.project.name)}》`, `
    <p class="panelIntro">这是老板唯一不需要额外购买的工位。开发、对话、项目方向、宣发、发布和月结都从这台电脑处理；员工只能使用你另买的设备。</p>
    <div class="metricGrid">
      <div class="metricTile"><span>当前预估评分</span><strong>${evaluation.rating.toFixed(1)}</strong></div>
      <div class="metricTile"><span>老板本月硬干</span><strong>${state.ownerWorkCount}/3</strong></div>
      <div class="metricTile"><span>启动贷</span><strong>${loan?.status === "repaid" ? "已清" : `${monthsLeft} 月 / ${FormatGoalMoney(loan?.remaining || 0)}`}</strong></div>
    </div>
    <div class="computerActions">
      ${MODULE_KEYS.map((moduleKey) => { const meta = MODULE_META[moduleKey]; return `<button data-computer-action="work" data-module-key="${moduleKey}" type="button"><span style="color:${meta.color}">${meta.icon}</span><strong>${meta.label}开发</strong><small>${Math.round(state.project.modules[moduleKey])} / 100</small></button>`; }).join("")}
      <button data-computer-action="chat" type="button"><span>▤</span><strong>群聊 / 垃圾话</strong><small>自己、大学生、AI</small></button>
      <button data-computer-action="direction" type="button"><span>⌁</span><strong>项目方向</strong><small>策略、玩法、换赛道</small></button>
      <button data-computer-action="marketing" type="button"><span>◈</span><strong>线上宣发</strong><small>吹大了就退款</small></button>
      <button data-computer-action="release" type="button"><span>↑</span><strong>${state.project.isReleased ? "发布更新" : "提交商店"}</strong><small>${state.project.age < 2 ? "至少再熬两个月" : "评分差也能发"}</small></button>
      <button class="danger" data-computer-action="month" type="button"><span>◷</span><strong>熬完这个月</strong><small>工资、房租、饭钱一起扣</small></button>
    </div>
    <div class="panelSection">${RenderLog(5)}</div>`, () => {
    dom.sheetBody.onclick = (event) => {
      const button = event.target.closest("[data-computer-action]");
      if (!button) return;
      const action = button.dataset.computerAction;
      if (action === "work") return OpenWorkstationSheet({ moduleKey: button.dataset.moduleKey });
      if (action === "chat") return OpenAiTerminalSheet();
      if (action === "direction") return OpenDirectiveSheet();
      if (action === "marketing") return OpenMarketingSheet();
      if (action === "release") return OpenReleaseSheet();
      if (action === "month") return OpenMonthSheet();
    };
  });
}

function OpenWorkstationSheet(interaction) {
  const moduleKey = interaction.moduleKey;
  const meta = MODULE_META[moduleKey];
  const workers = state.team.map((member) => ({ member, staff: FindStaff(member.id) })).filter((item) => item.staff?.specialty === moduleKey);
  const relatedTensions = CalculateTensions(state.project).filter((tension) => tension.from === moduleKey || tension.to === moduleKey);
  OpenPanel("OWNER WORK", `${meta.icon} 老板亲自做${meta.label}`, `
    <p class="panelIntro">你坐回家里唯一的电脑亲自干活：立刻得到 2–4 点低质量进度，也会产生 Bug、范围债和技术债。老板每月最多硬干三次。</p>
    ${RenderBar(`${meta.label}进度`, state.project.modules[moduleKey], meta.color)}
    <div class="metricGrid">
      <div class="metricTile"><span>老板本月硬干</span><strong>${state.ownerWorkCount}/3</strong></div>
      <div class="metricTile"><span>Bug</span><strong>${Math.round(state.project.bugs)}</strong></div>
      <div class="metricTile"><span>技术债 / 范围债</span><strong>${Math.round(state.project.technicalDebt)} / ${Math.round(state.project.scopeDebt)}</strong></div>
    </div>
    <div class="panelSection choiceFooter"><span>${EscapeHtml(meta.description)}</span><button class="primaryButton" data-owner-work type="button" ${state.ownerWorkCount >= 3 ? "disabled" : ""}>亲自干一次</button></div>
    <div class="panelSection sectionHeading"><strong>擅长这个模块的成员</strong><span>${workers.length ? "在家里的额外工位上，月结时产出" : "目前只有老板的背影"}</span></div>
    <div class="chipRow">${workers.length ? workers.map(({ staff }) => `<button class="miniButton" data-worker-id="${staff.id}" type="button">跟 ${EscapeHtml(staff.name)} 聊</button>`).join("") : `<button class="miniButton" data-talent type="button">去人才市场找人</button>`}</div>
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
  const startupLoan = state.startupLoan;
  const monthsLeft = startupLoan?.status === "active" ? Math.max(0, startupLoan.dueMonth - state.month + 1) : 0;
  OpenPanel("BANK", "银行：成立仪式的掌声已经开始计息", `
    <p class="panelIntro">最上面那笔创业启动贷来自你的全部身家：没有月供缓冲，到期必须清零。其他抵押贷按月扣款；开发电脑一旦抵押，立即结束。</p>
    <section class="startupLoanCard ${startupLoan?.status || "pending"}">
      <div><span>创业启动贷 · 全部身家担保</span><strong>${startupLoan?.status === "repaid" ? "已结清" : `尚欠 ${FormatMoney(startupLoan?.remaining || 0)}`}</strong><small>${startupLoan?.status === "active" ? `距离 M${String(startupLoan.dueMonth).padStart(2, "0")} 清算还有 ${monthsLeft} 个月` : startupLoan?.status === "repaid" ? "公司暂时重新属于你" : "等待合同生效"}</small></div>
      <div class="loanDeadline"><b>${startupLoan?.status === "repaid" ? "✓" : `M${String(startupLoan?.dueMonth || 0).padStart(2, "0")}`}</b><span>${startupLoan?.status === "repaid" ? "PAID" : "DEADLINE"}</span></div>
    </section>
    ${startupLoan?.status === "active" ? `<div class="loanPaymentRow"><button data-startup-payment="10000" type="button" ${state.cash < 10000 ? "disabled" : ""}>先还 ¥10,000</button><button data-startup-payment="30000" type="button" ${state.cash < 30000 ? "disabled" : ""}>先还 ¥30,000</button><button data-startup-payment="full" type="button" ${state.cash < startupLoan.remaining ? "disabled" : ""}>一次结清 ${FormatMoney(startupLoan.remaining)}</button></div>` : ""}
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
    <div class="noteList">${activeLoans.length ? activeLoans.map((loan) => { const asset = FindCollateral(loan.collateralId); return `<div class="note">${EscapeHtml(asset.name)} · 剩 ${loan.remaining} 期 · 月供 ${FormatMoney(loan.monthlyPayment)}</div>`; }).join("") : `<div class="note good">没有追加抵押贷。但创业启动贷仍然算贷款。</div>`}</div>`, () => {
    dom.sheetBody.onclick = (event) => {
      const startupPayment = event.target.closest("[data-startup-payment]");
      if (startupPayment) {
        const value = startupPayment.dataset.startupPayment === "full" ? "full" : Number(startupPayment.dataset.startupPayment);
        const result = RepayStartupLoan(state, value);
        if (ApplyInteractiveResult(result, { tone: result?.repaid ? "good" : "normal" })) OpenBankSheet();
        return;
      }
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
  OpenPanel("PROJECT DOCUMENT", "电脑里的项目文档：方向、玩法与换赛道", `
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
  OpenPanel("HYPE BEFORE QUALITY", "电脑：先吹，还是先做", `
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
  OpenPanel("SHIP IT / REGRET IT", state.project.isReleased ? `《${EscapeHtml(state.project.name)}》发布更新` : `把《${EscapeHtml(state.project.name)}》提交商店`, `
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
  const startupLoan = state.startupLoan;
  const monthsLeft = startupLoan?.status === "active" ? Math.max(0, startupLoan.dueMonth - state.month + 1) : 0;
  OpenPanel("END THE MONTH", "电脑：保存、关机，让所有痛苦一起结算", `
    <p class="panelIntro">点击关机后，工资、AI 月租、房租水电、车贷房贷、饭钱和贷款月供一起扣；随后团队才开始产出。钱不够会退订、开人、断供、挨饿或丢东西。</p>
    <div class="metricGrid">
      <div class="metricTile"><span>现金</span><strong>${FormatMoney(state.cash)}</strong></div>
      <div class="metricTile"><span>预计总支出</span><strong>${FormatMoney(costs.total)}</strong></div>
      <div class="metricTile"><span>危险缺口</span><strong>${FormatMoney(shortfall)}</strong></div>
    </div>
    ${startupLoan?.status === "active" ? `<div class="noteList"><div class="note danger">启动贷还剩 ${FormatMoney(startupLoan.remaining)}，M${String(startupLoan.dueMonth).padStart(2, "0")} 月结时强制检查。当前还剩 ${monthsLeft} 个结算月；到期未清直接倒闭。</div></div>` : `<div class="noteList"><div class="note good">创业启动贷已经结清，这个月不会因成立合同被清算。</div></div>`}
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
          ${finance.startupDefault ? `<div class="note danger">创业启动贷到期未清，全部身家被处置，公司进入强制清算。</div>` : ""}
          ${finance.skippedFood ? `<div class="note danger">饭钱没付出来，本月自动改成硬扛不吃。</div>` : ""}
          ${finance.appliedEvents?.map((liveEvent) => `<div class="note danger">收入事件：${EscapeHtml(liveEvent.title)}，流水乘数 ×${liveEvent.multiplier}。</div>`).join("") || ""}
          ${result.anxiety.idea ? `<div class="note good">焦虑迸发抽象创意：${EscapeHtml(result.anxiety.idea.title)}——${EscapeHtml(result.anxiety.idea.pitch)}</div>` : ""}
        </div>
        <div class="panelSection">${RevenueChart()}</div>`, () => { if (state.status !== "playing") RenderEnding(); });
    };
  });
}

function OpenHelpSheet() {
  OpenPanel("HOW TO SUFFER", "六个 2D 场景：你得亲自跑过去", `
    <div class="resultHero"><b>A/D</b><p>左右穿过自己的家、小菜馆、小超市、人才市场、银行和大酒店；W、↑ 或空格跳；靠近柜台按 E。移动端横屏使用底部按钮。</p></div>
    <div class="noteList">
      <div class="note">家里只有老板自己的电脑。开发、聊天、宣发、发布和月结都在电脑上完成。</div>
      <div class="note danger">第一次招聘前必须先在人才市场设备柜台买第一套工位；以后每增加一人都要再有一套空设备。</div>
      <div class="note">冰箱是剩饭，小菜馆是充饥套餐，小超市卖小吃和彩票，大酒店才有能提升产出的大餐。</div>
      <div class="note danger">启动资金 ¥68,000 全部来自身家担保贷款，M08 前要还 ¥82,000；到期未清直接倒闭。</div>
      <div class="note good">唯一胜利仍是累计游戏收入达到 100 亿元。贷款、彩票和炒股发财都不算。</div>
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
  const identity = [state.studioName, state.project?.name ? `《${state.project.name}》` : ""].filter(Boolean).join(" · ");
  dom.endingSubtitle.textContent = `${identity}${identity ? "｜" : ""}${state.outcome?.subtitle || "至少电脑在日志里留下了最后一句话。"}`;
  dom.endingStats.innerHTML = `
    <div><span>撑过</span><strong>${state.month} 个月</strong></div>
    <div><span>游戏收入</span><strong>${FormatGoalMoney(state.gameRevenue)}</strong></div>
    <div><span>最好评分</span><strong>${state.bestRating ? state.bestRating.toFixed(1) : "没发出来"}</strong></div>`;
  dom.endingScreen.classList.remove("hidden");
}

function BeginWorld(nextState) {
  state = nextState;
  onboardingPhase = "game";
  landingOpen = false;
  worldState = CreateWorldState(state.month);
  dom.setupScreen.classList.add("hidden");
  dom.setupScreen.classList.remove("cinematic");
  dom.endingScreen.classList.add("hidden");
  document.body.classList.remove("onboarding");
  SetPlayableWorldVisible(true);
  SaveState();
  RebuildStaffActors();
  BuildCollectibles();
  BuildHazards();
  RenderHud();
  UpdateWorldFromGameState();
  UpdateLocationIndicator();
  if (state.status !== "playing") RenderEnding();
}

function TriggerInteraction() {
  if (actionCooldown > 0 || IsOverlayOpen() || !activeInteraction) return;
  actionCooldown = .28;
  PlayTone("tap");
  if (activeInteraction.kind === "staff") return OpenStaffSheet(activeInteraction.staffId);
  switch (activeInteraction.kind) {
    case "homeComputer": return OpenHomeComputerSheet();
    case "homeFridge": return OpenFoodSheet("leftovers", "自己家的冰箱");
    case "diner": return OpenFoodSheet("sustenance", "小菜馆：便宜充饥套餐");
    case "snackShelf": return OpenFoodSheet("snack", "小超市：买点小吃顶一顶");
    case "hotel": return OpenFoodSheet("feast", "大酒店：吃顿像人的饭");
    case "bank": return OpenBankSheet();
    case "lotteryMachine": return OpenSpeculationSheet();
    case "equipmentShop": return OpenEquipmentSheet();
    case "talentMarket": return OpenTalentSheet();
    default: ShowToast("这个物件还在等需求评审。", "warning");
  }
}

function StartFoundingCeremony() {
  onboardingPhase = "cinematic";
  ceremonyElapsed = 0;
  ceremonyBurstStep = -1;
  landingOpen = true;
  dom.ceremonyIntro.classList.add("hidden");
  dom.foundingNamePanel.classList.add("hidden");
  dom.projectContract.classList.add("hidden");
  dom.skipCeremonyButton.classList.remove("hidden");
  dom.ceremonyCaption.classList.remove("hidden");
  dom.setupScreen.classList.add("cinematic");
  document.body.classList.add("onboarding");
  SetPlayableWorldVisible(false);
  PlayTone("good");
}

function ConfirmStudioName() {
  const proposedName = dom.studioNameInput.value.replace(/[<>\r\n\t]/g, "").replace(/\s+/g, " ").trim();
  if (proposedName.length < 2) {
    dom.setupError.textContent = "至少取两个字。一个标点符号还承担不起全部身家。";
    dom.studioNameInput.focus();
    PlayTone("warning");
    return;
  }
  draftStudioName = proposedName.slice(0, 18);
  dom.setupError.textContent = "";
  dom.contractStudioName.textContent = draftStudioName;
  dom.contractSignatureName.textContent = draftStudioName;
  ReplaceCeremonyPlaque(draftStudioName);
  dom.foundingNamePanel.classList.add("hidden");
  onboardingPhase = "plaque";
  ceremonyElapsed = 0;
  ceremonyBurstStep = 0;
  PlayTone("good");
}

function CancelSealHold() {
  if (sealHoldComplete) return;
  window.clearTimeout(sealHoldTimer);
  sealHoldTimer = null;
  sealKeyboardMode = false;
  dom.sealButton.classList.remove("holding");
}

function CompleteContractSigning() {
  if (sealHoldComplete) return;
  const projectName = dom.gameNameInput.value.replace(/[<>\r\n\t]/g, "").replace(/\s+/g, " ").trim();
  if (projectName.length < 2) {
    dom.contractError.textContent = "游戏名至少两个字。不能把商店页标题留给发行平台猜。";
    CancelSealHold();
    dom.gameNameInput.focus();
    PlayTone("warning");
    return;
  }
  const fresh = CreateInitialState();
  const result = StartProject(fresh, selectedProjectId, selectedGameTypeId, {
    studioName: draftStudioName,
    projectName,
  });
  if (!result.ok) {
    dom.contractError.textContent = result.message;
    CancelSealHold();
    return;
  }
  sealHoldComplete = true;
  sealHoldTimer = null;
  onboardingPhase = "signing";
  dom.sealButton.classList.remove("holding");
  dom.sealButton.classList.add("sealed");
  dom.sealButton.querySelector("span").textContent = "合同生效";
  dom.sealButton.querySelector("strong").textContent = "已签字盖章";
  dom.projectContract.classList.add("signed");
  dom.contractError.textContent = "合同已生效。银行倒计时与公司同时启动。";
  SpawnParticles(6, 3.7, 0xff445f, 48);
  PlayTone("release");
  window.setTimeout(() => BeginWorld(result.state), 1250);
}

function BeginSealHold(event) {
  if (sealHoldComplete || onboardingPhase !== "contract") return;
  if (event.type === "pointerdown" && event.button !== 0) return;
  event.preventDefault();
  const projectName = dom.gameNameInput.value.trim();
  if (projectName.length < 2) {
    dom.contractError.textContent = "先写游戏名，再按住公章。";
    dom.gameNameInput.focus();
    PlayTone("warning");
    return;
  }
  dom.contractError.textContent = "按住不松手，直到公章真的落下。";
  sealKeyboardMode = event.type === "keydown";
  dom.sealButton.classList.add("holding");
  window.clearTimeout(sealHoldTimer);
  sealHoldTimer = window.setTimeout(CompleteContractSigning, 1050);
}

function ResetOnboarding() {
  onboardingPhase = "intro";
  ceremonyElapsed = 0;
  ceremonyBurstStep = -1;
  sealHoldComplete = false;
  CancelSealHold();
  draftStudioName = "";
  landingOpen = true;
  BuildCeremonyScene();
  SetPlayableWorldVisible(false);
  document.body.classList.add("onboarding");
  dom.setupScreen.classList.remove("hidden", "cinematic");
  dom.ceremonyIntro.classList.remove("hidden");
  dom.foundingNamePanel.classList.add("hidden");
  dom.projectContract.classList.add("hidden");
  dom.projectContract.classList.remove("signed");
  dom.skipCeremonyButton.classList.add("hidden");
  dom.ceremonyCaption.classList.add("hidden");
  dom.studioNameInput.value = "";
  dom.gameNameInput.value = "";
  dom.setupError.textContent = "";
  dom.contractError.textContent = "";
  dom.sealButton.classList.remove("holding", "sealed");
  dom.sealButton.querySelector("span").textContent = "按住 1 秒";
  dom.sealButton.querySelector("strong").textContent = "签字盖章";
  RenderSetupChoices();
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
  window.addEventListener("blur", () => { inputState.left = false; inputState.right = false; inputState.jump = false; CancelSealHold(); });
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
    dom.soundButton.classList.toggle("muted", !soundEnabled);
    dom.soundButtonIcon.textContent = soundEnabled ? "♪" : "×";
    dom.soundButton.setAttribute("aria-label", soundEnabled ? "关闭音效" : "开启音效");
    if (soundEnabled) PlayTone("good");
  });
  dom.projectChoices.addEventListener("click", (event) => {
    const button = event.target.closest("[data-project-id]");
    if (!button) return;
    const oldTemplate = FindProject(selectedProjectId)?.title?.replace(/[《》]/g, "") || "";
    selectedProjectId = button.dataset.projectId;
    if (!dom.gameNameInput.value.trim() || dom.gameNameInput.value.trim() === oldTemplate) {
      dom.gameNameInput.value = FindProject(selectedProjectId)?.title?.replace(/[《》]/g, "") || "";
    }
    RenderSetupChoices();
  });
  dom.typeChoices.addEventListener("click", (event) => {
    const button = event.target.closest("[data-type-id]");
    if (!button) return;
    selectedGameTypeId = button.dataset.typeId;
    RenderSetupChoices();
  });
  dom.ceremonyStartButton.addEventListener("click", StartFoundingCeremony);
  dom.skipCeremonyButton.addEventListener("click", ShowFoundingNamePanel);
  dom.studioNameSuggestions.addEventListener("click", (event) => {
    const button = event.target.closest("[data-studio-name]");
    if (!button) return;
    dom.studioNameInput.value = button.dataset.studioName;
    dom.studioNameInput.focus();
    PlayTone("tap");
  });
  dom.nameConfirmButton.addEventListener("click", ConfirmStudioName);
  dom.studioNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); ConfirmStudioName(); }
  });
  dom.gameNameInput.addEventListener("input", () => { dom.contractError.textContent = ""; });
  dom.sealButton.addEventListener("pointerdown", BeginSealHold);
  dom.sealButton.addEventListener("pointerup", CancelSealHold);
  dom.sealButton.addEventListener("pointercancel", CancelSealHold);
  dom.sealButton.addEventListener("pointerleave", (event) => { if (event.buttons === 0) CancelSealHold(); });
  dom.sealButton.addEventListener("contextmenu", (event) => event.preventDefault());
  dom.sealButton.addEventListener("keydown", (event) => {
    if (!["Enter", " "].includes(event.key) || event.repeat) return;
    BeginSealHold(event);
  });
  dom.sealButton.addEventListener("keyup", (event) => {
    if (!["Enter", " "].includes(event.key)) return;
    if (sealKeyboardMode) {
      window.clearTimeout(sealHoldTimer);
      sealHoldTimer = null;
      sealKeyboardMode = false;
      CompleteContractSigning();
    } else CancelSealHold();
  });
  dom.continueButton.addEventListener("click", () => BeginWorld(savedState));
  dom.restartButton.addEventListener("click", () => {
    state = CreateInitialState();
    selectedProjectId = PROJECTS[0].id;
    selectedGameTypeId = GAME_TYPES[0].id;
    localStorage.removeItem(SAVE_KEY);
    savedState = null;
    dom.endingScreen.classList.add("hidden");
    ResetOnboarding();
    RenderHud();
  });
}

function Initialize() {
  BuildRoom();
  BuildCeremonyScene();
  BuildCollectibles();
  BuildHazards();
  RebuildStaffActors();
  ResizeScene();
  RenderSetupChoices();
  RenderHud();
  BindControls();
  UpdateWorldFromGameState();
  ResetOnboarding();
  window.setTimeout(() => dom.loadingScreen.classList.add("loaded"), 180);
  Animate();
}

Initialize();
