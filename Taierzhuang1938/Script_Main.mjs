// 《滕县 一九三八》装配层：把渲染、城、玩家、AI、特效、音效、HUD、过场拼起来。
//
// 这一份只做四件事：**启动顺序**、**关卡流程**、**每帧调度**、**输入**。
// 任何规则都不许写在这里 —— 规则在 Script_Ai / Script_Player / Script_Story / Data_*。
//
// 与台儿庄那一版最大的结构差别：**关是线性的，而且每关只建一片切片。**
// 台儿庄是一张开放战场建一次跑到底；滕县七关的地理跨度有两公里
//（界河在城北二十公里外、车站在城西 1.45 km、东关在城东 520 m），
// 一次全建出来既撞 draw call 红线也没有意义 —— 玩家在第二关永远看不见车站。
// 所以换关 = 拆掉旧切片、按 Data_Battle.PHASES[i].bounds 重建一片。
//
// 调试口：window.Taierzhuang = { StepFrames, JumpToPhase, state, ... }
//（全局名沿用 Taierzhuang —— 出图脚本、开机冒烟、通关冒烟三处都按它取运行时。
//  window.Tengxian 是同一个对象的别名。）

import * as THREE from "three";
import { MaterialLibrary } from "./Script_Materials.mjs";
import { SkyDome, SKY_PRESETS } from "./Script_Sky.mjs";
import { LightRig } from "./Script_Light.mjs";
import { ProbeVolume, MakeGiUniforms, GI_QUALITY } from "./Script_Gi.mjs";
import { PostPipeline } from "./Script_Post.mjs";
import { TengxianField } from "./Script_TengxianField.mjs";
import { JieheField, JIEHE_LEVEL_ID, JIEHE_CAMERA_FAR } from "./Script_JieheField.mjs";
import { NavGrid } from "./Script_Navigation.mjs";
import { PlayerController, STANCE } from "./Script_Player.mjs";
import { AiDirector, MakeSoldierIdentity } from "./Script_Ai.mjs";
import { ActorFactory } from "./Script_Actor.mjs";
import { Viewmodel } from "./Script_Viewmodel.mjs";
import { VfxSystem } from "./Script_Vfx.mjs";
import { AudioEngine } from "./Script_Audio.mjs";
import { Hud } from "./Script_Hud.mjs";
import { StoryDirector } from "./Script_Story.mjs";
import { CutsceneDirector } from "./Script_Cutscene.mjs";
import { CombatSystem } from "./Script_Combat.mjs";
import { InputRouter } from "./Script_Input.mjs";
import { RadialWheel } from "./Script_Wheel.mjs";
import { InteractSystem } from "./Script_Interact.mjs";
import { EditorSuite } from "./Script_Editor.mjs";
import { MainMenu, Progress } from "./Script_Menu.mjs";
import { MENU_SCENE } from "./Data_Menu.mjs";
import { WEAPONS, LOADOUTS, AMMO } from "./Data_Weapons.mjs";
import { PHASES, REINFORCE, ORDERS, SCALE_PRESETS, WORLD, COMBAT, DIFFICULTY, EPILOGUE } from "./Data_Battle.mjs";
import { Clamp, Clamp01, Mulberry32 } from "./Script_Noise.mjs";

// 近身班组的人数：不是加出来的兵，是把原本撒在两百米外、被雾墙吃掉的人挪到镜头前。
// 别照着"近景要几个人"直接填这两个数 —— 实测一个 Actor 是 **37 个 draw call**
// （身体部件没合批），撒 14 个近身兵就把 calls 顶过 1400 的红线。
// 5 + 4 落在安全区里。要再加人，先去合批 Actor。
const NEAR_SQUAD = { nra: 5, ija: 4 };

/**
 * 本关的可站范围。**任何一侧的兵都不许被放到切片外面去。**
 *
 * 台儿庄那一版这里是 INSIDE_WALLS（一个写死的城墙内矩形），已作废：
 * 滕县七关有三关根本不在城里（界河、西关、城北麦地），
 * 而在城里的四关又各只用城的一角。所以这个框改成**跟着关卡切片走**，
 * 在 EnterLevel 里按 PHASES[i].bounds 现算。
 *
 * 这条不变量本身照旧，而且照旧是实跑逼出来的：撒兵有五条路径
 *（守路标、补兵、近身班组、玩家重生、软约束重设目标），
 * 漏掉任何一条，就会出现"两军隔着一堵墙贴脸站着谁也看不见谁"那种停摆。
 */
let levelBounds = { minX: -300, maxX: 300, minZ: -300, maxZ: 300 };

function MakeLevelBounds(bounds) {
  const margin = 10;
  return {
    minX: bounds.minX + margin, maxX: bounds.maxX - margin,
    minZ: bounds.minZ + margin, maxZ: bounds.maxZ - margin,
  };
}

const params = new URLSearchParams(location.search);
const QUALITY = params.get("quality") || "high";
const SCALE = SCALE_PRESETS[params.get("scale") || "medium"] || SCALE_PRESETS.medium;
const SHOT = params.get("shot");                 // 出图模式：不进指针锁、固定机位
// 出图专用的两个常驻输入：开镜（E 组唯一能验的镜头）与开火（枪口焰/曳光/抛壳）。
// 必须在 ReadKeys **之后**盖上去 —— 直接写 player.ads 会在下一帧被
// player.Update(input) 里的 input.ads=false 覆盖成 0，实测就是这么白跑一轮的。
const SHOT_ADS = !!(SHOT && params.get("ads"));
const SHOT_FIRE = !!(SHOT && params.get("fire"));
/**
 * 主菜单。**出图与 ?menu=0 下不建** —— 那两种模式要的是「进页面就是这一关」：
 * 三个冒烟脚本（PlayTest / EditorTest / VoiceTest）点的都是 #bootStart 那颗按钮，
 * 出图脚本连点都不点，直接 StepFrames。菜单只服务真人。
 */
const MENU_ON = !SHOT && params.get("menu") !== "0";
/**
 * 开机建哪一片切片。
 * 给了 ?phase= 就听它的（出图、冒烟、调机位都靠这条）；
 * 没给且要进菜单，就建 MENU_SCENE.slice —— 菜单背后那片活场景是城墙那一关，
 * 城墙是这座城的招牌，序关的界河是二十公里外的空地，当不了门面。
 */
const PHASE_PARAM = params.get("phase");
const MENU_SLICE = Math.max(0, PHASES.findIndex((p) => p.id === MENU_SCENE.slice));
const START_PHASE = PHASE_PARAM !== null
  ? Math.max(0, Math.min(PHASES.length - 1, parseInt(PHASE_PARAM, 10)))
  : (MENU_ON ? MENU_SLICE : 0);

const canvas = document.getElementById("view");
const hudRoot = document.getElementById("hud");
const menuRoot = document.getElementById("menu");
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
// SSAO 的出厂强度。设置面板按倍率乘它，所以要有个名字。
const SSAO_BASE = 0.80;
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
  strength: { value: SSAO_BASE },
};

/**
 * 画质旋钮。
 *
 * 与天光预设**分工分明**：预设（SKY_PRESETS）决定这一关「长什么样」——
 * 曝光、雾色、泛光阈值全是美术意图，不许被设置面板改掉；
 * 这张表只决定「画多重」，一律以**倍率**的形式乘在预设算出来的那几项上。
 * 混在一张表里的下场是玩家把画质调低之后夜战关变成纯黑（预设 exposure 3.6 被当成
 * 画质项一起压了）。
 *
 * renderScale 是唯一真正省时间的那一项：整条合成链（法线深度、AO、泛光六级、
 * 体积光、运动模糊）都按 post 靶的尺寸走，它减半等于这一整条链省四分之三。
 */
const graphics = {
  renderScale: 1.0,
  shadows: true,
  shadowSize: 0,          // 0 = 用出厂档位
  ssao: 1, bloom: 1, god: 1, motionBlur: 1, grain: 1, vignette: 1,
  // 探针体：开关 + 强度倍率。强度乘在预设的 envIntensity 上（跟其它后处理项一个规矩：
  // 预设定「这一关的天有多强」，设置只定「画多重」）。
  gi: true, giStrength: 1,
  fov: BASE_FOV,
};
// 探针体（GI）。low 档与 ?gi=0 都直接不建 —— 建了再关等于白背一套 shader 分支。
const GI_ON = GI_QUALITY[QUALITY] != null && params.get("gi") !== "0";
const giUniforms = MakeGiUniforms();
const library = new MaterialLibrary(renderer, {
  textureSize: QUALITY === "low" ? 256 : 512, ssao, gi: GI_ON ? giUniforms : null,
});
const sky = new SkyDome(renderer);
scene.add(sky.mesh);
const lights = new LightRig(scene, { quality: QUALITY, shadowExtent: 66 });
// 天空 uniform 借给探针体：漏空的射线问的是同一片天，换预设两边同时变
const gi = GI_ON
  ? new ProbeVolume(renderer, { quality: QUALITY, skyUniforms: sky.uniforms, uniforms: giUniforms })
  : null;
const hud = new Hud(hudRoot);
const audio = new AudioEngine({ enabled: !SHOT });

const state = {
  ready: false,
  running: false,
  // 菜单态：主菜单开着（开机那一次或从暂停回来）。running 与它互斥 ——
  // 菜单在跑运镜时玩法必须整个停摆，否则玩家会在看菜单的时候被打死。
  menu: false,
  // 现在**建好的**是哪一关的切片。与 phaseIndex 的区别只有一次性但要命：
  // 菜单背后那片场景可能是第四关，而玩家按「开始」要进的是第一关 ——
  // 这两个数不相等时必须重建切片，相等时不许重建（白等十几秒）。
  builtPhase: -1,
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
  // 弹药账。杂牌部队的弹是紧的：中央军一条带装一百发，第 2 集团军「最多也就二三十发」。
  // 之前开火不消耗、不需要装填，桥夹压弹那套动画白做了。
  ammo: 0, clips: 0, grenades: 0, bundles: 0,
  cook: 0,                    // 投弹蓄力/攥弹时间
  cooking: null,              // "Grenade" | "GrenadeBundle"
  outcome: null,              // null | "victory" | "defeat"
  // --- 线性关卡的流程状态 ---
  objectiveIndex: 0,          // 目标链走到第几个（= 已到达的路标数）
  objectiveCount: 0,
  levelSeconds: 0,            // 本关的配置时长（秒）
  advancing: false,           // 正在换关（建城是分帧的，期间不许再触发一次）
  cutscene: null,             // 正在播的过场 id；非 null 时玩家没有控制权
  // 钉住当前关（只给测试用）：剧本长跑要在**一关之内**按出厂时长推满，
  // 不许中途自动换关 —— 换关会重置剧本队列，量到的就不是这一关的剧本了。
  pinned: false,
  cutscenesPlayed: [],        // 播过/跳过的过场，通关冒烟看这张表
  prevAllies: 0,
  storyObjective: null,
  playerAliveLast: true,
  phasePoolNra: 0,            // 本阶段缩放后的中方票池上限（见底提示按它算）
  playerShots: 0,             // 玩家开火累计，与 ai.fireCount 合起来就是全场火力
  // --- 武器槽 ---------------------------------------------------------------
  // LOADOUTS 六套携行躺在 Data_Weapons 里一行没接：玩家永远只有 identity.weapon
  // 给的那一支长枪，大刀只在按 V 时凭空出现一下（硬编码 fallback，背包里根本没刀）。
  // 现在四个槽是真的：1 长枪 / 2 驳壳枪 / 3 大刀 / 4 投掷物，滚轮循环。
  slots: { primary: null, secondary: null, melee: null, throwable: "Grenade" },
  activeSlot: "primary",
  // 每支枪各记各的弹仓 —— 换回来不该是满的
  mags: { primary: { ammo: 0, clips: 0 }, secondary: { ammo: 0, clips: 0 } },
  loadoutId: null,
  fireMode: "auto",           // 仅捷克式可切（0 键）
  pickedUp: null,             // 最近一次从尸体上捡到的枪（取证用）
  lastShot: null,             // 最后一发的弹道取证：起点、落点、下坠、枪口视差
};

let battlefield = null;
let navGrid = null;
let player = null;
let ai = null;
let vfx = null;
let viewmodel = null;
let actorFactory = null;
let story = null;
let combat = null;
let interact = null;
let cutscene = null;
// 编辑器套件（齿轮按钮 + 五个编辑器）。Boot 末尾才建 —— 它拿的是活引用。
// 出图与两个冒烟里它照样建，只是整棵 DOM 被 .off 藏起来（截图里不许有它）。
let editor = null;
// 主菜单。同样是 Boot 末尾才建（要拿相机与建好的切片），出图与 ?menu=0 下不建。
let menu = null;
// Script_Ai 的全局人像预算，给"这一关没有自己的预算"时回落用。
// Boot 里从 AiDirector 实例上取真值 —— 不再 import 一次那个常量，只留一个真相。
let defaultVisibleActors = 13;
let currentWeapon = "HanYang";
// 下令轮盘。HUD 那条静态横排（1跟我来 2向前…）已经撤掉：
// ER2 的指挥手感是"按住 Tab 推一下鼠标松手"，眼睛不用离开战场。
const wheel = new RadialWheel(hudRoot);

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
  if (gi) gi.ApplyPreset(preset, graphics.giStrength);
  // 雾全部收到合成 pass 里做（高度雾 + 距离雾 + 按深度去饱和）。
  // 再留一份 THREE.Fog 就是双重打雾，远景直接糊成一块平板。
  scene.fog = null;

  await BuildField(PHASES[state.phaseIndex], setStep, 0.24, 0.62, nextFrame);

  setStep("上刺刀……", 0.9);
  actorFactory = new ActorFactory(library, { quality: QUALITY });
  // 人和枪的模型必须在造第一个 Actor 之前读完：KindGeometry / WeaponGeometry 是同步的
  // （它们在 Actor 构造函数里被调），拿不到文档就一律退回程序化方块几何。
  // 十四个 .tzm.json 加起来不到 300 KB，这一步的成本远小于"跑起来才发现没换模"。
  const meshes = await actorFactory.PreloadMeshes();
  if (meshes.missing.length) {
    // warn 不是 error：BootTest 把 console.error 当事故，而少一个模型只是降级不是崩
    console.warn(`[Main] 这些模型没读到，对应的人/枪退回方块几何：${meshes.missing.join(", ")}`);
  }
  setStep(`上刺刀…… 模型 ${meshes.loaded}/${meshes.requested}`, 0.92);
  vfx = new VfxSystem(scene, library, { quality: QUALITY, maxParticles: SCALE.vfxBudget });
  // 浮尘：体积光要有介质才散射得出来，不然 godStrength 给再大也只是天上一片糊。
  // AmbientDust 会重建整个 DustField（丢旧的、建新的），所以只在这里调一次，
  // 换关时由 EnterLevel 重新按新切片调一次，别每帧调。
  // 浮尘只罩玩家附近那一片：切片最大的一关跨两公里，按整片铺会把粒子摊薄到看不见
  vfx.AmbientDust(DustBox(PHASES[state.phaseIndex]), 0.075);
  // depthBudget 1.22（默认 0.90）：腰射姿态把枪往前推到 pz = -0.32 之后，
  // 最深点（枪口 + 刺刀）变成 |0.32 + 0.8175| + 0.04 + 0.02 ≈ 1.20 m，
  // 沿用 0.90 会被 _RecomputeCompensation 压到 0.55 的下限，枪整体缩到眼前 ——
  // 画面不变（等比缩放绕相机原点是恒等的），但枪口离眼睛只剩半米，贴墙时会穿模
  // meshDocs 直接借 ActorFactory 已经解码好的那份：同一个 .tzm.json 解两遍
  // 既多花开机时间又多占一份内存，而两边要的就是同一棵节点树。
  viewmodel = new Viewmodel(library, { fov: 52, depthBudget: 1.22, meshDocs: actorFactory.meshDocs });
  camera.add(viewmodel.root);
  scene.add(camera);
  // 视图模型的材质要退出深度法线预通道。Equip() 末尾会自己调一次，
  // 这里再调一次纯属兜底（构造期的抛壳池与弹夹道具）。
  if (viewmodel.markNoPrepass) viewmodel.markNoPrepass();

  player = new PlayerController(camera, {
    colliders: battlefield.colliders,
    NearbyColliders: (x, z, r) => battlefield.NearbyColliders(x, z, r),
    GroundHeight: (x, z) => battlefield.GroundHeight(x, z),
    // 下水判定。运河不做游泳系统，做一条软墙 —— 规则在 Script_Player，
    // 地形在 Script_Battlefield，装配层只负责把这条查询接上
    WaterDepth: (x, z, y) => battlefield.WaterDepth(x, z, y),
    bounds: battlefield.bounds,
  }, { seed: 1938 });

  // 导航网格：一张 2 m 一格的"走不走得过去"位图 + 按目标算的下坡场。
  // 没有它，AI 在这座四合院城里就是直奔一堵院墙（见 Script_Navigation 的账）。
  navGrid = MakeNavGrid(battlefield);
  const nav = navGrid;
  ai = new AiDirector({
    battlefield, actorFactory, scene, vfx, audio, player, nav,
    // 票池 = 兵力池：**谁死了扣谁的**。
    // 以前只有玩家的命和玩家的战绩会动票池，而 Combat.Blast 的 onKill 不带 side，
    // 装配层写死扣日方 —— 日军炮弹炸死中国兵扣的是日军的票。
    // 现在全部走 Soldier.Kill() 发出来的这一条事件，行内扣减一律删掉（会双扣）。
    onSoldierDeath: (side) => {
      if (side === "nra") state.nraPool = Math.max(0, state.nraPool - 1);
      else state.ijaPool = Math.max(0, state.ijaPool - 1);
    },
  }, { maxAlive: SCALE.maxAlive, seed: 19380317, insideWalls: levelBounds });
  defaultVisibleActors = ai.visibleBudget;

  // 叙事层：把 Data_TengxianScript 那本考据过的剧本按关派发。
  // 线性关卡不需要翻译层，剧本的 at 语义就是运行时语义（见 Script_Story 的头注）。
  story = new StoryDirector({ hud, audio });
  // 过场导演。onCapture/onRelease 是夺走与交还玩家控制权的钩子：
  // 过场期间 Frame() 只跑 director.Update 与渲染，玩法一律停摆
  //（不停的话玩家会在看电影的时候被打死，而且指针锁还在，鼠标会转动相机）。
  cutscene = new CutsceneDirector({
    camera, scene, hud, audio, actorFactory, library, root: hudRoot,
    onCapture: (cut) => {
      state.cutscene = cut.id;
      input.fire = false; input.ads = false; input.forward = 0; input.strafe = 0;
    },
    onRelease: () => { state.cutscene = null; },
  });
  combat = new CombatSystem({
    battlefield, ai, vfx, audio, lights, player, library, scene, story,
  });

  // F 通用交互。槽位与弹仓的账在装配层手里（state.slots / state.mags），
  // 所以规则在 Script_Interact，改状态的那三下通过 hooks 交回这里。
  interact = new InteractSystem({ ai, audio, hud }, {
    SpareClips: () => state.clips,
    TakeWeapon: (weaponId, clips) => PickUpWeapon(weaponId, clips),
    GiveClip: () => {
      if (state.clips <= 1) return false;
      state.clips -= 1;
      return true;
    },
  });

  await nextFrame();
  setStep("就绪", 1.0);
  await EnterLevel(state.phaseIndex, { initial: true, cutscenes: false });
  state.ready = true;
  bootStart.disabled = false;
  bootStart.textContent = SHOT ? "（出图模式）" : "进 城";


  // 各阶段的配置时长，给通关冒烟按出厂配置跑用
  state.phaseMinutes = PHASES.map((p) => p.minutes);
  window.Taierzhuang = {
    renderer, scene, camera, post, sky, lights, library, gi,
    player, ai, vfx, viewmodel, hud, audio, state, actorFactory, input,
    story, combat, interact, wheel,
    StepFrames, JumpToPhase: JumpToLevel, AdvanceLevel,
    // 通关冒烟用的口子：直接驱动动作，不必去合成键盘事件
    Debug: {
      Reload, DoMelee, CallMortar, EndBattle,
      Throw: (kind, power) => {
        state.cooking = kind; state.cook = (power ?? 0.8) * 1.1; ReleaseCook();
      },
      Fire: () => { input.fire = true; fireEdge = true; TryFire(1); input.fire = false; fireEdge = false; },
      // 键位路由：合成一次键盘事件走完整条链路（KEYMAP -> 上下文 -> OnAction），
      // 不许直接调 SwitchSlot —— 那样测的是函数，不是键位表。
      // 不给 down 就是"点按"：按下**并且松开**。
      // 只发 keydown 的话，InputRouter 会把第二次按下当成长按的自动重复直接吃掉
      // （held 里还留着这个 code），于是"按 1 再按 2 再按 1"只有头一次生效 ——
      // 通关冒烟里"切不回长枪"就是这么来的，而真人按键盘不会漏掉抬起。
      Key: (code, down) => {
        const Send = (type) => document.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
        if (down === undefined) { Send("keydown"); Send("keyup"); return; }
        Send(down ? "keydown" : "keyup");
      },
      Wheel: (delta) => {
        document.dispatchEvent(new WheelEvent("wheel", { deltaY: delta, bubbles: true }));
      },
      Slots: () => ({
        active: state.activeSlot, weapon: currentWeapon, loadout: state.loadoutId,
        slots: { ...state.slots }, viewmodel: viewmodel.weaponId,
        fireMode: state.fireMode, bipod: player.bipod, ads: player.ads,
      }),
      LastShot: () => (state.lastShot ? { ...state.lastShot } : null),
      Difficulty: () => ({ ...DIFFICULTY }),
      // --- 第 3 批的取证口 ---
      // 翻越：翻过几次、此刻在不在半空、脚下多高（上墙要靠这个高度取证）
      Vault: () => ({
        count: player.vaultCount, active: player.vault.active,
        y: player.position.y, x: player.position.x, z: player.position.z,
        aiVaults: ai.vaultCount,
      }),
      // 下水：淹了多深、算不算下水。软墙的三条代价（慢/不能开枪/掉体力）都挂在它上面
      Water: () => ({
        depth: player.waterDepth, inWater: player.InWater, stamina: player.stamina,
      }),
      // 下令轮盘：开着没有、此刻指着第几格、那一格是什么。
      // **名字不许叫 Wheel** —— 上面那个 Wheel 是"滚一下鼠标滚轮"，
      // 同名会把它整个盖掉：实跑里表现为滚轮切槽突然失灵，而两处代码都没错。
      Orders: () => ({
        open: state.ordersOpen, index: wheel.index, label: wheel.Label,
        cursor: { x: wheel.cursorX, y: wheel.cursorY }, order: state.order,
      }),
      // 交互：够得着什么、捡过几次、分过几次弹
      Interact: () => {
        const c = interact.Query(player);
        return {
          kind: c ? c.kind : null, label: c ? c.label : null,
          pickups: interact.pickups, handouts: interact.handouts,
          pickedUp: state.pickedUp, weapon: currentWeapon,
        };
      },
      AdsOffset: () => ({ x: viewmodel.adsOffset.x, y: viewmodel.adsOffset.y }),
      // AI 那边的运行时取证口：某个兵此刻的完整状态
      SoldierInfo: (soldier) => ({
        id: soldier.id, side: soldier.side, state: soldier.state, order: soldier.order,
        holdZone: soldier.holdZone ? soldier.holdZone.id : null,
        bayonet: soldier.bayonetFixed, heat: soldier.heat,
        coolFor: Math.max(0, soldier.coolUntil - ai.time),
        x: soldier.position.x, z: soldier.position.z,
        goalX: soldier.goal.x, goalZ: soldier.goal.z,
      }),
      Ammo: () => ({ ammo: state.ammo, clips: state.clips, grenades: state.grenades, bundles: state.bundles }),
      // --- 线性关卡的取证口 ---
      // 这一关是哪一关、目标链走到第几个、路标各在哪儿。
      // 「七关能依次推进」这条断言只能从这里读，读源码是推断不出来的。
      Level: () => {
        const phase = PHASES[state.phaseIndex];
        return {
          index: state.phaseIndex, id: phase.id, title: phase.label,
          objectiveIndex: state.objectiveIndex, objectiveCount: state.objectiveCount,
          objective: state.storyObjective,
          zones: battlefield.objectives.map((o) => ({
            id: o.id, name: o.name, x: o.x, z: o.z, radius: o.radius, reached: o.reached,
          })),
          seconds: state.levelSeconds, elapsed: state.phaseTime,
          pool: state.nraPool, advancing: state.advancing,
        };
      },
      // 直接把玩家挪到第 n 个路标里（通关冒烟靠它一关一关推，不必真走两公里）
      GotoObjective: (n) => {
        const objectives = battlefield.objectives;
        const o = objectives[Math.min(Math.max(0, n), objectives.length - 1)];
        if (!o) return null;
        player.Spawn(o.x, o.z, player.yaw);
        return { x: o.x, z: o.z, id: o.id };
      },
      // 把当前这一关的目标链一路点完（不动画、不等 AI 让开）
      CompleteLevel: () => {
        const objectives = battlefield.objectives;
        for (let i = state.objectiveIndex; i < objectives.length; i += 1) ReachObjective(i);
        return state.objectiveIndex;
      },
      AdvanceLevel: (opts) => AdvanceLevel(opts || {}),
      // 钉住/放开当前关。剧本长跑要用它，见 state.pinned 的注释。
      PinLevel: (on) => { state.pinned = on !== false; return state.pinned; },
      // --- 过场的取证口 ---
      PlayCutscene: (id) => RunCutscene(id),
      SkipCutscene: () => { if (cutscene) cutscene.Skip(); return !!cutscene; },
      Cutscene: () => ({
        playing: cutscene ? cutscene.Playing : false,
        current: cutscene ? cutscene.CurrentId : null,
        time: cutscene ? cutscene.Time : 0,
        played: state.cutscenesPlayed.slice(),
        log: cutscene ? cutscene.log.slice(-40) : [],
      }),
      // --- 枪感第 2 轮的取证口 ---
      // 顿挫量、冲刺闸门、sway 输入。四条方子有没有真的接上只能从这里读。
      GunFeel: () => ({
        firePunch,
        fovBase: graphics.fov,
        fov: camera.fov,
        sprintBlocked: player.sprint > 0.35
          || (state.elapsed - sprintReleaseAt) < SPRINT_FIRE_DELAY_S,
        sinceSprint: state.elapsed - sprintReleaseAt,
        swayYaw: viewmodel.swayYaw ? viewmodel.swayYaw.value : null,
        lastLookDeltaYaw: lastLookDeltaYaw,
        lowAmmo: state.ammo <= 1,
        boltOpen: viewmodel.boltOpen,
      }),
      // 指针锁：解锁通道有没有真的接上。fake=true 说明走的是页内假后端
      // （webdriver / 出图），真指针锁一次都没碰 —— 见 FAKE_POINTER_LOCK 的注释。
      PointerLock: () => ({
        locked: PointerLocked(),
        element: PointerLocked() ? "canvas" : null,
        fake: FAKE_POINTER_LOCK,
        browserLocked: document.pointerLockElement !== null,
      }),
      ReleasePointerLock,
      Spoken: () => hud.spoken.slice(),
      StoryFired: () => story.fired.slice(),
      Outcome: () => state.outcome,
      // 「仗有没有真的在打」只能从运行时取证：全场开火累计（AI + 玩家）、
      // AI 的状态分布、两侧的阵亡计数。读源码是推断不出来的。
      FireCount: () => ai.fireCount + state.playerShots,
      AiStates: () => {
        const out = {};
        for (const s2 of ai.soldiers) {
          if (!s2.alive) continue;
          out[s2.state] = (out[s2.state] || 0) + 1;
        }
        return out;
      },
      Deaths: () => ({ ...ai.deaths }),
      OpenDirections: (x, z, count = 72, probeM = 20) =>
        CountOpenDirections(x, z, battlefield.GroundHeight(x, z), probeM, count),
    },
  };
  // battlefield 与 nav **每换一关都会被换成新的一份**（切片重建）。
  // 写成普通属性的话，调试口会一直指着上一关那份已经 Dispose 掉的城 ——
  // 表现是"取证读出来的碰撞盒表是空的"，而代码看起来完全正确。所以用取值器。
  Object.defineProperty(window.Taierzhuang, "battlefield", { get: () => battlefield });
  Object.defineProperty(window.Taierzhuang, "nav", { get: () => navGrid });
  Object.defineProperty(window.Taierzhuang, "cutscene", { get: () => cutscene });

  // 别名：全局名沿用 Taierzhuang 是为了不动出图脚本与两个冒烟（三处都按它取运行时），
  // 但这个项目现在是滕县，新写的东西一律用 window.Tengxian。**两个名字是同一个对象。**
  window.Tengxian = window.Taierzhuang;

  // --- 编辑器套件 ---------------------------------------------------------
  // 建在最后：五个编辑器要的东西（材质库、人物工厂、视图模型、过场导演、城）
  // 到这一步才齐。battlefield 每换一关都是新的一份，所以走取值器交出去，
  // 不许在这里把当时那一份拷进去（拷了就是「编辑器指着上一关那座城」）。
  editor = new EditorSuite({
    renderer, scene, camera, canvas, library, lights, post,
    actorFactory, viewmodel, audio, cutscene,
    shot: !!SHOT,
    ReleasePointerLock,
    game: {
      state, PHASES, JumpToLevel, graphics, ApplyGraphics, gi,
      get battlefield() { return battlefield; },
      get player() { return player; },
      get currentWeapon() { return currentWeapon; },
    },
  });
  window.Taierzhuang.editor = editor;
  // 编辑器的取证口：冒烟测试不点按钮，直接从这里开关与读状态
  window.Taierzhuang.Debug.OpenEditor = (id) => !!editor.Open(id);
  window.Taierzhuang.Debug.CloseEditor = () => { editor.TogglePanel(false); };
  window.Taierzhuang.Debug.Editor = () => ({
    panelOpen: editor.panelOpen,
    active: editor.ActiveId,
    capturing: editor.Capturing,
    studio: editor.studio.Active,
    fly: editor.flycam.Active,
    hidden: !!document.getElementById("edRoot")
      && document.getElementById("edRoot").classList.contains("off"),
  });

  // --- 主菜单 --------------------------------------------------------------
  // 建在最末：它要拿相机、要知道现在建好的是哪一关（决定用哪一组机位），
  // 还要能把编辑器的齿轮藏起来 —— 三样东西到这一步才齐。
  if (MENU_ON && menuRoot) {
    menu = new MainMenu({
      root: menuRoot, camera, phases: PHASES,
      SliceIndex: () => state.builtPhase,
      GroundHeight: (x, z) => (battlefield ? battlefield.GroundHeight(x, z) : null),
      Unlock: () => audio.Unlock(),
      Play: (index, opts) => StartLevel(index, opts),
      Resume: () => ResumeFromPause(),
      Crowd: (anchor) => PlaceMenuGarrison(anchor),
    });
    window.Taierzhuang.menu = menu;
    // 菜单的取证口：冒烟不点像素，直接从这里读状态、驱动动作
    window.Taierzhuang.Debug.Menu = () => ({
      open: menu.open, live: menu.live, mode: menu.mode,
      items: menu.items.map((i) => i.id),
      item: menu.items[menu.itemIndex]?.id || null,
      selected: menu.selected,
      shot: menu.shots[menu.shotIndex]?.id || null,
      shotCount: menu.shots.length,
      slice: state.builtPhase,
      camera: { x: camera.position.x, y: camera.position.y, z: camera.position.z, fov: camera.fov },
      progress: Progress.Read(),
    });
    window.Taierzhuang.Debug.MenuAct = (id) => menu.Activate(id);
    window.Taierzhuang.Debug.MenuShow = (mode) => menu.Show(mode);
    window.Taierzhuang.Debug.MenuPlay = (index, opts) => menu.Play(index, opts);
    window.Taierzhuang.Debug.Pause = () => PauseGame();
    window.Taierzhuang.Debug.ResetProgress = () => { Progress.Reset(); };
    OpenMenu();
  }

  if (SHOT) StartRun();
}

// ---------------------------------------------------------------------------
// 关卡流程
// ---------------------------------------------------------------------------

/** 让出一帧。真在跑就等 rAF（进度条要动），出图/自检模式直接过。 */
const NextFrame = () => new Promise((r) => requestAnimationFrame(r));

/**
 * 这一关站在哪张图上。
 *
 * **不是每一关都在滕县城里。** 设计书 §2.8 那张切片表把七关分成两类：
 *   · 序·界河 —— 「另一张外围地图，非滕县城」，独立场景（界河在城北二十公里）；
 *   · 一—六   —— 同一座城的切片。
 * 两边实现的是**同一套查询接口**（Script_TengxianField 的文件头列了全表），
 * 所以规则层四个模块（Ai / Player / Navigation / Combat）一个字都不用改。
 *
 * 别把这张表挪进 Data_Battle：那是数据层，import 一个世界类进去会让
 * 数据模块反向依赖渲染模块（BootTest 里那几个纯数据的自检也会被拖进 three）。
 */
const WORLD_CLASSES = { [JIEHE_LEVEL_ID]: JieheField };
function WorldClassFor(phase) { return WORLD_CLASSES[phase.id] || TengxianField; }

/** 建一片关卡切片。**换关一定要先把上一片拆掉**，不然七关跑下来会攒七座城。 */
async function BuildField(phase, setStep, base, span, yieldFrame = NextFrame) {
  if (battlefield) { battlefield.Dispose(); battlefield = null; }
  levelBounds = MakeLevelBounds(phase.bounds);
  const World = WorldClassFor(phase);
  battlefield = new World(scene, library, {
    quality: QUALITY,
    seed: 19380317,
    bounds: phase.bounds,
    // 城外内容按关卡 id 开关（一·北沙河那一关整关都在城外原野上，
    // 城的生成器管不到那儿）。见 Script_TengxianOutfield.OUTFIELD_SCENES。
    // 独立场景（界河）也按它取自己那份布景表。
    levelId: phase.id,
    // LOD 焦点给本关的目标链：玩家会去的地方出全院落，其余按体块剪影。
    // 焦点给错的后果不是"难看"，是把 draw call 花在玩家永远不去的城角上。
    foci: phase.zones.map((z) => [z.x, z.z]),
    zones: phase.zones,
    // 每关自己的 LOD 分界（Data_Battle.TUNING）；没给就用默认。
    // 这是 draw call 的主要旋钮之一，改它之前先跑 BootTest 看数
    detailRadius: (phase.detailRadius ?? 100) * (QUALITY === "low" ? 0.72 : 1),
    midRadius: (phase.midRadius ?? 210) * (QUALITY === "low" ? 0.72 : 1),
  });
  for (const step of battlefield.BuildSteps()) {
    setStep(step.label, base + span * step.progress);
    await yieldFrame();
  }
  // 探针体的代理几何体就是物理那张 AABB 表。**换关必须重接** ——
  // 上一关的盒子留着，新一关的射线会打在一座已经不存在的城上。
  if (gi) gi.SetWorld(battlefield);
}

/**
 * 导航网格。1 m 一格是"院门通不通"的下限（见 Script_Navigation 的账），
 * 但界河与西关那两关的切片有一两百万格，建图与每张 BFS 都要翻几倍时间。
 * 那两关本来就是开阔地，没有 3.2 m 的院门要通，2 m 一格封不死任何东西。
 */
function MakeNavGrid(field) {
  const w = field.bounds.maxX - field.bounds.minX;
  const h = field.bounds.maxZ - field.bounds.minZ;
  const cell = (w * h > 900000) ? 2.0 : 1.0;
  return new NavGrid(field, { cell });
}

/** 浮尘只罩玩家附近那一片：切片最大的一关跨两公里，按整片铺会摊薄到看不见。 */
function DustBox(phase) {
  const z0 = phase.zones[0];
  return new THREE.Box3(
    new THREE.Vector3(z0.x - 150, -6, z0.z - 150),
    new THREE.Vector3(z0.x + 150, 22, z0.z + 150));
}

/** 换关时把整片切片以外的东西也清干净：兵、尸体、烟柱、在途弹。 */
function ClearRuntime() {
  for (const handle of state.smokeHandles) vfx.RemoveSmokeSource(handle);
  state.smokeHandles.length = 0;
  if (ai) ai.Dispose();
  if (combat && combat.projectiles) combat.projectiles.length = 0;
  if (combat && combat.incoming) combat.incoming.length = 0;
}

/**
 * 进一关。**这是异步的** —— 建一片切片要分帧走完，不然主线程会卡死几秒，
 * 浏览器直接判成无响应。期间 state.ready = false，Frame() 只走渲染。
 *
 * @param {number} index
 * @param {object} opts initial 开机那一次（战场已经建好，别重建）；
 *                      cutscenes 要不要播过场（出图与自检模式一律不播 ——
 *                      过场的临时布景有近三百个网格，会把 draw call 顶穿红线）
 */
async function EnterLevel(index, { initial = false, cutscenes = !SHOT } = {}) {
  state.advancing = true;
  state.phaseIndex = Clamp(index, 0, PHASES.length - 1);
  const phase = PHASES[state.phaseIndex];

  // --- 关前过场 ---
  if (cutscenes && phase.cutsceneIn) await RunCutscene(phase.cutsceneIn);

  if (!initial) {
    state.ready = false;
    boot.classList.remove("gone");
    bootStart.disabled = true;
    bootStart.textContent = "……";
    ClearRuntime();
    await BuildField(phase, (label, progress) => {
      bootStep.textContent = label;
      bootBar.style.width = `${Math.round(progress * 100)}%`;
    }, 0, 1);
    navGrid = MakeNavGrid(battlefield);
    ai.ctx.battlefield = battlefield;
    ai.ctx.nav = navGrid;
    ai.insideWalls = levelBounds;
    combat.host.battlefield = battlefield;
    player.world = {
      colliders: battlefield.colliders,
      NearbyColliders: (x, z, r) => battlefield.NearbyColliders(x, z, r),
      GroundHeight: (x, z) => battlefield.GroundHeight(x, z),
      WaterDepth: (x, z, y) => battlefield.WaterDepth(x, z, y),
      bounds: battlefield.bounds,
    };
    vfx.AmbientDust(DustBox(phase), 0.075);
  } else {
    ai.insideWalls = levelBounds;
  }

  state.phaseTime = 0;
  state.objectiveIndex = 0;
  state.objectiveCount = phase.zones.length;
  state.levelSeconds = phase.minutes * 60;
  // 「城里还站着的人」按剧本给的曲线走。**不做橡皮筋补给** ——
  // 这座城里没有后方，数字只会往下走（唯一一次上涨是 L1 收容 757 团残部，
  // 由剧本的 event:Regroup 那一条 system beat 交代，见 Data_TengxianScript）。
  state.nraPool = phase.nraPool;
  state.phasePoolNra = phase.nraPool;
  state.ijaPool = phase.ijaPool;

  // 远平面按关走：雾在两三百米外已经把东西吃干净了，远平面收进去只是让
  // 视锥剔除把那些看不见的网格提前扔掉（见 Data_Battle 的 cameraFar 注释）。
  //
  // 优先级：本关显式配置 > **本张图自己的默认值** > 620（城）。
  // 中间那一档是拆分带来的：独立场景比城小得多，地皮只铺到 1250 m，
  // 硬套城的 620 既浪费剔除机会，也可能把远平面推到地皮外面去（穿帮成天空）。
  const far = phase.cameraFar ?? battlefield.cameraFar ?? 620;
  if (camera.far !== far) { camera.far = far; camera.updateProjectionMatrix(); }
  // 同屏可见 Actor 的上限也按关走（见 Data_Battle 的 visibleActors 注释）。
  // 一个 Actor 四十几个 draw call，这是最粗的一根旋钮 ——
  // 只给真的需要的那一关调，全局调会让每一关的战场都变空。
  ai.visibleBudget = phase.visibleActors ?? defaultVisibleActors;

  const preset = sky.Apply(phase.sky);
  sky.BakeEnvironment(scene);
  lights.ApplyPreset(preset, sky.sunDirection);
  if (gi) gi.ApplyPreset(preset, graphics.giStrength);
  hud.SetPhase(phase);
  hud.ShowBrief(phase);
  // 环境档与天空档同名，直接把 phase.sky 递进去。
  // 旧写法是 night/dawn 之外一律「battle」，于是「烟尘白天」和「烧着的街」
  // 共用一档 —— 第三关满街在烧却听不见火，就是这么丢的。
  audio.Ambience(phase.sky);
  // 音乐按关走。上一版整场只有结局那一下会响 —— 四个 cue 里三个从来没进过游戏。
  audio.Music(phase.music);

  const loaded = story.BeginLevel(phase.id);
  state.storyObjective = phase.objectives[0] || null;
  if (loaded === 0) console.warn("这一关没有剧本：", phase.id);

  RespawnPlayer(true);
  SeedSoldiers(phase);
  SeedSmokeColumns(phase);

  if (!initial) {
    boot.classList.add("gone");
    bootStart.textContent = SHOT ? "（出图模式）" : "进 城";
  }
  // 这一片切片是哪一关的。菜单靠它决定用哪一组机位，StartLevel 靠它决定要不要重建。
  state.builtPhase = state.phaseIndex;
  state.ready = true;
  state.advancing = false;
  return state.phaseIndex;
}

/**
 * 播一场过场并等它播完（或被 Esc 跳过后卡片读完）。
 * 播过场期间玩家没有控制权，指针锁也要放掉 —— 不放的话鼠标还在转相机，
 * 而相机已经被过场接管，玩家会看到画面在自己抖。
 */
async function RunCutscene(id) {
  if (!cutscene) return null;
  ReleasePointerLock();
  const result = await cutscene.Play(id, { poolOut: state.nraPool });
  state.cutscenesPlayed.push({ id, skipped: !!result.skipped });
  if (state.running) RequestPointerLock();
  return result;
}

/** 换下一关。关末过场 -> 下一关关前过场 -> 建切片。 */
async function AdvanceLevel(opts = {}) {
  if (state.advancing) return state.phaseIndex;
  // 走到这里就算这一关过了：菜单的「继续」与选章里的「已通过」都读这条
  Progress.MarkCleared(PHASES[state.phaseIndex].id, state.phaseIndex);
  const phase = PHASES[state.phaseIndex];
  const cutscenes = opts.cutscenes ?? !SHOT;
  state.advancing = true;
  // 关末那几条还没播的旁白先倒出来，别跟着关卡一起消失
  story.FlushTail();
  if (cutscenes && phase.cutsceneOut) await RunCutscene(phase.cutsceneOut);
  state.advancing = false;
  if (state.phaseIndex >= PHASES.length - 1) { EndBattle("breakout"); return state.phaseIndex; }
  return EnterLevel(state.phaseIndex + 1, { cutscenes });
}

/** 调试口：直接跳到某一关（不播过场）。出图与自检走这条。 */
function JumpToLevel(index) {
  return EnterLevel(index, { cutscenes: false });
}

/**
 * 按关挂两三根常驻烟柱。
 *
 * 为什么非有不可：三月十七日「集中炮击致城内起火，时而强劲的南风将烟吹得笼罩全城」
 * 是信史。没有烟柱的空街等于没打过仗，而且烟柱是这个场景里唯一能在三百米外
 * 读出来、又能把构图竖着切开的东西。
 *
 * 选点：挂在**还没走到的那几个路标**上 —— 前面在烧，那是你要去的方向。
 * 排掉 45 m 以内的：烟柱底盘半径十几米，长在脸上就是一堵灰墙。
 * 界河那一关不挂（城外野地，没有房子可烧）。
 */
function SeedSmokeColumns(phase) {
  for (const handle of state.smokeHandles) vfx.RemoveSmokeSource(handle);
  state.smokeHandles.length = 0;
  if (phase.id === "L0_Jiehe") return;

  const px = player.position.x;
  const pz = player.position.z;
  const ranked = battlefield.objectives
    .map((o) => ({ o, far: Math.hypot(o.x - px, o.z - pz) }))
    .filter((e) => e.far > 45 && !e.o.reached)
    .sort((a, b) => a.far - b.far);

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

/**
 * 撒兵。**线性关卡的形状：友军在你身边和身后，敌军在你和下一个路标之间。**
 *
 * 台儿庄那一版是"中方守占领点、日方从北面城门涌进来"，整个作废 ——
 * 那是开放战场 + 占领点的形状。线性关卡里方向是明确的：
 * 玩家从当前路标走向下一个路标，那条线就是战线，敌人压在线的前方。
 *
 * 保留下来的两条经验（都是实跑逼出来的，换城不换账）：
 *   · 近身班组按**镜头**补，不按路标补 —— 路标动辄一两百米远，
 *     只按路标撒的结果是同屏「一个能辨认的人都没有」，人全被雾墙吃掉了；
 *   · 每个候选点要过 HasLineOfSight —— 鲁南民居对外不开窗、四面围墙，
 *     随便撒一个点有一多半落在别人家院子里，玩家永远看不见。
 */
function SeedSoldiers(phase) {
  const rnd = Mulberry32(1000 + state.phaseIndex * 97);
  const nraTarget = Math.round(SCALE.maxAlive * 0.42);
  const ijaTarget = Math.round(SCALE.maxAlive * 0.5 * phase.ijaPressure / 1.3);

  const px = player.position.x;
  const pz = player.position.z;
  // 战线方向：当前路标 → 下一个路标。走完了就用玩家的朝向兜底。
  const next = battlefield.objectives[Math.min(state.objectiveIndex, battlefield.objectives.length - 1)];
  let ax = next ? next.x - px : -Math.sin(player.yaw);
  let az = next ? next.z - pz : -Math.cos(player.yaw);
  let alen = Math.hypot(ax, az);
  if (alen < 1) { ax = -Math.sin(player.yaw); az = -Math.cos(player.yaw); alen = 1; }
  ax /= alen; az /= alen;
  // 近身班组用镜头方向（人要在画面里），战线用路标方向（人要在该在的地方）
  const fx = -Math.sin(player.yaw);
  const fz = -Math.cos(player.yaw);

  // --- 近身班组：跟着你的班 -------------------------------------------------
  for (let i = CountNear("nra", 40); i < NEAR_SQUAD.nra; i += 1) {
    // 前向弧而不是整圈：整圈撒 5 个人，85° 的水平视场只兜得住 1 个。
    // 直接转前向量，不要去凑"yaw 对应的极角"—— player.yaw 的零向是 -Z，
    // 跟 atan2(z, x) 差一个 -yaw - π/2，凭印象写必错，兵会撒到背后去
    let open = null;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const a = (rnd() - 0.5) * 3.8;
      const dx = fx * Math.cos(a) - fz * Math.sin(a);
      const dz = fz * Math.cos(a) + fx * Math.sin(a);
      const r = 10 + rnd() * 20;
      const spot = FindOpenSpot(px + dx * r, pz + dz * r, 6,
        31337 + i * 907 + attempt * 17 + state.phaseIndex * 53, levelBounds);
      open = spot;
      if (HasLineOfSight(spot.x, spot.z)) break;
    }
    const s = ai.Spawn("nra", open.x, open.z, { towel: !!phase.nightRaid && rnd() < 0.55 });
    // 不给 holdZone：这一班是跟着镜头走的，钉在某个路标上就又跑没影了
    if (s) { s.holdZone = null; s.goal.set(px + ax * 15, 0, pz + az * 15); }
  }
  // --- 中景的敌人：压在你与下一个路标之间 -----------------------------------
  for (let i = CountNear("ija", 110); i < NEAR_SQUAD.ija; i += 1) {
    let open = null;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const d = 45 + rnd() * 55;
      const lateral = (rnd() - 0.5) * 46;
      const spot = FindOpenSpot(px + ax * d - az * lateral, pz + az * d + ax * lateral, 8,
        65521 + i * 1361 + attempt * 29 + state.phaseIndex * 89, levelBounds);
      open = spot;
      if (HasLineOfSight(spot.x, spot.z)) break;
    }
    const s = ai.Spawn("ija", open.x, open.z, { weapon: rnd() < 0.12 ? "Type11" : "Type38" });
    if (s) s.goal.set(px + s.laneOffset, 0, pz + s.laneOffset * 0.4);
  }

  // --- 中方：铺在已经走过的那几个路标上（你身后还有人在守） -----------------
  const behind = battlefield.objectives.filter((o) => o.reached);
  for (let i = ai.CountSide("nra"); i < nraTarget; i += 1) {
    // 六成压在当前路标（前线），四成铺在身后 —— 铺开那部分不能省，
    // 不然后方空到无人，玩家一回头就是一条死街
    const o = (rnd() < 0.6 || !behind.length)
      ? (next || battlefield.objectives[0])
      : behind[Math.floor(rnd() * behind.length)];
    if (!o) break;
    const open = FindOpenSpot(o.x, o.z, o.radius, 5000 + i * 733 + state.phaseIndex * 31, levelBounds);
    const s = ai.Spawn("nra", open.x, open.z, { towel: !!phase.nightRaid && rnd() < 0.55 });
    if (s) { s.holdZone = o; s.goal.set(o.x, 0, o.z); }
  }
  // --- 日方：从战线前方 60—140 m 压上来 -------------------------------------
  // 写死一个方位（台儿庄那一版是"北面城门"）在这里行不通：
  // 东关是从东打过来、十字街是从西打过来、城墙那一关是从城外往墙上打。
  // 唯一稳定的是「他们在你与下一个路标的更前方」，所以就照这条撒。
  for (let i = ai.CountSide("ija"); i < ijaTarget; i += 1) {
    const d = 60 + rnd() * 80;
    const lateral = (rnd() - 0.5) * 90;
    const at = {
      x: px + ax * d - az * lateral,
      z: pz + az * d + ax * lateral,
    };
    at.x = Clamp(at.x, levelBounds.minX, levelBounds.maxX);
    at.z = Clamp(at.z, levelBounds.minZ, levelBounds.maxZ);
    const open = FindOpenSpot(at.x, at.z, 14,
      90001 + i * 617 + state.phaseIndex * 43, levelBounds);
    const s = ai.Spawn("ija", open.x, open.z, { weapon: rnd() < 0.12 ? "Type11" : "Type38" });
    if (s) s.goal.set(px + s.laneOffset, 0, pz + s.laneOffset * 0.4);
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
const _openFrom = new THREE.Vector3();
const _openDir = new THREE.Vector3();
/**
 * 从一个点往水平各方向射 probeM 米，数有几条是通的。
 *
 * 为什么要有这一条：原来的"站得下"只查了一米内有没有齐胸碰撞盒 ——
 * 鲁南民居四面围墙，院子中央一米内当然什么都没有，于是玩家出生在封闭院落里，
 * 实测 72 个方位 26 m 内**一条都不通**：转一圈全是墙。
 * 站得下不等于打得着，得让候选点至少有三个方向能看出去。
 */
function CountOpenDirections(x, z, y, probeM = 20, count = 8, need = 99) {
  let open = 0;
  _openFrom.set(x, y + 1.5, z);
  for (let k = 0; k < count; k += 1) {
    const a = (k / count) * Math.PI * 2;
    _openDir.set(Math.cos(a), 0, Math.sin(a));
    if (!battlefield.Raycast(_openFrom, _openDir, probeM)) open += 1;
    if (open >= need) return open;
  }
  return open;
}

function FindOpenSpot(cx, cz, radius, seed, limits = null) {
  const rnd = Mulberry32(seed);
  // 兜底范围按**当前这张图**走，不是按滕县城那一张：
  // 界河是独立场景（地皮只铺到 ±1250），照城的 ±1650 撒会撒到地皮外面去。
  const world = (battlefield && battlefield.worldLimits) || WORLD;
  const lo = limits || {
    minX: world.minX + 6, maxX: world.maxX - 6,
    minZ: world.minZ + 6, maxZ: world.maxZ - 6,
  };
  // 通视探测有成本（每个候选点八条射线），所以只给通过"站得下"的候选点做，
  // 并且最多探 16 个：探不到三方位全通的就取探过的里面最好的那个。
  let fallback = null, fallbackOpen = -1, probed = 0;
  for (let i = 0; i < 48; i += 1) {
    const a = rnd() * Math.PI * 2;
    const r = radius * (0.25 + rnd() * 1.35);
    const x = cx + Math.cos(a) * r;
    const z = cz + Math.sin(a) * r;
    if (x < lo.minX || x > lo.maxX) continue;
    if (z < lo.minZ || z > lo.maxZ) continue;
    const y = battlefield.GroundHeight(x, z);
    let blocked = false;
    for (const b of battlefield.NearbyColliders(x, z, 1.4)) {
      if (x < b.min[0] - 1.0 || x > b.max[0] + 1.0) continue;
      if (z < b.min[2] - 1.0 || z > b.max[2] + 1.0) continue;
      if (b.max[1] - y < 0.6) continue;              // 矮的东西不算挡路
      blocked = true;
      break;
    }
    if (blocked) continue;
    // 走得到吗。"一米内没有碰撞盒"只证明站得下 —— 封闭院落的中央当然站得下，
    // 但那是个谁也走不进去的口袋。撒进去的守军等于不存在。
    if (navGrid && !navGrid.InMain(x, z)) continue;
    if (probed >= 16) return fallback || { x, z };
    probed += 1;
    const open = CountOpenDirections(x, z, y, 20, 8, 3);
    if (open >= 3) return { x, z };
    if (open > fallbackOpen) { fallbackOpen = open; fallback = { x, z }; }
  }
  // 最后的兜底也要夹进边界里。原来直接把圆心原样返回 ——
  // 传进来的圆心本身在墙外时，这条出口就是把人扔到墙外的那一条。
  return fallback || { x: Clamp(cx, lo.minX, lo.maxX), z: Clamp(cz, lo.minZ, lo.maxZ) };
}

/**
 * 出生 / 换人。
 *
 * **开局是在阵地上跟着你的班，不是空地中央。** 上一版是"在还属于我方、
 * 离前线最近的那个占领点上随机找一块空地"，在线性关卡里那条规则的结果是
 * 玩家被扔在关卡起点附近的某个随机空院子里，四面是墙，班在别处 ——
 * 一开局就不知道该往哪儿走，而这是线性关卡最不该出的问题。
 * 现在开局站位由 Data_Battle.PHASES[i].spawn 写死（登记为推定值），
 * 朝向对着第一个路标；近身班组会在同一帧撒到身边 12—30 m 里。
 *
 * 死了换人时才回到"就近找一块站得下的地方"那条路 —— 换人不该重置进度，
 * 所以从**当前路标**往回退一段生。
 */
function RespawnPlayer(initial = false) {
  const phase = PHASES[state.phaseIndex];
  const seed = 7919 * (state.fallen.length + 1) + state.phaseIndex * 131;
  state.identity = MakeSoldierIdentity(seed);
  currentWeapon = state.identity.weapon;

  if (initial && phase.spawn) {
    player.Spawn(phase.spawn.x, phase.spawn.z, phase.spawn.ry ?? 0);
  } else {
    // 换人：退到当前路标后方 20 m。往哪边算"后方"？朝上一个路标的方向。
    const objectives = battlefield.objectives;
    const here = objectives[Math.min(state.objectiveIndex, objectives.length - 1)] || phase.spawn;
    const prev = state.objectiveIndex > 0 ? objectives[state.objectiveIndex - 1] : phase.spawn;
    let bx = (prev?.x ?? here.x) - here.x;
    let bz = (prev?.z ?? here.z) - here.z;
    const blen = Math.hypot(bx, bz) || 1;
    bx /= blen; bz /= blen;
    // 退到**路标圈外**再生。
    // 事故：原来退 20 m，而路标半径就有 16—46 m —— 换的人一出生就站在圈里，
    // UpdateObjectives 下一帧判定"到了"，目标链自己往前跳一格。
    // 后果不是少走一段路：一关里死几次就能把整条目标链走完并自动换关，
    // 长跑里表现为"剧本被吞了"（换关时 FlushTail 会把没播的对话跳过去）。
    // 这是死一次就能跳过一段关卡的漏洞，不是数值问题。
    const back = (here.radius ?? 14) + 24;
    const open = FindOpenSpot(here.x + bx * back, here.z + bz * back, 14, seed, levelBounds);
    player.Spawn(open.x, open.z, Math.atan2(-(here.x - open.x), -(here.z - open.z)));
  }
  player.bandages = COMBAT.bandages;

  // 领的家当。弹带大半是瘪的 —— 这不是难度设计，是他们上阵时的实际情况：
  // 日方记川军三分之一以上没有步枪、各自带手榴弹约六发。
  //
  // 携行优先读本关自己的 loadoutOverride（Data_Battle），没有才回退到
  // Data_Weapons.LOADOUTS 里那几套。第一关的 primary 就是 null —— **这是史实，
  // 不是难度设计**，玩家要从倒下的人身上捡枪。第六关整个武器栏是空的（脱离战斗）。
  const loadout = phase.loadoutOverride || LOADOUTS[phase.loadout] || null;
  state.loadoutId = phase.loadoutOverride ? `${phase.id}_override` : (phase.loadout || null);
  const disarmed = !!phase.disarmed;
  const primary = disarmed ? null : (loadout ? loadout.primary : state.identity.weapon);
  const secondary = disarmed ? null : (loadout?.secondary || null);
  state.slots.primary = primary;
  state.slots.secondary = secondary;
  state.slots.melee = disarmed ? null : (loadout?.melee || null);
  const throwables = loadout?.throwables || {};
  // disarmed 是「脱离战斗」那一关：武器栏**整个**是空的，手榴弹也没有。
  // 不写这一条的话 `?? 4` 那个兜底会把四颗手榴弹塞回去 ——
  // 而那一关的机制原话是「弹药：无。唯一的动作是走和拽人」。
  state.grenades = disarmed ? 0 : (throwables.Grenade ?? (phase.nightRaid ? 8 : 4));
  state.bundles = disarmed ? 0 : (throwables.GrenadeBundle ?? 0);
  state.slots.throwable = state.grenades > 0 ? "Grenade" : (state.bundles > 0 ? "GrenadeBundle" : null);
  const spareClips = loadout?.spareClips ?? (phase.nightRaid ? 3 : 5);
  state.mags.primary = primary
    ? { ammo: WEAPONS[primary]?.magazine ?? 5, clips: spareClips }
    : { ammo: 0, clips: 0 };
  state.mags.secondary = secondary
    ? { ammo: WEAPONS[secondary]?.magazine ?? 10, clips: 2 }
    : { ammo: 0, clips: 0 };
  // 没有长枪时手里拿什么：**大刀，不是手榴弹。**
  //
  // 投掷物槽拿在手上会让视图模型去 Equip("Grenade")，而手榴弹没有第一人称 rig，
  // 退回去的是一个没贴图的大方块糊在屏幕右下角（第一关的出图上一眼就看得见）。
  // 而且这也不是他们的样子：没枪的川军手里是大刀，手榴弹在腰上的布袋里，
  // 用 G 键扔 —— 扔弹本来就不需要把它"拿在手上"（见 BeginCook 那条通道）。
  // 两样都没有（第六关脱离战斗）就空着手。
  state.activeSlot = primary ? "primary" : (state.slots.melee ? "melee" : "primary");
  currentWeapon = SlotWeaponId(state.activeSlot) || null;
  state.ammo = state.mags.primary.ammo;
  state.clips = state.mags.primary.clips;
  state.fireMode = "auto";
  player.bipod = false;
  // Equip(null) 是合法的：Viewmodel 会把 rig 清空（空着手）。
  // 第一关「还没捡到枪」与第六关「脱离战斗」都要走这条。
  viewmodel.Equip(currentWeapon);
  hud.SetIdentity(state.identity,
    currentWeapon ? (WEAPONS[currentWeapon]?.name || "步枪") : "赤手");
  state.pendingRespawn = false;
  state.playerAliveLast = true;
}

// ---------------------------------------------------------------------------
// 武器槽
// ---------------------------------------------------------------------------
const SLOT_ORDER = ["primary", "secondary", "melee", "throwable"];

/** 某个槽里现在是哪支枪（投掷物槽里放的是当前选的那一种）。 */
function SlotWeaponId(slot) {
  if (slot === "throwable") return state.slots.throwable;
  return state.slots[slot];
}

/** 换槽。长枪/短枪各记各的弹仓 —— 切回来不该是满的。 */
function SwitchSlot(slot) {
  if (!player?.Alive || !SlotWeaponId(slot)) return false;
  if (slot === state.activeSlot) return false;
  if (viewmodel.IsBusy?.()) return false;          // 拉栓/压弹播到一半不许换手
  if (state.mags[state.activeSlot]) {
    state.mags[state.activeSlot].ammo = state.ammo;
    state.mags[state.activeSlot].clips = state.clips;
  }
  state.activeSlot = slot;
  currentWeapon = SlotWeaponId(slot);
  const mag = state.mags[slot];
  state.ammo = mag ? mag.ammo : 0;
  state.clips = mag ? mag.clips : 0;
  player.bipod = false;                            // 换枪就把两脚架收了
  state.fireMode = "auto";
  viewmodel.Equip(currentWeapon);
  hud.SetIdentity(state.identity, WEAPONS[currentWeapon]?.name || "");
  return true;
}

/** 滚轮循环。空的槽跳过 —— 杂牌部队常常只有一支枪。 */
function CycleSlot(delta) {
  const have = SLOT_ORDER.filter((k) => !!SlotWeaponId(k));
  if (have.length < 2) return false;
  const at = Math.max(0, have.indexOf(state.activeSlot));
  const next = have[(at + (delta > 0 ? 1 : have.length - 1)) % have.length];
  return SwitchSlot(next);
}

/** 架/收两脚架。须卧倒，或者身边 1.4 m 内有个齐腰高的东西能搭上去。 */
function ToggleBipod() {
  if (!player?.Alive) return false;
  const weapon = WEAPONS[currentWeapon];
  if (!weapon?.bipod) { hud.Hint("这支枪没有两脚架", 1.8); return false; }
  let rest = player.stance === "prone";
  if (!rest) {
    for (const b of battlefield.NearbyColliders(player.position.x, player.position.z, 1.4)) {
      const top = b.max[1] - player.position.y;
      if (top > 0.5 && top < 1.35) { rest = true; break; }
    }
  }
  if (!player.ToggleBipod(weapon, rest)) {
    hud.Hint("得先趴下，或者靠着能搭枪的东西", 2.2);
    return false;
  }
  audio.Play(player.bipod ? "magIn" : "bolt", { volume: 0.55 });
  hud.Hint(player.bipod ? "两脚架架好了" : "收了两脚架", 1.6);
  return true;
}

/** 单发／连发。只有捷克式有得切（十一年式是日军的，玩家摸不到）。 */
function ToggleFireMode() {
  const weapon = WEAPONS[currentWeapon];
  if (!weapon?.rpm) { hud.Hint("这支枪只有一种发射方式", 1.6); return false; }
  state.fireMode = state.fireMode === "auto" ? "semi" : "auto";
  hud.Hint(state.fireMode === "auto" ? "连发" : "单发", 1.6);
  return true;
}

function OnPlayerDown() {
  const identity = state.identity;
  state.fallen.push(identity);
  state.nraPool = Math.max(0, state.nraPool - 1);
  hud.ShowDeathCard(identity, "第三十一师 一八六团", REINFORCE.deathCardSeconds);
  state.deathTimer = REINFORCE.deathCardSeconds;
  state.pendingRespawn = true;
  audio.Play("bodyFall", { volume: 0.9 });
  if (story) story.Signal("playerDown");
  // 池子见底：四月四日真下过的命令 —— 担架兵、炊事兵、伙夫都编进来
  if (state.nraPool > 0 && state.nraPool / (state.phasePoolNra || 1) < REINFORCE.lastDitchAt) {
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

// ---------------------------------------------------------------------------
// 指针锁：一个开关，两条后端
// ---------------------------------------------------------------------------
/**
 * 自动化（Playwright 冒烟 / 出图 / 任何 navigator.webdriver 的浏览器）下
 * **不碰浏览器的真指针锁**，只在页内记一个布尔。
 *
 * 事故（2026-08-20）：开发机上鼠标隔一阵就被夹在屏幕左上角一块区域里动不了，
 * 跟正在干什么无关。根子不在游戏逻辑，在浏览器实现：Chromium on Windows 的
 * 指针锁 = `::ClipCursor(窗口矩形)`，而 ClipCursor 是**全系统**的光标夹具。
 * 无头 Edge 的（不可见）窗口落在屏幕 (27,95)-(1297,805)，冒烟脚本一点「进城」
 * 抢到锁，真人的鼠标就被夹进那一块 —— 而且无头模式下 exitPointerLock
 * **并不会**解除 ClipCursor（有头会），要等浏览器进程退出才松。
 * 实测（Script_BrowserTestKit 那条启动路径）：锁上 → GetClipCursor=(27,95,1297,805)；
 * 页面 exit → 仍夹着；browser.close() → 才恢复全屏。
 *
 * 所以 webdriver 下一律走假后端：游戏逻辑里「锁上 / 没锁上」照常流转
 * （Guard 的「第一次点击只抢锁」、mousemove 转头、解锁清输入三条都不改），
 * 冒烟照常验四条解锁通道，只是再也不碰真鼠标。调试口 PointerLock().fake 说明用的是哪条。
 */
const FAKE_POINTER_LOCK = !!(SHOT || navigator.webdriver);
let fakeLocked = false;

/** 现在锁在我们的画布上没有（两条后端统一的读法，全文件只认这一个）。 */
function PointerLocked() {
  return FAKE_POINTER_LOCK ? fakeLocked : document.pointerLockElement === canvas;
}

/**
 * 抢指针锁。**必须吞掉 NotAllowedError**：用户手势的有效期只有几秒，而
 * 「点开始 -> 播三十八秒关前过场 -> 进游戏」这条路上，过场播完时手势早过期了，
 * 浏览器会把 requestPointerLock() 的 promise reject 掉。
 *
 * 抓不到锁本身不是事故 —— 键位路由里那条「没拿到锁的第一次点击只用来抢锁」会接住；
 * 但不吞的话控制台会留一条 unhandled rejection，而开机冒烟把 console.error 当事故。
 * 抓不到就提示玩家点一下，别让人对着不转的镜头猜。
 */
function RequestPointerLock() {
  if (SHOT) return;
  if (FAKE_POINTER_LOCK) {
    if (!fakeLocked) { fakeLocked = true; OnPointerLockChange(); }
    return;
  }
  const nudge = () => hud?.Hint("点一下画面，接管镜头", 3.0);
  try {
    const pending = canvas.requestPointerLock?.();
    if (pending && typeof pending.catch === "function") pending.catch(nudge);
  } catch (error) {
    nudge();
  }
}

/**
 * 把鼠标还给用户。
 *
 * 事故（第 4 批的积压条目）：退出游戏 / 切走标签页 / 按 Esc 之后鼠标还是不可见 ——
 * 浏览器自己只在 Esc 与文档隐藏时**有时候**会解锁，一旦页面被 bfcache 冻结、
 * 或者是我们自己把玩家控制权收走（过场、换关、结算），锁就一直挂在那儿。
 * 表现是用户以为浏览器卡死了。
 *
 * 修法是五条事件都调一次 exitPointerLock：pointerlockchange（锁掉了要同步状态）、
 * blur（切走）、pagehide（关页/前进后退缓存）、visibilitychange（标签切后台）、
 * Esc（用户主动退）。exitPointerLock 在没有锁的时候调是无害的。
 */
function ReleasePointerLock() {
  if (FAKE_POINTER_LOCK) {
    if (fakeLocked) { fakeLocked = false; OnPointerLockChange(); }
    return;
  }
  if (document.pointerLockElement) document.exitPointerLock?.();
}

/** 锁的状态变了（真后端由 pointerlockchange 事件进来，假后端由上面两个函数直调）。 */
function OnPointerLockChange() {
  // 锁掉了：把连续输入清零，否则松开锁的那一瞬间按着的键会一直"按着"
  if (PointerLocked()) return;
  input.fire = false; input.ads = false;
  input.forward = 0; input.strafe = 0; input.sprint = false;
  if (state.ordersOpen) { state.ordersOpen = false; hud.SetOrdersVisible(false); wheel.Close(); }
}

function StartRun() {
  boot.classList.add("gone");
  state.menu = false;
  state.running = true;
  if (!SHOT) {
    RequestPointerLock();
    audio.Unlock();
  }
}
bootStart.addEventListener("click", StartRun);

// ---------------------------------------------------------------------------
// 主菜单：开机进这里，游戏中按 Esc 也回这里
// ---------------------------------------------------------------------------
/**
 * 打开主菜单（开机那一次）。
 *
 * 菜单背后是**活的战场**（对标 Easy Red 2），所以要做三件事，缺一样都会露馅：
 *   1. 玩法停摆（state.running = false）—— 相机被菜单接管，玩家的身体不许再动；
 *   2. HUD 与手里那支枪藏起来 —— 枪是相机的子物体，不藏的话运镜里会有一支
 *      三八式横在画面前面；
 *   3. 把兵撤掉 —— 撒兵是按玩家位置撒的，而菜单机位在两百米外的城墙上，
 *      留着他们既是白烧 draw call，又会在镜头前打起来（打起来就会死人，
 *      而兵员池是关卡状态，玩家还没按开始就被消耗掉是说不通的）。
 */
function OpenMenu() {
  if (!menu) return;
  state.running = false;
  state.menu = true;
  ReleasePointerLock();
  // 主菜单背后是活场景，环境床照响（ER2 的菜单也是有声音的）。
  // 「暂停 -> 回主菜单」这条路要显式解一次暂停，不解的话菜单是哑的。
  audio.SetPaused(false);
  hudRoot.style.display = "none";
  if (viewmodel) viewmodel.root.visible = false;
  boot.classList.add("gone");
  if (ai) ai.Dispose();
  // 齿轮按钮藏起来：菜单是给玩家看的，编辑器是给我们自己用的
  document.getElementById("edRoot")?.classList.add("off");
  menu.Open();
}

/** 收起菜单，把 HUD、枪、齿轮还回来。 */
function CloseMenu() {
  if (!menu) return;
  menu.Close();
  state.menu = false;
  hudRoot.style.display = "";
  if (viewmodel) viewmodel.root.visible = true;
  if (!SHOT) document.getElementById("edRoot")?.classList.remove("off");
}

/**
 * 从菜单进一关。
 *
 * **切片相同就不重建**：菜单背后那片场景本来就是一关的切片，
 * 玩家在选章里点的正好是它时，重建一遍要十几秒而画面一模一样。
 * 相同时走 EnterLevel 的 initial 分支 —— 那一支只重置关卡状态（剧本、兵、出生点），
 * 不碰几何。
 */
async function StartLevel(index, { cutscenes = false } = {}) {
  if (!menu || state.advancing) return state.phaseIndex;
  const target = Clamp(index, 0, PHASES.length - 1);
  CloseMenu();
  // 上一局的残留：结算层与阵亡卡片都是不透明的全屏层，不收掉的话新一关
  // 顶着它们跑，玩家看到的是「点了开始但进不去游戏」。
  state.outcome = null;
  state.deathTimer = 0;
  state.pendingRespawn = false;
  state.fallen.length = 0;
  hud.HideEpilogue();
  hud.HideDeathCard();
  const sameSlice = state.builtPhase === target;
  await EnterLevel(target, { initial: sameSlice, cutscenes });
  StartRun();
  return target;
}

/**
 * 菜单场景里那几个站着的守军。
 *
 * ER2 的主菜单背后是有人的 —— 空城比空镜更假。但**一个日军都不放**：
 * 有敌人就会开打，开打就会死人，而兵员池是关卡状态（见 OpenMenu 第三条）。
 * 只有守军时 AI 找不到目标，Think 走的是「守住 holdZone」那一支，
 * 表现就是几个人在原地小幅走动、换姿势 —— 正是菜单要的那种「活着但没在打」。
 *
 * 换机位时整批瞬移过去（那一下正好被黑场盖住），不重建 Actor：
 * 一个 Actor 三十七个 draw call，每十六秒拆建五个纯属白烧。
 *
 * @param {object|null} anchor 菜单给的落点 {x, z, r, faceX, faceZ, count}；null = 这一机位不摆人
 */
function PlaceMenuGarrison(anchor) {
  if (!ai || !battlefield) return;
  if (!anchor || !anchor.count) { ai.Dispose(); return; }
  while (ai.soldiers.length > anchor.count) ai.Remove(ai.soldiers[ai.soldiers.length - 1]);

  const cam = new THREE.Vector3(anchor.from[0], anchor.from[1], anchor.from[2]);
  const look = new THREE.Vector3(anchor.look[0], anchor.look[1], anchor.look[2]);
  let fx = look.x - cam.x;
  let fz = look.z - cam.z;
  const span = Math.hypot(fx, fz) || 1;
  fx /= span; fz /= span;
  const yaw = Math.atan2(-fx, -fz);          // Actor 正面是局部 -Z：让他们背对镜头看向战场
  const rnd = Mulberry32(6151 + state.builtPhase * 31);
  const dir = new THREE.Vector3();
  const placed = [];

  /**
   * 「相机看得见这个点吗」。这一条是整段的核心 —— 光按比例撒人的那一版
   * 在东门机位上把五个人全撒进了关厢院落的迷宫，画面上一个人都没有。
   * 判据：从机位往这个人的胸口打一条射线，第一次撞到东西的距离要比人还远。
   */
  const Visible = (x, y, z) => {
    dir.set(x - cam.x, y + 1.1 - cam.y, z - cam.z);
    const dist = dir.length();
    if (dist < 6) return false;               // 贴在镜头上的人只会糊成一团
    dir.divideScalar(dist);
    const hit = battlefield.Raycast(cam, dir, dist);
    return !hit || hit.t > dist - 1.2;
  };

  for (let i = 0; i < anchor.count; i += 1) {
    let best = null;
    for (let attempt = 0; attempt < 26; attempt += 1) {
      const t = anchor.near + (anchor.far - anchor.near) * rnd();
      const lateral = (rnd() - 0.5) * 2 * anchor.spread;
      // 沿连线取一点，再往侧向推开（侧向 = 连线的法线）
      const x = cam.x + (look.x - cam.x) * t - fz * lateral;
      const z = cam.z + (look.z - cam.z) * t + fx * lateral;
      const spot = FindOpenSpot(x, z, 5, 977 + i * 131 + attempt * 17, levelBounds);
      const y = battlefield.GroundHeight(spot.x, spot.z);
      // 别几个人叠在一起
      let crowded = false;
      for (const p of placed) if (Math.hypot(p.x - spot.x, p.z - spot.z) < 2.4) { crowded = true; break; }
      if (crowded) continue;
      if (!best) best = { x: spot.x, y, z: spot.z };
      if (Visible(spot.x, y, spot.z)) { best = { x: spot.x, y, z: spot.z }; break; }
    }
    if (!best) continue;
    placed.push(best);
    const soldier = ai.soldiers[i] || ai.Spawn("nra", best.x, best.z, {});
    if (!soldier) continue;
    soldier.position.set(best.x, best.y, best.z);
    soldier.goal.set(best.x, 0, best.z);
    // 守位圈给小一点：人只在这一小圈里挪动，不会自己走出画面
    soldier.holdZone = { id: "MenuStage", x: best.x, z: best.z, radius: 5 };
    soldier.yaw = yaw;
    if (soldier.actor) {
      soldier.actor.root.position.copy(soldier.position);
      soldier.actor.root.rotation.y = yaw;
    }
  }
}

/** 游戏中按 Esc：挂暂停。世界冻在原地（Frame 不跑），相机不动。 */
function PauseGame() {
  if (!menu || !state.running || state.cutscene || state.advancing) return false;
  state.running = false;
  ReleasePointerLock();
  // 背景枪声也得停。玩法停靠 Frame() 提前返回，而环境床与音乐是一张自己在跑的
  // WebAudio 节点图 —— Frame() 返不返回它们都照响（见 Script_Audio.SetPaused）。
  audio.SetPaused(true);
  // HUD 收起来：暂停屏是给人读菜单的，顶着阶段条、简报、小地图和阵亡卡片读不清。
  // ER2 的暂停也是「冻住的画面 + 一层压暗 + 一列字」，HUD 不留。
  hudRoot.style.display = "none";
  menu.OpenPause();
  return true;
}

/** 暂停里的「继续」。 */
function ResumeFromPause() {
  if (!menu) return;
  menu.Close();
  state.menu = false;
  state.running = true;
  hudRoot.style.display = "";
  audio.SetPaused(false);
  RequestPointerLock();
}

/**
 * 菜单每帧：只推运镜、浮尘与画面。
 * **AI 与玩法一律不推** —— 见 OpenMenu 的第三条。
 */
function MenuFrame(dt, render = true) {
  state.elapsed += dt;
  state.frame += 1;
  menu.Update(dt);
  // 场上那几个守军：只有守军，所以 AI 找不到目标，跑的是「守住 holdZone」那一支。
  // 不推它的话人是几尊定在地上的雕像 —— 比没有人还假。
  if (ai && ai.soldiers.length) ai.Update(dt, camera);
  // 浮尘与烟柱照跑：菜单要的就是「这片场景是活的」，静止的烟等于一张背景图
  if (vfx) vfx.Update(dt, camera, state.elapsed);
  if (sky) sky.Update(state.elapsed);
  if (lights) {
    lights.Update(dt, state.elapsed);
    camera.getWorldDirection(_forward);
    lights.UpdateShadowFrustum(camera.position, _forward);
  }
  if (render) RenderScene(dt);
}

// 键位全部走 Script_Input 的那张表。装配层这里只剩两件事：
// 把动作名翻译成函数调用（OnAction），以及每帧读一次连续量（router.Read）。
const router = new InputRouter({
  // Tab 按住时 Digit1-6 是下令，松开之后同样的键是武器槽。
  Context: () => (state.ordersOpen ? "orders" : "world"),
  // 没拿到指针锁的第一次点击只用来抢锁，不该同时打出一枪
  Guard: (e) => {
    if (!state.running) return false;
    // 编辑器开着：这一下鼠标是在点面板/摆东西，不是在抢指针锁开枪
    if (editor && editor.Capturing) return false;
    if (!PointerLocked() && !SHOT) { RequestPointerLock(); return false; }
    return true;
  },
  OnAction: (action, detail) => {
    if (!state.ready) return;
    // 编辑器开着就把整张键位表闸掉。不闸的话在编辑器里按 R 会真的去装填、
    // 滚滚轮会真的切枪 —— 而这两件事在暂停的世界里做，退出编辑器时状态已经错了。
    if (editor && editor.Capturing) return;
    switch (action) {
      case "crouch": input.crouchPressed = true; return;
      case "prone": input.pronePressed = true; return;
      case "reload": Reload(); return;
      case "melee": DoMelee(); return;
      case "bandage":
        if (player?.Bandage()) audio.Play("stripperLoad", { volume: 0.6 });
        return;
      case "interact": DoInteract(); return;
      case "bipod": ToggleBipod(); return;
      case "fireMode": ToggleFireMode(); return;
      case "cycleSlot": CycleSlot(detail.delta); return;
      case "vault": DoVault(); return;
      case "orders":
        // 按住 Tab 出轮盘，松手把指着的那一格下出去。
        // 松手时 ordersOpen 必须**先**置回 false，否则 mousemove 还认为轮盘开着
        state.ordersOpen = !!detail.down;
        hud.SetOrdersVisible(state.ordersOpen);
        if (detail.down) wheel.Open(ORDERS);
        else {
          const picked = wheel.Close();
          if (picked) IssueOrderByKey(picked.key);
        }
        return;
      default: break;
    }
    if (action.startsWith("slot:")) { SwitchSlot(action.slice(5)); return; }
    if (action.startsWith("cook:")) {
      if (detail.down) BeginCook(action.slice(5)); else ReleaseCook();
      return;
    }
    if (action.startsWith("order:")) {
      // 数字键直选：轮盘的兜底通道。选完立刻下令，并把轮盘的指向清掉 ——
      // 不清的话松开 Tab 会把同一条命令再下一次
      const key = action.slice(6);
      wheel.Point(ORDERS.findIndex((o) => o.key === key));
      IssueOrderByKey(key);
      wheel.ClearPick();
    }
  },
});
router.Bind(document);

document.addEventListener("mousemove", (e) => {
  // 轮盘开着的时候鼠标是在选格子，不是在转头。
  // 这条**不查指针锁**：轮盘只要一个方向向量，而 movementX/Y 在锁与不锁下都送达
  // （出图/测试模式下根本拿不到指针锁，查了就等于轮盘在那些模式里是死的）。
  if (state.ordersOpen) { wheel.Move(e.movementX, e.movementY); return; }
  if (!PointerLocked()) return;
  input.lookX += e.movementX;
  input.lookY += e.movementY;
});

/** 轮盘选中的那一格（数字键与松手两条路都走这里）。 */
function IssueOrderByKey(key) {
  const order = ORDERS.find((o) => o.key === key);
  if (!order || !ai || !player) return;
  // 「要炮」不是给弟兄下的令：它不走 IssueOrder，直接进支援通道。
  // F 键腾给通用交互之后，这是叫炮唯一的入口。
  if (order.id === "callFire") { CallMortar(); return; }
  const aimPoint = AimPoint(60);
  const n = ai.IssueOrder(order.id, player.position, aimPoint);
  state.order = order.label;
  if (n > 0) hud.Say("你", `${order.label}！`, 2.2);
}

function ReadKeys() {
  router.Read(input, { ads: player ? player.ads : 0 });
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
// 动作：装填 / 投弹 / 白刃 / 支援
// ---------------------------------------------------------------------------

/** 装填。桥夹压入固定弹仓，一次五发；没有备弹就只能去死人身上找。 */
function Reload() {
  if (!player.Alive || viewmodel.IsBusy?.()) return false;
  const w = WEAPONS[currentWeapon];
  if (!w || state.clips <= 0 || state.ammo >= (w.magazine ?? 5)) return false;
  state.clips -= 1;
  state.ammo = w.magazine ?? 5;
  viewmodel.TriggerReload();
  audio.Play(w.reloadKind === "topMag" ? "magIn" : "stripperLoad", { volume: 0.75 });
  return true;
}

/** 按住蓄力：手榴弹可以攥着数几秒再扔，落地即炸。 */
function BeginCook(kind) {
  if (!player.Alive || state.cooking) return;
  if (kind === "Grenade" && state.grenades <= 0) { hud.Hint("没有手榴弹了", 2); return; }
  if (kind === "GrenadeBundle" && state.bundles <= 0) { hud.Hint("没有集束了", 2); return; }
  state.cooking = kind;
  state.cook = 0;
  audio.Play("grenadePin", { volume: 0.7 });
}

function ReleaseCook() {
  if (!state.cooking || !player.Alive) { state.cooking = null; return; }
  const kind = state.cooking;
  state.cooking = null;
  // 蓄力越久扔越远；同时引信也在烧（cook）—— 这两件事共用同一个计时器，
  // 所以「想扔远」和「想落地即炸」是一对取舍，不是白拿的收益。
  const power = Clamp01(state.cook / 1.1);
  const cooked = Math.max(0, state.cook - 0.35);
  const dir = player.AimDirection(_aimDir).clone();
  combat.Throw(kind, power, player.EyePosition.clone(), dir, cooked);
  // 夹到 0：BeginCook 已经挡过"没货就别拔弦"，但调试口（Debug.Throw）是直接
  // 塞 state.cooking 的，绕开了那道闸。库存变负之后 HUD 会显示 −1 枚手榴弹，
  // 而且下一次 BeginCook 的 <= 0 判断照样过 —— 一个负数会一直负下去。
  if (kind === "Grenade") state.grenades = Math.max(0, state.grenades - 1);
  else state.bundles = Math.max(0, state.bundles - 1);
  viewmodel.TriggerThrow?.(power);
  state.cook = 0;
}

/** 白刃。大刀是近身补充兵器 —— 这是最后一手，不是第一手。 */
function DoMelee() {
  if (!player.Alive || viewmodel.IsBusy?.()) return false;
  viewmodel.TriggerMelee();
  const weaponId = WEAPONS[currentWeapon]?.bayonet ? currentWeapon : "Dadao";
  const result = combat.Melee(weaponId === currentWeapon ? currentWeapon : "Dadao",
    player.position.clone(), player.AimDirection(_aimDir).clone());
  // 同上：不在这里扣票，阵亡事件已经扣过了
  return !!result;
}

/**
 * 翻越（Space）。**不是跳跃**：贴到能翻的东西才响应，空地按下去什么也不发生，
 * 所以这里对失败一声不吭 —— 一个键老是弹"这里翻不过去"比没反应更烦。
 */
function DoVault() {
  if (!player?.Alive || viewmodel.IsBusy?.()) return false;
  if (!player.TryVault()) return false;
  audio.Play("footstepRubble", { volume: 0.7 });
  return true;
}

/**
 * 通用交互（F）。语义按上下文分流，规则在 Script_Interact。
 * 够不着任何东西时同样一声不吭。
 */
function DoInteract() {
  if (!player?.Alive || !interact) return false;
  return !!interact.Perform(player);
}

/**
 * 捡枪。捡到的枪进 1 号槽（长枪位）—— 杂牌部队换枪就是这么换的：
 * 手上这支打坏了就捡地上那支，`L2_RoomWar` 那条注释说的就是这件事。
 * 缴获日械没有备弹（clips = 0），只有枪里那几发。
 */
function PickUpWeapon(weaponId, clips) {
  if (!player?.Alive || !WEAPONS[weaponId]) return false;
  const magazine = WEAPONS[weaponId].magazine ?? 5;
  // 本来就没有长枪的时候，捡到的枪要**直接到手上**。
  // 第一关的目标之一就是「找一支枪（从倒下的人身上捡）」——
  // 捡完还得自己按 1 才拿得出来的话，那一条目标在玩家眼里就是没生效。
  // 判据是"原来 primary 是空的"，不是"当前槽是 primary"：
  // 空着手的时候当前槽是投掷物或大刀（见 RespawnPlayer 的选槽逻辑）。
  const hadNoRifle = !state.slots.primary;
  state.slots.primary = weaponId;
  state.mags.primary = { ammo: magazine, clips };
  state.pickedUp = weaponId;
  if (hadNoRifle) state.activeSlot = "primary";
  if (state.activeSlot === "primary") {
    currentWeapon = weaponId;
    state.ammo = magazine;
    state.clips = clips;
    player.bipod = false;
    state.fireMode = "auto";
    viewmodel.Equip(currentWeapon);
    hud.SetIdentity(state.identity, WEAPONS[currentWeapon]?.name || "");
  }
  return true;
}

/** 呼叫迫击炮。全集团军的迫击炮数得过来，一局两发 —— 这条稀缺本身就是史实。 */
function CallMortar() {
  if (!player.Alive) return;
  const target = AimPoint(160);
  const r = combat.CallMortar(target);
  if (r.ok) {
    hud.Say("你", `迫击炮，坐标——`, 2.6);
    hud.Hint(`炮弹在路上（还剩 ${r.left} 发）`, 4);
  } else {
    hud.Hint(r.reason, 2.4);
  }
}

// ---------------------------------------------------------------------------
// 开火
// ---------------------------------------------------------------------------
let lastFootstepAt = 0;
let fireCooldown = 0;
let fireEdge = false;                 // 这一帧是不是"刚按下"（单发模式与投掷物槽要用）
const _muzzle = new THREE.Vector3();
const _hitPoint = new THREE.Vector3();
const _bulletPos = new THREE.Vector3();
const _bulletVel = new THREE.Vector3();
const _segDir = new THREE.Vector3();
const _rel = new THREE.Vector3();
const _yAxis = new THREE.Vector3(0, 1, 0);
const _xAxis = new THREE.Vector3(1, 0, 0);
const _kick = new THREE.Vector2();
const _marchTargets = [];

// 开镜 FOV 的过渡时长。战地 BFV 全部 82 支枪都是 0.15 s（AimingFovTransitionTime），
// 且**不随武器变化** —— 见 docs/Data_BattlefieldNumbers.md。别再改成每枪一个值。
const ADS_FOV_TIME = 0.15;
let adsFovT = 0;      // 相机侧的开镜量，与 player.ads（动画侧）分开走
let breathFov = 1;    // 屏息那 6% 的独立平滑

// --- 枪感第 1 轮的方子 2 / 3 / 4 所需的状态量 ------------------------------
// 方子 2「开火画面顿挫」：实测原来开火 FOV 偏移 0.0000°，全仓库无任何 shake/punch。
// 这是唯一的 0 分项，而且落在权重 x3 那一组里。
// firePunch 是 0→1 的冲击量，按 85 ms 衰减；FOV 上叠 1.9°（ADS 变化量的 12%）。
// **衰减用平方**：前两帧占掉 60%，那一下才是"顿"而不是"晃"。
const FIRE_PUNCH_DECAY_S = 0.085;
const FIRE_PUNCH_FOV_DEG = 1.9;
let firePunch = 0;
// 方子 4「冲刺→开火延迟」：实测松开冲刺后 sprintSpring 要 771 ms 才回位，
// 0.22 s 是「摆回来一大半但还没稳」的点。不加这一条，
// 「冲进院子贴脸开枪」是零成本最优解 —— 而这是全场最该有代价的动作。
const SPRINT_FIRE_DELAY_S = 0.22;
let sprintReleaseAt = -99;
let sprintWasOn = false;
// 方子 3「接上 sway 输入」：Script_Viewmodel 的三个弹簧全写好了，
// 而这里一直传的是写死的 0 —— 实测相机转 398°，弹簧恒等于 0。
// 弹簧常数一个都不用动，只要把每帧的视角增量算出来传进去。
let lastViewYaw = 0;
let lastViewPitch = 0;
let lastLookDeltaYaw = 0;      // 上一帧真的传给 sway 弹簧的那个数（取证用）

/**
 * 弹道步进积分。
 *
 * 以前是纯 hitscan：一条直线射线 + 圆柱判定，瞬时命中、无重力、无飞行时间。
 * 后果不只是"不写实"——**表尺归零没有任何东西可以补偿**，600 m 外和 6 m 外的
 * 落点规律完全一样，提前量这个概念不存在。
 *
 * 这里每段 0.02 s、按 AMMO[weapon.ammo].muzzle 的考据初速走（七九 810 / 六五 762 /
 * 七七 800），段内复用现成的 battlefield.Raycast。重力挂 difficulty.bulletGravity。
 *
 * **空气阻力（2026-08-19 补）。** 在这之前子弹是一路 810 m/s 飞到底的，
 * 这才是"弹道太平"的根因 —— 不是重力太小，是飞行时间太短。
 * 战地的模型是二次阻力 `a = -k·v²`，k ≈ 0.0025 /m（datamine：Gewehr 98 到 300 m
 * 只剩 45% 初速，反解 k = ln(1/0.45)/300 = 0.00266）。这条我们照抄，因为它是真的
 * 物理，不是手感调参。
 *
 * 但战地那个 **g = 12 m/s² 我们不抄**。那是为了让下坠在屏幕上读得出来做的街机化
 * 处理；这个项目从城墙尺寸到台词出处都以史料为准，重力改成假的说不过去。
 * 结果反而更好：光靠真实阻力把 300 m 的飞行时间从 0.370 s 拉到 0.552 s，
 * 下坠就从 0.67 m 变成约 1.49 m —— 已经在战地那个 1.40 m 的量级上，
 * 而且每一个数字都是真的。
 *
 * 步数从 40 提到 64：带阻力之后同样的 0.02 s 走不了那么远了，
 * 40 段只够 385 m，够不着中正式 500 m 的标称射程。64 段 ≈ 511 m。
 * 一枪 64 次 Raycast 听着多，但玩家一秒才打一发，而 AI 侧仍然是概率命中，不走这条路。
 */
const BULLET_DRAG_K = 0.0025;   // 二次阻力系数，/m。见上方推导。

function MarchBullet(from, dir, weapon, targets) {
  const muzzle = AMMO[weapon.ammo]?.muzzle || 700;
  const gravity = 9.8 * (DIFFICULTY.bulletGravity ?? 1);
  const range = weapon.effectiveRangeM || 400;
  const stepS = 0.02;
  _bulletPos.copy(from);
  _bulletVel.copy(dir).multiplyScalar(muzzle);
  let travelled = 0;
  for (let step = 0; step < 64 && travelled < range; step += 1) {
    // 阻力先于重力：a = -k·v²·v̂，显式欧拉在 0.02 s 步长上误差可以忽略
    // （810 m/s 一步掉 32 m/s，约 4%）。
    const speed = _bulletVel.length();
    if (speed > 1) _bulletVel.multiplyScalar(Math.max(0, 1 - BULLET_DRAG_K * speed * stepS));
    _bulletVel.y -= gravity * stepS;
    _segDir.copy(_bulletVel).multiplyScalar(stepS);
    let segLen = _segDir.length();
    if (segLen < 1e-4) break;
    if (travelled + segLen > range) segLen = range - travelled;
    _segDir.normalize();

    // 先看这一段有没有穿过人：到线段的垂距 < 0.45 m 算命中躯干
    let bestSoldier = null, bestT = Infinity;
    for (const s of targets) {
      _rel.set(s.position.x - _bulletPos.x,
        s.position.y + 0.95 - _bulletPos.y,
        s.position.z - _bulletPos.z);
      const t = _rel.dot(_segDir);
      if (t < 0 || t > segLen) continue;
      const perp = _rel.addScaledVector(_segDir, -t).length();
      if (perp < 0.45 && t < bestT) { bestT = t; bestSoldier = s; }
    }
    const wallHit = battlefield.Raycast(_bulletPos, _segDir, segLen);
    if (bestSoldier && (!wallHit || bestT < wallHit.t)) {
      _hitPoint.copy(_bulletPos).addScaledVector(_segDir, bestT);
      return { soldier: bestSoldier, dist: travelled + bestT, dir: _segDir };
    }
    if (wallHit) {
      _hitPoint.copy(_bulletPos).addScaledVector(_segDir, wallHit.t);
      return { wall: wallHit, dist: travelled + wallHit.t, dir: _segDir };
    }
    _bulletPos.addScaledVector(_segDir, segLen);
    travelled += segLen;
  }
  _hitPoint.copy(_bulletPos);
  return { dist: travelled, dir: _segDir };
}

function TryFire(dt) {
  fireCooldown -= dt;
  if (!input.fire || fireCooldown > 0 || !player.Alive) return;
  if (viewmodel.IsBusy?.()) return;
  // 翻墙翻到一半、或者人泡在水里：枪都不在手上/在水里，打不出去。
  // 这两条是"翻越"与"下水软墙"各自的代价，不写在这里就等于没有代价
  if (player.Busy || player.InWater) return;
  // 枪感方子 4：冲刺 → 开火有 0.22 s 的延迟。
  // 实测松开冲刺后视图模型的 sprintSpring 要 771 ms 才回位，
  // 而原来枪在半空里照样打得出去 —— 于是"冲进院子贴脸开枪"是零成本最优解。
  // 0.22 s 是「摆回来一大半但还没稳」的点：够短，不至于让人觉得枪卡住了。
  if (player.sprint > 0.35) return;
  if (state.elapsed - sprintReleaseAt < SPRINT_FIRE_DELAY_S) return;
  // 大刀槽按左键 = 挥刀，投掷物槽按左键 = 攥弹（松手才扔，走 ReleaseCook）
  if (state.activeSlot === "melee") { if (fireEdge) DoMelee(); return; }
  if (state.activeSlot === "throwable") {
    if (fireEdge && !state.cooking) BeginCook(state.slots.throwable);
    return;
  }
  const weapon = WEAPONS[currentWeapon];
  if (!weapon) return;
  // 开镜播完之前不给开枪：ER2 的枪举到位才打得出去，
  // 否则"右键 + 左键一起按"永远比先瞄再打划算，开镜就没有意义了。
  if (input.ads && player.ads < 0.9) return;
  // 单发模式（仅捷克式）：一次按下只出一发
  if (weapon.rpm && state.fireMode === "semi" && !fireEdge) return;
  if (state.ammo <= 0) {
    // 空仓那一下：栓停在后面，得自己压桥夹。不提示弹药数（ER2 的步兵 HUD 也不显示），
    // 但空膛的"咔"必须听得出来，不然玩家不知道自己在空按扳机。
    audio.Play("bolt", { volume: 0.5 });
    fireCooldown = 0.35;
    if (state.clips > 0) hud.Hint("按 R 压弹", 2.2);
    return;
  }
  state.ammo -= 1;
  state.playerShots += 1;
  fireCooldown = weapon.fireIntervalS ?? 1.2;

  viewmodel.TriggerFire();
  // 枪感方子 2：开火那一下画面要"顿"。这是第 1 轮唯一的 0 分项。
  firePunch = 1;
  // 后坐。Data_Weapons 每支枪的 recoil 表以前一次都没读过 —— 开完枪视角纹丝不动。
  // viewmodel 已经按那张表把这一发的相机踢动算好了（含每发随机的偏航方向与开镜衰减），
  // 这里取走并交给 player：顶上去 100%、只回落 70%，剩 30% 要玩家自己压。
  viewmodel.ConsumeCameraKick(_kick);
  player.ApplyRecoil(_kick.x, _kick.y, weapon.recoil?.recoverS ?? 0.4, weapon.recoil?.recoverFrac ?? 1.0);

  viewmodel.MuzzleWorld(_muzzle);
  audio.Play(currentWeapon === "Zb26" ? "zb26" : "rifleNra",
    // priority：与几十个 AI 共用同一个 22 ms 去重窗口时，玩家自己的枪声实测丢 8.3%。
    // 别的都可以丢，自己扣的扳机不许没声。
    { position: _muzzle.clone(), priority: true });
  // 枪感方子 1：**每发之后的自动拉栓要有声音。**
  // bolt 那条配方 19 节点三段式做得极好，而全仓库只有空扣扳机与架两脚架会播它 ——
  // 打完一发之后一声不响。我们不显示弹药数，这条信息通道原来整个关着：
  // 玩家既听不出自己在拉栓，也听不出这是最后一发。
  // 0.24 s 是枪响之后手真的去够枪机的时间；0.62 s 是弹壳落地。
  // 判据是 kind === "boltRifle"（Data_Weapons 里每支枪都有），
  // 不是"有没有 rpm" —— 驳壳枪与捷克式自己上膛，没有手拉的那一下。
  if (weapon.kind === "boltRifle") {
    audio.Play("bolt", { position: _muzzle.clone(), volume: 0.42, delay: 0.24 });
  }
  audio.Play("shellImpact", { position: _muzzle.clone(), volume: 0.30, delay: 0.62 });
  lights.FlashMuzzle(_muzzle, 24);
  vfx.MuzzleFlash(_muzzle, player.AimDirection(_aimDir), { scale: 1.0 });

  // 散布：没有准星，散布决定落点。移动、压制、带伤都会把它撑大。
  const spread = THREE.MathUtils.degToRad(player.SpreadDeg(weapon));
  const dir = player.AimDirection(_aimDir).clone();
  const rnd = Mulberry32(state.frame * 2654435761);
  const ax = (rnd() - 0.5) * spread, ay = (rnd() - 0.5) * spread;
  dir.applyAxisAngle(_yAxis, ax);
  dir.applyAxisAngle(_xAxis, ay);

  // 视差：起点是**枪口**，不是眼睛。这一行改完之后瞄具与枪管不共轴才成立，
  // 近距离必须心里修正，「没有准星」这件事才有物理支撑。
  const from = _muzzle.clone();
  // 视差量 = 枪口到**瞄准轴**的垂距，不是枪口到眼睛的距离。
  // 后者主要是"枪口在眼前多远"（一米三，那是枪本身的长度），跟共不共轴没关系；
  // 真正决定"近距离要不要心里修正"的是这条垂距。
  const eye = player.EyePosition;
  _rel.set(from.x - eye.x, from.y - eye.y, from.z - eye.z);
  const along = _rel.dot(_aimDir);
  const muzzleOffset = _rel.addScaledVector(_aimDir, -along).length();

  _marchTargets.length = 0;
  const range = weapon.effectiveRangeM || 400;
  for (const s of ai.soldiers) {
    if (!s.alive || s.side === "nra") continue;
    if (s.position.distanceTo(from) > range + 4) continue;
    _marchTargets.push(s);
  }
  const shot = MarchBullet(from, dir, weapon, _marchTargets);

  // 弹道取证：落差是相对**实际射出的那条直线**算的，跟散布无关，只跟重力有关
  const horiz = Math.hypot(dir.x, dir.z) || 1e-6;
  const horizDist = Math.hypot(_hitPoint.x - from.x, _hitPoint.z - from.z);
  state.lastShot = {
    dist: shot.dist,
    horizDist,
    dropM: (from.y + dir.y * horizDist / horiz) - _hitPoint.y,
    muzzleOffsetM: muzzleOffset,
    hitKind: shot.soldier ? "soldier" : shot.wall ? "wall" : "none",
    fromY: from.y, endY: _hitPoint.y,
  };

  if (shot.soldier) {
    const part = shot.dist < 40 && Mulberry32(state.frame * 7919)() < 0.12 ? "head" : "torso";
    // 这里**不扣票**：扣票走 Soldier.Kill() 发的阵亡事件。
    // 两条路径同时扣的话，玩家亲手打死的人会扣两票。
    const died = shot.soldier.TakeHit(weapon.damage, part, dir);
    vfx.Blood(_hitPoint, dir, died ? 1 : 0.5);
    audio.Play("impactFlesh", { position: _hitPoint.clone(), volume: 0.7 });
  } else if (shot.wall) {
    const n = new THREE.Vector3(shot.wall.normal[0], shot.wall.normal[1], shot.wall.normal[2]);
    const tag = shot.wall.box.tag;
    const surface = tag === "barricade" ? "sandbag" : tag === "prop" ? "wood" : "brick";
    vfx.Impact(_hitPoint, n, surface);
    audio.Play(surface === "sandbag" ? "impactDirt" : "impactBrick", { position: _hitPoint.clone(), volume: 0.55 });
  }
  vfx.Tracer(_muzzle, _hitPoint.clone(), { kind: "nra" });
}

// ---------------------------------------------------------------------------
// 目标链
// ---------------------------------------------------------------------------
/**
 * 线性关卡的目标推进。**这里没有占领条，也没有翻旗。**
 *
 * 台儿庄那一版是 ER2 式的占领点：双方都在区内就冻结、只有一方在就按人数推进度、
 * 到头翻旗、丢了整班后撤。那一整套跟着开放战场一起作废了 ——
 * 滕县七关是一条路标链，走到就算到，不会被夺回去。
 *
 * 「走到就算到」的判据不只是进圈：还要求圈里当下没有敌人贴着
 *（半径内 8 m 以内有活着的日兵就先不算到），否则玩家会在被压着打的时候
 * 莫名其妙被推进到下一段剧本。
 *
 * @returns {string|null} 当前正在争夺的路标名（HUD 顶栏用）
 */
function UpdateObjectives(dt) {
  const objectives = battlefield.objectives;
  if (!objectives.length) return null;
  const index = Math.min(state.objectiveIndex, objectives.length - 1);
  const target = objectives[index];
  let contested = null;

  for (const o of objectives) {
    let theirs = 0;
    for (const s of ai.soldiers) {
      if (!s.alive || s.side === "nra") continue;
      if (Math.hypot(s.position.x - o.x, s.position.z - o.z) > o.radius) continue;
      theirs += 1;
    }
    o.contested = theirs > 0 && !o.reached;
    if (o === target && o.contested) contested = o.name;
  }

  if (state.objectiveIndex >= objectives.length) return contested;
  if (!player.Alive) return contested;
  const dist = Math.hypot(player.position.x - target.x, player.position.z - target.z);
  if (dist > target.radius) return contested;
  // 圈里还有人贴着就先不算到
  for (const s of ai.soldiers) {
    if (!s.alive || s.side === "nra") continue;
    if (Math.hypot(s.position.x - target.x, s.position.z - target.z) < 8) return contested;
  }
  ReachObjective(index);
  return contested;
}

/** 到达一个路标。剧本的 zone: 触发、下一条目标文案、烟柱重挂都挂在这里。 */
function ReachObjective(index) {
  const objectives = battlefield.objectives;
  const o = objectives[index];
  if (!o || o.reached) return;
  o.reached = true;
  o.contested = false;
  state.objectiveIndex = Math.min(index + 1, objectives.length);
  const phase = PHASES[state.phaseIndex];
  const text = phase.objectives[state.objectiveIndex];
  if (text) {
    state.storyObjective = text;
    hud.Hint(text, 5.0);
  }
  SeedSmokeColumns(phase);
}

// ---------------------------------------------------------------------------
// 帧
// ---------------------------------------------------------------------------
const _forward = new THREE.Vector3();
const _proj = new THREE.Vector3();

/**
 * @param {number} dt 步长
 * @param {boolean} render 要不要走渲染。**只有通关冒烟会传 false。**
 *   理由：通关冒烟要按出厂配置把六个阶段各推四五分钟（近十万帧），而这台机器上
 *   浏览器是软件光栅（swiftshader），连着渲染几万帧之后渲染进程会**阻塞**
 *   （CPU 掉到接近零、主线程停在 GL 调用上，实跑十次卡住六七次，每次都卡在最长的
 *   那一段）。玩法与剧本的断言一帧画面都不需要，画面健康归开机冒烟管
 *   （Script_BootTest 六个阶段都真渲染并读 draw call）。所以这里给一个口子，
 *   而不是把断言的时长缩水去迁就它。
 */
function Frame(dt, render = true) {
  state.frame += 1;
  state.elapsed += dt;

  // 编辑器接管：与过场同一条通道 —— 玩法全停，只推编辑器与画面。
  // **必须排在过场那一条之前**：Timeline 编辑器要自己按走带的步长推
  // cutscene.Update（暂停、0.25 倍速、拖进度条全靠它），排在后面的话
  // 过场每帧会被推两次，走带上的速度与暂停一个都不生效。
  if (editor && editor.Capturing) {
    editor.Update(dt);
    if (render) RenderScene(dt);
    return;
  }

  // 过场期间：只推过场与画面，玩法全停。
  // 不停的话玩家会在看电影的时候被打死，而且 AI 会照常往前走 ——
  // 过场结束时战场已经不是过场开始时那个战场了。
  if (cutscene && cutscene.Playing) {
    cutscene.Update(dt);
    if (render) RenderScene(dt);
    return;
  }
  // 建切片期间（换关）也只走画面：碰撞盒表正在被换掉，规则层这时候查什么都是错的
  if (!state.ready) return;

  if (state.deathTimer > 0) {
    state.deathTimer -= dt;
    if (state.deathTimer <= 0 && state.pendingRespawn) {
      if (state.nraPool > 0) RespawnPlayer();
      else hud.Say(null, "没有人可以填上去了。", 8);
    }
  }

  const firePrev = input.fire;
  ReadKeys();
  fireEdge = input.fire && !firePrev;
  player.Update(dt, input, WEAPONS[currentWeapon]);
  input.lookX = 0; input.lookY = 0;
  input.crouchPressed = false; input.pronePressed = false;

  // 脚步。Script_Audio 里 footstepDirt / footstepRubble 一直没有任何地方调用过。
  // 快速匍匐那条"更快也更响"的取舍没有脚步声就不存在 —— 玩家听不见自己变响了。
  if (player.Alive && player.grounded && player.stepDistance - lastFootstepAt > 1.0) {
    const stride = player.stance === "prone" ? 1.0 : (player.sprint > 0.5 ? 2.4 : 1.9);
    if (player.stepDistance - lastFootstepAt > stride) {
      lastFootstepAt = player.stepDistance;
      audio.Play(state.frame % 3 === 0 ? "footstepRubble" : "footstepDirt", {
        volume: (player.stance === "prone" ? 0.22 : 0.45) * (player.fastCrawl ? 1.8 : 1),
      });
    }
  }

  // 交互提示：每六帧扫一次身边够得着的东西。每帧扫等于每帧遍历全场七十个人，
  // 而这条提示是给人看的，六帧（0.1 s）的延迟看不出来
  if (interact && player.Alive && state.frame % 6 === 0) interact.UpdatePrompt(player);

  if (player.Alive) TryFire(dt);
  // 松开左键时把攥着的手榴弹扔出去（投掷物槽里左键 = G 键的等价物）
  if (state.activeSlot === "throwable" && state.cooking && !input.fire) ReleaseCook();

  // 开镜时相机 FOV 收缩 —— 铁瞄的"贴脸"感来自这一下。
  // 屏息再收 6%：ER2 屏息时视野有一点点放大，这是"憋住那一口气把注意力收拢"的
  // 视觉说法，也让玩家一眼知道自己确实在屏息（我们不给体力条）。
  //
  // 【2026-08-19 按战地 datamine 重做，两条】
  //
  // 一、**FOV 过渡是固定 150 ms 的，跟哪支枪无关。** BFV 全部 82 支枪的
  //    AimingFovTransitionTime 都是 0.15 s —— 枪的轻重差异**全在视图模型的动画里**，
  //    不在相机上。我们原来是「每枪不同的 ads 速度」再串一层 dt*9 的指数平滑
  //    （≈231 ms 才到位），两层滞后叠在一起，结果驳壳枪和捷克式在相机上反应几乎
  //    一样糊 —— 分不出轻重，方向正好做反了。
  //    现在相机走自己那条 150 ms 的线性过渡，枪的轻重仍由 adsTimeS 在动画上体现。
  //
  // 二、**拉栓/装填强制退出瞄准。** BF1 的栓动枪拉栓会强制退出瞄准镜，那一下
  //    「丢失瞄准画面」对栓动枪分量的贡献，比那 2° 后坐大得多。
  //    Script_Viewmodel 早就在做了（adsInput 乘了 actionBlend），但相机一直没跟上：
  //    枪都甩出画面了视野还是窄的 —— 玩家看到的是「视野卡住了」，不是「在拉栓」。
  const weapon = WEAPONS[currentWeapon];
  const adsHeld = player.wantAds ? 1 : 0;
  const fovStep = dt / ADS_FOV_TIME;
  adsFovT = adsHeld > adsFovT ? Math.min(adsHeld, adsFovT + fovStep)
    : Math.max(adsHeld, adsFovT - fovStep);
  // 拉栓/装填期间乘上视图模型自己那条脱离瞄准的曲线（Script_Viewmodel.adsSuppress）。
  // 用它、而不是在这儿另起一个 150 ms 的 snap，是因为因果要对：
  // 视野丢失是**枪离开了瞄准线**的结果，两者本来就该是同一条曲线。
  const adsEff = adsFovT * (viewmodel.adsSuppress ?? 1);
  // 屏息那 6% 单独平滑：它跟开镜不是一回事，snap 会"啵"一下。
  breathFov += ((player.breathHold ? 0.94 : 1) - breathFov) * Clamp01(dt * 6);
  const baseFov = graphics.fov * (1 - adsEff * (1 - (weapon?.adsFovScale ?? 0.75))) * breathFov;

  // 枪感方子 2：开火顿挫。85 ms 衰减，**平方**衰减让前两帧吃掉六成 ——
  // 那一下才是"顿"而不是"晃"。叠在 FOV 上 1.9°，约等于开镜变化量的 12%。
  //
  // 关于「把 FOV 追踪系数 dt*9 提到 dt*26」那一条：**那个系数已经不存在了。**
  // 上一轮照战地 datamine 把相机侧的指数平滑整个换成了固定 150 ms 的线性过渡
  //（见上面那段注释），camera.fov 现在是每帧直接赋值的，没有任何一层平滑会
  // 把 1.9° 抹平。所以这一条方子的目的（"别让顿挫被插值吃掉"）现在由结构保证，
  // 不需要那个魔法数。这不是漏做，是前提变了。
  if (firePunch > 0) {
    firePunch = Math.max(0, firePunch - dt / FIRE_PUNCH_DECAY_S);
  }
  const punch = firePunch * firePunch;
  const targetFov = baseFov + punch * FIRE_PUNCH_FOV_DEG;
  if (Math.abs(camera.fov - targetFov) > 0.001) {
    camera.fov = targetFov;
    camera.updateProjectionMatrix();
  }

  // 枪感方子 4 的另一半：记下松开冲刺的时刻（TryFire 读它）
  const sprintOn = player.sprint > 0.35;
  if (sprintWasOn && !sprintOn) sprintReleaseAt = state.elapsed;
  sprintWasOn = sprintOn;

  // 枪感方子 3：**把视线增量接进 sway 弹簧。**
  // 三个弹簧、限幅、增量换算 Script_Viewmodel 全写好了，而这里一直传的是 0 ——
  // 实测相机转了 398° 而三个弹簧恒等于 0，等于整套"枪滞后于视线"没接线。
  // 算增量要用**枪口方向**（yaw + aimYaw），不是视线：自由瞄准那一段偏移
  // 本来就是"枪还没跟上"的一部分，漏掉它枪会在自由瞄准范围内诡异地不动。
  const viewYaw = player.yaw + player.aimYaw;
  const viewPitch = player.pitch + player.aimPitch;
  let dYaw = viewYaw - lastViewYaw;
  // 绕过 ±π 那一圈：不处理的话转身穿过背后时会甩出一个 2π 的假增量，
  // 枪会整个飞出画面（弹簧限幅救不了，因为输入本身错了三个数量级）
  if (dYaw > Math.PI) dYaw -= Math.PI * 2;
  else if (dYaw < -Math.PI) dYaw += Math.PI * 2;
  const dPitch = viewPitch - lastViewPitch;
  lastViewYaw = viewYaw;
  lastViewPitch = viewPitch;
  lastLookDeltaYaw = dYaw;

  viewmodel.Update(dt, {
    dt, moveSpeed: Clamp01(Math.hypot(player.velocity.x, player.velocity.z) / 3.2),
    strafe: input.strafe, grounded: player.grounded, sprint: player.sprint,
    ads: player.ads, lookDeltaYaw: dYaw, lookDeltaPitch: dPitch,
    crouch: player.stanceBlend.crouch, elapsed: state.elapsed,
    // 枪感方子 1 的另一半：最后一发打完栓停在后面不推回。
    // 我们不显示弹药数，这是玩家唯一能"看见"自己没子弹了的通道。
    lowAmmo: state.ammo <= 1,
  });

  // 友军倒下：叙事层要靠它触发「他倒了我上，我倒了你上」那几句。
  // 用计数差而不是回调 —— AiDirector 没有死亡事件，加一个回调等于改它的契约，
  // 而计数差在这里够用且不会漏（同一帧死两个人只报一次，叙事上也没差别）。
  const alliesNow = ai.CountSide("nra");
  if (state.prevAllies > 0 && alliesNow < state.prevAllies && story) story.Signal("allyDown");
  state.prevAllies = alliesNow;

  ai.Update(dt, camera);
  vfx.Update(dt, camera, state.elapsed);
  combat.Update(dt, { phase: PHASES[state.phaseIndex] });

  // 投弹蓄力：按住 G/H 的时间同时决定扔多远和引信烧掉多少
  if (state.cooking) state.cook += dt;
  sky.Update(state.elapsed);
  lights.Update(dt, state.elapsed);
  camera.getWorldDirection(_forward);
  lights.UpdateShadowFrustum(player.position, _forward);
  if (gi) {
    gi.Update(dt, camera.position, lights);
    // 半球光按探针体的淡入量退让：两边都开就是双份天光，屋里会亮得像在院子里
    lights.SetGiActive(gi.uniforms.enabled.value);
  }

  // 死亡判定必须放在**所有会造成伤害的系统都跑完之后**，并且用跨帧状态而不是
  // 帧内局部变量。玩家最常见的死法是被手榴弹/掷弹筒炸死，而爆炸结算在
  // combat.Update 里 —— 判定放在 player.Update 紧后面的话，那一类死法会被整个吞掉：
  // 不弹卡片、兵员池不扣、不换人，玩家永远躺在地上。
  if (state.playerAliveLast && !player.Alive) OnPlayerDown();
  state.playerAliveLast = player.Alive;

  const contested = UpdateObjectives(dt);

  // 「占点耗对方的票」那一套（ER2 2.0.9 的机制）跟着占领点一起删了。
  // 线性关卡里逼玩家往前打的是**时间**与**剧本**，不是一条会把你耗死的进度条：
  // 城是必然陷落的，磨时间没有任何好处。

  // --- 叙事层 ---
  // 身边六十米内有敌人在开枪 = 正在交火。原剧本的 wave:N / waveClear:N
  // 就映射到这个计数上 —— 开放战场没有编排好的波次，但"身边打起来了"这件事有。
  let fighting = false;
  for (const s2 of ai.soldiers) {
    if (!s2.alive || s2.side === "nra") continue;
    if (state.elapsed - s2.lastFire > 2.5) continue;
    if (s2.position.distanceTo(player.position) < 60) { fighting = true; break; }
  }
  story.SetFighting(fighting);
  const playerZone = battlefield.objectives.find((o) =>
    Math.hypot(player.position.x - o.x, player.position.z - o.z) < o.radius);
  story.Update(dt, {
    zone: playerZone ? playerZone.id : null,
    objectiveIndex: state.objectiveIndex,
    objectiveCount: state.objectiveCount,
    levelSeconds: state.levelSeconds,
    pool: state.nraPool,
  });
  if (story.ObjectiveText) state.storyObjective = story.ObjectiveText;

  // --- 结束条件 ---
  // **这座城没有"守住"这个结局。** 三月十七日它陷落，十八日午前肃清完毕，
  // 这是信史，不给玩家改。所以"赢"只有一种意思：这一关的目标链走完了。
  // 唯一的失败是池子空了 —— 「城里还站着的人」减到零，再没有人可以填上去。
  if (!state.outcome && state.nraPool <= 0 && !player.Alive) EndBattle("defeat");

  state.phaseTime += dt;
  const phase = PHASES[state.phaseIndex];
  // 换关：目标链走完，或者配置时长到了（史实时段是往前走的，不等玩家）
  const levelOver = !state.pinned
    && (state.objectiveIndex >= state.objectiveCount || state.phaseTime > state.levelSeconds);
  if (levelOver && !state.advancing && !state.outcome) {
    // 异步：建下一片切片要分帧走完。这里只管点火，别 await —— Frame 是同步的。
    AdvanceLevel().catch((error) => console.error("换关失败", error));
  }
  // 补兵
  state.spawnAccumulator += dt;
  if (state.spawnAccumulator > 3) { state.spawnAccumulator = 0; SeedSoldiers(phase); }

  // --- HUD ---
  hud.SetObjective(contested ? `争夺中：${contested}` : (state.storyObjective || phase.label),
    state.nraPool, null);
  hud.SetState({
    stance: STANCE[player.stance].label,
    wounded: player.wounds.length > 0,
    bleeding: player.bleeding,
    bandages: player.bandages,
    breath: player.breathHold,
    order: state.order,
    // 不显示子弹数（ER2 的步兵 HUD 也不显示，自己数或者听拉栓那一下），
    // 但手榴弹与集束是要计划的资源，这两个得看得见。
    grenades: state.grenades,
    bundles: state.bundles,
    mortar: combat.MortarReady ? combat.MortarLeft : 0,
    cooking: state.cooking ? Math.min(1, state.cook / 1.1) : 0,
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
  if (!render) return;
  RenderScene(dt);
}

/**
 * 合成与出画。抽成函数是因为**过场也要走同一条** ——
 * 曝光、雾、泛光、去饱和全按当关的天光预设装配，过场那条分支自己再抄一份
 * 必然抄漏（夜战预设 exposure 是 3.6，抄成 0.5 整帧就是纯黑）。
 */
function RenderScene(dt) {
  const phase = PHASES[state.phaseIndex];
  ssao.map.value = post.AoTexture;
  // gl_FragCoord 在主靶的像素域里，喂 AO 靶尺寸会整张错位
  ssao.resolution.value.set(post.width, post.height);
  ssao.strength.value = SSAO_BASE * graphics.ssao;
  const preset = SKY_PRESETS[phase.sky];
  // 粒子层要与合成 pass 共用同一份雾：它不进深度法线预通道，合成 pass 那趟
  // 又明写"深度 0 的天空不吃雾"，于是背景是天空的粒子像素一点雾都吃不到 ——
  // 两百米外的黑烟柱会在天上留一个越长越大的纯黑洞。这三行是把那一半补回来：
  // 预通道靶（判断背景是不是天空 + 软粒子）、雾参数、太阳方向（雾的朝阳增益）。
  // SetSize 会重建靶，纹理引用每帧都可能换，所以每帧重接，不能只在初始化接一次。
  vfx.SetDepthSource(post.NormalDepthTexture, post.width, post.height);
  vfx.SetFog(preset.fog, preset.sunColor);
  vfx.SetSun(sky.sunDirection);
  const suppression = player ? player.suppression : 0;
  const health = player ? player.health : 100;
  post.Render(scene, camera, {
    sunDirection: sky.sunDirection,
    sunColor: preset.sunColor,
    fog: preset.fog,
    exposure: preset.exposure,
    bloom: preset.bloom * graphics.bloom,
    godStrength: preset.godStrength * graphics.god,
    saturation: preset.saturation * (1 - suppression * 0.35),
    contrast: preset.contrast,
    grain: (phase.sky === "night" ? 0.020 : 0.014) * graphics.grain,
    vignette: (0.42 + suppression * 0.22) * graphics.vignette,
    damage: Clamp01(1 - health / 62) * 0.55,
    motionBlur: 0.15 * graphics.motionBlur,
  });
}

/**
 * 收尾。
 *
 * **不打歼敌数** —— 中日双方口径至今没有定论，那是宣传数字不是史实。
 * 也**不给"守住了"这个结局**：滕县三月十七日陷落是信史，不由玩家改。
 * 两种收场：
 *   breakout —— 七关走完，从北门出去。这是史实里发生过的那一种。
 *   defeat   —— 「城里还站着的人」减到零，再没有人可以填上去。
 */
function EndBattle(outcome) {
  if (state.outcome) return;
  state.outcome = outcome;
  hud.ShowEpilogue(outcome === "breakout" ? EPILOGUE.breakout : EPILOGUE.wipedOut);
  audio.Music(outcome === "breakout" ? "aftermath" : null);
}

/**
 * 出图/测试用：推进固定帧数（不依赖真实时间，画面可复现）。
 *
 * 菜单开着时推的是**菜单帧**，不是玩法帧 —— 推玩法帧会在菜单背后真的打起来，
 * 而那正是 OpenMenu 花力气避免的事（见那里第三条）。
 */
function StepFrames(count = 1, dt = 1 / 60, render = true) {
  for (let i = 0; i < count; i += 1) {
    if (state.menu && menu && menu.live) MenuFrame(dt, render);
    else Frame(dt, render);
  }
}

// ---------------------------------------------------------------------------
// 指针锁：五条解锁通道（函数本体在「输入」一节，跟 RequestPointerLock 放一起）
// ---------------------------------------------------------------------------
document.addEventListener("pointerlockchange", OnPointerLockChange);
window.addEventListener("blur", ReleasePointerLock);
window.addEventListener("pagehide", ReleasePointerLock);
// 标签页切到后台也放掉：blur 管的是窗口失焦，visibilitychange 管的是标签切换 /
// 最小化；两条并不总是一起来。锁挂在一个看不见的标签上，等于把鼠标夹在一个
// 用户看不见的矩形里（Windows 上指针锁就是 ClipCursor，见 FAKE_POINTER_LOCK 注释）。
document.addEventListener("visibilitychange", () => { if (document.hidden) ReleasePointerLock(); });
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  // 过场里 Esc 是"跳过"，交给 CutsceneDirector 自己的监听；这里只管游戏中的退出
  if (state.cutscene) return;
  ReleasePointerLock();
  // 有菜单时 Esc 是「暂停」：ER2 也是这个键。菜单自己那份 Esc 管的是面板返回，
  // 两边不会打架 —— 它只在 menu.open 时响应，这里只在游戏中响应。
  if (menu && state.running) PauseGame();
});

let last = performance.now();
function Loop(now) {
  requestAnimationFrame(Loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  // 菜单态：只推运镜与画面（玩法停摆）。暂停态两个都是 false —— 世界冻住，
  // 最后那一帧留在屏幕上，菜单盖在它上面，这正是暂停该有的样子。
  if (state.menu && menu && menu.live && state.ready) { MenuFrame(dt); return; }
  // 过场没有自己的帧驱动，全靠 Frame() 里那条 cutscene 分支推。
  // 而从主菜单进关时 state.running 还是 false（要等过场播完才 StartRun）——
  // 不放行的话「开始」会卡死在关前过场里：过场在等一个永远不来的帧，
  // 而 StartRun 在等过场结束。关卡之间那条路之所以没暴露这个坑，
  // 是因为换关时玩家还在游戏里，state.running 一直是 true。
  if (!state.running && !(cutscene && cutscene.Playing)) return;
  Frame(dt);
}
requestAnimationFrame(Loop);

/**
 * 把画质旋钮落到渲染器上。**改完必须调它**，改字段本身什么也不会发生。
 *
 * 阴影那一条要连着重编译材质：`renderer.shadowMap.enabled` 是编译期的
 * `#define USE_SHADOWMAP`，只改标志位而不置 needsUpdate 的话，着色器还按老样子
 * 去采一张已经不再更新的图 —— 画面会留着一层永不变化的假阴影。
 * 重编译是一次性的（几百毫秒），而这是个设置动作，不是每帧的事。
 */
function ApplyGraphics() {
  const scale = Clamp(graphics.renderScale, 0.4, 1.6);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  post.SetSize(Math.round(window.innerWidth * scale), Math.round(window.innerHeight * scale));

  const wantShadow = !!graphics.shadows;
  if (renderer.shadowMap.enabled !== wantShadow) {
    renderer.shadowMap.enabled = wantShadow;
    scene.traverse((object) => {
      const material = object.material;
      if (!material) return;
      if (Array.isArray(material)) material.forEach((m) => { m.needsUpdate = true; });
      else material.needsUpdate = true;
    });
  }
  if (gi) {
    gi.enabled = !!graphics.gi;
    if (!gi.enabled) { gi.blend = 0; gi.SyncUniforms(); lights.SetGiActive(0); }
    const preset = SKY_PRESETS[PHASES[state.phaseIndex].sky];
    if (preset) gi.ApplyPreset(preset, graphics.giStrength);
  }
  if (graphics.shadowSize && lights.sun.shadow.mapSize.x !== graphics.shadowSize) {
    lights.sun.shadow.mapSize.set(graphics.shadowSize, graphics.shadowSize);
    // 换分辨率必须把旧的那张扔掉，three 才会按新尺寸重建
    if (lights.sun.shadow.map) {
      lights.sun.shadow.map.dispose();
      lights.sun.shadow.map = null;
    }
  }
}

window.addEventListener("resize", ApplyGraphics);

Boot().catch((error) => {
  bootStep.textContent = "启动失败：" + error.message;
  console.error(error);
  throw error;
});
