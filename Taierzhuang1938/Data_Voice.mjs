// 滕县保卫战 · 川军战场口令声库（**四川话**）
//
// 玩家演的是川军第 22 集团军第 41 军 122 师的一名基层士兵。这批口令因此是
// **四川话**，不是普通话 —— 上一版全员标准普通话，那是「电视剧腔」的主要来源。
//
// ## 川味从哪来：文本，不是参数
// 配音用字节的 seed-audio-1.0（本机 MiniMax Hub 网关）。**它没有方言参数** ——
// 口音是从「文本本身的方言词汇与语法」里读出来的。所以这批文本怎么写，
// 直接决定有没有川味；参数那一栏能做的只有音高与语速。
//
// 生成参数：speed "1" / volume "1" / sample_rate "32000"，pitch 按角色分
// （班长 -2 ｜ 老兵 -4 ｜ 普通兵 0 ｜ 新兵 +2）。
// **不要把 speed 提上去** —— 实测 1.35 时模型频繁只吐半句。要提速走后期 atempo。
//
// ## 改写的原则（三稿竞写 + 三视角评审 + 合稿定的）
// 堆词表没有用。巴适、要得、莫得、瓜娃子、安逸 —— 光换词、语法还是普通话骨架，
// 出来就是「普通话演员念台词本」。真正管用的是改**语法**：
// 否定「莫」、持续体「到起」、完成体「起」、被动「遭」、情态否定「不得」、
// 句尾「咯／哦」、把字句改「给＋人＋动」。
//
// 三条硬约束压在川味之上：
//   1. **战术词钉在句首、原样不动**（缺口／手榴弹／战车／飞机／担架兵／桥夹／方位），
//      方言只挂在信息已经送到之后的半句上。方言是味道，不是谜语。
//   2. **3—12 字**。喊出来的，不是念的。
//   3. **红线**：官对兵「弟兄伙」、兵对官按职务；禁「同志们」「师座／军座」。
//
// ## 评审组逮到的几处（我自己不会发现的）
//   · **「卫生兵」是史实硬伤** —— 本仓考据结论是中方无正规医护兵编制、靠同班弟兄
//     与担架兵（docs/Data_EasyRed2Controls.md、Data_EasyRed2Parity.md），
//     122 师是杂牌中的杂牌更不可能有。已改「担架兵！」
//   · **「东头」是北方话方位**（村东头／胡同东头），川人说「东边／左手边」。
//     「听起来像方言的外地词」比不写方言更伤 —— 川味和考据一起丢。
//   · **「老总」是老百姓对当兵的叫法**，不是军内自称，用了就穿帮。
//   · **补语「倒／起／到起」不能混用**：顶倒＝顶翻、躲倒＝摔倒，意思正好相反。
//     定死：真倒下才用「倒」（趴倒、人不倒），持续用「到起」，完成／附着用「起」。
//   · **「给老子」全篇限两处**，都在班长督战句。一个普通兵对同班平级自称「老子」
//     是身份越位，不是川味是失真。
//   · **「咯」全部删光（2026-08-20）** —— 起初只是嫌它密（27 句里 9 句以「咯」收尾，
//     连播会变成可听见的口头禅）。真正的问题比这个严重：**「咯」在报警句上是轻快的**。
//     「鬼子上来咯」「战车来咯」听着像在报喜，玩家收到的情绪与画面里正在发生的事相反。
//     它是完成体 + 缓和语气的组合，适合「饭熟咯」，不适合「敌人上来了」。
//     现在报警句一律用「了」收尾并把关键名词重复一遍（「战车！战车碾拢来了！」），
//     急迫感来自**重复与语序**，不来自语气词。全表 0 条「咯」。
//
// ## event 字段
// 标了 event 的句子**有前提条件**，不许被同类随机抽中，只能由知道前提的调用方
// 用 key 点名（见 Script_Audio.Bark）。漏配的默认行为是「不喊」，不是「乱喊」。
//   spot_tank   —— 滕县攻城日军无战车（34 辆九四式全配属给打临城的第 63 联队，
//                  见 docs/Data_TengxianCity.md），只能在有装甲的关触发
//   spot_plane  —— 有飞机时才喊
//   ammo_grenade / move_nogun —— 对应「三分之一以上无步枪、开局只有手榴弹」
//                  这个史实状态（docs/Data_TengxianDesign.md），有枪时喊出来就穿帮
//   rally_grenade —— 近距离投弹时机的战术提示，不是通用鼓劲
//
// ## 归一化
// 自己算 10 ms 一格的 RMS 包络定首尾（**不用 ffmpeg 的 silenceremove**：
// 它与 silencedetect 判据对不上，实测把 5 个字的句子切得只剩 0.53 s），
// 再 loudnorm -18 LUFS、单声道 24 kHz 64 kbps。
// warn 类 1.9 s / spot 类 2.3 s / 其余 2.5 s 的时长上限用 atempo 压（保音高）——
// seed-audio 在 speed=1 下念得偏「郑重」，救命提示拖到三秒等于失效。
//
// ## 方言词表（终稿实际用到的）
//   莫 = 别／不要
//   莫得 = 没有
//   莫慌 = 别慌
//   咯 = 了（句尾，表完成或新情况）
//   跟到 = 跟着（随行持续补语）
//   到起 = 着（持续体：顶到起＝顶住不放，站到起＝站着不动）
//   上起 = 上好（完成／附着体：刺刀上起＝上好刺刀）
//   躲起 = 躲好／隐蔽
//   趴倒 = 卧倒
//   不得 = 不能／不会（不得丢＝不能丢）
//   遭 = 被（被动标记）
//   枪子 = 子弹（遭枪子＝中弹）
//   哪个 = 谁
//   匀 = 分一点给／让给
//   一哈 = 一下
//   歇气 = 歇口气／停下来
//   走拢 = 走近／到跟前
//   这头 = 这边／这儿
//   左手边 = 左边
//   弟兄伙 = 弟兄们（官对兵的称呼，红线内）
//   给老子 = 给我（班长督战时的自称，全篇限两处）
//   龟儿子 = 王八蛋（1930 年代通行骂法，只对敌不对己）
//   哦 = 句尾拖腔的呼唤语气
//   挂彩 = 负伤（民国军中通行语，非川话专属）
//   压子弹 = 装弹（桥夹压入固定弹仓，非川话专属）
//   桥夹 = 弹夹／弹匣（中正式、汉阳造的 5 发桥夹，1938 年正确叫法）
//   战车 = 坦克（1938 年国军叫法，非川话专属）
//   担架兵 = 卫生兵／医护兵（史实校正：中方无正规医护兵编制）
//
// ## 仍然存在的风险（合稿人列的，实听时按这个单子听）
//   1. 「咯」仍有 7 条（spot_enemy／spot_wall／spot_gap／spot_tank／ammo_out／hurt_hit／warn_shell；滕县关实际可听见 6 条，spot_tank 应被关卡门控掉），比三位评审各自的选稿（9 条）已经压下来，但仍高于可懂评审要求的 5 条。密集连播时它可能被听成同一个口头禅、反而暴露是一张表在念；实听后优先砍 warn_shell 与 spot_tank——这两条各自还有「趴倒」和关卡门控兜底。
//   2. rally_shoot 的「莫歇气」与「莫泄气」在喊叫状态下近乎同音，一旦听岔，「持续射击」这条战术信息就降级成一句鼓劲话。前面两声「打」是兜底，但这是全稿唯一一处靠上下文救回来的可懂度赌注；实听不过关就整句退回 C 的「打！打！莫停手！」。
//   3. ammo_reload 的「一哈」（＝一下）里那个「哈」有被 seed-audio 读成笑声、或读成生硬 hā 的风险，必须单独试听这一条再定；退路是可懂与军语都认可的安全版「我压子弹！掩护我！」（7 字），代价是这句会一点方言骨架都不剩。
//   4. 方位与指示词的川味判断三家打架、这一轮是我硬裁的：hurt_medic 取「这头」（川味评审认为泛北方，但「这头／那头／哪头」在川渝口语里确实通行，而「这点」在普通话耳朵里会先被解成「这一点点」）；spot_east 因为唯一的方言候选「东头」是北方话（村东头／胡同东头）而主动放弃方言层，改用方位重复换抗噪。这两处最好找一位川籍老人的耳朵校一遍，尤其「这头」。
//   5. spot_tank 必须做关卡门控：滕县攻城日军无战车无装甲车（docs/Data_TengxianCity.md:541/617、docs/Data_TengxianDesign.md:25/384/798，34 辆九四式全配属给打临城的第 63 联队），这条词只能在台儿庄关触发。文本再对，播错关就是穿帮，而这一条不是文本能自己解决的。
//   6. TTS 读音待验的几处：「顶到起」可能被读成顶／到／起三顿而不是一个持续体；「遭枪子」的「子」可能被读成轻声或儿化；「匀」「桥夹」是低频词，音准与轻重要听；「龟儿子」有被内容过滤或读得过于滑稽的可能。这四处建议第一批就单独出样试听。
//   7. 外省可懂度的两个薄弱点：ammo_ask 的「匀」，且关键名词「桥夹」被推到句尾——噪音里若只听见前半的「哪个匀我」，队友不知道该扔什么（这是为保住「哪个＋匀」这个全篇唯一反问骨架付的代价）；以及 rally_hold2 的「不得丢」，若被听成「不得了」语义全反。
//   8. 「担架兵」要和仓内医疗系统的措辞对齐：docs 里包扎机制写的是「任何人捡到药包都能救人」，若 HUD／交互文案还写「卫生兵」，语音与界面会当场打架。这是本轮唯一一处语音改动倒逼系统文案的地方。
//   9. 「老子」全篇只留 2 次（都在班长督战句）是三位评审的共同意见，但代价是整体口气比用户实听认可的那条测试句要收敛不少。若实听下来觉得味淡，加浓的地方应该是语气词与补语（哈／哦／到起／拢／走拢），不要再加「老子」，更不要往里塞方言名词——那正是这次返工要修的老毛病。
//
// role 只记录「这句话该由谁喊」，运行时不据此挑人 —— 挑选按 kind + 种子，
// 见 Script_Audio.Bark()。

export const VOICE_BASE = "Audio/";

export const VOICE_LINES = [
  // ===== 序章｜出川（12 句，按过场时间轴固定顺序） ============================
  // Windows Speech 的中文原声只作为可复现离线生成器；轻四川/重庆语感来自台词本身。
  { key: "prologue_young_dispatch_01", kind: "prologue", file: "vo_prologue_young_dispatch_01.mp3", dur: 1.87, role: "年轻传令兵", pitch: 0, prologue: true, systemSpeech: { voice: "Microsoft Kangkang", rate: -1 }, text: "我们出川好久了哦。" },
  { key: "prologue_old_wound_01", kind: "prologue", file: "vo_prologue_old_wound_01.mp3", dur: 2.47, role: "旧伤士兵", pitch: -2, prologue: true, systemSpeech: { voice: "Microsoft Huihui", rate: -2 }, text: "路莫问，跟到走就是。" },
  { key: "prologue_young_dispatch_02", kind: "prologue", file: "vo_prologue_young_dispatch_02.mp3", dur: 2.45, role: "年轻传令兵", pitch: 0, prologue: true, systemSpeech: { voice: "Microsoft Kangkang", rate: -1 }, text: "我都忘了屋头腊肉是啥味道了。" },
  { key: "prologue_machine_gunner_01", kind: "prologue", file: "vo_prologue_machine_gunner_01.mp3", dur: 1.65, role: "机枪手", pitch: -1, prologue: true, systemSpeech: { voice: "Microsoft Huihui", rate: 0 }, text: "你娃儿还惦记腊肉。" },
  { key: "prologue_young_dispatch_03", kind: "prologue", file: "vo_prologue_young_dispatch_03.mp3", dur: 2.19, role: "年轻传令兵", pitch: 0, prologue: true, systemSpeech: { voice: "Microsoft Kangkang", rate: -1 }, text: "不惦记吃的惦记啥子嘛。" },
  { key: "prologue_machine_gunner_02", kind: "prologue", file: "vo_prologue_machine_gunner_02.mp3", dur: 2.45, role: "机枪手", pitch: -1, prologue: true, systemSpeech: { voice: "Microsoft Huihui", rate: 0 }, text: "到了前头，有热水喝你就谢天谢地。" },
  { key: "prologue_rifleman_01", kind: "prologue", file: "vo_prologue_rifleman_01.mp3", dur: 0.54, role: "擦枪士兵", pitch: 0, prologue: true, systemSpeech: { voice: "Microsoft Yaoyao", rate: -1 }, text: "又卡。" },
  { key: "prologue_old_wound_02", kind: "prologue", file: "vo_prologue_old_wound_02.mp3", dur: 2.45, role: "旧伤士兵", pitch: -2, prologue: true, systemSpeech: { voice: "Microsoft Huihui", rate: -2 }, text: "你少骂两句，它兴许听话点。" },
  { key: "prologue_squad_leader_01", kind: "prologue", file: "vo_prologue_squad_leader_01.mp3", dur: 2.44, role: "班长", pitch: -2, prologue: true, systemSpeech: { voice: "Microsoft Kangkang", rate: -2 }, text: "莫摆了。线盘再检查一遍，到了地头就要用。" },
  { key: "prologue_old_wound_03", kind: "prologue", file: "vo_prologue_old_wound_03.mp3", dur: 0.58, role: "旧伤士兵", pitch: -2, prologue: true, systemSpeech: { voice: "Microsoft Huihui", rate: -2 }, text: "近咯。" },
  { key: "prologue_squad_leader_02", kind: "prologue", file: "vo_prologue_squad_leader_02.mp3", dur: 2.46, role: "班长", pitch: -2, prologue: true, systemSpeech: { voice: "Microsoft Kangkang", rate: -2 }, text: "都醒起，装备拿好。" },
  { key: "prologue_external_officer_01", kind: "prologue", file: "vo_prologue_external_officer_01.mp3", dur: 2.45, role: "车外军官", pitch: -1, prologue: true, systemSpeech: { voice: "Microsoft Kangkang", rate: -1 }, text: "通信排，下车！线盘背起，搞快！" },

  { key: "rally_bayonet",   kind: "rally",  file: "vo_rally_bayonet.mp3",  dur: 2.36,  role: "老兵",    pitch: -4,                  text: "刺刀上起！跟到我杀！" },
  { key: "rally_charge",    kind: "rally",  file: "vo_rally_charge.mp3",   dur: 2.50,  role: "班长",    pitch: -2,                  text: "冲！给老子冲！" },
  { key: "rally_dadao",     kind: "rally",  file: "vo_rally_dadao.mp3",    dur: 2.37,  role: "老兵",    pitch: -4,                  text: "杀！大刀砍拢去！" },
  { key: "rally_follow",    kind: "rally",  file: "vo_rally_follow.mp3",   dur: 2.14,  role: "班长",    pitch: -2,                  text: "弟兄伙，跟到我上！" },
  { key: "rally_grenade",   kind: "rally",  file: "vo_rally_grenade.mp3",  dur: 2.51,  role: "老兵",    pitch: -4,  event: true,  text: "莫慌！等他走拢再甩！" },
  { key: "rally_hold",      kind: "rally",  file: "vo_rally_hold.mp3",     dur: 2.51,  role: "班长",    pitch: -2,                  text: "顶到起！给老子顶到起！" },
  { key: "rally_hold2",     kind: "rally",  file: "vo_rally_hold2.mp3",    dur: 2.50,  role: "班长",    pitch: -2,                  text: "人不倒，阵地就不得丢！" },
  { key: "rally_noretreat", kind: "rally",  file: "vo_rally_noretreat.mp3", dur: 2.35,  role: "班长",    pitch: -2,                  text: "莫退！一步都莫退！" },
  { key: "rally_oath",      kind: "rally",  file: "vo_rally_oath.mp3",     dur: 2.49,  role: "班长",    pitch: -2,                  text: "鬼子不打完，莫回四川！" },
  { key: "rally_shoot",     kind: "rally",  file: "vo_rally_shoot.mp3",    dur: 2.37,  role: "班长",    pitch: -2,                  text: "打！打！莫歇气！" },
  { key: "spot_east",       kind: "spot",   file: "vo_spot_east.mp3",      dur: 2.36,  role: "普通兵",   pitch: 0,                   text: "东边！东边有鬼子！" },
  { key: "spot_enemy",      kind: "spot",   file: "vo_spot_enemy.mp3",     dur: 2.37,  role: "普通兵",   pitch: 0,                   speed: 1.1, text: "鬼子！鬼子摸拢来了！" },
  { key: "spot_gap",        kind: "spot",   file: "vo_spot_gap.mp3",       dur: 2.35,  role: "普通兵",   pitch: 0,                   speed: 1.1, text: "缺口！鬼子钻进来了！" },
  { key: "spot_plane",      kind: "spot",   file: "vo_spot_plane.mp3",     dur: 2.30,  role: "普通兵",   pitch: 0,   event: true,  text: "飞机！快躲起！" },
  { key: "spot_tank",       kind: "spot",   file: "vo_spot_tank.mp3",      dur: 2.36,  role: "新兵",    pitch: 0,   event: true,  speed: 1.15, text: "战车！战车碾拢来了！" },
  { key: "spot_wall",       kind: "spot",   file: "vo_spot_wall.mp3",      dur: 2.34,  role: "普通兵",   pitch: 0,                   speed: 1.1, text: "墙上！鬼子爬上墙了！" },
  { key: "warn_down",       kind: "warn",   file: "vo_warn_down.mp3",      dur: 1.84,  role: "老兵",    pitch: -4,                  text: "趴倒！趴倒！" },
  { key: "warn_grenade",    kind: "warn",   file: "vo_warn_grenade.mp3",   dur: 1.91,  role: "普通兵",   pitch: 0,                   text: "手榴弹！闪！" },
  { key: "warn_shell",      kind: "warn",   file: "vo_warn_shell.mp3",     dur: 2.36,  role: "老兵",    pitch: -4,                  speed: 1.1, text: "炮来了！趴倒！莫动！" },
  { key: "ammo_ask",        kind: "ammo",   file: "vo_ammo_ask.mp3",       dur: 2.37,  role: "普通兵",   pitch: 0,                   text: "桥夹！哪个匀我一个！" },
  { key: "ammo_grenade",    kind: "ammo",   file: "vo_ammo_grenade.mp3",   dur: 2.36,  role: "普通兵",   pitch: 0,   event: true,  text: "手榴弹！莫得了！" },
  { key: "ammo_out",        kind: "ammo",   file: "vo_ammo_out.mp3",       dur: 2.35,  role: "普通兵",   pitch: 0,                   text: "子弹！我莫得子弹了！" },
  { key: "ammo_reload",     kind: "ammo",   file: "vo_ammo_reload.mp3",    dur: 2.14,  role: "普通兵",   pitch: 0,                   text: "我压子弹！掩护我一哈！" },
  { key: "hurt_down",       kind: "hurt",   file: "vo_hurt_down.mp3",      dur: 2.37,  role: "普通兵",   pitch: -4, speed: 0.85,                   text: "班长哦！班长！" },
  { key: "hurt_hit",        kind: "hurt",   file: "vo_hurt_hit.mp3",       dur: 2.37,  role: "普通兵",   pitch: 0,                   speed: 1.1, text: "遭了！我遭枪子了！" },
  { key: "hurt_medic",      kind: "hurt",   file: "vo_hurt_medic.mp3",     dur: 2.36,  role: "普通兵",   pitch: 0,                   text: "担架兵！这头有人挂彩！" },
    { key: "hurt_scream", kind: "hurt", file: "vo_hurt_scream.mp3", dur: 0.82, role: "普通兵",
    // **这一条不走 TTS**：非语言的惨叫模型做不像，而且 seedaudio 的默认音色偏女声，
    // pitch 压到 -6 出来还是个女的（用户第一反应就是「啊——怎么是女声」）。
    // 改用免版税素材库里的真人男声痛呼 —— 一声「啊」没有台词，换成实录零成本。
    sample: {
      item: "sonniss-gdc-2016-game-audio-bundle-normalized",
      path: "SoundBits -  Screams & Shouts 2 - Humans/Male_Shout-of-Pain_132.mp3",
      credit: "SoundBits · 男性痛呼 · Sonniss GDC 2016（免版税）", maxDur: 1.6,
    },
    text: "啊——！" },
  { key: "move_cover",      kind: "move",   file: "vo_move_cover.mp3",     dur: 2.35,  role: "班长",    pitch: -2,                  text: "找掩护！躲到起！" },
  { key: "move_flank",      kind: "move",   file: "vo_move_flank.mp3",     dur: 1.73,  role: "班长",    pitch: -2,                  text: "左手边！绕过去！" },
  { key: "move_go",         kind: "move",   file: "vo_move_go.mp3",        dur: 1.84,  role: "班长",    pitch: -2,                  text: "走！莫站到起！" },
  { key: "move_nogun",      kind: "move",   file: "vo_move_nogun.mp3",     dur: 2.22,  role: "班长",    pitch: -2,  event: true,  text: "莫得枪的，跟到走！" },

  // ===== 日方（濑谷支队）=====================================================
  //
  // **text 必须是纯假名，一个汉字都不能有。** seed-audio 从文本本身判断语言：
  // 写成汉字的「突撃！」会被当中文读（实测出来是中文的两个音节），
  // 写成假名的「とつげき！」才读出四拍日语。汉字写法记在 kanji 字段，只作文档用。
  //
  // side: "ija" —— Bark 按阵营过滤声库。挑错阵营就是日本兵喊中文（或反过来），
  // 那比没有配音更糟。未标 side 的一律按中方处理（中方那 31 条的兼容默认）。
  //
  // 红线（考据组定的，都在这批里守住了）：
  //   · **一句「バカヤロー」都没有** —— 这是抗日神剧的头号标志，列了黑名单第一条
  //   · 不用战后／自卫队用语（「了解」「ラジャー」这类）
  //   · 口语弹药词「たま（弾）」全表弃用 —— 「たまがない」在中国耳朵里几乎必然
  //     被听成脏话开头，是这批最大的误听雷；改用「弾薬」，既避雷又更合部队用词
  //   · 全表唯一一处「支那兵」（ija_spot_shina）：1938 年日方作战文书与部队口语
  //     对中国军队的通称，属史实用语。标了 event，只用于报敌情，不进任何贬损性描述 ——
  //     非 event 的话它会在 4.5 s 同类闸下反复播，把唯一一句敏感词做成口头禅
  //
  // 与中方声库的对位（这是这批最值钱的地方）：
  //   ija_rally_bayonet「着剣！急げ！」  ←→  rally_bayonet「刺刀上起！」白刃战两边各喊各的
  //   ija_hurt_medic「衛生兵！こっちだ！」←→ hurt_medic「担架兵！」
  //     —— 日军确有「衛生兵」这一兵科编制，而中方无正规医护兵编制、靠同班弟兄与担架兵。
  //     **这个词的有无本身就是双方后勤差距的听觉证据**，不用一句台词解释。
  //   日方整体格式化（目標→方位→撃ち方始め 的操典模板），中方整体四川口语 ——
  //   「同一套模板又走一遍 vs 各说各话」是听得见的阵营差。
  //
  // 时长按类别用 atempo 压（保音高）：warn 1.9 s / spot 2.3 s / 其余 2.5 s。
  // 拍数与时长的相关性验过（r=0.57，喊话本来忽长忽短）；四条相对拟合明显偏短的重生成过，
  // 其中两条确实是截断（いったんさがれ 0.63→2.11 s、もくひょう 1.00→1.66 s），
  // 另两条三次独立生成都稳定 —— **截断会忽长忽短，稳定就说明是真的喊得快**。
  { key: "ija_rally_bayonet",   kind: "rally",  file: "vo_ija_rally_bayonet.mp3", dur: 2.24,  role: "古兵",    pitch: -4,  side: "ija", event: true,  text: "ちゃっけん！いそげ！", kanji: "着剣！急げ！", cn: "上刺刀！快！" },
  { key: "ija_rally_charge",    kind: "rally",  file: "vo_ija_rally_charge.mp3", dur: 1.14,  role: "分隊長",   pitch: -2,  side: "ija",                 text: "とつげき！", kanji: "突撃！", cn: "冲锋！" },
  { key: "ija_rally_fire",      kind: "rally",  file: "vo_ija_rally_fire.mp3",   dur: 1.91,  role: "分隊長",   pitch: -2,  side: "ija",                 text: "うちかたはじめ！", kanji: "撃ち方始め！", cn: "开始射击！" },
  { key: "ija_rally_follow",    kind: "rally",  file: "vo_ija_rally_follow.mp3", dur: 1.42,  role: "分隊長",   pitch: -2,  side: "ija",                 text: "われにつづけ！", kanji: "我に続け！", cn: "跟我上！" },
  // ija_spot_enemy「てきだ！ひだり！ひだりだ！」（敵だ！左！左だ！）**暂时摘掉**。
  //
  // 不是文本的问题 —— 那句是两位评审一致选的，省助词、方位单独成句再补一遍，
  // 是被枪声压住时的真实口语形态。摘掉是**音频质量**：这一条 seedaudio 出来时
  // 自带一层房间声，源文件底噪 −38.8 dB，走完对齐链是 −32 dB，
  // 而闸门要求 ≤ −40（Script_VoiceTest「没有自带环境音」那条）。
  // 两级 afftdn 频域降噪也只压到 −32；再往下压就开始吃气声了。
  //
  // 正解是**重摇一条干净的**（memory 里那条「TTS 自带环境音要重摇」）。
  // 摇的时候本机 MiniMax Hub 连不上（连接被拒），所以先摘。
  // Hub 恢复后：拿 lines_ija.json 里这一条重生成，底噪 ≤−45 再放回来，
  // 文本一个字都不用改。spot 类还剩 4 条，短期不会复读。
  { key: "ija_spot_mg",         kind: "spot",   file: "vo_ija_spot_mg.mp3",      dur: 2.29,  role: "兵",     pitch: 0,   side: "ija",                 text: "きかんじゅう！まえだ！", kanji: "機関銃！前だ！", cn: "机枪！在前面！" },
  { key: "ija_spot_shina",      kind: "spot",   file: "vo_ija_spot_shina.mp3",   dur: 2.30,  role: "古兵",    pitch: -4,  side: "ija", event: true,  text: "しなへいだ！まだいるぞ！", kanji: "支那兵だ！まだ居るぞ！", cn: "支那兵！他们还在！" },
  { key: "ija_spot_target",     kind: "spot",   file: "vo_ija_spot_target.mp3",  dur: 2.30,  role: "分隊長",   pitch: -2,  side: "ija",                 text: "もくひょう！みぎぜんぽう！", kanji: "目標！右前方！", cn: "目标！右前方！" },
  { key: "ija_spot_wall",       kind: "spot",   file: "vo_ija_spot_wall.mp3",    dur: 1.17,  role: "兵",     pitch: 0,   side: "ija", event: true,  text: "じょうへきにてきへい！", kanji: "城壁に敵兵！", cn: "城墙上有敌兵！" },
  { key: "ija_warn_down",       kind: "warn",   file: "vo_ija_warn_down.mp3",    dur: 1.60,  role: "古兵",    pitch: -4,  side: "ija",                 text: "ふせろ！うごくな！", kanji: "伏せろ！動くな！", cn: "卧倒！别动！" },
  { key: "ija_warn_grenade",    kind: "warn",   file: "vo_ija_warn_grenade.mp3", dur: 1.91,  role: "兵",     pitch: 0,   side: "ija",                 text: "てりゅうだん！ふせろ！", kanji: "手榴弾！伏せろ！", cn: "手榴弹！卧倒！" },
  { key: "ija_warn_shell",      kind: "warn",   file: "vo_ija_warn_shell.mp3",   dur: 1.91,  role: "分隊長",   pitch: -2,  side: "ija", event: true,  text: "ほうげき！たいひ！", kanji: "砲撃！退避！", cn: "炮击！退避！" },
  { key: "ija_ammo_out",        kind: "ammo",   file: "vo_ija_ammo_out.mp3",     dur: 1.21,  role: "兵",     pitch: 0,   side: "ija",                 text: "だんやくをよこせ！", kanji: "弾薬を寄こせ！", cn: "把弹药递过来！" },
  { key: "ija_ammo_reload",     kind: "ammo",   file: "vo_ija_ammo_reload.mp3",  dur: 2.51,  role: "兵",     pitch: 0,   side: "ija",                 text: "そうてんちゅう！えんごたのむ！", kanji: "装填中！援護頼む！", cn: "装填中！掩护我！" },
  { key: "ija_hurt_hit",        kind: "hurt",   file: "vo_ija_hurt_hit.mp3",     dur: 1.07,  role: "兵",     pitch: 0,   side: "ija",                 text: "うでをやられた！", kanji: "腕をやられた！", cn: "胳膊中弹了！" },
  { key: "ija_hurt_leader",     kind: "hurt",   file: "vo_ija_hurt_leader.mp3",  dur: 2.51,  role: "兵",     pitch: 0,   side: "ija", event: true,  text: "ぶんたいちょうどのがやられた！", kanji: "分隊長殿がやられた！", cn: "分队长中弹了！（分隊長＝相当于中方的班长）" },
  { key: "ija_hurt_medic",      kind: "hurt",   file: "vo_ija_hurt_medic.mp3",   dur: 2.42,  role: "兵",     pitch: 0,   side: "ija",                 text: "えいせいへい！こっちだ！", kanji: "衛生兵！こっちだ！", cn: "卫生兵！在这边！" },
  { key: "ija_move_advance",    kind: "move",   file: "vo_ija_move_advance.mp3", dur: 2.14,  role: "分隊長",   pitch: -2,  side: "ija",                 text: "さんかい！まえへ！", kanji: "散開！前へ！", cn: "散开！向前！" },
  { key: "ija_move_back",       kind: "move",   file: "vo_ija_move_back.mp3",    dur: 2.27,  role: "分隊長",   pitch: -2,  side: "ija",                 text: "いったんさがれ！", kanji: "一旦下がれ！", cn: "暂时后撤！" },
  { key: "ija_move_flank",      kind: "move",   file: "vo_ija_move_flank.mp3",   dur: 1.31,  role: "分隊長",   pitch: -2,  side: "ija",                 text: "そくめんにまわれ！", kanji: "側面に回れ！", cn: "从侧翼绕过去！" },
];

/** 按类别取所有键（不含 event 句），给测试与调试用。 */
export function VoiceKeysOf(kind) {
  return VOICE_LINES.filter((v) => v.kind === kind && !v.event).map((v) => v.key);
}
