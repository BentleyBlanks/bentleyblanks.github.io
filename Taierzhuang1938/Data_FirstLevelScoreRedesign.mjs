// 第一关配乐重配方案（2026-10-13，用户：「参考 COD4/5 与战地的配乐风格，重新给我配一下第一关需要的各个背景音乐，
// 同时我需要能在白盒设计工具里来预览」）。口径见 docs/Data_FirstLevelScoreRedesign.md。
//
// 这是**候选方案**：游戏运行时仍只读 Data_FirstLevelMissionMusic（现行九首）。这里给白盒编辑器的「配乐」面板用：
//   · 每个白盒关键帧对应的任务步骤（SCORE_KEYFRAME_STEP）→ 现行配乐（CurrentScoreForKeyframe）；
//   · 每个关键帧的新方案（SCORE_REDESIGN_PLAN）→ 新曲（SCORE_REDESIGN_CUES，Script_FirstLevelScoreRedesignBake 生成）。
// 用户在编辑器里 A/B 听过、拍板后，才把选中的曲子和映射搬进 Data_FirstLevelMissionMusic。
// 纯数据 + 纯函数，node 与浏览器共用，不碰 DOM / three。
import { FIRST_LEVEL_MUSIC_CUES, FIRST_LEVEL_MUSIC_MIX, FIRST_LEVEL_MUSIC_OPENING, FIRST_LEVEL_STAGE_MUSIC }
  from "./Data_FirstLevelMissionMusic.mjs";

export const SCORE_REDESIGN_VERSION = "20261013-cod-bf-r1";
export const SCORE_REDESIGN_DIR = "Audio/Music/FirstLevelRedesign";
export const SCORE_CURRENT_DIR = "Audio/Music";

// 整套配乐共用的声音签名（每首提示词的开头）。三条参考各取一样东西：
//   战地 1 的粗粝失真低弦锯弓 / 使命召唤 4 的混合电子脉冲与低频轰鸣 / 使命召唤：战争世界给敌我配地域打击乐的思路
//（这里换成中国大堂鼓与低音埙，作为 1938 年川军这部戏自己的颜色）。贯穿动机沿用现行「往南的路」的 D—A—F—E。
// SeedAudio 的坑（Data_MusicSources 开头）：否定式只对乐器有效、对结构无效；要稀疏就写编制，别写 sparse。
export const SCORE_BIBLE = "创作一首原创纯器乐战争游戏配乐，用于1938年滕县保卫战（川军视角）第一关《往南的路》。整套配乐的声音签名："
  + "一、参考《战地1》粗粝的失真低音弦乐：大提琴与低音提琴用力锯弓，带颗粒感和轻微失真；"
  + "二、参考《使命召唤4》的混合电子：低频模拟合成器脉冲、细小的金属滴答、深沉的低频轰鸣；"
  + "三、参考《使命召唤：战争世界》的地域打击乐思路，用中国大堂鼓与低音埙作为本作的地域色彩，干燥、低沉、带木质。"
  + "贯穿全关的主题动机是四个音 D—A—F—E（长音D、短音A、短音F、长音E）。"
  + "混音给对白与枪炮留出中频空间，低频紧实，混响偏短偏暗。"
  + "无人声、无合唱、无歌词、无旁白；不生成枪声、爆炸、飞机、脚步、警报等任何实景音效；不用电吉他、钢琴、流行和弦或舞曲节拍。"
  + "旋律完全原创，不引用任何已有作品的旋律。";

const LOOP_TAIL = "首尾保持同一调性、同一能量和同一织体，不做开头渐强、片尾收束或淡出，便于循环。";

const Cue = (id, title, role, refs, scene, bpm, key, body, { level = 0.6, loop = true, seconds = 90 } = {}) =>
  [id, Object.freeze({
    id, title, role, refs, scene, bpm, key, level, loop, seconds,
    file: `${SCORE_REDESIGN_DIR}/AudioBgm_Redesign${id}.mp3`,
    prompt: `${SCORE_BIBLE}\n\n曲名《${title}》，目标时长约${seconds}秒，约${bpm} BPM，${key}。${body}${loop ? LOOP_TAIL : ""}`,
  })];

// role：床 = 垫在对白与战场声下面的低强度循环；战斗 = 有律动的交火循环；段落 = 一段戏专用；主题 = 动机的完整陈述。
export const SCORE_REDESIGN_CUES = Object.freeze(Object.fromEntries([
  Cue("ShellShock", "炮后余震", "床", "COD4 关卡开场的低频氛围 + BF1 失真大提琴刮奏",
    "01 洞内开场、压在塌木下、02 班长塞枪", 56, "D小调",
    "整首只有三样东西：一条极低的D音合成器持续音，缓慢起伏像呼吸；大提琴在琴马附近偶尔刮出一下粗糙的失真长音；"
    + "每隔几秒远处一记很闷的大堂鼓，像心跳。高音区几乎空着，没有旋律、没有节拍型。压抑、发懵、劫后余生。",
    { level: 0.5 }),
  Cue("TrenchPulse", "壕沟脉冲", "床", "COD4 任务间隙的电子脉冲 + 滴答",
    "02 后交通壕、03 接令往北、07 沟口遭遇、08 进村、18 接令", 100, "D小调",
    "低音合成器八分音符脉冲贯穿全曲，一层细小的金属滴答像怀表，低弦拨奏偶尔给一个重音；"
    + "每十六小节低音埙吹出动机的前两个音D—A，然后停住。没有鼓组、没有铜管旋律。紧张但克制，可以长时间垫在对白与零星枪声下面。",
    { level: 0.55 }),
  Cue("FrontLine", "前沿绞肉", "战斗", "BF1 失真弦乐锯弓 + COD 战斗推进",
    "03 夺下机枪座后的反扑、04 战车压上来、12 掩护装载", 120, "D小调",
    "大提琴与中提琴十六分音符失真锯弓固定音型是引擎；大堂鼓与低通鼓打沉重的3+3+2重音；低铜管与长号每四小节两下短促重击；深层合成器低音托底。"
    + "每八小节换一层配器；中段八小节去掉鼓只剩锯弓与脉冲，再把鼓加回来。动机D—A—F—E只以低铜管残缺的两三个音出现。残酷、狼狈，不英雄、不凯旋。",
    { level: 0.55 }),
  Cue("SapTrench", "支沟", "床", "COD4《全身伪装》式潜行张力",
    "05 沿支沟捡集束弹、摸到战车侧面", 84, "D小调",
    "高弦极弱的泛音持续音、低音合成器像心跳的两拍脉冲、很弱的金属滴答；每隔一阵一记被刮擦的大提琴失真音。"
    + "越往后脉冲越密、泛音越高，但始终不加鼓、不加铜管。没有旋律。像人贴着沟壁往前挪，敌人就在头顶。",
    { level: 0.55 }),
  Cue("HomewardTheme", "往南", "主题", "BF1 主题的安静陈述 / COD4 喘息段",
    "06 集结处接令、07 沟中、11 桥头接运点、12 坐上驴车", 70, "D小调与F大调交替",
    "主题曲的安静版本：一把温暖不失真的独奏大提琴完整唱出动机D—A—F—E，再发展成八小节旋律；低音埙在远处回应；"
    + "底下是柔和的低弦长音和极轻的合成器长音，低弦拨奏给出缓慢的步伐。有温度，疲惫里带一点真实的希望，不做凯旋高潮，不预告悲剧。",
    { level: 0.6 }),
  Cue("VillageCQB", "巷战", "战斗", "COD 战争世界贴身战的打击乐切分 + 工业金属",
    "08 主街受阻、09 灶屋连屋近战、10 守巷口", 132, "D小调",
    "中国堂鼓与干燥小军鼓打紧凑的切分节奏，低弦短促断奏，失真低音合成器，金属撞击作打击乐，铜管尖锐短促的不协和重音。"
    + "比前沿更快、更窄、更贴身，像在屋与屋之间撞门。中段八小节只剩打击与低音，再全部回来。不是炫技爽曲。",
    { level: 0.55 }),
  Cue("AirRaid", "空袭", "段落", "BF1 的混乱段落 + COD 的低频轰鸣",
    "13 日机扫路、14 第二轮扫射转入西沟", 100, "D小调",
    "弦乐整体不断向上滑奏，形成无尽上升的压迫感；低铜管巨大的低频轰鸣每四小节一次；不规则的大堂鼓重击与突然的半拍停顿交替；高弦尖锐颤音。"
    + "表现天上的东西压下来、人无处可躲、刚运转起来的转运链崩溃。不能写成痛快的动作大片。",
    { level: 0.55 }),
  Cue("Wounded", "抬着走", "床", "COD4 低频心跳床 + 独奏大提琴",
    "15 沟尾到院门、16 交接", 64, "D小调",
    "两个声部：极低的合成器与低弦像缓慢心跳的两拍脉冲；一把独奏大提琴只拉动机的前三个音D—A—F，然后停在半空，长时间留白；"
    + "偶尔远处一声很轻的大堂鼓。焦急、不敢放弃的希望。不哭腔、不葬礼、不宣告死亡。",
    { level: 0.5 }),
  Cue("BridgeFall", "断桥", "战斗", "BF1「最后一搏」：失真低弦 + 铜管完整主题",
    "18 南岸接应尾队、炸桥", 108, "D小调",
    "一开始就是失真低弦锯弓的持续固定音型和沉重的大堂鼓；长号与圆号把动机D—A—F—E完整地吹出来，壮烈而沉重；"
    + "逐层加厚到全编制，每十六小节一次巨大的低频冲击，然后撤回一层再推上去。仍在战斗中，不是胜利。",
    { level: 0.55 }),
  Cue("NightGate", "夜入滕城", "主题", "COD 关卡结尾曲：主题低音区陈述",
    "18 夜里到北门外，城里搬弹药、分防区", 60, "D小调",
    "关卡结尾：低音长号与低音埙极慢地吹出动机D—A—F—E，大提琴低音持续，远处偶尔一声大堂鼓。"
    + "不是胜利，是更大的仗要来了的沉重预感。最后悬在一个不解决的低音上慢慢消失。",
    { level: 0.6, loop: false }),
]));

// 白盒关键帧（Blockout/FirstLevel.json）→ 那一刻游戏在跑的任务步骤（Data_FirstLevelMissionStages 的 steps）。
// 一个公开阶段有几步的（02 / 12 / 14 / 15 / 18），按关键帧讲的是哪一步分开。
export const SCORE_KEYFRAME_STEP = Object.freeze({
  "01-1": "Trapped", "01-2": "Trapped", "02-1": "BunkerRescue", "02-2": "RearTrench",
  "03-1": "Support", "03-2": "Support", "03-3": "Support", "04-1": "MachineGun", "04-2": "MachineGun",
  "05-1": "Tank", "05-2": "Tank", "05-3": "Tank", "05-4": "Tank", "06-1": "Orders", "06-2": "Orders",
  "07-1": "South", "07-2": "South", "07-3": "South", "08-1": "Village", "08-2": "Village", "08-3": "Village",
  "09-1": "Melee", "09-2": "Melee", "09-3": "Melee", "10-1": "Courtyard", "10-2": "Courtyard",
  "11-1": "TransferApproach", "12-1": "Transfer", "12-2": "Transfer", "12-3": "CartRide",
  "13-1": "AirFirst", "13-2": "AirFirst", "14-1": "Carry", "14-2": "Dive",
  "15-1": "Regroup", "15-2": "WallPath", "15-3": "WallPath", "15-4": "ReceptionGate",
  "16-1": "Handover", "17-1": "Death",
  "18-1": "BridgeOrders", "18-2": "BridgeCover", "18-3": "BridgeWithdraw", "18-4": "NightMarch",
});

// 新方案：cue = SCORE_REDESIGN_CUES 的 id，null = 这一刻不放乐（只留战场声与对白）；level = 预览电平（× cue.level）。
// 总思路（COD4 / 战地）：音乐少放、放就有用。交火最凶的时候大段只给床或静，真正的配乐留给几个转折。
const P = (cue, why, level = 1) => Object.freeze({ cue, why, level });
export const SCORE_REDESIGN_PLAN = Object.freeze({
  "01-1": P("ShellShock", "开场不给旋律，只给低频与远处心跳般的鼓——先让耳朵知道「这是战场」", 0.8),
  "01-2": P(null, "近爆之后整段静：耳鸣、喘息、日军说话声就是全部（沿用现行近爆静默）"),
  "02-1": P("ShellShock", "枪到手里，配乐从静默里慢慢爬回来，还是没有节拍"),
  "02-2": P("TrenchPulse", "沿后交通壕撤：脉冲起来，人开始动"),
  "03-1": P("TrenchPulse", "接令往北，班长带路"),
  "03-2": P("TrenchPulse", "观察射台三指：脉冲压低，让班长的话清楚", 0.7),
  "03-3": P("FrontLine", "夺点后侧翼和军官反扑——第一次真正的战斗曲"),
  "04-1": P("FrontLine", "战车与跟车步兵一起出来；战车不做 boss，不给专门标点"),
  "04-2": P("FrontLine", "退到后墙隔院对打"),
  "05-1": P("SapTrench", "钻支沟：从战斗曲换成潜行张力，鼓全撤"),
  "05-2": P("SapTrench", "倒下的弟兄和两捆集束弹"),
  "05-3": P("SapTrench", "车侧 8–10 m，张力最紧"),
  "05-4": P(null, "车哑了、人退了：配乐收掉，让战场声和喘息说话（不起胜利音乐，契约 §1.5）"),
  "06-1": P(null, "集结处借火：人话时刻，不放乐"),
  "06-2": P("HomewardTheme", "接下后送任务：主题第一次完整出现", 0.8),
  "07-1": P("HomewardTheme", "沿沟南行说悄悄话"),
  "07-2": P("TrenchPulse", "东边机枪一响，主题被打断"),
  "07-3": P("TrenchPulse", "压住机枪、担架冲过空地"),
  "08-1": P("TrenchPulse", "进村巷子，紧张但还没打", 0.8),
  "08-2": P("VillageCQB", "主街被堵、东窗机枪扫街"),
  "08-3": P("VillageCQB", "老耿指灶屋，转向西边夹道", 0.8),
  "09-1": P("VillageCQB", "过道被扑倒反刺"),
  "09-2": P("VillageCQB", "夹道里窜出人"),
  "09-3": P("VillageCQB", "后院两路汇合、侧屋机枪"),
  "10-1": P("VillageCQB", "守巷口两拨追兵"),
  "10-2": P(null, "担架都过了门：收掉，喘口气"),
  "11-1": P("HomewardTheme", "桥头接运点：第一次觉得能把人送走"),
  "12-1": P("FrontLine", "低墙守住装载", 0.85),
  "12-2": P("FrontLine", "回头看老周被抬上驴车", 0.7),
  "12-3": P("HomewardTheme", "坐车往南、低墙远去——空袭前最后的暖（COD 惯用的「暴风雨前」）"),
  "13-1": P("AirRaid", "飞机扫路，黑子倒下"),
  "13-2": P("AirRaid", "车走不了，接运兵指西沟", 0.8),
  "14-1": P("AirRaid", "抬担架走向沟口，飞机回转", 0.9),
  "14-2": P("AirRaid", "第二轮扫射，扑进沟"),
  "15-1": P(null, "沟里收拢点名：整关第一次真正的安静（沿用现行 15A 不放乐）"),
  "15-2": P("Wounded", "沟尾坡顶，抬着老周找接收处", 0.8),
  "15-3": P("Wounded", "夹道拐角", 0.8),
  "15-4": P("Wounded", "院门确认身份", 0.8),
  "16-1": P("Wounded", "抬过门槛放上床"),
  "17-1": P(null, "「人没了」：静。死亡不配乐，门外又抬来一副"),
  "18-1": P("TrenchPulse", "传令兵：回城，接尾队——悲伤被下一道命令打断"),
  "18-2": P("BridgeFall", "南岸接应尾队过浮桥，北边土坎敌火"),
  "18-3": P("BridgeFall", "撤出爆破区，桥断——主题第一次由铜管完整吹出"),
  "18-4": P("NightGate", "夜入北门：结尾曲，把下一关的城防压下来"),
});

/** 现行游戏在这个关键帧放什么：{ cueId, title, file, level }；不放乐 → null。只看阶段映射与阶段电平，不模拟对白让位 / 战斗让位。 */
export function CurrentScoreForKeyframe(keyframeId) {
  const step = SCORE_KEYFRAME_STEP[keyframeId];
  if (!step) return null;
  // 01-2：近爆之后静 silenceS 秒再爬回（FIRST_LEVEL_MUSIC_OPENING），这里按「静」报
  if (keyframeId === "01-2") return null;
  const id = FIRST_LEVEL_STAGE_MUSIC[step];
  if (!id) return null;
  const cueId = `firstLevel${id}`, cue = FIRST_LEVEL_MUSIC_CUES[cueId];
  const mix = FIRST_LEVEL_MUSIC_MIX;
  const scale = ({ RearTrench: mix.rearTrenchScale, Orders: mix.ordersScale, Transfer: mix.transferScale,
    Handover: mix.handoverScale, WallPath: mix.wallPathScale, ReceptionGate: mix.wallPathScale,
    ...FIRST_LEVEL_MUSIC_OPENING.stages })[step] ?? 1;
  return { cueId, title: cue.label, file: `${SCORE_CURRENT_DIR}/${cue.file}`, level: cue.level * scale, step };
}

/** 新方案在这个关键帧放什么：{ cueId, title, file, level, why, role, refs }；不放乐 → { cueId: null, why }。 */
export function RedesignScoreForKeyframe(keyframeId) {
  const plan = SCORE_REDESIGN_PLAN[keyframeId];
  if (!plan) return null;
  if (!plan.cue) return { cueId: null, title: null, file: null, level: 0, why: plan.why };
  const cue = SCORE_REDESIGN_CUES[plan.cue];
  return { cueId: plan.cue, title: cue.title, file: cue.file, level: cue.level * plan.level, why: plan.why,
    role: cue.role, refs: cue.refs };
}

/** 曲库：现行九首 + 新方案十首，给编辑器的曲库列表。 */
export function ScoreLibrary() {
  const usedNow = new Set(Object.values(FIRST_LEVEL_STAGE_MUSIC).filter(Boolean).map(id => `firstLevel${id}`));
  const current = Object.entries(FIRST_LEVEL_MUSIC_CUES).map(([cueId, cue]) => ({
    set: "current", cueId, title: cue.label, file: `${SCORE_CURRENT_DIR}/${cue.file}`, level: cue.level,
    note: usedNow.has(cueId) ? "" : "当前流程不播",
  }));
  const redesign = Object.values(SCORE_REDESIGN_CUES).map(cue => ({
    set: "redesign", cueId: cue.id, title: cue.title, file: cue.file, level: cue.level,
    note: `${cue.role} · ${cue.bpm} BPM`,
  }));
  return { current, redesign };
}
