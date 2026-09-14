// One continuous exchange = one Seed Audio generation and one retained cue.
// Latest Notion amendments override archived P0/P1/P2 and older chapter recordings.
export const MISSION_VOICE_CAST = Object.freeze({
  shunzi: ["顺子", "二十多岁四川男兵，嘴硬、精明，害怕时说话急，但不是喜剧腔"],
  yaowa: ["幺娃", "十八岁四川男兵，清亮年轻，嘴快，受到惊吓会结巴、重复，不能沉稳播音"],
  heyoutian: ["何有田", "二十多岁四川男兵，粗嗓门，生活化挖苦，战斗时短促直接"],
  liuwencai: ["刘文财", "二十多岁四川男兵，较细干嗓，认真计较弹药，报数清楚"],
  luo: ["罗班长", "三十多岁四川班长，低沉沙哑有力量，吼命令不用播音腔"],
  zhou: ["老周", "三十多岁四川伤兵，腿伤疼痛，初期还嘴硬，重伤后气弱短句"],
  medic: ["卫生兵", "四川男性卫生兵，忙碌疲惫，救人时急促，确认死亡时压低声音"],
  bearer: ["担架员", "四川成年男性，劳累喘气，抬担架时短促报路"],
  runner: ["传令兵", "年轻四川男兵，奔跑后气喘，命令说清楚"],
  soldier: ["士兵", "四川成年男性军人，现场自然喊话"],
  wounded: ["伤兵", "四川成年男性伤兵，疼痛虚弱、咬牙喘气，与老周声音不同"],
  ija: ["日军", "成年男性敌军，命令短促粗哑，按本次要求使用地道四川话"],
});
const Cue = (id, lines, extra = {}) =>
  Object.freeze({
    id,
    file: `AudioVoice_FirstLevel${id}.mp3`,
    lines: lines.map(([who, text]) => Object.freeze({ who, text })),
    ...extra,
  });
export const MISSION_DIALOGUE = Object.freeze([
  Cue("TrainMeal", [
    ["yaowa", "顺哥，接到。"],
    ["shunzi", "你切这么薄，透亮了都。"],
    ["yaowa", "一车人，就这点。你还想啃一坨嗦？"],
    ["shunzi", "刚进队伍那阵，哪个分了半个饼子给你？这就忘了？"],
    ["yaowa", "记到的嘛！所以头一片就给你了噻。"],
    ["heyoutian", "你两个账算完没得？给老子也来一片。"],
    ["yaowa", "吃个锤子，昨晚上你就偷了两坨！"],
    ["luo", "莫闹了。给后头留点。把包背上，要到了。"],
  ], { soundscape:"木车厢持续铁轮声、木板轻响、衣料与小刀切腊肉声，周围低声人群，偶尔很远的闷炮；对白始终清楚。", delivery:"几名熟悉的四川男兵自然分食拌嘴，班长从过道挤过来，日常、克制、不搞喜剧，不预演炮击。" }),
  Cue("TrainPack", [
    ["yaowa", "你那件短褂还留到的嗦？包都塞不下了。"],
    ["shunzi", "莫扯，给老子塞回去。"],
    ["yaowa", "都穿军装了，你还留它做啥子？"],
    ["shunzi", "总有脱这身皮的时候嘛。"],
    ["yaowa", "打完了回去穿？"],
    ["shunzi", "等打完？哪个晓得还剩不剩老子。"],
    ["yaowa", "……那你啥时候穿？"],
    ["shunzi", "有空子就穿。换了衣裳，往人堆里一钻，哪个晓得老子是当兵的。"],
    ["yaowa", "你想跑嗦？"],
    ["shunzi", "小声点，你龟儿生怕班长听不到？"],
    ["yaowa", "你还真敢？"],
    ["shunzi", "老子赶个场，遭捆来当兵，屋头连个信都没捎回去。还非得把命也交在这儿？"],
    ["yaowa", "外头到处都是兵，你往哪点跑？"],
    ["shunzi", "先找得到空子再说。你把嘴巴管到。"],
  ], { soundscape:"低而连续的铁轮与木车厢轻响，近处翻收布包和衣物摩擦，远处含混男兵交谈。", delivery:"两名年轻四川男兵挨近压低声音说完整私话，顺子嘴硬、谨慎，幺娃疑惑又担心；不是耳语气声独白，不搞笑，十四句自然连贯。" }),
  Cue("TrainBanter", [
    ["liuwencai", "十九……"],
    ["liuwencai", "妈卖批，明明二十颗。"],
    ["heyoutian", "你数一晚上了，那颗子弹都要遭你数出娃儿来。"],
    ["liuwencai", "滚。少一颗你赔老子？"],
    ["heyoutian", "赔个锤子，你那几颗烂子弹金子打的嗦？"],
  ], {subtitleEmphasis:"aside", soundscape:"车厢铁轮声与低低人群底声，近处子弹轻碰、翻找脚边衣物声。", delivery:"刘文财低头认真数子弹，何有田在旁低声挖苦，五句完整连续自然接话，声音不同，无班长台词。" }),
  Cue("TrainBriefing", [
    ["luo", "把东西拢起，要到了。"],
  ], { soundscape:"车厢铁轮持续减速，低低的人群声和衣料摩擦，保持平静，末尾不加爆炸。", delivery:"四川班长已到车门边，向车内简短提醒，不紧张吼叫；一口气自然说完。" }),
  Cue("WreckImpact", [
    ["yaowa", "顺哥！"],
    ["wounded", "手！老子手遭了！"],
  ], {soundscape:"刚倾覆木车厢中的泥石落下、木板断裂余响、饭盒与行李滑落，近处痛喘，远近枪炮持续但压低于人声。",delivery:"突发灾难后惊恐短喊，幺娃找顺子，另一名伤兵捂住流血胳膊痛喊；不念动作。" }),
  Cue("TrainShelling", [
    ["luo", "顺子！看着老子！"],
    ["luo", "起来！跟到我！"],
  ], { soundscape:"倾覆木车厢内近距离衣领摩擦、用力拖拉杂物声、喘息，车外枪火与弹着作为较低底声。", delivery:"班长在顺子身边抓住衣领和上臂，边用力拉起边急促吼两句，连续约三秒内说完，第二句起字用力，不加词、不加长沉默。" }),
  Cue("WreckExit", [
    ["heyoutian", "这头！从这头出来！"],
    ["heyoutian", "外头有鬼子！田坎后头！"],
    ["luo", "莫站路上！贴车帮，往沟里走！"],
    ["luo", "顺子，到我这边！"],
    ["yaowa", "走！走！"],
  ], { soundscape:"残骸破口脚踩碎木、装备晃动、急促喘息、子弹打车体与路基、头顶掠弹和远处炮声；人声更清楚。",delivery:"火力中分段找掩护、互相招呼，短促急迫，班长有威信、幺娃惊慌，完整连续对话。" }),
  Cue("TrenchContact", [
    ["soldier", "沟里也进来了！前头拐弯！"],
    ["luo", "先把前头清了！莫挤一堆！"],
  ], {soundscape:"土壕脚步踩泥、换弹声、前方折角短促枪声，远处地面交火被厚土壁压闷。"}),
  Cue("ShelterAid", [
    ["liuwencai", "手松开点，我给你扎起。"],
  ], {soundscape:"遮蔽土壕内伤兵咬牙喘气、布条包扎摩擦，前方闷枪炮在远处持续。",delivery:"刘文财蹲下包扎伤口，声音低、认真、气息还没缓过来。"}),
  Cue("EscapeWhisper", [
    ["yaowa", "妈卖批……老子腿还在抖。"],
    ["shunzi", "刚才还坐到吃肉……"],
    ["yaowa", "顺哥……你还想跑嗦？"],
    ["shunzi", "你小声点。"],
    ["yaowa", "外头打成这样，你出得去？"],
    ["shunzi", "……等喊送伤兵，老子就抢着去。先跟到他们往后头走。"],
    ["yaowa", "送到了喃？"],
    ["shunzi", "找个空子溜。总不能跟到回来挨炸。"],
    ["shunzi", "到时候你莫声张。"],
  ], {soundscape:"厚土壁遮蔽区，近处惊魂未定的呼吸、细微衣料摩擦，远处低沉枪炮持续，不能突然安静如录音棚。",delivery:"两人压低声音贴近交谈，仍害怕且喘息，顺子开始盘算借后送脱身，幺娃担心但尚未同意一起跑；不轻松打趣。" }),
  Cue("WoundedArrival", [
    ["wounded", "慢点……"],
    ["luo", "先往里送！这里有人接！"],
  ], {soundscape:"两名守军架伤兵走入土壕，鞋底拖泥水、踉跄脚步和伤兵痛喘，前方枪炮持续。"}),
  Cue("SupportOrder", [
    ["soldier", "罗班长！前头顶不住了！排长叫你们过去支援，帮他们撤下来！"],
    ["luo", "哪边？"],
    ["soldier", "沿沟进去！最前头那个机枪位！"],
  ]),
  Cue("TankTerror", [
    ["heyoutian", "妈卖批……这龟儿子一炮一个窝！"],
    ["yaowa", "妈卖批！啥子鬼东西！"],
    ["soldier", "战车！脑壳莫伸出去！"],
    ["luo", "都下去！它看过来了！"],
    ["luo", "幺娃！你龟儿聋了嗦！"],
    ["yaowa", "晓得！晓得！"],
    ["luo", "莫盯到看！前头还有自己人！"],
  ]),
  Cue("FrontCoverCall", [["luo", "田坎后头那几个！替他们挡到！"]]),
  Cue("FrontBlockade", [
    ["soldier", "过不来！墙后头那挺机枪！"],
    ["luo", "顺子！破墙后头那挺，把它打哑！"],
  ]),
  Cue("FrontReminder", [["luo", "田坎后头！那几个是自己人！"]]),
  Cue("FrontFallback", [["luo", "破墙那挺机枪堵到他们了！先把它打哑！"]]),
  Cue("FrontCrossing", [["soldier", "不响了！走！"],["luo", "快下来！这边！"]]),
  Cue("FrontPursuit", [["heyoutian", "右边！莫让那几个撵上来！"]]),
  Cue("FrontReceived", [["yaowa", "脚底下！慢点，接到的！"],["soldier", "后头还有人！"]]),
  Cue("TakeMachineGun", [
    ["zhou", "弹匣！妈的……"],
    ["luo", "周哥，莫逞！"],
    ["zhou", "外头还有人！"],
    ["luo", "顺子！你上！"],
    ["shunzi", "我？"],
    ["luo", "不然老子喊哪个？压住前头，让他们回来！"],
    ["zhou", "破墙后头！那个冒火的口子！"],
    ["liuwencai", "弹匣在手边！"],
  ]),
  Cue("ThreeMagazines", [["liuwencai", "还有三匣！"]]),
  Cue("TwoMagazines", [["liuwencai", "两匣！"]]),
  Cue("GuardsSafe", [
    ["soldier", "下来了！"],
    ["yaowa", "最后两个也进来了！"],
    ["luo", "顺子，下来！何有田接枪！那车再过来，后头沟口都要给它封死！"],
    ["liuwencai", "这边！集束手榴弹！"],
    ["luo", "拿上！先把那龟儿车弄停！"],
  ]),
  Cue("TankStopped", [
    ["heyoutian", "停了！狗日的停了！"],
    ["luo", "脑壳收回来！炮还在！"],
  ]),
  Cue("JapaneseFlank", [["ija", "坦克停了！机枪，掩护！从右边绕过去！进村！"]], {
    subtitles: false, language: "zh",
  }),
  Cue("FlankWarning", [
    ["yaowa", "右边那股进村了！"],
    ["luo", "莫追！看住沟口！"],
  ]),
  Cue("Volunteer", [
    ["runner", "排长命令！这里三班接，你们班抽两个人跟后送队，把伤员送到南边转运点！"],
    ["luo", "交完呢？"],
    ["runner", "回来找排部！"],
    ["shunzi", "我去。"],
    ["luo", "老子点你了？"],
    ["shunzi", "我认得到刚才下车那条路。再说周哥我也认得到。"],
    ["luo", "你跟幺娃。何有田、文财也跟到，路上护着。"],
    ["shunzi", "晓得。"],
  ]),
  Cue("ZhouLift", [
    ["zhou", "慢点！脚这头托住……啊！"],
    ["bearer", "托到的！莫乱挣！"],
    ["luo", "周哥，忍一下，先送你去南头。"],
    ["zhou", "那边有车没得？"],
    ["bearer", "有接应。先过去再说。"],
  ]),
  Cue(
    "SouthSecret",
    [
      ["yaowa", "你娃跑得倒快。"],
      ["shunzi", "这种时候不快，等他喊我留下来嗦？"],
      ["yaowa", "你真准备送到地方就跑？"],
      ["shunzi", "先到了再说。"],
    ],
    { delivery: "并肩走路低声交谈" },
  ),
  Cue("SouthVehicles", [
    ["soldier", "能走的继续往南！重伤的前头上车！"],
    ["shunzi", "车往哪儿开？"],
    ["soldier", "往后头送啊！还能往哪儿开？"],
    ["yaowa", "你问得还多。"],
    ["shunzi", "老子随便问下。"],
    ["yaowa", "你随便个锤子。"],
  ]),
  Cue(
    "SouthHope",
    [
      ["shunzi", "还真有车。"],
      ["shunzi", "等把周哥送过去……"],
      ["yaowa", "嗯。"],
      ["shunzi", "你跟不跟我？"],
      ["yaowa", "……先把人送过去再说。"],
    ],
    { delivery: "放松一点、有希望，但仍低声，最后一句犹豫" },
  ),
  Cue("VillageAmbush", [
    ["medic", "后头莫挤！前头打起来了！"],
    ["bearer", "担架往墙根靠！莫堵路！"],
    ["heyoutian", "东巷有鬼子！机枪进屋了！"],
    ["luo", "顺子！穿右手那间屋！把窗口的机枪干掉，再把院门打开！担架从里头过！幺娃跟他！"],
  ]),
  Cue("CourtyardOpen", [
    ["luo", "通了！担架先过！"],
    ["bearer", "前头往里走！莫停门口！"],
  ]),
  Cue("ZhouThreshold", [
    ["zhou", "慢……慢点！"],
    ["yaowa", "门槛！脚这头抬高！"],
    ["bearer", "看到的！抬到！"],
  ]),
  Cue("TwoLitters", [["liuwencai", "后头还有两副！"]]),
  Cue("LastLitter", [
    ["luo", "最后一副！"],
    ["liuwencai", "过了！"],
    ["luo", "走！跟后送队！"],
  ]),
  Cue("TransferHope", [
    ["zhou", "前头……就是车？"],
    ["bearer", "就是。你龟儿命大，赶上了。"],
    ["zhou", "那就走快点嘛……"],
  ]),
  Cue("TransferDefense", [
    ["heyoutian", "后头追出来了！"],
    ["luo", "顺子，棚子东头那个墙口！看住来路！"],
  ]),
  Cue("TransferQueue", [
    ["liuwencai", "这批再装四个！"],
    ["medic", "腿伤那个先放这边！"],
    ["zhou", "老子排第几个？"],
    ["bearer", "急个锤子，前头三个。"],
  ]),
  Cue("TransferTwo", [
    ["zhou", "现在呢？"],
    ["bearer", "两个！"],
    ["heyoutian", "右边两个！"],
    ["luo", "莫追出去！守住路就行！"],
  ]),
  Cue("TransferOne", [
    ["liuwencai", "一、二、三……"],
    ["heyoutian", "你数个锤子，搭手！"],
    ["zhou", "现在呢？"],
    ["bearer", "前头一个！"],
  ]),
  Cue("FollowVehicle", [
    ["medic", "下一副！"],
    ["bearer", "周哥，到你了！"],
    ["shunzi", "班长，我跟车送过去？"],
    ["luo", "先把人抬上去再说！"],
  ]),
  Cue("AircraftFirst", [
    ["medic", "飞机——！"],
    ["luo", "散开！莫挤在路上！"],
    ["medic", "能走的自己下沟！担架往西边！"],
    ["zhou", "啊——！莫动！莫动我！"],
    ["soldier", "这边中了一个！卫生兵！"],
    ["medic", "老子就是！莫喊了！先把他拖下来！"],
    ["yaowa", "狗日的！这边全是伤兵！"],
    ["heyoutian", "妈卖批！趴下！趴下！"],
    ["luo", "顺子！回来！东边鬼子上来了！"],
  ]),
  Cue("CarryZhou", [
    ["zhou", "啊——！后头！来个人！"],
    ["luo", "顺子！接后头！何有田，顶他的位置！"],
    ["bearer", "往这边！前头有坡！"],
    ["zhou", "慢点……莫把我丢了。"],
  ]),
  Cue("AircraftReturn", [
    ["yaowa", "又来了！"],
    ["heyoutian", "狗日的！伤兵也打！"],
    ["luo", "下沟！快！"],
  ]),
  Cue("RescueZhou", [
    ["yaowa", "周哥！看我！"],
    ["bearer", "还有气！卫生兵！这边！"],
    ["luo", "顺子！拿枪！后头要进来了！"],
  ]),
  Cue("WestRetreat", [
    ["soldier", "南边那条后送路断了！车过不去！"],
    ["luo", "走西边沟！去城边接收院！文财带前头！顺子跟老子断后！"],
  ]),
  Cue("RetreatFirst", [
    ["yaowa", "周哥，听到没得？"],
    ["zhou", "听到……了。"],
    ["yaowa", "那你应我一声嘛，莫闭眼。"],
    ["luo", "撤！下一处墙口！"],
  ]),
  Cue("RetreatBleeding", [
    ["bearer", "转弯！后头慢点！"],
    ["yaowa", "他这边又在流！何有田！布！快点！"],
    ["heyoutian", "拿这个！"],
    ["medic", "莫围到！让出路！"],
    ["luo", "幺娃！把布压住！"],
  ]),
  Cue("RetreatCold", [
    ["yaowa", "周哥？"],
    ["zhou", "……冷。"],
    ["yaowa", "班长！周哥喊冷！"],
    ["luo", "还有好远？"],
    ["liuwencai", "院门就在前头！"],
  ]),
  Cue("ReceptionDefense", [
    ["soldier", "担架进来！枪口莫堵门！"],
    ["luo", "顺子！右手窗口！先把外头那几个压回去！"],
  ]),
  Cue("FinalCarry", [
    ["heyoutian", "这边我看着！接一下周哥！"],
    ["medic", "放这里！慢点！"],
  ]),
  Cue(
    "ZhouDeath",
    [
      ["yaowa", "周哥？到了，听到没得？"],
      ["medic", "让开点。……没得了。"],
      ["yaowa", "啥子？"],
      ["medic", "人没了。"],
      ["yaowa", "你再看哈！他刚才还答我了！周哥——！"],
      ["soldier", "鬼子上来了！"],
      ["luo", "幺娃！起来！顺子，把枪拿起！"],
    ],
    { speechRate:50, soundscape:"近处布条轻响，院外很低的枪声，绝不能遮住任何一个字，短对白持续期间保持同一背景。", delivery: "完整七轮交谈。四名男性分别发言，每次都等上一名说完再接话，不重叠。前五轮是幺娃和卫生兵，随后第六轮另一名士兵近距离高声清楚喊出全部五个字：鬼、子、上、来、了！不能用枪声或其他角色的喊声代替，也不能省略鬼子两个字。第七轮罗班长大声喊完整命令，句子末尾是把枪拿起。整体急切、无长停顿、无开场尾声。" },
  ),
  Cue("ReceptionWithdrawal", [
    ["soldier", "右边墙口守不住了！"],
    ["runner", "罗班长！接收点往城里撤！东关缺人！排长叫能拿枪的过去！"],
    ["medic", "能走的跟后头！药箱拿上！"],
    ["luo", "何有田守门！顺子，把右边墙口那几个打下去！文财带伤员走！幺娃！后头还有活人！过来搭手！"],
  ]),
  Cue("JapanesePursuit", [["ija", "门口！开枪！绕到屋后头去！"]], { subtitles: false, language: "zh" }),
  Cue("FinalExit", [
    ["liuwencai", "最后两个出来了！"],
    ["heyoutian", "顺子！走！老子换弹！"],
    ["luo", "退到后门！莫恋战！"],
    ["soldier", "伤员往里！拿枪的去东关！"],
    ["luo", "跟上！"],
  ]),
]);
export function MissionVoicePrompt(cue) {
  const cast = [...new Set(cue.lines.map((line) => line.who))]
    .map((who) => MISSION_VOICE_CAST[who].join("："))
    .join("；");
  const environment = cue.soundscape || MissionVoiceSoundscape(cue.id);
  const prompt = `生成游戏战场剧情的整段连续多人对白和同场环境声，一个完整音频，一次演完。1938年四川军人，所有中国人物必须讲地道四川话，使用四川方言语调与发音，不能仅四川词汇配普通话播音。${cast}。${cue.delivery || "自然接话、短停顿、呼吸，角色声音明确不同且稳定。"}环境声必须录进本次完整录音：${environment}环境声保持在对白下方，整段连续不突兀截断；不加音乐，不念角色名和动作说明，不删词改词，不添加其他可辨识台词。日军角色只说稿中日语。完整对白如下：\n${cue.lines.map((line) => `${MISSION_VOICE_CAST[line.who][0]}：“${line.text}”`).join("\n")}`;
  // Explicit user dialect override also applies to the enemy commands.
  return cue.language === "zh" ? prompt.replace("所有中国人物", "所有人物").replace("日军角色只说稿中日语。", "敌军角色同样只讲四川话。") : prompt;
}
export function MissionVoiceSoundscape(id) {
  if (["SouthSecret","SouthVehicles","SouthHope","ZhouLift","Volunteer","TransferHope"].includes(id))
    return "户外后送队脚步、木轮、衣料装备碰触、骡铃、担架木杆轻响和伤兵喘息；后方枪炮低闷，不渲染迫近悲剧。";
  if (id.startsWith("Transfer") || id==="FollowVehicle")
    return "转运棚周围装车木板与车轮、担架抬放、脚步、伤兵喘息，人群忙碌，远近枪声保持在对白下。";
  if (id.startsWith("Aircraft") || ["CarryZhou","RescueZhou"].includes(id))
    return "低空飞机发动机掠过、远近扫射与爆炸余响、脚步和急促呼吸；保持对白完整可辨，不添加额外台词。";
  if (id==="ZhouDeath")
    return "接收院内近处伤兵微弱呼吸、布料轻响；院外持续交火，枪弹擦过墙头、碎土落下，不能变成安全静室。";
  return "1938年户外战场，连续远近枪炮低声底、脚步、衣料与装备摩擦、呼吸；土墙遮蔽让远处声音低闷，主要对白始终清晰。";
}
