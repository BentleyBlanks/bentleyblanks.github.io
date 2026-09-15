// Script_ShadowSkip 的纯 Node 回归：不起浏览器，拿一个假的 shadowMap 对象断行为。
//
//   1. 登记的根在烘阴影那一刻不可见，烘完立刻恢复；本来就不可见的根不被碰；
//   2. 三方的早退条件（总闸关 / 没灯 / 这帧不烘 / 表为空）下一次 visible 都不翻；
//   3. 烘焙抛错也要还原；
//   4. 重复安装幂等，注销后不再藏；
//   5. 与「先装的别的包装」叠加：外层包装看到的还是完整烘焙。
//
// 用法：node Taierzhuang1938/Script_ShadowSkipTest.mjs

import { InstallShadowSkip, SetShadowSkip, ShadowSkipCount, ResetShadowSkip } from "./Script_ShadowSkip.mjs";

let failed = 0;
const Check = (label, ok, detail = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${ok || !detail ? "" : `  ← ${detail}`}`);
  if (!ok) failed += 1;
};

function MakeRenderer() {
  const seen = [];
  const shadowMap = {
    enabled: true, autoUpdate: false, needsUpdate: true,
    render(lights, scene) {
      // 记录烘那一刻每棵根的可见性（这正是三方 renderObject 会看到的位）
      seen.push(scene.children.map((root) => root.visible));
      if (scene.throwOnce) { scene.throwOnce = false; throw new Error("bake failed"); }
    },
  };
  return { renderer: { shadowMap }, seen };
}
const Root = (visible = true) => ({ visible, children: [] });

// --- 1. 藏与还原 ---------------------------------------------------------
{
  ResetShadowSkip();
  const { renderer, seen } = MakeRenderer();
  Check("安装返回 true", InstallShadowSkip(renderer) === true);
  const far = Root(true), near = Root(true), alreadyHidden = Root(false);
  const scene = { children: [far, near, alreadyHidden] };
  SetShadowSkip(far, true);
  SetShadowSkip(alreadyHidden, true);
  Check("登记两棵", ShadowSkipCount() === 2, String(ShadowSkipCount()));
  renderer.shadowMap.render([{}], scene, null);
  Check("烘那一刻：登记的可见根被藏、未登记的照常", JSON.stringify(seen[0]) === JSON.stringify([false, true, false]), JSON.stringify(seen[0]));
  Check("烘完立刻还原", far.visible === true && near.visible === true);
  Check("本来就不可见的根没被翻成可见", alreadyHidden.visible === false);
}

// --- 2. 早退条件下一次都不翻 ---------------------------------------------
{
  ResetShadowSkip();
  const { renderer, seen } = MakeRenderer();
  InstallShadowSkip(renderer);
  const far = Root(true);
  const scene = { children: [far] };
  SetShadowSkip(far, true);
  renderer.shadowMap.needsUpdate = false;
  renderer.shadowMap.render([{}], scene, null);
  Check("这帧不烘：不藏", seen.at(-1)[0] === true);
  renderer.shadowMap.needsUpdate = true;
  renderer.shadowMap.render([], scene, null);
  Check("没灯：不藏", seen.at(-1)[0] === true);
  renderer.shadowMap.enabled = false;
  renderer.shadowMap.render([{}], scene, null);
  Check("总闸关：不藏", seen.at(-1)[0] === true);
  renderer.shadowMap.enabled = true;
  SetShadowSkip(far, false);
  renderer.shadowMap.render([{}], scene, null);
  Check("注销后不再藏", seen.at(-1)[0] === true && ShadowSkipCount() === 0);
}

// --- 3. 抛错也还原 ---------------------------------------------------------
{
  ResetShadowSkip();
  const { renderer } = MakeRenderer();
  InstallShadowSkip(renderer);
  const far = Root(true);
  const scene = { children: [far], throwOnce: true };
  SetShadowSkip(far, true);
  let threw = false;
  try { renderer.shadowMap.render([{}], scene, null); } catch (error) { threw = true; }
  Check("烘焙抛错向外传", threw);
  Check("抛错之后根已还原", far.visible === true);
}

// --- 4. 幂等 ---------------------------------------------------------------
{
  ResetShadowSkip();
  const { renderer } = MakeRenderer();
  InstallShadowSkip(renderer);
  const first = renderer.shadowMap.render;
  Check("重复安装返回 false 且不再包一层", InstallShadowSkip(renderer) === false && renderer.shadowMap.render === first);
  Check("没有 shadowMap 时安全返回 false", InstallShadowSkip({}) === false && InstallShadowSkip(null) === false);
}

// --- 5. 与外层包装叠加 -------------------------------------------------------
{
  ResetShadowSkip();
  const { renderer, seen } = MakeRenderer();
  InstallShadowSkip(renderer);
  const inner = renderer.shadowMap.render;
  let outerCalls = 0;
  renderer.shadowMap.render = function Outer(lights, scene, camera) { outerCalls += 1; return inner.call(this, lights, scene, camera); };
  const far = Root(true);
  const scene = { children: [far] };
  SetShadowSkip(far, true);
  renderer.shadowMap.render([{}], scene, null);
  Check("外层包装照常调到烘焙，烘那一刻仍然藏了", outerCalls === 1 && seen.at(-1)[0] === false && far.visible === true);
}

console.log(failed ? `\n${failed} 条失败` : "\n全部通过");
process.exit(failed ? 1 : 0);
