# 敌军 AI 基建方案（对标 3A 敌军 AI）

> 起因：「现在敌军的 AI 很弱智，不会躲，不会正确地射击。」
> 这份文档把这句话拆成**基建缺口**而不是调参问题，给出对标 3A（F.E.A.R. / Halo / The Last of Us / Call of Duty /
> Killzone 这一代 FPS/TPS 敌军 AI 的公共做法）的目标架构、模块契约、分包与验收标准。
> 数值一律落在 `Data_Tuning_Ai*.mjs`，本文只写常量名，不复制数。
> 现状取证的行号以 2026-09-08 的 master（e1f235703）为准。

### 2026-09-10 近距离修正

- `CLOSE_RANGE` 管理近距命中、预警窗口、目标张角与攻击优先距离。远距仍沿用既有命中链，
  近距的射线遮挡、友军走廊、压制折扣及伤害上限照常生效；实测记录见 `Data_PlayerDamage.md`。
- `Think` 允许近处玩家进入感知候选，不再因远处射手占满目标名额而忽略贴脸玩家。
  `AcquireFireToken` 在暴露验证通过后，允许近敌接替远敌的攻击令牌，令牌总上限保持不变。
- 第一关开场仍按原窗口轮换远处火力；当前窗口优先选近处可见敌人，保留休整和同时射手上限。
- 回归入口：`Script_AiCloseRangeTest`（真实射击与伤害链），`Script_AiShootingTest`
  （距离混合与角误差），`Script_FirstLevelMissionTest`（窗口优先级与遮挡）。

---

## 0. 结论

现有 `Script_Ai.mjs` 是一台**「看得见就概率开枪、挨打了就找个点蹲」**的状态机。它缺的不是几个阈值，
而是 3A 敌军 AI 都有的六件基建：**感知模型、战术位置系统（掩体）、射击模型、班组黑板与战术分配、
可读的行为状态、可量化的验收探针**。本轮把这六件做成四个**无 three 依赖的纯规则模块** + 一次
`Script_Ai` 大脑重排 + 第一关接入 + 浏览器级验收。

「不会躲」的直接病根（第 2 节有证据）：

1. 第一关所有前沿日军由 `FirstLevelMissionRuntime.Defend()` 置 `scriptDefensive=true`，
   而 `AiDirector.ApplyScriptDefense` 第一句就是 `s.cover = null` —— **正片里的敌人在设计上被禁止找掩体**；
2. 通用 `FindCover` 只抽 24 个随机点按「距离 / 高度 / 朝向夹角」打分，**不验证掩体真的挡住威胁**、不看掩体朝向、
   不记占用、到位后**不探头不缩头**，人站在掩体点上按原节奏开枪；
3. 掩体点的**法线正负没有统一约定**（各生产方有的写 `(sin ry, cos ry)`、有的故意反过来），而且从没被任何消费方读过；
   字段名也分三套（`h/fx/fz`、`height/faceX/faceZ`、测试假件 `height/nx/nz`）——WallPlan 的 `h/fx/fz` 经 `Script_WallSpline`
   转成 `World.Cover` 的形状后才进 `battlefield.covers`，所以不是「算不出分」，而是「有朝向也没人用」。

「不会正确射击」的直接病根：

1. 命中是纯概率，**不验证瞄点的射线**：通视按眼高算，子弹按躯干中点结算 —— 玩家蹲在 1.2 m 墙后只露眼睛，
   会被隔墙打中躯干；反过来 AI 也不知道自己只露了一个头；
2. 子弹从躯干中心而不是枪口出发，`lookPitch` 恒 0，人物不抬枪不压枪；`aiBurstMin/Max` 是死字段；
3. 看不见目标就闭嘴（`targetVisible === false` 直接 return），没有压制射击、没有向最后目击位置开火；
4. 瞄准误差是常数，没有「越瞄越准 / 一动就散 / 换目标重来」的收敛过程。

---

## 1. 对标：3A 敌军 AI 的公共基建

| 基建 | 3A 的做法（公共部分） | 玩家看见的是什么 |
| --- | --- | --- |
| 感知模型 | 视锥 + 距离 + 姿态 + 光照的**觉察累积量**（unaware → suspicious → alert → engaged），听觉刺激（枪声 / 爆炸 / 脚步），**最后目击位置（LKP）**并在班组间共享 | 敌人会「觉得那边有动静」、会去查看、会追打你最后露头的地方，而不是全知全能或彻底失明 |
| 战术位置系统 | 掩体点带**朝向与高度类**，运行时用射线验证「这个点挡得住那个威胁」，记占用，判**被抄侧翼**，给出隐蔽位 / 射击位 / 探头方式 | 敌人贴着有效的一面躲，被绕到侧后会换掩体或后撤 |
| 掩体行为 | 缩头 → 探头（矮掩体起身、高掩体侧步）→ 短点射 → 缩头；换弹在缩头时做；压制过重 / 有手榴弹就换位 | 「躲」是一个有节奏的循环，不是蹲在点上不动 |
| 射击模型 | 瞄准误差随时间收敛、随移动 / 压制 / 姿态扩散；命中按**暴露比例**；射线验证射击线（不打友军、不隔墙）；点射节奏；看不见时向 LKP / 掩体沿**压制射击** | 第一发不准、探头越久越危险、只露头时真的难被打中、藏起来也会有子弹擦着掩体过 |
| 班组战术 | 黑板共享敌情；**攻击令牌**限制同时开火人数；角色分配（压制 / 侧翼 / 突击 / 预备）；跃进（一动一掩护）；侧翼点选在目标正面锥以外；投弹决策（对方蹲太久）；散伙撤退 | 一个班在配合：有人压你，有人绕你，有人往前跳，你蹲久了会挨手榴弹 |
| 可读性与验收 | 喊话对应行为转换；行为有明确姿态动画；调试覆盖层；确定性仿真探针 | 玩家能读懂敌人在干什么；开发者能量化「躲 / 打 / 绕」是否发生 |

本项目的取向没变（`Script_Ai` 头注）：**同屏几十人、战场感来自数量与行为层次**。所以对标的是「基建」而不是
「单兵有多聪明」——每个人便宜，但每个人都会躲、会正确地打、会听班里的安排。

---

## 2. 现状与差距（带证据）

### 2.1 感知（`Script_Ai.Think` 1060–1160）

- 360° 全向视觉，无视锥；发现只看「距离 < SIGHT_BY_STANCE[目标姿态]」再射线。
- 无听觉：枪声 / 爆炸 / 脚步不产生任何刺激。玩家从背后开枪，被打的人只会因为近失弹涨压制值。
- 记忆只有 `targetLostTime`（1.2 s 保持 / 5 s 遗忘），没有最后目击位置，看不见就发呆或转头找别人。
- 班组只共享「最近敌人的坐标」（`UpdateSquads` 596–715），不共享谁看见了什么。

### 2.2 掩体（`FindCover` 1312–1342，`Act` 1433–1451）

- 抽样：`start + i*37` 随机 24 个，22 m 内；打分 `-d*0.5 + min(height,1.4)*6 - 夹角*6`。
- 不做射线验证、不看掩体朝向（`fx/fz/faceX/faceZ` 全部未读）、不记占用（六个人可以选同一个点）、
  不判侧翼、不区分高矮掩体的用法。
- 到位后 `FIRE` 分支照常 `TryFire`，没有隐蔽 / 探头周期；`RELOAD` 在原地站着换弹。
- 字段名分裂：`Script_WallPlan.mjs:281` 推 `{x,z,h,fx,fz}`（经 `Script_WallSpline.mjs:536` 转成 `World.Cover`
  的 `{x,z,height,faceX,faceZ}` 才进 `battlefield.covers`），测试假件用 `{height,nx,nz}`；法线正负各生产方不一致
  （`Script_Landmark_Division122.mjs:209` 与 `Script_World.mjs:204` 正好相反），且此前无人消费。
  `Script_AiCover.NormalizeCover` 统一三套字段名，并把法线当**无符号墙面轴**（保护侧按威胁现算），生产方写反也不影响。
- 第一关：`FirstLevelMissionRuntime.Defend()`（228–241）→ `scriptDefensive=true` → `ApplyScriptDefense`（2019）`s.cover=null`。
  跃进冲击（`UpdateAssault` 408–442）到线后 `Defend + SetStance(1)`：**在空地上跪射**，不找线附近的掩体。

### 2.3 射击（`TryFire` 2059–2202）

- `acc = aiAccuracyBase × 难度 × 剧本 × 距离衰减 × 压制 × 玩家档 × 姿态`，掷一次骰子。
- 通视：眼到眼（`HasLineOfSight` 1344）；结算：躯干中点（`PlayerAimPoint`）。两条线不是同一条，**中间那堵矮墙没人验**。
- `from` 是 `position.y + 姿态高`（躯干），不是 `actor.weaponMuzzle`；曳光从胸口出来。
- `lookPitch: 0`（`Act` 1640）：人物永远平举枪。
- `if (s.targetVisible === false) return;`：看不见就不打，没有压制射击。
- `aiBurstMin/Max`（`Data_Weapons` 207/223/238）没有任何消费者；机枪按 `fireIntervalS` 匀速点射到过热。

### 2.4 班组战术（`UpdateSquads` / `SetSquadGoal` / `IssueOrder`）

- 六人编队 + 共享焦点 + 角色只影响冲锋距离与交战距离。
- 攻击令牌只对玩家有（`maxShootersOnPlayer`）。
- 没有侧翼点选择、没有跃进配对、没有压制 + 机动的分工、没有投弹决策、没有撤退 / 重整。
- 通用 AI 不扔手榴弹（`pendingGrenadeThrow` 只由剧本 `VolleyThrow` 触发），也不会躲手榴弹。

### 2.5 可读性与验收

- 喊话只有 spot / ammo / hurt / rally（`Script_Ai` 1149 / 1208 / 306 / 779）。
- 动画：程序化 crouch / prone / aim / lookYaw / hurt + 有限 clip（`Script_CharacterModel.POSE_CLIPS`），没有探头 clip；
  **侧步探头可以完全程序化**（高掩体：向掩体一侧横移 0.45 m 射击、退回；矮掩体：蹲藏 / 起身或跪射）。
- 验收：`Script_AiBehaviorTest.mjs` 只锁「不抽搐、不甩枪口、不乱冲、服从队向」，**没有一条量「躲」「打得对」「绕」**。

---

## 3. 目标架构

```
                 Script_Main（装配：ctx、刺激上报、Debug.Ai、覆盖层）
                                │
          FirstLevelMissionRuntime（关卡编排：锚点 / 跃进线 / 剧本旗）
                                │
                       Script_Ai.mjs（大脑：Think / Act / TryFire 的调度与 three 适配）
                 ┌──────────┬──────────┼──────────┬──────────┐
     Script_AiPerception  Script_AiCover  Script_AiShooting  Script_AiTactics
       感知 / 记忆 / 听觉    掩体注册表 / 验证   瞄准 / 暴露 / 射线   黑板 / 令牌 / 侧翼 / 跃进 / 投弹
                 └──────────┴──────────┴──────────┴──────────┘
                 Data_Tuning_AiPerception / AiCover / AiShooting / AiTactics（纯数据）
```

硬约束：

1. 四个新模块**不 import three、不 import Script_Ai**，只吃普通对象 `{x,y,z}` 与注入的宿主回调；这样它们能在纯 Node 里毫秒级测试
   （项目契约 2：规则层无 three 依赖）。`Script_Ai` 仍是唯一持有 `THREE.Vector3` 的适配层。
2. 调参表是 `Data_Tuning_<System>.mjs` 冻结对象，注释跟着数走；代码 import 读表，不复制常量（`docs/Data_TextAndTuning.md` §4）。
3. **不动**的契约：`SIGHT_BY_STANCE` / `SIGHT_SCALE_RANGE` / `CAPSULE` 名字与三处 `SightRange()` 读点（FlareTest 扫源码）、
   `COMBAT.player` 整块与 `firstShotGraceS` / `spawnGraceS`（DamageTest 的 TTK 账）、`PlayerHitPart` 的几何判部位、
   `soldier.emplacementId` 战位闸、白刃统一走 `Script_MeleeCombat`、`p012Guided` / `scriptMoveSpeedMps` /
   `scriptArrivalRadius` 的护送走位、`holdZone` 软约束、`order` 八条命令、`VAULT` 翻越。
4. 性能：Think 仍 1/6 分帧；见第 7 节预算。
5. 浏览器模块变更抬 `index.html` 的 `?v=` 戳并登记 import map（契约 1，`Script_ModuleGraphTest`）。

宿主回调（由 `Script_Ai` 从 ctx 组装，四个模块共用同一份形状）：

```js
host = {
  Time: () => number,                                   // ai.time
  Rnd: () => number,                                    // 确定性随机（Mulberry32）
  Raycast: (from, dir, maxDist) => { t, normal:[x,y,z], box? } | null,   // battlefield.Raycast
  BlocksSight: (from, to) => boolean,                   // 关卡地形 / 战车遮挡（可为空函数）
  GroundHeight: (x, z) => number,
  Walkable: (x, z) => boolean,                          // nav.Walkable；没有导航时恒 true
  Steer: (x, z, tx, tz, out) => boolean,                // nav.Steer（Tactics 估路用）
  SightRange: (stance) => m,                            // AiDirector.SightRange（含照明弹倍率）
  StanceEye: (stance) => m,                             // AiDirector.StanceEye
};
```

---

## 4. 模块契约

### 4.1 `Script_AiPerception.mjs` + `Data_Tuning_AiPerception.mjs`

职责：一个兵「知道什么」。输入候选目标与刺激，输出目标、觉察度、最后目击位置。

```js
export const ALERT = { UNAWARE:"unaware", SUSPICIOUS:"suspicious", ALERT:"alert", ENGAGED:"engaged" };

export class PerceptionModel {
  constructor(host);
  Attach(soldier);                       // 在 soldier.perception 上挂内部记忆（Map<targetId, Track>），幂等
  Detach(soldier);
  /** 刺激：{ kind:"gunshot"|"explosion"|"footstep"|"bark"|"impact", x,y,z, side, loudnessM, sourceId, isPlayer, time } */
  Hear(stimulus, listeners);             // listeners: 可迭代的 soldier；只对 side 不同、距离 < loudnessM 的人写 LKP
  /**
   * 每次 Think 调一次。candidates 是 Script_Ai 已经按距离筛过的槽（含 ref/isPlayer/id/position/stance/moving/firingRecently）。
   * 返回 { target: candidate|null, visible, awareness:0..1, alert, lkp:{x,y,z,time,confidence}|null, exposure:0..1 }
   */
  Sense(soldier, candidates, dtThink);
  Track(soldier, targetId);              // → { lkp, lastSeenAt, awareness, seenCount }
  Alert(soldier);                        // → ALERT.*
  Forget(soldier, targetId);
}
```

规则要点（数在 `PERCEPTION` 表里，名字自定但要带注释）：

- **视锥**：按警戒级别取半角（unaware 窄、alert 宽、engaged 对**当前目标** 360°，对新目标仍用视锥）；卧姿视锥更窄。
  视锥外的目标不累积视觉觉察，但仍能被听觉刺激写入 LKP。
- **觉察累积**：`rate = f(d/SightRange(目标姿态)) × 目标在动 × 目标刚开过枪（枪口焰 = 瞬间拉满） × 光照倍率（照明弹的 sightScale 已经乘进 SightRange，不重复）`；
  看不见时按 `decayPerS` 衰减；`SUSPICIOUS → ALERT → ENGAGED` 有迟滞，不许一帧内来回。
- **通视仍由 Script_Ai 传入的射线回调做**（沿用 `HasLineOfSight` 的三格缓存）：Perception 不自己射线，只消费 `candidate.visible`
  ——除非需要验证 LKP 的可见性（一次射线，带缓存）。
- **LKP**：目标可见时每次 Sense 刷新；不可见时保留 `memoryS`，置信度随时间衰减；听觉刺激写入的 LKP 置信度按 loudness / 距离折算。
- **班组共享**由 Tactics 的黑板做，Perception 提供 `Track` 读口即可。
- 目标锁迟滞（现有 1.2 s / 5 s / 0.5 倍距离换人）**搬进这里**，Script_Ai 不再自己写这段。

### 4.2 `Script_AiCover.mjs` + `Data_Tuning_AiCover.mjs`

职责：战术位置系统。掩体注册表、占用、对威胁的射线验证、侧翼判定、探头姿势。

```js
/** 统一三种字段名：{h|height, fx|faceX|nx, fz|faceZ|nz}；法线归一化；给稳定 id（按坐标哈希） */
export function NormalizeCover(raw) → { id, x, z, height, nx, nz, tall:boolean }

export class CoverRegistry {
  constructor(rawCovers, host);
  Rebuild(rawCovers);                    // 破坏后重建（Script_Destruction 会 filter battlefield.covers）
  Count();
  Claim(coverId, soldierId) → boolean;   // 已被别人占则 false
  Release(soldierId);
  OccupantOf(coverId) → soldierId|null;
  /**
   * 给一个兵找掩体。threats: [{x,y,z,stance,id}]（一般 1 个：当前目标或 LKP）。
   * opts: { radiusM, maxCandidates, maxValidate, towardX, towardZ, minAllySpacingM, allies:[{x,z}] }
   * 返回按 score 降序的候选（最多 maxValidate 个做过射线验证）：
   *   { cover, score, validated:boolean, blockedStanding, blockedCrouched, side:"left"|"right"|"over",
   *     hidePos:{x,z}, firePos:{x,z}, fireStance:0|1|2, hideStance:1|2 }
   */
  Query(soldier, threats, opts) → [];
  Validate(cover, threat) → { blockedStanding, blockedCrouched };   // 威胁眼位 → 掩体隐蔽位站/蹲眼高，各一条射线
  IsFlanked(cover, threat) → boolean;    // 威胁方向与掩体法线夹角 > FLANK_ANGLE，或威胁在掩体背面
  PeekPose(cover, threat) → { side, hidePos, firePos, fireStance, hideStance };
  Nearby(x, z, radiusM) → cover[];       // 空间散列，O(邻域)
}
```

规则要点：

- 空间散列（格 4 m），`Query` 只扫邻域，**不再全表随机抽样**。
- 打分（`COVER.weights` 表）：距离 / 估路代价（`Steer` 一次或直线 + Walkable 采样）、法线与威胁方向的对齐、
  高度类与威胁仰角、验证通过加分、占用惩罚、与友军间距惩罚（至少 `minAllySpacingM`）、
  「在我与威胁之间」硬条件、推进时朝 `toward` 加分（跃进用）。
- **矮掩体（height < tallM）**：hideStance = 1（蹲）或 2，firePos = hidePos，fireStance = 1（跪射，起身探头）；
  **高掩体**：hideStance = 1 或 0 贴墙，firePos = hidePos 沿掩体切线偏 `sideStepM`（取威胁能看见的一侧），fireStance = 0。
- 验证射线**只对前 `maxValidate` 个候选**做，每个最多两条；结果带时间戳缓存 `validCacheS`。
- `IsFlanked` 是重选掩体的主要触发；被判侧翼 → 大脑重新 Query。

### 4.3 `Script_AiShooting.mjs` + `Data_Tuning_AiShooting.mjs`

职责：从「决定打」到「这一发落在哪」的全部规则。**不产生画面、不扣血**，只返回结果给 `Script_Ai` 结算。

```js
export class ShootingModel {
  constructor(host);
  BeginAim(soldier, targetId);           // 换目标 / 从隐蔽探头出来：误差回到 initialErrorRad（按武器 / 姿态 / 压制）
  UpdateAim(soldier, dt, { moving, suppression, stance, targetMoving, exposedS });   // 误差按 convergePerS 收敛，受扰动扩散
  AimError(soldier) → rad;
  /**
   * 暴露采样：从 from 向目标的采样点（头 / 胸 / 骨盆 / 双膝，isPlayer 用 Script_PlayerHitbox 的几何，AI 用姿态偏移）逐条射线。
   * 返回 { fraction:0..1, visibleParts:[...], aimPoint:{x,y,z}|null }；aimPoint 取最靠近躯干中心的可见采样点。
   * 射线数 ≤ SHOOTING.exposureSamples，结果按 exposureCacheS 缓存在 soldier 上。
   */
  Exposure(soldier, from, targetSamples);
  LineOfFireClear(from, to, allies) → boolean;   // 友军胶囊落在射击走廊内 → false（不打自己人）
  /**
   * 结算一发。keepContracts：COMBAT.aiAccuracyBase 链、COMBAT.player.accuracyScale / 姿态折让 / firstShotGrace 全部保留在 Script_Ai 传入的 baseAccuracy 里；
   * 这里只叠 exposure 与 aimError 两项，并保证 fraction=1、误差收敛到底时命中率 == baseAccuracy（DamageTest 的 TTK 账不变）。
   * 返回 { hit, dir:{x,y,z}, aimPoint, missPoint:{x,y,z} }；missPoint 沿 aimError 散开且**在射击线上第一处实体前**（由 Script_Ai 射线求撞点）。
   */
  Resolve(soldier, from, aimPoint, { baseAccuracy, exposure, distance, rnd });
  BurstPlan(weapon, rnd) → { shots, intervalS, pauseS };   // 消费 aiBurstMin/Max；步枪 1 发；机枪 4–14 发 + 停顿
  SuppressPoint(lkp, cover) → {x,y,z};   // 目标藏起来后向哪儿打：LKP 或掩体沿上方 0.3 m
  MuzzleOrigin(soldier) → {x,y,z};       // soldier.actor?.weaponMuzzleWorld 若有，否则姿态高兜底
  LookPitch(from, to) → rad;             // 给 Actor 的 lookPitch
}
```

规则要点：

- **射线验证的是瞄点**：`Exposure` 的射线从 `MuzzleOrigin` 到各采样点；`fraction=0` 时**不许结算命中**，只能压制射击（打 `SuppressPoint`）。
  这一条同时修「隔墙打中玩家躯干」与「AI 只露头却按全身挨打」。
- 命中率 = `baseAccuracy × ExposureCurve(fraction) × AimErrorCurve(err)`；两条曲线在满暴露 / 零误差时都是 1。
- 压制射击：目标不可见但 LKP 置信度 > 阈值 → 以 `suppressIntervalScale` 的节奏向 `SuppressPoint` 打，
  命中永远为 false，但近失弹压制照旧（这就是「藏起来也有子弹擦过」）。**攻击令牌只限瞄准射击**：
  没拿到令牌的人转压制射击，压制不占令牌（否则「没令牌→去压制→压制又要令牌」是死循环；§4.4 同此口径）。
- 点射：`BurstPlan` 出 `shots/intervalS/pauseS`，Script_Ai 按它排 `fireTimer`。

### 4.4 `Script_AiTactics.mjs` + `Data_Tuning_AiTactics.mjs`

职责：班组层。黑板、攻击令牌、任务分配、侧翼点、跃进配对、投弹与撤退判定。

```js
export class SquadBlackboard {
  constructor(squadId, side);
  Share(soldier, track);                 // 成员把自己的 Track 合并进来（取最新 / 最高置信）
  Enemies() → [{ id, isPlayer, lkp, lastSeenAt, confidence, seenBy:number }];
  Primary() → enemy|null;               // 队级焦点（沿用 UpdateSquads 的 4 s 迟滞）
}

export const TASK = { ENGAGE:"engage", SUPPRESS:"suppress", FLANK:"flank", BOUND:"bound", HOLD:"hold",
  INVESTIGATE:"investigate", RETREAT:"retreat", GRENADE:"grenade" };

export class TacticsDirector {
  constructor(host, coverRegistry);
  Blackboard(squadId, side) → SquadBlackboard;
  /**
   * 每秒一次（挂在 UpdateSquads 后）。group 是 UpdateSquads 已算好的 { id, side, members, x, z, forwardX, forwardZ, focus }。
   * 给每个 member 写 soldier.task = { kind, point:{x,z}|null, targetId, until, partnerId }。
   */
  UpdateSquad(group, player);
  AcquireToken(targetId, soldierId) → boolean;   // 每目标同时射手上限：玩家用 COMBAT.maxShootersOnPlayer，AI 用 TACTICS.maxShootersPerTarget
  ReleaseToken(soldierId);
  FlankPoint(group, enemy, opts) → {x,z}|null;   // 在目标朝向锥（±flankMinAngle）以外、Walkable、附近有掩体、估路 ≤ flankMaxPathM
  BoundPairs(group) → [[mover, coverer]];        // 一动一掩护，交替
  ShouldGrenade(soldier, enemy, now) → boolean;  // 对方在同一掩体 ≥ holdS、距离 ∈ [minM,maxM]、冷却、班组预算、抛物线粗验（高度差）
  ShouldRetreat(soldier, group) → boolean;       // cohesion 低 / 压制高 / 损失比
  ShouldInvestigate(soldier, track) → boolean;   // alert 级别 + LKP 置信度 + 与守区距离
}
```

规则要点：

- 有 `holdZone` 的人任务只在 `HOLD / ENGAGE / SUPPRESS / GRENADE` 里选，且掩体查询限制在守区半径 + `holdCoverSlackM` 内；
  剧本旗（`scriptDefensive` / `p012Guided` / `emplacementId` / `meleeCombat` / `covert`）的人**不分配机动类任务**。
- 令牌：无令牌的人不做 ENGAGE，转 SUPPRESS（向 LKP）、BOUND 或 FLANK —— 这就是「不是九个人焊死一个人」的通用版。
- 侧翼：每班最多 `flankers` 人；侧翼点到位后转 ENGAGE。
- 跃进：ADVANCE 且有敌情时按对配：mover 走到下一掩体（`Query` 带 toward），coverer 在原掩体 SUPPRESS / ENGAGE，到位后互换。
- 投弹：只给带 `throwables` 的人；`Script_Ai` 用 `actor.RequestGrenadeThrow`（已有 `pendingGrenadeThrow` 通道）+ `combat.Throw` 落实。

---

## 5. 大脑重排（`Script_Ai.mjs`，第二波）

Think 的新顺序：

1. 压制衰减、剧本旗短路（VAULT / scriptedNoncombatant / dummy 保持原样）；
2. **感知**：组候选（沿用 nearSlots + `SightRange` 三处读点）→ `perception.Sense` → target / lkp / alert；
3. **黑板**：`blackboard.Share`；
4. **任务**：读 `soldier.task`（Tactics 每秒写）；没有任务时本地决策；
5. **状态选择**（效用式，带迟滞）：

| 状态 | 进入条件 | Act 里做什么 |
| --- | --- | --- |
| `IDLE / ADVANCE` | 无敌情 | 沿 goal / 队形走（原逻辑） |
| `INVESTIGATE` | alert ≥ suspicious 且有 LKP、无守区限制 | 走向 LKP，到了环视，超时回 ADVANCE |
| `COVER_ENGAGE` | 有目标 / LKP + 有掩体 | **周期**：hide(dwell) → peek(firePos/fireStance) → 点射 → hide；换弹只在 hide；被判侧翼 / 压制爆表 / 有手榴弹 → 换掩体 |
| `FIRE` | 有目标、附近没有可用掩体 | 原对射（站 / 蹲），同时持续 Query 掩体 |
| `SUPPRESS` | 无令牌或目标不可见但 LKP 新 | 在掩体里向 SuppressPoint 打 |
| `BOUND` | task=bound 且为 mover | 跑向下一掩体，到位转 COVER_ENGAGE |
| `FLANK` | task=flank | 沿导航去侧翼点，途中受压则就地找掩体 |
| `SUPPRESSED` | 压制 > 阈值（原逻辑） | 原逻辑 + 优先爬向验证过的掩体 |
| `RELOAD` | 空弹 | **先回 hide 再换**；无掩体则蹲下换 |
| `GRENADE` | ShouldGrenade | 走投掷通道；投出后回 COVER_ENGAGE |
| `RETREAT` | ShouldRetreat | 向己方重心 / 上一掩体带后退 |
| `CHARGE / VAULT / DEAD` | 原逻辑 | 原逻辑 |

6. `TryFire` 改为：令牌 → `MuzzleOrigin` → `Exposure`（含 `LineOfFireClear`）→ `fraction>0` 走 `Resolve`，否则压制射击 →
   画面 / 音效 / 结算沿用原代码（`PlayerHitPart`、`COMBAT.player` 各项不动）→ `lookPitch` 交给 Actor。

兼容表（必须全部保留）：`state` 字符串集合可以扩，但 `STATE` 导出与现有值不变；`soldier.cover` 仍是 `{x,z,height}` 形状
（新增字段不删旧字段）；`Debug.Range` / `EnemyCombatState` / `AiBehaviorTest` 读的字段不改名。

---

## 6. 第一关接入（`Script_FirstLevelMissionRuntime.mjs`）

- `Defend(actor, point)`：不再等价于「钉死 + 禁掩体」。语义改为「锚点 + 半径」：`scriptDefensive` 只禁**机动类任务**
  （不追击、不侧翼、不跃进出区），掩体查询允许在 `holdZone.radius + R.defendCoverSlackM` 内，探头周期照做。
  `hold:true` 的机枪手保持固定射击位（等价于战位），只做隐蔽 / 探头不换点。
- `UpdateAssault`：到线后先 `Query` 线附近（`R.assaultCoverSearchM`）的掩体，有就进掩体做 COVER_ENGAGE，没有才跪射；
  被压制（pinned）时优先爬向掩体再考虑退线。跃进线本身不变，`FirstLevelMissionTest` 的跳线相交检查保持通过。
- `ApplyScriptDefense` 不再 `s.cover = null`。
- 新数进 `Data_Tuning_FirstLevel.mjs`（`R.*`），不进 AI 表。

---

## 7. 性能预算

- Think 1/6 分帧不变；Act 每帧。
- 每次 Think 射线：感知 ≤ 2（沿用三格缓存）、掩体验证 ≤ 3 且只在（重）选掩体时（≥ `reselectMinS` 一次，被侧翼 / 手榴弹 / 掩体被炸例外）、
  暴露采样 ≤ `exposureSamples`（默认 3）且只在准备开火时、带缓存。
- 掩体 `Query` 走空间散列邻域，候选 ≤ `maxCandidates`（默认 16），验证 ≤ `maxValidate`（默认 3）。
- 热路径零分配：候选槽、采样点、临时向量全部复用（沿用 nearSlots 的写法）。
- 验收口径：`Script_FirstLevelFrameProbe.mjs` 三机位、同机交替 A/B（旧→新→旧→新），profiler `ai` 桶均值 **≤ 基线 + 1.0 ms**，
  P95 ≤ 基线 + 2.0 ms；`allocKbPerFrame` 不升。

---

## 8. 可读性

- 喊话：在现有 `Bark(kind)` 上加 `flank` / `cover` / `grenade` / `suppress` / `lost`（找不到目标）五类；先查 `Data_Voice.mjs`
  已有的行，没有的按 `Script_VoiceBake` 流程列清单，**没有音频时静默降级**（不阻塞行为）。
- 动画：矮掩体 = 蹲藏 / 跪射（现有 crouch blend + CrouchFire），高掩体 = 站姿贴墙 + 侧步探头（位移 + aim blend），
  换弹 = 蹲藏 + 现有换弹姿态；`lookPitch` 接入。不做新 clip。
- 调试：`Debug.Ai.State(id?)`（感知 / 任务 / 掩体 / 令牌 / 暴露）与 `?aidebug=1` 覆盖层（每人头顶一行文字：state/task/alert/exposure，掩体点画法线与占用色）。

---

## 9. 验收标准

纯 Node（登记进 `Script_TestRunner.mjs` 的 `testDefs` + `tier0Fast` + `domains.ai`）：

- `Script_AiPerceptionTest.mjs`：视锥内外累积差异、觉察迟滞不抖、枪声写 LKP、LKP 衰减与遗忘、目标锁迟滞。
- `Script_AiCoverTest.mjs`：三种字段名归一、空间散列邻域、验证射线（假 Raycast）判 blocked、侧翼判定、占用互斥、
  矮 / 高掩体的探头姿势、打分单调性（更近 / 更对 / 已验证更高）。
- `Script_AiShootingTest.mjs`：误差收敛与扰动、暴露采样（假射线）、`fraction=0` 不命中、满暴露零误差 == baseAccuracy、
  友军在走廊内不开火、点射计划消费 `aiBurstMin/Max`、压制点。
- `Script_AiTacticsTest.mjs`：令牌上限、侧翼点在正面锥外且可走、跃进配对交替、投弹条件、撤退条件、剧本旗不分配机动任务。
- 既有必过：`DamageTest`（TTK 不变）、`PlayerHitboxTest`、`EmplacementTest`、`FlareTest`（三处 SightRange 读点）、
  `MeleeCombatTest`、`FirstLevelMissionTest`、`TextTest`、`ModuleGraphTest`、`TestRunnerTest`。

浏览器（`Script_AiCombatBrowserTest.mjs`，新；`Script_AiBehaviorTest.mjs` 旧阈值全部保留）：

1. **会躲**：`?whitebox=p012` 前沿开战后 20 s 内，非剧本钉死的活敌中 ≥ 60% 处于已验证掩体（`cover.validated` 且距 hidePos < 1.2 m）；
2. **躲得有节奏**：在掩体的敌人 12 s 采样里隐蔽帧占 40–80%，且每人 ≥ 1 次 hide→peek→hide；
3. **不隔墙打人**：把玩家摆到只露眼睛的矮墙后 30 s，敌人开火 ≥ 40 发、玩家受伤 = 0；把玩家摆到空地 30 s，受伤 > 0；
4. **换弹在掩体里**：≥ 80% 的 RELOAD 进入帧处于 hide；
5. **会绕**：开阔交火 60 s 内至少 1 名敌人拿到 FLANK 任务并到达玩家正面 ±60° 以外的点；
6. **会扔**：玩家在同一掩体 > `GRENADE.holdS` 且 25 m 内，60 s 内 ≥ 1 枚敌方手榴弹落在 6 m 内；
7. **不抽搐**：沿用 AiBehaviorTest 的瞬转 / 蹲起 / 换目标阈值；
8. **无脚本错误**；
9. 性能：第 7 节口径（独立跑 FrameProbe，不进门禁）。

视觉：前沿机位截图里能看出人贴着掩体、探头射击；覆盖层截图留本地 `_shots/EnemyAi/`。

---

## 10. 分包与顺序

**第一波（并行，四个 agent，只建新文件，不碰共享文件）**

| agent | 拥有的文件 | 禁区 |
| --- | --- | --- |
| Perception | `Script_AiPerception.mjs`、`Data_Tuning_AiPerception.mjs`、`Script_AiPerceptionTest.mjs` | 不改 `Script_Ai` / `Script_Main` / `index.html` / `Script_TestRunner` |
| Cover | `Script_AiCover.mjs`、`Data_Tuning_AiCover.mjs`、`Script_AiCoverTest.mjs` | 同上；掩体生产方（WallPlan / World / City）只读，归一在注册表入口做 |
| Shooting | `Script_AiShooting.mjs`、`Data_Tuning_AiShooting.mjs`、`Script_AiShootingTest.mjs` | 同上；`Data_Battle.COMBAT` 只读 |
| Tactics | `Script_AiTactics.mjs`、`Data_Tuning_AiTactics.mjs`、`Script_AiTacticsTest.mjs` | 同上；可 import `Script_AiCover` 的导出（按本文契约） |

每个 agent 交付：模块 + 表 + 纯 Node 测试（`node Taierzhuang1938/Script_Ai<X>Test.mjs` 退出码即成败）+ 文件头注（职责 / 契约 / 为什么）
+ 一段「给集成者的登记清单」（import map 行、testDefs 行、domains.ai 行）。

**第二波（单个 agent）**：大脑重排（第 5 节）、第一关接入（第 6 节）、`Script_Main` 刺激上报（`MarchBullet` 玩家开枪 → `Hear`，
`Blast` → `Hear`，AI 开火 → `Hear`）、`Debug.Ai` 与覆盖层、喊话、`index.html` 戳与登记、`Script_TestRunner` 登记、
`Script_AiCombatBrowserTest.mjs`、`Script_AiBehaviorTest` 保持通过、文档回写（本文第 11 节「实装记录」）。

**第三波（验收）**：quick + `--domain=ai` + `--domain=combat` + 新浏览器测试 + FrameProbe A/B + 前沿截图 + `FirstLevelMissionBrowserTest --campaign`
（长，后台跑）→ 提交、快进推 master、核对线上戳。

---

## 11. 非目标

- 不做新动画 clip、不做载具 AI、不做投降 / 施救 / 电台（ER2 清单里的那些另议）。
- 不改玩家侧手感、不改 `COMBAT.player` 与 TTK 账、不改难度档语义。
- 不上 A*；导航仍是距离场 + 局部避障，侧翼点只在导航场可达范围内选。
- 不追求单兵「聪明」：所有决策都要便宜到 1/6 分帧下 110 人可跑。

---

## 12. 实装记录（2026-09-08，第二波：集成）

四个模块（第一波）已经接进大脑、接进正片第一关、接上装配层与验收探针。
**数一个都没有另存一份**：新增的阈值全部落在 `Data_Tuning_Ai.BRAIN`（适配层自己的信号阈值）
与 `Data_Tuning_FirstLevel.MISSION_TUNING`（关卡编排），四张模块表原样不动。

### 12.1 改了哪些文件

| 文件 | 一句话 |
| --- | --- |
| `Script_Ai.mjs` | 大脑重排：构造四个模块 + host 适配器、感知走 `Sense`、`TryFire` 换成暴露采样 + `Resolve`、七个新状态、掩体选点与探头周期、投弹通道、`Debug.Ai` 快照 |
| `Data_Tuning_Ai.mjs` | 新增 `BRAIN`：适配层自己要的阈值（什么算在动、什么算刚开过枪、掩体微走位的到位半径与速度、射击走廊半径、投弹三个数、枪口同步余量） |
| `Script_Main.mjs` | 三处刺激上报（玩家开枪 / AI 开枪 / 爆炸）、`player.lastShotAt`、`ai.ctx.combat` 接线、`Debug.Ai`、`?aidebug=1` 覆盖层 |
| `Script_Combat.mjs` | `Throw` 接受 `{owner, ownerId}`（默认仍是 "player"）、`Projectile.ownerId`、`Detonate` 按 owner 定 `hurtSide` / `byPlayer`、`Blast` 把 `ownerId` 交给 `onBlast` |
| `Script_FirstLevelMissionRuntime.mjs` | `Defend` 改「锚点 + 半径」并带 `coverSlackM`、跃进到线与被压制时放开掩体搜索半径、日军步兵发两枚手榴弹 |
| `Data_Tuning_FirstLevel.mjs` | `defendHoldRadiusM` / `defendCoverSlackM` / `defendHoldFixedSlackM` / `assaultCoverSearchM` / `enemyGrenades` |
| `index.html` | 八个新模块登记进 import map，改到的模块与入口一起抬 `?v=202609081900` |
| `Script_TestRunner.mjs` | 四条纯 Node 探针进 `testDefs` / `tier0Fast` / `domains.ai`；`AiShootingTest` 也进 `domains.combat`；`AiCombatBrowserTest` 进 `testDefs` / `browserTests` / `domains.ai`；`changedDomainRules` 加 `Data_Tuning_Ai` → ai 域 |
| `Script_AiCombatBrowserTest.mjs` | 新：本文 §9 浏览器那一半的验收探针 |
| `Script_DamageTest.mjs` | 靶场归一化补三样（攻击令牌租约、瞄准状态、玩家速度），射手方位按射线挑（见 12.5） |
| `Script_AiBehaviorTest.mjs` | 过热对账那一段把场上暂时只留机枪手（射击走廊是新加的闸，见 12.5） |

### 12.2 状态机最终表（`STATE` 只增不改）

旧的九个值一个字都没动（`Threatens` 认 "suppressed"、`AiBehaviorTest` 认 "charge"/"advance"、
P012 冒烟认 fire/charge/bayonet/melee）。新增七个：

| 状态 | 进入条件（Think 里从上到下） | Act 里做什么 |
| --- | --- | --- |
| `SUPPRESSED` | 压制 > 0.50（原逻辑） | 原逻辑 + **优先爬向验证过的掩体** |
| `RELOAD` | 空弹（原逻辑） | **先缩回 hide 再换**；没掩体就地蹲下换 |
| `CHARGE` | 原逻辑 + **记忆目标不许发起**（只听见没看见不冲锋） | 原逻辑 |
| `GRENADE` | 班组派了 `TASK.GRENADE` 且身上有弹 | 转身到位 → `BeginGrenadeThrow` → `combat.Throw`（owner = 本方） |
| `FLANK` / `BOUND` / `INVESTIGATE` / `RETREAT` | 班组派了机动任务且给了点位。**排在对射前面** —— 排在后面的话交战距离（74 m）之内永远轮不到，侧翼手拿了任务却站着开枪 | 走到 `task.point`；枪口方向闸自己会挡住「横着跑还往侧后方打」 |
| `COVER_ENGAGE` | 有掩体，且看得见目标或最后目击位置够新 | hide → peek → 点射 → hide（`COVER_CYCLE` 定节拍），**只在探头相位开火** |
| `SUPPRESS` | 看不见但知道他在哪 | 向最后目击位置 / 掩体沿压制射击 |
| `FIRE` | 有目标但身边没有可用掩体 | 原对射（`FireStance` 决定站还是蹲） |
| `ADVANCE` / `IDLE` / `VAULT` / `DEAD` | 原逻辑 | 原逻辑 |

**两条阈值故意不合并**：`FireStance` 的「掩体高 < 1.25 m 就蹲」问的是「对射要不要蹲」，
`COVER.tallM = 1.55` 问的是「这堵墙该怎么藏、怎么探头」。前者只在 `FIRE` 用，后者只在
`COVER_ENGAGE` 用，两条不会同时作用在一个人身上。

### 12.3 host 适配（`AiDirector.aiHost`）

四个模块共用同一份（§3 的形状）。三条要点：

1. **射线只认静态世界。** `Script_Physics` 的默认 `IG_RAY_WORLD` 是
   `InteractionGroups(QUERY, WORLD)`，人物胶囊是 `IG_CHARACTER` —— 射手与目标自己的碰撞体
   都不在里面，`terrain` 也默认 false。所以暴露采样与 `HasLineOfSight` 用的是同一个世界，
   不需要 `excludeCollider`（§3 里那条「接上后必须实测」的问题：答案是**不会打到人**）。
2. `SightRange` 是照明弹倍率的唯一入口；感知层不再乘第二次（`FlareTest` 的源码对账仍然是
   「`SIGHT_BY_STANCE` 只许被下标读一次、`this.SightRange(` 至少三处」，接入后仍然满足）。
3. `BlocksSight` 转给 `ctx.BlocksSight`（第一关运行时，**含地形**）。这一条决定了
   「AI 看不看得见」，验收探针挑实验场地时必须用同一条判据，否则量的是地形不是 AI。
4. `TryFire` 扣弹前通过 `ShootingModel.ShotPathClear` 重新检查枪口到实际瞄点，
   瞄准与压制射击都适用，不复用暴露缓存。被挡住不能直接退成朝墙压制；
   可达的掩体沿、最后目击点仍可射击。`AiCloseRangeTest` 覆盖四名国军对真实关卡墙体、
   缓存未过期时新增遮挡、无遮挡但令牌已满的压制射击，断言开火数、耗弹与压制量。

### 12.4 第一关接入的实际做法

- `Defend(actor, point, radius, coverSlackM)`：语义从「钉死 + 禁掩体」改成「锚点 + 半径」。
  `ApplyScriptDefense` 里那句 `s.cover = null` **删掉了** —— 它就是「正片里的敌人在设计上
  被禁止找掩体」的字面原因。`scriptDefensive` 现在只表示「不许追击、不许绕后、不许跃进出区」
  （`Script_AiTactics.IsScripted` 的口径），能不能躲另说。
- `Act` 的 scriptDefensive 分支改成读 `ScriptDefenseSpot(s, anchor)`：掩体微走位只要落在
  `holdZone.radius + scriptCoverSlackM` 内就放行。机枪位（`spec.hold`）的余量只有
  `defendHoldFixedSlackM = 0.9 m` —— 够一个探头的侧步，不够换点。
- `UpdateAssault`：到线后 `Defend(actor, target, 2, assaultCoverSearchM)`；被压制（pinned）
  时同样放开搜索半径，让他爬进旁边的东西而不是躺在空地上等死。
- 日军步兵发两枚手榴弹（`enemyGrenades`，史实：九一式 / 九七式手榴弹每人两枚；机枪位不发）。
  投掷走**玩家那条链**：`actor.BeginGrenadeThrow(release)` → `combat.Throw("Grenade", …,
  { owner: "ija", ownerId })`。`Combat.Throw` 原来把 owner 写死成 "player"，
  于是 `Detonate` 会把日军的弹算成「玩家扔的」—— 伤日军、给玩家记击杀。现在 owner 透传：
  日军的弹 `hurtSide = "nra"`（伤中方；玩家在 `Blast` 里单独结算，照样炸得到他）、
  `byPlayer = false`（不给玩家记击杀）、HUD 的返掷提示按 `owner !== "player"` 立刻报警。

### 12.5 门禁结果（2026-09-08 实跑）

纯 Node，全绿：`AiPerceptionTest` / `AiCoverTest` / `AiShootingTest` / `AiTacticsTest` /
`ModuleGraphTest` / `TextTest` / `TestRunnerTest` / `PlayerHitboxTest` / `FlareTest` /
`EmplacementTest` / `MeleeCombatTest` / `MissionHooksTest` / `FirstLevelP012RuntimeTest` /
`FirstLevelMissionTest` / `VisibilityTest`。

浏览器：

- `BootTest` 七章全过。
- `DamageTest` **24/24**：靶场命中率 16%（接入前 19%）、三人 25 m 站姿 TTK 中位数 **16.1 s**
  （闸门 8—24 s，与 docs/Data_PlayerDamage.md 记的 16.1 s 一致）；姿态梯度 立 20.5 / 蹲 33 / 卧 35.9 s。
- `AiBehaviorTest` 旧阈值全过：瞬转 4.77°、蹲卧 blend 0.069、换目标最多 6 次、
  支援位误冲 0 帧、过热 200 发、移动同向 94.7%、队向服从 88.4%。
- `RangeTest` / `FirstLevelMissionPresentationTest` 通过。
- `AiCombatBrowserTest` **11/11**（详见 12.6）。

**三处测试归一化**（都是「把要量的东西单独拎出来」，不是放宽断言）：

1. `DamageTest`：靶场循环里时间不推进，攻击令牌的租约永不过期，场上别人握着的名额会让
   三个射手里有一两个整趟只能压制射击 → 每局 `ai.tactics.Reset()`；瞄准收敛状态跨局残留 →
   每局 `ai.shooting.Detach()`；`TakeHit` 的 knockback 没有摩擦衰减，挨过一发之后玩家的
   `velocity` 一路攒到 9 m/s，而新的射击模型按「目标在动」扩散瞄准误差 → 每步归零。
   射手方位改成按射线挑（十二个方位取「三个人都看得见玩家」的那个）：这一关的空地上就有院墙，
   随手取 0° 总有一两个人正对着一堵墙 —— 旧代码不验射线，隔着墙照样打中，所以看不出来。
2. `AiBehaviorTest` 的过热对账：目标是正东三十米外一个虚构点，而新加的「射击走廊里有自己人
   就不扣扳机」闸在实测 500 次尝试里挡掉 313 次 → 那一段把场上暂时只留机枪手本人。
3. `AiCombatBrowserTest` 的受控实验：把场上清成「一个班对一个玩家」（同时锁玩家的名额是全场
   共享的三个、具名同伴会跟着玩家跑、`ai.fireCount` 是全场计数）。

### 12.6 验收探针的六条（`Script_AiCombatBrowserTest`，实测数）

| 条 | 实测 |
| --- | --- |
| ① 会躲（受控） | 窗口内 **6/6** 进了验证过的掩体；钉回射击线之后 5/6 |
| ① 会躲（正片前沿） | 选上掩体 6（全部验证过）、在跑周期 6；**24/42 的日军身边一个掩体点都没有**（见 12.7） |
| ② 躲得有节奏 | 隐蔽帧 **59%**（闸门 40—80%），**6/6** 跑满 hide→peek→hide |
| ③ 不隔墙打人 | 同一支枪、同一段距离（34 m）：墙后连打 60 发 —— 瞄准 0 / 压制 60、掉血 **0**、最大暴露 **0**；空地对照 60 发全是瞄准射击、掉血 **356.4**、暴露 1 |
| ④ 换弹不在探头相位 | **4/4** |
| ⑤ 会绕 | 60 s 内派活 280 次、绕出正面锥 143 次、最大偏角 **107°** |
| ⑥ 会扔 | 投出 1 枚，最近落点离玩家 **0.6 m** |
| ⑦ 取证口 | `Debug.Ai.State()` / `State(id)` / 覆盖层 31 条标签 |
| ⑧ 无脚本错误 | 通过 |

③ 那一条是这一轮的**头条**：`Volley` 把射手摆到验证过的射击位、目标焊死成玩家，连打 60 发。
墙后那一趟一发瞄准射击都没有（暴露恒 0 ⇒ `Resolve` 永不命中），空地那一趟 60 发全是瞄准射击。
接入前同样的机位会隔着墙打中躯干 —— 那正是 §2.3 的第一条病根。

### 12.7 未做项与偏离

1. **正片前沿的「≥60% 在掩体里」没有压死，改成「掩体接入是活的」。**
   实测：42 个交战中的日军里 **24 个身边（够得着的范围内）一个掩体点都没有** ——
   第一关的前沿是开阔地，日军是跃进冲击过来的；剩下的人每三秒左右就被 `UpdateAssault`
   拽向下一条跃进线，走不完那五到八米。**在没有掩体的地方「会躲」不可能成立**，
   把它混进分母只会让断言变成一句谎话。严格的 60% 压在受控实验里（6/6 通过）。
   **留给内容侧的账**：前沿要不要补掩体点（弹坑、土堆、断墙），以及跃进的 `assaultHoldS`
   要不要给「走到掩体」留时间 —— 这是关卡内容的取舍，不该由 AI 层偷偷改。
2. **压制射击会消耗弹药、也会推高全场开火数。** 接入前「看不见就闭嘴」，现在看不见也向
   最后目击位置打。实测受控场里瞄准 : 压制 ≈ 1 : 1。换弹次数与弹药消耗跟着上去了，
   目前没有发现节奏问题，但这是一条值得盯的账。
3. **`FlankPoint` 的正面锥用了玩家的真实朝向**（方案 §4.4 原本就这么写的，属于有意开的一点
   天眼）：不知道正面就绕不成侧翼。代价是玩家转身时侧翼点会重算。
4. **lost（跟丢了）这一类喊话没有音频**，`Bark` 找不到 key 时静默返回 null。
   补词走 `Script_VoiceBake` 流程，补完在 `BARK_LINES` 里加一行即可。
   已接线的四类用的都是**现成的**词：中方 move_cover / move_flank / warn_grenade / rally_shoot，
   日方 ija_warn_cover / ija_move_flank / ija_warn_grenade / ija_rally_suppress。
5. **性能 A/B 没跑。** §7 的 `FrameProbe` 三机位交替对照留给验收批（`ai` 桶均值
   ≤ 基线 + 1.0 ms）。已做的预算控制：`UpdateCover` 受 `COVER_CYCLE.reselectMinS` 限流
   （「身上没有掩体」**不算**紧急重选 —— 前沿有 24 个人身边根本没有掩体点，当成紧急的话
   每次 Think 都要重查一遍，52 个人就是每秒五百次 Query、上千条验证射线）；
   暴露采样 ≤ 3 条且带 0.25 s 缓存；`FriendlyTorsos` / `CoverAllies` / 候选槽全部复用。
6. **`FirstLevelMissionBrowserTest --campaign`（约 26 分钟）没跑** —— 按分工留给验收。
   它的前置（boot + 前几个阶段）已由 `FirstLevelMissionTest` 与
   `FirstLevelMissionPresentationTest` 覆盖，两条都过。
7. **`Script_Ai` 里两处顺手修掉的旧洞**（都会被这一轮放大，所以一起改了）：
   `PlayerHitPart` 原来借 `this.tmpD` 当临时向量，而 `Act` 的 `desired` 用的就是它 ——
   一边跑向掩体一边开枪时，目标点会被就地改成一条归一化的射击方向；
   `Remove()` 原来不放攻击令牌与掩体占用，换关全场撤场时一次能漏掉几十个名额。
8. **`ReviveTargetFromMemory` 是方案里没写的一条。** 目标锁掉了但记忆还新时，把它接回成
   「记忆目标」（位置用 LKP、`targetVisible` 恒 false ⇒ 只压制射击、不占锁玩家的名额、
   不许发起白刃冲锋）。不加这一条的话，听见背后一枪的人会落回 ADVANCE ——
   有守区的人连挪都不挪，站在原地等下一发，也就是 §2.1 说的「看不见就发呆」没修干净。
   接一个新的要够可信、留住手上这个只要记忆还在（两把尺的迟滞），
   否则十二秒能换十几次目标，`AiBehaviorTest` 的「不来回甩枪口」会翻红。

### 12.8 验收时怎么看

- **覆盖层**：地址栏加 `?aidebug=1`，或运行时 `window.Taierzhuang.Debug.Ai.Overlay(true)`。
  每人头顶三行英文：`side#id state/task`、`alert exp=暴露 sup=压制`、`cover 侧/相位/探头次数`。
  掩体颜色就是「这个点靠不靠得住」：绿 = 验证过、黄 = 选上但没验证、红 = 没掩体。
  只画视锥内 120 m 以内、最多 40 个人；**不进渲染管线**，开着也不改画面。
- **快照**：`Debug.Ai.State()` 出全场直方图（状态 / 任务 / 警戒 / 掩体 / 令牌 / 计数），
  `Debug.Ai.State(id)` 出一个人的完整快照（感知 / 任务 / 掩体 / 令牌 / 暴露 / 瞄准误差 / 携行弹）。
- **前沿机位**：`?whitebox=p012&shot=1&manual=1`，把 trainShelling / trainStopped /
  unloadOrdersHeard / unloaded 四个事实记进 `Debug.FirstLevelMissionRuntime()`，
  再把玩家传送到 `MISSION_ANCHORS.gun`（0, −128）朝北 —— 与 `Script_FirstLevelFrameProbe`
  同一条配方。想看「躲得有节奏」请看 `AiCombatBrowserTest` 的受控场（那儿有墙）；
  前沿看的是「有掩体的人真的进去了」与「大多数人身边没有掩体」这两件事本身。

---

## 13. 验收记录（2026-09-08，第三波：独立验收）

验收者不是集成者。所有数字都是验收批自己重跑出来的，集成报告里的数只当线索。

### 13.1 门禁（rebase 到 master 22949286c 之后重跑）

| 门禁 | 结果 |
| --- | --- |
| `TestRunner --changed=origin/master --profile=quick` | 62 项通过（含四条新纯 Node 探针），历史基线 0 |
| `ModuleGraphTest` / `TextTest` / `TestRunnerTest` | 绿（入口戳 `202609091300`，318 个模块登记；144/144 测试登记） |
| `AiPerception 11 项` / `AiCover 100` / `AiShooting 全部` / `AiTactics 250` | 绿 |
| `DamageTest` | 24/24；姿态梯度 立 19.1 / 蹲 27.9–36.7 / 卧 29.3–44 s（三次重跑），「趴下比站着活得久」始终成立 |
| `AiCombatBrowserTest` | 11/11：墙后 60 发瞄准 0 / 压制 60、掉血 0；空地对照 60 发瞄准 60、掉血 356；隐蔽帧 59%、6/6 跑满周期；换弹在隐蔽相位 4/4；绕出正面锥最大 106–108°；投弹 1 枚落点 0.6 m |
| `AiBehaviorTest` | 12/12（rebase 前后各通过一次；期间有两次在机器满载时「单帧瞬转」读到 7.10° 而非 4.77°，见 13.4） |
| `BootTest` | 七章全过 |
| `FirstLevelMissionTest` / `FlareTest` / `EmplacementTest` / `MeleeCombatTest` / `PlayerHitboxTest` / `FirstLevelP012ActorTest` | 绿 |
| `FirstLevelMissionBrowserTest --campaign` | rebase 前：真实输入整关通关，28 分钟；rebase 后先在 `CourtyardColumn` 撞三角形预算（见 13.4 第 4 条），加远景尸体距离上限后重跑，结果见本表末行 |
| `FirstLevelMissionBrowserTest --campaign`（最终，含远景尸体上限） | 真实输入整关通关，27 分钟；`CourtyardColumn` 6.88 M（此前 9.15 M），全程最高 `South` 8.04 M（master 同点 7.90 M） |

### 13.2 改前 / 改后实拍（正片前沿，`MISSION_ANCHORS.gun` 机位，开战 20 s）

| 量 | 改前（e1f235703） | 改后 |
| --- | --- | --- |
| 处于掩体点 1.2 m 内的交战日军 | **0 / 38** | 11（全部射线验证过），6 人在隐蔽相位 |
| 压制射击 / 瞄准射击 | 无压制射击这回事 | 208 / 284（20 s 累计） |
| 探头次数（20 s） | 无此机制 | 46 |
| 掩体选点 / 暴露采样射线（20 s 累计） | — | 103 次选点、1022 条射线（≈ 50 条/s，远低于 §7 预算） |
| 40 s 时 idle 的日军 | 20 / 34 | 15 / 38（前沿开阔地，跃进到线后无掩体者跪射、有掩体者进掩体） |

前沿本身的地形事实没变：24/42 的日军身边够得着的范围里没有掩体点（§12.7 第 1 条）。
「会躲」在**有东西可躲**的地方成立（受控场 6/6），前沿要不要补掩体点是关卡内容的账。

### 13.3 性能（`Script_FirstLevelFrameProbe`，1536×864 high，同机交替 A/B，四轮）

`ai` 桶均值（ms）：

| 机位 | 基线（四轮） | 改后（剔除两次被外部负载污染的读数） | 差 |
| --- | --- | --- | --- |
| train | 8.1 / 10.0 / 9.9 / 7.7 | 9.5 / 8.2 / 9.1 | ≈ 0 |
| front | 4.3 / 5.1 / 5.6 / 4.2 | 5.4 / 5.5 / 5.6 | **≈ +0.7** |
| frontEast | 2.8 / 3.0 / 3.6 / 2.7 | 3.5 / 4.0 | ≈ +0.7 |

同一构建两轮之间本来就有 ±1 ms 的抖动，所以单轮读不出 1 ms 以内的差；四轮合起来看，改后前沿机位约 **+0.7 ms**，
在 §7 的「≤ 基线 + 1.0 ms」之内但不算宽裕。draw call / 三角形 / 分配三项确定性指标没有变化。
后续若要收回这 0.7 ms，先用 `Script_FrameProfiler` 把 `ai` 桶拆成 Think / Act / 尸体三段再说，不要盲改分帧比例。

### 13.4 验收批做的改动与取舍

1. **手榴弹节奏**（`Data_Tuning_AiTactics.GRENADE`）：`holdS` 3 → 5 s、`squadCooldownS` 12 → 20 s。
   证据：改后前沿实拍 40 s 里日军投出 12 枚；玩家在空地站定十来秒就有两枚落在脚边（1 m / 4 m）。
   手榴弹要保持「事件」的分量；`AiCombatBrowserTest` ⑥ 在新数下仍通过。
2. **rebase 顺手修的两处**（master 在本轮期间前进了 20 个提交）：
   - `TryFire` 里 master 新接的近失弹音频钩子 `AiNearMissAtPlayer(s, from, dir, to, miss)` 引用的 `to`
     在重排后的 `TryFire` 里已不存在（瞄点现在叫 `aimV`）——自动合并不报冲突但一开枪就是 ReferenceError，已改成 `aimV`；
   - `ApplyScriptDefense` / `Think` 的换弹音频钩子写成 `this.ctx.audioWiring?.`，而 `FirstLevelP012ActorTest`
     用无 ctx 的沙箱宿主重放这两段源码，**master 自身就是红的**；改成 `this.ctx?.audioWiring?.` 后绿。
3. **`AiBehaviorTest` 的「单帧瞬转」在机器满载时读到 7.10°**（阈值 4.93°），机器空闲时两次都是 4.77°。
   `TryVault` 起跳那一帧直接写 `s.yaw`（2564 行）是唯一一处不走 `ApproachAngle` 的转向，而导航场 BFS 的
   毫秒预算是按墙钟算的，负载一重就退回直奔目标、更容易撞墙起翻越。这是 master 上本来就有的机制，
   本轮的掩体微走位可能让它更常被触发；没有改它，记在这里等下一轮把翻越起手也过 `ApproachAngle`。

4. **院落回望前沿的整帧三角形预算**（`FirstLevelMissionBrowserTest --campaign` 的 `CourtyardColumn` 捕获）：
   rebase 到 master 22949286c 之后，改后读到 **9.15 M**（限 8.1 M）；同机同法跑 master 本身两次，
   一次通关、一次在同一捕获点读到 **8.16 M 也红** —— master 自己已经贴线。差额来自远景层里的尸体与前沿幸存者：
   那一帧相机回望两百米外的前沿，六七十具尸体每具按远景整模烘（约一万面），改后前沿打得更狠（压制射击 + 手榴弹）
   多出二十来具，就越了线。处理：`ACTOR_DETAIL.corpseCrowdMaxM = 160`，远景层里 160 m 外的尸体不画
   （三个像素高，看不见），**活人不受限**（视锥内每个活人都要看得见的内容硬规则不动）。
   `Script_FirstLevelMissionBrowserTest` 的预算捕获同时改成每次都打印 `BUDGET <点> {三角形, 活人/尸体/LOD 分布, 按根节点拆的三角形}`，
   下次再贴线时不用猜是谁在花。

### 13.5 留给下一轮

- 前沿掩体点密度（关卡内容）；`assaultHoldS` 给「走到掩体」留时间。
- `ai` 桶拆段剖析，收回前沿机位那 ~0.7 ms。
- `lost` 类喊话补音频；日军侧喊话表只有四类。
- 翻越起手的转向过 `ApproachAngle`（见 13.4 第 3 条）。

---

## 14. 敌军 AI 编辑器（2026-09-08 第二轮：看得见、改得动）

### 14.1 3A 是怎么配置敌军 AI 的

| 层 | 3A 的做法 | 工具 |
| --- | --- | --- |
| 行为结构 | 行为树（UE Behavior Tree、Halo 的行为 DSL、GOAP/HTN 规划器：F.E.A.R.、Horizon） | 可视化的树/图编辑器，运行时**高亮当前节点**，能看到为什么选了这条分支 |
| 黑板 | 感知写、行为读的共享状态（目标、最后目击位置、警戒级别、掩体、任务） | 黑板检视器：逐字段实时值 |
| 感知 | 视锥 / 听觉 / 记忆的参数化模型 | 视锥、通视线、LKP 标记画在世界里（UE Gameplay Debugger、TLOU 的 AI debug draw） |
| 战术位置 | 掩体点 / EQS 查询 | 掩体点按验证结果与占用上色，能看到候选打分 |
| 档案 / 数值 | 数据资产（DataTable / 原型 archetype）：命中、反应、攻击性、掩体偏好、投弹 | 属性面板 + 曲线，改完热更新，存回资产文件走版本管理 |
| 遭遇编排 | 关卡设计师的 encounter 工具：出生、波次、目标区、剧本旗 | 关卡编辑器里的体积与触发器 |
| 验证 | 固定试验场（AI arena）+ 指标（掩体率、命中、暴露时长） | 一键复现的沙盒 + 数据面板 |

本项目对应：行为结构是 `Script_Ai` 的状态选择（§5、§12.2），黑板是 `SquadBlackboard` + 每人的 `perception / task / cover / shooting`
字段，感知/掩体/射击/战术四张表就是「数据资产」，`Script_AiCombatBrowserTest` 的受控场就是 AI arena。
缺的是把这些**画出来、连起来、改得动、存得回**的那一层——本轮做的就是它。

### 14.2 目标

`Script_EditorAi.mjs`：编辑器套件里的一个**叠加层**（与 Debug Rendering / Profiler 同组：不接管相机、不暂停玩法、`keepOnClose`），
在正片里边打边看。六个分节：

1. **概览**：全场状态直方图（每个状态多少人）、任务直方图、警戒分布、掩体统计（选上/验证过/隐蔽中）、令牌、射线/秒、压制:瞄准比、探头数。
2. **行为图**：`Data_AiBrainGraph.mjs` 声明的状态节点与转移边画成 SVG；节点上显示当前人数；选中一个兵时高亮他所在节点与最近走过的边；
   边上写触发条件与它读的表键，点边跳到「调参」里对应的滑杆。
3. **单兵**：按距离排序的活人列表（或「跟随最近的敌人」），Facts 显示 `Debug.Ai.State(id)` 的全部字段（状态/任务/警戒/觉察/目标/LKP/掩体/相位/探头/令牌/暴露/瞄准误差/携弹），
   下面一条 30 s 的状态时间带（每次状态切换一格）。
4. **世界叠加**：three 线段/点（不用 addon）画选中者的视锥、到目标的通视线（通=绿/挡=红）、LKP 标记、掩体的隐蔽位/射击位、任务点、班组连线；
   附近掩体点全部按「验证过=绿 / 选上未验证=黄 / 被占=蓝 / 无=灰」上色；每层一个开关；头顶标签复用 `?aidebug=1` 那套。
5. **调参**：把五张表（`Data_Tuning_AiPerception / AiCover / AiShooting / AiTactics`、`Data_Tuning_Ai` 的 `BRAIN / ENGAGE / SQUAD`）的数值叶子
   自动列成滑杆（按表/组分组，范围按默认值推 0—4 倍，布尔用开关）。**改了立刻生效**（表在本地是可变的，见 14.4）。
   「重置到文件值」「复制 mjs 片段」「保存到源码」三个动作；保存只在本地预览服务器可用，Pages 上退化成复制。
6. **试验场**：`Script_AiProbeScene.mjs`（从 `AiCombatBrowserTest` 抽出来的那套）：一键「找一堵墙、对面 34 m 撒一个班、玩家无敌」，
   加「清场 / 还原」，让设计师在固定场景里反复看改动。

### 14.3 契约

`Data_AiBrainGraph.mjs`（纯数据）：

```js
export const BRAIN_GRAPH = Object.freeze({
  states: [{ id: "cover_engage", label: "掩体对射", group: "combat", desc: "…", x: 0.6, y: 0.4 }],   // id 必须是 Script_Ai.STATE 的值
  edges:  [{ from: "advance", to: "cover_engage", when: "有目标且身边有验证过的掩体", keys: ["COVER.defaultRadiusM", "ENGAGE.defaultM"], priority: 5 }],
  phases: { cover_engage: ["approach", "hide", "peek"] },
  tasks:  [{ id: "flank", label: "绕后" }],                                                        // id 必须是 Script_AiTactics.TASK 的值
  keyOwners: { "COVER.defaultRadiusM": "Data_Tuning_AiCover" },                                // 表键 → 文件（编辑器由此知道保存到哪）
});
```
闸门 `Script_AiBrainGraphTest.mjs`：每个 `STATE` 值都有节点、每条边两端都存在、每个 `keys` 都能在五张表里解析到一个数、`tasks` 与 `TASK` 一致。

保存链路（`scripts/Script_LocalPreview.mjs`，只在本地）：

```
GET  /__tuning/status                → { writable: true }
POST /__tuning/save  { file: "Taierzhuang1938/Data_Tuning_AiCover.mjs", changes: [{ path: "COVER.standoffM", value: 0.7 }] }
                                     → { ok: true, applied: 1, missing: [] }
```
文件名必须匹配 `Taierzhuang1938/Data_Tuning_*.mjs`，只接受回环地址；改写由 `Script_TuningWriter.mjs`（纯 Node）完成：
按 `export const GROUP = Freeze({ … sub: Freeze({ key: <数> }) })` 的花括号层级定位 `GROUP.sub.key`，只替换那个数字字面量，**注释与格式一个字不动**。
闸门 `Script_TuningWriterTest.mjs`。

试验场 `Script_AiProbeScene.mjs`：`PickSite(T, cx, cz)`、`SpawnProbeSquad(T, site, opts)`、`IsolateSquad(T, squad)` → 还原函数、
`PlacePlayer(T, at, stance, yaw)`、`Immortal(T)`；`AiCombatBrowserTest` 改为 import 它们，行为与断言不变。

#### 实装后的补充（2026-09-09，与上面的骨架一致，只是把边界写死）

**行为图**（`Data_AiBrainGraph`，16 节点 / 50 边 / 117 个表键）：

- `priority` 就是判定梯里的位置：0–1 剧本旗短路；2–7 守点单位子梯（`ApplyScriptDefense`，Think 在那里 return）；
  8–17 主状态机（压制 → 空弹 → 机动任务 → 冲锋 → 投弹 → 掩体对射 → 对射 → 压制射击 → 推进）；18–19 命令覆盖（潜行 / 上刺刀）；
  20+ 不在 Think 里的转移（Act 的换弹计时、`TryGrenade`、`TryVault`/`StepVault`、`Kill`、`IssueOrder`）。
- 边多了一个**可选**的 `global: true`：判定梯每拍都从头跑，所以「压制 > 0.50 → SUPPRESSED」这类判据从任何状态都能进，
  `from` 写的是实际打起来最常见的那个起点。面板照常把它画成一条边就行，`when` 里也写了「任何状态」。
- 图是**多重图**：同一对起止点可以有多条边（例如 `fire → advance` 既是「交火结束」也是「潜行覆盖」）。
- `keys` 是这条判定**真正读到**的表键。硬编码在 `Script_Ai` 里的数（压制阈值 0.50 / 0.32、角色冲锋距离 24/18/13/10、
  cohesion 的 34 m / 20 m）在五张表里没有对应键，那几条边的 `keys` 是空数组 —— 空数组是取证，不是漏写。
- `phases` 不止 `cover_engage`：`suppress` / `bound` 也走完整周期，`reload` / `suppressed` 被强制压在 hide 那一半。
- `keyOwners` 登记的是五张表的**全部 31 个导出名**（不只是边上用到的 18 个），面板据此把任意一个叶子存回它自己的文件。
  查法是「**第一个点之前那一段**」，不是字符串前缀 —— `ENGAGE` 与 `ENGAGE_PRIORITY` 是两个组。

**改写器 / 保存端点**：

- `ApplyTuningChanges(source, changes)` 的 `applied` 是**数组** `[{path, from, to}]`；HTTP 响应里的 `applied` 是**条数**（与上面的例子一致），
  明细在 `changes` 字段：`{ ok: true, file, applied: 1, changes: [{path, from, to}], missing: [] }`。
- 类型必须对得上：数字位只收有限数、布尔位只收布尔，否则进 `missing`（往 `steerPathProbe` 里写个 0 比拒绝它更糟）。
  引用（`COVER.weights` → `COVER_WEIGHTS`）、表达式、字符串同理 —— 所以面板枚举叶子时要按**自己那个导出名**给路径。
- `GET /__tuning/status` 回 `{ writable, root }`；非回环地址上 `writable:false`（`--lan` 起服时局域网上的人只能复制片段）。
  `POST /__tuning/save` 的四道闸：回环地址、`^Taierzhuang1938/Data_Tuning_[A-Za-z0-9]+\.mjs$`、解析后落在服务根之下、body ≤ 256 KB；
  失败是 400 / 403 / 405 / 500 带 `{ok:false, error}`。写回走「先写 `.tmp` 再 rename」，换行风格（CRLF）原样保留。

**试验场**：`PickSite` 返回的场地上多带三个字段 `playerAt / playerStance / playerYaw`（「玩家该站哪儿、什么姿势、朝哪边」是场地的属性，
不该让每个调用方各猜一份）；`SpawnProbeSquad(T, site, { count, weapon, grenades, coverSlackM, holdRadius, squadId })`
只在撒兵那几行临时抬 `maxAlive`；`IsolateSquad(T, squad, { runtime, maxAlive })` 的 `Restore()` 会把花名册、波次预算与 `maxAlive` 一起放回去；
`Immortal(T)` 连玩家血量一起顶满（编辑器那颗按钮就叫「玩家无敌」）；另加一个组合入口 `SetupArena(T, { cx, cz, count })` → `{ site, squad, Restore }`。

### 14.4 表在本地可编辑

五张表顶部各一行 `const Freeze = globalThis.TAIERZHUANG_TUNING_EDITABLE ? (v) => v : Object.freeze;`，
`index.html` 在 import map 之前用一段内联脚本把这个旗设成「本机（localhost / 127.0.0.1）或地址栏带 `?aiedit=1`」。
线上（Pages）与纯 Node 测试里表仍然是冻结的；本地预览里编辑器可以就地改数，四个模块都在调用时读表（不缓存），改了下一次 Think 就生效。
这不违反「表是纯数据」：没有 import、没有函数值，只是冻不冻由环境定。

### 14.5 验收

- `AiBrainGraphTest` / `TuningWriterTest` 纯 Node 绿；`EditorTest` 入口数 23；`AiCombatBrowserTest` 仍 11/11。
- `AiEditorTest`（浏览器）：`Debug.OpenEditor("ai")` 打开、六个分节在、选中一个兵后世界里有视锥/通视/掩体线段且 Exit 后全部移除、
  拖一根滑杆后表里的数真的变了且下一次 Think 读到、「重置」还原、「复制 mjs 片段」文本含改过的键、没有保存端点时按钮退化为复制、行为图节点数 == STATE 数。
- 手工：本地 `node scripts/Script_LocalPreview.mjs` 开 `?whitebox=p012`，按 `` ` `` → 调试 → 敌军 AI，改 `COVER_CYCLE.peekMinS`，保存，`git diff` 只动那一个数。

### 14.6 验收记录（2026-09-09）

- 纯 Node：`AiBrainGraphTest` 760 条（16 节点 / 50 边 / 117 表键 / 8 任务，与 `Script_Ai.STATE`、`Script_AiTactics.TASK` 逐个对账）、
  `TuningWriterTest` 373 条（五张真表 288 个叶子逐个解析回原值；真起服的保存端点：改一个数只动那一行，非白名单 / 越界 / 大 body / 非回环全部被拒）、
  `ModuleGraphTest` / `TextTest` / `TestRunnerTest` 绿。
- 浏览器：`AiEditorTest` 32/32（六节在、叠加物进出还干净且 `geometries` 不涨、滑杆改 `COVER_CYCLE.peekMinS` 下一次 `UpdateCoverCycle` 读到、重置还原、
  片段含改过的键、无端点时保存退化为复制、行为图 16/16、试验场撒兵→隔离→还原）、`EditorTest` 172/172（入口 23）、`WorldInfoEditorTest`、
  `AiCombatBrowserTest` 11/11（改为 import 试验场模块后断言不变）、`AiBehaviorTest` 12/12。
- 真实保存回路（验收批手工）：起 `Script_LocalPreview`，`POST /__tuning/save` 改 `COVER_CYCLE.peekMinS` 0.7→0.91，`git diff` 只有那一行；`Data_Battle.mjs` 被拒 403；随后 `git checkout` 还原。
- 实拍：前沿开战 20 s 开面板，行为图显示 16 个节点带实时人数、选中的兵所在节点高亮并列出最近转移；调参页列出 270 个键（按五张表分组）；
  世界叠加画出视锥、通视线、掩体隐蔽/射击位与附近掩体点着色。截图在本地 `_shots/EnemyAi/editor_*.png`。
- 已知边界：`SIGHT_BY_STANCE` 不在调参页（它不是 `Freeze` 包的裸数组，线上也可改，故不开放）；压制阈值 0.50/0.32、角色冲锋距离、cohesion 半径仍硬编码在 `Script_Ai`，
  行为图里对应边的 `keys` 为空——要调得先搬进表；叠加层几何走 `post.AddDebugOverlay` 而不是 `scene.add`（不进预通道 / SSAO / 线框换材质）。

---

## 15. 不在交战中怎么站、跪射之后怎么动（2026-09-09）

> 玩家原话：「远处的敌人不会动、不找掩体、干站着。」
> §12–§14 修的是**交火里**的行为（掩体、探头、射击、班组），这一轮修的是**交火之外的那几十秒**：
> 不交战 ≠ 不做事。数全部落在 `Data_Tuning_Ai.WATCH` 与 `Data_Tuning_FirstLevel` 的 `assault*`，
> 新状态 `watch` 与四条新边同步进了 `Data_AiBrainGraph`（`AiBrainGraphTest` 逐个对账）。

### 15.1 取证：改前是什么样（`_shots/EnemyAi/Script_FarEnemyProbe.mjs`）

前沿开战 20 s，玩家在 `MISSION_ANCHORS.gun`（0, −128）朝北，按到玩家的距离分档，再推 4 s 看谁挪了窝：

| 档 | 人 | 站 / 蹲 / 卧 | 四秒没挪窝 | 有掩体 | 状态 |
| --- | --- | --- | --- | --- | --- |
| < 46 m | 10 | 5 / 5 / 0 | **9** | 5 | cover_engage 3、fire 3、charge 2、reload 2 |
| 46–74 m | 31 | 11 / 20 / 0 | **23** | 2 | **fire 25**、cover_engage 2、advance 2、suppress 1、grenade 1 |
| 74–120 m | 2 | 1 / 1 / 0 | 2 | 0 | fire 2（警戒 engaged） |
| > 120 m | 6 | **6 / 0 / 0** | 6 | 0 | advance 5、idle 1，警戒**全是 unaware** |

三条病根，一条一条对应到源码：

1. **兜底分支一律站直。** `Think` 最后那一格是 `s.state = ADVANCE; SetStance(s, suppression > 0.55 ? 1 : 0)` ——
   有目标但超出交战距离（`ENGAGE.defaultM` 74 m）、或者只听见动静没看见人的人，全都站得笔直。
   守点单位的对应分支（`ApplyScriptDefense` 的 `!s.target`）是 `IDLE`，姿态根本没人管。
2. **跪射之后没人换位。** 跃进到线的人由 `Defend()` 变成守点单位，`ApplyScriptDefense` 给他 `FIRE`，
   然后他就在那块地上跪到下一次跃进（46–74 m 档 23/31 人四秒一步没挪）。
3. **120 m 外那六个人为什么 `unaware`。** 他们不是前沿部队，是 **village / melee 遭遇编成**
   （`VillageGunner` / `VillageCorner` / `KitchenGuard` / `RearWindow` / `SideYard` / `MeleeTutor`），
   `SpawnEncounterActor` 给了 `missionDormant + scriptedNoncombatant`，等玩家走到 55 m 内才醒
   （`UpdateFront`）。**听觉链路本身是好的**：诊断脚本从他们身边 40 m 手工上报一条 `gunshot`，
   `Hear` 当场写进 8 个人的记忆、警戒立刻升到 suspicious/alert。
   病根是 `Think` 的剧本旗短路里那句 **`this.perception.ForgetAll(s)`**：每 0.1 s 抹一次记忆，
   听觉刚写进去的东西活不过一拍，于是「打了二十秒的战场上有人始终 unaware 且站得笔直」。
   （他们离最近的国军 84–112 m，仍在步枪声 150 m 的可闻半径内 —— 原任务单里「离国军战线 50–60 m」
   的估计偏近了一档，但结论不变。）

### 15.2 规矩

**① 戒备（`STATE.WATCH`，新增）** —— 进入条件（`WantWatch`）：已经**站定**（`order === "hold"`
或走到了 goal），而且「有目标（在这条分支上意味着超出交战距离）」或「警戒 ≥ `WATCH.minAlertIndex`（suspicious）」。
做的事：跪下（压制过 `proneSuppressionAt` 就卧倒，承诺 `stanceHoldS`）、面向目标 / 最后目击点、
每 `scanIntervalS` 把面向往左右扳 `scanYawRad` 扫一次扇面、有掩体就缩在 hide 相位（`UpdateMoveOrder` 强制 `"hide"`），
**一枪不开**（`Act` 的 WATCH 分支根本没有 `TryFire` 这条路径，所以「戒备的人开枪了」等于状态已经换了）。

- **推进中的人不受影响**：`Arrived()` 要求 order=hold 或已到 goal；走剧本路线（`p012Guided + scriptMoveSpeedMps`）、
  潜行、上刺刀的人一条都不进。已经在戒备的人用 2.5 倍到位半径做迟滞 —— 班组每秒重派一次槽位，
  不留这条的话人会一秒蹲一次（`AiBehaviorTest` 的「姿态没有阈值抽动」当场翻红）。
- **为什么加新状态而不是复用 `advance`/`idle`**：`advance` 的语义是「沿 goal 与队形走」，
  编辑器的行为图、`Debug.Ai.State()` 的直方图与验收探针都按状态分桶 ——
  把「跪着监视」塞进 `advance` 等于把这一轮的效果做成看不见的。`STATE` 只增不改的契约允许加
  （§12.2），旧的十六个值一个字没动。
- **守点单位同样适用**：`ApplyScriptDefense` 的 `!s.target` 分支从 `IDLE` 改成
  `s.watchAlerted ? WATCH : IDLE`。级别在 `Think` 里判完写进布尔 —— 那一段每帧都跑，
  而且被 `Script_FirstLevelP012ActorTest` 抽进**没有表也没有 ALERT_ORDER** 的纯 JS 沙箱重放。

**② 换位（DISPLACE）** —— `fire` 状态且**身边没有掩体**（有掩体的人走 hide/peek 周期，那是另一套节奏）：
站定超过 `displaceAfterS`（读 `s.stationaryS`）或自上次换位起打了 `displaceAfterShots` 发，
且过了 `displaceMinDwellS`，就向侧向挪 `displaceMinM`–`displaceMaxM`（2–4 m，随机左右，左右各试两档）。
压制过 `displaceProneAt`（0.35，在 SUPPRESSED 的 0.50 之下）改成**匍匐后退** `displaceBackM`。
落点校验**一条射线都不打**：守区允许半径（`CoverReachM` = holdZone.radius + 掩体余量）、
`nav.Walkable`、地面高差 ≤ 1.2 m、`Blocked()`（AABB 空间散列）。
守区余量小于 `displaceMinReachM`（2.2 m）的人**一步都不挪** —— 机枪战位（0.4 + 0.9 = 1.3 m）是战位，挪了就不是那挺机枪了。
找不到落点也记一次 `displaceAt`，不然「四面都走不通」的人每拍都要把候选点重扫一遍。

**③ 听觉惊动** —— 剧本旗短路里的 `ForgetAll` 换成 `WatchScripted`：走一次**空候选**的 `Sense`
（不打射线、不建新条目），只让听来的记忆按真实时间衰减，`alert` / `lkp` 照常出账；
目标仍然当场清掉，所以这个人不选掩体、不接任务、不开枪。姿态只给**停在原地的武装单位**
（有守区、order=hold、没有剧本速度）—— P012 的担架队、平民、开场发枪的队列走的是 `MoveActor`
（清掉守区、order=advance），一个都不受影响。
**听觉封顶 0.72 < ENGAGED 0.85 这条红线没动**：听见枪声最多到 alert，要交战仍然必须真的看见人。

**④ 跃进节奏** —— `UpdateAssault` 两处：

- **到位判据带迟滞**：进线仍是 `assaultArrivalM`（0.9 m），但**已经在线上的人**要走出
  `defendHoldRadiusM + assaultCoverSearchM`（11 m）才算「离线」。旧口径把「走 5 m 去掩体」
  和「侧向挪 3 m 换射击位」一律判成离线，下一拍 `MoveActor` 把他拽回原点（连 `scriptDefensive`
  与 `holdZone` 一起清掉）—— 这一行就是 §12.7 第 1 条里「够得着掩体却走不完那五到八米」的机制来源。
- **最后一线不再干守 11 秒**：`assaultFinalHoldS` 11 → 4.5，加上「打满 `assaultVolleyShots`（4）发也算」，
  到点就沿同一条线横挪 `assaultLateralMinM`–`assaultLateralMaxM`（3–6 m）换个射击位，
  换 `assaultLateralShifts`（2）次之后才退回 `assaultRegroupLine` 重来（`assaultRegroupCycles` 不变）。
  横挪落点走**现成的 `ClearLaneX`**（为此把它从 `Data_FirstLevelMissionFront` 导出，列坐标一个没动），
  而且**扫过的区间**也要避开 `blockedX` —— `ClearLaneX` 只保证终点不在列里，
  x=−3 往右挪 6 m 落在 +3 是合法的，但路径正好横穿 Center 那一列。两侧都不通就退一线。

### 15.3 取证：改后（同一条探针、同一个机位、同一段 20 s）

| 档 | 人 | 站 / 蹲 / 卧 | 四秒没挪窝 | 有掩体 | 警戒 | 状态 |
| --- | --- | --- | --- | --- | --- | --- |
| < 46 m | 18 | 5 / 13 / 0 | 7（39%，改前 9/10 = 90%） | 10 | — | cover_engage 9、fire 4、charge 2、reload 2、advance 1 |
| 46–74 m | 25 | 8 / 17 / 0 | **9（36%，改前 23/31 = 74%）** | 12（改前 2/31） | — | cover_engage 12、fire 10、**watch 1**、advance 2 |
| 74–120 m | 1 | 0 / 1 / 0 | 0 | 0 | engaged | fire 1 |
| > 120 m | 8 | **0 / 8 / 0**（改前 6/0/0） | 7 | 0 | **suspicious**（改前全 unaware） | advance 5（戒备姿态）、fire 2、watch 1 |

- 46–74 m 档「四秒没挪窝」**23/31 → 9/25**（74% → 36%，目标是 ≤ 一半）；蹲/卧比例 65% → 68%（没有下降）。
  **这一格主要是跃进节奏的功劳，不是换位的**：把 `WATCH` 顶到永不触发再跑一趟整条验收，
  全场换位 0 次，而同一档的「四秒没挪窝」仍是 10/24 —— 到位迟滞 + 最后一线的
  volley/横移（`assault*`，也是本轮的改动）才是这一档动起来的原因。换位补的是
  **身边没有掩体**的那批人（全场每 20 s 触发 74–75 次）。
- 120 m 外那一档**站直 6/6 → 0/8**，警戒 **unaware → suspicious**，面向枪声来处（`watchYaw`）。
- 「有掩体」2/31 → 12/25 是**两件事叠在一起**：本轮的到位迟滞让他们走得完那几米，
  同一天前沿补掩体的那一包（`FRONT_COVER`）让那儿真的有东西可躲。这一格的功劳不全是大脑的。
- 各档人数变了（31 → 25、10 → 18）是因为整场仗的推进节奏跟着变了，不是筛选口径变了。

### 15.4 门禁

| 门禁 | 结果 |
| --- | --- |
| `AiBehaviorTest` | 12/12：瞬转 4.77°、蹲卧 blend 0.0694、枪口 look 0.0800 / aim 0.0917、**姿态切换最多 4 次 / 12 s**（闸门 6）、换目标最多 4 次、支援位误冲 0 帧、过热 200 发、移动同向 95.4%、队向 88.7% |
| `AiCombatBrowserTest` | 12/13：新增的 ⑨ 两条过，原 11 条里 **⑥ 会扔读到 0 枚**（见下面「⑥ 的取证」） |
| `AiBrainGraphTest` | 833 条断言：节点 **17**（＝`STATE` 值数）、边 **56**、表键 140、任务 8 |
| `AiPerceptionTest` / `AiCoverTest` / `AiTacticsTest` | 11 项 / 100 条 / 250 条，全绿 |
| `FirstLevelP012ActorTest` / `FirstLevelP012RuntimeTest` | 全绿（剧本旗短路仍然落回 `advance`、清目标、清掩体；沙箱缺 `WatchScripted` 时自动退回 `ForgetAll`） |
| `DamageTest` | 不受影响：换位写的是 `s.moveOrder`（走 `Think`/`UpdateMoveOrder`），而靶场直调 `ai.TryFire`，两条路不相交；WATCH 不开火所以也不进 TTK 账 |

**⑥ 会扔读到 0 枚的取证。** 两套 A/B：整条验收（把 `WATCH.minAlertIndex` / `displaceAfter*`
顶到永不触发，跑同一份 `AiCombatBrowserTest`）与只重放 B3 → B4 → B5 三段的
`_shots/EnemyAi/Script_GrenadeSequenceAb.mjs`：

| 配置 | 场景 | 投出 | 拿到投弹任务的采样帧 | 玩家挨伤害的帧 | 黑板里「对方钉了多久」上限 |
| --- | --- | --- | --- | --- | --- |
| §15 在 | 整条验收 ×3 | **0 / 0 / 0** | — | — | — |
| §15 关 | 整条验收 ×1 | **1**（落点 0.4 m） | — | — | — |
| §15 在 | B3–B5 重放 ×2 | 0 / 1 | 0 / 150 | 20 / 3 | 3.1 s / 40.7 s |
| §15 关 | B3–B5 重放 ×2 | 1 / 1 | 170 / 150 | 4 / 6 | 42.1 s / 40.2 s |

**这一条是本轮的账**（合起来 1/5 vs 3/3；单看重放那一对会误判成方差 —— 我第一次就是这么误判的）。
机制已经量到：`ShouldGrenade` 的第②条「对方钉在一处 ≥ `GRENADE.holdS`(5 s)」读的是
`playerStationaryS`，而那个计时器按**速度**算，挨一发的 knockback 就是 1.2 m/s（阈值 0.4 m/s）。
§15 让这一班**打得更持续**（少起身冲锋、多在掩体里打），于是玩家几乎每两秒挨一下，
计时器封顶在 3.1 s，投弹任务一次都派不出去 —— **正在挨打的玩家按定义永远不算「钉在一处」**。
§13.1 记的「投出 1 枚」本来就贴在这条线上，是同一件事的另一面。

修在哪：`GRENADE` 表与 `Script_AiTactics` **都不在本轮的文件归属里**，所以这一条交给投弹那一档的主人。
两条候选，都不是放宽断言：

- 把「钉在一处」改成**认位移不认速度**（`stationaryS` 按「离上一次移动了 ≥ x 米」算），
  这样挨打的震动不会把它清零；
- 或者反过来把「他在挨打」本身算成一种钉住（被压制的人正是最该吃手榴弹的人）。

本轮只在探针那一侧把「钉住」这个动作做全（连刚体一起钉，见 B5 的注释），断言一个字没放宽。

### 15.5 新增的验收条（`Script_AiCombatBrowserTest` ⑨，阈值读表）

正片前沿开战 20 s 之后再推 4 s，按距离分两档（与取证探针同一条口径）：

- **⑨ 跪射之后会换位（46–74 m）**：四秒窗口里挪过窝的人过半（`still ≤ n/2`），
  且仍有 ≥ 35% 的人伏低（挡住「所有人都站起来走来走去」这一种退化）；同时打印全场 `stats.displaces`。
  **不压「跪的比站的多」**：跃进节奏加快之后本来就有更多人在两条线之间跑，
  同一份代码两趟读到 12:12 与 11:13 —— 压「多数」等于压一枚硬币。
- **⑨ 远处听得见（120 m 外）**：警戒过半不再是 `unaware`、站直的不过半，
  而且知道动静在哪的人里至少有一个是**朝着那边**的（±60°）。

两条都验过「关掉 §15 会红」（这是新断言该有的样子）：把 `WATCH` 顶到永不触发再跑整条验收，
远处那一条当场翻红 —— **站 6/7、面向 ±60° 的只有 3/7**（§15 在时是站 2/8、面向 7/8）。

### 15.6 偏离与留给下一轮

1. **`WATCH.minAlertIndex` 是级别下标不是阈值**：级别由感知层的 `AWARENESS.thresholds` 定，
   戒备只问「到没到 suspicious」。写成下标（而不是字符串）是为了让调参页能拖它。
2. **戒备不追击、不查看**：`INVESTIGATE` 是班组派的机动任务（`Script_AiTactics`），
   守区与剧本旗的人本来就拿不到。戒备只改「怎么站、朝哪儿看」，一步都不走。
   「听见动静就过去看看」仍然只发生在没有守区的自由单位身上。
3. **村里那批人只是不站直了，仍然不参战**：`missionDormant` 是关卡编排的事
   （`UpdateFront` 55 m 内才醒），大脑不越权把他们拉进战斗。
4. **换位不选点位质量**：落点只验「走得到、撞不着、还在守区里」，不问「那儿是不是更安全」——
   真要问就得射线，而 §7 的预算里这一层是 0 条。如果以后前沿掩体密度上来了，
   更好的做法是让没有掩体的人**直接去查一次掩体**（`UpdateCover` 已经每 `reselectMinS` 查一次）。
5. **`assaultFinalHoldS` 从 11 s 砍到 4.5 s 会让最后一线的火力更密**（同样的人打得更勤、也更早退回重来）。
   这一条与内容侧的掩体密度是一对：掩体多了之后要重新看一次整条线的推进速度。
6. **「正在挨打的人不算钉在一处」**（见 15.4 ⑥ 的取证）：投弹判据把「钉住」定义成
   `playerStationaryS`（按速度算），而挨打的 knockback 就会把它清零。§15 让前沿打得更持续，
   于是这条判据在验收场里再也不成立 —— **⑥ 会扔从 1 枚变成 0 枚是本轮的账**，
   但修法在 `GRENADE` 表与 `Script_AiTactics`（都不在本包的归属里），已按两条候选写在 15.4。
   在它修好之前，「玩家一直挨打时不会挨手榴弹」是**线上也成立**的行为，不只是测试口径问题。
7. **一次 `AiCombatBrowserTest` 全程约 20 分钟，而 ⑥ 与 ⑨ 都在方差边上**：
   ⑨ 的「伏低比例」原本压的是「跪的比站的多」，同一份代码两趟读到 12:12 与 11:13 —— 已改成 35% 的下限。
   下一轮谁再动这两条，先按 15.4 的 A/B 配方跑两遍再判因果，别拿单趟读数下结论（这一轮我自己先踩了一次）。

### 15.7 验收记录（2026-09-09，三路合并后独立验收）

三路并行交付：远景层多姿势 + 跑步翻页（`docs/Data_ActorCrowdLod.md`）、不在交战中的戒备 / 换位 / 跃进节奏（本节 §15.2）、
前沿掩体内容（`docs/Data_FrontCover.md`）。合并到同一棵树之后由验收批重跑。

**按距离分档的探针**（`_shots/EnemyAi/Script_FarEnemyProbe.mjs`，机枪位朝北，开战 20 s）：

| 档 | 改前 | 三路合并后 |
| --- | --- | --- |
| 46 m 内 | 10 人：站 5 / 蹲 5，4 秒没挪窝 9，有掩体 5 | 18 人：站 6 / 蹲 12，没挪窝 5，有掩体 15，掩体对射 13 |
| 46–74 m（远景层） | 31 人：站 11 / 蹲 20，**没挪窝 23（74%）**，**有掩体 2** | 24 人：站 8 / 蹲 16，**没挪窝 7（29%）**，**有掩体 13（54%）**，掩体对射 13 |
| 120 m 外 | 6 人**全站着**、unaware | 8 人**全跪着**、suspicious 以上、朝枪声方向（watch / fire / advance） |

远景层现在真的画出跪姿（`Crowd_*_kneel` 桶），46 m 外的人不再是站姿雕像；跑步是 4 帧翻页。

**验收批做的三处改动**：
1. 投弹判据的「玩家钉在一处」改按**位移窗口**判（`BRAIN.stationaryDriftM`），不按速度：站在空地挨打的玩家每两秒被击退一下，
   按速度永远不算钉住（§15.4 的账）。改后受控场 40 s 投出 2 枚、落点 0.1 m。
2. **守区的人不自发冲锋**（`Think`：`!s.holdZone || order==="charge"`）：`Act` 本来就不让带 holdZone 的人离区，旧写法让他们
   二十米内进 CHARGE 却一步迈不出去 —— 站直、上刺刀、原地干等，是「近处的敌人干站着」的一种；现在留在掩体 / 跪射里继续打。
3. **投弹排在自发冲锋前面**：拿了投弹任务却去冲锋的人会把班组的投弹租约白占二十秒；玩家亲口的「上刺刀」仍压过投弹。
4. 编辑器调参页把 `WATCH` 组收进来（`AiEditorTest` 的「行为图表键落在面板之外」那条）。

**门禁**：纯 Node 全绿（`AiBrainGraphTest` 833 条 / 17 节点 56 边，`TuningWriterTest` 395，`FirstLevelMissionTest` 含前沿掩体覆盖率断言，quick 52/52）；
浏览器 `AiCombatBrowserTest` **13/13**（⑤ 绕出正面锥最大 109°、⑥ 投出 2 枚）、`ActorCrowdTest` 20/20（像素级：跪姿包围盒真的变矮）、
`VisibilityTest` 9/9、`ActorBatchTest`、`AiEditorTest` 32/32、`DamageTest` 24/24、`BootTest` 七章、`AiBehaviorTest`（见下）。

**帧耗时 A/B**（`FrameProbe` 1536×864 high，对最新 master 两轮交替，机器空闲）：

| 机位 | fps 基线 → 改后 | draw call | 三角形 | `ai` 桶 |
| --- | --- | --- | --- | --- |
| front | 63.4 / 65.2 → 63.6 / 61.3 | 558 → 635 | 2.63 M → 2.61 M | 4.13 / 4.08 → 4.31 / 4.49 |
| frontEast | 74.8 / 75.7 → 72.3 / 70.1 | 497 → 551 | 1.68 M | 3.06 / 3.03 → 3.45 / 3.55 |
| train | 41.3 / 42.9 → 43.9 / 42.1 | 1063 | 3.25 M | 6.6 → 6.5 / 6.8 |

draw call 多的那 55–77 次是远景层的姿势桶（每档 7 个材质桶）与前沿更多人在跪 / 换位后的分布变化，三角形不涨；
前沿机位 fps 约 −3…−7%，`ai` 桶 +0.2…+0.5 ms。都在 §7 / §13.3 的口径内，但前沿已经没有多少余量，下一轮别再往远景层加桶。

**整关通关**（`FirstLevelMissionBrowserTest --campaign`，最终树）：真实输入通关 22 分钟；三角形捕获最高 `South` **7.97 M**（限 8.1 M，master 同点 7.90 M），
`CourtyardColumn` 6.96 M。`South` 那一帧只剩 0.13 M 余量：下一轮往前沿加东西之前先看这一行。

## 16. 待命的日军也要跑 AI（2026-09-09）

玩家看着截图问：「为什么这一幕掉帧？远处的敌方也没有动画？也不会躲掩体？完全是一副雕塑。」
两个问题是同一件事。

### 16.1 现场

`?whitebox=p012&missionStage=3`（Support 段，3394×1348 high，真 rAF 跑 25 s）：

| 距离 | 活着的日军 | 4 秒位移 < 0.2 m | 有掩体 | 状态 |
| --- | --- | --- | --- | --- |
| 74–120 m | 3 | 67% | 0 | fire / advance |
| 120–200 m | 8 | 75% | 0 | fire / advance / watch |
| **200 m+** | **143** | **100%** | 0 | advance 138 / watch 5 |

那 143 个人全带 `scriptedNoncombatant`，位置在 235–270 m，`move4s` 一律 0.00。
这个标记在 `Script_Ai.Think` 里是整条链短路：清目标、放掩体、落回 ADVANCE、直接返回。
§15 给远景层加的姿势桶、WATCH、98 个掩体箱，对他们一条都不生效 —— 短路发生在那之前。

来源是 `Script_FirstLevelMissionRuntime.SpawnEncounterActor`：玩家走到阵地
（`frontEngageDistanceM` 85 m，`frontBattleStarted`）之前，front / tank 两批人一生成就被
标成 `scriptedNoncombatant` 并摆成跪姿。于是 `frontSimultaneousEnemies:150` 这个指标，
是靠把 143 个不动的人算进活人数达成的（任务日志里 `frontPopulationReached {alive:150}`
在第 0 秒就打勾）。

### 16.2 定的口径

用户 2026-09-09 选了 A：**150 这个数保留，待命的人要真的有 AI**。

- 待命只保留 `missionFrontStandby`，不再设 `scriptedNoncombatant`（Flank 那几个是后面
  才登场的侧翼脚本，仍然冻着）。
- `UpdateAssault` 与 `Threatens` 改成认 `missionFrontStandby`：他不走跃进脚本，
  对友军通路也仍然不算威胁 —— 因为他在 WATCH 里一枪都不开。
- 超出交战距离（74 m）的人由 §15 的 `STATE.WATCH` 接手：跪下、面向枪声、隔
  `scanIntervalS` 扫一次扇面、有掩体就进掩体。这正是「待命」该有的样子，不用另写一套。

改后同一机位：200 m+ 那一档 144 人里 watch 86 / cover_engage 20 / suppress 19 / fire 14 /
reload 3，**21 个人在掩体里**，站 28 跪 116，四秒内动过的从 0 变成 20 个。

### 16.3 这一刀的帧账（交替 A/B）

同一页、同一现场，`scriptedNoncombatant` 轮流开关四轮，每轮 6 s 取中位数
（这台机器上常有别的 agent 在跑浏览器，单向前后对比会把漂移算成开销 ——
本轮八次采样里就有一次 113 ms 的外部尖峰）：

| | 冻着 | 真跑 AI |
| --- | --- | --- |
| 帧间隔中位数 | 30.0 ms | 30.1 ms |
| CPU 合计 | 32.25 | 33.13 |
| `post`（渲染提交） | 20.19 | 20.38 |
| `ai` | **5.12** | **6.62** |
| draw call | 934 | 940 |
| 三角形 | 3.78 M | 3.79 M |

**代价是 `ai` 桶 +1.5 ms，别的都在噪音里。** 渲染不涨是因为这批人本来就在远景层里画着，
冻不冻只改他们摆什么姿势，不改画不画。

### 16.4 前提：白刃的两两配对

不先修这一条，A 是跑不动的。`Script_MeleeCombat.Step` 原来有两处全场规模的循环：

1. 分离循环 `for i for j>i`，221 个人 = 每一步 24 000 对；而 `Update` 按
   `maxStepS` 1/90 s 切子步，**帧越慢子步越多**（25 fps 一帧跑四步 ≈ 十万次配对）。
   这是正反馈：越卡越卡。实测把 `Script_Main` 的「输入」这一桶顶到 3.6–7.3 ms/帧。
2. `Closest()` 走 `Opponents()`，每次新建一个全场数组再 filter + sort。Step 里每个
   **eligible** 的人每一步都要问一次 —— 而 `eligible` 明确排除 `scriptedNoncombatant`，
   所以冻着的时候只有十来个人在问；143 个人一解冻，这一条会直接翻十倍。

改法：`BuildIndex` 每步建一次 6 m 粗网格（`CELL_M` >= `engageM` 5.5 m，查询扫 3×3 格，
整数键 —— 字符串键的格点在爆炸那一轮量过是十几毫秒），`Closest` 与分离循环都从网格
取邻居；分离循环只从**正在白刃的人**出发，没在白刃的人一次都不进循环。
`Step` 之外的调用（按 F 推架、拨挡、试验场「重开」之后的第一次询问）位置可能刚被改过，
用 `stepping` 标志判出来，重建一次再查 —— 少了这一条，`MeleeQteTest` 的「DOM 按钮开局
之后按 F」会拿到上一步的网格，`pushes` 恒为 0。

效果（同机、143 人都在跑 AI）：「输入」桶 **3.59 → 0.63 ms**。

### 16.5 还没动的

按这一轮量到的整帧 841 draw / 3.62 M 三角排，剩下的大头与本轮无关：

| | draw/帧 | 三角/帧 |
| --- | --- | --- |
| 白盒地面（48 m 一块，没有距离 LOD） | 107 | 829 k |
| 尸体 `MissionAftermath_*`（708 具三级 LOD） | ~200 | ~1.2 M |
| 远景人群 `Crowd_ija_Kneel`（133 人 × 2730 三角） | 15 | 594 k |

渲染提交贵不是因为单个 draw 贵，是同一批几何一帧要走阴影 + 深度法线预通道 + 主场景三遍
（用户面板：2.17 + 4.09 + 7.83 + 零碎 2.21 ≈ 16 ms）。WebGL2 没有 GPU 侧剔除与 indirect
draw，SRP Batcher 是 Unity 的东西，这两条这里都用不上；能省的是「别提交不该提交的」。


## 17. 2026-09-11：局部战术主动性

针对下车后双方不接敌、站桩，以及缺少搜索和刺刀冲锋的反馈，本轮接通现有战术层、掩体层与共享白刃层。此前开场黑视和听觉恢复加倍、武装下车队员参战的改动继续保留。

参考 [F.E.A.R. 的 Three States and a Plan（GDC）](https://www.gdcvault.com/play/1013282/Three-States-and-a-Plan) 的目标、动作和环境条件分离，以及 [Unreal EQS](https://dev.epicgames.com/documentation/en-us/unreal-engine/environment-query-system-in-unreal-engine) 的候选位置筛选。这里使用现有分层状态机与评分查询，没有引入 GOAP 求解器，也不据此宣称达到完整 3A AI 水平。

- **守军局部机动**：明确配置 `tacticalRadiusM` 的普通步枪手可在守区内找掩体、换位、搜索和近距离冲锋。固定机枪位、非战斗员、带路和搬运的位移所有权保持各自职责。双方共用规则。
- **交替推进**：修复只有方向、没有坐标的 BOUND 任务被跳过；跃进配对先于射击令牌续租，让移动者与掩护者能交换职责。到达掩体后转入射击周期；没有可用掩体时换位或警戒。
- **掩体和脱困**：验证完成不等于挡得住；明确失败的候选被拒绝，未验证的候补需补射线检查，额外查询次数受预算控制。强压制时仍执行向掩体爬行；接近掩体长时间没有进展会释放占位并暂时排除该点。长距离移动恢复导航脱困，翻越转身有限速；有局部机动权的步兵沿计划路线碰壁时也保留脱困计时，精确引导走廊仍由剧本控制。
- **搜索**：失去目视后，一班最多派配置数量的搜索者到最后目击处，停步观察，再沿附近几个方向搜索；其他人掩护。搜索有期限，目的地受战区约束；看不见时瞄向记忆位置，不追踪隐藏目标的当前坐标。
- **刺刀冲锋**：只对可见目标评估距离、自身状态、职责、同伴和可见换弹/卧姿机会；近身接触可直接冲锋，稍远需要支援或机会。并发数量、承诺时间和冷却有上限，被压住、丢失目标或越出守区会中止。接近后的攻击、防御和伤害仍只由 `Script_MeleeCombat` 结算。
- **任务接触优先**：前沿步兵遭遇近处可见敌人时，将计划跃进交给共享战斗逻辑；已进入白刃的角色不再被关卡定时走位覆盖。普通下车友军的战区配置也通过共用 Defend 生效，正常开场和阶段恢复一致。

调参集中在 `Data_Tuning_AiTactics`、`Data_Tuning_AiCover` 和 `Data_Tuning_FirstLevel`；这里不复制数值作为第二份配置。

### 验收范围

- `AiTacticsTest` 检查战区边界、职责限制、冲锋条件和搜索生命周期。
- `AiInitiativeBrowserTest` 用生产 AI 与共享白刃层的受控夹具检查强压制移动、方向跃进、无效/受阻掩体、冲锋伤害、丢失目标，以及有限时长的带路接敌交接。这是行为执行证据，不算正常通关。
- `AiCombatBrowserTest` 的真实关卡部分继续检查接入和警戒；隔墙射击、侧翼、投弹沿用实际场地。掩体周期实验显式加入临时 Rapier 掩体，因为旧实验的“附近有掩体标记”不能证明它保护射手；到位断言现在也要求射线确实被挡。临时实体和注册信息用后还原，不进入正式地图。
- 开场接触探针要求双方实际开枪、普通武装队员不再是非战斗员、步枪手实际换位。集合队会在未清理的交通壕外等待，敌军机动可能使其始终在短接敌半径之外，因此“带路交接”由上述明确近接触夹具验证，正常开场另存逐帧接敌记录。
- P012 的旧状态切片测试现在执行生产代码的延后射击语句，并检查其位于瞄准之后，避免只截取移动 switch 而漏掉真正的开火步骤。
- 完整关卡驾驶器在近接触时用正式 V 键切到大刀，保留该槽位完成攻击、格挡和推架，脱离接触后按 1 切回步枪；空枪在无目标间隙正常装弹。旧驾驶器只会反复装弹，无法应对如今会贴近的侧翼兵。独立的正式关卡输入夹具实测两次共享白刃命中并切回汉阳造；不改伤害、生命值或任务事实，这项夹具不算正常通关。

本轮专项实测：quick 65 项通过；行为稳定性、主动行为执行、近距射击和发布包启动 4 项通过；实战 AI 13/13 通过。物理碰撞通过。额外扩大的玩家跳跃检查为 14/15，失败项是车厢头尾边缘翻出后仍落回车厢；对未修改的 `996e1be48` 运行时与原测试重放得到同一失败，属于原有问题，本轮未修改玩家跳跃逻辑。不能把这项扩大回归报告成全绿。

最终运行时另以 `node Taierzhuang1938/Script_FirstLevelMissionBrowserTest.mjs --campaign --regroup` 从正常开场连续完成整关，最终为 `Complete`，无阶段跳转、无检查点重试、无浏览器脚本错误；开场集合、交火、行进、白刃遭遇、转运和最终撤离的现有断言均通过。2026-09-11 12:30 完成的日志与终点截图保存在本地 `CodexReview/InfantryTactics_20260911`，不随站点发布。
