# 指挥室七张地图与三张文书

2026-10-05，按用户明确指定的「共七张地图、开战／中途／最后遗书」生成。全部使用内置 Imagegen；地图为游戏战局示意，文书为有史料依据的美术重排，不是历史原件扫描。

## 进度与地图

`Data_CommandRoomPapers.mjs` 读取 `Progress.Read().cleared` 的连续通关前缀。进入主菜单时通过 `CommandRoom.Load(progress)` 更新：不读调试选关、不以 `furthest` 推断通关、不补写存档。第二关至终章仍是占位，素材提前备齐不代表这些章节已开放。

| 状态 | 地图名（省略 CommandRoomMap） | 图面信息 | 文书 |
| --- | --- | --- | --- |
| 初始 | Initial | 北部阵地、北沙河、铁路与滕县城；北／东北进攻压力，守线尚完整 | Opening |
| 第一关后 | Withdrawal | 北部守军向桥撤收、毁桥、沿南岸向城北门入城；城东承压 | Opening |
| 第二关后 | EastDefense | 东关手榴弹防御、局部突破、退守第二道街垒；城未全失 | Middle |
| 第三关后 | AidReturn | 东侧前沿 C 救护点，经东门向西撤回城内 A 主救护所 | Middle |
| 第四关后 | NightBattle | 东关局部夜间反击，伤员向 A 点转移，守线继续收缩 | Middle |
| 第五关后 | LastStand | 东／东南防线被突破，向西门撤收，再向南去临城 | Final |
| 终章后 | Epilogue | 视野拉到滕县—临城—台儿庄；日军南进受阻，中国部队向台儿庄集结 | Final |

前六张共用北上南下的滕县底图；第七张遵循终章文字，切成区域态势。红色箭头表示敌军进攻、红斜线表示突破区域，蓝色表示守线／撤收，蓝色虚线表示路线。没有加入胜利勋章、三星或日军被全歼的结论。第一关图中的桥是战局符号，细部不作为当前浮桥模型或历史测绘证据。

文本来源（2026-10-05 读取）：

- [第一关｜往南的路](https://www.notion.so/3e060335331c81e1981bdfebbbc5d0ad)
- [第二关｜手榴弹雨](https://www.notion.so/3c960335331c814ca216cf0db4d63e63)
- [第三关｜救护所](https://www.notion.so/3c960335331c81d79bc4ed1ccec7a380)
- [第四关｜东关之夜](https://www.notion.so/3c960335331c818bbc5fc5b2acef3d89)
- [第五关｜城墙没有了](https://www.notion.so/3c960335331c810f92a0df9ed01f3516)
- [终章｜最后一封](https://www.notion.so/3c960335331c814db73cd8da92550269)
- [场景设计](https://www.notion.so/3c360335331c8199a023f05e18da727c)：只参考铁路、车站、电灯厂与城的相对关系；旧玩法段落以现行章节文字为准。

## 文书史料

三张均保持既有桌面纸张轮廓和 UV，采用繁体竖排、蓝黑手写与旧式绿色表格。正文摘录保留原句，发受人字段、栏目、纸面污损和书写样式为游戏排版；不声称发现原件。

| 文件名（省略 CommandRoomLetter） | 文种及日期 | 图面正文 |
| --- | --- | --- |
| Opening | 训令摘记，1938-03-14，孙震对前线官兵 | 人人要抱有敌无我，有我无敌的决心，与敌死拼。 |
| Middle | 电话纪要，1938-03-16，孙震对王铭章 | 你应确保滕县以待援军。你的指挥部应立即移到城内，以便亲自指挥守城事宜。 |
| Final | 绝命电报抄件，1938-03-17，王铭章致孙震 | 职忆委座成仁之训，开封面谕嘉慰之词，决以死拼，以报国家，以报知遇。 |

开战与中途两段依据张宣武回忆原文 [《台儿庄会战的前奏》](https://www.notion.so/3ed60335331c812d805fe1627cc091bd)；最后一段依据 [《悲壮的滕县之役》全文转写](https://www.notion.so/3ed60335331c816b81a0d53c1e8ce02c) 与终章设定。第三张采用能核实的最后电报，不编造私人家书或临终遗书；三封最后电报均属 3 月 17 日，不拿它们冒充 14 日、16 日的命令。外部交叉检索见 [抗日战争纪念网：王铭章](https://www.krzzjn.com/show-1465-125023.html)。

## 资产与复现

- 交付目录：`Texture/Menu/CommandRoom/`，十张 `Texture_CommandRoom*Image.webp`。
- 地图 1536×1024；文书 1122×1402。原始 Imagegen PNG 留本机 `_shots/CommandRoomPapers/Source/`，不提交验收或原始大图。
- 完整提示词：`_import/Prompts/Texture_CommandRoomPapers.txt`；来源 ID、尺寸和哈希：`Data_TextureManifest.mjs` 与 `_import/TextureBakes/Texture_CommandRoom*.json`。
- 编码：`python Taierzhuang1938/_import/Script_EncodeCommandRoomPapers.py --source Taierzhuang1938/_shots/CommandRoomPapers/Source`，只进行 RGB/WebP 格式压缩（quality 90 / method 6），没有程序绘字或重画 Imagegen 画面。
- 新图总量约 4 MB，lazy 和全目录预算各增加 4 MB；首次只请求当前一图一信，小于 1 MB，不预载其余八张。原始模型、材质名、纸边和辐照度保持兼容。

## 验收入口

`Script_CommandRoomBrowserTest.mjs` 实际装载七种状态，检查材质图片 URL、只加载当前两张、七状态共十张、缓存复用与并发更新；截图留 `_shots/CommandRoom/Scene_CommandRoomProgress0..6.png`。这些是明确的进度夹具，不代表第二关至终章可游玩。真实菜单链路由 `Script_MenuTest.mjs` 检查，标准门禁包含 ModuleGraph、TextureStandards 与项目 quick/prepush。

2026-10-06 实测：七状态浏览器检查通过；`Script_MenuTest.mjs --papers-only` 在 high 画质真实入口验证终章存档冷启动只请求两张、返回主菜单切到第一关后／初始图、无页面错误。ModuleGraph、TextureStandards、AssetStandards、Text、TextGatherCheck、BootPayload、TestRunner、TextureImport、MotionVectorContract 与 BrowserBundle 检查通过。合入同期帽服桌柜更新后重跑七状态与存档检查，并重新核对材质和缓存戳。

扩大回归未全绿：quick 在未改动的对白读音表检查报缺「呃、啊」；完整 MenuTest 的主菜单／返回菜单部分完成，后续旧 `?menu=0&phase=0`「进城」点击超时；BootTest 旧 phase 1/2 报日军远景材质计数为零并最终超时。本轮不改这些关卡／对白系统，也不把局部通过写成全游戏回归通过。原始日志保留 `_shots/CommandRoomPapers/Log_*.txt`。
