/** Film beats — dig system is the spine of every underground act. */

export const SAVE_KEY = "tunnelheart1942_v5";
export const CACHE_BUST = "20260802b";

export const GAME_META = {
  title: "地道战 · 高家庄",
  subtitle: "白盒 · 先设计后开挖（Valiant Hearts 形式）",
  tagline: "地窖只是起点。地道，是先画蓝图、再一锨一锨挖出来的。",
  yearLabel: "一九四二年 · 冀中高家庄",
};

/**
 * @typedef {{ id: string, speaker: string, text: string, mood?: string }} Panel
 * @typedef {{
 *   id: string, act: number, title: string, timeLabel: string, cast: string,
 *   objective: string, goals: string[], openPanels: Panel[], closePanels: Panel[],
 *   night?: boolean, startTunnel?: boolean,
 * }} Chapter
 */

/** Cold open — five beats before Act 1. */
export const PROLOGUE_PANELS = [
  {
    id: "pro0",
    speaker: "旁白",
    text: "一九四二年，冀中平原。鬼子扫荡一来，高家庄四十来户，连个藏人都藏不住。",
    mood: "wide",
  },
  {
    id: "pro1",
    speaker: "旁白",
    text: "各家先在炕下、灶边挖了地窖——能躲一阵，却互不相通，一抄就全完。",
    mood: "wide",
  },
  {
    id: "pro2",
    speaker: "高老忠",
    text: "地道不是天生的。得连起来，才能藏得住全村人。",
    mood: "talk",
  },
  {
    id: "pro3",
    speaker: "高传宝",
    text: "叔，我去挖。铁锹在手里，蓝图画清楚，一格一格往前掏。",
    mood: "talk",
  },
  {
    id: "pro4",
    speaker: "旁白",
    text: "高家庄的地道战，从这一锨开始——先能藏，再能打，最后能防。",
    mood: "wide",
  },
];

/** @type {Chapter[]} */
export const CHAPTERS = [
  {
    id: "act1_connect",
    act: 1,
    title: "土洞相连",
    timeLabel: "一九四二年 · 春",
    cast: "高传宝",
    objective: "先听高老忠与林霞交代，再下地窖，把三家土洞挖通。",
    goals: ["talk_laozhong", "talk_linxia", "enter_hatch", "link_ab", "link_bc"],
    openPanels: [
      {
        id: "p1a",
        speaker: "旁白",
        text: "冀中平原藏不住人。高家庄三家各挖了个土洞——可洞与洞之间，仍是实土。",
        mood: "wide",
      },
      {
        id: "p1b",
        speaker: "高老忠",
        text: "传宝，先听清楚：三家不通，人就喘不上气。铁锹在井边，空手下洞挖不动。",
        mood: "talk",
      },
      {
        id: "p1c",
        speaker: "林霞",
        text: "男的下洞，女的望风。软土能挖，硬砖绕开——蓝图画短了，人也活不成。",
        mood: "talk",
      },
      {
        id: "p1d",
        speaker: "高传宝",
        text: "我懂。先设计，再开挖。把三家通气，才算真正有地道。",
        mood: "talk",
      },
      {
        id: "p1e",
        speaker: "提示",
        text: "E 捡铁锹（一次只拿一件）。下洞后按 R 进入设计蓝图，方向键移光标，J 标记要挖的格；退出设计后走到标记旁再点 J 开挖——不是泰拉瑞亚式长按乱刨。",
        mood: "tip",
      },
    ],
    closePanels: [
      {
        id: "p1z1",
        speaker: "林霞",
        text: "三家通气了。可只能藏、不能打——夜里来抄，钟谁敲？",
        mood: "talk",
      },
      {
        id: "p1z2",
        speaker: "高老忠",
        text: "钟在我。你们把人藏好——地道通了，才有活路。",
        mood: "talk",
      },
      {
        id: "p1z3",
        speaker: "旁白",
        text: "巷道连上了。下一回夜里灯火一闪，考验才真正开始。",
        mood: "wide",
      },
    ],
  },
  {
    id: "act2_bell",
    act: 2,
    title: "钟声",
    timeLabel: "一九四二年 · 夜袭",
    cast: "高传宝",
    night: true,
    objective: "听夜袭交代，挖出东侧避难窖并连通，送乡亲入洞，再上地面敲钟。",
    goals: [
      "talk_night",
      "dig_safe_room",
      "link_safe",
      "shelter_a",
      "shelter_b",
      "shelter_c",
      "reach_bell",
    ],
    openPanels: [
      {
        id: "p2a",
        speaker: "旁白",
        text: "黑风口灯火一闪。西口地窖还在，东侧避难窖——还没挖出来。",
        mood: "wide",
      },
      {
        id: "p2b",
        speaker: "高老忠",
        text: "夜袭来了！东窖不成，西口藏不下全村。你画蓝图、开东窖——钟，我去敲。",
        mood: "talk",
      },
      {
        id: "p2c",
        speaker: "高传宝",
        text: "叔，您小心。我先把东窖通气，再送人进洞。",
        mood: "talk",
      },
      {
        id: "p2d",
        speaker: "旁白",
        text: "钟一响，全村才知道往哪儿跑。可敲钟的人，往往走不回来。",
        mood: "wide",
      },
      {
        id: "p2e",
        speaker: "提示",
        text: "须手持铁锹。R 设计蓝图标出东窖与通道，点 J 标记；走到计划格旁再点 J 开挖（非长按）。连通后才能护送乡亲入洞，最后上地面敲钟。",
        mood: "tip",
      },
    ],
    closePanels: [
      {
        id: "p2z1",
        speaker: "旁白",
        text: "钟声裂开夜色。高老忠拉响了最后一颗手榴弹——用命换全村进洞的时间。",
        mood: "wide",
      },
      {
        id: "p2z2",
        speaker: "高传宝",
        text: "只藏不够。要把地道改成能打的——叔的钟声，不能白响。",
        mood: "talk",
      },
      {
        id: "p2z3",
        speaker: "林霞",
        text: "人还在。下一回，轮到咱们从地道里打出去。",
        mood: "talk",
      },
    ],
  },
  {
    id: "act3_combat_tunnel",
    act: 3,
    title: "能藏能打",
    timeLabel: "一九四三年 · 初夏",
    cast: "高传宝",
    startTunnel: true,
    objective: "听计议后挖出翻口厢室、打通卡口巷道，识破特务并翻口制服。",
    goals: ["talk_plan", "dig_alcove", "build_flip", "link_trap", "expose_spy", "trap_spy"],
    openPanels: [
      {
        id: "p3a",
        speaker: "旁白",
        text: "地道搅过一轮。要能藏，更要能打——翻口、卡口，得现挖现改。",
        mood: "wide",
      },
      {
        id: "p3b",
        speaker: "林霞",
        text: "先设计翻口厢室蓝图，再改建机关。空手套白狼不行——空间是挖出来的。",
        mood: "talk",
      },
      {
        id: "p3c",
        speaker: "高传宝",
        text: "我画蓝图挖厢室、通卡口。上面那两个“武工队”，回头盘问。",
        mood: "talk",
      },
      {
        id: "p3d",
        speaker: "民兵",
        text: "口令对不上的，别让进主巷。翻口一落，就把他关死。",
        mood: "talk",
      },
      {
        id: "p3e",
        speaker: "提示",
        text: "一次只携带一件。R 开设计标出厢室与卡口巷，J 标记/点 J 开挖计划格。挖出虚线框后再按 E 改建翻口——不是长按乱刨。",
        mood: "tip",
      },
    ],
    closePanels: [
      {
        id: "p3z1",
        speaker: "民兵",
        text: "翻口一落——高，实在是高。特务栽进咱们挖的坑里了。",
        mood: "talk",
      },
      {
        id: "p3z2",
        speaker: "林霞",
        text: "山田不会善罢甘休。下一步：出击口要从主巷往上挖。",
        mood: "talk",
      },
      {
        id: "p3z3",
        speaker: "旁白",
        text: "地道从藏人的洞，变成能打的网。神出鬼没，才刚开始。",
        mood: "wide",
      },
    ],
  },
  {
    id: "act4_ambush",
    act: 4,
    title: "神出鬼没",
    timeLabel: "一九四三年 · 夏",
    cast: "高传宝",
    objective: "挖穿三处出击竖井，悄悄出井杀光进村的鬼子——打一枪换一个地方。",
    goals: [
      "talk_ambush",
      "enter_spine",
      "dig_shaft_a",
      "dig_shaft_b",
      "dig_shaft_c",
      "kill_invaders",
    ],
    openPanels: [
      {
        id: "p4a",
        speaker: "旁白",
        text: "山田把鬼子放进庄里。民兵不在街面上硬拼——要从主巷往上挖穿出击口，悄悄进村打枪。",
        mood: "wide",
      },
      {
        id: "p4b",
        speaker: "高传宝",
        text: "井口、墙根、灶台——三口竖井都挖穿。出井就开枪，打完立刻钻回去换地方。",
        mood: "talk",
      },
      {
        id: "p4c",
        speaker: "林霞",
        text: "地面别站着挨打。蹲着挪、看准黄皮再扣扳机。地道是腿，出击口是牙。",
        mood: "talk",
      },
      {
        id: "p4d",
        speaker: "民兵",
        text: "杀光这拨进村的鬼子。一口打完就换口——神出鬼没，才叫地道战。",
        mood: "talk",
      },
      {
        id: "p4e",
        speaker: "提示",
        text: "须铁锹挖穿三口竖井。井下按 E 悄悄出井，地面按 E 开枪并撤回；可投手榴弹。目标：消灭全部鬼子。",
        mood: "tip",
      },
    ],
    closePanels: [
      {
        id: "p4z1",
        speaker: "林霞",
        text: "进村的鬼子清干净了。下一步：把地道往炮楼根下挖。",
        mood: "talk",
      },
      {
        id: "p4z2",
        speaker: "高传宝",
        text: "黑风口那座炮楼——不炸，村里就喘不上气。",
        mood: "talk",
      },
      {
        id: "p4z3",
        speaker: "旁白",
        text: "悄悄进村、打枪、钻回去。神出鬼没这一仗，换来反攻前夜的最后一锨。",
        mood: "wide",
      },
    ],
  },
  {
    id: "act5_heifengkou",
    act: 5,
    title: "黑风口",
    timeLabel: "反攻前夜",
    cast: "高传宝",
    startTunnel: true,
    objective: "听进攻令，绕开硬地基挖到炮楼根药室，安放炸药后回地面发信号。",
    goals: ["talk_assault", "dig_charge_room", "link_charge", "plant_charge", "signal_assault"],
    openPanels: [
      {
        id: "p5a",
        speaker: "旁白",
        text: "黑风口炮楼压着村口。夯土硬得像铁——软土里绕，才能挖到药室。",
        mood: "wide",
      },
      {
        id: "p5b",
        speaker: "赵平原",
        text: "先设计通往药室的蓝图。灰色硬块挖不动——看剖视层找软土绕路。",
        mood: "talk",
      },
      {
        id: "p5c",
        speaker: "赵平原",
        text: "挖通后放下铁锹、拿炸药包到药室按 F 安放，再上地面发信号。一次只拿一件。",
        mood: "talk",
      },
      {
        id: "p5d",
        speaker: "高传宝",
        text: "叔的钟声还在。这一回，轮到炮楼听咱们的。",
        mood: "talk",
      },
      {
        id: "p5e",
        speaker: "提示",
        text: "R 设计药室与绕行巷道蓝图，J 标记；走到计划格旁点 J 开挖（非泰拉瑞亚长按）。须铁锹开挖；安放炸药时只能携带炸药包一件。",
        mood: "tip",
      },
    ],
    closePanels: [
      {
        id: "p5z1",
        speaker: "旁白",
        text: "黑风口塌了。胜利的钟声，从村口传到野外。",
        mood: "wide",
      },
      {
        id: "p5z2",
        speaker: "高传宝",
        text: "地道是挖出来的。人，也是挖出来的活路。",
        mood: "talk",
      },
      {
        id: "p5z3",
        speaker: "旁白",
        text: "能藏、能打、能防——高家庄这一锨锨土，写成了冀中的地道战。",
        mood: "wide",
      },
    ],
  },
];

export function FindChapter(chapterId) {
  return CHAPTERS.find((c) => c.id === chapterId) || CHAPTERS[0];
}
