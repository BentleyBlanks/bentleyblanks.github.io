# 移动车厢道具模糊复发调查（2026-09-11）

结论：腊肉与背包的运动矢量缺少物体自身位移。相机随军列移动时，屏幕上基本不动的道具被记录为高速移动。`Script_PostMotionBlur` 据此拉长采样，`Script_PostTaa` 据此从错误位置取上一帧颜色；提高贴图分辨率、锐化或关掉运动模糊都不能修正共同输入。

## 具体接线与复发经过

1. `Script_PostPrepass.mjs` 的旧刚体路径默认 `worldPrev = worldNow`，只用前后相机矩阵求速度。只有人工调用 `MarkDynamicPrepass` 的 Mesh 才得到上一帧物体矩阵。
2. `7ccbc7765`（9 月 9 日）给车厢、车门、背枪和背带补了这个标记，没有建立普通运动网格的默认保障；帽子等骨骼附件仍存在同类缺口。
3. `Script_FirstLevelMissionView.TrainHandProps` 每帧更新 `fieldPack` 的 `instanceMatrix`。当前实例预通道没有上一帧实例矩阵。标记整个 InstancedMesh 也无法抵消每个实例的位移。
4. `5f01736fa` 加入的 `Script_FirstLevelMeal.CreateMealProp` 创建普通 GLTF Mesh，并随手移动；未接入旧的显式速度标记。其他乘客的腊肉也由该工厂创建。
5. `ace115f4f` 重建开场时移除了 `Script_FirstLevelMissionBrowserTest` 内的 `prepassDynamic` / 整屏异常速度占比断言。当前开场、腊肉动作测试使用 low 画质，无法验收高画质的 TAA / 运动模糊。原来的整屏 6% 阈值本身也可能漏掉占画面较小的单个道具。

## 当前修复契约

以下是车厢事故对应的修复记录；所有新增 Mesh / SkinnedMesh / 骨骼挂件的共同规范与自动门禁见 [MotionVector 接入规范](Data_MotionVectorContract.md)。

- 普通刚体 Mesh 的上一帧世界矩阵由 `PrepassPass` 默认记录，不依赖资产工厂逐件标记。骨骼附件、父节点带动的物体、异步新建的普通道具均走此路径。
- 历史位于每个 pass 私有的 WeakMap，覆盖材质的 `onBeforeRender` 在对象原有回调之后绑定；不覆盖破口、前景或其他对象回调。只有实际移动的 draw 及返回默认值的边界上传附加 uniform。静态城市几何不因此逐件重传整份 uniform。
- 所有材质组完成后才统一推进历史；中间没画出的物体重新出现时不能读取陈旧矩阵。新管线、切画质、换场景也不会从克隆的 userData 继承旧历史。
- `MarkDynamicPrepass` 保留为兼容和诊断标记；不再决定普通 Mesh 是否获得正确速度。
- 近景背包和弹药改成按角色/道具身份复用的普通 Mesh，共享几何和材质，并遵守原有数量上限；每帧没有新建网格。腊肉不改资产。第一人称手枪继续保留前景零速度规则。
- 远景 InstancedMesh / BatchedMesh 的逐实例运动仍是既有近似。**近景、手持、骨骼附件、交互道具不得直接复用没有逐实例历史的路径**。后续要把这些道具重新实例化，必须一并实现稳定实例身份及上一帧实例矩阵，并通过同一像素测试。

## 验证与证据

`Script_CarriagePropVelocityTest.mjs` 独立于任务路线和台词步骤，开实际 high 画质第一关、连续渲染移动车厢并截图；随后用实际腊肉/背包几何构建受控 GPU 对照。读回速度纹理，不以标记或材质参数替代像素。

320×240 的受控对照（相机和物体同向平移 0.12 m，物体屏幕位置应不变）：

| 对象 | 原实现中位速度 | 修复后中位速度 | 修复后单独平移相机 |
| --- | ---: | ---: | ---: |
| 整块腊肉主壳 | 12.793 px/帧 | 0 | -8.525 px/帧（X） |
| 腊肉薄片主壳 | 12.588 px/帧 | 0 | -8.394 px/帧（X） |
| 背包 | 13.818 px/帧 | 0 | -9.209 px/帧（X） |

旧实现用同一测试实际失败；修复后同向移动、停止、隐藏后重现、真实相机移动均通过。切面分件也分别读回并验收。实际 1440×900 车厢截图中，原实现的肉片层纹被拖成宽色带，修复后恢复层纹。测试截图与日志在本地 `_shots/CarriagePropVelocity`，不提交图片或验收页面。

选测域 `propVelocity` 绑定 `PostPrepass`、`FirstLevelMeal`、`FirstLevelMissionView` 与本测试；runner 自测还检查这些入口会选中该门禁。共享渲染回归与完整开场流程另行执行，不能用本受控实验冒充整关通关或帧率保证。

命令：

```powershell
node Taierzhuang1938/Script_CarriagePropVelocityTest.mjs
node Taierzhuang1938/Script_TestRunner.mjs --profile=prepush --domain=propVelocity,render --fail-fast
```

本地预览：`node scripts/Script_LocalPreview.mjs 19119 --no-open` 后，可给像素测试加 `--local` 使用该 worktree 的预览服务。

## 扩展回归结果

在 `6d451eb71` 基线上完成本次修复，去重后 61 个检查通过，涵盖渲染域、七关 Boot、发布合并入口、破口、第一关规则与腊肉动作。最终本地预览实测 TAA / velocity / motionBlur 均开启，4 个背包存在，交接到接收者时接触误差为 0。

另发现并区分了两项原有失败，没有降低断言阈值或修改战斗来让测试变绿：

- 旧 `TaauTest.ScaleShot` 每档推进 28 个游戏帧，世界姿态随时间变化，八帧 Halton 周期又错开四帧。原预通道对照同样失败（0.75：35.31 dB，0.67：35.61 dB）；修复后的预通道原测试为 35.31 / 35.60 dB。将测试统一为冻结游戏时间、重置采样相位、累积 32 帧，仍保留原 PSNR 下限和单调性断言，最终 **22/22 通过**：0.85 / 0.75 / 0.67 分别为 49.43 / 46.63 / 44.63 dB。运行时 TAA 参数未改。
- `FirstLevelMissionBrowserTest --campaign --audio` 本次在 `TrenchContact` 战斗阵亡；用原预通道和原任务视图替换的基线页也在同阶段报 `player died, actual combat outcome`。车厢交接、炮击、救援和出车厢均已走过；**本次没有完整通关证据**，该战斗失败不登记为豁免、不冒充全绿，日志分别保留为 `VelocityMissionRegression.log` / `VelocityCampaignBaseline.log`。
