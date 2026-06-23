# 01 · App 图标（12 个 · 重绘 · P0）

> 现状：玻璃糖果 3D squircle，违和主因之一。任务：**全部重绘**为温暖手绘哑光方瓷砖，成为一家人。
> 拼装规则：`{{STYLE}}` + `{{TILE_TEMPLATE}}` + 每条的「主体 + 目标色」 + `{{NEG}}`。占位符见 `00-global-style-block.md`。
> 尺寸：render @512²，导出 `256²`（+`512²`@2x），透明 PNG。落点 `assets/art/icon_<id>.png`。

## `{{TILE_TEMPLATE}}`（12 个图标共用，保证同套）

```
a single cozy hand-painted app-icon tile: a rounded-square (squircle) tile with
corner radius about 22% of its size, matte hand-painted surface with a very
subtle top-lighter to bottom-darker painterly gradient and a soft hand-painted
bevel (absolutely no glassy reflection, no plastic shine); one centered cream
(#F2E7D4) pictogram occupying about 58% of the tile, painted with soft volume and
a consistent medium stroke weight; warm key light from the upper-left; one soft
blurred contact shadow beneath the tile; transparent background, centered, equal
padding on all sides.
```

> 关键不变量（套内门禁会查）：**同一圆角比例、同一符号粗细、同一光向、同一接地阴影、同一留白**。12 个并排应像同一套系统图标。

---

## 逐条（主体 + 目标瓷砖色）

> 目标色 = 把 `icons.data.ts` 的 `fallbackColor` 去饱和暖化后的"哑"色（缺图时 fallback 仍接近）。

| ID（文件） | 中文 | 符号主体（EN subject） | 瓷砖目标色 | 原 fallback |
|---|---|---|---|---|
| `icon_chat` | 聊天 | a speech bubble with three dots | dusty teal `#3E8E7E` | #26C6A6 |
| `icon_mail` | 邮件 | a closed envelope, flap seam visible | dusty blue `#5B7FA6` | #5B8DEF |
| `icon_social` | 社交 | two overlapping rounded person silhouettes | muted dusty rose `#C2727A` | #FF6B81 |
| `icon_news` | 新闻 | a rolled / folded newspaper | warm mustard `#D9A441` | #FF9F43 |
| `icon_shop` | 购物 | a shopping bag with two round handles | muted dusty violet `#7E76A8` | #8E7CF6 |
| `icon_game` | 游戏 | a simple game controller (d-pad + buttons) | dusty blue-teal `#5E93A8` | #5BC0EB |
| `icon_video` | 视频 | a single rounded play triangle | muted brick red `#C7493B` | #EF476F |
| `icon_music` | 音乐 | a single eighth music note | sage green `#5E9E86` | #06D6A0 |
| `icon_photo` | 相册 | a framed picture of a small mountain and sun | warm mustard `#D9A441` | #FFD166 |
| `icon_map` | 地图 | a folded map with a location pin | dusty blue-teal `#4E8197` | #4D96FF |
| `icon_weather` | 天气 | a sun peeking from behind a soft cloud | soft cyan `#6FAEB8` | #73D2DE |
| `icon_calendar` | 日历 | a calendar page with a top binding and a date block | charcoal `#46433F`, cream page | #2B2B33 |

### 复制即用示例（以 `icon_chat` 为例）

```
{{STYLE}}
{{TILE_TEMPLATE}}
Subject: a speech bubble with three dots.
Tile color: dusty teal #3E8E7E (matte, warm, low saturation), cream pictogram.
Negative: {{NEG}}
```

> 其余 11 个：把 `Subject` 与 `Tile color` 换成表中对应值即可，其余原样不动。

## 验收要点（除通用阈值外）
- 同套 `family_consistency`：12 张合影必须像一个系统图标包（圆角/粗细/光向/留白一致）。
- `finish_match`：出现任何玻璃高光/塑料反光直接否决（这是历史违和点）。
- `readability`：96px 下符号轮廓清晰、可一眼辨认类别。
- `palette_match`：瓷砖色严格落在目标色或其邻近哑化变体，不得回到原鲜艳 fallback。
