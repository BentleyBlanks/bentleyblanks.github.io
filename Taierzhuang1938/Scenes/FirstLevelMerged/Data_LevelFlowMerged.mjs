// 「北沙河单村合并版」分叉段（08–13）纯数据：01–07 直接复用 FirstLevelEncounter，此处只定义 z >= 355 的单向线性合并单村流程。
// 纯 JSON 可序列化数据，零函数（遵守 Data_DataSources 门禁）。

export const MERGED_SOURCE = {
  url: "https://app.notion.com/p/3fb60335331c81faa38dfe84c25d29f0",
  revision: "01–07 复用 2026-11-11 定稿；08–13 北沙河单村单向动线版 2026-11-22",
  coordinateSource: "FirstLevelMerged (北段 z<355 继承 FirstLevelEncounter，南段北移 ΔZ=-530m，迁入关帝庙/土地庙/土炮楼/大槐树石碾)",
  notice: "并村单向动线版 · 01–07 与基线完全共用",
};

export const MERGED_STAGES = [
  { id: "08", title: "沟口阻击与撤桥", status: "合并测试", bounds: [75, 225, 340, 505] },
  { id: "09", title: "关帝庙绕后端老耿家", status: "合并测试", bounds: [55, 165, 475, 585] },
  { id: "10", title: "救护所抢位与空袭突围", status: "合并测试", bounds: [85, 180, 555, 675] },
  { id: "11", title: "洞里休整与经教堂出村", status: "合并测试", bounds: [50, 128, 650, 720] },
  { id: "12", title: "黄昏赶桥与路基伏击", status: "合并测试", bounds: [-85, 70, 695, 755] },
  { id: "13", title: "死守铁路桥与炸桥夜行", status: "合并测试", bounds: [-110, -35, 685, 910] },
];

export const MERGED_BEATS = [
  {
    id: "08a", stage: "08", duration: 35, title: "出凹路经土地庙，望土炮楼抵沟口",
    p: [[98.5, 344], [99, 355], [103, 392], [103.5, 418], [102, 440], [99, 465]], pose: "walk",
    passage: "出了凹路南口，落日斜照麦田，官道东侧立着座小土地庙，前头东北角土炮楼高出屋脊，村口防战车大沟横截官道，本村汉子正跟二营士兵合力扛门板、往沟南土堆上压枣树枝。冬瓜：“顺儿……路费揣稳没得？我舅那封信还在我胸口……你拿去自己走……”顺子：“走个锤子！你舅认你又不认老子——老子一个人回去，咋个跟娘坟头交代！闭嘴省点力气！”老耿指着前头：“那就是俺们北沙河村！前些天二营来挖大沟，俺这车也帮着拉过树枝子。”",
    task: "经官道土地庙，跟车抵北沙河防战车壕板桥", threat: "后方日军追兵与九四式仍在尾随", gate: "离开凹路南口", exit: "抵达北沙河沟口板桥",
    planning: "沿官道依次掠过小土地庙、东北土炮楼与村口防战车壕，建立清晰的鲁南村落空间辨识度。",
  },
  {
    id: "08b", stage: "08", duration: 30, title: "沟口收容，妮儿护驴先送冬瓜进村",
    p: [[99, 465], [99, 471], [99, 476], [104, 478]], pose: "look",
    passage: "门板搭成的窄桥头，黑子四蹄死撑不肯上桥。顺子伸手扯笼头，妮儿护在黑子跟前死瞪着这个浑身是血的外地兵，一把拍开他的手。顺子火起：“聋了嗦！后头鬼子撵上来了！”老耿拦住：“莫怪她，娃儿真听不见。”妮儿额头贴住黑子脸，自己稳稳牵过板桥。二营连长迎上：“你们班就地归我守沟口！伤兵让老乡顺主街先送村西南救护所！”顺子急得跨出半步，被班长按回战壕：“打完这阵就过去！”顺子朝远去的驴车吼：“老汉，看好冬瓜！打完老子马上找你们！”",
    task: "与二营连长交接防务，护送驴车过桥并入沟南战壕", threat: "沟北追兵烟尘迫近", gate: "抵达沟口板桥", exit: "老耿与妮儿拉冬瓜先去西南救护所，主角留守沟口",
    planning: "单向动线关键支点：老耿拉冬瓜先行去西南救护所，顺子直接留守沟口接战，彻底消除“先跑西南再跑回沟口”的折返跑，同时种下“去西南救护所找冬瓜”的天然情感磁铁。",
  },
  {
    id: "08c", stage: "08", duration: 55, title: "铁王八抵沟，打掉抱门板垫沟兵",
    p: [[104, 478], [114, 478], [104, 478], [99, 475.5]], lookAt: [112, 415], pose: "shoot", cover: true,
    passage: "追兵散在沟北坟头和田埂后猛压火力，一辆九四式顺官道碾过铁丝网口停在沟北沿，下不去沟，车头机枪朝南横扫！几名散兵和老乡正往板桥狂奔，跟车日兵抱着门板试图垫沟，刘文财嘶吼：“先打抱门板的！表让狗日的把沟垫平了！”与此同时，村东中街外悄无声息摸进来一伙日军尖兵，顺着巷道直扑中街西头的老耿家。",
    task: "在沟南战壕掩护老乡过桥，打掉抱门板垫沟的日兵", threat: "沟北九四式扫射、田埂步兵与东翼渗入尖兵", gate: "入壕接战", exit: "抱门板垫沟步兵被清掉",
    planning: "战斗中途（+25s）东翼日军机枪组与灶屋守卫从村东实墙后沿中街东段真实路径渗入老耿家，路径完整可见、有因有果。",
  },
  {
    id: "08d", stage: "08", duration: 35, title: "军民撤桥，大槐树口机枪封死主街",
    p: [[99, 475.5], [101, 476]], pose: "carry",
    passage: "最后一个老百姓滚过板桥，二营连长吼：“撤桥！”顺子和扛门板的本村汉子顶着弹雨把三块门板拖回南沿，正面彻底断绝；村东南“轰”地腾起黑烟，官道桥也炸断了。顺子刚要顺主街往西南找冬瓜，南头村心大槐树与石碾口突然扫来一梭轻机枪——土墙打得碎泥横飞！二营哨兵大喊：“东头漏进一伙尖兵，占了中街口老耿家，把去救护所的街封死了！”班长压低身子：“我带有田在正面吸住他！”刘文财抬手一指西面高脊瓦顶：“主街走不得，顺儿跟我从西边关帝庙绕他屁股后头——摸到前哪个都不准响枪！”",
    task: "顶着火力按 F 撤掉门板桥，确认主街受阻并转向西侧关帝庙", threat: "老耿家正房机枪封锁主街", gate: "清完垫沟兵", exit: "门板桥撤除，顺视线转向关帝庙",
    planning: "用主街弹道封锁 + 右手高脊关帝庙屋顶做纯视觉空间引导，不靠箭头提示玩家就明白为何向西绕后。",
  },
  {
    id: "09a", stage: "09", duration: 45, title: "潜入关帝庙兼村塾，避过西口搜兵",
    p: [[101, 476], [104, 492], [112, 516], [90, 516], [86, 518], [70, 518], [65, 523.3], [71, 523.8], [74.8, 524.35], [80.3, 524.2], [80.3, 527.5], [80.3, 532]], pose: "crouch",
    passage: "顺子和文财压低身子拐进北街西口，贴墙摸进关帝庙残墙缺口。庙里兼作村塾，泥塑关公神龛和香案前摆着几排蒙尘旧课桌。西头巷口一队搜村日军正顺北街往里摸，两人借香案与课桌掩护屏息挪到南院门。",
    task: "禁止开火，穿过关帝庙（兼村塾）殿堂绕到庙南口", threat: "西口沿北街摸进来的搜村日军", gate: "撤桥完毕转向西侧", exit: "抵达关帝庙南院门",
    planning: "由沟口猛烈交火骤降至关帝庙无声潜行，重现张弛有度的 COD 节奏，并让鲁南乡土建筑（关帝庙/神龛/村塾课桌）深度服务玩法。",
  },
  {
    id: "09b", stage: "09", duration: 45, title: "西巷撞见折回找灶锅的妮儿，捂嘴被咬",
    p: [[80.3, 532], [86, 533], [84, 561], [104, 559], [118, 558]], pose: "crouch",
    passage: "刚出庙南口拐进西巷，迎面撞见趁乱偷偷折回家想拿锅灶口粮的妮儿——她听不见枪声，看见搜兵从北口过来急着想往自家院冲！顺子一把从背后箍住她、死死捂住嘴拖进墙角：“莫出去……出去就是死！”主街罗班长加紧点射，搜兵闻哨沿北街急忙转援主街离去。顺子刚一松手，满脸泪水的妮儿猛地推开他，狠狠一口咬在他手背上，缩到墙根恨恨瞪着他。顺子盯着渗血的牙印：“嘶——狗日的，老子是救你！”没还手，示意贴墙继续往中街老耿家旁摸。",
    task: "贴西巷潜行并按 F 捂住妮儿，等搜兵被主街枪声引走后抵中街西头", threat: "西巷近距离搜兵巡逻", gate: "走出关帝庙南口", exit: "搜兵转援离去，抵达老耿邻院门外",
    planning: "自然衔接妮儿“放完冬瓜偷偷折回自家灶屋”的动机，落实两人因听障误解爆发的咬手高潮，且全程仍保持单向向南推进。",
  },
  {
    id: "09c", stage: "09", duration: 30, title: "进老耿邻院，妮儿钻洞拔开夹壁便门",
    p: [[118, 558], [119.1, 562.8], [122.5, 564.8], [124.2, 564.8]], pose: "crouch",
    passage: "三人贴中街溜进老耿西隔壁邻院（MA3）。通往老耿家前院的夹壁便门从里头闩死了，刘文财趴下钻墙根破洞卡住肩膀，骂了句娘退出来。妮儿盯了顺子手背上还在渗血的牙印一眼，没吭声推开文财，自己钻过去从里头拔开了便门木闩。",
    task: "摸到邻院夹壁便门前，等妮儿钻洞按 F 推开便门", threat: "一墙之隔就是老耿家灶屋与正房", gate: "抵达邻院门外", exit: "夹壁便门打开",
  },
  {
    id: "09d", stage: "09", duration: 60, title: "突入老耿家，清灶屋、背端封街机枪",
    p: [[124.2, 564.8], [125.1, 564.8], [127.5, 565.0], [127.5, 566.2], [127.5, 568.2], [127.5, 565.2], [131.6, 565.5], [131.6, 571.5], [131.6, 573.1], [131.6, 574.8]], lookAt: [131.6, 575], pose: "shoot",
    passage: "推开夹壁便门直插老耿家前院！顺子先摸进西厢灶屋解决背门警戒的日兵，随即贴到正房门边——门里机枪组正背对院子往村心大槐树主街猛扫！外头罗班长两颗手榴弹炸响，顺子和文财从背后冲进屋里端掉机枪组，去西南救护所的主街彻底打通！",
    task: "先清西厢灶屋守卫，再从背后端掉正房封街机枪组", threat: "灶屋守卫与正房机枪组近距离交火", gate: "夹壁便门已开", exit: "老耿家枪眼哑火，主街畅通",
  },
  {
    id: "10a", stage: "10", duration: 40, title: "过大槐树石碾抵救护所，替冬瓜止血",
    p: [[131.6, 574.8], [131.6, 571.5], [131.5, 562.8], [131.5, 560], [140, 560], [146, 564], [163, 586], [172, 600], [146, 607], [121, 613], [121, 642.5], [114, 642.5], [108, 642.5], [101, 636]], pose: "kneel",
    passage: "跨出老耿家院门，村心大槐树和老石碾就在主街口，顺子和文财、妮儿顺着刚打通的主街一路向南，直抵西南救护所！满院麦秸躺满伤号，隔壁田嫂和村妇支锅煮绷带，顺手塞来半瓢温水摆手不收铜板。军医撕开冬瓜衣襟：“按到他！肚皮上的老子这儿开不了，只能塞纱布！天黑驴车拉伤号进城赶夜车，莫给他喝水！”顺子：“城门口查不查送伤兵的？天黑我跟车！”军医：“抬得动就行，下一个！”",
    task: "过大槐树石碾顺主街抵救护所，按 F 替冬瓜按住伤口止血", threat: "冬瓜腹部重伤，日机侦察将至", gate: "端掉老耿家枪眼", exit: "完成止血，准备送冬瓜上车",
    planning: "顺子首次抵达西南救护所，把“大槐树石碾 -> 救护所止血 -> 抢车位 -> 空袭冲洞”串成一条笔直向南的剧情线。",
  },
  {
    id: "10b", stage: "10", duration: 35, title: "院门掀下营长皮箱，搡开勤务兵抢车位",
    p: [[101, 636], [108, 642.5], [114, 642.5], [121, 642.5]], pose: "melee",
    passage: "院门口老耿的驴车上，二营营部勤务兵正把文件箱、皮箱和呢子铺盖往车板上码，嫌伤兵血脏：“营长的东西，天黑先跟车进城！”车板只剩角落一点地儿。顺子一声不吭，把箱子一口一口往泥地里掀；勤务兵扑上来揪领子：“你龟儿要造反？营长的东西！”顺子一把将他搡开，仍不顶嘴。军医在院门怒吼：“伤号上车！箱子全给老子塞车底下！”顺子和文财刚把冬瓜抬上车板——",
    task: "到院门按 F 掀下营部皮箱、推开勤务兵，把冬瓜抬上车", threat: "营部私物挤占伤员车位", gate: "完成止血", exit: "安置冬瓜上车，空袭骤降",
    planning: "与 04 抬箱子上车形成动作镜像，用行动而非台词坐实顺子反权贵、护兄弟的底色。",
  },
  {
    id: "10c", stage: "10", duration: 50, title: "空袭炸翻骡车，单向冲进田嫂家避难洞",
    p: [[121, 642.5], [121, 664], [108, 664], [108, 659.6], [100, 659.6]], pose: "drag",
    passage: "头顶骤然炸开引擎尖啸！三架日机看清院里白布担架低空俯冲，第一串机枪弹直接打翻院门口的驴车——黑子连车带营部箱子烧成火团，“天黑跟车逃生”的路瞬间烧绝！军医吼着“往南隔壁洞里撤！”却转身扑回院里挡伤号倒在弹雨中。正南二十米外，田嫂冒死探出院门冲穿军装的顺子大喊：“大兄弟！往俺洞里冲！俺二丫吓呆在门口！”顺子和文财抬起冬瓜沿墙根低姿疾冲，顺路一把抄起门口的二丫，一口气单向扎进田嫂家避难洞！洞口妮儿睁大眼看着浑身黑灰的顺子把人抢进来。",
    task: "趁俯冲间隙护冬瓜、顺路抄起二丫，一路向南冲进田嫂避难洞（按 F 进洞）", threat: "日机低空俯冲扫射，驴车焚毁", gate: "推开勤务兵安置冬瓜", exit: "全员单向冲入田嫂家避难洞",
    planning: "彻底取消原版“救护所⇄田嫂洞”三趟往返折返跑，改为从救护所院门 -> 南邻门边抄起二丫 -> 扎进正南洞口的单向一口气突围，目标就在正前方视线内。",
  },
  {
    id: "11a", stage: "11", duration: 45, title: "洞内静默，妮儿画黑子摆弹壳和解",
    p: [[100, 659.6]], pose: "look",
    passage: "小土洞里挤满田嫂、二丫、老耿、妮儿、冬瓜和顺子班，洞口漏下一条血红残阳。田嫂紧抱二丫：“……大兄弟，俺这洞小，挤挤。”妮儿拿树枝在洞壁画长耳朵的黑子和驴车，掏出弹壳摆在画前。刘文财掂了掂：“攒到出嫁也换不到一条驴腿。”妮儿一把拿回弹壳摆好，转头直直看了顺子一眼，没再往后躲。",
    task: "在洞内喘息，看妮儿画黑子摆弹壳（按 F 继续）", threat: "洞外余火，村北零星枪声", gate: "全员冲进避难洞", exit: "顺子与妮儿冰释前嫌",
  },
  {
    id: "11b", stage: "11", duration: 35, title: "接回城令，老耿脱棉袄推回大洋",
    p: [[100, 659.6]], pose: "carry",
    passage: "二营连长赶到洞口传令：“三营今晚回城，伤兵顺铁路走，过了铁路桥天一黑就炸，防鬼子铁甲火车！二营留守村子，城里说汤军团在路上了！”何有田骂：“在路上？日他妈，老子也在路上！”冬瓜冷得打摆子，老耿脱下自己棉袄盖在他身上；顺子摸出钱袋，老耿一把推回去：“收起来！俺图恁这个？”",
    task: "接回城令，按 F 与文财抬起冬瓜出发", threat: "天黑前必须赶过铁路桥", gate: "洞内休整完毕", exit: "担架起行",
  },
  {
    id: "11c", stage: "11", duration: 40, title: "过拉席邻院与德国教堂，踏上北岸土路",
    p: [[100, 659.6], [108, 659.6], [108, 664], [121, 664], [121, 675], [114, 690], [100, 698], [63, 709], [60, 710]], pose: "carry",
    passage: "田嫂背起二丫跟在顺子身后。路过南隔壁，老耿隔塌墙喊：“走啊！鬼子要进村了！”洞口女人摇摇头，拉上草席盖死洞口——更显刚才田嫂冒险开门收留之重。出村路过德国教堂，有人正背着老人往院里进，队伍踏上北岸土路向西急行。",
    task: "抬冬瓜经拉席邻院与德国教堂，踏上北岸土路", threat: "残阳压向西边铁路桥", gate: "抬起担架出发", exit: "离开北沙河村进入北岸土路",
  },
  {
    id: "12a", stage: "12", duration: 40, title: "落日当钟，经李子行抬冬瓜赶桥",
    p: [[60, 710], [20, 720], [-15, 730]], pose: "carry",
    passage: "顺子抬前杠、文财抬后杠，两手占满开不了枪。队伍掠过空荡的李子行小村，夕阳正往西头铁路钢梁下落，天色就是倒计时；身后北沙河村边二营和班长三人的殿后枪声一阵紧似一阵。",
    task: "趁天黑前经李子行把冬瓜抬往铁路桥", threat: "右前方高路基潜伏截击日军", gate: "进入北岸土路", exit: "抵达浅路沟遭遇伏击",
  },
  {
    id: "12b", stage: "12", duration: 55, title: "浅路沟清路基伏兵，抢抵桥北土坎",
    p: [[-15, 730], [-19.2, 730.9], [-53.9, 738.8], [-59.8, 742.9], [-68, 742]], lookAt: [-73, 695], pose: "shoot", cover: true,
    passage: "右前方光秃铁路路基上冒出一股日军居高临下扫射！刘文财吼：“放下！进沟打！”顺子把担架安置进路南浅沟，伏在沟沿打掉路基上的截击日军，随即抄起担架一口气抢到铁路桥北头土坎——工兵已在石桥墩上绑好炸药。",
    task: "在浅路沟清掉铁路路基截击组，抢抵桥北土坎", threat: "路基高处步兵截击火力", gate: "遭遇路基射击", exit: "路基敌军肃清，抵达桥北桥头",
  },
  {
    id: "13a", stage: "13", duration: 45, title: "踩枕木抬冬瓜过四孔钢梁铁路桥",
    p: [[-68, 742], [-80, 746], [-80, 794], [-90, 798]], pose: "carry",
    passage: "钢梁桥面只有枕木，缝底下就是沙河浅水。顺子和文财一格一格抬着冬瓜挪过铁桥，安置在南岸河堤背面，顺子翻身趴上河堤。",
    task: "抬冬瓜踩枕木过铁路桥，安置到南堤后", threat: "枕木缝隙与北岸追兵", gate: "抵达桥北土坎", exit: "冬瓜在南岸安全落地",
  },
  {
    id: "13b", stage: "13", duration: 50, title: "南堤打哑路基机枪，喊班长三人抢桥",
    p: [[-90, 798]], lookAt: [-73, 694], pose: "shoot", cover: true,
    passage: "三营军官手按起爆器吼：“天黑了，炸！”文财急喊：“班长他们三个还在桥北土坎后头！顺儿，打路基上那挺机枪！”顺子架枪打哑桥北路基机枪，撑起身子扯嗓子吼出和开场坡顶一样的呼喊：“快过来！快过来——！”班长、有田、幺娃一跃一跃抢上桥头。",
    task: "清掉桥北路基封锁机枪，掩护班长三人抢上桥面", threat: "桥北路基机枪封死桥头", gate: "冬瓜已安置南岸", exit: "路基机枪哑火，三人踏上铁桥",
  },
  {
    id: "13c", stage: "13", duration: 45, title: "幺娃卡枕木，打退冲桥追兵",
    p: [[-90, 798]], lookAt: [-80, 760], pose: "shoot", cover: true,
    passage: "幺娃一脚踩空卡在枕木缝里，班长回身硬拽；后头追兵端着刺刀冲上桥北！顺子和文财在南堤拼命点射桥面追兵，直到班长拽着幺娃连滚带爬扑进南堤后：“没得了！点！”",
    task: "清除冲上铁桥桥面的追兵，掩护班长拽起幺娃过南堤", threat: "日军追兵冲上钢梁桥面", gate: "三人踏上铁桥", exit: "追兵受挫，全班越过南堤",
  },
  {
    id: "13d", stage: "13", duration: 20, title: "引线燃起，炸断北头两孔钢梁",
    p: [[-90, 798]], lookAt: [-80, 760], pose: "shoot", cover: true,
    passage: "引线滋滋冒火窜向桥墩，顺子按 F 压住北桥头，一声惊天巨响，北头两孔钢梁连着追兵一齐砸进河床！东北方北沙河村里二营的枪声还在夜色里响着。幺娃：“二营的……”班长：“走！”",
    task: "按 F 掩护工兵引爆炸断北沙河铁路桥", threat: "北桥头残敌", gate: "全班越过南堤", exit: "北头两孔钢梁炸落",
  },
  {
    id: "13e", stage: "13", duration: 50, title: "3月14日夜，抬着活着的冬瓜走向滕县",
    p: [[-90, 798], [-68, 810], [-64, 820], [-55, 860]], pose: "walk", cinematic: true,
    passage: "1938年3月14日夜。一长溜兵、担架和逃难百姓顺南岸土路往南走。何有田：“老人家，跟到我们进城做啥子？鬼子明天就撵到城底下了。”老耿：“村里那几个都是俺街坊……恁们打到哪，俺跟到哪。”担架上的冬瓜轻声问：“顺儿……到了城里，真有火车往后头送嗦？”顺子看着远处滕县城头的几点灯火：“有。”",
    task: "随队伍夜行前往滕县城", threat: "北沙河村仍在激战", gate: "铁路桥已炸断", exit: "第一关完成，进入第二关《手榴弹雨》",
  },
];

export const MERGED_SIGNALS = [
  { beat: "08d", fraction: 0.75, id: "PlankBridgeRemoved" },
  { beat: "08d", fraction: 0.88, id: "GuandaoBridgeBlown" },
  { beat: "09c", fraction: 0.85, id: "SideGateOpen" },
  { beat: "09d", fraction: 0.95, id: "MgSilenced" },
  { beat: "10c", fraction: 0.15, id: "RaidAftermath" },
  { beat: "10c", fraction: 0.25, id: "AidCartBurned" },
  { beat: "11a", fraction: 0.25, id: "NierDrawing" },
  { beat: "11c", fraction: 0.35, id: "MatHomeCovered" },
  { beat: "12b", fraction: 0.85, id: "ChargesSet" },
  { beat: "13d", fraction: 0.6, id: "BridgeBlown" },
];

export const MERGED_SURFACES = [
  { bounds: [-81.6, -78.4, 748, 792], y: 2.545, brokenBounds: [-81.6, -78.4, 748, 770], hideOn: "BridgeBlown" },
  { bounds: [97.65, 100.35, 468.5, 473.5], y: 0.2, hideOn: "PlankBridgeRemoved" },
];

export const MERGED_WAVES = [
  {
    id: "MergedRifles", beat: "08c", until: "08d", label: "沟北田埂追兵",
    source: [134, 390], route: [[134, 390], [143, 390], [145, 411], [129, 437]],
    count: 5, interval: 2, maxAlive: 5, lifetime: 95, speed: 1.9, behavior: "bounds", lastFall: 105,
    trigger: { mode: "time", delay: 0 }, repeat: "沟北土坎遮挡后预置，散向田埂压制板桥",
  },
  {
    id: "MergedBoards", beat: "08c", until: "08d", label: "抱门板垫沟步兵",
    source: [96, 410], route: [[96, 410], [103, 410], [103, 433], [99, 456], [99, 466]],
    count: 3, interval: 2.5, maxAlive: 3, lifetime: 60, speed: 2.1, behavior: "advance", lastFall: 70,
    trigger: { mode: "time", delay: 4 }, repeat: "沟北掩体遮挡后起行，企图抱门板垫平防战车壕",
  },
  {
    id: "MergedHouseGun", beat: "08c", until: "09d", label: "东路渗入·老耿家封街机枪组",
    source: [212, 572],
    route: [[212, 572], [185, 569], [157, 564], [140, 560], [131.5, 560], [131.5, 562.8], [131.6, 571.5], [131.6, 573.1], [131.6, 575.2]],
    count: 3, interval: 1.2, maxAlive: 3, lifetime: 260, speed: 3.1, behavior: "suppress", target: "player",
    trigger: { mode: "time", delay: 25 }, repeat: "08c中段自村东实墙后起行，沿中街东段渗入老耿家正房架枪封死主街",
  },
  {
    id: "MergedKitchenGuard", beat: "08c", until: "09d", label: "东路渗入·老耿家灶屋守卫",
    source: [212, 572],
    route: [[212, 572], [185, 569], [157, 564], [140, 560], [131.5, 560], [131.5, 562.8], [127.5, 564.5], [127.5, 566.2], [127.5, 568.8]],
    count: 1, interval: 0, maxAlive: 1, lifetime: 260, speed: 3.1, behavior: "guard", target: "player",
    trigger: { mode: "time", delay: 28 }, repeat: "随东路尖兵沿中街东段渗入老耿家西厢灶屋，背门警戒后院",
  },
  {
    id: "MergedWestSearch", beat: "09a", until: "09b", label: "西口沿北街搜村日军",
    source: [58, 516],
    route: [[58, 516], [90, 516], [88, 533], [82, 533], [88, 533], [90, 516], [114, 520], [127, 540], [140, 560]],
    count: 3, interval: 1.5, maxAlive: 3, lifetime: 95, speed: 2.3, behavior: "withdraw", deployDelay: 18,
    target: "none", trigger: { mode: "time", delay: 0 }, repeat: "自村西北沿北街摸至观音/关帝庙外搜索，闻主街枪声转援东头",
  },
  {
    id: "MergedRailAmbush", beat: "12a", until: "12b", label: "铁路路基截击组",
    source: [-89, 695], route: [[-89, 695], [-84, 695], [-73.5, 698]],
    count: 4, interval: 1.8, maxAlive: 4, lifetime: 90, speed: 2.1, behavior: "bounds", lastFall: 95,
    trigger: { mode: "time", delay: 18 }, repeat: "路基西侧背坡遮挡生成，翻上路基截击赶桥担架",
  },
  {
    id: "MergedBridgeGun", beat: "13a", until: "13b", label: "桥北路基封锁机枪",
    source: [-89, 698], route: [[-89, 698], [-84, 698], [-73.2, 694]],
    count: 2, interval: 0, maxAlive: 2, lifetime: 105, speed: 2.0, behavior: "advance", lastFall: 105,
    trigger: { mode: "time", delay: 0 }, repeat: "路基西侧遮挡生成，压制桥北土坎后的班长三人",
  },
  {
    id: "MergedBridgeRush", beat: "13c", until: "13d", label: "抢桥追兵",
    source: [-89, 718], route: [[-89, 718], [-79, 718], [-79, 746], [-80, 764], [-80, 767]],
    count: 5, interval: 2.2, maxAlive: 5, lifetime: 75, speed: 2.5, behavior: "advance", lastFall: 85,
    trigger: { mode: "time", delay: 0 }, repeat: "路基后方起行冲上钢梁桥面，炸桥前不越过南岸",
  },
];

export const MERGED_DIALOGUE = {
  "08a": [
    { actor: "winter", text: "顺儿……路费揣稳没得？信拿去，你自己先走……", at: 2, duration: 6 },
    { actor: "player", text: "走个锤子！老子一个人回去，咋个跟娘坟头交代！", at: 9, duration: 6 },
    { actor: "geng", text: "前头土炮楼底下就是俺们北沙河村！二营在村口挖了防战车大沟。", at: 17, duration: 7 },
  ],
  "08b": [
    { actor: "player", text: "聋了嗦！后头鬼子撵上来了！", at: 3, duration: 4 },
    { actor: "geng", text: "莫怪她，娃儿真听不见。", at: 8, duration: 4 },
    { actor: "battalion", text: "你们班归我守沟口！老乡把伤兵先送西南救护所！", at: 13, duration: 6 },
    { actor: "player", text: "老汉，看好冬瓜！打完这阵老子马上过来！", at: 21, duration: 6 },
  ],
  "08c": [
    { actor: "liu", text: "先打抱门板的！表让狗日的把沟垫平了！", at: 5, duration: 6 },
  ],
  "08d": [
    { actor: "battalion", text: "最后一个过来了！撤桥！", at: 1, duration: 4 },
    { actor: "sentry", text: "东头漏进一伙鬼子，占了中街老耿家，把去救护所的街封死了！", at: 14, duration: 7 },
    { actor: "liu", text: "主街走不得！从西边关帝庙绕他屁股后头——摸到前表响枪！", at: 23, duration: 8 },
  ],
  "09a": [
    { actor: "liu", text: "贴神龛和旧课桌蹲低走！西口有鬼子顺北街摸进来了。", at: 10, duration: 7 },
  ],
  "09b": [
    { actor: "player", text: "莫出去……出去就是死！", at: 10, duration: 5 },
    { actor: "player", text: "嘶——狗日的，老子是救你！", at: 31, duration: 5 },
  ],
  "09c": [
    { actor: "liu", text: "妈卖批，肩膀卡起了……女娃子自己钻过去了！", at: 12, duration: 6 },
  ],
  "09d": [
    { actor: "liu", text: "便门开了！先摸掉西厢灶屋那个，再从背后端正房机枪！", at: 2, duration: 7 },
  ],
  "10a": [
    { actor: "medic", text: "按到他！肚皮上的老子这儿开不了，只能塞纱布！", at: 18, duration: 7 },
    { actor: "player", text: "城门口查不查送伤兵的？天黑我跟车！", at: 26, duration: 6 },
    { actor: "medic", text: "抬得动就行，莫给他喝水！下一个！", at: 33, duration: 5 },
  ],
  "10b": [
    { actor: "batman", text: "你龟儿要造反？营长的东西先跟车进城！", at: 8, duration: 6 },
    { actor: "medic", text: "伤号上车！箱子全给老子塞车底下！", at: 16, duration: 6 },
    { actor: "winter", text: "……这下好。", at: 26, duration: 4 },
  ],
  "10c": [
    { actor: "medic", text: "日机盯上担架了！快往南隔壁洞里撤！", at: 4, duration: 5 },
    { actor: "tian", text: "大兄弟！往俺洞里冲！俺二丫吓呆在门口！", at: 14, duration: 7 },
    { actor: "liu", text: "抱上娃儿别回头！一口气扎进洞里！", at: 28, duration: 6 },
  ],
  "11a": [
    { actor: "tian", text: "……大兄弟，俺这洞小，挤挤。", at: 4, duration: 6 },
    { actor: "liu", text: "画的黑子嗦？攒到出嫁也换不到一条驴腿……犟。", at: 18, duration: 10 },
  ],
  "11b": [
    { actor: "battalion", text: "三营今晚回城，伤兵顺铁路走，过了桥天一黑就炸！", at: 1, duration: 7 },
    { actor: "he", text: "汤军团在路上？日他妈，老子也在路上！", at: 10, duration: 5 },
    { actor: "geng", text: "收起来！俺图恁这个？", at: 22, duration: 5 },
  ],
  "11c": [
    { actor: "geng", text: "走啊！鬼子要进村了！", at: 10, duration: 4 },
  ],
  "12a": [
    { actor: "liu", text: "抬起走！太阳要落到桥底下了！", at: 6, duration: 5 },
  ],
  "12b": [
    { actor: "liu", text: "路基上有人！放下担架，趴沟里压住他！", at: 1, duration: 5 },
  ],
  "13b": [
    { actor: "officer", text: "天黑了，炸！", at: 1, duration: 3 },
    { actor: "liu", text: "班长他们还在桥北土坎后头！顺儿，打路基上那挺机枪！", at: 5, duration: 7 },
    { actor: "player", text: "快过来！快过来——！", at: 32, duration: 5 },
  ],
  "13c": [
    { actor: "officer", text: "后头还有没得？！", at: 32, duration: 3 },
    { actor: "luo", text: "没得了！点！", at: 36, duration: 4 },
  ],
  "13d": [
    { actor: "yao", text: "二营还在村里响枪……", at: 13, duration: 4 },
    { actor: "luo", text: "走！", at: 17, duration: 2 },
  ],
  "13e": [
    { actor: "he", text: "老人家，跟到我们进城做啥子？明天鬼子就到城底下了。", at: 8, duration: 7 },
    { actor: "geng", text: "村里那几个都是俺街坊……恁们打到哪，俺跟到哪。", at: 17, duration: 8 },
    { actor: "winter", text: "顺儿……到了城里，真有车往后头送嗦？", at: 30, duration: 7 },
    { actor: "player", text: "有。", at: 39, duration: 3 },
  ],
};

export const MERGED_PLAY_GATES = {
  "08a": { area: true },
  "08b": { action: "letCartPass" },
  "08c": { clear: ["MergedBoards"] },
  "08d": { action: "removePlanks", signals: ["PlankBridgeRemoved", "GuandaoBridgeBlown"] },
  "09a": { area: true },
  "09b": { action: "muffleNier" },
  "09c": { action: "openGate", signals: ["SideGateOpen"] },
  "09d": { clear: ["MergedKitchenGuard", "MergedHouseGun"], signals: ["MgSilenced"] },
  "10a": { action: "holdWinter" },
  "10b": { action: "pushBatman" },
  "10c": { action: "shelterEscape", signals: ["RaidAftermath", "AidCartBurned"] },
  "11a": { action: "watchDrawing", signals: ["NierDrawing"] },
  "11b": { action: "liftWinter" },
  "11c": { area: true, signals: ["MatHomeCovered"] },
  "12a": { area: true },
  "12b": { clear: ["MergedRailAmbush"], signals: ["ChargesSet"] },
  "13a": { area: true },
  "13b": { clear: ["MergedBridgeGun"] },
  "13c": { clear: ["MergedBridgeRush"] },
  "13d": { action: "detonateRailBridge", signals: ["BridgeBlown"] },
};

export const MERGED_GUIDANCE = {
  "08a": { actor: "luo", text: "出凹路经土地庙往南，跟车抵北沙河村口板桥！" },
  "08b": { actor: "battalion", text: "护送老耿的驴车过板桥，到沟南战壕按 F 接防！" },
  "08c": { actor: "liu", text: "先打掉沟北抱门板垫沟的鬼子，掩护老乡过桥！" },
  "08d": { actor: "battalion", text: "到板桥南头按 F 撤掉门板桥！主街已被封，准备绕西侧关帝庙！" },
  "09a": { actor: "liu", text: "表开枪！潜入西侧关帝庙（兼村塾）殿堂，避过西口搜兵抵庙南口！" },
  "09b": { actor: "liu", text: "贴西巷潜行，撞见折回的妮儿后按 F 捂住她，等搜兵被主街枪声引走！" },
  "09c": { actor: "liu", text: "摸进邻院便门前，等妮儿钻洞按 F 推开夹壁便门！" },
  "09d": { actor: "liu", text: "突入老耿家先清西厢灶屋守卫，再从背后端掉正房封街机枪组！" },
  "10a": { actor: "medic", text: "经大槐树石碾顺主街直抵西南救护所，按 F 替冬瓜止血！" },
  "10b": { actor: "medic", text: "到院门口按 F 掀下营长皮箱、推开勤务兵，把冬瓜抬上车！" },
  "10c": { actor: "tian", text: "空袭炸翻驴车！护冬瓜顺路抄起门口二丫，一口气向南冲进田嫂家避难洞（按 F）！" },
  "11a": { actor: "liu", text: "在洞里歇口气，看妮儿画黑子摆弹壳（按 F 继续）。" },
  "11b": { actor: "luo", text: "接回城令，盖好老耿的棉袄，按 F 抬起冬瓜出发！" },
  "11c": { actor: "liu", text: "抬着冬瓜经过席子洞那家与德国教堂，踏上北岸土路！" },
  "12a": { actor: "liu", text: "经李子行往西急行，天黑前赶到铁路桥！" },
  "12b": { actor: "liu", text: "趴浅路沟清掉右前方路基上的截击日军，抢抵桥北土坎！" },
  "13a": { actor: "liu", text: "踩枕木抬冬瓜过四孔钢梁铁路桥，安置到南堤后！" },
  "13b": { actor: "liu", text: "架枪清掉桥北路基封锁机枪，掩护班长三人抢上铁桥！" },
  "13c": { actor: "liu", text: "打退冲上桥面的追兵，掩护班长拽起幺娃越过南堤！" },
  "13d": { actor: "officer", text: "全班已过南堤！按 F 掩护工兵引爆炸断北沙河铁路桥！" },
};

export const MERGED_CINEMATICS = ["13e"];

export const MERGED_MUSIC = {
  "08": "firstLevelDusk",
  "09": "firstLevelCloseQuartersPressure",
  "10": "firstLevelIronSiege",
  "11": "firstLevelDusk",
  "12": "firstLevelSapTrench",
  "13": "firstLevelOpenTheWay",
};
