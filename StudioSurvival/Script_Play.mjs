import * as THREE from "three";
import {
  AI_SUBSCRIPTION_LEVELS,
  COLLATERAL_OPTIONS,
  CONSUMER_VENUES,
  DIRECTIVES,
  FEATURE_CHOICES,
  FindCollateral,
  FindConsumerVenue,
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
  SCRATCH_OPTION,
  STAFF_CATALOG,
  STOCK_OPTIONS,
  STUDENT_PAY_LEVELS,
} from "./Data_Game.mjs?v=20260815v";
import {
  AdvanceMonth,
  BuyScratchTicket,
  BuyMarketingCampaign,
  CalculateTensions,
  CreateInitialState,
  CustomizeProject,
  EvaluateMarketFit,
  DEFAULT_FOUNDER_SKILLS,
  EvaluateProject,
  FireStaff,
  FOUNDER_SKILL_KEYS,
  FOUNDER_SKILL_POINTS,
  ForecastMonthlyCosts,
  ForecastPivotCost,
  GetAnxietyState,
  GetConsumerVenueAccess,
  GetFounderSkillEffect,
  GetIdleLine,
  GetMemberMonthlyCost,
  GetMarketSnapshot,
  GetOwnerHairStage,
  GetStockAccountAccess,
  HireStaff,
  OWNER_HAIR_STAGES,
  NormalizeFounderSkills,
  PlaceStockOrder,
  PerformOwnerTask,
  PivotProject,
  PurchaseWorkstation,
  RepayStartupLoan,
  ReleaseBuild,
  RestartProject,
  SAVE_KEY,
  SetMarketStrategy,
  SelectDirective,
  SelectFoodPlan,
  SetStaffInvestmentLevel,
  StartProject,
  STARTUP_LOAN_TERMS,
  STOCK_ACCOUNT_UNLOCK_CASH,
  TakeLoan,
  TalkToStaff,
  ValidateState,
  VisitRelaxationVenue,
  WORKSTATION_COSTS,
  UnlockStockAccount,
} from "./Script_Rules.mjs?v=20260815w";
import {
  FindLocation,
  FindLocationAt,
  Locations as WorldLocations,
  WorldBounds,
  WorldConfig,
  Collectibles as WorldCollectibles,
  MovingHazards as WorldHazards,
  InteractionPoints as WorldInteractions,
  Platforms as WorldPlatforms,
} from "./Data_World.mjs?v=20260815v";
import {
  CreateWorldState,
  NearestInteraction,
  ResetWorldMonth,
  TickWorld,
  TravelWorld,
} from "./Script_World.mjs?v=20260815v";

const dom = Object.fromEntries([
  "loadingScreen", "sceneCanvas", "sceneVignette", "monthValue", "cashValue", "revenueValue", "goalBar",
  "hungerBar", "hungerValue", "anxietyBar", "anxietyValue", "soundButton", "soundButtonIcon", "helpButton", "studioMonogram",
  "studioNameHud", "startupDebtValue", "locationValue", "locationRoute", "projectTitle", "missionText", "moduleStrip", "interactionPrompt", "interactionTitle", "interactionDetail",
  "mobileControls", "moveLeftButton", "moveRightButton", "jumpButton", "interactButton", "toastStack", "setupScreen",
  "travelCurtain",
  "ceremonyIntro", "ceremonyStartButton", "skipCeremonyButton", "ceremonyCaption", "ceremonyCaptionText",
  "foundingNamePanel", "studioNameInput", "studioNameSuggestions", "nameConfirmButton", "setupError",
  "founderProfilePanel", "founderProfileTitle", "founderSkillEditor", "founderSkillBudget", "founderBackButton", "founderConfirmButton",
  "projectContract", "contractStudioName", "contractFounderSkills", "contractSignatureName", "contractError", "sealButton",
  "contractPageViewport", "contractPageCounter", "contractBackButton", "contractNextButton", "contractPageHint",
  "contractReviewStudio", "contractReviewFounder", "contractReviewTheme", "contractReviewType",
  "goalReveal", "goalRevealCounter", "goalRevealButton",
  "projectChoices", "typeChoices", "continueButton", "modalLayer", "modalBackdrop", "sheetKicker",
  "sheetTitle", "sheetBody", "sheetCloseButton", "resultLayer", "resultKicker", "resultTitle", "resultBody",
  "resultCloseButton", "endingScreen", "endingTitle", "endingSubtitle", "endingStats", "quickRestartButton", "restartButton",
].map((id) => [id, document.getElementById(id)]));

const FormatMoney = (value) => `¥${Math.round(value || 0).toLocaleString("zh-CN")}`;
const FormatGoalMoney = (value) => value >= 100000000
  ? `${(value / 100000000).toFixed(value >= 1000000000 ? 1 : 2)}亿元`
  : value >= 10000 ? `${(value / 10000).toFixed(1)}万` : FormatMoney(value);
const Clamp = (value, minimum, maximum) => Math.min(maximum, Math.max(minimum, value));
const EscapeHtml = (value) => String(value ?? "")
  .replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;").replaceAll("'", "&#039;");

const FOUNDER_SKILL_META = Object.freeze({
  design: Object.freeze({
    label: "策划",
    color: "#e6a23c",
  }),
  programming: Object.freeze({
    label: "程序",
    color: "#65b8ff",
  }),
  art: Object.freeze({
    label: "美术",
    color: "#ff7f9f",
  }),
});

function LoadSavedState() {
  try {
    const candidate = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (!ValidateState(candidate)) return null;
    candidate.founderSkills = NormalizeFounderSkills(candidate.founderSkills);
    candidate.lastScratchMonth ??= [...candidate.speculationHistory].reverse().find((entry) => (
      [SCRATCH_OPTION.id, "lottery"].includes(entry?.optionId)
    ))?.month || 0;
    candidate.stockAccountUnlocked ??= false;
    candidate.stockPosition ??= null;
    candidate.stockHistory ??= [];
    candidate.lastRelaxationMonth ??= 0;
    candidate.relaxationHistory ??= [];
    if (candidate.status === "ended" && candidate.outcome?.kind === "worldMaker") {
      candidate.outcome.title = "你成为了成功的游戏制作人！";
      candidate.outcome.subtitle = "累计游戏收入达到 100 亿元。你从一份合同出发，终于做出了被玩家认可的游戏。电脑也还在。";
    }
    return candidate;
  } catch {
    return null;
  }
}

let savedState = LoadSavedState();
let state = savedState || CreateInitialState();
let selectedProjectId = state.project?.templateId || PROJECTS[0].id;
let selectedGameTypeId = state.project?.gameTypeId || GAME_TYPES[0].id;
let draftStudioName = state.studioName || "";
let draftFounderSkills = NormalizeFounderSkills(state.founderSkills);
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
let pendingGoalState = null;
let goalRevealAnimationFrame = null;
let activeScratchSession = null;
let lastScratchSoundAt = 0;
let mobileControlSignature = "";
let contractPageIndex = 0;
let contractPageTimer = null;
let traveling = false;
const inputState = { left: false, right: false, jump: false };
const CONTRACT_PAGE_COPY = [
  { counter: "03 / 04", hint: "题材与发行一起生效", next: "核对发行合同" },
  { counter: "04 / 04", hint: "按住印章，正式签约", next: "" },
];

function IsOverlayOpen() {
  return traveling
    || landingOpen
    || !dom.goalReveal.classList.contains("hidden")
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

function PlayScratchNoise(intensity = 1) {
  if (!soundEnabled) return;
  const nowMs = performance.now();
  if (nowMs - lastScratchSoundAt < 55) return;
  lastScratchSoundAt = nowMs;
  try {
    audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
    const duration = .045;
    const frameCount = Math.max(1, Math.floor(audioContext.sampleRate * duration));
    const buffer = audioContext.createBuffer(1, frameCount, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < frameCount; index += 1) {
      const envelope = 1 - index / frameCount;
      data[index] = (Math.random() * 2 - 1) * envelope;
    }
    const source = audioContext.createBufferSource();
    const filter = audioContext.createBiquadFilter();
    const gain = audioContext.createGain();
    filter.type = "bandpass";
    filter.frequency.value = 1550 + Math.random() * 900;
    filter.Q.value = .65;
    gain.gain.value = .012 + Clamp(intensity, 0, 1) * .014;
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(audioContext.destination);
    source.start();
  } catch { /* Scratching stays usable without audio. */ }
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
const distantGroup = new THREE.Group();
const roomGroup = new THREE.Group();
const facilityGroup = new THREE.Group();
const actorGroup = new THREE.Group();
const collectibleGroup = new THREE.Group();
const hazardGroup = new THREE.Group();
const fxGroup = new THREE.Group();
const foregroundGroup = new THREE.Group();
const ceremonyGroup = new THREE.Group();
scene.add(distantGroup, roomGroup, facilityGroup, actorGroup, collectibleGroup, hazardGroup, fxGroup, foregroundGroup, ceremonyGroup);

const facilityVisuals = new Map();
const staffActors = new Map();
const collectibleVisuals = new Map();
const hazardVisuals = new Map();
const locationVisuals = new Map();
const particles = [];
let playerActor = null;
let playerParts = null;
let nearbyRing = null;
let worldAccentLight = null;
let smoothCameraX = 7;
let ceremonyFounder = null;
let ceremonyParts = null;
let ceremonyCurtains = null;
let ceremonyPlaque = null;
let ceremonySpotlights = [];

const sceneToneByLocation = new Map([
  ["home", new THREE.Color(0x0b0d1c)],
  ["diner", new THREE.Color(0x15100f)],
  ["market", new THREE.Color(0x091713)],
  ["talent", new THREE.Color(0x09131f)],
  ["bank", new THREE.Color(0x130d19)],
  ["hotel", new THREE.Color(0x17110d)],
  ["footbath", new THREE.Color(0x0c1a1b)],
  ["footbathCity", new THREE.Color(0x151020)],
  ["maleModelClub", new THREE.Color(0x1d0d18)],
]);
const sceneToneTarget = new THREE.Color(0x090c17);
const surfaceTextureCache = new Map();
const worldPracticalLights = [];

function HexColor(value) { return Number.parseInt(String(value).replace("#", ""), 16); }

function SeededRandom(seed = 1) {
  let value = Math.max(1, Math.floor(seed)) % 2147483647;
  return () => {
    value = value * 16807 % 2147483647;
    return (value - 1) / 2147483646;
  };
}

function CreateSurfaceTexture(kind = "plaster") {
  if (surfaceTextureCache.has(kind)) return surfaceTextureCache.get(kind);
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  const random = SeededRandom([...kind].reduce((sum, character) => sum + character.charCodeAt(0) * 17, 173));
  const FillNoise = (base, spread = 16, count = 4300) => {
    context.fillStyle = base;
    context.fillRect(0, 0, 256, 256);
    for (let index = 0; index < count; index += 1) {
      const value = Math.round(190 + random() * spread);
      context.fillStyle = `rgba(${value},${value},${value},${.02 + random() * .055})`;
      const size = random() > .91 ? 2 : 1;
      context.fillRect(random() * 256, random() * 256, size, size);
    }
  };

  if (kind === "wood") {
    FillNoise("#c8c1b3", 28, 2800);
    for (let line = 0; line < 38; line += 1) {
      const y = random() * 256;
      context.beginPath();
      context.moveTo(-8, y);
      for (let x = -8; x <= 264; x += 12) context.lineTo(x, y + Math.sin(x * .045 + line) * (1.2 + random() * 2.4));
      context.strokeStyle = `rgba(62,49,38,${.035 + random() * .08})`;
      context.lineWidth = .6 + random() * 1.2;
      context.stroke();
    }
    for (let knot = 0; knot < 5; knot += 1) {
      context.beginPath();
      context.ellipse(random() * 256, random() * 256, 7 + random() * 12, 2 + random() * 4, random() * .2, 0, Math.PI * 2);
      context.strokeStyle = "rgba(74,53,38,.11)";
      context.stroke();
    }
  } else if (kind === "tile") {
    FillNoise("#dedbd0", 11, 2300);
    context.strokeStyle = "rgba(45,48,47,.3)";
    context.lineWidth = 5;
    for (let line = 0; line <= 256; line += 64) {
      context.beginPath(); context.moveTo(line, 0); context.lineTo(line, 256); context.stroke();
      context.beginPath(); context.moveTo(0, line); context.lineTo(256, line); context.stroke();
    }
    context.strokeStyle = "rgba(255,255,255,.42)";
    context.lineWidth = 1;
    for (let line = 3; line < 256; line += 64) {
      context.beginPath(); context.moveTo(line, 3); context.lineTo(line, 253); context.stroke();
      context.beginPath(); context.moveTo(3, line); context.lineTo(253, line); context.stroke();
    }
  } else if (kind === "fabric") {
    FillNoise("#bab8b5", 18, 3000);
    context.strokeStyle = "rgba(255,255,255,.12)";
    context.lineWidth = 1;
    for (let line = 0; line < 256; line += 4) {
      context.beginPath(); context.moveTo(line, 0); context.lineTo(line, 256); context.stroke();
      context.beginPath(); context.moveTo(0, line); context.lineTo(256, line); context.stroke();
    }
    context.strokeStyle = "rgba(31,27,30,.055)";
    for (let line = 2; line < 256; line += 8) {
      context.beginPath(); context.moveTo(line, 0); context.lineTo(line, 256); context.stroke();
      context.beginPath(); context.moveTo(0, line); context.lineTo(256, line); context.stroke();
    }
  } else if (kind === "stone") {
    FillNoise("#c6c5c0", 22, 5200);
    for (let chip = 0; chip < 530; chip += 1) {
      const shade = random() > .54 ? 52 : 235;
      context.fillStyle = `rgba(${shade},${shade},${shade},${.07 + random() * .16})`;
      const size = .4 + random() * 1.8;
      context.beginPath(); context.arc(random() * 256, random() * 256, size, 0, Math.PI * 2); context.fill();
    }
  } else if (kind === "paper") {
    FillNoise("#e4decf", 12, 2600);
    context.strokeStyle = "rgba(102,79,52,.07)";
    context.lineWidth = .7;
    for (let fiber = 0; fiber < 150; fiber += 1) {
      const x = random() * 256;
      const y = random() * 256;
      context.beginPath(); context.moveTo(x, y); context.lineTo(x + 5 + random() * 25, y + (random() - .5) * 4); context.stroke();
    }
  } else if (kind === "metal") {
    FillNoise("#c8cbd0", 15, 1800);
    for (let line = 0; line < 256; line += 2) {
      const shade = 255 - Math.floor(random() * 40);
      context.fillStyle = `rgba(${shade},${shade},${shade},${.018 + random() * .05})`;
      context.fillRect(0, line, 256, 1);
    }
    for (let scratch = 0; scratch < 70; scratch += 1) {
      const y = random() * 256;
      context.fillStyle = `rgba(30,34,39,${.025 + random() * .05})`;
      context.fillRect(random() * 210, y, 18 + random() * 62, .5);
    }
  } else if (kind === "linoleum") {
    FillNoise("#c9cac3", 19, 6200);
    for (let swirl = 0; swirl < 50; swirl += 1) {
      context.beginPath();
      context.arc(random() * 256, random() * 256, 4 + random() * 18, random() * 3, random() * 3 + Math.PI * .8);
      context.strokeStyle = `rgba(54,61,58,${.025 + random() * .055})`;
      context.lineWidth = 1 + random() * 2;
      context.stroke();
    }
  } else if (kind === "leather") {
    FillNoise("#b6afa8", 18, 7500);
    for (let pore = 0; pore < 1050; pore += 1) {
      context.fillStyle = `rgba(35,28,25,${.025 + random() * .06})`;
      context.beginPath(); context.arc(random() * 256, random() * 256, .35 + random() * .8, 0, Math.PI * 2); context.fill();
    }
  } else {
    FillNoise("#d0cfca", 15, 5000);
    for (let mark = 0; mark < 75; mark += 1) {
      context.fillStyle = `rgba(62,60,57,${.018 + random() * .045})`;
      context.beginPath(); context.ellipse(random() * 256, random() * 256, 2 + random() * 10, .4 + random() * 2, random() * Math.PI, 0, Math.PI * 2); context.fill();
    }
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(kind === "wood" ? 1.5 : 2.4, kind === "wood" ? 1.5 : 2.4);
  texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  texture.userData.sharedSurface = true;
  surfaceTextureCache.set(kind, texture);
  return texture;
}

function SurfaceMaterial(surface, color, options = {}) {
  const texture = surface ? CreateSurfaceTexture(surface) : null;
  return new THREE.MeshStandardMaterial({
    color,
    map: texture,
    bumpMap: options.bump === false ? null : texture,
    bumpScale: options.bumpScale ?? (surface === "fabric" ? .022 : surface === "metal" ? .012 : .035),
    roughness: options.roughness ?? ({ metal: .36, leather: .68, tile: .4, stone: .78, wood: .72, fabric: .96, paper: .92 }[surface] ?? .82),
    metalness: options.metalness ?? (surface === "metal" ? .58 : .025),
    emissive: options.emissive ?? 0,
    emissiveIntensity: options.emissiveIntensity ?? 0,
    transparent: Boolean(options.transparent),
    opacity: options.opacity ?? 1,
  });
}

function Box(width, height, depth, color, options = {}) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, height, depth),
    options.material || SurfaceMaterial(options.surface, color, options),
  );
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  return mesh;
}

function Cylinder(radiusTop, radiusBottom, height, color, radialSegments = 12, options = {}) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, radialSegments),
    options.material || SurfaceMaterial(options.surface, color, options),
  );
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  return mesh;
}

function Sphere(radius, color, options = {}) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, options.segments ?? 18, options.rings ?? 12),
    options.material || SurfaceMaterial(options.surface, color, options),
  );
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
  return mesh;
}

function Torus(radius, tube, color, options = {}) {
  const mesh = new THREE.Mesh(
    new THREE.TorusGeometry(radius, tube, options.radialSegments ?? 10, options.tubularSegments ?? 32),
    options.material || SurfaceMaterial(options.surface, color, options),
  );
  mesh.castShadow = options.castShadow ?? true;
  mesh.receiveShadow = options.receiveShadow ?? true;
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

function FlatPanel(width, height, color, options = {}) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({
      color,
      transparent: (options.opacity ?? 1) < 1,
      opacity: options.opacity ?? 1,
      depthWrite: options.depthWrite ?? false,
      toneMapped: false,
      side: THREE.DoubleSide,
    }),
  );
  mesh.position.z = options.z ?? 0;
  if (options.rotation) mesh.rotation.z = options.rotation;
  return mesh;
}

function FlatDisc(radius, color, options = {}) {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(radius, options.segments ?? 24),
    new THREE.MeshBasicMaterial({
      color,
      transparent: (options.opacity ?? 1) < 1,
      opacity: options.opacity ?? 1,
      depthWrite: options.depthWrite ?? false,
      toneMapped: false,
      side: THREE.DoubleSide,
    }),
  );
  mesh.position.z = options.z ?? 0;
  return mesh;
}

function BuildPivotedBoxLimb({ color, upperLength, lowerLength, width, depth, handColor = null, shoeColor = null }) {
  const pivot = new THREE.Group();
  const upper = Box(width, upperLength, depth, color, { castShadow: false, roughness: .88 });
  upper.position.y = -upperLength * .5;
  const joint = new THREE.Group();
  joint.position.y = -upperLength;
  const lower = Box(width * .9, lowerLength, depth * .92, color, { castShadow: false, roughness: .9 });
  lower.position.y = -lowerLength * .5;
  joint.add(lower);
  if (handColor !== null) {
    const hand = new THREE.Mesh(
      new THREE.SphereGeometry(width * .58, 10, 7),
      new THREE.MeshStandardMaterial({ color: handColor, roughness: .92 }),
    );
    hand.position.y = -lowerLength - width * .12;
    joint.add(hand);
  }
  if (shoeColor !== null) {
    const shoe = Box(width * 1.55, width * .48, depth * 1.16, shoeColor, { castShadow: false, roughness: .94 });
    shoe.position.set(width * .27, -lowerLength - width * .14, depth * .04);
    joint.add(shoe);
  }
  pivot.add(upper, joint);
  pivot.userData.joint = joint;
  return pivot;
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
  const backLeg = BuildPivotedBoxLimb({ color: 0x24283a, upperLength: .38, lowerLength: .38, width: .22, depth: .28, shoeColor: 0x11131c });
  const frontLeg = BuildPivotedBoxLimb({ color: 0x292e42, upperLength: .38, lowerLength: .38, width: .22, depth: .3, shoeColor: 0x11131c });
  backLeg.position.set(-.19, .86, -.08);
  frontLeg.position.set(.19, .86, .08);
  group.add(backLeg, frontLeg);
  const torso = Box(.76, .88, .42, color);
  torso.position.y = 1.3;
  group.add(torso);
  const collar = Box(.34, .12, .45, owner ? 0xeee8ff : 0xdad5e5, { castShadow: false });
  collar.position.set(0, 1.66, .015);
  group.add(collar);
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(.31, 14, 10),
    new THREE.MeshStandardMaterial({ color: owner ? 0xe2ad86 : 0xd9a985, roughness: .88 }),
  );
  head.position.set(0, 2.02, 0);
  head.castShadow = true;
  group.add(head);
  const hair = new THREE.Mesh(
    new THREE.SphereGeometry(.325, 14, 9, 0, Math.PI * 2, 0, Math.PI * .48),
    new THREE.MeshStandardMaterial({ color: owner ? 0x11121a : 0x24212a, roughness: .96 }),
  );
  hair.position.set(0, 2.13, 0);
  group.add(hair);
  const eyeMaterial = new THREE.MeshBasicMaterial({ color: 0x171620, toneMapped: false });
  const leftEye = new THREE.Mesh(new THREE.SphereGeometry(.026, 8, 6), eyeMaterial);
  const rightEye = leftEye.clone();
  leftEye.position.set(-.105, 2.05, .292);
  rightEye.position.set(.105, 2.05, .292);
  const nose = new THREE.Mesh(
    new THREE.SphereGeometry(.038, 8, 6),
    new THREE.MeshStandardMaterial({ color: owner ? 0xd99f79 : 0xcf9877, roughness: .95 }),
  );
  nose.scale.set(.7, .82, 1);
  nose.position.set(0, 1.985, .31);
  group.add(leftEye, rightEye, nose);
  const backArm = BuildPivotedBoxLimb({ color, upperLength: .34, lowerLength: .34, width: .17, depth: .22, handColor: owner ? 0xe2ad86 : 0xd9a985 });
  const frontArm = BuildPivotedBoxLimb({ color, upperLength: .34, lowerLength: .34, width: .17, depth: .24, handColor: owner ? 0xe2ad86 : 0xd9a985 });
  backArm.position.set(-.46, 1.62, -.12);
  frontArm.position.set(.46, 1.62, .12);
  group.add(backArm, frontArm);
  group.userData.parts = {
    torso, head, leftLeg: backLeg, rightLeg: frontLeg,
    leftKnee: backLeg.userData.joint, rightKnee: frontLeg.userData.joint,
    leftArm: backArm, rightArm: frontArm,
    leftElbow: backArm.userData.joint, rightElbow: frontArm.userData.joint,
    shadow,
  };
  return group;
}

function BuildFlatHumanActor(color = 0x8d7cff, owner = false) {
  const group = new THREE.Group();
  const material = (fill) => new THREE.MeshBasicMaterial({ color: fill, toneMapped: false, side: THREE.DoubleSide });
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
  const limb = ({ upperLength, lowerLength, width, fill, z, hand = false, shoe = false }) => {
    const pivot = new THREE.Group();
    pivot.position.z = z;
    const upper = rectangle(width, upperLength, fill, 0);
    upper.position.y = -upperLength * .5;
    const joint = new THREE.Group();
    joint.position.y = -upperLength;
    const lower = rectangle(width * .88, lowerLength, fill, .002);
    lower.position.y = -lowerLength * .5;
    joint.add(lower);
    if (hand) {
      const palm = new THREE.Mesh(new THREE.CircleGeometry(width * .62, 12), material(owner ? 0xe2ad86 : 0xd9a985));
      palm.position.set(0, -lowerLength - width * .08, .004);
      joint.add(palm);
    }
    if (shoe) {
      const foot = rectangle(width * 1.75, width * .56, 0x11131d, .004);
      foot.position.set(width * .34, -lowerLength - width * .12, .004);
      joint.add(foot);
    }
    pivot.add(upper, joint);
    pivot.userData.joint = joint;
    return pivot;
  };
  const leftLeg = limb({ upperLength: .39, lowerLength: .4, width: .22, fill: 0x22283b, z: .01, shoe: true });
  const rightLeg = limb({ upperLength: .39, lowerLength: .4, width: .22, fill: 0x2b3148, z: .07, shoe: true });
  leftLeg.position.set(-.17, .91, .01);
  rightLeg.position.set(.17, .91, .07);
  group.add(leftLeg, rightLeg);
  if (owner) {
    const bag = rectangle(.48, .58, 0x27243a, .025);
    bag.position.set(-.32, 1.25, .025);
    bag.rotation.z = -.08;
    const strap = rectangle(.055, .98, 0x4d466f, .026);
    strap.position.set(-.08, 1.43, .026);
    strap.rotation.z = -.38;
    group.add(bag, strap);
  }
  const torsoShape = new THREE.Shape();
  torsoShape.moveTo(-.34, -.43);
  torsoShape.lineTo(-.43, .27);
  torsoShape.lineTo(-.25, .45);
  torsoShape.lineTo(.25, .45);
  torsoShape.lineTo(.43, .27);
  torsoShape.lineTo(.34, -.43);
  torsoShape.closePath();
  const torso = new THREE.Mesh(new THREE.ShapeGeometry(torsoShape), material(color));
  torso.position.set(0, 1.35, .04);
  group.add(torso);
  const shirt = new THREE.Mesh(new THREE.ShapeGeometry(new THREE.Shape([
    new THREE.Vector2(-.15, .12), new THREE.Vector2(0, -.08), new THREE.Vector2(.15, .12),
  ])), material(owner ? 0xf0ecff : 0xd9d6e7));
  shirt.position.set(0, 1.66, .045);
  group.add(shirt);
  const head = new THREE.Mesh(new THREE.CircleGeometry(.31, 20), material(owner ? 0xe2ad86 : 0xd9a985));
  head.position.set(0, 2.02, .05);
  group.add(head);
  const hair = new THREE.Mesh(new THREE.CircleGeometry(.32, 20, 0, Math.PI), material(owner ? 0x11121a : 0x24212a));
  hair.position.set(0, 2.11, .06);
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
  const ear = new THREE.Mesh(new THREE.CircleGeometry(.065, 10), material(owner ? 0xd79c77 : 0xcf9675));
  ear.position.set(-.29, 2.01, .055);
  const eye = new THREE.Mesh(new THREE.CircleGeometry(.025, 8), material(0x161722));
  eye.position.set(.12, 2.05, .065);
  group.add(ear, eye);
  const leftArm = limb({ upperLength: .35, lowerLength: .35, width: .17, fill: color, z: .025, hand: true });
  const rightArm = limb({ upperLength: .35, lowerLength: .35, width: .17, fill: color, z: .075, hand: true });
  leftArm.position.set(-.4, 1.62, .025);
  rightArm.position.set(.4, 1.62, .075);
  group.add(leftArm, rightArm);
  group.userData.flat = true;
  group.userData.parts = {
    torso, head, hair, thinningHair, scalpShine, leftLeg, rightLeg,
    leftKnee: leftLeg.userData.joint, rightKnee: rightLeg.userData.joint,
    leftArm, rightArm,
    leftElbow: leftArm.userData.joint, rightElbow: rightArm.userData.joint,
    shadow,
  };
  group.userData.motion = { phase: 0, blend: 0, landing: 0, wasGrounded: true, stepIndex: -1 };
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
      materials.filter(Boolean).forEach((material) => {
        if (material.map && !material.map.userData?.sharedSurface) material.map.dispose?.();
        material.dispose?.();
      });
    });
  }
}

const FacilityLooks = {
  homeComputer: ["开发电脑", "本月精力只在这里投入开发", 0x9d8cff],
  planningBoard: ["项目白板", "方向、范围与玩法写在这里", 0xffd166],
  marketingPhone: ["宣发手机", "作品成形后再处理投放", 0xff6eae],
  homeCalendar: ["墙上月历", "核对本月投入并进入下月", 0x66b8ff],
  homeFridge: ["自己家的冰箱", "剩饭也有保质期", 0x9fd7ff],
  exit: ["出门", "选择下一站", 0xf5f3ff],
  diner: ["小菜馆", "便宜充饥套餐", 0xffd166],
  snackShelf: ["零食架", "泡面饼干顶一顶", 0x68e0a0],
  scratch: ["刮刮乐柜台", "本月限刮一张", 0xff6eae],
  equipmentShop: ["设备柜台", "先买电脑再招人", 0x66b8ff],
  talentMarket: ["人才市场", "工资 / AI 月租", 0x9d8cff],
  bank: ["银行", "启动贷 M08 到期", 0xff6eae],
  hotel: ["大酒店", "吃顿像人的饭", 0xffb45f],
  regularFootbath: ["普通足浴店", "焦虑 -8 · 本月限一次", 0x72e0d1],
  footbathCity: ["洗脚城", "焦虑 -20 · 验资开放", 0xc69cff],
  maleModelClub: ["男模店", "焦虑 -36 · 百万验资", 0xff86c8],
};

function GetFacilityKind(interaction) {
  return {
    lotteryMachine: "scratch",
  }[interaction.kind] || interaction.kind;
}

function GetCollectibleModule(item, index = 0) {
  return item.moduleKey || MODULE_KEYS[index % MODULE_KEYS.length];
}

function Place(group, object, x, y, z = 0, rotationZ = 0) {
  object.position.set(x, y, z);
  if (rotationZ) object.rotation.z = rotationZ;
  group.add(object);
  return object;
}

function AddPhysicalLabel(group, title, subtitle, width, x, y, z, accent, options = {}) {
  const height = width * (options.compact ? .21 : .29);
  const backing = Place(group, Box(width, height, .14, options.backing ?? 0x211f1d, {
    surface: options.surface ?? "wood",
    roughness: options.roughness ?? .64,
    metalness: options.metalness ?? .04,
  }), x, y, z);
  const inner = Place(group, Box(width - .14, height - .13, .035, options.face ?? 0x101315, {
    surface: options.faceSurface ?? "metal",
    roughness: .38,
    metalness: .3,
    castShadow: false,
  }), x, y, z + .085);
  const strip = Place(group, Box(width - .22, .045, .025, accent, {
    emissive: accent,
    emissiveIntensity: .22,
    roughness: .4,
    castShadow: false,
  }), x, y - height * .34, z + .12);
  const text = TextPlane(title, subtitle, width - .28, `#${accent.toString(16).padStart(6, "0")}`);
  text.position.set(x, y + height * .04, z + .13);
  group.add(text);
  for (const screwX of [x - width * .44, x + width * .44]) {
    const screw = Sphere(.035, 0xb9b9b5, { surface: "metal", roughness: .24, metalness: .78, castShadow: false, segments: 10, rings: 7 });
    screw.scale.z = .35;
    Place(group, screw, screwX, y + height * .32, z + .13);
  }
  return { backing, inner, strip, text };
}

function AddPackage(group, x, y, z, color, scale = 1, round = false) {
  const packageObject = round
    ? Cylinder(.1 * scale, .1 * scale, .3 * scale, color, 14, { surface: "paper", roughness: .84 })
    : Box(.2 * scale, .32 * scale, .16 * scale, color, { surface: "paper", roughness: .88 });
  if (round) packageObject.rotation.z = Math.PI / 2;
  Place(group, packageObject, x, y, z, (x * 1.7 + y) % .05);
  const label = Box(round ? .035 : .13 * scale, .05 * scale, round ? .205 * scale : .012, 0xe8ddc6, { surface: "paper", castShadow: false });
  Place(group, label, x, y, z + (round ? .02 : .09));
  return packageObject;
}

function AddStool(group, x, y, z, seatColor = 0x6b4430) {
  const seat = Cylinder(.28, .3, .16, seatColor, 20, { surface: "leather", roughness: .72 });
  Place(group, seat, x, y + .76, z);
  for (const legX of [-.18, .18]) {
    const leg = Box(.06, .73, .06, 0x3a3430, { surface: "metal", metalness: .45, roughness: .44 });
    Place(group, leg, x + legX, y + .37, z, legX * .08);
  }
  const brace = Box(.54, .05, .05, 0x3a3430, { surface: "metal", metalness: .45, roughness: .44 });
  Place(group, brace, x, y + .3, z);
  return seat;
}

function AddPaperStack(group, x, y, z, width = .48, color = 0xe9dfc9, count = 4) {
  for (let index = 0; index < count; index += 1) {
    Place(group, Box(width, .018, width * .68, index % 2 ? color : 0xd9cfba, {
      surface: "paper", roughness: .94, castShadow: false,
    }), x + (index % 2 ? .012 : -.01), y + index * .018, z + index * .005, (index - count * .5) * .009);
  }
}

function AddTaskLamp(group, x, y, z, color = 0xd4b270, facing = 1) {
  const base = Cylinder(.23, .27, .08, 0x3c3d3b, 20, { surface: "metal", metalness: .58, roughness: .32 });
  Place(group, base, x, y, z);
  const arm = Box(.055, .72, .055, 0x555753, { surface: "metal", metalness: .6, roughness: .28 });
  Place(group, arm, x + facing * .14, y + .39, z, facing * -.23);
  const shade = Cylinder(.12, .28, .25, 0x353735, 20, { surface: "metal", metalness: .45, roughness: .35 });
  shade.rotation.z = facing * (Math.PI / 2.7);
  Place(group, shade, x + facing * .31, y + .76, z);
  const bulb = Sphere(.07, color, { emissive: color, emissiveIntensity: 1.6, roughness: .25, castShadow: false, segments: 12, rings: 8 });
  Place(group, bulb, x + facing * .39, y + .68, z + .01);
  return bulb;
}

function BuildFacility(interaction) {
  const group = new THREE.Group();
  const kind = GetFacilityKind(interaction);
  const [title, subtitle, color] = FacilityLooks[kind] || [interaction.label || interaction.id, "E", 0x9d8cff];
  group.position.set(interaction.x, interaction.y || 0, .22);
  const marker = new THREE.Mesh(
    new THREE.RingGeometry(.72, .86, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .34, side: THREE.DoubleSide, toneMapped: false }),
  );
  marker.scale.y = .28;
  marker.position.set(0, .08, .1);
  group.add(marker);
  if (kind === "homeComputer") {
    Place(group, Box(2.15, .16, .82, 0x6f4931, { surface: "wood", roughness: .7 }), 0, .88, .02);
    for (const legX of [-.82, .82]) Place(group, Box(.12, .86, .12, 0x493326, { surface: "wood" }), legX, .44, -.02);
    const computerPlastic = 0xc9c0aa;
    Place(group, Box(.98, .78, .44, computerPlastic, { roughness: .74 }), -.25, 1.42, .04);
    Place(group, Box(.88, .66, .035, 0x756f62, { roughness: .78 }), -.25, 1.43, .275);
    Place(group, Box(.74, .5, .026, 0x18201e, { surface: "metal", metalness: .12, roughness: .22 }), -.25, 1.46, .305);
    Place(group, Box(.65, .4, .014, 0x8475ff, { emissive: color, emissiveIntensity: .66, roughness: .14, castShadow: false }), -.25, 1.46, .327);
    Place(group, Box(.11, .27, .12, 0xa9a18e, { roughness: .76 }), -.25, 1.0, .08);
    Place(group, Box(.58, .08, .38, 0xbab19d, { roughness: .77 }), -.25, .94, .12);
    for (let ventIndex = 0; ventIndex < 6; ventIndex += 1) {
      Place(group, Box(.06, .018, .018, 0x716a5d, { castShadow: false }), -.46 + ventIndex * .085, 1.79, .288);
    }
    Place(group, Box(.08, .035, .018, 0x2b322c, { castShadow: false }), .09, 1.11, .292);
    Place(group, Sphere(.025, 0x68e0a0, { emissive: 0x68e0a0, emissiveIntensity: 1.2, castShadow: false, segments: 10, rings: 7 }), .18, 1.11, .3);

    Place(group, Box(.42, .76, .56, 0xbeb59f, { roughness: .78 }), .68, 1.34, .02);
    Place(group, Box(.31, .08, .025, 0x4b4a43, { surface: "metal", metalness: .16, castShadow: false }), .68, 1.58, .318);
    Place(group, Box(.25, .045, .024, 0x252824, { castShadow: false }), .68, 1.46, .318);
    for (let ventIndex = 0; ventIndex < 4; ventIndex += 1) {
      Place(group, Box(.22, .018, .02, 0x766f61, { castShadow: false }), .68, 1.16 + ventIndex * .055, .318);
    }
    Place(group, Sphere(.05, 0x35372f, { surface: "metal", metalness: .22, castShadow: false, segments: 12, rings: 8 }), .68, 1.02, .324);

    Place(group, Box(.83, .055, .34, 0xb8ae99, { roughness: .8 }), .04, .99, .46);
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 10; column += 1) {
        Place(group, Box(.052, .021, .043, 0xe1d9c7, { roughness: .86, castShadow: false }), -.28 + column * .068 + row * .012, 1.025, .37 + row * .065);
      }
    }
    const mouse = Sphere(.11, 0xc6bda7, { roughness: .72, segments: 14, rings: 9 });
    mouse.scale.set(.78, .38, 1.12);
    Place(group, mouse, .67, 1.035, .48);
    const mug = Cylinder(.12, .105, .22, 0xe1d9ca, 18, { surface: "paper", roughness: .58 });
    Place(group, mug, .99, 1.05, .22);
    const mugHandle = Torus(.105, .025, 0xe1d9ca, { roughness: .58, radialSegments: 8, tubularSegments: 20 });
    mugHandle.rotation.y = Math.PI / 2;
    Place(group, mugHandle, 1.1, 1.08, .22);
    AddTaskLamp(group, -.94, .98, .05, color, 1);
    AddPaperStack(group, .3, .98, .66, .28, 0xe9dfc9, 3);
  } else if (kind === "equipmentShop") {
    Place(group, Box(2.5, .82, .92, 0x294059, { surface: "metal", metalness: .28, roughness: .47 }), 0, .42, -.02);
    Place(group, Box(2.6, .11, 1.02, 0x9eb1c1, { surface: "metal", metalness: .52, roughness: .3 }), 0, .87, .02);
    for (const drawerX of [-.78, 0, .78]) {
      Place(group, Box(.65, .52, .045, 0x243243, { surface: "metal", metalness: .25 }), drawerX, .42, .46);
      Place(group, Box(.24, .035, .025, 0xacc6d9, { surface: "metal", metalness: .75, roughness: .22 }), drawerX, .48, .49);
    }
    Place(group, Box(.9, .65, .13, 0x15191f, { surface: "metal", metalness: .42 }), -.47, 1.43, .08);
    Place(group, Box(.75, .5, .025, 0x65bdf1, { emissive: color, emissiveIntensity: .68, roughness: .16, castShadow: false }), -.47, 1.43, .16);
    Place(group, Box(.5, .58, .7, 0x32363c, { surface: "metal", metalness: .35 }), .72, 1.2, -.02);
    for (const ventY of [1.02, 1.14, 1.26, 1.38]) Place(group, Box(.28, .018, .02, 0x101318, { castShadow: false }), .72, ventY, .345);
    AddPaperStack(group, .26, .96, .35, .4, 0xe5dac5, 5);
  } else if (kind === "planningBoard") {
    const boardMetal = 0xa8ada9;
    Place(group, Box(2.66, 1.76, .16, boardMetal, { surface: "metal", metalness: .5, roughness: .28 }), 0, 1.8, -.055);
    Place(group, Box(2.48, 1.55, .035, 0xf0f2e9, { roughness: .24, castShadow: false }), 0, 1.82, .055);
    for (const frameX of [-1.29, 1.29]) Place(group, Box(.08, 1.69, .17, 0xc8cbc6, { surface: "metal", metalness: .72, roughness: .22 }), frameX, 1.8, .015);
    for (const frameY of [1.0, 2.62]) Place(group, Box(2.62, .08, .17, 0xc8cbc6, { surface: "metal", metalness: .72, roughness: .22 }), 0, frameY, .015);
    for (const [magnetX, magnetY, magnetColor] of [[-1.12, 2.48, 0xd74f52], [1.1, 2.46, 0x4e82b8], [-1.1, 1.16, 0xe1b83c]]) {
      const magnet = Sphere(.055, magnetColor, { roughness: .38, castShadow: false, segments: 12, rings: 8 });
      magnet.scale.z = .38;
      Place(group, magnet, magnetX, magnetY, .105);
    }
    Place(group, Box(.64, .46, .025, 0xffdf72, { surface: "paper", castShadow: false }), -.62, 1.99, .09, -.025);
    Place(group, Box(.57, .4, .025, 0xffa8bd, { surface: "paper", castShadow: false }), .61, 1.6, .09, .035);
    for (const [noteX, noteY, magnetColor] of [[-.62, 2.19, 0xd74f52], [.61, 1.79, 0x4e82b8]]) {
      const noteMagnet = Sphere(.038, magnetColor, { roughness: .35, castShadow: false, segments: 10, rings: 7 });
      noteMagnet.scale.z = .32;
      Place(group, noteMagnet, noteX, noteY, .122);
    }
    Place(group, Box(1.56, .045, .018, 0x376c91, { castShadow: false }), -.02, 2.34, .094, -.015);
    Place(group, Box(.78, .035, .018, 0x376c91, { castShadow: false }), -.38, 2.24, .094, .02);
    const markerCircle = Torus(.22, .023, 0xb64f4e, { roughness: .48, castShadow: false, radialSegments: 8, tubularSegments: 24 });
    Place(group, markerCircle, .78, 2.18, .102, -.12);
    Place(group, Box(1.78, .09, .26, 0xb7bbb8, { surface: "metal", metalness: .62, roughness: .26 }), .22, .93, .13);
    for (const [markerX, markerColor] of [[-.42, 0x254f69], [.02, 0xb64f4e], [.46, 0x242a29]]) {
      Place(group, Box(.36, .04, .055, markerColor, { roughness: .45, castShadow: false }), markerX, .995, .25, markerX * .04);
      Place(group, Box(.06, .045, .058, 0xe4e5dd, { roughness: .65, castShadow: false }), markerX + .19, .995, .25, markerX * .04);
    }
  } else if (kind === "marketingPhone") {
    Place(group, Box(1.6, .12, .72, 0x6c4934, { surface: "wood", roughness: .72 }), 0, .86, .02);
    for (const legX of [-.57, .57]) Place(group, Box(.1, .82, .1, 0x493326, { surface: "wood" }), legX, .43, -.02);
    const phone = Box(.56, .94, .1, 0x12141c, { surface: "metal", metalness: .44, roughness: .3 });
    Place(group, phone, -.08, 1.43, .2, -.08);
    Place(group, Box(.43, .72, .026, color, { emissive: color, emissiveIntensity: .82, roughness: .16, castShadow: false }), -.08, 1.43, .258, -.08);
    Place(group, Sphere(.025, 0xbcc5cf, { surface: "metal", metalness: .7, castShadow: false }), -.08, 1.82, .26);
    AddPaperStack(group, .45, .95, .26, .35, 0xe8deca, 3);
  } else if (kind === "homeCalendar") {
    Place(group, Box(1.48, 1.58, .07, 0xeee6d6, { surface: "paper", roughness: .98 }), 0, 1.76, -.02);
    Place(group, Box(1.3, .3, .028, color, { emissive: color, emissiveIntensity: .26, castShadow: false }), 0, 2.3, .035);
    for (let row = 0; row < 3; row += 1) {
      Place(group, Box(1.08, .03, .022, 0x706b63, { surface: "paper", castShadow: false }), 0, 1.89 - row * .28, .04);
    }
    for (const ringX of [-.42, .42]) Place(group, Torus(.07, .018, 0xa6a8aa, { surface: "metal", metalness: .78, radialSegments: 8, tubularSegments: 16 }), ringX, 2.56, .07);
  } else if (kind === "exit") {
    Place(group, Box(1.42, 3.16, .22, 0x403027, { surface: "wood", roughness: .62 }), 0, 1.58, -.02);
    Place(group, Box(1.06, 2.72, .05, 0x2d2421, { surface: "wood", roughness: .7 }), 0, 1.54, .12);
    for (const insetY of [.86, 1.58, 2.3]) Place(group, Box(.82, .48, .028, 0x392c27, { surface: "wood", castShadow: false }), 0, insetY, .16);
    const handle = Cylinder(.07, .07, .18, color, 12);
    handle.rotation.x = Math.PI / 2;
    Place(group, handle, .39, 1.5, .29);
    Place(group, Box(.86, .075, .028, color, { emissive: color, emissiveIntensity: .48, castShadow: false }), 0, 2.77, .19);
  } else if (kind === "homeFridge") {
    const fridge = Box(1.34, 2.62, 1.12, 0xc7d0d2, { surface: "metal", metalness: .34, roughness: .42 });
    fridge.position.y = 1.28;
    group.add(fridge);
    Place(group, Box(1.16, .045, .035, 0x596065, { surface: "metal", metalness: .7, roughness: .22 }), 0, 1.58, .575);
    for (const handleY of [.95, 1.9]) Place(group, Box(.08, .48, .08, 0x83898b, { surface: "metal", metalness: .82, roughness: .2 }), .45, handleY, .62);
    for (const [magnetX, magnetY, magnetColor] of [[-.36,1.95,0xd9636d],[-.1,2.13,0x5c9ccc],[.17,1.82,0xd6b54c]]) {
      Place(group, Box(.16, .18, .025, magnetColor, { surface: "paper", castShadow: false }), magnetX, magnetY, .59, magnetX * .08);
    }
    Place(group, Box(.78, .08, .025, color, { emissive: color, emissiveIntensity: .35, castShadow: false }), 0, .42, .59);
  } else if (kind === "scratch") {
    Place(group, Box(2.25, .88, .92, 0x436b55, { surface: "wood", roughness: .7 }), 0, .45, -.02);
    Place(group, Box(2.38, .12, 1.02, 0xd8cda9, { surface: "stone", roughness: .54 }), 0, .93, .02);
    Place(group, Box(1.02, .055, .62, 0x245b3b, { surface: "fabric", roughness: .98 }), -.34, 1.02, .18);
    for (let ticketIndex = 0; ticketIndex < 5; ticketIndex += 1) {
      Place(group, Box(.23, .018, .42, ticketIndex % 2 ? 0xf0be4d : 0xd95759, { surface: "paper", castShadow: false }), -.67 + ticketIndex * .18, 1.06 + ticketIndex * .008, .25, (ticketIndex - 2) * .025);
    }
    Place(group, Box(.55, .72, .38, 0x2c3036, { surface: "metal", metalness: .36 }), .66, 1.3, -.02);
    Place(group, Box(.42, .34, .025, color, { emissive: color, emissiveIntensity: .82, roughness: .15, castShadow: false }), .66, 1.38, .19);
    const lamp = Sphere(.09, 0xffd166, { emissive: 0xffb33f, emissiveIntensity: 1.4, castShadow: false });
    Place(group, lamp, .88, 1.83, .05);
  } else if (kind === "bank") {
    Place(group, Box(2.65, 1.0, 1.02, 0x5b3b38, { surface: "wood", roughness: .65 }), 0, .5, -.04);
    Place(group, Box(2.75, .13, 1.12, 0xc2a578, { surface: "stone", roughness: .5 }), 0, 1.04, 0);
    const glassMaterial = new THREE.MeshPhysicalMaterial({ color: 0xdbe8e8, transparent: true, opacity: .24, roughness: .08, metalness: 0, transmission: .12 });
    Place(group, Box(2.24, 1.12, .025, 0xd9e7e7, { material: glassMaterial, castShadow: false }), 0, 1.7, .1);
    for (const grilleX of [-.9,-.6,-.3,0,.3,.6,.9]) Place(group, Box(.025, 1.15, .025, 0xb79553, { surface: "metal", metalness: .86, roughness: .22 }), grilleX, 1.7, .15);
    Place(group, Box(.62, .045, .32, 0x211c1b, { surface: "metal", metalness: .44 }), 0, 1.13, .34);
    AddPaperStack(group, -.7, 1.14, .28, .42, 0xe8dfcd, 5);
    Place(group, Box(.42, .52, .22, 0x292c31, { surface: "metal", metalness: .42 }), .72, 1.42, .22);
    Place(group, Box(.31, .23, .02, color, { emissive: color, emissiveIntensity: .52, castShadow: false }), .72, 1.48, .345);
  } else if (kind === "talentMarket") {
    const counter = Box(2.7, .86, .9, 0x38506b, { surface: "wood", roughness: .72 });
    counter.position.set(0, .43, -.03);
    const personA = BuildFlatHumanActor(0x66b8ff, false);
    const personB = BuildFlatHumanActor(0xffd166, false);
    personA.scale.setScalar(.68);
    personB.scale.setScalar(.68);
    personA.position.set(-.62, .77, -.11);
    personB.position.set(.62, .77, -.11);
    group.add(counter, personA, personB);
    Place(group, Box(2.82, .12, 1.0, 0xa8b6bf, { surface: "metal", metalness: .4, roughness: .35 }), 0, .91, 0);
    AddPaperStack(group, 0, .99, .34, .62, 0xe6dcc8, 7);
    Place(group, Box(.5, .4, .16, 0x1c2028, { surface: "metal", metalness: .32 }), 1.0, 1.25, .08);
    Place(group, Box(.4, .28, .02, 0x66b8ff, { emissive: 0x66b8ff, emissiveIntensity: .55, castShadow: false }), 1.0, 1.25, .17);
  } else if (kind === "snackShelf") {
    const shelf = Box(2.4, 2.35, .48, 0x35534a, { surface: "metal", metalness: .24, roughness: .55 });
    shelf.position.set(0, 1.17, -.12);
    group.add(shelf);
    for (const [rowIndex, y] of [.45, 1.02, 1.59, 2.16].entries()) {
      Place(group, Box(2.22, .12, .62, rowIndex === 3 ? 0x4a7d67 : 0x61766d, { surface: "metal", metalness: .35, roughness: .48 }), 0, y, .05);
      for (let itemIndex = 0; itemIndex < 7; itemIndex += 1) {
        const palette = [0xd85b58,0xe0b848,0x5a9bc1,0x8a6bc1,0x69a875];
        AddPackage(group, -.91 + itemIndex * .3, y + .22, .29, palette[(itemIndex + rowIndex * 2) % palette.length], .78 + (itemIndex % 2) * .1, itemIndex % 4 === 0);
      }
    }
    Place(group, Box(2.18, .06, .03, color, { emissive: color, emissiveIntensity: .28, castShadow: false }), 0, 2.32, .18);
  } else if (["regularFootbath", "footbathCity", "maleModelClub"].includes(kind)) {
    const isCity = kind === "footbathCity";
    const isLuxury = kind === "maleModelClub";
    const upholstery = isLuxury ? 0x641f3f : isCity ? 0x493d64 : 0x315b5c;
    const trim = isLuxury ? 0xc29a62 : isCity ? 0x9d82bd : 0x6e8b83;
    Place(group, Box(1.48, 1.22, .3, upholstery, { surface: "leather", roughness: .74 }), -.42, 1.35, -.06, -.09);
    Place(group, Box(1.32, .34, .7, new THREE.Color(upholstery).multiplyScalar(1.18).getHex(), { surface: "leather", roughness: .8 }), -.27, .66, .16, -.025);
    Place(group, Box(1.22, .18, .54, 0x2b2627, { surface: "wood", roughness: .66 }), -.22, .42, .12);
    for (const armX of [-.93, .3]) Place(group, Box(.16, .46, .48, trim, { surface: isLuxury ? "wood" : "metal", metalness: isLuxury ? .12 : .42, roughness: .45 }), armX, .78, .12);
    const basin = Cylinder(.63, .5, .42, isLuxury ? 0x7d526c : isCity ? 0x66567c : 0x6d8d89, 28, { surface: isLuxury ? "stone" : "tile", roughness: .44 });
    Place(group, basin, .78, .31, .22);
    const basinRim = Torus(.565, .045, trim, { surface: "metal", metalness: .74, roughness: .24 });
    basinRim.rotation.x = Math.PI / 2;
    Place(group, basinRim, .78, .53, .22);
    Place(group, Cylinder(.51, .51, .028, color, 30, { emissive: color, emissiveIntensity: .32, transparent: true, opacity: .72, roughness: .16, castShadow: false }), .78, .545, .22);
    for (let towelIndex = 0; towelIndex < 3; towelIndex += 1) {
      Place(group, Box(.38, .055, .28, towelIndex % 2 ? 0xe4dccd : 0xcfc5b3, { surface: "fabric", roughness: .98 }), .84 + towelIndex * .018, .63 + towelIndex * .055, -.08, (towelIndex - 1) * .02);
    }
    for (let steamIndex = 0; steamIndex < 3; steamIndex += 1) {
      const steam = new THREE.Mesh(
        new THREE.RingGeometry(.09 + steamIndex * .025, .12 + steamIndex * .025, 18, 1, 0, Math.PI * 1.45),
        new THREE.MeshBasicMaterial({ color: 0xf7efe3, transparent: true, opacity: .24, side: THREE.DoubleSide, toneMapped: false }),
      );
      steam.position.set(.54 + steamIndex * .23, .88 + steamIndex * .09, .42);
      steam.rotation.z = steamIndex % 2 ? .42 : -.28;
      group.add(steam);
    }
    if (isLuxury) {
      const host = BuildFlatHumanActor(0xff86c8, false);
      host.scale.setScalar(.62);
      host.position.set(-1.08, .55, .03);
      group.add(host);
      Place(group, Sphere(.075, color, { emissive: color, emissiveIntensity: 1.35, castShadow: false }), 1.06, 1.34, .12);
    }
  } else if (kind === "diner") {
    Place(group, Box(2.65, .92, 1.08, 0x73472d, { surface: "wood", roughness: .72 }), 0, .46, -.04);
    Place(group, Box(2.78, .14, 1.18, 0x9b6b42, { surface: "wood", roughness: .6 }), 0, .97, 0);
    const bowl = Cylinder(.34, .25, .19, 0xe4ddd0, 22, { surface: "stone", roughness: .52 });
    bowl.rotation.x = Math.PI / 2;
    Place(group, bowl, 0, 1.18, .1);
    for (const offset of [-.05,.05]) Place(group, Box(.025, .54, .025, 0x6e3324, { surface: "wood", castShadow: false }), .48 + offset, 1.18, .22, -.78);
    const pot = Cylinder(.38, .42, .42, 0x343434, 22, { surface: "metal", metalness: .62, roughness: .38 });
    Place(group, pot, -.76, 1.22, -.05);
    Place(group, Cylinder(.22, .22, .06, 0x242424, 18, { surface: "metal", metalness: .62 }), -.76, 1.46, -.05);
    AddStool(group, -1.02, 0, .52, 0x6d3027);
    AddStool(group, .95, 0, .52, 0x6d3027);
  } else {
    const table = Cylinder(.92, .92, .11, 0xe7dcc9, 36, { surface: "fabric", roughness: .96 });
    Place(group, table, 0, .9, .02);
    Place(group, Cylinder(.12, .18, .84, 0x6a503d, 18, { surface: "wood" }), 0, .43, 0);
    Place(group, Cylinder(.48, .58, .08, 0x594234, 24, { surface: "wood" }), 0, .06, 0);
    const plate = Cylinder(.34, .34, .045, 0xece8dc, 28, { surface: "stone", roughness: .38 });
    Place(group, plate, 0, .99, .03);
    const cloche = new THREE.Mesh(
      new THREE.SphereGeometry(.28, 24, 14, 0, Math.PI * 2, 0, Math.PI * .54),
      SurfaceMaterial("metal", 0xc6b277, { metalness: .86, roughness: .2 }),
    );
    cloche.scale.y = .72;
    Place(group, cloche, 0, 1.1, .03);
    Place(group, Sphere(.055, 0xc6b277, { surface: "metal", metalness: .9, roughness: .16 }), 0, 1.34, .03);
    AddStool(group, -.92, 0, .38, 0x7d293d);
    AddStool(group, .92, 0, .38, 0x7d293d);
  }
  AddPhysicalLabel(group, title, subtitle, 2.75, 0, 3.03, -.02, color, { compact: true, backing: kind === "hotel" ? 0x513828 : 0x26272a });
  group.userData.marker = marker;
  group.userData.interactionId = interaction.id;
  group.userData.kind = kind;
  facilityVisuals.set(interaction.id, group);
  facilityGroup.add(group);
}

function AddScenePanel(group, width, height, x, y, color, options = {}) {
  const panel = FlatPanel(width, height, color, {
    z: options.z ?? -.14,
    opacity: options.opacity ?? 1,
    rotation: options.rotation ?? 0,
  });
  panel.position.x = x;
  panel.position.y = y;
  group.add(panel);
  return panel;
}

function AddSceneDisc(group, radius, x, y, color, options = {}) {
  const disc = FlatDisc(radius, color, {
    z: options.z ?? -.13,
    opacity: options.opacity ?? 1,
    segments: options.segments ?? 24,
  });
  disc.position.x = x;
  disc.position.y = y;
  disc.scale.y = options.scaleY ?? 1;
  group.add(disc);
  return disc;
}

function AddSceneRing(group, innerRadius, outerRadius, x, y, color, options = {}) {
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(
      innerRadius,
      outerRadius,
      options.segments ?? 32,
      1,
      options.thetaStart ?? 0,
      options.thetaLength ?? Math.PI * 2,
    ),
    new THREE.MeshBasicMaterial({
      color,
      transparent: (options.opacity ?? 1) < 1,
      opacity: options.opacity ?? 1,
      depthWrite: false,
      toneMapped: false,
      side: THREE.DoubleSide,
    }),
  );
  ring.position.set(x, y, options.z ?? -.13);
  group.add(ring);
  return ring;
}

function AddPendant(group, x, accent, cableTop = 5.15, lampY = 4.35) {
  const cable = Cylinder(.018, .018, cableTop - lampY, 0x292826, 10, { surface: "metal", metalness: .55, roughness: .38, castShadow: false });
  Place(group, cable, x, lampY + (cableTop - lampY) * .5, .22);
  const shade = Cylinder(.13, .34, .3, 0x343331, 24, { surface: "metal", metalness: .48, roughness: .36 });
  Place(group, shade, x, lampY + .08, .22);
  const rim = Torus(.32, .025, 0x7b7366, { surface: "metal", metalness: .72, roughness: .28 });
  rim.rotation.x = Math.PI / 2;
  Place(group, rim, x, lampY - .07, .22);
  const bulb = Sphere(.085, accent, { emissive: accent, emissiveIntensity: 1.7, roughness: .2, castShadow: false, segments: 14, rings: 9 });
  Place(group, bulb, x, lampY - .13, .22);
  AddSceneDisc(group, .52, x, lampY - .18, accent, { z: -.2, opacity: .075, scaleY: .72, segments: 32 });
  const light = new THREE.PointLight(accent, 2.8, 5.4, 2);
  light.position.set(x, lampY - .22, 1.6);
  light.castShadow = false;
  worldPracticalLights.push(light);
  group.add(light);
  return bulb;
}

function AddFramedPanel(group, x, y, width, height, faceColor, frameColor = 0x4f3b2b, options = {}) {
  Place(group, Box(width, height, .08, faceColor, {
    surface: options.surface ?? "fabric", roughness: options.roughness ?? .88, castShadow: false,
  }), x, y, options.z ?? -.08);
  const frameDepth = .14;
  const frameWidth = options.frameWidth ?? .1;
  for (const [partWidth, partHeight, partX, partY] of [
    [width + frameWidth * 2, frameWidth, x, y + height * .5 + frameWidth * .5],
    [width + frameWidth * 2, frameWidth, x, y - height * .5 - frameWidth * .5],
    [frameWidth, height, x - width * .5 - frameWidth * .5, y],
    [frameWidth, height, x + width * .5 + frameWidth * .5, y],
  ]) Place(group, Box(partWidth, partHeight, frameDepth, frameColor, { surface: options.frameSurface ?? "wood", metalness: options.frameMetalness ?? .04 }), partX, partY, (options.z ?? -.08) + .06);
}

function AddWallClock(group, x, y, accent = 0xd7bc78, radius = .54) {
  const face = Cylinder(radius, radius, .1, 0xe6dfcd, 32, { surface: "paper", roughness: .78, castShadow: false });
  face.rotation.x = Math.PI / 2;
  Place(group, face, x, y, -.01);
  Place(group, Torus(radius, .055, accent, { surface: "metal", metalness: .72, roughness: .28 }), x, y, .06);
  for (let index = 0; index < 12; index += 1) {
    const angle = index / 12 * Math.PI * 2;
    Place(group, Box(.025, index % 3 ? .07 : .11, .018, 0x39342d, { castShadow: false }), x + Math.sin(angle) * radius * .78, y + Math.cos(angle) * radius * .78, .13, -angle);
  }
  Place(group, Box(.035, radius * .58, .018, 0x332d28, { castShadow: false }), x, y + radius * .22, .15, -.38);
  Place(group, Box(.028, radius * .42, .02, 0x9e3638, { castShadow: false }), x, y + radius * .15, .16, 1.02);
  Place(group, Sphere(.045, accent, { surface: "metal", metalness: .8, castShadow: false, segments: 10, rings: 7 }), x, y, .18);
}

function AddPlant(group, x, y, z, scale = 1) {
  const pot = Cylinder(.27 * scale, .2 * scale, .42 * scale, 0x8d5339, 18, { surface: "stone", roughness: .9 });
  Place(group, pot, x, y + .21 * scale, z);
  for (let stemIndex = 0; stemIndex < 5; stemIndex += 1) {
    const offset = (stemIndex - 2) * .08 * scale;
    Place(group, Box(.025 * scale, (.52 + stemIndex % 2 * .18) * scale, .025 * scale, 0x395e3b, { castShadow: false }), x + offset, y + (.64 + stemIndex % 2 * .09) * scale, z, offset * -1.2);
    const leaf = Sphere(.15 * scale, stemIndex % 2 ? 0x527c4f : 0x416b43, { surface: "fabric", roughness: .94, segments: 12, rings: 8 });
    leaf.scale.set(.55, 1.25, .28);
    Place(group, leaf, x + offset * 2.1, y + (.82 + stemIndex % 3 * .13) * scale, z + .02, offset * -2);
  }
}

function AddQueuePost(group, x, ropeTargetX = null, color = 0xc2a05f) {
  Place(group, Cylinder(.18, .23, .08, color, 20, { surface: "metal", metalness: .8, roughness: .22 }), x, .05, .72);
  Place(group, Cylinder(.035, .045, 1.05, color, 14, { surface: "metal", metalness: .82, roughness: .2 }), x, .58, .72);
  Place(group, Sphere(.09, color, { surface: "metal", metalness: .86, roughness: .18 }), x, 1.13, .72);
  if (ropeTargetX !== null) {
    const width = Math.abs(ropeTargetX - x);
    const rope = Box(width, .055, .055, 0x6f2439, { surface: "fabric", roughness: .95 });
    Place(group, rope, (x + ropeTargetX) * .5, .95, .72, (ropeTargetX > x ? -1 : 1) * .035);
  }
}

function AddFluorescent(group, x, y, color = 0xe6fff7, width = 1.6) {
  Place(group, Box(width + .16, .16, .2, 0x545a58, { surface: "metal", metalness: .58, roughness: .34 }), x, y, .03);
  Place(group, Box(width, .075, .08, color, { emissive: color, emissiveIntensity: 1.35, roughness: .18, castShadow: false }), x, y - .045, .16);
  const light = new THREE.PointLight(color, 2.15, 5.1, 2.15);
  light.position.set(x, y - .18, 1.25);
  worldPracticalLights.push(light);
  group.add(light);
}

function AddTuftedPanel(group, x, y, width, height, color) {
  Place(group, Box(width, height, .16, color, { surface: "fabric", roughness: .94, castShadow: false }), x, y, -.08);
  const columns = Math.max(2, Math.round(width / .55));
  const rows = Math.max(2, Math.round(height / .48));
  for (let row = 0; row < rows; row += 1) for (let column = 0; column < columns; column += 1) {
    const button = Sphere(.032, 0x3a1822, { surface: "leather", roughness: .82, castShadow: false, segments: 9, rings: 6 });
    button.scale.z = .35;
    Place(group, button, x - width * .42 + column * width * .84 / Math.max(1, columns - 1), y - height * .38 + row * height * .76 / Math.max(1, rows - 1), .02);
  }
}

function BuildLocationEnvironment(location, index) {
  const group = new THREE.Group();
  const start = location.startX;
  const end = location.endX;
  const center = (start + end) * .5;
  const accent = HexColor(location.accent);
  const paleAccent = new THREE.Color(accent).lerp(new THREE.Color(0xffffff), .32).getHex();
  const roomWidth = end - start;
  const halo = AddSceneDisc(group, 3.45, center, 3.45, accent, { z: -.29, opacity: .025, scaleY: .8, segments: 42 });
  const ceilingBar = AddScenePanel(group, 6.4, .04, center, 6.08, accent, { z: -.04, opacity: .3 });
  Place(group, Box(roomWidth - .28, .18, .18, location.id === "bank" || location.id === "hotel" ? 0xaa9164 : 0x544d45, { surface: location.id === "bank" ? "stone" : "wood", roughness: .62 }), center, .72, -.06);
  Place(group, Box(roomWidth - .26, .1, .16, location.id === "hotel" ? 0xb89358 : 0x5d554d, { surface: location.id === "bank" ? "stone" : "wood", roughness: .58 }), center, 5.06, -.06);
  for (const jambX of [start + .28, end - .28]) Place(group, Box(.16, 4.45, .18, index % 2 ? 0x3e3833 : 0x48413b, { surface: location.id === "bank" ? "stone" : "wood" }), jambX, 2.85, -.04);

  if (location.id === "home") {
    const windowX = center + .55;
    AddFramedPanel(group, windowX, 3.42, 3.3, 2.28, 0x14213a, 0x70523c, { surface: "metal", frameWidth: .11, z: -.13 });
    Place(group, Box(.07, 2.2, .09, 0x8d6849, { surface: "wood" }), windowX, 3.42, .02);
    Place(group, Box(3.25, .07, .09, 0x8d6849, { surface: "wood" }), windowX, 3.42, .02);
    [0, 1, 2, 3, 4].forEach((buildingIndex) => {
      const width = .38 + (buildingIndex % 2) * .18;
      const height = .52 + ((buildingIndex * 7) % 3) * .24;
      const x = center - .72 + buildingIndex * .37;
      Place(group, Box(width, height, .03, buildingIndex % 2 ? 0x26324a : 0x202a40, { surface: "plaster", castShadow: false }), x, 2.3 + height * .5, -.035);
      Place(group, Box(.045, .045, .015, buildingIndex % 2 ? 0xe8c96d : accent, { emissive: accent, emissiveIntensity: .25, castShadow: false }), x + .07, 2.48 + height * .35, -.005);
    });
    Place(group, Box(1.55, 1.52, .42, 0x5b4638, { surface: "wood" }), start + 1.05, 1.52, -.08);
    [.78, 1.22, 1.66, 2.1].forEach((y) => Place(group, Box(1.36, .075, .5, 0x8a6547, { surface: "wood" }), start + 1.05, y, .04));
    for (let bookIndex = 0; bookIndex < 12; bookIndex += 1) {
      const row = Math.floor(bookIndex / 4);
      const colors = [0x8d4851,0x496680,0x887244,0x526f59];
      Place(group, Box(.16, .3 + (bookIndex % 3) * .05, .28, colors[bookIndex % colors.length], { surface: "paper" }), start + .58 + bookIndex % 4 * .31, .98 + row * .44, .2, (bookIndex % 2 ? 1 : -1) * .025);
    }
    AddFramedPanel(group, start + 3.04, 3.3, 1.6, 1.28, 0x8b6b46, 0x5b3d2b, { surface: "wood", z: -.08, frameWidth: .08 });
    [[start + 2.65, 3.55], [start + 3.18, 3.28], [start + 2.92, 2.94]].forEach(([x, y], noteIndex) => {
      Place(group, Box(.38, .26, .018, noteIndex === 1 ? 0xffd166 : paleAccent, { surface: "paper", castShadow: false }), x, y, .05, (noteIndex - 1) * .06);
    });
    AddWallClock(group, start + 8.85, 3.8, 0xb8a26c, .48);
    Place(group, Box(4.3, .045, 1.28, 0x5e466c, { surface: "fabric", roughness: .98 }), start + 4.45, .055, .72, -.02);
  } else if (location.id === "diner") {
    Place(group, Box(8.7, 1.42, .12, 0xd8c8ac, { surface: "tile", roughness: .45, castShadow: false }), center, 1.48, -.12);
    AddFramedPanel(group, start + 2.1, 3.42, 1.92, 1.16, 0x181719, 0x7c4f32, { surface: "plaster", z: -.06, frameWidth: .09 });
    const menu = TextPlane("今日小炒", "米饭另算 · 不许赊账", 1.65, "#f0d7a0");
    menu.position.set(start + 2.1, 3.42, .04);
    group.add(menu);
    for (let stripe = 0; stripe < 12; stripe += 1) {
      Place(group, Box(.61, .46, .11, stripe % 2 ? 0xe8ddc8 : 0x8d3442, { surface: "fabric", roughness: .96 }), start + 1.27 + stripe * .62, 4.48, -.04, stripe % 2 ? -.045 : .045);
    }
    const bulbA = AddPendant(group, center - 1.4, accent);
    const bulbB = AddPendant(group, center + 1.45, accent, 5.15, 4.18);
    bulbA.userData.pulseOffset = .4;
    bulbB.userData.pulseOffset = 1.7;
    for (const hookX of [start + 7.7,start + 8.3,start + 8.9]) {
      Place(group, Torus(.12, .018, 0x8b8275, { surface: "metal", metalness: .66, roughness: .28, castShadow: false }), hookX, 3.15, .02);
      Place(group, Cylinder(.16, .12, .12, 0x44413b, 16, { surface: "metal", metalness: .52, roughness: .36 }), hookX, 2.88, .02);
    }
    Place(group, Box(5.2, .045, 1.18, 0x753727, { surface: "fabric", roughness: .98 }), center + .8, .055, .72);
  } else if (location.id === "market") {
    Place(group, Box(9.05, 2.68, .11, 0xc9d7cd, { surface: "tile", roughness: .42, castShadow: false }), center, 2.63, -.12);
    [start + 1.65, start + 5.05, start + 8.35].forEach((shelfX, shelfIndex) => {
      Place(group, Box(2.55, 2.15, .34, shelfIndex === 1 ? 0x3e6257 : 0x35574f, { surface: "metal", metalness: .3, roughness: .52 }), shelfX, 2.35, -.06);
      [.72, 1.35, 1.98].forEach((y, rowIndex) => {
        Place(group, Box(2.28, .075, .45, rowIndex === 1 ? 0x6c927c : 0x63756e, { surface: "metal", metalness: .34, roughness: .5 }), shelfX, y, .08);
        for (let item = 0; item < 7; item += 1) {
          const colors = [0xdf6258,0xe4b64f,0x67a2bd,0x866bc0,0x7aaa72];
          AddPackage(group, shelfX - .91 + item * .3, y + .19, .34, colors[(item + shelfIndex + rowIndex) % colors.length], .72 + (item % 2) * .08, item % 5 === 0);
        }
      });
    });
    [center - 2.35, center, center + 2.35].forEach((x) => {
      AddFluorescent(group, x, 4.93, 0xe7fff5, 1.55);
    });
    for (let flag = 0; flag < 9; flag += 1) Place(group, Box(.34, .28, .018, flag % 2 ? accent : 0xffd166, { surface: "paper", castShadow: false }), start + .95 + flag * .96, 4.18 + (flag % 2) * .07, .02, flag % 2 ? .12 : -.12);
    Place(group, Box(8.0, .04, 1.1, 0x4a675e, { surface: "linoleum", roughness: .86 }), center, .055, .75);
  } else if (location.id === "talent") {
    const glassMaterial = new THREE.MeshPhysicalMaterial({ color: 0x9fb8c9, transparent: true, opacity: .25, roughness: .36, metalness: .02, transmission: .08 });
    for (let paneIndex = 0; paneIndex < 5; paneIndex += 1) {
      const x = start + 1.05 + paneIndex * 1.95;
      Place(group, Box(1.72, 2.78, .035, 0xa7bfd0, { material: glassMaterial.clone(), castShadow: false }), x, 3.02, -.06);
      Place(group, Box(.055, 2.9, .12, 0x5f7589, { surface: "metal", metalness: .56, roughness: .34 }), x + .92, 3.02, .01);
    }
    AddPhysicalLabel(group, "候选人登记", "先看作品，再谈梦想", 2.35, start + 2.05, 4.46, .06, accent, { compact: true, backing: 0x2e4359, surface: "metal" });
    AddFramedPanel(group, start + 7.25, 3.75, 2.5, 1.5, 0x9a744b, 0x4b392b, { surface: "wood", z: -.01, frameWidth: .08 });
    [[start + 6.35,4.05],[start + 7.15,3.75],[start + 7.95,4.12],[start + 6.65,3.35],[start + 7.65,3.3]].forEach(([x,y],cardIndex) => Place(group, Box(.56, .76, .018, cardIndex % 2 ? paleAccent : 0xe3d9c6, { surface: "paper", castShadow: false }), x, y, .09, (cardIndex - 2) * .02));
    for (const chairX of [start + 1.25,start + 2.2,start + 6.2]) {
      Place(group, Box(.72, .12, .52, 0x3b5a76, { surface: "fabric" }), chairX, .58, .35);
      Place(group, Box(.72, .72, .14, 0x3b5a76, { surface: "fabric" }), chairX, .96, .05, -.08);
      for (const legX of [-.25,.25]) Place(group, Box(.045, .48, .045, 0x6c7680, { surface: "metal", metalness: .62 }), chairX + legX, .27, .3, legX * .06);
    }
    AddFluorescent(group, center, 4.93, 0xdceeff, 2.4);
  } else if (location.id === "bank") {
    Place(group, Box(9.08, 3.78, .12, 0x9c9388, { surface: "stone", roughness: .65, castShadow: false }), center, 2.9, -.13);
    [start + .95, start + 3.0, start + 7.0, start + 9.05].forEach((x, columnIndex) => {
      Place(group, Cylinder(.24, .28, 3.82, columnIndex % 2 ? 0x8a817a : 0xaba299, 22, { surface: "stone", roughness: .62 }), x, 2.69, -.02);
      Place(group, Box(.72, .18, .42, 0xb69c69, { surface: "stone", roughness: .48 }), x, 4.64, -.01);
      Place(group, Box(.72, .16, .42, 0xb69c69, { surface: "stone", roughness: .48 }), x, .78, -.01);
    });
    const vaultX = start + 8.02;
    const vault = Cylinder(1.22, 1.22, .28, 0x30353a, 36, { surface: "metal", metalness: .68, roughness: .31 });
    vault.rotation.x = Math.PI / 2;
    Place(group, vault, vaultX, 2.78, .02);
    Place(group, Torus(1.03, .095, 0xb59556, { surface: "metal", metalness: .84, roughness: .2 }), vaultX, 2.78, .2);
    Place(group, Torus(.48, .055, 0xb59556, { surface: "metal", metalness: .84, roughness: .2 }), vaultX, 2.78, .25);
    for (let spoke = 0; spoke < 8; spoke += 1) Place(group, Box(.76, .045, .06, 0xb59556, { surface: "metal", metalness: .84, roughness: .2 }), vaultX, 2.78, .28, spoke * Math.PI / 4);
    Place(group, Sphere(.13, 0xd2b46e, { surface: "metal", metalness: .9, roughness: .16 }), vaultX, 2.78, .32);
    AddQueuePost(group, start + 2.9, start + 4.2);
    AddQueuePost(group, start + 4.2, start + 5.5);
    AddQueuePost(group, start + 5.5, null);
    AddWallClock(group, start + 1.85, 3.72, 0xb59556, .44);
    Place(group, Box(6.7, .04, 1.2, 0x58616a, { surface: "stone", roughness: .66 }), center - .45, .055, .72);
  } else if (location.id === "hotel") {
    Place(group, Box(9.06, 1.72, .15, 0x503728, { surface: "wood", roughness: .66, castShadow: false }), center, 1.65, -.12);
    AddTuftedPanel(group, center, 3.55, 3.3, 2.16, 0x702a3b);
    AddTuftedPanel(group, start + 2.0, 3.55, 2.55, 2.16, 0x5f2535);
    AddTuftedPanel(group, end - 2.0, 3.55, 2.55, 2.16, 0x5f2535);
    for (const x of [start + .95,start + 2.95,end - 2.95,end - .95]) {
      Place(group, Box(.11, 4.1, .18, 0xb19059, { surface: "wood", roughness: .5 }), x, 2.82, .03);
      const sconce = Sphere(.1, accent, { emissive: accent, emissiveIntensity: 1.35, castShadow: false });
      Place(group, sconce, x, 4.55, .15);
      Place(group, Torus(.18, .028, 0xb69c62, { surface: "metal", metalness: .78, roughness: .24 }), x, 4.55, .12);
    }
    Place(group, Cylinder(.018, .018, .74, 0x6a5844, 10, { surface: "metal", castShadow: false }), center, 4.82, .24);
    for (const offset of [-.52,0,.52]) {
      Place(group, Box(.025, .46, .025, 0xb4955e, { surface: "metal", metalness: .78 }), center + offset, 4.28, .24, offset * -.55);
      Place(group, Sphere(.08, accent, { emissive: accent, emissiveIntensity: 1.45, castShadow: false }), center + offset, 4.04, .24);
    }
    Place(group, Torus(.66, .055, 0xb4955e, { surface: "metal", metalness: .8, roughness: .22 }), center, 4.46, .22);
    AddFramedPanel(group, start + 2.05, 2.78, 1.28, .92, 0x39495b, 0xb59762, { surface: "fabric", frameMetalness: .25, z: .03 });
    AddFramedPanel(group, end - 2.05, 2.78, 1.28, .92, 0x544235, 0xb59762, { surface: "fabric", frameMetalness: .25, z: .03 });
    AddPlant(group, start + .75, .04, .55, .78);
    AddPlant(group, end - .75, .04, .55, .78);
    Place(group, Box(8.4, .05, 1.32, 0x6d2637, { surface: "fabric", roughness: .98 }), center, .06, .76);
  } else if (["footbath", "footbathCity", "maleModelClub"].includes(location.id)) {
    const isCity = location.id === "footbathCity";
    const isLuxury = location.id === "maleModelClub";
    const upholstery = isLuxury ? 0x65213f : isCity ? 0x46395f : 0x315759;
    const trim = isLuxury ? 0xbd965c : isCity ? 0x9b82b9 : 0x78948d;
    const wallSurface = isLuxury ? "leather" : isCity ? "stone" : "tile";
    Place(group, Box(9.06, 1.58, .16, isLuxury ? 0x4a2638 : isCity ? 0x39334d : 0x476a67, { surface: wallSurface, roughness: isLuxury ? .8 : .58, castShadow: false }), center, 1.58, -.12);
    Place(group, Box(9.02, .16, .2, trim, { surface: "metal", metalness: .62, roughness: .3 }), center, 2.4, -.03);
    for (const [seatIndex, seatX] of [center - 2.55, center, center + 2.55].entries()) {
      AddFramedPanel(group, seatX, 3.35, 1.92, 1.72, seatIndex === 1 ? upholstery : new THREE.Color(upholstery).multiplyScalar(.82).getHex(), trim, {
        surface: "leather", frameSurface: isLuxury ? "wood" : "metal", frameMetalness: isLuxury ? .18 : .6, frameWidth: .085, z: -.05,
      });
      AddTuftedPanel(group, seatX, 3.36, 1.56, 1.38, seatIndex === 1 ? upholstery : new THREE.Color(upholstery).multiplyScalar(.9).getHex());
      Place(group, Box(1.46, .26, .72, upholstery, { surface: "leather", roughness: .82 }), seatX, 1.28, .18);
      Place(group, Box(1.22, .07, .34, 0xe2dac9, { surface: "fabric", roughness: .98, castShadow: false }), seatX, 1.47, .28, seatIndex % 2 ? .025 : -.025);
    }
    for (const cabinetX of [start + .72, end - .72]) {
      Place(group, Box(.82, 2.02, .46, isLuxury ? 0x513225 : 0x4c5d58, { surface: "wood", roughness: .7 }), cabinetX, 1.73, -.03);
      [.95,1.34,1.73,2.12].forEach((shelfY, shelfIndex) => {
        Place(group, Box(.69, .055, .5, trim, { surface: "metal", metalness: .48, roughness: .34 }), cabinetX, shelfY, .13);
        Place(group, Box(.48, .12, .34, shelfIndex % 2 ? 0xe4dccf : paleAccent, { surface: "fabric", roughness: .98 }), cabinetX, shelfY + .1, .24);
      });
    }
    AddPendant(group, center, accent, 5.18, 4.52);
    for (const lampX of [center - 2.55, center + 2.55]) {
      Place(group, Box(.05, .52, .08, trim, { surface: "metal", metalness: .75, roughness: .22 }), lampX, 4.68, .05);
      Place(group, Sphere(.09, accent, { emissive: accent, emissiveIntensity: 1.28, castShadow: false }), lampX, 4.42, .14);
    }
    if (isLuxury) {
      AddPhysicalLabel(group, "情绪价值会所", "黄铜灯牌 · 真皮卡座", 3.45, center, 4.02, .13, accent, { compact: true, backing: 0x472638, surface: "leather" });
      AddPlant(group, start + 1.32, .04, .52, .68);
      AddPlant(group, end - 1.32, .04, .52, .68);
    } else if (isCity) {
      Place(group, Box(4.4, .08, .1, accent, { emissive: accent, emissiveIntensity: .36, castShadow: false }), center, 4.12, .13);
    } else {
      for (let tileLine = 0; tileLine < 8; tileLine += 1) Place(group, Box(.035, 1.5, .03, 0xd4ddd6, { castShadow: false }), start + 1.3 + tileLine * 1.05, 1.6, .01);
    }
    Place(group, Box(8.36, .05, 1.28, isLuxury ? 0x6a2741 : isCity ? 0x56446d : 0x456d68, { surface: "fabric", roughness: .98 }), center, .06, .76);
  }

  const practicalColors = { home: 0xffd6ad, diner: 0xffc77f, market: 0xdfffee, talent: 0xdbeaff, bank: 0xffe0c6, hotel: 0xffc47d, footbath: 0xc8fff4, footbathCity: 0xe0cfff, maleModelClub: 0xffc6e4 };
  const roomLight = new THREE.PointLight(practicalColors[location.id] || accent, 1.55, 9.2, 2.05);
  roomLight.position.set(center, 3.8, 3.1);
  roomLight.castShadow = false;
  worldPracticalLights.push(roomLight);
  group.add(roomLight);
  locationVisuals.set(location.id, { group, halo, ceilingBar, roomLight, accent: new THREE.Color(accent), phase: index * 1.37 });
  roomGroup.add(group);
}

function BuildRoom() {
  const width = Math.abs(WorldBounds.maxX - WorldBounds.minX) + 4;
  const worldCenter = (WorldBounds.maxX + WorldBounds.minX) * .5;
  Place(distantGroup, Box(width + 8, 2.2, .16, 0x18191b, { surface: "fabric", roughness: .98, castShadow: false }), worldCenter, 7.05, -1.2);
  for (let beamIndex = 0; beamIndex < 13; beamIndex += 1) {
    Place(distantGroup, Box(width + 5, .045, .08, beamIndex % 3 ? 0x292825 : 0x6b5a43, { surface: beamIndex % 3 ? "metal" : "wood", metalness: beamIndex % 3 ? .3 : .02, castShadow: false }), worldCenter, 6.28 + beamIndex * .12, -1.02, (beamIndex - 6) * .0018);
  }
  Place(roomGroup, Box(width, .3, 3.4, 0x322d2a, { surface: "wood", roughness: .76 }), worldCenter, -.17, .55);
  Place(foregroundGroup, Box(width, .2, .18, 0x141416, { surface: "metal", metalness: .3, roughness: .48 }), worldCenter, -.02, 1.62);
  const roomLooks = {
    home: { wall: 0x817696, surface: "plaster", floor: 0x493a35, floorSurface: "wood", sign: 0x41354f },
    diner: { wall: 0x8f6a58, surface: "plaster", floor: 0x5a4540, floorSurface: "tile", sign: 0x5b302d },
    market: { wall: 0x718d80, surface: "tile", floor: 0x465d55, floorSurface: "linoleum", sign: 0x2e5145 },
    talent: { wall: 0x72869d, surface: "plaster", floor: 0x40536a, floorSurface: "linoleum", sign: 0x31485f },
    bank: { wall: 0x8d8289, surface: "stone", floor: 0x514d50, floorSurface: "stone", sign: 0x563a4d },
    hotel: { wall: 0x806553, surface: "fabric", floor: 0x5e3b3b, floorSurface: "fabric", sign: 0x68412f },
    footbath: { wall: 0x66817d, surface: "tile", floor: 0x405c59, floorSurface: "tile", sign: 0x315452 },
    footbathCity: { wall: 0x685c77, surface: "stone", floor: 0x493f58, floorSurface: "stone", sign: 0x45375a },
    maleModelClub: { wall: 0x78465f, surface: "leather", floor: 0x573047, floorSurface: "fabric", sign: 0x5b2944 },
  };
  WorldLocations.forEach((location, index) => {
    const locationWidth = location.endX - location.startX;
    const centerX = location.startX + locationWidth / 2;
    const look = roomLooks[location.id];
    const wall = Box(locationWidth - .08, 6.5, .18, look.wall, { surface: look.surface, castShadow: false, roughness: .92 });
    wall.position.set(centerX, 3.15, -.72);
    roomGroup.add(wall);
    Place(roomGroup, Box(locationWidth - .1, .16, 3.0, look.floor, { surface: look.floorSurface, roughness: look.floorSurface === "stone" ? .54 : .82 }), centerX, -.015, .48);
    Place(roomGroup, Box(locationWidth - .12, .72, .15, new THREE.Color(look.wall).multiplyScalar(.58).getHex(), { surface: look.surface, castShadow: false }), centerX, .38, -.49);
    BuildLocationEnvironment(location, index);
    AddPhysicalLabel(roomGroup, location.name, "", 6.25, centerX, 5.56, -.31, HexColor(location.accent), { compact: true, backing: look.sign, surface: location.id === "bank" ? "stone" : "wood" });
    Place(roomGroup, Box(.18, 6.55, .32, index % 2 ? 0x383331 : 0x45403b, { surface: location.id === "bank" ? "stone" : "wood" }), location.endX, 3.15, -.18);
    Place(roomGroup, Box(.62, .18, .48, 0x6f6559, { surface: location.id === "bank" ? "stone" : "wood" }), location.endX, 6.36, -.16);
    for (let markerIndex = 0; markerIndex < 4; markerIndex += 1) {
      Place(foregroundGroup, Box(.56, .025, .11, HexColor(location.accent), { surface: "metal", metalness: .58, roughness: .34, emissive: HexColor(location.accent), emissiveIntensity: .08 + markerIndex * .015, castShadow: false }), location.startX + 1.4 + markerIndex * 2.3, .075, 1.7);
    }
  });
  WorldInteractions.forEach(BuildFacility);
  const ambient = new THREE.HemisphereLight(0xfff4e1, 0x342d43, 1.42);
  const key = new THREE.DirectionalLight(0xfff2dc, 2.65);
  key.position.set(5, 9, 11);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -18;
  key.shadow.camera.right = 18;
  key.shadow.camera.top = 10;
  key.shadow.camera.bottom = -4;
  key.shadow.camera.near = .5;
  key.shadow.camera.far = 45;
  key.shadow.bias = -.00055;
  key.shadow.normalBias = .035;
  const fill = new THREE.DirectionalLight(0xaecbff, .72);
  fill.position.set(-8, 4, 7);
  worldAccentLight = new THREE.PointLight(0x9d8cff, 3.4, 10.5, 1.9);
  worldAccentLight.position.set(WorldLocations[0].startX + 5, 4.1, 4.2);
  scene.add(ambient, key, fill, worldAccentLight);
}

function BuildCeremonyScene() {
  DisposeGroup(ceremonyGroup);
  ceremonySpotlights = [];
  const stageX = 6;
  const floor = Box(13, .42, 4.8, 0x191726, { roughness: .45, metalness: .08 });
  floor.position.set(stageX, -.15, 0);
  const stageRiser = Box(9.6, .28, 3.35, 0x211d31, { roughness: .62, metalness: .08 });
  stageRiser.position.set(stageX, .06, -.15);
  const frontStep = Box(7.8, .16, 1.35, 0x30233a, { roughness: .72, metalness: .04 });
  frontStep.position.set(stageX - .55, .14, 1.58);
  const carpet = Box(10.5, .04, 1.75, 0x5b1734, { roughness: .9, castShadow: false });
  carpet.position.set(stageX - 2, .08, .9);
  const backdrop = Box(9.4, 6.2, .25, 0x131525, { castShadow: false });
  backdrop.position.set(stageX, 3.05, -2.05);
  const insetBackdrop = Box(8.55, 5.18, .08, 0x0b0d18, { castShadow: false, roughness: .96 });
  insetBackdrop.position.set(stageX, 3.05, -1.86);
  ceremonyGroup.add(floor, stageRiser, frontStep, carpet, backdrop, insetBackdrop);
  const frameColor = 0x6e5832;
  for (const [width, height, x, y] of [
    [8.7, .09, stageX, 5.82], [8.7, .09, stageX, .48],
    [.09, 5.22, stageX - 4.3, 3.05], [.09, 5.22, stageX + 4.3, 3.05],
  ]) {
    const frame = Box(width, height, .055, frameColor, { castShadow: false, roughness: .88 });
    frame.position.set(x, y, -1.77);
    ceremonyGroup.add(frame);
  }
  const stageHalo = new THREE.Mesh(
    new THREE.RingGeometry(2.38, 2.46, 48),
    new THREE.MeshBasicMaterial({ color: 0x9d8cff, transparent: true, opacity: .16, depthWrite: false, toneMapped: false }),
  );
  stageHalo.position.set(stageX, 3.05, -1.72);
  ceremonyGroup.add(stageHalo);
  for (const offset of [-4.35, 4.35]) {
    const column = Cylinder(.32, .48, 5.6, 0x3a3454, 16);
    column.position.set(stageX + offset, 2.7, -1.72);
    ceremonyGroup.add(column);
    const capital = Box(.92, .18, .58, 0x5b4d73, { castShadow: false, roughness: .8 });
    capital.position.set(stageX + offset, 5.5, -1.72);
    ceremonyGroup.add(capital);
  }
  const header = TextPlane("公司成立", "", 5.7, "#ffd166");
  header.position.set(stageX, 5.7, -1.12);
  ceremonyGroup.add(header);
  ceremonyPlaque = TextPlane("等待命名", "M08 清算", 5.6, "#f5f0dd");
  ceremonyPlaque.position.set(stageX, 3.55, -1.68);
  ceremonyPlaque.scale.set(.82, .82, .82);
  ceremonyGroup.add(ceremonyPlaque);
  const BuildCurtain = () => {
    const curtain = new THREE.Group();
    const panel = Box(2.75, 3.2, .18, 0x6f1736, { roughness: .92 });
    curtain.add(panel);
    for (const foldX of [-1.05, -.52, 0, .52, 1.05]) {
      const fold = Box(.12, 3.05, .05, foldX === 0 ? 0x8a1d43 : 0x531128, { castShadow: false, roughness: .96 });
      fold.position.set(foldX, 0, .12);
      curtain.add(fold);
    }
    return curtain;
  };
  const leftCurtain = BuildCurtain();
  const rightCurtain = BuildCurtain();
  leftCurtain.position.set(stageX - 1.38, 3.55, -1.48);
  rightCurtain.position.set(stageX + 1.38, 3.55, -1.48);
  ceremonyCurtains = { left: leftCurtain, right: rightCurtain, closedLeftX: stageX - 1.38, closedRightX: stageX + 1.38 };
  ceremonyGroup.add(leftCurtain, rightCurtain);
  const valance = Box(6.25, .48, .22, 0x4f1028, { roughness: .95 });
  valance.position.set(stageX, 5.27, -1.35);
  ceremonyGroup.add(valance);
  const ribbon = Box(5.3, .1, .08, 0xffd166, { emissive: 0xffb347, emissiveIntensity: .45 });
  ribbon.position.set(stageX, 1.08, 1.22);
  ceremonyGroup.add(ribbon);
  for (let lightIndex = 0; lightIndex < 10; lightIndex += 1) {
    const footlight = new THREE.Mesh(
      new THREE.SphereGeometry(.055, 10, 7),
      new THREE.MeshStandardMaterial({ color: 0xffd166, emissive: 0xffa52f, emissiveIntensity: .9, roughness: .5 }),
    );
    footlight.position.set(stageX - 3.6 + lightIndex * .8, .28, 2.12);
    ceremonyGroup.add(footlight);
  }
  ceremonyFounder = BuildHumanActor(0x9d8cff, true);
  ceremonyFounder.position.set(-2.2, 0, .72);
  ceremonyParts = ceremonyFounder.userData.parts;
  ceremonyGroup.add(ceremonyFounder);
  for (const [index, x] of [1.55, 10.45].entries()) {
    const cameraBody = Box(.75, .52, .55, 0x171923, { metalness: .35 });
    cameraBody.position.set(x, 1.25, 1.75);
    const cameraStripe = Box(.48, .055, .58, index ? 0xff6eae : 0x66b8ff, { emissive: index ? 0xff6eae : 0x66b8ff, emissiveIntensity: .42, castShadow: false });
    cameraStripe.position.set(x, 1.42, 1.75);
    const lens = Cylinder(.18, .23, .3, 0x0a0b11, 16);
    lens.rotation.x = Math.PI / 2;
    lens.position.set(x, 1.25, 1.42);
    const flash = new THREE.PointLight(0xeaf3ff, 0, 8, 2);
    flash.position.set(x, 2.1, 2.2);
    flash.userData.phase = index * 1.7;
    ceremonySpotlights.push(flash);
    ceremonyGroup.add(cameraBody, cameraStripe, lens, flash);
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
  distantGroup.visible = visible;
  roomGroup.visible = visible;
  facilityGroup.visible = visible;
  actorGroup.visible = visible;
  collectibleGroup.visible = visible;
  hazardGroup.visible = visible;
  foregroundGroup.visible = visible;
  ceremonyGroup.visible = !visible && ["cinematic", "plaque"].includes(onboardingPhase);
}

function ShowFoundingNamePanel() {
  onboardingPhase = "naming";
  ceremonyElapsed = 0;
  dom.ceremonyIntro.classList.add("hidden");
  dom.founderProfilePanel.classList.add("hidden");
  dom.projectContract.classList.add("hidden");
  dom.skipCeremonyButton.classList.add("hidden");
  dom.ceremonyCaption.classList.add("hidden");
  dom.setupScreen.classList.add("bookMode");
  dom.foundingNamePanel.classList.remove("hidden");
  dom.foundingNamePanel.classList.add("bookEnterForward");
  window.setTimeout(() => dom.foundingNamePanel.classList.remove("bookEnterForward"), 320);
  dom.studioNameInput.focus({ preventScroll: true });
}

function FounderSkillTotal(skills = draftFounderSkills) {
  return FOUNDER_SKILL_KEYS.reduce((total, skillKey) => total + (skills[skillKey] || 0), 0);
}

function RenderFounderSkills(focusTarget = null) {
  const total = FounderSkillTotal();
  const remaining = FOUNDER_SKILL_POINTS - total;
  dom.founderSkillEditor.innerHTML = FOUNDER_SKILL_KEYS.map((skillKey) => {
    const meta = FOUNDER_SKILL_META[skillKey];
    const effect = GetFounderSkillEffect(draftFounderSkills, skillKey);
    return `<article class="founderSkillCard" style="--skillColor:${meta.color}">
      <header><strong>${meta.label}</strong></header>
      <div class="founderSkillControls">
        <button type="button" data-skill-action="decrease" data-skill-key="${skillKey}" aria-label="降低${meta.label}能力" ${effect.level <= 1 ? "disabled" : ""}>−</button>
        <div class="founderSkillLevel"><strong>${effect.level}</strong></div>
        <button type="button" data-skill-action="increase" data-skill-key="${skillKey}" aria-label="提高${meta.label}能力" ${effect.level >= 5 || remaining <= 0 ? "disabled" : ""}>＋</button>
      </div>
    </article>`;
  }).join("");
  dom.founderSkillBudget.textContent = `剩余${remaining}`;
  dom.founderSkillBudget.classList.toggle("invalid", remaining !== 0);
  dom.founderConfirmButton.disabled = remaining !== 0;
  if (focusTarget) {
    const selector = `[data-skill-action="${focusTarget.action}"][data-skill-key="${focusTarget.skillKey}"]`;
    const requestedButton = dom.founderSkillEditor.querySelector(selector);
    const focusButton = requestedButton?.disabled
      ? dom.founderSkillEditor.querySelector("button:not(:disabled)")
      : requestedButton;
    focusButton?.focus({ preventScroll: true });
  }
}

function ShowFounderProfilePanel() {
  if (onboardingPhase === "profile") return;
  onboardingPhase = "profile";
  ceremonyElapsed = 0;
  dom.projectContract.classList.add("hidden");
  RenderFounderSkills();
  const revealProfile = () => {
    dom.foundingNamePanel.classList.add("hidden");
    dom.foundingNamePanel.classList.remove("bookExitForward");
    dom.founderProfilePanel.classList.remove("hidden");
    dom.founderProfilePanel.classList.add("bookEnterForward");
    window.setTimeout(() => dom.founderProfilePanel.classList.remove("bookEnterForward"), 320);
    window.setTimeout(() => dom.founderProfileTitle.focus({ preventScroll: true }), 220);
  };
  if (dom.foundingNamePanel.classList.contains("hidden")) revealProfile();
  else {
    dom.foundingNamePanel.classList.add("bookExitForward");
    window.setTimeout(revealProfile, 190);
  }
}

function ReturnFounderProfile() {
  if (onboardingPhase !== "profile") return;
  onboardingPhase = "naming";
  dom.founderProfilePanel.classList.add("bookExitBackward");
  window.setTimeout(() => {
    dom.founderProfilePanel.classList.add("hidden");
    dom.founderProfilePanel.classList.remove("bookExitBackward");
    dom.foundingNamePanel.classList.remove("hidden");
    dom.foundingNamePanel.classList.add("bookEnterBackward");
    window.setTimeout(() => dom.foundingNamePanel.classList.remove("bookEnterBackward"), 300);
    dom.studioNameInput.focus({ preventScroll: true });
  }, 190);
}

function ShowProjectContract() {
  onboardingPhase = "contract";
  ceremonyElapsed = 0;
  dom.foundingNamePanel.classList.add("hidden");
  dom.contractStudioName.textContent = draftStudioName;
  dom.contractFounderSkills.textContent = `策 ${draftFounderSkills.design} / 程 ${draftFounderSkills.programming} / 美 ${draftFounderSkills.art}`;
  dom.contractSignatureName.textContent = draftStudioName;
  contractPageIndex = 0;
  RenderSetupChoices();
  RenderContractPage();
  dom.founderProfilePanel.classList.add("bookExitForward");
  window.setTimeout(() => {
    dom.founderProfilePanel.classList.add("hidden");
    dom.founderProfilePanel.classList.remove("bookExitForward");
    dom.projectContract.classList.remove("hidden");
    dom.projectContract.classList.add("bookEnterForward");
    window.setTimeout(() => dom.projectContract.classList.remove("bookEnterForward"), 320);
    dom.projectChoices.querySelector("[data-project-id]")?.focus({ preventScroll: true });
  }, 190);
}

function UpdateCeremony(delta, time) {
  if (!["cinematic", "plaque"].includes(onboardingPhase)) return false;
  ceremonyElapsed += delta;
  const stageX = 6;
  const founder = ceremonyFounder;
  ceremonyGroup.visible = true;
  if (onboardingPhase === "cinematic") {
    const walk = Clamp((ceremonyElapsed - .35) / 2.45, 0, 1);
    founder.position.x = -2.2 + (stageX - .55 + 2.2) * (1 - Math.pow(1 - walk, 3));
    const walkBlend = walk < 1 ? Math.min(1, walk * 4, (1 - walk) * 7) : 0;
    const walkPhase = ceremonyElapsed * 8.6;
    ApplyWalkPose(ceremonyParts, walkPhase, walkBlend);
    founder.position.y = Math.abs(Math.cos(walkPhase)) * .045 * walkBlend;
    ceremonyParts.torso.rotation.z = -.045 * walkBlend;
    ceremonyParts.head.rotation.z = .025 * walkBlend;
    founder.rotation.y = -.12;
    const open = Clamp((ceremonyElapsed - 2.75) / 1.15, 0, 1);
    ceremonyCurtains.left.position.x = ceremonyCurtains.closedLeftX - open * 2.05;
    ceremonyCurtains.right.position.x = ceremonyCurtains.closedRightX + open * 2.05;
    ceremonyPlaque.scale.setScalar(.82 + open * .18);
    const caption = ceremonyElapsed < 1.55 ? "入场"
      : ceremonyElapsed < 2.8 ? "贷款生效"
        : ceremonyElapsed < 4.25 ? "成立"
          : "命名";
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
    founder.rotation.y = 0;
    ApplyWalkPose(ceremonyParts, 0, 0);
    ceremonyParts.leftArm.rotation.z = -.12 + Math.sin(time * 1.7) * .035;
    ceremonyParts.rightArm.rotation.z = .12;
    ceremonyParts.torso.rotation.z = 0;
    ceremonyParts.head.rotation.z = Math.sin(time * 1.2) * .012;
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
    if (ceremonyElapsed > 1.85) ShowFounderProfilePanel();
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

function SpawnFootstep(x, y, facing, color = 0x77728d) {
  for (let index = 0; index < 2; index += 1) {
    const particle = FlatPanel(.09 + index * .035, .035, color, { z: .56, opacity: .42 });
    particle.position.set(x - facing * (.18 + index * .08), y + .04 + index * .025, .56);
    particle.userData.velocity = new THREE.Vector3(-facing * (.34 + index * .18), .22 + index * .12, 0);
    particle.userData.life = .34 + index * .08;
    particle.userData.maxLife = particle.userData.life;
    particle.userData.fade = true;
    fxGroup.add(particle);
    particles.push(particle);
  }
}

function ApplyWalkPose(parts, phase, blend) {
  if (!parts) return;
  const leftCycle = Math.sin(phase);
  const rightCycle = -leftCycle;
  const stride = .54 * blend;
  parts.leftLeg.rotation.z = leftCycle * stride;
  parts.rightLeg.rotation.z = rightCycle * stride;
  if (parts.leftKnee) parts.leftKnee.rotation.z = -(Math.max(0, leftCycle) * .72 + .045) * blend;
  if (parts.rightKnee) parts.rightKnee.rotation.z = -(Math.max(0, rightCycle) * .72 + .045) * blend;
  parts.leftArm.rotation.z = -leftCycle * .42 * blend;
  parts.rightArm.rotation.z = -rightCycle * .42 * blend;
  if (parts.leftElbow) parts.leftElbow.rotation.z = -(.12 + Math.max(0, -leftCycle) * .22) * blend;
  if (parts.rightElbow) parts.rightElbow.rotation.z = -(.12 + Math.max(0, -rightCycle) * .22) * blend;
}

function ApplyAirPose(parts, velocityY) {
  if (!parts) return;
  const rising = velocityY > 0;
  parts.leftLeg.rotation.z = rising ? -.22 : .12;
  parts.rightLeg.rotation.z = rising ? .32 : -.18;
  if (parts.leftKnee) parts.leftKnee.rotation.z = rising ? -.62 : -.36;
  if (parts.rightKnee) parts.rightKnee.rotation.z = rising ? -.36 : -.68;
  parts.leftArm.rotation.z = rising ? -.72 : -.38;
  parts.rightArm.rotation.z = rising ? .5 : .28;
  if (parts.leftElbow) parts.leftElbow.rotation.z = -.34;
  if (parts.rightElbow) parts.rightElbow.rotation.z = -.2;
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

function ConsumerVenueForInteraction(interaction) {
  return interaction?.consumerVenueId ? FindConsumerVenue(interaction.consumerVenueId) : null;
}

function ConsumerVenuePrompt(interaction) {
  const venue = ConsumerVenueForInteraction(interaction);
  if (!venue) return { interaction, venue: null, access: null };
  const access = GetConsumerVenueAccess(state, venue.id);
  const admission = access.ok
    ? `验资 ${FormatMoney(access.minimumCash)} ✓`
    : `🔒 需 ${FormatMoney(access.minimumCash)} · 差 ${FormatMoney(access.shortfall)}`;
  return {
    interaction: { ...interaction, detail: `${interaction.detail || venue.description} · ${admission}` },
    venue,
    access,
  };
}

function UpdateInteractionPrompt() {
  const baseInteraction = NearestInteraction(worldState);
  let nearest = baseInteraction;
  let nearestDistance = baseInteraction ? Math.hypot(worldState.x - baseInteraction.x, worldState.y - baseInteraction.y) : Infinity;
  staffActors.forEach((actor, staffId) => {
    const distance = Math.hypot(worldState.x - actor.position.x, worldState.y - actor.userData.baseY);
    if (distance < 1.15 && distance < nearestDistance) {
      const staff = FindStaff(staffId);
      nearest = { id: `staff_${staffId}`, kind: "staff", staffId, x: actor.position.x, label: staff.name, detail: "E 对话" };
      nearestDistance = distance;
    }
  });
  activeInteraction = nearest;
  const interactionAvailable = Boolean(nearest) && !IsOverlayOpen();
  const prompt = ConsumerVenuePrompt(nearest);
  UpdateMobileControlState(interactionAvailable, prompt.interaction);
  if (!interactionAvailable) {
    dom.interactionPrompt.classList.add("hidden");
    facilityVisuals.forEach((visual) => { visual.userData.marker.material.opacity = .25; });
    return;
  }
  const nearestKind = nearest.kind === "staff" ? "staff" : GetFacilityKind(nearest);
  const look = FacilityLooks[nearestKind] || [nearest.label || "交互", nearest.detail || "E", 0x9d8cff];
  dom.interactionTitle.textContent = `${prompt.access && !prompt.access.ok ? "🔒 " : ""}${nearest.label || look[0]}`;
  dom.interactionDetail.textContent = prompt.interaction?.detail || look[1];
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
  const location = FindLocation(worldState.activeLocationId) || FindLocationAt(worldState.x);
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
    const motion = playerActor.userData.motion;
    playerActor.position.x = worldState.x;
    const speed = Math.abs(worldState.vx || 0);
    const moving = speed > .12;
    const grounded = Boolean(worldState.grounded);
    const targetBlend = moving && grounded ? Clamp(speed / WorldConfig.moveSpeed, 0, 1) : 0;
    motion.blend += (targetBlend - motion.blend) * (1 - Math.exp(-delta * 11));
    motion.phase += speed * delta * 1.42;
    if (!motion.wasGrounded && grounded) motion.landing = 1;
    motion.landing = Math.max(0, motion.landing - delta * 5.8);
    const walkBob = grounded ? (1 - Math.abs(Math.cos(motion.phase))) * .075 * motion.blend : 0;
    playerActor.position.y = worldState.y + walkBob - motion.landing * .035;
    playerActor.scale.set(worldState.facing || 1, 1 - motion.landing * .075, 1);
    if (grounded) {
      ApplyWalkPose(playerParts, motion.phase, motion.blend);
      const stepIndex = Math.floor((motion.phase + Math.PI * .5) / Math.PI);
      if (motion.blend > .58 && stepIndex !== motion.stepIndex) SpawnFootstep(worldState.x, worldState.y, worldState.facing || 1);
      motion.stepIndex = stepIndex;
    } else {
      ApplyAirPose(playerParts, worldState.vy || (worldState.y - previousY) / Math.max(delta, .001));
    }
    const travelLean = moving ? -Math.sign(worldState.vx || 1) * .05 * motion.blend : Math.sin(time * 1.7) * .009;
    playerParts.torso.rotation.z = travelLean + motion.landing * .035;
    playerParts.torso.position.y = 1.35 - motion.landing * .025;
    playerParts.head.rotation.z = -travelLean * .45 + Math.sin(time * 1.15) * .006;
    playerParts.head.position.y = 2.02 - motion.landing * .018;
    playerParts.shadow.scale.x = .98 + motion.blend * .16 - (grounded ? 0 : .18);
    playerParts.shadow.scale.y = .24 - motion.blend * .025 - (grounded ? 0 : .07);
    playerParts.shadow.material.opacity = grounded ? .22 + motion.landing * .08 : .12;
    motion.wasGrounded = grounded;
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
    if (particle.userData.fade) {
      const lifeRatio = Clamp(particle.userData.life / particle.userData.maxLife, 0, 1);
      particle.material.opacity = lifeRatio * .42;
      particle.scale.x = 1 + (1 - lifeRatio) * 1.7;
      particle.userData.velocity.y += 5.2 * delta;
    }
    if (particle.userData.life <= 0) { fxGroup.remove(particle); particle.geometry.dispose(); particle.material.dispose(); particles.splice(index, 1); }
  }

  const ceremonyActive = UpdateCeremony(delta, time);
  if (!ceremonyActive) {
    const anxiety = Clamp((state.anxiety - 45) / 55, 0, 1);
    const shake = anxiety * anxiety;
    const location = FindLocation(worldState.activeLocationId) || FindLocationAt(worldState.x);
    const rawCameraX = worldState.cameraCenterX
      ?? ((worldState.cameraX ?? Math.max(0, worldState.x - WorldConfig.cameraFollowOffset)) + WorldConfig.cameraViewportWidth / 2);
    const lookAhead = Clamp((worldState.vx || 0) * .075, -.45, .45);
    const targetCameraX = rawCameraX + lookAhead;
    smoothCameraX += (targetCameraX - smoothCameraX) * (1 - Math.exp(-delta * 5.4));
    camera.position.set(smoothCameraX + Math.sin(time * 17) * shake * .1, 3.64 + Math.cos(time * 14) * shake * .06, 13.35);
    camera.lookAt(smoothCameraX, 2.98, 0);
    renderer.toneMappingExposure = 1.25 + Math.sin(time * 8) * shake * .055;
    sceneToneTarget.copy(sceneToneByLocation.get(location?.id) || sceneToneByLocation.get("home"));
    sceneToneTarget.offsetHSL(0, 0, shake * .035);
    const toneLerp = 1 - Math.exp(-delta * 2.2);
    scene.background.lerp(sceneToneTarget, toneLerp);
    scene.fog.color.lerp(sceneToneTarget, toneLerp);
    const activeVisual = locationVisuals.get(location?.id);
    if (worldAccentLight && activeVisual) {
      worldAccentLight.color.lerp(activeVisual.accent, 1 - Math.exp(-delta * 3.2));
      worldAccentLight.position.x += (((location.startX + location.endX) * .5) - worldAccentLight.position.x) * (1 - Math.exp(-delta * 2.8));
      worldAccentLight.intensity = 4.4 + Math.sin(time * 1.35) * .18;
    }
    locationVisuals.forEach((visual, id) => {
      const active = id === location?.id;
      const pulse = active ? Math.sin(time * 1.6 + visual.phase) * .04 : 0;
      visual.halo.material.opacity += (((active ? .072 : .026) + pulse * .12) - visual.halo.material.opacity) * (1 - Math.exp(-delta * 4));
      visual.ceilingBar.material.opacity += ((active ? .66 + pulse : .2) - visual.ceilingBar.material.opacity) * (1 - Math.exp(-delta * 5));
      if (visual.roomLight) visual.roomLight.intensity += ((active ? 2.45 + pulse * 2 : .72) - visual.roomLight.intensity) * (1 - Math.exp(-delta * 3.8));
    });
  }
  UpdateLocationIndicator();
  UpdateInteractionPrompt();
  renderer.render(scene, camera);
}

// Compact world interactions -------------------------------------------------

function RenderSetupChoices() {
  dom.projectChoices.innerHTML = PROJECTS.map((project) => `
    <button class="choiceCard ${project.id === selectedProjectId ? "selected" : ""}" style="--choiceColor:${project.accent}" data-project-id="${project.id}" type="button" aria-pressed="${project.id === selectedProjectId}">
      <strong>${EscapeHtml(project.genre)}</strong>
    </button>`).join("");
  dom.typeChoices.innerHTML = GAME_TYPES.map((gameType) => `
    <button class="choiceCard ${gameType.id === selectedGameTypeId ? "selected" : ""}" style="--choiceColor:${gameType.accent}" data-type-id="${gameType.id}" type="button" aria-pressed="${gameType.id === selectedGameTypeId}">
      <strong>${gameType.icon} ${EscapeHtml(gameType.name)}</strong>
    </button>`).join("");
  dom.continueButton.classList.toggle("hidden", !savedState?.project);
  UpdateContractReview();
}

function UpdateContractReview() {
  if (!dom.contractReviewStudio) return;
  const project = FindProject(selectedProjectId);
  const gameType = FindGameType(selectedGameTypeId);
  dom.contractReviewStudio.textContent = draftStudioName || "等待命名";
  dom.contractReviewFounder.textContent = `策 ${draftFounderSkills.design} / 程 ${draftFounderSkills.programming} / 美 ${draftFounderSkills.art}`;
  dom.contractReviewTheme.textContent = project?.genre || "尚未选择";
  dom.contractReviewType.textContent = gameType?.name || "尚未选择";
}

function RenderContractPage(options = {}) {
  const meta = CONTRACT_PAGE_COPY[contractPageIndex] || CONTRACT_PAGE_COPY[0];
  dom.contractPageViewport.querySelectorAll("[data-contract-page]").forEach((page) => {
    const active = Number(page.dataset.contractPage) === contractPageIndex;
    page.classList.toggle("active", active);
    page.setAttribute("aria-hidden", active ? "false" : "true");
  });
  dom.contractPageCounter.textContent = meta.counter;
  dom.contractPageHint.textContent = meta.hint;
  dom.contractNextButton.classList.toggle("hidden", contractPageIndex === CONTRACT_PAGE_COPY.length - 1);
  const nextStrong = dom.contractNextButton.querySelector("strong");
  if (nextStrong) nextStrong.textContent = meta.next;
  UpdateContractReview();
  if (options.focus) {
    const activePage = dom.contractPageViewport.querySelector("[data-contract-page].active");
    window.setTimeout(() => activePage?.querySelector("input, button")?.focus({ preventScroll: true }), 90);
  }
}

function TurnContractPage(nextIndex, direction = "forward") {
  const safeIndex = Clamp(nextIndex, 0, CONTRACT_PAGE_COPY.length - 1);
  if (safeIndex === contractPageIndex) return;
  window.clearTimeout(contractPageTimer);
  dom.projectContract.classList.remove("pageArriving", "turningForward", "turningBackward");
  dom.projectContract.classList.add(direction === "back" ? "turningBackward" : "turningForward");
  contractPageTimer = window.setTimeout(() => {
    contractPageIndex = safeIndex;
    RenderContractPage({ focus: true });
    dom.projectContract.classList.remove("turningForward", "turningBackward");
    dom.projectContract.classList.add("pageArriving");
    contractPageTimer = window.setTimeout(() => dom.projectContract.classList.remove("pageArriving"), 260);
    PlayTone("tap");
  }, 180);
}

function AdvanceContractPage() {
  TurnContractPage(contractPageIndex + 1, "forward");
}

function ReturnContractPage() {
  if (contractPageIndex > 0) return TurnContractPage(contractPageIndex - 1, "back");
  onboardingPhase = "profile";
  dom.projectContract.classList.add("bookExitBackward");
  window.setTimeout(() => {
    dom.projectContract.classList.add("hidden");
    dom.projectContract.classList.remove("bookExitBackward");
    dom.founderProfilePanel.classList.remove("hidden");
    dom.founderProfilePanel.classList.add("bookEnterBackward");
    RenderFounderSkills();
    window.setTimeout(() => dom.founderProfilePanel.classList.remove("bookEnterBackward"), 300);
    dom.founderProfileTitle.focus({ preventScroll: true });
  }, 190);
}

function GetGuidedMission(project, gameType, tensions, anxietyState) {
  if (!project) return "先完成立项，再从家里的开发电脑开始。";
  const energyLeft = Math.max(0, 3 - (state.ownerWorkCount || 0));
  if (project.age === 0 && state.ownerWorkCount === 0) {
    return "第一步：走到开发电脑前按 E，把本月 3 格精力投入游戏开发。";
  }
  if (project.age === 0 && energyLeft > 0) {
    return `本月还剩 ${energyLeft} 格精力。继续开发，先把四项基础做起来。`;
  }
  if (project.age === 0) {
    return "本月精力已经用完。关掉电脑，走到墙上月历前结算第一个月。";
  }
  if (project.age < 2) {
    return `继续开发第 ${project.age + 1} 个月；做满两个月后，电脑才会出现“提交商店”。`;
  }
  if (project.lastReleaseMonth !== state.month && !project.isReleased) {
    return "游戏已经可以提交商店。回到开发电脑，检查版本后决定是否上线。";
  }
  return tensions[0]?.title
    || project.buildStatus?.detail
    || `${gameType?.name || "开发中"} · ${project.isReleased ? `v${project.version}.0 已上线` : `开发第 ${project.age + 1} 月`} · ${anxietyState.label}`;
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
  dom.projectTitle.textContent = project?.age === 0
    ? "新手目标 · 做出第一版"
    : project?.name ? `《${project.name}》` : template?.title || "先开一家公司";
  const tensions = project ? CalculateTensions(project) : [];
  const anxietyState = GetAnxietyState(state.anxiety);
  dom.missionText.textContent = GetGuidedMission(project, gameType, tensions, anxietyState);
  dom.moduleStrip.innerHTML = MODULE_KEYS.map((moduleKey) => {
    const value = project?.modules?.[moduleKey] || 0;
    const meta = MODULE_META[moduleKey];
    return `<div class="modulePip"><span>${meta.shortLabel} ${Math.round(value)}</span><div><i style="width:${value}%;background:${meta.color}"></i></div></div>`;
  }).join("");
}

function OpenPanel(kicker, title, html, onReady = null, options = {}) {
  if (state.status !== "playing" || !state.project) return;
  const panelOptions = typeof options === "string" ? { mode: options } : options;
  dom.modalLayer.classList.toggle("computerMode", panelOptions.mode === "computer");
  dom.modalLayer.classList.toggle("whiteboardMode", panelOptions.mode === "whiteboard");
  dom.sheetKicker.textContent = kicker;
  dom.sheetTitle.textContent = title;
  dom.sheetBody.innerHTML = html;
  dom.sheetBody.scrollTop = 0;
  dom.sheetBody.onclick = null;
  dom.sheetBody.onchange = null;
  dom.modalLayer.classList.toggle("monthCloseMode", panelOptions.mode === "monthClose");
  dom.modalLayer.classList.remove("hidden");
  inputState.left = false;
  inputState.right = false;
  onReady?.();
}

function ClosePanel() {
  dom.modalLayer.classList.add("hidden");
  dom.modalLayer.classList.remove("monthCloseMode");
  dom.modalLayer.classList.remove("computerMode");
  dom.modalLayer.classList.remove("whiteboardMode");
  dom.sheetBody.onclick = null;
  dom.sheetBody.onchange = null;
}

function ResetScratchSession() {
  if (activeScratchSession?.autoFrame) cancelAnimationFrame(activeScratchSession.autoFrame);
  activeScratchSession = null;
  dom.resultLayer.classList.remove("scratchMode");
  dom.resultLayer.classList.remove("monthResultMode");
  dom.resultCloseButton.classList.remove("hidden");
  dom.resultCloseButton.disabled = false;
  dom.resultCloseButton.textContent = "继续";
}

function ShowResult(kicker, title, html, onClose = null, options = {}) {
  ResetScratchSession();
  ClosePanel();
  dom.resultKicker.textContent = kicker;
  dom.resultTitle.textContent = title;
  dom.resultBody.innerHTML = html;
  dom.resultBody.closest(".resultCard").scrollTop = 0;
  dom.resultLayer.classList.toggle("monthResultMode", options.mode === "monthResult");
  dom.resultCloseButton.textContent = options.closeLabel || "继续";
  resultCloseHandler = onClose;
  dom.resultLayer.classList.remove("hidden");
}

function CloseResult() {
  if (activeScratchSession && !activeScratchSession.revealed) {
    ShowToast("彩票已经买下了。先把银色涂层刮开。", "warning");
    PlayTone("warning");
    activeScratchSession.canvas?.focus({ preventScroll: true });
    return;
  }
  dom.resultLayer.classList.add("hidden");
  const handler = resultCloseHandler;
  resultCloseHandler = null;
  ResetScratchSession();
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
  if (options.sound !== false) PlayTone(options.tone === "warning" ? "warning" : "good");
  if (state.status !== "playing" && !options.deferEnding) RenderEnding();
  return true;
}

function RenderBar(label, value, color = "#9d8cff") {
  return `<div class="barRow"><span>${EscapeHtml(label)}</span><div><i style="width:${Clamp(value, 0, 100)}%;--barColor:${color}"></i></div><b>${Math.round(value)}</b></div>`;
}

function RenderLog(limit = 5) {
  const lines = [...(state.log || [])].slice(0, limit);
  return lines.length ? `<div class="logList">${lines.map((line) => `
    <div class="logLine"><b>M${String(line.month || state.month).padStart(2, "0")}</b><span>${EscapeHtml(line.text || line.message || String(line))}</span></div>`).join("")}</div>` : `<div class="note">暂无记录。</div>`;
}

function OpenFoodSheet(planId, placeName) {
  const plan = FindFoodPlan(planId);
  if (!plan) return;
  const options = planId === "leftovers" ? [plan, FindFoodPlan("skip")] : [plan];
  OpenPanel("FOOD IS PRODUCTION", placeName, `
    <div class="worldGrid">${options.map((food) => `
      <button class="worldChoice ${state.foodPlan === food.id ? "selected" : ""}" data-food-id="${food.id}" type="button">
        <div class="choiceTop"><strong>${food.icon} ${EscapeHtml(food.name)}</strong><span>${FormatMoney(food.monthlyCost)}/月</span></div>
        <div class="choiceFooter"><span>饥饿 ${food.hungerDelta >= 0 ? "+" : ""}${food.hungerDelta} · 焦虑 ${food.anxietyDelta >= 0 ? "+" : ""}${food.anxietyDelta}</span><b>产出 ×${food.outputMultiplier}</b></div>
      </button>`).join("")}</div>
    <div class="noteList"><div class="note ${planId === "feast" ? "good" : ""}">当前：${EscapeHtml(FindFoodPlan(state.foodPlan)?.name || "未知")}</div></div>`, () => {
    dom.sheetBody.onclick = (event) => {
      const button = event.target.closest("[data-food-id]");
      if (!button) return;
      if (ApplyInteractiveResult(SelectFoodPlan(state, button.dataset.foodId))) OpenFoodSheet(planId, placeName);
    };
  });
}

function OpenRelaxationSheet(venueId) {
  const venue = FindConsumerVenue(venueId);
  if (!venue || venue.category !== "relaxation") return;
  const access = GetConsumerVenueAccess(state, venue.id);
  const usedThisMonth = state.lastRelaxationMonth === state.month;
  const ladder = CONSUMER_VENUES.filter((candidate) => candidate.category === "relaxation");
  const actionLabel = usedThisMonth
    ? "本月已经放松过"
    : !access.ok
      ? `还差 ${FormatMoney(access.shortfall)}`
      : state.cash < venue.cost
        ? "付不起本次消费"
        : `消费 ${FormatMoney(venue.cost)}`;
  OpenPanel("ANXIETY RELIEF", venue.name, `
    <div class="resultHero"><b>−${venue.anxietyRelief}</b><p>当前焦虑 ${Math.round(state.anxiety)} / 100</p></div>
    <div class="metricGrid">
      <div class="metricTile"><span>准入资金</span><strong>${FormatMoney(venue.minimumCash)}</strong></div>
      <div class="metricTile"><span>本次消费</span><strong>${FormatMoney(venue.cost)}</strong></div>
      <div class="metricTile"><span>焦虑缓解</span><strong>−${venue.anxietyRelief}</strong></div>
    </div>
    <div class="panelSection"><h3>足浴解压线</h3><div class="worldGrid three">${ladder.map((candidate) => {
      const candidateAccess = GetConsumerVenueAccess(state, candidate.id);
      return `<div class="worldChoice ${candidate.id === venue.id ? "selected" : ""} ${candidateAccess.ok ? "" : "locked"}">
        <div class="choiceTop"><strong>${candidateAccess.ok ? "✓" : "🔒"} ${EscapeHtml(candidate.name)}</strong><span>${FormatMoney(candidate.minimumCash)} 准入</span></div>
        <div class="choiceFooter"><span>${FormatMoney(candidate.cost)} / 次</span><b>焦虑 −${candidate.anxietyRelief}</b></div>
      </div>`;
    }).join("")}</div></div>
    <div class="panelSection choiceFooter"><span>每月 1 次；验资不扣钱。</span><button class="primaryButton" data-relax-venue="${venue.id}" type="button" ${usedThisMonth || !access.ok || state.cash < venue.cost ? "disabled" : ""}>${actionLabel}</button></div>`, () => {
    dom.sheetBody.onclick = (event) => {
      const button = event.target.closest("[data-relax-venue]");
      if (!button) return;
      const result = VisitRelaxationVenue(state, button.dataset.relaxVenue);
      if (!ApplyInteractiveResult(result, { toast: false, tone: "good" })) return;
      ShowResult("ANXIETY RELIEF", venue.name, `
        <div class="resultHero"><b>${Math.round(result.anxietyBefore)} → ${Math.round(result.anxietyAfter)}</b><p>现金 −${FormatMoney(result.cost)} · 焦虑 −${result.relieved}</p></div>`);
    };
  });
}

function OpenInvestmentSheet(staffId) {
  const member = state.team.find((item) => item.id === staffId);
  const staff = FindStaff(staffId);
  if (!member || !staff) return OpenTalentSheet();
  const plans = staff.kind === "ai" ? AI_SUBSCRIPTION_LEVELS : STUDENT_PAY_LEVELS;
  OpenPanel("PAY / RENT", `${staff.name}：${staff.kind === "ai" ? "月租档位" : "工资档位"}`, `
    <div class="panelSection worldGrid three">${plans.map((plan) => {
      const previewMember = { ...member, investmentLevel: plan.level };
      return `<button class="worldChoice ${member.investmentLevel === plan.level ? "selected" : ""}" data-level="${plan.level}" type="button">
        <div class="choiceTop"><strong>${EscapeHtml(plan.name)}</strong><span>${FormatMoney(GetMemberMonthlyCost(previewMember))}/月</span></div>
        <div class="choiceFooter"><span>产出 ×${plan.outputMultiplier}</span><b>质量 +${Math.round(plan.qualityBonus * 100)}%</b></div>
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
  OpenPanel("设备", "工位", `
    <p class="panelIntro">每人 1 工位</p>
    <div class="metricGrid">
      <div class="metricTile"><span>已购工位</span><strong>${count}/4</strong></div>
      <div class="metricTile"><span>已被占用</span><strong>${state.team.length}</strong></div>
      <div class="metricTile"><span>空工位</span><strong>${freeSeats}</strong></div>
    </div>
    <div class="workstationPreview">${WORKSTATION_COSTS.map((cost, index) => `<div class="${index < count ? "owned" : index === count ? "next" : ""}"><span>${index < count ? "✓" : index + 1}</span><strong>工位 ${index + 1}</strong><small>${index < count ? "已购" : FormatMoney(cost)}</small></div>`).join("")}</div>
    <div class="panelSection choiceFooter"><span>${nextCost ? FormatMoney(nextCost) : "已满"}</span><button class="primaryButton" data-buy-workstation type="button" ${!nextCost || state.cash < nextCost ? "disabled" : ""}>${nextCost ? "购买" : "已满"}</button></div>`, () => {
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
      <p>${EscapeHtml(staff.tagline)}</p>
      <div class="chipRow"><span class="chip">${EscapeHtml(MODULE_META[staff.specialty].label)}</span><span class="chip">${EscapeHtml(staff.quirk)}</span><span class="chip">${FormatMoney(hired ? GetMemberMonthlyCost(member) : staff.monthlyCost)}/月</span></div>
      <div class="choiceFooter" style="margin-top:9px"><span>${hired ? "已占用" : state.team.length < state.workstations ? "下月起收费" : "无工位"}</span><span>${hired
        ? `<button class="miniButton" data-staff-action="talk" data-staff-id="${staff.id}" type="button">聊聊</button> <button class="miniButton" data-staff-action="pay" data-staff-id="${staff.id}" type="button">调待遇</button> <button class="dangerButton" data-staff-action="fire" data-staff-id="${staff.id}" type="button">${staff.kind === "ai" ? "退订" : "开除"}</button>`
        : `<button class="miniButton" data-staff-action="hire" data-staff-id="${staff.id}" type="button" ${state.team.length >= state.workstations ? "disabled" : ""}>${staff.kind === "ai" ? "开始月租" : "雇佣"}</button>`}</span></div>
    </article>`;
  };
  OpenPanel("人才", `${state.team.length}/${state.workstations || 0} 工位`, `
    <p class="panelIntro">人力 ${FormatMoney(costs.studentWages + costs.aiRent)}/月${state.workstations ? "" : " · 先买工位"}</p>
    <div class="choiceFooter"><span>每人 1 工位</span><button class="miniButton" data-equipment type="button">设备</button></div>
    <div class="sectionHeading"><strong>大学生</strong><span>工资</span></div>
    <div class="worldGrid">${STAFF_CATALOG.filter((staff) => staff.kind === "student").map(RenderStaffCard).join("")}</div>
    <div class="panelSection sectionHeading"><strong>AI</strong><span>月租</span></div>
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
  OpenPanel("对话", staff.name, `
    <p class="speechLine">“${EscapeHtml(spokenLine || GetIdleLine(state, staffId))}”</p>
    <div class="panelSection">${staff.kind === "student" ? `${RenderBar("士气", member.morale, "#68e0a0")}${RenderBar("压力", member.stress, "#ff626e")}` : `${RenderBar("漂移", member.drift, "#ff626e")}${RenderBar("本月加速", member.boost, "#66b8ff")}`}</div>
    <div class="talkGrid">
      <button data-tone="pressure" type="button">催死线<br><small>快 · 压力+</small></button>
      <button data-tone="encourage" type="button">说人话<br><small>压力−</small></button>
      <button data-tone="roast" type="button">互喷<br><small>微增</small></button>
      <button data-tone="sync" type="button">联调<br><small>减债</small></button>
    </div>
    <div class="panelSection choiceFooter"><span>本月还可有效对话 ${state.talkPoints} 次 · ${staff.kind === "student" ? `压力 ${Math.round(pressureValue)}` : `上下文漂移 ${Math.round(pressureValue)}`}</span><small>项目方向与玩法提案统一在墙上白板处理</small></div>`, () => {
    dom.sheetBody.onclick = (event) => {
      const button = event.target.closest("[data-tone]");
      if (!button) return;
      const result = TalkToStaff(state, staffId, button.dataset.tone);
      if (ApplyInteractiveResult(result)) OpenStaffSheet(staffId, result.line);
    };
  });
}

function OpenCustomizationSheet(sourceId = "owner") {
  if (!state.project || state.project.age < 1) {
    ShowToast("先完成第一个开发月；有东西可改后，项目白板才会开放玩法提案。", "warning");
    return OpenDirectiveSheet();
  }
  const staff = sourceId === "owner" ? null : FindStaff(sourceId);
  const sourceLabel = staff ? staff.name : "你自己";
  const usedIds = new Set(state.project.features.map((item) => item.id));
  OpenPanel("PROJECT WHITEBOARD", `${sourceLabel} 的玩法提案`, `
    <div class="projectWhiteboardScene">
      <div class="whiteboardBoardMeta" aria-hidden="true"><span>M${String(state.month).padStart(2, "0")}</span><i></i><i></i><i></i></div>
      <p class="panelIntro">选一个提案写进需求。</p>
      <div class="choiceFooter"><span>本月拍板 ${state.talkPoints} 次</span><b>玩法 ${state.project.features.length}/6</b></div>
      <div class="panelSection worldGrid whiteboardNoteGrid">${FEATURE_CHOICES.map((feature) => `
        <button class="featureCard" data-feature-id="${feature.id}" type="button" ${usedIds.has(feature.id) ? "disabled" : ""}>
          <div class="choiceTop"><strong>${EscapeHtml(feature.title)}</strong><span>热度 +${feature.hype}</span></div>
          <div class="chipRow">${MODULE_KEYS.filter((key) => feature.modules[key]).map((key) => `<span class="chip">${MODULE_META[key].label} ${feature.modules[key] > 0 ? "+" : ""}${feature.modules[key]}</span>`).join("")}</div>
        </button>`).join("")}</div>
      <div class="panelSection"><button class="miniButton" data-source-select type="button">← 换人</button></div>
      <div class="whiteboardMarkerSet" aria-hidden="true"><i></i><i></i><i></i><b></b></div>
    </div>`, () => {
    dom.sheetBody.onclick = (event) => {
      if (event.target.closest("[data-source-select]")) return OpenFeatureSourceSheet();
      const button = event.target.closest("[data-feature-id]");
      if (!button) return;
      const result = CustomizeProject(state, sourceId, button.dataset.featureId);
      if (!ApplyInteractiveResult(result, { tone: sourceId === "owner" ? "warning" : "good" })) return;
      ShowResult("FEATURE LOCKED", result.feature.title, `
        <div class="resultHero"><b>${sourceId === "owner" ? "我" : "TA"}</b><p>${EscapeHtml(result.consequence)}</p></div>
        <div class="noteList"><div class="note">${EscapeHtml(result.feature.pitch)}</div></div>`, () => {
        if (state.status !== "playing") RenderEnding();
      });
    };
  }, { mode: "whiteboard" });
}

function OpenFeatureSourceSheet() {
  if (!state.project || state.project.age < 1) return OpenDirectiveSheet();
  const hired = state.team.map((member) => FindStaff(member.id)).filter(Boolean);
  OpenPanel("PROJECT WHITEBOARD", "墙上白板 · 选择提案人", `
    <div class="projectWhiteboardScene">
      <div class="whiteboardBoardMeta" aria-hidden="true"><span>M${String(state.month).padStart(2, "0")}</span><i></i><i></i><i></i></div>
      <p class="speechLine">本月还能拍板 ${state.talkPoints} 次。</p>
      <div class="sectionHeading panelSection"><strong>谁提玩法？</strong></div>
      <div class="worldGrid three whiteboardNoteGrid">
        <button class="worldChoice danger" data-source-id="owner" type="button"><div class="choiceTop"><strong>老板亲自做</strong><span>饥饿 +10 · 焦虑 +7</span></div></button>
        ${hired.map((staff) => `<button class="worldChoice" data-source-id="${staff.id}" type="button"><div class="choiceTop"><strong>${EscapeHtml(staff.name)}</strong><span>${staff.kind === "ai" ? "AI" : "大学生"}</span></div></button>`).join("")}
      </div>
      <div class="panelSection sectionHeading"><strong>团队</strong></div>
      <div class="chipRow">${hired.length ? hired.map((staff) => `<button class="miniButton" data-chat-id="${staff.id}" type="button">和 ${EscapeHtml(staff.name)} 聊聊</button>`).join("") : `<span class="chip">还没有成员。去人才市场招聘。</span>`}</div>
      <div class="whiteboardMarkerSet" aria-hidden="true"><i></i><i></i><i></i><b></b></div>
    </div>`, () => {
    dom.sheetBody.onclick = (event) => {
      const chat = event.target.closest("[data-chat-id]");
      if (chat) return OpenStaffSheet(chat.dataset.chatId);
      const source = event.target.closest("[data-source-id]");
      if (source) OpenCustomizationSheet(source.dataset.sourceId);
    };
  }, { mode: "whiteboard" });
}

function OpenHomeComputerSheet() {
  const evaluation = EvaluateProject(state);
  const energyUsed = Clamp(state.ownerWorkCount || 0, 0, 3);
  const energyLeft = 3 - energyUsed;
  const moduleValues = MODULE_KEYS.map((moduleKey) => ({ moduleKey, value: state.project.modules[moduleKey] || 0 }));
  const recommended = [...moduleValues].sort((left, right) => left.value - right.value)[0]?.moduleKey;
  const averageProgress = moduleValues.reduce((sum, item) => sum + item.value, 0) / moduleValues.length;
  const canRelease = state.project.age >= 2 && state.project.lastReleaseMonth !== state.month;
  const objectiveTitle = energyLeft > 0
    ? state.project.age === 0 ? "先做出能运行的第一版" : "把本月精力投进最薄弱的部分"
    : "本月精力已经用完";
  const objectiveDetail = energyLeft > 0
    ? `还剩 ${energyLeft} 格。每点一次开发，就会投入 1 格精力并立刻推进对应模块。`
    : "关掉电脑，走到墙上月历前核对账单并进入下个月。";
  OpenPanel("DEVELOPMENT DESK", `开发电脑 · 《${EscapeHtml(state.project.name)}》`, `
    <div class="computerDeskScene">
      <div class="computerDeskMat" aria-hidden="true"></div>
      <div class="computerMonitorShell">
        <div class="computerTopVent" aria-hidden="true">${Array.from({ length: 11 }, () => "<i></i>").join("")}</div>
        <div class="computerBezel"><span>STUDIO OS</span><i></i><b>M${String(state.month).padStart(2, "0")}</b></div>
        <div class="computerGlassFrame">
          <div class="computerScreenContent">
            <section class="computerObjective">
              <div><span>现在要做什么</span><h3>${objectiveTitle}</h3><p>${objectiveDetail}</p></div>
              <div class="energyBudget" aria-label="本月精力剩余 ${energyLeft} 格">
                <span>本月精力</span>
                <div>${[0, 1, 2].map((slot) => `<i class="${slot < energyLeft ? "available" : "spent"}">${slot < energyLeft ? "●" : "×"}</i>`).join("")}</div>
                <strong>${energyLeft} / 3</strong>
              </div>
            </section>

            <section class="developmentWorkbench">
              <header><div><span>本月投入</span><strong>${energyLeft > 0 ? "下一格精力投到哪里？" : "四项开发进度"}</strong></div><b>总体 ${Math.round(averageProgress)}%</b></header>
              <div class="energyModuleGrid">
                ${moduleValues.map(({ moduleKey, value }) => {
                  const meta = MODULE_META[moduleKey];
                  const isRecommended = moduleKey === recommended && energyLeft > 0;
                  return `<button class="energyModule ${isRecommended ? "recommended" : ""}" style="--moduleColor:${meta.color}" data-energy-module="${moduleKey}" type="button" ${energyLeft <= 0 ? "disabled" : ""}>
                    <div class="energyModuleTop"><span>${meta.icon}</span><strong>${meta.label}</strong>${isRecommended ? "<b>建议优先</b>" : ""}</div>
                    <div class="moduleProgress"><i style="width:${Clamp(value, 0, 100)}%"></i></div>
                    <footer><span>${Math.round(value)} / 100</span><strong>${energyLeft > 0 ? "投入 1 格" : "等待下月"}</strong></footer>
                  </button>`;
                }).join("")}
              </div>
              <p class="workCostNote">老板亲自开发每次获得 2–4 点进度，同时增加饥饿、焦虑和少量债务。四项差距太大时，成品会互相拖累。</p>
            </section>

            ${canRelease ? `<section class="computerReleaseCallout"><div><span>${state.project.isReleased ? "新版本可以提交" : "已达到商店提交条件"}</span><strong>${state.project.isReleased ? `v${state.project.version + 1}.0` : "首发版本"} · 预估 ${evaluation.rating.toFixed(1)} 分</strong></div><button data-computer-release type="button">${state.project.isReleased ? "检查并发布更新" : "检查并提交商店"} →</button></section>` : ""}

            <div class="computerLocationHint"><b>这台电脑只负责开发${canRelease ? "与发布" : ""}</b><span>项目方向在墙上白板；宣发用桌边手机；招聘必须出门去人才市场；月结在墙上月历。</span></div>
          </div>
        </div>
        <div class="computerControlDeck" aria-hidden="true">
          <strong>甲方 486DX</strong>
          <span class="computerSpeaker">${Array.from({ length: 9 }, () => "<i></i>").join("")}</span>
          <span class="computerTurbo"><i></i>TURBO</span>
          <div class="computerPower"><i></i><span>POWER</span></div>
        </div>
      </div>
      <div class="computerStand"><i></i></div>
      <div class="computerTowerVisual" aria-hidden="true"><strong>甲方 486</strong><i class="towerOpticalDrive"></i><i class="towerFloppyDrive"></i><span class="towerVent"></span><b class="towerPower"><i></i></b></div>
      <div class="computerKeyboardVisual" aria-hidden="true">${Array.from({ length: 50 }, (_, index) => `<i class="${index === 43 ? "space" : [13, 27, 41].includes(index) ? "wide" : ""}"></i>`).join("")}</div>
      <div class="computerMouseVisual" aria-hidden="true"><i></i></div>
      <div class="computerCableVisual" aria-hidden="true"></div>
    </div>`, () => {
    dom.sheetBody.onclick = (event) => {
      if (event.target.closest("[data-computer-release]")) return OpenReleaseSheet();
      const button = event.target.closest("[data-energy-module]");
      if (!button) return;
      const moduleKey = button.dataset.energyModule;
      const result = PerformOwnerTask(state, moduleKey);
      if (!ApplyInteractiveResult(result, { tone: "warning", toast: false })) return;
      const left = Math.max(0, 3 - state.ownerWorkCount);
      ShowToast(left > 0
        ? `已把 1 格精力投入${MODULE_META[moduleKey].label}，本月还剩 ${left} 格。`
        : "本月 3 格精力已经用完。下一步：去墙上月历结算。", left > 0 ? "good" : "warning");
      OpenHomeComputerSheet();
    };
  }, { mode: "computer" });
}

function OpenWorkstationSheet(interaction) {
  const moduleKey = interaction.moduleKey;
  const meta = MODULE_META[moduleKey];
  const skillEffect = GetFounderSkillEffect(state.founderSkills, moduleKey);
  const skillMeta = FOUNDER_SKILL_META[skillEffect.skillKey];
  const workers = state.team.map((member) => ({ member, staff: FindStaff(member.id) })).filter((item) => item.staff?.specialty === moduleKey);
  const relatedTensions = CalculateTensions(state.project).filter((tension) => tension.from === moduleKey || tension.to === moduleKey);
  OpenPanel("开发", `${meta.icon} ${meta.label}`, `
    <p class="panelIntro">${skillMeta.label} ${skillEffect.level} · +${skillEffect.minimumGain}–${skillEffect.maximumGain}</p>
    ${RenderBar(`${meta.label}进度`, state.project.modules[moduleKey], meta.color)}
    <div class="metricGrid">
      <div class="metricTile"><span>已用精力</span><strong>${state.ownerWorkCount}/3</strong></div>
      <div class="metricTile"><span>能力</span><strong style="color:${skillMeta.color}">${skillMeta.label} ${skillEffect.level}</strong></div>
      <div class="metricTile"><span>技术债 · 范围债</span><strong>${Math.round(state.project.technicalDebt)} / ${Math.round(state.project.scopeDebt)}</strong></div>
    </div>
    <div class="panelSection choiceFooter"><span>本月 ${state.ownerWorkCount}/3</span><button class="primaryButton" data-owner-work type="button" ${state.ownerWorkCount >= 3 ? "disabled" : ""}>亲自开发</button></div>
    <div class="panelSection sectionHeading"><strong>擅长这个模块的成员</strong><span>${workers.length ? "在家里的额外工位上，月结时产出" : "目前只有老板的背影"}</span></div>
    <div class="chipRow">${workers.length ? workers.map(({ staff }) => `<button class="miniButton" data-worker-id="${staff.id}" type="button">跟 ${EscapeHtml(staff.name)} 聊</button>`).join("") : `<span class="chip">没有人手。关掉电脑，从门口出发去人才市场招聘。</span>`}</div>
    ${relatedTensions.length ? `<div class="noteList">${relatedTensions.map((tension) => `<div class="note ${tension.severity === "critical" ? "danger" : ""}"><b>${EscapeHtml(tension.title)}</b><br>${EscapeHtml(tension.description)}</div>`).join("")}</div>` : `<div class="noteList"><div class="note good">当前没有明显跨模块互殴，像暴风雨前的 stand-up。</div></div>`}`, () => {
    dom.sheetBody.onclick = (event) => {
      const worker = event.target.closest("[data-worker-id]");
      if (worker) return OpenStaffSheet(worker.dataset.workerId);
      if (!event.target.closest("[data-owner-work]")) return;
      const result = PerformOwnerTask(state, moduleKey);
      if (ApplyInteractiveResult(result, { tone: "warning" })) OpenWorkstationSheet(interaction);
    };
  }, { mode: "computer" });
}

function OpenBankSheet() {
  const costs = ForecastMonthlyCosts(state);
  const activeLoans = state.loans.filter((loan) => loan.status === "active");
  const startupLoan = state.startupLoan;
  const stockAccess = GetStockAccountAccess(state);
  const stockOption = STOCK_OPTIONS.find((option) => option.id === state.stockPosition?.optionId);
  const monthsLeft = startupLoan?.status === "active" ? Math.max(0, startupLoan.dueMonth - state.month + 1) : 0;
  OpenPanel("贷款", "银行", `
    <p class="panelIntro">到期清零 · 抵押电脑即结束</p>
    <section class="startupLoanCard ${startupLoan?.status || "pending"}">
      <div><span>启动贷 · 身家担保</span><strong>${startupLoan?.status === "repaid" ? "已清" : `欠 ${FormatMoney(startupLoan?.remaining || 0)}`}</strong><small>${startupLoan?.status === "active" ? `M${String(startupLoan.dueMonth).padStart(2, "0")} · 剩 ${monthsLeft} 月` : startupLoan?.status === "repaid" ? "已还清" : "未生效"}</small></div>
      <div class="loanDeadline"><b>${startupLoan?.status === "repaid" ? "✓" : `M${String(startupLoan?.dueMonth || 0).padStart(2, "0")}`}</b></div>
    </section>
    ${startupLoan?.status === "active" ? `<div class="loanPaymentRow"><button data-startup-payment="10000" type="button" ${state.cash < 10000 ? "disabled" : ""}>先还 ¥10,000</button><button data-startup-payment="30000" type="button" ${state.cash < 30000 ? "disabled" : ""}>先还 ¥30,000</button><button data-startup-payment="full" type="button" ${state.cash < startupLoan.remaining ? "disabled" : ""}>一次结清 ${FormatMoney(startupLoan.remaining)}</button></div>` : ""}
    <div class="panelSection sectionHeading"><strong>证券柜台</strong><span>股票只在银行办理</span></div>
    <div class="worldGrid singleChoiceGrid">
      <button class="worldChoice ${state.stockPosition ? "selected" : ""}" data-open-stock type="button" ${stockAccess.unlocked ? "" : "disabled"}>
        <div class="choiceTop"><strong>↗ ${state.stockPosition ? `${EscapeHtml(stockOption?.symbol || "股票")} 持仓中` : "股票账户"}</strong><span>${state.stockPosition ? `本金 ${FormatMoney(state.stockPosition.stake)}` : stockAccess.permanentlyUnlocked ? "已开户" : stockAccess.unlocked ? "可以开户" : `现金满 ${FormatMoney(STOCK_ACCOUNT_UNLOCK_CASH)} 开放`}</span></div>
        <p>${state.stockPosition ? `M${String(state.stockPosition.openedMonth + 1).padStart(2, "0")} 收盘结算` : "选择股票与金额；次月显示走势和盈亏。不计入游戏收入。"}</p>
      </button>
    </div>
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
    <div class="panelSection sectionHeading"><strong>抵押贷</strong><span>${activeLoans.length} 笔</span></div>
    <div class="noteList">${activeLoans.length ? activeLoans.map((loan) => { const asset = FindCollateral(loan.collateralId); return `<div class="note">${EscapeHtml(asset.name)} · ${loan.remaining} 期 · ${FormatMoney(loan.monthlyPayment)}/月</div>`; }).join("") : `<div class="note good">无</div>`}</div>`, () => {
    dom.sheetBody.onclick = (event) => {
      if (event.target.closest("[data-open-stock]")) return OpenStockSheet();
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
      if (asset?.fatal && !window.confirm("抵押电脑 = 结束本局。确定？")) return;
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

function DrawScratchCoating(context, width, height) {
  context.save();
  const metal = context.createLinearGradient(0, 0, width, height);
  metal.addColorStop(0, "#777d80");
  metal.addColorStop(.16, "#e8e9e7");
  metal.addColorStop(.34, "#969da0");
  metal.addColorStop(.52, "#f7f5ef");
  metal.addColorStop(.7, "#858b8f");
  metal.addColorStop(.88, "#d9dcda");
  metal.addColorStop(1, "#6e7478");
  context.fillStyle = metal;
  context.fillRect(0, 0, width, height);

  context.globalAlpha = .2;
  for (let x = -height; x < width + height; x += 13) {
    context.fillStyle = x % 26 ? "#ffffff" : "#3d4245";
    context.beginPath();
    context.moveTo(x, 0);
    context.lineTo(x + height, height);
    context.lineTo(x + height + 3, height);
    context.lineTo(x + 3, 0);
    context.closePath();
    context.fill();
  }

  context.globalAlpha = .32;
  for (let index = 0; index < 260; index += 1) {
    const x = ((index * 73) % 257) / 257 * width;
    const y = ((index * 41 + index * index * 3) % 211) / 211 * height;
    const radius = .45 + (index % 4) * .22;
    context.fillStyle = index % 3 ? "#ffffff" : "#363b3e";
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  const titleSize = Clamp(Math.round(height * .19), 18, 30);
  context.globalAlpha = .74;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `900 ${titleSize}px "Microsoft YaHei UI", sans-serif`;
  context.lineWidth = 1.5;
  context.strokeStyle = "rgba(255,255,255,.68)";
  context.fillStyle = "rgba(53,58,61,.72)";
  context.strokeText("刮 开 兑 奖", width / 2 + 1, height * .47 + 1);
  context.fillText("刮 开 兑 奖", width / 2, height * .47);

  context.font = `800 ${Clamp(Math.round(height * .075), 9, 13)}px "Microsoft YaHei UI", sans-serif`;
  context.letterSpacing = "2px";
  context.fillStyle = "rgba(45,50,53,.74)";
  context.fillText("用硬币来回刮开银色涂层", width / 2, height * .7);

  context.globalAlpha = .42;
  context.font = `900 ${Clamp(Math.round(height * .12), 13, 20)}px Georgia, serif`;
  context.fillStyle = "#ffffff";
  for (let x = 24; x < width; x += 68) context.fillText("¥", x, height * .18);
  for (let x = 52; x < width; x += 68) context.fillText("¥", x, height * .86);
  context.restore();
}

function ScratchPointerPosition(session, event) {
  const rect = session.canvas.getBoundingClientRect();
  return {
    x: Clamp((event.clientX - rect.left) / Math.max(1, rect.width) * session.width, 0, session.width),
    y: Clamp((event.clientY - rect.top) / Math.max(1, rect.height) * session.height, 0, session.height),
  };
}

function UpdateScratchCoin(session, point, active = true) {
  if (!session.coin) return;
  session.coinTurn = (session.coinTurn || 0) + 11;
  session.coin.style.left = `${point.x / session.width * 100}%`;
  session.coin.style.top = `${point.y / session.height * 100}%`;
  session.coin.style.setProperty("--coinTurn", `${session.coinTurn}deg`);
  session.coin.classList.toggle("active", active);
}

function SpawnScratchDust(session, point) {
  if (!session.window || session.dustCount > 30) return;
  session.dustCount += 1;
  const dust = document.createElement("i");
  dust.className = "scratchDust";
  dust.style.left = `${point.x / session.width * 100}%`;
  dust.style.top = `${point.y / session.height * 100}%`;
  dust.style.setProperty("--dustX", `${(Math.random() - .5) * 34}px`);
  dust.style.setProperty("--dustY", `${9 + Math.random() * 22}px`);
  dust.style.setProperty("--dustSpin", `${(Math.random() - .5) * 260}deg`);
  session.window.append(dust);
  window.setTimeout(() => {
    dust.remove();
    session.dustCount = Math.max(0, session.dustCount - 1);
  }, 620);
}

function MeasureScratchCoverage(session, force = false) {
  if (!session.context || session.revealed) return;
  const now = performance.now();
  if (!force && now - session.lastMeasureAt < 90) return;
  session.lastMeasureAt = now;
  const { width, height } = session.canvas;
  const pixels = session.context.getImageData(0, 0, width, height).data;
  const step = Math.max(6, Math.floor(session.pixelRatio * 6));
  let cleared = 0;
  let sampled = 0;
  for (let y = Math.floor(step / 2); y < height; y += step) {
    for (let x = Math.floor(step / 2); x < width; x += step) {
      sampled += 1;
      if (pixels[(y * width + x) * 4 + 3] < 72) cleared += 1;
    }
  }
  session.coverage = sampled ? cleared / sampled : 0;
  const percent = Math.min(100, Math.round(session.coverage * 100));
  session.progressBar.style.width = `${percent}%`;
  session.progressText.textContent = percent < 12
    ? "先刮出第一道痕迹"
    : percent < 40 ? `已刮开 ${percent}% · 再来几下` : "正在核对兑奖区……";
  session.canvas.setAttribute("aria-valuenow", String(percent));
  if (session.coverage >= .4) RevealScratchTicket(session);
}

function EraseScratchSegment(session, from, to, options = {}) {
  if (!session.context || session.revealed) return;
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  session.context.save();
  session.context.globalCompositeOperation = "destination-out";
  session.context.lineCap = "round";
  session.context.lineJoin = "round";
  session.context.lineWidth = session.brushSize;
  session.context.beginPath();
  session.context.moveTo(from.x, from.y);
  session.context.lineTo(to.x, to.y);
  session.context.stroke();
  session.context.beginPath();
  session.context.arc(to.x, to.y, session.brushSize * .47, 0, Math.PI * 2);
  session.context.fill();
  session.context.restore();

  UpdateScratchCoin(session, to, true);
  session.dustTravel += distance;
  if (session.dustTravel > 11) {
    session.dustTravel = 0;
    SpawnScratchDust(session, to);
  }
  if (distance > 1 || options.forceSound) PlayScratchNoise(Clamp(distance / 18, .25, 1));
  MeasureScratchCoverage(session, Boolean(options.forceMeasure));
}

function PlayScratchReveal(result) {
  if (result.profit > 0) {
    PlayTone("coin");
    window.setTimeout(() => PlayTone("good"), 115);
    window.setTimeout(() => PlayTone("coin"), 245);
    navigator.vibrate?.([18, 32, 45]);
  } else if (result.profit === 0) {
    PlayTone("coin");
    window.setTimeout(() => PlayTone("tap"), 130);
    navigator.vibrate?.(20);
  } else {
    PlayTone("warning");
    navigator.vibrate?.([24, 42, 24]);
  }
}

function RevealScratchTicket(session) {
  if (!session || session.revealed) return;
  session.revealed = true;
  session.pointerId = null;
  if (session.autoFrame) cancelAnimationFrame(session.autoFrame);
  session.autoFrame = 0;
  session.canvas.classList.add("cleared");
  session.coin?.classList.remove("active");
  session.ticket.classList.add("revealed");
  session.ticket.classList.add(session.result.profit > 0 ? "winner" : session.result.profit === 0 ? "breakEven" : "loser");
  session.progressBar.style.width = "100%";
  session.progressText.textContent = "兑奖区已完全揭开";
  session.status.textContent = `${session.result.outcome.label}，返还 ${FormatMoney(session.result.payout)}`;
  dom.resultKicker.textContent = session.result.profit > 0 ? "SCRATCH WIN" : session.result.profit === 0 ? "MONEY BACK" : "SCRATCH RESULT";
  dom.resultTitle.textContent = session.result.outcome.label;
  dom.resultCloseButton.disabled = false;
  dom.resultCloseButton.textContent = "继续";
  PlayScratchReveal(session.result);
  window.setTimeout(() => dom.resultCloseButton.focus({ preventScroll: true }), 720);
}

function StartAutoScratch(session) {
  if (!session || session.revealed || session.autoFrame) return;
  session.progressText.textContent = "硬币正在一行一行刮开……";
  const startedAt = performance.now();
  const duration = 1450;
  const rows = 6;
  let previousPoint = null;
  let previousRow = -1;
  const Tick = (now) => {
    if (!activeScratchSession || activeScratchSession !== session || session.revealed) return;
    const progress = Clamp((now - startedAt) / duration, 0, 1);
    const rowProgress = progress * rows;
    const row = Math.min(rows - 1, Math.floor(rowProgress));
    const along = rowProgress - row;
    const leftToRight = row % 2 === 0;
    const x = (leftToRight ? along : 1 - along) * (session.width - session.brushSize) + session.brushSize / 2;
    const y = (row + .5) / rows * session.height;
    const point = { x, y };
    if (row !== previousRow) previousPoint = point;
    EraseScratchSegment(session, previousPoint || point, point, { forceSound: true });
    previousPoint = point;
    previousRow = row;
    if (!session.revealed && progress < 1) session.autoFrame = requestAnimationFrame(Tick);
    else {
      session.autoFrame = 0;
      MeasureScratchCoverage(session, true);
    }
  };
  session.autoFrame = requestAnimationFrame(Tick);
}

function BindScratchCanvas(session) {
  if (!session || activeScratchSession !== session) return;
  const canvas = dom.resultBody.querySelector("[data-scratch-canvas]");
  const scratchWindow = dom.resultBody.querySelector("[data-scratch-window]");
  const ticket = dom.resultBody.querySelector("[data-scratch-ticket]");
  const coin = dom.resultBody.querySelector("[data-scratch-coin]");
  const progressBar = dom.resultBody.querySelector("[data-scratch-progress]");
  const progressText = dom.resultBody.querySelector("[data-scratch-progress-text]");
  const status = dom.resultBody.querySelector("[data-scratch-status]");
  if (!canvas || !scratchWindow || !ticket || !progressBar || !progressText || !status) {
    session.revealed = true;
    dom.resultCloseButton.disabled = false;
    return;
  }

  const rect = canvas.getBoundingClientRect();
  const width = Math.max(260, Math.round(rect.width || 520));
  const height = Math.max(92, Math.round(rect.height || 146));
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  Object.assign(session, {
    canvas, context, window: scratchWindow, ticket, coin, progressBar, progressText, status,
    width, height, pixelRatio, brushSize: Clamp(height * .24, 25, 38),
    pointerId: null, lastPoint: null, lastMeasureAt: 0, coverage: 0,
    dustTravel: 0, dustCount: 0, coinTurn: 0, autoFrame: 0,
  });
  if (!context) {
    RevealScratchTicket(session);
    return;
  }
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  DrawScratchCoating(context, width, height);

  const FinishPointer = (event) => {
    if (session.pointerId !== event.pointerId) return;
    session.pointerId = null;
    session.lastPoint = null;
    session.coin?.classList.remove("active");
    MeasureScratchCoverage(session, true);
  };
  canvas.addEventListener("pointerdown", (event) => {
    if (session.revealed) return;
    event.preventDefault();
    canvas.focus({ preventScroll: true });
    canvas.setPointerCapture?.(event.pointerId);
    session.pointerId = event.pointerId;
    session.lastPoint = ScratchPointerPosition(session, event);
    EraseScratchSegment(session, session.lastPoint, session.lastPoint, { forceSound: true, forceMeasure: true });
  });
  canvas.addEventListener("pointermove", (event) => {
    if (session.pointerId !== event.pointerId || session.revealed) return;
    event.preventDefault();
    const coalescedEvents = event.getCoalescedEvents?.();
    const samples = coalescedEvents?.length ? coalescedEvents : [event];
    for (const sample of samples) {
      const point = ScratchPointerPosition(session, sample);
      EraseScratchSegment(session, session.lastPoint || point, point);
      session.lastPoint = point;
    }
  });
  canvas.addEventListener("pointerup", FinishPointer);
  canvas.addEventListener("pointercancel", FinishPointer);
  canvas.addEventListener("lostpointercapture", (event) => {
    if (session.pointerId === event.pointerId) {
      session.pointerId = null;
      session.lastPoint = null;
      session.coin?.classList.remove("active");
    }
  });
  canvas.addEventListener("keydown", (event) => {
    if (!event.repeat && ["Enter", " "].includes(event.key)) {
      event.preventDefault();
      StartAutoScratch(session);
    }
  });
  canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  canvas.focus({ preventScroll: true });
}

function ShowScratchTicket(result) {
  ResetScratchSession();
  ClosePanel();
  const resultTone = result.profit > 0 ? "win" : result.profit === 0 ? "even" : "loss";
  const profitText = result.profit > 0
    ? `净赚 ${FormatMoney(result.profit)}`
    : result.profit === 0 ? "刚好回本" : `净亏 ${FormatMoney(Math.abs(result.profit))}`;
  const serial = `M${String(state.month).padStart(2, "0")}-${String(state.speculationHistory.length).padStart(3, "0")}-ONE`;
  dom.resultKicker.textContent = "LOTTERY COUNTER · PAID";
  dom.resultTitle.textContent = "刮开彩票";
  dom.resultBody.innerHTML = `
    <div class="scratchStage single">
      <article class="scratchTicket" data-scratch-ticket>
        <div class="scratchTicketMasthead"><span>甲方是我 · 小超市彩票柜台</span><b>NO. ${serial}</b></div>
        <div class="scratchTicketTitle">
          <div><small>STUDIO SURVIVAL LUCKY TICKET</small><strong>工作室续命刮刮乐</strong></div>
          <span class="scratchTicketPrice"><small>票面</small><b>${FormatMoney(result.stake)}</b></span>
        </div>
        <div class="scratchTicketRule"><span>已扣款</span><b>刮开见结果</b><span>每月 1 次</span></div>
        <div class="scratchWindow" data-scratch-window>
          <div class="scratchPrize ${resultTone}">
            <span>本 券 兑 奖 结 果</span>
            <strong>${EscapeHtml(result.outcome.label)}</strong>
            <b>返还 ${FormatMoney(result.payout)}</b>
            <small>${profitText} · 不计入游戏收入</small>
          </div>
          <canvas class="scratchCanvas" data-scratch-canvas tabindex="0" role="slider" aria-label="银色刮奖涂层。按住鼠标或手指来回刮，键盘按空格自动刮开" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"></canvas>
          <div class="scratchCoin" data-scratch-coin aria-hidden="true"><i>¥</i><span>刮</span></div>
          <div class="scratchRevealShine" aria-hidden="true"></div>
        </div>
        <div class="scratchProgress" aria-hidden="true"><i data-scratch-progress></i></div>
        <div class="scratchTicketFooter">
          <strong data-scratch-progress-text>先刮出第一道痕迹</strong>
          <span>拖动刮开 · 空格自动</span>
        </div>
        <div class="scratchFinePrint"><span>收益不计游戏收入。</span><b>兑奖码 ${serial}</b></div>
      </article>
      <p class="scratchStatus" data-scratch-status aria-live="polite">尚未刮开。</p>
    </div>`;
  resultCloseHandler = () => { if (state.status !== "playing") RenderEnding(); };
  dom.resultLayer.classList.add("scratchMode");
  dom.resultLayer.classList.remove("hidden");
  dom.resultCloseButton.classList.remove("hidden");
  dom.resultCloseButton.disabled = true;
  dom.resultCloseButton.textContent = "先把涂层刮开";
  const session = { result, revealed: false, canvas: null, autoFrame: 0 };
  activeScratchSession = session;
  requestAnimationFrame(() => BindScratchCanvas(session));
}

function OpenScratchSheet() {
  const used = state.lastScratchMonth === state.month;
  const history = state.speculationHistory.filter((item) => [SCRATCH_OPTION.id, "lottery"].includes(item.optionId));
  OpenPanel("SCRATCH CARD", "刮刮乐", `
    <div class="worldGrid singleChoiceGrid">
      <article class="oddsCard scratchCounterCard">
        <div class="choiceTop"><strong>${SCRATCH_OPTION.icon} ${EscapeHtml(SCRATCH_OPTION.name)}</strong><span>${EscapeHtml(SCRATCH_OPTION.risk)}</span></div>
        <div class="oddsList">${OutcomeOdds(SCRATCH_OPTION).map((outcome) => `<div class="oddsLine"><span>${(outcome.chance * 100).toFixed(outcome.chance < .01 ? 1 : 0)}% · ${EscapeHtml(outcome.label)}</span><b>返还 ×${outcome.payoutMultiplier}</b></div>`).join("")}</div>
        <div class="choiceFooter" style="margin-top:9px"><span>${FormatMoney(SCRATCH_OPTION.stake)}</span><button class="miniButton" data-buy-scratch type="button" ${used || state.cash < SCRATCH_OPTION.stake ? "disabled" : ""}>${used ? "本月已刮" : state.cash < SCRATCH_OPTION.stake ? "现金不足" : "买 1 张"}</button></div>
      </article>
    </div>
    <div class="panelSection sectionHeading"><strong>最近刮奖</strong><span>6 次</span></div>
    <div class="logList">${history.length ? [...history].reverse().slice(0, 6).map((item) => `<div class="logLine"><b>M${String(item.month).padStart(2, "0")}</b><span>${EscapeHtml(item.label)}，${item.profit >= 0 ? "+" : "−"}${FormatMoney(Math.abs(item.profit))}</span></div>`).join("") : `<div class="note">暂无记录。</div>`}</div>`, () => {
    dom.sheetBody.onclick = (event) => {
      if (!event.target.closest("[data-buy-scratch]")) return;
      const result = BuyScratchTicket(state);
      if (!ApplyInteractiveResult(result, { deferEnding: true, tone: result?.profit >= 0 ? "good" : "warning", toast: false, sound: false })) return;
      ShowScratchTicket(result);
    };
  });
}

function StockHistoryHtml() {
  return state.stockHistory.length
    ? [...state.stockHistory].reverse().slice(0, 6).map((item) => {
      const option = STOCK_OPTIONS.find((candidate) => candidate.id === item.optionId);
      return `<div class="logLine"><b>M${String(item.month).padStart(2, "0")}</b><span>${EscapeHtml(option?.name || item.optionId)}：${EscapeHtml(item.label)}，${item.profit >= 0 ? "+" : "−"}${FormatMoney(Math.abs(item.profit))}</span></div>`;
    }).join("")
    : `<div class="note">暂无记录。</div>`;
}

function StockProfitTotal() {
  return state.stockHistory.reduce((total, item) => total + (item.profit || 0), 0);
}

function OpenStockSheet() {
  const access = GetStockAccountAccess(state);
  if (!access.unlocked) {
    ShowToast(`现金 ≥ ${FormatMoney(STOCK_ACCOUNT_UNLOCK_CASH)} 解锁炒股。`, "warning");
    PlayTone("warning");
    return;
  }
  if (!access.permanentlyUnlocked) {
    const unlock = UnlockStockAccount(state);
    if (!ApplyInteractiveResult(unlock, { tone: "good" })) return;
  }

  const position = state.stockPosition;
  if (position) {
    const option = STOCK_OPTIONS.find((candidate) => candidate.id === position.optionId);
    const stockProfit = StockProfitTotal();
    OpenPanel("STOCK POSITION", "股票持仓", `
      <section class="stockPositionCard" style="--stockColor:${option?.color || "#66b8ff"}">
        <span>M${String(position.openedMonth).padStart(2, "0")} 持仓中</span>
        <strong>${EscapeHtml(option?.symbol || "STOCK")} · ${EscapeHtml(option?.name || position.optionId)}</strong>
        <div><b>${FormatMoney(position.stake)}</b><small>M${String(position.openedMonth + 1).padStart(2, "0")} 收盘</small></div>
      </section>
      <div class="panelSection sectionHeading"><strong>股票历史</strong><span>累计 ${stockProfit >= 0 ? "赚" : "亏"} ${FormatMoney(Math.abs(stockProfit))}</span></div>
      <div class="logList">${StockHistoryHtml()}</div>`);
    return;
  }

  const minimumBuy = Math.min(...STOCK_OPTIONS.map((option) => option.minimumBuy));
  const maximumBuy = Math.floor(state.cash / 1000) * 1000;
  const canBuy = maximumBuy >= minimumBuy;
  const defaultStake = canBuy ? Math.min(20000, maximumBuy) : 0;
  const quickAmounts = [5000, 10000, 30000, 50000];
  OpenPanel("STOCK ACCOUNT", "炒股 · 选股票与金额", `
    <form class="stockOrderForm" data-stock-form>
      <div class="stockPickGrid">${STOCK_OPTIONS.map((option, index) => `
        <label class="stockPick" style="--stockColor:${option.color}">
          <input type="radio" name="stockOption" value="${option.id}" ${index === 0 ? "checked" : ""}>
          <span><em>${EscapeHtml(option.symbol)}</em><strong>${option.icon} ${EscapeHtml(option.name)}</strong><small>${EscapeHtml(option.risk)}</small></span>
        </label>`).join("")}</div>
      <section class="stockAmountPanel">
        <div><span>买入金额</span><strong>可用 ${FormatMoney(state.cash)}</strong></div>
        <label class="stockAmountInput"><span>¥</span><input name="stockAmount" type="number" inputmode="numeric" min="${minimumBuy}" max="${Math.max(minimumBuy, maximumBuy)}" step="1000" value="${defaultStake}" aria-label="股票买入金额" ${canBuy ? "" : "disabled"}></label>
        <div class="stockQuickAmounts">${quickAmounts.map((amount) => `<button data-stock-amount="${amount}" type="button" ${amount > state.cash ? "disabled" : ""}>${FormatGoalMoney(amount)}</button>`).join("")}</div>
        <div class="marketCommit"><span>${canBuy ? "¥1,000 取整 · 每月 1 只 · 不计游戏收入" : `最低 ${FormatMoney(minimumBuy)} · 账户仍已解锁`}</span><button class="primaryButton" data-stock-buy type="button" ${canBuy ? "" : "disabled"}>买入 · 次月结算</button></div>
      </section>
    </form>
    <div class="panelSection sectionHeading"><strong>股票历史</strong><span>最近 6 次</span></div>
    <div class="logList">${StockHistoryHtml()}</div>`, () => {
    const form = dom.sheetBody.querySelector("[data-stock-form]");
    const amountInput = form?.querySelector('[name="stockAmount"]');
    dom.sheetBody.onclick = (event) => {
      const quickAmount = event.target.closest("[data-stock-amount]");
      if (quickAmount && amountInput) {
        amountInput.value = quickAmount.dataset.stockAmount;
        amountInput.focus();
        return;
      }
      if (!event.target.closest("[data-stock-buy]")) return;
      const optionId = form?.querySelector('[name="stockOption"]:checked')?.value;
      const result = PlaceStockOrder(state, optionId, amountInput?.value);
      if (!ApplyInteractiveResult(result, { tone: "warning", toast: false })) return;
      ShowResult("ORDER PLACED", `${result.option.symbol} 已买入`, `
        <div class="resultHero"><b>${FormatGoalMoney(result.stake)}</b><p>M${String(state.month + 1).padStart(2, "0")} 显示 22 日走势、返还与盈亏。</p></div>`);
    };
  });
}

function OpenDirectiveSheet() {
  const pivotCost = ForecastPivotCost(state);
  const earlyStage = state.project.age < 1;
  const visibleDirectives = earlyStage
    ? DIRECTIVES.filter((directive) => ["integration", "artSprint", "clientCrush"].includes(directive.id))
    : DIRECTIVES;
  OpenPanel("PROJECT WHITEBOARD", "墙上白板 · 项目方向", `
    <div class="projectWhiteboardScene">
      <div class="whiteboardBoardMeta" aria-hidden="true"><span>M${String(state.month).padStart(2, "0")}</span><i></i><i></i><i></i></div>
      <p class="panelIntro">这个月往哪使劲？</p>
      <div class="worldGrid three whiteboardNoteGrid">${visibleDirectives.map((directive) => `
        <button class="worldChoice ${state.selectedDirective === directive.id ? "selected" : ""}" style="--noteInk:${directive.color}" data-directive-id="${directive.id}" type="button">
          <div class="choiceTop"><strong>${directive.icon} ${EscapeHtml(directive.name)}</strong><span>${state.selectedDirective === directive.id ? "本月采用" : "改方向"}</span></div><p>${EscapeHtml(directive.description)}</p>
        </button>`).join("")}</div>
      ${earlyStage ? `<div class="noteList"><div class="note good">首月完成后开放玩法与换赛道。</div></div>` : `<div class="panelSection choiceFooter"><span>玩法提案</span><button class="miniButton" data-feature-source type="button">安排提案</button></div>
      <div class="panelSection sectionHeading"><strong>换赛道</strong><span>−${FormatMoney(pivotCost)}</span></div>
      <div class="worldGrid whiteboardPivotGrid">
        <label class="worldChoice"><div class="choiceTop"><strong>题材</strong></div><select id="pivotProjectSelect">${PROJECTS.map((project) => `<option value="${project.id}" ${project.id === state.project.templateId ? "selected" : ""}>${EscapeHtml(project.genre)}</option>`).join("")}</select></label>
        <label class="worldChoice"><div class="choiceTop"><strong>发行</strong></div><select id="pivotTypeSelect">${GAME_TYPES.map((gameType) => `<option value="${gameType.id}" ${gameType.id === state.project.gameTypeId ? "selected" : ""}>${EscapeHtml(gameType.name)} · ${EscapeHtml(gameType.warning)}</option>`).join("")}</select></label>
      </div>
      <div class="panelSection choiceFooter"><span>进度、宣发、玩法大量损失 · 焦虑 +14 · 饥饿 +4</span><button class="dangerButton" data-pivot type="button" ${state.project.isReleased ? "disabled" : ""}>花 ${FormatMoney(pivotCost)} 转向</button></div>`}
      <div class="whiteboardMarkerSet" aria-hidden="true"><i></i><i></i><i></i><b></b></div>
    </div>`, () => {
    dom.sheetBody.onclick = (event) => {
      const directiveButton = event.target.closest("[data-directive-id]");
      if (directiveButton) {
        if (ApplyInteractiveResult(SelectDirective(state, directiveButton.dataset.directiveId))) OpenDirectiveSheet();
        return;
      }
      if (event.target.closest("[data-feature-source]")) return OpenFeatureSourceSheet();
      if (!event.target.closest("[data-pivot]")) return;
      const projectId = document.getElementById("pivotProjectSelect")?.value;
      const typeId = document.getElementById("pivotTypeSelect")?.value;
      if (!window.confirm(`${FormatMoney(pivotCost)} · 进度大损。确定？`)) return;
      const result = PivotProject(state, projectId, typeId);
      if (!ApplyInteractiveResult(result, { tone: "warning", deferEnding: true })) return;
      ShowResult("转向", "赛道重做", `
        <div class="resultHero"><b>−${FormatGoalMoney(result.cost)}</b><p>${EscapeHtml(result.reason)}<br>丢失愿望单 ${result.lostWishlists.toLocaleString("zh-CN")}，废弃玩法 ${result.discardedFeatures} 个。</p></div>
        `, () => { if (state.status !== "playing") RenderEnding(); });
    };
  }, { mode: "whiteboard" });
}

function OpenMarketingSheet() {
  if (state.project.age < 1 && !state.project.isReleased) {
    ShowToast("现在只有一份合同，没东西可宣发。先开发并结算第一个月。", "warning");
    PlayTone("warning");
    return;
  }
  OpenPanel("MARKETING PHONE", "宣发手机 · 付费投放", `
    <p class="panelIntro">投放增加愿望单，也会抬高玩家预期。</p>
    <div class="metricGrid">
      <div class="metricTile"><span>累计宣发</span><strong>${FormatMoney(state.project.marketingSpent)}</strong></div>
      <div class="metricTile"><span>愿望单</span><strong>${state.project.wishlists.toLocaleString("zh-CN")}</strong></div>
      <div class="metricTile"><span>预期压力</span><strong>${Math.round(state.project.expectation)} / 60</strong></div>
    </div>
    <div class="panelSection worldGrid three">${MARKETING_CAMPAIGNS.map((campaign) => {
      const bought = state.project.campaigns.includes(campaign.id);
      return `<button class="worldChoice ${campaign.id === "everywhereCampaign" ? "danger" : ""}" data-campaign-id="${campaign.id}" type="button" ${bought || state.project.isReleased ? "disabled" : ""}>
        <div class="choiceTop"><strong>${campaign.icon} ${EscapeHtml(campaign.name)}</strong><span>${FormatMoney(campaign.cost)}</span></div>
        <div class="choiceFooter"><span>愿望单 +${campaign.wishlists.toLocaleString("zh-CN")} · 热度 +${campaign.hype}</span><b>${bought ? "已投放" : `预期 +${campaign.expectation} · 焦虑 +${campaign.anxiety}`}</b></div>
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

function MarketFitPreviewHtml(marketFit) {
  if (!marketFit) return "";
  const refundPoints = Math.round(Math.abs(marketFit.refundRateDelta || 0) * 100);
  const refundLabel = marketFit.refundRateDelta < 0
    ? "退款率 −" + refundPoints + " 点"
    : marketFit.refundRateDelta > 0
      ? "退款率 +" + refundPoints + " 点"
      : "退款率不变";
  return '<div class="marketFitPreview ' + marketFit.tone + '">'
    + '<div class="marketFitStatus"><span>结果</span><strong>' + EscapeHtml(marketFit.label) + '</strong></div>'
    + '<div class="marketFitMetrics">'
    + '<span><small>营收</small><b>×' + marketFit.revenueMultiplier.toFixed(2) + '</b></span>'
    + '<span><small>退款</small><b>' + refundLabel + '</b></span>'
    + '</div></div>';
}

function OpenMarketPhoneSheet() {
  if (state.project.age < 1 && !state.project.isReleased) {
    OpenPanel("MARKETING PHONE", "宣发手机 · 现在还没有可宣传的内容", `
      <div class="marketPhone phoneLockedIntro">
        <div class="phoneStatusBar"><span>M${String(state.month).padStart(2, "0")} · 09:41</span><b>宣发中心</b><span>5G ▰</span></div>
        <div class="resultHero"><b>先开发</b><p>游戏连第一版都没有，市场口径和付费投放暂时不展示。先把电脑里的 3 格精力用完，再去月历结算第一个月。</p></div>
        <div class="note good">首月结束后，这里会开放市场风向、宣传口径与付费投放。</div>
      </div>`);
    return;
  }
  const snapshot = GetMarketSnapshot(state);
  const strategy = state.project.marketStrategy || { focusId: "concept", directionId: null, setMonth: 0 };
  const projectMeta = FindProject(state.project.templateId);
  const focusOptions = [{
    id: "concept",
    title: "立项特色 · " + projectMeta.trend,
  }, ...state.project.features.map((item) => {
    const feature = FEATURE_CHOICES.find((candidate) => candidate.id === item.id);
    return feature ? {
      id: feature.id,
      title: feature.title,
    } : null;
  }).filter(Boolean)];
  const selectedFocusId = strategy.directionId && focusOptions.some((option) => option.id === strategy.focusId)
    ? strategy.focusId
    : "independent";
  const locked = strategy.setMonth === state.month;
  const disabledAttribute = locked ? " disabled" : "";
  const currentFit = EvaluateMarketFit(state);
  const focusMarkup = [
    '<label class="marketPick directionPick">'
      + '<input type="radio" name="marketFocus" value="independent"' + (selectedFocusId === "independent" ? " checked" : "") + disabledAttribute + ">"
      + '<span><b>不追风</b><small>×0.82 · 无惩罚</small></span>'
    + "</label>",
    ...focusOptions.map((option) => {
      const preview = EvaluateMarketFit(state, { focusId: option.id, directionId: snapshot.effectiveDirection.id });
      return '<label class="marketPick focusPick">'
        + '<input type="radio" name="marketFocus" value="' + option.id + '"' + (option.id === selectedFocusId ? " checked" : "") + disabledAttribute + ">"
        + '<span><b>' + EscapeHtml(option.title) + '</b><small>' + EscapeHtml(preview.label) + ' · ×' + preview.revenueMultiplier.toFixed(2) + "</small></span>"
      + "</label>"
    }),
  ].join("");
  const actionLabel = locked ? "已选" : "确认";

  OpenPanel("MARKETING PHONE", "桌边手机 · 宣发", (
    '<div class="marketPhone">'
      + '<div class="phoneStatusBar"><span>M' + String(state.month).padStart(2, "0") + '</span><b>市场</b><span>▰</span></div>'
      + '<section class="marketHero" style="--marketColor:' + snapshot.effectiveDirection.color + '">'
        + '<span>风向</span>'
        + '<strong>' + snapshot.effectiveDirection.icon + " " + EscapeHtml(snapshot.effectiveDirection.name) + "</strong>"
        + '<div><b>命中 ×' + (snapshot.effectiveDirection.perfectMultiplier * snapshot.heatMultiplier).toFixed(2) + '</b></div>'
      + "</section>"
      + '<div class="marketFeed">'
        + '<article class="phoneStory breaking"><span>事件</span><strong>' + EscapeHtml(snapshot.event.title) + "</strong></article>"
      + "</div>"
      + '<div class="marketFeatureAction"><span>付费投放同样只在这台手机里处理。</span><button class="miniButton" data-open-paid-campaigns type="button">付费投放</button></div>'
      + '<form class="marketStrategyForm" data-market-form>'
        + '<div class="phoneSectionTitle"><strong>主推</strong><span>选 1 项</span></div>'
        + '<div class="marketPickGrid focusGrid">' + focusMarkup + "</div>"
        + '<p class="workCostNote">要新增玩法，请关掉手机去墙上白板。</p>'
        + '<div data-market-preview>' + MarketFitPreviewHtml(currentFit) + "</div>"
        + '<div class="marketCommit"><span>每月 1 次</span><button class="primaryButton" data-market-commit type="button" ' + (locked ? "disabled" : "") + ">" + actionLabel + "</button></div>"
      + "</form>"
    + "</div>"
  ), () => {
    const form = dom.sheetBody.querySelector("[data-market-form]");
    const RefreshPreview = () => {
      const focusId = form?.querySelector('[name="marketFocus"]:checked')?.value || "independent";
      const directionId = focusId === "independent" ? "independent" : snapshot.effectiveDirection.id;
      const preview = dom.sheetBody.querySelector("[data-market-preview]");
      if (preview) preview.innerHTML = MarketFitPreviewHtml(EvaluateMarketFit(state, { focusId, directionId }));
    };
    dom.sheetBody.onchange = RefreshPreview;
    dom.sheetBody.onclick = (event) => {
      if (event.target.closest("[data-open-paid-campaigns]")) return OpenMarketingSheet();
      if (!event.target.closest("[data-market-commit]")) return;
      const focusId = form?.querySelector('[name="marketFocus"]:checked')?.value || "independent";
      const result = SetMarketStrategy(state, focusId);
      if (ApplyInteractiveResult(result, { tone: result.marketFit?.backlash ? "warning" : result.marketFit?.perfect ? "good" : "normal" })) {
        OpenMarketPhoneSheet();
      }
    };
  });
}

function RevenueChart(history = state.incomeHistory) {
  const points = history.slice(-16);
  if (!points.length) return `<div class="revenueEmpty">暂无游戏净收入。</div>`;
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

function StockSettlementReport(settlement) {
  if (!settlement?.trend?.length) return "";
  const option = STOCK_OPTIONS.find((candidate) => candidate.id === settlement.optionId);
  const points = settlement.trend;
  const width = 620;
  const height = 170;
  const chartTop = 14;
  const chartBottom = 28;
  const values = points.map((point) => point.price);
  const minimum = Math.min(...values, 100);
  const maximum = Math.max(...values, 100);
  const padding = Math.max(4, (maximum - minimum) * .14);
  const floor = Math.max(0, minimum - padding);
  const ceiling = maximum + padding;
  const range = Math.max(1, ceiling - floor);
  const PointPosition = (point, index) => ({
    x: index / Math.max(1, points.length - 1) * width,
    y: chartTop + (ceiling - point.price) / range * (height - chartTop - chartBottom),
  });
  const polyline = points.map((point, index) => {
    const position = PointPosition(point, index);
    return `${position.x.toFixed(1)},${position.y.toFixed(1)}`;
  }).join(" ");
  const first = PointPosition(points[0], 0);
  const last = PointPosition(points.at(-1), points.length - 1);
  const baselineY = chartTop + (ceiling - 100) / range * (height - chartTop - chartBottom);
  const profitTone = settlement.profit >= 0 ? "gain" : "loss";
  const profitText = `${settlement.profit >= 0 ? "+" : "−"}${FormatMoney(Math.abs(settlement.profit))}`;
  return `<section class="stockMonthReport ${profitTone}" style="--stockColor:${option?.color || "#66b8ff"}">
    <header><div><span>M${String(settlement.month).padStart(2, "0")} · 22 个交易日</span><strong>${EscapeHtml(option?.symbol || "STOCK")} · ${EscapeHtml(option?.name || settlement.optionId)}</strong></div><b>${profitText}</b></header>
    <div class="stockReturnGrid"><span><small>投入本金</small><b>${FormatMoney(settlement.stake)}</b></span><span><small>收盘返还</small><b>${FormatMoney(settlement.payout)}</b></span><span><small>本月收益率</small><b>${settlement.returnRate >= 0 ? "+" : ""}${(settlement.returnRate * 100).toFixed(1)}%</b></span><span><small>收盘消息</small><b>${EscapeHtml(settlement.label)}</b></span></div>
    <div class="stockTrendChart"><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${EscapeHtml(option?.name || "股票")}一个月走势，最终${settlement.profit >= 0 ? "盈利" : "亏损"}${FormatMoney(Math.abs(settlement.profit))}">
      <defs><linearGradient id="stockLineGradient" x1="0" x2="1"><stop stop-color="var(--stockColor)"/><stop offset="1" stop-color="${settlement.profit >= 0 ? "#68e0a0" : "#ff6675"}"/></linearGradient></defs>
      <path d="M0 ${baselineY.toFixed(1)}H${width}" class="stockBaseline"/><polyline points="${polyline}" fill="none" stroke="url(#stockLineGradient)" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
      <circle cx="${first.x}" cy="${first.y}" r="5"/><circle class="stockClosePoint" cx="${last.x}" cy="${last.y}" r="6"/>
      <text x="2" y="${height - 5}">D01 · 100.0</text><text x="${width - 2}" y="${height - 5}" text-anchor="end">D22 · ${points.at(-1).price.toFixed(1)}</text>
    </svg></div>
    <footer><span>资金已返还</span><b>不计游戏收入</b></footer>
  </section>`;
}

function OpenReleaseSheet() {
  const evaluation = EvaluateProject(state);
  const marketFit = EvaluateMarketFit(state);
  const canRelease = state.project.age >= 2 && state.project.lastReleaseMonth !== state.month;
  const tensions = evaluation?.tensions || [];
  OpenPanel("发布", state.project.isReleased ? `更新《${EscapeHtml(state.project.name)}》` : `提交《${EscapeHtml(state.project.name)}》`, `
    <div class="resultHero"><b>${evaluation.rating.toFixed(1)}</b><p>${EscapeHtml(state.project.buildStatus.label)}${tensions[0] ? ` · ${EscapeHtml(tensions[0].title)}` : " · 无严重冲突"}</p></div>
    <div class="metricGrid">
      <div class="metricTile"><span>开发</span><strong>${state.project.age} 月</strong></div>
      <div class="metricTile"><span>热度 · 愿望单</span><strong>${Math.round(state.project.hype)} / ${state.project.wishlists.toLocaleString("zh-CN")}</strong></div>
      <div class="metricTile"><span>Bug · 债</span><strong>${Math.round(state.project.bugs)} / ${Math.round(state.project.scopeDebt + state.project.technicalDebt)}</strong></div>
    </div>
    <div class="noteList">${tensions.length ? tensions.slice(0, 3).map((tension) => `<div class="note ${tension.severity === "critical" ? "danger" : ""}">${EscapeHtml(tension.title)}</div>`).join("") : `<div class="note good">无冲突</div>`}</div>
    <div class="note ${marketFit.backlash ? "danger" : marketFit.perfect ? "good" : ""}">市场：${EscapeHtml(marketFit.label)} · 营收 ×${marketFit.revenueMultiplier.toFixed(2)}</div>
    <div class="panelSection">${RevenueChart()}</div>
    <div class="panelSection choiceFooter"><span>${state.project.age < 2 ? `还需 ${2 - state.project.age} 月` : state.project.lastReleaseMonth === state.month ? "本月已发" : "可发 · 低分退款"}</span><button class="primaryButton" data-release type="button" ${canRelease ? "" : "disabled"}>${state.project.isReleased ? "更新" : "上线"}</button></div>`, () => {
    dom.sheetBody.onclick = (event) => {
      if (!event.target.closest("[data-release]")) return;
      const result = ReleaseBuild(state);
      if (!ApplyInteractiveResult(result, { deferEnding: true, toast: false })) return;
      const commercial = result.commercial;
      ShowResult(result.isUpdate ? "更新" : "上线", `${result.evaluation.rating.toFixed(1)} 分 · ${result.review}`, `
        <div class="resultHero"><b>+${FormatGoalMoney(result.revenue)}</b><p>${commercial.marketBacklash ? "市场错配 · 退款↑" : commercial.backlash ? "质量不足 · 退款↑" : "已计入收入"}</p></div>
        <div class="metricGrid"><div class="metricTile"><span>毛收入</span><strong>${FormatGoalMoney(commercial.grossRevenue)}</strong></div><div class="metricTile"><span>退款</span><strong>${FormatGoalMoney(commercial.refunds)}</strong></div><div class="metricTile"><span>退款率</span><strong>${(commercial.refundRate * 100).toFixed(1)}%</strong></div></div>
        <div class="note ${result.marketFit.backlash ? "danger" : result.marketFit.perfect ? "good" : ""}">市场：${EscapeHtml(result.marketFit.label)} · 营收 ×${result.marketFit.revenueMultiplier.toFixed(2)}</div>
        <div class="panelSection">${RevenueChart()}</div>`, () => { if (state.status !== "playing") RenderEnding(); });
      PlayTone("release");
    };
  }, { mode: "computer" });
}

function GetMonthCloseActions() {
  const actions = [];
  const ownerWorkRemaining = Math.max(0, 3 - state.ownerWorkCount);
  if (ownerWorkRemaining > 0) actions.push(`亲自开发 ${ownerWorkRemaining} 次`);
  if (state.talkPoints > 0) actions.push(`沟通 / 拍板 ${state.talkPoints} 次`);
  if ((state.project.age >= 1 || state.project.isReleased)
    && (state.project.marketStrategy?.setMonth || 0) !== state.month) actions.push("手机里的市场主推未定");
  if (state.project.age >= 2 && state.project.lastReleaseMonth !== state.month) {
    actions.push(state.project.isReleased ? "可发布更新" : "可提交商店");
  }
  return actions;
}

function GetMonthResultHighlights(result, finance) {
  const highlights = [];
  const removed = finance.removedStaff || [];
  const defaults = finance.defaults || [];
  if (finance.startupDefault) highlights.push("启动贷逾期，公司被强制清算。");
  defaults.forEach((loan) => highlights.push(`断供：${FindCollateral(loan.collateralId)?.name || loan.collateralId} 被没收。`));
  removed.forEach((staff) => highlights.push(`${staff.name}${staff.kind === "ai" ? "被退订" : "离开了团队"}。`));
  if (finance.skippedFood) highlights.push("饭钱不足，本月没吃饭。");
  (finance.appliedEvents || []).forEach((liveEvent) => highlights.push(`收入事件：${liveEvent.title}。`));
  if (finance.marketFit && state.project.isReleased && Math.abs(finance.marketDelta || 0) > 0) {
    highlights.push(`市场：${finance.marketFit.label}，${finance.marketDelta >= 0 ? "+" : "−"}${FormatGoalMoney(Math.abs(finance.marketDelta))}。`);
  }
  if (result.anxiety.idea) highlights.push(`焦虑催生新点子：${result.anxiety.idea.title}。`);
  highlights.push(...(result.painEvents || []));
  return [...new Set(highlights)].slice(0, 2);
}

function OpenMonthSheet() {
  if (!state.project || state.status !== "playing") return;
  const costs = ForecastMonthlyCosts(state);
  const pendingStock = STOCK_OPTIONS.find((option) => option.id === state.stockPosition?.optionId);
  const expectedIncome = state.project.isReleased ? state.project.monthlyRevenue : 0;
  const projectedCash = state.cash + expectedIncome - costs.total;
  const shortfall = Math.max(0, -projectedCash);
  const startupLoan = state.startupLoan;
  const monthsLeft = startupLoan?.status === "active" ? Math.max(0, startupLoan.dueMonth - state.month + 1) : 0;
  const currentMonthLabel = `M${String(state.month).padStart(2, "0")}`;
  const nextMonthLabel = `M${String(state.month + 1).padStart(2, "0")}`;
  const openActions = GetMonthCloseActions();
  const hasOpenActions = openActions.length > 0;
  OpenPanel("WALL CALENDAR", `墙上月历 · ${currentMonthLabel} 月结`, `
    <div class="monthCloseRitual">
      <section class="monthCloseLedger" aria-label="${currentMonthLabel} 结束，进入 ${nextMonthLabel}">
        <div class="monthCloseLeaf"><small>本月封账</small><strong>${currentMonthLabel}</strong><span>→ ${nextMonthLabel}</span></div>
        <div class="monthCloseForecast ${shortfall > 0 ? "danger" : ""}">
          <small>${shortfall > 0 ? `现金缺口${state.stockPosition ? "（未计股票）" : ""}` : state.stockPosition ? "账单后现金（未计股票）" : "月结后预计现金"}</small>
          <strong>${shortfall > 0 ? `−${FormatMoney(shortfall)}` : FormatMoney(projectedCash)}</strong>
          <span>${expectedIncome > 0 ? `收入 +${FormatMoney(expectedIncome)} · ` : ""}支出 −${FormatMoney(costs.total)}</span>
        </div>
      </section>
      ${startupLoan?.status === "active" ? `<div class="monthCloseDeadline"><span>启动贷</span><strong>${FormatMoney(startupLoan.remaining)}</strong><em>M${String(startupLoan.dueMonth).padStart(2, "0")} · 剩 ${monthsLeft} 月</em></div>` : ""}
      ${state.stockPosition ? `<div class="monthClosePosition"><span>股票待收盘</span><strong>${EscapeHtml(pendingStock?.symbol || state.stockPosition.optionId)}</strong><em>本金 ${FormatMoney(state.stockPosition.stake)}</em></div>` : ""}
      <section class="monthCloseTasks ${hasOpenActions ? "attention" : "clear"}" aria-live="polite">
        <header><span>月结前检查</span><strong>${hasOpenActions ? `还有 ${openActions.length} 类可做` : "本月事项已清"}</strong></header>
        ${hasOpenActions ? `<div>${openActions.map((action) => `<span>${EscapeHtml(action)}</span>`).join("")}</div>` : ""}
      </section>
      <button class="monthCloseConfirm" data-advance-month type="button">
        <small>${hasOpenActions ? "放弃剩余行动" : "本月封账"}</small>
        <strong>${hasOpenActions ? "仍然月结" : "确认月结"}</strong>
        <span>进入 ${nextMonthLabel} →</span>
      </button>
    </div>`, () => {
    dom.sheetBody.onclick = (event) => {
      if (!event.target.closest("[data-advance-month]")) return;
      const result = AdvanceMonth(state);
      if (!ApplyInteractiveResult(result, { rebuildStaff: true, deferEnding: true, toast: false })) return;
      worldState = ResetWorldMonth(worldState, state.month);
      BuildCollectibles();
      BuildHazards();
      const finance = result.finance;
      const originalMonth = state.lastSettlement?.month || Math.max(1, state.month - 1);
      const resultMonthLabel = `M${String(originalMonth).padStart(2, "0")}`;
      const stockCashReturn = result.stockSettlement?.payout || 0;
      const netCash = finance.income + stockCashReturn - (finance.costs?.total || 0);
      const totalOutput = Object.values(result.output || {}).reduce((total, value) => total + value, 0);
      const highlights = GetMonthResultHighlights(result, finance);
      ShowResult("MONTH SEALED", `${resultMonthLabel} 已封账`, `
        <div class="monthResultRitual">
          <section class="monthResultVerdict">
            <span>项目状态</span>
            <strong>${EscapeHtml(result.buildStatus?.label || "还活着")}</strong>
            <p>${EscapeHtml(highlights[0] || "本月没有重大变故。")}</p>
          </section>
          <div class="monthResultMetrics">
            <div><span>月末现金</span><strong>${FormatMoney(state.cash)}</strong><small>${netCash >= 0 ? "+" : "−"}${FormatMoney(Math.abs(netCash))}</small></div>
            <div><span>本月产出</span><strong>+${totalOutput.toFixed(1)}</strong><small>${EscapeHtml(result.buildStatus?.label || "已结算")}</small></div>
            <div><span>焦虑</span><strong>${Math.round(state.anxiety)}</strong><small>${result.anxiety.delta >= 0 ? "+" : ""}${result.anxiety.delta.toFixed(1)}</small></div>
          </div>
          ${StockSettlementReport(result.stockSettlement)}
          ${highlights[1] ? `<p class="monthResultFootnote">${EscapeHtml(highlights[1])}</p>` : ""}
        </div>`, () => { if (state.status !== "playing") RenderEnding(); }, {
        mode: "monthResult",
        closeLabel: state.status === "playing" ? `进入 M${String(state.month).padStart(2, "0")}` : "查看结局",
      });
    };
  }, "monthClose");
}

function OpenHelpSheet() {
  OpenPanel("HOW TO PLAY", "怎么开始", `
    <div class="resultHero"><b>A / D</b><p>在当前房间移动；W、↑ 或空格跳；靠近物件按 E。去别处必须先走到门口选目的地。</p></div>
    <div class="noteList">
      <div class="note"><b>开发</b>：家里的电脑，每月 3 格精力。</div>
      <div class="note"><b>项目方向</b>：墙上白板。</div>
      <div class="note"><b>宣发</b>：桌边手机，首月结束后开放。</div>
      <div class="note"><b>招聘与设备</b>：出门去人才市场。</div>
      <div class="note"><b>结束本月</b>：墙上月历。</div>
      <div class="note"><b>股票与贷款</b>：出门去银行；小超市只卖 ${FormatMoney(SCRATCH_OPTION.stake)} 的刮刮乐。</div>
      <div class="note danger">M08 前还清 ¥82,000；累计游戏收入达到 100 亿元，你将成为成功的游戏制作人。</div>
    </div>
    <div class="panelSection">${RenderLog(6)}</div>`);
}

function RenderEnding() {
  if (state.status === "playing" || state.status === "setup") return;
  landingOpen = false;
  dom.setupScreen.classList.add("hidden");
  dom.modalLayer.classList.add("hidden");
  dom.resultLayer.classList.add("hidden");
  dom.endingTitle.textContent = state.outcome?.title || (state.status === "ended" ? "你成为了成功的游戏制作人！" : "工作室倒下了");
  const identity = [state.studioName, state.project?.name ? `《${state.project.name}》` : ""].filter(Boolean).join(" · ");
  dom.endingSubtitle.textContent = `${identity}${identity ? "｜" : ""}${state.outcome?.subtitle || ""}`;
  dom.endingStats.innerHTML = `
    <div><span>存活</span><strong>${state.month} 月</strong></div>
    <div><span>游戏收入</span><strong>${FormatGoalMoney(state.gameRevenue)}</strong></div>
    <div><span>最高分</span><strong>${state.bestRating ? state.bestRating.toFixed(1) : "未上线"}</strong></div>`;
  dom.endingScreen.classList.remove("hidden");
}

function HideGoalReveal() {
  if (goalRevealAnimationFrame !== null) window.cancelAnimationFrame(goalRevealAnimationFrame);
  goalRevealAnimationFrame = null;
  pendingGoalState = null;
  dom.goalReveal.classList.add("hidden");
  dom.goalReveal.classList.remove("active", "ready");
  dom.goalReveal.style.removeProperty("--goalRevealProgress");
  dom.goalRevealCounter.textContent = "0";
  dom.goalRevealButton.disabled = true;
}

function FinishGoalRevealAnimation() {
  goalRevealAnimationFrame = null;
  dom.goalRevealCounter.textContent = "100";
  dom.goalReveal.style.setProperty("--goalRevealProgress", "1");
  dom.goalReveal.classList.add("ready");
  dom.goalRevealButton.disabled = false;
  dom.goalRevealButton.focus({ preventScroll: true });
  PlayTone("release");
}

function ShowGoalReveal(nextState) {
  pendingGoalState = nextState;
  onboardingPhase = "goal";
  landingOpen = true;
  dom.setupScreen.classList.add("hidden");
  dom.goalReveal.classList.remove("hidden", "active", "ready");
  dom.goalReveal.style.setProperty("--goalRevealProgress", "0");
  dom.goalRevealCounter.textContent = "0";
  dom.goalRevealButton.disabled = true;

  const reducedMotion = Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches);
  if (reducedMotion) {
    dom.goalReveal.classList.add("active");
    FinishGoalRevealAnimation();
    return;
  }

  goalRevealAnimationFrame = window.requestAnimationFrame(() => {
    dom.goalReveal.classList.add("active");
    const startedAt = performance.now();
    const duration = 1800;
    const TickGoalReveal = (now) => {
      const progress = Clamp((now - startedAt) / duration, 0, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      dom.goalRevealCounter.textContent = String(Math.min(100, Math.floor(eased * 100)));
      dom.goalReveal.style.setProperty("--goalRevealProgress", progress.toFixed(4));
      if (progress < 1) goalRevealAnimationFrame = window.requestAnimationFrame(TickGoalReveal);
      else FinishGoalRevealAnimation();
    };
    goalRevealAnimationFrame = window.requestAnimationFrame(TickGoalReveal);
  });
  PlayTone("good");
}

function CompleteGoalReveal() {
  if (!pendingGoalState || dom.goalRevealButton.disabled) return;
  const nextState = pendingGoalState;
  HideGoalReveal();
  BeginWorld(nextState);
}

function BeginWorld(nextState) {
  HideGoalReveal();
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
  if (state.project?.age === 0 && state.ownerWorkCount === 0) {
    window.setTimeout(() => ShowToast("第一步：走到开发电脑前按 E，分配本月 3 格精力。", "good"), 420);
  }
  if (state.status !== "playing") RenderEnding();
}

function OpenTravelSheet() {
  const current = FindLocation(worldState.activeLocationId) || FindLocationAt(worldState.x);
  const locationPurpose = {
    home: "开发电脑、项目白板、宣发手机、月历与冰箱",
    diner: "选择本月的便宜充饥套餐",
    market: "买零食，或者把现金交给运气",
    talent: "购买工位并招聘大学生或订阅 AI",
    bank: "还启动贷、借款与抵押",
    hotel: "花钱吃一顿能恢复状态的饭",
    footbath: "普通足浴，每月可放松一次",
    footbathCity: "现金宽裕后再来的洗脚城",
    maleModelClub: "高消费的男模店",
  };
  OpenPanel("AT THE DOOR", "出门去哪里？", `
    <p class="panelIntro">在门口选目的地，确认后直接抵达。</p>
    <div class="travelGrid">${WorldLocations.filter((location) => location.id !== current?.id).map((location) => `
      <button class="travelChoice" style="--destinationColor:${location.accent}" data-travel-location="${location.id}" type="button">
        <span>${EscapeHtml(location.name)}</span>
        <strong>${EscapeHtml(locationPurpose[location.id] || "到访")}</strong>
        <i>出发 →</i>
      </button>`).join("")}</div>`, () => {
    dom.sheetBody.onclick = (event) => {
      const button = event.target.closest("[data-travel-location]");
      if (!button) return;
      TravelTo(button.dataset.travelLocation);
    };
  });
}

function TravelTo(locationId) {
  const result = TravelWorld(worldState, locationId);
  if (!result.ok) {
    ShowToast(result.message, "warning");
    return;
  }
  traveling = true;
  activeInteraction = null;
  inputState.left = false;
  inputState.right = false;
  inputState.jump = false;
  dom.travelCurtain.querySelector("span").textContent = `去往${result.location.name}`;
  dom.travelCurtain.classList.add("active");
  ClosePanel();
  window.setTimeout(() => {
    worldState = result.state;
    if (playerActor) {
      playerActor.position.x = worldState.x;
      playerActor.position.y = worldState.y;
    }
    UpdateLocationIndicator();
    PlayTone("good");
  }, 210);
  window.setTimeout(() => {
    dom.travelCurtain.classList.remove("active");
    traveling = false;
    ShowToast(`已到达：${result.location.name}`, "good");
  }, 620);
}

function TriggerInteraction() {
  if (actionCooldown > 0 || IsOverlayOpen() || !activeInteraction) return;
  actionCooldown = .28;
  PlayTone("tap");
  if (activeInteraction.kind === "staff") return OpenStaffSheet(activeInteraction.staffId);
  const consumerVenue = ConsumerVenueForInteraction(activeInteraction);
  if (consumerVenue) {
    const access = GetConsumerVenueAccess(state, consumerVenue.id);
    if (!access.ok) {
      ShowToast(`${consumerVenue.name}准入 ${FormatMoney(access.minimumCash)}，还差 ${FormatMoney(access.shortfall)}。`, "warning");
      PlayTone("warning");
      return;
    }
  }
  switch (activeInteraction.kind) {
    case "homeComputer": return OpenHomeComputerSheet();
    case "planningBoard": return OpenDirectiveSheet();
    case "marketingPhone": return OpenMarketPhoneSheet();
    case "homeCalendar": return OpenMonthSheet();
    case "homeFridge": return OpenFoodSheet("leftovers", "自己家的冰箱");
    case "exit": return OpenTravelSheet();
    case "diner": return OpenFoodSheet("sustenance", "小菜馆：便宜充饥套餐");
    case "snackShelf": return OpenFoodSheet("snack", "小超市：买点小吃顶一顶");
    case "hotel": return OpenFoodSheet("feast", "大酒店：吃顿像人的饭");
    case "regularFootbath": return OpenRelaxationSheet("regularFootbath");
    case "footbathCity": return OpenRelaxationSheet("footbathCity");
    case "maleModelClub": return OpenRelaxationSheet("maleModelClub");
    case "bank": return OpenBankSheet();
    case "lotteryMachine": return OpenScratchSheet();
    case "equipmentShop": return OpenEquipmentSheet();
    case "talentMarket": return OpenTalentSheet();
    default: ShowToast("这个物件还在等需求评审。", "warning");
  }
}

function StartFoundingCeremony() {
  landingOpen = true;
  document.body.classList.add("onboarding");
  SetPlayableWorldVisible(false);
  ShowFoundingNamePanel();
  PlayTone("good");
}

function ConfirmStudioName() {
  const proposedName = dom.studioNameInput.value.replace(/[<>\r\n\t]/g, "").replace(/\s+/g, " ").trim();
  if (proposedName.length < 2) {
    dom.setupError.textContent = "公司名至少 2 个字。";
    dom.studioNameInput.focus();
    PlayTone("warning");
    return;
  }
  draftStudioName = proposedName.slice(0, 18);
  dom.setupError.textContent = "";
  dom.contractStudioName.textContent = draftStudioName;
  dom.contractSignatureName.textContent = draftStudioName;
  UpdateContractReview();
  ShowFounderProfilePanel();
  PlayTone("good");
}

function AdjustFounderSkill(skillKey, delta) {
  if (onboardingPhase !== "profile" || !FOUNDER_SKILL_KEYS.includes(skillKey) || ![-1, 1].includes(delta)) return;
  const currentLevel = draftFounderSkills[skillKey];
  if (delta > 0 && FounderSkillTotal() >= FOUNDER_SKILL_POINTS) return;
  const nextLevel = Clamp(currentLevel + delta, 1, 5);
  if (nextLevel === currentLevel) return;
  draftFounderSkills = { ...draftFounderSkills, [skillKey]: nextLevel };
  RenderFounderSkills({ skillKey, action: delta > 0 ? "increase" : "decrease" });
  PlayTone("tap");
}

function ConfirmFounderProfile() {
  if (onboardingPhase !== "profile") return;
  if (FounderSkillTotal() !== FOUNDER_SKILL_POINTS) {
    PlayTone("warning");
    return;
  }
  draftFounderSkills = NormalizeFounderSkills(draftFounderSkills);
  PlayTone("good");
  ShowProjectContract();
}

function CancelSealHold() {
  if (sealHoldComplete) return;
  window.clearTimeout(sealHoldTimer);
  sealHoldTimer = null;
  dom.sealButton.classList.remove("holding");
}

function CompleteContractSigning() {
  if (sealHoldComplete) return;
  const fresh = CreateInitialState();
  const result = StartProject(fresh, selectedProjectId, selectedGameTypeId, {
    studioName: draftStudioName,
    founderSkills: draftFounderSkills,
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
  dom.sealButton.querySelector("strong").textContent = "签署完成";
  dom.projectContract.classList.add("signed");
  dom.contractError.textContent = "发行合同已签署；M01 正式开始。";
  SpawnParticles(6, 3.7, 0xff445f, 48);
  PlayTone("release");
  window.setTimeout(() => ShowGoalReveal(result.state), 1050);
}

function BeginSealHold(event) {
  if (sealHoldComplete || onboardingPhase !== "contract") return;
  if (event.type === "pointerdown" && event.button !== 0) return;
  event.preventDefault();
  dom.contractError.textContent = "按住 1 秒。";
  dom.sealButton.classList.add("holding");
  window.clearTimeout(sealHoldTimer);
  sealHoldTimer = window.setTimeout(CompleteContractSigning, 1050);
}

function ResetOnboarding() {
  HideGoalReveal();
  onboardingPhase = "intro";
  ceremonyElapsed = 0;
  ceremonyBurstStep = -1;
  sealHoldComplete = false;
  CancelSealHold();
  draftStudioName = "";
  draftFounderSkills = { ...DEFAULT_FOUNDER_SKILLS };
  landingOpen = true;
  BuildCeremonyScene();
  SetPlayableWorldVisible(false);
  document.body.classList.add("onboarding");
  dom.setupScreen.classList.remove("hidden", "cinematic");
  dom.setupScreen.classList.remove("bookMode");
  dom.ceremonyIntro.classList.remove("hidden");
  dom.foundingNamePanel.classList.add("hidden");
  dom.founderProfilePanel.classList.add("hidden");
  dom.projectContract.classList.add("hidden");
  dom.projectContract.classList.remove("signed");
  dom.skipCeremonyButton.classList.add("hidden");
  dom.ceremonyCaption.classList.add("hidden");
  dom.studioNameInput.value = "";
  dom.setupError.textContent = "";
  dom.contractError.textContent = "";
  contractPageIndex = 0;
  dom.sealButton.classList.remove("holding", "sealed");
  dom.sealButton.querySelector("span").textContent = "按住 1 秒";
  dom.sealButton.querySelector("strong").textContent = "签署发行合同";
  RenderFounderSkills();
  RenderSetupChoices();
  RenderContractPage();
}

function QuickRestart() {
  const result = RestartProject(state);
  if (!result.ok) {
    ShowToast(result.message || "无法沿用上局设定。", "warning");
    PlayTone("warning");
    return;
  }
  selectedProjectId = result.state.project.templateId;
  selectedGameTypeId = result.state.project.gameTypeId;
  draftStudioName = result.state.studioName;
  draftFounderSkills = NormalizeFounderSkills(result.state.founderSkills);
  savedState = result.state;
  BeginWorld(result.state);
  PlayTone("good");
}

function RestartWithNewSetup() {
  state = CreateInitialState();
  selectedProjectId = PROJECTS[0].id;
  selectedGameTypeId = GAME_TYPES[0].id;
  localStorage.removeItem(SAVE_KEY);
  savedState = null;
  dom.endingScreen.classList.add("hidden");
  ResetOnboarding();
  RenderHud();
}

function SetMovement(key, pressed) {
  inputState[key] = pressed;
  if (pressed && audioContext?.state === "suspended") audioContext.resume();
}

function SetTouchButtonPressed(button, pressed) {
  button.classList.toggle("pressed", pressed);
  button.setAttribute("aria-pressed", String(pressed));
}

function ResetTouchControls() {
  inputState.left = false;
  inputState.right = false;
  inputState.jump = false;
  SetTouchButtonPressed(dom.moveLeftButton, false);
  SetTouchButtonPressed(dom.moveRightButton, false);
  SetTouchButtonPressed(dom.jumpButton, false);
}

function UpdateMobileControlState(interactionAvailable, interaction) {
  const suppressed = IsOverlayOpen();
  const interactionLabel = interaction?.label || "靠近可交互对象";
  const interactionDetail = interaction?.detail || "";
  const signature = `${suppressed}:${interactionAvailable}:${interactionLabel}:${interactionDetail}`;
  if (signature === mobileControlSignature) return;
  mobileControlSignature = signature;
  dom.mobileControls.classList.toggle("suppressed", suppressed);
  dom.mobileControls.toggleAttribute("inert", suppressed);
  dom.mobileControls.setAttribute("aria-hidden", String(suppressed));
  dom.moveLeftButton.disabled = suppressed;
  dom.moveRightButton.disabled = suppressed;
  dom.jumpButton.disabled = suppressed;
  dom.interactButton.disabled = !interactionAvailable;
  dom.interactButton.classList.toggle("available", interactionAvailable);
  dom.interactButton.setAttribute("aria-label", interactionAvailable ? [interactionLabel, interactionDetail].filter(Boolean).join("。") : "靠近可交互对象");
  if (suppressed) ResetTouchControls();
}

function PlayTouchFeedback(duration = 9) {
  if (!window.matchMedia?.("(pointer: coarse)").matches) return;
  try { navigator.vibrate?.(duration); } catch { /* Haptics are optional. */ }
}

function BindHoldButton(button, key) {
  const release = (event) => {
    event?.preventDefault?.();
    SetMovement(key, false);
    SetTouchButtonPressed(button, false);
  };
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    button.setPointerCapture?.(event.pointerId);
    SetMovement(key, true);
    SetTouchButtonPressed(button, true);
  });
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
}

function BindControls() {
  window.addEventListener("resize", ResizeScene);
  window.addEventListener("blur", () => { ResetTouchControls(); CancelSealHold(); });
  window.addEventListener("keydown", (event) => {
    const activeElement = document.activeElement;
    if (["INPUT", "SELECT", "TEXTAREA"].includes(activeElement?.tagName) || activeElement?.isContentEditable) return;
    if (activeElement?.matches?.("button, a, [role='button']") && ["Space", "Enter"].includes(event.code)) return;
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
  dom.jumpButton.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    dom.jumpButton.setPointerCapture?.(event.pointerId);
    SetTouchButtonPressed(dom.jumpButton, true);
    inputState.jump = true;
    PlayTouchFeedback(8);
    PlayTone("jump");
  });
  const releaseJump = (event) => { event?.preventDefault?.(); SetTouchButtonPressed(dom.jumpButton, false); };
  dom.jumpButton.addEventListener("pointerup", releaseJump);
  dom.jumpButton.addEventListener("pointercancel", releaseJump);
  dom.jumpButton.addEventListener("lostpointercapture", releaseJump);
  dom.interactButton.addEventListener("click", (event) => {
    event.preventDefault();
    PlayTouchFeedback(12);
    TriggerInteraction();
  });
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
    selectedProjectId = button.dataset.projectId;
    RenderSetupChoices();
    dom.projectChoices.querySelector(`[data-project-id="${selectedProjectId}"]`)?.focus({ preventScroll: true });
    PlayTone("tap");
  });
  dom.typeChoices.addEventListener("click", (event) => {
    const button = event.target.closest("[data-type-id]");
    if (!button) return;
    selectedGameTypeId = button.dataset.typeId;
    RenderSetupChoices();
    dom.typeChoices.querySelector(`[data-type-id="${selectedGameTypeId}"]`)?.focus({ preventScroll: true });
    PlayTone("tap");
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
  dom.founderBackButton.addEventListener("click", ReturnFounderProfile);
  dom.contractBackButton.addEventListener("click", ReturnContractPage);
  dom.contractNextButton.addEventListener("click", AdvanceContractPage);
  dom.studioNameInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") { event.preventDefault(); ConfirmStudioName(); }
  });
  dom.founderSkillEditor.addEventListener("click", (event) => {
    const button = event.target.closest("[data-skill-action]");
    if (!button) return;
    AdjustFounderSkill(button.dataset.skillKey, button.dataset.skillAction === "increase" ? 1 : -1);
  });
  dom.founderConfirmButton.addEventListener("click", ConfirmFounderProfile);
  dom.sealButton.addEventListener("pointerdown", BeginSealHold);
  dom.sealButton.addEventListener("pointerup", CancelSealHold);
  dom.sealButton.addEventListener("pointercancel", CancelSealHold);
  dom.sealButton.addEventListener("pointerleave", CancelSealHold);
  dom.sealButton.addEventListener("contextmenu", (event) => event.preventDefault());
  dom.sealButton.addEventListener("keydown", (event) => {
    if (!["Enter", " "].includes(event.key) || event.repeat) return;
    BeginSealHold(event);
  });
  dom.sealButton.addEventListener("keyup", (event) => {
    if (!["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    CancelSealHold();
  });
  dom.continueButton.addEventListener("click", () => BeginWorld(savedState));
  dom.goalRevealButton.addEventListener("click", CompleteGoalReveal);
  dom.quickRestartButton.addEventListener("click", QuickRestart);
  dom.restartButton.addEventListener("click", RestartWithNewSetup);
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
