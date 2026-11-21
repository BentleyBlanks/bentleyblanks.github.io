// 「北沙河单村合并版」分叉段（08–13）纯数据：01–07 直接复用 FirstLevelEncounter，此处只定义 z >= 355 的合并单村流程。
// 纯 JSON 可序列化数据，零函数（遵守 Data_DataSources 门禁）。

export const MERGED_SOURCE = {
  url: "https://app.notion.com/p/3fb60335331c81faa38dfe84c25d29f0",
  revision: "01–07 复用 2026-11-11 定稿；08–13 北沙河单村合并测试版 2026-11-22",
  coordinateSource: "FirstLevelMerged (北段 z<355 继承 FirstLevelEncounter，南段北移 ΔZ=-530m)",
  notice: "并村节奏测试变体 · 01–07 与基线完全共用",
};

export const MERGED_STAGES = [
  { id: "08", title: "进北沙河与救护所", status: "合并测试", bounds: [80, 175, 340, 665] },
  { id: "09", title: "撤桥与西巷端枪眼", status: "合并测试", bounds: [65, 165, 420, 590] },
  { id: "10", title: "空袭，三趟抢人", status: "合并测试", bounds: [85, 175, 555, 675] },
  { id: "11", title: "洞里与出发", status: "合并测试", bounds: [50, 128, 650, 720] },
  { id: "12", title: "黄昏赶铁路桥", status: "合并测试", bounds: [-85, 70, 695, 755] },
  { id: "13", title: "炸桥与夜行", status: "合并测试", bounds: [-110, -35, 685, 910] },
];

export const MERGED_BEATS = [
  {
    id: "08a", stage: "08", duration: 35, title: "出凹路，直抵北沙河村口",
    p: [[98.5, 344], [99, 355], [97, 392], [96, 435], [99, 465]], pose: "walk",
    passage: "出了凹路南口，落日斜照麦田，前头百米就是北沙河村口的防战车大沟，村里青壮正跟二营的兵一起扛门板、往沟南土堆上压枣树枝。冬瓜：“顺儿……路费揣稳没得？我舅那封信还在我胸口……你拿去自己走……”顺子：“走个锤子！你舅认你又不认老子——老子一个人回去，咋个跟娘坟头交代！闭嘴省点力气！”老耿指着前头：“那就是俺们北沙河村！前些天二营来挖大沟，俺这车也帮着拉过树枝子。”",
    task: "跟后送车到北沙河村口板桥", threat: "后方日军大队仍在尾随", gate: "离开凹路南口", exit: "抵达北沙河沟口",
    planning: "砍掉原耿家庄独立村与360m空白官道，凹路出口直连北移后的北沙河沟口，黄昏平滑切入。",
  },
  {
    id: "08b", stage: "08", duration: 25, title: "沟口收容，争取送冬瓜进村",
    p: [[99, 465], [99, 468]], pose: "look",
    passage: "官道被比人深的防战车壕截断，门板搭成窄桥，南头二营哨兵拿铅笔头登记散兵。哨兵：“站到！哪部分的？”班长：“前头撤下来的！车上是伤号，后头还有鬼子步兵和铁王八！”二营连长：“沟就是挖来挡它的。你们班归我守沟口，伤兵往村西南救护所送。”顺子抢上一步：“班长，我送冬瓜过去！我还得打听城里的车——”班长盯了他一眼：“……车上三个，老汉一个人卸不下来。文财跟他去，卸完马上滚回来！”",
    task: "听收容命令，准备过板桥", threat: "追兵即将抵达沟北", gate: "抵达板桥北头", exit: "获准送冬瓜去救护所",
  },
  {
    id: "08c", stage: "08", duration: 25, title: "妮儿护驴，牵黑子过板桥",
    p: [[99, 468], [99, 471], [99, 476], [102.7, 486]], pose: "walk",
    passage: "黑子到板桥头四蹄死撑不走，顺子伸手去扯笼头，妮儿护在黑子跟前死瞪着这个浑身是血的外地兵，一把拍开他的手。顺子火起：“聋了嗦！后头鬼子撵上来了！”老耿拦住：“莫怪她，娃儿真听不见。”妮儿捧住黑子的脸，脑门贴上去，自己攥着笼头稳稳牵过了板桥。顺子别扭地骂了句粗话，扭头跟车。",
    task: "跟黑子和驴车过板桥", threat: "北面烟尘逼近", gate: "走过门板桥", exit: "进入北沙河村主街",
    planning: "补入顺子与妮儿初遇时的戒备与嫌弃，建立两人情感弧线的起点。",
  },
  {
    id: "08d", stage: "08", duration: 45, title: "穿村路过老耿家，军民同忙",
    p: [[102.7, 486], [114, 520], [140, 560], [170, 600], [146, 607], [121, 613], [121, 642.5], [114, 642.5]], pose: "walk",
    passage: "官道斜穿村子就是主街，墙上刷着抗战标语，几个本村汉子正拆自家院门板往沟口抬。路过中街口，老耿指了指西边那座院子：“那是俺家，灶上锅还没收。”冬瓜：“……过了河就是县城嗦？”顺子：“嗯，送进城赶夜车。”队伍拐入南街，抵达西南头救护所院门。",
    task: "跟车穿村，前往西南救护所", threat: "全村备战", gate: "穿过主街与南街", exit: "抵达救护所东门",
  },
  {
    id: "08e", stage: "08", duration: 35, title: "救护所止血，田嫂递水不收钱",
    p: [[114, 642.5], [108, 642.5], [101, 635]], pose: "kneel",
    passage: "救护所满院麦秸躺满伤号，隔壁田嫂和村妇支锅煮绷带，见顺子满嘴干泥，顺手塞来半瓢温水，顺子下意识摸铜板，田嫂摆摆手转身去端血盆。军医撕开冬瓜衣襟：“按到他！肚皮上的老子这儿开不了，只能塞纱布！天黑这车拉伤号进城赶夜车往临城送，莫给他喝水！”顺子：“城门口查不查送伤兵的？天黑我跟车！”军医：“抬得动就行，下一个！”",
    task: "按住冬瓜止血，打听夜车去路", threat: "腹部重伤无法现场手术", gate: "完成止血", exit: "准备安置冬瓜上车",
  },
  {
    id: "08f", stage: "08", duration: 40, title: "搬下营长箱子，搡开勤务兵",
    p: [[101, 635], [108, 642.5], [121, 642.5]], pose: "melee",
    passage: "院门口老耿的驴车上，二营营部勤务兵正把文件箱、皮箱和呢子铺盖往车板上码，还嫌伤兵血脏：“营长的东西，天黑先跟车进城！”车板只剩角落一点地方。顺子一声不吭，把箱子一口一口往泥地里掀；勤务兵扑上来揪他领子：“你龟儿要造反？营长的东西！”顺子一把将他搡开，仍不顶嘴。军医在院里怒吼：“伤号上车！箱子全给老子塞车底下！”顺子和文财把冬瓜抬上车板，南邻塌墙洞口二丫探头看着妮儿。",
    task: "搬下营部箱子、推开勤务兵，把冬瓜抬上车", threat: "营部私物挤占伤员车位", gate: "推开勤务兵并安置冬瓜", exit: "文财催促回沟口",
    planning: "将12c-12e提案转正并压缩为一拍，与04抬箱子上车形成动作镜像，坐实顺子反权贵与护兄弟的实证。",
  },
  {
    id: "09a", stage: "09", duration: 35, title: "赶回沟口战壕归队",
    p: [[121, 642.5], [121, 613], [146, 607], [170, 600], [140, 560], [114, 520], [105, 478], [118, 478]], pose: "run",
    passage: "刘文财揪住顺子：“走了！班长在沟口等起的！”顺子回头冲车上的冬瓜喊：“等天黑！老子回来跟车送你进城！”两人顺主街跑回村北防战车壕南沿战壕，跳进班长身旁。",
    task: "沿主街跑回村北防战车壕", threat: "沟北追兵与装甲车逼近", gate: "离开救护所", exit: "进入沟南战壕",
  },
  {
    id: "09b", stage: "09", duration: 40, title: "铁王八抵沟，打掉抱门板垫路兵",
    p: [[118, 478], [104, 478], [99, 475.5]], lookAt: [112, 415], pose: "shoot", cover: true,
    passage: "追兵散在沟北坟头和田埂后压制，一辆九四式顺官道碾过铁丝网口停在沟北沿，下不去沟，车头机枪朝南猛扫。几个散兵和老乡正往板桥跑，跟车日兵抱着门板想垫沟，刘文财吼：“先打抱门板的！表让狗日的把沟垫平了！”",
    task: "掩护最后几人过桥，打掉抱门板的日兵", threat: "沟北九四式扫射与垫沟步兵", gate: "归队接战", exit: "垫沟步兵被清掉",
  },
  {
    id: "09c", stage: "09", duration: 25, title: "军民合力撤门板桥，官道桥炸断",
    p: [[99, 475.5]], pose: "carry",
    passage: "最后一个老百姓爬过板桥，二营连长吼：“撤桥！”顺子、二营士兵和一个本村汉子顶着机枪弹雨把门板一块块拖回南沿，正面彻底断绝。村东南“轰”地腾起黑烟——二营把官道桥也炸了。顺子怔了一下：“……桥断了。”",
    task: "顶着火力撤掉门板桥", threat: "沟北机枪扫射，官道桥已炸", gate: "清完垫沟兵", exit: "三块门板撤回南沿",
  },
  {
    id: "09d", stage: "09", duration: 35, title: "东侧日军渗入占老耿家，转走西巷",
    p: [[99, 475.5], [102, 492], [90, 516]], pose: "crouch",
    passage: "主街南头突然扫来一梭轻机枪！二营哨兵喊：“东头浅滩漏进来一伙尖兵，占了中街口老耿家那院，把回救护所的街封死了！”班长压低身子：“我带有田在正面吸住他！文财带顺儿绕西巷摸他屁股后头——摸到之前哪个都不准响枪！”刚拐进北街西口，妮儿自己从后头钻出来攥住顺子衣角往西巷拽：她要回家。",
    task: "禁止开火，跟文财和妮儿转入西巷", threat: "主街被老耿家院内机枪封锁", gate: "门板桥已撤", exit: "进入西巷北口",
    planning: "将原耿家庄最精彩的潜行绕后与北沙河合为一体，无需二次守路口护送担架。",
  },
  {
    id: "09e", stage: "09", duration: 50, title: "西巷捂住妮儿，松手被咬",
    p: [[90, 516], [86, 530.5], [85.2, 533]], pose: "crouch",
    passage: "三人贴着西巷矮墙蹲行。西侧街坊院里几个鬼子正逼出窖里的街坊行凶，妮儿认出熟人猛地要往院门冲！顺子从背后一把箍住她、死死捂住她的嘴：“莫出去……出去就是死！”主街班长打紧了枪，院里鬼子吹哨转去东头增援。顺子一松手，满脸泪水的妮儿猛地推开他，狠狠一口咬在他手背上，缩到墙根恨恨瞪着他。顺子看着渗血的牙印：“……狗日的，老子救你！”没还手，示意继续走。",
    task: "按住妮儿不让出声，等搜院日军离开", threat: "近处搜院日军，暴露即封死后路", gate: "抵达西巷街坊院外", exit: "搜院兵转援，继续南摸",
    planning: "落实顺子与妮儿的初期剧烈误解（以为顺子见死不救而咬手），为第二关扑倒破冰埋下强钩子。",
  },
  {
    id: "09f", stage: "09", duration: 40, title: "中街进邻院，妮儿钻洞开便门",
    p: [[85.2, 533], [84, 561], [106, 561], [119, 562.9], [121, 568], [124, 571.2]], pose: "crouch",
    passage: "顺西巷拐上中街，溜进老耿邻院（MA3）。隔墙通老耿家的便门从里头闩死了，刘文财趴下钻墙根破洞卡住肩膀，骂了句娘退出来。妮儿盯了顺子手背上的血印一眼，没吭声推开文财，自己钻过去从里头拔开了门闩。",
    task: "摸进邻院，等妮儿从里头打开隔墙便门", threat: "隔墙外就是老耿家灶屋与正房", gate: "到达邻院便门前", exit: "便门打开",
  },
  {
    id: "09g", stage: "09", duration: 40, title: "清灶屋，背后端掉老耿家枪眼",
    p: [[124, 571.2], [126.2, 571.2], [127.5, 566.5], [131.6, 571.5]], lookAt: [131.6, 575], pose: "shoot",
    passage: "穿过便门就是老耿家院子！顺子先摸进西厢灶屋放倒看后院的守卫，随即与文财贴到正房门边——门里机枪组正背对院子往主街猛扫！外头班长两颗手榴弹炸响，顺子和文财从背后冲进屋里端掉机枪组！",
    task: "清掉灶屋守卫，从背后端掉正房机枪组", threat: "老耿家灶屋守卫与正房机枪组", gate: "便门已开", exit: "老耿家枪眼哑火",
  },
  {
    id: "10a", stage: "10", duration: 30, title: "信号弹招来日机，奔回救护所",
    p: [[131.6, 571.5], [131.5, 562.8], [140, 560], [170, 600], [146, 607], [121, 613], [121, 642.5], [114, 642.5]], pose: "run",
    passage: "枪眼刚哑，沟北日军升起两颗信号弹！三架日机顺街俯冲，第二拨一架低低兜过救护所上空，看清了院里的白布担架，拉起来转大弯！有人嘶喊：“它看到了！”顺子顺着起火的南街疯跑回救护所，院门外黑子挨了一梭，连车带驴翻在火里！",
    task: "顺南街赶回救护所找冬瓜", threat: "日机识别白布担架后俯冲扫射", gate: "端掉老耿家枪眼", exit: "赶到救护所院门",
  },
  {
    id: "10b", stage: "10", duration: 35, title: "第一趟：田嫂冒险让洞，拖冬瓜进洞",
    p: [[114, 642.5], [122.3, 639], [121, 642.5], [121, 664], [108, 664], [108, 659.6], [100, 659.6]], pose: "drag",
    passage: "救护所的洞塞满了！南隔壁塌墙那头，田嫂冒死探出洞口冲穿军装的顺子喊：“大兄弟！这边！快往俺洞里拖！”飞机声远就冲，尖啸一来就扑墙根，顺子和军医合力把冬瓜从翻车边拖进田嫂家的避难洞。",
    task: "趁俯冲间隙把冬瓜拖进田嫂家的洞", threat: "低空俯冲扫射窗口", gate: "赶到翻车旁", exit: "冬瓜安全进洞",
  },
  {
    id: "10c", stage: "10", duration: 45, title: "第二趟：弹雨冲院心抱回二丫",
    p: [[100, 659.6], [108, 659.6], [108, 664], [121, 664], [121, 642.5], [108, 642.5], [101, 638], [108, 642.5], [121, 642.5], [121, 664], [108, 664], [108, 659.6], [100, 659.6]], pose: "carry",
    passage: "田嫂哭喊二丫还在救护所院里！院心二丫吓傻站着不动，顺子趁飞机拉起冲进院心，一把将二丫夹在胳膊底下狂奔回洞口交给田嫂。洞口被老耿按住的妮儿听不见枪声，却睁大眼看着顺子在弹雨里把孩子抢回来。",
    task: "冲进院心抱起二丫，送回田嫂手里", threat: "日机二次扫射院心", gate: "冬瓜已进洞", exit: "二丫安全进洞",
  },
  {
    id: "10d", stage: "10", duration: 35, title: "第三趟：军医不肯撤，倒在院心",
    p: [[100, 659.6], [108, 659.6], [108, 664], [121, 664], [121, 642.5], [111, 642.5], [121, 642.5], [121, 664], [108, 664], [108, 659.6], [100, 659.6]], pose: "down",
    passage: "顺子第三次冲到院口想拉军医，军医跪在地上给伤号勒最后一圈绷带死活不走。引擎尖啸压顶，顺子扑进墙根，一串机枪弹扫穿院心，军医和伤号一起倒在血泊里不动了。",
    task: "尝试接应军医，躲开扫射退回洞口", threat: "第三次俯冲扫射", gate: "二丫已获救", exit: "退回田嫂家洞口",
  },
  {
    id: "10e", stage: "10", duration: 15, title: "驴车焚毁，跟车逃生路断绝",
    p: [[100, 659.6]], pose: "kneel",
    passage: "院门外黑子连车带营部箱子一起烧成火团，救护所房顶浓烟滚滚。“天黑跟车进城”那条路，连同车上的位子一起烧没了。",
    task: "在洞口确认幸存人员", threat: "救护所大火，敌机东去", gate: "三次俯冲结束", exit: "转入洞内暂避",
  },
  {
    id: "11a", stage: "11", duration: 30, title: "小洞挤挤，红天漏进洞口",
    p: [[100, 659.6]], pose: "kneel",
    passage: "小土洞里挤着田嫂、二丫、老耿、妮儿、冬瓜，随后文财和幺娃也钻进来。洞口漏下一条血红残阳。田嫂紧抱着二丫，看着满身黑灰的顺子：“……大兄弟，俺这洞小，挤挤。”",
    task: "在洞内喘息片刻", threat: "飞机远去，村北零星枪声", gate: "众人进洞", exit: "安静下来",
  },
  {
    id: "11b", stage: "11", duration: 40, title: "妮儿画黑子摆弹壳，不再躲顺子",
    p: [[100, 659.6]], pose: "look",
    passage: "妮儿拿树枝在洞壁画长耳朵的黑子和驴车，掏出弹壳摆成一排。刘文财掂了掂：“四五十个才一斤，攒到出嫁也换不到一条驴腿。”妮儿一把从文财手心拿回弹壳摆好，转头看了顺子一眼，没再往后缩。冬瓜望着洞外军医遗体没吭声，老耿看着壁上的驴转开了脸。",
    task: "看妮儿画黑子、摆弹壳", threat: "洞外余火", gate: "洞内安静", exit: "连长传令",
  },
  {
    id: "11c", stage: "11", duration: 30, title: "回城命令，老耿脱棉袄拒钱",
    p: [[100, 659.6]], pose: "carry",
    passage: "二营连长赶到洞口：“命令下来了：三营今晚回城，伤兵顺铁路走，过了铁路桥天一黑就炸，防鬼子铁甲火车！二营留守村子，城里说汤军团在路上了！”何有田骂：“在路上？日他妈，老子也在路上！”冬瓜冷得打摆子，老耿脱下自己的棉袄盖在他身上；顺子摸出钱袋，老耿一把推回去：“收起来！俺图恁这个？”",
    task: "接回城令，和文财抬起冬瓜", threat: "天黑前必须过铁路桥", gate: "接令完毕", exit: "担架起行",
  },
  {
    id: "11d", stage: "11", duration: 35, title: "路过拉席邻院与教堂，出村奔桥",
    p: [[100, 659.6], [108, 659.6], [108, 664], [121, 664], [121, 675], [114, 690], [100, 698], [63, 709], [60, 710]], pose: "carry",
    passage: "田嫂背起二丫跟在顺子身后。路过南隔壁，老耿隔塌墙喊：“走啊！鬼子要来了！”洞口女人摇摇头，拉上草席盖死洞口——更显刚才田嫂开门收留之重。出村土路旁墙根盖着一排草席，德国教堂门口有人背着老人往里进。",
    task: "抬冬瓜沿北岸土路赶往铁路桥", threat: "落日压向西边铁路桥", gate: "离开田嫂家", exit: "进入北岸浅路沟段",
  },
  {
    id: "12a", stage: "12", duration: 25, title: "落日当钟，抬担架赶桥",
    p: [[60, 710], [20, 720], [-15, 730]], pose: "carry",
    passage: "顺子抬前杠、文财抬后杠，两手占满开不了枪。太阳正往西头铁路钢梁下落，天色就是倒计时；身后北沙河村边班长三人的殿后枪声一阵紧似一阵。",
    task: "天黑前把冬瓜抬往铁路桥", threat: "右前方高路基潜伏日军", gate: "进入北岸土路中段", exit: "遭遇路基截击",
  },
  {
    id: "12b", stage: "12", duration: 30, title: "放下担架，趴进浅路沟还枪",
    p: [[-15, 730], [-19.2, 730.9]], lookAt: [-73, 695], pose: "shoot", cover: true,
    passage: "右前方光秃铁路路基上冒出一股日军居高临下扫射！刘文财吼：“放下！进沟打！”顺子把担架安置进路南浅沟，伏在沟沿举枪把路基上的鬼子压下去。",
    task: "放下担架，压住铁路路基上的截击日军", threat: "路基高处步兵火力", gate: "遭到路基射击", exit: "清除路基截击组",
    planning: "将原17段两次重复放担架精炼为一次高密度路沟反击，保持赶桥紧迫感。",
  },
  {
    id: "12c", stage: "12", duration: 25, title: "重新抬起，抢抵铁路桥北土坎",
    p: [[-19.2, 730.9], [-53.9, 738.8], [-59.8, 742.9], [-68, 742]], pose: "carry",
    passage: "压住路基火力，两人一把抄起担架顺浅沟抢到铁路桥北头土坎。工兵已在石桥墩上绑好炸药，引线拉过了南岸河堤。",
    task: "把冬瓜抬到铁路桥北桥头", threat: "天色将黑，桥头催促起爆", gate: "路基敌军已清", exit: "排队踏上铁路桥",
  },
  {
    id: "13a", stage: "13", duration: 40, title: "踩枕木抬冬瓜过钢梁桥",
    p: [[-68, 742], [-80, 746], [-80, 794], [-90, 798]], pose: "carry",
    passage: "钢梁桥面只有枕木，缝底下就是沙河浅水。顺子和文财一格一格抬着冬瓜挪过铁桥，安置在南岸河堤背面，顺子翻身趴上河堤。",
    task: "抬冬瓜过铁路桥，安置到南堤后", threat: "枕木缝隙与北岸追兵", gate: "踏上桥头", exit: "冬瓜在南岸安全落地",
  },
  {
    id: "13b", stage: "13", duration: 30, title: "南堤回头等，压住桥北路基机枪",
    p: [[-90, 798]], lookAt: [-73, 694], pose: "shoot", cover: true,
    passage: "三营军官手按起爆器吼：“天黑了，炸！”文财急喊：“班长他们三个还在桥北土坎后头！顺儿，打路基上那挺机枪！”顺子架枪朝桥北路基猛打，替殿后的班长三人撕开冲桥口子。",
    task: "打哑桥北路基机枪，掩护班长三人出坎", threat: "桥北路基机枪封死桥头", gate: "冬瓜已安置南岸", exit: "路基机枪被打哑",
  },
  {
    id: "13c", stage: "13", duration: 25, title: "喊快过来，掩护三人抢上桥头",
    p: [[-90, 798]], lookAt: [-73, 694], pose: "shoot", cover: true,
    passage: "机枪一哑，顺子撑起身子扯嗓子吼：“快过来！快过来——！”——开场坡顶别人冲他喊的那句话，这回换他喊给班长。三人一跃一跃抢到桥头电线杆后。",
    task: "掩护班长、有田、幺娃抢上桥面", threat: "路基残敌点射", gate: "机枪已压制", exit: "三人踏上铁桥",
  },
  {
    id: "13d", stage: "13", duration: 30, title: "幺娃卡枕木，打退抢桥追兵",
    p: [[-90, 798]], lookAt: [-80, 760], pose: "shoot", cover: true,
    passage: "幺娃一脚踩空卡在枕木缝里，班长回身硬拽；后头追兵已经端着刺刀冲上桥北！顺子和文财在南堤拼命点射桥面追兵，直到班长拽着幺娃连滚带爬扑进南堤后：“没得了！点！”",
    task: "清除冲上桥面的追兵，等班长和幺娃过桥", threat: "日军追兵冲上钢梁桥面", gate: "幺娃脱困过桥", exit: "全班越过南堤",
  },
  {
    id: "13e", stage: "13", duration: 20, title: "引线燃起，炸断北头两孔钢梁",
    p: [[-90, 798]], lookAt: [-80, 760], pose: "shoot", cover: true,
    passage: "引线滋滋冒火窜向桥墩，顺子继续压住北桥头，一声惊天巨响，北头两孔钢梁连着追兵一齐砸进河床！东北方北沙河村里二营的枪声还在夜色里响着。幺娃：“二营的……”班长：“走！”",
    task: "阻击桥头残敌，掩护工兵引爆铁桥", threat: "北桥头残敌", gate: "引爆铁路桥", exit: "北头两孔钢梁炸落",
  },
  {
    id: "13f", stage: "13", duration: 50, title: "3月14日夜，抬着活着的冬瓜进滕县",
    p: [[-90, 798], [-68, 810], [-64, 820], [-55, 860]], pose: "walk", cinematic: true,
    passage: "1938年3月14日夜。一长溜兵、担架和逃难百姓顺南岸土路往南走。何有田：“老人家，跟到我们进城做啥子？鬼子明天就撵到城底下了。”老耿：“村里那几个都是俺街坊……恁们打到哪，俺跟到哪。”担架上的冬瓜轻声问：“顺儿……到了城里，真有火车往后头送嗦？”顺子看着远处滕县城头的几点灯火：“有。”",
    task: "随队伍夜行前往滕县城", threat: "北沙河村仍在激战", gate: "铁路桥已炸断", exit: "第一关完成，进入第二关《手榴弹雨》",
  },
];

export const MERGED_SIGNALS = [
  { beat: "09c", fraction: 0.8, id: "PlankBridgeRemoved" },
  { beat: "09c", fraction: 0.9, id: "GuandaoBridgeBlown" },
  { beat: "09f", fraction: 0.85, id: "SideGateOpen" },
  { beat: "09g", fraction: 0.95, id: "MgSilenced" },
  { beat: "10a", fraction: 0.55, id: "RaidAftermath" },
  { beat: "10a", fraction: 0.8, id: "AidCartBurned" },
  { beat: "11b", fraction: 0.2, id: "NierDrawing" },
  { beat: "11d", fraction: 0.35, id: "MatHomeCovered" },
  { beat: "12c", fraction: 0.5, id: "ChargesSet" },
  { beat: "13e", fraction: 0.6, id: "BridgeBlown" },
];

export const MERGED_SURFACES = [
  { bounds: [-81.6, -78.4, 748, 792], y: 2.545, brokenBounds: [-81.6, -78.4, 748, 770], hideOn: "BridgeBlown" },
  { bounds: [97.65, 100.35, 468.5, 473.5], y: 0.2, hideOn: "PlankBridgeRemoved" },
];

export const MERGED_WAVES = [
  {
    id: "MergedRifles", beat: "09b", until: "09d", label: "沟北田埂追兵",
    source: [134, 390], route: [[134, 390], [143, 390], [145, 411], [129, 437]],
    count: 5, interval: 2, maxAlive: 5, lifetime: 95, speed: 1.9, behavior: "bounds", lastFall: 105,
    trigger: { mode: "time", delay: 0 }, repeat: "沟北坟头土堆遮挡后预置，散向田埂压制板桥",
  },
  {
    id: "MergedBoards", beat: "09b", until: "09c", label: "抱门板垫沟步兵",
    source: [96, 410], route: [[96, 410], [103, 410], [103, 433], [99, 456], [99, 466]],
    count: 3, interval: 2.5, maxAlive: 3, lifetime: 55, speed: 2.1, behavior: "advance", lastFall: 65,
    trigger: { mode: "time", delay: 4 }, repeat: "沟北背坡遮挡后起行，企图抱门板垫平防战车壕",
  },
  {
    id: "MergedWestSearch", beat: "09e", until: "09f", label: "西巷街坊院搜兵",
    source: [76.5, 529.5], route: [[76.5, 529.5], [82, 530.5], [90, 516], [114, 520], [138, 555]],
    count: 3, interval: 0, maxAlive: 3, lifetime: 80, speed: 2.4, behavior: "withdraw", deployDelay: 24,
    target: "none", trigger: { mode: "time", delay: 0 }, repeat: "西巷院内搜人，闻主街哨声转援东头",
  },
  {
    id: "MergedKitchenGuard", beat: "09f", until: "09g", label: "老耿家灶屋守卫",
    source: [127.5, 568.8], route: [[127.5, 568.8]],
    count: 1, interval: 0, maxAlive: 1, lifetime: 90, speed: 1.8, behavior: "guard", target: "player",
    trigger: { mode: "time", delay: 0 }, repeat: "老耿家西厢灶屋内背门警戒（实墙遮挡出生）",
  },
  {
    id: "MergedHouseGun", beat: "09d", until: "09g", label: "老耿家正房封街机枪组",
    source: [131.6, 575.2], route: [[131.6, 575.2], [131.6, 573.6]],
    count: 3, interval: 0, maxAlive: 3, lifetime: 210, speed: 1.8, behavior: "suppress", target: "player",
    trigger: { mode: "time", delay: 0 }, repeat: "渗入老耿家正房内架枪封锁主街（实墙遮挡出生）",
  },
  {
    id: "MergedRailAmbush", beat: "12a", until: "12c", label: "铁路路基截击组",
    source: [-89, 695], route: [[-89, 695], [-84, 695], [-73.5, 698]],
    count: 4, interval: 1.8, maxAlive: 4, lifetime: 60, speed: 2.1, behavior: "bounds", lastFall: 70,
    trigger: { mode: "time", delay: 0 }, repeat: "路基西侧背坡遮挡生成，翻上路基截击赶桥担架",
  },
  {
    id: "MergedBridgeGun", beat: "13a", until: "13c", label: "桥北路基封锁机枪",
    source: [-89, 698], route: [[-89, 698], [-84, 698], [-73.2, 694]],
    count: 2, interval: 0, maxAlive: 2, lifetime: 95, speed: 2.0, behavior: "advance", lastFall: 95,
    trigger: { mode: "time", delay: 0 }, repeat: "路基西侧遮挡生成，压制桥北土坎后的班长三人",
  },
  {
    id: "MergedBridgeRush", beat: "13c", until: "13e", label: "抢桥追兵",
    source: [-89, 718], route: [[-89, 718], [-79, 718], [-79, 746], [-80, 764], [-80, 767]],
    count: 5, interval: 2.5, maxAlive: 5, lifetime: 70, speed: 2.5, behavior: "advance", lastFall: 80,
    trigger: { mode: "time", delay: 0 }, repeat: "路基后方起行冲上钢梁桥面，炸桥前不越过南岸",
  },
];

export const MERGED_DIALOGUE = {
  "08a": [
    { actor: "winter", text: "顺儿……路费揣稳没得？信拿去，你自己先走……", at: 2, duration: 6 },
    { actor: "player", text: "走个锤子！老子一个人回去，咋个跟娘坟头交代！", at: 9, duration: 6 },
    { actor: "geng", text: "前头就是俺们北沙河村！二营在村口挖了防战车大沟。", at: 17, duration: 7 },
  ],
  "08b": [
    { actor: "sentry", text: "站到！哪部分的？", at: 1, duration: 3 },
    { actor: "luo", text: "前头撤下来的！车上是伤号，后头跟起铁王八！", at: 4, duration: 5 },
    { actor: "battalion", text: "你们班归我守沟口！伤兵往西南头救护所送。", at: 10, duration: 6 },
    { actor: "player", text: "班长，我送冬瓜过去！", at: 17, duration: 3 },
    { actor: "luo", text: "……文财跟他去，卸完人马上滚回来！", at: 20, duration: 4 },
  ],
  "08c": [
    { actor: "player", text: "聋了嗦！后头鬼子撵上来了！", at: 4, duration: 4 },
    { actor: "geng", text: "莫怪她，娃儿真听不见。", at: 9, duration: 4 },
  ],
  "08d": [
    { actor: "geng", text: "西边那院就是俺家，灶上锅还没收。", at: 14, duration: 5 },
    { actor: "winter", text: "……过了河，就是县城嗦？", at: 24, duration: 4 },
    { actor: "player", text: "嗯，送进城赶夜车。", at: 29, duration: 4 },
  ],
  "08e": [
    { actor: "medic", text: "按到他！肚皮上的老子这儿开不了，只能塞纱布！", at: 6, duration: 7 },
    { actor: "player", text: "城门口查不查送伤兵的？天黑我跟车！", at: 15, duration: 6 },
    { actor: "medic", text: "抬得动就行，莫给他喝水！下一个！", at: 22, duration: 5 },
  ],
  "08f": [
    { actor: "batman", text: "你龟儿要造反？营长的东西先跟车进城！", at: 8, duration: 6 },
    { actor: "medic", text: "伤号上车！箱子全给老子塞车底下！", at: 16, duration: 6 },
    { actor: "winter", text: "……这下好。", at: 28, duration: 4 },
  ],
  "09a": [
    { actor: "liu", text: "走了！班长在沟口等起的！", at: 1, duration: 4 },
    { actor: "player", text: "冬瓜等天黑！老子回来跟车送你进城！", at: 6, duration: 5 },
  ],
  "09b": [
    { actor: "liu", text: "先打抱门板的！表让狗日的把沟垫平了！", at: 4, duration: 6 },
  ],
  "09c": [
    { actor: "battalion", text: "最后一个过来了！撤桥！", at: 1, duration: 4 },
    { actor: "player", text: "……官道桥也炸了。", at: 17, duration: 4 },
  ],
  "09d": [
    { actor: "sentry", text: "东头漏进一伙鬼子，占了中街口老耿家，把街封死了！", at: 2, duration: 6 },
    { actor: "luo", text: "文财带顺儿绕西巷摸他屁股后头！摸到前哪个都不准响枪！", at: 10, duration: 7 },
  ],
  "09e": [
    { actor: "player", text: "莫出去……出去就是死！", at: 12, duration: 5 },
    { actor: "player", text: "嘶——狗日的，老子是救你！", at: 36, duration: 5 },
  ],
  "09f": [
    { actor: "liu", text: "妈卖批，肩膀卡起了……女娃子钻过去了！", at: 16, duration: 6 },
  ],
  "09g": [
    { actor: "liu", text: "便门开了！先摸掉灶屋那个，再冲正房！", at: 2, duration: 6 },
  ],
  "10a": [
    { actor: "luo", text: "信号弹！飞机冲救护所去了——顺儿，快回去找冬瓜！", at: 2, duration: 6 },
  ],
  "10b": [
    { actor: "tian", text: "大兄弟！这边！快往俺洞里拖！", at: 2, duration: 5 },
  ],
  "10c": [
    { actor: "tian", text: "俺二丫还在院子当中！求你救救她！", at: 2, duration: 5 },
  ],
  "10d": [
    { actor: "liu", text: "飞机又压下来了！扑墙根，快退回洞口！", at: 12, duration: 6 },
  ],
  "11a": [
    { actor: "tian", text: "……大兄弟，俺这洞小，挤挤。", at: 4, duration: 6 },
  ],
  "11b": [
    { actor: "liu", text: "画的黑子嗦？攒到出嫁也换不到一条驴腿……犟。", at: 6, duration: 10 },
  ],
  "11c": [
    { actor: "battalion", text: "三营今晚回城，伤兵顺铁路走，过了桥天一黑就炸！", at: 1, duration: 7 },
    { actor: "he", text: "汤军团在路上？日他妈，老子也在路上！", at: 9, duration: 5 },
    { actor: "geng", text: "收起来！俺图恁这个？", at: 20, duration: 5 },
  ],
  "11d": [
    { actor: "geng", text: "走啊！鬼子要进村了！", at: 8, duration: 4 },
  ],
  "12a": [
    { actor: "liu", text: "抬起走！太阳要落到桥底下了！", at: 4, duration: 5 },
  ],
  "12b": [
    { actor: "liu", text: "路基上有人！放下担架，趴沟里压住他！", at: 1, duration: 5 },
  ],
  "13b": [
    { actor: "officer", text: "天黑了，炸！", at: 1, duration: 3 },
    { actor: "liu", text: "班长他们还在桥北土坎后头！顺儿，打路基上那挺机枪！", at: 5, duration: 7 },
  ],
  "13c": [
    { actor: "player", text: "快过来！快过来——！", at: 3, duration: 5 },
  ],
  "13d": [
    { actor: "officer", text: "后头还有没得？！", at: 18, duration: 3 },
    { actor: "luo", text: "没得了！点！", at: 22, duration: 4 },
  ],
  "13e": [
    { actor: "yao", text: "二营还在村里响枪……", at: 13, duration: 4 },
    { actor: "luo", text: "走！", at: 17, duration: 2 },
  ],
  "13f": [
    { actor: "he", text: "老人家，跟到我们进城做啥子？明天鬼子就到城底下了。", at: 8, duration: 7 },
    { actor: "geng", text: "村里那几个都是俺街坊……恁们打到哪，俺跟到哪。", at: 17, duration: 8 },
    { actor: "winter", text: "顺儿……到了城里，真有车往后头送嗦？", at: 30, duration: 7 },
    { actor: "player", text: "有。", at: 39, duration: 3 },
  ],
};

export const MERGED_PLAY_GATES = {
  "08a": { area: true },
  "08b": { action: "reportWounded" },
  "08c": { area: true },
  "08d": { area: true },
  "08e": { action: "holdWinter" },
  "08f": { action: "pushBatman" },
  "09a": { area: true },
  "09b": { clear: ["MergedBoards"] },
  "09c": { action: "removePlanks", signals: ["PlankBridgeRemoved", "GuandaoBridgeBlown"] },
  "09d": { area: true },
  "09e": { action: "muffleNier" },
  "09f": { action: "openGate", signals: ["SideGateOpen"] },
  "09g": { clear: ["MergedKitchenGuard", "MergedHouseGun"], signals: ["MgSilenced"] },
  "10a": { area: true },
  "10b": { action: "shelterWinter" },
  "10c": { action: "rescueErya" },
  "10d": { action: "returnToShelter" },
  "10e": { action: "checkSurvivors" },
  "11a": { action: "enterShelter" },
  "11b": { action: "watchDrawing", signals: ["NierDrawing"] },
  "11c": { action: "liftWinter" },
  "11d": { area: true },
  "12a": { area: true },
  "12b": { clear: ["MergedRailAmbush"] },
  "12c": { area: true },
  "13a": { area: true },
  "13b": { clear: ["MergedBridgeGun"] },
  "13c": { action: "coverPole" },
  "13d": { clear: ["MergedBridgeRush"] },
  "13e": { action: "detonateRailBridge", signals: ["BridgeBlown"] },
};

export const MERGED_GUIDANCE = {
  "08a": { actor: "luo", text: "出凹路往南！跟车到北沙河村口板桥！" },
  "08b": { actor: "battalion", text: "上前跟二营连长报到，安置车上伤号！" },
  "08c": { actor: "geng", text: "跟紧妮儿和黑子，走过门板桥进村！" },
  "08d": { actor: "liu", text: "顺主街转南街，把冬瓜送到西南头救护所！" },
  "08e": { actor: "medic", text: "到军医跟前按住冬瓜止血！" },
  "08f": { actor: "medic", text: "到院门口搬下营部箱子、推开勤务兵，把冬瓜抬上车！" },
  "09a": { actor: "liu", text: "顺主街跑回村北防战车壕归队！" },
  "09b": { actor: "liu", text: "先打掉沟北抱门板垫沟的鬼子，掩护老乡过桥！" },
  "09c": { actor: "battalion", text: "到板桥南头按 F 撤掉门板桥！" },
  "09d": { actor: "luo", text: "主街被老耿家机枪封死！表开枪，跟妮儿转进北街西口！" },
  "09e": { actor: "liu", text: "贴西巷蹲行，到街坊院外按 F 捂住妮儿，表暴露！" },
  "09f": { actor: "liu", text: "顺中街进邻院便门前，等妮儿钻过去按 F 开门！" },
  "09g": { actor: "liu", text: "进老耿家先清西厢灶屋守卫，再从背后端掉正房机枪组！" },
  "10a": { actor: "luo", text: "飞机盯上救护所了！顺南街快跑回去找冬瓜！" },
  "10b": { actor: "tian", text: "趁俯冲间隙把冬瓜拖进南隔壁田嫂家的洞！" },
  "10c": { actor: "tian", text: "冲进救护所院心抱回二丫，送进田嫂洞口！" },
  "10d": { actor: "liu", text: "飞机再俯冲！退回田嫂家洞口避险！" },
  "10e": { actor: "geng", text: "在洞口按 F 清点幸存的人！" },
  "11a": { actor: "tian", text: "进洞暂避，按 F 安顿下来。" },
  "11b": { actor: "liu", text: "看妮儿画完黑子、摆好弹壳（按 F 继续）。" },
  "11c": { actor: "luo", text: "接回城令，盖好老耿的棉袄，按 F 抬起冬瓜！" },
  "11d": { actor: "liu", text: "抬着冬瓜顺出村路转北岸土路，赶往铁路桥！" },
  "12a": { actor: "liu", text: "跟斗土路往西赶，赶在天黑前过桥！" },
  "12b": { actor: "liu", text: "趴进浅路沟，清掉右前方铁路路基上的截击日军！" },
  "12c": { actor: "liu", text: "重新抬起冬瓜，赶到铁路桥北头土坎！" },
  "13a": { actor: "liu", text: "顺桥面枕木过河，把冬瓜安置在南岸河堤后！" },
  "13b": { actor: "liu", text: "架枪清掉桥北路基上的封锁机枪，救班长三人！" },
  "13c": { actor: "player", text: "在南堤按 F 喊班长三人抢上桥头！" },
  "13d": { actor: "liu", text: "打掉冲上铁桥桥面的追兵，掩护班长拽起幺娃！" },
  "13e": { actor: "officer", text: "全班已过南堤！按 F 掩护引爆北沙河铁路桥！" },
};

export const MERGED_CINEMATICS = ["13f"];

export const MERGED_MUSIC = {
  "08": "firstLevelDusk",
  "09": "firstLevelCloseQuartersPressure",
  "10": "firstLevelIronSiege",
  "11": "firstLevelDusk",
  "12": "firstLevelSapTrench",
  "13": "firstLevelOpenTheWay",
};
