# 第一关 03–05 战车（2026-09-23 战车包）

接口冻结见 [分包契约](Data_FirstLevel0105Refactor20260923Contract.md) §5.7；这里写实现口径与接线，给第二波 Front 包与集成用。

## 模块

| 文件 | 作用 |
| --- | --- |
| `Script_FirstLevelTankBrain.mjs` | 纯规则大脑（无 three，node 可跑）：驾驶 / 炮手 / 机枪 / 反应 / 护兵槽 / 两段毁伤 |
| `Data_Tuning_Tank.mjs` | 全部数值（带出处）+ 临时路点 `TANK_TEMP_PATH`（现布局）+ 开关 `brainEnabled` |
| `Script_FirstLevelTankRuntime.mjs` | 接线层：世界 → 大脑（目标、视线、掩体沿、车体挂点、事实、许不许开火、护兵名单），大脑 → 世界（位姿、开火、护兵走位、事实、震屏、可破坏掩体） |
| `Script_FirstLevelFrontBreakables.mjs` | 可破坏掩体机制（分段体块）；临时数据 `FRONT_BREAKABLES_TEMP` 与永不可破规则 `NEVER_BREAKABLE_RULES` 在 `Data_Tuning_Tank.mjs` |
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
- 战斗：战车主炮这一发带 `FireShell(..., { occludedSuppression: true })`，`Combat.Blast` 对带开关的那一发墙后 6 m 内只给压制不掉血（`BLAST.occludedSuppression*`）。不按弹种认：别的关卡的九七式同样打 57 mm，口径不变。

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

## 2026-09-24 审查修复

两位审查者的发现逐条核过；改动都在本包文件与已有薄钩子里。

- **断履带以后不卡关**：`BundleResupplyOpen(tank, bundleTaken)`（大脑模块导出）—— 大脑接管时 `MobilityKill` 以后弹药屋照样能领集束弹（旧判据 `!immobilized` 会在第一颗断履带后把屋子关掉，两捆都没炸到位就死锁）。兜底：`MobilityKill` 且玩家手里 0 捆僵 `damage.luoFinishS`（30 s）→ 罗班长补刀：舱盖上一团零伤害的爆炸 + `ForceDisable("luoHatch")`（`LuoFinishDue`）。
- **「车解决了没有」一个判据**：`TankClearFact(tank)`（大脑接管 = `tankFireDisabled`，旧路径 = `tankImmobilized`）。`FrontBattle.UpdateSortie` 的带路人撤退腿、`FrontShow` 的「停了！口子能过！」都用它 —— 断履带时带路人留在攻击位、不喊「能过」。`BundleReturnCall` 的挤压判据改按水平位移（新挤压往西推，旧判据只认往南）。
- **05 的真实威胁**：打不死的剧情人物（`scriptEssential`）进目标表带 `essential`，权重 × `gunner.essentialScale`（0.12）—— 原来 05 的主炮全打 60–80 m 外守左机枪的何有田。攻击支路做成区域目标：路点表 `lanes[]`（`attackLane`：`FRONT_SORTIE.attackRoute` 起点东挪 4 m，领过集束弹才算），玩家进沟线 3.5 m 以内，沿线离他最近、按 3 m 取整的点就是区域目标（`LanePoint`），看不见轰沟沿（墙挡弹片只剩压制），站起来被看见就直接打人；预兆链不变。区域目标进了主炮最小射程就不再规划。
- **04 撤离不再被主炮打死**：剧本撤离窗口（04 `tankPositionPressured` 以后、`rightRearReached` 以前）玩家目标带 `damageCap = gunner.retreatDamageScale`（0.2）与 `weightScale 0.5`，落在他弹片范围（9.8 m）里的每一发只按上限伤人。目标离上一发瞄准时的位置挪开 `gunner.moveResetM`（4 m）以上，散布回到第一发（不再越打越准地追着撤退的人）。
- **掩体真被一截截打掉**：主炮开火带 `coverDamage`（整发 85）—— 警告弹 / 撤离窗口只是不要人命，墙沿照样掉一截。
- **可破坏掩体**：永不可破改成按体块名 + 按区域（`NEVER_BREAKABLE_RULES.zones = ["rightRear", "withdrawalGap"]`，`MISSION_LAYOUT.zones` 的语义 id；原名单里 `SapTrench / GuardSafeZone` 两个名字布局里根本没有）。临时数据挪到 `Data_Tuning_Tank.FRONT_BREAKABLES_TEMP`。`Dispose()` 把 `TakeOverStatic` 塌掉的静态顶点与摘掉的碰撞盒还回去（读档重建任务运行时而战场不重建时墙不会永久消失）。
- **开炮尘环**：两圈（外圈铺开、内圈堆高）、34 粒（下限 22，低画质也减不没）、不透明 0.55、终态 2.4–3.4 m，数值在 `view.groundRing`。
- **进场闸** `TANK.entry`：临时路线起点离阵位 130 m、**有视线**（能不能看见全靠雾，原注释「高地后面看不见」是错的）；阵位夺下后只在起点对玩家没视线、或在他朝向 ±1.15 rad 以外（屏幕外）时开进图，最多等 30 s。
- **开销**：`Disabled` 熄火完以后不再每帧拼世界（`World / Targets` 与三次炮口取点），只让大脑走时钟；护兵锚点挪 1.5 m 才重下 `Defend`（原 0.4 m ≈ 巡航时每人 5 Hz）；停车时锚点推到 `ai.covers.Nearby` 的路边掩体点。
- **喊话接口**：`TANK.barkCues`（bark id → 台词 cue，同一条隔 8 s）；现在全是 `null`，等 Voice 包出「炮塔转过来了！」「履带断了！还在打！再补一捆！」等 cue 后只填表。
- **驱动器**：`DriveBundleThrow` 默认 `aim:"farTrack"` —— 越过车顶扔到远侧履带边（车体挡弹片；近侧那一版爆点离投掷者 4 m，每颗自伤 40–52 血），弧线余量按「车体外廓内 = 车顶」算；`"deck"` 扔上后甲板。返回 `selfBlast`，campaign 断言 ≤ 10。后甲板部位 `engineDeck` 顶到 2.62 m：车的碰撞盒是一整只 2.56 m 高的盒子，扔上车顶的那捆停在盒顶。
- **探针**：`options.tankProbe` 下断履带后在攻击位蹲 9 s 记车在 `MobilityKill` 里朝投掷者开了几次火，第二颗扔上后甲板验发动机那一路；新断言：玩家真在攻击支路上的那段时间里他脚下那段沟被炮塔 / 车体机枪指着 ≥ 25%、05 主炮打剧情人物 ≤ 1 发、05 车体机枪 ≥ 1 串、04 至少打掉一段掩体、第二颗 = 发动机部位；卡住时写 `Data_TankProbeStuck.json`（按键、姿态、速度、周围实体与人、附近弹坑）。`--frame-ab`：同页交替 A/B（大脑 vs 旧路径）量帧时间与音频节点。

## 2026-09-24 审查修复第二轮（实跑验证）

- **装填时照样摇炮塔**：换了目标，炮手在装填时就开始摇向它（装填手装弹、炮手摇手轮）；瞄准停顿仍然只在装填完、计划好、炮塔对准以后才算（≥ `layMinS`，TankBrainTest 11d''）。原来 05 换到攻击支路以后炮塔在 reload 里干等 4 s，人已经走完那段沟。
- **盯沟口**：`lanes[].watch`（`rangeM` 30、`weight` 1.6）。领了集束弹、人还在沟线外 30 m 以内（取弹沟 / 回程）时，区域目标取沟口，车先把炮塔摆过来、按节奏轰沟口的沟沿；车解决了（`TankClearFact`）就不再盯。`LanePoint(lane, p, radiusM)` 多了可选半径。
- **护兵撤回**：车彻底哑火以后，护兵沿战车路点倒着撤回路线起点（`escorts.retreatArrivalM / retreatSpeedMps`），到了再交还普通 AI 就地防守。原来就地交还：喊人收过来的护兵停在阵位边 (27.7, −136.8)，看得见缺口、没被压制，`InfantryBlockade` 一直成立，最后一批守军 240 s 撤不出去（03→06 实跑红）。
- **驱动器**：远侧履带瞄点从车体外沿 1.2 m 挪到 1.9 m，弧线采样 20 → 60 点（3 次里 2 次擦着远侧车顶边落上后甲板，一颗直接哑火、跳过了断履带）；阵位里等（03 等进 04、04 等压住阵位）改成 `HoldNest`：躲手榴弹照常躲，躲完离座位 3 m 以上就走回来（原来躲完一直站在阵位东墙外，死在 (35.4, −147.5)）。
- **帧时间 A/B**（`--frame-ab`，同页交替，每块 30 帧 × 8 轮，开声音）：战车接线层自己的 `Update` 每帧 p50 0.3–0.4 ms、p95 0.6–0.9 ms（三次一致）。整帧 p95 比值（大脑 / 旧路径）：机器较空那次 04 入口 1.12、04 封口 1.06；另两次与别的包的 GPU 测试同时跑，整帧里有 0.5–2.2 s 的外来卡顿（两边都有，落在哪边就是哪边高：3.14 / 0.69、0.98 / 6.0），不能作数。音频活跃节点峰值：大脑 243–282、旧路径 220–259（+23，三条常驻循环加一次性音）；旧路径本身就超过契约 §6 写的 120。
- **还没解决、不归本包**：03 拖得久（`frontRifleDefense` 170 s 才记，正常 73 s）时，日军机枪波（`MachineGunAttack0_*`）一路打到左机枪何有田身边 (−32, −150) 进入 contact，何有田打不死，两边一直僵着，这几个人看得见缺口、没被压制 → `InfantryBlockade` 不解除，`lastGuardsWithdrawn` 等不到。关掉大脑的对照跑（同一流程，`tankRuntime = null`）时间线正常的那次通过。归 Front / 敌军 AI。

## 给第二波

- Space 的新路点换掉 `TANK_TEMP_PATH`（`new FirstLevelTankRuntime(runtime, { path, breakables })`）；新 `Data_FirstLevelFrontBreakables` 换掉 `FRONT_BREAKABLES_TEMP`。
- 护兵名单读 `MISSION_ENCOUNTERS.tank`（现在 2 人，槽位 4 个）；要满编需在名册里补到 4 人。
- 大脑的 `barks`（`turretTraverse / hatchShout / escortScatter / visionSlit / trackCut / tankDisabled`）经 `TANK.barkCues` 接 `Say`，表里现在全是 `null`（`visionSlit / hatchShout` 已有机械声）；Voice 包出 cue 后只填表。
- 换路以后：`lanes[]`（区域火力沟线）、`scan[]`、`entry`（起点要真有遮挡再加断言）都跟新路一起换；`NEVER_BREAKABLE_RULES.zones` 按 `MISSION_LAYOUT.zones` 的语义 id 认，zone id 不变就跟着新布局走。
- 换路以后：`OffstagePoint()` 取新路的第一个路点，03 的「先闻其声」自动跟着走；新路起点离玩家的距离决定能不能听见（现路线 130–196 m）。
- 取证：`Debug.FirstLevelMission().tankBrain`（大脑快照、主炮每发的预兆时长与落点、机枪点射、反应、毁伤序列、掩体段数、露面时刻）。
