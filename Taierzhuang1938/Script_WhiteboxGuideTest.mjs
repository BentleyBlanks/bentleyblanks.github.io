import assert from "node:assert/strict";
import { CHAPTER as CH1 } from "./Data_MissionCh1.mjs";
import {
  NearestPlayableCorridorPoint,
  EvaluatePlayableBoundary,
  ConstrainPlayablePosition,
  SelectWhiteboxAnnotations,
} from "./Script_WhiteboxGuide.mjs";

const whitebox = CH1.tuning.whitebox;
assert.ok(whitebox, "第一关必须声明白盒引导配置");
assert.ok(whitebox.boundary.points.length >= CH1.zones.length,
  "可玩走廊至少覆盖每一个目标阶段");
assert.equal(whitebox.annotations.length, CH1.zones.length,
  "每一个首关目标阶段都必须有一处场景说明");

for (const zone of CH1.zones) {
  const nearest = NearestPlayableCorridorPoint(zone.x, zone.z, whitebox.boundary);
  assert.ok(nearest && nearest.distance < nearest.halfWidth,
    `${zone.id} 必须落在可玩走廊内`);
}

const spawn = CH1.tuning.spawn;
const inside = EvaluatePlayableBoundary(spawn.x, spawn.z, whitebox.boundary);
assert.equal(inside.hard, false, "出生点不能撞空气墙");

const outside = EvaluatePlayableBoundary(-610, -205, whitebox.boundary);
assert.equal(outside.hard, true, "切片边缘应落在可玩走廊外");
const constrained = ConstrainPlayablePosition(-610, -205, whitebox.boundary);
assert.equal(constrained.constrained, true, "越界位置必须被裁回");
assert.equal(EvaluatePlayableBoundary(constrained.x, constrained.z, whitebox.boundary).hard, false,
  "裁回点必须稳定落在空气墙内");

const selected = SelectWhiteboxAnnotations(
  whitebox.annotations, { x: spawn.x, z: spawn.z }, 0, 3);
assert.ok(selected.length >= 1 && selected.length <= 3, "场景说明不得铺满屏幕");
assert.equal(selected[0].objective, 0, "当前阶段说明必须优先显示");

const firstContact = whitebox.firstContact;
assert.ok(firstContact.atS >= 20 && firstContact.atS <= 30,
  "第一处敌情必须在取得控制 20—30 秒后出现");
assert.ok(firstContact.fullWaveAtS < 60, "第一轮完整交火必须在一分钟内展开");
assert.ok(Math.hypot(firstContact.scout.x - spawn.x, firstContact.scout.z - spawn.z) <= 65,
  "首名侦察兵必须在出生点附近可辨认距离内");

console.log("WhiteboxGuideTest PASS：首关动线、空气墙、说明点与首敌节拍均有效");
