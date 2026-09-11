# 受击方向与低血量素材

2026-09-11：两件静态 UI 素材，均由第一级内置 `image_gen__imagegen` 生成，未使用付费回退。
PNG 原始 alpha 保留，无后期绘制、抠图或复用 COD 商业贴图；总大小约 1 MB。

| 文件 | 原始像素 | 游戏用途 |
| --- | --- | --- |
| `Texture_HudDamageArc.png` | 1254 × 1254 | 准心外围血色受击弧；多方位共用，近失弹降低透明度、着沙金色并加断开的细弧 |
| `Texture_HudCriticalBlood.png` | 1672 × 941 | 全屏边缘血污，随受伤和血量显示；低于原有阈值时子层搏动 |

参考采用 COD《现代战争 2》的实机重伤血屏，已打开并查看以下 Steam 社区截图：

- [重伤并提示 Get to Cover](https://images.steamusercontent.com/ugc/30719431579373910/4E9F482D9A7ABDE139E52599A499CE933071756A/)：周边血滴、暗红遮罩向内侵入，战场仍能辨认。
- [高强度血屏](https://images.steamusercontent.com/ugc/1746826414983730001/CC911BAE097AE17BEFA3532A1C7032D2A041AEB1/)：血滴的虚实层次及边缘密度参考。

来弹弧的生命周期、中心外围位置结合 [线性关卡 HUD](../../docs/Data_HudLinearLevel.md) 中 COD4 / World at War 战役资料。本次素材保留血色与破碎边缘，把血滴集中到周边以留出中央瞄准区；近失弹沙金提示是本作扩展。参考图片仅留本地验收目录，没有随游戏发布。

方向、命中/近失合并、生命周期、伤害和血量阈值沿用原逻辑。SVG 承载纹理并旋转，不进 Three 渲染。低血量搏动只改变子层 opacity，尊重 reduced-motion。`Script_IncomingFireBrowserTest.mjs` 覆盖图片解码、alpha、四方向、转身、消退、重生、血量分级、恢复和窄屏截图。

## 最终生成提示词

### 受击弧

```text
Use case: stylized-concept. Asset type: production-ready transparent PNG FPS incoming damage direction HUD texture, original artwork inspired by the screen-space red damage crescents of Call of Duty World at War / Modern Warfare campaigns. Generate ONE square 1024x1024 transparent image. Composition is precisely registered for rotation around the image center (512,512): a single shallow blood-red crescent at 12 o'clock on an imaginary circle centered at (512,512), outer radius approximately 365 px, inner radius approximately 325 px. Arc extends about 50 degrees left and 50 degrees right of straight up, so its top is near y=147 and tapered ends around x=230/794,y=295. The entire region below y=370 and the center MUST be completely transparent; there is NO full ring. Broadest at the top middle then razor tapered ends; natural distressed inner edge, subtle smoky translucent crimson fringe and just a few tiny nearby blood specks. Sharp readable deep vermilion core, darker wine-red edging; restrained realistic blood/ink texture, military cinematic urgency, sophisticated understated AAA HUD rather than cartoon icon. Avoid neon glow, orange fire, glossy metal, bevel, arrows, chevrons, text, logos, crosshairs, scene, UI mockup, grids, checkerboard pixels or any opaque background. Actual alpha transparency, including soft translucent fringe. Output is the texture asset only. Final project destination after copying: C:/Users/Bentl/Documents/Program/bentleyblanks_Codex_DamageWarningUi_20260911/Taierzhuang1938/Texture/Hud/Texture_HudDamageArc.png.
```

### 低血量血污

```text
Use case: stylized-concept. Asset type: finished alpha-transparent fullscreen low-health damage vignette texture for a serious realistic WWII first-person shooter. Original artwork inspired by Call of Duty World at War campaign critical-health blood-on-screen effects. Generate ONE wide 16:9 image at 1536x864 or higher equivalent. The ONLY artwork is around the extreme screen perimeter: uneven wine-red and dark carmine translucent blood smears, small organic blood droplets, tiny dried flecks and blurred crimson capillary haze hugging all four edges, strongest in the corners with restrained asymmetry. Corners may reach 90% alpha; side edges only 50-70% alpha, quickly feathering into complete transparency by 15% inward. Keep the large central 72% width x 68% height rectangle completely empty and alpha=0, with absolutely no specks or tint in the center. At top/bottom middle, very thin broken blood haze at the outermost 5-9% only. Natural sparse blood microtexture at varied scales, soft peripheral-focus blur around some smears with a few sharper small droplets. Premium cinematic military injury-feedback surface, subdued deep burgundy, no flat red flood, no perfect ellipse boundary, no large splat obscuring vision. This is a transparent overlay asset for compositing over live gameplay, NOT a screenshot or a frame mockup. No scene, no weapons, no people, no text or watermark, no decorative borders, no UI, no opaque white/black or checkerboard background. Actual alpha transparency must be preserved. Final project destination after copying: C:/Users/Bentl/Documents/Program/bentleyblanks_Codex_DamageWarningUi_20260911/Taierzhuang1938/Texture/Hud/Texture_HudCriticalBlood.png.
```
