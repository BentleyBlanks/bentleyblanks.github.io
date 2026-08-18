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

// 近身班组的人数：不是加出来的兵，是把原本撒在两百米外、被雾墙吃掉的人挪到镜头前。
// 别照着"近景要几个人"直接填这两个数 —— 实测一个 Actor 是 **37 个 draw call**
// （身体部件没合批），撒 14 个近身兵就把 phase4 的 calls 从 1043 顶到 1468，
// 越过 1400 的红线。5 + 4 落在 1300 上下。要再加人，先去合批 Actor。
const NEAR_SQUAD = { nra: 5, ija: 4 };

const params = new URLSearchParams(location.search);
const QUALITY = params.get("quality") || "high";
const SCALE = SCALE_PRESETS[params.get("scale") || "medium"] || SCALE_PRESETS.medium;
const SHOT = params.get("shot");                 // 出图模式：不进指针锁、固定机位
// 出图专用的两个常驻输入：开镜（E 组唯一能验的镜头）与开火（枪口焰/曳光/抛壳）。
// 必须在 ReadKeys **之后**盖上去 —— 直接写 player.ads 会在下一帧被
// player.Update(input) 里的 input.ads=false 覆盖成 0，实测就是这么白跑一轮的。
const SHOT_ADS = !!(SHOT && params.get("ads"));
const SHOT_FIRE = !!(SHOT && params.get("fire"));
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
// FOV 55：Easy Red 2 那种“周围很远、人很小但看得清”的观感靠窄视场。
// 70 度会把巷战拉成鱼眼，远处的人缩成一个点，尺度感全没了。
const BASE_FOV = 55;
const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.06, 620);
camera.rotation.order = "YXZ";

const post = new PostPipeline(renderer, {
  width: window.innerWidth, height: window.innerHeight, quality: QUALITY,
});
const ssao = {
  map: { value: post.AoTexture },
  // 这里必须是**主渲染靶**的尺寸，不是 AO 缓冲的尺寸。
  // 事故（连吃两轮）：Script_Materials 注入的采样是
  //   texture2D(uSsaoMap, gl_FragCoord.xy / uSsaoResolution)
  // gl_FragCoord 跑在 hdr 靶上（1600×900），而这里曾经喂 aoBlur 的尺寸 ——
  // high 档 aoScale=0.75，也就是 1200×675，UV 最大到 1.333：整张 AO 被放大
  // 1.333 倍并往左下错位，右上四分之一恒取边缘值。上一轮反复调 uRadius /
  // uIntensity 之所以毫无效果，是在调一张贴错位置的图。
  resolution: { value: new THREE.Vector2(post.width, post.height) },
  // 0.80：贴图位置修正后 AO 真的落在几何转折上了，1.85/0.95 那套是为了
  // 「错位之后还想看见点什么」硬抬起来的补偿值，退回正常量级
  strength: { value: 0.80 },
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
  smokeHandles: [],           // 常驻烟柱的 handle，换阶段时要一根根拆掉
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
  // 雾全部收到合成 pass 里做（高度雾 + 距离雾 + 按深度去饱和）。
  // 再留一份 THREE.Fog 就是双重打雾，远景直接糊成一块平板。
  scene.fog = null;

  battlefield = new Battlefield(scene, library, { quality: QUALITY });
  for (const step of battlefield.BuildSteps()) {
    setStep(step.label, 0.24 + 0.62 * step.progress);
    await nextFrame();
  }

  setStep("上刺刀……", 0.9);
  actorFactory = new ActorFactory(library, { quality: QUALITY });
  vfx = new VfxSystem(scene, library, { quality: QUALITY, maxParticles: SCALE.vfxBudget });
  // 浮尘：体积光要有介质才散射得出来，不然 godStrength 给再大也只是天上一片糊。
  // AmbientDust 会重建整个 DustField（丢旧的、建新的），所以只在这里调一次，
  // 别放进 EnterPhase —— 每换一关重建一次粒子网格是白扔的 GC。
  vfx.AmbientDust(new THREE.Box3(
    new THREE.Vector3(battlefield.bounds.minX, 0, battlefield.bounds.minZ),
    new THREE.Vector3(battlefield.bounds.maxX, 22, battlefield.bounds.maxZ)), 0.075);
  // depthBudget 1.22（默认 0.90）：腰射姿态把枪往前推到 pz = -0.32 之后，
  // 最深点（枪口 + 刺刀）变成 |0.32 + 0.8175| + 0.04 + 0.02 ≈ 1.20 m，
  // 沿用 0.90 会被 _RecomputeCompensation 压到 0.55 的下限，枪整体缩到眼前 ——
  // 画面不变（等比缩放绕相机原点是恒等的），但枪口离眼睛只剩半米，贴墙时会穿模
  viewmodel = new Viewmodel(library, { fov: 52, depthBudget: 1.22 });
  camera.add(viewmodel.root);
  scene.add(camera);
  // 视图模型的材质要退出深度法线预通道。Equip() 末尾会自己调一次，
  // 这里再调一次纯属兜底（构造期的抛壳池与弹夹道具）。
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
  hud.SetPhase(phase);
  hud.ShowBrief(phase);
  audio.Ambience(phase.sky === "night" ? "night" : phase.sky === "dawn" ? "dawn" : "battle");

  // 战线：反攻阶段之前，日军从北往南推；反攻阶段反过来
  if (initial || !player.Alive) RespawnPlayer(true);
  SeedSoldiers(phase);
  SeedSmokeColumns(phase);
}

/**
 * 按阶段挂三根常驻烟柱。
 *
 * 为什么非有不可：台儿庄打了半个月，天上一直是烟。没有烟柱的空街等于没打过仗，
 * 而且烟柱是这个场景里唯一能在三百米外读出来、又能把构图竖着切开的东西。
 * VfxSystem.SmokeSource 早就写好了，一次都没被调用过 —— 这里只是接线。
 *
 * 选点：优先已被日方拿下的目标（那儿在烧），不够就按离玩家的距离补。
 * 排掉 45 m 以内的：烟柱底盘半径十几米，长在脸上就是一堵灰墙。
 */
function SeedSmokeColumns(phase) {
  for (const handle of state.smokeHandles) vfx.RemoveSmokeSource(handle);
  state.smokeHandles.length = 0;

  const px = player.position.x;
  const pz = player.position.z;
  const ranked = battlefield.objectives
    .map((o) => ({ o, far: Math.hypot(o.x - px, o.z - pz) }))
    .filter((e) => e.far > 45)
    .sort((a, b) => {
      const ka = a.o.owner === "ija" ? 0 : 1;
      const kb = b.o.owner === "ija" ? 0 : 1;
      if (ka !== kb) return ka - kb;
      return a.far - b.far;
    });

  const burning = phase.sky === "burningStreet";
  for (const entry of ranked.slice(0, 3)) {
    const { o } = entry;
    const y = battlefield.GroundHeight(o.x, o.z) + 1.1;
    // rate 15 而不是拍脑袋的 26：烟池容量 = vfxBudget × 0.30，小规模档只有 660 个，
    // 三根柱子 × 26/s × 9 s ≈ 700 会把池子占满，爆炸和枪口烟就一个都出不来了
    state.smokeHandles.push(vfx.SmokeSource({ x: o.x, y, z: o.z }, {
      kind: "black", rate: 15, radius: 1.1, rise: 3.4,
      sizeStart: 1.2, sizeEnd: 11.0, life: 9.0, opacity: 0.34,
      fire: burning ? 0.35 : 0,
    }));
  }
}

/** 玩家周围半径 r 米内还活着的某一方人数。近身班组靠它「补齐」而不是「每次都加」。 */
function CountNear(side, radius) {
  let n = 0;
  for (const s of ai.soldiers) {
    if (!s.alive || s.side !== side) continue;
    if (Math.hypot(s.position.x - player.position.x, s.position.z - player.position.z) <= radius) n += 1;
  }
  return n;
}

const _losFrom = new THREE.Vector3();
const _losDir = new THREE.Vector3();
/**
 * 从玩家眼位到某个落点的胸口（+1.3 m）有没有被静态碰撞体挡死。
 *
 * 为什么非加这一条：上一轮的验收指标是错的 —— "投影在视锥内 23 人"被当成达标，
 * 实测最近两名（15.3 m / 15.9 m）在木板围墙后、44.7 m 那名在砖墙后，
 * 六张正片里一共只出现一个人。而鲁南民居**对外不开窗、四面围墙**，
 * 随便撒一个点有一多半落在别人家院子里，玩家永远看不见。
 * 往战场里加人已经撞了 draw call 红线，所以只能让已有的人被看见 ——
 * 这是零 draw call 成本的做法。
 */
function HasLineOfSight(toX, toZ) {
  _losFrom.copy(player.EyePosition);
  const toY = battlefield.GroundHeight(toX, toZ) + 1.3;
  _losDir.set(toX - _losFrom.x, toY - _losFrom.y, toZ - _losFrom.z);
  const dist = _losDir.length();
  if (dist < 1e-3) return true;
  _losDir.multiplyScalar(1 / dist);
  const hit = battlefield.Raycast(_losFrom, _losDir, dist);
  // 留 0.6 m 余量：擦着人身边的墙角不算挡住
  return !hit || hit.t >= dist - 0.6;
}

/** 按阶段撒兵：中方守占领点，日方从北面压上来。 */
function SeedSoldiers(phase) {
  const rnd = Mulberry32(1000 + state.phaseIndex * 97);
  // 两个目标数**不减**近身班组：下面两个循环的起点是 CountSide(...)，
  // 近身班组撒完就已经计进去了。再减一次是双重扣减 ——
  // 实测那么写会让 phase0 的存活人数从 32 掉到 19，等于把兵搬到镜头前又搬没了。
  const nraTarget = Math.round(SCALE.maxAlive * 0.45);
  const ijaTarget = Math.round(SCALE.maxAlive * 0.5 * phase.ijaPressure / 1.3);

  // --- 近身班组 -------------------------------------------------------------
  // 事故：实测 59—70 人存活，但 40 m 内只有 1—3 人、120 m 外 43—49 人，
  // 而 fog.max = 0.94 —— 兵是有的，全被雾墙吃掉了，同屏「一个能辨认的人都没有」。
  // 撒兵原本只按占领点铺，占领点离玩家动辄一两百米。这里按**镜头**再补一层：
  // 12—34 m 的环里放中方（近景剪影），55—110 m 的视线方向上放日方（中景）。
  // 用「补齐到 N」而不是「每次加 N」：SeedSoldiers 每 3 秒被调一次，
  // 无条件加人会在半分钟内把整个 maxAlive 名额全填成玩家脚边的人。
  const px = player.position.x;
  const pz = player.position.z;
  const fx = -Math.sin(player.yaw);
  const fz = -Math.cos(player.yaw);
  for (let i = CountNear("nra", 40); i < NEAR_SQUAD.nra; i += 1) {
    // 前向弧而不是整圈：整圈撒 5 个人，85° 的水平视场只兜得住 1 个。
    // 这一班本来就是"跟着你往前打"的，压在前方 ±110° 里既合理又让同屏多两个人。
    // 直接转前向量，不要去凑"yaw 对应的极角"—— player.yaw 的零向是 -Z，
    // 跟 atan2(z, x) 差一个 -yaw - π/2，凭印象写必错，兵会撒到背后去
    let open = null;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const a = (rnd() - 0.5) * 3.8;
      const dx = fx * Math.cos(a) - fz * Math.sin(a);
      const dz = fz * Math.cos(a) + fx * Math.sin(a);
      const r = 12 + rnd() * 22;
      const spot = FindOpenSpot(px + dx * r, pz + dz * r, 6,
        31337 + i * 907 + attempt * 17 + state.phaseIndex * 53);
      open = spot;
      if (HasLineOfSight(spot.x, spot.z)) break;
    }
    const s = ai.Spawn("nra", open.x, open.z, { towel: !!phase.nightRaid && rnd() < 0.55 });
    // 不给 holdZone：这一班是跟着镜头走的，钉在占领区里就又跑没影了
    if (s) { s.holdZone = null; s.goal.set(px + fx * 15, 0, pz + fz * 15); }
  }
  for (let i = CountNear("ija", 110); i < NEAR_SQUAD.ija; i += 1) {
    let open = null;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const d = 55 + rnd() * 55;
      const lateral = (rnd() - 0.5) * 46;
      const spot = FindOpenSpot(px + fx * d - fz * lateral, pz + fz * d + fx * lateral, 8,
        65521 + i * 1361 + attempt * 29 + state.phaseIndex * 89);
      open = spot;
      if (HasLineOfSight(spot.x, spot.z)) break;
    }
    const s = ai.Spawn("ija", open.x, open.z, { weapon: rnd() < 0.12 ? "Type11" : "Type38" });
    if (s) s.goal.set(px + s.laneOffset, 0, pz + s.laneOffset * 0.4);
  }

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
  if (SHOT_ADS) input.ads = true;
  if (SHOT_FIRE) input.fire = true;
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
  const targetFov = BASE_FOV * (1 - player.ads * (1 - (weapon?.adsFovScale ?? 0.75)));
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
  // 同上：gl_FragCoord 在主靶的像素域里，喂 AO 靶尺寸会整张错位
  ssao.resolution.value.set(post.width, post.height);
  const preset = SKY_PRESETS[phase.sky];
  post.Render(scene, camera, {
    sunDirection: sky.sunDirection,
    sunColor: preset.sunColor,
    fog: preset.fog,
    exposure: preset.exposure,
    bloom: preset.bloom,
    godStrength: preset.godStrength,
    saturation: preset.saturation * (1 - player.suppression * 0.35),
    contrast: preset.contrast,
    grain: phase.sky === "night" ? 0.020 : 0.014,
    vignette: 0.42 + player.suppression * 0.22,
    damage: Clamp01(1 - player.health / 62) * 0.55,
    motionBlur: 0.15,
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
