// 主菜单正式章节表与机位配置（纯数据）。
// 独立于 Data_Battle（旧七章战场表）与 Data_Menu（全城俯瞰 / 界河切片），避免主菜单包牵连旧七章数据。

import { FIRST_LEVEL_CAMPAIGN_MENU_ENTRY } from "./Data_FirstLevelCampaign.mjs";

export const CAMPAIGN_ENTRIES = Object.freeze([
  FIRST_LEVEL_CAMPAIGN_MENU_ENTRY,
  Object.freeze({
    id: "CH2_Shouliudan",
    chapter: true,
    placeholder: true,
    label: "第二关 · 手榴弹雨",
    date: "一九三八年三月十六日 十时三十分 — 十七时",
    place: "滕县东关 · 外壕、寨门、关厢院落、寺院地",
  }),
  Object.freeze({
    id: "CH3_Jiuhusuo",
    chapter: true,
    placeholder: true,
    label: "第三关 · 救护所",
    date: "一九三八年三月十六日 十七时 — 二十时",
    place: "城内 A 区主救护所 → 东关失守街区 · C 区前沿救护点",
  }),
  Object.freeze({
    id: "CH4_DongguanYe",
    chapter: true,
    placeholder: true,
    label: "第四关 · 东关之夜",
    date: "一九三八年三月十六日 夜 — 十七日 凌晨",
    place: "B 区东关集结院 → 东关夜巷 → 城内 A 区主救护所",
  }),
  Object.freeze({
    id: "CH5_Chengqiang",
    chapter: true,
    placeholder: true,
    label: "第五关 · 城墙没有了",
    date: "一九三八年三月十七日 清晨 — 午后",
    place: "城内 A 区废墟 → 十字街口 → 西街长街 → 西关城门",
  }),
  Object.freeze({
    id: "CH6_Zuihou",
    chapter: true,
    placeholder: true,
    label: "终章 · 最后一封",
    date: "一九三八年三月十七日 午后 — 黄昏",
    place: "城内临时师部 → 西门大街 → 西关电灯厂",
  }),
]);

export const MENU_SCENE = {
  slice: "CH2_Shouliudan",
  holdSeconds: 16,
  fadeSeconds: 0.9,
  drift: 0.55,
  garrison: 5,
  garrisonAt: [0.30, 0.62],
  garrisonSpread: 20,
};

export const MENU_SHOTS = {
  CH0_Chuchuan: [
    {
      id: "Railbed", titleKey: "menu.shot.railbed", note: "路基侧后方：军列停下来的地方，也是第一关接敌的那道土坎",
      from: [-540, 12, -232], to: [-522, 11, -206],
      look: [-478, 4.0, -172], focalMm: 40,
    },
    {
      id: "Depot", titleKey: "menu.shot.depot", note: "车站货场方向：第五战区补的那批枪弹是从这儿发下去的",
      from: [-504, 15, -136], to: [-488, 14, -114],
      look: [-458, 6.5, -82], focalMm: 35,
    },
  ],
  CH1_NanLu: [
    {
      id: "PowerPlant", titleKey: "menu.shot.powerPlant", note: "电灯厂：师部原设于此，十五日迁入城内。烟囱在西城门楼直瞄射程内",
      from: [-504, 15, 142], to: [-486, 14, 108],
      look: [-408, 11, 62], focalMm: 40,
    },
    {
      id: "WestGate", titleKey: "menu.shot.westGate", note: "西门外的护城河边看怀古门 —— 第一关末尾把人带回城走的就是这个门",
      from: [-426, 19, -66], to: [-408, 17.5, -24],
      look: [-318, 8.5, 0], focalMm: 35,
    },
  ],
  CH2_Shouliudan: [
    {
      id: "ZhaiWall", titleKey: "menu.shot.zhaiWall", note: "东寨墙外：高两米、顶宽四十公分，一炮一个口",
      from: [594, 13, -56], to: [576, 12, 2],
      look: [452, 5.5, -6], focalMm: 40,
    },
    {
      id: "Courtyard", titleKey: "menu.shot.courtyard", note: "关厢院落上方：日方检讨说要命的不是城墙，是这片密集民房",
      from: [470, 24, 122], to: [452, 21, 84],
      look: [378, 6, 34], lookTo: [356, 6.5, 18], focalMm: 35,
    },
  ],
  CH3_Jiuhusuo: [
    {
      id: "EastGate", titleKey: "menu.shot.eastGate", note: "东门外一百米，关厢屋顶之上望宗鲁门与瓮城 —— 救护队来回走的那道门",
      from: [432, 17.5, -52], to: [424, 16.5, -22],
      look: [316, 8.5, -65], lookTo: [316, 8.5, -57], focalMm: 35,
    },
    {
      id: "LostBlock", titleKey: "menu.shot.lostBlock", note: "东关大街上方：前沿救护点就在这一片院落里",
      from: [470, 24, 122], to: [452, 21, 84],
      look: [452, 6, -20], lookTo: [449, 6.5, -60], focalMm: 35,
    },
  ],
  CH4_DongguanYe: [
    {
      id: "Lane", titleKey: "menu.shot.lane", note: "巷道低机位：夜里那一队人要走的那条巷子",
      from: [556, 6.5, -72], to: [538, 6.0, -44],
      look: [470, 2.6, -6], focalMm: 40,
    },
    {
      id: "AssemblyYard", titleKey: "menu.shot.assemblyYard", note: "B 区集结院方向：分弹药、喝稀粥、写回信的那个院子",
      from: [492, 18, -230], to: [476, 16.5, -206],
      look: [449, 5.5, -175], focalMm: 35,
    },
  ],
  CH5_Chengqiang: [
    {
      id: "Corridor", titleKey: "menu.shot.corridor", note: "十字街口沿西门大街往西推：西城门楼一眼望穿",
      from: [64, 1.85, 0], to: [22, 1.80, 0],
      look: [-180, 2.2, 0], lookTo: [-288, 5.0, 0], focalMm: 50,
    },
    {
      id: "Yamen", titleKey: "menu.shot.yamen", note: "县衙：城内唯一有实物可参照的建筑，明代大堂",
      from: [88, 23, -72], to: [106, 21, -62],
      look: [128, 6, -118], focalMm: 40,
    },
  ],
  CH6_Zuihou: [
    {
      id: "WestGateInner", titleKey: "menu.shot.westGateInner", note: "西门里往城门看：通信组带着密码材料从这儿出城",
      from: [-176, 14, -58], to: [-198, 13, -34],
      look: [-300, 7.5, 0], focalMm: 40,
    },
    {
      id: "PowerPlant", titleKey: "menu.shot.powerPlant", note: "电灯厂：王铭章在这附近殉国。二十二米的烟囱是西关天际线",
      from: [-462, 15, 128], to: [-450, 14, 106],
      look: [-410, 9, 69], focalMm: 40,
    },
  ],
  Overview: [
    {
      id: "EastGate", titleKey: "menu.shot.eastGate", note: "东门外一百米，关厢屋顶之上望宗鲁门与瓮城 —— 城的正脸",
      from: [432, 17.5, -52], to: [424, 16.5, -22],
      look: [316, 8.5, -65], lookTo: [316, 8.5, -57], focalMm: 35,
    },
    {
      id: "SouthEastTower", titleKey: "menu.shot.southEastTower", note: "东南角望楼：日方战详报点名的那一座，突破口在它西侧二十米",
      from: [408, 16, 372], to: [382, 14, 344],
      look: [306, 8, 300], focalMm: 40,
    },
    {
      id: "Rampart", titleKey: "menu.shot.rampart", note: "墙顶回廊：站在女墙后沿东墙往北推，尽头是东门城楼",
      from: [305, 13.3, 244], to: [305, 13.2, 150],
      look: [305, 12.2, 60], lookTo: [307, 12.0, 10], focalMm: 50, crowd: false,
    },
    {
      id: "Yamen", titleKey: "menu.shot.yamen", note: "县衙：城内唯一有实物可参照的建筑，明代大堂",
      from: [88, 23, -72], to: [106, 21, -62],
      look: [128, 6, -118], focalMm: 40,
    },
  ],
};
