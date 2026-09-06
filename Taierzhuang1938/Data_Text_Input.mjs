// Data_Text_Input.mjs — 设置页里那张操作说明（Script_Input.CONTROL_GUIDE）的文案。
// 纯数据，不 import three。键前缀 `input.`，由 Data_Locale_zhCN.mjs 拼表；口径见 docs/Data_TextAndTuning.md。
//
// 一行两条键：`.keys` 是按键框里那几个字，`.label` 是它干什么。
// **`.keys` 也是文本，不是 event.code** —— 真键位在 Script_Input.KEYMAP，那张表一个汉字没有；
// 这里的「鼠标」「滚轮」「按住 Tab」「空枪左键」是写给人读的，换语言要跟着翻。
//
// 分组与行的 id 在 Script_Input 的 GUIDE 里，改说明的顺序改那张表，不改这里的键名。
export const TEXT = Object.freeze({
  // --- 移动与观察 -----------------------------------------------------------
  "input.guide.move.title": "移动与观察",
  "input.guide.move.wasd.keys": "W A S D",
  "input.guide.move.wasd.label": "移动",
  "input.guide.move.look.keys": "鼠标",
  "input.guide.move.look.label": "观察",
  "input.guide.move.sprint.keys": "Shift",
  "input.guide.move.sprint.label": "冲刺；开镜时屏息",
  "input.guide.move.lean.keys": "Q / E",
  "input.guide.move.lean.label": "向左 / 右探身",
  "input.guide.move.crouch.keys": "C",
  "input.guide.move.crouch.label": "下蹲；再按一次站立",
  "input.guide.move.prone.keys": "Z",
  "input.guide.move.prone.label": "趴下；再按一次站立",
  "input.guide.move.traverse.keys": "Space",
  "input.guide.move.traverse.label": "低姿态时站起；站立时翻越 / 跳跃",
  "input.guide.move.stancePick.keys": "按住 Alt + 点击姿态",
  "input.guide.move.stancePick.label": "直接选择站立 / 下蹲 / 趴下",

  // --- 武器与救治 -----------------------------------------------------------
  "input.guide.combat.title": "武器与救治",
  "input.guide.combat.fire.keys": "左键 / 右键",
  "input.guide.combat.fire.label": "开火 / 瞄准",
  "input.guide.combat.slots.keys": "1 / 2 / 3 / 4",
  "input.guide.combat.slots.label": "长枪 / 短枪 / 大刀 / 投掷物",
  "input.guide.combat.wheelSlot.keys": "滚轮",
  "input.guide.combat.wheelSlot.label": "循环切换已有武器",
  "input.guide.combat.reload.keys": "R / 0",
  "input.guide.combat.reload.label": "装填 / 切换射击模式",
  "input.guide.combat.bipod.keys": "T",
  "input.guide.combat.bipod.label": "架两脚架",
  "input.guide.combat.meleeAttack.keys": "大刀／已装刺刀",
  "input.guide.combat.meleeAttack.label": "左键轻击／蓄力重击，右键瞬时拨挡，贴身 F 推架",
  "input.guide.combat.meleeStruggle.keys": "僵持／倒地压制",
  "input.guide.combat.meleeStruggle.label": "连续按 F 抵抗；成功后恢复自由战斗",
  "input.guide.combat.meleeStance.keys": "V",
  "input.guide.combat.meleeStance.label": "刺刀步枪：射击／白刃架势",
  "input.guide.combat.bayonet.keys": "X",
  "input.guide.combat.bayonet.label": "装 / 卸刺刀（可装刺刀的枪）",
  "input.guide.combat.emptyMelee.keys": "空枪左键",
  "input.guide.combat.emptyMelee.label": "白刃架势下左键轻击／按住重击",
  "input.guide.combat.throw.keys": "G / H",
  "input.guide.combat.throw.label": "投手榴弹 / 集束手榴弹",
  "input.guide.combat.interact.keys": "F",
  "input.guide.combat.interact.label": "拾枪、换枪或给战友分弹",
  "input.guide.combat.holdInteract.keys": "按住 F",
  "input.guide.combat.holdInteract.label": "止血、拆门板、接线：按住到进度环走满",
  "input.guide.combat.bandage.keys": "B",
  "input.guide.combat.bandage.label": "有绷带且流血时包扎止血",

  // --- 班组与菜单 -----------------------------------------------------------
  "input.guide.squad.title": "班组与菜单",
  "input.guide.squad.map.keys": "M",
  "input.guide.squad.map.label": "显示 / 隐藏战场地图",
  "input.guide.squad.orders.keys": "按住 Tab",
  "input.guide.squad.orders.label": "打开命令轮盘，鼠标选择",
  "input.guide.squad.ordersDirect.keys": "Tab + 1—8",
  "input.guide.squad.ordersDirect.label": "直接下达对应命令",
  "input.guide.squad.pause.keys": "Esc",
  "input.guide.squad.pause.label": "暂停 / 返回",
  "input.guide.squad.tools.keys": "`",
  "input.guide.squad.tools.label": "打开设置与工具",
});

export const GATED_MODULES = Object.freeze([
  "Script_Input.mjs",
]);

/** 操作说明按「组 id / 行 id」拼键，两份 id 都在 Script_Input.GUIDE 那张表里。 */
export const DYNAMIC_PREFIXES = Object.freeze([
  "input.guide.",
]);
