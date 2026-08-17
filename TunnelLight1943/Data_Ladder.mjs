// 《地道里的光》—— 梯子的尺寸表：**画笔、玩法、爬梯骨架三处共用这一份**。
//
// 2026-08-17 用户退回爬梯：「你爬楼梯怎么和楼梯一点关联没有啊 就像是个平移一样」。
// 病根是三处各有各的梯子：Art.DrawShaft 按 15.4px±2.5 随手撒横档，Core 按 0.34m
// 一档响一声，Rig 拿一条正弦相位甩胳膊——手脚落在哪儿跟横档在哪儿毫无关系，
// 人当然像贴着梯子平移。从此横档的**世界坐标**只在这儿算一次：画笔照它画、
// 骨架照它把手脚放上去、Core 照它一档一档响。
//
// 纯数据纯函数（不 import three/Art），node 里能测。

export const LADDER = {
  pitch: 0.34,        // 横档间距（米）。比老的 0.32 高一点（2026-08-17 用户：「格子高一些，爬的
                      // 动作就少一些，更干脆」），但**不能再高**：两脚踩在相邻两档上时，上面那只脚离胯
                      // 只有「腿长 − 一档」——第一章的柱子腿 0.50m，0.40 一档时上面那条腿膝盖顶到胯，
                      // 大腿翻过水平线，实拍读成青蛙腿/反关节（2026-08-18 退回）。0.34 留 0.15m 的余量。
                      // 自家伐的树杆凿的，见 jitter
  jitter: 0.030,      // 每道横档上下抖多少（±米）——匀的读成印刷品，抖太大脚踩不稳
  topRung: 0.09,      // 第一道横档高出上层地面多少（伸手扶的那道，脚不踩）
  proudL: 0.26,       // 两根梯梃高出地面：左高右低，一样高就连成一条横线
  proudR: 0.19,
  railHalf: 0.25,     // 半个梯宽（两梃相距 0.5m）
  footClear: 0.06,    // 离地面这么近的横档脚不踩（直接踩地）。给大了最后一步要跨半米，胯一沉手就够不着上头那档
};

// 稳定的伪随机（同一架梯子每次算出来的横档一样）：不吃 Art.Rnd，Core/测试也能算
function Hash01(str, i) {
  let h = 2166136261 >>> 0;
  const s = `${str}#${i}`;
  for (let k = 0; k < s.length; k += 1) {
    h ^= s.charCodeAt(k);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return ((h >>> 8) & 0xffffff) / 0x1000000;
}

/**
 * 一架梯子的全部落点（世界 y，米）。
 *   rungs — 每道横档的 y，从上往下；第一道在上层地面之上 topRung
 *   hands — 手能扒的：两梃顶头（当一处算）＋全部横档
 *   feet  — 脚能踩的：上层地面、离地面够远的横档、下层地面
 * `id` 决定抖动的样子（DrawShaft 传的就是竖井 id）。
 */
export function LadderHolds(topY, botY, id = "ladder") {
  const rungs = [];
  let y = topY + LADDER.topRung;
  for (let i = 0; y > botY + 0.04; i += 1) {
    rungs.push(i === 0 ? y : y + (Hash01(id, i) - 0.5) * 2 * LADDER.jitter);
    y -= LADDER.pitch;
  }
  const railTop = topY + (LADDER.proudL + LADDER.proudR) * 0.5;
  const feet = [topY, ...rungs.filter((r) => r < topY - LADDER.footClear && r > botY + LADDER.footClear), botY];
  const hands = [railTop, ...rungs];
  return { top: topY, bot: botY, rungs, hands, feet };
}
