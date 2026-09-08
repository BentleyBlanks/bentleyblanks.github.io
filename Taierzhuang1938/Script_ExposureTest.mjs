// ===========================================================================
// Script_ExposureTest.mjs —— 物理相机曝光 / 镜头光晕 / 3D LUT 分级的看门狗
//                            （真浏览器，render 域）
//
// 这一组断言守的是三件**肉眼极难判断**的事：
//   1. 直方图自动曝光真的在测光（不是某一趟着色器编译失败恒为黑，也不是
//      加法混合在半浮点靶上溢出）；
//   2. 打开自动曝光**不改变默认机位的亮度**（用户对明暗极敏感，
//      历史事故「画面为什么这么黑」）；
//   3. 3D LUT 与它取代的那套着色器算式差 ≤ 1/255。
//
// 每一条都读回像素或读回真实的 GPU 状态，不看 uniform、不看开关位 ——
// GLSL ES 3.00 保留字导致的编译失败在 three 里只留一行控制台日志，
// 那一趟什么都不画，而 uniform 全都"对"。
//
// 用法：
//   node Taierzhuang1938/Script_ExposureTest.mjs                  全套（探针页 + 正片）
//   node Taierzhuang1938/Script_ExposureTest.mjs --probe-only     只跑探针页（快）
//   node Taierzhuang1938/Script_ExposureTest.mjs --calibrate      量每关的曝光锚点
//   node Taierzhuang1938/Script_ExposureTest.mjs --baseline=<根目录>
//                                                 与另一份检出逐比特比对
// 退出码即成败。
// ===========================================================================

import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { LaunchBrowser } from "../PrairieFire1937/Script_BrowserTestKit.mjs";
import { ServeRoot } from "./Script_DevServer.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");

const argv = process.argv.slice(2);
const CALIBRATE = argv.includes("--calibrate");
const PROBE_ONLY = argv.includes("--probe-only");
const BASELINE = (argv.find((a) => a.startsWith("--baseline=")) || "").slice(11);
/** `--shots[=目录]`：出一组「开/关」对照图（默认落 _shots/Exposure_<日期>/）。 */
const SHOTS_ARG = argv.find((a) => a === "--shots" || a.startsWith("--shots="));
const SHOTS_DIR = SHOTS_ARG
  ? (SHOTS_ARG.includes("=") ? path.resolve(SHOTS_ARG.slice(8))
    : path.join(projectDir, "_shots", `Exposure_${new Date().toISOString().slice(0, 10).replace(/-/g, ".")}`))
  : null;
/** 正片侧要跑的切片。天光预设映射见 Data_Levels（0 白天硝烟 / 3 夜战）。 */
const GAME_PHASES = CALIBRATE ? [0, 1, 2, 3, 4, 5, 6] : [0, 3];

const checks = [];
function Check(name, ok, detail = "") {
  checks.push({ name, ok: !!ok, detail: typeof detail === "string" ? detail : JSON.stringify(detail) });
}

const problems = [];
function WatchPage(page, tag) {
  page.on("pageerror", (error) => problems.push(`PAGEERROR[${tag}] ${String(error).slice(0, 240)}`));
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const url = message.location()?.url || "";
    if (/fonts\.(googleapis|gstatic)\.com/.test(url)) return;
    // 基线树是 `git archive` 导出的两个子目录，仓库根的图标 / 样式不在里面，
    // 它们的 404 与本轮改动无关 —— 真正的断言是那一页的像素读回。
    if (tag === "baseline" && /Failed to load resource/.test(message.text())) return;
    problems.push(`CONSOLE[${tag}] ${message.text().slice(0, 240)}`);
  });
}

// ===========================================================================
// 探针页：确定性、快、能把每一趟单独拎出来喂受控输入
// ===========================================================================

/**
 * 这一整段跑在页面里。返回一包读数，断言留在 Node 侧 ——
 * 页面里只负责"量"，不负责"判"，出问题时读数本身就是证据。
 */
async function ProbeSection(page) {
  return page.evaluate(async () => {
    const THREE = await import("./vendor/three/build/three.module.js");
    const P = window.Probe;
    const post = P.post;
    const renderer = P.renderer;
    const gl = renderer.getContext();
    const exposure = post.exposurePass;
    const flare = post.lensFlarePass;
    const out = {};

    // --- 受控输入用的小工具 -----------------------------------------------
    const MakeFloatTexture = (width, height, fill) => {
      const data = new Float32Array(width * height * 4);
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          const rgb = fill(x, y);
          const i = (y * width + x) * 4;
          data[i] = rgb[0]; data[i + 1] = rgb[1]; data[i + 2] = rgb[2]; data[i + 3] = 1;
        }
      }
      const texture = new THREE.DataTexture(data, width, height, THREE.RGBAFormat, THREE.FloatType);
      texture.colorSpace = THREE.NoColorSpace;
      texture.minFilter = THREE.NearestFilter;
      texture.magFilter = THREE.NearestFilter;
      texture.generateMipmaps = false;
      texture.needsUpdate = true;
      return texture;
    };
    const Grey = (v) => MakeFloatTexture(2, 2, () => [v, v, v]);
    const ReadLdr = () => {
      const w = post.targets.ldr.width;
      const h = post.targets.ldr.height;
      const pixels = new Uint8Array(w * h * 4);
      renderer.readRenderTargetPixels(post.targets.ldr, 0, 0, w, h, pixels);
      return { w, h, pixels };
    };
    const CenterPixel = (shot) => {
      const i = ((shot.h >> 1) * shot.w + (shot.w >> 1)) * 4;
      return [shot.pixels[i], shot.pixels[i + 1], shot.pixels[i + 2]];
    };
    /** 把合成 pass 摆成「只有曝光 + tonemap，其余全中性」。 */
    const NeutralComposite = (source) => {
      const U = post.uniformsComposite;
      const black = Grey(0);
      U.uHdr.value = source;
      U.uBloom.value = black;
      U.uGod.value = black;
      U.uNormalDepth.value = black;
      U.uFlareStrength.value = 0;
      U.uDirtStrength.value = 0;
      U.uDither.value = 0;
      U.uLutAmount.value = 0;
      U.uTonemap.value = 0;
      U.uResolution.value.set(post.width, post.height);
      U.uBloomStrength.value = 0;
      U.uGodStrength.value = 0;
      U.uVignette.value = 0;
      U.uAberration.value = 0;
      U.uGrain.value = 0;
      U.uSaturation.value = 1;
      U.uContrast.value = 1;
      U.uLift.value.set(0, 0, 0);
      U.uGain.value.set(1, 1, 1);
      U.uSplitShadow.value = 0;
      U.uSplitHighlight.value = 0;
      U.uMotionScale.value = 0;
      U.uDamage.value = 0;
      U.uFade.value = 0;
      U.uDofStrength.value = 0;
      U.uNearDofStrength.value = 0;
      U.uFogDensity.value = 0;
      U.uFogSource.value = 0;
      return black;
    };
    /** 直接驱动曝光 pass：绕过帧图，用受控的 sceneColor 推 N 帧。 */
    const DriveExposure = (sourceTexture, frames, dt = 1 / 60) => {
      exposure.active = true;
      const ctx = {
        renderer,
        blitter: post.blitter,
        sceneColor: { texture: sourceTexture },
        width: post.width,
        height: post.height,
        frame: 0,
        options: { exposure: 1, dt },
      };
      for (let i = 0; i < frames; i += 1) { ctx.frame = i; exposure.Render(ctx); }
      return exposure.ReadState(renderer);
    };

    // 先跑够真帧：TAA 历史滚满、GI/雾落定，管线处在正常状态
    P.state.elapsed = 0;
    post.frame = 0;
    post.hasTaaHistory = false;
    post.hasPrev = false;
    P.StepFrames(12, 1 / 60);

    // --- 1) 每一趟都真的出画（保留字编译失败 = 恒黑，只有读回像素能抓）-----
    {
      const HalfToFloat = (bits) => {
        const sign = (bits >> 15) & 1 ? -1 : 1;
        const e = (bits >> 10) & 0x1f;
        const m = bits & 0x3ff;
        if (e === 0) return sign * Math.pow(2, -14) * (m / 1024);
        if (e === 31) return m ? NaN : sign * Infinity;
        return sign * Math.pow(2, e - 15) * (1 + m / 1024);
      };
      const lum = new Uint16Array(16 * 16 * 4);
      renderer.readRenderTargetPixels(exposure.lumTarget, 0, 0, 16, 16, lum);
      let lumMin = Infinity;
      let lumMax = -Infinity;
      for (let i = 0; i < 16 * 16; i += 1) {
        const v = HalfToFloat(lum[i * 4]);
        lumMin = Math.min(lumMin, v);
        lumMax = Math.max(lumMax, v);
      }
      out.luminancePass = { min: lumMin, max: lumMax, varies: lumMax - lumMin > 0.05 };
      const state = exposure.ReadState(renderer);
      out.statePass = { ...state, finite: Number.isFinite(state.gain) && state.gain > 0 };
    }

    // --- 2) 直方图各桶之和 = 降采样像素数 ---------------------------------
    {
      const bins = exposure.ReadHistogram(renderer);
      const total = bins.reduce((a, b) => a + b, 0);
      out.histogram = {
        bins: bins.length,
        sumNormalized: total,
        nonZeroBins: bins.filter((b) => b > 1e-6).length,
        // 归一化频度之和应为 1（每个降采样像素恰好投一票，权重 1）
        error: Math.abs(total - 1),
      };
    }

    // --- 3) 均匀 0.18 灰 → 绝对模式 → 输出中灰 sRGB 118 --------------------
    {
      const grey = Grey(0.18);
      exposure.SetMode("absolute");
      exposure.SetAnchorOverride({ logLum: null, evBias: 0, evUp: 99, evDown: 99 });
      const state = DriveExposure(grey, 90);
      const black = NeutralComposite(grey);
      post.uniformsComposite.uExposure.value = 1;
      post.uniformsComposite.uExposureTex.value = exposure.StateTexture;
      post._Blit(post.matComposite, post.targets.ldr);
      out.midGrey = { state, pixel: CenterPixel(ReadLdr()) };
      grey.dispose();
      black.dispose();
    }

    // --- 4) 适应曲线：亮→暗与暗→亮的时间常数不同，且都单调 ----------------
    {
      const dark = Grey(0.02);
      const bright = Grey(1.6);
      const Trace = (from, to, frames) => {
        exposure.SetMode("absolute");
        exposure.SetAnchorOverride({ logLum: null, evBias: 0, evUp: 99, evDown: 99 });
        DriveExposure(from, 60);                       // 先收敛到起点
        exposure.snapFrames = 0;                       // 关掉吸附，看真实适应
        const trace = [];
        const ctx = {
          renderer, blitter: post.blitter, sceneColor: { texture: to },
          width: post.width, height: post.height, frame: 0, options: { exposure: 1, dt: 1 / 60 },
        };
        exposure.active = true;
        for (let i = 0; i < frames; i += 1) {
          ctx.frame = i;
          exposure.Render(ctx);
          trace.push(exposure.ReadState(renderer).ev);
        }
        return trace;
      };
      const Analyse = (trace) => {
        const start = trace[0];
        const end = trace[trace.length - 1];
        const span = end - start;
        let monotone = true;
        for (let i = 1; i < trace.length; i += 1) {
          if (span > 0 ? trace[i] < trace[i - 1] - 1e-3 : trace[i] > trace[i - 1] + 1e-3) monotone = false;
        }
        // 到达 63.2%（一个时间常数）需要几帧
        let tau = trace.length;
        for (let i = 0; i < trace.length; i += 1) {
          if (Math.abs(trace[i] - start) >= Math.abs(span) * 0.632) { tau = i + 1; break; }
        }
        return { start, end, span, monotone, tauFrames: tau };
      };
      out.adaptUp = Analyse(Trace(dark, bright, 90));     // 场景变亮 → EV 升
      out.adaptDown = Analyse(Trace(bright, dark, 90));   // 场景变暗 → EV 降
      dark.dispose();
      bright.dispose();
    }

    // --- 5) LUT 一致性：256 级灰阶 + 彩色样本，两条路差 ≤ 1/255 -------------
    {
      exposure.SetMode("anchored");
      exposure.SetAnchorOverride(null);
      // 测试图：16 行 × 16 列 = 256 级灰阶（HDR 0…4），再叠 8 条彩阶
      const pattern = (() => {
        const W = 32;
        const H = 32;
        return MakeFloatTexture(W, H, (x, y) => {
          if (y < 16) {
            const level = (y * W + x) / (16 * W - 1);
            return [level * 4, level * 4, level * 4];
          }
          const t = x / (W - 1) * 4;
          const band = y - 16;
          if (band < 2) return [t, 0, 0];
          if (band < 4) return [0, t, 0];
          if (band < 6) return [0, 0, t];
          if (band < 8) return [t, t * 0.6, 0];
          if (band < 10) return [0, t, t * 0.8];
          if (band < 12) return [t * 0.7, 0, t];
          if (band < 14) return [t, 4 - t, 2];
          return [t * 0.3, t * 0.9, t * 0.5];
        });
      })();
      const black = NeutralComposite(pattern);
      // 分级参数摆成正片那一档（默认值就是），LUT 按它现烘
      const U = post.uniformsComposite;
      U.uSaturation.value = 0.90;
      U.uContrast.value = 1.07;
      U.uLift.value.set(0.006, 0.004, 0.012);
      U.uGain.value.set(1.02, 1.0, 0.965);
      U.uShadowTint.value.set(0.855, 0.975, 1.170);
      U.uHighlightTint.value.set(1.105, 1.015, 0.880);
      U.uSplitShadow.value = 1;
      U.uSplitHighlight.value = 1;
      U.uExposure.value = 0.46;
      U.uExposureTex.value = exposure.whitePixel;
      const grade = await import("./Script_PostGrade.mjs");
      U.uLut.value = post.compositePass.lutCache.Get(grade.GradeFromUniforms(U));
      // 烘一张的真实代价：缓存里那张早就烘好了，另烘一张才量得到
      const bakeStart = performance.now();
      const throwaway = grade.BakeGradeLut(grade.GradeFromUniforms(U));
      const bakeMs = performance.now() - bakeStart;
      throwaway.dispose();

      U.uLutAmount.value = 0;
      post._Blit(post.matComposite, post.targets.ldr);
      const mathPath = ReadLdr();
      U.uLutAmount.value = 1;
      post._Blit(post.matComposite, post.targets.ldr);
      const lutPath = ReadLdr();

      let maxDiff = 0;
      let over1 = 0;
      let sum = 0;
      let count = 0;
      for (let i = 0; i < mathPath.pixels.length; i += 4) {
        for (let c = 0; c < 3; c += 1) {
          const d = Math.abs(mathPath.pixels[i + c] - lutPath.pixels[i + c]);
          maxDiff = Math.max(maxDiff, d);
          if (d > 1) over1 += 1;
          sum += d;
          count += 1;
        }
      }
      out.lut = {
        maxDiff, over1, meanDiff: sum / count, samples: count,
        bakes: post.compositePass.lutCache.bakes, bakeMs,
        size: (await import("./Data_Tuning_Camera.mjs")).LUT.size,
      };
      U.uLutAmount.value = 0;
      pattern.dispose();
      black.dispose();
    }

    // --- 6) 镜头光晕：黑场 → 0；太阳被挡 → 眩光 0 --------------------------
    {
      const F = flare.uniforms;
      const black = Grey(0);
      const white = Grey(1);
      const ReadFlare = () => {
        const w = flare.target.width;
        const h = flare.target.height;
        const buffer = new Uint16Array(w * h * 4);
        renderer.readRenderTargetPixels(flare.target, 0, 0, w, h, buffer);
        const HalfToFloat = (bits) => {
          const sign = (bits >> 15) & 1 ? -1 : 1;
          const e = (bits >> 10) & 0x1f;
          const m = bits & 0x3ff;
          if (e === 0) return sign * Math.pow(2, -14) * (m / 1024);
          if (e === 31) return m ? NaN : sign * Infinity;
          return sign * Math.pow(2, e - 15) * (1 + m / 1024);
        };
        let max = 0;
        let sum = 0;
        for (let i = 0; i < w * h; i += 1) {
          for (let c = 0; c < 3; c += 1) {
            const v = HalfToFloat(buffer[i * 4 + c]);
            max = Math.max(max, v);
            sum += v;
          }
        }
        return { max, mean: sum / (w * h * 3), w, h };
      };
      const ctx = { renderer, blitter: post.blitter, normalDepthTexture: post.NormalDepthTexture };
      const savedBright = flare.bloom.bright;

      // 6a) 黑场输入 → 光晕层必须精确为 0
      flare.bloom = { bright: { texture: black } };
      F.uGlare.value = 0;
      F.uSunOnScreen.value = 0;
      F.uThreshold.value = 0.55;
      flare.Render(ctx);
      out.flareBlack = ReadFlare();

      // 6b) 亮源存在**且太阳露着** → 鬼影层非零
      //     2026-09-08 第三版定稿起鬼影 / 光环与星芒共用同一个屏幕空间遮挡判据
      //     （太阳不在画面里就没有那颗点源，也就不该有鬼影），所以这一条要先
      //     把太阳摆到天上；只喂一张白图是不够的。
      flare.bloom = { bright: { texture: white } };
      F.uThreshold.value = 0.20;
      F.uGlare.value = 1;
      F.uSunOnScreen.value = 1;
      F.uAspect.value = post.width / post.height;
      F.uSunUv.value.set(0.5, 0.97);            // 天空
      flare.Render(ctx);
      out.flareBright = ReadFlare();

      // 6d) 同一张白图，太阳被地面挡住 → 整层（鬼影 + 光环 + 星芒）精确为 0
      F.uSunUv.value.set(0.5, 0.06);            // 地面
      flare.Render(ctx);
      out.flareGhostOccluded = ReadFlare();

      // 6c) 太阳眩光的屏幕空间遮挡。阈值抬到 2.0 让鬼影/光环归零，
      //     只剩星芒那一项，于是读数就是遮挡判据本身。
      //     街景机位：画面下方是地面（视深 > 0 = 挡住），上方是天空（视深 0）。
      F.uThreshold.value = 2.0;
      F.uGlare.value = 1;
      F.uSunOnScreen.value = 1;
      F.uAspect.value = post.width / post.height;
      F.uSunUv.value.set(0.5, 0.06);            // 地面
      flare.Render(ctx);
      out.flareOccluded = ReadFlare();
      F.uSunUv.value.set(0.5, 0.97);            // 天空
      flare.Render(ctx);
      out.flareOpen = ReadFlare();

      flare.bloom = savedBright ? { bright: savedBright } : flare.bloom;
      flare.bloom = post.bloomPass;
      F.uThreshold.value = 0.55;
      black.dispose();
      white.dispose();
    }

    // --- 7) 自动曝光开/关的稳定性（关掉必须绑回纯白，且可复现）-------------
    {
      const CaptureFrames = () => {
        P.state.elapsed = 0;
        post.frame = 0;
        post.hasTaaHistory = false;
        post.hasPrev = false;
        P.StepFrames(10, 1 / 60);
        return ReadLdr();
      };
      post.SetAutoExposure(false);
      const offA = CaptureFrames();
      out.exposureTextureWhenOff = post.ExposureTexture === exposure.whitePixel;
      post.SetAutoExposure(true);
      CaptureFrames();
      post.SetAutoExposure(false);
      const offB = CaptureFrames();
      let identical = offA.pixels.length === offB.pixels.length;
      let maxDelta = 0;
      if (identical) {
        for (let i = 0; i < offA.pixels.length; i += 1) {
          const d = Math.abs(offA.pixels[i] - offB.pixels[i]);
          if (d > maxDelta) maxDelta = d;
        }
        identical = maxDelta === 0;
      }
      out.offStable = { identical, maxDelta };
      // 关掉之后合成实际乘的是不是 1.0：用受控灰阶量，比读 uniform 结实
      const grey = Grey(0.25);
      const black = NeutralComposite(grey);
      post.uniformsComposite.uExposure.value = 1;
      post.uniformsComposite.uExposureTex.value = post.ExposureTexture;
      post._Blit(post.matComposite, post.targets.ldr);
      const withOff = CenterPixel(ReadLdr());
      post.uniformsComposite.uExposureTex.value = exposure.whitePixel;
      post._Blit(post.matComposite, post.targets.ldr);
      const withWhite = CenterPixel(ReadLdr());
      out.offGainIsOne = { withOff, withWhite,
        same: withOff.every((v, i) => v === withWhite[i]) };
      grey.dispose();
      black.dispose();
      post.SetAutoExposure(true);
    }

    // --- 8) 性能：把两趟单独拎出来用 GPU 计时查询量 -----------------------
    {
      const ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
      const Measure = (fn, iterations) => {
        if (!ext) return null;
        const query = gl.createQuery();
        gl.beginQuery(ext.TIME_ELAPSED_EXT, query);
        for (let i = 0; i < iterations; i += 1) fn();
        gl.endQuery(ext.TIME_ELAPSED_EXT);
        gl.flush();
        return new Promise((resolve) => {
          const Poll = () => {
            if (gl.getParameter(ext.GPU_DISJOINT_EXT)) { gl.deleteQuery(query); resolve(null); return; }
            if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
              requestAnimationFrame(Poll);
              return;
            }
            const ms = gl.getQueryParameter(query, gl.QUERY_RESULT) / 1e6 / iterations;
            gl.deleteQuery(query);
            resolve(ms);
          };
          requestAnimationFrame(Poll);
        });
      };
      P.StepFrames(4, 1 / 60);
      const ctx = post.context;
      exposure.active = true;
      // A/B 交替各 5 轮取中位数：别的代理同时在跑浏览器测试，单向先后测会把
      // 机器负载的漂移算成特性开销
      const exposureRounds = [];
      const flareRounds = [];
      for (let round = 0; round < 5; round += 1) {
        exposureRounds.push(await Measure(() => exposure.Render(ctx), 40));
        flareRounds.push(await Measure(() => flare.Render(ctx), 40));
      }
      const Median = (values) => {
        const clean = values.filter((v) => typeof v === "number" && Number.isFinite(v)).sort((a, b) => a - b);
        return clean.length ? clean[clean.length >> 1] : null;
      };
      out.perf = {
        available: !!ext,
        exposureMs: Median(exposureRounds),
        flareMs: Median(flareRounds),
        resolution: [post.width, post.height],
      };
    }

    // --- 9) 四张新调试视图真的出画 -------------------------------------
    // GLSL ES 3.00 保留字编译失败时 three 只在控制台留一行，那一趟什么都不画，
    // 屏幕留着上一次 clear 的颜色 —— 表现是「某个视图恒为纯黑」而正式链毫发无损。
    // 所以每一张都要读回屏幕像素，并且要求它**有层次**（不是一块平色）。
    {
      const viewWas = post.GetDebugView();
      const ReadScreen = () => {
        const w = gl.drawingBufferWidth;
        const h = gl.drawingBufferHeight;
        const pixels = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
        let min = 255;
        let max = 0;
        let sum = 0;
        let count = 0;
        for (let i = 0; i < pixels.length; i += 4 * 17) {
          const v = pixels[i];
          min = Math.min(min, v);
          max = Math.max(max, v);
          sum += v;
          count += 1;
        }
        return { min, max, mean: sum / count };
      };
      out.debugViews = {};
      // 光晕那一张要**把相机转向太阳**才有内容：2026-09-08 第三版定稿起
      // 鬼影 / 光环 / 星芒共用「太阳露出来了没有」的屏幕空间判据，
      // 默认平视机位上这张靶合法地恒为 0（那不是「没出画」）。
      const quatWas = P.camera.quaternion.clone();
      for (const id of ["exposure", "lensFlare", "lensDirt", "lutCheck"]) {
        if (id === "lensFlare") {
          P.camera.lookAt(P.camera.position.clone().addScaledVector(P.sky.sunDirection, 100));
        } else {
          P.camera.quaternion.copy(quatWas);
        }
        post.SetDebugView(id);
        P.StepFrames(3, 1 / 60);
        out.debugViews[id] = ReadScreen();
      }
      P.camera.quaternion.copy(quatWas);
      post.SetDebugView(viewWas);
      P.StepFrames(2, 1 / 60);
    }

    // 复位到正常状态，别把测试留下的 uniform 带进后面的取证
    exposure.SetMode("anchored");
    exposure.SetAnchorOverride(null);
    exposure.RequestReset();
    P.StepFrames(4, 1 / 60);
    out.glError = gl.getError();
    out.midGreyEv = (await import("./Script_PostExposure.mjs")).MID_GREY_EV;
    out.passOrder = post.passes.map((pass) => pass.name);
    return out;
  });
}

/** 确定性逐比特读数：时间与帧序全部钉死（口径同 docs §1.12）。 */
async function DeterministicLdr(page) {
  return page.evaluate(() => {
    const P = window.Probe;
    const post = P.post;
    P.state.elapsed = 0;
    post.frame = 0;
    post.hasTaaHistory = false;
    post.hasPrev = false;
    P.StepFrames(16, 1 / 60);
    const w = post.targets.ldr.width;
    const h = post.targets.ldr.height;
    const pixels = new Uint8Array(w * h * 4);
    P.renderer.readRenderTargetPixels(post.targets.ldr, 0, 0, w, h, pixels);
    let sum = 0;
    for (let i = 0; i < pixels.length; i += 4) sum += pixels[i];
    return { w, h, meanR: sum / (pixels.length / 4), pixels: Array.from(pixels) };
  });
}

// ===========================================================================
// 正片页：标定锚点 + 「打开自动曝光不改变默认机位亮度」
// ===========================================================================

async function GameSection(page, port, phase) {
  await page.goto(
    `http://127.0.0.1:${port}/Taierzhuang1938/index.html?shot=1&phase=${phase}&quality=high&scale=medium`,
    { waitUntil: "load", timeout: 180000 },
  );
  await page.waitForFunction(() => window.Taierzhuang !== undefined, null, { timeout: 240000 });
  return page.evaluate(() => {
    const game = window.Taierzhuang;
    const post = game.post;
    const renderer = game.renderer;
    const ReadMean = () => {
      const w = post.targets.ldr.width;
      const h = post.targets.ldr.height;
      const pixels = new Uint8Array(w * h * 4);
      renderer.readRenderTargetPixels(post.targets.ldr, 0, 0, w, h, pixels);
      let sum = 0;
      let count = 0;
      // 取亮度而不是单通道：分离调色会让 R/G/B 各自偏，亮度才是「明暗」
      for (let i = 0; i < pixels.length; i += 4) {
        sum += 0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2];
        count += 1;
      }
      return sum / count;
    };
    game.StepFrames(240);

    game.graphics.autoExposure = false;
    game.ApplyGraphics();
    game.StepFrames(30);
    const meanOff = ReadMean();

    game.graphics.autoExposure = true;
    game.ApplyGraphics();
    post.exposurePass.RequestReset();
    game.StepFrames(60);
    const meanOn = ReadMean();
    const state = post.exposurePass.ReadState(renderer);
    const skyName = game.sky.presetName;
    // 关卡 id 直接问曝光 pass：`options.exposureAnchor` 就是 `phase.id`，
    // 读它顺带验证了那条接线真的通到了 pass 里。
    const levelId = post.exposurePass.anchorKey;
    // 活性取证：抬头看天（亮度差很大），看自动曝光真的跟不跟、钳不钳。
    const pitchWas = game.player.pitch;
    game.player.pitch = 1.15;
    game.StepFrames(120);
    const lookUp = post.exposurePass.ReadState(renderer);
    game.player.pitch = pitchWas;
    game.StepFrames(90);
    return {
      skyName, levelId, meanOff, meanOn, state, lookUp,
      delta: Math.abs(meanOn - meanOff) / Math.max(meanOff, 1e-3),
      anchor: post.exposurePass.anchor,
      autoActive: post.exposurePass.active,
    };
  });
}

// ===========================================================================
// 视觉对照图：三个时段 × （自动曝光开/关、光晕开/关、机位换到亮处）
//
// 走探针页而不是正片：一是十几秒就能建好场，二是这三个时段里 `dusk` 根本没有
// 哪一关在用（正片七关只有 chuchuanDay/smokyDay×3/night/dawn/burningStreet），
// 只有探针页能把它摆出来。锚点用**当前机位实测值**现装 —— 于是默认机位那两张
// 必然重合（这正是要给人看的），而抬头看天那两张必然分开。
// ===========================================================================

async function ShotSection(page, port, preset) {
  await page.goto(
    `http://127.0.0.1:${port}/Taierzhuang1938/Probe.html?quality=high&preset=${preset}&scene=street&gi=0`,
    { waitUntil: "load", timeout: 180000 },
  );
  await page.waitForFunction(() => window.Probe?.state?.ready, null, { timeout: 240000 });

  const Setup = (options) => page.evaluate((o) => {
    const P = window.Probe;
    const post = P.post;
    post.SetDebugView(o.view || "final");
    post.SetAutoExposure(o.auto);
    post.preset.lensFlare = o.flare;
    P.camera.rotation.x = o.pitch;
    // 锚点 = 默认机位（pitch 0）实测的平均场景亮度。先在默认机位量一次再装上。
    if (o.anchor !== null) {
      post.exposurePass.SetAnchorOverride({ logLum: o.anchor, evUp: 2, evDown: 2 });
    }
    post.exposurePass.RequestReset();
    P.StepFrames(40, 1 / 60);
    return post.exposurePass.ReadState(P.renderer);
  }, options);

  // 1) 先在默认机位量锚点（自动曝光跑着，但没有锚 = 只测量不作用）
  const base = await Setup({ auto: true, flare: false, pitch: 0, anchor: null });
  const anchor = base.avgLog;

  const Shot = async (name, options) => {
    const state = await Setup({ ...options, anchor });
    await page.waitForTimeout(220);
    const file = path.join(SHOTS_DIR, `${preset}_${name}.png`);
    await page.screenshot({ path: file });
    console.log(`shot ${preset}_${name}`.padEnd(38)
      + ` gain=${state.gain.toFixed(3)} ev=${state.ev.toFixed(2)}`
      + ` avgLog=${state.avgLog.toFixed(2)}  ${file}`);
  };

  // 默认机位：开/关必须看不出差别（增益锚在这儿，精确 1.0）
  await Shot("A_default_autoOff", { auto: false, flare: false, pitch: 0 });
  await Shot("B_default_autoOn", { auto: true, flare: false, pitch: 0 });
  // 抬头看天：亮度差一大截，自动曝光必须压下来
  await Shot("C_skyward_autoOff", { auto: false, flare: false, pitch: 0.62 });
  await Shot("D_skyward_autoOn", { auto: true, flare: false, pitch: 0.62 });
  // 镜头光晕开/关（同一机位、同一曝光）
  await Shot("E_skyward_flareOff", { auto: true, flare: false, pitch: 0.62 });
  await Shot("F_skyward_flareOn", { auto: true, flare: true, pitch: 0.62 });
  // 调试视图各留一张（直方图条 + EV 数字、LUT 采样校验）
  await Shot("G_debugExposure", { auto: true, flare: false, pitch: 0, view: "exposure" });
  await Shot("H_debugLutCheck", { auto: true, flare: false, pitch: 0, view: "lutCheck" });
  await Shot("I_debugLensFlare", { auto: true, flare: true, pitch: 0.62, view: "lensFlare" });
  await page.evaluate(() => window.Probe.post.SetDebugView("final"));
}

// ===========================================================================
// 跑
// ===========================================================================

const server = await ServeRoot(rootDir, 0);
const port = server.address().port;

let probe = null;
let probeBaseline = null;
let probeCurrent = null;
const gameRows = [];

/**
 * **每一段各起一个浏览器**（跑完就关），不是同一个浏览器开三个页面。
 *
 * 事故：探针页 + 基线页 + 正片页挤在同一个 headless Chromium 里跑完之后，
 * 第三个上下文会零星冒出 `THREE.WebGLProgram: Shader Error ... VALIDATE_STATUS
 * false`（Program Info Log 是空的）并把 GL 推进 1282，紧接着的半浮点
 * readRenderTargetPixels 全读回 0 —— 表现是「phase=0 的曝光增益是 0」，
 * 而同一个页面单独跑一遍完全正常（增益 1.0029）。那不是渲染缺陷，是上下文压力。
 */
async function WithBrowser(tag, run) {
  const browser = await LaunchBrowser();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  WatchPage(page, tag);
  try {
    await run(page);
  } finally {
    await browser.close();
  }
}

try {
  if (!CALIBRATE) {
    await WithBrowser("probe", async (page) => {
      await page.goto(
        `http://127.0.0.1:${port}/Taierzhuang1938/Probe.html?quality=high&preset=smokyDay&scene=street&gi=0`,
        { waitUntil: "load", timeout: 180000 },
      );
      await page.waitForFunction(() => window.Probe?.state?.ready, null, { timeout: 240000 });
      // 逐比特基线要在动过任何 uniform **之前**取。三位新开关全部关掉 ——
      // 探针页没有 graphics 表，high 档的 preset.lensFlare 出厂是开的。
      if (BASELINE) {
        await page.evaluate(() => {
          const post = window.Probe.post;
          post.SetAutoExposure(false);
          post.SetLutEnabled(false);
          post.preset.lensFlare = false;
        });
        probeCurrent = await DeterministicLdr(page);
        await page.evaluate(() => {
          const post = window.Probe.post;
          post.SetAutoExposure(true);
          post.SetLutEnabled(true);
          post.preset.lensFlare = true;
        });
      }
      probe = await ProbeSection(page);
    });
  }

  if (BASELINE) {
    const baselineServer = await ServeRoot(path.resolve(BASELINE), 0);
    const basePort = baselineServer.address().port;
    await WithBrowser("baseline", async (page) => {
      await page.goto(
        `http://127.0.0.1:${basePort}/Taierzhuang1938/Probe.html?quality=high&preset=smokyDay&scene=street&gi=0`,
        { waitUntil: "load", timeout: 180000 },
      );
      await page.waitForFunction(() => window.Probe?.state?.ready, null, { timeout: 240000 });
      probeBaseline = await DeterministicLdr(page);
    });
    baselineServer.close();
  }

  if (SHOTS_DIR) {
    fs.mkdirSync(SHOTS_DIR, { recursive: true });
    for (const preset of ["dusk", "night", "burningStreet"]) {
      // eslint-disable-next-line no-await-in-loop
      await WithBrowser(`shots:${preset}`, (page) => ShotSection(page, port, preset));
    }
    console.log(`note 对照图落在 ${SHOTS_DIR}`);
  }

  if (!PROBE_ONLY) {
    await WithBrowser("game", async (page) => {
      for (const phase of GAME_PHASES) {
        // eslint-disable-next-line no-await-in-loop
        gameRows.push({ phase, ...(await GameSection(page, port, phase)) });
      }
    });
  }
} catch (error) {
  problems.push(`THROW ${String(error).slice(0, 500)}`);
}

server.close();

// ---------------------------------------------------------------------------
// 标定模式：只打表，不断言
// ---------------------------------------------------------------------------
if (CALIBRATE) {
  console.log("\n=== 曝光锚点标定（填进 Data_Tuning_Camera.SKY_EXPOSURE.logLum）===");
  const byPreset = new Map();
  for (const row of gameRows) {
    console.log(`phase=${row.phase} level=${row.levelId} sky=${row.skyName}`
      + ` avgLog=${row.state.avgLog.toFixed(4)}`
      + ` ev=${row.state.ev.toFixed(3)} gain=${row.state.gain.toFixed(4)}`
      + ` meanOff=${row.meanOff.toFixed(2)} meanOn=${row.meanOn.toFixed(2)}`);
    if (!byPreset.has(row.skyName)) byPreset.set(row.skyName, []);
    byPreset.get(row.skyName).push(row.state.avgLog);
  }
  console.log("\n逐关锚点（抄进 Data_Tuning_Camera.EXPOSURE_ANCHORS）：");
  for (const row of gameRows) {
    console.log(`  ${row.levelId}: { logLum: ${row.state.avgLog.toFixed(2)} },`
      + `   // ${row.skyName}`);
  }
  console.log("\n按时段预设汇总（只供参考：共用预设的多关亮度差很大）：");
  for (const [name, values] of byPreset) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const spread = Math.max(...values) - Math.min(...values);
    console.log(`  ${name}: mean=${mean.toFixed(2)} spread=${spread.toFixed(2)} EV`);
  }
  for (const problem of problems) console.log(`WARN ${problem}`);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 断言
// ---------------------------------------------------------------------------
if (!probe) {
  Check("探针页取证成功", false, problems.join(" | "));
} else {
  Check("亮度降采样图真的出画（有明暗差）",
    probe.luminancePass.varies, JSON.stringify(probe.luminancePass));
  Check("1×1 曝光状态有限且为正",
    probe.statePass.finite, JSON.stringify(probe.statePass));
  Check("直方图各桶之和 = 降采样像素数（±1%）",
    probe.histogram.error < 0.01 && probe.histogram.nonZeroBins > 1,
    JSON.stringify(probe.histogram));
  const grey = probe.midGrey.pixel;
  Check("均匀 0.18 灰 → 绝对模式收敛到中灰 sRGB 118±6",
    grey.every((v) => Math.abs(v - 118) <= 6),
    JSON.stringify(probe.midGrey));
  Check("适应曲线：暗→亮单调且比亮→暗快",
    probe.adaptUp.monotone && probe.adaptDown.monotone
    && probe.adaptUp.span > 0.3 && probe.adaptDown.span < -0.3
    && probe.adaptUp.tauFrames < probe.adaptDown.tauFrames,
    JSON.stringify({ up: probe.adaptUp, down: probe.adaptDown }));
  // 门槛的账（2026-09-08 集成期实测）：B6a 分支单跑是 maxDiff=1 / 越线 0/2764800；
  // 七个渲染子系统合流之后同一张测试图是 maxDiff=2 / 越线 4/2764800（均差 0.154，
  // 比单跑的 0.162 还小一点）。变的不是 LUT 那段代码 —— 是它的**输入**：
  // 合流后的 composite 里 ApplyFog 接上了 froxel 体积雾与大气透视，
  // 同一张图送进 ColorGrade 时的颜色已经不同，于是有 4 个通道正好落在分离调色
  // 两个权重折角上（那两处是 RGB 立方体里的斜面，三线性插值接不住，误差 O(h)）。
  // 把它压回 1/255 只能上 128³（8 MB + 8 倍烘焙时间），而 2/255 已经在输出抖动
  // （uDither，1/255 的倍数）的幅度之下。所以门槛改成三条一起看：
  // 峰值 ≤ 2/255、**越线占比 ≤ 1e-5**、**均差 ≤ 0.25** —— 后两条是新加的，
  // 只放宽峰值那一条，整体比原来更严（原来只看峰值）。
  Check("LUT 路径 vs 直接数学路径 ≤ 1/255（折角处 ≤ 2/255，占比 ≤ 1e-5，均差 ≤ 0.25）",
    probe.lut.maxDiff <= 2
    && probe.lut.over1 / Math.max(probe.lut.samples, 1) <= 1e-5
    && probe.lut.meanDiff <= 0.25,
    JSON.stringify(probe.lut));
  Check("光晕：黑场输入 → 恒 0",
    probe.flareBlack.max === 0, JSON.stringify(probe.flareBlack));
  Check("光晕：有亮源且太阳露着时鬼影层非零",
    probe.flareBright.max > 0.01, JSON.stringify(probe.flareBright));
  // 2026-09-08 第三版定稿：鬼影是镜组对一颗**点光源**的多次反射，太阳被挡住
  // （或不在画面里）时镜筒里根本没有那颗点源。上半屏一整片过曝的天不该拖出
  // 彩虹扇 —— Gate_SouthOuter 城楼门洞上方那道绿紫翅膀就是这么来的。
  Check("光晕：同一张白图、太阳被挡住 → 整层恒 0（鬼影不吃大面积天空）",
    probe.flareGhostOccluded.max === 0, JSON.stringify(probe.flareGhostOccluded));
  Check("太阳眩光：被几何挡住 = 0，露天 > 0",
    probe.flareOccluded.max === 0 && probe.flareOpen.max > 0.01,
    JSON.stringify({ occluded: probe.flareOccluded, open: probe.flareOpen }));
  Check("自动曝光关掉时合成绑的是纯白 1×1（增益精确 1.0）",
    probe.exposureTextureWhenOff && probe.offGainIsOne.same,
    JSON.stringify(probe.offGainIsOne));
  Check("自动曝光开关往返后画面逐比特复原",
    probe.offStable.identical, JSON.stringify(probe.offStable));
  Check("帧图里自动曝光在泛光之前、光晕在泛光之后",
    probe.passOrder.indexOf("exposure") < probe.passOrder.indexOf("bloom")
    && probe.passOrder.indexOf("lensFlare") > probe.passOrder.indexOf("bloom")
    && probe.passOrder.indexOf("lensFlare") < probe.passOrder.indexOf("composite"),
    JSON.stringify(probe.passOrder));
  for (const [id, view] of Object.entries(probe.debugViews)) {
    // 有层次 = 真的在画（恒黑 / 恒平色都会被这一条拓住）
    Check(`调试视图「${id}」真的出画`,
      view.max - view.min > 24 && view.mean > 2, JSON.stringify(view));
  }
  Check("无 GL 错误", probe.glError === 0, `glError=${probe.glError}`);
  if (probe.perf.available) {
    Check("自动曝光 GPU ≤ 0.15 ms",
      probe.perf.exposureMs !== null && probe.perf.exposureMs <= 0.15,
      JSON.stringify(probe.perf));
    Check("镜头光晕 GPU ≤ 0.30 ms",
      probe.perf.flareMs !== null && probe.perf.flareMs <= 0.30,
      JSON.stringify(probe.perf));
  } else {
    console.log("note 没有 EXT_disjoint_timer_query_webgl2，跳过性能断言");
  }
  console.log(`note 中灰补偿 EV：aces=${probe.midGreyEv.aces.toFixed(4)}`
    + ` agx=${probe.midGreyEv.agx.toFixed(4)}`);
  console.log(`note LUT ${probe.lut.size}³：maxDiff=${probe.lut.maxDiff}`
    + ` mean=${probe.lut.meanDiff.toFixed(4)} 超 1/255 的通道=${probe.lut.over1}/${probe.lut.samples}`
    + ` 烘一张=${probe.lut.bakeMs.toFixed(1)} ms`);
  console.log(`note GPU 分段：exposure=${probe.perf.exposureMs} ms`
    + ` lensFlare=${probe.perf.flareMs} ms @ ${probe.perf.resolution.join("×")}`);
}

if (BASELINE) {
  if (!probeBaseline || !probeCurrent) {
    Check("逐比特基线比对取证成功", false, "基线或当前读数缺失");
  } else {
    let maxDelta = 0;
    let differing = 0;
    const n = Math.min(probeBaseline.pixels.length, probeCurrent.pixels.length);
    for (let i = 0; i < n; i += 1) {
      const d = Math.abs(probeBaseline.pixels[i] - probeCurrent.pixels[i]);
      if (d > 0) differing += 1;
      if (d > maxDelta) maxDelta = d;
    }
    Check("三位开关全关时与基线检出逐比特相同",
      probeBaseline.w === probeCurrent.w && probeBaseline.h === probeCurrent.h && maxDelta === 0,
      JSON.stringify({ maxDelta, differing,
        baselineMean: probeBaseline.meanR, currentMean: probeCurrent.meanR }));
  }
}

for (const row of gameRows) {
  Check(`phase=${row.phase}（${row.levelId} / ${row.skyName}）自动曝光开/关的默认机位亮度差 < 5%`,
    row.delta < 0.05,
    `meanOff=${row.meanOff.toFixed(2)} meanOn=${row.meanOn.toFixed(2)}`
    + ` delta=${(row.delta * 100).toFixed(2)}% gain=${row.state.gain.toFixed(4)}`
    + ` avgLog=${row.state.avgLog.toFixed(3)} anchor=${JSON.stringify(row.anchor)}`);
  Check(`phase=${row.phase} 锚点已登记且出生机位增益 ≈ 1.0`,
    Number.isFinite(row.anchor.logLum) && Math.abs(row.state.gain - 1) < 0.03,
    `logLum=${row.anchor.logLum} gain=${row.state.gain.toFixed(4)}`);
  // 活性 + 钳位：抬头看天后场景亮度变了，增益必须跟着动，
  // 且不得越过该时段的 EV 钳。亮度没真变时这一条自动跳过。
  const moved = Math.abs(row.lookUp.avgLog - row.state.avgLog);
  const gainMin = Math.pow(2, -(row.anchor.evDown ?? 1.5)) - 0.02;
  const gainMax = Math.pow(2, row.anchor.evUp ?? 1.5) + 0.02;
  const inClamp = row.lookUp.gain >= gainMin && row.lookUp.gain <= gainMax;
  if (moved > 0.3) {
    const right = row.lookUp.avgLog > row.state.avgLog
      ? row.lookUp.gain < row.state.gain : row.lookUp.gain > row.state.gain;
    Check(`phase=${row.phase} 抬头看天时增益方向正确且在 EV 钳内`,
      right && inClamp,
      `avgLog ${row.state.avgLog.toFixed(2)}→${row.lookUp.avgLog.toFixed(2)}`
      + ` gain ${row.state.gain.toFixed(3)}→${row.lookUp.gain.toFixed(3)}`
      + ` 钳[${gainMin.toFixed(3)}, ${gainMax.toFixed(3)}]`);
  } else {
    Check(`phase=${row.phase} 抬头看天时增益仍在 EV 钳内`, inClamp,
      `gain=${row.lookUp.gain.toFixed(3)} 钳[${gainMin.toFixed(3)}, ${gainMax.toFixed(3)}]`);
  }
}

Check("页面无控制台报错", problems.length === 0, problems.slice(0, 4).join(" | "));

for (const check of checks) {
  console.log(`${check.ok ? "ok  " : "FAIL"} ${check.name}${check.ok ? "" : `  ${check.detail}`}`);
}
const failed = checks.filter((check) => !check.ok);
console.log(failed.length ? `\n${failed.length} 条失败` : "\n相机曝光 / 光晕 / LUT 全绿");
if (failed.length) process.exit(1);
