# 白盒画质与美术验收入口

2026-09-29 起，未明确选择画质时默认 **whitebox**。旧 `graphics_v1` 的 TAA、阴影、GI 等存档不会覆盖白盒默认；用户新选择的预设会保存。URL 的 `quality` 优先于保存的预设。

## 玩家入口

游戏现有 **画质设置 → 白盒（默认） → 编辑白盒画质**。编辑区按材质、光照 Feature、渲染 Pass 分组，支持表面色、背景色、分辨率、恢复默认和导出 JSON。改动点击「保存并应用白盒」后刷新生效；未保存草稿不改当前画面。普通 low / medium / high / ultra 仍使用现有的画质调节页。

白盒默认保留地形贴图，人物、第一人称手和武器、建筑、植被、道具、水面及后来生成的实体采用无贴图素色材质。地形以对象上的 `deformableTerrain`、`terrainTile` 或 `whiteboxTerrain` 标记识别；弹坑替换地块也保留贴图，不能用「材质名字带泥土」放行场景道具。透明粒子/贴花和天空默认不画；HUD 与任务系统继续工作。

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

// 显式恢复美术表现；保留任务、阶段等其他 URL 参数
Tengxian.GraphicsProfile.Select('high')
Tengxian.GraphicsProfile.Select('whitebox')
Tengxian.GraphicsProfile.ResetWhitebox({ reload: true })
Tengxian.GraphicsProfile.ExportWhitebox()
```

数据源是 [Data_Tuning_Whitebox.mjs](../Data_Tuning_Whitebox.mjs)：`WHITEBOX_DEFAULTS`、控件表、`WhiteboxPassPlan`、运行时画质映射。UI 与 API 共用校验和本地存储 `tengxian1938_whitebox_v1`。导出的 JSON 可作为 agent 修改这张默认表的依据；浏览器本地编辑不会自动发布成全站默认。

开关依赖会自动接入：SSR → 预通道/HZB/颜色历史；SSIL/室内天光 → GTAO；TAA/景深/运动模糊/雾 → 预通道；光晕 → Bloom；阴影/GI/簇光 → 关卡灯光。读取 `Inspect().renderedPasses` 区分「配置允许」与「场景满足条件，实际执行」。关闭白盒资产材质时保留破坏裁切与已启用的光照补丁，不保留纹理和风化；完整材质细节验收请恢复资产材质。

新 Feature 必须登记数据与控件映射，新 Pass 必须显式加入白盒允许表，否则在白盒下默认关闭。新增物件自动服从材质替换；仅真正的地形可标 `whiteboxTerrain`。不对单个人物/武器维护例外名单。

## 验证

```powershell
node Taierzhuang1938/Script_WhiteboxQualityTest.mjs
node Taierzhuang1938/Script_WhiteboxQualityBrowserTest.mjs
node Taierzhuang1938/Script_PostFrameGraphTest.mjs
node Taierzhuang1938/Script_EditorTest.mjs
```

专项浏览器门禁实测默认实际 Pass、非地形贴图数量、地形贴图、蒙皮人物、后加入的物件与材质还原，点击编辑/保存/刷新，再显式切 high 验证原管线。截图与读数在忽略目录 `tmp/WhiteboxQuality/`，不提交。
