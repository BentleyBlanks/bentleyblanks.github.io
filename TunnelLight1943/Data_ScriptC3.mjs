// 第三章节拍表（SCRIPTS.c3，2026-08-15 从 Script_Core.mjs 按章拆出）。
// 工厂而不是裸数组：节拍里用到的 Core 帮手由 Core 组装 SCRIPTS 时整包递进来
// （下面一行解构还原成裸名字，正文与拆前逐字相同），所以本文件不 import
// Script_Core、没有循环依赖。新用到 Core 的东西：解构清单加名字，Core 末尾的
// SCRIPT_KIT 也加一笔——漏了是当场的 ReferenceError，不会静默出错。
export function ChapterC3(K) {
  const {
    F, FindActor, MakeActor, SpawnFortPatrols,
  } = K;
  return [
    {
      kind: "cinematic", id: "c3_open",
      lines: [
        { stage: "乡亲们说，被抓的人关进了河东的据点。", d: 3.4, cam: { kind: "wide", x: 100 } },
        { stage: "柱子沿着运输队的车辙，摸到了据点外的庄稼地。", d: 3.8, cam: { kind: "wide", x: 150, pan: 6 } },
        { stage: "他不敢靠近。他先学会了看。", d: 3.2, cam: { kind: "shot", x: 20, y: 1.4, dist: 8 } },
      ],
      onDone: (state) => {
        SpawnFortPatrols(state, false);
        // 地里的乡亲：不是任务点，是要搭把手的人。帮了忙，话才敢说出口
        state.actors.push(
          MakeActor("aunt", "villager", F.auntSpot.x, { label: "拾柴的大娘" }),
          MakeActor("cartman", "villager", 107, { label: "赶车乡亲" }),
        );
      },
    },
    {
      kind: "observe", id: "c3_watch", spots: [F.obsWest, F.obsSouth, F.obsEast], watchTime: 5,
      objective: "在三处遮蔽点观察据点（每处停留一会儿）",
      hint: "蹲在遮蔽点里别动，柱子会把看到的记在心里",
      resetHint: "巡逻队走近了。柱子退回庄稼地，等风声过去。",
      notes: [
        "岗楼上两个人，换岗时背对南门，半袋烟的工夫。",
        "巡逻队沿墙根来回走，走到头会停下来抽袋烟。",
        "牢房在东边。白天押着人往围墙上搬土袋，天黑后送过一次饭。押送用的骡车拴在门里。",
      ],
      // 每看完一处，切到他正望着的那样东西上。第三章的功课是"学会看"，
      // 那就得让画面替他看，不是让字幕替他记。
      watchCine: [
        [{ stage: "岗楼上那两个人换班的时候，背是朝着南门的。", d: 3.6, cam: { kind: "insert", x: 184, y: 5.4, dist: 5.5 } },
         { stage: "从背过身到重新站定，大约半袋烟的工夫。", d: 3.2, cam: { kind: "insert", x: 184, y: 5.4, dist: 4.6 } }],
        [{ stage: "巡逻队沿着墙根来回走。走到头，会停下来抽袋烟。", d: 3.8, cam: { kind: "insert", x: 176, y: 1.4, dist: 6.5 } }],
        [{ stage: "牢房在东边。白天押着人往围墙上搬土袋。", d: 3.6, cam: { kind: "insert", x: 192, y: 1.6, dist: 6 } },
         { stage: "门里拴着一辆骡车。车辕上空着。", d: 3.6, cam: { kind: "insert", x: 190, y: 1.0, dist: 3.4 } }],
      ],
    },
    {
      // 帮了忙，话才敢说：柴刀换来的那句口信，是第六章推理的半边
      kind: "chain", id: "c3_aunt",
      objective: "拾柴的大娘朝这边招了招手", hint: "乡亲们敢说话，但只敢小声说",
      resetHint: "巡逻队走近了。柱子退回庄稼地，等风声过去。",
      steps: [
        { type: "talk", actor: "aunt", prompt: "E · 搭话",
          lines: [
            { who: "大娘", say: "孩子，帮我找找柴刀——手一抖，掉进田埂那头了。", d: 3.8, cam: { kind: "ots", subject: "aunt", other: "player", dist: 3.4 } },
          ] },
        { type: "pickup", x: 134, item: { id: "sickle", label: "柴刀" }, prompt: "E · 摸出柴刀" },
        { type: "use", zone: F.auntSpot, needs: "sickle", prompt: "E · 还给大娘",
          noteAdd: "拾柴的大娘：『过几天要往县里押人。孩子，你一个人不行。』",
          note: "大娘攥住他的手腕，压低了声：『过几天要往县里押人。孩子，你一个人不行。』" },
      ],
    },
    {
      // 教「推」。推出来的不是路——是一片会走路的影子
      kind: "chain", id: "c3_cart",
      objective: "赶车乡亲的驴车陷住了", hint: "车帮上还搭着半车干草",
      resetHint: "巡逻队回头了。退进庄稼地，等他们走远。",
      steps: [
        { type: "talk", actor: "cartman", prompt: "E · 上前搭话",
          lines: [
            { who: "赶车乡亲", say: "给据点支差送草——车陷在这儿了。搭把手；躲着点巡逻的。", d: 4.2, cam: { kind: "ots", subject: "cartman", other: "player", dist: 3.4 } },
          ],
          noteAdd: "赶车的乡亲：『里头新关了十几个，有女娃。别靠南门，狗鼻子灵。』" },
        { type: "push", from: 106, dir: 1, dist: 4, prompt: "按住 E · 推车",
          note: "车轮从辙里蹦出来了。乡亲把缰绳一抖。" },
      ],
    },
    {
      // 《勇敢的心》式移动掩体段：车影是探照灯下唯一的影子
      kind: "cartRide", id: "c3_ride", from: 110, to: 144, speed: 1.35, safeR: 2.8, driver: "cartman",
      light: { zone: [120, 142], cycle: 7.5, lit: 2.4, src: { x: 184, y: 6 } },
      objective: "贴着草车走——灯扫过来时，车影是唯一的影子",
      hint: "别掉队。掉出车影又赶上灯，就全完了",
      resetHint: "灯从车帮上扫过去——差一点。乡亲把车又吁回了辙口。",
      note: "到草垛这儿，乡亲一抬下巴：前头的路，你自己贴着黑走。",
      onReset: (state) => { if (state.cart) state.cart.x = 110; },
      onDone: (state) => {
        // 车把式赶着车进据点交差去了
        const cm = FindActor(state, "cartman");
        if (cm) { cm.cineTarget = { x: 174 }; cm.cineSpeed = 1.5; cm.cineVanish = true; }
      },
    },
    {
      kind: "goto", id: "c3_closer", zone: F.gate, stealth: true,
      objective: "趁灯的间隙摸近南门，看清牢房方向", hint: "蹲在田埂下，读准探照灯的节奏再动",
      light: { zone: [146, 170], cycle: 8, lit: 2.6, src: { x: 184, y: 6 } },
      resetHint: "岗楼上的灯扫了过来。退回田埂下，重新数灯的节奏。",
      interruptAt: 0.8,
    },
    {
      kind: "cinematic", id: "c3_rescue",
      lines: [
        { stage: "身后突然伸过来一只手，把柱子整个按进田埂下面。", d: 3.6, cam: { kind: "close", on: "player", dist: 3.8 } },
        { stage: "巡逻队的脚步声从头顶的田埂上过去了。", d: 3.6, cam: { kind: "shot", x: 158, y: 1.2, dist: 9 } },
        { stage: "沟里蹲着几个背枪的庄稼人。领头的把他上下打量了一遍。", d: 4.0, cam: { kind: "shot", x: 9, y: 1.2, dist: 9 },
          on: (state) => {
            state.player.x = 11;
            const gao = MakeActor("gao", "militia", 7, { label: "高传宝", heading: 1 });
            state.actors.push(gao, MakeActor("mil1", "militia", 4, { heading: 1 }));
          } },
        { who: "高传宝", say: "梁家村的柱子？", d: 2.8, cam: { kind: "ots", subject: "gao", other: "player", dist: 3.4 } },
        { stage: "柱子没敢答话。", d: 2.4, cam: { kind: "ots", subject: "player", other: "gao", dist: 3.2 } },
        { who: "高传宝", say: "你爹以前帮过乡亲。", d: 3.0, cam: { kind: "ots", subject: "gao", other: "player", dist: 3.4 } },
        { stage: "夜里，一个满身泥的交通员摸进沟来，鞋底磨穿了。", d: 4.0, cam: { kind: "shot", x: 12, y: 1.2, dist: 8 },
          on: (state) => {
            state.actors.push(MakeActor("runner", "villager", 20, {
              label: "交通员", cineTarget: { x: 13 }, cineSpeed: 2.6, heading: -1,
            }));
          } },
        { stage: "他的鞋底磨穿了。", d: 3.0, cam: { kind: "insertCard", card: "sole" } },
        { who: "交通员", say: "据点里又抓了几个人。柱子的妹妹，也在里面。", d: 4.2, cam: { kind: "ots", subject: "runner", other: "gao", dist: 3.6 } },
        { who: "高传宝", say: "先把人救出来。不能让乡亲们再被带走。", d: 4.0, cam: { kind: "ots", subject: "gao", other: "runner", dist: 3.6 } },
        { stage: "鬼子放出风来，要往县里押人，日子没说定。", d: 4.6, cam: { kind: "shot", x: 170, y: 2.2, dist: 16 } },
      ],
    },
  ];
}
