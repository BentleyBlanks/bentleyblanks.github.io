# 第一关远景硝烟（2026-09-26）

来源：Notion [游戏概念参考图](https://app.notion.com/p/3e460335331c80799ad5f4faf4f837a9) 的 04、04B、05、05B、06、06B。已逐图目视，参考的是屋脊和坡后持续升起的烟柱；04 近处炸土、05B 战车毁伤烟继续由原战斗系统负责。

## 构图与接入

- 04/04B：战车道路纵深一处，北侧屋脊后和西北坡后另有错落烟柱。05 从取弹沟和攻击位转头，仍看到同一组远景烟。
- 05/05B：主烟位于战车后方及撤口外侧，枪口、车辆和行走路线前不放烟源。
- 06/06B：集结处东西远坡与更远的屋顶方向各一处，借火和接令时随真实观察方向呈现不同投影。

`Data_FirstLevelDistantSmoke` 的七个区域用固定种子散布，随机化落点、宽度、密度、寿命和局部风向。烟源固定在世界坐标，接地采用白盒共享采样器，目标推进不重新抽样；重开及检查点按同一数据重建。每根设计高度约 28–38 米，烟团随烟龄和风漂移渐淡，偏西风向局部轻微变化；粒子池、烟贴图、大气透视和画质缩放均沿用 `VfxSystem`。

`FIRST_LEVEL_MISSION_PHASE.smokeColumns` 显式启用；旧白盒、靶场和其他关卡不新增这七处烟。`SeedSmokeColumns` 对声明烟源的白盒先读取配置，其他关卡保持原目标点烟柱策略。`SmokeSource` 可选 `wind` 仅影响本发射器；`prewarm` 在首次有效更新回填不同烟龄，着色器预热清理后下次更新重建背景烟，不推进玩法时钟或复活爆炸火球。

## 验证入口

`node Taierzhuang1938/Script_FirstLevelDistantSmokeTest.mjs` 检查实际路线净空、渲染地形边界、K6/K7/K9/K11 烟冠通视、固定种子重建与最低画质粒子余量，并调用真实发射器方法验证首次预填、清理后重建、检查点时钟重置、局部/全局风隔离及移除后无残留。浏览器视觉审阅采用 04/05/06 真实白盒的 K6–K11 机位。截图为构图验收，不作为正常通关证据。

## 本轮实测

- 高、低画质 K6–K11 实景截图已目视，06 调整远坡落点后另拍两档复核；七个世界坐标在阶段重建后保持一致，浏览器无 pageerror，WebGL 错误为 0。
- low/small 实测约 30–33 个存活背景烟粒子，源烟池容量 62；按最长寿命的保守上限为 42，保留战斗烟粒子余量，未扩大粒子池。
- `FirstLevelDistantSmokeTest`、`FirstLevelMissionTest`、`FirstLevelFrontTopologyTest`、`FirstLevelFrontTest`、`ExplosionRulesTest`、`ModuleGraphTest`、`TestRunnerTest` 通过。
- 共享特效相关的 `MotionVectorContractTest`、`MuzzleFlashTest`、`FlareTest`、`ExplosionRangeTest`、`RespawnShaderWarmTest` 与普通白盒/菜单/资源降级三入口 `BrowserBundleTest` 通过。未执行全域 prepush 套件，按本次烟源变更选测。
- `Script_FirstLevelMissionBrowserTest.mjs --campaign --stage-from=4 --stage-to=6 --evidence-tag=DistantSmoke` 通过：只从04检查点初始化，随后真实输入连续完成取弹、炸车、撤回、借火及06出发；结束于 South，游戏内 304.75 秒，pageErrors=0、checkpointRetries=0。
- `BootTest` 未完整通过：240秒超时前记录 phase0 通过、phase1–3 的“日军远景辨识材质未接全 count=0”，后续章节本轮未完成。这类材质断言已有[白盒基线记录](Data_FirstLevelWhitebox20260924.md)，本次未修改或放宽它，不将整套回归描述为全绿。
- 发布包：474 模块，内容戳 `3291372426074463`。截图、连续流程日志和临时发布包保留本地，不提交图片或验收页面。
