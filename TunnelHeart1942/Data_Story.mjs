/** Film beats — denser 《地道战》 feel; dig system stays the spine. */

export const SAVE_KEY = "tunnelheart1942_v8";
export const CACHE_BUST = "20260803ax";

export const GAME_META = {
  title: "地道战 · 高家庄",
  subtitle: "白盒 · 贴壁开挖联通地窖",
  tagline: "地窖只是起点。拿铁锹贴着土壁挖，挖通就联通了。",
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
    text: "听人交代，捡井边铁锹，下洞，顺着蓝色格子挖通三家地窖。",
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
    objective: "听交代 → 井边捡铁锹 → 下洞 → 顺着蓝线挖通三家。",
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
    objective: "听夜袭交代，挖通东窖；点乡亲让他们跟上，带到井口进洞——再到钟下，见证高老忠敲钟。",
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
        text: "挖通东窖后出井：点乡亲让他们跟上，带到西口井边进洞，再到钟下。",
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
        text: "先画蓝图挖出翻口厢室，打通卡口，识破特务并翻口制服。",
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
        text: "挖穿三口竖井，悄悄出井打完再钻回去——打一枪换一个地方。",
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
    objective: "弹药极少。开镜/手雷，或靠近敲晕——伪军好敲，鬼子摸背后，正面会反抓。别让人看见尸体。",
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
        text: "子弹很少。伪军靠近就能敲晕；鬼子有防备，正面硬抢会被反抓。尸体被看见会喊人。",
        mood: "talk",
      },
      {
        id: "p5c",
        speaker: "目标",
        text: "开镜开枪 · 扔手雷 · 靠近敲晕（鬼子摸背后）。清光街道。子弹很紧，别浪。",
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
        text: "挖到药室安放炸药，再上地面发信号。一次只拿一件。",
        mood: "tip",
      },
    ],
    closePanels: [
      {
        id: "p6z1",
        speaker: "旁白",
        text: "黑风口塌了。可村东营盘还有一挺机枪压着路口——不拔掉，乡亲们仍出不去。",
        mood: "wide",
      },
    ],
  },
  {
    id: "act7_mg_nest",
    act: 7,
    title: "机枪巢",
    timeLabel: "反攻清晨",
    cast: "高传宝",
    startTunnel: true,
    night: false,
    objective: "绕硬土与低洞挖到敌营下，翻上去制住机枪手，抢过机枪扫光来犯日伪军。",
    goals: [
      "talk_mg",
      "link_camp",
      "surface_camp",
      "silence_gunner",
      "man_mg",
      "hold_waves",
    ],
    openPanels: [
      {
        id: "p7a",
        speaker: "背景",
        text: "村东敌营路口架着机枪。炮楼塌了，这挺枪还在咬人。",
        mood: "wide",
      },
      {
        id: "p7b",
        speaker: "困难",
        text: "直挖会撞硬夯土；中段还有低洞要爬。营盘上机枪手盯着正面——得从地道翻到他背后。",
        mood: "talk",
      },
      {
        id: "p7c",
        speaker: "目标",
        text: "挖通到营下 → 出井制住机枪手 → 抢机枪 → 打光扑上来的日伪军。",
        mood: "tip",
      },
    ],
    closePanels: [
      {
        id: "p7z1",
        speaker: "旁白",
        text: "机枪哑了。可村西晒谷场还有日伪军趴在沙袋后——步枪打不穿，得用手雷。",
        mood: "wide",
      },
    ],
  },
  {
    id: "act8_grenade_yard",
    act: 8,
    title: "沙袋场",
    timeLabel: "反攻午前",
    cast: "高传宝",
    night: true,
    objective: "捡手雷，抬头高抛过沙袋，蹲下近抛。炸开掩体，清光晒谷场日伪军。",
    goals: ["talk_nade", "stock_nades", "clear_grenade_yard"],
    openPanels: [
      {
        id: "p8a",
        speaker: "背景",
        text: "村西晒谷场。日伪军用沙袋堵着路口，步枪压不住。",
        mood: "wide",
      },
      {
        id: "p8b",
        speaker: "困难",
        text: "沙袋后的人吃枪子不疼。土制手雷才管用——要会抛弧，别砸自己脚边。",
        mood: "talk",
      },
      {
        id: "p8c",
        speaker: "目标",
        text: "听交代 → 雷箱装雷 → 高抛/近抛清场。口袋可叠手雷。",
        mood: "tip",
      },
    ],
    closePanels: [
      {
        id: "p8z1",
        speaker: "旁白",
        text: "沙袋后也清了。手雷、地道、枪——高家庄又多了一招。",
        mood: "wide",
      },
    ],
  },
];

export function FindChapter(chapterId) {
  return CHAPTERS.find((c) => c.id === chapterId) || CHAPTERS[0];
}
