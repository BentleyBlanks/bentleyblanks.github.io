# 03 · 技能图标（7 个 · 新建 · P1）

> 现状：`skills.data.ts` 已留 `artId: 'skill_*'`，但当前用 emoji 占位（🧼🛡️❄️☕🙌💰🔨）。任务：**全新创建** 7 枚技能图标，并保留各自 emoji 的语义识别度。
> 拼装：`{{STYLE}}` + `{{ABILITY_TEMPLATE}}` + 每条「主体」 + `{{NEG}}`。
> 尺寸：render @384²，导出 `192²`（+`256²`），透明 PNG。落点 `assets/art/skill_<id>.png`。
> 用途：底部技能栏圆形按钮 + 技能弹层；需小尺寸可读，且要有"主动能力"的能量感（但仍哑光）。

## `{{ABILITY_TEMPLATE}}`（7 个共用，区别于升级木徽章）

```
a cozy hand-painted circular ability emblem: a deep teal-to-ink disc
(#33312F core warming to #3E8E7E) with a soft hand-painted warm glow ring around
the rim (gentle painterly glow, NOT neon, NOT bloom); a single bright symbol
painted in cream / warm light tones at the center with soft energy but a matte
finish; warm key light from the upper-left; one soft contact shadow beneath the
emblem; transparent background, centered, generous padding.
```

> 三类图标的底板必须三态分明：**App=方瓷砖 / 升级=圆木徽章 / 技能=深色发光圆章**。

---

## 逐条（中心符号；保留 emoji 语义）

| ID（文件） | 技能名 | emoji | 中心符号（EN symbol） |
|---|---|---|---|
| `skill_clearphone` | 整机秒清 | 🧼 | a bar of soap with a few soft sparkle/bubble accents |
| `skill_closeall` | 一键净化 | 🛡️ | a shield with a soft purifying sweep arc |
| `skill_freeze` | 信号冻结 | ❄️ | a single clean snowflake |
| `skill_soothe` | 柜台安抚 | ☕ | a warm coffee cup with a soft steam curl |
| `skill_hands` | 多几双手 | 🙌 | two raised helping hands |
| `skill_tip` | 小费冲刺 | 💰 | a money pouch / coin with soft motion lines (matte gold #E6A92B) |
| `skill_smash` | 砸机收割 | 🔨 | a sturdy hammer with a small impact burst |

### 复制即用示例（`skill_freeze`）

```
{{STYLE}}
{{ABILITY_TEMPLATE}}
Center symbol: a single clean snowflake in cool cream-white, soft painterly,
readable at small size; the rim glow tinted slightly cool for this one only.
Negative: {{NEG}}
```

> 说明：除 `skill_freeze`（冷调微调）外，其余统一暖光环；`skill_tip` 的金为哑光金。

## 验收要点
- `readability`：64px 下符号一眼可辨，对应原 emoji 含义。
- `family_consistency`：7 枚同一发光圆章底板、同符号亮度层级。
- `finish_match`：发光是"手绘柔光"，出现霓虹/泛光直接否决。
- 与升级图标对比：底板必须显著不同（深色发光圆章 vs 木徽章）。
