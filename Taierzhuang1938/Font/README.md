# 标题字体

`Font_Title.woff2` —— 主菜单大标题、暂停标题与加载画面标题用的显示字体。
只裁了标题实际会写出来的 26 个字，4.7 KB；正文与 UI 仍走 `--ui-font`（系统字体），不打包。

| 项 | 值 |
| --- | --- |
| 字体 | 思源宋体 Black / Noto Serif SC Black（Source Han Serif SC Heavy） |
| 来源 | <https://github.com/notofonts/noto-cjk> · `Serif/SubsetOTF/SC/NotoSerifSC-Black.otf` |
| 版权 | © 2017 Adobe（Google / Adobe 联合发布） |
| 授权 | **SIL Open Font License 1.1**，见 `LICENSE_OFL.txt` |
| 可否商用 | 可。OFL 允许随软件一起分发、可商用、可子集化改名；唯一硬约束是不得单独售卖字体本身，且保留本许可证文件 |

## 改标题以后必须重跑

字体里只有 `Script_TitleFontSubset.py` 的 `CHARS` 那几个字。标题里出现新字而没有重跑子集，
浏览器会**逐字**回退到系统字体 —— 表现成「标题里有两三个字长得不一样」，很容易看漏。

字表的唯一真相是 `Data_TengxianScript.MENU.title` / `.subtitle` 与
`Data_Text_Menu` 的 `menu.title.paused`；改完把 `CHARS` 同步过来再跑：

```bash
curl -L -o NotoSerifSC-Black.otf \
  https://github.com/notofonts/noto-cjk/raw/main/Serif/SubsetOTF/SC/NotoSerifSC-Black.otf
PYTHONUTF8=1 python Script_TitleFontSubset.py NotoSerifSC-Black.otf
```

源字体（11 MB）不入库。依赖 `pip install "fonttools[woff]"`。

跑完还有两件事：

1. **抬缓存戳**。`index.html` 的 `<link rel=preload>` 与 `Style_Interface.css` 的
   `@font-face src` 各写着一个 `?v=`，两条必须**逐字一致** —— 写得不一样就是两个 URL，
   预加载白下一份、字体下两遍。
2. `node Taierzhuang1938/Script_TextTest.mjs` —— 它的「标题字体子集」一节拿
   `Font_Title.json` 的字表和标题原文对账，少一个字就红。这道闸只管**覆盖**；
   「字体有没有真的接上」由 `Script_MenuTest.mjs` 在真浏览器里量。

## 换一款字体

`Style_Interface.css` 顶上的 `--ui-title-font` 是唯一开关；换字体＝换 `@font-face`
里的文件 + 重跑一次子集。当时一起比过的候选（全部 SIL OFL 1.1，均可商用）：

- 思源黑体 Black / Noto Sans SC Black —— 最中性，和界面同源，但没有性格
- 得意黑 / Smiley Sans —— 窄、斜、硬，现代战争片海报感，年代气偏当代
- 未来荧黑 特窄 / Glow Sans SC Compressed —— 战报大字标题，不倾斜
- 霞鹜文楷 / LXGW WenKai —— 楷书骨、书卷气，笔画太细撑不起大标题
- 马善政毛笔楷书 / Ma Shan Zheng —— 真毛笔题字，字面参差，只适合四个字的短标题
