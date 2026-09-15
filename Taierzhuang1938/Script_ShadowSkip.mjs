// 《台儿庄：血战滕县》阴影烘焙的子树跳过。
//
// 三方 `WebGLShadowMap.render` 对每一张要烘的图都从场景根**递归走完全部节点**，
// 逐节点做层测试与视锥测试，然后才看 `castShadow`。也就是说 `castShadow = false`
// 只省 draw，不省遍历：一具 24 m 外的人物骨架（约 110 个节点）一个像素影子都不投，
// 却仍然每帧被阴影 pass 走两遍（近级每帧 + 远级轮转）。转运点那一段三十来具
// 任务骨架、四千多个节点，光阴影的这两趟递归就要几毫秒。
//
// 唯一能剪掉递归的口子是 `object.visible === false`（renderObject 第一行就返回）。
// 所以这里维护一张登记表：**整棵子树一个投影体都没有的根**。烘阴影那一刻把它们
// 临时藏掉，烘完立刻还原，别的 pass 与玩法代码看到的 visible 一个字不变。
//
// 登记的责任在子树的主人：`Actor.SetShadowEnabled(false)` 已经把子树里每个网格的
// castShadow 关掉（含挂在手骨下面的枪），关掉的同时登记；重新打开或 Dispose 时注销。
// 这正好绕开 docs/Data_TechRenderPipeline.md §17.10 第 1 条担心的「藏骨骼根会连手上
// 的枪一起藏」—— 这里藏的子树本来就没有任何投影体，枪也在关掉之列。
//
// 与另外两层包装（Script_Csm 的 BakeMeter、Script_Profiler 的分段计时）可以任意叠：
// 它们各自 `original = shadowMap.render` 再包一层，谁先装谁在里面。本模块在
// renderer 建好后立刻装（Script_Main），所以它在最里层，计量与分段都照常读到烘焙本身。
//
// 不 import three：只碰 `visible` 位与 `renderer.shadowMap.render`。

const _roots = new Set();
const _hidden = [];
let _enabled = true;

/** 总开关（取证 A/B 用：同一页面里开/关交替量，别拿两次开机的墙钟比）。 */
export function SetShadowSkipEnabled(enabled) { _enabled = enabled !== false; }
export function ShadowSkipEnabled() { return _enabled; }

/**
 * 登记 / 注销一棵「没有投影体」的子树根。
 * @param {import("three").Object3D|null|undefined} root
 * @param {boolean} skip true = 烘阴影时藏掉；false = 注销
 */
export function SetShadowSkip(root, skip) {
  if (!root) return;
  if (skip) _roots.add(root);
  else _roots.delete(root);
}

/** 当前登记了多少棵子树（取证与测试读它）。 */
export function ShadowSkipCount() { return _roots.size; }

/** 测试用：清空登记表。 */
export function ResetShadowSkip() { _roots.clear(); _hidden.length = 0; }

/**
 * 包一层 `renderer.shadowMap.render`：烘之前藏掉登记表里**当前可见**的根，烘完
 * 只还原自己藏过的那几棵（本来就不可见的一棵不碰，谁藏的谁负责）。
 * 三方自己的早退条件（总闸关 / 没灯 / 这帧不烘）照抄一遍：那种帧一次 visible
 * 都不翻，免得白做。重复调用幂等。
 */
export function InstallShadowSkip(renderer) {
  const shadowMap = renderer?.shadowMap;
  if (!shadowMap || typeof shadowMap.render !== "function" || shadowMap.render.shadowSkipInstalled) return false;
  const original = shadowMap.render;
  const wrapped = function ShadowSkipRender(lights, scene, camera) {
    if (!_enabled || shadowMap.enabled === false || !lights || lights.length === 0
      || (shadowMap.autoUpdate === false && shadowMap.needsUpdate === false) || _roots.size === 0) {
      return original.call(this, lights, scene, camera);
    }
    _hidden.length = 0;
    for (const root of _roots) {
      if (root.visible) { root.visible = false; _hidden.push(root); }
    }
    try {
      return original.call(this, lights, scene, camera);
    } finally {
      for (const root of _hidden) root.visible = true;
      _hidden.length = 0;
    }
  };
  wrapped.shadowSkipInstalled = true;
  shadowMap.render = wrapped;
  return true;
}
