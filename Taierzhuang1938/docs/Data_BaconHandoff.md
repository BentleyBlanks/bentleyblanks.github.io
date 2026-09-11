# 开场腊肉交接

2026-09-11，适用正式第一关与 `?whitebox=p012`。本次仅制作整块腊肉、单片腊肉和配对递接动作，没有批量生成其他人物动作。

开场由幺娃伸手递出一片腊肉，顺子张手、合指接住，抬到眼前配合“你切这么薄”的对白，最后送近嘴边收手。整块仍留在幺娃左手。肉片只有一个实例，所有权在原录音 2.05 秒切换；原 `TrainFoodReceived` 仍在顺子说完后释放移动。初始视线稍向下包含双手，玩家可自由转头。

旧 `ration` 盒体和整理装备时双手悬挂的 `pouch` 盒体已移除。背景吃食者只在右手拿切片，刘文财手里是数弹用的圆柱弹药。既有背包不属于手持食物。

## 资产和制作来源

- 第一档内置 imagegen 生成一张整块／切片三视图；没有使用付费回退、Lovart 或即梦。参考图用于 Blender 轮廓、层次和切面 UV，纹理嵌入游戏 GLB。
- `Model/BaconHandoff/Model_CuredPork.glb`：整块 1,760 三角、切片 1,184 三角；不规则收尖轮廓，深色烟熏外皮，肥瘦分层。米制；X 为长边，Y 为高度，Z 为厚度。没有人物／载具意义上的机头朝向。成品由 `Script_ModelFacingTest.mjs` 按顶点云复量轴向和尺寸。
- `Model/BaconHandoff/Data_BaconHandoff.json`：Blender 贝塞尔动作逐帧采样，337 帧／60 Hz，双手位置和合指曲线。运行时按实际录音 `sourceTime` 采样，通过原骨架 IK 适配手臂长度；不把作者曲线冒充视频捕捉。
- `Script_FirstLevelMeal.mjs`：真实掌心接触、单个肉片交接、转头时保持交接方向、恢复骨骼变换和卸载。`Script_Viewmodel.MealHands` 只用于空手接食。人物模型下载失败而使用无骨架白盒替身时跳过专用动作，保留原启动回退。

Blender 源工程统一保存在 `C:\Users\Bentl\OneDrive\AI\Models\Blender\Taierzhuang1938\BaconHandoff\Scene_BaconHandoff.blend`。同目录保留 `Reference_CuredPorkThreeViews.png`、控制动画 GLB、两套原骨架动作 GLB 和评估记录。两个动作使用游戏原有的 53 骨骨架；工程含人物／军装双臂、手指、两件食物和动作控制点。参考、源工程与验收图不提交到站点。

重建顺序：在任务独占 worktree 中，用 BlenderMCP 在上述独立工程执行 `_import/Script_BaconHandoffBake.py`；执行时设置脚本的 `__file__`，或把 `BACON_PROJECT_ROOT` 设为 worktree 根目录。随后运行 `node Taierzhuang1938/_import/Script_BaconHandoffProject.mjs` 将实际消费后的原骨架姿势导回本地，再用 BlenderMCP 执行 `_import/Script_BaconHandoffProject.py` 组装可编辑工程。前者会重建本任务场景，后者装入最终人物动作。改变接触曲线后必须重新导回原骨架。

## 验证

`node Taierzhuang1938/Script_FirstLevelMealTest.mjs` 从正式入口加载，检查实际双臂和手指、交接前后两掌接触、唯一肉片所有权、自由转头、暂停录音时不提前交接、接回肉片位于相机内及收手后的隐藏。逐时点截图与 JSON 在本地 `_shots/FirstLevelMeal`，必须目视检查。

69 项 quick 检查通过。原车厢起身检查 `FirstLevelTrainAnimationTest` 的 `skin_support` 失败在修改前的 `7605717ed` 独立基线检出复现，样本含演员 18、`Gear`、凳板穿透 5 顶点、`seatGap=-0.096550955`；这属于既有坐凳／侧翻流程问题，不能记为本次通过，也不削弱原断言。

第一关 `FirstLevelMissionBrowserTest --campaign --audio` 正常输入通关，通过开场、前线、院落、转运、空袭和撤退，到达 `Complete`（任务时钟 1489.53 秒）；未用跳关或改写事实替代通关。`FpsArmTest`、`ModelFacingTest`、测试注册检查通过。合并主分支更新后，腊肉交接、`FirstLevelMissionPresentationTest`、七关 `BootTest`、`GeoTest` 和模块版本图检查通过。最终 `BrowserBundleTest` 的普通开始、主菜单、人物模型缺失三种部署入口均通过。验收截图、通关数据及最终部署记录保存在上述 OneDrive 工程的 `Review` 目录。
