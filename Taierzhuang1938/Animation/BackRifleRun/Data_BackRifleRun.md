# BackRifleRun 独立资产交付

此目录是国军背枪跑步的独立审查包。生产 `RifleRun`、角色资产、`Script_Actor.mjs`、`Script_Main.mjs` 和 AI 分支均未替换。

## 文件

- `Animation_LugouNraBackRifleRun.blend`：可编辑动作、原骨架与蒙皮、胸椎背枪挂点、连续跨肩绑带、灯光及侧/后视相机。内嵌烘焙脚本。
- `Animation_LugouNraBackRifleRun.glb`：可独立导入的完整角色与动作，唯一 clip 为 `BackRifleRun`。
- `Animation_BackRifleRunSide.webp` / `Animation_BackRifleRunBack.webp`：从真实导出 GLB 捕获的无限循环预览。
- `index.html`：同屏侧/后视、播放/暂停、逐帧与移动速度审查。
- `Data_BackRifleRun.json`：时长、帧率、步幅、来源哈希、挂点矩阵、原生身高和逐帧烘焙测量。
- `Data_BackRifleRunVerification.json`：浏览器重新载入最终 GLB 的验收结果。

## 骨架与挂接

使用 `Model/Character/Model_LugouNra01.glb` 的完整原始关节名与绑定层级；保留 `GroundRoot` 与 `Bip002` 骨名。动作没有复制、改名或剪取旧 `RifleRun` 曲线：支撑足轨迹、腿部解析 IK、骨盆重心、躯干反扭、交替摆臂和手指姿态在 `Script_BackRifleRunBake.py` 中独立生成。

`Socket_BackRifle` 固定在 `Bip002 Spine2`，步枪和绑带是该挂点子节点。步枪几何解码自项目现有 `Model/ZhongZheng.tzm.json`，尺寸与枪托/枪口方向保留；没有替换生产枪模。新挂点独立于 `Socket_BackBlade` 和双手武器挂点。绑带用可编辑带状网格表示，从上枪带环跨右肩，沿胸腹绕左肋连接枪托带环，与胸椎保持相同约束。枪体不在运行中换父节点，也不使用逐帧世界坐标纠偏。

独立 GLB 的制服/皮肤非金属设置对齐 `Script_CharacterModel` 的 `ConfigureExternalPbr` 规则；原始生产材质文件保持不变。

## 时序、方向与移动

所有数值以 `BACK_RIFLE_CONFIG` 和 `Data_BackRifleRun.json` 为准，不在本文维护第二份数表。

| 项目 | 契约 |
| --- | --- |
| 动作 | `BackRifleRun`，时长 `durationSeconds`，循环周期 `cycleFrames`，采样率 `fps` |
| 基准速度 | `referenceSpeedMps`，对应当前 `Script_Ai` 常规推进/侦察推进的米制移动速度 |
| 步幅 | `strideMeters` 是左右脚完整循环的前进距离 |
| 根运动 | 原地循环；`GroundRoot` 保持固定，骨盆只作垂直/横向重心运动，世界位移由调用方驱动 |
| 源方向 | Blender 上轴 +Z、正面 -Y；GLB 上轴 +Y、正面 +Z |
| 游戏方向 | 沿用 `MODEL_FORWARD_YAW` 一次，转换为游戏局部 -Z；不能再额外翻转 |
| 缩放 | 原生绑定身高见 `nativeBindHeightMeters`；运行时目标身高见现有角色调用方，默认参考值登记在 `runtimeDefaultHeightMeters` |
| 播放倍率 | `actualSpeedMps / (referenceSpeedMps * uniformCharacterScale)`；未缩放时整体缩放倍率为单位值 |

使用完整 GLB 时可直接播放唯一 clip；提取 clip 给原国军角色时，以原骨名绑定并复用其原始绑定变换，同时单独挂接本包的步枪与绑带。不要把国军曲线直接交给日军骨架。不同国军变体的比例、装备间隙和混合过渡尚需接入时逐个验收。

本包只制作循环，不包含“手持步枪切换至背枪”的过渡动作。生产状态机接入、起停/转身混合、斜坡 IK 与其他武器共存仍属于后续验收范围；本次不接入生产。

## 重建与验证

在 BlenderMCP 的全新后台实例中执行 `_import/Script_BackRifleRunBake.py`。使用 `BACK_RIFLE_ROOT` 指定仓库根目录，或让进程 cwd 为仓库根。脚本只新建场景，导出文件限定在本目录。源工程由 `Script_BackRifleRunSource.py` 在新的后台进程封装成可直接打开的完整文件，只导入明确命名的任务对象；既有 Blender 场景不删除、不覆盖。

本地预览在独立 worktree 直接运行 `node scripts/Script_LocalPreview.mjs`，再打开 `/Taierzhuang1938/Animation/BackRifleRun/`。

```text
node Taierzhuang1938/Script_BackRifleRunTest.mjs
node Taierzhuang1938/Script_BackRifleRunTest.mjs --capture
node Taierzhuang1938/Script_TestRunner.mjs --profile=prepush --domain=animation --fail-fast
```

测试通过现有 BrowserTestKit 与 ServeRoot，直接重测最终 GLB：原文件哈希、原关节集、唯一动作、通道首尾、世界坐标接缝、骨盆起伏、逐半帧真实蒙皮鞋底、支撑足世界滑动、胸椎挂点相对矩阵、WebGL 错误及移动端布局。截图落入 `_shots/BackRifleRun/`，不发布整套中间截图。

视觉审查采用真实 GLB 侧/后视全周期联系图与循环预览。技术验证通过与独立资产发布均不代表批准替换生产跑步。
