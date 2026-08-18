// 《血战台儿庄》剧本 —— 纯数据，**不许 import three**。
//
// 编剧红线（出处见 docs/Data_HistoryQuotes.md 的 cautions 清单）：
//   · 长官叫兵「弟兄们」，兵叫长官按职务；禁「同志们」「国军弟兄们」「军座/师座」。
//   · 玩家在城内的直接长官是 186 团团长王冠五（团指挥所在清真寺），不是师长池峰城。
//     池峰城的第 31 师指挥所在城东南顺河街的新关帝庙（山西会馆），也在城里 ——
//     早先「师部在运河南岸」的写法是错的，已改。浮桥的分量不在于隔开了指挥层，
//     而在于它是全城唯一的退路与补给线：断了它，全师就只能背水站着。
//   · 别把日军写成「全军覆没」。四月五日坂本支队已接到转向沂州的命令，六日日没后
//     两支队转进（濑谷支队长甚至系独断离脱），主力撤到了峄县、枣庄。中方总攻与
//     日方撤退命令在时间上高度重叠 —— 这是双方叙事分歧的根源，回避它反而不真实。
//   · 结算不打「缴获坦克四十辆」。日军在该方向的装甲车辆总量级是战车 7 + 豆战车 39。
//   · 不给敢死队夜袭和断浮桥打日期字幕：史料里那两件事的日期各说各的。
//   · 结算不出精确歼敌数。
//   · 日军不喊「八格牙路」当口头禅；日方文书口语称中国军队为「支那兵」。
//   · 一九三八年三四月的日军还没有「屁帘」（垂布六月一日才配发），也还是立领昭五式。
//   · 「命都不要了，还要钱干什么」是一九八六年电影的台词，只能以旁白「据载」出现。
//
// 真实历史人物：王冠五（186 团团长）、王范堂（27 师 158 团 3 营 7 连连长，
// 五十七人敢死队队长）、陆诒（《新华日报》战地记者）。他们只做史料里有的事。
// 虚构人物：李长根（玩家）、刘振海、秦四喜、孟怀山、万有福 —— 用来承担
// 「无名者」的分量。台儿庄不是靠一个人守住的。

export const CAST = {
  player: { name: "李长根", note: "第 31 师 186 团 3 营 9 连 一等兵，河北雄县人，十九岁" },
  liu: { name: "刘振海", short: "班长", note: "9 连 3 班班长，河北景县人，老西北军，大刀是他教的" },
  qin: { name: "秦四喜", short: "秦四喜", note: "第 27 师 158 团 3 营 7 连，陕西泾阳人，翻墙进城增援的那一批" },
  meng: { name: "孟怀山", short: "连长", note: "9 连连长，河南人" },
  wang: { name: "王冠五", short: "团长", note: "第 31 师 186 团团长，守城总指挥（真实人物）" },
  fantang: { name: "王范堂", short: "王连长", note: "第 27 师 158 团 3 营 7 连连长，陕西石泉人（真实人物）" },
  luyi: { name: "陆诒", short: "记者", note: "《新华日报》战地记者（真实人物）" },
  wanyoufu: { name: "万有福", short: "老人", note: "台儿庄本地人，卖香油的" },
  narrator: { name: "", short: "" },
};

/**
 * 关卡表。
 * beats 的 at 触发式：
 *   start / end
 *   wave:N            第 N 波敌人出现时
 *   waveClear:N       第 N 波打完
 *   zone:名字          进入触发区
 *   event:名字         规则层派发的事件（破墙、炸车、桥断……）
 *   delay:秒           上一条之后过多久
 * type：title / line / shout / phone / narration / objective / note / hint
 */
export const LEVELS = [
  // =========================================================================
  {
    id: "L0_Wall",
    title: "序 · 上墙",
    place: "台儿庄 北寨墙",
    date: "一九三八年三月二十四日 午后",
    sky: "smokyDay",
    objective: "跟着班长上寨墙",
    brief: [
      "第五战区把台儿庄交给了第二集团军。",
      "这支部队是冯玉祥的旧部，杂牌，没有重炮，没有钢盔。",
      "对面是日军第十师团濑谷支队 —— 飞机、重炮、战车、掷弹筒。",
    ],
    beats: [
      { at: "start", type: "title", text: "台儿庄 · 北寨墙", sub: "一九三八年三月二十四日 午后" },
      { at: "start", type: "line", who: "liu", text: "长根，跟紧了。上墙。" },
      { at: "delay:2.5", type: "line", who: "liu", text: "这墙才四米，垛口不厚。别把脑袋支在一个地方超过两下。" },
      { at: "zone:Rampart", type: "hint", text: "鼠标右键 —— 依托垛口据枪" },
      { at: "zone:Rampart", type: "note", note: "Town" },
      { at: "zone:Rampart", type: "line", who: "meng", text: "弟兄们，把子弹省着点。打得着再打。" },
      { at: "zone:Rampart", type: "line", who: "liu", text: "听见没有？咱们一条弹带里，够数的没几格。" },
      { at: "zone:Rampart", type: "note", note: "Rifles" },
      { at: "event:FirstShell", type: "shout", who: "meng", text: "炮！趴下——！" },
      { at: "event:FirstShell", type: "objective", text: "守住寨墙，打退这一波" },
      { at: "wave:1", type: "line", who: "liu", text: "三八式的声儿脆，听见就低头。他们的重机枪慢，一下一下的，像啄木鸟。" },
      { at: "wave:2", type: "shout", who: "meng", text: "掷弹筒！贴墙根，别站直——" },
      { at: "wave:2", type: "hint", text: "掷弹筒是曲射，能越过垛口落进来。原地不动就是靶子" },
      { at: "waveClear:2", type: "line", who: "liu", text: "……又下去了。" },
      { at: "waveClear:2", type: "line", who: "liu", text: "长根，你数没数？咱们打退三回了，他们的人一回比一回多。" },
      { at: "waveClear:2", type: "line", who: "meng", text: "滕县那边，川军替咱们多守了三天。" },
      { at: "waveClear:2", type: "line", who: "meng", text: "师长王铭章，三月十七殉国了。他给上头的电报就一句：决心死拼，以报国家。" },
      { at: "waveClear:2", type: "note", note: "Wangmingzhang" },
      { at: "waveClear:2", type: "line", who: "liu", text: "咱们这几天，是从人家血里借的。" },
      { at: "end", type: "narration", text: "这一夜日军的炮没停。三天之后，寨墙塌了一个口子。" },
    ],
  },

  // =========================================================================
  {
    id: "L1_Breach",
    title: "一 · 破口",
    place: "台儿庄 北寨墙 · 城内",
    date: "一九三八年三月二十七日 晨五时三十分",
    sky: "dawn",
    objective: "堵住缺口",
    brief: [
      "三月二十七日晨五时三十分，日军突入城内。",
      "从这一刻起，守的不再是墙，是一间一间的房子。",
    ],
    beats: [
      { at: "start", type: "title", text: "破口", sub: "一九三八年三月二十七日 晨五时三十分" },
      { at: "start", type: "shout", who: "meng", text: "北墙破了！三班跟我上——" },
      { at: "wave:1", type: "line", who: "liu", text: "进来了。别在街当中站着，往墙根靠！" },
      { at: "event:MengDown", type: "shout", who: "liu", text: "连长！——连长！" },
      { at: "event:MengDown", type: "delay", seconds: 1.2 },
      { at: "event:MengDown", type: "line", who: "liu", text: "……长根，你听着。他倒了我上，我倒了你上。" },
      { at: "event:MengDown", type: "line", who: "liu", text: "这话不是我说的，是上头传下来的。一层一层传到咱们这儿，就这么一句。" },
      { at: "event:MengDown", type: "note", note: "LastFiveMinutes" },
      { at: "event:MengDown", type: "objective", text: "退进街巷，堵住巷口" },
      { at: "zone:Alley", type: "note", note: "NoWindows" },
      { at: "zone:Alley", type: "line", who: "liu", text: "咱这儿的房子对外不开窗，街两边全是死墙。他们看不见咱，咱也看不见他们。" },
      { at: "zone:Alley", type: "line", who: "liu", text: "所以得凿墙。凿出个眼儿来打，凿出个洞来过人。" },
      { at: "zone:Alley", type: "hint", text: "看准发白的砖缝，按住 E —— 凿墙" },
      { at: "event:FirstBreach", type: "note", note: "RoomWar" },
      { at: "event:FirstBreach", type: "line", who: "liu", text: "这就叫室战墙战。一堵墙两边，各趴一个人。" },
      { at: "wave:3", type: "shout", who: "liu", text: "手榴弹！——先扔后进！" },
      { at: "waveClear:3", type: "line", who: "liu", text: "巷口堵上了。" },
      { at: "waveClear:3", type: "line", who: "liu", text: "北头是他们的了。往南退，团部在清真寺。" },
      { at: "waveClear:3", type: "line", who: "liu", text: "记着西门 —— 城里对外就剩那一个口子了。" },
      { at: "end", type: "narration", text: "这一天之后，台儿庄城里再没有一条完整的街。" },
    ],
  },

  // =========================================================================
  {
    id: "L2_RoomWar",
    title: "二 · 室战墙战",
    place: "台儿庄 城内 · 清真寺一带",
    date: "一九三八年三月下旬",
    sky: "burningStreet",
    objective: "沿墙洞推进到清真寺",
    brief: [
      "清真寺是 186 团的指挥所。",
      "中日双方在这里拉锯了七天七夜。",
      "今天寺墙上还留着弹孔 —— 西小讲堂南外墙，每平方米上百个。",
    ],
    beats: [
      { at: "start", type: "title", text: "室战墙战", sub: "一九三八年三月下旬" },
      { at: "start", type: "line", who: "liu", text: "一间房打两三天，这不新鲜。" },
      { at: "zone:Courtyard", type: "line", who: "wanyoufu", text: "老总，喝口水吧。" },
      { at: "zone:Courtyard", type: "line", who: "liu", text: "老人家，您怎么还在城里？昨儿不是叫都出去了吗？" },
      { at: "zone:Courtyard", type: "line", who: "wanyoufu", text: "我这把年纪，出去了也是死在道上。" },
      { at: "zone:Courtyard", type: "line", who: "wanyoufu", text: "缸里还有半缸水。你们打完了自己舀。" },
      { at: "event:TankIn", type: "shout", who: "liu", text: "战车！别往街当中跑——" },
      { at: "event:TankIn", type: "line", who: "liu", text: "这巷子才两米宽，它进来了转不了身，也抬不起炮打屋顶。" },
      { at: "event:TankIn", type: "objective", text: "上院墙，用集束手榴弹" },
      { at: "event:TankIn", type: "hint", text: "五到七枚去柄，捆在一枚带柄的上 —— 按住投掷键蓄力，从高处砸下去" },
      { at: "event:TankIn", type: "note", note: "Grenade" },
      { at: "event:TankDead", type: "line", who: "liu", text: "成了。" },
      { at: "event:TankDead", type: "line", who: "liu", text: "咱们全战区就那么几门战防炮，还都在别处。剩下的，就是这个了。" },
      { at: "zone:Mosque", type: "note", note: "Mosque" },
      { at: "zone:Mosque", type: "line", who: "qin", text: "喂——哪部分的？" },
      { at: "zone:Mosque", type: "line", who: "liu", text: "三十一师一八六团。你呢？" },
      { at: "zone:Mosque", type: "line", who: "qin", text: "二十七师一五八团七连，秦四喜。前天翻墙进来的。" },
      { at: "zone:Mosque", type: "line", who: "liu", text: "翻墙？" },
      { at: "zone:Mosque", type: "line", who: "qin", text: "城门进不来了嘛。师长一句话，全连搭人梯上去，再从里头跳下来。" },
      { at: "zone:Mosque", type: "line", who: "qin", text: "跳下来腿摔断俩，剩下的都在。" },
      { at: "zone:Mosque", type: "line", who: "wang", text: "——都别在院里挤着。日本人的炮眼里，人堆最值钱。" },
      { at: "zone:Mosque", type: "line", who: "liu", text: "团长。" },
      { at: "zone:Mosque", type: "line", who: "wang", text: "东边的墙让他们凿穿了两处，得夺回来。" },
      { at: "zone:Mosque", type: "line", who: "wang", text: "白天让出去的，夜里得拿回来。他们的飞机、坦克、大炮，夜里都不好使。" },
      { at: "zone:Mosque", type: "objective", text: "守住清真寺东墙" },
      { at: "waveClear:5", type: "line", who: "wang", text: "守住了。" },
      { at: "waveClear:5", type: "line", who: "wang", text: "……刚跟师部通了话。运河上那道浮桥，断了。" },
      { at: "waveClear:5", type: "note", note: "Pontoon" },
      { at: "waveClear:5", type: "line", who: "liu", text: "断了？那……粮弹怎么上来，伤号怎么下去？" },
      { at: "waveClear:5", type: "line", who: "wang", text: "上头的命令是：有敢退过运河的，杀无赦。" },
      { at: "waveClear:5", type: "line", who: "wang", text: "现在退不了了。省事。" },
      { at: "end", type: "narration", text: "第三十一师这一仗用掉三十万余枚手榴弹。仗打完，地上的弹皮积了十厘米厚。" },
    ],
  },

  // =========================================================================
  {
    id: "L3_WhiteTowel",
    title: "三 · 白毛巾",
    place: "台儿庄 城西北角",
    date: "一九三八年三月底 · 夜",
    sky: "night",
    objective: "跟着敢死队摸上去",
    brief: [
      "大战期间，台儿庄的守军组织了两百多支敢死队。",
      "队员每人背八枚手榴弹，步枪上刺刀，身后一把大刀。",
      "臂上、头上缠一条白毛巾 —— 那是黑夜里唯一能分清敌我的东西。",
    ],
    beats: [
      { at: "start", type: "title", text: "白毛巾", sub: "城西北角 · 夜" },
      { at: "start", type: "line", who: "fantang", text: "我姓王，王范堂。二十七师一五八团三营七连，连长。" },
      { at: "start", type: "line", who: "fantang", text: "西北角丢了三天。今晚拿回来。" },
      { at: "start", type: "line", who: "fantang", text: "要人。愿意去的，站出来。" },
      { at: "delay:2.0", type: "narration", text: "没有人喊。队伍往前挪了一步。" },
      { at: "delay:4.5", type: "line", who: "qin", text: "……长根，你别去。你才十九。" },
      { at: "delay:6.0", type: "line", who: "liu", text: "他去。我也去。" },
      { at: "delay:7.5", type: "line", who: "fantang", text: "五十七个。够了。" },
      { at: "event:TowelOn", type: "hint", text: "缠上白毛巾 —— 夜里，白的是自己人" },
      { at: "event:TowelOn", type: "note", note: "WhiteTowel" },
      { at: "event:TowelOn", type: "line", who: "fantang", text: "每人八枚手榴弹，上刺刀，大刀背身后。" },
      { at: "event:TowelOn", type: "line", who: "fantang", text: "赏钱一人三十块大洋，团部发下来了。" },
      { at: "event:TowelOn", type: "narration", text: "据载，队员没有接那笔钱。" },
      { at: "event:TowelOn", type: "line", who: "liu", text: "……揣着也没处花。" },
      { at: "event:PoemRead", type: "narration", text: "出发前，二十七师师长黄樵松写下四句，据载是给敢死队的。" },
      { at: "event:PoemRead", type: "narration", text: "昨夜梦中炮声隆，朝来榴花遍地红。" },
      { at: "event:PoemRead", type: "narration", text: "英雄效命咫尺外，榴花原是血染成。" },
      { at: "event:Sneak", type: "objective", text: "摸到日军哨位，不要开枪" },
      { at: "event:Sneak", type: "hint", text: "枪声一响就暴露了。近身用大刀 —— 按住 Shift 放轻脚步" },
      { at: "event:Sneak", type: "note", note: "Dadao" },
      { at: "event:Alarm", type: "shout", who: "fantang", text: "打！手榴弹全撒出去——" },
      { at: "event:Alarm", type: "objective", text: "夺回西北角" },
      { at: "event:LiuDown", type: "line", who: "liu", text: "……长根。" },
      { at: "event:LiuDown", type: "line", who: "liu", text: "刀……你拿着。" },
      { at: "event:LiuDown", type: "line", who: "liu", text: "我这把是喜峰口那年发的。使了五年了。" },
      { at: "event:LiuDown", type: "delay", seconds: 2.0 },
      { at: "event:LiuDown", type: "line", who: "liu", text: "……班长这个位置，你顶上。" },
      { at: "waveClear:9", type: "line", who: "fantang", text: "西北角拿回来了。" },
      { at: "waveClear:9", type: "narration", text: "这一夜出去五十七个人。回来十三个。" },
      { at: "waveClear:9", type: "note", note: "DareToDie" },
      { at: "end", type: "narration", text: "这样的队伍，那半个月里出去了两百多支。" },
    ],
  },

  // =========================================================================
  {
    id: "L4_LastFiveMinutes",
    title: "四 · 最后五分钟",
    place: "台儿庄 城内",
    date: "一九三八年四月六日 夜",
    sky: "night",
    objective: "撑到反攻信号",
    brief: [
      "四月四日深夜，孙连仲报告伤亡逾十分之七，请求撤过运河。",
      "李宗仁不准。",
      "「胜负之数决定于最后五分钟。」",
    ],
    beats: [
      { at: "start", type: "title", text: "最后五分钟", sub: "一九三八年四月六日 夜" },
      { at: "start", type: "phone", who: "wang", text: "……是。是。第二集团军还剩多少，总司令那边清楚。" },
      { at: "start", type: "phone", who: "wang", text: "……知道了。绝对服从命令。" },
      { at: "delay:3.0", type: "line", who: "wang", text: "总司令跟长官部回的话，传下来了。" },
      { at: "delay:4.5", type: "line", who: "wang", text: "——我绝对服从命令，整个集团军打完为止。" },
      { at: "delay:6.5", type: "note", note: "LastFiveMinutes" },
      { at: "delay:7.5", type: "line", who: "wang", text: "长官部还有一句：胜负决定于最后五分钟。" },
      { at: "delay:9.5", type: "line", who: "qin", text: "……还剩几分钟啊。" },
      { at: "delay:11.0", type: "line", who: "wang", text: "不知道。撑住就是了。" },
      { at: "wave:1", type: "objective", text: "守住阵地，等反攻信号" },
      { at: "wave:2", type: "shout", who: "qin", text: "长根！我这儿没子弹了——" },
      { at: "wave:2", type: "hint", text: "从阵亡者身上取弹 —— 靠近按 E" },
      { at: "wave:4", type: "line", who: "wang", text: "担架兵、炊事兵、伙夫，能拿枪的都上来了。" },
      { at: "wave:4", type: "line", who: "wang", text: "团部现在没有后方了。这儿就是后方。" },
      { at: "event:QinDown", type: "line", who: "qin", text: "……长根，我们连翻墙进来那天，我娘还不知道。" },
      { at: "event:QinDown", type: "line", who: "qin", text: "陕西泾阳，仵家庄东头第三家。你要是能出去……" },
      { at: "event:QinDown", type: "delay", seconds: 2.5 },
      { at: "event:QinDown", type: "narration", text: "他没说完。" },
      { at: "event:Signal", type: "shout", who: "wang", text: "——信号！全线反攻！" },
      { at: "event:Signal", type: "objective", text: "跟上，往北打" },
      { at: "event:Signal", type: "narration", text: "四月七日凌晨一时。" },
      { at: "waveClear:8", type: "narration", text: "日军残部向峄县、枣庄退却。" },
      { at: "end", type: "title", text: "台儿庄", sub: "一九三八年四月七日 清晨" },
    ],
  },

  // =========================================================================
  {
    id: "L5_Morning",
    title: "尾声 · 清晨",
    place: "台儿庄 城内",
    date: "一九三八年四月七日 清晨",
    sky: "dawn",
    objective: "走出去",
    playable: "walk",
    brief: [],
    beats: [
      { at: "start", type: "line", who: "luyi", text: "老总，能问一句吗？我是《新华日报》的，姓陆。" },
      { at: "delay:2.5", type: "line", who: "luyi", text: "……你们守了半个月？" },
      { at: "delay:5.0", type: "line", who: "luyi", text: "报社要我写一篇。你想让外头知道点什么？" },
      { at: "delay:8.0", type: "narration", text: "（李长根没有回答。他在数街两边的门牌。）" },
      { at: "zone:Ruin", type: "note", note: "Reporters" },
      { at: "zone:Ruin", type: "line", who: "wanyoufu", text: "老总……我这半缸水，你们还没舀呢。" },
      { at: "zone:Ruin", type: "note", note: "Numbers" },
      { at: "zone:End", type: "epilogue" },
    ],
  },
];

/** 主菜单文案。 */
export const MENU = {
  title: "血战台儿庄",
  subtitle: "一九三八年三月二十三日 — 四月七日 · 山东峄县",
  lines: [
    "抗战爆发以来，正面战场的第一次大捷。",
    "守军是杂牌，没有重炮，没有钢盔。",
    "他们守住了。",
  ],
  start: "开始",
  chapters: "选章",
  codex: "史实注记",
  credits: "关于",
};

/** 关于页：把史料立场说清楚。 */
export const CREDITS = [
  "《血战台儿庄》 —— 浏览器 FPS 原型",
  "",
  "剧情依据公开史料写成，可信度分三档：信史 / 主流记载 / 流传待考。",
  "游戏台词只建立在前两档上；第三档的材料（例如敢死队掷还赏金那句话）",
  "一律以旁白「据载」的语气出现，不当作角色的第一人称经历。",
  "",
  "真实历史人物：王冠五、王范堂、陆诒、王铭章、黄樵松、孙连仲、李宗仁、池峰城。",
  "他们在本作中只做史料里有的事。",
  "李长根、刘振海、秦四喜、孟怀山、万有福为虚构人物 ——",
  "台儿庄城内伤亡逾十分之七的那支部队里，绝大多数人没有留下名字。",
  "",
  "考据底本见 docs/ 目录下三份文件，逐条附出处。",
  "美术与音效全部程序化生成，未使用任何外部素材。",
];
