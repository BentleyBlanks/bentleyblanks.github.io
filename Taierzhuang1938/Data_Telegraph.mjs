// Data_Telegraph.mjs — 发报的音效档案、默认值与信号名。
//
// **纯数据**：不 import three、不 import 规则代码、不含函数。状态机在 `Script_Telegraph.mjs`。
// 玩家可见的名字存**文本键**，句子在 Data_Text_Gameplay 的 `gameplay.telegraph.*`。

/**
 * 音效档案。每条两个名字：**先播 A2 批那条实录，播不响就退到现有最近的源**。
 *   telegraphKey ← grenadePin  Data_MissionCh6 头注定的口径（「现在拿 grenadePin 顶」）：
 *                              短、干、带一点金属余韵，是库里离黄铜电键最近的一条
 *   telegraphHum ← （无）      **没有可循环的合成电流声，宁可没有**：
 *                              拿别的音顶一条持续底噪，听感上是「屋里多了一台冰箱」
 *
 * `loopEveryS` 是底噪的重触发间隔：Script_Audio 的 `Play` 没有 loop 语义，
 * 所以按素材自己的长度（6.00 s）重触发，留一点重叠。
 */
export const TELEGRAPH_SFX = Object.freeze({
  key: { names: ["telegraphKey", "grenadePin"], volume: 0.75 },
  hum: { names: ["telegraphHum"], volume: 0.32, loopEveryS: 5.6 },
});

/**
 * 默认值。数值只在这里；文档写常量名不抄数（AGENTS 硬规矩 12）。
 *
 * digitsPerGroup   一组几位。四位是 §7 与关内那条 system 提示写死的。
 * groupCount       不给 groups 时按种子出几组。
 * ditsMin/ditsMax  按一下响几声「嗒」。**两到三声**：一声太像点鼠标，
 *                  四声以上玩家会以为自己按错了。逐组在这个区间里走
 *                  （确定性地走，不掷骰子 —— 见 DitsFor）。
 * ditGapS          两声「嗒」之间隔多久。0.16 s ≈ 每分钟 375 下，
 *                  一个熟手电报员的手速量级；再快就成了打字机。
 * groupCooldownS   一组发完到下一组能按之间的间隔。它同时是交互点的 cooldown ——
 *                  没有它，玩家按住 F 连点能在半秒里把整封电报发完。
 * reconnectS       重新接上接头要按多久（Data_MissionCh6 ENGINE_REQUEST 1 写的 1.2 s）。
 * humLoopEveryS    底噪重触发间隔。
 * breakAfterGroup  在第几组之后自动断一次（null = 不自动断，等脚本调）。
 *                  会被夹进 [1, total−1]：断在「发毕」以后就没有重连这一段戏了。
 */
export const TELEGRAPH_DEFAULTS = Object.freeze({
  digitsPerGroup: 4,
  groupCount: 5,
  ditsMin: 2,
  ditsMax: 3,
  ditGapS: 0.16,
  groupCooldownS: 0.42,
  reconnectS: 1.2,
  humLoopEveryS: 5.6,
  breakAfterGroup: null,
  /** 报码纸、电键、接头三条玩家可见文案的键（摆点时可以用同名不带 Key 的字段整条覆盖）。 */
  labelKey: "gameplay.telegraph.label",
  keyLabelKey: "gameplay.telegraph.key",
  reconnectLabelKey: "gameplay.telegraph.reconnect",
});

/** 默认信号名，与 `Data_MissionCh6.EVENTS` 的 id 逐条对应。 */
export const TELEGRAPH_SIGNALS = Object.freeze({
  first: "KeySeated",
  break: "WireBreak",
  complete: "WireSent",
});
