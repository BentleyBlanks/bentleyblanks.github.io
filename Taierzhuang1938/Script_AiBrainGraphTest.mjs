// ===========================================================================
// Script_AiBrainGraphTest.mjs —— 行为图与代码的一致性闸门（纯 Node，毫秒级）
//
// `Data_AiBrainGraph` 是一张**抄来的**表：抄的是 `Script_Ai.Think` 的判定梯、
// `Script_AiTactics.TASK` 的任务集合、五张调参表的键。抄来的东西会过期 ——
// 加一个状态、改一个键名、删一条任务，图上不会自己变，编辑器就开始画一张
// 与实际跑的 AI 不一样的图。那比没有图更糟：设计师会照着它调数。
//
// 所以这一层逐条对账（docs/Data_EnemyAi.md §14.3）：
//   ① 节点集合 **==** `Script_Ai.STATE` 的值集合（多一个少一个都红）；
//   ② 每条边的两端都是真节点，`priority` / `when` / `keys` 都在；
//   ③ 每个 `keys` 都能按「导出名.路径」在五张表里解析到一个**有限数或布尔**；
//   ④ `tasks` == `Script_AiTactics.TASK` 的值集合；
//   ⑤ `keyOwners` 覆盖所有用到的导出名，且那个名字真的在那个文件里导出；
//   ⑥ `x` / `y` 在 0–1，id 不重复，`group` 在约定的五个里，`phases` 的键是真状态。
//
// **为什么 STATE 是正则抓源码文本**：`Script_Ai.mjs` import 了 three，纯 Node
// 里 import 它会连着把整条渲染链拉进来（而且 three 不在 node_modules 的解析路径上）。
// 这一层要的只是那张字符串表 —— 读源码比把 AI 主文件拆成两个模块便宜得多。
//
// 跑法：node Taierzhuang1938/Script_AiBrainGraphTest.mjs
//   或：node Taierzhuang1938/Script_TestRunner.mjs --only=AiBrainGraphTest
// ===========================================================================

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { BRAIN_GRAPH } from "./Data_AiBrainGraph.mjs";
import { TASK } from "./Script_AiTactics.mjs";
import * as TuningAi from "./Data_Tuning_Ai.mjs";
import * as TuningAiCover from "./Data_Tuning_AiCover.mjs";
import * as TuningAiPerception from "./Data_Tuning_AiPerception.mjs";
import * as TuningAiShooting from "./Data_Tuning_AiShooting.mjs";
import * as TuningAiTactics from "./Data_Tuning_AiTactics.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));

let checks = 0;
function Check(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

const TABLES = {
  Data_Tuning_Ai: TuningAi,
  Data_Tuning_AiCover: TuningAiCover,
  Data_Tuning_AiPerception: TuningAiPerception,
  Data_Tuning_AiShooting: TuningAiShooting,
  Data_Tuning_AiTactics: TuningAiTactics,
};
const GROUPS = new Set(["move", "combat", "react", "script", "terminal"]);

// ------------------------------------------------------- ① 节点 == STATE
// `const STATE = { IDLE: "idle", … };` —— 只抓这一个声明，逐个取字符串值。
const aiSource = fs.readFileSync(path.join(projectDir, "Script_Ai.mjs"), "utf8");
const stateBlock = /\nconst STATE = \{([\s\S]*?)\n\};/.exec(aiSource);
Check(!!stateBlock, "Script_Ai.mjs 里找得到 `const STATE = { … };`（改了写法要同步改这条闸门）");
const stateValues = new Set();
for (const match of stateBlock[1].matchAll(/\b[A-Z][A-Z0-9_]*\s*:\s*"([a-z_]+)"/g)) stateValues.add(match[1]);
Check(stateValues.size >= 16, `STATE 至少抓到 16 个值（实际 ${stateValues.size}）`);

const nodes = BRAIN_GRAPH.states;
Check(Array.isArray(nodes) && nodes.length > 0, "states 是非空数组");
const nodeIds = new Set();
for (const node of nodes) {
  Check(typeof node.id === "string" && node.id.length > 0, "每个节点都有 id");
  Check(!nodeIds.has(node.id), `节点 id 不重复：${node.id}`);
  nodeIds.add(node.id);
}
for (const value of stateValues) {
  Check(nodeIds.has(value), `STATE 的每个值都有节点：缺 "${value}"`);
}
for (const id of nodeIds) {
  Check(stateValues.has(id), `节点不许多出来（Script_Ai.STATE 里没有 "${id}"）`);
}
Check(nodeIds.size === stateValues.size, `节点数 == STATE 值数（${nodeIds.size} vs ${stateValues.size}）`);
console.log(`ok  ① 节点集合 == Script_Ai.STATE（${nodeIds.size} 个）`);

// ------------------------------------------------------------- ⑥ 节点字段
for (const node of nodes) {
  Check(typeof node.label === "string" && node.label.length > 0, `${node.id} 有中文短名`);
  Check(GROUPS.has(node.group), `${node.id} 的 group 在约定的五个里（实际 "${node.group}"）`);
  Check(typeof node.desc === "string" && node.desc.length >= 8, `${node.id} 有一句话说明 Act 里做什么`);
  Check(Number.isFinite(node.x) && node.x >= 0 && node.x <= 1, `${node.id} 的 x 在 0–1`);
  Check(Number.isFinite(node.y) && node.y >= 0 && node.y <= 1, `${node.id} 的 y 在 0–1`);
}
// 同一格上叠两个节点等于画不出来。
const seats = new Set();
for (const node of nodes) {
  const seat = `${node.x.toFixed(3)}/${node.y.toFixed(3)}`;
  Check(!seats.has(seat), `${node.id} 的布局坐标不与别人重合（${seat}）`);
  seats.add(seat);
}
console.log("ok  ⑥ 节点字段齐全、分组合法、布局坐标在 0–1 且不重合");

// ------------------------------------------------------- ②③ 边与它读的键
/** 按「导出名.路径」在五张表里解析一个键；解析不到返回 undefined。 */
function ResolveKey(key) {
  const parts = String(key).split(".");
  const owner = BRAIN_GRAPH.keyOwners[parts[0]];
  if (!owner) return undefined;
  const table = TABLES[owner];
  if (!table) return undefined;
  let value = table[parts[0]];
  for (let i = 1; i < parts.length; i += 1) {
    if (value === null || value === undefined) return undefined;
    value = value[parts[i]];
  }
  return value;
}

const usedOwners = new Set();
let edgeKeyCount = 0;
Check(Array.isArray(BRAIN_GRAPH.edges) && BRAIN_GRAPH.edges.length > 0, "edges 是非空数组");
for (const edge of BRAIN_GRAPH.edges) {
  const tag = `${edge.from}→${edge.to}`;
  Check(nodeIds.has(edge.from), `边的起点存在：${tag}`);
  Check(nodeIds.has(edge.to), `边的终点存在：${tag}`);
  Check(typeof edge.when === "string" && edge.when.length >= 4, `${tag} 写了人话触发条件`);
  Check(Number.isFinite(edge.priority) && edge.priority >= 0, `${tag} 有 priority（小的先判）`);
  Check(Array.isArray(edge.keys), `${tag} 的 keys 是数组（读不到表的判据写空数组，那是取证不是漏写）`);
  if (edge.global !== undefined) Check(typeof edge.global === "boolean", `${tag} 的 global 是布尔`);
  for (const key of edge.keys) {
    edgeKeyCount += 1;
    const value = ResolveKey(key);
    Check(typeof value === "number" ? Number.isFinite(value) : typeof value === "boolean",
      `${tag} 的键解析得到一个有限数或布尔：${key} → ${String(value)}`);
    usedOwners.add(String(key).split(".")[0]);
  }
}
console.log(`ok  ②③ ${BRAIN_GRAPH.edges.length} 条边两端都在、${edgeKeyCount} 个表键全部解析得到数/布尔`);

// 判定梯的顺序要是全的：主状态机那一段（8–17）每一级都得有边，
// 少一级说明抄漏了一条分支。
const priorities = new Set(BRAIN_GRAPH.edges.map((edge) => edge.priority));
for (let p = 8; p <= 17; p += 1) Check(priorities.has(p), `主状态机第 ${p} 级判定有对应的边`);
console.log("ok  ②  主状态机 8–17 级判定每一级都有边");

// ------------------------------------------------------------- ④ tasks
const taskValues = new Set(Object.values(TASK));
const taskIds = new Set();
for (const task of BRAIN_GRAPH.tasks) {
  Check(typeof task.id === "string" && task.id.length > 0, "每个任务都有 id");
  Check(typeof task.label === "string" && task.label.length > 0, `${task.id} 有中文短名`);
  Check(!taskIds.has(task.id), `任务 id 不重复：${task.id}`);
  taskIds.add(task.id);
}
for (const value of taskValues) Check(taskIds.has(value), `TASK 的每个值都在 tasks 里：缺 "${value}"`);
for (const id of taskIds) Check(taskValues.has(id), `tasks 不许多出来（TASK 里没有 "${id}"）`);
console.log(`ok  ④ tasks == Script_AiTactics.TASK（${taskIds.size} 个）`);

// --------------------------------------------------------- ⑤ keyOwners
for (const [name, file] of Object.entries(BRAIN_GRAPH.keyOwners)) {
  const table = TABLES[file];
  Check(!!table, `keyOwners 指向的是五张表之一：${name} → ${file}`);
  Check(fs.existsSync(path.join(projectDir, `${file}.mjs`)), `${file}.mjs 真的在`);
  Check(Object.prototype.hasOwnProperty.call(table, name), `${file}.mjs 真的导出了 ${name}`);
}
for (const owner of usedOwners) {
  Check(BRAIN_GRAPH.keyOwners[owner] !== undefined, `用到的导出名都在 keyOwners 里：缺 ${owner}`);
}
// 反过来也要全：编辑器的「调参」分节要能把**任意**一个叶子存回它自己的文件，
// 所以五张表的每一个导出名都得登记。
for (const [file, table] of Object.entries(TABLES)) {
  for (const name of Object.keys(table)) {
    Check(BRAIN_GRAPH.keyOwners[name] === file, `${file} 的导出 ${name} 已登记进 keyOwners`);
  }
}
console.log(`ok  ⑤ keyOwners 覆盖五张表的全部 ${Object.keys(BRAIN_GRAPH.keyOwners).length} 个导出名，用到的 ${usedOwners.size} 个都在`);

// ------------------------------------------------------------- 相位
for (const [state, list] of Object.entries(BRAIN_GRAPH.phases)) {
  Check(nodeIds.has(state), `phases 的键是真状态：${state}`);
  Check(Array.isArray(list) && list.length > 0, `${state} 的相位是非空数组`);
  for (const phase of list) Check(typeof phase === "string" && phase.length > 0, `${state} 的相位名是字符串`);
}
Check((BRAIN_GRAPH.phases.cover_engage || []).join(",") === "approach,hide,peek",
  "cover_engage 的相位就是 approach → hide → peek（COVER_CYCLE 的三格）");
console.log("ok  相位表的键都是真状态，cover_engage 三相齐");

// ------------------------------------------------------------- 冻结
Check(Object.isFrozen(BRAIN_GRAPH), "BRAIN_GRAPH 是冻的（纯数据，编辑器不许就地改行为图）");
Check(Object.isFrozen(BRAIN_GRAPH.states) && Object.isFrozen(BRAIN_GRAPH.edges), "states / edges 也是冻的");
console.log("ok  BRAIN_GRAPH 整体冻结");

console.log(`\nAiBrainGraphTest 通过：${checks} 条断言`
  + `（节点 ${nodeIds.size}、边 ${BRAIN_GRAPH.edges.length}、表键 ${edgeKeyCount}、任务 ${taskIds.size}）`);
