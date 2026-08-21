# 血战台儿庄 · 外部模型来源与许可

游戏运行时加载 `Model/*.tzm.json`，并为人物换模额外加载 `Model_FpsArms.glb`、
`Model_IjaSoldier.glb`、`Model_NraSoldier.glb` 与两份 `Model_Civilian*.glb`。
`_import/Source/` 下的是可追溯、可重建的原始素材，页面不会直接加载。

武器 TZM 保留几何、UV 与 steel/wood 材质分区。源包自带的 2K/4K 贴图不直接进入 Pages；
全部枪械共享 `Texture/Texture_WeaponSteelV2*` 与 `Texture/Texture_WeaponWoodV2*` 的 512px
BaseColor / Normal / ORM，避免一个班每把枪都重复下载大图。两套基础材质由 OpenAI 内置
imagegen 生成去光照、无物体轮廓的可平铺 Albedo；`BuildWeaponPbr.py` 再从同一像素源派生
法线与 glTF 通道顺序的 ORM（R=AO、G=roughness、B=metalness），以保证四个 PBR 通道对齐。
历史特征按仓库记录的公开、可再分发来源和以下枪型实物照片进行复核：中正式/汉阳造分别保留
毛瑟标准型短管与 Gewehr 88 套筒；ZB-26 保留上插直弹匣、散热环、提把与两脚架；三八式保留
防尘滑盖、直拉机柄、护翼准星与安全帽；C96 保留前置固定弹仓、节套、长抽壳钩与扫帚柄握把。
（R=AO、G=roughness、B=metalness）。人物 GLB 则保留各自贴图、蒙皮、骨架与动画。

| 游戏内武器 | 源文件 | 作者 | 许可 | 史实对应 |
|---|---|---|---|---|
| 中正式 `ZhongZheng` | `Source/Model_Kar98k.obj` | [byzmod3d](https://opengameart.org/content/low-poly-weapon-pack) | CC0 | 中正式是毛瑟标准型短管，剪影与 Kar98k 同族。全长按史实 1.110 m 缩放。 |
| 汉阳造 `HanYang` | 同一把 Kar98k + 程序化套筒 | 同上 | CC0 | 汉阳造八八式母型是 Gewehr 88。Sketchfab 上有 CC-BY 的 Low-Poly Gewehr 88，但下载要登录。这里用 Kar98k 拉到 1.250 m，再套上 φ32 薄套筒，保住「老套筒」剪影。 |
| 驳壳枪 `Mauser96` | `Source/Model_MauserC96.glb` | [Plewr](https://plewr.itch.io/mauser-c96-low-poly) | CC0 | 毛瑟 C96。丢掉名为 Boom 的枪口焰网格。 |

仍走 `_blender/BuildWeapons.py` 的史实程序化几何：

- 三八式 `Type38`：Sketchfab 有 CC-BY 的 Type 38 Arisaka（Snijboer），但本轮无登录/API Key，
  未绕过下载限制。现模提高到 16 边圆件并保留防尘滑盖、直拉机柄与护翼准星。
- 捷克式 `Zb26`：Sketchfab 有 CC-BY 的 ZB26（Larkien），同样未绕过登录限制。现模保留
  上插直弹匣、提把、散热环与两脚架，且第一人称已改为模型路径。
- 手榴弹、大刀、八九式掷弹筒：继续用已按史料尺寸建好的程序化模型。

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
