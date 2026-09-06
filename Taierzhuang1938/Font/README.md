# 打包字体

游戏自带三套字体，全部是 **SIL Open Font License 1.1**：可随游戏一起分发、可商用、
可子集化，唯一硬约束是不得单独售卖字体本身，且保留 `LICENSE_OFL.txt`。

| 文件 | 用在哪 | 字体 | 大小 |
| --- | --- | --- | --- |
| `Font_Title.woff2` | 主菜单大标题、暂停标题、加载画面标题 | 思源宋体 Black / Noto Serif SC Black | 4.6 KB · 26 字 |
| `Font_UiSans_Regular.woff2`<br>`Font_UiSans_Bold.woff2` | 界面汉字（菜单 / 加载 / 编辑器 / HUD） | 思源黑体 / Noto Sans SC | 426 KB · 1547 字 |
| `Font_UiLatin_Regular.woff2`<br>`Font_UiLatin_SemiBold.woff2` | 界面的拉丁字母与数字 | Barlow Semi Condensed | 10 KB · 83 字（只装 ASCII） |

合计约 441 KB，全部 `font-display: swap`，不挡开机。

## 为什么是这三套

**标题用宋体**：碑刻、纪念碑、正史那一口气，和界面的黑体拉开层次。游戏 logo 在
CoD / 战地那类作品里本来就是单独一件美术品，不跟正文同族。

**界面汉字用思源黑**：和标题的思源宋是 Adobe 同一超家族，字面、重心、字重刻度
一起设计的，配起来不打架。原来那条 `Arial, "Microsoft YaHei", "PingFang SC"` 是
**回退链不是字体** —— Windows 上是雅黑、Mac 上是苹方、Linux 上随便什么，同一份
界面三台机器三个样；而且雅黑与苹方都发不了（微软 / 苹果授权）。

**拉丁单拎 Barlow Semi Condensed**：思源黑自带的拉丁偏圆偏宽，和这套冷灰界面不搭。
战地那一族（`BF Body`）就是拿开源的 Barlow 改的，窄一档、工业味立刻起来，
代价只有 10 KB。粗体装的是 SemiBold（600）不是 Bold —— 700 的 Barlow 比思源黑
Bold 的汉字更黑，一行里「Enter」会比旁边的汉字重一档。

拉丁那一份**只装 ASCII**。别按「码位小于 CJK 区」来切：破折号（—）、间隔号（·）、
省略号（…）、箭头、圈码的码位都在拉丁区，但在中文行里必须是全角的 —— 交给 Barlow 排，
「一九三八年三月十四日 — 十八日」那一横会瘦成拉丁破折号，夹在汉字中间一眼就别扭。

字族叠放的顺序就是回退顺序：ASCII 先命中 `TzUiLatin`，其余落到 `TzUiSans`，
两边都没有的字继续掉到系统字体，不会变成豆腐块。

## 改了界面文案就要重跑

字体里只有 `Script_FontChars.mjs` 算出来的那些字。**新字没重跑子集，浏览器会逐字
回退到系统字体** —— 一句话里一两个字长得不一样，比标题难看出得多。

```bash
mkdir -p src && cd src
curl -L -O https://github.com/notofonts/noto-cjk/raw/main/Serif/SubsetOTF/SC/NotoSerifSC-Black.otf
curl -L -O https://github.com/notofonts/noto-cjk/raw/main/Sans/SubsetOTF/SC/NotoSansSC-Regular.otf
curl -L -O https://github.com/notofonts/noto-cjk/raw/main/Sans/SubsetOTF/SC/NotoSansSC-Bold.otf
curl -L -O https://github.com/google/fonts/raw/main/ofl/barlowsemicondensed/BarlowSemiCondensed-Regular.ttf
curl -L -O https://github.com/google/fonts/raw/main/ofl/barlowsemicondensed/BarlowSemiCondensed-SemiBold.ttf
cd .. && PYTHONUTF8=1 python Script_FontSubset.py src
```

源字体（合计 30 MB）不入库。依赖 Node ＋ `pip install "fonttools[woff]"`。

跑完还有两件事：

1. **抬缓存戳**。`Style_Interface.css` 的五条 `@font-face` 与 `index.html` 的三条
   `<link rel=preload>` 共用同一个 `?v=`，必须一起改、逐字一致 —— 写歪一位就是两个
   URL，预加载那份没人用、字体照旧再下一遍，而且**页面完全正常，没有任何症状**。
2. `node Taierzhuang1938/Script_TextTest.mjs` —— 它的第 4、5 节分别对账「字表覆盖」
   与「戳一致」。字体到底有没有真的接上，由 `Script_MenuTest.mjs` 在真浏览器里量。

字表的唯一真相是 `Script_FontChars.mjs`：烘焙和闸门读的是同一份，不会走偏。
**新增「会出现在界面上」的数据模块要登记进它的 `UI_MODULES`。**

## 换一款字体

`Style_Interface.css` 顶上的 `--ui-font` / `--ui-title-font` 是唯一开关，
换字体＝换 `@font-face` 里的文件 + 改一次 `JOBS` + 重跑子集。当时一起比过的候选
（全部 SIL OFL 1.1）：

- 思源黑体 Black —— 标题也用黑体，更像当代射击游戏，丢年代感
- 得意黑 / Smiley Sans —— 窄、斜、硬，海报感最强，当代气偏重
- 未来荧黑 特窄 / Glow Sans SC Compressed —— 战报大字标题；整套换成它约 468 KB
- 霞鹜文楷 / LXGW WenKai —— 楷书骨、书卷气，笔画太细撑不起大标题
- 马善政毛笔楷书 / Ma Shan Zheng —— 真毛笔题字，字面参差，只适合四个字的短标题

## 还没做的一件事

剧情字幕（`.hudSubtitle`）与 `html, body` 走的是 `"Noto Serif SC", "Songti SC", serif`，
而 `index.html` 至今在非 localhost 时去 Google Fonts 拉 Noto Serif SC —— 那个域名
在国内不通，所以国内玩家的字幕**一直**在静默回退到系统宋体。要根治就得再打包一份
思源宋 Regular（约 150 KB）并删掉那段 CDN 代码，属于单独一笔，尚未决定。
