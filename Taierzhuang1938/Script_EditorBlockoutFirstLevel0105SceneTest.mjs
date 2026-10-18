// Script_EditorBlockoutFirstLevel0105SceneTest.mjs —— 01–05 白盒场景生成器的 node 回归（只给场景包自验用）
// 跑法：node Taierzhuang1938/Script_EditorBlockoutFirstLevel0105SceneTest.mjs
// 查：生成两次逐字相同（generatedAt 固定）、过 ValidateBlockoutScene、锚点处高度、沟底宽、坡顶视线、塌洞净空。

import assert from "node:assert/strict";
import { ValidateBlockoutScene } from "./Script_EditorBlockoutConfig.mjs";
import { HeightGridSampler } from "./Script_EditorBlockoutLevels.mjs";
import { BuildFirstLevel0105Scene, FloorWidthAt, SightBlock, NaturalHeight } from "./Script_EditorBlockoutFirstLevel0105Scene.mjs";
import { L0105_PLACES as P, L0105_HEIGHTS as H, L0105_TRENCH_SECTION as S } from "./Data_EditorBlockoutFirstLevel0105Space.mjs";

const opts = { commit: "test", generatedAt: "2026-10-18T00:00:00.000Z" };
const a = await BuildFirstLevel0105Scene({ ...opts, notes: [] });
const b = await BuildFirstLevel0105Scene({ ...opts, notes: [] });
assert.equal(JSON.stringify(a), JSON.stringify(b), "生成两次要逐字相同");
const check = ValidateBlockoutScene(a);
assert.ok(check.ok, check.errors.join("; "));

const sample = HeightGridSampler(a.terrain);
const Near = (got, want, tol, what) => assert.ok(Math.abs(got - want) <= tol, `${what}: ${got.toFixed(2)} vs ${want}±${tol}`);
const Cut = (p) => NaturalHeight(p.x, p.z) - sample(p.x, p.z);
Near(Cut(P.pit), P.pit.floorDepth, 0.05, "坑深");
Near(Cut(P.dugout), P.dugout.floorDepth, 0.05, "洞深");
Near(Cut(P.fireC), P.fireC.depth, 0.08, "散兵坑深");
Near(Cut({ x: 12.5, z: 32 }), S.traffic.depth, 0.15, "交通沟深");
Near(Cut({ x: 42, z: BranchZ(42) }), S.branch.depth, 0.15, "支沟深");
Near(Cut(P.crest), S.trafficAtCrest.depth, 0.15, "坡顶沟深");
Near(sample(P.crest.x + 12, P.crest.z) - sample(P.assembly.x, P.assembly.z), H.crest - H.assemblyFloor, 0.35, "坡顶−集结处");
assert.ok(Cut(P.assemblyEntry) < 0.3, "交通沟在集结处入口爬出来");

for (const [x, z, nx, nz, min] of [[-30.5, 0, 0, 1, 3.4], [56, 0, 0.5, 1, 3.4], [-62, -12, 1, 0, 3.4], [12.5, 32, 23, 1, 3.4],
  [26, 76.6, 42, -18, 3.4], [35, 128, 1, 0, 3.4], [42, 65.8, 2.6, 41.1, 3.4]]) {
  const r = FloorWidthAt(sample, x, z, nx, nz);
  assert.ok(r.width >= min, `沟底宽 (${x},${z}) ${r.width} < ${min}`);
}
for (const from of [{ x: 35, z: 158 }, { x: 20, z: 148 }, { x: 52, z: 168 }, { x: 35, z: 146 }]) {
  for (const to of [{ x: 0, z: -7 }, { x: 0, z: 0 }, { x: 40, z: 0 }]) {
    const r = SightBlock(sample, { ...from, eye: 1.6 }, { ...to, eye: 1.5 });
    assert.ok(r.block > 0.5, `集结处 (${from.x},${from.z}) 看得见前沿 (${to.x},${to.z})`);
  }
}
const all = [...a.blocks, ...a.gates];
const byId = new Map(all.map((x) => [x.id, x]));
const floor = sample(P.dugout.x, P.dugout.z);
const roof = byId.get("DugoutRoofTimber");
assert.ok(roof.y - roof.h / 2 - floor >= 2.1, "洞里净高 ≥ 2.1");
const beam = byId.get("DugoutCollapseBeam");
const gap = beam.y - beam.h / 2 - floor;
assert.ok(gap >= 0.3 && gap <= 0.5, `塌洞横木离地 ${gap}`);
assert.equal(byId.get("DugoutLintel").signal, "DugoutCollapsed");
assert.equal(byId.get("ParapetMiddle").signal, "PitShelled");
assert.ok(a.gates.every((g) => g.signal || g.appearSignal));
console.log(`ok：${a.blocks.length} 块 + ${a.gates.length} 随信号块，${a.terrain.cols}×${a.terrain.rows} 网格`);

function BranchZ(x) { return 67.1 + (64.5 - 67.1) * (x - 21.9) / (63 - 21.9); }
