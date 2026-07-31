/** Film-faithful beats for 地道战, told in Valiant Hearts chapter cadence. */

export const SAVE_KEY = "tunnelheart1942_v2";
export const CACHE_BUST = "20260731b";

export const GAME_META = {
  title: "地道战 · 高家庄",
  subtitle: "白盒 · 横版叙事解谜（Valiant Hearts 形式）",
  tagline: "铁锨、钟声、翻口与黑风口——按电影五幕走完高家庄。",
  yearLabel: "一九四二年 · 冀中高家庄",
};

/**
 * @typedef {{ id: string, speaker: string, text: string, mood?: string }} Panel
 * @typedef {{
 *   id: string,
 *   act: number,
 *   title: string,
 *   timeLabel: string,
 *   cast: string,
 *   objective: string,
 *   goals: string[],
 *   openPanels: Panel[],
 *   closePanels: Panel[],
 *   night?: boolean,
 *   startTunnel?: boolean,
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
    objective: "听高老忠交代，下地道挖通两处土塞，让三家地窖通气。",
    goals: ["talk_laozhong", "enter_hatch", "dig_west", "dig_east"],
    openPanels: [
      {
        id: "p1a",
        speaker: "旁白",
        text: "冀中平原，一马平川。鬼子的炮楼看得见庄稼，庄稼却藏不住人。",
        mood: "wide",
      },
      {
        id: "p1b",
        speaker: "高老忠",
        text: "传宝，别先想着打。先把几家土洞挖通——人能藏，才谈得上活。",
        mood: "talk",
      },
      {
        id: "p1c",
        speaker: "提示",
        text: "←→ 移动　空格跳　E 互动　按住 J 挖掘。地道口按 E 下井，土塞要挖开，不是跳过去。",
        mood: "tip",
      },
    ],
    closePanels: [
      {
        id: "p1z",
        speaker: "林霞",
        text: "气通了。可只能藏、不能打——夜里要是来抄，钟谁敲？",
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
    objective: "把三户乡亲送进地道，再冲到村口大槐树下——钟，必须响。",
    goals: ["shelter_a", "shelter_b", "shelter_c", "reach_bell"],
    openPanels: [
      {
        id: "p2a",
        speaker: "旁白",
        text: "黑风口据点的灯火一闪。狗叫先于枪声。",
        mood: "wide",
      },
      {
        id: "p2b",
        speaker: "高老忠",
        text: "快送人进洞！钟——我去敲。你们记住：人比地道金贵。",
        mood: "talk",
      },
      {
        id: "p2c",
        speaker: "高传宝",
        text: "爹——",
        mood: "talk",
      },
      {
        id: "p2d",
        speaker: "高老忠",
        text: "少说话。去！",
        mood: "talk",
      },
    ],
    closePanels: [
      {
        id: "p2z1",
        speaker: "旁白",
        text: "钟声裂开夜色。高老忠拉响了最后一颗手榴弹。",
        mood: "wide",
      },
      {
        id: "p2z2",
        speaker: "高传宝",
        text: "地道被搅烂了……可人还在。只藏不够——要能打。",
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
    objective: "在地道里修好翻口，盘问可疑来客，引他们到翻口下将其制服。",
    goals: ["build_flip", "expose_spy", "trap_spy"],
    openPanels: [
      {
        id: "p3a",
        speaker: "林霞",
        text: "《论持久战》摊在炕桌上。教训写得很清楚：要有翻口、射击孔、迷惑岔道。",
        mood: "talk",
      },
      {
        id: "p3b",
        speaker: "高传宝",
        text: "灌水、放火、搜洞——都得防。先把翻口改起来。",
        mood: "talk",
      },
      {
        id: "p3c",
        speaker: "旁白",
        text: "庄外来了两个“武工队员”。口音飘，路线熟——不对劲。",
        mood: "wide",
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
    objective: "从三处出击口轮流开火，打散山田的报复队，别在同一口子恋战。",
    goals: ["shot_a", "shot_b", "shot_c", "break_patrol"],
    openPanels: [
      {
        id: "p4a",
        speaker: "旁白",
        text: "山田纠集兵力进村。民兵却像从井口、灶台、墙根里冒出来。",
        mood: "wide",
      },
      {
        id: "p4b",
        speaker: "高传宝",
        text: "打一枪，换一个地方！让他们打空气。",
        mood: "talk",
      },
    ],
    closePanels: [
      {
        id: "p4z",
        speaker: "林霞",
        text: "气焰压下去了。下一步：地道出村，咬住黑风口。",
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
    objective: "在地道里挖开炮楼根的土塞，安放炸药，再上地表发出总攻信号。",
    goals: ["dig_under", "plant_charge", "signal_assault"],
    openPanels: [
      {
        id: "p5a",
        speaker: "赵平原",
        text: "围点打援。民兵地道先咬住炮楼根基，主力与游击队再合围。",
        mood: "talk",
      },
      {
        id: "p5b",
        speaker: "高传宝",
        text: "明白。挖到药室，安好，我亲自上去鸣枪。",
        mood: "talk",
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
        text: "地道不是为了炫技。是为了人，还能回家。",
        mood: "talk",
      },
    ],
  },
];

export function FindChapter(chapterId) {
  return CHAPTERS.find((c) => c.id === chapterId) || CHAPTERS[0];
}
