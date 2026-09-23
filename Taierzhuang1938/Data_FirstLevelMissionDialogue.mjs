import { MISSION_GUIDE_DIALOGUE } from "./Data_FirstLevelGuideDialogue.mjs";
import { JAPANESE_SPEECH } from "./Data_FirstLevelJapaneseSpeech.mjs";
// 第一关台词表（cue id 的唯一来源）。两种录音格式并存（契约 docs/Data_FirstLevel0105Refactor20260923Contract.md §2.2）：
//   · 逐句干声（perLine: true）——01–06：每句一条干声 Audio/FirstLevel/Lines/AudioVoice_FirstLevel<Scene>_<NN>.mp3，
//     同一角色都带定妆参考音生成；对白时间轴在 Data_FirstLevelDialogueDirection.mjs，播放器 Script_DialoguePlayer。
//     01–02 台词逐字取自 docs/Data_FirstLevelOpeningSource20260923.md；03–06 取自 09.22 稿，id 与台词不变。
//   · 整段录音（旧格式）——07–18：一段连续多人对白 = 一个 cue = 一次 SeedAudio 请求 = 一条音频。
//     台词逐字取自 docs/Data_FirstLevelRebuildSource20260919.md（Notion 采用稿），不许改字改标点。
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
  interpreter: ["翻译", "鲁南本地成年男性，北方官话，粗暴急促，绝不说四川话；在日兵旁传话"],
  ijaA: ["日兵甲", "1938年日本陆军步兵，成年男性，短促粗暴的日语命令，只说稿中日语假名，不说中文"],
  ijaB: ["日兵乙", "1938年日本陆军步兵，成年男性，比甲更闷更沉的日语吼叫，只说稿中日语假名，不说中文"],
  ijaC: ["日兵丙", "1938年日本陆军步兵，年轻些，嗓子尖而响，在前沟边跑边喊，只说日语"],
  ijaD: ["日兵丁", "1938年日本陆军步兵，中等嗓音，警觉，短促催促，只说日语"],
  comrade: ["川军", "肩膀挂彩的四川男兵，豁达嘴硬爱开玩笑，嗓子偏沙"],
  shouter: ["洞外士兵", "四川成年男兵，在洞外沟里隔着炮声拼命示警"],
  captiveWounded: ["伤兵", "腿骨断了的四川伤兵，疼得发抖还嘴硬，从牙缝里骂出来，与老周声音不同"],
  captiveHelper: ["扶人川军", "四川成年男兵，拖着同伴已经脱力，被枪托砸倒后还挣扎出声"],
  guard: ["守军", "四川前沿守军，跑动后气喘，隔着枪声喊话要让人听清"],
  relief: ["接防兵", "四川成年军人，从后交通壕赶来接防，喘着气简短交接"],
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
    lines: lines.map(([who, text, more], index) => Object.freeze({ who, text, ...(more || {}),
      ...(extra.perLine ? { id: MissionLineId(id, index), file: MissionLineFile(id, index) } : {}) })),
    ...extra,
  });
/** 逐句 id：`<Scene>.<NN>`（契约 §5.2）。 */
export const MissionLineId = (cueId, index) => `${cueId}.${String(index + 1).padStart(2, "0")}`;
/** 逐句干声文件（相对 Audio/FirstLevel/）。 */
export const MissionLineFile = (cueId, index) => `Lines/AudioVoice_FirstLevel${cueId}_${String(index + 1).padStart(2, "0")}.mp3`;
// 01–06 逐句格式的场景（对白导演表 Data_FirstLevelDialogueDirection 里每一个都要有）。
const PerLine = (id, lines, extra = {}) => Cue(id, lines, { ...extra, perLine: true });
const JA = { lang: "ja" };
/** 送 TTS 的写法：日语行取假名侧表，其余取 line.tts ?? line.text。 */
export function MissionVoiceSpoken(cue, index) {
  const line = cue.lines[index];
  return JAPANESE_SPEECH[line.id]?.kana ?? JAPANESE_SPEECH[`${cue.id}:${index}`]?.kana ?? line.tts ?? line.text;
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
  // —— 2026.09.23 新稿 01–02（契约 §5.2），逐句干声。台词逐字，不改字。
  PerLine("BunkerBanter", [
    ["shunzi", "妈卖批。老子还没埋，坟头土先给我盖起了。"],
    ["yaowa", "省事噻，等哈死了都不用挖坑。"],
    ["shunzi", "滚。"],
    ["comrade", "莫死这儿噻，山东的土老子睡不惯。"],
    ["yaowa", "死人还挑地方？"],
    ["comrade", "咋个不挑，老子要死也滚回四川死。"],
    ["shunzi", "你想得还多，先把今天混过去。"],
    ["comrade", "那肯定，老子命硬得很。"],
    ["yaowa", "命硬还挨一枪？"],
    ["comrade", "龟儿子枪法撇了噻。"],
    ["shunzi", "那你还得谢谢他。"],
    ["comrade", "等哈碰到，老子当面谢。"],
    ["yaowa", "拿啥子谢？"],
    ["comrade", "拿这个噻。"],
  ]),
  PerLine("BunkerOrders", [
    ["runner", "班长！东头破了！鬼子的先头兵贴着炮上来了！"],
    ["luo", "弹装起！往后沟撤！跟紧！"],
  ]),
  PerLine("BunkerIncoming", [["shouter", "炮弹！趴下——！"]]),
  PerLine("BunkerSearch", [
    ["ijaC", "往前！快！", JA],
    ["ijaD", "别停！", JA],
  ]),
  PerLine("CaptiveDragged", [
    ["comrade", "狗日的……你妈的……"],
    ["ijaA", "起来！", JA],
    ["comrade", "日你……先人……"],
    ["ijaC", "右边！开火！", JA],
  ]),
  PerLine("CaptiveInterrogation", [
    ["ijaA", "他们的部队往哪儿撤了！问他！", JA],
    ["interpreter", "是！", JA],
    ["interpreter", "你们的人往哪儿撤了？"],
    ["comrade", "……啥子？"],
    ["interpreter", "你们大队！往哪儿撤了！"],
    ["ijaB", "你这支那混蛋！快说！", JA],
    ["comrade", "滚……二鬼子。"],
    ["ijaA", "他说什么！", JA],
    ["interpreter", "他什么也不肯说！光在骂人！", JA],
    ["comrade", "老子骂的就是你们……狗日的。"],
    ["comrade", "小日本。"],
  ]),
  PerLine("CaptiveTaunt", [
    ["ijaA", "怎么了，支那混蛋！", JA],
    ["ijaA", "用你那张嘴，再骂啊！", JA],
    ["ijaB", "蠢货。", JA],
    ["ijaC", "往前！快！", JA],
  ]),
  PerLine("ShunziFound", [["ijaA", "还藏着一个，支那混蛋。", JA]]),
  PerLine("RescueInterrogation", [
    ["ijaA", "这个也问！", JA],
    ["interpreter", "是！", JA],
    ["interpreter", "醒醒！你们的人往哪儿撤了？"],
    ["interpreter", "听见没有？你们长官在哪儿？"],
    ["ijaB", "快点！", JA],
    ["interpreter", "说话！"],
  ]),
  PerLine("RescueFlee", [["interpreter", "有敌人！", JA]]),
  PerLine("RescueCheck", [["luo", "还能打不？"]]),
  PerLine("CollectionMeet", [
    ["yaowa", "顺哥！你脸咋了？"],
    ["shunzi", "还能走。"],
    ["luo", "莫堵到！"],
  ]),
  PerLine("SupportOrder", [
    ["guard", "东头丢了！西边机枪还在顶，前头那几个下不来！"],
    ["luo", "老周喃？"],
    ["guard", "还在前头！机枪压到起的！"],
    ["luo", "何有田守后头！顺子，跟老子走！"],
    ["shunzi", "不是撤了？"],
    ["luo", "先把那几个接下来！"],
  ]),
  // —— 09.21 旧稿整段 cue：**待 Opening 包下线**（契约 §5.2 列为下线；旧导演 Script_OpeningStoryboards /
  // Script_FirstLevelBunker / Script_FirstLevelFrontShow / 运行时还在 Say 它们，先保留文件与表项，别删）。
  Cue("BunkerKilling", [
    ["captiveHelper", "放开老子！日你先人！"],
    ["ijaA", "别动，混蛋！", {lang:"ja"}],
    ["interpreter", "别他妈动！问你话呢！"],
    ["interpreter", "你们大队往哪儿撤了？后头还有多少人？"],
    ["captiveHelper", "你个狗日的二鬼子。"],
    ["interpreter", "少他妈废话！说！"],
  ], {soundscape:"洞口外交通壕，揪领、衣料扯紧、枪托与靴子短促控制声；后景部队仍向前推进，末句后一次近距离步枪声，受俘者倒地。",
    delivery:"短促而粗暴的审问。川军肩部负伤仍拒绝回答，日兵只说日语，翻译北方官话呵斥。不能拉长审讯，不加音乐。"}),
  Cue("ShunziCurse", [["ijaA", "出来！混蛋！", {lang:"ja"}]], {
    soundscape:"刺刀拨开洞口断木，木头刮擦掉土，日兵抓住衣领拖人，伤者痛喘、抓臂挣扎，枪托击打后短暂耳鸣。",
    delivery:`只有一个日本男兵，日语母语，大声吼出完整的『${JAPANESE_SPEECH["ShunziCurse:0"].kana}』。必须让这句人声清晰压过环境声；吼声约两秒，不要解说、不要预告旁白。`}),
  Cue("RescueCall", [
    ["interpreter", "装什么死！醒醒！"],
    ["interpreter", "问你话。你们的人往哪儿撤了？"],
    ["interpreter", "说！你们长官在哪儿？"],
    ["shunzi", "你龟儿听得懂老子说话不？"],
    ["interpreter", "什么？"],
    ["shunzi", "老子问你——"],
  ], {soundscape:"交通壕边低处，负伤者近处喘息，近处日兵揪领和装备声；远处脚步枪声仍推进。",
    delivery:"日兵主导控制，旁侧翻译用北方官话传话逼问。顺子害怕、观察逃跑机会，用四川话顶嘴，最后半句突然中断，不泄露情报，不加英雄音乐。"}),
  Cue("RescueLift", [
    ["interpreter", "有人——！"],
    ["heyoutian", "趴下！"],
    ["luo", "妈卖批！还躺起搞啥子！"],
  ], {soundscape:"极短的近身反扑，大刀挥动、身体撞击、步枪脱手落泥，另一支枪走火击入沟壁，后交通壕步枪压制。",
    delivery:"翻译突然惊叫被打断，何有田四川话短促大吼，罗班长用力反扑后吼顺子。实时速度，不慢动作，不加任何音乐。"}),
  Cue("RescueOut", [
    ["luo", "还活到起没？！"],
    ["shunzi", "差点遭你拖死！"],
    ["luo", "那就是没死！拿枪！"],
  ], {soundscape:"班长猛拖顺子，衣料拉扯、身体擦泥，靴子把掉落步枪踢过来，后沟步枪掩护和逃跑脚步。",
    delivery:"班长边拉人边吼，顺子被拖痛了气喘顶嘴，末句拿枪是紧急命令。全段四川话、连续演完。"}),
  Cue("TrenchCurse", [
    ["heyoutian", "班长！又上来一伙！"],
    ["luo", "刚才那几个就是先头的！"],
    ["heyoutian", "后头全他妈跟上来了！"],
    ["luo", "走！后沟！快！"],
  ], {delivery:"何有田探头确认后续攻击兵力，声音急；班长立刻催撤。密集脚步与日语不可辨识喊声从远处逼近，说明仅抢出短暂窗口。"}),
  Cue("CornerCheck", [
    ["yaowa", "顺哥！老子还以为你遭埋了！"],
    ["shunzi", "差点！"],
    ["yaowa", "快点！鬼子追上来了！"],
    ["shunzi", "老子早说该走！硬是要等鬼子摸到裤裆底下才晓得跑！"],
    ["luo", "闭到你的臭嘴！跑！"],
  ], {delivery:"在后沟折角仍边跑边说，幺娃从侧后追上回看，顺子又急又怕地骂，班长催跑打断，不停在原地。"}),
  // Notion 2026-09-22: stages 03–05, verbatim source and complete exchanges.
  PerLine("FrontBlockade", [["zhou", "右边破墙！冒火那个口子！把路封死了！"], ["luo", "周哥，顶一下！我们去拿右边！"], ["luo", "顺子，跟紧！莫走外头！"]], {delivery:"四川前沿官兵在枪炮声中短促交代，按实际距离与角色区别演绎；老周已有包扎腿伤，动作吃力；不作播音腔。"}),
  PerLine("FrontApproach", [["luo", "贴这道墙！前头有人！"], ["luo", "口子压住了，进！"]], {delivery:"四川前沿官兵在枪炮声中短促交代，按实际距离与角色区别演绎；老周已有包扎腿伤，动作吃力；不作播音腔。"}),
  PerLine("FrontAttack", [["luo", "土坎前头那一伙！莫让他们压到口子上！"]], {delivery:"四川前沿官兵在枪炮声中短促交代，按实际距离与角色区别演绎；老周已有包扎腿伤，动作吃力；不作播音腔。"}),
  PerLine("FrontWithdraw", [["luo", "压下去了！前头的，下来！往沟里走！"]], {delivery:"四川前沿官兵在枪炮声中短促交代，按实际距离与角色区别演绎；老周已有包扎腿伤，动作吃力；不作播音腔。"}),
  PerLine("TakeOverGun", [["luo", "何有田，接周哥那边！幺娃，扶他下去！"], ["zhou", "外头还有人！"], ["luo", "看到了！这边有人接，你先下去！"]], {delivery:"四川前沿官兵在枪炮声中短促交代，按实际距离与角色区别演绎；老周已有包扎腿伤，动作吃力；不作播音腔。"}),
  PerLine("TankRoadContact", [["heyoutian", "右边路上！战车出来了！"], ["luo", "先看住跟车的！前头还有人没下来！"]], {delivery:"四川前沿官兵在枪炮声中短促交代，按实际距离与角色区别演绎；老周已有包扎腿伤，动作吃力；不作播音腔。"}),
  PerLine("TankTerror", [["luo", "下来！莫站枪口上！退后墙！"]], {delivery:"四川前沿官兵在枪炮声中短促交代，按实际距离与角色区别演绎；老周已有包扎腿伤，动作吃力；不作播音腔。"}),
  PerLine("BundleOrder", [["guard", "外边旧弹药屋还有集束弹！后沟能过去！"], ["luo", "文财，看住沟口！何有田，前头交给你！"], ["luo", "顺子，跟我走后沟，去拿弹！"], ["shunzi", "前头还咋个过？"], ["luo", "莫走路上！跟到老子！"]], {delivery:"四川前沿官兵在枪炮声中短促交代，按实际距离与角色区别演绎；老周已有包扎腿伤，动作吃力；不作播音腔。"}),
  PerLine("BundleGo", [["heyoutian", "班长，快点！这边老子顶到！"], ["luo", "顺子，下沟！屋在墙后头！"]], {delivery:"四川前沿官兵在枪炮声中短促交代，按实际距离与角色区别演绎；老周已有包扎腿伤，动作吃力；不作播音腔。"}),
  PerLine("BundleProne", [["luo", "低点！上头看得到！"], ["luo", "前头岔口！有人下沟了！"]], {delivery:"四川前沿官兵在枪炮声中短促交代，按实际距离与角色区别演绎；老周已有包扎腿伤，动作吃力；不作播音腔。"}),
  PerLine("BundleSupply", [["keeper", "里头那个箱子！就剩这些！"], ["luo", "拿起！沿刚才的沟回！"]], {delivery:"四川前沿官兵在枪炮声中短促交代，按实际距离与角色区别演绎；老周已有包扎腿伤，动作吃力；不作播音腔。"}),
  PerLine("BundleReturnCall", [["heyoutian", "它又往前挤了！前头的人还卡到起！"], ["luo", "听到了！顺子，跟紧！"]], {delivery:"四川前沿官兵在枪炮声中短促交代，按实际距离与角色区别演绎；老周已有包扎腿伤，动作吃力；不作播音腔。"}),
  PerLine("BundleAttack", [["luo", "就这边！莫上大路！"], ["luo", "顺子，拿弹！旁边的人我看到！"]], {delivery:"四川前沿官兵在枪炮声中短促交代，按实际距离与角色区别演绎；老周已有包扎腿伤，动作吃力；不作播音腔。"}),
  PerLine("BundleRetreat", [["luo", "回来！低头！"]], {delivery:"四川前沿官兵在枪炮声中短促交代，按实际距离与角色区别演绎；老周已有包扎腿伤，动作吃力；不作播音腔。"}),
  PerLine("TankStopped", [["heyoutian", "停了！口子能过！"], ["luo", "前头的，下来！莫堵沟口！"], ["liuwencai", "还有人！后头跟上！"]], {delivery:"四川前沿官兵在枪炮声中短促交代，按实际距离与角色区别演绎；老周已有包扎腿伤，动作吃力；不作播音腔。"}),
  PerLine("FrontRelief", [["liuwencai", "这批过了！"], ["relief", "这里我们接！你们先下！"], ["luo", "走！回伤员那边！"]], {delivery:"四川前沿官兵在枪炮声中短促交代，按实际距离与角色区别演绎；老周已有包扎腿伤，动作吃力；不作播音腔。"}),
  // 06 回到伤员集结处，接下后送
  PerLine("Volunteer", [
    ["runner", "这里有人接！你们班护着伤员往南，送到桥头接运点！"],
    ["luo", "交完人去哪？"],
    ["runner", "有人再给你们指路！"],
    ["shunzi", "我跟后送队。"],
    ["luo", "你跟我走前头。何有田、文财看后头，幺娃照看周哥！"],
  ], {
    delivery: "传令兵跑过来传令，气还没匀；罗班长问得干脆；顺子那句是主动争取，说得比平时快半拍，还想显得随口；罗班长不接他的茬，直接排人。",
  }),
  PerLine("BorrowLight", [
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
  PerLine("ZhouLift", [
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
  const northern = cue.lines.some(line => line.who === "interpreter");
  const rule = bilingual
    ? `日军角色只念稿中给出的日语，用日语发音，不说中文；${northern ? "翻译只说北方官话，川军角色只说四川话。" : "中国角色只说稿中四川话。"}`
    : "日军角色只说稿中日语。";
  return `生成游戏战场剧情的整段连续多人对白和同场环境声，一个完整音频，一次演完。${northern ? "1938年战场：翻译必须说鲁南北方官话，川军角色必须说地道四川话，两者口音明显不同。" : "1938年四川军人，所有中国人物必须讲地道四川话，使用四川方言语调与发音，不能仅四川词汇配普通话播音。"}${cast}。${cue.delivery || "自然接话、短停顿、呼吸，角色声音明确不同且稳定。"}环境声必须录进本次完整录音：${environment}环境声保持在对白下方，整段连续不突兀截断；不加音乐，不念角色名和动作说明，不删词改词，不添加其他可辨识台词。${rule}完整对白如下：\n${cue.lines.map((line, index) => `${MISSION_VOICE_CAST[line.who][0]}：“${MissionVoiceSpoken(cue, index)}”`).join("\n")}`;
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
  FrontApproach:"front",FrontAttack:"front",FrontWithdraw:"front",TankRoadContact:"front",BundleAttack:"bundle",BundleRetreat:"bundle",FrontRelief:"front",
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
