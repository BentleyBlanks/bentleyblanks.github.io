# 白盒画质与美术验收入口

2026-09-29 起，未明确选择画质时默认 **whitebox**。旧 `graphics_v1` 的 TAA、阴影、GI 等存档不会覆盖白盒默认；用户新选择的预设会保存。URL 的 `quality` 优先于保存的预设。

## 玩家入口

游戏现有 **画质设置 → 白盒（默认） → 编辑白盒画质**。编辑区按材质、光照 Feature、渲染 Pass 分组，支持表面色、背景色、分辨率、恢复默认和导出 JSON。改动点击「保存并应用白盒」后刷新生效；未保存草稿不改当前画面。普通 low / medium / high / ultra 仍使用现有的画质调节页。

白盒采用用户参考图的 **灰色网格测试材质**，不是纯白。建筑、植被、场景道具、水面及后来生成的场景实体不使用原美术贴图，改为默认 1 米一格的灰色程序网格；线宽默认 12 毫米。网格按世界坐标三向投影，不依赖模型 UV，不随实例缩放拉伸；远处做导数抗锯齿与淡出。编辑区可调网格开关、大小、线宽、底色和线色，无需生成贴图资产。

**水面与镂空卡片是两个例外（2026-09-30）：**

* **水面**（网格名含 `water`，第一关的 `FirstLevelWhitebox_Water`）不再画成灰色米制网格 —— 灰网格读起来是一条灰公路。白盒画质下水面是固定的
  **蓝灰水色**（`WHITEBOX_WATER.color #4d6f86`）+ 掠射角**天空色反光**（菲涅耳权重，反光色 `#c4d6e2`、幂 3、上限 0.72）+ 低粗糙度（0.14）的太阳高光；
  不画网格，也不依赖环境贴图 / 预通道（`Script_WhiteboxRendering.MakeWhiteboxWaterPatch`，缓存键 `whiteboxWater1`）。不是可编辑项，数值在 `Data_Tuning_Whitebox.WHITEBOX_WATER`。
  没选 muddyRiver 着色：那条河水着色靠预通道深度和 SSR，白盒帧图里都没有。
* **镂空卡片**（植被十字面片、壕沟草、桁架镂空节 —— `alphaTest > 0` 且带 `map` / `alphaMap` 的材质）保留 alpha 裁切：白盒替换材质带上原来的
  `map`/`alphaMap`/`alphaTest`/`alphaToCoverage`。**2026-10-01 起卡片保留原贴图色**（集成者验收：默认画质下 18_2 的芦苇 / 草是满地白刺 —— 旧做法把 rgb 换成表面色 `#909397`，
  在白盒的中性光（ambient 1.8 + sun 1.4）下被照成近白，草叶剪影在深色泥地上像一地白刺）：白底乘原贴图，再按 `WHITEBOX_CARDS.desaturate`（0.4，0 = 原色、1 = 灰）略去饱和、
  乘 `WHITEBOX_CARDS.brightness`（0.5，中性光下的提亮折算）；只有 `alphaMap`、没有颜色贴图的卡片统一成 `WHITEBOX_CARDS.fallbackColor`（暗橄榄枯黄 `#7a7547`）。
  卡片上**不再叠米制灰网格**（网格线画在草叶上只是噪点）。缓存键 `whiteboxCard2`。
  开关：`WHITEBOX_CONTROLS.cardTextures`（「镂空卡片保留原贴图色」，默认开；关 = 回到 2026-09-30 的统一表面色卡片 `whiteboxCard1`）。数值在 `Data_Tuning_Whitebox.WHITEBOX_CARDS`。
  `Inspect()` 之外可读 `post.whiteboxScene.stats.cutoutMeshes / waterMeshes`。
  **例外清单的登记项**：植被 / 草卡片属于「场景零原贴图」规则的例外之一（另一个是水面）；`Script_WhiteboxQualityTest`（开关默认值、数值范围、fallback 比表面色暗）与
  `Script_WhiteboxQualityBrowserTest --presentation-only`（每张卡片材质保留 alphaTest 与贴图、不是表面色、无网格）守着。

**地形、角色、敌军、第一人称身体/手和手持装备默认保留原材质与贴图。** 人物与装备由独立 `characterTextures` 开关控制，不依赖场景的 `assetTextures`。地形以对象上的 `deformableTerrain`、`terrainTile` 或 `whiteboxTerrain` 标记识别；弹坑替换地块也保留贴图，不能用「材质名字带泥土」放行场景道具。透明粒子/贴花和天空默认不画；HUD 与任务系统继续工作。

默认每帧只运行 **main → whiteboxOutput**：中性基础灯光、几何深度测试、太阳级联阴影（烘焙在 main 那一次出画里）、线性色转 sRGB 和剧情黑场/眼皮。高级效果与预通道/HZB、GTAO/SSIL、SSR、室内遮蔽、自阴影、GI、簇光、大气、体积雾、TAA/FXAA、Bloom、景深、运动模糊、自动曝光、调色均关闭。调试工具主动打开时仍允许线框/调试叠加。

**太阳阴影（2026-10-02 起默认开，用户要求）**：`shadows` 默认 true。中性光照旧，不切到整套关卡灯光：出画时只把关卡太阳的级联灯（`Script_Csm` 的 `SunCascade0..N`，Script_Main 以 `sunCascades` 交给 `WhiteboxSceneRenderer`）留着投影，第 0 盏换成白色，白盒环境光与它按 `WHITEBOX_LIGHTING.shadowAmbient` / `shadowSun`（1.25 / 2.3）配比，白盒自己那盏不投影的太阳收起；其余关卡灯照旧藏掉。方向跟关卡太阳走（第一关高度约 52°），受光地面亮度与旧口径（ambient 1.8 + sun 1.4）基本相同，影子处约为受光面的四成。规则在 `Script_WhiteboxRendering._LightingMode`，预热提交与逐帧出画共用。之前的存档把每个默认值都写了出去，存着的 `shadows:false` 按旧默认迁移（`WHITEBOX_DEFAULTS.schema` = 2，`LoadWhiteboxConfig`）；新存档里玩家自己关掉的保留。

这是一项渲染表现配置，资产、骨骼、几何/碰撞与加载预算沿用 high。原始材质在出画后原样还回，材质切换不修改资产文件或模拟状态。现有后期管线的中间资源仍可预留，关闭表示不执行对应 Feature/Pass，不承诺免下载所有资产或零显存占用。无 alpha 贴图的植被卡片会显示其真实几何轮廓；有 alpha 贴图的卡片按上面的规则保留裁切。

## Agent 查询与调整

**美术迭代、调色、贴图、灯光和效果验收必须显式使用 `?quality=high`（或 ultra）。** 不要拿默认白盒截图判断贴图/光照是否生效，也不要为了美术截图修改全局默认值。场景入口参数 `whitebox=p012` 选择第一关，与画质 `quality=whitebox` 是两件事。

```js
// 当前配置、配置字段、允许的 pass 与最后一帧真正跑过的 pass
Tengxian.GraphicsProfile.Inspect()

// 保存下一次启动的白盒配置；不影响当前帧
Tengxian.GraphicsProfile.ConfigureWhitebox({ ssao: true, surfaceColor: '#cbd0d6' })

// 保存并立即以白盒重新载入
Tengxian.GraphicsProfile.ConfigureWhitebox({ taa: true }, { reload: true })

// 灰盒网格样式；人物及手持装备独立保留贴图
Tengxian.GraphicsProfile.ConfigureWhitebox({
  grid: true, gridSize: 1, gridLineWidth: 0.012,
  surfaceColor: '#909397', gridColor: '#55585d', characterTextures: true
}, { reload: true })

// 显式恢复美术表现；保留任务、阶段等其他 URL 参数
Tengxian.GraphicsProfile.Select('high')
Tengxian.GraphicsProfile.Select('whitebox')
Tengxian.GraphicsProfile.ResetWhitebox({ reload: true })
Tengxian.GraphicsProfile.ExportWhitebox()
```

数据源是 [Data_Tuning_Whitebox.mjs](../Data_Tuning_Whitebox.mjs)：`WHITEBOX_DEFAULTS`、控件表、`WhiteboxPassPlan`、运行时画质映射。UI 与 API 共用校验和本地存储 `tengxian1938_whitebox_v1`。导出的 JSON 可作为 agent 修改这张默认表的依据；浏览器本地编辑不会自动发布成全站默认。

开关依赖会自动接入：SSR → 预通道/HZB/颜色历史；SSIL/室内天光 → GTAO；TAA/景深/运动模糊/雾 → 预通道；光晕 → Bloom；GI/簇光 → 关卡灯光；阴影 / 接触阴影 / 第一人称自阴影 → 关卡太阳的级联灯（中性光不变，见上）。读取 `Inspect().renderedPasses` 区分「配置允许」与「场景满足条件，实际执行」。关闭白盒资产材质时保留破坏裁切与已启用的光照补丁，不保留纹理和风化；完整材质细节验收请恢复资产材质。

新 Feature 必须登记数据与控件映射，新 Pass 必须显式加入白盒允许表，否则在白盒下默认关闭。新增物件自动服从材质替换（逐帧替换按 scene 顶层子树缓存成清单，add / remove / attach 只重建那一棵、源材质换引用的网格当帧重判，2026-10-02 起；分类标记要在挂进场景之前设好，挂上之后才改的调 `post.whiteboxScene.Invalidate()`）；仅真正的地形可标 `whiteboxTerrain`。人物工厂、第一人称身体/视模的共用根节点标 `userData.whiteboxCharacter = true`，后续骨骼挂件自动继承；ActorBatch / Crowd 的场景批次带同一标记。子树可用 `false` 明确回到场景类别（例如开场人物根下的坐箱），不按单个人物或武器维护名单。LOD 在材质替换前更新，避免新显示的档位漏用场景网格。

着色器预热的提交编译（`renderer.compile`）必须套同一层替换：`Script_Main.CompileAsRendered` 调 `Begin(scene, camera, { compileRoots })`，藏着的网格也按同一规则换、白盒藏掉的特效不编。替换规则改了而提交那一侧没跟上，开机就会回到「提交的全白编、出画时同步现编」（2026-10-01 实测第一关冷开机多 27 s）。口径见 [渲染管线 §18.7](Data_TechRenderPipeline.md)。

旧配置缺少新字段时自动使用新默认；旧版默认表面色 `#d8dadd` 在缺少 `grid` 字段时迁移到灰色，用户自定义颜色保留。`Inspect().materials` 同时返回 `characterMeshes`、`terrainMeshes` 与 `whiteMeshes`，后者表示应用灰盒替代材质的数量。

## 验证

```powershell
node Taierzhuang1938/Script_WhiteboxQualityTest.mjs
node Taierzhuang1938/Script_WhiteboxQualityBrowserTest.mjs
node Taierzhuang1938/Script_WhiteboxShaderWarmTest.mjs
node Taierzhuang1938/Script_PostFrameGraphTest.mjs
node Taierzhuang1938/Script_SamplerBudgetTest.mjs --only=whitebox
node Taierzhuang1938/Script_EditorTest.mjs
```

专项浏览器门禁检查实际提交的灰盒网格材质、人物贴图、场景零原贴图（镂空卡片保留 alpha 与原贴图色的例外、水面走蓝灰水色不画网格）、地形保留、后加入的骨骼挂件、共享材质与还原；点击人物贴图开关并保存/刷新，再显式切 high 验证原管线。包括敌我双方持枪近景、场景和编辑面板截图；截图与读数在忽略目录 `tmp/WhiteboxQuality/`，不提交。
