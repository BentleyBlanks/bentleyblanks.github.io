# 02 · 升级图标（13 个 · 新建 · P1）

> 现状：`upgrades.data.ts` 已为每项升级留了 `artId: 'up_*'`，但**没有任何图**（商店里目前只有文字）。任务：**全新创建** 13 枚图标。
> 拼装：`{{STYLE}}` + `{{BADGE_TEMPLATE}}` + 每条「主体」 + `{{NEG}}`。
> 尺寸：render @384²，导出 `192²`（+`256²`），透明 PNG。落点 `assets/art/up_<id>.png`。
> 用途：商店升级条左侧小图（约 48px 高），**必须小尺寸可辨识** → 主体形状要简洁概括。

## `{{BADGE_TEMPLATE}}`（13 个共用，区别于 App 方瓷砖）

```
a cozy hand-painted circular wooden badge / coaster: a round mid-brown wood
medallion (#8A5A34) with soft hand-painted grain, a darker wood rim (#6B4326) and
a recessed cream inset (#F2E7D4) in the center; a single small object painted on
the cream inset with soft sculpted volume, as if hand-carved/painted; matte
finish, warm key light from the upper-left, one soft contact shadow beneath the
badge; transparent background, centered, generous padding.
```

> 与 App 图标的"方瓷砖"刻意不同（**圆木徽章**），让玩家一眼区分"应用 vs 升级"。13 枚之间必须同底板、同光向。

---

## 逐条（中心主体）

| ID（文件） | 升级名 | 中心主体（EN subject on cream inset） |
|---|---|---|
| `up_clear` | 厚手指 | a chunky friendly cartoon thumb pressing down |
| `up_swipe` | 顺滑手势 | a hand making a swipe gesture with a short soft motion trail |
| `up_value` | 经验账本 | a small ledger / notebook with a tiny star on the cover |
| `up_payout` | 金牌服务 | a gold service medal with a short ribbon (matte gold #E6A92B) |
| `up_slot` | 加装工位 | a small repair workbench / desk with a tiny phone on it |
| `up_queue` | 候客架 | a small waiting bench / row of seats |
| `up_patience` | 软座椅 | a cozy cushioned armchair |
| `up_botcount` | 招学徒 | a friendly apprentice character bust with an apron |
| `up_botspeed` | 学徒训练 | a wrench crossed with a small dumbbell, soft speed lines |
| `up_adblock` | 防弹窗插件 | a shield deflecting a small popup window |
| `up_antivirus` | 安全卫士 | a security shield with a soft checkmark |
| `up_notifclear` | 通知清理 | a notification bell with a small broom sweeping |
| `up_antimalware` | 后台杀毒 | a friendly cartoon bug under a magnifier / scan beam |

### 复制即用示例（`up_payout`）

```
{{STYLE}}
{{BADGE_TEMPLATE}}
Subject on the cream inset: a gold service medal with a short ribbon, matte gold
#E6A92B (no metallic shine), simple and readable at small size.
Negative: {{NEG}}
```

## 验收要点
- `readability`：48px 下能区分这 13 项各自含义 → 拒绝过细/过密主体。
- `family_consistency`：13 枚同一木徽章底板、同光向、奶油内圈一致。
- 与 App 图标对比：底板形状必须明显不同（圆木 vs 方瓷砖），避免混淆。
- `up_payout` 的金为**哑光金**，不得镜面反光（呼应禁则）。
