/** Film beats — dig system is the spine of every underground act. */

export const SAVE_KEY = "tunnelheart1942_v3";
export const CACHE_BUST = "20260731c";

export const GAME_META = {
  title: "地道战 · 高家庄",
  subtitle: "白盒 · 挖地道解谜（Valiant Hearts 形式）",
  tagline: "地窖只是起点。地道，是一锨一锨挖出来的。",
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

/** @type {Chapter[]} */
export const CHAPTERS = [
  {
    id: "act1_connect",
    act: 1,
    title: "土洞相连",
    timeLabel: "一九四二年 · 春",
    cast: "高传宝",
    objective: "下地窖，把三家互不相通的土洞一锨锨挖穿。",
    goals: ["talk_laozhong", "enter_hatch", "link_ab", "link_bc"],
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
        text: "传宝，地道不是天生的。下洞去，对着软土按住铁锨——一格一格挖，把三家通气。",
        mood: "talk",
      },
      {
        id: "p1c",
        speaker: "提示",
        text: "下地窖后：对准软土按住 J 挖掘。S 向下挖，W 向上挖。硬砖挖不动。连通目标看左上清单。",
        mood: "tip",
      },
    ],
    closePanels: [
      {
        id: "p1z",
        speaker: "林霞",
        text: "三家通气了。可只能藏、不能打——夜里来抄，钟谁敲？",
        mood: "talk",
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
    objective: "先挖出东侧避难窖并挖通，再送乡亲入洞，最后敲响警钟。",
    goals: ["dig_safe_room", "link_safe", "shelter_a", "shelter_b", "shelter_c", "reach_bell"],
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
        text: "先把东窖挖开通气！人才能藏。钟——我去敲。",
        mood: "talk",
      },
      {
        id: "p2c",
        speaker: "提示",
        text: "下西口，向东挖穿硬土绕路，把东侧厢室挖成空腔并连通。未连通前乡亲不肯进洞。",
        mood: "tip",
      },
    ],
    closePanels: [
      {
        id: "p2z1",
        speaker: "旁白",
        text: "钟声裂开夜色。高老忠拉响了最后一颗手榴弹。地道被搅了——可人还在。",
        mood: "wide",
      },
      {
        id: "p2z2",
        speaker: "高传宝",
        text: "只藏不够。要把地道改成能打的。",
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
    objective: "挖出翻口厢室、打通卡口巷道，识破特务并翻口制服。",
    goals: ["dig_alcove", "build_flip", "link_trap", "expose_spy", "trap_spy"],
    openPanels: [
      {
        id: "p3a",
        speaker: "林霞",
        text: "要有翻口厢室。先挖出空间，再改翻口——空手套白狼不行。",
        mood: "talk",
      },
      {
        id: "p3b",
        speaker: "高传宝",
        text: "我先把厢室和卡口巷挖通。上面那两个“武工队”，回头盘问。",
        mood: "talk",
      },
      {
        id: "p3c",
        speaker: "提示",
        text: "黄色虚线框是待挖厢室。挖够格数才能改建翻口；再挖通到卡口，才能翻口制敌。",
        mood: "tip",
      },
    ],
    closePanels: [
      {
        id: "p3z",
        speaker: "民兵",
        text: "翻口一落——高，实在是高。山田不会善罢甘休。",
        mood: "talk",
      },
    ],
  },
  {
    id: "act4_ambush",
    act: 4,
    title: "神出鬼没",
    timeLabel: "一九四三年 · 夏",
    cast: "高传宝",
    objective: "从主巷上挖三处出击竖井，再轮流开火打散巡逻。",
    goals: ["enter_spine", "dig_shaft_a", "dig_shaft_b", "dig_shaft_c", "shot_a", "shot_b", "shot_c", "break_patrol"],
    openPanels: [
      {
        id: "p4a",
        speaker: "旁白",
        text: "山田进村。出击口不能是送的——要从主巷一锨锨往上挖穿。",
        mood: "wide",
      },
      {
        id: "p4b",
        speaker: "高传宝",
        text: "按住 W+J 往上挖。井口、墙根、灶台——三口都挖穿，才能打一枪换一处。",
        mood: "talk",
      },
    ],
    closePanels: [
      {
        id: "p4z",
        speaker: "林霞",
        text: "气焰压下去了。下一步：把地道往炮楼根下挖。",
        mood: "talk",
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
    objective: "绕开硬地基挖到炮楼根药室，安放炸药后回地面发信号。",
    goals: ["dig_charge_room", "link_charge", "plant_charge", "signal_assault"],
    openPanels: [
      {
        id: "p5a",
        speaker: "赵平原",
        text: "炮楼脚下尽是硬夯土。软土里绕，挖出药室，再上信号。",
        mood: "talk",
      },
      {
        id: "p5b",
        speaker: "提示",
        text: "灰色硬块挖不动。看剖视层找软土绕路，挖通药室并连通进攻端。",
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
    ],
  },
];

export function FindChapter(chapterId) {
  return CHAPTERS.find((c) => c.id === chapterId) || CHAPTERS[0];
}
