// 外部模型朝向闸（纯 Node，秒级）。AGENTS 硬规矩 4：车头与机首一律局部 -Z。
//
// 为什么要有这一道：三架飞机 GLB 和九五式的 tzm 曾经倒着摆了几个月——模型载入了、
// 挂点也在 -Z、所有测试都绿，只有几何本身朝反。人眼在 165 m 高空和白盒远景里
// 看不出来。所以这里不信任何声明，直接拿顶点云量：
//   飞机：XZ 面主轴 + 两条独立判据（尾翼端比机头端宽；机翼质心偏向机头端）
//         得出机首方向，再核对 Data_AircraftAssets.noseDir 对齐后落在 -Z。
//   战车：挂点在 -Z；有 steel 炮管桶的看炮管质心；单体网格按 Data_Meshes.facing
//         登记的轮廓证据（前高后低）。两样都没有直接红——新战车必须登记证据。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LoadGlb, ReadAccessor } from "./_import/Script_LugouGlbPose.mjs";
import { AIRCRAFT_ASSETS, NoseYaw } from "./Data_AircraftAssets.mjs";
import { MESHES } from "./Data_Meshes.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const TOLERANCE_DEG = 12;
let failed = 0;
const Check = (ok, label, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `  ${detail}` : ""}`);
};

// ---- glTF 场景展开成世界坐标点云 --------------------------------------------
function Mat4Mul(a, b) {
  const o = new Float64Array(16);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}
function NodeMatrix(node) {
  if (node.matrix) return Float64Array.from(node.matrix);
  const t = node.translation || [0, 0, 0], q = node.rotation || [0, 0, 0, 1], s = node.scale || [1, 1, 1];
  const [x, y, z, w] = q, xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  return Float64Array.from([
    (1 - 2 * (yy + zz)) * s[0], 2 * (xy + wz) * s[0], 2 * (xz - wy) * s[0], 0,
    2 * (xy - wz) * s[1], (1 - 2 * (xx + zz)) * s[1], 2 * (yz + wx) * s[1], 0,
    2 * (xz + wy) * s[2], 2 * (yz - wx) * s[2], (1 - 2 * (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ]);
}
function GlbPoints(file) {
  const glb = LoadGlb(file), g = glb.json, points = [];
  const identity = Float64Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const Walk = (index, parent) => {
    const node = g.nodes[index], m = Mat4Mul(parent, NodeMatrix(node));
    if (node.mesh !== undefined) {
      for (const prim of g.meshes[node.mesh].primitives) {
        const acc = ReadAccessor(glb, prim.attributes.POSITION);
        for (let k = 0; k < acc.count; k++) {
          const x = acc.data[k * 3], y = acc.data[k * 3 + 1], z = acc.data[k * 3 + 2];
          points.push([m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]);
        }
      }
    }
    for (const child of node.children || []) Walk(child, m);
  };
  for (const root of g.scenes[g.scene || 0].nodes) Walk(root, identity);
  return points;
}

/**
 * 量一架飞机的机首方向（局部 XZ 单位向量）。返回 null 表示两条判据打架，
 * 那就不是这套启发式能判的模型，得人工登记别的证据。
 */
function MeasureNose(points) {
  let mx = 0, mz = 0;
  for (const p of points) { mx += p[0]; mz += p[2]; }
  mx /= points.length; mz /= points.length;
  let sxx = 0, sxz = 0, szz = 0;
  for (const p of points) { const x = p[0] - mx, z = p[2] - mz; sxx += x * x; sxz += x * z; szz += z * z; }
  // 机身是最长的那一根：主轴取 XZ 协方差的大特征向量。
  const theta = 0.5 * Math.atan2(2 * sxz, sxx - szz);
  const ux = Math.cos(theta), uz = Math.sin(theta);
  let lo = Infinity, hi = -Infinity;
  const along = points.map((p) => { const t = (p[0] - mx) * ux + (p[2] - mz) * uz; lo = Math.min(lo, t); hi = Math.max(hi, t); return t; });
  const side = points.map((p) => -(p[0] - mx) * uz + (p[2] - mz) * ux);
  // 端片只取 6%：Ki-43 的螺旋桨盘后面紧跟着起落架，片取厚了机头端会比平尾还宽。
  const length = hi - lo, endSlab = length * 0.06;
  const Width = (pred) => { let a = Infinity, b = -Infinity; points.forEach((_, i) => { if (pred(along[i])) { a = Math.min(a, side[i]); b = Math.max(b, side[i]); } }); return b - a; };
  const widthLo = Width((t) => t < lo + endSlab), widthHi = Width((t) => t > hi - endSlab);
  // 判据一：尾翼端（平尾）比机头端（发动机罩 / 螺旋桨盘）宽。
  const noseByWidth = widthLo < widthHi ? -1 : 1;
  // 判据二：机翼（离机身最远的那些点）质心偏向机头端。
  let maxSide = 0; for (const s of side) maxSide = Math.max(maxSide, Math.abs(s));
  let wingSum = 0, wingCount = 0;
  points.forEach((_, i) => { if (Math.abs(side[i]) > maxSide * 0.45) { wingSum += along[i]; wingCount++; } });
  const noseByWing = wingSum / Math.max(1, wingCount) > (lo + hi) * 0.5 ? 1 : -1;
  if (noseByWidth !== noseByWing) return null;
  return { x: ux * noseByWidth, z: uz * noseByWidth, agree: true, widthLo, widthHi, length, wingspan: maxSide * 2 };
}

const Heading = (x, z) => Math.atan2(x, z);
const AngleErrorDeg = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b))) * 180 / Math.PI;

console.log("== 飞机 GLB ==");
for (const spec of AIRCRAFT_ASSETS) {
  const file = path.join(projectDir, spec.url.replace(/^\.\//, "").replace(/\?.*$/, ""));
  Check(fs.existsSync(file), `${spec.id} 模型存在`, file);
  if (!fs.existsSync(file)) continue;
  Check(!!spec.noseDir && Number.isFinite(spec.noseDir.x) && Number.isFinite(spec.noseDir.z), `${spec.id} 登记了 noseDir`);
  const measured = MeasureNose(GlbPoints(file));
  Check(!!measured, `${spec.id} 两条机首判据一致（尾翼端更宽 / 机翼偏向机头）`);
  if (!measured || !spec.noseDir) continue;
  const declaredError = AngleErrorDeg(Heading(measured.x, measured.z), Heading(spec.noseDir.x, spec.noseDir.z));
  Check(declaredError < TOLERANCE_DEG, `${spec.id} noseDir 与顶点云实测一致`,
    `实测 (${measured.x.toFixed(3)}, ${measured.z.toFixed(3)}) 登记 (${spec.noseDir.x}, ${spec.noseDir.z}) 差 ${declaredError.toFixed(1)}°`);
  // 对齐后的机首必须落在局部 -Z（航向 π）：这才是运行时真正用的量。
  const aligned = Heading(measured.x, measured.z) + NoseYaw(spec.noseDir);
  const alignedError = AngleErrorDeg(aligned, Math.PI);
  Check(alignedError < TOLERANCE_DEG, `${spec.id} 对齐后机首朝 -Z`, `差 ${alignedError.toFixed(1)}°，翼展 ${measured.wingspan.toFixed(1)} m，机长 ${measured.length.toFixed(1)} m`);
}

// ---- 战车 tzm --------------------------------------------------------------
function TzmWorldOffset(doc, index) {
  let x = 0, y = 0, z = 0;
  for (let i = index; i >= 0; i = doc.nodes[i].parent) { x += doc.nodes[i].t[0]; y += doc.nodes[i].t[1]; z += doc.nodes[i].t[2]; }
  return { x, y, z };
}
function TzmMeshPoints(doc, meshIndex) {
  const block = doc.meshes[meshIndex];
  const owner = doc.nodes.findIndex((node) => (node.meshes || []).includes(meshIndex));
  const offset = TzmWorldOffset(doc, owner);
  const bytes = Buffer.from(block.pos, "base64");
  const q = new Uint16Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 2);
  const points = new Array(block.count);
  for (let k = 0; k < block.count; k++) {
    points[k] = [block.posMin[0] + q[k * 3] * block.posScale[0] + offset.x,
      block.posMin[1] + q[k * 3 + 1] * block.posScale[1] + offset.y,
      block.posMin[2] + q[k * 3 + 2] * block.posScale[2] + offset.z];
  }
  return points;
}

console.log("== 战车 tzm ==");
for (const [id, entry] of Object.entries(MESHES)) {
  if (entry.category !== "vehicle") continue;
  const file = path.join(projectDir, "Model", entry.file);
  Check(fs.existsSync(file), `${id} 模型存在`, entry.file);
  if (!fs.existsSync(file)) continue;
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  Check(doc.axis === "Y-up, -Z forward", `${id} 声明 -Z 车头`, doc.axis);
  const Mount = (name) => { const i = doc.nodes.findIndex((n) => n.name === name); return i < 0 ? null : TzmWorldOffset(doc, i); };
  const gun = Mount("gunMuzzle"), front = Mount("hullFront"), rear = Mount("rearMgMuzzle");
  Check(!!gun && gun.z < 0, `${id} gunMuzzle 挂点在 -Z`, gun ? gun.z.toFixed(2) : "缺挂点");
  Check(!!front && front.z < 0, `${id} hullFront 挂点在 -Z`, front ? front.z.toFixed(2) : "缺挂点");
  // 八九式炮塔偏前，塔后机枪的世界 z 可以是负的；它只须在炮口后面。
  if (rear && gun) Check(rear.z > gun.z, `${id} rearMgMuzzle 在 gunMuzzle 之后`, `${rear.z.toFixed(2)} > ${gun.z.toFixed(2)}`);
  // 几何本身：挂点是人写的约定，车壳才是玩家看见的东西。
  const steel = doc.meshes.map((m, i) => [m, i]).filter(([m]) => m.material === "steel");
  if (steel.length) {
    for (const [, i] of steel) {
      const points = TzmMeshPoints(doc, i);
      const cz = points.reduce((sum, p) => sum + p[2], 0) / points.length;
      Check(cz < 0, `${id} 炮管（steel 桶 ${i}）质心在 -Z`, cz.toFixed(2));
    }
  } else if (entry.facing) {
    const { probeZ, frontHigherByM } = entry.facing;
    let frontTop = -Infinity, rearTop = -Infinity;
    for (let i = 0; i < doc.meshes.length; i++) {
      for (const p of TzmMeshPoints(doc, i)) {
        if (Math.abs(p[0]) > 1.0 || Math.abs(Math.abs(p[2]) - probeZ) > 0.25) continue;
        if (p[2] < 0) frontTop = Math.max(frontTop, p[1]); else rearTop = Math.max(rearTop, p[1]);
      }
    }
    Check(frontTop - rearTop >= frontHigherByM, `${id} 车体轮廓前高后低（z=∓${probeZ}）`,
      `前 ${frontTop.toFixed(2)} m / 后 ${rearTop.toFixed(2)} m，要求相差 ≥ ${frontHigherByM} m`);
  } else {
    Check(false, `${id} 没有可复量的朝向证据`, "要么有 steel 炮管桶，要么在 Data_Meshes 登记 facing");
  }
}

// 导入脚本：单体网格没有炮管可探，必须显式声明源车头。
const importer = fs.readFileSync(path.join(projectDir, "_blender", "ImportVehicles.py"), "utf8");
const singleBodies = (importer.match(/"singleBody":\s*True/g) || []).length;
const declaredNoses = (importer.match(/"sourceNose":\s*"[+-]Y"/g) || []).length;
Check(declaredNoses >= singleBodies, "ImportVehicles 每个 singleBody 源件都声明了 sourceNose", `${declaredNoses}/${singleBodies}`);

if (failed) { console.log(`FAIL ModelFacingTest: ${failed} 项`); process.exit(1); }
console.log("PASS ModelFacingTest: 飞机机首与战车车头全部按几何复量落在 -Z");
