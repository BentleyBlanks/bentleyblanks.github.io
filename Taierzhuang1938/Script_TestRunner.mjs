// ===========================================================================
// Script_TestRunner.mjs —— 台儿庄白盒的测试分级入口
//
// 现有测试按爆炸半径分三档，并按执行时机提供 profile：
//   quick：默认，纯 Node 快测 + 改动领域的纯 Node 探针。
//   prepush：领域完整探针 + 由文件风险触发的 Boot/Play/Geo 门禁。
//   full：旧版完整 Tier 0 + 领域探针；--tier=0/1/2 保持兼容。
//   Tier 1：按领域触发的自动深度探针；--changed 可从 Git 改动自动推断。
//   Tier 2：对机器敏感或需要人工看图的低频审查，不被 --changed 自动触发。
//
// 常用命令：
//   node Taierzhuang1938/Script_TestRunner.mjs
//   node Taierzhuang1938/Script_TestRunner.mjs --changed=origin/master
//   node Taierzhuang1938/Script_TestRunner.mjs --profile=prepush --changed=origin/master
//   node Taierzhuang1938/Script_TestRunner.mjs --profile=full --changed=origin/master
//   node Taierzhuang1938/Script_TestRunner.mjs --domain=terrain
//   node Taierzhuang1938/Script_TestRunner.mjs --tier=1
//   node Taierzhuang1938/Script_TestRunner.mjs --tier=2
//   node Taierzhuang1938/Script_TestRunner.mjs --only=PlayTest
//   node Taierzhuang1938/Script_TestRunner.mjs --list
//
// 默认只透出子测试的阶段行和每分钟心跳；失败时打印尾部，--verbose 透传全程。
// PlayTest 的历史红按断言名显式基线化：历史红仍显示，但只有新增红使默认命令失败；
// --strict-baseline 可让历史红也返回失败。
// ===========================================================================

import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const fileHere = fileURLToPath(import.meta.url);
const dirHere = path.dirname(fileHere);
const repoRoot = path.resolve(dirHere, "..");
const requireHere = createRequire(import.meta.url);
const defaultTimeoutMs = 10 * 60 * 1000;
const heartbeatMs = 60 * 1000;
const maxCaptureChars = 4 * 1024 * 1024;
const browserLockPath = path.join(os.tmpdir(), "Taierzhuang1938_BrowserTests.lock");
const browserLockPollMs = 5 * 1000;
const browserLockTimeoutMs = 30 * 60 * 1000;

const playTestExpectedFailures = [
  // 「击杀回执 killConfirm」2026-08-26 已修并摘除：红的根源是测试自己的零余量竞态 ——
  // 等拉栓的 120 帧里友军把摆好的靶子磨死，第二枪打的是尸体，ConfirmHit 不会被调用。
  // 场景/布设类提交改了友军射界就翻红。现在等待期把靶子血垫到打不死（见 Script_PlayTest 11.6）。
  // 「玩家亲手击杀」「打中回执」「打死回执」三条已转绿（击杀测试的陈旧枪口 bug
  // 已修：转向后推两帧再取瞄准线），按 runner 提示从基线摘除。
  // 「六十秒内全场开火 > 200」两条是**临界抖动**：2026-08-27 同一天先转绿
  // （221+）又转红（146/153）——量的是真实墙钟六十秒内的开火数，对机器负载、
  // 帧率、战斗随机走向都敏感，200 的阈值正好切在分布中间。别再按单次结果
  // 摘除或惊慌，连续多轮稳定 >200 再摘。
  "六十秒内全场开火计数 > 200",
  "头六十秒全场开火 > 200",
  // 「P4 夜袭的携行是 L3_WhiteTowel」2026-08-28 转绿并摘除：任务流程重制之后
  // 夜袭那一章（CH4 东关之夜）在 Data_MissionCh4 里**显式**声明 loadout:"L3_WhiteTowel"，
  // 不再靠 loadoutOverride 蒙对；判据是确定的，红了就是真回归。
  // 「姿态决定被发现的距离」2026-08-29 转绿并摘除：它测的是 Script_Ai.SIGHT_BY_STANCE
  // 那三档（站 120 / 蹲 80 / 卧 45）与视线判据，判据本身是确定的 ——
  // 当初留在基线里是因为"纯 master 红、合并树绿"的判定抖动，现在两边一致。
  // 红了就是真回归（照明弹那条全局倍率是最可能的嫌疑：它乘的是倍率不是这张表）。
  "Esc / 切走 / 关页 / 切后台 四条通道都会把鼠标还给用户",
];

export const testDefs = {
  BootTest: {
    file: "Script_BootTest.mjs",
    timeoutMs: 4 * 60 * 1000,
    desc: "七关开机冒烟 + draw call/triangles 红线",
  },
  PlayTest: {
    file: "Script_PlayTest.mjs",
    timeoutMs: 20 * 60 * 1000,
    expectedFailures: playTestExpectedFailures,
    desc: "真浏览器端到端通关，130 条断言，跨模块安全网",
  },
  BootStallTest: {
    file: "Script_BootStallTest.mjs",
    timeoutMs: 5 * 60 * 1000,
    desc: "一张贴图挂死不许把开机吊在「加载 PBR 材质」上",
  },
  BootPayloadTest: { file: "Script_BootPayloadTest.mjs", desc: "开机贴图字节红线：PBR_SETS 的总量/单张上限与 URL 存在性（纯 Node，毫秒级）" },
  GeoTest: { file: "Script_GeoTest.mjs", desc: "几何快路等价性：MakeBox/PlaceGeometry 与 three 通用路逐浮点相同" },
  RoadPathTest: { file: "Script_RoadPathTest.mjs", desc: "样条道路中心线契约：过点/弧长/切向/缺口/采样（纯 Node，毫秒级）" },
  WallPlanTest: { file: "Script_WallPlanTest.mjs", desc: "样条围墙规划契约：贴地/缺口/闭环角搭/塌段/确定性（纯 Node，毫秒级）" },
  TestRunnerTest: { file: "Script_TestRunnerTest.mjs", desc: "分级选择、基线和登记完整性（纯 Node）" },
  ModuleGraphTest: { file: "Script_ModuleGraphTest.mjs", desc: "index.html import map 盖满浏览器模块图、禁源码自写 ?v=（纯 Node，秒级）" },
  HudPromptTest: { file: "Script_HudPromptTest.mjs", desc: "HUD 提示规则（纯 Node，秒级）" },
  CarryTest: { file: "Script_CarryTest.mjs", desc: "担架/搬运负重状态机 + 可注册交互框架三手势 + 八个救护预制（纯 Node，毫秒级）" },
  EmplacementTest: { file: "Script_EmplacementTest.mjs", desc: "架设机枪位：接管/离位、射界限位、过热曲线、两种卡壳、NPC 占位互斥、补弹（纯 Node，毫秒级）" },
  AircraftStrafeTest: { file: "Script_AircraftStrafeTest.mjs", desc: "日机扫射航线：相位机四拍、弹着线推进与追人群、必死/必不死白名单、玩家躲避窗口、音效降级（纯 Node，毫秒级）" },
  FlareTest: { file: "Script_FlareTest.mjs", desc: "照明弹：五相位时间线、光强包络、敌我暴露倍率与暗适应、姿态比例不变、定时序列、音效降级（纯 Node，毫秒级）" },
  TelegraphTest: { file: "Script_TelegraphTest.mjs", desc: "发报：码组推进、接头松脱与重连、报码纸勾选、走开进度保留、两个交互点预制、音效降级（纯 Node，毫秒级）" },
  RiggedModelTest: { file: "Script_RiggedModelTest.mjs", desc: "第一人称手臂 GLB 的二进制契约（纯 Node，秒级）" },
  CharacterModelTest: { file: "Script_CharacterModelTest.mjs", desc: "十名蒙皮士兵：16 动作、骨骼挂点、命中体与阵营分配契约（纯 Node）" },
  CharacterHitboxMathTest: { file: "Script_CharacterHitboxMathTest.mjs", desc: "人物子弹代理：精确球/胶囊首交点（纯 Node）" },
  ActorDepthTest: { file: "Script_ActorDepthTest.mjs", desc: "蒙皮人物写入 NormalDepth，防 TAA 把背景叠回军装" },
  ExternalPropAssetTest: { file: "Script_ExternalPropAssetTest.mjs", desc: "外部构件 GLB 节点、尺度与面数预算（纯 Node）" },
  FractureBakeTest: { file: "Script_FractureBakeTest.mjs", desc: "预破碎离线数据（纯 Node，秒级）" },
  CutsceneControlTest: { file: "Script_CutsceneControlTest.mjs", desc: "过场导演机位/生命周期（桩 three，Node 可跑）" },
  MissionHooksTest: { file: "Script_MissionHooksTest.mjs", desc: "任务流程引擎钩子：关中过场 beat / Signal→过场、LEVEL_CUES 七章自动构建、具名同伴 Locate 与剧本指令、脚本检查点倒带、钉关原语（纯 Node，毫秒级）" },
  MissionSetpiecesTest: { file: "Script_MissionSetpiecesTest.mjs", desc: "章节摆点：七章 Setup 不抛、台词节拍与信号名对得上、INT1 六条对接项、后送队队列控制器、装配层接线（纯 Node，毫秒级）" },
  PhysicsTest: { file: "Script_PhysicsTest.mjs", desc: "真浏览器撞墙：碰撞扫掠" },
  ColliderTest: {
    file: "Script_ColliderTest.mjs",
    timeoutMs: 14 * 60 * 1000,
    desc: "碰撞盒对账：摸得着的墙必须看得见（窗洞不许被堵死、砌体不许没盒子）",
  },
  JumpTest: { file: "Script_JumpTest.mjs", desc: "跳跃/落点手感" },
  DestructionTest: { file: "Script_DestructionTest.mjs", desc: "墙体破坏状态机" },
  AiBehaviorTest: { file: "Script_AiBehaviorTest.mjs", desc: "AI 行为决策深度探针" },
  VisibilityTest: { file: "Script_VisibilityTest.mjs", desc: "战场内容预算：名额/空洞/尸体上限" },
  DamageTest: { file: "Script_DamageTest.mjs", desc: "伤害口径重放（TTK 对照）" },
  GunFeelTest: { file: "Script_GunFeelTest.mjs", desc: "枪感短链八条" },
  FixedCenterAimTest: { file: "Script_FixedCenterAimTest.mjs", desc: "HUD/弹道/照门三心归一回归" },
  ReticleCalibrationTest: { file: "Script_ReticleCalibrationTest.mjs", desc: "ADS 放大准心校准与退出还原" },
  SprintCrosshairTest: { file: "Script_SprintCrosshairTest.mjs", desc: "动态准心＝真实散布投影（真 Shift+W 路径）" },
  AdsSightTest: { file: "Script_AdsSightTest.mjs", desc: "开镜视野：五支枪的瞄准点不许被枪身糊住" },
  BayonetTest: { file: "Script_BayonetTest.mjs", desc: "刺刀：装卸、空枪白刃、蓄力分挥砍/劈刺" },
  RangeTest: { file: "Script_RangeTest.mjs", desc: "玩法测试靶场（?range=1）：木桩兵 + 枪/镜/刀/刺刀/手榴弹全链路" },
  MeleeQteTest: { file: "Script_MeleeQteTest.mjs", desc: "白刃 QTE（?melee=1）：三格挡 + 三处决 + 慢动作/HUD/骨骼/辅助输入全链" },
  TownDressingTest: { file: "Script_TownDressingTest.mjs", desc: "城内每户布设的硬规则（纯 Node，秒级）" },
  WestDistrictCoverageTest: { file: "Script_WestDistrictCoverageTest.mjs", desc: "L4 总览完整生成西关 5 地标与 137 件布设" },
  WestSuburbBlocksTest: { file: "Script_WestSuburbBlocksTest.mjs", desc: "西关 20 个示意图矩形整块覆盖、净空与院落几何" },
  WestStationTest: { file: "Script_WestStationTest.mjs", desc: "津浦路滕县站构件、信号与货运作业物冒烟" },
  DressingProbeTest: { file: "Script_DressingProbeTest.mjs", timeoutMs: 12 * 60 * 1000, desc: "七关布设外部构件的重叠/浮空探针（真浏览器）" },
  SprintViewmodelTest: { file: "Script_SprintViewmodelTest.mjs", desc: "冲刺第一人称持械视觉回归" },
  FpsArmTest: { file: "Script_FpsArmTest.mjs", desc: "第一人称手臂（?arms=rig）：手扣在枪上、胳膊不糊屏" },
  SprintMeleeTest: { file: "Script_SprintMeleeTest.mjs", desc: "冲刺白刃：左键挥得出、刀在画面里" },
  HudPromptBrowserTest: { file: "Script_HudPromptBrowserTest.mjs", desc: "HUD 提示真浏览器交互" },
  TargetInfoTest: { file: "Script_TargetInfoTest.mjs", desc: "准心目标识别：番号/姓名/距离、穿墙与雾外不认" },
  JieheTerrainTest: { file: "Script_JieheTerrainTest.mjs", desc: "界河高度图采样与贴地" },
  TengxianLayoutTest: { file: "Script_TengxianLayoutTest.mjs", desc: "滕县城防、街路与功能区布局（纯 Node）" },
  EastSuburbBlocksTest: { file: "Script_EastSuburbBlocksTest.mjs", desc: "布防图东侧 13 个整框地块、命名院区与框间道路（纯 Node）" },
  EastSuburbNavTest: { file: "Script_EastSuburbNavTest.mjs", desc: "扩展东关切片四个路标的真导航连通率" },
  TengxianZoneTest: { file: "Script_TengxianZoneTest.mjs", desc: "城内 zone/出生点不被街坊围死（纯 Node）" },
  SamplePointTest: { file: "Script_SamplePointTest.mjs", desc: "县城采样点覆盖率与位姿口径（纯 Node）" },
  HeightmapVerify: { file: "Script_HeightmapCli.mjs", args: ["verify"], desc: "SRTM 高度数据完整性（需先 download 过）" },
  AudioTest: { file: "Script_AudioTest.mjs", desc: "音频资产与烘焙管线" },
  VoiceTest: { file: "Script_VoiceTest.mjs", desc: "语音资产与降级链" },
  MenuTest: { file: "Script_MenuTest.mjs", desc: "主菜单接线 29 条" },
  BootPropTest: { file: "Script_BootPropTest.mjs", desc: "开机陈设道具计数" },
  // 现有套件已扩到 143 项，含音频试听、完整县城/车厢切换与三套 PBR 截图；
  // 实机约 12—14 分钟，继续吃 10 分钟默认值会在末段稳定误报 timeout。
  EditorTest: { file: "Script_EditorTest.mjs", timeoutMs: 16 * 60 * 1000,
    desc: "编辑器套件（phase=5 十字街）143 项" },
  DestructionEditorTest: { file: "Script_DestructionEditorTest.mjs", desc: "可破坏预览编辑器：真实七关 + 承重白名单" },
  ActorBatchTest: { file: "Script_ActorBatchTest.mjs", desc: "人物合批：逐像素无损 + 真省 draw call" },
  PropInstancingTest: { file: "Script_PropInstancingTest.mjs", desc: "外部布设实例化：逐像素无损 + 真省 draw call + 流送自洽" },
  ProfilerTest: { file: "Script_ProfilerTest.mjs", desc: "运行时性能剖析器：开关接线、CPU 分桶、GPU 分段查询与钩子还原" },
  ActorPoseTest: { file: "Script_ActorPoseTest.mjs", desc: "车厢生活动作模块冒烟（Chromium 加载本地模块）" },
  CutscenePoseTest: {
    file: "Script_CutscenePoseTest.mjs",
    timeoutMs: 15 * 60 * 1000,
    desc: "蒙皮姿态契约：clip 高度带 + 躺＞跪＞手势的优先级 + 三场过场逐人头骨高度（真浏览器）",
  },
  GiTest: { file: "Script_GiTest.mjs", timeoutMs: 20 * 60 * 1000, desc: "全局光照开关对照" },
  PostTest: { file: "Script_PostTest.mjs", desc: "后处理感知域对比：暗部信息不被裁成纯黑" },
  PerformanceTest: { file: "Script_PerformanceTest.mjs", timeoutMs: 30 * 60 * 1000, desc: "帧率/负载实测（对机器敏感）" },
  FrameProfileTest: { file: "Script_FrameProfileTest.mjs", timeoutMs: 30 * 60 * 1000, desc: "整帧 CPU/GPU 剖析消融（对机器敏感）" },
  GodRaysPerformanceTest: { file: "Script_GodRaysPerformanceTest.mjs", timeoutMs: 30 * 60 * 1000, desc: "体积光方向性性能回归（对机器敏感）" },
  DeathViewTest: { file: "Script_DeathViewTest.mjs", timeoutMs: 20 * 60 * 1000, desc: "阵亡镜头出图（人工审）" },
  // 出图已按 URL 参数组分批（并入西郊机位后 45 张只建 19 次城），实测 ~6.5 分钟；
  // 上限从 30 分钟降到 15 分钟，保持与旧口径相同的 ~2.5 倍裕量。
  ShotTest: { file: "Script_ShotTest.mjs", args: ["_shots"], timeoutMs: 15 * 60 * 1000, desc: "逐关逐机位实拍出图（人工审）" },
};

export const browserTests = new Set([
  "ActorBatchTest", "ActorDepthTest", "ActorPoseTest", "AdsSightTest", "AiBehaviorTest",
  "AudioTest", "BayonetTest", "BootPropTest", "BootStallTest", "BootTest", "ColliderTest",
  "CutscenePoseTest", "DamageTest", "DeathViewTest", "DestructionEditorTest", "DestructionTest",
  "DressingProbeTest", "EastSuburbNavTest", "EditorTest", "FixedCenterAimTest", "FpsArmTest",
  "FrameProfileTest", "GeoTest", "GiTest", "GodRaysPerformanceTest", "GunFeelTest",
  "HudPromptBrowserTest", "JieheTerrainTest", "JumpTest", "MeleeQteTest", "MenuTest",
  "PerformanceTest", "PhysicsTest", "PlayTest", "PostTest", "ProfilerTest", "PropInstancingTest",
  "RangeTest", "ReticleCalibrationTest", "ShotTest", "SprintCrosshairTest", "SprintMeleeTest",
  "SprintViewmodelTest", "TargetInfoTest", "VisibilityTest", "VoiceTest",
]);

export const tier0Fast = [
  "BootPayloadTest",
  "TestRunnerTest",
  "ModuleGraphTest",
  "HudPromptTest",
  "RiggedModelTest",
  "CharacterModelTest",
  "CharacterHitboxMathTest",
  "FractureBakeTest",
  "CutsceneControlTest",
  "RoadPathTest",
  "WallPlanTest",
];

export const tier0Browser = ["BootTest", "BootStallTest", "PlayTest", "GeoTest"];

// 兼容旧入口：--tier=0 仍代表原来的完整 Tier 0。日常默认/--changed 使用 profile=quick。
export const tier0 = [...tier0Browser, ...tier0Fast];

export const tier2 = [
  "ShotTest",
  "GiTest",
  "PerformanceTest",
  "DeathViewTest",
  "FrameProfileTest",
  "GodRaysPerformanceTest",
];

export const domains = {
  terrain: {
    label: "高度图/地形（共享底座，下游成串跑）",
    tests: ["HeightmapVerify", "JieheTerrainTest", "TengxianLayoutTest", "TengxianZoneTest", "SamplePointTest", "RoadPathTest", "WallPlanTest", "PhysicsTest", "JumpTest", "DestructionTest"],
  },
  physics: {
    label: "物理/移动/破坏（共享底座，下游成串跑）",
    tests: ["PhysicsTest", "ColliderTest", "JumpTest", "DestructionTest", "FractureBakeTest"],
  },
  combat: {
    label: "武器/伤害/枪感/瞄准（共享底座，碰弹道或输入要跑全串）",
    tests: ["DamageTest", "GunFeelTest", "FixedCenterAimTest", "ReticleCalibrationTest", "SprintCrosshairTest",
      "AdsSightTest", "SprintViewmodelTest", "FpsArmTest", "SprintMeleeTest", "BayonetTest", "RangeTest", "MeleeQteTest",
      "CharacterModelTest", "CharacterHitboxMathTest",
      // 负重会封掉开火/开镜/冲刺三条（Player 的 carrySpeedScale + TryFire 的闸），
      // 碰这三样的改动要连着枪感串一起跑，所以它同时挂在 combat 与 interact 两个域。
      "CarryTest",
      // 架设机枪把左键整条接管过去（TryFire 的第一道闸）、还借 MarchBullet 打弹道，
      // 所以它同样同时挂在 combat 与 interact 两个域。
      "EmplacementTest",
      // 日机扫射自己算一条伤害链（打倒 NPC、打倒玩家），不走 MarchBullet 也不走 Blast，
      // 所以碰伤害口径的改动要连着它一起跑（毫秒级，白搭一条不亏）。
      "AircraftStrafeTest"],
  },
  // 机枪位与 Script_Ai 共用「一个战位只填一个人」那道闸（soldier.emplacementId），
  // 所以碰 AI 的改动要连着 EmplacementTest 一起跑（毫秒级，白搭一条不亏）。
  // 照明弹归这里而不是归 combat：它一发子弹都不打，改的是 SIGHT_BY_STANCE 那条
  // **发现距离**——碰 Script_Ai 的改动最容易悄悄把倍率那条读点绕过去
  // （FlareTest 有一条专门扫源码数裸读次数）。
  ai: {
    label: "AI 与战场内容预算",
    // 具名同伴（罗班长、幺娃…）是从 nra 名额里出的人，goal 直接写进 AiDirector，
    // 所以碰 AI 或撒兵的改动要连着 MissionHooksTest 一起跑。
    tests: ["AiBehaviorTest", "VisibilityTest", "EmplacementTest", "FlareTest", "MissionHooksTest", "MissionSetpiecesTest"],
  },
  hud: {
    label: "HUD/交互提示/目标识别",
    // 报码纸是 HUD 面板，改 Script_Hud 要连着它一起跑（TelegraphTest 有一段扫 HUD 源码）。
    tests: ["HudPromptTest", "HudPromptBrowserTest", "TargetInfoTest", "TelegraphTest"],
  },
  interact: {
    label: "交互框架/负重/架设机枪/发报（担架·搬运·救护交互点·机枪位·电键）",
    // 发报的两个点（电键 tap / 接头 hold）是拿真的 InteractSystem 跑的，
    // 所以碰交互框架的改动要连着它一起跑。
    // 脚本检查点（倒带）改的是玩家状态的还原，与负重/机枪位共用同一批状态，
    // 所以也挂在这个域下。
    tests: ["CarryTest", "EmplacementTest", "HudPromptTest", "HudPromptBrowserTest", "TelegraphTest", "MissionHooksTest", "MissionSetpiecesTest"],
  },
  audio: { label: "音效/音乐/环境声", tests: ["AudioTest"] },
  voice: { label: "语音", tests: ["VoiceTest"] },
  menu: { label: "主菜单/开机陈设", tests: ["MenuTest", "BootPropTest"] },
  editor: { label: "场景编辑器/可破坏编辑器/采样点", tests: ["EditorTest", "DestructionEditorTest", "SamplePointTest", "WestDistrictCoverageTest", "WestSuburbBlocksTest", "CharacterModelTest"] },
  cutscene: {
    label: "过场/剧本派发/车厢生活动作",
    // 关中过场 beat 与 LEVEL_CUES 的构建都在 Script_Story 与组装层里，
    // 碰过场或剧本的改动要连着 MissionHooksTest 一起跑（毫秒级，白搭一条不亏）。
    tests: ["CutsceneControlTest", "ActorPoseTest", "CutscenePoseTest", "MissionHooksTest", "MissionSetpiecesTest"],
  },
  render: {
    label: "渲染与合批自动契约",
    // 照明弹的灯走 LightRig 的火光池、烟走 VfxSystem 的烟源池，两处都加了新口子
    //（UpdateFire / MoveSmokeSource），所以碰灯光或粒子的改动也要连着 FlareTest 跑。
    tests: ["PostTest", "ActorDepthTest", "ActorBatchTest", "PropInstancingTest", "ProfilerTest", "ExternalPropAssetTest", "TownDressingTest", "EastSuburbBlocksTest", "EastSuburbNavTest", "WestDistrictCoverageTest", "WestSuburbBlocksTest", "WestStationTest", "DressingProbeTest", "FlareTest"],
    tier2Tests: ["GiTest", "DeathViewTest", "ShotTest"],
  },
  perf: {
    label: "性能红线实测（仅提示 Tier 2，不自动跑）",
    tests: [],
    tier2Tests: ["PerformanceTest", "FrameProfileTest", "GodRaysPerformanceTest"],
  },
  infra: {
    label: "测试入口/本地服务基础设施",
    tests: ["TestRunnerTest", "ModuleGraphTest"],
  },
};

const changedDomainRules = [
  { domain: "terrain", pattern: /(Heightmap|JieheHeight|JieheField|TengxianField|FarLand|Terrain|Battlefield|Outfield|Ground|Water|WestSuburbBlocks|Data_Levels)/i },
  { domain: "physics", pattern: /(Physics|Collider|Player|Navigation|Movement|Jump|Traversal|Destruction|Fracture|Battlefield|Outfield|World|CityBlockKit|Landmark)/i },
  // Aircraft 挂 combat：绕圈那一层是纯视觉，但同一个文件里的扫射航线打得倒玩家。
  // Hitbox 也挂 combat：人物子弹代理改了就是改了打中哪儿。
  { domain: "combat", pattern: /(Combat|Weapon|Damage|Gun|Grenade|Blast|Aim|Reticle|Viewmodel|Projectile|Ballistic|Hitbox|Script_Input|Data_Meshes|_blender|Range|Melee|Carry|Emplacement|Aircraft|Strafe)/i },
  { domain: "interact", pattern: /(Carry|Interact|Emplacement|Telegraph|Checkpoint|Script_Input|Hud|Prompt)/i },
  // Flare 挂 ai：它不打人，但它改「谁看得见谁」——那是 AI 的判据。
  { domain: "ai", pattern: /(Script_Ai|Visibility|Spawn|Data_Battle|Traversal|Flare|Companion|MissionSetpieces)/i },
  { domain: "hud", pattern: /(Hud|Prompt|Reticle|Crosshair|Identify|Telegraph|DebugOptions|Script_Input|Style_Game|index\.html)/i },
  { domain: "audio", pattern: /(Audio|Sfx|Music|Amb|Sound)/i },
  { domain: "voice", pattern: /(Voice|Dialogue|Speech)/i },
  { domain: "menu", pattern: /(Menu|BootProp|index\.html)/i },
  { domain: "editor", pattern: /(Editor|Data_Levels|SamplePoint|Data_Dressing|Data_ExternalAssets|WestSuburbBlocks|_import)/i },
  { domain: "cutscene", pattern: /(Cutscene|Story|Data_Script|TengxianScript|Mission|ActorPose|Train|Data_MissionCh|Companion|Checkpoint)/i },
  { domain: "render", pattern: /(Render|Shader|Material|Texture|Model|Mesh|Geo|Landmark|Actor|Rigged|Vfx|Post|Light|Gi|GlobalShProbe|Smoke|Flare|Outfield|FarLand|JieheField|TengxianField|Water|Wheel|YardWall|Sky|Noise|Probe|Dressing|LivedInProps|TrimProps|ExternalAssets|ExternalProps|WestSuburbBlocks|BuildingShot|TzmShot|TexBake|Pbr|PropBatch|PropStreaming|Profiler|Style_Game|Scene|_import|vendor\/three|\.glsl|index\.html)/i },
  { domain: "perf", pattern: /(Performance|FrameProfile|GodRays|Lod|Visibility|ActorBatch|Smoke)/i },
  { domain: "physics", pattern: /vendor\/rapier/i },
  { domain: "infra", pattern: /(Script_TestRunner|Script_DevServer)/i },
];

const ignoredChangeRules = [
  /\/docs\//i,
  /\/(?:AGENTS|README)[^/]*\.md$/i,
  /\.md$/i,
  /\.(?:py|ps1|ms|blend|mtl|txt)$/i,
  /\/(?:_raw|_shots)\//i,
  /\/\.gitignore$/i,
];

const prepushGateRules = [
  {
    tests: ["PlayTest"],
    pattern: /(Script_Main|Script_Player|Script_Input|Script_Combat|Script_Ai|Script_Story|Script_Interact|Script_Mission|Data_Battle|Data_Levels|Data_MissionCh|Data_Script|TengxianScript|Companion|Checkpoint)/i,
  },
  {
    tests: ["BootTest"],
    pattern: /(Script_Main|index\.html|Data_Battle|Data_Levels|Render|Shader|Material|Texture|Model|Scene|Outfield|Battlefield|Tengxian|Jiehe|Dressing|ExternalAssets|ExternalProps|FarLand|Sky|Water)/i,
  },
  {
    tests: ["BootStallTest"],
    pattern: /(Pbr|Texture|Material|MeshLoad|ExternalAssets|ExternalProps)/i,
  },
  {
    tests: ["GeoTest"],
    pattern: /(Geo|Mesh|Model|Collider|Geometry|CityBlockKit|Landmark)/i,
  },
];

const domainPrepushGates = {
  terrain: ["BootTest", "GeoTest"],
  physics: ["PlayTest", "GeoTest"],
  combat: ["PlayTest"],
  ai: ["PlayTest"],
  hud: ["PlayTest"],
  interact: ["PlayTest"],
  menu: ["BootTest"],
  editor: ["BootTest"],
  cutscene: ["PlayTest"],
  render: ["BootTest", "BootStallTest", "GeoTest"],
};

let activeChild = null;
let interruptedSignal = null;

function Unique(values) {
  return [...new Set(values)];
}

export function GetTier1Tests() {
  return Unique(Object.values(domains).flatMap((domain) => domain.tests))
    .filter((name) => !tier0.includes(name) && !tier2.includes(name));
}

function ValidateDomains(names) {
  for (const name of names) {
    if (!domains[name]) throw new Error(`未知 domain=${name}（用 --list 查）`);
  }
}

export function ValidateRegistry() {
  const classified = new Set([...tier0, ...tier2]);
  for (const domain of Object.values(domains)) {
    for (const name of [...domain.tests, ...(domain.tier2Tests ?? [])]) classified.add(name);
  }
  for (const name of classified) {
    if (!testDefs[name]) throw new Error(`分级引用了未登记测试：${name}`);
  }
  for (const [name, def] of Object.entries(testDefs)) {
    if (!classified.has(name)) throw new Error(`测试未归入 tier/domain：${name}`);
    if (!path.isAbsolute(def.file) && !def.file.endsWith(".mjs")) {
      throw new Error(`测试文件扩展名异常：${name} -> ${def.file}`);
    }
  }
  for (const name of browserTests) {
    if (!testDefs[name]) throw new Error(`浏览器测试未登记：${name}`);
  }
  for (const name of tier0Fast) {
    if (browserTests.has(name)) throw new Error(`快速 Tier 0 不得启动浏览器：${name}`);
  }
}

function ValidateOptions(opts) {
  const hasOnly = opts.only.length > 0;
  const hasSelectors = opts.tier !== null || opts.profile !== null || opts.domains.length || opts.domainOnly.length || opts.changedBase;
  if (hasOnly && hasSelectors) throw new Error("--only 不能和 --tier/--profile/--domain/--domain-only/--changed 混用");
  if (opts.domainOnly.length && (opts.domains.length || opts.changedBase || opts.tier !== null)) {
    throw new Error("--domain-only 是排障专用的独占选择器，不能和其他选择器混用");
  }
  if (opts.tier === 2 && (opts.domains.length || opts.changedBase)) {
    throw new Error("--tier=2 是独立人工审查档，不能和 --domain/--changed 混用");
  }
  if (opts.tier !== null && opts.profile !== null) {
    throw new Error("--tier 是兼容旧入口，不能和 --profile 混用");
  }
}

export function ParseArgs(argv) {
  const opts = {
    tier: null,
    profile: null,
    domains: [],
    domainOnly: [],
    only: [],
    changedBase: null,
    list: false,
    dryRun: false,
    verbose: false,
    failFast: false,
    strictBaseline: false,
  };
  for (const raw of argv) {
    if (!raw.startsWith("--")) throw new Error(`参数必须以 -- 开头：${raw}`);
    const arg = raw.slice(2);
    const eq = arg.indexOf("=");
    const key = eq === -1 ? arg : arg.slice(0, eq);
    const val = eq === -1 ? "" : arg.slice(eq + 1);
    if (key === "list") opts.list = true;
    else if (key === "dry-run") opts.dryRun = true;
    else if (key === "verbose") opts.verbose = true;
    else if (key === "fail-fast") opts.failFast = true;
    else if (key === "strict-baseline") opts.strictBaseline = true;
    else if (key === "changed") opts.changedBase = val || "origin/master";
    else if (key === "profile") {
      if (!/^(quick|prepush|full)$/.test(val)) throw new Error(`未知 profile=${val || "(空)"}（可用：quick、prepush、full）`);
      opts.profile = val;
    }
    else if (key === "tier") {
      if (!/^[012]$/.test(val)) throw new Error(`未知 tier=${val || "(空)"}（可用：0、1、2）`);
      opts.tier = Number(val);
    } else if (key === "domain") {
      if (!val) throw new Error("--domain 需要 =领域名");
      opts.domains.push(...val.split(",").filter(Boolean));
    } else if (key === "domain-only") {
      if (!val) throw new Error("--domain-only 需要 =领域名");
      opts.domainOnly.push(...val.split(",").filter(Boolean));
    } else if (key === "only") {
      if (!val) throw new Error("--only 需要 =测试名");
      opts.only.push(...val.split(",").filter(Boolean));
    }
    else throw new Error(`未知参数：${raw}`);
  }
  opts.domains = Unique(opts.domains);
  opts.domainOnly = Unique(opts.domainOnly);
  opts.only = Unique(opts.only);
  ValidateOptions(opts);
  return opts;
}

export function ResolveSelection(opts, inferredDomains = [], changeInfo = {}) {
  ValidateDomains([...opts.domains, ...opts.domainOnly, ...inferredDomains]);
  if (opts.only.length) return opts.only.slice();
  if (opts.tier === 2) return tier2.slice();
  if (opts.domainOnly.length) return Unique(opts.domainOnly.flatMap((name) => domains[name].tests));

  // 旧的 --tier 明确保留原行为，供既有脚本和完整门禁使用。
  if (opts.tier === 0) return tier0.slice();
  if (opts.tier === 1) return Unique([...tier0, ...GetTier1Tests()]);

  const activeDomains = Unique([...opts.domains, ...inferredDomains]);
  const profile = opts.profile ?? "quick";
  const changedModeHasNothingToTest = opts.changedBase
    && changeInfo.changedProjectFiles === 0;
  if (changedModeHasNothingToTest) return [];

  const names = profile === "full" ? tier0.slice() : tier0Fast.slice();
  for (const domainName of activeDomains) {
    const selected = domains[domainName].tests;
    names.push(...(profile === "quick" ? selected.filter((name) => !browserTests.has(name)) : selected));
  }

  if (profile === "prepush") {
    names.push(...(changeInfo.prepushGates ?? []));
    // 显式 --domain 没有文件上下文时，按领域的最大合理爆炸半径补门禁。
    if (!opts.changedBase) {
      for (const domainName of activeDomains) names.push(...(domainPrepushGates[domainName] ?? []));
    }
    // 未知运行时文件不能悄悄放过；只在推送前档保守补完整整机门禁。
    if ((changeInfo.unmatchedProjectFiles?.length ?? 0) > 0) names.push(...tier0Browser);
  }
  return Unique(names);
}

function RunGitLines(args) {
  const result = spawnSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    windowsHide: true,
  });
  if (result.error) throw new Error(`git ${args.join(" ")} 启动失败：${result.error.message}`);
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "未知错误").trim();
    throw new Error(`git ${args.join(" ")} 失败：${detail}`);
  }
  return result.stdout.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

export function CollectChangedFiles(base = "origin/master") {
  return Unique([
    ...RunGitLines(["diff", "--name-only", `${base}...HEAD`]),
    ...RunGitLines(["diff", "--name-only", "HEAD"]),
    ...RunGitLines(["ls-files", "--others", "--exclude-standard"]),
  ]).sort();
}

export function InferDomains(files) {
  const found = new Set();
  const unmatchedProjectFiles = [];
  const ignoredProjectFiles = [];
  const changedProjectFiles = [];
  const prepushGates = new Set();
  const allAutomatedDomains = Object.keys(domains).filter((name) => domains[name].tests.length);
  const testByFile = new Map(Object.entries(testDefs).map(([name, def]) => [def.file, name]));

  for (const rawFile of files) {
    const file = rawFile.replaceAll("\\", "/");
    if (!file.startsWith("Taierzhuang1938/")) continue;
    if (ignoredChangeRules.some((pattern) => pattern.test(file))) {
      ignoredProjectFiles.push(file);
      continue;
    }
    changedProjectFiles.push(file);
    const leaf = path.posix.basename(file);
    let matched = false;

    if (leaf === "Script_Main.mjs") {
      for (const name of allAutomatedDomains) found.add(name);
      matched = true;
    }
    if (leaf === "Data_Levels.mjs") {
      for (const name of ["terrain", "physics", "ai", "editor", "cutscene", "render"]) found.add(name);
      matched = true;
    }
    if (leaf === "Data_Battle.mjs") {
      for (const name of ["combat", "ai", "editor", "render"]) found.add(name);
      matched = true;
    }
    if (/^(Data_Tengxian|Script_TengxianCity|Script_TengxianLayoutTest|Script_EastSuburbBlocksTest|Script_Landmark_EastMapBlocks)\.mjs$/.test(leaf)) {
      for (const name of ["terrain", "editor", "render"]) found.add(name);
      matched = true;
    }
    // 场景样条层（道路 + 围墙 + 编辑器）被铁路/大车路/大街/寨墙/坝墙/石墙村共用：
    // 地形、编辑器、渲染都要回归
    if (/^(Script_RoadPath|Script_RoadSpline|Script_WallPlan|Script_WallSpline|Script_EditorSplines)\.mjs$/.test(leaf)) {
      for (const name of ["terrain", "editor", "render"]) found.add(name);
      matched = true;
    }

    const testName = testByFile.get(leaf);
    if (testName) {
      for (const [domainName, domain] of Object.entries(domains)) {
        if ([...domain.tests, ...(domain.tier2Tests ?? [])].includes(testName)) found.add(domainName);
      }
      matched = true;
    }

    for (const rule of changedDomainRules) {
      if (rule.pattern.test(file)) {
        found.add(rule.domain);
        matched = true;
      }
    }
    for (const rule of prepushGateRules) {
      if (rule.pattern.test(file)) for (const name of rule.tests) prepushGates.add(name);
    }
    if (!matched) unmatchedProjectFiles.push(file);
  }
  return {
    domains: [...found],
    unmatchedProjectFiles,
    ignoredProjectFiles,
    changedProjectFiles: changedProjectFiles.length,
    prepushGates: [...prepushGates],
  };
}

export function GetTier2Recommendations(domainNames) {
  return Unique(domainNames.flatMap((name) => domains[name]?.tier2Tests ?? []));
}

function AppendCaptured(current, chunk) {
  const combined = current + chunk.toString("utf8");
  if (combined.length <= maxCaptureChars) return combined;
  return `……（输出超过 ${Math.round(maxCaptureChars / 1024 / 1024)} MiB，前部已截断）\n${combined.slice(-maxCaptureChars)}`;
}

function MakeCollector(name, verbose, target, append) {
  let partial = "";
  return (chunk) => {
    append(chunk);
    if (verbose) {
      target.write(chunk);
      return;
    }
    partial += chunk.toString("utf8");
    const lines = partial.split(/\r?\n/);
    partial = lines.pop() ?? "";
    for (const line of lines) {
      if (line.startsWith("--- ")) console.log(`[${name}] ${line}`);
    }
  };
}

function KillProcessTree(child) {
  if (!child?.pid) return;
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true,
    });
  } else {
    child.kill("SIGTERM");
  }
}

function Sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function IsProcessAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function AcquireBrowserLock(testName) {
  const startedAt = Date.now();
  let lastNoticeAt = 0;
  while (Date.now() - startedAt < browserLockTimeoutMs) {
    if (interruptedSignal) return null;
    try {
      const fd = fs.openSync(browserLockPath, "wx");
      fs.writeFileSync(fd, JSON.stringify({ pid: process.pid, testName, createdAt: Date.now() }));
      fs.closeSync(fd);
      return () => {
        try {
          const owner = JSON.parse(fs.readFileSync(browserLockPath, "utf8"));
          if (owner.pid === process.pid) fs.unlinkSync(browserLockPath);
        } catch {
          // 锁已被清理或内容损坏时不再扩大删除范围。
        }
      };
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      let owner = null;
      try { owner = JSON.parse(fs.readFileSync(browserLockPath, "utf8")); } catch {}
      const stale = !owner || !IsProcessAlive(owner.pid) || Date.now() - Number(owner.createdAt || 0) > browserLockTimeoutMs;
      if (stale) {
        try { fs.unlinkSync(browserLockPath); } catch {}
        continue;
      }
      if (Date.now() - lastNoticeAt >= 30 * 1000) {
        console.log(`[runner] … ${testName} 等待浏览器测试槽（占用者 ${owner.testName ?? "unknown"}, pid ${owner.pid}）`);
        lastNoticeAt = Date.now();
      }
      await Sleep(browserLockPollMs);
    }
  }
  throw new Error(`${testName} 等待浏览器测试槽超过 ${Math.round(browserLockTimeoutMs / 60000)} 分钟`);
}

function PreflightSelection(selection) {
  if (!selection.some((name) => browserTests.has(name))) return;
  try {
    requireHere.resolve("playwright-core");
  } catch {
    throw new Error("本次包含浏览器测试，但缺少 playwright-core；请先 npm install，再重新运行（尚未执行任何测试）");
  }
}

const estimatedSeconds = {
  BootTest: 100,
  BootStallTest: 15,
  PlayTest: 700,
  GeoTest: 20,
  ShotTest: 390,
  GiTest: 300,
  PerformanceTest: 600,
  DeathViewTest: 240,
  FrameProfileTest: 600,
  GodRaysPerformanceTest: 600,
};

function EstimateSelectionSeconds(selection) {
  return selection.reduce((sum, name) => sum + (estimatedSeconds[name] ?? (browserTests.has(name) ? 60 : 1)), 0);
}

function FormatDuration(seconds) {
  if (seconds < 60) return `约 ${seconds} 秒`;
  return `约 ${Math.ceil(seconds / 60)} 分钟`;
}

export function RunOne(name, def, verbose = false) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const timeoutMs = def.timeoutMs ?? defaultTimeoutMs;
    const child = spawn(process.execPath, [path.join(dirHere, def.file), ...(def.args ?? [])], {
      cwd: dirHere,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    activeChild = child;
    let text = "";
    let timedOut = false;
    let settled = false;
    const append = (chunk) => { text = AppendCaptured(text, chunk); };
    child.stdout.on("data", MakeCollector(name, verbose, process.stdout, append));
    child.stderr.on("data", MakeCollector(name, verbose, process.stderr, append));

    const heartbeat = setInterval(() => {
      const secs = Math.round((Date.now() - startedAt) / 1000);
      console.log(`[runner] … ${name} 已运行 ${secs}s（上限 ${Math.round(timeoutMs / 1000)}s）`);
    }, heartbeatMs);
    const timeout = setTimeout(() => {
      timedOut = true;
      text = AppendCaptured(text, `\nrunner 超时：${Math.round(timeoutMs / 1000)}s\n`);
      KillProcessTree(child);
    }, timeoutMs);

    const Finish = (code, signal = null) => {
      if (settled) return;
      settled = true;
      clearInterval(heartbeat);
      clearTimeout(timeout);
      if (activeChild === child) activeChild = null;
      resolve({ name, code, signal, timedOut, ms: Date.now() - startedAt, text });
    };
    child.on("close", Finish);
    child.on("error", (error) => {
      text = AppendCaptured(text, `\nspawn 失败：${error.message}\n`);
      Finish(-1);
    });
  });
}

export function ExtractFailureEntries(text) {
  const marker = text.lastIndexOf("没过的：");
  if (marker === -1) return [];
  const summary = text.slice(marker);
  return [...summary.matchAll(/^\s*·\s+(.+?)\s+—\s*(.*)$/gm)].map((match) => ({
    name: match[1].trim(),
    detail: match[2].trim(),
  }));
}

export function ExtractFailureNames(text) {
  return ExtractFailureEntries(text).map((entry) => entry.name);
}

function SubtractMultiset(values, allowed) {
  const counts = new Map();
  for (const value of allowed) counts.set(value, (counts.get(value) ?? 0) + 1);
  const remainder = [];
  for (const value of values) {
    const count = counts.get(value) ?? 0;
    if (count > 0) counts.set(value, count - 1);
    else remainder.push(value);
  }
  return remainder;
}

export function AssessResult(result, def, strictBaseline = false) {
  if (result.code === 0 && !result.timedOut) {
    return { ...result, ok: true, baselineOnly: false, actualFailures: [], failureEntries: [] };
  }
  const expected = def.expectedFailures ?? [];
  const hasCompletedSummary = /通关冒烟：\d+\/\d+ 过/.test(result.text) && result.text.includes("没过的：");
  if (expected.length && !result.timedOut && hasCompletedSummary) {
    const failureEntries = ExtractFailureEntries(result.text);
    const actualFailures = failureEntries.map((entry) => entry.name);
    const unexpectedFailures = SubtractMultiset(actualFailures, expected);
    const resolvedFailures = SubtractMultiset(expected, actualFailures);
    if (!unexpectedFailures.length && actualFailures.length) {
      return {
        ...result,
        ok: !strictBaseline,
        baselineOnly: true,
        actualFailures,
        failureEntries,
        unexpectedFailures,
        resolvedFailures,
      };
    }
  }
  return {
    ...result,
    ok: false,
    baselineOnly: false,
    actualFailures: ExtractFailureNames(result.text),
    failureEntries: ExtractFailureEntries(result.text),
    unexpectedFailures: [],
    resolvedFailures: [],
  };
}

export function Tail(text, lines = 80) {
  const all = text.split(/\r?\n/);
  const cut = all.slice(-lines);
  return (all.length > lines ? `……（前 ${all.length - lines} 行略，--verbose 看全程）\n` : "") + cut.join("\n");
}

function InstallSignalHandlers() {
  const HandleSignal = (signal) => {
    if (interruptedSignal) return;
    interruptedSignal = signal;
    console.error(`[runner] 收到 ${signal}，正在清理当前子进程…`);
    KillProcessTree(activeChild);
  };
  const HandleSigint = () => HandleSignal("SIGINT");
  const HandleSigterm = () => HandleSignal("SIGTERM");
  process.once("SIGINT", HandleSigint);
  process.once("SIGTERM", HandleSigterm);
  return () => {
    process.removeListener("SIGINT", HandleSigint);
    process.removeListener("SIGTERM", HandleSigterm);
  };
}

function PrintList() {
  console.log("Profile（默认 quick；--changed 会按 Git 改动缩小范围）：");
  console.log("  quick      纯 Node 快测 + 命中领域的纯 Node 探针（编辑循环）");
  console.log("  prepush    完整领域探针 + 按文件风险触发 Boot/Play/Geo（推送前）");
  console.log("  full       完整 Tier 0 + 命中领域探针（集成/终验）");
  console.log("快速 Tier 0（quick 基座，不启动浏览器）：");
  for (const name of tier0Fast) console.log(`  ${name.padEnd(20)} ${testDefs[name].desc}`);
  console.log("整机 Tier 0（prepush 按风险触发；full/--tier=0 全跑）：");
  for (const name of tier0Browser) console.log(`  ${name.padEnd(20)} ${testDefs[name].desc}`);
  console.log("Tier 1（全部自动领域探针；通常优先用 --changed/--domain）：");
  for (const name of GetTier1Tests()) console.log(`  ${name.padEnd(20)} ${testDefs[name].desc}`);
  console.log("Tier 2（低频人工审查，不由 --changed 自动触发）：");
  for (const name of tier2) console.log(`  ${name.padEnd(20)} ${testDefs[name].desc}`);
  console.log("领域（--domain=名字 默认叠加 Tier 0；--domain-only=名字仅排障）：");
  for (const [key, domain] of Object.entries(domains)) {
    console.log(`  ${key.padEnd(10)} ${domain.label}`);
    for (const name of domain.tests) console.log(`    ${name.padEnd(18)} ${testDefs[name].desc}`);
    if (domain.tier2Tests?.length) console.log(`    Tier 2 建议：${domain.tier2Tests.join(", ")}`);
  }
}

export async function Main(argv = process.argv.slice(2)) {
  ValidateRegistry();
  const opts = ParseArgs(argv);
  if (opts.list) {
    PrintList();
    return 0;
  }

  let changedFiles = [];
  let inferred = {
    domains: [],
    unmatchedProjectFiles: [],
    ignoredProjectFiles: [],
    changedProjectFiles: 0,
    prepushGates: [],
  };
  if (opts.changedBase) {
    changedFiles = CollectChangedFiles(opts.changedBase);
    inferred = InferDomains(changedFiles);
    console.log(`[runner] Git 改动 ${changedFiles.length} 个；台儿庄运行时改动 ${inferred.changedProjectFiles} 个；推断领域：${inferred.domains.join(", ") || "无"}`);
    if (inferred.ignoredProjectFiles.length) {
      console.log(`[runner] 文档/源工程改动无需运行游戏测试：${inferred.ignoredProjectFiles.join(", ")}`);
    }
    if (inferred.unmatchedProjectFiles.length) {
      console.log(`[runner] 未匹配领域：${inferred.unmatchedProjectFiles.join(", ")}`);
    }
  }

  const selection = ResolveSelection(opts, inferred.domains, inferred);
  for (const name of selection) {
    if (!testDefs[name]) throw new Error(`未知测试名：${name}（用 --list 查）`);
  }
  if (!selection.length) {
    console.log("[runner] 没有需要运行的测试（无台儿庄运行时改动，或改动均为文档/源工程）");
    return 0;
  }

  const activeDomains = Unique([...opts.domains, ...opts.domainOnly, ...inferred.domains]);
  const recommendations = GetTier2Recommendations(activeDomains);
  if (recommendations.length) console.log(`[runner] 本次另建议人工审查 Tier 2：${recommendations.join(", ")}`);
  const profileLabel = opts.tier !== null ? `legacy-tier-${opts.tier}` : (opts.profile ?? "quick");
  console.log(`[runner] profile=${profileLabel}，共 ${selection.length} 个，预计 ${FormatDuration(EstimateSelectionSeconds(selection))}：${selection.join(", ")}`);
  if (opts.dryRun) {
    console.log("[runner] --dry-run：只展示选择，不执行测试");
    return 0;
  }
  PreflightSelection(selection);

  interruptedSignal = null;
  const removeSignalHandlers = InstallSignalHandlers();
  const results = [];
  try {
    for (const name of selection) {
      process.stdout.write(`[runner] ▶ ${name} …\n`);
      let releaseBrowserLock = null;
      let rawResult;
      try {
        if (browserTests.has(name)) releaseBrowserLock = await AcquireBrowserLock(name);
        if (interruptedSignal) break;
        rawResult = await RunOne(name, testDefs[name], opts.verbose);
      } finally {
        releaseBrowserLock?.();
      }
      if (interruptedSignal) {
        console.log(`[runner] ${name} 已中断，子进程已清理`);
        break;
      }
      const result = AssessResult(rawResult, testDefs[name], opts.strictBaseline);
      results.push(result);
      const secs = (result.ms / 1000).toFixed(1);
      if (result.ok && result.baselineOnly) {
        console.log(`[BASELINE] ${name} (${secs}s)：${result.actualFailures.length} 条历史红，未发现新增红`);
        for (const entry of result.failureEntries) {
          console.log(`  · ${entry.name}${entry.detail ? ` — ${entry.detail}` : ""}`);
        }
        if (result.resolvedFailures.length) {
          console.log(`[runner] 已转绿、应更新基线：${result.resolvedFailures.join("；")}`);
        }
      } else if (result.ok) {
        console.log(`[PASS] ${name} (${secs}s)`);
      } else {
        const reason = result.timedOut ? "timeout" : `exit ${result.code}`;
        console.log(`[FAIL] ${name} (${secs}s, ${reason})\n${Tail(result.text)}`);
        if (result.baselineOnly && opts.strictBaseline) console.log("[runner] --strict-baseline 将历史红计为失败");
        if (opts.failFast) break;
      }
    }
  } finally {
    removeSignalHandlers();
  }

  if (interruptedSignal) return interruptedSignal === "SIGINT" ? 130 : 143;
  const passed = results.filter((result) => result.ok && !result.baselineOnly);
  const baselined = results.filter((result) => result.ok && result.baselineOnly);
  const failed = results.filter((result) => !result.ok);
  const totalSecs = (results.reduce((sum, result) => sum + result.ms, 0) / 1000).toFixed(1);
  console.log(`[runner] 通过 ${passed.length}，历史基线 ${baselined.length}，失败 ${failed.length}，共 ${totalSecs}s`);
  if (failed.length) {
    console.log(`[runner] 未通过：${failed.map((result) => result.name).join(", ")}`);
    return 1;
  }
  return 0;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileHere;
if (isMain) {
  Main().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    console.error(`[runner] ${error.message}`);
    process.exitCode = 2;
  });
}
