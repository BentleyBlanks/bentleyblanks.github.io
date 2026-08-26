// 模型管线自检：真浏览器把 Model/ 下每个 .tzm.json 都加载一遍，
// 用**真材质**（MaterialLibrary 烘出来的那套）建网格、真渲染一帧，
// 从 renderer.info 读三角数与 draw call。
//
// 为什么非要真浏览器：
//   shader 编译失败 three 是**静默吞掉**的（GL 1282 不抛异常），页面照跑、
//   画面没了。node --check 完全测不出来。而换模恰恰是最容易碰 shader 的一步 ——
//   合批后的几何属性布局（uv1、索引位宽）一旦不对，就是这种静默事故。
//
// 用法：node Taierzhuang1938/_blender/Verify.mjs
// 退出码即成败。
//
// 这个文件**不落任何 HTML 到磁盘**：测试页用 page.route 在真 origin 上凭空
// 兜出来，这样相对 import 照常走本地静态服，也不用往仓里塞一个只有测试看的壳。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "../Script_DevServer.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.resolve(here, "..");
const rootDir = path.resolve(projectDir, "..");

let failed = 0;
const Report = (ok, line) => {
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${line}`);
};

// ---------------------------------------------------------------------------
// 第一关：Data_Meshes.mjs 与 Blender 刚写的 Model/Index.json 必须对得上。
// 手写清单最经典的翻车是「改了建模脚本没更新表」，那会一路无声地滑到运行时。
// ---------------------------------------------------------------------------
const indexPath = path.join(projectDir, "Model", "Index.json");
if (!fs.existsSync(indexPath)) {
  console.log("FAIL Model/Index.json 不存在 —— 先跑 BuildAll.py");
  process.exit(1);
}
const buildIndex = JSON.parse(fs.readFileSync(indexPath, "utf8"));
const { MESHES } = await import(path.join(projectDir, "Data_Meshes.mjs").replace(/\\/g, "/").replace(/^/, "file:///"));

const built = new Map(buildIndex.models.map((m) => [m.name, m]));
for (const [id, entry] of Object.entries(MESHES)) {
  const b = built.get(id);
  if (!b) { Report(false, `${id}：Data_Meshes 里有，Index.json 里没有`); continue; }
  const problems = [];
  if (b.triangles !== entry.triangles) problems.push(`三角 ${b.triangles}≠${entry.triangles}`);
  if (b.meshBlocks !== entry.meshBlocks) problems.push(`网格块 ${b.meshBlocks}≠${entry.meshBlocks}`);
  if (b.nodes !== entry.nodes) problems.push(`节点 ${b.nodes}≠${entry.nodes}`);
  if (b.joints !== entry.joints) problems.push(`关节 ${b.joints}≠${entry.joints}`);
  const span = [b.bounds.max[0] - b.bounds.min[0], b.bounds.max[1] - b.bounds.min[1],
                b.bounds.max[2] - b.bounds.min[2]];
  for (let a = 0; a < 3; a += 1) {
    if (Math.abs(span[a] - entry.span[a]) > 0.005) {
      problems.push(`尺寸[${a}] ${span[a].toFixed(3)}≠${entry.span[a]}`);
    }
  }
  const mats = [...b.materials].sort().join(",");
  if (mats !== [...entry.materials].sort().join(",")) problems.push(`材质 ${mats}`);
  Report(problems.length === 0, `清单一致 ${id}${problems.length ? "  << " + problems.join("; ") : ""}`);
}
for (const name of built.keys()) {
  if (!MESHES[name]) Report(false, `${name}：Index.json 里有，Data_Meshes 里漏登记`);
}

// 川军脚部的史实造型不能只靠注释约定：左右踝节点必须同时保留裸足皮肤与草鞋
// 两个材质桶，否则以后重建模型时很容易又合回一整块布鞋/皮鞋而没人察觉。
const nraPath = path.join(projectDir, "Model", MESHES.SoldierNra.file);
const nraDoc = JSON.parse(fs.readFileSync(nraPath, "utf8"));
const StrawSandalMaterials = (nodeName) => {
  const node = nraDoc.nodes.find((entry) => entry.name === nodeName);
  return new Set((node?.meshes || []).map((meshIndex) => nraDoc.meshes[meshIndex]?.material));
};
const sandalNodesOk = ["ankleL", "ankleR"].every((nodeName) => {
  const materials = StrawSandalMaterials(nodeName);
  return materials.has("skin") && materials.has("shoe");
});
Report(sandalNodesOk && /露趾草鞋/.test(nraDoc.notes || ""),
  "川军左右脚均为裸足皮肤 + 露趾草鞋双材质");

// 钢盔扣不扣得住颅骨：低多边形的头饰与头是两个独立放样体，**贴着建**的话
// 分面一削就穿，穿出来的是盔体后半一条肉色折线 —— 只有从后上方（低头看脚边的
// 尸体）才看得见，三角数、包围盒、材质桶全部正常，所以一路漏到了 2026-08-27：
// HeadShape 每一圈都带向后的 cz 偏移（颅骨本来就往后鼓），而 Type90Helmet 绕
// 自己的轴正着建，两者在后脑相切，最深处穿出 2.3 mm。
//
// 判据：把头顶点投到水平面上，从中轴朝它自己的方向投一条射线打盔体三角，
// 余量 = 盔内壁距离 − 顶点距离。只算盔覆盖得到的高度（脸和下颌本来就露着）。
// 阈值 1 mm 是「肉眼绝对看不出」与「别把盔建成头套」之间的下限。修的那一轮
// 另跑过一遍面上密采样（每个头三角 21 个重心点），结果与顶点法一致到微米，
// 所以这里只取顶点 —— 最坏点总落在头最宽那两圈的顶点上。
const HeadgearClearanceMm = (doc, headName, gearName) => {
  const nodeIndex = (name) => doc.nodes.findIndex((node) => node.name === name);
  const head = nodeIndex(headName);
  const gear = nodeIndex(gearName);
  if (head < 0 || gear < 0) return null;
  const offset = [0, 0, 0];
  for (let cur = gear; cur !== head; cur = doc.nodes[cur].parent) {
    const node = doc.nodes[cur];
    // 这条链上全是纯平移节点；真出现旋转就别硬算，交给人去看。
    if (node.r.some((value) => Math.abs(value) > 1e-9)) return null;
    for (let a = 0; a < 3; a += 1) offset[a] += node.t[a];
  }
  const Positions = (mesh, shift) => {
    const bytes = Buffer.from(mesh.pos, "base64");
    const out = [];
    for (let i = 0; i < mesh.count; i += 1) {
      out.push([0, 1, 2].map((a) => mesh.posMin[a]
        + mesh.posScale[a] * bytes.readUInt16LE(i * 6 + a * 2) + shift[a]));
    }
    return out;
  };
  const Triangles = (mesh, shift) => {
    const verts = Positions(mesh, shift);
    const bytes = Buffer.from(mesh.idx, "base64");
    const wide = mesh.idxBits === 32;
    const step = wide ? 4 : 2;
    const Read = (i) => (wide ? bytes.readUInt32LE(i * step) : bytes.readUInt16LE(i * step));
    const out = [];
    for (let i = 0; i < mesh.idxCount; i += 3) {
      out.push([verts[Read(i)], verts[Read(i + 1)], verts[Read(i + 2)]]);
    }
    return out;
  };
  const headVerts = doc.nodes[head].meshes
    .flatMap((index) => Positions(doc.meshes[index], [0, 0, 0]));
  const gearTris = doc.nodes[gear].meshes
    .flatMap((index) => Triangles(doc.meshes[index], offset));
  const ys = gearTris.flatMap((tri) => tri.map((v) => v[1]));
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  // Möller–Trumbore，双面（盔是零厚度的壳，正反面都得算命中）
  const Hit = (origin, dir, [a, b, c]) => {
    const e1 = [0, 1, 2].map((i) => b[i] - a[i]);
    const e2 = [0, 1, 2].map((i) => c[i] - a[i]);
    const Cross = (u, v) => [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2],
      u[0] * v[1] - u[1] * v[0]];
    const Dot = (u, v) => u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    const pv = Cross(dir, e2);
    const det = Dot(e1, pv);
    if (Math.abs(det) < 1e-12) return null;
    const inv = 1 / det;
    const tv = [0, 1, 2].map((i) => origin[i] - a[i]);
    const u = Dot(tv, pv) * inv;
    if (u < -1e-9 || u > 1 + 1e-9) return null;
    const qv = Cross(tv, e1);
    const v = Dot(dir, qv) * inv;
    if (v < -1e-9 || u + v > 1 + 1e-9) return null;
    const t = Dot(e2, qv) * inv;
    return t > 1e-9 ? t : null;
  };
  let worst = Infinity;
  for (const [x, y, z] of headVerts) {
    const r = Math.hypot(x, z);
    if (r < 1e-6 || y < yMin || y > yMax) continue;
    const dir = [x / r, 0, z / r];
    let inner = Infinity;
    for (const tri of gearTris) {
      const t = Hit([0, y, 0], dir, tri);
      if (t !== null && t < inner) inner = t;
    }
    if (inner === Infinity) continue;      // 这个方位盔体没有壁（帽檐缺口）
    worst = Math.min(worst, inner - r);
  }
  return worst === Infinity ? null : worst * 1000;
};
const ijaPath = path.join(projectDir, "Model", MESHES.SoldierIja.file);
const ijaDoc = JSON.parse(fs.readFileSync(ijaPath, "utf8"));
const helmetClearance = HeadgearClearanceMm(ijaDoc, "head", "helmet");
Report(helmetClearance !== null && helmetClearance >= 1.0,
  `九〇式钢盔扣得住颅骨（最小余量 ${helmetClearance === null ? "量不出来" : helmetClearance.toFixed(2) + " mm"} ≥ 1.00 mm）`);

// CGMOL 大刀靠原模型的 UV atlas 才能正确读取专用法线/粗糙度。退回盒投影时
// UV 会跑到 -20..20；只看三角数与包围盒完全发现不了，必须锁定这里。
const dadaoPath = path.join(projectDir, "Model", MESHES.Dadao.file);
const dadaoDoc = JSON.parse(fs.readFileSync(dadaoPath, "utf8"));
const dadaoMaterials = new Set(dadaoDoc.meshes.map((mesh) => mesh.material));
const dadaoUvAuthored = dadaoDoc.meshes.every((mesh) => {
  const uvMax = mesh.uvMin.map((value, axis) => value + mesh.uvScale[axis] * 65535);
  return mesh.uvMin.every((value) => value >= -0.01)
    && uvMax.every((value) => value <= 1.01);
});
Report(dadaoMaterials.size === 1 && dadaoMaterials.has("dadao") && dadaoUvAuthored,
  "CGMOL 大刀保留 0–1 源 UV，并使用单一 dadao 材质桶");

// FBX 刀片 751 个角里有 543 个自定义分裂法线，不等同于 Blender 按 smooth
// 重算的顶点法线。导入时若经 BMesh 丢掉它们，法线贴图的切线基底就会错，刀面
// 在 Debug Rendering 里重新出现大块三角明暗。量化后的同位置多法线点不少于
// 100 个，既锁住逐角法线，也会抓住枪械通用补倒角再次改坏原拓扑的回归。
const dadaoSplitNormalPositions = dadaoDoc.meshes.reduce((total, mesh) => {
  const positions = Buffer.from(mesh.pos, "base64");
  const normals = Buffer.from(mesh.nrm, "base64");
  const byPosition = new Map();
  for (let i = 0; i < mesh.count; i += 1) {
    const position = `${positions.readUInt16LE(i * 6)},${positions.readUInt16LE(i * 6 + 2)},`
      + `${positions.readUInt16LE(i * 6 + 4)}`;
    const normal = `${normals.readInt8(i * 3)},${normals.readInt8(i * 3 + 1)},`
      + `${normals.readInt8(i * 3 + 2)}`;
    if (!byPosition.has(position)) byPosition.set(position, new Set());
    byPosition.get(position).add(normal);
  }
  return total + [...byPosition.values()].filter((values) => values.size > 1).length;
}, 0);
Report(dadaoSplitNormalPositions >= 100,
  `CGMOL 大刀保留 FBX 逐角法线（同位置多法线点 ${dadaoSplitNormalPositions}）`);

// ---------------------------------------------------------------------------
// 第二关：真浏览器
// ---------------------------------------------------------------------------
const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 800, height: 600 } });

const problems = [];
page.on("pageerror", (error) => problems.push(`PAGEERROR ${String(error).slice(0, 300)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const where = message.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)/.test(where)) return;
  // 兜底用例是**故意**去请求一个不存在的模型，浏览器为此报的那条网络 404
  // 是用例本身的产物，不是事故。放行它，别放行别的。
  if (/NoSuchModel/.test(where) || /NoSuchModel/.test(message.text())) return;
  problems.push(`CONSOLE ${message.text().slice(0, 300)}`);
});

const harness = `<!doctype html><html><head><meta charset="utf-8">
<script type="importmap">{"imports":{
  "three":"/Taierzhuang1938/vendor/three/build/three.module.js",
  "./vendor/three/build/three.core.js":"/Taierzhuang1938/vendor/three/build/three.core.js"
}}</script></head><body><canvas id="c"></canvas></body></html>`;

const url = `http://127.0.0.1:${port}/Taierzhuang1938/_verify.html`;
await page.route(url, (route) => route.fulfill({
  status: 200, contentType: "text/html; charset=utf-8", body: harness,
}));
await page.goto(url, { waitUntil: "load", timeout: 60000 });

const result = await page.evaluate(async () => {
  const THREE = await import("./vendor/three/build/three.module.js");
  const { LoadModel, LoadDocument, InstantiateModel } = await import("./Script_MeshLoad.mjs");
  const { MESHES, MODEL_BASE, MERGE_PROFILES } = await import("./Data_Meshes.mjs");
  const { MaterialLibrary } = await import("./Script_Materials.mjs");

  const canvas = document.getElementById("c");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setSize(800, 600, false);
  renderer.shadowMap.enabled = false;      // 阴影会多出几遍 pass，把 draw call 读花
  const scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.0);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(50, 800 / 600, 0.02, 60);

  // 真材质：跑一遍 MaterialLibrary 的烘焙，只烘这几个模型用得到的配方。
  // 拿临时 MeshBasicMaterial 顶替的话，这一关就退化成「几何有没有解出来」，
  // 测不到合批后的属性布局能不能过 shader 编译 —— 而那才是换模最容易炸的地方。
  const library = new MaterialLibrary(renderer, { textureSize: 128 });
  for (const _ of library.PrepareSteps(["ClothNra", "ClothIja", "Steel", "SteelHelmet",
    "WoodStock", "Stone", "WoodBeam", "WoodDoor", "RoofTile"])) { /* 逐配方烘 */ }
  await library.LoadExternalSet("DadaoPbr", {
    albedo: "./Texture/Texture_DadaoBase.webp",
    normal: "./Texture/Texture_DadaoNormal.webp",
    orm: "./Texture/Texture_DadaoOrm.webp",
  });

  const Plain = (name, color, roughness, doubleSide) => library.Plain(name, {
    color, roughness, metalness: 0, side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
  });
  const MaterialsFor = (cloth) => ({
    uniform: library.Get(cloth, { roughness: 1 }),
    accessory: library.Get(cloth, { roughness: 1, repeat: 1.2 }),
    // 百姓那两个模型用的两桶。**必须给** —— 加载器认不出材质名会静默并进
    // uniform，那样量到的 draw call 比运行时少，清单里的 draws 就永远对不上。
    trouser: library.Get(cloth, { roughness: 1, repeat: 1.1 }),
    hair: Plain("hair", 0x26211b, 0.96),
    skin: Plain("skin", 0xB4906C, 0.78),
    shoe: Plain("shoe", 0x2B2B2E, 0.94),
    leather: Plain("leather", 0x3A2C22, 0.66),
    towel: Plain("towel", 0xEDE9DF, 0.95),
    red: Plain("red", 0x9E2B22, 0.92),
    accentA: Plain("accentA", 0x1F3A93, 0.8, true),
    accentB: Plain("accentB", 0xEDEFF2, 0.7, true),
    helmet: library.Get("SteelHelmet", { roughness: 0.72, metalness: 0.85 }),
    steel: library.Get("Steel", { roughness: 0.62, metalness: 0.9 }),
    blade: library.Plain("DadaoBlade", { color: 0x929aa2, roughness: 0.34, metalness: 0.95 }),
    grip: library.Plain("DadaoGrip", { color: 0x8f7c61, roughness: 0.78, metalness: 0 }),
    dadao: library.Get("DadaoPbr", { roughness: 1, metalness: 1, normalScale: 1 }),
    wood: library.Get("WoodStock", { roughness: 0.86, metalness: 0 }),
    Stone: library.Get("Stone", { roughness: 0.92, metalness: 0 }),
    WoodBeam: library.Get("WoodBeam", { roughness: 0.9, metalness: 0 }),
    WoodDoor: library.Get("WoodDoor", { roughness: 0.88, metalness: 0 }),
    RoofTile: library.Get("RoofTile", { roughness: 0.85, metalness: 0 }),
  });

  const out = { models: [], errors: [], glError: 0, programs: 0 };
  renderer.info.autoReset = false;

  for (const [id, entry] of Object.entries(MESHES)) {
    const materials = MaterialsFor(entry.category === "soldier" && id === "SoldierIja"
      ? "ClothIja" : "ClothNra");
    const record = { id, ok: true, notes: [] };
    const perLod = {};
    let sample = null;

    for (const lod of ["high", "medium", "low"]) {
      const model = await LoadModel(MODEL_BASE + entry.file, {
        materials, mergeMap: MERGE_PROFILES[lod],
      });
      if (!model) { record.ok = false; record.notes.push(`${lod} 加载返回 null`); continue; }
      if (lod === "high") sample = model;

      // 视锥剔除会把画不到的网格从 draw call 里剔掉，那样读到的就不是模型的
      // 真实成本了。这一关量的是「这个模型全画出来要几个 draw call」。
      model.root.traverse((o) => { o.frustumCulled = false; });
      scene.add(model.root);
      renderer.info.reset();
      const box = model.bounds || new THREE.Box3().setFromObject(model.root);
      const size = box.getSize(new THREE.Vector3()).length() || 1;
      const center = box.getCenter(new THREE.Vector3());
      camera.position.set(center.x + size, center.y + size * 0.4, center.z + size);
      camera.lookAt(center);
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      perLod[lod] = {
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        loaderDraws: model.draws,
        loaderTris: model.tris,
      };
      scene.remove(model.root);
      if (lod !== "high") {
        for (const mesh of model.meshes) mesh.geometry.dispose();
      }
    }
    record.lod = perLod;

    if (sample) {
      record.triangles = sample.tris;
      record.blocks = sample.blocks;
      record.nodeCount = sample.nodes.size;
      // 挂点在不在
      for (const mount of entry.mounts) {
        if (!sample.nodes.has(mount)) { record.ok = false; record.notes.push(`缺挂点 ${mount}`); }
      }
      for (const joint of (entry.joinNames || [])) {
        if (!sample.nodes.has(joint)) { record.ok = false; record.notes.push(`缺关节 ${joint}`); }
      }
      if (sample.tris !== entry.triangles) {
        record.ok = false;
        record.notes.push(`三角 ${sample.tris}≠${entry.triangles}`);
      }
      // 包围盒：既要有限，也要跟清单里的尺寸对得上（世界矩阵更新后再量一次）
      sample.root.updateMatrixWorld(true);
      const live = new THREE.Box3().setFromObject(sample.root);
      const span = live.getSize(new THREE.Vector3());
      record.span = [span.x, span.y, span.z].map((v) => Number(v.toFixed(4)));
      if (!Number.isFinite(span.x) || !Number.isFinite(span.y) || !Number.isFinite(span.z)) {
        record.ok = false; record.notes.push("包围盒是 NaN");
      } else {
        for (let a = 0; a < 3; a += 1) {
          if (Math.abs(record.span[a] - entry.span[a]) > 0.006) {
            record.ok = false;
            record.notes.push(`尺寸[${a}] ${record.span[a]}≠${entry.span[a]}`);
          }
        }
      }
      // 顶点、法线、包围球逐个查 NaN
      for (const mesh of sample.meshes) {
        const sphere = mesh.geometry.boundingSphere;
        if (!sphere || !Number.isFinite(sphere.radius)) {
          record.ok = false; record.notes.push(`${mesh.name} 包围球 NaN`); break;
        }
        const pos = mesh.geometry.attributes.position.array;
        const nrm = mesh.geometry.attributes.normal.array;
        let bad = false;
        for (let i = 0; i < pos.length; i += 1) if (!Number.isFinite(pos[i])) { bad = true; break; }
        for (let i = 0; i < nrm.length && !bad; i += 1) if (!Number.isFinite(nrm[i])) { bad = true; break; }
        if (bad) { record.ok = false; record.notes.push(`${mesh.name} 顶点含 NaN`); break; }
        // 法线必须是单位向量（反量化时忘了归一化，高光会一片一片地暗下去）
        const len = Math.hypot(nrm[0], nrm[1], nrm[2]);
        if (Math.abs(len - 1) > 0.02) {
          record.ok = false; record.notes.push(`${mesh.name} 法线没归一化 |n|=${len.toFixed(3)}`);
          break;
        }
      }
      if (perLod.high && perLod.high.calls !== entry.draws.high) {
        record.ok = false;
        record.notes.push(`high draw call ${perLod.high.calls}≠${entry.draws.high}`);
      }
      for (const mesh of sample.meshes) mesh.geometry.dispose();
    }
    out.models.push(record);
  }

  // 兜底用例：404 必须返回 null 而不是抛出去。一个模型缺文件不能整页黑屏。
  try {
    const missing = await LoadModel(MODEL_BASE + "NoSuchModel.tzm.json", { materials: {} });
    out.fallbackOk = missing === null;
  } catch (error) {
    out.fallbackOk = false;
    out.errors.push("404 用例抛异常了：" + String(error).slice(0, 160));
  }
  // 坏文档同样要兜住（这里拿 index.html 当「不是 TZM」的输入）
  try {
    const junk = await LoadDocument("./index.html");
    out.junkOk = junk === null;
  } catch (error) {
    out.junkOk = false;
    out.errors.push("坏文档用例抛异常了：" + String(error).slice(0, 160));
  }
  // 合批是否真的在做事：拿士兵比（枪的几何全挂在一个节点上，本来就没得并，
  // 拿它当基准会得出「合批无效」的假结论）。batch:false 同时也是调试看零件的路径。
  try {
    const doc = await LoadDocument(MODEL_BASE + MESHES.SoldierNra.file);
    const materials = MaterialsFor("ClothNra");
    out.unbatchedDraws = InstantiateModel(doc, { materials, batch: false }).draws;
    out.batchedDraws = InstantiateModel(doc, { materials }).draws;
  } catch (error) {
    out.errors.push("batch:false 路径抛异常：" + String(error).slice(0, 160));
  }

  const gl = renderer.getContext();
  out.glError = gl.getError();
  out.programs = renderer.info.programs.length;
  renderer.info.autoReset = true;
  return out;
});

console.log("");
for (const model of result.models) {
  const lod = model.lod || {};
  const line = `${model.id.padEnd(15)} tris=${String(model.triangles).padEnd(5)} `
    + `draws high/med/low = ${lod.high?.calls ?? "?"}/${lod.medium?.calls ?? "?"}/${lod.low?.calls ?? "?"}  `
    + `span=[${(model.span || []).map((v) => v.toFixed(2)).join(", ")}]`
    + (model.notes.length ? `  << ${model.notes.join("; ")}` : "");
  Report(model.ok, line);
}
Report(result.glError === 0, `GL 错误码 ${result.glError}`);
Report(result.programs > 0, `shader 程序编译了 ${result.programs} 个`);
Report(result.fallbackOk === true, "404 兜底返回 null（不抛）");
Report(result.junkOk === true, "非 TZM 文档兜底返回 null（不抛）");
Report(result.batchedDraws < result.unbatchedDraws,
  `合批见效：中方士兵 ${result.unbatchedDraws} → ${result.batchedDraws} draw call`);
for (const error of result.errors) Report(false, error);
for (const p of problems) Report(false, p);

const soldierNra = result.models.find((m) => m.id === "SoldierNra");
const soldierIja = result.models.find((m) => m.id === "SoldierIja");
if (soldierNra && soldierIja) {
  const worst = Math.max(soldierNra.lod.high.calls, soldierIja.lod.high.calls);
  const withWeapon = worst + 2;
  console.log(`\n换模后单人 draw call：中方 ${soldierNra.lod.high.calls} / 日方 ${soldierIja.lod.high.calls}`
    + `（high 档，含帽徽/领章），持枪再 +2 → 最坏 ${withWeapon}。`
    + `\n对比换模前 Script_Actor 的 37，24 人同屏省下约 ${(37 - withWeapon) * 24} 个 draw call。`);
}

await browser.close();
server.close();
console.log(failed === 0 ? "\n模型管线自检全过。" : `\n模型管线自检失败：${failed} 项。`);
process.exit(failed === 0 ? 0 : 1);
