export const actorProfiles = Object.freeze({
  player: Object.freeze({ height: 1.72, shoulder: .34, head: .105 }),
  elder: Object.freeze({ height: 1.68, shoulder: .35, head: .11 }),
  woman: Object.freeze({ height: 1.64, shoulder: .32, head: .105 }),
  man: Object.freeze({ height: 1.74, shoulder: .36, head: .105 }),
  youth: Object.freeze({ height: 1.62, shoulder: .31, head: .108 }),
  soldier: Object.freeze({ height: 1.76, shoulder: .37, head: .103 })
});

const Puzzle = (title, brief, correct, options) => ({ title, brief, correct, options });

export const cinematicSequences = Object.freeze({
  prologueOpening: Object.freeze([
    { duration: 2.8, targetX: -6.2, targetY: 3.45, zoom: 1.02, label: "一九四二年五月 · 深夜", speaker: "黑风口外", caption: "远处的枪声没有按约定停下。原本用来掩护撤回的信号，也迟迟没有出现。", effect: "raidFlash", shake: .08 },
    { duration: 3.1, targetX: -9.7, targetY: 3.35, zoom: 1.25, label: "村外堤沟", speaker: "夜袭归队员", caption: "队形还没展开，路口的车灯先亮了。伤员在后面，追兵正沿我们的退路往村里压。", effect: "retreat", shake: .16 },
    { duration: 2.9, targetX: -6.8, targetY: 3.15, zoom: 1.38, label: "高家庄西口", speaker: "高老忠", caption: "先把消息送进村。钟一响，各院照平日排好的次序走，谁也不许乱。", effect: "bellStill" },
    { duration: 2.5, targetX: -3.1, targetY: 3.65, zoom: 1.06, label: "追兵逼近", speaker: "林青禾", caption: "先确认夜袭队留下的信号，再决定村里还有多少时间。", effect: "searchLight" }
  ]),
  raidLost: Object.freeze([
    { duration: 2.4, targetX: -10.2, targetY: 3.35, zoom: 1.42, label: "断开的联络", speaker: "林青禾", caption: "土坡上只有凌乱弹痕，没有约定的回号。夜袭已经失去突然性。", effect: "raidFlash", shake: .11 },
    { duration: 2.4, targetX: -8.9, targetY: 3.4, zoom: 1.24, label: "退路", speaker: "林青禾", caption: "先接住回来的人。只有问清追兵方向，警报才不是让全村盲目奔跑。", effect: "retreat" }
  ]),
  runnerWarning: Object.freeze([
    { duration: 2.6, targetX: -8.8, targetY: 3.28, zoom: 1.48, label: "伤员带回的消息", speaker: "夜袭归队员", caption: "敌人从路口追来，后队还在轮换抬伤员。村里只剩一小段准备时间。", effect: "breath", shake: .07 },
    { duration: 2.6, targetX: -6.8, targetY: 3.2, zoom: 1.28, label: "钟楼", speaker: "高老忠", caption: "让钟声先越过屋脊。每个院子都必须听懂同一个次序。", effect: "bellStill" }
  ]),
  bellAcrossVillage: Object.freeze([
    { duration: 2.1, targetX: -6.8, targetY: 3.05, zoom: 1.55, label: "第一声", speaker: "高老忠", caption: "不是催促，是唤醒。", effect: "bellRing", shake: .13 },
    { duration: 2.5, targetX: -3.5, targetY: 3.45, zoom: 1.18, label: "第二声", speaker: "村中", caption: "门闩一扇接一扇打开，灯罩被压低，担架先从窄院里转出来。", effect: "doors" },
    { duration: 2.7, targetX: 1.2, targetY: 3.55, zoom: 1.05, label: "三声一停", speaker: "赵婶", caption: "西院先答，伤员居中，断后的人最后应声。钟停以后，只剩脚步。", effect: "searchLight" }
  ]),
  doorsAndFootsteps: Object.freeze([
    { duration: 2.4, targetX: -2.8, targetY: 3.38, zoom: 1.36, label: "逐户回应", speaker: "赵婶", caption: "不是数影子。每户都要有人亲口答应，才知道老人和孩子没有落下。", effect: "doors" },
    { duration: 2.6, targetX: .2, targetY: 3.55, zoom: 1.15, label: "村口已有车灯", speaker: "林青禾", caption: "队伍必须绕开开阔村道，同时让担架和老人不断队。", effect: "searchLight", shake: .08 }
  ]),
  evacuationDescent: Object.freeze([
    { duration: 2.3, targetX: .2, targetY: 3.5, zoom: 1.24, label: "灌渠背坡", speaker: "林青禾", caption: "背坡挡住车灯，缓坡让担架能连续转弯。队伍开始向入口收拢。", effect: "evacuation" },
    { duration: 2.6, targetX: 2.8, targetY: 5.4, zoom: 1.08, label: "地表与土层之间", speaker: "赵婶", caption: "老人先踩稳梯脚，伤员一端一端换肩。上面的人没有催，下面的人没有挤。", effect: "descent" },
    { duration: 2.8, targetX: 4.2, targetY: 7.75, zoom: 1.16, label: "旧藏身洞", speaker: "高传宝", caption: "所有人都在往同一个洞口聚。只要入口被堵，里面就没有第二条路。", effect: "tunnelCrowd" }
  ]),
  hatchClosing: Object.freeze([
    { duration: 2.5, targetX: 3.8, targetY: 3.45, zoom: 1.42, label: "最后一户", speaker: "林青禾", caption: "回应传到门边以后，断后的人才落下门板。", effect: "hatch" },
    { duration: 2.6, targetX: 4.2, targetY: 7.7, zoom: 1.2, label: "门板之下", speaker: "洞内", caption: "光线只剩一道细缝。头顶的脚步已经压进院子。", effect: "searchAbove", shake: .12 }
  ]),
  searchAboveSoil: Object.freeze([
    { duration: 2.6, targetX: 4.6, targetY: 7.75, zoom: 1.5, label: "搜查开始", speaker: "赵婶", caption: "孩子贴着衣襟慢慢喘，担架布被攥住，没有人敢让木架碰墙。", effect: "breath", shake: .08 },
    { duration: 2.5, targetX: 3.8, targetY: 5.2, zoom: 1.16, label: "一层土之隔", speaker: "地面", caption: "刺刀先敲门板，再沿着墙根找空响。尘土从梁缝一粒粒落下。", effect: "bayonet", shake: .21 },
    { duration: 2.7, targetX: 6.4, targetY: 7.85, zoom: 1.25, label: "单口洞深处", speaker: "高传宝", caption: "人群只能继续向死角退。前面没有出口，后面仍有人往里进。", effect: "tunnelCrowd" }
  ]),
  singleExitCrisis: Object.freeze([
    { duration: 2.4, targetX: 7.2, targetY: 7.95, zoom: 1.5, label: "浮土下落", speaker: "高传宝", caption: "旧撑木开始吃力。门板只能暂时托住塌土，换不来一条退路。", effect: "collapse", shake: .28 },
    { duration: 2.7, targetX: 5.4, targetY: 7.75, zoom: 1.16, label: "空气越来越薄", speaker: "洞内", caption: "伤员、老人和孩子都挤在同一条线上。藏住了人，却让所有人的安危系在一个洞口上。", effect: "breath" },
    { duration: 2.7, targetX: 9.2, targetY: 7.7, zoom: 1.3, label: "这一夜的代价", speaker: "高传宝", caption: "等脚步走远，必须把教训说清楚。", effect: "stillness" }
  ]),
  prologueResolve: Object.freeze([
    { duration: 2.8, targetX: 9.2, targetY: 7.7, zoom: 1.5, label: "脚步远去", speaker: "高传宝", caption: "往后的形势只会更加困难。", effect: "stillness" },
    { duration: 3.1, targetX: 3.7, targetY: 6.5, zoom: .98, label: "从藏身洞开始改", speaker: "高传宝", caption: "地道要有支路、风路和第二出口；既能转移群众，也能让守庄的人换位。", effect: "networkDraft" },
    { duration: 3.2, targetX: 0, targetY: 5.3, zoom: .94, label: "序章 · 钟声与教训", speaker: "高家庄", caption: "钟声救下了这一夜。下一次，村子要靠一张连起来的地下路网活下来。", effect: "networkDraft" }
  ])
});

export const campaignData = Object.freeze([
  {
    id: "prologue",
    number: "序章",
    act: "第一幕 · 钟声与教训",
    title: "高老忠的钟声",
    date: "一九四二年五月 · 深夜",
    location: "黑风口外 · 高家庄",
    thesis: "夜袭失去突然性、群众被迫转入旧洞；那一夜证明，只能藏人的洞救不了下一次。",
    startX: -10,
    threat: true,
    introCinematic: "prologueOpening",
    actors: [
      { label: "夜袭归队员", profile: "youth", color: "#73a5c6", x: -10.3, layer: "surface", injured: true },
      { label: "高老忠", profile: "elder", color: "#d59b55", x: -6.8, layer: "surface" },
      { label: "赵婶", profile: "woman", color: "#7db8a4", x: -2.8, layer: "surface" },
      { label: "伤员", profile: "youth", color: "#7ea6c5", x: 4.5, layer: "tunnel", injured: true },
      { label: "高传宝", profile: "man", color: "#c77a65", x: 9.2, layer: "tunnel" }
    ],
    actions: [
      { id: "readBrokenSignal", x: -10.4, layer: "surface", kind: "signal", verb: "辨信号", title: "确认夜袭队伍已经失去联络", dialogue: "林青禾：约定的两短一长没有回来。枪声正往村子的方向压。", cinematicAfter: "raidLost" },
      { id: "receiveRunner", x: -8.8, layer: "surface", kind: "stretcher", verb: "接伤员", title: "问清敌人追来的方向", requires: ["readBrokenSignal"], dialogue: "夜袭归队员：路口先亮了车灯，我们刚展开就被火力压住。后队正带伤员撤，敌人跟过来了。", cinematicAfter: "runnerWarning" },
      { id: "ringAlarm", x: -6.8, layer: "surface", kind: "bell", verb: "敲钟", title: "让警报越过每一排屋脊", requires: ["receiveRunner"], dialogue: "高老忠：钟不是催大家乱跑。三声一停，各院按平日排好的次序走。", cinematicAfter: "bellAcrossVillage" },
      { id: "cutLanterns", x: -4.8, layer: "surface", kind: "lamp", verb: "压灯罩", title: "熄掉会暴露入口的院灯", requires: ["ringAlarm"], dialogue: "林青禾：留灶膛余火，院灯全灭。让远处看见的还是一座睡着的村子。" },
      { id: "gatherFamilies", x: -2.8, layer: "surface", kind: "group", verb: "逐户回应", title: "按院落次序聚拢群众", requires: ["cutLanterns"], dialogue: "赵婶：西院先走，伤员居中，最后一户必须由本人答应，不能只数影子。", cinematicAfter: "doorsAndFootsteps" },
      { id: "chooseEvacuation", x: .2, layer: "surface", kind: "choice", verb: "定路线", title: "让老人和担架避开村口灯火", requires: ["gatherFamilies"], dialogue: "林青禾：不是哪条路最近，而是哪条路还能让整队人不散。", puzzle: Puzzle("撤离路线", "追兵的车灯已压到村口；队伍里有老人、孩子和担架。", "ditch", [
        { id: "road", label: "走开阔村道", note: "路平，但会直接进入灯火和视线。" },
        { id: "ditch", label: "沿灌渠背坡", note: "坡缓、有遮挡，也能让担架转弯。" },
        { id: "wall", label: "翻越高墙", note: "年轻人能过，伤员和老人无法连续通过。" }
      ]), cinematicAfter: "evacuationDescent" },
      { id: "sealLastHatch", x: 3.8, layer: "surface", kind: "hatch", verb: "等人齐再合门", title: "让断后的最后一户进入旧洞", requires: ["chooseEvacuation"], dialogue: "林青禾：少一个回应，门板就不能落。", cinematicAfter: "hatchClosing" },
      { id: "endureSearch", x: 4.5, layer: "tunnel", kind: "listen", verb: "压住声息", title: "在脚步和刺刀声下护住伤员", requires: ["sealLastHatch"], crouch: true, dialogue: "赵婶：孩子的嘴别捂死，让他贴着衣襟慢慢喘。上面的脚步还没过完。", cinematicAfter: "searchAboveSoil" },
      { id: "clearDeadEnd", x: 7.2, layer: "tunnel", kind: "timber", verb: "托住塌土", title: "给拥堵的单口洞留出一线空气", requires: ["endureSearch"], crouch: true, dialogue: "高传宝：后面没有第二条路。先用门板托住浮土，别让人群再往死角挤。", cinematicAfter: "singleExitCrisis" },
      { id: "nameTheLesson", x: 9.2, layer: "tunnel", kind: "proof", verb: "定下改造", title: "把这一夜的教训变成下一步", requires: ["clearDeadEnd"], dialogue: "高传宝：往后的形势只会更加困难。藏身洞得改成能转、能救、也能打的地道。", cinematicAfter: "prologueResolve" }
    ]
  },
  {
    id: "chapterOne",
    number: "第一章",
    act: "第一幕 · 钟声与教训",
    title: "钟楼下的脚印",
    date: "一九四二年五月 · 天亮前",
    location: "高家庄外堤",
    thesis: "先把人和情报带回来，再承认旧办法已经走不通。",
    startX: -10,
    threat: true,
    actors: [
      { label: "杜小满", profile: "youth", color: "#73a5c6", x: -5.6, layer: "surface", injured: true },
      { label: "林霞", profile: "woman", color: "#8ab489", x: 7.4, layer: "tunnel" },
      { label: "赵区长", profile: "man", color: "#c69a6f", x: 9.4, layer: "tunnel" }
    ],
    actions: [
      { id: "readFootprints", x: -8.3, layer: "surface", kind: "tracks", verb: "辨脚印", title: "找出离开火线的方向", dialogue: "林青禾：新土压在旧车辙上，伤员往堤沟去了。" },
      { id: "liftXiaoman", x: -5.6, layer: "surface", kind: "stretcher", verb: "扶起", title: "先稳住杜小满", requires: ["readFootprints"], dialogue: "杜小满：图还在衣襟里，别让它落在路上。" },
      { id: "chooseCulvert", x: -1.2, layer: "surface", kind: "choice", verb: "选通路", title: "带伤员绕过搜查", requires: ["liftXiaoman"], dialogue: "林青禾：担架宽一肩，出口还得避开路灯。", puzzle: Puzzle("伤员通路", "三条路都能向村里走，但只有一条兼顾遮挡、坡度和担架宽度。", "culvert", [
        { id: "road", label: "堤顶直路", note: "最快，也完全暴露在巡逻视线里。" },
        { id: "culvert", label: "旧灌渠涵洞", note: "低矮但坡缓，担架可以侧转通过。" },
        { id: "well", label: "枯井绳道", note: "入口隐蔽，伤员却无法安全垂降。" }
      ]) },
      { id: "carryMap", x: 4.4, layer: "tunnel", kind: "map", verb: "护住残图", title: "穿过旧单口洞", requires: ["chooseCulvert"], crouch: true, dialogue: "林霞：这张图只剩半边，但能看出黑风口的火力缺口。" },
      { id: "admitDeadEnd", x: 9.1, layer: "tunnel", kind: "proof", verb: "复盘", title: "确认单口洞无法作战", requires: ["carryMap"], dialogue: "赵区长：没有支路、风路和第二出口，藏得住一时，救不了下一次。" }
    ]
  },
  {
    id: "chapterTwo",
    number: "第二章",
    act: "第一幕 · 钟声与教训",
    title: "藏身洞不能打仗",
    date: "一九四二年五月 · 数日后",
    location: "磨坊院与旧地窖",
    thesis: "把施工藏进真实生活声里，让第一批工具进入地下。",
    startX: -10,
    threat: true,
    actors: [
      { label: "赵婶", profile: "woman", color: "#7db8a4", x: -7.2, layer: "surface" },
      { label: "魏根生", profile: "man", color: "#c39a74", x: 2.4, layer: "tunnel" },
      { label: "石头", profile: "youth", color: "#79a9b5", x: 8.5, layer: "tunnel" }
    ],
    actions: [
      { id: "watchPatrol", x: -8.4, layer: "surface", kind: "listen", verb: "听脚步", title: "等巡逻转过磨坊墙", dialogue: "赵婶：灯影过墙以后，还有半圈脚步才真正走远。" },
      { id: "hideTools", x: -4.2, layer: "surface", kind: "cart", verb: "藏工具", title: "把短铲放进柴车真夹层", requires: ["watchPatrol"], crouch: true, dialogue: "林青禾：只带短铲、木楔和绳，车辙不能比平日更深。" },
      { id: "turnMill", x: .2, layer: "surface", kind: "choice", verb: "推磨", title: "用真实磨声遮住下工具", requires: ["hideTools"], dialogue: "赵婶：人每天推磨都有停顿，太齐反而像信号。", puzzle: Puzzle("磨声掩护", "怎样让声音仍像院里平日的劳作？", "uneven", [
        { id: "fast", label: "连续猛推", note: "声大但节奏机械，会让门外脚步停下。" },
        { id: "uneven", label: "半圈、停息、再推", note: "保留真实喘息和磨轴回声。" },
        { id: "silent", label: "完全停磨", note: "工具碰木声会单独暴露出来。" }
      ]) },
      { id: "redirectVent", x: 4.5, layer: "tunnel", kind: "vent", verb: "换风塞", title: "封旧灶下空响", requires: ["turnMill"], dialogue: "魏根生：施工风从后墙走，旧洞的回声不能再指向灶台。" },
      { id: "knockClear", x: 8.5, layer: "tunnel", kind: "signal", verb: "回三敲", title: "确认工具与人员全部入洞", requires: ["redirectVent"], dialogue: "石头：三下齐了。下一步不是挖得更深，是让每户都有另一条路。" }
    ]
  },
  {
    id: "chapterThree",
    number: "第三章",
    act: "第二幕 · 从藏身到战斗",
    title: "从藏身洞到战斗地道",
    date: "一九四三年春 · 连雨之后",
    location: "高家庄 · 三户相邻院落",
    thesis: "支护、排水、风路和出口必须同时成立。",
    startX: -10,
    threat: false,
    actors: [
      { label: "杜小满", profile: "youth", color: "#73a5c6", x: -7.5, layer: "tunnel" },
      { label: "魏根生", profile: "man", color: "#c39a74", x: 0, layer: "tunnel" },
      { label: "林霞", profile: "woman", color: "#8ab489", x: 8.1, layer: "tunnel" }
    ],
    actions: [
      { id: "testSoil", x: -8.2, layer: "tunnel", kind: "soil", verb: "敲土", title: "辨出短实干土与湿砂带", dialogue: "杜小满：短响能吃力，长闷响下面有水。" },
      { id: "carryTimber", x: -4.2, layer: "surface", kind: "timber", verb: "送门板", title: "把旧门板拆成短撑", requires: ["testSoil"], dialogue: "赵婶：每块木料背面刻出哪一户借的，坏了也知道去哪里补。" },
      { id: "braceWetBand", x: 0, layer: "tunnel", kind: "choice", verb: "摆支护", title: "让梁、水、人各走各的路", requires: ["carryTimber"], dialogue: "魏根生：梁脚不能吃湿砂，排水也不能截断担架线。", puzzle: Puzzle("湿砂弯支护", "雨后湿砂正在渗水，担架仍要通过转弯。", "split", [
        { id: "wet", label: "木柱扎进湿砂", note: "柱脚会慢慢下沉，梁木失去受力点。" },
        { id: "center", label: "排水沟开在人行中线", note: "水能走，但脚和担架会被切断。" },
        { id: "split", label: "干土支梁、低侧排水、高板通行", note: "三条功能线互不争位。" }
      ]) },
      { id: "openSecondExit", x: 4.5, layer: "tunnel", kind: "hatch", verb: "开翻口", title: "把第二出口接到东院", requires: ["braceWetBand"], dialogue: "林青禾：旧入口被堵以后，东院仍能让担架和两人并行出去。" },
      { id: "testAirflow", x: 8.2, layer: "tunnel", kind: "lamp", verb: "验灯焰", title: "确认防烟门后仍有清风", requires: ["openSecondExit"], dialogue: "林霞：三盏小焰同向立稳，灶烟没有回到主路。" }
    ]
  },
  {
    id: "chapterFour",
    number: "第四章",
    act: "第二幕 · 从藏身到战斗",
    title: "翻口里的特务",
    date: "一九四三年夏",
    location: "井台、粮棚与战斗地道",
    thesis: "让侦察者相信自己找到了入口，同时保护真正的地道网。",
    startX: -10,
    threat: true,
    actors: [
      { label: "便衣侦察", profile: "man", color: "#b66a5a", x: -2.2, layer: "surface" },
      { label: "孟嫂", profile: "woman", color: "#8eb093", x: 3.8, layer: "surface" },
      { label: "高传宝", profile: "man", color: "#c77a65", x: 8.5, layer: "tunnel" }
    ],
    actions: [
      { id: "inspectChalk", x: -8.2, layer: "surface", kind: "chalk", verb: "看白垩", title: "确认门石被做了记号", dialogue: "林青禾：白圈不是孩子画的，它只落在能听见空响的位置。" },
      { id: "inspectCoin", x: -4.2, layer: "surface", kind: "coin", verb: "看落点", title: "记住铜钱先实后散的回声", requires: ["inspectChalk"], crouch: true, dialogue: "林青禾：他不是丢钱，是用弹跳找地下空腔。" },
      { id: "followEcho", x: 0, layer: "tunnel", kind: "listen", verb: "隔土跟听", title: "把三次停步连成侦察路线", requires: ["inspectCoin"], dialogue: "杜小满：刮门石、弹铜钱、找凉风，三步都在缩向真入口。" },
      { id: "chooseDecoy", x: 4.2, layer: "surface", kind: "choice", verb: "定假线", title: "选一处不会伤到住户的假入口", requires: ["followEcho"], dialogue: "孟嫂：只能借原有痕迹，不能拿住家的屋脚做诱饵。", puzzle: Puzzle("假入口位置", "假线必须与主地道隔开，还要允许侧向翻口截住侦察者。", "granary", [
        { id: "home", label: "有人居住的正屋", note: "会把灌烟和塌方风险带到群众脚下。" },
        { id: "well", label: "全村取水的井台", note: "一旦暴露会切断日常用水，也没有侧向截击位。" },
        { id: "granary", label: "无人空粮棚", note: "已有绳槽、松板和废灶管，盲道可止于空屋。" }
      ]) },
      { id: "closeDecoy", x: 8.4, layer: "tunnel", kind: "hatch", verb: "扣翻口", title: "封真路并截住假线", requires: ["chooseDecoy"], dialogue: "高传宝：真路从内侧封住，假线只通两道木门之间。" }
    ]
  },
  {
    id: "chapterFive",
    number: "第五章",
    act: "第三幕 · 高家庄到黑风口",
    title: "高家庄保卫战",
    date: "一九四三年夏 · 报复扫荡",
    location: "高家庄 · 地上与地下防线",
    thesis: "群众安全先于还击，烟、担架与翻口必须同一时间调度。",
    startX: -10,
    threat: true,
    smoke: true,
    actors: [
      { label: "林霞", profile: "woman", color: "#8ab489", x: -7.4, layer: "tunnel" },
      { label: "伤员", profile: "youth", color: "#73a5c6", x: 0, layer: "tunnel", injured: true },
      { label: "魏根生", profile: "man", color: "#c39a74", x: 4.6, layer: "tunnel" },
      { label: "高传宝", profile: "man", color: "#c77a65", x: 8.6, layer: "surface" }
    ],
    actions: [
      { id: "readWarning", x: -8.4, layer: "surface", kind: "signal", verb: "传警讯", title: "让三院按顺序下洞", dialogue: "林青禾：西院先回应，担架居中，翻口射手最后换位。" },
      { id: "guideCrowd", x: -4.6, layer: "tunnel", kind: "group", verb: "点名", title: "把群众带进清洁风路", requires: ["readWarning"], dialogue: "林霞：不是数影子，每一户都要由本人回一声。" },
      { id: "moveStretcher", x: 0, layer: "tunnel", kind: "stretcher", verb: "换肩", title: "在窄弯逐端换担架", requires: ["guideCrowd"], crouch: true, dialogue: "伤员：前肩报稳，后肩再松，别为了我堵住后面的人。" },
      { id: "sealSmoke", x: 4.5, layer: "tunnel", kind: "choice", verb: "落防烟门", title: "隔断进烟支路而不拆承重", requires: ["moveStretcher"], dialogue: "魏根生：湿席只能争时间，最后一楔要等人员全齐。", puzzle: Puzzle("防烟门处置", "烟已进入旧支路，门板同时承担旧砖基重量。", "seal", [
        { id: "remove", label: "拆门板堵烟", note: "门板一拆，旧砖基会失去承重。" },
        { id: "open", label: "全开两路散烟", note: "烟会沿清洁风路追上群众。" },
        { id: "seal", label: "湿席减漏、清点齐后落楔", note: "保留承重并隔断进烟支路。" }
      ]) },
      { id: "openFlanks", x: 8.5, layer: "surface", kind: "hatch", verb: "开翻口", title: "从未暴露的东南口轮换还击", requires: ["sealSmoke"], dialogue: "高传宝：打一枪换一个位置，地上地下轮着打。" }
    ]
  },
  {
    id: "chapterSix",
    number: "第六章",
    act: "第三幕 · 高家庄到黑风口",
    title: "从西平到黑风口",
    date: "一九四三年秋 · 战略反击",
    location: "高家庄 · 西平 · 黑风口",
    thesis: "地道网不是一条长洞，而是每一站都有人守、有人回敲。",
    startX: -10,
    threat: true,
    network: true,
    actors: [
      { label: "守庄交通员", profile: "woman", color: "#7db8a4", x: -8.3, layer: "tunnel" },
      { label: "游击队长", profile: "man", color: "#83a36f", x: 2.2, layer: "surface" },
      { label: "赵区长", profile: "man", color: "#c69a6f", x: 6.2, layer: "surface" },
      { label: "高传宝", profile: "man", color: "#c77a65", x: 9.1, layer: "tunnel" }
    ],
    actions: [
      { id: "relayVillage", x: -8.4, layer: "tunnel", kind: "signal", verb: "松塞回敲", title: "由高家庄近墙站先确认", dialogue: "交通员：听瓮只管一墙，出了短弯必须等下一站真人回敲。" },
      { id: "relayField", x: -4.2, layer: "tunnel", kind: "listen", verb: "等回音", title: "拒绝无人回应的塌口", requires: ["relayVillage"], dialogue: "林青禾：左路只有土落，右路有人隔一口气回了两下。" },
      { id: "blockConvoy", x: .5, layer: "surface", kind: "cart", verb: "卸轴销", title: "让偷袭高家庄的头车卡在沟口", requires: ["relayField"], crouch: true, dialogue: "林霞：只卸轴销，不碰油箱，让后车以为头车还在修。" },
      { id: "joinForces", x: 4.5, layer: "surface", kind: "group", verb: "逐名接应", title: "把游击队和伤员接入下一短湾", requires: ["blockConvoy"], dialogue: "游击队长：人齐，伤员已过第一道门，援路由我们卡住。" },
      { id: "openFinalGate", x: 8.5, layer: "tunnel", kind: "choice", verb: "听齐开门", title: "让守庄、打援、攻坚同时展开", requires: ["joinForces"], dialogue: "高传宝：三站尾音齐了。背后出口开。", puzzle: Puzzle("联防网尾音", "三支力量必须逐站确认，不能用标记代替真人回应。", "relay", [
        { id: "early", label: "见信号旗就提前开门", note: "旗帜可能先到，人和伤员未必已经通过。" },
        { id: "direct", label: "等待最远一站直接长敲", note: "长距离土层会让信号失真，也跳过了中间责任站。" },
        { id: "relay", label: "每站听齐后重新回敲", note: "高家庄、野外口、西平逐站承担确认。" }
      ]) }
    ]
  }
]);

export const actorHeightRange = Object.freeze({
  minimum: Math.min(...Object.values(actorProfiles).map((profile) => profile.height)),
  maximum: Math.max(...Object.values(actorProfiles).map((profile) => profile.height))
});
