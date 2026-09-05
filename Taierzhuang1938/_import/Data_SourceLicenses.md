# 血战台儿庄 · 外部模型来源与许可

游戏运行时加载 `Model/*.tzm.json`，并为人物换模额外加载
`Model_FpsArmsNraSkeletal01.glb` 与 `Model/Character/` 下的十名日军/国军 GLB。
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
（Gewehr 88 与 ZB-26 的 `Material` = 木），整枪共用一套 PBR 的模型按金属度贴图
（B 通道）拆出非金属木握把。源图只在离线分桶时读取，运行时统一绑 steel/wood
两套共享 PBR（见上），不会把 Sketchfab/Poly Haven 的大图带进 Pages。
为保证没有本机缓存贴图时仍能重建，C96 与 Service Pistol 各保留一张 256px
`Texture_MetalMask.png`（从来源 metallic-roughness / ARM 的 B 通道缩制）；它只在 Blender
离线分桶时读取，不是运行时材质。

| 游戏内武器 | 源文件 | 作者 | 许可 | 史实对应 |
|---|---|---|---|---|
| 中正式 `ZhongZheng` | `Source/Model_PolyHavenBoltActionRifle762/bolt_action_rifle_7_62_1k.gltf` | [Poly Haven — Bolt Action Rifle 7.62](https://polyhaven.com/a/bolt_action_rifle_7_62) | CC0 | 取其老式毛瑟系栓动步枪主体，删除现代瞄准镜、缠布和独立子弹；保留木/钢分桶，全长按史实 1.110 m 缩放。 |
| 汉阳造 `HanYang` | `Source/Model_Gewehr88/scene.gltf` | [TastyTony](https://sketchfab.com/TastyTony) | CC-BY-4.0 | 汉阳八八式的母型就是 Gewehr 88：**整长套筒、曼利夏漏夹弹仓与露出式通条**都是模型自带的，不再用 Kar98k 拉长加假套筒。全长按史实 1.250 m。 |
| 三八式 `Type38` | `Source/Model_Type38Arisaka/scene.gltf` | [Snijboer](https://sketchfab.com/Snijboer) | CC-BY-4.0 | 三八式：防尘滑盖、近乎水平的直拉机柄、护翼准星、两道箍与通条。全长按史实 1.276 m。 |
| 捷克式 `Zb26` | `Source/Model_SketchfabZb26Larkien/scene.gltf` | [Larkien — ZB26](https://sketchfab.com/3d-models/zb26-6920684ec16d40ffb857245be0661d34) | CC-BY-4.0 | 上置直弹匣、提把、两脚架、木托和木握把均来自源模；按史实全长 1.165 m 缩放，剔除包在完整主枪管外的 24k 三角重复细分壳。选定几何 7,811 三角，低于 30k，不做通用减面；成品拓扑清理后 7,781 三角。 |
| 驳壳枪 `Mauser96` | `Source/Model_SketchfabMauserC96Maxence/scene.gltf` | [Maxence Rouillet — Mauser C96](https://sketchfab.com/3d-models/mauser-c96-4c49913126894908906c8512a52facd3) | CC-BY-4.0 | 毛瑟 C96：扫帚柄握把、扳机前固定弹仓、长枪管和系绳环均来自源模；按史实全长 0.288 m 缩放，金属度贴图只用于离线木/钢分桶。 |
| 第二把手枪 `ServicePistol` | `Source/Model_PolyHavenServicePistol/service_pistol_1k.gltf` | [Poly Haven — Service Pistol](https://polyhaven.com/a/service_pistol) | CC0 | 页面两把是同一支枪的闭锁/空仓挂机状态；游戏只取可正常射击的 A 状态，移除展示用弹匣、子弹和 B 状态，修正源坐标方向，并按金属度图拆出木握把；选定源几何 7,265 三角，拓扑清理后成品 7,263 三角。**这一支是整批外部枪模里唯一一份按真米作者化的源**（进 Blender 就是 0.222 m 长），焊接阈值按模型对角线取值，见 `ImportWeapons._WeldDistance`。 |

许可证副本随源放在 `Source/Model_*/license.txt` / `License_*.txt`（Sketchfab 生成的
CC-BY-4.0 署名原文，文件头都有完整 credit 文本，发布时按 CC-BY 要求保留）。

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
| 八九式中战车 `Type89Tank` | `Source/Model_Type89ChiRo/scene.gltf` | [snrnsrk5](https://sketchfab.com/snrnsrk5) | CC-BY-4.0 | 博物馆实体扫描的 Type 89 I-Go (Chi-Ro)：炮塔偏前、塔后机枪、车体右前机枪球座、前起动轮抬高都是模型自带的。导入管线（`_blender/ImportVehicles.py`）按部件组名收桶（Hull/Turret → armor、Track → track、Barrel → steel），炮塔单独成 joint 节点，尺寸按史实 2.15 × 2.56 × 4.30 m 逐轴归一；保留源件约 4,100 三角。源图为 2K 烘焙扫描图，运行时按共享 PBR 三桶重漆。 |
| 九五式轻战车 `Type95HaGo` | `Source/Model_Type95HaGo/scene.gltf` | [Jesper Landin](https://sketchfab.com/JesperLandin) | CC-BY-4.0 | Type 95 Ha-Go 高模扫描源 82,142 三角；减至 80k 只降 2.6%，按“降幅 5% 及以下不减面”规则保留原始拓扑。源文件没有可拆的炮塔/车体/履带语义节点，仍作为单一静态装甲件；资产提供标准挂点，但炮塔不可独立旋转。尺寸归一为 2.07 × 2.27 × 4.38 m。 |
| 九七式中战车 `Type97ChiHa` | `Source/Model_Type97ChiHa/scene.gltf` | [snrnsrk5](https://sketchfab.com/snrnsrk5) | CC-BY-4.0 | Type 97 Chi-Ha 博物馆扫描源约 4,000 面；Hull/Turret/Track/Barrel 部件可分别收桶，炮塔保留为 joint 节点。外廓归一为 2.475 × 2.380 × 5.50 m，保留原始 3969 三角、不焊点、不减面。 |

车辆源文件由 `_import/SketchfabFetchTanks.py` 通过 BlenderMCP 下载，构建由
`_blender/ImportVehicles.py` / `BuildVehicles.py` 完成；每份下载包内保留 Sketchfab
导出的 `license.txt`，并以此表提供运行时资产的 CC-BY 署名链。

## 手榴弹（Sketchfab 下载经本机 BlenderMCP）

| 游戏内资产 | 源文件 | 作者 | 许可 | 处理方式 |
|---|---|---|---|---|
| 普通木柄手榴弹 `Model_Type24Grenade.glb` | `Source/Model_SketchfabType24Grenade/scene.gltf` | [KleenStudio — Stick Grenade Type 24 (Stielhandgranate)](https://sketchfab.com/3d-models/stick-grenade-type-24-stielhandgranate-ad344e190dff4943ba6f739a550dbef4) | CC-BY-4.0 | 原包许可文本保留在同目录 `license.txt`。`Script_Type24GrenadeBake.py` 把 3,260 三角的源几何归一为 0.220 m、中心原点、弹头朝 local -Z，并把 2K PBR 压为 1K GLB；`Script_GrenadeAsset.mjs` 预载一次，供第一人称与飞行池共享，读取失败自动退回旧程序化木柄弹。 |

补充的机枪来源与构建策略：

- 十一年式轻机枪 `Type11`：`Source/Model_SketchfabType11/scene.gltf`，
  [buh — Type 11 6.5mm Machine gun](https://sketchfab.com/3d-models/type-11-65mm-machine-gun-outdated-4a24c481a48a413d92208ccfe7772ecc)，
  CC-BY。保留下载包内 `license.txt`；只导入完整枪体，独立摆放的桥夹、散弹和占位
  Cube 不随士兵出现。原始主枪体约 1.05 万三角，按用户要求不减面。
- 九二式重机枪 `Type92Hmg`：`<SourceAssets>/Weapons/Model_CadNavType92/cadnav.com_model/Models_F1002A028/Type 92.ma`，
  [CadNav — Type 92 Heavy Machine Gun](https://www.cadnav.com/3d-models/model-48705.html)。CadNav
  下载原包的 `readme.txt` 允许将模型作为 artwork/project 的一部分使用，禁止单独转售或
  再分发，并要求标注 cadnav.com。因此原 `.ma`、下载包和离线转换的 `Model_Type92Hmg.glb`
  只放在本机 `Taierzhuang1938SourceAssets/Weapons/Model_CadNavType92/`，**不进入公开仓库**；
  构建时只排除两块空白展示 Cube，完整枪体、冷却套、瞄具与三脚架不减面地进入游戏。
- 集束手榴弹、八九式重掷弹筒：程序化模型仍按史料特征建好；集束的去柄副弹与绑绳不能由单枚来源模型替代。

## 大刀（付费源，**不随仓库分发**）

| 游戏内武器 | 源文件 | 作者 | 许可 | 史实对应 |
|---|---|---|---|---|
| 大刀 `Dadao` | `<SourceAssets>/Weapons/CgmolDadao/Model_CgmolDadao.fbx` | [逍姚子不逍遥 — PBR 次世代二十九军战刀](https://www.cgmol.com/model/3/88472.html)（摩尔网 CGMOL） | 付费购买，页面版权声明「不限用途」 | 二十九军/西北军那一路的制式：宽刃前展、上翘削尖、圆盘卡扣、缠柄、柄尾大铁环。全长按史实 0.900 m，刃宽 55→88 mm、刀背 5.7 mm。 |

**这份源模不进公开仓库。** bentleyblanks.github.io 是公开站点；买来的原始文件
只授权用在成品里，不等于可以把 FBX 本身当素材再分发。仓库里只有它派生出的
`Model/Dadao.tzm.json`（选定源几何低于 30k，保留 4,199 三角）和从源包压制的 1K 成品 PBR
`Texture/Texture_Dadao{Base,Normal,Orm}.webp`。原始 4K PNG、FBX 与 .blend 都不分发；
成品贴图保留原 UV，ORM 遵循 R=AO、G=roughness、B=metalness。做法与本文件末尾
Vefects 素材那条一致。

源模存放位置按下面顺序解析（`ImportWeapons._ExternalRoot()`）：

1. 环境变量 `TZ1938_SOURCE_ASSETS`，直接指向存放 `CgmolDadao/` 的那一级
   （也就是 `<某处>/Taierzhuang1938SourceAssets/Weapons`）；
2. 从 `_blender/` 逐级向上找同名兄弟目录 `Taierzhuang1938SourceAssets/Weapons`
   （主仓库与 `.claude/worktrees/` 下的工作树都能命中）。

`CgmolDadao/` 内的可重建源包含 `Model_CgmolDadao.fbx` 与 `tex/None_*.png`；
`_import/Script_BakeDadaoPbr.py` 只读取这份外部源并写出上述 1K 成品图。

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
| 第一人称国军骨骼双臂 `Model_FpsArmsNraSkeletal01.glb` | `Model/Character/Model_LugouNra01.glb`（用户提供的“国军模型 01”派生） | 用户提供 | 沿用卢沟桥角色成品的项目内使用范围 | `_import/Script_BakeNraFpsArms.py` 保留原军装袖、双臂、完整十指、53 骨权重与源动作，只剔除不受上肢骨影响的身体顶点；运行时按步枪/机枪/手枪/近战/投掷物提取手指姿态，并用肩—肘—腕解析 IK 锁到每把武器的左右握持坐标系。 |
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
里统一贴图降采样到 1024；新场景包按资产规范保留或减面、逐构件底部归零，并在
运行时绑定本作共享材质。关卡摆放与构件库预览都由 `Script_ExternalProps.mjs` 负责。

| 游戏内资产 | 源文件 | 作者 | 许可 | 处理方式 |
|---|---|---|---|---|
| 民居排屋 `Model_AsianHouseRow.glb` | [Asian House Pack - Low Poly](https://sketchfab.com/3d-models/asian-house-pack-low-poly-70f36c58345440fe8e7b6168854881e7) | [PolyDavid](https://sketchfab.com/PolyDavid) | CC-BY-4.0 | 四栋一排的低模民居。贴图 2048→1024，底部对齐原点。 |
| 民居双栋 `Model_AsianHousePair.glb` | [Asian House - Two Pack](https://sketchfab.com/3d-models/asian-house-two-pack-2aa7bfde643145a3a6aa3a85b06afcd2) | [PolyDavid](https://sketchfab.com/PolyDavid) | CC-BY-4.0 | 两栋组合。贴图 2048→1024，底部对齐原点。 |
| 沙袋 `Model_Sandbag.glb` | [Sandbag Low Poly Realist](https://sketchfab.com/3d-models/sandbag-low-poly-realist-7d52600a15c747749d845d9f906045cf) | [Islide](https://sketchfab.com/Islide) | CC-BY-4.0 | 单体沙袋，缩放到 0.6 m 长；贴图 2048→1024，底部对齐原点。 |
| 中式四合院 `Model_AncientChineseCourtyardHouse.glb` | [Ancient Chinese Courtyard House](https://sketchfab.com/3d-models/ancient-chinese-courtyard-house-ed4ea9eb5f024d989eec182d48fa72d8) | [BlackBirb](https://sketchfab.com/BlackBirb) | CC-BY-4.0 | 作为序章单处地标；减至 5,500 三角，使用共享夯土和屋瓦材质。 |
| 战场构件 `Model_BattlefieldPack.glb` | [Battlefield Pack](https://sketchfab.com/3d-models/battlefield-pack-dcd0ade8c80e46d982a54fe4619f1c87) | [Blenderust](https://sketchfab.com/narighillya) | CC-BY-4.0 | 拆成 24 个独立节点，选定源几何 27,862 三角全部保留；源文件两件铁丝网确为各 80 三角的无刺螺旋线，仍随包留档，但运行时同名 id 已改接项目自制资产。 |
| 铁丝网 `Model_BarbedWireSet.glb` | `Script_BuildBarbedWireSet.py` 项目内程序化建模 | 本项目自制 | 仓库项目资产 | 两件均落地并保持原约 3.2 m 摆位占地：带卡扣、尖刺的蛇腹网和三道有刺桩网。 |
| 手推车和市场储物 `Model_Handcart.glb`、`Model_MarketStorageSet.glb` | [Medieval Market Asset Pack](https://sketchfab.com/3d-models/medieval-market-asset-pack-006ffc4ac5f34a1782f567b07e6605f2) | [vmatthew](https://sketchfab.com/vmatthew) | CC-BY-4.0 | 新手推车替换旧模型，减至 4,200 三角；另拆出 2 种米袋、3 种木箱、4 种板条箱，单件不超过 900 三角。 |
| 无叶乔木三变体 `Model_LeaflessTreeSet.glb` | [Old Oak without Leaves (high-poly)](https://sketchfab.com/3d-models/old-oak-without-leaves-high-poly-74064e17b0204be3951e177e5ed4abbc)、[tree without leaves #1](https://sketchfab.com/3d-models/tree-without-leaves-1-336d3bc197ce4618ab325e7a6dfa0e7a)、[tree without leaves, Low Poly](https://sketchfab.com/3d-models/tree-without-leaves-low-poly-71289b9e874949b6ada6acc3c819d152) | [Sereib](https://sketchfab.com/Sereib)、[Helindu](https://sketchfab.com/Helindu) | CC-BY-4.0 | 三件均落地、统一高度基准并移除源贴图；成品分别 47,998 / 60,000 / 22,700 三角，第三件因源模只有 22,700 面而以原拓扑封顶。运行时共享 `TreeBark` 材质。 |

CC-BY-4.0 要求署名：以上作者与链接即发布署名，随本文件保留。
新三包的原始 `scene.gltf` / `scene.bin`、Sketchfab 自动生成署名和许可副本保存在
`Source/Model_Sketchfab*/`；`Script_SketchfabPackBake.py` 可重建四份运行时 GLB。

无叶树三份原始 `scene.gltf` / `scene.bin` 与 Sketchfab 自动生成的 `license.txt`
同样保存在各自 `Source/Model_Sketchfab*Tree*` 目录；
`Script_SketchfabTreeBake.py` 可重建 `Model_LeaflessTreeSet.glb`。

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

## 生活布设三包（2026-08-25 密度轮新增）

| 运行时文件 | 来源 | 许可 | 处理后预算 |
|---|---|---|---|
| `Model_ChineseLifeSet.glb`：16 件中式生活件（水缸/陶瓮/酒坛/石磨盘/石井台/条凳/凉床/簸箕/笸箩/斗笠/布灯笼/铺面门板/柴垛） | Sketchfab 13 个源模型，作者：KOREA HERITAGE SERVICE (KHS_Asset)、Joan Tieu、Khyoocumber、MushyDay、Scritta、Bharath (sneeky)、Lyskilde (longtail)、dukat.andrej；UID 与逐件对应记录在 `Data_ExternalAssets_ChineseLife.mjs` 文件头与 `Source/Model_Sketchfab*/License_SketchfabSource.txt` | CC-BY-4.0 | 选定源几何 18,420 三角全部保留，763 KB，GLB 内无贴图；石井台/石磨盘在运行时另载作者原 PBR，铺面门板另载无字 imagegen PBR |
| `Model_HouseholdWareSet.glb`：14 件家什容器（木桶/木盆/陶罐/花盆/笸箩/提篮/凳/粗木桌/斧锤锹/柴枝/风灯） | Poly Haven（slug 清单在 `Data_ExternalAssets_HouseholdWare.mjs`；`Source/Model_PolyHaven*/`） | CC0 1.0 | 10,594 三角，537 KB，无贴图 |
| `Model_RuralYardSet.glb`：15 件村居农具（井圈/柴堆/草垛/劈柴墩/石槽/陶盆/水桶/锄/锹/木料/车轮/条凳/方凳/晾杆） | Kenney（Nature / Survival / Graveyard / Fantasy Town Kit）与 Quaternius（Medieval Village），URL+sha256 在 `_import/Source/*/Source_RuralYard.json` | CC0 1.0 | 3,606 三角，254 KB，无贴图 |

## 特效轮廓纹理（常驻烟雾、燃烧与落点预警）

| 游戏内资产 | 来源 | 作者 / 页面声明 | 处理方式 |
|---|---|---|---|
| `Texture/Texture_VefectsFireMask_01.webp`、`Texture_VefectsGroundFireMask_01.webp`、`Texture_VefectsSmokeMask_01.webp`、`Texture_VefectsNoise_03.webp`、`Texture_VefectsNoise_08.webp` | [Free Fire VFX - Unity](https://vefects.itch.io/free-fire-vfx-unity) 的 `Vefects_VFX_Free_Fire_SRP_Final_01.unitypackage` | Vefects - Realtime VFX for Games；发布页标为免费游戏资产，但没有另附 CC0 / CC-BY 文本，因此不得写成 CC0 | 从 Unity 包中保留原灰度轮廓与噪声，无损转 WebP。`Script_Vfx.mjs` 将轮廓 + 滚动噪声用于常驻烟源、柱状火和贴地火；异步加载失败则回退原程序化烟火。完整源包、15 个 prefab、未使用的灰烬/尘土/渐变纹理及联系表保存在本机 `C:\Users\Bentl\Documents\Program\Taierzhuang1938SourceAssets\Vfx\VefectsFreeFire\`，不把未用素材塞进站点。 |
| `Texture/Texture_IncomingMarker_01.webp`（炮弹落点预警准星，768×768 RGB 无损 WebP） | 两张 OpenAI 内置 imagegen 生成图：`Marker_Reticle.png`（黑底白线稿：外圈、16 段虚线、四刻度、中心点、线稿间焦土颗粒）与 `Marker_DustGrain.png`（黑底灰度尘团）；原图保存在本机 `C:\Users\Bentl\Documents\Program\Taierzhuang1938SourceAssets\Vfx\IncomingMarker\` | 本项目通过 Codex CLI 调 imagegen 生成（2026-09-05），无第三方作者与许可约束 | `_import/BuildIncomingMarkerTexture.py`：只取 RGB 亮度（imagegen 的 alpha 是抠图估值，会把线稿削半，故忽略），按亮度质心与外圈半径重新居中缩放，线稿经开运算去掉散点后进 R，虚线环与外圈之间的颗粒进 G，尘团重居中、径向淡出后进 B；G/B 量化到 32 级以压体积。`Script_Vfx.mjs` 的 `marker` 池采样三通道，加载失败退回程序化收缩环。 |

用户同时选中的 Compositing Academy **Free VFX Fire Elements** 免费档未并入本公开仓库：
该档仅允许个人非商业成品，并明确禁止在 Git repositories / project files 中分发原素材或
修改素材。它还需要以邮箱完成 `$0` 订单，当前既未代填用户身份，也未把受限素材下载或提交。
若未来改为符合其条款的私有素材发布链路，再由合法取得的下载包接入；在此之前不参与运行时。

## 用户提供的卢沟桥武器合集（2026-08-28）

| 游戏内资产 | 来源 | 权利状态 | 处理方式 |
|---|---|---|---|
| `BrowningTripodAssembly`、`UnidentifiedMunition`、`OfficerSwordSet`、`RingPommelDagger`、`Type11`、`Mauser96`、`MediumMortar`（另有 `WaltherP38`、`Karabiner98k`、`UnidentifiedBoltActionRifle`、`UnidentifiedAntiaircraftGun`、`LightMortar` 五件于 2026-09-05 按史实考据移除，见 `_import/Reference/LugouqiaoWeapons/Data_LugouqiaoWeaponIdentification.md`） | 用户提供的 `武器.max` 与同目录 `texture/` | 用户提供；本仓库未取得也不推断第三方公开许可 | 按 12 个根节点拆成独立 Blend（现存 7 件），16 张 DDS/TGA/JPEG 原图逐文件保存在 `_import/Source/Model_LugouqiaoWeapons/Texture_Source/`。运行时 TZM 保留 UV/材质槽，浏览器贴图由 `Script_SplitLugouqiaoWeapons.py` 转换；型号不明的八件附识别截图，不冒认史实制式。 |

这批资源不是公开素材库下载项，不应被重新标成 CC0 / CC-BY。若站点公开分发权限后续无法确认，应移除这批源 Blend、原始贴图和运行时派生物，再恢复项目原有武器模型。
