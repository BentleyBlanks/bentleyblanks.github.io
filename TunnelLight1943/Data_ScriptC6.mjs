// 第六章节拍表（SCRIPTS.c6，2026-08-15 从 Script_Core.mjs 按章拆出）。
// 工厂而不是裸数组：节拍里用到的 Core 帮手由 Core 组装 SCRIPTS 时整包递进来
// （下面一行解构还原成裸名字，正文与拆前逐字相同），所以本文件不 import
// Script_Core、没有循环依赖。新用到 Core 的东西：解构清单加名字，Core 末尾的
// SCRIPT_KIT 也加一笔——漏了是当场的 ReferenceError，不会静默出错。
export function ChapterC6(K) {
  const {
    F, SpawnFortPatrols,
  } = K;
  return [
    {
      kind: "cinematic", id: "c6_open",
      lines: [
        { stage: "押送定在后天。据点里外都加了岗。", d: 3.4, cam: { kind: "wide", x: 170 } },
        { stage: "高传宝的法子是两头一起动：地面上打出动静把人引开，地下从地道把乡亲接走。", d: 4.8, cam: { kind: "wide", x: 90, pan: -6 } },
        { stage: "高传宝把柱子叫住，让他先去看清楚。", d: 3.2, cam: { kind: "ots", subject: "gao", other: "player", dist: 3.4 } },
      ],
      onDone: (state) => { SpawnFortPatrols(state, true); },
    },
    {
      kind: "observe", id: "c6_scout", spots: [F.obsWest, F.obsEast], watchTime: 4,
      objective: "记下加岗后的巡逻路数（两处观察点）",
      hint: "换岗的空当很短，看准了再记",
      resetHint: "差一点被发现。柱子把心跳按下去，重新贴回土里。",
      notes: [
        "南门加了双岗，但换岗还是背对庄稼地。",
        "牢房外多了一个游动哨。门里那辆骡车还拴在原处，车辕上一直空着。",
      ],
      watchCine: [
        [{ stage: "南门加了双岗。换岗的时候，背还是朝着庄稼地。", d: 3.8, cam: { kind: "insert", x: 172, y: 2.2, dist: 5.5 } }],
        [{ stage: "牢房外多了一个游动哨，绕到北墙要一袋烟的工夫。", d: 3.8, cam: { kind: "insert", x: 192, y: 1.6, dist: 6 } },
         // 押送的日子一推再推，车却始终没套——第六章的推理就架在这两条上
         { stage: "那辆骡车还拴在原处。车辕上一直空着。", d: 3.8, cam: { kind: "insert", x: 190, y: 1.0, dist: 3.2 } }],
      ],
    },
    {
      // 原来这里是个走过去就过的 goto。可"这是个套"这个结论，此前是旁白直接
      // 说给玩家听的——玩家自己一次都没推出来过。材料其实早就在手里：第三章
      // 观察和问乡亲收集的 note 都存在 flags.notesSeen 里，只是弹了个 toast 就没了。
      // 现在把它们一条条钉上门板，让两条对不上的线自己现形。
      // 漏看观察点的玩家凑不齐这两条，也就推不出来——侦查这才有代价。
      kind: "mapBoard", id: "c6_report", zone: F.campTable,
      objective: "回歇脚点，把看到的钉在门板上",
      hint: "柱子用木匠画线的手，把据点画在了门板上。一条条钉上去",
      // 这两条互相矛盾：日子一天天往后推，车却从来没套过
      contradiction: ["骡车", "押人"],
      deduction: "要往县里押人的话传了一遍又一遍，可拴在门里的那辆骡车，一直没套。",
    },
    {
      // 推出来与没推出来，是两场不同的戏。玩家漏了观察点就凑不齐那两条，
      // 只能听高传宝把答案说出来——那一刻的失落，正是"侦查有代价"该有的样子。
      kind: "cinematic", id: "c6_brief", dynamicLines: (state) => (
        state.flags.deduced
          ? [
            { who: "高传宝", say: "你说说看。", d: 2.6, cam: { kind: "ots", subject: "gao", other: "player", dist: 3.4 } },
            { stage: "柱子指了指门板上钉在一起的那两条。", d: 3.4, cam: { kind: "ots", subject: "player", other: "gao", dist: 3.2 } },
            { stage: "屋里安静了一会儿。", d: 2.8, cam: { kind: "shot", x: 8, y: 1.2, dist: 6.5 } },
            { who: "高传宝", say: "套是套。人，也是真的人。", d: 3.4, cam: { kind: "ots", subject: "gao", other: "player", dist: 3.4 } },
          ]
          : [
            { who: "高传宝", say: "你说说看。", d: 2.6, cam: { kind: "ots", subject: "gao", other: "player", dist: 3.4 } },
            { stage: "柱子说不上来。", d: 2.6, cam: { kind: "ots", subject: "player", other: "gao", dist: 3.2 } },
            { stage: "高传宝在门板上把日子和那辆骡车圈到了一起。", d: 4.0, cam: { kind: "insert", x: 8, y: 1.3, dist: 2.6 } },
            { who: "高传宝", say: "他们要的不是这十几个乡亲。是来救乡亲的人。", d: 4.2, cam: { kind: "ots", subject: "gao", other: "player", dist: 3.4 } },
            { who: "高传宝", say: "套是套。人，也是真的人。", d: 3.4, cam: { kind: "ots", subject: "gao", other: "player", dist: 3.4 } },
          ]
      ),
    },
    {
      // 历史梗：一挂鞭炮在铁桶里炸，一里外听着就是机枪。
      // 单格物品栏的教学在这儿反着用一次——两样东西，得跑两趟
      kind: "chain", id: "c6_prep",
      objective: "给佯动组备家伙：铁桶里的鞭炮", hint: "鞭炮和铁桶都在歇脚点，村北土坎上会合",
      steps: [
        { type: "pickup", x: 16, item: { id: "firecracker", label: "一挂鞭炮" }, prompt: "E · 拿上鞭炮" },
        { type: "use", zone: F.northBank, needs: "firecracker", prompt: "E · 搁下鞭炮" },
        { type: "pickup", x: 26, item: { id: "tin", label: "铁皮桶", big: true }, prompt: "E · 扛起铁桶" },
        { type: "use", zone: F.northBank, needs: "tin", prompt: "E · 架好桶" },
        { type: "use", zone: F.northBank, hold: 2, stroke: "circle", gestureY: 0.8, prompt: "按住 E · 装引信",
          note: "鞭炮盘进桶底，引信探出来。夜里一点，就是一挺『机枪』。" },
      ],
    },
    {
      // 大纲写的是"地面制造声势 + 地下进人"同时发生，不是二选一。
      // 所以选的不是打法，是柱子站在哪一边。
      kind: "choice", id: "c6_plan",
      prompt: "两路都得有人。高传宝看着柱子：你跟哪一路？",
      options: [
        { key: "ground", label: "跟地面佯动组", detail: "在村北打枪、点火、把巡逻往外扯——动静大，撤下来的路全在明处。" },
        { key: "tunnel", label: "跟地下接应组", detail: "在地道里掏最后一段、接人、往回带——慢，土层不稳，但乡亲们能从地下走。" },
      ],
      objective: "定下自己跟哪一路",
    },
    {
      kind: "cinematic", id: "c6_eve",
      lines: [
        { stage: "行动前夜。油灯把门板图照得发黄。", d: 3.6, cam: { kind: "shot", x: 7, y: 1.2, dist: 6.5 } },
        { stage: "柱子站在图前，指着据点的方向。", d: 3.2, cam: { kind: "shot", x: 8, y: 1.2, dist: 5.5 } },
        { who: "柱子", say: "我去。", d: 2.4, cam: { kind: "ots", subject: "player", other: "gao", dist: 3.2 } },
        { stage: "高传宝看了他一眼。没有劝。", d: 3.0, cam: { kind: "shot", x: 6.5, y: 1.2, dist: 4.8 } },
        { who: "高传宝", say: "跟紧队伍。", d: 2.6, cam: { kind: "ots", subject: "gao", other: "player", dist: 3.4 } },
      ],
    },
  ];
}
