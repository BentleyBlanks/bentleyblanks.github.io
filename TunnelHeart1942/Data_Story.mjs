/** Film beats — denser 《地道战》 feel; dig system stays the spine. */

export const SAVE_KEY = "tunnelheart1942_v6";
export const CACHE_BUST = "20260803f";

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

/** Cold open — only 背景 / 困难 / 目标. Then play. */
export const PROLOGUE_PANELS = [
  {
    id: "pro0",
    speaker: "背景",
    text: "一九四二年，冀中高家庄。鬼子常来扫荡，村里靠地窖躲人。",
    mood: "wide",
  },
  {
    id: "pro1",
    speaker: "困难",
    text: "三家地窖互不通。鬼子一进庄，人就各顾各——藏不住。",
    mood: "talk",
  },
  {
    id: "pro2",
    speaker: "目标",
    text: "捡井边铁锹，下洞，沿蓝线点 J 挖通三家。E 捡/说话/下洞。",
    mood: "tip",
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
    objective: "听交代 → 井边捡铁锹 → 下洞 → 沿蓝线点 J 挖通三家。",
    goals: ["talk_laozhong", "talk_linxia", "enter_hatch", "link_ab", "link_bc"],
    // Prologue already said 背景/困难/目标 — skip a second slideshow.
    openPanels: [],
    closePanels: [
      {
        id: "p1z1",
        speaker: "旁白",
        text: "三家通气了。夜里来抄，还得有人敲钟。",
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
    objective: "听夜袭交代，挖出东侧避难窖并连通，送乡亲入洞——再到钟下，见证高老忠敲响报警钟。",
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
        speaker: "背景",
        text: "夜袭来了。山田要搜庄，西口地窖塞不下全村人。",
        mood: "wide",
      },
      {
        id: "p2b",
        speaker: "山田",
        text: "搜庄！地窖里也给我翻——一个也别漏。",
        mood: "talk",
      },
      {
        id: "p2c",
        speaker: "目标",
        text: "挖通东窖，送乡亲入洞，再到钟下。铁锹在手，蓝线旁点 J。",
        mood: "tip",
      },
    ],
    closePanels: [
      {
        id: "p2z1",
        speaker: "旁白",
        text: "钟响了。高老忠用命换全村进洞——下一回，地道得能打。",
        mood: "wide",
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
        speaker: "背景",
        text: "只藏不够。地道要能打——翻口、卡口，现挖现改。",
        mood: "wide",
      },
      {
        id: "p3b",
        speaker: "困难",
        text: "有人自称武工队，却从炮楼方向来。口令不对，不能进主巷。",
        mood: "talk",
      },
      {
        id: "p3c",
        speaker: "目标",
        text: "挖出翻口厢室，打通卡口，识破特务并翻口制服。R 画线，J 挖。",
        mood: "tip",
      },
    ],
    closePanels: [
      {
        id: "p3z1",
        speaker: "旁白",
        text: "翻口落下，特务进了坑。下一回：神出鬼没。",
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
        speaker: "背景",
        text: "山田把鬼子放进庄。街上硬拼不行——要从地道出击。",
        mood: "wide",
      },
      {
        id: "p4b",
        speaker: "困难",
        text: "地面站不住。打一枪就得换口，不然被包了。",
        mood: "talk",
      },
      {
        id: "p4c",
        speaker: "目标",
        text: "挖穿三口竖井，出井杀光鬼子再钻回去。E 出井/开枪。",
        mood: "tip",
      },
    ],
    closePanels: [
      {
        id: "p4z1",
        speaker: "旁白",
        text: "出击口管用了。街上还有日伪军——下一回上地面清街。",
        mood: "wide",
      },
    ],
  },
  {
    id: "act5_street_hunt",
    act: 5,
    title: "清街",
    timeLabel: "一九四三年 · 夏夜",
    cast: "高传宝",
    night: true,
    objective: "弹药极少。开镜开枪、扔手雷，或绕到背后 E 击晕——别让敌人看见尸体。",
    goals: ["talk_street", "clear_street"],
    openPanels: [
      {
        id: "p5a",
        speaker: "背景",
        text: "夜里街上还有日伪军。出击口清过一轮，地面还得自己收干净。",
        mood: "wide",
      },
      {
        id: "p5b",
        speaker: "困难",
        text: "子弹很少。枪声会招人；尸体被看见，他们会喊同伴高度警戒。",
        mood: "talk",
      },
      {
        id: "p5c",
        speaker: "目标",
        text: "F 开枪（按住瞄/Shift 开镜）· F 扔手雷 · 背后靠近 E 击晕。清光街道。",
        mood: "tip",
      },
    ],
    closePanels: [
      {
        id: "p5z1",
        speaker: "旁白",
        text: "街清了。下一步：挖到黑风口炮楼根下。",
        mood: "wide",
      },
    ],
  },
  {
    id: "act6_heifengkou",
    act: 6,
    title: "黑风口",
    timeLabel: "反攻前夜",
    cast: "高传宝",
    startTunnel: true,
    objective: "听进攻令，绕开硬地基挖到炮楼根药室，安放炸药后回地面发信号。",
    goals: ["talk_assault", "dig_charge_room", "link_charge", "plant_charge", "signal_assault"],
    openPanels: [
      {
        id: "p6a",
        speaker: "背景",
        text: "黑风口炮楼压着村口。不炸掉，庄里喘不上气。",
        mood: "wide",
      },
      {
        id: "p6b",
        speaker: "困难",
        text: "炮楼根下是硬地基，直挖不动——得绕软土到药室。",
        mood: "talk",
      },
      {
        id: "p6c",
        speaker: "目标",
        text: "挖到药室，F 安放炸药，再上地面发信号。一次只拿一件。",
        mood: "tip",
      },
    ],
    closePanels: [
      {
        id: "p6z1",
        speaker: "旁白",
        text: "黑风口塌了。地道是挖出来的——人也是。",
        mood: "wide",
      },
    ],
  },
];

export function FindChapter(chapterId) {
  return CHAPTERS.find((c) => c.id === chapterId) || CHAPTERS[0];
}
