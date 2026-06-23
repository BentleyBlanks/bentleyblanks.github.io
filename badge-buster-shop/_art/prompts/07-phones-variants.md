# 07 · 手机外观 / Roguelike 变体 / 壁纸（P2）

> 现状：手机机身（`drawDeviceChrome` / `skinForPhone` / `PhoneSkin`）与变体光环（`drawVariantAura` / `drawVariantTag` / `drawCosmic`）多为程序绘制；壁纸 8 张是抽象渐变（基本可用）。
> 任务：补充统一画风的手机皮与变体外观；壁纸仅做调色板复核。优先级最低，放在 P0/P1 之后。
> 拼装：`{{STYLE}}` + 正文 + `{{NEG}}`，透明 PNG（壁纸不透明）。

---

## A. 手机机身皮（device chrome）

| ID | 用途 | 尺寸 | 主体正文 |
|---|---|---|---|
| `phone_body_default` | 默认机身边框（可叠在屏幕外） | 540×1170 | a cozy hand-painted smartphone body / bezel frame, rounded matte casing in warm neutral (mid wood-brown or cream-grey), soft camera notch, no glossy reflection, soft contact shadow; transparent screen cutout in the center; matte painterly |
| `phone_overlay` | 屏幕柔光叠层（**替换现有模糊渐变**） | 540×1170 | a very subtle cozy hand-painted screen sheen overlay: faint soft warm diagonal light from the upper-left, extremely low opacity, no hard edges (semi-transparent PNG) |

> 现有 `phone_overlay.png` / `realistic-phone-overlays.png` 是低质模糊橙蓝渐变、语义不明 → 用上面的低透明柔光替换。

## B. Roguelike 变体外观（对应 `RISK_EVENT` / 变体渲染）

> 变体的"特效感"靠**手绘柔光**实现，不得用霓虹/泛光。光环统一为柔和painterly。

| ID | 变体 | 尺寸 | 主体正文 |
|---|---|---|---|
| `variant_golden` | 黄金机（`golden_break`） | 540×1170 | a cozy hand-painted golden special phone skin: warm matte gold casing (#E6A92B) with soft hand-painted shimmer accents (NOT metallic glare), a gentle warm glow aura; matte painterly |
| `variant_cosmic` | 宇宙机（`drawCosmic`） | 540×1170 | a cozy hand-painted "cosmic" phone skin: deep dusty indigo casing with a few soft hand-painted star specks and a gentle aurora-like glow, all matte and restrained, NOT neon |
| `variant_transformer` | 变形机（`transformer`） | 540×1170 | a cozy hand-painted "transformer" phone skin: chunky friendly mechanical panels in warm wood + charcoal with soft bolt accents, matte painterly, gentle warm glow |
| `variant_aura` | 通用变体光环（`drawVariantAura`） | 720² | a soft cozy hand-painted glow aura ring, warm painterly light, low opacity, no neon, no bloom (semi-transparent PNG) |
| `variant_tag` | 变体角标（`drawVariantTag`） | 192×96 | a cozy hand-painted small ribbon tag / label for a special phone, cream face + wood edge, blank center for text, soft shadow |

## C. 壁纸（8 张 · 仅调色板复核）

> 现有 `wallpaper_1~8.png` 为抽象柔和渐变，作为手机壁纸**基本可保留**。仅需复核：
> - 整体饱和度不超过场景（避免比店铺还鲜）。
> - 暖冷分布与调色板不打架（偏暖/低饱和优先）。
> - 如要重做，用：`{{STYLE}}` + `a cozy soft abstract phone wallpaper, gentle warm gradient with soft organic shapes, low saturation, calm` + `{{NEG}}`，尺寸 540×1170 不透明。

## 验收要点
- 变体"特效"必须是手绘柔光，出现霓虹/泛光/3D 金属即否决。
- 手机皮与机身需与店铺木台面调和（暖中性优先）。
- 壁纸不与前景图标/弹窗抢饱和度（壁纸是底，要退后）。
