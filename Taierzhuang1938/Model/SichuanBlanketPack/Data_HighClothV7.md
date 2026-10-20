# Sichuan Blanket Pack — V7 High Cloth

面数说明：本页描述高模阶段，不代表最终取消游戏面数要求。当前可核实的最终要求仍为 ≤3000，见[需求核对](Data_RequirementsAudit.md)。

用户否决 V6 过于方正，要求暂停面数限制，先解决与已确认 V02 参考的形体差异。后续反馈为“轮廓更接近，继续自然布褶”。本轮保留该轮廓，完成高模布褶、侧端连接、布带曲率和衣角贴合；游戏版减面、UV 和最终 1024 PBR 转移属于后续阶段。

## 源工程

`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/SichuanBlanketPack/HighV7/Scene_SichuanHighClothV7.blend`

源工程使用米制，Blender 原生 X 向右、Z 向上、-Y 朝包面；贴背平面为 Y=0，轴心在该平面的实际中心。后续 glTF 导出转换为 Y-up。工程包含打包的材质图像、冻结的布料模拟网格和重建脚本文本，不依赖重新计算模拟即可打开并继续编辑。

`Pack_Root` 下保留 `Pack_Bundle`、`Pack_Binding`、`Pack_Jacket`、`Pack_StrawMat`、`Pack_Sandals` 五个独立部件组。草席可独立隐藏；短褂保留折叠的完整衣片、袖片、门襟及布纽扣，可连同衣角作为原件移动。

## 高模构形

- V7 用柔软的轮廓、局部绑带挤压、圆软边角及折回布边取代硬盒形体。
- 前布面在实际绑带约束下松弛，冻结第 51 帧；过滤重复短褶，保留宽松起伏及疏密不一的斜向收褶。
- 侧面连接从各处实际前缘逐层向背面推进，避免衣角凹陷处发生反折并露出尖片。埋在折层下的填充面与外露折边分离，外露折边保持原轮廓。
- 布带结、尾端及肩带使用高模曲率；连续布带的两横、两竖和两条肩带路线保留。
- 衣角局部网格细化后贴合外层被面；布扣和折回布边保留实体厚度，移除旧的长连接三角面。

当前高模不执行游戏减面。布料碰撞代理的简化只用于模拟，位于导出根之外并隐藏，不是可见高模。

## 重建

在本任务独占 worktree 中执行，使用本任务源工程，不能指向其他任务场景：

```powershell
node scripts/Script_BlenderMcp.mjs start C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/SichuanBlanketPack/HighV7/Scene_SichuanHighClothV7.blend --task SichuanBlanketPack
node scripts/Script_BlenderMcp.mjs exec --file Taierzhuang1938/_blender/Script_SichuanHighClothBuildV7.py --timeout 300
node scripts/Script_BlenderMcp.mjs stop
node scripts/Script_BlenderMcp.mjs status --scan
```

入口按顺序构建高模主体、布料模拟、冻结布面、布褶与衣角细化、侧层和布带修整，最后保存上述源工程。`Script_SichuanHighClothFreezeV7.py` 每次完整重建只能执行一次，以免重复下移旧表皮；完整入口会重建场景。冻结粗网格 `StudyV7_RelaxedCoarseSource` 存在源工程中，局部细化可以直接复用它。

## 核验与范围

本轮按真实 Blender 渲染核对斜前和侧面，检查软包轮廓、受压折层及衣角贴合；此前 V7 正面灰模用于轮廓核对。重建和重新打开源工程检查平背、轴心、图像打包和部件组。图像及对照只保存在本地 `tmp/SichuanBlanketPack/Review/`，不提交验收网页或截图。

V6 游戏 GLB 仍是被用户否决的历史产物，没有用本轮高模覆盖，也未发布。本轮高模交付不代表游戏减面和 1024 PBR 烘焙已经完成；用户未作最终视觉确认。
