// 剧情事件（docs/Data_Scene.md §2 hideOn / showOn）：场景物件的 showOn / hideOn 写的就是这些名字。
//
// 剧情走到某一步（炸桥、塌洞、门被撞开……）就「发生」一个事件：写了「消失于 X」的物件在 X 发生后藏起来（炸断的桥面、
// 塌掉的墙），写了「出现于 X」的物件在 X 发生后才出现（断桥残骸、碎砖堆）。哪一刻发生由白盒编辑器那一关配置里
// 关键帧的 signals 决定（Blockout/<Level>.json，代码里叫 signal）；场景编辑器的「剧情事件」面板勾上一个 = 看它发生后的样子。
//
// label：给人看的名字；from：第一次发生在哪个关键帧（照 2026-11-01 的配置抄的，只是提示，以配置为准）。
// 场景里用到的事件名都要在这里有一行（Script_SceneDocTest 查）。

export const SCENE_EVENTS = Object.freeze({
  Stage0105Done: Object.freeze({ label: "01–05 演完", from: "06-1", note: "沟里那圈空气墙撤掉，后两段不挡人" }),
  DugoutCollapsed: Object.freeze({ label: "防炮洞塌了", from: "01-4" }),
  PitShelled: Object.freeze({ label: "机枪坑挨了炮", from: "03-4" }),
  TankDisabled: Object.freeze({ label: "战车被炸瘫", from: "05-3" }),
  CartDeparted: Object.freeze({ label: "驴车走了", from: "06-3" }),
  CellarBlast: Object.freeze({ label: "地窖里炸了", from: "09-4" }),
  SideGateOpen: Object.freeze({ label: "便门开了", from: "09-5" }),
  EastGateBurst: Object.freeze({ label: "东门被冲开", from: "09-7" }),
  MgSilenced: Object.freeze({ label: "机枪哑了", from: "10-1" }),
  NorthYardGatesBroken: Object.freeze({ label: "北院门被撞开", from: "10-3" }),
  BarrageHit: Object.freeze({ label: "炮弹落下来", from: "10-5" }),
  LaneWallCollapse: Object.freeze({ label: "巷子墙塌了", from: "10-6" }),
  // 11–18 第四版（2026-11-02）：FamilyHidden（钻洞的那一家）删了
  GuandaoBridgeBlown: Object.freeze({ label: "官道桥炸了", from: "13-2", note: "二营炸的木桥：中间几跨没了、断木砸进河床" }),
  DugoutBombed: Object.freeze({ label: "院里的洞挨了炸弹", from: "14-2", note: "南街那家院里：弹坑 + 碎砖 + 塌了的洞顶" }),
  CartOverturned: Object.freeze({ label: "车翻了", from: "14-3" }),
  RaidAftermath: Object.freeze({ label: "空袭过后", from: "15-1", note: "街上、门前、路头上一排排盖着席子的人、几处碎砖堆" }),
  GirlHoleCovered: Object.freeze({ label: "藏人的洞口盖上了", from: "18-2" }),
  ChargesSet: Object.freeze({ label: "炸药装好了", from: "18-3" }),
  BridgeBlown: Object.freeze({ label: "桥炸了", from: "18-6" }),
});

/** 事件名 → 「桥炸了（18-6 起）」；没登记的原样返回。 */
export function SceneEventLabel(name) {
  const e = SCENE_EVENTS[name];
  return e ? `${e.label}（${e.from} 起）` : name;
}
