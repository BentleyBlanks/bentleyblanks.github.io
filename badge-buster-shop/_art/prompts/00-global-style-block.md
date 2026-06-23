# 00 · 全局风格块（每条提示词必须前置 / 后置）

> 这是把所有素材"焊"成同一画风的核心。每个 Agent 生成任何美术素材时，**必须**把 `{{STYLE}}` 原样放在提示词最前、把 `{{NEG}}` 放进 negative prompt。素材专属正文夹在两者之间。
>
> 严禁删改 `{{STYLE}}` / `{{NEG}}` 的任何措辞——它们是消除违和感的强约束。可以在专属正文里**追加**细节，但不能**削弱**这里的约束。

---

## `{{STYLE}}`（正向，置于提示词最前）

```
Cozy hand-painted 2.5D game art, soft painterly illustration with gentle visible
brushwork and a subtle canvas-paper grain; matte finish; warm inviting color
palette of mid wood-browns, cream and oatmeal, dusty teal, dusty blue, soft
terracotta and muted mustard; a single soft warm key light from the upper-left
at about 40 degrees, gentle warm ambient fill, soft natural occlusion; lineless
soft painterly edges with no hard outlines; the subject grounded by one soft
blurred contact shadow; clean fully-transparent background, subject centered with
generous padding; calm restrained saturation; consistent with a cozy mobile
shop-sim aesthetic in the spirit of Animal Crossing: Pocket Camp and a refined
Stardew Valley — warm, tactile, hand-made.
```

## `{{NEG}}`（负向，置于 negative prompt）

```
glossy, glassy, high specular highlights, plastic, shiny, chrome, metallic sheen,
iOS squircle gloss, 3D render, CGI, C4D, Blender, Octane, raytraced, neon,
oversaturated, candy colors, HDR, hard black outline, thick cartoon ink stroke,
flat vector, sticker, photorealistic, photograph, harsh shadows, rim light from
the wrong direction, white halo, edge fringe, jpeg artifacts, noise, watermark,
text, letters, signature, UI text, lens flare, excessive sparkles, busy
background, opaque background.
```

---

## 调色板速查（HEX，取自锚点店铺图）

提示词里点名颜色时，**只能**从下表取值（或其邻近的去饱和暖化变体）。

| 角色 | HEX | 用途 |
|---|---|---|
| 木·中 | `#8A5A34` | 柜台、木质底座主色 |
| 木·深 | `#6B4326` | 木质暗部、描影 |
| 木·浅 | `#B07A4A` | 木质高光（柔和，非镜面） |
| 奶油纸 | `#F2E7D4` | 图标符号、卡片、留白 |
| 麦色 | `#E7D7BD` | 次级浅色面 |
| 炭灰柜 | `#33312F` / `#46433F` | 深色柜体、深底 |
| 墙白 | `#ECE6DB` | 背景墙、大面浅底 |
| 暖灰墨 | `#2B2B33` | 文字/线条/最深处 |
| 哑青 | `#3E8E7E` | 主点缀（聊天/治愈系） |
| 尘蓝 | `#5B7FA6` | 次点缀（科技/工具系） |
| 陶土橙 | `#C8643C` | 暖点缀（提示/活力系） |
| 鼠尾草绿 | `#7E9B6B` | 自然/植物点缀 |
| 芥末黄 | `#D9A441` | 收益/星级点缀 |
| 哑金 | `#E6A92B` / `#F2C75B` | 现金/奖励（哑光金，非高反光） |
| 哑红 | `#C7493B` | 警告/诈骗（克制，非霓虹红） |

> **去饱和原则**：现有代码 `icons.data.ts` 里的 `fallbackColor` 普遍偏鲜（如 `#26C6A6`、`#FF6B81`）。重绘时把每个色相**降饱和 15–25%、暖化一档**，再对到上表最近的"哑"色，使"缺图 fallback 色"与"成品图"观感接近。每个图标的目标色已在 `01-app-icons.md` 给出。

## 统一光照与接地（所有抠图类素材通用）

- **主光**：左上约 40°，色温偏暖（~5000K），强度中等、柔和（无硬边高光）。
- **环境光**：暖色弱补光，暗部不死黑（最暗约 `#2B2B33` 而非纯黑）。
- **接地阴影**：对象正下方一枚**柔和模糊椭圆**，略向右下偏移，透明度 20–28%，模糊半径大。透明 PNG 也要带这枚阴影（让它"坐"进场景，而不是浮在上面）。
- **边缘**：去背干净，**绝不留白边/彩边/光晕**；边缘是柔和 painterly 过渡，不是硬剪裁、也不是描黑边。

## 通用技术规格

- 格式：`PNG`，透明背景（壁纸/背景类除外），sRGB。
- 渲染分辨率：按各文件给定的"render @"出图，再缩放导出目标尺寸（避免直接小图放大糊）。
- 安全边距：主体四周留 ≥10% 透明边。
- 命名：严格等于 manifest 里的 `artId` / 文件名（见各 prompts 文件）。
- 交付：覆盖 `assets/art/<id>.png`，并复制到 `_dev/public/assets/art/<id>.png`。
