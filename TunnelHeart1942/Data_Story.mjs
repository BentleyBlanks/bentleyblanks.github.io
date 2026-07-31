/** @typedef {{ id: string, title: string, body: string }} StoryBeat */
/** @typedef {{ id: string, title: string, body: string }} HistoryCard */

export const SAVE_KEY = "tunnelheart1942_v1";
export const CACHE_BUST = "20260731a";

export const GAME_META = {
  title: "地道战 · 高家庄",
  subtitle: "横版叙事解谜 · 致敬《勇敢的心：世界大战》形式",
  tagline: "在冀中平原，用铁锨、钟声与地道，把乡亲护到明天。",
  yearLabel: "一九四二年 · 冀中高家庄",
};

/** @type {HistoryCard[]} */
export const HISTORY_CARDS = [
  {
    id: "card_tunnel_origin",
    title: "地道从地窖长出来",
    body: "冀中平原少山少林，群众先把地窖、土洞打通，再逐步改造成能藏、能走、能打的战斗地道。",
  },
  {
    id: "card_bell",
    title: "村口大钟",
    body: "钟声是最响的警报。电影里高老忠拼死敲钟，换来乡亲入洞的时间——本关把这一幕写成不可改写的史实节拍。",
  },
  {
    id: "card_flip",
    title: "翻口与迷惑洞",
    body: "战斗地道设翻口、卡口与迷惑岔道，专克毒气、灌水与搜查，也能让敌人“高，实在是高”。",
  },
  {
    id: "card_heifengkou",
    title: "黑风口据点",
    body: "拔据点不是炫技歼敌，而是把封锁网撕开一口，让村落地道连成野外进攻网。",
  },
];

/**
 * Five acts mirror the film arc:
 * dig → raid/sacrifice → rebuild combat tunnels → ambush → take the blockhouse.
 * @type {Array<{
 *   id: string,
 *   act: number,
 *   title: string,
 *   timeLabel: string,
 *   portrait: string,
 *   bg: string,
 *   layer: "village"|"tunnel"|"blockhouse",
 *   briefing: StoryBeat[],
 *   outro: StoryBeat[],
 *   objective: string,
 *   goals: string[],
 *   historyCardId: string,
 * }>}
 */
export const CHAPTERS = [
  {
    id: "act1_connect",
    act: 1,
    title: "土洞相连",
    timeLabel: "一九四二年 · 春",
    portrait: "Texture_PortraitChuanbao.png",
    bg: "Texture_BgVillage.jpg",
    layer: "village",
    objective: "把三家地窖挖通，让乡亲能互通躲藏。",
    goals: ["dig_links", "talk_laozhong", "open_hatch"],
    historyCardId: "card_tunnel_origin",
    briefing: [
      {
        id: "b1a",
        title: "平原没有山",
        body: "高家庄在冀中平地上。鬼子一来，藏无可藏。高老忠把几家的土洞指给传宝看——“先挖通，再谈打。”",
      },
      {
        id: "b1b",
        title: "铁锨就是武器",
        body: "你是民兵队长高传宝。左右移动，走近松土按住挖掘，把地窖连成地道。空格跳跃，靠近物件按互动。",
      },
    ],
    outro: [
      {
        id: "o1",
        title: "洞通了",
        body: "三家地道口对上了气。林霞说：能藏还不够，夜里要有人守钟。",
      },
    ],
  },
  {
    id: "act2_bell",
    act: 2,
    title: "钟声",
    timeLabel: "一九四二年 · 夜袭",
    portrait: "Texture_PortraitLaozhong.png",
    bg: "Texture_BgVillage.jpg",
    layer: "village",
    objective: "护送乡亲入洞，并赶到村口大槐树下敲响警钟。",
    goals: ["shelter_villagers", "ring_bell", "survive_raid"],
    historyCardId: "card_bell",
    briefing: [
      {
        id: "b2a",
        title: "黑风口的靴子",
        body: "夜色里据点灯火一闪。高老忠听见狗叫，低声吩咐：快把人往洞里送——钟，我来敲。",
      },
      {
        id: "b2b",
        title: "先救人",
        body: "带乡亲到地道口互动入洞。随后冲向村口大钟。钟声一响，这一幕便按史实落下。",
      },
    ],
    outro: [
      {
        id: "o2",
        title: "钟还在响",
        body: "高老忠拉响了最后一颗手榴弹。地道被破坏了，可乡亲还在。传宝握紧铁锨：只藏不够，要能打。",
      },
    ],
  },
  {
    id: "act3_combat_tunnel",
    act: 3,
    title: "能藏能打",
    timeLabel: "一九四三年 · 初夏",
    portrait: "Texture_PortraitLinxia.png",
    bg: "Texture_BgTunnel.jpg",
    layer: "tunnel",
    objective: "改建翻口，识破冒充武工队的特务并在翻口处将其制服。",
    goals: ["build_flip", "expose_spy", "trap_spy"],
    historyCardId: "card_flip",
    briefing: [
      {
        id: "b3a",
        title: "论持久战摊在炕桌上",
        body: "林霞与传宝总结教训：地道要有翻口、射击孔和迷惑岔道。敌人灌水放火，也别想一网打尽。",
      },
      {
        id: "b3b",
        title: "来客不对劲",
        body: "两个“武工队员”口音发飘、路线发熟。先修好翻口，再引他们走到卡口下方。",
      },
    ],
    outro: [
      {
        id: "o3",
        title: "高，实在是高",
        body: "翻口一落，特务束手。山田的报复不会远——下一次，要让他在地道口摸不着北。",
      },
    ],
  },
  {
    id: "act4_ambush",
    act: 4,
    title: "神出鬼没",
    timeLabel: "一九四三年 · 夏",
    portrait: "Texture_PortraitChuanbao.png",
    bg: "Texture_BgVillage.jpg",
    layer: "village",
    objective: "从多个地道口出击，打乱山田的报复队形并保全群众。",
    goals: ["exit_shots", "break_patrol", "keep_safe"],
    historyCardId: "card_flip",
    briefing: [
      {
        id: "b4a",
        title: "打一枪换一个地方",
        body: "山田纠集兵力进村。民兵从井口、灶台、墙根钻出开火，再缩回地道——让敌人打的是空气。",
      },
      {
        id: "b4b",
        title: "口子就是阵地",
        body: "走到发光的出击口按互动开火，再换到下一处。别在同一个口子恋战。",
      },
    ],
    outro: [
      {
        id: "o4",
        title: "气焰压下去了",
        body: "报复落了空。地道开始往野外延伸——下一目标：黑风口。",
      },
    ],
  },
  {
    id: "act5_heifengkou",
    act: 5,
    title: "黑风口",
    timeLabel: "反攻前夜",
    portrait: "Texture_PortraitChuanbao.png",
    bg: "Texture_BgBlockhouse.jpg",
    layer: "blockhouse",
    objective: "地道挖到炮楼下，与八路军协同拔掉黑风口据点。",
    goals: ["dig_under", "plant_charge", "signal_assault"],
    historyCardId: "card_heifengkou",
    briefing: [
      {
        id: "b5a",
        title: "围点打援",
        body: "区长赵平原定下协同：民兵地道先咬住炮楼根基，主力与游击队再合围。",
      },
      {
        id: "b5b",
        title: "最后一锨",
        body: "在松土段挖通至药室，安放炸药，爬上信号点鸣枪。胜利的钟声，要响遍冀中。",
      },
    ],
    outro: [
      {
        id: "o5",
        title: "钟声再起",
        body: "黑风口塌了。高家庄的地道从村里通到野外——不是为了炫技，是为了人还能回家。",
      },
    ],
  },
];

export function FindChapter(chapterId) {
  return CHAPTERS.find((chapter) => chapter.id === chapterId) || CHAPTERS[0];
}

export function FindHistoryCard(cardId) {
  return HISTORY_CARDS.find((card) => card.id === cardId) || HISTORY_CARDS[0];
}
