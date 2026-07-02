import { gsap } from "gsap";
import type { Container } from "pixi.js";

// 世界镜头特效（纯函数版）：由 App 传入 world 容器 + 屏幕中心锚点。行为/缓动/复位与原
// App.zoomOutPulse / App.detonationJolt 完全一致，仅把「取 world + 算中心」留在 App。

// §04 吞噬引爆的「镜头拉远」：以屏幕中心为锚把世界放大 1.06 再缓缓拉回——制造一拍「拉远一档」
// 的镜头感。用 pivot=position=中心 保证缩放前后画面不位移，结束后复位（与 1.0 视觉等价）。
export function cameraZoomPulse(world: Container, cx: number, cy: number, peakScale = 1.06, duration = 1.0): void {
  const w = world;
  gsap.killTweensOf(w.scale);
  // 以屏幕中心为锚（pivot=position=中心），scale=1 时画面不位移；从当前缩放平滑推到 peak 再缓缓拉回，
  // 不再第 1 帧直接 set(peak)——那会造成一下「跳变」。
  w.pivot.set(cx, cy);
  w.position.set(cx, cy);
  gsap
    .timeline({
      onComplete: () => {
        w.pivot.set(0, 0);
        w.position.set(0, 0);
      }
    })
    .to(w.scale, { x: peakScale, y: peakScale, duration: duration * 0.3, ease: "power2.out" })
    .to(w.scale, { x: 1, y: 1, duration: duration * 0.7, ease: "power2.inOut" });
}

// §04 引爆镜头冲击：先轻轻一「顿」（微缩），再猛地放大一档、缓缓拉回——「顿一下再拉远」的物理冲击。
// intensity 越大（吞得越大）顿挫越狠、拉远时间越长。
export function cameraDetonationJolt(world: Container, cx: number, cy: number, intensity: number): void {
  const w = world;
  gsap.killTweensOf(w.scale);
  w.pivot.set(cx, cy);
  w.position.set(cx, cy);
  const punch = 1.07 + intensity * 0.035;
  w.scale.set(0.985); // 先一顿
  gsap
    .timeline()
    .to(w.scale, { x: punch, y: punch, duration: 0.12, ease: "power3.out" })
    .to(w.scale, {
      x: 1,
      y: 1,
      duration: 1.0 + intensity * 0.2,
      ease: "power2.out",
      onComplete: () => {
        w.pivot.set(0, 0);
        w.position.set(0, 0);
      }
    });
}
