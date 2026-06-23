# 05 · 弹窗与事件图（重绘+扩展 · P0）

> 现状：`ad_redpacket` / `ad_offer` / `scam_warning` 是 C4D 写实 3D 渲染（超高饱和"赌场奖励"感），与场景冲突极强，是违和主因之一。
> 世界观说明：这些是游戏里手机屏上**故意浮夸的假广告/假诈骗**——内容可以"吵"，但**渲染语言必须回到手绘哑光**，降饱和、统一边缘/接地/光向。
> 任务：重绘现有 3 张 + 新增若干事件元素（代码已有 notification / malware / lag / blocked 等机制）。
> 拼装：`{{STYLE}}` + 每条正文 + `{{NEG}}`。透明 PNG。落点 `assets/art/<id>.png`。

---

## A. 重绘现有 3 张

### `ad_redpacket` — 红包广告（render @1024×640 → 512×320）
```
{{STYLE}}
A cozy hand-painted fake "lucky red packet" ad prop: a plump red envelope
(matte muted red #C7493B, gold clasp in matte gold #E6A92B) overflowing with a
few hand-painted gold coins and small gift boxes; a couple of soft confetti
shapes; deliberately a bit loud and tempting BUT painted matte with soft
brushwork and restrained saturation, grounded by one soft contact shadow;
transparent background, centered.
Negative: {{NEG}}
```

### `ad_offer` — 中奖/优惠广告（render @1024×600 → 512×300）
```
{{STYLE}}
A cozy hand-painted fake "special offer / prize" banner prop: a starburst label
shape (matte muted red + cream face) with a small hand-painted gift box and a
short stack of gold coins (matte gold), a few soft sparkle accents; loud-but-cozy,
matte painterly finish, low saturation, one soft contact shadow; leave the label
face blank/cream for in-engine text; transparent background, centered.
Negative: {{NEG}}
```

### `scam_warning` — 诈骗警告（render @1024×720 → 512×360）
```
{{STYLE}}
A cozy hand-painted fake "virus / scam alert" panel prop: a chunky rounded panel
(cream face, charcoal #46433F frame) with a friendly-but-alarming warning triangle
(matte muted red #C7493B), a small cartoon virus blob and a cracked shield icon,
a couple of soft warning lights; readable as "danger" but painted matte and warm,
NOT a 3D render, NOT neon; one soft contact shadow; transparent background.
Negative: {{NEG}}
```

---

## B. 新增事件元素（按代码已有机制补全）

> 这些目前是程序绘制或缺图。补成手绘小件，统一画风后可替换/叠加。

| 建议 ID | 用途（代码处） | 尺寸 | 主体正文（夹在 STYLE/NEG 间） |
|---|---|---|---|
| `notif_ad` | 通知栏广告条 `NOTIFICATION_CLEARED` / `drawNotifBar` | 512×128 | a cozy hand-painted notification banner card: rounded cream card with a small app dot on the left and blank lines for text, a tiny red dot badge; matte, soft shadow |
| `malware_bug` | 后台恶意程序 `MALWARE_CLEARED` / `drawMalware` | 256² | a friendly cozy cartoon malware bug: a small rounded dark-teal critter with stubby legs and a grumpy face, matte painterly, soft contact shadow |
| `popup_ad_window` | 通用广告弹窗外框 `drawPopups` | 512×640 | a cozy hand-painted fake mobile ad window frame: rounded cream window with a charcoal title bar and a small close X, blank body for in-engine content, matte, soft shadow |
| `lag_overlay` | 卡顿遮罩 `drawLagOverlay` | 512×1024 | a subtle cozy hand-painted "laggy screen" overlay: faint warm scanline/smear texture, very low opacity, no hard edges (semi-transparent PNG) |
| `scam_install_glow` | 诈骗安装提示 `SCAM_INSTALLED` | 512² | a soft cozy hand-painted warning glow burst in matte muted red, painterly, no neon (semi-transparent) |

### 复制即用示例（`malware_bug`）
```
{{STYLE}}
a friendly cozy cartoon malware bug: a small rounded dark-teal critter with
stubby legs and a grumpy face, matte painterly volume, readable at small size,
one soft contact shadow; transparent background, centered.
Negative: {{NEG}}
```

## 验收要点
- `finish_match`（关键）：3 张重绘必须彻底脱离 3D 渲染观感；出现塑料/写实反光即否决。
- `saturation_match`：红/金降到哑红 `#C7493B` / 哑金 `#E6A92B`，不得回霓虹。
- `in_context`：叠到手机屏 mock 上做全局门禁，确认"像同一个游戏画的弹窗"。
- 留白：`ad_offer` / `popup_ad_window` 的文字区留空给引擎填字，提示词里 **不要画文字**。
