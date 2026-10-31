// 「白盒」的样子（纯数据，零 three 依赖 —— 契约 2）。
//
// 2026-10-31 用户：白盒本身是一个看起来像白盒的场景，不是一个画质开关。所以这里只有材质的数：
// 灰表面 + 米格线（Script_WhiteboxGrid.MakeWhiteboxGridPatch 读 WHITEBOX_MATERIAL）、蓝灰水色、
// 白盒编辑器的补光与河沟示意。装到材质上的函数在 Script_WhiteboxMaterial.mjs。
// 画质档（low / medium / high / ultra）在 Data_Tuning_Graphics，白盒编辑器走和游戏同一套渲染管线。

/**
 * 白盒材质：中性灰表面 + 世界坐标米格线（程序化，不要贴图 / UV）。
 * surfaceColor 灰盒表面色；gridColor 线色；gridSize 格距（米）；gridLineWidth 线宽（米）。
 * 场景编辑器（Script_SceneEditor）与白盒编辑器共用同一份数。
 */
export const WHITEBOX_MATERIAL = Object.freeze({
  surfaceColor: "#909397", gridColor: "#55585d", gridSize: 1, gridLineWidth: 0.012,
  roughness: 1, metalness: 0,
});

// 白盒水面约定（2026-09-30）：水面不画成灰色米制网格（读起来是一条灰公路），
// 而是固定的蓝灰水色 + 掠射角天空色反光（菲涅耳）+ 一点太阳高光（粗糙度低）。不画网格。
// 材质见 Script_WhiteboxMaterial.MakeWhiteboxWaterMaterial。
export const WHITEBOX_WATER = Object.freeze({ color: "#4d6f86", sheen: "#c4d6e2", sheenStrength: 0.85,
  sheenPower: 3, sheenMax: 0.72, roughness: 0.14, metalness: 0 });

// 白盒关卡编辑器（?editor=blockout）在正片光照下的补光倍率（2026-10-20）：乘在本关天光的 Global SH（probe）与
// 环境底色（ambient）上（Script_Light.SetFillBoost），换天光后照样生效。第一关白昼档的阴影侧是照概念图压暗的
//（SH 0.42、底色 0.18 对 4.6 的太阳），编辑器里背光的墙、沟壁、木梁一片死黑，摆位置看不清。只管编辑器，正片不吃。
// 量过（10-20，high 画质、第一关旧版 01-2）：1/1 → 4/6 时最暗四分之一像素从 48 抬到 67，近黑（<20）占比 10.7% → 4.3%。
// 10-20 晚：用户嫌 4/6 太亮（「间接光是现在的 30–40% 左右差不多」），两项一起乘 0.35 → 1.4 / 2.1。
// 10-31 起白盒编辑器不再有白盒画质档，一律走这份补光。
export const BLOCKOUT_EDITOR_FILL = Object.freeze({ probe: 1.4, ambient: 2.1 });

// 白盒关卡编辑器里的河沟示意（2026-10-22，用户：「河汊子最好简单的表现一下他的材质，不然我想象不出来」）。
// 只管编辑器（Script_EditorBlockoutCreek）：场景文件里 semantic "water" 的块顶面铺浑水贴图；地面上**挨着水块的那一圈**
// 混进湿泥贴图，其余地面照旧高度色带 + 米格线。「挨着水的一圈」按水块自己认，不针对哪一关写坐标：
//   near  = 顶点到水块脚印的水平距离 ≤ reachInnerM 算满，到 reachM 渐淡到 0；
//   low   = 顶点比水面高不到 bandLoM 算满（沟壁、沟底、岸沿），到 bandHiM 渐淡到 0；
//   steep = 坡度（1 − 法线 y）从 slopeLo 起算、到 slopeHi 算满（水边的陡坎不管多高都是泥）；
//   泥权重 = near × max(low, steep)，写进地面顶点属性 blockoutMud，着色器按它混贴图、降粗糙度（湿泥发亮）。
// 河汊子（L0610_RIVER）：沟深 3、水深 1 → 岸沿比水面高 2 m（bandLoM 内算满）、壁 2.5 m 在 reachInnerM 内；岸上再往外 4.5 m 渐淡。
// 贴图是编辑器专用的反照率（Texture/Editor/，Data_TextureManifest 的 EditorCreekMud / EditorCreekWater），改图就改 ?v=。
export const BLOCKOUT_CREEK_LOOK = Object.freeze({
  mud: Object.freeze({ url: "./Texture/Editor/Texture_EditorCreekMudBase.webp?v=20261022150000", tileM: 1.5, tint: "#ffffff", roughness: 0.55 }),
  water: Object.freeze({ url: "./Texture/Editor/Texture_EditorCreekWaterBase.webp?v=20261022150000", tileM: 2.0, tint: "#ffffff", opacity: 0.88, roughness: 0.3 }),
  reachInnerM: 3.5, reachM: 8, bandLoM: 2.2, bandHiM: 3.4, slopeLo: 0.3, slopeHi: 0.55,
});
