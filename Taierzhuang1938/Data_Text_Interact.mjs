// Data_Text_Interact.mjs — Script_Interact 的交互标签、提示与救护预制文案。
// 纯数据，不 import three。键前缀 `interact.`，由 Data_Locale_zhCN.mjs 拼表；口径见 docs/Data_TextAndTuning.md。
// 占位符写 {name}，代码侧 T("interact.xxx", { name })。同一句话只登记一次，多处复用同一键。
//
// 分段：
//   prompt.   每帧那一行「F — …」
//   pickup.   内建分支：捡尸体身上的枪
//   ammo.     内建分支：分一个桥夹给打光的弟兄
//   bleed. / supply. / check. / plank. / wire. / leaflet. / tear. / carry.
//             文件末尾那十个救护预制的默认 label / hint（摆点时可以整条覆盖）
//   grenade.  Script_GrenadeReturn 的「拾起并掷回」
export const TEXT = Object.freeze({
  // --- 提示条 ---------------------------------------------------------------
  "interact.prompt.press": "F — {label}",

  // --- 拾枪拾弹 -------------------------------------------------------------
  // 「拾起 / 换上」是两句不同的话（有没有同类槽位），各登记各的：
  // 换一种语言时它们的语序未必相同，不许在调用点拼动词。
  "interact.pickup.take": "拾起 {name}",
  "interact.pickup.swap": "换上 {name}",
  /** 武器表里查不到名字时的兜底称呼。 */
  "interact.pickup.unknownWeapon": "枪",
  "interact.pickup.melee": "拾起{name}，放进 3 号近战槽",
  "interact.pickup.withClips": "捡了一支{name}，还有 {clips} 个桥夹",
  // 缴获日械只有枪里那五发 —— 这句提示是这条规则唯一的说明书，别删。
  "interact.pickup.noClips": "捡了一支{name} —— 只有枪里这几发，我们没有这个口径",

  // --- 分弹药 ---------------------------------------------------------------
  "interact.ammo.give": "分一个桥夹给 {name}",
  "interact.ammo.thanks": "接着！",

  // --- 救护预制 -------------------------------------------------------------
  "interact.bleed.label": "按住出血口",
  "interact.bleed.hint": "先压住出血。",
  "interact.supply.gauze": "纱布",
  "interact.supply.give": "递{item}",
  "interact.check.label": "查看伤员",
  "interact.plank.label": "拆下门板做担架",
  "interact.plank.hint": "门板拆下来了 —— 当担架使。",
  "interact.wire.joinA": "接上这一头",
  "interact.wire.joinB": "接上另一头",
  "interact.wire.cut": "剪断线路",
  "interact.wire.cutHint": "这一段收不回来了。",
  "interact.leaflet.pick": "拾起传单",
  "interact.leaflet.burn": "把传单投进火里",
  "interact.tear.shirt": "撕开背包里那件短褂",
  "interact.carry.liftStretcher": "抬起担架",
  "interact.carry.liftThing": "抬起东西",

  // --- 掷回手榴弹 -----------------------------------------------------------
  "interact.grenade.return": "拾起并掷回 · {seconds}秒",
});

/** 这张表覆盖的代码文件（见 Data_Text_Gameplay 同名字段的说明）。 */
export const GATED_MODULES = Object.freeze([
  "Script_Interact.mjs",
  "Script_GrenadeReturn.mjs",
]);

/** 这张表没有运行时拼键：交互点的标签由摆点方给，引擎不拼 id。 */
export const DYNAMIC_PREFIXES = Object.freeze([]);
