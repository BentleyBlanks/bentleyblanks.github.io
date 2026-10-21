// Data_Text_BattleReaction.mjs — 人物战场反应测试场（?reactions=1）面板与读数的玩家可见文案。
// 纯数据，不 import three。键前缀 `battleReaction.`，由 Data_Locale_zhCN.mjs 拼表；口径见 docs/Data_TextAndTuning.md。
// 占位符写 {name}，代码侧 T("battleReaction.xxx", { name })。弹种名借 `shellImpact.munition.<id>`（同一份弹种表）。
// 方位 / 站位名的键后半段是 Data_BattleReactionRange 里的 id，运行时拼，前缀登记在 DYNAMIC_PREFIXES。
// 界面字体是裁过的子集（Font/Script_FontChars.mjs）：新字要先确认在子集里，不然真机会逐字回退成系统字体。
export const TEXT = Object.freeze({
  "battleReaction.title": "人物战场反应测试场",
  "battleReaction.subtitle": "近爆 · 第一人称反应 · 耳鸣",
  "battleReaction.aria": "人物战场反应测试面板",
  "battleReaction.collapse": "收起",
  "battleReaction.expand": "展开面板",

  // ── 分组标题 ────────────────────────────────────────────────────────────
  "battleReaction.group.munition": "弹种",
  "battleReaction.group.distance": "离人多远",
  "battleReaction.group.bearing": "在人的哪一边",
  "battleReaction.group.fire": "引爆",
  "battleReaction.group.stand": "站位",
  "battleReaction.group.switch": "开关",
  "battleReaction.group.time": "时间",
  "battleReaction.group.readout": "读数",

  "battleReaction.munition.charge": "装药 {kg} kg",
  "battleReaction.distance.m": "{m} 米",

  // ── 方位（相对人此刻的朝向）──────────────────────────────────────────────
  "battleReaction.bearing.frontLeft": "左前",
  "battleReaction.bearing.front": "正前",
  "battleReaction.bearing.frontRight": "右前",
  "battleReaction.bearing.left": "左边",
  "battleReaction.bearing.random": "随机",
  "battleReaction.bearing.right": "右边",
  "battleReaction.bearing.backLeft": "左后",
  "battleReaction.bearing.back": "身后",
  "battleReaction.bearing.backRight": "右后",

  // ── 引爆 ────────────────────────────────────────────────────────────────
  "battleReaction.fire.single": "引爆",
  "battleReaction.fire.barrage": "连续炮击 ×{count}",
  "battleReaction.fire.clear": "清空",

  // ── 站位 ────────────────────────────────────────────────────────────────
  "battleReaction.stand.trench": "沟里",
  "battleReaction.stand.rear": "沟后空地",
  "battleReaction.stand.open": "沟前开阔地",

  // ── 开关 ────────────────────────────────────────────────────────────────
  "battleReaction.switch.reaction": "人物反应（眨眼、扭头、低头、收枪、手抖）",
  "battleReaction.switch.earNew": "新耳鸣",
  "battleReaction.switch.earOld": "旧耳鸣",
  "battleReaction.switch.dustNew": "新扬尘",
  "battleReaction.switch.dustOld": "旧扬尘",
  "battleReaction.switch.marker": "显示落点标记",
  "battleReaction.time.scale": "{scale}×",
  "battleReaction.hint": "按住 Alt 放开鼠标点面板；距离与方位按你此刻的位置和朝向算，走到哪炸到哪。",

  // ── 读数 ────────────────────────────────────────────────────────────────
  "battleReaction.read.idle": "还没引爆",
  "battleReaction.read.last": "上一发：{name} · {m} 米 · {side}",
  "battleReaction.read.pending": "在路上…",
  "battleReaction.read.cover": "有遮挡",
  "battleReaction.read.open": "无遮挡",
  "battleReaction.read.pressure": "峰值超压 {kpa} kPa · {db} dB（左耳 {left} · 右耳 {right}）· {cover}",
  "battleReaction.read.strength": "强度：眨眼 {blink} · 缩身 {flinch} · 闭眼 {squeeze} · 恍惚 {daze} · 手抖 {tremor}",
  "battleReaction.read.tinnitus": "耳鸣强度：左 {left} · 右 {right}",
  "battleReaction.read.peak": "这一发：转头 {yaw}° · 低头 {pitch}° · 歪头 {roll}° · 缩身 {drop} 厘米 · 闭眼 {eye}%",
  "battleReaction.read.now": "此刻：闭眼 {eye}% · 心跳 {bpm} · 喘 {breath} 秒",
  "battleReaction.read.ear": "{side}耳：低通 {hz} Hz · {db} dB · 鸣响 {ring}",
  "battleReaction.read.earLeft": "左",
  "battleReaction.read.earRight": "右",
  "battleReaction.read.earOff": "旧耳鸣：两耳不分开算",
  "battleReaction.read.earPending": "新耳鸣：声音还没开（点一下画面）",
  "battleReaction.read.flight": "在途 {count} 发 · 排队 {queued} 发 · 时间 {scale}×",
  "battleReaction.read.off": "人物反应关着",

  "battleReaction.hint.fired": "{name}：{m} 米",
  "battleReaction.hint.barrage": "连续炮击 {count} 发",
  "battleReaction.hint.cleared": "已清空：弹坑、在途弹与扬尘，人的反应与耳朵复位",
});

/** 这张表覆盖的代码文件：闸门从此不许它们再出现玩家可见的中文字面量。 */
export const GATED_MODULES = Object.freeze([
  "Script_BattleReactionRange.mjs",
  "Script_BattleReactionLab.mjs",
]);

/** 运行时拼出来的键前缀：可变部分只来自 Data_BattleReactionRange 里的 id。 */
export const DYNAMIC_PREFIXES = Object.freeze([
  "battleReaction.bearing.",
  "battleReaction.stand.",
]);
