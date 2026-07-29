import THREE from "./Script_ThreeLoader.mjs";
import {
  CreateGameState,
  FindNearbySite,
  GetActLabel,
  GetDistance,
  GetEvaluation,
  GetObjectives,
  GetSiteAction,
  InteractWithSite,
  StepGame,
  ThrowDistraction,
  UseMedicine,
  civilianDefinitions,
  gameConfig,
  obstacleDefinitions,
  patrolVision,
  siteDefinitions,
  waterwayBlockadeDefinitions,
} from "./Script_Rules.mjs";

const Element = (id) => document.getElementById(id);
const elements = {
  gameShell: Element("GameShell"),
  canvas: Element("GameCanvas"),
  topBar: Element("TopBar"),
  objectivePanel: Element("ObjectivePanel"),
  objectiveList: Element("ObjectiveList"),
  objectiveGuidance: Element("ObjectiveGuidance"),
  actLabel: Element("ActLabel"),
  conditionPanel: Element("ConditionPanel"),
  eventLog: Element("EventLog"),
  locationLabel: Element("LocationLabel"),
  guidanceArrow: Element("GuidanceArrow"),
  interactionPrompt: Element("InteractionPrompt"),
  interactionText: Element("InteractionText"),
  detectedWarning: Element("DetectedWarning"),
  detectedState: Element("DetectedState"),
  detectedHint: Element("DetectedHint"),
  narrativeCaption: Element("NarrativeCaption"),
  captionTitle: Element("CaptionTitle"),
  captionText: Element("CaptionText"),
  controlHint: Element("ControlHint"),
  touchControls: Element("TouchControls"),
  moveStick: Element("MoveStick"),
  touchInteract: Element("TouchInteract"),
  touchDistract: Element("TouchDistract"),
  touchMedicine: Element("TouchMedicine"),
  startScreen: Element("StartScreen"),
  startButton: Element("StartButton"),
  startHistoryButton: Element("StartHistoryButton"),
  historyButton: Element("HistoryButton"),
  modalLayer: Element("ModalLayer"),
  historyModal: Element("HistoryModal"),
  pauseModal: Element("PauseModal"),
  medicineModal: Element("MedicineModal"),
  resultModal: Element("ResultModal"),
  pauseButton: Element("PauseButton"),
  audioButton: Element("AudioButton"),
  resumeButton: Element("ResumeButton"),
  pauseHistoryButton: Element("PauseHistoryButton"),
  restartButton: Element("RestartButton"),
  medicineZhaoButton: Element("MedicineZhaoButton"),
  medicineLinButton: Element("MedicineLinButton"),
  medicineCancelButton: Element("MedicineCancelButton"),
  returnTitleButton: Element("ReturnTitleButton"),
  resultHistoryButton: Element("ResultHistoryButton"),
  resultRestartButton: Element("ResultRestartButton"),
  resultReturnTitleButton: Element("ResultReturnTitleButton"),
  resultEyebrow: Element("ResultEyebrow"),
  resultTitle: Element("ResultTitle"),
  resultSummary: Element("ResultSummary"),
  resultScore: Element("ResultScore"),
  resultMetrics: Element("ResultMetrics"),
  resultReflection: Element("ResultReflection"),
  civilianValue: Element("CivilianValue"),
  grainValue: Element("GrainValue"),
  woundedValue: Element("WoundedValue"),
  alertValue: Element("AlertValue"),
  timeValue: Element("TimeValue"),
  conditionText: Element("ConditionText"),
  healthFill: Element("HealthFill"),
  hopeValue: Element("HopeValue"),
  loadingScreen: Element("LoadingScreen"),
  loadingFill: Element("LoadingFill"),
  loadingText: Element("LoadingText"),
  screenReaderStatus: Element("ScreenReaderStatus"),
};
const locationNameElement = elements.locationLabel.querySelector("strong");

const inputState = {
  keys: new Set(),
  touchX: 0,
  touchY: 0,
  stickPointerId: null,
  cameraPointerId: null,
  cameraLastX: 0,
  cameraLastY: 0,
  interact: false,
  distract: false,
  medicine: false,
};

let selectedDifficulty = "standard";
let gameState = null;
let gameMode = "menu";
let lastFrameTime = performance.now();
let lastEventId = 0;
let captionTimeout = null;
let captionQueue = [];
let captionActive = false;
let currentModal = null;
let returnModal = null;
let resultShown = false;
let resultTimer = null;
let pendingResultState = null;
let modalPreviousFocus = null;
let lastObjectiveSignature = "";
let lastLocationName = "";
let lastGuidanceSignature = "";
let lastInteractionPromptText = "";
let lastDetectionSignature = "";

const reducedMotionQuery = matchMedia("(prefers-reduced-motion: reduce)");

const Clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
const Lerp = (from, to, ratio) => from + (to - from) * ratio;
const GetTerrainHeight = (x, z) => {
  const localY = -z;
  return Math.sin(x * .18) * .34 + Math.cos(localY * .14) * .28 + Math.sin((x + localY) * .09) * .24;
};
const SetGroundedPosition = (object, x, z, offset = 0) => object.position.set(x, GetTerrainHeight(x, z) + offset, z);
const boxGeometryCache = new Map();
const surfaceTextureCache = new Map();
const siteDefinitionById = new Map(siteDefinitions.map((site) => [site.id, site]));

class ProceduralSoundscape {
  constructor(button) {
    this.button = button;
    this.context = null;
    this.master = null;
    this.noiseBuffer = null;
    this.windLoop = null;
    this.fireLoop = null;
    this.reedLoop = null;
    this.lastPlayer = null;
    this.stepDistance = 0;
    this.patrolStepTimer = 0;
    this.telegraphTimer = 0;
    this.lastInteractionId = "";
    this.lastStationClosed = false;
    this.lastSignalsConfirmed = 0;
    try {
      this.muted = localStorage.getItem("lastsurvivor1942_audio_muted") === "1";
    } catch {
      this.muted = false;
    }
    this.SyncButton();
  }

  SyncButton() {
    this.button.setAttribute("aria-pressed", String(this.muted));
    this.button.setAttribute("aria-label", this.muted ? "开启环境音" : "静音环境音");
    this.button.title = this.muted ? "开启环境音" : "静音环境音";
    this.button.textContent = this.muted ? "静" : "声";
  }

  EnsureStarted() {
    if (!this.context) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextClass) {
        this.button.disabled = true;
        this.button.setAttribute("aria-label", "此浏览器不支持环境音");
        return;
      }
      this.context = new AudioContextClass();
      this.master = this.context.createGain();
      this.master.gain.value = this.muted ? 0 : .72;
      this.master.connect(this.context.destination);
      this.noiseBuffer = this.CreateNoiseBuffer();
      this.windLoop = this.CreateNoiseLoop("bandpass", 360, .55, .026, .67);
      this.fireLoop = this.CreateNoiseLoop("bandpass", 820, .82, .001, 1.37);
      this.reedLoop = this.CreateNoiseLoop("highpass", 1850, .3, .001, .91);
    }
    if (this.context.state === "suspended") this.context.resume().catch(() => {});
  }

  CreateNoiseBuffer() {
    const length = this.context.sampleRate * 2;
    const buffer = this.context.createBuffer(1, length, this.context.sampleRate);
    const data = buffer.getChannelData(0);
    let previous = 0;
    for (let index = 0; index < length; index += 1) {
      const white = Math.random() * 2 - 1;
      previous = previous * .82 + white * .18;
      data[index] = previous;
    }
    return buffer;
  }

  CreateNoiseLoop(filterType, frequency, quality, gainValue, playbackRate) {
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    source.buffer = this.noiseBuffer;
    source.loop = true;
    source.playbackRate.value = playbackRate;
    filter.type = filterType;
    filter.frequency.value = frequency;
    filter.Q.value = quality;
    gain.gain.value = gainValue;
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
    return { source, filter, gain, targetGain: gainValue };
  }

  SetLoopGain(loop, value, seconds = .12) {
    if (!loop || !this.context) return;
    if (Math.abs(loop.targetGain - value) < .002) return;
    loop.targetGain = value;
    loop.gain.gain.cancelScheduledValues(this.context.currentTime);
    loop.gain.gain.setTargetAtTime(value, this.context.currentTime, seconds);
  }

  PlayTone(frequency, duration = .06, volume = .04, type = "sine", delay = 0) {
    if (!this.context || this.muted) return;
    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + duration + .02);
  }

  PlayNoise(duration = .08, volume = .06, frequency = 520, delay = 0) {
    if (!this.context || this.muted) return;
    const source = this.context.createBufferSource();
    const filter = this.context.createBiquadFilter();
    const gain = this.context.createGain();
    const start = this.context.currentTime + delay;
    source.buffer = this.noiseBuffer;
    filter.type = "bandpass";
    filter.frequency.value = frequency;
    filter.Q.value = .8;
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    source.connect(filter).connect(gain).connect(this.master);
    source.start(start, Math.random() * 1.6, duration + .02);
  }

  PlayTelegraph() {
    this.PlayTone(780, .045, .034, "square");
    this.PlayTone(610, .055, .027, "square", .12);
  }

  PlaySignalBeat(index, quiet = false) {
    const scale = quiet ? .6 : 1;
    if (index === 0) {
      this.PlayTone(780, .05, .04 * scale, "square");
      this.PlayTone(610, .08, .03 * scale, "square", .16);
      this.PlayTone(780, .05, .04 * scale, "square", .34);
    } else if (index === 1) {
      this.PlayNoise(.08, .09 * scale, 240);
      this.PlayNoise(.08, .09 * scale, 240, .42);
    } else {
      this.PlayTone(330, .18, .035 * scale, "sine");
      this.PlayTone(440, .24, .04 * scale, "sine", .32);
    }
  }

  Toggle() {
    this.EnsureStarted();
    this.muted = !this.muted;
    if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : .72, this.context.currentTime, .04);
    try {
      localStorage.setItem("lastsurvivor1942_audio_muted", this.muted ? "1" : "0");
    } catch {}
    this.SyncButton();
  }

  ResetForRun(state) {
    this.lastPlayer = state ? { x: state.player.x, z: state.player.z } : null;
    this.stepDistance = 0;
    this.patrolStepTimer = 0;
    this.telegraphTimer = 0;
    this.lastInteractionId = "";
    this.lastStationClosed = false;
    this.lastSignalsConfirmed = 0;
  }

  Update(state, deltaSeconds) {
    if (!this.context || !state) return;
    const now = this.context.currentTime;
    const villageBurning = ["burned", "evacuatedBurned"].includes(state.villageState);
    const fireDistance = Math.min(
      Math.hypot(state.player.x + 38.3, state.player.z + 35.4),
      villageBurning ? Math.hypot(state.player.x + 33.8, state.player.z + 5.7) : 999,
    );
    const reedDistance = Math.hypot(state.player.x - 44, state.player.z - 43);
    this.SetLoopGain(this.windLoop, state.paused ? .009 : .022 + state.act * .006);
    this.SetLoopGain(this.fireLoop, state.paused ? .002 : Clamp(.095 - fireDistance * .006, .001, .075));
    this.SetLoopGain(this.reedLoop, state.paused ? .001 : Clamp(.07 - reedDistance * .004, .001, .05));

    if (!this.lastPlayer) this.lastPlayer = { x: state.player.x, z: state.player.z };
    const movement = Math.hypot(state.player.x - this.lastPlayer.x, state.player.z - this.lastPlayer.z);
    this.lastPlayer.x = state.player.x;
    this.lastPlayer.z = state.player.z;
    if (!state.paused && !state.ended && movement < 2) {
      this.stepDistance += movement;
      if (this.stepDistance >= 1.25) {
        this.stepDistance = 0;
        this.PlayNoise(.065, .055, state.player.hidden ? 210 : 330);
        this.PlayTone(78, .055, .018, "triangle");
      }
    }

    const closestPatrol = Math.min(999, ...state.patrols.map((patrol) => Math.hypot(patrol.x - state.player.x, patrol.z - state.player.z)));
    this.patrolStepTimer -= deltaSeconds;
    if (!state.paused && !state.ended && closestPatrol < 36 && this.patrolStepTimer <= 0) {
      const pressure = Clamp(1 - closestPatrol / 40, .08, .7);
      this.PlayNoise(.075, .035 + pressure * .055, 155);
      this.PlayTone(58, .07, .012 + pressure * .018, "triangle");
      this.patrolStepTimer = state.patrols.some((patrol) => patrol.alerted) ? .38 : .66;
    }

    const interactionId = state.activeInteraction?.siteId || "";
    if (interactionId !== this.lastInteractionId) {
      if (interactionId === "relayStation") {
        if (state.act === 3) this.PlaySignalBeat(state.signalsConfirmed, true);
        else this.PlayTelegraph();
      }
      else if (interactionId === "rosterTable") this.PlayNoise(.24, .06, 1600);
      else if (interactionId === "grainDepot") this.PlayNoise(.18, .055, 260);
      this.lastInteractionId = interactionId;
      this.telegraphTimer = .65;
    }
    if (state.signalsConfirmed !== this.lastSignalsConfirmed) {
      if (state.signalsConfirmed > this.lastSignalsConfirmed) this.PlaySignalBeat(state.signalsConfirmed - 1);
      this.lastSignalsConfirmed = state.signalsConfirmed;
    }
    if (!state.paused && interactionId === "relayStation" && state.act === 2) {
      this.telegraphTimer -= deltaSeconds;
      if (this.telegraphTimer <= 0) {
        this.PlayTelegraph();
        this.telegraphTimer = 1.25 + (Math.sin(now * 2.1) + 1) * .25;
      }
    }

    if (state.stationClosed && !this.lastStationClosed) {
      this.PlayNoise(.62, .11, 430);
      this.PlayTone(96, .7, .035, "sawtooth");
    }
    this.lastStationClosed = state.stationClosed;
  }

  UpdateMenu() {
    if (!this.context) return;
    this.SetLoopGain(this.windLoop, .018);
    this.SetLoopGain(this.fireLoop, .008);
    this.SetLoopGain(this.reedLoop, .001);
  }
}
const actVisualPalettes = Object.freeze({
  1: Object.freeze({
    skyTop: 0x414b4a, skyHorizon: 0xb28b61, skyGround: 0x5d5b46, fog: 0x7a755e,
    sun: 0xffd29a, sunIntensity: 2.45, hemisphere: 0xa9aa8b, groundLight: 0x292d29,
    hemisphereIntensity: .88, fogDensity: .0115, exposure: .9,
  }),
  2: Object.freeze({
    skyTop: 0x303a42, skyHorizon: 0x7c6b55, skyGround: 0x41483d, fog: 0x5e6255,
    sun: 0xe9ba82, sunIntensity: 1.82, hemisphere: 0x818b84, groundLight: 0x20272a,
    hemisphereIntensity: .72, fogDensity: .0145, exposure: .82,
  }),
  3: Object.freeze({
    skyTop: 0x172534, skyHorizon: 0x5a5660, skyGround: 0x283632, fog: 0x3f4b4b,
    sun: 0xb9cbe0, sunIntensity: 1.18, hemisphere: 0x708294, groundLight: 0x151d22,
    hemisphereIntensity: .58, fogDensity: .018, exposure: .74,
  }),
});
const actVisualColors = Object.freeze(Object.fromEntries(Object.entries(actVisualPalettes).map(([act, palette]) => [act, Object.freeze({
  skyTop: new THREE.Color(palette.skyTop),
  skyHorizon: new THREE.Color(palette.skyHorizon),
  skyGround: new THREE.Color(palette.skyGround),
  fog: new THREE.Color(palette.fog),
  hemisphere: new THREE.Color(palette.hemisphere),
  groundLight: new THREE.Color(palette.groundLight),
  sun: new THREE.Color(palette.sun),
})])));

function CreateSurfaceTexture(style = "earth") {
  if (surfaceTextureCache.has(style)) return surfaceTextureCache.get(style);
  const canvas = document.createElement("canvas");
  const size = style === "flame" || style === "smoke" ? 128 : 96;
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext("2d");
  if (style === "flame") {
    const gradient = context.createRadialGradient(size * .5, size * .72, 2, size * .5, size * .58, size * .5);
    gradient.addColorStop(0, "rgba(255,244,173,1)");
    gradient.addColorStop(.2, "rgba(255,157,55,.96)");
    gradient.addColorStop(.56, "rgba(208,61,25,.72)");
    gradient.addColorStop(1, "rgba(125,25,12,0)");
    context.fillStyle = gradient;
    context.beginPath();
    context.moveTo(size * .5, size * .03);
    context.bezierCurveTo(size * .78, size * .35, size * .92, size * .68, size * .5, size * .98);
    context.bezierCurveTo(size * .08, size * .68, size * .24, size * .34, size * .5, size * .03);
    context.fill();
  } else if (style === "smoke" || style === "shadow") {
    const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, style === "shadow" ? "rgba(0,0,0,.62)" : "rgba(55,57,54,.72)");
    gradient.addColorStop(.46, style === "shadow" ? "rgba(0,0,0,.36)" : "rgba(49,52,49,.42)");
    gradient.addColorStop(1, "rgba(0,0,0,0)");
    context.fillStyle = gradient;
    context.fillRect(0, 0, size, size);
  } else {
    const image = context.createImageData(size, size);
    const seed = [...style].reduce((value, character) => value + character.charCodeAt(0), 19);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const index = (y * size + x) * 4;
        const grain = Math.sin((x + seed) * .71) * 7 + Math.cos((y - seed) * .43) * 6 + Math.sin((x + y) * .17) * 5;
        const streak = style === "wood" ? Math.sin(y * .58 + Math.sin(x * .11) * 2.4) * 16
          : style === "cloth" ? ((x + y) % 4 === 0 ? -10 : 4)
            : style === "thatch" ? Math.sin((x - y) * .92) * 13
              : Math.sin((x * 3 + y * 5 + seed) * .41) * 8;
        const value = Clamp(218 + grain + streak, 166, 255);
        image.data[index] = value;
        image.data[index + 1] = value;
        image.data[index + 2] = value;
        image.data[index + 3] = 255;
      }
    }
    context.putImageData(image, 0, 0);
    context.globalAlpha = .15;
    context.strokeStyle = style === "wood" ? "#30251d" : "#5e584b";
    context.lineWidth = style === "wood" ? 2 : 1;
    for (let line = 0; line < 10; line += 1) {
      context.beginPath();
      if (style === "wood") {
        const y = 6 + line * 9;
        context.moveTo(0, y);
        context.bezierCurveTo(size * .3, y - 3, size * .65, y + 4, size, y);
      } else {
        context.moveTo((line * 29 + seed) % size, 0);
        context.lineTo((line * 17 + seed) % size, size);
      }
      context.stroke();
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  if (!["flame", "smoke", "shadow"].includes(style)) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(style === "wood" ? 1.5 : 3, style === "wood" ? 2.5 : 3);
  }
  surfaceTextureCache.set(style, texture);
  return texture;
}

function CreateMaterial(color, roughness = .9, style = "earth", options = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness: options.metalness ?? .01,
    map: CreateSurfaceTexture(style),
    emissive: options.emissive ?? 0x000000,
    emissiveIntensity: options.emissiveIntensity ?? 0,
  });
}

function CreateBox(width, height, depth, color, roughness = 0.88, style = "earth") {
  const geometryKey = `${width}|${height}|${depth}`;
  if (!boxGeometryCache.has(geometryKey)) boxGeometryCache.set(geometryKey, new THREE.BoxGeometry(width, height, depth));
  return new THREE.Mesh(
    boxGeometryCache.get(geometryKey),
    CreateMaterial(color, roughness, style),
  );
}

function EnableShadows(object, castShadow = true, receiveShadow = true) {
  object.traverse((child) => {
    if (child.isMesh) {
      if (child.userData.noShadow) return;
      child.castShadow = castShadow;
      child.receiveShadow = receiveShadow;
    }
  });
  return object;
}

function CreateLabel(text, options = {}) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const width = options.width || 420;
  const height = options.height || 94;
  canvas.width = width;
  canvas.height = height;
  context.clearRect(0, 0, width, height);
  context.fillStyle = options.background || "rgba(17,20,14,.82)";
  context.strokeStyle = options.border || "rgba(220,202,150,.5)";
  context.lineWidth = 2;
  context.fillRect(3, 3, width - 6, height - 6);
  context.strokeRect(3, 3, width - 6, height - 6);
  context.fillStyle = options.color || "#eee2c8";
  context.font = `600 ${options.fontSize || 30}px "Microsoft YaHei", sans-serif`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, width / 2, height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, opacity: options.opacity ?? 1 });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set((options.scale || 7.4), (options.scale || 7.4) * height / width, 1);
  sprite.userData.labelTexture = texture;
  return sprite;
}

function CreatePerson(options = {}) {
  const group = new THREE.Group();
  const bodyColor = options.bodyColor || 0x5e6547;
  const trouserColor = options.trouserColor || 0x31382d;
  const skinColor = options.skinColor || 0xa68161;
  const body = CreateBox(.75, 1.12, .43, bodyColor, .98, "cloth");
  body.position.y = 1.55;
  const head = new THREE.Mesh(
    new THREE.SphereGeometry(.32, 10, 8),
    CreateMaterial(skinColor, .98, "cloth"),
  );
  head.position.y = 2.43;
  head.scale.z = .9;
  const leftLeg = CreateBox(.25, .9, .28, trouserColor, .98, "cloth");
  leftLeg.position.set(-.2, .52, 0);
  const rightLeg = leftLeg.clone();
  rightLeg.position.x = .2;
  const leftArm = CreateBox(.22, .92, .24, bodyColor, .98, "cloth");
  leftArm.position.set(-.52, 1.48, 0);
  leftArm.rotation.z = -.08;
  const rightArm = leftArm.clone();
  rightArm.position.x = .52;
  rightArm.rotation.z = .08;
  group.add(body, head, leftLeg, rightLeg, leftArm, rightArm);
  group.userData.parts = { leftLeg, rightLeg, leftArm, rightArm, body, head };

  const contactShadow = new THREE.Mesh(
    new THREE.PlaneGeometry(1.45, .75),
    new THREE.MeshBasicMaterial({ map: CreateSurfaceTexture("shadow"), transparent: true, opacity: .42, depthWrite: false, color: 0x11130f }),
  );
  contactShadow.rotation.x = -Math.PI / 2;
  contactShadow.position.y = .025;
  contactShadow.userData.noShadow = true;
  group.add(contactShadow);

  if (options.headwear === "helmet") {
    const helmet = new THREE.Mesh(
      new THREE.SphereGeometry(.39, 10, 6, 0, Math.PI * 2, 0, Math.PI * .58),
      CreateMaterial(options.helmetColor || 0x6b6746, .93, "earth"),
    );
    helmet.position.y = 2.51;
    helmet.scale.z = .95;
    group.add(helmet);
  } else if (options.headwear === "scarf") {
    const scarf = new THREE.Mesh(
      new THREE.CylinderGeometry(.34, .38, .28, 8),
      CreateMaterial(0x374034, .98, "cloth"),
    );
    scarf.position.y = 2.42;
    group.add(scarf);
  }

  if (options.armband) {
    const armband = CreateBox(.235, .18, .26, 0x8f332d, .98, "cloth");
    armband.position.set(-.52, 1.67, 0);
    group.add(armband);
  }

  if (options.carryBundle) {
    const bundle = CreateBox(.82, .7, .34, 0x756544, .98, "cloth");
    bundle.position.set(0, 1.48, -.39);
    bundle.rotation.x = -.12;
    group.add(bundle);
  }

  if (options.cane) {
    const cane = CreateBox(.08, 1.7, .08, 0x4a3928, .95, "wood");
    cane.position.set(.58, .84, .18);
    cane.rotation.z = -.12;
    group.add(cane);
  }

  if (options.apron) {
    const apron = CreateBox(.7, .76, .055, options.apronColor || 0x4b5144, 1, "cloth");
    apron.position.set(0, 1.34, .245);
    const patch = CreateBox(.24, .2, .025, 0x777258, 1, "cloth");
    patch.position.set(.16, 1.18, .285);
    patch.rotation.z = -.11;
    group.add(apron, patch);
  }

  if (options.bandage) {
    const bandage = CreateBox(.8, .19, .46, 0xb5aa8d, 1, "cloth");
    bandage.position.set(0, 1.48, .015);
    bandage.rotation.z = -.12;
    group.add(bandage);
  }

  if (options.radioPack) {
    const radioPack = CreateBox(.68, .86, .36, 0x3f4438, .88, "wood");
    radioPack.position.set(0, 1.48, -.42);
    const antenna = new THREE.Mesh(new THREE.CylinderGeometry(.025, .035, 2.2, 6), CreateMaterial(0x45483f, .6, "wood", { metalness: .18 }));
    antenna.position.set(.26, 2.5, -.48);
    antenna.rotation.z = -.08;
    group.add(radioPack, antenna);
  }

  if (options.tied) {
    leftArm.position.z = -.25;
    rightArm.position.z = -.25;
    leftArm.rotation.x = .82;
    rightArm.rotation.x = .82;
    const rope = new THREE.Mesh(new THREE.TorusGeometry(.34, .035, 6, 16), CreateMaterial(0x8f7c55, 1, "thatch"));
    rope.position.set(0, 1.15, -.33);
    rope.rotation.x = Math.PI / 2;
    group.add(rope);
  }

  EnableShadows(group);
  return group;
}

function CreateHouse(options = {}) {
  const group = new THREE.Group();
  const width = options.width || 5;
  const depth = options.depth || 4;
  const wall = CreateBox(width, 2.5, depth, options.wallColor || 0x867759, 1, "earth");
  wall.userData.cameraOccluder = true;
  wall.position.y = 1.25;
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(Math.max(width, depth) * .71, 2, 4),
    CreateMaterial(options.roofColor || 0x3f3c30, 1, "thatch"),
  );
  roof.position.y = 3.42;
  roof.rotation.y = Math.PI / 4;
  roof.scale.z = depth / width;
  roof.userData.cameraOccluder = true;
  const doorway = new THREE.Mesh(
    new THREE.PlaneGeometry(1.08, 1.78),
    new THREE.MeshBasicMaterial({ color: 0x0f110e, side: THREE.DoubleSide }),
  );
  doorway.position.set(0, .89, depth / 2 + .066);
  const doorPivot = new THREE.Group();
  doorPivot.position.set(-.45, 0, depth / 2 + .09);
  const door = CreateBox(.9, 1.65, .12, 0x352e24, .98, "wood");
  door.position.set(.45, .85, .035);
  const doorBrace = CreateBox(.8, .08, .035, 0x55422f, .98, "wood");
  doorBrace.position.set(.45, .94, .105);
  doorBrace.rotation.z = -.42;
  doorPivot.add(door, doorBrace);
  group.add(wall, roof, doorway, doorPivot);
  group.userData.door = doorPivot;
  group.userData.doorPanel = door;
  if (options.burned) {
    wall.material.color.setHex(0x47443a);
    roof.material.color.setHex(0x252620);
    roof.scale.x = .62;
    roof.rotation.z = .28;
    for (let index = 0; index < 3; index += 1) {
      const beam = CreateBox(.22, 3.2, .22, 0x24231e, 1, "wood");
      beam.position.set(-1.5 + index * 1.5, 2.6, 0);
      beam.rotation.z = index === 1 ? .13 : -.1;
      group.add(beam);
    }
  }
  EnableShadows(group);
  return group;
}

function CreateTree(scale = 1) {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(.18 * scale, .28 * scale, 2.5 * scale, 7),
    new THREE.MeshStandardMaterial({ color: 0x4d4533, roughness: 1 }),
  );
  trunk.position.y = 1.25 * scale;
  const crownMaterial = new THREE.MeshStandardMaterial({ color: 0x404a31, roughness: 1 });
  const crown = new THREE.Mesh(new THREE.DodecahedronGeometry(1.3 * scale, 0), crownMaterial);
  crown.position.y = 3.1 * scale;
  const crownTwo = crown.clone();
  crownTwo.scale.set(.76, .82, .76);
  crownTwo.position.set(.7 * scale, 3.35 * scale, .2 * scale);
  group.add(trunk, crown, crownTwo);
  EnableShadows(group);
  return group;
}

function CreateFire(size = 1) {
  const group = new THREE.Group();
  for (let index = 0; index < 4; index += 1) {
    const flame = new THREE.Sprite(new THREE.SpriteMaterial({
      map: CreateSurfaceTexture("flame"),
      color: index === 0 ? 0xffd785 : index === 3 ? 0xd84422 : 0xff7432,
      transparent: true,
      opacity: .84,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    flame.position.set((index - 1.5) * .24 * size, .7 * size + (index % 2) * .16, (index % 2) * .16);
    flame.scale.set(.9 * size, 1.65 * size, 1);
    flame.userData.phase = index * 1.7;
    group.add(flame);
  }
  const light = new THREE.PointLight(0xff6a30, matchMedia("(pointer: coarse)").matches ? .75 * size : 3.2 * size, 16 * size, 2);
  light.position.y = 2;
  group.add(light);
  for (let index = 0; index < 6; index += 1) {
    const smoke = new THREE.Sprite(new THREE.SpriteMaterial({
      map: CreateSurfaceTexture("smoke"),
      color: 0x31342f,
      transparent: true,
      opacity: .28,
      depthWrite: false,
    }));
    smoke.position.set((index % 2 ? .18 : -.14) * size, 1.2 * size + index * .55 * size, 0);
    smoke.scale.set((1 + index * .22) * size, (1.2 + index * .25) * size, 1);
    smoke.userData.smokePhase = index * 1.3;
    smoke.userData.smokeBaseY = smoke.position.y;
    group.add(smoke);
  }
  group.userData.isFire = true;
  return group;
}

function CreateRoadBetween(fromX, fromZ, toX, toZ, width = 3.2, color = 0x716a51) {
  const distance = Math.hypot(toX - fromX, toZ - fromZ);
  const segments = Math.max(2, Math.ceil(distance / 1.8));
  const directionX = (toX - fromX) / distance;
  const directionZ = (toZ - fromZ) / distance;
  const sideX = -directionZ * width / 2;
  const sideZ = directionX * width / 2;
  const vertices = [];
  const uvs = [];
  const indices = [];
  for (let index = 0; index <= segments; index += 1) {
    const ratio = index / segments;
    const centerX = Lerp(fromX, toX, ratio);
    const centerZ = Lerp(fromZ, toZ, ratio);
    for (const side of [-1, 1]) {
      const x = centerX + sideX * side;
      const z = centerZ + sideZ * side;
      vertices.push(x, GetTerrainHeight(x, z) + .045, z);
      uvs.push(side < 0 ? 0 : 1, ratio * distance / 5);
    }
    if (index < segments) {
      const start = index * 2;
      indices.push(start, start + 2, start + 1, start + 1, start + 2, start + 3);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const road = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({ color, roughness: 1, map: CreateSurfaceTexture("earth"), polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
  );
  road.receiveShadow = true;
  return road;
}

function CreateSiteMarker(site, color = 0xc8ad61) {
  const group = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(1.05, 1.18, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .56, side: THREE.DoubleSide, depthWrite: false }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = .12;
  const beam = new THREE.Mesh(
    new THREE.CylinderGeometry(.02, .12, 2.4, 8, 1, true),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: .055, side: THREE.DoubleSide, depthWrite: false }),
  );
  beam.position.y = 1.2;
  const label = CreateLabel(site.name, { scale: 5.8, fontSize: 27 });
  label.position.y = 3.6;
  group.add(ring, beam, label);
  SetGroundedPosition(group, site.x, site.z);
  group.userData.ring = ring;
  group.userData.beam = beam;
  return group;
}

class WorldRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.isCoarse = matchMedia("(pointer: coarse)").matches;
    this.reducedMotion = reducedMotionQuery.matches;
    reducedMotionQuery.addEventListener?.("change", (event) => { this.reducedMotion = event.matches; });
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, this.isCoarse ? 1.1 : 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = .9;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(actVisualPalettes[1].skyTop);
    this.scene.fog = new THREE.FogExp2(actVisualPalettes[1].fog, actVisualPalettes[1].fogDensity);
    this.camera = new THREE.PerspectiveCamera(54, 1, .1, 260);
    this.camera.position.set(-50, 15, -51);
    // Open northward from the ruined station so its collapsed roof frames the
    // background instead of sitting between the camera and Qin Guizhi.
    this.cameraYaw = 3.15;
    this.cameraPitch = .56;
    this.cameraDistance = 13.5;
    this.cameraTarget = new THREE.Vector3(-42, 1.4, -32.75);
    this.cameraDesired = new THREE.Vector3();
    this.cameraFocus = new THREE.Vector3();
    this.cameraRayDirection = new THREE.Vector3();
    this.cameraRaycaster = new THREE.Raycaster();
    this.previousPlayerPosition = new THREE.Vector3(-42, 0, -32.75);
    this.clockTime = 0;

    this.worldRoot = new THREE.Group();
    this.scene.add(this.worldRoot);
    this.siteMarkers = new Map();
    this.patrolMeshes = new Map();
    this.patrolCones = new Map();
    this.civilianMeshes = [];
    this.liaisonMesh = null;
    this.fireGroups = [];
    this.siteVisuals = new Map();
    this.playerMesh = null;
    this.playerHalo = null;
    this.blockadeBeam = null;
    this.waterwayBlockadeGroup = null;
    this.signalLamp = null;
    this.signalLampLight = null;
    this.signalFlashSeconds = 0;
    this.lastSignalsConfirmed = 0;
    this.grainDepotSign = null;
    this.relayDoor = null;
    this.skyMaterial = null;
    this.sunGlow = null;
    this.dustPoints = null;
    this.farSmokeSprites = [];
    this.doorShotSeconds = 0;
    this.doorShotDuration = 0;
    this.endingShotSeconds = 0;
    this.endingShotDuration = 0;
    this.endingShotSuccess = false;
    this.lastStationClosed = false;
    this.cinematicPause = false;
    this.BuildWorld();
    this.cameraOccluders = [];
    this.worldRoot.traverse((child) => {
      if (!child.isMesh || !child.userData.cameraOccluder) return;
      child.material.transparent = true;
      this.cameraOccluders.push(child);
    });
    this.baseFireCount = this.fireGroups.length;
    const villageVisual = this.siteVisuals.get("wujiaVillage");
    const villageHouse = villageVisual.houses[0];
    this.villageInitialAppearance = villageHouse.children.map((child) => ({
      color: child.material?.color?.getHex?.() ?? null,
      rotationZ: child.rotation.z,
    }));
    this.Resize();
  }

  ResetForNewRun() {
    while (this.fireGroups.length > this.baseFireCount) {
      const fire = this.fireGroups.pop();
      this.worldRoot.remove(fire);
      fire.traverse((child) => {
        if (!child.isSprite) child.geometry?.dispose?.();
        if (Array.isArray(child.material)) child.material.forEach((material) => material.dispose?.());
        else child.material?.dispose?.();
      });
    }
    const villageVisual = this.siteVisuals.get("wujiaVillage");
    villageVisual.burned = false;
    villageVisual.tiedVillagers.visible = true;
    villageVisual.houses[0].children.forEach((child, index) => {
      const initial = this.villageInitialAppearance[index];
      if (initial?.color !== null && child.material?.color) child.material.color.setHex(initial.color);
      if (initial) child.rotation.z = initial.rotationZ;
    });
    this.civilianMeshes.forEach((mesh) => {
      mesh.visible = false;
      if (mesh.userData.distressMarker) mesh.userData.distressMarker.visible = false;
      if (mesh.userData.restraint) mesh.userData.restraint.visible = false;
      mesh.position.set(0, 0, 0);
      mesh.rotation.set(0, 0, 0);
    });
    if (this.liaisonMesh) {
      this.liaisonMesh.visible = true;
      SetGroundedPosition(this.liaisonMesh, -10.4, 34.2);
      this.liaisonMesh.rotation.set(0, 1.1, 0);
    }
    this.clockTime = 0;
    this.cameraYaw = 3.15;
    this.cameraPitch = .56;
    this.cameraDistance = 13.5;
    this.cameraTarget.set(-42, 1.4, -32.75);
    this.previousPlayerPosition.set(-42, 0, -32.75);
    this.doorShotSeconds = 0;
    this.doorShotDuration = 0;
    this.endingShotSeconds = 0;
    this.endingShotDuration = 0;
    this.lastStationClosed = false;
    this.cinematicPause = false;
    this.signalFlashSeconds = 0;
    this.lastSignalsConfirmed = 0;
    if (this.waterwayBlockadeGroup) this.waterwayBlockadeGroup.visible = false;
    elements.gameShell.classList.remove("cinematicMode");
    if (this.relayDoor) this.relayDoor.rotation.y = -1.08;
    this.cameraOccluders.forEach((mesh) => {
      mesh.material.opacity = 1;
      mesh.material.depthWrite = true;
    });
  }

  BeginEndingShot(state) {
    this.endingShotSuccess = state.success;
    this.endingShotDuration = this.reducedMotion ? 4.8 : 6.8;
    this.endingShotSeconds = this.endingShotDuration;
    this.cameraYaw = state.success ? 3.72 : 2.62;
    this.cameraPitch = state.success ? .72 : .48;
    elements.gameShell.classList.add("cinematicMode");
  }

  BuildAtmosphere() {
    const skyGeometry = new THREE.SphereGeometry(205, 32, 18);
    this.skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(actVisualPalettes[1].skyTop) },
        horizonColor: { value: new THREE.Color(actVisualPalettes[1].skyHorizon) },
        groundColor: { value: new THREE.Color(actVisualPalettes[1].skyGround) },
      },
      vertexShader: `
        varying float vSkyY;
        void main() {
          vSkyY = normalize(position).y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 horizonColor;
        uniform vec3 groundColor;
        varying float vSkyY;
        void main() {
          float upper = smoothstep(0.02, 0.72, vSkyY);
          float lower = smoothstep(-0.5, 0.04, vSkyY);
          vec3 lowMix = mix(groundColor, horizonColor, lower);
          gl_FragColor = vec4(mix(lowMix, topColor, upper), 1.0);
        }
      `,
    });
    const sky = new THREE.Mesh(skyGeometry, this.skyMaterial);
    sky.renderOrder = -10;
    this.scene.add(sky);

    this.sunGlow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: CreateSurfaceTexture("smoke"),
      color: 0xf2bd78,
      transparent: true,
      opacity: .32,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }));
    this.sunGlow.position.set(-92, 34, -112);
    this.sunGlow.scale.set(36, 36, 1);
    this.scene.add(this.sunGlow);

    const distantMaterial = new THREE.MeshBasicMaterial({ color: 0x202924, transparent: true, opacity: .72, depthWrite: false });
    const distantGeometry = new THREE.ConeGeometry(2.2, 8, 7);
    const distantTrees = new THREE.InstancedMesh(distantGeometry, distantMaterial, 52);
    const helper = new THREE.Object3D();
    for (let index = 0; index < 52; index += 1) {
      const angle = index / 52 * Math.PI * 2;
      const radius = 82 + (index % 7) * 2.8;
      const scale = .65 + (index % 5) * .13;
      helper.position.set(Math.cos(angle) * radius, 2.2 * scale, Math.sin(angle) * radius);
      helper.rotation.set(0, -angle, 0);
      helper.scale.setScalar(scale);
      helper.updateMatrix();
      distantTrees.setMatrixAt(index, helper.matrix);
    }
    distantTrees.instanceMatrix.needsUpdate = true;
    this.worldRoot.add(distantTrees);

    const dustGeometry = new THREE.BufferGeometry();
    const dustPositions = [];
    for (let index = 0; index < (this.isCoarse ? 90 : 190); index += 1) {
      const raw = Math.sin(index * 91.73) * 43758.5453;
      const fraction = raw - Math.floor(raw);
      dustPositions.push(-58 + ((index * 31) % 116), .5 + fraction * 7, -58 + ((index * 47) % 116));
    }
    dustGeometry.setAttribute("position", new THREE.Float32BufferAttribute(dustPositions, 3));
    this.dustPoints = new THREE.Points(
      dustGeometry,
      new THREE.PointsMaterial({ color: 0xd8c9a7, size: this.isCoarse ? .08 : .12, transparent: true, opacity: .2, depthWrite: false, sizeAttenuation: true }),
    );
    this.worldRoot.add(this.dustPoints);

    [[-34, 5, -7, 8], [-2, 8, 47, 11], [38, 5, -36, 7]].forEach(([x, y, z, scale], columnIndex) => {
      for (let index = 0; index < 4; index += 1) {
        const smoke = new THREE.Sprite(new THREE.SpriteMaterial({
          map: CreateSurfaceTexture("smoke"),
          color: columnIndex === 0 ? 0x353a36 : 0x414746,
          transparent: true,
          opacity: .14 - index * .02,
          depthWrite: false,
        }));
        smoke.position.set(x + (index % 2 ? 1.3 : -.8), y + index * scale * .7, z);
        smoke.scale.set(scale + index * 2.1, scale * 1.4 + index * 2.8, 1);
        smoke.userData.baseX = smoke.position.x;
        smoke.userData.phase = columnIndex * 1.7 + index;
        smoke.userData.villageSmoke = columnIndex === 0;
        smoke.visible = columnIndex !== 0;
        this.farSmokeSprites.push(smoke);
        this.worldRoot.add(smoke);
      }
    });
  }

  UpdateVisualPalette(act, finalPressure, deltaSeconds) {
    const palette = actVisualPalettes[act] || actVisualPalettes[1];
    const colors = actVisualColors[act] || actVisualColors[1];
    const blend = 1 - Math.exp(-deltaSeconds * .7);
    this.scene.background.lerp(colors.skyTop, blend);
    this.scene.fog.color.lerp(colors.fog, blend);
    this.scene.fog.density = Lerp(this.scene.fog.density, palette.fogDensity + (finalPressure ? .002 : 0), blend);
    this.hemisphere.color.lerp(colors.hemisphere, blend);
    this.hemisphere.groundColor.lerp(colors.groundLight, blend);
    this.hemisphere.intensity = Lerp(this.hemisphere.intensity, palette.hemisphereIntensity, blend);
    this.sun.color.lerp(colors.sun, blend);
    this.sun.intensity = Lerp(this.sun.intensity, palette.sunIntensity, blend);
    this.renderer.toneMappingExposure = Lerp(this.renderer.toneMappingExposure, palette.exposure, blend);
    this.skyMaterial.uniforms.topColor.value.lerp(colors.skyTop, blend);
    this.skyMaterial.uniforms.horizonColor.value.lerp(colors.skyHorizon, blend);
    this.skyMaterial.uniforms.groundColor.value.lerp(colors.skyGround, blend);
    this.sunGlow.material.color.lerp(colors.sun, blend);
    this.sunGlow.material.opacity = Lerp(this.sunGlow.material.opacity, act === 1 ? .3 : act === 2 ? .16 : .06, blend);
  }

  BuildWorld() {
    this.BuildAtmosphere();
    const hemisphere = new THREE.HemisphereLight(0xa9aa8b, 0x292d29, .88);
    this.hemisphere = hemisphere;
    this.scene.add(hemisphere);
    const sun = new THREE.DirectionalLight(0xffd29a, 2.45);
    this.sun = sun;
    sun.position.set(-58, 30, -45);
    sun.castShadow = true;
    sun.shadow.mapSize.set(this.isCoarse ? 768 : 2048, this.isCoarse ? 768 : 2048);
    sun.shadow.camera.left = -34;
    sun.shadow.camera.right = 34;
    sun.shadow.camera.top = 34;
    sun.shadow.camera.bottom = -34;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 100;
    sun.shadow.bias = -.00045;
    this.scene.add(sun);
    this.scene.add(sun.target);

    const terrainGeometry = new THREE.PlaneGeometry(122, 122, 40, 40);
    const positions = terrainGeometry.attributes.position;
    const terrainColors = [];
    for (let index = 0; index < positions.count; index += 1) {
      const x = positions.getX(index);
      const y = positions.getY(index);
      const height = GetTerrainHeight(x, -y);
      positions.setZ(index, height);
      const fieldPattern = Math.sin(x * .11) * Math.cos(y * .16);
      const damp = Math.abs(x - 9 - y * .235) < 4.5;
      const color = new THREE.Color(damp ? 0x3d493b : fieldPattern > .25 ? 0x657052 : fieldPattern < -.45 ? 0x6b6248 : 0x596548);
      color.offsetHSL(0, 0, Math.sin((x + y) * .7) * .025);
      terrainColors.push(color.r, color.g, color.b);
    }
    terrainGeometry.setAttribute("color", new THREE.Float32BufferAttribute(terrainColors, 3));
    terrainGeometry.computeVertexNormals();
    const terrain = new THREE.Mesh(
      terrainGeometry,
      new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, map: CreateSurfaceTexture("earth"), roughness: 1, metalness: 0 }),
    );
    terrain.rotation.x = -Math.PI / 2;
    terrain.receiveShadow = true;
    this.worldRoot.add(terrain);

    const roads = [
      [-56, -36, 54, -17, 4.2],
      [-31, -6, 43, 44, 3.1],
      [-8, -34, -6, 55, 2.6],
      [7, 17, 48, 41, 2.3],
    ];
    roads.forEach(([fromX, fromZ, toX, toZ, width]) => this.worldRoot.add(CreateRoadBetween(fromX, fromZ, toX, toZ, width)));

    const trenchMaterial = new THREE.MeshStandardMaterial({ color: 0x323a2e, roughness: 1 });
    const trench = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 108), trenchMaterial);
    trench.rotation.x = -Math.PI / 2;
    trench.rotation.z = -.24;
    trench.position.set(9, -.04, 8);
    this.worldRoot.add(trench);
    for (let index = -48; index <= 48; index += 6) {
      const post = CreateBox(.18, 1.1, .18, 0x4b4735);
      post.position.set(9 + index * .235, .55, 8 + index);
      post.rotation.y = -.24;
      this.worldRoot.add(post);
    }

    this.BuildRuinedStation();
    this.BuildVillage();
    this.BuildClinic();
    this.BuildGrainDepot();
    this.BuildRadioSites();
    this.BuildStoryProps();
    this.BuildOccupationEvidence();
    this.BuildLandscape();
    this.BuildBlockade();
    this.BuildWaterwayBlockade();

    siteDefinitions.forEach((site) => {
      if (site.type === "hide") this.BuildHideSite(site);
      if (site.id === "northDitch") {
        const marker = CreateSiteMarker(site, 0xd1b55f);
        marker.visible = false;
        this.siteMarkers.set(site.id, marker);
        this.worldRoot.add(marker);
      }
      if (!["hide", "memory"].includes(site.type)) {
        const marker = CreateSiteMarker(site, site.type === "exit" ? 0x9db472 : 0xc7a95b);
        this.siteMarkers.set(site.id, marker);
        this.worldRoot.add(marker);
      }
    });

    this.playerMesh = CreatePerson({ bodyColor: 0x596344, trouserColor: 0x2f372b, headwear: "scarf", carryBundle: true, apron: true, apronColor: 0x474c3e });
    this.playerMesh.scale.setScalar(.92);
    this.worldRoot.add(this.playerMesh);
    this.playerHalo = new THREE.Mesh(
      new THREE.RingGeometry(.72, .88, 32),
      new THREE.MeshBasicMaterial({ color: 0xdfc36c, transparent: true, opacity: .65, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.playerHalo.rotation.x = -Math.PI / 2;
    this.playerHalo.position.y = .12;
    this.worldRoot.add(this.playerHalo);

    for (let index = 0; index < 5; index += 1) {
      const person = CreatePerson({
        bodyColor: [0x6b6048, 0x4b5942, 0x6a5144, 0x535c42, 0x716148][index],
        trouserColor: 0x34352d,
        headwear: index === 0 || index === 3 ? "scarf" : null,
        carryBundle: index === 4,
        cane: index === 1,
        apron: index === 0 || index === 4,
        bandage: index === 1,
      });
      person.scale.setScalar(index === 2 ? .78 : index === 3 ? .7 : index === 4 ? .86 : .9);
      if (index === 1) person.userData.parts.body.rotation.z = -.11;
      if (index === 0) {
        person.userData.parts.leftArm.rotation.z = -.32;
        person.userData.parts.rightArm.rotation.z = .32;
      }
      person.visible = false;
      const distressMarker = CreateLabel("被扣住 · 返回解绳", { scale: 4.8, fontSize: 23, color: "#ffe0cb", background: "rgba(104,36,28,.9)", border: "rgba(230,105,77,.7)" });
      distressMarker.position.y = 3.7;
      distressMarker.visible = false;
      person.add(distressMarker);
      person.userData.distressMarker = distressMarker;
      const restraint = new THREE.Mesh(new THREE.TorusGeometry(.34, .035, 6, 16), CreateMaterial(0x8f7c55, 1, "thatch"));
      restraint.position.set(0, 1.15, -.33);
      restraint.rotation.x = Math.PI / 2;
      restraint.visible = false;
      person.add(restraint);
      person.userData.restraint = restraint;
      const nameMarker = CreateLabel(civilianDefinitions[index].name, { scale: 2.7, fontSize: 27, background: "rgba(24,29,20,.72)", border: "rgba(214,192,129,.38)" });
      nameMarker.position.y = 3.18;
      person.add(nameMarker);
      person.userData.nameMarker = nameMarker;
      this.civilianMeshes.push(person);
      this.worldRoot.add(person);
    }

    this.liaisonMesh = CreatePerson({ bodyColor: 0x4f5940, trouserColor: 0x2f352c, bandage: true, radioPack: true });
    this.liaisonMesh.scale.setScalar(.9);
    SetGroundedPosition(this.liaisonMesh, -10.4, 34.2);
    this.liaisonMesh.rotation.y = 1.1;
    const liaisonLabel = CreateLabel("林砚 · 受伤交通员", { scale: 5.2, fontSize: 24, background: "rgba(42,48,32,.88)" });
    liaisonLabel.position.y = 3.6;
    this.liaisonMesh.add(liaisonLabel);
    this.liaisonMesh.userData.nameMarker = liaisonLabel;
    this.worldRoot.add(this.liaisonMesh);
  }

  BuildRuinedStation() {
    const site = siteDefinitions.find((candidate) => candidate.id === "ruinedStation");
    const house = CreateHouse({ width: 6.8, depth: 5.2, burned: true });
    SetGroundedPosition(house, site.x, site.z);
    house.rotation.y = .25;
    this.worldRoot.add(house);
    const fire = CreateFire(.72);
    SetGroundedPosition(fire, site.x + 3.7, site.z + 2.6, .05);
    fire.scale.setScalar(1.55);
    this.fireGroups.push(fire);
    this.worldRoot.add(fire);
    const paper = CreateBox(1.1, .04, .8, 0xc9b989);
    SetGroundedPosition(paper, site.x - 1.2, site.z + 2.8, .28);
    paper.rotation.y = -.4;
    this.worldRoot.add(paper);
    this.siteVisuals.set(site.id, house);
  }

  BuildVillage() {
    const site = siteDefinitions.find((candidate) => candidate.id === "wujiaVillage");
    const group = new THREE.Group();
    const houses = [];
    [[-4, -2, .08], [2.4, -3.8, -.2], [4.4, 2.3, .35], [-2.3, 3.7, -.18]].forEach(([x, z, rotation], index) => {
      const house = CreateHouse({ width: index === 0 ? 5.8 : 4.6, depth: 3.7, wallColor: index === 2 ? 0x766a50 : 0x8b7b5a });
      house.position.set(x, 0, z);
      house.rotation.y = rotation;
      group.add(house);
      houses.push(house);
    });
    const tree = CreateTree(.85);
    tree.position.set(-.5, 0, .3);
    group.add(tree);
    const tiedVillagers = new THREE.Group();
    for (let index = 0; index < 5; index += 1) {
      const person = CreatePerson({ bodyColor: [0x66523e, 0x4c5b45, 0x6b614c][index % 3], trouserColor: 0x38352d, tied: true });
      person.scale.setScalar(index === 2 ? .72 : .8);
      person.position.set(-2 + index, 0, 5.4 + (index % 2) * .45);
      person.rotation.y = Math.PI;
      if (index === 1 || index === 4) {
        person.userData.parts.body.position.y -= .22;
        person.userData.parts.head.position.y -= .22;
        person.userData.parts.leftLeg.scale.y = .62;
        person.userData.parts.rightLeg.scale.y = .62;
      }
      tiedVillagers.add(person);
    }
    group.add(tiedVillagers);
    SetGroundedPosition(group, site.x, site.z);
    this.worldRoot.add(group);
    this.siteVisuals.set(site.id, { group, houses, tiedVillagers, burned: false });
  }

  BuildClinic() {
    const site = siteDefinitions.find((candidate) => candidate.id === "fieldClinic");
    const group = new THREE.Group();
    const house = CreateHouse({ width: 5.5, depth: 4.3, wallColor: 0x7d765d, roofColor: 0x48473a });
    const cross = CreateBox(.9, .18, .08, 0x8f3a31);
    cross.position.set(0, 1.75, 2.24);
    const crossBar = CreateBox(.18, .9, .08, 0x8f3a31);
    crossBar.position.copy(cross.position);
    group.add(house, cross, crossBar);
    SetGroundedPosition(group, site.x, site.z);
    this.worldRoot.add(group);
    this.siteVisuals.set(site.id, group);
  }

  BuildGrainDepot() {
    const site = siteDefinitions.find((candidate) => candidate.id === "grainDepot");
    const group = new THREE.Group();
    const shed = CreateHouse({ width: 6, depth: 4.5, wallColor: 0x70644d, roofColor: 0x36382f });
    shed.scale.y = .83;
    group.add(shed);
    for (let index = 0; index < 8; index += 1) {
      const sack = new THREE.Mesh(
        new THREE.CapsuleGeometry(.35, .6, 4, 8),
        new THREE.MeshStandardMaterial({ color: 0x9a845c, roughness: 1 }),
      );
      sack.rotation.z = Math.PI / 2;
      sack.position.set(-2.2 + (index % 4) * 1.1, .45 + Math.floor(index / 4) * .55, 2.7);
      group.add(sack);
    }
    const sign = CreateLabel("强制征粮", { scale: 4.2, fontSize: 28, color: "#f0d8c2", background: "rgba(81,32,24,.92)", border: "rgba(201,98,75,.65)" });
    sign.position.set(0, 4.6, 0);
    sign.visible = false;
    this.grainDepotSign = sign;
    group.add(sign);
    SetGroundedPosition(group, site.x, site.z);
    this.worldRoot.add(group);
    this.siteVisuals.set(site.id, group);
  }

  BuildRadioSites() {
    const cache = siteDefinitions.find((candidate) => candidate.id === "radioCache");
    const cacheGroup = new THREE.Group();
    const culvert = new THREE.Mesh(
      new THREE.TorusGeometry(1.3, .25, 8, 16, Math.PI),
      new THREE.MeshStandardMaterial({ color: 0x4c5143, roughness: 1 }),
    );
    culvert.rotation.z = Math.PI;
    culvert.rotation.x = Math.PI / 2;
    culvert.position.y = .2;
    const crate = CreateBox(1.25, .65, .85, 0x62513b);
    crate.position.y = .35;
    cacheGroup.add(culvert, crate);
    SetGroundedPosition(cacheGroup, cache.x, cache.z);
    this.worldRoot.add(cacheGroup);
    this.siteVisuals.set(cache.id, cacheGroup);

    const relay = siteDefinitions.find((candidate) => candidate.id === "relayStation");
    const relayGroup = new THREE.Group();
    const house = CreateHouse({ width: 5.4, depth: 4.2, wallColor: 0x66684f, roofColor: 0x35382f });
    this.relayDoor = house.userData.door;
    this.relayDoor.rotation.y = -1.08;
    relayGroup.add(house);
    const mast = CreateBox(.18, 9, .18, 0x54584c);
    mast.position.set(1.8, 5, -.5);
    relayGroup.add(mast);
    for (let index = 0; index < 4; index += 1) {
      const rung = CreateBox(2.5 - index * .35, .1, .1, 0x54584c);
      rung.position.set(1.8, 3 + index * 1.45, -.5);
      relayGroup.add(rung);
    }
    SetGroundedPosition(relayGroup, relay.x, relay.z);
    this.worldRoot.add(relayGroup);
    this.siteVisuals.set(relay.id, relayGroup);

    const exit = siteDefinitions.find((candidate) => candidate.id === "reedExit");
    const exitGroup = new THREE.Group();
    const reedGeometry = new THREE.CylinderGeometry(.025, .04, 1, 5);
    const reedTransforms = [[], []];
    for (let index = 0; index < 55; index += 1) {
      const height = 1.5 + (index % 4) * .25;
      const angle = index * 2.399;
      const radius = 1 + (index % 9) * .55;
      reedTransforms[index % 3 === 0 ? 0 : 1].push({ angle, radius, height });
    }
    const reedHelper = new THREE.Object3D();
    reedTransforms.forEach((transforms, materialIndex) => {
      const reeds = new THREE.InstancedMesh(
        reedGeometry,
        new THREE.MeshStandardMaterial({ color: materialIndex === 0 ? 0x7f7748 : 0x5d6843, roughness: 1 }),
        transforms.length,
      );
      transforms.forEach((reed, index) => {
        reedHelper.position.set(Math.cos(reed.angle) * reed.radius, reed.height / 2, Math.sin(reed.angle) * reed.radius);
        reedHelper.rotation.set(0, reed.angle, 0);
        reedHelper.scale.set(1, reed.height, 1);
        reedHelper.updateMatrix();
        reeds.setMatrixAt(index, reedHelper.matrix);
      });
      reeds.castShadow = true;
      reeds.receiveShadow = true;
      reeds.instanceMatrix.needsUpdate = true;
      exitGroup.add(reeds);
    });
    const signalPost = CreateBox(.1, 3.2, .1, 0x494435, 1, "wood");
    signalPost.position.set(-2.6, 1.6, -.8);
    const signalLampMaterial = new THREE.MeshStandardMaterial({ color: 0x3a3024, emissive: 0xc88d42, emissiveIntensity: .06, roughness: .85 });
    this.signalLamp = new THREE.Mesh(new THREE.BoxGeometry(.38, .42, .3), signalLampMaterial);
    this.signalLamp.position.set(-2.6, 2.75, -.8);
    this.signalLampLight = new THREE.PointLight(0xffc36a, 0, 12, 2);
    this.signalLampLight.position.set(-2.6, 2.75, -.8);
    exitGroup.add(signalPost, this.signalLamp, this.signalLampLight);
    SetGroundedPosition(exitGroup, exit.x, exit.z);
    this.worldRoot.add(exitGroup);
    this.siteVisuals.set(exit.id, exitGroup);
  }

  BuildStoryProps() {
    const westContact = siteDefinitionById.get("westContact");
    const westGroup = new THREE.Group();
    const millstoneMaterial = new THREE.MeshStandardMaterial({ color: 0x686759, roughness: 1 });
    const lowerStone = new THREE.Mesh(new THREE.CylinderGeometry(1.28, 1.38, .38, 18), millstoneMaterial);
    lowerStone.position.y = .2;
    const upperStone = new THREE.Mesh(new THREE.CylinderGeometry(1.02, 1.12, .32, 18), millstoneMaterial);
    upperStone.position.set(.12, .53, -.08);
    const ashMark = new THREE.Mesh(new THREE.RingGeometry(.38, .72, 18, 1, 0, Math.PI * 1.55), new THREE.MeshBasicMaterial({ color: 0x302e29, side: THREE.DoubleSide }));
    ashMark.rotation.x = -Math.PI / 2;
    ashMark.position.set(-.5, .03, 1.05);
    westGroup.add(lowerStone, upperStone, ashMark);
    SetGroundedPosition(westGroup, westContact.x, westContact.z);
    this.worldRoot.add(westGroup);
    this.siteVisuals.set(westContact.id, westGroup);

    const eastContact = siteDefinitionById.get("eastContact");
    const eastGroup = new THREE.Group();
    const deadWood = new THREE.MeshStandardMaterial({ color: 0x4f4737, roughness: 1 });
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(.28, .44, 5.2, 8), deadWood);
    trunk.position.y = 2.6;
    trunk.rotation.z = .09;
    eastGroup.add(trunk);
    [[-.75, 3.5, .72], [.72, 3.9, -.66], [-.45, 4.55, .5]].forEach(([x, y, rotation]) => {
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(.08, .16, 2.2, 6), deadWood);
      branch.position.set(x, y, 0);
      branch.rotation.z = rotation;
      eastGroup.add(branch);
    });
    const clothKnot = CreateBox(.48, .18, .12, 0x9d4638);
    clothKnot.position.set(.52, 3.55, .18);
    clothKnot.rotation.z = -.35;
    eastGroup.add(clothKnot);
    SetGroundedPosition(eastGroup, eastContact.x, eastContact.z);
    this.worldRoot.add(eastGroup);
    this.siteVisuals.set(eastContact.id, eastGroup);

    const roster = siteDefinitionById.get("rosterTable");
    const rosterGroup = new THREE.Group();
    const tabletop = CreateBox(2.35, .16, 1.25, 0x574533);
    tabletop.position.y = 1.18;
    rosterGroup.add(tabletop);
    [[-1, -.45], [1, -.45], [-1, .45], [1, .45]].forEach(([x, z]) => {
      const leg = CreateBox(.14, 1.15, .14, 0x493929);
      leg.position.set(x, .58, z);
      rosterGroup.add(leg);
    });
    for (let index = 0; index < 3; index += 1) {
      const paper = CreateBox(.72, .025, .46, 0xc9b989);
      paper.position.set(-.62 + index * .62, 1.28 + index * .01, (index % 2 - .5) * .28);
      paper.rotation.y = -.18 + index * .17;
      rosterGroup.add(paper);
    }
    const emberBowl = new THREE.Mesh(new THREE.CylinderGeometry(.34, .42, .18, 12), new THREE.MeshStandardMaterial({ color: 0x332b24, emissive: 0x7c2d18, emissiveIntensity: 1.3, roughness: 1 }));
    emberBowl.position.set(.85, 1.33, .25);
    rosterGroup.add(emberBowl);
    SetGroundedPosition(rosterGroup, roster.x, roster.z);
    this.worldRoot.add(rosterGroup);
    this.siteVisuals.set(roster.id, rosterGroup);
    this.siteVisuals.set("stationDoor", this.relayDoor);
  }

  BuildOccupationEvidence() {
    const evidence = new THREE.Group();
    const ashMaterial = new THREE.MeshBasicMaterial({ color: 0x211f1b, transparent: true, opacity: .52, depthWrite: false });
    [[-42.8, -34.1, 3.7, 1.4, -.18], [-33.2, -5.6, 2.8, 1.1, .32], [28.6, -14.5, 2.2, .9, -.4]].forEach(([x, z, width, height, rotation]) => {
      const ash = new THREE.Mesh(new THREE.CircleGeometry(1, 24), ashMaterial.clone());
      ash.scale.set(width, height, 1);
      ash.rotation.x = -Math.PI / 2;
      ash.rotation.z = rotation;
      ash.position.set(x, GetTerrainHeight(x, z) + .055, z);
      evidence.add(ash);
    });

    const cart = new THREE.Group();
    const cartBed = CreateBox(2.1, .28, 1.1, 0x4f3e2d, 1, "wood");
    cartBed.position.y = .65;
    cartBed.rotation.z = -.2;
    const wheelMaterial = CreateMaterial(0x403328, 1, "wood");
    [-.72, .72].forEach((z) => {
      const wheel = new THREE.Mesh(new THREE.TorusGeometry(.52, .09, 7, 18), wheelMaterial);
      wheel.position.set(.45, .48, z);
      wheel.rotation.y = Math.PI / 2;
      wheel.rotation.z = -.18;
      cart.add(wheel);
    });
    const handleLeft = CreateBox(2.2, .08, .08, 0x4b3929, 1, "wood");
    handleLeft.position.set(-1.55, .72, -.38);
    handleLeft.rotation.z = -.18;
    const handleRight = handleLeft.clone();
    handleRight.position.z = .38;
    cart.add(cartBed, handleLeft, handleRight);
    SetGroundedPosition(cart, -36.7, -7.8);
    cart.rotation.y = .72;
    evidence.add(cart);

    const emptyJar = new THREE.Mesh(
      new THREE.CylinderGeometry(.46, .58, .9, 12, 1, true),
      CreateMaterial(0x79684e, 1, "earth"),
    );
    emptyJar.rotation.set(Math.PI / 2, .2, .55);
    SetGroundedPosition(emptyJar, 26.8, -14.2, .44);
    evidence.add(emptyJar);

    const grainGeometry = new THREE.SphereGeometry(.045, 5, 4);
    const grainMaterial = new THREE.MeshStandardMaterial({ color: 0xb69a58, roughness: 1 });
    const grain = new THREE.InstancedMesh(grainGeometry, grainMaterial, 46);
    const helper = new THREE.Object3D();
    for (let index = 0; index < 46; index += 1) {
      const angle = index * 2.399;
      const radius = .14 + (index % 9) * .11;
      const grainX = 27.3 + Math.cos(angle) * radius;
      const grainZ = -14.1 + Math.sin(angle) * radius * .58;
      helper.position.set(grainX, GetTerrainHeight(grainX, grainZ) + .075, grainZ);
      helper.rotation.set(angle, angle * .4, 0);
      helper.scale.setScalar(.75 + (index % 4) * .12);
      helper.updateMatrix();
      grain.setMatrixAt(index, helper.matrix);
    }
    grain.instanceMatrix.needsUpdate = true;
    evidence.add(grain);

    const footprintGeometry = new THREE.PlaneGeometry(.28, .48);
    const footprintMaterial = new THREE.MeshBasicMaterial({ color: 0x24261f, transparent: true, opacity: .34, depthWrite: false });
    const footprints = new THREE.InstancedMesh(footprintGeometry, footprintMaterial, 18);
    for (let index = 0; index < 18; index += 1) {
      const printX = -22 + index * 1.2;
      const printZ = -9.5 + Math.sin(index * .5) * .5;
      helper.position.set(printX, GetTerrainHeight(printX, printZ) + .065, printZ);
      helper.rotation.set(-Math.PI / 2, 0, -.35 + (index % 2 ? .08 : -.08));
      helper.scale.set(index % 2 ? .8 : 1, 1, 1);
      helper.updateMatrix();
      footprints.setMatrixAt(index, helper.matrix);
    }
    footprints.instanceMatrix.needsUpdate = true;
    evidence.add(footprints);

    const ropeMaterial = CreateMaterial(0x8f7b54, 1, "thatch");
    for (let index = 0; index < 4; index += 1) {
      const cutRope = new THREE.Mesh(new THREE.TorusGeometry(.35 + index * .05, .028, 5, 14, Math.PI * 1.35), ropeMaterial);
      const ropeX = -30.8 + index * .32;
      const ropeZ = .25 + (index % 2) * .2;
      cutRope.position.set(ropeX, GetTerrainHeight(ropeX, ropeZ) + .09, ropeZ);
      cutRope.rotation.x = Math.PI / 2;
      cutRope.rotation.z = index * .7;
      evidence.add(cutRope);
    }

    const shoe = new THREE.Group();
    const sole = CreateBox(.48, .12, .22, 0x3f392f, 1, "cloth");
    sole.position.y = .09;
    const upper = CreateBox(.28, .2, .2, 0x51483a, 1, "cloth");
    upper.position.set(-.08, .19, 0);
    shoe.add(sole, upper);
    SetGroundedPosition(shoe, -40.4, -34.9);
    shoe.rotation.y = -.7;
    evidence.add(shoe);

    EnableShadows(evidence, true, true);
    this.worldRoot.add(evidence);
  }

  BuildLandscape() {
    const exclusionZones = siteDefinitions.map((site) => ({ x: site.x, z: site.z, radius: site.radius + 5 }));
    const treeTransforms = [];
    for (let index = 0; index < 90; index += 1) {
      const angle = index * 2.399963;
      const radius = 12 + (index * 17) % 47;
      const x = Math.cos(angle) * radius + Math.sin(index * 1.9) * 8;
      const z = Math.sin(angle) * radius + Math.cos(index * 1.37) * 7;
      if (exclusionZones.some((zone) => Math.hypot(x - zone.x, z - zone.z) < zone.radius)) continue;
      treeTransforms.push({ x, z, scale: .55 + (index % 5) * .12, rotation: angle });
    }

    const trunkGeometry = new THREE.CylinderGeometry(.18, .28, 2.5, 7);
    const crownGeometry = new THREE.DodecahedronGeometry(1.3, 0);
    const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x4d4533, roughness: 1 });
    const crownMaterial = new THREE.MeshStandardMaterial({ color: 0x404a31, roughness: 1 });
    const trunks = new THREE.InstancedMesh(trunkGeometry, trunkMaterial, treeTransforms.length);
    const crowns = new THREE.InstancedMesh(crownGeometry, crownMaterial, treeTransforms.length);
    const crownSides = new THREE.InstancedMesh(crownGeometry, crownMaterial, treeTransforms.length);
    const transform = new THREE.Object3D();
    treeTransforms.forEach((tree, index) => {
      transform.position.set(tree.x, GetTerrainHeight(tree.x, tree.z) + 1.25 * tree.scale, tree.z);
      transform.rotation.set(0, tree.rotation, 0);
      transform.scale.setScalar(tree.scale);
      transform.updateMatrix();
      trunks.setMatrixAt(index, transform.matrix);
      transform.position.set(tree.x, GetTerrainHeight(tree.x, tree.z) + 3.1 * tree.scale, tree.z);
      transform.scale.setScalar(tree.scale);
      transform.updateMatrix();
      crowns.setMatrixAt(index, transform.matrix);
      const crownX = tree.x + Math.cos(tree.rotation) * .7 * tree.scale;
      const crownZ = tree.z + Math.sin(tree.rotation) * .7 * tree.scale;
      transform.position.set(crownX, GetTerrainHeight(crownX, crownZ) + 3.35 * tree.scale, crownZ);
      transform.scale.set(tree.scale * .76, tree.scale * .82, tree.scale * .76);
      transform.updateMatrix();
      crownSides.setMatrixAt(index, transform.matrix);
    });
    [trunks, crowns, crownSides].forEach((mesh) => {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.needsUpdate = true;
      this.worldRoot.add(mesh);
    });

    const cropMaterial = new THREE.MeshStandardMaterial({ color: 0x8f8950, roughness: 1 });
    const cropGeometry = new THREE.ConeGeometry(.08, .75, 4);
    const cropCount = 4 * 7 * 12;
    const crops = new THREE.InstancedMesh(cropGeometry, cropMaterial, cropCount);
    let cropIndex = 0;
    for (let fieldIndex = 0; fieldIndex < 4; fieldIndex += 1) {
      const baseX = [-43, -16, 17, 36][fieldIndex];
      const baseZ = [-10, -20, 4, 18][fieldIndex];
      for (let row = 0; row < 7; row += 1) {
        for (let column = 0; column < 12; column += 1) {
          const cropX = baseX + column * .72;
          const cropZ = baseZ + row * .72;
          transform.position.set(cropX, GetTerrainHeight(cropX, cropZ) + .36, cropZ);
          transform.rotation.set(0, 0, (column % 3 - 1) * .05);
          transform.scale.set(1, 1, 1);
          transform.updateMatrix();
          crops.setMatrixAt(cropIndex, transform.matrix);
          cropIndex += 1;
        }
      }
    }

    crops.receiveShadow = true;
    crops.instanceMatrix.needsUpdate = true;
    this.worldRoot.add(crops);

    const rockGeometry = new THREE.DodecahedronGeometry(1, 0);
    const rockMaterial = new THREE.MeshStandardMaterial({ color: 0x676858, roughness: 1 });
    const rocks = new THREE.InstancedMesh(rockGeometry, rockMaterial, 24);
    for (let index = 0; index < 24; index += 1) {
      const scale = .35 + (index % 5) * .15;
      const rockX = -52 + (index * 19) % 104;
      const rockZ = -50 + (index * 31) % 100;
      transform.position.set(rockX, GetTerrainHeight(rockX, rockZ) + .2, rockZ);
      transform.rotation.set(0, index, 0);
      transform.scale.set(scale, scale * .45, scale);
      transform.updateMatrix();
      rocks.setMatrixAt(index, transform.matrix);
    }
    rocks.receiveShadow = true;
    rocks.instanceMatrix.needsUpdate = true;
    this.worldRoot.add(rocks);
  }

  BuildBlockade() {
    const group = new THREE.Group();
    for (let index = -5; index <= 5; index += 1) {
      const post = CreateBox(.22, 1.9, .22, 0x4a4639);
      post.position.set(index * 5.2, .95, 0);
      group.add(post);
    }
    for (let line = 0; line < 3; line += 1) {
      const wire = CreateBox(54, .04, .04, 0x777468);
      wire.position.set(0, .55 + line * .5, 0);
      group.add(wire);
    }
    const tower = new THREE.Group();
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([x, z]) => {
      const leg = CreateBox(.18, 6, .18, 0x47483e);
      leg.position.set(x, 3, z);
      leg.rotation.z = x * -.05;
      tower.add(leg);
    });
    const platform = CreateBox(3.2, .25, 3.2, 0x4f5044);
    platform.position.y = 5.5;
    const roof = new THREE.Mesh(
      new THREE.ConeGeometry(2.6, 1.3, 4),
      new THREE.MeshStandardMaterial({ color: 0x34362e, roughness: 1 }),
    );
    roof.position.y = 7;
    roof.rotation.y = Math.PI / 4;
    tower.add(platform, roof);
    tower.position.set(9, 0, 0);
    group.add(tower);
    SetGroundedPosition(group, 13, -3);
    group.rotation.y = -.24;
    this.worldRoot.add(group);

    const beamGeometry = new THREE.ConeGeometry(5.6, 32, 24, 1, true);
    beamGeometry.translate(0, -16, 0);
    beamGeometry.rotateX(Math.PI / 2);
    const beamMaterial = new THREE.MeshBasicMaterial({ color: 0xffe6ac, transparent: true, opacity: .075, depthWrite: false, side: THREE.DoubleSide });
    this.blockadeBeam = new THREE.Mesh(beamGeometry, beamMaterial);
    this.blockadeBeam.position.set(15, 6, -4);
    this.blockadeBeam.rotation.y = -.6;
    this.scene.add(this.blockadeBeam);
  }

  BuildWaterwayBlockade() {
    const group = new THREE.Group();
    waterwayBlockadeDefinitions.forEach((definition, index) => {
      const barricade = new THREE.Group();
      for (let postIndex = -2; postIndex <= 2; postIndex += 1) {
        const post = CreateBox(.18, 1.65, .18, 0x4b4030, 1, "wood");
        post.position.set(postIndex * .72, .82, 0);
        post.rotation.z = postIndex % 2 ? .14 : -.14;
        barricade.add(post);
      }
      const beam = CreateBox(3.8, .18, .22, 0x5b4932, 1, "wood");
      beam.position.y = .88;
      beam.rotation.z = index % 2 ? .08 : -.08;
      barricade.add(beam);
      SetGroundedPosition(barricade, definition.x, definition.z);
      barricade.rotation.y = -.38;
      group.add(barricade);
    });
    const warning = CreateLabel("新设岗哨 · 原水渠已封", { scale: 5.8, fontSize: 22, color: "#ffd8bd", background: "rgba(88,29,23,.88)", border: "rgba(220,95,69,.7)" });
    warning.position.set(9, GetTerrainHeight(9, 24.2) + 3.2, 24.2);
    group.add(warning);
    group.visible = false;
    this.waterwayBlockadeGroup = group;
    this.worldRoot.add(group);
  }

  BuildHideSite(site) {
    const group = new THREE.Group();
    if (site.id === "northDitch") {
      const ditch = new THREE.Mesh(new THREE.PlaneGeometry(9, 5.2), new THREE.MeshStandardMaterial({ color: 0x303a2c, roughness: 1 }));
      ditch.rotation.x = -Math.PI / 2;
      ditch.position.y = .04;
      group.add(ditch);
      [-2.35, 2.35].forEach((z) => {
        const bank = CreateBox(9.4, .5, .7, 0x4d513a, 1, "earth");
        bank.position.set(0, .14, z);
        bank.rotation.y = .03 * z;
        group.add(bank);
      });
      for (let index = 0; index < 7; index += 1) {
        const root = new THREE.Mesh(new THREE.CylinderGeometry(.055, .08, 1.4 + index * .08, 6), CreateMaterial(0x67563c, 1, "wood"));
        root.rotation.z = Math.PI / 2;
        root.rotation.y = -.2 + index * .07;
        root.position.set(-3.2 + index * 1.05, .13, -.65 + (index % 3) * .62);
        group.add(root);
      }
      for (let index = 0; index < 18; index += 1) {
        const reed = CreateBox(.045, 1.25 + index % 4 * .18, .045, index % 3 ? 0x6c754d : 0x8a7c47, 1, "thatch");
        reed.position.set(-4 + index * .47, .6, index % 2 ? 2.05 : -2.05);
        reed.rotation.z = -.08 + index % 3 * .08;
        group.add(reed);
      }
    } else if (site.id === "dryWell") {
      const well = new THREE.Mesh(
        new THREE.CylinderGeometry(1.5, 1.6, 1.1, 14, 1, true),
        new THREE.MeshStandardMaterial({ color: 0x5b594b, roughness: 1, side: THREE.DoubleSide }),
      );
      well.position.y = .55;
      group.add(well);
    } else {
      for (let index = 0; index < 3; index += 1) {
        const stack = new THREE.Mesh(
          new THREE.CylinderGeometry(1.25 - index * .18, 1.5 - index * .15, 1.2, 12),
          new THREE.MeshStandardMaterial({ color: 0x9b864b, roughness: 1 }),
        );
        stack.position.y = .55 + index * .82;
        group.add(stack);
      }
    }
    SetGroundedPosition(group, site.x, site.z);
    this.worldRoot.add(group);
    this.siteVisuals.set(site.id, group);
  }

  EnsurePatrols(state) {
    state.patrols.forEach((patrol) => {
      if (this.patrolMeshes.has(patrol.id)) return;
      const group = new THREE.Group();
      for (let index = 0; index < 2; index += 1) {
        const person = CreatePerson({ bodyColor: 0x77704d, trouserColor: 0x4b4938, headwear: "helmet", helmetColor: 0x676344 });
        person.position.x = (index - .5) * 1.15;
        person.scale.setScalar(.94);
        group.add(person);
      }
      const rifle = CreateBox(.12, 1.65, .12, 0x34322a);
      rifle.rotation.z = -.5;
      rifle.position.set(.85, 1.45, .1);
      group.add(rifle);
      const meterBackground = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0x211c18, transparent: true, opacity: .78, depthTest: false }));
      meterBackground.position.set(0, 3.45, 0);
      meterBackground.scale.set(1.7, .16, 1);
      const meterFill = new THREE.Sprite(new THREE.SpriteMaterial({ color: 0xd5a04a, transparent: true, opacity: .95, depthTest: false }));
      meterFill.position.set(-.77, 3.45, .01);
      meterFill.scale.set(.01, .1, 1);
      meterFill.visible = false;
      group.add(meterBackground, meterFill);
      group.userData.detectionBackground = meterBackground;
      group.userData.detectionFill = meterFill;
      this.worldRoot.add(group);
      this.patrolMeshes.set(patrol.id, group);

      const coneGeometry = new THREE.CircleGeometry(
        patrolVision.distance,
        28,
        Math.PI / 2 - patrolVision.angle,
        patrolVision.angle * 2,
      );
      coneGeometry.rotateX(Math.PI / 2);
      const cone = new THREE.Mesh(
        coneGeometry,
        new THREE.MeshBasicMaterial({ color: 0xb74735, transparent: true, opacity: .13, depthWrite: false, side: THREE.DoubleSide }),
      );
      cone.position.y = .09;
      this.worldRoot.add(cone);
      this.patrolCones.set(patrol.id, cone);
    });
  }

  UpdateCharacterAnimation(group, moving, time, phase = 0) {
    const parts = group.userData.parts;
    if (!parts) return;
    const swing = this.reducedMotion ? 0 : moving ? Math.sin(time * 9 + phase) * .52 : Math.sin(time * 1.5 + phase) * .025;
    parts.leftLeg.rotation.x = swing;
    parts.rightLeg.rotation.x = -swing;
    parts.leftArm.rotation.x = -swing * .7;
    parts.rightArm.rotation.x = swing * .7;
    parts.body.position.y = 1.55 + (!this.reducedMotion && moving ? Math.abs(Math.sin(time * 9 + phase)) * .035 : 0);
    parts.body.rotation.x = 0;
    parts.body.rotation.z = 0;
  }

  ApplyInteractionPose(group, interaction) {
    if (!interaction || !group.userData.parts) return;
    const parts = group.userData.parts;
    const pulse = this.reducedMotion ? 0 : Math.sin(this.clockTime * 3.4) * .09;
    const type = siteDefinitionById.get(interaction.siteId)?.type || (interaction.civilianId ? "recoverCivilian" : "");
    if (["memory", "medicine", "roster", "radioPart"].includes(type)) {
      parts.body.position.y = 1.28;
      parts.body.rotation.x = .28;
      parts.leftArm.rotation.x = -1.08 + pulse;
      parts.rightArm.rotation.x = -1.18 - pulse;
    } else if (["village", "recoverCivilian"].includes(type)) {
      parts.body.rotation.x = .16;
      parts.leftArm.rotation.x = -1.35 + pulse;
      parts.rightArm.rotation.x = -1.35 - pulse;
    } else if (["grain", "radio"].includes(type)) {
      parts.body.rotation.x = .12;
      parts.leftArm.rotation.x = -.92 + pulse;
      parts.rightArm.rotation.x = -1.12 - pulse;
    } else if (type === "door") {
      parts.body.rotation.x = .2;
      parts.leftArm.rotation.x = -.5;
      parts.rightArm.rotation.x = -1.5 + pulse;
    } else if (type === "exit") {
      parts.leftArm.rotation.x = -.65 + pulse;
      parts.rightArm.rotation.x = -.65 - pulse;
    }
  }

  Update(state, deltaSeconds) {
    this.clockTime += deltaSeconds;
    this.UpdateVisualPalette(state.act, state.finalPressure, deltaSeconds);
    this.sun.position.set(state.player.x - 58, 30, state.player.z - 45);
    this.sun.target.position.set(state.player.x, 0, state.player.z);
    this.sun.target.updateMatrixWorld();
    if (this.dustPoints && !this.reducedMotion) this.dustPoints.rotation.y += deltaSeconds * .006;
    this.farSmokeSprites.forEach((smoke) => {
      smoke.visible = !smoke.userData.villageSmoke || ["burned", "evacuatedBurned"].includes(state.villageState);
      if (!this.reducedMotion && smoke.visible) smoke.position.x = smoke.userData.baseX + Math.sin(this.clockTime * .12 + smoke.userData.phase) * 1.3;
    });
    this.EnsurePatrols(state);
    const playerMoved = Math.hypot(state.player.x - this.previousPlayerPosition.x, state.player.z - this.previousPlayerPosition.z) > .002;
    SetGroundedPosition(this.playerMesh, state.player.x, state.player.z);
    this.previousPlayerPosition.set(state.player.x, 0, state.player.z);
    this.playerMesh.rotation.y = state.player.yaw;
    this.playerMesh.visible = true;
    SetGroundedPosition(this.playerHalo, state.player.x, state.player.z, .11);
    this.playerHalo.material.opacity = state.player.hidden ? .25 : .65;
    this.UpdateCharacterAnimation(this.playerMesh, playerMoved, this.clockTime);
    this.ApplyInteractionPose(this.playerMesh, state.activeInteraction);
    if (state.player.hidden) {
      const parts = this.playerMesh.userData.parts;
      parts.body.rotation.x = .36;
      parts.leftLeg.rotation.x = -.52;
      parts.rightLeg.rotation.x = -.62;
      parts.leftArm.rotation.x = -.72;
      parts.rightArm.rotation.x = -.9;
      parts.head.rotation.y = -.28;
    }
    if (this.doorShotSeconds > 0) {
      const parts = this.playerMesh.userData.parts;
      this.playerMesh.rotation.y = Math.atan2(-7 - state.player.x, 33.15 - state.player.z);
      parts.body.rotation.x = .24;
      parts.rightArm.rotation.x = -1.48;
      parts.rightArm.rotation.z = .18;
      parts.leftArm.rotation.x = -.55;
      parts.head.rotation.y = .16;
    }
    if (state.signalsConfirmed !== this.lastSignalsConfirmed) {
      if (state.signalsConfirmed === 3 && state.signalsConfirmed > this.lastSignalsConfirmed) this.signalFlashSeconds = this.reducedMotion ? 3.2 : 4.2;
      this.lastSignalsConfirmed = state.signalsConfirmed;
    }
    this.signalFlashSeconds = Math.max(0, this.signalFlashSeconds - deltaSeconds);
    if (this.signalLamp && this.signalLampLight) {
      const lampOn = this.signalFlashSeconds > 0 && (this.reducedMotion || Math.sin(this.clockTime * 9.5) > -.18);
      this.signalLamp.material.emissiveIntensity = lampOn ? 3.4 : .06;
      this.signalLampLight.intensity = lampOn ? 3.2 : 0;
    }

    this.civilianMeshes.forEach((mesh, index) => {
      const civilian = state.civilians[index];
      mesh.visible = civilian && ["following", "seized", "evacuated"].includes(civilian.state);
      if (!mesh.visible) return;
      mesh.userData.distressMarker.visible = civilian.state === "seized";
      mesh.userData.restraint.visible = civilian.state === "seized";
      mesh.userData.nameMarker.visible = civilian.state === "seized" || !state.ended && GetDistance(state.player, civilian) < 9;
      if (civilian.state === "seized") {
        SetGroundedPosition(mesh, civilian.x, civilian.z);
        this.UpdateCharacterAnimation(mesh, false, this.clockTime, index * .8);
        const parts = mesh.userData.parts;
        parts.leftArm.rotation.x = .82;
        parts.rightArm.rotation.x = .82;
        parts.body.rotation.x = .18;
        mesh.rotation.z = -.11;
        return;
      }
      const smoothing = 1 - Math.exp(-deltaSeconds * (3.2 - index * .16));
      const previousX = mesh.position.x;
      const previousZ = mesh.position.z;
      mesh.position.x = Lerp(mesh.position.x || civilian.x, civilian.x, smoothing);
      mesh.position.z = Lerp(mesh.position.z || civilian.z, civilian.z, smoothing);
      mesh.position.y = Lerp(mesh.position.y, GetTerrainHeight(mesh.position.x, mesh.position.z), smoothing);
      const moved = Math.hypot(mesh.position.x - previousX, mesh.position.z - previousZ) > .001;
      if (moved) mesh.rotation.y = Math.atan2(mesh.position.x - previousX, mesh.position.z - previousZ);
      this.UpdateCharacterAnimation(mesh, moved, this.clockTime, index * .8);
      if (civilian.hidden) {
        const parts = mesh.userData.parts;
        parts.body.rotation.x = index === 1 ? .48 : .34;
        parts.leftLeg.rotation.x = -.48 - index * .025;
        parts.rightLeg.rotation.x = -.58;
        parts.leftArm.rotation.x = index === 0 || index === 4 ? -1.05 : -.68;
        parts.rightArm.rotation.x = index === 0 || index === 4 ? -.82 : -.72;
        parts.head.rotation.y = index % 2 ? .3 : -.3;
      } else if (state.act === 3) {
        const parts = mesh.userData.parts;
        if (index === 2 && state.signalsConfirmed >= 1) {
          parts.head.rotation.y = -.52;
          parts.rightArm.rotation.x = -1.18;
        } else if (index === 0 && state.signalsConfirmed >= 2) {
          parts.leftArm.rotation.x = -.92;
          parts.rightArm.rotation.x = -.62;
          parts.head.rotation.y = .35;
        } else if (index === 1 && state.signalsConfirmed >= 3) {
          parts.body.rotation.x = .28;
          parts.leftArm.rotation.x = -.78;
          parts.rightArm.rotation.x = -.42;
        }
      }
      mesh.rotation.z = civilian.wounded ? -.08 : 0;
    });

    if (this.liaisonMesh) {
      this.liaisonMesh.visible = state.liaison.visible;
      this.liaisonMesh.userData.nameMarker.visible = !state.ended && Math.hypot(this.liaisonMesh.position.x - state.player.x, this.liaisonMesh.position.z - state.player.z) < 11;
      if (state.liaison.state === "evacuating") {
        const targetX = state.player.x - Math.sin(state.player.yaw) * 4.6;
        const targetZ = state.player.z - Math.cos(state.player.yaw) * 4.6;
        this.liaisonMesh.position.x = Lerp(this.liaisonMesh.position.x, targetX, 1 - Math.exp(-deltaSeconds * 2.4));
        this.liaisonMesh.position.z = Lerp(this.liaisonMesh.position.z, targetZ, 1 - Math.exp(-deltaSeconds * 2.4));
        this.liaisonMesh.position.y = Lerp(this.liaisonMesh.position.y, GetTerrainHeight(this.liaisonMesh.position.x, this.liaisonMesh.position.z), 1 - Math.exp(-deltaSeconds * 3));
        this.liaisonMesh.rotation.y = state.player.yaw;
        this.UpdateCharacterAnimation(this.liaisonMesh, true, this.clockTime, 1.2);
      } else {
        SetGroundedPosition(this.liaisonMesh, state.liaison.x, state.liaison.z);
        const parts = this.liaisonMesh.userData.parts;
        if (parts) {
          parts.body.rotation.z = -.09;
          const repairMotion = this.reducedMotion ? 0 : Math.sin(this.clockTime * 2.3) * .12;
          parts.leftArm.rotation.x = -.75 + repairMotion;
          parts.rightArm.rotation.x = -.92 - repairMotion;
        }
      }
    }

    if (state.stationClosed && !this.lastStationClosed) {
      this.lastStationClosed = true;
      this.doorShotDuration = this.reducedMotion ? 1.1 : 4.8;
      this.doorShotSeconds = this.doorShotDuration;
      this.cameraYaw = 3.15;
      this.cameraPitch = .4;
      this.cinematicPause = true;
      state.paused = true;
      elements.gameShell.classList.add("cinematicMode");
    }
    const doorReachDelay = Math.min(.35, this.doorShotDuration * .25);
    const doorCanClose = state.stationClosed && (this.doorShotSeconds <= 0 || this.doorShotSeconds <= this.doorShotDuration - doorReachDelay);
    if (this.relayDoor) this.relayDoor.rotation.y = Lerp(this.relayDoor.rotation.y, doorCanClose ? 0 : -1.08, 1 - Math.exp(-deltaSeconds * 4.8));
    const hadDoorShot = this.doorShotSeconds > 0;
    this.doorShotSeconds = Math.max(0, this.doorShotSeconds - deltaSeconds);
    this.endingShotSeconds = Math.max(0, this.endingShotSeconds - deltaSeconds);
    if (hadDoorShot && this.doorShotSeconds <= 0 && this.cinematicPause) {
      this.cinematicPause = false;
      if (!state.ended && !currentModal) state.paused = false;
      if (this.endingShotSeconds <= 0) elements.gameShell.classList.remove("cinematicMode");
    }

    state.patrols.forEach((patrol, index) => {
      const mesh = this.patrolMeshes.get(patrol.id);
      SetGroundedPosition(mesh, patrol.x, patrol.z);
      mesh.rotation.y = patrol.yaw;
      const detectionRatio = Clamp(patrol.detection / patrolVision.pursuitThreshold, 0, 1);
      const detectionFill = mesh.userData.detectionFill;
      const detectionBackground = mesh.userData.detectionBackground;
      detectionFill.visible = detectionRatio > .025;
      detectionBackground.visible = detectionRatio > .025;
      detectionFill.scale.x = Math.max(.01, 1.55 * detectionRatio);
      detectionFill.position.x = -.775 + detectionFill.scale.x / 2;
      detectionFill.material.color.setHex(detectionRatio >= 1 ? 0xe4523d : detectionRatio >= .46 ? 0xd9823e : 0xd5b05a);
      mesh.children.forEach((child, childIndex) => {
        if (child.userData.parts) this.UpdateCharacterAnimation(child, patrol.mode !== "suspicious", this.clockTime, index + childIndex);
      });
      const cone = this.patrolCones.get(patrol.id);
      SetGroundedPosition(cone, patrol.x, patrol.z, .08);
      cone.rotation.y = patrol.yaw;
      cone.scale.setScalar(1);
      cone.material.opacity = patrol.alerted ? .28 : patrol.mode === "investigate" ? .2 : patrol.mode === "suspicious" ? .15 : .1;
      cone.material.color.setHex(patrol.alerted ? 0xff3e2d : patrol.mode === "patrol" ? 0xb74735 : 0xd69b45);
    });

    const guidanceTargetId = GetGuidanceTarget(state)?.id;
    this.siteMarkers.forEach((marker, id) => {
      const site = siteDefinitionById.get(id);
      const used = Boolean(state.usedSites[id]) ||
        (site.type === "village" && state.rescued > 0) ||
        (site.type === "radioPart" && state.radioPart) ||
        (site.type === "radio" && state.radioRepaired);
      const detourActive = id === "northDitch" && state.waterwayBlocked && !state.waterwayDetourFound;
      const unlocked = site.act === state.act || (site.type === "radio" && state.act === 3) || detourActive;
      const repeatingRadio = site.type === "radio" && state.act === 3 && state.signalsConfirmed < 3;
      marker.visible = unlocked && (repeatingRadio || !used || site.type === "exit");
      if (!this.reducedMotion) marker.userData.ring.rotation.z += deltaSeconds * .8;
      marker.userData.ring.material.opacity = this.reducedMotion ? .65 : .55 + Math.sin(this.clockTime * 2.4) * .2;
      marker.userData.beam.scale.y = this.reducedMotion ? 1 : .85 + Math.sin(this.clockTime * 1.7) * .15;
      const distance = GetDistance(state.player, site);
      marker.children.forEach((child) => {
        if (child.isSprite) child.visible = distance < 15 || id === guidanceTargetId;
      });
    });
    if (this.grainDepotSign) this.grainDepotSign.visible = GetDistance(state.player, siteDefinitionById.get("grainDepot")) < 18;

    const villageVisual = this.siteVisuals.get("wujiaVillage");
    villageVisual.tiedVillagers.visible = state.rescued <= 0 && state.villageState !== "burned";
    if (["burned", "evacuatedBurned"].includes(state.villageState) && !villageVisual.burned) {
      villageVisual.burned = true;
      const burnedHouse = villageVisual.houses[0];
      burnedHouse.children.forEach((child, index) => {
        if (child.isMesh && child.material?.color) child.material.color.setHex(index === 1 ? 0x24251f : 0x48443a);
      });
      if (burnedHouse.children[1]) burnedHouse.children[1].rotation.z = .32;
      const fire = CreateFire(1.2);
      SetGroundedPosition(fire, -33.8, -5.7);
      this.fireGroups.push(fire);
      this.worldRoot.add(fire);
    }

    if (!this.reducedMotion) this.fireGroups.forEach((fire, fireIndex) => {
      fire.children.forEach((child) => {
        if (child.userData.phase !== undefined) {
          child.scale.y = .82 + Math.sin(this.clockTime * 7 + child.userData.phase + fireIndex) * .2;
          child.material.opacity = .68 + Math.sin(this.clockTime * 5 + child.userData.phase) * .15;
        }
        if (child.userData.smokePhase !== undefined) {
          const cycle = (this.clockTime * .32 + child.userData.smokePhase) % 2.8;
          child.position.y = child.userData.smokeBaseY + cycle * .75;
          child.material.opacity = Math.max(0, .32 - cycle * .09);
          child.rotation.y += deltaSeconds * .18;
        }
      });
    });

    if (this.blockadeBeam) {
      this.blockadeBeam.rotation.y = this.reducedMotion ? -.1 : -.55 + Math.sin(this.clockTime * .24) * 1.1;
      this.blockadeBeam.material.opacity = state.finalPressure ? .14 : .075;
    }
    if (this.waterwayBlockadeGroup) this.waterwayBlockadeGroup.visible = state.waterwayBlocked;
    this.UpdateCamera(state, deltaSeconds);
    this.renderer.render(this.scene, this.camera);
  }

  UpdateMenu(deltaSeconds) {
    this.clockTime += deltaSeconds;
    this.UpdateVisualPalette(1, false, deltaSeconds);
    const orbit = this.reducedMotion ? 0 : this.clockTime * .035;
    this.camera.position.set(-37 + Math.sin(orbit) * 8, 13, -52 + Math.cos(orbit) * 5);
    this.camera.lookAt(-32, 1.5, -8);
    if (!this.reducedMotion) this.fireGroups.forEach((fire, fireIndex) => {
      fire.children.forEach((child) => {
        if (child.userData.phase !== undefined) child.scale.y = .85 + Math.sin(this.clockTime * 7 + child.userData.phase + fireIndex) * .2;
      });
    });
    if (this.blockadeBeam) this.blockadeBeam.rotation.y = this.reducedMotion ? -.1 : -.5 + Math.sin(this.clockTime * .18) * .8;
    if (this.dustPoints && !this.reducedMotion) this.dustPoints.rotation.y += deltaSeconds * .006;
    this.farSmokeSprites.forEach((smoke) => {
      smoke.visible = !smoke.userData.villageSmoke;
      if (!this.reducedMotion && smoke.visible) smoke.position.x = smoke.userData.baseX + Math.sin(this.clockTime * .12 + smoke.userData.phase) * 1.3;
    });
    this.renderer.render(this.scene, this.camera);
  }

  UpdateCamera(state, deltaSeconds) {
    if (this.doorShotSeconds > 0) {
      const progress = 1 - this.doorShotSeconds / Math.max(.001, this.doorShotDuration);
      this.cameraFocus.set(-7, 1.42 + progress * .45, 33.15);
      this.cameraYaw = 3.15 + Math.sin(progress * Math.PI) * .08;
      this.cameraPitch = Lerp(this.cameraPitch, .38 + progress * .13, 1 - Math.exp(-deltaSeconds * 3));
    } else if (this.endingShotSeconds > 0 && this.endingShotSuccess) {
      const progress = this.reducedMotion ? 1 : 1 - this.endingShotSeconds / Math.max(.001, this.endingShotDuration);
      this.cameraFocus.set(state.player.x - 2.4 + progress * 1.8, 1.7 + progress * 2.7, state.player.z - 2.1);
      if (!this.reducedMotion) this.cameraYaw += deltaSeconds * .075;
      this.cameraPitch = this.reducedMotion ? .84 : Lerp(this.cameraPitch, .68 + progress * .16, 1 - Math.exp(-deltaSeconds * 2.4));
    } else {
      this.cameraFocus.set(state.player.x, 1.65, state.player.z);
    }
    this.cameraTarget.lerp(this.cameraFocus, 1 - Math.exp(-deltaSeconds * (this.doorShotSeconds > 0 ? 3.2 : 7)));
    const endingProgress = this.reducedMotion ? 1 : 1 - this.endingShotSeconds / Math.max(.001, this.endingShotDuration);
    const authoredDistance = this.endingShotSeconds > 0 ? (this.endingShotSuccess ? 18 + endingProgress * 8 : 8.5) : this.doorShotSeconds > 0 ? 6.6 : state.activeInteraction ? 7.7 : state.rescued > 0 ? 12.3 : 10.6;
    this.cameraDistance = Lerp(this.cameraDistance, authoredDistance, 1 - Math.exp(-deltaSeconds * 4));
    const desiredFov = this.endingShotSeconds > 0 ? 47 : this.doorShotSeconds > 0 ? 46 : state.activeInteraction ? 50 : state.act === 3 ? 57 : 54;
    if (Math.abs(this.camera.fov - desiredFov) > .05) {
      this.camera.fov = Lerp(this.camera.fov, desiredFov, 1 - Math.exp(-deltaSeconds * 3));
      this.camera.updateProjectionMatrix();
    }
    let safeDistance = this.cameraDistance;
    const directionX = -Math.sin(this.cameraYaw);
    const directionZ = -Math.cos(this.cameraYaw);
    if (this.doorShotSeconds <= 0 && this.endingShotSeconds <= 0) obstacleDefinitions.forEach((obstacle) => {
      const relativeX = obstacle.x - this.cameraTarget.x;
      const relativeZ = obstacle.z - this.cameraTarget.z;
      const along = relativeX * directionX + relativeZ * directionZ;
      if (along <= 0 || along >= safeDistance) return;
      const side = Math.abs(relativeX * directionZ - relativeZ * directionX);
      if (side < obstacle.radius + .7) safeDistance = Math.max(state.rescued > 0 ? 10 : 8.5, along - obstacle.radius - .8);
    });
    const horizontalDistance = Math.cos(this.cameraPitch) * safeDistance;
    this.cameraDesired.set(
      this.cameraTarget.x + directionX * horizontalDistance,
      this.cameraTarget.y + Math.sin(this.cameraPitch) * safeDistance,
      this.cameraTarget.z + directionZ * horizontalDistance,
    );
    this.cameraRayDirection.copy(this.cameraDesired).sub(this.cameraTarget);
    const rayDistance = this.cameraRayDirection.length();
    this.cameraRayDirection.normalize();
    this.cameraRaycaster.set(this.cameraTarget, this.cameraRayDirection);
    this.cameraRaycaster.far = rayDistance;
    const obscured = new Set(this.cameraRaycaster.intersectObjects(this.cameraOccluders, false).map((hit) => hit.object));
    this.cameraOccluders.forEach((mesh) => {
      const targetOpacity = obscured.has(mesh) ? .16 : 1;
      mesh.material.opacity = Lerp(mesh.material.opacity, targetOpacity, 1 - Math.exp(-deltaSeconds * 10));
      mesh.material.depthWrite = mesh.material.opacity > .82;
    });
    this.camera.position.lerp(this.cameraDesired, 1 - Math.exp(-deltaSeconds * 8));
    this.camera.lookAt(this.cameraTarget);
  }

  RotateCamera(deltaX, deltaY) {
    this.cameraYaw -= deltaX * .006;
    this.cameraPitch = Clamp(this.cameraPitch + deltaY * .0045, .28, .85);
  }

  GetMovementAxes() {
    const forward = { x: Math.sin(this.cameraYaw), z: Math.cos(this.cameraYaw) };
    const right = { x: -Math.cos(this.cameraYaw), z: Math.sin(this.cameraYaw) };
    let forwardInput = 0;
    let rightInput = 0;
    if (inputState.keys.has("KeyW") || inputState.keys.has("ArrowUp")) forwardInput += 1;
    if (inputState.keys.has("KeyS") || inputState.keys.has("ArrowDown")) forwardInput -= 1;
    if (inputState.keys.has("KeyD") || inputState.keys.has("ArrowRight")) rightInput += 1;
    if (inputState.keys.has("KeyA") || inputState.keys.has("ArrowLeft")) rightInput -= 1;
    forwardInput += -inputState.touchY;
    rightInput += inputState.touchX;
    return {
      moveX: forward.x * forwardInput + right.x * rightInput,
      moveZ: forward.z * forwardInput + right.z * rightInput,
    };
  }

  Resize() {
    const width = Math.max(1, innerWidth);
    const height = Math.max(1, innerHeight);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }
}

const worldRenderer = new WorldRenderer(elements.canvas);
const soundscape = new ProceduralSoundscape(elements.audioButton);

function FormatTime(seconds) {
  const safeSeconds = Math.max(0, Math.ceil(seconds));
  return `${String(Math.floor(safeSeconds / 60)).padStart(2, "0")}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

function EscapeHtml(value) {
  return String(value).replace(/[&<>"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[character]);
}

function ShowCaption(event) {
  elements.captionTitle.textContent = event.title;
  elements.captionText.textContent = event.body;
  elements.narrativeCaption.classList.remove("hidden");
  captionActive = true;
  captionTimeout = setTimeout(() => {
    elements.narrativeCaption.classList.add("hidden");
    captionActive = false;
    setTimeout(PlayNextCaption, 260);
  }, event.tone === "loss" ? 6100 : 4800);
}

function PlayNextCaption() {
  if (captionActive || !captionQueue.length) return;
  ShowCaption(captionQueue.shift());
}

function ProcessEvents(state) {
  const newEvents = state.events.filter((event) => event.id > lastEventId);
  if (!newEvents.length) return;
  newEvents.forEach((event) => {
    lastEventId = Math.max(lastEventId, event.id);
    captionQueue.push(event);
  });
  PlayNextCaption();
  elements.screenReaderStatus.textContent = newEvents.map((event) => `${event.title}。${event.body}`).join(" ");
  const recentEvents = state.events.slice(-3).reverse();
  elements.eventLog.innerHTML = recentEvents.map((event) => `
    <article class="eventCard ${EscapeHtml(event.tone)}">
      <strong>${EscapeHtml(event.title)}</strong>
      <small>${EscapeHtml(event.body)}</small>
    </article>
  `).join("");
}

function UpdateObjectives(state) {
  const actLabel = GetActLabel(state);
  const objectives = GetObjectives(state);
  const signature = `${actLabel}|${objectives.map((objective) => `${objective.id}:${objective.complete}:${objective.urgent}:${objective.label}:${objective.detail}`).join("|")}`;
  if (signature === lastObjectiveSignature) return;
  lastObjectiveSignature = signature;
  elements.actLabel.textContent = actLabel;
  elements.objectiveList.innerHTML = objectives.map((objective) => `
    <div class="objectiveItem${objective.complete ? " complete" : ""}${objective.urgent ? " urgent" : ""}">
      <strong>${EscapeHtml(objective.label)}</strong>
      <small>${EscapeHtml(objective.detail)}</small>
    </div>
  `).join("");
}

function GetNearestLocation(state) {
  let nearest = siteDefinitions[0];
  let nearestDistance = Infinity;
  siteDefinitions.forEach((site) => {
    const distance = GetDistance(state.player, site);
    if (distance < nearestDistance) {
      nearest = site;
      nearestDistance = distance;
    }
  });
  if (nearestDistance > 14) return { name: "封锁线间的田野" };
  return nearest;
}

function GetGuidanceTarget(state) {
  const seized = state.civilians.filter((civilian) => civilian.state === "seized").sort((left, right) => GetDistance(state.player, left) - GetDistance(state.player, right))[0];
  if (seized) return { ...seized, name: `回去寻找${seized.name}` };
  const id = state.act === 1
    ? !state.usedSites.ruinedStation ? "ruinedStation" : state.rescued < 5 ? "wujiaVillage" : state.medicine <= 0 ? "fieldClinic" : "grainDepot"
    : state.act === 2
      ? state.grain < 4 ? "grainDepot" : state.waterwayBlocked && !state.waterwayDetourFound ? "northDitch" : !state.usedSites.westContact ? "westContact" : !state.usedSites.eastContact ? "eastContact" : !state.radioPart ? "radioCache" : "relayStation"
      : state.signalsConfirmed < 3 ? "relayStation" : !state.rosterDestroyed ? "rosterTable" : !state.stationClosed ? "stationDoor" : "reedExit";
  return siteDefinitionById.get(id);
}

function UpdateGuidance(state) {
  const target = GetGuidanceTarget(state);
  if (!target) return;
  const deltaX = target.x - state.player.x;
  const deltaZ = target.z - state.player.z;
  const distance = Math.round(Math.hypot(deltaX, deltaZ));
  const sector = (Math.round(Math.atan2(deltaX, deltaZ) / (Math.PI / 4)) + 8) % 8;
  const directionNames = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];
  const arrows = ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"];
  const signature = `${target.name}|${directionNames[sector]}|${distance}`;
  if (signature === lastGuidanceSignature) return;
  lastGuidanceSignature = signature;
  elements.objectiveGuidance.querySelector("strong").textContent = target.name;
  elements.objectiveGuidance.querySelector("small").textContent = `${directionNames[sector]} · ${distance} 米`;
  elements.guidanceArrow.querySelector("b").textContent = arrows[sector];
  elements.guidanceArrow.querySelector("span").textContent = `${target.name} · ${directionNames[sector]} ${distance}米`;
}

function UpdateInterface(state) {
  elements.civilianValue.textContent = String(state.rescued);
  elements.grainValue.textContent = String(state.grain);
  elements.woundedValue.textContent = String(state.wounded);
  elements.alertValue.textContent = String(Math.round(state.alert));
  elements.timeValue.textContent = FormatTime(state.remaining);
  elements.healthFill.style.width = `${state.player.health}%`;
  elements.hopeValue.textContent = String(Math.round(state.hope));
  const followingCivilians = state.civilians.filter((civilian) => civilian.state === "following");
  const hiddenCivilians = followingCivilians.filter((civilian) => civilian.hidden).length;
  elements.conditionText.textContent = state.activeInteraction ? `正在行动 · ${Math.round(state.activeInteraction.progress / state.activeInteraction.duration * 100)}%` : state.player.hidden && followingCivilians.length ? `全队收拢隐蔽 · ${hiddenCivilians}/${followingCivilians.length}` : state.player.hidden ? "隐蔽中 · 呼吸放轻" : state.player.health < 35 ? "伤势严重 · 必须撤离" : state.alert > 70 ? "搜索逼近 · 不要跑上公路" : "带伤行动 · 先救乡亲";
  const locationName = GetNearestLocation(state).name;
  if (locationName !== lastLocationName) {
    lastLocationName = locationName;
    locationNameElement.textContent = locationName;
  }
  UpdateObjectives(state);
  UpdateGuidance(state);
  ProcessEvents(state);

  const nearbySite = FindNearbySite(state);
  const action = GetSiteAction(state, nearbySite);
  const canShowAction = action && (!action.disabled || state.activeInteraction?.siteId === nearbySite?.id);
  elements.interactionPrompt.classList.toggle("hidden", !canShowAction);
  const interactionPromptText = canShowAction ? action.label : "";
  if (interactionPromptText !== lastInteractionPromptText) {
    lastInteractionPromptText = interactionPromptText;
    if (canShowAction) elements.interactionText.textContent = interactionPromptText;
  }
  const maximumDetection = Math.max(0, ...state.patrols.map((patrol) => patrol.detection));
  const alerted = state.patrols.some((patrol) => patrol.alerted);
  elements.detectedWarning.classList.toggle("hidden", maximumDetection < .08 && !alerted);
  const detectionState = alerted ? "已被发现" : maximumDetection >= patrolVision.suspicionThreshold ? "巡逻正在查找动静" : "有人注意到动静";
  const detectionHint = alerted ? "脱离视线或进入草垛 / 枯井" : "立刻离开视锥，怀疑会逐渐消退";
  const detectionSignature = `${detectionState}|${detectionHint}`;
  if (detectionSignature !== lastDetectionSignature) {
    lastDetectionSignature = detectionSignature;
    elements.detectedState.textContent = detectionState;
    elements.detectedHint.textContent = detectionHint;
  }

  if (state.ended && !resultShown) BeginResultSequence(state);
}

function SetGameUiVisible(visible) {
  [elements.topBar, elements.objectivePanel, elements.conditionPanel, elements.eventLog, elements.locationLabel, elements.guidanceArrow, elements.controlHint, elements.touchControls].forEach((element) => element.classList.toggle("hidden", !visible));
  if (!visible) {
    elements.interactionPrompt.classList.add("hidden");
    elements.detectedWarning.classList.add("hidden");
    elements.narrativeCaption.classList.add("hidden");
  }
}

function StartGame() {
  clearTimeout(resultTimer);
  pendingResultState = null;
  soundscape.EnsureStarted();
  worldRenderer.ResetForNewRun();
  gameState = CreateGameState({ difficulty: selectedDifficulty });
  soundscape.ResetForRun(gameState);
  gameMode = "playing";
  resultShown = false;
  lastEventId = 0;
  lastObjectiveSignature = "";
  lastLocationName = "";
  lastGuidanceSignature = "";
  lastInteractionPromptText = "";
  lastDetectionSignature = "";
  clearTimeout(captionTimeout);
  captionQueue = [];
  captionActive = false;
  inputState.keys.clear();
  elements.startScreen.classList.add("hidden");
  CloseModal();
  SetGameUiVisible(true);
  UpdateInterface(gameState);
  elements.canvas.focus({ preventScroll: true });
}

function ReturnToTitle() {
  clearTimeout(resultTimer);
  clearTimeout(captionTimeout);
  pendingResultState = null;
  captionQueue = [];
  captionActive = false;
  elements.narrativeCaption.classList.add("hidden");
  worldRenderer.ResetForNewRun();
  gameMode = "menu";
  gameState = null;
  soundscape.ResetForRun(null);
  resultShown = false;
  CloseModal();
  SetGameUiVisible(false);
  elements.startScreen.classList.remove("hidden");
  elements.startButton.focus({ preventScroll: true });
}

function RestartGame() {
  CloseModal();
  StartGame();
}

function OpenModal(modal, options = {}) {
  if (!modal) return;
  if (!currentModal) modalPreviousFocus = document.activeElement;
  returnModal = options.returnTo || null;
  if (currentModal) currentModal.classList.add("hidden");
  currentModal = modal;
  elements.modalLayer.classList.remove("hidden");
  modal.classList.remove("hidden");
  Array.from(elements.gameShell.children).forEach((child) => {
    if (child === elements.modalLayer || child === elements.screenReaderStatus) return;
    if (!("modalPreviousAriaHidden" in child.dataset)) child.dataset.modalPreviousAriaHidden = child.hasAttribute("aria-hidden") ? child.getAttribute("aria-hidden") : "__none__";
    if (!("modalPreviousInert" in child.dataset)) child.dataset.modalPreviousInert = child.inert ? "1" : "0";
    child.inert = true;
    child.setAttribute("aria-hidden", "true");
  });
  if (gameState && gameMode === "playing") gameState.paused = true;
  requestAnimationFrame(() => modal.querySelector("button, a")?.focus());
}

function CloseModal(options = {}) {
  if (currentModal) currentModal.classList.add("hidden");
  currentModal = null;
  elements.modalLayer.classList.add("hidden");
  Array.from(elements.gameShell.children).forEach((child) => {
    if (child === elements.modalLayer || child === elements.screenReaderStatus) return;
    child.inert = child.dataset.modalPreviousInert === "1";
    if (child.dataset.modalPreviousAriaHidden === "__none__") child.removeAttribute("aria-hidden");
    else if (child.dataset.modalPreviousAriaHidden !== undefined) child.setAttribute("aria-hidden", child.dataset.modalPreviousAriaHidden);
    delete child.dataset.modalPreviousInert;
    delete child.dataset.modalPreviousAriaHidden;
  });
  if (gameState && gameMode === "playing" && !gameState.ended && options.resume !== false) gameState.paused = false;
  const returnFocus = modalPreviousFocus;
  modalPreviousFocus = null;
  if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
  else if (gameMode === "playing") elements.canvas.focus({ preventScroll: true });
}

function CloseArchive() {
  if (returnModal) {
    const target = returnModal;
    returnModal = null;
    OpenModal(target);
  } else {
    CloseModal();
  }
}

function PauseGame() {
  if (gameMode !== "playing" || gameState?.ended) return;
  OpenModal(elements.pauseModal);
}

function BeginResultSequence(state) {
  resultShown = true;
  pendingResultState = state;
  worldRenderer.BeginEndingShot(state);
  elements.guidanceArrow.classList.add("hidden");
  elements.screenReaderStatus.textContent = state.success ? "转移完成。镜头正在确认抵达苇荡的人数。" : "行动中断。即将显示群众撤离报告。";
  resultTimer = setTimeout(() => {
    pendingResultState = null;
    ShowResults(state);
  }, reducedMotionQuery.matches ? 4800 : 6800);
}

function ShowResults(state) {
  elements.gameShell.classList.remove("cinematicMode");
  const evaluation = GetEvaluation(state);
  elements.resultEyebrow.textContent = state.success ? "群众撤离报告 / 行动完成" : "群众撤离报告 / 行动中断";
  elements.resultTitle.textContent = state.success ? "火种越过封锁线" : state.endingId === "peopleMissing" ? "有人抵达，还有名字没回来" : state.endingId === "captured" ? "封锁线吞没了消息" : "合围封闭";
  const latest = state.events[state.events.length - 1];
  elements.resultSummary.textContent = latest?.body || "这次行动已经结束。";
  elements.resultScore.textContent = state.success ? "五人抵达" : state.safe > 0 ? "转移受损" : "转移中断";
  const metrics = [
    ["群众安全", state.safe === 5 ? "5 / 5 完整" : `${state.safe} / 5 · 未完成`],
    ["村际联络", state.contactsPreserved >= 2 ? "接续" : "中断"],
    ["名单保护", state.rosterDestroyed ? "完成" : "未完成"],
    ["隐蔽纪律", evaluation.discipline >= 72 ? "守住" : "暴露"],
    ["药品选择", state.medicineTarget === "zhaoManCang" ? "赵叔得药" : state.medicineTarget === "linYan" ? "林砚得药" : "尚未使用"],
    ["失散名单", state.safe === 5 ? "无人失散" : `${5 - state.safe} 人待寻找`],
  ];
  elements.resultMetrics.innerHTML = metrics.map(([label, value]) => `<div class="resultMetric"><small>${label}</small><strong>${value}</strong></div>`).join("");
  const safeNames = state.civilians.filter((civilian) => civilian.state === "evacuated").map((civilian) => civilian.name);
  const missingNames = state.civilians.filter((civilian) => civilian.state !== "evacuated").map((civilian) => civilian.name);
  elements.resultReflection.textContent = state.success
    ? `${safeNames.join("、")}逐一报了平安。${missingNames.length ? `${missingNames.join("、")}仍需要被寻找。` : "五个人都在。"}共产党员林砚把联络接到下一村。没有“孤胆英雄”，只有普通人用熟悉的沟路、种粮和互助把彼此接了出去。`
    : `侵华日军的封锁截断了这次转移。${state.lost > 0 ? "仍有名字失去消息，" : "仍有人困在村中，"}结算不把他们换算成奖励或扣分；名单只记录谁还需要被寻找。`;
  OpenModal(elements.resultModal, { returnTo: null });
}

function TriggerInteract() {
  if (!gameState || gameState.paused || gameState.ended) return;
  const site = FindNearbySite(gameState);
  if (site && InteractWithSite(gameState, site.id)) UpdateInterface(gameState);
}

function TriggerDistraction() {
  if (!gameState || gameState.paused || gameState.ended) return;
  if (ThrowDistraction(gameState)) {
    elements.screenReaderStatus.textContent = "石块落地，附近巡逻会前往查看。";
  }
}

function TriggerMedicine() {
  if (!gameState || gameState.paused || gameState.ended) return;
  if (gameState.medicine <= 0 || gameState.medicineUsed || gameState.rescued <= 0) {
    elements.screenReaderStatus.textContent = gameState.medicineUsed ? "药已经用过。" : "现在没有可用的药，或乡亲还没有跟上。";
    return;
  }
  OpenModal(elements.medicineModal);
}

function ApplyMedicine(targetId) {
  if (!gameState || !UseMedicine(gameState, targetId)) return;
  CloseModal();
  UpdateInterface(gameState);
}

function HandleKeyDown(event) {
  if (worldRenderer.doorShotSeconds > 0 && !pendingResultState) {
    event.preventDefault();
    return;
  }
  if (pendingResultState && ["Escape", "Enter", "Space"].includes(event.code)) {
    event.preventDefault();
    clearTimeout(resultTimer);
    const state = pendingResultState;
    pendingResultState = null;
    ShowResults(state);
    return;
  }
  if (currentModal && event.code === "Tab") {
    const focusable = Array.from(currentModal.querySelectorAll("button:not([disabled]), a[href], [tabindex]:not([tabindex='-1'])")).filter((element) => !element.classList.contains("hidden"));
    if (focusable.length) {
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    return;
  }
  const gameplayKey = ["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "ShiftLeft", "ShiftRight", "Space", "KeyE", "KeyH"].includes(event.code);
  if (gameplayKey && gameMode === "playing" && !currentModal) event.preventDefault();
  if (event.code === "Escape") {
    if (currentModal === elements.historyModal) CloseArchive();
    else if (currentModal === elements.resultModal) ReturnToTitle();
    else if (currentModal) CloseModal();
    else PauseGame();
    return;
  }
  if (currentModal) return;
  if (gameMode === "menu" && event.code === "Enter") {
    StartGame();
    return;
  }
  inputState.keys.add(event.code);
  if (event.repeat) return;
  if (event.code === "KeyE") TriggerInteract();
  if (event.code === "Space") TriggerDistraction();
  if (event.code === "KeyH") TriggerMedicine();
}

function HandleKeyUp(event) {
  inputState.keys.delete(event.code);
}

function UpdateTouchStick(event) {
  const bounds = elements.moveStick.getBoundingClientRect();
  const centerX = bounds.left + bounds.width / 2;
  const centerY = bounds.top + bounds.height / 2;
  const maximum = bounds.width * .34;
  const deltaX = event.clientX - centerX;
  const deltaY = event.clientY - centerY;
  const distance = Math.max(1, Math.hypot(deltaX, deltaY));
  const scale = Math.min(maximum, distance) / distance;
  const x = deltaX * scale;
  const y = deltaY * scale;
  inputState.touchX = x / maximum;
  inputState.touchY = y / maximum;
  elements.moveStick.querySelector("i").style.transform = `translate(${x}px, ${y}px)`;
}

function ReleaseTouchStick(event) {
  if (event.pointerId !== inputState.stickPointerId) return;
  inputState.stickPointerId = null;
  inputState.touchX = 0;
  inputState.touchY = 0;
  elements.moveStick.querySelector("i").style.transform = "translate(0,0)";
}

function HandleCanvasPointerDown(event) {
  if (pendingResultState) {
    event.preventDefault();
    clearTimeout(resultTimer);
    const state = pendingResultState;
    pendingResultState = null;
    ShowResults(state);
    return;
  }
  if (gameMode !== "playing" || currentModal || worldRenderer.doorShotSeconds > 0) return;
  if (event.pointerType === "touch" && event.clientX < innerWidth * .45) return;
  inputState.cameraPointerId = event.pointerId;
  inputState.cameraLastX = event.clientX;
  inputState.cameraLastY = event.clientY;
  elements.canvas.setPointerCapture(event.pointerId);
}

function HandleCanvasPointerMove(event) {
  if (event.pointerId !== inputState.cameraPointerId) return;
  const deltaX = event.clientX - inputState.cameraLastX;
  const deltaY = event.clientY - inputState.cameraLastY;
  inputState.cameraLastX = event.clientX;
  inputState.cameraLastY = event.clientY;
  worldRenderer.RotateCamera(deltaX, deltaY);
}

function HandleCanvasPointerUp(event) {
  if (event.pointerId === inputState.cameraPointerId) inputState.cameraPointerId = null;
}

function ResetInput() {
  inputState.keys.clear();
  inputState.touchX = 0;
  inputState.touchY = 0;
  inputState.cameraPointerId = null;
  inputState.stickPointerId = null;
  elements.moveStick.querySelector("i").style.transform = "translate(0,0)";
}

function WireInterface() {
  elements.startButton.addEventListener("click", StartGame);
  elements.startHistoryButton.addEventListener("click", () => OpenModal(elements.historyModal));
  elements.historyButton.addEventListener("click", () => OpenModal(elements.historyModal));
  elements.pauseHistoryButton.addEventListener("click", () => OpenModal(elements.historyModal, { returnTo: elements.pauseModal }));
  elements.resultHistoryButton.addEventListener("click", () => OpenModal(elements.historyModal, { returnTo: elements.resultModal }));
  elements.pauseButton.addEventListener("click", PauseGame);
  elements.audioButton.addEventListener("click", () => soundscape.Toggle());
  elements.resumeButton.addEventListener("click", () => CloseModal());
  elements.restartButton.addEventListener("click", RestartGame);
  elements.medicineZhaoButton.addEventListener("click", () => ApplyMedicine("zhaoManCang"));
  elements.medicineLinButton.addEventListener("click", () => ApplyMedicine("linYan"));
  elements.medicineCancelButton.addEventListener("click", () => CloseModal());
  elements.resultRestartButton.addEventListener("click", RestartGame);
  elements.resultReturnTitleButton.addEventListener("click", ReturnToTitle);
  elements.returnTitleButton.addEventListener("click", ReturnToTitle);
  document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", CloseArchive));
  document.querySelectorAll("[data-difficulty]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedDifficulty = button.dataset.difficulty;
      document.querySelectorAll("[data-difficulty]").forEach((candidate) => {
        const selected = candidate === button;
        candidate.classList.toggle("selected", selected);
        candidate.setAttribute("aria-checked", String(selected));
      });
    });
  });

  elements.touchInteract.addEventListener("pointerdown", TriggerInteract);
  elements.touchDistract.addEventListener("pointerdown", TriggerDistraction);
  elements.touchMedicine.addEventListener("pointerdown", TriggerMedicine);
  elements.moveStick.addEventListener("pointerdown", (event) => {
    inputState.stickPointerId = event.pointerId;
    elements.moveStick.setPointerCapture(event.pointerId);
    UpdateTouchStick(event);
  });
  elements.moveStick.addEventListener("pointermove", (event) => {
    if (event.pointerId === inputState.stickPointerId) UpdateTouchStick(event);
  });
  elements.moveStick.addEventListener("pointerup", ReleaseTouchStick);
  elements.moveStick.addEventListener("pointercancel", ReleaseTouchStick);
  elements.canvas.addEventListener("pointerdown", HandleCanvasPointerDown);
  elements.canvas.addEventListener("pointermove", HandleCanvasPointerMove);
  elements.canvas.addEventListener("pointerup", HandleCanvasPointerUp);
  elements.canvas.addEventListener("pointercancel", HandleCanvasPointerUp);
  elements.canvas.addEventListener("contextmenu", (event) => event.preventDefault());
  elements.canvas.addEventListener("webglcontextlost", (event) => {
    event.preventDefault();
    if (gameState) gameState.paused = true;
    window.ShowLastSurvivorFailure?.("图形设备暂时失去连接。请重新载入，已进行的行动不会被解释为失败。");
  });
  elements.canvas.addEventListener("webglcontextrestored", () => location.reload());
  addEventListener("keydown", HandleKeyDown);
  addEventListener("keyup", HandleKeyUp);
  addEventListener("resize", () => worldRenderer.Resize());
  addEventListener("blur", ResetInput);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && gameMode === "playing" && !currentModal) PauseGame();
  });
}

function Frame(timestamp) {
  const deltaSeconds = Clamp((timestamp - lastFrameTime) / 1000, 0, .05);
  lastFrameTime = timestamp;
  if (gameMode === "playing" && gameState) {
    const movement = worldRenderer.GetMovementAxes();
    StepGame(gameState, deltaSeconds, {
      ...movement,
      sprint: inputState.keys.has("ShiftLeft") || inputState.keys.has("ShiftRight"),
      touch: Math.hypot(inputState.touchX, inputState.touchY) > .1,
    });
    worldRenderer.Update(gameState, deltaSeconds);
    soundscape.Update(gameState, deltaSeconds);
    UpdateInterface(gameState);
  } else {
    worldRenderer.UpdateMenu(deltaSeconds);
    soundscape.UpdateMenu();
  }
  requestAnimationFrame(Frame);
}

function FinishLoading() {
  elements.loadingFill.style.width = "42%";
  elements.loadingText.textContent = "放置村庄、沟渠与封锁据点…";
  setTimeout(() => {
    elements.loadingFill.style.width = "78%";
    elements.loadingText.textContent = "接通群众状态与巡逻逻辑…";
  }, 180);
  setTimeout(() => {
    elements.loadingFill.style.width = "100%";
    elements.loadingText.textContent = "准备就绪";
    elements.loadingScreen.classList.add("ready");
    setTimeout(() => elements.loadingScreen.setAttribute("aria-hidden", "true"), 650);
  }, 420);
}

function Bootstrap() {
  window.__LastSurvivorBooted = true;
  clearTimeout(window.__LastSurvivorBootTimer);
  WireInterface();
  SetGameUiVisible(false);
  FinishLoading();
  requestAnimationFrame(Frame);
}

Bootstrap();
