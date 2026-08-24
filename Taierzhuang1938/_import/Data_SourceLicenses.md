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
| 中正式 `ZhongZheng` | `Source/Model_Kar98k.obj` | [byzmod3d](https://opengameart.org/content/low-poly-weapon-pack) | CC0 | 中正式是毛瑟标准型短管，剪影与 Kar98k 同族。全长按史实 1.110 m 缩放。 |
| 汉阳造 `HanYang` | `Source/Model_Gewehr88/scene.gltf` | [TastyTony](https://sketchfab.com/TastyTony) | CC-BY-4.0 | 汉阳八八式的母型就是 Gewehr 88：**整长套筒、曼利夏漏夹弹仓与露出式通条**都是模型自带的，不再用 Kar98k 拉长加假套筒。全长按史实 1.250 m。 |
| 三八式 `Type38` | `Source/Model_Type38Arisaka/scene.gltf` | [Snijboer](https://sketchfab.com/Snijboer) | CC-BY-4.0 | 三八式：防尘滑盖、近乎水平的直拉机柄、护翼准星、两道箍与通条。全长按史实 1.276 m。 |
| 驳壳枪 `Mauser96` | `Source/Model_MauserC96.glb` | [Plewr](https://plewr.itch.io/mauser-c96-low-poly) | CC0 | 毛瑟 C96。丢掉名为 Boom 的枪口焰网格。 |

许可证副本随源放在 `Source/Model_*/License_*.txt`（Sketchfab 生成的 CC-BY-4.0 署名原文，
文件头都有完整 credit 文本，发布时按 CC-BY 要求保留）。

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
- 手榴弹、大刀、八九式重掷弹筒：程序化模型已按史料特征建好，无免费源可替换。

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

下载命令（原图即运行时文件，未做任何修改）：

```powershell
Invoke-WebRequest -Uri 'https://opengameart.org/sites/default/files/boom3.png' `
  -OutFile 'Taierzhuang1938/Texture/Texture_ExplosionFire_01.png'
```

## 场景布设物（Script_ExternalProps.mjs 运行时加载）

以下 GLB 由 Sketchfab 经本机 BlenderMCP 下载（账号 BentleyJobs），在 Blender 里
统一贴图降采样到 1024、烘焙变换并把包围盒底部对齐原点后直接导出为运行时文件。
它们是纯视觉布设（不参与碰撞/导航），运行时由 `Script_ExternalProps.mjs` 按关卡摆放。

| 游戏内资产 | 源文件 | 作者 | 许可 | 处理方式 |
|---|---|---|---|---|
| 民居排屋 `Model_AsianHouseRow.glb` | [Asian House Pack - Low Poly](https://sketchfab.com/3d-models/asian-house-pack-low-poly-70f36c58345440fe8e7b6168854881e7) | [PolyDavid](https://sketchfab.com/PolyDavid) | CC-BY-4.0 | 四栋一排的低模民居。贴图 2048→1024，底部对齐原点。 |
| 民居双栋 `Model_AsianHousePair.glb` | [Asian House - Two Pack](https://sketchfab.com/3d-models/asian-house-two-pack-2aa7bfde643145a3a6aa3a85b06afcd2) | [PolyDavid](https://sketchfab.com/PolyDavid) | CC-BY-4.0 | 两栋组合。贴图 2048→1024，底部对齐原点。 |
| 沙袋 `Model_Sandbag.glb` | [Sandbag Low Poly Realist](https://sketchfab.com/3d-models/sandbag-low-poly-realist-7d52600a15c747749d845d9f906045cf) | [Islide](https://sketchfab.com/Islide) | CC-BY-4.0 | 单体沙袋，缩放到 0.6 m 长；贴图 2048→1024，底部对齐原点。 |

CC-BY-4.0 要求署名：以上作者与链接即发布署名，随本文件保留。
