# 第一关 03–05 战车（2026-09-23 战车包）

接口冻结见 [分包契约](Data_FirstLevel0105Refactor20260923Contract.md) §5.7；这里写实现口径与接线，给第二波 Front 包与集成用。

## 模块

| 文件 | 作用 |
| --- | --- |
| `Script_FirstLevelTankBrain.mjs` | 纯规则大脑（无 three，node 可跑）：驾驶 / 炮手 / 机枪 / 反应 / 护兵槽 / 两段毁伤 |
| `Data_Tuning_Tank.mjs` | 全部数值（带出处）+ 临时路点 `TANK_TEMP_PATH`（现布局）+ 开关 `brainEnabled` |
| `Script_FirstLevelTankRuntime.mjs` | 接线层：世界 → 大脑（目标、视线、掩体沿、车体挂点、事实、许不许开火、护兵名单），大脑 → 世界（位姿、开火、护兵走位、事实、震屏、可破坏掩体） |
| `Script_FirstLevelFrontBreakables.mjs` | 可破坏掩体机制（分段体块）+ 临时数据 `FRONT_BREAKABLES_TEMP` |
| `Script_Type89Damage.mjs` | 毁伤表现分两段：`trackCut`（掉履带板、撕挡泥板、车体塌向断侧）与 `engineKilled`（掀后甲板、冒黑烟）；不带 `damageState` 的旧调用两样一起上 |

运行时只留钩子：`Runtime.UpdateTank()` 第一行、`Runtime.OnBlast(event)`、`Runtime.OnTankHit(point, from)`（Main 的玩家 / 架设机枪弹道命中 `missionTank` 时调用）、`FrontBattle.TankBlockade / UpdatePressure` 各一处。`Data_Tuning_Tank.brainEnabled = false` 回到旧的定时插值路径。

## 大脑

- 路点 `{x, z, kind, stage?, holdUntil?, holdS?, faceTo?, preview?}`：`kind` 为 `cruise | hullDown | firePoint | squeeze | block`；`stage` = 最早哪一步能到（阶段拴绳）；`holdUntil` = 到了要等的事实，`"stage:<Id>"` 表示等进入那一步；`preview` 标出 03 的露面点（记 `tankPreviewed`）。
- 驾驶：加速 0.6、减速 1.2 m/s²；车头与切线差 > 0.3 rad 先停车原地转（≤ 0.32 rad/s），走着转向率 = 车速 / 5.5 m；停车按 `faceTo` 摆车头；躲弹后倒 1.5–3 m，不越过本阶段进入时的里程，投掷者仍在 9 m 投掷距离内；退完缓 6 s 再往前挤。输出 `load / rpm / pitch`（点头 / 后仰）。
- 炮手：10 Hz 感知、每 tick ≤ 6 条视线；打分 = 权重 × 1/(1+d/45) × 惯性 1.35；`untargetable / protect` 的人不打，且任何弹着点离他们 ≥ 9.8 m。预兆链：手摇 0.22–0.30 rad/s → 停摇 1.2–1.8 s（只在停车点、主炮许可时计）→ 开炮；节奏 7.5 ± 1.5 s。新暴露的玩家第一发打掩体沿（`Cover()`），没有掩体打在他前面 4.5 m（太近就打身旁）；同一目标散布 3.2 m × 0.62ⁿ（下限 0.7 m）；移动目标有提前量；看不见按 lastKnown 的掩体沿打；区域目标（`kind:"zone"`，阵位 / 缺口）看不见也照打它前面那道掩体的沿。
- 机枪：车体机枪 ±0.45 rad；首次接触第一串从目标前 9 m「走」到目标、零伤害（`damageScale 0`，Main 的 `FireVehicleBullet` 不结算伤害）；之后正常点射；看不见压 lastKnown 5 s。死角（< 10 m、在车体机枪射界外）：炮塔掉头，≥ 6 s 后塔后机枪才开火；开舱盖喊人（护兵往那一侧收）。
- 反应：≤ 8 m 的中方爆炸 → 后倒、炮塔甩向投掷者（0.42 rad/s）、机枪压 2 s、护兵散开；枪弹打车体 → 观察窗关 1.6 s，每 15 s 最多被牵一次注意；每 10–14 s 朝 `path.scan` 看 3 s（05 起）。
- 毁伤：只有 `GrenadeBundle` 伤车。车体局部坐标判部位：履带（车旁地面，≥35 → 约 3.2 m 内）→ `MobilityKill`；发动机后甲板 / 格栅 / 炮塔座圈（≥400 → 约 0.8 m 内，即落在车顶）→ `Disabled`；`MobilityKill` 之后任何一颗有效集束弹 → `Disabled`。`ForceDisable()` 给剧本补刀（罗班长）。
- 事实：进入 `MobilityKill` 或 `Disabled` 记 `tankImmobilized`；`Disabled` 记 `tankFireDisabled`。`TankBlockade` 在 `MobilityKill` 时仍然成立（停驶不等于解围）。

## 表现

- 炮管：Barrel 网格运行时挂到耳轴节点 `MissionTankGunTrunnion`（炮塔局部 `[0, 0.32, −0.6]`），俯仰 −10°…+20°，后坐 0.25 m；`gunMuzzle` 挂点跟着走。TZM 没有重导（`Type89DamageTest` 的 sha 不变）。
- 履带：克隆一份 Type89Track 材质挂 `MakeUvScrollPatch`（`Script_MaterialPatches`），u 向随车速滚动、原地转向左右反向；不加采样器。
- 位姿按车体轴取地面（旧版按世界 ±Z/±X，车头朝西时前后左右对不上）。
- VFX：主炮 `MUZZLE_KINDS.cannon` + `GroundDustRing`（地面尘环 1.3 s）；两条履带后方扬尘（车体局部）；排气常开 + 负载 ≥ 0.55 时一股黑烟。
- 震屏：`CameraShake.Rumble(distance, load)`（25 m 内，不进创伤桶，俯仰 ≤ 3 mrad）；30 m 内开炮一记俯仰冲击。
- 战斗：`Combat.Blast` 对 `Shell57`（战车 57 mm）墙后 6 m 内只给压制不掉血（`BLAST.occludedSuppression*`）。

## 可破坏掩体

数据格式见 `Script_FirstLevelFrontBreakables.mjs` 文件头。每块墙预建各段网格；炮弹（伤害 ≥ `minDamage`）落在离墙面 `hitRadiusM` 内打掉一段：换可见性 + `AddSolid/RemoveSolid`，碎块走 `vfx.Impact`。布局里标 `dynamic:true` 的块不进静态合批（首选）；没标时运行时把静态合批里那块的顶点塌到墙脚、摘掉碰撞（临时演示用）。永远不可破坏：`RightNestRearWall`、`RightNestEastWall`、支沟、守军安全区（`NEVER_BREAKABLE`）。临时数据：`RightNestFrontRest` 西半段三段（缴获机枪架在正中，不悬空），`RightNestNorthRuin` 两段。`GAMEPLAY_DESTRUCTION_ENABLED` 仍为 false。

## 给第二波

- Space 的新路点换掉 `TANK_TEMP_PATH`（`new FirstLevelTankRuntime(runtime, { path, breakables })`）；新 `Data_FirstLevelFrontBreakables` 换掉 `FRONT_BREAKABLES_TEMP`。
- 护兵名单读 `MISSION_ENCOUNTERS.tank`（现在 2 人，槽位 4 个）；要满编需在名册里补到 4 人。
- 大脑的 `barks`（`turretTraverse / hatchShout / escortScatter / visionSlit / trackCut / tankDisabled`）现在只记进日志，没有 cue；罗班长的预兆喊话、日军「车旁有人」需要 Voice 包出 cue 再接。
- 取证：`Debug.FirstLevelMission().tankBrain`（大脑快照、主炮每发的预兆时长与落点、机枪点射、反应、毁伤序列、掩体段数、露面时刻）。
