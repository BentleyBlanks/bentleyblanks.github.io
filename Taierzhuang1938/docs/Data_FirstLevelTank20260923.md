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
- 炮手：10 Hz 感知、每 tick ≤ 6 条视线；打分 = 权重 × 1/(1+d/45) × 惯性 1.35；`untargetable / protect` 的人不打，且任何弹着点离他们 ≥ 9.8 m。预兆链：手摇 0.22–0.30 rad/s → 停摇 1.2–1.8 s（只在停车点、主炮许可时计）→ 开炮；节奏 7.5 ± 1.5 s。新暴露的玩家第一发打掩体沿（`Cover()`），没有掩体打在他前面 4.5 m（太近就打身旁）；同一目标散布 3.2 m × 0.62ⁿ（下限 0.7 m）；移动目标有提前量；看不见按 lastKnown 的掩体沿打；区域目标（`kind:"zone"`，阵位 / 缺口）看不见也照打它前面那道掩体的沿。警告弹伤害 ×0.2（只砸土不要命）；落点离还没被警告过的玩家 < 4.5 m 的任何一发都按警告弹算。
- 机枪：车体机枪 ±0.45 rad；首次接触第一串从目标前 9 m「走」到目标、零伤害（`damageScale 0`，Main 的 `FireVehicleBullet` 不结算伤害）；之后正常点射；看不见压 lastKnown 5 s。死角（< 10 m、在车体机枪射界外）：炮塔掉头，≥ 6 s 后塔后机枪才开火；开舱盖喊人（护兵往那一侧收）。
- 反应：≤ 8 m 的中方爆炸 → 后倒、炮塔甩向投掷者（0.42 rad/s）、机枪压 2 s、护兵散开；枪弹打车体 → 观察窗关 1.6 s，每 15 s 最多被牵一次注意；每 10–14 s 朝 `path.scan` 看 3 s（05 起）。
- 毁伤：只有 `GrenadeBundle` 伤车。车体局部坐标判部位：履带（车旁地面，≥35 → 约 3.2 m 内）→ `MobilityKill`；发动机后甲板 / 格栅 / 炮塔座圈（≥400 → 约 0.8 m 内，即落在车顶）→ `Disabled`；`MobilityKill` 之后任何一颗有效集束弹 → `Disabled`。`ForceDisable()` 给剧本补刀（罗班长）。
- 护兵：车开到离他 30 m 内才接过来跟车（03 车在图外时护兵留在原处打仗）。
- 事实：`tankPositionPressured` = 主炮落点离阵位 < 10 m（阵位四周的墙把炮弹挡在 7.5–9.5 m 上）；进入 `MobilityKill` 或 `Disabled` 记 `tankImmobilized`；`Disabled` 记 `tankFireDisabled`。`TankBlockade` 在 `MobilityKill` 时仍然成立（停驶不等于解围）。

## 表现

- 炮管：Barrel 网格运行时挂到耳轴节点 `MissionTankGunTrunnion`（炮塔局部 `[0, 0.32, −0.6]`），俯仰 −10°…+20°，后坐 0.25 m；`gunMuzzle` 挂点跟着走。TZM 没有重导（`Type89DamageTest` 的 sha 不变）。
- 履带：克隆一份 Type89Track 材质挂 `MakeUvScrollPatch`（`Script_MaterialPatches`），u 向随车速滚动、原地转向左右反向；不加采样器。
- 位姿按车体轴取地面（旧版按世界 ±Z/±X，车头朝西时前后左右对不上）。
- VFX：主炮 `MUZZLE_KINDS.cannon` + `GroundDustRing`（地面尘环 1.3 s）；两条履带后方扬尘（车体局部）；排气常开 + 负载 ≥ 0.55 时一股黑烟。
- 震屏：`CameraShake.Rumble(distance, load)`（25 m 内，不进创伤桶，俯仰 ≤ 3 mrad）；30 m 内开炮一记俯仰冲击。
- 战斗：`Combat.Blast` 对 `Shell57`（战车 57 mm）墙后 6 m 内只给压制不掉血（`BLAST.occludedSuppression*`）。

## 声音（Step 2）

| 文件 | 作用 |
| --- | --- |
| `Script_TankAudio.mjs` | 控制器（无 three）：三条常驻循环跟车走、一次性音、03 先闻其声；映射是导出的纯函数（`TankLoopParams / CannonLayerWeights / ShellPassPoint`），node 里测 |
| `Script_Audio.mjs`「第一关战车」段 | 13 条合成回落配方 + `TankLoopSampleRecipe`（采样盖上后的循环，接口 `v.SetTank({gains, rates, subHz, subGain}, tau)`）；主炮进 `PROPAGATION_CUES / DUCK_ON / DEAFEN_ON`，炮口声按爆炸封遮挡（0.25），常驻循环封遮挡 0.5 |
| `Data_SfxSources.TANK_SFX` + `Script_TankAudioBake.mjs` | 素材、许可、切点；循环做接缝交叉淡化并多接 0.2 s（清单 `loopSpans`），只在中间那一整圈里转 |
| `Data_Tuning_Tank.audio` | 全部声音数值（层间电平、±12 % 变速、点火频率、手摇起停、三层交叉距离、掠过判据、节流、冷却滴答） |

- **常驻 ≤ 3 条**（契约 §6）：`tankEngine`（怠速 / 负载两层按转速等功率交叉，±12 % 变速；垫一层 30–70 Hz 点火脉冲 = rpm / 20，走音效总线，对白侧链不压它）、`tankTracks`（按车速，原地转向也响）、`tankTurret`（手摇棘轮，只在摇的时候响；停摇 50 ms 内收干净 —— 「咔嗒声停了 = 要开炮了」）。循环 `priority`，不会被偷；熄火后收掉。
- **一次性**：起步 / 刹车 / 原地转 / 倒车的履带尖啸（2.5 s 节流）；主炮近（≤ 25 m）/ 中 / 远（≥ 110 m）三层等功率交叉 + 按声源所在区的尾音（借机枪尾巴降调）；弹道离听者 ≤ 7 m 且飞过去了才排一声低速炮弹掠过；弹打装甲「当」（跳弹照旧由 Main 的 `Ricochet` 出）；观察窗关上 / 开舱盖；`Disabled`：熄火（咳两下、停）+ 炮塔卡死磨擦 + 4 s 后 50 s 的冷却滴答。
- 车载机枪：`FireVehicleBullet(..., { gunCue: "type11", gunOpts: { burst: 1, airCut: 2600, weaponClass: "mg" } })`（九一式车载机枪 = 十一年式车载版；隔着钢板，车外听是闷的）。其它调用不传就还是旧的 `type92`。
- 03「先闻其声」：阵位没夺下、车还没开进图时，引擎在 `path.waypoints[0]`（北面高地后面）怠速，5 s 渐起；开进图后是同一条 voice 接着跟车（不重起）。常驻循环的遮挡封顶 0.5：高地后面的车高频被挡、隆隆声照样翻过来。
- 声源尺寸 `sourceSizeM` 10 m（车长 5.7 m、118 hp 汽油机不是一个人那么响）：130 m 外比 5 m 口径亮 8 dB。
- 素材（全部是 Sonniss GDC 镜像的真车实录，另三条 SeedAudio）：发动机 = Pole Position 四号坦克 G 型（Maybach 水冷汽油机，与八九式甲同为水冷汽油机）车外稳态怠速 / 高转；履带 = 三号坦克车上履带近麦；手摇 = T-34-85 高低机手轮拟音；主炮近 = Bluezone 坦克炮、中 / 远 = Warfare Library 林地远处火炮两发；熄火 = 斯图亚特 M5A1；舱盖 = 虎 II / TKS；弹打装甲 = Gamemaster 子弹打厚金属 + Bluezone 重金属中板升调；卡死 = Kopeikin 干硬金属磨擦；履带尖啸 / 炮弹掠过 / 冷却滴答 = SeedAudio（第一轮「履带尖啸」直说三条全塌成宽带隆隆，改「生锈重铁门铰链」才出音调线）。每条的有声段 RMS、真峰值、<500 Hz 占比、可闻带电平与循环接缝跳变由烘焙脚本打印并写 `Audio/Sfx/_raw/Tank/Data_TankQc.json`。**没有人耳试听过**，只按数字与频谱图选的，请人工过一遍编辑器里的「战车」几条。
- 取证：`Debug.FirstLevelMission().tankBrain.audio`（循环数、每层有效电平与遮挡、一次性音计数、每发主炮用了哪几层）；专项探针 `Script_FirstLevelTankProbe.mjs`（见下）。

## 专项探针

`node Taierzhuang1938/Script_FirstLevelTankProbe.mjs`：开声音（`menu=0`）用真实输入跑 03→06，10 Hz 采样，写 `_shots/FirstLevelTankProbe/Data_TankProbe.json`：露面时刻 / 阶段 / 距离、那一刻玩家在不在车的视线里、引擎声比露面早多少秒；每发主炮的目标、种类、瞄准停顿、手摇停到开炮的间隔、落点、离玩家多远；机枪点射按阶段 / 种类；05 攻击路线（`FRONT_SORTIE.attackRoute`）每个点被炮塔 / 车体机枪指着的时间占比与 ≥ 2 s 的安全窗口；反应次数；毁伤序列；常驻循环数与各阶段平均电平（旁边给同距离一发三八式本体的电平作参照）。断言：零页面错误、先闻其声、循环 ≤ 3、每发主炮停顿 ≥ 1.2 s、两段毁伤、熄火后循环归零。然后摆位拍五张：露面剪影、驶出路弯、开炮尘环、攻击位看车侧后、熄火冒烟（`Scene_Tank*.png`）。`--no-photos` / `--photos-only`。

## 可破坏掩体

数据格式见 `Script_FirstLevelFrontBreakables.mjs` 文件头。每块墙预建各段网格；炮弹（伤害 ≥ `minDamage`）落在离墙面 `hitRadiusM` 内打掉一段：换可见性 + `AddSolid/RemoveSolid`，碎块走 `vfx.Impact`。布局里标 `dynamic:true` 的块不进静态合批（首选）；没标时运行时把静态合批里那块的顶点塌到墙脚、摘掉碰撞（临时演示用）。永远不可破坏：`RightNestRearWall`、`RightNestEastWall`、支沟、守军安全区（`NEVER_BREAKABLE`）。临时数据：`RightNestFrontRest` 西半段三段（缴获机枪架在正中，不悬空），`RightNestNorthRuin` 两段。`GAMEPLAY_DESTRUCTION_ENABLED` 仍为 false。

## 给第二波

- Space 的新路点换掉 `TANK_TEMP_PATH`（`new FirstLevelTankRuntime(runtime, { path, breakables })`）；新 `Data_FirstLevelFrontBreakables` 换掉 `FRONT_BREAKABLES_TEMP`。
- 护兵名单读 `MISSION_ENCOUNTERS.tank`（现在 2 人，槽位 4 个）；要满编需在名册里补到 4 人。
- 大脑的 `barks`（`turretTraverse / hatchShout / escortScatter / visionSlit / trackCut / tankDisabled`）现在只记进日志、没有台词 cue（`visionSlit / hatchShout` 已有机械声）；罗班长的预兆喊话、日军「车旁有人」需要 Voice 包出 cue 再接。
- 换路以后：`OffstagePoint()` 取新路的第一个路点，03 的「先闻其声」自动跟着走；新路起点离玩家的距离决定能不能听见（现路线 130–196 m）。
- 取证：`Debug.FirstLevelMission().tankBrain`（大脑快照、主炮每发的预兆时长与落点、机枪点射、反应、毁伤序列、掩体段数、露面时刻）。
