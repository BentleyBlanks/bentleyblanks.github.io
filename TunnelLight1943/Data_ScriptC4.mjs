// 第四章节拍表（SCRIPTS.c4，2026-08-15 从 Script_Core.mjs 按章拆出）。
// 工厂而不是裸数组：节拍里用到的 Core 帮手由 Core 组装 SCRIPTS 时整包递进来
// （下面一行解构还原成裸名字，正文与拆前逐字相同），所以本文件不 import
// Script_Core、没有循环依赖。新用到 Core 的东西：解构清单加名字，Core 末尾的
// SCRIPT_KIT 也加一笔——漏了是当场的 ReferenceError，不会静默出错。
export function ChapterC4(K) {
  const {
    SpawnSurfaceSearch, SpawnTunnelVillagers, StartFlood, StartSmoke, TV, UNDER_Y,
  } = K;
  return [
    {
      kind: "cinematic", id: "c4_open",
      lines: [
        { stage: "沙河庄的地道，是乡亲们一锹一锹挖出来的。", d: 3.6, cam: { kind: "wide", x: 90, y: -1.2 },
          on: (state) => { SpawnTunnelVillagers(state); } },
        // 说"藏得住人"，洞里就得有人：把乡亲摆在这一镜的画框里
        { stage: "它不通向据点。它通向的是：藏得住人，转移得走，活得下去。", d: 4.4, cam: { kind: "wide", x: 90, y: -1.2, pan: -6 },
          on: (state) => {
            const spread = [58, 61, 84, 87, 112];
            state.actors.filter((a) => a.kind === "villager").forEach((a, i) => {
              a.x = spread[i % spread.length];
              a.heading = i % 2 ? -1 : 1;
            });
          } },
        { who: "高传宝", say: "想救人，先学会怎么把人藏好。", d: 3.4, cam: { kind: "ots", subject: "gao", other: "player", dist: 3.6 } },
      ],
    },
    {
      kind: "lead", id: "c4_hideA", group: "elders", dest: TV.chamberA,
      objective: "把两位老人带到藏人洞·甲", hint: "走到老人身边招呼一声，他们会跟着你",
    },
    {
      kind: "lead", id: "c4_hideB", group: "family", dest: TV.chamberB,
      objective: "把大嫂和孩子带到藏人洞·乙", hint: "孩子走得慢，别落下他们",
    },
    {
      // C1 的链搬进地道：猫腰＋扛大件双重降速，第一次体会地道里搬东西的分量
      kind: "chain", id: "c4_shore",
      objective: "西口的顶木松了", hint: "光用手是按不住的——藏人洞乙备着撑木",
      steps: [
        { type: "pickup", x: 61, level: "under", item: { id: "prop", label: "撑木", big: true }, prompt: "E · 扛起撑木" },
        { type: "use", zone: TV.entW, needs: "prop", hold: 2.2, stroke: "up", gestureY: 1.7, prompt: "按住 E · 顶上撑木",
          note: "木头咬住了。他松开手，顶木没有再响。" },
      ],
    },
    {
      kind: "hold", id: "c4_listen", zone: TV.entE, holdTime: 4, sustain: true, holdPrompt: "按住 E · 听",
      objective: "贴在东口下面，听听上面的动静", hint: "贴住不动，柱子会把听到的记在心里",
      note: "探杆一下一下地戳。脚步散开，又聚拢。",
    },
    {
      kind: "cinematic", id: "c4_smokeStart",
      lines: [
        { stage: "头顶传来闷响。泥土簌簌往下掉。", d: 3.2, cam: { kind: "shot", x: 148, y: UNDER_Y + 1.4, dist: 8 },
          on: (state) => { SpawnSurfaceSearch(state, 148); } },
        { stage: "有人用本地口音在上面喊：地道口就在磨盘这一片，扒！", d: 3.8, cam: { kind: "shot", x: 148, y: 1.0, dist: 10 } },
        { who: "民兵", say: "鬼子发现东口了！", d: 2.6, cam: { kind: "shot", x: 146, y: UNDER_Y + 1.4, dist: 8 } },
        // 剖面招牌构图：地表在翻找，地下在屏息，同框
        { stage: "一股呛人的烟，顺着东口灌了进来。", d: 3.4, cam: { kind: "shot", x: 142, y: -1.2, dist: 12 } },
      ],
      onDone: (state) => { StartSmoke(state); },
    },
    {
      // 大纲原文：「村民立刻熄灭油灯」——地道里最要紧的一件事，也是标题本身
      kind: "douseLamps", id: "c4_douse",
      smokeFloor: 133,   // 熄灯期间烟被顶木和弯道拖着，最多压到东数第二盏灯外
      lamps: [148, 132, 116, 96, 74],
      objective: "把地道里的灯一盏盏吹灭",
      hint: "一盏一盏吹灭。留最后一盏在自己手里",
      note: "最后一盏灯攥在柱子手里。地道一下子只剩这一点光。",
    },
    {
      // 第一次限时物品链：烟一直在推进。历史正解——冀中地道用湿被褥堵烟。
      // 干被子堵不住，这一步「浸湿」就是链上多出来的那个心眼
      kind: "chain", id: "c4_quilt",
      smokeFloor: 127.5,   // 卡口窄，烟在这儿灌得慢——玩家要堵的位置不能先被吞掉
      objective: "烟还在往里灌——把它堵在东段卡口外", hint: "藏人洞里备着棉被和水瓮。干被子堵不住烟",
      steps: [
        { type: "pickup", x: 110, level: "under", item: { id: "quilt", label: "棉被", big: true }, prompt: "E · 抱起棉被" },
        { type: "use", zone: { x: 116, w: 3, level: "under" }, needs: "quilt", hold: 1.2, stroke: "down", prompt: "按住 E · 浸湿棉被",
          transform: { id: "wetQuilt", label: "湿棉被", big: true },
          note: "棉被吃透了水，沉得坠手。" },
        { type: "use", zone: TV.plugSpot, needs: "wetQuilt", hold: 1.6, stroke: "down", prompt: "按住 E · 堵住卡口",
          note: "烟撞在湿棉被上，打着旋儿退了回去。呛人的味道淡下来了。",
          effect: (state) => { state.flags.quiltPlugged = true; if (state.smoke) state.smoke.speed = 0.05; } },
      ],
    },
    {
      kind: "smokeEscape", id: "c4_smoke", dest: TV.entW, lossScript: true,
      objective: "赶在烟前头，把人从西口转移出去",
      hint: "烟往西灌，先带东边的人。招呼一群人跟上，到西口他们会自己爬出去",
      resetHint: "烟呛倒了人。民兵把大家拖回洞室，重新来。",
      onEnter: (state) => {
        // 鬼子加了风箱：被子挡得住一时，挡不住一夜
        if (state.smoke) state.smoke.speed = 0.42;
        state.toast = { text: "上面拉来了风箱。烟从被子边上一丝丝挤进来——得走了。", t: 4.5 };
      },
    },
    {
      kind: "cinematic", id: "c4_floodStart",
      lines: [
        { stage: "第二天，鬼子又拉来了水泵。", d: 3.2, cam: { kind: "shot", x: 144, y: 0.6, dist: 11 },
          on: (state) => { SpawnSurfaceSearch(state, 146); } },
        { stage: "浑浊的泥水顺着东口灌下来，先淹的是最低的那一段。", d: 4.2, cam: { kind: "wide", x: 120, y: -1.2, hw: 10.5, pan: -8 },
          on: (state) => { StartFlood(state); } },
      ],
    },
    {
      kind: "floodRescue", id: "c4_flood", dest: TV.entW,
      objective: "水在涨——把还困在里面的人捞出西口",
      hint: "水从东边漫过来，低处先没。招呼人跟上",
      resetHint: "水太深了，人被冲散。民兵把大家托回高处，再来一次。",
    },
    {
      kind: "cinematic", id: "c4_loss",
      lines: [
        { stage: "西口外，乡亲们趴在田里咳嗽。人数了两遍。", d: 3.8, cam: { kind: "shot", x: 30, y: 0.8, dist: 12 } },
        { stage: "顺子没出来。拴柱大爷也没有。", d: 4.2, cam: { kind: "shot", x: 34, y: 0.6, dist: 8 } },
        { stage: "柱子站在出口，看着被抬出来的乡亲，一句话也说不出。", d: 4.2, cam: { kind: "shot", x: 34, y: 0.6, dist: 9 } },
        { who: "高传宝", say: "准备下一次行动。", d: 3.0, cam: { kind: "ots", subject: "gao", other: "player", dist: 3.4 } },
        { stage: "柱子背起工具，跟着队伍再次下了地道。", d: 3.6, cam: { kind: "wide", x: 90, y: -1.2 } },
      ],
    },
  ];
}
