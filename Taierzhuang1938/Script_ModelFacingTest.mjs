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
import { STRAW_SLEEPING_MAT_ASSETS } from "./Data_StrawSleepingMat.mjs";
import { KAWASAKI_TYPE88_ASSET } from "./Data_KawasakiType88.mjs";
import { CLOTH_LAB_ASSETS } from "./Data_Tuning_ClothRange.mjs";

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
function GlbPoints(file, meshName = null) {
  const glb = LoadGlb(file), g = glb.json, points = [];
  const identity = Float64Array.from([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  const Walk = (index, parent) => {
    const node = g.nodes[index], m = Mat4Mul(parent, NodeMatrix(node));
    if (node.mesh !== undefined && (!meshName || node.name === meshName)) {
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

// Skinned bind coordinates must include jointWorld * inverseBind. Applying
// meshNodeWorld alone counts an armature placement twice for Blender exports.
function RiggedGlbPoints(file,meshName,boneName=null){
  const glb=LoadGlb(file),g=glb.json,world=new Map(),points=[];
  const identity=Float64Array.from([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]);
  const Visit=(index,parent)=>{const matrix=Mat4Mul(parent,NodeMatrix(g.nodes[index]));world.set(index,matrix);for(const child of g.nodes[index].children||[])Visit(child,matrix)};
  for(const root of g.scenes[g.scene||0].nodes)Visit(root,identity);
  for(const [index,node] of g.nodes.entries()){
    if(node.mesh===undefined||node.name!==meshName)continue;
    const skin=g.skins[node.skin],inverse=ReadAccessor(glb,skin.inverseBindMatrices);
    const matrices=skin.joints.map((joint,i)=>Mat4Mul(world.get(joint),inverse.data.slice(i*16,i*16+16)));
    for(const primitive of g.meshes[node.mesh].primitives){
      const positions=ReadAccessor(glb,primitive.attributes.POSITION),joints=ReadAccessor(glb,primitive.attributes.JOINTS_0),weights=ReadAccessor(glb,primitive.attributes.WEIGHTS_0);
      const accessor=g.accessors[primitive.attributes.WEIGHTS_0],divisor=accessor.normalized?(accessor.componentType===5121?255:65535):1;
      for(let i=0;i<positions.count;i++){
        const p=[0,0,0];let selected=0;
        for(let c=0;c<4;c++){
          const joint=joints.data[i*4+c],weight=weights.data[i*4+c]/divisor,m=matrices[joint];
          if(!weight)continue;
          if(g.nodes[skin.joints[joint]].name===boneName)selected+=weight;
          const x=positions.data[i*3],y=positions.data[i*3+1],z=positions.data[i*3+2];
          for(let axis=0;axis<3;axis++)p[axis]+=weight*(m[axis]*x+m[4+axis]*y+m[8+axis]*z+m[12+axis]);
        }
        if(!boneName||selected>.75)points.push(p);
      }
    }
  }
  return points;
}

/**
 * 量一架飞机的机首方向（局部 XZ 单位向量）。返回 null 表示两条判据打架，
 * 那就不是这套启发式能判的模型，得人工登记别的证据。
 */
function MeasureNose(points, axisPoints = points) {
  let mx = 0, mz = 0;
  for (const p of points) { mx += p[0]; mz += p[2]; }
  mx /= points.length; mz /= points.length;
  let axisMx = 0, axisMz = 0;
  for (const p of axisPoints) { axisMx += p[0]; axisMz += p[2]; }
  axisMx /= axisPoints.length; axisMz /= axisPoints.length;
  let sxx = 0, sxz = 0, szz = 0;
  for (const p of axisPoints) { const x = p[0] - axisMx, z = p[2] - axisMz; sxx += x * x; sxz += x * z; szz += z * z; }
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
for (const spec of [...AIRCRAFT_ASSETS, KAWASAKI_TYPE88_ASSET]) {
  const file = path.join(projectDir, spec.url.replace(/^\.\//, "").replace(/\?.*$/, ""));
  Check(fs.existsSync(file), `${spec.id} 模型存在`, file);
  if (!fs.existsSync(file)) continue;
  Check(!!spec.noseDir && Number.isFinite(spec.noseDir.x) && Number.isFinite(spec.noseDir.z), `${spec.id} 登记了 noseDir`);
  // A wide-span biplane's full-cloud PCA follows the wings. Its separate
  // fuselage supplies the measured long axis; both independent nose-sign
  // checks still use the complete exported vertex cloud.
  const axisPoints = spec.fuselageMesh ? GlbPoints(file, spec.fuselageMesh) : undefined;
  if (spec.fuselageMesh) Check(axisPoints.length > 100, `${spec.id} 独立机身顶点云存在`, `${axisPoints.length} points`);
  const measured = MeasureNose(GlbPoints(file), axisPoints);
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
  const steel = doc.meshes.map((m, i) => [m, i]).filter(([m]) => ["steel", "type89Barrel"].includes(m.material));
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

// The loading display / actor use TZM; the held and thrown prop use GLB.
// Measure both finished payloads so a glTF axis conversion cannot silently diverge.
const grenadeDoc = JSON.parse(fs.readFileSync(path.join(projectDir, "Model", MESHES.Grenade.file), "utf8"));
const grenadeClouds = [
  ["Grenade TZM", grenadeDoc.meshes.flatMap((_, i) => TzmMeshPoints(grenadeDoc, i))],
  ["Grenade GLB", GlbPoints(path.join(projectDir, "Model", "Model_Type24Grenade.glb"))],
];
for (const [name, points] of grenadeClouds) {
  const lo = Math.min(...points.map((p) => p[2])), hi = Math.max(...points.map((p) => p[2]));
  const mid = (lo + hi) / 2;
  const frontRadius = Math.max(...points.filter((p) => p[2] < mid - 0.04).map((p) => Math.hypot(p[0], p[1])));
  const rearRadius = Math.max(...points.filter((p) => p[2] > mid + 0.04).map((p) => Math.hypot(p[0], p[1])));
  Check(frontRadius > rearRadius * 1.5, `${name} 宽弹体在 -Z、木柄在 +Z`, `${frontRadius.toFixed(4)} / ${rearRadius.toFixed(4)}`);
  Check(Math.abs(hi - lo - 0.22) < 0.0001, `${name} 保留 0.22 m 动画包络`);
}
Check(grenadeDoc.triangles === MESHES.Grenade.triangles && grenadeDoc.meshes.length === 1,
  "木柄弹展示清单与实物面数一致，单材质合批");

// Locally authored food has no nose. Measure its long X axis, vertical tissue
// layers and thin Z cross-section from the shipped GLB, after axis conversion.
for (const [name,width,depth] of [["Model_CuredPorkWhole",.28,.038],["Model_CuredPorkSlice",.105,.005]]) {
  const points=GlbPoints(path.join(projectDir,"Model/BaconHandoff/Model_CuredPork.glb"),name);
  const span=[0,1,2].map(axis=>Math.max(...points.map(p=>p[axis]))-Math.min(...points.map(p=>p[axis])));
  Check(points.length>1000 && Math.abs(span[0]-width)<.00001 && span[1]>span[2]*1.8
    && span[2]>=depth*.95 && span[2]<depth*1.35,`${name} X 长边、Y 肥瘦分层、Z 厚度`,span.map(v=>v.toFixed(4)).join(" / "));
}

const treeCloud = GlbPoints(path.join(projectDir,"Model/Model_BreakableDeadTree.glb"));
const treeY = treeCloud.map(p=>p[1]);
Check(Math.abs(Math.min(...treeY))<0.001 && Math.abs(Math.max(...treeY)-7.2)<0.001,
  "枯树导出为 Y-up、根部零高、7.2 m 米制尺寸");
const cigaretteFile = path.join(projectDir, "Model/Model_Cigarette.glb");
const cigarette = LoadGlb(cigaretteFile);
const cigarettePoints = GlbPoints(cigaretteFile);
const cigaretteZ = cigarettePoints.map(p => p[2]);
const cigaretteCount = cigarette.json.meshes.flatMap(m => m.primitives)
  .reduce((n, p) => n + cigarette.json.accessors[p.indices ?? p.attributes.POSITION].count / 3, 0);
Check(cigaretteCount >= 500 && cigaretteCount <= 2000, "卷烟实际面数在指定预算内", String(cigaretteCount));
Check(Math.abs(Math.min(...cigaretteZ) + .085) < .001 && Math.abs(Math.max(...cigaretteZ) - .005) < .001,
  "卷烟长 9 cm、嘴端咬入 5 mm、烟灰朝 -Z");
// The irregular ash is broader than the twisted paper mouth in the source.
const EndRadius = predicate => Math.max(...cigarettePoints.filter(p => predicate(p[2])).map(p => Math.hypot(p[0], p[1])));
Check(EndRadius(z => z < -.08) > EndRadius(z => z > .002) * 1.2, "卷烟真实烟灰端在 -Z，拧口在 +Z");
Check(cigarette.json.textures?.length >= 3, "卷烟保留底色、法线与粗糙度贴图");
for (const [id, spec] of Object.entries(STRAW_SLEEPING_MAT_ASSETS)) {
  const points = GlbPoints(path.resolve(projectDir, spec.url.split("?")[0]));
  const min = [0, 1, 2].map(axis => Math.min(...points.map(p => p[axis])));
  const max = [0, 1, 2].map(axis => Math.max(...points.map(p => p[axis])));
  Check(min.every((v, axis) => Math.abs(max[axis] - v - spec.bounds[axis]) < 0.00001),
    `${id} 顶点云量得米制 X 长边 / Y 向上 / Z 宽度`, max.map((v, axis) => (v - min[axis]).toFixed(5)).join(" / "));
  Check(Math.abs(min[1]) < 0.000001 && Math.abs(min[0] + max[0]) < 0.000001 && Math.abs(min[2] + max[2]) < 0.000001,
    `${id} 完整模型底面中心在原点`);
}
const donkeyFile=path.join(projectDir,"Model/DonkeyCart/Model_DonkeyCart.glb");
const donkey=LoadGlb(donkeyFile),animalCloud=RiggedGlbPoints(donkeyFile,"DonkeyRuntime"),cartCloud=RiggedGlbPoints(donkeyFile,"CartRuntime");
const donkeySpec=JSON.parse(fs.readFileSync(path.join(projectDir,"Model/DonkeyCart/Data_DonkeyCart.json"),"utf8"));
const headCloud=RiggedGlbPoints(donkeyFile,"DonkeyRuntime","DonkeyHeadPivot");
const headMeanZ=headCloud.reduce((sum,p)=>sum+p[2],0)/headCloud.length;
const animalMinZ=Math.min(...animalCloud.map(p=>p[2])),cartMinZ=Math.min(...cartCloud.map(p=>p[2]));
Check(headCloud.length>500 && headMeanZ<-.65 && animalMinZ<cartMinZ-.25,
  "驴车实际头部顶点云朝 -Z，鼻端位于双辕前方",`head z=${headMeanZ.toFixed(4)} nose=${animalMinZ.toFixed(4)} shaft=${cartMinZ.toFixed(4)}`);
const donkeyY=[...animalCloud,...cartCloud].map(p=>p[1]);
Check(Math.abs(Math.min(...donkeyY))<.001 && Math.max(...donkeyY)>1.48 && Math.max(...donkeyY)<1.68,
  "驴车米制 Y-up、轮底零高与长耳完整高度",`${Math.min(...donkeyY).toFixed(5)} / ${Math.max(...donkeyY).toFixed(5)}`);
const donkeyTriangles=donkey.json.meshes.flatMap(m=>m.primitives).reduce((sum,p)=>sum+donkey.json.accessors[p.indices].count/3,0);
Check(donkey.json.meshes.length===2 && donkey.json.skins.length===2 && donkeyTriangles===donkeySpec.triangles.total && donkeyTriangles<=80000,
  "驴车两网格两骨架、实际完整面数与资产契约一致",String(donkeyTriangles));
const actualMin=[0,1,2].map(axis=>Math.min(...[...animalCloud,...cartCloud].map(p=>p[axis]))),actualMax=[0,1,2].map(axis=>Math.max(...[...animalCloud,...cartCloud].map(p=>p[axis])));
Check(actualMin.every((v,i)=>Math.abs(v-donkeySpec.boundsM.min[i])<.00003)&&actualMax.every((v,i)=>Math.abs(v-donkeySpec.boundsM.max[i])<.00003),
  "驴车实际蒙皮绑定顶点云与外部 Blender 量测包围盒一致");
Check(donkeySpec.facingAxis==="-Z" && donkeySpec.upAxis==="+Y" && ["DonkeyWalk","DonkeyIdle","CartRoll"].every(name=>donkey.json.animations.some(a=>a.name===name)),
  "驴车朝向契约与三条必要动画齐备");
const bareFile=path.join(projectDir,"Model/Donkey/Model_Donkey.glb"),bare=LoadGlb(bareFile);
const bareSpec=JSON.parse(fs.readFileSync(path.join(projectDir,"Model/Donkey/Data_Donkey.json"),"utf8"));
const bareCloud=["DonkeyRuntime","DonkeyCoatRuntime","DonkeyManeRuntime"].flatMap(name=>RiggedGlbPoints(bareFile,name)),bareHead=RiggedGlbPoints(bareFile,"DonkeyRuntime","DonkeyHeadPivot");
const bareMin=[0,1,2].map(axis=>bareCloud.reduce((v,p)=>Math.min(v,p[axis]),Infinity)),bareMax=[0,1,2].map(axis=>bareCloud.reduce((v,p)=>Math.max(v,p[axis]),-Infinity));
const bareTriangles=bare.json.meshes.flatMap(m=>m.primitives).reduce((sum,p)=>sum+bare.json.accessors[p.indices].count/3,0);
Check(bareHead.length>500 && bareHead.reduce((sum,p)=>sum+p[2],0)/bareHead.length<-.65
  && bareSpec.facingAxis==="-Z" && bareSpec.upAxis==="+Y" && Math.abs(bareMin[1])<.001 && bareMax[1]>1.48 && bareMax[1]<1.68,
  "独立驴实际头部朝 -Z、米制 Y-up、蹄底零高与长耳完整高度");
Check(bareMin.every((v,i)=>Math.abs(v-bareSpec.boundsM.min[i])<.00003) && bareMax.every((v,i)=>Math.abs(v-bareSpec.boundsM.max[i])<.00003),
  "独立驴实际绑定顶点云与外置工程包围盒一致");
Check(bare.json.meshes.length===3 && bare.json.skins.length===1 && bare.json.skins[0].joints.length===28
  && bare.json.materials.length===4 && bare.json.images.length===7 && bareTriangles===79622 && bareTriangles===bareSpec.triangles.total && bareTriangles<=80000,
  "独立驴身体、短毛与鬃毛共用28骨，四材质/七图与79,622三角齐备");
Check(bareSpec.verification.bakeUvOverlapTexels===0 && bareSpec.verification.bakeUvLegOverlapTexels===0
  && bareSpec.triangles.sourceBeforeRuntimeTriangulationTotal===79622,
  "独立驴制作源登记零重叠烘焙图集与显式运行时三角化；最终GLB的UV覆盖另作独立验证");
const pectoral=bareSpec.derivation.referenceFit.details;
const forelegFit=pectoral.legFit;
const legAlbedo=bareSpec.derivation.referenceFit.photoDetail.legPigment;
Check(forelegFit?.revision==='20261025ThreeViewLimbV32'&&forelegFit.frontRevision==='20261025ContinuousLimbV30'&&forelegFit.soleDisplacementM===0&&forelegFit.hornDisplacementM===0
  &&['frontCentreX','frontCentreY','frontWidth','frontDepth'].every(key=>forelegFit[key].length>=8&&forelegFit[key].every(row=>row.every(Number.isFinite)))
  &&Object.keys(forelegFit.boneDisplacementM).every(name=>!name.endsWith('HoofPivot')),
  "独立驴四腿由原图前/侧/后视拟合连续截面，保留刚性蹄壳和接地；实际截面与动作另行验收");
Check(legAlbedo.detailUsesAtlasSpaceBlur===false&&legAlbedo.detailUsesSyntheticNoise===false
  &&legAlbedo.silhouetteMaskedFiltering===true
  &&legAlbedo.visibleDetailIsPhotographic===true&&legAlbedo.periodicDetailScope==='unphotographed cap only'
  &&legAlbedo.sourceSha256===bareSpec.derivation.referenceFit.photoDetail.originalSha256
  &&legAlbedo.sampling.length===4&&new Set(legAlbedo.sampling.map(row=>row.leg)).size===4,
  "独立驴腿部底色在原图尺度分离毛色与细毛，四腿具备摄影归属且不在拉伸图块上高通");
Check(pectoral.chest.integrity.boundaryEdges===0&&pectoral.chest.integrity.nonmanifoldEdges===0&&pectoral.chest.integrity.chestCrossings===0
  &&pectoral.skinWeights.maximumAfter===4&&pectoral.pectoralBinding.maxInfluences===4&&pectoral.pectoralBinding.geometryDisplacementM===0
  &&pectoral.pectoralEdges.integrity.chestCrossings===0&&pectoral.pectoralEdges.maximumRestSurfaceBoundM<=.0005,
  "独立驴胸部源面闭合、零交叠及四骨蒙皮记录齐备；实际GLB关键相位和外观另作独立验证");
const axillaryTopology=pectoral.axillaryTopology;
Check(axillaryTopology?.boundaryEdges===0&&axillaryTopology.nonmanifoldEdges===0
  &&axillaryTopology.mergedVertices===1&&axillaryTopology.maximumSourceVertexDisplacementM<=.00005,
  "独立驴右腋裁切薄面在50微米内合并一个重合顶点，保留闭合表面；动作穿插另由实际GLB检查");
const pectoralMotion=bareSpec.verification.pectoralMotionIntegrity;
const foreSwing=bareSpec.animations.DonkeyWalk.foreSwingClearance;
Check(pectoralMotion?.pass===true&&pectoralMotion.assetSha256===bareSpec.sha256
  &&pectoralMotion.walkSamples===145&&pectoralMotion.idleSamples===37&&pectoralMotion.visibilityDirections===14
  &&pectoralMotion.visibilityToleranceM===.00025&&pectoralMotion.furOcclusionIgnored===true
  &&pectoralMotion.restCrossings===0&&pectoralMotion.maximumVisibleCrossings===0
  &&foreSwing.leftMaximumDegrees===2.5&&foreSwing.rightMaximumDegrees===6&&foreSwing.onlyUnplanted===true
  &&bareSpec.verification.nativeLateralStanceDriftPerFrameM<.0001,
  "独立驴当前GLB具备加密胸区动作证据，保留离地回摆且着地蹄点不横滑");
const jointFit=pectoral.jointFit,jointArcs=bareSpec.animations.DonkeyWalk.jointArcs;
Check(bareSpec.version==='20261026ReferenceV35'&&jointFit?.version==='20261026JointFitV35'
  &&jointFit.maximumInfluences===4&&jointFit.boneCount===28&&jointFit.morphTargetsAdded===0
  &&jointFit.surfaceCorrectionSourcePixels<1&&jointFit.edges.maximumRestSurfaceBoundM<=.0005&&jointFit.edgesAfter.maximumRestSurfaceBoundM<=.0005
  &&jointArcs?.bakeFps===120&&jointArcs.maximumHoofTargetErrorM<.00001&&jointArcs.maximumReachCompressionM<=.006,
  "独立驴V35关节配方保留28骨与四权重，局部顶点修正小于原图一像素；三维肘膝路径锁定请求蹄点");
for(const [key,region] of [['hindMotionIntegrity','Hind'],['lowerBodyMotionIntegrity','LowerBody']]){
  const proof=bareSpec.verification[key];
  Check(proof?.pass===true&&proof.assetSha256===bareSpec.sha256&&proof.region===region
    &&proof.walkSamples===145&&proof.idleSamples===37&&proof.visibilityDirections===14&&proof.furOcclusionIgnored===true
    &&proof.visibilityToleranceM===.00025&&proof.restCrossings===0&&proof.maximumVisibleCrossings===0,
    `独立驴实际GLB的${region}完整动作检查通过，图像和源网格结果不替代交付文件证据`);
}
Check(pectoral.mane.removedLegacySolidMane.some(row=>row.name==='DonkeyDenseManeBase'&&row.triangles===284)
  &&!bareSpec.verification.lowerBodyMotionIntegrity.componentProof.componentTriangleCounts.includes(284),
  "独立驴源与实际GLB均移除遗留实体鬃毛底条，参考轮廓层与立体细毛保留");
const upperBodyFit=bareSpec.derivation.referenceFit.details.upperBodyFit;
Check(upperBodyFit.refinementTriangles===274&&upperBodyFit.sideProfileUnchanged===true&&upperBodyFit.maximumHeadDisplacementM===0&&upperBodyFit.maximumLowerLimbDisplacementM===0
  &&upperBodyFit.integrity.boundaryEdges===0&&upperBodyFit.integrity.nonmanifoldEdges===0,
  "独立驴上躯干记录包含局部截面、侧向整形及头部/下肢保护；实际轮廓另行投影验证");
const muzzleFit=bareSpec.derivation.referenceFit.details.muzzle;
Check(muzzleFit.integrity.anteriorCrossings===0&&muzzleFit.integrity.boundaryEdges===0&&muzzleFit.integrity.nonmanifoldEdges===0
  &&muzzleFit.mouth.stations===21&&muzzleFit.mouth.vertices===126&&muzzleFit.mouth.surfaceDistanceM[1]<.001,
  "独立驴口鼻源检查保留零相交闭合皮肤和21截面贴面嘴缝记录；完整源码重建另执行实际几何检查");
const bareBody=bare.json.meshes[bare.json.nodes.find(n=>n.name==="DonkeyRuntime").mesh];
const bareCoat=bare.json.meshes[bare.json.nodes.find(n=>n.name==="DonkeyCoatRuntime").mesh];
const bareManeNode=bare.json.nodes.find(n=>n.name==="DonkeyManeRuntime");
const bareMane=bare.json.meshes[bareManeNode.mesh];
const tiled=bareBody.primitives.find(p=>bare.json.materials[p.material].name.startsWith("DonkeyAnimalPbr"));
function BareForelegSection(height){
  const position=ReadAccessor(bare,tiled.attributes.POSITION).data,joints=ReadAccessor(bare,tiled.attributes.JOINTS_0).data;
  const weights=ReadAccessor(bare,tiled.attributes.WEIGHTS_0).data,indices=ReadAccessor(bare,tiled.indices).data;
  const skin=bare.json.skins[bare.json.nodes.find(n=>n.name==='DonkeyRuntime').skin];
  const owned=skin.joints.map(id=>bare.json.nodes[id].name.startsWith('DonkeyFrontLeft'));
  const mass=Array.from({length:position.length/3},(_,i)=>[0,1,2,3].reduce((s,c)=>s+(owned[joints[i*4+c]]?weights[i*4+c]:0),0));
  const xs=[],zs=[];
  for(let i=0;i<indices.length;i+=3)for(const [c,d] of [[0,1],[1,2],[2,0]]){
    const a=indices[i+c],b=indices[i+d],y=position[a*3+1],dy=position[b*3+1]-y;
    if(Math.abs(dy)<1e-8||(y-height)*(y+dy-height)>0||mass[a]+mass[b]<=1.4)continue;
    const t=(height-y)/dy;xs.push(position[a*3]+t*(position[b*3]-position[a*3]));zs.push(position[a*3+2]+t*(position[b*3+2]-position[a*3+2]));
  }
  return {height,samples:xs.length,centreX:(Math.min(...xs)+Math.max(...xs))/2,width:Math.max(...xs)-Math.min(...xs),depth:Math.max(...zs)-Math.min(...zs)};
}
const foreSections=[.50,.60].map(BareForelegSection);
Check(foreSections.every(s=>s.samples>12&&Math.abs(s.centreX)>.075&&Math.abs(s.centreX)<.11&&s.depth>.065&&s.depth<.11)
  &&foreSections[0].width>.075&&foreSections[0].width<.105&&foreSections[1].width>.09&&foreSections[1].width<.14,
  "独立驴实际GLB前臂上/中段保持参考前视宽度与侧视厚度，避免只收间距却削薄上段",JSON.stringify(foreSections));
const coatMaterial=bare.json.materials[bareCoat.primitives[0].material];
const accessoryMaterial=bare.json.materials.find(m=>m.name.startsWith('DonkeyAccessoryPbr'));
const accessorySpecular=accessoryMaterial.extensions?.KHR_materials_specular;
const ImageOfTexture=index=>bare.json.textures[index].extensions?.EXT_texture_webp?.source??bare.json.textures[index].source;
Check(accessorySpecular?.specularTexture&&(accessorySpecular.specularFactor??1)===1&&(accessorySpecular.specularTexture.texCoord??0)===0
  &&ImageOfTexture(accessorySpecular.specularTexture.index)===ImageOfTexture(accessoryMaterial.pbrMetallicRoughness.metallicRoughnessTexture.index)
  &&bareSpec.runtime.specularTransfer.ormRgbUnchanged===true&&bareSpec.runtime.specularTransfer.runtimeImagesAdded===0,
  "独立驴附属高光读取共享ORM的alpha，保留源部件强度且不增加图像");
const orbitalFit=bareSpec.derivation.referenceFit.details.eyes.socketFit;
Check(orbitalFit.integrity.orbitalCrossings===0&&orbitalFit.integrity.boundaryEdges===0&&orbitalFit.integrity.nonmanifoldEdges===0&&orbitalFit.globeGeometryUnchanged===true,
  "独立驴连续眼眶保留零交叠、闭合及原眼球几何记录；完整源码重建另执行实际几何检查");
function BareWindingEvidence(primitive){
  const positions=ReadAccessor(bare,primitive.attributes.POSITION),indices=ReadAccessor(bare,primitive.indices).data;
  const vertices=new Map(),ids=[];const edges=new Map();let signedVolume=0;
  for(let i=0;i<positions.count;i++){
    const key=[0,1,2].map(axis=>Math.round(positions.data[i*3+axis]*1e6)).join(',');
    if(!vertices.has(key))vertices.set(key,vertices.size);ids.push(vertices.get(key));
  }
  for(let i=0;i<indices.length;i+=3){
    const points=[0,1,2].map(c=>[0,1,2].map(axis=>positions.data[indices[i+c]*3+axis]));
    const [a,b,c]=points;
    signedVolume+=(a[0]*(b[1]*c[2]-b[2]*c[1])+a[1]*(b[2]*c[0]-b[0]*c[2])+a[2]*(b[0]*c[1]-b[1]*c[0]))/6;
    for(let j=0;j<3;j++){
      const from=ids[indices[i+j]],to=ids[indices[i+(j+1)%3]];
      if(from===to)continue;
      const key=from<to?`${from}:${to}`:`${to}:${from}`,row=edges.get(key)||{count:0,direction:0};
      row.count++;row.direction+=from<to?1:-1;edges.set(key,row);
    }
  }
  return {signedVolume,windingConflicts:[...edges.values()].filter(e=>e.count===2&&e.direction!==0).length};
}
const bareWinding=BareWindingEvidence(tiled);
Check(bareWinding.windingConflicts===0&&bareWinding.signedVolume>.08&&bareWinding.signedVolume<.25
  && bare.json.materials[tiled.material].doubleSided!==true,
  "独立驴实际皮肤三角面朝向连续、体积向外且保留背面剔除",JSON.stringify(bareWinding));
const bareSheen=bare.json.materials[tiled.material].extensions?.KHR_materials_sheen;
Check(bareSheen?.sheenColorFactor?.every((value,i)=>Math.abs(value-[.0056,.0049,.0042][i])<.000001)
  && Math.abs(bareSheen.sheenRoughnessFactor-.8)<.000001,
  "独立驴 GLB 毛光颜色包含源权重，不把弱毛光导成灰白覆盖");
Check(tiled.attributes.COLOR_0===undefined && tiled.attributes.TEXCOORD_1!==undefined
  && (bare.json.materials[tiled.material].pbrMetallicRoughness.baseColorTexture.texCoord??0)===0 && bare.json.materials[tiled.material].normalTexture.texCoord===1,
  "独立驴参考细毛底色使用UV0，独立UV1毛流法线保留且不重复乘顶点色");
Check(coatMaterial.alphaMode==="MASK" && Math.abs(coatMaterial.alphaCutoff-.45)<.000001 && coatMaterial.doubleSided===true
  && bareCoat.primitives.every(p=>p.attributes.COLOR_0!==undefined && p.attributes.JOINTS_0!==undefined && p.attributes.WEIGHTS_0!==undefined),
  "独立驴短毛实际带颜色和蒙皮，轮廓毛使用双面MASK 0.45");
const tailSkin=bare.json.skins[bare.json.nodes.find(n=>n.name==="DonkeyCoatRuntime").skin];
let tailTriangles=0,tailReversedNormals=0;
for(const primitive of bareCoat.primitives){
  const positions=ReadAccessor(bare,primitive.attributes.POSITION).data,normals=ReadAccessor(bare,primitive.attributes.NORMAL).data;
  const joints=ReadAccessor(bare,primitive.attributes.JOINTS_0).data,weights=ReadAccessor(bare,primitive.attributes.WEIGHTS_0).data;
  const indices=ReadAccessor(bare,primitive.indices).data;
  const tailVertex=index=>[0,1,2,3].every(c=>weights[index*4+c]===0||/^DonkeyTail(?:Tip)?Pivot$/.test(bare.json.nodes[tailSkin.joints[joints[index*4+c]]].name));
  for(let i=0;i<indices.length;i+=3){
    const ids=Array.from(indices.slice(i,i+3));if(!ids.every(tailVertex))continue;tailTriangles++;
    const [a,b,c]=ids.map(index=>Array.from(positions.slice(index*3,index*3+3)));
    const ab=b.map((value,j)=>value-a[j]),ac=c.map((value,j)=>value-a[j]);
    const face=[ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0]],length=Math.hypot(...face);
    if(length<1e-12)continue;
    if(ids.some(index=>face.reduce((sum,value,j)=>sum+value*normals[index*3+j],0)/length<.5))tailReversedNormals++;
  }
}
Check(tailTriangles>0&&tailReversedNormals===0,"独立驴实际尾束的作者法线与三角面朝向一致，避免双面毛丝反向受光",JSON.stringify({tailTriangles,tailReversedNormals}));
const maneMaterial=bare.json.materials[bareMane.primitives[0].material];
Check(maneMaterial.name==="DonkeyManePbr"&&maneMaterial.alphaMode==="BLEND"&&maneMaterial.alphaCutoff===undefined&&maneMaterial.doubleSided===true
  &&bareManeNode.extras?.groomCastShadow===false&&bareManeNode.skin===bare.json.nodes.find(n=>n.name==="DonkeyRuntime").skin
  &&bareMane.primitives.every(p=>p.attributes.COLOR_0!==undefined&&p.attributes.JOINTS_0!==undefined&&p.attributes.WEIGHTS_0!==undefined),
  "独立驴鬃额毛使用独立双面BLEND材质、共享蒙皮及明确的免投影节点");
Check(accessoryMaterial?.doubleSided===true,"独立驴眼、鼻与尾部附属材质保留双面绘制");
Check(bare.json.animations.length===2 && ["DonkeyWalk","DonkeyIdle"].every(name=>bare.json.animations.some(a=>a.name===name))
  && !bare.json.nodes.some(n=>/^(Cart|Wheel|Harness|Halter)/.test(n.name||"")) && bareMax[2]<1.2,
  "独立驴只保留行走/待机，不带车或套具节点及拖车范围");
for(const animation of bare.json.animations){
  const times=animation.samplers.map(s=>ReadAccessor(bare,s.input).data);
  const end=Math.max(...times.map(values=>Math.max(...values)));
  Check(Math.abs(end-bareSpec.animations[animation.name].durationS)<.00001,
    `独立驴 ${animation.name} 实际动画时长与契约一致`,end.toFixed(3));
}
const bareParents=new Map();bare.json.nodes.forEach((node,index)=>(node.children||[]).forEach(child=>bareParents.set(child,index)));
function BareWorld(index){const local=NodeMatrix(bare.json.nodes[index]);return bareParents.has(index)?Mat4Mul(BareWorld(bareParents.get(index)),local):local}
const bareRigOffsetZ=BareWorld(bare.json.nodes.findIndex(n=>n.name==="DonkeySkeleton"))[14];
const bareTiledOffset=bareBody.primitives.slice(0,bareBody.primitives.indexOf(tiled)).reduce((sum,p)=>sum+bare.json.accessors[p.attributes.POSITION].count,0);
const bareCoreJoints=ReadAccessor(bare,tiled.attributes.JOINTS_0).data,bareCoreWeights=ReadAccessor(bare,tiled.attributes.WEIGHTS_0).data;
const bareWeightAccessor=bare.json.accessors[tiled.attributes.WEIGHTS_0],bareWeightDivisor=bareWeightAccessor.normalized?(bareWeightAccessor.componentType===5121?255:65535):1;
const bareSkin=bare.json.skins[bare.json.nodes.find(n=>n.name==="DonkeyRuntime").skin];
let bareCoreSamples=0,bareCoreLegMass=0;
for(let i=0;i<bare.json.accessors[tiled.attributes.POSITION].count;i++){
  const p=bareCloud[bareTiledOffset+i],sourceY=-p[2]+bareRigOffsetZ;
  if(Math.abs(p[0])>=.08||sourceY<.20||sourceY>.34||p[1]<.56||p[1]>.78)continue;
  let legMass=0;
  for(let c=0;c<4;c++)if(/^Donkey(?:Front|Rear)/.test(bare.json.nodes[bareSkin.joints[bareCoreJoints[i*4+c]]].name))legMass+=bareCoreWeights[i*4+c]/bareWeightDivisor;
  bareCoreLegMass=Math.max(bareCoreLegMass,legMass);bareCoreSamples++;
}
Check(bareCoreSamples>=20&&bareCoreLegMass<.002,"独立驴实际腹部核心蒙皮跟随躯干，避免随迈腿被拉成下垂的包",`${bareCoreSamples} vertices / leg mass ${bareCoreLegMass.toFixed(6)}`);
for(const front of ["Front","Rear"]){
  const expected=front==="Front"?.38:.375;
  const heights=["Left","Right"].map(side=>BareWorld(bare.json.nodes.findIndex(n=>n.name===`Donkey${front}${side}KneePivot`))[13]);
  Check(heights.every(height=>Math.abs(height-expected)<.00001),`独立驴 ${front} 关节实际高度符合参考图修订`,heights.map(v=>v.toFixed(3)).join(" / "));
}
const type89ReferenceFile=path.join(projectDir,"Model/Type89MediumTank/Model_Type89MediumTank.glb");
const type89Reference=LoadGlb(type89ReferenceFile),type89Cannon=GlbPoints(type89ReferenceFile,"Mesh_MainGunRecoil"),type89Cloud=GlbPoints(type89ReferenceFile);
const type89Low=[0,1,2].map(axis=>type89Cloud.reduce((value,point)=>Math.min(value,point[axis]),Infinity)),type89High=[0,1,2].map(axis=>type89Cloud.reduce((value,point)=>Math.max(value,point[axis]),-Infinity));
Check(type89Cannon.length>100&&type89Cannon.reduce((sum,point)=>sum+point[2],0)/type89Cannon.length<-.9,
  "新八九式乙型真实炮管顶点云朝 -Z");
Check(Math.abs(type89Low[1])<.001&&Math.abs(type89High[0]-type89Low[0]-2.18)<.01&&Math.abs(type89High[2]-type89Low[2]-5.70)<.03&&Math.abs(type89High[1]-2.56)<.015,
  "新八九式乙型米制Y-up、地面轴心与含尾外廓按真实顶点复量");
Check(type89Reference.json.nodes.some(node=>node.name==="Node_TurretYaw"&&node.extras?.runtimeAxis==="+Y")&&type89Reference.json.nodes.some(node=>node.name==="Node_MainGunRecoil"&&node.extras?.runtimeAxis==="-Z"),
  "新八九式乙型导出轴向标注与独立炮塔/后坐节点齐备");
console.log("== 独立布料测试资产：平铺+Y，头端+Z ==");
for (const spec of CLOTH_LAB_ASSETS) {
  const file = path.join(projectDir, "Model", "ClothLab", spec.file);
  const glb = LoadGlb(file), g = glb.json;
  const meshNode = g.nodes.find(node => node.mesh !== undefined && node.skin !== undefined);
  Check(!!meshNode, `${spec.id} 独立布面为真实蒙皮网格`);
  if (!meshNode) continue;
  const points = RiggedGlbPoints(file, meshNode.name);
  const low = [0, 1, 2].map(axis => points.reduce((value, point) => Math.min(value, point[axis]), Infinity));
  const high = [0, 1, 2].map(axis => points.reduce((value, point) => Math.max(value, point[axis]), -Infinity));
  const hemWidth = spec.bindingOutsetM * 2;
  Check(points.length > 5000 && Math.abs(high[0] - low[0] - (spec.width + hemWidth)) < .001
    && Math.abs(high[2] - low[2] - (spec.length + hemWidth)) < .001 && Math.abs(high[0] + low[0]) < .001 && Math.abs(high[2] + low[2]) < .001,
    `${spec.id} 实际绑定顶点云为米制、布面居中且宽长符合专用配置`, JSON.stringify({ low, high }));
  Check(low[1] < 0 && high[1] > 0 && high[1] - low[1] < .13,
    `${spec.id} 厚度沿Y、上下两层跨越平铺骨面`);
  const skin = g.skins[meshNode.skin], inverse = ReadAccessor(glb, skin.inverseBindMatrices);
  const corner = name => {
    const index = skin.joints.findIndex(joint => g.nodes[joint].name === name);
    return index < 0 ? null : Array.from(inverse.data.slice(index * 16 + 12, index * 16 + 15), value => -value);
  };
  const headL = corner("Blanket_CornerHeadL"), headR = corner("Blanket_CornerHeadR"), tailL = corner("Blanket_CornerTailL");
  Check(skin.joints.length === 217 && headL?.[0] > 0 && headL[2] > 0 && headR?.[0] < 0 && headR[2] > 0 && tailL?.[2] < 0
    && Math.abs(headL[0] * 2 - spec.width) < .001 && Math.abs(headL[2] * 2 - spec.length) < .001,
    `${spec.id} 真实逆绑定矩阵确认头端+Z、左角+X与217骨格`, JSON.stringify({ headL, headR, tailL }));
}
const hanYangFile=path.join(projectDir,'Model/HanYang173R/Model_HanYang173R.glb');
const hanYangMouth=GlbPoints(hanYangFile,'HY153_VisualMouthLipAndShallowRecess');
const hanYangButt=GlbPoints(hanYangFile,'ButtCap_LimitedProfileBlend');
const Center=points=>[0,1,2].map(axis=>points.reduce((sum,p)=>sum+p[axis],0)/points.length);
const mouth=Center(hanYangMouth),butt=Center(hanYangButt);
Check(hanYangMouth.length>20&&hanYangButt.length>20&&mouth[2]<-.99&&butt[2]>.23
  &&Math.abs(mouth[0])<.001&&mouth[1]>.03&&mouth[1]<.05,
  'HanYang173R 真实枪口与托底点云确认米制、Y-up、枪口-Z',JSON.stringify({mouth,butt}));
if (failed) { console.log(`FAIL ModelFacingTest: ${failed} 项`); process.exit(1); }
console.log("PASS ModelFacingTest: 飞机/战车朝向及独立布料米制/绑定方向均通过几何复量");
