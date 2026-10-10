# 通用壕沟表面

## 2026-10-10 后续：垄顶堆积与 Cluster 低精度土团

弃土土团的横向散布由垄宽的 `.06–.76` 收到 `.08–.46`，集中在垄顶附近；每站数量参数仍为 12。三组宽度比较记录为 `SpoilBandAudit117.json`；中间档的全图估算超过原预算，未采用，最终档和实机近景见 `SpoilBand117Shots`。共用随机序列及交叉口筛选会让实际通过布设的装饰数量略有变化，不能称所有旧土团和根须位置逐项不动。物理地形、路线、沟宽、沟深及连贯弃土垄的剖面未改。

近景射线取证 `ClodRay117.json` 将明显的大平面定位到 `TrenchClusterLow`。沿用现有 imagegen 六件土团原型，经 BlenderMCP 单独重建这一低精度网格：两个 20 面实体与一个 16 面实体组成三个相接土团，仍是 56 三角，不增加 Mesh 或材质。其他 11 个网格的顶点、法线、UV、索引哈希与前版逐项相同，证据 `ClodAssetIsolation118.json`；整套仍为 1,296 三角，GLB 为 44,476 字节。`ClusterLow118Shots` 保留同机位与局部对照。

源工程为 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/TrenchReferenceTen/ClusterLowLod/Scene_TrenchClodClusterLowLod.blend`，同目录保留原型及模型边界记录；重建入口 `_import/Script_BakeTrenchClods.py`。Blender 已存盘并退出，`BlenderStopped118.log` 确认本任务及本机无残留实例。材质、PBR、光照及土崖模块沿用上一轮，缓存戳 `2026101025`。

`TrenchSurfaceTest`、`ModuleGraphTest`、`AssetStandardsTest`、`MotionVectorContractTest`（49 个 GPU 场景）通过。`Iteration119All` 覆盖 22 段 / 29 个高画质机位，`Whitebox119` 复查四个白盒机位，均已查看；页面、控制台、GL 错误为 0，程序链接与爆破恢复通过。土层 1,123,381 三角，加草石 21,095，合计 1,144,476，低于原 115 万预算；土层仍为 55 个分区网格。对照页默认沿沟机位与 10 号图，支持上一轮及最初实机；图片和切换检查通过。结果保留本地，尚未标为达到完整参考质感。

## 2026-10-10 后续：由真实内壁局部重做密实土

第十版源图中的连续斜擦纹在实际材质中被强化，形成偏织物状的表面。`MaterialIsolation112` 以固定曝光分别检查原材质、单次平铺及关闭 POM / 法线的基础色；基础色本身仍存在这些条纹。第一张重做候选（Lovart 第十一版）减少了长条纹，但实机仍像松散颗粒，因此没有安装。

第二张直接参考用户土壁照片的右壁局部，裁剪区域为原 600×400 图的 `(418,104)-(582,350)`，没有放大或改画参考。Lovart 第十二版输出 2048² 源图；沿用原颜色标定、1 m 平铺及 8 mm 高度范围，生成 Base 1024²、Normal / Orh 512²。三图合计 549,226 字节；运行文件与独立候选目录、烘焙记录的三个 SHA-256 分别一致。源图、提示词与两个候选取证均留在本地；完整提示词追加在 `_import/Prompts/Texture_TrenchPom.txt`，清单和烘焙记录已更新。高度仍由生成基础色推导，不是摄影测量。

`Candidate115Shots` 在同机位、同曝光下比较任意旋转与保持朝向。保留 `variantRotation: 0`，让切土纹的上下方向一致，随机偏移及三向投影仍启用；其余着色器、光照、松土贴图、模型、根须与物理地形不变。前一候选 `Candidate113Shots` 也保留作对照。缓存戳 `2026101024`。

`TextureStandardsTest`（3,719 项）、`ModuleGraphTest`、`TrenchSurfaceTest`、`TerrainBlendTest` 通过。`Iteration116All` 覆盖 22 段 / 29 个高画质机位，`Whitebox116` 覆盖四个白盒机位，均已查看；页面、控制台及 GL 错误为 0，所有程序链接成功，爆破与恢复通过。几何统计与第一百一十一轮逐项相同，壕沟合计仍为 1,141,992 三角。对照页可切回上一轮及最初实机，29 张图片和切换检查通过。本轮保留本地，整体质感仍未标为与参考完全一致；后续重点是沟沿土团与沟底碎土的自然堆积。

## 2026-10-10 后续：剥落坑与贴壁细根

本轮沿用已有 imagegen 四模块土崖原型，通过 BlenderMCP 重建内壁的剥落坑。每个坑口用独立方向及边距的六边形约束，替换重复的削角矩形；凹入量为 3.5–9.5 cm，55° 以上折角保留断口法线。四模块共 1,158 三角 / 35,696 字节，沿用共同边界采样、沟沿衔接及原物理地形契约。源工程位于 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/TrenchCliffWalls/CutPockets/Scene_TrenchCliffWallsCutPockets.blend`，同目录保留参考与边界记录。重建入口仍为 `_import/Script_BakeTrenchCliffWalls.py`；Blender 已退出，证据 `BlenderStopped111.log`。

根毡改为一张 imagegen 分枝细根透明贴图（生成与重建命令见 [细根贴图记录](Data_TrenchRootMatPrompt.md)）。1024² WebP 为 470,412 字节；技术烘焙保留缩放后 alpha，延展透明像素中的 RGB，防止 mipmap 渗色。独立目录重烘的 SHA-256 与运行资产一致。材质白色乘数保留原图的棕褐色，alphaTest 为 .30。沿沟仍稀疏布设，不增加草簇密度。

卡片由旧高度场铺设改为水平射线投影到实际土崖，先向下寻找上缘，再投影 6×5 网格；跨断口的过长三角形裁除。所有点仍走静态合批和原爆破裁切。`TrenchSurfaceTest` 独立检查卡片顶点及面中心至真实土崖三角形的距离，6 cm 上限未放宽。新增 `wallRoots` 统计区分贴壁卡片和旧回退草毡。

固定曝光对照 `CompactBalance108` 比较了降低整片密实土颜色强度及浮雕强度的方案：只是平滑了土面，没有改善剥落形态，因此未采用。`Iteration109Pockets` 的较硬坑口也未采用；最终形态见 `Iteration110Pockets`。本轮土壤 PBR、正式着色器和光照未变，缓存戳 `2026101023`。

`Iteration111All` 覆盖 22 段 / 29 个高画质机位，`Whitebox111` 复查四个白盒机位，均已查看；页面、控制台、GL 错误为 0，程序链接与爆破恢复通过。土层 1,120,936 三角，加草石 21,056，合计 1,141,992，仍低于原 115 万预算；土层分区为 55。`TrenchSurfaceTest`、`TextureStandardsTest`（3,719 项）、`AssetStandardsTest`、`ModuleGraphTest`、`MotionVectorContractTest`（49 个 GPU 场景）通过。对照页显示当前与第一百零三轮 / 最初实机，切换及 29 张图片加载检查通过。本轮保留本地，照片中的自然侵蚀与细土层次仍未完全达到。

## 2026-10-10 后续：密实土纹理尺度

第一百零三轮固定曝光比较 1.2 / 1.0 / .8 m 密实土平铺，诊断时同步校正法线强度，保留 1.0 m 档，让近景土纹更细而仍可辨认连续切面。8 mm 起伏、颜色强度、1.8 m 松土平铺、模型与光照保持不变。诊断接口只用于临时浏览器会话，没有进入正式着色器。

按 1.0 m 世界尺度重烘密实土法线，清单 `metersPerTile` 与运行时配置同步。Base 和 Orh 的哈希未变；Normal 为 512² / 131,038 字节，三图合计 559,304 字节。按记录重烘的三个通道与游戏文件哈希相同，原贴图预算和检查门槛未改。`TextureStandardsTest`（3,712 项）、`TrenchSurfaceTest`、`ModuleGraphTest`、`TerrainBlendTest` 通过。`CompactScaleProbe102` 与 `Rebake103.log` 保存证据，缓存戳 `2026101018`。

`Iteration103All` 覆盖 22 段 / 29 个高画质机位，`Whitebox103` 复查四个白盒机位，均已查看；无页面、控制台或 GL 错误，程序链接与爆破恢复检查通过。几何保持 1,144,017 三角 / 55 个分区网格。对照页可切回第一百零一轮；当前保留本地，完整参考质感尚未标为达到。

## 2026-10-10 后续：密实土细部深度

第一百零一轮在固定曝光、同机位下比较密实土的 5 / 8 / 12 mm 起伏，保留较克制的 8 mm 档。沿用 Lovart 第十版源图，按现有烘焙记录重烘法线，运行时 `pomReliefM` 同步由 .005 改为 .008；松土、模型、物理地形、平铺尺度和颜色强度均未改。诊断用的额外法线乘数接口未进入正式源码。

底色及 Orh 的 SHA-256 与改前相同，只有 Normal 改变。密实土三图合计 546,516 字节，法线为 512² / 118,250 字节，仍在原贴图预算内；按记录重烘到独立目录，三个通道的哈希与游戏文件逐项相同。`TextureStandardsTest`（3,712 项）、`TrenchSurfaceTest`、`ModuleGraphTest`、`TerrainBlendTest` 通过。`CompactReliefProbe100` 和 `Rebake101.log` 保存对照及重烘证据，缓存戳 `2026101017`。

`Iteration101All` 覆盖 22 段 / 29 个高画质机位，`Whitebox101` 复查四个白盒机位，均已查看；页面、控制台和 GL 错误为 0，所有程序链接成功，爆破及恢复通过。几何计数与第九十九轮相同，仍为 1,144,017 三角 / 55 个分区网格。对照页可切回第九十九轮；当前保留本地，完整参考质感尚未标为达到。

## 2026-10-10 后续：墙脚碎土堆积

第九十九轮先量了现有标准剖面：2 m 深、1.1 m 坡宽、3.4 m 沟底时，中部 20%–80% 高度的坡度约 69.8°–73.3°。本轮继续保留物理剖面，调整墙脚与沟底之间的碎土分布。每组原有 12 颗沟底碎土中的 4 颗移到沟底边缘附近，中心范围为边缘内 20 cm 至外 3 cm；另外 8 颗沿用原分布。大小、数量和随机取数顺序不变，没有新增碰撞或地形隆起。

全图两次重建对比覆盖 52,393 个几何体：4,032 颗指定碎土发生变化，其余几何的顶点、法线、UV 和索引哈希全部相同。土团总数仍为 34,161，根须、沟沿、外侧弃土和土崖布置保持不变。`TrenchSurfaceTest` 检查墙脚碎土的位置与低矮高度；`ModuleGraphTest`、`MotionVectorContractTest`（49 个 GPU 场景）、`FirstLevelFrontTopologyTest`（48 条路线）通过。

`ProfileAudit97.json`、`ToeIsolation97.json` 保存量测与隔离证据。`ToeBlendProbe98` 的材质过渡试验改善不明显，未保留；正式着色器、PBR 和模型文件未变。缓存戳 `2026101016`。

`Iteration99All` 覆盖 22 段 / 29 个高画质机位，`Whitebox99` 复查四个白盒机位，均已查看；页面、控制台和 GL 错误为 0，爆破及恢复通过。土层 1,114,616 三角，加草石 29,401，共 1,144,017 三角 / 55 个分区网格。对照页默认显示沟内机位与第九十六轮比较；当前保留本地，完整参考质感仍未标为达到。

## 2026-10-10 后续：松土颜色强度

第九十六轮保留现有 Lovart 源图、PBR 文件与模型，调整松土的颜色放大。按单张反照率的线性 RGB 及其均值计算，旧 2.2 倍强度使约 15.52% 的像素三通道同时低于 0，随后被着色器截黑；1.35 倍时降为约 1.95%。这是孤立贴图计算，不是整张实机画面的黑色比例，不含随机混合、光照和后期。

三个固定曝光机位共 15 张对照比较了 2.2、1.35、1.0 强度及另一平铺尺度。保留 1.35，让颗粒间的细土更连贯；密实土系数改为 `1.21/1.35`，其有效强度仍为 1.21。既有 1.8 m 松土平铺、1.2 m 密实土平铺、视差高度、法线强度、粗糙度和光照均未变。试验用的临时材质接口未进入正式源码。

缓存戳 `2026101015`。`TerrainBlendTest`、`TrenchSurfaceTest`、`ModuleGraphTest` 通过；`LooseProbe95` 保存固定曝光对照及 Frame Debugger 摘要，`LooseContrast95.json` 保存单贴图计算结果。前轮的模型、贴图及采样器检查作为既有结果保留。

`Iteration96All` 覆盖 22 段 / 29 个高画质机位，`Whitebox96` 复查四个白盒机位，均已查看；无页面、控制台或 GL 错误，所有程序链接成功，爆破及恢复通过。几何计数与第九十四轮完全相同，仍为 1,144,138 三角 / 55 个分区网格。对照页可切回第九十四轮；当前保留本地，整体质感仍在对齐参考，未标为完成。

## 2026-10-10 后续：不规则土团与大小档位

第九十四轮沿用已有 imagegen 六件土团原型与参考 10，通过 BlenderMCP 重建土团。团块位置和比例加入小幅不对称变化，减少规整体块感；断面边缘增加小起伏，埋入土中的底面保持封闭。各档减面后只在超过 70° 的真实折角处分裂法线。最终仍为六种形体、12 件模型，高档 160 三角 / 小档 56 三角，共 1,296 三角，GLB 44,640 字节。源工程位于 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/TrenchReferenceTen/ClodFractures/Scene_TrenchClodFractures.blend`，同目录保存原型、参考 10 与参数说明；旧工程保留。

沟沿土团半径上限由 32 cm 收到 22 cm，起伏范围由 5–22 cm 收到 3.5–14 cm，仍偏重小颗粒；21.5 cm 以上才使用高档模型。中小档从 40 增到 56 三角，用于保留不规则轮廓。64 三角小档曾使全图超过原预算，因此未采用，原预算门槛未修改。松土垄的物理剖面、沟底与路线保持原样，PBR 和着色器不变。

`TrenchSurfaceTest`、`AssetStandardsTest`、`ModuleGraphTest`、`MotionVectorContractTest`（49 个 GPU 场景）通过。全图检查 335,853 个冠部土团顶点，没有可见顶点侵入原沟底。缓存戳 `2026101014`。Blender 已存盘并停止，`BlenderStopped93.log` 的 `status --scan` 确认本任务及本机均无 Blender 残留实例。

`Iteration94All` 覆盖 22 段 / 29 个高画质机位，`Whitebox94` 复查四个白盒机位，均已查看；页面、控制台和 GL 错误为 0，爆破及恢复通过。土层 1,114,737 三角，加草石 29,401，共 1,144,138 三角 / 55 个分区网格，低于原 1.15M / 64 限制。对照页默认显示沿沟机位和参考 10，可切回第九十轮。当前仍保留本地，整体自然度尚未标为达到参考。

## 2026-10-10 后续：被再次开挖的冠部衔接

第九十轮处理交汇处和紧回环中的假沟沿。入口环沟取点显示，原段标记的冠部仍处在全局开挖区内，深度约 .77–1.24 m；旧模型在这条内部边界上继续画悬挑、顶高及松土，形成 U 形凸边。现在按统一 `plan.Depth` 判断冠部外露程度：4 cm 内保留，30 cm 及以上完全贴回土面；模型上部、额外顶高、弃土表皮和备用程序化表皮同步过渡，接触法线匹配原地面。物理地形、中心线和通行宽度未改。

继续使用 `terrainLayers.w=[2,3]` 的冠层混合通道：土壁 UV.x 为原高度比例乘外露程度，弃土表皮 UV.x 为外露程度本身。真正沟外的值为 1，仍显示松散弃土；内侧陡面回到密实切土。弃土表皮不再统一用 `(-8,-8)` 强制松土，原土团、根须和道路标记保持不变；消费说明已同步到 `Script_FirstLevelWhiteboxField`，着色器未增加通道。

交叉壕沟回归夹具检查了 52 个被覆盖的冠部顶点和 182 个内部表皮顶点：旧最大多余凸起分别为 .0798 m / .0969 m，新实现无正向凸起，182 个被强制松土覆盖的内部顶点降为 0。已有模型与备用表皮均经过检查。全图 355,601 个冠部土团顶点没有侵入原沟底；`TrenchSurfaceTest`、`TerrainBlendTest`、`ModuleGraphTest`、`MotionVectorContractTest`（49 个 GPU 场景）及 `FirstLevelFrontTopologyTest`（48 条路线）通过。缓存戳 `2026101012`，没有新增或修改 PBR、GLB、Blender 源工程。

`Iteration90All` 覆盖 22 段 / 29 个高画质机位，`Whitebox90` 复查四个白盒机位，均已查看；页面、控制台和 GL 错误为 0，爆破及恢复通过。土层 1,079,516 三角，加草石 28,862，共 1,108,378 三角 / 55 个分区网格，仍在原预算内。着色器未改，采样器检查沿用第八十八轮结果。对照页默认显示入口环沟与第八十八轮的同机位比较；当前保留本地，土团形状及细碎断口仍需继续对齐参考。

## 2026-10-10 后续：土团陡面投射拉伸

第八十八轮用 Frame Debugger 的像素历史确认，近景中类似木片的竖条来自 `Static_TrenchEarth_-1_-2|ground`，不是草根贴片。运行时射线进一步定位到 `TrenchAggregateLow`：实际三角面接近竖直（法线 Y 约 .175），平滑及接地法线却明显朝上，三平面材质因此过多采到 XZ 顶投影，把很窄的纹理拉满了侧面。关闭 POM 或法线贴图仍有条纹，关闭颜色细节后条纹消失；固定曝光的开关对照确认了投射原因。

材质现由世界坐标导数的叉积取得实际三角面朝向，对退化投影轴渐隐权重（法线分量 .25–.50），再归一化；平滑权重全部失效时退回几何朝向。光照仍使用原平滑法线，底色、表面数据与视差采样共用修正后的混合权重。没有改模型、贴图、实例布置或地形，也没有增加采样器。调试开关为 `patch.trenchProjectionGuardUniform`，正式默认 1，缓存戳 `2026101011`。

`TerrainBlendTest` 新增真正绘制的竖直面夹具：人为给它向上的平滑法线，以只随 V 变化的纹理检查竖向细节。旧投射的采样范围为 0，修正后为 .6643；完全相切法线的后备路径也通过。原颜色、法线、深度、接地、旋转及材质标记检查继续通过，`ModuleGraphTest`、`MotionVectorContractTest`（49 个 GPU 场景）通过。`ProjectionProbe87` 保存固定曝光对照；`RootSurfaceProbe86/Rays.json` 与 `RootPiece85Corrected.json` 的命中一致。早期离线射线未重算变形土团的包围球，会漏掉它们，应以修正后的记录为准。

`Iteration88All` 覆盖全 22 段 / 29 个高画质机位，`Whitebox88` 复查三个白盒机位，均已查看；无页面、控制台或 GL 错误，爆破及恢复通过。第一关 low、medium+GI、ultra+GI、whitebox 的采样器检查通过，最高 16，白盒 12，每档运行 60 帧无 GL 错误。几何保持 1,104,856 三角 / 55 个分区网格。对照页可切回第八十四轮；当前保留本地，细碎断口和部分交汇处仍有视觉差距，目标尚未标为完成。

## 2026-10-10 后续：密实土壁第十版

第八十四轮依据参考 10 与用户真实土壁近照，由 Lovart 在原项目及线程中只生成一张新的 2048² 密实土壁源图。第九版源图存在成串颗粒围成大片图案的特征，旋转平铺只能降低重复；新图更侧重连续切面中的零散断口和细屑。输出为 `https://a.lovart.ai/artifacts/agent/SxnR03hzB9AVKQ3J.png`，完整提示词保存在 [Texture_TrenchPom.txt](../_import/Prompts/Texture_TrenchPom.txt)。原始源图 SHA-256 为 `0dcb4a0c73496638de09831c2d83a05548f654a6b389722f00f569d6236a19de`。

沿用上一版全部烘焙和运行时参数、贴图尺寸、模型与灯光，只替换密实土三张图。Base 1024² / Normal、Orh 512² 共 521,860 字节，比上一版多 152 字节；松土三图未改。原门槛直接通过：亮度 .4208、标准差 .0858、边缘细节比 .968、接缝比 .918、低频 .0142，无高低端截断。按记录重新烘焙到独立目录，三个通道的 SHA-256 与游戏文件及记录逐一相同。仍是生成基础色并从亮度推导数据图，不是实测扫描 PBR。

缓存戳为 `2026101010`，贴图管理页的清单模块也更新缓存戳。`TextureStandardsTest`（3,712 项）、`TrenchSurfaceTest`、`ModuleGraphTest` 通过。没有改动地形、路线、实体模型或着色器代码；前轮的几何、运动向量及采样器检查作为既有结果保留。

`Iteration84All` 的 29 个高画质机位覆盖全 22 段，`Whitebox84` 复查三个白盒机位，均已查看；页面、控制台、GL 错误为 0，所有程序链接成功，爆破及恢复检查通过。几何仍为 1,104,856 三角 / 55 个分区网格。对照页可切回第八十二轮同机位与最初实机，并展示新 Lovart 源图。当前保留本地，尚未宣称与参考完全一致。

## 2026-10-10 后续：减薄沟沿与浅交汇处收口

第八十二轮沿用已有 imagegen 四模块原型与用户真实土壁照，经 BlenderMCP 重建土崖：上缘凸出项由 13 cm 收到 6 cm，下方凹槽由 11 cm 收到 5 cm，局部断口保持 2.5–6.5 cm 并加宽斜面过渡，避免较深窄口呈现硬三角切面；运行时附加悬挑上限由 20 cm 收到 8 cm。四件仍为 252 / 296 / 274 / 322 三角，共 1,144 三角，GLB 33,340 字节。源工程保存在 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/TrenchCliffWalls/FineCrown/Scene_TrenchCliffWallsFineCrown.blend`，同目录保存参考 10、真实土壁照与原型。旧源工程保留。

实机前沿交通壕交汇处出现的 U 形厚边来自被压缩到约 45–50 cm 高的土崖仍保留完整凸出量。现在按每个截面的实际墙高渐隐浮雕：35 cm 及以下贴回地形，1.4 m 及以上保留完整形状；土崖额外顶高、悬挑及外侧弃土表皮同步变化，备用程序化表皮也遵循同一规则。固定同一套模型和参数的半米浅坡夹具中，旧布置器顶点的最大离地量为 .2518 m，新布置器为 .0070 m。壁底另在 20 cm 接触带内匹配原地面的法线，原物理高度、路线和走路宽度均未改。

修正 `BufferGeometry.clone()` 共用 `userData` 导致后续实例覆盖前面实例标记的问题：土团的冠部标记、土崖的镜像标记现为每实例独立对象，不污染模型模板。回归夹具的 56 个几何体从共用 32 个标记对象变为各自独立，模板修改数从 4 降为 0。草根贴片的最大伸长比由 2.5 收到 1.45，避免在陡壁拉成大片条纹；实体贴壁细根保留。

本轮缓存戳 `2026101009`。`TrenchSurfaceTest` 新增浅坡表皮、冠部同步收口、模板及实例标记独立性、壁底法线检查；原贴根、镜像、净空与接缝检查继续通过。全图检查 356,082 个冠部土团顶点，没有可见顶点侵入原沟底。`AssetStandardsTest`、`ModuleGraphTest`、`MotionVectorContractTest`（49 个 GPU 场景）通过。没有改 PBR 或着色器，采样器与材质通道检查沿用第七十七轮结果。Blender 已存盘并停止，`status --scan` 确认本任务及本机均无 Blender 残留实例。

`Iteration82All` 覆盖全 22 段 / 29 个高画质机位，`Whitebox82` 复查三个白盒机位；均已查看，无页面、控制台或 GL 错误，爆破与恢复通过。当前土层 1,075,778 三角，加草石 29,078，共 1,104,856 三角 / 55 个分区网格。对照页保留第七十七轮与最初实机，以及用户参考照和参考 10。当前仍保留本地，细碎断口与根土混合的自然程度尚未完全达到参考。

## 2026-10-10 后续：上缘土层过渡、纹理方向与细根

第七十七轮沿用现有土崖、土团模型与两套 PBR，处理大面积切面重复和上缘材质衔接。壁面原 UV.x 的沟底到沟沿比例在合批时编码为 `terrainLayers.w=[2,3]`；上部约四分之一逐渐混入松土，边界用连续世界坐标噪声变化。沟底与下部切面仍为密实土，原道路 `[-1,1]`、嵌入碎粒、松土团和根须标记不变。新编码也用于没有模型的浅沟表皮，未增加顶点属性或网格。

三平面采样的两份变体现在分别旋转、平移，再按原方差保持方式混合；分区频率由 .13 调为 .42。底色、表面数据、视差射线及自阴影高度使用相同坐标变换，采样导数一同旋转，切线法线按逆旋转返回原投影平面后混合。采样器和贴图数量未增加。`TerrainBlendTest` 用垂直面的红/蓝层验证上缘过渡，用恒定 +U 法线验证 90° 旋转后的世界方向：X 分量 .4326 转到 Y 分量 .4326，Z 分量 .9014 保持不变。

细根下段沿用每束实际半径继续收尖，约一半贴壁根束增加短分叉。分叉独立取随机数，关闭/开启的非根几何哈希相同；原有土团位置和根束位置不变。全网 2,833 束主根增加 1,386 条分叉，土层 1,106,974 三角，加草石 33,750，共 1,140,724 三角 / 55 个分区网格，仍低于原 1.15M / 64 限制。根须及分叉共同接受实际土崖三角形的 3D 贴壁距离检查。

本轮缓存戳 `2026101004`。`TrenchSurfaceTest`、`TrenchPlanTest`、`FirstLevelFrontTopologyTest`（48 条路线）、`TerrainBlendTest`、`ModuleGraphTest` 和 `MotionVectorContractTest`（49 个 GPU 场景）通过。第一关 low、medium+GI、ultra+GI、whitebox 的采样器门通过，最高仍为 16。`Iteration77All` 覆盖全 22 段 / 29 个高画质机位，`Whitebox77` 复查三个白盒机位；截图已查看，两档页面、控制台和 GL 错误为 0，爆破及恢复通过。对照页的参考图、上一轮、最初实机切换与 29 张图片加载通过。没有新增图片或 Blender 资产，本任务 Blender 状态检查无残留。当前仍保留本地审阅，未宣称已与参考完全一致。

## 2026-10-10 后续：沟沿碎土布置与土团断面

第七十二轮沿用已有 imagegen 六件土团原型，由 BlenderMCP 重建团块形状：实际使用的 Aggregate / BrokenWedge / RootBound / Cluster 由相连的不规则体块合成，再做封闭切断面；保留切断面的硬边，其余部分平滑。六种形体仍各有 160 / 40 三角两档，共 12 件 / 1,200 三角，GLB 52,464 字节。正式重建与草案文件 SHA-256 相同。当前源工程为 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/TrenchReferenceTen/ClodClusters/Scene_TrenchClodClusters.blend`，同目录保存原型和参考 10；旧源工程保留作历史版本。

沟沿土团按土崖模型实际前缘布置：建墙时记录前缘折线，按沿沟距离插值后向土面内留出少量余量。高度采样可同时返回实际承托三角形的法线，避免在悬挑边缘用跨过空处的高度差计算倾斜。贴边抽样 14 次、半径分布偏重小颗粒，外侧弃土抽样 12 次；半径至少 12.5 cm 使用已有模型，29 cm 以上仍用高模。冠部土团另按沟底净空限制半径，不让较大的碎块侵入走路区域。全网实测 34,311 颗土团（外侧 11,120 颗）、2,833 条主根、1,035 个土崖模块，土层 1,089,256 三角，加草/石 33,750，共 1,123,006 三角 / 55 个静态分区网格，未增加原预算。

土团外露部分改为以密实土纹理为主（松土占 .20），接地处仍为松土，渐变权重与原接触法线使用同一条带。均值校正保持松土本色，避免不同图层的均值差把土团变成发白的石块。贴图文件不变，也没有增加采样器。松土团的 UV 标记从 `(-8,-9)` 延伸为 `(-8,[-9.25,-9])`，合批后 `terrainLayers.w=[-2.25,-2]` 表示由外露断面到接地处的权重；弃土皮仍为 -2，嵌在壁内的碎粒仍为 -1.25，细根仍为 -3。缓存戳 `2026101001`。

本轮 `TrenchSurfaceTest` 增加悬挑边缘的真实承托法线和可见前缘布置检查，旧布置会触发新前缘回归失败；独立全网诊断检查 364,729 个冠部土团顶点，没有高于沟底表面 2 cm 的可见顶点侵入沟底。`TerrainBlendTest` 验证断面/接地连续混合及均值保持；`AssetStandardsTest`、`TrenchPlanTest`、`FirstLevelFrontTopologyTest`（48 条路线）、`ModuleGraphTest`、`MotionVectorContractTest`（49 个 GPU 场景）通过。第一关 low、medium+GI、ultra+GI、whitebox 的采样器门通过，最高仍为 16。

`Iteration72All` 覆盖全 22 段 / 29 个高画质机位，`Whitebox72` 复查三个白盒机位；截图已查看，两档页面、控制台和 GL 错误为 0，爆破与恢复通过。Blender 源工程已保存并关闭，`status --scan` 确认本任务无残留实例。当前仍保留本地审阅，未宣称完全达到参考。

## 2026-10-10：土团体量与沟沿植被接地

第六十八轮修正两处可见土层与装饰接地问题。土团底部原来会一直向下贴到采样表面，跨过深沟边缘时，小土团可能被拉成超过一米的薄片。现在底部下拉最多为自身半径的 .5 倍，保持原模型的实体体量。全网 32,782 颗土团的诊断中，高度大于 16 cm 且高宽比超过 1.8 的异常长条由 10 颗降为 0；土团数量和三角形数不变。新增实际高模跨越两米断崖的夹具，旧实现会触发失败，新实现通过，未改弱原有接地与露出面检查。

植被撒点仍以原物理地形和原种子生成，然后只对被可见土冠覆盖的植物做一次建场修正：根部移到可见土面，按相同增量缩短整张卡片，保留原来的最高点；水平尺寸只缩不放大。剩余高度低于 6 cm 的残片不再绘制，2 mm 以内的误差忽略。沟外和原高台不降低，路线、锚点、禁区与高度上限沿用原规则。`BuildTrenchSurface` 的土冠采样索引同时供植被使用，完成建场后释放引用，不新增逐帧采样。本轮实机修正 3,618 件、隐藏 9 件，保留 83,998 件植被。

本轮未改 PBR、土崖源模型或物理地形，也未采用视差、法线或三平面投影诊断中的临时着色器变体。缓存戳为 `2026100943`。`TrenchSurfaceTest`、`FirstLevelVegetationTest`、`ModuleGraphTest` 及 49 场景 `MotionVectorContractTest` 通过。`Iteration68All` 覆盖全 22 段 / 29 个高画质机位，`Whitebox68` 复查三机位，两档页面、控制台和 GL 错误为 0，爆破与 Reset 检查通过。土壤装饰合计 1,140,303 三角 / 55 个分区网格，仍在原预算内。当前保留本地审阅，未宣称已经与参考完全一致。

## 2026-10-09 后续：按断口布点的土崖网格

第六十三轮把均匀网格改为边界约束的 Delaunay 三角化：模块外边仍保留相同的 8 段横向 / 16 段纵向采样，内部顶点沿凹口内外轮廓、凹底及沟沿布设，让小断口有明确形状，大片切面保持连贯。仍沿用已生成的四模块 imagegen 原型，经 BlenderMCP 执行同一重建入口；当前源工程为 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/TrenchCliffWalls/Adaptive/Scene_TrenchCliffWallsAdaptive.blend`，同目录保留参考照片、原型及提示词。旧源工程保留作历史版本。

四种源模型分别有 4 / 6 / 5 / 7 处局部凹口，横向半径 8–16 cm、纵向半径 10–22 cm、减薄量 2.5–6.5 cm；重叠时取最深的一处，不累加成深槽。靠两侧 12 cm 范围内渐隐破损，保留共同边界。SpadeFace / TornFace / LowerScar / RootCrown 分别为 252 / 296 / 274 / 322 三角，共 1,144 三角，GLB 34,588 字节；正式脚本重烘后的 SHA-256 与已验收草案一致。运行时增加左右镜像变体并同步反转索引朝向，原地形贴合、接缝法线及壁面射线贴根继续适用；新增逐模块有向面积检查，确认原版和镜像版均朝沟内。

沟沿额外悬挑最大值由 32 cm 收到 20 cm，仍按世界位置断续变化；原弃土垄、沟底净空、路线与共享物理高度场不改。全网实测 1,035 个土崖模块、32,782 颗土团、2,728 组根束，土层 1,106,329 三角，加草/石 33,973，共 1,140,302 三角 / 55 个静态分区网格，仍低于原 1.15M / 64 上限。材质沿用下节第九版，缓存戳为 `2026100942`。

本轮 `TrenchSurfaceTest`、`TrenchPlanTest`、`FirstLevelFrontTopologyTest`（48 条路线）、`AssetStandardsTest`、`ModuleGraphTest` 和 `MotionVectorContractTest`（49 个 GPU 场景）通过。`Iteration63All` 覆盖全 22 段 / 29 个高画质机位，`Whitebox63` 复查三个白盒机位；截图已查看，两档页面、控制台与 GL 错误为 0，爆破与 Reset 通过。Blender 已保存并关闭，`status --scan` 确认本任务无残留实例，其他任务实例未操作。全套玩法门禁的既有失败仍见下文；当前保留本地审阅，细小破碎与根土混合的自然程度仍有差距，未宣称完全达到参考。

## 2026-10-09 后续：密实断面第九版

第五十五轮固定曝光比较了原画质、关闭颗粒、原生分辨率、较细平铺与较低颜色细节强度。主要差异来自断面源图的颗粒分布，单独关闭颗粒或提高渲染分辨率不能改变这种形貌；这些诊断设置没有写进游戏画质配置。随后用 Lovart 同一项目和线程只新生成一张第九版密实土源图，依据用户参考 10 和真实内壁近照，保留连贯压实切面，让松散颗粒集中在局部断口。源图、完整提示词与输出地址见 [Texture_TrenchPom.txt](../_import/Prompts/Texture_TrenchPom.txt)，仍是生成底色和亮度推导的数据图，不是扫描 PBR。

新源图 2048²；沿用 1024² Base / 512² Normal、Orh，合计 521,708 字节，与松土第三版共 1,107,322 字节。首遍烘焙边缘细节比 .872 未达原 .9 门槛，随后用既有 `detailBalance=.35` 对整幅图做轻度细节均衡，未改检查门槛：最终 luma .4207、std .0849、sat .2941、border .912、swing .0084、seamRatio .923、lowFreq .0138，无高低端截断。三个通道从记录重烘到独立目录，与当前资产及记录 SHA-256 逐项相同。

第五十六、五十七轮继续在相同曝光下比较第八/九版与断面对比强度。运行时密实土细节系数改为 `.55 × 2.2 = 1.21`，松土仍为 2.2；密实土 / 松土仍为 1.2 / 1.8 m 平铺、5 / 20 mm 视差，法线强度、光照和画质设置不变。当前缓存戳 `2026100941`。第五十四轮的土崖模型、连续弃土形状、路线与物理地形沿用不变。

本轮 `TextureStandardsTest` 3,712 项、`TrenchSurfaceTest`、`ModuleGraphTest` 与 `MotionVectorContractTest` 49 个 GPU 场景通过。最终 `Iteration58All` 覆盖 22 段 / 29 个高画质机位，`Whitebox58` 复查三个白盒机位；两档页面、控制台和 GL 错误为 0，爆破削低 0.606 m，三组邻近装饰裁除，Reset 恢复。几何及采样器布局未改，不把这些结果写成整套玩法门禁通过。对照页保留第五十四轮实机及用户参考，当前仍为本地迭代；大断口的自然形态尚有差距，未宣称与参考完全一致。

## 2026-10-09 后续：断续悬挑、沟沿承托与碎土层次

用户反馈差距仍大后，继续对照近照与 10 号图。四种土崖源模型沿用既有 imagegen 原型，经 BlenderMCP 重烘：大凹口从 3 / 7 / 6 / 8 处减为 2 / 3 / 4 / 3 处，凹深改为 4.5–11 cm，扩大凹底的连续切面；折角超过 60° 时保留硬边。仍各 272 三角，GLB 28,544 字节，正向厚度最大 0.171–0.256 m。源工程继续保存在规定的 OneDrive Blender 目录。

运行时原来的逐高度贴合会让模型顶部跟着物理坡肩后退，削弱源模型的悬挑。现在只把露出的前沿额外移向沟内，最大 32 cm，并以世界坐标噪声形成断续、深浅不一的崩口；背部裙边仍接回原沟沿。两端继续渐隐、相邻边界继续共享法线，无土垄出口不启用这一偏移。壕沟路线、沟底净空和共享碰撞高度场均未改。

沟沿土块按实际可见土皮的承托法线决定尺寸，并向悬挑处移近；此前用下方物理坡面判断，导致已落在平缓土冠上的土块仍被缩成 6.5 cm 碎粒。陡峭的可见岸面仍保留缩小规则。沟底每侧每站 12 次抽样，半径 2.5–14.5 cm，浮凸按半径的 .45–.80 倍取值；根须长 32–78 cm，基准半径 5 mm。29 cm 以上土块用高模，其余沿用现有分级，原预算不变。全网 CPU 实测 1,035 个土崖模块、33,152 颗土团、2,724 组根束；土层 1,091,691 三角，加草/石 33,691，共 1,125,382 三角 / 55 个静态分区网格。

密实土与松土分别采用有效颜色细节系数 1.65 / 2.2；材质源图、法线和视差深度不变。选择依据是第四十八轮的固定曝光比较，两个机位分别锁定 gain=1.3984375 / .8623046875 后比较 1.25–2.5 的颜色细节强度；第四十七轮未锁曝光的探针不作为定量对比依据。本轮没有重新生成贴图，贴图仍为下节所述 Lovart 底色和推导的数据图。

草根贴片跨越土冠高度突变时裁掉过度拉伸的三角形，避免贴图被拉成长条；新增 80 cm 台阶夹具，验证贴片保留正常部分且不跨越断口。土崖已有按实际网格贴合的细根，因此旧的、跟随物理高度场变形的草根模型只留给无土崖模块的旧坡皮分支。

当前缓存戳 `2026100939`。本轮 `TrenchSurfaceTest`、`AssetStandardsTest`、`TrenchPlanTest`、`FirstLevelFrontTopologyTest`（48 条路线）、`ModuleGraphTest` 与 `MotionVectorContractTest`（49 个 GPU 场景）通过。最终高画质 `Iteration54All` 覆盖全 22 段 / 29 机位，白盒 `Whitebox54` 复查三机位；两档页面、控制台和 GL 错误为 0，爆破实测削低 0.606 m、裁除三组邻近装饰，Reset 恢复几何和地面高度。材质混合沿用本轮第四十九次取证的 `TerrainBlendTest`，此后未改材质 shader 或贴图。原有整套 quick / prepush 基线失败仍见下文，不据此宣称全套通过。Blender 源工程已保存并关闭，本 worktree 的 `status --scan` 确认无残留实例，其他任务实例未操作。此轮仍为本地迭代，未发布；天然破碎分布和细节密度仍与参考有差距，未宣称完全一致。

## 2026-10-09 后续：分区断口与弃土体量

第四十六轮继续使用原 imagegen 四模块原型，由 BlenderMCP 重烘同一土崖源工程。移除覆盖整片内壁的周期起伏，保留微倾的连续铲切面；四种模块的损坏分别集中在侧缘、中部、壁脚及土沿下方。局部凹口用带偏斜的多边形范围与较平的凹底，土沿下方留真实凹入。只在大于 75° 的源模型折角分裂法线，普通小断口继续平滑，避免三角面显成突出的硬块。四件仍各 272 三角，GLB 26,716 字节；正向最大厚度 0.205–0.256 m。路线、共享物理地形及原接缝拟合方法不变。

沟沿土团半径改为 3.5–32 cm、浮凸 5–22 cm，外裙土团为 4–20 cm、浮凸 3.5–16 cm，仍受高度不超过半径 .8 倍及陡壁缩小规则约束。模型细节阈值改为半径 16 / 28 cm；高模接地回归用实际达到新高模区间的 30 cm 土团，露出面完整、隐藏面裁除和接地法线断言全部保留。当前全网 1,035 个崖壁模块、34,739 颗土团、2,804 组根束；土层 1,080,747 三角，加草/石 43,872，共 1,124,619 三角 / 55 个静态分区网格，低于原 1.15M / 64 上限。模型、材质和数据缓存戳为 `2026100933`。贴图沿用下节第八版与松土第三版，本轮没有重新生成贴图。

本轮 `TrenchSurfaceTest`、`AssetStandardsTest`、`ModuleGraphTest` 及 49 场景 `MotionVectorContractTest` 通过。最终高画质 `Iteration46All` 覆盖全 22 段 / 29 机位，白盒 `Whitebox46` 复查三机位；两档页面、控制台和 GL 错误均为 0，爆破与 Reset 检查通过。物理地形和路线数据未改，路线检查沿用第四十三轮的 48 条通路结果；本轮不据此宣称整关玩法回归全部通过。源工程已保存，BlenderMCP `stop` 后 `status --scan` 确认本任务没有残留实例，其他任务实例未操作。对照页增加上一轮实机切换，保留原始实机及两张参考。局部破碎形态与参考仍有差距，未宣称目标完全达到，继续保留本地审阅。

## 2026-10-09 后续：土崖切面材质与沟底碎土

第四十三轮沿用下节的四种土崖模块，按用户补充近照重新制作密实断面材质，并补足沟底碎土。本节为当前参数，下节第四十一轮及更早数字保留为历史取证。

- Lovart 本轮只新生成一张 `TrenchPom` 第八版源图，保留相连的铲削面、细孔与局部酥碎处。提示词与源图地址见 [Texture_TrenchPom.txt](../_import/Prompts/Texture_TrenchPom.txt)，实际源图 SHA-256、参数和输出散列见 [烘焙记录](../_import/TextureBakes/Texture_TrenchPom.json)。Base 1024²、Normal / Orh 512²，合计 524,112 字节；松土沿用第三版 585,614 字节，两套共 1,109,726 字节。仍为生成底色及亮度推导的数据图，不是扫描 PBR。
- 密实壁 1.2 m 平铺，烘焙对比 .085、细高度权重 .16、`flattenSigma=.18`、行列均衡开启；运行时颜色细节系数恢复 1.0，视差深度降到 5 mm。松土仍为 1.8 m / 20 mm。新图严格指标：luma .4207、std .0862、边缘比 .955、行列摆幅 .0155、seamRatio .947、lowFreq .0135，无高低端截断。三个通道按记录重烘到独立目录，均与现有资产和记录 SHA-256 一致。
- 沟底抽样从每侧每站 7 颗提高到 14 颗，平缓面的埋入比例为 .35；陡壁仍至少 .55，避免增加悬空土团。石块抽样概率 .16 → .04，把原预算留给土壤。土团先计算法线，再裁除三个顶点都低于物理地面 18 mm、且面中心低于物理地面 25 mm 的隐藏三角形；不用可见土皮的最高 Y 判断，以免裁掉倒悬下方可见部分。回归检查实际高模露出地面的所有面仍在，删除面均位于地面之下。
- 当前全网 1,035 个崖壁模块、34,825 颗土团、2,739 组根束；土层 1,101,848 三角，草/石 43,872，共 1,145,720，55 个静态分区网格。原有 1.15M 三角 / 64 网格门槛不变；地面仍为 871,520 三角。中心线、沟底、共享物理高度场与道路不变。取证目录为本地 `TrenchReferenceTenImplementation20261009/Iteration43All`；29 个高画质机位覆盖全 22 段，页面、控制台与 GL 错误为 0。实测爆破削低 0.606 m、裁除三组邻近装饰，Reset 恢复几何和地面高度。

默认白盒另取 `Whitebox43` 三个机位，显示与爆破恢复检查通过，页面、控制台与 GL 错误也为 0；两档截图均已查看。本轮 `TrenchSurfaceTest`、`TrenchPlanTest`、`FirstLevelFrontTopologyTest`（48 条路线）、`ModuleGraphTest`、`TextureStandardsTest`（3,712 项）和 `MotionVectorContractTest`（49 个 GPU 场景）通过。贴图门发现模型提示词曾放入纹理专用目录，现将其移到 `_import/ModelPrompts/` 并修复引用，没有放宽孤儿记录检查。采样器及 shader 布局未改，沿用下文已有采样器与混合回归结果；下文既有 quick / prepush 失败未因此消失。土崖方案已落地，近照中的自然破碎形态仍有差距，当前保留本地审阅。本轮未新开 Blender，收尾 `status --scan` 确认本 worktree 无实例；其他任务的 Blender 实例未操作。

## 2026-10-09 补充：按用户近照改用模块化土崖内壁

用户补充近乎直立、带凹洞和悬挑土沿的开挖断面照片，并要求采用成熟的山体崖壁处理方式。本节覆盖下节旧坡皮方案：大尺度断口由实际网格承担，密实土与松土继续使用世界坐标投影的现有 PBR。材质不跟随模块尺寸拉伸；壕沟走向、沟底、共享碰撞高度场与地形指纹保持原值。

- 内置 imagegen 生成一张四模块原型表，再由 BlenderMCP 执行 [_import/Script_BakeTrenchCliffWalls.py](../_import/Script_BakeTrenchCliffWalls.py) 重建 [Model_TrenchCliffWalls.glb](../Model/Model_TrenchCliffWalls.glb)。生成提示词原文见 [Model_TrenchCliffWalls.txt](../_import/ModelPrompts/Model_TrenchCliffWalls.txt)。这是手工规则重建的低模，不是扫描资产，也不是自动从图片恢复的几何。
- 源工程 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/TrenchCliffWalls/Scene_TrenchCliffWalls.blend`，该目录同时保留两张参考图、提示词及顶点边界测量。四种模块为 SpadeFace / TornFace / LowerScar / RootCrown，各 272 三角，合计 1,088 三角，GLB 25,564 字节、一个材质。实测 glTF：X 沿沟宽 1.5 m、Y 向上约 2.03–2.05 m、+Z 朝沟内，背裙 Z=-0.06 m，正向最大凹凸 0.209–0.236 m。
- 运行时按原测站和原物理岸坡拟合高度，保持沟底净空。随机选择四种形体，前脸具备真实凹口与倒悬，顶部回折埋入弃土冠部。显式无弃土垄的出口及单侧土垄的空侧不抬高冠部，模型顶部超出的高度也被收回原岸顶。相邻端点共用切土面；只渐隐局部破损，不把整块厚度归零，避免等距柱状鼓包。变形后在共同边界平滑法线。侧边不加跨越整面高度的封口四边形，因为它会穿过弯曲后的剖面，产生三角露边。
- 根须改为朝土壁的水平射线贴合，并按需要弯折；有倒悬的表面不能用最高 Y 来决定根须落点。独立测试对实际三角形计算三维最近距离，另查双方朝向、倒悬面、边界法线、沟底净空及原路线不变。模型变形后同步重算球形/盒形包围体，以免射线仍用源模型原点的范围而漏掉全部根须。
- 全图当前铺设 1,035 个模块，沿用 60 个静态分区网格；无逐模块 Mesh、碰撞体或每帧更新。土壁不再散铺旧三颗颗粒；微小土团的 8 面阈值调到 7.3 cm，把面数留给实际崖壁。CPU 统计：土团 27,880、根束 2,815，土层 1,067,688 三角，加草/石 78,176，共 1,145,864，保留原有 1.15M / 64 上限。

重建仍从本任务 worktree 运行 `Script_BlenderMcp.mjs start --blend <上述源工程> --task TrenchCliffWalls`，通过 `exec --code` 调用 `runpy.run_path`，完成后 `stop` 与 `status --scan`。本轮已关闭本任务实例；最终 `status --scan` 显示本任务无实例、全机亦无残留。中途发现的其他实例未操作。

第四十一轮取证目录为本地 `TrenchReferenceTenImplementation20261009/Iteration41CliffAll` 与 `Whitebox41Cliff`。高画质 29 个机位覆盖全 22 段，白盒另查 3 个机位；实际统计与上述预算一致，页面/控制台/GL 错误均为 0，截图已查看。两档实测爆破削低 0.606 m、四组装饰裁除，Reset 恢复原几何与高度。本轮 `TrenchSurfaceTest`、`TrenchPlanTest`、`FirstLevelFrontTopologyTest`（48 条路线）、`ModuleGraphTest` 通过，49 场景 `MotionVectorContractTest` GPU 门通过。本轮未修改贴图、采样器布局或物理地形。此前 quick / prepush 的已知失败仍见下节，不据此宣称全套通过。局部断口已进入实际几何，模块露边与规则柱状起伏已修正；形态和材质仍未宣称与参考照片完全一致，当前保留本地审阅。

## 2026-10-09：按用户选中的 10 号土壤参考迭代

本次外观目标是用户从十张 imagegen 图中选中的 `Reference_TrenchEarth_10.png`。历史照片 01 / 14 继续约束开挖形态；当前材质以 10 号图的灰褐、哑光、颗粒与断面为准。参考图及实机对照只存本地 `C:/Users/Bentl/.codex/artifacts/TrenchReferenceTenImplementation20261009/`，不随站点发布。

- 所有 22 段共用同一表面生成器。中心线、物理高度场、宽深、分岔、路由与地形指纹不变。弃土外裙增加浅表细节，继续随弹坑裁除；不是新的行走面。
- `TrenchPom` 为密实断面，`TrenchLooseEarth` 为沟沿、弃土与土团。两套 albedo 由 Lovart 制作，来源 thread、提示词、散列及重烘参数记在纹理清单。法线、AO、roughness 和 height 由烘焙器推导，不宣称实测扫描或真实配准高度。
- 地形数组增加第 6 层，仍只用原有两个数组采样器。陡壁用密实土，沟沿与外裙用松土；近水平沟底混入 82% 松土颗粒。合批前松土团 UV=(-8,-9)、弃土皮 UV=(-8,-8)，合批后均转换到 `terrainLayers.w=-2`；嵌在切土壁里的颗粒 UV=(-6,-9) / w=-1.25（避开道路的 [-1,1] 横向坐标），整个颗粒使用密实土，包括朝上的顶面，避免亮色松土像石头贴在土壁上。保留不同 UV 便于诊断时单独隐藏土团。细根以 UV=-16 / w=-3 保留独立浅褐色及圆柱法线，仍和土层合批。基础地面原车辙坐标不变，壕沟纯土分支不计算车辙。两种数据图仍为 linear，Base 仍为 sRGB。
- imagegen 先出六件土团原型，随后 `_import/Script_BakeTrenchClods.py` 经 BlenderMCP 重建 `Model_TrenchClods.glb`。源工程为 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/TrenchReferenceTen/Scene_TrenchClods.blend`。六种形体各有 160 / 40 三角版本，共 12 件、1,200 三角，共享一个材质；标准化水平半径约 1，glTF 为 Y-up，埋入底部在 Y<0，运行时按米缩放。按坡面缩小后再选择细节：半径至少 20 cm 用 160 面、12–20 cm 用 40 面、5.2–12 cm 用 20 面，更小的用 8 面。当前全网实际使用高模 1,034 件。高度受半径约束，避免细长尖石。坡皮为 8×8 网格，起伏按沿沟距离与立面高度采样；外裙为 6×8，同样保留每条带 96 三角，并与坡皮共享八段沟沿边，避免不同细分造成裂缝。两侧共用不规则冠部起伏。土团保持实体上部，底部单独向下贴土；陡壁颗粒最多 6.5 cm 半径。埋入脚部约 2.5 cm 范围的法线衔接可见土面，露出部分保留自身形体，物理地面不变。
- 沟沿土团为 3.5–23 cm 半径，按世界位置改变疏密，以 1.5 次幂分布让小颗粒仍比大土团常见。每侧站点配置 16 次沟沿抽样、3 颗土壁颗粒及 7 颗沟底碎土；沟底散布延伸到中央，仍偏向壁脚。暂不布设 `Flake` / `CutShoulder` 两种容易呈石片状的形体，其源资产仍保留。简化颗粒焊接重复顶点，让相邻面共享法线；极小颗粒的 8 面替代部分 20 面，把预算留给较大土团和根须弯折。当前 31,142 颗中密实壁土 4,447 颗、松土 26,695 颗。细根概率 0.6、每组 5 根、长度 22–50 cm，并略提亮为干根色。
- 土皮先建完，再用实际三角形建立临时高度索引。土团和根须采最高可见土面，兼容邻沟交会；草根毯沿用同一索引的冠部筛选模式。根须每段在 1/4、1/2、3/4 处检查直线与土皮的偏差，大于 1.2 cm 时最多细分两层。独立 Raycaster 回归直接对土皮网格测根须，避免只验证同一套高度公式。第三十五轮全网 CPU 诊断的 53,855 个根段采样中，23 个低于土面 5 mm、没有高出 5 cm 的采样；这属于几何接地证据，不代替截图验收。
- 大土团与微颗粒不能使用相同高度幅度。烘焙器可选 `--height-fine-weight`（旧流程默认仍为 0.45），当前断面 0.12、松土 0.05；`--detail-balance` 均衡整幅图的细颗粒对比度，不改变门槛或只修接缝边缘。参数写进记录，`--rebake` 可复现。实机断面 / 松土分别为 1.2 / 1.8 m 平铺、最大视差 7 / 20 mm，在 3–12 m 淡出；近水平表面减小幅度。两套颜色、法线和高度各自使用相同 UV 频率，导数与高度 mip 同步修正。断面额外对比系数 0.75，保留密实面；混合边界先淡出视差，再切换主高度层，避免每步重复采两层高度。
- 贴图仍在第一关加载地形数组时按需取得，不增加开机 PBR_SETS。当前两套磁盘合计 1,062,086 字节（约 1.01 MiB）；既有总贴图预算 62 MiB、单套/单图与分层预算均不放宽。新增一层数组含 mip 约占 6.67 MiB GPU 内存。密实断面采用 Lovart 第七版铲削土面与酥碎断口，本轮仅生成一张新源图；烘焙以 `flattenSigma=.18` 和行列均衡去除源图中的低频明暗，细节对比系数 .070。严格门全部通过（lowFreq 0.0194、边缘比 0.937、行列摆幅 0.0133），三通道合计 476,472 字节。松土仍用参考右下方区域重做的第三版，共 585,614 字节；实际源图、hash 和参数以烘焙记录为准。

重建命令：用 BlenderMCP `start --task TrenchReferenceTen --blend <上述源工程>`，再通过 `exec --code` 执行 `runpy.run_path` 调用烘焙脚本，完成后 `stop` 并 `status --scan`。贴图使用 `Script_BakePbrTexture.py --rebake _import/TextureBakes/Texture_<Name>.json`，源图必须仍存在且 hash 相符。自动取证入口 `Script_TrenchReferenceShots.mjs` 默认遍历 22 段及七个固定机位；`--focus=CrestAlong,EarthFace` 可只复查两张，`--out=` 指向本地成果目录。

验收入口：`TrenchSurfaceTest`（GLB 尺寸、六种形体、沟沿接缝、物理地面与材质标记）、`TrenchPlanTest`、`FirstLevelFrontTopologyTest`、`TextureStandardsTest`、`ModuleGraphTest`、`FirstLevelMissionFortificationsTest`、`SamplerBudgetTest --only=firstLevel`、`TerrainBlendTest`、`MotionVectorContractTest`。实机取证与尚未通过项记录在本地日志；图片改善不等于所有门禁已通过。

当前本地取证：第三十五轮高画质覆盖 22 段和七个固定机位，另查默认白盒三个机位；页面/控制台/GL 错误均为 0。壕沟装饰合计 1,133,618 三角 / 60 个分区网格，低于现有 1.15M / 64 预算，基础地面仍为 871,520 三角。高画质与白盒分别实测炮击削低 0.606 m、四组装饰被裁除，Reset 后源几何和地面高度完全恢复。本轮壕沟表面、规则、48 条路线与关键射界、模块图门通过；表面门新增坡皮与弃土皮共用沟沿的接缝检查及独立射线测根须贴合，保留实际 GLB 高模选用和埋入脚部/露出顶面的法线验证。第三十一轮材质 GPU 门已验证密实土团顶面、松土和细根各自的颜色，以及六种 [-1,1] 道路坐标。第三十轮通过第一关 low / medium+GI / ultra+GI / whitebox 采样器门，最大为 16；此后未改变采样器或 uniform 布局。本轮新贴图通过第三十三轮 3,712 项贴图门，并将六个通道重烘到独立目录，逐文件 SHA-256 完全相同。49 项运动向量 GPU 场景沿用第二十六轮结果，本轮未改运动向量实现。

性能取证采用同一机位（FlankBreachSap）、每批 21 帧的冻结场景。第十九轮三批中一批 GPU 查询未返回、另两批为 16.94 / 29.72 ms；第十八轮有效批为 14.41 / 16.93 ms，未修改基线为 13.22–19.79 ms。运行环境有明显计时波动，这些数据不足以断言没有性能回退，也不能写成稳定的游戏帧率。第三十五轮单帧调试器记录另存本地，不与上述无逐绘制钩子的批次计时混算。全套截图和日志在本地成果目录；外观仍在对照参考 10 迭代，尚未宣称完全一致或发布。已改善断面纹理、碎裂沟沿、土团接地和细根显露；土壁整体仍偏平顺，大尺度破碎密度尚有差距。本轮未启动 Blender；收尾 `status --scan` 为本任务无实例，全机亦无残留实例。

已知未通过项：全套 quick 为 116/120；CharacterSpeech 缺“呃啊”、P012Visibility 夹具缺 `manualPoses`、PontoonBridge 指纹差异在未修改主检出亦复现。音频严格门的解码器缺失，直接检查 `ffmpeg` 为 ENOENT，未改音频资产。Fortifications 的 FrontCommunication 双向卡点、到达点数和终点坐标与 2026-10-07 的既有日志相同，其余 40 条双向走位完成；不放宽断言。prepush 在同一 CharacterSpeech 基线失败处停止。

## 2026-10-07 补充：实体沟形与连续弃土垄

用户补充要求按参考图调整**壕沟形状，以及地面上挖出来的土连成土包状小隆起**。上一轮只有材质和浅表细节，尚不足以表现这个轮廓；本轮把沟壁剖面和弃土垄写进共享高度场。照片来源见下节，01 用于地面翻土土包、14 用于紧实切土断面；尺寸是兼顾游戏通行的美术取值。

- `TRENCH_EARTH_PROFILE` 由第一关网络显式启用，旧网络与 legacy 夹具保留原式。深度至少 1.4 m 的沟壁中段变陡，沟脚、沟顶仍平滑收口；浅观察 / 撤退刮沟保持原坡度。所有 22 段的中心线、控制点、圆角、分岔、站点、沟底宽度和标称深度逐项不变。
- 普通沟外抛土的基准高度 ×2.8、宽度 ×1.5；高低和宽窄按世界位置噪声变化，峰顶在横断面靠沟一侧，外裙缓缓落回原地。独立沟段实测峰高 0.48–0.72 m，沿线连续。不是逐个球状模型，也不另加一层无碰撞的土包。
- 明确写过 `bermH` 的段继续尊重原值，攻路支沟也保留 0.25 m 的低土沿以维护炮塔机枪射界。岔口对所有邻沟作并集避让，0.4 m 过渡带消掉相交土垄的断崖；道路、场坪与出口继续使用现有压平 / 缓坡规则。
- 渲染、Rapier、人物贴地、弹坑均吃原来的共享地形；翻土材质覆盖完整外裙，编辑器剖面补齐土垄峰顶。原表面贴图不重新生成，未新增 Blender 模型。

与 `f3d70dcb` 的范围审计：67,348 个地面采样中 1,024 个改变，全部落在壕沟影响范围内；深浅沟交会的观察支沟边缘有一个原采样点降低 0.092 m，原观察视线和路线门禁仍通过。3,475 个体块的 ID、平面坐标、旋转和占地均不变，91 个仅按新地面调整 Y / 高度。07+ 指纹因用户授权的实体地形变化更新为 `trench-spoil-profile-20261007`：56,048 点中 588 点变化、66 个体块接地高度变化，2 件壕沟道具和 191 个战后人物指纹原样保留。保留完整指纹断言，另加全场壕沟外地面逐点不变、原路线 / 站点不变、土垄连续与邻沟净空检查。

本轮高画质七机位截图及 Frame Debugger 捕获无页面 / GL 错误；地面 871,520 三角（上一轮 851,056），壕沟表面装饰 499,996 三角 / 63 个分区网格（上一轮 500,964 / 63）。`TrenchPlanTest`、`TrenchSurfaceTest`、`TerrainLayersTest`、`ModuleGraphTest`、`FirstLevelSpaceTest`、`FirstLevelFrontTopologyTest` 通过，含 48 条路线及关键射界。实机 42 次双向壕沟胶囊走位仍为 40 次到达，只有既有 `FrontCommunication` 集结处土墙卡点的两个方向未到达；未放宽门禁。其余实机与发布验证记在本地 `C:/Users/Bentl/.codex/artifacts/TrenchSpoilProfile20261007/`。

默认白盒实机另验：物理胶囊沿新土垄完成 10 m 行走，10 个检查点脚底与地面一致；炮击在约 0.599 m 高的土垄处削低 0.566 m，附近四组装饰随之裁除，Reset 恢复原高与原几何。93 个 GPU 程序成功链接，最大 12/16 采样器，无页面 / GL 错误。quick / prepush 仍在上一轮已于主检出复现的 `CharacterSpeechTest` “呃啊”拼音表覆盖处停止，不能称全套通过。

补充定向门禁 `MotionVectorContractTest`、`FirstLevelMissionTest`、`FirstLevelP012TerrainTest`、`FirstLevelWhiteboxTerrainTest`、`TrenchEditorTest` 全部通过；编辑器浏览器验收含选择、改参、预览、导出与退出。未把历史旧章节开机结果冒充本轮通过。

## 2026-10-07 第一轮：历史照片 01 / 14 表面材质

当前外观采用 [Notion《台儿庄战役历史照片汇总｜壕沟、工事与战地生活》](https://app.notion.com/p/3df60335331c81c28d74e074bfd31aaf) 的 01「村落附近的壕沟阵地」与 14「战壕里的读报小组」。01 参考厚实、不规则的翻土沟沿；14 参考大片紧实的切土壁、浅铲痕、局部崩口与零星草根。14 仅作同期形态参考，不认定为台儿庄或滕县现场；两张都是黑白照片，游戏颜色为美术取值，不从透视图反推精确宽深。

- `BuildTrenchEarth` 保留连续坡皮，以宽缓的土体起伏和浅竖向铲痕取代密集颗粒，坡肩在既有坡面范围内稍突出，接缝仍共享端点并渐隐。装饰不进入沟底、不新增碰撞，不修改中心线、分岔、宽深参数、共享高度场、掩体、角色路线或地形指纹。
- 减少坡面散块和沟脚碎屑；沟沿改为较宽而低的嵌入土块，碎石更小、更稀疏，草毯从连续覆盖改为零星短根。继续按原分区合批、随弹坑裁除，不增加逐件 Mesh。
- `TrenchPom` 换为一张内置 imagegen 生成的紧实灰褐土壁，浅裂纹、细孔和铲痕；生成一次，无付费回退。完整提示词与旧版提示词保存在 [_import/Prompts/Texture_TrenchPom.txt](../_import/Prompts/Texture_TrenchPom.txt)。Base 为 1024²、Normal / Orh 为 256² 无损，1.8 m 平铺、18 mm 最大视差；高度和法线是亮度推导，不是实测扫描。烘焙参数与 hash 在 [记录](../_import/TextureBakes/Texture_TrenchPom.json)。整套 589,124 字节。
- 源图保留于本地 `C:/Users/Bentl/.codex/artifacts/TrenchPhotoStyle20261007/Texture_CompactTrenchSource.png` 和内置生图输出目录。重建用 `Script_BakePbrTexture.py --rebake Taierzhuang1938/_import/TextureBakes/Texture_TrenchPom.json`（换机器时将源图放回记录中的位置或更新 source.path）。原连续高度场网格适合这次外观调整，无需新建 Blender 模型或另铺模块化壕沟。
- 表面回归补充实际生成网格的沟底净空、浅起伏包络、相邻条带接缝与规划数据不变检查。实机截图使用默认白盒和 `quality=high`，只作外观取证，不视为整关正常通关。

本轮实测：五个固定机位分别拍摄改前高画质、改后高画质、改后默认白盒；页面错误和 GL 错误均为 0。壕沟装饰由 1,137,268 三角 / 64 个分区网格降为 500,964 / 63。`TrenchPlanTest`、`TrenchSurfaceTest`、`TerrainLayersTest`、`TextureStandardsTest`、`AssetStandardsTest`、`ModuleGraphTest`、`FirstLevelMissionTest`、`FirstLevelFrontTopologyTest`、`FirstLevelSpaceTest` 通过；后方 56,048 个地面点仍匹配原指纹。`MotionVectorContractTest` 的 49 项 GPU 场景通过。

第一关高画质炮击实测：沟壁下陷 0.613 m，四个附近土皮 / 石块 / 草根分区被裁除，Reset 后全部源几何和地面高度恢复；234 个程序成功链接，最大 14/16 采样器，无页面及 GL 错误。`BootStallTest` 通过。`BootTest` 旧序章通过，旧 `CH1_NanLu` 报“日军远景辨识材质未接全 count=0”，随后整组达到 240 秒上限；七场景检查未完成，不能计为通过（相同历史错误亦记录在旧参考图 07 验收中）。

`FirstLevelMissionFortificationsTest` 的表面生成、有限坐标、形变标记、合批预算及掩体包围盒检查通过；42 次双向走位有 40 次通过，`FrontCommunication` 的两个方向均被集结处既有土墙阻挡。用未修改的 `7d040069` 主检出只读起服复测：全部 42 项的到达点数和终点坐标逐项相同，未改弱断言。quick / prepush 均在 `CharacterSpeechTest` 的“呃、啊”拼音表覆盖处中止，主检出同样复现；不能称全套门禁通过。原图、同机位对照和本轮日志留在本地 `C:/Users/Bentl/.codex/artifacts/TrenchPhotoStyle20261007/`。

以下为此前迭代记录；与本节冲突的外观参数以当前数据表为准。

2026-09-28：土壁换成冷灰棕 Lovart 贴图、湿泥积水并入地形统一的水位模型、翻土让位给车道，见文末「2026-09-28 对标 3A」。

2026-09-26 第四次迭代：此前视觉结果仍未通过用户验收。本轮重做土壁颜色/高度素材、增加自适应 POM，并用实际可见地形的 G-buffer 混合石土交界；前三轮的连续坡皮、嵌石与冠部根毯保留。入口是 `FirstLevelWhiteboxField.PrepareAssets / BuildWhiteBoxes`；参数在 `Data_TrenchSurface.mjs` 与 `Data_TrenchAppearance.mjs`。关卡路线、沟宽、沟深及碰撞高度保持原契约。

## 表面与接地

- 土壁使用本轮内置 imagegen 制作的颜色与配准灰度高度图。它们是生成素材与推断高度，不是摄影测量；两份 PNG 源图和派生 WebP 一起保留。根据首轮实机中颗粒过重的问题，选用第二版较平整的黏土、浅裂缝与少量碎石。Lovart 当前无可用插件、本机脚本或浏览器入口，实际供应商不能写成 Lovart。提示词与来源见 [Data_TrenchPomPrompt.md](Data_TrenchPomPrompt.md)。
- 三向投影的近景 POM 按视角/距离使用 8–28 步射线行进，再做四次二分求交；所有材质通道使用同一命中 UV，采样 mip 由原始世界导数决定。1.5 m 纹理尺度，土壁最大高度差 5 cm；近水平地面减少到 18%，防止沟底拉丝。6–18 m 渐隐，六次高度搜索只给直射光加自阴影。
- `BuildTrenchEarth` 用相邻测站之间的连续 12×8 网格覆盖坡面，取消沿测站反复鼓起的独立块状坡皮。细土块、碎石先沿采样到的坡面法线转向，再让足迹贴合高度场，避免陡坡上垂直压扁的三角薄片。其高度扰动只属于视觉装饰，不产生另一个导航或碰撞面。
- 湿润凹处直接取同一套生成高度、坡度与世界噪声，不再用另一张泥块图覆盖土粒法线。旧 `Texture_TrenchMudHeightMask.png` 仍保留在资产及重建入口，但新材质不采样它。湿润只轻微压暗，高光集中在接近平面的凹处，陡壁保持较高粗糙度。
- 泥层通过表面补丁在光照前修改颜色、法线、粗糙度和材质 AO；不另铺透明发亮平面。湿地表接既有 SSR。四方向、两段距离的世界高度遮蔽加强沟底与壁脚的间接光遮挡，使用随爆炸更新的接触高度场；POM 高度自阴影只乘直射项，AO 仍只作用于间接光。
- 新增 `TerrainBlendPass`：TAA 抖动后、normal/depth 预通道前，单独绘制带 `terrainBlendSource` 标记的地形、可见坡皮与弹坑，复用原材质与实时几何。两张全分辨率 RGBA16F 靶存线性 albedo/roughness 与视空间 normal/linear depth。石材在光照前读取同像素的地形通道，以视深差投影到地形法向后的距离生成约 10 cm 平滑过渡；没有透明叠层。预通道使用同一 mask 混合法线，几何深度及速度仍然属于石块。
- 无浮点靶或关闭该 pass 时，保留 `TerrainContactField` 物理高度接触回退；该网格继续服务土坡间接遮蔽、爆炸更新与 Reset。正常画质的可见交界由材质缓冲决定，能够跟上高于碰撞面的碎土坡皮。零深度、无来源场景与旧缓冲失效都有处理。此屏幕空间近似不能消除石块本身的几何轮廓，斜视和遮挡处仍受屏幕可见地形限制。
- 自然岩石 PBR 装入既有地形纹理数组的第 5 层，仍只占两只 array sampler；四层地形的权重和均值接口不变。土壤和碎石共用一只接触高度场 sampler，取消材质的独立泥块 sampler。石材新增两只屏幕缓冲 sampler；本轮 GI 开启时石材 15、地形弹坑最大 16，仍须跑 sampler 门禁。

第一关 `firstLevelBattleDay` 保留阴云、硝烟与原太阳方向，提高主光与曝光、降低均匀填充光，让土坡明暗可读；云层本身也提亮。共享模型验收日光和夜间预设不变。数值只在 `Script_Sky.mjs` 的该预设维护。

这是现有 WebGL2 前向管线中的地形专用材质 G-buffer 与接收材质混合，并非完整延迟渲染或运行时虚拟纹理系统。

## 模型、许可与重建

`Model_TrenchStone.glb` 为 80 三角的原创破碎石块。`Model_TrenchDryGrass.glb` 为 1040 三角、带细侧枝的根束，仅少量布设并和碎土共用分区；导出顶点云为 Y 向上、下垂方向为局部 -Z。主要覆盖沿用 `Texture_TrenchRootMat.png`（2026-09-28 转 `Texture_TrenchRootMat.webp`：有损 q95、alpha 无损，2.34 MB → 0.79 MB）：内置 imagegen 单张生成、保留真实 alpha，8×6 网格逐点贴合坡面，随机尺度与左右镜像；alphaTest 0.42，不使用半透明排序。构建时为冠部土块和上坡皮建立临时三角形高度索引，让两片较小根毯贴到实际可见的土层上，间隙为 1.8–4.8 cm。所有网格走 BuildSink，无逐簇 Mesh。本轮没有修改 Blender 几何；土壁位图按上文重新生成。

枯草根毯的完整生成提示词见 [Data_TrenchRootMatPrompt.md](Data_TrenchRootMatPrompt.md)。PNG 是运行资产，源图同时保留于生成工具的本地输出目录；不依赖外部素材站授权。

本轮可编辑工程保存于 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/TrenchSurface/Scene_TrenchNaturalSurface.blend`，前版工程保留。重建入口 `_import/Script_BakeTrenchSurface.py`，通过仓库 BlenderMCP 生命周期脚本运行：

```powershell
node scripts/Script_BlenderMcp.mjs start --task TrenchSurface
# 将下面路径替换为本任务 worktree 的绝对路径；runpy 提供脚本需要的 __file__。
node scripts/Script_BlenderMcp.mjs exec --code "import runpy; runpy.run_path(r'<worktree>/Taierzhuang1938/_import/Script_BakeTrenchSurface.py')"
node scripts/Script_BlenderMcp.mjs stop
node scripts/Script_BlenderMcp.mjs status --scan
```

石材来自 [Poly Haven Rock Boulder Dry](https://polyhaven.com/a/rock_boulder_dry)，CC0；摄影 Dimitrios Savva、处理 Rico Cilliers。`_import/Script_ImportTrenchMaterials.py` 从官方 API 获取源文件并转换为游戏 WebP：Base 1024²、Normal/ORM 512²；Base 使用 sRGB，其余使用线性数据，法线为 OpenGL 方向。旧基础泥土 Brown Mud 02（Rob Tuytel，CC0）及其导入脚本保留，但当前壕沟翻土层使用新生成贴图。草簇、石块几何及附加泥土高度遮罩由本仓重建脚本生成。

## 形变与验证

地表、土块、碎石和枯草都登记到 TerrainDeformationView。装饰物必须裁除所有朝向的三角形，包括向下的叶片与石块底面；仅裁向上三角形会留下悬空残片。每次 Flush 更新受影响范围的接触网格；Reset 恢复基底高度与原始几何。装饰物不另造可行走平面或修改 NPC 导航。

根毯的 map alpha 同时接入 Prepass 的 normal/depth 与 velocity 裁切，自动取源材质贴图、UV0 变换、alphaTest 和 opacity，保留对象原有回调。`MotionVectorContractTest` 增加半透明孔洞夹具的像素覆盖与实际运动检查；不是把世界植被标记为前景或排除速度。独立 alphaMap / 其它 UV 通道不属于此次新增支持范围。

`FirstLevelMissionFortificationsTest` 将已经过期的“圆柱根数量 / 15 万土块三角”断言改为实际根毯与嵌石存在，并对三种装饰的合计设置 115 万三角、64 个分区网格上限；不能只统计土块而漏掉草。

静态门禁：`Script_TrenchSurfaceTest.mjs`（源网格隔离、非单位网格更新/重置、模型方向及资产约束）、`Script_TerrainLayersTest.mjs`、`Script_ModuleGraphTest.mjs`。浏览器门禁：`Script_TerrainBlendTest.mjs` 读取实际颜色、法线、粗糙度、渐变 mask 和 prepass 像素，并测试几何移动、隐藏、Resize 与 Dispose；`Script_SamplerBudgetTest.mjs --only=firstLevel` 覆盖 low、medium + GI、ultra + GI，并确认湿泥、碎石和弹坑变体真实编译；形变走 `Script_CraterSurfaceTest.mjs`。资产还通过 `Script_AssetStandardsTest.mjs`。

材质诊断沿用地形已有的 `?terrainView=` 入口：4 湿润度、5 粗糙度、6 石土混合权重；不是后期 Debug Rendering 的新 pass。实际截图、材质诊断和爆炸取证只保存在本地忽略目录，不进入 Pages 仓库。关卡仍有白盒建筑；这些表面改动不能作为整场景已达到参考图画质的证明。

## 新土壁贴图重建

**2026-09-28 起本节只描述旧版（偏红橙的 2026-09-26 土壁）**：现行 `TrenchPom` 由 Lovart 源图经 `Script_BakePbrTexture.py` 烘出，见下一节；旧脚本不带 `--legacy-20260926` 拒绝运行，免得把新图覆盖回旧图。

运行 `python Taierzhuang1938/_import/Script_BakeTrenchPom.py --legacy-20260926`（需要 Pillow、NumPy）。源颜色与灰度高度同尺度重采样、同位置接边；高度先抑制细粒尖峰，再派生切线法线和邻域 AO，roughness 与高度打包为 Orh。Base/Orh 为 1024²，Normal 为 512²。法线按 1.5 m / 5 cm 标定，运行时另有艺术强度。高度推断仍有生成误差，不能作为真实扫描精度的承诺。

## 2026-09-28 对标 3A：冷灰棕土壁、沟底湿泥积水（3A 迭代 B2 地面）

- **土壁贴图**：`Texture_TrenchPom{Base,Normal,Orh}` 换成 Lovart 生成的冷灰棕湿黄土（土块、细根、小石子；提示词
  `_import/Prompts/Texture_TrenchPom.txt`，thread 与烘焙记录见 `Data_TextureManifest`），按[贴图资产规范](Data_TextureAssetStandard.md)
  用 `Script_BakePbrTexture.py --pack orh --normal-convention terrain --tile-m 1.5 --reliefM 0.05` 烘：均色饱和 0.53 → 0.36，
  整套 2.0 MB → 0.6 MB。高度改由亮度带通推（不再有配准高度源图），Orh 半分辨率有损；POM 仍读反照率数组 alpha 里的高度。
  缓存戳 `TRENCH_SURFACE.version`。
- **湿泥与积水**：原来的 `gTrenchWet`（噪声 × 平地 × 低处，只压暗 12%、粗糙度 0.28）换成地形统一的水位模型
  （`Data_Tuning_Terrain.TERRAIN_WATER`，口径在 [分层地形 §8.4](Data_TerrainLayers.md)）：沟底由接触高度场四向
  1.2 / 3.2 m「四周比这里高多少」判出（`lowRiseM`），沟底底湿度更高、水位抬高，水洼顺着 POM 高度走，粗糙度 0.05 接 SSR；
  沟沿与抛土顶四周更低，不积水；坡上不积水。`Data_TrenchSurface.mud` 里的 `roughWet` / `darken` 删除。
  `?terrainView=4` 仍是湿度，`7` 看车辙/积水/湿痕。石材（`TrenchStone`）不上水。
- **翻土让位给车道**：翻土权重改 `g·(1−r)`，与基础地形同口径；06 集结洼地、沟切断路的地方由
  `SampleMissionGroundSurface` 决定谁是路谁是沟（[分层地形 §8.3](Data_TerrainLayers.md)）。
- **石材法线**：`TrenchStone` 的 Poly Haven `nor_gl` 在 terrain 约定数组里绿通道反了，Stone 段着色器里翻绿补偿；
  它 Orm 的 B（金属）落在数组 alpha，石材那段不读 alpha。
- **01–05 前沿湿泥区**（第二轮，对标分镜 03–06）：开场段沟壁/沟底更暗更冷、整片湿、沟底积水更多，开场布景土皮同色；区与数值在 `Data_Tuning_Terrain.TERRAIN_MUD_ZONE`，口径见 [分层地形 §9](Data_TerrainLayers.md)。07 以后不受影响。
- 木护壁/踏板仍按概念图 07 关闭（[Data_TrenchReference07.md](Data_TrenchReference07.md)），本轮不恢复。
- 门禁：`Script_TrenchSurfaceTest`（湿/干粗糙度范围改读 `TERRAIN_WATER`）、`Script_TextureStandardsTest`（`TrenchPom` 已移出 legacy）、
  `Script_TerrainBlendTest`、`Script_SamplerBudgetTest --only=firstLevel`、`Script_CraterSurfaceTest`。
