# 第一关壕沟与土壤 PBR（2026-09-16）

## 深度与边界

主要交通壕、前沿横壕、补给壕、撤离壕及两处回环的设计开挖深度改为自然地面以下 2 米。游戏单位为米，共享高度场同时用于渲染、Rapier 碰撞及角色贴地。局部射击踏步、爆破缺口与出口坡道仍会高于主沟底；不能把这些位置当作全深交通壕测量。

历史战壕不存在跨军队、跨用途的单一深度。英国国家档案馆保存的 1915 年掘进记录给出最大 6 英尺（1.8288 米）深的接敌壕，并区别跪姿掘进与全深掘进。本次 2 米是以全身遮蔽为目标的游戏设计值，不声称是滕县现场测绘或国军统一工事条令。

来源：[The National Archives — Mining under the enemy](https://www.nationalarchives.gov.uk/education/resources/medicine-on-the-western-front-part-two/mining-under-the-enemy/)。


补给屋凹地深度与补给沟共用 FRONT_SORTIE.trenchDepthM。匍匐顶盖相对共享沟底布设，保持原净空。东侧铁丝网一节向外移动 1.8 米，为补给沟转角留出真实碰撞净空。

## 图像来源与运行时

> **2026-09-17 起第一关地面不再用这套单张土壤图**：远处平铺成横纹（马赛克），换成四层纹理数组的分层地形材质，
> 见 [分层地形材质](Data_TerrainLayers.md)。本节的 `Texture_MissionSoil*` 仍是 Ground / GroundRubble 配方的外部图，
> 也是分层地形下载失败时的退路；下面记录保留为这套图的来源说明。

使用内置 image_gen__imagegen，单次生成土壤 PBR 四象限图集（请求 2048×2048，实际输出 1254×1254，每象限 627×627）。源图与拆出的高度图保留在本任务本地 `_shots/TrenchTerrain/`；高度图没有接入几何位移，避免改变已验证的碰撞表面。游戏使用 `Texture/Texture_MissionSoilBase.webp`、`Texture_MissionSoilNormal.webp`、`Texture_MissionSoilOrm.png`，均为 512×512。

Base/Normal 以 WebP quality 0.88 打包。ORM 保留无损 PNG，R 为 AO（下限 190），G 为粗糙度（下限 209），B 强制为零金属度。生成地图是近似材质输入，并非实测扫描。Albedo 使用 sRGB，normal/ORM 不做颜色空间转换，沿用材质库的法线与打包 ORM 管线。

Ground/GroundRubble 使用这套新土壤图；第一关地面从纯色语义材质接入 Ground，降低法线强度至 0.5。第一关按 2 米平铺，普通地面与弹坑重建使用相同 UV 尺度、原点及 Z 方向；顶点色仅作轻微土地类型调色。维持现有 draw call 和材质采样器数量。

## 完整生成提示词

Use case: photorealistic-natural. Asset type: production game terrain PBR texture atlas, square 2048x2048. Create one precisely divided 2x2 atlas with NO margins, borders, labels or text. Every quadrant is an exactly aligned map of the SAME seamless tileable 2 metre square patch of realistic compacted earth of rural Shandong China: muted warm grey brown mineral loam, small irregular soil aggregates, fine grit, sparse embedded tiny stones and a few broken dry roots, subtle moist crevices, no grass blades, no large rocks, no objects, no footprints. Top left: unlit diffuse BASE COLOR, flat even lighting with no baked shadows or ambient occlusion. Top right: corresponding tangent-space OpenGL NORMAL map, neutral blue violet base, restrained microrelief, pixel aligned to base color. Bottom left: corresponding packed ORM map, red ambient occlusion mostly near white with darker crevices, green high varied roughness 0.8 to 0.97, blue zero metalness, yielding yellow green appearance. Bottom right: corresponding greyscale HEIGHT map, dark crevices, medium soil, lighter slightly raised grains. All four maps show identical structures at identical positions, each quadrant individually repeats seamlessly horizontally and vertically, edge to edge orthographic texture scan, restrained believable fine scale, high detail, no perspective, no directional lighting. This is a technical texture atlas, not a rendered sphere or landscape.

## 验证

本次累计 86 个不同的现有检查通过（含最终 FirstLevelMissionFortificationsTest），另有两个 Node 检查使用下述本地加载适配器通过。截图、实测坐标与原始图集只留本地，不提交。

- 真实主沟采样深度：2.00001、1.99996、2.00003 米；前沿及交通沟的实际截图已查看。前沿补给箱保留实体，通行测试从箱侧通过，未取消任何碰撞。
- `FirstLevelMissionFortificationsTest`：12 次双向实走，82/82 路径点；全部工事碰撞净空通过。实际渲染程序均链接成功、采样器不超过 GPU 的 16 个上限、GL 错误为零。
- `FirstLevelMissionTopologyBrowserTest`：四条后方路线分别 11/11、4/4、9/9、5/5 双向通过；两处土体遮挡检查通过。
- `FirstLevelFrontRouteBrowserTest`：补给路线 16/16 双向通过；低顶通道站立／蹲姿不能穿过，匍匐可以。
- `SamplerBudgetTest`：四档画质 × GI 开关共八种组合通过；GTAO、材质升级、弹坑表面、运动矢量、车厢道具速度、界河地形、启动卡顿与部署合并入口检查通过。
- `BootPayloadTest`：启动贴图 13.92 MiB，低于 14 MiB 门槛；新土壤三图共 345793 字节，没有增加 Ground/GroundRubble 的纹理集合数量。

### 既有失败与验证边界

- `BootTest` 完整七关对照：本次版本与未修改的主检出 `3f87ff78` 均只在 phase 1–6 报“日军远景辨识材质未接全 count=0”；其余检查无新增失败。仅把测试进程超时从 240 秒放宽至 600 秒以跑完七关，断言未改。
- `FirstLevelWhiteboxSurfaceTest` 与 `FirstLevelP012FlowTest` 在 Node 24 的默认加载方式下遇到 vendor GLTFLoader.js 被当作 CommonJS 的既有错误，主检出可复现。使用只对 vendor/three/*.js 指定 ESM 的本地 `registerHooks` 适配器后，两项原断言全部通过；未修改 vendor 或项目运行代码。
- 正常 `FirstLevelMissionBrowserTest --campaign --audio` 已通过开场、前沿战斗、补给屋往返、断履带及护送转场，随后在屋内伏击“连按开始前两名担架员已经倒下”断言失败。记录中敌人 0.45 秒即接敌，2.4 秒顶住结束时故事时间仅 2.87 秒，早于后抬者的 3.2 秒事件。对未修改主检出及本次规则模块输入同样的 0.45 秒接敌时序，两者均复现只倒下一人的结果；没有把此次流程记为完整通关，也没有削弱原断言。
