// 《滕县 1938》剧本 —— 七关的目标链、节拍、台词、人物表，与五场过场的分镜。
//
// **纯数据，不许 import three**（Node 里要能直接 import：自检、导词表、
// 考据比对都读这一份；一旦沾上 three，命令行工具就得拖起整个渲染库）。
//
// 施工底本：docs/Data_TengxianDesign.md（关卡与过场设计书）
// 考据底本：docs/Data_TengxianTimeline.md（逐日过程与指挥链，三档可信度）
// 世界坐标：Data_Tengxian.mjs（X 向东，Z 向南，Y 向上，原点 = 城中心十字街口）
//
// ---------------------------------------------------------------------------
// 编剧红线（违反任何一条都是史实事故，不是风格问题）
//
//   1. 时间线锁死：3/14 拂晓外围攻击 → 3/15 收缩入城 → 3/16 东关拉锯、夜间夺回
//      东关门 → 3/17 南城墙被轰开、西门楼失守、王铭章殉国 → 3/17 21 时北门突围
//      → 3/18 午前后枪声停止。**不许为关卡节奏挪动任何一天。**
//   2. 必败。玩家是二等兵，能改变的只有「这一小时守不守得住」。
//      不设翻盘分支、不设隐藏结局、不设「守住滕县」的成就。
//   3. **不演王铭章举枪自尽**（理由见 CUTSCENES.CS_WangMingzhang 的长注释，
//      那段注释是写给以后想「纠正」回去的人看的，别删）。
//   4. 汤恩伯那一场只呈现命令与时间，不下判决。全场无角色开口。
//   5. 称谓：官对兵「弟兄们」；兵对官按职务（师长／团长／营长／连长）。
//      **禁「师座」「军座」，禁「同志们」。** 日军不把「八格牙路」当口头禅，
//      日方文书与口语称中国军队「支那兵」。
//   6. 结算不打精确歼敌数。只打三个可验证量：守住时长、阵地易手次数、
//      随你活着出城的人数。
//   7. 台儿庄那一套（四米寨墙、六门、运河、浮桥、清真寺）整个作废，不许复用。
//
//   另有三条滕县专属：守军无钢盔（竹斗笠／布军帽、草鞋、绑腿，三分之一以上无步枪）；
//   攻城战里没有坦克没有装甲车（濑谷支队攻城未配属战车部队）；
//   没有机群轰炸（合理表现是几架侦察机盘旋，偶尔丢轻型炸弹）。
// ---------------------------------------------------------------------------
//
// tier 字段是**可信度分档**，不是装饰：
//   "信史"     档案原件／1938 年当时报刊电文／中日双方战斗详报可对勘
//   "主流"     回忆录、口述、文史资料，链条清楚但无同时代文件背书
//   "转述"     角色转述上面两档的内容（措辞是虚构的，事实是有据的）
//   "虚构"     史料没写、但不与史料冲突的承接句。**不得承载事实断言。**
//   "提示"／"系统"／"环境"  非台词的 UI 文本
// 凡 tier==="虚构" 的行都不许被引用为史料；凡带 presumed:true 的数值都不许
// 在游戏内任何文本里说成史实（登记表见文件末尾 PRESUMED_STAGING）。

// ===========================================================================
// 人物表
// ===========================================================================

/**
 * real:true 的人只做史料里有的事。
 * real:false 的人用来承担「无名者」的分量 —— 城内约三千人里绝大多数没有留下名字。
 *
 * 班长邱茂才与连长杨守成两个名字由设计书写死（docs/Data_TengxianDesign.md 关卡表），
 * 这里照抄，不许改名，改了下游按名字对台词的自检会漏。
 */
export const CAST = {
  player: {
    name: "谢长顺", short: "长顺", real: false,
    note: "第 122 师 364 旅 727 团 3 营 9 连 二等兵，四川三台人，十八岁。籍贯为推定",
  },
  qiu: {
    name: "邱茂才", short: "班长", real: false,
    note: "9 连 3 班班长，四川人。老兵，出川那一趟从头走到尾",
  },
  yang: {
    name: "杨守成", short: "连长", real: false,
    note: "9 连连长，四川人",
  },
  // --- 真实历史人物 ---------------------------------------------------------
  wang: {
    name: "王铭章", short: "师长", real: true,
    note: "第 122 师师长／第 41 军前方总指挥（职务三说并列：代军长／前方总指挥／第二线指挥官）。3 月 17 日殉国",
  },
  zhao: {
    name: "赵渭滨", short: "参谋长", real: true,
    note: "第 122 师参谋长，少将，时年 44 岁。3 月 17 日殉国（有绝笔家书传世，信史）",
  },
  zhang: {
    name: "张宣武", short: "团长", real: true,
    note: "第 727 团团长，被王铭章任命为滕县城防司令。1983 年起的文史回忆是本役中方骨架史料",
  },
  yan: {
    name: "严翊", short: "营长", real: true,
    note: "第 731 团 1 营营长。东关缺口密集投弹堵口就是这个营干的",
  },
  hou: {
    name: "侯子平", short: "副营长", real: true,
    note: "第 727 团 3 营副营长。3 月 17 日 21 时指挥扒开北城门突围",
  },
  // --- 只出声不出场 ---------------------------------------------------------
  adjutant: { name: "", short: "副官", real: false, note: "虚构，无名。只在 CS_WangMingzhang 画外喊一句" },
  runner: { name: "", short: "传令兵", real: false, note: "虚构，无名" },
  crowd: { name: "", short: "", real: false, note: "西门瓮城里挤着的人，无名无脸" },
  narrator: { name: "", short: "", real: false },
};

// ===========================================================================
// 关卡表（七关）
// ===========================================================================

/**
 * beats 的 at 触发式（沿用 Data_Script.mjs 的一套，Script_Story 那层的翻译表能直接吃）：
 *   start / end
 *   wave:N            第 N 波攻击开始
 *   waveClear:N       第 N 波被打退
 *   zone:名字          进入触发区
 *   event:名字         规则层派发的事件
 *   delay:秒           上一条之后过多久
 * type：title / line / shout / narration / objective / note / hint / system / env
 *
 * clock 是**史料时刻**（Data_TengxianTimeline.md 有出处），不是推定；
 * pool（城里还站着的人）是**推定**的关卡数值，登记在 PRESUMED_STAGING。
 */
export const LEVELS = [
  // =========================================================================
  {
    id: "L0_Jiehe",
    title: "序 · 界河",
    place: "滕县以北 · 界河南岸 · 津浦路西",
    date: "一九三八年三月十四日 拂晓 — 十九时",
    clock: { from: "03-14 05:30", to: "03-14 19:00" },
    sky: "dawn",
    bounds: "L0Jiehe",
    minutes: 14,
    pool: { start: 220, end: 196, label: "城里还站着的人", presumed: true },
    objective: "跟着班长到界河南岸的土坎",
    objectives: [
      "跟着班长到界河南岸的土坎",
      "找一支枪（从倒下的人身上捡）",
      "守住土坎，顶过第一轮炮击",
      "掩护第三七〇旅退下来的人过路",
      "天黑前撤到北沙河",
    ],
    mechanic: "手榴弹经济：手榴弹是主武器，步枪是奢侈品。HUD 弹药第一行是手榴弹。「无枪」是合法初始状态。",
    brief: [
      "第二十二集团军是川军，娘子关下来之后一直没补充过。",
      "全集团军名义四个师，每旅不过一个团之众，总兵力不过两万员名。",
      "对面是第十师团濑谷支队 —— 一个不满员的步兵联队，背后拖着一个师团级的炮兵群。",
    ],
    cutsceneIn: "CS_Chuchuan",
    beats: [
      { at: "start", type: "title", text: "界河", sub: "一九三八年三月十四日 拂晓　两下店方向", tier: "主流" },
      { at: "start", type: "line", who: "qiu", text: "弟兄，把布袋系紧了。六颗，一颗都别掉。", tier: "虚构" },
      { at: "delay:3.0", type: "line", who: "qiu", text: "没枪的跟着有枪的走。谁倒了，枪归下一个。", tier: "虚构",
        source: "日方记川军三分之一以上没有步枪，各自带手榴弹约六发" },
      { at: "delay:5.0", type: "hint", text: "主武器是手榴弹。子弹要省，命更要省", tier: "提示" },
      { at: "zone:Kan", type: "objective", text: "守住土坎，顶过第一轮炮击" },
      { at: "zone:Kan", type: "line", who: "yang", text: "弟兄们，趴住。他们的炮先来，人后来。", tier: "虚构" },
      { at: "event:FirstBarrage", type: "line", who: "qiu", text: "数着点儿。一轮打完他们才动。", tier: "虚构" },
      { at: "wave:2", type: "line", who: "qiu", text: "石墙那边的人退下来了。让开路，别挡着。", tier: "虚构",
        source: "3/14 拂晓日军突破津浦路西第 124 师 370 旅石墙阵地" },
      { at: "wave:2", type: "objective", text: "掩护第三七〇旅退下来的人过路" },
      { at: "waveClear:3", type: "line", who: "yang", text: "十九时，三七〇旅趁黑往滕县撤。咱们跟着走。", tier: "转述",
        source: "19 时第 370 旅利用暗夜向滕县方向撤退" },
      { at: "waveClear:3", type: "objective", text: "天黑前撤到北沙河" },
      { at: "end", type: "narration", text: "这一天，川军三个师在正面兵力上占优，一日之内全线动摇。真正的不对称在火力，不在人数。", tier: "主流" },
    ],
  },

  // =========================================================================
  {
    id: "L1_Beishahe",
    title: "一 · 北沙河 · 入城",
    place: "北沙河二线阵地 → 津浦路 → 西关车站、电灯厂 → 滕县西门",
    date: "一九三八年三月十四日夜 — 十五日黄昏",
    clock: { from: "03-14 21:00", to: "03-15 18:00" },
    sky: "night",
    bounds: "L1Approach",
    minutes: 16,
    // 全局唯一一次上涨：收容第 127 师 757 团残部数百人（史料）。
    // 具体加多少人是推定 —— 史料只说「数百人」。
    pool: { start: 196, end: 328, gain: 132, label: "城里还站着的人", presumed: true },
    objective: "夜里在北沙河挖第二线阵地",
    objectives: [
      "夜里在北沙河挖第二线阵地",
      "收容第一二七师第七五七团退下来的散兵",
      "天亮后顶住到十三时",
      "沿津浦路南撤，穿过西关车站与电灯厂",
      "黄昏前从西门进城",
    ],
    mechanic: "收容与兵员池：第一次让玩家看见「城里还站着的人」这个数字，且这是全局唯一一次上涨。另有「撤退不是失败」——目标完成时计时器跳一大段。",
    brief: [
      "十四日夜，孙震亲赴前线，在北沙河召开军事会议。",
      "调七二七团二营，收容一二七师七五七团残部数百人，配置第二线阵地。",
    ],
    cutsceneIn: "CS_LiZongrenTang",
    beats: [
      { at: "start", type: "title", text: "北沙河", sub: "一九三八年三月十四日 夜", tier: "主流" },
      { at: "start", type: "line", who: "yang", text: "昨儿夜里，孙代总司令亲自到北沙河开的会。二营和收容起来的七五七团弟兄，就摆在这条线上。", tier: "转述",
        source: "3/14 夜孙震亲赴前线在北沙河召开军事会议，调 727 团 2 营并收容 127 师 757 团残部数百人" },
      { at: "delay:3.0", type: "hint", text: "按住 E —— 挖。挖得深一寸，明早少死一个", tier: "提示" },
      { at: "event:Regroup", type: "line", who: "qiu", text: "问清楚是哪个团的，能拿枪的就编进来。", tier: "虚构" },
      { at: "event:Regroup", type: "system", text: "城里还站着的人 ＋132", tier: "系统",
        source: "史料只说「收容 757 团残部数百人」，具体人数为推定" },
      { at: "zone:Dawn", type: "line", who: "qiu", text: "天要亮了。亮了就该他们的炮说话。", tier: "虚构" },
      { at: "event:JieheFall", type: "line", who: "yang", text: "界河正面破了。四十五军那两个师往城头镇退，滕县这边只剩咱们。", tier: "转述",
        source: "3/15 13 时界河正面阵地被突破；45 军两师向城头镇方向退却" },
      { at: "event:JieheFall", type: "objective", text: "沿津浦路南撤，穿过西关车站与电灯厂" },
      { at: "zone:XiguanStation", type: "line", who: "qiu", text: "那烟囱是电灯厂。师部原先就在那儿，昨儿搬进城了。", tier: "虚构",
        source: "王铭章师部原设城外电灯厂，接死守命令后迁入城内" },
      { at: "zone:WestGate", type: "line", who: "qiu", text: "……这墙。", tier: "虚构" },
      { at: "zone:WestGate", type: "hint", text: "从濠底到墙顶，十六米。你现在是在外头看它", tier: "提示" },
      { at: "end", type: "narration", text: "黄昏，日军步兵第十联队抵达滕县城下。守军收缩入城。", tier: "主流" },
    ],
  },

  // =========================================================================
  {
    id: "L2_Dongguan",
    title: "二 · 东关",
    place: "滕县东关 · 东寨门、关厢院落、寺院地",
    date: "一九三八年三月十六日 十时三十分 — 十七时",
    clock: { from: "03-16 10:30", to: "03-16 17:00" },
    sky: "smokyDay",
    bounds: "L2EastSuburb",
    minutes: 22,
    pool: { start: 328, end: 300, label: "城里还站着的人", presumed: true },
    objective: "在东寨门缺口处堵口",
    objectives: [
      "在东寨门缺口处堵口",
      "退进院落，掏枪眼",
      "经打通的隔墙在院落之间转移，守住寺院地阵地",
      "顶住第四、第五次攻击",
      "十七时的第六次攻势 —— 这一次守不住",
    ],
    mechanic: "堵口（连续投弹压制条）＋ 枪眼与打通墙（凿墙 E 交互扩成「掏射孔」与「打通过人洞」两档）。",
    brief: [
      "东关有一道土寨墙：高两米，顶宽四十公分。一炮一个口。",
      "日方自己的战后检讨说：对守军有利的不是城墙的高度与坚固，",
      "而是外城的存在，与环绕城墙的密集民房的存在。",
    ],
    beats: [
      { at: "start", type: "title", text: "东关", sub: "一九三八年三月十六日 十时三十分", tier: "主流" },
      { at: "start", type: "line", who: "yan", text: "弟兄们，缺口交给一营。手榴弹往壕里扔，别停手。", tier: "虚构",
        source: "严翊为真实人物；史料：集中六七十人向壕沟内连续猛投二三百枚手榴弹" },
      { at: "delay:3.0", type: "hint", text: "投弹密度够高，突进壕沟的人就压得回去。停一口气，他们就上来了", tier: "提示" },
      { at: "waveClear:1", type: "line", who: "qiu", text: "这道寨墙才两米高，四十公分厚。挡不住炮。", tier: "虚构",
        source: "日方实测东关寨墙高 2 m、顶宽 0.4 m" },
      { at: "waveClear:1", type: "line", who: "qiu", text: "挡得住的是后头这一片房。家家掏眼，一个院一个院跟他耗。", tier: "虚构",
        source: "日方检讨：对守军有利的不是城墙高度与坚固，而是外城与环绕城墙的密集民房" },
      { at: "waveClear:1", type: "hint", text: "看准发白的砖缝，按住 E —— 短按掏射孔，长按打通过人洞", tier: "提示" },
      { at: "wave:4", type: "line", who: "qiu", text: "他们不走巷子了。他们在炸墙——从房子里过来。", tier: "虚构" },
      { at: "event:TempleHold", type: "line", who: "yang", text: "寺院这块地丢了，东关就成了他们的。守住。", tier: "虚构",
        source: "日方要图称寺院地为「敌之有力据点」" },
      { at: "wave:6", type: "line", who: "qiu", text: "第六回了。", tier: "虚构",
        source: "全天日军对东关五至六次攻击均被击退，17 时发动第六次攻势" },
      { at: "event:BreachLost", type: "shout", who: "qiu", text: "退！往里退——别在缺口上站着！", tier: "虚构" },
      { at: "end", type: "narration", text: "日军自十六日十四时十五分突入东寨门，到十七日下午十四时才把外城肃清。光这一片关厢，打了二十四小时。", tier: "信史" },
    ],
  },

  // =========================================================================
  {
    id: "L3_Fanji",
    title: "三 · 夺回东关门",
    place: "滕县东关 · 寺院地 → 东关门 → 东门",
    date: "一九三八年三月十六日 十八时 — 二十四时",
    clock: { from: "03-16 18:00", to: "03-17 00:00" },
    sky: "night",
    bounds: "L3EastNight",
    minutes: 15,
    pool: { start: 300, end: 236, label: "城里还站着的人", presumed: true },
    objective: "摸黑在寺院地集合",
    objectives: [
      "摸黑在寺院地集合",
      "沿巷道逼近东关门",
      "夺回东关门",
      "二十一时接到放弃城外阵地的命令",
      "把伤员先送进城，最后一批从东门退入城内",
    ],
    mechanic: "夜战与白刃：夜里日军火力优势削掉一半，是全局唯一一次玩家在交换比上占便宜的时段。整局情绪高点在这里，之后一路向下。",
    brief: [
      "十八时以后，守军组织反击。",
      "城防司令张宣武亲率数十名战士，反击突入的四十余名日兵。",
    ],
    cutsceneOut: "CS_LastWire",
    beats: [
      { at: "start", type: "title", text: "夺回东关门", sub: "一九三八年三月十六日 十八时以后", tier: "主流" },
      { at: "start", type: "line", who: "zhang", text: "弟兄们，跟我上。趁天黑，把东关门夺回来。", tier: "虚构",
        source: "张宣武为真实人物；史料：亲率数十名战士反击突入的四十余名日兵，东关门失而复得" },
      { at: "delay:3.0", type: "line", who: "qiu", text: "夜里他们不敢往前压。这话是老兵传的，信不信由你——今晚咱们就当它是真的。", tier: "虚构",
        source: "「日军不敢夜战」见于张宣武回忆，标为回忆而非通则" },
      { at: "delay:5.0", type: "hint", text: "夜战：先扔后进。刺刀和大刀在这几个小时里比枪管用", tier: "提示" },
      { at: "event:GateRetaken", type: "line", who: "qiu", text: "回来了。东关门回来了。", tier: "虚构" },
      { at: "event:Order2100", type: "line", who: "zhang", text: "师长的意思——城外的阵地不要了。人全部收回城墙上。", tier: "转述",
        source: "21 时王铭章决心放弃城外阵地、集中兵力守城垣" },
      { at: "event:Order2100", type: "objective", text: "把伤员先送进城，最后一批从东门退入城内" },
      { at: "event:Order2100", type: "line", who: "yang", text: "伤的先走。抬不动的，两个人架一个。", tier: "虚构" },
      { at: "zone:EastGateIn", type: "narration", text: "二十四时前后，城外部队由西门退入城中。", tier: "主流" },
      { at: "end", type: "narration", text: "这一夜是整场仗里唯一一次交换比对咱们有利的几个小时。之后再没有过。", tier: "虚构" },
    ],
  },

  // =========================================================================
  {
    id: "L4_Chengqiang",
    title: "四 · 城墙",
    place: "滕县东城墙、东南角望楼 → 南城墙",
    date: "一九三八年三月十七日 八时 — 十五时",
    clock: { from: "03-17 08:00", to: "03-17 15:00" },
    sky: "smokyDay",
    bounds: "L4Wall",
    minutes: 20,
    pool: { start: 236, end: 178, label: "城里还站着的人", presumed: true },
    objective: "从东门旁的上城道上城",
    objectives: [
      "从东门旁的上城道上城",
      "在东南角望楼一带守住",
      "十时之后：找出弹着变准的原因",
      "试着压制城东塔上的观测（你打不掉）",
      "十四时南城墙被轰开，沿墙顶转移到南墙",
      "在南墙缺口顶到十五时",
    ],
    mechanic: "炮击观测：塔被占后落弹从随机变成「跟着你走」，玩家只能靠墙脚防空洞与炮击间隙。第二个机制是「四条上城道」的空间规则——这条规则会在下一关杀死玩家。",
    brief: [
      "全城只有四条上城道，都在城门旁边。",
      "城墙是一条只有四个出入口的高空回廊。",
    ],
    beats: [
      { at: "start", type: "title", text: "城墙", sub: "一九三八年三月十七日 八时以后", tier: "主流" },
      { at: "start", type: "line", who: "qiu", text: "记住上城的路。全城就四条，都在城门旁边。走错一条，你就下不来。", tier: "虚构",
        source: "城内上城的道路只是每座城门的旁边有一条" },
      { at: "zone:Rampart", type: "hint", text: "墙脚一排洞是防空洞。炮来了钻进去，炮停了再上墙", tier: "提示" },
      { at: "event:TowerTaken", type: "line", who: "qiu", text: "你看东边那个塔。塔顶上有人。", tier: "虚构" },
      { at: "event:TowerTaken", type: "line", who: "yang", text: "他们上了龙泉塔。从三十米高的地方给炮兵报点子。", tier: "转述",
        source: "3/17 10 时日军观测班占领城东龙泉塔，从 30 m 高处逐一报告弹着点（信史）" },
      { at: "event:TowerTaken", type: "hint", text: "炮弹从这一刻起会跟着你走。你打不掉那个塔，只能拖", tier: "提示" },
      { at: "event:SouthBreach", type: "shout", who: "runner", text: "南城墙被轰开了！七四三团那两个连顶不住——", tier: "虚构",
        source: "3/17 14 时集中炮火猛轰南城墙，第 743 团两个连防守的南关城墙被重炮轰开大缺口" },
      { at: "event:SouthBreach", type: "line", who: "yang", text: "三七〇旅的吕旅长和汪副旅长都重伤了。七四〇团王团长阵亡在东关方向。", tier: "转述",
        source: "370 旅旅长吕康、副旅长汪朝廉重伤；740 团团长王麟阵亡" },
      { at: "event:MoveToSouth", type: "hint", text: "墙上过不去的地方只能从城门旁下城，再从另一条上来", tier: "提示" },
      { at: "end", type: "narration", text: "十五时，日军巩固占领南城墙。", tier: "主流" },
    ],
  },

  // =========================================================================
  {
    id: "L5_Shizijie",
    title: "五 · 十字街",
    place: "滕县城内 · 十字街口、县衙、西门里街",
    date: "一九三八年三月十七日 十五时 — 十七时三十分",
    clock: { from: "03-17 15:00", to: "03-17 17:30" },
    sky: "burningStreet",
    bounds: "L5Crossroad",
    minutes: 16,
    pool: { start: 178, end: 96, label: "城里还站着的人", presumed: true },
    objective: "从南墙撤下来，退到十字街口",
    objectives: [
      "从南墙撤下来，退到十字街口",
      "在县衙外围收拢散兵",
      "十七时西门楼失守 —— 十字街被机枪封锁",
      "横穿西门里街（不能直着跑）",
      "到西门附近，掩护师部一行转移",
    ],
    mechanic: "视线走廊封锁：从西城门楼直到十字街口的直线走廊被一挺重机枪完全控制，第一次直着穿必死。解法要把前四关学的掏墙、烟、院墙背面全用上。",
    brief: [
      "十七时，日军夺取西城门楼，切断守军经西门通往火车站的退路。",
      "日兵占领西城门楼后，即集中火力向城中心十字街口扫射。",
    ],
    cutsceneOut: "CS_WangMingzhang",
    beats: [
      { at: "start", type: "title", text: "十字街", sub: "一九三八年三月十七日 十五时　城中心十字街口", tier: "主流" },
      { at: "start", type: "line", who: "wang", text: "弟兄们，站住脚。这儿是城心，退到这儿就不能再退了。", tier: "虚构",
        source: "承接句，称谓合规（官对兵「弟兄们」）" },
      { at: "delay:3.0", type: "line", who: "qiu", text: "师长在街当中站着呢。", tier: "虚构" },
      { at: "zone:Yamen", type: "line", who: "yang", text: "县衙这一圈还有人，把他们收拢起来。", tier: "虚构" },
      { at: "event:WestTowerLost", type: "shout", who: "runner", text: "西门楼丢了——机枪从西门里街一路扫到十字街口！", tier: "虚构",
        source: "3/17 17 时日军夺取西城门楼，占领后即集中火力向城中心十字街口扫射" },
      { at: "event:WestTowerLost", type: "hint", text: "西城门楼到十字街口是一条通视的直街。直着跑，你活不过三步", tier: "提示" },
      { at: "event:WestTowerLost", type: "hint", text: "用你在东关学的：掏墙、绕院墙背面、等火起来的烟", tier: "提示" },
      { at: "zone:WestStreet", type: "line", who: "qiu", text: "城里烧起来了。风是南边来的，烟压得低——趁烟走。", tier: "虚构",
        source: "3/17 集中炮击致城内起火，时而强劲的南风将烟吹得笼罩全城（信史）" },
      { at: "event:EscortHQ", type: "shout", who: "adjutant", text: "师长要往西关走，去车站。掩护！", tier: "虚构" },
      { at: "end", type: "narration", text: "西门通往火车站的那条路，这时候已经不在咱们手里了。", tier: "主流" },
    ],
  },

  // =========================================================================
  {
    id: "L6_Beimen",
    title: "六 · 北门",
    place: "滕县西门瓮城 → 北门里街 → 北门 → 城北麦地",
    date: "一九三八年三月十七日 二十一时 — 十八日 午",
    clock: { from: "03-17 21:00", to: "03-18 12:00" },
    sky: "night",
    bounds: "L6Breakout",
    minutes: 12,
    pool: { start: 96, end: 40, label: "城里还站着的人", presumed: true },
    objective: "跟着人流去西门",
    objectives: [
      "跟着人流去西门（挤不出去）",
      "退出瓮城，改走北门里街",
      "沿街躲避 —— 你没有子弹了",
      "帮着扒开北门的土袋",
      "出城，向北走进麦地",
    ],
    mechanic: "脱离战斗：武器栏清空、瞄准失效、HUD 只剩计时器与兵员池，唯一的动作是走和拽人。",
    brief: [
      "二十一时，幸存守城部队开始自行突围。",
      "西门瓮城的外门与内门之间，完全是人的漩涡。",
    ],
    cutsceneOut: "CS_BeimenBreakout",
    beats: [
      { at: "start", type: "title", text: "北门", sub: "一九三八年三月十七日 二十一时", tier: "主流" },
      { at: "zone:WestBarbican", type: "env", text: "外门与内门之间挤成一团。土袋封得只剩一人宽的口子。", tier: "环境" },
      { at: "zone:WestBarbican", type: "shout", who: "crowd", text: "过不去——前头堵死了——", tier: "虚构",
        source: "日军第九中队安田少尉手记：外門と内門の間は全く人の渦だ（信史）" },
      { at: "zone:WestBarbican", type: "hint", text: "你挤不出去。往回退", tier: "提示" },
      { at: "event:NoAmmo", type: "system", text: "弹药：无。", tier: "系统" },
      { at: "event:NoAmmo", type: "line", who: "qiu", text: "不打了。走北门。侯副营长在那儿扒门。", tier: "虚构" },
      { at: "zone:NorthGate", type: "line", who: "hou", text: "扒北门。一个跟一个，不许出声。", tier: "虚构",
        source: "侯子平为真实人物；史料：3 营副营长侯子平指挥扒开北城门突围" },
      { at: "zone:NorthGate", type: "hint", text: "按住 E —— 扒土袋。两只手，别嫌慢", tier: "提示" },
      { at: "event:Out", type: "line", who: "qiu", text: "出去了。别回头，往北走。", tier: "虚构" },
      { at: "end", type: "narration", text: "日军未追击。", tier: "主流" },
    ],
  },
];

// ===========================================================================
// 过场（五场）
// ===========================================================================
//
// 分镜数据结构（Script_Cutscene.mjs 是唯一消费者）：
//
//   setOrigin  [x,y,z]  这一场布景的世界原点。standalone 的场自带布景，
//                       坐标写局部值；发生在滕县城里的场把 setOrigin 设为
//                       [0,0,0]，坐标直接就是 Data_Tengxian 的世界坐标。
//   props      [{ kind, size, pos, ry, rx, mat|color, emissive, track }]
//              过场专用的一次性道具（桌子、电台、土袋、烟囱……）。
//              静态场景里已经有的东西不要在这里重复建。
//   cast       [{ id, kind, weapon, seed, track:[{t,pos,ry,state}] }]
//              t 是**过场全局时间**（秒），不是镜内时间 —— 跨镜连贯的动作
//              （一行人一直在走）写一条轨就行，不用按镜切碎。
//   shots      [{ n, seconds, focalMm, camera, subs, lines, sfx, flash, black }]
//              camera.from/to 是机位，look/lookTo 是被摄物；只给 from/look
//              就是固定机位。ease 见 Script_Cutscene 的 EASINGS。
//              **focalMm 是 35 mm 等效焦距**，Script_Cutscene 换算成垂直 FOV，
//              分镜表上写多少这里就写多少，不许直接写 fov 度数。
//
// 时长是硬约束：设计书给了每场的总秒数与每镜秒数，shots 的 seconds 之和
// 必须等于 seconds。Script_Cutscene 的 ValidateCutscene() 会核对，对不上就抛。

export const CUTSCENES = {
  // =========================================================================
  CS_Chuchuan: {
    id: "CS_Chuchuan",
    title: "出川",
    seconds: 38.0,
    trigger: "beforeLevel:L0_Jiehe",
    sky: "overcast",
    // 1937 年秋的川陕道上，不在滕县地图内 —— 自带布景，摆在离城很远的地方，
    // 免得和城的碰撞体、导航格、灯光探针撞上。
    standalone: true,
    setOrigin: [4000, 0, 4000],
    why: "让玩家在第一颗子弹之前就知道：这支部队是被推来推去才到这里的。装备差不是设定，是历史。",
    // 全场不给脸 —— 既是分镜要求，也顺带避免了给虚构人物做定妆。
    props: [
      { kind: "plane", size: [26, 140], pos: [0, 0.01, -20], mat: "Ground", name: "土路" },
      // 山口：两侧的坡。只做剪影体块，不做实体山。
      // 山口的两个坡。原来摆在 z=-46/-52，结果在镜 1、镜 2 里当了一堵黑墙 ——
      // 推到 -78/-86 之后，近景两镜里它只是天边的一线，镜 3 仰拍时仍然成口。
      { kind: "box", size: [56, 30, 70], pos: [-40, -6, -78], ry: 0.22, color: 0x8a8272, name: "山坡西" },
      { kind: "box", size: [56, 26, 70], pos: [40, -7, -86], ry: -0.18, color: 0x807969, name: "山坡东" },
      // 车站月台与闷罐车。站牌被人挡住只露半个字 —— 牌面朝向刻意背光。
      { kind: "box", size: [22, 0.9, 6.0], pos: [0, 0.45, 14], color: 0x8d8677, name: "月台" },
      { kind: "box", size: [13, 3.0, 3.0], pos: [-7, 2.0, 17.6], mat: "WoodBeam", name: "闷罐车厢" },
      { kind: "box", size: [13, 3.0, 3.0], pos: [8, 2.0, 17.6], mat: "WoodBeam", name: "闷罐车厢二" },
      { kind: "box", size: [0.10, 1.1, 0.7], pos: [4.0, 1.6, 13.2], color: 0x3d3a34, name: "站牌" },
      // 车厢内壁：inside:true → 材质翻成 BackSide。不这么做的话，摄影机进了车厢
      // 就从背面穿过去（默认 FrontSide 剔除背面），镜 6 的「全黑」会变成大白天。
      { kind: "box", size: [12.6, 2.7, 2.7], pos: [-7, 1.95, 17.6], color: 0x1a1712, inside: true, name: "车厢内壁" },
      // 车厢内那条门缝的光。做成不透明的自发光薄板，别做加性贴片 ——
      // 加性/半透明的东西要 MarkNoPrepass，能不建就不建。
      { kind: "box", size: [0.06, 1.5, 0.16], pos: [-1.2, 1.55, 16.15], color: 0xd9cfae, emissive: 0xbdae86,
        light: { color: 0xffeccc, intensity: 5.0, distance: 6.0 }, name: "门缝光" },
    ],
    // ★ 轨道速度必须与 state.moveSpeed 对得上：Actor 的步频按 moveSpeed×4.2 m/s 算，
    //   轨道走得比它快就是滑步，慢就是踏步不前进。下面每条轨的位移都按 1.26 m/s
    //   （moveSpeed 0.30，正常行军）反算过。改坐标就得跟着改 moveSpeed。
    // ★ 镜与镜之间要「换场」的人，中间必须插一帧 hidden:true 的关键帧 ——
    //   否则插值会让他在两个机位之间以几十米每秒的速度横穿画面。
    cast: [
      // 十一个人 —— 分镜要求「数得清，11 双脚」。六个走镜 1/2，三个补镜 3 的队尾，
      // 镜 4 的掉队兵与拽他的人合起来正好十一。
      // 每三人里有一人空着手（weapon:null）：日方记川军三分之一以上没有步枪。
      { id: "m1", kind: "nra", weapon: "HanYang", seed: "chu1", track: [
        { t: 0.0, pos: [-0.8, 0, 6.0], ry: 0, state: { moveSpeed: 0.30 } },
        { t: 11.0, pos: [-0.8, 0, -7.9], ry: 0, state: { moveSpeed: 0.30 } },
        { t: 11.2, pos: [-0.8, 0, -8.2], ry: 0, state: { hidden: true } },
        { t: 23.9, pos: [-2.6, 0, 12.5], ry: 0.5, state: { hidden: true } },
        { t: 24.0, pos: [-2.6, 0, 12.5], ry: 0.5, state: { moveSpeed: 0.17 } },
        { t: 31.0, pos: [-5.5, 0, 16.4], ry: 0.9, state: { moveSpeed: 0.17 } },
      ] },
      { id: "m2", kind: "nra", weapon: null, seed: "chu2", track: [
        { t: 0.0, pos: [0.8, 0, 8.0], ry: 0, state: { moveSpeed: 0.30 } },
        { t: 11.0, pos: [0.8, 0, -5.9], ry: 0, state: { moveSpeed: 0.30 } },
        { t: 11.2, pos: [0.8, 0, -6.2], ry: 0, state: { hidden: true } },
        { t: 23.9, pos: [-1.1, 0, 13.6], ry: 0.5, state: { hidden: true } },
        { t: 24.4, pos: [-1.1, 0, 13.6], ry: 0.5, state: { moveSpeed: 0.17 } },
        { t: 31.0, pos: [-4.0, 0, 16.6], ry: 0.9, state: { moveSpeed: 0.17 } },
      ] },
      { id: "m3", kind: "nra", weapon: "HanYang", seed: "chu3", track: [
        { t: 0.0, pos: [-0.7, 0, 10.5], ry: 0, state: { moveSpeed: 0.30 } },
        { t: 11.0, pos: [-0.7, 0, -3.4], ry: 0, state: { moveSpeed: 0.30 } },
        { t: 11.2, pos: [-0.7, 0, -3.7], ry: 0, state: { hidden: true } },
        { t: 23.9, pos: [0.4, 0, 13.2], ry: 0.5, state: { hidden: true } },
        { t: 24.8, pos: [0.4, 0, 13.2], ry: 0.5, state: { moveSpeed: 0.17 } },
        { t: 31.5, pos: [-2.6, 0, 16.6], ry: 0.9, state: { moveSpeed: 0.17 } },
      ] },
      { id: "m4", kind: "nra", weapon: "HanYang", seed: "chu4", track: [
        { t: 0.0, pos: [0.9, 0, 13.0], ry: 0, state: { moveSpeed: 0.30 } },
        { t: 11.0, pos: [0.9, 0, -0.9], ry: 0, state: { moveSpeed: 0.30 } },
        { t: 11.2, pos: [0.9, 0, -1.2], ry: 0, state: { hidden: true } },
        { t: 23.9, pos: [1.8, 0, 13.0], ry: 0.5, state: { hidden: true } },
        { t: 25.2, pos: [1.8, 0, 13.0], ry: 0.5, state: { moveSpeed: 0.17 } },
        { t: 32.0, pos: [-1.2, 0, 16.6], ry: 0.9, state: { moveSpeed: 0.17 } },
      ] },
      { id: "m5", kind: "nra", weapon: null, seed: "chu5", track: [
        { t: 0.0, pos: [-0.9, 0, 15.5], ry: 0, state: { moveSpeed: 0.30 } },
        { t: 11.0, pos: [-0.9, 0, 1.6], ry: 0, state: { moveSpeed: 0.30 } },
        { t: 11.2, pos: [-0.9, 0, 1.3], ry: 0, state: { hidden: true } },
        { t: 23.9, pos: [3.1, 0, 13.0], ry: 0.5, state: { hidden: true } },
        { t: 25.6, pos: [3.1, 0, 13.0], ry: 0.5, state: { moveSpeed: 0.17 } },
        { t: 32.4, pos: [0.2, 0, 16.6], ry: 0.9, state: { moveSpeed: 0.17 } },
      ] },
      { id: "m6", kind: "nra", weapon: "HanYang", seed: "chu6", track: [
        { t: 0.0, pos: [0.7, 0, 18.0], ry: 0, state: { moveSpeed: 0.30 } },
        { t: 11.0, pos: [0.7, 0, 4.1], ry: 0, state: { moveSpeed: 0.30 } },
        { t: 11.2, pos: [0.7, 0, 3.8], ry: 0, state: { hidden: true } },
        { t: 23.9, pos: [4.4, 0, 13.0], ry: 0.5, state: { hidden: true } },
        { t: 26.0, pos: [4.4, 0, 13.0], ry: 0.5, state: { moveSpeed: 0.17 } },
        { t: 32.8, pos: [1.6, 0, 16.6], ry: 0.9, state: { moveSpeed: 0.17 } },
      ] },
      // 镜 3 的队尾：山口里从画面右下走向左上，队尾没有尽头。
      // 走向 = 远离机位偏左，yaw = atan2(-dx, -dz)（Actor 的正面是局部 -Z）。
      { id: "t1", kind: "nra", weapon: null, seed: "chu7", track: [
        { t: 10.8, pos: [7.5, 0, -6.0], ry: 0.31, state: { hidden: true } },
        { t: 11.0, pos: [7.5, 0, -6.0], ry: 0.31, state: { moveSpeed: 0.30 } },
        { t: 17.0, pos: [5.2, 0, -13.2], ry: 0.31, state: { moveSpeed: 0.30 } },
        { t: 17.2, pos: [5.2, 0, -13.3], ry: 0.31, state: { hidden: true } },
      ] },
      { id: "t2", kind: "nra", weapon: "HanYang", seed: "chu8", track: [
        { t: 10.8, pos: [9.0, 0, -2.0], ry: 0.31, state: { hidden: true } },
        { t: 11.0, pos: [9.0, 0, -2.0], ry: 0.31, state: { moveSpeed: 0.30 } },
        { t: 17.0, pos: [6.7, 0, -9.2], ry: 0.31, state: { moveSpeed: 0.30 } },
        { t: 17.2, pos: [6.7, 0, -9.3], ry: 0.31, state: { hidden: true } },
      ] },
      { id: "t3", kind: "nra", weapon: "HanYang", seed: "chu9", track: [
        { t: 10.8, pos: [10.5, 0, 2.0], ry: 0.31, state: { hidden: true } },
        { t: 11.0, pos: [10.5, 0, 2.0], ry: 0.31, state: { moveSpeed: 0.30 } },
        { t: 17.0, pos: [8.2, 0, -5.2], ry: 0.31, state: { moveSpeed: 0.30 } },
        { t: 17.2, pos: [8.2, 0, -5.3], ry: 0.31, state: { hidden: true } },
      ] },
      // 镜 4：掉队的兵蹲下解绑带，一只手伸进画面把他拽起来。
      // 「一只手」在这里就是另一个兵的整只手臂 —— 长焦浅景深下画面里也只看得见手。
      { id: "lag", kind: "nra", weapon: null, seed: "chuLag", track: [
        { t: 16.9, pos: [0.75, 0, 1.60], ry: 2.4, state: { hidden: true } },
        { t: 17.0, pos: [0.75, 0, 1.55], ry: 2.4, state: { moveSpeed: 0, crouch: 0.95 } },
        { t: 21.6, pos: [0.75, 0, 1.50], ry: 2.4, state: { moveSpeed: 0, crouch: 0.95 } },
        { t: 23.2, pos: [0.75, 0, 1.50], ry: 2.2, state: { moveSpeed: 0, crouch: 0.10 } },
        { t: 23.9, pos: [0.70, 0, 1.35], ry: 2.0, state: { moveSpeed: 0.20, crouch: 0 } },
        { t: 24.1, pos: [0.70, 0, 1.30], ry: 2.0, state: { hidden: true } },
      ] },
      { id: "hand", kind: "nra", weapon: null, seed: "chuHand", track: [
        { t: 16.9, pos: [4.30, 0, 2.30], ry: 3.9, state: { hidden: true } },
        { t: 17.0, pos: [4.30, 0, 2.30], ry: 3.9, state: { moveSpeed: 0.20 } },
        { t: 21.0, pos: [1.45, 0, 1.25], ry: 3.9, state: { moveSpeed: 0 } },
        { t: 22.2, pos: [1.38, 0, 1.30], ry: 3.9, state: { moveSpeed: 0, melee: 0.6 } },
        { t: 23.9, pos: [1.50, 0, 1.10], ry: 3.6, state: { moveSpeed: 0.18 } },
        { t: 24.1, pos: [1.50, 0, 1.05], ry: 3.6, state: { hidden: true } },
      ] },
      // 镜 6：车厢内一排排脸。光扫到最后一张脸时定住 —— 「扫」由灯的位移做，
      // 人只是坐着（crouch 拉满当坐姿用，Actor 没有专门的坐姿）。
      { id: "s1", kind: "nra", weapon: null, seed: "chuS1", track: [
        { t: 30.0, pos: [-5.4, 0.6, 17.0], ry: 1.57, state: { crouch: 1, moveSpeed: 0 } },
      ] },
      { id: "s2", kind: "nra", weapon: null, seed: "chuS2", track: [
        { t: 30.0, pos: [-6.8, 0.6, 17.0], ry: 1.57, state: { crouch: 1, moveSpeed: 0 } },
      ] },
      { id: "s3", kind: "nra", weapon: null, seed: "chuS3", track: [
        { t: 30.0, pos: [-8.2, 0.6, 17.0], ry: 1.57, state: { crouch: 1, moveSpeed: 0 } },
      ] },
      { id: "s4", kind: "nra", weapon: null, seed: "chuS4", track: [
        { t: 30.0, pos: [-9.6, 0.6, 17.0], ry: 1.57, state: { crouch: 1, moveSpeed: 0 } },
      ] },
    ],
    shots: [
      {
        n: 1, seconds: 5.0, focalMm: 50,
        note: "固定，贴地 30 cm，仰角 8°：一双草鞋踩过冻硬的土路，绑腿散着一截。脚一双接一双走出画面",
        // 机位摆在两列人当中、贴地 0.30 m，仰角 8°（Δy 0.35 / 前 2.5 m）。
        // **距离决定了拍到腰以下还是全身**：50 mm 在 2.5 m 处画幅高 1.2 m，
        // 从地面往上刚好到胯。原来摆在 8.7 m 外，拍出来是六个全身人像，
        // 和「一双草鞋踩过土路」完全是两回事。
        camera: { from: [0.0, 0.30, 1.0], look: [0.0, 0.65, 3.5] },
        sfx: [
          { at: 0.2, name: "footstepDirt", volume: 0.5 },
          { at: 1.0, name: "footstepDirt", volume: 0.42 },
          { at: 1.8, name: "footstepDirt", volume: 0.5 },
          { at: 2.6, name: "footstepDirt", volume: 0.4 },
          { at: 3.4, name: "footstepDirt", volume: 0.48 },
          { at: 4.2, name: "footstepDirt", volume: 0.4 },
        ],
        subs: [{ at: 0.8, seconds: 3.6, tier: "主流", text: "一九三七年九月，川军出成都，徒步一千四百余公里北上。" }],
      },
      {
        n: 2, seconds: 6.0, focalMm: 35,
        note: "侧移轨横移 6 m，与队列平行：行军纵队的侧影，不给脸。斜背的步枪、竹斗笠、腰上一圈布袋",
        camera: { from: [9.0, 1.45, 12.0], to: [9.0, 1.45, 6.0], look: [0.0, 1.15, 12.0], lookTo: [0.0, 1.15, 6.0], ease: "linear" },
      },
      {
        n: 3, seconds: 6.0, focalMm: 24,
        note: "手持仰拍：山口。队伍从画面右下走向左上，队尾没有尽头",
        camera: { from: [4.2, 0.85, 9.0], look: [-5.0, 5.0, -22.0], shake: 0.55 },
        subs: [{ at: 0.6, seconds: 4.6, tier: "主流", text: "十月，娘子关。一周损失过半。此后第二战区不给补充，转入第一战区亦遭嫌弃。" }],
      },
      {
        n: 4, seconds: 7.0, focalMm: 85,
        note: "固定长焦，浅景深：一个掉队的兵蹲下解绑带，脚跟磨破了。一只手伸进画面把他拽起来",
        camera: { from: [5.2, 1.05, -2.6], look: [0.75, 0.62, 1.5] },
        lines: [{ at: 3.4, seconds: 2.6, who: "qiu", off: true, tier: "虚构", text: "起来。走到了就有饭。" }],
      },
      {
        n: 5, seconds: 7.0, focalMm: 35,
        note: "俯拍，高 12 m 缓降到 6 m：车站月台，闷罐车门推开，队伍上车。站牌被人挡住，只露半个字",
        camera: { from: [12.0, 12.0, 26.0], to: [8.5, 6.0, 21.5], look: [-1.0, 1.6, 15.0], ease: "easeInOut" },
        subs: [{ at: 0.8, seconds: 5.0, tier: "主流", text: "一九三八年初，第二十二集团军划归第五战区，开赴鲁南津浦路正面。" }],
      },
      {
        n: 6, seconds: 7.0, focalMm: 24,
        note: "车厢内固定，广角：全黑，只有门缝一条光横过一排排脸。光扫到最后一张脸时定住 1.5 s，黑场",
        camera: { from: [-3.4, 1.35, 17.0], look: [-10.0, 1.25, 17.2] },
        // 门缝的光横着扫过去：把那块自发光薄板从车头推到车尾，最后 1.5 秒停住。
        propMoves: [{ name: "门缝光", from: [-1.2, 1.55, 16.15], to: [-10.2, 1.55, 16.15], startAt: 0.4, endAt: 5.5, ease: "easeOut" }],
        blackOutAt: 6.4,
      },
    ],
    // 跳过后仍要把史实补出来 —— 信息不许因为跳过而丢失。
    skipCard: {
      title: "出川",
      lines: [
        { tier: "主流", text: "一九三七年九月，川军出成都，徒步一千四百余公里北上。" },
        { tier: "主流", text: "十月，娘子关。一周损失过半。此后第二战区不给补充，转入第一战区亦遭嫌弃。" },
        { tier: "主流", text: "一九三八年初，第二十二集团军划归第五战区，开赴鲁南津浦路正面。" },
      ],
    },
    // 绝不引用「抗日无力扰民有余」「土匪部队」「诸葛亮还扎草人当疑兵」这三句 ——
    // 均只见于通俗读物与网文，未见 1937—38 年文件或当事人同时代记录背书。
    // 川军被推诿的事实框架可用，这几句对白不可用。
    forbiddenLines: ["抗日无力，扰民有余", "土匪部队", "诸葛亮还扎草人当疑兵"],
  },

  // =========================================================================
  CS_LiZongrenTang: {
    id: "CS_LiZongrenTang",
    title: "李宗仁电联汤恩伯",
    seconds: 26.0,
    trigger: "beforeLevel:L1_Beishahe",
    sky: "night",
    standalone: true,
    setOrigin: [8000, 0, 8000],
    why: "价值不在于「告诉玩家援军为什么不来」，而在于让玩家亲眼看见：命令确实下过、时间确实很紧、车确实在开。之后所有「等不到人」的感受，就都不是控诉，而是信息不对称本身。",
    // ★ 红线：全场无角色开口、无一张脸、无评价性形容词，只有电文与时刻。
    //   不出现汤恩伯的脸，不出现「见死不救」，也不出现替其开脱的话。
    //   学界两说（《李宗仁回忆录》口径 vs 近年据第 20 军团战斗详报的研究）都不下判决；
    //   1938 年 4 月 6 日国民政府褒扬令还写着「卒待援军到达」。
    //   玩家是城里的兵，本来也不知道外围为什么不来。
    silent: true,
    props: [
      // 徐州长官部：桌面。台灯是唯一光源。
      // 近景桌面一律用纯色，不用 WoodBeam：BoxGeometry 的 UV 是每面 0—1，
      // 一张木纹铺满 2.2 m 的桌面，微距一拍就是一片水波纹。
      { kind: "box", size: [2.2, 0.06, 1.1], pos: [0, 0.78, 0], color: 0x4a3a28, name: "长官部桌面" },
      { kind: "box", size: [0.10, 0.75, 0.10], pos: [-0.75, 0.40, -0.20], color: 0x3d3122, name: "桌腿" },
      { kind: "box", size: [0.30, 0.02, 0.22], pos: [0.02, 0.812, 0.02], color: 0xcfc7b2, name: "电文稿" },
      { kind: "box", size: [0.30, 0.02, 0.22], pos: [-0.02, 0.834, -0.02], color: 0xd6cebb, name: "电文稿二" },
      { kind: "cyl", size: [0.09, 0.34], pos: [-0.55, 0.95, -0.18], color: 0x2f2b26, name: "台灯罩" },
      { kind: "cyl", size: [0.055, 0.10], pos: [-0.55, 0.83, -0.18], color: 0xd8c58c, emissive: 0xc0a468,
        light: { color: 0xffd2a0, intensity: 3.2, distance: 4.5, offsetY: 0.05 }, name: "台灯泡" },
      // 临城站台：电话机 + 站台。仍不见脸。
      { kind: "plane", size: [30, 18], pos: [0, 0.01, -30], mat: "Ground", name: "站台地面" },
      { kind: "box", size: [1.4, 0.05, 0.7], pos: [0, 1.02, -30.0], color: 0x4a3a28, name: "站台桌" },
      { kind: "box", size: [0.24, 0.30, 0.16], pos: [0, 1.19, -30.05], mat: "WoodBeam", name: "电话机" },
      { kind: "cyl", size: [0.03, 0.16], pos: [0.15, 1.14, -30.05], ry: 0, rx: 1.57, color: 0x3a342e, name: "摇柄" },
      { kind: "box", size: [0.26, 0.02, 0.19], pos: [-0.28, 1.055, -29.92], color: 0xd2c9b6, name: "临城电文稿" },
      // 夜里开过的闷罐车：逆光剪影，看不清里面有多少人。
      { kind: "box", size: [13, 3.0, 3.0], pos: [22, 2.0, -50], mat: "WoodBeam", name: "夜车一" },
      { kind: "box", size: [13, 3.0, 3.0], pos: [37, 2.0, -50], mat: "WoodBeam", name: "夜车二" },
      { kind: "box", size: [13, 3.0, 3.0], pos: [52, 2.0, -50], mat: "WoodBeam", name: "夜车三" },
    ],
    cast: [
      // 「一只手把电文稿推过来」—— 只有手。人整个站在画外，靠机位裁掉。
      // Actor 没有单独的手，只能把人压到 crouch≈0.9 让小臂落到桌面高度，
      // 再用 melee 把手臂甩向桌心 —— 这是白盒近似，不是最终演出。
      { id: "hand", kind: "nra", weapon: null, seed: "xuzhou", track: [
        { t: 0.0, pos: [0.40, 0, 0.42], ry: 3.85, state: { crouch: 0.9, moveSpeed: 0 } },
        { t: 1.6, pos: [0.32, 0, 0.34], ry: 3.85, state: { crouch: 0.9, moveSpeed: 0, melee: 0.6 } },
        { t: 3.4, pos: [0.40, 0, 0.42], ry: 3.85, state: { crouch: 0.9, moveSpeed: 0 } },
      ] },
    ],
    shots: [
      {
        n: 1, seconds: 4.0, focalMm: 50,
        note: "固定，俯角 30°：徐州长官部的桌面。一只手把电文稿推过来。台灯是唯一光源。只有纸与手",
        // 俯角实算：Δy 0.75 / 水平 1.40 = 28.2°，与分镜的 30° 同一档。
        camera: { from: [0.0, 1.55, 1.45], look: [0.0, 0.80, 0.05] },
        sfx: [{ at: 1.5, name: "impactWood", volume: 0.18 }],
      },
      {
        n: 2, seconds: 5.0, focalMm: 85,
        note: "微距特写，浅景深：电文稿上的字逐行显影 —— 时刻与命令",
        camera: { from: [0.0, 1.02, 0.42], look: [0.0, 0.80, 0.02] },
        subs: [
          { at: 0.3, seconds: 4.4, tier: "主流", text: "三月十四日 十七时　第五战区电令第二十军团：调第八十五军一个整师至滕县附近，作预备队。",
            small: "另一版本记原文为「第四师先头之一部，应即开滕县附近增援」。两版并列。" },
        ],
      },
      {
        n: 3, seconds: 4.0, focalMm: 50, cut: "hard",
        note: "硬切，固定中景，侧光：临城站台的电话机，摇柄在转。背景是列车蒸汽。仍不见脸",
        camera: { from: [1.55, 1.28, -28.55], look: [0.0, 1.14, -30.0] },
        subs: [
          { at: 0.2, seconds: 3.6, tier: "主流", text: "三月十四日 二十一时　电话：第八十五军经徐州向临城输送，务必于十七日拂晓前到达。" },
        ],
      },
      {
        n: 4, seconds: 5.0, focalMm: 85,
        note: "微距特写：另一张纸，另一个时刻与命令",
        camera: { from: [-0.10, 1.30, -29.32], look: [-0.28, 1.06, -29.92] },
        subs: [
          { at: 0.2, seconds: 2.2, tier: "主流", text: "三月十五日　第八十五军第四师先头一团在临城站下车，随即投入战斗。" },
          { at: 2.6, seconds: 2.3, tier: "主流", text: "三月十六日 十六时　再令：一部支援滕县城防，主力由铁道以东向邹县迂回攻击。" },
        ],
      },
      {
        n: 5, seconds: 5.0, focalMm: 135,
        note: "固定，逆光剪影，长焦：一列闷罐车在夜里开过，车门开着，看不清里面有多少人",
        camera: { from: [-24.0, 2.6, -50.0], look: [10.0, 2.3, -50.0] },
        propMoves: [
          { name: "夜车一", from: [22, 2.0, -50], to: [-4, 2.0, -50], startAt: 0, endAt: 5.0, ease: "linear" },
          { name: "夜车二", from: [37, 2.0, -50], to: [11, 2.0, -50], startAt: 0, endAt: 5.0, ease: "linear" },
          { name: "夜车三", from: [52, 2.0, -50], to: [26, 2.0, -50], startAt: 0, endAt: 5.0, ease: "linear" },
        ],
      },
      {
        n: 6, seconds: 3.0, focalMm: 50, black: true,
        note: "黑场，一行字幕",
        camera: { from: [0, 1.4, -60], look: [0, 1.4, -70] },
        subs: [{ at: 0.4, seconds: 2.4, tier: "叙述", text: "城里的人不知道这些。" }],
      },
    ],
    skipCard: {
      title: "命令与时刻",
      lines: [
        { tier: "主流", text: "三月十四日 十七时　第五战区电令第二十军团：调第八十五军一个整师至滕县附近，作预备队。" },
        { tier: "主流", text: "（另一版本记原文为「第四师先头之一部，应即开滕县附近增援」。两版并列。）" },
        { tier: "主流", text: "三月十四日 二十一时　电话：第八十五军经徐州向临城输送，务必于十七日拂晓前到达。" },
        { tier: "主流", text: "三月十五日　第八十五军第四师先头一团在临城站下车，随即投入战斗。" },
        { tier: "主流", text: "三月十六日 十六时　再令：一部支援滕县城防，主力由铁道以东向邹县迂回攻击。" },
        { tier: "叙述", text: "城里的人不知道这些。" },
      ],
    },
    forbiddenLines: ["见死不救", "拥兵自重", "避战不前"],
  },

  // =========================================================================
  CS_LastWire: {
    id: "CS_LastWire",
    title: "最后一电",
    seconds: 22.0,
    trigger: "afterLevel:L3_Fanji",
    sky: "night",
    // 城内师部。**师部在城内哪一处无载** —— 摆在县衙西侧的一进院里，位置为推定。
    // （只知道师部原设城外电灯厂，16 日接死守命令后迁入城内。）
    standalone: true,
    setOrigin: [200, 0, -45],
    why: "全局唯一一次把「必然陷落」从守军自己嘴里说出来。放在刚夺回东关门、玩家情绪最高的那一刻，高点与判决书叠在一起。",
    props: [
      { kind: "plane", size: [7.0, 6.0], pos: [0, 0.02, 0], mat: "Ground", name: "屋内地面" },
      { kind: "box", size: [1.30, 0.05, 1.30], pos: [0.35, 0.79, -0.35], color: 0x4a3a28, name: "八仙桌" },
      { kind: "box", size: [0.11, 0.77, 0.11], pos: [0.90, 0.39, 0.15], color: 0x3d3122, name: "桌腿" },
      { kind: "box", size: [0.46, 0.26, 0.32], pos: [0.20, 0.945, -0.55], color: 0x54432e, name: "电台木壳" },
      { kind: "box", size: [0.09, 0.03, 0.07], pos: [0.05, 0.83, -0.20], color: 0x3a342e, name: "电键" },
      { kind: "box", size: [0.26, 0.02, 0.19], pos: [0.62, 0.822, -0.28], color: 0xd2c9b6, name: "电文纸" },
      { kind: "cyl", size: [0.05, 0.14], pos: [0.78, 0.88, -0.72], color: 0xd8c58c, emissive: 0xc09a58,
        light: { color: 0xffbe78, intensity: 7.0, distance: 7.0, offsetY: 0.06 }, name: "油灯" },
      // 窗纸：被外面的炮震得抖。做成一整块不透明薄板，靠位移抖动，不做半透明。
      { kind: "box", size: [1.30, 1.00, 0.03], pos: [0.35, 1.35, -1.60], color: 0xc8bfa6, emissive: 0x151310, name: "窗纸" },
      { kind: "box", size: [7.0, 2.8, 0.22], pos: [0, 1.40, -1.75], mat: "BrickWall", name: "北墙" },
      { kind: "box", size: [0.22, 2.8, 6.0], pos: [-2.6, 1.40, 0], mat: "BrickWall", name: "西墙" },
    ],
    cast: [
      // 王铭章：**只见背影与右手**。全场不给脸。
      { id: "wang", kind: "nra", weapon: null, seed: "wangLastWire", track: [
        { t: 0.0, pos: [-0.15, 0, -0.15], ry: 0.79, state: { moveSpeed: 0 } },
        { t: 5.0, pos: [-0.15, 0, -0.15], ry: 0.79, state: { moveSpeed: 0 } },
        { t: 15.0, pos: [-0.55, 0, -0.30], ry: 0.55, state: { moveSpeed: 0 } },
        { t: 16.2, pos: [-0.80, 0, -0.42], ry: 0.45, state: { moveSpeed: 0, melee: 0.7 } },
        { t: 18.0, pos: [-0.85, 0, -0.45], ry: 0.45, state: { moveSpeed: 0 } },
      ] },
      // 赵渭滨（第 122 师参谋长，真实人物，同日殉国）在旁记录。
      { id: "zhao", kind: "nra", weapon: null, seed: "zhaoWeibin", track: [
        { t: 0.0, pos: [0.95, 0, -0.05], ry: 2.10, state: { moveSpeed: 0, crouch: 0.15 } },
        { t: 11.0, pos: [0.95, 0, -0.05], ry: 2.10, state: { moveSpeed: 0, crouch: 0.18 } },
      ] },
      { id: "radioman", kind: "nra", weapon: null, seed: "radioman", track: [
        { t: 0.0, pos: [-0.05, 0, 0.42], ry: 3.24, state: { moveSpeed: 0, crouch: 0.30 } },
        { t: 16.0, pos: [-0.05, 0, 0.42], ry: 3.24, state: { moveSpeed: 0, crouch: 0.30 } },
      ] },
    ],
    shots: [
      {
        n: 1, seconds: 5.0, focalMm: 40,
        note: "固定中景，侧逆光，油灯：八仙桌上一部电台。王铭章背对镜头站着（只见背影与右手），参谋长赵渭滨在旁记录",
        camera: { from: [2.55, 1.62, 2.70], look: [0.22, 1.02, -0.12] },
        lines: [{ at: 1.0, seconds: 3.4, who: "wang", tier: "虚构", text: "弟兄们打到这一步了。电报就一句。" }],
        sfx: [{ at: 3.6, name: "explosionFar", volume: 0.30 }],
      },
      {
        n: 2, seconds: 6.0, focalMm: 85,
        note: "越肩，压过赵渭滨的笔尖：纸上一笔一笔写出八个字，笔尖在最后一字上顿住",
        camera: { from: [1.32, 1.28, 0.28], look: [0.62, 0.83, -0.28] },
        subs: [
          { at: 0.6, seconds: 4.6, tier: "主流", text: "决心死拼，以报国家。", big: true },
        ],
      },
      {
        n: 3, seconds: 5.0, focalMm: 85,
        note: "微距特写：报务员手指敲键。窗纸被外面的炮震得抖",
        camera: { from: [-0.42, 1.06, 0.18], look: [0.05, 0.83, -0.20] },
        propMoves: [
          // 炮把窗纸震得抖：一来一回，幅度 2 cm。
          { name: "窗纸", from: [0.35, 1.35, -1.60], to: [0.35, 1.33, -1.62], startAt: 1.2, endAt: 1.35, ease: "linear" },
          { name: "窗纸", from: [0.35, 1.33, -1.62], to: [0.35, 1.35, -1.60], startAt: 1.35, endAt: 1.8, ease: "easeOut" },
        ],
        sfx: [{ at: 1.0, name: "explosionFar", volume: 0.36 }],
        subs: [
          { at: 0.4, seconds: 4.2, tier: "主流", small: true,
            text: "长版另作：「职忆委座成仁之训，及开封面谕嘉慰之词，决心死拼，以报国家，以报知遇。职王铭章叩铣。」「铣」为电报韵目代日，即十六日。" },
        ],
      },
      {
        n: 4, seconds: 4.0, focalMm: 24,
        note: "低机位仰拍：一只脚踩下去，电台木壳裂开。不给全景，不给表情",
        // 只给脚与裂开的木壳 —— 「砸电台」是主流记载而非信史，所以不给表情、不给全景。
        // 电台先从桌上被掀到地上（脚踩得着的高度），再挨那一脚。
        camera: { from: [-1.35, 0.20, 0.30], look: [-0.84, 0.36, -0.44] },
        propMoves: [
          { name: "电台木壳", from: [0.20, 0.945, -0.55], to: [-0.84, 0.14, -0.44], startAt: 0, endAt: 0.30, ease: "easeIn" },
        ],
        sfx: [{ at: 1.4, name: "impactWood", volume: 0.7 }, { at: 1.5, name: "impactMetal", volume: 0.4 }],
        subs: [{ at: 2.0, seconds: 1.9, tier: "主流", small: true, text: "另有记载称，发完此电后下令砸毁电台。" }],
      },
      {
        n: 5, seconds: 2.0, focalMm: 50, black: true,
        note: "黑场，字幕",
        camera: { from: [0, 1.4, 4], look: [0, 1.4, 0] },
        subs: [{ at: 0.2, seconds: 1.6, tier: "主流", small: true, text: "电文原件未见公布，短句与长版都靠转引，用字各版本不一致（死拼／死拚）。" }],
      },
    ],
    skipCard: {
      title: "最后一电",
      lines: [
        { tier: "主流", text: "决心死拼，以报国家。" },
        { tier: "主流", text: "长版另作：「职忆委座成仁之训，及开封面谕嘉慰之词，决心死拼，以报国家，以报知遇。职王铭章叩铣。」「铣」为电报韵目代日，即十六日。" },
        { tier: "主流", text: "另有记载称，发完此电后下令砸毁电台。" },
        { tier: "主流", text: "电文原件未见公布，短句与长版都靠转引，用字各版本不一致（死拼／死拚）。" },
      ],
    },
    // 近年文章引述的「本日已无友军枪声」一句未见出处，属流传待考，**本作不采用**。
    forbiddenLines: ["本日已无友军枪声"],
  },

  // =========================================================================
  CS_WangMingzhang: {
    id: "CS_WangMingzhang",
    title: "王铭章殉国",
    seconds: 36.0,
    trigger: "afterLevel:L5_Shizijie",
    sky: "burningStreet",
    // 发生在滕县城里与西关，坐标直接就是 Data_Tengxian 的世界坐标。
    standalone: false,
    setOrigin: [0, 0, 0],
    why: "必须做成「一个人走在路上，然后不走了」——不是英雄谢幕，是一支部队失去指挥的那一秒。",

    // =======================================================================
    // ★★★ 红线：按阵亡演，不许改回举枪自尽。★★★
    //
    // 理由要说对，免得以后有人「纠正」回去：
    //
    //   自尽说**不是电影编的**。它恰恰是 1938 年 3 月 21 日中央社电讯的最早版本
    //   （王铭章在城中心十字街指挥中弹、其后自戕），1986 年电影《血战台儿庄》
    //   演城头举枪自戕，承袭的正是这个 1938 年的官方口径。
    //   所以「自尽说是后人杜撰」这个理由是**错的**，不许拿它当依据。
    //
    //   本作取城外中弹一说，依据是史源层累里更晚、但更硬的三层：
    //     · 1938 年 11 月《王铭章墓志》已把「自戕」改口为「负伤仍指挥杀敌，身中数弹」；
    //     · 1983 年起张宣武（时任 727 团团长、滕县城防司令）回忆记为缒城后城外中弹；
    //     · 2009 年起家属（遗孀叶亚华、三子王道纲等）**公开否认自杀说**，
    //       称血衣拿回时腹部有七个枪眼。
    //   另有姜克实（冈山大学）指出日军打扫战场未发现王铭章尸体，可反证其未死在城内。
    //
    //   一句话：**两说并列时取「家属公开否认 + 1938 年 11 月墓志改口」的那一说。**
    //   不是因为自尽说必假，而是因为写成中弹阵亡在史料上风险最低，
    //   且不与任何一层史源正面冲突。
    //
    //   **画面上不许出现任何一帧枪口对着自己。** 镜 1 王铭章手里是望远镜不是枪。
    //   镜 6 是日方视角，只有枪管前端与准星，不给日兵的脸 —— 不把这一枪人格化。
    //   镜 4 的「缒城」只给远景剪影不做特写：姜克实认为这个细节是为圆城外说
    //   所作的创作性还原，给特写等于把一个存疑细节做成实拍证据。
    // =======================================================================

    props: [
      // 西关外土路那一段：无叶柳条（前景）。三月柳条无叶，深褐红枝条。
      // 镜 4 的绳子：两根绑腿接成的，从西北角墙头垂到濠里。
      // 「缒城」这个细节姜克实认为是为圆城外说所作的创作性还原 —— 所以只做一根
      // 远景可见的细线，不做特写、不做打结的细节，别把存疑细节做成实拍证据。
      { kind: "cyl", size: [0.035, 12.0], pos: [-310.6, 5.5, -296.0], color: 0x6f6350, name: "绑腿绳" },
      // cyl 的 pos 是**几何中心**，所以 y = 高/2。三月柳条无叶，深褐红枝条。
      { kind: "cyl", size: [0.10, 3.2], pos: [-609.0, 1.60, 15.0], color: 0x7a5b48, name: "柳一" },
      { kind: "cyl", size: [0.09, 2.9], pos: [-607.5, 1.45, 27.5], color: 0x7a5b48, name: "柳二" },
      { kind: "cyl", size: [0.11, 3.4], pos: [-614.0, 1.70, 12.0], color: 0x7a5b48, name: "柳三" },
      { kind: "cyl", size: [0.08, 2.6], pos: [-611.0, 1.30, 29.5], color: 0x7a5b48, name: "柳四" },
      // 电灯厂的烟囱。**正片里这根烟囱由静态场景（WEST_SUBURB.powerPlant）建**，
      // 这里只是给预览页补一根，免得空场看不出天际线 —— probeOnly 的东西
      // 在正片里一律不建，不然会和静态场景撞成两根。
      // Data_Tengxian 只给了厂房中心与烟囱高度 22 m，烟囱落在厂区哪一端无载，
      // 取西端（登记在 PRESUMED_STAGING）。
      { kind: "cyl", size: [1.35, 22.0], pos: [-712.0, 11.0, 30.0], mat: "BrickWall", probeOnly: true, name: "电灯厂烟囱" },
    ],
    cast: [
      // 王铭章。镜 1 在十字街口街心，**手里是望远镜不是枪**（weapon:null）。
      // 镜界（累计秒）：镜1 0–4.5｜镜2 4.5–8｜镜3 8–13｜镜4 13–18｜镜5 18–24｜
      //                 镜6 24–29｜镜7 29–33｜镜8 33–36
      // 轨道位移一律按 moveSpeed×4.2 m/s 反算（走多快就走多远），换镜处插 hidden 帧。
      { id: "wang", kind: "nra", weapon: null, seed: "wangMz", track: [
        // 镜 1：街心，背对镜头（镜头在东，他朝西）。yaw=π/2 时 Actor 的局部 -Z 指向 -X。
        { t: 0.0, pos: [2.5, 0, 0.2], ry: 1.5708, state: { moveSpeed: 0 } },
        { t: 4.5, pos: [2.5, 0, 0.2], ry: 1.5708, state: { moveSpeed: 0 } },
        { t: 4.6, pos: [2.5, 0, 0.2], ry: 1.5708, state: { hidden: true } },
        // 镜 3：沿西城墙内侧墙根向北急走。10.9 m / 5 s = 2.18 m/s = moveSpeed 0.52。
        { t: 7.9, pos: [-292.6, 0, -38.5], ry: 3.1416, state: { hidden: true } },
        { t: 8.0, pos: [-292.6, 0, -38.5], ry: 3.1416, state: { moveSpeed: 0.52 } },
        { t: 13.0, pos: [-292.6, 0, -49.4], ry: 3.1416, state: { moveSpeed: 0.52 } },
        { t: 13.1, pos: [-292.6, 0, -49.6], ry: 3.1416, state: { hidden: true } },
        // 镜 4：城墙西北角缒城（远景剪影，不给脸）。墙外，顺绳而下，落地半身进濠水。
        { t: 13.4, pos: [-310.6, 11.0, -296.0], ry: 1.5708, state: { hidden: true } },
        { t: 13.5, pos: [-310.6, 11.0, -296.0], ry: 1.5708, state: { moveSpeed: 0 } },
        // 落到墙脚的平台上（y=0），再下到濠边 —— **不是直接落进水里**。
        // 分镜写「落地时半个身子进了濠水」，但 Data_Tengxian 的濠内边距墙脚 8 m
        // （推定值）决定了绳子够不到水。城的几何优先，分镜迁就它。
        { t: 17.2, pos: [-310.6, 0.0, -296.0], ry: 1.5708, state: { moveSpeed: 0.34 } },
        { t: 17.9, pos: [-315.5, -1.3, -296.4], ry: 1.2, state: { moveSpeed: 0.34 } },
        { t: 17.92, pos: [-311.6, -3.6, -300.0], ry: 1.2, state: { hidden: true } },
        // 镜 5：西关外土路，一行人低身快走。8 m / 6 s = 1.33 m/s = moveSpeed 0.32（蹲行）。
        { t: 17.95, pos: [-616.0, 0, 22.0], ry: 1.5708, state: { hidden: true } },
        { t: 18.0, pos: [-616.0, 0, 22.0], ry: 1.5708, state: { moveSpeed: 0.32, crouch: 0.35 } },
        { t: 24.0, pos: [-624.0, 0, 22.0], ry: 1.5708, state: { moveSpeed: 0.32, crouch: 0.35 } },
        // 镜 6 的枪响在 t=28.4（镜内 4.4 s）；镜 7 一开始就倒。
        { t: 28.4, pos: [-629.9, 0, 22.0], ry: 1.5708, state: { moveSpeed: 0.32, crouch: 0.35 } },
        { t: 29.0, pos: [-630.7, 0, 21.8], ry: 1.5708, state: { moveSpeed: 0, dead: true } },
        { t: 30.4, pos: [-631.4, 0, 21.2], ry: 1.5708, state: { moveSpeed: 0, dead: true } },
        // 30.5 之后画面上只剩土路、柳条、烟囱，静止 2.5 秒 —— 这一条是这一场
        // 最重要的设计决定：把注意力留给那条空掉的路，而不是尸体。
        { t: 30.5, pos: [-631.4, 0, 21.2], ry: 1.5708, state: { hidden: true } },
      ] },
      // 同行的一行人。分镜只说「一行人」，人数为推定。
      { id: "e1", kind: "nra", weapon: "HanYang", seed: "esc1", track: [
        { t: 17.95, pos: [-613.6, 0, 24.4], ry: 1.5708, state: { hidden: true } },
        { t: 18.0, pos: [-613.6, 0, 24.4], ry: 1.5708, state: { moveSpeed: 0.32, crouch: 0.35 } },
        { t: 28.4, pos: [-627.4, 0, 24.4], ry: 1.5708, state: { moveSpeed: 0.32, crouch: 0.35 } },
        { t: 29.2, pos: [-628.2, 0, 24.0], ry: 1.5708, state: { moveSpeed: 0, dead: true } },
        { t: 30.5, pos: [-628.8, 0, 23.6], ry: 1.5708, state: { hidden: true } },
      ] },
      { id: "e2", kind: "nra", weapon: null, seed: "esc2", track: [
        { t: 17.95, pos: [-612.0, 0, 20.2], ry: 1.5708, state: { hidden: true } },
        { t: 18.0, pos: [-612.0, 0, 20.2], ry: 1.5708, state: { moveSpeed: 0.32, crouch: 0.4 } },
        { t: 28.4, pos: [-625.8, 0, 20.2], ry: 1.5708, state: { moveSpeed: 0.32, crouch: 0.4 } },
        { t: 29.4, pos: [-626.6, 0, 19.8], ry: 1.5708, state: { moveSpeed: 0, dead: true } },
        { t: 30.5, pos: [-627.2, 0, 19.4], ry: 1.5708, state: { hidden: true } },
      ] },
      { id: "e3", kind: "nra", weapon: "HanYang", seed: "esc3", track: [
        { t: 17.95, pos: [-610.4, 0, 23.0], ry: 1.5708, state: { hidden: true } },
        { t: 18.0, pos: [-610.4, 0, 23.0], ry: 1.5708, state: { moveSpeed: 0.32, crouch: 0.35 } },
        { t: 28.4, pos: [-624.2, 0, 23.0], ry: 1.5708, state: { moveSpeed: 0.32, crouch: 0.35 } },
        { t: 29.6, pos: [-625.0, 0, 22.6], ry: 1.5708, state: { moveSpeed: 0, dead: true } },
        { t: 30.5, pos: [-625.6, 0, 22.2], ry: 1.5708, state: { hidden: true } },
      ] },
      // 副官只有一句**画外音**，所以他必须待在画外：50 mm 在 10 m 处半幅宽 4.27 m，
      // 把他放到轴线侧向 6.3 m 上就出画了。早先摆在 (5.2, 2.4) 时他比师长还大一圈，
      // 抢了镜 1 的主体 —— 「画外」不是修辞，是机位算出来的。
      { id: "adj", kind: "nra", weapon: "HanYang", seed: "adjutant", track: [
        { t: 0.0, pos: [2.0, 0, 6.5], ry: 1.9, state: { moveSpeed: 0, crouch: 0.2 } },
        { t: 8.0, pos: [2.0, 0, 6.5], ry: 1.9, state: { moveSpeed: 0, crouch: 0.2 } },
      ] },
    ],
    shots: [
      {
        n: 1, seconds: 4.5, focalMm: 50,
        note: "固定中景，齐胸高 1.55 m，机位在十字街口东侧：王铭章在街心，背对镜头，手里是望远镜不是枪。西门方向传来重机枪的声音。街上全是尘",
        camera: { from: [12.0, 1.55, 0.60], look: [-40.0, 1.50, 0.20] },
        sfx: [{ at: 1.6, name: "type92", volume: 0.30 }, { at: 3.2, name: "type92", volume: 0.26 }],
      },
      {
        n: 2, seconds: 3.5, focalMm: 135,
        note: "反打，长焦压缩：西城门楼的剪影在西门里街尽头，一挺重机枪的枪口焰。子弹打在近处砖上（只打砖，不打人）",
        camera: { from: [3.0, 1.60, 0.0], look: [-305.0, 13.0, 0.0] },
        // 枪口焰是加性贴片 —— Script_Cutscene 建它的材质时必须 MarkNoPrepass。
        flash: [
          { at: 0.5, pos: [-303.5, 12.8, 0.6], seconds: 0.07, size: 1.6 },
          { at: 0.68, pos: [-303.5, 12.8, 0.6], seconds: 0.07, size: 1.5 },
          { at: 0.86, pos: [-303.5, 12.8, 0.6], seconds: 0.07, size: 1.6 },
          { at: 1.6, pos: [-303.5, 12.8, 0.6], seconds: 0.07, size: 1.5 },
          { at: 1.78, pos: [-303.5, 12.8, 0.6], seconds: 0.07, size: 1.6 },
        ],
        sfx: [
          { at: 0.5, name: "type92", volume: 0.55 },
          { at: 0.9, name: "impactBrick", volume: 0.5 },
          { at: 1.05, name: "impactBrick", volume: 0.45 },
          { at: 1.6, name: "type92", volume: 0.5 },
        ],
        lines: [{ at: 0.2, seconds: 2.4, who: "adjutant", off: true, tier: "虚构", text: "师长！西门楼上有机枪——" }],
      },
      {
        n: 3, seconds: 5.0, focalMm: 35,
        note: "手持跟拍，高度 0.9 m：沿城墙内侧墙根急走。只拍腰以下与墙面 —— 绑腿、布鞋、墙根一排排掠过的防空洞口",
        // 「只拍腰以下」是靠**距离**做到的，不是靠俯角：35 mm 在 2.6 m 处画幅高
        // 1.82 m，取景中心压到 0.55 m，上边正好切在腰上。机位离人再远一米就穿帮。
        camera: {
          from: [-290.4, 0.90, -37.0], to: [-290.4, 0.90, -47.9],
          look: [-292.6, 0.55, -38.4], lookTo: [-292.6, 0.55, -49.3],
          ease: "linear", shake: 0.75,
        },
        sfx: [{ at: 0.3, name: "footstepDirt", volume: 0.4 }, { at: 1.1, name: "footstepDirt", volume: 0.38 },
              { at: 1.9, name: "footstepDirt", volume: 0.4 }, { at: 2.7, name: "footstepDirt", volume: 0.36 },
              { at: 3.5, name: "footstepDirt", volume: 0.4 }, { at: 4.3, name: "footstepDirt", volume: 0.36 }],
      },
      {
        n: 4, seconds: 5.0, focalMm: 28,
        note: "固定仰拍，机位在城外壕底：城墙西北角，两根绑腿接成的绳子垂下，人顺绳下来（远景剪影，不给脸）。落地时半个身子进了濠水",
        // ★ 机位不能真放在濠底：墙脚到濠内边还有 8 m 平台，从濠底（y=-4.8）望过去
        //   那道平台边缘把整堵墙挡得只剩个尖 —— 出图之前完全想不到，图一拍就明白。
        //   改放到濠**外岸的水线高度**（y=-1.5）：越过平台边的视线仰角只剩 7.6°，
        //   11.5 m 的墙从离地 1 m 处起全部可见。仍是仰拍，仍在城外。
        camera: { from: [-331.0, -1.50, -288.0], look: [-311.5, 5.50, -295.0] },
        sfx: [{ at: 4.2, name: "bodyFall", volume: 0.4 }],
      },
      {
        n: 5, seconds: 6.0, focalMm: 50,
        note: "侧移轨，横移 8 m：西关外土路。前景是无叶柳条，中景一行人低身快走，背景天际线上是电灯厂的烟囱",
        // 横移 8 m / 6 s = 1.33 m/s，与一行人的步速同步，所以他们在画面里基本不动，
        // 动的是前景柳条与远处的烟囱 —— 这就是「侧移轨」要的视差。
        camera: {
          from: [-604.0, 1.50, 14.0], to: [-604.0, 1.50, 22.0],
          look: [-616.0, 1.05, 22.2], lookTo: [-624.0, 1.05, 22.2],
          ease: "linear",
        },
        lines: [{ at: 1.4, seconds: 3.0, who: "wang", tier: "虚构", text: "往车站走。弟兄们，跟上。" }],
      },
      {
        n: 6, seconds: 5.0, focalMm: 200, cut: "hard",
        note: "硬切，长焦，机位在西城门楼上（敌方视角，只有枪管前端与准星，不给日兵的脸）：视野里那行人在约 400 m 外。一声，画面轻微一震",
        // 分镜写「约 400 m」，那是电灯厂到西城门楼的距离（约 395 m）。
        // 但镜 5 要让烟囱当天际线剪影，一行人就得离厂房还有一段（否则 22 m 的烟囱
        // 会占满画面，不成其为天际线）。取折中：一行人在西门楼西方约 325 m 处，
        // 仍在「西关电灯厂附近」这个史料表述的范围内。**这条是分镜数值的调整，
        // 不是史料数值的调整** —— 登记在 PRESUMED_STAGING。
        camera: { from: [-305.5, 12.80, 0.60], look: [-630.0, 0.90, 22.0] },
        // 敌方视角的「枪管前端与准星」：贴在镜头前的两块小几何，不给日兵。
        gunsight: true,
        flash: [{ at: 4.4, pos: [-306.6, 12.75, 0.62], seconds: 0.06, size: 0.5 }],
        sfx: [{ at: 4.4, name: "type92", volume: 0.7 }],
        shakeAt: [{ at: 4.4, seconds: 0.35, amount: 0.5 }],
      },
      {
        n: 7, seconds: 4.0, focalMm: 50,
        note: "切回地面，机位完全不动：人从画面里倒出去（出画）。剩下土路、柳条、烟囱。静止 2.5 秒",
        // 机位与镜 5 的**终点**完全一致，一个数都不许动 —— 「机位完全不动」
        // 是这一场最重要的设计决定：把注意力留给那条空掉的土路，而不是尸体。
        camera: { from: [-604.0, 1.50, 22.0], look: [-624.0, 1.05, 22.2] },
        sfx: [{ at: 0.15, name: "bodyFall", volume: 0.45 }],
      },
      {
        n: 8, seconds: 3.0, focalMm: 50, black: true,
        note: "黑场，字幕（可翻页）",
        camera: { from: [-604.0, 1.50, 22.0], look: [-624.0, 1.05, 22.2] },
        subs: [
          { at: 0.1, seconds: 1.4, tier: "主流", text: "殉国地点两说：城中心十字街口 ／ 西关电灯厂附近壕沟。" },
          { at: 1.6, seconds: 1.3, tier: "主流", text: "时间三说：三月十七日下午三时 ／ 五时 ／ 黄昏。" },
        ],
      },
    ],
    // 黑场那三秒装不下全部并列史源 —— 剩下的走「补出卡片」，与跳过卡同一套 UI。
    // 史实信息不许因为镜头时长不够而丢失。
    epilogueCard: {
      title: "王铭章殉国",
      lines: [
        { tier: "主流", text: "殉国地点两说：城中心十字街口 ／ 西关电灯厂附近壕沟。" },
        { tier: "主流", text: "时间三说：三月十七日下午三时 ／ 五时 ／ 黄昏。" },
        { tier: "主流", text: "一九三八年三月二十一日中央社电讯记为城内中弹后自戕；同年十一月墓志改记为「负伤仍指挥杀敌，身中数弹」；一九八三年起张宣武回忆记为缒城后于城外中弹。其后人于二〇〇九年公开否认自杀说。本作采城外中弹一说。" },
        { tier: "信史", text: "一九三八年四月六日国民政府褒扬令：苦守要区，逾三昼夜。" },
        { tier: "主流", small: true, text: "同时殉国：赵渭滨（第 122 师参谋长）、邹绍孟（第 124 师参谋长）、罗甲辛、谢大墉、范承谟；王麟（第 740 团团长，十七日东关方向阵亡）。" },
      ],
    },
    skipCardFrom: "epilogueCard",
    forbiddenLines: ["举枪", "自戕", "自尽", "师座"],
  },

  // =========================================================================
  CS_BeimenBreakout: {
    id: "CS_BeimenBreakout",
    title: "北门突围",
    seconds: 24.0,
    trigger: "afterLevel:L6_Beimen",
    sky: "night",
    standalone: false,
    setOrigin: [0, 0, 0],
    why: "必败结构需要一个不带解脱感的收尾。镜 4「没有追兵」是重点 —— 既是史实（日军未追击），也是全局最刺人的一句：连追都不必追了。",
    props: [
      // 北门洞里堵门的土袋。1938 年守军把南北二门堵死，突围当夜「扒开已屯闭的北城门」。
      { kind: "box", size: [0.62, 0.24, 0.34], pos: [-0.55, 0.12, -308.2], ry: 0.12, mat: "Sandbag", name: "土袋一" },
      { kind: "box", size: [0.62, 0.24, 0.34], pos: [0.10, 0.12, -308.3], ry: -0.08, mat: "Sandbag", name: "土袋二" },
      { kind: "box", size: [0.62, 0.24, 0.34], pos: [0.72, 0.12, -308.2], ry: 0.05, mat: "Sandbag", name: "土袋三" },
      { kind: "box", size: [0.62, 0.24, 0.34], pos: [-0.25, 0.36, -308.4], ry: -0.15, mat: "Sandbag", name: "土袋四" },
      { kind: "box", size: [0.62, 0.24, 0.34], pos: [0.42, 0.36, -308.3], ry: 0.10, mat: "Sandbag", name: "土袋五" },
      { kind: "box", size: [0.62, 0.24, 0.34], pos: [0.08, 0.60, -308.4], ry: 0.02, mat: "Sandbag", name: "土袋六" },
    ],
    // 镜界（累计秒）：镜1 0–5｜镜2 5–10｜镜3 10–15｜镜4 15–20｜镜5 20–24
    // 扒门的三个人只在镜 1、挤门的五个人只在镜 2、麦地里那条细线只在镜 3 ——
    // 分三组各管一镜，比让同一批人跨镜跑五百米靠谱得多（也省一半 Actor）。
    cast: [
      // 侯子平（第 727 团 3 营副营长，真实人物）指挥扒门。
      { id: "hou", kind: "nra", weapon: "HanYang", seed: "houZiping", track: [
        { t: 0.0, pos: [-1.2, 0, -306.4], ry: 3.1416, state: { moveSpeed: 0, crouch: 0.85 } },
        { t: 4.8, pos: [-1.2, 0, -306.4], ry: 3.1416, state: { moveSpeed: 0, crouch: 0.85, melee: 0.4 } },
        { t: 5.0, pos: [-1.2, 0, -306.4], ry: 3.1416, state: { hidden: true } },
      ] },
      { id: "d1", kind: "nra", weapon: null, seed: "dig1", track: [
        { t: 0.0, pos: [0.4, 0, -306.6], ry: 3.1416, state: { moveSpeed: 0, crouch: 0.9, melee: 0.5 } },
        { t: 4.8, pos: [0.4, 0, -306.6], ry: 3.1416, state: { moveSpeed: 0, crouch: 0.9, melee: 0.5 } },
        { t: 5.0, pos: [0.4, 0, -306.6], ry: 3.1416, state: { hidden: true } },
      ] },
      { id: "d2", kind: "nra", weapon: null, seed: "dig2", track: [
        { t: 0.0, pos: [1.3, 0, -306.9], ry: 3.1416, state: { moveSpeed: 0, crouch: 0.9, melee: 0.5 } },
        { t: 4.8, pos: [1.3, 0, -306.9], ry: 3.1416, state: { moveSpeed: 0, crouch: 0.9, melee: 0.5 } },
        { t: 5.0, pos: [1.3, 0, -306.9], ry: 3.1416, state: { hidden: true } },
      ] },
      // 镜 2：人一个一个挤出去，画面被身体反复遮黑。2.18 m/s（moveSpeed 0.52）×5 s。
      { id: "o1", kind: "nra", weapon: null, seed: "out1", track: [
        { t: 4.9, pos: [0.2, 0, -302.0], ry: 3.1416, state: { hidden: true } },
        { t: 5.0, pos: [0.2, 0, -302.0], ry: 3.1416, state: { moveSpeed: 0.52 } },
        { t: 10.0, pos: [0.2, 0, -312.9], ry: 3.1416, state: { moveSpeed: 0.52 } },
        { t: 10.1, pos: [0.2, 0, -313.1], ry: 3.1416, state: { hidden: true } },
      ] },
      { id: "o2", kind: "nra", weapon: "HanYang", seed: "out2", track: [
        { t: 5.4, pos: [-0.6, 0, -301.2], ry: 3.1416, state: { hidden: true } },
        { t: 5.5, pos: [-0.6, 0, -301.2], ry: 3.1416, state: { moveSpeed: 0.52 } },
        { t: 10.0, pos: [-0.6, 0, -311.0], ry: 3.1416, state: { moveSpeed: 0.52 } },
        { t: 10.1, pos: [-0.6, 0, -311.2], ry: 3.1416, state: { hidden: true } },
      ] },
      { id: "o3", kind: "nra", weapon: null, seed: "out3", track: [
        { t: 6.1, pos: [0.8, 0, -301.4], ry: 3.1416, state: { hidden: true } },
        { t: 6.2, pos: [0.8, 0, -301.4], ry: 3.1416, state: { moveSpeed: 0.52 } },
        { t: 10.0, pos: [0.8, 0, -309.7], ry: 3.1416, state: { moveSpeed: 0.52 } },
        { t: 10.1, pos: [0.8, 0, -309.9], ry: 3.1416, state: { hidden: true } },
      ] },
      { id: "o4", kind: "nra", weapon: null, seed: "out4", track: [
        { t: 7.0, pos: [-0.2, 0, -301.6], ry: 3.1416, state: { hidden: true } },
        { t: 7.1, pos: [-0.2, 0, -301.6], ry: 3.1416, state: { moveSpeed: 0.52 } },
        { t: 10.0, pos: [-0.2, 0, -307.9], ry: 3.1416, state: { moveSpeed: 0.52 } },
        { t: 10.1, pos: [-0.2, 0, -308.1], ry: 3.1416, state: { hidden: true } },
      ] },
      { id: "o5", kind: "nra", weapon: "HanYang", seed: "out5", track: [
        { t: 8.0, pos: [0.5, 0, -301.8], ry: 3.1416, state: { hidden: true } },
        { t: 8.1, pos: [0.5, 0, -301.8], ry: 3.1416, state: { moveSpeed: 0.52 } },
        { t: 10.0, pos: [0.5, 0, -305.9], ry: 3.1416, state: { moveSpeed: 0.52 } },
        { t: 10.1, pos: [0.5, 0, -306.1], ry: 3.1416, state: { hidden: true } },
      ] },
      // 镜 3：麦地里那条细线。1.76 m/s（moveSpeed 0.42）×5 s = 8.8 m。
      // 只是五百人里能入画的一小段 —— 别把它当人数。
      { id: "c1", kind: "nra", weapon: null, seed: "col1", track: [
        { t: 9.9, pos: [0.4, 0, -330.0], ry: 3.1416, state: { hidden: true } },
        { t: 10.0, pos: [0.4, 0, -330.0], ry: 3.1416, state: { moveSpeed: 0.42 } },
        { t: 15.0, pos: [0.4, 0, -338.8], ry: 3.1416, state: { moveSpeed: 0.42 } },
        { t: 15.1, pos: [0.4, 0, -339.0], ry: 3.1416, state: { hidden: true } },
      ] },
      { id: "c2", kind: "nra", weapon: "HanYang", seed: "col2", track: [
        { t: 9.9, pos: [-0.9, 0, -343.0], ry: 3.1416, state: { hidden: true } },
        { t: 10.0, pos: [-0.9, 0, -343.0], ry: 3.1416, state: { moveSpeed: 0.42 } },
        { t: 15.0, pos: [-0.9, 0, -351.8], ry: 3.1416, state: { moveSpeed: 0.42 } },
        { t: 15.1, pos: [-0.9, 0, -352.0], ry: 3.1416, state: { hidden: true } },
      ] },
      { id: "c3", kind: "nra", weapon: null, seed: "col3", track: [
        { t: 9.9, pos: [0.9, 0, -356.0], ry: 3.1416, state: { hidden: true } },
        { t: 10.0, pos: [0.9, 0, -356.0], ry: 3.1416, state: { moveSpeed: 0.42 } },
        { t: 15.0, pos: [0.9, 0, -364.8], ry: 3.1416, state: { moveSpeed: 0.42 } },
        { t: 15.1, pos: [0.9, 0, -365.0], ry: 3.1416, state: { hidden: true } },
      ] },
      { id: "c4", kind: "nra", weapon: null, seed: "col4", track: [
        { t: 9.9, pos: [-0.5, 0, -369.0], ry: 3.1416, state: { hidden: true } },
        { t: 10.0, pos: [-0.5, 0, -369.0], ry: 3.1416, state: { moveSpeed: 0.42 } },
        { t: 15.0, pos: [-0.5, 0, -377.8], ry: 3.1416, state: { moveSpeed: 0.42 } },
        { t: 15.1, pos: [-0.5, 0, -378.0], ry: 3.1416, state: { hidden: true } },
      ] },
      { id: "c5", kind: "nra", weapon: "HanYang", seed: "col5", track: [
        { t: 9.9, pos: [0.6, 0, -382.0], ry: 3.1416, state: { hidden: true } },
        { t: 10.0, pos: [0.6, 0, -382.0], ry: 3.1416, state: { moveSpeed: 0.42 } },
        { t: 15.0, pos: [0.6, 0, -390.8], ry: 3.1416, state: { moveSpeed: 0.42 } },
        { t: 15.1, pos: [0.6, 0, -391.0], ry: 3.1416, state: { hidden: true } },
      ] },
    ],
    shots: [
      {
        n: 1, seconds: 5.0, focalMm: 35,
        note: "固定低机位，贴北门洞地面：一只只手把土袋往外扒，土从麻袋破口里漏。只有手和土",
        camera: { from: [0.1, 0.22, -303.4], look: [0.15, 0.42, -307.6] },
        lines: [{ at: 1.2, seconds: 2.8, who: "hou", tier: "虚构", text: "扒北门。一个跟一个，不许出声。" }],
        propMoves: [
          { name: "土袋六", from: [0.08, 0.60, -308.4], to: [1.55, 0.10, -306.6], startAt: 2.2, endAt: 2.9, ease: "easeIn" },
          { name: "土袋五", from: [0.42, 0.36, -308.3], to: [-1.70, 0.10, -306.4], startAt: 3.4, endAt: 4.1, ease: "easeIn" },
        ],
        sfx: [{ at: 2.9, name: "impactDirt", volume: 0.45 }, { at: 4.1, name: "impactDirt", volume: 0.42 }],
      },
      {
        n: 2, seconds: 5.0, focalMm: 24,
        note: "门洞内向外，固定：门洞是一个亮的方框，外面是夜里灰白的麦田。人一个一个挤出去，画面被身体反复遮黑",
        camera: { from: [0.0, 1.40, -300.4], look: [0.0, 1.20, -330.0] },
        sfx: [{ at: 0.6, name: "footstepDirt", volume: 0.3 }, { at: 1.5, name: "footstepDirt", volume: 0.3 },
              { at: 2.6, name: "footstepDirt", volume: 0.3 }, { at: 3.6, name: "footstepDirt", volume: 0.3 }],
      },
      {
        n: 3, seconds: 5.0, focalMm: 35,
        note: "俯拍，高 25 m，缓推：一条细线在返青的麦地里向北移动。城在画面下缘烧着，烟被南风压得很低",
        // 「城在画面下缘」是算出来的：机位 25 m 高、俯 17°，35 mm 的下边缘落在
        // 水平 34 m 处，正好压在城墙外脚（z=-310）上。机位往北挪一米城就出画了。
        camera: { from: [0.0, 25.0, -270.0], to: [0.0, 22.5, -282.0], look: [0.0, 0.6, -372.0], ease: "easeInOut" },
        subs: [
          { at: 0.4, seconds: 4.2, tier: "主流", small: true,
            text: "三月十七日二十一时，第七二七团三营残部二百余人，加城内零散部队三百余人，共约五百人，由三营副营长侯子平指挥，扒开北城门突围。日军未追击。" },
        ],
      },
      {
        n: 4, seconds: 5.0, focalMm: 200,
        note: "固定长焦回望：城墙的轮廓、烟、火。没有追兵",
        camera: { from: [6.0, 1.60, -520.0], look: [0.0, 9.0, -305.0] },
        subs: [
          { at: 0.6, seconds: 3.8, tier: "主流", text: "三月十八日午前后，枪声逐渐停止。同日临城亦陷，津浦路正面洞开。" },
        ],
      },
      {
        n: 5, seconds: 4.0, focalMm: 50, black: true,
        note: "黑场，结算",
        camera: { from: [6.0, 1.60, -520.0], look: [0.0, 9.0, -305.0] },
        tally: true,
      },
    ],
    // 结算面板：**不打歼敌数**。中日双方数字体系差到 2:1 至 100:1 都能凑出来，
    // 中方通行的「阵亡 3000 余」与自家战斗详报的「阵亡 945」相差三倍以上。
    // 只打三个可验证量。
    tally: {
      rows: [
        { label: "守住", value: "一〇八小时", note: "自三月十四日拂晓计（张宣武记）", tier: "主流" },
        { label: "阵地易手", value: "东关 4 次｜南城墙 1 次｜西门楼 1 次", tier: "主流" },
        { label: "出城的人", value: "{poolOut} 人", note: "你带出去的", tier: "游戏" },
      ],
      // 底下两行**必须同时出**，不许只出前一行。
      closing: [
        { tier: "主流", text: "「若无滕县之苦守，焉有台儿庄之战果。」",
          small: "出自《李宗仁回忆录》，一九六〇—七〇年代追述，非一九三八年文件。另有一版作「焉有台儿庄之大捷？台儿庄之战果，实滕县先烈所就也」。" },
        { tier: "主流", text: "亦有档案研究认为，濑谷支队三月十八日下临城、二十日下韩庄峄县，南下节奏未被显著打乱。此因果在学术上有争议。" },
      ],
    },
    skipCard: {
      title: "北门突围",
      lines: [
        { tier: "主流", text: "三月十七日二十一时，第七二七团三营残部二百余人，加城内零散部队三百余人，共约五百人，由三营副营长侯子平指挥，扒开北城门突围。日军未追击。" },
        { tier: "主流", text: "三月十八日午前后，枪声逐渐停止。同日临城亦陷，津浦路正面洞开。" },
      ],
    },
    forbiddenLines: ["歼敌", "全歼"],
  },
};

/** 按 id 取一场过场。 */
export function FindCutscene(id) {
  return CUTSCENES[id] || null;
}

/** 按 id 取一关。 */
export function FindLevel(id) {
  return LEVELS.find((l) => l.id === id) || null;
}

/** 过场的播放顺序（给预览页与章节选单用）。 */
export const CUTSCENE_ORDER = [
  "CS_Chuchuan", "CS_LiZongrenTang", "CS_LastWire", "CS_WangMingzhang", "CS_BeimenBreakout",
];

// ===========================================================================
// 菜单与关于页
// ===========================================================================

export const MENU = {
  title: "滕县 一九三八",
  subtitle: "一九三八年三月十四日 — 十八日 · 山东滕县",
  lines: [
    "守城的是川军，没有钢盔，三分之一以上没有步枪。",
    "城是必然陷落的。",
    "你能改变的只有：这一小时守不守得住。",
  ],
  start: "开始",
  chapters: "选章",
  codex: "史实注记",
  credits: "关于",
};

export const CREDITS = [
  "《滕县 一九三八》 —— 浏览器 FPS 原型",
  "",
  "剧情依据公开史料写成，可信度分三档：信史 / 主流记载 / 流传待考。",
  "游戏台词只建立在前两档上；第三档的材料一律不采用，",
  "或以旁白「另有记载」的语气与相反的一说同屏并列。",
  "",
  "真实历史人物：王铭章、赵渭滨、张宣武、严翊、侯子平、王麟、孙震、李宗仁、汤恩伯。",
  "他们在本作中只做史料里有的事。",
  "谢长顺、邱茂才、杨守成为虚构人物 —— 城内约三千人里，绝大多数没有留下名字。",
  "",
  "两处必须并列摆出、不许只说一半的地方：",
  "· 王铭章的殉国方式（1938 年电讯的自戕说 ／ 墓志与回忆的中弹说），本作采后者；",
  "· 滕县之守与台儿庄之捷的因果（《李宗仁回忆录》口径 ／ 档案研究的反面意见）。",
  "",
  "凡「推定」的数值（街巷宽度、瓮城尺寸、兵员池数字……）都不是史实，",
  "登记表见 Data_Tengxian.mjs 的 PRESUMED 与本文件的 PRESUMED_STAGING。",
  "",
  "美术与音效全部程序化生成，未使用任何外部素材。",
];

// ===========================================================================
// 推定值登记表（演出侧）
// ===========================================================================

/**
 * 这张表是史实纪律的执行机制：凡在这里登记的数，
 * **游戏内任何文本（字幕、图鉴、UI）都不许说成史实**。
 *
 * 城的几何推定登记在 Data_Tengxian.mjs 的 PRESUMED；这里只登记「演出层」
 * 新引入的推定 —— 关卡数值、过场机位、人物设定。
 */
export const PRESUMED_STAGING = [
  { id: "playerIdentity", value: "谢长顺 / 四川三台 / 十八岁 / 727 团 3 营 9 连二等兵",
    note: "玩家是虚构人物。所属番号（122 师 364 旅 727 团 3 营）为史料，连别与籍贯为推定" },
  { id: "squadNames", value: ["邱茂才", "杨守成"],
    note: "班长与连长的名字由设计书写死，均为虚构人物，不对应任何真实军官" },
  { id: "poolCurve", value: [220, 196, 328, 300, 236, 178, 96, 40],
    note: "「城里还站着的人」逐关数值全为推定。史料只给三个锚点：城内约 3000 人、能打的不足 2000、突围约 500 人。关卡池是一个班排级切片，不是全城人数，不许拿来当伤亡统计" },
  { id: "poolGain", value: 132,
    note: "L1 收容 757 团残部的加成。史料只说「收容数百人」，具体数字无载" },
  { id: "levelMinutes", value: [14, 16, 22, 15, 20, 16, 12],
    note: "各关时长为设计值，与史实时段的长短无关" },
  { id: "divisionHqInner", value: [200, 0, -45],
    note: "CS_LastWire 的师部位置。史料只说师部原设城外电灯厂、16 日迁入城内，**城内具体位置无载**。摆在县衙西侧纯为演出方便" },
  { id: "cutsceneCameras", value: "五场过场的全部机位世界坐标",
    note: "分镜表给的是机位高度、俯仰角、焦距与被摄物，**世界坐标全部是本实现推定的**。改机位不算改史实，但改「谁在画面里、他在做什么」算" },
  { id: "wangShotDistance", value: 325, unit: "m",
    note: "CS_WangMingzhang 镜 6 敌方视角的实际距离。分镜写「约 400 m」（那是电灯厂到西城门楼的距离约 395 m），但镜 5 要让 22 m 高的烟囱当天际线剪影，一行人就必须离厂房还有一段。取 325 m 折中，仍在「西关电灯厂附近」的史料表述内。**这是分镜数值的调整，不是史料数值的调整**" },
  { id: "escortCount", value: 4,
    note: "CS_WangMingzhang 镜 5 随行「一行人」的人数。史料未记随行人数（只记同时殉国军官七名、卫士李士昆等二人受伤幸存）" },
  { id: "chimneyPosition", value: [-712, 30],
    note: "电灯厂烟囱在厂区内的具体位置。Data_Tengxian 只给了厂房中心与烟囱高度，烟囱落在厂区哪一端无载，取西端以便入画" },
  { id: "breakoutColumn", value: 6,
    note: "CS_BeimenBreakout 画面里的人数。史料记突围共约五百人，画面只取一个可读的切片" },
  { id: "marchColumn", value: 11,
    note: "CS_Chuchuan 镜 1「数得清，11 双脚」为分镜指定，不是史料" },
];

/** 按 id 查推定条目，给 UI 的「这是推定值」角标用。 */
export function FindPresumedStaging(id) {
  return PRESUMED_STAGING.find((p) => p.id === id) || null;
}
