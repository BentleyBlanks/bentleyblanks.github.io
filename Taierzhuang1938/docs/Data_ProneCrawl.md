# 通用匍匐移动与贴地

2026-09-27。运行时入口：`Script_CharacterModel` → `ProneCrawl` 动作；接触层为
`Script_ProneCrawl`，数值在 `Data_Tuning_ProneCrawl`。

原来正式士兵的 `prone` 无论是否移动都选 `StandFireCrouch` 定格；旧 Actor 中的程序化
收腿动作并不驱动正式蒙皮，旧脚 IK 又排除了卧姿。因此不能只修改 `PoseProne`。

- 共用 `TengxianHumanoidV1` 的国军、日军及面部派生件播放同一条 Blender 动作。
  左右交替收膝与蹬伸，左手支撑和前伸与对侧腿配合；右手携枪随身体前送。
  持枪方向不再取正在支撑地面的左手，移动时瞄准层不覆盖匍匐手臂。
- `ActorLocomotion` 按真实位移驱动播放速率；碰墙停止后回卧姿。
  支撑阶段锁定手脚的世界位置，转向时限制修正幅度；跳跃、传送和导演强制动作释放锁定。
- 接触层位于骨骼动画和普通瞄准之后，下帧先恢复原始采样。骨盆按胸腹与横向采样拟合
  坡面，四条肢体分别采样同一 `ActorFactory.groundProbe`，用定长两骨 IK 贴合。
  皮肤与衣裤探针按蒙皮影响组合选极值并共享缓存，处理不同外观的袖口、绑腿厚度。
  地形射线按身体/肢体采样，不逐顶点发射；原角色胶囊、移动路线和伤害规则不由此层改写。
- 远景增加六帧匍匐姿势桶，用独立的真实位移相位翻页，实例按地面坡度倾斜。
  近景使用完整骨骼与四肢接触；远景仍遵守原有合批策略。
- 原地卧射保留原动作；强制剧情、死亡、搬运和离地状态不接管。
  第一人称裁切身体使用其独立资产契约，不把第三人称骨架强套进去。

## 重建

只作者化一条共用动作，不重烘身体、其他武器或剧情动作。

```powershell
node scripts/Script_BlenderMcp.mjs start --task ProneGroundMotion
node scripts/Script_BlenderMcp.mjs exec --file Taierzhuang1938/_import/Script_ProneCrawlBake.py
node scripts/Script_BlenderMcp.mjs stop
node scripts/Script_BlenderMcp.mjs status --scan
```

重建脚本读取当前 checkout 的标准国军身体和已校正卧姿，保留绑定与骨长，经 Blender
计算支撑、收膝、手掌方向、真实蒙皮接地后写出 `Animation/ProneCrawl`。可用
`PRONE_PROJECT` 指定项目绝对路径（通过 MCP 执行时在 Python 环境中设置）。
可编辑源工程：
`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/ProneCrawl_20260927/Animation_ProneCrawl.blend`。
源工程、截图与验收场景不提交。

## 验收

`node Taierzhuang1938/Script_ProneCrawlTest.mjs` 用正式 GLB 检查循环接缝、六个肢体点的移动、
骨长、受阻停止、支撑点滑动，以及平地、上下复合坡面、局部凸起的全部蒙皮最低点。
另外检查转向、传送释放、强制/作者动作让位、蹲站恢复及六个远景匍匐帧。
报告与截图写到忽略目录 `tmp/ProneCrawl/`，数值通过后仍须看截图。
共用回归为 ActorPose、ActorLocomotion、ActorCrowd、InfantryAnimation、CharacterModel、
ModuleGraph 与 MotionVectorContract；发布前运行 `--profile=prepush --domain=animation`，
另按本次共享 Actor / 远景消费方补跑对应浏览器回归。

2026-09-27 本轮：六套外观 × 四类地面共 24 组通过；远景六帧真实几何均不同，
96 人铺满 14 档后实例数和三角形数不增加，网格增量仍严格等于新增档数 × 材质数。
MotionVector 的 47 个 GPU 场景、发布包白盒/主菜单/角色资源缺失三种入口通过。
动画域 57 项通过；MeleeAnimationTest 仍复现既有的第一人称刺刀握点 0.02236 m 误差，
与 [身体骨架验收记录](Data_CharacterStandard.md) 和 [大刀动作基线](Data_DadaoPowerSwing.md) 一致，未放宽断言。
