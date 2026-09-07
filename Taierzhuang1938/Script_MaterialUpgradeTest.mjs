// 《台儿庄：血战滕县》材质着色升级回归（2026-09，子系统 B7）。
//
// 查的是**数值**不是观感 —— 这一路的四项全部是"开着和关着都能出画"的东西：
// 视差没生效画面只是变平、微阴影没接上只是砖缝亮一点、皮肤散射失效只是脸偏白。
// 光看截图分不出"没做"和"做了但很轻"，所以每一项都要有一条能算出数的证据。
//
//   1. 源码契约 —— uv 遮蔽、Chan 的微阴影式子、Lagarde 的地平线项、Penner 的差值，
//      以及补丁在注册表里的位置（GI 之后、破口之前）。GLSL 只在浏览器里才编译，
//      改错了 three 是静默吞掉的，所以先在源码这一级锁住算式。
//   2. 纯 Node —— 皮肤 LUT 真的有红移、细节法线不是一张平图、污渍层真的改了像素、
//      烘焙尺寸封顶生效。
//   3. 真浏览器（探针页 `?scene=materials`）——
//      · **视差**：同一面砖墙、同一机位，POM 开/关两张 BaseColor 图做一维互相关，
//        求出砖缝被推了多少像素；再把相机换到镜像的另一侧重做一遍。
//        位移必须 > 0.5 px，而且**两侧反号** —— 那才叫"随视角偏移"，
//        单侧有位移只能证明"图变了"。
//      · **距离淡出**：把墙推到 20 m 外，POM 开/关必须几乎逐像素相同。
//      · **微阴影**：斜射光下直射漫反射（调试视图 10）的均值下降，
//        而微阴影因子图上既有白（平面）又有暗（砖缝）。
//      · **皮肤**：一颗按"头部"命名的球，SSS 开/关比明暗交界带的 R/G。
//      · **布/金属**：分类命中后真的换成了 MeshPhysicalMaterial 且 sheen/anisotropy > 0。
//      · **程序数**：跑够帧数之后 `renderer.info.programs.length` 不再增长。
//
// 用法：node Taierzhuang1938/Script_MaterialUpgradeTest.mjs [--shot]
// 退出码即成败。`--shot` 额外把开/关对照图写到 _shots/materialUpgrade/。

import path from "node:path";
import fs from "node:fs";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";
import { BakeSkinLut, BakeDetailNormal, ApplyGrimeLayer, RECIPES, Wide, MAX_BAKE_SIZE } from "./Script_TexBake.mjs";
import { SurfaceOf, SKIN, MATERIAL_DEBUG_VIEWS } from "./Data_Tuning_Materials.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const wantShots = process.argv.includes("--shot");
const shotDir = path.join(projectDir, "_shots", "materialUpgrade");

let failed = 0;
function Check(ok, label, detail = "") {
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? `  ${detail}` : ""}`);
  if (!ok) failed += 1;
}

// ---------------------------------------------------------------------------
// 1. 源码契约
// ---------------------------------------------------------------------------
const shadingSource = await readFile(path.join(projectDir, "Script_MaterialShading.mjs"), "utf8");
const patchSource = await readFile(path.join(projectDir, "Script_MaterialPatches.mjs"), "utf8");
const materialsSource = await readFile(path.join(projectDir, "Script_Materials.mjs"), "utf8");

// r185 把每张贴图的 uv 拆成各自的 varying，而 `#version 300 es` 里 varying 是只读的
// `in`。POM 改 uv 的唯一办法就是在 main() 里声明同名局部量把它们遮蔽掉；
// 少遮一个（比如 roughness）就会出现"颜色错位了但粗糙度没错位"的鬼画面。
for (const varying of ["vMapUv", "vNormalMapUv", "vRoughnessMapUv", "vMetalnessMapUv", "vAoMapUv"]) {
  Check(shadingSource.includes(`vec2 ${varying} = gMatPomUv;`),
    `POM 遮蔽了 ${varying}（五张贴图的 uv 必须一起位移）`);
}
Check(shadingSource.includes("vec2 gMatPomUv = vNormalMapUv;"),
  "POM 先把原 uv 存进另一个名字再声明遮蔽量（反过来写是自引用，行为未定义）");
Check(shadingSource.includes("[\"#include <clipping_planes_fragment>\", GLSL_POM]"),
  "POM 挂在 <clipping_planes_fragment>：片元 main 里唯一早于 <map_fragment> 的锚点");
Check(shadingSource.includes("[\"#include <normal_fragment_maps>\", GLSL_DETAIL_NORMAL]"),
  "细节法线挂在 <normal_fragment_maps>：直射光循环之前最后一次能改 normal");
// Chan 2018：aperture = 2·ao²，microShadow = saturate(|NdotL| + aperture − 1)。
Check(shadingSource.includes("float msAperture = 2.0 * msAo * msAo;")
  && shadingSource.includes("clamp(abs(msNdL) + msAperture - 1.0, 0.0, 1.0)"),
"微阴影用 Chan 2018 的原式（aperture = 2·ao²）");
Check(shadingSource.includes("[\"#include <lights_fragment_end>\", GLSL_DIRECT]"),
  "微阴影/皮肤挂在 <lights_fragment_end>，在 <aomap_fragment> 之前（GI 视图 10 才读得到压过的值）");
// Lagarde：saturate(1 + fade·dot(R, Ng)) 的平方，R 用扰动后的法线、Ng 用几何法线。
Check(shadingSource.includes("reflect(-geometryViewDir, geometryNormal)")
  && shadingSource.includes("dot(hrzReflect, nonPerturbedNormal)")
  && shadingSource.includes("radiance *= hrzTerm * hrzTerm;"),
"地平线镜面遮蔽是 Lagarde 的原式（扰动法线的反射 × 几何法线，平方）");
// Penner：加**差值**而不是整项替换 —— 替换会连阴影、光色和别的光源一起吃掉。
Check(shadingSource.includes("vec3 sknDelta = (sknScatter - vec3(clamp(sknNdL, 0.0, 1.0)))")
  && shadingSource.includes("reflectedLight.directDiffuse += BRDF_Lambert(material.diffuseColor) * sknDelta;"),
"皮肤散射加的是「预积分 − Lambert」的差，不替换整项");
Check(/\.\.\.\(Array\.isArray\(shading\) \? shading : \[shading\]\),\s*\n\s*MakeDestructionPatch\(destruction\)/
  .test(patchSource) && patchSource.indexOf("MakeGiPatch(gi)") < patchSource.indexOf("Array.isArray(shading)"),
"补丁顺序：AO → GI → 材质着色 → 破口");
Check(patchSource.includes("#include <normal_fragment_maps>"),
  "锚点表里登记了新增的 <normal_fragment_maps>");
Check(materialsSource.includes("THREE.MeshStandardMaterial.prototype.copy.call(upgraded, source);")
  && materialsSource.includes('upgraded.defines = { STANDARD: "", PHYSICAL: "" };'),
"换 MeshPhysicalMaterial 走父类 copy 再补回 PHYSICAL（Physical.copy 会读不存在的 sheenColor）");

// 人物与手：类型升级要拿到网格才做得了，所以调用点必须交出 mesh。
const characterSource = await readFile(path.join(projectDir, "Script_CharacterModel.mjs"), "utf8");
const riggedSource = await readFile(path.join(projectDir, "Script_RiggedModel.mjs"), "utf8");
Check(/ConfigureExternalPbr\?\.\(object\.material,[\s\S]{0,500}mesh: object/.test(characterSource),
  "人物 GLB 的材质注入交出了网格（换类才挂得回去）");
Check(/ConfigureExternalPbr\?\.\(object\.material,[\s\S]{0,500}mesh: object/.test(riggedSource),
  "第一人称双臂同上");

// ---------------------------------------------------------------------------
// 2. 纯 Node：烘焙侧
// ---------------------------------------------------------------------------
Check(Wide(1024) === MAX_BAKE_SIZE && Wide(512) === 1024 && Wide(256) === 512,
  `砖类翻倍后仍封顶 ${MAX_BAKE_SIZE}²（ultra 不许烘出 2048² × 八个砖配方）`,
  `Wide(1024)=${Wide(1024)}`);

const lut = BakeSkinLut();
function LutAt(x, y) {
  const i = (y * lut.width + x) * 4;
  return [lut.data[i], lut.data[i + 1], lut.data[i + 2]];
}
// 曲率最大那一行（尖处）在明暗交界附近必须红 > 绿：红光的扩散剖面最宽，
// 绕过转折的距离最长 —— 这正是"耳廓/鼻翼在逆光下发红"的成因。
{
  const row = lut.height - 1;
  const terminator = Math.round((lut.width - 1) * 0.5);   // NdotL = 0
  const near = LutAt(terminator - 4, row);
  const flat = LutAt(terminator - 4, 0);
  Check(near[0] > near[1] && near[1] >= near[2],
    "皮肤 LUT：曲率大的那一行在明暗交界处 R > G > B（红光散得最远）",
    `rgb=${near.join(",")}`);
  Check(near[0] > flat[0],
    "皮肤 LUT：同一 NdotL 上，曲率越大散射越多（平面那一行退化成 Lambert）",
    `curved=${near[0]} flat=${flat[0]}`);
}
Check(SKIN.integrationSteps >= 600,
  "皮肤 LUT 的积分步长细到能采到最窄那支高斯（σ≈0.08 mm）",
  `steps=${SKIN.integrationSteps}`);

{
  const detail = BakeDetailNormal(64);
  let minX = 255, maxX = 0;
  for (let i = 0; i < detail.normal.length; i += 4) {
    minX = Math.min(minX, detail.normal[i]);
    maxX = Math.max(maxX, detail.normal[i]);
  }
  Check(maxX - minX > 40, "细节法线是真的有起伏（不是一张 128,128,255 的平图）",
    `x ∈ [${minX}, ${maxX}]`);
}

{
  // 污渍层只动 albedo / 粗糙度，**不许动 height**（动了法线就要重烘，凹凸观感会变）。
  const clean = RECIPES.Adobe(128);          // Adobe 的 grime 是 0.5，已经叠过
  const bare = { size: 128, albedo: clean.albedo.slice(), orm: clean.orm.slice() };
  ApplyGrimeLayer(bare, 0.6, "unit-test");
  let changedAlbedo = 0, changedRough = 0;
  for (let i = 0; i < bare.albedo.length; i += 4) {
    if (bare.albedo[i] !== clean.albedo[i]) changedAlbedo += 1;
    if (bare.orm[i + 1] !== clean.orm[i + 1]) changedRough += 1;
  }
  Check(changedAlbedo > 200 && changedRough > 200,
    "污渍层真的改了 albedo 与粗糙度（不是一层恒为 0 的蒙版）",
    `albedo=${changedAlbedo} rough=${changedRough}`);
  Check(SurfaceOf("BrickWall").grime > 0 && SurfaceOf("Steel").grime === 0,
    "污渍强度按配方走（砖墙有、钢件没有）");
}

Check(SurfaceOf("BrickWall").pomDepth >= 0.010 && SurfaceOf("BrickWall").pomDepth <= 0.025,
  "青砖的视差深度落在灰缝的实际尺度（10–25 mm）",
  `${(SurfaceOf("BrickWall").pomDepth * 1000).toFixed(0)} mm`);
Check(SurfaceOf("ClothNra").pomDepth === 0 && SurfaceOf("Steel").pomDepth === 0,
  "布与钢不编 POM（凹凸尺度小于一个像素，白烧步数）");

// ---------------------------------------------------------------------------
// 3. 真浏览器
// ---------------------------------------------------------------------------
const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
// 1200×675：视差的平均位移只有一两个百分之一米，屏幕像素密度直接决定测得出测不出。
// 720 宽时两侧位移是 ±0.5 px，刚好卡在阈值上；1200 宽有 1.7 倍余量。
const page = await browser.newPage({ viewport: { width: 1200, height: 675 } });
const problems = [];
page.on("pageerror", (error) => problems.push(`PAGEERROR ${String(error).slice(0, 300)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  problems.push(`CONSOLE ${message.text().slice(0, 400)}`);
});

await page.goto(`http://127.0.0.1:${port}/Taierzhuang1938/Probe.html?scene=materials&gi=0&quality=high`,
  { waitUntil: "load", timeout: 120000 });
await page.waitForFunction(() => window.Probe !== undefined, null, { timeout: 180000 });

// 一口气跑完：逐帧 page.evaluate 往返会被 rAF 插队，阈值断言变抛硬币。
// 所有摆位、开关、读回都在同一个 evaluate 里做完，回来的只有数字与几张 PNG。
const probe = await page.evaluate(async ({ views }) => {
  const THREE = await import("/Taierzhuang1938/vendor/three/build/three.module.js");
  const P = window.Probe;
  const WALL = { x: 7.5, y: 1.5, z: -2.8 };
  const canvas = P.renderer.domElement;
  const grab = document.createElement("canvas");
  grab.width = canvas.width;
  grab.height = canvas.height;
  const ctx = grab.getContext("2d", { willReadFrequently: true });
  const shots = {};

  // TAA 关掉：读回像素做互相关时，±0.5 像素的抖动比要测的位移还大。
  P.post.SetTaaEnabled(false);

  function Aim(dx, dz, target = WALL) {
    P.camera.position.set(target.x + dx, target.y, target.z + dz);
    P.camera.lookAt(target.x, target.y, target.z);
    P.camera.updateProjectionMatrix();
  }
  function SetView(name, giCode = 0, matCode = 0) {
    P.library.gi.debugView.value = giCode;
    P.shading.debugView.value = matCode;
    P.post.SetDebugView(name, P.gi, true);
  }
  // 渲一帧并在**同一个任务里**抓下来（preserveDrawingBuffer=false，出了任务就是黑的）。
  function Shot(label) {
    P.StepFrames(2);
    P.StepFrames(1);
    ctx.drawImage(canvas, 0, 0);
    const image = ctx.getImageData(0, 0, grab.width, grab.height);
    if (label) shots[label] = grab.toDataURL("image/png");
    return image;
  }
  // 一条水平条带的逐列平均亮度（砖缝在这条曲线上是一串谷）。
  function Column(image, box) {
    const b = box || [0.16, 0.84, 0.40, 0.60];
    const w = image.width, h = image.height;
    const cx0 = Math.round(w * b[0]), cx1 = Math.round(w * b[1]);
    const cy0 = Math.round(h * b[2]), cy1 = Math.round(h * b[3]);
    const out = new Float64Array(cx1 - cx0);
    for (let x = cx0; x < cx1; x += 1) {
      let sum = 0;
      for (let y = cy0; y < cy1; y += 1) {
        const i = (y * w + x) * 4;
        sum += 0.2126 * image.data[i] + 0.7152 * image.data[i + 1] + 0.0722 * image.data[i + 2];
      }
      out[x - cx0] = sum / (cy1 - cy0);
    }
    return out;
  }
  // 一维互相关：b 相对 a 平移了多少像素（抛物线细化到亚像素）。
  function Shift(a, b, maxShift) {
    const span = maxShift || 12;
    const n = Math.min(a.length, b.length);
    const Cost = (s) => {
      let sum = 0, count = 0;
      for (let i = span; i < n - span; i += 1) {
        const j = i + s;
        if (j < 0 || j >= n) continue;
        sum += Math.abs(a[i] - b[j]);
        count += 1;
      }
      return count ? sum / count : Infinity;
    };
    let best = 0, bestCost = Infinity;
    for (let s = -span; s <= span; s += 1) {
      const cost = Cost(s);
      if (cost < bestCost) { bestCost = cost; best = s; }
    }
    const left = Cost(best - 1), right = Cost(best + 1);
    const denominator = left - 2 * bestCost + right;
    const refine = Math.abs(denominator) > 1e-9 ? 0.5 * (left - right) / denominator : 0;
    return best + Math.max(-1, Math.min(1, refine));
  }
  function MeanAbsDiff(a, b, box) {
    const w = a.width, h = a.height;
    const x0 = Math.round(w * box[0]), x1 = Math.round(w * box[1]);
    const y0 = Math.round(h * box[2]), y1 = Math.round(h * box[3]);
    let sum = 0, count = 0;
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const i = (y * w + x) * 4;
        sum += Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1])
          + Math.abs(a.data[i + 2] - b.data[i + 2]);
        count += 3;
      }
    }
    return sum / count;
  }
  function Mean(image, box) {
    const b = box || [0, 1, 0, 1];
    const w = image.width, h = image.height;
    const x0 = Math.round(w * b[0]), x1 = Math.round(w * b[1]);
    const y0 = Math.round(h * b[2]), y1 = Math.round(h * b[3]);
    let sum = 0, count = 0;
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const i = (y * w + x) * 4;
        sum += (image.data[i] + image.data[i + 1] + image.data[i + 2]) / 3;
        count += 1;
      }
    }
    return sum / count;
  }

  // --- 视差：同一机位、同一面墙，只翻 POM ---------------------------------
  // BaseColor 视图（GI 假彩色 6）：只有反照率，没有光照 —— 两张图之间唯一的
  // 差别就是「采样用的 uv 被推了多远」，互相关求出来的位移就是纯视差量。
  const parallax = {};
  // 掠射 70°、1.3 m：视差的**平均**位移 ≈ 命中深度 × tan(入射角) × 深度(uv)，
  // 而砖面的高度场大部分贴着表层，平均命中深度只有四分之一左右 —— 站远一点、
  // 角度平一点，位移就掉到零点几个像素，测出来的是噪声不是视差。
  const angles = { left: [-0.95, 0.33], right: [0.95, 0.33], head: [0, 1.0] };
  for (const name of Object.keys(angles)) {
    const dx = angles[name][0], dz = angles[name][1];
    Aim(dx, dz);
    SetView("baseColor", 6, 0);
    P.ApplyShadingQuality({ pom: true });
    const on = Shot(name === "left" ? "parallaxLeftPomOn" : null);
    P.ApplyShadingQuality({ pom: false });
    const off = Shot(name === "left" ? "parallaxLeftPomOff" : null);
    parallax[name] = Shift(Column(off), Column(on));
  }
  P.ApplyShadingQuality({ pom: true });

  // --- 距离淡出：20 m 外必须与关掉 POM 逐像素几乎相同 ----------------------
  Aim(0, 20);
  SetView("baseColor", 6, 0);
  P.ApplyShadingQuality({ pom: true });
  const farOn = Shot(null);
  P.ApplyShadingQuality({ pom: false });
  const farOff = Shot(null);
  const farDiff = MeanAbsDiff(farOn, farOff, [0.44, 0.56, 0.44, 0.56]);
  // 对照：同一对比在近处必须明显大于它，否则「20 m 相同」只是因为整张图都一样
  Aim(-0.95, 0.33);
  P.ApplyShadingQuality({ pom: true });
  const nearOn = Shot(null);
  P.ApplyShadingQuality({ pom: false });
  const nearOff = Shot(null);
  const nearDiff = MeanAbsDiff(nearOn, nearOff, [0.44, 0.56, 0.44, 0.56]);
  P.ApplyShadingQuality({ pom: true });

  // --- 视差位移调试图：开着有值、关掉恒为纯黑 -----------------------------
  Aim(-0.95, 0.33);
  SetView("pomOffset", 0, views.pomOffset);
  // 用「纯红像素的占比」而不是均值：取景框里还有天和地，均值把它们一起平均进去。
  // 位移图只写红通道（绿蓝恒 0），场景里没有别的东西长这样。
  function RedFraction(image) {
    let hit = 0, total = 0;
    for (let i = 0; i < image.data.length; i += 4) {
      const r = image.data[i], g = image.data[i + 1], b = image.data[i + 2];
      total += 1;
      if (r > 40 && g < 30 && b < 30) hit += 1;
    }
    return hit / total;
  }
  const offsetOn = Shot("pomOffsetOn");
  const offsetOnMean = RedFraction(offsetOn);
  P.ApplyShadingQuality({ pom: false });
  const offsetOff = Shot("pomOffsetOff");
  const offsetOffMean = RedFraction(offsetOff);
  P.ApplyShadingQuality({ pom: true });

  // --- 微阴影：默认机位（地面 + 十几颗球，各种朝向都有）-------------------
  Aim(-1.6, 1.6);
  SetView("diffuseLighting", 10, 0);
  P.ApplyShadingQuality({ microShadow: true });
  const WALL_BOX = [0.25, 0.75, 0.30, 0.70];
  const directOn = Shot("directDiffuseMicroOn");
  const directOnMean = Mean(directOn, WALL_BOX);
  P.ApplyShadingQuality({ microShadow: false });
  const directOff = Shot("directDiffuseMicroOff");
  const directOffMean = Mean(directOff, WALL_BOX);
  P.ApplyShadingQuality({ microShadow: true });
  // 微阴影因子本身：平整表面恒白、砖缝木纹压暗 —— 两种像素都要有，
  // 全白 = 没接上，全黑 = 压过头。
  SetView("microShadow", 0, views.microShadow);
  const microImage = Shot("microShadowFactor");
  let microBright = 0, microDark = 0, microTotal = 0;
  {
    const w = microImage.width, h = microImage.height;
    for (let y = Math.round(h * WALL_BOX[2]); y < h * WALL_BOX[3]; y += 1) {
      for (let x = Math.round(w * WALL_BOX[0]); x < w * WALL_BOX[1]; x += 1) {
        const i = (y * w + x) * 4;
        const v = (microImage.data[i] + microImage.data[i + 1] + microImage.data[i + 2]) / 3;
        microTotal += 1;
        if (v > 240) microBright += 1;
        else if (v < 200) microDark += 1;
      }
    }
  }

  // --- 细节法线：淡入距离内有扰动、淡出之后恒为中灰 -----------------------
  Aim(-1.2, 0.9);
  SetView("detailNormal", 0, views.detailNormal);
  P.ApplyShadingQuality({ detailNormal: true });
  const detailNear = Shot("detailNormalNear");
  let detailSpread = 0;
  {
    const w = detailNear.width, h = detailNear.height;
    let min = 255, max = 0;
    for (let y = Math.round(h * 0.4); y < h * 0.6; y += 1) {
      for (let x = Math.round(w * 0.3); x < w * 0.7; x += 1) {
        const v = detailNear.data[(y * w + x) * 4];
        min = Math.min(min, v); max = Math.max(max, v);
      }
    }
    detailSpread = max - min;
  }
  Aim(0, 20);
  const detailFar = Shot("detailNormalFar");
  let detailFarSpread = 0;
  {
    const w = detailFar.width, h = detailFar.height;
    let min = 255, max = 0;
    for (let y = Math.round(h * 0.47); y < h * 0.53; y += 1) {
      for (let x = Math.round(w * 0.47); x < w * 0.53; x += 1) {
        const v = detailFar.data[(y * w + x) * 4];
        min = Math.min(min, v); max = Math.max(max, v);
      }
    }
    detailFarSpread = max - min;
  }

  // --- 皮肤 / 布 / 金属：按名字分类的三颗球 -------------------------------
  // 半径按真人头（9 cm）：曲率是预积分散射的输入，摆一颗半米的球出来的曲率
  // 落在 LUT 最平那一行，等于把这条测试写成恒过。
  const headRadius = 0.09;
  const balls = {};
  const specs = [
    ["skin", "战士5_头部 head", 0xc08a6a, [WALL.x - 2.4, 1.5, 0.6]],
    ["cloth", "军装棉布 uniform", 0x6a7076, [WALL.x - 2.1, 1.5, 0.6]],
    ["metal", "枪管钢 barrel steel", 0x8a9098, [WALL.x - 1.8, 1.5, 0.6]],
  ];
  for (const spec of specs) {
    const kind = spec[0], name = spec[1], color = spec[2], position = spec[3];
    const material = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0 });
    material.name = name;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(headRadius, 64, 48), material);
    mesh.position.set(position[0], position[1], position[2]);
    mesh.castShadow = true; mesh.receiveShadow = true;
    P.scene.add(mesh);
    P.library.ConfigureExternalPbr(mesh.material, { metalness: 0, minRoughness: 0.58, mesh });
    balls[kind] = mesh;
  }
  const classes = {
    skin: {
      klass: balls.skin.material.userData.externalMaterialClass,
      physical: !!balls.skin.material.isMeshPhysicalMaterial,
      injected: !!balls.skin.material.userData.indirectLightingInjected,
      key: balls.skin.material.customProgramCacheKey ? balls.skin.material.customProgramCacheKey() : "",
    },
    cloth: {
      klass: balls.cloth.material.userData.externalMaterialClass,
      physical: !!balls.cloth.material.isMeshPhysicalMaterial,
      sheen: balls.cloth.material.sheen || 0,
      sheenRoughness: balls.cloth.material.sheenRoughness || 0,
      sheenColor: balls.cloth.material.sheenColor
        ? [balls.cloth.material.sheenColor.r, balls.cloth.material.sheenColor.g, balls.cloth.material.sheenColor.b]
        : null,
    },
    metal: {
      klass: balls.metal.material.userData.externalMaterialClass,
      physical: !!balls.metal.material.isMeshPhysicalMaterial,
      anisotropy: balls.metal.material.anisotropy || 0,
      roughness: balls.metal.material.roughness,
    },
  };

  // 皮肤球特写：SSS 开/关比明暗交界带的 R/G。
  const skinTarget = {
    x: balls.skin.position.x, y: balls.skin.position.y, z: balls.skin.position.z,
  };
  Aim(-0.04, 0.28, skinTarget);
  SetView("final", 0, 0);
  P.ApplyShadingQuality({ skinSss: true });
  const skinOn = Shot("skinSssOn");
  P.ApplyShadingQuality({ skinSss: false });
  const skinOff = Shot("skinSssOff");
  P.ApplyShadingQuality({ skinSss: true });
  // 明暗交界带（按关掉 SSS 那张图的亮度定带，两张用同一批像素）。
  //
  // 量的是**多出来的那份光是什么颜色**，不是整条带子的颜色：交界带上大头是
  // 环境光与天空 IBL（两张图里一模一样），散射加上去的那一点被它稀释到看不见 ——
  // 直接比带子的 R/G 只能读到万分之一的变化，那是噪声不是证据。
  // 差值在**线性域**里做：画布是 sRGB 编码的，直接相减会把伽马当成颜色。
  function TerminatorRatio(image, reference) {
    const w = image.width, h = image.height;
    let red = 0, green = 0, count = 0;
    let peak = 0;
    const Linear = (v) => Math.pow(v / 255, 2.2);
    for (let i = 0; i < reference.data.length; i += 4) {
      peak = Math.max(peak, (reference.data[i] + reference.data[i + 1] + reference.data[i + 2]) / 3);
    }
    // 只取球本体那一块（球在画面正中，0.28 m 处占到画幅四成）：
    // 取宽了就是在比背景那面砖墙，两张图上它一模一样，比值当然不动。
    for (let y = Math.round(h * 0.36); y < h * 0.64; y += 1) {
      for (let x = Math.round(w * 0.40); x < w * 0.60; x += 1) {
        const i = (y * w + x) * 4;
        const v = (reference.data[i] + reference.data[i + 1] + reference.data[i + 2]) / 3;
        if (v < peak * 0.06 || v > peak * 0.50) continue;
        red += Linear(image.data[i]);
        green += Linear(image.data[i + 1]);
        count += 1;
      }
    }
    return {
      ratio: count ? red / Math.max(green, 1e-6) : 0,
      red: count ? red / count : 0,
      green: count ? green / count : 0,
      count,
    };
  }
  const skinBandOn = TerminatorRatio(skinOn, skinOff);
  const skinBandOff = TerminatorRatio(skinOff, skinOff);
  const skinBox = [0.40, 0.60, 0.36, 0.64];
  skinBandOn.mean = Mean(skinOn, skinBox);
  skinBandOff.mean = Mean(skinOff, skinBox);
  P.ApplyShadingQuality({ skinSss: false });
  P.StepFrames(2);
  skinBandOff.key = balls.skin.material.customProgramCacheKey();
  P.ApplyShadingQuality({ skinSss: true });
  P.StepFrames(2);
  skinBandOn.key = balls.skin.material.customProgramCacheKey();
  // 曲率视图：皮肤球有值，旁边那两颗（不是皮肤）必须是黑的。
  SetView("skinCurvature", 0, views.skinCurvature);
  const curvature = Shot("skinCurvature");
  const curvatureMean = Mean(curvature, [0.3, 0.7, 0.3, 0.7]);

  // --- 程序数：跑够帧数之后不许再涨 ---------------------------------------
  SetView("final", 0, 0);
  P.camera.position.set(0, 3.2, 6.5);
  P.camera.lookAt(0, 0.9, -3);
  // 同一条相机轨迹走两遍：第一遍把还没露过面的东西（阴影深度、实例化变体）
  // 全部逼出来，第二遍才是"稳态"。只走一遍会把首见编译误报成每帧重编译。
  const Sweep = () => {
    for (let i = 0; i < 60; i += 1) {
      P.camera.position.set(Math.sin(i * 0.1) * 6, 3.2, 6.5 - i * 0.05);
      P.camera.lookAt(0, 0.9, -3);
      P.StepFrames(1);
    }
  };
  P.StepFrames(30);
  Sweep();
  const programsBefore = P.renderer.info.programs.length;
  Sweep();
  const programsAfter = P.renderer.info.programs.length;

  const brick = P.library.materials.get("BrickWall|{}");
  return {
    parallax,
    farDiff, nearDiff,
    offsetOnMean, offsetOffMean,
    directOnMean, directOffMean,
    micro: { bright: microBright / microTotal, dark: microDark / microTotal },
    detailSpread, detailFarSpread,
    classes,
    skin: { on: skinBandOn, off: skinBandOff, curvatureMean },
    programs: { before: programsBefore, after: programsAfter },
    cacheKey: brick ? brick.customProgramCacheKey() : null,
    pomSteps: P.shading.quality.pomSteps,
    shots,
  };
}, { views: MATERIAL_DEBUG_VIEWS });

Check(problems.length === 0, "探针页零控制台报错（着色器编译失败也在这条里）",
  problems.slice(0, 3).join(" | "));

// --- 视差 -------------------------------------------------------------------
const left = probe.parallax.left, right = probe.parallax.right, head = probe.parallax.head;
Check(Math.abs(left) > 0.5 && Math.abs(right) > 0.5,
  "POM：掠射机位下砖缝的屏幕位置真的被推开了（单侧 > 0.5 px）",
  `left=${left.toFixed(2)}px right=${right.toFixed(2)}px`);
Check(Math.sign(left) !== Math.sign(right) && Math.abs(left - right) > 1.0,
  "POM：位移随视角反号 —— 这才是视差，不是「图变了」",
  `left=${left.toFixed(2)} right=${right.toFixed(2)}`);
Check(Math.abs(head) < Math.min(Math.abs(left), Math.abs(right)),
  "POM：正对表面时位移最小（正入射没有视差）",
  `head=${head.toFixed(2)}px`);
Check(probe.farDiff < 1.0 && probe.nearDiff > probe.farDiff * 3,
  "POM：20 m 外与关掉 POM 几乎逐像素相同，而近处差得多（距离淡出真的在工作）",
  `far=${probe.farDiff.toFixed(3)} near=${probe.nearDiff.toFixed(3)}`);
Check(probe.offsetOnMean > 0.15 && probe.offsetOffMean < 0.01,
  "POM 位移调试视图：开着满屏是位移量、关掉一个像素都没有",
  `on=${(probe.offsetOnMean * 100).toFixed(1)}% off=${(probe.offsetOffMean * 100).toFixed(2)}%`);

// --- 微阴影 -----------------------------------------------------------------
Check(probe.directOffMean > 1 && probe.directOnMean < probe.directOffMean * 0.95,
  "微阴影：砖墙上的直射漫反射（调试视图 10）真的被压下去了",
  `on=${probe.directOnMean.toFixed(2)} off=${probe.directOffMean.toFixed(2)}`);
Check(probe.micro.bright > 0.25 && probe.micro.dark > 0.02,
  "微阴影：因子图上既有白（平整表面不受影响）又有暗（砖缝木纹被压）",
  `bright=${(probe.micro.bright * 100).toFixed(1)}% dark=${(probe.micro.dark * 100).toFixed(1)}%`);

// --- 细节法线 ---------------------------------------------------------------
Check(probe.detailSpread > 12 && probe.detailFarSpread < probe.detailSpread * 0.5,
  "细节法线：近处真的在扰动，远处已经淡出",
  `near=${probe.detailSpread} far=${probe.detailFarSpread}`);

// --- 外部材质分类 -----------------------------------------------------------
Check(probe.classes.skin.klass === "skin" && !probe.classes.skin.physical
  && probe.classes.skin.key.includes("k"),
"皮肤：按名字认出来、不白换 Physical 类、cache key 带上散射位",
JSON.stringify(probe.classes.skin));
Check(probe.classes.cloth.klass === "cloth" && probe.classes.cloth.physical
  && probe.classes.cloth.sheen > 0
  && probe.classes.cloth.sheenRoughness >= 0.6 && probe.classes.cloth.sheenRoughness <= 0.8,
"布料：换成 MeshPhysicalMaterial 且 sheenRoughness 落在 0.6–0.8",
JSON.stringify(probe.classes.cloth));
Check(probe.classes.metal.klass === "metal" && probe.classes.metal.physical
  && probe.classes.metal.anisotropy >= 0.4 && probe.classes.metal.anisotropy <= 0.6
  && probe.classes.metal.roughness >= 0.28,
"金属：换成 MeshPhysicalMaterial、各向异性 0.4–0.6、粗糙度有下限",
JSON.stringify(probe.classes.metal));

// --- 皮肤 -------------------------------------------------------------------
Check(probe.skin.on.count > 500,
  "皮肤：明暗交界带上取到了足够多的像素（不然下面那条比的是噪声）",
  `count=${probe.skin.on.count}`);
{
  // 预积分散射在明暗交界带上**加**了多少光、那份光偏不偏红。
  const deltaR = probe.skin.on.red - probe.skin.off.red;
  const deltaG = probe.skin.on.green - probe.skin.off.green;
  Check(deltaR > 0 && deltaG > 0,
    "皮肤：预积分散射在明暗交界带上确实补了光（不是负的、也不是零）",
    `ΔR=${deltaR.toExponential(2)} ΔG=${deltaG.toExponential(2)}`);
  Check(deltaR / Math.max(deltaG, 1e-9) > 1.04,
    "皮肤：补上去的那份光是**红移**的（红光在皮下散得最远）",
    `ΔR/ΔG=${(deltaR / Math.max(deltaG, 1e-9)).toFixed(3)}`
    + ` 带内 R/G ${probe.skin.on.ratio.toFixed(4)} vs ${probe.skin.off.ratio.toFixed(4)}`
    + ` key ${probe.skin.on.key}/${probe.skin.off.key}`);
}
Check(probe.skin.curvatureMean > 1,
  "皮肤曲率调试视图有值（脸真的被认成皮肤了）",
  `mean=${probe.skin.curvatureMean.toFixed(2)}`);

// --- 程序数 -----------------------------------------------------------------
Check(probe.programs.after === probe.programs.before,
  "稳态不再编译新程序（材质补丁的 cache key 没有每帧翻）",
  `${probe.programs.before} -> ${probe.programs.after}`);
// 2026-09 集成期的完整顺序是 ORM → AO(GTAO) → GI → CSM → SSR → 簇光 → 材质着色 → 破口，
// 而砖墙那份材质粗糙度下界 0.82 > SSR 上限，所以不编 SSR（见 Script_Materials.SsrEligible）。
// 这里锁的是「三段都在且次序对」，不锁中间插了多少路。
Check(/^ormm?a?\|gtao1\|gi1\|.*\|mat16r5/.test(probe.cacheKey || ""),
  "砖墙的 cache key 带上了 ORM / AO / GI / 材质着色四段且次序对",
  String(probe.cacheKey));

if (wantShots) {
  fs.mkdirSync(shotDir, { recursive: true });
  for (const name of Object.keys(probe.shots)) {
    const dataUrl = probe.shots[name];
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    fs.writeFileSync(path.join(shotDir, `${name}.png`), Buffer.from(base64, "base64"));
  }
  console.log(`截图 ${Object.keys(probe.shots).length} 张 -> ${shotDir}`);
}

await browser.close();
server.close();
console.log(failed ? `MATERIAL_UPGRADE_FAIL ${failed}` : "MATERIAL_UPGRADE_OK");
process.exit(failed ? 1 : 0);
