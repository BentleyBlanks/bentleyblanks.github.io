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
  { key: "rally_bayonet",   kind: "rally",  file: "vo_rally_bayonet.mp3",  dur: 2.34,  role: "老兵",    pitch: -4,                  text: "刺刀上起！跟到我杀！" },
  { key: "rally_charge",    kind: "rally",  file: "vo_rally_charge.mp3",   dur: 2.50,  role: "班长",    pitch: -2,                  text: "冲！给老子冲！" },
  { key: "rally_dadao",     kind: "rally",  file: "vo_rally_dadao.mp3",    dur: 2.36,  role: "老兵",    pitch: -4,                  text: "杀！大刀砍拢去！" },
  { key: "rally_follow",    kind: "rally",  file: "vo_rally_follow.mp3",   dur: 2.14,  role: "班长",    pitch: -2,                  text: "弟兄伙，跟到我上！" },
  { key: "rally_grenade",   kind: "rally",  file: "vo_rally_grenade.mp3",  dur: 2.51,  role: "老兵",    pitch: -4,  event: true,  text: "莫慌！等他走拢再甩！" },
  { key: "rally_hold",      kind: "rally",  file: "vo_rally_hold.mp3",     dur: 2.51,  role: "班长",    pitch: -2,                  text: "顶到起！给老子顶到起！" },
  { key: "rally_hold2",     kind: "rally",  file: "vo_rally_hold2.mp3",    dur: 2.50,  role: "班长",    pitch: -2,                  text: "人不倒，阵地就不得丢！" },
  { key: "rally_noretreat", kind: "rally",  file: "vo_rally_noretreat.mp3", dur: 2.36,  role: "班长",    pitch: -2,                  text: "莫退！一步都莫退！" },
  { key: "rally_oath",      kind: "rally",  file: "vo_rally_oath.mp3",     dur: 2.49,  role: "班长",    pitch: -2,                  text: "鬼子不打完，莫回四川！" },
  { key: "rally_shoot",     kind: "rally",  file: "vo_rally_shoot.mp3",    dur: 2.50,  role: "班长",    pitch: -2,                  text: "打！打！莫歇气！" },
  { key: "spot_east",       kind: "spot",   file: "vo_spot_east.mp3",      dur: 2.29,  role: "普通兵",   pitch: 0,                   text: "东边！东边有鬼子！" },
  { key: "spot_enemy",      kind: "spot",   file: "vo_spot_enemy.mp3",     dur: 2.37,  role: "普通兵",   pitch: 0,                   speed: 1.1, text: "鬼子！鬼子摸拢来了！" },
  { key: "spot_gap",        kind: "spot",   file: "vo_spot_gap.mp3",       dur: 2.35,  role: "普通兵",   pitch: 0,                   speed: 1.1, text: "缺口！鬼子钻进来了！" },
  { key: "spot_plane",      kind: "spot",   file: "vo_spot_plane.mp3",     dur: 2.30,  role: "普通兵",   pitch: 0,   event: true,  text: "飞机！快躲起！" },
  { key: "spot_tank",       kind: "spot",   file: "vo_spot_tank.mp3",      dur: 2.36,  role: "新兵",    pitch: 0,   event: true,  speed: 1.15, text: "战车！战车碾拢来了！" },
  { key: "spot_wall",       kind: "spot",   file: "vo_spot_wall.mp3",      dur: 2.33,  role: "普通兵",   pitch: 0,                   speed: 1.1, text: "墙上！鬼子爬上墙了！" },
  { key: "warn_down",       kind: "warn",   file: "vo_warn_down.mp3",      dur: 1.98,  role: "老兵",    pitch: -4,                  text: "趴倒！趴倒！" },
  { key: "warn_grenade",    kind: "warn",   file: "vo_warn_grenade.mp3",   dur: 1.91,  role: "普通兵",   pitch: 0,                   text: "手榴弹！闪！" },
  { key: "warn_shell",      kind: "warn",   file: "vo_warn_shell.mp3",     dur: 2.37,  role: "老兵",    pitch: -4,                  speed: 1.1, text: "炮来了！趴倒！莫动！" },
  { key: "ammo_ask",        kind: "ammo",   file: "vo_ammo_ask.mp3",       dur: 2.17,  role: "普通兵",   pitch: 0,                   text: "桥夹！哪个匀我一个！" },
  { key: "ammo_grenade",    kind: "ammo",   file: "vo_ammo_grenade.mp3",   dur: 2.36,  role: "普通兵",   pitch: 0,   event: true,  text: "手榴弹！莫得了！" },
  { key: "ammo_out",        kind: "ammo",   file: "vo_ammo_out.mp3",       dur: 2.36,  role: "普通兵",   pitch: 0,                   text: "子弹！我莫得子弹了！" },
  { key: "ammo_reload",     kind: "ammo",   file: "vo_ammo_reload.mp3",    dur: 2.51,  role: "普通兵",   pitch: 0,                   text: "我压子弹！掩护我一哈！" },
  { key: "hurt_down",       kind: "hurt",   file: "vo_hurt_down.mp3",      dur: 1.92,  role: "普通兵",   pitch: 0,                   text: "班长哦！班长！" },
  { key: "hurt_hit",        kind: "hurt",   file: "vo_hurt_hit.mp3",       dur: 2.37,  role: "普通兵",   pitch: 0,                   speed: 1.1, text: "遭了！我遭枪子了！" },
  { key: "hurt_medic",      kind: "hurt",   file: "vo_hurt_medic.mp3",     dur: 2.50,  role: "普通兵",   pitch: 0,                   text: "担架兵！这头有人挂彩！" },
  { key: "hurt_scream",     kind: "hurt",   file: "vo_hurt_scream.mp3",    dur: 2.50,  role: "新兵",    pitch: 2,                   text: "啊——！" },
  { key: "move_cover",      kind: "move",   file: "vo_move_cover.mp3",     dur: 2.37,  role: "班长",    pitch: -2,                  text: "找掩护！躲到起！" },
  { key: "move_flank",      kind: "move",   file: "vo_move_flank.mp3",     dur: 1.73,  role: "班长",    pitch: -2,                  text: "左手边！绕过去！" },
  { key: "move_go",         kind: "move",   file: "vo_move_go.mp3",        dur: 1.84,  role: "班长",    pitch: -2,                  text: "走！莫站到起！" },
  { key: "move_nogun",      kind: "move",   file: "vo_move_nogun.mp3",     dur: 2.22,  role: "班长",    pitch: -2,  event: true,  text: "莫得枪的，跟到走！" },
];

/** 按类别取所有键（不含 event 句），给测试与调试用。 */
export function VoiceKeysOf(kind) {
  return VOICE_LINES.filter((v) => v.kind === kind && !v.event).map((v) => v.key);
}
