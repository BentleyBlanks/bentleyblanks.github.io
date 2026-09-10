# 断肢系统（Dismemberment）技术方案与验收口径

> 2026-09-10 设计稿。目标：给滕县 FPS 一套**通用**的人物断肢系统，对标 3A（Sniper Elite 5 / Gears / DOOM Eternal / Dead Space 重制 / Darktide 的做法），
> 复用本项目已有的蒙皮 GLB、分部位命中体、Rapier、粒子池与贴花池；并配一座独立测试关卡 `?gore=1` 把效果单独拿出来看。
> 本文件是唯一口径：规则在 `Script_Dismemberment.mjs`，数值在 `Data_Tuning_Gore.mjs`，视觉/物理在 `Script_CharacterGore.mjs`，测试场在 `Data_GoreRange` / `Script_GoreRange*`。
> §10 是实装记录，实施者交付时补写。

---

## 0. 一句话

**打死人的那一发（或那一刀、那一炸）按部位与武器种类决定要不要卸掉一段肢体：身体网格当场删掉那段三角形、关节上盖一个断面、那段肢体烘成静态网格挂上 Rapier 胶囊飞出去、断口喷 2–3 秒动脉血、落点留渍；整套可复现、有预算、可一键关。**

## 1. 对标：3A 怎么做，我们取哪些

| 3A 常见做法 | 取舍 |
| --- | --- |
| 部位级切割（per-limb），不是整具 gib 云 | **取**。肢体 id 与现有 `CHARACTER_HITBOX_PROFILE` 的 shape id 一一对应（`upperArmL/forearmL/thighL/calfL/head` 与右侧同名）。躯干不切（不做腰斩）。 |
| 身体上用 mask 把肢体藏掉 + 断面盖（cap） | **取，但不用 shader mask**：本项目影子走 `customDepthMaterial`、预通道走 overrideMaterial，片元 discard 管不到影子与预通道（残肢会继续投影）。改为 **CPU 重建 index**（只删三角形，属性共用），三条 pass 天然一致，零新 program。 |
| 断肢是独立刚体，带碰撞、会滚 | **取**。Rapier 动态胶囊，组 `DEBRIS`，只与 `WORLD|DEBRIS|RAGDOLL` 碰，不推活人。 |
| 逐关节 ragdoll | **不取**（`Script_Physics.MakeCorpse` 头注与 `Actor.PoseRagdoll` 的既有决定）。躯体仍走确定性倒地姿态；只有飞出去的那段肢体是刚体。 |
| 活着缺肢、爬行 | **不取**（没有对应动画素材；AI 状态机不扩）。**断肢只发生在本来就致死的那一发上，绝不改变任何人的生死**（六类来源全部 requiresKill；第一版给爆炸开的「未致死也卸、卸了抬成致死」把炮击近失弹旁的同班战友炸死、触发第一关开场的失败规则，已收回，见 §11.6-6）。 |
| 动脉喷血 / 血雾 / 地面血渍 / 血迹拖痕 | **取**。喷血是挂在骨头上的**持续源**（像 `smokeSources`），不是一次性 Blood。 |
| 全身 gib（爆炸把人炸成碎块） | **部分取**：爆炸近炸 = 多段肢体同时卸（最多 4 段）+ 更大血雾；不做躯干碎裂。 |
| 内容开关（gore on/off） | **取**。`?gore=0` / `Debug.Gore.SetEnabled(false)` / `Data_Tuning_Gore.ENABLED`。玩家设置面板的开关若能沿用现有布尔项模式则一并加，否则留 URL 参数。 |
| 预算池（同屏肢块上限、FIFO 回收） | **取**，按画质分档。 |

## 2. 分层与文件

```
规则层（纯 Node，零 three）
  Data_Tuning_Gore.mjs        肢体表 / 判定表 / 预算表 / 开关     ← 全部数字只在这里
  Script_Dismemberment.mjs    判定 + 顶点分类 + index 过滤 + 预算环   ← Script_DismembermentTest 纯 Node 直测
视觉/物理层（three + Rapier）
  Script_CharacterGore.mjs    GoreSystem：切身体、盖断面、烘肢块、挂刚体、喷血、回收
  Script_Physics.mjs          + MakeLimbBody()
  Script_Vfx.mjs              + BloodSpurt()（跟骨头的持续血源）+ BloodBurst()
接线
  Script_Ai.mjs               Soldier.TakeHit 带 info；Kill 触发 gore；尸体 LOD 不换远景层；Remove 释放
  Script_Combat.mjs           Blast / Melee 把 kind / falloff / weaponId / mode 传进 TakeHit
  Script_Main.mjs             MarchBullet 把 shape.id 传下去；建 GoreSystem；WarmActorShaders 预热肢块材质
  Script_CharacterModel.mjs   Raycast 结果已带 shape（不改契约，只确认 shape.id 可用）
测试场
  Data_GoreRange.mjs / Script_GoreRangeField.mjs / Script_GoreRange.mjs / Script_GoreLab.mjs
  Data_Text_Range.mjs（面板与路牌文案）
测试
  Script_DismembermentTest.mjs（纯 Node）/ Script_GoreRangeTest.mjs（真浏览器）
```

## 3. 数据：`Data_Tuning_Gore.mjs`（纯数据，带出处注释）

```js
export const ENABLED = true;                 // 内容总闸；?gore=0 与 Debug.Gore.SetEnabled 运行时覆盖
export const LIMBS = Object.freeze({
  // id 与 CHARACTER_HITBOX_PROFILE 的 shape id 同名；bones 是 Biped 骨名的子树匹配（GLTFLoader 会删点号，这批骨名本来没有点号）
  upperArmL: { bones: /^Bip\d+ L (UpperArm|Forearm|Hand|Finger)/, joint: "upperArmL", parentJoint: "clavicleL|chest", axisTo: "forearmL", capRadius: 0.075, mass: 3.5, halfLength: 0.28, contains: ["forearmL"] },
  forearmL:  { bones: /^Bip\d+ L (Forearm|Hand|Finger)/,           joint: "forearmL",  axisTo: "handL",   capRadius: 0.060, mass: 1.8, halfLength: 0.24 },
  upperArmR / forearmR 同上
  thighL:    { bones: /^Bip\d+ L (Thigh|Calf|Foot|Toe)/,           joint: "thighL",    axisTo: "calfL",   capRadius: 0.10,  mass: 10,  halfLength: 0.40, contains: ["calfL"] },
  calfL:     { bones: /^Bip\d+ L (Calf|Foot|Toe)/,                 joint: "calfL",     axisTo: "footL",   capRadius: 0.075, mass: 4.5, halfLength: 0.30 },
  thighR / calfR 同上
  head:      { bones: /^Bip\d+ (Head)$/,                           joint: "head",      axisTo: null,      capRadius: 0.06,  mass: 4.5, halfLength: 0.11, sphere: true },
});
// 判定：按伤害来源。chance 是「这一发已经致死」前提下的断肢概率；六类来源全部 requiresKill —— 断肢不改生死（§11.6-6）。
export const SEVER_RULES = Object.freeze({
  bullet:  { chance: { limb: 0.06, head: 0.0 }, requiresKill: true,  minDamage: 60 },   // 步枪弹极少卸肢（史实/3A 写实向共同口径）
  hmg:     { chance: { limb: 0.30, head: 0.12 }, requiresKill: true, minDamage: 60 },   // 九二式 / 车载重机枪
  // 爆炸按 falloff 分档（1 m ≈ 0.91 / 2 m ≈ 0.83 / 3 m ≈ 0.75 / 3.7 m ≈ 0.70，木柄手榴弹 6.5 m × radiusScale 1.9）：
  // 一米圈最多四段、两米圈两段、三米圈一段、再远不断。2026-09-10 实装时从常数 maxLimbs/extraLimbChance 改成 tiers。
  blast:   { chance: { limb: 0.95, head: 0.35 }, requiresKill: true, minFalloff: 0.70,   // 只在致死的那一发上卸（§11.6-6）
             tiers: [{ minFalloff: 0.88, maxLimbs: 4, extraLimbChance: 0.85 }, { minFalloff: 0.80, maxLimbs: 2, extraLimbChance: 0.6 }, { minFalloff: 0.70, maxLimbs: 1, extraLimbChance: 0 }] },
  blade:   { chance: { limb: 0.80, head: 0.30 }, requiresKill: true,  modes: ["slash", "cut"], pool: "blade" },    // 大刀劈砍只砍上半身
  thrust:  { chance: { limb: 0, head: 0 } },                                                          // 刺刀不卸肢
  bash:    { chance: { limb: 0, head: 0 } },
});
export const BUDGET = Object.freeze({
  low:    { maxParts: 6,  partLifeS: 12, spurtS: 1.6, spurtRate: 18, decalsPerSever: 1, restToStaticS: 2.5 },
  medium: { maxParts: 10, partLifeS: 20, spurtS: 2.4, spurtRate: 26, decalsPerSever: 2, restToStaticS: 2.5 },
  high:   { maxParts: 16, partLifeS: 30, spurtS: 2.8, spurtRate: 32, decalsPerSever: 2, restToStaticS: 2.5 },
  ultra:  { maxParts: 24, partLifeS: 45, spurtS: 3.0, spurtRate: 36, decalsPerSever: 3, restToStaticS: 2.5 },
});
export const LAUNCH = Object.freeze({ bullet: { speed: [3.5, 5.5], up: 1.2, spin: 9 }, hmg: {...}, blast: { speed: [6, 12], up: 3.5, spin: 14 }, blade: { speed: [2.5, 4], up: 1.0, spin: 6 } });
// 没有命中体 id 时的候选段：AI 打 AI 抽到的粗部位 arm / leg 限在对应四段；大刀劈砍只砍两条胳膊；头永远不进随机池。
export const LIMB_POOLS = Object.freeze({ arm: [...], leg: [...], blade: ["upperArmL", "forearmL", "upperArmR", "forearmR"] });
```

数值都是**推定**，实施时按测试场实拍微调；每个字段带一句出处或理由。

## 4. 规则层：`Script_Dismemberment.mjs`（纯 Node）

```js
export const LIMB_IDS;                                  // Object.keys(LIMBS) 的冻结数组
export function LimbSubtree(limbId) → 字符串数组         // 含 contains 递归展开
export function ClassifyVertices(boneNames, skinIndex, skinWeight, vertexCount) → Uint8Array
   // 每个顶点取权重最大的骨 → 匹配 LIMBS[*].bones；命中最深的肢体（forearm 优先于 upperArm）；0 = 躯干/不切
export function FilterIndex(index, vertexLimb, severedLimbIds) → { body: Uint32Array, parts: Map<limbId, Uint32Array> }
   // 三角形三个顶点任一属于已卸肢体集 → 从 body 移除；三个顶点全属同一肢体 → 进该肢体的 index；跨肢体/跨断口的三角形丢弃（断面盖遮住）
export function ResolveSever({ part, shapeId, kind, weaponId, mode, damage, wouldDie, falloff, rng }) → { limbs: string[], forceKill: boolean, reason: string }
   // kind: "bullet" | "hmg" | "blast" | "blade" | "thrust" | "bash" | "vehicle"
   // rng 是调用方给的确定性随机；一次调用最多消耗固定次数的 rng，方便回放。**不许借 Soldier.rnd**（那是 AI 的流，见 §11.6-5），GoreSystem 按士兵 id 另开一条 Mulberry32
   // blast：以 shapeId 命中肢体为首选，其余按 tiers[falloff].extraLimbChance 抽，最多 tiers[falloff].maxLimbs；未给 shapeId 时按 BLAST_WEIGHT（腿 2 / 胳膊 1）加权挑
   // 没有 shapeId 的其它来源：规则的 pool（blade）> 粗部位 part（arm / leg）> 八段全池；头只在 shapeId/part 报 head 时按 chance.head 骰
export function PickMeleeShape(origin, direction, shapes, poolIds = LIMB_POOLS.blade) → shapeId | null
   // 白刃是扇形判定、没有射线：从攻击者眼位沿挥砍方向，命中体（rig.GetHitboxes()）里离这条线最近的那条胳膊段就是挨刀的。纯几何
export class GoreBudget { constructor(max); Acquire(record) → 被挤出的旧 record | null; Release(record); get size }
```

规则纪律：零 `Math.random`；`forceKill` 只在 Debug 的 force 通道上出现（正片六类来源全部 requiresKill，断肢不改生死）；`ENABLED=false` 时 `ResolveSever` 一律返回空。

## 5. 视觉层：`Script_CharacterGore.mjs`

### 5.1 一次 Sever 做什么

```
GoreSystem.Sever(soldier, limbIds, { direction, kind, point })
  1. rig = soldier.actor.characterRig；无 rig（程序化回退 / 百姓）→ 直接 return（不报错）
  2. 首次：为该 rig 的每个 SkinnedMesh 建 GoreRecord
       · vertexLimb = ClassifyVertices(...)   —— 按 **模型 id** 缓存（十套 GLB 各算一次，clone 共享几何）
       · body geometry 替换为「共享属性 + 私有 index」的新 BufferGeometry（不 clone 属性数组）
  3. FilterIndex → 写回 body index（setIndex），computeBoundingSphere 一次
  4. 断面盖（cap）：程序化几何（一片圆盘 + 中央骨茬小圆柱 + 外圈暗红环，≤ 120 三角），
       挂在 joint 骨上，轴向 = joint→axisTo 的方向，半径 = capRadius × 世界缩放；材质两只：flesh / bone（MaterialLibrary 或简单 MeshStandardMaterial，全局各一份，warm 一次）
  5. 肢块（part）：把该肢体的顶点用 `mesh.applyBoneTransform(i, v)` 烘到当前姿势（参考 Script_ActorCrowd.BakeSkinnedPose 的账），
       变换到 **joint 骨的局部系**，建静态 BufferGeometry（position/normal/uv，index = parts.get(limbId) 重映射）；
       材质 = Script_Materials.CloneShadedMaterial(源材质)（非蒙皮变体，见 §7 预热）；断口那头也盖一个 cap（同一几何，反向）
       · 世界位姿 = joint 骨世界矩阵；速度 = direction × LAUNCH.speed + up；角速度 = 随机轴 × spin（用断肢自己的 goreRnd，不是 soldier.rnd）
       · 刚体 = physics.MakeLimbBody({ position, quaternion, velocity, angularVelocity, halfLength, radius: capRadius, mass })
       · 预算：GoreBudget.Acquire；被挤出的旧 part 立刻 Dispose
  6. VFX：vfx.BloodBurst(point, direction, 1.6)（一次性）+ vfx.BloodSpurt(capNode, axis, { seconds: spurtS, rate: spurtRate })（跟骨头）
       + 肢块上一个弱 spurt（seconds 0.8）；地面贴花由 Blood 自带的地渍负责，spurt 每 0.5 s 在脚下补一小片，封顶 decalsPerSever
  7. soldier.gore = record；record.limbs.add(limbId)
```

### 5.2 每帧 `Update(dt, camera)`

- 每个 part：刚体 → mesh 位姿同步；解析地形走 `physics.ClampToGround(body, dt, { lift: radius })`（与尸体同一条路）；
  `linvel` 与 `angvel` 都小于阈值持续 `restToStaticS` 后 **RemoveBody 留网格**（省物理）；超过 `partLifeS` 或被预算挤出 → Dispose。
- 血源由 `Script_Vfx` 自己按 `smokeSources` 的方式更新（每帧读 node 世界位置），GoreSystem 只负责登记与到期注销。
- 视锥外的 part 不做任何事（three 自己 cull）。

### 5.3 释放

`ReleaseSoldier(soldier)`：`AiDirector.Remove` 与换关 `Dispose` 都调。还原 body 几何为共享原件（把私有 geometry.dispose()，mesh.geometry 指回缓存的源几何）、移除 caps、Dispose 该士兵的 parts 与血源。**同一具 rig 在对象池里复用时必须还原**，否则下一个兵出生就缺胳膊。

### 5.4 与远景层 / 尸体的关系

- `Script_Ai` 的 LOD 循环：`s.gore` 存在 ⇒ 不换远景层（远景层是按姿势桶烘的整人，会把肢体长回来）；超过 `corpseCrowdMaxM` 照旧剔除。
- `Actor.Ragdoll` / `PoseRagdoll` 不改：被卸掉的骨头照常动，只是身上没有三角形。
- `Script_FirstLevelMissionAftermath` 的烘焙尸体（八种姿势实例化）**不在本系统范围**。

## 6. 物理：`Script_Physics.MakeLimbBody`

```js
MakeLimbBody({ position, quaternion, velocity, angularVelocity, halfLength, radius, mass,
               friction = 0.9, restitution = 0.15, linearDamping = 0.25, angularDamping = 0.6 })
  → 动态胶囊（沿局部 Y），setCcdEnabled(true)（薄墙不穿），collisionGroups = InteractionGroups(GROUP.DEBRIS, GROUP.WORLD | GROUP.DEBRIS | GROUP.RAGDOLL)
  加入 this.dynamics；调用方负责 RemoveBody。
```

## 7. 着色器与预算纪律（3A 的「看不见的那一半」）

- **零新 program 变体**给活人：身体只换 index，材质不动。
- **肢块材质**是同一份人物材质的非蒙皮克隆：这是一份新 program（skinning define 不同）。第一次断肢不能在战斗里现编（`taierzhuang-respawn-shader-stall` 那条账）：`WarmActorShaders` 里给每种 kind 的每份人物材质各摆一个非蒙皮代理网格 + 两只 cap 材质一起编；测试场 `Script_GoreRangeField` 建场时也摆。回归口 `Script_RespawnShaderWarmTest` 现有断言不能变红。
- 采样器数不变（克隆同一份材质）；`Script_SamplerBudgetTest` 自然覆盖。
- draw call：每段 part 1 draw + 每个 cap 1 draw；`BUDGET.maxParts` 就是上限账。不进 BuildSink（它们是动态件）。
- 内存：ClassifyVertices 结果按模型缓存；私有 index 每具最多 ~30 KB。
- 可复现：所有随机来自按士兵 id 派生的独立 `goreRnd`（Mulberry32(HashString("gore|id|side"))），**不碰 `soldier.rnd`**；`Script_GoreRangeTest` 同一 seed 两次 Sever 的 part 初速一致。

## 8. 接线契约

### 8.1 `Soldier.TakeHit(damage, part, direction, info = {})`

`info`: `{ kind, shapeId, weaponId, mode, falloff, point }`。流程：

```
if (!alive) return false
mult 照旧 → health -= damage*mult
wouldDie = health <= 0（scriptEssential 照旧钳 1 → wouldDie=false）
sever = director.ctx.gore?.Resolve(this, { part, ...info, damage: damage*mult, wouldDie })   // 可能为空
if (sever?.forceKill) health = 0
if (health <= 0) return Kill(direction, sever)
… 受伤分支照旧
```

`Kill(direction, sever = null)`：状态与掉落照旧；`actor.Ragdoll` 之后 `if (sever?.limbs.length) director.ctx.gore.Sever(this, sever.limbs, { direction, kind: sever.kind, point: sever.point })`；deathPush 在断肢时乘 1.6（被炸飞的人多退半步）。

### 8.2 调用方补 info

| 调用点 | info |
| --- | --- |
| `Script_Main.MarchBullet` → `TryFire` / `FireVehicleBullet` / `FireEmplacedShot` | `{ kind: weapon.rpm ? "hmg" : "bullet", shapeId: boneHit.shape.id, weaponId, point }`（MarchBullet 结果对象加 `shape` 字段） |
| `Script_Combat.Blast` | `{ kind: "blast", falloff, point: position }`（shapeId 留空，规则层按爆心挑） |
| `Script_Combat.Melee` | `{ kind: weapon.kind==="melee" ? "blade" : mode, weaponId, mode, shapeId: PickMeleeShape(玩家眼位, direction, rig.GetHitboxes()), point: at }` |
| `Script_MeleeCombat` 宿主 `Damage` | `{ kind: attackerWeapon 是大刀 ? "blade" : "thrust", mode, shapeId: PickMeleeShape(攻击者眼位/头骨, 朝目标胸口, rig.GetHitboxes()) }` |
| `Script_Ai` AI 打 AI（3611 行那一掷） | `{ kind: s.weapon.rpm ? "hmg" : "bullet", weaponId }` |

玩家本人永远不进本系统（第一人称）。

### 8.3 `Debug.Gore`（所有关卡都挂）

```js
window.Taierzhuang.Debug.Gore = {
  State()                       → { enabled, quality, parts: [{ id, limb, soldierId, at:[x,y,z], resting, ageS }], severed: [{ soldierId, limbs }], budget: { max, live }, spurts },
  Sever(soldierId, limbId, dir?) → 直接对一名士兵执行（走 Kill(direction, {limbs:[limbId], kind:"debug"})，与正片死亡链同路），返回 State()
  SetEnabled(bool), SetForce(kind|null)   // Force：下一发命中无论骰子如何都断（测试场用；kind 决定用哪条 LAUNCH）
  Reset()                       → 释放全部 part / 血源
}
```

## 9. 测试关卡 `?gore=1`（断肢测试场）

- **入口**：`Data_GoreRange.mjs` 导出 `GORE_RANGE_ID = "GoreRange"`、`GORE_RANGE_PHASE`（`sandbox:true, sandboxKey:"gore", sandboxGlyph:"肢"`，`sky:"testSceneDay"`，`ambientAircraft:false`，`loadoutOverride` 给汉阳造 + 大刀 + 六枚手榴弹 + 无限备弹），`GORE_RANGE_WORLD` 选一片与现有五个测试场不重叠的坐标（例如 x 3300–3380 / z 3300–3370），解析平地 y=0。
- **场地**（`Script_GoreRangeField.mjs`，与 `RangeField` 同一套战场接口，BuildSink 合批，路牌走 Canvas atlas，文案进 `Data_Text_Range`）：
  1. **枪线**：射击位胸墙 + 10 m / 25 m 两排各 5 名**木桩兵**（`dummy:true`，ija，站姿），脚下牌子写编号；
  2. **炸坑**：一圈 6 名木桩兵围一个画好的爆心，牌子标 1 m / 2 m / 3 m 环；
  3. **刀桩**：3 名木桩兵站在台上，齐胸高台沿，玩家拿大刀够得着；
  4. **观察台**：一块 0.6 m 高的台子供退后看全局，后墙一面白板当截图背景。
- **面板**（`Script_GoreLab.mjs`，照 `MeleeLab` 的 DOM/事件纪律，`.goreLab` 样式进 `Style_Game.css`，隐藏 HUD 顶栏）：
  - 「下一发必断」开关（`SetForce`）、「重置木桩」（重新 Spawn 全部木桩，Reset gore）、「引爆炸坑」（`combat.Blast` 在爆心，`byPlayer:false`，kind "grenade"）、「慢动作 0.2×」（改 `state.timeScale` 或 StepFrames 的 dt 倍率，按现有暂停/慢放口径接）、「随机卸一段」（对准星指着的兵 `Sever`）；
  - 每肢体一个按钮（对准星目标）；
  - 实时读数：live parts / budget、caps、血源数、`renderer.info.render.calls` 相对场景基线的增量、上一帧 ms。
- **Debug**：`Debug.GoreRange = { State, Reset, Detonate, Target() }`。

## 10. 测试与验收

### 10.1 `Script_DismembermentTest.mjs`（纯 Node，毫秒级）
- `ClassifyVertices` 在合成骨名表上：手指顶点归 forearm、脚趾归 calf、Spine 归 0；
- `FilterIndex`：合成三棱柱网格，卸一段后 body 三角数 + part 三角数 + 丢弃数 = 原三角数；跨断口三角形被丢弃；
- `ResolveSever`：同 seed 同结果；bullet 未致死永不断；blast falloff<minFalloff 不断、≥ 时最多 maxLimbs；thrust/bash 永不断；`ENABLED=false` 全空；
- `GoreBudget` FIFO：第 max+1 个 Acquire 返回最老的一条；
- `Data_Tuning_Gore` 每条 LIMBS 的 id 都在 `CHARACTER_HITBOX_PROFILE` 里有同名 shape（import Script_CharacterModel 会拉 three —— 改为把 shape id 表抽成纯数据 `Data_CharacterHitbox.mjs` 或在测试里读源码正则，二选一，不许为此让规则层 import three）。

### 10.2 `Script_GoreRangeTest.mjs`（真浏览器，`?gore=1&shot=1&manual=1&quality=medium&scale=small`）
1. 开机：`Taierzhuang.Debug.Gore` 与 `Debug.GoreRange` 存在；木桩数正确；
2. `Debug.Gore.Sever(id, "forearmL")`：该兵 body index 三角数下降且下降量 == part index 三角数 + 丢弃数（从 State 读）；场景里出现名为 `GorePart_forearmL_*` 的 Mesh 与 `GoreCap_*`；360 帧后（`restToStaticS` 2.5 s 之后）part 的 y ≈ 地面 + radius（±0.05）且 `resting=true`；士兵 `renderLod` 在 40 m 外仍是 detail（不换远景层）；
3. 真枪链：`SetForce("bullet")` → 玩家瞄准 10 m 木桩的左前臂（用 `GetHitboxes` 取该 shape 的世界中点定 yaw/pitch）→ `Debug.Mouse(0)` 开火 → 该兵 dead 且 `severed` 含 forearmL，`Force` 自动清空；
4. 爆炸链：`GoreRange.Detonate()` → 1 m 环上的木桩 severed ≥ 2 段，3 m 环上的 ≤ 1 段；
5. 大刀链：`SetForce("blade")` → 走到刀桩前 → 左键 → 该兵 severed 含 upperArm/forearm/head 之一；
6. 预算：连续 Sever 超过 `BUDGET.medium.maxParts` 段 → live parts == maxParts；
7. `SetEnabled(false)` → Sever 返回空且 body 三角数不变；
8. 释放：`GoreRange.Reset()` 后所有士兵 body 三角数回到原值、场景里无 GorePart/GoreCap；
9. 截图：`_shots/GoreRange/` 落三张（断肢瞬间 / 落地 / 炸坑），并做像素证据：在 part 的屏幕投影包围盒内，Sever 前后差异像素 > 200（`visible-flag-is-not-visible` 那条教训：装上了得看得见）。
10. 无 pageerror / console error。

### 10.3 登记
- `Script_TestRunner.mjs`：`testDefs` 加两条；`combat` 域 tests 加 `DismembermentTest`、`GoreRangeTest`；`changedDomainRules` 加 `{ domain: "combat", pattern: /Gore|Dismember/i }`；`Script_TestRunnerTest` 过。
- `index.html` import map：全部新模块登记并带 `?v=`，改过的老模块抬戳；`Script_ModuleGraphTest` 过。
- `Data_Text_Range.mjs`：面板/路牌文案进表，`GATED_MODULES` 加 `Script_GoreRangeField.mjs`、`Script_GoreLab.mjs`、`Script_GoreRange.mjs`；`Script_TextTest` 过。
- `Data_Tuning_Graphics.QUALITY_PRESETS` 不加键（预算表按 quality 名在 `Data_Tuning_Gore.BUDGET` 里查），`Script_PostFrameGraphTest` 不受影响。
- `docs/Data_AgentReference.md` 路由表加「断肢」一行（战斗组）；本文件 §11 写实装记录。
- 回归门：`node Taierzhuang1938/Script_TestRunner.mjs --changed=origin/master --profile=prepush --fail-fast` 无新增红；`Script_RespawnShaderWarmTest`、`Script_SamplerBudgetTest`、`Script_MeleeQteTest`、`Script_DamageTest`、`Script_RangeTest` 定向再跑一遍。

### 10.4 验收（由设计者做，不由实施者自评）
- 本地 `?gore=1` 实拍：枪打前臂 / 大腿 / 头（force）、手榴弹近炸、大刀劈砍各一次；看断面朝向对不对、肢块有没有穿地或飘空、喷血方向是否沿断口轴、影子里没有残肢、远处（40 m）尸体不长回肢体；
- `?whitebox=p012` 正片开一局：前沿打死几个人不报错、帧时间无可见突刺（Profiler 面板 GPU/CPU 各看一眼）、`?gore=0` 一段肢体都不掉。

## 11. 实装记录

> 2026-09-10 交付**核心层**（规则 / 视觉 / 物理 / VFX / 接线 / 纯 Node 测试）。测试场 `?gore=1`
> 由另一路并行交付，本节只记核心层。提交号由验收者落。

### 11.1 落地的文件

| 文件 | 状态 | 说明 |
| --- | --- | --- |
| `Data_Tuning_Gore.mjs` | 新建 | §3 的四张表 + `KIND_ALIASES` / `LIMB_BODY` / `CAP` / `BLOOD` / `DEATH_PUSH_SCALE`；纯数据零 three |
| `Script_Dismemberment.mjs` | 新建 | `LIMB_IDS` / `LimbSubtree` / `LimbForBone` / `ClassifyVertices` / `FilterIndex` / `ResolveSever` / `GoreBudget`，另加 `SetGoreEnabled` / `IsGoreEnabled`（`?gore=0` 与 `Debug` 的运行时覆盖位）；纯 Node |
| `Data_CharacterHitbox.mjs` | 新建 | `CHARACTER_HITBOX_PROFILE` 从 `Script_CharacterModel` 搬出来（那边 re-export，行为不变），供规则层与纯 Node 测试互核 |
| `Script_CharacterGore.mjs` | 新建 | `GoreSystem`（Resolve / Sever / Update / ReleaseSoldier / ReleaseAll / State / SetEnabled / SetForce）+ `AddGoreWarmProxies` |
| `Script_DismembermentTest.mjs` | 新建 | 纯 Node，2066 条断言，§10.1 每一条都有 |
| `Script_Physics.mjs` | 改 | `+ MakeLimbBody`（动态胶囊、CCD、DEBRIS 组只碰 WORLD\|DEBRIS\|RAGDOLL） |
| `Script_Vfx.mjs` | 改 | `+ BloodSpurt`（跟骨头的持续源，写法照 `smokeSources`）`+ RemoveBloodSpurt` `+ BloodBurst` `+ bloodSpurtCount`；`Update` 里加 `_UpdateBloodSpurts`，`ClearParticles` / `Dispose` 清源 |
| `Script_Ai.mjs` | 改 | `TakeHit(damage, part, dir, info)`；`Kill(dir, sever)`；LOD 循环 `s.gore` 不进远景层；`Remove` 调 `gore.ReleaseSoldier`；AI 打 AI 那一掷补 info；`soldier.gore` 字段 |
| `Script_Combat.mjs` | 改 | `Blast` 把 `falloff` 交进 `TakeHit`；`Melee` 按动作给 `kind/mode` |
| `Script_Main.mjs` | 改 | `MarchBullet` 结果加 `shape`；`TryFire` / `FireVehicleBullet` / `FireEmplacedShot` / `MeleeCombat.Damage` 四个调用点补 info；建 `GoreSystem` 并挂 `ai.ctx.gore`；每帧 `gore.Update`；`BuildField` 开头 `gore.ReleaseAll()`；`WarmActorShaders` 加断肢预热代理；`Debug.Gore`；`?gore=0` |
| `index.html` / `Script_TestRunner.mjs` / `docs/Data_AgentReference.md` | 改 | 登记与路由 |

### 11.2 与 §3 / §5 的差异（都是实拍逼出来的）

1. **断面盖是一只 vertexColors 材质，不是 flesh/bone 两只**。两只材质等于每个断面两次 draw，
   而一次断肢有两个断面（残端 + 肢块那头）；`BUDGET.high.maxParts` 16 时光盖子就是 64 次 draw。
   颜色写进顶点色之后一个断面 1 draw、全局只有 1 个 program，§7 的预算账才对得上。
2. **`Data_Tuning_Gore.CAP.fleshColor` 从 0x6b1410 抬到 0x8a231c**：前者转线性只剩 0.15 亮度，
   实拍是一枚近乎全黑的圆片，读起来像个洞不像断面。
3. **`BLOOD.burstAmount` 从 1.6 降到 1.1**，多段同时卸的加成从 `min(2, 0.8+0.4n)` 收到
   `min(1.4, 0.85+0.15n)`。`Script_Vfx.Blood` 的雾体片按 amount 线性放大，1.6 在两米内是
   **一整面红墙**，把断面和肢块全糊住；远处不吃亏，那一档由距离补偿（far 最高 4 倍）管。
4. **新增 `LIMB_BODY.groundSpinDrag = 6`**（§6 没提）。解析地形不在 Rapier 世界里，肢块贴地
   是 `ClampToGround` 手写的，那一条只管平动；不补角速度阻力的话，一段躺在地上的胳膊会一直
   原地转（实测 13 rad/s 靠 `angularDamping 0.6` 要磨四秒半，画面上就是「地上有个陀螺」）。
5. **`ResolveSever` 的 `forceKill` 扩到 force 通道**：只要真断了而这一发没打死人，一律抬成致死
   （§1「断肢 ⇒ 必死」）。原文只写了 `requiresKill=false` 的 blast，但 `Debug.Gore.SetForce`
   会让步枪弹在未致死时也断，那条口子必须一起堵。
6. **爆炸没给 shapeId 时的挑段**是「按权重随机」（腿权重 2、胳膊 1），不是「按爆心相对位置挑最近的
   两段」。规则层零 three，手上没有几何；贴地炸先卸腿这一条用权重表达，判定仍然可复现。
7. **肢块的三角形来源与身体是同一次 `FilterIndex`**（先重建身体、再按 `entry.parts` 烘肢块），
   这样 `身体减少的三角数 = 肢块三角数 + 丢弃数` 这条守恒随时成立，浏览器验收可以直接读
   `Debug.Gore.State().severed[*]`（`sourceTriangles` / `bodyTriangles` / `limbTriangles` / `dropped`；
   `partTriangles` 是**场上还活着**的那一份，会被预算淘汰减掉，别拿它做守恒）。
8. `GoreSystem.Sever` 返回**真的卸掉的那几段**（字符串数组），方便调用方判断有没有发生。

### 11.3 两个坑（写下来免得下一个人再踩）

- **骨名要归一化**。源 GLB 里关节叫 `Bip001 L Forearm`（有空格），但 GLTFLoader 走
  `PropertyBinding.sanitizeNodeName` 把空白换成下划线，运行时读到的是 `Bip001_L_Forearm`。
  数据表按源名写、`LimbForBone` 里把 `[_.\s]+` 归一成单空格。**没做这一步的症状是**：
  切了半天一个三角形都没少，人还站着，断面凭空盖在关节上（第一版实拍就是这样）。
- **骨骼的世界缩放不是「世界米」的那个缩放**。这批 Max Biped 骨架内部是厘米单位，
  关节的世界缩放约 **0.0089**，而 rig 根节点的世界缩放才是 0.955（目标身高/资产身高，
  `GetHitboxes` 用的也是它）。肢块几何烘在关节局部系里，所以**网格**跟 boneScale 走；
  而 `Data_Tuning_Gore` 里的半径/半长是世界米，**刚体与断面盖**必须跟 rigScale 走
  （挂在骨头下面的盖子还要把 boneScale 除掉）。第一版两处都用了 boneScale：
  胶囊半径 0.0005 m、断面盖半径 0.0005 m —— 一个像素都看不见，肢块「落地」在离地半毫米处，
  而 `visible` 是 true、`State()` 一切正常。这正是 `visible 不等于看得见` 那条账。

### 11.4 已知未完成

- 玩家设置面板里没有断肢开关（§1 最后一行的「若能沿用现有布尔项模式则一并加」）：
  现在只有 `?gore=0` / `Debug.Gore.SetEnabled` / `Data_Tuning_Gore.ENABLED` 三个入口。
- 断肢没有**音频**（一声闷响 / 骨裂）。`Data_SfxSources` 里没有对应素材，没有编造。
- 血源与肢块都不吃「暂停 / 慢放」以外的时间缩放；`Update` 直接吃传进来的 dt。
- §10.2 的浏览器闸门（`Script_GoreRangeTest`）与测试场是并行那一路的交付，本轮未包含。
- 概率表（`SEVER_RULES`）仍是推定值，只在靶场实拍过 bullet / blade / debug 三条，
  近炸多段与 hmg 那两档只跑了纯 Node 的分布检查。

### 11.5 设计者审核之后补的三处（2026-09-10）

**1) 死亡链安全网（`Script_Ai.mjs`）。**
`Soldier.Kill` 里调 `gore.Sever` 的那一段与 `TakeHit` 里的 `gore.Resolve` 各包一层 try/catch：
断肢层抛出来只 `console.warn("[Gore] …")`，`severed` 记 0 / `sever` 记 null，
`deathPush → NotifyDeath → Bark` 与伤害链照常走完。**断肢层是死亡链上的旁支，不是主干** ——
一个几何 bug 绝不能让敌人打不死或者让扣票丢失。实测（临时探针 monkeypatch 让两者各抛一次）：
士兵 `alive === false`、`ai.deaths[side]` 各 +1、`deathPush` 正常被 `MakeCorpse` 消费，控制台只有 warn 没有 error。

**2) 卸掉持枪那条胳膊时枪跟着胳膊走（`Script_CharacterGore.mjs` + `Script_Actor.mjs`）。**
士兵的 `weaponGroup` 挂在 `rig.Grip("weaponR")` 底下的 `SocketAttachment_WeaponR` 上。
卸掉 `upperArmR` / `forearmR` 之后手骨的三角形没了，但**骨头还在动**，
不管的话步枪就悬在半空跟着一只看不见的手走 —— 比缺一段胳膊显眼得多。

- `GoreSystem._HandOffWeapon(record, limbId, part)`：判据是「这一段的关节骨是不是那只挂点的祖先」
  （沿 `mount.parent` 往上找），所以右臂两段都算、左臂两段都不算。命中就 `part.root.attach(weaponGroup)`
  —— **attach 读的是 `part.root.matrixWorld`**，`_SpawnPart` 刚写完 position/quaternion/scale 还没刷矩阵，
  少一句 `updateMatrixWorld(true)` 枪会落在世界原点。
- `Actor.DetachWeaponForGore(target)` / `Actor.RestoreWeaponFromGore(visible)` 是新加的那对小接口，
  还原凭据（原挂点 + 原局部 position/quaternion/scale）记在 `actor.goreWeaponHold` 上。
  `_DisposePart` 还原并 `visible=false`（人已经死了，枪随胳膊一起消失，不能又浮回空手里）；
  `ReleaseSoldier` 还原并 `visible=true`（**对象池里复用的 rig 不许带着「枪不见了」出生**）。
- **每帧写 `weaponGroup` 的地方有三处，一处不让开枪就被拽回人手里**（这条比接线本身难找）：
  `Actor._UpdateRiggedWeaponMount`（往挂点局部系写 position/quaternion）、
  `Actor._UpdateInfantryProps`（`_ApplyInfantryProp` 按 `group.parent` 重算局部位姿）、
  `Actor.Update` 死亡分支上面那句 `weaponGroup.visible = !(carryRole || woundedWalk)`。
  三处一律看 `goreWeaponHold`。另外 `SetWeapon` 与 `_AdoptRiggedCharacter` 会作废那份凭据（旧枪没了 / 挂点重建），
  两处都清空。`Actor.PoseRagdoll` 摆的是 `weaponMount`（程序化那条路），挂了 rig 时与 `weaponGroup` 无关，不必动。

**3) 肢块到寿命不许在玩家眼前凭空消失（`Script_CharacterGore.Update`）。**
`age > partLifeS` 只是**取得回收资格**，真收要等看不见：视锥外（`Frustum.setFromProjectionMatrix` +
以关节为心、`halfLength × 2 + radius` 为半径的保守包围球，写法与 `Script_Ai.CullActors` 一致，
视图矩阵自己从 `camera.matrixWorld` 求）或离相机超过 `PART_RETIRE.despawnDistanceM`（30 m）。
再给一条 `partLifeS × PART_RETIRE.hardLifeScale`（×2）的硬上限兜底。
**预算挤出（`GoreBudget.Acquire` 的 evicted）不受这条影响，仍然立即回收。**
两个数在 `Data_Tuning_Gore.PART_RETIRE`。实测（medium 档 partLifeS = 20 s，相机 3.7 m 盯着）：
25.05 s 还在，转开镜头 3 帧内收掉；一直盯着到 37.05 s 还在，下一档（40 s 硬上限）收掉。

**留给下一轮的一条**（不是本轮引进的）：`physics.ClampToGround` 只把**刚体那一个点**顶到地面上，
胶囊的另一半照样进土 —— 落地的肢块自己就沉 0.03–0.18 m（实测 `GorePart_calfR` sunkM = 0.178，
它身上并没有挂枪）。挂着步枪的那一段被这条放大：1.1 m 的中正式顺着前臂朝下扎进地里，
只剩 0.22 m 露在外面，静态看读起来像「枪不见了」。飞行段与刚倒下那几秒完全正常
（`_shots/Gore/28_rifle_in_severed_hand.png`）。要修得动的是肢块贴地那一层（胶囊姿态 / 真碰撞），
不是断肢接线，本轮没动。→ **已在 §11.6 修掉。**

### 11.6 设计者验收轮（2026-09-10，测试场 15 条全绿之后）

测试关卡那一路把两条红指回了核心规则，连同上面那条「肢块沉进土里」一起在这一轮收掉：

**1) 爆炸段数按 falloff 分档（`Data_Tuning_Gore.SEVER_RULES.blast.tiers`）。**
原来 `maxLimbs 4 / extraLimbChance 0.6` 是常数，`minFalloff 0.55` 折成距离是 5.5 m ——
三米环上的木桩与爆心旁的一样连卸四段（实测 ring1=[3,4] / ring3=[2,2]）。
改成三档：falloff ≥ 0.88（≈1 m）四段 / ≥ 0.80（≈2 m）两段 / ≥ 0.70（≈3 m）一段，再远不断。
规则层 `TierFor(rule, falloff)` 取第一条满足的档；追加段仍从八段全池挑（爆心在脚边也炸得到胳膊）。
实测 ring1=[4,4] / ring3=[1,1]。纯 Node 断言：一米圈多段占比 > 80%、两米圈最多两段、三米圈恰一段、四米圈零。

**2) 白刃把命中部位交给规则层（`Script_Dismemberment.PickMeleeShape` + `LIMB_POOLS`）。**
白刃是扇形判定、没有射线，`shapeId` 一直是空，`ResolveSever` 只能从八段里随机挑 —— 大刀劈脖子掉小腿。
现在两处调用点（`Script_Combat.Melee`、`Script_Main` 的 MeleeCombat 宿主 `Damage`）都先算
「从攻击者眼位沿挥砍方向，命中体里离这条线最近的那条胳膊段」（纯几何，头只在池子里明确列出时才选），
交出去当 `shapeId`；没有命中体时规则层按 `LIMB_POOLS.blade`（两条胳膊）挑，头只在 shapeId 真的报 head 时按 `chance.head` 骰。
顺手把 AI 打 AI 那条链的粗部位也限住：抽到 `"arm"` 只在四条胳膊段里挑、`"leg"` 只在四条腿段里挑（`LIMB_POOLS.arm / leg`）。
实测大刀一刀 `cut=["upperArmL"]`；纯 Node 断言：无命中体的大刀 80 次全在胳膊池里、劈头按 0.30 骰、arm/leg 各归各池。

**3) 肢块贴地按姿态顶（`Script_CharacterGore.Update`）+ 竖着的放倒（`LIMB_BODY.groundTipRate`）。**
`ClampToGround` 只认刚体中心一个点，原来 `lift = radius`，竖着落地的那半截整个插进土里。
现在 `lift = radius + |轴的竖直分量| × 半高`（每帧按刚体此刻的姿态算）；顶起来之后又冒出另一个问题 ——
解析地形没有接触力矩，一截竖着的大腿会像木桩一样立在地上（炸坑实拍抓到一根），所以贴地那一帧再补一记重力力矩：
`ω += −sign(axis.y) × groundTipRate × |axis.y| × (axis × up)`，轴离水平越远推得越狠，躺平（`groundTipDeadzone` 0.12 以内）自然归零。
两个数在 `Data_Tuning_Gore.LIMB_BODY`。

**5) 断肢不许借 AI 的随机流（`Script_CharacterGore.GoreRng`）。** 第一版 `Resolve` / `_SpawnPart` 用的是 `soldier.rnd()`，
判定一次消耗 8 个数。那条流是 AI 的（射击误差、探头节拍、反应延迟全从它抽），借它等于把整场战斗的 AI 行为序列往后推：
prepush 里 AiCombatBrowserTest 与第一关开场那几条按固定序列回放的验收全红，基线上却绿 —— 逐帧探针抓到的是「有人被卸肢的那一帧之后，
玩家在前沿被打死、任务判失败、`state.running=false`、后面整班再也不 Think」。改成按士兵 id 另开一条 Mulberry32（`soldier.goreRnd`，
懒建），同一种子照样重放出同一次断肢，AI 那边一个数都不少。**规矩：断肢层以后任何随机都只从 `GoreRng(soldier)` 抽。**

**6) 断肢不改生死（`SEVER_RULES.blast.requiresKill = true`，删掉 killOnSever）。** 第一版给爆炸开了「未致死也卸、卸了抬成致死」，
prepush 里第一关开场那四条与 AiCombatBrowserTest 全红：挂钩取证抓到的调用栈是 `Script_FirstLevelOpening.Update → openingSquadLost → OnPlayerDown`
—— master 当天新加的开场规则「列车到机枪位之前同班任何一人阵亡＝任务失败」，而炮击近失弹（falloff ≥ 0.70、伤害 60–90）把本来只是受伤的
同班战友卸了肢、抬成致死。断肢系统不许改变任何一个人的生死：六类来源全部 requiresKill，`forceKill` 只剩 Debug 的 force 通道。
近炸多段的观感不受影响（手榴弹 1 m 圈 108 伤本来就致死），三米圈没炸死的人现在只是受伤、不掉肢。
顺带一条教训：先前那轮「换独立随机流后全绿」是假象 —— 补丁漏了 `Script_Noise` 的 import（CRLF 锚点没匹配），运行时 `Mulberry32 未定义`
被死亡链的安全网吞掉，等于断肢被静默关掉；安全网的 warn 一定要看。独立随机流本身仍保留（AI 的流一个数都不该少）。

**4) 小修：** §10.2-2 的「120 帧后 resting」改成 360 帧（`restToStaticS` 2.5 s）；测试场面板的 draw call 读数按 §7 的账直接算「肢块 + 断面」
（three 每趟 `render` 都 `info.reset()`，帧末读 `renderer.info` 只剩最后一趟全屏 pass 的 1）；
§7 说测试场建场要摆预热代理 —— 不必：`WarmActorShaders` 每关都跑，`AddGoreWarmProxies` 已经覆盖（RespawnShaderWarmTest 换人 programs 179→179）。

## 12. 明确不做

- 活体缺肢与爬行、躯干腰斩、内脏、第一人称玩家断肢、百姓（程序化 tzm）断肢、烘焙尸体层的断肢、逐关节 ragdoll、血迹 SSS/湿润着色升级（后续可在材质着色升级里加）。
