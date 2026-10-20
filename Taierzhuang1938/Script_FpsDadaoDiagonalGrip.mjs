// 大刀斜握：把两只手的掌框绕「掌轴 × 刀柄轴」转到指定的斜握角，位置与手指不动。
//
// 斜握角 = 掌轴（腕 → 指根，握点坐标系 +Z）朝刀身方向（武器局部 -Z）倾斜的角度。
// 刀柄横在掌心正中垂直于掌轴时为 0°；真实刀握法里刀柄斜贴掌心，掌轴朝刀身倾。
// 30° 是这把刀能放下两只手的上限：可握长度约 20 cm，一只手沿柄占 7.2 cm ÷ cos(θ) + 1.8 cm。
// 只改朝向，可重复执行（按当前倾角补到目标角）。手指随后用
// _blender/Script_FpsDadaoDiagonalGripFit.py 按新掌框重拟。
//
// 用法：node Taierzhuang1938/Script_FpsDadaoDiagonalGrip.mjs [--degrees=30] [--dry-run]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as THREE from "./vendor/three/build/three.module.js";

const project = path.dirname(fileURLToPath(import.meta.url));
const file = path.join(project, "Data_FpsWeaponGrips.mjs");
const degrees = Number(process.argv.find((arg) => arg.startsWith("--degrees="))?.slice(10) ?? 30);
if (!Number.isFinite(degrees) || degrees < 0 || degrees > 40) throw new Error(`斜握角超出 0–40°：${degrees}`);
const text = fs.readFileSync(file, "utf8");
const marker = "export const FPS_WEAPON_GRIPS = FreezeTree(";
const start = text.indexOf(marker) + marker.length;
const end = text.lastIndexOf(");");
const config = JSON.parse(text.slice(start, end));

const blade = new THREE.Vector3(0, 0, -1);
const report = {};
for (const side of ["right", "left"]) {
  const contact = config.Dadao[side];
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...contact.rotation, "YXZ"));
  const hand = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
  const before = THREE.MathUtils.radToDeg(Math.asin(THREE.MathUtils.clamp(hand.dot(blade), -1, 1)));
  const axis = new THREE.Vector3().crossVectors(hand, blade).normalize();
  q.premultiply(new THREE.Quaternion().setFromAxisAngle(axis, THREE.MathUtils.degToRad(degrees - before)));
  const euler = new THREE.Euler().setFromQuaternion(q, "YXZ");
  contact.rotation = [euler.x, euler.y, euler.z].map((value) => +value.toFixed(12));
  const after = THREE.MathUtils.radToDeg(Math.asin(new THREE.Vector3(0, 0, 1).applyQuaternion(q).dot(blade)));
  report[side] = { beforeDeg: +before.toFixed(3), afterDeg: +after.toFixed(3), rotation: contact.rotation };
}
if (!process.argv.includes("--dry-run")) {
  fs.writeFileSync(file, text.slice(0, start) + JSON.stringify(config) + text.slice(end));
}
console.log(JSON.stringify({ degrees, written: !process.argv.includes("--dry-run"), report }, null, 1));
