// Data_Text_Boot.mjs — 开机加载画面（Script_Main 的 setStep / 开始按钮 / 预览终端）与
// 加载画面上那张战前报纸剪报（Script_BootPaper）的文案。
// 纯数据，不 import three。键前缀 `boot.`，由 Data_Locale_zhCN.mjs 拼表；口径见 docs/Data_TextAndTuning.md。
// 占位符写 {name}，代码侧 T("boot.xxx", { name })。同一句话只登记一次，多处复用同一键。
export const TEXT = Object.freeze({
  // --- 加载步骤。**每一条对应 Boot() 里一次 setStep**，顺序与 Data_Tuning_Main.BOOT.progress 一致。
  "boot.step.bakeTextures": "烘贴图……",
  "boot.step.bakeTexturesProgress": "烘贴图 {done}/{total} · {name}",
  "boot.step.loadPbr": "加载 PBR 材质……",
  "boot.step.loadPbrProgress": "加载 PBR 材质 {done}/{total}",
  "boot.step.physics": "装物理引擎……",
  "boot.step.physicsWalls": "砌墙（物理）……",
  "boot.step.actors": "上刺刀……",
  "boot.step.actorsProgress": "上刺刀…… 模型 {loaded}/{requested}",
  "boot.step.ready": "就绪",
  // 进过场时那条独立的预热条（WarmupShaders 的四步）
  "boot.step.dressSet": "搭布景……",
  "boot.step.actorPool": "预建人物…… {done}/{total}",
  "boot.step.warmViewmodel": "预热第一人称…… {done}/{total}",
  "boot.step.warmLevel": "预热关卡……",
  "boot.step.submitShaders": "提交着色器…… {done}/{total}",
  "boot.step.linkShaders": "等待着色器就绪…… {done}/{total}",
  "boot.step.relightScene": "重编场景光照…… {done}/{total}",
  "boot.step.warmMaterials": "预热材质…… {done}/{total}",
  "boot.step.loadMeshes": "载入网格…… {done}/{total}",

  // --- 开始按钮。走哪一条由 URL 入口决定（见 Script_Main.BootStartLabel）。
  "boot.start.play": "进 城",
  "boot.start.shot": "（出图模式）",
  "boot.start.movementRange": "进入操作测试场",
  "boot.start.weaponRange": "进入枪械靶场",
  "boot.start.explosionRange": "进入爆炸测试场",
  "boot.start.goreRange": "进入断肢测试场",
  "boot.start.preview": "播放序章",

  // --- 序章预览（?preview=CS_Chuchuan）的收尾终端 ---------------------------
  "boot.preview.title": "序章预览结束",
  "boot.preview.note": "等待《断线》接手 · 预览不会启动界河战斗",
  "boot.preview.handoff": "跟随通信排。",

  "boot.error.startFailed": "启动失败：{message}",

  // --- 加载画面上的战前报纸剪报（Script_BootPaper + Data_BootPapers）----------------------
  // 左下角：「史料摘录 | 《报名》 日期」+「简述：……」；左上角副题用汉字日期。
  // 每期报纸的 name / date / dateCn / summary 按 Data_BootPapers 里的 id 拼键（`boot.paper.<id>.*`）。
  // summary 是 Notion「加载界面｜战前报纸剪报方案与史料库」里「加载页摘要」的原文。
  "boot.paper.kicker": "史料摘录",
  "boot.paper.summaryLine": "简述：{summary}",
  "boot.paper.subtitle": "{date} · 战前报讯",
  "boot.paper.alt": "{name}，{date}",
  "boot.paper.LiBao19370709.name": "《立报》",
  "boot.paper.LiBao19370709.date": "1937年7月9日",
  "boot.paper.LiBao19370709.dateCn": "一九三七年七月九日",
  "boot.paper.LiBao19370709.summary": "卢沟桥一带爆发中日交战，中国守军还击，华北局势骤然紧张。",
  "boot.paper.ShenBao19370731.name": "《申报》",
  "boot.paper.ShenBao19370731.date": "1937年7月31日",
  "boot.paper.ShenBao19370731.dateCn": "一九三七年七月三十一日",
  "boot.paper.ShenBao19370731.summary": "天津失守，平津两地相继陷落，华北战局进一步恶化。",
  "boot.paper.WenHui19380125.name": "《文汇报》",
  "boot.paper.WenHui19380125.date": "1938年1月25日",
  "boot.paper.WenHui19380125.dateCn": "一九三八年一月二十五日",
  "boot.paper.WenHui19380125.summary": "津浦铁路沿线激战持续；据该报消息，中国军队正分两路向济宁进攻。",
  "boot.paper.ZhanShiHuaKan19370820.name": "《战事画刊》第1期",
  "boot.paper.ZhanShiHuaKan19370820.date": "1937年8月20日",
  "boot.paper.ZhanShiHuaKan19370820.dateCn": "一九三七年八月二十日",
  "boot.paper.ZhanShiHuaKan19370820.summary": "淞沪战事爆发，上海街区陷入交火，中国守军与日军展开战斗。",
  "boot.paper.ZhanShiHuaKan19370906.name": "《战事画刊》第4期",
  "boot.paper.ZhanShiHuaKan19370906.date": "1937年9月6日",
  "boot.paper.ZhanShiHuaKan19370906.dateCn": "一九三七年九月六日",
  "boot.paper.ZhanShiHuaKan19370906.summary": "上海南站遭日机轰炸，车站设施受损，聚集在站内的平民遭受伤亡。",
  "boot.paper.ZhanShiHuaKan19370911.name": "《战事画刊》第5期",
  "boot.paper.ZhanShiHuaKan19370911.date": "1937年9月",
  "boot.paper.ZhanShiHuaKan19370911.dateCn": "一九三七年九月",
  "boot.paper.ZhanShiHuaKan19370911.summary": "淞沪战场的交战也延伸到空中，中国空军出动迎击日机。",
  "boot.paper.ZhanShiHuaKan19371001.name": "《战事画刊》第9期",
  "boot.paper.ZhanShiHuaKan19371001.date": "1937年10月1日",
  "boot.paper.ZhanShiHuaKan19371001.dateCn": "一九三七年十月一日",
  "boot.paper.ZhanShiHuaKan19371001.summary": "前线士兵负伤，仍有人包扎伤口后继续作战；画刊记录他们的战时处境。",
  "boot.paper.ZhanShiHuaKan19371106.name": "《战事画刊》第16期",
  "boot.paper.ZhanShiHuaKan19371106.date": "1937年11月6日",
  "boot.paper.ZhanShiHuaKan19371106.dateCn": "一九三七年十一月六日",
  "boot.paper.ZhanShiHuaKan19371106.summary": "上海北站遭战火破坏，画刊刊出车站受损后的现场照片。",
  "boot.paper.ZhanShiHuaKan19371111.name": "《战事画刊》第17期",
  "boot.paper.ZhanShiHuaKan19371111.date": "1937年11月11日",
  "boot.paper.ZhanShiHuaKan19371111.dateCn": "一九三七年十一月十一日",
  "boot.paper.ZhanShiHuaKan19371111.summary": "上海主力部队撤退时，留守四行仓库的守军继续抵抗日军，掩护转移。",
  "boot.paper.JiuGuoShiBao19371220.name": "《救国时报》",
  "boot.paper.JiuGuoShiBao19371220.date": "1937年12月20日",
  "boot.paper.JiuGuoShiBao19371220.dateCn": "一九三七年十二月二十日",
  "boot.paper.JiuGuoShiBao19371220.summary": "南京失守后，日军杀害平民与俘虏；海外记者的见闻开始传到中文报纸上。",
  "boot.paper.ChinaWeeklyReview19371106.name": "《密勒氏评论报》",
  "boot.paper.ChinaWeeklyReview19371106.date": "1937年11月6日",
  "boot.paper.ChinaWeeklyReview19371106.dateCn": "一九三七年十一月六日",
  "boot.paper.ChinaWeeklyReview19371106.summary": "上海妇女向曾坚守四行仓库的第八十八师士兵送去慰劳品。",
  // 建城 / 城外原野的加载步骤（Script_TengxianCity / Script_TengxianOutfield 的 yield label，加载画面上显示）
  "boot.build.city.ground": "夯地：城内台地与濠外原野",
  "boot.build.city.moat": "挖濠：宽 10.5 深 4.8",
  "boot.build.city.wall": "筑城：墙身 11.5 米",
  "boot.build.city.bastions": "马面与角楼",
  "boot.build.city.gates": "开四门：半圆瓮城与城楼",
  "boot.build.city.ramps": "上城道（全城只有四条）",
  "boot.build.city.streets": "铺街：十字街口与四条门里街",
  "boot.build.city.landmarks": "县衙、警报楼、牌坊、天主堂",
  "boot.build.city.eastSuburb": "东关：家家有枪眼的院落迷宫",
  "boot.build.city.eastFields": "东关外：农田、坟地与独户农院",
  "boot.build.city.livedIn": "生活层：门前家什、店铺摊具与路面痕迹",
  "boot.build.city.outskirts": "城外：龙泉塔、荆河、西关",
  "boot.build.city.batch": "合批",
  "boot.build.city.ready": "就绪",
  "boot.build.city.houses": "盖房子 {done}/{total}",
  "boot.build.outfield.river": "城外：河道与河堤",
  "boot.build.outfield.berms": "城外：土坎与散兵胸墙",
  "boot.build.outfield.graves": "城外：坟头与光秃乔木",
  "boot.build.outfield.fields": "城外：麦田斑块与田埂",
  "boot.build.outfield.roads": "城外：大车路与津浦路路基",
  "boot.build.outfield.villages": "城外：村落轮廓",
  "boot.build.outfield.batch": "城外：合批",
});

/** 这张表覆盖的代码模块。Script_Main 由 Data_Text_Hud 登记（它同时用三张表的键）。 */
export const GATED_MODULES = Object.freeze([
  "Script_BootPaper.mjs",
  "Script_TengxianCity.mjs",
  "Script_TengxianOutfield.mjs",
]);

/** 报纸的名字 / 日期 / 简述按 Data_BootPapers 的 id 拼键（Script_BootPaper）。 */
export const DYNAMIC_PREFIXES = Object.freeze([
  "boot.paper.",
]);
