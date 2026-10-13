# 史实注记资料馆

2026-10-13 用户选定图文陈列总览，并确认五类条目的详情样式。实现沿用实时指挥室背景、暖白宋体、旧金选中条与半透明内容层；Imagegen 效果图只作本地设计参考，不进入发布资产。

## 内容与交互

- 人物：王铭章生平、人生时间线、关联文献及公祭照片。
- 历史资料：滕县保卫战起因、经过、结果与五个逐日节点。铁路关系为游戏态势示意，不作精确测绘。
- 历史文献：张宣武《台儿庄会战的前奏》，印刷页61—77，全部17页扫描；单页按需载入。
- 报刊读物：1938年4月8日《新华日报》社论影像与原文短摘、阅读提示，明确标作台儿庄胜利后的相关背景。
- 历史照片：1938年5月武汉迎灵／公祭王铭章的举像队伍；不将其标为滕县战场或出川送行。

分类筛选、方向键选条目、Enter 打开。详情的 Esc 先关闭出处弹窗或展开图，再返回原分类列表，最后返回进入资料馆之前的主菜单／暂停页。R 打开出处；文献 PageUp／PageDown 翻页；阅览器支持滚轮缩放、放大后拖动、适合页面与展开原图。出处链接另页打开，设置 noopener/noreferrer。原有推定值登记表保留在“复原说明”。

## 数据与接入

`Data_HistoryCodex.mjs` 为五类资料的纯数据，正文经 `Localize(historyCodex.<id>.<field>, text)`；`HistoryCodexContent()` 与翻译收集器共用稳定 id。操作文案在 `Data_Text_Menu.mjs`。新增内容数据同时进入 `Font/Script_FontChars.mjs`，修改后重烘字体。

`Script_HistoryCodex.mjs` 只负责 DOM 阅览，由 `Script_Menu.mjs` 承接进出与按键；主菜单与暂停共用一套组件。`Style_HistoryCodex.css` 仅作用于资料馆，移动端改为纵向阅读。历史图片在打开资料馆后才请求，文献只加载当前页，首次启动不预载档案图片。

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
