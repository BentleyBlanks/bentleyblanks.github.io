# Type94 full game rebuild V72

从显式 V68/V56/V59 输入检查点在独立输出目录完整执行几何、平面锁定、新 UV、十二图投射、实际表面补投、保存导出、源重开和机构检查。保留的 V70 候选及正式游戏 V12 均未替换。

实际 GLB 比对证明：237 网格的有向三角形及逐角点位置/法线/UV/切线完全一致，292 节点刚体层级和控制属性一致，十二张图的解码像素与材质绑定语义完全一致。容器元数据、内部网格 ID 名称可以不同，不以完整文件哈希相等替代渲染数据比对。原生重开、剖面、运动、行走机构及 937 项浏览器检查通过。

几何生成后显式执行 `Planes` 保存阶段，再进入 UV/投射。这与保留候选的实际工序一致；把平面修改并入前一阶段会改变 Blender 自定义法线的编码轮次，首轮冷重建对此保留了失败记录，未降低完全一致门槛。

默认重建仍输出 `GameTrialV70`；隔离重放可在当前命令环境设置 `TYPE94_GAME_ROOT` 为 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type94Tankette/GameReplayV72Canonical` 后运行 `node Taierzhuang1938/_blender/Script_BuildType94GameV70.mjs`。独立比较入口 `python Taierzhuang1938/_import/Script_VerifyType94GameRebuildV72.py`。本次重用了已单独核验的 Delta 输入签名提取；其余完整工序从 Geometry 开始执行。输入检查点仍是重建依赖，不声称无依赖重建。

本地重建预览：http://127.0.0.1:8114/tmp/Type94GameReplayV72/ 。原始材质预览：http://127.0.0.1:8114/tmp/Type94GameReviewV70/ 。文件、源、对比、失败轮和清理输出均留本地，精确身份与路径见 [Data_GameRebuildV72.json](Data_GameRebuildV72.json)。完整参考形态、最终材质依据与整项 Goal 仍未验收。
