# 担架员抬担架动作重做（2026-09-30）

用户看第一关行进中的担架队，觉得担架员「太奇怪」：躯干前扑、肩膀朝镜头拧、手肘飞出、一副在冲刺的样子。

## 原因

担架员原来是「视频转骨骼的 `CarryStretcherFront/Rear` 上半身 + `AllyCarryWalk` 的腿」（`Script_LayeredGait`），
运行时再用两骨 IK 把手腕拖到杆上。视频那条上半身从来没靠近过 0.58 m 的杆距，杆又在髋部高度（0.88 m），
IK 的肘极点还固定在「向上、向外」，手垂到腰间时肘被顶成鸡翅。

## 现在

`_import/Script_LitterBearerBake.py`（BlenderMCP 出活，写法同 `Script_AllyGaitBake.py`）做四条 Blender 全身动作，
共用 TengxianHumanoidV1 骨架，腿仍是 RelaxedGait 那套量过接触段的步态（参考速度 1.35 m/s，担架 1.4 m/s）：

| clip | 用途 |
| --- | --- |
| `LitterBearerFrontWalk` / `LitterBearerRearWalk` | 走。躯干直立稳定、肩线水平、髋摆缩到自由行走的 35%，骨盆下沉 7 cm（膝软） |
| `LitterBearerFrontStand` / `LitterBearerRearStand` | 停下等，原来是把视频 clip 冻在第 0 帧 |

手臂直接解到杆上：杆心距躯干 ±0.29 m、离地 0.88 m；前位杆头在髋后 0.22 m（臂向后垂），后位在髋前 0.22 m
（运行时把担架员骨盆向担架中心挪 0.06 m）。解的是运行时拿来对杆的手指根部质心（`rig.Grip`），不是腕骨；
肘极点向外、向后；手掌向内、四指绕杆握拳。烘焙实测握点距杆心 ≤ 5.2 mm（走）/≤ 4 mm（站），最低鞋底 3.95–4.02 mm，
躯干倾角 −2.7°…−1.5°。JSON 在 `Animation/LitterBearer/Animation_TengxianLitterBearer.json`，可编辑工程在
`C:/Users/Bentl/OneDrive/AI/Models/Blender/Taierzhuang1938/LitterBearer_20260930/Scene_LitterBearer.blend`。

运行时：

- `Script_LayeredGait.LayeredGaitId` 对 `CarryStretcherFront/Rear` 优先返回上面的 clip（库没到时仍走旧的分层视频 clip，肢体不断档）。
  走的 clip 带步态量过的接触段，由共用的距离时钟驱动步频；站的 clip 按自己的节奏循环。
- `Script_FirstLevelMissionPeople`：手臂 IK 的肘极点改成「当前肘位」（保留 clip 的弯曲方向），不再用固定的向上/向外极点；
  `loadSinkM`、`loadLeanRad` 归零，下沉和体态由 clip 自己带。
- `Script_EscortLitterShot` 的 clip 断言接受新旧两种名字。

## 复现

```powershell
node Taierzhuang1938/_import/Script_AllyGaitPrepare.mjs
node scripts/Script_BlenderMcp.mjs start --task LitterBearer
node scripts/Script_BlenderMcp.mjs exec --code "import os; os.environ['LITTER_BEARER_PROJECT']=r'<worktree>/Taierzhuang1938'"
node scripts/Script_BlenderMcp.mjs exec --file Taierzhuang1938/_import/Script_LitterBearerBake.py --timeout 900
node scripts/Script_BlenderMcp.mjs stop
```

杆距、杆高、下沉量改了要同步 `P012_STRETCHER_GRIPS` 与 `Script_LitterBearerBake.py` 顶部的常量。
验收：`_shots/CarryProbe/Script_CarryProbe.mjs <tag> 7`（从 `missionStage=7` 起，摆机位拍第 3 副担架的前后位；忽略目录，不提交）。
