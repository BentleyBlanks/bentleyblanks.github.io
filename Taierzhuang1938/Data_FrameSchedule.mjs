// 每帧调度表（docs/Data_FrameSchedule.md）：Script_Main.Frame 每帧按什么模式、按什么先后跑哪些步骤。
//
// 以前这些全写在一个 755 行的 Frame 里，先后只靠注释（「负重必须排在 player.Update 之前」），
// 中途还有十一处提前结束。现在：
//   · Frame 本身只剩三层：冻结判断（失败画面 / 任务结束只出画面）→ 帧头（任何模式都跑）→ 按模式分派；
//   · 正常游戏（play）是下面这张有名字的步骤表，Script_Main 里一步一个函数（PlayStep<Id>）；
//   · 注释里的先后约束写成 FRAME_ORDER_RULES，FrameScheduleTest 拦住违反它的改动。
// 改顺序 = 改这张表并说明理由；加系统 = 加一步、写清它必须排在谁前后。
// 移植 UE 时一步大致对应一个 Tick Group 里的一个系统，模式对应 GameMode / 输入模式。
//
// 纯数据，零 import。

/** 帧头之后按顺序判的模式（第一个成立的接管这一帧）。 */
export const FRAME_MODES = Object.freeze([
  Object.freeze({ id: "editor", when: "高级工具 / 设置页接管界面（UiCapturing）", runs: "设置页、编辑器、指挥部预览、灯光与阴影框跟编辑器相机、出画" }),
  Object.freeze({ id: "shellShot", when: "第一关 0 段炮弹镜头", runs: "镜头、天空灯光、特效、战斗、出画" }),
  Object.freeze({ id: "loading", when: "换关建切片中（state.ready 为假）", runs: "什么都不跑：碰撞盒表正在被换掉" }),
  Object.freeze({ id: "lab", when: "测试场插件声明 ownsFrame（布料实验室）", runs: "测试场自己、天空灯光、出画" }),
  Object.freeze({ id: "play", when: "其余情况", runs: "FRAME_PLAY_STEPS" }),
]);

/** 正常游戏每帧的步骤，按执行先后。任何一步可以结束这一帧（任务失败 / 通关）。 */
export const FRAME_PLAY_STEPS = Object.freeze([
  ["deathTimer", "阵亡后的换人倒计时"],
  ["input", "白刃 QTE（真实时间）、读键、各种接管对输入的封锁"],
  ["carry", "负重与喘息（写这一帧的移动乘数）"],
  ["player", "玩家移动、枪口避墙、测试场 afterPlayer 槽"],
  ["emplacement", "架设机枪：射界夹视线、上下枪位"],
  ["interact", "按住型交互、震脱手的枪、发报"],
  ["hands", "收枪 / 出枪边沿、清掉这一帧的视线与姿态输入"],
  ["foley", "脚步与身体声、地面痕迹"],
  ["prompts", "情境操作提示（每六帧）"],
  ["firearms", "冲刺松开、换弹请求、开火、投弹、白刃蓄力"],
  ["cameraFov", "开镜 FOV、屏息、开火顿挫、望远镜"],
  ["view", "视线增量接进枪的晃动、第一人称枪手与身体"],
  ["alliesDown", "友军倒下的叙事信号"],
  ["flare", "照明弹（写发现距离倍率）"],
  ["companion", "具名同伴的跟随目标"],
  ["ai", "AI（测试场 beforeAi 槽在它前面）"],
  ["physics", "物理步进、断肢块"],
  ["vfx", "特效"],
  ["combat", "战斗结算、测试场 afterCombat 槽、扫射、炮坑碎块"],
  ["lights", "投弹蓄力计时、天空、灯光、阴影框"],
  ["playerDown", "死亡判定（任务失败在这里结束这一帧）"],
  ["firewalls", "火墙"],
  ["checkpoint", "脚本检查点采样"],
  ["mission", "第一关任务运行时与各家相机接管（通关在这里结束这一帧）"],
  ["p012", "P012 流程（通关在这里结束这一帧）"],
  ["objectives", "路标目标"],
  ["narrative", "交火判断与叙事"],
  ["setpieces", "章节摆点、抬担架视角"],
  ["scenario", "场景换态（开门 / 断路）与寻路刷新"],
  ["outcome", "失败条件、钉关、换关"],
  ["spawn", "补兵（每三秒）"],
  ["hud", "HUD、标记、手榴弹警告、小地图、AI 调试覆盖层"],
  ["render", "出画（手动步进时只挪音频听者）"],
].map(([id, note]) => Object.freeze({ id, note })));

/** 先后约束：before 必须排在 after 前面。理由抄自原 Frame 里的注释。 */
export const FRAME_ORDER_RULES = Object.freeze([
  ["input", "carry", "负重读这一帧的输入"],
  ["carry", "player", "负重写的 carrySpeedScale 就是这一帧玩家用的乘数，写晚一帧就「刚抬起来还能冲刺一步」"],
  ["player", "emplacement", "射界限位要夹的是这一帧的视线，夹晚一帧画面会先越界再被拉回来"],
  ["player", "interact", "按住型交互够不够得着要用这一帧的位置，走开一步进度就该断"],
  ["interact", "hands", "收枪边沿要看这一帧交互与负重的结果"],
  ["firearms", "cameraFov", "开火顿挫这一帧就进 FOV"],
  ["cameraFov", "hud", "HUD 读这一帧的武器（frameState.weapon）"],
  ["flare", "ai", "照明弹的发现距离倍率要在这一帧的 Think 之前写进 AiDirector"],
  ["companion", "ai", "同伴的 goal 要在这一帧的 Think 之前写进去，晚一帧就是「班长永远慢你一步」"],
  ["ai", "physics", "玩家与 AI 是运动学体，位移先写进刚体，手雷读同步之后的位置"],
  ["physics", "vfx", "断肢块先把刚体位姿同步到网格，断面上的血源才跟得上"],
  ["combat", "playerDown", "死亡判定放在所有会造成伤害的系统之后，不然手榴弹 / 扫射炸死会被整帧吞掉"],
  ["playerDown", "checkpoint", "检查点采这一帧最终的状态，不然倒带会退回到「刚好要死」那一刻"],
  ["mission", "objectives", "任务运行时先推进，路标读它的结果"],
  ["narrative", "setpieces", "摆点的 onVoice 读 story.fired，排在前面每一拍都慢一帧"],
  ["outcome", "spawn", "补兵用 outcome 定下的这一关（frameState.phase）"],
  ["outcome", "hud", "HUD 用这一关的标签与标记"],
  ["hud", "render", "画面出的是这一帧的 HUD 状态"],
].map(([before, after, why]) => Object.freeze({ before, after, why })));
