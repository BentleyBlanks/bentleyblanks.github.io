// Lip-shape tables for the offline face-track baker (Script_FirstLevelFaceTrackBake.py).
// Pure data, read by the baker through node and by Script_CharacterSpeechTest.
//
// Timing comes from per-character / per-kana alignment of the spoken text; the mouth
// shape of each syllable comes from these hand-written tables, not from acoustics.
// No pinyin library is installed (and none may be added), so HAN_PINYIN is typed by
// hand: toneless Mandarin syllable -> the characters read that way in the 01-06 lines
// (plus the guide lines). Where the Sichuan reading changes the mouth (噻 sai,
// 喃 nan, 哈 ha as in 等哈) the Sichuan reading is used. Polyphones take the
// reading they have in these lines (长 zhang in 班长/长官, 地 di in 地方, 还 hai,
// 得 de, 着 zhe, 都 dou, 重 zhong, 行 xing, 干 gan, 担 dan, 当 dang, 处 chu).
// Script_CharacterSpeechTest fails when a spoken Han character is missing here.
export const HAN_PINYIN = Object.freeze({
  ai: "挨", an: "岸",
  ba: "把拔", ban: "班绊", bei: "备北", ben: "本", bi: "闭", bian: "边遍", bie: "别", bing: "兵",
  bo: "拨", bu: "不部补步",
  cai: "才财", ce: "侧", ceng: "蹭", cha: "差岔", che: "撤车", cheng: "城", chong: "冲",
  chou: "臭抽", chu: "出处", chuan: "穿川", chuang: "窗", ci: "刺", cong: "从", cuan: "蹿",
  cui: "催", cun: "村",
  da: "大搭打答", dai: "带", dan: "弹担", dang: "裆当", dao: "到道刀", de: "得的", deng: "等",
  di: "低底弟地", dian: "点", diao: "叼掉", ding: "顶盯定", diu: "丢", dong: "东动懂",
  dou: "抖都", du: "堵", duan: "段端断", dui: "队", duo: "多",
  en: "嗯", er: "儿二",
  fa: "法", fang: "放方", fei: "废飞", fen: "分坟", feng: "封", fu: "扶副",
  gai: "该盖", gan: "干", gang: "刚", gao: "搞高", ge: "哥个", gei: "给", gen: "跟根", gong: "拱",
  gou: "沟狗", guai: "拐", guan: "官管惯", guang: "光", gui: "鬼龟", gun: "滚", guo: "过",
  ha: "哈", hai: "还", hao: "好耗", he: "何", hen: "很", hou: "后", hu: "护", hua: "话",
  huan: "换", hui: "回", hun: "混", huo: "活伙火",
  ji: "几机集挤己继", jia: "夹架", jian: "见", jiao: "交脚", jie: "接借街结", jin: "紧进劲今",
  jiu: "就旧",
  ka: "卡", kai: "开", kan: "坎看槛", kao: "靠", ke: "磕", ken: "肯", keng: "坑", kong: "空",
  kou: "口", ku: "裤", kuai: "快",
  lai: "来", lao: "老", le: "了", li: "里利", lian: "连脸", liang: "两", ling: "令", liu: "留",
  lu: "路", luan: "乱", lv: "履",
  ma: "妈麻骂", mai: "卖埋", man: "慢", mang: "忙", mao: "冒", me: "么", mei: "没", men: "们门",
  mian: "面", ming: "命", mo: "莫磨摸",
  na: "拿哪那", nan: "喃南", ne: "呢", neng: "能", ni: "你", nong: "弄",
  o: "哦",
  pa: "趴爬", pang: "旁", pao: "炮跑", peng: "棚碰", pi: "批", pie: "撇", po: "破",
  qi: "起气", qian: "前牵", qiang: "枪墙抢", qiao: "桥", qing: "清", qu: "去", quan: "全",
  rang: "让", rao: "绕", ren: "人", ri: "日",
  sai: "噻", san: "散", sao: "扫", sha: "啥", shan: "山", shang: "上伤", shao: "少", she: "舍",
  shen: "什", sheng: "剩声牲生省", shi: "是使事", shou: "守手收", shu: "束", shuai: "甩",
  shui: "睡", shun: "顺", shuo: "说", si: "死四", song: "送松", suo: "嗦缩",
  ta: "他它", tai: "抬", tang: "躺", teng: "滕", ti: "体", tian: "田天", tiao: "挑", tie: "贴",
  ting: "听停挺", tong: "通", tou: "头投", tu: "土", tuan: "团", tui: "退腿", tuo: "拖",
  wa: "娃挖", wai: "外", wan: "完", wang: "往", wei: "为位卫尾", wen: "问文", wo: "我握", wu: "屋伍",
  xi: "西", xia: "下匣", xian: "先县", xiang: "箱巷想", xiao: "晓小", xie: "些谢", xing: "醒行",
  xiong: "兄", xu: "续",
  ya: "压哑", yan: "沿烟掩", yao: "咬要幺药", ye: "也", yi: "一以", ying: "硬应", yong: "用",
  you: "有又右", yuan: "员原院", yun: "运",
  za: "咋", zai: "在再", zao: "遭早灶", zen: "怎", zha: "炸", zhan: "战站", zhang: "长",
  zhao: "照", zhe: "着这", zhen: "真阵", zhi: "指", zhong: "重", zhou: "周", zhu: "住",
  zhuan: "转", zhuang: "装", zhui: "追", zhun: "准", zi: "子自", zou: "走", zui: "嘴最", zuo: "左",
});

// Mandarin initials that shape the lips before the vowel. Longest match first.
export const PINYIN_INITIALS = Object.freeze(["zh", "ch", "sh", "b", "p", "m", "f", "d", "t", "n", "l",
  "g", "k", "h", "j", "q", "x", "r", "z", "c", "s"]);
export const INITIAL_ONSET = Object.freeze({ b: "MB", p: "MB", m: "MB", f: "FV", zh: "SH", ch: "SH", sh: "SH", r: "SH" });

// Final (after spelling rules: y/w rewritten, iu->iou, ui->uei, un->uen, u->ü after
// j/q/x/y) -> viseme sequence. Glide + nucleus + tail; the baker weights glides and
// tails lower than the nucleus.
export const FINAL_VISEMES = Object.freeze({
  a: ["A"], o: ["O"], e: ["E"], i: ["I"], u: ["U"], "ü": ["V"], er: ["ER"],
  ai: ["A", "I"], ei: ["EH", "I"], ao: ["A", "U"], ou: ["O", "U"],
  an: ["A", "N"], en: ["E", "N"], ang: ["A", "NG"], eng: ["E", "NG"], ong: ["O", "NG"],
  ia: ["I", "A"], ie: ["I", "EH"], iao: ["I", "A", "U"], iou: ["I", "O", "U"], ian: ["I", "EH", "N"],
  in: ["I", "N"], iang: ["I", "A", "NG"], ing: ["I", "NG"], iong: ["V", "O", "NG"],
  ua: ["U", "A"], uo: ["U", "O"], uai: ["U", "A", "I"], uei: ["U", "EH", "I"], uan: ["U", "A", "N"],
  uen: ["U", "E", "N"], uang: ["U", "A", "NG"], ueng: ["U", "E", "NG"],
  "üe": ["V", "EH"], "üan": ["V", "EH", "N"], "ün": ["V", "N"],
  // zi ci si zhi chi shi ri: the tongue vowel, teeth nearly shut, lips a little spread.
  apical: ["Z"],
});

// Japanese lines are aligned against their kana (Data_FirstLevelJapaneseSpeech);
// katakana is folded to hiragana before lookup.
export const KANA_VOWELS = Object.freeze({
  a: "あかがさざただなはばぱまやらわ",
  i: "いきぎしじちぢにひびぴみり",
  u: "うくぐすずつづぬふぶぷむゆる",
  e: "えけげせぜてでねへべぺめれ",
  o: "おこごそぞとどのほぼぽもよろを",
});
export const KANA_ONSET = Object.freeze({ MB: "ばびぶべぼぱぴぷぺぽまみむめも", FV: "ふ", SH: "しじちぢ" });
// Small kana replace the vowel of the kana before them (きゃ = kya).
export const KANA_SMALL = Object.freeze({ "ゃ": "a", "ゅ": "u", "ょ": "o", "ぁ": "a", "ぃ": "i", "ぅ": "u", "ぇ": "e", "ぉ": "o" });
export const KANA_VOWEL_VISEME = Object.freeze({ a: "A", i: "I", u: "UJ", e: "EH", o: "O" });
// ん is its own mora (N, or lips shut before a bilabial); っ holds a short closure;
// ー lengthens the vowel before it.
export const KANA_SPECIAL = Object.freeze({ "ん": "N", "っ": "Q", "ー": "LONG" });

// Viseme -> target channels [jaw, wide, round, close] for Script_CharacterFacialAnimation
// (poses Open, Wide, Round, Close; each 0-1 relative to Rest). Set against the
// 2026-09-23 NRA02/IJA02/NRA05 pose previews: jaw 1 is a shouted "a", wide .85 an "i"
// with teeth showing, round 1 a pursed "u", close 1 lips pressed for b/p/m.
export const VISEMES = Object.freeze({
  A: [1.0, .2, 0, 0],
  O: [.62, 0, .8, 0],
  E: [.55, .25, 0, 0],
  EH: [.5, .5, 0, 0],
  I: [.24, .85, 0, 0],
  U: [.2, 0, 1, 0],
  V: [.2, .15, .85, 0],
  ER: [.45, .1, .3, 0],
  Z: [.18, .5, 0, 0],
  N: [.22, .15, 0, 0],
  NG: [.32, .05, 0, 0],
  MB: [0, 0, 0, 1],
  FV: [.1, .15, 0, .6],
  SH: [.2, 0, .35, 0],
  UJ: [.26, .15, .45, 0],
  Q: [.05, 0, 0, .35],
  REST: [0, 0, 0, 0],
});

/** Every Han character with a reading, as a Map char -> syllable (first reading wins). */
export function HanReadings() {
  const map = new Map();
  for (const [syllable, chars] of Object.entries(HAN_PINYIN)) for (const ch of chars) if (!map.has(ch)) map.set(ch, syllable);
  return map;
}
