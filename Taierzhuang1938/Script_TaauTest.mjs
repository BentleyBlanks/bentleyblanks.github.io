// TAAU / 逐物体运动模糊 / 散景景深的真浏览器回归。
//
// 这三件事共用同一条时域链，回归口也只能在实机上量 —— 它们全部依赖预通道的
// 速度靶、TAA 的历史乒乓与「内部 / 输出」两组分辨率，任何一处静默失灵都不会
// 报错，只会让画面变糊或者出鬼影。
//
// 量的八件事：
//   1. **两组分辨率**：renderScale 0.75 时内部靶 = 0.75×，输出靶（ldr / 历史）满分辨率。
//   2. **静止收敛**：滚满 16 帧后逐帧差近零（边缘不爬）。
//   3. **抗锯齿真的在做事**：场景里插一条 20° 斜边，量它的亚像素边位残差 ——
//      锯齿把边位量化到整数像素，抗锯齿把它拉回连续。TAA 关 / 开两版对比。
//   4. **TAAU 画质**：0.85 / 0.8 / 0.75 / 0.67 四档对 1.0 的 PSNR（同机位同帧数）。
//   5. **速度靶对鬼影**：走动的兵在「速度靶开 / 关（退回深度反投影）」两版下
//      与同一瞬间无 TAA 参考图的偏差 —— 关掉必然更大（相机不动时深度反投影的
//      速度恒为 0，历史把兵的旧位置整个叠回来）。
//   5b. **蒙皮人物的速度靶本身**：世界钉住时整片为 0；世界照跑、相机不动时
//      没有 tile 顶到速度钳位。2026-09-08 的事故（上一帧骨矩阵喂了蒙皮完的顶点，
//      速度整条钳死 → 人身上恒定鬼影与糊边）就是从这两条底下漏过去的。
//   6. **运动模糊**：相机匀速转身，tile 邻域最大速度的像素长度与角速度成正比；
//      `motionBlur = 0` 时整个 pass 不跑（draw call 不涨）。
//   7. **景深**：CoC 图在焦平面为 0、天空饱和；`dofStrength = 0` 时零 draw call；
//      两条用法下第一人称手/枪的 CoC 恒 0（枪必须锐）。
//   8. **三个调试视图真的出画** —— GLSL ES 3.00 保留字编译失败是静默的。
//
// 用法：node Taierzhuang1938/Script_TaauTest.mjs
// 退出码即成败。

import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const server = await ServeRoot(rootDir, 0);
const port = server.address().port;
const browser = await LaunchBrowser();
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });

const problems = [];
page.on("pageerror", (error) => problems.push(`PAGEERROR ${String(error).slice(0, 240)}`));
page.on("console", (message) => {
  if (message.type() !== "error") return;
  const url = message.location()?.url || "";
  if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
  problems.push(`CONSOLE ${message.text().slice(0, 240)}`);
});

const checks = [];
function Check(name, ok, detail) {
  checks.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? `  ${detail}` : ""}`);
}

let R = null;
try {
  await page.goto(
    `http://127.0.0.1:${port}/Taierzhuang1938/?shot=1&manual=1&phase=1&quality=high&scale=small&gi=0`,
    { waitUntil: "load", timeout: 180000 },
  );
  await page.waitForFunction(() => window.Taierzhuang !== undefined, null, { timeout: 240000 });

  R = await page.evaluate(async () => {
    const THREE = await import("./vendor/three/build/three.module.js");
    const T = window.Taierzhuang;
    const P = T.post;
    const gl = T.renderer.getContext();
    const out = {};

    // 记录游戏本帧真正喂给合成链的参数：后面要用**同一份**参数渲一张无 TAA
    // 参考图，不然雾/曝光/调色的差别会把鬼影指标整个淹掉。
    let lastOptions = {};
    const baseRender = P.Render.bind(P);
    P.Render = function RecordingRender(scene, camera, options) {
      lastOptions = options || {};
      return baseRender(scene, camera, options);
    };

    // --- 公共工具 ---------------------------------------------------------
    const HalfToFloat = (h) => {
      const s = (h & 0x8000) ? -1 : 1;
      const e = (h & 0x7c00) >> 10;
      const f = h & 0x03ff;
      if (e === 0) return s * Math.pow(2, -14) * (f / 1024);
      if (e === 31) return f ? NaN : s * Infinity;
      return s * Math.pow(2, e - 15) * (1 + f / 1024);
    };
    const ReadLdr = () => {
      const rt = P.targets.ldr;
      const px = new Uint8Array(rt.width * rt.height * 4);
      T.renderer.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, px);
      return { px, w: rt.width, h: rt.height };
    };
    const MeanAbsDiff = (a, b) => {
      let sum = 0, n = 0;
      for (let i = 0; i < a.px.length; i += 4) {
        sum += Math.abs(a.px[i] - b.px[i]) + Math.abs(a.px[i + 1] - b.px[i + 1])
          + Math.abs(a.px[i + 2] - b.px[i + 2]);
        n += 3;
      }
      return sum / n;
    };
    const Psnr = (a, b) => {
      let mse = 0, n = 0;
      for (let i = 0; i < a.px.length; i += 4) {
        for (let c = 0; c < 3; c += 1) {
          const d = a.px[i + c] - b.px[i + c];
          mse += d * d;
          n += 1;
        }
      }
      mse /= n;
      return mse <= 1e-9 ? 99 : 10 * Math.log10(255 * 255 / mse);
    };
    /**
     * 斜边的亚像素边位残差（锯齿能量）。
     * 逐行找亮度穿过中位的位置并线性插值，再对整条边做最小二乘直线拟合，
     * 返回残差 RMS（像素）。锯齿把边位量化到整像素 → 残差大；抗锯齿 → 残差小。
     */
    const EdgeResidual = (img, x0, x1, y0, y1) => {
      const L = (x, y) => {
        const i = (y * img.w + x) * 4;
        return 0.2126 * img.px[i] + 0.7152 * img.px[i + 1] + 0.0722 * img.px[i + 2];
      };
      const rows = [];
      for (let y = y0; y < y1; y += 1) {
        let lo = 1e9, hi = -1e9;
        for (let x = x0; x < x1; x += 1) { const v = L(x, y); lo = Math.min(lo, v); hi = Math.max(hi, v); }
        if (hi - lo < 25) continue;
        const mid = 0.5 * (lo + hi);
        let found = -1;
        // **从右往左扫**：x1 一侧保证落在那块纯黑的斜边测试板里，
        // 从板子内部往外走碰到的第一次跨越就是板子自己的边。
        // 从左往右扫会先撞上场景里随便哪一条边，量到的就是噪声。
        for (let x = x1 - 1; x > x0; x -= 1) {
          const a = L(x, y), b = L(x - 1, y);
          if ((a - mid) * (b - mid) <= 0 && a !== b) { found = x - (mid - a) / (b - a); break; }
        }
        if (found >= 0) rows.push([y, found]);
      }
      if (rows.length < 12) return { residual: -1, rows: rows.length };
      let sx = 0, sy = 0, sxx = 0, sxy = 0;
      for (const [y, x] of rows) { sx += y; sy += x; sxx += y * y; sxy += y * x; }
      const n = rows.length;
      const slope = (n * sxy - sx * sy) / Math.max(n * sxx - sx * sx, 1e-6);
      const inter = (sy - slope * sx) / n;
      let sum = 0;
      for (const [y, x] of rows) { const d = x - (slope * y + inter); sum += d * d; }
      const xs = rows.map((r) => r[1]);
      return { residual: Math.sqrt(sum / n), rows: n, slope,
        minX: Math.min(...xs), maxX: Math.max(...xs) };
    };
    const Settle = (frames = 24) => {
      P.NotifyCameraCut();
      T.StepFrames(frames);
    };
    const SetScale = (scale) => {
      T.graphics.renderScale = scale;
      T.ApplyGraphics();
    };

    // --- 场景钉死：进关、摆机位、冻住 AI、关掉颗粒 --------------------------
    // **必须显式 Spawn**：`?shot=1` 只是跳过主菜单，玩家还停在开机展示位上，
    // 不摆机位的话下面每一项量的都是开机屏那把枪，不是关卡。
    T.player.Spawn(-405, 0, -Math.PI / 2);
    T.player.health = 100;
    T.player.bleeding = 0;
    T.player.pitch = 0.02;
    const FreezeAi = (frozen) => {
      if (!T.ai?.soldiers) return 0;
      for (const s of T.ai.soldiers) { s.coolUntil = frozen ? 1e9 : 0; s.fireTimer = 0; }
      return T.ai.soldiers.length;
    };
    out.soldiers = FreezeAi(true);
    out.state = { running: !!T.state.running, menu: !!T.state.menu,
      camera: T.camera.position.toArray().map((v) => +v.toFixed(1)) };
    T.graphics.grain = 0;         // 颗粒是逐帧噪声，会把所有像素指标淹掉
    T.ApplyGraphics();
    T.StepFrames(30);

    // =====================================================================
    // 1) 两组分辨率
    // =====================================================================
    SetScale(0.75);
    Settle(24);
    out.resolution = {
      internal: [P.width, P.height],
      output: [P.outputWidth, P.outputHeight],
      ldr: [P.targets.ldr.width, P.targets.ldr.height],
      history: P.targets.taaA ? [P.targets.taaA.width, P.targets.taaA.height] : null,
      canvas: [T.renderer.domElement.width, T.renderer.domElement.height],
      taau: P.taauActive,
    };

    // =====================================================================
    // 2) 静止收敛
    // =====================================================================
    T.StepFrames(16);
    const still0 = ReadLdr();
    T.StepFrames(1);
    out.stillDelta = MeanAbsDiff(still0, ReadLdr());

    // =====================================================================
    // 3) 斜边锯齿能量（TAA 关 / 开，都在 1.0 内部分辨率上比，尺寸才可比）
    // =====================================================================
    SetScale(1.0);
    // 一块 20×20 m 的纯黑板，正对相机、绕视轴转 20°，摆在 2 m 处：
    // 它的一条直边横贯画面中部偏左，右半屏整片是板子（扫描的落脚点）。
    // 中心偏移由「让那条边在画面竖直中线附近」反解：板半宽 10 m，
    // 转 20° 之后边上那一点相对中心是 (−10cos20, −10sin20)。
    const HALF = 10;
    const angle = 20 * Math.PI / 180;
    const edgeGeometry = new THREE.PlaneGeometry(HALF * 2, HALF * 2);
    const edgeMaterial = new THREE.MeshBasicMaterial({
      color: 0x000000, toneMapped: false, fog: false, side: THREE.DoubleSide,
    });
    const edge = new THREE.Mesh(edgeGeometry, edgeMaterial);
    const forward = new THREE.Vector3();
    T.camera.getWorldDirection(forward);
    const camRight = new THREE.Vector3().setFromMatrixColumn(T.camera.matrixWorld, 0).normalize();
    const camUp = new THREE.Vector3().setFromMatrixColumn(T.camera.matrixWorld, 1).normalize();
    edge.position.copy(T.camera.position)
      .addScaledVector(forward, 2.0)
      .addScaledVector(camRight, HALF * Math.cos(angle) - 0.15)
      .addScaledVector(camUp, HALF * Math.sin(angle));
    edge.quaternion.copy(T.camera.quaternion);
    edge.rotateZ(angle);
    edge.frustumCulled = false;
    T.scene.add(edge);
    T.scene.updateMatrixWorld(true);

    // 泛光必须关掉再量：纯黑板挨着亮天空，泛光会在边上铺出几十像素的软过渡，
    // 逐行的 mid 阈值随左侧亮度漂移，量到的散布是泛光的、不是锯齿的。
    // 暗角同理（它按半径压亮度，也会让阈值随行漂）。
    const savedBloom = T.graphics.bloom;
    const savedVignette = T.graphics.vignette;
    T.graphics.bloom = 0;
    T.graphics.vignette = 0;
    const EdgeShot = (taaOn) => {
      T.graphics.taa = taaOn;
      T.ApplyGraphics();
      Settle(28);
      const img = ReadLdr();
      // 行范围只取上半屏：下半屏有第一人称的手与枪压在板子前面。
      // **readRenderTargetPixels 是自下而上的**（WebGL 原点在左下），
      // 所以「上半屏」在缓冲里是靠后的那些行 —— 这一条踩过一次：
      // 按屏幕坐标取 0.10–0.55 量到的全是枪，残差是纯噪声。
      // x 也收进一条窄带：带内左边一定是场景、右边一定是板子，
      // 排除画面别处任何一条边混进来的可能。
      // 行只取屏幕上三分之一（缓冲里靠后那些行）：再往下枪管与手就伸进来了，
      // 它们比板子亮，从右往左扫会先撞上枪。
      return EdgeResidual(img, Math.round(img.w * 0.33), Math.round(img.w * 0.60),
        Math.round(img.h * 0.62), Math.round(img.h * 0.92));
    };
    out.edgeTaaOff = EdgeShot(false);
    out.edgeTaaOn = EdgeShot(true);
    T.graphics.bloom = savedBloom;
    T.graphics.vignette = savedVignette;
    T.ApplyGraphics();

    // =====================================================================
    // 4) TAAU 画质
    // =====================================================================
    const ScaleShot = (scale) => { SetScale(scale); Settle(28); return ReadLdr(); };
    const ref = ScaleShot(1.0);
    out.taauPsnr = {};
    for (const scale of [0.85, 0.8, 0.75, 0.67]) out.taauPsnr[scale] = Psnr(ref, ScaleShot(scale));
    T.scene.remove(edge);
    edgeGeometry.dispose();
    edgeMaterial.dispose();

    // =====================================================================
    // 5) 速度靶对鬼影（走动的兵）。内部 = 输出，参考图与解算图同一网格。
    // =====================================================================
    SetScale(1.0);
    FreezeAi(false);
    // 指标只在**真的在动的像素**上算：全屏均值（甚至「最大的 1%」）会被
    // 「TAA 本来就比无 TAA 平滑」这条弥散差、以及电线/垛口这类高对比静态边
    // 整个淹掉 —— 那些边在两版里差得一样多，与鬼影无关。
    // 动没动由**运动模糊的 tile 邻域最大速度**说了算（相机不动，所以非零 tile
    // 就是运动物体）。那张靶是 RGBA16F，读得回来。
    const MovingTiles = () => {
      const rt = P.motionBlurPass.neighbor;
      const raw = new Uint16Array(rt.width * rt.height * 4);
      T.renderer.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, raw);
      return { raw, w: rt.width, h: rt.height };
    };
    const MaskedDiff = (a, b, mask, minPx) => {
      let sum = 0, n = 0;
      for (let y = 0; y < a.h; y += 1) {
        const ty = Math.min(mask.h - 1, Math.floor((y + 0.5) / a.h * mask.h));
        for (let x = 0; x < a.w; x += 1) {
          const tx = Math.min(mask.w - 1, Math.floor((x + 0.5) / a.w * mask.w));
          const k = (ty * mask.w + tx) * 4;
          const vx = HalfToFloat(mask.raw[k]) * P.width;
          const vy = HalfToFloat(mask.raw[k + 1]) * P.height;
          if (Math.hypot(vx, vy) < minPx) continue;
          const i = (y * a.w + x) * 4;
          sum += Math.abs(a.px[i] - b.px[i]) + Math.abs(a.px[i + 1] - b.px[i + 1])
            + Math.abs(a.px[i + 2] - b.px[i + 2]);
          n += 3;
        }
      }
      return { diff: n ? sum / n : 0, pixels: n / 3 };
    };
    // 指标：**换速度来源只该改动在动的像素**。
    //
    // 这里没有拿「同一帧的无 TAA 版」当鬼影参考 —— 试过，符号是反的：重投影失效时
    // 邻域裁剪会把历史整个拉回当前帧，结果反而更接近无 TAA 版。做 4×SSAA 真值也不行：
    // `P.Render` 绕开了 `RenderScene`，SSAO 的 `uSsaoResolution` 还停在 1× 上，
    // 超采样那一趟整幅间接光都是错位的（实测把差值顶到 37/255）。
    //
    // 所以改成量**这条接线到底通不通、通在哪**：把速度来源在两条路之间切，
    // 读两张 TAA 输出，比较「在动的 tile」与「静止的 tile」上各自差了多少。
    // 接线正确时前者远大于后者；接线断了（两条路等价）两者都趋近 0。
    // 速度靶内容本身的正确性由 `Script_PostFrameGraphTest` 把关（相机右移 → 速度 x 为负），
    // 鬼影的观感证据走截图（_shots/Ghost_Velocity*.png）。
    const savedMotionBlur = T.graphics.motionBlur;
    const GhostShot = (useVelocity) => {
      P.taaPass.forceDepthReprojection = !useVelocity;
      Settle(4);
      T.StepFrames(26);
      return ReadLdr();
    };
    const withVelocity = GhostShot(true);
    const withoutVelocity = GhostShot(false);
    // tile 掩码取自最后一帧（相机不动，非零 tile 就是运动物体）
    const mask = MovingTiles();
    const moving = MaskedDiff(withVelocity, withoutVelocity, mask, 1.0);
    const stillMask = { ...mask, invert: true };
    let stillSum = 0, stillCount = 0;
    for (let y = 0; y < withVelocity.h; y += 1) {
      const ty = Math.min(mask.h - 1, Math.floor((y + 0.5) / withVelocity.h * mask.h));
      for (let x = 0; x < withVelocity.w; x += 1) {
        const tx = Math.min(mask.w - 1, Math.floor((x + 0.5) / withVelocity.w * mask.w));
        const k = (ty * mask.w + tx) * 4;
        const vx = HalfToFloat(mask.raw[k]) * P.width;
        const vy = HalfToFloat(mask.raw[k + 1]) * P.height;
        if (Math.hypot(vx, vy) >= 1.0) continue;
        const i = (y * withVelocity.w + x) * 4;
        stillSum += Math.abs(withVelocity.px[i] - withoutVelocity.px[i])
          + Math.abs(withVelocity.px[i + 1] - withoutVelocity.px[i + 1])
          + Math.abs(withVelocity.px[i + 2] - withoutVelocity.px[i + 2]);
        stillCount += 3;
      }
    }
    void stillMask;
    out.ghost = {
      movingDiff: +moving.diff.toFixed(3), movingPixels: moving.pixels,
      stillDiff: +(stillCount ? stillSum / stillCount : 0).toFixed(3),
      stillPixels: stillCount / 3,
    };
    void savedMotionBlur;
    P.taaPass.forceDepthReprojection = false;
    T.StepFrames(1);   // 先跑一帧再读：上一趟是强制走深度反投影的那一版
    out.ghost.usesVelocityBuffer = P.taaPass.uniforms.uUseVelocityBuffer.value;
    FreezeAi(true);

    // =====================================================================
    // 5b) 蒙皮人物的速度靶本身对不对
    //
    // 事故（2026-09-08）：覆盖材质拿**蒙皮完**的 `transformed` 去喂上一帧骨矩阵，
    // 等于把骨骼的世界变换叠了两遍，「上一帧位置」落到几百米外，速度整条钳到
    // `uVelocityClamp`。画面上是「站着不动的人也一身鬼影 + 周身一圈恒定糊边」，
    // 而当时的两条速度断言都只覆盖静态几何，一条都没红。
    //
    // 这里断两件事（都在**有兵**的画面上）：
    //   a) 世界钉住（dt = 0）+ 相机不动 → 速度靶必须**整片精确为 0**；
    //   b) 世界照跑 + 相机不动 → 没有任何 tile 顶到速度钳位（顶到就是算错了，
    //      不是「兵跑得快」—— 钳位是四分之一屏，一帧谁也走不了那么远）。
    // =====================================================================
    const clampUv = P.prepassPass.material.uniforms.uVelocityClamp?.value ?? 0.25;
    const ReadTileMaxUv = () => {
      const rt = P.motionBlurPass.neighbor;
      const raw = new Uint16Array(rt.width * rt.height * 4);
      T.renderer.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, raw);
      let max = 0, clamped = 0, nonzero = 0;
      for (let i = 0; i < raw.length; i += 4) {
        const len = Math.hypot(HalfToFloat(raw[i]), HalfToFloat(raw[i + 1]));
        if (len > max) max = len;
        if (len > 1e-6) nonzero += 1;
        if (len >= clampUv * 0.8) clamped += 1;
      }
      return { max: +max.toFixed(5), clamped, nonzero, tiles: raw.length / 4 };
    };
    // 屏幕上真的有蒙皮人物才谈得上「蒙皮速度对不对」
    let skinnedOnScreen = 0;
    T.scene.traverse((object) => { if (object.isSkinnedMesh && object.visible) skinnedOnScreen += 1; });
    T.StepFrames(6, 0);                 // 世界钉住：骨矩阵不再变
    out.skinnedVelocity = { skinnedOnScreen, clampUv, frozen: ReadTileMaxUv() };
    FreezeAi(false);
    T.StepFrames(24, 1 / 60);           // 世界照跑、相机不动
    out.skinnedVelocity.live = ReadTileMaxUv();
    FreezeAi(true);
    T.StepFrames(2);

    // =====================================================================
    // 6) 运动模糊
    // =====================================================================
    SetScale(0.8);
    // tile 网格的**中位数**而不是最大值：最大值会被偶尔走过的兵抢走，
    // 相机匀速转身时几乎每一块都是同一个速度，中位数才是相机速度。
    const ReadTileMedianPx = () => {
      const rt = P.motionBlurPass.neighbor;
      const raw = new Uint16Array(rt.width * rt.height * 4);
      T.renderer.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, raw);
      const list = [];
      for (let i = 0; i < raw.length; i += 4) {
        const x = HalfToFloat(raw[i]) * P.width;
        const y = HalfToFloat(raw[i + 1]) * P.height;
        const len = Math.hypot(x, y);
        if (len > 0.01) list.push(len);
      }
      if (!list.length) return 0;
      list.sort((a, b) => a - b);
      return list[Math.floor(list.length / 2)];
    };
    const SpinRun = (yawStep, frames = 12) => {
      P.NotifyCameraCut();
      for (let i = 0; i < frames; i += 1) { T.player.yaw += yawStep; T.StepFrames(1); }
      return ReadTileMedianPx();
    };
    const slow = SpinRun(0.010);
    const fast = SpinRun(0.020);
    out.motionTilePx = { slow, fast, ratio: fast / Math.max(slow, 1e-6) };

    // 前景标签是否真的存在（视模在画面里）
    const nd = P.targets.normalDepth;
    const rawNd = new Uint16Array(nd.width * nd.height * 4);
    T.renderer.readRenderTargetPixels(nd, 0, 0, nd.width, nd.height, rawNd);
    const NdDepth = (x, y) => HalfToFloat(rawNd[(y * nd.width + x) * 4 + 3]);
    let foregroundPixels = 0;
    const depths = [];
    for (let y = 0; y < nd.height; y += 1) {
      for (let x = 0; x < nd.width; x += 1) {
        const d = NdDepth(x, y);
        if (Math.abs(d - 1.0) < 0.002) foregroundPixels += 1;
        else if (d > 0.0001) depths.push(d);
      }
    }
    depths.sort((a, b) => a - b);
    const medianDepth = depths.length ? depths[Math.floor(depths.length / 2)] : 6;
    out.foregroundPixels = foregroundPixels;
    out.foregroundRatio = foregroundPixels / (nd.width * nd.height);
    out.medianDepth = medianDepth;

    // 比较运动模糊前后的同帧 HDR 前景，覆盖中档的半分辨率 resolve。
    const mb = P.motionBlurPass;
    const savedMbScale = mb.scale;
    out.weaponBlur = [];
    for (const scale of [0.5, 1]) {
      mb.scale = scale;
      mb.Resize(P.targets.ldr.width, P.targets.ldr.height);
      SpinRun(0.035, 3);
      const sharp = mb.uniforms.uColor.value;
      const source = Object.values(P.targets).find(rt => rt?.texture === sharp);
      if (!source) throw new Error("Motion blur source target missing");
      const before = new Uint16Array(source.width * source.height * 4);
      const after = new Uint16Array(mb.target.width * mb.target.height * 4);
      T.renderer.readRenderTargetPixels(source, 0, 0, source.width, source.height, before);
      T.renderer.readRenderTargetPixels(mb.target, 0, 0, mb.target.width, mb.target.height, after);
      T.renderer.readRenderTargetPixels(nd, 0, 0, nd.width, nd.height, rawNd);
      let samples = 0, maxError = 0, worldChanged = 0, changed = 0, maxAt = null;
      for (let y = 0; y < mb.target.height; y += 1) {
        for (let x = 0; x < mb.target.width; x += 1) {
          const depth = NdDepth(Math.floor((x + 0.5) * nd.width / mb.target.width),
            Math.floor((y + 0.5) * nd.height / mb.target.height));
          const i = (y * mb.target.width + x) * 4;
          const delta = Math.max(...[0, 1, 2].map(c =>
            Math.abs(HalfToFloat(before[i + c]) - HalfToFloat(after[i + c]))));
          if (Math.abs(depth - P.foregroundViewDepth) < 0.002) {
            samples += 1;
            if (delta > 0.002) changed += 1;
            if (delta > maxError) maxAt = { x, y, before: Array.from(before.slice(i, i + 3)).map(HalfToFloat), after: Array.from(after.slice(i, i + 3)).map(HalfToFloat) };
            maxError = Math.max(maxError, delta);
          } else if (delta > 0.001) worldChanged += 1;
        }
      }
      out.weaponBlur.push({ scale, samples, maxError, worldChanged, active: mb.active, changed, maxAt,
        source: [source.width, source.height], target: [mb.target.width, mb.target.height], normalDepth: [nd.width, nd.height] });
    }
    mb.scale = savedMbScale;
    mb.Resize(P.targets.ldr.width, P.targets.ldr.height);

    // draw call 计数：三方在 render() 里会自动 reset，先关掉它
    T.renderer.info.autoReset = false;
    const CountCalls = (options) => {
      T.renderer.info.reset();
      P.Render(T.scene, T.camera, { ...lastOptions, ...options });
      return T.renderer.info.render.calls;
    };
    const callsMb = CountCalls({ motionBlur: 1, dofStrength: 0, nearDofStrength: 0 });
    const callsNoMb = CountCalls({ motionBlur: 0, dofStrength: 0, nearDofStrength: 0 });
    out.motionBlurCalls = { on: callsMb, off: callsNoMb, saved: callsMb - callsNoMb };
    out.motionBlurActiveOff = P.motionBlurPass.active;

    // =====================================================================
    // 7) 景深
    // =====================================================================
    const callsNoDof = CountCalls({ motionBlur: 0, dofStrength: 0, nearDofStrength: 0 });
    const callsDof = CountCalls({
      motionBlur: 0, nearDofStrength: 0,
      dofStrength: 1, dofFocus: medianDepth, dofRange: 2.8, dofMaxPx: 11,
    });
    out.dofCalls = { on: callsDof, off: callsNoDof, saved: callsDof - callsNoDof };
    P.Render(T.scene, T.camera, { ...lastOptions, dofStrength: 0, nearDofStrength: 0 });
    out.dofActiveOff = P.dofPass.active;
    T.renderer.info.autoReset = true;

    // CoC 图：焦平面 0、天空饱和、视模恒 0
    const ReadCoc = (options) => {
      P.Render(T.scene, T.camera, { ...lastOptions, motionBlur: 0, ...options });
      const rt = P.dofPass.half;
      const raw = new Uint16Array(rt.width * rt.height * 4);
      T.renderer.readRenderTargetPixels(rt, 0, 0, rt.width, rt.height, raw);
      return { raw, w: rt.width, h: rt.height };
    };
    /** 半分辨率靶 → 预通道网格。视模判据要**腐蚀一圈**：降采样取的是 2×2 里
     *  绝对值最大的 CoC，轮廓上的半分辨率纹素会吃到背景的值，不腐蚀会误判。 */
    const ScanCoc = (map) => {
      let focusMin = 1e9, skyMax = -1e9, foregroundMaxAbs = 0, nearMin = 0;
      let focusSamples = 0, skySamples = 0, foregroundSamples = 0;
      const lo = medianDepth * 0.94, hi = medianDepth * 1.06;
      for (let y = 1; y < map.h - 1; y += 1) {
        for (let x = 1; x < map.w - 1; x += 1) {
          const u = (x + 0.5) / map.w, v = (y + 0.5) / map.h;
          const nx = Math.min(nd.width - 2, Math.max(1, Math.floor(u * nd.width)));
          const ny = Math.min(nd.height - 2, Math.max(1, Math.floor(v * nd.height)));
          const coc = HalfToFloat(map.raw[(y * map.w + x) * 4 + 3]);
          nearMin = Math.min(nearMin, coc);
          const depth = NdDepth(nx, ny);
          if (depth <= 0.0001) { skyMax = Math.max(skyMax, coc); skySamples += 1; continue; }
          if (depth > lo && depth < hi) { focusMin = Math.min(focusMin, Math.abs(coc)); focusSamples += 1; }
          let allForeground = true;
          for (let dy = -2; dy <= 2 && allForeground; dy += 1) {
            for (let dx = -2; dx <= 2; dx += 1) {
              const sx = Math.min(nd.width - 1, Math.max(0, nx + dx));
              const sy = Math.min(nd.height - 1, Math.max(0, ny + dy));
              if (Math.abs(NdDepth(sx, sy) - 1.0) >= 0.002) { allForeground = false; break; }
            }
          }
          if (allForeground) { foregroundMaxAbs = Math.max(foregroundMaxAbs, Math.abs(coc)); foregroundSamples += 1; }
        }
      }
      return { focusMin: focusSamples ? focusMin : null, focusSamples,
        skyMax: skySamples ? skyMax : null, skySamples, foregroundMaxAbs, foregroundSamples, nearMin };
    };
    const farMap = ScanCoc(ReadCoc({
      dofStrength: 1, dofFocus: medianDepth, dofRange: 2.8, dofMaxPx: 11, nearDofStrength: 0,
    }));
    out.coc = { ...farMap, farMaxPx: P.dofPass.coc.farMaxPx, focus: P.dofPass.coc.focus };
    // 开镜档要在 1.6 m 以内真有东西才谈得上近场散焦：正片里那是贴脸的掩体，
    // 测试里补一块 0.9 m 的小板，免得指标随 AI 站位飘。
    const nearGeometry = new THREE.PlaneGeometry(0.6, 0.6);
    const nearMaterial = new THREE.MeshBasicMaterial({
      color: 0x202020, toneMapped: false, fog: false, side: THREE.DoubleSide,
    });
    const nearBoard = new THREE.Mesh(nearGeometry, nearMaterial);
    const nearForward = new THREE.Vector3();
    T.camera.getWorldDirection(nearForward);
    const nearRight = new THREE.Vector3().setFromMatrixColumn(T.camera.matrixWorld, 0).normalize();
    nearBoard.position.copy(T.camera.position)
      .addScaledVector(nearForward, 0.9).addScaledVector(nearRight, -0.35);
    nearBoard.quaternion.copy(T.camera.quaternion);
    nearBoard.frustumCulled = false;
    T.scene.add(nearBoard);
    T.scene.updateMatrixWorld(true);
    T.StepFrames(2);
    T.renderer.readRenderTargetPixels(nd, 0, 0, nd.width, nd.height, rawNd);
    const adsMap = ScanCoc(ReadCoc({ dofStrength: 0,
      nearDofStrength: 0.72, nearDofFocus: 1.6, nearDofRange: 0.85, nearDofMaxPx: 4.5 }));
    out.ads = { ...adsMap, nearMaxPx: P.dofPass.coc.nearMaxPx };
    T.scene.remove(nearBoard);
    nearGeometry.dispose();
    nearMaterial.dispose();
    T.scene.updateMatrixWorld(true);
    T.StepFrames(2);

    // 7b) **近场里什么都没有时，景深必须是恒等式。**
    // 上面那两条都是「近场里真有东西」的档：阵亡档铺远景、开镜档补了一块 0.9 m
    // 的板。正片开镜的常态恰恰是**近场空的**（焦平面 1.6 m，枪自己带前景标签、
    // CoC 恒 0，场景里最近的墙在三十多米外）—— CoC 靶全是 0，可这一趟照样跑。
    // 2026-09-08 集成期抓到的 bug 正在这条缝里：近场 gather 的半径是常数
    // uNearRadius，羽化项 `+1.0` 让 cocS = 0 的样本在 1 像素以内仍拿到权重，
    // 覆盖度 0.31 × nearCoverageGain 1.35 = 0.41，四成画面被半分辨率的近场层
    // 盖掉 —— 一开镜整幅画发糊，连枪都糊。所以这一条比的是**像素**不是 CoC。
    {
      // **TAA 保持开着**（正片就是这么跑的）。用 `taa: false` 那个 escape hatch
      // 反而更糟：TAA 一停 sceneColor 就退回内部分辨率的 hdr，景深那条路比
      // 直通那条路多一次重采样，两边的差全落在这个上面（实测均差反而从 0.22
      // 涨到 1.04）。TAA 开着时两帧的抖动相位不同，高对比边缘会有几十级的差 ——
      // 所以下面**先量一次「同样两帧、景深都开」的噪声底**，再要求
      // 「开/关的差不明显高于这个底」。绝对阈值只当兜底，主判据是相对的。
      const adsOptions = { motionBlur: 0, dofStrength: 0, grain: 0,
        nearDofStrength: 0.72, nearDofFocus: 1.6, nearDofRange: 0.85, nearDofMaxPx: 4.5 };
      const ldr = P.targets.ldr;
      const ReadLdr = () => {
        const px = new Uint8Array(ldr.width * ldr.height * 4);
        T.renderer.readRenderTargetPixels(ldr, 0, 0, ldr.width, ldr.height, px);
        return px;
      };
      const Diff = (a, b) => {
        let max = 0; let sum = 0; let count = 0; let over8 = 0;
        for (let i = 0; i < a.length; i += 4) {
          for (let c = 0; c < 3; c += 1) {
            const d = Math.abs(a[i + c] - b[i + c]);
            if (d > max) max = d;
            if (d > 8) over8 += 1;
            sum += d; count += 1;
          }
        }
        return { max, mean: sum / count, over8Pct: over8 / count * 100 };
      };
      const presetWas = P.preset.dof;
      const Shot = (dofOn) => {
        P.preset.dof = dofOn;
        P.Render(T.scene, T.camera, { ...lastOptions, ...adsOptions });
        return ReadLdr();
      };
      const on1 = Shot(true);
      const off1 = Shot(false);
      const on2 = Shot(true);
      P.preset.dof = presetWas;
      out.emptyNearDof = {
        // 噪声底：两帧都开着景深，差别只来自 TAA 抖动相位与场景自身
        floor: Diff(on1, on2),
        // 真判据：开 vs 关
        onOff: Diff(on1, off1),
        cocActive: P.dofPass.coc.active,
        nearMaxPx: P.dofPass.coc.nearMaxPx, ran: P.dofPass.active,
      };
    }

    // =====================================================================
    // 8) 调试视图
    // =====================================================================
    out.debugViews = {};
    for (const view of ["velocityTile", "dofCoc", "taaWeight"]) {
      P.SetDebugView(view);
      T.StepFrames(2);
      const px = new Uint8Array(4);
      gl.readPixels(Math.floor(P.outputWidth / 2), Math.floor(P.outputHeight / 2), 1, 1,
        gl.RGBA, gl.UNSIGNED_BYTE, px);
      out.debugViews[view] = Array.from(px);
    }
    P.SetDebugView("final");
    P.Render = baseRender;
    T.StepFrames(2);

    out.glError = gl.getError();
    out.programs = T.renderer.info.programs.length;
    return out;
  });
  if (process.env.TAAU_SHOTS === "1") {
    await page.evaluate(() => {
      const T = window.Taierzhuang;
      T.post.SetDebugView("final");
      T.player.Spawn(-405, 0, -Math.PI / 2);
      T.player.health = 100;
      T.player.pitch = 0.02;
      T.graphics.renderScale = 1;
      T.graphics.motionBlur = 1;
      T.ApplyGraphics();
      T.post.motionBlurPass.scale = 0.5;
      T.post.motionBlurPass.Resize(T.post.targets.ldr.width, T.post.targets.ldr.height);
      Object.assign(T.input, { forward: 1, sprint: true });
      T.StepFrames(20);
    });
    const shotDir = path.join(projectDir, "_shots", "SprintWeaponBlur");
    await fs.mkdir(shotDir, { recursive: true });
    await page.screenshot({ path: path.join(shotDir, "Scene_Sprinting.png") });
  }
} catch (error) {
  problems.push(`THROW ${String(error).slice(0, 400)}`);
}

await browser.close();
server.close();

if (!R) {
  for (const problem of problems) console.log(`FAIL ${problem}`);
  console.log("FAIL 页面没有返回结果");
  process.exit(1);
}

const res = R.resolution;
Check("TAAU：内部靶 0.75×、输出靶满分辨率",
  res.taau === true
  && Math.abs(res.internal[0] - res.output[0] * 0.75) <= 2
  && res.ldr[0] === res.output[0] && res.ldr[1] === res.output[1]
  && res.history[0] === res.output[0],
  `内部 ${res.internal.join("×")} · 输出 ${res.output.join("×")} · ldr ${res.ldr.join("×")} · 历史 ${res.history?.join("×")}`);

Check("静止 16 帧后逐帧差近零（边缘不爬）",
  R.stillDelta >= 0 && R.stillDelta < 0.6, `逐帧平均通道差 ${R.stillDelta.toFixed(4)}`);

const eOn = R.edgeTaaOn, eOff = R.edgeTaaOff;
Check("斜边锯齿能量：TAA 开低于 TAA 关",
  eOn.residual > 0 && eOff.residual > 0 && eOn.residual < 1.0
  && eOn.residual < eOff.residual * 0.9,
  `TAA 关 ${eOff.residual?.toFixed(3)} px（${eOff.rows} 行, x ${eOff.minX?.toFixed(0)}–${eOff.maxX?.toFixed(0)}, 斜率 ${eOff.slope?.toFixed(3)}）`
  + ` → 开 ${eOn.residual?.toFixed(3)} px（${eOn.rows} 行, x ${eOn.minX?.toFixed(0)}–${eOn.maxX?.toFixed(0)}, 斜率 ${eOn.slope?.toFixed(3)}）`);

const psnr = R.taauPsnr;
Check("TAAU 画质：0.75 档对 1.0 的 PSNR ≥ 26 dB", psnr["0.75"] >= 26,
  Object.entries(psnr).map(([k, v]) => `${k}→${v.toFixed(2)}dB`).join(" · "));
Check("TAAU 画质：分辨率越高 PSNR 越高（单调）",
  psnr["0.85"] > psnr["0.75"] && psnr["0.75"] > psnr["0.67"],
  `0.85 ${psnr["0.85"].toFixed(2)} > 0.75 ${psnr["0.75"].toFixed(2)} > 0.67 ${psnr["0.67"].toFixed(2)}`);

Check("TAA 真的在读速度靶，而且换掉它只动在动的像素",
  R.ghost.usesVelocityBuffer === 1
  && R.ghost.movingPixels > 5000
  && R.ghost.movingDiff > R.ghost.stillDiff * 3,
  `uUseVelocityBuffer=${R.ghost.usesVelocityBuffer}`
  + ` ｜ 在动像素差 ${R.ghost.movingDiff}（${R.ghost.movingPixels} px）`
  + ` vs 静止像素差 ${R.ghost.stillDiff}（${R.ghost.stillPixels} px，兵 ${R.soldiers} 名）`);

Check("蒙皮人物：世界钉住时速度靶整片为 0（上一帧骨矩阵没喂错顶点）",
  R.skinnedVelocity.skinnedOnScreen > 0 && R.skinnedVelocity.frozen.nonzero === 0,
  `蒙皮网格 ${R.skinnedVelocity.skinnedOnScreen} 只 ｜ 非零 tile ${R.skinnedVelocity.frozen.nonzero}`
  + ` / ${R.skinnedVelocity.frozen.tiles} ｜ 最大 ${R.skinnedVelocity.frozen.max} uv`);
Check("蒙皮人物：世界照跑、相机不动时没有 tile 顶到速度钳位",
  R.skinnedVelocity.live.clamped === 0 && R.skinnedVelocity.live.max < R.skinnedVelocity.clampUv * 0.8,
  `顶到钳位的 tile ${R.skinnedVelocity.live.clamped} / ${R.skinnedVelocity.live.tiles}`
  + ` ｜ 最大 ${R.skinnedVelocity.live.max} uv（钳位 ${R.skinnedVelocity.clampUv}）`);

const mt = R.motionTilePx;
for (const result of R.weaponBlur) {
  Check(`运动模糊 ${result.scale} 分辨率保留枪械原色且背景仍模糊`,
    result.active && result.samples > 100 && result.maxError < 0.002 && result.worldChanged > 100,
    JSON.stringify(result));
}
Check("运动模糊：tile 最大速度与角速度成正比（两档 2×）",
  mt.ratio > 1.7 && mt.ratio < 2.35,
  `慢 ${mt.slow.toFixed(2)} px · 快 ${mt.fast.toFixed(2)} px · 比 ${mt.ratio.toFixed(3)}`);
Check("前景标签（第一人称手/枪）在预通道里确实存在",
  R.foregroundRatio > 0.01, `占屏 ${(R.foregroundRatio * 100).toFixed(1)}%`);
Check("motionBlur = 0 时整个 pass 不跑（draw call 省掉）",
  R.motionBlurActiveOff === false && R.motionBlurCalls.saved >= 3,
  `开 ${R.motionBlurCalls.on} → 关 ${R.motionBlurCalls.off}（省 ${R.motionBlurCalls.saved}）`);

Check("dofStrength = 0 时景深零成本（draw call 省掉）",
  R.dofActiveOff === false && R.dofCalls.saved >= 4,
  `开 ${R.dofCalls.on} → 关 ${R.dofCalls.off}（省 ${R.dofCalls.saved}）`);
Check("CoC：焦平面为 0、天空饱和到上限",
  R.coc.focusSamples > 0 && R.coc.focusMin < 1.2
  && R.coc.skySamples > 0 && R.coc.skyMax > R.coc.farMaxPx * 0.9,
  `焦平面（${R.medianDepth?.toFixed(2)} m）最小 |CoC| ${R.coc.focusMin?.toFixed(3)} px`
  + ` · 天空 ${R.coc.skyMax?.toFixed(2)} / 上限 ${R.coc.farMaxPx}`);
Check("景深：第一人称手/枪的 CoC 恒 0（枪不糊）",
  R.coc.foregroundSamples > 0 && R.coc.foregroundMaxAbs === 0
  && R.ads.foregroundSamples > 0 && R.ads.foregroundMaxAbs === 0,
  `阵亡档 ${R.coc.foregroundMaxAbs}（${R.coc.foregroundSamples} 样本） · 开镜档 ${R.ads.foregroundMaxAbs}（${R.ads.foregroundSamples} 样本）`);
Check("开镜近景档：近处真的产生负 CoC",
  R.ads.nearMin < -0.5, `最小 CoC ${R.ads.nearMin.toFixed(2)} px（上限 −${R.ads.nearMaxPx}）`);
// 三条一起看：均差 ≤ 0.5/255、超 8/255 的通道占比 ≤ 0.2%、峰值 ≤ 24/255。
// 不写「逐比特相等」是因为这一趟仍然真的跑了（降采样 → gather → 填洞 → 合成），
// 合成那一步的 mix 在 blend = 0 时是恰当的恒等式，但中间靠半浮点存过一道。
// 修好之前这三个数是均差 20+、占比五成以上（四成画面被半分辨率层盖掉），
// 差两个数量级，不会抱阀值。
Check("近场里什么都没有时，景深是恒等式（开镜不允许整幅画发糊）",
  R.emptyNearDof.ran === true
  && R.emptyNearDof.onOff.mean <= Math.max(0.5, R.emptyNearDof.floor.mean * 2)
  && R.emptyNearDof.onOff.over8Pct <= Math.max(0.5, R.emptyNearDof.floor.over8Pct * 2),
  `开/关 均差 ${R.emptyNearDof.onOff.mean.toFixed(3)} 超 8 ${R.emptyNearDof.onOff.over8Pct.toFixed(3)}%`
  + ` 峰值 ${R.emptyNearDof.onOff.max}`
  + ` ｜ 噪声底（两帧都开）均差 ${R.emptyNearDof.floor.mean.toFixed(3)}`
  + ` 超 8 ${R.emptyNearDof.floor.over8Pct.toFixed(3)}% 峰值 ${R.emptyNearDof.floor.max}`
  + ` （pass 真的跑了=${R.emptyNearDof.ran}，nearMaxPx=${R.emptyNearDof.nearMaxPx?.toFixed(2)}）`);

for (const [view, px] of Object.entries(R.debugViews)) {
  Check(`调试视图 ${view} 出画（非全黑）`, Math.max(px[0], px[1], px[2]) > 4, `RGBA ${px.join(",")}`);
}
Check("整趟无 GL 错误", R.glError === 0, `getError=${R.glError}`);
for (const problem of problems) Check(problem, false);

const failed = checks.filter((c) => !c.ok);
console.log(`\n${failed.length ? "FAIL" : "ok  "} TaauTest ${checks.length - failed.length}/${checks.length}`);
if (failed.length) process.exit(1);
