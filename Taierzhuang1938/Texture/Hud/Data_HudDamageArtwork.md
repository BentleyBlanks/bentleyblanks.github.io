# 低血量素材

2026-09-15：受击方向弧不再使用贴图，改为程序几何（`Script_Hud.HitDirArcPath`，见 [玩家挨打这条链](../../docs/Data_PlayerDamage.md)），原 `Texture_HudDamageArc.png` 与其提示词已删除。

下面的静态 UI 素材由第一级内置 `image_gen__imagegen` 生成，未使用付费回退。
PNG 原始 alpha 保留，无后期绘制、抠图或复用 COD 商业贴图；总大小约 1 MB。

| 文件 | 原始像素 | 游戏用途 |
| --- | --- | --- |
| `Texture_HudCriticalBlood.png` | 1672 × 941 | 全屏边缘血污，随受伤和血量显示；低于原有阈值时子层搏动 |

参考采用 COD《现代战争 2》的实机重伤血屏，已打开并查看以下 Steam 社区截图：

- [重伤并提示 Get to Cover](https://images.steamusercontent.com/ugc/30719431579373910/4E9F482D9A7ABDE139E52599A499CE933071756A/)：周边血滴、暗红遮罩向内侵入，战场仍能辨认。
- [高强度血屏](https://images.steamusercontent.com/ugc/1746826414983730001/CC911BAE097AE17BEFA3532A1C7032D2A041AEB1/)：血滴的虚实层次及边缘密度参考。

## 最终生成提示词

### 低血量血污

```text
Use case: stylized-concept. Asset type: finished alpha-transparent fullscreen low-health damage vignette texture for a serious realistic WWII first-person shooter. Original artwork inspired by Call of Duty World at War campaign critical-health blood-on-screen effects. Generate ONE wide 16:9 image at 1536x864 or higher equivalent. The ONLY artwork is around the extreme screen perimeter: uneven wine-red and dark carmine translucent blood smears, small organic blood droplets, tiny dried flecks and blurred crimson capillary haze hugging all four edges, strongest in the corners with restrained asymmetry. Corners may reach 90% alpha; side edges only 50-70% alpha, quickly feathering into complete transparency by 15% inward. Keep the large central 72% width x 68% height rectangle completely empty and alpha=0, with absolutely no specks or tint in the center. At top/bottom middle, very thin broken blood haze at the outermost 5-9% only. Natural sparse blood microtexture at varied scales, soft peripheral-focus blur around some smears with a few sharper small droplets. Premium cinematic military injury-feedback surface, subdued deep burgundy, no flat red flood, no perfect ellipse boundary, no large splat obscuring vision. This is a transparent overlay asset for compositing over live gameplay, NOT a screenshot or a frame mockup. No scene, no weapons, no people, no text or watermark, no decorative borders, no UI, no opaque white/black or checkerboard background. Actual alpha transparency must be preserved. Final project destination after copying: C:/Users/Bentl/Documents/Program/bentleyblanks_Codex_DamageWarningUi_20260911/Taierzhuang1938/Texture/Hud/Texture_HudCriticalBlood.png.
```

## 镜头泥点（01–02 分镜还原，2026-09-25）

`Texture_LensMudSpatter.webp`（1280 × 720，RGBA，约 73 KB）：SB03/SB03A 镜头上的泥点叠层（`Script_Hud.SetLens`，曲线在 `Data_OpeningLens`）。
用户本轮点名 Lovart（契约 §2.14，优先于上面的 imagegen 顺序），一次成图（thread e066bc41-8584-4452-ba96-00fd35fde6be，原图 2048 × 1152 黑底灰度 PNG，不进仓库）。
后处理：只取原图 RGB 亮度做遮罩（**不用生成器的 alpha**），亮度 10 以下归零、10–210 拉满到 0–255 作 alpha；颜色统一成深湿泥棕（厚处略深），缩到 1280 × 720、webp q86。
中央区域 alpha 实测为 0（Script_OpeningLensTest 只查格式、比例与体积）。

### 镜头泥点（Lovart 提示词）

```text
Generate ONE landscape 16:9 image (2048x1152). Use case: a game camera-lens overlay mask, used as a grayscale luminance mask (no alpha). Pure black background (#000000). On it, splashes and specks of wet mud and a few blood droplets that have hit a camera lens, rendered in white/light gray only (brightness = opacity): several irregular soft-edged mud smears and splatters concentrated along the left edge and the upper-right corner, smaller droplets and fine specks scattered toward the bottom-left and right edges, a couple of thin drip streaks. The central 55% of the frame must stay completely black and empty. Slightly out of focus, as if on the lens, varied gray levels inside each blob. No text, no color, no frame, no vignette, no background texture.
```
