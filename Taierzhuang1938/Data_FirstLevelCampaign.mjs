// 第一关正式战役纯数据：复用遭遇设计编辑器「北沙河单村合并版」与开场 Timeline 源。
// 纯 JSON 可序列化数据，零 import、零函数（标题菜单与游戏宿主共用）。

export const FIRST_LEVEL_P012_WHITEBOX_LEVEL_ID = "FirstLevelP012Whitebox";
export const FIRST_LEVEL_CAMPAIGN_VARIANT_ID = "L1_BeishaheMerged";
export const FIRST_LEVEL_OPENING_TIMELINE_URL = "./Timeline/FirstLevelOpeningCampaign.timeline.json";
export const FIRST_LEVEL_BRIDGE_DEMO_TIMELINE_URL = "./Timeline/FirstLevelBridgeDemolition.timeline.json";
export const FIRST_LEVEL_ENDING_TIMELINE_URL = "./Timeline/FirstLevelEndingNightMarch.timeline.json";
export const FIRST_LEVEL_OPENING_SEQUENCES = Object.freeze([
  "01-1", "01-2", "01-3", "01-4", "02-1", "02-2",
]);

export const FIRST_LEVEL_CAMPAIGN_STAGES = Object.freeze([
  Object.freeze({ number: 1, id: "01", title: "防炮洞", entryBeat: "02g", opening: true }),
  Object.freeze({ number: 2, id: "02", title: "刺刀", entryBeat: "02g", opening: false }),
  Object.freeze({ number: 3, id: "03", title: "拖冬瓜", entryBeat: "03a", opening: false }),
  Object.freeze({ number: 4, id: "04", title: "干沟集结处", entryBeat: "04a", opening: false }),
  Object.freeze({ number: 5, id: "05", title: "凹路行军", entryBeat: "05a", opening: false }),
  Object.freeze({ number: 6, id: "06", title: "坦克车", entryBeat: "06a", opening: false }),
  Object.freeze({ number: 7, id: "07", title: "喘口气", entryBeat: "07a", opening: false }),
  Object.freeze({ number: 8, id: "08", title: "沟口阻击与日军侧包", entryBeat: "08a", opening: false }),
  Object.freeze({ number: 9, id: "09", title: "关帝庙潜行合围老耿家", entryBeat: "09a", opening: false }),
  Object.freeze({ number: 10, id: "10", title: "救护所抢位与空袭突围", entryBeat: "10a", opening: false }),
  Object.freeze({ number: 11, id: "11", title: "洞里休整与经教堂出村", entryBeat: "11a", opening: false }),
  Object.freeze({ number: 12, id: "12", title: "黄昏赶桥与路基伏击", entryBeat: "12a", opening: false }),
  Object.freeze({ number: 13, id: "13", title: "死守铁路桥与炸桥夜行", entryBeat: "13a", opening: false }),
]);

export const FIRST_LEVEL_CAMPAIGN_MENU_ENTRY = Object.freeze({
  id: "FirstLevelP012Whitebox",
  contentId: "CH1_NanLu",
  sandbox: true,
  sandboxKey: "firstLevelP012Whitebox",
  chapter: true,
  artId: "CH1_NanLu",
  date: "一九三八年三月",
  label: "第一关 · 往南的路",
  place: "滕县外围 · 界河至北沙河",
  minutes: 45,
  brief: Object.freeze([
    "日军突破前沿防线，掩蔽部受炮火震塌。稳住阵脚，突围护送伤员经北沙河撤往滕县。",
    "WASD 移动 · Shift 冲刺 · C 蹲伏 · Z 卧倒 · F 交互 · V 大刀 · G 手榴弹 · H 集束手榴弹",
  ]),
  metaText: Object.freeze(["第一关完整流程", "北沙河单村合并版", "遭遇设计同步"]),
  objectives: Object.freeze(["稳住阵脚，突围护送伤员经北沙河撤往滕县。"]),
  mechanic: "掩护伤员，完成当前任务。",
});
