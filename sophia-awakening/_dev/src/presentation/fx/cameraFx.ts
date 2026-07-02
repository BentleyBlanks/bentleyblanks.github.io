import { gsap } from "gsap";
import type { Container } from "pixi.js";

// 世界镜头特效（镜头架版）：由 App 传入 world 容器 + 屏幕中心锚点。振幅/时长/缓动与旧版
// zoomOutPulse / detonationJolt / juice.shake(world) 完全一致，区别只在「变换永远连续」：
//
// 每个 world 对应一个模块级「镜头架」（rig），它是 world 变换的唯一所有者——
//   zoom（缩放，独占一条可整杀的 timeline）×  shake（屏幕空间偏移，独立 tween）
// 每帧由 apply() 合成写入 world 的 pivot/position/scale：
//   pivot = 锚点 c，scale = zoom，position = c + shake
// 这样：
//   · 新脉冲打断旧脉冲 → 整杀旧 timeline（连 onComplete 一起），从当前 zoom 值续走，不会
//     出现「旧 timeline 迟到的复位把 pivot/position 清零」造成的跳切；
//   · 震屏不再 fromTo 硬写 world.position（旧实现会把拉远中的 position=(cx,cy) 一把拍到
//     (-5,3)，整屏瞬移）——改为独立 shake 偏移，与缩放叠加互不打架；
//   · 只有 zoom 回到 1 且 shake 归零（视觉上就是恒等变换）时才把 pivot/position 真正清零，
//     供依赖「world 未变换 = 屏幕像素」的代码继续成立。

interface CameraRig {
  cx: number;
  cy: number;
  zoom: { v: number };
  shake: { x: number; y: number };
  zoomTl: gsap.core.Timeline | null;
  shakeTween: gsap.core.Tween | null;
}

const rigs = new WeakMap<Container, CameraRig>();

function getRig(world: Container, cx: number, cy: number): CameraRig {
  let rig = rigs.get(world);
  if (!rig) {
    rig = { cx, cy, zoom: { v: 1 }, shake: { x: 0, y: 0 }, zoomTl: null, shakeTween: null };
    rigs.set(world, rig);
  }
  // 换锚点（屏幕中心只在改窗口尺寸时变）仅在 zoom=1 时进行：scale=1 且 position=pivot+shake
  // 时换 pivot 不产生画面位移；zoom 进行中换锚会跳，沿用旧锚直到拉回 1。
  if (rig.zoom.v === 1) {
    rig.cx = cx;
    rig.cy = cy;
  }
  return rig;
}

// 把镜头架状态合成写入 world。恒等状态（zoom=1 且无震屏）时彻底归零 pivot/position，
// 与直接 identity 视觉等价——这一步永远不会造成画面跳变。
function apply(world: Container, rig: CameraRig): void {
  if (rig.zoom.v === 1 && rig.shake.x === 0 && rig.shake.y === 0) {
    world.scale.set(1);
    world.pivot.set(0, 0);
    world.position.set(0, 0);
    return;
  }
  world.scale.set(rig.zoom.v);
  world.pivot.set(rig.cx, rig.cy);
  world.position.set(rig.cx + rig.shake.x, rig.cy + rig.shake.y);
}

// 接管本 world 的缩放时间线：整杀旧 timeline（含其 onComplete 复位），新 tween 从当前
// zoom 值平滑续走。
function takeZoomTimeline(world: Container, rig: CameraRig): gsap.core.Timeline {
  rig.zoomTl?.kill();
  const tl = gsap.timeline({
    onUpdate: () => apply(world, rig),
    onComplete: () => {
      if (rig.zoomTl === tl) {
        rig.zoomTl = null;
      }
      apply(world, rig);
    }
  });
  rig.zoomTl = tl;
  return tl;
}

// §04 吞噬引爆的「镜头拉远」：以屏幕中心为锚把世界放大 peak 再缓缓拉回——制造一拍「拉远一档」
// 的镜头感。从当前缩放平滑推到 peak，绝不在第 1 帧硬 set。
export function cameraZoomPulse(world: Container, cx: number, cy: number, peakScale = 1.06, duration = 1.0): void {
  const rig = getRig(world, cx, cy);
  takeZoomTimeline(world, rig)
    .to(rig.zoom, { v: peakScale, duration: duration * 0.3, ease: "power2.out" })
    .to(rig.zoom, { v: 1, duration: duration * 0.7, ease: "power2.inOut" });
}

// §04 引爆镜头冲击：先轻轻一「顿」（微缩），再猛地放大一档、缓缓拉回——「顿一下再拉远」的物理冲击。
// intensity 越大（吞得越大）顿挫越狠、拉远时间越长。
// 「顿」是设计好的一拍相对微缩（静止时 = 旧版的 scale.set(0.985)）；若此刻有拉远在途，
// 相对当前缩放微缩同样比例，而不是硬拍回绝对值造成大跳。
export function cameraDetonationJolt(world: Container, cx: number, cy: number, intensity: number): void {
  const rig = getRig(world, cx, cy);
  const punch = 1.07 + intensity * 0.035;
  rig.zoom.v *= 0.985; // 先一顿
  const tl = takeZoomTimeline(world, rig);
  apply(world, rig);
  tl.to(rig.zoom, { v: punch, duration: 0.12, ease: "power3.out" }).to(rig.zoom, {
    v: 1,
    duration: 1.0 + intensity * 0.2,
    ease: "power2.out"
  });
}

// 世界震屏（原 JuiceManager.shake(world) 的镜头架版）：振幅/时长/缓动一致（从偏移 (-5,3)
// 弹回 0），但走独立 shake 偏移与缩放叠加——绝不硬写 world.position 去打架。
export function cameraShake(world: Container, cx: number, cy: number): void {
  const rig = getRig(world, cx, cy);
  rig.shakeTween?.kill();
  rig.shake.x = -5;
  rig.shake.y = 3;
  apply(world, rig);
  rig.shakeTween = gsap.to(rig.shake, {
    x: 0,
    y: 0,
    duration: 0.42,
    ease: "elastic.out(1, 0.35)",
    onUpdate: () => apply(world, rig),
    onComplete: () => {
      rig.shakeTween = null;
      apply(world, rig);
    }
  });
}
