// 渲染标记（零依赖）：材质 / 物体「进不进深度法线预通道」的标记与它的变化戳。
//
// 为什么单独一个文件：粒子、贴花、扬尘、编辑器网格这些「只是给材质打个标」的地方，
// 以前都从 Script_Post 拿 MarkNoPrepass —— 一行 import 就把整条后处理管线（体积雾、
// 天空、GI、地形拖痕……）拖进了特效、主菜单与独立工具的模块图。标记本身只是改一个
// 布尔量再报一声，所以放在这里；预通道（Script_PostPrepass）读同一个戳。
// Script_PostPrepass / Script_Post 照旧再导出这几个名字，老的调用点不用改。

/**
 * 预通道归属的标记戳。预通道把「谁要藏出这一趟」的分类结果缓存起来，
 * 场景结构变化由 childadded / childremoved 自己报，改标记（allowOverride、前景根）
 * 不经过场景结构，只能在这里报一声。
 */
let markStamp = 0;

/** 现在的标记戳（预通道比较它决定要不要重新分类）。 */
export function PrepassMarkStamp() { return markStamp; }

/** 直接改 allowOverride / skipNormalDepth 而没走下面的标记函数时，调它报一声。 */
export function InvalidatePrepassSkip() { markStamp += 1; }

/**
 * 把一份材质排除在深度法线预通道之外（allowOverride = false：不换覆盖材质）。
 * 规矩：任何半透明的、加性混合的、billboard 的东西，建完材质立刻调这个。
 * 铺满大片屏幕的对象还要挂 `userData.skipNormalDepth = true`（见 Script_PostPrepass）。
 */
export function MarkNoPrepass(material) {
  if (!material) return material;
  if (Array.isArray(material)) { material.forEach(MarkNoPrepass); return material; }
  material.allowOverride = false;
  markStamp += 1;
  return material;
}

/** 会动的不透明物体：预通道每帧重写它的速度（标记挂在对象上）。 */
export function MarkDynamicPrepass(object) {
  if (!object || !object.isMesh || object.userData.prepassDynamic) return object;
  object.userData.prepassDynamic = true;
  return object;
}
