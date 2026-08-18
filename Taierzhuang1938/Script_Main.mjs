// 《血战台儿庄》装配层：把渲染、战场、玩家、AI、特效、音效、HUD 拼起来。
//
// 这一份只做三件事：**启动顺序**、**每帧调度**、**输入**。
// 任何规则都不许写在这里 —— 规则在 Script_Ai / Script_Player / Data_*。
//
// 调试口：window.Taierzhuang = { StepFrames, JumpToPhase, state, ... }
// 出图脚本（Script_ShotTest.mjs）与渲染健康检查全靠它，别删。

import * as THREE from "three";
import { MaterialLibrary } from "./Script_Materials.mjs";
import { SkyDome, SKY_PRESETS } from "./Script_Sky.mjs";
import { LightRig } from "./Script_Light.mjs";
import { PostPipeline } from "./Script_Post.mjs";
import { Battlefield } from "./Script_Battlefield.mjs";
import { PlayerController, STANCE } from "./Script_Player.mjs";
import { AiDirector, MakeSoldierIdentity } from "./Script_Ai.mjs";
import { ActorFactory } from "./Script_Actor.mjs";
import { Viewmodel } from "./Script_Viewmodel.mjs";
import { VfxSystem } from "./Script_Vfx.mjs";
import { AudioEngine } from "./Script_Audio.mjs";
import { Hud } from "./Script_Hud.mjs";
import { WEAPONS } from "./Data_Weapons.mjs";
import { OBJECTIVES, PHASES, REINFORCE, ORDERS, SCALE_PRESETS, WORLD, COMBAT } from "./Data_Battle.mjs";
import { HISTORY_NOTES } from "./Data_History.mjs";
import { Clamp, Clamp01, Mulberry32 } from "./Script_Noise.mjs";

const params = new URLSearchParams(location.search);
const QUALITY = params.get("quality") || "high";
const SCALE = SCALE_PRESETS[params.get("scale") || "medium"] || SCALE_PRESETS.medium;
const SHOT = params.get("shot");                 // 出图模式：不进指针锁、固定机位
const START_PHASE = Math.max(0, Math.min(PHASES.length - 1, parseInt(params.get("phase") || "0", 10)));

const canvas = document.getElementById("view");
const hudRoot = document.getElementById("hud");
const boot = document.getElementById("boot");
const bootBar = document.querySelector("#bootBar i");
const bootStep = document.getElementById("bootStep");
const bootStart = document.getElementById("bootStart");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.shadowMap.enabled = true;
// r185 的 shadowMapTypeDefines 里只有 PCFShadowMap 与 VSMShadowMap；
// 写 PCFSoftShadowMap 会掉进 SHADOWMAP_TYPE_BASIC（硬阴影 + 最近邻）。
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.NoToneMapping;      // 色调映射收在合成 pass 里
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.06, 620);
camera.rotation.order = "YXZ";

const post = new PostPipeline(renderer, {
  width: window.innerWidth, height: window.innerHeight, quality: QUALITY,
});
const ssao = {
  map: { value: post.AoTexture },
  resolution: { value: new THREE.Vector2(post.targets.aoBlur.width, post.targets.aoBlur.height) },
  strength: { value: 0.78 },
};
const library = new MaterialLibrary(renderer, { textureSize: QUALITY === "low" ? 256 : 512, ssao });
const sky = new SkyDome(renderer);
scene.add(sky.mesh);
const lights = new LightRig(scene, { quality: QUALITY, shadowExtent: 66 });
const hud = new Hud(hudRoot);
const audio = new AudioEngine({ enabled: !SHOT });

const state = {
  ready: false,
  running: false,
  elapsed: 0,
  frame: 0,
  phaseIndex: START_PHASE,
  phaseTime: 0,
  nraPool: 0,
  ijaPool: 0,
  fallen: [],                 // 阵亡名单：每换一个人就多一条
  deathTimer: 0,
  pendingRespawn: false,
  identity: null,
  order: "follow",
  ordersOpen: false,
  spawnAccumulator: 0,
};

let battlefield = null;
let player = null;
let ai = null;
let vfx = null;
let viewmodel = null;
let actorFactory = null;
let currentWeapon = "HanYang";

// ---------------------------------------------------------------------------
// 启动
// ---------------------------------------------------------------------------
async function Boot() {
  const nextFrame = () => new Promise((r) => requestAnimationFrame(r));
  const setStep = (label, progress) => {
    bootStep.textContent = label;
    bootBar.style.width = `${Math.round(progress * 100)}%`;
  };

  setStep("烘贴图……", 0.02);
  let baked = 0;
  const total = 15;
  for (const name of library.PrepareSteps()) {
    baked += 1;
    setStep(`烘贴图 ${baked}/${total} · ${name}`, 0.02 + 0.22 * (baked / total));
    await nextFrame();
  }

  const phase = PHASES[state.phaseIndex];
  const preset = sky.Apply(phase.sky);
  sky.BakeEnvironment(scene);
  lights.ApplyPreset(preset, sky.sunDirection);
  scene.fog = new THREE.Fog(preset.fogColor, preset.fogNear, preset.fogFar);

  battlefield = new Battlefield(scene, library, { quality: QUALITY });
  for (const step of battlefield.BuildSteps()) {
    setStep(step.label, 0.24 + 0.62 * step.progress);
    await nextFrame();
  }

  setStep("上刺刀……", 0.9);
  actorFactory = new ActorFactory(library, { quality: QUALITY });
  vfx = new VfxSystem(scene, library, { quality: QUALITY, maxParticles: SCALE.vfxBudget });
  viewmodel = new Viewmodel(library, { fov: 52 });
  camera.add(viewmodel.root);
  scene.add(camera);
  if (viewmodel.markNoPrepass) viewmodel.markNoPrepass();

  player = new PlayerController(camera, {
    colliders: battlefield.colliders,
    NearbyColliders: (x, z, r) => battlefield.NearbyColliders(x, z, r),
    GroundHeight: (x, z) => battlefield.GroundHeight(x, z),
    bounds: battlefield.bounds,
  }, { seed: 1938 });

  ai = new AiDirector({
    battlefield, actorFactory, scene, vfx, audio, player,
  }, { maxAlive: SCALE.maxAlive, seed: 19380324 });

  await nextFrame();
  setStep("就绪", 1.0);
  EnterPhase(state.phaseIndex, true);
  state.ready = true;
  bootStart.disabled = false;
  bootStart.textContent = SHOT ? "（出图模式）" : "进 城";

  window.Taierzhuang = {
    renderer, scene, camera, post, sky, lights, library, battlefield,
    player, ai, vfx, viewmodel, hud, audio, state,
    StepFrames, JumpToPhase: EnterPhase,
  };

  if (SHOT) StartRun();
}

// ---------------------------------------------------------------------------
// 阶段
// ---------------------------------------------------------------------------
function EnterPhase(index, initial = false) {
  state.phaseIndex = Clamp(index, 0, PHASES.length - 1);
  const phase = PHASES[state.phaseIndex];
  state.phaseTime = 0;
  state.nraPool = initial ? phase.nraPool : REINFORCE.phaseRefill(state.nraPool, phase.nraPool);
  state.ijaPool = phase.ijaPool;

  const preset = sky.Apply(phase.sky);
  sky.BakeEnvironment(scene);
  lights.ApplyPreset(preset, sky.sunDirection);
  if (scene.fog) {
    scene.fog.color.setHex(preset.fogColor);
    scene.fog.near = preset.fogNear;
    scene.fog.far = preset.fogFar;
  }
  hud.SetPhase(phase);
  hud.ShowBrief(phase);
  audio.Ambience(phase.sky === "night" ? "night" : phase.sky === "dawn" ? "dawn" : "battle");

  // 战线：反攻阶段之前，日军从北往南推；反攻阶段反过来
  if (initial || !player.Alive) RespawnPlayer(true);
  SeedSoldiers(phase);
}

/** 按阶段撒兵：中方守占领点，日方从北面压上来。 */
function SeedSoldiers(phase) {
  const rnd = Mulberry32(1000 + state.phaseIndex * 97);
  const nraTarget = Math.round(SCALE.maxAlive * 0.45);
  const ijaTarget = Math.round(SCALE.maxAlive * 0.5 * phase.ijaPressure / 1.3);

  // 中方：守住还在自己手里的点
  const ours = battlefield.objectives.filter((o) => o.owner === "nra");
  for (let i = ai.CountSide("nra"); i < nraTarget; i += 1) {
    const o = ours[Math.floor(rnd() * ours.length)] || battlefield.objectives[0];
    const open = FindOpenSpot(o.x, o.z, o.radius, 5000 + i * 733 + state.phaseIndex * 31);
    const s = ai.Spawn("nra", open.x, open.z, {
      towel: !!phase.nightRaid && rnd() < 0.55,
    });
    if (s) { s.holdZone = o; s.goal.set(o.x, 0, o.z); }
  }
  // 日方：从北面的出生带压进来
  for (let i = ai.CountSide("ija"); i < ijaTarget; i += 1) {
    const x = (rnd() - 0.5) * 380;
    const z = WORLD.minZ - 8 - rnd() * 24;
    const s = ai.Spawn("ija", x, z, { weapon: rnd() < 0.12 ? "Type11" : "Type38" });
    if (s) {
      const goal = battlefield.objectives.find((o) => o.owner === "nra") || battlefield.objectives[0];
      s.goal.set(goal.x + s.laneOffset, 0, goal.z + s.laneOffset * 0.4);
    }
  }
}

// ---------------------------------------------------------------------------
// 玩家的死与「填上去」
// ---------------------------------------------------------------------------
/**
 * 找一个能站人的地方。
 * 事故：直接拿占领点圆心 + 随机极坐标出生，一半的点落在院子里 ——
 * 鲁南民居对外不开窗、四面围墙，人一生出来就贴着一堵砖墙，转身也是墙。
 * 这里改成先在街上找：候选点必须**周围一米内没有齐胸以上的碰撞盒**。
 */
function FindOpenSpot(cx, cz, radius, seed) {
  const rnd = Mulberry32(seed);
  for (let i = 0; i < 48; i += 1) {
    const a = rnd() * Math.PI * 2;
    const r = radius * (0.25 + rnd() * 1.35);
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    if (x < WORLD.minX + 6 || x > WORLD.maxX - 6) continue;
    if (z < WORLD.minZ + 6 || z > WORLD.maxZ - 6) continue;
    const y = battlefield.GroundHeight(x, z);
    let blocked = false;
    for (const b of battlefield.NearbyColliders(x, z, 1.4)) {
      if (x < b.min[0] - 1.0 || x > b.max[0] + 1.0) continue;
      if (z < b.min[2] - 1.0 || z > b.max[2] + 1.0) continue;
      if (b.max[1] - y < 0.6) continue;              // 矮的东西不算挡路
      blocked = true;
      break;
    }
    if (!blocked) return { x, z };
  }
  return { x: cx, z: cz };
}

function RespawnPlayer(initial = false) {
  const phase = PHASES[state.phaseIndex];
  const seed = 7919 * (state.fallen.length + 1) + state.phaseIndex * 131;
  state.identity = MakeSoldierIdentity(seed);
  currentWeapon = state.identity.weapon;
  // 在还属于我方、离前线最近的那个点上生
  const ours = battlefield.objectives.filter((o) => o.owner === "nra");
  const spot = ours.length
    ? ours.reduce((a, b) => (a.z < b.z ? a : b))
    : { x: 0, z: 120, radius: 10 };
  // 往我方一侧退 18 米再找位置：生在点心上等于生在交火中央
  const open = FindOpenSpot(spot.x, spot.z + 18, spot.radius, seed);
  player.Spawn(open.x, open.z, Math.PI);
  player.bandages = COMBAT.bandages;
  viewmodel.Equip(currentWeapon);
  hud.SetIdentity(state.identity, WEAPONS[currentWeapon]?.name || "步枪");
  state.pendingRespawn = false;
}

function OnPlayerDown() {
  const identity = state.identity;
  state.fallen.push(identity);
  state.nraPool = Math.max(0, state.nraPool - 1);
  hud.ShowDeathCard(identity, "第三十一师 一八六团", REINFORCE.deathCardSeconds);
  state.deathTimer = REINFORCE.deathCardSeconds;
  state.pendingRespawn = true;
  audio.Play("bodyFall", { volume: 0.9 });
  // 池子见底：四月四日真下过的命令 —— 担架兵、炊事兵、伙夫都编进来
  if (state.nraPool > 0 && state.nraPool / PHASES[state.phaseIndex].nraPool < REINFORCE.lastDitchAt) {
    hud.Say("团长", REINFORCE.lastDitchLine, 6);
  }
}

// ---------------------------------------------------------------------------
// 输入
// ---------------------------------------------------------------------------
const input = {
  forward: 0, strafe: 0, sprint: false, ads: false, lean: 0,
  lookX: 0, lookY: 0, crouchPressed: false, pronePressed: false,
  breathHold: false, fire: false, sensitivity: 1,
};
const keys = new Set();

function StartRun() {
  boot.classList.add("gone");
  state.running = true;
  if (!SHOT) {
    canvas.requestPointerLock?.();
    audio.Unlock();
  }
}
bootStart.addEventListener("click", StartRun);

document.addEventListener("keydown", (e) => {
  if (keys.has(e.code)) return;
  keys.add(e.code);
  if (e.code === "KeyC") input.crouchPressed = true;
  if (e.code === "KeyZ") input.pronePressed = true;
  if (e.code === "KeyB") { if (player?.Bandage()) audio.Play("stripperLoad", { volume: 0.6 }); }
  if (e.code === "KeyR") viewmodel?.TriggerReload();
  if (e.code === "KeyV") viewmodel?.TriggerMelee();
  if (e.code === "Tab") { e.preventDefault(); state.ordersOpen = true; hud.SetOrdersVisible(true); }
  const order = ORDERS.find((o) => e.code === `Digit${o.key}`);
  if (order && ai && player) {
    const aimPoint = AimPoint(60);
    const n = ai.IssueOrder(order.id, player.position, aimPoint);
    state.order = order.label;
    if (n > 0) hud.Say("你", `${order.label}！`, 2.2);
  }
});
document.addEventListener("keyup", (e) => {
  keys.delete(e.code);
  if (e.code === "Tab") { state.ordersOpen = false; hud.SetOrdersVisible(false); }
});
document.addEventListener("mousemove", (e) => {
  if (document.pointerLockElement !== canvas) return;
  input.lookX += e.movementX;
  input.lookY += e.movementY;
});
document.addEventListener("mousedown", (e) => {
  if (!state.running) return;
  if (document.pointerLockElement !== canvas && !SHOT) { canvas.requestPointerLock?.(); return; }
  if (e.button === 0) input.fire = true;
  if (e.button === 2) input.ads = true;
});
document.addEventListener("mouseup", (e) => {
  if (e.button === 0) input.fire = false;
  if (e.button === 2) input.ads = false;
});
document.addEventListener("contextmenu", (e) => e.preventDefault());

function ReadKeys() {
  input.forward = (keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0);
  input.strafe = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);
  input.sprint = keys.has("ShiftLeft") || keys.has("ShiftRight");
  input.lean = (keys.has("KeyE") ? 1 : 0) - (keys.has("KeyQ") ? 1 : 0);
  input.breathHold = keys.has("Space");
}

const _aimDir = new THREE.Vector3();
const _aimPoint = new THREE.Vector3();
function AimPoint(maxDist = 120) {
  player.AimDirection(_aimDir);
  const from = player.EyePosition.clone();
  const hit = battlefield.Raycast(from, _aimDir, maxDist);
  const t = hit ? hit.t : maxDist;
  return _aimPoint.copy(from).addScaledVector(_aimDir, t);
}

// ---------------------------------------------------------------------------
// 开火
// ---------------------------------------------------------------------------
let fireCooldown = 0;
const _muzzle = new THREE.Vector3();
const _hitPoint = new THREE.Vector3();

function TryFire(dt) {
  fireCooldown -= dt;
  if (!input.fire || fireCooldown > 0 || !player.Alive) return;
  if (viewmodel.IsBusy?.()) return;
  const weapon = WEAPONS[currentWeapon];
  if (!weapon) return;
  fireCooldown = weapon.fireIntervalS ?? 1.2;

  viewmodel.TriggerFire();
  viewmodel.MuzzleWorld(_muzzle);
  audio.Play(currentWeapon === "Zb26" ? "zb26" : "rifleNra", { position: _muzzle.clone() });
  lights.FlashMuzzle(_muzzle, 24);
  vfx.MuzzleFlash(_muzzle, player.AimDirection(_aimDir), { scale: 1.0 });

  // 散布：没有准星，散布决定落点。移动、压制、带伤都会把它撑大。
  const spread = THREE.MathUtils.degToRad(player.SpreadDeg(weapon));
  const dir = player.AimDirection(_aimDir).clone();
  const rnd = Mulberry32(state.frame * 2654435761);
  const ax = (rnd() - 0.5) * spread, ay = (rnd() - 0.5) * spread;
  dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), ax);
  dir.applyAxisAngle(new THREE.Vector3(1, 0, 0), ay);

  const from = player.EyePosition.clone();
  const range = weapon.effectiveRangeM || 400;
  // 先看有没有打到人，再看有没有打到墙 —— 取更近的那个
  let bestSoldier = null, bestT = Infinity;
  for (const s of ai.soldiers) {
    if (!s.alive || s.side === "nra") continue;
    const to = s.position.clone(); to.y += 0.95;
    const rel = to.sub(from);
    const t = rel.dot(dir);
    if (t < 0 || t > range) continue;
    const perp = rel.addScaledVector(dir, -t).length();
    if (perp < 0.45 && t < bestT) { bestT = t; bestSoldier = s; }
  }
  const wallHit = battlefield.Raycast(from, dir, range);
  if (bestSoldier && (!wallHit || bestT < wallHit.t)) {
    _hitPoint.copy(from).addScaledVector(dir, bestT);
    const part = bestT < 40 && Mulberry32(state.frame * 7919)() < 0.12 ? "head" : "torso";
    const died = bestSoldier.TakeHit(weapon.damage, part, dir);
    vfx.Blood(_hitPoint, dir, died ? 1 : 0.5);
    audio.Play("impactFlesh", { position: _hitPoint.clone(), volume: 0.7 });
    if (died) state.ijaPool = Math.max(0, state.ijaPool - 1);
  } else if (wallHit) {
    _hitPoint.copy(from).addScaledVector(dir, wallHit.t);
    const n = new THREE.Vector3(wallHit.normal[0], wallHit.normal[1], wallHit.normal[2]);
    const surface = wallHit.box.tag === "barricade" ? "sandbag" : wallHit.box.tag === "prop" ? "wood" : "brick";
    vfx.Impact(_hitPoint, n, surface);
    audio.Play(surface === "sandbag" ? "impactDirt" : "impactBrick", { position: _hitPoint.clone(), volume: 0.55 });
  }
  vfx.Tracer(_muzzle, _hitPoint.lengthSq() ? _hitPoint : from.clone().addScaledVector(dir, range), { kind: "nra" });
}

// ---------------------------------------------------------------------------
// 占领
// ---------------------------------------------------------------------------
function UpdateObjectives(dt) {
  let contestedName = null;
  for (const o of battlefield.objectives) {
    let ours = 0, theirs = 0;
    if (player.Alive && Math.hypot(player.position.x - o.x, player.position.z - o.z) < o.radius) ours += 1;
    for (const s of ai.soldiers) {
      if (!s.alive) continue;
      if (Math.hypot(s.position.x - o.x, s.position.z - o.z) > o.radius) continue;
      if (s.side === "nra") ours += 1; else theirs += 1;
    }
    o.contested = ours > 0 && theirs > 0;
    if (o.contested) contestedName = o.name;
    // 双方都在区内就冻结；只有一方在就按人数推进度
    if (!o.contested) {
      const rate = dt / 26;
      if (theirs > 0 && o.owner === "nra") {
        o.progress -= rate * Math.min(3, theirs) * 0.6;
        if (o.progress <= 0) { o.progress = 0; Flip(o, "ija"); }
      } else if (ours > 0 && o.owner === "ija") {
        o.progress += rate * Math.min(3, ours) * 0.6;
        if (o.progress >= 1) { o.progress = 1; Flip(o, "nra"); }
      }
    }
  }
  return contestedName;
}

function Flip(objective, side) {
  objective.owner = side;
  objective.progress = side === "nra" ? 1 : 0;
  hud.Say(null, side === "nra"
    ? `${objective.name} 夺回来了。`
    : `${objective.name} 丢了。`, 4.2);
  if (objective.line) hud.Say(null, objective.line, 6);
  if (objective.note && HISTORY_NOTES[objective.note]) hud.Note(HISTORY_NOTES[objective.note]);
  if (side === "ija") {
    // 丢了点就把守军释放出来，让他们往下一个点退
    for (const s of ai.soldiers) if (s.holdZone === objective) s.holdZone = null;
  }
}

// ---------------------------------------------------------------------------
// 帧
// ---------------------------------------------------------------------------
const _forward = new THREE.Vector3();
const _proj = new THREE.Vector3();

function Frame(dt) {
  state.frame += 1;
  state.elapsed += dt;
  if (!state.ready) return;

  if (state.deathTimer > 0) {
    state.deathTimer -= dt;
    if (state.deathTimer <= 0 && state.pendingRespawn) {
      if (state.nraPool > 0) RespawnPlayer();
      else hud.Say(null, "没有人可以填上去了。", 8);
    }
  }

  ReadKeys();
  const wasAlive = player.Alive;
  player.Update(dt, input, WEAPONS[currentWeapon]);
  input.lookX = 0; input.lookY = 0;
  input.crouchPressed = false; input.pronePressed = false;
  if (wasAlive && !player.Alive) OnPlayerDown();

  if (player.Alive) TryFire(dt);

  // 开镜时相机 FOV 收缩 —— 铁瞄的"贴脸"感来自这一下
  const weapon = WEAPONS[currentWeapon];
  const targetFov = 70 * (1 - player.ads * (1 - (weapon?.adsFovScale ?? 0.75)));
  if (Math.abs(camera.fov - targetFov) > 0.01) {
    camera.fov += (targetFov - camera.fov) * Clamp01(dt * 9);
    camera.updateProjectionMatrix();
  }

  viewmodel.Update(dt, {
    dt, moveSpeed: Clamp01(Math.hypot(player.velocity.x, player.velocity.z) / 3.2),
    strafe: input.strafe, grounded: player.grounded, sprint: player.sprint,
    ads: player.ads, lookDeltaYaw: 0, lookDeltaPitch: 0,
    crouch: player.stanceBlend.crouch, elapsed: state.elapsed,
  });

  ai.Update(dt, camera);
  vfx.Update(dt, camera, state.elapsed);
  sky.Update(state.elapsed);
  lights.Update(dt, state.elapsed);
  camera.getWorldDirection(_forward);
  lights.UpdateShadowFrustum(player.position, _forward);

  const contested = UpdateObjectives(dt);

  // 阶段推进：时间到了就往下走（战况只影响兵员池，不影响史实进程）
  state.phaseTime += dt;
  const phase = PHASES[state.phaseIndex];
  if (state.phaseTime > phase.minutes * 60 && state.phaseIndex < PHASES.length - 1) {
    EnterPhase(state.phaseIndex + 1);
  }
  // 补兵
  state.spawnAccumulator += dt;
  if (state.spawnAccumulator > 3) { state.spawnAccumulator = 0; SeedSoldiers(phase); }

  // --- HUD ---
  const ourZone = battlefield.objectives.find((o) =>
    Math.hypot(player.position.x - o.x, player.position.z - o.z) < o.radius);
  hud.SetObjective(contested ? `争夺中：${contested}` : (phase.label),
    state.nraPool, ourZone ? state.ijaPool : null);
  hud.SetState({
    stance: STANCE[player.stance].label,
    wounded: player.wounds.length > 0,
    bleeding: player.bleeding,
    bandages: player.bandages,
    breath: player.breathHold,
    order: state.order,
  });
  hud.SetSuppression(player.suppression);
  hud.SetDamage(Clamp01((1 - player.health / 70)) * 0.62);
  hud.UpdateMarkers(battlefield.objectives, camera, (x, y, z) => {
    _proj.set(x, y, z);
    const dist = _proj.distanceTo(camera.position);
    _proj.project(camera);
    return {
      x: (_proj.x * 0.5 + 0.5) * window.innerWidth,
      y: (-_proj.y * 0.5 + 0.5) * window.innerHeight,
      visible: _proj.z < 1 && Math.abs(_proj.x) < 1 && Math.abs(_proj.y) < 1,
      dist,
    };
  });
  hud.UpdateMinimap(dt, {
    player, objectives: battlefield.objectives, soldiers: ai.soldiers, bounds: battlefield.bounds,
  });
  hud.Update(dt);

  // --- 渲染 ---
  ssao.map.value = post.AoTexture;
  ssao.resolution.value.set(post.targets.aoBlur.width, post.targets.aoBlur.height);
  const preset = SKY_PRESETS[phase.sky];
  post.Render(scene, camera, {
    sunDirection: sky.sunDirection,
    exposure: preset.exposure,
    bloom: preset.bloom,
    godStrength: preset.godStrength,
    saturation: preset.saturation * (1 - player.suppression * 0.35),
    contrast: preset.contrast,
    grain: 0.034,
    vignette: 0.44 + player.suppression * 0.2,
    damage: Clamp01(1 - player.health / 62) * 0.55,
    motionBlur: 0.5,
  });
}

/** 出图/测试用：推进固定帧数（不依赖真实时间，画面可复现）。 */
function StepFrames(count = 1, dt = 1 / 60) {
  for (let i = 0; i < count; i += 1) Frame(dt);
}

let last = performance.now();
function Loop(now) {
  requestAnimationFrame(Loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!state.running) return;
  Frame(dt);
}
requestAnimationFrame(Loop);

window.addEventListener("resize", () => {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  post.SetSize(window.innerWidth, window.innerHeight);
});

Boot().catch((error) => {
  bootStep.textContent = "启动失败：" + error.message;
  console.error(error);
  throw error;
});
