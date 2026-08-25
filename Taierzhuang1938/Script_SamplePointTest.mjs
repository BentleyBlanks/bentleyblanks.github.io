// 采样点表的守卫 —— 纯数据，不启动 three / 浏览器。
//
// 用法：node Taierzhuang1938/Script_SamplePointTest.mjs
//
// 这份测试锁的是**覆盖率**，不是好看不好看：
//   · 城里每一座有名字的建筑（LANDMARKS + 有 label 的 CITY_FEATURES）
//     都必须有一个点位站在它附近、并且镜头大致朝着它；
//   · 每一条街（STREETS）都必须有一个点位压在街面上；
//   · 四座城门内外各一张。
// 于是「城里加了一座新地标 / 街网重排多了一条街」这件事会在这里报出来，
// 而不是等到下一批记录出完、有人对着八十张图数「怎么少了一处」。
//
// 另外还锁位姿口径本身：id 唯一且是合法文件名、点位落在本关 bounds 里、
// 导出的 mjs 片段能被重新解析（编辑器把改动誊回源码时靠它）。

import {
  STREETS, LANDMARKS, CITY_FEATURES, GATES, CITY,
} from "./Data_Tengxian.mjs";
import { SAMPLE_POINTS, SAMPLE_GROUPS } from "./Data_SamplePoints.mjs";
import {
  ValidatePoints, OrderedPoints, SerializePoints, ResolveAll,
} from "./Script_SamplePoints.mjs";

const failures = [];
let checks = 0;
function Check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

const points = ResolveAll();

// --- 一、入表纪律 -----------------------------------------------------------
for (const problem of ValidatePoints()) {
  checks += 1;
  failures.push(problem);
}
Check(points.length > 0, "采样点表是空的");

const names = OrderedPoints().map((point) => point.fileName);
Check(new Set(names).size === names.length, "出图文件名有重复");

for (const group of SAMPLE_GROUPS) {
  Check(points.some((point) => point.group === group.id),
    `分组 ${group.id}（${group.label}）一个点位都没有 —— 要么补点位，要么把分组删掉`);
}

// --- 二、镜头朝向 -----------------------------------------------------------
/** 相机前向（世界）。yaw 口径见 Script_SamplePoints.YawTo。 */
function Forward(point) {
  return { x: -Math.sin(point.yaw), z: -Math.cos(point.yaw) };
}

/** 点位「看得着」目标吗：够近 + 镜头大致朝着它。 */
function Covers(point, target, { radius = 95, halfAngleDeg = 55 } = {}) {
  const dx = target.x - point.x;
  const dz = target.z - point.z;
  const distance = Math.hypot(dx, dz);
  const reach = radius + Math.max(target.w || 0, target.d || 0) / 2;
  if (distance > reach) return false;
  // 站在院子里（比如监狱甬道）那一张，方向不必再判
  if (distance < Math.max(target.w || 0, target.d || 0) / 2) return true;
  const forward = Forward(point);
  const cos = (forward.x * dx + forward.z * dz) / (distance || 1);
  return cos >= Math.cos((halfAngleDeg * Math.PI) / 180);
}

// --- 三、关键建筑覆盖 -------------------------------------------------------
// 无名的通用街坊（kind: compound 且没有 label）不算「关键建筑」，不强制。
const keyBuildings = [
  ...LANDMARKS.map((entry) => ({ ...entry, w: entry.w || 16, d: entry.d || 16 })),
  ...CITY_FEATURES.filter((entry) => entry.label),
];
for (const building of keyBuildings) {
  const covered = points.some((point) => Covers(point, building));
  Check(covered, `关键建筑 ${building.id}${building.label ? `（${building.label}）` : ""}`
    + ` @ (${building.x}, ${building.z}) 没有任何采样点看着它 —— 去 Data_SamplePoints 补一个`);
}

// --- 四、道路覆盖 -----------------------------------------------------------
function OnStreet(point, street, margin = 1.5) {
  const half = street.width / 2 + margin;
  const lo = Math.min(street.from, street.to) - 2;
  const hi = Math.max(street.from, street.to) + 2;
  return street.axis === "x"
    ? Math.abs(point.z - street.at) <= half && point.x >= lo && point.x <= hi
    : Math.abs(point.x - street.at) <= half && point.z >= lo && point.z <= hi;
}
for (const street of STREETS) {
  Check(points.some((point) => OnStreet(point, street)),
    `道路 ${street.id}（${street.label}）上没有采样点 —— 城内外的路都要有点位`);
}

// --- 五、城门内外各一张 -----------------------------------------------------
const wallFoot = CITY.wallCenter + CITY.wallBaseWidth / 2;   // 310
for (const gate of GATES) {
  const near = points.filter((point) => Math.hypot(point.x - gate.x, point.z - gate.z) < 90);
  const outward = (point) => (point.x - gate.x) * gate.outward[0] + (point.z - gate.z) * gate.outward[1];
  Check(near.some((point) => outward(point) > 0 && Math.max(Math.abs(point.x), Math.abs(point.z)) > wallFoot),
    `${gate.id} 门（${gate.name}）缺一张濠外的点位`);
  Check(near.some((point) => outward(point) < 0),
    `${gate.id} 门（${gate.name}）缺一张城里的点位`);
}

// --- 六、导出的片段能被重新解析 ---------------------------------------------
// 编辑器改完点位是靠「导出 mjs 片段 → 誊回源码」落盘的。片段语法一旦坏掉，
// 那条路就断了，而断掉的表现是有人把一段坏代码粘进 Data_SamplePoints。
{
  const fragment = SerializePoints(SAMPLE_POINTS);
  let parsed = null;
  try {
    // eslint-disable-next-line no-new-func
    parsed = new Function(`${fragment.replace("export const SAMPLE_POINTS =", "return")}`)();
  } catch (error) {
    parsed = null;
    failures.push(`导出的 mjs 片段解析不了：${String(error).slice(0, 160)}`);
  }
  checks += 1;
  Check(Array.isArray(parsed) && parsed.length === SAMPLE_POINTS.length,
    "导出的 mjs 片段点位数量对不上");
  if (Array.isArray(parsed)) {
    const before = OrderedPoints().map((point) => point.id).sort().join(",");
    const after = OrderedPoints(parsed).map((point) => point.id).sort().join(",");
    Check(before === after, "导出再解析之后 id 集合变了");
  }
}

if (failures.length) {
  console.error(`采样点守卫失败：${failures.length}/${checks}`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`采样点守卫通过：${checks} 项 · ${points.length} 个点位`
  + ` · ${keyBuildings.length} 座关键建筑 · ${STREETS.length} 条街全覆盖。`);
