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
import { SetWaterSkyUniforms, UpdateWaterSurfaces } from "./Script_Water.mjs";
import { TengxianField } from "./Script_TengxianField.mjs";
import { InitPhysics, PhysicsWorld } from "./Script_Physics.mjs";
import { JieheField, JIEHE_LEVEL_ID, JIEHE_CAMERA_FAR } from "./Script_JieheField.mjs";
import { RangeField } from "./Script_RangeField.mjs";
import {
  RANGE_PHASE, RANGE_LEVEL_ID, RANGE_TARGETS, RANGE_STATIONS, RANGE_RESPAWN_S,
} from "./Data_Range.mjs";
import {
  MELEE_QTE_PHASE, MELEE_QTE_LEVEL_ID, MELEE_QTE_TARGETS, MELEE_QTE_STATIONS,
} from "./Data_MeleeQte.mjs";
import {
  FIRST_LEVEL_WHITEBOX_PHASE, FIRST_LEVEL_WHITEBOX_LEVEL_ID,
} from "./Data_FirstLevelWhitebox.mjs";
import {
  FIRST_LEVEL_P012_WHITEBOX_PHASE, FIRST_LEVEL_P012_WHITEBOX_LEVEL_ID,
} from "./Data_FirstLevelP012Whitebox.mjs";
import { FirstLevelWhiteboxField } from "./Script_FirstLevelWhiteboxField.mjs";
import { FirstLevelP012Director } from "./Script_FirstLevelP012Flow.mjs";
import { FirstLevelP012Runtime } from "./Script_FirstLevelP012Runtime.mjs";
import { CAST } from "./Data_TengxianScript.mjs";
import {
  PhaseContentId, ContentZoneId, AllowAutonomousBark, EvaluateFirstLevelObjectiveGate,
} from "./Script_FirstLevelWhiteboxFlow.mjs";
import { NavGrid } from "./Script_Navigation.mjs";
import { PlayerController } from "./Script_Player.mjs";
import { AiDirector, MakeSoldierIdentity } from "./Script_Ai.mjs";
import { ActorFactory } from "./Script_Actor.mjs";
import { ActorBatcher } from "./Script_ActorBatch.mjs";
import { Viewmodel } from "./Script_Viewmodel.mjs";
import { FirstPersonSelfShadow } from "./Script_FirstPersonSelfShadow.mjs";
import { VfxSystem } from "./Script_Vfx.mjs";
import { AudioEngine } from "./Script_Audio.mjs";
import { Hud, ContextualActionPrompts, CrosshairGeometry } from "./Script_Hud.mjs";
import { StoryDirector, CHAPTER_RELEASE_SIGNAL } from "./Script_Story.mjs";
import { CutsceneDirector } from "./Script_Cutscene.mjs";
import { CombatSystem } from "./Script_Combat.mjs";
import { LoadGrenadeAsset } from "./Script_GrenadeAsset.mjs";
import { InputRouter } from "./Script_Input.mjs";
import { MeleeQteDirector } from "./Script_MeleeQte.mjs";
import { RadialWheel } from "./Script_Wheel.mjs";
import { InteractSystem } from "./Script_Interact.mjs";
import { CarrySystem } from "./Script_Carry.mjs";
import { EmplacementSystem } from "./Script_Emplacement.mjs";
import { IdentifySystem, IDENTIFY } from "./Script_Identify.mjs";
import { EditorSuite } from "./Script_Editor.mjs";
import { MainMenu, Progress } from "./Script_Menu.mjs";
import { DebugOptions } from "./Script_DebugOptions.mjs";
import { DestructionSystem, MakeDestructionUniforms } from "./Script_Destruction.mjs";
import { FrameProfiler } from "./Script_Profiler.mjs";
import { BootProp } from "./Script_BootProp.mjs";
import { AddExternalProps, ClearExternalProps } from "./Script_ExternalProps.mjs";
import { AddTrimProps, ClearTrimProps } from "./Script_TrimProps.mjs";
import { AircraftFlight, MakeAircraftStrafeHost } from "./Script_Aircraft.mjs";
import { AircraftStrafeDirector } from "./Script_AircraftStrafe.mjs";
import { FlareDirector, MakeFlareHost } from "./Script_Flare.mjs";
import { TelegraphSystem, MakeTelegraphHost } from "./Script_Telegraph.mjs";
import { CompanionDirector } from "./Script_Companion.mjs";
import { CheckpointRecorder } from "./Script_Checkpoint.mjs";
import { MissionSetpieceDirector, LastLitterArrived } from "./Script_MissionSetpieces.mjs";
import { RECIPES } from "./Script_TexBake.mjs";
import {
  MENU_SCENE, OVERVIEW_PHASE, FULL_SCENE_PHASE, JIEHE_SANDBOX_PHASE,
} from "./Data_Menu.mjs";
import { WEAPONS, LOADOUTS, AMMO, IJA_SQUAD, GUN_MELEE } from "./Data_Weapons.mjs";
import { WEAPON_MESH_VARIANTS, WEAPON_MESH_BY_ID } from "./Data_Meshes.mjs";
import { PHASES, REINFORCE, ORDERS, SCALE_PRESETS, WORLD, COMBAT, DIFFICULTY, EPILOGUE } from "./Data_Battle.mjs";
import { CUTSCENES } from "./Data_TengxianScript.mjs";
import { TRAVERSAL } from "./Data_Traversal.mjs";
import { Clamp, Clamp01, HashString, Mulberry32 } from "./Script_Noise.mjs";

// 近身班组的人数：不是加出来的兵，是把原本撒在两百米外、被雾墙吃掉的人挪到镜头前。
// 实测一个 Actor 是 **37 个 draw call**（身体部件没合批），14 个近身兵约 1400 calls，
// 低于当前 5000 红线。5 + 4 是班组构成，不再是靠藏人的性能上限；全场开销由
// Script_BootTest 按 5000 dc / 600 万三角面统一验。
const NEAR_SQUAD = { nra: 5, ija: 4 };

/** 弹道与抛掷物的射线要连解析地表一起打（见 Script_Physics.RaycastTerrain）。 */
const TERRAIN_RAY = { terrain: true };
/**
 * 非军人或角色 GLB 加载失败时的保底判定球。正式军人命中走 Actor 上随骨骼更新的
 * 头/躯干/四肢球体与胶囊；这个值只保证资源故障时游戏仍可进行。
 */
const HITBOX = COMBAT.hitbox;
/** 没有物理世界时脚部 IK 拿到的法线（平地）。 */
const FLAT_NORMAL = [0, 1, 0];

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

function MakeLevelBounds(bounds, margin = 10) {
  return {
    minX: bounds.minX + margin, maxX: bounds.maxX - margin,
    minZ: bounds.minZ + margin, maxZ: bounds.maxZ - margin,
  };
}
function AirColumnEnteredRoad(column, position) {
  const members=(column?.litters || []).flatMap(litter=>[litter.front,litter.rear]);
  const head=column?.HeadPosition?.();
  return members.length===4 && !!head && Math.hypot(position.x-head.x,position.z-head.z)<12
    && members.every(member=>member?.handle?.alive && member.handle.position.z>=60 && Math.abs(member.handle.position.x-50)<8);
}

// 执行到这一行 = 一百五十多个文件的模块图整张拉齐了。告诉 index.html 的开机守望
// 别再按「模块没到」处理，后面真正的启动失败由文件末尾 Boot().catch 自己亮牌。
window.__bootMainAlive = true;
window.__bootGuardDismiss?.();

const params = new URLSearchParams(location.search);
const QUALITY = params.get("quality") || "high";
const SCALE = SCALE_PRESETS[params.get("scale") || "medium"] || SCALE_PRESETS.medium;
const SHOT = params.get("shot");                 // 出图模式：不进指针锁、固定机位
const EDITOR_PARAM = params.get("editor");
// 上一版曾把完整场景编辑器的车厢按钮指到正式序章预览。旧书签若还带着这组 query，
// 也必须按静态场景解释，不能因为缓存 URL 又把过场播起来。
const LEGACY_FULL_SCENE_CARRIAGE = EDITOR_PARAM === "fullScene"
  && params.get("preview") === "CS_Chuchuan";
// 新版序章是一个**独立预览**：它只展示车厢时间轴，不把下车后的未完玩法
// 硬接到旧界河。稳定入口固定为 ?preview=CS_Chuchuan；其它 query 仍走正片。
const PREVIEW_ID = !LEGACY_FULL_SCENE_CARRIAGE && params.get("preview") === "CS_Chuchuan"
  ? "CS_Chuchuan" : null;
const PREVIEW = !!PREVIEW_ID;
// 从主页面的「新版序章预览」链接进入时直接开播，不能再让玩家在加载完成后
// 面对第二颗同义按钮。保留不带 autoplay 的地址作为审片/音频解锁回退入口。
const PREVIEW_AUTOPLAY = PREVIEW && params.get("autoplay") === "1";
/**
 * 玩法测试靶场（?range=1）：人机共同测试用的独立沙盒（docs/Data_TestRange.md）。
 * 实现方式是**整表替换**：PHASE_TABLE 在靶场模式下只有 RANGE_PHASE 一关，
 * 下面所有 `PHASE_TABLE[state.phaseIndex]` 的消费者一个都不用学"这一关不算数"。
 * 正片的 PHASES（七关、菜单、进度、BootTest 的口径）一概不知道靶场存在。
 */
const RANGE = params.get("range") === "1";
const MELEE_TEST = params.get("melee") === "1";
/** 第一关策划白盒（?whitebox=1）：独立纯白方盒场地，复用正式 CH1_NanLu 内容。 */
const FIRST_LEVEL_WHITEBOX = params.get("whitebox") === "1";
const FIRST_LEVEL_P012_WHITEBOX = params.get("whitebox") === "p012";
/**
 * 序 · 界河白盒（?jiehe=1）：与靶场同一条整表替换的路子。
 * 界河退出了正片流程，但 Script_JieheField / Script_JieheHeight /
 * OUTFIELD_SCENES.L0_Jiehe / Data_Dressing_JieheVillages 那一整套资产一件没删 ——
 * 这条入口就是给它们的（回归口 Script_JieheTerrainTest）。切片定义在 Data_Menu。
 */
const JIEHE = params.get("jiehe") === "1";
/**
 * 全城俯瞰（?phase=overview）：**出图与自检专用**，不进选章列表。
 * 重制之后没有哪一章会建整座城，而「照城防图核对整座城」这件事仍然要做 ——
 * 采样点表（Data_SamplePoints 的 `phase: "overview"`）、Script_ShotTest 的 Z 系列
 * 与 Script_TownDressingDump 都从这条入口进。切片是 Data_Battle.OVERVIEW_BOUNDS。
 *
 * 它**不算 SANDBOX**：菜单要照常在开机时接管相机（Z 系列靠 `menuShot` 架机位），
 * 换成沙盒那一套「菜单只建不开」之后，ApplyShot 摆完就会被玩家相机顶掉。
 *
 * 代价说清楚：菜单开着、选章仍然列七章，而这条 URL 下 PHASE_TABLE 只有一条 ——
 * 真人在这儿点某一章会被 `StartLevel` 的 Clamp 夹回这一片（不崩，但也不是那一章）。
 * 出图与自检脚本从不点选章，所以没为这一条另加一层门；真要进正片就把 query 去掉。
 */
const PHASE_PARAM = params.get("phase");
const OVERVIEW = PHASE_PARAM === "overview";
const FULL_SCENE = PHASE_PARAM === "fullscene" || LEGACY_FULL_SCENE_CARRIAGE;
// 完整场景编辑器内部的只读视图：carriage 仍走 fullscene 旁路，只是在城外另挂
// 一份静态车厢布景。它不是 preview=CS_Chuchuan，也绝不会启动正式序章。
const FULL_SCENE_VIEW = FULL_SCENE
  && (LEGACY_FULL_SCENE_CARRIAGE || params.get("fullSceneView") === "carriage")
  ? "carriage" : "county";
const SANDBOX = RANGE || MELEE_TEST || FIRST_LEVEL_WHITEBOX || FIRST_LEVEL_P012_WHITEBOX || JIEHE;
const PHASE_TABLE = RANGE ? [RANGE_PHASE]
  : MELEE_TEST ? [MELEE_QTE_PHASE]
    : FIRST_LEVEL_WHITEBOX ? [FIRST_LEVEL_WHITEBOX_PHASE]
      : FIRST_LEVEL_P012_WHITEBOX ? [FIRST_LEVEL_P012_WHITEBOX_PHASE]
      : JIEHE ? [JIEHE_SANDBOX_PHASE]
        : OVERVIEW ? [OVERVIEW_PHASE]
          : FULL_SCENE ? [FULL_SCENE_PHASE]
            : PHASES;
// 无音频环境（或审片时主动关音频）也必须能完整收口。AudioEngine 自己会对
// AudioContext 缺失降级，这个开关只负责不建上下文，避免 preview=...&audio=0
// 在无头/禁音浏览器里留下悬挂的加载与定时器。
const AUDIO_ENABLED = !SHOT && params.get("audio") !== "0";
// 截图工具显式打开手动步进后，页面 rAF 不得偷偷推进过场；普通出图模式仍
// 保留原有的自动循环，只有 Script_CutsceneShot 传 manual=1 才启用此闸。
const MANUAL_STEP = params.get("manual") === "1";
// 出图专用的两个常驻输入：开镜（E 组唯一能验的镜头）与开火（枪口焰/曳光/抛壳）。
// 必须在 ReadKeys **之后**盖上去 —— 直接写 player.ads 会在下一帧被
// player.Update(input) 里的 input.ads=false 覆盖成 0，实测就是这么白跑一轮的。
// 第一人称默认使用国军模型 01 派生的制服蒙皮双臂 + 十指骨骼 IK。`?arms=legacy` 只留作资产读取
// 失败时的诊断入口；正常游戏、截图与冲刺都不再显示程序化手。
const RIGGED_ARMS = params.get("arms") !== "legacy";
const SHOT_ADS = !!(SHOT && params.get("ads"));
const SHOT_FIRE = !!(SHOT && params.get("fire"));
/**
 * 主菜单。**出图与 ?menu=0 下不建** —— 那两种模式要的是「进页面就是这一关」：
 * 三个冒烟脚本（PlayTest / EditorTest / VoiceTest）点的都是 #bootStart 那颗按钮，
 * 出图脚本连点都不点，直接 StepFrames。菜单只服务真人。
 */
const MENU_ON = !SHOT && !PREVIEW && params.get("menu") !== "0";
/**
 * 开机要不要**打开**主菜单。靶场（?range=1）里菜单照建不误 —— Esc 暂停、设置、
 * 调试选项与「退出靶场」都挂在它上面 —— 但开机不开：靶场是「进页面就是这片场地」，
 * 而且菜单的运镜机位表（MENU_SHOTS）按正片关卡 id 分组，靶场那一片根本没有机位。
 */
const MENU_AT_BOOT = MENU_ON && !SANDBOX;
/**
 * 开机建哪一片切片。
 * 给了 ?phase= 就听它的（出图、冒烟、调机位都靠这条）；
 * 没给且要进菜单，就建 MENU_SCENE.slice —— 菜单背后那片活场景是城墙那一关，
 * 城墙是这座城的招牌，序关的界河是二十公里外的空地，当不了门面。
 */
const MENU_SLICE = Math.max(0, PHASE_TABLE.findIndex((p) => p.id === MENU_SCENE.slice));
// `?phase=overview` 已经在上面换掉了整张表，这里就没有序号可解析了 ——
// parseInt("overview") 是 NaN，而 NaN 会一路穿过 Math.min/Math.max 变成 START_PHASE。
const PHASE_INDEX = PHASE_PARAM !== null ? parseInt(PHASE_PARAM, 10) : NaN;
const START_PHASE = Number.isFinite(PHASE_INDEX)
  ? Math.max(0, Math.min(PHASE_TABLE.length - 1, PHASE_INDEX))
  : (MENU_AT_BOOT ? MENU_SLICE : 0);

const canvas = document.getElementById("view");
const hudRoot = document.getElementById("hud");
const menuRoot = document.getElementById("menu");
const boot = document.getElementById("boot");
const bootBar = document.querySelector("#bootBar i");
const bootStep = document.getElementById("bootStep");
const bootStart = document.getElementById("bootStart");

// 加载画面的道具展示台。**开机就转起来**，不等主场景 —— 它自己一台小 renderer，
// 与主渲染器无关；建关那十几秒里玩家能拖着它转。出图模式下不建（截图里不许有它）。
const bootProp = SHOT ? null : new BootProp(
  document.getElementById("bootProp"),
  document.getElementById("bootPropName"),
  document.getElementById("bootPropNote"),
);
/** 加载画面收放的唯一入口：`.gone` 与展示台的启停必须同步，否则它在游戏里空转。 */
function ShowBoot(on) {
  boot.classList.toggle("gone", !on);
  if (on) bootProp?.Show(); else bootProp?.Hide();
}

/** 加载画面那行字与那条进度条。开机、换关、过场预热三条链共用这一只口。 */
function SetBootStep(label, progress) {
  bootStep.textContent = label;
  bootBar.style.width = `${Math.round(Clamp01(progress) * 100)}%`;
}

/** 让出一个宏任务。**不许换成 setTimeout**：后台页面的定时器被钳到最少 1 s，
 *  挂过五分钟还会掉到一分钟一次，比不让步还慢。MessageChannel 不是定时器，
 *  不吃这份钳制（React 的调度器也是为这个用它）。 */
function NextTask() {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    channel.port1.onmessage = () => { channel.port1.close(); resolve(); };
    channel.port2.postMessage(0);
  });
}

/**
 * 让出一帧 —— 开机与换关那条链上每做一步就调一次，好让进度条动起来。
 *
 * **可见时才等 rAF。** 标签页切到后台、或者窗口在 Windows 上被别的窗口整个盖住
 * （Chrome 的遮挡检测把这两件事判成同一件：hidden），浏览器一帧都不发。整条
 * 加载链于是钉死在当前这一步 —— 用户实拍到的是加载条停在 86%、字幕停在城生成器
 * 最后那次 yield 的「就绪」（Script_TengxianCity 末尾那条，在开机的量程里正好落在
 * 0.24 + 0.62 = 0.86）、而「进 城」还是灰的：那不是游戏就绪，是城建完了，后面
 * 还有上刺刀、建关、建菜单没跑。切回前台才继续往下走。
 *
 * 所以隐藏时不等帧，改走宏任务：反正没人看进度条，加载还比前台快（不再被 60 Hz 限速）。
 * 等帧的中途被切走也要放行 —— 那一次 rAF 回调永远不会来了。
 */
function NextFrame() {
  if (document.hidden) return NextTask();
  return new Promise((resolve) => {
    const finish = () => {
      document.removeEventListener("visibilitychange", finish);
      resolve();
    };
    requestAnimationFrame(finish);
    document.addEventListener("visibilitychange", finish, { once: true });
  });
}

bootProp?.Show();

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
renderer.setSize(window.innerWidth, window.innerHeight, false);
// three 默认 checkShaderErrors = true：每个 program **第一次被用到**时同步去取
// getProgramInfoLog / getShaderInfoLog。那是一次强制同步 —— 驱动必须把还在后台
// 并行编译的着色器全部编完才能回答，KHR_parallel_shader_compile 白装了。
// 这一局要链五十来个 program，开机路径上是笔实打实的账。
// 出图/自检模式（?shot，冒烟测试走的就是它）保留检查：那条路要的是"坏了立刻红"，
// 不是快；玩家那条路要的是快，编译真出错在别处也看得见（画面直接不对）。
renderer.debug.checkShaderErrors = !!SHOT;
renderer.shadowMap.enabled = true;
// r185 的 shadowMapTypeDefines 里只有 PCFShadowMap 与 VSMShadowMap；
// 写 PCFSoftShadowMap 会掉进 SHADOWMAP_TYPE_BASIC（硬阴影 + 最近邻）。
renderer.shadowMap.type = THREE.PCFShadowMap;
// 阴影图一帧只烘一次。three 默认 autoUpdate = true，意思是**每一次
// renderer.render() 都把所有灯的阴影图重烘一遍** —— 而我们一帧里
// renderer.render 要跑二十几次（深度法线预通道 1 次 + 主场景 1 次 +
// GI 探针那二十来次小四边形）。实测 phase=2 城里：阴影 draw call
// 从 444/帧掉到 222/帧，纯渲染耗时 17.3 ms → 15.5 ms，画面逐像素不变
// （同一帧里灯和投影体都没动过，重烘出来的本来就是同一张图）。
// 每帧由 RenderScene 在出画前点一次 needsUpdate（见那里）。
renderer.shadowMap.autoUpdate = false;
renderer.toneMapping = THREE.NoToneMapping;      // 色调映射收在合成 pass 里
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
// 世界矩阵一帧只算一次。three 的 renderer.render() 每次都会把整棵场景树
// 重算一遍 matrixWorld，而一帧里主相机就要渲两趟（深度法线预通道 + 主场景），
// 城里这棵树是**四千个节点**（六十九个人物各带四五十个骨骼/部件节点）——
// 白算一整趟。关掉自动更新，改由 RenderScene 在出画前显式算一次；
// 两趟渲染读到的是同一份矩阵，画面逐像素不变。
// 注意：以后任何在 RenderScene 之外要读 matrixWorld / getWorldPosition 的新代码，
// 拿到的仍是「上一次出画时」的位姿 —— 这一点和改之前完全一样（原来也是渲染时才更新）。
scene.matrixWorldAutoUpdate = false;
// FOV 55：Easy Red 2 那种“周围很远、人很小但看得清”的观感靠窄视场。
// 70 度会把巷战拉成鱼眼，远处的人缩成一个点，尺度感全没了。
const BASE_FOV = 55;
// SSAO 的出厂强度。设置面板按倍率乘它，所以要有个名字。
const SSAO_BASE = 0.80;
const camera = new THREE.PerspectiveCamera(BASE_FOV, window.innerWidth / window.innerHeight, 0.06, 620);
camera.rotation.order = "YXZ";

// 破口 uniform 同时喂主材质、阴影与深度法线预通道，三条链必须是一只洞。
const destructionUniforms = MakeDestructionUniforms();
const post = new PostPipeline(renderer, {
  width: window.innerWidth, height: window.innerHeight, quality: QUALITY,
  destruction: destructionUniforms,
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

// 运行时性能剖析器。构造免费、常态休眠（Enable 由编辑器「性能剖析」叠加层调）；
// Frame/RenderScene 里的 B/E/Gpu* 标记在它关着时只是一次布尔检查。
const profiler = new FrameProfiler(renderer, { post });

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
  // 独立小阴影图，只在第一人称手臂/武器材质内部采样；仍服从上面的阴影总闸。
  firstPersonSelfShadow: true,
  ssao: 1, bloom: 1, god: 1, motionBlur: 1, grain: 1, vignette: 1,
  // 抗锯齿：TAA 开着时末趟的 FXAA 自动让位（两层叠加只会糊）。出厂值跟画质档走
  // （medium 及以上默认开），但这是**布尔开关不是倍率** —— 它不决定"画多重"，
  // 决定的是走哪条抗锯齿路，所以不套 Mul 那套倍率约定。
  taa: post.taaEnabled,
  // 体积光临时关停（性能观察期）：god 仍是强度倍率，godEnabled 是整个 pass 的总闸，
  // 关掉时连径向模糊那一趟都不跑。想恢复把出厂值改回 true 即可。
  godEnabled: false,
  // 实时探针体默认关。默认间接光由 Global SH Probe + AmbientColor 提供；打开时
  // 才跑五个 GI pass/帧，并在图集收敛后渐进接管室内与墙角的反弹光。
  gi: params.get("gi") === "1", giStrength: 1,
  fov: BASE_FOV,
};
// 探针体（GI）。默认关到底：ProbeVolume 不构造（省掉图集/靶与每帧 Update），
// 材质也**不编入**探针采样代码 —— GI_SAMPLE_GLSL 占着采样器与寄存器，
// 即使 uGiEnabled 恒为 0 也让整帧贵 ~2.7 ms（2026-08-26 FrameProfileTest 实测）。
// ?gi=1 或画质面板打开时，由 ApplyGraphics 惰性构造 + 材质重编译（同阴影开关先例）。
// low 档没有 GI 配置，连调试视图基建也不注入（Debug Rendering 的材质/光照组不可用）。
const GI_ON = GI_QUALITY[QUALITY] != null;
const giUniforms = MakeGiUniforms();
// GI 取样端假彩色（?giView=1 探针辐照度 / 2 天空 IBL / 3 confidence），开发取证用。
// GI 关着也可用：材质仍带调试视图基建，1/2 显示实际在用的天空 IBL、3/4/5 显示 0。
giUniforms.debugView.value = parseFloat(params.get("giView") || "0") || 0;
// 编译期开关：false = 材质不含探针采样代码（进了 cache key，翻转要整场重编译）
giUniforms.sampling = GI_ON && graphics.gi;
const library = new MaterialLibrary(renderer, {
  textureSize: QUALITY === "low" ? 256 : 512, ssao, gi: GI_ON ? giUniforms : null,
  destruction: destructionUniforms,
});
const sky = new SkyDome(renderer);
scene.add(sky.mesh);
// 水面借天空 uniform：反射的天顶/地平线/太阳色随时段预设一起换（Script_Water）
SetWaterSkyUniforms(sky.uniforms);
const lights = new LightRig(scene, { quality: QUALITY, shadowExtent: 66 });
// 天空 uniform 借给探针体：漏空的射线问的是同一片天，换预设两边同时变。
// let 不是 const：默认关不构造，运行时打开由 ApplyGraphics 惰性补建。
let gi = (GI_ON && graphics.gi)
  ? new ProbeVolume(renderer, { quality: QUALITY, skyUniforms: sky.uniforms, uniforms: giUniforms })
  : null;
if (gi) gi.enabled = true;
const hud = new Hud(hudRoot);
const audio = new AudioEngine({ enabled: AUDIO_ENABLED });
audio.allowAutonomousBark = () => AllowAutonomousBark(PHASE_TABLE[state.phaseIndex],
  (signal) => story?.Signalled(signal) || false);

const state = {
  ready: false,
  running: false,
  // 预编译着色器的那一段（见 WarmupShaders）：加载画面盖着屏幕，这几帧一律不出画。
  // 出画就等于把还没编完的 program 全部同步逼出来，而那正是这一步要摊开的账。
  warming: false,
  // 预览不属于可玩关卡：完成后停在片尾，不自动启动旧 L0 的 AI/战斗。
  preview: PREVIEW,
  previewId: PREVIEW_ID,
  previewDone: false,
  previewPlaying: false,
  previewError: null,
  previewHandoffShown: false,
  previewHandoffCount: 0,
  manualStep: MANUAL_STEP,
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
  order: "",
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
  objectiveBlockedReason: null, // 白盒关卡事实门未满足时的取证，不另加屏幕说明。
  levelSeconds: 0,            // 本关的配置时长（秒）
  advancing: false,           // 正在换关（建城是分帧的，期间不许再触发一次）
  cutscene: null,             // 正在播的过场 id；非 null 时玩家没有控制权
  // 钉住当前关（只给测试用）：剧本长跑要在**一关之内**按出厂时长推满，
  // 不许中途自动换关 —— 换关会重置剧本队列，量到的就不是这一关的剧本了。
  pinned: false,
  // 钉关原语（mechanics.pinFinalZone）：走到最后一个路标**不自动换关**，
  // 等 story.Signal("ChapterRelease") 才放行。第五关最终白刃战那三层与视角接替
  // 三段全在最后一个路标之后，不钉住的话 objectiveIndex 一满就换关，整段被吃掉。
  // 与上面那条 pinned 分开：pinned 是测试用的手闸，这一条是**章节数据声明的**。
  pinFinalZone: false,
  chapterReleased: false,
  chapterReleaseAt: 0,        // 放行时的关内秒数（取证：是被信号放的还是被保险丝放的）
  cutscenesPlayed: [],        // 播过/跳过的过场，通关冒烟看这张表
  // 摆点层记下的**同一局之内**的场景事实（拆过几块门板、罗班长倒下了）。
  // 不进存档 —— 它们是场景状态，不是进度。取证口在 Debug.Setpieces。
  setpieceFacts: {},
  // 剧情道具背包。现在只有一件：顺子藏在背包底的那件民用短褂（序章起就在，
  // 三关阶段⑩撕掉之后**永久移除、不给替代品**）。
  setpieceItems: { civilianShirt: 1 },
  // 火墙（三关传单入火那一段封住的追击路线）。每条 { id, ax, az, bx, bz, until, damagePlayer }。
  firewalls: [],
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
  // 外观变体随槽位走。大刀拾取后必须保留尸体上那一把，不能在玩家手里变样。
  weaponVariants: { primary: 0, secondary: 0, melee: 0, throwable: 0 },
  activeSlot: "primary",
  // --- 刺刀 -----------------------------------------------------------------
  // 长枪上有没有装着刺刀（X 键装/卸；只对 Data_Weapons 里 bayonet: true 的枪有意义）。
  // 换到短枪再换回来状态保留；捡新枪、换关重置。
  bayonetFixed: false,
  // 白刃蓄力（V 或空枪左键按住中）：{ t 已按住秒数, source: "key"|"mouse" }
  meleeCharge: null,
  // 每支枪各记各的弹仓 —— 换回来不该是满的
  mags: { primary: { ammo: 0, clips: 0 }, secondary: { ammo: 0, clips: 0 } },
  loadoutId: null,
  fireMode: "auto",           // 仅捷克式可切（0 键）
  pickedUp: null,             // 最近一次从尸体上捡到的武器（取证用）
  pickedUpVariant: 0,
  lastShot: null,             // 最后一发的弹道取证：起点、落点、下坠、枪口视差
};

let battlefield = null;
/**
 * 物理世界（Rapier）。**与 battlefield 一一对应，换关一起换。**
 * 静态几何在 BuildField 末尾一次性灌进去；玩家、AI、抛掷物、布娃娃都挂在它上面。
 */
let physics = null;
let navGrid = null;
let player = null;
let ai = null;
let meleeQte = null;
let vfx = null;
let viewmodel = null;
let firstPersonSelfShadow = null;
let actorFactory = null;
let actorBatch = null;
let story = null;
let combat = null;
let destruction = null;
let interact = null;
// 负重状态机（担架/药箱/门板…）。规则在 Script_Carry，这里只接线。
let carry = null;
/** 上一帧枪收没收（负重与架设机枪共用的边沿）；别每帧写 visible，会跟过场那一处抢。 */
let carryHidGun = false;
// 架设武器（可接管的固定机枪位）。规则与数值全在 Script_Emplacement，这里只接线。
let emplacement = null;
/** 冒烟用的「扳机一直扣着」（Debug.Emplacement.Fire）；正片里恒为 false。 */
let debugEmplacedFire = false;
/** 上枪位之前是站是蹲；离位时还回去（不然从机枪上下来的人永远是蹲着的）。 */
let seatStanceBefore = null;
/** 上一帧占着哪一挺；用来认出「刚下枪位」那一个边沿。 */
let mountedIdLast = null;
/** 机枪位的世界模型：id -> { root, nodes }。摆点建、换关拆。 */
const emplacementViews = new Map();
let identify = null;
let cutscene = null;
// 天空机群是纯视觉层：它跨关复用模型，换关时只更新航线中心。
let aircraft = null;
// 日机扫射航线（第一关阶段五/六/八）。规则与数值全在 Script_AircraftStrafe，
// 宿主适配器在 Script_Aircraft，这里只接线。
let strafe = null;
// 照明弹（第四关东关之夜）。时间线、光强包络与发现距离倍率全在 Script_Flare；
// 灯走 LightRig 的火光池、烟走 VfxSystem 的烟源池，这里只接线。
let flare = null;
// 发报（终章亲手发出最后一封电报）。码组推进/中断/重连全在 Script_Telegraph；
// 两个交互点由它出预制，装配层只把系统实例交给摆点方。
let telegraph = null;
// 具名同伴（罗班长、幺娃、何有田…）。名册、跟随几何与「谁在场」全在 Script_Companion；
// 这里只把「造人 / 挪人 / 倒地」三件事翻给 AiDirector。它同时是 story 语音的定位来源
//（AttachVoice 的 locate），没有它的话每一句台词都是从玩家脑门上发出来的。
let companion = null;
// 脚本检查点（第一关「不躲被击倒 → 从数秒前重来」）。环形采样在 Script_Checkpoint，
// 这里只给它「采一帧」与「写回去」两个回调。**不扣兵员池、不走死亡换人卡。**
let checkpoint = null;
let p012Flow = null;
let p012Runtime = null;

// 章节摆点（集成批 INT2）。「哪一章在哪一拍做什么」是**数据**，在 Script_MissionSetpieces
// 的 SETPIECES 里一章一条；装配层只建一次、每帧推一下、换关告诉它换到哪儿去了。
// 它是七个玩法系统与七章内容之间唯一的接缝 —— 这个文件里因此**没有一行 if (章 id)**。
let setpieces = null;
// 脚本安排的无敌窗口（四关罗班长救顺子那 4—6 秒）。到时刻为止，玩家被打倒
// 不走死亡链路而是走检查点倒带 —— 固定事件里死掉会把那一段整个跳过去。
let scriptInvulnUntil = 0;
// 正在播的过场自带的天空预设名（cut.sky）；null = 按本关的天空走。
let cutsceneSky = null;
// 编辑器套件（齿轮按钮 + 六个编辑器）。Boot 末尾才建 —— 它拿的是活引用。
// 出图与两个冒烟里它照样建，只是整棵 DOM 被 .off 藏起来（截图里不许有它）。
let editor = null;
// 主菜单。同样是 Boot 末尾才建（要拿相机与建好的切片），出图与 ?menu=0 下不建。
let menu = null;
// 从菜单进入场景编辑器时，关闭工具后要回到原来的菜单层；正常游戏中打开则为 null。
let editorReturnMenuMode = null;
let currentWeapon = "HanYang";
// 下令轮盘。HUD 那条静态横排（1跟我来 2向前…）已经撤掉：
// ER2 的指挥手感是"按住 Tab 推一下鼠标松手"，眼睛不用离开战场。
const wheel = new RadialWheel(hudRoot);
const debugOptions = new DebugOptions();

/** 调试补给只补当前已有的装备，不会凭空给本关没有的枪或特殊投掷物。 */
function EnsureDebugInventory() {
  if (debugOptions.Enabled("infiniteAmmo")) {
    const weapon = WEAPONS[currentWeapon];
    if (weapon?.magazine) {
      state.ammo = Math.max(state.ammo, weapon.magazine);
      if (state.mags[state.activeSlot]) state.mags[state.activeSlot].ammo = state.ammo;
    }
  }
  if (debugOptions.Enabled("infiniteGrenades")) {
    state.grenades = Math.max(1, state.grenades);
    if (!state.slots.throwable) state.slots.throwable = "Grenade";
  }
}

function ApplyDebugOptions() {
  const options = debugOptions.Get();
  player?.SetDebugOptions(options);
  EnsureDebugInventory();
  return options;
}

function SetDebugOption(id, enabled) {
  debugOptions.Set(id, enabled);
  return ApplyDebugOptions();
}

// ---------------------------------------------------------------------------
// 启动
// ---------------------------------------------------------------------------
async function Boot() {
  const setStep = (label, progress) => {
    bootStep.textContent = label;
    bootBar.style.width = `${Math.round(progress * 100)}%`;
  };

  /**
   * 外部 PBR 贴图。二十八套、八十二张图、约三十八 MB —— 开机路径上最大的一块网络。
   *
   * **不许再写成一个大 Promise.all。** 图片元素的加载没有超时这回事：一条连接
   * 挂住了就既不 load 也不 error，那张图的 Promise 永远悬着，整个 Promise.all
   * 跟着永远不 settle —— 加载画面停在「加载 PBR 材质……」、进度条钉在四分之一，
   * 而展示台在 worker 里照转，页面看上去完全正常。（playwright 里把任意一张
   * hold 住，一次就复现。）旧写法还有第二个毛病：一个 try 罩着全部二十八套，
   * 任何一张图 404 都会让**其余二十七套**一起退回程序化 PBR。
   *
   * 现在改成：逐套下、逐套接错、每张图带超时（Script_Materials._LoadExternalImage），
   * 六条道并行 —— 同域本来也只有六个 HTTP/1.1 并发名额，一口气推八十二张只是
   * 让它们互相排队，还把约三十八 MB 的解码压在同一瞬间。步骤文字带上 N/28，
   * 卡住的时候一眼能看出停在第几套。
   */
  const PBR_SETS = [
    { name: "Steel",
      albedo: "./Texture/Texture_WeaponSteelV2Base.webp?v=1",
      normal: "./Texture/Texture_WeaponSteelV2Normal.webp?v=1",
      orm: "./Texture/Texture_WeaponSteelV2Orm.webp?v=1" },
    { name: "WoodStock",
      albedo: "./Texture/Texture_WeaponWoodV2Base.webp?v=1",
      normal: "./Texture/Texture_WeaponWoodV2Normal.webp?v=1",
      orm: "./Texture/Texture_WeaponWoodV2Orm.webp?v=1" },
    { name: "DadaoPbr",
      albedo: "./Texture/Texture_DadaoBase.webp?v=1",
      normal: "./Texture/Texture_DadaoNormal.webp?v=1",
      orm: "./Texture/Texture_DadaoOrm.webp?v=1" },
    { name: "HandcartWood", fallback: "WoodBeam",
      albedo: "./Texture/Texture_HandcartWoodBase.webp?v=cartcrate20260826",
      normal: "./Texture/Texture_HandcartWoodNormal.webp?v=cartcrate20260826" },
    { name: "WoodCrate",
      albedo: "./Texture/Texture_WoodCrateBase.webp?v=woodpbr20260829",
      normal: "./Texture/Texture_WoodCrateNormal.webp?v=woodpbr20260829",
      orm: "./Texture/Texture_WoodCrateOrm.webp?v=woodpbr20260829" },
    { name: "TreeBark",
      albedo: "./Texture/Texture_TreeBarkBase.webp?v=1",
      normal: "./Texture/Texture_TreeBarkNormal.webp?v=1",
      orm: "./Texture/Texture_TreeBarkOrm.webp?v=1" },
    { name: "BrickWall",
      albedo: "./Texture/Texture_BrickWallBase.webp?v=1",
      normal: "./Texture/Texture_BrickWallNormal.webp?v=1",
      orm: "./Texture/Texture_BrickWallOrm.webp?v=1" },
    { name: "CityWallBrickPbr",
      albedo: "./Texture/Texture_CityWallBrickBase.webp?v=1",
      normal: "./Texture/Texture_CityWallBrickNormal.webp?v=1",
      orm: "./Texture/Texture_CityWallBrickOrm.webp?v=1" },
    { name: "CityWallCorePbr",
      albedo: "./Texture/Texture_CityWallCoreBase.webp?v=1",
      normal: "./Texture/Texture_CityWallCoreNormal.webp?v=1",
      orm: "./Texture/Texture_CityWallCoreOrm.webp?v=1" },
    { name: "CityWallStonePbr",
      albedo: "./Texture/Texture_CityWallStoneBase.webp?v=1",
      normal: "./Texture/Texture_CityWallStoneNormal.webp?v=1",
      orm: "./Texture/Texture_CityWallStoneOrm.webp?v=1" },
    { name: "Ground",
      albedo: "./Texture/Texture_GroundBase.webp?v=1",
      normal: "./Texture/Texture_GroundNormal.webp?v=1",
      orm: "./Texture/Texture_GroundOrm.webp?v=1" },
    // 东门外翻耕地：ImageGen 专属土壤 albedo + 对位 normal；干土继续复用
    // 已校验的 Ground ORM（非金属、全粗糙）。图片缺失时 RECIPES 同名项兜底。
    { name: "PloughedSoil",
      albedo: "./Texture/Texture_PloughedSoilBase.webp?v=eastfield20260826",
      normal: "./Texture/Texture_PloughedSoilNormal.webp?v=eastfield20260826",
      orm: "./Texture/Texture_GroundOrm.webp?v=1" },
    { name: "GroundRubble",
      albedo: "./Texture/Texture_GroundBase.webp?v=1",
      normal: "./Texture/Texture_GroundNormal.webp?v=1",
      orm: "./Texture/Texture_GroundOrm.webp?v=1" },
    { name: "RoofTile",
      albedo: "./Texture/Texture_RoofTileBase.webp?v=1",
      normal: "./Texture/Texture_RoofTileNormal.webp?v=1",
      orm: "./Texture/Texture_RoofTileOrm.webp?v=1" },
    { name: "GateBrick",
      albedo: "./Texture/Texture_GateBrickBase.webp?v=gate20260826",
      normal: "./Texture/Texture_GateBrickNormal.webp?v=gate20260826",
      orm: "./Texture/Texture_GateBrickOrm.webp?v=gate20260826" },
    { name: "GatePaintedWood",
      albedo: "./Texture/Texture_GatePaintedWoodBase.webp?v=gate20260826",
      normal: "./Texture/Texture_GatePaintedWoodNormal.webp?v=gate20260826",
      orm: "./Texture/Texture_GatePaintedWoodOrm.webp?v=gate20260826" },
    { name: "GateRoofTile",
      albedo: "./Texture/Texture_GateRoofTileBase.webp?v=gate20260826",
      normal: "./Texture/Texture_GateRoofTileNormal.webp?v=gate20260826",
      orm: "./Texture/Texture_GateRoofTileOrm.webp?v=gate20260826" },
    { name: "Sandbag",
      albedo: "./Texture/Texture_SandbagBase.webp?v=regen20260824",
      normal: "./Texture/Texture_SandbagNormal.webp?v=regen20260824",
      orm: "./Texture/Texture_SandbagOrm.webp?v=regen20260824" },
    { name: "WattleFence",
      albedo: "./Texture/Texture_WattleFenceBase.webp?v=woodpbr20260829",
      normal: "./Texture/Texture_WattleFenceNormal.webp?v=woodpbr20260829",
      orm: "./Texture/Texture_WattleFenceOrm.webp?v=woodpbr20260829" },
    { name: "BrickWallSooty",
      albedo: "./Texture/Texture_BrickWallSootyBase.webp?v=1",
      normal: "./Texture/Texture_BrickWallSootyNormal.webp?v=1",
      orm: "./Texture/Texture_BrickWallSootyOrm.webp?v=1" },
    { name: "BuildingDamageEarly",
      albedo: "./Texture/Texture_BuildingDamageEarlyBase.webp?v=damageLineage20260829",
      normal: "./Texture/Texture_BuildingDamageEarlyNormal.webp?v=damageLineage20260829",
      orm: "./Texture/Texture_BuildingDamageEarlyOrm.webp?v=damageLineage20260829" },
    { name: "BuildingDamageSevere",
      albedo: "./Texture/Texture_BuildingDamageSevereBase.webp?v=damageLineage20260829",
      normal: "./Texture/Texture_BuildingDamageSevereNormal.webp?v=damageLineage20260829",
      orm: "./Texture/Texture_BuildingDamageSevereOrm.webp?v=damageLineage20260829" },
    { name: "Adobe",
      albedo: "./Texture/Texture_AdobeBase.webp?v=1",
      normal: "./Texture/Texture_AdobeNormal.webp?v=1",
      orm: "./Texture/Texture_AdobeOrm.webp?v=1" },
    { name: "Stone",
      albedo: "./Texture/Texture_StoneBase.webp?v=1",
      normal: "./Texture/Texture_StoneNormal.webp?v=1",
      orm: "./Texture/Texture_StoneOrm.webp?v=1" },
    // 院落三件：imagegen Base + 对位 Normal，继续借 Stone ORM 的非金属全粗糙口径。
    // 缺图时各自退回同名程序化配方，不牵连通用 Stone 或其它外部 PBR。
    { name: "WellStone", fallback: "Stone",
      albedo: "./Texture/Texture_WellStoneBase.webp?v=courtyardpbr20260830",
      normal: "./Texture/Texture_WellStoneNormal.webp?v=courtyardpbr20260830" },
    { name: "Millstone", fallback: "Stone",
      albedo: "./Texture/Texture_MillstoneBase.webp?v=courtyardpbr20260830",
      normal: "./Texture/Texture_MillstoneNormal.webp?v=courtyardpbr20260830" },
    { name: "WaterVatCeramic", fallback: "Stone",
      albedo: "./Texture/Texture_WaterVatBase.webp?v=courtyardpbr20260830",
      normal: "./Texture/Texture_WaterVatNormal.webp?v=courtyardpbr20260830" },
    { name: "StationBrick",
      albedo: "./Texture/Texture_StationBrickBase.webp?v=e2",
      normal: "./Texture/Texture_StationBrickNormal.webp?v=e2",
      orm: "./Texture/Texture_StationBrickOrm.webp?v=e2" },
    { name: "PrisonBrick",
      albedo: "./Texture/Texture_PrisonBrickBase.webp?v=e2",
      normal: "./Texture/Texture_PrisonBrickNormal.webp?v=e2",
      orm: "./Texture/Texture_PrisonBrickOrm.webp?v=e2" },
    { name: "TemplePlaster",
      albedo: "./Texture/Texture_TemplePlasterBase.webp?v=1",
      normal: "./Texture/Texture_TemplePlasterNormal.webp?v=1",
      orm: "./Texture/Texture_TemplePlasterOrm.webp?v=1" },
    // 出川车厢那三套。**曾经是 1254px PNG，一家占掉整张表 71% 的字节**
    //（28 MB / 39 MB），因为它们是全项目唯一没走 512px WebP 那条烘焙线的贴图。
    // 而车厢是按世界尺寸平铺的（一张图铺 1 m，见 Script_Cutscene.TILE_BY_RECIPE），
    // 512px 就是每米 512 个纹素，多出来的分辨率任何机位都采样不到。
    // 现在走 _import/Script_BakeCarriagePbr.py 降采样出的 WebP：21 MB → 0.37 MB。
    // 顺带摘掉了 CarriageWallSteel —— Data_CutsceneChuchuan 里一次都没 mat 引用它
    //（端墙实测渲成纯黑之后早就改走 WoodStock/Adobe），却一直每次开机下 6.5 MB。
    { name: "CarriageBenchWood",
      albedo: "./Texture/Texture_CarriageBenchWoodBase.webp?v=car512",
      normal: "./Texture/Texture_CarriageBenchWoodNormal.webp?v=car512",
      orm: "./Texture/Texture_CarriageBenchWoodOrm.webp?v=car512" },
    { name: "CarriageFloorSteel",
      albedo: "./Texture/Texture_CarriageFloorSteelBase.webp?v=car512",
      normal: "./Texture/Texture_CarriageFloorSteelNormal.webp?v=car512",
      orm: "./Texture/Texture_CarriageFloorSteelOrm.webp?v=car512" },
    { name: "CarriageCeilingSteel",
      albedo: "./Texture/Texture_CarriageCeilingSteelBase.webp?v=car512",
      normal: "./Texture/Texture_CarriageCeilingSteelNormal.webp?v=car512",
      orm: "./Texture/Texture_CarriageCeilingSteelOrm.webp?v=car512" },
    // 卢沟桥武器合集：每个材质槽继续采样源 UV。只有漫反射图的旧材质用
    // fallback 补 ORM；源漫反射绝不被项目通用钢木纹覆盖。条目刻意显式列出，
    // 让 BootPayloadTest 能逐套核对 URL、单张大小与开机总字节。
    { name: "LugouqiaoWaltherP38", fallback: "LugouqiaoWaltherP38",
      albedo: "./Texture/Texture_LugouqiaoWaltherP38Base.jpg?v=lq2",
      normal: "./Texture/Texture_LugouqiaoFlatNormal.png?v=lq2" },
    { name: "LugouqiaoUnidentifiedMunition", fallback: "LugouqiaoUnidentifiedMunition",
      albedo: "./Texture/Texture_LugouqiaoUnidentifiedMunitionBase.jpg?v=lq2",
      normal: "./Texture/Texture_LugouqiaoFlatNormal.png?v=lq2" },
    { name: "LugouqiaoUnidentifiedBoltActionRifle", fallback: "LugouqiaoUnidentifiedBoltActionRifle",
      albedo: "./Texture/Texture_LugouqiaoUnidentifiedBoltActionRifleBase.jpg?v=lq2",
      normal: "./Texture/Texture_LugouqiaoFlatNormal.png?v=lq2" },
    { name: "LugouqiaoOfficerSword", fallback: "LugouqiaoOfficerSword",
      albedo: "./Texture/Texture_LugouqiaoOfficerSwordBase.jpg?v=lq2",
      normal: "./Texture/Texture_LugouqiaoFlatNormal.png?v=lq2" },
    { name: "LugouqiaoRingPommelDagger", fallback: "LugouqiaoRingPommelDagger",
      albedo: "./Texture/Texture_LugouqiaoRingPommelDaggerBase.jpg?v=lq2",
      normal: "./Texture/Texture_LugouqiaoFlatNormal.png?v=lq2" },
    { name: "LugouqiaoUnidentifiedAntiaircraftMetal", fallback: "LugouqiaoUnidentifiedAntiaircraftMetal",
      albedo: "./Texture/Texture_LugouqiaoUnidentifiedAntiaircraftMetalBase.jpg?v=lq2",
      normal: "./Texture/Texture_LugouqiaoFlatNormal.png?v=lq2" },
    { name: "LugouqiaoUnidentifiedAntiaircraftWood", fallback: "LugouqiaoUnidentifiedAntiaircraftWood",
      albedo: "./Texture/Texture_LugouqiaoUnidentifiedAntiaircraftWoodBase.jpg?v=lq2",
      normal: "./Texture/Texture_LugouqiaoFlatNormal.png?v=lq2" },
    { name: "LugouqiaoLightMortar", fallback: "LugouqiaoLightMortar",
      albedo: "./Texture/Texture_LugouqiaoLightMortarBase.jpg?v=lq2",
      normal: "./Texture/Texture_LugouqiaoFlatNormal.png?v=lq2" },
    { name: "LugouqiaoType11AmmoBox", fallback: "LugouqiaoType11AmmoBox",
      albedo: "./Texture/Texture_LugouqiaoType11AmmoBoxBase.jpg?v=lq2",
      normal: "./Texture/Texture_LugouqiaoFlatNormal.png?v=lq2" },
    { name: "LugouqiaoType11Body", fallback: "LugouqiaoType11Body",
      albedo: "./Texture/Texture_LugouqiaoType11BodyBase.jpg?v=lq2",
      normal: "./Texture/Texture_LugouqiaoFlatNormal.png?v=lq2" },
    { name: "LugouqiaoType11BodyAlt", fallback: "LugouqiaoType11BodyAlt",
      albedo: "./Texture/Texture_LugouqiaoType11BodyAltBase.jpg?v=lq2",
      normal: "./Texture/Texture_LugouqiaoFlatNormal.png?v=lq2" },
    { name: "LugouqiaoType11Fore", fallback: "LugouqiaoType11Fore",
      albedo: "./Texture/Texture_LugouqiaoType11ForeBase.jpg?v=lq2",
      normal: "./Texture/Texture_LugouqiaoFlatNormal.png?v=lq2" },
    { name: "LugouqiaoMauser96",
      albedo: "./Texture/Texture_LugouqiaoMauser96Base.jpg?v=lq2",
      normal: "./Texture/Texture_LugouqiaoFlatNormal.png?v=lq2",
      orm: "./Texture/Texture_LugouqiaoMauser96Orm.png?v=lq2" },
    { name: "LugouqiaoKarabiner98k",
      albedo: "./Texture/Texture_LugouqiaoKarabiner98kBase.jpg?v=lq2",
      normal: "./Texture/Texture_LugouqiaoKarabiner98kNormal.png?v=lq2",
      orm: "./Texture/Texture_LugouqiaoMetalOrm.png?v=lq2" },
  ];
  /**
   * 同时在路上的套数。
   *
   * **别再按「同域六条 HTTP/1.1 连接」来设这个数。** 线上是 GitHub Pages，走
   * HTTP/2：一条连接上多路复用，六并发反而把每个请求的往返时延（实测到 Pages
   * 约 1 s）串成一列 —— 28 套 / 6 就是至少五轮 RTT，而它们本来可以一起飞。
   * 之所以还留一个上限而不是全放开：一次性铺开会让解码与 GPU 上传挤在同一瞬间，
   * 而这一步之后紧接着就要建关卡。取 12（36 张图在路上），是"时延摊得开"与
   * "解码不成堆"之间的折中；贴图总量从 39 MB 压到 12 MB 之后这个数已经不吃紧了。
   */
  const PBR_LANES = 12;

  /**
   * 大部分程序化配方会被上面那张表整套顶掉
   * （`LoadExternalSet` 直接 `baked.set(name, 下载来的三张)`）。烘完再扔＝白烧 CPU：
   * 实测占开机 8.4 s 里的大头（Adobe 1.24 s、RoofTile 1.24 s、BrickWall 0.97 s…）。
   *
   * 所以开机只烘外部图不覆盖的那几张（ClothNra / ClothIja / SteelHelmet，以及
   * `fallback` 那一路要拿来当 ORM 底材的 WoodBeam —— 少烘一张，
   * 手推车就没有粗糙度可继承了）。被跳过的那些**等外部那套真读失败了再补烘**，
   * 见下面 catch 里的那一行：一套几百毫秒，而读失败本来就是异常路径。
   *
   * 别把这里改成"全烘一遍保平安"：那正是这段代码要删掉的东西。
   */
  const pbrOverridden = new Set(PBR_SETS.map((set) => set.name));
  for (const set of PBR_SETS) if (set.fallback) pbrOverridden.delete(set.fallback);
  const bakeNames = Object.keys(RECIPES).filter((name) => !pbrOverridden.has(name));

  setStep("烘贴图……", 0.02);
  let baked = 0;
  const total = bakeNames.length;
  for (const name of library.PrepareSteps(bakeNames)) {
    baked += 1;
    setStep(`烘贴图 ${baked}/${total} · ${name}`, 0.02 + 0.22 * (baked / total));
    await NextFrame();
  }


  setStep("加载 PBR 材质……", 0.242);
  const pbrQueue = PBR_SETS.slice();
  const pbrFailed = [];
  let pbrDone = 0;
  const RunPbrLane = async () => {
    for (;;) {
      const set = pbrQueue.shift();
      if (!set) return;
      try {
        if (set.fallback) await library.LoadExternalBaseNormal(set.name, set.fallback, set);
        else await library.LoadExternalSet(set.name, set);
      } catch (error) {
        // 这一套退回程序化 PBR，别的套不受影响。开机时它被跳过了（见 bakeNames
        // 那段账），现在才补烘 —— 生成器只有一项，一口气抽干就是同步烘完一张。
        for (const _ of library.PrepareSteps([set.name])) { /* 烘一张 */ }
        pbrFailed.push(set.name);
        console.warn(`[Main] 外部 PBR「${set.name}」没读到，退回程序化：`
          + String(error).slice(0, 160));
      }
      pbrDone += 1;
      setStep(`加载 PBR 材质 ${pbrDone}/${PBR_SETS.length}`,
        0.242 + 0.003 * (pbrDone / PBR_SETS.length));
    }
  };
  await Promise.all(Array.from({ length: PBR_LANES }, RunPbrLane));
  if (pbrFailed.length) {
    console.warn(`[Main] 共 ${pbrFailed.length}/${PBR_SETS.length} 套外部 PBR 走了程序化退路：`
      + pbrFailed.join("、"));
  }

  // 物理引擎的 wasm（2.8 MB，本地 vendor 里）。**必须排在建关之前** ——
  // BuildField 末尾就要拿它建碰撞体了。
  setStep("装物理引擎……", 0.245);
  await InitPhysics();

  const phase = PHASE_TABLE[state.phaseIndex];
  const preset = sky.Apply(phase.sky);
  sky.BakeEnvironment(scene);
  lights.ApplyPreset(preset, sky.sunDirection);
  if (gi) gi.ApplyPreset(preset, graphics.giStrength);
  // 雾全部收到合成 pass 里做（高度雾 + 距离雾 + 按深度去饱和）。
  // 再留一份 THREE.Fog 就是双重打雾，远景直接糊成一块平板。
  scene.fog = null;

  aircraft = new AircraftFlight(scene);
  aircraft.Load().catch((error) => console.warn("AircraftFlight: model load failed", error));

  await BuildField(PHASE_TABLE[state.phaseIndex], setStep, 0.24, 0.62, NextFrame);

  setStep("上刺刀……", 0.9);
  actorFactory = new ActorFactory(library, { quality: QUALITY });
  // 人物合批：全场人物的分件按「几何 × 材质」收成 InstancedMesh，
  // 一帧 1408 个人物 draw call 收到几十个。逐像素等价，账见 Script_ActorBatch.mjs。
  actorBatch = new ActorBatcher(scene);
  actorFactory.SetBatcher(actorBatch);
  /**
   * 脚部 IK 的探地口。**走取值器读 physics/battlefield，不能捕获当前那一份** ——
   * 两者每换一关都会被换成新的实例，捕获旧的等于让所有人踩着上一关的地。
   *
   * 物理世界还没建好时退回解析地表：那是开机的头几帧与过场里摆的临时人物，
   * 让他们踩在地皮上比让 IK 抛异常好。
   */
  actorFactory.groundProbe = (x, z, fromY) => {
    if (physics) return physics.GroundProbe(x, z, fromY, 0.6, 2.4);
    const y = battlefield ? battlefield.GroundHeight(x, z) : 0;
    return { y, normal: FLAT_NORMAL, tag: "terrain" };
  };
  // 人和枪的模型必须在造第一个 Actor 之前读完：KindGeometry / WeaponGeometry 是同步的
  // （它们在 Actor 构造函数里被调），拿不到文档就一律退回程序化方块几何。
  // 十四个 .tzm.json 加起来不到 300 KB，这一步的成本远小于"跑起来才发现没换模"。
  const meshes = await actorFactory.PreloadMeshes();
  if (meshes.missing.length) {
    // warn 不是 error：BootTest 把 console.error 当事故，而少一个模型只是降级不是崩
    console.warn(`[Main] 这些模型没读到，对应的人/枪退回方块几何：${meshes.missing.join(", ")}`);
  }
  setStep(`上刺刀…… 模型 ${meshes.loaded}/${meshes.requested}`, 0.92);
  const grenadeAsset = await LoadGrenadeAsset();
  vfx = new VfxSystem(scene, library, {
    quality: QUALITY, maxParticles: SCALE.vfxBudget, lights,
  });
  // 浮尘：体积光要有介质才散射得出来，不然 godStrength 给再大也只是天上一片糊。
  // AmbientDust 会重建整个 DustField（丢旧的、建新的），所以只在这里调一次，
  // 换关时由 EnterLevel 重新按新切片调一次，别每帧调。
  // 浮尘只罩玩家附近那一片：切片最大的一关跨两公里，按整片铺会把粒子摊薄到看不见
  vfx.AmbientDust(DustBox(PHASE_TABLE[state.phaseIndex]), 0.075);
  // depthBudget 1.22（默认 0.90）：腰射姿态把枪往前推到 pz = -0.32 之后，
  // 最深点（枪口 + 刺刀）变成 |0.32 + 0.8175| + 0.04 + 0.02 ≈ 1.20 m，
  // 沿用 0.90 会被 _RecomputeCompensation 压到 0.55 的下限，枪整体缩到眼前 ——
  // 画面不变（等比缩放绕相机原点是恒等的），但枪口离眼睛只剩半米，贴墙时会穿模
  // meshDocs 直接借 ActorFactory 已经解码好的那份：同一个 .tzm.json 解两遍
  // 既多花开机时间又多占一份内存，而两边要的就是同一棵节点树。
  viewmodel = new Viewmodel(library, {
    fov: 52,
    depthBudget: 1.22,
    meshDocs: actorFactory.meshDocs,
    riggedAssets: RIGGED_ARMS ? actorFactory.riggedAssets : null,
    grenadeAsset,
  });
  camera.add(viewmodel.root);
  scene.add(camera);
  // 视图模型按“前景”口径进深度法线预通道（真法线 + 常数近景深度标签）。
  // Equip() 末尾会自己调一次，这里再调一次纯属兜底（构造期的抛壳池与弹夹道具）。
  if (viewmodel.markForegroundPrepass) viewmodel.markForegroundPrepass();
  firstPersonSelfShadow = new FirstPersonSelfShadow(renderer, scene, camera, viewmodel.root, {
    size: QUALITY === "low" ? 512 : 1024,
  });
  firstPersonSelfShadow.SetEnabled(graphics.shadows && graphics.firstPersonSelfShadow);

  player = new PlayerController(camera, {
    colliders: battlefield.colliders,
    NearbyColliders: (x, z, r) => battlefield.NearbyColliders(x, z, r),
    GroundHeight: (x, z) => battlefield.GroundHeight(x, z),
    // 下水判定。运河不做游泳系统，做一条软墙 —— 规则在 Script_Player，
    // 地形在 Script_Battlefield，装配层只负责把这条查询接上
    WaterDepth: (x, z, y) => battlefield.WaterDepth(x, z, y),
    bounds: battlefield.bounds,
  }, { seed: 1938 });
  // 胶囊挂进物理世界。BuildField 已经把这一关的静态几何灌好了，
  // 这里补的是「玩家」这一具 —— 换关时由 EnterLevel 再挂一次新的。
  player.AttachPhysics(physics);

  // 导航网格：一张 2 m 一格的"走不走得过去"位图 + 按目标算的下坡场。
  // 没有它，AI 在这座四合院城里就是直奔一堵院墙（见 Script_Navigation 的账）。
  navGrid = MakeNavGrid(battlefield);
  const nav = navGrid;
  destruction = new DestructionSystem(scene, library, destructionUniforms, { vfx, audio });
  destruction.SetWorld(battlefield, physics, navGrid);
  ai = new AiDirector({
    battlefield, actorFactory, scene, vfx, audio, player, nav, physics, destruction,
    BlocksSight: (from, to) => p012Runtime?.BlocksSight(from, to) || false,
    // 票池 = 兵力池：**谁死了扣谁的**。
    // 以前只有玩家的命和玩家的战绩会动票池，而 Combat.Blast 的 onKill 不带 side，
    // 装配层写死扣日方 —— 日军炮弹炸死中国兵扣的是日军的票。
    // 现在全部走 Soldier.Kill() 发出来的这一条事件，行内扣减一律删掉（会双扣）。
    onSoldierDeath: (side) => {
      if (side === "nra") state.nraPool = Math.max(0, state.nraPool - 1);
      else state.ijaPool = Math.max(0, state.ijaPool - 1);
    },
  }, { maxAlive: SCALE.maxAlive, seed: 19380317, insideWalls: levelBounds });

  // 白刃规则只拿窄接口；伤害、血雾、声音与朝向仍走装配层现有对象。
  meleeQte = new MeleeQteDirector({
    Player: () => player,
    Soldiers: () => ai?.soldiers || [],
    Time: () => ai?.time || 0,
    CanBlock: () => {
      const weapon = WEAPONS[currentWeapon];
      return !!(weapon && (weapon.kind === "melee" || (weapon.bayonet && state.bayonetFixed)));
    },
    CanExecute: () => {
      const weapon = WEAPONS[currentWeapon];
      return !!(weapon && (weapon.kind === "melee" || (weapon.bayonet && state.bayonetFixed)));
    },
    DamagePlayer: (amount, attacker, kind) => {
      if (!player?.Alive) return false;
      const dx = player.position.x - attacker.position.x;
      const dz = player.position.z - attacker.position.z;
      const len = Math.hypot(dx, dz) || 1;
      return player.TakeHit(amount, "torso", new THREE.Vector3(dx / len, 0, dz / len), {
        from: attacker.position.clone(), melee: true, qte: kind,
      });
    },
    KillSoldier: (soldier) => {
      if (!soldier?.alive) return false;
      const dx = soldier.position.x - player.position.x;
      const dz = soldier.position.z - player.position.z;
      const len = Math.hypot(dx, dz) || 1;
      const direction = new THREE.Vector3(dx / len, 0, dz / len);
      const died = soldier.TakeHit(999, "torso", direction);
      vfx?.Blood(new THREE.Vector3(soldier.position.x, soldier.position.y + 1.05,
        soldier.position.z), direction, 1);
      return died;
    },
    Play: (event, attacker) => {
      const sound = event === "bayonetRush" || event === "executionStart" ? "dadaoSwing"
        : event === "blockSuccess" ? "bayonetHit"
        : event === "executionSuccess" ? "dadaoHit"
        : event === "blockFail" || event === "executionFail" ? "bayonetHit" : null;
      if (sound) audio.Play(sound, {
        position: attacker?.position?.clone?.(), volume: event.includes("Success") ? 0.92 : 0.72,
      });
    },
    Focus: (attacker, realDt) => {
      if (!attacker || !player?.Alive) return;
      const dx = attacker.position.x - player.position.x;
      const dz = attacker.position.z - player.position.z;
      const target = Math.atan2(-dx, -dz);
      let delta = target - player.yaw;
      if (delta > Math.PI) delta -= Math.PI * 2;
      else if (delta < -Math.PI) delta += Math.PI * 2;
      player.yaw += Clamp(delta, -realDt * 5.5, realDt * 5.5);
      player.aimYaw *= Math.max(0, 1 - realDt * 12);
      player.aimPitch *= Math.max(0, 1 - realDt * 12);
    },
  }, { assist: params.get("qteAssist") || "tap" });
  ai.ctx.meleeQte = meleeQte;

  // 叙事层：把 Data_TengxianScript 那本考据过的剧本按关派发。
  // 线性关卡不需要翻译层，剧本的 at 语义就是运行时语义（见 Script_Story 的头注）。
  story = new StoryDirector({ hud, audio });

  // 具名同伴。**必须建在 story.AttachVoice 之前** —— locate 参数就是它。
  // 造人这一件事全走 AiDirector：同伴就是普通的 nra 兵，只是带着名字与固定站位，
  // 所以射击、掩体、倒地、准心识别一条链路都不用改（也不许改）。
  companion = new CompanionDirector({
    Time: () => state.elapsed,
    PlayerPos: () => (player ? { x: player.position.x, y: player.position.y, z: player.position.z } : null),
    PlayerYaw: () => (player ? player.yaw : 0),
    Spawn: ({ castId, label, x, z, weapon, squadId }) => {
      if (!ai) return null;
      // identity 是**具名**的：准心识别与阵亡播报读的都是它，不给的话
      // 「罗班长」在场上会显示成一个随机姓名，那就等于没有这个人。
      const seed = HashString(`companion:${castId}`);
      const identity = { ...MakeSoldierIdentity(seed), name: label || castId };
      const soldier = ai.Spawn("nra", x, z, {
        identity, weapon: weapon || identity.weapon, squadId,
      });
      if (soldier) soldier.castId = castId;
      return soldier;
    },
    Despawn: (soldier) => {
      if (!soldier || !ai) return;
      // 撤走 ≠ 阵亡：不能走 Kill（那会扣阵亡计数、留一具尸体、还可能触发
      // 「友军倒下」那条剧本信号）。AiDirector.Remove 连刚体、尸体、演员一起收。
      ai.Remove(soldier);
    },
    PositionOf: (soldier) => (soldier && soldier.position
      ? { x: soldier.position.x, y: soldier.position.y, z: soldier.position.z } : null),
    // 「他现在归别人管」：玩家从轮盘下过命令（charge / flank / covert，
    // AiDirector.IssueOrder 会把 order 改掉并给一个有效期），或者他正占着一个
    // 固定战位（重机枪）。这三种情况下跟随一律让开 ——
    // 不让的话「上刺刀冲锋」按下去，班里的人还是在玩家脚边打转，命令白下。
    Busy: (soldier) => !!soldier && (soldier.order === "charge" || soldier.order === "flank"
      || soldier.order === "covert" || !!soldier.emplacementId || !!soldier.p012Guided || !!soldier.scriptDefensive),
    Alive: (soldier) => !!(soldier && soldier.alive),
    Place: (soldier, x, z) => {
      if (!soldier || !battlefield) return;
      const y = battlefield.GroundHeight(x, z);
      soldier.position.set(x, y, z);
      soldier.body?.Teleport(x, y, z);
      soldier.goal.set(x, 0, z);
    },
    SetGoal: (soldier, x, z) => {
      if (!soldier) return;
      soldier.goal.set(x, 0, z);
      soldier.holdZone = null;
      // manualGoalUntil 挡住 AiDirector 自己的「重设目标」（Think 里那条 autoAdvance），
      // 否则跟随目标写下去下一拍就被它改回战线方向。**要用 ai 自己的钟** ——
      // state.elapsed 在过场/编辑器里照走而 ai.time 不走，拿前者会越拉越偏。
      soldier.manualGoalUntil = ai.time + 3.0;
    },
    SetHold: (soldier, zone) => {
      if (!soldier) return;
      soldier.holdZone = zone || null;
      soldier.order = zone ? "hold" : "advance";
      if (zone) soldier.goal.set(zone.x, 0, zone.z);
    },
    // 「某人倒下」走**现有倒地**：尸体刚体、掉落物、阵亡计数、剧本的 allyDown
    // 信号一条都不绕过去 —— 剧本让他倒下与他被打倒在引擎里应该是同一件事。
    Fell: (soldier) => { if (soldier && soldier.alive) soldier.Kill(null); },
  });

  // 脚本检查点。采的是玩家这一帧的位置/姿态/血/弹，倒带时原样写回去。
  checkpoint = new CheckpointRecorder({
    Time: () => state.elapsed,
    Sample: () => (player && player.Alive ? {
      x: player.position.x, y: player.position.y, z: player.position.z,
      yaw: player.yaw, pitch: player.pitch, stance: player.stance,
      health: player.health, bleeding: player.bleeding, bandages: player.bandages,
      ammo: state.ammo, clips: state.clips,
      grenades: state.grenades, bundles: state.bundles,
      p012: p012Flow?.Snapshot() || null,
      p012Carry: p012Flow ? carry?.KindId : null,
      p012Story: p012Flow ? { index: story.index, pushed: [...story.pushed], cued: [...story.cued], fired: [...story.fired],
        levelTime: story.levelTime, sinceLast: story.sinceLast, beatWait: story.beatWait, immediate: story.P012Snapshot?.() } : null,
    } : null),
    Apply: (sample) => {
      if (!player || !sample) return false;
      // Spawn 会顺手把血、伤口、出生保护一并复位 —— 这正是「重来」要的：
      // 挨的那一下连同流血一起收回去，而**不动兵员池、不弹死亡卡、不换人**。
      player.Spawn(sample.x, sample.z, sample.yaw);
      player.pitch = sample.pitch ?? 0;
      player.stance = sample.stance || "stand";
      if (Number.isFinite(sample.health)) player.health = sample.health;
      if (Number.isFinite(sample.bandages)) player.bandages = sample.bandages;
      if (Number.isFinite(sample.ammo)) state.ammo = sample.ammo;
      if (Number.isFinite(sample.clips)) state.clips = sample.clips;
      if (Number.isFinite(sample.grenades)) state.grenades = sample.grenades;
      if (Number.isFinite(sample.bundles)) state.bundles = sample.bundles;
      // 重来的那一下手上不该还抬着担架（担架已经翻了），也不该还架着机枪。
      carry?.Reset("checkpoint");
      if (sample.p012) p012Flow?.Restore(sample.p012);
      if (sample.p012Carry) carry?.Begin(sample.p012Carry, { label: "担架（伤员）" });
      if (sample.p012Story) {
        story.index = sample.p012Story.index; story.pushed = new Set(sample.p012Story.pushed);
        story.cued = new Set(sample.p012Story.cued);
        // P012 world/setpieces stay alive on rewind: keep fired monotonic for firedCursor.
        story.levelTime = sample.p012Story.levelTime; story.sinceLast = sample.p012Story.sinceLast; story.beatWait = sample.p012Story.beatWait;
        story.P012Restore?.(sample.p012Story.immediate);
        battlefield.RestoreScenario?.({ signalled: (name) => story.Signalled(name) });
      }
      emplacement?.EndClear?.();
      state.playerAliveLast = true;
      return true;
    },
  });

  // 剧情语音接线：Story 报时机，Audio 出声（单槽，新句顶旧句），
  // **Companion 报「说话的人站在哪儿」**（locate）。定位不到就退化成非空间化播放 ——
  // 军官的画外喊话、旁白、以及这一章没点名的人本来就没有身体。
  story.AttachVoice({
    play: ({ key, position }) => audio.PlayStoryVoice(key, { position }),
    locate: (who) => (companion ? companion.Locate(who) : null),
    stop: () => audio.StopStoryVoice(),
  });
  // 关中过场：Story 报时机，装配层夺控制权、播、还回来（与关首过场同一条路）。
  story.AttachCutscene((id) => PlayMidCutscene(id));
  /**
   * 换天光。套预设 = 天空着色器 + Global SH 强度 + 平行光三件一起换，
   * 少一件就是「天是夜的、地是白天的」。过场（cut.sky）与采样点出图
   *（夜战关里的关厢建筑要按白天记录）走的是同一条，不许各写一份。
   */
  function ApplySkyPreset(name) {
    if (!SKY_PRESETS[name]) return false;
    cutsceneSky = name;
    const preset = sky.Apply(name);
    sky.BakeEnvironment(scene);
    lights.ApplyPreset(preset, sky.sunDirection);
    return true;
  }
  /** 还原成本关自己的天光。 */
  function RestoreLevelSky() {
    if (!cutsceneSky) return;
    cutsceneSky = null;
    const preset = sky.Apply(PHASE_TABLE[state.phaseIndex].sky);
    sky.BakeEnvironment(scene);
    lights.ApplyPreset(preset, sky.sunDirection);
  }

  // 过场导演。onCapture/onRelease 是夺走与交还玩家控制权的钩子：
  // 过场期间 Frame() 只跑 director.Update 与渲染，玩法一律停摆
  //（不停的话玩家会在看电影的时候被打死，而且指针锁还在，鼠标会转动相机）。
  cutscene = new CutsceneDirector({
    camera, scene, hud, audio, actorFactory, library, root: hudRoot,
    onCapture: (cut) => {
      state.cutscene = cut.id;
      router?.SetSuppressed(true);
      // 过场拥有自己的 Look；释放玩家锁避免浏览器吞掉 Esc，结束时再请求。
      ReleasePointerLock();
      input.fire = false; input.ads = false; input.forward = 0; input.strafe = 0;
      input.lookX = 0; input.lookY = 0; input.sprint = false; input.breathHold = false;
      // 按住 F 的那一下断在这儿。过场期间输入被 SetSuppressed 掐掉，松手边沿永远到不了 ——
      // 不主动断的话，进度环会一直亮着「按住中」挂在过场画面上。
      interact?.CancelHold("cutscene");
      // 机枪的扳机同理：过场期间输入被掐掉，松手边沿到不了，不主动断的话
      // 过场一结束枪会自己接着响一梭。
      emplacement?.SetFire(false);
      emplacement?.EndClear();
      hud?.SetInteractProgress(null);
      // 玩家手里的枪挂在相机下：不藏的话每一镜右下角都趴着一支带刺刀的步枪，
      // 五个分镜 agent 全靠把 look 点推到 45 m 外抬高近平面来切它 —— 这里一行就够。
      if (viewmodel && viewmodel.root) viewmodel.root.visible = false;
    },
    onRelease: () => {
      state.cutscene = null;
      router?.SetSuppressed(false);
      // 过场里抬着东西的话（第一关接替担架那一段就是），枪该继续收着。
      if (viewmodel && viewmodel.root) viewmodel.root.visible = !carry?.Blocking;
      if (state.running && !state.menu) RequestPointerLock();
    },
    // 过场自带的天空：出川是阴天、长官部是夜里 —— 不能沿用上一关的拂晓。
    // 套预设 = 天空着色器 + Global SH 强度 + 平行光三件一起换，少一件就是
    // 「天是夜的、地是白天的」。RenderScene 的后期参数按 cutsceneSky 走。
    applySky: (name) => ApplySkyPreset(name),
    restoreSky: () => RestoreLevelSky(),
  });
  combat = new CombatSystem({
    battlefield, ai, vfx, audio, lights, player, library, scene, story, physics, destruction, grenadeAsset,
    // 玩家自己的手榴弹/集束/呼来的迫击炮炸中人时的回执（见 ConfirmHit）。
    // 一次爆炸只回一条，Combat.Blast 那边已经并好了。
    onPlayerHit: (died) => ConfirmHit(died),
  });

  // F 通用交互。槽位与弹仓的账在装配层手里（state.slots / state.mags），
  // 所以规则在 Script_Interact，改状态的那三下通过 hooks 交回这里。
  interact = new InteractSystem({ ai, audio, hud }, {
    HasWeapon: (weaponId) => {
      const slot = WEAPONS[weaponId]?.kind === "melee" ? "melee" : "primary";
      return !!state.slots[slot];
    },
    SpareClips: () => state.clips,
    TakeWeapon: (weaponId, clips, soldier, weaponVariant) => PickUpWeapon(weaponId, clips, weaponVariant),
    GiveClip: () => {
      if (state.clips <= 1) return false;
      state.clips -= 1;
      return true;
    },
  });

  // 负重（担架 / 药箱 / 弹药箱 / 门板 / 铁锅 / 伤员）。规则与数值全在 Script_Carry；
  // 装配层只给它四个窄回调，并在 Frame 里按顺序推它（必须排在 player.Update 之前）。
  carry = new CarrySystem({
    Play: (name, opts) => audio.Play(name, opts),
    Hint: (text, seconds) => hud.Hint(text, seconds),
    Say: (who, text, seconds) => hud.Say(who, text, seconds),
    Time: () => state.elapsed,
  });

  // 架设机枪（第五关那挺）。射速、过热、卡壳、弹药全在 Script_Emplacement；
  // 装配层只给它三样：声音/提示、**把一发真的打出去**、以及把指向交回给世界模型。
  emplacement = new EmplacementSystem({
    Play: (name, opts) => audio.Play(name, opts && opts.position
      ? { ...opts, position: new THREE.Vector3(opts.position.x, opts.position.y, opts.position.z) }
      : opts),
    Hint: (text, seconds) => hud.Hint(text, seconds),
    Say: (who, text, seconds) => hud.Say(who, text, seconds),
    Time: () => state.elapsed,
    Fire: (shot) => FireEmplacedShot(shot),
    Aim: (view) => AimEmplacementView(view),
    // 「视角接到枪上」：把人挪到射手位并换成射手姿态。**只在玩家自己按下那一下
    // 之后发生**，不是脚本把人拽过去 —— 挪的距离本来就只有一步（交互点的够得着
    // 半径不到两米）。姿态记下来，离位时还回去。
    Seat: ({ seat, stance }) => {
      if (!player?.Alive) return;
      seatStanceBefore = player.stance;
      const y = battlefield ? battlefield.GroundHeight(seat.x, seat.z) : player.position.y;
      player.position.set(seat.x, y, seat.z);
      player.body?.Teleport(seat.x, y, seat.z);
      if (stance) player.stance = stance;
    },
  });

  // 日机扫射航线（第一关阶段五 / 六 / 八）。规则在 Script_AircraftStrafe，
  // three 那一侧的翻译（曳光、弹着、音效定位、玩家挨这一下）在 Script_Aircraft
  // 的 MakeAircraftStrafeHost —— 装配层只把「谁是谁」告诉它。
  // 取的全是取值器：battlefield 每关重建、story 每关换一份，拷值出去会指到上一关。
  strafe = new AircraftStrafeDirector(MakeAircraftStrafeHost({
    vfx, audio, hud,
    Time: () => state.elapsed,
    player: () => player,
    battlefield: () => battlefield,
    Story: () => story,
    Soldiers: () => ai?.soldiers ?? null,
  }));

  // 照明弹（第四关阶段五 / 七）。时间线与暴露倍率在 Script_Flare（纯规则），
  // 画面那一半由它自己的 MakeFlareHost 翻给 LightRig 的火光池与 VfxSystem 的烟源。
  // ai / story / battlefield 全取取值器：它们每关重建，拷值出去会指到上一关。
  flare = new FlareDirector(MakeFlareHost({
    lights, vfx, audio, hud,
    Time: () => state.elapsed,
    Ai: () => ai,
    Story: () => story,
    Battlefield: () => battlefield,
    Player: () => player,
  }));

  // 发报（终章阶段四）。**不夺控制权**：玩家爱什么时候按什么时候按，
  // 走开进度也留着 —— 所以这里除了每帧推它一下，什么都不封。
  telegraph = new TelegraphSystem(MakeTelegraphHost({
    audio, hud,
    Time: () => state.elapsed,
    Story: () => story,
    Player: () => player,
  }));

  // 章节摆点（集成批 INT2）。**七个玩法系统与七章内容之间唯一的接缝。**
  // 系统一律走取值器交给它 —— 它们每关重建，拷值出去会指到上一关。
  // 每一条回调都是「引擎动词」，一条章节内容都不许写进这里：
  // 「第五关的机枪摆在哪儿」在 Script_MissionSetpieces.SETPIECES.CH5_Chengqiang 里。
  setpieces = new MissionSetpieceDirector({
    Time: () => state.elapsed,
    LevelTime: () => state.phaseTime,
    PlayerPos: () => (player ? { x: player.position.x, y: player.position.y, z: player.position.z } : null),
    // 玩家此刻在哪个路标圈里。与 story 的 ctx.zone 同一条判据，不另写一份。
    PlayerZone: () => {
      if (!battlefield || !player) return null;
      const zone = battlefield.objectives.find((o) =>
        Math.hypot(player.position.x - o.x, player.position.z - o.z) < o.radius);
      return zone ? zone.id : null;
    },
    Ground: (x, z) => (battlefield ? battlefield.GroundHeight(x, z) : 0),

    Story: () => story,
    Carry: () => carry,
    Interact: () => interact,
    Emplacement: () => emplacement,
    Strafe: () => strafe,
    Flare: () => flare,
    Telegraph: () => telegraph,
    Companion: () => companion,
    Checkpoint: () => checkpoint,

    // --- 演员：与具名同伴同一条造人路径（AiDirector.Spawn），不另造一套 -----
    SpawnActor: ({ label, x, z, weapon, squadId, role, civilian, variant }) => {
      if (!ai) return null;
      const seed = HashString(`setpiece:${label}:${Math.round(x)}:${Math.round(z)}`);
      const identity = { ...MakeSoldierIdentity(seed), name: label || "后送队" };
      const noncombatant = !!PHASE_TABLE[state.phaseIndex]?.whitebox?.p012 && weapon === null;
      const actor = ai.Spawn("nra", x, z, {
        identity, weapon: weapon || identity.weapon, squadId: squadId || "Setpiece",
        unarmed: noncombatant, actorKind: noncombatant && civilian ? "civilian" : undefined,
        scriptedNoncombatant: noncombatant,
        actorVariant: variant, escortRole: role,
      });
      if (actor && PHASE_TABLE[state.phaseIndex]?.whitebox?.p012 && (role === "bearer" || role === "guard")) actor.scriptEssential = true;
      return actor;
    },
    Despawn: (soldier) => { if (soldier && ai) ai.Remove(soldier); },
    PositionOf: (soldier) => (soldier && soldier.position
      ? { x: soldier.position.x, y: soldier.position.y, z: soldier.position.z } : null),
    Alive: (soldier) => !!(soldier && soldier.alive),
    SetGoal: (soldier, x, z) => {
      if (!soldier || !ai) return;
      soldier.goal.set(x, 0, z);
      soldier.holdZone = null;
      // 与 CompanionDirector 同一笔账：挡住 AiDirector 自己的「重设目标」，
      // **并且要用 ai 自己的钟**（state.elapsed 在过场里照走而 ai.time 不走）。
      soldier.manualGoalUntil = ai.time + 3.0;
    },

    // --- 演出 ---------------------------------------------------------------
    Hint: (text, seconds) => hud.Hint(text, seconds),
    Say: (who, text, seconds) => hud.Say(who, text, seconds),
    PlaySfx: (name, opts = {}) => audio.Play(name, opts.position
      ? { ...opts, position: new THREE.Vector3(opts.position.x, opts.position.y ?? 0, opts.position.z) }
      : opts),
    // 关中过场：与 story 的 `type:"cutscene"` beat 走同一个实现。
    PlayCutscene: (id) => PlayMidCutscene(id),

    // 这一片还有几个活着的日军。「缺口清空了没有」这类判据只认它，不认时钟。
    EnemiesNear: (x, z, r) => {
      if (!ai) return 0;
      let n = 0;
      for (const s of ai.soldiers) {
        if (!s.alive || s.side === "nra") continue;
        if (Math.hypot(s.position.x - x, s.position.z - z) <= r) n += 1;
      }
      return n;
    },

    // 一片友军同时投弹（二关「甩！」那一拍的「手榴弹雨」）。
    // 走的是玩家那条投掷链路（Combat.Throw）—— 弹道、刚体、伤害与玩家自己甩的
    // 一模一样，不另写一套 AI 手雷。起手同帧、落点在 spreadS 内错开。
    VolleyThrow: ({ x, z, radius = 40, spreadS = 0.8, max = 14 } = {}) => {
      if (!combat || !ai || !player) return 0;
      let thrown = 0;
      for (const s of ai.soldiers) {
        if (!s.alive || s.side !== "nra") continue;
        if (Math.hypot(s.position.x - x, s.position.z - z) > radius) continue;
        if (thrown >= max) break;
        const dir = new THREE.Vector3(x - s.position.x, 0, z - s.position.z);
        if (dir.lengthSq() < 1e-4) continue;
        dir.normalize();
        const from = new THREE.Vector3(s.position.x, s.position.y + 1.2, s.position.z);
        // 起手同帧、落点错开：全都同时落地是一声巨响，不是一场雨。
        const jitter = (thrown % 5) / 5 * spreadS;
        combat.Throw("Grenade", 0.62 + jitter * 0.2, from, dir, jitter);
        thrown += 1;
      }
      return thrown;
    },

    // 固定事件那 4—6 秒：玩家不许死。到时刻为止，被打倒走检查点倒带。
    SetPlayerInvulnerable: (on, seconds = 6) => {
      scriptInvulnUntil = on ? state.elapsed + Math.max(0, seconds) : 0;
    },

    // 跨关记一笔（拆过几块门板、罗班长倒下了）。存进 state 供出图与取证读；
    // **不进存档** —— 这些是同一局之内的场景状态，不是进度。
    MarkPersistent: (key, value) => { state.setpieceFacts[key] = value; },

    // --- 关内道具 -----------------------------------------------------------
    // 布设那一层（Script_ExternalProps / Data_Dressing_*）是**建场时**按世界坐标
    // 铺的，同一只米袋在三关里在同一个位置 —— 它表达不了「同一个院子在三章里
    // 越来越破」。所以摆点层另有一条**运行时**的轻量摆件口：几块带贴图的板子、
    // 几只箱子、一副盖白布的担架。它们不进碰撞、不进流送、不进烘焙，
    // 只是「这一章这个院子里多出来的那几件东西」。
    Prop: (spec) => MakeSetpieceProp(spec),
    SetPropState: (id, next) => SetSetpiecePropState(id, next),
    // 抬着走的担架每帧跟着两名担架员的手（EscortColumn._UpdateLitters）。
    MoveProp: (id, at) => MoveSetpieceProp(id, at),

    // --- 火墙（三关传单入火）------------------------------------------------
    // 「油料带成为一段 8—10 m 的持续火墙（≥90 s），追兵改走另一侧院门。
    //   火墙对玩家同样有伤害 —— 它是封路，不是单向道具。」
    Firewall: ({ id, from, to, seconds = 90, damagePlayer = true } = {}) => {
      if (!from) return null;
      const a = { x: from.x, z: from.z };
      const b = to ? { x: to.x, z: to.z } : a;
      const wall = {
        id: id || `fw${state.firewalls.length}`,
        ax: a.x, az: a.z, bx: b.x, bz: b.z,
        until: state.elapsed + Math.max(1, seconds),
        damagePlayer: !!damagePlayer, lastHurt: 0, smoke: [],
      };
      // 沿线撒几处烟与火光。走的是 VfxSystem 现成的烟源池 —— 不新建任何管线，
      // 开机红线（drawCalls / triangles）不受影响。
      const steps = Math.max(2, Math.round(Math.hypot(b.x - a.x, b.z - a.z) / 2.2));
      for (let i = 0; i <= steps; i += 1) {
        const t = steps ? i / steps : 0;
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        const y = battlefield ? battlefield.GroundHeight(x, z) : 0;
        const handle = vfx?.SmokeSource(new THREE.Vector3(x, y + 0.2, z), { rate: 5, scale: 1.1, fire: true });
        if (handle) wall.smoke.push(handle);
      }
      // 火的声音归 INT3（`fireNear` 现在只是环境层的一条 bed，没有 one-shot 配方；
      // audio.Play 拿不认识的名字会静默返回 null，硬点一个名字只会让人以为接上了）。
      state.firewalls.push(wall);
      return wall.id;
    },

    // 一发炮弹落在指定点附近（终章师部挨炮那一拍）。走的是既有的 CallIncoming。
    Shell: ({ at, count = 1 } = {}) => {
      if (!at || !combat) return 0;
      for (let i = 0; i < count; i += 1) {
        combat.CallIncoming("artillery", new THREE.Vector3(at.x + i * 3.5, 0, at.z - i * 2.5));
      }
      return count;
    },

    // 「门开着」是一条**工程事实**，不是一句台词（§0 验收结果 5）。城门洞本身
    // 是建场时的几何（Script_TengxianCity 的 gate），这里只记一笔并把它交给取证 ——
    // 真有一天门是关着的，这条记录是排障的第一站。
    OpenGate: (id) => { state.setpieceFacts[`gate:${id}`] = "open"; return true; },

    // 身后那挺机枪停下（五关阶段⑧）。表现在两件事上：掩护火力的音床停、
    // 那一段的友军不再补位。**只做前一半**：后一半归撒兵，改它会牵动整关的压力曲线。
    SilenceCoverFire: (on) => { state.setpieceFacts.coverFireSilent = !!on; return true; },

    // AI 抬人（四关掩护罗班长撤离）。抬的人被打倒时由摆点层换人 ——
    // 「担架落地卡住流程」是这一段唯一不许出现的失败态。
    CarryLeader: ({ who, bearers = [], to } = {}) => {
      if (!companion || !ai) return false;
      const target = PHASE_TABLE[state.phaseIndex]?.zones?.find((z) => z.id === to);
      let moved = 0;
      for (const castId of bearers) {
        const handle = companion.Handle(castId);
        if (!handle || !handle.alive) continue;
        handle.goal.set(target ? target.x : player.position.x, 0, target ? target.z : player.position.z);
        handle.manualGoalUntil = ai.time + 90;
        moved += 1;
      }
      const carriedBy = companion.Handle(who);
      if (carriedBy && target) {
        carriedBy.goal.set(target.x, 0, target.z);
        carriedBy.manualGoalUntil = ai.time + 90;
      }
      state.setpieceFacts.carryLeader = `${who}:${moved}`;
      return moved > 0;
    },

    // 视角接替（五关⑫）。**每一段都是玩家控制**：换出生点 + 换身份 + 一段短活。
    // 段与段之间不切黑（策划案原文），所以这里只搬人、补血、报一行字幕 ——
    // 没有淡出、没有过场、没有 Respawn（Respawn 会扣兵员池、弹死亡卡）。
    SwitchPov: ({ id, label, at, task, yaw } = {}) => {
      if (!player || !at) return false;
      player.Spawn(at.x, at.z, typeof yaw === "number" ? yaw : player.yaw);
      state.ammo = Math.max(state.ammo, 5);
      state.setpieceFacts.pov = id || label || "?";
      hud.Say(null, `视角接替：${label || id}`, 3.2, "system");
      if (task) { state.storyObjective = task; hud.SetObjective(task, state.nraPool, null); }
      return true;
    },

    // 击倒之后的地面视角（终章小秦、五关顺子）。相机落到 0.30—0.35 m 眼高、
    // 保留转头 —— 走的是既有的**卧姿**，不新造一套相机状态。
    GroundPov: ({ seconds = 5, blackOut = false } = {}) => {
      if (!player) return false;
      player.stance = "prone";
      state.setpieceFacts.groundPov = +state.elapsed.toFixed(1);
      if (blackOut) setTimeout(() => { state.pendingRespawn = false; }, seconds * 1000);
      return true;
    },

    // 白刃 QTE 的正片开关。训练场那套判定与正片是同一套（Script_MeleeQte），
    // 这里只把「这一段开始了」记下来给取证与 HUD 首提示用。
    SetMeleeGate: (on) => { state.setpieceFacts.meleeGate = !!on; return true; },

    // 正在冒烟等着殉爆的弹药箱。**没有可交互的弹药箱实体**（二关 crateHauling
    // 的箱子现在是交互点 + 搬运态，不是场上的实体），所以这一条恒返回 null：
    // 殉爆倒计时那一档还欠一件真实体，登记在下面 Debug.Setpieces 的说明里。
    CookingCrate: () => null,

    // 从剧情背包里扣一件（三关撕短褂）。扣不掉就是这一下不算数。
    TakeItem: (id) => {
      if (!state.setpieceItems[id]) return false;
      state.setpieceItems[id] -= 1;
      return true;
    },

    // 交火声床整层淡出/淡入（三关处决声音先行段）。音频账归 INT3，这里只记事实；
    // 接上之后把它翻给 Script_Audio 的环境层即可，摆点表一个字都不用改。
    SetCombatBed: (on) => { state.setpieceFacts.combatBed = !!on; return true; },

    // 一次立刻发生的爆炸，与日军炮弹同一条 Combat.Blast（二关殉爆、四关墙塌那一下）。
    Detonate: ({ at, radius, damage, kind } = {}) => {
      if (!combat || !at) return false;
      combat.Blast(at, radius ?? 6, damage ?? 120, kind || "shell");
      return true;
    },

    // 体力**恢复的上限**（1 = 常态）。五关终局章节作用域，换关由摆点层自己还原。
    SetStaminaCeiling: (v) => {
      if (!player) return false;
      player.staminaCeiling = Math.max(0.2, Math.min(1, v));
      return true;
    },

    // 撒一个日军（五关终局两侧波次；四关固定事件也缺它才只能用声音演）。
    SpawnEnemy: ({ x, z, weapon, squadId } = {}) =>
      ai ? (ai.Spawn("ija", x, z, { weapon: weapon || undefined, squadId }) ?? null) : null,
  });

  // 准心指着谁。规则在 Script_Identify（纯几何，不 import three），
  // 这里只把"从眼位到那个人的胸口有没有被挡死"接回来 —— 与 HasLineOfSight 同一条判据。
  identify = new IdentifySystem({
    Clear: (eye, point) => {
      _idDir.set(point.x - eye.x, point.y - eye.y, point.z - eye.z);
      const dist = _idDir.length();
      if (dist < 1e-3) return true;
      _idDir.multiplyScalar(1 / dist);
      _idFrom.set(eye.x, eye.y, eye.z);
      // **TERRAIN_RAY 不能漏**：不带这个标志的射线只跟碰撞盒求交，
      // 解析地表（土岗、河堤、路基、田埂）一律穿过去 —— 与弹道那条是同一个坑
      // （见 MarchBullet 那行的账）。用户实拍到的「隔着一道土坎也报出日军」
      // 就是这么来的：墙挡得住，土坡挡不住。
      const hit = battlefield.Raycast(_idFrom, _idDir, dist, TERRAIN_RAY);
      // 留 0.6 m 余量：擦着人身边的墙角不算挡住（同 HasLineOfSight）。
      return !hit || hit.t >= dist - 0.6;
    },
  });

  await NextFrame();
  setStep("就绪", 1.0);
  await EnterLevel(state.phaseIndex, { initial: true, cutscenes: false });
  state.ready = true;
  bootStart.disabled = false;
  bootStart.textContent = SHOT ? "（出图模式）" : (PREVIEW ? "播放序章" : "进 城");


  // 各阶段的配置时长，给通关冒烟按出厂配置跑用
  state.phaseMinutes = PHASE_TABLE.map((p) => p.minutes);
  window.Taierzhuang = {
    // gi 是取值器：探针体默认不构造，运行时打开（ApplyGraphics）才补建，
    // 拷值出去的话冒烟与剖析脚本拿到的永远是 boot 时那个 null
    renderer, scene, camera, post, sky, lights, library, profiler,
    get gi() { return gi; }, get firstPersonSelfShadow() { return firstPersonSelfShadow; },
    player, ai, vfx, viewmodel, hud, audio, state, actorFactory, actorBatch, input,
    get meleeQte() { return meleeQte; },
    story, combat, destruction, interact, carry, emplacement, wheel, strafe, flare, telegraph,
    companion, checkpoint, setpieces,
    StepFrames, JumpToPhase: JumpToLevel, AdvanceLevel,
    // 关中过场的宿主 API（story.Signal→过场 的等价入口）。玩法系统批直接调它，
    // 或者走 story.Signal("<名字>") 让登记表去派发 —— 两条路同一个实现。
    PlayMidCutscene,
    // FrameProfileTest 的 GI 消融走设置面板同一条路（graphics.gi + ApplyGraphics）
    graphics, ApplyGraphics,
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
      // 按住/松开鼠标键（白刃蓄力等按住型输入要用；Fire 那条只覆盖单帧点击）
      Mouse: (button = 0, down = true) => {
        document.dispatchEvent(new MouseEvent(down ? "mousedown" : "mouseup", { button, bubbles: true }));
      },
      // 一次鼠标位移。**不走 mousemove 事件**：那条链路要查指针锁，而出图/测试
      // 模式下根本拿不到锁，查了就等于测试里转不了头。要测的是"位移进来之后
      // 视线怎么走"，指针锁归属另有冒烟覆盖。
      Look: (dx = 0, dy = 0) => { input.lookX += dx; input.lookY += dy; },
      Wheel: (delta) => {
        document.dispatchEvent(new WheelEvent("wheel", { deltaY: delta, bubbles: true }));
      },
      Slots: () => ({
        active: state.activeSlot, weapon: currentWeapon, loadout: state.loadoutId,
        slots: { ...state.slots }, variants: { ...state.weaponVariants },
        viewmodel: viewmodel.weaponId, viewmodelVariant: viewmodel.weaponVariant,
        fireMode: state.fireMode, bipod: player.bipod, ads: player.ads,
      }),
      LastShot: () => (state.lastShot ? { ...state.lastShot } : null),
      Difficulty: () => ({ ...DIFFICULTY }),
      // 数值表本体（不是快照）：伤害冒烟要把 COMBAT.player 改回旧口径跑一遍对照，
      // 「新数值到底把 TTK 拉长了多少」只能这么取证，算不出来。
      Tables: () => ({ COMBAT, DIFFICULTY }),
      // 受击反馈的运行时状态。红闪与来弹方位都是**事件**（自己衰减），
      // 不是血量的函数，所以必须从这里取证，不能从 health 反推。
      Hurt: () => ({
        health: player.health, bleeding: player.bleeding, flash: player.hitFlash,
        marks: player.hitMarks.map((m) => ({ x: m.x, z: m.z, life: m.life })),
        wounds: player.wounds.length, alive: player.alive,
      }),
      /**
       * 命中回执的取证口（见 ConfirmHit）。**打出去的**那一侧，
       * 与上面 Hurt() 的 marks（打进来的方位）是两件事，别串。
       * marks 是按时间顺序的 "hit"/"kill" 序列，cues 是真的排进 WebAudio 的那两条 ——
       * 只断言 marks 会漏掉"写实档关了记号、听觉回执也一起没了"这一类回归。
       */
      Hits: () => ({
        marks: hud.confirms.slice(),
        cues: { hit: audio.RequestedCount("hitConfirm"), kill: audio.RequestedCount("killConfirm") },
        markerOn: DIFFICULTY.hitMarker !== false,
        visual: hud.HitmarkState(),
      }),
      // --- 第 3 批的取证口 ---
      // 翻越：翻过几次、此刻在不在半空、脚下多高（上墙要靠这个高度取证）
      Vault: () => ({
        count: player.vaultCount, active: player.vault.active,
        kind: player.vault.kind, rise: player.vault.rise, mantles: player.mantleCount,
        y: player.position.y, x: player.position.x, z: player.position.z,
        aiVaults: ai.vaultCount,
      }),
      /** 通行高度阶梯（Data_Traversal）。测试按它取判据，别在断言里抄数。 */
      Traversal: () => ({ ...TRAVERSAL }),
      // 跳跃：起跳次数、滞空/落地边沿与视图模型动作位移。
      Jump: () => ({
        count: player.jump.count, grounded: player.grounded,
        y: player.position.y, velocityY: player.velocity.y,
        airTime: player.jump.airTime, landSerial: player.jump.landSerial,
        landImpact: player.jump.landImpact, runK: player.jump.runK,
        viewY: viewmodel.statePivot.position.y,
        viewPitch: viewmodel.statePivot.rotation.x,
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
      // 交互：够得着什么、捡过几次、分过几次弹、注册了哪些交互点
      Interact: () => {
        const c = interact.Query(player);
        return {
          kind: c ? c.kind : null, label: c ? c.label : null,
          gesture: c ? c.gesture : null,
          pickups: interact.pickups, handouts: interact.handouts,
          pickedUp: state.pickedUp, pickedUpVariant: state.pickedUpVariant ?? 0, weapon: currentWeapon,
          ...interact.State(),
        };
      },
      /**
       * 负重取证口。摆点是集成批的事，这里给的是**驱动 + 取证**：
       *   Debug.Carry.Begin("stretcher", { canDrop:false })  直接抬起来（跳过交互点）
       *   Debug.Carry.Force("dive")                          脚本强行松手（第一关扑入路沟）
       *   Debug.Carry.State()                                规则层 + HUD 两侧一起取
       * `speedScale` 读的是**玩家身上那个字段**，不是表里的数 ——
       * 「规则算出来了但没写进玩家」正是这一类接线最容易漏的一环。
       */
      Carry: {
        Begin: (kindId, opts) => carry.Begin(kindId, opts),
        Drop: (reason) => carry.Drop(reason),
        Throw: (reason) => carry.Throw(reason),
        Force: (reason) => carry.ForceRelease(reason),
        Reset: (reason) => carry.Reset(reason),
        Anchor: () => carry.PartnerAnchor(player),
        State: () => ({
          ...carry.State(),
          playerSpeedScale: player.carrySpeedScale,
          gunVisible: !!viewmodel?.root?.visible,
          hud: hud.CarryState(),
        }),
      },
      /**
       * 架设机枪取证口。摆点是集成批的事，这里给的是**驱动 + 取证**：
       *   Debug.Emplacement.Create({...})        摆一挺（不带交互点，直接用）
       *   Debug.Emplacement.Occupy(id)           上枪位（等价于玩家按 F）
       *   Debug.Emplacement.Fire(true/false)     扣住/松开扳机
       *   Debug.Emplacement.Jam(id)              脚本触发的必然失效（§6 阶段⑩②）
       *   Debug.Emplacement.State()              规则层 + HUD + 世界模型三侧一起取
       * `gunVisible` 读的是**视图模型那个字段**，不是规则层的推断 ——
       * 「规则说收枪了但画面没收」正是这一类接线最容易漏的一环。
       */
      Emplacement: {
        Create: (spec) => emplacement.CreateEmplacement(spec),
        Occupy: (id) => emplacement.Occupy(id, player),
        Vacate: (reason) => emplacement.Vacate(reason),
        Fire: (down) => { debugEmplacedFire = down !== false; return emplacement.SetFire(debugEmplacedFire); },
        Bolt: () => emplacement.PullBolt(),
        // 名字不叫 Clear：`emplacement.Clear(tag)` 是「按 tag 收掉战位」，
        // 这一条是「按住 R 排小卡」，同名会在取证脚本里被读反。
        HoldClear: (down) => (down === false ? emplacement.EndClear() : emplacement.BeginClear()),
        Reload: () => emplacement.Reload(),
        Resupply: (id, belts) => emplacement.Resupply(id, belts),
        Jam: (id, opts) => emplacement.ForceJam(id, opts),
        State: () => ({
          ...emplacement.State(),
          gunVisible: !!viewmodel?.root?.visible,
          playerYaw: player.yaw, playerPitch: player.pitch,
          worldModels: [...emplacementViews.entries()]
            .map(([id, view]) => ({ id, hasModel: !!view.root })),
          hud: hud.EmplacementState(),
        }),
      },
      /**
       * 日机扫射取证口。摆点（三条航线的线段与白名单）是集成批的事，
       * 这里给的是**驱动 + 取证**：
       *   Debug.Strafe.Run({ preset:"crowdTurn", from, to, victims })  起一条航线
       *   Debug.Strafe.Dodge()                       扑入路沟（等价于玩家躲开）
       *   Debug.Strafe.PlayerDamage(false)           整条关掉对玩家的伤害
       *   Debug.Strafe.Window(3.5)                   调宽躲避窗口
       *   Debug.Strafe.State()                       规则层 + 世界模型两侧一起取
       * `modelAt` 读的是**场景里那架飞机的世界坐标**，不是规则层的推断 ——
       * 「规则飞过去了但模型还在圆周上」正是这一类接线最容易漏的一环。
       */
      Strafe: {
        Run: (spec) => strafe.StrafeRun(spec),
        Dodge: (reason) => strafe.Dodge(reason),
        Abort: (reason) => strafe.Abort(reason),
        Ping: (origin, dir, maxDistM) => strafe.Ping(origin, dir, maxDistM),
        PlayerDamage: (on) => strafe.SetPlayerDamage(on),
        Window: (seconds) => strafe.SetPlayerWindow(seconds),
        State: () => {
          const view = strafe.View();
          const form = view ? aircraft?.FormFor(view.aircraft.id) : null;
          return {
            ...strafe.State(),
            modelAt: form ? { x: form.root.position.x, y: form.root.position.y, z: form.root.position.z } : null,
            modelVisible: form ? !!form.root.visible : null,
          };
        },
      },
      /**
       * 照明弹的取证口。
       *   Debug.Flare.Launch({ preset:"crossLane", from, at })  打一枚
       *   Debug.Flare.Sequence([{ atS, preset, from, at }])     排时刻表
       *   Debug.Flare.Exposure(false)                           只留画面，不动发现距离
       *   Debug.Flare.State()                                   规则层 + AI 侧一起取
       * `ai` 那一段是这条机制的**真正判据**：光强包络对了不算数，
       * 要 SIGHT_BY_STANCE 三档真的一起抬起来、熄灭之后真的还回去。
       */
      Flare: {
        Launch: (spec) => flare.LaunchFlare(spec),
        Sequence: (items) => flare.LaunchSequence(items),
        Cancel: (ticket) => flare.CancelSequence(ticket),
        Abort: (id, reason) => flare.Abort(id, reason),
        Exposure: (on) => flare.SetExposure(on),
        State: () => ({
          ...flare.State(),
          ai: ai?.SightState() ?? null,
          lights: lights?.GetEffectLightState() ?? null,
        }),
      },
      /**
       * 发报的取证口。
       *   Debug.Telegraph.Begin({ groups:[...], breakAfterGroup:2 })  开一封
       *   Debug.Telegraph.Key()                     敲一下电键（等价于玩家按 F）
       *   Debug.Telegraph.Break() / Reconnect()     炮击松脱 / 接回去
       *   Debug.Telegraph.State()                   规则层 + HUD 两侧一起取
       */
      Telegraph: {
        Begin: (spec) => telegraph.BeginTelegraph(spec),
        Key: (reason) => telegraph.Key(reason),
        Break: (reason) => telegraph.ForceDisconnect(reason),
        Reconnect: (reason) => telegraph.Reconnect(reason),
        Abort: (reason) => telegraph.Abort(reason),
        State: () => ({
          ...telegraph.State(),
          hud: hud.TelegraphState(),
        }),
      },
      Prompts: () => hud.actionPrompts.map((prompt) => ({ ...prompt })),
      /**
       * 准心与目标识别的取证口。
       * 准心那三个数必须一起读：`spreadDeg` 是 Player.SpreadDeg 的真值，
       * `gap` 是 HUD 真正画出来的缝，`expected` 是按当前视场重算的应画值 ——
       * 三者对不上就说明准心又在自说自话（这正是 2026-08-25 那次返工的病根）。
       */
      Reticle: () => {
        const weapon = WEAPONS[currentWeapon];
        const firearm = Number(weapon?.spreadHipDeg) > 0;
        const spreadDeg = firearm ? player.SpreadDeg(weapon) : 0;
        const drawn = hud.CrosshairState();
        return {
          ...drawn,
          armed: firearm,
          fov: camera.fov,
          viewportHeight: window.innerHeight,
          expected: CrosshairGeometry({
            spreadDeg, fovDeg: camera.fov, viewportHeight: window.innerHeight,
            sprint: player.sprint, armed: firearm,
          }).gap,
          sprint: player.sprint,
          ads: player.ads,
        };
      },
      Target: () => ({
        card: hud.TargetState(),
        detail: DIFFICULTY.targetInfo ?? "basic",
        entityId: identify.entity?.id ?? null,
        stats: { ...identify.stats },
        cone: IDENTIFY.coneDeg,
      }),
      AdsOffset: () => ({ x: viewmodel.adsOffset.x, y: viewmodel.adsOffset.y }),
      // AI 那边的运行时取证口：某个兵此刻的完整状态
      SoldierInfo: (soldier) => ({
        id: soldier.id, side: soldier.side, state: soldier.state, order: soldier.order,
        squad: soldier.squadId, squadSlot: soldier.squadSlot, role: soldier.tacticalRole,
        stance: soldier.stance, yaw: soldier.yaw, lookYaw: soldier.lookYaw,
        aim: soldier.aimBlend, targetChanges: soldier.targetChanges,
        squadFocus: soldier.squadFocusKind, squadFocusId: soldier.squadFocusId,
        squadForward: [soldier.squadForwardX, soldier.squadForwardZ],
        holdZone: soldier.holdZone ? soldier.holdZone.id : null,
        bayonet: soldier.bayonetFixed, heat: soldier.heat,
        coolFor: Math.max(0, soldier.coolUntil - ai.time),
        x: soldier.position.x, z: soldier.position.z,
        goalX: soldier.goal.x, goalZ: soldier.goal.z,
      }),
      Ammo: () => ({ ammo: state.ammo, clips: state.clips, grenades: state.grenades, bundles: state.bundles }),
      /**
       * 物理层的取证口。冒烟脚本靠它断言「碰撞真的接上了」——
       * 读源码看不出运行时到底有没有把盒子灌进去（曾经就有一版把城外的
       * 几千个盒子漏在外面，画面上有土坎、子弹照穿）。
       */
      Physics: () => (physics ? {
        ...physics.Stats(),
        fieldColliders: battlefield ? battlefield.colliders.length : 0,
        playerBody: !!(player && player.body),
        grounded: player ? player.grounded : null,
      } : null),
      /** 城镇/村落程序化细节的运行时计数；视觉回归要能证明不是只改了注释。 */
      Environment: () => ({
        city: battlefield?.city?.stats ? { ...battlefield.city.stats } : null,
        outfield: battlefield?.outfield?.stats ? {
          ...battlefield.outfield.stats,
          villageArchetypes: { ...battlefield.outfield.stats.villageArchetypes },
        } : null,
      }),
      /** 破坏层取证：可破坏/承重数量、破口、常驻残骸与拓扑重建次数。 */
      Destruction: () => destruction ? destruction.Stats() : null,
      /** 冒烟靶场用：走正式材质耐久与拓扑链，不绕过破坏系统。 */
      DamageCollider: (box, energy = 1000, kind = "shell", normal = null) => {
        if (!destruction || !box) return null;
        const c = box.c || [
          (box.min[0] + box.max[0]) * 0.5,
          (box.min[1] + box.max[1]) * 0.5,
          (box.min[2] + box.max[2]) * 0.5,
        ];
        const n = normal || { x: 0, y: 0, z: 1 };
        const point = { x: c[0], y: c[1], z: c[2] };
        const result = destruction.Hit(box, point, energy, { kind, normal: n });
        destruction.Update(player.position);
        return { ...result, stats: destruction.Stats() };
      },
      /** 从某点朝某方向打一条射线（斜墙/空气墙的取证）。 */
      Ray: (ox, oy, oz, dx, dy, dz, maxDist = 60, terrain = false) => {
        const d = Math.hypot(dx, dy, dz) || 1;
        const hit = battlefield.Raycast(
          { x: ox, y: oy, z: oz }, { x: dx / d, y: dy / d, z: dz / d }, maxDist, { terrain });
        return hit ? { t: hit.t, normal: hit.normal, tag: hit.box ? hit.box.tag : null } : null;
      },
      /** 脚下探地（脚部 IK 与"这层站得住吗"共用的那条查询）。 */
      Probe: (x, z, fromY) => (physics ? physics.GroundProbe(x, z, fromY) : null),
      // --- 线性关卡的取证口 ---
      // 这一关是哪一关、目标链走到第几个、路标各在哪儿。
      // 「七关能依次推进」这条断言只能从这里读，读源码是推断不出来的。
      Level: () => {
        const phase = PHASE_TABLE[state.phaseIndex];
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
      // --- 钉关原语（mechanics.pinFinalZone）的取证口 ---
      // 「走到最后一个路标为什么没换关」只能从这里读。
      ChapterPin: () => ({
        pinFinalZone: state.pinFinalZone,
        released: state.chapterReleased,
        releaseAt: state.chapterReleaseAt,
        signal: CHAPTER_RELEASE_SIGNAL,
        signalled: story ? story.Signalled(CHAPTER_RELEASE_SIGNAL) : false,
        objectiveIndex: state.objectiveIndex, objectiveCount: state.objectiveCount,
        phaseTime: state.phaseTime, levelSeconds: state.levelSeconds,
      }),
      ReleaseChapter: () => { story?.Signal(CHAPTER_RELEASE_SIGNAL); return state.chapterReleased; },
      // --- 具名同伴的取证口 ---
      Companions: () => ({
        present: companion ? companion.Present : [],
        roster: companion ? companion.Roster : [],
        absent: companion ? companion.Absent : [],
        log: companion ? companion.log.slice() : [],
        located: companion
          ? Object.fromEntries(companion.Roster.map((id) => [id, companion.Locate(id)]))
          : {},
      }),
      // --- 脚本检查点的取证口 ---
      Checkpoint: () => ({
        samples: checkpoint ? checkpoint.Count : 0,
        rewinds: checkpoint ? checkpoint.rewinds.slice() : [],
        latest: checkpoint ? checkpoint.Latest : null,
      }),
      SaveCheckpoint: () => !!checkpoint?.Save(),
      RewindCheckpoint: (seconds) => (checkpoint ? checkpoint.Rewind(seconds) : null),
      /**
       * 章节摆点的取证口（集成批 INT2）。
       *
       *   Debug.Setpieces()              这一章摆了什么、推过哪些信号、后送队走到哪儿
       *   Debug.SetpieceFacts()          同一局之内的场景事实（门板拆了几块、门开没开）
       *   Debug.SetpieceProps()          运行时道具清单
       *
       * `signals` 是最要紧的一栏：**七章与九个系统之间的接缝只有这一条**，
       * 「这一拍该发生的事到底推没推」在这里一眼看得出来。
       *
       * 还欠着的动词（host 里恒返回 null / 只记事实的那几条）：
       *   CookingCrate  —— 二关殉爆倒计时要一件**真的弹药箱实体**，现在的箱子
       *                    是交互点 + 搬运态，场上没有可被掷弹筒打中的那一只；
       *   SetCombatBed  —— 交火声床的整层淡入淡出归音频批（INT3）。
       */
      Setpieces: () => (setpieces ? setpieces.State() : null),
      P012: () => p012Flow?.State() || null,
      P012Environment: () => ({externalCount:battlefield?.externalProps?.count || 0,pcgCount:battlefield?.externalProps?.pcgCount || 0,trimCount:battlefield?.trimProps?.count || 0,
        roots:scene.children.filter(root=>root.userData?.externalProps || /^(ExternalProps_|TrimProps_)/.test(root.name)).map(root=>root.name)}),
      P012Scene: () => p012Runtime ? { ...p012Runtime.Sample(), airColumnEnteredRoad:AirColumnEnteredRoad(setpieces?.mem?.column,player.position), columnPosition: setpieces?.mem?.column?.HeadPosition(), columnRouteIndex: setpieces?.mem?.column?.legIndex,
        woundedDragDelivered: !!setpieces?.mem?.p012WoundedDrag?.delivered, woundedDragDistance: setpieces?.mem?.p012WoundedDrag?.distance || 0,
        carryDistance: setpieces?.mem?.p012CarryDistance || 0, litterOverturned: !!setpieces?.mem?.p012LitterOverturned,
        litterRecovered: !!setpieces?.mem?.p012LitterRecovered, lastLitterArrived: LastLitterArrived(setpieces?.mem?.column),
        fallenAt: setpieces?.mem?.p012FallenAt ? { ...setpieces.mem.p012FallenAt } : null, recoveryReason: setpieces?.mem?.p012RecoveryReason || null,
        litters: (setpieces?.mem?.column?.litters || []).map((litter) => ({ id: litter.propLitter, bodyId: litter.propBody, dropped: litter.dropped,
          originalCarried: litter === setpieces?.mem?.p012CarriedLitter,
          front: litter.front?.handle?.position ? { ...litter.front.handle.position } : null,
          rear: litter.rear?.handle?.position ? { ...litter.rear.handle.position } : null,
          frontAlive: !!litter.front?.handle?.alive, rearAlive: !!litter.rear?.handle?.alive,
          frontHealth: litter.front?.handle?.health ?? null, rearHealth: litter.rear?.handle?.health ?? null,
          propPosition: setpieceProps.get(String(litter.propLitter))?.root?.position ? { ...setpieceProps.get(String(litter.propLitter)).root.position } : null })),
        columnActors: (setpieces?.mem?.column?.Alive || []).map((member) => ({ role: member.role, x: member.handle.position.x, z: member.handle.position.z })) } : null,
      SetpieceFacts: () => ({ ...state.setpieceFacts, items: { ...state.setpieceItems } }),
      SetpieceProps: () => [...setpieceProps.entries()].map(([id, entry]) => ({
        id, kind: entry.spec.kind || "box", visible: !!entry.root?.visible,
        x: +entry.root.position.x.toFixed(1), z: +entry.root.position.z.toFixed(1),
      })),
      Firewalls: () => state.firewalls.map((w) => ({
        id: w.id, until: +w.until.toFixed(1), damagePlayer: w.damagePlayer, smoke: w.smoke.length,
      })),
      // --- 过场的取证口 ---
      PlayCutscene: (id) => RunCutscene(id),
      PlayMidCutscene: (id) => PlayMidCutscene(id),
      MidCutscenes: () => (story ? story.MidCutscenes : []),
      SkipCutscene: () => { if (cutscene) cutscene.Skip(); return !!cutscene; },
      Cutscene: () => ({
        playing: cutscene ? cutscene.Playing : false,
        current: cutscene ? cutscene.CurrentId : null,
        time: cutscene ? cutscene.Time : 0,
        headLook: cutscene ? cutscene.AllowsLook : false,
        look: cutscene ? cutscene.Look : { yaw: 0, pitch: 0 },
        played: state.cutscenesPlayed.slice(),
        log: cutscene ? cutscene.log.slice(-40) : [],
      }),
      // 出图工具默认保持 neutralLook（确定性取证）；明确传 yaw/pitch 时才打开
      // 头部视线覆盖。SetLook 自带数据范围钳制，所以命令行不会把相机转飞。
      SetCutsceneLook: (yaw = 0, pitch = 0) => {
        if (!cutscene || !cutscene.Playing) return null;
        cutscene.SetNeutralLook(false);
        return cutscene.SetLook(yaw, pitch);
      },
      Preview: () => ({
        active: PREVIEW,
        id: PREVIEW_ID,
        playing: state.previewPlaying,
        done: state.previewDone,
        handoff: state.previewHandoffShown ? "跟随通信排。" : null,
        handoffCount: state.previewHandoffCount,
        aiAlive: ai ? ai.soldiers.filter((s) => s.alive).length : 0,
        error: state.previewError,
        manualStep: MANUAL_STEP,
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
        mouseFree: altMouseFree,
      }),
      ReleasePointerLock,
      // 模拟浏览器吞掉 Esc、只抛 pointerlockchange 的真实路径；菜单冒烟锁死这条回归。
      DropPointerLock: () => {
        if (FAKE_POINTER_LOCK) {
          if (fakeLocked) { fakeLocked = false; OnPointerLockChange(); }
        } else if (document.pointerLockElement && typeof document.exitPointerLock === "function") {
          document.exitPointerLock();
        }
      },
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
      Whitebox: () => {
        const phase = PHASE_TABLE[state.phaseIndex];
        return {
          phase: phase.id,
          contentId: PhaseContentId(phase),
          storyLevel: story?.levelId || null,
          setpieceLevel: setpieces?.levelId || null,
          companions: companion?.Present?.length || 0,
          enemyCount: ai.CountSide("ija"),
          enemyDeaths: ai.deaths.ija || 0,
          phaseTime: state.phaseTime,
          objectiveIndex: state.objectiveIndex,
          blockedReason: state.objectiveBlockedReason,
          field: battlefield?.DebugState?.() || null,
        };
      },
      OpenDirections: (x, z, count = 72, probeM = 20) =>
        CountOpenDirections(x, z, battlefield.GroundHeight(x, z), probeM, count),
    },
  };
  // battlefield 与 nav **每换一关都会被换成新的一份**（切片重建）。
  // 写成普通属性的话，调试口会一直指着上一关那份已经 Dispose 掉的城 ——
  // 表现是"取证读出来的碰撞盒表是空的"，而代码看起来完全正确。所以用取值器。
  Object.defineProperty(window.Taierzhuang, "battlefield", { get: () => battlefield });
  Object.defineProperty(window.Taierzhuang, "physics", { get: () => physics });
  Object.defineProperty(window.Taierzhuang, "nav", { get: () => navGrid });
  Object.defineProperty(window.Taierzhuang, "cutscene", { get: () => cutscene });

  // 别名：全局名沿用 Taierzhuang 是为了不动出图脚本与两个冒烟（三处都按它取运行时），
  // 但这个项目现在是滕县，新写的东西一律用 window.Tengxian。**两个名字是同一个对象。**
  window.Tengxian = window.Taierzhuang;

  // --- 靶场取证口（只在 ?range=1 下存在；口径在 docs/Data_TestRange.md） ----
  // 人机共用：agent 用 State/Targets 断言、GoTo/AimAt 摆位，真人在旁边看同一片场。
  // 输入不在这里另开门：开枪/开镜/上刺刀/投弹照旧走 Debug.Fire / Key / Mouse / Throw
  // 的真事件链 —— 测的是键位与玩法，不是函数。
  if (RANGE) {
    const RangeTargetSnapshot = (entry) => {
      const s = entry.soldier;
      return {
        id: entry.spec.id, station: entry.spec.station,
        x: entry.spec.x, z: entry.spec.z,
        alive: !!(s && s.alive),
        health: s ? s.health : 0,
        deadTime: s && !s.alive ? s.deadTime : 0,
        distance: s ? Math.hypot(s.position.x - player.position.x,
          s.position.z - player.position.z) : null,
      };
    };
    window.Taierzhuang.Debug.Range = {
      /** 一眼总览：工位、靶况、击倒/复位计数、玩家武器与弹药 —— 验收的唯一入口。 */
      State: () => ({
        stations: RANGE_STATIONS.map((z) => ({ id: z.id, name: z.name, x: z.x, z: z.z })),
        targets: rangeTargets.map(RangeTargetSnapshot),
        stats: { ...rangeStats },
        player: {
          x: player.position.x, z: player.position.z, yaw: player.yaw, pitch: player.pitch,
          health: player.health, alive: player.alive,
          ads: player.ads, fov: camera.fov,
          slot: state.activeSlot, weapon: currentWeapon,
          ammo: state.ammo, clips: state.clips, grenades: state.grenades,
          bayonetFixed: state.bayonetFixed,
        },
        pinned: state.pinned,
        respawnS: RANGE_RESPAWN_S,
      }),
      Targets: () => rangeTargets.map(RangeTargetSnapshot),
      /** 瞬移到某个工位（RangeRifle / RangeGrenade / RangeMelee），面朝各自靶道。 */
      GoTo: (stationId) => {
        const zone = RANGE_STATIONS.find((z) => z.id === stationId);
        if (!zone) return null;
        player.Spawn(zone.x, zone.z, zone.ry ?? 0);
        return { id: zone.id, x: zone.x, z: zone.z, yaw: player.yaw };
      },
      /**
       * 把视线摆到某个靶子身上。只摆 yaw/pitch，开火仍走 Debug.Fire ——
       * 散布、后坐、开镜収束照旧全在链路里。
       *
       * offsetY 默认 = **躯干判定中心** COMBAT.hitbox.centerY（与 MarchBullet 读的
       * 是同一份数，判定球半径 COMBAT.hitbox.radius）。两条要知道的账：
       *   · TryFire 是先施加本发的枪口上跳再采样弹道（「顶上去 100%」的设计），
       *     所以首发会比瞄点高出 kick × 距离 —— ADS 下约 0.9°，25 m 处 ≈ 0.4 m。
       *     远靶验命中要么瞄低、要么用近靶（RangeTest 用的 R10）。
       *   · 命中几何只有那一个球（爆头是 TryFire 里按概率抽的，不是几何），
       *     所以别瞄头 —— 那条线从球上方擦过去就是脱靶。
       */
      AimAt: (targetId, offsetY = HITBOX.centerY) => {
        const entry = rangeTargets.find((e) => e.spec.id === targetId);
        const s = entry ? entry.soldier : null;
        if (!s) return null;
        const from = player.EyePosition;
        const dx = s.position.x - from.x;
        const dy = (s.position.y + offsetY) - from.y;
        const dz = s.position.z - from.z;
        const horiz = Math.hypot(dx, dz) || 1;
        player.yaw = Math.atan2(-dx, -dz);
        player.pitch = Math.atan2(dy, horiz);
        player.aimYaw = 0;
        player.aimPitch = 0;
        return { yaw: player.yaw, pitch: player.pitch, distance: Math.hypot(dx, dy, dz) };
      },
      /** 整场复位：靶子全部立即重立，玩家满血满弹，击倒/复位计数清零。 */
      Reset: () => {
        for (const entry of rangeTargets) {
          if (entry.soldier) ai.Remove(entry.soldier);
          entry.soldier = SpawnRangeTarget(entry.spec);
          entry.deadCounted = false;
        }
        rangeStats.killed = 0;
        rangeStats.respawned = 0;
        rangeStats.resets += 1;
        player.health = 100;
        player.bleeding = false;
        const loadout = RANGE_PHASE.loadoutOverride;
        state.mags.primary = { ammo: WEAPONS[loadout.primary].magazine, clips: loadout.spareClips };
        state.mags.secondary = { ammo: WEAPONS[loadout.secondary].magazine, clips: 2 };
        const mag = state.mags[state.activeSlot];
        if (mag) { state.ammo = mag.ammo; state.clips = mag.clips; }
        state.grenades = loadout.throwables.Grenade;
        return window.Taierzhuang.Debug.Range.State();
      },
    };
  }

  if (MELEE_TEST) {
    const Snapshot = (entry) => {
      const soldier = entry.soldier;
      return {
        id: entry.spec.id, station: entry.spec.station, kind: entry.spec.kind,
        pattern: entry.spec.pattern, alive: !!soldier?.alive,
        health: soldier?.health ?? 0,
        x: soldier?.position.x ?? entry.spec.x, z: soldier?.position.z ?? entry.spec.z,
        qte: soldier?.meleeQte ? { ...soldier.meleeQte } : null,
        executableUntil: soldier?.executionReadyUntil ?? -99,
      };
    };
    const Face = (soldier) => {
      if (!soldier) return null;
      const dx = soldier.position.x - player.position.x;
      const dz = soldier.position.z - player.position.z;
      player.yaw = Math.atan2(-dx, -dz);
      player.pitch = 0;
      player.aimYaw = 0;
      player.aimPitch = 0;
      return { yaw: player.yaw, distance: Math.hypot(dx, dz) };
    };
    window.Taierzhuang.Debug.MeleeQte = {
      State: () => ({
        ...meleeQte.State(),
        stations: MELEE_QTE_STATIONS.map((station) => ({ ...station })),
        targets: meleeTargets.map(Snapshot),
        trainingStats: { ...meleeStats },
        player: {
          x: player.position.x, z: player.position.z, yaw: player.yaw,
          health: player.health, alive: player.Alive,
          slot: state.activeSlot, weapon: currentWeapon, bayonetFixed: state.bayonetFixed,
        },
        hud: hud.MeleeQteState(),
        viewmodel: {
          x: viewmodel.actionPivot.position.x, y: viewmodel.actionPivot.position.y,
          z: viewmodel.actionPivot.position.z,
          rx: viewmodel.actionPivot.rotation.x, ry: viewmodel.actionPivot.rotation.y,
          rz: viewmodel.actionPivot.rotation.z,
        },
      }),
      Targets: () => meleeTargets.map(Snapshot),
      GoTo: (stationId) => {
        meleeQte.Cancel("trainingMove");
        const station = MELEE_QTE_STATIONS.find((entry) => entry.id === stationId);
        const target = meleeTargets.find((entry) => entry.spec.station === stationId)?.soldier;
        if (!station || !target) return null;
        player.Spawn(station.x, station.z, station.ry ?? 0);
        // 调试瞬移不是“换人出生”，不能带三秒出生保护；否则在工位故意放弃格挡
        // 只会亮失败字样却不扣血，测试到的就不是正片失败链。
        player.spawnGrace = 0;
        Face(target);
        return { id: station.id, x: station.x, z: station.z, targetId: target.id };
      },
      TriggerBlock: (pattern = 0) => {
        meleeQte.Cancel("debugTrigger");
        const entry = meleeTargets.find((item) => item.spec.kind === "block"
          && item.spec.pattern === Number(pattern));
        if (!entry?.soldier?.alive) return false;
        Face(entry.soldier);
        return meleeQte.BeginBlock(entry.soldier, Number(pattern));
      },
      TriggerExecution: (pattern = 0) => {
        meleeQte.Cancel("debugTrigger");
        const entry = meleeTargets.find((item) => item.spec.kind === "execution"
          && item.spec.pattern === Number(pattern));
        if (!entry?.soldier?.alive) return false;
        Face(entry.soldier);
        return meleeQte.TryBeginExecution(Number(pattern), entry.soldier);
      },
      MakeExecutable: (targetId = null) => {
        const entry = targetId ? meleeTargets.find((item) => item.spec.id === targetId) : meleeTargets[0];
        return !!meleeQte.MakeExecutable(entry?.soldier || null);
      },
      SetAssist: (mode) => meleeQte.SetAssist(mode),
      Reset: () => {
        meleeQte.Cancel("trainingReset");
        for (const entry of meleeTargets) if (entry.soldier) ai.Remove(entry.soldier);
        SeedMeleeTargets();
        meleeStats.completed = 0;
        meleeStats.respawned = 0;
        meleeStats.resets += 1;
        player.health = 100;
        player.bleeding = false;
        state.bayonetFixed = true;
        SyncBayonet();
        return window.Taierzhuang.Debug.MeleeQte.State();
      },
    };
  }

  // --- 编辑器套件 ---------------------------------------------------------
  // 建在最后：六个编辑器要的东西（材质库、人物工厂、视图模型、过场导演、城、破坏系统）
  // 到这一步才齐。battlefield 每换一关都是新的一份，所以走取值器交出去，
  // 不许在这里把当时那一份拷进去（拷了就是「编辑器指着上一关那座城」）。
  editor = new EditorSuite({
    renderer, scene, camera, canvas, library, lights, post, vfx,
    actorFactory, viewmodel, audio, cutscene, destruction, profiler,
    shot: !!SHOT,
    ReleasePointerLock,
    ReturnToMainMenu: MENU_AT_BOOT ? () => OpenMenu() : null,
    game: {
      // gi 走取值器：惰性构造后 Debug Rendering 面板才能看见新建的探针体
      state, PHASES: PHASE_TABLE, JumpToLevel, graphics, ApplyGraphics,
      get gi() { return gi; }, get firstPersonSelfShadow() { return firstPersonSelfShadow; },
      // 场景编辑器的「序章 · 出川」是一段独立过场，不能用 JumpToLevel(0)
      // 冒充。跳转到稳定预览入口，同时清掉会把编辑器测试/直跳关带过去的
      // query，避免新序章又落到界河战斗切片。
      OpenProloguePreview: () => {
        const url = new URL(window.location.href);
        url.searchParams.set("preview", "CS_Chuchuan");
        url.searchParams.delete("phase");
        url.searchParams.delete("menu");
        window.location.assign(url.toString());
      },
      sceneMode: FULL_SCENE ? FULL_SCENE_VIEW : "level",
      ApplyEnvironment: (name) => ApplySkyPreset(name),
      GetEnvironmentState: () => ({
        name: cutsceneSky || PHASE_TABLE[state.phaseIndex].sky,
        override: !!cutsceneSky,
      }),
      RestoreEnvironmentState: (snapshot) => {
        if (snapshot?.override && snapshot.name) ApplySkyPreset(snapshot.name);
        else {
          cutsceneSky = null;
          const preset = sky.Apply(PHASE_TABLE[state.phaseIndex].sky);
          sky.BakeEnvironment(scene);
          lights.ApplyPreset(preset, sky.sunDirection);
        }
      },
      // 所有真正的编辑器都从菜单交接出来：主菜单本身有运镜，暂停菜单有
      // 「继续 / 设置 / 调试选项」；两者都不该和编辑器叠在同一张画面上。
      // 同时保留原菜单层，完整退出编辑器后再回去，而不是意外恢复战斗。
      PrepareEditor: () => {
        // 暂停菜单不会把 state.menu 设为 true（它表示的是“主菜单活场景”），
        // 但 menu.open 仍然为 true。只看 state.menu 会漏掉“暂停 → 设置 →
        // 构件库 / 摄影棚”等路径，让暂停标题和按钮继续盖在编辑器后面。
        // 编辑器内切换工具时菜单已经关闭，不能清掉第一次记录的返回层。
        if (menu && menu.open) {
          editorReturnMenuMode = menu.mode;
          CloseMenu();
        }
        ReleasePointerLock();
      },
      FinishEditorSession: () => FinishEditorSession(),
      get battlefield() { return battlefield; },
      get player() { return player; },
      get currentWeapon() { return currentWeapon; },
      get currentWeaponVariant() { return SlotWeaponVariant(state.activeSlot); },
    },
  });
  window.Taierzhuang.editor = editor;
  // 编辑器的取证口：冒烟测试不点按钮，直接从这里开关与读状态
  window.Taierzhuang.Debug.OpenEditor = (id) => !!editor.Open(id);
  window.Taierzhuang.Debug.CloseEditor = () => { editor.TogglePanel(false); };
  window.Taierzhuang.Debug.Editor = () => ({
    panelOpen: editor.panelOpen,
    active: editor.ActiveId,
    debugRendering: editor.overlays.has("debugRendering"),
    debugView: post.GetDebugView(),
    capturing: editor.Capturing,
    studio: editor.studio.Active,
    fly: editor.flycam.Active,
    hidden: !!document.getElementById("edRoot")
      && document.getElementById("edRoot").classList.contains("off"),
  });

  // --- 采样点：县城固定机位的出图口 ----------------------------------------
  // Script_SamplePointShot 不自己算机位，而是开采样点编辑器、逐点调它。
  // 面板里预览到的与出图出来的必须是同一份位姿；两边各算一遍迟早会分叉。
  const SampleTool = () => (editor.ActiveId === "samplePoints"
    ? editor.active : editor.Open("samplePoints"));
  window.Taierzhuang.Debug.SamplePoints = () => SampleTool()?.Points() || null;
  window.Taierzhuang.Debug.SamplePoint = (id) => SampleTool()?.ApplyPointById(id) || null;
  // 天光覆盖：夜战关（1/3/6）里的关厢建筑必须按白天记录，否则那一张图上
  // 只有黑色轮廓。与过场换天光同一条通道（三件一起换）。
  window.Taierzhuang.Debug.ApplySky = (name) => ApplySkyPreset(name);
  window.Taierzhuang.Debug.RestoreSky = () => { RestoreLevelSky(); };

  // --- 主菜单 --------------------------------------------------------------
  // 建在最末：它要拿相机、要知道现在建好的是哪一关（决定用哪一组机位），
  // 还要能把编辑器的齿轮藏起来 —— 三样东西到这一步才齐。
  if ((MENU_ON || FIRST_LEVEL_P012_WHITEBOX) && menuRoot) {
    menu = new MainMenu({
      root: menuRoot, camera, phases: PHASES,
      SliceIndex: () => state.builtPhase,
      GroundHeight: (x, z) => (battlefield ? battlefield.GroundHeight(x, z) : null),
      Unlock: () => audio.Unlock(),
      Play: (index, opts) => StartLevel(index, opts),
      // 靶场：菜单里当一条「特殊关卡」摆着，但进出都是**重载页面**。
      // 它不在 PHASES 里，PHASE_TABLE 在 ?range=1 下是整表替换的（见文件头那段
      // 注释与 docs/Data_TestRange.md）—— 当场换表要把已经建好的世界、兵员池、
      // 携行与七关口径一起翻一遍，重载一次比那条路诚实得多。
      // 玩家可见的测试场景只保留四条核心玩法入口。界河与过场仍可通过
      // ?jiehe=1 / ?preview=... 直达，供自动化与内部验收使用，不再混入选章。
      sandboxes: [RANGE_PHASE, MELEE_QTE_PHASE, FIRST_LEVEL_WHITEBOX_PHASE,
        FIRST_LEVEL_P012_WHITEBOX_PHASE],
      sandboxMode: RANGE ? "range" : MELEE_TEST ? "melee"
        : FIRST_LEVEL_WHITEBOX ? "firstLevelWhitebox"
          : FIRST_LEVEL_P012_WHITEBOX ? "firstLevelP012Whitebox" : JIEHE ? "jiehe" : false,
      PlaySandbox: (key) => GoToSandbox(key),
      // 机位表按**建好的那一片**取，不按「第几章」取：`?phase=overview` 与
      // 这些独立切片都不在 PHASES 里，照 SliceIndex 去查 PHASES 会取到别人的机位
      //（全城俯瞰会拿到序章那两条路基机位）。正片下 PHASE_TABLE === PHASES，
      // 这条与旧行为逐字相同。
      SlicePhase: () => PHASE_TABLE[state.builtPhase] || PHASES[state.builtPhase] || null,
      ExitSandbox: () => GoToSandbox(null),
      RestartSandbox: () => location.reload(),
      RetrySandbox: () => { if(p012Runtime?.RetryPlayer()){state.playerAliveLast=true;state.pendingRespawn=false;state.deathTimer=0;viewmodel.root.visible=true;ResumeFromPause();hud.Hint("保留现场进度与剩余补给",4);} },
      Resume: () => ResumeFromPause(),
      // OpenMenu / PauseGame 会把整棵编辑器 DOM 藏掉（主菜单不该常驻开发齿轮）。
      // 「设置」既然复用了这棵 DOM，就必须先把它显式还回来；否则内部的
      // panelOpen 虽然已经变成 true，玩家看到的仍是毫无反应。记住来源菜单，
      // 关掉设置后再由 FinishEditorSession 把对应的主菜单或暂停菜单恢复干净。
      Settings: () => {
        editorReturnMenuMode = menu && menu.open ? menu.mode : null;
        if (!SHOT) document.getElementById("edRoot")?.classList.remove("off");
        editor.TogglePanel(true);
      },
      DebugOptions: () => debugOptions.Get(),
      SetDebugOption: (id, enabled) => SetDebugOption(id, enabled),
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
      debugOptions: debugOptions.Get(),
    });
    window.Taierzhuang.Debug.MenuAct = (id) => menu.Activate(id);
    window.Taierzhuang.Debug.MenuShow = (mode) => menu.Show(mode);
    window.Taierzhuang.Debug.MenuPlay = (index, opts) => menu.Play(index, opts);
    window.Taierzhuang.Debug.Pause = () => PauseGame();
    window.Taierzhuang.Debug.ResetProgress = () => { Progress.Reset(); };
    window.Taierzhuang.Debug.DebugOptions = () => debugOptions.Get();
    window.Taierzhuang.Debug.SetDebugOption = (id, enabled) => SetDebugOption(id, enabled);
    // 靶场里菜单只当暂停层用（Esc 才现身），开机不接管相机 —— 见 MENU_AT_BOOT。
    if (MENU_AT_BOOT) OpenMenu();
  }

  if (SHOT) StartRun();
  else if (PREVIEW_AUTOPLAY) StartPreview({ unlockAudio: false });
  if (EDITOR_PARAM === "fullScene" && !SHOT) {
    // 完整县城与车厢静态场景都直接进工具，不再让用户隔着已经打开的编辑器
    // 再点一次「进城」。两者都不是正式序章预览，必须在这里显式收掉启动展示台。
    if (FULL_SCENE) {
      ShowBoot(false);
      state.menu = false;
      state.running = false;
    }
    editor.Open("fullScene");
  }
}

// ---------------------------------------------------------------------------
// 关卡流程
// ---------------------------------------------------------------------------

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
const WORLD_CLASSES = {
  [JIEHE_LEVEL_ID]: JieheField,
  [RANGE_LEVEL_ID]: RangeField,
  [MELEE_QTE_LEVEL_ID]: RangeField,
  [FIRST_LEVEL_WHITEBOX_LEVEL_ID]: FirstLevelWhiteboxField,
  [FIRST_LEVEL_P012_WHITEBOX_LEVEL_ID]: FirstLevelWhiteboxField,
};
function WorldClassFor(phase) { return WORLD_CLASSES[phase.id] || TengxianField; }

/**
 * 进／出玩法测试靶场：改 `?range=1` 再重载。
 *
 * 顺带清掉三个会把上一趟状态带过去的 query：`phase`（靶场只有一关，带过去会被
 * 夹成 0；从靶场退出时又会把玩家按到某一关的切片上）、`preview`（新序章预览与
 * 靶场是互斥的两条旁路）、`menu=0`（进去就没有暂停菜单，也就没有退出靶场的路）。
 * 与编辑器那条 OpenProloguePreview 同一个套路。
 */
function GoToSandbox(key) {
  const url = new URL(window.location.href);
  url.searchParams.delete("range");
  url.searchParams.delete("melee");
  url.searchParams.delete("whitebox");
  url.searchParams.delete("jiehe");
  if (key === "range") url.searchParams.set("range", "1");
  else if (key === "melee") url.searchParams.set("melee", "1");
  else if (key === "firstLevelWhitebox") url.searchParams.set("whitebox", "1");
  else if (key === "firstLevelP012Whitebox") url.searchParams.set("whitebox", "p012");
  else if (key === "jiehe") url.searchParams.set("jiehe", "1");
  url.searchParams.delete("phase");
  url.searchParams.delete("preview");
  url.searchParams.delete("menu");
  window.location.assign(url.toString());
}

/**
 * 这一片切片按哪个 id 取内容。
 *
 * 常态就是章节自己的 id；**过场承载章（序章）借下一章的切片** ——
 * 它自己不建场（EnterLevel 里 cutsceneOnly 那一支直接跳过 BuildField），
 * 但 ?phase=0 直跳、开机冒烟与出图仍然要有一片地皮才起得来引擎，
 * 那时就照 tuning.fieldFrom 去查三张按 levelId 分组的表：
 * OUTFIELD_SCENES（城外内容）、PLACEMENTS（外部 GLB 布景）、TRIM_PLACEMENTS（tzm 饰件）。
 * 口径见 Data_MissionCh0.mjs 头注。
 */
function FieldIdFor(phase) { return phase.fieldFrom || phase.id; }

/** 建一片关卡切片。**换关一定要先把上一片拆掉**，不然七关跑下来会攒七座城。 */
async function BuildField(phase, setStep, base, span, yieldFrame = NextFrame) {
  aircraft?.SetPhase(phase);
  if (destruction) destruction.Clear();
  ClearExternalProps();
  if(phase.whitebox?.p012)ClearTrimProps(scene);
  if (battlefield) { battlefield.Dispose(); battlefield = null; }
  levelBounds = MakeLevelBounds(phase.bounds, phase.whitebox?.p012 ? 1 : 10);
  const World = WorldClassFor(phase);
  battlefield = new World(scene, library, {
    quality: QUALITY,
    seed: 19380317,
    bounds: phase.bounds,
    // 城外内容按关卡 id 开关（一·北沙河那一关整关都在城外原野上，
    // 城的生成器管不到那儿）。见 Script_TengxianOutfield.OUTFIELD_SCENES。
    // 独立场景（界河）也按它取自己那份布景表。
    // 序章那种借片的章走 FieldIdFor（见上）。
    levelId: FieldIdFor(phase),
    // LOD 焦点给本关的目标链：玩家会去的地方出全院落，其余按体块剪影。
    // 焦点给错的后果不是"难看"，是把 draw call 花在玩家永远不去的城角上。
    foci: phase.zones.map((z) => [z.x, z.z]),
    zones: phase.zones,
    whiteboxLayout: phase.whitebox?.layout || null,
    // 每关自己的 LOD 分界（Data_Battle.TUNING）；没给就用默认。
    // 这是 draw call 的主要旋钮之一，改它之前先跑 BootTest 看数
    detailRadius: (phase.detailRadius ?? 100) * (QUALITY === "low" ? 0.72 : 1),
    midRadius: (phase.midRadius ?? 210) * (QUALITY === "low" ? 0.72 : 1),
  });
  for (const step of battlefield.BuildSteps()) {
    setStep(step.label, base + span * step.progress);
    await yieldFrame();
  }
  // PCG 的净空真相必须冻结在“外部布设加入之前”。否则编辑器重跑生成时会拿
  // 上一轮 PCG 自己的碰撞盒挡自己，所有候选都被判成重叠。
  battlefield.propPcgBlockers = battlefield.colliders.slice();
  // TownDressing is bounds-based, not phase-based: independent IDs alone do not isolate it.
  const external = phase.whitebox?.p012 ? {count:0,generatedCount:0,pcgCount:0,pcgStats:null,pcgErrors:[],failed:[],colliders:[],streamer:null} : await AddExternalProps({
    scene, library, phaseId: FieldIdFor(phase), bounds: phase.bounds,
    groundAt: (x, z) => battlefield.GroundHeight(x, z),
    blockers: battlefield.propPcgBlockers,
    cells: battlefield.city?.cells || [],
    generatedPlacements: battlefield.generatedExternalProps
      || battlefield.city?.generatedExternalProps || [],
  });
  // streamer 单独挂：externalProps 会被测试整个 evaluate 出去序列化，
  // 里面不能有 three 对象。
  battlefield.externalProps = {
    count: external.count, generatedCount: external.generatedCount,
    pcgCount: external.pcgCount, pcgStats: external.pcgStats, pcgErrors: external.pcgErrors,
    failed: external.failed, colliders: external.colliders,
  };
  battlefield.externalStreamer = external.streamer;
  // 先在出生点收敛一次：进关第一帧就该看见眼前的家什，而不是看着它们冒出来。
  external.streamer?.ForceSync(phase.spawn.x, phase.spawn.z);
  // 下载来的布景也是场上实物（见 Script_ExternalProps 文件头）。它们的碰撞盒是
  // 建关最后一步才并进来的，所以**空间散列必须重刷** —— BuildSteps 里那一次
  // BuildCollisionGrid 跑在这之前，不重刷的话 Rapier 里有这些盒子、
  // 而 AI 找掩体/破坏系统的粗筛 BoxesNear 里没有。
  if (external.colliders?.length) {
    battlefield.colliders.push(...external.colliders);
    if (typeof battlefield.BuildCollisionGrid === "function") battlefield.BuildCollisionGrid();
  }
  // tzm 饰件层（信号机/站灯/窗花/门五金…）：与外部 GLB 布景同一个异步槽位，
  // 但物理契约不同（多数无碰撞、可悬空安装），所以是平行的一层，见 Script_TrimProps 文件头。
  const trim = phase.whitebox?.p012 ? {count:0,failed:[],colliders:[]} : await AddTrimProps({ scene, library, phaseId: FieldIdFor(phase) });
  battlefield.trimProps = trim;
  if (trim.colliders?.length) {
    battlefield.colliders.push(...trim.colliders);
    if (typeof battlefield.BuildCollisionGrid === "function") battlefield.BuildCollisionGrid();
  }
  // 探针体的代理几何体就是物理那张 AABB 表。**换关必须重接** ——
  // 上一关的盒子留着，新一关的射线会打在一座已经不存在的城上。
  if (gi) gi.SetWorld(battlefield);
  setStep("砌墙（物理）……", base + span);
  await yieldFrame();
  BuildPhysics();
  if (destruction) destruction.SetWorld(battlefield, physics, null);
}

/**
 * 按当前切片重建物理世界。
 *
 * 顺序上必须**排在 battlefield.BuildSteps 走完之后** —— 城外那几千个盒子是最后
 * 一步才并进 field.colliders 的，早一步灌进去，土坎与路基在物理里就是不存在的。
 *
 * field.physics 这条反向引用是给 Raycast 用的：Ai / Combat / Main / Editor 四处
 * 都是照 field.Raycast 写的，把实现换掉比改四处调用点干净。
 */
function BuildPhysics() {
  if (physics) { physics.Dispose(); physics = null; }
  physics = new PhysicsWorld({
    groundAt: (x, z) => battlefield.GroundHeight(x, z),
    bounds: battlefield.bounds,
  });
  const n = physics.BuildStatic(battlefield.colliders);
  battlefield.physics = physics;
  if (player) player.AttachPhysics(physics);
  return n;
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
  const grid = new NavGrid(field, { cell });
  // 路标的距离场在**建关时**同步预热（force 绕过逐帧预算）：BFS 现在是跨帧摊的，
  // 不预热的话开场前几秒每个班都要各等自己那张场，兵先直奔一段墙才拐弯。
  // 一张 ~5 ms、七八个路标共几十毫秒，摊在十几秒的建关里没有存在感。
  for (const objective of field.objectives || []) {
    grid.FieldFor(objective.x, objective.z, true);
  }
  return grid;
}

/** 浮尘只罩玩家附近那一片：切片最大的一关跨两公里，按整片铺会摊薄到看不见。 */
function DustBox(phase) {
  const z0 = phase.zones[0];
  return new THREE.Box3(
    new THREE.Vector3(z0.x - 150, -6, z0.z - 150),
    new THREE.Vector3(z0.x + 150, 22, z0.z + 150));
}

/** 换关时把整片切片以外的东西也清干净：兵、尸体、烟柱、在途弹。 */
// ---------------------------------------------------------------------------
// 摆点道具（集成批 INT2）
//
// 布设那一层是**建场时**按世界坐标铺的，同一只米袋在三关里在同一个位置 ——
// 它表达不了「同一个院子在三章里越来越破」（§0 三个功能院落的环境递进）。
// 所以这里另有一条**运行时**的轻量摆件口：几块带贴图的板子、几只箱子、
// 一副盖白布的门板担架。
//
// 三条硬约束（越界就该改成布设层的活）：
//   · **不进碰撞、不进导航、不进流送、不进烘焙** —— 它们是看的，不是撞的；
//   · 每件一次 draw call，一章不许超过十来件（开机红线 drawCalls ≤ 5000 有余量，
//     但一章几百件就该走 Script_ExternalProps 的实例化那条路）；
//   · 换关一把清掉（ClearRuntime）。
// ---------------------------------------------------------------------------

/** 这一关摆的运行时道具：id -> { root, spec }。 */
const setpieceProps = new Map();
/** 贴图只读一次：同一张纸在一章里可能挂三块板子。 */
const setpiecePropTextures = new Map();

function SetpiecePropTexture(path) {
  if (setpiecePropTextures.has(path)) return setpiecePropTextures.get(path);
  const texture = new THREE.TextureLoader().load(path);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  setpiecePropTextures.set(path, texture);
  return texture;
}

/**
 * 摆一件运行时道具。
 *
 * kind：
 *   panel        立着的一块带贴图的平面（信纸、底稿、报纸）
 *   plane        平躺的一块带贴图的平面（摊在桌上的纸）
 *   box          一只箱子（烧黑的弹药箱、药箱）
 *   shroudedBody 盖白布的门板担架（五关 A 区那一副）
 *   crate/stretcher/debris  box 的几个别名，只是默认尺寸与颜色不同
 */
function MakeSetpieceProp(spec = {}) {
  if (!scene || !spec || !spec.position) return null;
  const id = String(spec.id || `sp${setpieceProps.size}`);
  if (setpieceProps.has(id)) return id;
  const kind = spec.kind || "box";
  const whiteboxColors = PHASE_TABLE[state.phaseIndex]?.whitebox?.p012
    ? PHASE_TABLE[state.phaseIndex].whitebox.layout.semanticColors : null;
  const at = spec.position;
  const y = Number.isFinite(at.y) ? at.y : (battlefield ? battlefield.GroundHeight(at.x, at.z) : 0);
  let mesh = null;
  if (kind === "panel" || kind === "plane") {
    const size = spec.size || [0.28, 0.20];
    const geometry = whiteboxColors ? new THREE.BoxGeometry(size[0], size[1], 0.015) : new THREE.PlaneGeometry(size[0], size[1]);
    const material = new THREE.MeshStandardMaterial({
      map: !whiteboxColors && spec.texture ? SetpiecePropTexture(spec.texture) : null,
      color: whiteboxColors?.missionRoute ?? spec.color ?? 0xece0c4, roughness: 1.0, metalness: 0,
      side: THREE.DoubleSide, transparent: !!spec.transparent,
    });
    mesh = new THREE.Mesh(geometry, material);
    // plane 是摊着的（纸在桌上），panel 是立着的（贴在墙上/靠着箱子）。
    if (kind === "plane") mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(at.x, y + (kind === "plane" ? 0.92 : 1.15), at.z);
  } else {
    const size = spec.size
      || (kind === "shroudedBody" ? [0.62, 0.26, 1.92]
        : kind === "stretcher" ? [0.58, 0.14, 1.85]
          : kind === "debris" ? [0.9, 0.22, 0.7] : [0.72, 0.42, 0.48]);
    const geometry = new THREE.BoxGeometry(size[0], size[1], size[2]);
    const material = new THREE.MeshStandardMaterial({
      color: whiteboxColors && kind !== "shroudedBody" && kind !== "stretcher"
        ? whiteboxColors[kind === "debris" ? "ground" : "missionRoute"]
        : spec.color ?? (kind === "shroudedBody" ? 0xd8d2c4 : 0x6b5a41),
      roughness: 1.0, metalness: 0,
    });
    mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(at.x, y + size[1] / 2 + (kind === "shroudedBody" ? 0.34 : 0), at.z);
  }
  mesh.rotation.y = Number(spec.rotationY) || 0;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.name = `Setpiece_${id}`;
  scene.add(mesh);
  setpieceProps.set(id, { root: mesh, spec });
  return id;
}

/** 逐帧挪一件运行时道具（抬着走的担架）。传世界坐标的**中心点**与朝向。 */
function MoveSetpieceProp(id, at = {}) {
  const entry = setpieceProps.get(String(id));
  if (!entry || !entry.root) return false;
  if (Number.isFinite(at.x)) entry.root.position.x = at.x;
  if (Number.isFinite(at.y)) entry.root.position.y = at.y;
  if (Number.isFinite(at.z)) entry.root.position.z = at.z;
  if (Number.isFinite(at.rotationY)) entry.root.rotation.y = at.rotationY;
  if (Number.isFinite(at.rotationZ)) entry.root.rotation.z = at.rotationZ;
  return true;
}

/** 改一件道具的状态。现在只有一档：`removed`（三关拆下来的那几块门板）。 */
function SetSetpiecePropState(id, next) {
  const entry = setpieceProps.get(String(id));
  if (!entry) return false;
  if (next === "removed") entry.root.visible = false;
  else if (next === "shown") entry.root.visible = true;
  entry.state = next;
  return true;
}

/** 换关：一件不留。贴图缓存留着（同一张纸下一关还会用）。 */
function ClearSetpieceProps() {
  for (const entry of setpieceProps.values()) {
    if (entry.root) {
      scene.remove(entry.root);
      entry.root.geometry?.dispose();
      entry.root.material?.dispose();
    }
  }
  setpieceProps.clear();
}

function ClearRuntime() {
  meleeQte?.Cancel("levelChange");
  // 摆点层：交互点、后送队、计时器与运行时道具全按关摆，一律清掉。
  // **缺席宣告不在这里清**（那在 companion 手里，是剧情事实不是关卡状态）。
  setpieces?.Reset("levelChange");
  ClearSetpieceProps();
  for (const wall of state.firewalls) {
    for (const handle of wall.smoke) vfx?.RemoveSmokeSource(handle);
  }
  state.firewalls.length = 0;
  scriptInvulnUntil = 0;
  hud?.SetMeleeQte(null);
  // 负重与交互点都是**按关摆的**：不清的话上一关抬着的担架会跟到下一关，
  // 上一关的交互点会在新切片的同一坐标上悄悄复活。
  carry?.Reset("levelChange");
  // 扫射航线也是按关摆的：不清的话上一关那条航线会带着白名单飞进下一关。
  strafe?.Reset("levelChange");
  // 照明弹同理，而且**它还欠着 AI 一笔账**：Reset 会把发现距离倍率还原成 1。
  // 不还的话下一关一进去满场 2.4 倍视距，表现成「敌人隔着两百米就开火」。
  flare?.Reset("levelChange");
  // 发的那封电报也不许跨关：底噪要停，报码纸要收。
  telegraph?.Reset("levelChange");
  // 具名同伴按关摆：不清的话上一关那几个人会连着 handle 一起留到下一关，
  // 而 ai.Dispose 已经把兵表清空了 —— Locate 会指着一具不存在的 soldier。
  // **缺席宣告（罗班长四关牺牲）不在这里清**，那是剧情事实不是关卡状态。
  companion?.Reset("levelChange");
  // 检查点环里的坐标是上一关切片的：倒到这一关就是穿墙。
  checkpoint?.Reset("levelChange");
  interact?.Clear();
  // 机枪位同理：它的世界模型也要拆，不然下一关的同一坐标上会多出一挺枪。
  emplacement?.Clear();
  for (const view of emplacementViews.values()) if (view.root) scene.remove(view.root);
  emplacementViews.clear();
  debugEmplacedFire = false;
  carryHidGun = false;
  hud?.SetCarry(null);
  hud?.SetEmplacement(null);
  hud?.SetTelegraph(null);
  hud?.SetInteractProgress(null);
  for (const handle of state.smokeHandles) vfx.RemoveSmokeSource(handle);
  state.smokeHandles.length = 0;
  if (ai) ai.Dispose();
  if (combat) combat.ClearProjectiles();
  if (combat && combat.incoming) combat.incoming.length = 0;
}

/**
 * 进一章。**这是异步的** —— 建一片切片要分帧走完，不然主线程会卡死几秒，
 * 浏览器直接判成无响应。期间 state.ready = false，Frame() 只走渲染。
 *
 * **过场承载章（phase.cutsceneOnly，现在只有序章）**走一条短路：
 * 播完 cutsceneIn 就直接接下一章，中间**不建切片、不撒兵、不 Respawn**——
 * 车厢是过场自带的 standalone 布景，底下铺的是哪一片它不关心，
 * 而重建一片要十几秒，纯属让玩家对着加载条等一场自己不需要的场景。
 * （开机直跳 ?phase=0 那一支例外：那时 Boot 已经按 fieldFrom 建好了地皮，
 * 引擎要有个地方站，所以 initial 分支照常 Respawn。）
 *
 * @param {number} index
 * @param {object} opts initial 开机那一次（战场已经建好，别重建）；
 *                      cutscenes 要不要播过场（出图与自检模式一律不播，保证镜头可复现；
 *                      过场的临时布景有近三百个网格，另在过场检查里验）
 */
async function EnterLevel(index, { initial = false, cutscenes = !SHOT } = {}) {
  state.advancing = true;
  state.phaseIndex = Clamp(index, 0, PHASE_TABLE.length - 1);
  const phase = PHASE_TABLE[state.phaseIndex];
  const cutsceneOnly = !!phase.cutsceneOnly;

  // --- 关前过场 ---
  // 盖加载画面：关前过场的布景是当场建的，预热要几秒（序章那一场最重）。
  if (cutscenes && phase.cutsceneIn) await RunCutscene(phase.cutsceneIn, { loading: true });

  if (!initial && !cutsceneOnly) {
    state.ready = false;
    ShowBoot(true);
    bootStart.disabled = true;
    bootStart.textContent = "……";
    ClearRuntime();
    await BuildField(phase, SetBootStep, 0, 1);
    navGrid = MakeNavGrid(battlefield);
    destruction.SetWorld(battlefield, physics, navGrid);
    ai.ctx.battlefield = battlefield;
    ai.ctx.physics = physics;
    ai.ctx.nav = navGrid;
    ai.insideWalls = levelBounds;
    combat.host.battlefield = battlefield;
    combat.host.physics = physics;
    player.AttachPhysics(physics);
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
  state.objectiveBlockedReason = null;
  state.objectiveCount = phase.zones.length;
  state.levelSeconds = phase.minutes * 60;
  // 钉关：章节数据声明 mechanics.pinFinalZone 的，走到最后一个路标不自动换关。
  state.pinFinalZone = !!(phase.mechanics && phase.mechanics.pinFinalZone);
  state.chapterReleased = false;
  state.chapterReleaseAt = 0;
  // 「城里还站着的人」按剧本给的曲线走。**不做橡皮筋补给** ——
  // 这座城里没有后方，数字只会往下走（序章那一章不耗，见 Data_MissionCh0 的曲线注释）。
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
  const preset = sky.Apply(phase.sky);
  sky.BakeEnvironment(scene);
  lights.ApplyPreset(preset, sky.sunDirection);
  if (gi) gi.ApplyPreset(preset, graphics.giStrength);
  hud.SetPhase(phase);
  hud.ShowBrief(phase);
  // 环境档通常与天空档同名，直接把 phase.sky 递进去。
  // 旧写法是 night/dawn 之外一律「battle」，于是「烟尘白天」和「烧着的街」
  // 共用一档 —— 第三关满街在烧却听不见火，就是这么丢的。
  // 两者不同名的章（序章的天是 chuchuanDay、环境是车厢内）由数据层显式给 ambience。
  audio.Ambience(phase.ambience || phase.sky);
  // 音乐按关走。上一版整场只有结局那一下会响 —— 四个 cue 里三个从来没进过游戏。
  audio.Music(phase.music);

  // 测试白盒拥有独立的场地 id，但剧情、同伴与事件必须跑正式第一章内容。
  const contentId = PhaseContentId(phase);
  const loaded = story.BeginLevel(contentId, { beats: phase.whitebox?.storyBeats,
    actualEventsOnly: phase.whitebox?.actualEventsOnly });
  state.storyObjective = phase.objectives[0] || null;
  if (loaded === 0) console.warn("这一章没有剧本：", phase.id);

  // 过场承载章：不 Respawn、不撒兵、不挂烟柱 —— 车厢是过场自带的布景，
  // 底下那片地皮上不该有一条战线在后台开火消耗票池。
  if (!cutsceneOnly || initial) RespawnPlayer(true);
  // 具名同伴**排在撒兵之前**：SeedSoldiers 的 CountNear("nra",40) 与
  // CountSide("nra") 都会把他们数进去，于是撒兵自动少撒同样多 ——
  // 场上活人总数一个没多，开机红线（drawCalls / triangles）不受影响。
  // 名册默认从本章 beats 的 who 推导（该章说过话的战斗员自动在场），INT2 按章精修。
  if (!RANGE && !MELEE_TEST && !PREVIEW && !cutsceneOnly && companion) {
    companion.BeginLevel(contentId, {
      // 名册**优先走章节数据点名**（INT2 起七章都写了 roster）；没写才由 beats 推。
      // 推导只收「该章说过话的战斗员」—— 军医、参谋、师长这些 combatant:false 的人
      // 一律推不出来，终章更是推出一张空表（两个说话的人都不是战斗员）。
      roster: phase.roster || phase.level?.roster || undefined,
      beats: phase.level?.beats || [], zones: phase.zones,
      // 这一章玩家演的是谁 —— 他不进名册（终章玩家就是小秦，而小秦在终章话最多）。
      playerCast: phase.playerCast || phase.level?.playerCast || undefined,
    });
    if (phase.whitebox?.p012) {
      for (const actor of ai.soldiers) if (actor.alive && actor.castId) actor.scriptEssential = true;
      const guide = companion.Handle("luo");
      if (guide) {
        const x = -66, z = 61, y = battlefield.GroundHeight(x, z);
        guide.position.set(x, y, z); guide.body?.Teleport(x, y, z); guide.goal.set(x, 0, z);
      }
    }
  }
  // 章节摆点：**排在具名同伴之后**（罗班长要先站出来，摆点层才拿得到他的句柄），
  // 也排在 SeedSoldiers 之前（后送队要从 nra 名额里出人，撒兵才会自动少撒同样多）。
  // 靶场／白刃训练场／预览／过场承载章都不摆；第一关白盒有正式第一章内容。
  if (!RANGE && !MELEE_TEST && !PREVIEW && !cutsceneOnly && setpieces) {
    setpieces.BeginLevel(contentId, phase);
  }
  interact.Clear("P012");
  p012Runtime = phase.whitebox?.p012 ? new FirstLevelP012Runtime({
    SpawnEnemy: (spec) => {
      const actor = ai.Spawn("ija", spec.x, spec.z, spec);
      if (actor && spec.p012Far) {
        actor.scriptDefensive = true;
        actor.order = "hold"; actor.holdZone = { id: "P012SouthBlockade", x: spec.x, z: spec.z, radius: 2 };
        actor.goal.set(spec.x, 0, spec.z);
      }
      return actor;
    },
    GuideActor: () => companion?.Handle("luo"), Position: (actor) => actor?.position ? { x: actor.position.x, z: actor.position.z } : null,
    RestorePlayer: (point) => { player.Spawn(point.x,point.z,point.yaw);player.stance=point.stance;return true; },
    Signal: (name) => story.Signal(name),
    VisibleAircraft: (origin, air) => {
      const target = new THREE.Vector3(air.x, air.y, air.z), screen = target.clone().project(camera);
      if (Math.abs(screen.x) > 1 || Math.abs(screen.y) > 1 || screen.z < -1 || screen.z > 1) return false;
      const ray = target.sub(origin), distance = ray.length();
      const hit = battlefield.Raycast(origin, ray.normalize(), distance);
      return !hit || hit.t >= distance - 0.6;
    },
    Alive: (actor) => !!actor?.alive, Firing: (actor) => actor?.alive && ai.time - actor.lastFire < 4,
    CombatTime: () => ai.time,
    ThreatensEscort: (actor) => {
      const target=actor.target;
      if (!target || !actor.targetVisible || (!target.isPlayer && target.ref?.side !== "nra")) return false;
      const at=target.position;
      const nearby=[player.position,...(setpieces?.mem?.column?.Bearers || []).filter(member=>member.handle?.alive).map(member=>member.handle.position)];
      return !!at && nearby.some(point=>Math.hypot(point.x-at.x,point.z-at.z)<=12);
    },
    PursuitGoal: (actor, point) => {
      actor.scriptDefensive = false; actor.scriptArrivalRadius = 0.3;
      actor.order = "hold"; actor.holdZone = { id: "P012RetreatPursuit", ...point, radius: 0.3 };
      actor.goal.set(point.x, 0, point.z);
    },
    EnemyMgSuppressed: () => ai.soldiers.some((actor) => actor.side === "ija" && actor.weaponId === "Type11" && (actor.suppression > 0.3 || !actor.alive)),
    FriendlyMgFired: (since) => ai.soldiers.some((actor) => actor.side === "nra" && actor.weaponId === "Zb26" && actor.lastFire > since),
    DeploySmoke: (point) => vfx.SmokeSource(new THREE.Vector3(point.x, 0.2, point.z), { kind: "screen", rate: 12, radius: 7.5, rise: 0.4, sizeStart: 3, sizeEnd: 6, life: 10 }),
    ClearSmoke: (handle) => vfx.RemoveSmokeSource(handle),
    FriendlyActors: () => ai.soldiers.filter((actor) => actor.side === "nra" && actor.alive && !actor.unarmed),
    RetreatPosition: () => setpieces?.mem?.column?.Bearers?.[0]?.handle?.position || null,
    FireDiscipline: (actor, doctrine) => {
      if (doctrine) { actor.scriptAccuracyScale=doctrine.accuracyScale; actor.scriptFireIntervalScale=doctrine.fireIntervalScale; }
      else { delete actor.scriptAccuracyScale; delete actor.scriptFireIntervalScale; }
    },
    Defend: (actor, point, doctrine) => {
      if (!doctrine) return;
      actor.scriptDefensive = true; actor.scriptAccuracyScale = doctrine.accuracyScale;
      actor.scriptFireIntervalScale = doctrine.fireIntervalScale;
      actor.order = "hold"; actor.holdZone = { id: "P012FrontDefense", ...point, radius: doctrine.holdRadiusM };
      actor.goal.set(point.x, 0, point.z);
    },
    ReleaseDefense: (actor) => {
      actor.scriptDefensive = false; delete actor.scriptAccuracyScale; delete actor.scriptFireIntervalScale;
      actor.holdZone = null; actor.order = "advance";
    },
    Visible: (actor) => {
      const point = actor.position.clone(); point.y += 1.3;
      const screen = point.project(camera);
      return Math.abs(screen.x) < 0.95 && Math.abs(screen.y) < 0.95 && screen.z > -1 && screen.z < 1
        && HasLineOfSight(actor.position.x, actor.position.z);
    },
    ReleaseGuide: (actor) => { if (actor) { actor.p012Guided = false; delete actor.scriptMoveSpeedMps; actor.manualGoalUntil = ai.time; } },
    TrafficActor: (side, slot, point) => {
      if (side === 0) return ai.soldiers.filter((actor) => actor.side === "nra" && actor.alive && !actor.castId && !actor.unarmed)[slot] || null;
      return setpieces.host.SpawnActor({ label: "向南转移的乡亲", x: point.x, z: point.z, weapon: null, civilian: true, variant: slot % 2 ? "female" : "male", role: "civilian", squadId: "P012Traffic" });
    },
    Signalled: (name) => story.Signalled(name),
    Dodge: (reason) => strafe?.Dodge(reason),
    ReleaseForDodge: () => { carry?.ForceRelease("diveAttempt"); if (setpieces) setpieces.mem.p012ReleaseAt = { ...player.position }; },
    Move: (actor, point, speed) => { actor.p012Guided = true; actor.scriptMoveSpeedMps = speed; actor.order = "advance"; actor.holdZone = null; actor.manualGoalUntil = ai.time + 3; actor.goal.set(point.x, 0, point.z); },
    WarnShell: (point, damaging, OnImpact) => {
      const at = new THREE.Vector3(point.x, battlefield.GroundHeight(point.x, point.z), point.z);
      if (damaging) { const impact = combat.CallIncoming("launcher", at, { OnImpact }); return { x: impact.x, z: impact.z }; }
      vfx.IncomingMarker(at, 1.6); audio.Play("shellIncoming", { position: at }); return point;
    },
    ImpactShell: (point) => { const at = new THREE.Vector3(point.x, battlefield.GroundHeight(point.x, point.z), point.z); vfx.Explosion(at, { radius: 4, kind: "shell" }); audio.Play("explosionNear", { position: at }); },
  }, phase.whitebox) : null;
  p012Runtime?.SaveSafePoint("Start",player.position,player.stance,player.yaw);
  p012Flow = phase.whitebox?.p012 ? new FirstLevelP012Director({
    Register: (spec) => interact.Register({ ...spec, tag: "P012" }),
    Carry: () => carry,
    Signal: (name) => story.Signal(name),
    Signalled: (name) => story.Signalled(name),
    Objective: (text) => { state.storyObjective = text; },
    CheckWeapon: () => { state.clips = Math.max(state.clips, 3); if (!p012Runtime.weaponActionCount) state.ammo = 0; },
    CurrentClips: () => state.clips,
    GiveBandages: (request) => {
      const granted = Number.isFinite(request) ? Math.max(0, Math.floor(request)) : 0;
      player.bandages += granted;
      if (granted) hud.Hint(`补充${granted}包绷带；受伤流血时按 B 包扎`, 4);
      return granted;
    },
    GiveGrenades: (request) => { const granted = Number.isFinite(request) ? Math.max(0, Math.floor(request)) : 0; state.grenades += granted; return granted; },
    DeployRetreatSmoke: (point) => p012Runtime.DeployRetreatSmoke(point),
    GiveClips: (request) => {
      const granted = Number.isFinite(request) ? Math.max(0, Math.floor(request)) : 0;
      state.clips += granted;
      return granted;
    },
    Checkpoint: (id) => { p012Runtime.SaveSafePoint(id,player.position,player.stance,player.yaw);return checkpoint?.Save(); },
    RestoreSignals: (signals) => {
      story.pushed = new Set(signals); story.cued.clear();
      battlefield.RestoreScenario?.({ signalled: (name) => story.Signalled(name) });
    },
    SpawnEnemy: (spec) => p012Runtime.SpawnEnemy(spec),
    Guide: (spec) => p012Runtime.Guide(spec),
    EnemyPosition: (soldier) => soldier?.alive ? soldier.position : null,
    EnemyCombatState: (soldier) => soldier ? {lastFire:soldier.lastFire,suppression:soldier.suppression} : null,
    EnemyStaging: (soldier, staging) => {
      if (!soldier?.alive) return;
      soldier.scriptedNoncombatant = !!staging;
      if (staging) { soldier.target = null; soldier.targetVisible = false; soldier.cover = null; soldier.state = "advance"; }
    },
    EnemyGoal: (soldier, point, arrivalRadius) => {
      soldier.order = "hold";
      if (Number.isFinite(arrivalRadius) && arrivalRadius > 0) soldier.scriptArrivalRadius = Math.min(1, arrivalRadius * 0.5);
      else delete soldier.scriptArrivalRadius;
      soldier.holdZone = { id: "P012Lane", x: point.x, z: point.z, radius: soldier.scriptArrivalRadius ?? 1 };
      soldier.goal.set(point.x, 0, point.z);
    },
    Pressure: (wave) => {
      if (wave.kind === "mortar") p012Runtime.Shelling({ x: player.position.x, z: player.position.z }, true);
    },
    Shelling: (point) => {
      p012Runtime.Shelling(point);
    },
  }, phase.whitebox) : null;
  if (p012Flow) state.storyObjective = p012Flow.CurrentObjective().text;
  // 靶场撒的是木桩兵，不是战线；同时钉住本关 —— 站遍三个工位不许触发换关结算。
  if (RANGE) { state.pinned = true; SeedRangeTargets(); }
  else if (MELEE_TEST) { state.pinned = true; SeedMeleeTargets(); }
  else if (FIRST_LEVEL_WHITEBOX || FIRST_LEVEL_P012_WHITEBOX) { state.pinned = true; SeedSoldiers(phase); }
  else if (!PREVIEW && !cutsceneOnly) SeedSoldiers(phase);
  SeedSmokeColumns(phase);
  // 进关先打一个检查点：第一拍就被击倒时也有地方可退。
  checkpoint?.Reset("enterLevel");
  checkpoint?.Save();

  if (!initial) {
    ShowBoot(false);
    bootStart.textContent = SHOT ? "（出图模式）" : (PREVIEW ? "播放序章" : "进 城");
  }
  // 这一片切片是哪一章的。菜单靠它决定用哪一组机位，StartLevel 靠它决定要不要重建。
  // **借片的章不改它**：地皮还是上一次建的那一片，改了菜单会去取一组不存在的机位。
  if (!cutsceneOnly || initial) state.builtPhase = state.phaseIndex;
  state.ready = true;
  state.advancing = false;
  // 过场承载章的收尾：过场播完就接下一章。放在 advancing 清掉之后 ——
  // AdvanceLevel 开头那道 `if (state.advancing) return` 会把它整个吞掉。
  // 出图/自检（cutscenes=false）不接，那两条路要的是「停在这一章可复现」。
  if (cutsceneOnly && cutscenes && !initial && state.phaseIndex < PHASE_TABLE.length - 1) {
    return AdvanceLevel({ cutscenes });
  }
  return state.phaseIndex;
}

/**
 * 预编译一棵子树的着色器 —— **进序章那十几秒的黑屏就是这一步**。
 *
 * 车厢序章的布景一口气往场景里加三千多个网格、几十种新材质。three 是惰性编译的：
 * 这些 program 要到**第一次被渲染时**才链接，而 program 一链接就要同步问驱动
 * 「链好了没」（profile 里那条 14.6 s 的长任务，九成时间在 getProgramParameter）。
 * 表现就是玩家点完「序章」以后画面整个冻住十几秒，没有进度条、连加载画面都没有，
 * 而这期间浏览器随时会判成无响应。
 *
 * 这里把那笔账**提前、摊开、放到加载画面背后**，分四段（见下面每段的抬头）：
 * 提交编译 → 重编场上原有材质 → 按批真画出来 → 放出剩下的网格，每段之间让一帧，
 * 进度条真的在动，而不是钉在一格上等十几秒。实测（RTX 4070 SUPER / 序章）
 * 总时长 14.6 s → 17.3 s，而最长的一次冻结 14.6 s → 2.8 s。
 *
 * **调用期间必须 state.warming = true**：这几帧是这里自己在按批出画的，
 * 主循环不许再插一帧进来 —— 那一帧看得见所有东西，等于把整笔账一口气付掉。
 *
 * 完整口径（含为什么只 `compile` 主 pass 不够、两条会让预热白做的坑）：
 * `docs/Data_TechRenderPipeline.md` §16。
 *
 * @param {THREE.Object3D|null} root 要预热的子树
 * @param {(label: string, progress: number) => void|null} onStep 进度回调（null = 不报）
 */
async function WarmupShaders(root, onStep = null, shouldStop = null) {
  if (!root) return 0;
  const meshes = [];
  root.traverse((object) => {
    if (object.isMesh || object.isPoints || object.isLine || object.isSprite) meshes.push(object);
  });
  if (!meshes.length) return 0;

  // 代表网格：同一个 program 只画一次。去重键是材质加上几条会进 program cache key
  // 的物体特征（蒙皮 / 实例化 / 顶点色）；键漏了某一维只意味着那个 program 退回
  // 老路（用到它的第一帧现编），不会出错。三千六百件收敛到三百来个代表。
  const seen = new Set();
  const picks = [];
  for (const object of meshes) {
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    let novel = false;
    for (const material of materials) {
      if (!material) continue;
      // 已经热着的跳过。判据与 three 自己在 setProgram 里的一样（有 currentProgram
      // 且版本没变）—— 只是个省事的过滤，漏判同样只是退回老路。
      const properties = renderer.properties.get(material);
      if (properties && properties.currentProgram && properties.__version === material.version) continue;
      const key = `${material.uuid}|${object.isSkinnedMesh ? 1 : 0}|${object.isInstancedMesh ? 1 : 0}`
        + `|${object.geometry?.attributes?.color ? 1 : 0}`;
      if (seen.has(key)) continue;
      seen.add(key);
      novel = true;
    }
    if (novel) picks.push(object);
  }
  if (!picks.length) return 0;

  // 藏起来用的是**层**不是 visible：visible 是层级的（父物体一藏，整棵子树连同
  // 想画的那件一起没了），layers 是逐物体的 —— projectObject 照样往下走。
  // 空层同时把灯也排除掉（灯都在 0 层），这一件的阴影 pass 跟着一起跳过。
  const HIDDEN_LAYER = 31;
  const masks = new Map(meshes.map((object) => [object, object.layers.mask]));
  for (const object of meshes) object.layers.set(HIDDEN_LAYER);

  // 每次让帧都问一句还要不要继续：玩家在预热里按了 Esc（Skip 会放开 held）、
  // 这一场已经收了、或者换了一场 —— 就地收工，剩下的照旧退回「用到时现编」。
  const Yield = async () => {
    await NextFrame();
    return !(shouldStop && shouldStop());
  };

  try {
    // --- 一、提交编译 -------------------------------------------------------
    // renderer.compile 是同步的（ANGLE 在这一步做 HLSL 翻译），整包一次交上去就是
    // 四五秒的长任务；分批交、批间让一帧，进度条才动得起来。交完不等它链完 ——
    // 链接在驱动的编译线程上继续跑，第三段出画时正好陆续到货。
    const SUBMIT = 16;
    for (let i = 0; i < picks.length; i += SUBMIT) {
      const proxy = new THREE.Group();
      // 代理组只借 children 走一趟 traverse，**不进场景树**，也不动这些网格的
      // parent —— compile 只读不写，这一层是安全的。
      proxy.children = picks.slice(i, i + SUBMIT);
      try {
        renderer.compile(proxy, camera, scene);
      } catch (error) {
        console.warn("[Main] 着色器提交编译失败（退回逐帧编译）", error);
        break;
      }
      const submitted = Math.min(picks.length, i + SUBMIT);
      onStep?.(`提交着色器…… ${submitted}/${picks.length}`, 0.05 + 0.3 * (submitted / picks.length));
      if (!await Yield()) return picks.length;
    }

    // --- 二、场上原有材质的重编 ---------------------------------------------
    // 过场一开场就换天光（Play 里 applySky 排在建布景之前），场上那座城的材质整批
    // 作废要重编。这笔账与新布景无关，却同样落在「进过场」这一下，而且是最大的一
    // 块（实测六七秒）。同样按批放出来摊平；八批就够 —— 城里上万件，逐件跑的开销
    // 比它省下的还大。累加式放出，最后一批放完城就是完整的一座。
    const outside = [];
    scene.traverse((object) => {
      if (!(object.isMesh || object.isPoints || object.isLine || object.isSprite)) return;
      if (!masks.has(object)) outside.push(object);
    });
    const outsideMasks = new Map(outside.map((object) => [object, object.layers.mask]));
    for (const object of outside) object.layers.set(HIDDEN_LAYER);
    try {
      const SLICES = 8;
      const size = Math.ceil(outside.length / SLICES) || 1;
      for (let i = 0; i < outside.length; i += size) {
        for (const object of outside.slice(i, i + size)) object.layers.mask = outsideMasks.get(object);
        RenderScene(0);
        const shown = Math.min(outside.length, i + size);
        onStep?.(`重编场景光照…… ${Math.ceil(shown / size)}/${SLICES}`, 0.35 + 0.2 * (shown / outside.length));
        if (!await Yield()) return picks.length;
      }
    } finally {
      for (const object of outside) object.layers.mask = outsideMasks.get(object);
    }

    // --- 三、出画落实 -------------------------------------------------------
    // **只提交主 pass 是不够的**：深度法线预通道、阴影、渲到浮点靶的那几套变体
    // 都是另外的 program，只有真画一帧才会被建出来 —— 实测只做第一段的话，
    // 第一帧照样冻十几秒（profile 落在 setProgram → getUniforms → onFirstUse）。
    //
    // 一批画多少件按上一批的结果收放：建出了新 program 的收到一件（一个 program
    // 三五百毫秒，几件挤进同一帧就是好几秒的冻结），纯命中缓存的一路翻倍放开
    // （那种一批只要几毫秒，逐件跑三百趟纯属白等）。
    let chunk = 2;
    let done = 0;
    while (done < picks.length) {
      const batch = picks.slice(done, done + chunk);
      const culled = batch.map((object) => object.frustumCulled);
      for (const object of batch) {
        object.layers.mask = masks.get(object);
        // 视锥剔除会把没进画面的整批跳过 —— 跳过就没编，账原封不动留给后面某一镜。
        // 这一步要的是把 program 逼出来，不是把画面画对。
        object.frustumCulled = false;
      }
      const started = performance.now();
      const had = renderer.info.programs.length;
      RenderScene(0);
      const cost = performance.now() - started;
      const born = renderer.info.programs.length - had;
      for (let k = 0; k < batch.length; k += 1) {
        batch[k].layers.set(HIDDEN_LAYER);
        batch[k].frustumCulled = culled[k];
      }
      done += batch.length;
      if (born) chunk = 1;
      else if (cost < 30) chunk = Math.min(32, chunk * 2);
      onStep?.(`预热材质…… ${done}/${picks.length}`, 0.55 + 0.35 * (done / picks.length));
      if (!await Yield()) return picks.length;
    }

    // --- 四、把剩下的网格放出来 ---------------------------------------------
    // 上面只画了代表件，另外三千多件的顶点/索引缓冲一次都还没传上去 —— 全堆在
    // 第一帧就是一秒半的卡顿。缓冲上传比编译便宜得多，按大批累加放出来即可；
    // 最后一批放完场上就是完整的一套，正好当收尾的兜底帧。
    const REVEAL = 256;
    for (let i = 0; i < meshes.length; i += REVEAL) {
      for (const object of meshes.slice(i, i + REVEAL)) object.layers.mask = masks.get(object);
      RenderScene(0);
      const shown = Math.min(meshes.length, i + REVEAL);
      onStep?.(`载入网格…… ${shown}/${meshes.length}`, 0.9 + 0.1 * (shown / meshes.length));
      if (!await Yield()) return picks.length;
    }
  } finally {
    for (const object of meshes) object.layers.mask = masks.get(object);
  }
  onStep?.("就绪", 1);
  return picks.length;
}

/** WarmCutscene 的场次号（见那里的注释）。 */
let warmSeq = 0;

/**
 * 过场开演前的预热：布景已经建好（Play 的 hold 把时间轴按在 0），
 * 这里把它的着色器编出来再放行。
 *
 * `loading = true` 时把加载画面盖上去 —— 从菜单进的那几条（战役入口、选章、
 * 过场预览）要等好几秒，那几秒必须有进度条；关中过场不盖，那条路上不该弹出加载页。
 */
async function WarmCutscene({ loading }) {
  // 谁是**当前**这一场的预热。上一场被 Esc 掐掉、或者两场叠着来的时候，
  // 旧的那一趟还挂在 await 上；收工时它不许去动加载画面和 state.warming
  //（不然会把新一场的加载画面当场收掉）。
  const token = ++warmSeq;
  const id = cutscene.CurrentId;
  const savedLabel = bootStart.textContent;
  const savedDisabled = bootStart.disabled;
  if (loading) {
    ShowBoot(true);
    bootStart.disabled = true;
    bootStart.textContent = "……";
    SetBootStep("搭布景……", 0.1);
  }
  state.warming = true;
  try {
    await WarmupShaders(cutscene.SetRoot, loading ? SetBootStep : null,
      // 按 Esc 跳过（Skip 会放开 held）、这一场已经收了、或者换了一场 —— 都就地收工。
      () => warmSeq !== token || !cutscene.Playing || !cutscene.Held || cutscene.CurrentId !== id);
  } finally {
    if (warmSeq === token) {
      state.warming = false;
      if (loading) {
        ShowBoot(false);
        bootStart.textContent = savedLabel;
        bootStart.disabled = savedDisabled;
      }
    }
  }
}

/**
 * 播一场过场并等它播完（或被 Esc 跳过后卡片读完）。
 * 播过场期间玩家没有控制权，指针锁也要放掉 —— 不放的话鼠标还在转相机，
 * 而相机已经被过场接管，玩家会看到画面在自己抖。
 *
 * **开演前一定先预热着色器**（见 WarmCutscene）：布景是当场建的，不预热的话
 * 第一帧要同步编几十个 program，画面冻十几秒而时间轴照走。
 *
 * @param {string} id
 * @param {object} opts loading：预热那几秒要不要盖加载画面（关卡边界上的过场要）
 */
async function RunCutscene(id, { loading = false } = {}) {
  if (!cutscene) return null;
  // 出图与手动步进那两条路**不预热**：那里时钟是外面的（StepFrames 一调就推帧），
  // 按住时间轴等一段异步预热的话，出图脚本会对着停在第 0 秒的画面连拍 N 张。
  // 那两条路也不在乎卡顿，它们要的是可复现。
  const warm = !SHOT && !MANUAL_STEP;
  const pending = cutscene.Play(id, { poolOut: state.nraPool, neutralLook: SHOT, hold: warm });
  // 先挂一只空 catch：预热那几秒里若 Play 已经被别的场收掉（aborted），
  // 没人接的 rejection 会先被浏览器报成 unhandledrejection。真正的错还是从下面 await 抛。
  pending.catch(() => {});
  if (warm) {
    try {
      await WarmCutscene({ loading });
    } finally {
      cutscene.Release();
    }
  }
  const result = await pending;
  state.cutscenesPlayed.push({ id, skipped: !!result.skipped });
  // 新版序章的终点是一个可复现的交接提示，不是旧 L0 的开战入口。
  // 正常播完、Esc 跳过、失焦收口都只会经过这里一次。
  if (PREVIEW && id === PREVIEW_ID && !state.previewHandoffShown) {
    const task = "跟随通信排。";
    state.previewHandoffShown = true;
    state.previewHandoffCount += 1;
    state.storyObjective = task;
    hud.SetObjective(task, state.nraPool, null);
    hud.Say(null, task, 4.2, "objective");
    ShowPreviewTerminal(task);
    state.previewDone = true;
    state.previewPlaying = false;
    state.running = false;
    // 即使未来有人给预览页加了一个普通帧，也不能让旧 L0 的 AI 在片尾启动。
    if (ai) ai.Dispose();
    ReleasePointerLock();
  }
  return result;
}

/**
 * 播一场**关中**过场（`{type:"cutscene"}` beat 与 `story.Signal→过场` 的落点）。
 *
 * 与关首/关末过场走的是同一个 RunCutscene：夺控制权、掐战斗输入、放指针锁、
 * 收枪、播完还回来；Esc 跳过与字幕补卡的语义因此**天然一致**（同一个导演）。
 * Story 那边靠这个 Promise 停住剧本推进（见 StoryDirector.cutsceneHold）。
 *
 * 三种情况直接回 null 且不报错（都是正常状态，不许把一关卡死）：
 *   · 过场系统还没建起来（出图/预览的某些路径）；
 *   · 已经在播一场了（不许两场叠着播）；
 *   · 正在换关（镜头这时候归 AdvanceLevel）。
 */
function PlayMidCutscene(id) {
  if (!id || !cutscene) return null;
  if (cutscene.Playing || state.advancing) return null;
  if (!CUTSCENES[id]) { console.warn("没有这场关中过场：", id); return null; }
  return RunCutscene(id);
}

/** 章节钉住时，等这条信号才放行换关（名字见 Script_Story.CHAPTER_RELEASE_SIGNAL）。 */
const PIN_RELEASE_GRACE_S = 240;

/** 换下一关。关末过场 -> 下一关关前过场 -> 建切片。 */
async function AdvanceLevel(opts = {}) {
  if (state.advancing) return state.phaseIndex;
  // 走到这里就算这一关过了：菜单的「继续」与选章里的「已通过」都读这条
  Progress.MarkCleared(PHASE_TABLE[state.phaseIndex].id, state.phaseIndex);
  const phase = PHASE_TABLE[state.phaseIndex];
  const cutscenes = opts.cutscenes ?? !SHOT;
  state.advancing = true;
  // 关末那几条还没播的旁白先倒出来，别跟着关卡一起消失
  story.FlushTail();
  if (cutscenes && phase.cutsceneOut) await RunCutscene(phase.cutsceneOut, { loading: true });
  state.advancing = false;
  if (state.phaseIndex >= PHASE_TABLE.length - 1) { EndBattle("breakout"); return state.phaseIndex; }
  return EnterLevel(state.phaseIndex + 1, { cutscenes });
}

/** 调试口：直接跳到某一关（不播过场）。出图与自检走这条。 */
function JumpToLevel(index) {
  return EnterLevel(index, { cutscenes: false });
}

// ---------------------------------------------------------------------------
// 玩法测试靶场（?range=1）的木桩兵
//
// 木桩兵是**整具正式的 ija Actor**（骨骼、命中箱、倒地、准心识别全走原链路），
// 只是 s.dummy = true 让 AiDirector 跳过 Think —— 不索敌、不开火、不自行走位。
// 「打倒 → 停 RANGE_RESPAWN_S 秒 → 原位复立」由补兵那个 3 秒节拍顺带驱动。
// 取证口在 Debug.Range（见 window.Taierzhuang 装配处），口径在 docs/Data_TestRange.md。
// ---------------------------------------------------------------------------

/** 注册表：spec 是 Data_Range.RANGE_TARGETS 里那一条，soldier 是场上这一具。 */
const rangeTargets = [];
const rangeStats = { killed: 0, respawned: 0, resets: 0 };

function SpawnRangeTarget(spec) {
  const s = ai.Spawn("ija", spec.x, spec.z, {
    weapon: spec.weapon || "Type38", squadId: `Range_${spec.id}`,
  });
  if (!s) return null;
  s.dummy = true;
  s.order = "hold";
  s.holdZone = { id: `Range_${spec.id}`, x: spec.x, z: spec.z, radius: 2 };
  s.goal.set(spec.x, 0, spec.z);
  s.yaw = spec.yaw ?? Math.PI;          // 面朝工位（+Z）；朝向契约见 Data_Tengxian 头注
  s.lookYaw = s.yaw;
  return s;
}

function SeedRangeTargets() {
  rangeTargets.length = 0;
  for (const spec of RANGE_TARGETS) {
    rangeTargets.push({ spec, soldier: SpawnRangeTarget(spec), deadCounted: false });
  }
}

/** 每 3 秒被补兵节拍调一次：清点倒下的、到点的原位复立。 */
function MaintainRangeTargets() {
  for (const entry of rangeTargets) {
    const s = entry.soldier;
    if (s && s.alive) { entry.deadCounted = false; continue; }
    if (s && !s.alive && !entry.deadCounted) { entry.deadCounted = true; rangeStats.killed += 1; }
    if (s && !s.alive && s.deadTime < RANGE_RESPAWN_S) continue;
    if (s) ai.Remove(s);
    entry.soldier = SpawnRangeTarget(entry.spec);
    entry.deadCounted = false;
    if (entry.soldier) rangeStats.respawned += 1;
  }
}

// ---------------------------------------------------------------------------
// 白刃 QTE 测试章（?melee=1）的六具正式 Actor。前三具主动触发指定格挡，后三具
// 常态满足处决特殊条件；死亡仍走 Soldier.Kill，三秒后原位重建，方便连续比较。
// ---------------------------------------------------------------------------
const meleeTargets = [];
const meleeStats = { completed: 0, respawned: 0, resets: 0 };

function SpawnMeleeTarget(spec) {
  const soldier = ai.Spawn("ija", spec.x, spec.z, {
    weapon: "Type38", squadId: `MeleeQte_${spec.id}`,
  });
  if (!soldier) return null;
  soldier.dummy = true;
  soldier.bayonetFixed = true;
  soldier.qteTraining = { kind: spec.kind, pattern: spec.pattern, station: spec.station };
  soldier.order = "hold";
  soldier.holdZone = { id: `MeleeQte_${spec.id}`, x: spec.x, z: spec.z, radius: 1.5 };
  soldier.goal.set(spec.x, 0, spec.z);
  soldier.yaw = spec.yaw ?? Math.PI;
  soldier.lookYaw = 0;
  if (spec.kind === "execution") soldier.suppression = 0.84;
  return soldier;
}

function SeedMeleeTargets() {
  meleeQte?.Cancel("trainingReset");
  meleeTargets.length = 0;
  for (const spec of MELEE_QTE_TARGETS) {
    meleeTargets.push({ spec, soldier: SpawnMeleeTarget(spec), deadCounted: false });
  }
}

function MaintainMeleeTargets() {
  for (const entry of meleeTargets) {
    const soldier = entry.soldier;
    if (soldier?.alive) { entry.deadCounted = false; continue; }
    if (soldier && !entry.deadCounted) { entry.deadCounted = true; meleeStats.completed += 1; }
    if (soldier && soldier.deadTime < 3) continue;
    if (soldier) ai.Remove(soldier);
    entry.soldier = SpawnMeleeTarget(entry.spec);
    entry.deadCounted = false;
    if (entry.soldier) meleeStats.respawned += 1;
  }
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
 * 序章（过场承载章）与靶场不挂。
 */
function SeedSmokeColumns(phase) {
  for (const handle of state.smokeHandles) vfx.RemoveSmokeSource(handle);
  state.smokeHandles.length = 0;
  if (phase.cutsceneOnly || phase.sandbox) return;

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
    // 常驻烟柱是远方失火的方向提示，不是前景遮罩。密度保留可辨认的团絮和
    // 深色内芯，但不再叠成一块不透明黑布；摇摆与缓慢扩散来自上升气流。
    state.smokeHandles.push(vfx.SmokeSource({ x: o.x, y, z: o.z }, {
      kind: "black", rate: 10, radius: 0.72, rise: 3.0,
      sizeStart: 0.58, sizeEnd: 5.8, life: 8.0, opacity: 0.22, growthPower: 0.90, turbulence: 0.30,
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
 * 目标识别专用的临时向量。**一只都不许与别处共用** —— 通视钩子是在扫描中途
 * 被回调的，而 `player.EyePosition` 返回的是 Player 自己的 `_tmp`：
 * 扫描期间任何一处再读一次眼位，就会把这一轮的原点改掉。所以进来先 copy 一份。
 */
const _idFrom = new THREE.Vector3();
const _idDir = new THREE.Vector3();
const _idAim = new THREE.Vector3();
const _idEye = new THREE.Vector3();
/**
 * 从玩家眼位到某个落点的胸口（+1.3 m）有没有被静态碰撞体挡死。
 *
 * 为什么非加这一条：上一轮的验收指标是错的 —— "投影在视锥内 23 人"被当成达标，
 * 实测最近两名（15.3 m / 15.9 m）在木板围墙后、44.7 m 那名在砖墙后，
 * 六张正片里一共只出现一个人。而鲁南民居**对外不开窗、四面围墙**，
 * 随便撒一个点有一多半落在别人家院子里，玩家永远看不见。
 * 这里优先让已有的人落在真正看得见的位置，避免无意义地增加总兵力。
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
  const nraTarget = phase.whitebox?.p012
    ? Math.max(0, phase.whitebox.friendlyLimit - (ai.deaths.nra || 0)) : Math.round(SCALE.maxAlive * 0.42);
  const ijaTarget = Math.round(SCALE.maxAlive * 0.5 * phase.ijaPressure / 1.3);
  const firstContact = phase.whitebox?.firstContact || null;
  const enemyStage = phase.whitebox?.p012 ? "quiet" : !firstContact || state.phaseTime >= firstContact.fullWaveAtS
    ? "wave" : state.phaseTime >= firstContact.atS ? "scout" : "quiet";

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
  // 日军不是散兵抽签：按 13 人分队固定给一挺十一年式。这样每一波推进都能
  // 读出「步枪组压上、歪把子留在后面掩护」的编组，而不是一串完全相同的步枪兵。
  const lmgEvery = phase.ijaForce?.lmgEvery || IJA_SQUAD.size;
  const IjaWeaponAt = (ordinal) => (ordinal % lmgEvery === lmgEvery - 1 ? "Type11" : "Type38");

  // 重机枪是阵地火力，不该跟突击兵一起随机冲脸。每关按配置摆在纵深，
  // 用九二式真的开火；位置、数量是玩法推定，存在本身来自日方战详报。
  const hmgTeams = enemyStage === "wave" && phase.ijaSupport?.includes("hmg")
    ? (phase.ijaForce?.hmgTeams || 0) : 0;
  for (let i = 0; i < hmgTeams; i += 1) {
    const d = 105 + i * 26;
    const lateral = (i - (hmgTeams - 1) * 0.5) * 34;
    const at = {
      x: Clamp(px + ax * d - az * lateral, levelBounds.minX, levelBounds.maxX),
      z: Clamp(pz + az * d + ax * lateral, levelBounds.minZ, levelBounds.maxZ),
    };
    const open = FindOpenSpot(at.x, at.z, 12, 83011 + state.phaseIndex * 131 + i * 29, levelBounds);
    const s = ai.Spawn("ija", open.x, open.z, {
      weapon: "Type92Hmg", squadId: `Hmg_${phase.id}_${i}`,
    });
    if (s) {
      s.order = "hold";
      s.holdZone = { id: `Hmg_${phase.id}_${i}`, x: open.x, z: open.z, radius: 7 };
      s.goal.set(open.x, 0, open.z);
    }
  }

  // --- 近身班组：跟着你的班 -------------------------------------------------
  for (let i = CountNear("nra", 40); i < NEAR_SQUAD.nra
    && (!phase.whitebox?.p012 || ai.CountSide("nra") < nraTarget); i += 1) {
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
    const s = ai.Spawn("nra", open.x, open.z, {
      weapon: phase.whitebox?.p012 && !ai.soldiers.some((actor) => actor.side === "nra" && actor.weaponId === "Zb26") ? "Zb26" : undefined,
      towel: !!phase.nightRaid && rnd() < 0.55,
      squadId: `Near_${phase.id}`,
    });
    // 不给 holdZone：这一班是跟着镜头走的，钉在某个路标上就又跑没影了
    if (s) { s.holdZone = null; s.goal.set(px + ax * 15, 0, pz + az * 15); }
  }
  // --- 中景的敌人：压在你与下一个路标之间 -----------------------------------
  for (let i = CountNear("ija", 110); enemyStage === "wave" && i < NEAR_SQUAD.ija; i += 1) {
    let open = null;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const d = 45 + rnd() * 55;
      const lateral = (rnd() - 0.5) * 46;
      const spot = FindOpenSpot(px + ax * d - az * lateral, pz + az * d + ax * lateral, 8,
        65521 + i * 1361 + attempt * 29 + state.phaseIndex * 89, levelBounds);
      open = spot;
      if (HasLineOfSight(spot.x, spot.z)) break;
    }
    const s = ai.Spawn("ija", open.x, open.z, {
      weapon: IjaWeaponAt(i + hmgTeams),
      squadId: `Contact_${phase.id}`,
    });
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
    const s = ai.Spawn("nra", open.x, open.z, {
      towel: !!phase.nightRaid && rnd() < 0.55,
      squadId: `Defend_${phase.id}_${o.id}_${Math.floor(i / 6)}`,
    });
    if (s) { s.holdZone = o; s.goal.set(o.x, 0, o.z); }
  }
  // 首关开场不是“加载完四面已经在打”：先让玩家认路和认同伴，21.8 秒只亮出
  // 一名田坎侦察兵，30 秒才展开完整火力。时间来自 Notion 首关硬指标与 beats 同一拍。
  if (enemyStage === "quiet") return;
  if (enemyStage === "scout") {
    if (ai.CountSide("ija") === 0) {
      const scout = firstContact.scout;
      const open = FindOpenSpot(scout.x, scout.z, 4.5,
        19380315 + state.phaseIndex * 17, levelBounds);
      const soldier = ai.Spawn("ija", open.x, open.z, {
        weapon: scout.weapon || "Type38", squadId: `FirstContact_${phase.id}`,
      });
      if (soldier) {
        soldier.order = "hold";
        soldier.holdZone = { id: `FirstContact_${phase.id}`, x: open.x, z: open.z, radius: 5 };
        soldier.goal.set(open.x, 0, open.z);
      }
    }
    return;
  }
  // --- 日方：从战线前方 60—140 m 压上来 -------------------------------------
  // 写死一个方位（台儿庄那一版是"北面城门"）在这里行不通：
  // 东关是从东打过来、十字街是从西打过来、城墙那一关是从城外往墙上打。
  // 唯一稳定的是「他们在你与下一个路标的更前方」，所以就照这条撒。
  for (let i = ai.CountSide("ija"); i < ijaTarget; i += 1) {
    // 三成压到**纵深梯队**（140—360 m），其余仍是原来的 60—140 m。
    //
    // 为什么加这一档：撒兵原来只铺 60—140 m，实测三关**活着的日军没有一个超过
    // 132 m** —— 也就是说"看不见远处的日军"最后一段根本不是画不出来，是那里
    // 一个人都没有。而十字街那一关的机制本身就是一条 305 m 的通视走廊
    // （Data_Tengxian 的硬约束），八十米就到头的敌人等于把这条走廊作废了。
    //
    // 压力不会因此掉三成：远的那批是**朝你走过来的**，先当背景、后成压力，
    // 一波一波压上街的观感正是这一关要的。近端那七成一个没动。
    // 这一档现在也走完整 Actor：人物可见性是内容硬规则，性能按 5000 dc / 600 万面验，
    // 不能再以“画不起”为由让 140 m 外的活人从战场上消失。
    const wave = firstContact?.wave || null;
    const deepShare = wave ? Clamp(Number(wave.deepShare ?? 0), 0, 1) : 0.3;
    const deep = rnd() < deepShare;
    const nearMin = Number(wave?.minDistanceM ?? 60);
    const nearMax = Math.max(nearMin, Number(wave?.maxDistanceM ?? 140));
    const d = deep ? 140 + rnd() * 220 : nearMin + rnd() * (nearMax - nearMin);
    const lateralSpan = deep ? 130 : Number(wave?.lateralSpanM ?? 90);
    const lateral = (rnd() - 0.5) * lateralSpan;
    const at = {
      x: px + ax * d - az * lateral,
      z: pz + az * d + ax * lateral,
    };
    at.x = Clamp(at.x, levelBounds.minX, levelBounds.maxX);
    at.z = Clamp(at.z, levelBounds.minZ, levelBounds.maxZ);
    const open = FindOpenSpot(at.x, at.z, 14,
      90001 + i * 617 + state.phaseIndex * 43, levelBounds);
    const s = ai.Spawn("ija", open.x, open.z, {
      weapon: IjaWeaponAt(i + hmgTeams),
      squadId: `Attack_${phase.id}_${Math.floor(i / 6)}`,
    });
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
  const phase = PHASE_TABLE[state.phaseIndex];
  // 换人上来的是空手的：上一个人抬着的担架留在他倒下的地方，不跟着换的人走。
  carry?.Reset("respawn");
  // 换人上来的也没在机枪位上：上一个人是趴在枪上死的，枪留在原地等下一个人。
  emplacement?.Reset("respawn");
  carryHidGun = false;
  const seed = 7919 * (state.fallen.length + 1) + state.phaseIndex * 131;
  state.identity = phase.whitebox?.p012 ? {name:CAST.shunzi.short,fullName:CAST.shunzi.name,castId:"shunzi",weapon:"HanYang"} : MakeSoldierIdentity(seed);
  currentWeapon = state.identity.weapon;

  // 靶场（sandbox）阵亡后也回出生工位：那套「退到路标后方」的算法是给战线写的，
  // 靶场的路标是三个工位，按它算会把人复活到场地边上。
  if ((initial || phase.sandbox) && phase.spawn) {
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
  state.weaponVariants.primary = 0;
  state.weaponVariants.secondary = 0;
  // 每位接替者按自己的固定种子抽一把大刀；同一人换槽、死亡掉落和拾取后都不变。
  state.weaponVariants.melee = RandomWeaponVariant(state.slots.melee, `player:${seed}`);
  state.weaponVariants.throwable = 0;
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
  // 换关领新枪：刺刀从收着开始（上刺刀是玩家的一个决定，不是默认状态）
  state.bayonetFixed = MELEE_TEST;
  state.meleeCharge = null;
  // Equip(null) 是合法的：Viewmodel 会把 rig 清空（空着手）。
  // 第一关「还没捡到枪」与第六关「脱离战斗」都要走这条。
  viewmodel.Equip(currentWeapon, SlotWeaponVariant(state.activeSlot));
  SyncBayonet();
  viewmodel.root.visible = true;
  hud.SetWeaponName(currentWeapon ? (WEAPONS[currentWeapon]?.name || "步枪") : "赤手");
  ApplyDebugOptions();
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

/** 槽里的外观编号。没有变体或槽位为空时一律回主式样。 */
function SlotWeaponVariant(slot) {
  const weaponId = SlotWeaponId(slot);
  return WeaponVariantFor(weaponId, state.weaponVariants[slot]);
}

/** 武器变体的唯一归一化口，变体表扩容后旧存档值也不会越界。 */
function WeaponVariantFor(weaponId, value = 0) {
  const variants = WEAPON_MESH_VARIANTS[weaponId];
  if (!variants || variants.length < 2) return 0;
  const n = Number.isInteger(value) ? value : 0;
  return n >= 0 && n < variants.length ? n : 0;
}

/** 新角色的式样也必须稳定：重生、换槽或截图复跑都不能悄悄换刀。 */
function RandomWeaponVariant(weaponId, seedText) {
  const variants = WEAPON_MESH_VARIANTS[weaponId];
  if (!variants || variants.length < 2) return 0;
  return HashString(`${seedText}|${weaponId}`) % variants.length;
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
  state.meleeCharge = null;                        // 换手就把蓄着的那一下松掉
  viewmodel.Equip(currentWeapon, SlotWeaponVariant(slot));
  SyncBayonet();                                   // 切回长枪时刺刀还在枪上
  hud.SetWeaponName(WEAPONS[currentWeapon]?.name || "");
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

/**
 * 挨枪那一声，还有濒死心跳。
 *
 * Audio/Sfx 里 `AudioSfx_Hurt_01/02.mp3` 与 `AudioSfx_Heartbeat_01.mp3`
 * 早就烘好了（Data_SfxSources 里有 PainGrunt / SoldierGrunt / Heartbeat 三条源，
 * Script_Audio 里有 hurt / heartbeat 两条配方），但**整仓库一行没播过** ——
 * 玩家中弹是全静音的，这也是"直接就死、没有任何提醒"的一半原因。
 *
 * 两条都不给 position：闷哼是自己嘴里发出来的，心跳在颅内，都不该有房间混响
 * 与 HRTF 方位（Script_Audio 的 heartbeat 配方把 wetGain 写死成 0 就是这个意思）。
 */
function PlayHurtCues() {
  const events = player?.ConsumeHitEvents?.();
  if (!events) return;
  let grunted = false;
  for (const e of events) {
    if (e.kind === "hurt") {
      // 一帧只哼一声：一发霰射的弹片能同帧结算好几下，全播出来是一片噪音。
      if (grunted) continue;
      grunted = true;
      audio.Play("hurt", { volume: Clamp(0.55 + e.severity * 0.5, 0.55, 1.0), priority: true });
    } else if (e.kind === "heartbeat") {
      audio.Play("heartbeat", { volume: Clamp(0.5 + e.severity * 0.55, 0.5, 1.0) });
    }
  }
}

function OnPlayerDown() {
  if(p012Runtime){
    p012Runtime.failed=true;state.pendingRespawn=false;state.deathTimer=0;
    p012Runtime.retryAtLoad=carry?.Active?{x:player.position.x,z:player.position.z,yaw:player.yaw,stance:player.stance}:null;
    // An active load stays at the death location; only an empty-handed retry returns to a checkpoint.
    audio.Play("bodyFall",{volume:.9});ShowPauseMenu();menu.OpenSandboxFailure(!!p012Runtime.retryAtLoad);return;
  }
  const identity = state.identity;
  state.fallen.push(identity);
  state.nraPool = Math.max(0, state.nraPool - 1);
  hud.ShowDeathCard(identity, "第三十一师 一八六团", REINFORCE.deathCardSeconds);
  state.deathTimer = REINFORCE.deathCardSeconds;
  state.pendingRespawn = true;
  // 倒地镜头保留战场，但手里的枪不能冻结在半空；接管下一名士兵时再恢复。
  if (viewmodel) viewmodel.root.visible = false;
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
// Timeline / 序章审片：Alt 按住期间鼠标归用户，导演自由视线也暂停吃 movement。
// 单纯 exitPointerLock 不够，真实浏览器里先前 pending 的 request 仍可能稍后成功。
let altMouseFree = false;
// 自己主动交还指针锁（过场、菜单、失焦）不等于玩家按 Esc。
// 真浏览器会吞掉锁内的 Esc 键，只留下 pointerlockchange，所以必须记住解锁来源。
let intentionalPointerUnlock = false;

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
  if (SHOT || altMouseFree || (editor && editor.Capturing)) return;
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
    if (fakeLocked) {
      intentionalPointerUnlock = true;
      fakeLocked = false;
      OnPointerLockChange();
    }
    return;
  }
  if (document.pointerLockElement && typeof document.exitPointerLock === "function") {
    intentionalPointerUnlock = true;
    document.exitPointerLock();
  }
}

/** 锁的状态变了（真后端由 pointerlockchange 事件进来，假后端由上面两个函数直调）。 */
function OnPointerLockChange() {
  // 锁掉了：把连续输入清零，否则松开锁的那一瞬间按着的键会一直"按着"
  if (PointerLocked()) {
    // Alt 或编辑器已接管时，晚到的异步 requestPointerLock 也必须立即退回去。
    if (altMouseFree || (editor && editor.Capturing)) { ReleasePointerLock(); return; }
    intentionalPointerUnlock = false;
    return;
  }
  const intentional = intentionalPointerUnlock;
  intentionalPointerUnlock = false;
  input.fire = false; input.ads = false;
  input.forward = 0; input.strafe = 0; input.sprint = false;
  if (state.ordersOpen) { state.ordersOpen = false; hud.SetOrdersVisible(false); wheel.Close(); }
  // Chrome/Edge 在指针锁内会把 Esc 留给浏览器：页面收不到 keydown，只收到解锁事件。
  // 这条兜底让真人按 Esc 与冒烟合成 Esc 走到同一个 PauseGame。
  if (!intentional && state.ready && state.running && menu
      && !state.cutscene && !state.advancing && !(editor && editor.Capturing)) {
    PauseGame();
  }
}

function ShowPreviewTerminal(task) {
  let terminal = document.getElementById("previewTerminal");
  if (!terminal) {
    terminal = document.createElement("div");
    terminal.id = "previewTerminal";
    terminal.className = "previewTerminal";
    hudRoot.appendChild(terminal);
  }
  terminal.innerHTML = `<div class="title">序章预览结束</div>`
    + `<div class="task">${task}</div>`
    + `<div class="note">等待《断线》接手 · 预览不会启动界河战斗</div>`;
  terminal.classList.add("on");
  // _Finish() 按正片契约解除 cinematic；预览终点重新锁回 cinematic，
  // 只留下这个明确的终点卡，不露血量、武器、命令栏等战斗 HUD。
  hud.SetCinematic(true);
}

/**
 * 新版《序章｜出川》的稳定开发入口。
 *
 * 预览页不进主菜单、不抢指针锁，也不把车厢的下车动作解释成旧 L0 的
 * 开战；片尾只显示一次「跟随通信排。」并停住。这样在《断线》完成前，
 * 新内容可以独立审片而不会制造一个假的玩法接缝。
 */
function StartPreview({ unlockAudio = true } = {}) {
  if (!PREVIEW_ID || !cutscene || state.previewPlaying || state.previewDone) return false;
  state.menu = false;
  state.running = false;
  state.previewPlaying = true;
  state.previewDone = false;
  state.previewError = null;
  // WebAudio 必须在真人手势内解锁。预览页保留一次「播放序章」点击，
  // 点击后两分钟时间轴仍完全自动推进；直接在 Boot() 尾部自动起播会让
  // Chrome / Safari 把上下文留在 suspended，结果是画面正常而全段静音。
  // 顶层页面跳转不会保留原链接点击的 WebAudio user activation。自动播放的
  // 入口优先保证画面立刻进入；玩家第一次在画面内点击时仍会照常解锁音频。
  if (unlockAudio) audio.Unlock();
  ReleasePointerLock();
  if (ai) ai.Dispose();
  ShowBoot(false);
  const pending = RunCutscene(PREVIEW_ID, { loading: true });
  pending.catch((error) => {
    // 预览入口必须在无音频、低画质或数据错误时稳定收口；把错误留在调试口，
    // 不让一个未处理 rejection 把页面的后续控制器拖死。
    state.previewPlaying = false;
    state.previewDone = true;
    state.previewError = String(error && error.message ? error.message : error);
    state.running = false;
    if (ai) ai.Dispose();
  });
  return true;
}

function StartRun() {
  ShowBoot(false);
  state.menu = false;
  state.running = true;
  if (SHOT) return;
  audio.Unlock();
  // 开场过场。EnterLevel(initial) 是按 cutscenes:false 建的场（开机不能夺控制权），
  // 所以第一关的 cutsceneIn（默认是 Legacy 出川）在玩家点击时再播。
  // 这里在玩家按下「进城」的那一下补播：点击本身就是音频与指针锁要的那次用户手势。
  // 调试入口（?phase=N 直跳某关、?intro=0）不播开场 —— 冒烟测试点完「进城」就要拿到
  // 指针锁与键盘，过场一夺控制权它们全挂。玩家正常打开页面没有这些参数。
  const phase = PHASE_TABLE[state.phaseIndex];
  const wantIntro = !params.has("phase") && params.get("intro") !== "0";
  const intro = wantIntro && phase && phase.cutsceneIn;
  if (intro && !state.cutscenesPlayed.some((c) => c.id === intro)) {
    RunCutscene(intro, { loading: true });   // 播完 RunCutscene 自己会把指针锁要回来
    return;
  }
  RequestPointerLock();
}
bootStart.addEventListener("click", PREVIEW ? StartPreview : StartRun);
// URL 跳转后的自动开播没有可继承的用户手势；下一次在画面内点按时补解锁，
// 让序章不因音频策略停在加载页，也不要求玩家额外回去点启动按钮。
if (PREVIEW_AUTOPLAY) {
  document.addEventListener("pointerdown", () => audio.Unlock(), { once: true });
}

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
  // 同过场：菜单里松手边沿到不了玩法层，按住中的那一下要在这里断掉。
  interact?.CancelHold("menu");
  emplacement?.SetFire(false);
  emplacement?.EndClear();
  hud?.SetInteractProgress(null);
  if (viewmodel) viewmodel.root.visible = false;
  ShowBoot(false);
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
  // 回到战场时手上还占着东西的话，枪继续收着（负重的边沿不会重放一次）。
  if (viewmodel) viewmodel.root.visible = !carry?.Blocking;
  if (!SHOT) document.getElementById("edRoot")?.classList.remove("off");
}

/** 编辑器从菜单进来时，完整关闭后回到原来的菜单层。 */
function FinishEditorSession() {
  const mode = editorReturnMenuMode;
  editorReturnMenuMode = null;
  if (!mode || !menu) return;
  if (mode !== "pause") { OpenMenu(); return; }
  // 回暂停层走与 Esc 完全相同的那一条（ShowPauseMenu）。
  // 这里以前是把 OpenMenu 抄了一份：额外把枪藏了、把齿轮藏了、还把
  // state.menu 置了 true —— 那三件都是**主菜单**才该做的事。
  ShowPauseMenu();
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
  const target = Clamp(index, 0, PHASE_TABLE.length - 1);
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

/**
 * 挂上暂停层。**进暂停的每一条路都必须走这里**，两条路进的暂停要长得一模一样。
 *
 * 这个函数最重要的一条是它**没做**的事：不藏手里那支枪，也不藏齿轮。
 * 暂停屏是「冻住的战场 + 一层压暗 + 一列字」，枪就是那张照片的一部分；
 * 而 ResumeFromPause 只管把 HUD、声音和指针锁接回来，谁藏了枪谁就得自己放回来。
 * 「暂停 → 设置 → 关掉设置 → 继续」曾经在这里抄了一份 OpenMenu（那是**主菜单**
 * 的收口），于是回到战斗时手里是空的 —— 拿大刀时最刺眼：整只手连刀一起没了，
 * 而且不换关不重生就再也回不来（换槽的 SwitchSlot 不碰 root.visible）。
 */
function ShowPauseMenu() {
  state.running = false;
  ReleasePointerLock();
  // 背景枪声也得停。玩法停靠 Frame() 提前返回，而环境床与音乐是一张自己在跑的
  // WebAudio 节点图 —— Frame() 返不返回它们都照响（见 Script_Audio.SetPaused）。
  audio.SetPaused(true);
  // HUD 收起来：暂停屏是给人读菜单的，顶着阶段条、简报、小地图和阵亡卡片读不清。
  // ER2 的暂停也是「冻住的画面 + 一层压暗 + 一列字」，HUD 不留。
  hudRoot.style.display = "none";
  menu.OpenPause();
}

/** 游戏中按 Esc：挂暂停。世界冻在原地（Frame 不跑），相机不动。 */
function PauseGame() {
  if (!menu || !state.running || state.cutscene || state.advancing) return false;
  ShowPauseMenu();
  return true;
}

/** 暂停里的「继续」。 */
function ResumeFromPause() {
  if (!menu) return;
  if (p012Runtime?.completed) return;
  if (p012Runtime?.failed) return;
  // 设置面板很可能还开着：关掉「画质」那一页只关那一页，**入口面板留着**
  //（Close() 不动 panelOpen）。不收掉它 editor.Capturing 就一直是 true，
  // 于是「继续」之后：Frame 走的还是编辑器那条分支（世界冻着）、Guard 把每一次
  // 点击都当成"在点面板"吃掉、RequestPointerLock 直接早退 —— 玩家以为回到了
  // 战斗，其实镜头和身体都不听话。先把返回层清掉再收面板，否则 TogglePanel
  // 里的 Close() 会调 FinishEditorSession 把暂停菜单又盖回来。
  editorReturnMenuMode = null;
  if (editor && editor.panelOpen) editor.TogglePanel(false);
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
  if (editor) editor.UpdateOverlays(dt);
  menu.Update(dt);
  // 菜单运镜也要喂流送：Z8 那类俯拍机位悬在城另一头，不喂的话拍到的是空城。
  if (battlefield?.externalStreamer) {
    battlefield.externalStreamer.Update(camera.position.x, camera.position.z);
  }
  // 场上那几个守军：只有守军，所以 AI 找不到目标，跑的是「守住 holdZone」那一支。
  // 不推它的话人是几尊定在地上的雕像 —— 比没有人还假。
  if (ai && ai.soldiers.length) ai.Update(dt, camera);
  // 浮尘与烟柱照跑：菜单要的就是「这片场景是活的」，静止的烟等于一张背景图
  if (vfx) vfx.Update(dt, camera, state.elapsed);
  if (sky) sky.Update(state.elapsed);
  if (lights) {
    lights.Update(dt, state.elapsed, camera.position);
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
  // QTE 先于 KEYMAP 接管 A/D/V/F 的按下与松开；否则 A/D 会同时让玩家横移，
  // V 会另起一刀，F 又会顺手捡地上的枪，屏幕提示与实际因果就分叉了。
  Capture: (_event, detail) => !!meleeQte?.HandleInput(detail.code, detail.down, detail.repeat),
  OnAction: (action, detail) => {
    if (state.cutscene) return; // 过场只由 CutsceneDirector 接收 Look/Esc
    if (!state.ready) return;
    // 编辑器开着就把整张键位表闸掉。不闸的话在编辑器里按 R 会真的去装填、
    // 滚滚轮会真的切枪 —— 而这两件事在暂停的世界里做，退出编辑器时状态已经错了。
    if (editor && editor.Capturing) return;
    switch (action) {
      case "crouch": input.crouchPressed = true; p012Runtime?.RecordDodgeIntent(player.position, strafe?.View(), carry?.KindId); return;
      case "prone": input.pronePressed = true; p012Runtime?.RecordDodgeIntent(player.position, strafe?.View(), carry?.KindId); return;
      // 架着机枪时 R 是**拉枪机**：没卡壳就当换弹板，小卡是排障起手（按住继续），
      // 脚本触发的必然失效则数着拉了几下 —— 拉够了这挺枪就废了（§6 阶段⑩②）。
      case "reload":
        if (emplacement?.Mounted) { emplacement.PullBolt(); return; }
        Reload(); return;
      // V 是 holdAction：按下开始蓄力，松手按蓄了多久决定挥砍还是劈刺。
      // 大刀/投掷物在 BeginMeleeCharge 里直接落回一次性出招（它们不蓄力）。
      case "melee":
        if (detail.down) BeginMeleeCharge("key"); else ReleaseMeleeCharge();
        return;
      case "bayonet": ToggleBayonet(); return;
      case "bandage":
        if (player?.Bandage()) audio.Play("stripperLoad", { volume: 0.6 });
        return;
      // F 现在是 holdAction（按住型救护交互要松手边沿，见 Script_Input 那条注释）。
      // 松手只做一件事：把按住中的进度交还给 InteractSystem（hold 型慢慢退、
      // confirm 型立刻清零）。按下那一侧的分流顺序与改之前完全一样。
      case "interact":
        if (detail.down === false) { interact?.Release(); return; }
        if (meleeQte?.TryBeginExecution()) return;
        // 架着机枪时 F 的语义就只剩「离位」（枪废了就是「弃枪」）。
        // **离位永远是玩家自己按的这一下** —— 脚本没有替他下枪位的口子。
        if (emplacement?.Mounted) { emplacement.Vacate("player"); return; }
        // 手上占着东西时，F 的语义就只剩「放下」——不再去查地上有没有枪可捡。
        if (carry?.Active) {
          // This mission's non-droppable ammunition must reach its registered delivery gesture.
          if (p012Flow && interact?.Query(player)?.point?.id === "p012_ammoDrop") { DoInteract(); return; }
          carry.Drop("player"); return;
        }
        DoInteract(); return;
      case "bipod": ToggleBipod(); return;
      case "fireMode": ToggleFireMode(); return;
      case "map": hud.ToggleMinimap(); return;
      case "cycleSlot": CycleSlot(detail.delta); return;
      case "traverse": DoTraverse(); return;
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

document.addEventListener("keydown", (event) => {
  if (event.code !== "AltLeft" && event.code !== "AltRight") return;
  altMouseFree = true;
  ReleasePointerLock();
  event.preventDefault();
});
document.addEventListener("keyup", (event) => {
  if (event.code !== "AltLeft" && event.code !== "AltRight") return;
  altMouseFree = false;
  // Timeline 里松 Alt 后仍要能点面板；普通玩法则恢复原来的锁定手感。
  if (state.running && !state.menu && !state.cutscene && !(editor && editor.Capturing)) RequestPointerLock();
  event.preventDefault();
});

document.addEventListener("mousemove", (e) => {
  if (altMouseFree) return;
  // headLook 是过场唯一开放的连续输入；不要求玩家锁住指针，避免 Esc 被浏览器吞掉。
  if (cutscene && cutscene.Playing) {
    if (cutscene.AllowsLook) cutscene.AddLook(e.movementX, e.movementY);
    return;
  }
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
  if (p012Runtime && w && state.ammo >= (w.magazine ?? 5)) {
    viewmodel.TriggerReload(); audio.Play("bolt", { volume: 0.7 });
    p012Runtime.weaponActionPending = true; return true;
  }
  const infiniteAmmo = debugOptions.Enabled("infiniteAmmo");
  if (!w || (!infiniteAmmo && state.clips <= 0) || state.ammo >= (w.magazine ?? 5)) return false;
  if (!infiniteAmmo) state.clips -= 1;
  state.ammo = w.magazine ?? 5;
  viewmodel.TriggerReload();
  if (p012Runtime) p012Runtime.weaponActionPending = true;
  audio.Play(w.reloadKind === "topMag" ? "magIn" : "stripperLoad", { volume: 0.75 });
  return true;
}

/** 按住蓄力：手榴弹可以攥着数几秒再扔，落地即炸。 */
function BeginCook(kind) {
  if (!player.Alive || state.cooking) return;
  const infiniteGrenades = debugOptions.Enabled("infiniteGrenades");
  if (kind === "Grenade" && !infiniteGrenades && state.grenades <= 0) { hud.Hint("没有手榴弹了", 2); return; }
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
  const projectile = combat.Throw(kind, power, player.EyePosition.clone(), dir, cooked);
  if (projectile && kind === "Grenade") p012Runtime?.RecordGrenade(player.position);
  // 夹到 0：BeginCook 已经挡过"没货就别拔弦"，但调试口（Debug.Throw）是直接
  // 塞 state.cooking 的，绕开了那道闸。库存变负之后 HUD 会显示 −1 枚手榴弹，
  // 而且下一次 BeginCook 的 <= 0 判断照样过 —— 一个负数会一直负下去。
  if (kind === "Grenade") {
    if (!debugOptions.Enabled("infiniteGrenades")) state.grenades = Math.max(0, state.grenades - 1);
  } else {
    state.bundles = Math.max(0, state.bundles - 1);
  }
  viewmodel.TriggerThrow?.(power);
  state.cook = 0;
}

/**
 * 白刃（一次性出招那条路）：大刀槽的左键、以及大刀/投掷物在手时按 V。
 * 持枪的白刃不走这里 —— 那条是蓄力链（BeginMeleeCharge / ReleaseMeleeCharge）。
 */
function DoMelee() {
  if (!player.Alive || viewmodel.IsBusy?.()) return false;
  viewmodel.TriggerMelee();
  const weapon = WEAPONS[currentWeapon];
  const useGun = !!(weapon?.bayonet && state.bayonetFixed);
  const result = combat.Melee(useGun ? currentWeapon : "Dadao",
    player.position.clone(), player.AimDirection(_aimDir).clone(),
    useGun ? { mode: "thrust", power: 0.5 } : {});
  // 同上：不在这里扣票，阵亡事件已经扣过了
  if (result) ConfirmHit(result.died);
  return !!result;
}

/**
 * 白刃蓄力入口。source: "key"（V 按下）| "mouse"（空枪左键按下）。
 * 大刀不蓄力（swingTimeS 里自带 90 ms 短蓄）、投掷物没有蓄劈的道理 ——
 * 这两类按下那一刻直接出招。
 */
function BeginMeleeCharge(source) {
  if (!player?.Alive || state.meleeCharge) return false;
  const weapon = WEAPONS[currentWeapon];
  if (!weapon || weapon.kind === "melee" || weapon.kind === "throwable") return DoMelee();
  if (viewmodel.IsBusy?.()) return false;
  if (!viewmodel.BeginMeleeCharge?.()) return false;
  state.meleeCharge = { t: 0, source };
  return true;
}

/** 松手出招：按住不足 chargeMinS 是挥砍（cut），够了是劈刺（thrust）。 */
function ReleaseMeleeCharge() {
  const charge = state.meleeCharge;
  if (!charge) return false;
  state.meleeCharge = null;
  if (!player?.Alive) { viewmodel.CancelMeleeCharge?.(); return false; }
  const weapon = WEAPONS[currentWeapon];
  const fixed = !!(weapon?.bayonet && state.bayonetFixed);
  const charged = charge.t >= GUN_MELEE.chargeMinS;
  const power = charged ? Clamp01(charge.t / GUN_MELEE.chargeMaxS) : 0;
  // 没上刺刀：不管蓄多久都是枪托砸，蓄力只加力道 —— 拿枪管抡劈是要炸膛的
  const mode = fixed ? (charged ? "thrust" : "cut") : "bash";
  return DoMeleeAttack(mode, power);
}

/** 持枪白刃出招：判定与动画吃同一份 mode/power。 */
function DoMeleeAttack(mode, power) {
  viewmodel.TriggerMelee(mode, power);
  const result = combat.Melee(currentWeapon, player.position.clone(),
    player.AimDirection(_aimDir).clone(), { mode, power });
  if (result) ConfirmHit(result.died);
  return !!result;
}

/** 装/卸刺刀（X）。只对 Data_Weapons 里 bayonet: true 的枪有意义。 */
function ToggleBayonet() {
  if (!player?.Alive || !viewmodel) return false;
  const weapon = WEAPONS[currentWeapon];
  if (!weapon?.bayonet) {
    hud.Hint(weapon?.kind === "melee" ? "大刀本身就是白刃" : "这支枪装不了刺刀", 2.0);
    return false;
  }
  if (viewmodel.IsBusy?.() || state.meleeCharge) return false;
  const next = !state.bayonetFixed;
  if (!viewmodel.TriggerFixBayonet?.(next)) return false;
  state.bayonetFixed = next;
  // "咔哒"落在刀滑进枪口环那一帧（装 0.95 s × 0.58 ≈ 0.55，卸在 0.52 起拔）
  audio.Play("stripperLoad", { volume: 0.7, pitch: next ? 1.25 : 1.1,
    delay: next ? 0.55 : 0.50 });
  hud.Hint(next ? "上刺刀" : "收刺刀", 1.6);
  return true;
}

/** 换枪/重生后把刺刀状态种回视图模型（Equip 会整棵重建 rig，可见性得重种）。 */
function SyncBayonet() {
  viewmodel.SetBayonetFixed?.(state.bayonetFixed && !!WEAPONS[currentWeapon]?.bayonet);
}

/**
 * Space 的场景动作：按通行高度阶梯（Data_Traversal）挑动词 ——
 * 腰高翻越、肩高攀爬，都够不着才落到受限跳跃；高过硬顶的墙一个动词都不给。
 * 顺序不能反——院墙前若先给竖直速度，翻越探测就会因为已经离地而失败。
 */
function DoTraverse() {
  if (!player?.Alive || viewmodel.IsBusy?.()) return false;
  const traverse = player.TryVault();
  if (traverse) {
    // 攀爬慢、贴着墙磨上去，声音也该更闷更长一点
    audio.Play("footstepRubble", { volume: traverse === "mantle" ? 0.85 : 0.7 });
    return traverse;
  }
  if (!player.TryJump()) return false;
  audio.Play("footstepDirt", { volume: 0.34 });
  return "jump";
}

/**
 * 通用交互（F）。语义按上下文分流，规则在 Script_Interact。
 * 够不着任何东西时同样一声不吭。
 */
function DoInteract() {
  if (!player?.Alive || !interact) return false;
  // Press：点按型当场做完，按住型开始读条（进度由 interact.Update 每帧推）。
  return !!interact.Press(player);
}

/**
 * HUD 的情境操作条只读真实规则查询：F 来自 InteractSystem.Query，B 来自玩家流血与
 * 绷带库存，1/2 来自实际槽位。没有可执行动作就传空数组，不用计时器伪造教程窗口。
 */
function UpdateContextualActionPrompts() {
  if (!player?.Alive || meleeQte?.Active) {
    hud.SetActionPrompts([]);
    return;
  }
  // 架着机枪时提示条整段被机枪接管：这会儿能按的就只有扳机、R 和 F。
  // 留着「上刺刀」「包扎」「换枪」那几条会让玩家去按一个当下没有语义的键。
  const mounted = emplacement?.View() || null;
  if (mounted) {
    const prompts = [];
    if (mounted.jam) {
      prompts.push({
        keys: "R",
        label: mounted.jam.kind === "fatal" ? "拉枪机" : "按住排障",
        kind: "reload",
      });
    } else if (!mounted.dead && mounted.rounds < mounted.beltRounds && mounted.belts > 0) {
      prompts.push({ keys: "R", label: "换弹板", kind: "reload" });
    }
    prompts.push({ keys: "F", label: mounted.exit, kind: "interact" });
    hud.SetActionPrompts(prompts);
    return;
  }
  const interaction = interact?.Query(player) || null;
  const gunInHand = state.activeSlot === "primary" || state.activeSlot === "secondary";
  const prompts = ContextualActionPrompts({
    // 抬着东西时这一条会把提示条整段接管（只剩「放下 / 扔下」），见 ContextualActionPrompts。
    carry: carry?.View() || null,
    interaction,
    bleeding: player.bleeding,
    bandages: player.bandages,
    slots: state.slots,
    bayonet: gunInHand && WEAPONS[currentWeapon]?.bayonet
      ? { fixed: state.bayonetFixed } : null,
    ammoEmpty: gunInHand && state.ammo <= 0 && !!WEAPONS[currentWeapon]?.magazine,
  });
  // 抬着东西的时候提示条已经被负重接管（只剩放下/扔下），别再往前面插一条处决 ——
  // 那一下 F 的实际结果是「放下担架」，提示与因果就分叉了。
  if (!carry?.Active && meleeQte?.ExecutionCandidate()) {
    prompts.unshift({ keys: "F", label: "踹开处决", kind: "execution" });
  }
  hud.SetActionPrompts(prompts);
}

/**
 * 拾取武器。枪进 1 号槽，大刀进 3 号槽；两者都替换同类槽位，
 * 并把尸体上的外观变体一并带走。缴获日械没有备弹（clips = 0），
 * 只有枪里那几发。
 */
function PickUpWeapon(weaponId, clips, variant = 0) {
  if (!player?.Alive || !WEAPONS[weaponId]) return false;
  const weapon = WEAPONS[weaponId];
  const slot = weapon.kind === "melee" ? "melee" : "primary";
  const hadNoWeapon = !state.slots[slot];
  state.slots[slot] = weaponId;
  state.weaponVariants[slot] = WeaponVariantFor(weaponId, variant);
  if (slot === "primary") state.mags.primary = { ammo: weapon.magazine ?? 5, clips };
  state.pickedUp = weaponId;
  state.pickedUpVariant = state.weaponVariants[slot];
  // 捡来的枪上没有装着的刺刀（阵亡者的刺刀在鞘里/丢了；想上再按 X）
  if (slot === "primary") state.bayonetFixed = false;
  // 第一关的目标之一就是「找一支枪（从倒下的人身上捡）」—— 捡完还得自己按
  // 1 才拿得出来的话，目标在玩家眼里就是没生效。大刀同理：空着 3 号槽时捡到就到手。
  if (hadNoWeapon) state.activeSlot = slot;
  if (state.activeSlot === slot) {
    currentWeapon = weaponId;
    const mag = state.mags[slot];
    state.ammo = mag ? mag.ammo : 0;
    state.clips = mag ? mag.clips : 0;
    player.bipod = false;
    state.fireMode = "auto";
    viewmodel.Equip(currentWeapon, SlotWeaponVariant(slot));
    SyncBayonet();
    hud.SetWeaponName(WEAPONS[currentWeapon]?.name || "");
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
let lastLandSerial = 0;
let fireCooldown = 0;
let fireEdge = false;                 // 这一帧是不是"刚按下"（单发模式与投掷物槽要用）
const _muzzle = new THREE.Vector3();
// 弹道起点允许离瞄准轴多远（米）。腰射常态是 0.193 m，这个上限只在"上刺刀之后
// 枪斜端起来"那一档兜底，见开火里那段注释。
const MAX_MUZZLE_PARALLAX_M = 0.22;
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
// ADS 近景景深：像战地/COD 那样把贴眼的照门、枪身与掩体边缘轻轻散焦，
// 但从 ADS_NEAR_DOF_FOCUS_M 起完全清楚，目标区与远景不吃这层模糊。
const ADS_NEAR_DOF_STRENGTH = 0.72;
const ADS_NEAR_DOF_FOCUS_M = 1.60;
const ADS_NEAR_DOF_RANGE_M = 0.85;
const ADS_NEAR_DOF_MAX_PX = 4.5;

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

/**
 * 碰撞盒 tag → 弹着表面档案。
 *
 * 【2026-08-20】原来这里是一行三目：`barricade→sandbag / prop→wood / 其余→brick`。
 * Script_Vfx 的 SURFACE_PROFILES 有 7 套，参数差异做得很细（金属 12 颗火星、
 * 沙包出沙流、木头出长条碎片），但玩家的子弹只映射得到 3 套 ——
 * **打土坎、打木桥、打坟头，全出砖灰**，dirt 那套档案是死代码；
 * impactWood / impactMetal 两条实录音全仓库只有过场用过，正片里一辈子听不到。
 * 资产与配方都在，缺的就是这张表。
 *
 * tag 的全集来自 World.Solid() 的实参（wall/prop/parapet/ramp/platform/grave/
 * bridge/balk）加上 barricade / embankment / kan。没列进来的落回 brick。
 *
 * metal 仍然没有来源：全场没有任何一个碰撞盒标成金属（城门是 seed:"gate" 的
 * 木门，不是铁门）。给它编一个 tag 属于改世界几何，不混在这次修复里。
 */
// 【2026-08-25 再补一次】上面那句"全集"当时就不全，后来更不全：
// 生活层（Script_LivedInProps）与城外层各自新编了 householdWoodpile /
// householdCart / streetStall / fence / villageStraw / sandbagEmplacement /
// fieldBank / dirt 这些 tag，一个都没进这张表 —— 打柴垛出砖灰、打沙袋工事出砖灰、
// 打土坎（tag 就叫 dirt）也出砖灰。这一轮给生活家什与下载来的布景补碰撞盒时
// 顺手对齐，键与 Data_Destruction.TAG_PROFILE 保持同一套；以后新加 tag 两边一起加。
const SURFACE_BY_TAG = {
  barricade: "sandbag", sandbagPlug: "sandbag", sandbagEmplacement: "sandbag",
  prop: "wood", balk: "wood", bridge: "wood", platform: "wood",
  floor: "wood", ceiling: "wood", roof: "wood", door: "wood", furniture: "wood",
  householdWoodpile: "wood", householdCart: "wood", householdBasket: "wood",
  streetStall: "wood", fence: "wood", deadTree: "wood",
  villageCart: "wood", villagePost: "wood", villageGate: "wood",
  ramp: "dirt", grave: "dirt", embankment: "dirt", kan: "dirt",
  dirt: "dirt", fieldBank: "dirt", villageStraw: "dirt",
  wall: "brick", parapet: "brick", rubble: "brick", householdCrock: "brick",
};

/** 表面 → 实录命中音。sandbag 与 dirt 共用土声（沙包里装的就是土）。 */
const IMPACT_CUE = {
  brick: "impactBrick", dirt: "impactDirt", sandbag: "impactDirt",
  wood: "impactWood", metal: "impactMetal", water: "impactDirt",
};

/** 玩家每几发出一颗曳光。史实上常见的装填比例就是 1/5。见 TryFire 末尾的注释。 */
const TRACER_EVERY = 5;

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

    // 军人使用蒙皮骨架上的分部位球/胶囊；蹲、卧、跑、倒地时每一段都跟着对应
    // 骨头走。只有模型资源缺席的角色才回落到固定球，确保加载故障不让敌人无敌。
    let bestSoldier = null, bestPart = "torso", bestT = Infinity;
    for (const s of targets) {
      const boneHit = s.actor?.RaycastHitboxes?.(_bulletPos, _segDir, segLen) || null;
      if (boneHit) {
        if (boneHit.t < bestT) {
          bestT = boneHit.t;
          bestPart = boneHit.part;
          bestSoldier = s;
        }
        continue;
      }
      _rel.set(s.position.x - _bulletPos.x,
        s.position.y + HITBOX.centerY - _bulletPos.y,
        s.position.z - _bulletPos.z);
      const fallbackT = _rel.dot(_segDir);
      if (fallbackT < 0 || fallbackT > segLen) continue;
      const perp = _rel.addScaledVector(_segDir, -fallbackT).length();
      if (perp < HITBOX.radius && fallbackT < bestT) {
        bestT = fallbackT;
        bestPart = "torso";
        bestSoldier = s;
      }
    }
    // terrain:true —— 子弹要打得中山坡。以前只与碰撞盒求交，打向土坎、河堤、
    // 路基的子弹一律穿过去，弹着点凭空出现在坡的另一边。
    const wallHit = battlefield.Raycast(_bulletPos, _segDir, segLen, TERRAIN_RAY);
    if (bestSoldier && (!wallHit || bestT < wallHit.t)) {
      _hitPoint.copy(_bulletPos).addScaledVector(_segDir, bestT);
      return { soldier: bestSoldier, part: bestPart, dist: travelled + bestT, dir: _segDir };
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

/**
 * 命中/击杀回执。**玩家亲手造成的那一下才有回执**，AI 之间互相打死不给。
 *
 * 【2026-08-20 补这条通道】
 * 对着 Easy Red 2 一项项过的时候一直漏了它：ER2 有 hitmarker（可选），
 * 而我们把它写进 docs/Data_GunFeelReview.md 的裁决表当"默认关的难度选项"就搁下了。
 * 实跑之后这个判断是错的 —— 本作同时做了三件减法：
 *   · 没有准星（Script_Player 抬头）
 *   · 当时不显示弹药数（后来已补到 Script_Hud.SetState）
 *   · 结算不打歼敌数（Data_HistoryQuotes §10，这条不许动）
 * 每一条单看都对，叠在一起就把"我这一枪打没打中"的所有出口一起堵死了：
 * 血雾在一百米上只有两三个像素，impactFlesh 走 inverse 衰减到八十米剩 4.8%。
 * 于是四十米以外开枪与不开枪在玩家的感官里是同一件事。
 *
 * 两条通道，都不带数字：
 *   · 听觉回执（hitConfirm / killConfirm），非空间化、三档难度都给 —— 这是底线；
 *   · 视觉记号（Hud.Hitmark），挂 DIFFICULTY.hitMarker，写实档关。
 * 不做的：连杀播报、"+1" 飘字、击杀计数、爆头特写（Data_DesignFirstPass §385）。
 *
 * @param {boolean} died 这一下是否打死了人
 */
function ConfirmHit(died) {
  audio.Play(died ? "killConfirm" : "hitConfirm", { priority: true });
  if (DIFFICULTY.hitMarker !== false) hud.Hitmark(died ? "kill" : "hit");
}

function TryFire(dt) {
  fireCooldown -= dt;
  // 架着机枪：左键交给机枪那条射速与过热闸（Script_Emplacement.Update 里排），
  // 步枪链整条短路 —— 手上那支枪这会儿背在背上。
  // `debugEmplacedFire` 是冒烟用的「一直扣着扳机」：真人按住鼠标时 input.fire 每帧
  // 都是真的，而无头测试里 router.Read 每帧会把它读回 false —— 不留这个口子的话，
  // 测试只能打出一发（每帧被读回去一次）。
  if (emplacement?.Mounted) {
    emplacement.SetFire((!!input.fire || debugEmplacedFire) && player.Alive);
    return;
  }
  if (!input.fire || fireCooldown > 0 || !player.Alive) return;
  // 手上占着东西：左键不是开枪，是**把它摔了**（「可扔下快速恢复」那一条）。
  // 挨打的时候玩家去够的键本来就是左键，不该让他先想起来 F 在哪。
  // 担架 canThrow:false —— 那是个人，不是麻袋，摔不掉，左键就什么也不做。
  if (carry?.Blocking) { if (fireEdge) carry.Throw("fire"); return; }
  if (viewmodel.IsBusy?.()) return;
  // 翻墙翻到一半、或者人泡在水里：枪都不在手上/在水里，打不出去。
  // 这两条是"翻越"与"下水软墙"各自的代价，不写在这里就等于没有代价
  if (player.Busy || player.InWater) return;
  // 大刀槽按左键 = 挥刀，投掷物槽按左键 = 攥弹（松手才扔，走 ReleaseCook）
  //
  // 【2026-08-25】白刃这一支**必须**排在下面两道冲刺闸的前面。
  // 那两道闸是给枪写的：枪要举平、要压住后坐，冲刺时枪不在肩上所以打不出去。
  // 刀没有这回事 —— 大刀就是抡起来往前冲的兵器，"边跑边劈"是它唯一的用法。
  // 排在闸后面的后果是：拿着大刀按住 Shift 冲上去，左键完全没反应
  // （V 键反倒能挥，因为 V 走 OnAction 不过 TryFire）—— 同一个动作两个键两种结果。
  if (state.activeSlot === "melee") { if (fireEdge) DoMelee(); return; }
  // 【刺刀】空枪的左键是白刃，不是一声干壳。贴脸打空最后一发之后再按左键，
  // 玩家要的是"捅出去"，不是听声"咔"再去想 R 在哪。蓄力链与 V 完全同一条：
  // 按下开始蓄，松手出招（松手判在 Frame 里，见 meleeCharge 步进）。
  // 这一支同样必须排在冲刺闸前面 —— 拼刺冲锋本来就是端着枪跑着捅的。
  if ((state.activeSlot === "primary" || state.activeSlot === "secondary")
      && state.ammo <= 0 && !debugOptions.Enabled("infiniteAmmo")
      && WEAPONS[currentWeapon]?.magazine) {
    if (fireEdge && !state.meleeCharge) {
      // 空膛的"咔"保留：它是第二条弹药信息通道（见下方那段账），现在作为
      // 白刃起手的一部分响 —— 击针落空、随即人把枪抡起来。
      audio.Play("bolt", { volume: 0.34, pitch: 1.55 });
      BeginMeleeCharge("mouse");
      if (state.clips > 0) hud.Hint("按 R 压弹", 2.2);
    }
    return;
  }
  // 枪感方子 4：冲刺 → 开火有 0.22 s 的延迟。
  // 实测松开冲刺后视图模型的 sprintSpring 要 771 ms 才回位，
  // 而原来枪在半空里照样打得出去 —— 于是"冲进院子贴脸开枪"是零成本最优解。
  // 0.22 s 是「摆回来一大半但还没稳」的点：够短，不至于让人觉得枪卡住了。
  if (player.sprint > 0.35) return;
  if (state.elapsed - sprintReleaseAt < SPRINT_FIRE_DELAY_S) return;
  if (state.activeSlot === "throwable") {
    if (fireEdge && !state.cooking) BeginCook(state.slots.throwable);
    return;
  }
  const weapon = WEAPONS[currentWeapon];
  if (!weapon) return;
  const infiniteAmmo = debugOptions.Enabled("infiniteAmmo");
  // 开镜播完之前不给开枪：ER2 的枪举到位才打得出去，
  // 否则"右键 + 左键一起按"永远比先瞄再打划算，开镜就没有意义了。
  if (input.ads && player.ads < 0.9) return;
  // 单发模式（仅捷克式）：一次按下只出一发
  if (weapon.rpm && state.fireMode === "semi" && !fireEdge) return;
  // 空仓的分支已经上移到冲刺闸前面（空枪左键 = 白刃那一支）。空膛"咔"的三维
  // 分离账（pitch 1.55 / 音量 0.34 / 时长 65%，与拉栓在时长、频心、响度上同时
  // 分开）也搬过去了 —— 它现在是白刃起手的第一声。走到这里 ammo 一定 > 0。
  if (infiniteAmmo) state.ammo = Math.max(1, state.ammo);
  else state.ammo -= 1;
  state.playerShots += 1;
  p012Runtime?.RecordAircraftShot(player.EyePosition, player.AimDirection(_aimDir), strafe?.View());
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
  // 打完一发之后一声不响。这条听觉信息通道原来整个关着：玩家既听不出自己
  // 在拉栓，也听不出这是最后一发。
  // 0.24 s 是枪响之后手真的去够枪机的时间；0.62 s 是弹壳落地。
  // 判据是 kind === "boltRifle"（Data_Weapons 里每支枪都有），
  // 不是"有没有 rpm" —— 驳壳枪与捷克式自己上膛，没有手拉的那一下。
  if (weapon.kind === "boltRifle") {
    audio.Play("bolt", { position: _muzzle.clone(), volume: 0.42, delay: 0.24 });
  }
  // 弹壳落地。
  //
  // 【2026-08-20】这一行原来播的是 **`shellImpact`** —— 「野外迫击炮爆炸实录」，
  // 2.8 秒长、混响 send 0.45。也就是说**每开一枪，0.62 秒后跟一记迫击炮**。
  // 「一打起来就充斥着不知道哪儿来的、带拖尾的音效」，这是其中最响的一条。
  // 现在有专门的 `shellDrop`（弹壳落在水泥地上，实录，见 Data_SfxSources）。
  //
  // 不给 position：壳就掉在自己脚边，第一人称下走空间化那条链只会白花一个 panner。
  // pan 0.35 —— 中正式与三八式都是**向右抛壳**。
  // 栓动是拉栓那一下才把壳抛出去（0.24 s），落地再晚 0.4 s；
  // 捷克式自己抛壳，出膛就飞，落得早。
  audio.Play("shellDrop", {
    volume: 0.55, pan: 0.35, delay: weapon.kind === "boltRifle" ? 0.62 : 0.38,
  });
  // 枪种必须传下去：过去所有玩家武器都落进默认 rifle 配方，驳壳枪、捷克式与
  // 栓动步枪喷出完全相同的焰和烟。ER2 的枪感并不靠把所有枪都抖得更厉害，
  // 而是让每一类武器在同一套输入下仍有自己的出膛节奏。
  vfx.MuzzleFlash(_muzzle, player.AimDirection(_aimDir), {
    scale: 1.0,
    kind: weapon.kind,
  });

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
  _rel.addScaledVector(_aimDir, -along);          // 现在 _rel 就是那条垂距向量
  let muzzleOffset = _rel.length();
  // 上刺刀之后的"刺杀预备"是**视觉**姿态（Script_Viewmodel.BAYONET_CARRY：把枪
  // 斜端在身前，刀身才读得出来）。视觉可以斜，弹道不该跟着斜：实测垂距会从
  // 0.19 m 涨到 0.43 m，而贴脸腰射时那多出来的 0.24 m 就是"明明对着人却打空"。
  // 所以垂距只保留到上限，超出的部分把起点拉回瞄准轴 —— 枪焰、曳光仍从真枪口出，
  // 玩家看不出差别，手感上"上了刺刀就打不准"这条不存在。
  if (muzzleOffset > MAX_MUZZLE_PARALLAX_M) {
    from.addScaledVector(_rel, -(1 - MAX_MUZZLE_PARALLAX_M / muzzleOffset));
    muzzleOffset = MAX_MUZZLE_PARALLAX_M;
  }
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
    const part = shot.part || "torso";
    // 这里**不扣票**：扣票走 Soldier.Kill() 发的阵亡事件。
    // 两条路径同时扣的话，玩家亲手打死的人会扣两票。
    const died = shot.soldier.TakeHit(weapon.damage, part, dir);
    vfx.Blood(_hitPoint, dir, died ? 1 : 0.5);
    audio.Play("impactFlesh", { position: _hitPoint.clone(), volume: 0.7 });
    ConfirmHit(died);
  } else if (shot.wall) {
    const n = new THREE.Vector3(shot.wall.normal[0], shot.wall.normal[1], shot.wall.normal[2]);
    const surface = SURFACE_BY_TAG[shot.wall.box.tag] || "brick";
    vfx.Impact(_hitPoint, n, surface);
    audio.Play(IMPACT_CUE[surface] || "impactBrick", { position: _hitPoint.clone(), volume: 0.55 });
    // 子弹不再只留贴花：同一位置持续受击会按砖／木／土耐久形成真实破口。
    // 解析地表的虚拟记录不在破坏层里（它没有可替换的 Rapier 盒）。
    if (destruction && shot.wall.box && shot.wall.box.tag !== "dirt") {
      destruction.Hit(shot.wall.box, _hitPoint, weapon.damage, { kind: "bullet", normal: n });
    }
  }
  // 【2026-08-20】曳光**按比例出**，不是每发都出。
  //
  // 原来玩家每一发都拖一条光。史实上曳光弹是按比例压进弹仓的（常见每 5 发一颗，
  // 而且主要是给机枪指示弹着，栓动步枪的桥夹里往往一颗都没有）；
  // 更要紧的是它跟本作的设计直接打架 —— 夜袭关要求「摸上去」，
  // 而每发一条光等于自己举着灯把位置喊出去。
  //
  // 用 state.playerShots 取模而不是随机数：确定性（截图比对要可复现），
  // 而且「五发里有一发看得见弹道」是可学习的节奏，玩家会拿它去校准提前量。
  // AI 侧仍然逐发出曳光，那是故意的：满场只有靠它才读得出火力从哪个方向来。
  if (state.playerShots % TRACER_EVERY === 0) vfx.Tracer(_muzzle, _hitPoint.clone(), { kind: "nra" });
}

// ---------------------------------------------------------------------------
// 架设机枪：把 Script_Emplacement 排好的那一发真的打出去 + 世界模型
// ---------------------------------------------------------------------------
const _empFrom = new THREE.Vector3();
const _empDir = new THREE.Vector3();
const _empTargets = [];
/**
 * 弹道收敛距离。**枪口不在眼位上**：射手趴/蹲在枪后头，枪口比眼睛低半米、前半米。
 * 平行射出去的话弹着永远比准心低那么多，而本作没有准星可以标注这条偏差。
 * 所以照玩家步枪那条视差口径的做法收敛：把弹道拉到**准心真正指着的那个点**上
 * （AimPoint 会先投一条射线，指着墙就收敛在墙上，指着天就收敛在这个距离上）。
 */
const EMPLACED_CONVERGE_M = 160;

function FireEmplacedShot(shot) {
  if (!player || !battlefield) return;
  _empFrom.set(shot.origin.x, shot.origin.y, shot.origin.z);
  const aim = AimPoint(EMPLACED_CONVERGE_M);
  _empDir.set(aim.x - _empFrom.x, aim.y - _empFrom.y, aim.z - _empFrom.z);
  if (_empDir.lengthSq() < 1e-6) _empDir.set(shot.dir.x, shot.dir.y, shot.dir.z);
  _empDir.normalize();
  // 散布：架起来的枪比端着稳得多（Script_Emplacement 的 spreadDeg），
  // 但仍然要有 —— 一挺打不散的机枪就是一支狙击枪。种子跟着帧号走，可复现。
  const spread = THREE.MathUtils.degToRad(shot.spreadDeg || 0.3);
  const rnd = Mulberry32(state.frame * 2654435761 + shot.index);
  _empDir.applyAxisAngle(_yAxis, (rnd() - 0.5) * spread);
  _empDir.applyAxisAngle(_xAxis, (rnd() - 0.5) * spread);

  vfx.MuzzleFlash(_empFrom, _empDir, { scale: 1.25, kind: "hmg" });
  _empTargets.length = 0;
  for (const s of ai.soldiers) {
    if (!s.alive || s.side === shot.side) continue;
    if (s.position.distanceTo(_empFrom) > shot.rangeM + 4) continue;
    _empTargets.push(s);
  }
  // 借玩家步枪那条 MarchBullet：重力、空气阻力、地形与骨骼命中体一条都不少。
  const weapon = { ...WEAPONS[shot.weaponId], effectiveRangeM: shot.rangeM };
  const result = MarchBullet(_empFrom, _empDir, weapon, _empTargets);
  if (result.soldier) {
    const died = result.soldier.TakeHit(shot.damage, result.part || "torso", _empDir);
    vfx.Blood(_hitPoint, _empDir, died ? 1 : 0.5);
    audio.Play("impactFlesh", { position: _hitPoint.clone(), volume: 0.7 });
    ConfirmHit(died);
  } else if (result.wall) {
    const n = new THREE.Vector3(result.wall.normal[0], result.wall.normal[1], result.wall.normal[2]);
    const surface = SURFACE_BY_TAG[result.wall.box.tag] || "brick";
    vfx.Impact(_hitPoint, n, surface);
    audio.Play(IMPACT_CUE[surface] || "impactBrick", { position: _hitPoint.clone(), volume: 0.5 });
    if (destruction && result.wall.box && result.wall.box.tag !== "dirt") {
      destruction.Hit(result.wall.box, _hitPoint, shot.damage, { kind: "bullet", normal: n });
    }
  }
  // 机枪**每发都出曳光**（与步枪 1/5 是两条账）：满场只有靠它才读得出
  // 压制火力从哪个方向来，这也是「封住两侧院门」看得见的那一半。
  if (shot.tracer) vfx.Tracer(_empFrom, _hitPoint.clone(), { kind: shot.side === "ija" ? "ija" : "nra" });
}

/**
 * 机枪位的世界模型。**只有一件事**：把 Model/ 里那挺九二式摆到战位上、跟着射界转。
 *
 * 第一人称不另做一套手/枪 rig（低动画量原则）：射手位就在枪后头 0.85 m，
 * 玩家的相机本来就在这挺枪的正后方 —— 看见的就是这个模型。
 * 手臂 IK 缺席是**有意**的取舍，记在这里免得下一个 agent 当成漏做。
 */
function SyncEmplacementViews() {
  // 绝大多数关一挺机枪都没有：不早退的话每帧白建一个 List() 数组。
  if (!emplacement || (emplacement.GunCount === 0 && emplacementViews.size === 0)) return;
  for (const [id, view] of [...emplacementViews]) {
    if (emplacement.Emplacement(id)) continue;
    scene.remove(view.root);
    emplacementViews.delete(id);
  }
  for (const gun of emplacement.List()) {
    let view = emplacementViews.get(gun.id);
    if (!view) {
      // 摆点常常只给 x/z（关卡数据不该背地形高度），y=0 就当没给，问地面要。
      if (Math.abs(gun.position.y) < 1e-6 && battlefield) {
        const y = battlefield.GroundHeight(gun.position.x, gun.position.z);
        gun.position.y = y;
        gun.seat.y = y;
      }
      const meshId = WEAPON_MESH_BY_ID[gun.kind.weaponId];
      const built = meshId && actorFactory
        ? actorFactory.ModelInstance(meshId, {
          steel: library.Get("Steel", { roughness: 0.72, metalness: 0.55 }),
          wood: library.Get("WoodStock", { roughness: 0.86, metalness: 0 }),
        }) : null;
      if (!built) { emplacementViews.set(gun.id, { root: null }); continue; }
      built.root.name = `Emplacement_${gun.id}`;
      view = { root: built.root, nodes: built.nodes };
      scene.add(built.root);
      emplacementViews.set(gun.id, view);
    }
    if (!view.root) continue;
    view.root.position.set(gun.position.x, gun.position.y + gun.kind.sightRiseM, gun.position.z);
    view.root.rotation.set(gun.pitch, gun.yaw, 0, "YXZ");
  }
}

/** 玩家在打的时候指向每帧都在变，直接跟着写 —— 比等下一次 Sync 少一帧滞后。 */
function AimEmplacementView(view) {
  if (!view) return;
  const entry = emplacementViews.get(view.id);
  if (!entry || !entry.root) return;
  entry.root.rotation.set(view.pitch, view.yaw, 0, "YXZ");
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
 * o.contested 只喂**世界里那枚路标图标**（Script_Hud 的 fight 类）。它不再往
 * 顶栏的目标行上写字：「争夺中：XX」是占领点那一套留下的尾巴，占领点删掉之后
 * 它还在顶栏盖着剧本给的目标文案（「退进村庄外围，靠田坎顶住」被顶成
 * 「争夺中：路西村庄外围」）—— 顶栏那一行归剧本，不归战场状态。
 */
function UpdateObjectives(dt) {
  if (p012Flow) {
    const goal = p012Flow.CurrentObjective();
    const index = battlefield.objectives.findIndex((item) => item.id === goal.zone);
    if (index >= 0) state.objectiveIndex = index;
    state.storyObjective = goal.text;
    return;
  }
  const objectives = battlefield.objectives;
  if (!objectives.length) return;
  const index = Math.min(state.objectiveIndex, objectives.length - 1);
  const target = objectives[index];

  for (const o of objectives) {
    let theirs = 0;
    for (const s of ai.soldiers) {
      if (!s.alive || s.side === "nra") continue;
      if (Math.hypot(s.position.x - o.x, s.position.z - o.z) > o.radius) continue;
      theirs += 1;
    }
    o.contested = theirs > 0 && !o.reached;
  }

  if (state.objectiveIndex >= objectives.length) return;
  if (!player.Alive) return;
  const dist = Math.hypot(player.position.x - target.x, player.position.z - target.z);
  if (dist > target.radius) return;
  // 圈里还有人贴着就先不算到
  for (const s of ai.soldiers) {
    if (!s.alive || s.side === "nra") continue;
    if (Math.hypot(s.position.x - target.x, s.position.z - target.z) < 8) return;
  }
  // 白盒目标不是“走进圈就打勾”：时间、交火、护送信号、空袭转向与归路打开
  // 都是世界事实。圈只是玩家站位，事实门没满足就留在当前段落。
  const phase = PHASE_TABLE[state.phaseIndex];
  const gate = phase.whitebox?.objectiveGates?.[index] || null;
  if (gate) {
    const verdict = EvaluateFirstLevelObjectiveGate(gate, {
      elapsed: state.phaseTime,
      enemyDeaths: ai.deaths.ija || 0,
      signals: gate.signal && story.Signalled(gate.signal) ? [gate.signal] : [],
      voices: gate.voice && story.fired.some((beat) => beat.voice === gate.voice)
        ? [gate.voice] : [],
    });
    state.objectiveBlockedReason = verdict.ok ? null : verdict.reason;
    if (!verdict.ok) return;
  } else {
    state.objectiveBlockedReason = null;
  }
  ReachObjective(index);
}

/** 到达一个路标。剧本的 zone: 触发、下一条目标文案、烟柱重挂都挂在这里。 */
function ReachObjective(index) {
  const objectives = battlefield.objectives;
  const o = objectives[index];
  if (!o || o.reached) return;
  o.reached = true;
  o.contested = false;
  state.objectiveIndex = Math.min(index + 1, objectives.length);
  const phase = PHASE_TABLE[state.phaseIndex];
  const text = phase.objectives[state.objectiveIndex];
  if (text) {
    state.storyObjective = text;
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
  // StepFrames also enters here directly: terminal P012 screens freeze the entire world clock.
  if (p012Runtime?.completed || p012Runtime?.failed) {
    if (render) RenderScene(0);
    return;
  }
  const realDt = dt;
  // QTE 窗口走真实时间；下面玩家、AI、弹道、特效和叙事统一吃缩放后的玩法时间。
  // 这句必须在 state.elapsed 之前：否则慢的只有 AI，玩家/故事仍按正常速度飞过去。
  if (state.ready && meleeQte) meleeQte.Update(realDt);
  dt *= meleeQte?.TimeScale ?? 1;
  state.frame += 1;
  state.elapsed += dt;
  // 叠加层（Debug Rendering）不接管相机也不暂停玩法，所以它的每帧要排在
  // 所有分支之前 —— 排进下面任何一条 if 里，都会有一整类帧读不到新数。
  profiler.B("overlay");
  if (editor) editor.UpdateOverlays(dt);
  profiler.E("overlay");
  // 外部道具流送：跟着**相机**走（游戏里相机就在玩家头上；过场里跟运镜走，
  // 布景才不会在长焦端消失）。必须排在所有 return 分支之前。
  if (battlefield?.externalStreamer) {
    profiler.B("streamer");
    battlefield.externalStreamer.Update(camera.position.x, camera.position.z);
    profiler.E("streamer");
  }
  // 机队独立于玩法暂停与过场：它是远方连续发生的战场环境，不占用 AI / 物理预算。
  // **扫射航线不是**：它归玩法时间（strafe.Update 在下面那段里推），
  // 所以暂停/过场时 View() 停在原地不动，那一架就钉在航线上不再前进。
  aircraft?.Update(state.elapsed, strafe?.View() ?? null);

  // 预览片尾是终点，不是一个隐藏的 L0 游戏循环。即便调试/测试继续调用
  // StepFrames，也只保留静态画面，不再推进玩家、剧本或 AI。
  if (PREVIEW && state.previewDone && !(cutscene && cutscene.Playing)) {
    if (render) RenderScene(dt);
    return;
  }

  // 编辑器接管：与过场同一条通道 —— 玩法全停，只推编辑器与画面。
  // **必须排在过场那一条之前**：Timeline 编辑器要自己按走带的步长推
  // cutscene.Update（暂停、0.25 倍速、拖进度条全靠它），排在后面的话
  // 过场每帧会被推两次，走带上的速度与暂停一个都不生效。
  if (editor && editor.Capturing) {
    editor.Update(dt);
    // 阴影框跟着**编辑器相机**走。与过场那一条同一笔账：编辑器的自由飞行
    // 会把镜头带到离玩家几百米的地方，而阴影框留在玩家脚下 = 那一片一个
    // 影子都没有（画面上是「东西浮在地上」）。采样点出图全走这条分支。
    camera.getWorldDirection(_forward);
    // 特效编辑器直接驱动 VfxSystem；点光包络也必须同帧推进，否则预览里只有火球贴片，
    // 墙地仍旧不亮，退出编辑器才突然补算一大步。
    lights.Update(dt, state.elapsed, camera.position);
    lights.UpdateShadowFrustum(camera.position, _forward);
    if (render) RenderScene(dt);
    return;
  }

  // 过场期间：只推过场与画面，玩法全停。
  // 不停的话玩家会在看电影的时候被打死，而且 AI 会照常往前走 ——
  // 过场结束时战场已经不是过场开始时那个战场了。
  if (cutscene && cutscene.Playing) {
    cutscene.Update(dt);
    // 天、灯、烟尘还要活着：云在飘、火光在闪、常驻烟柱在冒 —— 这些不归玩法管。
    // 阴影框要跟着**过场相机**走，不能留在玩家脚下：独立布景在两千米外，
    // 阴影框留在城里等于整场布景没有阴影（看上去就是「人浮在地上」）。
    sky.Update(state.elapsed);
    lights.Update(dt, state.elapsed, camera.position);
    if (vfx) vfx.Update(dt, camera, state.elapsed);
    camera.getWorldDirection(_forward);
    lights.UpdateShadowFrustum(camera.position, _forward);
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

  profiler.B("input");
  const firePrev = input.fire;
  ReadKeys();
  EnsureDebugInventory();
  if (meleeQte?.Active) {
    input.forward = 0; input.strafe = 0; input.sprint = false;
    input.fire = false; input.ads = false;
    input.crouchPressed = false; input.pronePressed = false;
  }
  // 架着机枪：人钉在射手位上。移动/冲刺/开镜/换姿势一并封掉，**左键留着**
  // （它这会儿是机枪的扳机）。与白刃 QTE 同一条封法，不另起一套。
  if (emplacement?.Mounted) {
    input.forward = 0; input.strafe = 0; input.sprint = false; input.ads = false;
    input.crouchPressed = false; input.pronePressed = false;
  }
  fireEdge = input.fire && !firePrev;
  profiler.E("input");
  // 负重必须排在 player.Update **之前**：它写的 carrySpeedScale 就是这一帧
  // 玩家要用的那个乘数，写晚一帧就会出现「刚抬起来还能冲刺一步」。
  carry?.Update(dt, player);
  profiler.B("player");
  input.diveSpeedMps = p012Runtime?.DiveSpeed(strafe?.View());
  player.Update(dt, input, WEAPONS[currentWeapon]);
  profiler.E("player");
  // 架设机枪同样排在 player.Update **之后**：射界限位要夹的是这一帧的视线，
  // 夹晚一帧画面就会先越界再被拉回来。
  if (emplacement) {
    emplacement.SyncNpc(ai.soldiers);
    // 按住 R 排小卡。R 在键位表里是 press（没有松手边沿），所以按住这件事
    // 直接问 router 要 —— 比给 R 改成 holdAction 安全：那样 Reload() 会被调两次。
    if (emplacement.Mounted && router?.Down("KeyR")) emplacement.BeginClear();
    else emplacement.EndClear();
    emplacement.Update(dt, player);
    SyncEmplacementViews();
    // 「刚下枪位」那一个边沿：把上枪位之前的姿态还回去。用边沿而不是在 Vacate 里做，
    // 是因为离位有四条路（玩家按 F、人倒了、换关、战位被收掉），一条条挂钩会漏。
    const mountedNow = emplacement.MountedId;
    if (mountedIdLast && !mountedNow && seatStanceBefore) {
      player.stance = seatStanceBefore;
      seatStanceBefore = null;
    }
    mountedIdLast = mountedNow;
  }
  // 按住型交互反过来要排在 player.Update **之后**：够不够得着要用这一帧的位置，
  // 玩家走开一步进度就该断，而不是在后台接着读条。
  interact?.Update(dt, player);
  // 发报：码组推进与底噪。排在 interact **之后** —— 那一层这一帧刚可能
  // 把一组发出去。**什么都不封**：玩家可以边发边走开，进度留着（§7 不夺控制权）。
  telegraph?.Update(dt, player);
  // 负重与架设机枪都要收枪（两只手都占着 / 枪背在背上）。**只在边沿写 visible**：
  // 过场、菜单、倒地镜头三处也在切同一个字段，每帧写会互相盖掉。
  // 抬着东西的人被打死时负重会在同一帧卸掉，不挡住的话枪会在尸体镜头里冒出来。
  const handsBusy = !!carry?.Blocking || !!emplacement?.Blocking;
  if (viewmodel?.root && carryHidGun !== handsBusy) {
    carryHidGun = handsBusy;
    if (!state.cutscene && !state.menu && player.Alive) viewmodel.root.visible = !carryHidGun;
  }
  input.lookX = 0; input.lookY = 0;
  input.crouchPressed = false; input.pronePressed = false;

  // 落地是一次边沿事件，不能拿 grounded 每帧播。轻跳只给靴底闷响，
  // 高处跌落才叠 bodyFall；声音强度读实际下落速度折出的 impact。
  if (player.jump.landSerial !== lastLandSerial) {
    lastLandSerial = player.jump.landSerial;
    const impact = player.jump.landImpact;
    audio.Play("footstepRubble", { volume: 0.42 + impact * 0.38 });
    if (impact > 0.55) audio.Play("bodyFall", { volume: 0.22 + impact * 0.35 });
  }

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

  // 情境操作提示：每六帧扫一次。F 查询会遍历全场士兵，0.1 s 一次已经足够跟手；
  // 同一轮也重算换枪与包扎条件，保证 HUD 不会提示一个实际做不了的动作。
  if (state.frame % 6 === 0) {
    profiler.B("hud");
    UpdateContextualActionPrompts();
    profiler.E("hud");
  }

  if (player.Alive) TryFire(dt);
  // 松开左键时把攥着的手榴弹扔出去（投掷物槽里左键 = G 键的等价物）
  if (state.activeSlot === "throwable" && state.cooking && !input.fire) ReleaseCook();
  // 白刃蓄力步进。鼠标那条的"松手"在这里判（键盘那条走 OnAction 的 up 边沿）；
  // 蓄力中死了就取消 —— 尸体不出招。
  if (state.meleeCharge) {
    state.meleeCharge.t += dt;
    if (!player.Alive) { state.meleeCharge = null; viewmodel.CancelMeleeCharge?.(); }
    else if (state.meleeCharge.source === "mouse" && !input.fire) ReleaseMeleeCharge();
  }

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

  profiler.B("viewmodel");
  viewmodel.Update(dt, {
    dt, moveSpeed: Clamp01(Math.hypot(player.velocity.x, player.velocity.z) / 3.2),
    strafe: input.strafe, grounded: player.grounded, sprint: player.sprint,
    verticalVelocity: player.velocity.y,
    ads: player.ads, lookDeltaYaw: dYaw, lookDeltaPitch: dPitch,
    // 自由瞄准的**绝对**偏移（不是增量）：枪要真的指到那儿去。
    // 没有这两条的话，2° 锥内推鼠标只有弹道在偏、画面一动不动 ——
    // 而本作没有准星，玩家读不到任何东西（见 docs/Data_GunFeelReview.md 末节）。
    freeAimYaw: player.aimYaw, freeAimPitch: player.aimPitch,
    crouch: player.stanceBlend.crouch, elapsed: state.elapsed,
    // 枪感方子 1 的另一半：最后一发打完栓停在后面不推回。
    // 即使 HUD 已显示弹药，枪机停后仍是玩家不移开视线就能读到的空仓通道。
    lowAmmo: state.ammo <= 1,
    meleeQte: meleeQte?.ViewPose() || null,
  });
  profiler.E("viewmodel");

  // 友军倒下：叙事层要靠它触发「他倒了我上，我倒了你上」那几句。
  // 用计数差而不是回调 —— AiDirector 没有死亡事件，加一个回调等于改它的契约，
  // 而计数差在这里够用且不会漏（同一帧死两个人只报一次，叙事上也没差别）。
  const alliesNow = ai.CountSide("nra");
  if (state.prevAllies > 0 && alliesNow < state.prevAllies && story) story.Signal("allyDown");
  state.prevAllies = alliesNow;

  // 照明弹：升空→点燃→伞降燃烧→熄灭→暗适应，外加**发现距离倍率**。
  // **必须排在 ai.Update 之前**：倍率要在这一帧的 Think 之前写进 AiDirector，
  // 写晚一帧就成了「亮了，但这一帧还没有人看见」。灯与烟由它自己的宿主
  // 适配器写进 LightRig / VfxSystem，那两个的 Update 都排在后面（见下）。
  flare?.Update(dt);

  // 具名同伴的跟随目标。**必须排在 ai.Update 之前**：goal 要在这一帧的 Think
  // 之前写进去，写晚一帧就是「班长永远慢你一步」。它自己按 regoalS 分频，
  // 不是每帧都真的写（每帧写 goal 等于每帧打断寻路）。
  companion?.Update(dt);

  profiler.B("ai");
  ai.Update(dt, camera);
  profiler.E("ai");
  // 物理步进排在**人都走完之后、特效与投掷物之前**：
  // 玩家与 AI 是运动学体，它们这一帧的位移要先写进刚体，引擎再把碰撞体同步过去；
  // 手雷是动态刚体，它读的就是同步之后的那份位置。顺序反了会差一帧，
  // 表现为「手雷从刚跑过去的人身上穿过去」。
  profiler.B("physics");
  if (physics) physics.Step(dt);
  profiler.E("physics");
  profiler.B("vfx");
  vfx.Update(dt, camera, state.elapsed);
  profiler.E("vfx");
  profiler.B("combat");
  combat.Update(dt, { phase: PHASE_TABLE[state.phaseIndex] });
  // 日机扫射：弹着线推进、白名单结算、玩家躲避窗口。**必须排在下面那条
  // 死亡判定之前** —— 它打得倒玩家，排在后面那一类死法会被整帧吞掉
  // （与手榴弹/掷弹筒同一笔账，见死亡判定那段注释）。
  strafe?.Update(dt);
  // 枪弹／爆炸可能在这一帧刚开出新洞。渲染前把离玩家最近的破口流进材质，
  // 物理结果则已经在 Hit/Blast 的同一调用里立即生效。
  if (destruction) destruction.Update(player.position, dt);
  profiler.E("combat");

  // 投弹蓄力：按住 G/H 的时间同时决定扔多远和引信烧掉多少
  if (state.cooking) state.cook += dt;
  sky.Update(state.elapsed);
  lights.Update(dt, state.elapsed, camera.position);
  camera.getWorldDirection(_forward);
  lights.UpdateShadowFrustum(player.position, _forward);
  // 探针体（gi.Update）不在这里推，它挂在 RenderScene 上 —— 见那里的账。

  // 死亡判定必须放在**所有会造成伤害的系统都跑完之后**，并且用跨帧状态而不是
  // 帧内局部变量。玩家最常见的死法是被手榴弹/掷弹筒炸死，而爆炸结算在
  // combat.Update 里 —— 判定放在 player.Update 紧后面的话，那一类死法会被整个吞掉：
  // 不弹卡片、兵员池不扣、不换人，玩家永远躺在地上。
  // 脚本安排的无敌窗口（四关罗班长救顺子那 4—6 秒）：这一段是脚本不是战斗，
  // 死在里面会把整拍跳过去。被打倒时**不走死亡链路**，走检查点倒带 ——
  // 不扣兵员池、不弹死亡卡、不换人（Script_Checkpoint 的头注写着为什么）。
  if (state.playerAliveLast && !player.Alive && state.elapsed < scriptInvulnUntil) {
    if (checkpoint?.Rewind(2.0)) state.playerAliveLast = true;
  }
  if (state.playerAliveLast && !player.Alive) OnPlayerDown();
  state.playerAliveLast = player.Alive;
  if(p012Runtime?.failed){if(render)RenderScene(dt);return;}

  // 火墙（三关传单入火封住的那条追击路线）。**对玩家同样有伤害** ——
  // 它是封路，不是单向道具。烧完就把烟收掉。
  if (state.firewalls.length) {
    for (let i = state.firewalls.length - 1; i >= 0; i -= 1) {
      const wall = state.firewalls[i];
      if (state.elapsed > wall.until) {
        for (const handle of wall.smoke) vfx?.RemoveSmokeSource(handle);
        state.firewalls.splice(i, 1);
        continue;
      }
      if (!wall.damagePlayer || !player.Alive) continue;
      if (state.elapsed - wall.lastHurt < 0.6) continue;
      // 点到线段的距离：1.6 m 之内算站在火里。
      const dx = wall.bx - wall.ax;
      const dz = wall.bz - wall.az;
      const len2 = dx * dx + dz * dz;
      const t = len2 > 0
        ? Clamp(((player.position.x - wall.ax) * dx + (player.position.z - wall.az) * dz) / len2, 0, 1)
        : 0;
      const near = Math.hypot(player.position.x - (wall.ax + dx * t), player.position.z - (wall.az + dz * t));
      if (near > 1.6) continue;
      wall.lastHurt = state.elapsed;
      player.TakeHit(9, "legs", null, { fire: true });
      hud.Hint("火里过不去。", 1.6);
    }
  }

  // 脚本检查点：**排在死亡判定之后**，采的是这一帧最终的位置/姿态/血/弹。
  // 排在前面的话，被打死的那一帧也会被采进环里，倒带就退回到"刚好要死"的那一刻。
  checkpoint?.Update();

  profiler.B("story");
  if (p012Flow) {
    p012Runtime.Update(dt);
    p012Runtime.TryDitchDodge(player.position, player.stance, strafe?.View());
    if (p012Runtime.weaponActionPending && !viewmodel.IsBusy?.()) { p012Runtime.weaponActionPending = false; p012Runtime.weaponActionCount++; }
    const column = setpieces?.mem?.column;
    const columnActor = column?.Bearers?.[0]?.handle || column?.Alive?.[0]?.handle;
    const columnPosition = columnActor?.position || column?.HeadPosition() || null;
    const columnEnd = column?.waypoints?.at(-1);
    const columnAtEnd = !!column?.arrived && !!columnPosition && !!columnEnd
      && Math.hypot(columnPosition.x - columnEnd.x, columnPosition.z - columnEnd.z) < 8;
    const lastLitterArrived = LastLitterArrived(column);
    const zone = battlefield.objectives.find((item) =>
      Math.hypot(player.position.x - item.x, player.position.z - item.z) < item.radius);
    p012Flow.Update(dt, {
      ...p012Runtime.Sample(),
      position: player.position, yaw: player.yaw, stance: player.stance, sprint: player.sprint,
      zone: zone?.id || null, enemyDeaths: ai.deaths.ija || 0,
      scoutAlarm: ai.soldiers.some((soldier) => soldier.side === "ija" && state.elapsed - soldier.lastFire < 1),
      ammoDelivered: setpieces?.mem?.ammoDelivered || 0,
      clips: state.clips, ammo: state.ammo, grenades: state.grenades,
      woundedDragDelivered: !!setpieces?.mem?.p012WoundedDrag?.delivered,
      woundedDragDistance: setpieces?.mem?.p012WoundedDrag?.distance || 0,
      stretcherCarryDistance: setpieces?.mem?.p012CarryDistance || 0,
      carryDistance: setpieces?.mem?.p012CarryDistance || 0,
      lastLitterArrived,
      carryKind: carry?.KindId, columnArrived: columnAtEnd,
      bleeding: player.bleeding, bandages: player.bandages,
      columnPosition, columnAtEscortEnd: columnAtEnd,
      columnAtAirRoad: !!columnPosition && columnPosition.z >= 60 && Math.abs(columnPosition.x - 50) < 8,
      airColumnEnteredRoad: AirColumnEnteredRoad(column, player.position),
      roadWoundedPosition: setpieces?.mem?.p012RoadWoundedPosition || null,
      roadWoundedAtInspection: !!setpieces?.mem?.p012RoadWoundedAtInspection,
      airColumnTailPosition: (column?.litters || []).filter(litter=>litter.front?.handle?.alive&&litter.rear?.handle?.alive).map(litter=>({x:(litter.front.handle.position.x+litter.rear.handle.position.x)/2,z:(litter.front.handle.position.z+litter.rear.handle.position.z)/2})).sort((a,b)=>a.z-b.z)[0] || null,
      airColumnReady: !!column?.litters?.length && column.litters.every((litter)=>{
        const a=litter.front?.handle,b=litter.rear?.handle;
        return a?.alive && b?.alive && (a.position.z+b.position.z)/2>=68 && Math.abs((a.position.x+b.position.x)/2-50)<8;
      }),
      columnAtSouthAssembly: !!column?.litters?.length && column.litters.every((litter) => !litter.dropped && [litter.front,litter.rear].every((member) => member?.handle?.alive && Math.hypot(member.handle.position.x-42,member.handle.position.z-94)<6)),
    });
    if (story.Signalled("P012Complete")) {
      p012Runtime.completed = true; ShowPauseMenu(); menu.OpenSandboxComplete();
      profiler.E("story"); return;
    }
  }
  UpdateObjectives(dt);

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
    zone: playerZone ? ContentZoneId(playerZone) : null,
    objectiveIndex: state.objectiveIndex,
    objectiveCount: state.objectiveCount,
    levelSeconds: state.levelSeconds,
    pool: state.nraPool,
    p012Beat: p012Flow?.beat,
  });
  if (story.ObjectiveText && !p012Flow) state.storyObjective = story.ObjectiveText;
  // 章节摆点：**排在 story.Update 之后**。它的 onVoice 钩子读的是 story.fired，
  // 排在前面的话每一拍都要慢一帧 —— 「顺子喊完『老子回去压住！』就播转身那一场」
  // 这种同拍的事会看得出来差一帧。
  setpieces?.Update(dt);
  // 事件先改变白盒，再让玩家从改变后的世界里读到结果：护送队喊走后开院门，
  // 南路被切断后开归路。不存在悬浮解释卡，也不存在隐形空气墙。
  const openedScenarioGates = battlefield?.SyncScenario?.({
    objectiveIndex: state.objectiveIndex,
    signalled: (name) => story.Signalled(name),
  });
  if (openedScenarioGates > 0) navGrid?.Refresh(battlefield);
  profiler.E("story");

  // --- 结束条件 ---
  // **这座城没有"守住"这个结局。** 三月十七日它陷落，十八日午前肃清完毕，
  // 这是信史，不给玩家改。所以"赢"只有一种意思：这一关的目标链走完了。
  // 唯一的失败是池子空了 —— 「城里还站着的人」减到零，再没有人可以填上去。
  if (!state.outcome && state.nraPool <= 0 && !player.Alive) EndBattle("defeat");

  state.phaseTime += dt;
  const phase = PHASE_TABLE[state.phaseIndex];

  // --- 钉关（mechanics.pinFinalZone）---------------------------------------
  // 第五关最后一个路标是「返回最后火力点」，而阶段⑩⑪⑫（最后防守三层、
  // 最终白刃战、视角接替三段）全在它**之后**。按常规规则一踏进那个圈就
  // objectiveIndex ≥ objectiveCount，Script_Main 立刻换关，整段被吃掉。
  // 所以章节数据声明这条旗标之后，走到最后一个路标只是"到了"，
  // 要等 story.Signal("ChapterRelease") 才放行。
  //
  // 保险丝：信号一直不来的话，超过配置时长 + PIN_RELEASE_GRACE_S 自动放行并告警。
  // 没有它，一条忘了接的信号就是"这一关永远打不完"，而画面上完全看不出为什么。
  if (state.pinFinalZone && !state.chapterReleased) {
    if (story.Signalled(CHAPTER_RELEASE_SIGNAL)) {
      state.chapterReleased = true;
      state.chapterReleaseAt = state.phaseTime;
    } else if (state.phaseTime > state.levelSeconds + PIN_RELEASE_GRACE_S) {
      state.chapterReleased = true;
      state.chapterReleaseAt = state.phaseTime;
      console.warn(`钉关保险丝：${phase.id} 等不到 ${CHAPTER_RELEASE_SIGNAL}，`
        + `已超时 ${Math.round(state.phaseTime - state.levelSeconds)} s，自动放行`);
    }
  }
  const chapterPinned = state.pinFinalZone && !state.chapterReleased;

  // 换关：目标链走完，或者配置时长到了（史实时段是往前走的，不等玩家）
  const levelOver = !state.pinned && !chapterPinned
    && (state.objectiveIndex >= state.objectiveCount || state.phaseTime > state.levelSeconds);
  if (levelOver && !state.advancing && !state.outcome) {
    // 异步：建下一片切片要分帧走完。这里只管点火，别 await —— Frame 是同步的。
    AdvanceLevel().catch((error) => console.error("换关失败", error));
  }
  // 补兵（靶场不补战线，只把倒下的木桩兵按 RANGE_RESPAWN_S 复位）
  state.spawnAccumulator += dt;
  if (state.spawnAccumulator > 3) {
    state.spawnAccumulator = 0;
    profiler.B("spawn");
    if (RANGE) MaintainRangeTargets();
    else if (MELEE_TEST) MaintainMeleeTargets();
    else SeedSoldiers(phase);
    profiler.E("spawn");
  }

  // --- HUD ---
  profiler.B("hud");
  hud.SetObjective(state.storyObjective || phase.label, state.nraPool, null);
  hud.SetState({
    stance: player.stance,
    wounded: player.wounds.length > 0,
    bleeding: player.bleeding,
    bandages: player.bandages,
    breath: player.breathHold,
    order: state.order,
    ammo: state.ammo,
    clips: state.clips,
    magazine: weapon?.magazine ?? 0,
    armed: Number(weapon?.magazine) > 0,
    grenades: state.grenades,
    bundles: state.bundles,
    mortar: combat.MortarReady ? combat.MortarLeft : 0,
    cooking: state.cooking ? Math.min(1, state.cook / 1.1) : 0,
  });
  // 标准 FPS 规则：准心固定屏幕中心。枪体动画不能拖着 HUD 基准移动；
  // 默认难度下 AimDirection 与 ViewDirection 共轴，开镜时机械瞄具也解到同一中心。
  // 缝画的是**这一枪真实的散布锥**（player.SpreadDeg），不是手感常数 —— 见 Hud.SetCrosshair。
  // 大刀与手榴弹没有散布可言，给固定小十字，别拿步枪的锥去骗人。
  // 判据是 spreadHipDeg（只有枪才有），不是 magazine —— 手榴弹的 magazine 是
  // "身上还剩几颗"，拿它当"这是一把枪"会让攥着弹的时候画出一个 3° 的假锥。
  // 架着机枪时准心画的是**机枪**的散布锥（Script_Emplacement 的 spreadDeg），
  // 不是背上那支步枪的 —— 拿步枪的锥去骗人比不画还差。
  const empView = emplacement?.View() || null;
  const firearm = empView ? true : Number(weapon?.spreadHipDeg) > 0;
  const spreadDeg = empView ? empView.spreadDeg : (firearm ? player.SpreadDeg(weapon) : 0);
  hud.SetCrosshair({
    // 抬着东西时准心收掉：枪不在手上，画一个散布锥就是在骗人。
    // 架着机枪反过来**要**留着：弹道收敛到准心指着的那个点上（EMPLACED_CONVERGE_M）。
    visible: DIFFICULTY.showCrosshair !== false && player.Alive
      && !state.ordersOpen && !state.cutscene && !meleeQte?.Active && !carry?.Blocking,
    spreadDeg,
    fovDeg: camera.fov,
    viewportHeight: window.innerHeight,
    armed: firearm,
    sprint: player.sprint,
    ads: player.ads,
    dt,
  });
  // 准心指着谁。写实档（targetInfo=false）整条链短路，不扫也不投射线。
  hud.SetTarget(identify.Update(dt, {
    eye: _idEye.copy(player.EyePosition),
    dir: player.AimDirection(_idAim),
    soldiers: ai.soldiers,
    // extras：载具与固定火力点按 Script_Identify 的字段契约挂进来。
    // 战车系统还没进正片（Data_Levels 的 vehicles 仍是设计数据），所以现在是空的。
    detail: player.Alive && !state.ordersOpen && !state.cutscene && !meleeQte?.Active
      ? (DIFFICULTY.targetInfo ?? "basic") : false,
    spreadDeg,
  }));
  hud.SetSuppression(player.suppression);
  hud.SetMeleeQte(meleeQte?.View() || null);
  // 按住型交互的进度环 + 负重条。两者都只读脱敏快照，HUD 不认识规则层的结构。
  hud.SetInteractProgress(interact?.View() || null);
  hud.SetCarry(carry?.View() || null);
  // 架设机枪面板（热条 / 弹药 / 卡壳 / 退出提示）。同样只读脱敏快照。
  hud.SetEmplacement(empView);
  // 报码纸（终章亲手发报）。同样只读脱敏快照。
  hud.SetTelegraph(telegraph?.View() || null);
  // 受伤反馈三层（底噪 / 红闪 / 濒死搏动）＋ 来弹方位，见 Hud.SetHurt。
  // 这里原来是一行 `SetDamage(Clamp01(1 - health/70) * 0.62)` ——
  // 满血挨一发三八式（当时 39.6 点）之后暗角只有 0.088 × 边缘 0.52 ≈ 看不见，
  // 而再挨一发人就没了。玩家说的"连红框都没有"指的就是这一行。
  hud.SetHurt({
    health: player.health,
    flash: player.hitFlash,
    marks: player.hitMarks,
    yaw: player.yaw,
  });
  PlayHurtCues();
  const p012Target = p012Flow?.CurrentObjective().target;
  const markerObjectives = p012Target ? battlefield.objectives.map((item, index) =>
    index === state.objectiveIndex ? { ...item, x: p012Target.x, z: p012Target.z } : item)
    : battlefield.objectives;
  hud.UpdateMarkers(markerObjectives, camera, (x, y, z) => {
    _proj.set(x, y, z);
    const dist = _proj.distanceTo(camera.position);
    _proj.project(camera);
    return {
      x: (_proj.x * 0.5 + 0.5) * window.innerWidth,
      y: (-_proj.y * 0.5 + 0.5) * window.innerHeight,
      visible: _proj.z < 1 && Math.abs(_proj.x) < 1 && Math.abs(_proj.y) < 1,
      dist,
    };
  }, state.objectiveIndex);
  // 活手榴弹进入实际爆炸伤害范围才提示；屏内钉住落点，屏外贴边指方向。
  // 单独再投影一次最多只有四颗，避免把目标路标与爆炸警告绑成一套生命周期。
  hud.UpdateGrenadeWarnings(combat.GrenadeThreats(player.position), player, (x, y, z) => {
    _proj.set(x, y, z);
    _proj.project(camera);
    return {
      x: (_proj.x * 0.5 + 0.5) * window.innerWidth,
      y: (-_proj.y * 0.5 + 0.5) * window.innerHeight,
      visible: _proj.z > -1 && _proj.z < 1 && Math.abs(_proj.x) < 1 && Math.abs(_proj.y) < 1,
    };
  });
  hud.UpdateMinimap(dt, {
    player, objectives: battlefield.objectives, soldiers: ai.soldiers, bounds: battlefield.bounds,
  });
  hud.Update(dt);
  profiler.E("hud");

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
  const phase = PHASE_TABLE[state.phaseIndex];
  // 剖析：GPU 帧从这里开到 post.Render 之后 —— GI 的几趟探针 pass、阴影烘焙、
  // 整条合成链都在这个窗口里按段计时（剖析器关着时这些调用是空转）。
  profiler.GpuFrameStart();
  // 探针体每帧推一批。**必须挂在这里，不能挂在玩法那条分支上** ——
  // 出画的路一共四条（玩法 / 过场 / 菜单 / 编辑器），以前只有玩法那条推 GI。
  // 后果：编辑器一打开玩法就停摆，探针一个都不再收敛，Debug Rendering 面板的
  // 辐照度图集永远停在 warmed = 0 的全黑上（那不是着色器的问题，是这里没推）；
  // 过场同理 —— 开场就播过场的关，一整段室内间接光都不收敛。
  // 摆在 shadowMap.needsUpdate 之前，与它原来在玩法分支里的相对次序一致；
  // GI 那几趟画的是自己的全屏四边形（那个场景里没有灯），
  // WebGLShadowMap.render 在 lights.length === 0 时就 return 了，
  // 不会把 needsUpdate 清掉，这一帧的阴影照常烘。
  if (gi) {
    profiler.B("gi");
    profiler.GpuPush("gi");
    gi.Update(dt, camera.position, lights);
    // Global SH 基线按探针体的淡入量退让：两边都开就是双份天光，屋里会亮得像在院子里
    lights.SetGiActive(gi.uniforms.enabled.value);
    profiler.GpuPop();
    profiler.E("gi");
  }
  // 这一帧的阴影图在下面第一次 renderer.render 时烘，烘完 three 自己把
  // needsUpdate 清掉（autoUpdate 已在渲染器那里关掉，见那一行的账）。
  renderer.shadowMap.needsUpdate = true;
  ssao.map.value = post.AoTexture;
  // gl_FragCoord 在主靶的像素域里，喂 AO 靶尺寸会整张错位
  ssao.resolution.value.set(post.width, post.height);
  ssao.strength.value = SSAO_BASE * graphics.ssao;
  // 天空穹跟着相机走。它是一只半径 4000 m 的球，原来钉在原点 ——
  // 过场把独立布景摆到 (4000,4000) 之后相机就在球**外面**，画面上是一块
  // 黑底上的大亮盘（出川过场那张「什么鬼背景」就是这个）。着色器用的是
  // 「相机到顶点」的方向，所以球心摆哪里都不影响天的样子，跟着相机最稳。
  sky.mesh.position.copy(camera.position);
  // 过场可以自带天空（cut.sky）：正在播的过场套了预设就按它的后期参数走，
  // 否则按本关的。夜战预设 exposure 3.6、白天 0.5，抄错一档整帧就黑/就白。
  const skyName = cutsceneSky || phase.sky;
  const preset = SKY_PRESETS[skyName] || SKY_PRESETS[phase.sky];
  // 粒子层要与合成 pass 共用同一份雾：它不进深度法线预通道，合成 pass 那趟
  // 又明写"深度 0 的天空不吃雾"，于是背景是天空的粒子像素一点雾都吃不到 ——
  // 两百米外的黑烟柱会在天上留一个越长越大的纯黑洞。这三行是把那一半补回来：
  // 预通道靶（判断背景是不是天空 + 软粒子）、雾参数、太阳方向（雾的朝阳增益）。
  // SetSize 会重建靶，纹理引用每帧都可能换，所以每帧重接，不能只在初始化接一次。
  vfx.SetDepthSource(post.NormalDepthTexture, post.width, post.height);
  vfx.SetFog(preset.fog, preset.sunColor);
  vfx.SetSun(sky.sunDirection);
  // 水面与粒子层同一批账：时间推进 + 深度源每帧重接（SetSize 会换纹理引用）
  UpdateWaterSurfaces(dt, post.NormalDepthTexture, post.width, post.height);
  // 音频听者也在这儿接 —— 和上面三行同一类账：接口写好了，没人调。
  //
  // 事故：AudioEngine.SetListener 全仓库零调用点，于是 WebAudio 的 listener
  // 一辈子停在世界原点、朝着 −Z。序·界河的可玩切片在 z = −1470，实测每一发枪声
  // 算出来的距离都是一千四百米，而**混响 send 是在 Panner 之前分出去的、不吃距离衰减**：
  // 直达声被 panner 压到千分之六听不见，湿声却按 wetScale = 1 + 0.03d 顶到上限 2.6 倍。
  // 玩家听到的于是不是枪声，是全场每一发枪的混响尾巴同时糊在一起 —— 没有方向
  // （距离 ≥ 25 m 一律 equalpower，HRTF 从来没开过）、没有高频（空气低通钳在 700 Hz 的地板上）、
  // 密密麻麻一片。城里几关更隐蔽：原点正好是十字街口，听起来"有声音"，但全城的枪
  // 都按你站在街心算，走到哪里都一样响。
  //
  // 放在这里而不是 Frame() 里：过场与主菜单的相机不走 Frame 那条路，
  // 但三者都从 RenderScene 出画（见上面那段注释），接在这儿一次覆盖三种镜头。
  camera.updateWorldMatrix(true, false);   // 取的是这一帧的位姿，不是上一帧的
  audio.SetListener(camera);
  // 整帧唯一一次世界矩阵更新（见 scene.matrixWorldAutoUpdate = false 那里的账）。
  // 必须排在天空穹跟位、相机 updateWorldMatrix 之后 —— 它们改的是这一帧的位姿。
  profiler.B("matrix");
  scene.updateMatrixWorld();
  profiler.E("matrix");
  // 视模自阴影是独立 offscreen depth pass：必须等本帧手臂 IK / 枪姿矩阵更新完，
  // 又必须排在主颜色 pass 前，材质才能采到同一帧的手—枪遮挡。
  if (firstPersonSelfShadow?.enabled) {
    profiler.B("firstPersonShadow");
    profiler.GpuPush("firstPersonShadow");
    firstPersonSelfShadow.Render(sky.sunDirection);
    profiler.GpuPop();
    profiler.E("firstPersonShadow");
  }
  // 人物合批的实例矩阵读的就是刚算完的那份 matrixWorld，所以必须排在这后面。
  profiler.B("actorBatch");
  if (actorBatch) actorBatch.Update(camera);
  profiler.E("actorBatch");
  const suppression = player ? player.suppression : 0;
  const health = player ? player.health : 100;
  // 阵亡画面先在 3D 合成链里做「前景清楚、背景重度散焦」，HUD 的半透明
  // mask 与生平卡随后由浏览器叠上去。死亡最初 0.32 秒渐入，和 UI 遮罩同步。
  const deathDof = player && !player.Alive ? Clamp01(player.deadTime / 0.32) : 0;
  // 跟相机自己的 ADS 过渡而不是枪模动画走：同一趟 150 ms 收放，拉栓/装填时
  // 又会被 adsSuppress 自然摘掉。没有铁瞄的刀/手雷不属于「开镜」，不触发。
  const adsNearDof = state.running && !state.menu && !state.cutscene && player?.Alive
    && viewmodel?.root?.visible && viewmodel?.rig?.sight
    ? Clamp01(adsFovT * (viewmodel.adsSuppress ?? 1)) : 0;
  profiler.B("post");
  post.Render(scene, camera, {
    sunDirection: sky.sunDirection,
    sunColor: preset.sunColor,
    fog: preset.fog,
    exposure: preset.exposure,
    bloom: preset.bloom * graphics.bloom,
    godStrength: graphics.godEnabled ? preset.godStrength * graphics.god : 0,
    saturation: preset.saturation * (1 - suppression * 0.35),
    contrast: preset.contrast,
    grain: (skyName === "night" ? 0.020 : 0.014) * graphics.grain,
    vignette: (0.42 + suppression * 0.22) * graphics.vignette,
    damage: Clamp01(1 - health / 62) * 0.55,
    // DOF 要把近景钉清楚；死亡时再叠相机运动模糊会把前景也抹掉，焦点层级就没了。
    motionBlur: 0.15 * graphics.motionBlur * (1 - deathDof),
    dofStrength: deathDof,
    dofFocus: 1.5,
    dofRange: 2.8,
    dofMaxPx: 11.0,
    nearDofStrength: adsNearDof * ADS_NEAR_DOF_STRENGTH,
    nearDofFocus: ADS_NEAR_DOF_FOCUS_M,
    nearDofRange: ADS_NEAR_DOF_RANGE_M,
    nearDofMaxPx: ADS_NEAR_DOF_MAX_PX,
  });
  profiler.E("post");
  profiler.GpuFrameEnd();
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
    profiler.BeginFrame(performance.now());
    // 编辑器接管时必须压过主菜单。否则从菜单打开场景编辑器后，
    // StepFrames 只会推进菜单运镜，换切片后编辑器无法把地形/碰撞层接到新场景。
    if (!(editor && editor.Capturing) && state.menu && menu && menu.live) MenuFrame(dt, render);
    else Frame(dt, render);
    profiler.EndFrame();
  }
}

// ---------------------------------------------------------------------------
// 指针锁：五条解锁通道（函数本体在「输入」一节，跟 RequestPointerLock 放一起）
// ---------------------------------------------------------------------------
document.addEventListener("pointerlockchange", OnPointerLockChange);
window.addEventListener("blur", () => {
  altMouseFree = false;
  ReleasePointerLock();
  // 预览没有玩家控制权；失焦时直接走一次与 Esc 相同的收口路径，避免
  // 标签页隐藏后留下一个永远占着相机/字幕层的 Promise。
  if (PREVIEW && cutscene && cutscene.Playing) {
    cutscene.Skip();
    cutscene.Update(99);
  }
});
window.addEventListener("pagehide", ReleasePointerLock);
// 标签页切到后台也放掉：blur 管的是窗口失焦，visibilitychange 管的是标签切换 /
// 最小化；两条并不总是一起来。锁挂在一个看不见的标签上，等于把鼠标夹在一个
// 用户看不见的矩形里（Windows 上指针锁就是 ClipCursor，见 FAKE_POINTER_LOCK 注释）。
document.addEventListener("visibilitychange", () => { if (document.hidden) ReleasePointerLock(); });
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  // 过场里 Esc 是"跳过"，交给 CutsceneDirector 自己的监听；这里只管游戏中的退出
  if (state.cutscene) return;
  // 有菜单时 Esc 是「暂停」：ER2 也是这个键。菜单自己那份 Esc 管的是面板返回，
  // 两边不会打架 —— 它只在 menu.open 时响应，这里只在游戏中响应。
  if (menu && state.running) {
    event.preventDefault();
    PauseGame();
    // MainMenu 也监听 Esc；不截住同一次事件，它会在暂停层刚打开后立刻执行「继续」。
    event.stopImmediatePropagation();
  }
});

let last = performance.now();
function Loop(now) {
  requestAnimationFrame(Loop);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  // Script_CutsceneShot 的 manual=1 是一个明确的时钟所有权切换：只允许
  // window.Taierzhuang.StepFrames() 推进，不能让 rAF 在两次截图之间偷偷加
  // 时间。普通 ?shot 页面不带 manual，仍按实时循环运行。
  if (MANUAL_STEP) return;
  // 剖析帧边界包在分支外面：LoopStep 的三条早退路径（菜单帧 / 停摆）也各是一帧。
  profiler.BeginFrame(now);
  LoopStep(dt);
  profiler.EndFrame();
}
function LoopStep(dt) {
  // 预热着色器的那几帧不出画（见 WarmupShaders）：屏幕上盖着加载画面，
  // 而这时候渲染一帧就等于把要摊开的那笔编译账一口气同步付掉。
  if (state.warming) return;
  // 菜单态：只推运镜与画面（玩法停摆）。暂停态两个都是 false —— 世界冻住，
  // 最后那一帧留在屏幕上，菜单盖在它上面，这正是暂停该有的样子。
  // 编辑器与菜单都要独占相机；编辑器优先，以便能从菜单里的设置入口直接编辑切片。
  if (!(editor && editor.Capturing) && state.menu && menu && menu.live && state.ready) {
    MenuFrame(dt);
    return;
  }
  // 过场没有自己的帧驱动，全靠 Frame() 里那条 cutscene 分支推。
  // 而从主菜单进关时 state.running 还是 false（要等过场播完才 StartRun）——
  // 不放行的话「开始」会卡死在关前过场里：过场在等一个永远不来的帧，
  // 而 StartRun 在等过场结束。关卡之间那条路之所以没暴露这个坑，
  // 是因为换关时玩家还在游戏里，state.running 一直是 true。
  // 从主菜单或暂停菜单打开编辑器时 running 都是 false；仍要让编辑器更新，
  // 否则切片重建完成后的 GroundHeight、碰撞和地形网格无法重新挂载。
  if (!state.running && !(cutscene && cutscene.Playing) && !(editor && editor.Capturing)) return;
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
  // 排在 SetSize 之后：SetSize 按当前的 taaEnabled 建靶，这一行才是改它的人。
  // 反过来的话，刚打开 TAA 的那一次 SetSize 会漏建历史靶（要等下一次改分辨率才补）。
  post.SetTaaEnabled(graphics.taa !== false);

  // 玩家可单关第一人称自阴影，但「阴影」总闸关闭时它也必须一起停：否则面板说
  // 阴影已关，枪上却还留着一层独立阴影，会成为两套互相矛盾的设置语义。
  firstPersonSelfShadow?.SetEnabled(!!graphics.shadows && graphics.firstPersonSelfShadow !== false);

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
  // GI 开关是三件事（low 档没有 GI 配置，三件都不做）：
  //  1) 惰性构造 —— 出厂默认关，boot 不建 ProbeVolume；第一次打开才建，
  //     并补挂当前战场的碰撞盒表（boot 早期 battlefield 还没有时，
  //     EnterLevel 的 gi.SetWorld(battlefield) 会接上）。
  //  2) 材质重编译 —— 探针采样代码是**编译期**的（giUniforms.sampling 进了
  //     cache key），只翻标志不重编译的话画面还跑着旧程序。与上面阴影开关
  //     同一个先例，代价同样是一次性的几百毫秒。库缓存里暂不在场的材质也要标：
  //     它们换关会被挂回来，而 three 不会为没 needsUpdate 的材质重查 cache key。
  //  3) 运行态开关 —— 关闭要立刻退回 Global SH 基线（blend 清零 + SetGiActive(0)）。
  if (GI_ON) {
    const wantGi = !!graphics.gi;
    if (wantGi && !gi) {
      gi = new ProbeVolume(renderer, { quality: QUALITY, skyUniforms: sky.uniforms, uniforms: giUniforms });
      if (battlefield) gi.SetWorld(battlefield);
    }
    if (giUniforms.sampling !== wantGi) {
      giUniforms.sampling = wantGi;
      const Recompile = (material) => { if (material) material.needsUpdate = true; };
      scene.traverse((object) => {
        const material = object.material;
        if (Array.isArray(material)) material.forEach(Recompile); else Recompile(material);
      });
      for (const material of library.materials.values()) Recompile(material);
      for (const material of library.staticMaterials.values()) Recompile(material);
    }
    if (gi) {
      gi.enabled = wantGi;
      if (!gi.enabled) { gi.blend = 0; gi.SyncUniforms(); lights.SetGiActive(0); }
      const preset = SKY_PRESETS[PHASE_TABLE[state.phaseIndex].sky];
      if (preset) gi.ApplyPreset(preset, graphics.giStrength);
    }
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
  // 交给开机守望补一颗「重试」按钮（老缓存里的 index.html 可能还没有守望，所以带 ?.）
  window.__bootGuardFail?.(error.message, false);
  console.error(error);
  throw error;
});
