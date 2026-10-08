# 通用壕沟表面

## 2026-10-09：按用户选中的 10 号土壤参考迭代

本次外观目标是用户从十张 imagegen 图中选中的 `Reference_TrenchEarth_10.png`。历史照片 01 / 14 继续约束开挖形态；当前材质以 10 号图的灰褐、哑光、颗粒与断面为准。参考图及实机对照只存本地 `C:/Users/Bentl/.codex/artifacts/TrenchReferenceTenImplementation20261009/`，不随站点发布。

- 所有 22 段共用同一表面生成器。中心线、物理高度场、宽深、分岔、路由与地形指纹不变。弃土外裙增加浅表细节，继续随弹坑裁除；不是新的行走面。
- `TrenchPom` 为密实断面，`TrenchLooseEarth` 为沟沿、弃土与土团。两套 albedo 由 Lovart 制作，来源 thread、提示词、散列及重烘参数记在纹理清单。法线、AO、roughness 和 height 由烘焙器推导，不宣称实测扫描或真实配准高度。
- 地形数组增加第 6 层，仍只用原有两个数组采样器。陡壁用密实土，沟沿与外裙用松土；近水平沟底混入 82% 松土颗粒，独立土团强制松土。合批前以 UV=-8 保留土团/弃土标记，合批后转换到 `terrainLayers.w=-2`；细根以 UV=-16 / w=-3 保留独立浅褐色及圆柱法线，仍和土层合批。基础地面原车辙坐标不变，壕沟纯土分支不计算车辙。两种数据图仍为 linear，Base 仍为 sRGB。
- imagegen 先出六件土团原型，随后 `_import/Script_BakeTrenchClods.py` 经 BlenderMCP 重建 `Model_TrenchClods.glb`。源工程为 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/TrenchReferenceTen/Scene_TrenchClods.blend`。六种形体各有 160 / 40 三角版本，共 12 件、1,200 三角，共享一个材质；标准化水平半径约 1，glTF 为 Y-up，埋入底部在 Y<0，运行时按米缩放。半径至少 0.27 m 的土团使用细轮廓，0.12 m 以下用简化颗粒；高度受半径约束，避免细长尖石。沟沿按世界位置改变疏密，横向和纵向散布，小颗粒比大土团更常见，避免等距珠链。坡皮改为 8×8 网格，将部分面数用于沟沿颗粒；外裙仍为 8×6。土团的上部与碎石保持实体形状、沿坡面法线埋入；土团底部单独向下贴土，避免平底悬空，取消整块逐顶点拉伸；误落在陡壁上的冠部土团限制为 4 cm 半径，避免黑色薄片。
- 大土团与微颗粒不能使用相同高度幅度。烘焙器新增可选 `--height-fine-weight`（旧流程默认仍为 0.45），当前断面 0.03、松土 0.05；`--detail-balance` 均衡整幅图的细颗粒对比度，不改变门槛或只修接缝边缘。两个参数写进记录，`--rebake` 可复现。实机采用 1.8 m 平铺、断面/松土最大视差 12/20 mm，在 3–12 m 淡出；近水平表面减小幅度。混合边界先淡出视差，再切换主高度层，避免每步重复采两层高度。细根贴合渲染土皮，避免埋在皮下。
- 贴图仍在第一关加载地形数组时按需取得，不增加开机 PBR_SETS。当前两套磁盘合计 1,040,304 字节（约 0.99 MiB），较原单套增加约 0.43 MiB；总贴图预算因此从 61 MiB 调到 62 MiB，单套/单图与分层预算不放宽。新增一层数组含 mip 约占 6.67 MiB GPU 内存。松土当前使用按参考图右下方区域重做的第三版，以细粉基质为主，减少均匀铺满的团块；实际源图、hash 和参数以烘焙记录为准。

重建命令：用 BlenderMCP `start --task TrenchReferenceTen --blend <上述源工程>`，再通过 `exec --code` 执行 `runpy.run_path` 调用烘焙脚本，完成后 `stop` 并 `status --scan`。贴图使用 `Script_BakePbrTexture.py --rebake _import/TextureBakes/Texture_<Name>.json`，源图必须仍存在且 hash 相符。自动取证入口 `Script_TrenchReferenceShots.mjs` 默认遍历 22 段及七个固定机位；`--focus=CrestAlong,EarthFace` 可只复查两张，`--out=` 指向本地成果目录。

验收入口：`TrenchSurfaceTest`（GLB 尺寸、六种形体、沟沿接缝、物理地面与材质标记）、`TrenchPlanTest`、`FirstLevelFrontTopologyTest`、`TextureStandardsTest`、`ModuleGraphTest`、`FirstLevelMissionFortificationsTest`、`SamplerBudgetTest --only=firstLevel`、`TerrainBlendTest`、`MotionVectorContractTest`。实机取证与尚未通过项记录在本地日志；图片改善不等于所有门禁已通过。

当前本地取证：第二十轮高画质覆盖 22 段和七个固定机位，页面/控制台/GL 错误为 0；壕沟装饰合计 1,104,572 三角 / 60 个分区网格，低于现有 1.15M / 64 预算，基础地面仍为 871,520 三角。第二十轮高画质与第十九轮白盒炮击均削低 0.606 m，四组装饰被裁除，Reset 后源几何和地面高度完全恢复。贴图门 3,712 项、六张贴图按记录重烘的逐文件 SHA-256、49 项运动向量 GPU 场景、土石材质交界 GPU 门、壕沟规则/表面门均通过；材质 GPU 门另验合批细根仍保持独立颜色。最后一轮仅修土团底部接地，材质沿用第十九轮的 GPU 与白盒取证；陡壁土团尺寸与埋入另有生成几何断言。

性能取证采用同一机位（FlankBreachSap）、每批 21 帧的冻结场景。第十九轮三批中一批 GPU 查询未返回、另两批为 16.94 / 29.72 ms；第十八轮有效批为 14.41 / 16.93 ms，未修改基线为 13.22–19.79 ms。运行环境有明显计时波动，这些数据不足以断言没有性能回退，也不能写成稳定的游戏帧率。全套截图和日志在本地成果目录；外观仍在对照参考 10 迭代，尚未宣称完全一致或发布。已改善颗粒尺度、沟底散土和沟沿轮廓；部分坡肩土团仍显得生硬，尚需继续处理。

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
