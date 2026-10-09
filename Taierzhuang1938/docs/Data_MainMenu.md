# 主菜单与选章 —— 指挥室场景与线性任务列表

## 指挥室场景（2026-10-04）

正式标题菜单现使用 `Script_CommandRoom.mjs` 加载 BlenderMCP 自建的
`Model/Model_CommandRoom.glb`，构图基于用户选定的第三张指挥室参考。
2026-10-05 起墙面采用七张随通关进度切换的地图，桌面采用开战、中途、最后三张历史文书。
Imagegen 纸图沿用原地图比例与原电报纸边，不是历史原件影印。
状态表、史料与生成记录见 [七张战局地图与三张文书](Data_CommandRoomPapers.md)。

`Data_Tuning_CommandRoom.mjs` 管理材质、光照图集解码和浮尘参数。
单一窗光及间接光在 Blender 中烘焙为独立的 2048² UV1 辐照度图集，
不包含纸面或 PBR 反照率；运行时解码后交给标准材质的 `lightMap`。
UV1 使用离线 xatlas 按实际表面连续性展开，并检查纸张正反面之间的重叠，防止暗的桌图背面覆盖墙图的光照。
因此不再叠加第二个运行时太阳或重复 AO。纸面反照率按存档进度替换，光照图集共用。
辐照度交付采用无损 WebP；编码器逐像素校验 RGB 往返一致，避免暗部有损色度
压缩被 32 倍解码放大为墙地面的绿色、紫色色块。地面延伸覆盖宽屏可见范围。
墨水瓶玻璃在加载时从自身位置捕获一次 256² 房间 cubemap 并预滤波，
捕获期间隐藏瓶组，避免自反射。玻璃使用透射、壁厚、琥珀色吸收及独立墨水内胆，
反射来自这间屋子的真实窗户与家具；其余材质继续使用静态漫反射图集。
场景包含独立相机；鼠标位置驱动该相机在原机位附近缓动，水平上限 8.5 cm、
竖直上限 4.5 cm，近处信件与远处地图产生不同视差。DOM 标题和菜单不跟随。
离开窗口或失焦后缓慢回正；触屏不触发悬停视差，减少动态效果偏好下保持原机位。
输入只在主菜单激活时生效，不改变玩法相机。
只在 `menu.live` 时通过已有 renderer 绘制，逐帧恢复
玩法渲染目标、viewport、scissor、色调映射及阴影开关。静态物件无角色动画，
浮尘为透明、不写深度的世界空间粒子；不参与玩法运动向量或主场景后期。
`Script_CommandRoomAtmosphere` 在真实窗洞挤出的体积内积分光线，用相机深度终止
积分，并用独立的静态光源深度图处理窗棂和家具遮挡。半分辨率体积图通过深度权重
上采样后与线性场景颜色合成，再统一进行色调映射；没有背景图片平移。
尘埃受同一光源深度图约束，阴影内不可见。调节入口为 `windowHaze` 和 `dust`。
方案参考 [VLB 深度要求](https://saladgamer.com/vlb-doc/compatibility/)
与 [世界空间浮尘](https://www.saladgamer.com/vlb-doc/comp-dustparticles/)，
实现为本项目 WebGL shader；不依赖 Unity 插件或外部运行库。
暂停、阵亡及进入游戏保留原场景和相机。

标题菜单为开始、选章、史实注记、关于、设置五项；调试选项只放在设置内。
选章、资料、关于、设置统一使用宋体标题、暖白文字、旧金竖条和半透明横条，
标题态的二级页面及声音、画面、操作设置继续显示指挥室。关闭具体设置后回到
设置目录，再返回原主菜单或暂停页。暂停继续保留真实战场和武器。
合成器对场景颜色做基于真实深度的景深，DOM 文字不参与模糊；焦距与半径
由 `Data_Tuning_CommandRoom.depthOfField` 管理。2026-10-09 主菜单焦点移至桌面与挂衣之间，
扩大清晰范围并降低最大弥散半径，避免袖口、布纹和窗外田埂被过度模糊；二级页继续使用两趟半分辨率高斯模糊加强背景虚化。
选章、注记、关于、设置及声音／画面／操作子页共用焦点状态，时间常数 .18 s，
约 .54 s 到达目标的 95%；快速返回或反向切换从当前状态继续，减少动态效果时直接切换。
渲染分辨率和 DPR 改变时保持 CSS 像素半径。窗外自发光底色略加红，
体积光和浮尘同步偏暖；不增加另一个太阳，不改变既有窗光方向。
桌面旧损由木板本体的倒角、缺口和磨痕表现，
单窗天空补光与曝光提亮可读区域，太阳方向保持一致。`host.staticBackdrop` 关闭时，
下文原有战场机位系统仍可运行，正式入口默认启用指挥室。

窗外由 `Script_CommandRoomCourtyard.py` 按 2026-10-09 用户确认的田野参考构建：移除遮住窗洞的近院墙和大片瓦檐，保留少量实体枝条；远处 Imagegen 景片包含田块、田埂、村舍与薄雾中的树线。景片载体位于镜头约 30 m 外，表现数百米之外的乡野，受真实窗框和墙体遮挡；近枝条与远景保留不同的相机视差。`CommandRoomFarmland` 独立自发光，不重复叠加室内 UV1 辐照度；曝光沿用室内设置。景片是美术环境素材，不作为历史实景照片。

本轮独立源工程在 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/CommandRoom/FarmlandCoat20261009/Scene_CommandRoom.blend`；原工程保留。通过 `COMMAND_ROOM_SOURCE` 指定源工程目录，`COMMAND_ROOM_ROOT` 指定本任务 worktree。田野的完整 Imagegen 提示词、编码器及来源哈希分别见 `_import/Prompts/Texture_CommandRoomFarmland.txt`、`_import/Script_EncodeCommandRoomFarmland.py` 与对应 TextureBakes 记录。

原工程在 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/CommandRoom/Scene_CommandRoom.blend`。
椅子相对原布设转向桌面并沿桌后法线后撤 18 cm，座面、竖条和横撑已连接；
重建时用世界空间三角网格检查椅桌及悬挂衣服与椅背的穿插。帽檐、两支 18.5 cm 铅笔、木尺、
95 mm 高墨水瓶、230 × 80 mm 笔盒和蘸水笔按桌板与纸面实际高度落放，保留 0.6 mm 接触余量，
逐组检查与支撑面不相交。墨水瓶和蘸水笔是一般年代陈设，并非王铭章实物复原。
`_blender/Script_CommandRoomDetails.py` 调用 `Script_CommandRoomTailoring.py`（墨水瓶），
再由 `Script_CommandRoomDrape.py` 生成帽服。
衣服依据 `Source/Reference_CoatDrape.png` 从单个衣钩收拢；军帽依据 `Source/Reference_CapTurnaround20261006.png` 中用户确认的 Lovart 三视图，由 `Script_CommandRoomReferenceCap.py` 重建。
衣身与袖筒由 `Script_CommandRoomHangingCoat.py` 建立连续衣片和真实袖窿。2026-10-09 扩展肩部向衣身的过渡，前襟收拢、长褶与细褶错落，袖肘处有小折，空袖口高度不齐；调整挂衣朝向，减少旧版细尖锥状轮廓。表面只做保留衣钩和衣缘约束的三次局部平滑，保持重力方向的整体剪影。旧布料模拟曾产生衣襟缠环与衣摆上卷，相关脚本和 `Data_CommandRoomTailoredDrape.json` 保留为历史过程，当前重建不消费它们。
衣服保留自身 `GarmentWear` 作为 Blender 与 glTF 的共同染色层，不再由后续通用旧化代码另建不一致的顶点色层。
领口、袖口、襟边与下摆的退色由 `GarmentWear` 顶点色随衣片坐标生成，少量断纤维附着于真实边缘；Blender 与 glTF 使用同一染色乘数。运行时只加载静态网格，没有布料模拟开销。
军帽保留低平软帽冠、折叠护布、短帽檐、两枚黄铜扣和十二道光芒帽徽。2026-10-09 按用户要求改为真实尺寸校准，取消此前 1.25 倍画面放大，增加内汗带与接边：实际内圈约 58 cm，含帽檐的帽组约 21.16×28.78×11.92 cm（沿自身坐标轴测量）。帽围参考实际成人帽码，不宣称是王铭章原物测绘。尺寸与位置集中在 `_blender/Data_CommandRoomPhysicalProps.json`；墙面旧化仍在 `Data_CommandRoomAppearance.json`。

### 桌面道具的物理尺度（2026-10-09）

旧信纸以 .65×.85 m 构造，剪裁后约 64.35×84.82 cm，误成海报尺度。2026-10-09 将道具按米制重建，但遗漏了 3.10×2.30 m 地图桌的整体比例；该轮结果被用户指出比例仍不对，以下 2026-10-10 校准取代保留大桌的处理。

| 物件 | 目标／实测 | 现实尺寸依据 |
| --- | --- | --- |
| 帽子 | 内汗带 58 cm／57.994 cm；含檐外廓约 21.16×28.78×11.92 cm | [Stetson 成人帽码](https://stetson.com/pages/fit-guide)，采用 58 cm；外廓保留已有软帽形制 |
| 信纸 | A5 14.8×21 cm／14.805×21.004 cm；纸厚约 .12 mm | [MUJI A5 便笺](https://www.muji.com/jp/ja/store/cmdty/detail/4550584663420)，只参考尺寸，保留游戏纸图 |
| 蘸水笔 | 全长 14.4 cm，最大杆径 7 mm | [London Museum 1901–1930 年木杆钢尖蘸水笔](https://www.londonmuseum.org.uk/collections/v/object-443434/pen-dip-pen/) |
| 两支铅笔 | 全长各 17.5 cm，外接直径 7.1 mm | [三菱 9800EW 产品目录](https://www.mp-uni.com/files/uni-ball_Myanmar_Catalog.pdf)，174.7×7.1 mm；作为通用木铅笔尺寸参照 |
| 墨水瓶 | 6.3×6.3×8.5 cm，包含瓶盖 | [Harvard Peabody Museum 1870–1900 年墨水瓶](https://collections.peabody.harvard.edu/objects/details/66036)，8.5×6.3×6.3 cm |

这是一组有实物尺寸依据的游戏道具，不将参照品的品牌、出处或归属移植到 1938 年场景。笔托为 23×8 cm，木尺的刻度长 30 cm、尺身长 31 cm。纸厚与轻微卷边分开处理，避免缩小后的信纸仍像厚板；小纸面的 UV1 烘焙密度同步提高，尺寸本身不再被画面可读性反向拉大。

`Script_CommandRoomPhysicalScale.py` 在摆放和接触求解后测量实际世界网格，检查帽圈、纸面、笔长／杆径、瓶体三轴尺寸和任意两组道具穿插。测量记录写入 GLB extras，并由 `Tengxian.Debug.CommandRoom().physical` 提供给 agent；浏览器还独立测量导出的信纸与墨水瓶。`Script_InspectCommandRoomScale.py` 使用一台正交相机、同一张 10 cm 网格检查帽、纸、笔和瓶，禁止各物件分别适配画幅。源工程为 `CommandRoom/PhysicalScale20261009/Scene_CommandRoom.blend`，原图、测量 JSON 和对照图保留在本地 `_shots/CommandRoom/`。

2026-10-09 交付为 21 网格、361507 三角形、15748680 字节的 GLB，匹配无损光照图 1316306 字节。AssetStandards、TextureStandards、CommandRoomBrowser、CommandRoomPublication、MotionVectorContract、MenuStartup 与 CommandRoomPreview 七项通过；ModuleGraph、Text、TestRunner 另行通过。发布纹理与源码实机画面的 RGB 平均误差 .64、95 分位 3，光照图字节无损；prepush 前五项通过后仍停在既有 CharacterSpeechTest 读音表断言。本任务 Blender 已停止，保留其他任务实例。本地入口为 `_shots/CommandRoom/Index_PhysicalScale.html`。

### 保留原构图的整室尺度校准（2026-10-10）

用户要求只修尺寸，保留原画的镜头、位置与透视。`Data_CommandRoomLayout.json` 和 `Script_CommandRoomSceneScale.py` 对原环境与相机执行同一个米制校准：比例 .5、竖直平移 .3075 m，29 mm 镜头和朝向保持原样。桌面、窗框、墙图、柜顶和挂衣的参考边界在导出前检查；浏览器再用原相机独立投影对照。移动鼠标的机位偏移与焦点距离同步减半，保持原画面中的视差幅度。

桌面实测约 1.550×1.148 m、桌高 .750 m，桌腿接地；柜子约 .667×.443×.951 m，椅面 .460 m。画外室内边界约 3.138×2.777×2.600 m。桌面小道具保持上表尺寸，仅随桌面重定位和重新落放；笔、尺在原邻近区域留出接触余量，继续检查任意两组道具及支撑面的穿插。相机坐标改变表示场景单位校准，不是另选机位。该轮曾试过重新布置的紧凑房间，用户否定后已撤回，不进入发布资产。

柜子仍使用桌子的同一木纹，只施加轻微深色乘数；不再是深棕漆。室内增加画外遮光边界，窗户保留单一太阳方向，镜头后入口提供低强度漫射天光，使墙图和帽子在暗处仍可辨认。光照继续通过 Cycles 256 样本烘为独立 UV1，无损发布；原暖黄旧墙、窗外田野、挂衣造型和七张进度地图保留。`Tengxian.Debug.CommandRoom().calibration` 返回实际桌高、房间范围、参考与校准后的相机／构图边界，`physical` 继续返回帽圈、纸、笔、瓶的网格测量。

源工程为 `CommandRoom/ReferenceScale20261010/Scene_CommandRoom.blend`，本地同机位滑动对照为 `_shots/CommandRoom/Index_ReferenceScale.html`。`COMMAND_ROOM_RENDER_PERCENT` 只控制 Blender 作者预览的出图尺寸，默认 100，不影响游戏视口、相机或发布资产。

本轮最终 GLB 为 21 网格、360630 三角形、16752964 字节，无损光照图 1419644 字节。原构图边界的最大投影误差为 6.57×10⁻⁷ NDC（1280×720 下不足 .001 像素）；帽纸笔瓶尺寸、支撑与道具穿插门禁通过。AssetStandards、TextureStandards、CommandRoomBrowser、CommandRoomPublication、MotionVectorContract、MenuStartup 和 CommandRoomPreview 通过；最终曝光与光束微调后重新通过两项 CommandRoom 浏览器／发布检查。发布与源码画面 RGB 平均误差 .648、95 分位 3，光照文件保持字节一致；ModuleGraph、Text、TestRunner 自测通过。prepush 仍在未修改的 CharacterSpeechTest「呃啊」断言停止（此前五项通过），不宣称全量回归完成。BlenderMCP 已停止，`status --scan` 确认无本任务或其他 Blender 残留；本地预览服务保留供对照。

衣服使用 Imagegen `Source/CommandRoomClothSerge.png`；帽子独立使用
`Source/CommandRoomCapTwill20261007.png` 的普通灰褐斜纹棉布。两者均为 25 cm 一铺、
1K 基色与 512 法线/ORM，法线起伏分别为 0.18 / 0.16 mm。专用 `menuCloth`
类允许 4096 px/m，其余贴图仍沿用原密度上限，单套文件预算不变。
`Script_CommandRoomFurniture.py` 用七层截面构成桌板圆角并向内切局部缺口；
桌板额外布尔切除顺纹 V 形收尖裂口，端裂长 28–74 cm，口宽 6–10 mm、深约 28 mm；
板面还有 80–102 cm 长的干缩检查裂纹。木屑、悬浮黑线不参与这些裂口。
柜子具有圆角台面、下压边、实框凹面抽屉和铁拉手底座。检查标签 4/5 对应桌子/柜子。
柜子、窗沿、桌椅共享风化木纹理；柜子独立材质只比桌面稍暗，保持干旧木料的高粗糙度，不再使用深棕漆效果。木材边角磨损进入几何与顶点色。
2026-10-07 再按用户砖木民居参考重做墙面：保留大面积暖白灰皮，主剥落区集中在挂衣与地图之间，墙脚为不连续的返潮脱皮。露出的土层、青灰砖、砖面残灰和细碎剥落共用一张 Imagegen 作者图集，经统一 baker 输出 2K Base / 1K normal、ORM。
墙面源图更新为 `Source/CommandRoomWallLime20261007.png`：完整灰皮保持平缓，局部露土及露砖，减少遍布墙面的厚块状颗粒和砖面凹坑。`Script_CommandRoomWallWear.py` 从材质分区生成连续起伏表面，土层最多凹 5 mm，砖面最多凹 14 mm（场景缩放前）；2.5 cm 网格负责整体厚度，法线细节幅度降到 1.2 mm。横向图集覆盖 2.7 m，恢复砖块与衣物之间的合理尺寸；图集边界落在窗框和地图遮挡处，竖向覆盖完整墙高，避免镜像破口或顶边拉成条纹。取消旧版规则砖块、重复破口轮廓及单独土黄边圈，避免拼贴感。
主图集按作者 UV 映射，运行时 clamp；中央画面保留一处主露砖区，窗左墙柱使用完整灰皮区域，避免露砖图案在窗边重复。结构墙体后退并保留真实窗洞和遮光，基色与 UV1 辐照度继续分开。图集为跨材质分区，登记为非平铺作者图集，保留生成提示词与烘焙记录。UV1 用浅起伏墙面的 X/Z 平面代理展开后插值回细网格；其他材质保持原三维展开。已完成图集仅在图表几何核验一致时复用。
顶点色缺失时补白色中性乘数，木板布尔切面的新顶点也补齐旧木反照率。
2026-10-09 增加 `LimeAge` 顶点染色：灰皮略暗、偏暖黄灰，低处有不均匀返潮，窗边有弱流痕，上沿与凹处有薄积灰。染色按原图灰皮区域加权，保留青灰砖和露土的区分；不改变已有破口形状，地面和纸面不被统一染黄。Blender 与 glTF 使用相同顶点色乘数，反照率仍与 UV1 辐照度分离。本轮独立源工程目录为 `CommandRoom/CapWall20261009`。
墙图主体离墙约 3.7 mm，底部仅轻微卷起，四角钉头与钉杆连接纸面和墙体。
相对上一版约 5.6 cm 的整面悬空间距明显缩小，匹配光照图集重新烘焙。
电报网格沿原图纸边裁切，保留旧纸缺口与卷边，不再带白色矩形底框；新文书匹配同一轮廓。
边界数据为 `_blender/Data_CommandRoomPaperOutline.json`，可用
`_import/Script_TraceCommandRoomPaper.py` 从已确认的纸图重新提取。
相邻 `Source` 保留生成原图和三张参考，`Textures` 保存 Blender 依赖，
不依赖本地 worktree 永久存在。几何重建入口为 `_blender/Script_BuildCommandRoom.py`；
用 `COMMAND_ROOM_ROOT` 指定仓库根，随后通过根目录 `scripts/Script_BlenderMcp.mjs exec --file` 执行。
脚本拒绝覆盖其他 Blender 文件，输出 GLB 后还原材质节点并保存源工程。
光照展开使用 [xatlas Python 绑定](https://github.com/mworchel/xatlas-python)，仅供离线构建；`numpy` 和 `xatlas==0.0.11` 安装到本 worktree 的 `tmp/CommandRoomPython`。
可用 `COMMAND_ROOM_PYTHON` 指定该解释器；输入／输出 NPZ 留在 `tmp/CommandRoomAtlas`，不随游戏发布。
随后依次执行 `_blender/Script_BakeCommandRoomLighting.py`（同一 BlenderMCP 实例）
和 `_import/Script_EncodeCommandRoomLighting.py --source <源工程目录>/Textures/Texture_CommandRoomLighting.png`。
后者需要 Pillow。烘焙脚本以 256 samples 生成无重叠 UV1 和 HDR EXR；交付图采用
`sRGB(linear irradiance / 32)`，运行时恢复 32 倍与 Lambert π 系数。
亚毫米缝线在烘焙后复用最近布面的 UV1 辐照度，避免单独图块小于像素而出现
断续黑线；每个微小针脚面统一采样，避免跨 UV 岛插值。帽服褶皱中不足 2.5 像素、
不超过 10 面的孤立小图块也从相邻同向布面补采辐照度，避免孤立黑斑。
微小布面中未得到有效辐照度的图块也从同向邻面补采；主体网格仍独立排布。
缝线保留几何，烘焙时不投射亚像素阴影，避免黑色方块；两步分别由
`Script_CommandRoomMicroCharts.py` 和 `Script_CommandRoomThreadLighting.py` 在光照烘焙后执行。
固定镜头的直接、间接漫反射均计入图集，材质本身仍使用独立 PBR 套；
移动道具或改变时刻需要重新烘焙。最终 GLB 必须以光照烘焙后的版本为准。
生成提示词在 `_import/Prompts/Texture_CommandRoom*.txt`，PBR 烘焙记录在
`_import/TextureBakes/`；已确认的纸图用 `_import/Script_BakeCommandRoomPrints.py --source <Source>` 转 WebP。

贴图按菜单使用时加载，不加入共享 `PBR_SETS`。五套 PBR、地图、电报、瓶签和光照图集，
在 `Data_TextureManifest` 的 lazy 层单独登记；十张新纸图约 4 MB，预算相应增加 4 MB，
运行时仅下载当前地图与信件（合计不足 1 MB），访问过的状态复用贴图。反射探针由场景运行时生成，不增加外部贴图请求。
GLB 中静态几何按材质合并；预算见 `Data_AssetStandards.CommandRoom`。
`Debug.CommandRoom()` 提供实际加载、绘制帧数、三角数和相机证据。
视觉证据保留在忽略目录 `_shots/CommandRoom/`。

检查：`Script_MenuTest.mjs --interface-only` 验证键盘、菜单与窄屏；完整
`Script_MenuTest.mjs` 验证独立场景绘制、固定机位、不推进兵员池及游戏切换。
另外运行 ModuleGraph、TextureStandards、Text 与 AssetStandards 检查。
`Script_CommandRoomBrowserTest.mjs` 实测不同深度物体的视差、缓动与回正、触屏和
减少动态效果、相机方向与光源方向两种遮挡、renderer 状态恢复和尺寸变化。
该检查也比较实际像素中的虚化强度、过渡反向和返回主菜单的恢复。
`Script_MenuPresentationTest.mjs` 从正式游戏入口验证全部二级页与设置子页的虚化状态，
声音设置的真实增益、键盘操作、开关、试听、刷新后保存、恢复默认及手机布局。

2026-10-09 验收：实际 GLB 为 21 网格、354421 三角形、14800388 字节、零内嵌图片；窗外 `Texture/Texture_CommandRoomFarmlandImage.webp` 为 1672×941、241792 字节，仍在原贴图总预算内。重烘的 2048² 无损光照图与新网格 UV1 配套。源模型检测椅桌、挂衣椅背与五组桌面道具支撑面相交数均为零。对照截图和三视图在本地 `_shots/CommandRoom/Index_FarmlandCoat.html`，不发布到仓库。

AssetStandards、TextureStandards、CommandRoomBrowser、MotionVectorContract、MenuStartup（源入口及发布式三包）、CommandRoomPreview（七状态及存档保护）、MenuPresentation 共七项通过；ModuleGraph、Text、TextGatherCheck 与 TestRunner 亦通过。quick / prepush 的前五项通过，随后仍在未改动的 CharacterSpeechTest「呃、啊」读音表断言停止，不代表全关卡回归完成。BlenderMCP 已停止，`status --scan` 确认本树和本机均无残留实例。

同日帽子／墙面续修：新 GLB 为 21 网格、354276 三角形、15294304 字节；匹配光照图为 1297454 字节。实际帽组旋转后包围盒约 30.83×14.90×33.49 cm；墙皮 60662 个导出顶点保留暖灰染色，线性 RGB 均值约 .749/.664/.527。AssetStandards、TextureStandards、ModuleGraph、CommandRoomBrowser、MotionVectorContract、MenuStartup 与 CommandRoomPreview 共七项通过，prepush 仍被上述未修改对白断言阻断。本任务 Blender 已停止，未关闭其他任务的实例。本地对照入口 `_shots/CommandRoom/Index_CapWall.html`。
合并同日 GPU 发布改动后，ModuleGraph、CommandRoomBrowser、MenuStartup、PublishAssets 再验通过。`Data_TextureImportSettings.json` 对 `Texture_CommandRoomLightingImage.webp` 显式使用 `source`，避免 GPU 量化误差被 32× HDR 解码放大成绿紫色斑；其余普通材质继续按自动 GPU 策略发布。`Script_CommandRoomPublicationTest` 对菜单实际贴图运行 `BuildPublishAssets`，校验发布光照图与源文件字节完全一致，并在相同机位比较源码／GPU 发布渲染，最终 8-bit RGB 平均误差 .64、95 分位 3，完成 640 px 缩图目检。输入尺寸不变，结果与截图留在本地 `Data_CapWallPublished.json`、`Scene_CapWallSource.png`、`Scene_CapWallPublished.png`。这项比较覆盖菜单贴图，不替代全关卡 GPU 资产验收；TextureImport、PublishAssets、TestRunner 及新增发布回归均通过。

挂衣另按用户要求用 Lovart 生成一张后续建模参考，保存在本地 `_shots/CommandRoom/WangUniformReference/Scene_WangMingzhangHangingUniform.png` 及源工程 `CapWall20261009/Source/Reference_WangMingzhangUniformLovart20261009.png`；[Lovart 画布](https://www.lovart.ai/canvas?projectId=57cf57c94c3a4a23aee0489df3dacbf3)。输入含[王铭章历史肖像](https://commons.wikimedia.org/wiki/File:%E7%8E%8B%E9%93%AD%E7%AB%A0.jpg)，立领军官上衣为造型方向；布色、口袋与胸牌细节是美术重构，不视为本人原衣的精确复原。这张图尚未用于替换游戏挂衣。

### 玩家声音设置（2026-10-06）

`AudioSettings` 保留编辑器套件的打开／暂停／返回生命周期，界面独立采用正式菜单样式：
左侧音量与播放选项、右侧焦点说明、底部返回／恢复默认／试听。音量即时写入
master 或 sfx/music/ambience 的 User 增益，沿用 `tengxian1938_audio_v1` 保存格式；
没有伪造输出设备或尚未存在的独立配音音量。调试节点读数不再出现在玩家页。
方向键上下选择条目，左右调整滑杆；Tab、原生开关和 Esc 返回设置目录可用。
手机改为纵向滚动，底部动作保持可见。分项说明参考
[COD 官方 PC 设置指南](https://www.callofduty.com/au/en/blog/2020/11/Black-Ops-Cold-War-Controls-and-Settings-PC)，
视觉继续沿用本游戏宋体标题、暖白文字与旧金选中条。

对应实现：`Data_Menu.mjs`（机位表）、`Script_Menu.mjs`（菜单本体）、`Style_Menu.css`、
`Script_Main.mjs` 的菜单接线、`Script_MenuTest.mjs`（冒烟）。

## 暂停任务条件（2026-09-13）

Esc 页在当前任务目标下显示“达成条件与当前进度”、完成项数与逐项状态。
菜单使用通用 host 接口 `CurrentObjectiveProgress()`，返回
`{ complete, conditions: [{ id, text, complete, detail? }] }`；每次打开暂停页重新读取，
更换阶段清除旧列表。未接入追踪的开发场景明确显示无可追踪条件。

第一关由 `FirstLevelMissionFlow.ObjectiveProgress()` 读取实际 `requirements`、任务事实和
`minimumSeconds`，不会另设通关判定或修改存档。运行时补上本地化文字及步枪掩护计时、
开枪状态、守军撤回与阵亡人数。守军撤离结算沿用真实规则：安全撤回或阵亡都不再滞留，
界面分别列出两种结果，不把阵亡显示为获救。新增任务条件需要在 `Data_Text_Menu.mjs`
添加同 ID 的 `menu.condition.*` 文案。

验收复用 `Script_FirstLevelMissionTest.mjs`（所有任务步骤、独立计时条件、读取无副作用和恢复）
与 `Script_DeathMenuTest.mjs`（真实暂停接口、刷新、切换、完成状态及三种屏幕尺寸）。
后者的任务进度截图使用显式状态夹具，仅证明 UI，不作为正常通关证据。

## 阵亡与检查点（2026-09-11）

阵亡使用独立的 `failure` 状态，不再经过 `OpenPause()`。倒地镜头单独推进，
任务、AI、伤害和世界时间冻结；收起功能 HUD、枪和设置入口。
画面保留去色、模糊、压暗的战场，中央显示“你已阵亡”，默认操作为“从检查点开始”。
Esc 不退出阵亡，鼠标与 Enter 必须明确选择恢复、重开本关或返回主菜单。

用户指定参考 COD5 / COD14。联网检索并查看的公开视频帧：
[COD 受伤与阵亡表现合集（含 WaW）](https://www.youtube.com/watch?v=BiqYkLwhulQ)、
[WWII Death Factory 片段](https://www.youtube.com/watch?v=mmN3N8mh8k8)。
前者可访问帧展示暗红受伤遮罩，后者展示去色、模糊的战场；网页/完整视频访问受限，
这些帧只作为色调和场景处理参考，不作为两作完整阵亡菜单的逐项复刻依据。
居中标题、细红分隔线和手动检查点按钮由本游戏实现，外部画面只留本地。

检查点恢复读取当前任务的 `safePoint`，不再被搬运或演出时的死亡位置覆盖。
沿用当前关卡契约：恢复玩家生命与位置，保留现场任务、NPC 和剩余补给；
这不是全世界存档回滚，也不调用调试阶段重建。没有检查点时禁用该操作。
旧 `p012-archive` 的“在载物处继续”作为额外入口保留，不替代检查点操作。

验收：`node Taierzhuang1938/Script_DeathMenuTest.mjs`，覆盖真实致死、世界冻结、
倒地镜头、鼠标/Enter 恢复、Esc 与暂停回归、检查点缺失及三种窗口尺寸。
截图与状态证据写到已忽略的 `_shots/DeathMenu/`。

## 统一的 World at War 界面

主菜单、暂停、选章、史实、关于、调试、加载画面和设置 / 编辑器窗口统一使用
`Style_Interface.css` 的无衬线字体、冷灰文字、旧金强调色、黑色标题栏与淡灰横向选择条。
数值编辑保留等宽字体，控件为直角，选中和键盘焦点都有金色反馈。

**字体一律自带，不吃系统字体。**`--ui-font` 是 `TzUiLatin`（Barlow Semi Condensed，
排拉丁与数字）叠 `TzUiSans`（思源黑体，排汉字），系统字体只留在链尾兜底。
拉丁单拎一款是照战地那一族的做法（`BF Body` 就是拿开源的 Barlow 改的）——
思源黑自带的拉丁偏圆偏宽，配这套冷灰界面差一口气，换成窄体只花 11 KB。
HUD 与编辑器里原先写死的 `"Noto Sans SC" / "Microsoft YaHei"` 也一并接到 `--ui-font`。

**大标题另走一路**：主菜单 `.mnTitleMain`、暂停标题与加载画面 `#bootTitle` 用
`--ui-title-font`（思源宋体 Black，26 字子集，4.6 KB），取碑刻／正史那一口气 ——
游戏 logo 本来就该单独处理，不跟正文同族。

三套全部 SIL OFL 1.1、随仓库打包（合计约 442 KB，`font-display: swap` 不挡开机）。
字体本体、授权、子集脚本与「改了界面文案必须重跑」的纪律见
`Taierzhuang1938/Font/README.md`；覆盖与缓存戳由 `Script_TextTest` 对账，
「字体真的接上了」由 `Script_MenuTest` 在真浏览器里量。
Profiler 独立窗口复制入口的主题样式 URL，与主页面使用同一缓存版本。
战斗 HUD 的阵营与危险色不受这些局部主题变量影响。

正式标题菜单使用上文指挥室及鼠标视差，五项为开始 / 选章 / 史实注记 / 关于 / 设置。
原战场机位和黑场切换仅为关闭静态背景后的兼容路径。暂停页显示“游戏暂停”，
保留当前战场与手中武器。工具界面拥有自己的顶栏，打开后让出原菜单标题和列表位置，
关闭后恢复来源菜单。资料和调试页沿用选章的全屏布局与底部返回栏。

局部验收：`node Taierzhuang1938/Script_MenuTest.mjs --interface-only`，复用真实游戏场景，
覆盖主菜单 / 暂停 / 设置 / 枪械编辑器 / 独立性能窗口 / 资料页的截图、共用样式、键盘控件
和小窗口布局。产物在已忽略的 `_shots/Scene_Interface*.png`，不进入发布资产。

## 原战场背景兼容路径

关闭 `host.staticBackdrop` 后，菜单直接用关卡切片：开机时 `BuildField` 建哪一片，菜单就在哪一片里
跑运镜。默认建 `MENU_SCENE.slice = "L4_Chengqiang"`（城墙那一关的切片）——
十一米五的城墙、瓮城与东南角望楼是这座城的招牌。给了 `?phase=N` 就建那一关，
从暂停回主菜单时则用**当前正在打的那一关**的切片（不重建，回菜单是瞬时的）。

机位表 `MENU_SHOTS` 按关卡 id 分组，每关 2—3 个机位，坐标全部落在该关 `bounds` 内
（切片以外只有地皮没有建筑，机位架出去就是一片空地——这是最容易犯的错）。
每条机位是 `from -> to` 的推轨 + `look -> lookTo` 的注视点 + `focalMm` 焦距，
词汇与分镜表（`Script_Cutscene`）一致。

手持漂移用 `ValueNoise2`，**不许 `Math.random`**：同一时刻永远同一个值，出图才可复现。

### 菜单里的人

`MENU_SCENE.garrison = 5`，**只摆守军，一个日军都不放**：有敌人就会开打，开打就会死人，
而兵员池是关卡状态——玩家还没按「开始」就被消耗掉是说不通的。
只有守军时 AI 走「守住 holdZone」那一支，表现是几个人在原地小幅走动。

落点不是按比例算的。第一版在机位与被摄物连线的四成处直接撒人，实拍翻车：东门那一机位的
四成处正落在关厢院落的迷宫里，五个人全站在院墙背后，画面上一个人都没有。
现在由 `Script_Main.PlaceMenuGarrison` 逐个候选点打一条射线问「相机看得见吗」
（第一次撞到东西的距离要比人还远），选中的才站人。换机位时整批瞬移，那一下正好被黑场盖住。

## 选章

选章按 2008《Call of Duty: World at War》的任务选择画面制作。
指定参考来自 [Notion「COD/战地 选关UI 参考」](https://www.notion.so/3cc60335331c8149be4cf97d4d9a1822)
中的 2008 条目：[原始参考图](https://news.softpedia.com/images/extra/GAMES/large/COWAWtextscr_002-large.jpg)。
该页末尾的旧推荐仍提及 WWII 地图；本次用户明确指定 World at War，现状以这里为准。

- 全屏半透明渐变覆盖指挥室；左侧是紧凑的纵向文字任务列表。当前章节用金黄色文字与
  淡灰横条标识，不再使用战区地图、地图节点、横向时间轴或缩略图卡。
- 右侧是横向任务图，下方依次是金色任务名、日期地点、一句行动目标；底部显示真实的
  章节通过记录。游戏没有难度完成档案，因此不照搬参考图中的最高难度或勋章。
- 任务图片沿用菜单已有的原创资产；背景与标题页共用真实指挥室。
  参考截图仅用于内部比对，不放进发布资产。
- 鼠标悬停或键盘焦点更新简报，单击条目或按 Enter 直接进入；七章全部可选。
  原生返回按钮保留 Enter / Space 行为，Esc 回到打开选章前的主菜单或暂停菜单。
- 窄屏将列表与简报上下排布，可垂直滚动；触控行保留足够点击高度，返回按钮固定在下栏。

进度仍读写 `tengxian1938_progress_v2`（`{ furthest, cleared }`）。
测试入口不参与进度，默认选中项和主菜单“继续”只由正式战役决定。

局部验收：`node Taierzhuang1938/Script_MenuTest.mjs --levels-only`。
它复用正式页面与浏览器 TestKit，检查七章图片、真实鼠标/键盘行为、返回导航、
桌面/笔记本/手机/窄横屏布局，并保存 `_shots/Scene_MissionList*.png`。
完整菜单冒烟仍涵盖实际进入战役、过场、暂停、进度与沙盒往返。

### 「测试场景」组：核心玩法沙盒与在验关卡白盒

正式章节之后隔一条分隔线，是「测试场景」组：

| 条目 | 标号 | 切片 | query |
| --- | --- | --- | --- |
| 枪械白盒靶场 | 枪 | `Data_WeaponRange.WEAPON_RANGE_PHASE` | `?weapons=1` |
| 玩法测试靶场 | 靶 | `Data_Range.RANGE_PHASE` | `?range=1` |
| 爆炸测试场 | 爆 | `Data_ExplosionRange.EXPLOSION_RANGE_PHASE` | `?explosions=1` |
| 白刃战 QTE 测试场 | 刃 | `Data_MeleeQte.MELEE_QTE_PHASE` | `?melee=1` |
| 第一关 · P0/P1/P2 场景白盒 | 012 | `Data_FirstLevelP012Whitebox.FIRST_LEVEL_P012_WHITEBOX_PHASE` | `?whitebox=p012` |

旧「第一关 · 全新策划白盒」已移除，旧 `?whitebox=1` 链接回到正式菜单。

界河白盒与过场预览不再列入选章，避免测试入口越积越多。它们的内部直达 query 仍保留：
`?jiehe=1` 服务地形回归与人工验收，`?preview=CS_Chuchuan` 服务序章预览。

**玩家看得见的入口一条都不许指向已退出正片的内容。** 2026-09-07 按这条清了两处：
加载画面页脚那条「新版序章预览（开发）」链接（`#bootPreview`，`index.html` + `Style_Game.css`），
与场景编辑器「关卡切片」列表第一条「序章 · 出川（车厢）」及其 `game.OpenProloguePreview`
跳转（`Script_EditorScene` + `Script_Main`）。序章 2026-09-06 起退出选章、要并进第一关，
留着这两条只会让人以为它还是一关。加载画面页脚现在只有「进 城」一颗按钮；
审片、出图与 `Script_EditorTest` 第 10 节仍从 `?preview=CS_Chuchuan` 直达，一样也没少。
两条闸在 `Script_EditorTest`：「加载画面上不再挂序章预览入口」与
「场景编辑器的关卡切片列表不再列序章过场」。

这些入口都**不进 `phases`**：菜单另有一份 `entries = [...phases, ...sandboxes]`
专给列表与键盘上下用，而进度、「继续」、「下一关」标记与 `DefaultLevel()` 一律只按七章数。
沙盒简报直接读各自的 phase；预览使用程序化靶标与入口标识，显示“不计入战役进度”。

进出沙盒都是**整页重载**（`Script_Main.GoToSandbox`），因为 `PHASE_TABLE` 在这些 query
下都是整表替换的，当场换不过去。所以沙盒里的暂停菜单换成那一套：继续 / 设置 /
**退出<各自的名字>**；调试选项归入设置，不给当场做不到的「选章」与「主菜单」。

另有一条**不进选章**的切片：全城俯瞰 `?phase=overview`（`Data_Menu.OVERVIEW_PHASE`）。
它没有玩法，只服务出图与自检，摆进列表只会让人以为那是一关 —— 口径见
`Data_SamplePoints.md` 与 `Data_MissionRemake.md` §10.9。

配套的一条：`MENU_ON` 与 `MENU_AT_BOOT` 分了家。靶场里菜单**照建**（Esc 暂停、设置、
调试选项和那条出口都挂在它上面），只是开机不 `Open()`。
机位表按**建好的那一片**取（`host.SlicePhase()`，不是按「第几章」查 `PHASES`）——
沙盒与 `?phase=overview` 都不在 `PHASES` 里，按序号查会取到别人的机位；
没配机位的切片退到 `FallbackShot`。全城俯瞰那一组配了四条（`MENU_SHOTS.Overview`），
`Script_ShotTest` 的 Z 系列拿它们当机架。`MainMenu` 构造完自己先 `add("off")`：以前
构造后必定紧跟一次 `Open()`，漏掉这一行看不出来，靶场里就是一屏标题盖在场地上。

## 两条入口的差别（故意的）

- **开始 / 继续**：走战役入口，**播这一关的关前过场**（序·界河前面是「出川」那 38 秒）。
- **选章 -> 进入**：直接进关，**不播过场**。选章是回放/试关的口子，每次都从过场看起会烦。

**过场是靠 `Frame()` 推的，它自己没有帧驱动**——而从菜单进关时 `state.running` 还是
false（要等过场播完才 `StartRun`）。主循环那道「没在跑就 return」因此要给过场开一个口子，
否则「开始」会卡死在出川的黑场里：过场等一个永远不来的帧，`StartRun` 等过场结束。
关卡之间那条路没暴露过这个坑，因为换关时玩家还在游戏里。冒烟里有一条专门盯它。

同一条路上还有指针锁：用户手势只有几秒有效期，等三十八秒的过场播完早就过期了，
`requestPointerLock()` 会 reject。抓不到锁不是事故（第一次点击会补抢），但那条
unhandled rejection 会被开机冒烟当事故，所以统一走 `RequestPointerLock()` 吞掉并提示玩家。

Esc 在游戏里是暂停（继续 / 选章 / 回主菜单）。暂停会连背景音一起停——
环境床与音乐是自己在跑的 WebAudio 节点图，`Frame()` 提前返回拦不住它们，
所以走 `Script_Audio.SetPaused()`（那条闸是上游为编辑器装的，这里复用）。

## 调试口

- `?menu=0`：不建菜单，进页面就是关卡，「进 城」按钮照旧——三个老冒烟脚本都点它。
- `?shot=1`（出图模式）：同样不建菜单，出图不许拍到 UI。
- `window.Taierzhuang.Debug.Menu()` / `MenuAct(id)` / `Pause()`：冒烟脚本从运行时取证用。
- 「调试选项」从主菜单或暂停页的设置内进入；状态存 `tengxian1938_debug_options_v1`。
  可开无碰撞（仅跳过实体与人物碰撞，程序化地形及关卡边界保留）、快速移动、无敌、
  无限子弹和无限普通手榴弹。`DebugOptions()` / `SetDebugOption(id, on)` 是自动化取证口。

## 加载画面（`Script_BootPaper.mjs` + `Data_BootPapers.mjs`）

菜单背后是活场景，但**菜单之前还有一段谁都躲不掉的等待**：首关建场十几秒。
这段时间给玩家读的是**这一仗之前的世道**：黑底上一张战前报纸剪报，左下角一句史料摘录。
版式参考 Notion「加载界面｜战前报纸剪报方案与史料库」：

- **左上**：游戏名 `台儿庄：血战滕县`；副题是这期报纸的汉字日期 + `战前报讯`（`boot.paper.subtitle`）。
- **右侧**：一张带撕边与折痕的老报纸（`#bootPaperWrap` > `#bootPaper`，`mix-blend-mode: lighten` 挂在外层，让图里的黑融进页面黑，
  里层极慢地向前漂 4%，`prefers-reduced-motion` 下不动）。
- **鼠标 / 手指可以拖着倾斜**：横拖转偏航（±40°）、竖拖转俯仰（±26°），接近上限越拖越难（橡皮筋），**不是翻面、永远转不到 180°**；
  松手后缓缓回正（CSS 过渡，约 0.9 s，合成线程跑，主线程被建关卡堵住时照样回得动）。口径与纯函数 `ApplyTiltDrag` 在 `Data_BootPapers.mjs`
  （`BOOT_PAPER_TILT`），旋转写在 `#bootPaperWrap` 的 CSS 变量上。屏幕上不写「可拖动」：光标变成抓手就够了。
- **左下**：`史料摘录 | 《报名》 日期` 一行（金色）+ `简述：……`（`#bootCard`）。简述是 Notion 里「加载页摘要」原文。
- **底部居中**：`进 城` 按钮、加载步骤行、加粗进度条（`min(74vw, 760px) × 6px`）——这一块与旧版一致，
  三个冒烟脚本点的仍是 `#bootStart`。

**清单只有一处**：`Data_BootPapers.BOOT_PAPERS`（id + 文件名）。名字 / 日期 / 汉字日期 / 简述在
`Data_Text_Boot` 的 `boot.paper.<id>.name|date|dateCn|summary`。收录的是 Notion 页面里**被标了颜色且贴着原图**的 11 期
（黄 = 重大事件，蓝 = 有助于理解滕县战前局势与军民处境）：立报 / 申报 / 文汇报 / 《战事画刊》六期 / 救国时报 / 密勒氏评论报。
页尾「其他已定位报纸」里同样标了色的 9 期南洋商报**没有原图，不收**——报纸上的内容必须与 Notion 里贴的原图一致，不许自己写标题。
刊名以 Notion 第四节的说明为准：《战事画刊》（不是「战时画刊」）。

- **每次开机随机一张，不与上一次重复**（`localStorage["tzBootPaperLast"]`，读写都包 try：隐私模式会抛，抛了就当没有上一次）。
  同一次加载里不换；换关再亮加载画面时（`ShowBoot(true)`）会重新抽。
- **只拉一张图**：每张 0.1–0.3 MB webp，其余十张一个字节都不下。图没拉下来不影响文字。
- **图是原图印在空白做旧纸上，不是 AI 重画的**：纸底是 Lovart 出的、没有任何印刷的空白纸（横幅 / 近方 / 竖幅各两张），
  原图由 `_import/Script_ComposeBootPaper.py` 逐像素正片叠底上去，所以报头、标题、照片与 Notion 上那张完全一致。
  第一版让 AI 直接生成「带内容的报纸」，标题是它编的，作废。**换图或加期**：把原图下到本地，往脚本 `JOBS` 加一行，
  重跑脚本，覆盖 webp，改 `BOOT_PAPER_STAMP`，同步 `Data_BootPapers` / `Data_Text_Boot` / 贴图清单。
  原图自带的第三方转载站水印无法干净去除，原样保留；馆藏红色水印在合成时淡出。来源与纸底提示词见 `_import/Prompts/Texture_BootPaper.txt`。
- 图是紧裁的（纸 + 一圈黑边），三种宽高比都有；CSS 用 `max-width: 62vw / max-height: 82vh` 封顶，比例自动保持。
- 出图模式（`?shot=1`）下不建，截图里不许有它。
- 门禁：`Script_BootPaperTest.mjs`（`npm run test:taierzhuang1938:bootpaper`）逐张核对
  清单 ↔ 磁盘图 ↔ 四条文本 ↔ 贴图清单登记，并测「不与上次重复」。

**历史**：2026-09-30 前这里是一台能转的道具展示台（worker + OffscreenCanvas + TZM 模型）。
它在加载最忙的那几秒自己也要争主线程与显存，且首屏要多拉三个模块、一个 worker 与若干模型，
改成静图后一并退役（`Script_BootProp*` 已删，git 历史里还在）。

