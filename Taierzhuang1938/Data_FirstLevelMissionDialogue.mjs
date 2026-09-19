import { MISSION_GUIDE_DIALOGUE } from "./Data_FirstLevelGuideDialogue.mjs";
import { JAPANESE_SPEECH } from "./Data_FirstLevelJapaneseSpeech.mjs";
// 第一关 2026.09.19 重构版台词表。一段连续多人对白 = 一个 cue = 一次 SeedAudio 请求 = 一条音频。
// 台词逐字取自 docs/Data_FirstLevelRebuildSource20260919.md（Notion 采用稿），不许改字改标点。
// 行的形状：{ who, text, tts?, subtitle?, lang? }
//   · text     台词正文，同时是屏幕字幕的默认文本。日语行这里放 Notion 括号里的中文译文。
//   · tts      送 SeedAudio 的写法（缺省 = text）。日语行的假名不写在这里，见下。
//   · subtitle 屏幕文本覆盖（缺省 = text）。
//   · lang     该行的语言，缺省 "zh"；"ja" 的行由 Data_FirstLevelJapaneseSpeech 提供假名。
// 取用一律走 MissionVoiceSpoken() / MissionVoiceSubtitle()，别直接读 line.text 当「念的内容」。
export const MISSION_VOICE_CAST = Object.freeze({
  shunzi: ["顺子", "二十多岁四川男兵，嘴硬、精明，害怕时说话急，但不是喜剧腔"],
  yaowa: ["幺娃", "十八岁四川男兵，清亮年轻，嘴快，受到惊吓会结巴、重复，不能沉稳播音"],
  heyoutian: ["何有田", "二十多岁四川男兵，粗嗓门，生活化挖苦，战斗时短促直接"],
  liuwencai: ["刘文财", "二十多岁四川男兵，较细干嗓，认真计较弹药，报数清楚"],
  luo: ["罗班长", "三十多岁四川班长，低沉沙哑有力量，吼命令不用播音腔"],
  zhou: ["老周", "三十多岁四川伤兵，腿伤疼痛，初期还嘴硬，重伤后气弱短句"],
  bearer: ["担架员", "四川成年男性，劳累喘气，抬担架时短促报路"],
  runner: ["传令兵", "年轻四川男兵，奔跑后气喘，命令说清楚"],
  ijaA: ["日兵甲", "1938年日本陆军步兵，成年男性，短促粗暴的日语命令，只说稿中日语假名，不说中文"],
  ijaB: ["日兵乙", "1938年日本陆军步兵，成年男性，比甲更闷更沉的日语吼叫，只说稿中日语假名，不说中文"],
  captiveWounded: ["伤兵", "腿骨断了的四川伤兵，疼得发抖还嘴硬，从牙缝里骂出来，与老周声音不同"],
  captiveHelper: ["扶人川军", "四川成年男兵，拖着同伴已经脱力，被枪托砸倒后还挣扎出声"],
  guard: ["守军", "四川前沿守军，跑动后气喘，隔着枪声喊话要让人听清"],
  keeper: ["留守兵", "守弹药屋的四川老兵，嗓子哑，交代东西干脆"],
  loader: ["接运兵", "桥头接运点的四川男兵，整天喊人分流，声音大而例行"],
  drover: ["赶车人", "赶牛马车的四川壮年男人，不是军人，带吆喝牲口的腔调"],
  picket: ["警戒兵", "转运点警戒的四川男兵，端着枪喊话，短促有底气"],
  rearBearer: ["后抬手", "抬担架后端的四川男人，手臂脱力，说话带喘"],
  frontBearer: ["前抬手", "抬担架前端的四川男人，看路报路，稳而短"],
  gateGuard: ["院门守军", "守院门的四川哨兵，先喝止再放行，戒备但不凶狠"],
  receiver: ["接收人员", "临时接收处的四川男人，手上一直没停，交代位置干脆"],
  surgeon: ["军医", "四川中年军医，疲惫、语速平，确认死亡时不带戏剧腔"],
  officer: ["桥头军官", "四川军官，隔着桥面喊话，命令清楚有权威"],
  usher: ["带路军人", "夜里带路的四川男兵，扯着嗓子招呼人跟上"],
  crowd: ["有人", "现场不具名的四川男声，隔着人群远远喊出来"],
});
const Cue = (id, lines, extra = {}) =>
  Object.freeze({
    id,
    file: `AudioVoice_FirstLevel${id}.mp3`,
    lines: lines.map(([who, text, more]) => Object.freeze({ who, text, ...(more || {}) })),
    ...extra,
  });
/** 送 TTS 的写法：日语行取假名侧表，其余取 line.tts ?? line.text。 */
export function MissionVoiceSpoken(cue, index) {
  const line = cue.lines[index];
  return JAPANESE_SPEECH[`${cue.id}:${index}`]?.kana ?? line.tts ?? line.text;
}
/** 屏幕字幕文本（日语行显示中文译文）。 */
export const MissionVoiceSubtitle = (cue, index) => cue.lines[index].subtitle ?? cue.lines[index].text;
/**
 * 对齐与清单绑定用的「当前台词」规范串。baker、门禁与 Script_FirstLevelVoiceAlign.py
 * 三处共用同一口径：只取 who 与 text，逐行字段（tts/subtitle/lang）不进哈希。
 */
export const MissionVoiceScriptJson = (cue) =>
  "[" + cue.lines.map((line) =>
    '{"who": ' + JSON.stringify(line.who) + ', "text": ' + JSON.stringify(line.text) + "}").join(", ") + "]";
/** 强制对齐脚本读这个：每行给出真正念出来的文本与语言（函数形态，不会被界面字表扫到）。 */
export function MissionVoiceAlignmentCues() {
  return MISSION_DIALOGUE.map((cue) => ({
    id: cue.id,
    file: cue.file,
    guidance: !!cue.guidance,
    scriptJson: MissionVoiceScriptJson(cue),
    lines: cue.lines.map((line, index) => ({
      who: line.who, text: MissionVoiceSpoken(cue, index), lang: line.lang || "zh",
    })),
  }));
}
export const MISSION_DIALOGUE = Object.freeze([
  // 01 黑屏、爆炸、受困
  Cue("BunkerBanter", [
    ["yaowa", "顺哥，挪点过去。"],
    ["shunzi", "再挪老子坐地上了。"],
    ["yaowa", "你把包抱起嘛！"],
    ["shunzi", "莫扯！东西掉出来了！"],
    ["luo", "幺娃！出来搭把手！"],
    ["yaowa", "来了！顺哥，你那个——"],
  ], {
    soundscape: "黑屏中的小型掩蔽部：厚土层外一声接一声的闷炮，头顶碎土簌簌落下，近处装备带扣、水壶饭盒碰撞和挪动的鞋底刮土；没有枪声特写，全部低于人声。",
    delivery: "四个人挤在小掩蔽部里，日常拌嘴、不慌，声音贴得很近。**六句一句不许省，开头第一句就要有人说话，每个字都要在闷炮上面听得清楚**，不要拿环境声开场。第五句是罗班长在门外隔着土墙喊进来，位置明显更远。末句「来了！顺哥，你那个——」说到「你那个」时被一声近距离爆炸硬生生切断：破折号后不许补字、不许收尾、不留余音，整条录音在这一下立刻结束，后面不要任何台词，爆炸余响也不要拖过两秒。",
  }),
  Cue("BunkerKilling", [
    ["ijaA", "站起来！快点！", { lang: "ja" }],
    ["captiveWounded", "站你妈……老子腿断了！"],
    ["captiveHelper", "日你先人——"],
    ["ijaB", "杀了他！快点！", { lang: "ja" }],
  ], {
    delivery: "门外八到十米，动作短、粗暴、连续，不给双方留下谈判或等待投降的停顿。日兵甲边推进边吼日语；腿伤的川军疼得发抖仍从牙缝里骂回去；扶人的川军挣扎着要起身，话说到破折号处被踹开截断；日兵乙紧跟着下令。四句咬得很紧，中间不要长空档。",
  }),
  Cue("BunkerSearch", [
    ["ijaA", "检查里面！", { lang: "ja" }],
    ["ijaB", "里面还有人！", { lang: "ja" }],
  ], {
    delivery: "两名日军刚踢开尸体旁的步枪，把枪口转向掩蔽部门内。两句都是短促粗暴的日语命令，第二句更压更急，中间只隔一次呼吸。全程日语，不出现任何中文。",
  }),
  Cue("ShunziCurse", [
    ["shunzi", "狗日的……老子日你先人……"],
  ], {
    delivery: "顺子侧躺在坍塌的后半间，手被木架卡住，隔着几米看完门外的杀害。压着嗓子、几乎是气声，牙关咬着，怕被外头听见；恨意压在喉咙里，不许吼出来。",
  }),
  // 02 班长救人，撤入后交通壕
  Cue("RescueCall", [
    ["yaowa", "顺哥！"],
    ["shunzi", "这儿！老子卡起了！"],
    ["luo", "莫乱扯！哪只手压住了？"],
  ], {
    delivery: "幺娃在坍塌堆外头找人，喊得又急又亮；顺子从碎木底下应声，闷、带尘；罗班长一边扒开缺口一边问，沉稳压着火。三句一句叠一句。",
  }),
  Cue("RescueLift", [
    ["luo", "手抽出来！"],
    ["shunzi", "包还卡到！"],
    ["luo", "幺娃，扯住带子！一、二——起！"],
  ], {
    delivery: "罗班长挤进缺口开始搬木架。第三句的「一、二——起」是三个人一起发力的号子：数到二拖长半拍，「起」要短、爆发、带上真用力的憋气声，落在这条录音的最后。",
  }),
  Cue("RescueOut", [
    ["luo", "枪拿到！从后头走！"],
  ], {
    delivery: "罗班长把人拽起来后立刻推他走，一口气两句命令，短、硬、带喘。",
  }),
  Cue("TrenchCurse", [
    ["shunzi", "狗日的！老子日你先人！"],
    ["heyoutian", "脑壳缩回来！你他妈站起给他打嗦！"],
    ["luo", "文财，带幺娃走！顺子跟我！"],
  ], {
    delivery: "顺子进沟后终于敢骂出声，怒和后怕一起冲出来；何有田一把把他按下去，粗嗓门带挖苦；罗班长立刻分派，不理这一茬。",
  }),
  Cue("CornerCheck", [
    ["yaowa", "哪儿遭了？"],
    ["shunzi", "没遭！莫扯，痛！"],
    ["yaowa", "喊你半天不应，老子还以为——"],
  ], {
    delivery: "沟道折角处停下来，幺娃上手翻顺子身上找伤口；顺子嫌烦、甩开他，「痛」是被碰到时真吸了一口气。幺娃第三句刚说到破折号就被外头喊话截断，话不说完。",
  }),
  Cue("SupportOrder", [
    ["guard", "东头丢了！西边机枪还在顶，前头那几个下不来！"],
    ["luo", "沿哪条沟？"],
    ["guard", "这边！排长叫你们接他们下来！"],
    ["luo", "跟上！先把人接了！"],
  ], {
    delivery: "撤回来的守军是跑着过来的，气都没匀，三句话赶着说完；罗班长问得极短，最后一句转头对自己班喊，音量明显抬上去。",
  }),
  // 03 接回第一批守军
  Cue("FrontBlockade", [
    ["zhou", "右边破墙！冒火那个口子！"],
    ["luo", "顺子，压住那边！让他们下来！"],
  ], {
    delivery: "老周趴在机枪位上，一边打一边扭头吼指示，嗓子已经喊哑；罗班长在他旁边隔着枪声下令。两句都必须盖过枪声被听清。",
  }),
  // 04 接替火力，战车压口
  Cue("TakeOverGun", [
    ["zhou", "外头还有人！"],
    ["luo", "看到了！顺子，接这边！"],
  ], {
    delivery: "老周腿伤恶化正被架下枪位，这句是撑着最后一口气喊的，尾音发虚；罗班长应一声就把人换上去。",
  }),
  Cue("TankTerror", [
    ["heyoutian", "妈卖批……战车过来了！"],
    ["luo", "都下去！莫站枪口上！"],
  ], {
    soundscape: "前沿机枪位：近处重机枪点射与弹壳落地，道路方向传来越来越近的履带碾压、发动机低频和护卫步兵的脚步；远处炮弹落点持续。",
    delivery: "何有田先是低声骂了半句——那是看清来的是什么东西时的一愣——后半句才喊出来；罗班长立刻把所有人压下去，吼得很硬。",
  }),
  Cue("BundleOrder", [
    ["guard", "北头弹药屋还有集束弹！"],
    ["luo", "何有田接枪！文财看沟口！顺子跟我！"],
  ], {
    delivery: "守军从最后遮挡后面喊过来，离得有点远；罗班长三道分派一口气排完，一句比一句短。",
  }),
  // 05 班长带路取弹，炸停战车
  Cue("BundleGo", [
    ["heyoutian", "走！这边老子顶到！"],
    ["luo", "它看那边了！现在走！"],
  ], {
    delivery: "何有田在机枪后面咬着牙喊，射击声就在他嘴边；罗班长盯着战车炮塔转向的那一瞬间开口，「现在走」要有抓住空当的果断。",
  }),
  Cue("BundleProne", [
    ["luo", "趴下！它转过来了！"],
  ], {
    delivery: "罗班长一把把人按到沟底，喊声短而炸，先出声后补气。",
  }),
  Cue("BundleSupply", [
    ["keeper", "那边！就剩这些了！"],
    ["luo", "拿起，原路回！"],
  ], {
    soundscape: "前沿弹药屋里：土墙压住外头的枪炮，近处木箱翻动、金属弹药碰撞、脚步在碎砖上打滑；屋外远处履带声持续。",
    delivery: "留守兵嗓子已经哑了，一边指一边说；罗班长拿到就走，不寒暄。",
  }),
  Cue("BundleReturnCall", [
    ["heyoutian", "班长！它往沟口挤了！"],
    ["luo", "听到了！顺子，跟紧！"],
  ], {
    delivery: "何有田的声音明显在很远的地方，隔着一段沟喊过来，要有距离感和回荡；罗班长在近处应答，音量正常。",
  }),
  Cue("TankStopped", [
    ["heyoutian", "停了！"],
    ["luo", "莫伸脑壳！后头的人先过！"],
  ], {
    delivery: "何有田喊出来的是确认不是欢呼，短促一声；罗班长立刻把人压回遮挡后面，不许起身看。",
  }),
  // 06 回到伤员集结处，接下后送
  Cue("Volunteer", [
    ["runner", "这里有人接！你们班护着伤员往南，送到桥头接运点！"],
    ["luo", "交完人去哪？"],
    ["runner", "有人再给你们指路！"],
    ["shunzi", "我跟后送队。"],
    ["luo", "你跟我走前头。何有田、文财看后头，幺娃照看周哥！"],
  ], {
    delivery: "传令兵跑过来传令，气还没匀；罗班长问得干脆；顺子那句是主动争取，说得比平时快半拍，还想显得随口；罗班长不接他的茬，直接排人。",
  }),
  Cue("BorrowLight", [
    ["zhou", "兄弟，有火没得？"],
    ["shunzi", "烟喃？"],
    ["zhou", "嘴里不是嗦。"],
    ["shunzi", "老子说我的。"],
    ["zhou", "……就剩这一根了。"],
    ["shunzi", "那你先叼到。"],
    ["zhou", "拿去。借你个火，还要搭根烟。"],
    ["shunzi", "不是最后一根？"],
    ["zhou", "这下是了。"],
  ], {
    delivery: "老周靠在土壁边等担架，嘴里叼着一根没点着的纸烟，腿伤让他动一下就抽气。两人是刚混个脸熟的陌生人，互相占便宜、都不肯吃亏，语气是懒洋洋的斗嘴，不是温情。**这条录音里要留两处动作空当**：第五句之后停约两秒（顺子把火柴往兜里一收），第六句之后停约三秒（老周瞪他一眼，从衣襟里摸出压扁的纸烟包，又抽出一根递过去）。停顿里只有环境声和衣料摩擦，不许有台词、不许有笑声。最后一句轻描淡写地认栽。",
  }),
  Cue("ZhouLift", [
    ["bearer", "周哥，走了！"],
    ["zhou", "等哈，烟才点起。"],
    ["bearer", "上担架再抽！"],
    ["zhou", "催命嗦。"],
  ], {
    delivery: "担架员过来催，例行公事的大嗓门；老周含着烟说话，含混、赖着不肯动，最后一句是嘟囔给自己听的。",
  }),
  // 07 沿沟南行
  Cue("SouthWhisper", [
    ["yaowa", "你抢着来干啥子？"],
    ["shunzi", "不来，留上头挨炸？"],
    ["yaowa", "送完还要回去。"],
    ["shunzi", "人交给他们，老子就不回来了。"],
    ["yaowa", "你来真的？"],
    ["shunzi", "你龟儿小声点。"],
  ], {
    delivery: "两人并肩走在队伍里压低声音说话，全程气声偏多但每个字都要听清，脚步节奏一直在。幺娃越问越不安；顺子第四句是真话说漏了嘴，说完自己也一顿；最后一句立刻把话按住，眼睛还在瞟前头。",
  }),
  Cue("VillagePointer", [
    ["crowd", "过了村子就是桥头接运点！能走的自己跟上，担架别掉队！"],
  ], {
    delivery: "路边人员冲着整条队伍喊的，不对任何人，一天喊过几十遍的例行腔调，音量大、离得有点远。",
  }),
  // 08 主街受阻
  Cue("StreetBlocked", [
    ["crowd", "后头莫挤！街堵了！"],
    ["guard", "东巷也进鬼子了！"],
  ], {
    delivery: "第一句是前队隔着人堆往后头喊，被拥挤的人声垫着；第二句是刚从东边退回来的守军，跑得上气不接下气，带着真的慌。",
  }),
  Cue("KitchenDetour", [
    ["luo", "担架靠墙！大路过不去，从右手灶屋穿！"],
    ["heyoutian", "外头我看着！"],
  ], {
    delivery: "罗班长刚查看完相邻房屋，一口气把判断和命令说完，语速快但清楚；何有田应一声就转身端枪，声音已经背着走开了。",
  }),
  // 09 灶屋—连屋近战
  Cue("MeleeRight", [
    ["luo", "右手！"],
  ], {
    soundscape: "土墙灶屋里：脚步在碎砖和灰土上打滑、锅灶被撞响、刺刀扣上枪口的金属声、短促喘息；东巷方向的枪声隔着墙压低。",
    delivery: "只有两个字，是发现人影的瞬间吼出来的，短、炸、不拖尾音。",
  }),
  Cue("MeleeCurse", [
    ["shunzi", "滚你妈的！"],
    ], {
    soundscape: "近身：刺刀撞枪身的金属闷响、衣料撕扯、鞋底刮土地面、两个人顶在一起的憋气声。",
    delivery: "白刃顶住对方时从胸腔里挤出来的一句，破音、带用力的憋气，不是骂人是发狠。不要惨叫。**录音一开始就是这句**，前面不要铺垫，说完再留一点点打斗余响就结束，整条不超过三秒。",
  }),
  Cue("WindowOrder", [
    ["luo", "我看这头！顺子，连屋那个窗口！"],
  ], {
    soundscape: "刚打完的灶屋里：粗重呼吸、脚踢到锅碗的响动；连屋窗口那挺机枪仍在一阵阵点射，土墙外零星步枪。",
    delivery: "近战刚结束，罗班长气还没匀就分工，前半句压着声报自己的位置，后半句抬高冲顺子吼。",
  }),
  // 10 打开内院，放行担架
  Cue("CourtyardOpen", [
    ["luo", "通了！担架进！"],
    ["yaowa", "前头能过了！"],
  ], {
    delivery: "罗班长在院门里头喊；幺娃在院墙外面，声音隔着一堵墙、更远更薄，是把话往后头传——**远归远，两句都要喊得清清楚楚，第二句不许小到听不见**。两句紧接着，结尾不留长空白。",
  }),
  Cue("TwoLitters", [
    ["liuwencai", "后头还有两副！"],
  ], {
    delivery: "刘文财在队尾数担架，报数清楚、不带情绪，扯着嗓子往前头传。",
  }),
  Cue("LastLitter", [
    ["liuwencai", "过了！"],
    ["luo", "走！莫在这儿耗！"],
  ], {
    delivery: "刘文财一声短报；罗班长立刻催全队离开，不看后面。",
  }),
  // 11 抵达桥头接运点
  Cue("TransferSorting", [
    ["loader", "走得动的跟前头！躺着的先上车！担架别堵路！"],
  ], {
    delivery: "接运兵站在车马中间指挥分流，三句一气呵成，是喊了一整天的例行调门，大声、机械、不带情绪。",
  }),
  Cue("VillageRoadThreat", [
    ["heyoutian", "后头追出来了！"],
    ["luo", "顺子，看住村路！别让他们进接运点！"],
  ], {
    delivery: "何有田回头看见村落方向的人影，一声短喊；罗班长立刻指派，第二句咬字重，是把责任压在顺子身上。",
  }),
  // 12 掩护装载与离开
  Cue("TransferDefense", [
    ["luo", "守住村口！让他们一拨一拨走！"],
  ], {
    delivery: "罗班长在低墙后面隔着枪声喊，一句话两个命令，中间不换气。",
  }),
  Cue("TransferRight", [
    ["heyoutian", "右边有人！"],
  ], {
    delivery: "四个字的告警，短、急、砸下来，不是报喜的语气。",
  }),
  Cue("TransferBatch", [
    ["liuwencai", "这批过了，下一批！"],
  ], {
    delivery: "刘文财在装载区边上清点，报完立刻招呼下一批，声音穿过车马人声。",
  }),
  Cue("EscortZhou", [
    ["heyoutian", "这边我看着！去搭把手！"],
    ["shunzi", "班长，我跟周哥走一段？"],
    ["luo", "去！交到前头的人手里！"],
  ], {
    delivery: "何有田接过射位，喊得爽快；顺子那句是试探，句尾带问号、比平时客气半分，心里另有打算；罗班长一个字准了，后半句是条件。",
  }),
  // 12 CartRide
  Cue("CartTalk", [
    ["zhou", "你也跟过去？"],
    ["shunzi", "送到地方交人。"],
    ["zhou", "你们班长舍得放你走？"],
    ["shunzi", "交了还得回来。"],
    ["zhou", "哦。老子还当你也在哪点挨了一下。"],
  ], {
    delivery: "车刚动起来，两人一躺一坐，说话被车轴的吱呀和颠簸带着走。老周有气无力但还在打趣，最后一句半是玩笑半是试探；顺子答得简短、避开眼神，嘴上的「还得回来」和心里想的不是一回事，语气要平得有点假。",
  }),
  // 13 日机空袭桥头道路与车列
  Cue("AircraftFirst", [
    ["crowd", "飞机——！"],
    ["drover", "散开！把牲口牵开！"],
    ["luo", "莫挤路上！能下沟的下沟！"],
  ], {
    delivery: "第一声是远处人群里炸开的示警，拖长、破音、能传很远；赶车人紧接着吼牲口，带农人吆喝的腔；罗班长是从后方赶过来的，声音由远及近，命令压过混乱。三句一句压一句，不留空档，**开头第一秒就要出人声**。飞机与人群的声音必须压在对白下面，三句每一个字都要清清楚楚听得出来，不许被发动机声盖住。",
  }),
  Cue("WestDitchOrder", [
    ["loader", "车别管了！西沟能走人，桥南还有接收处！"],
  ], {
    delivery: "接运负责人站在瘫住的车列里指西边，嗓子已经喊劈了，三个短句赶着说完。",
  }),
  // 14 第二轮扫射，转入西沟
  Cue("CarryZhou", [
    ["rearBearer", "换个人！手使不上劲了！"],
    ["luo", "顺子，接后头！"],
    ["shunzi", "我接。"],
  ], {
    delivery: "后抬手两条胳膊已经在抖，话是喘出来的；罗班长一句指派；顺子两个字，没有犹豫也没有豪气，就是接下来。",
  }),
  Cue("AircraftReturn", [
    ["yaowa", "班长！它又转回来了！"],
    ["luo", "先下沟！莫停车边！"],
  ], {
    delivery: "飞机在远处回转、发动机声重新增强的当口。幺娃的声音发尖、带哭腔边缘；罗班长的命令必须比发动机声更硬，两个短句连在一起。",
  }),
  Cue("RescueZhou", [
    ["yaowa", "周哥！看我！"],
    ["bearer", "还有气！抬进沟！"],
    ["luo", "顺子！枪拿起来！后头追过来了！"],
  ], {
    delivery: "扑沟之后。幺娃跪在担架边喊人，带哭腔但没有嚎；搬运兵一手探鼻息一手招呼人，短促、实务；罗班长的三句从另一个方向喊过来，把顺子从愣神里拽回去。",
  }),
  // 15A 沟口收拢
  Cue("PicketHold", [
    ["picket", "伤员下去！这头我们守！"],
    ["luo", "走西边沟！别再往路上挤！"],
    ["liuwencai", "这边能走！"],
  ], {
    delivery: "警戒兵在车路方向端着枪喊，声音朝外、离得稍远；罗班长转身对自己队伍下令；刘文财在前头探过路回来报，一声短的。",
  }),
  Cue("ZhouCheck", [
    ["yaowa", "周哥，听得到不？"],
    ["zhou", "……嗯。"],
    ["yaowa", "听到就好。莫乱动。"],
  ], {
    delivery: "幺娃蹲在担架边，声音压得很低、贴着耳朵问。老周那一声「嗯」要等一拍才出来，几乎只是一口气，不是台词。幺娃第三句松了半口气，仍旧很轻。整条安静，不煽情。",
  }),
  Cue("Headcount", [
    ["heyoutian", "文财！"],
    ["liuwencai", "前头！"],
    ["heyoutian", "幺娃？"],
    ["yaowa", "这里！"],
    ["heyoutian", "你呢？哪儿遭了？"],
    ["shunzi", "没遭。"],
  ], {
    delivery: "何有田在沟里挨个点人，前两次是喊名字、隔着距离，应答从不同方向传回来。第五句他转过来看着顺子，音量落下来、变成近距离问话；顺子两个字，干巴巴的，没有多说。",
  }),
  Cue("CartAbandon", [
    ["shunzi", "车还走得了不？"],
    ["drover", "前头全堵了。人先走，车别管了。"],
  ], {
    delivery: "顺子问得像随口一问，其实在算自己的路；赶车人蹲在车边看着自己的牲口，认命的平调，不激动。",
  }),
  // 15B 换手抬运，沿墙缓行
  Cue("CarrySwap", [
    ["rearBearer", "换个人……手麻了。"],
    ["luo", "顺子，接一下！"],
    ["heyoutian", "后头我看着。"],
    ["shunzi", "我接。"],
    ["rearBearer", "握住没？"],
    ["shunzi", "握住了。"],
    ["frontBearer", "前头往左拐，跟着我。"],
  ], {
    delivery: "近距离枪火已经没有了，全段音量整体降下来，是七个人走路时的正常说话。后抬手第一句是真的脱力，尾音散掉；交接的两句一问一答之间有实际动作的半拍停顿；前抬手最后一句是回头报路，平稳。",
  }),
  Cue("RoadBump", [
    ["zhou", "脚……慢点。"],
    ["shunzi", "前头有坎，抬高点。"],
  ], {
    delivery: "担架被路面颠了一下。老周的话气若游丝、断在中间，音量极低但每个字要听清；顺子朝前头喊，正常音量。",
  }),
  Cue("HandsShake", [
    ["yaowa", "顺哥，你手还抖。"],
    ["shunzi", "看路，别绊着。"],
  ], {
    delivery: "幺娃走在旁边看见了，说得很轻，不是关心也不是嘲笑，就是说出来；顺子躲开这个话头，语气平。",
  }),
  // 15C 找到桥南临时接收处
  Cue("GateChallenge", [
    ["gateGuard", "站住！哪部分的？"],
    ["liuwencai", "送伤员的！桥头遭飞机扫了！"],
    ["gateGuard", "从这边进，别上大路！"],
  ], {
    delivery: "院门守军先喝止，枪是端着的，两句之间要有一次真的打量；刘文财答得急、把来路一并说了；第三句守军放行，语气立刻松下来但仍是命令。",
  }),
  Cue("ReceptionAccept", [
    ["luo", "这边还能接不？"],
    ["receiver", "先抬进来。重的进里屋，能走的继续往后送！"],
    ["luo", "你们也在收？"],
    ["receiver", "前头接着看，后头接着送，别堵门。"],
  ], {
    delivery: "接收人员手上一直没停，一边指位置一边说话，语速快、条理清楚，不看对方；罗班长两句都很短，第二句是确认不是寒暄。",
  }),
  Cue("WardGuide", [
    ["liuwencai", "里屋有人！担架跟我！"],
    ["yaowa", "周哥，到了。你听，里面有人。"],
  ], {
    delivery: "刘文财在院里回头招呼，声音朝外、放大；幺娃低头对担架上的老周说，压到最低，带一点如释重负。两句反差要大。",
  }),
  // 16 完成交接
  Cue("Threshold", [
    ["zhou", "脚……慢点。"],
    ["shunzi", "抬高点，有门槛。"],
    ["frontBearer", "过去了。"],
  ], {
    delivery: "厢房门口那道门槛，担架稍微一歪。老周这一句是他最后一句话：气极弱、断在中间，不许有遗言的分量和交代感，就是一句怕疼；顺子朝前头喊；前抬手一声短报，事就过去了。",
  }),
  Cue("PlaceLitter", [
    ["surgeon", "这副放这里。"],
    ["frontBearer", "后头，慢慢放。"],
    ["shunzi", "好。"],
  ], {
    delivery: "军医头也不抬地指了个位置；前抬手招呼后头一起下蹲；顺子一个字应答，跟着用力。",
  }),
  Cue("MedicAsk", [
    ["surgeon", "伤在哪儿？"],
    ["yaowa", "腿先遭了。刚才飞机又扫了一遍……"],
    ["surgeon", "路上还答话没有？"],
    ["yaowa", "答了，刚才还应了声。"],
    ["surgeon", "退开点，我看看。"],
  ], {
    delivery: "军医问得快、平、没有表情，是一天问过几十遍的流程；幺娃答得很急，第二句尾音散掉、自己都不敢说下去；第四句他抓住这一点想得到点什么；军医最后一句只是让路，不给任何安慰。",
  }),
  Cue("SquadAssign", [
    ["luo", "文财，问清后头怎么走。"],
    ["luo", "何有田，跟我看下外头。"],
    ["luo", "你留这里。"],
  ], {
    delivery: "罗班长三句连着派人，前两句正常音量朝屋里两头喊，第三句是转头对幺娃说的，音量落下来、近了一步，没有解释。",
  }),
  // 17 确认老周死亡
  Cue("ZhouDeath", [
    ["yaowa", "周哥，到地方了。"],
    ["yaowa", "周哥？"],
    ["surgeon", "让开点。"],
    ["shunzi", "老周？"],
    ["surgeon", "……人没了。"],
    ["yaowa", "刚才过门槛还在说话。"],
    ["surgeon", "人没了。"],
  ], {
    delivery: "屋里几个人，语速整体是慢的，没有一个人在演悲痛。**七句一句不许省，每句都要念清楚**。第一句之后留约两秒空当，这段空当里只有院外的搬运声和很远的枪声，没有任何台词——那是等回应没等到；除这一处外句与句之间只留正常呼吸，不要再加长停顿。幺娃第二句「周哥？」是单独一句、叫名字时声音已经变了，不许和第一句连读；军医只是让路，例行；顺子刚把枪重新拿稳，那声「老周？」是半信半疑地确认；军医那句前面顿一下再说，平、低，不加重音；幺娃第六句是想把事实推回去，声音发飘；军医最后一句是重复，更短更硬，不带同情。结尾不要叹息、不要哭腔收尾。",
  }),
  Cue("NextLitter", [
    ["receiver", "这里还有一副！"],
    ["surgeon", "抬这边来。"],
  ], {
    delivery: "门外又抬来伤员。两句都是平常的工作口气，音量正常，完全不受屋里刚发生的事影响——这是本段的重点。",
  }),
  // 18 接应回援尾队，奉令毁桥
  Cue("BridgeOrders", [
    ["runner", "鬼子绕到城下了！团长带人回城，你们把伤员交了，接住桥上后队！"],
    ["luo", "后头还有多少？"],
    ["runner", "就剩这一队！过完就退，桥要炸！"],
  ], {
    delivery: "传令兵是跑进接收处的，第一句话又长又急、几乎是一口气吼完；罗班长问得极短；第三句传令兵把三件事塞在一句里，最后四个字压得很重。",
  }),
  Cue("BridgeCover", [
    ["luo", "别堵桥口！下来就往南走！"],
    ["heyoutian", "顺子，北边土坎！"],
  ], {
    delivery: "罗班长朝桥面上通过的尾队喊，声音要送得远；何有田在旁边报敌人方位，短、急、砸下来，不许有一点轻快。",
  }),
  Cue("BridgeWithdraw", [
    ["officer", "这队过完了！桥头撤！"],
    ["luo", "顺子，下来！"],
    ["heyoutian", "走，老子接着！"],
  ], {
    delivery: "桥头军官在桥那头喊，隔着河面、带一点回荡；罗班长回头叫人；何有田一边往后退一边接住射位，喘着说。",
  }),
  Cue("MarchToTengxian", [
    ["officer", "往滕县！跟上前队！"],
  ], {
    soundscape: "刚爆破完的北沙河南岸：碎石还在往河槽里落，耳朵有轻微的闷塞感，成队的脚步已经动起来，远处炮声持续。",
    delivery: "爆破之后军官只喊这一句，不解释、不总结，对着整条队伍，声音大而干。",
  }),
  Cue("NorthGate", [
    ["usher", "补东边阵位的，跟我来！"],
    ["luo", "顺子，跟上。"],
  ], {
    delivery: "带路军人在人堆里扯着嗓子招呼，声音在城墙下有回响；罗班长那句是近处平常说的，不喊，四个字带着一天下来的疲惫。",
  }),
  ...MISSION_GUIDE_DIALOGUE,
]);
export function MissionVoicePrompt(cue) {
  const cast = [...new Set(cue.lines.map((line) => line.who))]
    .map((who) => MISSION_VOICE_CAST[who].join("："))
    .join("；");
  const environment = cue.soundscape || MissionVoiceSoundscape(cue.id);
  // 日语段单独交代口径；纯中文 cue 的提示词逐字保持旧模板，沿用的录音才不会白白重烘。
  const bilingual = cue.lines.some((line) => line.lang === "ja");
  const rule = bilingual
    ? "日军角色只念稿中给出的日语，用日语发音，不说中文；中国角色只说稿中四川话。"
    : "日军角色只说稿中日语。";
  return `生成游戏战场剧情的整段连续多人对白和同场环境声，一个完整音频，一次演完。1938年四川军人，所有中国人物必须讲地道四川话，使用四川方言语调与发音，不能仅四川词汇配普通话播音。${cast}。${cue.delivery || "自然接话、短停顿、呼吸，角色声音明确不同且稳定。"}环境声必须录进本次完整录音：${environment}环境声保持在对白下方，整段连续不突兀截断；不加音乐，不念角色名和动作说明，不删词改词，不添加其他可辨识台词。${rule}完整对白如下：\n${cue.lines.map((line, index) => `${MISSION_VOICE_CAST[line.who][0]}：“${MissionVoiceSpoken(cue, index)}”`).join("\n")}`;
}
// 分区兜底环境声：给没有单独写 soundscape 的 cue 用。罗班长带路短命令（Guide*）
// 一律落到默认那条，改这里不要动到它们的提示词哈希。
const SOUNDSCAPE_DEFAULT =
  "1938年户外战场，连续远近枪炮低声底、脚步、衣料与装备摩擦、呼吸；土墙遮蔽让远处声音低闷，主要对白始终清晰。";
const SOUNDSCAPES = Object.freeze({
  bunker: "前沿小型掩蔽部：厚土层外一声接一声的闷炮，头顶碎土簌簌落下；门外八到十米处日军的脚步、枪托砸击和推进声透过低处破口传进来，屋里只有压住的呼吸。",
  rescue: "坍塌的掩蔽部里：搬动木架、碎砖与杂物滑落、用力的喘息和呛咳；后侧交通壕方向的步枪连续射击与日兵还击，被土层压得发闷。",
  trench: "后交通壕：鞋底踩泥水、装备晃动、急促呼吸；土壁把远处枪炮压成闷响，头顶偶尔掠过一发。",
  front: "前沿机枪位：近处重机枪点射与弹壳落地、换弹金属声，破墙方向持续的步枪火力，远处炮弹落点；对白在枪声间隙里喊出来。",
  bundle: "交通沟里贴土坡移动：衣料与土的摩擦、急促喘息、装备碰撞；远处机枪连续压制，道路方向传来战车履带与发动机的低频。",
  collection: "背坡伤员集结处：担架木杆搁地、伤员低声呻吟与喘息、包扎布条、走动的脚步和低声交谈；山坡挡住前沿，枪炮只剩远远的闷响。",
  southWalk: "沿交通沟南行：一长串脚步踩土、担架木杆随步子吱呀、装备摩擦和伤员喘息；战斗声已经落到很远的背景里。",
  village: "刚挨过炮击的村街：碎砖瓦砾在脚下滚动、房梁余烬轻响、远处零星塌落；东巷方向的步枪与机枪点射打在街面上，拥挤的人声混在里头。",
  courtyard: "土院坝：担架木杆与鞋底刮地、院门木轴转动、伤员喘息；院外主街方向的枪声隔着墙压低。",
  transfer: "桥头接运点：牛马打响鼻、车轴与木板吱呀、担架搁上车板、人群走动和喊号；村落方向的枪声一阵阵逼近。",
  cart: "缓慢行进的木轮车：车轴规律的吱呀、牲口蹄子踏土、车板轻晃与伤员喘息；桥头人声和远处枪炮在后面慢慢拉开。",
  air: "日机低空掠过的发动机咆哮由远及近、机枪扫射打起的连串土柱、牲口惊叫、人群四散的脚步与喊叫；对白压在这些声音上面，字字清楚。",
  ditch: "沟内：粗重的喘息、担架搁在沟底、鞋底刮土壁、衣料摩擦；飞机声已经拉远，车路方向的零星枪声被沟壁切成闷响。",
  wallPath: "靠院墙的窄路：只有一排脚步、担架木杆随步子吱呀、粗重呼吸和远处很闷的炮声；近处没有枪火。",
  reception: "接收院门口：脚步在硬土地面上停住、枪背带与装备碰撞、院里担架搬动和伤员的声音从门内传出；远处炮声低闷。",
  ward: "接收处厢房内：脚步在土地面和门槛上顿一下、担架搁地的木响、布料与器械轻碰、几个伤员的微弱呼吸；院外持续的搬运声和零星枪声隔着墙压得很低。",
  bridge: "北沙河铁路桥南岸：河风、桥面上急促通过的脚步与装备哐当、北岸土坎方向的步枪机枪点射、远处炮击。",
  night: "夜里滕县北门外：成队的脚步踩在土路上、弹药箱与器材搬动、车轮木响、许多人低声说话和零星口令；城墙把声音兜住，没有欢呼。",
});
const SOUNDSCAPE_ZONES = Object.freeze({
  BunkerBanter: "bunker", BunkerKilling: "bunker", BunkerSearch: "bunker", ShunziCurse: "bunker",
  RescueCall: "rescue", RescueLift: "rescue", RescueOut: "rescue",
  TrenchCurse: "trench", CornerCheck: "trench", SupportOrder: "trench",
  FrontBlockade: "front", TakeOverGun: "front", TankTerror: "front", BundleOrder: "front",
  BundleGo: "bundle", BundleProne: "bundle", BundleSupply: "bundle", BundleReturnCall: "bundle", TankStopped: "bundle",
  Volunteer: "collection", BorrowLight: "collection", ZhouLift: "collection",
  SouthWhisper: "southWalk", VillagePointer: "southWalk",
  StreetBlocked: "village", KitchenDetour: "village",
  MeleeRight: "village", MeleeCurse: "village", WindowOrder: "village",
  CourtyardOpen: "courtyard", TwoLitters: "courtyard", LastLitter: "courtyard",
  TransferSorting: "transfer", VillageRoadThreat: "transfer", TransferDefense: "transfer",
  TransferRight: "transfer", TransferBatch: "transfer", EscortZhou: "transfer",
  CartTalk: "cart",
  AircraftFirst: "air", WestDitchOrder: "air", CarryZhou: "air", AircraftReturn: "air", RescueZhou: "air",
  PicketHold: "ditch", ZhouCheck: "ditch", Headcount: "ditch", CartAbandon: "ditch",
  CarrySwap: "wallPath", RoadBump: "wallPath", HandsShake: "wallPath",
  GateChallenge: "reception", ReceptionAccept: "reception", WardGuide: "reception",
  Threshold: "ward", PlaceLitter: "ward", MedicAsk: "ward", SquadAssign: "ward",
  ZhouDeath: "ward", NextLitter: "ward",
  BridgeOrders: "ward", BridgeCover: "bridge", BridgeWithdraw: "bridge", MarchToTengxian: "bridge",
  NorthGate: "night",
});
export function MissionVoiceSoundscape(id) {
  return SOUNDSCAPES[SOUNDSCAPE_ZONES[id]] || SOUNDSCAPE_DEFAULT;
}
