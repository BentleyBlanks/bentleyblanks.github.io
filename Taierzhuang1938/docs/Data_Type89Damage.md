# 八九式集束弹受损模型与动画

2026-09-13，按用户要求用 BlenderMCP 在独立工程中制作。替换第一关炸停后显示的小方块；原始 `Model_Type89Tank.tzm.json` 保持不变。

## 表现与接入

- 根据真实 `OnBlast` 爆点和车体朝向确定左/右受损侧。仍沿用原有集束弹、伤害、距离和遮挡判定，不扩大炸停条件。
- 从受击侧原履带索引移除前端 72 个三角形，暴露原车轮；13 块有凸齿的履带板组成垂落断带及地面散件，另有折弯挡板、原贴图发动机盖和黑色舱内，共 16 个刚体网格。
- 2.4 秒、30 fps 的 Blender 动画包含冲击顿挫、断带外甩、碎片弹落和最终停车姿态。游戏只插值烘焙位姿；普通 Mesh 的变换沿用运动矢量、阴影和预通道。
- 发动机盖沿铰接侧抬起，0.32 秒后从舱口持续冒黑烟。游戏使用现有 VfxSystem 烟源池；Blender 工程另含可编辑的体积烟预览。GLB 只含网格动画，烟在游戏中实时生成。
- 烟源复用句柄，复位、隐藏和 Dispose 时清理。恢复到已炸停的检查点直接呈现最终残骸；新爆炸按时间播放。地面散件用注入的共享地形采样器约束高度。

运行时入口：`Script_Type89Damage.mjs`、`Data_Type89Damage.mjs`、`Data_Tuning_FirstLevel.mjs` 的 `tankDamage`。原模型的 SHA-256 登记在烘焙数据内；原件更新后须重烘断口索引。

## 源工程与重建

本机目录：`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/Type89Damage`。

- `Model_Type89Damage.blend`：可编辑源工程，1–73 帧，30 fps，包含体积烟预览，审查渲染为 1280×720。
- `Model_Type89Damage.glb`：20 个网格、一个合并动画，沿用 Y-up / -Z forward；两张原作者贴图嵌入文件。
- 源模型与贴图仍归原作者 snrnsrk5，CC-BY-4.0，来源见 [八九式外观恢复](Data_Type89Appearance.md)。断履带、折板和动画为本次 Blender 建模产物。

在本任务的独立 Blender 工程通过 BlenderMCP 执行：

```python
import runpy
state = runpy.run_path(r"<worktree>/Taierzhuang1938/_blender/Script_BuildType89Damage.py")
state["LoadTank"]()
state["ReviewCamera"]()
state["BuildDamage"]()
state["ExportDamage"]()
state["PreviewSmoke"]()
state["ExportGlb"]()
```

脚本的 `OUT` 是本机源工程目录，跨机器重建时按根规范设置该路径。不要在其他任务的 Blender 场景运行。

## 本次验收

- `Script_Type89DamageTest.mjs`：实际原模型的左右断口、16 个刚体、动画末态、倾斜地面接触、恢复和烟源生命周期通过。
- 最新主线重放的 51 项 quick 检查全部通过，含第一关逻辑、模型朝向、资产规范、模块缓存戳和测试登记。
- 本地正式游戏 high 画质经真实 `OnBlast` 集束弹回调触发，断口、碎片和持续黑烟实拍完成，浏览器无 pageerror；这是定向诊断，不是整关自然通关证明。自检截图统一为 1280×720。
- 发布包 `BrowserBundleTest` 三个入口通过；`MotionVectorContractTest` 的 46 个 GPU 场景和 `CarriagePropVelocityTest` 的真实像素检查通过。
- GLB 已在浏览器用正式 GLTFLoader 加载并播放：一个合并片段、31 条动画轨道，末态散件位置与游戏烘焙数据误差小于 0.000001 米。
- prepush 在 39 项通过后停止于战车阶段之前的既有开场流程波动：`FirstLevelOpeningBrowserTest` 自动射击耗尽弹药后未取得 `zhouGunWounded`。本改动的摧毁状态尚未触发，未修改该断言；不能据此报告完整 prepush 通过。

模型验收页 `_check_Type89Damage.html`、截图和诊断脚本均只留本地；验收页可通过本地 LocalPreview 打开。
