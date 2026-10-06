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
由 `Data_Tuning_CommandRoom.depthOfField` 管理。主菜单焦距 3 m、清晰范围 .65 m，
最大弥散半径 4.5 CSS px；二级页使用两趟半分辨率高斯模糊加强背景虚化。
选章、注记、关于、设置及声音／画面／操作子页共用焦点状态，时间常数 .18 s，
约 .54 s 到达目标的 95%；快速返回或反向切换从当前状态继续，减少动态效果时直接切换。
渲染分辨率和 DPR 改变时保持 CSS 像素半径。窗外自发光底色略加红，
体积光和浮尘同步偏暖；不增加另一个太阳，不改变既有窗光方向。
桌面旧损由木板本体的倒角、缺口和磨痕表现，
单窗天空补光与曝光提亮可读区域，太阳方向保持一致。`host.staticBackdrop` 关闭时，
下文原有战场机位系统仍可运行，正式入口默认启用指挥室。

窗外由 `Script_CommandRoomCourtyard.py` 建立近处树干与枝条、中层院墙和瓦檐、远层屋顶及天空，真实几何参与相机视差。

原工程在 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/CommandRoom/Scene_CommandRoom.blend`。
椅子相对原布设转向桌面并沿桌后法线后撤 18 cm，座面、竖条和横撑已连接；
重建时用世界空间三角网格检查椅桌及悬挂衣服与椅背的穿插。帽檐、两支 18.5 cm 铅笔、木尺、
95 mm 高墨水瓶、230 × 80 mm 笔盒和蘸水笔按桌板与纸面实际高度落放，保留 0.6 mm 接触余量，
逐组检查与支撑面不相交。墨水瓶和蘸水笔是一般年代陈设，并非王铭章实物复原。
`_blender/Script_CommandRoomDetails.py` 调用 `Script_CommandRoomTailoring.py`（墨水瓶），
再由 `Script_CommandRoomDrape.py` 生成帽服。
衣服依据 `Source/Reference_CoatDrape.png` 从单个衣钩收拢；军帽依据 `Source/Reference_CapTurnaround20261006.png` 中用户确认的 Lovart 三视图，由 `Script_CommandRoomReferenceCap.py` 重建。
衣身与袖筒用连续衣片连接，由 `Script_SimulateCommandRoomCoat.py` 在 Blender 中以领后悬挂点、重力、自碰撞和墙体碰撞计算 300 帧静态垂坠。
求解结果保存为 `Data_CommandRoomCoatMesh.json`；`Script_CommandRoomSimulatedCoat.py` 对整件空衣调整朝向、袖口高度，添加薄壳厚度、缝边与暗扣。运行时只加载静态网格，没有布料模拟开销。
军帽帽体宽约 21 cm，低平软帽冠、独立折叠护布、约 5.7 cm 短帽檐、前方两枚凸面黄铜扣和十二道光芒帽徽，后面只保留竖缝。取消原先 1.45 倍放大。三视图作为美术建模参考，并非历史实物证据。
衣服使用 Imagegen `Source/CommandRoomClothSerge.png`；帽子独立使用
`Source/CommandRoomCapTwill20261007.png` 的普通灰褐斜纹棉布。两者均为 25 cm 一铺、
1K 基色与 512 法线/ORM，法线起伏分别为 0.18 / 0.16 mm。专用 `menuCloth`
类允许 4096 px/m，其余贴图仍沿用原密度上限，单套文件预算不变。
`Script_CommandRoomFurniture.py` 用七层截面构成桌板圆角并向内切局部缺口；
桌板额外布尔切除顺纹 V 形收尖裂口，端裂长 28–74 cm，口宽 6–10 mm、深约 28 mm；
板面还有 80–102 cm 长的干缩检查裂纹。木屑、悬浮黑线不参与这些裂口。
柜子具有圆角台面、下压边、实框凹面抽屉和铁拉手底座。检查标签 4/5 对应桌子/柜子。
柜子、窗沿、桌椅共享风化木纹理；柜子独立材质保留更深的旧棕漆和较低粗糙度，桌面保持磨白的干木色。木材边角磨损进入几何与顶点色。
2026-10-07 按用户砖木民居参考改成暖白石灰皮、黄土底灰与少量青灰砖。Imagegen 补制白灰和青砖基色，经统一 baker 输出 normal/ORM。大破口内仅约半宽的更深处露出砖，外围保留连续土黄底层。
`Script_CommandRoomWallWear.py` 用非径向凹凸轮廓切出灰泥破口，边界再加入毫米级
崩缺与 13–27 mm 不等的剥落截面。主要破口外还有约 6 mm 的浅层脱皮，砖面保留少量狭长旧灰浆；
墙面低处积灰、石灰层褪色使用连续的世界空间顶点色，不以等大的斑点或悬空碎片表现。灰浆位于墙面后 27 mm，砖面约后退 17 mm，
砖缝为浅凹石灰层，错缝砖行在各破口间保持一致。砖面凹蚀使用细分几何和独立 512² PBR；
以上为场景缩放前尺寸。灰浆与剥落截面独立合批并提高 UV1 密度，仍共用墙体 PBR，避免细砖缝低于光照像素而形成黑描边。
顶点色缺失时补白色中性乘数，木板布尔切面的新顶点也补齐旧木反照率。
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

