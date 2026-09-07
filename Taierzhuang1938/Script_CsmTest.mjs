// ===========================================================================
// Script_CsmTest.mjs —— 级联阴影 / PCSS / 屏幕空间接触阴影的看门狗（真浏览器，render 域）
//
// 断的都是**数值**不是观感：
//   1. N 张级联图真的烘出来了、尺寸对；只有第 0 盏灯带强度（能量守恒的安全网）
//   2. 分割严格单调、铺到 min(camera.far, 档位上限)、逐级纹素单调变粗
//   3. 光空间纹素吸附：相机平移 0.37 个纹素之后各级的光空间中心一格没动
//   4. 相邻级重叠：本级过渡带的边界投进下一级仍在图内（「无硬缝」的几何前提）
//   5. 一帧只烘一张（城里每趟烘焙有 ~1.45 M 三角的地板，单帧红线只剩 2.59 M 余量），
//      且一轮 bakeOrder 之内每一级都被烘到
//   6. 地面没有大面积痤疮（数「孤立暗点」，normalBias 归零时也要守住）
//   7. 级联假彩色图上至少看得到两级；SunShadow 图有黑有白
//   8. 接触阴影图有黑有白，且关掉之后材质那边退回纯白
//   9. 60 帧内不再编译新程序、GL 无错、无控制台报错
//
// 顺带报告（不断言）：每帧阴影 draw call 数、逐级纹素世界尺寸。
//
// 用法：node Taierzhuang1938/Script_CsmTest.mjs
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
const page = await browser.newPage({ viewport: { width: 640, height: 360 } });

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
    `http://127.0.0.1:${port}/Taierzhuang1938/Probe.html?quality=high&preset=smokyDay&scene=street&gi=0`,
    { waitUntil: "load", timeout: 180000 },
  );
  await page.waitForFunction(() => window.Probe?.state?.ready, null, { timeout: 240000 });
  result = await page.evaluate(async () => {
    const THREE = await import("./vendor/three/build/three.module.js");
    const P = window.Probe;
    const post = P.post;
    const renderer = P.renderer;
    const lights = P.lights;
    const csm = lights.csm;
    const gl = renderer.getContext();
    const out = {};

    const ReadScreen = () => {
      const canvas = renderer.domElement;
      const width = canvas.width;
      const height = canvas.height;
      const pixels = new Uint8Array(width * height * 4);
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      return { width, height, pixels };
    };

    // 时间与帧序钉死，跨进程可复现
    P.state.elapsed = 0;
    post.frame = 0;
    post.hasTaaHistory = false;
    post.hasPrev = false;
    lights.NotifyCameraCut();
    P.StepFrames(10, 1 / 60);

    // --- 1) 级联建起来了 ---------------------------------------------------
    const state = lights.GetShadowState();
    out.rig = {
      cascades: state.cascades,
      mapSize: state.mapSize,
      rawDepth: state.rawDepth,
      pcssLevels: state.pcssLevels,
      baked: state.baked,
      mapSizes: state.mapSizes,
      castShadow: state.castShadow,
      intensityPerLight: state.intensityPerLight,
      shadowMapType: renderer.shadowMap.type,
      basicType: THREE.BasicShadowMap,
      autoUpdate: renderer.shadowMap.autoUpdate,
      // 能量守恒：只有第 0 盏带强度，其余是阴影图的容器
      onlyFirstLit: state.intensityPerLight.every((v, i) => (i === 0 ? v > 0 : v === 0)),
      // 深度纹理必须是「裸深度」（compareFunction 为 null），否则 PCSS 读不到值
      compareFunctions: csm.lights.map((l) => l.shadow.map?.depthTexture?.compareFunction ?? null),
    };

    // --- 2) 分割与纹素 -----------------------------------------------------
    const splits = state.splits;
    out.splits = {
      values: splits,
      monotone: splits.every((v, i) => i === 0 || v > splits[i - 1]),
      far: splits[splits.length - 1],
      cameraFar: P.camera.far,
      radii: state.radii,
      texelCm: state.texelWorld.map((v) => v * 100),
      texelMonotone: state.texelWorld.every((v, i) => i === 0 || v > state.texelWorld[i - 1]),
      // 逐级 bias / normalBias 也必须跟着纹素放大（不然近处彼得潘 + 远处痤疮）
      normalBias: state.normalBias,
      normalBiasMonotone: state.normalBias.every((v, i) => i === 0 || v >= state.normalBias[i - 1] - 1e-9),
    };

    // --- 3) 光空间纹素吸附 -------------------------------------------------
    // 相机沿光空间的 right 轴平移 0.37 个「第 0 级纹素」，吸附生效的话
    // 各级光空间中心的 (right, up) 分量一格都不许动。
    const lightDir = lights.sunDirection.clone().normalize();
    const worldUp = Math.abs(lightDir.y) > 0.98
      ? new THREE.Vector3(0, 0, 1) : new THREE.Vector3(0, 1, 0);
    const right = new THREE.Vector3().crossVectors(worldUp, lightDir).normalize();
    const upAxis = new THREE.Vector3().crossVectors(lightDir, right).normalize();
    const LightSpaceCenters = () => csm.lights.map((light) => {
      const t = light.target.position;
      return [t.dot(right), t.dot(upAxis)];
    });
    const beforeCenters = LightSpaceCenters();
    const cameraWas = P.camera.position.clone();
    const texel0 = state.texelWorld[0];
    P.camera.position.addScaledVector(right, texel0 * 0.37);
    // 强制全级重拟合，否则被节流的级本来就不动，测不出吸附
    csm.ForceUpdate();
    P.StepFrames(1, 1 / 60);
    const afterCenters = LightSpaceCenters();
    // 吸附生效 = 中心只会**整纹素**地跳（0 或 ±1 格），永远不会跟着相机走
    // 一个零头。0.37 格的平移刚好可能跨过一次四舍五入的分界，所以判据不是
    // 「一动不动」而是「位移是本级纹素的整数倍」——那正是「阴影图内容整格平移、
    // 边缘不爬行」的充要条件。
    const snapResidual = [];
    for (let i = 0; i < beforeCenters.length; i += 1) {
      const texel = state.texelWorld[i];
      for (let axis = 0; axis < 2; axis += 1) {
        const delta = Math.abs(beforeCenters[i][axis] - afterCenters[i][axis]) / texel;
        snapResidual.push(Math.abs(delta - Math.round(delta)));
      }
    }
    P.camera.position.copy(cameraWas);
    csm.ForceUpdate();
    P.StepFrames(2, 1 / 60);
    out.snap = {
      texel0,
      moved: texel0 * 0.37,
      worstResidual: Math.max(...snapResidual),
      snapped: Math.max(...snapResidual) < 0.002,
    };

    // --- 4) 相邻级重叠（无硬缝的几何前提） --------------------------------
    // 取本级过渡带的外沿（|uv-0.5| = 0.5 - fade）上的一圈点，反投回世界，
    // 再投进下一级 —— 必须落在 [0,1]^3 里，否则混合时下一级没有数据可用。
    const fade = csm.preset.fade;
    const overlap = [];
    for (let level = 0; level + 1 < csm.count; level += 1) {
      const near = csm.lights[level];
      const far = csm.lights[level + 1];
      const invNear = near.shadow.matrix.clone().invert();
      let worst = 1;
      for (let a = 0; a < 16; a += 1) {
        const angle = (a / 16) * Math.PI * 2;
        const edge = 0.5 - fade;
        const u = 0.5 + Math.cos(angle) * edge;
        const v = 0.5 + Math.sin(angle) * edge;
        for (const z of [0.15, 0.5, 0.85]) {
          const world = new THREE.Vector4(u, v, z, 1).applyMatrix4(invNear);
          world.multiplyScalar(1 / world.w);
          const coord = new THREE.Vector4(world.x, world.y, world.z, 1)
            .applyMatrix4(far.shadow.matrix);
          coord.multiplyScalar(1 / coord.w);
          const margin = Math.min(
            coord.x, 1 - coord.x, coord.y, 1 - coord.y, coord.z, 1 - coord.z,
          );
          worst = Math.min(worst, margin);
        }
      }
      overlap.push(worst);
    }
    out.overlap = { fade, worstMargin: overlap, allInside: overlap.every((m) => m > 0.001) };

    // --- 5) 一帧只烘一张（单帧三角红线的硬约束） --------------------------
    const counts = new Array(csm.count).fill(0);
    const perFrame = [];
    const FRAMES = state.bakeOrder.length * 3;
    for (let i = 0; i < FRAMES; i += 1) {
      P.StepFrames(1, 1 / 60);
      let baked = 0;
      csm.lastScheduled.forEach((on, level) => { if (on) { counts[level] += 1; baked += 1; } });
      perFrame.push(baked);
    }
    out.throttle = {
      frames: FRAMES,
      counts,
      perFrameMax: Math.max(...perFrame),
      bakeOrder: state.bakeOrder,
      // 城里每趟烘焙有 ~1.45 M 三角的地板，单帧三角红线只剩 2.59 M 余量 ——
      // 一帧烘两张就顶穿（BootTest 会红）。这一条是那道闸。
      onePerFrame: perFrame.every((n) => n === 1),
      allCovered: counts.every((c) => c > 0),
      matchesOrder: counts.every((c, level) => {
        const slots = state.bakeOrder.filter((v) => v === level).length;
        return Math.abs(c - slots * 3) <= 1;
      }),
    };

    // --- 6) 痤疮：数「孤立暗点」 -------------------------------------------
    // 亮区里孤零零的暗像素 = 自阴影痤疮；成片的暗是真影子，不算。
    const viewWas = post.GetDebugView();
    const SpeckleRatio = () => {
      post.SetDebugView("sunShadow");
      P.StepFrames(2, 1 / 60);
      const shot = ReadScreen();
      post.SetDebugView(viewWas);
      const { width, height, pixels } = shot;
      const At = (x, y) => pixels[(y * width + x) * 4];
      const IsGrey = (x, y) => {
        const i = (y * width + x) * 4;
        return pixels[i] === pixels[i + 1] && pixels[i + 1] === pixels[i + 2];
      };
      let speckles = 0;
      let ground = 0;
      // 下半屏 = 地面为主
      for (let y = 2; y < Math.floor(height * 0.5); y += 1) {
        for (let x = 2; x < width - 2; x += 1) {
          if (!IsGrey(x, y)) continue;              // 天空是深蓝底
          ground += 1;
          if (At(x, y) > 110) continue;
          const around = (At(x - 1, y) + At(x + 1, y) + At(x, y - 1) + At(x, y + 1)) / 4;
          if (around > 200) speckles += 1;
        }
      }
      return { speckles, ground, ratio: ground ? speckles / ground : 0 };
    };
    const acneDefault = SpeckleRatio();
    const normalBiasWas = csm.baseNormalBias;
    csm.SetBias(csm.baseBias, 0);
    P.StepFrames(3, 1 / 60);
    const acneNoNormalBias = SpeckleRatio();
    csm.SetBias(csm.baseBias, normalBiasWas);
    P.StepFrames(3, 1 / 60);
    out.acne = { withNormalBias: acneDefault, withoutNormalBias: acneNoNormalBias };

    // --- 7) 级联假彩色 / SunShadow ----------------------------------------
    post.SetDebugView("csmCascade");
    P.StepFrames(2, 1 / 60);
    const cascadeShot = ReadScreen();
    const seen = new Set();
    let colored = 0;
    for (let i = 0; i < cascadeShot.pixels.length; i += 4) {
      const r = cascadeShot.pixels[i];
      const g = cascadeShot.pixels[i + 1];
      const b = cascadeShot.pixels[i + 2];
      // 级联底色：红 / 黄 / 绿 / 蓝。按主导通道归类（底色乘了可见度，亮度会变）
      if (r < 20 && g < 20 && b < 20) continue;
      if (r > g * 1.6 && r > b * 1.6) { seen.add(0); colored += 1; }
      else if (r > b * 1.6 && g > b * 1.6) { seen.add(1); colored += 1; }
      else if (g > r * 1.4 && g > b * 1.4) { seen.add(2); colored += 1; }
      else if (b > r * 1.4 && b > g * 1.2) { seen.add(3); colored += 1; }
    }
    out.cascadeView = { levelsSeen: [...seen].sort(), colored, atLeastTwo: seen.size >= 2 };

    post.SetDebugView("sunShadow");
    P.StepFrames(2, 1 / 60);
    const shadowShot = ReadScreen();
    let dark = 0;
    let bright = 0;
    for (let i = 0; i < shadowShot.pixels.length; i += 4) {
      const r = shadowShot.pixels[i];
      if (r !== shadowShot.pixels[i + 1] || r !== shadowShot.pixels[i + 2]) continue;
      if (r < 90) dark += 1;
      if (r > 220) bright += 1;
    }
    out.sunShadow = { dark, bright, hasBoth: dark > 50 && bright > 50 };

    // 半影视图：至少要有「硬」和「软」两种（不然 blocker search 没生效）
    post.SetDebugView("csmPenumbra");
    P.StepFrames(2, 1 / 60);
    const penumbraShot = ReadScreen();
    let hard = 0;
    let soft = 0;
    for (let i = 0; i < penumbraShot.pixels.length; i += 4) {
      const r = penumbraShot.pixels[i];
      const b = penumbraShot.pixels[i + 2];
      if (b > r + 40) hard += 1;
      if (r > b + 40) soft += 1;
    }
    out.penumbraView = { hard, soft, hasBoth: hard > 50 && soft > 50 };

    // --- 8) 接触阴影 -------------------------------------------------------
    post.SetDebugView("contactShadow");
    P.StepFrames(2, 1 / 60);
    const contactShot = ReadScreen();
    let contactDark = 0;
    let contactBright = 0;
    for (let i = 0; i < contactShot.pixels.length; i += 4) {
      const r = contactShot.pixels[i];
      if (r < 140) contactDark += 1;
      if (r > 235) contactBright += 1;
    }
    const patches = await import("./Script_Csm.mjs");
    const contactTexture = patches.CSM_CONTACT_UNIFORMS.map.value;
    post.SetDebugView(viewWas);
    // 关掉之后材质那边必须退回 1×1 纯白（Idle）
    const presetWas = post.preset.contactShadows;
    post.preset.contactShadows = false;
    P.StepFrames(2, 1 / 60);
    const contactOffTexture = patches.CSM_CONTACT_UNIFORMS.map.value;
    post.preset.contactShadows = presetWas;
    P.StepFrames(2, 1 / 60);
    out.contact = {
      dark: contactDark, bright: contactBright,
      hasBoth: contactDark > 20 && contactBright > 500,
      compiled: patches.IsCsmContactCompiled(),
      boundWhenOn: contactTexture === post.contactShadowsPass.blur.texture,
      whiteWhenOff: contactOffTexture === patches.CsmWhiteTexture(),
      restored: patches.CSM_CONTACT_UNIFORMS.map.value === post.contactShadowsPass.blur.texture,
    };

    // --- 9) 阴影 draw call（报告用） ---------------------------------------
    const shadowMap = renderer.shadowMap;
    const original = shadowMap.render;
    let shadowCalls = 0;
    let shadowFrames = 0;
    shadowMap.render = function Counted(lightList, scene, camera) {
      const before = renderer.info.render.calls;
      const value = original.call(this, lightList, scene, camera);
      const delta = renderer.info.render.calls - before;
      if (delta > 0) { shadowCalls += delta; shadowFrames += 1; }
      return value;
    };
    csm.pendingForce = false;
    P.StepFrames(12, 1 / 60);
    shadowMap.render = original;
    out.shadowDraw = {
      totalOver12Frames: shadowCalls,
      perFrame: shadowCalls / 12,
      framesWithBake: shadowFrames,
    };

    // --- 10) 稳态不再编译新程序 -------------------------------------------
    P.StepFrames(10, 1 / 60);
    const programsBefore = renderer.info.programs.length;
    P.StepFrames(60, 1 / 60);
    out.programs = { before: programsBefore, after: renderer.info.programs.length };
    out.glError = gl.getError();
    return out;
  });
} catch (error) {
  problems.push(`THROW ${String(error).slice(0, 600)}`);
}

// ---------------------------------------------------------------------------
// 分档：low / medium / ultra 生成的是**另一套 GLSL**（级数、抽样数、PCSS 级数都不同）。
// 着色器编译失败 three 只在控制台留一行，那一趟什么都不画 —— 所以每一档都要
// 真的跑一遍并读回像素，不能只验 high。
// ---------------------------------------------------------------------------
const presets = [];
for (const quality of ["low", "medium", "ultra"]) {
  const before = problems.length;
  try {
    await page.goto(
      `http://127.0.0.1:${port}/Taierzhuang1938/Probe.html?quality=${quality}&preset=smokyDay&scene=street&gi=0`,
      { waitUntil: "load", timeout: 180000 },
    );
    await page.waitForFunction(() => window.Probe?.state?.ready, null, { timeout: 240000 });
    const row = await page.evaluate((name) => {
      const P = window.Probe;
      const gl = P.renderer.getContext();
      P.state.elapsed = 0;
      P.post.frame = 0;
      P.lights.NotifyCameraCut();
      P.StepFrames(20);
      const state = P.lights.GetShadowState();
      const viewWas = P.post.GetDebugView();
      P.post.SetDebugView("sunShadow");
      P.StepFrames(2, 1 / 60);
      const canvas = P.renderer.domElement;
      const pixels = new Uint8Array(canvas.width * canvas.height * 4);
      gl.readPixels(0, 0, canvas.width, canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
      P.post.SetDebugView(viewWas);
      let dark = 0;
      let bright = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        if (r !== pixels[i + 1] || r !== pixels[i + 2]) continue;
        if (r < 90) dark += 1;
        if (r > 220) bright += 1;
      }
      P.StepFrames(30);
      return {
        quality: name,
        cascades: state.cascades,
        mapSize: state.mapSize,
        pcssLevels: state.pcssLevels,
        baked: state.baked.every(Boolean),
        texelCm: state.texelWorld.map((v) => v * 100),
        contact: !!P.post.preset.contactShadows,
        dark, bright, hasBoth: dark > 50 && bright > 50,
        glError: gl.getError(),
      };
    }, quality);
    presets.push(row);
  } catch (error) {
    problems.push(`THROW(${quality}) ${String(error).slice(0, 300)}`);
    presets.push({ quality, failed: true });
  }
  if (problems.length > before) {
    presets[presets.length - 1].console = problems.slice(before, before + 2).join(" | ");
  }
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
  Check("high 档三级阴影图都烘出来了且尺寸正确",
    result.rig.cascades === 3 && result.rig.baked.every(Boolean)
    && result.rig.mapSizes.every((s) => s === result.rig.mapSize),
    JSON.stringify(result.rig));
  Check("只有第 0 盏灯带强度（能量守恒）", result.rig.onlyFirstLit,
    JSON.stringify(result.rig.intensityPerLight));
  Check("阴影图是裸深度（BasicShadowMap，PCSS 能读到深度）",
    result.rig.shadowMapType === result.rig.basicType && result.rig.rawDepth
    && result.rig.compareFunctions.every((f) => f === null)
    && result.rig.autoUpdate === false,
    JSON.stringify({ type: result.rig.shadowMapType, cf: result.rig.compareFunctions }));
  Check("分割严格单调且逐级纹素变粗",
    result.splits.monotone && result.splits.texelMonotone && result.splits.normalBiasMonotone,
    JSON.stringify(result.splits));
  Check("最近一级纹素比重构前（3.2 cm）更细",
    result.splits.texelCm[0] < 3.2, `${result.splits.texelCm[0].toFixed(2)} cm`);
  Check("覆盖距离铺到档位上限的九成以上",
    result.splits.far >= Math.min(result.splits.cameraFar, 120) * 0.9,
    `far=${result.splits.far} cameraFar=${result.splits.cameraFar}`);
  Check("最远一级的覆盖半径不小于重构前那张 66 m 框",
    result.splits.radii[result.splits.radii.length - 1] >= 66,
    JSON.stringify(result.splits.radii));
  Check("相机平移 0.37 纹素后各级光空间中心只整纹素地跳（纹素吸附）",
    result.snap.snapped, JSON.stringify(result.snap));
  Check("相邻级重叠：本级过渡带外沿投进下一级仍在图内",
    result.overlap.allInside, JSON.stringify(result.overlap));
  Check("一帧只烘一张（单帧三角红线的硬约束）",
    result.throttle.onePerFrame, JSON.stringify(result.throttle));
  Check("一轮之内每一级都被烘到且比例对得上 bakeOrder",
    result.throttle.allCovered && result.throttle.matchesOrder, JSON.stringify(result.throttle));
  Check("地面没有大面积痤疮（孤立暗点 < 0.5%）",
    result.acne.withNormalBias.ratio < 0.005, JSON.stringify(result.acne.withNormalBias));
  Check("normalBias 归零时仍没有大面积痤疮（receiver-plane 偏置顶住）",
    result.acne.withoutNormalBias.ratio < 0.02, JSON.stringify(result.acne.withoutNormalBias));
  Check("级联假彩色图上至少看得到两级",
    result.cascadeView.atLeastTwo, JSON.stringify(result.cascadeView));
  Check("SunShadow 采样图有黑有白", result.sunShadow.hasBoth, JSON.stringify(result.sunShadow));
  Check("半影视图同时有硬和软（PCSS 的 blocker search 生效）",
    result.penumbraView.hasBoth, JSON.stringify(result.penumbraView));
  Check("接触阴影图有黑有白且只在遮挡处",
    result.contact.hasBoth && result.contact.compiled && result.contact.boundWhenOn,
    JSON.stringify(result.contact));
  Check("接触阴影关掉后材质那边退回 1×1 纯白，再开又接回来",
    result.contact.whiteWhenOff && result.contact.restored, JSON.stringify(result.contact));
  Check("60 帧内不再编译新程序",
    result.programs.after === result.programs.before, JSON.stringify(result.programs));
  Check("无 GL 错误", result.glError === 0, `glError=${result.glError}`);
}

// 分档：每一档生成的是**另一套 GLSL**（级数 / 抽样数 / PCSS 级数都不同）。
// 着色器编译失败 three 只在控制台留一行，那一趟什么都不画 —— 只验 high 是不够的。
const EXPECTED = { low: 2, medium: 3, ultra: 4 };
for (const row of presets) {
  Check(`${row.quality} 档：级联建起来、图都烘了、SunShadow 有黑有白`,
    !row.failed && row.cascades === EXPECTED[row.quality] && row.baked
    && row.hasBoth && row.glError === 0,
    JSON.stringify(row));
}
Check("页面无控制台报错", problems.length === 0, problems.slice(0, 6).join(" | "));

for (const check of checks) {
  console.log(`${check.ok ? "ok  " : "FAIL"} ${check.name}${check.ok ? "" : `  ${check.detail}`}`);
}
if (result) {
  console.log("\n--- 报告（不断言） ---");
  console.log(`级联 ${result.rig.cascades} 级 × ${result.rig.mapSize}，PCSS 最近 ${result.rig.pcssLevels} 级`);
  console.log(`分割 ${result.splits.values.map((v) => v.toFixed(1)).join(" / ")} m`);
  console.log(`逐级半径 ${result.splits.radii.map((v) => v.toFixed(1)).join(" / ")} m`);
  console.log(`逐级纹素 ${result.splits.texelCm.map((v) => v.toFixed(2)).join(" / ")} cm`);
  console.log(`阴影 draw call ${result.shadowDraw.perFrame.toFixed(1)}/帧`
    + `（12 帧共 ${result.shadowDraw.totalOver12Frames}，其中 ${result.shadowDraw.framesWithBake} 帧真的烘了）`);
}
if (presets.length) {
  console.log(`分档 ${presets.map((row) => (row.failed
    ? `${row.quality}=崩`
    : `${row.quality}=${row.cascades}级×${row.mapSize} PCSS${row.pcssLevels} 纹素${row.texelCm[0].toFixed(2)}cm`)).join("  ")}`);
}
const failed = checks.filter((check) => !check.ok);
console.log(failed.length ? `\n${failed.length} 条失败` : "\n级联阴影全绿");
if (failed.length) process.exit(1);
