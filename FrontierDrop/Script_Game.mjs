import {
  CreateInput,
  CreateMatch,
  GetLocalView,
  RestartMatch,
  SAFE_ZONE_PHASES,
  StepMatch,
  WEAPON_DATA,
  WORLD_SIZE,
} from "./Script_Simulation.mjs";
import { CreateBattleRenderer } from "./Script_Renderer.mjs";
import { GameAudio } from "./Script_Audio.mjs";
import { ManualLanConnection } from "./Script_Network.mjs";

const localPlayerOneId = "PlayerOne";
const localPlayerTwoId = "PlayerTwo";
const fixedSimulationStep = 1 / 30;
const networkSnapshotInterval = .1;
const networkInputInterval = .05;
const settingsKey = "FrontierDrop_Settings_V1";

function Element(id) {
  return document.getElementById(id);
}

const elements = {
  app: Element("app"),
  gameCanvas: Element("gameCanvas"),
  minimapCanvas: Element("minimapCanvas"),
  fullMapCanvas: Element("fullMapCanvas"),
  menuScreen: Element("menuScreen"),
  hud: Element("hud"),
  soloButton: Element("soloButton"),
  lanButton: Element("lanButton"),
  guideButton: Element("guideButton"),
  settingsButton: Element("settingsButton"),
  actorCountSelect: Element("actorCountSelect"),
  difficultySelect: Element("difficultySelect"),
  paceSelect: Element("paceSelect"),
  seedInput: Element("seedInput"),
  deployButton: Element("deployButton"),
  modalWrap: Element("modalWrap"),
  lobbyModal: Element("lobbyModal"),
  lanModal: Element("lanModal"),
  guideModal: Element("guideModal"),
  settingsModal: Element("settingsModal"),
  pauseModal: Element("pauseModal"),
  pauseButton: Element("pauseButton"),
  resumeButton: Element("resumeButton"),
  pauseGuideButton: Element("pauseGuideButton"),
  quitButton: Element("quitButton"),
  soundToggle: Element("soundToggle"),
  shakeToggle: Element("shakeToggle"),
  contrastToggle: Element("contrastToggle"),
  motionToggle: Element("motionToggle"),
  matchSeedLabel: Element("matchSeedLabel"),
  aliveLabel: Element("aliveLabel"),
  killsLabel: Element("killsLabel"),
  zoneNotice: Element("zoneNotice"),
  zoneTitle: Element("zoneTitle"),
  zoneSubtitle: Element("zoneSubtitle"),
  flightPanel: Element("flightPanel"),
  flightDistanceLabel: Element("flightDistanceLabel"),
  jumpButton: Element("jumpButton"),
  killFeed: Element("killFeed"),
  networkIndicator: Element("networkIndicator"),
  playerNameLabel: Element("playerNameLabel"),
  statusLabel: Element("statusLabel"),
  healthFill: Element("healthFill"),
  healthLabel: Element("healthLabel"),
  armorFill: Element("armorFill"),
  armorLabel: Element("armorLabel"),
  weaponIcon: Element("weaponIcon"),
  weaponNameLabel: Element("weaponNameLabel"),
  fireModeLabel: Element("fireModeLabel"),
  magazineLabel: Element("magazineLabel"),
  reserveLabel: Element("reserveLabel"),
  medkitLabel: Element("medkitLabel"),
  medkitButton: Element("medkitButton"),
  reloadButton: Element("reloadButton"),
  interactionPrompt: Element("interactionPrompt"),
  interactionLabel: Element("interactionLabel"),
  controlHint: Element("controlHint"),
  mapButton: Element("mapButton"),
  fullMapScreen: Element("fullMapScreen"),
  closeMapButton: Element("closeMapButton"),
  resultsScreen: Element("resultsScreen"),
  resultKicker: Element("resultKicker"),
  resultTitle: Element("resultTitle"),
  resultSubtitle: Element("resultSubtitle"),
  rankLabel: Element("rankLabel"),
  totalPlayersLabel: Element("totalPlayersLabel"),
  resultKillsLabel: Element("resultKillsLabel"),
  damageLabel: Element("damageLabel"),
  survivalLabel: Element("survivalLabel"),
  distanceLabel: Element("distanceLabel"),
  rematchButton: Element("rematchButton"),
  menuButton: Element("menuButton"),
  hostTab: Element("hostTab"),
  joinTab: Element("joinTab"),
  hostPane: Element("hostPane"),
  joinPane: Element("joinPane"),
  createOfferButton: Element("createOfferButton"),
  offerOutput: Element("offerOutput"),
  copyOfferButton: Element("copyOfferButton"),
  answerInput: Element("answerInput"),
  acceptAnswerButton: Element("acceptAnswerButton"),
  offerInput: Element("offerInput"),
  createAnswerButton: Element("createAnswerButton"),
  answerOutput: Element("answerOutput"),
  copyAnswerButton: Element("copyAnswerButton"),
  lanStatusDot: Element("lanStatusDot"),
  lanStatusTitle: Element("lanStatusTitle"),
  lanStatusMessage: Element("lanStatusMessage"),
  lanStartButton: Element("lanStartButton"),
  moveStick: Element("moveStick"),
  touchPickup: Element("touchPickup"),
  touchHeal: Element("touchHeal"),
  touchFire: Element("touchFire"),
  toast: Element("toast"),
};

const modalElements = [elements.lobbyModal, elements.lanModal, elements.guideModal, elements.settingsModal, elements.pauseModal];
const renderer = CreateBattleRenderer({
  canvas: elements.gameCanvas,
  minimapCanvas: elements.minimapCanvas,
  fullMapCanvas: elements.fullMapCanvas,
});
const audio = new GameAudio();

let gameMode = "menu";
let matchState = null;
let networkView = null;
let localPlayerId = localPlayerOneId;
let activeMatchOptions = null;
let activeTiming = { zoneDurationScale: 1 };
let network = null;
let networkConnected = false;
let remoteInput = CreateInput();
let remoteInputReceivedAt = 0;
let currentModal = null;
let modalReturn = null;
let paused = false;
let fullMapOpen = false;
let resultShown = false;
let resultWasPremature = false;
let lastFrameTime = performance.now();
let simulationAccumulator = 0;
let networkSnapshotAccumulator = 0;
let networkInputAccumulator = 0;
let hudAccumulator = 0;
let lastAudioEventId = 0;
let toastTimer = null;
let matchStartedAt = 0;
let playerDistance = 0;
let lastPlayerPosition = null;
let localDamageEstimate = 0;
let matchSequence = 0;
let preferences = LoadPreferences();

const inputState = {
  keys: new Set(),
  mouseDown: false,
  touchFire: false,
  touchMoveX: 0,
  touchMoveY: 0,
  stickPointerId: null,
  actions: {
    jump: false,
    parachute: false,
    pickup: false,
    reload: false,
    heal: false,
  },
};

function Clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function EscapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    "\"": "&quot;",
  })[character]);
}

function FormatTime(seconds) {
  const wholeSeconds = Math.max(0, Math.ceil(seconds));
  const minutes = Math.floor(wholeSeconds / 60);
  const remainder = wholeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

function CreateSeed() {
  const timePart = Date.now().toString(36).slice(-6).toUpperCase();
  const randomPart = Math.floor(Math.random() * 46656).toString(36).padStart(3, "0").toUpperCase();
  return `${timePart}${randomPart}`;
}

function LoadPreferences() {
  const defaults = { sound: true, shake: true, highContrast: false, reducedMotion: false };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(settingsKey) || "{}") };
  } catch {
    return defaults;
  }
}

function SavePreferences() {
  try {
    localStorage.setItem(settingsKey, JSON.stringify(preferences));
  } catch {
    // Preferences are optional and never block play.
  }
}

function ApplyPreferences() {
  elements.soundToggle.checked = preferences.sound;
  elements.shakeToggle.checked = preferences.shake;
  elements.contrastToggle.checked = preferences.highContrast;
  elements.motionToggle.checked = preferences.reducedMotion;
  elements.app.classList.toggle("highContrast", preferences.highContrast);
  elements.app.classList.toggle("reducedMotion", preferences.reducedMotion);
  audio.SetEnabled(preferences.sound);
  renderer.SetPreferences(preferences);
}

function ShowToast(message, duration = 2300) {
  elements.toast.textContent = message;
  elements.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elements.toast.classList.remove("show"), duration);
}

function OpenModal(modal, options = {}) {
  modalElements.forEach((candidate) => { candidate.hidden = candidate !== modal; });
  elements.modalWrap.hidden = false;
  currentModal = modal;
  modalReturn = options.returnTo ?? null;
  if (options.pause && gameMode !== "menu" && gameMode !== "lanJoin") paused = true;
  requestAnimationFrame(() => modal.querySelector("button:not([disabled]), select, input, textarea")?.focus());
}

function CloseModal(options = {}) {
  if (modalReturn && !options.force) {
    const returnModal = modalReturn;
    modalReturn = null;
    OpenModal(returnModal, { pause: returnModal === elements.pauseModal });
    return;
  }
  elements.modalWrap.hidden = true;
  modalElements.forEach((modal) => { modal.hidden = true; });
  const wasPauseModal = currentModal === elements.pauseModal;
  currentModal = null;
  modalReturn = null;
  if (wasPauseModal && gameMode !== "menu") paused = false;
}

function CloseAllOverlays() {
  CloseModal({ force: true });
  elements.fullMapScreen.hidden = true;
  fullMapOpen = false;
}

function OpenPauseMenu() {
  if (gameMode === "menu" || resultShown) return;
  if (gameMode === "lanHost" || gameMode === "lanJoin") {
    ShowToast("联机对局不会暂停；战场仍在继续。", 2600);
    OpenModal(elements.pauseModal, { pause: false });
  } else {
    OpenModal(elements.pauseModal, { pause: true });
  }
}

function ResumeMatch() {
  paused = false;
  CloseModal({ force: true });
}

function ToggleFullMap(forceState = null) {
  if (gameMode === "menu" || resultShown) return;
  fullMapOpen = forceState === null ? !fullMapOpen : Boolean(forceState);
  elements.fullMapScreen.hidden = !fullMapOpen;
  if (fullMapOpen) renderer.RenderFullMap();
}

function WeaponDisplayName(weaponId) {
  return {
    PulseCarbine: "脉冲卡宾枪",
    RivetSmg: "铆钉冲锋枪",
    ScoutRifle: "远望步枪",
  }[weaponId] ?? "未装备";
}

function WeaponGlyph(weaponId) {
  return { PulseCarbine: "C", RivetSmg: "S", ScoutRifle: "R" }[weaponId] ?? "—";
}

function ActorDisplayName(actorId, view = CurrentView()) {
  if (actorId === localPlayerOneId) return "行动员 01";
  if (actorId === localPlayerTwoId) return "行动员 02";
  const actor = view?.actors?.find((candidate) => candidate.id === actorId);
  if (!actor) return "环境";
  return actor.name.replace("Ranger", "游骑兵");
}

function LootDisplayName(item) {
  if (!item) return "物资";
  if (item.type === "weapon") return WeaponDisplayName(item.weaponId);
  return { ammo: "通用弹药", armor: "复合护甲", medkit: "急救包" }[item.type] ?? "物资";
}

function CurrentView() {
  if (gameMode === "lanJoin") return networkView;
  return matchState ? GetLocalView(matchState, localPlayerId) : networkView;
}

function CurrentPlayer() {
  return CurrentView()?.player ?? null;
}

function ResetInputActions() {
  for (const key of Object.keys(inputState.actions)) inputState.actions[key] = false;
}

function ResetInputs() {
  inputState.keys.clear();
  inputState.mouseDown = false;
  inputState.touchFire = false;
  inputState.touchMoveX = 0;
  inputState.touchMoveY = 0;
  inputState.stickPointerId = null;
  ResetInputActions();
  const stickKnob = elements.moveStick.querySelector("i");
  if (stickKnob) stickKnob.style.transform = "translate(-50%, -50%)";
}

function FindTouchAim(view, player) {
  let bestActor = null;
  let bestDistance = 155;
  for (const actor of view?.actors ?? []) {
    if (!actor.alive || actor.id === player.id || actor.status !== "ground") continue;
    const distance = Math.hypot(actor.x - player.x, actor.y - player.y);
    if (distance < bestDistance) {
      bestActor = actor;
      bestDistance = distance;
    }
  }
  if (!bestActor) return { x: Math.cos(player.angle), y: Math.sin(player.angle) };
  const length = Math.max(.0001, bestDistance);
  return { x: (bestActor.x - player.x) / length, y: (bestActor.y - player.y) / length };
}

function BuildLocalInput() {
  const view = CurrentView();
  const player = view?.player;
  let moveX = 0;
  let moveY = 0;
  if (inputState.keys.has("KeyA") || inputState.keys.has("ArrowLeft")) moveX -= 1;
  if (inputState.keys.has("KeyD") || inputState.keys.has("ArrowRight")) moveX += 1;
  if (inputState.keys.has("KeyW") || inputState.keys.has("ArrowUp")) moveY -= 1;
  if (inputState.keys.has("KeyS") || inputState.keys.has("ArrowDown")) moveY += 1;
  moveX += inputState.touchMoveX;
  moveY += inputState.touchMoveY;
  const moveLength = Math.hypot(moveX, moveY);
  if (moveLength > 1) {
    moveX /= moveLength;
    moveY /= moveLength;
  }
  let aimX = player ? Math.cos(player.angle) : 1;
  let aimY = player ? Math.sin(player.angle) : 0;
  if (player && renderer.pointer.active) {
    const differenceX = renderer.pointer.worldX - player.x;
    const differenceY = renderer.pointer.worldY - player.y;
    const aimLength = Math.max(.0001, Math.hypot(differenceX, differenceY));
    aimX = differenceX / aimLength;
    aimY = differenceY / aimLength;
  } else if (player && inputState.touchFire) {
    const touchAim = FindTouchAim(view, player);
    aimX = touchAim.x;
    aimY = touchAim.y;
  }
  return CreateInput({
    moveX,
    moveY,
    aimX,
    aimY,
    shoot: inputState.mouseDown || inputState.touchFire,
    sprint: inputState.keys.has("ShiftLeft") || inputState.keys.has("ShiftRight") || moveLength > .82,
    jump: inputState.actions.jump,
    parachute: inputState.actions.parachute,
    pickup: inputState.actions.pickup,
    reload: inputState.actions.reload,
    heal: inputState.actions.heal,
  });
}

function TriggerJump() {
  const player = CurrentPlayer();
  if (!player) return;
  if (player.status === "plane") inputState.actions.jump = true;
  else if (player.status === "freefall") inputState.actions.parachute = true;
}

function GetMatchOptionsFromForm() {
  const actorCount = Number(elements.actorCountSelect.value) || 30;
  const pace = elements.paceSelect.value;
  const difficulty = elements.difficultySelect.value;
  const seed = elements.seedInput.value.trim() || CreateSeed();
  const timing = pace === "standard"
    ? { zoneDurationScale: 1.72, maxCombatDuration: 390, planeSpeed: 82 }
    : { zoneDurationScale: 1.08, maxCombatDuration: 270, planeSpeed: 102 };
  return { actorCount, pace, difficulty, seed, timing };
}

function ResetMatchMetrics(view) {
  resultShown = false;
  resultWasPremature = false;
  matchStartedAt = performance.now();
  playerDistance = 0;
  lastPlayerPosition = view?.player ? { x: view.player.x, y: view.player.y } : null;
  localDamageEstimate = 0;
  lastAudioEventId = 0;
  simulationAccumulator = 0;
  networkSnapshotAccumulator = 0;
  networkInputAccumulator = 0;
  hudAccumulator = 0;
  elements.resultsScreen.hidden = true;
  elements.rematchButton.disabled = false;
  const rematchTitle = elements.rematchButton.querySelector("b");
  const rematchSubtitle = elements.rematchButton.querySelector("small");
  if (rematchTitle) rematchTitle.textContent = "再次出击";
  if (rematchSubtitle) rematchSubtitle.textContent = "使用新的地图种子";
}

function EnterMatchUi(view) {
  CloseAllOverlays();
  elements.menuScreen.hidden = true;
  elements.hud.hidden = false;
  elements.resultsScreen.hidden = true;
  elements.app.classList.add("inMatch");
  elements.playerNameLabel.textContent = localPlayerId === localPlayerOneId ? "行动员 01" : "行动员 02";
  elements.networkIndicator.classList.toggle("online", networkConnected);
  elements.controlHint.hidden = false;
  renderer.SetView(view);
  ResetMatchMetrics(view);
  paused = false;
  audio.Deploy();
}

function StartLocalMatch(options, mode = "solo") {
  matchSequence += 1;
  gameMode = mode;
  localPlayerId = localPlayerOneId;
  activeMatchOptions = {
    actorCount: options.actorCount,
    pace: options.pace ?? "quick",
    difficulty: options.difficulty ?? "veteran",
    seed: options.seed ?? CreateSeed(),
    timing: { ...(options.timing ?? {}) },
  };
  activeTiming = activeMatchOptions.timing;
  const humanPlayerIds = mode === "lanHost" ? [localPlayerOneId, localPlayerTwoId] : [localPlayerOneId];
  matchState = CreateMatch({
    seed: activeMatchOptions.seed,
    actorCount: activeMatchOptions.actorCount,
    difficulty: activeMatchOptions.difficulty,
    humanPlayerIds,
    timing: activeMatchOptions.timing,
  });
  networkView = null;
  remoteInput = CreateInput();
  remoteInputReceivedAt = 0;
  const view = GetLocalView(matchState, localPlayerId);
  EnterMatchUi(view);
  if (mode === "lanHost") SendMatchStart();
}

function StartNetworkJoin(message) {
  matchSequence = message.sequence ?? matchSequence;
  gameMode = "lanJoin";
  localPlayerId = localPlayerTwoId;
  matchState = null;
  activeMatchOptions = message.options ?? { actorCount: message.view.actors.length, seed: message.view.seed, timing: {} };
  activeTiming = message.timing ?? activeMatchOptions.timing ?? { zoneDurationScale: 1 };
  networkView = message.view;
  EnterMatchUi(networkView);
  ShowToast("已进入房主战区，连接为房主权威模式。", 3000);
}

function SendNetworkMessage(message) {
  if (!network?.IsOpen()) return false;
  try {
    return network.Send(JSON.stringify(message));
  } catch {
    return false;
  }
}

function SendMatchStart() {
  if (!matchState || !network?.IsOpen()) return;
  const guestView = GetLocalView(matchState, localPlayerTwoId);
  SendNetworkMessage({
    type: "matchStart",
    sequence: matchSequence,
    view: guestView,
    options: activeMatchOptions,
    timing: matchState.config,
  });
}

function SendHostSnapshot() {
  if (!matchState || !network?.IsOpen()) return;
  const guestView = GetLocalView(matchState, localPlayerTwoId);
  const compactView = {
    ...guestView,
    unavailableLootIds: guestView.map.loot.filter((item) => !item.available).map((item) => item.id),
  };
  delete compactView.map;
  SendNetworkMessage({ type: "snapshot", sequence: matchSequence, view: compactView });
}

function MergeNetworkSnapshot(snapshot) {
  if (!networkView || !snapshot) return;
  const { unavailableLootIds, ...snapshotView } = snapshot;
  let nextMap = snapshot.map ?? networkView.map;
  if (nextMap?.loot && Array.isArray(unavailableLootIds)) {
    const unavailableIds = new Set(unavailableLootIds);
    nextMap = {
      ...nextMap,
      loot: nextMap.loot.map((item) => ({ ...item, available: !unavailableIds.has(item.id) })),
    };
  }
  networkView = {
    ...networkView,
    ...snapshotView,
    map: nextMap,
  };
}

function HandleNetworkMessage(payload) {
  let message;
  try {
    message = JSON.parse(String(payload));
  } catch {
    ShowToast("收到无法识别的联机数据。", 2600);
    return;
  }
  if (!message || typeof message !== "object") return;
  if (message.type === "input" && gameMode === "lanHost") {
    remoteInput = CreateInput(message.input ?? {});
    remoteInputReceivedAt = performance.now();
    return;
  }
  if (message.type === "matchStart") {
    StartNetworkJoin(message);
    return;
  }
  if (message.type === "snapshot" && gameMode === "lanJoin") {
    if (message.sequence !== matchSequence && matchSequence !== 0) return;
    matchSequence = message.sequence ?? matchSequence;
    MergeNetworkSnapshot(message.view);
    return;
  }
  if (message.type === "rematchRequest" && gameMode === "lanHost") {
    if (matchState?.phase === "results" || !CurrentPlayer()?.alive) {
      const options = { ...activeMatchOptions, seed: CreateSeed() };
      StartLocalMatch(options, "lanHost");
    } else {
      SendNetworkMessage({ type: "rematchDenied", text: "房主仍在战场中，暂不能重新开始。" });
    }
    return;
  }
  if (message.type === "rematchDenied" && gameMode === "lanJoin") {
    elements.rematchButton.disabled = false;
    const title = elements.rematchButton.querySelector("b");
    const subtitle = elements.rematchButton.querySelector("small");
    if (title) title.textContent = "稍后再试";
    if (subtitle) subtitle.textContent = "等待房主完成当前战局";
    ShowToast(message.text || "房主暂不能重新开始。", 2800);
    return;
  }
  if (message.type === "notice") ShowToast(message.text || "房主发来一条通知。", 2800);
  if (message.type === "leave") ShowToast("另一台设备已离开对局；AI 将继续完成战局。", 3000);
}

function SetLanStatus(state, title, message) {
  elements.lanStatusDot.className = state;
  elements.lanStatusTitle.textContent = title;
  elements.lanStatusMessage.textContent = message;
}

function CreateNetwork() {
  if (network) network.Close("restartSignaling");
  networkConnected = false;
  network = new ManualLanConnection({
    rtcConfiguration: { iceServers: [] },
    iceGatheringTimeoutMs: 15000,
    onStatus(status) {
      const busyStates = new Set(["creatingOffer", "gatheringIce", "acceptingOffer", "creatingAnswer", "acceptingAnswer", "connecting", "connectionState"]);
      if (busyStates.has(status.state)) SetLanStatus("connecting", "正在建立连接", "请保持页面开启并等待浏览器完成协商");
      if (status.state === "error" || status.state === "channelError") {
        SetLanStatus("", "连接失败", "请重新生成邀请信息，并确认两台设备在同一网络");
      }
    },
    onMessage: HandleNetworkMessage,
    onOpen() {
      networkConnected = true;
      SetLanStatus("connected", "局域网已连接", network.role === "host" ? "队友已就绪，可以开始对局" : "直连成功，等待房主开始对局");
      elements.lanStartButton.disabled = network.role !== "host";
      elements.networkIndicator.classList.add("online");
      audio.Ui();
    },
    onClose() {
      networkConnected = false;
      elements.networkIndicator.classList.remove("online");
      SetLanStatus("", "连接已关闭", "可以重新生成邀请信息再次连接");
      elements.lanStartButton.disabled = true;
    },
  });
}

function OpenLanSetup() {
  CreateNetwork();
  elements.offerOutput.value = "";
  elements.answerInput.value = "";
  elements.offerInput.value = "";
  elements.answerOutput.value = "";
  elements.copyOfferButton.disabled = true;
  elements.copyAnswerButton.disabled = true;
  elements.lanStartButton.disabled = true;
  SetLanStatus("", "尚未连接", "请先选择房主或加入方流程");
  SelectLanRole("host");
  OpenModal(elements.lanModal);
}

function SelectLanRole(role) {
  const hostSelected = role === "host";
  elements.hostTab.classList.toggle("active", hostSelected);
  elements.joinTab.classList.toggle("active", !hostSelected);
  elements.hostPane.hidden = !hostSelected;
  elements.joinPane.hidden = hostSelected;
}

async function CopyText(textarea, successMessage) {
  const value = textarea.value.trim();
  if (!value) return;
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    textarea.focus();
    textarea.select();
    document.execCommand("copy");
  }
  ShowToast(successMessage);
  audio.Ui();
}

async function CreateHostOffer() {
  if (!network) CreateNetwork();
  elements.createOfferButton.disabled = true;
  SetLanStatus("connecting", "正在生成邀请", "通常需要数秒，请保持页面开启");
  try {
    const code = await network.CreateHostOfferCode();
    elements.offerOutput.value = code;
    elements.copyOfferButton.disabled = false;
    SetLanStatus("connecting", "邀请信息已生成", "复制给队友，并等待对方返回应答");
  } catch (error) {
    SetLanStatus("", "无法生成邀请", error.code === "WEBRTC_UNAVAILABLE" ? "当前浏览器不支持 WebRTC，请使用最新版 Chrome、Edge、Safari 或 Firefox" : "请刷新页面后重试");
    ShowToast(error.message, 3500);
  } finally {
    elements.createOfferButton.disabled = false;
  }
}

async function CreateJoinAnswer() {
  const offerCode = elements.offerInput.value.trim();
  if (!offerCode) {
    ShowToast("请先粘贴房主发来的邀请信息。", 2600);
    return;
  }
  if (!network) CreateNetwork();
  elements.createAnswerButton.disabled = true;
  SetLanStatus("connecting", "正在生成应答", "正在解析邀请并收集局域网连接地址");
  try {
    const code = await network.CreateJoinAnswerCode(offerCode);
    elements.answerOutput.value = code;
    elements.copyAnswerButton.disabled = false;
    SetLanStatus("connecting", "应答信息已生成", "复制给房主，房主粘贴后即可完成连接");
  } catch (error) {
    SetLanStatus("", "邀请信息无效", "请确认复制了完整内容，并让房主重新生成");
    ShowToast(error.message, 3500);
  } finally {
    elements.createAnswerButton.disabled = false;
  }
}

async function AcceptHostAnswer() {
  const answerCode = elements.answerInput.value.trim();
  if (!answerCode) {
    ShowToast("请先粘贴队友返回的应答信息。", 2600);
    return;
  }
  elements.acceptAnswerButton.disabled = true;
  SetLanStatus("connecting", "正在完成连接", "应答已收到，等待数据通道打开");
  try {
    await network.AcceptHostAnswerCode(answerCode);
  } catch (error) {
    SetLanStatus("", "应答信息无效", "请确认应答与本次邀请匹配");
    ShowToast(error.message, 3500);
  } finally {
    elements.acceptAnswerButton.disabled = false;
  }
}

function UpdatePlayerDistance(view) {
  const player = view?.player;
  if (!player) return;
  if (lastPlayerPosition && player.status === "ground" && player.alive) {
    const moved = Math.hypot(player.x - lastPlayerPosition.x, player.y - lastPlayerPosition.y);
    if (moved < 20) playerDistance += moved;
  }
  lastPlayerPosition = { x: player.x, y: player.y };
}

function FindNearbyLoot(view) {
  const player = view?.player;
  if (!player || player.status !== "ground" || !player.alive) return null;
  let nearestItem = null;
  let nearestDistance = 7.2;
  for (const item of view.map.loot) {
    if (!item.available) continue;
    const distance = Math.hypot(item.x - player.x, item.y - player.y);
    if (distance < nearestDistance) {
      nearestItem = item;
      nearestDistance = distance;
    }
  }
  return nearestItem;
}

function RenderKillFeed(view) {
  const entries = (view?.killFeed ?? []).slice(-5).reverse();
  elements.killFeed.innerHTML = entries.map((entry) => {
    const killer = entry.killerId ? `<b>${EscapeHtml(ActorDisplayName(entry.killerId, view))}</b>` : "边界";
    const victim = `<em>${EscapeHtml(ActorDisplayName(entry.victimId, view))}</em>`;
    const cause = entry.cause === "zone" ? "未能穿过边界" : `使用 ${EscapeHtml(WeaponDisplayName(entry.weaponId))}`;
    return `<p>${killer} ${cause} 淘汰 ${victim} · 剩余 ${entry.remaining}</p>`;
  }).join("");
}

function UpdateZoneUi(view) {
  const zone = view.safeZone;
  const player = view.player;
  const active = view.phase === "combat" && zone.phaseIndex >= 0;
  elements.zoneNotice.hidden = !active;
  if (!active) return;
  const definition = SAFE_ZONE_PHASES[zone.phaseIndex];
  const scale = activeTiming.zoneDurationScale ?? 1;
  let remaining = 0;
  if (zone.stage === "waiting") {
    remaining = definition.waitDuration * scale - zone.stageTime;
    elements.zoneTitle.textContent = `第 ${zone.phaseIndex + 1} 阶段安全区已标记`;
    elements.zoneSubtitle.textContent = `距离收缩 ${FormatTime(remaining)}`;
  } else if (zone.stage === "shrinking") {
    remaining = definition.shrinkDuration * scale - zone.stageTime;
    elements.zoneTitle.textContent = "安全区正在收缩";
    elements.zoneSubtitle.textContent = `边界移动剩余 ${FormatTime(remaining)}`;
  } else {
    elements.zoneTitle.textContent = "最终边界已闭合";
    elements.zoneSubtitle.textContent = "立刻结束交战";
  }
  const outside = player && Math.hypot(player.x - zone.center.x, player.y - zone.center.y) > zone.radius;
  elements.zoneNotice.classList.toggle("danger", Boolean(outside));
  if (outside) {
    elements.zoneTitle.textContent = "你正在安全区外";
    elements.zoneSubtitle.textContent = `持续受到 ${zone.damagePerSecond.toFixed(1)} 点/秒伤害`;
  }
}

function UpdateHud(view) {
  if (!view || elements.hud.hidden) return;
  const player = view.player;
  if (!player) return;
  elements.matchSeedLabel.textContent = `SEED ${view.seed}`;
  elements.aliveLabel.textContent = String(view.aliveCount);
  elements.killsLabel.textContent = String(player.kills);
  elements.healthFill.style.width = `${Clamp(player.health, 0, 100)}%`;
  elements.healthLabel.textContent = String(Math.ceil(Math.max(0, player.health)));
  elements.armorFill.style.width = `${Clamp(player.armor, 0, 100)}%`;
  elements.armorLabel.textContent = String(Math.round(Math.max(0, player.armor)));
  elements.weaponNameLabel.textContent = WeaponDisplayName(player.inventory.weaponId);
  elements.weaponIcon.textContent = WeaponGlyph(player.inventory.weaponId);
  elements.fireModeLabel.textContent = player.inventory.weaponId ? "自动 / 命中扫描" : "寻找武器";
  elements.magazineLabel.textContent = String(player.inventory.magazineAmmo);
  elements.reserveLabel.textContent = String(player.inventory.reserveAmmo);
  elements.medkitLabel.textContent = String(player.inventory.medkits);
  elements.networkIndicator.classList.toggle("online", networkConnected);
  if (!player.alive) elements.statusLabel.textContent = "已淘汰";
  else if (player.status === "plane") elements.statusLabel.textContent = "等待跃离";
  else if (player.status === "freefall") elements.statusLabel.textContent = `自由落体 ${Math.ceil(player.z)} m`;
  else if (player.status === "parachute") elements.statusLabel.textContent = `伞降 ${Math.ceil(player.z)} m`;
  else if (player.healingTimer > 0) elements.statusLabel.textContent = `治疗中 ${player.healingTimer.toFixed(1)} s`;
  else if (player.reloadTimer > 0) elements.statusLabel.textContent = `换弹中 ${player.reloadTimer.toFixed(1)} s`;
  else elements.statusLabel.textContent = "状态正常";
  elements.flightPanel.hidden = !(view.phase === "flight" && player.status === "plane");
  if (!elements.flightPanel.hidden) {
    elements.flightDistanceLabel.textContent = `距航线终点 ${Math.ceil((1 - view.plane.progress) * view.plane.routeLength)} m`;
  }
  const nearbyLoot = FindNearbyLoot(view);
  elements.interactionPrompt.hidden = !nearbyLoot;
  if (nearbyLoot) elements.interactionLabel.textContent = `拾取 ${LootDisplayName(nearbyLoot)}`;
  elements.controlHint.hidden = view.time > 14;
  UpdateZoneUi(view);
  RenderKillFeed(view);
  renderer.RenderFullMap();
}

function ProcessGameEvents(view) {
  if (!view?.recentEvents) return;
  for (const event of view.recentEvents) {
    if (event.id <= lastAudioEventId) continue;
    lastAudioEventId = Math.max(lastAudioEventId, event.id);
    if (event.type === "actorJumped" && event.actorId === localPlayerId) audio.Jump();
    if (event.type === "actorLanded" && event.actorId === localPlayerId) audio.Land();
    if (event.type === "lootPickedUp" && event.actorId === localPlayerId) audio.Pickup();
    if (event.type === "shotHit") {
      if (event.actorId === localPlayerId) {
        audio.Shot(view.player?.inventory.weaponId);
        audio.Hit();
        localDamageEstimate += Number(event.damage) || 0;
      }
      if (event.targetId === localPlayerId) audio.Hurt();
    }
    if (event.type === "actorEliminated" && event.killerId === localPlayerId) audio.Eliminate();
    if (event.type === "safeZoneShrinking") audio.Zone();
  }
}

function DetermineRank(view) {
  const resultEntry = view.result?.ranking?.find((entry) => entry.actorId === localPlayerId);
  if (resultEntry) return resultEntry.rank;
  if (!view.player?.alive) return Math.min(view.actors.length, view.aliveCount + 1);
  return view.winnerId === localPlayerId ? 1 : 1;
}

function ShowResults(view, premature = false) {
  if (resultShown) return;
  resultShown = true;
  resultWasPremature = premature;
  if (gameMode === "solo") paused = true;
  CloseAllOverlays();
  elements.resultsScreen.hidden = false;
  const player = view.player;
  const won = !premature && (view.winnerId === localPlayerId || (view.phase === "results" && player?.alive));
  const rank = DetermineRank(view);
  const resultEntry = view.result?.ranking?.find((entry) => entry.actorId === localPlayerId);
  elements.resultKicker.textContent = won ? "边界幸存者" : "行动终止";
  elements.resultTitle.textContent = won ? "最后一人" : "本次撤离失败";
  elements.resultSubtitle.textContent = won ? "你是灰脊盆地最后的幸存者" : `战区仍有 ${view.aliveCount} 名行动员存活`;
  elements.rankLabel.textContent = `#${rank}`;
  elements.totalPlayersLabel.textContent = `/ ${view.actors.length}`;
  elements.resultKillsLabel.textContent = String(player?.kills ?? 0);
  elements.damageLabel.textContent = String(Math.round(resultEntry?.damageDealt ?? localDamageEstimate));
  elements.survivalLabel.textContent = FormatTime(view.time);
  elements.distanceLabel.textContent = `${Math.round(playerDistance)} m`;
  if (gameMode === "lanJoin" || gameMode === "lanHost") {
    const rematchTitle = elements.rematchButton.querySelector("b");
    const rematchSubtitle = elements.rematchButton.querySelector("small");
    elements.rematchButton.disabled = premature;
    const readyTitle = gameMode === "lanJoin" ? "请求再次出击" : "再次出击";
    const readySubtitle = gameMode === "lanJoin" ? "由房主创建下一局" : "使用新的地图种子";
    if (rematchTitle) rematchTitle.textContent = premature ? "等待战局结束" : readyTitle;
    if (rematchSubtitle) rematchSubtitle.textContent = premature ? "当前战局结算后即可再次出击" : readySubtitle;
  }
  audio.Result(won);
}

function CheckResultState(view) {
  if (!view?.player) return;
  if (resultShown) {
    if (resultWasPremature && view.phase === "results") {
      resultShown = false;
      ShowResults(view, false);
    }
    return;
  }
  if (!view.player.alive) {
    ShowResults(view, view.phase !== "results");
    return;
  }
  if (view.phase === "results") ShowResults(view, false);
}

function StepHostOrSolo(deltaTime) {
  if (!matchState || paused) return;
  simulationAccumulator += deltaTime;
  let stepped = false;
  while (simulationAccumulator >= fixedSimulationStep && matchState.phase !== "results") {
    const localInput = BuildLocalInput();
    const inputByPlayer = { [localPlayerOneId]: localInput };
    if (gameMode === "lanHost") {
      const remoteFresh = performance.now() - remoteInputReceivedAt < 650;
      inputByPlayer[localPlayerTwoId] = remoteFresh ? remoteInput : CreateInput();
    }
    StepMatch(matchState, inputByPlayer, fixedSimulationStep);
    simulationAccumulator -= fixedSimulationStep;
    stepped = true;
    ResetInputActions();
  }
  if (!stepped && simulationAccumulator > .5) simulationAccumulator = 0;
  if (gameMode === "lanHost" && network?.IsOpen()) {
    networkSnapshotAccumulator += deltaTime;
    if (networkSnapshotAccumulator >= networkSnapshotInterval) {
      networkSnapshotAccumulator %= networkSnapshotInterval;
      SendHostSnapshot();
    }
  }
}

function StepJoinerNetwork(deltaTime) {
  if (gameMode !== "lanJoin" || !network?.IsOpen() || resultShown) return;
  networkInputAccumulator += deltaTime;
  if (networkInputAccumulator >= networkInputInterval) {
    networkInputAccumulator %= networkInputInterval;
    const input = BuildLocalInput();
    SendNetworkMessage({ type: "input", input });
    ResetInputActions();
  }
}

function UpdateGame(deltaTime) {
  if (gameMode === "solo" || gameMode === "lanHost") StepHostOrSolo(deltaTime);
  if (gameMode === "lanJoin") StepJoinerNetwork(deltaTime);
  const view = CurrentView();
  if (!view) return;
  renderer.SetView(view);
  ProcessGameEvents(view);
  UpdatePlayerDistance(view);
  hudAccumulator += deltaTime;
  if (hudAccumulator >= .08) {
    hudAccumulator %= .08;
    UpdateHud(view);
  }
  CheckResultState(view);
}

function Frame(timestamp) {
  const deltaTime = Clamp((timestamp - lastFrameTime) / 1000, 0, .08);
  lastFrameTime = timestamp;
  if (gameMode !== "menu") UpdateGame(deltaTime);
  renderer.Render(timestamp, deltaTime);
  requestAnimationFrame(Frame);
}

function GoToMenu(options = {}) {
  if (gameMode === "lanHost" || gameMode === "lanJoin") SendNetworkMessage({ type: "leave" });
  if (options.closeNetwork !== false && network) {
    network.Close("returnToMenu");
    network = null;
    networkConnected = false;
  }
  gameMode = "menu";
  matchState = null;
  networkView = null;
  localPlayerId = localPlayerOneId;
  paused = false;
  resultShown = false;
  resultWasPremature = false;
  ResetInputs();
  CloseAllOverlays();
  elements.resultsScreen.hidden = true;
  elements.hud.hidden = true;
  elements.menuScreen.hidden = false;
  elements.app.classList.remove("inMatch");
  const previewState = CreateMatch({ seed: "FrontierEchoPreview", actorCount: 24, humanPlayerIds: [localPlayerOneId] });
  const previewView = GetLocalView(previewState, localPlayerOneId);
  renderer.SetView(previewView);
}

function Rematch() {
  if (gameMode === "lanHost" && matchState?.phase !== "results") {
    ShowToast("当前联机战局尚未结束。", 2400);
    return;
  }
  if (gameMode === "lanJoin") {
    SendNetworkMessage({ type: "rematchRequest" });
    elements.rematchButton.disabled = true;
    const title = elements.rematchButton.querySelector("b");
    const subtitle = elements.rematchButton.querySelector("small");
    if (title) title.textContent = "已发送请求";
    if (subtitle) subtitle.textContent = "等待房主创建下一局";
    return;
  }
  if (gameMode === "lanHost" && matchState?.restartReady) {
    matchState = RestartMatch(matchState, { seed: CreateSeed() });
    activeMatchOptions.seed = matchState.seed;
    const view = GetLocalView(matchState, localPlayerId);
    EnterMatchUi(view);
    matchSequence += 1;
    SendMatchStart();
    return;
  }
  const mode = gameMode === "lanHost" ? "lanHost" : "solo";
  const options = { ...(activeMatchOptions ?? GetMatchOptionsFromForm()), seed: CreateSeed() };
  StartLocalMatch(options, mode);
}

function HandleKeyDown(event) {
  const editing = event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement;
  if (event.code === "Escape") {
    event.preventDefault();
    if (fullMapOpen) ToggleFullMap(false);
    else if (currentModal === elements.pauseModal) ResumeMatch();
    else if (currentModal) CloseModal();
    else OpenPauseMenu();
    return;
  }
  if (editing) {
    if (event.code === "Enter" && currentModal === elements.lobbyModal) elements.deployButton.click();
    return;
  }
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(event.code)) event.preventDefault();
  if (!event.repeat) {
    if (event.code === "Space") TriggerJump();
    if (event.code === "KeyF") inputState.actions.pickup = true;
    if (event.code === "KeyR") inputState.actions.reload = true;
    if (event.code === "Digit4") inputState.actions.heal = true;
    if (event.code === "KeyM") ToggleFullMap();
    if (event.code === "Enter" && gameMode === "menu" && !currentModal) elements.soloButton.click();
  }
  inputState.keys.add(event.code);
}

function HandleKeyUp(event) {
  inputState.keys.delete(event.code);
}

function HandlePointerMove(event) {
  renderer.SetPointer(event.clientX, event.clientY, true);
}

function HandleCanvasPointerDown(event) {
  if (event.button !== 0 || gameMode === "menu" || resultShown) return;
  audio.EnsureContext();
  renderer.SetPointer(event.clientX, event.clientY, true);
  inputState.mouseDown = true;
}

function HandleCanvasPointerUp(event) {
  if (event.button === 0) inputState.mouseDown = false;
}

function UpdateTouchStick(event) {
  const bounds = elements.moveStick.getBoundingClientRect();
  const centerX = bounds.left + bounds.width * .5;
  const centerY = bounds.top + bounds.height * .5;
  let deltaX = event.clientX - centerX;
  let deltaY = event.clientY - centerY;
  const maximumRadius = bounds.width * .34;
  const distance = Math.hypot(deltaX, deltaY);
  if (distance > maximumRadius) {
    deltaX = deltaX / distance * maximumRadius;
    deltaY = deltaY / distance * maximumRadius;
  }
  inputState.touchMoveX = deltaX / maximumRadius;
  inputState.touchMoveY = deltaY / maximumRadius;
  const knob = elements.moveStick.querySelector("i");
  if (knob) knob.style.transform = `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px))`;
}

function ReleaseTouchStick(event) {
  if (event.pointerId !== inputState.stickPointerId) return;
  inputState.stickPointerId = null;
  inputState.touchMoveX = 0;
  inputState.touchMoveY = 0;
  const knob = elements.moveStick.querySelector("i");
  if (knob) knob.style.transform = "translate(-50%, -50%)";
}

function WireEvents() {
  elements.soloButton.addEventListener("click", () => { audio.Ui(); OpenModal(elements.lobbyModal); });
  elements.lanButton.addEventListener("click", () => { audio.Ui(); OpenLanSetup(); });
  elements.guideButton.addEventListener("click", () => { audio.Ui(); OpenModal(elements.guideModal); });
  elements.settingsButton.addEventListener("click", () => { audio.Ui(); OpenModal(elements.settingsModal); });
  elements.deployButton.addEventListener("click", () => StartLocalMatch(GetMatchOptionsFromForm(), "solo"));
  elements.pauseButton.addEventListener("click", OpenPauseMenu);
  elements.resumeButton.addEventListener("click", ResumeMatch);
  elements.pauseGuideButton.addEventListener("click", () => OpenModal(elements.guideModal, { returnTo: elements.pauseModal }));
  elements.quitButton.addEventListener("click", () => GoToMenu());
  elements.jumpButton.addEventListener("click", TriggerJump);
  elements.medkitButton.addEventListener("click", () => { inputState.actions.heal = true; });
  elements.reloadButton.addEventListener("click", () => { inputState.actions.reload = true; });
  elements.mapButton.addEventListener("click", () => ToggleFullMap(true));
  elements.closeMapButton.addEventListener("click", () => ToggleFullMap(false));
  elements.menuButton.addEventListener("click", () => GoToMenu());
  elements.rematchButton.addEventListener("click", Rematch);
  elements.hostTab.addEventListener("click", () => SelectLanRole("host"));
  elements.joinTab.addEventListener("click", () => SelectLanRole("join"));
  elements.createOfferButton.addEventListener("click", CreateHostOffer);
  elements.copyOfferButton.addEventListener("click", () => CopyText(elements.offerOutput, "邀请信息已复制。"));
  elements.createAnswerButton.addEventListener("click", CreateJoinAnswer);
  elements.copyAnswerButton.addEventListener("click", () => CopyText(elements.answerOutput, "应答信息已复制，请发回房主。"));
  elements.acceptAnswerButton.addEventListener("click", AcceptHostAnswer);
  elements.lanStartButton.addEventListener("click", () => {
    if (!network?.IsOpen() || network.role !== "host") return;
    StartLocalMatch({ actorCount: 28, pace: "quick", difficulty: "veteran", seed: CreateSeed(), timing: { zoneDurationScale: 1.08, maxCombatDuration: 270, planeSpeed: 102 } }, "lanHost");
  });
  document.querySelectorAll("[dataclosemodal]").forEach((button) => button.addEventListener("click", () => CloseModal()));

  for (const toggle of [elements.soundToggle, elements.shakeToggle, elements.contrastToggle, elements.motionToggle]) {
    toggle.addEventListener("change", () => {
      preferences = {
        sound: elements.soundToggle.checked,
        shake: elements.shakeToggle.checked,
        highContrast: elements.contrastToggle.checked,
        reducedMotion: elements.motionToggle.checked,
      };
      ApplyPreferences();
      SavePreferences();
      audio.Ui();
    });
  }

  globalThis.addEventListener("keydown", HandleKeyDown);
  globalThis.addEventListener("keyup", HandleKeyUp);
  globalThis.addEventListener("blur", ResetInputs);
  globalThis.addEventListener("resize", () => renderer.Resize());
  elements.gameCanvas.addEventListener("pointermove", HandlePointerMove);
  elements.gameCanvas.addEventListener("pointerdown", HandleCanvasPointerDown);
  globalThis.addEventListener("pointerup", HandleCanvasPointerUp);
  elements.gameCanvas.addEventListener("contextmenu", (event) => event.preventDefault());

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
  elements.touchPickup.addEventListener("pointerdown", () => { inputState.actions.pickup = true; });
  elements.touchHeal.addEventListener("pointerdown", () => { inputState.actions.heal = true; });
  elements.touchFire.addEventListener("pointerdown", (event) => {
    inputState.touchFire = true;
    elements.touchFire.setPointerCapture(event.pointerId);
  });
  elements.touchFire.addEventListener("pointerup", () => { inputState.touchFire = false; });
  elements.touchFire.addEventListener("pointercancel", () => { inputState.touchFire = false; });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && gameMode === "solo" && !resultShown) {
      paused = true;
      ResetInputs();
    } else if (!document.hidden && gameMode === "solo" && paused && !resultShown && !currentModal) {
      if (fullMapOpen) ToggleFullMap(false);
      OpenModal(elements.pauseModal, { pause: true });
    }
  });
}

function Bootstrap() {
  ApplyPreferences();
  WireEvents();
  GoToMenu({ closeNetwork: false });
  requestAnimationFrame(Frame);
}

Bootstrap();
