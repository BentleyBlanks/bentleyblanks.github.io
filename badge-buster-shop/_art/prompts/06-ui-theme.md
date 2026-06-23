# 06 · 界面元素需求 + UI 主题（P0）

> 现状：UI 全部由 `renderModule.ts` 程序绘制，主色是**深色玻璃（`rgba(12,20,34,…)` 深藏蓝）+ 亮蓝 `#5B8DEF`**——这是同屏第 5 种画风语言，与手绘哑光场景冲突。
> 任务分两部分：**(A) UI 主题令牌**（改代码即生效，把"深色玻璃"换成"奶油纸 + 暖木"，0 美术成本）；**(B) 可选切片美术**（9-slice / 小件，进一步提升质感）。
> 这是你要求的"界面元素也要提需求"的落点。

---

## A. UI 设计令牌（直接对到代码，建议先做）

把以下令牌应用到 `renderModule.ts` 对应函数，立刻消除"深色玻璃"违和。

### 颜色令牌
| 令牌 | 旧值 | 新值（cozy） | 用途 |
|---|---|---|---|
| `surface/bar` | `rgba(12,20,34,0.9)` 深藏蓝 | `rgba(242,231,212,0.92)` 奶油纸 | HUD 顶栏、底部控制栏、候客条背板 |
| `surface/card` | `rgba(255,255,255,0.85)` | `#F2E7D4` 奶油 | 弹层卡片、商店/技能行卡 |
| `surface/trim` | — | `#8A5A34` / `#6B4326` 木色 | 卡片/面板的暖木描边 |
| `accent/primary` | `#5B8DEF` 亮蓝 | `#3E8E7E` 哑青 | 选中态、主按钮、进度 |
| `accent/warn` | `#FF3B30` | `#C7493B` 哑红 | 角标计数、未读 |
| `accent/gold` | `#FFB300` | `#E6A92B`/`#F2C75B` 哑金 | 现金牌 |
| `ink/primary` | `#2B2B33` | `#2B2B33` 保留 | 主文字 |
| `ink/muted` | `#8A8790` | `#8A7E6B` 暖灰 | 次要文字 |
| `xp/bar` | `#5B8DEF` | `#7E9B6B` 鼠尾草绿 | 经验细条 |

### 形状 / 阴影 / 字体令牌
- 圆角：小件 12 / 卡片 16 / 大面板 20（保持一套比例）。
- 阴影：`rgba(43,43,51,0.18)`，blur 10–18，y+4~8（柔和、暖灰，非纯黑）。
- 描边：浅木 `rgba(138,90,52,0.22)`，1–1.5px。
- 字体：保留 `"PingFang SC","Microsoft YaHei",system-ui`；标题 900、正文 700；**去掉发光/重描边**，靠对比和留白。
- 材质提示：顶栏/控制栏可加一条很弱的木纹横向渐变，强化"店铺木台面"感。

### 逐元素改动指引（函数 → 改什么）
| 函数（renderModule.ts） | 当前 | 改为 |
|---|---|---|
| `drawHud` (1353) | 深藏蓝渐变条 + 金牌 + 发光 | 奶油纸/暖木顶栏，金牌改哑金、去强发光 |
| `drawControls` (1407) | 深色栏 + 白按钮 + 亮蓝选中 | 奶油栏 + 木边按钮，选中态哑青 `#3E8E7E` |
| `drawBackground` 候客条 (319) | `rgba(10,19,32,0.5)` 深色 | 奶油半透 `rgba(242,231,212,0.55)` + 木边 |
| `drawModal`/`drawShopRow`/`drawSkillRow`/`drawSettingRow` (1518/1436/1467/1501) | 白卡 + 亮蓝按钮 | 奶油卡 + 木边 + 哑青/哑金按钮，价签哑金 |
| `drawBadge` (1129) / 技能就绪红点 | 亮红 | 哑红 `#C7493B` |
| XP 条 (1404) | 亮蓝 | 鼠尾草绿 `#7E9B6B` |

---

## B. 可选切片美术（提示词；进一步提质感）

> 全部 `{{STYLE}}` + 正文 + `{{NEG}}`，透明 PNG。9-slice 件需四角四边可平铺拉伸 → 中心留纯色安全区。

| ID | 用途 | 尺寸 | 主体正文 |
|---|---|---|---|
| `ui_panel_9slice` | 弹层/卡片底（9-slice） | 192² | a cozy hand-painted rounded panel: cream paper face with a soft warm wood trim border and a gentle inner vignette, matte, designed as a 9-slice (uniform corners/edges, flat fillable center), soft drop shadow; transparent background |
| `ui_button_9slice` | 通用按钮底（9-slice，常/按下两态） | 160×96 | a cozy hand-painted rounded button: warm cream face with a soft wood rim and a subtle top highlight, matte, 9-slice ready; provide two states — resting and pressed (slightly darker, inset) |
| `ui_header_banner` | 顶部店招横幅 | 1024×192 | a cozy hand-painted wooden shop signboard banner, mid-brown wood with soft grain and rounded ends, blank center for in-engine text, matte, soft shadow |
| `ui_badge_bubble` | 角标计数气泡 | 128² | a cozy hand-painted small round count badge in matte muted red #C7493B with a soft cream rim, blank center for a number, soft shadow |
| `ui_cash_plate` | 现金牌底 | 320×128 | a cozy hand-painted rounded coin-gold plate (matte gold #E6A92B), soft rim, blank center for amount, soft shadow; no metallic glare |
| `ui_star_filled` / `ui_star_empty` | 声誉星 | 64² | a cozy hand-painted small star, matte gold (filled) / soft cream outline (empty) |
| `ui_finger_cursor` | 手指光标 `drawCursor` (860) | 256² | a cozy hand-painted pointing hand cursor (index finger extended, friendly chunky cartoon hand), warm skin, soft shadow, pointing toward upper-left tip; transparent background |
| `ui_slot_tab` | 工位切换标签 `drawSlotTabs` (1314) | 192×96 | a cozy hand-painted small tab shaped like a wooden tag/label, cream face + wood edge, blank center, soft shadow |

### 复制即用示例（`ui_finger_cursor`）
```
{{STYLE}}
a cozy hand-painted pointing hand cursor: a friendly chunky cartoon hand with the
index finger extended pointing toward the upper-left, warm painterly skin, soft
volume, one soft contact shadow; transparent background, centered.
Negative: {{NEG}}
```

## 验收要点
- 先做 A（令牌）即可让 `in_context` 达标——这是最高性价比的去违和动作。
- 9-slice 件：四角/四边在拉伸后不得变形或露缝 → 中心安全区必须是可平铺纯色。
- `finish_match`：现金牌/按钮**不得**出现玻璃高光（沿用历史教训）。
- 全局门禁：UI + 图标 + 背景三者同屏时应"像同一款游戏"。
