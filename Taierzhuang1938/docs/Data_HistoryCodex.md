# 史实注记资料馆

2026-10-13 用户选定图文陈列总览，并确认五类条目的详情样式。实现沿用实时指挥室背景、暖白宋体、旧金选中条与半透明内容层；Imagegen 效果图只作本地设计参考，不进入发布资产。

## 内容与交互

- 人物：王铭章生平、人生时间线、关联文献及公祭照片。
- 历史资料：滕县保卫战始末与四川征兵概览。铁路关系为游戏态势示意；四川征兵配图来自地方志第550页，标为事后整理图。
- 历史文献：张宣武《台儿庄会战的前奏》全部17页，以及1943年背景的乐山缓征公文、1945年5月18日中江壮丁待遇代电局部。原件、报道转引和时代范围随条目注明。
- 报刊读物：1938年4月8日《新华日报》社论影像与原文短摘、阅读提示，明确标作台儿庄胜利后的相关背景。
- 历史照片：1938年5月武汉迎灵／公祭王铭章的举像队伍；不将其标为滕县战场或出川送行。

分类筛选、方向键选条目、Enter 打开。详情的 Esc 先关闭出处弹窗或展开图，再返回原分类列表，最后返回进入资料馆之前的主菜单／暂停页。R 打开出处；文献可拖动书角、点击书角或用左右方向键／PageUp／PageDown 翻页；不足阈值回弹。横屏左右对页，首张现代书签页注明“文献影印阅读”，不伪装成历史封面；竖屏逐张阅读。双击纸页或按F打开原图，滚轮缩放、放大后拖动，Esc先关闭原图。报刊与照片沿用单图阅览器。出处链接另页打开，设置 noopener/noreferrer。原有推定值登记表保留在“复原说明”。

## 数据与接入

`Data_HistoryCodex.mjs` 为五类资料的纯数据，正文经 `Localize(historyCodex.<id>.<field>, text)`；`HistoryCodexContent()` 与翻译收集器共用稳定 id。操作文案在 `Data_Text_Menu.mjs`。新增内容数据同时进入 `Font/Script_FontChars.mjs`，修改后重烘字体。

`Script_HistoryCodex.mjs` 负责资料列表、说明与出处；`Script_HistoryBook.mjs` 承接文献书页，由 `Script_Menu.mjs` 承接进出与按键；主菜单与暂停共用一套组件。`Style_HistoryCodex.css` 仅作用于资料馆，移动端改为纵向阅读。历史图片在打开资料馆后才请求，文献只加载当前对页及相邻翻页所需的纸面，远处页面不设图片URL；首次启动不预载档案图片。

## 资料与原始文件

选材依据用户的 [Notion 文案资料](https://app.notion.com/p/3c360335331c80988907c6e9b5ee9aca)，主要使用[守军干部资料](https://app.notion.com/p/3ed60335331c81bc84b5cafa945a4751)与[武汉公祭考证](https://app.notion.com/p/3ed60335331c81cfaabef9340f05b2be)。原刊、回忆、转载影像的性质随条目保存，不因进入资料馆而升级为统一定论。

| 离线源文件名 | 原始来源 | 游戏处理 |
| --- | --- | --- |
| Source_Beizhuang1938.pdf | [1938年《悲壮的滕县之役》95页扫描](https://upload.wikimedia.org/wikipedia/commons/c/c6/NLC416-07jh008596-3580_%E6%82%B2%E5%A3%AF%E7%9A%84%E6%BB%95%E7%B8%A3%E4%B9%8B%E5%BD%B9.pdf) | 文件第10页裁取遗像矩形；没有生成式修补或重绘 |
| Source_ZhangMemoir.pdf | [张宣武回忆扫描](https://ks3-cn-beijing.ksyun.com/attachment/b1a9f551fb36af74de7926b2ba283874) | 逐页提取原始800×1200扫描，保留印刷页码 |
| Source_XinhuaDaily19380408.jpg | [新华网资料页](https://www.xinhuanet.com/mil/2015-06/28/c_127959205_6.htm)的[版面图片](https://www.xinhuanet.com/mil/2015-06/28/127959205_14354633363791n.jpg) | 原尺寸550×465，不伪造模糊文字 |
| Source_WuhanMemorial.jpeg | [抗日战争纪念网图集](https://www.krzzjn.com/show-1209-76894.html)的[举像照片](https://www.krzzjn.com/uploadfile/2018/0624/20180624104348697.jpeg) | 原尺寸319×450，保留转载版本，不假称原底片 |

这些是注明出处的历史材料展示，未将转载图像和回忆录扫描声明为 CC0 或本作原创。王铭章肖像的拍摄日期不详；武汉照片的具体摄日、街段及摄影者待考。相同图集的多次转载不视为独立互证来源。文献内容为事后回忆，战况、人数等须与同期档案互核。

## 重建与验收

离线源PDF与设计图留在本地；游戏使用的20张 WebP 登记在 `Data_TextureManifest.mjs` 的 `lazy` 层，来源及 SHA-256 记录为 `_import/Data_HistoryCodexImages.json`。图像保持原扫描像素尺寸，仅肖像执行记录在脚本中的矩形裁剪；17张文字扫描无损转换，JPEG来源的照片与报刊用95质量编码，避免无损封装放大原JPEG体积。不生成历史人物面貌与原刊正文。

```powershell
python Taierzhuang1938/_import/Script_HistoryCodexBake.py --source-dir <SourceDirectory>
node scripts/Script_LocalPreview.mjs 8098 --no-open
node Taierzhuang1938/Script_HistoryCodexBrowserTest.mjs --url=http://127.0.0.1:8098
```

浏览器检查覆盖五类筛选与详情、关联跳转、出处弹窗、Esc 层级、17页翻阅、缩放拖动与复位、复原说明、移动端布局及首次启动不加载史料图。截图和结果记录仅留 `_shots/HistoryCodex/`。共同回归包括 MenuStartup、ModuleGraph、Text、TextGather、TextureStandards 与 TestRunner。

## 软纸翻阅与新增史料（2026-10-15）

用户要求按早期 iBooks 的拟真翻书交互修改历史文献。实际纸面由本地 MIT 库 StPageFlip 2.0.7 的软页几何、裁切与动态阴影处理，扫描内容保持原像。库与许可证位于 `vendor/page-flip/`，没有运行时CDN；三个小型本地扩展及上游校验值记在该目录README：按需帧请求／退出停止、帧下标防负值、竖屏触屏从当前折页继续完成。居中的书本使用实际书角坐标驱动回翻，避免上游固定坐标点落在纸外。交互参数在 `HISTORY_BOOK_TUNING`。

资料提要与目录位于右侧，切换提要／史料说明保持阅读位置。图片加载失败在对应纸面说明，仍可打开出处。减少动态效果设置下，按键翻页直接切换；读书时静止的渲染器没有RAF，关闭时销毁观察器、输入监听和待执行帧。

选入的四川资料来自用户本次要求继续整理的 [Notion专题](https://app.notion.com/p/3f960335331c81e58824e011707ddc85)。新增概览引述 [1940年3月19日国史馆目录](https://catalog.digitalarchives.tw/item/00/69/51/b9.html)和 [1944年院字第2676号解释转录](https://zh.wikisource.org/wiki/司法院院字第2676號解釋)，分别标明目录与转录性质；未取得的原报、地域未明卷目和来源不明照片没有变成游戏事实。1943、1945年文书属于后续社会背景，不冒充滕县守军的1938年经历。

新增三个图像的来源、输入与输出SHA-256、转换方式在 `_import/Data_HistoryConscriptionImages.json`。乐山和中江的JPEG来源保留原尺寸，以WebP质量95转换；地方志程序图完整渲染原PDF第12页（书内第550页），不用生成式处理。三张合计约158.4 KiB，懒加载层与总量仅增加 `HISTORY_SOURCE_ADDITIONS_BYTES` 的专用额度；单图、开机与关卡预算保持原契约。

```powershell
python Taierzhuang1938/_import/Script_HistoryConscriptionBake.py --source-dir <ResearchSources>
node Taierzhuang1938/Script_HistoryCodexBrowserTest.mjs
```

新增检查覆盖真实鼠标拖拽的折页／回弹／回翻、17张原页无遗漏、目录定位与提要切换、双击放大及拖动、退出清理、竖屏触屏滑动、减少动态效果和三条新增资料。视觉证据只留本地 `_shots/HistoryCodex/`，不随发布入库。

回归备注：基线主程序中既有的Profiler计数器／事件标签是开发者诊断，按文本口径的现有 `@text-ok` 机制逐行注明用途，未改其运行行为；玩家文案仍全部通过文本表和字库检查。
