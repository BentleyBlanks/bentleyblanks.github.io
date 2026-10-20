// Data_Text_ShellImpact.mjs — 炮击扬尘测试场（?impacts=1）面板与读数的玩家可见文案。
// 纯数据，不 import three。键前缀 `shellImpact.`，由 Data_Locale_zhCN.mjs 拼表；口径见 docs/Data_TextAndTuning.md。
// 占位符写 {name}，代码侧 T("shellImpact.xxx", { name })。
// 弹种名 / 落点名 / 机位名的键后半段是 Data_ShellImpactRange 里的 id，运行时拼，前缀登记在 DYNAMIC_PREFIXES。
export const TEXT = Object.freeze({
  "shellImpact.title": "炮击扬尘测试场",
  "shellImpact.subtitle": "壕沟 · 弹种 · 落点",
  "shellImpact.aria": "炮击扬尘测试面板",
  "shellImpact.collapse": "收起",
  "shellImpact.expand": "展开面板",

  // ── 分组标题 ────────────────────────────────────────────────────────────
  "shellImpact.group.munition": "弹种",
  "shellImpact.group.target": "落点",
  "shellImpact.group.fire": "发射",
  "shellImpact.group.time": "时间",
  "shellImpact.group.camera": "机位",
  "shellImpact.group.dust": "扬尘",
  "shellImpact.group.readout": "读数",

  // ── 弹种（装药读 Data_Explosives.fillingKg）────────────────────────────
  "shellImpact.munition.Grenade": "手榴弹",
  "shellImpact.munition.GrenadeBundle": "集束手榴弹",
  "shellImpact.munition.Shell50": "掷弹筒 50 mm",
  "shellImpact.munition.Shell37": "战车炮 37 mm",
  "shellImpact.munition.Shell57": "战车炮 57 mm",
  "shellImpact.munition.Shell82": "迫击炮 82 mm",
  "shellImpact.munition.Shell75": "野炮 75 mm",
  "shellImpact.munition.Shell105": "榴弹炮 105 mm",
  "shellImpact.munition.Shell150": "榴弹炮 150 mm",
  "shellImpact.munition.Bomb50kg": "航空炸弹 50 kg",
  "shellImpact.munition.Bomb250kg": "航空炸弹 250 kg",
  "shellImpact.munition.charge": "装药 {kg} kg",
  "shellImpact.munition.angle": "落角 {deg}°",
  "shellImpact.munition.hand": "近距投掷",
  "shellImpact.munition.flat": "平射",

  // ── 落点 ────────────────────────────────────────────────────────────────
  "shellImpact.target.TrenchStraight": "沟内直段",
  "shellImpact.target.TrenchCorner": "沟内拐角",
  "shellImpact.target.CommTrench": "交通壕内",
  "shellImpact.target.Junction": "三岔口",
  "shellImpact.target.BermCrest": "沟沿弃土垄上",
  "shellImpact.target.OpenFront20": "沟前开阔地 20 m",
  "shellImpact.target.OpenRear8": "沟后空地 8 m",
  "shellImpact.target.BunkerSide": "堡垒旁",
  "shellImpact.target.picked": "点选的地面",
  "shellImpact.target.pick": "点地面选点",
  "shellImpact.target.picking": "选点中：按住 Alt，点地面",
  "shellImpact.target.at": "落点 {name} · X {x} Z {z} · 地面 {y} m",

  // ── 发射 ────────────────────────────────────────────────────────────────
  "shellImpact.fire.single": "发射",
  "shellImpact.fire.barrage": "齐射 ×{count}",
  "shellImpact.fire.clear": "清空",

  // ── 时间 ────────────────────────────────────────────────────────────────
  "shellImpact.time.pause": "暂停",
  "shellImpact.time.resume": "继续",
  "shellImpact.time.step": "单步",
  "shellImpact.time.scale": "{scale}×",
  "shellImpact.time.flightFast": "飞行中用 1×，落地后用所选倍速",

  // ── 机位 ────────────────────────────────────────────────────────────────
  "shellImpact.camera.reference": "参考机位",
  "shellImpact.camera.trenchLow": "沟沿低机位",
  "shellImpact.camera.overhead": "俯视",
  "shellImpact.camera.player": "回到玩家",
  "shellImpact.camera.free": "观察相机",
  "shellImpact.camera.playerView": "玩家视角",
  "shellImpact.camera.hint": "观察相机：WASD 平移 · Q/E 上下 · Shift 加速 · 鼠标转向；按住 Alt 放开鼠标点面板",

  // ── 扬尘 A/B ────────────────────────────────────────────────────────────
  "shellImpact.dust.new": "新扬尘",
  "shellImpact.dust.old": "旧扬尘",
  "shellImpact.marker.show": "显示落点标记",

  // ── 读数 ────────────────────────────────────────────────────────────────
  "shellImpact.read.idle": "还没发射",
  "shellImpact.read.last": "上一发：{name} → {target} · 落角 {angle}° · 飞行 {flight} s",
  "shellImpact.read.flight": "在途 {shells} 发 · 排队 {queued} 发",
  "shellImpact.read.craters": "已挖弹坑 {count} 个",
  "shellImpact.read.time": "时间 {state}",
  "shellImpact.read.timePaused": "暂停",
  "shellImpact.read.timeScale": "{scale}×",
  "shellImpact.read.camera": "机位 {mode}",
  "shellImpact.hint.fired": "{name} 已发射",
  "shellImpact.hint.cleared": "已清空：弹坑、在途弹与扬尘",
  "shellImpact.hint.picked": "落点已设为所点地面",
  "shellImpact.hint.pickMiss": "没点到地面",
});

/** 这张表覆盖的代码文件：闸门从此不许它们再出现玩家可见的中文字面量。 */
export const GATED_MODULES = Object.freeze([
  "Script_ShellImpactRange.mjs",
  "Script_ShellImpactLab.mjs",
  "Script_ShellImpactRangeField.mjs",
]);

/** 运行时拼出来的键前缀：可变部分只来自 Data_ShellImpactRange 里的 id。 */
export const DYNAMIC_PREFIXES = Object.freeze([
  "shellImpact.munition.",
  "shellImpact.target.",
  "shellImpact.camera.",
]);
