// 城内 zone / 出生点不许被街坊网格围死 —— 街道重排的守卫。
//
// 用法：node Taierzhuang1938/Script_TengxianZoneTest.mjs
//
// 背景：Data_Battle 的 ZONES / TUNING.spawn 用世界坐标锚在街面上，而街道网
// 由 Data_Tengxian.STREETS 重排过一次（照城防示意图）。zone 落进院落网格里
// 不会有任何测试报错 —— 表现是 HUD 路标指着一堵墙、玩家出生在院子里。
// 这里把「城内 zone 必须落在 街面 / 十字口 / 目的地院落 / 顺城街环带 之一」
// 锁成回归约束；出生点更严：只许 街面 / 十字口。
//
// 与 Script_TengxianLayoutTest 同族：纯数据，不启动 three / 浏览器。

import {
  CITY, CROSSROAD, STREETS, CITY_FEATURES, LANDMARKS,
} from "./Data_Tengxian.mjs";
import { ZONES, PHASES } from "./Data_Battle.mjs";

const failures = [];
let checks = 0;
function check(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}

// 城内 = 顺城街环以内；环带与墙顶的 zone（望楼、上城道）不适用街面规则。
const innerLimit = CITY.wallCenter - CITY.wallBaseWidth / 2 - CITY.innerRingWidth;   // 286
const inInner = (x, z) => Math.abs(x) < innerLimit - 4 && Math.abs(z) < innerLimit - 4;

function onStreet(x, z, margin = 0) {
  for (const s of STREETS) {
    const half = s.width / 2 + margin;
    if (s.axis === "x") {
      if (Math.abs(z - s.at) <= half && x >= s.from - 1 && x <= s.to + 1) return true;
    } else if (Math.abs(x - s.at) <= half && z >= s.from - 1 && z <= s.to + 1) return true;
  }
  return false;
}

function inCrossroad(x, z, margin = 0) {
  const half = CROSSROAD.size / 2 + margin;
  return Math.abs(x - CROSSROAD.x) <= half && Math.abs(z - CROSSROAD.z) <= half;
}

function inFeature(x, z) {
  const rects = [...CITY_FEATURES, ...LANDMARKS].filter((f) => f.w && f.d);
  return rects.some((f) => Math.abs(x - f.x) <= f.w / 2 && Math.abs(z - f.z) <= f.d / 2);
}

for (const zone of Object.values(ZONES)) {
  if (!inInner(zone.x, zone.z)) continue;
  check(onStreet(zone.x, zone.z, 1.2) || inCrossroad(zone.x, zone.z, 2) || inFeature(zone.x, zone.z),
    `ZONES.${zone.id} (${zone.x}, ${zone.z}) 落在城内却不在任何街面/十字口/目的地院落里。`);
}

for (const phase of PHASES) {
  const spawn = phase.spawn;
  if (!spawn || !inInner(spawn.x, spawn.z)) continue;
  check(onStreet(spawn.x, spawn.z, 1.2) || inCrossroad(spawn.x, spawn.z, 2),
    `${phase.id} 的出生点 (${spawn.x}, ${spawn.z}) 在城内却不在街面/十字口上。`);
}

if (failures.length) {
  console.error(`滕县 zone 守卫失败：${failures.length}/${checks}`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`滕县 zone 守卫通过：${checks} 项。`);
