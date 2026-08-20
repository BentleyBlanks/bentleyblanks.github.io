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
    // 北上接敌。垫底的一层，几乎察觉不到。
    music: "siege",
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
    // 夜里摸进城。
    music: "tension",
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
    music: "siege",
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
    // 夺回东关门 —— 全场两处反攻之一，战鼓在这儿。
    music: "charge",
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
    music: "siege",
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
    music: "siege",
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
    // 北门突围 —— 另一处。
    music: "charge",
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

import { CS_Chuchuan } from "./Data_CutsceneChuchuan.mjs";
import { CS_LiZongrenTang } from "./Data_CutsceneLiZongrenTang.mjs";
import { CS_LastWire } from "./Data_CutsceneLastWire.mjs";
import { CS_WangMingzhang } from "./Data_CutsceneWangMingzhang.mjs";
import { CS_BeimenBreakout } from "./Data_CutsceneBeimenBreakout.mjs";

export const CUTSCENES = {
  CS_Chuchuan, CS_LiZongrenTang, CS_LastWire, CS_WangMingzhang, CS_BeimenBreakout,
};

// 各场自带的人物表条目并进 CAST（过场文件不许反过来 import CAST，会成环）。
for (const cut of Object.values(CUTSCENES)) {
  for (const [id, person] of Object.entries(cut.people || {})) {
    if (!CAST[id]) CAST[id] = person;
  }
}

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
  { id: "cutsceneCameras", value: "五场过场的全部机位世界坐标",
    note: "分镜表给的是机位高度、俯仰角、焦距与被摄物，**世界坐标全部是本实现推定的**。改机位不算改史实，但改「谁在画面里、他在做什么」算" },
  // 过场侧的推定（机位坐标、随行人数、布景位置……）各场自己登记在
  // Data_Cutscene*.mjs 的 presumed 数组里，这里汇总 —— 一场一个文件，并行改不互踩。
  ...Object.values(CUTSCENES).flatMap((cut) => cut.presumed || []),
];

/** 按 id 查推定条目，给 UI 的「这是推定值」角标用。 */
export function FindPresumedStaging(id) {
  return PRESUMED_STAGING.find((p) => p.id === id) || null;
}
