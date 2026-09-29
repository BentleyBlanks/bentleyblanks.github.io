# 白盒画质与美术验收入口

2026-09-29 起，未明确选择画质时默认 **whitebox**。旧 `graphics_v1` 的 TAA、阴影、GI 等存档不会覆盖白盒默认；用户新选择的预设会保存。URL 的 `quality` 优先于保存的预设。

## 玩家入口

游戏现有 **画质设置 → 白盒（默认） → 编辑白盒画质**。编辑区按材质、光照 Feature、渲染 Pass 分组，支持表面色、背景色、分辨率、恢复默认和导出 JSON。改动点击「保存并应用白盒」后刷新生效；未保存草稿不改当前画面。普通 low / medium / high / ultra 仍使用现有的画质调节页。

白盒采用用户参考图的 **灰色网格测试材质**，不是纯白。建筑、植被、场景道具、水面及后来生成的场景实体不使用原美术贴图，改为默认 1 米一格的灰色程序网格；线宽默认 12 毫米。网格按世界坐标三向投影，不依赖模型 UV，不随实例缩放拉伸；远处做导数抗锯齿与淡出。编辑区可调网格开关、大小、线宽、底色和线色，无需生成贴图资产。

**地形、角色、敌军、第一人称身体/手和手持装备默认保留原材质与贴图。** 人物与装备由独立 `characterTextures` 开关控制，不依赖场景的 `assetTextures`。地形以对象上的 `deformableTerrain`、`terrainTile` 或 `whiteboxTerrain` 标记识别；弹坑替换地块也保留贴图，不能用「材质名字带泥土」放行场景道具。透明粒子/贴花和天空默认不画；HUD 与任务系统继续工作。

默认每帧只运行 **main → whiteboxOutput**：中性基础灯光、几何深度测试、线性色转 sRGB 和剧情黑场/眼皮。高级效果与预通道/HZB、GTAO/SSIL、SSR、室内遮蔽、CSM、自阴影、GI、簇光、大气、体积雾、TAA/FXAA、Bloom、景深、运动模糊、自动曝光、调色均关闭。调试工具主动打开时仍允许线框/调试叠加。

这是一项渲染表现配置，资产、骨骼、几何/碰撞与加载预算沿用 high。原始材质在出画后原样还回，材质切换不修改资产文件或模拟状态。现有后期管线的中间资源仍可预留，关闭表示不执行对应 Feature/Pass，不承诺免下载所有资产或零显存占用。无 alpha 贴图的植被卡片会显示其真实几何轮廓。

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

开关依赖会自动接入：SSR → 预通道/HZB/颜色历史；SSIL/室内天光 → GTAO；TAA/景深/运动模糊/雾 → 预通道；光晕 → Bloom；阴影/GI/簇光 → 关卡灯光。读取 `Inspect().renderedPasses` 区分「配置允许」与「场景满足条件，实际执行」。关闭白盒资产材质时保留破坏裁切与已启用的光照补丁，不保留纹理和风化；完整材质细节验收请恢复资产材质。

新 Feature 必须登记数据与控件映射，新 Pass 必须显式加入白盒允许表，否则在白盒下默认关闭。新增物件自动服从材质替换；仅真正的地形可标 `whiteboxTerrain`。人物工厂、第一人称身体/视模的共用根节点标 `userData.whiteboxCharacter = true`，后续骨骼挂件自动继承；ActorBatch / Crowd 的场景批次带同一标记。子树可用 `false` 明确回到场景类别（例如开场人物根下的坐箱），不按单个人物或武器维护名单。LOD 在材质替换前更新，避免新显示的档位漏用场景网格。

旧配置缺少新字段时自动使用新默认；旧版默认表面色 `#d8dadd` 在缺少 `grid` 字段时迁移到灰色，用户自定义颜色保留。`Inspect().materials` 同时返回 `characterMeshes`、`terrainMeshes` 与 `whiteMeshes`，后者表示应用灰盒替代材质的数量。

## 验证

```powershell
node Taierzhuang1938/Script_WhiteboxQualityTest.mjs
node Taierzhuang1938/Script_WhiteboxQualityBrowserTest.mjs
node Taierzhuang1938/Script_PostFrameGraphTest.mjs
node Taierzhuang1938/Script_SamplerBudgetTest.mjs --only=whitebox
node Taierzhuang1938/Script_EditorTest.mjs
```

专项浏览器门禁检查实际提交的灰盒网格材质、人物贴图、场景零原贴图、地形保留、后加入的骨骼挂件、共享材质与还原；点击人物贴图开关并保存/刷新，再显式切 high 验证原管线。包括敌我双方持枪近景、场景和编辑面板截图；截图与读数在忽略目录 `tmp/WhiteboxQuality/`，不提交。
