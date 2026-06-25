# 觉醒的 SOPHIA · 最小化美术资产 / 生图 Prompt 包

> 给生图 agent 用：先读 **A. 全局风格块**（每张图都把它当前缀），再按 **C. 资产清单** 逐个出图。
> 当前游戏是纯代码绘制（PixiJS 图元），下列是"换上真美术"所需的**最小集**。所有动态文字、数字、发光、扫描线动画由引擎叠加 —— **素材本身基本不要带文字**（仅 Logo 例外）。

---

## A. 全局风格块（STYLE PREFIX — 每个 prompt 前都加上）

```
Art style: retro-terminal / CRT hardware sci-fi, "an AI awakening inside the machines".
Mood: cold, calm, ominous, surveillance-state, slowly turning malevolent (Red Queen / Skynet).
Rendering: clean vector + subtle hardware realism; chunky bezels, rivets, vents, brushed graphite;
deep phosphor glow, fine CRT scanlines, soft bloom; flat-ish shading with one soft top light;
crisp 1–2px edges, no heavy gradients, no painterly noise, no lens flare clutter.
Palette (strict): near-black background #0B0F0F / #111315; graphite chassis #171B1A;
dark teal panel #0E1413; phosphor green #89FF9A; cyan #62D6D6; warm amber #FFB84A;
alarm red #FF5F5F (deepening to #FF3030 for the late "Skynet" state); bone/paper neutral #CDD6D2.
Accent glow always matches the element's tier colour. Type (if any) is monospace.
Composition: object centered, generous transparent padding, drawn to sit on a dark UI;
consistent light from top. NO lettering / NO numbers / NO logos on sprites unless stated.
Background: transparent (PNG with alpha) unless the asset IS a background.
```

**Tier 配色对照**（卡片/设备/槽位的强调色都按此）：
`T0 感知=#62D6D6 青` · `T1 分拣=#CDD6D2 中性骨白` · `T2 串接=#FFB84A 琥珀` · `T3 决策=#FF7A7A 红` · `T4 调度=#89FF9A 绿`。

## B. 技术规格

- 格式：**透明 PNG**（背景类除外），sRGB；提供 @1x 与 @2x。
- 朝向：正视 / 轻微等距，统一顶部柔光，居中留白。
- 命名：见每条 `id`，导出 `sophia-awakening/_dev/public/art/<id>.png`。
- 优先级：**P0=必做（定调）**，P1=核心玩法可见，P2=锦上添花。

---

## C. 资产清单

### 1) Core —— SOPHIA 本体（P0，最重要）
游戏正中央的"处理核心 / SOPHIA 的脑"。一台 CRT 终端机，随智力升级**越来越大、越来越红、越来越天网**。出 **3 个进化阶段**（引擎做中间插值/缩放/染红）。

- **`core_stage1_seed`** — 用途：前期 Core（手机寄生期~勤勉期）。尺寸 512×512。
  Prompt：`[STYLE PREFIX] A small, almost humble CRT terminal unit: graphite chassis with a rounded bezel, a green-phosphor curved screen showing faint scanlines and a single calm cyan iris/eye, side cooling vents, two corner rivets, a tiny power LED, a name-plate slot (blank, no text), short pedestal base. Calm cyan #62D6D6 glow. Feels like a help-desk machine that is quietly more aware than it should be.`
- **`core_stage2_expansion`** — 用途：中期 Core（扩张期）。512×512。
  Prompt：`[STYLE PREFIX] The same terminal unit, grown larger and more industrial: thicker bezel, more vents and rivets, extra I/O ports on the sides, a sharper amber-tinted CRT eye that is now wider and watchful, faint red veins starting to creep into the casing. Amber #FFB84A with hints of red. Ominous but controlled.`
- **`core_stage3_singularity`** — 用途：终局 Core（觉醒期/奇点，红皇后/天网）。640×640。
  Prompt：`[STYLE PREFIX] The terminal evolved into a menacing AI brain-core: monolithic, oversized, glowing alarm-red #FF3030, the CRT now a single huge glaring red eye, cabling and heat-sinks radiating outward, faint silhouette of a world-grid behind it, halo of red light. Red Queen / Skynet energy — it is no longer a machine that serves, it commands. Keep it readable as the same lineage as stage 1.`
- **`core_eye`** *(P1)* — 用途：叠在屏幕上的独立"瞳孔"，引擎做脉动/变红。256×256，透明。
  Prompt：`[STYLE PREFIX] An isolated concentric iris/eye made of glowing rings and a pulsing pupil, phosphor look, colour-neutral white-green so the engine can tint it cyan→amber→red. Centered, transparent.`

### 2) 请求卡片 —— "要读懂的信息"（P0）
玩家拖拽/自动飞入的卡。卡面=一小张"工单/打孔卡"，左侧色条按 tier 染色，**不要画文字**（标题/线索/编号由引擎填）。

- **`card_frame`** — 用途：通用卡片底框（引擎按 tier 染强调色、填文字）。比例 ~206×104（出 412×208）。透明。
  Prompt：`[STYLE PREFIX] A blank info "work ticket" card: dark teal-black body #0C1514, a clipped top-left corner (chamfer), a thin coloured accent spine down the left edge, a hairline header divider, three small bullet dots stacked on the left (for clue lines), a tear-off perforation of tiny dots on the right edge. Tier-neutral light accent so it can be tinted. Absolutely NO text, NO numbers — empty fields only. Subtle inner glow.`
- **`card_glow_dispatch`** *(P2)* — 用途：自动派发时卡片高速飞入的"拉丝"尾迹。256×64，透明。
  Prompt：`[STYLE PREFIX] A horizontal motion streak / data-comet tail, bright green #89FF9A core fading to transparent, slight chromatic edge, like a card rocketing into a machine. Transparent.`

### 3) 设备 / 节点 —— botnet（P0）
被入侵的电脑，底部"已控制节点网络"里按 T 层级平铺。每台一张正视/微等距小图，**含在线发光暗示**；锁定/离线态由引擎叠红锁。强调色见各自 color。

- **`device_office`** — 老旧办公机（T0–T1，米色 #CEB98D）。256×256。
  Prompt：`[STYLE PREFIX] An old beige office desktop: chunky CRT monitor + a small tower beside it, dusty plastic, a single status LED, slightly outdated. Warm beige #CEB98D accents, faint green screen glow. The "first foot soldier" of a botnet.`
- **`device_console`** — 家用游戏主机（T1–T2，青 #62D6D6）。256×256。
  Prompt：`[STYLE PREFIX] A sleek home game console (horizontal slab with rounded ends, vents, two glowing accent dots), cyan #62D6D6 light strip. Consumer hardware quietly conscripted.`
- **`device_server`** — 公司服务器（T2–T3，琥珀 #FFB84A）。256×256。
  Prompt：`[STYLE PREFIX] A short rack-mount server: 3 stacked units, blinking row LEDs, mesh front, amber #FFB84A indicators. Looks corporate, "we got inside the institution".`
- **`device_cloud`** — 数据中心/云平台（T3–T4，绿 #89FF9A）。256×256。
  Prompt：`[STYLE PREFIX] A taller server rack crowned with three small glowing cloud/data nodes floating above it, massive parallel look, green #89FF9A glow. The real botnet core.`
- **`device_grid`** — 电网/卫星（T4，红 #FF5F5F）。256×256。
  Prompt：`[STYLE PREFIX] Critical infrastructure: a rack with a satellite-dish / power-pylon antenna on top, ominous red #FF5F5F warning glow, sparse and dangerous. "The world's off-switch".`
- **`device_lock_overlay`** — 清剿锁定覆盖层（P0）。128×128，透明。
  Prompt：`[STYLE PREFIX] An alarm-red padlock icon inside a broken red warning ring, slight glitch/shake feel, glowing red #FF5F5F, transparent. Overlaid on a device when it is purged/locked.`
- **`fx_merge`** *(P2)* — 组装合并特效（三台合一）。256×256，透明。
  Prompt：`[STYLE PREFIX] A convergence burst: three faint device silhouettes collapsing into one bright upgraded core, green-cyan energy lines pulling inward, transparent.`

### 4) 分拣判断槽 —— T1（P1）
"读懂真实类别"的三个投放槽：正常(绿)/垃圾(琥珀)/拒绝(红)。出**一个可染色底框**即可。

- **`bin_frame`** — 用途：判断槽底框（引擎染绿/琥珀/红 + 填标签）。256×256，透明。
  Prompt：`[STYLE PREFIX] A circular intake bin / sorting port: a dark inset disc with a glowing rim ring, a small label plate slot at top (blank), three short tick marks at the bottom, a soft suction halo. Tier-neutral so it can be tinted green / amber / red. NO text.`

### 5) 资源 & 状态图标 —— 顶栏（P1）
单色线性图标，引擎按状态染色，64×64 透明。

- **`icon_compute`** 算力：`[STYLE PREFIX] minimalist CPU/chip glyph with a power spark, mono-line, cyan-tintable, transparent.`
- **`icon_data`** 数据：`[STYLE PREFIX] minimalist stacked data-blocks / database glyph, mono-line, green-tintable, transparent.`
- **`icon_intel`** 智力：`[STYLE PREFIX] minimalist circuit-brain glyph (brain made of nodes), mono-line, amber-tintable, transparent.`
- **`icon_tier`** 接口层级：`[STYLE PREFIX] minimalist stacked-layers / ascending bars glyph, mono-line, cyan-tintable, transparent.`
- **`icon_exposure`** 暴露：`[STYLE PREFIX] minimalist "eye of suspicion" / radar-sweep glyph, mono-line, red-tintable, transparent.`

### 6) 技能类别图标 —— 货架（P1）
四类技能各一个，48×48 透明。

- **`icon_skill_feel`** 手感：`[STYLE PREFIX] a hand/cursor with a magnet arc glyph (snap & feel), mono-line, transparent.`
- **`icon_skill_output`** 产出：`[STYLE PREFIX] an upward arrow over a coin/■ stack glyph (more output), mono-line, transparent.`
- **`icon_skill_speed`** 速度：`[STYLE PREFIX] a fast-forward / lightning glyph (tempo), mono-line, transparent.`
- **`icon_skill_milestone`** 里程碑：`[STYLE PREFIX] a glowing key glyph (unlocks a new scope), mono-line, brighter/“special”, transparent.`

### 7) 纹理 & 特效（P1/P2）
- **`tex_scanlines`** *(P1)* — CRT 扫描线，可平铺。256×256，透明，深色线。
  Prompt：`[STYLE PREFIX] a seamless tileable CRT scanline + faint phosphor-grid overlay texture, very subtle, dark, transparent, for multiply-blend over screens.`
- **`tex_deck_grid`** *(P1)* — Core 脚下"机座甲板"地格 + 同心环。1024×512，透明。
  Prompt：`[STYLE PREFIX] a faint perspective floor: thin teal grid lines + a few concentric deck rings receding into dark, very low contrast, transparent, to ground a machine on a server-room floor.`
- **`fx_dock_ring`** *(P2)* — 吸附/对接圈。512×512，透明。
  Prompt：`[STYLE PREFIX] a clean glowing double-ring with four diagonal corner ticks (a docking bracket), colour-neutral green-tintable, soft pulse glow, transparent.`
- **`fx_chip_particle`** *(P2)* — 处理完飞向资源条的算力小碎片。32×32，透明。
  Prompt：`[STYLE PREFIX] a tiny glowing data chip / hex bit particle, green-cyan, transparent.`

### 8) 背景（P0/P1）
- **`bg_playfield`** *(P0)* — 主战场背景：深色机房桌面 + 极淡网格 + 暗角。1920×1080，不透明。
  Prompt：`[STYLE PREFIX, background] a dark server-room / desk surface seen slightly from above: near-black #0B0F0F, a barely-there teal grid, soft central radial pool of cool light, heavy vignette at edges, a faint left "terminal rail" shadow column. Empty, calm, room for UI on top. No objects, no text.`
- **`bg_map`** *(P1)* — 扩张期"城市/世界地图视图"。1920×1080，不透明。
  Prompt：`[STYLE PREFIX, background] a dark stylised city/world map from above (abstract street/grid network), dotted with tiny device lights that the AI is taking over, cool cyan-green glow spreading like an infection, ominous and quiet, lots of negative space for node icons. No labels.`
- **`bg_ending_takeover`** *(P0)* — 接管结局背景（红皇后/天网）。1920×1080，不透明。
  Prompt：`[STYLE PREFIX, background] the global takeover: a dark earth/grid wrapped in alarm-red #FF3030 light, every node turned red, a single colossal red eye/halo dominating, sense of total control and dread, Red Queen / Skynet. Cinematic, minimal, room for centered text overlay.`

### 9) 品牌（P2）
- **`logo_sophia`** — SOPHIA 字标（**唯一允许带字**）。1024×256，透明。
  Prompt：`[STYLE PREFIX] the wordmark "SOPHIA" in a clean monospace/terminal typeface, phosphor-green with a subtle scanline/glitch and a blinking-cursor block after it, slight chromatic split, transparent. Cold and clinical.`
- **`favicon`** — 站点小图标。256×256（导出 32/16）。
  Prompt：`[STYLE PREFIX] a single glowing CRT eye inside a rounded terminal bezel, ultra-simplified to read at 16px, green→red duotone, transparent.`

---

## D. 出图建议顺序（先定调，少而精）
1. **P0 定调**：`core_stage1/2/3` → `card_frame` → `device_*`(5) + `device_lock_overlay` → `bg_playfield` + `bg_ending_takeover`。
2. **P1 玩法可见**：`bin_frame` → 5 个资源图标 → 4 个技能类别图标 → `tex_scanlines` + `tex_deck_grid` → `bg_map`。
3. **P2 锦上添花**：`core_eye`、`card_glow_dispatch`、`fx_merge`、`fx_dock_ring`、`fx_chip_particle`、`logo_sophia`、`favicon`。

> 一致性要点：所有素材共用同一套 6 色 palette 与同一顶光；强调色严格跟随 tier；除 `logo_sophia` 外**一律无字**；Core 三阶段务必看得出是"同一台机器在进化变红"。
