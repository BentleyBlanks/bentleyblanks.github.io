# 血战台儿庄 · 外部模型来源与许可

游戏运行时加载 `Model/*.tzm.json`，并为人物换模额外加载 `Model_FpsArms.glb`、
`Model_IjaSoldier.glb`、`Model_NraSoldier.glb` 与两份 `Model_Civilian*.glb`。
`_import/Source/` 下的是可追溯、可重建的原始素材，页面不会直接加载。

武器 TZM 保留几何与 steel/wood 材质分区。源包自带的 2K/4K 贴图不直接进入 Pages；
全部枪械共享 `Texture/Texture_WeaponSteelV2*` 与 `Texture/Texture_WeaponWoodV2*` 的 512px
BaseColor / Normal / ORM，避免一个班每把枪都重复下载大图。两套基础材质由 OpenAI 内置
imagegen 生成去光照、无物体轮廓的可平铺 Albedo；`BuildWeaponPbr.py` 再从同一像素源派生
法线与 glTF 通道顺序的 ORM（R=AO、G=roughness、B=metalness），以保证四个 PBR 通道对齐。
历史特征按仓库记录的公开、可再分发来源和以下枪型实物照片进行复核：中正式/汉阳造分别保留
毛瑟标准型短管与 Gewehr 88 套筒；ZB-26 保留上插直弹匣、散热环、提把与两脚架；三八式保留
防尘滑盖、直拉机柄、护翼准星与安全帽；C96 保留前置固定弹仓、节套、长抽壳钩与扫帚柄握把。

## 枪械（Sketchfab 下载经本机 BlenderMCP）

运行中的 Blender（Blender 5.1 + blender-mcp 1.8.3 内置 Sketchfab 集成）持有用户的
Sketchfab API Key（登录账号 BentleyJobs）。下载走 `_import/SketchfabBridge.py` +
`SketchfabFetchInner.py`：前者是 blender-mcp 协议（127.0.0.1:9876）的薄客户端，
后者是注入 Blender 执行的下载脚本，两者都不带 token —— 密钥只存在 Blender 里。

导入管线（`_blender/ImportWeapons.py`）按来源模型的结构把几何分进 steel/wood 两桶：
UModeler 拆件按**节点名**（三八式的 `All_Wood` 整组），纯色材质低模按**材质名**
（Gewehr 88 的 `Material` = 木）。所有源图都会被丢弃，运行时统一绑 steel/wood
两套共享 PBR（见上）。

| 游戏内武器 | 源文件 | 作者 | 许可 | 史实对应 |
|---|---|---|---|---|
| 中正式 `ZhongZheng` | `Source/Model_PolyHavenBoltActionRifle762/bolt_action_rifle_7_62_1k.gltf` | [Poly Haven — Bolt Action Rifle 7.62](https://polyhaven.com/a/bolt_action_rifle_7_62) | CC0 | 取其老式毛瑟系栓动步枪主体，删除现代瞄准镜、缠布和独立子弹；保留木/钢分桶，全长按史实 1.110 m 缩放。 |
| 汉阳造 `HanYang` | `Source/Model_Gewehr88/scene.gltf` | [TastyTony](https://sketchfab.com/TastyTony) | CC-BY-4.0 | 汉阳八八式的母型就是 Gewehr 88：**整长套筒、曼利夏漏夹弹仓与露出式通条**都是模型自带的，不再用 Kar98k 拉长加假套筒。全长按史实 1.250 m。 |
| 三八式 `Type38` | `Source/Model_Type38Arisaka/scene.gltf` | [Snijboer](https://sketchfab.com/Snijboer) | CC-BY-4.0 | 三八式：防尘滑盖、近乎水平的直拉机柄、护翼准星、两道箍与通条。全长按史实 1.276 m。 |
| 驳壳枪 `Mauser96` | `Source/Model_MauserC96.glb` | [Plewr](https://plewr.itch.io/mauser-c96-low-poly) | CC0 | 毛瑟 C96。丢掉名为 Boom 的枪口焰网格。 |
| 第二把手枪 `ServicePistol` | `Source/Model_PolyHavenServicePistol/service_pistol_1k.gltf` | [Poly Haven — Service Pistol](https://polyhaven.com/a/service_pistol) | CC0 | 页面两把是同一支枪的闭锁/空仓挂机状态；游戏只取可正常射击的 A 状态，压到 5728 三角。原驳壳枪仍保留给既有关卡。 |
| 大刀第二式样 `DadaoAlt` | `Source/Model_SketchfabDadao/scene.gltf` | [Trector](https://sketchfab.com/trector) | CC-BY-4.0 | 大刀的**外观变体**，没有独立武器数值。圆盘吞口、束节木柄、刃线较直的一路，与主式样的环首宽刃刀刻意不同型。许可原文在 `Source/Model_SketchfabDadao/license.txt`。 |

许可证副本随源放在 `Source/Model_*/License_*.txt`（Sketchfab 生成的 CC-BY-4.0 署名原文，
文件头都有完整 credit 文本，发布时按 CC-BY 要求保留）。

## 刺刀（2026-08-25，经本机 BlenderMCP 下载；构建器 `_blender/ImportBayonets.py`）

| 游戏内资产 | 源文件 | 作者 | 许可 | 史实对应 |
|---|---|---|---|---|
| HY1935 刺刀 `BayonetZhongZheng` / 汉阳造配刀 `BayonetHanYang` | `Source/Model_Seitengewehr8498/scene.gltf` | [PL_historyfan_K](https://sketchfab.com/PL_historyfan_K) | CC-BY-4.0 | Seitengewehr 84/98（毛瑟系刀形）作底。license-safe 史实修形：S84/98 无枪口环而 HY1935/汉阳式有 —— 程序化补环与环箍；木柄片按 C96 握片先例程序化贴上；柄段等比、**刃只沿 Z 拉长**到 428 / 395 mm，全长 572 / 517 mm。源包 4K 贴图已剥离（管线绑共享 512px PBR）。 |
| 三十年式刺刀 `BayonetType38` | `Source/Model_Type30Bayonet/scene.gltf` | [Swordmanck](https://sketchfab.com/Swordmanck) | CC-BY-4.0 | Type 30 刺刀：钩形护手 + 枪口环是模型自带的；丢掉刀鞘与腰带对象。全钢处理（PSX 漫反射整体偏棕，色分桶会把整刀误判成木；三十年式本有全钢柄批次）。刃 400 mm、全长 514 mm，上枪后全长 1.663 m 与 Data_Weapons.bayonetTotalM 对上。 |

刺刀是**独立 TZM**（不焊进枪模，枪的全长断言不动），运行时按 `socket`
挂点（枪口环中心）扣到枪的 muzzle 挂点。设计口径见 `docs/Data_Bayonet.md`。

## 战车（同样经本机 BlenderMCP 下载）

| 游戏内资产 | 源文件 | 作者 | 许可 | 史实对应 |
|---|---|---|---|---|
| 八九式中战车 `Type89Tank` | `Source/Model_Type89ChiRo/scene.gltf` | [snrnsrk5](https://sketchfab.com/snrnsrk5) | CC-BY-4.0 | 博物馆实体扫描的 Type 89 I-Go (Chi-Ro)：炮塔偏前、塔后机枪、车体右前机枪球座、前起动轮抬高都是模型自带的。导入管线（`_blender/ImportVehicles.py`）按部件组名收桶（Hull/Turret → armor、Track → track、Barrel → steel），炮塔单独成 joint 节点，尺寸按史实 2.15 × 2.56 × 4.30 m 逐轴归一；摄影测量件先 0.6 mm 焊接再逐连通岛减面到车辆预算 1600 三角（实测 1239）。源图为 2K 烘焙扫描图，运行时按共享 PBR 三桶重漆。 |

仍走 `_blender/BuildWeapons.py` / `BuildVehicles.py` 的程序化几何：

- 捷克式 `Zb26`：Sketchfab 的 CC-BY 候选（Larkien `6920684e…` 17.4k 面 /
  TTadive `ced9fd15…` 9.5k 面）在这版 Blender 5.1 的减面里**卡在 ~0.70 压不下去**
  （全局 collapse、逐连通岛 collapse、dissolve 三条路都试过，最终三角数 6.5–6.7k），
  6000 三角是任务书性能红线，放行不了。现模保留上插直弹匣、提把、散热环与两脚架，
  且第一人称已改为模型路径。将来若换渲染器/减面算法，这两个 UID 可直接回炉。
- 九四式轻装甲车 `Type94Tankette`：Sketchfab 仅有的 CC-BY 候选
  （siaobai77 `ba15d7ee…`，49,999 面、单材质炮塔与车体融成一体、履带无分桶）
  在 1600 三角预算与「炮塔必须是关节」的契约下不可用，保留程序化模型。
- 十一年式轻机枪 `Type11` / 九二式重机枪 `Type92Hmg`：Sketchfab 无 CC-BY 候选
  （试过 type 11 light machine、nambu machine gun、type 92 heavy machine gun、
  japanese ww2 weapon/machine 等词条），保留运行时程序化兜底几何
  （歪把子的左上方敞口方斗特征已做进兜底）。
- 手榴弹、八九式重掷弹筒：程序化模型已按史料特征建好，无免费源可替换。

## 大刀（付费源，**不随仓库分发**）

| 游戏内武器 | 源文件 | 作者 | 许可 | 史实对应 |
|---|---|---|---|---|
| 大刀 `Dadao` | `<SourceAssets>/Weapons/CgmolDadao/Model_CgmolDadao.fbx` | [逍姚子不逍遥 — PBR 次世代二十九军战刀](https://www.cgmol.com/model/3/88472.html)（摩尔网 CGMOL） | 付费购买，页面版权声明「不限用途」 | 二十九军/西北军那一路的制式：宽刃前展、上翘削尖、圆盘卡扣、缠柄、柄尾大铁环。全长按史实 0.900 m，刃宽 55→88 mm、刀背 5.7 mm。 |

**这份源模不进公开仓库。** bentleyblanks.github.io 是公开站点；买来的原始文件
只授权用在成品里，不等于可以把 FBX 本身当素材再分发。仓库里只有它派生出的
`Model/Dadao.tzm.json`（已按 6000 三角预算重算、丢弃源包 4K 贴图、改绑本作
共享 steel/wood PBR）。做法与本文件末尾 Vefects 素材那条一致。

源模存放位置按下面顺序解析（`ImportWeapons._ExternalRoot()`）：

1. 环境变量 `TZ1938_SOURCE_ASSETS`，直接指向存放 `CgmolDadao/` 的那一级
   （也就是 `<某处>/Taierzhuang1938SourceAssets/Weapons`）；
2. 从 `_blender/` 逐级向上找同名兄弟目录 `Taierzhuang1938SourceAssets/Weapons`
   （主仓库与 `.claude/worktrees/` 下的工作树都能命中）。

**找不到源就自动退回程序化几何**：`ImportWeapons.BuilderFor("Dadao")` 返回 None，
`BuildAll` 改用 `BuildWeapons.BuildDadao`。没有这份素材的人 clone 下来照样能跑通
构建，只是重建出的刀会退回旧式样 —— 仓库里已提交的 `Dadao.tzm.json` 是用付费源
建的那一版，别拿没有源的机器去覆盖它。

本机原始下载包另存于
`C:\Users\Bentl\OneDrive\AI\Models\211555_556082_7op5ujvchqffnj3\`（含 4K 贴图与 .blend）。

CC0 不强制署名；表里的作者与链接是为了以后还能找回源文件。

## 人物与第一人称手臂

| 游戏内资产 | 源文件 | 作者 | 许可 | 处理方式 |
|---|---|---|---|---|
| 第一人称双臂 `Model_FpsArms.glb` | `Source/Model_WradArms.glb` | [wwwriks / WRAD Arms](https://github.com/wwwriks/wrad-arms) | CC0 | 保留 50 根手指/手臂骨骼与 512×512 皮肤贴图；离线细分平滑并增加 `GripIdle`，运行时用双臂 IK 跟随原有握点。原始许可副本为 `Source/License_WradArms.txt`。 |
| 日军步兵 `Model_IjaSoldier.glb` | `Source/Model_LowpolyWw2Soldier.fbx` + `Source/Texture_LowpolyWw2Soldier.png` | [nisu / Rigged Lowpoly WW2 Soldier](https://opengameart.org/content/rigged-lowpoly-ww2-soldier) | CC0 | 保留原始 49 骨骨架、蒙皮和贴图，并内置 Idle / Walk / AimRifle / Death 四段动画；制服重着色为土黄、另建九〇式钢盔。为无损复用本作既有动作，另离线生成与 13 关节旧骨架同轴的纹理分段作为运行时显示层。 |
| 国军步兵 `Model_NraSoldier.glb` | `Source/Model_BlueSoldierMale.fbx` | [Quaternius / Ultimate Animated Character Pack](https://opengameart.org/content/animated-characters-pack) | CC0 | 使用下载包里的 `BlueSoldier_Male`，保留灰蓝制服、布帽与装具；按源 FBX 的真实蒙皮权重烘成 13 关节显示层，继续使用本作枪械挂点与动作。 |
| 百姓男/女 `Model_CivilianMale.glb`、`Model_CivilianFemale.glb` | `Source/Model_CasualMale.fbx`、`Source/Model_CasualFemale.fbx` | [Quaternius / Ultimate Animated Character Pack](https://opengameart.org/content/animated-characters-pack) | CC0 | 下载包里的 `Casual_Male` / `Casual_Female` 两种体型；按角色种子稳定选择，烘成同一 13 关节显示层，不携带武器。 |

人物构建命令：

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.1\blender.exe' --background --python Taierzhuang1938/_import/BuildRiggedCharacters.py
```

兼容分段按源 FBX 的蒙皮权重归属到关节，并以源骨骼 rest pose 的真实枢轴重对齐；
不再用模型 XYZ 位置猜胳膊和腿。它只解决“旧动作能不能直接套”的坐标差异，
不改变枪口、握点、AI 状态或动作时序。

## 特效贴图（爆炸火球序列图）

| 游戏内资产 | 源文件 | 作者 | 许可 | 处理方式 |
|---|---|---|---|---|
| 爆炸火球序列帧 `Texture/Texture_ExplosionFire_01.png` | [Explosion Sheet](https://opengameart.org/content/explosion-sheet) 的 `boom3.png` | [StumpyStrust](https://opengameart.org/users/stumpystrust) | CC0 | 原图未改动（1024×1024，4×4 共 16 帧）。运行时由 `Script_Vfx.mjs` 的火球池按序列帧采样：形状细节来自贴图，颜色仍乘游戏色板（fireHot→fireCool）走 HDR 加性混合——台儿庄的爆炸主体色是考据出来的砖粉黄土，色调不归贴图管。贴图加载失败时静默降级回程序化辉光圆片。 |
| 紧凑爆炸 `Texture/Texture_ExplosionUnityCompact_01.webp` | [Unity Labs Free VFX image sequences and flipbooks](https://unity.com/blog/engine-platform/free-vfx-image-sequences-flipbooks) 的 `Explosion00_5x5.tga` | Unity Labs Paris | CC0 | 1024×1024、5×5 共 25 帧；无损 WebP 转码，保留 Alpha。用于掷弹筒、手榴弹等轻/中型爆炸。 |
| 持续火球 `Texture/Texture_ExplosionUnityFireBall_02.webp` | 同上页面的 `FireBall02_8x8.tga` | Unity Labs Paris | CC0 | 1024×1024、8×8 共 64 帧；无损 WebP 转码。黑底贴图走 HDR 加性混合，用于中型爆炸的随机火球形制。 |
| 重炮爆炸 `Texture/Texture_ExplosionUnityHeavy_02.webp` | 同上页面的 `Explosion02HD_5x5.tga` | Unity Labs Paris | CC0 | 2048×2048、5×5 共 25 帧；无损 WebP 转码，保留 Alpha。用于联队炮、师团炮兵与大当量迫击炮。 |

下载命令（原图即运行时文件，未做任何修改）：

```powershell
Invoke-WebRequest -Uri 'https://opengameart.org/sites/default/files/boom3.png' `
  -OutFile 'Taierzhuang1938/Texture/Texture_ExplosionFire_01.png'
```

Unity Labs 三个源包的直接下载地址分别是：

- `https://unity3d.com/files/labs/downloads/vfx/assets01/Explosion00/Explosion00-flipbooks.zip`
- `https://unity3d.com/files/labs/downloads/vfx/assets01/FireBall02/FireBall02-flipbooks.zip`
- `https://unity3d.com/files/labs/downloads/vfx/assets01/Explosion02HD/Explosion02HD-flipbooks.zip`

运行时不纯随机：`Script_Vfx.mjs` 先用 `radius × kind.flash` 得到实际冲击量，再在相邻
两档素材间随机。轻型只会抽到旧火球/紧凑爆炸，中型抽紧凑爆炸/持续火球，重型只抽
持续火球/重炮爆炸；因此连续炮火有变化，但手榴弹不会误播成重炮蘑菇云。

## 场景布设物（Script_ExternalProps.mjs 运行时加载）

以下 GLB 由 Sketchfab 经本机 BlenderMCP 下载（账号 BentleyJobs）。旧三件资产在 Blender
里统一贴图降采样到 1024；新场景包则清除源高分贴图、强力减面、逐构件底部归零，并在
运行时绑定本作共享材质。关卡摆放与构件库预览都由 `Script_ExternalProps.mjs` 负责。

| 游戏内资产 | 源文件 | 作者 | 许可 | 处理方式 |
|---|---|---|---|---|
| 民居排屋 `Model_AsianHouseRow.glb` | [Asian House Pack - Low Poly](https://sketchfab.com/3d-models/asian-house-pack-low-poly-70f36c58345440fe8e7b6168854881e7) | [PolyDavid](https://sketchfab.com/PolyDavid) | CC-BY-4.0 | 四栋一排的低模民居。贴图 2048→1024，底部对齐原点。 |
| 民居双栋 `Model_AsianHousePair.glb` | [Asian House - Two Pack](https://sketchfab.com/3d-models/asian-house-two-pack-2aa7bfde643145a3a6aa3a85b06afcd2) | [PolyDavid](https://sketchfab.com/PolyDavid) | CC-BY-4.0 | 两栋组合。贴图 2048→1024，底部对齐原点。 |
| 沙袋 `Model_Sandbag.glb` | [Sandbag Low Poly Realist](https://sketchfab.com/3d-models/sandbag-low-poly-realist-7d52600a15c747749d845d9f906045cf) | [Islide](https://sketchfab.com/Islide) | CC-BY-4.0 | 单体沙袋，缩放到 0.6 m 长；贴图 2048→1024，底部对齐原点。 |
| 中式四合院 `Model_AncientChineseCourtyardHouse.glb` | [Ancient Chinese Courtyard House](https://sketchfab.com/3d-models/ancient-chinese-courtyard-house-ed4ea9eb5f024d989eec182d48fa72d8) | [BlackBirb](https://sketchfab.com/BlackBirb) | CC-BY-4.0 | 作为序章单处地标；减至 5,500 三角，使用共享夯土和屋瓦材质。 |
| 战场构件 `Model_BattlefieldPack.glb` | [Battlefield Pack](https://sketchfab.com/3d-models/battlefield-pack-dcd0ade8c80e46d982a54fe4619f1c87) | [Blenderust](https://sketchfab.com/narighillya) | CC-BY-4.0 | 拆成 24 个可独立选择节点并全部注册进构件库；战壕 3,500 三角，其余单件不超过 1,519 三角。 |
| 手推车和市场储物 `Model_Handcart.glb`、`Model_MarketStorageSet.glb` | [Medieval Market Asset Pack](https://sketchfab.com/3d-models/medieval-market-asset-pack-006ffc4ac5f34a1782f567b07e6605f2) | [vmatthew](https://sketchfab.com/vmatthew) | CC-BY-4.0 | 新手推车替换旧模型，减至 4,200 三角；另拆出 2 种米袋、3 种木箱、4 种板条箱，单件不超过 900 三角。 |

CC-BY-4.0 要求署名：以上作者与链接即发布署名，随本文件保留。
新三包的原始 `scene.gltf` / `scene.bin`、Sketchfab 自动生成署名和许可副本保存在
`Source/Model_Sketchfab*/`；`Script_SketchfabPackBake.py` 可重建四份运行时 GLB。

### Poly Haven CC0 构件

以下模型经 `Script_PolyHavenFetch.py` 从 Poly Haven 公开 API 下载，再由
`Script_ExternalAssetBake.py` 强力减面、清除高分贴图、逐构件底部归零；运行时复用
项目已有材质。同组变体打进一个 GLB，`Script_ExternalProps.mjs` 按 URL 只加载一次。

| 运行时文件 / 构件 | Poly Haven 来源 | 处理后预算 |
|---|---|---|
| `Model_MilitaryCrateSet.glb`：闭合、打开军箱 | [Old Military Crate](https://polyhaven.com/a/old_military_crate) | 2 × 2400 三角，247 KB |
| `Model_StackableStoneSet.glb`：7 种可堆石块 | [Namaqualand Stones 01](https://polyhaven.com/a/namaqualand_stones_01)、[Stone 01](https://polyhaven.com/a/stone_01)、[Rock 07](https://polyhaven.com/a/rock_07) | 每块 899–999 三角；整包 194 KB |
| `Model_DeadTreeTrunkSet.glb`：2 种无叶枯树干 | [Dead Tree Trunk](https://polyhaven.com/a/dead_tree_trunk)、[Dead Tree Trunk 02](https://polyhaven.com/a/dead_tree_trunk_02) | 2 × 2400 三角，164 KB |

以上 Poly Haven 资源均为 [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)，
许可副本保存在各自 `Source/Model_PolyHaven*/License_PolyHavenCc0.txt` 中。

## 特效轮廓纹理（常驻烟雾与燃烧）

| 游戏内资产 | 来源 | 作者 / 页面声明 | 处理方式 |
|---|---|---|---|
| `Texture/Texture_VefectsFireMask_01.webp`、`Texture_VefectsGroundFireMask_01.webp`、`Texture_VefectsSmokeMask_01.webp`、`Texture_VefectsNoise_03.webp`、`Texture_VefectsNoise_08.webp` | [Free Fire VFX - Unity](https://vefects.itch.io/free-fire-vfx-unity) 的 `Vefects_VFX_Free_Fire_SRP_Final_01.unitypackage` | Vefects - Realtime VFX for Games；发布页标为免费游戏资产，但没有另附 CC0 / CC-BY 文本，因此不得写成 CC0 | 从 Unity 包中保留原灰度轮廓与噪声，无损转 WebP。`Script_Vfx.mjs` 将轮廓 + 滚动噪声用于常驻烟源、柱状火和贴地火；异步加载失败则回退原程序化烟火。完整源包、15 个 prefab、未使用的灰烬/尘土/渐变纹理及联系表保存在本机 `C:\Users\Bentl\Documents\Program\Taierzhuang1938SourceAssets\Vfx\VefectsFreeFire\`，不把未用素材塞进站点。 |

用户同时选中的 Compositing Academy **Free VFX Fire Elements** 免费档未并入本公开仓库：
该档仅允许个人非商业成品，并明确禁止在 Git repositories / project files 中分发原素材或
修改素材。它还需要以邮箱完成 `$0` 订单，当前既未代填用户身份，也未把受限素材下载或提交。
若未来改为符合其条款的私有素材发布链路，再由合法取得的下载包接入；在此之前不参与运行时。
