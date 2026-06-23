# 08 · 品牌物料 Logo / 标题 / favicon / 分享图（P2）

> 现状：无统一品牌物料。任务：用同一画风做游戏标识，统一对外形象。
> 拼装：`{{STYLE}}` + 正文 + `{{NEG}}`。

| ID | 用途 | 尺寸 | 主体正文 |
|---|---|---|---|
| `logo_mark` | 应用图标 / 标识 | render 1024² → 512²/256² | a cozy hand-painted app logo mark for a phone-repair shop game: a friendly smartphone with a small red notification badge being wiped clean by a sparkle, on a warm cream rounded tile, matte painterly, soft shadow; transparent background |
| `title_wordmark` | 标题字（中文《角标清理铺》） | 2048×1024 → 1024×512 | a cozy hand-painted Chinese title wordmark area / plaque: a warm wooden shop signboard with rounded ends and soft grain, blank center reserved for the title text to be set in-engine; matte, soft shadow; transparent background — do NOT render any letters |
| `favicon` | 浏览器页签 | 256² → 64/32 | reuse a simplified `logo_mark`: just the smartphone + clean sparkle, bold and readable at 32px, matte cozy, transparent background |
| `og_share` | 社交分享图 | 1200×630 | a cozy hand-painted promo banner using the shop-counter scene mood: warm repair-shop counter, a phone being cleaned, room reserved on one side for title text (leave blank), matte painterly, inviting |

### 复制即用示例（`logo_mark`）
```
{{STYLE}}
a cozy hand-painted app logo mark for a phone-repair shop game: a friendly
smartphone with a small matte-red notification badge being wiped clean by a soft
sparkle, sitting on a warm cream rounded tile, matte painterly, one soft contact
shadow; bold and readable at small size; transparent background, centered.
Negative: {{NEG}}
```

## 验收要点
- `title_wordmark` / `og_share` **不要 AI 直接生成中文字**（易出乱码）→ 留白区，引擎/设计排版填字。
- favicon 在 32px 下仍可识别"清理手机角标"的核心意象。
- 与 `realistic-shop-counter.png` 同调，作为对外第一印象不得违和。
