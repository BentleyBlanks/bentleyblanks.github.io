# 《角标清理铺》重平衡 Plan —— 向"刮刮乐式增量爽游"对齐

> 来源：制作人数值评审。目标：把"披着增量皮的主动街机"拉回**增量爽游**内核——*即时正反馈、永远在赢(本金不倒退)、数字越滚越大、挂机也涨、低摩擦*。
> 所有 `建议值` 均为待 playtest 校准的起点，不是定稿。代码位置用 `文件:行` 标注。

---

## 前置决策（必须先拍板）

**这游戏到底是"增量爽游"还是"主动街机/时间管理"？** 本 Plan 全部基于**倒向增量爽游**的前提。若你想保留街机硬核惩罚，则 P1/P2 不适用，需另写一版。
→ 默认按"增量爽游"推进。

执行优先级（按 ROI）：**P1 → P3 → P4 → P2 → P5**。P1 最伤、改动最小，先做。

---

## P1 · 数字会倒退（本金清零/扣款）→ 本金永不倒退

**问题**
- transformer 把现金直接清零：[economyModule.ts:112](../_dev/src/economy/economyModule.ts#L112) `ctx.state.points = 0`，触发于 [coreModule.ts:442](../_dev/src/core/coreModule.ts#L442)。
- golden_break / offer_fail / bait_fail / scam 全部从**本金**里扣：[economyModule.ts:104-114](../_dev/src/economy/economyModule.ts#L104)、[scamPenalty coreModule.ts:328](../_dev/src/core/coreModule.ts#L328)。
- 声誉同时压低收入：repMult 下限 0.55（[economyModule.ts:33-38](../_dev/src/economy/economyModule.ts#L33)），惩罚掉声誉时收入二次受损。
> 增量品类铁律：**绝不动玩家已入账的本金。** 这是当前最大反爽点。

**方案（核心思路：把"扣本金"改成"损失尚未入账的潜在收益"）**
1. 给手机加一个 `pendingPayout`（清理过程中累积的预期报酬，尚未入袋）。所有风险损失只从 `pendingPayout` 扣，扣到 0 为止，**永不触及 `state.points`**。
2. transformer：不再清零现金。改为 → 该顾客流失 + 声誉 −0.2 + **15 秒"店铺受损"debuff（收入 ×0.7）**。
3. golden_break / offer_fail / bait_fail / scam：损失 = `min(原罚款, 当前 pendingPayout)`；本金不变。
4. 声誉解耦：repMult 下限 0.55 → **0.85**（[economyModule.ts:38](../_dev/src/economy/economyModule.ts#L38)），上限保留 1.35，让"声誉=锦上添花"而非"掉了就饿死"。

**改动文件**：`economyModule.ts`、`coreModule.ts`、`state.types.ts`(加 `pendingPayout`)、`shopModule.ts`(结算时把 pending 入账)。

**验收**：连玩 30 分钟，`state.points` 任何时刻**只增不减**（debuff/罚款只表现为"少赚"，不表现为"变穷"）。

---

## P2 · 挂机净收益为负 → 挂机转正

**问题**
- 离开时：在岗顾客耐心持续流失（[shopModule.ts:248](../_dev/src/shop/shopModule.ts#L248) ACTIVE_PATIENCE_RATE 0.5）、恶意软件累积到卡机（[coreModule.ts:379](../_dev/src/core/coreModule.ts#L379)）、诈骗到点自动安装扣费（[coreModule.ts:427](../_dev/src/core/coreModule.ts#L427)）。
- 学徒(bots)虽自动清理产出（[botRatePerSec economyModule.ts:41](../_dev/src/economy/economyModule.ts#L41)），但被上述惩罚抵消，且**无离线结算**。
> 增量灵魂："睡一觉变富"。现在是"睡一觉变穷"。

**方案**
1. **离线收益**：载入存档时用 `now - lastTickAt`(已存在 [state.lastTickAt](../_dev/src/core/coreModule.ts#L464)) 计算离线时长，按 `botRatePerSec × 单角标均价` 发放，**上限 2 小时**，弹"离线期间学徒帮你赚了 X 元"。
2. **后台暂停惩罚**：`document.hidden` 时暂停恶意软件累积/诈骗倒计时/耐心流失（只跑学徒产出），回到前台再恢复。
3. **学徒前移变便宜**：up_botcount baseCost 280→**180**、解锁 L4；保证"招学徒"成为玩家第一个体验到的"挂机感"。

**改动文件**：`coreModule.ts`(载入离线结算 + hidden 守卫)、`balance.ts`(unlock)、`upgrades.data.ts`(cost)。

**验收**：开学徒后切后台 1 小时，回来现金净增 > 0、无卡机、无破产。

---

## P3 · 解锁顺序反了（惩罚前置、爽后置、升级一次性全开）→ 爽前置 + 惩罚后置 + 升级滴灌

**问题**
- 升级**除滑动外全 L1 解锁**（[upgradeUnlockLevel balance.ts:39](../_dev/src/content/balance.ts#L39)）→ 选择瘫痪 + 全程无"解锁新按钮"的滴灌爽点。
- 滑动连清(最爽手感)却卡 **L12**（[SWIPE_UNLOCK_LEVEL balance.ts:36](../_dev/src/content/balance.ts#L36)）。
- 技能**先给止损、后给爽**：净化 L6/冻结 L8/安抚 L10 在前，砸机 L20/小费 L16/多手 L13 在后（[skills.data.ts](../_dev/src/content/skills.data.ts)）。
- 惩罚机制**前置**：恶意软件 L2、假奖励 L2、诈骗 L3，而对应防御技能还没解锁。

**方案 A — 升级滴灌（建议解锁等级）**
| 升级 | 现 | 建议 |
|---|---|---|
| up_clear 厚手指 / up_value 经验账本 / up_queue 候客架 | L1 | L1 |
| up_patience 软座椅 | L1 | L2 |
| up_payout 金牌服务 / **up_swipe 顺滑手势** | L1 / **L12** | L3 / **L3** |
| up_botcount 招学徒 / up_notifclear 通知清理 | L1 | L4 |
| up_botspeed 学徒训练 / up_antimalware 后台杀毒 | L1 | L5 |
| up_slot 加装工位 / up_adblock 防弹窗 / up_antivirus 安全卫士 | L1 | L6 |

**方案 B — 技能重排（爽前置）**
| 技能 | 现 unlockLevel | 建议 |
|---|---|---|
| 整机秒清(power) | 5 | **4** |
| 一键净化(defense) | 6 | 6 |
| 砸机收割(power爽) | 20 | **7** |
| 多几双手(power/挂机) | 13 | **9** |
| 信号冻结(defense) | 8 | 11 |
| 小费冲刺(power×2) | 16 | **13** |
| 柜台安抚(defense) | 10 | 15 |

**方案 C — 惩罚后置（建议解锁等级）**
| 机制 | 现 | 建议 | 备注 |
|---|---|---|---|
| 恶意软件 MALWARE | L2 | **L5** | 与 up_antimalware 同步 |
| 假奖励陷阱 BAIT | L2 | **L8** | |
| 诈骗 SCAM | L3 | **L6** | 与 up_antivirus/一键净化 同步 |
| 会动的弹窗 MOTION | L5 | **L9** | |
| 灵魂手机 SOUL | L8 | L10 | |
| 盲盒赌局 OFFER | L4 | L4 | 保留——它是玩家**主动**选择的风险，不强加 |

**改动文件**：`balance.ts`(各 UNLOCK 常量 + upgradeUnlockLevel)、`skills.data.ts`(unlockLevel)。

**验收**：前 30 分钟≈零强制惩罚、纯爽；此后**每 1~2 级解锁一个新东西**（升级或技能或机制），全程有"新玩具"节奏。

---

## P4 · 结算高潮被削 + 前期 grind → 修结算 + 降 grind

**问题**
- **归还手机的 XP 是死值**：[settlePhone 算了 xp shopModule.ts:184](../_dev/src/shop/shopModule.ts#L184)，但 [economy 只取 payout 不取 xp economyModule.ts:101](../_dev/src/economy/economyModule.ts#L101) → "交付"这个本该最爽的瞬间只给钱不给经验。
- **前期 grind**：到 L10 需 ~1340 次清理（`xpToNext = 10×L^1.6` [balance.ts:96](../_dev/src/content/balance.ts#L96)），而 up_clear 上限仅 +8，清理力无法指数化 → 第一小时是平台期。

**方案**
1. **接上结算 XP**：economy 的 PHONE_RETURNED 里 `handleXp(event.xp)`。为避免双算，确立单一来源：
   - 即时反馈：每次清角标给 **0.5 XP**（保留"撕开即中"的手感）。
   - 主体经验：归还时一次性给 `clearedBadges × xpPerBadge`（大块、做成爽 spike）。
2. **结算做成高潮**：归还时弹大数字 + 连击倍率 reveal + 音效，比清单个角标响。
3. **降 grind**：曲线 `10×L^1.6` → **`9×L^1.5`**；叠加结算 XP 后，到 L10 累计清理约 **600~700 次**（≈减半）。

**改动文件**：`economyModule.ts`、`coreModule.ts`(grantXp 量)、`balance.ts`(xpToNextLevel)、`renderModule.ts`(结算特效)。

**验收**：到 L10 累计点击 ≤ 700；归还手机时屏幕反馈明显强于清单个角标。

---

## P5 · 缺指数长尾引擎 → 加转生 / 放开乘数

**问题**
- 无转生(prestige)；多数升级硬封顶（clear+8/slot+4/queue+6/patience+8/bot+6/8/防御+5~6），仅 [up_value 1.12^n](../_dev/src/content/upgrades.data.ts#L27)/[up_payout 1.18^n](../_dev/src/content/upgrades.data.ts#L39) 无限 → 长尾增长引擎太细。
> 刮刮乐爽游的复玩动力 = "重开一次，更快滚到更大"。

**方案**
1. **转生系统「金字招牌★」**：
   - 解锁：L15。重开 → 清空 points/level/upgrades，**保留招牌★**。
   - 获得：`stars = floor(peakLevel / 5)`（建议值）。
   - 永久加成：全局收入 & XP `×(1 + 0.1 × 总★)`。
2. **转生专属升级**：用★购买的几条无上限乘数（如"起手即带 N 名学徒""离线上限 +小时"），制造重开后的加速度。
3. 至少再放开 1 条无上限乘数（如 up_botspeed 去掉 maxLevel）。

**改动文件**：`state.types.ts`(stars/peak)、`balance.ts`(公式)、新 `prestigeModule.ts`、`uiModule.ts`/`renderModule.ts`(转生入口)、新增转生升级数据。

**验收**：第二周目同等时间到达的等级/财富明显高于首周目；玩家有"再来一次"的动机。

---

## 落地顺序与里程碑

| 阶段 | 内容 | 预期效果 |
|---|---|---|
| **M1** | P1 本金不倒退 + P4 接结算 XP/降曲线 | 立刻去掉最大反爽点，前期手感顺 |
| **M2** | P3 解锁滴灌 + 重排 | 节奏感、"新玩具"多巴胺 |
| **M3** | P2 离线收益 + 后台暂停惩罚 | 真正的"挂机爽" |
| **M4** | P5 转生引擎 | 长尾与复玩 |

**全局验收清单（达成即视为对齐增量爽游）**
- [ ] 本金任何时刻只增不减
- [ ] 前 30 分钟零强制惩罚
- [ ] 每 1~2 级解锁一个新东西
- [ ] 到 L10 累计点击 ≤ 700
- [ ] 挂机 1 小时净收益 > 0
- [ ] 存在转生循环，第二周目更快更大
