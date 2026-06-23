# 角标清理铺 · 重平衡 Plan v2

> 基准 = 刮刮乐式"增量爽游"内核。五大支柱：①数字只涨不跌（已入账本金永不倒退）②即时正反馈（撕开即中、清理/交付有强反馈）③数字越滚越大（指数长尾增长引擎）④挂机也涨（离线/自动净收益为正）⑤低摩擦无痛（前 30 分钟纯爽、惩罚后置）。
> 本文所有 `file:line` 均取自 6 维已校验审计（claimAccurate=true 的事实），未含任何推测行号。
>
> ✅ **M0 已决策（2026-06-23）：取向 A —— 坚持爽游基准。本 Plan P1–P6 全量执行。** 会动弹窗后置（≥L8）/ 改风险可选，前 30 分钟纯爽，惩罚后置，补离线收益与转生。

---

## 一、本版相对 v1 的变化

本次提交（commit 7160316）唯一的实质改动是**做出并前移了"会动的恶心弹窗"机制**，全部 178 行代码服务于"增摩擦/加惩罚"，无任何新增正反馈/掉落/产出。

- **新机制：会动的弹窗（两种）**
  - `dodge`：光标进入 ✕ 中心 66px 半径内时，弹窗朝远离光标方向跳 0.2 屏比例一步逃走（`popupMotion.ts:71-87`），无冷却、无连续逃逸上限。
  - `bubble`：半透明肥皂泡按 `POPUP_BUBBLE_SPEED=0.26` 屏比例/秒漂移、碰边反弹（`popupMotion.ts:38-57`），需追着才点得中 ✕；为补偿可点性已刻意缩小（`fw 0.34~0.44`，`coreModule.ts:84`）。
- **触发范围**：仅 `ad/timed/bait` 三类弹窗、且 `level>=POPUP_MOTION_UNLOCK_LEVEL` 才出现；每个新弹窗 `bubble 0.16 + dodge 0.22 = 约 38%` 概率获得运动（`balance.ts:57-58`，`popupMotion.ts:12-24`）。`scam/offer` 永远不动。
- **关键改动：解锁等级从工作区里的 5 前移到 L3**（`POPUP_MOTION_UNLOCK_LEVEL=3`，`balance.ts:56`），与诈骗 `SCAM_UNLOCK_LEVEL=3`（`balance.ts:22`）同期登场。注释自承"与诈骗(3)同期登场，玩家早点尝到苦头"（`balance.ts:55`）。到 L3 累计仅需 `10+30=40 XP`（`xpToNextLevel=10*level^1.6`，`balance.ts:96-98`），`xpPerBadge` 初始=1（`persistence.ts:28`），即开局数分钟内即触发。
- **配套**：新增 `PopupMotion` 类型与 `motion/vx/vy` 三字段（`state.types.ts:18`），读档兼容为旧存档补默认值（`persistence.ts:62-66`），新增肥皂泡美术绘制（`renderModule.ts`，纯视觉无数值影响）。

---

## 二、前置决策（需用户拍板）

### genre 取向冲突

当前代码方向明确**偏向"硬核劝退向"而非"爽游向"**：本次 diff 不扣钱、不回滚本金（属软惩罚/降速），但把"会逃跑/会乱滚的弹窗"塞进了本应纯爽的前期，与既定的刮刮乐爽游基准正面冲突。

**核心冲突点 1：会动弹窗提前到 L3 / "让玩家早点尝到苦头" ↔ 支柱⑤（前 30 分钟纯爽）**
- L3 已是惩罚密集叠加点：恶意软件 L2（`balance.ts:33`）、假奖励陷阱罚款 L2（`balance.ts:63`）、诈骗自动安装 L3（`balance.ts:22`），再叠加会动弹窗 L3——而黄金/灵魂/魔方等爽点要 L8~L10 才登场（`balance.ts:72-94`）。苦头提前、甜头留后，梯度方向是反的。

**核心冲突点 2：dodge/bubble 把"撕开即中"变成"追着点" ↔ 支柱②（即时正反馈）**
- dodge 让目标主动逃离光标、bubble 让目标飘移，且只要 `popups.length>0` 即整机禁清（`phoneBlockedByPopup→phoneClearingDisabled`，`layout.ts:196-198`；`coreModule.ts:163`），即时反馈被刻意延迟/挫败。

### 两种取向的取舍

| 取向 | 保留/强化 | 代价 | 适配人群 |
|---|---|---|---|
| **A. 坚持爽游基准（推荐）** | 会动弹窗后置（≥L8）或改为"风险可选"开关；前 30 分钟纯爽；惩罚后置 | 放弃"早点尝苦头"的设计意图；硬核摩擦感弱 | 休闲挂机/解压玩家，留存与传播更优 |
| **B. 转向硬核劝退向** | 保留 L3 会动弹窗与多重惩罚叠加 | 与刮刮乐爽游内核相悖；前期劝退率高、长尾留存差 | 受虐/硬核小众，须重写基准定义 |

> **请用户确认**：是坚持爽游基准（按本 Plan 全量执行），还是转向硬核向（则 P3/P5/P6 关于"前移摩擦"的结论需推翻、基准重定义）。**以下主体默认按取向 A 撰写**；若选 B，则仅 P1（本金清零）、P2-1（XP 死值）、P4（离线收益）等"非取向相关 bug"仍需修复，其余"后置摩擦"类方案改为可选。

---

## 三、主体方案（P1–P6）

### P1 · 本金与损失（支柱① / 牵连⑤）

**P1-1【high】transformer 现金全额清零，且开局即可刷出**
- 问题：`transformer` 事件直接 `ctx.state.points = 0`（`economyModule.ts:113`），`RISK_EVENT` 上报 `amount` 是当时全部余额（`coreModule.ts:442`）。cosmic 仅 `level<=COSMIC_MAX_LEVEL=6`、`COSMIC_CHANCE=0.05`/台出现（`balance.ts:85-87`），`phoneFactory.ts:18` 确认开局第 1 关即可刷出；20 秒倒计时 + 弹窗遮挡可能让玩家来不及拆除。违反支柱①、⑤。
- 方案（待校准）：
  - 方案 A（推荐）：`COSMIC_MAX_LEVEL 6→0`（关闭早期清零）或移到 `SCAM` 之后的 L8+。
  - 方案 B（若保留）：`economyModule.ts:113` 改 `points = Math.max(0, points - Math.min(points*0.15, 50*tier))`；`COSMIC_CHANCE 0.05→0.02`；`COSMIC_TRANSFORM_MS 20000→30000`；同步把 `coreModule.ts:442` 的 `amount` 改为实际扣款额而非整余额。
- 改动文件：`balance.ts`、`economyModule.ts`、`coreModule.ts`
- 验收：前 30 分钟（≤L6）内不出现任何"现金清零"；若保留 cosmic，单次最大损失 ≤ 当前现金 15% 且有上限。

**P1-2【high】points 唯一货币，本金与可投资余额零隔离**
- 问题：`points` 是唯一货币字段（`state.types.ts:92`），开局 0（`persistence.ts:9`），买升级、入账、五类扣款全部咬同一字段（`economyModule.ts:86-114`），无任何"已结算收入不可被夺走"保护层。
- 方案（待校准）：新增 `state.bankedFloor`；`PHONE_RETURNED` 入账时 `bankedFloor = max(bankedFloor, points*0.6)`；所有扣款统一改为 `points = Math.max(bankedFloor, points - amount)`，保证任意时刻 `points >= 历史峰值的 60%`。需在 `state.types.ts:92` 旁加字段并在 `persistence.ts` 初始化/ensure。
- 改动文件：`state.types.ts`、`economyModule.ts`、`persistence.ts`
- 验收：连续触发任意罚款后，现金永不低于历史峰值的设定比例（默认 60%）。

**P1-3【medium】罚款随等级/档次线性无上限增长**
- 问题：`scamPenalty = Math.max(5, Math.round((9 + level*3) * (1 - 0.12*antivirus)))`，线性随 level 增长无封顶（`coreModule.ts:328-331`）；`offer_fail 28*tier`、`golden_break 60*tier`、`bait_fail 22*tier`（`balance.ts:62,75,93-94`；计算点 `coreModule.ts:149,202,233`）。后期单次损失体量大，反复削平净增长曲线，违背支柱③。
- 方案（待校准）：`coreModule.ts:330` scamPenalty 改 `Math.min(Math.round(9 + 8*Math.log2(level+1)), points*0.08)`（封顶 8% 现金）；`offer_fail/golden_break/bait_fail` 在 `economyModule.ts:111` 统一追加 `amount = Math.min(amount, points*0.10)`；`GOLDEN_FINE_PER_TIER 60→30`（`balance.ts:75`）。
- 改动文件：`coreModule.ts`、`balance.ts`、`economyModule.ts`
- 验收：任何单次罚款 ≤ 当前现金的固定上限比例；scam 后期罚款增速由线性转对数。

**P1-4【medium】声誉惩罚二阶复利**
- 问题：罚款同时扣声誉（`bait -0.05` `shopModule.ts:150` / `golden -0.3` `:159` / `offer -0.2` `:160` / `scam -0.15` `:207`），而声誉又同时压低结算倍率（`payoutMult` 经 `clamp(repMult,0.55,1.35)`，`economyModule.ts:33,38`）和到客速度（`arrivalIntervalMs`，`:42`）。一次失误造成扣现金 + 未来收入双重打折，与支柱⑤冲突。（注：transformer 已不再叠扣声誉，`shopModule.ts:156-157`。）
- 方案（待校准）：声誉惩罚减半/移除——`scam -0.15→-0.05`（`shopModule.ts:207`）、`golden -0.3→-0.1`（`:159`）、`offer -0.2→-0.08`（`:160`），`bait -0.05` 可保留；`economyModule.ts:38` 的 `clamp` 下限 `0.55→0.8`；或让 `repMult` 只进 `:42`（到客速度），不再进 `:38`（结算倍率）。
- 改动文件：`shopModule.ts`、`economyModule.ts`
- 验收：单次失误不再同时削减"当下现金"与"未来收入倍率"两个维度。

**P1-5【medium】会动弹窗 L3 间接放大扣本金风险**
- 问题：`POPUP_MOTION_UNLOCK_LEVEL=3`（`balance.ts:56-61`），且 `popupMotion.ts:14` 把 `bait` 列入 `canMove`，显著增加关 ✕ 难度，间接推高 scam 到点自动安装扣款（`coreModule.ts:427-434`）与 bait 误触扣款概率，把扣本金风险前移到本应纯爽的开局。
- 方案（待校准）：`POPUP_MOTION_UNLOCK_LEVEL 3→8`（或至少回 5）；若坚持早期登场，则在 `popupMotion.ts:14` 把 `'bait'` 从 `canMove` 移除（仅保留 `ad/timed`），直到 L8 再允许 bait 移动。
- 改动文件：`balance.ts`、`popupMotion.ts`
- 验收：会动弹窗不再叠加在带扣款属性的 bait 上（或解锁等级 ≥8）。

**P1-6【low】transformer 破产无任何缓冲/二次确认**
- 问题：倒计时归零即 `points=0`（`coreModule.ts:439-443` / `economyModule.ts:112-114`），无保底返还、无封顶、无警示。
- 方案（待校准）：与 P1-1 比例化方案统一——`economyModule.ts:113` 损失封顶 `Math.max(0, points - Math.min(points*0.2, 80))`（保留至少 80% 现金）；`coreModule.ts:438` 倒计时 `<5000ms` 时触发警示渲染/震动（`renderModule.ts` 配合）。
- 改动文件：`economyModule.ts`、`coreModule.ts`、`renderModule.ts`
- 验收：倒计时最后 5 秒有强提示；即便触发也保留多数现金。

---

### P2 · 进度与 XP（支柱②③）

**P2-1【high】归还手机的 XP 是死值**
- 问题：`settlePhone` 算出 `xp=Math.floor(clearedBadges*xpPerBadge*tipMult)` 并塞进 `PHONE_RETURNED`（`shopModule.ts:184,187`；类型 `events.types.ts:18`），但 economy 处理器只做 `points+=payout`、从不读 `event.xp`（`economyModule.ts:101-103`），全仓无消费者。最该爆发进度的"交付"时刻 XP 零入账，玩家全程只靠逐角标 `grantXp(amount)`（`coreModule.ts:145`）攒经验。
- 方案（待校准）：避免与逐角标 XP 双计——把 `settlePhone` 的 xp 改为"交付一次性奖金"语义（满意度/速度/档次加成），`xp = floor(clearedBadges * xpPerBadge * (0.5 + 0.5*moodMult) * tierMult)`（目标约逐击累计 XP 的 30%-50%）；economy 新增 `ctx.bus.on('PHONE_RETURNED', e=>handleXp(e.xp))` 走与 `XP_GAINED` 同路径（含 leveling + recalcDerived）。
- 改动文件：`economyModule.ts`（新增 `PHONE_RETURNED→handleXp`）、`shopModule.ts`（改 xp 公式语义）
- 验收：交付整机后 XP/等级条有可见跳变；逐击与交付 XP 不重复计同一批角标。

**P2-2【high】会动弹窗前移到 L3，叠加多重负反馈打断节奏**
- 问题：`POPUP_MOTION_UNLOCK_LEVEL=3`（`balance.ts:56`）与诈骗 L3、恶意软件 L2、假奖励陷阱 L2 叠加（`balance.ts:22,33,63`），到 L3 累计清理仅 ~40 即陷入多重负反馈。dodge 在光标进 66px 半径时跳开（`popupMotion.ts:71-86`）、bubble 乱滚（`:38-57`），且 `popups.length>0` 即整机禁清（`layout.ts:186-198`；`coreModule.ts:163`）。dodge/bubble 概率为固定常量（`popupMotion.ts:17-22`），不随等级缓升。违反支柱⑤。
- 方案（待校准）：`POPUP_MOTION_UNLOCK_LEVEL 3→9`；在 `rollMotion` 内将 DODGE/BUBBLE 改为随等级线性放大（如 base 0.08、每级 +0.02、封顶 0.22）；`SCAM_UNLOCK_LEVEL 3→6`、`MALWARE_UNLOCK_LEVEL 2→5`、`BAIT_UNLOCK_LEVEL 2→5`。
- 改动文件：`balance.ts`、`popupMotion.ts:12-25`
- 验收：前 ~30 分钟（约到 L4-L5）内不出现会躲/会跑的弹窗；会动概率随等级渐进。

**P2-3【medium】交付/逐击均无 XP 数字反馈**
- 问题：逐击 pop 标签是 `-${event.amount}`（角标数，`renderModule.ts:1712`）；交付只飘 `+${event.payout}元`（`:1727`）；XP 仅以 HUD 底边 3px 细条存在（`xpRatio` 计算 `:1442`，绘制 `:1443-1446`）。玩家几乎看不到"在涨经验"。
- 方案（待校准）：`PHONE_RETURNED` 特效追加 `+N经验` 上浮（青蓝色 `#5B8DEF`）并在经验条做 ~0.3s 高亮脉冲；逐击连击 ≥3 时附带累计经验提示。
- 改动文件：`renderModule.ts:1726-1730`（交付特效）、`renderModule.ts:1442-1446`（经验条脉冲）
- 验收：交付与高连击时屏上可见 XP 上浮文字 + 经验条脉冲。

**P2-4【medium】无离线/挂机净收益**
- 问题：`loadState` 把 `lastTickAt` 重置为当前时刻（`persistence.ts:84`）、`nextArrivalAt` 收敛到 `now+4000`（`:85`），无任何按离线时长的 XP/现金补偿；学徒（`botRatePerSec=botCount*0.5*1.18^botSpeed`，`economyModule.ts:41`）只在前台 `update(dt)` 实时跑（`automationModule.ts:36-51`）。违反支柱④。
- 方案（待校准）：`load` 时先读旧 `lastTickAt` 再覆盖，`offlineSec=(now-savedLastTickAt)/1000`，`offlineXp=min(cap, botRatePerSec*xpPerBadge*offlineSec*0.4)`，`cap≈8 小时等效`；以"欢迎回来 +X"弹窗呈现。
- 改动文件：`persistence.ts:73-98`（先存旧值再覆盖、返回 offlineMs）、`economyModule.ts`（offline 结算调 handleXp）、`renderModule.ts`（欢迎回来特效）
- 验收：离开 ≥1 分钟回来有正向离线结算与提示弹窗。

**P2-5【low】中期手动清理力成长断档**
- 问题：`clearPerHit=1+up_clear`（`economyModule.ts:36`），`up_clear maxLevel=8`（`upgrades.data.ts:13`）→单击最高 9；swipe 连清要 `SWIPE_UNLOCK_LEVEL=12`（`balance.ts:36,40`）。L5-L11 段手动清理力几乎只靠学徒。
- 方案（待校准）：`up_clear maxLevel 8→12`（desc 文案同步改）；`SWIPE_UNLOCK_LEVEL 12→6`。
- 改动文件：`upgrades.data.ts:13`（及 desc 文案）、`balance.ts:36`
- 验收：L5-L11 段单击清理力随升级持续上扬。

---

### P3 · 解锁顺序（支柱⑤ 节奏）

**P3-01【high】会动弹窗提前到 L3，几率固定不渐进**
- 问题：`POPUP_MOTION_UNLOCK_LEVEL=3`（`balance.ts:56`），注释"玩家早点尝到苦头"（`balance.ts:55`）；`POPUP_DODGE_CHANCE=0.22`、`POPUP_BUBBLE_CHANCE=0.16`（`balance.ts:57-58`）；`rollMotion` 几率为生成时一次性判定固定，无随等级递增（`popupMotion.ts:12-25`）。
- 方案（待校准）：`POPUP_MOTION_UNLOCK_LEVEL 3→14`（推迟到滑动连清解锁后）；`POPUP_DODGE_CHANCE 0.22→0.10`、`POPUP_BUBBLE_CHANCE 0.16→0.08`；`rollMotion` 改随等级渐进。
- 改动文件：`balance.ts`、`popupMotion.ts`
- 验收：前期保持"撕开即中"，会动弹窗在中期才登场。

**P3-02【high】前期惩罚全部前置堆叠**
- 问题：`malware L2`（`balance.ts:33`）、`bait L2`（`:63`）、`scam L3`（`:22`）、会动弹窗 L3、`offer L4`（`:90`），外加 cosmic 现金清零仅在 `level<=6` 新手期出现（`balance.ts:85-87`，`phoneFactory.ts:18`）。纯爽窗口几乎为 0。
- 方案（待校准）：拉开阶梯——`MALWARE_UNLOCK_LEVEL 2→5`、`BAIT_UNLOCK_LEVEL 2→8`、`SCAM_UNLOCK_LEVEL 3→7`、`OFFER_UNLOCK_LEVEL 4→9`。L1-3 仅纯清理 + 无害广告。
- 改动文件：`balance.ts`
- 验收：L1-3 无任何扣款/清零类机制。

**P3-03【high】救济/止损技能晚于惩罚登场**
- 问题：整机秒清 `skill_clearphone unlockLevel=5`（`skills.data.ts:12`）、一键净化 `skill_closeall=6`（`:22`）、信号冻结 `skill_freeze=8`（`:32`），全部晚于弹窗 L2 / 诈骗 + 会动弹窗 L3。"先止损后给爽"反向节奏。
- 方案（待校准）：`skill_clearphone 5→3`；`skill_closeall 6→`与 scam 同级或低 1 级；`skill_freeze 8→`与会动弹窗同期。
- 改动文件：`skills.data.ts`
- 验收：每类惩罚登场时已有对应止损手段可用。

**P3-04【high】cosmic 把最重惩罚专门绑定到新手期**
- 问题：`COSMIC_MAX_LEVEL=6`（`balance.ts:85`）、`COSMIC_TRANSFORM_MS=20000`（`:87`），`phoneFactory.ts:18` 仅 `level<=6` 出 cosmic；倒计时归零发 `RISK_EVENT 'transformer'`（`coreModule.ts:437-443`），`economyModule.ts:112-113` 置 `points=0`。与支柱①、⑤同时冲突。
- 方案（待校准）：`COSMIC_MAX_LEVEL 6→0`（禁用前期）或改后期内容；若保留则 `COSMIC_TRANSFORM_MS 20000→35000`，并把 `economyModule.ts` transformer 分支由 `points=0` 改为按报酬扣除。
- 改动文件：`balance.ts`、`phoneFactory.ts`、`economyModule.ts`
- 验收：新手期不再出现现金清零型 cosmic。

**P3-05【medium】滑动连清锁到 L12**
- 问题：`SWIPE_UNLOCK_LEVEL=12`（`balance.ts:36`，`upgradeUnlockLevel` 返回该值 `:40`；定义 `upgrades.data.ts:16-26`）。前期缺早期爽感放大器。
- 方案（待校准）：`SWIPE_UNLOCK_LEVEL 12→4`；可同步上调 `up_swipe baseCost`（当前 130）。
- 改动文件：`balance.ts`、`upgrades.data.ts`
- 验收：前期即可体验"一拖连清"解压感。

**P3-06【medium】升级解锁无滴灌（除滑动外 12 项 L1 同开）**
- 问题：`upgradeUnlockLevel` 除 `up_swipe` 外全部 `return 1`（`balance.ts:39-42`）；全表 13 项（`upgrades.data.ts:4-148`），除滑动外 12 项开局同时摆出，面板信息过载。
- 方案（待校准）：把 `upgradeUnlockLevel` 扩展为映射表——`up_clear/up_value/up_queue/up_patience=1`；`up_botcount/up_botspeed=3`；`up_payout/up_slot=5`；defense 系 = 对应惩罚解锁同级。
- 改动文件：`balance.ts`
- 验收：升级分阶段解锁，每升级解锁 1-2 项。

**P3-07【medium】防御升级名义 L1 可买但买不起**
- 问题：`up_adblock 220`（`upgrades.data.ts:110`）、`up_antivirus 360`（`:121`）、`up_antimalware 300`（`:143`）、`up_notifclear 130`（`:132`）；首档手机 payout 极低（`TIER_PAYOUT_STEP=0.32`，`balance.ts:69`）。惩罚 L2-3 已登场而对策买不起。
- 方案（待校准）：优先与 P3-02 联动后移惩罚使真空期自然消失（届时可不改价）；若保留惩罚前置则 `up_adblock 220→80`、`up_antimalware 300→120`、`up_antivirus 360→150`。
- 改动文件：`upgrades.data.ts`
- 验收：惩罚登场时对应防御升级在前期收入范围内可购。

---

### P4 · 挂机与离线（支柱④）

**P4-1【high】完全没有离线结算**
- 问题：`loadState` 把 `lastTickAt` 重置为 `performance.now()`、`nextArrivalAt` 钳到 `now+4000`（`persistence.ts:84-85`），未保存任何墙钟时间戳。违反支柱④。
- 方案（待校准）：`saveState` 写 `savedAt=Date.now()`；`loadState` 算 `awayMs=Date.now()-savedAt`，按学徒等效现金速率折算离线净正产出（不扣顾客/不触诈骗/不流失耐心），上限 `OFFLINE_CAP_MS=8*3600*1000`、`OFFLINE_EFFICIENCY=0.5`；`awayMs<60000` 静默累计不弹窗。
- 改动文件：`persistence.ts`、`main.ts`、`economyModule.ts`
- 验收：关页/切后台再回来有"欢迎回来 +X"净正结算。

**P4-2【high】后台即暂停且无补偿**
- 问题：模拟由 `requestAnimationFrame` 驱动、`dt=Math.min(100, now-last)`（`main.ts:72-81`）；标签页隐藏时 rAF 被节流/暂停，回来最多补一帧 100ms。
- 方案（待校准）：监听 `visibilitychange`，回到 visible 时用墙钟差走 P4-1 同一净正结算路径；切后台 >30s 即按离线处理。
- 改动文件：`main.ts`、`persistence.ts`
- 验收：切后台任意时长回来，产出按墙钟净正补算而非蒸发。

**P4-3【high】学徒不构成自动收入**
- 问题：bot 仅 emit `BADGE_CLEARED`（`automationModule.ts:17-24`），现金只在整机清完触发 `PHONE_RETURNED` 入账（`economyModule.ts:101-102`）；`botRatePerSec=botCount*0.5*1.18^speed`（`economyModule.ts:41`），1 名=0.5 个/秒，远低于单机涌入；遮挡/卡死时学徒 `continue` 跳过（`automationModule.ts:11`）。
- 方案（待校准）：`botRatePerSec` 基数 `0.5→1.2/学徒`（使 1 名 1.2/s > 单机涌入 0.38/s）；新增 `idleCashPerSec=botCount*0.8*1.18^botSpeed` 挂机持续入账。
- 改动文件：`economyModule.ts:41`、`automationModule.ts`
- 验收：1 名学徒即可覆盖单机涌入并有正盈余。

**P4-4【high】前台"挂机不点"净值为强负**
- 问题：角标涌入 `INCOMING_BASE_INTERVAL_MS=2600`（`balance.ts:10`，`coreModule.ts:392`）+ 在岗耐心 `0.5*dt`/候客满速流失（`shopModule.ts:248,263`，`BASE_PATIENCE_MS=30000` `balance.ts:8`）+ 怒走 `-0.2` 声誉（`shopModule.ts:257,268`）+ 恶意软件每 1500ms `+（3+level*0.4）`累积至 `MALWARE_LAG_THRESHOLD=78` 卡死（`coreModule.ts:378-381`，`balance.ts:31`）+ scam 到点扣款 `max(5,(9+level*3)*(1-0.12*antivirus))` 并 `-0.15` 声誉/`-28%` 耐心（`coreModule.ts:330,429-431`，`shopModule.ts:205-207`）+ cosmic 20s 清零（`coreModule.ts:439-442`）。全部自动恶化无对冲。
- 方案（待校准）：`IDLE_GRACE_MS=15000` 后：`ACTIVE_PATIENCE_RATE*0.15`、scam/cosmic/malware 暂停（复用 `isFrozen` 开关），学徒净收益保持为正；恢复输入后再启用满额压力。
- 改动文件：`shopModule.ts:248`、`coreModule.ts:376-451`
- 验收：玩家空闲 ≥15s 后风险机制冻结、净值不再为负。

**P4-5【medium】会动弹窗放大"离开即受罚"体感**
- 问题：`POPUP_MOTION_UNLOCK_LEVEL=3`（`balance.ts:56`），bubble 按 `POPUP_BUBBLE_SPEED=0.26`（`balance.ts:59`）持续乱滚（`popupMotion.ts:38-57`），不受 `cursor.visible` 限制；短暂离开回来更难快速清场。
- 方案（待校准）：`POPUP_MOTION_UNLOCK_LEVEL 3→8`，晚于新手期；或拆分 bubble L6、dodge L10。
- 改动文件：`balance.ts:56`
- 验收：前 30 分钟无持续乱滚 bubble。

**P4-6【low】lastTickAt 为死字段**
- 问题：`lastTickAt` 每帧写入（`coreModule.ts:464`）、load 时重置（`persistence.ts:84`），但从不被任何读取/catch-up 使用（全工程仅声明 `state.types.ts:137`、初始化 `persistence.ts:43`、重置 `:84`、每帧写 `coreModule.ts:464`），易误以为已有离线逻辑。
- 方案（待校准）：改造成持久化的 `lastSettledAt=Date.now()`（配合 P4-1，saveState 持久化、loadState 计算 awayMs）或删除。
- 改动文件：`coreModule.ts:464`、`persistence.ts:43`、`state.types.ts:137`
- 验收：该字段要么真正用于离线结算，要么移除。

---

### P5 · 长尾与转生（支柱③）

**P5-1【high】完全没有转生/prestige 重开循环**
- 问题：全 src 无 prestige/rebirth/ascend/转生/招牌/声望星；`clearState` 仅 `localStorage.removeItem(SAVE_KEY)` 无 carryover（`persistence.ts:108-110`）；reset 按钮 confirm 后 `clearState()+location.reload()`（`uiModule.ts:48-52`）；`createInitialState` 全字段归零（`persistence.ts:4-46`）。长尾复玩为零。
- 方案（待校准）：新增 prestige 循环——达段位（如 `level≥18`）后可重开，按历史峰值现金折算永久"声望星"；`prestigeStars = floor((历史峰值points/2000)^0.5)`，全局收益乘数 `= 1 + 0.10*prestigeStars`（目标二周目首小时收益 ≈ 一周目同期 3-5×）；新增 `doPrestige()` 替代销毁式 `clearState`，`recalcDerived` 把 `prestigeMult` 并入 `payoutMult/xpPerBadge`。
- 改动文件：`state.types.ts`、`persistence.ts`、`economyModule.ts`、`uiModule.ts`
- 验收：通关后可转生，二周目同期收益显著高于一周目。

**P5-2【high】14 项升级仅 2 项无限，其余硬封顶**
- 问题：仅 `up_value ×1.12^level`（`upgrades.data.ts:35-36`）、`up_payout ×1.18^level`（`:46-47`）为 `maxLevel:0`（无限），其余 12 项硬封顶 1-8；且受 `arrivalIntervalMs` 2400ms 下限夹制（`economyModule.ts:42`）。文件注释自承"高频核心升级设上限，避免无限叠加碾压玩法"（`upgrades.data.ts:3`），与支柱③相反。
- 方案（待校准）：恢复 2-3 条无限成长线——`up_clear maxLevel 8→20`、`up_botcount 6→12`、`up_botspeed 8→0`（无上限）且 `costGrowth 1.2→1.28`；新增无限"店铺名气"×1.15^level。`buyUpgrade` 已用 `def.maxLevel>0` 判封顶（`economyModule.ts:82`），设 0 即解锁无限。
- 改动文件：`upgrades.data.ts`
- 验收：至少 3 条成长线无硬上限，数字可持续指数增长。

**P5-3【high】数字会回滚甚至归零**
- 问题：`transformer` 直接 `points=0`（`economyModule.ts:113`）；`offer_fail/golden_break/bait_fail` 扣到最低 0（`:110-111`）；`SCAM_INSTALLED` 扣款 `Math.max(0, points-penalty)`（`:104-106`）。违反支柱①。
- 方案（待校准）：前 30 分钟禁用归零/扣款类事件，惩罚改"扣本次收益"而非扣已入账总现金——transformer 改为只损失当前在修手机报酬；`COSMIC/GOLDEN/BAIT/OFFER` 的 `*_UNLOCK_LEVEL` 全部 ≥12 或加 30 分钟门槛（当前 `GOLDEN=10/SOUL=8/OFFER=4/BAIT=2/COSMIC_MAX=6`，`balance.ts:72-94`）。
- 改动文件：`economyModule.ts`、`balance.ts`
- 验收：已入账总现金永不被罚款触碰，仅扣未结算收益。

**P5-4【medium】挂机收益封顶且无离线产出**
- 问题：`botRatePerSec=botCount*0.5*1.18^botSpeed`（`economyModule.ts:41`），`botCount≤6`（`upgrades.data.ts:90`）、`botSpeed≤8`（`:101`）硬封顶；无离线结算（`persistence.ts:84-85`）。
- 方案（待校准）：与 P4-1 统一加离线结算；`botCount maxLevel 6→10`；新增无限 botSpeed 线。
- 改动文件：`persistence.ts`、`economyModule.ts`
- 验收：挂机线可随时间持续放大且有离线产出。

**P5-5【medium】声誉乘数被 clamp、等级越滚越难而非越大**
- 问题：`payoutMult = 1.18^payoutLevel × clamp(0.7+rep*0.12, 0.55, 1.35)`（`economyModule.ts:33,38`），声誉对长尾零贡献；等级唯一无上限（`xpToNextLevel=10*level^1.6`，`balance.ts:96-98`）但只提升压力——`levelPressure 1+(level-1)*0.018`（`:34`）、`popPressure 1+(level-1)*0.03`（`:45`）使高等级弹窗更频繁（`:46`），不直接放大收益。
- 方案（待校准）：`repMult clamp` 上限 `1.35→3.0` 或改 `1+0.12*rep` 不封顶（`economyModule.ts:38`）；新增 `levelPayoutMult = 1 + 0.02*(level-1)` 抵消 popPressure 难度上升。
- 改动文件：`economyModule.ts`
- 验收：等级提升在加难度的同时给出对应收益乘数，保证净增长。

**P5-6【low】会动弹窗叠加"成长封顶 + 无转生"削弱长尾**
- 问题：`POPUP_MOTION_UNLOCK_LEVEL=3`（`balance.ts:56`），对比 `SWIPE_UNLOCK_LEVEL=12`（`:36`），把高摩擦前移，进一步削弱长尾留存。
- 方案（待校准）：`POPUP_MOTION_UNLOCK_LEVEL 3→12`（与滑动同级或更晚）；`POPUP_DODGE_CHANCE 0.22→0.12`。
- 改动文件：`balance.ts`
- 验收：会动弹窗作为高段位/转生后内容登场。

---

### P6 · 即时反馈与会动弹窗（支柱② & ⑤）

**P6-1【high】会动弹窗 L3 强制登场、整机禁清替代即时反馈**
- 问题：`POPUP_MOTION_UNLOCK_LEVEL=3`、注释"玩家早点尝到苦头"（`balance.ts:55-56`），到 L3 仅需 `10+30=40 XP`（`balance.ts:96-98`），`xpPerBadge` 初始=1（`persistence.ts:28`）；dodge 每帧朝远离光标方向跳 0.2 屏比例、半径 66px、无冷却（`popupMotion.ts:71-87`，`balance.ts:60-61`）；遮挡时 `findIconAt/iconsAlongPath` 整机禁清（`coreModule.ts:163,178`，`layout.ts:196-198`）。
- 方案（待校准）：`POPUP_MOTION_UNLOCK_LEVEL 3→8~10`（≈30 分钟后）；`POPUP_DODGE_CHANCE 0.22→0.08`、`POPUP_BUBBLE_CHANCE 0.16→0.06`（合计 14%）。
- 改动文件：`balance.ts:56-58`
- 验收：前期纯爽阶段无移动目标，会动弹窗与诈骗解耦。

**P6-2【high】会动弹窗触发率高且无 opt-out**
- 问题：L3 时 `ad/timed/bait` 三类全开（`coreModule.ts:52-56`，`balance.ts:63`），每个新弹窗 `bubble 0.16+dodge 0.22=0.38` 获运动（`popupMotion.ts:12-24`，`balance.ts:57-58`）；AD 基础间隔 6.4s/下限 2.2s、每机最多 3 个（`balance.ts:18,21`，`economyModule.ts:46`，`coreModule.ts:413`）；`up_adblock` 仅乘进 `adSpawnIntervalMs`（`economyModule.ts:29,46`）不影响 motion，属强加而非可选。
- 方案（待校准）：改造成"风险可选"——新增 `state.ui.chaosMode`（默认 false），`rollMotion` 顶部 `if(!chaosMode) return {motion:'none',...}` 短路；开启后 derived 收益乘子 `+15%~25%`（"想要更多奖励才招惹更难弹窗"）。
- 改动文件：`popupMotion.ts:12-15`、`state.types.ts`、`economyModule.ts:22-53`
- 验收：默认无会动弹窗；玩家主动开启挑战模式后才出现并附带收益加成。

**P6-3【medium】dodge 逃逸过强、近乎不可关**
- 问题：`POPUP_DODGE_STEP=0.2` 屏比例、`POPUP_DODGE_RADIUS=66px` 且每帧可触发（`popupMotion.ts:75-85`，`coreModule.ts:322-323`），60fps 下光标贴近时近乎瞬移到对角；全代码库无任何可达性兜底（无最大连续逃逸次数/可点窗口/冷却）。
- 方案（待校准）：`POPUP_DODGE_STEP 0.2→0.12`、`POPUP_DODGE_RADIUS 66→48`；新增 `popup.dodgeCount` 达 3 后停逃 600ms；`POPUP_BUBBLE_SPEED 0.26→0.18`。需在 `PhonePopup` 类型加 `dodgeCount/dodgeUntil`。
- 改动文件：`balance.ts:59-61`、`popupMotion.ts:71-87`、`state.types.ts`
- 验收：追 2-3 步必能点中移动 ✕。

**P6-4【low】点中移动 ✕ 无额外正反馈**
- 问题：`closePopup` 对所有非 scam 弹窗一律 `grantXp(1)` 不区分 motion（`coreModule.ts:188-193`）；`POPUP_CLOSED` 固定飘字"已关闭"+ 粒子 + `addShake(70,1)`（`renderModule.ts:1738-1743`）、音效固定 440/588Hz（`audioManager.ts:131-133`）。高难操作纯摩擦无回报。
- 方案（待校准）：`closePopup` 对 `motion!=='none'` 额外 `grantXp +2`；`POPUP_CLOSED` 渲染 `addShake 70→140`、粒子 ×1.8、加"精准!"飘字；audio 加专属上扬音效。
- 改动文件：`coreModule.ts:188-193`、`renderModule.ts:1738-1743`、`audioManager.ts:131-133`
- 验收：点中移动 ✕ 有专属爆裂/震屏/音效 + 小额额外 XP。

**P6-5【low】连击窗口/阈值多处硬编码、口径不一致**
- 问题：连击窗口 680ms 在 `renderModule.ts:1708` 与 `audioManager.ts:112` 两处各自硬编码（核心层无该常量）；显示阈值 `>=3`（`renderModule.ts:1600,1710`）与音效 streak 上限 16（`audioManager.ts:114`）口径不一致。属潜在一致性隐患（非当前 bug）。
- 方案（待校准）：抽成 `balance.ts` 常量 `COMBO_WINDOW_MS=680`、`COMBO_DISPLAY_MIN=3`，render/audio（及未来 core）共用。
- 改动文件：`balance.ts`、`renderModule.ts:1708,1600,1710`、`audioManager.ts:112`
- 验收：连击窗口与阈值单一来源，调参不脱节。

---

## 四、落地顺序与里程碑（按 ROI 排序）

| 里程碑 | 主题 | 包含条目 | 关键改动文件 | ROI 理由 |
|---|---|---|---|---|
| **M0** | 前置决策 | 用户确认取向 A / B | — | 阻塞项；取向不定则后续返工 |
| **M1** | 止血：本金不归零 | P1-1, P1-6, P3-04, P5-3 | `economyModule.ts`, `coreModule.ts`, `balance.ts`, `phoneFactory.ts` | 最严重违规（支柱①）；改动集中、风险最高 |
| **M2** | 撤回前移摩擦 | P3-01, P3-02, P3-03, P2-2, P4-5, P5-6, P6-1 | `balance.ts`, `popupMotion.ts`, `skills.data.ts` | 几乎全是常量调参，改动小、直接恢复前 30 分钟纯爽 |
| **M3** | XP 链路修复 | P2-1, P2-3 | `economyModule.ts`, `shopModule.ts`, `events.types.ts`, `renderModule.ts` | 修死值 bug + 即时反馈可见，体验跃升 |
| **M4** | 离线/挂机净收益 | P4-1, P4-2, P4-3, P4-4, P4-6, P2-4, P5-4 | `persistence.ts`, `main.ts`, `economyModule.ts`, `automationModule.ts`, `coreModule.ts` | 补齐支柱④；需新存档字段，工作量中等 |
| **M5** | 会动弹窗可选 + 可达性 | P6-2, P6-3, P6-4, P1-5 | `popupMotion.ts`, `state.types.ts`, `economyModule.ts`, `coreModule.ts`, `renderModule.ts`, `balance.ts` | 把惩罚反向包装为挑战爽点 |
| **M6** | 罚款封顶 + 解复利 | P1-3, P1-4, P1-2 | `coreModule.ts`, `economyModule.ts`, `shopModule.ts`, `balance.ts`, `state.types.ts`, `persistence.ts` | 长尾净增长保护 |
| **M7** | 长尾引擎：无限线 + 转生 | P5-1, P5-2, P5-5 | `upgrades.data.ts`, `state.types.ts`, `persistence.ts`, `economyModule.ts`, `uiModule.ts` | 补齐支柱③；工作量最大，留最后 |
| **M8** | 解锁滴灌 + 前期爽感 | P3-05, P3-06, P3-07, P2-5 | `balance.ts`, `upgrades.data.ts` | 打磨节奏，纯调参/映射表 |
| **M9** | 一致性收尾 | P6-5 | `balance.ts`, `renderModule.ts`, `audioManager.ts` | 低优先，防未来调参脱节 |

---

## 五、全局验收清单

**支柱① 数字只涨不跌**
- [ ] 前 30 分钟（≤L6）内无任何现金清零事件（P1-1, P3-04, P5-3）
- [ ] 任意罚款后现金永不低于历史峰值的设定比例（P1-2）
- [ ] 单次罚款 ≤ 当前现金固定上限比例，scam 增速转对数（P1-3）
- [ ] 已入账总现金仅被"未结算收益"扣减，不被罚款直接咬住（P5-3）

**支柱② 即时正反馈**
- [ ] 交付整机后 XP/等级条有可见跳变（P2-1）
- [ ] 交付与高连击时屏上有 XP 上浮文字 + 经验条脉冲（P2-3）
- [ ] 点中移动 ✕ 有专属强反馈 + 小额额外 XP（P6-4）
- [ ] 前期"撕开即中"手感不被移动目标打断（P6-1, P3-01）

**支柱③ 数字越滚越大**
- [ ] ≥3 条成长线无硬上限（P5-2）
- [ ] 等级提升同时给出收益乘数抵消难度上升（P5-5）
- [ ] 存在转生循环，二周目同期收益显著高于一周目（P5-1）

**支柱④ 挂机也涨**
- [ ] 关页/切后台回来有"欢迎回来 +X"净正结算（P4-1, P4-2）
- [ ] 1 名学徒即可覆盖单机涌入并有正盈余（P4-3）
- [ ] 玩家空闲 ≥15s 后风险机制冻结、净值不再为负（P4-4）
- [ ] `lastTickAt` 真正用于离线结算或已移除（P4-6）

**支柱⑤ 低摩擦无痛**
- [ ] L1-3 仅纯清理 + 无害广告，无扣款/清零（P3-02）
- [ ] 会动弹窗解锁等级回退（取向 A：≥8 或改风险可选默认关）（P3-01, P2-2, P6-1, P6-2）
- [ ] 每类惩罚登场时已有对应止损技能可用（P3-03）
- [ ] 一次失误不再同时削减当下现金与未来收入倍率（P1-4）
- [ ] 追 2-3 步必能点中移动 ✕（P6-3）

**节奏与一致性**
- [ ] 滑动连清前移至前期爽感区（P3-05）
- [ ] 升级分阶段滴灌解锁（P3-06）
- [ ] 惩罚登场时对应防御升级在前期收入范围内可购（P3-07）
- [ ] 连击窗口/阈值单一来源常量（P6-5）

**回归**
- [ ] `tsc` + `vite build` 无报错
- [ ] 旧存档读档兼容（新增字段均有默认值/ensure）
- [ ] M0 取向决策已由用户确认并记录