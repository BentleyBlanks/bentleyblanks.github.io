// Independent situational orders. Each row is one complete, retained performance.
// The mission director may repeat an order after a cooldown; story exchanges stay intact.
// 2026-09-19 重构：按新 18 阶段重排（契约 §5）。沿用行的文字一个字都没动，
// promptHash 因此不变，既有录音不重烘；新增 10 条由配音包按罗班长口吻写，≤12 字。
const lines = [
  ["Follow", "顺子，跟到我！贴到掩体走，莫往空地头蹿！"],
  ["Wait", "顺子！这边！你龟儿磨蹭啥子，跟上！"],
  ["Hold", "等到！莫往前冲！"],
  // 02 后交通壕
  ["RearTrench", "顺子，跟到沟走！"],
  ["Support", "顺子！跟到我往前！压住鬼子的火，接前头弟兄下来！"],
  ["Gun", "顺子，把前头那伙打退！机枪在这儿，步枪也行！外头还有自己人，莫松！"],
  ["GunSupply", "弹匣打光了就下来拿！箱子在枪后头，老子掩护你！"],
  ["Bundle", "顺子，跟到我沿北边侧沟走！低顶下头趴起爬！去补给屋拿集束弹，把那龟儿车弄停！"],
  ["Throw", "拿到了就沿原沟退回去！回前头投弹点，照履带甩！甩完缩回来，炮还在！"],
  // 06 回背坡伤员集结处接令
  ["Collection", "回集结处那头接令！"],
  ["Orders", "顺子，撤回沟里！到老子这儿接令，准备送伤兵！"],
  ["South", "顺子、幺娃，前头看路！文财盯后头，莫掉人！跟到后送队往南走！"],
  ["Kitchen", "右手灶屋！顺子，穿过去！把窗口那挺机枪端了，担架还等到的！"],
  ["Melee", "拔刀！把刺刀拨开！莫让狗日的堵住门！"],
  ["Gate", "机枪打哑了就开院门！顺子，手脚麻利点，伤兵等不起！"],
  ["CourtCover", "担架先过！顺子，看住门外！后头还有人，莫忙到走！"],
  ["Transfer", "顺子，棚子东头墙口！把追兵压回去，让伤兵装车！莫追出去！"],
  // 12 侧巷那处威胁
  ["Alley", "侧巷头有人，压回去！"],
  // 12 跟老周的牛马车走一段
  ["Cart", "上车，跟到周哥走！"],
  // 13—14 弃车转西沟
  ["WestDitch", "下西沟！莫停车边！"],
  ["Carry", "顺子，接老周担架后头！跟前头那个人走，往西边下沟！"],
  ["Rescue", "顺子，拿枪断后！让幺娃把老周拖回来！"],
  // 15B 靠院墙的夹道
  ["WallPath", "贴到墙根走，跟紧！"],
  // 15C 桥南临时接收处院门
  ["YardGate", "进院门！担架先过！"],
  ["Place", "顺子，搭一把！抬周哥进屋，放卫生兵跟前！慢点，莫磕到他！"],
  // 18 铁路桥接应尾队
  ["Bridge", "到南岸去，接住尾队！"],
  ["Withdraw", "退下来！桥要炸了！"],
  ["NorthGate", "跟到队伍，进北门！"],
];
export const MISSION_GUIDE_DIALOGUE = Object.freeze(lines.map(([name, text]) => Object.freeze({
  id: `Guide${name}`, file: `AudioVoice_FirstLevelGuide${name}.mp3`, guidance: true,
  lines: [Object.freeze({who: "luo", text})],
  delivery: "只演罗班长一人，三十二岁四川老兵，低沉沙哑的中低男声，厚实、有胸腔共鸣，和既有罗班长一致。战场上隔着几步喊给顺子听，短促、带喘息，四川口音自然，莫、到、龟儿保留方言读法。有火气但始终在照应弟兄，不是相声，不拖腔，不尖叫，不加词。整段一句完整说完，开头结尾不要长空白。",
})));
