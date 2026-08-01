export const actorProfiles = Object.freeze({
  player: Object.freeze({ height: 1.72, shoulder: .34, head: .105 }),
  elder: Object.freeze({ height: 1.68, shoulder: .35, head: .11 }),
  woman: Object.freeze({ height: 1.64, shoulder: .32, head: .105 }),
  man: Object.freeze({ height: 1.74, shoulder: .36, head: .105 }),
  youth: Object.freeze({ height: 1.62, shoulder: .31, head: .108 }),
  soldier: Object.freeze({ height: 1.76, shoulder: .37, head: .103 })
});

const Puzzle = (title, brief, correct, options) => ({ title, brief, correct, options });

export const campaignData = Object.freeze([
  {
    id: "prologue",
    number: "序章",
    act: "第一幕 · 钟声与教训",
    title: "高老忠的钟声",
    date: "一九四二年五月 · 深夜",
    location: "黑风口外 · 高家庄",
    thesis: "一次受挫的夜袭，把全村推到只能藏、不能转身的旧洞里。",
    startX: -10,
    threat: true,
    actors: [
      { label: "高老忠", profile: "elder", color: "#d59b55", x: -8.4, layer: "surface" },
      { label: "赵婶", profile: "woman", color: "#7db8a4", x: -2.8, layer: "surface" },
      { label: "高传宝", profile: "man", color: "#c77a65", x: 7.8, layer: "tunnel" }
    ],
    actions: [
      { id: "ringAlarm", x: -8.2, layer: "surface", kind: "bell", verb: "敲钟", title: "让第一声越过屋脊", dialogue: "高老忠：钟声不是叫人往外跑，是让每户按次序进洞。" },
      { id: "gatherFamilies", x: -3.1, layer: "surface", kind: "group", verb: "点户", title: "按院落次序聚拢群众", requires: ["ringAlarm"], dialogue: "赵婶：西院先走，伤员居中，最后一户要有人亲口回应。" },
      { id: "chooseEvacuation", x: 1.2, layer: "surface", kind: "choice", verb: "定路线", title: "避开暴露的村口", requires: ["gatherFamilies"], dialogue: "林青禾：不是哪条路最近，而是哪条路还能让伤员和老人通过。", puzzle: Puzzle("撤离路线", "敌兵正从村口推进；群众中有伤员和老人。", "ditch", [
        { id: "road", label: "走开阔村道", note: "路平，但会直接进入灯火和视线。" },
        { id: "ditch", label: "沿灌渠背坡", note: "坡缓、有遮挡，也能让担架转弯。" },
        { id: "wall", label: "翻越高墙", note: "年轻人能过，伤员和老人无法连续通过。" }
      ]) },
      { id: "sealLastHatch", x: 4.8, layer: "surface", kind: "hatch", verb: "合门", title: "等最后一户下去再封口", requires: ["chooseEvacuation"], dialogue: "林青禾：少一个回应，门板就不能落。" },
      { id: "endureSearch", x: 7.6, layer: "tunnel", kind: "listen", verb: "压住声息", title: "在单口洞里听完搜查", requires: ["sealLastHatch"], crouch: true, dialogue: "高传宝：往后的形势只会更加困难。藏身洞得改成能转、能救、也能打的地道。" }
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
