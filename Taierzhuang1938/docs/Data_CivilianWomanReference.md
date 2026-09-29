# 中年女子 08 参考图模型

按 `OneDrive/Sync/饮河/FPS/角色/百姓/08_中年_女子` 的正、侧、背面图制作。
制作方法沿用罗班长参考模型的共同骨架、逆蒙皮归位、面部控制和 PBR 烘焙流程，
并避免把背带、布包及背景投影到衣服上。

本资产独立交付，不改变游戏现有百姓外观或角色选择表。

## 文件与源工程

- 仓库模型：`Model/Character/Model_TengxianCivilianWomanReference.glb`。
- 用户目录副本：`08_中年_女子/Model_CivilianWomanReference.glb`，原始四张 PNG 保留原样。
- 资产统计与哈希：`Model/Character/Data_CivilianWomanReference.json`。
- Blender 源工程目录：
  `C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\CivilianWomanReference_20260929`。
- `Model_CivilianWomanReference.blend` 保留分件模型、源材质、权重及面部验收动作；
  `Model_CivilianWomanReferenceBaked.blend` 保存导出前合并的蒙皮网格。
- `References/` 保存本角色专用的内置 imagegen 布料图集与 `Data_ImagegenPrompts.json` 原始提示词记录，
  `Textures/` 为烘焙贴图，`Review/` 为本地截图及报告，均不提交。

## 模型与绑定

深靛蓝斜襟上衣、短软领、盘扣、肘部及下摆补丁、灰褐布裤、膝补丁、黑布鞋、
包头巾及后结、布包及肩带均为真实几何。肩袖与上衣合并为连续表面；
补丁和背带贴合实际布料表面后，再转换回共同 T 绑定。

直接继承 `Model_TengxianNra05Facial.glb` 的 53 根身体骨骼及 13 根面部骨骼，
保持身体绑定位置、层级、旋转与单位不变。女子轮廓在几何侧调整；
资产身高沿用共同参考骨架，使用方可整体等比缩放，不单独拉伸肢体骨骼。

面部沿用下颌、嘴唇、嘴角、眉、眼睑和眼球控制，保留口腔、牙齿和舌头。
参考照片只用于脸部，颈后遮挡区采用连续皮肤材质；服装及配饰使用独立布料材质。
GLB 自带 Skin / Uniform / Equipment 三组 2048 图集，均含底色、法线和粗糙度。
导出时精简上衣和裤子的冗余细分，源工程保留细分表面，面部口型拓扑保留。
减面记录含抽样表面偏差检查。每顶点导出最多四个骨骼影响，归一化权重，无 morph target。

Blender 为米制、Z 向上、正面 -Y；glTF 为米制、Y 向上、正面 +Z。
身体动作直接按共同骨骼名复用。GLB 只内嵌一条面部验收动作，未新增游戏动作库。
头巾、布包随既有骨骼运动，没有新增独立布料模拟骨架。

## 重建及验收

在独占 worktree 中执行；不要在其他任务已打开的工程中执行构建。

```powershell
node scripts/Script_BlenderMcp.mjs start --task CivilianWomanReference
$womanRepo = (Get-Location).Path.Replace('\', '/')
foreach ($womanStep in 'Build', 'Validate', 'Export') {
    $womanScript = "$womanRepo/Taierzhuang1938/_blender/Script_${womanStep}CivilianWomanReference.py"
    node scripts/Script_BlenderMcp.mjs exec --code "p=r'$womanScript'; exec(compile(open(p,encoding='utf8').read(),p,'exec'),{'__file__':p})" --timeout 1200
}
python Taierzhuang1938/_blender/Script_AuditCivilianWomanReference.py
node scripts/Script_BlenderMcp.mjs stop
node scripts/Script_BlenderMcp.mjs status --scan
```

`WOMAN_CONFIG` 可覆盖 `repo`、`references`、`output`，`render` 可指定出图列表。
构建依赖源工程目录中的 `References/Texture_CivilianWomanTextileAtlas.png`。
`Script_CivilianWomanTools.py` 保存本角色实际使用的罗班长流程工具快照，
不读取其他会话仍在修改的工作文件。

`Validate` 检查身体绑定误差、全部顶点权重、13 根面骨的有效影响和真实顶点形变，
保存 Rest / Open / Blink / Shout / Grit 近景；`Audit` 独立读取导出的 GLB，
比较身体骨骼与源模型的绑定、层级及旋转，并验证权重、内嵌贴图和无 morph。
本地 Three.js 页面重新加载最终 GLB，验证旋转视图、表情、隐藏布包及既有 `RifleRun` 动作的五个相位。
`RifleRun` 仅用于共同骨架兼容性验收，不是为本角色新制的百姓跑步动作。
最终模型为 201,070 个三角形、3 个蒙皮网格和 3 个材质，内嵌 9 张贴图，约 23.7 MB。
浏览器验收完成后，`Script_PackageCivilianWomanReference.py` 生成清单并复制模型回用户目录。

验收页和截图只保存在 `tmp/CivilianWomanReference` 与上述私人源工程目录。
独立模型验证不代表整关性能或剧情接触验收；本资产尚未制作游戏 LOD。
