// ===========================================================================
// Script_BlanketClothTest.mjs —— 单被布料模拟（Script_BlanketCloth，2026-10-21）的门禁（纯 Node，秒级）
//
//   node Taierzhuang1938/Script_BlanketClothTest.mjs
//
// 口径：docs/Data_SingleBlanket.md「游戏内实时模拟」、docs/Data_EditorBlockout.md §5.6。三层：
//   1. 绑定：真 GLTFLoader 解析真 Model_SingleBlanket.glb（贴图剥掉，Node 里不解图），BlanketClothRig 按逆绑定矩阵
//      排出 18 × 12 骨格、四个角对上角骨、静止朝向是单位阵；被子整体挪 / 转之后重铺再写回骨头，CPU 蒙皮出来的每个顶点
//      = 静止顶点 × 被子的世界矩阵（写骨头的那套矩阵没算错）；
//   2. 弯曲：把质点摆成绕横轴的圆筒，写回骨头后蒙皮出来的顶点离轴 ≈ 半径、法线朝外（骨头跟着布面转了，光照对；
//      只平移不转的话法线全朝上）；
//   3. 求解器：平铺不动保持平铺；1 m 高落下落平、不穿地；两角钉在 0.77 m 高的「手」上、身上躺个人往前拖 6 s：
//      被角在手里、尾巴贴地、没对折、身下压住的布在、拉长有上限、不出 NaN；重铺时和身体交叠不把布弹上天（限速）；
//      路边 0.5 m 高的实心块不当地面、0.2 m 的台阶当地面；同样的输入两次结果逐位相同；每帧耗时。
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
const { BLANKET_CLOTH, ClothGrid, BlanketClothRig } = await import("./Script_BlanketCloth.mjs");
hooks.deregister();

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
const glb = StripTextures(fs.readFileSync(new URL("./Model/Model_SingleBlanket.glb", import.meta.url)));
const gltf = await new Promise((resolve, reject) => new GLTFLoader().parse(glb, "", resolve, reject));

// ---------------------------------------------------------------------------
// 1. 绑定
// ---------------------------------------------------------------------------
console.log("--- 1. 绑定");
const holder = new THREE.Group();
holder.add(gltf.scene);
const rig = new BlanketClothRig(gltf.scene);
const mesh = rig.mesh, skeleton = mesh.skeleton;
Check(rig.rows === 18 && rig.cols === 12 && rig.bones.length === 216, "骨格 18 行 × 12 列 = 216 根变形骨（Root 另算）", `${rig.rows} × ${rig.cols}`);
Check(rig.bones.every(b => b.parent && /Blanket_Root$/.test(b.parent.name)), "216 根都直接挂在 Blanket_Root 下");
const name = (i) => rig.bones[i].name;
Check(/CornerHeadL$/.test(name(rig.corners.headL)) && /CornerHeadR$/.test(name(rig.corners.headR))
  && /CornerTailL$/.test(name(rig.corners.tailL)) && /CornerTailR$/.test(name(rig.corners.tailR)),
  "按静止位置排出来的四个角 = 四根角骨", ["headL", "headR", "tailL", "tailR"].map(k => name(rig.corners[k])).join(" "));
Check(rig.restRotations.every(q => q.angleTo(new THREE.Quaternion()) < 1e-6), "每根变形骨的静止朝向是单位阵（Frame × 静止朝向 = Frame）");
{
  const r = rig.cloth.rest;
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity, maxY = 0;
  for (let i = 0; i < rig.cloth.n; i++) { minX = Math.min(minX, r[i * 3]); maxX = Math.max(maxX, r[i * 3]); minZ = Math.min(minZ, r[i * 3 + 2]); maxZ = Math.max(maxZ, r[i * 3 + 2]); maxY = Math.max(maxY, Math.abs(r[i * 3 + 1])); }
  const head = new THREE.Vector3().fromArray(r, rig.corners.headL * 3);
  Check(Math.abs(maxX - 0.7) < 1e-4 && Math.abs(minX + 0.7) < 1e-4 && Math.abs(maxZ - 0.95) < 1e-4 && Math.abs(minZ + 0.95) < 1e-4 && maxY < 1e-6
    && head.x > 0 && head.z > 0, "质点静止位置铺满 1.4 × 1.9 m、在 y = 0，头端 +Z、L 角在 +X", `x ${F(minX)}…${F(maxX)} z ${F(minZ)}…${F(maxZ)}`);
}
const position = mesh.geometry.attributes.position, normal = mesh.geometry.attributes.normal;
function SkinAll() {
  holder.updateMatrixWorld(true);
  const out = [], nOut = [];
  const v = new THREE.Vector3(), m = new THREE.Matrix4(), acc = new THREE.Matrix4(), nm = new THREE.Matrix3();
  const si = mesh.geometry.attributes.skinIndex, sw = mesh.geometry.attributes.skinWeight;
  const boneM = skeleton.bones.map((bone, k) => new THREE.Matrix4().multiplyMatrices(bone.matrixWorld, skeleton.boneInverses[k]));
  for (let i = 0; i < position.count; i++) {
    v.fromBufferAttribute(position, i);
    mesh.applyBoneTransform(i, v);
    out.push(v.clone().applyMatrix4(mesh.matrixWorld));
    // 法线：权重混合的骨矩阵（GPU 蒙皮的同一套）
    acc.set(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
    for (let s = 0; s < 4; s++) {
      const w = sw.getComponent(i, s);
      if (!w) continue;
      m.copy(boneM[si.getComponent(i, s)]);
      for (let e = 0; e < 16; e++) acc.elements[e] += m.elements[e] * w;
    }
    nm.setFromMatrix4(acc);
    nOut.push(new THREE.Vector3().fromBufferAttribute(normal, i).applyMatrix3(nm).normalize());
  }
  return { positions: out, normals: nOut };
}
{
  holder.position.set(3.2, 1.1, -2.4);
  holder.rotation.set(0, Math.PI, 0);
  gltf.scene.position.set(0, 0.005, 0);
  holder.updateMatrixWorld(true);
  rig.cloth.Reset(rig.AssetToWorld());
  rig.Apply();
  const { positions, normals } = SkinAll();
  const world = mesh.matrixWorld;
  let err = 0, nErr = 0;
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < position.count; i++) {
    err = Math.max(err, positions[i].distanceTo(new THREE.Vector3().fromBufferAttribute(position, i).applyMatrix4(world)));
    nErr = Math.max(nErr, normals[i].angleTo(up));
  }
  Check(err < 1e-5, "被子整体挪、转 180° 后重铺写回骨头：蒙皮出来的 3111 个顶点 = 静止顶点 × 被子世界矩阵", `最大偏差 ${err.toExponential(2)} m`);
  Check(nErr < 1e-4, "平铺时法线全朝上", `最大偏角 ${nErr.toExponential(2)} rad`);
}

// ---------------------------------------------------------------------------
// 2. 弯曲：绕横轴（资产 X）卷成半径 R 的圆筒
// ---------------------------------------------------------------------------
console.log("--- 2. 弯曲");
{
  const R = 0.6, world = rig.AssetToWorld(), cloth = rig.cloth;
  const P = new THREE.Vector3();
  for (let i = 0; i < cloth.n; i++) {
    const x = cloth.rest[i * 3], z = cloth.rest[i * 3 + 2], a = z / R;
    P.set(x, R - R * Math.cos(a), R * Math.sin(a)).applyMatrix4(world).toArray(cloth.x, i * 3);
  }
  rig.Apply();
  const { positions, normals } = SkinAll();
  const inv = world.clone().invert();
  let rErr = 0, nErr = 0;
  const a = new THREE.Vector3(), expect = new THREE.Vector3(), worldRot = new THREE.Matrix3().setFromMatrix4(world);
  for (let i = 0; i < position.count; i++) {
    a.copy(positions[i]).applyMatrix4(inv);
    const dy = a.y - R, dz = a.z;
    rErr = Math.max(rErr, Math.abs(Math.hypot(dy, dz) - R));
    expect.set(0, -dy, -dz).normalize().applyMatrix3(worldRot).normalize();   // 布面朝外（静止时朝上的那面）= 指向轴
    nErr = Math.max(nErr, normals[i].angleTo(expect));
  }
  Check(rErr < 0.006, "卷成 R = 0.6 m 的圆筒：蒙皮出来的顶点离轴 = R（骨间按双线性 + 骨头朝向插值）", `最大偏差 ${(rErr * 1000).toFixed(2)} mm`);
  Check(nErr < 6 * Math.PI / 180, "法线跟着布面转（骨头取布面标架）", `最大偏角 ${(nErr * 180 / Math.PI).toFixed(2)}°`);
}

// ---------------------------------------------------------------------------
// 3. 求解器（真骨格的静止位置；地面 y = 0）
// ---------------------------------------------------------------------------
console.log("--- 3. 求解器");
const rows = rig.rows, cols = rig.cols, rest = rig.cloth.rest;
const off = BLANKET_CLOTH.groundOffsetM;
const Flat = () => 0;
const Has = (arr) => arr.every(Number.isFinite);
function Speed(cloth) { let m = 0; for (let i = 0; i < cloth.n; i++) m = Math.max(m, Math.hypot(cloth.v[i * 3], cloth.v[i * 3 + 1], cloth.v[i * 3 + 2])); return m; }
{
  const cloth = new ClothGrid(rest, rows, cols);
  cloth.Reset(new THREE.Matrix4().makeTranslation(0, off, 0));
  for (let f = 0; f < 120; f++) { cloth.SampleGround(Flat); cloth.Step(1 / 60); }
  const s = cloth.Stats();
  Check(Math.abs(s.topM) < 1e-4 && Math.abs(s.lowM) < 1e-4 && Math.abs(s.maxStretch - 1) < 1e-3 && Math.abs(s.minRatio - 1) < 1e-3 && s.contact === cloth.n,
    "平铺、没人碰：2 s 后还是平铺贴地", JSON.stringify({ top: F(s.topM, 5), stretch: F(s.maxStretch), contact: s.contact }));
}
{
  const cloth = new ClothGrid(rest, rows, cols);
  cloth.Reset(new THREE.Matrix4().makeTranslation(0, 1, 0));
  let low = Infinity;
  for (let f = 0; f < 180; f++) { cloth.SampleGround(Flat); cloth.Step(1 / 60); for (let i = 0; i < cloth.n; i++) low = Math.min(low, cloth.x[i * 3 + 1]); }
  const s = cloth.Stats();
  Check(low >= off - 1e-6 && s.topM < 0.02 && Speed(cloth) < 0.05 && s.maxStretch < 1.02, "1 m 高落下：不穿地、落平、停住",
    JSON.stringify({ low: F(low), top: F(s.topM), speed: F(Speed(cloth)), stretch: F(s.maxStretch) }));
}
/** 往 +Z 拖：两角钉在拳头上（片段的拳头：中线旁 0.74（两手收到 1.04 倍被头宽）、离地 0.77、被子中心前 1.56 m），身上躺个人。 */
function Drag({ seconds = 6, hold = BLANKET_CLOTH.bodyHold } = {}) {
  const cloth = new ClothGrid(rest, rows, cols, { bodyHold: hold });
  cloth.Reset(new THREE.Matrix4());
  const V = 1.2, dt = 1 / 60, S = 0.115;
  const Body = (c) => {
    const P = (x, y, z) => new THREE.Vector3(x, y, c + z + S);
    return [
      [P(0, 0.12, -0.05), P(0, 0.13, 0.35), 0.12], [P(0, 0.13, 0.35), P(0, 0.11, 0.58), 0.12], [P(-0.19, 0.1, 0.5), P(0.19, 0.1, 0.5), 0.07],
      [P(0, 0.1, 0.66), P(0, 0.1, 0.78), 0.1], [P(0.09, 0.1, -0.12), P(0.11, 0.08, -0.55), 0.075], [P(-0.09, 0.1, -0.12), P(-0.11, 0.08, -0.55), 0.075],
      [P(0.11, 0.08, -0.55), P(0.12, 0.07, -0.95), 0.055], [P(-0.11, 0.08, -0.55), P(-0.12, 0.07, -0.95), 0.055],
    ];
  };
  let center = 0, ms = 0, frames = 0, pressedMax = 0;
  const L = cloth.Index(0, 0), Rt = cloth.Index(0, cols - 1);
  for (let t = 0; t < seconds; t += dt) {
    const moving = t > 0.9;
    if (moving) center += V * dt;
    const bob = 0.012 * Math.cos(2 * Math.PI * 2 * t / 1.2);
    cloth.SetPin(L, new THREE.Vector3(0.728, 0.77 + bob, center + 1.56));
    cloth.SetPin(Rt, new THREE.Vector3(-0.728, 0.77 + bob, center + 1.56));
    cloth.SetColliders(Body(center).map(([a, b, r]) => ({ a, b, r, press: true, carry: [0, moving ? V : 0] })));
    const t0 = performance.now();
    cloth.SampleGround(Flat);
    cloth.Step(dt);
    ms += performance.now() - t0; frames += 1;
    pressedMax = Math.max(pressedMax, cloth.Stats().pressed);
  }
  return { cloth, center, msPerFrame: ms / frames, pressedMax };
}
{
  const { cloth, center, msPerFrame, pressedMax } = Drag();
  const s = cloth.Stats(), x = cloth.x;
  const pinL = cloth.pins.get(cloth.Index(0, 0)), corner = new THREE.Vector3().fromArray(x, cloth.Index(0, 0) * 3);
  let tailY = 0, tailZ = 0, headZ = 0;
  for (let c = 0; c < cols; c++) { const t = cloth.Index(rows - 1, c), h = cloth.Index(0, c); tailY = Math.max(tailY, x[t * 3 + 1]); tailZ += x[t * 3 + 2] / cols; headZ += x[h * 3 + 2] / cols; }
  Check(Has(x) && Has(cloth.v), "拖 6 s 不出 NaN");
  Check(corner.distanceTo(pinL.target) < 1e-6, "被角在手里（硬钉）", `离手 ${corner.distanceTo(pinL.target).toExponential(2)} m`);
  Check(tailY < off + 0.02, "尾巴拖在地上", `尾行最高 ${F(tailY)} m`);
  Check(headZ - tailZ > 1.2 && headZ > center, "没对折：被头在前、被尾在后", `头尾相距 ${F(headZ - tailZ, 2)} m`);
  Check(pressedMax > 0, "身下有布被压住（人躺在被子上）", `最多 ${pressedMax} 点`);
  Check(s.maxStretch < 1.5 && s.minRatio > 0.5, "相邻质点间距拉长 / 压短有上限", `${F(s.maxStretch, 3)} / ${F(s.minRatio, 3)}`);
  Check(msPerFrame < 3, "每帧（1/60 s，6 个子步 × 10 轮）耗时", `${msPerFrame.toFixed(3)} ms`);
  const again = Drag();
  Check(again.cloth.x.every((v, i) => v === cloth.x[i]), "同样的输入两次结果逐位相同");
}
{
  // 重铺时和身体交叠（人躺的位置比布低、粗胶囊把布整片推开）：限速，布不被弹上天
  const cloth = new ClothGrid(rest, rows, cols);
  cloth.Reset(new THREE.Matrix4().makeTranslation(0, off, 0));
  // 胶囊轴在布下面 0.1 m、半径 0.35：中间一条布第一子步就被往上推 0.2–0.3 m（不限速、不压就是 20 多 m/s，布飞到 3 m 多高）。
  // 运行时重铺之后先 Settle（同 Script_EditorBlockoutBlanket.Simulate），再照常推
  cloth.SetColliders([{ a: new THREE.Vector3(0, -0.1, -0.6), b: new THREE.Vector3(0, -0.1, 0.6), r: 0.35, press: false }]);
  let top = 0, vmax = 0;
  cloth.Settle(BLANKET_CLOTH.settleS, () => { cloth.SampleGround(Flat); top = Math.max(top, cloth.Stats().topM); vmax = Math.max(vmax, Speed(cloth)); });
  for (let f = 0; f < 90; f++) { cloth.SampleGround(Flat); cloth.Step(1 / 60); top = Math.max(top, cloth.Stats().topM); vmax = Math.max(vmax, Speed(cloth)); }
  Check(vmax <= BLANKET_CLOTH.maxSpeedMps + 1e-6 && top > 0.15 && top < 0.5, "重铺时和身体交叠：布被推到身上，速度不超过上限、不被弹上天",
    `最快 ${F(vmax, 2)} m/s、最高 ${F(top, 2)} m（胶囊顶 ${F(-0.1 + 0.35 + BLANKET_CLOTH.bodyMarginM, 2)} m）`);
}
{
  const cloth = new ClothGrid(rest, rows, cols);
  cloth.Reset(new THREE.Matrix4().makeTranslation(0, off, 0));
  cloth.SampleGround(Flat, true);
  const box = (x, z) => (x > 0.2 ? 0.5 : 0), step = (x, z) => (x > 0.2 ? 0.2 : 0);
  cloth.SampleGround(box);
  const right = [...Array(cloth.n).keys()].filter(i => cloth.x[i * 3] > 0.25);
  Check(right.every(i => cloth.groundTarget[i] < off + 1e-6), "路边 0.5 m 高的实心块不当地面（布不会一下子蹦上去）");
  cloth.SampleGround(step);
  Check(right.every(i => Math.abs(cloth.groundTarget[i] - (0.2 + off)) < 1e-6), "0.2 m 的台阶当地面");
  let up = 0, top = 0;
  for (let f = 0; f < 60; f++) {
    cloth.Step(1 / 60);
    for (let i = 0; i < cloth.n; i++) up = Math.max(up, cloth.v[i * 3 + 1]);
    top = Math.max(top, ...right.map(i => cloth.x[i * 3 + 1] - cloth.groundY[i]));
    cloth.SampleGround(step);
  }
  Check(up <= BLANKET_CLOTH.groundRiseMps + 0.2 && top < 0.05, "拖上 0.2 m 的台阶：地面渐进抬，布不被顶飞、旁边的点也不被拽飞",
    `往上最快 ${F(up, 2)} m/s、离台阶面最高 ${F(top, 3)} m`);
}
console.log(`\n${checks} checks passed`);
