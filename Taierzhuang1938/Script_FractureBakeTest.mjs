// 离线预破碎数据的纯 Node 冒烟。
// 用法：node Taierzhuang1938/Script_FractureBakeTest.mjs

import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  FRACTURE_BAKE_SIGNATURE, FRACTURE_PATTERNS, FRACTURE_SEGMENT_COUNT,
} from "./Data_FracturePatterns.mjs";

const results = [];
function Check(name, ok, detail = "") {
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`);
}

function PolygonArea(points) {
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const next = points[(index + 1) % points.length];
    area += points[index][0] * next[1] - next[0] * points[index][1];
  }
  return Math.abs(area) * 0.5;
}

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const deterministic = spawnSync(process.execPath,
  [path.join(moduleDir, "Script_FractureBake.mjs"), "--check"], { encoding: "utf8" });
Check("生成数据与固定种子完全一致", deterministic.status === 0,
  deterministic.status === 0 ? FRACTURE_BAKE_SIGNATURE : deterministic.stderr.trim());
Check("提供六组十二边预破碎轮廓", FRACTURE_PATTERNS.length === 6
  && FRACTURE_PATTERNS.every((pattern) => pattern.radii.length === FRACTURE_SEGMENT_COUNT),
`patterns=${FRACTURE_PATTERNS.length} segments=${FRACTURE_SEGMENT_COUNT}`);

for (const pattern of FRACTURE_PATTERNS) {
  const directions = pattern.radii.map((radius, index) =>
    Math.sign(pattern.radii[(index + 1) % pattern.radii.length] - radius));
  const turns = directions.filter((direction, index) =>
    direction !== directions[(index + directions.length - 1) % directions.length]).length;
  const outline = pattern.radii.map((radius, index) => {
    const angle = pattern.angleOffset + index * Math.PI * 2 / FRACTURE_SEGMENT_COUNT;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius];
  });
  const fragmentArea = pattern.fragments.reduce((sum, fragment) => sum + PolygonArea(
    fragment.points.map((point) => [point[0] + fragment.anchor[0], point[1] + fragment.anchor[1]])), 0);
  const outlineArea = PolygonArea(outline);
  Check(`${pattern.id} 不是规则矩形或规则圆`, turns >= 4
    && Math.max(...pattern.radii) - Math.min(...pattern.radii) >= 0.08,
  `方向变化=${turns} 幅差=${(Math.max(...pattern.radii) - Math.min(...pattern.radii)).toFixed(3)}`);
  Check(`${pattern.id} 三十六块可拼回完整缺口`, pattern.fragments.length === 36
    && Math.abs(fragmentArea - outlineArea) <= 0.0015,
  `pieces=${pattern.fragments.length} areaΔ=${Math.abs(fragmentArea - outlineArea).toFixed(5)}`);
  Check(`${pattern.id} 物理代理受控`, pattern.physicsRects.length >= 5
    && pattern.physicsRects.length <= 9,
  `rects=${pattern.physicsRects.length}`);
}

const failed = results.filter((result) => !result.ok);
if (failed.length) {
  console.error(`\n离线预破碎冒烟失败：${failed.length} 项`);
  process.exit(1);
}
console.log("\n离线预破碎模板冒烟全过。");
