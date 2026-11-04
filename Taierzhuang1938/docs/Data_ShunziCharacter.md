# 顺子 V5：帽子修整、绑定与动作预览

2026-11-04，续做顺子的 Tripo 分件合并。用户最后要求是帽子直接扣在原头上，不压头皮、不缩头、不拉头、不涂黑头皮。V4 与原始分件均保留，修订另存 V5。

## 产物与消费范围

源资产在 `C:\Users\Bentl\OneDrive\Sync\饮河\FPS\角色\Tripo\01_顺子`：

| 文件 | 用途 |
| --- | --- |
| `Shunzi_Merged_V4.glb/.fbx` | 保留的上一版，不覆盖 |
| `Shunzi_Merged_V5.glb/.fbx` | 未绑骨源，单网格、单材质，53,260 三角面，帽顶 1.831290 m |
| `Shunzi_Merged_V5_Bones.glb` | 本地绑定产物，保留顺子的全部外观，65 根 X Bot 身体/手指骨 |
| 仓库 `Model/Character/Model_Shunzi.glb` | 游戏工具使用的 WebP 贴图版，约 9.54 MB |
| 仓库 `Model/Character/Data_Shunzi.json` | 来源哈希、骨架、比例、头部与外形保全证据 |

角色登记在 `Data_XBotCharacters.mjs`，键为 `shunzi`；动作预览打开 `Tool_MixamoAnimationPreview.html?who=shunzi`。`XBOT_CAST_CHARACTERS.shunzi` 让白盒编辑器的顺子单位使用自己的模型，普通国军选择表不变。

实际消费方是 **Mixamo 动作预览、白盒编辑器的摆位/预演/试玩外观层**。正片第一关的第一人称手、身体、命中体、面部系统和共用 53 骨士兵模型不在这次替换范围内；参见 [白盒人物层](Data_EditorBlockout.md#18-人物换成-mixamo-x-bot2026-11-01)。

## 帽子与原头保全

- 只把帽箍中段横向放宽，最大约 8%，沿高度平滑过渡，帽顶高度不变。帽口增加 192 个三角面的布边，接到原头表面外约 1.2 mm 处；它属于帽子，随头骨整体运动。
- V5 原有非帽子顶点、法线、UV 和内嵌贴图与 V4 相同；没有对头部压缩、雕刻或补黑色。
- 重建时把 `Head_A` 与原始 `Head_W` 对照，下巴以上只允许统一缩放和平移，最大误差须小于 1 微米。V4 已有的领口连接保留。
- 绑定不移动顺子的源顶点。最终运行时模型与未绑骨 V5 的静止外形逐点核对，允许误差为 3 微米；当前最大误差约 0.35 微米。绑定产物的三张内嵌贴图字节与 V5 一致；运行时转换按既有规则压成同分辨率 WebP。

## 绑定方法

没有等待外部 Tripo 绑骨：`Script_ShunziCharacterRig.py` 读取项目已经采用的 `Model_SquadLeaderLuo.glb`，只取骨架与权重，把参考关节拟合到顺子的原 T 姿，按最近三角面重心坐标转移权重。导出不包含参考人物的任何网格或材质。

头部从下巴以下的颈段平滑过渡到 Head；原脸、头顶和整顶帽子刚性绑定 Head。左右袖口和手腕重叠段使用同一条权重过渡曲线，避免分件各自拉开。每个顶点最多四根骨影响，权重归一。

手臂与掌心轴线按两个人物的真实网格截面拟合；袖口接触带共用固定的 ForeArm/Hand 混合，再向两侧平滑过渡。302 对袖口/手腕近邻点在六动作各 61 次采样里，最大间距增量约 0.16 mm。

最终仍经项目既有 `Script_BuildXBotRigCharacter.mjs` 转换为 X Bot 的骨名、顺序、父子层级与初始朝向。`Script_ShunziBuild.mjs` 包装这一步并补充保全证据。胯高比为 0.9398，动作消费方共用 `ClipForCharacter`：仅 Hips 保留位移轨并按胯高比例换算。

## 重建

从本任务 worktree 根执行。Blender 工程、图集、分件标签和详细测量在 `C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\ShunziRevision_20261104`；原 Claude 工程在同级 `ShunziPartsMerge_20261103`，只读作为输入。

```powershell
node scripts/Script_BlenderMcp.mjs start "C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/ShunziPartsMerge_20261103/Shunzi_PartsMerge_V1.blend" --task ShunziV5
node scripts/Script_BlenderMcp.mjs exec --file Taierzhuang1938/_import/Script_ShunziCapBake.py --timeout 240
node scripts/Script_BlenderMcp.mjs exec --file Taierzhuang1938/_import/Script_ShunziCharacterRig.py --timeout 300
node scripts/Script_BlenderMcp.mjs stop
node scripts/Script_BlenderMcp.mjs status --scan
node Taierzhuang1938/_import/Script_ShunziBuild.mjs
```

帽子重建脚本必须在原始工程加载完成后执行；它自己存到新的 `Scene_ShunziRevision_V5.blend`，绑定存到 `Scene_ShunziRig_V5.blend`，不覆盖原工程。Blender 中的回导场景和源场景分开；GLB 导出限定当前绑定场景，并断言一网格、一材质、一套蒙皮。

## 验收入口

```powershell
node Taierzhuang1938/Script_TestRunner.mjs --domain-only=shunziCharacter
```

`XBotCharactersTest` 核对骨架、绑定矩阵、比例与权重。`ShunziCharacterBrowserTest` 通过真正的动作预览页选中顺子，检查待机、持枪、行走、跑步、蹲行和匍匐，每条采样 61 帧，核对头部与帽子刚性、蒙皮有限且未脱离骨架，再验证播放按钮会推进时间。截图为 1280×720，浏览器显式静音，证据只写 `tmp/Shunzi`。

已实机检查六个动作及左右转头特写。验收通过的是模型加载、骨架、蒙皮、接缝与播放；通用动作仍有地面穿插：此次采样的全身最低点为 -0.083 m，来自匍匐时的前衣摆，走/蹲动作脚底也有数厘米偏差。该外观层可作角色与动作预览，完整贴地和衣摆碰撞属于后续动作接触修整。

转换器同时修复了 Uint16 索引转 Uint32 时只改声明、未转换数组存储的问题；新增字节跨度断言可在进入浏览器前检出这类无效 GLB。

2026-11-04 本机验证：8 项定向静态检查、顺子实际动作预览、运动矢量、几何与部署版浏览器检查通过。完整 prepush 通过 18 项后停在既有字体缺 9 字；未改动主检出同样复现。七关 BootTest 的「日军远景辨识材质 count=0」失败也在未改动主检出重新跑过七关并复现；本次不记为全库全绿。

帽子的正面、侧面、背面、仰视及手腕特写可用 `_import/Script_ShunziCharacterReview.py` 回导 GLB 渲染；模型验收截图和页面不提交仓库。
