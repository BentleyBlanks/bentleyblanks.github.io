// 音效音乐编辑器：全套声音的试听台 + 指认台。
//
// ## 每个音都有两层：实录采样盖在合成配方上
// 底层是 WebAudio 节点图现算的 33 个配方（Script_Audio 的 RECIPES），
// 上面盖着一层实录素材（Audio/Sfx/，来源见 Data_SfxSources.mjs）。
// 采样是异步 fetch 的，**盖不上去就自动退回合成** —— 所以列表里每条都标了
// 「采样 / 合成」：当前到底在响哪一层，只有摆出来才答得清。
// 名字（rifleNra / impactFlesh / shellIncoming）光看字面认不出是什么声音，
// 这就是「指认」那一栏存在的理由：一句中文说明 + 它在游戏里什么时候响。
//
// ## 盲听
// 混音表（MIX_GAIN）是拿实拍峰值配的，但「这一声在战场上够不够清楚」只能靠耳朵。
// 盲听模式随机播一个、给四个候选 —— 认错的那几个通常就是**需要重新配平**的：
// 拉栓与压弹分不开、砖与土分不开，玩家在战场上也就分不开。
//
// ## 三条注意
//   1. AudioContext 必须由用户手势解锁。打开这个编辑器本身就是一次点击，
//      所以 Enter() 里直接 Unlock()，人声也是在那一刻才开始下载。
//   2. 出图模式（?shot=1）里 AudioEngine 是 enabled:false —— 全栏会显示「已关闭」。
//   3. 环境床与音乐是**常驻**的：编辑器里点开之后退出编辑器不会自动停，
//      所以 Exit() 里把它们还原成进来时的样子。

import { Panel, Section, Slider, Chips, ButtonRow, Button, Facts, Note, ListBox, El }
  from "./Script_EditorUi.mjs";
import { SOUND_NAMES, AMBIENCE_PRESETS, MUSIC_CUES } from "./Script_Audio.mjs";
import { VOICE_LINES } from "./Data_Voice.mjs";

/**
 * 配方 → 「这是什么声音、什么时候响」。
 * 这张表是**给人用的**，不参与任何逻辑；漏一条只是列表里少一句说明。
 */
const SOUND_INFO = {
  rifleNra: ["枪械", "中方步枪近射", "中正式/汉阳造在身边开火。7.92 的爆响 + 街巷回声"],
  rifleNraFar: ["枪械", "中方步枪远射", "两百米外的枪声，只剩一记闷炸和尾巴。环境床的主料"],
  rifleIja: ["枪械", "日军步枪近射", "三八式。6.5 mm 声音更脆更高，与中方那一支必须听得出区别"],
  rifleIjaFar: ["枪械", "日军步枪远射", "远处日军的射击，环境床里与中方那条交替出现"],
  zb26: ["枪械", "捷克式点射", "ZB-26，全班唯一一挺轻机枪。默认 3 发一点"],
  type11: ["枪械", "十一年式点射", "日军歪把子，4 发一点"],
  type92: ["枪械", "九二式重机枪", "「啄木鸟」——射速只有 200 发/分，节奏明显慢"],
  bolt: ["枪械", "拉栓", "抬-拉-推-闭一整套。玩法反馈音，听不见等于没有"],
  stripperLoad: ["枪械", "桥夹压弹", "五发桥夹从上方压进固定弹仓"],
  magIn: ["枪械", "弹匣入位", "捷克式从上方插弹匣"],
  shellDrop: ["枪械", "抛壳落地", "空壳落在砖石地上。压得极低 —— 它是玩法反馈的边料，不是事件"],
  grenadePin: ["爆炸", "拧弹盖 / 拉弦", "木柄手榴弹的引信。攥弹倒计时从这一声起"],
  grenadeThrow: ["爆炸", "投掷", "抡臂出手的风声"],
  explosionNear: ["爆炸", "近距爆炸", "近处炮弹的短促冲击与碎土；耳鸣由游戏混音另行触发"],
  explosionFar: ["爆炸", "远处爆炸", "城外落弹的闷响，环境床用"],
  shellIncoming: ["爆炸", "炮弹啸声", "落点前的预警。听到它到炸有 1.5 秒 —— 这是玩家唯一的躲避窗口"],
  shellImpact: ["爆炸", "炮弹落地", "野炮/山炮命中，比手榴弹低一个八度"],
  launcherPop: ["爆炸", "掷弹筒发射", "「咚」的一声闷响，接着是 3.2 秒飞行"],
  dadaoSwing: ["白刃", "大刀挥空", "破风声。挥空与劈中必须听得出区别，不然玩家不知道砍没砍到"],
  dadaoHit: ["白刃", "大刀劈中", "钝器入肉，带一点骨头的脆响"],
  bayonetHit: ["白刃", "刺刀命中", "刺入 + 拔出。比劈砍短促"],
  goreSever: ["断肢", "卸掉一段肢体", "撕开 + 断骨两层。断肢开关关掉时这一声也不响"],
  goreLimbLand: ["断肢", "肢块落地", "飞出去那一段落在地上的湿闷一记，是「它落在哪」的线索"],
  impactBrick: ["命中", "打在砖上", "青砖飞屑。城里最常听到的一种跳弹"],
  impactDirt: ["命中", "打在土上", "夯土/地面，闷、短、没有尾巴"],
  impactWood: ["命中", "打在木头上", "门板、房梁、电线杆"],
  impactMetal: ["命中", "打在铁上", "铁门、战车装甲、锅碗。带金属余振"],
  impactFlesh: ["命中", "打中人", "这一声决定玩家知不知道自己命中了"],
  hitConfirm: ["命中", "命中确认", "贴在听者正中的轻提示，只说明这一发打中了，不代替真实中弹声"],
  killConfirm: ["命中", "击杀确认", "比命中确认更低、更短；一次爆炸放倒多人也只播一条"],
  footstepDirt: ["身体", "脚步 · 土路", "低优先级：预算紧时先丢它"],
  footstepRubble: ["身体", "脚步 · 瓦砾", "踩碎砖的碎响，城破之后的主要地面"],
  bodyFall: ["身体", "倒地", "一个人倒下的闷响 + 装具的碰撞"],
  hurt: ["身体", "中弹闷哼", "非语言的痛呼，与人声库里那几句是两回事"],
  heartbeat: ["身体", "心跳", "重伤/濒死时的主观听感"],
  trainBrake: ["环境", "列车制动", "序章列车减速入站；金属摩擦与车体低频一起收慢"],
  trainWhistle: ["环境", "列车汽笛", "序章蒸汽机车入站前的长鸣，制动声之前先到"],
  carriageRattle: ["环境", "车厢震响", "木制车厢随轮轨节奏发出的短促结构响动"],
  stretcherWood: ["环境", "担架木杆", "小站窗外担架在行走中轻碰、受力的木质声"],
  coughLow: ["身体", "轻伤员低咳", "小站轻伤员压低的咳嗽，不使用儿童哭声"],
  gearRustle: ["身体", "装具摩擦", "士兵停手、起身和取装备时布料与皮具的摩擦"],
  carriageDoorSlide: ["环境", "车门滑开", "到站后木门沿滑轨打开，接下车段"],
  stepBallast: ["身体", "脚步 · 道砟", "士兵与玩家跳下车后踩在铁路碎石上的落脚声"],
  bugleCharge: ["信号", "冲锋号", "军号动机。反攻与突围的信号"],
  whistle: ["信号", "哨音", "军官下令的哨子"],
  // --- 2026-08-29 INT3a 接线的十五条（素材见 docs/Data_AudioAssets.md 清单）----
  // 这一批从 manifest.pendingCues 毕业进 cues 时忘了补说明，编辑器列表里
  // 就是十五个认不出的名字（Script_EditorTest「每个配方都有分类与说明」那条红）。
  execScream: ["身体", "处决惨叫", "三关处决段：隔着一堵墙、低概率、低音量。两个变体都是短促的一声，不做长嚎"],
  painMoan: ["身体", "伤员痛呼", "三/四关大出血伤员的持续呻吟，捂着嘴的那一种。救护所的底噪之一"],
  hitGrunt: ["身体", "中弹闷哼（重）", "四关罗班长腹部中弹那一下。比 hurt 更闷更短，只响一次"],
  flareLaunch: ["信号", "照明弹发射", "四关东关之夜：发射筒那一记闷响，接着是上升的啸声"],
  flareIgnite: ["信号", "照明弹点燃", "顶空「噗」的一下。光强 0.35 s 冲到满，声音要压在同一拍上"],
  flareBurn: ["信号", "照明弹燃烧", "伞降滞空期的持续嘶声，循环播；一直在响的东西按脚步那一档配平，不按事件"],
  flareOut: ["信号", "照明弹熄灭", "自然烧完的衰减段。它一停就进暗适应，玩家先听见再看见"],
  telegraphKey: ["信号", "电键单点", "终章发报：按一下发一组码。三个变体**顺序轮播不随机**，随机会连出两次同一条"],
  telegraphHum: ["信号", "发报机底噪", "终章电台桌旁的电流低鸣，循环播。断线那一拍它也跟着停"],
  planeDive: ["环境", "日机俯冲", "一关日机通场：由远及近的发动机声，扫射线之前先到"],
  // 与 planeDive 是两件事：这条是**挂在机身上逐帧搬位置**的循环引擎（带多普勒），
  // 从进入段第一帧起一直响；planeDive 是录好多普勒的实录通场，压到头顶前才放一次。
  // 见 Data_AircraftStrafe.STRAFE_SFX 的 drone / engine 两档。
  planeDrone: ["环境", "日机引擎（持续）", "双发活塞引擎采样，跟随机身循环与变调；试听 10 秒自动停止，也可点击停止音效"],
  strafeNear: ["枪械", "空对地扫射（近）", "航空机枪约 900 发/分，身份就是「一梭子」——只给一发这条 cue 就不成立"],
  strafeFar: ["枪械", "空对地扫射（远）", "同一挺枪、同一次射击，三百米外的另一支麦。远近两条要能拼出距离感"],
  strafeDirt: ["命中", "弹着扫过土路", "一串近弹扫过地面的连击。它决定玩家知不知道这一趟航线压到了自己头上"],
  mgOverheat: ["枪械", "重机枪过热", "五关机枪位：过热到卡住时的咔哒。两个变体交替，别听成拉栓"],
  mgCharge: ["枪械", "重机枪拉柄", "卡壳后拉柄排除故障。与 bolt 同一条理由 —— 清没清得靠听"],
  // --- 2026-09-08 INT4 接线批（口径见 docs/Data_AudioWiring.md）------------
  bulletCrack: ["枪械", "弹啸 · 激波", "超音速弹头掠过耳边那一下。它比枪声先到，方向来自弹道不是枪口 —— 「有人在打我」的唯一线索"],
  bulletWhizz: ["枪械", "弹啸 · 擦过", "1.5 m 以内再叠的一层「咻」，弹头搅动空气的湍流。再远就听不出来了"],
  ricochet: ["命中", "跳弹", "打在砖石铁上有四分之一削飞出去。弹头在转，所以是带颤的下滑哨音，不是「叮」"],
  impactStone: ["命中", "打在石头上", "条石、门墩、石碾。比青砖硬、比铁闷，碎屑更细"],
  footstepWood: ["身体", "脚步 · 木板", "木地板、木桥、车厢。落地之后有板子自己的共振 —— 那就是「空的」"],
  footstepStone: ["身体", "脚步 · 石板", "青石板街与砖地。硬、亮、短，两侧有墙所以带回声"],
  footstepGrass: ["身体", "脚步 · 草地", "田埂与麦茬地。几乎没有低频冲击，全是干草被压下去的沙沙"],
  footstepMud: ["身体", "脚步 · 泥地", "水田与河滩。落地闷得没有瞬态，抬脚黏着那一下才是主角"],
  clothMove: ["身体", "布料摩擦", "起身、蹲下、翻墙。翻越那一下是「我确实过去了」的唯一听觉回执"],
  gearRattle: ["身体", "装具晃动", "冲刺时水壶、弹带、饭盒互相磕。是一串不规则碰撞，不是一条噪声"],
  breathHeavy: ["身体", "粗喘", "跑久了或血量见底。非空间化且不给混响 —— 这是自己的肺，给了房间就成了旁边有人在喘"],
  bodyLand: ["身体", "落地", "玩家两脚同时着地 + 一身装备被顿一下。与 bodyFall（一个人倒下）不是一回事"],
  grenadeBounce: ["爆炸", "手榴弹弹跳", "木柄先着地一记木响，弹体跟着「当」。它落在哪儿全靠这一声"],
  grenadeRoll: ["爆炸", "手榴弹滚动", "木柄在砖地上翻着走，越滚越慢。脚边那一枚最吓人的一段"],
  explosionMid: ["爆炸", "中距爆炸", "40—120 m：这条街那头。有冲击没有碎片声，尾巴还带方位"],
  debrisFall: ["爆炸", "落屑", "近炸半秒到一秒之后砖屑瓦片才落回地面。撒在爆心周围 3—8 m"],
  fireSpot: ["环境", "火场点声源", "烧着的房子/残骸。低频呼呼 + 木头爆裂两层，缺后者就是电吹风。同时最多四条"],
  zb26Far: ["枪械", "捷克式远射", "同一挺枪，只是听的位置换了：只剩低频的「咚咚咚」加一条长尾"],
  type11Far: ["枪械", "十一年式远射", "歪把子的远场层。射速仍按史实 500 rpm 排"],
  type92Far: ["枪械", "九二式远射", "「啄木鸟」在两百米外仍然认得出来 —— 200 rpm 的间隔是它的身份证"],
  gunTailOpenRifle: ["枪械", "枪尾 · 开阔地（步枪）", "没有早期反射可做，尾巴稀疏而长，全靠混响散开"],
  gunTailOpenMg: ["枪械", "枪尾 · 开阔地（机枪）", "同上，更低更长"],
  gunTailStreetRifle: ["枪械", "枪尾 · 街巷（步枪）", "三记离散早期反射之后很快糊掉 —— 「两侧有墙」就是这么听出来的"],
  gunTailStreetMg: ["枪械", "枪尾 · 街巷（机枪）", "同上，频心更低"],
  gunTailInteriorRifle: ["枪械", "枪尾 · 屋内（步枪）", "墙太近，几乎只剩五记反射本身，时间差不到 10 ms"],
  gunTailInteriorMg: ["枪械", "枪尾 · 屋内（机枪）", "同上。屋里开机枪是全场最刺耳的一档"],
};

/**
 * 分类签。**导出给测试用**：`Script_EditorTest` 的「每个配方都有分类与说明」
 * 要逐类点一遍再与 `SOUND_NAMES` 对账；那边拄一份同样的列表的话，
 * 新开一类（断肢就是）会让那条断言莫名其妙地红一次。
 */
export const CATEGORIES = ["全部", "环境", "枪械", "爆炸", "命中", "白刃", "断肢", "身体", "信号"];

/** 人声按 kind 归组的中文名（Data_Voice 的 kind 字段）。 */
const VOICE_KIND = {
  rally: "鼓动 / 督战", spot: "报敌情", warn: "警告", ammo: "弹药", hurt: "负伤", move: "机动",
};

// 第一条报错原样摊开：`文件：原因 @ 绝对URL`。截断只为不把面板撑爆，
// 但**绝对 URL 那一段要留住** —— 它才是查「为什么读不到」唯一有用的信息。
function FirstError(list) {
  const e = list[0] || {};
  const msg = String(e.message || "未知原因");
  return `${e.file || "?"}：${msg.length > 180 ? msg.slice(0, 180) + "…" : msg}`;
}

export class AudioEditor {
  static id = "audio";
  static label = "音效音乐";
  static hint = "全部配方的试听、混音参数与盲听指认";

  constructor(host) {
    this.host = host;
    this.panel = null;
    this.cameraMode = "none";   // 听声音不动相机：画面停在打开编辑器的那一帧
    this.category = "全部";
    this.soundName = SOUND_NAMES[0];
    this.volume = 1;
    this.pitch = 1;
    this.burst = 0;              // 0 = 用配方默认
    this.distance = 0;           // 0 = 非空间化
    this.blind = null;           // { answer, options, tries }
    this.blindScore = { right: 0, total: 0 };
    this.lastSampled = -1;       // 采样是异步载入的，数字一变就重刷列表尾标
    this.savedAmbience = null;
    this.savedMusic = null;
    this.ambButtons = new Map();
    this.musicButtons = new Map();
    this.previewVoices = new Set();
    this.previewTimers = new Set();
  }

  get audio() { return this.host.audio; }

  Enter(root) {
    const audio = this.audio;
    // 打开编辑器这一下就是用户手势 —— 人声也从这一刻开始下载
    if (audio) {
      audio.Unlock();
      this.savedAmbience = audio.ambiencePreset || "silence";
      this.savedMusic = audio.musicCue || null;
    }
    this.panel = Panel({
      title: "音效音乐编辑器", sub: "",
      variant: "work wide", onClose: () => this.host.Close(),
    });
    root.appendChild(this.panel.root);
    this.BuildUi(this.panel.body);
    this.FillSounds();
    return this;
  }

  Exit() {
    this.StopSoundPreview();
    const audio = this.audio;
    if (audio) {
      // 环境床与音乐是常驻的：不还原的话退出编辑器之后战场上会一直挂着菜单音乐
      audio.Ambience(this.savedAmbience || "silence");
      audio.Music(this.savedMusic || null);
      // 关掉这个编辑器的时候游戏**还停着**（面板还开着）。上面两行刚把背景层放回去，
      // 不再停一次的话「暂停时静音」当场就被这里破坏了 ——
      // 真正的恢复由 SetPaused(false) 在离开暂停时按 pausedState 做。
      if (audio.paused) audio.StopBackground();
    }
    if (this.panel) this.panel.root.remove();
    this.panel = null;
  }

  // -------------------------------------------------------------------------
  // 界面
  // -------------------------------------------------------------------------

  BuildUi(body) {
    const state = Section(body, "引擎");
    this.engineFacts = Facts(state, ["状态", "采样缺失", "人声缺失"]);
    // 采样载不到时最要紧的两件事：**它去要的是哪个地址**（多 agent 并行时
    // 十有八九是浏览器指在了别人那棵树上），和**能不能就地再试一次**。
    Button(state, "↻ 重拉采样包", () => {
      if (!this.audio) return;
      this.audio.Unlock();
      this.audio.ReloadPacks();
    });

    const sfx = Section(body, "音效配方");
    Chips(sfx, CATEGORIES, this.category, (v) => { this.category = v; this.FillSounds(); });
    this.soundList = ListBox(sfx, {
      height: 210,
      onPick: (name) => { this.soundName = name; this.Describe(); this.PlayCurrent(); },
    });
    this.soundNote = Note(sfx, "");

    const play = Section(body, "试听参数");
    Slider(play, { label: "音量", min: 0, max: 2, step: 0.05, value: 1, onInput: (v) => { this.volume = v; } });
    Slider(play, { label: "变调", min: 0.5, max: 2, step: 0.01, value: 1, onInput: (v) => { this.pitch = v; } });
    Slider(play, {
      label: "点射发数", min: 0, max: 10, step: 1, value: 0,
      format: (v) => (v === 0 ? "默认" : String(v)),
      onInput: (v) => { this.burst = v; },
    });
    Slider(play, {
      label: "距离", min: 0, max: 200, step: 1, value: 0,
      format: (v) => (v === 0 ? "贴耳" : `${v} m`),
      onInput: (v) => { this.distance = v; },
    });
    ButtonRow(play, [
      { label: "▶ 播放", onClick: () => this.PlayCurrent() },
      { label: "连播 ×5", onClick: () => this.PlayCurrent(5) },
      { label: "■ 停止音效", onClick: () => this.StopSoundPreview() },
      { label: "耳鸣", onClick: () => this.audio && this.audio.Deafen(0.6) },
      { label: "压音乐", onClick: () => this.audio && this.audio.Duck(1.2, 0.6) },
    ]);
    Slider(play, {
      label: "总音量", min: 0, max: 1, step: 0.02, value: 1,
      onInput: (v) => this.audio && this.audio.SetMasterVolume(v),
    });

    const amb = Section(body, "环境床");
    const ambBox = El("div", "edBtns");
    amb.appendChild(ambBox);
    for (const name of Object.keys(AMBIENCE_PRESETS)) {
      if (name === "silence") continue;
      const btn = Button(ambBox, `▶ ${name}`, () => this.PreviewAmbience(name));
      btn.dataset.ambience = name;
      this.ambButtons.set(name, btn);
    }
    const stopAmbience = Button(ambBox, "■ 停止环境", () => this.StopAmbiencePreview(), { cls: "danger" });
    stopAmbience.dataset.stopAmbience = "";

    this.ambFacts = Facts(amb, ["当前环境", "环境缺失"]);

    const music = Section(body, "音乐");
    const musicBox = El("div", "edBtns");
    music.appendChild(musicBox);
    for (const [cue, cfg] of Object.entries(MUSIC_CUES)) {
      const btn = Button(musicBox, `▶ ${cue}·${cfg.label}`, () => this.PreviewMusic(cue));
      btn.dataset.music = cue;
      this.musicButtons.set(cue, btn);
    }
    const stopMusic = Button(musicBox, "■ 停止音乐", () => this.StopMusicPreview(), { cls: "danger" });
    stopMusic.dataset.stopMusic = "";
    this.musicFacts = Facts(music, ["当前音乐", "音乐缺失"]);

    const voice = Section(body, "人声（四川话 · 采样）");
    this.voiceList = ListBox(voice, {
      height: 168,
      onPick: (key) => this.PlayVoice(key),
    });
    this.voiceList.Fill(VOICE_LINES.map((line) => ({
      id: line.key,
      name: line.text,
      tail: `${VOICE_KIND[line.kind] || line.kind}`,
      title: `${line.key} · ${line.role} · ${line.dur.toFixed(2)}s${line.event ? " · 事件句（不许随机抽中）" : ""}`,
    })));
    const barkBox = El("div", "edBtns");
    voice.appendChild(barkBox);
    for (const kind of Object.keys(VOICE_KIND)) {
      Button(barkBox, `喊 ${VOICE_KIND[kind]}`, () => {
        this.StopSoundPreview();
        if (this.audio) this.TrackPreviewVoice(this.audio.Bark(kind, { priority: true, seed: Math.floor(Math.random() * 1000) }));
      });
    }
    this.voiceNote = Note(voice, "", true);

    const quiz = Section(body, "盲听指认");
    ButtonRow(quiz, [
      { label: "出一题", onClick: () => this.NewBlind() },
      { label: "再听一遍", onClick: () => this.ReplayBlind() },
      { label: "清零", onClick: () => { this.blindScore = { right: 0, total: 0 }; this.RefreshBlind(); } },
    ]);
    this.blindBox = El("div", "edBtns");
    quiz.appendChild(this.blindBox);
    this.blindFacts = Facts(quiz);

  }

  // -------------------------------------------------------------------------
  // 音效
  // -------------------------------------------------------------------------

  Names() {
    return SOUND_NAMES.filter((name) => {
      if (this.category === "全部") return true;
      const info = SOUND_INFO[name];
      return info && info[0] === this.category;
    });
  }

  FillSounds() {
    const names = this.Names();
    const sampled = this.audio ? this.audio.sampleCues : new Set();
    this.soundList.Fill(names.map((name) => {
      const info = SOUND_INFO[name] || ["", name, ""];
      // 尾标直接写「采样 / 合成」：采样包是异步载入的，「怎么听着还是合成的」
      // 这个问题只有把当前实际生效的那一层摆在列表里才答得出来。
      const tag = sampled.has(name) ? "采样" : "合成";
      return { id: name, name: info[1], tail: `${tag} · ${name}`, title: info[2] };
    }));
    if (!names.includes(this.soundName) && names.length) this.soundName = names[0];
    this.soundList.Select(this.soundName);
    this.Describe();
  }

  /** 这一条现在到底在响哪一层：实录素材的出处，还是合成配方。 */
  Describe() {
    const description = SOUND_INFO[this.soundName]?.[2] || "";
    const source = this.audio?.sampleCues.has(this.soundName) ? "音频采样" : "合成音效";
    this.soundNote.textContent = `${source} · ${description}`;
  }

  PlayCurrent(times = 1) {
    const audio = this.audio;
    if (!audio) return;
    this.StopSoundPreview();
    audio.Unlock();
    for (let i = 0; i < times; i += 1) {
      const voice = this.PlayName(this.soundName, i * 0.42);
      // A continuous source is one performance, never five overlapping engines.
      if (voice?.loop) break;
    }
  }

  StopSoundPreview() {
    for (const timer of this.previewTimers) clearTimeout(timer);
    this.previewTimers.clear();
    for (const voice of this.previewVoices) this.audio?.StopVoice(voice);
    this.previewVoices.clear();
  }

  TrackPreviewVoice(voice) {
    if (!voice) return voice;
    this.previewVoices.add(voice);
    // Gameplay owns the continuous source lifetime. Auditions end after 10 seconds.
    if (voice.loop) {
      const timer = setTimeout(() => {
        this.previewTimers.delete(timer);
        this.previewVoices.delete(voice);
        this.audio?.StopVoice(voice);
      }, 10000);
      this.previewTimers.add(timer);
    }
    return voice;
  }

  /** 音频编辑器打开时玩法暂停，但背景试听必须单独放行。 */
  EnableBackgroundPreview() {
    const audio = this.audio;
    if (!audio) return null;
    audio.Unlock();
    if (audio.paused) audio.SetPaused(false);
    return audio;
  }

  PreviewAmbience(name) {
    const audio = this.EnableBackgroundPreview();
    if (audio) audio.Ambience(name);
  }

  StopAmbiencePreview() {
    const audio = this.EnableBackgroundPreview();
    if (audio) audio.Ambience("silence");
  }

  PreviewMusic(cue) {
    const audio = this.EnableBackgroundPreview();
    if (audio) audio.Music(cue);
  }

  StopMusicPreview() {
    const audio = this.EnableBackgroundPreview();
    if (audio) audio.Music(null);
  }

  PlayName(name, delay = 0) {
    const audio = this.audio;
    if (!audio) return null;
    const options = { volume: this.volume, pitch: this.pitch, delay, priority: true };
    if (this.burst > 0) options.burst = this.burst;
    // 距离 > 0：摆在相机正前方那么远的地方，走 PannerNode。
    // 「远处的枪」听着不对，多半是这一层（衰减模型）而不是配方本身的问题。
    if (this.distance > 0 && this.host.camera) {
      const camera = this.host.camera;
      const forward = { x: 0, y: 0, z: -1 };
      const e = camera.matrixWorld.elements;
      forward.x = -e[8]; forward.y = -e[9]; forward.z = -e[10];
      options.position = {
        x: camera.position.x + forward.x * this.distance,
        y: camera.position.y + forward.y * this.distance,
        z: camera.position.z + forward.z * this.distance,
      };
    }
    return this.TrackPreviewVoice(audio.Play(name, options));
  }

  PlayVoice(key) {
    const audio = this.audio;
    if (!audio) return;
    this.StopSoundPreview();
    audio.Unlock();
    const line = VOICE_LINES.find((v) => v.key === key);
    const played = this.TrackPreviewVoice(audio.Play(`voice.${key}`, { volume: this.volume, priority: true }));
    if (this.voiceNote && line) {
      this.voiceNote.textContent = played
        ? `${line.role}（pitch ${line.pitch}）：「${line.text}」`
        : `人声还没载入完（或已被关闭）：${line.file}`;
    }
  }

  // -------------------------------------------------------------------------
  // 盲听
  // -------------------------------------------------------------------------

  NewBlind() {
    const names = this.Names().filter((n) => SOUND_INFO[n]);
    if (names.length < 4) return;
    const answer = names[Math.floor(Math.random() * names.length)];
    const options = [answer];
    let guard = 0;
    while (options.length < 4 && guard < 200) {
      const pick = names[Math.floor(Math.random() * names.length)];
      if (!options.includes(pick)) options.push(pick);
      guard += 1;
    }
    // 洗牌，别让答案总在第一个
    for (let i = options.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [options[i], options[j]] = [options[j], options[i]];
    }
    this.blind = { answer, options, done: false };
    this.RefreshBlind();
    this.ReplayBlind();
  }

  ReplayBlind() {
    if (!this.blind) return;
    this.StopSoundPreview();
    this.PlayName(this.blind.answer);
  }

  Answer(name) {
    if (!this.blind || this.blind.done) return;
    this.blind.done = true;
    this.blind.picked = name;
    this.blindScore.total += 1;
    if (name === this.blind.answer) this.blindScore.right += 1;
    this.RefreshBlind();
  }

  RefreshBlind() {
    this.blindBox.innerHTML = "";
    if (this.blind) {
      for (const name of this.blind.options) {
        const info = SOUND_INFO[name] || ["", name, ""];
        const right = name === this.blind.answer;
        const btn = Button(this.blindBox, info[1], () => this.Answer(name));
        if (this.blind.done) {
          if (right) btn.classList.add("on");
          else if (name === this.blind.picked) btn.classList.add("danger");
        }
      }
    }
    const s = this.blindScore;
    this.blindFacts.Set("成绩", `${s.right} / ${s.total}`,
      s.total === 0 ? "" : (s.right === s.total ? "good" : "warn"));
    if (this.blind && this.blind.done) {
      this.blindFacts.Set("答案", `${SOUND_INFO[this.blind.answer][1]}（${this.blind.answer}）`,
        this.blind.picked === this.blind.answer ? "good" : "bad");
    }
  }

  // -------------------------------------------------------------------------
  // 每帧
  // -------------------------------------------------------------------------

  Update() {
    const audio = this.audio;
    const f = this.engineFacts;
    if (!f) return;
    if (!audio || !audio.enabled) {
      f.Set("状态", "已关闭", "bad");
      return;
    }
    f.Set("状态", audio.Ready ? "运行中" : "点击播放启用", audio.Ready ? "good" : "warn");
    f.Set("在响的节点", audio.liveNodes);
    f.Set("配方数", SOUND_NAMES.length);
    // 采样一载进来就把同名合成配方盖掉了，列表的尾标要跟着翻
    const sampled = audio.sampleCues.size;
    f.Set("实录采样", sampled
      ? `${sampled} / ${SOUND_NAMES.length} 条已盖上`
      : "载入中 / 全部走合成", sampled === SOUND_NAMES.length ? "good" : sampled ? "warn" : "warn");
    if (sampled !== this.lastSampled) { this.lastSampled = sampled; this.FillSounds(); }
    if (audio.sfxErrors && audio.sfxErrors.length) {
      f.Set("采样缺失", `${audio.sfxErrors.length} 条读不到（已退回合成）`, "bad");
      f.Set("采样报错", FirstError(audio.sfxErrors), "bad");
    }
    f.Set("人声", audio.voicesReady ? `${audio.voiceBank.size} / ${VOICE_LINES.length} 条已载入`
      : "载入中 / 不可用", audio.voicesReady ? "good" : "warn");
    if (audio.voiceErrors && audio.voiceErrors.length) {
      f.Set("人声缺失", `${audio.voiceErrors.length} 条读不到`, "bad");
      f.Set("人声报错", FirstError(audio.voiceErrors), "bad");
    }
    if (this.ambFacts) {
      const beds = audio.ambBuffers ? audio.ambBuffers.size : 0;
      this.ambFacts.Set("当前环境", audio.ambiencePreset || "silence");
      this.ambFacts.Set("在放的床", `${audio.ambLayers ? audio.ambLayers.length : 0} 层`
        + (audio.ambReady ? "" : "（实录还没载到，正在用合成兜底）"),
      audio.ambReady ? "good" : "warn");
      this.ambFacts.Set("床素材", beds ? `${beds} 条已载入` : "载入中 / 不可用", beds ? "good" : "warn");
      if (audio.ambErrors && audio.ambErrors.length) {
        this.ambFacts.Set("环境缺失", `${audio.ambErrors.length} 条读不到`, "bad");
        this.ambFacts.Set("环境报错", FirstError(audio.ambErrors), "bad");
      }
      this.ambFacts.Set("空间", audio.space || "—");
      for (const [name, btn] of this.ambButtons) {
        btn.classList.toggle("on", audio.ambiencePreset === name && !audio.paused);
      }
    }
    if (this.musicFacts) {
      this.musicFacts.Set("当前音乐", audio.musicCue || "（无）");
      // 音乐没有合成兜底 —— 载不到就是没有音乐，这一栏必须看得出来。
      this.musicFacts.Set("曲子", audio.musicReady ? `${audio.musicBuffers.size} 段已载入`
        : "载入中 / 不可用（没有音乐）", audio.musicReady ? "good" : "warn");
      if (audio.musicErrors && audio.musicErrors.length) {
        this.musicFacts.Set("音乐缺失", `${audio.musicErrors.length} 段读不到`, "bad");
        this.musicFacts.Set("音乐报错", FirstError(audio.musicErrors), "bad");
      }
      for (const [cue, btn] of this.musicButtons) {
        btn.classList.toggle("on", audio.musicCue === cue && !!audio.musicLayer && !audio.paused);
      }
    }
  }
}

export default AudioEditor;
