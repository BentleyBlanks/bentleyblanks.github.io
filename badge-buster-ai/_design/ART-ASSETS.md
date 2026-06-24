# 角标清道夫 AI — 美术素材生产清单 (Art Asset Spec)

> 给生图 Agent 的完整规格。游戏当前用纯矢量 (PixiJS Graphics) 画成，本文件列出把它替换成「正式美术素材」所需的**全部图片**，含画风、尺寸、格式、变体、用途与可直接使用的提示词。

---

## 0. 必读：集成约束（决定素材怎么切）

| 项 | 规则 |
|---|---|
| 逻辑画布 | **1280 × 800**（16:10）。世界容器整体缩放铺满视口，带留黑边。 |
| 渲染倍率 | 引擎以 **2–3×** 渲染。**所有素材按 2× 导出**（即逻辑尺寸 ×2）；英雄图（背景）可给 3×。 |
| 格式 | **PNG-24 + Alpha**（透明通道）。唯一例外：全幅背景可不透明。sRGB 色彩空间。 |
| ⚠️ 文字规则 | **凡是带动态数字/名称/价格的素材，一律不要把文字烤进图里**——文字由代码实时绘制。下文每项标注「✅含文字 / ❌不含文字（代码叠字）」。 |
| 锚点 | 游戏对象多为**中心锚点**（围绕 0,0 绘制）；面板类为**左上锚点**。下文逐项标注。 |
| 灯光一致性 | **主光源固定在右上方**，柔和环境光，阴影向左下方投。所有素材统一，否则拼不到一起。 |
| 视角 | 俯视桌面 (top-down)，桌面物件带**轻微 3/4 立体**（手机、柜子、托盘有厚度）；纸卡接近平铺。 |
| 留白 | 带发光/投影的素材四周留透明 padding，避免被裁切。 |
| 9-slice | 面板/横条/按钮/托盘等可拉伸件请画成**九宫格可拉伸**结构（中部平整、四角固定），并在交付说明里给出 slice 内边距。 |

### 命名规范
`bb_<分类>_<名称>[_<变体>]@2x.png`，全小写。例：`bb_icon_app_mail@2x.png`、`bb_card_paper_base@2x.png`、`bb_host_face_happy@2x.png`。

---

## 1. 画风圣经 (Art Direction Bible)

**一句话**：温暖的拟物桌面小玩具。一张胡桃木办公桌，铺着墨绿皮革桌垫，信息以奶油色纸条出现，玩家在黄铜分拣架上分类，把好消息「转交」给一个有表情的宿主小人。

- **风格关键词**：warm skeuomorphic、半写实插画 (semi-realistic illustrated)、painterly-clean、cozy、premium board-game / 实物玩具感。参考气质：*《旅行青蛙》的桌面温度 + 《纪念碑谷》的干净 + 实物文具的质感*。
- **材质库**：胡桃木（木纹、哑光）、黄铜（暖金、轻微高光与做旧）、奶油牛皮纸（纤维、微卷边、软投影）、墨绿皮革桌垫（缝线、轻反光）、磨砂玻璃手机。
- **明确禁止**：❌ 扁平 Material Design；❌ 暗蓝霓虹/科技后台；❌ 照片写实；❌ 高饱和卡通描边；❌ 渐变塑料感 UI。
- **笔触**：干净的插画上色 + 柔和软阴影 + 细腻材质纹理，不要硬描边、不要噪点滤镜。

### 调色板（与代码 `theme.ts` 完全一致，务必锁色）
| 用途 | 名称 | HEX |
|---|---|---|
| 木桌-基 | wood0 | `#6F4E34` |
| 木桌-暗 | wood1 | `#573C26` |
| 木纹高光 | woodGrain | `#7D5A3C` |
| 木桌-边缘暗角 | woodEdge | `#412C1B` |
| 皮革桌垫 | mat | `#2F5249` |
| 桌垫边 | matEdge | `#24403A` |
| 桌垫高光 | matHi | `#3A6258` |
| 金线缝 | stitch | `#C9A05F` |
| 纸-面 | paper0 | `#F4E8CB` |
| 纸-暗/卷边 | paper1 | `#E9D8B2` |
| 纸-纹线 | paperLine | `#DCC89C` |
| 墨水/正文 | ink | `#33271A` |
| 墨水-浅 | inkSoft | `#7A6648` |
| 黄铜 | brass | `#C69A4C` |
| 黄铜-暗 | brassDark | `#8A6A2F` |
| 黄铜-亮 | brassHi | `#E6C684` |
| 琥珀(算力) | amber | `#E8932F` |
| 琥珀-亮 | amberHi | `#F6C66A` |
| 成功/好 | good | `#4F9D6A` |
| 警告 | warn | `#DCA33A` |
| 危险/坏 | bad | `#D14B42` |
| 暗角底 | bg0 | `#2A1D12` |

**卡片分类色（信息卡分类标签 / 托盘）**
| 分类 | HEX |
|---|---|
| 无效 invalid | `#9A8F7A` |
| 普通 normal | `#3D7EA6` |
| 高价值 high | `#CF8A2B` |
| 高危 risk | `#C0473E` |
| 污染 polluted | `#8A5CC0` |

### 通用「主风格提示词」（建议每张图都前置这段）
```
warm skeuomorphic game art, semi-realistic illustration, cozy desk-toy aesthetic,
soft painterly shading, gentle ambient occlusion, key light from top-right,
walnut wood / antique brass / cream kraft-paper / dark green leather materials,
clean premium board-game look, NOT flat design, NOT neon, NOT photoreal,
no text, transparent background, sRGB
```

---

## 2. 素材清单总表（速览）

| # | 素材 | 文件名 | 逻辑尺寸 | @2x 导出 | 含文字 | 锚点 | 数量 |
|---|---|---|---|---|---|---|---|
| A1 | 桌面背景(英雄图) | bb_bg_desk | 1280×800 | 2560×1600 | ❌ | 左上/铺满 | 1 |
| A2 | 桌面装饰贴(可选) | bb_prop_* | 见下 | — | ❌ | 中心 | 4 |
| B1 | 手机机身(空屏) | bb_phone_body | 280×466 | 560×932 | ❌ | 中心 | 1 |
| B2 | App 图标 | bb_icon_app_* | 56×56 | 112×112 | ❌ | 中心 | 8 |
| B3 | 红点角标(可选) | bb_badge_red | 44×44 | 88×88 | ❌ | 中心 | 1 |
| C1 | 信息卡-纸底 | bb_card_paper_base | 178×114 | 356×228 | ❌ | 中心 | 1 |
| C2 | 分类标签条 | bb_card_tab_* | 178×26 | 356×52 | ❌ | 中心 | 5 |
| C3 | 故障卡覆盖层 | bb_card_glitch | 178×114 | 356×228 | ❌ | 中心 | 1 |
| C4 | 偷看「?」印章 | bb_card_qmark | 28×28 | 56×56 | ✅ | 中心 | 1 |
| D1 | 信息分拣台柜体 | bb_station_body | 210×430 | 420×860 | ❌ | 中心 | 1 |
| D2 | 转交口发光环 | bb_station_chute | 80×80 | 160×160 | ❌ | 中心 | 1 |
| D3 | 分拣托盘-底 | bb_tray_base | 150×70 | 300×140 | ❌ | 中心 | 1 |
| D4 | 托盘高亮(吸附) | bb_tray_glow | 174×94 | 348×188 | ❌ | 中心 | 1 |
| E1 | 宿主表情头像 | bb_host_face_* | 76×76 | 152×152 | ❌ | 中心 | 4(+1) |
| E2 | 宿主工位卡面板 | bb_host_panel | 304×126 | 608×252 | ❌ | 左上 | 1 |
| F1 | 顶部资源横条 | bb_hud_plank | 1256×60 | 2512×120 | ❌ | 左上(9-slice) | 1 |
| F2 | 宿主职级胶囊 | bb_hud_pill | 180×30 | 360×60 | ❌ | 中心(9-slice) | 1 |
| G1 | 木质面板(通用) | bb_panel_wood | 240×142 | 480×284 | ❌ | 左上(9-slice) | 1 |
| G2 | 纸贴纸按钮 | bb_chip_sticker | 158×92 | 316×184 | ❌ | 左上(9-slice) | 2 |
| G3 | 帮手商店图标 | bb_icon_helper_* | 50×50 | 100×100 | ❌ | 中心 | 3 |
| G4 | 工作台升级图标 | bb_icon_upgrade_* | 50×50 | 100×100 | ❌ | 中心 | 4 |
| H1 | 算力金币 | bb_fx_coin | 24×24 | 48×48 | ❌ | 中心 | 1 |
| H2 | 纸条包裹 | bb_fx_parcel | 24×24 | 48×48 | ❌ | 中心 | 1 |
| H3 | 柔光/火花 | bb_fx_spark | 32×32 | 64×64 | ❌ | 中心 | 1 |
| I1 | 标题字标 | bb_logo_wordmark | 520×120 | 1040×240 | ✅ | 中心 | 1 |
| I2 | 站点图标/favicon | bb_favicon | 512×512 | — | ✅/可含字 | — | 1 |

> 合计约 **40 张**（含变体）。若想压到最少：A2 可烤进 A1、C2 用单张+代码上色、D3 单张+代码上色、E1 至少 3 张——则约 30 张起。

---

## 3. 逐项规格 + 生图提示词

### A · 背景与桌面

**A1 桌面背景（英雄图）** — `bb_bg_desk@2x.png` · 2560×1600 · 不透明
- 内容：胡桃木办公桌**俯视**，正中偏左铺一张**墨绿皮革桌垫**（约占画面 x:12%–68%, y:19%–78%，圆角矩形，金色缝线），用作纸卡散落区与手机底座。木纹横向延展，右上暖光、左下暗角 vignette。
- 注意：桌垫区域要相对**干净**（卡片会落在上面，别放太多花纹）。手机、柜子、宿主、面板都是**单独素材**叠加，背景里**不要画**这些。
- 提示词：`top-down view of a walnut office desk, a dark green leather desk blotter with gold stitching in the center-left, subtle wood grain, warm light from top-right, soft vignette bottom-left, empty and clean, cozy realistic illustration, [主风格提示词]`

**A2 桌面装饰贴（可选，建议直接烤进 A1）** — 中心锚点
- `bb_prop_mug` 咖啡杯+杯渍 120×120；`bb_prop_pen` 黄铜钢笔 160×40；`bb_prop_clip` 回形针 60×60；`bb_prop_note` 便利贴碎片 70×70。
- 提示词：`a single <object> on a desk, top-down, brass/cream tones, soft shadow, transparent background, [主风格提示词]`

---

### B · 手机与 App 图标

**B1 手机机身（空屏）** — `bb_phone_body@2x.png` · 560×932 · Alpha · 中心锚点
- 内容：竖向磨砂钛金属/炭灰手机，**轻微 3/4 厚度**，灵动岛缺口，**屏幕为深色空壁纸**（不放任何 App，图标由代码叠加）。屏幕顶部可留「消息中心」标题位（留空，代码叠字）。机身投影在右下。
- 提示词：`a modern smartphone lying on a desk, top-down slight 3/4, charcoal titanium frame, dark empty wallpaper screen, dynamic-island notch, soft drop shadow, no app icons, no text, [主风格提示词]`

**B2 App 图标 ×8** — `bb_icon_app_<id>@2x.png` · 112×112 · Alpha · 中心锚点
- 圆角方块 (iOS 风) 玻璃质感，与整体暖色调协调（可比 UI 稍鲜艳但别荧光）。**图标内不写字**。
- 列表（id → 含义 → 主色参考 → 图样建议）：
  1. `chat` 聊天 绿 `#3AA66A` — 对话气泡
  2. `mail` 邮箱 蓝 `#3D7EA6` — 信封
  3. `shop` 购物 橙 `#E09A3A` — 购物袋/购物车
  4. `cal` 日历 红 `#D1574F` — 日历页
  5. `sys` 系统 灰 `#6B7382` — 齿轮
  6. `news` 新闻 棕 `#B06A3A` — 报纸
  7. `bank` 银行 靛 `#4F6DBF` — 银行楼/盾牌
  8. `food` 外卖 橙 `#E0823A` — 汉堡/餐盒
- 提示词：`a glossy rounded-square mobile app icon of <图样>, <主色> gradient, soft glass highlight, cohesive warm palette, no text, centered, transparent, [主风格提示词]`

**B3 红点角标（可选）** — `bb_badge_red@2x.png` · 88×88 · Alpha · 中心锚点
- 鲜红圆形果冻气泡，顶部细月牙高光，深红描边，**不含数字**（数字代码叠加）。
- 提示词：`a small glossy red notification dot, jelly-like, slim crescent highlight on top, dark red rim, no number, transparent, [主风格提示词]`

---

### C · 信息卡（纸条）

**C1 信息卡纸底** — `bb_card_paper_base@2x.png` · 356×228 · Alpha · 中心锚点 · ❌不含文字
- 奶油牛皮纸便签，**右下角微卷边 (dog-ear)**，纸纤维质感，柔和落影。顶部留约 26px 高的**分类标签条位置**（纯纸面，颜色条由 C2 叠加或代码绘制）。正文区留空。
- 提示词：`a cream kraft-paper sticky note, blank, subtle paper fiber texture, dog-eared bottom-right corner, soft drop shadow, top-down flat, no text, transparent, [主风格提示词]`

**C2 分类标签条 ×5** — `bb_card_tab_<tier>@2x.png` · 356×52 · Alpha · 中心锚点 · ❌
- 贴在卡片顶部的色条/和纸胶带，5 个分类色（见调色板）：`invalid/normal/high/polluted/risk`。
- （省素材方案：只画 1 条中性胶带，代码 tint 上色。）
- 提示词：`a strip of washi tape / colored label band across the top of a paper note, <分类色>, slight texture, no text, transparent, [主风格提示词]`

**C3 故障卡覆盖层** — `bb_card_glitch@2x.png` · 356×228 · Alpha · 中心锚点 · ❌
- 半透明覆盖：纸被污染/撕裂/红墨晕染、轻微 RGB 错位的「被篡改」感，叠在卡上表示幻觉故障。整体偏红警示。
- 提示词：`a semi-transparent damage overlay for a paper note: red ink stains, torn edge, subtle glitch distortion, ominous, transparent, [主风格提示词]`

**C4 偷看「?」印章** — `bb_card_qmark@2x.png` · 56×56 · Alpha · 中心锚点 · ✅可含「?」
- 红色圆形印章 + 白「?」，盖在卡角，表示「可疑/未确认」。
- 提示词：`a round red rubber stamp with a white question mark, slightly worn ink, transparent, [主风格提示词]`

---

### D · 信息分拣台（原"炼化炉"）

**D1 分拣台柜体** — `bb_station_body@2x.png` · 420×860 · Alpha · 中心锚点 · ❌
- 立式胡桃木柜，黄铜包边，顶部一块**空白黄铜铭牌**（"信息分拣台"由代码叠字，铭牌留空），底部一个**圆形出件口 (转交口)** 凹槽（发光环是 D2 单独叠加）。带厚度与右下投影。
- 提示词：`a tall vertical walnut wood sorting cabinet with antique brass trim, a blank brass nameplate near the top, a round brass output port near the bottom, slight 3/4 depth, soft shadow, no text, transparent, [主风格提示词]`

**D2 转交口发光环** — `bb_station_chute@2x.png` · 160×160 · Alpha · 中心锚点 · ❌
- 黄铜圆环 + 中心**琥珀色暖光**（用于喷出金币/纸条时的发光动画，做成可叠加发光球）。
- 提示词：`a glowing brass ring portal with warm amber light core, radial glow, transparent, [主风格提示词]`

**D3 分拣托盘底 ×1（或 ×4）** — `bb_tray_base@2x.png` · 300×140 · Alpha · 中心锚点 · ❌不含文字
- 黄铜边收件托盘 + 奶油纸内衬，后侧有一道暗色投入口。底部留一块**空白标签牌位**（"有效/无效/高危/隔离"+ 提示由代码叠字与上色）。
- （4 变体方案：分别给 valid/invalid/risk/quarantine 的标签牌染分类色——否则用单张+代码 tint。）
- 提示词：`a brass-rimmed paper inbox tray, a dark slot at the back, a blank label plate at the bottom, top-down slight 3/4, soft shadow, no text, transparent, [主风格提示词]`

**D4 托盘高亮（拖拽吸附时）** — `bb_tray_glow@2x.png` · 348×188 · Alpha · 中心锚点 · ❌
- 托盘外圈柔和高亮光晕（拖卡靠近时叠加），中性白/暖色，代码会 tint 成分类色。
- 提示词：`a soft rounded-rectangle glow halo, neutral warm white, transparent, [主风格提示词]`

---

### E · 宿主（新增反馈系统）

**E1 宿主表情头像 ×4（建议 5）** — `bb_host_face_<mood>@2x.png` · 152×152 · Alpha · 中心锚点 · ❌
- 一个年轻**普通职员**的半身/头像（同一角色、同一构图、只换表情），暖色插画。表情 5 档（最少做 4 档）：
  - `happy` 很开心（满意度≥75）
  - `content` 还算满意（50–74，可与 happy 合并）
  - `meh` 有点烦躁（30–49）
  - `sad` 快被坑哭了（<30，皱眉/沮丧）
  - （可选 `angry` 收到假消息瞬间的发火，用于 react 动画）
- 风格统一：同一发型/衣着/光照，便于切换不违和。
- 提示词：`bust portrait of a young office worker character, warm illustrated style, <表情描述>, consistent character and lighting across the set, centered, transparent, [主风格提示词]`

**E2 宿主工位卡面板** — `bb_host_panel@2x.png` · 608×252 · Alpha · 左上锚点 · ❌不含文字
- 一张钉在桌上的**牛皮纸工位卡**，黄铜边 + 一枚图钉，左侧留圆形头像位（放 E1），右侧留满意度条与文字位（代码绘制）。面板留空、可 9-slice。
- 提示词：`a cream paper info card pinned to a desk with a brass pin, brass border, blank interior, soft shadow, no text, transparent, [主风格提示词]`

---

### F · 顶部 HUD

**F1 顶部资源横条** — `bb_hud_plank@2x.png` · 2512×120 · Alpha · 左上 · **9-slice** · ❌
- 横贯顶部的**黄铜+木质长牌**，做旧暖金，可水平拉伸（中段平整）。所有数值/标题由代码叠字。请标注左右 slice 内边距（建议各 ~40px@2x）。
- 提示词：`a long horizontal brushed-brass and wood nameplate bar, beveled edges, slightly worn, seamless tileable center, no text, transparent, [主风格提示词]`

**F2 宿主职级胶囊** — `bb_hud_pill@2x.png` · 360×60 · Alpha · 中心 · 9-slice · ❌
- 黄铜胶囊按钮（放"宿主 · 普通员工"），可横向拉伸。
- 提示词：`a brass pill-shaped button plate, polished, no text, transparent, [主风格提示词]`

---

### G · 商店 / 升级面板与按钮

**G1 木质面板（商店+升级通用）** — `bb_panel_wood@2x.png` · 480×284 · Alpha · 左上 · **9-slice** · ❌
- 胡桃木面板 + 黄铜边 + 顶部一条标题色带（标题代码叠字）。需可拉伸到不同宽度（商店 ~532、升级 ~700 逻辑px）。给出 9 宫格 slice 内边距。
- 提示词：`a walnut wood panel with brass border and a brass header strip, seamless stretchable, no text, transparent, [主风格提示词]`

**G2 纸贴纸按钮 ×2** — `bb_chip_sticker_<state>@2x.png` · 316×184 · Alpha · 左上 · 9-slice · ❌
- 可购买项的**纸贴纸**：`normal`（亮奶油纸，可点）与 `locked`（发灰/已满级）。左侧留图标位，文字代码叠加。
- 提示词：`a small cream paper sticker card, peeling-corner feel, soft shadow, blank, no text, transparent; variant: faded grey version, [主风格提示词]`

**G3 帮手商店图标 ×3** — `bb_icon_helper_<id>@2x.png` · 100×100 · Alpha · 中心 · ❌
- `sweeper` 点红点小帮手（萌虫/小机械虫）；`crusher` 垃圾清理工（漩涡/碎纸机小机器）；`sorter` 分拣助理（小机器人）。统一为黄铜+暖色的小器械/小生物图标。
- 提示词：`a cute small brass-and-warm-tone <角色> helper icon, desk-toy style, centered, transparent, [主风格提示词]`

**G4 工作台升级图标 ×4** — `bb_icon_upgrade_<id>@2x.png` · 100×100 · Alpha · 中心 · ❌
- `factcheck` 核查冷静（放大镜/校对勾）；`throughput` 处理更快（闪电/齿轮加速）；`suppress` 信息加固（盾牌/封蜡章）；`yield` 批量整理（回形针串/装订）。做成黄铜徽章风。
- 提示词：`a brass badge icon representing <概念>, engraved look, centered, transparent, [主风格提示词]`

---

### H · 粒子 / 特效

**H1 算力金币** — `bb_fx_coin@2x.png` · 48×48 · 琥珀色小币/晶片，飞向顶部算力计数。`a small amber coin / chip, glossy, transparent`
**H2 纸条包裹** — `bb_fx_parcel@2x.png` · 48×48 · 折好的奶油纸小包裹，从转交口飞向宿主。`a tiny folded cream paper parcel, transparent`
**H3 柔光/火花** — `bb_fx_spark@2x.png` · 64×64 · 软径向暖光点（红点爆裂、发光复用）。`a soft round radial glow particle, warm, transparent`

> 玻璃故障碎片 (glitch shard) 当前由代码绘制，可不出素材。

---

### I · 品牌

**I1 标题字标** — `bb_logo_wordmark@2x.png` · 1040×240 · Alpha · ✅含字
- 「角标清道夫 AI」中文字标 + 小字 "BADGE BUSTER AI"，黄铜雕刻质感，用于启动加载页/品牌。
- 提示词：`a brass engraved game logo wordmark, Chinese title "角标清道夫 AI" with small subtitle "BADGE BUSTER AI", warm metallic, transparent, [主风格提示词]`

**I2 站点图标 / favicon** — `bb_favicon.png` · 512×512（再切 180/32）
- 用一枚红角标 + 纸条/分拣意象做 app 图标，方形圆角。

---

## 4. 交付与回填

1. 全部按 **@2x** 命名交付（见 §0 命名）。9-slice 件附 slice 内边距说明。
2. 回填到代码时：把对应 `objects/*.ts`、`ui/*.ts` 里的 `Graphics` 绘制替换为 `Sprite`(纹理)，保持原**锚点与尺寸**（逻辑尺寸即上表"逻辑尺寸"，纹理用 @2x，Pixi 里设 `texture` 后按逻辑尺寸缩放或用 `width/height`）。文字层 (`Text`) 保留不动，叠在素材之上。
3. 资源放 `_dev/src/assets/`，用 Vite `import` 或 Pixi `Assets.load` 预加载；构建后随 `dist/assets/` 一起拷到部署目录（同现有发布流程）。

## 5. 优先级（若分批生）
1. **P0 决定第一眼观感**：A1 背景、B1 手机、B2 八个 App 图标、C1 纸卡、D1 分拣台、E1 宿主表情。
2. **P1 高频可见**：D3 托盘、E2/H 系列、G1 面板、G2 贴纸、F1 横条。
3. **P2 点缀/品牌**：C2/C3/C4、G3/G4 图标、F2 胶囊、I1/I2、A2 装饰。
