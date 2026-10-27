// 《台儿庄：血战滕县》落地扬尘的降分辨率体积（2026-10-22）。
//
// 为什么要有这一趟：落地扬尘（Script_DustFieldRenderer）每团是一只沿视线积分的体积盒，原来直接画在主场景那一趟里、
// 全分辨率逐像素走上百步（每步十几次采样，外加朝太阳的遮光）。人物战场反应测试场里爆点总在人身边，镜头被尘包住，
// GPU 计时查询实测（3394×1348 高画质，内部 2715×1078）：主场景不含尘 2.6 ms，含一团尘 17.5 → 30 ms —— 一团尘
// 就是整个主画面其余部分的 6–10 倍，帧率就是这么掉的。体积这种低频的东西没有理由按全分辨率算。
//
// 做法（帧图位置：contactShadows 之后、main 之前）：
//   1. 本趟：把所有尘团按 `preset.groundDustScale`（默认 0.5 → 像素 1/4）渲染进自己的靶。射线截断要的预通道深度
//      此时已经有了；靶里存「预乘散射 rgb + 累积透过率 a」（清成 0,0,0,1，各团按 over 叠）。
//   2. 主场景那一趟里，尘团原来所在的位置（renderOrder 6，排在枪口焰、火星、烟这些透明物之前）换成一张全屏片，
//      按深度从四个低分辨率样本里挑相近的放大（不会把尘糊到近处物体边上），`hdr = hdr·T + C` 叠上去 ——
//      与其它透明物的前后关系一点不变。
// 尘团的切换（进本趟 / 回主场景全分辨率画）由 DustFieldSystem.SetHalfMode 管：本趟跑了就是半分辨率，
// 被跳过（Idle：没尘、画质关了、编辑器裸跑没接源）就退回原来全分辨率画在主场景里，画面照旧。
import * as THREE from "three";
import { MakeRenderTarget } from "./Script_PostCommon.mjs";

export class GroundDustPass {
  constructor(pipeline) {
    this.pipeline = pipeline;
    this.name = "groundDust";
    this.source = null;        // Script_DustFieldRenderer.DustFieldSystem（Script_Main 每帧经 SetGroundDustSource 交进来）
    this.target = null;
    this.scale = 0;
    this.fullWidth = 0; this.fullHeight = 0;
    this.stats = { frames: 0, idle: 0 };
  }

  /** Script_Main 每帧调（vfx 的尘团系统是懒建的，没打过炮之前是 null）。 */
  SetSource(system) { this.source = system || null; }

  Scale(ctx) {
    const s = Number(ctx.preset?.groundDustScale);
    return Number.isFinite(s) && s > 0 ? Math.min(1, s) : 0;
  }

  Enabled(ctx) {
    return !!this.source?.HasVisible?.() && this.Scale(ctx) > 0;
  }

  /** 跳过的帧（没尘 / 关了）：尘团退回主场景全分辨率画（还有尘的话），全屏片收起。 */
  Idle(ctx) {
    this.stats.idle += 1;
    this.source?.SetReference?.(ctx?.preset?.groundDustReference === true);
    this.source?.SetHalfMode?.(false);
  }

  Resize(width, height) {
    this.fullWidth = width; this.fullHeight = height;
    this.target?.dispose(); this.target = null;
    this.pipeline.targets.groundDust = null;
  }

  _EnsureTarget(ctx) {
    const scale = this.Scale(ctx);
    const w = Math.max(1, Math.round(ctx.width * scale)), h = Math.max(1, Math.round(ctx.height * scale));
    if (this.target && this.target.width === w && this.target.height === h) return this.target;
    this.target?.dispose();
    // 散射是 HDR（火光那一下几十），透过率要细 —— 半精度浮点；最近点取样，放大由全屏片自己按深度挑。
    // 第二张是尘的前沿深度（Script_DustOcclusion）：之后画的粒子据此决定自己在尘前还是尘后。
    this.target = MakeRenderTarget(w, h, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, count: 2 });
    this.target.textures[0].name = "GroundDustHalf";
    this.target.textures[1].name = "GroundDustFront";
    this.pipeline.targets.groundDust = this.target;
    this.scale = scale;
    return this.target;
  }

  Render(ctx) {
    const target = this._EnsureTarget(ctx);
    // 参考版（原来逐像素全算，最贵）：Data_Tuning_Graphics 的 groundDustReference，默认各档都关
    this.source.SetReference?.(ctx.preset?.groundDustReference === true);
    this.source.RenderHalf(ctx.renderer, ctx.camera, target, ctx.width, ctx.height);
    this.stats.frames += 1;
  }

  Dispose() {
    this.target?.dispose(); this.target = null;
    this.pipeline.targets.groundDust = null;
  }
}

export default GroundDustPass;
