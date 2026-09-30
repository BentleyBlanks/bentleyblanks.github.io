# 受击物理反应（2026-09-30 基建）

枪打、刀砍到敌我士兵身上，人要**按挨打的方向和部位**做出物理上说得通的反应：
胸口正面中弹上身后仰、头往后甩；打在右肩上身往右后拧；打腿膝盖一软骨盆往下掉；
被打死的人顺着冲量方向倒 —— 正面中弹往后倒、背后中弹往前扑，而不是四条动作一律往右侧倒。

本册是这套基建的**唯一口径**：接口、物理模型、数值、动作库格式与验收。
实现：`Script_HitReaction.mjs`（纯规则）· `Script_HitReactionLayer.mjs`（three 侧）· `Data_Tuning_HitReaction.mjs`（全部数值）。
门禁：`Script_HitReactionTest.mjs`（纯 Node）· `Script_HitReactionBrowserTest.mjs`（真实 GLB，`--report` 打印全部实测值，`--require-library` 强制动作库四族）。

## 0. 改之前的样子（2026-09-30 实测）

| 项 | 现状 | 问题 |
| --- | --- | --- |
| 活人中弹 | `Soldier.TakeHit` 写 `hurtPose`，`CharacterModel._ApplyHurtTilt` 给胸/颈叠一记固定的「后仰 + 左右抖」 | 与子弹方向、打中哪里**完全无关**：背后中弹也后仰，打腿也是胸口后仰 |
| 死亡倒地 | `SelectDeathCollapseClipId(seed)` 按 seed 在 Kimodo `DeathCollapseA–D` 里抽一条 | 四条**全部往人物右侧倒**（终帧头在人物局部 +X 1.0–1.7 m、略偏后，见下表），与冲击方向无关；`Ragdoll(dir)` 算出的 forward/side 只给没有 GLB 的程序化退路用 |
| 白刃 | `Main.Damage` 只传「攻击者→目标」水平方向 | 刀是横着扫过去的，扫刀方向（`contact.end − contact.previous`）没有传进伤害链 |
| AI 打 AI | 部位按概率抽，`point` 是瞄点 | 反应要用的受力点与抽到的部位不一致 |

四条 Kimodo 倒地终帧（演员局部坐标，+X 右手、−Z 正面，起点骨盆地面投影为原点；NRA，IJA 同形）：

| clip | 骨盆终点 (x, z) | 头终点 (x, z) | 倒向 |
| --- | --- | --- | --- |
| DeathCollapseA | (0.74, 0.36) | (1.26, 0.23) | 右 |
| DeathCollapseB | (0.66, 0.28) | (1.18, 0.28) | 右 |
| DeathCollapseC | (0.52, 0.65) | (0.96, 0.93) | 右后 |
| DeathCollapseD | (1.15, 0.44) | (1.67, 0.59) | 右 |

## 1. 架构

三层，从纯规则到动画：

1. **冲量模型**（`Script_HitReaction.mjs`，纯规则、不 import three，Node 可测）
   一次命中 → 世界系冲量 `J`（方向 × 有效冲量 N·s）+ 受力点 `p` + 部位 → 分到骨链上的角冲量、骨盆平移冲量、腿软量；
   致死的一下另给「该往哪倒」的演员局部方向。
2. **骨骼弹簧层 / 物理动画层**（`Script_HitReactionLayer.mjs`，three 侧，挂在 `CharacterModel` 上：`rig.hitReaction`，第一次挨打才建）
   每根参与的骨头有一个角位移 θ（叠在动画姿势之上的世界系旋转增量）和角速度 ω，
   按「转动惯量 + 弹簧 + 阻尼 + 关节限位」积分；冲量改 ω，弹簧把 θ 拉回动画姿势。
   活人：弹簧目标是当前动画（开火、走路照常演，受击是叠上去的）；死人：肌张力丢失（频率降、阻尼升），
   冲击动量只带进倒地动作的前段，并在接地拟合前归零。
3. **方向死亡选择 + 动作库**
   动作库每条带实测的倒向（`fallLocal`）。致死命中按冲量方向与部位选最接近的一条，
   剩余偏角（≤ `maxYawResidualDeg`）在倒地前段平滑转过去。库由 BlenderMCP 物理仿真烘焙（见 §6，`docs/Data_DeathImpactClips.md`）。

**不做的**：运行时逐关节刚体布娃娃（`Script_Physics.MakeCorpse` 头注的理由仍成立：几十具、不可复现、
考据上不可能的姿势）；尸体位移仍归 `MakeCorpse` 那具锁旋转胶囊。物理只进「姿势偏移」和「离线烘焙的倒地」。

## 2. 接口契约

### 2.1 命中描述 `HitDescriptor`（世界系，three 侧由 Soldier 组装）

```js
{
  kind: "bullet" | "hmg" | "blade" | "thrust" | "blast" | "melee",  // 与断肢同一套 kind
  part: "head" | "torso" | "arm" | "leg",
  shapeId: string | null,        // 命中体 id（CHARACTER_HITBOX_PROFILE），有则优先
  point: Vector3 | null,         // 受力点；只在有 shapeId（几何命中）或 pointExact 时才信
  pointExact: boolean,           // 调用方明说 point 是弹着点（Debug 用）
  direction: Vector3,            // 子弹飞行方向 / 攻击方向 / 爆心→人，单位向量
  sweep: Vector3 | null,         // 白刃：刀尖这一帧的扫过方向，有则与 direction 合成（bladeSweepWeight）
  blastOrigin: Vector3 | null,
  damage: number,                // 已乘部位倍率的有效伤害
  rawDamage: number,             // 乘部位倍率之前的伤害：冲量按它算（动量是弹的事，不是打中哪一段的事）
  weaponId: string | null,
  lethal: boolean,
  seed: string | number,         // 演员 seed：方向死亡里所有「按 seed 稳定抽」的来源
}
```

- 入口：`Soldier.TakeHit(damage, part, direction, info)` 在扣血之后、`Kill` 之前用 `Soldier.BuildHitDescriptor` 组装，
  没死走 `Soldier.ApplyHitReaction(hit)` → `actor.ReceiveHit(hit)`。
  不进的：`damage <= 0`、没有方向（剧本里 `TakeHit(…, null)`）、`openingDoomed`（开场分镜里被安排死的，动作是导演编好的）。
  叙事保护（`scriptEssential`）照样有反应，只是不会死。
  `TakeHit` 里只用 `this.xxx?.()` 调新方法：`Script_FirstLevelP012ActorTest` 把它的源码抠出来在只有几个全局的沙箱里跑。
- 致死：`Soldier.Kill(direction, sever, neckDeath, hit = null)` 把 `hit` 交给 `actor.Ragdoll(direction, hit)` →
  `characterRig.BeginDeathPose(deathChoice)`，并给弹簧层打一记死亡档冲击。
- **没有 `hit` 的 `Kill`（剧本直接杀、开场分镜、调试 Sever）行为不变**：仍按 seed 在 A–D 里抽，不转向、不加冲量。
  `Script_DeathCollapseTest` / `Script_OpeningStoryboardsTest` / 浏览器测试的「无 hit 老路」断言看着这条。
- 白刃扫向：`Main.Damage` 优先取刀尖这一帧位移 `contact.end − contact.previous`；刚出刀两者重合时按弧线切向
  （刀尖 yaw = `a.yaw + sweep·(1−2u)`，`dTip/du ∝ sign(sweep)·(cos yaw, 0, −sin yaw)`）。捅刺不带扫向。
- AI 打 AI（`Script_Ai` 的 `TryFire`）：部位按概率抽、`point` 是瞄点、没有命中体 id ⇒ 受击层**不信 point**，
  按抽到的部位取受力点，肢体取离射手近的一侧（`ClassifyZone` / `DefaultPoint`）。
- 尸体再挨打（`!this.alive` 分支）：不进死亡选择，也不吃冲量（「倒地动作放完之前的尸体吃衰减冲量」这条可选项没做，默认关）。

### 2.2 演员侧

- `Actor.ReceiveHit(hit)`：有 `characterRig` 走弹簧层；没有 GLB 的程序化人物沿用原来的 `hurt` 后仰（不改）。
  `Actor.ResetHitReaction()`：演员回收 / 复用 / 换关 / 复活清零弹簧状态与死亡转向（`Actor.Dispose`、`rig.Dispose` 也会清）。
- **施加顺序**（`Script_Actor.Update`）：开头先 `hitReaction.Restore()`（后进先出：它是每帧最后施加的一层，必须排在瞄准 / 匍匐修正的还原之前，
  也必须排在死亡分支之前——尸体保持帧上 three 的 mixer 不重写常量轨道，不还原就永远残留），最后在 `_ApplyRiggedAim` **之后**
  施加。施加后重跑 `_UpdateRiggedWeaponMount` / `_UpdateInfantryProps`；站姿库里枪由 helper 摆（不跟骨头走），
  再把上身（Spine2）的刚体增量按 `infantryPropWeight` 也施加给枪，手和枪一起被打偏。枪的局部位姿施加前记下、下一帧还原
  （枪被断肢层改挂到肢块上时不还原，`goreWeaponHold` 时不重摆）。
- 骨骼记录：每帧施加前记原值，倒序还原（与 `hurtTilt` 同一套）。施加时按自父向子 FK：
  `q' = (P⁻¹ R P) q`，P 是父节点世界旋转（含本帧已施加的祖先偏移）；Biped 的锁骨是 Neck 的子节点，
  施加颈的偏移后给两根锁骨补一个反向旋转，肩膀不跟着颈歪。断肢：卸掉的肢体照样有骨头，弹簧层不因 mesh 被切而出错。
- 死亡时在 `Update` 的 ragdoll 分支里 `PoseRagdoll` 之后 `ApplyDeath(dt, t, ragdollState.duration)`，**死亡进度 t ≥ `DEATH.fadeEndT`（0.55）时偏移严格为 0**
  （`DEATH_CONTACT.poseEnd = 0.85` 起按可见蒙皮做接地拟合，偏移没归零会把人拟合歪）；按秒的那一层通常更早归零（§3.4）。
- 死亡转向：`PoseRagdoll` riggedDeath 分支里 `body.quaternion` 设成绕 +Y 的 `DeathYaw(t, ragdollState.duration)`：
  倒地开始后 `yawBlendS`（0.35 s）内平滑转完，进度 `yawBlendEndT` 是硬上限。转的是 rig 的可见朝向，**不改 AI 的 `yaw`**；
  接地拟合的 `premultiply` 叠在它上面，互不干扰。
- 记录用对象池（`records` + `recordCount`），活跃时每帧不分配；远于 `SOLVER.maxDistanceM` 直接清零休眠（不留「活跃」白跑）。
- 有弹簧层时 `_ApplyHurtTilt` 不再画（`hurtPose` 仍给 AI 逻辑用：压制、队形判据都读它；`rig.hurtTilt` 数组保留，`ActorPoseTest` 读它）。
- 太久没被 `Update` 推进（被剔除 / 隐藏，`SOLVER.staleS`）醒来直接清零；远于 `SOLVER.maxDistanceM` 清零、不叠。
- **尸体的 Actor.Update 要放到倒地动作放完**（`Script_Ai` 尸体分支：`deadTime ≤ 0.9 || 尸体刚体还在 || ragdollState.t < 1`）。
  以前只放 0.9 s（旧 0.8 s 程序化倒地的账），Kimodo 1.6 倍速也要 1.7–1.9 s：尸体刚体一拆人就定在半跪 / 撑地的中间帧，
  脱手的枪停在落地途中、最低点离地 0.15–0.38 m、枪管上翘到 36°（2026-09-30 验收时在 master 上实测，t 停在 0.47）。
  物理仿真库的倒地更长（1.6–3.2 s），不修的话方向死亡全部定格在半空。`HitReactionBrowserTest` 的士兵链走真 AI 循环断言 t = 1、枪落地。

### 2.3 AI 侧

受击强度（severity）≥ `AI_HOLD.minSeverity` 的一下，`Soldier.fireTimer` 至少推迟 `holdS × severity`（≤ `maxS`）：
人被打得后仰时不该还在稳稳开枪。数值小（步枪档 ≈ 0.32 s），只影响挨打那一瞬。

### 2.4 取证口

`window.Taierzhuang.Debug.HitReaction`：
- `Hit(soldierId, { dir:[x,y,z], part, kind, shapeId?, point?, sweep?, damage? })` 走正片 `TakeHit` 链（扣血、可致死、方向死亡）；
- `Impulse(soldierId, {...})` 只打冲量不扣血（调参、拍对照图用）；
- `State(soldierId)` / `Layer(soldierId)`：每根骨的 θ/ω（度）、骨盆偏移、腿软、是否活跃、选中的死亡 clip 与剩余偏角；
- `SetEnabled(bool)` / `Enabled()` / URL `?hitreact=0`：整层开关（弹簧层 + 方向死亡选择），A/B 对照用，关了退回老路；
- `Preload()` / `Library()`：动作库懒加载与已加载内容。

## 3. 物理模型

### 3.1 质量与惯量

人体 70 kg，分段质量按 Dempster 人体测量表（头 8.1%、躯干 49.7%（骨盆段 14.2 / 腰段 13.9 / 胸段 21.6）、
上臂 2.8%、前臂 1.6% + 手 0.6%、大腿 10%、小腿 4.65%、脚 1.45%）。关节位置取 Tengxian 共用骨架的站姿比例
（GLB 高 1.817，按演员身高等比缩放）。每根参与骨 b 的惯量 `I_b = Σ_{b 及其子孙骨上的段} m·(|d|²·E − d·dᵀ) + m·len²/12`（d = 段质心 − 关节），绑定时算一次，取逆。

- 脊柱三节用完整惯量张量（躯干始终大致直立，绕竖轴的惯量比俯仰小得多，这是真的）。
- **手臂 / 颈 / 头（`isotropic`）取「垂直于骨长轴」那一档各向同性**：端枪时上臂指向侧前方，不是垂着，
  站姿张量里绕骨长轴的那档极小（上臂 0.02 vs 0.37 kg·m²），照它算会把端枪的手臂被侧向力绕竖轴抡出去（实测 85°）。
- 参与的骨：`spine`、`spine1`、`spine2`（Bip001 Spine2 = `chest`）、`neck`、`head`、`upperArmL/R`、`forearmL/R`；
  大腿 / 小腿只作为腿软的输出（见 §3.2），骨盆只平移。

### 3.2 冲量分配

`J = n̂ · P`，P 为有效冲量（§4 `impulse`）。命中落在哪一段（`shapeId` 优先，其次 `part`）决定链 `CHAINS`：
`head`（头、颈、胸、腰）· `chestUpper`（胸、腰上、腰下）· `chestLower` · `upperArm`（上臂 + 胸 + 腰）· `forearm`（前臂 + 上臂 + 胸）。沿链对每根骨 b：

```
r_b  = p − j_b                            // j_b 取活的关节位置（此刻真实姿势：蹲 / 卧 / 端枪），惯量取站姿
Δω_b = share(level) · I_b⁻¹ · (r_b × J)     // 受力段本身 share 最大，往下逐级衰减
```

- **颈头传递**：脖子把冲量的 `NECK_TRANSFER.ratio` 传给头，等效于力作用在头质心上（杠杆 = 头质心 − 颈关节）——
  打胸口，头相对胸顺冲量方向甩一下（正面中弹头往后甩）。
- **骨盆踉跄**：`Δv = J_水平 · STAGGER.velocityPerNs · zoneScale`，骨盆只平移不转（转了腿会歪、脚会滑）。
- **腿软**（打腿膝盖一软）：脚在地上，「掉多少」和「腿怎么弯」是一个几何关系：大腿与小腿等长 L，髋前屈 α、膝屈 2α 时脚留在原地，
  髋降 `d = 2L(1 − cos α)`。每条腿一个竖直弹簧 `sink`（速度冲量 `sinkMpsPerNs`，受力腿全量、另一条 `otherLegShare`），
  骨盆下沉 = 两腿平均，每条腿按自己的 sink 反解 α、β 施加到大腿 / 小腿（绕演员 +X）。腿软只往下掉，不把人顶起来。
- 方向和部位都是物理算出来的：正面打胸 → 腰胸后仰；打右肩（r 有侧向分量）→ 绕竖轴拧（右肩向后 = 绕 −Y）；打头 → 颈头猛甩；
  从背后打 → 前扑（符号相反、幅度相同）；打腿 → 膝软。
- 有效冲量不是真实子弹动量（6.5 mm 弹头约 6–7 N·s，真打在人身上几乎看不出位移）——看得见的受击是肌肉惊跳和失稳，
  这里按「看起来像」反推 P（`IMPULSE.referenceNs`），但**分配与回复都是真物理**。前臂那一档 share 只有 0.12
  （前臂 ~1.5 kg，「有效冲量」按躯干反推的，原样套上去肘会被打到限位），这一档是耦合系数，不是力学份额。

### 3.3 弹簧积分

每根骨按固有频率 f 与阻尼比 ζ：`α = (−ω_n² θ − 2ζω_n ω)`（k/I 各向同性；脊柱绕竖轴的 ω_n 再乘 `twistFreqScale` = 2.6：扭腰比前后俯仰硬）；

```
ω += α h;  θ += ω h            // 半隐式欧拉，固定子步 h = 1/240 s，一帧最多 16 步（掉帧时不追），纯确定性
|θ| > θmax → θ 截到锥面，ω 去掉向外分量   // 关节限位（非弹性）
```

所有骨 |θ| 与 |ω|、骨盆偏移、腿软量都低于阈值 → 休眠（严格清零，`Step` O(1)）。帧率无关：60 / 30 / 144 / 20 fps 的峰值差 < 8%。

### 3.4 死亡

致死那一下同样施加冲量（×`DEATH.impulseScale`），但弹簧切到死亡档（`frequencyScale` 0.55、`dampingRatio` 0.85：肌张力丢失，
不回弹，反向过冲 < 5%），没有骨盆平移与腿软，并乘包络：`t ≤ fadeStartT`（0.14）全幅，到 `fadeEndT`（0.55）平滑降到 0，之后**严格为 0**；
再按秒包一层（倒地开始后 `fadeStartS` 0.2 s 起、`fadeEndS` 0.75 s 归零），两者取小——物理仿真库的倒地长 1.6–3.2 s，只按进度的话
冲击会拖到人躺平以后。`fadeEndT`、`yawBlendEndT` 都必须小于 `DEATH_CONTACT.poseEnd`（0.85），测试断言。

## 4. 数值（`Data_Tuning_HitReaction.mjs`，全部可调）

有效冲量 `P = referenceNs(46) × severity`，`severity = gain × clamp(rawDamage / refDamage, minRatio, maxRatio)`：
步枪 1.0（refDamage 75）、机枪 1.3、大刀 1.2（重劈）、刺刀 1.25、枪托 1.0、爆炸 2.2（伤害本身已按距离衰减，上限放宽）。

**目标与实测**（`Script_HitReactionBrowserTest.mjs --report`，同一 seed 造双胞胎 A/B 逐帧同步，只给 A 一记命中，
骨骼世界旋转 / 位置之差换算到演员局部系；NRA / IJA 实测）：

| 情形 | 量 | 目标 | 实测 NRA / IJA |
| --- | --- | --- | --- |
| 步枪正面打胸 | 胸（Spine2）后仰峰值 | 10–20°，0.8 s 内回到 < 1° | 13.1° / 13.4°，0.37 s |
| 同上 | 头相对胸后甩峰值 | 12–28° | 22.7° / 23.3° |
| 同上 | 骨盆后移峰值 | 3–8 cm | 6.3 / 6.4 cm |
| 步枪从背后打胸 | 胸前扑（符号相反，幅度同档） | 同档 | −14.5° / −15.4°，头 −23.0° / −23.6° |
| 步枪打右 / 左肩（正面） | 胸绕竖轴（右肩向后 = 负） | 5–15° | −8.1° / −7.3°（右），+6.3° / +6.9°（左） |
| 步枪打上臂 | 上臂顺冲量摆开 | 12–30° | 放松站姿 24.8° / 25.4°，侧向中弹 19.8° / 20.7°；端枪（力臂小）9.0° / 8.4° |
| 步枪打前臂 | 上臂随动 / 前臂相对上臂 | 8–30° / < 45° | 17.2° / 20.1°，22.1° / 28.7° |
| 步枪打大腿 | 骨盆下沉 / 受力侧膝屈 | **3–8 cm / 20–50°**（见下），0.9 s 内恢复 | 5.4 / 5.3 cm，45.2° / 45.8°，0.37 s；上身不动（< 3°） |
| 机枪 / 大刀重劈 | 同部位胸 ÷ 步枪档（同一个人） | ×1.2–1.6 | 1.30 / 1.30（机枪），1.31 / 1.31（大刀，带扫向） |
| 爆炸（近） | 胸 | 可到限位 | 56.0° / 56.6°（≥ 40°） |

- **契约修订（大腿）**：原表「骨盆下沉 5–12 cm / 受力侧膝屈 12–30°」在脚不离地时互相矛盾：β = 30° 只对应约 3 cm（`d = 2L(1−cos 15°)`），
  要 5 cm 就得 β ≈ 40°。以几何为准（否则靴子会埋进地里），改为 3–8 cm / 20–50°。
- **端枪的上臂摆得少是物理**：端枪姿势里上臂沿冲量方向（力臂小），放松站姿或侧向中弹才摆得开，所以上臂那一行按放松 / 侧向量。
- 打上身有 ~2 cm 的腿软（脚下一虚，`bodyHitShare`），肉眼几乎看不出。
- 侧面中弹（从左边打来）胸绕前后轴倾，同时因端枪姿势里胸关节在质心后面，会带一点绕竖轴的拧（约 20°），是姿势造成的真物理。

## 5. 方向死亡选择

- 期望倒向 `desired`（演员局部 XZ 单位向量，+Z 是背后）：
  - 子弹 / 机枪 / 枪托（躯干、手臂）：顺冲量方向（正面打 → 往后倒）；
  - 爆头：`crumple`（原地瘫）与顺冲量各半（按 seed 稳定抽，`crumpleChance`）；爆炸不抽原地瘫；
  - 打腿：往受力侧前方塌（侧 0.75 / 前 0.66）；
  - 大刀劈砍：顺扫刀方向（没有扫刀退回攻击方向）；刺刀捅：往朝攻击者一侧折下去（−飞行方向）或 crumple（各半）；
  - 爆炸：背离爆心（`direction` 已是爆心→人）；竖直方向（没有水平分量）原地瘫。
- 候选 = 动作库里全部带 `fallLocal` 的 clip **∪ 这个人自己的 Kimodo A–D**（实测都往右倒）。库里只有 A–D 的**左镜像**，
  并入 A–D 才有「右」的原始动作；库整个缺失 / 还没加载到 / 还在补时只剩 A–D，方向死亡不断档。
  `crumple` 类只在期望是 crumple 时参与，并按仿真时打的部位（`profile.impact.part`）配对：爆头只取打头烘的（Crumple1），
  腹部 / 刺刀只取打躯干烘的（Crumple2）——爆头之后先站半秒再捂肚子弯下去不像话；配不上才用整个 crumple 池，库里没有 crumple 就按 seed 抽、不转向。
  有方向时取与 `desired` 夹角最小者；夹角差 < 15° 的并列按 seed 稳定抽
  （候选按 id 排序后抽，结果与候选顺序无关），保证同一人回放一致。
- 剩余偏角 `δ = angle(clip.fallLocal → desired)`，截到 ±`maxYawResidualDeg`（50°），倒地开始后 `yawBlendS`（0.35 s）内平滑绕骨盆下方竖轴转过去
  （看起来是被打得一拧再倒；人还站着的时候拧完，骨盆还没走远）。最早按进度 `[0, 0.5]` 转，3 s 的 clip 上尸体会在地上慢慢打转一秒半，验收时改成按秒。转的是 rig 的可见朝向，不改 AI 的 `yaw`。转向约定与 three `makeRotationY` 一致（`YawToTurn` / `RotateYaw`，测试对拍）。
- 速率：Kimodo 用 `DEATH_COLLAPSE_PLAYBACK_RATE = 1.6`；动作库 clip 用 profile 的 `playbackRate`（物理仿真库 1，镜像 1.6）。
- **只有库还缺方向时的表现**：只有 A–D（全往右倒）时，正面中弹 → C（右后）转 ≤ 50°，往前扑 / 往左倒的偏差大（转 50° 后仍差最多 ~120°），这是预期；
  库四族齐了以后 16 个方向（× 躯干 / 手臂）终帧倒向与期望夹角实测最大 24°、平均 6°、剩余偏角 0。

## 6. 动作库契约（BlenderMCP 物理仿真，另册 `Data_DeathImpactClips.md`）

- 文件：`Animation/HitReaction/Animation_TengxianDeathImpact.json`，与 `Animation/LitterBearer` 同一格式：

```js
{ schema: 1, revision: "<YYYYMMDD>DeathImpactV1", skeleton: "TengxianHumanoidV1",
  clips: [ /* THREE.AnimationClip.toJSON，轨道 GroundRoot / Bip001_* 的 position+quaternion */ ],
  profiles: { "<clip>": {
    family: "back" | "forward" | "left" | "right" | "crumple",
    fallLocal: [x, z],          // 单位向量，演员局部系（+X 右手、−Z 正面）：起点骨盆地面投影 → 终帧头的地面投影
    pelvisEndLocal: [x, y, z],  // 米，演员局部系，相对起点根
    headEndLocal: [x, y, z],
    durationS: number,          // 以 playbackRate 播放后的时长
    playbackRate: number,
    settleS: number,            // 落定时刻（之后保持终帧）
    floorM: number,             // 终帧可见蒙皮最低点（应在 0–0.012）
    impact: { part, dirLocal: [x, y, z] },   // 仿真时给的冲量；part 也用于原地瘫按部位配对（§5）
    startS?: number,            // 可选：从 clip 的这一秒起播（跳过仿真里「中弹后还站着」的前段），倒地时长相应变短
    source: "ragdoll-sim" | "kimodo-mirror"
  } } }
```

- 最小集合：`back` ×2、`forward` ×2、`left` ×1、`right` ×1、`crumple` ×2（物理仿真），外加 Kimodo A–D 的左右镜像 ×4（`kimodo-mirror`，补「左」）。
- 运行时懒加载（`PreloadDeathLibrary`：第一次有人挨打 / 被打死时 fetch，开机不下载）；加载失败或还没到时退回 A–D，不断档；
  库缺失时那一次 fetch 会在控制台留一条 404 与一条 `[HitReaction] … falling back` 警告。
  加载器只收 profile 里 family 合法、clip 在库里、（非 crumple 的）`fallLocal` 是两个有限数的条目。URL 带自己的版本号（`deathImpact…`，在 Data 里）。
- 播放时长取 `(clip.duration − startS) / playbackRate`；偏移包络与死亡转向都另有按秒的一层（§3.4、§5），长 clip 不会把它们拉长。
- `DeathImpactCrumple2`（腹部中弹）`startS = 0.4`：仿真里前 0.5 s 肌张力还撑着，人几乎站着不动（0.4 s 骨盆才降 5 cm），
  致死命中后站半秒不像话；从 0.4 s 起播，0.1 s 后膝盖就软。烘焙脚本的 CLIPS 表里同一个数，重烘保留。

## 7. 验收

- `Script_HitReactionTest.mjs`（纯 Node，毫秒级）：分段质量与惯量、冲量分配的符号与比例（正 / 背 / 左 / 右 × 头 / 胸 / 肩 / 腿 / 臂）、
  受力段与受力点信任规则、积分稳定（大 dt、NaN、极端输入、限位、帧率无关）、休眠严格清零与确定性、腿软几何（脚不离地）、
  死亡档不回弹、死亡包络在 `fadeEndT` 归零、方向死亡（16 个方向 × 部位，含库缺失退路与 seed 稳定性、YawToTurn 对拍）、
  `Soldier.TakeHit` / `BuildHitDescriptor` / `ApplyHitReaction` 沙箱接线、`Actor.Update` 源码顺序与 import map 登记。
- `Script_HitReactionBrowserTest.mjs`（真实 GLB，NRA + IJA，约 2 分钟）：§4 表逐项、致死命中 16 个方向 × 躯干 / 手臂（+ 腿 4 向 + 爆头 / 刺刀 / 大刀 / 爆炸）终帧倒向与期望夹角
  （库四族齐或 `--require-library` 时 ≤ 45°；否则断言转向机制正确）、接地（终帧可见蒙皮最低点 0.008 ± 0.004 m）、
  死亡进度 ≥ fadeEnd 后无残留、无 hit 的 Ragdoll 仍按 seed 抽且不转向、`?hitreact=0` 退回老路、复用清零、Soldier 链（`Debug.HitReaction.Hit`）、
  30 个同时受击的人每帧多花的时间（同页 A/B 交替，前 24 帧）。
- 回归不退：`DeathCollapseTest`、`CharacterModelTest`、`ActorPoseTest`、`DismembermentTest`、`MeleeCombatTest`、
  `FirstLevelP012ActorTest`、`AiCloseRangeTest`、`SquadMarchAiTest`、`PhysicsTest`（改前就红的按基线对照，不算回归；
  2026-09-30 基线：`AiCloseRangeTest` 缺四兵靠墙夹具、`PhysicsTest` 帧耗时与沙袋离地两条、`FirstLevelP012ActorTest` 因 `NeckDeathCause` 不在沙箱里而红——
  后者已随本基建把调用改成可选而转绿）。
- 每帧耗时（30 个同时受击的人，Update 全部 30 人）：约 +0.7–1.7 ms/帧（≈ 25–55 µs/人/帧，含重跑挂点；层活跃约 0.4 s），休眠零开销。
- 画面：断肢测试场 `?gore=1` 的木桩兵走正片 `Soldier.TakeHit`，master 与本分支逐帧对照（正 / 背 / 侧 / 腿 × 活，正 / 背 / 侧 / 头 × 死），
  只留本地（`tmp/HitReaction/Compare_*.png`，采集脚本 `tmp/HitReaction/Capture_HitFrames.mjs --root <检出>`）。
  活人头部位移（演员局部系，峰值）：正面 −9 cm（后）、背后 +7 cm（前）、左侧来弹 +7 cm（右）、打腿下沉 3 cm；master 上四种一律同一个 3 cm 点头。

## 8. 已知缺口

- 尸体再挨打不吃衰减冲量（可选项，默认关，没做）。
- 端枪站姿里上臂只摆 ~9°（力臂小），若想更「顶」，调 `IMPULSE` 或给 `upperArm` 单独增益。
- 骨盆平移会带着两只脚一起挪（脚会滑 ≤ 6 cm，持续 ~0.3 s）；腿软按「脚不离地」几何反解，但受力腿与骨盆（两腿平均）有几毫米出入。
- 断肢后被卸掉的骨头照样吃弹簧（网格不见了，骨头还在），肉眼无影响。
- 弹簧层只在近景动画档（`Actor.Update` 被调用、`renderDistanceSq ≤ SOLVER.maxDistanceM²`）生效，远景批量绘制的人没有受击反应。
