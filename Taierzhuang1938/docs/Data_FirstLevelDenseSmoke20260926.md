# 第一关成片战场硝烟（2026-09-26，第二轮）

用户反馈初版七根细烟柱密度太低。本轮重新制作四类烟雾图集，并将布设扩为8组火场、32处烟源；以 Notion [游戏概念参考图](https://app.notion.com/p/3e460335331c80799ad5f4faf4f837a9) 04–06的远景构图为依据，覆盖道路纵深、屋脊、坦克后方、撤口外侧及集合点远坡。

## 类型与构图

每组包含浓黑燃烧烟柱、灰白翻滚烟柱、土黄色尘烟、横向飘散烟带。高烟柱的上升路径约34–55米，烟团本身在顶部继续展开；横向烟带的烟团宽度约42–54米。烟柱粗细、烟龄、风偏和落点用固定种子随机化，复活及阶段重建后位置一致。集合点两处尘烟抬到坡顶上空，与高烟柱相接，避免侵入后续通行路线。

`Data_FirstLevelDistantSmoke` 管布设和四种配方；`Script_BattleSmoke` 用一张四格RGBA图集，将全部背景烟合成一个实例批次。低/中/高/极高画质分别每源8/11/14/16个烟团，全场256/352/448/512个实例，单次主颜色绘制调用、两个采样器。低画质保留全部32处烟源，通过较少且更浓的烟团维持规模。

`VfxSystem.SmokeSource` 只对显式带 `backdrop` 的烟源启用此层；原有战斗烟、火焰和粒子池继续工作。新层不占枪口、战车、爆炸的粒子槽位，也不参与碰撞和AI视线判定。烟在GPU上持续上升、横漂和轻微卷动；清理、移动、移除、换关与Dispose均接入原生命周期。几何重建会释放旧缓冲，贴图晚到时仍检查Dispose，资源失败时保留程序化烟团兜底。

透明烟关闭深度写入并排除法线/速度预通道，保留正常遮挡和软交界；天空背景用与现有VFX相同的雾公式，有实体的背景交由合成链处理。距镜头20–45米渐隐，用于意外接近远景时避免贴脸烟墙。

## 资产与生成记录

- 生成方式：内置 imagegen；新生成单张图集，四种形态各占一格，未调用付费CLI回退。
- 游戏资产：`Texture/Texture_BattleSmokeAtlas.png`，1254×1254，RGBA，2,063,602字节。保留生成图的透明通道，未修改原图；运行时对烟色去除细小彩色透明边缘。
- SHA-256：`746509CABED6F45BF273EC5AC26EC331C787B2855A5E7343485282D0F769ABFF`。
- 精确生成提示词（工具请求2048方图，实际返回尺寸以文件为准）：

```text
Use case: photorealistic-natural. Asset type: production real-time game VFX smoke sprite atlas, exactly four different smoke cloud sprites in a precise 2 by 2 equal-cell grid, square 2048x2048 image. Genuine transparent RGBA background, no checkerboard. Each cloud fully contained within its own quadrant with at least 8 percent empty transparent padding at all cell edges; no overlapping quadrants. Top left: dense charcoal-black turbulent burning-building smoke billow, heavy dark core, subtly warm gray volume highlights, ragged feathered translucent edges. Top right: broad thick light-medium gray rolling smoke billow, rich organic cauliflower folds and translucent wisps, muted dirty gray, no bright white. Bottom left: dense desaturated ochre brown battle dust cloud, coarse turbulent volume, soft irregular dispersing edge. Bottom right: broad wispy charcoal ash cloud with layered streaks and torn transparent gaps, less dense than the other three. Realistic volumetric smoke, natural scale-independent texture suitable for layering many camera-facing particles in a 1938 battlefield FPS. Orthographic view, soft diffuse overcast illumination, nearly unlit neutral lighting, no hard directional rim. Fill about 80 percent of each quadrant with a single irregular cloud mass. No ground, no environment, no objects, no flames, no sparks, no border, no labels, no letters, no watermark, no baked shadows outside the smoke. True partial alpha must preserve fine wisps.
```

## 本轮验证

- 高画质K6–K11六视角与低画质实景已检查；最终布设还用正式打包入口拍摄low画质K6/K11，确认图集确实加载、32处烟源持续存在。截图不作为本轮连续通关证据。
- 布设专项检查烟团逐龄扫过路线的净空、地形边界、四种类型、K6/K7/K9/K11至少三类烟冠可见、固定种子、质量预算、清理重建及战斗粒子隔离，全部通过。
- 真GPU专项通过：低画质四种烟32实例合为1次绘制，87,330像素产生可见变化，推进烟龄有82,647像素变化；前景遮挡与清理残留均为0像素，重置时钟恢复可见烟；贴图失败兜底、资源释放、预通道排除、WebGL错误0均通过。
- `MotionVectorContractTest`、`ModuleGraphTest`、`TestRunnerTest`、`FirstLevelMissionTest`、`FirstLevelFrontTopologyTest`通过。
- `--domain=distantSmoke --profile=prepush --fail-fast`通过43项后停在`OpeningSetTest`：`spoilEarthSkin x rescue.interpreterReturn at (0.43,-123.54)`。在未修改的基线`d3670e22`上独立重现同一断言；未改动或放宽该测试。烟柱纯Node与GPU专项另行运行通过，不将完整prepush描述为全绿。
- 正式浏览器包：475个模块，内容戳`2456754508434264`。本轮未重跑旧七章BootTest及04→06连续驾驶；前一轮的连续流程记录留在初版文档，不作为这次重新通关的声明。

实景截图、对比图和生成图副本在本地交付目录；源码仓库只提交实际游戏图集与回归脚本。
