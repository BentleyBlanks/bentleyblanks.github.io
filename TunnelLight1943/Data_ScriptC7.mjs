// 第七章节拍表（SCRIPTS.c7，2026-08-15 从 Script_Core.mjs 按章拆出）。
// 工厂而不是裸数组：节拍里用到的 Core 帮手由 Core 组装 SCRIPTS 时整包递进来
// （下面一行解构还原成裸名字，正文与拆前逐字相同），所以本文件不 import
// Script_Core、没有循环依赖。新用到 Core 的东西：解构清单加名字，Core 末尾的
// SCRIPT_KIT 也加一笔——漏了是当场的 ReferenceError，不会静默出错。
export function ChapterC7(K) {
  const {
    AttachSister, FindActor, MakeActor, SetupFortTunnel, SpawnRescueSquad, StartRescueLoop, TF,
    UNDER_Y,
  } = K;
  return [
    {
      kind: "cinematic", id: "c7_open", dynamicLines: (state) => (
        state.flags.route === "ground"
          ? [
            { stage: "二更天，村北先响了枪。柱子在那头。", d: 3.4, cam: { kind: "dark" } },
            { stage: "据点岗楼上的灯全甩向北面。巡逻队跑步出了南门。", d: 3.8, cam: { kind: "wide", x: 150, y: 1.5 } },
            { stage: "枪声把人引出去多远，地底下就多出多少工夫。", d: 3.8, cam: { kind: "wide", x: 150, y: 1.5, pan: -4 } },
            { stage: "打完那一阵，他才从北边退回来下的地道。接应组已经走在前头了。", d: 4.6, cam: { kind: "wide", x: 60, y: -1.4, hw: 10, pan: -5 },
              on: (state) => { SpawnRescueSquad(state); } },
          ]
          : [
            { stage: "区上武工队来了两个班。佯动组已经摸到村北去了——这边不动，人从地下走。", d: 4.4, cam: { kind: "dark" } },
            { stage: "二更天，地道里一盏灯也没点。", d: 3.2, cam: { kind: "dark" } },
            { stage: "队伍在黑暗里贴着墙根移动，谁也不说话。", d: 3.6, cam: { kind: "wide", x: 40, y: -1.4, hw: 10 },
              on: (state) => { SpawnRescueSquad(state); } },
            { stage: "这条道原本只到墙外的地里。最后那十几步，是这三天连夜掏出来的。", d: 4.6, cam: { kind: "wide", x: 90, y: -1.4, hw: 10, pan: 6 } },
            { stage: "柱子数着步子。掏到牢房地沿，还有两处虚土要清。", d: 4.0, cam: { kind: "wide", x: 120, y: -1.4, hw: 9.5 } },
          ]
      ),
      onDone: (state) => { SetupFortTunnel(state); },
    },
    {
      kind: "digSeq", id: "c7_dig", spots: [TF.collapse1, TF.collapse2], holdTime: 3.5,
      shore: { collapse1: { beamX: 44 }, collapse2: { beamX: 92 } },
      objective: "支起顶木，掏开虚土，把最后十几步挖通", hint: "顶木在旁洞里。头顶有动静时停一停",
      quakeInterval: 9,
    },
    {
      kind: "goto", id: "c7_reach", zone: TF.cellHatch, objective: "摸到牢房地沿",
    },
    {
      // 木匠的手艺最后一次替爹用上：地沿的木板是从上面钉死的
      kind: "hold", id: "c7_pry", zone: TF.cellHatch, holdTime: 3, stroke: "up", gestureY: 1.9, holdPrompt: "按住 E · 撬",
      objective: "地沿的木板从上面钉死了", hint: "爹的凿子，他一直带在身上",
      note: "凿刃咬进钉缝，一下，一下。木板松了。",
    },
    {
      kind: "cinematic", id: "c7_sister",
      lines: [
        { stage: "地沿的木板被顶开一条缝。霉味和哭声一起漏下来。", d: 4.0, cam: { kind: "shot", x: 162, y: UNDER_Y + 1.8, dist: 7 } },
        { stage: "民兵一个个往下接人。柱子在人堆里看见了妹妹。", d: 4.0, cam: { kind: "shot", x: 160, y: UNDER_Y + 1.4, dist: 8 },
          on: (state) => {
            for (let i = 0; i < 3; i += 1) {
              state.actors.push(MakeActor(`freed${i}`, "villager", 160 - i * 1.2, {
                level: "under", scripted: true, cineTarget: { x: 14 }, cineSpeed: 1.7 + i * 0.25, cineVanish: true,
              }));
            }
          } },
        { stage: "妹妹瘦得脱了相。她抓住柱子的袖子。", d: 3.6, cam: { kind: "insert", x: 161, y: UNDER_Y + 1.0, dist: 2.2 },
          on: (state) => { AttachSister(state); } },
        // 正反打：问 → 不答 → 明白
        { who: "妹妹", say: "哥，娘呢？", d: 3.0, cam: { kind: "ots", subject: "sister", other: "player", dist: 3.2 } },
        { stage: "柱子没有说话。", d: 3.0, cam: { kind: "ots", subject: "player", other: "sister", dist: 3.2 } },
        { stage: "妹妹看着哥哥的眼睛，慢慢松开了手，又慢慢把额头抵在他肩上。", d: 5.0, cam: { kind: "ots", subject: "sister", other: "player", dist: 3.0 },
          on: (state) => {
            const sister = FindActor(state, "sister");
            if (sister) { sister.pose = "leanIn"; sister.x = state.player.x + 0.42; sister.heading = -1; }
            state.player.pose = "shelter";
          } },
        { stage: "她明白了。", d: 2.8, cam: { kind: "close", on: "sister", dist: 3.4 } },
      ],
      onDone: (state) => { AttachSister(state); },
    },
    {
      kind: "escort", id: "c7_out", follower: "sister", dest: TF.fieldEnt,
      objective: "带妹妹沿地道撤到地里入口", hint: "路已经打通了，往西走",
    },
    {
      kind: "cinematic", id: "c7_turn",
      lines: [
        { stage: "入口上面就是庄稼地，就是活路。", d: 3.2, cam: { kind: "shot", x: 14, y: -0.6, dist: 8 },
          on: (state) => {
            // 交灯这场戏的人得在画面里：高传宝、报信民兵、接妹妹的大娘
            state.actors.push(
              MakeActor("gao", "militia", 17, { level: "under", label: "高传宝", heading: -1 }),
              MakeActor("aunt2", "villager", 11, { level: "under", label: "大娘", heading: 1 }),
              MakeActor("msg", "militia", 30, {
                level: "under", cineTarget: { x: 20 }, cineSpeed: 3.4, heading: -1,
              }),
            );
          } },
        { stage: "一个民兵跌跌撞撞从地道里追出来。", d: 3.2, cam: { kind: "shot", x: 22, y: UNDER_Y + 1.4, dist: 8 } },
        { who: "民兵", say: "还有人没出来！东边旁洞里，还有几个乡亲！", d: 4.0, cam: { kind: "ots", subject: "msg", other: "player", dist: 3.6 } },
        { stage: "头顶上，搜查的脚步声越来越密。", d: 3.4, cam: { kind: "shot", x: 16, y: -0.4, dist: 9 } },
      ],
    },
    {
      // 全篇的顶点，原来是十行过场：松手、接灯、转身，都由脚本替他做了。
      // 那两句"妹妹就在眼前……可旁洞里那几个人也在等"更是把两难替玩家想完了。
      // 现在两句删掉，操作交还回去——出口就在头顶、完全通着、没有任何东西拦你，
      // 妹妹还牵在手里。要回去，得他自己先松开手。
      kind: "actSeq", id: "c7_turn2",
      objective: "该走了",
      hint: "妹妹还牵着你的手。上面就是庄稼地",
      steps: [
        {
          x: 12.6, level: "under", prompt: "E · 松开手",
          toast: "柱子把妹妹的手放进大娘手里。",
          on: (state) => {
            const sister = FindActor(state, "sister");
            if (sister) { sister.following = false; sister.cineTarget = { x: 11.4 }; sister.cineSpeed = 1.2; }
            const gao = FindActor(state, "gao");
            if (gao) { gao.cineTarget = { x: 15.4 }; gao.cineSpeed = 1.0; }
          },
        },
        {
          x: 15.4, level: "under", prompt: "E · 接过灯",
          on: (state) => { state.player.lamp = true; },
        },
        { x: 22, level: "under", walk: true },
      ],
      onDone: (state) => { StartRescueLoop(state); },
    },
    {
      kind: "rescueLoop", id: "c7_rescue",
      objective: "把旁洞里的乡亲全部带出去（3 处）",
      hint: "灯照多远，路就有多远。招呼乡亲跟上，送到地里入口再回去",
      resetHint: "土又塌了一截。民兵把人拉了回来，重新探路。",
    },
    {
      kind: "cinematic", id: "c7_done",
      lines: [
        { stage: "最后一个乡亲被推出洞口的时候，东边天已经泛白。", d: 4.2, cam: { kind: "shot", x: 14, y: 0.5, dist: 10 },
          on: (state) => {
            // 上到地表收尾：这几个镜头拍的是田埂上的天亮
            state.player.level = "surface";
            state.player.x = 13;
            state.player.cineWalk = { x: 16, speed: 0.9 };
            for (let i = 0; i < 4; i += 1) {
              state.actors.push(MakeActor(`dawn${i}`, "villager", 8 + i * 2.4, { heading: 1 }));
            }
            state.player.lamp = true;
          } },
        { stage: "人数了三遍。一个不少。", d: 3.4, cam: { kind: "shot", x: 12, y: 1.0, dist: 8 } },
        { stage: "柱子坐在田埂上，灯芯已经烧到了头。", d: 3.8, cam: { kind: "insert", x: 16.4, y: 1.0, dist: 2.2 } },
        { stage: "他把灯吹灭了。", d: 2.6, cam: { kind: "close", on: "player", dist: 3.4 },
          on: (state) => { state.player.lamp = false; } },
        { stage: "天亮了。", d: 4.6, cam: { kind: "wide", x: 40, y: 2.6, pan: 8 },
          on: (state) => { state.lightOverride = "dawn"; } },
      ],
    },
  ];
}
