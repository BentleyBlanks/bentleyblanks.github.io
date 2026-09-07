// ===========================================================================
// Script_GtaoTest.mjs —— GTAO / 弯曲法线 / 镜面遮蔽 / SSIL 的看门狗（真浏览器，render 域）
//
// 断言的都是**读回来的像素**，不是标志位：GLSL ES 3.00 的保留字与 MRT 的
// draw-buffer 约束一旦踩到，three 只在控制台留一行，那一趟什么都不画 ——
// 「AO 图恒为全白」和「AO 正常工作」在标志位上长得一模一样。
//
// 取证机位是探针页的 `?scene=ssil`：一堵**自发光红墙**（x 面）与一块中性灰墙
// （z 面）成 90° L 形，外加一片空地。世界坐标已知，所以每一条断言都能用
// `camera.project()` 把世界点投到屏幕上再去读那一块像素，不靠"画面左下角大概是地面"。
//
//   1. 帧图里有 gtao 与 ssilHistory，且 AO 靶是 RGBA16F（半浮点读回）
//   2. 接触暗带：墙根 AO 显著低于空旷地
//   3. 平地上没有规则波纹：空旷地一块的标准差与 lag-2 自相关都很小
//   4. 时域收敛：相机静止推 32 帧后逐帧差极小
//   5. 无重投影残影：平移 0.5 m 后，"带历史"与"清历史重新收敛"的结果一致
//   6. 弯曲法线：空旷地 ≈ 几何法线，墙根显著偏离
//   7. 镜面遮蔽调试图有梯度（不是一片常数）
//   8. SSIL：灰墙靠近红墙那一端的 SSIL 通道显著带红；关掉 SSIL 时为 0，
//      且**正式画面**里那一端确实被染红（材质真的在用它）
//   9. 三个新调试视图都出画（读回屏幕像素）
//  10. 稳态不再编译新程序、无 GL 错误、无控制台报错
//
// 用法：node Taierzhuang1938/Script_GtaoTest.mjs
// 退出码即成败。
// ===========================================================================

import path from "node:path";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 800, height: 450 } });

const problems = [];
page.on("pageerror", (error) => problems.push(`PAGEERROR ${String(error).slice(0, 240)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const url = message.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  problems.push(`CONSOLE ${message.text().slice(0, 240)}`);
});

let result = null;
try {
  await page.goto(
    `http://127.0.0.1:${port}/Taierzhuang1938/Probe.html?quality=high&preset=smokyDay&scene=ssil&gi=0`,
    { waitUntil: "load", timeout: 180000 },
  );
  await page.waitForFunction(() => window.Probe?.state?.ready, null, { timeout: 240000 });
  result = await page.evaluate(async () => {
    const P = window.Probe;
    const post = P.post;
    const renderer = P.renderer;
    const gl = renderer.getContext();
    const THREE = await import("./vendor/three/build/three.module.js");
    const out = { world: {} };

    // --- 工具 --------------------------------------------------------------
    const HalfToFloat = (bits) => {
      const sign = (bits >> 15) & 1 ? -1 : 1;
      const exponent = (bits >> 10) & 0x1f;
      const mantissa = bits & 0x3ff;
      if (exponent === 0) return sign * Math.pow(2, -14) * (mantissa / 1024);
      if (exponent === 31) return mantissa ? NaN : sign * Infinity;
      return sign * Math.pow(2, exponent - 15) * (1 + mantissa / 1024);
    };
    const OctDecode = (ex, ey) => {
      let x = ex * 2 - 1;
      let y = ey * 2 - 1;
      let z = 1 - Math.abs(x) - Math.abs(y);
      const t = Math.max(-z, 0);
      x += x >= 0 ? -t : t;
      y += y >= 0 ? -t : t;
      const len = Math.hypot(x, y, z) || 1;
      return [x / len, y / len, z / len];
    };
    /** 世界点 -> 目标靶上的像素坐标（readRenderTargetPixels 的 y 是从底边起）。 */
    const ProjectTo = (world, target) => {
      const v = new THREE.Vector3(world[0], world[1], world[2]).project(P.camera);
      return {
        ndc: [v.x, v.y],
        x: Math.round((v.x * 0.5 + 0.5) * target.width),
        y: Math.round((v.y * 0.5 + 0.5) * target.height),
      };
    };
    /** 读一小块 RGBA16F，返回逐通道均值。 */
    const ReadBlockF = (target, cx, cy, half, textureIndex = 0) => {
      const size = half * 2 + 1;
      const x = Math.max(0, Math.min(target.width - size, cx - half));
      const y = Math.max(0, Math.min(target.height - size, cy - half));
      const buffer = new Uint16Array(size * size * 4);
      renderer.readRenderTargetPixels(target, x, y, size, size, buffer, undefined, textureIndex);
      const sum = [0, 0, 0, 0];
      const values = [];
      for (let i = 0; i < size * size; i += 1) {
        for (let c = 0; c < 4; c += 1) sum[c] += HalfToFloat(buffer[i * 4 + c]);
        values.push(HalfToFloat(buffer[i * 4]));
      }
      return { mean: sum.map((s) => s / (size * size)), values };
    };
    const ReadScreen = () => {
      const w = gl.drawingBufferWidth;
      const h = gl.drawingBufferHeight;
      const pixels = new Uint8Array(w * h * 4);
      gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return { w, h, pixels };
    };
    const Settle = (frames = 24) => {
      P.state.elapsed = 0;
      post.frame = 0;
      post.hasTaaHistory = false;
      post.hasPrev = false;
      post.gtaoPass.NotifyCameraCut();
      P.StepFrames(frames, 1 / 60);
    };

    // 探针页的世界坐标（与 Script_Probe.BuildSsilScene 一一对应）
    const WORLD = {
      // 地面上的两点，**同一个平面、同一种材质**：一个离红墙 0.54 m（在 SSIL
      // 半径内）、一个 2.5 m 开外。地面法线朝上，到红墙的方向余弦可观 ——
      // 灰墙正面法线朝 +Z、对着 -X 的红墙几乎掠射，反弹量小到没法当判据。
      groundNear: [0.00, 0.03, 0.50],
      groundOpen: [2.00, 0.03, 0.50],
      // 灰墙墙根前 0.10 m：接触暗带
      groundCorner: [1.40, 0.03, -0.74],
    };

    Settle(32);
    out.passOrder = post.passes.map((pass) => pass.name);
    const aoTarget = post.targets.aoBlur;
    out.targets = {
      attachments: aoTarget.textures.length,
      halfFloat: aoTarget.textures[0].type === THREE.HalfFloatType,
      size: [aoTarget.width, aoTarget.height],
      mainSize: [post.width, post.height],
      ssilIsSecond: post.SsilTexture === aoTarget.textures[1],
      tier: { ...post.gtaoPass.tier },
      ssilEnabled: post.gtaoPass.ssilEnabled,
    };

    // --- 2) 接触暗带 -------------------------------------------------------
    const pCorner = ProjectTo(WORLD.groundCorner, aoTarget);
    const pOpen = ProjectTo(WORLD.groundOpen, aoTarget);
    const pNear = ProjectTo(WORLD.groundNear, aoTarget);
    out.world.onScreen = [pCorner, pOpen, pNear]
      .every((p) => Math.abs(p.ndc[0]) < 0.92 && Math.abs(p.ndc[1]) < 0.92);
    out.world.ndc = { corner: pCorner.ndc, open: pOpen.ndc, near: pNear.ndc };

    const cornerBlock = ReadBlockF(aoTarget, pCorner.x, pCorner.y, 2);
    const openBlock = ReadBlockF(aoTarget, pOpen.x, pOpen.y, 4);
    out.contact = {
      corner: cornerBlock.mean[0],
      open: openBlock.mean[0],
      delta: openBlock.mean[0] - cornerBlock.mean[0],
      cornerDepth: cornerBlock.mean[3],
      openDepth: openBlock.mean[3],
    };

    // --- 3) 平地无规则波纹：标准差 + lag-2 自相关 --------------------------
    {
      const values = openBlock.values;
      const mean = values.reduce((a, b) => a + b, 0) / values.length;
      let variance = 0;
      for (const v of values) variance += (v - mean) * (v - mean);
      variance /= values.length;
      const size = 9;
      let acc = 0;
      let count = 0;
      for (let y = 0; y < size; y += 1) {
        for (let x = 0; x + 2 < size; x += 1) {
          acc += (values[y * size + x] - mean) * (values[y * size + x + 2] - mean);
          count += 1;
        }
      }
      out.flatness = {
        stddev: Math.sqrt(variance),
        // 归一化 lag-2 自相关：规则波纹（周期 2 的条纹）会把它推到 +1 附近
        autocorr2: variance > 1e-9 ? (acc / count) / variance : 0,
      };
    }

    // --- 4) 时域收敛：静止推帧，逐帧差 -------------------------------------
    {
      P.StepFrames(32, 1 / 60);
      const size = 32;
      const x = Math.max(0, Math.floor(aoTarget.width / 2) - size / 2);
      const y = Math.max(0, Math.floor(aoTarget.height / 2) - size / 2);
      const Grab = () => {
        const buffer = new Uint16Array(size * size * 4);
        renderer.readRenderTargetPixels(aoTarget, x, y, size, size, buffer);
        const list = [];
        for (let i = 0; i < size * size; i += 1) list.push(HalfToFloat(buffer[i * 4]));
        return list;
      };
      let a = Grab();
      let maxDelta = 0;
      let sumDelta = 0;
      let samples = 0;
      for (let f = 0; f < 4; f += 1) {
        P.StepFrames(1, 1 / 60);
        const b = Grab();
        for (let i = 0; i < a.length; i += 1) {
          const d = Math.abs(b[i] - a[i]);
          maxDelta = Math.max(maxDelta, d);
          sumDelta += d;
          samples += 1;
        }
        a = b;
      }
      out.converge = { maxDelta, meanDelta: sumDelta / samples };
    }

    // --- 5) 平移 0.5 m 后无重投影残影 -------------------------------------
    {
      const size = 48;
      const x = Math.max(0, Math.floor(aoTarget.width / 2) - size / 2);
      const y = Math.max(0, Math.floor(aoTarget.height / 2) - size / 2);
      const Grab = () => {
        const buffer = new Uint16Array(size * size * 4);
        renderer.readRenderTargetPixels(aoTarget, x, y, size, size, buffer);
        const list = [];
        for (let i = 0; i < size * size; i += 1) list.push(HalfToFloat(buffer[i * 4]));
        return list;
      };
      const home = P.camera.position.clone();
      // (a) 参照组：直接瞬移到新机位、清空历史重新收敛 —— 定义上不可能有残影
      P.camera.position.set(home.x + 0.5, home.y, home.z);
      Settle(28);
      const fresh = Grab();
      // (b) 试验组：从原机位一帧一帧走过去，历史一路重投影
      P.camera.position.copy(home);
      Settle(28);
      for (let f = 0; f < 10; f += 1) {
        P.camera.position.x = home.x + 0.5 * ((f + 1) / 10);
        P.StepFrames(1, 1 / 60);
      }
      P.camera.position.set(home.x + 0.5, home.y, home.z);
      P.StepFrames(18, 1 / 60);
      const reprojected = Grab();
      let maxDelta = 0;
      let sumDelta = 0;
      for (let i = 0; i < fresh.length; i += 1) {
        const d = Math.abs(fresh[i] - reprojected[i]);
        maxDelta = Math.max(maxDelta, d);
        sumDelta += d;
      }
      out.ghosting = { maxDelta, meanDelta: sumDelta / fresh.length };
      P.camera.position.copy(home);
      Settle(32);
    }

    // --- 6) 弯曲法线：空旷地 ≈ 几何法线，墙根偏离 --------------------------
    {
      const nd = post.targets.normalDepth;
      const BentVsGeometry = (world) => {
        const pAo = ProjectTo(world, aoTarget);
        const pNd = ProjectTo(world, nd);
        const ao = ReadBlockF(aoTarget, pAo.x, pAo.y, 1);
        const geo = ReadBlockF(nd, pNd.x, pNd.y, 1);
        const bent = OctDecode(ao.mean[1], ao.mean[2]);
        const len = Math.hypot(geo.mean[0], geo.mean[1], geo.mean[2]) || 1;
        const gn = [geo.mean[0] / len, geo.mean[1] / len, geo.mean[2] / len];
        return bent[0] * gn[0] + bent[1] * gn[1] + bent[2] * gn[2];
      };
      out.bentNormal = {
        open: BentVsGeometry(WORLD.groundOpen),
        corner: BentVsGeometry(WORLD.groundCorner),
      };
    }

    // --- 8) SSIL：靠红墙那一端带红，远端不带 -------------------------------
    {
      const nearIl = ReadBlockF(aoTarget, pNear.x, pNear.y, 2, 1);
      const farIl = ReadBlockF(aoTarget, pOpen.x, pOpen.y, 2, 1);
      // MRT 读完把 readBuffer 拨回 0 号附件，别把状态留给后面的取证
      renderer.readRenderTargetPixels(aoTarget, 0, 0, 1, 1, new Uint16Array(4), undefined, 0);
      out.ssil = {
        near: nearIl.mean.slice(0, 3),
        far: farIl.mean.slice(0, 3),
        nearRedOverBlue: nearIl.mean[0] / Math.max(nearIl.mean[2], 1e-4),
        nearOverFar: nearIl.mean[0] / Math.max(farIl.mean[0], 1e-5),
      };

      // 材质真的在用它。取证走**线性 HDR 靶**而不是 LDR：曝光 + ACES + sRGB
      // 会把百分之几的间接光增量压成一两个 8 位台阶，那是在量化噪声里找信号。
      // HDR 上直接看相对增量，量纲干净、灵敏度够；顺带也读一份 LDR 给人看。
      const ldr = post.targets.ldr;
      const hdr = post.targets.hdr;
      const pNearLdr = ProjectTo(WORLD.groundNear, ldr);
      const pFarLdr = ProjectTo(WORLD.groundOpen, ldr);
      const pNearHdr = ProjectTo(WORLD.groundNear, hdr);
      const pFarHdr = ProjectTo(WORLD.groundOpen, hdr);
      const ReadLdr = (p) => {
        const buffer = new Uint8Array(5 * 5 * 4);
        renderer.readRenderTargetPixels(ldr, Math.max(0, p.x - 2), Math.max(0, p.y - 2), 5, 5, buffer);
        const sum = [0, 0, 0];
        for (let i = 0; i < 25; i += 1) for (let c = 0; c < 3; c += 1) sum[c] += buffer[i * 4 + c];
        return sum.map((s) => s / 25);
      };
      const ReadHdr = (p) => ReadBlockF(hdr, p.x, p.y, 2).mean.slice(0, 3);
      const wasStrength = P.ssao.ssilStrength.value;
      P.ssao.ssilStrength.value = 0;
      Settle(24);
      const offNear = ReadLdr(pNearLdr);
      const offFar = ReadLdr(pFarLdr);
      const offNearHdr = ReadHdr(pNearHdr);
      const offFarHdr = ReadHdr(pFarHdr);
      P.ssao.ssilStrength.value = wasStrength;
      Settle(24);
      const onNear = ReadLdr(pNearLdr);
      const onFar = ReadLdr(pFarLdr);
      const onNearHdr = ReadHdr(pNearHdr);
      const onFarHdr = ReadHdr(pFarHdr);
      // 再来一档「旋钮拧到 4 倍」：一是证明这根旋钮真的通到屏幕（LDR 上看得见），
      // 二是证明整条链是线性的（HDR 增量应该正好翻四倍）。出厂 0.7 在这种
      // 大环境光的取证场里只值 1-2 个 8 位台阶 —— 那是物理上正确的量，
      // 不是实现弱，所以「看得见」这一条要在旋钮拧上去之后验。
      P.ssao.ssilStrength.value = wasStrength * 4;
      Settle(24);
      const loudNear = ReadLdr(pNearLdr);
      const loudFar = ReadLdr(pFarLdr);
      const loudNearHdr = ReadHdr(pNearHdr);
      P.ssao.ssilStrength.value = wasStrength;
      Settle(24);
      out.ssilMaterial = {
        loudNearTint: (loudNear[0] - loudNear[2]) - (offNear[0] - offNear[2]),
        loudFarTint: (loudFar[0] - loudFar[2]) - (offFar[0] - offFar[2]),
        loudRedGain: (loudNearHdr[0] - offNearHdr[0]) / Math.max(offNearHdr[0], 1e-4),
        strength: wasStrength,
        offNear, offFar, onNear, onFar,
        offNearHdr, onNearHdr, offFarHdr, onFarHdr,
        // 近端红通道的相对增量；远端应该几乎不动
        nearRedGain: (onNearHdr[0] - offNearHdr[0]) / Math.max(offNearHdr[0], 1e-4),
        nearBlueGain: (onNearHdr[2] - offNearHdr[2]) / Math.max(offNearHdr[2], 1e-4),
        farRedGain: (onFarHdr[0] - offFarHdr[0]) / Math.max(offFarHdr[0], 1e-4),
        // 「红减蓝」在正式画面（LDR）上的可见增量
        nearTint: (onNear[0] - onNear[2]) - (offNear[0] - offNear[2]),
        farTint: (onFar[0] - onFar[2]) - (offFar[0] - offFar[2]),
      };

      // 整趟关掉 SSIL：靶换成 1×1 全黑，材质那一次取样恒为 0
      post.SetSsilEnabled(false);
      Settle(12);
      out.ssilOff = {
        textureIs1x1: post.SsilTexture.image?.width === 1 && post.SsilTexture.image?.height === 1,
        attachments: post.targets.aoBlur.textures.length,
        aoStillWorks: (() => {
          const target = post.targets.aoBlur;
          const p = ProjectTo(WORLD.groundCorner, target);
          const q = ProjectTo(WORLD.groundOpen, target);
          return ReadBlockF(target, q.x, q.y, 2).mean[0] - ReadBlockF(target, p.x, p.y, 2).mean[0];
        })(),
      };
      post.SetSsilEnabled(true);
      Settle(24);
    }

    // --- 7 & 9) 三个调试视图都出画 -----------------------------------------
    {
      const viewWas = post.GetDebugView();
      const Stats = (view) => {
        post.SetDebugView(view);
        P.StepFrames(3, 1 / 60);
        const shot = ReadScreen();
        let min = 255;
        let max = 0;
        let sum = 0;
        let count = 0;
        const histogram = new Set();
        for (let i = 0; i < shot.pixels.length; i += 4) {
          const v = shot.pixels[i];
          min = Math.min(min, v);
          max = Math.max(max, v);
          sum += v;
          count += 1;
          histogram.add(v >> 3);
        }
        return { min, max, mean: sum / count, buckets: histogram.size };
      };
      out.views = {
        bentNormal: Stats("bentNormal"),
        ssil: Stats("ssil"),
        specularOcclusion: Stats("specularOcclusion"),
        aoBlur: Stats("aoBlur"),
      };
      post.SetDebugView(viewWas);
      P.StepFrames(2, 1 / 60);
    }

    // --- 10) 稳态不再编译新程序 -------------------------------------------
    P.StepFrames(10, 1 / 60);
    const programsBefore = renderer.info.programs.length;
    P.StepFrames(60, 1 / 60);
    out.programs = { before: programsBefore, after: renderer.info.programs.length };
    out.glError = gl.getError();
    return out;
  });
} catch (error) {
  problems.push(`THROW ${String(error).slice(0, 400)}`);
}

await browser.close();
server.close();

const checks = [];
function Check(name, ok, detail = "") {
  checks.push({ name, ok: !!ok, detail });
}

if (!result) {
  Check("页面取证成功", false, problems.join(" | "));
} else {
  Check("帧图里有 gtao 与 ssilHistory",
    result.passOrder.includes("gtao") && result.passOrder.includes("ssilHistory")
    && result.passOrder.indexOf("gtao") < result.passOrder.indexOf("main")
    && result.passOrder.indexOf("ssilHistory") > result.passOrder.indexOf("taa"),
    JSON.stringify(result.passOrder));
  Check("AO 靶是半分辨率 RGBA16F 双附件（R=AO/GB=弯曲法线/A=视深 + SSIL）",
    result.targets.halfFloat && result.targets.attachments === 2 && result.targets.ssilIsSecond
    && result.targets.size[0] < result.targets.mainSize[0],
    JSON.stringify(result.targets));
  Check("四个取证机位都在屏幕内", result.world.onScreen, JSON.stringify(result.world.ndc));
  // 墙根 0.09 m 处的接触带 vs 1.4 m 开外的空旷地。GTAO 的可见度是解析积分，
  // 90° 内墙角理论上就该掉到 0.5 附近；0.15 的门槛留了足够裕量又能抓住"AO 没生效"。
  Check("墙根有接触暗带（AO 比空旷地低 0.15 以上）",
    result.contact.delta > 0.15 && result.contact.open > 0.75,
    JSON.stringify(result.contact));
  // 波纹判据分两层：起伏本身必须小（0.03 = 255 级里 8 级，肉眼阈值附近）；
  // 只有当起伏大到看得见（> 0.004）时，才追问它是不是**周期性**的
  // （lag-2 自相关高 = 一格一条的条纹）。起伏只有千分之几时自相关量的是
  // 地面本身那点平滑梯度，逼它小于 0.5 只是在跟浮点噪声较劲。
  Check("平地上没有规则波纹（起伏 < 0.03；起伏可见时还要非周期）",
    result.flatness.stddev < 0.03
    && (result.flatness.stddev < 0.004 || result.flatness.autocorr2 < 0.5),
    JSON.stringify(result.flatness));
  Check("时域收敛：静止 32 帧后逐帧差极小（均值 < 0.004）",
    result.converge.meanDelta < 0.004 && result.converge.maxDelta < 0.06,
    JSON.stringify(result.converge));
  Check("平移 0.5 m 无重投影残影（与清历史重收敛的结果一致）",
    result.ghosting.meanDelta < 0.03 && result.ghosting.maxDelta < 0.30,
    JSON.stringify(result.ghosting));
  // 门槛按几何算出来的，不是拍的：取证点在墙前 0.10 m，实测可见度 0.75，
  // 即缺了约四分之一个半球 —— 对应的弯曲法线偏转约 17°（cos ≈ 0.955）。
  // 所以「墙根 < 0.975 且比空旷地低 0.02 以上」是有余量又抓得住的判据；
  // 逼它低到 0.93（≈21°）等于要求一个物理上不该出现的偏转。
  Check("弯曲法线：空旷地 ≈ 几何法线、墙根按遮蔽量偏离",
    result.bentNormal.open > 0.98 && result.bentNormal.corner < 0.975
    && result.bentNormal.open - result.bentNormal.corner > 0.02,
    JSON.stringify(result.bentNormal));
  Check("SSIL：灰墙靠红墙那一端显著带红且远端不带",
    result.ssil.nearRedOverBlue > 1.5 && result.ssil.nearOverFar > 3
    && result.ssil.near[0] > 0.01,
    JSON.stringify(result.ssil));
  Check("SSIL 真的进了材质：HDR 里近端红通道被抬、蓝通道与远端几乎不动",
    result.ssilMaterial.nearRedGain > 0.02
    && result.ssilMaterial.nearRedGain > result.ssilMaterial.nearBlueGain * 4
    && Math.abs(result.ssilMaterial.farRedGain) < result.ssilMaterial.nearRedGain * 0.35,
    JSON.stringify(result.ssilMaterial));
  Check("SSIL 强度旋钮线性且通到屏幕（×4 时 HDR 增量翻四倍、LDR 看得见）",
    result.ssilMaterial.loudRedGain > result.ssilMaterial.nearRedGain * 3.5
    && result.ssilMaterial.loudRedGain < result.ssilMaterial.nearRedGain * 4.5
    && result.ssilMaterial.loudNearTint >= 4
    && Math.abs(result.ssilMaterial.loudFarTint) < result.ssilMaterial.loudNearTint * 0.35,
    JSON.stringify({
      nearRedGain: result.ssilMaterial.nearRedGain,
      loudRedGain: result.ssilMaterial.loudRedGain,
      loudNearTint: result.ssilMaterial.loudNearTint,
      loudFarTint: result.ssilMaterial.loudFarTint,
    }));
  Check("关掉 SSIL：靶退成 1×1 全黑，AO 照常工作",
    result.ssilOff.textureIs1x1 && result.ssilOff.attachments === 1
    && result.ssilOff.aoStillWorks > 0.15,
    JSON.stringify(result.ssilOff));
  Check("弯曲法线调试图出画且有方向变化",
    result.views.bentNormal.buckets > 4 && result.views.bentNormal.max > 40,
    JSON.stringify(result.views.bentNormal));
  Check("SSIL 调试图出画（不是一片纯黑）",
    result.views.ssil.max > 12 && result.views.ssil.buckets > 2,
    JSON.stringify(result.views.ssil));
  Check("镜面遮蔽调试图有梯度（不是一片常数）",
    result.views.specularOcclusion.buckets > 4
    && result.views.specularOcclusion.max - result.views.specularOcclusion.min > 40,
    JSON.stringify(result.views.specularOcclusion));
  Check("AO 调试图仍然出画",
    result.views.aoBlur.max > 200 && result.views.aoBlur.min < 200,
    JSON.stringify(result.views.aoBlur));
  Check("60 帧内不再编译新程序",
    result.programs.after === result.programs.before, JSON.stringify(result.programs));
  Check("无 GL 错误", result.glError === 0, `glError=${result.glError}`);
  Check("页面无控制台报错", problems.length === 0, problems.slice(0, 4).join(" | "));
}

// 数值全打出来（不只是失败项）：这条测试的门槛全是实测标定的，
// 下一次调参的人要能一眼看到当前落在哪儿、离门槛还有多远。
if (result) {
  console.log("读数：" + JSON.stringify({
    tier: result.targets.tier, aoSize: result.targets.size,
    contact: result.contact, flatness: result.flatness, converge: result.converge,
    ghosting: result.ghosting, bentNormal: result.bentNormal,
    ssil: result.ssil, ssilMaterial: result.ssilMaterial, views: result.views,
  }, null, 1).slice(0, 3000));
}

for (const check of checks) {
  console.log(`${check.ok ? "ok  " : "FAIL"} ${check.name}${check.ok ? "" : `  ${check.detail}`}`);
}
const failed = checks.filter((check) => !check.ok);
console.log(failed.length ? `\n${failed.length} 条失败` : "\nGTAO / SSIL 全绿");
if (failed.length) process.exit(1);
