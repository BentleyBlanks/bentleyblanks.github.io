// ===========================================================================
// Script_MissionOrchestrationFilter.mjs —— 关卡编排「分类查看」的纯模型（零 three，Node 可跑）
//
// 用户要的是一句话：「我希望能分类地看到敌军布设的位置」。俯视图上二十一组、
// 一百多个人、四十多个触发圈、五十多个友军点全堆在一起时，问「这一阶段哪几个人
// 钉在原地不动」只能靠眼睛数。这一层把「看哪些」做成数据：
//
//   · 一份可序列化的**筛选状态**（DefaultFilterState）—— 界面只管改它；
//   · BuildOrchestrationFilter 把状态折成俯视图认的**几个集合**（null = 全画）；
//   · FilterSummary 给面板那棵分类树（每一项的名字、本阶段人数、现在可见几个）；
//   · EnemyTableRows / EnemyTableCsv 给「敌军布设表」——一张能排序能导出的表。
//
// 三条纪律：
//   1. 纯：只吃 BuildOrchestrationModel() 出来的模型与 PhaseLayout() 的结果，
//      不碰 DOM、不碰 three、不读文件。Node 直接 import 就能跑。
//   2. 不新造事实：状态取自 PhaseLayout 的 state，人数取自模型的成员表；
//      这里不另算一套「大概是这样」的口径。
//   3. 界面上说人话：组有中文名，转运区两组按事实表叫「第 n 处威胁」，
//      内部字段名只当尾巴上的等宽小字。
//
// 跑法（闸门）：node Taierzhuang1938/Script_MissionOrchestrationFilterTest.mjs
// 口径：docs/Data_MissionOrchestration.md §2。
// ===========================================================================

import { WEAPONS } from "./Data_Weapons.mjs";

// --- 词表（界面上看到的就是这些字）---------------------------------------
export const CATEGORY_ORDER = Object.freeze(["enemies", "friendlies", "zones", "routes", "anchors", "notes"]);
export const CATEGORY_LABELS = Object.freeze({
  enemies: "敌军", friendlies: "友军", zones: "触发区", routes: "路线", anchors: "锚点", notes: "批注",
});
export const STATE_ORDER = Object.freeze(["active", "standby", "dormant", "spawned", "pending", "cleared"]);
export const STATE_LABELS = Object.freeze({
  pending: "未出现", spawned: "已生成", standby: "待命", dormant: "休眠", active: "活跃", cleared: "已清除",
});
export const BEHAVIOR_ORDER = Object.freeze(["hold", "mobile"]);
export const BEHAVIOR_LABELS = Object.freeze({ hold: "钉在原地", mobile: "会移动" });
// 刺刀不是一支枪，但用户挑人的时候就是把它当一类看的（「上了刺刀的那批」），
// 所以它和武器排在同一节里，按「或」参与筛选：选了它 = 也要上刺刀的那些人。
export const BAYONET_KEY = "bayonet";
export const WEAPON_LABELS = Object.freeze({ Type38: "步枪", Type11: "机枪", [BAYONET_KEY]: "上了刺刀" });
export const FRIENDLY_LABELS = Object.freeze({
  squadPost: "班里弟兄的位置", guardPost: "哨位", defender: "守在这儿的自己人",
  forwardNest: "前沿火力点", defensePost: "防御点", cartBay: "装车位",
  tankStart: "坦克起始位", phaseSpawn: "跳关出生点",
});
export const ZONE_LABELS = Object.freeze({
  gate: "过关条件的触发圈", interior: "室内判定区", crawl: "匍匐区", threatArea: "某一处威胁的落点范围",
});
// 路线的中文名。`MISSION_ROUTES` 的键是给代码用的（flank / ordersRejoin …），
// 面板上照搬那些词等于没说 —— 这张表把每一条翻成「它到底是哪条路」。
// 缺名字的（新加了一条路线还没来得及登记）兜底成「路线 <编号>」，不写英文键。
export const ROUTE_LABELS = Object.freeze({
  flank: "侧翼路",
  // 2026.09.19：军列开场下线之后，这一条（=OPENING.approachRoute）没有人再走，
  // 只剩几何还按它让路（Data_FirstLevelMissionLayout 的避让表、交通壕中心线）。
  opening: "旧进沟路（无人走，只作几何避让）",
  support: "支援壕沟",
  bundle: "取集束弹的路",
  bundleReturn: "取弹返回",
  orders: "接令路",
  ordersRejoin: "接令归队",
  south: "南行路",
  southTraffic: "南行路的车流",
  village: "村口路",
  evacuation: "后撤路",
  reception: "接收院内",
  exit: "撤离路",
  rearTrench: "掩蔽部后撤的交通壕",
  collectionReturn: "回伤员集结处的路",
  southWalk: "沿沟南行",
  courtyardBypass: "穿灶屋绕过主街障碍",
  cartRide: "老周那辆车走的路",
  wallPath: "靠院墙的小路",
  toBridge: "去铁路桥南岸的路",
  bridgeCrossing: "回援尾队过桥的路",
  bridgeWithdraw: "撤出爆破区的路",
  marchOut: "炸桥后往滕县的行军路",
  nightMarch: "夜里进北门的路",
  pursuit: "敌军追击路",
  sortie: "出击路",
  sortieReturn: "出击返回",
  // 2026.09.22 前沿重建（一处缺口 + 三条独立线）新加的两条。没有中文名的话，
  // 分类树左边就写着 `rightRear`，而「路线名一律中文」是这张表自己的门禁在守的。
  rightRear: "从右侧机枪位退回后方的路",
  attack: "从后方压上缺口的路",
  // 下面五条是旧军列开场留下的线。人已经不走了，几何仍按它们让路，所以工作台还画得出来。
  // approach / supportTrench 与 opening / support 指同一个数组（重复登记，门禁点名要）。
  approach: "旧进沟路（同 opening）",
  supportTrench: "支援壕沟（同 support）",
  trenchContact: "旧进沟接敌路（无人走）",
  wounded: "旧伤员后送路（无人走）",
  runner: "旧传令兵的路（无人走）",
});
export function RouteLabel(name) {
  return ROUTE_LABELS[name] || `路线 ${name}`;
}

// 敌军组的中文名。转运区两组由 EncounterLabel 按威胁事实表顺序现算。
export const ENCOUNTER_LABELS = Object.freeze({
  bunkerAssault: "掩蔽部门外行刑的日军",
  approach: "压向外围阵地的日军",
  front: "前沿阵地上的日军",
  machineGun: "冲机枪位的那一波",
  bundleApproach: "护着战车的日军",
  tank: "战车与它的护卫",
  village: "村口的日军",
  melee: "从连屋冲出来的日军",
  courtyard: "追进院子的日军",
  transfer: "压向装载区的日军",
  transferAlley: "侧巷的日军",
  air: "空袭之后压上来的日军",
  bridgeNorth: "北岸土坎上的日军",
});

// --- 预设（面板顶上那一排）------------------------------------------------
export const PRESETS = Object.freeze([
  { id: "all", label: "全部", hint: "什么都画" },
  { id: "enemies", label: "只看敌军", hint: "只留敌人，友军 / 触发区 / 路线 / 锚点 / 批注都收起来" },
  { id: "friendlies", label: "只看友军", hint: "只留自己人的位置" },
  { id: "zones", label: "只看触发区", hint: "只留过关条件的圈与判定区" },
  { id: "routes", label: "只看路线", hint: "只留这一阶段用到的路线" },
  { id: "new", label: "只看本阶段新出现的", hint: "出现阶段正好是当前这一阶段的那几组敌人" },
]);
export const PRESET_IDS = Object.freeze(PRESETS.map((preset) => preset.id));

// 一行 = 一个可以点「只看」的东西。kind 决定它在筛选状态里落到哪个字段。
const FIELD_FOR_KIND = Object.freeze({
  encounter: "encounters", state: "states", weapon: "weapons", behavior: "behaviors",
  friendlyKind: "friendlyKinds", zoneKind: "zoneKinds", route: "routes",
});

const AllOn = () => ({ enemies: true, friendlies: true, anchors: true, zones: true, routes: true, notes: true });
const OnlyOn = (id) => {
  const categories = AllOn();
  for (const key of Object.keys(categories)) categories[key] = key === id;
  return categories;
};

/** 出厂状态：什么都画。null = 不限制（这一类全画），空集 = 一个都不画。 */
export function DefaultFilterState() {
  return {
    preset: "all",
    categories: AllOn(),
    encounters: null,
    states: null,
    weapons: null,
    behaviors: null,
    friendlyKinds: null,
    zoneKinds: null,
    routes: null,
    onlyNewThisPhase: false,
    solo: null,
  };
}

/** 把外面传进来的东西补成一份完整状态（少字段、脏字段都能吃）。 */
export function NormalizeFilterState(state) {
  const base = DefaultFilterState();
  if (!state || typeof state !== "object") return base;
  const next = { ...base, ...state };
  next.categories = { ...base.categories, ...(state.categories || {}) };
  for (const field of ["encounters", "states", "weapons", "behaviors", "friendlyKinds", "zoneKinds", "routes"]) {
    const value = state[field];
    next[field] = value == null ? null : new Set(value);
  }
  next.onlyNewThisPhase = !!state.onlyNewThisPhase;
  next.solo = state.solo && state.solo.kind ? { kind: state.solo.kind, id: state.solo.id ?? null } : null;
  next.preset = typeof state.preset === "string" ? state.preset : "custom";
  return next;
}

/** 预设：整份状态推倒重来（预设本来就是「别想了，就看这个」）。 */
export function ApplyPreset(state, presetId) {
  const next = DefaultFilterState();
  next.preset = PRESET_IDS.includes(presetId) ? presetId : "all";
  if (next.preset === "new") {
    next.categories = OnlyOn("enemies");
    next.onlyNewThisPhase = true;
  } else if (next.preset !== "all") {
    next.categories = OnlyOn(next.preset === "zones" ? "zones" : next.preset);
  }
  return next;
}

/**
 * 眼睛开关：把某一行开掉或开回来。
 * null（= 全画）里关掉一个，得先把「全部」摊成集合再减掉那一个；
 * 减到只剩空集就是「这一类一个都不画」，摊回全集就还原成 null。
 */
export function ToggleFilterItem(state, kind, id, allIds = []) {
  const next = NormalizeFilterState(state);
  next.preset = "custom";
  next.solo = null;
  if (kind === "category") {
    next.categories[id] = !next.categories[id];
    return next;
  }
  const field = FIELD_FOR_KIND[kind];
  if (!field) return next;
  const all = [...new Set(allIds.map(String))];
  const current = next[field] == null ? new Set(all) : new Set(next[field]);
  if (current.has(id)) current.delete(id);
  else current.add(id);
  next[field] = all.length && current.size === all.length && all.every((one) => current.has(one)) ? null : current;
  return next;
}

/** 「只看」：再点一次取消。solo 压过一切别的筛选。 */
export function SoloFilterItem(state, kind, id) {
  const next = NormalizeFilterState(state);
  const same = next.solo && next.solo.kind === kind && String(next.solo.id ?? "") === String(id ?? "");
  next.solo = same ? null : { kind, id: id ?? null };
  return next;
}

// ---------------------------------------------------------------------------
// 集合：BuildOrchestrationFilter
// ---------------------------------------------------------------------------
/** 这一阶段是第几阶段（PhaseLayout 自己不带号，就从它的第一个步骤反查）。 */
export function PhaseNumberOfLayout(model, phaseLayout) {
  if (Number.isFinite(phaseLayout?.phaseNumber)) return phaseLayout.phaseNumber;
  const first = phaseLayout?.steps?.[0];
  const step = first ? model.steps.find((entry) => entry.id === first) : null;
  return step?.phaseNumber ?? null;
}

/**
 * 这一阶段图上会画哪几条路线。
 * 与俯视图同一条口径：这一阶段有自己的指引路线就只画那几条，一条都没有（转运区
 * 那几个阶段就是）时它画全部 —— 面板要是自己另算一套，计数就和图上对不上。
 */
export function RouteNamesFor(model, phaseLayout) {
  const own = phaseLayout?.routes;
  if (Array.isArray(own) && own.length) return [...own];
  return Object.keys(model?.routes || {});
}

/** 界面上这一组该怎么称呼：查词表；转运区的两处威胁另按次序叫。 */
export function EncounterLabel(model, encounter) {
  const id = typeof encounter === "string" ? encounter : encounter?.id;
  const order = (model?.transferThreats || []).findIndex((threat) => threat.id === id) + 1;
  if (order > 0) return `转运区第 ${order} 处威胁`;
  return ENCOUNTER_LABELS[id] || id || "（没名字的一组）";
}

export function WeaponLabel(id) {
  return WEAPON_LABELS[id] || WEAPONS?.[id]?.name || id;
}

/** 武器那一节的悬停说明：短名 + 表里的正式名。 */
export function WeaponHint(id) {
  if (id === BAYONET_KEY) return "枪上装了刺刀的那些人（和上面两项是「或」的关系）";
  const full = WEAPONS?.[id]?.fullName || WEAPONS?.[id]?.name;
  return full ? `${WeaponLabel(id)}（${full}）` : WeaponLabel(id);
}

export function MemberBehavior(member) { return member?.hold ? "hold" : "mobile"; }

function MemberWeaponKeys(member) {
  const keys = [member?.weapon].filter(Boolean);
  if (member?.bayonet) keys.push(BAYONET_KEY);
  return keys;
}

function MemberPasses(member, encounter, entryState, state, phaseNumber) {
  if (state.encounters && !state.encounters.has(encounter.id)) return false;
  if (state.states && !state.states.has(entryState)) return false;
  if (state.weapons && !MemberWeaponKeys(member).some((key) => state.weapons.has(key))) return false;
  if (state.behaviors && !state.behaviors.has(MemberBehavior(member))) return false;
  if (state.onlyNewThisPhase && encounter.phaseNumber !== phaseNumber) return false;
  return true;
}

const EmptySets = () => ({
  members: new Set(), encounters: new Set(), routes: new Set(),
  zones: new Set(), friendlies: new Set(), anchors: new Set(), notes: new Set(),
});

/** solo：只留这一组 / 这一类，别的全部收起来。 */
function SoloSets(model, phaseLayout, solo) {
  const sets = EmptySets();
  const encounters = phaseLayout?.encounters || [];
  const id = solo.id == null ? "" : String(solo.id);
  const Keep = (predicate) => {
    for (const encounter of encounters) {
      let kept = 0;
      for (const member of encounter.members) {
        if (!predicate(member, encounter)) continue;
        sets.members.add(member.id);
        kept += 1;
      }
      if (kept) sets.encounters.add(encounter.id);
    }
  };
  switch (solo.kind) {
    case "encounter": Keep((member, encounter) => encounter.id === id); break;
    case "member": Keep((member) => member.id === id); break;
    case "state": Keep((member, encounter) => encounter.state === id); break;
    case "weapon": Keep((member) => MemberWeaponKeys(member).includes(id)); break;
    case "behavior": Keep((member) => MemberBehavior(member) === id); break;
    case "friendlyKind":
      for (const friendly of phaseLayout?.friendlies || []) if (friendly.kind === id) sets.friendlies.add(friendly.id);
      break;
    case "zoneKind":
      for (const zone of phaseLayout?.zones || []) if (zone.kind === id) sets.zones.add(zone.id);
      break;
    case "route":
      if (RouteNamesFor(model, phaseLayout).includes(id)) sets.routes.add(id);
      break;
    case "category": {
      const full = BuildOrchestrationFilter(model, phaseLayout, { ...DefaultFilterState(), categories: OnlyOn(id) });
      return {
        members: full.members ?? AllMemberIds(phaseLayout),
        encounters: full.encounters ?? AllEncounterIds(phaseLayout),
        routes: full.routes ?? new Set(RouteNamesFor(model, phaseLayout)),
        zones: full.zones ?? new Set((phaseLayout?.zones || []).map((zone) => zone.id)),
        friendlies: full.friendlies ?? new Set((phaseLayout?.friendlies || []).map((one) => one.id)),
        anchors: full.anchors ?? new Set(Object.keys(model?.anchors || {})),
        notes: full.notes,
      };
    }
    default: break;
  }
  return sets;
}

function AllMemberIds(phaseLayout) {
  const ids = new Set();
  for (const encounter of phaseLayout?.encounters || []) for (const member of encounter.members) ids.add(member.id);
  return ids;
}

function AllEncounterIds(phaseLayout) {
  return new Set((phaseLayout?.encounters || []).map((encounter) => encounter.id));
}

/**
 * 筛选状态 → 俯视图认的那几个集合。
 * 每个键：null = 这一类全画（也别为它多算一遍），Set = 只画集合里的，空集 = 一个都不画。
 */
export function BuildOrchestrationFilter(model, phaseLayout, rawState) {
  const state = NormalizeFilterState(rawState);
  if (state.solo) return SoloSets(model, phaseLayout, state.solo);
  const phaseNumber = PhaseNumberOfLayout(model, phaseLayout);
  const filter = {
    members: null, encounters: null, routes: null, zones: null, friendlies: null, anchors: null, notes: null,
  };
  // 敌军
  const narrowed = !!(state.encounters || state.states || state.weapons || state.behaviors || state.onlyNewThisPhase);
  if (!state.categories.enemies) { filter.members = new Set(); filter.encounters = new Set(); }
  else if (narrowed) {
    filter.members = new Set();
    filter.encounters = new Set();
    for (const encounter of phaseLayout?.encounters || []) {
      let kept = 0;
      for (const member of encounter.members) {
        if (!MemberPasses(member, encounter, encounter.state, state, phaseNumber)) continue;
        filter.members.add(member.id);
        kept += 1;
      }
      if (kept) filter.encounters.add(encounter.id);
    }
  }
  // 友军
  if (!state.categories.friendlies) filter.friendlies = new Set();
  else if (state.friendlyKinds) {
    filter.friendlies = new Set((phaseLayout?.friendlies || [])
      .filter((one) => state.friendlyKinds.has(one.kind)).map((one) => one.id));
  }
  // 触发区
  if (!state.categories.zones) filter.zones = new Set();
  else if (state.zoneKinds) {
    filter.zones = new Set((phaseLayout?.zones || [])
      .filter((zone) => state.zoneKinds.has(zone.kind)).map((zone) => zone.id));
  }
  // 路线
  if (!state.categories.routes) filter.routes = new Set();
  else if (state.routes) filter.routes = new Set([...state.routes]);
  // 锚点 / 批注：只有开关，没有分小类
  if (!state.categories.anchors) filter.anchors = new Set();
  if (!state.categories.notes) filter.notes = new Set();
  return filter;
}

const Visible = (set, id) => (set == null ? true : set.has(id));

/** 先按出现阶段、再按名字。没有阶段号的排在最后。 */
export function SortByPhaseThenName(list, Key) {
  return [...list].sort((a, b) => {
    const left = Key(a);
    const right = Key(b);
    const phaseA = Number.isFinite(left.phaseNumber) ? left.phaseNumber : 99;
    const phaseB = Number.isFinite(right.phaseNumber) ? right.phaseNumber : 99;
    if (phaseA !== phaseB) return phaseA - phaseB;
    return left.label < right.label ? -1 : left.label > right.label ? 1 : 0;
  });
}

// ---------------------------------------------------------------------------
// 面板：FilterSummary
// ---------------------------------------------------------------------------
/**
 * 分类树要的数据：每一类一行，敌军再分「按组 / 按状态 / 按武器 / 按行为」四节。
 * 每一项都带 count（这一阶段有多少）与 visible（现在画出来几个）。
 * extra.notes 是面板手上的批注条数（模型里没有批注，这一层不去猜）。
 */
export function FilterSummary(model, phaseLayout, rawState, extra = {}) {
  const state = NormalizeFilterState(rawState);
  const filter = BuildOrchestrationFilter(model, phaseLayout, state);
  const phaseNumber = PhaseNumberOfLayout(model, phaseLayout);
  const encounters = phaseLayout?.encounters || [];
  const solo = state.solo;
  const Soloed = (kind, id) => !!solo && solo.kind === kind && String(solo.id ?? "") === String(id ?? "");

  // 按组排：先按**出现阶段**，同一阶段内再按名字。
  // 按内部表的顺序排的话，第 2 阶段的组会夹在第 15 阶段的组中间 —— 那是写表的顺序，
  // 不是关卡里发生的顺序，用户照着它数「这一关的敌人是怎么一批批上来的」会数错。
  const groups = SortByPhaseThenName(encounters, (encounter) => ({
    phaseNumber: encounter.phaseNumber, label: EncounterLabel(model, encounter),
  })).map((encounter) => {
    const visible = encounter.members.filter((member) => Visible(filter.members, member.id)).length;
    return {
      kind: "encounter", id: encounter.id, key: `encounter:${encounter.id}`,
      label: EncounterLabel(model, encounter), code: encounter.id,
      state: encounter.state, stateText: STATE_LABELS[encounter.state] || encounter.state,
      phaseNumber: encounter.phaseNumber,
      isNew: encounter.phaseNumber === phaseNumber,
      count: encounter.members.length, visible,
      on: state.encounters ? state.encounters.has(encounter.id) : true,
      soloed: Soloed("encounter", encounter.id),
    };
  });

  const Bucket = (kind, id, label, members, hint = "") => ({
    kind, id, key: `${kind}:${id}`, label, hint,
    count: members.length,
    visible: members.filter((member) => Visible(filter.members, member.id)).length,
    on: state[FIELD_FOR_KIND[kind]] ? state[FIELD_FOR_KIND[kind]].has(id) : true,
    soloed: Soloed(kind, id),
  });

  const byState = new Map();
  const byWeapon = new Map();
  const byBehavior = new Map();
  const Push = (map, key, member) => {
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(member);
  };
  for (const encounter of encounters) {
    for (const member of encounter.members) {
      Push(byState, encounter.state, member);
      for (const key of MemberWeaponKeys(member)) Push(byWeapon, key, member);
      Push(byBehavior, MemberBehavior(member), member);
    }
  }
  const states = STATE_ORDER.filter((id) => byState.has(id))
    .map((id) => Bucket("state", id, STATE_LABELS[id] || id, byState.get(id), `这一阶段处于「${STATE_LABELS[id] || id}」的人`));
  const weaponIds = [...byWeapon.keys()].sort((a, b) => {
    if (a === BAYONET_KEY) return 1;
    if (b === BAYONET_KEY) return -1;
    return byWeapon.get(b).length - byWeapon.get(a).length;
  });
  const weapons = weaponIds.map((id) => Bucket("weapon", id, WeaponLabel(id), byWeapon.get(id), WeaponHint(id)));
  const behaviors = BEHAVIOR_ORDER.filter((id) => byBehavior.has(id))
    .map((id) => Bucket("behavior", id, BEHAVIOR_LABELS[id], byBehavior.get(id),
      id === "hold" ? "守在出生点不追人" : "有路线或会跃进的人"));

  const friendlyKinds = new Map();
  for (const friendly of phaseLayout?.friendlies || []) {
    if (!friendlyKinds.has(friendly.kind)) friendlyKinds.set(friendly.kind, []);
    friendlyKinds.get(friendly.kind).push(friendly);
  }
  const friendlies = [...friendlyKinds.entries()].map(([kind, list]) => ({
    kind: "friendlyKind", id: kind, key: `friendlyKind:${kind}`,
    label: FRIENDLY_LABELS[kind] || kind, code: kind,
    count: list.length, visible: list.filter((one) => Visible(filter.friendlies, one.id)).length,
    on: state.friendlyKinds ? state.friendlyKinds.has(kind) : true,
    soloed: Soloed("friendlyKind", kind),
  }));

  const zoneKinds = new Map();
  for (const zone of phaseLayout?.zones || []) {
    if (!zoneKinds.has(zone.kind)) zoneKinds.set(zone.kind, []);
    zoneKinds.get(zone.kind).push(zone);
  }
  const zones = [...zoneKinds.entries()].map(([kind, list]) => ({
    kind: "zoneKind", id: kind, key: `zoneKind:${kind}`,
    label: ZONE_LABELS[kind] || kind, code: kind,
    count: list.length, visible: list.filter((one) => Visible(filter.zones, one.id)).length,
    on: state.zoneKinds ? state.zoneKinds.has(kind) : true,
    soloed: Soloed("zoneKind", kind),
  }));

  const routes = RouteNamesFor(model, phaseLayout).map((name) => ({
    kind: "route", id: name, key: `route:${name}`,
    label: RouteLabel(name), code: name,
    hint: `${RouteLabel(name)}（表里的编号 ${name}）：${(model?.routes?.[name] || []).length} 个路点`,
    count: (model?.routes?.[name] || []).length,
    visible: Visible(filter.routes, name) ? (model?.routes?.[name] || []).length : 0,
    on: state.routes ? state.routes.has(name) : true,
    soloed: Soloed("route", name),
  }));

  const memberCount = encounters.reduce((sum, encounter) => sum + encounter.members.length, 0);
  const memberVisible = encounters.reduce((sum, encounter) =>
    sum + encounter.members.filter((member) => Visible(filter.members, member.id)).length, 0);
  const anchorIds = Object.keys(model?.anchors || {});
  const noteCount = Number.isFinite(extra.notes) ? extra.notes : (extra.notes?.length ?? 0);
  const routePointsVisible = routes.reduce((sum, row) => sum + (row.visible ? 1 : 0), 0);
  const counts = {
    enemies: { count: memberCount, visible: memberVisible },
    friendlies: {
      count: (phaseLayout?.friendlies || []).length,
      visible: (phaseLayout?.friendlies || []).filter((one) => Visible(filter.friendlies, one.id)).length,
    },
    zones: {
      count: (phaseLayout?.zones || []).length,
      visible: (phaseLayout?.zones || []).filter((zone) => Visible(filter.zones, zone.id)).length,
    },
    routes: { count: routes.length, visible: routePointsVisible },
    anchors: {
      count: anchorIds.length,
      visible: anchorIds.filter((id) => Visible(filter.anchors, id)).length,
    },
    notes: { count: noteCount, visible: filter.notes ? 0 : noteCount },
  };
  const categories = CATEGORY_ORDER.map((id) => ({
    kind: "category", id, key: `category:${id}`, label: CATEGORY_LABELS[id],
    on: !!state.categories[id], count: counts[id].count, visible: counts[id].visible,
    soloed: Soloed("category", id),
  }));

  return {
    phaseNumber, preset: state.preset, solo: solo ? { ...solo } : null,
    onlyNewThisPhase: state.onlyNewThisPhase,
    categories,
    enemies: { count: memberCount, visible: memberVisible, groups, states, weapons, behaviors },
    friendlies, zones, routes,
    anchors: counts.anchors, notes: counts.notes,
  };
}

// ---------------------------------------------------------------------------
// 敌军布设表
// ---------------------------------------------------------------------------
export const ENEMY_TABLE_COLUMNS = Object.freeze([
  { id: "group", label: "组", hint: "他属于哪一组" },
  { id: "member", label: "编号", hint: "这个人在表里的编号" },
  { id: "start", label: "出现", hint: "这一组从第几阶段开始在场" },
  { id: "state", label: "本阶段", hint: "当前这一阶段开始时他是什么状态" },
  { id: "weapon", label: "武器", hint: "手上拿的" },
  { id: "traits", label: "特点", hint: "钉在原地 / 上刺刀 / 预备队这些" },
  { id: "spawn", label: "出生点", hint: "放下去的位置（东 x，南 z）" },
  { id: "route", label: "路线点", hint: "他的行动路线有几个点" },
  { id: "live", label: "实时", hint: "这一局里他现在怎么样（没人在跑就空着）" },
]);

/** 一行 = 一个敌人。live 给了就填「实时」列，没给就空着。 */
export function EnemyTableRows(model, phaseLayout, live = null) {
  const rows = [];
  const liveById = new Map();
  for (const enemy of live?.enemies || []) liveById.set(enemy.id, enemy);
  for (const encounter of phaseLayout?.encounters || []) {
    for (const member of encounter.members) {
      const traits = [];
      if (member.hold) traits.push("钉在原地");
      if (member.bayonet) traits.push("上刺刀");
      if (member.reserve) traits.push("预备队");
      if (member.releaseDelayS > 0) traits.push(`等 ${member.releaseDelayS} 秒`);
      if (Number.isFinite(member.clearedAtPhase)) traits.push(`第 ${member.clearedAtPhase} 阶段起算已打掉`);
      const routePoints = member.tactic?.points?.length ?? 0;
      const lanePoints = member.assaultLane?.length ?? 0;
      const actual = liveById.get(member.id) || null;
      rows.push({
        encounterId: encounter.id,
        group: EncounterLabel(model, encounter),
        member: member.id,
        startPhase: encounter.phaseNumber ?? null,
        startText: Number.isFinite(encounter.phaseNumber) ? `第 ${encounter.phaseNumber} 阶段` : "—",
        state: encounter.state,
        stateText: STATE_LABELS[encounter.state] || encounter.state,
        weapon: member.weapon,
        weaponText: WeaponLabel(member.weapon),
        behavior: MemberBehavior(member),
        traits,
        traitText: traits.length ? traits.join(" · ") : "跟着组走",
        x: member.x, z: member.z,
        spawnText: `${Math.round(member.x)}, ${Math.round(member.z)}`,
        routePoints, lanePoints,
        routeText: routePoints ? `${routePoints} 点` : lanePoints ? `跃进线 ${lanePoints} 点` : "不动",
        live: actual ? { alive: !!actual.alive, x: actual.x, z: actual.z, dormant: !!actual.dormant } : null,
        liveText: actual
          ? `${actual.alive ? "活着" : "阵亡"}${actual.dormant ? "（还睡着）" : ""} ${Math.round(actual.x)}, ${Math.round(actual.z)}`
          : "",
      });
    }
  }
  return rows;
}

const SORTERS = {
  // 按组 = 先按出现阶段、再按组名，最后才按编号：与分类树那一节同一个顺序。
  group: (row) => `${String(row.startPhase ?? 99).padStart(2, "0")} ${row.group} ${row.member}`,
  member: (row) => row.member,
  start: (row) => row.startPhase ?? 99,
  state: (row) => STATE_ORDER.indexOf(row.state),
  weapon: (row) => row.weaponText,
  traits: (row) => row.traitText,
  spawn: (row) => row.x,
  route: (row) => row.routePoints || row.lanePoints,
  live: (row) => (row.live ? (row.live.alive ? 0 : 1) : 2),
};

/** 按列排序（表头点一下换升降序）。原数组不动。 */
export function SortEnemyRows(rows, column, ascending = true) {
  const key = SORTERS[column] || SORTERS.group;
  const sorted = [...rows].sort((a, b) => {
    const left = key(a);
    const right = key(b);
    if (left === right) return a.member < b.member ? -1 : a.member > b.member ? 1 : 0;
    if (typeof left === "number" && typeof right === "number") return left - right;
    return String(left) < String(right) ? -1 : 1;
  });
  return ascending ? sorted : sorted.reverse();
}

const CsvCell = (value) => {
  const text = value === undefined || value === null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

/** 「复制 CSV」：首行是中文表头，一行一个敌人。Excel 能直接吃。 */
export function EnemyTableCsv(rows) {
  const lines = [ENEMY_TABLE_COLUMNS.map((column) => CsvCell(column.label)).join(",")];
  for (const row of rows) {
    lines.push([
      row.group, row.member, row.startText, row.stateText, row.weaponText, row.traitText,
      row.spawnText, row.routeText, row.liveText,
    ].map(CsvCell).join(","));
  }
  return lines.join("\n");
}

/** 这一行现在画不画得出来（表按当前筛选联动）。 */
export function RowVisible(filter, row) {
  return Visible(filter?.members, row.member);
}
