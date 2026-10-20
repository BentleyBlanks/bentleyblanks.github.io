# 五补丁薄土布单被

2026-10-19，Blender 5.1.2。按用户确认的五补丁三视图制作；随后按“看起来不柔软”的反馈改细棉布织纹、减轻浮雕、重做圆缓软褶和垂覆。单层薄布，无填充、厚度、绗缝、约束、IK、驱动器或布料模拟。

2026-10-20：按对标反馈，把偏冷绿的基色校正到已确认参考图的灰褐色显示配色。图集平均sRGB约从(0.633, 0.611, 0.568)调整到(0.655, 0.601, 0.548)，目标对比度0.0804；这是参考图的显示色统计，不是实物测色。原imagegen源图、五补丁布局、alpha、网格、骨骼、权重、挂点、形态键及五条动作保留；实际GLB逐访问器复核几何、蒙皮和动作数据一致，重烘PBR并更新内嵌贴图。出图显式固定曝光0、gamma 1，无光照对标使用Standard/None。

## 交付与重建

- 游戏资产：[Model_SingleBlanket.glb](../Model/Model_SingleBlanket.glb)，968,748字节；[机器契约](../Model/Data_SingleBlanket.json)。
- [独立泥血遮罩](../Texture/Texture_SingleBlanketMask.webp)，1024×1024，无损WebP，未接进材质。
- [Blender重建脚本](../_blender/Script_SingleBlanketBake.py)、[贴图烘焙](../_import/Script_SingleBlanketTextureBake.py)、[独立GLB/CPU校验](../_blender/Script_SingleBlanketVerify.mjs)、[浏览器GLTFLoader校验](../_blender/Script_SingleBlanketBrowserVerify.mjs)、[出图脚本](../_blender/Script_SingleBlanketShots.py)。
- 源工程：`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/SingleBlanket/Scene_SingleBlanket.blend`。参考、截图、对标图在同目录的`Reference/`与`Review/`，均不入仓库。
- AI图集已按固定流程落为[规范化源图](../_import/Source/SingleBlanket/Texture_SingleBlanketSource.png)；[提示词](../_import/Prompts/Texture_SingleBlanket.txt)、[PBR烘焙记录](../_import/TextureBakes/Texture_SingleBlanket.json)和[正式校验记录](../_import/Data_SingleBlanketGlbAudit.json)随仓库保存。

从仓库根执行：

```powershell
# 普通Python，numpy + Pillow；从已提交源图重烘全部PBR与独立遮罩
python Taierzhuang1938/_import/Script_SingleBlanketTextureBake.py

# 带窗口制作走MCP；一轮结束后stop
node scripts/Script_BlenderMcp.mjs start --blender "<Blender 5.1.2/blender.exe>" --task SingleBlanket
node scripts/Script_BlenderMcp.mjs exec --code "import runpy; runpy.run_path('Taierzhuang1938/_blender/Script_SingleBlanketBake.py', run_name='__main__')"
node scripts/Script_BlenderMcp.mjs stop

# 无界面复建仍由同一入口管理进程；从空场景建网格/骨架/动作、载入贴图、导出与导回校验
node scripts/Script_BlenderMcp.mjs start --batch Taierzhuang1938/_blender/Script_SingleBlanketBake.py --blender "<Blender 5.1.2/blender.exe>" --task SingleBlanketRebuild --json

node Taierzhuang1938/_blender/Script_SingleBlanketVerify.mjs
node Taierzhuang1938/_blender/Script_SingleBlanketBrowserVerify.mjs
```

MCP文本执行时需把`__file__`设为重建脚本路径，或提供`SingleBlanketProject`指向项目目录。无界面默认保存源工程；要输出到临时目录，可用`--batch-args <json文件>`传`["--output-dir","<绝对目录>","--no-save-blend"]`。普通命令行Blender也可使用脚本的`--output-dir`和`--no-save-blend`参数。

Khronos检查使用官方`gltf-validator@2.0.0-dev.3.10`；可安装到忽略目录后给校验脚本传`--validator=<模块目录> --write`。默认探测`tmp/SingleBlanket/Validator/node_modules/gltf-validator`。缺少该模块时仍运行独立CPU检查，并明确报告未重跑正式校验。

## 网格、坐标与UV

- 336顶点、300四边形、600三角形；15×20规则网格，固定随机种子19380317。四边只在平面内内缩0–1.5厘米，采用成对偏移保持几何中心在原点。
- 标称宽1.4米、长1.9米；边缘内缩属于该标称轮廓内的自然不规则。Rest Pose的顶点与变形骨头部均在Z=0，面朝+Z；网格和骨架对象均为零位置、零旋转、单位缩放，仅一个Armature修改器。
- Blender头端−Y；glTF按(x,y,z)→(x,z,−y)转换，头端+Z，+Y向上。L=+X，R=−X。
- Blender UV：U从+X指向−X，V朝−Y头端；一张连续、不重叠的0–1作者图集。矩形布面编码进方形图集，在1.4:1.9物理布面上恢复织纹比例。

## 骨骼命名与Rest坐标

单位米；所有Roll=0。根骨不变形、无权重。其余24根全部直接父于Blanket_Root，不连接；没有网格骨之间的父子链。横向4列覆盖1.4米，间隔约46.67厘米；纵向6行覆盖1.9米，间隔38厘米。骨格是运行时的独立控制点，最终布面曲率取决于这些控制点的姿势和网格密度；当前没有布料求解器自动生成褶皱。

| 名称 | Head (X,Y,Z) | Tail (X,Y,Z) | Deform |
| --- | --- | --- | --- |
| Blanket_Root | (0.0000, 0.0000, 0.0000) | (0.0000, 0.0000, 0.1000) | 否 |
| Blanket_CornerHeadL | (0.7000, -0.9500, 0.0000) | (0.7000, -0.9500, 0.0500) | 是 |
| Blanket_Grid_r0_c1 | (0.2333, -0.9500, 0.0000) | (0.2333, -0.9500, 0.0500) | 是 |
| Blanket_Grid_r0_c2 | (-0.2333, -0.9500, 0.0000) | (-0.2333, -0.9500, 0.0500) | 是 |
| Blanket_CornerHeadR | (-0.7000, -0.9500, 0.0000) | (-0.7000, -0.9500, 0.0500) | 是 |
| Blanket_Grid_r1_c0 | (0.7000, -0.5700, 0.0000) | (0.7000, -0.5700, 0.0500) | 是 |
| Blanket_Grid_r1_c1 | (0.2333, -0.5700, 0.0000) | (0.2333, -0.5700, 0.0500) | 是 |
| Blanket_Grid_r1_c2 | (-0.2333, -0.5700, 0.0000) | (-0.2333, -0.5700, 0.0500) | 是 |
| Blanket_Grid_r1_c3 | (-0.7000, -0.5700, 0.0000) | (-0.7000, -0.5700, 0.0500) | 是 |
| Blanket_Grid_r2_c0 | (0.7000, -0.1900, 0.0000) | (0.7000, -0.1900, 0.0500) | 是 |
| Blanket_Grid_r2_c1 | (0.2333, -0.1900, 0.0000) | (0.2333, -0.1900, 0.0500) | 是 |
| Blanket_Grid_r2_c2 | (-0.2333, -0.1900, 0.0000) | (-0.2333, -0.1900, 0.0500) | 是 |
| Blanket_Grid_r2_c3 | (-0.7000, -0.1900, 0.0000) | (-0.7000, -0.1900, 0.0500) | 是 |
| Blanket_Grid_r3_c0 | (0.7000, 0.1900, 0.0000) | (0.7000, 0.1900, 0.0500) | 是 |
| Blanket_Grid_r3_c1 | (0.2333, 0.1900, 0.0000) | (0.2333, 0.1900, 0.0500) | 是 |
| Blanket_Grid_r3_c2 | (-0.2333, 0.1900, 0.0000) | (-0.2333, 0.1900, 0.0500) | 是 |
| Blanket_Grid_r3_c3 | (-0.7000, 0.1900, 0.0000) | (-0.7000, 0.1900, 0.0500) | 是 |
| Blanket_Grid_r4_c0 | (0.7000, 0.5700, 0.0000) | (0.7000, 0.5700, 0.0500) | 是 |
| Blanket_Grid_r4_c1 | (0.2333, 0.5700, 0.0000) | (0.2333, 0.5700, 0.0500) | 是 |
| Blanket_Grid_r4_c2 | (-0.2333, 0.5700, 0.0000) | (-0.2333, 0.5700, 0.0500) | 是 |
| Blanket_Grid_r4_c3 | (-0.7000, 0.5700, 0.0000) | (-0.7000, 0.5700, 0.0500) | 是 |
| Blanket_CornerTailL | (0.7000, 0.9500, 0.0000) | (0.7000, 0.9500, 0.0500) | 是 |
| Blanket_Grid_r5_c1 | (0.2333, 0.9500, 0.0000) | (0.2333, 0.9500, 0.0500) | 是 |
| Blanket_Grid_r5_c2 | (-0.2333, 0.9500, 0.0000) | (-0.2333, 0.9500, 0.0500) | 是 |
| Blanket_CornerTailR | (-0.7000, 0.9500, 0.0000) | (-0.7000, 0.9500, 0.0500) | 是 |

## 绑定与挂点

每点用相邻骨格的双线性张量权重，先夹到骨格范围，最多4个非零影响，权重和1；不使用自动权重。按用户明确确认的修订，边线/角点允许零项；GLB仍为4个影响存储槽。实测非零影响数：2根32点、3根32点、4根272点；Root权重为0。导出后恢复被Blender默认0.0001阈值过滤的微小权重，保留精确核。

| 挂点 | 父骨 | Blender静止坐标 |
| --- | --- | --- |
| Socket_GripHeadL | Blanket_CornerHeadL | (+0.70, −0.95, 0) |
| Socket_GripHeadR | Blanket_CornerHeadR | (−0.70, −0.95, 0) |
| Socket_BodyHead | Blanket_Root | (0, −0.70, 0) |
| Socket_BodyPelvis | Blanket_Root | (0, +0.05, 0) |

空物体在静止时局部Z与世界+Z一致。Blender骨父级默认以骨尾为锚，脚本用完整逆父矩阵补偿，使握点实际位于角骨头部；对象Basis位置采用上表坐标。导出的节点保存相应局部变换；运行时应整体保留，避免手动清空挂点旋转。

## 动作、形态键与导出

| 动作 | 作者帧数 | glTF时长 | 形态键 |
| --- | --- | --- | --- |
| Blanket_Flat | 1 | 0秒静态参考 | 0 |
| Blanket_DragPose | 1 | 0秒静态参考 | 0 |
| Blanket_Released | 1 | 0秒静态参考 | 0 |
| Blanket_Crumpled | 1 | 0秒静态参考 | 1 |
| Blanket_Unfold | 45 | 44/30≈1.4667秒 | 1→0 |

保留用户指定第1–45帧、30fps；原需求括号中的1.5秒为近似，端点跨度按实测报告。NLA单帧动作在导出后去掉重复的常量样本；五条最终动画均由同名骨架/形态键NLA轨合并。只给网格骨打位置和小幅旋转关键帧，根骨无动作；唯一形态键名Crumpled，导出含法线。

DragPose头角骨到Z=0.70，X各内收0.15，Y向头外0.20；r1肩部0.15，r1–r3侧边另抬0.08，尾部贴地。用小幅旋转和中部渐落使转折柔和。Crumpled实际包围盒约45×45×25厘米，骨格先收拢，形态键补出连续、叠压的软褶。Unfold先抬头角再落下，第1帧等于Crumpled，第45帧等于Flat。

仅留源工程的两个测试动作：Test_LiftHeadCorners（头角0.8米）、Test_DrapeOverBody。替身Ref_BodyProxy尺寸0.45×1.65×0.22米，头端Y=−0.80；替身与Review灯光、相机不导出。

GLB仅含Blanket_Rig、Blanket_Mesh、25骨和四个挂点；保留非Deform根关节、逆绑定矩阵、蒙皮与形态法线，按NLA采样30fps，无Draco。材质Mat_SingleBlanket双面，MASK，cutoff=0.5；Blender 5.1通过二值Alpha节点实现Clip语义。

## 材质、遮罩与实测

Base RGBA、Normal、ORM均1024×1024，全部内嵌GLB。平纹洗旧棉布、五块粗陋手缝补丁；后续柔软度修订把织纹法线幅度降到0.12毫米。数据图无损，ORM的B精确为0，G实测227–231/255（约0.890–0.906），处于0.85–0.95范围。遮罩R为边缘/尾端泥渍，G为从胯部向头端的血迹；血迹图像Y质心0.4327，小于胯部0.5263，B为0。显著泥血不烘入基色。

| 项目 | 本次实测 |
| --- | --- |
| a 源工程Rest蒙皮最大偏差 | 0米（门槛0.0001米） |
| b 左头角抬0.6米，支持域外最大偏差 | 0米；影响24点 |
| b 与双线性预期最大误差 | 8.940697e-8米 |
| c 权重和最大误差 | 4.097819e-8 |
| d GLB导回空场景最大偏差 | 7.450581e-9米（门槛0.001米） |
| 独立CPU逆绑定检查 | 约4.30×10⁻⁸米，支持域外0，展开两端与对应静态姿态一致 |
| Khronos validator | 0错误，1警告；警告是按要求把SkinnedMesh父于Rig的常见提示，父对象为恒等变换；其余空挂点/未用访问器为信息项 |
| 两次独立无界面复建 | SHA-256完全相同，且与交付GLB一致 |
| 浏览器GLTFLoader | 五动作正常读入、25骨、600三角；展开首尾偏差≤2.1×10⁻⁸米，无页面错误 |

GLB SHA-256：`0eb4e5c5a6b8dda216bf3f6f958282dbf2d1459c1e8675429d19522d59a0c89e`。

## 本地视觉验收

Review目录保存：Flat、DragPose侧视、Crumpled、Test_LiftHeadCorners、Test_DrapeOverBody、Blanket_Grid_r2_c1权重热图、四通道贴图布局、参考图与无光照模型俯视对标、浏览器实际渲染与机器报告。供模型观察的预览均另存为长边≤640像素；用户交付PNG保留原分辨率。临时交互页面生成在仓库忽略的tmp/SingleBlanket/Review，不发布到GitHub Pages。

## 历史边界

[2014年建川博物馆采访](https://www.chinanews.com/cul/2014/09-03/6558063.shtml)明确列出出川行装中的“单被一条、草席一张”，未规定这件单被的尺寸、色泽、补丁或拖人用法。本资产的外观和动作是用户确认后的复原设计，不能宣称1938年川军统一制式或原物精确复制。此边界已同步Notion两页和资料馆的创作条目；本轮只补单被资产，不重新认定其他剧本条目的出处。
