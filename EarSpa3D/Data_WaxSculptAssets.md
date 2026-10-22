# EarSpa3D 耳垢参考与可形变源模型

2026-10-22，版本 `ear050-career-care-20261022`。

## 找回的参考

`References/Reference_CerumenMaterials.png` 是此前生成的美术参考，1536 × 1024，包含干片、湿蜡、硬结三种材质，每种两个观察角度。它不是严格的三视图，也不是实拍或尺寸测量资料。

原图从 `C:/Users/Bentl/OneDrive/AI/Models/Blender/EarSpa3D/WaxReference/Scene_WaxReference.blend` 的打包图片 `Reference_GeneratedCerumen.png` 解包取得。本轮没有生成新参考图，没有调用 Lovart 或即梦。该图作为参考归档，不作为游戏的颜色贴图；原始图也打包进了新源工程。

主要对照特征：干片的浅色薄缘、非对称折起与撕裂轮廓；湿蜡的琥珀色厚积、压皱和薄唇；硬结的深褐压实层面、短裂纹与不均匀边缘。

## Blender 源工程与实际消费

源工程：`C:/Users/Bentl/OneDrive/AI/Models/Blender/EarSpa3D/WaxCareer20261022/Model_WaxCareer20261022.blend`。源工程及备份只在 OneDrive；仓库交付 `Script_WaxSculptBake.py` 和它实际烘焙的 `Data_WaxSculptProfiles.mjs`。

重建脚本在 Blender 内建立三个闭合源网格，每个 8066 顶点、16128 三角。它对 Blender 已求值的三角面建立 BVH，再沿 48 个周向、7 个径向环逐点射线采样上表面和下表面。三个源网格共 2022 条高度射线，实际烘焙缺失为 0。轮廓、上下表面和源数据 SHA-256 一并输出；渲染用模型就是这些采样的来源。

`Script_WaxMorphology.mjs` 静态导入采样模块，`BuildWaxShape()` 的干片、湿蜡和硬结直接使用这些数据，辅以有限的确定性旋转、剪切和表面变化。现有 `Script_ImmersiveScene.js` 的几何装配调用无需另挂展示模型。每块仍为 **674 顶点、1344 三角、65 个 XPBD 节点**。种子变化不会消耗客人布局随机流。

归一化源形体（半径参数为 1 mm）采样厚度：

| 类型 | 薄缘 / 最厚处 | 形体特征 |
| --- | --- | --- |
| 干片 | 0.0117 / 0.0585 mm | 高度跨度约 0.547 mm 的折起薄层，厚度与卷起高度独立 |
| 湿蜡 | 0.0098 / 0.2752 mm | 厚积、压皱、逐渐变薄的唇缘 |
| 硬结 | 0.0600 / 0.7388 mm | 隆起厚块、多条宽窄不等的压实层脊和短沟槽 |

微屑仍为原有九粒、三种形态的轻量封闭网格。油耳保留原来的体积凝胶、四面体、覆盖层和局部撕取，不替换为这些薄壳。

`Script_SurfaceDetail.js` 与 `Script_TactileMaterials.js` 的蜡材质仍读取实际毫米厚度、应变和黏聚损伤。纹理由材料坐标固定，细裂纹经屏幕导数滤波；薄缘的散射、湿润反射、断口粗糙度随原有物理状态响应。湿蜡按实际厚度做 RGB 指数吸收，厚积呈深琥珀、薄唇保留暖黄，形变和断口继承这份厚度；硬结采用深咖啡色和更强的层脊起伏。已有蜡 PBR 图集以更细的表面尺度使用，降低大片平行压纹和均匀塑料高光。

## 保留的边界

源网格及运行时壳体均为封闭、单一 XY 投影的前后表面；卷边不向后折穿自身或耳壁。该约束允许现有 XPBD 绑定、逐点附着、闭合切口、正常掉落和质量账本继续工作。新增形体不改变清洁质量、结算、240 Hz 子步或物理节点数量。

参考中的全部悬空多层薄片、微小穿孔和很深的倒扣没有逐一建成独立实体。当前结果是参考指导的可变形实时近似，不是医学扫描、逐像素复刻或无限精度模拟。Blender 源模型使用自己的节点材质；实际运行时对比图使用游戏材质，二者照明和着色实现不同。

## 重建和核验

从本任务独占 worktree 启动独立实例，记录返回端口；多实例情况下 `exec` 和 `stop` 必须明确指定本次端口。MCP 的 `--file` 执行不会自动提供 `__file__`，因此为可重建脚本显式设置它：

```powershell
node scripts/Script_BlenderMcp.mjs start --new --task EarSpaWaxCareer20261022
$waxScript = (Resolve-Path 'EarSpa3D/Script_WaxSculptBake.py').Path.Replace('\', '/')
# 将 PORT 替换为上一步返回的本次端口
node scripts/Script_BlenderMcp.mjs exec --port PORT --code "p='$waxScript'; exec(compile(open(p,encoding='utf8').read(),p,'exec'),{'__file__':p})" --timeout 240
node scripts/Script_BlenderMcp.mjs stop --port PORT --save
node scripts/Script_BlenderMcp.mjs status --scan

node EarSpa3D/Script_WaxMorphologyTest.mjs
node EarSpa3D/Script_LightWaxPhysicsTest.mjs
node EarSpa3D/Script_WaxAssetRenderTest.mjs --url=http://127.0.0.1:PORT/EarSpa3D/
```

本轮本地实测：

- 11 组形态检查通过：96 种闭合壳体、576 粒微屑，可复现性、无退化面、成对边、正体积、静态绑定不漂移、顶点与物理节点预算。
- 28 项轻量掉落物理检查通过，沿用实际重力、阻力和搬运状态断言。
- 7 项实际游戏渲染检查通过：实际请求新采样模块、9 块壳体与节点预算、有限法线和变厚度、不透明深度、9 块原生清洁质量仍为 8.1、无资源或 shader 错误。混合耳 1280 × 720 高档画质为 152478 三角、45 次绘制；此局部受控检查不代表真实手动取出操作或全程帧率。
- `Script_BuildStandalone.mjs` 通过 esbuild 的静态模块图自动打入新采样数据，52 个模块；实际 `file://` 打开进入混合耳练习，9 块均为 674 顶点 / 65 节点，无页面或资源错误。参考图不参与游戏运行，不加入单文件运行资产表。无需新增打包特殊分支。
- Blender 两轮本次实例端口均为 9877，PID 分别为 46028、20672，均保存并退出；最终 `status --scan` 返回本树 `instances: []`，其他任务实例未操作。原始退出及扫描证据存于 `_dev/WaxCareer20261022/Data_BlenderStop.json`、`Data_BlenderStatus.json`。

所有截图和验收页面留在忽略目录 `_dev/WaxCareer20261022/`，不提交：`Shot_BlenderWaxMaquettes.png`、`Shot_WaxRuntimeMaquettes.png`、`Shot_ReferenceVsRuntime.png`、`Shot_WaxGameMixed.png` 和 `Shot_WaxGame_{dry,wet,impacted}.png`。`Review_WaxAssets.html` 可切换 Blender 源模型与运行时对照。实景近景显式使用现有高档调灯接口对准观察区域；它们是控制机位的检查，不冒充玩家手动取出。
