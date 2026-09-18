// ===========================================================================
// Data_OrchestrationIcons.mjs —— 关卡编排工作台的图标登记表（纯数据，零 three）
//
// 为什么单独一张表：俯视图要给标记画图标，右边的详情/图例/流程栏也要给同一个
// 对象画同一个图标。规则要是写在画布那一层，面板就只能再抄一遍「机枪手用哪张
// 图」——抄第二遍就迟早对不上。所以「这个东西该用哪张图标」的判断全在这里，
// 地图与面板都来问。
//
// 图标本体：`Texture/Editor/Icon_Orch_*.png`，64×64，**纯白剪影 + alpha**。
// 白色是故意的 —— 运行时按状态上色（离屏 canvas 做一次 source-in 染色再缓存），
// 一张图就能画成「未出现的灰蓝」「活跃的亮红」「友军的蓝」。
//
// 名字都用普通中文（`label`）：这些字会直接出现在图例与提示里，给人看的地方
// 不写 pending / standby / beat 这类内部叫法。
// ===========================================================================

/** 图标目录（相对 Taierzhuang1938/）。加载方拿它去拼 URL。 */
export const ICON_DIR = "Texture/Editor/";

export const ORCHESTRATION_ICONS = Object.freeze({
  Rifleman:      Object.freeze({ file: "Texture/Editor/Icon_Orch_Rifleman.png", label: "步枪兵" }),
  MachineGunner: Object.freeze({ file: "Texture/Editor/Icon_Orch_MachineGunner.png", label: "机枪手" }),
  Bayonet:       Object.freeze({ file: "Texture/Editor/Icon_Orch_Bayonet.png", label: "上刺刀" }),
  Tank:          Object.freeze({ file: "Texture/Editor/Icon_Orch_Tank.png", label: "战车" }),
  Reserve:       Object.freeze({ file: "Texture/Editor/Icon_Orch_Reserve.png", label: "待命" }),
  Dormant:       Object.freeze({ file: "Texture/Editor/Icon_Orch_Dormant.png", label: "休眠" }),
  Cleared:       Object.freeze({ file: "Texture/Editor/Icon_Orch_Cleared.png", label: "已清除" }),
  Hold:          Object.freeze({ file: "Texture/Editor/Icon_Orch_Hold.png", label: "钉在原地" }),
  FriendlySquad: Object.freeze({ file: "Texture/Editor/Icon_Orch_FriendlySquad.png", label: "我方士兵" }),
  GuardPost:     Object.freeze({ file: "Texture/Editor/Icon_Orch_GuardPost.png", label: "哨位" }),
  Defender:      Object.freeze({ file: "Texture/Editor/Icon_Orch_Defender.png", label: "守军" }),
  ForwardNest:   Object.freeze({ file: "Texture/Editor/Icon_Orch_ForwardNest.png", label: "机枪巢" }),
  Player:        Object.freeze({ file: "Texture/Editor/Icon_Orch_Player.png", label: "玩家" }),
  Stretcher:     Object.freeze({ file: "Texture/Editor/Icon_Orch_Stretcher.png", label: "担架" }),
  Cart:          Object.freeze({ file: "Texture/Editor/Icon_Orch_Cart.png", label: "车辆" }),
  Aircraft:      Object.freeze({ file: "Texture/Editor/Icon_Orch_Aircraft.png", label: "飞机" }),
  Supply:        Object.freeze({ file: "Texture/Editor/Icon_Orch_Supply.png", label: "补给" }),
  Gate:          Object.freeze({ file: "Texture/Editor/Icon_Orch_Gate.png", label: "院门" }),
  Anchor:        Object.freeze({ file: "Texture/Editor/Icon_Orch_Anchor.png", label: "锚点" }),
  Zone:          Object.freeze({ file: "Texture/Editor/Icon_Orch_Zone.png", label: "触发区" }),
  Route:         Object.freeze({ file: "Texture/Editor/Icon_Orch_Route.png", label: "路线" }),
  Wave:          Object.freeze({ file: "Texture/Editor/Icon_Orch_Wave.png", label: "攻击波" }),
  Note:          Object.freeze({ file: "Texture/Editor/Icon_Orch_Note.png", label: "批注" }),
});

/** 稳定的登记顺序：出「图标总表」和排图例都按它走，别指望对象键序。 */
export const ICON_ORDER = Object.freeze(Object.keys(ORCHESTRATION_ICONS));

export function IconFile(name) {
  return ORCHESTRATION_ICONS[name]?.file || "";
}
/** 图标的中文名。查不到就回空串 —— 界面上宁可不写字，也别写出个英文键名。 */
export function IconLabel(name) {
  return ORCHESTRATION_ICONS[name]?.label || "";
}

// ---------------------------------------------------------------------------
// 敌人：图标说「他是干什么的」，颜色与角标说「他现在是什么状态」
// ---------------------------------------------------------------------------
/**
 * 一个敌人该用哪张图标。判断顺序就是「一眼看过去最该记住哪一条」：
 * 天上的飞机 → 机枪 → 钉在原地的守点兵 → 上了刺刀的 → 预备队 → 其余都是步枪兵。
 * `state` 不参与选图（状态走颜色 + 角标），留在签名里是为了让调用方一处拿全。
 */
export function IconForMember(member, state = null, encounterId = null) {
  void state;
  if (encounterId === "air") return "Aircraft";
  const weapon = member?.weapon;
  if (weapon === "Type11" || weapon === "MachineGun") return "MachineGunner";
  if (member?.hold) return "Hold";
  if (member?.bayonet) return "Bayonet";
  if (member?.reserve) return "Reserve";
  return "Rifleman";
}

/**
 * 状态角标：贴在图标右下角的那枚小图。
 * 「未出现」不给角标 —— 它本来就画得半透明，再挂一枚小图只会更糊。
 */
export function StateBadge(state) {
  switch (state) {
    case "standby": return "Reserve";
    case "dormant": return "Dormant";
    case "cleared": return "Cleared";
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// 友军 / 锚点 / 触发区
// ---------------------------------------------------------------------------
const FRIENDLY_ICONS = Object.freeze({
  squadPost: "FriendlySquad",
  guardPost: "GuardPost",
  defender: "Defender",
  forwardNest: "ForwardNest",
  defensePost: "Hold",
  cartBay: "Cart",
  tankStart: "Tank",
  phaseSpawn: "Player",          // 阶段出生点 = 玩家从这儿开始演这一段
});
export function IconForFriendly(kind) {
  return FRIENDLY_ICONS[kind] || "FriendlySquad";
}

// 锚点按它在关卡里实际是个什么地方选图：院门就画院门，装车/转运画车，
// 担架撤离那几个点画担架。剩下的才是通用的小旗。
const ANCHOR_ICONS = Object.freeze({
  gate: "Gate",
  bundle: "Supply", throw: "Supply", transferSupply: "Supply",
  train: "Cart", unload: "Cart", queue: "Cart", transfer: "Cart",
  retreatA: "Stretcher", retreatB: "Stretcher", retreatC: "Stretcher",
  reception: "Stretcher", zhouPickup: "Stretcher", zhouDrop: "Stretcher",
  forwardNest: "ForwardNest", gun: "MachineGunner",
});
export function IconForAnchor(id) {
  return ANCHOR_ICONS[id] || "Anchor";
}

export function IconForZone(zone) {
  return zone?.kind === "beatArea" ? "Wave" : "Zone";
}

export function IconForNote() {
  return "Note";
}
