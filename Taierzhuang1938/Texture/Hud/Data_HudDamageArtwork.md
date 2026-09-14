# 受击方向与低血量素材

2026-09-13：受击弧按玩家提供的实机截图原型重新生成；两件静态 UI 素材均由第一级内置
`image_gen__imagegen` 生成，未使用付费回退。
PNG 原始 alpha 保留，无后期绘制、抠图或复用 COD 商业贴图；总大小约 1 MB。

| 文件 | 原始像素 | 游戏用途 |
| --- | --- | --- |
| `Texture_HudDamageArc.png` | 1254 × 1254 | 准心外围细长尖弧；实际命中为血红色，仅从身边掠过的近失弹为白色 |
| `Texture_HudCriticalBlood.png` | 1672 × 941 | 全屏边缘血污，随受伤和血量显示；低于原有阈值时子层搏动 |

参考采用 COD《现代战争 2》的实机重伤血屏，已打开并查看以下 Steam 社区截图：

- [重伤并提示 Get to Cover](https://images.steamusercontent.com/ugc/30719431579373910/4E9F482D9A7ABDE139E52599A499CE933071756A/)：周边血滴、暗红遮罩向内侵入，战场仍能辨认。
- [高强度血屏](https://images.steamusercontent.com/ugc/1746826414983730001/CC911BAE097AE17BEFA3532A1C7032D2A041AEB1/)：血滴的虚实层次及边缘密度参考。

来弹弧的生命周期、中心外围位置结合 [线性关卡 HUD](../../docs/Data_HudLinearLevel.md) 中 COD4 / World at War 战役资料。本次受击弧以玩家截图作为样式参考，保留细长弧线、中心朝外尖刺与轻微破损边缘；参考截图仅用于生成和本地验收，没有随游戏发布。

方向、命中/近失合并、生命周期、伤害和血量阈值沿用原逻辑。SVG 承载纹理并旋转，不进 Three 渲染；实际撞上玩家碰撞体的攻击直接显示血红素材，仅从身边掠过的近失弹用 CSS 转为白色。无敌只阻止伤势，不把命中降级为近失。低血量搏动只改变子层 opacity，尊重 reduced-motion。`Script_IncomingFireBrowserTest.mjs` 覆盖图片解码、alpha、红白状态、无敌命中、四方向、转身、消退、重生、血量分级、恢复和窄屏截图。

## 最终生成提示词

### 受击弧

```text
Use case: stylized-concept.
Asset type: production-ready alpha-transparent FPS incoming-damage direction HUD texture.
Primary request: create one original red direction indicator using Image 1 only as the shape and visual-style reference; do not reproduce its blurred gameplay background.
Input images: Image 1 is a style/composition reference, not an edit target.
Subject: one very slender shallow blood-red arc at 12 o'clock, with a single sharp triangular spike rising outward exactly from the arc's center toward 12 o'clock; thin irregular serrated edge, subtle distressed ink/blood grain, and needle-tapered left and right tips.
Style/medium: restrained realistic AAA military FPS HUD artwork, crisp at small on-screen size, materially lighter and thinner than a crescent or ring.
Composition/framing: one square transparent image registered for rotation about its exact center; the arc occupies only the upper portion and is bilaterally balanced; keep the entire center and lower two thirds fully transparent.
Color palette: deep vermilion red core with restrained darker wine-red edge; no white version baked into the asset because code derives the no-damage state.
Constraints: actual alpha transparency; asset only; preserve the reference's thin arc, central outward spike, rough edge and long tapered silhouette; no separate shapes.
Avoid: thick crescent, broad moon shape, full ring, multiple arrows, chevrons, blood drops, splatter cloud, glow, bevel, metal, text, logo, crosshair, UI mockup, scene, black/white/checkerboard background, watermark.
```

### 低血量血污

```text
Use case: stylized-concept. Asset type: finished alpha-transparent fullscreen low-health damage vignette texture for a serious realistic WWII first-person shooter. Original artwork inspired by Call of Duty World at War campaign critical-health blood-on-screen effects. Generate ONE wide 16:9 image at 1536x864 or higher equivalent. The ONLY artwork is around the extreme screen perimeter: uneven wine-red and dark carmine translucent blood smears, small organic blood droplets, tiny dried flecks and blurred crimson capillary haze hugging all four edges, strongest in the corners with restrained asymmetry. Corners may reach 90% alpha; side edges only 50-70% alpha, quickly feathering into complete transparency by 15% inward. Keep the large central 72% width x 68% height rectangle completely empty and alpha=0, with absolutely no specks or tint in the center. At top/bottom middle, very thin broken blood haze at the outermost 5-9% only. Natural sparse blood microtexture at varied scales, soft peripheral-focus blur around some smears with a few sharper small droplets. Premium cinematic military injury-feedback surface, subdued deep burgundy, no flat red flood, no perfect ellipse boundary, no large splat obscuring vision. This is a transparent overlay asset for compositing over live gameplay, NOT a screenshot or a frame mockup. No scene, no weapons, no people, no text or watermark, no decorative borders, no UI, no opaque white/black or checkerboard background. Actual alpha transparency must be preserved. Final project destination after copying: C:/Users/Bentl/Documents/Program/bentleyblanks_Codex_DamageWarningUi_20260911/Taierzhuang1938/Texture/Hud/Texture_HudCriticalBlood.png.
```
