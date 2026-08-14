// 八章纯器乐 BGM 的运行时配置。JSON 清单保存来源与母带信息；这里保持浏览器可直接导入。
//
// `cue`：从这里起播，也是循环回来的落点（跳过片头的静场铺陈）。
// `loopEnd`：**放到这儿就绕回 cue**，不要放进尾奏。
//   这几首都是完整成品曲，末尾是渐弱到静音的收尾：第一章那首最后 20 秒
//   从 −27dB 一路淡到 −71dB（等于没声），第二章的尾奏更长，36 秒。
//   一路放到底再跳回去，玩家听到的就是"音乐停了半天，然后又从头响起来"
//   ——2026-08-10 用户报的「背景音乐隔一段时间就停下来然后重新播放」正是这个，
//   跟卡顿、跟网络都没关系，是这首曲子真的放完了。
//   数值由 ffmpeg 逐段量出来：正常段的响度打底，从尾巴往前找第一个
//   "还没开始收"的 4 秒窗口。改曲子就重量一次，别拍脑袋。
// 章之外的短曲：某一拍/某一行要的一段音乐，不是整章的底色。
// 剧本里写 `bgm: "thatDay"`（节拍级）或在过场行的 on() 里 `state.bgmOverride = "thatDay"`
//（行级）；写 `bgm: null` 就是**这一拍没有音乐**。
//
// 序 · 那天为什么要这一条：剧本第一句就是〔音〕*没有音乐。* ——吵的都在墙外。
// 可 BGM 是按 `CHAPTER_BGM[chapterIndex]` 无条件铺的，第一章那首从开机就在响，
// 整场"没有音乐"的设计在实机里一秒都没成立过（2026-08-14 查出来的）。
// 现在序的三拍静音，音乐只在收尾那句「没人来叫。」进来，一直托到章名卡。
// 曲子由本机 MiniMax Hub 的 music-3.0 生成（提示词见项目记忆），
// 从 184 秒的成品里切 26 秒＋两头淡入淡出——一段过场用不着一首整曲。
export const EXTRA_BGM = Object.freeze({
  thatDay: {
    id: "thatDay", title: "那天", file: "./Audio/Bgm/AudioBgm_ThatDay.mp3",
    cue: 0, gain: 0.62, loopEnd: 20.5, hasVocals: false,
  },
});

export const CHAPTER_BGM = Object.freeze([
  { id: "withTheseHands", title: "With These Hands", file: "./Audio/Bgm/AudioBgm_WithTheseHands.mp3", cue: 42, gain: 0.82, loopEnd: 285.7, hasVocals: false },
  { id: "theLongDark", title: "The Long Dark", file: "./Audio/Bgm/AudioBgm_TheLongDark.mp3", cue: 28, gain: 0.70, loopEnd: 403.8, hasVocals: false },
  { id: "secretRendezvous", title: "高粱地接头", file: "./Audio/Bgm/AudioBgm_SecretRendezvous.mp3", cue: 12, gain: 0.68, loopEnd: 155.8, hasVocals: false },
  { id: "tunnelExploration", title: "土壁深处", file: "./Audio/Bgm/AudioBgm_TunnelExploration.mp3", cue: 18, gain: 0.70, loopEnd: 236.0, hasVocals: false },
  { id: "diggingTogether", title: "一锹一锹", file: "./Audio/Bgm/AudioBgm_DiggingTogether.mp3", cue: 18, gain: 0.76, loopEnd: 210.5, hasVocals: false },
  { id: "enemyAssessment", title: "门板上的岗哨", file: "./Audio/Bgm/AudioBgm_EnemyAssessment.mp3", cue: 12, gain: 0.67, loopEnd: 83.2, hasVocals: false },
  { id: "rescueRelay", title: "旁洞还有人", file: "./Audio/Bgm/AudioBgm_RescueRelay.mp3", cue: 20, gain: 0.75, loopEnd: 162.0, hasVocals: false },
  { id: "ruinsAtDawn", title: "残墙见光", file: "./Audio/Bgm/AudioBgm_RuinsAtDawn.mp3", cue: 24, gain: 0.72, loopEnd: 198.0, hasVocals: false },
]);
