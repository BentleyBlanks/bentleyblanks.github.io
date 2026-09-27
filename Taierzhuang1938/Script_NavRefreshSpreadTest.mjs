// Script_NavRefreshSpreadTest.mjs —— 导航网格「摊到后面几帧」的重刷（纯 Node，毫秒级）
//
// NavGrid.Refresh(battlefield, { spread: true }) 把栅格化与连通分量都摊到后面的 BeginFrame
// （2026-09-27：01 洞口塌方那一帧一次做完要 2.7 ms 栅格 + 16–19 ms 分量）。验：
//   1. 摊完之后的 blocked / component / mainComponent / openCells 与一次做完逐格相同；
//   2. 摊完之前读到的仍是上一版（新墙还没生效，旧的分量不变）；
//   3. 半路再来一次不摊的 Refresh（破坏层）会取消那趟摊，结果与一次做完相同；
//   4. 每一帧推进的耗时受 componentBudgetMs 限制（按帧数下限粗验：一帧做不完）。
//
// 用法：node Taierzhuang1938/Script_NavRefreshSpreadTest.mjs

import { NavGrid } from "./Script_Navigation.mjs";

let failed = 0;
const Check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || !detail ? "" : `  ← ${detail}`}`);
  if (!ok) failed += 1;
};

let seed = 5;
const Rand = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
const Box = (x, z, w, d, h = 2) => ({ min: [x - w / 2, 0, z - d / 2], max: [x + w / 2, h, z + d / 2] });
function Field() {
  const colliders = [];
  for (let i = 0; i < 6000; i++) colliders.push(Box(Rand() * 380 - 190, Rand() * 380 - 190, .3 + Rand() * 3, .3 + Rand() * 3, Rand() < .15 ? .1 : 2));
  // 一道几乎封死的墙，塌方要把缺口堵上
  for (let z = -150; z <= 150; z += 2) if (Math.abs(z) > 3) colliders.push(Box(20, z, 1, 2.2));
  return { bounds: { minX: -200, maxX: 200, minZ: -200, maxZ: 200 }, colliders, GroundHeight: (x, z) => Math.sin(x * .01) * .2 + Math.cos(z * .013) * .2 };
}
const Same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
const State = (nav) => ({ blocked: nav.blocked.slice(), component: nav.component.slice(), main: nav.mainComponent, size: nav.mainSize, open: nav.openCells, count: nav.componentCount });
const Equal = (a, b) => Same(a.blocked, b.blocked) && Same(a.component, b.component) && a.main === b.main && a.size === b.size && a.open === b.open && a.count === b.count;

const field = Field();
const spread = new NavGrid(field), once = new NavGrid(field);
const before = State(spread);
// 塌方：堵上缺口、再多几块
field.colliders.push(Box(20, 0, 1.2, 7), Box(-40, 10, 6, 6));
once.Refresh(field);
const want = State(once);
spread.componentBudgetMs = .05;
spread.Refresh(field, { spread: true });
const mid = State(spread);
Check("摊完之前读到的仍是上一版", Equal(mid, before));
let frames = 0;
while ((spread.rasterJob || spread.componentJob) && frames < 100000) { spread.BeginFrame(); frames++; }
Check("摊完之后与一次做完逐格相同（blocked / component / 主分量 / 可走格数）", Equal(State(spread), want),
  JSON.stringify({ main: [spread.mainComponent, want.main], open: [spread.openCells, want.open] }));
Check("确实摊到了多帧", frames > 2, `frames ${frames}`);
Check("新墙生效：缺口已堵", !spread.Walkable(20, 0) && !Equal(want, before));

// 半路被一次不摊的 Refresh 打断
field.colliders.push(Box(60, 60, 8, 8));
const once2 = new NavGrid(field);
spread.Refresh(field, { spread: true });
spread.BeginFrame();
spread.Refresh(field);
Check("半路来一次不摊的重刷：取消那趟摊、结果与一次做完相同", !spread.rasterJob && !spread.componentJob && Equal(State(spread), State(once2)));

// 摊的途中位图再次换版也不串用同一张数组
spread.Refresh(field, { spread: true });
while (spread.rasterJob || spread.componentJob) spread.BeginFrame();
spread.Refresh(field, { spread: true });
while (spread.rasterJob || spread.componentJob) spread.BeginFrame();
Check("连续两趟摊，结果仍一致", Equal(State(spread), State(once2)));

console.log(failed ? `FAIL ${failed} 项` : "PASS NavRefreshSpread：摊到多帧的栅格化与连通分量和一次做完逐格相同、摊完前读旧版、可被打断");
process.exit(failed ? 1 : 0);
