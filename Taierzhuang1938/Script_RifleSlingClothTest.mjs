// ===========================================================================
// Script_RifleSlingClothTest.mjs —— 背枪枪带布料模拟（Script_RifleSlingCloth，2026-11-04）的门禁（纯 Node，秒级）
//
//   node Taierzhuang1938/Script_RifleSlingClothTest.mjs
//
// 口径：docs/Data_RifleSlingCloth.md。用真 GLB（Animation/BackRifleRun：国军全身蒙皮 + 背枪挂点 + 原带子 + BackRifleRun 跑步动作）：
//   1. 资产带子 → 中线：认出扁带的排法，32 个点、长度 / 宽度对得上，两头 = 资产带子的两个端点，法线是单位向量且垂直于宽度方向；
//      认不出的几何（乱序三角形）返回 null（原带子照旧画）；
//   2. 装上：模拟出来的带子挂在场景根的 RifleSlingCloth 组下（不在人物底下），原带子 layers 全关（不画）、显隐照旧；
//      蒙皮网格的每个环 = 对应质点（CPU 蒙皮，环中心离质点 < 0.1 mm、环宽 = 资产带子宽）；
//   3. 原地跑 + 往前跑 4 s（3.2 m/s）：不出 NaN、两头一直钉在背带环上、不穿进身体（按身体表面采样点的切平面量）、
//      贴着身体的点占多数（不悬空）、拉长有上限、相对躯干有动（不是刚性的）但不乱甩；
//   4. 瞬移 50 m：清速度不炸；暂停（dt = 0）：带子跟着挂点刚性走；藏起来再出现：重新挎上；关掉：原带子还原；
//      原带子离开场景 disposeAfterS 后丢掉；
//   5. 同样的输入两次结果逐位相同；每帧耗时。
// ===========================================================================
import assert from "node:assert/strict";
import fs from "node:fs";
import { registerHooks } from "node:module";

const vendor = new URL("./vendor/three/", import.meta.url);
const hooks = registerHooks({
  resolve(id, context, next) {
    if (id === "three") return { url: new URL("build/three.module.js", vendor).href, shortCircuit: true };
    return next(id, context);
  },
  load(url, context, next) {
    if (url.startsWith(vendor.href) && url.endsWith(".js"))
      return { format: "module", source: fs.readFileSync(new URL(url), "utf8"), shortCircuit: true };
    return next(url, context);
  },
});
const THREE = await import("three");
const { GLTFLoader } = await import("./vendor/three/examples/jsm/loaders/GLTFLoader.js");
const M = await import("./Script_RifleSlingCloth.mjs");
const { PrepareRifleSlingVisual } = await import("./Script_RifleSlingVisual.mjs");
const { RIFLE_SLING_MOUNTS } = await import("./Data_RifleSlingMounts.mjs");
const {SlingPinPosition}=await import('./Script_RifleSlingGunContacts.mjs');
hooks.deregister();
const { RIFLE_SLING_CLOTH: CFG, ExtractSlingRest, SlingRope, RegisterRifleSling, SetRifleSlingWeapon, SetRifleSlingAnchors, StepRifleSlings, SetRifleSlingClothEnabled, ClearRifleSlings, RifleSlingClothStats } = M;

let checks = 0;
const Check = (ok, label, detail = "") => { checks += 1; assert.ok(ok, `${label}${detail ? `: ${detail}` : ""}`); console.log(`ok   ${label}${detail ? `  — ${detail}` : ""}`); };
const F = (v, n = 4) => Number(v).toFixed(n);

// ---------------------------------------------------------------------------
// 真 GLB（贴图剥掉：Node 里没有图片解码；几何、骨架、蒙皮、动作原样）
// ---------------------------------------------------------------------------
function StripTextures(bytes) {
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8"));
  const binChunk = bytes.subarray(20 + jsonLength);
  delete json.images; delete json.textures; delete json.samplers;
  for (const m of json.materials || []) {
    for (const key of ["normalTexture", "occlusionTexture", "emissiveTexture"]) delete m[key];
    if (m.pbrMetallicRoughness) { delete m.pbrMetallicRoughness.baseColorTexture; delete m.pbrMetallicRoughness.metallicRoughnessTexture; }
    delete m.extensions;
  }
  json.extensionsUsed = (json.extensionsUsed || []).filter(e => !/texture|sheen/i.test(e));
  json.extensionsRequired = (json.extensionsRequired || []).filter(e => !/texture|sheen/i.test(e));
  let text = Buffer.from(JSON.stringify(json), "utf8");
  const pad = (4 - text.length % 4) % 4;
  text = Buffer.concat([text, Buffer.alloc(pad, 0x20)]);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(20 + text.length + binChunk.length, 8);
  header.writeUInt32LE(text.length, 12); header.writeUInt32LE(0x4e4f534a, 16);
  const out = Buffer.concat([header, text, binChunk]);
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}
const glb = StripTextures(fs.readFileSync(new URL("./Animation/BackRifleRun/Animation_TengxianNraBackRifleRun.glb", import.meta.url)));
const Load = () => new Promise((resolve, reject) => new GLTFLoader().parse(glb, "", resolve, reject));
const flatBytes = StripTextures(fs.readFileSync(new URL("./Model/RifleSlingV3/Model_RifleSlingFlatV3.glb", import.meta.url)));
const flatSource = await new GLTFLoader().parseAsync(flatBytes, "");
const flat = PrepareRifleSlingVisual(flatSource);
{
  const geometry = flatSource.scene.getObjectByName('SlingFlat_Skinned').geometry, position = geometry.attributes.position;
  const box=new THREE.Box3().setFromBufferAttribute(position),size=box.getSize(new THREE.Vector3());
  let radius = 0, minZ = Infinity, maxZ = -Infinity, weightError = 0;
  for (let i = 0; i < position.count; i++) {
    radius = Math.max(radius, Math.hypot(position.getX(i), position.getY(i)));
    minZ = Math.min(minZ, position.getZ(i)); maxZ = Math.max(maxZ, position.getZ(i));
    let sum = 0;
    for (let j = 0; j < 4; j++) sum += geometry.attributes.skinWeight.getComponent(i, j);
    weightError = Math.max(weightError, Math.abs(sum - 1));
  }
  Check(flat.inverseBinds.length === 63 && flat.bindRotations.length === 63, "32 个物理点、63 根平滑蒙皮骨，扁平带形保持");
  Check(Math.abs(size.x-.025)<1e-5&&Math.abs(size.y-.002)<1e-5&&maxZ-minZ>1.59&&maxZ-minZ<1.61,
    "保留扁带：25 mm 宽、2 mm 厚、1.6 m 长", `${F(size.x*1000,2)} × ${F(size.y*1000,2)} mm`);
  Check(weightError < 1e-6 && geometry.index.count / 3 === 3084, "真实扁带几何与归一蒙皮权重", `${geometry.index.count / 3} triangles`);
}

// ---------------------------------------------------------------------------
// 1. 资产带子 → 中线
// ---------------------------------------------------------------------------
console.log("--- 1. 资产带子 → 中线");
const source = await Load();
const slingGeometry = source.scene.getObjectByName("Model_BackRifleSling").geometry;
const rest = ExtractSlingRest(slingGeometry, CFG.count);
Check(!!rest && rest.count === CFG.count, "认出扁带：重采样成 count 个点", `count=${rest?.count}`);
Check(rest.length > 1.2 && rest.length < 1.5, "带子长 1.2–1.5 m（资产量的）", `${F(rest.length, 3)} m`);
Check(rest.width > 0.02 && rest.width < 0.035, "带子宽 2–3.5 cm", `${F(rest.width * 100, 2)} cm`);
{
  const pos = slingGeometry.attributes.position;
  const a0 = new THREE.Vector3().fromBufferAttribute(pos, 0), b0 = new THREE.Vector3().fromBufferAttribute(pos, 1);
  const first = a0.add(b0).multiplyScalar(0.5);
  const lastA = new THREE.Vector3().fromBufferAttribute(pos, pos.count - 2), lastB = new THREE.Vector3().fromBufferAttribute(pos, pos.count - 1);
  const last = lastA.add(lastB).multiplyScalar(0.5);
  const p0 = new THREE.Vector3().fromArray(rest.points, 0), pN = new THREE.Vector3().fromArray(rest.points, (rest.count - 1) * 3);
  Check(p0.distanceTo(first) < 0.002 && pN.distanceTo(last) < 0.002, "保留源引导路径的两端（实际枪环另核）", `${F(p0.distanceTo(first) * 1000, 2)} / ${F(pN.distanceTo(last) * 1000, 2)} mm`);
  let worstUnit = 0, worstDot = 0;
  for (let i = 0; i < rest.count; i += 1) {
    const n = new THREE.Vector3().fromArray(rest.normals, i * 3), w = new THREE.Vector3().fromArray(rest.widthDirs, i * 3);
    worstUnit = Math.max(worstUnit, Math.abs(n.length() - 1), Math.abs(w.length() - 1));
    worstDot = Math.max(worstDot, Math.abs(n.dot(w)));
  }
  Check(worstUnit < 1e-5 && worstDot < 0.05, "法线、宽度方向是单位向量，法线垂直于宽度", `|1-len|≤${worstUnit.toExponential(1)} |n·w|≤${F(worstDot, 3)}`);
  const junk = new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 2, 2, 2, 5, 5, 5, 9, 0, 0], 3));
  Check(ExtractSlingRest(junk) === null, "认不出的几何返回 null（原带子照旧画）");
}

// ---------------------------------------------------------------------------
// 场景：人 + 原带子 + 跑步动作
// ---------------------------------------------------------------------------
async function Setup(layerMask = 1) {
  const gltf = await Load();
  const scene = new THREE.Scene();
  scene.add(gltf.scene);
  const camera = new THREE.PerspectiveCamera();
  camera.position.set(2, 1.5, 3);
  scene.add(camera);
  const mixer = new THREE.AnimationMixer(gltf.scene);
  mixer.clipAction(gltf.animations.find(c => c.name === "BackRifleRun")).play();
  const sling = gltf.scene.getObjectByName("Model_BackRifleSling");
  sling.layers.mask = layerMask;
  const cloth = RegisterRifleSling(sling, gltf.scene);
  return { gltf, scene, camera, mixer, sling, cloth };
}
const _P = new THREE.Vector3(), _Q = new THREE.Quaternion(), _S = new THREE.Vector3(), ONE = new THREE.Vector3(1, 1, 1);
function FrameOf(sling) {
  sling.matrixWorld.decompose(_P, _Q, _S);
  return new THREE.Matrix4().compose(_P, _Q, ONE);
}
function Step(world, dt, move = 0) {
  world.mixer.update(dt);
  world.gltf.scene.position.z += move * dt;   // 这个 GLB 朝 +Z
  world.scene.updateMatrixWorld();
  StepRifleSlings(dt, world.camera);
}
/**
 * 身体的真三角面（此刻 CPU 蒙皮，世界坐标）：只要带子 near 米以内的三角形；三个顶点里有主骨在 skipBones 的（前臂、手、
 * 小腿、脚）不算 —— 那几段本来就不当身体，甩手时手从带子上穿过去是设计如此（带子不该被甩着的手推着走）。
 */
function BodyTriangles(world, near = 0.15) {
  const tris = [], v = new THREE.Vector3(), pts = [];
  const F0 = FrameOf(world.sling), rope = world.cloth.rope;
  for (let i = 0; i < rope.count; i += 1) pts.push(new THREE.Vector3().fromArray(rope.p, i * 3).applyMatrix4(F0));
  const box = new THREE.Box3().setFromPoints(pts).expandByScalar(near);
  world.gltf.scene.traverse((o) => {
    if (!o.isSkinnedMesh) return;
    const pos = o.geometry.attributes.position, index = o.geometry.index, si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight;
    const skip = new Uint8Array(pos.count);
    for (let k = 0; k < pos.count; k += 1) {
      let best = 0, bw = -1;
      for (let j = 0; j < 4; j += 1) if (sw.getComponent(k, j) > bw) { bw = sw.getComponent(k, j); best = si.getComponent(k, j); }
      skip[k] = CFG.skipBones.test(o.skeleton.bones[best]?.name || "") ? 1 : 0;
    }
    const world3 = new Float32Array(pos.count * 3);
    for (let k = 0; k < pos.count; k += 1) o.getVertexPosition(k, v).applyMatrix4(o.matrixWorld).toArray(world3, k * 3);
    const count = index ? index.count : pos.count;
    for (let k = 0; k < count; k += 3) {
      const a = index ? index.getX(k) : k, b = index ? index.getX(k + 1) : k + 1, c = index ? index.getX(k + 2) : k + 2;
      if (skip[a] || skip[b] || skip[c]) continue;
      const t = new THREE.Triangle(new THREE.Vector3().fromArray(world3, a * 3), new THREE.Vector3().fromArray(world3, b * 3), new THREE.Vector3().fromArray(world3, c * 3));
      if (box.containsPoint(t.a) || box.containsPoint(t.b) || box.containsPoint(t.c)) tris.push(t);
    }
  });
  return { tris, points: pts };
}
/**
 * 量这一刻：每个质点离身体真表面的有符号距离（最近的三角形、按面法线定正负；> 0 在外面）、贴着身体的比例、NaN、
 * 两头离背带环多远、最长一段的拉长。穿模分两段报：UPPER（上背带环 → 过右肩 → 斜挎胸前到左腰，看得最清楚的那段）
 * 和其余（左胯绕到屁股后的背带环：背带环在军装下摆以下，带子会从开口的下摆底下过，「最近三角形」在那里会量成
 * 在衣服里面几厘米，不算穿肉）。
 */
const UPPER = 18;
function Measure(world) {
  const { cloth } = world, rope = cloth.rope;
  const { tris, points } = BodyTriangles(world);
  const c = new THREE.Vector3(), n = new THREE.Vector3(), best = new THREE.Vector3(), bestN = new THREE.Vector3();
  let minSigned = Infinity, lowerMin = Infinity, contact = 0, nan = false, counted = 0, deep = 0;
  for (let i = 1; i < rope.count - 1; i += 1) {
    const p = points[i];
    if (!Number.isFinite(p.x + p.y + p.z)) { nan = true; continue; }
    let bd = Infinity;
    for (const t of tris) {
      t.closestPointToPoint(p, c);
      const d = c.distanceToSquared(p);
      if (d < bd) { bd = d; best.copy(c); t.getNormal(bestN); }
    }
    if (bd > 0.08 ** 2) continue;
    counted += 1;
    const signed = n.subVectors(p, best).dot(bestN) >= 0 ? Math.sqrt(bd) : -Math.sqrt(bd);
    if (i >= UPPER) lowerMin = Math.min(lowerMin, signed);
    else { minSigned = Math.min(minSigned, signed); if (signed < -0.003) deep += 1; }
    if (signed < rope.radius + CFG.contactM) contact += 1;
  }
  let pin = 0;
  for (const i of [0, rope.count - 1]) pin = Math.max(pin, Math.hypot(rope.p[i * 3] - rope.rest[i * 3], rope.p[i * 3 + 1] - rope.rest[i * 3 + 1], rope.p[i * 3 + 2] - rope.rest[i * 3 + 2]));
  let upperStretch = 0;
  for (let i = 0; i < UPPER; i += 1) upperStretch = Math.max(upperStretch, rope._SegmentLength(i) / rope.segment);
  // An open jacket hem cannot use a nearest-face sign as an inside/outside test.
  // Check the lower strap's actual segments against the visible garment triangles instead.
  const ray = new THREE.Ray(), hit = new THREE.Vector3();
  let lowerCrossings = 0;
  for (let i = UPPER; i < rope.count - 1; i++) {
    const length = points[i].distanceTo(points[i + 1]);
    ray.origin.copy(points[i]); ray.direction.subVectors(points[i + 1], points[i]).normalize();
    for (const triangle of tris) if (ray.intersectTriangle(triangle.a, triangle.b, triangle.c, false, hit)) {
      const along = hit.distanceTo(points[i]);
      if (along > 0.0001 && along < length - 0.0001) lowerCrossings++;
    }
  }
  return { minSigned, lowerMin, lowerCrossings, deep: deep / (UPPER - 1), contact: contact / (rope.count - 2), counted, nan, pin, upperStretch, ...rope.Stats() };
}

// ---------------------------------------------------------------------------
// 2. 装上
// ---------------------------------------------------------------------------
console.log("--- 2. 装上");
const world = await Setup();
Step(world, 1 / 60);
{
  const { cloth, sling, scene, gltf } = world;
  Check(cloth.ready && cloth.mesh?.isSkinnedMesh, "第一帧就挎上了（蒙皮网格）", `samples=${cloth.samples.count}`);
  Check(cloth.mesh.parent?.name === "RifleSlingCloth" && cloth.mesh.parent.parent === scene, "带子挂在场景根的 RifleSlingCloth 组下");
  let underActor = false; gltf.scene.traverse(o => { if (o === cloth.mesh) underActor = true; });
  Check(!underActor, "不在人物底下（X Bot 层藏人物底下的蒙皮网格、伤口扫人物的蒙皮网格，都碰不到它）");
  Check(sling.layers.mask === 0 && sling.visible, "原带子不画（layers 全关），显隐照旧", `mask=${sling.layers.mask} visible=${sling.visible}`);
  Check(cloth.samples.count > 150 && cloth.samples.count < 1500, "身体表面采样点数量合理（体素抽稀）", `${cloth.samples.count}`);
  // The exporter reorders vertices. Measure actual skinned vertices against the adjacent
  // centreline segments by rest Z, rather than assuming the old eight-vertices-per-bone layout.
  const mesh = cloth.mesh, v = new THREE.Vector3(), F0 = FrameOf(sling);
  mesh.skeleton.update();
  let worstRadius = 0, pinError = 0;
  for (let k=0;k<mesh.geometry.attributes.position.count;k+=7) {
    const center=new THREE.Vector3();
    for(let j=0;j<4;j++)center.addScaledVector(new THREE.Vector3().setFromMatrixPosition(mesh.skeleton.bones[mesh.geometry.attributes.skinIndex.getComponent(k,j)].matrixWorld),mesh.geometry.attributes.skinWeight.getComponent(k,j));
    mesh.getVertexPosition(k,v).applyMatrix4(mesh.matrixWorld);
    const d=center.distanceTo(v);
    worstRadius=Math.max(worstRadius,d);
  }
  for(let i=0;i<CFG.count;i++) {
    const actual=new THREE.Vector3().applyMatrix4(mesh.skeleton.boneInverses[i*2]).applyMatrix4(cloth.bones[i].matrixWorld);
    pinError=Math.max(pinError,actual.distanceTo(new THREE.Vector3().fromArray(cloth.rope.p,i*3).applyMatrix4(F0)));
  }
  Check(worstRadius>.010&&worstRadius<.014&&pinError<1e-6, "真实扁带 CPU 蒙皮保持带宽与骨固定点", `半宽范围 ${F(worstRadius*1000,3)} mm / 骨误差 ${F(pinError*1000,5)} mm`);
  let curveDeviation=0;
  for(let i=0;i<31;i++)curveDeviation=Math.max(curveDeviation,new THREE.Vector3().fromArray(cloth.renderPositions,(i*2+1)*3).distanceTo(new THREE.Vector3().fromArray(cloth.rope.p,i*3).lerp(new THREE.Vector3().fromArray(cloth.rope.p,(i+1)*3),.5)));
  Check(curveDeviation<=.002001,"空间平滑偏移不超过 2 mm，物理固定点保持精确",`${F(curveDeviation*1000,3)} mm`);
  const sourcePositions=flatSource.scene.getObjectByName('SlingFlat_Skinned').geometry.attributes.position,rings=new Map();
  for(let i=0;i<sourcePositions.count;i++){
    const key=Math.round(sourcePositions.getZ(i)*120000);let ring=rings.get(key);
    if(!ring){ring={lo:i,hi:i};rings.set(key,ring);}
    if(sourcePositions.getX(i)<sourcePositions.getX(ring.lo))ring.lo=i;
    if(sourcePositions.getX(i)>sourcePositions.getX(ring.hi))ring.hi=i;
  }
  let minWidthRatio=Infinity;
  for(const ring of rings.values()){
    const width=sourcePositions.getX(ring.hi)-sourcePositions.getX(ring.lo);
    const left=mesh.getVertexPosition(ring.lo,new THREE.Vector3()),right=mesh.getVertexPosition(ring.hi,new THREE.Vector3());
    minWidthRatio=Math.min(minWidthRatio,left.distanceTo(right)/width);
  }
  Check(minWidthRatio>.65,"真实蒙皮截面不夹成尖角或沙漏",`最窄保留 ${F(minWidthRatio*100,1)}% 带宽`);
  const m = Measure(world);
  Check(m.pin < 1e-6, "两头钉在背带环上", `${m.pin.toExponential(1)} m`);
  // 身体表面按 3 cm 一个点采样、切平面由最近三个点插，曲面上会差几毫米；小部件（腰包）采样稀，差得多一点
  Check(m.minSigned > -0.008 && m.deep <= 0.1, "挎上时过肩、胸前那段不穿进身体（中线最深陷 < 8 mm、陷 3 mm 以上的点 ≤ 10%）",
    `最深 ${F(-m.minSigned * 1000, 1)} mm、${F(m.deep * 100, 0)}%（胯下那段 ${F(-Math.min(0, m.lowerMin) * 1000, 1)} mm，只报数）`);
  Check(m.contact > 0.6, "挎上时多数点贴着身体（不悬空）", `${F(m.contact * 100, 0)}%`);
}

// ---------------------------------------------------------------------------
// 3. 跑
// ---------------------------------------------------------------------------
console.log("--- 3. 跑 4 s");
{
  const dt = 1 / 60, rope = world.cloth.rope;
  let worst = { minSigned: Infinity, lowerMin: Infinity, lowerCrossings: 0, deep: 0, contact: 1, maxStretch: 0, upperStretch: 0, pin: 0, nan: false };
  const lo = new Float64Array(rope.count * 3).fill(Infinity), hi = new Float64Array(rope.count * 3).fill(-Infinity);
  let ms = 0, frames = 0;
  for (let f = 0; f < 240; f += 1) {
    const t0 = performance.now();
    Step(world, dt, 3.2 * THREE.MathUtils.clamp((f - 60) / 18, 0, 1));   // 1 s 原地跑，再 0.3 s 加到 3.2 m/s
    ms += performance.now() - t0; frames += 1;
    if (f % 6 === 0) {
      const m = Measure(world);
      worst = { minSigned: Math.min(worst.minSigned, m.minSigned), lowerMin: Math.min(worst.lowerMin, m.lowerMin), lowerCrossings: Math.max(worst.lowerCrossings, m.lowerCrossings), deep: Math.max(worst.deep, m.deep), contact: Math.min(worst.contact, m.contact), maxStretch: Math.max(worst.maxStretch, m.maxStretch), upperStretch: Math.max(worst.upperStretch, m.upperStretch), pin: Math.max(worst.pin, m.pin), nan: worst.nan || m.nan };
    }
    if (f >= 120) for (let i = 0; i < rope.p.length; i += 1) { lo[i] = Math.min(lo[i], rope.p[i]); hi[i] = Math.max(hi[i], rope.p[i]); }
  }
  let swing = 0, swingUpper = 0;
  for (let i = 1; i < rope.count - 1; i += 1) {
    const r = Math.hypot(hi[i * 3] - lo[i * 3], hi[i * 3 + 1] - lo[i * 3 + 1], hi[i * 3 + 2] - lo[i * 3 + 2]);
    swing = Math.max(swing, r);
    if (i < UPPER) swingUpper = Math.max(swingUpper, r);
  }
  Check(!worst.nan, "跑 4 s 不出 NaN");
  Check(worst.pin < 1e-6, "两头一直钉在背带环上", `${worst.pin.toExponential(1)} m`);
  Check(worst.minSigned > -0.01 && worst.deep <= 0.15, "跑动中过肩、胸前那段不穿进身体（中线最深陷 < 1 cm、陷 3 mm 以上的点 ≤ 15%）",
    `最深 ${F(-worst.minSigned * 1000, 1)} mm、最多 ${F(worst.deep * 100, 0)}%（胯下那段最深 ${F(-Math.min(0, worst.lowerMin) * 1000, 1)} mm，只报数）`);
  // 两头各有几个点本来就悬在背带环和身体之间（约 1/4）
  Check(worst.contact > 0.4, "跑动中贴着身体的点一直不少于 40%（两头悬空那几段约占 1/4）", `最少 ${F(worst.contact * 100, 0)}%`);
  Check(worst.upperStretch < 1.25 && worst.maxStretch < 1.25, "整条带子单节拉长 < 25%（包括胯边，不豁免）", `${F(worst.upperStretch, 3)} / ${F(worst.maxStretch, 3)}`);
  Check(worst.lowerCrossings === 0, "胯边实际线段不穿过衣服三角面（不靠开口下摆的有符号距离豁免）", `${worst.lowerCrossings} 处`);
  // 量的是相对枪挂点（胸骨）的位移：腰胯相对胸口扭，带子顺着自己的走向在肩上来回滑（滑动看不出来），所以几厘米是正常的
  Check(swing > 0.004 && swing < 0.12, "相对胸骨有动（不是刚性的）、但不炸飞（< 12 cm）", `最大摆幅 过肩胸前 ${F(swingUpper * 100, 1)} / 全条 ${F(swing * 100, 1)} cm`);
  const per = ms / frames;
  Check(per < 1.5, "每帧耗时（Node，一根带子）", `${F(per, 3)} ms`);
}

// ---------------------------------------------------------------------------
// Hemp must settle after an abrupt stop. Freeze the actual body pose so residual
// movement is the cord's own response, not continued animation input.
{
  world.mixer.timeScale=0;
  const positions=[],lengths=[];
  for(let frame=0;frame<60;frame++){
    Step(world,1/60);positions.push(Float64Array.from(world.cloth.rope.p));lengths.push(world.cloth.rope.Stats().length);
  }
  const span=(from,to)=>{
    let max=0;
    for(let i=3;i<positions[0].length-3;i+=3){
      const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
      for(let f=from;f<to;f++)for(let axis=0;axis<3;axis++){lo[axis]=Math.min(lo[axis],positions[f][i+axis]);hi[axis]=Math.max(hi[axis],positions[f][i+axis]);}
      max=Math.max(max,Math.hypot(...hi.map((v,k)=>v-lo[k])));
    }
    return max;
  };
  const early=span(0,15),late=span(45,60),variation=(Math.max(...lengths)-Math.min(...lengths))/lengths[0];
  Check(late<.001 && (early<.005||late<early*.2),"急停后自行衰减，末 0.25 s 余振 < 1 mm",`初段 ${F(early*1000,2)} / 末段 ${F(late*1000,3)} mm`);
  Check(variation<.025,"急停中整条绳长变化 < 2.5%",`${F(variation*100,2)}%`);
  world.mixer.timeScale=1;
}

// 4. 瞬移 / 暂停 / 藏起来 / 关掉 / 丢掉
// ---------------------------------------------------------------------------
console.log("--- 4. 瞬移 / 暂停 / 藏起来 / 关掉 / 丢掉");
{
  const { cloth, sling, gltf } = world, rope = cloth.rope;
  gltf.scene.position.x += 50;
  Step(world, 1 / 60);
  for (let f = 0; f < 20; f += 1) Step(world, 1 / 60);
  const m = Measure(world);
  Check(!m.nan && m.maxStretch < 1.3 && m.pin < 1e-6, "瞬移 50 m：不炸、两头还在背带环上", `stretch=${F(m.maxStretch, 3)}`);

  const before = Float64Array.from(rope.p);
  gltf.scene.rotation.y += 0.4;
  Step(world, 0);
  let moved = 0; for (let i = 0; i < before.length; i += 1) moved = Math.max(moved, Math.abs(rope.p[i] - before[i]));
  Check(moved === 0, "暂停（dt = 0）：带子跟着挂点刚性走（挂点坐标里一点不动）");

  sling.visible = false;
  for (let f = 0; f < 60; f += 1) Step(world, 1 / 60);
  Check(!cloth.mesh.visible && !cloth.ready, "藏起来超过 hiddenResetS：模拟的带子也藏、下次重新挎");
  sling.visible = true;
  Step(world, 1 / 60);
  Check(cloth.mesh.visible && cloth.ready, "再出现：重新挎上");

  SetRifleSlingClothEnabled(false);
  Step(world, 1 / 60);
  Check(sling.layers.mask === 1 && !cloth.mesh.visible, "关掉：原带子还原、模拟的不画");
  SetRifleSlingClothEnabled(true);
  Step(world, 1 / 60);
  Check(sling.layers.mask === 0 && cloth.mesh.visible && cloth.ready, "再打开：重新挎上");

  sling.removeFromParent();
  for (let f = 0; f < Math.ceil(CFG.disposeAfterS * 60) + 5; f += 1) Step(world, 1 / 60);
  Check(RifleSlingClothStats().count === 0 && !cloth.mesh, "原带子离开场景 disposeAfterS 后丢掉（网格摘掉）");
}

// ---------------------------------------------------------------------------
// 5. 逐位确定
// ---------------------------------------------------------------------------
console.log("--- 5. 逐位确定");
{
  const Run = async () => {
    ClearRifleSlings();
    const w = await Setup();
    for (let f = 0; f < 90; f += 1) Step(w, 1 / 60, 3.2 * THREE.MathUtils.clamp((f - 30) / 18, 0, 1));
    return Float64Array.from(w.cloth.rope.p);
  };
  const a = await Run(), b = await Run();
  let same = a.length === b.length;
  for (let i = 0; same && i < a.length; i += 1) same = a[i] === b[i];
  Check(same, "同样的输入两次结果逐位相同");
  ClearRifleSlings();
}

// Regression: an open hem has local top/bottom faces, not infinite separating planes.
console.log("--- 6. 局部碰撞、换身体与释放");
{
  const rope = new SlingRope(4);
  rope.SetSamples({ count: 1, position: new Float32Array([0, 0, 0]), normal: new Float32Array([0, 1, 0]) });
  rope.p.set([0, 0.05, 0, 0.085, -0.02, 0, 0.01, -0.02, 0, 0, 0.05, 0]);
  rope.RefreshCandidates(); rope.PickPlanes(); rope.Collide();
  Check(rope.p[4] === -0.02 && rope.plane[1] === -1, "下摆切平面不会延伸到侧面空处推开带子");
  Check(Math.abs(rope.p[7] - rope.radius) < 1e-9, "局部采样范围内仍挡住身体");
}
{
  const w = await Setup(); Step(w, 1 / 60);
  const previousBody = w.cloth.samples.meshes[0], replacement = previousBody.clone(false);
  previousBody.visible = false; previousBody.parent.add(replacement);
  w.cloth.rope.segment = 1;
  for (let f = 0; f < CFG.candidateRefreshFrames + 1; f++) Step(w, 1 / 60);
  Check(w.cloth.samples.meshes.includes(replacement) && !w.cloth.samples.meshes.includes(previousBody)
    && w.cloth.rope.segment < 0.1 && w.cloth.ready, "异步换可见身体时重新量绳长、重挎");
  ClearRifleSlings();
}
for (const disabled of [false, true]) {
  const w = await Setup(5);
  Step(w, 1 / 60);
  SetRifleSlingClothEnabled(false);
  Check(w.sling.layers.mask === 5, "关闭模拟恢复原有全部渲染层");
  if (!disabled) { SetRifleSlingClothEnabled(true); Step(w, 1 / 60); }
  const simulatedMesh = w.cloth.mesh;
  w.gltf.scene.removeFromParent();
  for (let f = 0; f <= Math.ceil(CFG.disposeAfterS * 60) + 1; f++) StepRifleSlings(1 / 60, w.camera);
  Check(RifleSlingClothStats().count === 0 && !simulatedMesh.parent && w.sling.layers.mask === 5,
    `整个人物移出场景会释放带子与骨架（模拟${disabled ? "关闭" : "开启"}时）`);
  ClearRifleSlings();
}
{
  const w=await Setup(); Step(w,1/60);
  w.camera.position.x=CFG.simRangeM+10; Step(w,1/60);
  w.cloth.rope.segment=1;
  for(let f=0;f<20;f++)Step(w,1/60);
  w.camera.position.x=2; Step(w,1/60);
  Check(w.cloth.ready&&w.cloth.rope.segment<.1&&Measure(w).pin<1e-6,"远距冻结后接近时按当前姿态重新贴合");
  ClearRifleSlings();
}

{
  const w=await Setup(),mount=w.sling.parent,local=w.sling.matrix.clone();
  SetRifleSlingAnchors(w.sling,mount,local);
  w.sling.position.x+=.15; Step(w,1/60);
  const anchorMatrix=new THREE.Matrix4().multiplyMatrices(mount.matrixWorld,local),wanted=new THREE.Vector3(),actual=new THREE.Vector3();
  let error=0;
  for(const i of [0,w.cloth.rope.count-1]) {
    wanted.fromArray(w.cloth.rest.points,i*3).applyMatrix4(anchorMatrix);
    actual.setFromMatrixPosition(w.cloth.bones[i].matrixWorld);error=Math.max(error,wanted.distanceTo(actual));
  }
  Check(error<1e-6,"身体贴合参考带反推时，两个端点仍跟着实际枪架",`${F(error*1000,3)} mm`);
  ClearRifleSlings();
}
console.log('--- 7. 实际汉阳造前后背带环');
{
  const bytes=StripTextures(fs.readFileSync(new URL('./Model/HanYang173R/Model_HanYang173R.glb',import.meta.url)));
  const model=await new GLTFLoader().parseAsync(bytes,'');model.scene.updateMatrixWorld(true);
  const wood=[];
  model.scene.traverse(mesh=>{
    if(!mesh.isMesh||!/Wood/.test(mesh.name))return;
    const geometry=mesh.geometry,index=geometry.index,count=index?index.count:geometry.attributes.position.count;
    for(let i=0;i<count;i+=3){
      const vertices=[0,1,2].map(j=>mesh.getVertexPosition(index?index.getX(i+j):i+j,new THREE.Vector3()).applyMatrix4(mesh.matrixWorld));
      wood.push(new THREE.Triangle(...vertices));
    }
  });
  for(const end of ['front','rear']){
    const spec=RIFLE_SLING_MOUNTS.HanYang[end],loop=model.scene.getObjectByName(spec.part),point=new THREE.Vector3().fromArray(spec.position);
    Check(!!loop?.isMesh,`汉阳造 ${end} 使用原枪金属背带环部件`);
    const box=new THREE.Box3().setFromObject(loop),center=box.getCenter(new THREE.Vector3());
    let clearance=Infinity;
    for(let i=0;i<loop.geometry.attributes.position.count;i++)clearance=Math.min(clearance,loop.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(loop.matrixWorld).distanceTo(point));
    Check(center.distanceTo(point)<.00001&&clearance>.0035&&clearance<.012,`汉阳造 ${end} 定位于实测环孔`,`${F(clearance*1000,2)} mm 净半径`);
  }
  const w=await Setup(),mount=w.sling.parent;w.scene.updateMatrixWorld(true);
  const gun=model.scene;mount.add(gun);gun.rotation.set(-Math.PI/2,0,0);gun.scale.setScalar(1/mount.getWorldScale(new THREE.Vector3()).y);
  SetRifleSlingWeapon(w.sling,gun,'HanYang');
  let error=0,maxStretch=0,woodCrossings=0;
  for(let frame=0;frame<120;frame++){
    Step(w,1/60,frame>30?3.2:0);
    for(const [end,i] of [['front',0],['rear',31]]){
      const wanted=SlingPinPosition(RIFLE_SLING_MOUNTS.HanYang[end]).applyMatrix4(gun.matrixWorld);
      error=Math.max(error,wanted.distanceTo(new THREE.Vector3().setFromMatrixPosition(w.cloth.bones[i].matrixWorld)));
    }
    maxStretch=Math.max(maxStretch,w.cloth.rope.Stats().maxStretch);
    if(frame%30===0||frame===119){
      const r=w.cloth.rope,ray=new THREE.Ray(),hit=new THREE.Vector3();
      for(const i of [0,1,2,28,29,30]){
        ray.origin.fromArray(r.p,i*3).applyMatrix4(r.gun.toGun);
        const end=new THREE.Vector3().fromArray(r.p,(i+1)*3).applyMatrix4(r.gun.toGun),length=end.distanceTo(ray.origin);
        ray.direction.subVectors(end,ray.origin).normalize();
        for(const triangle of wood)if(ray.intersectTriangle(triangle.a,triangle.b,triangle.c,false,hit)){
          const along=hit.distanceTo(ray.origin);if(along>.0001&&along<length-.0001)woodCrossings++;
        }
      }
    }
  }
  Check(error<1e-6&&Number.isFinite(maxStretch)&&maxStretch<1.25,'真实武器缩放与背架旋转下，跑动两端始终钉在金属环',`${F(error*1000,4)} mm / ${F(maxStretch,3)} stretch`);
  Check(wood.length>0&&woodCrossings===0,'两端绳段不穿越实际汉阳造木托三角面',`${woodCrossings} 处 / ${wood.length} 木托三角`);
  ClearRifleSlings();
}
// The legacy Type38 has no named swivel nodes. Reconstruct welded loose components
// independently of its material labels (the two actual U-loops are in the wood batch).
function TzmMeshes(id){
  const doc=JSON.parse(fs.readFileSync(new URL(`./Model/Model_${id}.tzm.json`,import.meta.url),'utf8')),matrices=[];
  return doc.nodes.flatMap((node,index)=>{
    const matrix=new THREE.Matrix4().compose(new THREE.Vector3().fromArray(node.t),new THREE.Quaternion().setFromEuler(new THREE.Euler(...node.r)),new THREE.Vector3(1,1,1));
    if(node.parent>=0)matrix.premultiply(matrices[node.parent]);matrices[index]=matrix;
    return (node.meshes||[]).map(id=>{
      const mesh=doc.meshes[id],bytes=Buffer.from(mesh.pos,'base64'),points=[];
      for(let i=0;i<mesh.count;i++)points.push(new THREE.Vector3(...[0,1,2].map(axis=>bytes.readUInt16LE((i*3+axis)*2)*mesh.posScale[axis]+mesh.posMin[axis])).applyMatrix4(matrix));
      const raw=Buffer.from(mesh.idx,'base64'),stride=mesh.idxBits/8,indices=[];
      for(let i=0;i<raw.length;i+=stride)indices.push(stride===2?raw.readUInt16LE(i):raw.readUInt32LE(i));
      return {points,indices};
    });
  });
}
{
  const components=[];
  for(const {points,indices} of TzmMeshes('Type38')){
    const welded=new Map(),canonical=[],parent=[];
    points.forEach((p,i)=>{const key=p.toArray().map(v=>Math.round(v*1e5)).join(',');let at=welded.get(key);if(at===undefined){at=i;welded.set(key,i);}canonical[i]=at;parent[i]=i;});
    const Root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
    for(let i=0;i<indices.length;i+=3){const root=Root(canonical[indices[i]]);for(let j=1;j<3;j++)parent[Root(canonical[indices[i+j]])]=root;}
    const boxes=new Map();points.forEach((p,i)=>{const root=Root(canonical[i]);if(!boxes.has(root))boxes.set(root,new THREE.Box3());boxes.get(root).expandByPoint(p);});
    for(const box of boxes.values()){const size=box.getSize(new THREE.Vector3());if(size.x>.03&&size.x<.05&&size.y>.01&&size.y<.03&&size.z<.01)components.push(box);}
  }
  for(const end of ['front','rear']){
    const candidates=components.filter(box=>{const c=box.getCenter(new THREE.Vector3());return end==='front'?c.z<-.5&&c.z>-.75&&c.y<.01:c.z>0&&c.z<.12&&c.y<-.04;});
    Check(candidates.length===1&&candidates[0].getCenter(new THREE.Vector3()).distanceTo(new THREE.Vector3().fromArray(RIFLE_SLING_MOUNTS.Type38[end].position))<.00001,
      `三八式 ${end} 挂点对齐独立焊接还原的现有 U 形环`);
  }
  const points=TzmMeshes('ZhongZheng').flatMap(mesh=>mesh.points);
  for(const [end,name] of [['front','SlingFlat_LashingFront'],['rear','SlingFlat_LashingRear']]){
    const spec=RIFLE_SLING_MOUNTS.ZhongZheng[end],section=points.filter(p=>Math.abs(p.z-spec.bindingPosition[2])<.006);
    const stock=new THREE.Box3().setFromPoints(section),lashing=new THREE.Box3().setFromObject(flatSource.scene.getObjectByName(name));
    lashing.translate(new THREE.Vector3().fromArray(spec.bindingPosition));
    Check(section.length>0&&lashing.min.x<stock.min.x&&lashing.max.x>stock.max.x&&lashing.min.y<stock.min.y&&lashing.max.y>stock.max.y,
      `中正式 ${end} 实体捆扎圈围住实际护箍或枪托截面`);
  }
}
console.log(`\n${checks} checks passed`);
