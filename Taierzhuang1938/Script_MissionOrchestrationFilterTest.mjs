// ===========================================================================
// Script_MissionOrchestrationFilterTest.mjs —— 「分类查看」纯模型的闸门（纯 Node，毫秒级）
//
// 全部对着**真模型**跑（BuildOrchestrationModel + PhaseLayout），不用手捏假数据：
// 分类树上写的人数要是和 PhaseLayout 对不上，用户就是照着一张假花名册提意见。
//
// 守五件事：
//   1. 「只看」一组 = 集合里只剩那一组的人（别的类别全空）；再点一次取消。
//   2. 按状态 / 按武器 / 按行为筛出来的人数，与 PhaseLayout 逐个数出来的一致。
//   3. 六个预设各自只留对应的那一类（「只看敌军」时友军集合是**空集**，不是 null）。
//   4. 敌军布设表行数 = 这一阶段全部成员数，每行九列字段齐；CSV 首行是中文表头。
//   5. 界面用字是人话：组名不是内部 id，转运区两组叫「第 n 处威胁」，
//      「kind=」这类内部叫法不出现在任何一个 label 里。
//
// 跑法：node Taierzhuang1938/Script_MissionOrchestrationFilterTest.mjs
// 口径：docs/Data_MissionOrchestration.md §2。
// ===========================================================================
import assert from "node:assert/strict";

import { BuildOrchestrationModel, PhaseLayout } from "./Script_MissionOrchestration.mjs";
import {
  DefaultFilterState, NormalizeFilterState, ApplyPreset, ToggleFilterItem, SoloFilterItem,
  BuildOrchestrationFilter, FilterSummary, EnemyTableRows, EnemyTableCsv, SortEnemyRows, RowVisible,
  EncounterLabel, WeaponLabel, RouteLabel, PhaseNumberOfLayout, RouteNamesFor, ROUTE_LABELS,
  PRESETS, PRESET_IDS, ENEMY_TABLE_COLUMNS, STATE_LABELS, BAYONET_KEY,
} from "./Script_MissionOrchestrationFilter.mjs";

let checks = 0;
function Check(ok, message) {
  assert.ok(ok, message);
  checks += 1;
}

const model = BuildOrchestrationModel();
const PHASE = 12;
const layout = PhaseLayout(model, PHASE);
const members = layout.encounters.flatMap((encounter) => encounter.members);
const MemberCount = (predicate) => members.filter(predicate).length;

Check(PhaseNumberOfLayout(model, layout) === PHASE, "从 PhaseLayout 反查得出阶段号");

// ---------------------------------------------------------------------------
// 1) 出厂状态：什么都画（null = 不限制）
// ---------------------------------------------------------------------------
const base = DefaultFilterState();
const all = BuildOrchestrationFilter(model, layout, base);
Check(Object.values(all).every((set) => set === null), "出厂状态下七个集合全是 null（全画）");
Check(PRESETS.length === 6 && PRESET_IDS.includes("new"), "六个预设都在");

// ---------------------------------------------------------------------------
// 2) 「只看」一组
// ---------------------------------------------------------------------------
const soloState = SoloFilterItem(base, "encounter", "transfer");
const solo = BuildOrchestrationFilter(model, layout, soloState);
const transfer = layout.encounters.find((encounter) => encounter.id === "transfer");
Check(solo.members.size === transfer.members.length && transfer.members.length === 4,
  `只看 transfer 后只剩它的 ${transfer.members.length} 个人`);
Check(transfer.members.every((member) => solo.members.has(member.id)), "剩下的正好是那一组的人");
Check(solo.encounters.size === 1 && solo.encounters.has("transfer"), "组的集合里也只剩它");
for (const key of ["routes", "zones", "friendlies", "anchors", "notes"]) {
  Check(solo[key] instanceof Set && solo[key].size === 0, `只看一组时 ${key} 是空集`);
}
Check(SoloFilterItem(soloState, "encounter", "transfer").solo === null, "再点一次「只看」就取消");

const soloSummary = FilterSummary(model, layout, soloState);
const soloRow = soloSummary.enemies.groups.find((row) => row.id === "transfer");
Check(soloRow.visible === 4 && soloRow.count === 4 && soloRow.soloed === true, "面板计数与集合一致（4/4，标着「只看」）");
Check(soloSummary.enemies.visible === 4 && soloSummary.enemies.count === members.length,
  `敌军一栏写 ${soloSummary.enemies.visible}/${soloSummary.enemies.count}`);
const otherRow = soloSummary.enemies.groups.find((row) => row.id === "transferAlley");
Check(otherRow.visible === 0, "别的组在面板上写 0");

// solo 压过一切：就算别的筛选写着只看机枪，也还是这一组的四个人
const soloOverride = SoloFilterItem({ ...base, weapons: new Set(["Type11"]) }, "encounter", "transfer");
Check(BuildOrchestrationFilter(model, layout, soloOverride).members.size === 4, "solo 压过别的筛选");

// ---------------------------------------------------------------------------
// 3) 状态 / 武器 / 行为：人数与 PhaseLayout 逐个数出来的一致
// ---------------------------------------------------------------------------
const summary = FilterSummary(model, layout, base);
for (const row of summary.enemies.states) {
  const expected = layout.encounters
    .filter((encounter) => encounter.state === row.id)
    .reduce((sum, encounter) => sum + encounter.members.length, 0);
  Check(row.count === expected && row.visible === expected,
    `按状态「${row.label}」= ${expected} 人（面板 ${row.count}）`);
  const picked = BuildOrchestrationFilter(model, layout, { ...base, states: new Set([row.id]) });
  Check(picked.members.size === expected, `只看「${row.label}」时集合里 ${expected} 人`);
}
Check(summary.enemies.states.reduce((sum, row) => sum + row.count, 0) === members.length,
  "六种状态加起来 = 这一阶段全部成员");

for (const row of summary.enemies.weapons) {
  const expected = row.id === BAYONET_KEY
    ? MemberCount((member) => member.bayonet)
    : MemberCount((member) => member.weapon === row.id);
  Check(row.count === expected, `按武器「${row.label}」= ${expected} 人`);
  const picked = BuildOrchestrationFilter(model, layout, { ...base, weapons: new Set([row.id]) });
  Check(picked.members.size === expected, `只看「${row.label}」时集合里 ${expected} 人`);
}

const hold = summary.enemies.behaviors.find((row) => row.id === "hold");
const mobile = summary.enemies.behaviors.find((row) => row.id === "mobile");
Check(hold.count === MemberCount((member) => member.hold), `钉在原地 ${hold.count} 人`);
Check(hold.count + mobile.count === members.length, "钉在原地 + 会移动 = 全部");
const mobileOnly = BuildOrchestrationFilter(model, layout, { ...base, behaviors: new Set(["mobile"]) });
Check([...mobileOnly.members].every((id) => !members.find((member) => member.id === id).hold),
  "只看会移动时集合里没有钉在原地的人");

// ---------------------------------------------------------------------------
// 4) 预设：各自只留对应类别
// ---------------------------------------------------------------------------
const enemiesOnly = BuildOrchestrationFilter(model, layout, ApplyPreset(base, "enemies"));
Check(enemiesOnly.members === null && enemiesOnly.encounters === null, "「只看敌军」把敌人全留下");
Check(enemiesOnly.friendlies.size === 0 && enemiesOnly.zones.size === 0
  && enemiesOnly.routes.size === 0 && enemiesOnly.anchors.size === 0 && enemiesOnly.notes.size === 0,
  "「只看敌军」时友军 / 触发区 / 路线 / 锚点 / 批注都是空集");

const friendliesOnly = BuildOrchestrationFilter(model, layout, ApplyPreset(base, "friendlies"));
Check(friendliesOnly.friendlies === null && friendliesOnly.members.size === 0, "「只看友军」反过来");
const zonesOnly = BuildOrchestrationFilter(model, layout, ApplyPreset(base, "zones"));
Check(zonesOnly.zones === null && zonesOnly.members.size === 0 && zonesOnly.friendlies.size === 0, "「只看触发区」");
const routesOnly = BuildOrchestrationFilter(model, layout, ApplyPreset(base, "routes"));
Check(routesOnly.routes === null && routesOnly.members.size === 0, "「只看路线」");
// 这一阶段没有自己的指引路线时图上画的是全部路线：面板得跟着这条口径数，
// 否则左边写「0 条」而图上二十一条线还在。
Check(summary.routes.length === RouteNamesFor(model, layout).length && summary.routes.length > 0,
  `第 ${PHASE} 阶段路线行 ${summary.routes.length} 条（与图上同一条口径）`);
const oneRoute = BuildOrchestrationFilter(model, layout, SoloFilterItem(base, "route", summary.routes[0].id));
Check(oneRoute.routes.size === 1 && oneRoute.routes.has(summary.routes[0].id), "「只看」某一条路线");

const newOnly = ApplyPreset(base, "new");
const fresh = BuildOrchestrationFilter(model, layout, newOnly);
const expectedNew = layout.encounters.filter((encounter) => encounter.phaseNumber === PHASE);
Check(fresh.encounters.size === expectedNew.length && expectedNew.length > 0,
  `「只看本阶段新出现的」在第 ${PHASE} 阶段留下 ${expectedNew.length} 组`);
Check(fresh.members.size === expectedNew.reduce((sum, encounter) => sum + encounter.members.length, 0),
  "人数也跟着只剩这几组");
Check(fresh.friendlies.size === 0, "这个预设也只看敌军");

// ---------------------------------------------------------------------------
// 5) 眼睛开关：从 null 关掉一个 → 全集减一；关到只剩空集；开回全集 → null
// ---------------------------------------------------------------------------
const groupIds = layout.encounters.map((encounter) => encounter.id);
// 2026-09-23 01–05 重构契约 §8：新增 bunkerBackdrop / bunkerPursuit / frontFlank / frontOfficer / frontReserve 五组。
Check(groupIds.length === 18, `这一关十八组（实际 ${groupIds.length}）`);
let toggled = ToggleFilterItem(base, "encounter", "transfer", groupIds);
Check(toggled.encounters.size === groupIds.length - 1 && !toggled.encounters.has("transfer"),
  "关掉一组 = 全集减那一组");
Check(BuildOrchestrationFilter(model, layout, toggled).members.size === members.length - 4,
  "集合里也少了那四个人");
toggled = ToggleFilterItem(toggled, "encounter", "transfer", groupIds);
Check(toggled.encounters === null, "开回全集就还原成 null（不限制）");
const catOff = ToggleFilterItem(base, "category", "friendlies");
Check(catOff.categories.friendlies === false
  && BuildOrchestrationFilter(model, layout, catOff).friendlies.size === 0, "类别开关关掉友军");
Check(ToggleFilterItem(soloState, "encounter", "front", groupIds).solo === null, "动了筛选就退出「只看」");

// ---------------------------------------------------------------------------
// 6) 敌军布设表
// ---------------------------------------------------------------------------
const rows = EnemyTableRows(model, layout, null);
Check(rows.length === members.length, `布设表 ${rows.length} 行 = 这一阶段 ${members.length} 个敌人`);
Check(ENEMY_TABLE_COLUMNS.length === 9, "九列");
for (const row of rows) {
  Check(typeof row.group === "string" && row.group.length > 0
    && typeof row.member === "string"
    && typeof row.startText === "string"
    && STATE_LABELS[row.state] === row.stateText
    && typeof row.weaponText === "string" && row.weaponText.length > 0
    && typeof row.traitText === "string" && row.traitText.length > 0
    && Number.isFinite(row.x) && Number.isFinite(row.z)
    && typeof row.routeText === "string"
    && typeof row.liveText === "string",
  `布设表这一行字段齐：${row.member}`);
}
const gunner = rows.find((row) => row.member === "TransferGunner");
Check(gunner.group === "转运区第 1 处威胁" && gunner.stateText === "活跃"
  && gunner.weaponText === "机枪" && gunner.traitText.includes("钉在原地")
  && gunner.spawnText === "113, 80",
  `TransferGunner 这一行：${gunner.group} / ${gunner.stateText} / ${gunner.weaponText} / ${gunner.traitText}`);

// 实时：有 live 才填「实时」列
const liveRows = EnemyTableRows(model, layout, {
  enemies: [{ id: "TransferGunner", alive: false, x: 114.4, z: 79.6, dormant: false }],
});
const dead = liveRows.find((row) => row.member === "TransferGunner");
Check(dead.live?.alive === false && dead.liveText.includes("阵亡") && dead.liveText.includes("114"),
  `实时列写「${dead.liveText}」`);
Check(liveRows.find((row) => row.member === "TransferRifleA").liveText === "", "没实时数据的那几行空着");

// 表按当前筛选联动
const visibleRows = rows.filter((row) => RowVisible(solo, row));
Check(visibleRows.length === 4 && visibleRows.every((row) => row.encounterId === "transfer"),
  `只看 transfer 时表里剩 ${visibleRows.length} 行`);
Check(rows.filter((row) => RowVisible(all, row)).length === rows.length, "不筛时一行不少");

// 排序
const byState = SortEnemyRows(rows, "state", true);
Check(byState.length === rows.length && byState[0].state === "active", "按本阶段状态排，活跃的在最前");
const byMemberDesc = SortEnemyRows(rows, "member", false);
Check(byMemberDesc[0].member >= byMemberDesc[byMemberDesc.length - 1].member, "编号列能倒序");

// CSV
const csv = EnemyTableCsv(rows);
const lines = csv.split("\n");
Check(lines[0] === "组,编号,出现,本阶段,武器,特点,出生点,路线点,实时", `CSV 首行是表头：${lines[0]}`);
Check(lines.length === rows.length + 1, `CSV ${lines.length - 1} 行数据`);
Check(lines[1].split(",").length >= 9 || lines[1].includes("\""), "每行九列（带逗号的字段会加引号）");

// ---------------------------------------------------------------------------
// 7) 说人话：内部叫法不上界面
// ---------------------------------------------------------------------------
const labels = [
  ...summary.categories, ...summary.enemies.groups, ...summary.enemies.states,
  ...summary.enemies.weapons, ...summary.enemies.behaviors, ...summary.friendlies, ...summary.zones,
].map((row) => row.label);
Check(labels.every((label) => typeof label === "string" && label.length > 0), "每一项都有名字");
const jargon = labels.filter((label) => /kind=|拍|encounter|beat|dormant|standby/i.test(label));
assert.deepEqual(jargon, [], `界面用字里混进了内部叫法：${jargon.join(" / ")}`);
checks += 1;
for (const encounter of model.encounters) {
  const label = EncounterLabel(model, encounter);
  Check(label !== encounter.id && label.length > 1, `${encounter.id} 有中文名：${label}`);
}
Check(EncounterLabel(model, "transferAlley") === "转运区第 2 处威胁", "转运区按威胁次序叫");
Check(WeaponLabel("Type11") === "机枪" && WeaponLabel("Type38") === "步枪", "武器说人话");

// 路线名也一样：面板上照搬 flank / ordersRejoin 这类键等于没说。
const routeKeys = Object.keys(model.routes);
const namelessRoutes = routeKeys.filter((name) => !ROUTE_LABELS[name]);
assert.deepEqual(namelessRoutes, [], `这些路线还没有中文名：${namelessRoutes.join(", ")}`);
checks += 1;
Check(RouteLabel("flank") === "侧翼路" && RouteLabel("ordersRejoin") === "接令归队"
  && RouteLabel("pursuit") === "敌军追击路", "路线说人话");
Check(RouteLabel("没这条") === "路线 没这条", "没登记的路线兜底成「路线 <编号>」，不露英文键");
Check(summary.routes.every((row) => row.label === RouteLabel(row.id) && row.code === row.id
  && row.hint.includes(row.id)), "面板的路线行用中文名，编号留在小字与提示里");

// 分组顺序：先按出现阶段、再按名字。写表的顺序不是关卡里发生的顺序。
const groupOrder = summary.enemies.groups.map((row) => row.phaseNumber ?? 99);
Check(groupOrder.every((phase, i) => i === 0 || groupOrder[i - 1] <= phase),
  `分类树按出现阶段排：${groupOrder.join(",")}`);
for (let i = 1; i < summary.enemies.groups.length; i += 1) {
  const before = summary.enemies.groups[i - 1];
  const now = summary.enemies.groups[i];
  if (before.phaseNumber !== now.phaseNumber) continue;
  Check(before.label <= now.label, `同一阶段内按名字排：${before.label} → ${now.label}`);
}
const sortedByGroup = SortEnemyRows(rows, "group", true);
const rowPhases = sortedByGroup.map((row) => row.startPhase ?? 99);
Check(rowPhases.every((phase, i) => i === 0 || rowPhases[i - 1] <= phase),
  "布设表按组排也是先按出现阶段");
Check(sortedByGroup[0].startPhase === Math.min(...rowPhases),
  `第一行是最早出场的那组：${sortedByGroup[0].group}（第 ${sortedByGroup[0].startPhase} 阶段）`);

// 脏输入不许把模型带崩
Check(NormalizeFilterState(null).preset === "all", "空状态补成出厂状态");
Check(NormalizeFilterState({ encounters: ["transfer"] }).encounters.has("transfer"), "数组也能当集合传进来");
Check(BuildOrchestrationFilter(model, layout, { solo: { kind: "沒这种", id: "x" } }).members.size === 0,
  "不认识的「只看」目标 = 什么都不画，而不是抛错");

// 每一阶段都走一遍：别让某一阶段的空名单把面板打崩
for (const phase of model.phases) {
  const each = PhaseLayout(model, phase.number);
  const eachSummary = FilterSummary(model, each, base, { notes: 3 });
  const eachRows = EnemyTableRows(model, each, null);
  assert.equal(eachRows.length, each.encounters.reduce((sum, one) => sum + one.members.length, 0),
    `第 ${phase.number} 阶段布设表行数`);
  assert.equal(eachSummary.enemies.count, eachRows.length, `第 ${phase.number} 阶段敌军计数`);
  assert.equal(eachSummary.notes.count, 3, `第 ${phase.number} 阶段批注条数由外面给`);
  assert.equal(eachSummary.routes.length, RouteNamesFor(model, each).length, `第 ${phase.number} 阶段路线行数`);
}
checks += 4;

console.log(`ok  分类查看纯模型闸门通过：${checks} 项`);
console.log(`    第 ${PHASE} 阶段：${layout.encounters.length} 组 / ${members.length} 人；`
  + `状态 ${summary.enemies.states.length} 种、武器 ${summary.enemies.weapons.length} 类、`
  + `友军 ${summary.friendlies.length} 类、触发区 ${summary.zones.length} 类、路线 ${summary.routes.length} 条`);
console.log(`    布设表 ${rows.length} 行 × ${ENEMY_TABLE_COLUMNS.length} 列，CSV ${csv.length} 字`);
