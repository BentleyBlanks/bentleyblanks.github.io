# 血战台儿庄 · 外部枪模来源与许可

游戏运行时只加载 `Model/*.tzm.json`。下面这些源文件给 `_blender/ImportWeapons.py` 重建用，不进页面。

TZM 只保留几何：外部 PBR 贴图全部丢掉，钢/木走游戏内 `steel` / `wood` 盒式投影，和人物、沙包同一套烘焙材质。

| 游戏内武器 | 源文件 | 作者 | 许可 | 史实对应 |
|---|---|---|---|---|
| 中正式 `ZhongZheng` | `Source/Model_Kar98k.obj` | [byzmod3d](https://opengameart.org/content/low-poly-weapon-pack) | CC0 | 中正式是毛瑟标准型短管，剪影与 Kar98k 同族。全长按史实 1.110 m 缩放。 |
| 汉阳造 `HanYang` | 同一把 Kar98k + 程序化套筒 | 同上 | CC0 | 汉阳造八八式母型是 Gewehr 88。Sketchfab 上有 CC-BY 的 Low-Poly Gewehr 88，但下载要登录。这里用 Kar98k 拉到 1.250 m，再套上 φ32 薄套筒，保住「老套筒」剪影。 |
| 驳壳枪 `Mauser96` | `Source/Model_MauserC96.glb` | [Plewr](https://plewr.itch.io/mauser-c96-low-poly) | CC0 | 毛瑟 C96。丢掉名为 Boom 的枪口焰网格。 |

未换模、仍走 `_blender/BuildWeapons.py` 程序化几何的：

- 三八式 `Type38`：Sketchfab 有 CC-BY 的 Type 38 Arisaka（Snijboer），下载要登录。防尘滑盖是独门标志，不能拿毛瑟顶替。
- 捷克式 `Zb26`：Sketchfab 有 CC-BY 的 ZB26（Larkien），同样要登录。上插直弹匣不能拿布伦弯匣顶替。
- 手榴弹、大刀、八九式掷弹筒：继续用已按史料尺寸建好的程序化模型。

CC0 不强制署名；表里的作者与链接是为了以后还能找回源文件。
