# 爆炸测试场与通用地形形变

入口：主菜单或暂停菜单的「测试场景 → 爆炸测试场」，直达 `?explosions=1`。
独立关卡 `ExplosionRange`，不推进正片章节；几何在 `Script_ExplosionRangeField.mjs`，
工位、排列、炮击与空袭配置在 `Data_ExplosionRange.mjs`。

## 操作

| 工位 / 情况 | 操作与结果 |
| --- | --- |
| 手榴弹桌 | F 领取；种类从 `WEAPONS` 的 throwable 项自动列出，使用正式库存与模型 |
| 木柄 / 集束手榴弹 | 按住 G / H 蓄力，松开投出；走正式投掷物、引信、伤害与爆炸链 |
| 横排日军战车 | 到车尾按 F，每次交互仅发射一枚向前飞行的炮弹；目录跟随 `WEAPONS` 的日军 vehicle 项 |
| 绿色台 | 投来一枚活手榴弹，练习靠近后 F 拾起返掷 |
| 橙色台 | 呼叫远程炮击；每发发射时按玩家当前位置采样圆盘落点，范围读 `EXPLOSION_BARRAGE.radiusM` |
| 紫色台 | 召唤飞机进场，从机腹释放测试弹，然后爬升飞离；散布读 `EXPLOSION_AIRSTRIKE.radiusM` |
| 蓝色台 | 取消炮击与空袭，清除在途弹、尾迹、预警粒子、炮坑与土沿；将坑内人物抬回恢复的地面 |

本场玩家**无敌**（装配层在 `ApplyDebugOptions` 里强制 `invincible`，与调试面板的开关
无关）：压制、屏幕晃动照常，血量与流血不动。它是看坑与弹道的场地，被自己召来的炮击
炸死再换人，只会把换人时重编着色器的几秒卡顿和一张阵亡卡塞进测试里。

飞机默认不盘旋。只有紫色台呼叫后才出现一架已有轰炸机模型；飞离后重新允许呼叫。
它从场地远端（-Z）压过来、机头朝飞行方向、掠过玩家头顶后爬升离场；机头朝向由
`Data_AircraftAssets.mjs` 的 `noseDir` 对齐，见 docs/Data_AircraftAssets.md「朝向」。
三辆战车的炮口一律朝 -Z（远离玩家那一侧），九五式的源件曾装反，已在导入脚本翻正。
测试弹从飞机的实际位置释放，继续走 `CombatSystem.FireShell`，不是定时在地面播放爆炸。
这里空投的是已有 `Shell75` 测试弹响应，不将其宣称为历史航空炸弹型号。
两类召唤均使用确定性圆盘散布，按每次释放时的玩家位置取样，落点留在场地内。

炮坑通行区有正式 Soldier/Actor 往返走动；`dummy` 只关闭自主交战决策，
寻路、运动学胶囊、重力和脚部 IK 仍运行。士兵死亡后会补回，便于反复实验。

## 共用入口与契约

- `CombatSystem.Blast` 是正式爆炸入口：伤害、建筑破坏、特效之后，将爆炸位置与
  `explosiveId` 交给当前场景的 `deformation.ApplyBlast`。木柄、集束、战车炮、掷弹筒、
  支援迫击炮和远程炮击均有独立目录映射；不要直接改坑深来冒充一次武器爆炸。
- `FireShell` 用连续弹道和分段扫掠命中实际地形 / 障碍物；亮芯与尾迹是表现层。
  撞墙会提前引爆；在高处爆炸对土地的作用随离地间距减弱，超出 `groundReachM` 不挖地。
  `Script_ShellVisual.mjs` 用渐隐带采样真实弹道历史（最多 1 s / 45 m，读 `TRAIL_SPAN_S` /
  `TRAIL_SPAN_M`），出生时没有预先拉长的尾巴，命中时亮芯停在实际扫掠点，残迹短暂淡出。
  可见性口径：站在场里要能肉眼看见 145 m 外的炮击与 36 m 高空炸弹的整条来路——
  尾迹加色相加混合，带宽与亮芯都有按视距的像素下限，远处不许缩成一个点。
  两者不写入法线深度预通道。
  未命中的超时弹只回收，不能将爆炸瞬移到它正下方的地面。
- `Vfx.IncomingMarker(position, secondsToImpact, { radius })` 是落点预警的唯一表现入口，
  掷弹筒、炮兵支援、测试场炮击与空投都走它。`marker` 池一张贴地 quad 演完整个倒计时：
  `Texture_IncomingMarker_01.webp` 的线稿（外圈 / 16 段虚线 / 四刻度 / 中心点）慢转并向
  落点收拢、闪频从 2 Hz 升到 8 Hz，程序化收缩环与追赶脉冲一路收到中心亮核，最后 15% 亮核
  炸亮；线稿间的焦土颗粒与被下压气流掀起的尘团贴面受光，另有几团低尘被吸向落点。
  外圈半径取杀伤半径的一半并夹在 2.4—4.2 m；落在坑沿 / 坡面上悬空的部分按预通道深度差淡掉。
  贴图加载失败只退回程序化环与亮核。贴图由 `_import/BuildIncomingMarkerTexture.py` 从两张
  imagegen 源图打包，来源与许可见 `_import/Data_SourceLicenses.md`。
- `Script_GrenadeReturn.mjs` 给各关注册高优先级交互。距离、垂直差、遮挡、离手宽限、
  剩余引信与拾取动作时长由 `GRENADE_RETURN` 管。F 拾起后按当前瞄准方向自动返掷，
  **沿用同一枚 Projectile 与原引信**，不补库存、不重置倒计时；已经来不及的弹不给交互。
- `TerrainDeformation` 存稀疏的有符号高度差：正值挖土，负值是坑外的堆积土沿。
  基础高度仍由关卡提供；界河仍来自
  `SampleJieheHeight`，没有第二套地形公式。基础节点缓存随 Reset / 换关清除。
- 各场景的 `GroundHeight` 在已分配块内使用同一格点和三角对角线插值；渲染、
  Rapier、玩家、NPC、子弹与 IK 共用。`BaseGroundHeight` 只用于原始地形 / 建筑分类。
- `TerrainDeformationView` 只重建脏块，裁掉原地表覆盖部分，再提交局部网格与同一组
  格点高度的 Rapier heightfield（对角线一致，见 `Data_TechPhysics.md`「地表与爆炸形变」）。
  洞在主画面、阴影和深度通道都存在。保留原地表几何以供复原。
  炮坑材质在建关时由 `Warm(renderer, camera)` 预编译：一枚代理片提交 `renderer.compile`
  后放进场景深处画一帧再自行移除；第一颗手榴弹落地那一帧不再同步等驱动链接程序。
- 土路、耕地与薄地表层按同一格网局部细分，保持原 UV 与边界，随坑底下降。
  识别名单在 `GROUND_OVERLAYS`；新增地表材质须登记并补可见表面 / 碰撞对账。
- 连续爆炸只加深或扩大已有坑，不会把旧坑填平。深度上限、格距和坡度约束都读
  `TERRAIN_DEFORMATION`。坡度松弛通过扩大坡面维持通行，不把坑作为导航障碍盒。
  堆积沿跟随实际坑口边界，不在旧坑内回填；高度与宽度读 `maxRimM` / `rimWidthM`，
  内外两面也受相同坡度限制，地基和水面同样不允许堆土。
- 坑壁与土沿复用已有 Ground 土壤 albedo / normal，以世界坐标采样并逐像素混合。
  土色覆盖使用独立的扰动强度，跨越正负高度差的零点时不能露出一圈白地。
  持久爆炸痕迹由这层土壤材质承载；Vfx 爆炸不再生成水平焦痕 quad，避免旧高度的
  贴片被坑壁截成多层同心环。普通子弹命中的小型弹孔继续使用原贴花池。
  白盒悬浮说明牌不投射阴影，避免说明牌的阴影条带盖在被测坡面上。
- 建筑地基、实体路基、桥、工位与水面受保护；土层方案不负责掏空建筑基础或开挖洞穴。
  静态导航分类读基础地面，避免地面下降把矮物重新认成堵路高墙。
- 换关或重新载入会清除炮坑。当前没有跨会话炮坑存档；蓝色台提供本关即时复原。

## 爆炸帧预算

一次爆炸是**同一帧内**完成的：伤害、破坏、形变规则、脏块网格、碰撞体、粒子。
2026-09-05 在爆炸测试场实测（RTX 4070 SUPER / Edge，`Script_ExplosionRangeTest` 的 JSON
保留 `lastUpdateMs` 供复查），改前后：

| 项 | 改前 | 改后 | 做法 |
| --- | --- | --- | --- |
| 首颗手榴弹落地的下一帧 | ~400 ms（编译 `CraterSoilV1`） | 无新 program | 建关时 `Warm()` 预编译 |
| 每颗手榴弹的爆炸帧（规则 + 网格 + 碰撞） | 10–30 ms | 2–4 ms | 格点改整数键、单次填充带光环的平面数组、heightfield 代替 trimesh、地基掩码记忆 |
| 正片开新块（城内道路 / 界河） | 160–440 ms | 见下 | 同一帧新开的多块只扫一遍地表三角（`CutTerrainRectangles`）、覆盖层磨损查同一块格点、不再每爆零时间 step |
| 炮坑块内的 `GroundHeight` | 慢约 100 倍（每次八个字符串键） | 慢约 5 倍 | 同页四角直接读数组 |
| 阵亡换人 | 约 3 s（换人重编 9 个 program） | 本场不再阵亡 | 场内无敌 |

规则层的数值与旧实现逐节点一致（`Node`/`GroundHeight`/脏块集合全等，旧版留在 git 历史里可复核）。
`TerrainDeformation.Allowed` 的记忆在碰撞盒表变化时由 `Destruction._Commit` 与
`TerrainDeformationView.ApplyBlast`（按 `colliders.length`）作废，墙塌后脚下的土才准挖。

## 考据与调参边界

`Data_Explosives.mjs` 的 `fillingKg` / `evidence` 记录参照弹药；
`craterRadiusM`、`craterDepthM` 和 `groundReachM` 是干土表面爆炸的游戏调参，
不冒充实测弹坑，也不把破片杀伤半径当成坑径。落地炮弹比手投弹有更强的地面耦合；
集束、较大口径通常挖出更大土体。各弹种的地形响应与原有人员伤害数值分开维护。

| 游戏目录 | 依据与可信度 |
| --- | --- |
| `Grenade` | [斯洛伐克军事历史研究所 M24 藏品](https://ebadatelnavhm.vhu.sk/item/9/31)；用作木柄弹能量参照，不声称中国各兵工厂装药完全相同 |
| `GrenadeBundle` | 按已有游戏模型的弹头数与木柄弹参照量组合，属于游戏估计 |
| `Shell37` | [美军《Japanese ammunition data》，1945，印刷页 22](https://www.bulletpicker.com/pdf/Japanese-Ammunition-Part-4.pdf)：九四式榴弹装药 |
| `Shell57` | [TM 9-1985-5，印刷页 300](https://www.bulletpicker.com/pdf/TM-9-1985-5.pdf)：九〇式高爆弹 |
| `Shell50` | [同册，印刷页 372–373](https://www.bulletpicker.com/pdf/TM-9-1985-5.pdf)：八九式掷弹筒榴弹；扫描文本标题口径有 OCR 错误，正文口径与武器对应 |
| `Shell75` | [同册，印刷页 321](https://www.bulletpicker.com/pdf/TM-9-1985-5.pdf)：九四式野炮榴弹参照 |
| `Shell82` | [美军《Catalog of Standard Ordnance Items》，1944，Vol. 3，M43A1 条目](https://www.bulletpicker.com/pdf/Catalog-of-Standard-Ordnance-Items-Vol-3.pdf)：邻近口径迫击炮弹量级参照；未取得游戏中方弹药的具体批次装药记录 |

技术路线参考 [DICE / Frostbite 的 SIGGRAPH 地形渲染资料](https://media.contentapi.ea.com/content/dam/eacom/frostbite/files/chapter5-andersson-terrain-rendering-in-frostbite.pdf)
中的局部高度场破坏和脏区域更新。本实现是适合浏览器与现有关卡的稀疏 CPU 高度场，
没有宣称复刻商用引擎的完整 GPU 管线、体素破坏或真实土壤力学。
凹陷加边缘隆起的形态参考 Eidos-Montréal 的
[《Rise of the Tomb Raider》SIGGRAPH 2015 分享](https://www.slideshare.net/slideshow/labs-siggraph15trxno-videos/130489149)
中 Procedural Snow Deformation 部分，以及 Michels / Sikachev 的
[GPU Pro 7「Deferred Snow Deformation」](https://www.routledge.com/GPU-Pro-7-Advanced-Rendering-Techniques/Engel/p/book/9781498742535)。
本项目将这个形态思路用于土坑，继续使用浏览器的稀疏 CPU 网格和共用碰撞采样，
不依赖原方案的 compute shader / 硬件细分，也不模拟雪地回填或守恒的土方运输。
返掷的交互参考 [Call of Duty 官方手册](https://cdn2.callofduty.com/assets/codbo/pdf/COD_NDS_OMAN_US_v4.pdf)
中的附近手雷提示与返掷动作；具体时间窗与持续引信规则以本项目配置为准。

## 弹坑视觉参考与实现

2026-09-06 参考 [《Battlefield 1》泥地近景](https://wall.alphacoders.com/big.php?i=937681)
和 [《Call of Duty: WWII》Pointe du Hoc 实机场景](https://callofdutymaps.com/world-war-2/pointe-du-hoc/)
的翻土层次与破碎边缘；这些图片仅作观察参考，不作为游戏贴图分发。
本项目保持干土地表，采用暗色压实坑底、较浅的外翻浮土和疏密不一的半埋土块。

- 轮廓加入稳定的非对称缺口，土沿的堆积高度更不均匀；仍经过原有坡度约束，
  保留最大深度、最大土沿高度、地基保护和重复轰击不回填规则。
- 沿用已有 Ground PBR 贴图，世界坐标程序化土块补足中尺度凹凸；破碎边界、
  坑底色差、粗糙度与法线在同一地形材质里处理，道路覆盖层共用这一实现。
- 土块细节只影响着色，不增加贴花、网格、纹理下载或碰撞体；厘米级表面凹凸不参与碰撞。
  宏观坑形仍由同一顶点数据同时供渲染和 Rapier 使用，空隙遮蔽只乘间接光。

## 验收与取证

```powershell
node Taierzhuang1938/Script_ExplosionRulesTest.mjs
node Taierzhuang1938/Script_ExplosionRangeTest.mjs
node Taierzhuang1938/Script_CraterSurfaceTest.mjs
node Taierzhuang1938/Script_TestRunner.mjs --changed=origin/master --profile=prepush --fail-fast
```

纯规则测试覆盖目录完整性、威力层次、叠加、上限、坡度、分块接缝、地基与返掷窗口，
以及真实土沿高度、重叠爆炸不回填旧坑、堆积沿两面的坡度与地基保护。
浏览器测试通过正式 F / G / H 输入验证库存、单发战车、持续引信、两种召唤、飞机退场、
真实网格 / Rapier 射线、玩家和 NPC 穿坑，并在正片道路与界河高程上再做表面对账。
另核对 heightfield 与 `GroundHeight` 在每个子格四象限一致、首爆不新建 program、
预热代理片已自行移除、玩家在贴脸爆炸下血量不动，以及单颗手榴弹的形变耗时上限。
另检查尾迹与真实弹道一致、撞墙截断、空中超时、同时取消炮击与空袭后无延迟爆炸、
尾迹和预警粒子清理、真实土沿表面对账、坑内人物即时复位。
截图和 JSON 报告落在 `_shots/ExplosionRange/`；JSON 同时保留形变耗时供性能复查。
表面回归额外通过正式 Blast 连续挖坑，再切换贴花层做 HDR 像素对照：坑壁不能依赖
悬空贴片，普通子弹弹孔仍须产生可见像素。取证落在 `_shots/CraterSurface/`。

调试入口：`Debug.Explosions.State()` / `GoTo(id)` / `Reset()`，通用查询为
`Debug.TerrainDeformation.State()` / `Height(x,z)` / `BaseHeight(x,z)` / `Reset()`。
