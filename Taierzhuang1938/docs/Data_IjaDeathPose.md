# Shared soldier DeathCollapse animation

国军与日军共用四个 Kimodo「受击倒下」候选。运行时按演员 seed 稳定抽取 A–D：同一名士兵回放时结果一致，不调用 `Math.random`，两军使用相同的候选规则、各自阵营的原骨架曲线。

## 正式资产

- 国军：`Model/Character/Animation_LugouNraDeathCollapse.glb`
- 日军：`Model/Character/Animation_LugouIjaDeathCollapse.glb`
- 每份 GLB 含 `DeathCollapseA`、`DeathCollapseB`、`DeathCollapseC`、`DeathCollapseD` 四条非循环动作，只保留骨架、skin 和动画，不重复人物网格或贴图；两份合计约 1 MB。
- 四条有效动作在裁掉生成结果的静止长尾后为 2.70–3.07 秒。游戏以 1.6 倍速播放，约 1.69–1.92 秒倒地并锁住终帧。

Kimodo 原结果保留在本机 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Kimodo`：

| 候选 | Kimodo 结果 | seed | 有效帧（30 fps） |
| --- | --- | ---: | ---: |
| A | `Motion_20260915_072856_4646` | 133455986 | 89 |
| B | `Motion_20260915_073110_ac37` | 291095350 | 89 |
| C | `Motion_20260915_073340_c2ae` | 923993939 | 93 |
| D | `Motion_20260915_073613_9d6f` | 1166582261 | 82 |

可编辑 Blender 工程与候选重定向工程位于 `C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/DeathCollapseKimodo`，不进入站点仓库。

## 重建链

1. `_import/Script_KimodoDeathCollapsePrepare.py` 读取 Kimodo 的 SOMA77 NPZ，将 Y-up 转为 Blender Z-up、统一站立朝向、检测稳定终帧，并写成现有死亡重定向器可读的 motion payload。原 NPZ 不修改。
2. `_import/Script_MotionDeathBake.py` 对 NRA、IJA 的 canonical 原骨架分别烘焙四条动作。逐帧按可见蒙皮表面修正地面接触，并保留腿长、躯干支撑和放松后的手脚姿态。
3. `_import/Script_KimodoDeathCollapseMerge.py` 将同阵营四个 action 合并为一份动画库；审阅用网格保留在 `.blend`，正式 GLB 只导出 armature。

重建依赖 Kimodo 本地工作台、它的 Python 环境，以及现有私有原骨架准备工程。提交到仓库的是游戏 GLB 和可复现脚本，不提交 Kimodo 缓存、私有准备工程或验收截图。

## 运行时

`Script_CharacterModel.mjs` 每个阵营只加载一次死亡库，再把 canonical rest 差异转换到实际模型。`SelectDeathCollapseClipId` 用 `seed|death-collapse` 选择四候选之一；`BeginDeathPose/PoseDeath` 单次播放选中动作并保持终帧。一次性 action 不使用重复 `AnimationMixer.setTime`，而按归一化进度只推进增量，避免尸体后续 tick 回到第 0 帧重新站起。

`Script_Actor.mjs` 在 GLB 士兵死亡时让导入动作接管可见骨架和倒地时长。原程序化倒地仍是没有角色 GLB 或死亡库加载失败时的退路；`Data_DeathPose.mjs` 的单姿势版本也只作为死亡库不可用时的兼容退路。

武器继续走原有脱手逻辑：保持世界尺寸，以士兵 seed 稳定变化落点和朝向，固定刺刀计入最终包围盒；断肢系统已经接管武器时，死亡动作不会抢回。

终帧仍在 Actor 的地形平面内按实际可见蒙皮检查。离线动作提供平地接触，运行时的有界 pitch/roll 搜索负责斜坡与局部地面，缓存最终旋转和 8 mm 余量；删除的断肢三角形不参与支撑。

## 验收

- `Script_CharacterModelTest.mjs`：两份 GLB 各含四条完整动作、时长正确、无重复网格/贴图，并核对运行时随机选择和一次性播放接线。
- `Script_DeathCollapseTest.mjs`：真实浏览器加载国军、日军原模型，强制覆盖 A–D，检查骨盆下降、全身表面接地、四个不同终姿及重复终帧不漂移。
- `Script_ActorPoseTest.mjs`：正式 Actor 死亡链、武器掉落、国军/日军/敢死队/军官、正反冲击方向、斜坡与后续 corpse tick 稳定性。
- 本地预览对照四候选的 32% 动作帧和终帧；验收页与截图只留本地，不提交仓库。
