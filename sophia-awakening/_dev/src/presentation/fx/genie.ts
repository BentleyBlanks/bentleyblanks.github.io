import { gsap } from "gsap";
import { MeshPlane, type PointData, type Renderer } from "pixi.js";
import type { RequestPacketView } from "../views/RequestPacketView";

// §FX Mac Dock「神奇效果」：把卡片快照成纹理，贴到一张细分网格上，逐帧沿"漏斗曲线"扭曲——
// 靠近目标的一端先被吸成尖颈、整张顺着颈流进核心那一点。不是简单缩放，而是真正的网格形变。
// 纯函数版：由 App.flyIntoCore 在开启「Dock 吮吸」调试项时调用，传入 renderer + 卡片 + 目标点。
// 行为/时序/形变公式与原 App.genieIntoCore 完全一致。
export function genieIntoCore(
  renderer: Renderer | undefined,
  card: RequestPacketView,
  target: PointData,
  onComplete: () => void
): void {
  const src = card.container;
  const parent = src.parent;
  if (!renderer || !parent) {
    card.accept(target, onComplete);
    return;
  }

  let tex;
  try {
    tex = renderer.generateTexture(src);
  } catch {
    card.accept(target, onComplete);
    return;
  }

  const ROWS = 24;
  const mesh = new MeshPlane({ texture: tex, verticesX: 2, verticesY: ROWS });
  mesh.position.set(src.x, src.y);
  parent.addChild(mesh);
  src.visible = false;

  const t = mesh.toLocal(target as PointData); // 目标点（核心）在网格本地坐标
  const texW = tex.width;
  const texH = tex.height;
  const attr = mesh.geometry.getAttribute("aPosition");
  const buffer = attr.buffer;
  const data = buffer.data as Float32Array;

  const D = 0.55; // 漏斗颈的"行延迟"展开度：越大颈越长
  const state = { p: 0 };
  gsap.to(state, {
    p: 1,
    duration: 0.6,
    ease: "power2.in",
    onUpdate: () => {
      const p = state.p;
      for (let j = 0; j < ROWS; j += 1) {
        const v = j / (ROWS - 1); // 0=顶, 1=底
        const lead = 1 - v; // 靠近目标的"底端"先走（lead 小→更早收束）
        let lp = (p - lead * D) / (1 - D);
        lp = lp < 0 ? 0 : lp > 1 ? 1 : lp;
        lp = lp * lp * (3 - 2 * lp); // smoothstep
        const restY = v * texH;
        const y = restY + (t.y - restY) * lp; // 该行整体被拉向目标
        const cx = texW / 2 + (t.x - texW / 2) * lp; // 中线弯向目标
        const halfW = (texW / 2) * Math.pow(1 - lp, 1.5); // 越收束越窄→尖颈
        const li = (j * 2 + 0) * 2;
        const ri = (j * 2 + 1) * 2;
        data[li] = cx - halfW;
        data[li + 1] = y;
        data[ri] = cx + halfW;
        data[ri + 1] = y;
      }
      buffer.update();
      mesh.alpha = p > 0.82 ? Math.max(0, (1 - p) / 0.18) : 1;
    },
    onComplete: () => {
      mesh.destroy();
      tex.destroy(true);
      onComplete();
      card.destroy();
    }
  });
}
