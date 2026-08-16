// 第二章节拍表（SCRIPTS.c2，2026-08-15 从 Script_Core.mjs 按章拆出）。
// 工厂而不是裸数组：节拍里用到的 Core 帮手由 Core 组装 SCRIPTS 时整包递进来
// （下面一行解构还原成裸名字，正文与拆前逐字相同），所以本文件不 import
// Script_Core、没有循环依赖。新用到 Core 的东西：解构清单加名字，Core 末尾的
// SCRIPT_KIT 也加一笔——漏了是当场的 ReferenceError，不会静默出错。

// =========================================================================
// 第二章 · 地洞里的眼睛（2026-08-11 按 Notion「剧本新生」重写整章）
// **鬼子这回是冲着人来的**（2026-08-16 补）：第一章夜里柱子在自家窖里救的那个
// 伤员是北洼打散的八路，养了七天、第八天后半夜叫人接走了；十天后据点听说
// "有伤号窝在这一片"，梳篦式扫荡挨门挨户地篦——开场翻译官把这句喊出来，
// 玩家才知道自己躲的不是"运气不好"，是找上门来的。三处台词一条线，见 CLAUDE.md
// 「一二章共用一条明线：北洼那个带伤的八路」。
// 梳篦扫荡再次进村：带着妹妹和受伤的邻居躲进菜窖。黑暗里捂住妹妹的嘴，
// 听头顶的脚步与哭喊（恐惧走声音，不走画面）→伤员咳嗽的两难（冒险上去
// 舀水 / 让他咬布忍着——第一个道德困境，选哪边都不会导致暴露：窖口是
// 梳篦扫荡自己翻出来的，护送对象与伤员永不成为失败原因）→敌人发现窖口
// →墙角松土下挖出祖辈的旧防兵洞→窄道爬出脱险→七叔那句「光躲不行。
// 得想办法打。」→回望黑洞口：不是坟墓，是起点。
// 玩法承接（剧本新生§2）：声音侦测潜行（舀水支线）、时间敏感的选择、
// 发现隐藏路径（地道系统的概念从这儿开启——underDig 的两面旗在本章落）。
// =========================================================================
export function ChapterC2(K) {
  const {
    Cue, FindActor, FlashPose, GiveItem, IsEnemy, MakeActor, RAID_SPEED, RaidStartX,
    SpawnRaidSoldiers, SpawnSurfaceSearch, StartMicroCine, UNDER_Y,
  } = K;
  return [
    {
      kind: "cinematic", id: "c2_open", timeOfDay: "day", noDetect: true,
      lines: [
        // 正字特写照旧刻痕那一镜的配方（c1_measure ①）：贴着左立柱、
        // 打门洞里看——立面在画框外，柱面上的道道占满画
        { stage: "谷雨过了。门框上的正字，添到了第十三道。", d: 3.6,
          cam: { kind: "insert", x: 33.62, y: 0.76, dist: 0.95 },
          on: (state) => { state.beat.indoorScene = true; state.doorLeaf = null; } },
        // ── 2026-08-16 新增两行：第一章那个伤员的下落（用户：「第一章里的伤员
        // 也没有解释」）──────────────────────────────────────────────────────
        // 第一章末那一镜（地上妹妹的手腕、地下伤员的肩膀，两截同一块布）之后
        // 他再没出现过，中间隔着十天。不把这十天补上，本章两件事都悬着：
        // 这人后来怎么了、鬼子这回冲着什么来。所以先给一格**空草苫**：
        // 谁在这儿躺过（"瞒着妹妹"接第一章的章名《善意的谎言》）、他怎么走的、
        // 走的时候有人来接他——"两个不点灯的人"是章末七叔那句「光躲不行。
        // 得想办法打。」的伏笔：外头有队伍，柱子知道有。
        // **`insert` 的 dist 就是半宽**（HintShot：hw = dist，不折算）——头一版
        // 照 c2 别处那样写 2.6，画宽就是 5.2m：草苫在画里只占一小块，那一格
        // 读出来是"窖里堆着些家什"，"空了"这句话没有主语。收到 1.5＝画宽 3m，
        // 与第一章拍伤员那一格（CINE 画宽 2.9）同档
        { stage: "窖里那个人，柱子瞒着妹妹，养了七天。", d: 3.6,
          cam: { kind: "insert", x: 27.45, y: UNDER_Y + 0.40, dist: 1.5 } },
        // 草苫上只剩那块撕剩的蓝花布（wholeClothRest，第一章撕布之后重烘的
        // 半块——StartChapter 的 index===1 特意把 manFound/clothTorn 立成 true，
        // 就为着这一格；从章节菜单直进第二章也得看得见它）
        { stage: "第八天后半夜来了两个不点灯的人，把他背走了。草苫上只剩那半块布。", d: 4.6,
          cam: { kind: "insert", x: 27.9, y: UNDER_Y + 0.52, dist: 2.1 } },
        { stage: "这天晌午，村东头的乌鸦轰的一声全飞起来了。", d: 3.2,
          cam: { kind: "shot", x: 120, y: 2.2, dist: 9 },
          on: (state) => {
            Cue(state, "flutter", { gain: 0.9 });
            Cue(state, "flutter", { gain: 0.7, delay: 0.7 });
          } },
        { stage: "鬼子又进村了。这一回是梳篦式的——一条街一条街，一户不落。", d: 5.0,
          cam: { kind: "shot", x: 130, y: 1.8, dist: 10, pan: -8 },
          on: (state) => {
            SpawnRaidSoldiers(state);
            // 点户的伪保长又打头来了——梳篦扫荡照册子篦，名册还在他手上
            state.actors.push(
              MakeActor("baozhang", "puppet", RaidStartX("traitor") + 1.4,
                { label: "伪保长", decor: true, carry: "名册", heading: -1 }),
            );
            Cue(state, "motorPutt", { gain: 0.55 });
            // 整支队伍压进东街：从村东口一路往西碾。真参与判定的两个兵
            // 收了巡逻，先跟着队伍走——判定到舀水支线才开考
            for (const a of state.actors) {
              if (!(IsEnemy(a) || a.id === "officer")) continue;
              a.patrol = null;
              a.x -= 46;
              a.heading = -1;
              if (a.pinTo) continue;
              a.cineTarget = { x: a.x - 20 };
              a.cineSpeed = RAID_SPEED;
            }
          } },
        // ── 2026-08-16 新增三行：太君进村是**冲着人来的**（用户：「太君突然
        // 出现的目的没有简单的解释」）──────────────────────────────────────
        // 原来这一段只说了"怎么搜"（梳篦式、一条街一条街、一户不落），没说
        // "搜什么"——于是一支队伍无缘无故开进村，玩家只能当成"鬼子就是会来"。
        // **日军讲日语无字幕**（全作铁律），所以这件事只能由本乡人说出口：
        // 保长照名册点户、翻译官递上头的话。两句就够，而且两句都接着第一章
        // 七叔那段传言（北洼、带伤的），第三句把代价说明白——1942-43 治安强化
        // 运动里"窝藏连坐"是写在告示上的，不是我们编的威胁。
        { who: "伪保长", say: "挨门挨户地查——屋里的都给我出来！", d: 3.2,
          cam: { kind: "shot", x: 109.8, y: 1.5, dist: 6.6 },
          on: (state) => {
            // **整队站住，不是抽三个人出来站住**（第一版就是这么错的：单钉
            // 保长/翻译官/摩托，其余照走，五秒后日军头一排就越过了摩托——
            // TestConvoyKeepsFormation 当场红，"徒步的永远不许超过车"）。
            // 喊话本来就该是全队顿一下：队伍停在街心，保长扯着嗓子点户。
            // 站位按**队序表**重铺一遍（RaidStartX − BASE），队形分毫不动，
            // 玩家中途跳过上一行也一样对得上
            const BASE = 56.6;   // 46（进场偏移）+ 上一行 5 秒 × RAID_SPEED
            for (const a of state.actors) {
              if (!(IsEnemy(a) || a.id === "officer")) continue;
              a.cineTarget = null;
              if (a.pinTo) continue;   // 军官坐在挎斗里，跟着摩托走
              // 保长不在队序表里（他是本村的，跟着翻译官走）
              a.x = (a.id === "baozhang" ? RaidStartX("traitor") + 1.4 : RaidStartX(a.id)) - BASE;
              a.heading = -1;
            }
            Cue(state, "shout", { gain: 0.7 });
          } },
        // 翻译官 108.2 / 保长 109.6 / 挎斗连军官 110.2：这一格里喊话的人在前，
        // 太君坐在他背后的斗里——「谁要的」跟「谁在喊」同框
        { who: "翻译官", say: "北洼跑掉那个带伤的八路，就窝在这一片。", d: 4.0,
          cam: { kind: "shot", x: 109.2, y: 1.45, dist: 5.0 } },
        { who: "翻译官", say: "查出窝藏的，一家连坐。", d: 3.2,
          cam: { kind: "shot", x: 109.2, y: 1.45, dist: 5.0 },
          on: (state) => {
            // 喊完队伍接着往西碾（走位交还给 cineTarget，全队同速＝队形不散）
            for (const a of state.actors) {
              if (!(IsEnemy(a) || a.id === "officer") || a.pinTo) continue;
              a.cineTarget = { x: a.x - 20 };
              a.cineSpeed = RAID_SPEED;
            }
          } },
        // 这一格是把两条线接上的那一下：他听得懂那句话说的是谁。
        // 「他知道」这三个字必须给——玩家这会儿才刚补完那十天，不点一句，
        // 后头捂嘴、抉择、被翻出窖口全是"运气不好"，而不是"找上门来了"
        { stage: "柱子攥着门框，没有动。他知道他们找的是谁。", d: 3.6,
          cam: { kind: "shot", x: 34.2, y: 1.05, dist: 4.4 },
          on: (state) => {
            state.player.x = 33.9;
            state.player.heading = 1;      // 朝村东——喊话是从那头压过来的
          } },
        { stage: "跑不赢了。街上已经过不去人。", d: 3.0,
          cam: { kind: "shot", x: 62, y: 1.6, dist: 8 },
          on: (state) => {
            // 七叔扶着田大爷，刘嫂在后头，往柱子家赶——东头过不去，
            // 全村人都知道梁家有窖
            const P = (id, x, tx, sp) => {
              const a = FindActor(state, id);
              if (a) { a.visible = true; a.x = x; a.heading = -1; a.cineTarget = { x: tx }; a.cineSpeed = sp; }
            };
            P("qishu", 54, 40.5, 2.2);
            P("tianYe", 55.2, 41.8, 1.35);
            P("liusao", 56.4, 43.0, 1.8);
            Cue(state, "knock", { gain: 0.7, delay: 1.2 });
          } },
        { who: "七叔", say: "柱子！开窖口！", d: 2.8,
          cam: { kind: "shot", x: 42, y: 1.4, dist: 6 },
          on: (state) => {
            state.player.cineWalk = { x: 36.4, speed: 2.6 };
            const sis = FindActor(state, "sister");
            if (sis) { sis.cineTarget = { x: 35.2 }; sis.cineSpeed = 2.6; }
          } },
      ],
    },
    {
      // 第一场（玩法）：带大家下窖。掀盖板→乡亲们下去→自己带妹妹下去→
      // 从里头把盖板拉严。没有倒计时：紧迫感全在东头越来越近的动静里。
      kind: "chain", id: "c2_shelter", timeOfDay: "day", indoorScene: true, noDetect: true,
      objective: "带大家下窖", hint: "先掀盖板；人都下去了，再从里头拉严",
      onStart: (state) => {
        state.player.cineWalk = null;
        const sis = FindActor(state, "sister");
        if (sis) { sis.cineTarget = null; sis.x = 35.2; sis.following = true; }
        // 篦子往西头压过去了：两个真判定的兵也跟着去村西——
        // 不清走的话他们停在院门口罚站，一家人当着兵的面掀盖板下窖
        for (const [id, px] of [["raid1", 14], ["raid2", 8]]) {
          const a = FindActor(state, id);
          if (a) { a.cineTarget = null; a.x = Math.min(a.x, 24); a.patrol = [4, px + 8]; a.speed = 1.1; a.heading = -1; }
        }
      },
      tick: (state) => {
        const b = state.beat;
        b.poundT = (b.poundT || 0) + 1 / 60;
        if (b.poundT > 6) { b.poundT = 0; Cue(state, "knock", { gain: 0.8 }); }
      },
      steps: [
        { type: "use", zone: { x: 29, w: 2.9 }, prompt: "E · 掀开盖板",
          effect: (state) => {
            Cue(state, "doorCreak", { gain: 0.8 });
            StartMicroCine(state, [
              { stage: "", d: 2.4, cam: { kind: "shot", x: 30.2, y: 1.2, dist: 4.6, trans: "dip" },
                on: (s) => {
                  // 黑场里下人：七叔先下，转身接田大爷；刘嫂殿后
                  const D = (id, x, h) => {
                    const a = FindActor(s, id);
                    if (a) { a.cineTarget = null; a.level = "under"; a.x = x; a.heading = h; }
                  };
                  D("qishu", 32.0, -1); D("tianYe", 30.8, 1);
                  const ls = FindActor(s, "liusao");
                  if (ls) { ls.cineTarget = { x: 29.6 }; ls.cineSpeed = 2.2; }
                } },
              { stage: "", d: 2.0, cam: { kind: "shot", x: 30.2, y: 1.15, dist: 4.2, trans: "dip" },
                on: (s) => {
                  const ls = FindActor(s, "liusao");
                  if (ls) { ls.cineTarget = null; ls.level = "under"; ls.x = 33.0; ls.heading = -1; }
                } },
            ]);
          } },
        { type: "goto", zone: { x: 30.4, w: 2.8, level: "under" } },
        { type: "use", zone: { x: 29, w: 2.9, level: "under" }, hold: 1.3, stroke: "up", gestureY: 1.5,
          prompt: "把盖板拉严 · 往上够",
          note: "盖板合严了。窖里只剩下喘气声。",
          effect: (state) => { state.flags.lidShut = true; Cue(state, "tenon", { gain: 0.8 }); } },
      ],
    },
    {
      // 第二场（玩法）：捂住妹妹的嘴。sustain 长按——量的是时间本身，
      // 长按在这儿是诚实的（CLAUDE.md 拟物交互第 2 条）。
      // 恐惧全部走声音：脚步、踹门、翻缸、远处的哭喊，一段一段从头顶碾过去。
      kind: "hold", id: "c2_hush", timeOfDay: "day", noDetect: true,
      zone: { x: 31.6, w: 3.4, level: "under" }, holdTime: 10, sustain: true,
      holdPose: "shelter",
      holdPrompt: "按住 E · 捂住妹妹的嘴",
      objective: "头顶有动静——捂住，别出声", hint: "手别松。妹妹比你还怕",
      note: "脚步声从头顶过去了。又回来。又过去。",
      onEnter: (state) => {
        // 窖里人的站位：挤在搁板下那一小片（场景数据留的就是这块空），
        // 全靠横向错位分人——**地下不许用 rank**：退一档深度会把人整个
        // 推到近侧剖面那刀土后面，画面上人间蒸发（实拍验过：田大爷和
        // 刘嫂就是这么没的）。
        // level/visible 在这儿兜底：下窖的走位演在 shelter 的微过场里，
        // 跳幕结算不重放台词 on()——不兜底，跳过来窖里就只有柱子一个人
        const S = (id, x, h, pose) => {
          const a = FindActor(state, id);
          if (a) {
            a.x = x; a.heading = h; a.pose = pose; a.rank = 0;
            a.cineTarget = null; a.level = "under"; a.visible = true;
          }
        };
        S("tianYe", 29.6, 1, "kneel");
        S("liusao", 30.4, 1, "kneel");
        S("qishu", 33.2, -1, "bow");
        const sis = FindActor(state, "sister");
        if (sis) {
          sis.following = false; sis.x = 31.15; sis.heading = 1; sis.pose = "leanIn";
          sis.level = "under"; sis.visible = true;
        }
        state.player.x = 31.6;
        state.player.heading = -1;
        // 头顶的搜查队：剖面招牌构图——上面在翻，下面在屏息。
        // 巡逻带收窄到窖口正上方那一片：默认那套带子太长，搜到两端时
        // 画框顶上那条地面里一个兵都没有，「头顶有动静」只剩音效
        SpawnSurfaceSearch(state, 31);
        const W = (id, x, p0, p1, sp) => {
          const a = FindActor(state, id);
          if (a) { a.x = x; a.patrol = [p0, p1]; a.speed = sp; }
        };
        W("srch1", 33, 27.5, 36, 0.9);
        W("srch2", 26, 24, 32.5, 1.15);
        W("srch3", 38, 33, 43, 1.0);
      },
      tick: (state, dt) => {
        const b = state.beat;
        b.hushT = (b.hushT || 0) + 1 / 60;
        // 捂着的那只手要一直落在妹妹身上：shelter 的搂臂顺着朝向伸，
        // 玩家从东边走进判定区时朝向还朝西——按住 E 的每一帧都把脸转向她
        if (state.player.pose === "shelter") {
          const sis = FindActor(state, "sister");
          if (sis) state.player.heading = sis.x <= state.player.x ? -1 : 1;
        }
        // 声音脚本：一段一段压过去（不循环，照 holdProgress 走到哪响到哪）
        const CUES = [
          [1.0, "step", 0.7, 1.0], [2.1, "step", 0.8, 0.95],
          [3.0, "knock", 1.1, 0.85], [4.1, "drop", 1.0, 0.8],
          [5.2, "sobBreath", 0.45, 1.0], [6.3, "step", 0.75, 0.9],
          [7.4, "knock", 0.9, 0.75], [8.6, "step", 0.6, 1.05],
        ];
        b.hushFired = b.hushFired || new Set();
        for (let i = 0; i < CUES.length; i += 1) {
          const [t, name, gain, rate] = CUES[i];
          if (b.hushT >= t && !b.hushFired.has(i)) {
            b.hushFired.add(i);
            Cue(state, name, { gain, rate });
          }
        }
        // 心跳：按住的时间越长，心跳越沉
        b.heartT = (b.heartT || 0) + dt;
        const beatEvery = 1.15 - 0.35 * (b.holdProgress / 10);
        if (b.heartT > beatEvery) {
          b.heartT = 0;
          Cue(state, "heartbeat", { gain: 0.32 + 0.2 * (b.holdProgress / 10) });
        }
      },
      onDone: (state) => {
        // 「脚步声过去了」得是真的：头顶那拨翻找的走人（往东出画）。
        // 不清场的话，舀水那一趟一冒头就撞在他们脚边——而且他们还站在
        // 自家盖板上，怎么掀（c2_found 那拨是折回来的新篦子）
        for (const id of ["srch1", "srch2", "srch3"]) {
          const a = FindActor(state, id);
          if (a) { a.patrol = null; a.cineTarget = { x: 120 }; a.cineSpeed = 1.8; a.cineVanish = true; a.heading = 1; }
        }
      },
    },
    {
      // 过场：伤员的咳压不住了。抉择的由头先演出来，再让玩家拿主意。
      kind: "cinematic", id: "c2_worse", timeOfDay: "day", noDetect: true,
      lines: [
        { stage: "田大爷胸口拉风箱似的响。他把咳压在嗓子眼里，压一下，抖一下。", d: 4.4,
          cam: { kind: "insert", x: 30.4, y: UNDER_Y + 0.75, dist: 2.6 },
          on: (state) => {
            // 换拍时 ClearPoses 把捂嘴那拍的姿势全抹了——整窖人重新钉一遍，
            // 不然除了田大爷全员站军姿。压咳要演出来：从跪坐弓下去
            const P = (id, pose, h) => {
              const a = FindActor(state, id);
              if (a) { a.pose = pose; if (h) a.heading = h; }
            };
            P("tianYe", "bow", 1);
            P("qishu", "bow", -1);
            const sis = FindActor(state, "sister");
            if (sis) { sis.x = 31.15; sis.heading = 1; sis.pose = "leanIn"; }
            state.player.heading = -1;
            Cue(state, "sobBreath", { gain: 0.5, rate: 1.5 });
            Cue(state, "sobBreath", { gain: 0.4, rate: 1.4, delay: 1.6 });
          } },
        { stage: "刘嫂把水葫芦倒过来。空的。", d: 3.0,
          cam: { kind: "insert", x: 30.9, y: UNDER_Y + 0.75, dist: 2.6 },
          on: (state) => {
            // 说到谁谁就得在画里：刘嫂挪到田大爷跟前，**手里得真有那只水葫芦**
            //（视觉审查退回过：说倒葫芦、演的是空手搀扶）。倒过来的动作
            // 由弓身+葫芦一起读——她俯身把葫芦口冲下比给大家看
            const ls = FindActor(state, "liusao");
            if (ls) { ls.x = 31.2; ls.heading = -1; ls.pose = "bow"; ls.carry = "水葫芦"; }
          } },
        { stage: "头顶的脚步还没走利索。可这咳，也压不了几响了。", d: 3.8,
          cam: { kind: "shot", x: 31.5, y: UNDER_Y + 1.3, dist: 5 },
          on: (state) => {
            // 收葫芦；全景里柱子与七叔别站成一对复制人——七叔转身望向窖口
            const ls = FindActor(state, "liusao");
            if (ls) { ls.carry = null; ls.pose = "kneel"; }
            const q = FindActor(state, "qishu");
            if (q) { q.pose = null; q.heading = -1; q.x = 32.8; }
            state.player.heading = 1;   // 柱子看着田大爷那头，与七叔一朝东一朝西
          } },
      ],
    },
    {
      // 第三场（玩法·抉择）：第一个道德困境。时间敏感的是处境不是倒计时——
      // 两边都是真代价：上去，是拿自己冒险；忍着，是拿别人的罪受换安稳。
      // 选哪边都不会导致暴露（窖口是梳篦扫荡自己翻出来的）：
      // 护送对象与伤员永不成为失败原因，这是全作铁律。
      kind: "choice", id: "c2_cough", timeOfDay: "day", flagKey: "coughChoice", noDetect: true,
      prompt: "水早见了底。是冒险上去舀水，还是让他咬着布忍？",
      options: [
        { key: "water", label: "上去舀水", detail: "扫荡队还在街上。贴着墙根到院里水缸，舀半瓢就回来。" },
        { key: "endure", label: "让他忍着", detail: "把布巾递过去让他咬住。眼下，一步都不能出这个窖。" },
      ],
      objective: "拿主意",
    },
    {
      // 抉择分支 A（玩法）：上去舀水。声音侦测潜行的第一课：蹲着走是静的，
      // 直着腰跑是响的；被灯照住不是死——缩回窖里，等脚步走远重来。
      kind: "chain", id: "c2_fetch", timeOfDay: "day",
      when: (state) => state.flags.coughChoice === "water",
      debugForce: (state) => { state.flags.coughChoice = "water"; },
      objective: "上去舀半瓢水，就回来", hint: "蹲着走。灯扫过来就贴住柴堆",
      resetHint: "灯扫着院子了。柱子缩回窖里，等脚步走远。",
      onDone: (state) => {
        // 瓢喝完收走（姿势由换拍的 ClearPoses 统一收）
        const ty = FindActor(state, "tianYe");
        if (ty) ty.carry = null;
      },
      onStart: (state) => {
        const sis = FindActor(state, "sister");
        if (sis) { sis.following = false; sis.pose = "leanIn"; }
        // 考场开张：一个兵在街东头来回，隔几步就停下回头扫——他的脸朝哪儿
        // 就是这条链的题面（回头那两秒多，就是过院子的窗口）。
        // 巡逻带东端顶在井台，西端离水缸七八米：读得出节奏就有得走，
        // 头铁直走的也能撞上他背身的那一程（可完成性铁律）
        const r2 = FindActor(state, "raid2");
        if (r2) {
          // 西端 48：舀水那一下他在画框里踱着（离缸 4.6m）——危险要看得见，
          // 只写在提示文案里等于没有（视觉审查退回过"空院舀水"）
          r2.cineTarget = null; r2.x = 54; r2.patrol = [48, 61]; r2.speed = 0.95;
          r2.scanEvery = 4.0; r2.scanHold = 2.4;
        }
        const r1 = FindActor(state, "raid1");
        if (r1) { r1.cineTarget = null; r1.x = 78; r1.patrol = [66, 92]; r1.speed = 1.2; }
      },
      steps: [
        { type: "use", zone: { x: 29, w: 2.9, level: "under" }, prompt: "E · 探听动静",
          note: "近处没脚步。就一趟——舀了就回。",
          effect: (state) => { Cue(state, "doorCreak", { gain: 0.5 }); } },
        { type: "goto", zone: { x: 30.2, w: 2.6 } },
        { type: "use", zone: { x: 43.4, w: 2.9 }, prompt: "E · 舀水",
          effect: (state) => {
            GiveItem(state, { id: "ladleWater", label: "半瓢水" });
            Cue(state, "waterSplash", { gain: 0.5 });
          } },
        { type: "goto", zone: { x: 30.4, w: 2.8, level: "under" } },
        { type: "use", zone: { x: 30.6, w: 2.9, level: "under" }, needs: "ladleWater", prompt: "E · 递过去",
          effect: (state) => {
            // 递过去＝瓢真的换手：柱子俯身递（闪姿盖满第一行），田大爷跪着
            // 捧瓢就嘴（clothMouth 的手在嘴边，瓢跟着手——"一口一口顺下去"）。
            // **姿势必须写在 effect 里**：微过场的行不执行 on()（引擎语义，
            // 上一版挂在行上等于没写，四个人站着干念字幕）
            const ty = FindActor(state, "tianYe");
            if (ty) { ty.carry = "半瓢水"; ty.pose = "clothMouth"; ty.heading = 1; }
            state.player.x = Math.min(state.player.x, 30.5);
            state.player.heading = -1;
            FlashPose(state, "bow", 3.2);
            StartMicroCine(state, [
              { stage: "水一口一口顺下去。咳，压住了。", d: 3.0,
                cam: { kind: "insert", x: 30.3, y: UNDER_Y + 0.75, dist: 2.6 } },
              { stage: "田大爷抬起眼皮看了看他，没说话。", d: 2.8,
                cam: { kind: "insert", x: 30.4, y: UNDER_Y + 0.85, dist: 2.4 } },
            ]);
          } },
        // 垫一步再收束：递水若是最后一步，AdvanceBeat 的 ClearPoses 会在
        // effect 摆完姿势的同一帧把它抹掉——微过场里四个人站着干念字幕
        //（实拍两轮都栽在这儿）。人本来就站在区里，微过场一完这步自动过
        { type: "goto", zone: { x: 30.4, w: 2.9, level: "under" } },
      ],
    },
    {
      // 抉择分支 B（过场）：让他忍着。没有解法的那一边也要给分量——
      // 咬布、憋咳、谁也不看谁。
      kind: "cinematic", id: "c2_endure", timeOfDay: "day", noDetect: true,
      when: (state) => state.flags.coughChoice !== "water",
      debugForce: (state) => { state.flags.coughChoice = "endure"; },
      lines: [
        { stage: "柱子把布巾叠成三折，递了过去。", d: 3.0,
          cam: { kind: "insert", x: 30.6, y: UNDER_Y + 0.8, dist: 2.6 },
          on: (state) => {
            // 布巾要真的在手上，人站到一臂之内（穿模与空手递被视觉审查退回过）
            state.player.item = { id: "cloth", label: "花布巾" };
            state.player.cineWalk = { x: 30.6, speed: 1.2 };
            // 妹妹让开刘嫂那条身位：叠在她正后方只露一条粉边，构图上等于没有
            const sis = FindActor(state, "sister");
            if (sis) { sis.x = 31.7; sis.heading = -1; sis.pose = "leanIn"; }
          } },
        { stage: "田大爷咬住。咳声闷在布里，一声，一声。", d: 4.0,
          cam: { kind: "insert", x: 30.0, y: UNDER_Y + 0.85, dist: 2.4 },
          on: (state) => {
            state.player.cineWalk = null;
            state.player.x = 30.6;
            state.player.heading = -1;
            state.player.item = null;
            // 「咬住」要发生在画面里：clothMouth 把布巾举到嘴上（布走 carry 的
            // 手挂点，手到嘴边布就到嘴边）。老版 bow+布在垂着的手里，
            // 布离嘴一条小臂远——视觉审查退回过
            const ty = FindActor(state, "tianYe");
            if (ty) { ty.carry = "花布巾"; ty.pose = "clothMouth"; ty.heading = 1; }
            Cue(state, "sobBreath", { gain: 0.4, rate: 1.5 });
            Cue(state, "sobBreath", { gain: 0.35, rate: 1.45, delay: 1.4 });
            Cue(state, "sobBreath", { gain: 0.3, rate: 1.5, delay: 2.7 });
          } },
        { stage: "妹妹把脸埋进柱子怀里。谁也没看谁。", d: 3.6,
          cam: { kind: "shot", x: 30.9, y: UNDER_Y + 1.05, dist: 3.2 },
          on: (state) => {
            // 埋进怀里＝一对姿势：她贴上来 leanIn，他蹲下去 shelter 兜住——
            // 老版她抱着刘嫂的腿、柱子空手站在一米外，字幕画面各说各的
            const sis = FindActor(state, "sister");
            if (sis) { sis.x = state.player.x + 0.32; sis.heading = -1; sis.pose = "leanIn"; }
            state.player.heading = 1;
            FlashPose(state, "shelter", 3.4);
          } },
      ],
    },
    {
      // 第四场：敌人发现窖口。千钧一发——柱子退到窖底最里头，
      // 脚跟碾着的那块土是松的。
      kind: "cinematic", id: "c2_found", timeOfDay: "day", noDetect: true,
      lines: [
        { stage: "头顶的脚步，忽然停在了屋当间。", d: 3.0,
          cam: { kind: "shot", x: 30, y: UNDER_Y + 1.2, dist: 5.5 },
          on: (state) => {
            // 折回来的一拨篦子：重新生成（上一拨在捂嘴那拍走干净了；
            // 同 id 的旧壳先清掉，FindActor 只认第一个）
            state.actors = state.actors.filter((a) => !a.id.startsWith("srch"));
            SpawnSurfaceSearch(state, 30);
            const S = (id, x) => {
              const a = FindActor(state, id);
              if (a) { a.patrol = null; a.cineTarget = { x }; a.cineSpeed = 1.6; }
            };
            S("srch1", 30.5); S("srch2", 28); S("srch3", 33);
            Cue(state, "step", { gain: 0.8 });
          } },
        { stage: "枪托笃、笃地砸着地。砸到窖口那一下——声音是空的。", d: 3.8,
          cam: { kind: "insert", x: 29, y: UNDER_Y + 2.1, dist: 3.4 },
          on: (state) => {
            Cue(state, "knock", { gain: 1.2, rate: 0.8 });
            Cue(state, "knock", { gain: 1.3, rate: 0.7, delay: 1.0 });
          } },
        { stage: "上面静了静。跟着，有什么顺着盖板缝别了进来——盖板让它撬得翘起一条缝。", d: 4.6,
          cam: { kind: "insert", x: 29, y: UNDER_Y + 2.2, dist: 3.6 },
          on: (state) => {
            // 撬要看得见：盖板真的翘开一条缝（state.lid 常立着，World 按它转角）。
            // open 走 smoothstep，0.3 折出来约 13°——一条明晃晃的缝，天光漏进来。
            // **机位得抬到画框上沿过地平线**：盖板躺在地面那条线上，
            // 低机位（+1.5）的画框顶只到 −0.75，说破天玩家也看不见板
            //（复审第三轮抓的正是"盖板整个在画框外"）
            state.lid = { id: "cellarHatch", open: 0.3 };
            Cue(state, "tenon", { gain: 0.7, rate: 0.8 });
            Cue(state, "dig", { gain: 0.4, rate: 1.3, delay: 1.2 });
          } },
        { who: "七叔", say: "……要开了。", d: 2.2,
          cam: { kind: "insert", x: 33.4, y: UNDER_Y + 0.95, dist: 2.3 } },
        { stage: "柱子退到窖底最里头。脚跟碾着的那块土——是松的。", d: 3.8,
          cam: { kind: "insert", x: 42.3, y: UNDER_Y + 0.45, dist: 2.4 },
          on: (state) => {
            state.player.cineWalk = { x: 42.2, speed: 2.4 };
            Cue(state, "knock", { gain: 1.0, rate: 0.75, delay: 1.6 });
          } },
      ],
    },
    {
      // 第五场（玩法）：挖。两轮笔画把 underDig 的两面旗都落了——
      // 松土塌出一个黑口子，是早年祖先挖的旧防兵洞。
      // 头顶的砸声一轮紧过一轮（只是声音，没有倒计时，也没有失败）。
      kind: "chain", id: "c2_digout", timeOfDay: "day", noDetect: true,
      objective: "墙角的土是松的——挖！", hint: "一下接一下，别停",
      onStart: (state) => {
        state.player.cineWalk = null;
        // 站 41.7：没挖开之前近侧剖面的洞腔在 42.6 的墙前就开始收口，
        // 42.2 那一步人已经埋进收口的土里（实拍：整个人只剩一条黑边）。
        // 挖第一下之后 digStarted 把腔体往前放开，人再往前跟就看得见了
        state.player.x = 41.7;
        // 大家往窖底聚拢，让开挖土的人（level/visible 兜底同 c2_hush——
        // 跳幕结算不重放微过场的走位）
        const S = (id, x, h) => {
          const a = FindActor(state, id);
          if (a) {
            a.x = x; a.heading = h; a.pose = null; a.rank = 0;
            a.level = "under"; a.visible = true; a.cineTarget = null;
          }
        };
        S("qishu", 40.6, 1);
        S("liusao", 39.2, 1);
        S("tianYe", 38.0, 1);
        const sis = FindActor(state, "sister");
        if (sis) { sis.pose = null; sis.x = 39.9; sis.heading = 1; sis.level = "under"; sis.visible = true; }
      },
      tick: (state) => {
        const b = state.beat;
        b.poundT = (b.poundT || 0) + 1 / 60;
        if (b.poundT > 3.6) {
          b.poundT = 0;
          Cue(state, "knock", { gain: 1.1, rate: 0.72 });
        }
      },
      steps: [
        // 判定区中心退到 41.8：区就是人站的地方，站在剖面收口里挖＝画面上没人在挖
        { type: "use", zone: { x: 41.8, w: 2.2, level: "under" }, hold: 2.4, stroke: "down", gestureY: 0.6,
          prompt: "刨开松土",
          note: "土往里塌了一块——后头是空的！",
          effect: (state) => { state.flags.digStarted = true; Cue(state, "dig", { gain: 0.9 }); } },
        { type: "use", zone: { x: 43.4, w: 2.6, level: "under" }, hold: 2.2, stroke: "down", gestureY: 0.6,
          prompt: "把口子掏大",
          note: "黑黢黢一个洞口，里头的风是凉的。",
          effect: (state) => {
            state.flags.tunnelDug = true;
            Cue(state, "dig", { gain: 0.9 });
            const q = FindActor(state, "qishu");
            if (q) { q.cineTarget = { x: 41.6 }; q.cineSpeed = 2.0; }
            StartMicroCine(state, [
              { who: "七叔", say: "这洞……通到我家柴房底下去！是老辈人打的防兵洞！", d: 4.4,
                cam: { kind: "shot", x: 42.6, y: UNDER_Y + 1.1, dist: 3.8 } },
              { who: "七叔", say: "钻！小的先走！", d: 2.2,
                cam: { kind: "insert", x: 42.0, y: UNDER_Y + 0.95, dist: 2.4 } },
            ]);
          } },
      ],
    },
    {
      // 第六场（玩法）：顺着窄道爬出去。净高只够爬（tight 段接管姿态），
      // 妹妹镜像跟着；乡亲们在后头。身后是盖板碎裂的响声——只有声音。
      kind: "escort", id: "c2_crawl", timeOfDay: "day", noDetect: true,
      follower: "sister", dest: { x: 51.8, w: 2.8, level: "under" },
      objective: "带妹妹顺着窄道爬出去", hint: "洞矮，得爬；她跟得上你",
      onEnter: (state) => {
        // 跟着爬的一串人（跳幕兜底：层级/可见/位置一起钉）。
        // **不挂 following**：三个跟随者都朝玩家身后同一个位置挤，窄洞里
        // 当场叠成一摞人。改成各给一个慢速爬行目标——终点、速度都错开，
        // 队伍拉成一串；他们比玩家慢，落在身后正好（身后就是被砸开的窖口）
        const back = [1.4, 2.5, 3.6];
        const dest = [50.8, 49.4, 48.0];
        const pace = [0.55, 0.5, 0.45];
        ["qishu", "liusao", "tianYe"].forEach((id, i) => {
          const a = FindActor(state, id);
          if (a) {
            a.following = false; a.slow = true; a.level = "under"; a.visible = true;
            a.pose = null; a.rank = 0;
            if (Math.abs(a.x - state.player.x) > 6) a.x = state.player.x - back[i];
            a.cineTarget = { x: dest[i] }; a.cineSpeed = pace[i]; a.heading = 1;
          }
        });
        const sis = FindActor(state, "sister");
        if (sis) {
          sis.level = "under"; sis.visible = true; sis.pose = null;
          if (Math.abs(sis.x - state.player.x) > 6) sis.x = state.player.x - 0.9;
        }
      },
      tick: (state) => {
        const b = state.beat;
        b.crashT = (b.crashT || 0) + 1 / 60;
        if (b.crashT > 5 && !b.crashed) {
          b.crashed = true;
          // 身后：盖板被砸开了。脚步灌进窖里——声音在先，谁要是回头看，
          // 老窖口那块板也真是四敞大开的
          state.lid = { id: "cellarHatch", open: 1 };
          Cue(state, "drop", { gain: 1.3, rate: 0.6 });
          Cue(state, "step", { gain: 0.8, delay: 0.9 });
          Cue(state, "step", { gain: 0.7, rate: 0.9, delay: 1.5 });
        }
      },
      onDone: (state) => {
        for (const id of ["qishu", "liusao", "tianYe"]) {
          const a = FindActor(state, id);
          if (a) { a.following = false; a.cineTarget = null; }
        }
      },
    },
    {
      // 第七场：爬出来。喘匀了气，七叔说出全章那句话。
      kind: "cinematic", id: "c2_out", timeOfDay: "day", noDetect: true,
      lines: [
        { stage: "", d: 2.6, cam: { kind: "shot", x: 53, y: 1.25, dist: 5, trans: "dip" },
          on: (state) => {
            // 黑场里换层：从七叔家柴房的旧窖口上来，人摊在柴垛背后
            state.player.level = "surface";
            state.player.x = 50.6;
            state.player.heading = -1;
            state.player.crouch = false;   // 地道里是爬出来的，上了地就站直——蹲姿留在洞里
            // 姿势要错开：田大爷瘫坐（跪）、刘嫂扶着膝盖喘（弓）、七叔站着——
            // 三个人一模一样折成 90° 就是三份复制粘贴。
            // 站位让开窖口盖板的倒伏带：盖板从 52.6 的铰链往西掀倒，掀开时
            // 板身盖住 51.1~52.6——人站进去就像扛着两块木头（实拍退回过）。
            // 兄妹刘嫂在洞口西边，七叔田大爷在东边，敞着的黑洞口空在当中
            const U = (id, x, h, pose) => {
              const a = FindActor(state, id);
              if (a) { a.following = false; a.level = "surface"; a.x = x; a.heading = h; a.pose = pose || null; a.cineTarget = null; }
            };
            U("qishu", 53.8, -1);
            U("tianYe", 55.0, -1, "kneel");
            U("liusao", 49.4, 1, "bow");
            const sis = FindActor(state, "sister");
            if (sis) { sis.following = false; sis.level = "surface"; sis.x = 50.1; sis.heading = 1; sis.pose = "leanIn"; }
            // 街上的动静"堵在村西头"——那两个巡逻兵就真得在村西头。
            // 舀水支线把 raid2 拴在 50~64（正是这一镜的画框），不挪走的话
            // 一家人喘气的背后就站着一个来回踱步的日本兵
            for (const rid of ["raid1", "raid2"]) {
              const r = FindActor(state, rid);
              if (r) { r.cineTarget = null; r.x = Math.min(r.x, 18); r.patrol = [4, 20]; r.speed = 1.0; r.heading = -1; }
            }
            // 爬出来的那个窖口敞着（章末"回望黑洞口"全指着它）；
            // state.lid 只在爬梯时短暂立起，这里长立到章末
            state.lid = { id: "qishuHatch", open: 1 };
            Cue(state, "flutter", { gain: 0.5 });
          } },
        { stage: "从七叔家柴房的旧窖口爬上来，天光晃得人睁不开眼。", d: 3.6,
          cam: { kind: "shot", x: 52.8, y: 1.2, dist: 5.5 } },
        { stage: "街上的动静，还堵在村西头。谁也没说话，先喘。", d: 3.4,
          cam: { kind: "shot", x: 53.2, y: 1.25, dist: 6 },
          on: (state) => {
            Cue(state, "motorPutt", { gain: 0.25 });
            Cue(state, "knock", { gain: 0.3, delay: 1.4 });
          } },
        { stage: "田大爷靠着柴垛，咳出了声——这回，不用捂了。", d: 3.6,
          cam: { kind: "insert", x: 55.0, y: 0.9, dist: 2.8 },
          on: (state) => {
            Cue(state, "sobBreath", { gain: 0.5, rate: 1.4 });
          } },
        { stage: "", d: 2.4, cam: { kind: "shot", x: 53.0, y: 1.3, dist: 4.4 },
          on: (state) => {
            const q = FindActor(state, "qishu");
            if (q) q.heading = -1;
          } },
        { who: "七叔", say: "光躲不行。得想办法打。", d: 4.0,
          cam: { kind: "insert", x: 53.8, y: 1.35, dist: 2.6 } },
      ],
    },
    {
      // 章末：回望那个黑洞口。章名在这儿落——地洞里的眼睛。
      kind: "cinematic", id: "c2_end", timeOfDay: "day", noDetect: true,
      lines: [
        { stage: "柱子回过头。", d: 2.2,
          cam: { kind: "shot", x: 52.6, y: 1.2, dist: 4 },
          on: (state) => {
            state.player.heading = 1;   // 从 50.6 回头看东边 52.6 的洞口
            // 上一拍摆的姿势在换拍时被 ClearPoses 清掉了，这一镜还是同一口气——
            // 谁也没起身，按原样再钉一遍
            const P = (id, pose, h) => {
              const a = FindActor(state, id);
              if (a) { a.pose = pose; if (h) a.heading = h; }
            };
            P("tianYe", "kneel", -1);
            P("liusao", "bow", 1);
            P("sister", "leanIn", 1);
          } },
        { stage: "柴房底下，那个黑黢黢的洞口，像一只睁开的眼睛。", d: 3.8,
          cam: { kind: "insert", x: 52.6, y: 0.62, dist: 2.3 } },
        { stage: "他头一回觉得，那底下不是个坟墓。", d: 3.0, cam: { kind: "dark" } },
        // 五个字不值三秒的黑：说完就走，留白靠下一章的开场给
        { stage: "是个起点。", d: 1.8, cam: { kind: "dark" } },
      ],
    },
  ];
}
