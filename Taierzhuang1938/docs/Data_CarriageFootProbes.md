# 车厢脚底支撑计算优化（2026-09-14）

> **历史实现说明。** `Script_FirstLevelCarriageAnimation` 已随 2026-09-19 军列开场下线；本页仅保留旧算法与性能记录，不是当前运行时契约。

`Script_FirstLevelCarriageAnimation.FootFloor` 原来每帧对每名乘客的鞋部顶点调用 Three 的完整 CPU 蒙皮，再取世界坐标最低高度。脚/趾骨权重大于 0.65 的筛选留下了 LugouNra02 的 663 个点和 LugouNra05 的 646 个点。同一根骨骼的 `matrixWorld × boneInverse` 因而被每个受它影响的顶点重复计算。

当前实现缓存共享几何的绑定空间位置和原始四槽蒙皮权重，对位置与有序权重完全相同的 UV/法线接缝顶点去重。每次脚底求解只计算一次各相关骨骼的矩阵，随后按 Three 原有运算顺序求加权位置和最低点。它保留原始支撑面与浮点运算结果，移动甲板、动作混合及释放姿态的校正流程不变。

存在活跃 morph、绑定矩阵变化或顶点/蒙皮属性修改时，使用原始逐顶点路径，避免读取失效的静态缓存。原模型、动作轨道、角色世界坐标、动画更新频率及渲染通道不变。

| 模型 | 原鞋面顶点 | 去重后的点 | 原骨骼矩阵乘法/次求解 | 当前矩阵乘法/次求解 |
| --- | ---: | ---: | ---: | ---: |
| LugouNra02 | 663 | 503 | 853 | 6 |
| LugouNra05 | 646 | 491 | 680 | 4 |

## 精度和性能验证

`node Taierzhuang1938/Script_FirstLevelCarriageAnimationTest.mjs`：

- 两套原始人物、全部 13 个动作；每个动作覆盖 25 个时刻和完整、半权重、释放权重。
- 每对不同动作的有向切换覆盖五个混合时刻，共 1335 个姿势；另检查几何修改和 morph 回退。
- 独立调用 Three 原始逐顶点蒙皮作为真值，要求矩阵乘法至少减少 90%、高度误差不超过 1e-12 米，且原始鞋面不低于甲板。本次姿势对照最大误差为 0。
- 原有全身边界、墙面接触、恢复精度、角色根节点和朝向断言保留。

本地 high、1280×720 车厢开场的 41 人受控对照：同一页面、演员和姿势，分别使用原始 `FootFloor` 与当前等价实现，单独调用 AI 更新，每组预热 20 帧并测量 90 帧，无 CPU 采样器。A/B/A/B 平均耗时依次为 **16.48 / 7.64 / 15.97 / 7.28 ms**，AI 更新减少约 **54%**。这是该机器当次的 CPU 更新对照，不能换算为保证的整帧 FPS；渲染提交仍有独立开销。

临时性能脚本、JSON、截图和开场输入记录留在本任务 `_shots/CarriageFootProbes`，动作截图留在 `_shots/CarriageAnimation`，不提交到站点。

## 只更新腿链，不再整棵重算（2026-09-15）

上面省掉的是**每个鞋面顶点**的骨矩阵乘法，`FootFloor` 开头那句
`rig.actor.root.updateMatrixWorld(true)` 还在：它把整棵人物子树（约 135 个节点、
60 多根骨头）重算一遍，而求解真正要读的只有鞋底探针指到的那几根骨头
（脚、趾，以及同一批顶点上权重不为零的小腿骨）和探针网格自己。

`FirstLevelCarriageAnimation` 构造时把 `actor.root` 到这些节点的路径取并集、
自顶向下去重存成 `floorChain`，每帧按 Three 的 `updateMatrixWorld(force)` 逐节点
重算这条链（`updateMatrix` + `matrixWorld = parent.matrixWorld × matrix`），
探针网格另走一趟 `updateMatrixWorld(true)` —— 只有 SkinnedMesh 的那个重写会刷新
`bindMatrixInverse`，而按绑定空间算鞋底正要用它（原来注释里那三行警告仍然成立）。

任何一只探针失效（有 morph、换了几何、改了顶点/蒙皮属性）时整句退回
`rig.actor.root.updateMatrixWorld(true)`：那条逐顶点路会读到腿链以外的骨头。

同一轮还去掉了 `Sample` 收尾那次整棵 `updateMatrixWorld` —— 调用方
`MissionTrainLifePose.Apply` 紧接着就 `rig.root.updateWorldMatrix(true, true)`，
两趟之间没人动骨骼。`Sample` 新增 `updateWorld` 选项（默认 true），只有那个调用方传 false，
直接调 `Sample` 的测试与工具行为不变。

镜头外或已交给远景层的乘客（`actor.poseVisible` 为假）跳过脚底求解与世界矩阵发布：
骨骼照常采样（不能冻在上车姿势），根节点沿用上一次解出来的抬升量；
`AiDirector._SetDetailedAttached` 在回到近景的上升沿置 `actor.poseDirty`，
下一次采样无条件补一次完整的。

确定性计数（`Script_FirstLevelFrameProbe.mjs --counts`，车厢机位，每帧）：
`FootFloor` 的 `updateMatrixWorld` 节点访问 5412 → 148，`Sample` 收尾那趟 5412 → 0。
`Script_FirstLevelCarriageAnimationTest` 的真值对照仍是 **maxError = 0**。

## 战斗回归的限制

`FirstLevelOpeningContactTest` 在后续 `ContactCorner` 战斗阶段报玩家生命为 0。复用同一测试输入、断言和视口，换回本任务起点的未优化车厢模块后，亦在相同时间、位置报相同阵亡失败。此项记录为本次对照复现的既有失败，不削弱断言、不登记永久豁免。

最终等价版本复用 `PlayFirstLevelOpening` 的原始输入、推进条件和断言，从列车炮击、救援、下车、战壕清理、掩体对白和步枪撤退一直完成到机枪接管，完整路线通过。过程中没有改写生命、弹药、任务事实或战斗推进条件。
