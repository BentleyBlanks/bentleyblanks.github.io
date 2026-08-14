// 第五章节拍表（SCRIPTS.c5，2026-08-15 从 Script_Core.mjs 按章拆出）。
// 工厂而不是裸数组：节拍里用到的 Core 帮手由 Core 组装 SCRIPTS 时整包递进来
// （下面一行解构还原成裸名字，正文与拆前逐字相同），所以本文件不 import
// Script_Core、没有循环依赖。新用到 Core 的东西：解构清单加名字，Core 末尾的
// SCRIPT_KIT 也加一笔——漏了是当场的 ReferenceError，不会静默出错。
export function ChapterC5(K) {
  const {
    FindActor, MakeActor, SpawnC5Snoops, SpawnSurfaceSearch, StartDrillSmoke, TV, UNDER_Y,
  } = K;
  return [
    {
      kind: "cinematic", id: "c5_open",
      lines: [
        { stage: "东口封死了。第二天起，全村轮班下洞。", d: 3.6, cam: { kind: "wide", x: 90, y: -1.2 } },
        { stage: "高传宝在门板上画了三个记号：翻口，新暗口，预警铃。", d: 4.0, cam: { kind: "shot", x: 40, y: UNDER_Y + 1.4, dist: 8 } },
        { stage: "柱子的墨斗和刨子，成了地道里的家伙什。", d: 3.6, cam: { kind: "shot", x: 40, y: UNDER_Y + 1.4, dist: 6.5 } },
        // 双层潜行的题面：改造缺的东西全在地表，地表有人。
        // 剖面视角的独门好处在这一章兑现——从地下看地上，一清二楚
        { stage: "白天，两个伪军就在村里翻翻捡捡地转。头顶的脚步，地道里听得一清二楚。", d: 4.4, cam: { kind: "wide", x: 90, y: -1.2, pan: 5 },
          on: (state) => { SpawnC5Snoops(state); } },
        { who: "高传宝", say: "缺什么，上去拿。什么时候上去，你们自己看。", d: 3.8, cam: { kind: "ots", subject: "gao", other: "player", dist: 3.6 } },
      ],
    },
    {
      // 翻口是真实冀中地道的三防正解：把这一段挖成 U 形的弯，弯里存住水，
      // 就是一道水封，烟和水都过不去。人猫着腰从水里钻过去。
      kind: "chain", id: "c5_trap",
      objective: "改造一：挖翻口，灌上水", hint: "挖成下沉的弯，弯里存住水。水在地表的井里",
      resetHint: "上面的伪军看见了人影。柱子缩回洞里，等他转过身去。",
      steps: [
        // 挖翻口的位置，就是大爷和顺子没出来的位置。先把烟袋拾起来，再动土——
        // 两章之间的账，用一个弯腰接上，不用字幕
        { type: "use", zone: TV.trapSpot, prompt: "E · 拾起烟袋",
          note: "拴柱大爷的烟袋躺在土里，锅底烧穿了一个洞。柱子把它揣进怀里，抄起了锹。" },
        { type: "use", zone: TV.trapSpot, hold: 3, stroke: "down", prompt: "按住 E · 挖翻口",
          note: "弯挖出来了。可干弯挡不住烟——得灌上水。" },
        { type: "pickup", x: 30, level: "under", item: { id: "bucket2", label: "空桶" }, prompt: "E · 拎起空桶" },
        // 头顶上有伪军在转：**同样四道手，但每一道都短**（haste）。这一口井的
        // 戏在"什么时候敢露头"，不在打水本身；照 c1 的分量摇，等于逼玩家在
        // 巡逻的眼皮底下站两分钟
        { type: "winch", zone: TV.wellTop, needs: "bucket2", needsLabel: "空桶", haste: true,
          transform: { id: "fullBucket2", label: "满桶水", big: true },
          note: "桶沉了。上面还有人在转——挑好下去的时候。" },
        { type: "use", zone: TV.trapSpot, needs: "fullBucket2", hold: 1, stroke: "down", prompt: "按住 E · 灌水",
          note: "水面在弯底晃了晃，定住了。翻口成了。",
          effect: (state) => { state.flags.trapBuilt = true; } },
      ],
    },
    {
      // 门板＋狗：C2 的回call。这条道要真的「暗」，先得让狗闭嘴
      kind: "chain", id: "c5_hidden",
      objective: "改造二：新暗口", hint: "新口开在西头第三家的猪圈底下。口上得盖块门板",
      resetHint: "差点撞上翻查的伪军。退回地道，重新等空当。",
      steps: [
        { type: "use", zone: TV.hiddenSpot, hold: 3, stroke: "down", prompt: "按住 E · 掏暗口",
          note: "口子掏通了，就差个盖。挖出来的土，天不亮就得摊进麦地。" },
        { type: "pickup", x: 62, level: "under", item: { id: "bun2", label: "窝头" }, prompt: "E · 拿个窝头" },
        { type: "use", zone: TV.dogPen, needs: "bun2", prompt: "E · 丢给狗",
          note: "猪圈的狗埋头去啃。它不叫，这条道才算真的暗。",
          effect: (state) => { state.flags.dogFed2 = true; } },
        { type: "pickup", x: 26, item: { id: "plank", label: "门板", big: true }, prompt: "E · 卸下门板" },
        { type: "use", zone: TV.hiddenSpot, needs: "plank", hold: 1.2, stroke: "down", prompt: "按住 E · 盖上门板",
          note: "口子盖严了。上头是猪食槽，谁也不会去翻。",
          effect: (state) => { state.flags.hiddenBuilt = true; } },
      ],
    },
    {
      kind: "chain", id: "c5_bell",
      objective: "改造三：预警铃", hint: "铃铛挂在磨盘边的骡套上，麻绳在藏人洞乙",
      resetHint: "东头的伪军回过头来。柱子缩回了洞里。",
      steps: [
        { type: "pickup", x: 56, level: "under", item: { id: "rope2", label: "麻绳" }, prompt: "E · 取下麻绳" },
        { type: "use", zone: TV.bellSpot, needs: "rope2", hold: 1, stroke: "circle", gestureY: 1.6, prompt: "按住 E · 拴上梁",
          note: "绳头从东口的顶木上垂下来，就差铃了。" },
        { type: "pickup", x: 148, item: { id: "bell", label: "铃铛" }, prompt: "E · 摘下铃铛" },
        { type: "use", zone: TV.bellSpot, needs: "bell", hold: 1, stroke: "circle", gestureY: 1.6, prompt: "按住 E · 拴好铃",
          note: "指头一拨，铃舌轻轻一响。东口一动，全村先知道。",
          effect: (state) => { state.flags.bellBuilt = true; } },
      ],
    },
    {
      kind: "cinematic", id: "c5_alarm",
      lines: [
        { stage: "没过几天，鬼子又来了。还是老一套：堵口，灌烟。", d: 3.8, cam: { kind: "shot", x: 144, y: -0.6, dist: 13 },
          on: (state) => { SpawnSurfaceSearch(state, 146); } },
      ],
      onDone: (state) => { StartDrillSmoke(state); },
    },
    {
      kind: "smokeEscape", id: "c5_drill", dest: TV.behindTrap,
      objective: "铃响了——赶在烟到翻口之前，把人带到弯后面",
      hint: "把人带到翻口后面去。别走西口，鬼子早就盯上它了",
      resetHint: "烟追上了人。再来——这一回，地道听你们的。",
    },
    {
      kind: "cinematic", id: "c5_test",
      lines: [
        { stage: "烟堵在弯里，一夜没退。地面上，什么也看不出来。", d: 4.0, cam: { kind: "shot", x: 112, y: 0.4, dist: 11 } },
        { stage: "鬼子在村里翻到天黑，一个人也没找到。", d: 3.8, cam: { kind: "wide", x: 90 } },
        { stage: "撤下来的时候，一个年轻民兵被塌下的土石压住了腿。", d: 4.2, cam: { kind: "shot", x: 70, y: UNDER_Y + 1.4, dist: 7 },
          on: (state) => {
            // 这场戏原来一个人都没有——柱子和民兵全靠字幕存在。说到谁，谁就得在画面里
            if (!FindActor(state, "pinned")) {
              state.actors.push(MakeActor("pinned", "militia", 70, {
                level: "under", heading: -1, label: "年轻民兵",
              }));
            }
            state.player.level = "under";
            state.player.x = 72.4;
            state.player.heading = -1;
          } },
        { stage: "鬼子的探杆就在头顶上戳。谁也不敢出声。", d: 3.8, cam: { kind: "shot", x: 70, y: -1.0, dist: 9 } },
      ],
    },
    {
      // 大纲写的是"柱子第一次看见，这条通往妹妹的路，也有人在用命守着"。
      // 那句话不能由旁白说——得让玩家自己去刨那堆土，刨到时间用完为止。
      // 清不完不是手慢：探杆一次比一次密，你每次都得停手。
      kind: "doomedHold", id: "c5_pinned", duration: 11, cap: 0.8,
      probe: { from: 5.2, to: 2.6 },
      failToast: "土太深了。他的腿还在下面。",
      onStart: (state) => {
        state.player.level = "under";
        state.player.x = 72.2;
        state.player.heading = -1;
        const pinned = FindActor(state, "pinned");
        if (pinned) { pinned.x = 70.4; pinned.heading = 1; }
      },
      objective: "把压住他腿的土清开",
      hint: "一下一下清土。探杆到头顶上的时候必须停手",
      prompt: "按住 E · 清土",
      onFail: (state) => {
        const pinned = FindActor(state, "pinned");
        if (pinned) pinned.heading = 1;
      },
    },
    {
      kind: "cinematic", id: "c5_gun",
      lines: [
        { stage: "那只手从土里伸出来，把柱子推开了。", d: 3.6, cam: { kind: "insert", x: 70.6, y: UNDER_Y + 0.9, dist: 2.4 } },
        { stage: "他把手里的枪递出去，朝洞外摆了摆手。", d: 4.2, cam: { kind: "shot", x: 70, y: UNDER_Y + 1.3, dist: 5.5 } },
        { who: "年轻民兵", say: "带乡亲们走。", d: 3.0, cam: { kind: "ots", subject: "pinned", other: "player", dist: 3.4 } },
        // 柱子的反应镜头：这场戏此前完全没有他，看完像是别人的事
        { stage: "", d: 2.6, cam: { kind: "ots", subject: "player", other: "pinned", dist: 3.2 } },
        // 落幕的那一记黑：没有字、没有声，一秒多就够——空着的黑屏是标点，不是一场戏
        { d: 1.2, cam: { kind: "dark" } },
      ],
    },
  ];
}
