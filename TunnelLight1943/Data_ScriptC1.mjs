// 第一章节拍表（SCRIPTS.c1，2026-08-15 从 Script_Core.mjs 按章拆出）。
// 工厂而不是裸数组：节拍里用到的 Core 帮手由 Core 组装 SCRIPTS 时整包递进来
// （下面一行解构还原成裸名字，正文与拆前逐字相同），所以本文件不 import
// Script_Core、没有循环依赖。新用到 Core 的东西：解构清单加名字，Core 末尾的
// SCRIPT_KIT 也加一笔——漏了是当场的 ReferenceError，不会静默出错。
// =========================================================================
// 第一章 · 蓝底白花（2026-08-13 按 Notion 第七稿整章重排）
// 序·那天（**可玩**，第八稿独立成场 2026-08-13）：扫荡进村那天，娘冲进屋，
// 两次才攥住翻板铁环——玩家抱起妹妹（往屋门走她会挡：「下去！」）、带她
// 下窖；娘留下「搂紧她。不叫你们，别上来。」，翻板合上，最后消失在板缝里的
// 是她那截蓝底白花的袖子。窖底长按搂紧：**松手她的呼吸就变响、头顶的脚步
// 就停住**，重新按住脚步才继续；靴子踩上翻板、灰从板缝落下来。旁白「没人
// 来叫」，章名卡「第一章 · 蓝底白花」，三天后。
// 正章十四场（八稿）：冷灶（粮瓮见底、鸡笼空着、章目标「天黑前，给妹妹弄
// 一顿热饭」）→牲口棚（推焦木→谷种半袋+**娘的声音**「留种。谁也不能动。」
// →扎回袋口→刨灰堆→抠泥揭碗，碗片底下那圈**蓝底白花碎布**闪回娘跪在
// 窖口的手臂）→分食（掰一长一短，她把长的推回来：「吃你的。」）→第三道线
// （「今天还画吗？」「画。」；抱她画正字，三下才成；「他们啥时候回来？」——
// 一按：说「快了」）→去井台（两棵刮了皮的秃榆、田埂苦菜进桶边布兜）→
// 井台（接绳活卡照用+辘轳四道手）→车铃（**从墙后头出来或松手就失败**：
// 「谁在那儿？」收黑回到车铃响起时；两辆自行车真进画面；七叔——黑豆、
// 「我说有。就有。」）→一顿热饭（倒水入缸、做饭蒙太奇天色由灰白转暗黄；
// 匀稠的：叫她看见她会按住两只碗推回来「哥，你也吃。」；碎布贴上手腕，
// 只够盖一小块——去菜窖找布）→菜窖（笸箩针线放到梯子旁、掀草苫见整布、
// **两块布的花纹接在一起**、贴脸一下、抱布走到半路一只手抓住手腕：「水。」）
// →「我当你也走了。」（一按：说「没走」）→半瓢水→撕布（**可玩**：喂水
// 托稳、摸到血、碎布压不住、撕开整布——绷紧/裂口/撕开三把、包扎两圈、
// 按住他挣动渐松）→缝（**可玩**：三针——偏高/偏低拉出小褶/折回绕线头
// 拉紧）→我在（清晨给妹妹穿上接了袖的旧褂：「哥？」——一按：回答「我在」；
// 拉远镜地上妹妹地下伤员，门和翻板都留着缝。第一章结束）。
// 全章唯一的失败在车铃，失败也只是回卷；「维持日常」的徒劳与温柔是题眼，
// 而这份日常是玩家亲手瞒出来的——村里不止一个人在瞒。
//
// **视频序章（原 c1_prologue 的 11 镜纪录片式旁白）2026-08-13 整个删除**：
// 「序 · 那天」就是它的替代品。历史交代改由戏本身带出来（告示墙、弹孔、
// 七叔那句"甭往北头去"），不再由旁白预先讲掉。短片文件仍在 `Video/`。
// =========================================================================
export function ChapterC1(K) {
  const {
    AddGroundItem, Cue, FindActor, FlashPose, FlashTrack, GiveItem, RewindBeat, SetDin,
    StartMicroCine, StopDin, UNDER_Y, V,
  } = K;
  // 抱在怀里的孩子坐得多高（米）。**这个数是量出来的**：柱子走 childArms 那档
  // 走姿时，托着的那只手落在离地 0.82m（`world.LimbTipsOf('player').handF`），
  // 而妹妹按 heldChild 坐着时胯离她自己脚底 0.40m —— 两个数一减就是她该垫多高。
  // 手心与她的胯差一寸都能看出来：差多了是"托着空气"，差少了是"陷进他胳膊里"。
  const SEAT_LIFT = 0.42;
  // 那截手腕的机位——**全章出现三次**（§1 袖口遮不住 / §14 蓝花袖口盖住 /
  // 章末同框），三次必须是同一格，所以只写一份。2026-08-16 照分镜图收紧：
  // 原来是 `insert dist 1.9`＝画宽 3.8m，一屏摆下整间屋，"镜头停在她的手腕上"
  // 这句话在画面上一次都没成立过。现在画宽 1.9m（机距＝画宽），
  // 炕沿在画框下沿压一道黑
  // **注视点是量出来的，不是照"炕该多高"估的**：她 sleep 那一支走 LIE_POSES，
  // 整具骨架转 90° 又挪了半个身长，`world.LimbTipsOf('sister')` 报的是
  // 头 (31.31, 0.25) / 手 (31.14, 0.25) / 脚 (30.67, 0.03)——她**贴着地面躺着**，
  // 而老机位盯着 (30.72, 0.62)：那是她脚跟外侧、离地半米的一块空墙。
  // 第一版照老坐标收紧画宽，实拍出来整幅画一个人都没有（画框正好从她头顶
  // 掠过去）。手腕在 x 31.10 上，注视点就得钉在那儿
  // ── 过场机位小工具（2026-08-16 照 Notion《过场分镜》第一章重排时立的）──────
  // `CINE(x, y, 画宽, [框景])` ＝ 一台正对着 (x,y) 的过场自由相机。
  //
  // **为什么全章的过场都得换成 `free`**：框景（`fg`）的 u/v 折算只在
  // `free`/`split` 两档拿得到相机（Main：`shot.free ? {left: shot.free} : null`），
  // 裸 `insert`/`shot` 传进去的 u/v 会被 `ForePlace` 当**世界坐标**用，板子直接
  // 飞到村东头去。而分镜图**每一张**都有一块压得很暗、被画框切掉的近景——
  // 画面里唯一真正黑的地方就是它（CLAUDE.md「过场三件套」②）。
  //
  // **第三个参数给的是画宽（米），不是半宽**：分镜图上量"这一格里装了几米"
  // 比量"半宽"好想。换算口径（FOV 30°，16:9）：
  //   画高 = 0.536 × 机距，画宽 = 0.953 × 机距 ⇒ **机距 ≈ 画宽**。
  //
  // **但过场的上下黑边是盖在这幅 16:9 上头的，不是画外加的框**
  // （`Style_Game.css` 的 `#cineBars.active` 上下各 11.5vh）——玩家看得见的
  // 只剩画高的 **77%**，而先被吃掉的正是头顶和脚下那两条。第一版照整幅画高
  // 配景别，实拍出来八格里的人不是切了头就是切了小腿（2026-08-16 视觉审查
  // 一次报出 p02/p03/p13/p25/p26/p38/p39a/p52）。所以尺子是：
  //   **可见画高 = 0.412 × 机距**，要让身高 h 的人占可见画高 f ⇒
  //   **画宽 = h / (f × 0.432)**。
  // 柱子 1.10m —— 占四成 ⇒ 6.4m，五成 ⇒ 5.1m，七成 ⇒ 3.6m，九成 ⇒ 2.8m；
  // 大人 1.37m 占九成 ⇒ 3.5m。**跪着/蹲着的人按实测身高算**（跪着的柱子只有
  // 0.59m，坐着 0.78m），照站姿配机距会松一整档。
  // 配套一条：站在地上的主体，**注视点 y ≈ 0.15 × 画宽**（腰线落在画面当中、
  // 脚下留一成半）。给到成人视平线那么高，地平线就钉在画框下沿，上半屏
  // 一半是空墙——这一版全章封顶在 0.20 × 画宽。
  //
  // 默认带一记很轻的推镜（收 4%）——分镜是静帧，可实机里完全不动的一格
  // 读起来是"卡住了"。要停住就给 `{ push: 1 }`。
  const CINE = (x, y, spanW, fg, opt = {}) => {
    const z = spanW / 0.953;
    return {
      kind: "free",
      from: [x + (opt.dx ?? 0), y + (opt.dy ?? 0), z],
      to: [x + (opt.dx ?? 0) * 0.85, y + (opt.dy ?? 0) * 0.85, z * (opt.push ?? 0.96)],
      at: [x, y], atTo: [x, y],
      ...(fg && fg.length ? { fg } : {}),
    };
  };
  // 常用的几块框景。z 一律按"离行走线多近"给，**必须小于机距**；
  // u/v 是板心在**它自己那个深度上的画框**里的位置（−1..1）。
  // v 不许给到 0.7 以上——过场上下各压着一条黑边（画高的一成），梁身会整根
  // 缩进上边框里，屏幕上只剩一排悬空的黑齿。
  // **`dim` 不许省**（2026-08-17 掀盖那一镜查出来的）：省了就是 1＝按原色画，
  // 而框景板贴在镜头跟前一米以内、还要当画面里最暗的那一块。那几处手写的 `vat`
  // 全漏了 dim，于是屏幕上是一大片发白的灰饼——用户看到的"太丑了"有一半是它。
  // 手写 fg 就照这张表里的数给（框景 1.78~2.02）
  const FG = {
    jambL: (z, w = 0.30, h = 1.05, dim = 1.94) => ({ art: "doorJamb", u: -0.90, v: 0, z, w, h, dim }),
    jambR: (z, w = 0.30, h = 1.05, dim = 1.94) => ({ art: "doorJamb", u: 0.90, v: 0, z, w, h, dim, flip: true }),
    beamTop: (z, w = 1.6, h = 0.26, dim = 2.02) => ({ art: "beam", u: 0, v: 0.34, z, w, h, dim }),
    kangLow: (z, w = 1.2, h = 0.22, dim = 1.78) => ({ art: "kangEdge", u: -0.28, v: -0.90, z, w, h, dim }),
    strawLow: (z, w = 1.2, h = 0.26, dim = 1.86) => ({ art: "strawEdge", u: 0.10, v: -0.88, z, w, h, dim }),
    ladderL: (z, w = 0.34, h = 1.0, dim = 1.86) => ({ art: "ladder", u: -0.86, v: 0, z, w, h, dim }),
    vatL: (z, w = 0.46, h = 0.56, dim = 2.02) => ({ art: "vat", u: -0.84, v: -0.30, z, w, h, dim }),
  };
  const WRIST_CAM = {
    kind: "free",
    // 画宽 1.26m：手腕才 0.12m 宽，画宽给到 1.9m 就只剩几十个像素——
    // 「镜头停在她的手腕上」这句话在画面上得真的成立（第二轮视觉审查）
    from: [31.16, 0.32, 1.32], to: [31.15, 0.31, 1.24],
    at: [31.13, 0.28], atTo: [31.13, 0.27],
    // 前景压左缘，**不许压画框下沿**——她整条胳膊就躺在下沿那一带
    fg: [{ art: "doorJamb", u: -0.88, v: 0, z: 0.80, w: 0.20, h: 0.42, dim: 2.02 }],
  };
  return [
    {
      // ── 序 · 那天（第八稿独立成场；镜头调度沿用 2026-08-13 那版重做） ──
      // 没有音乐。吵的都在外面：跑、狗、枪、砸门、陶罐落地、车轮碾石路，
      // 还有听得懂的那句「出来！都出来！」。娘冲进来、抱住妹妹上下摸一遍、
      // 两次才攥住铁环掀开翻板。
      //
      // **娘衣服的特写不许回来**（2026-08-13 用户退回，八稿一并遵守）：
      // 用户原话「娘衣服的特写完全没必要，还不如就好好交待」。那块布是全章的
      // 暗线不假，可用一记特写去"交代"一件她正穿在身上的衣裳，是把观众从这
      // 一刻里拽出去——门砸开、孩子还在炕上，镜头却去拍布料。所以它跟着她
      // 冲进来那一下一句话说完，眼睛不用离开这间屋。
      // **交代要自己演完**：冲进屋 / 抱住妹妹 / 掀开翻板 / 「快。」都是真动作
      // （state.lid 带 to，盖板真的绕铰链转过去）。
      // 外面那团动静交给调度器（SetDin）：由远及近是一条连着的曲线。
      // bgm: null ＝这一拍**没有音乐**（剧本首句〔音〕「没有音乐。」）。
      // 第一章那首 BGM 是按章无条件铺的，序章因此一直有配乐在响，
      // 「吵的都在墙外」这个设计在实机里从来没成立过（2026-08-14 修）
      kind: "cinematic", id: "c1_thatday", timeOfDay: "day", bgm: null,
      lines: [
        // 开场这两句是全作唯一"该黑一会儿"的黑屏（声音先到、画面后到），但也
        // 只该黑到听清楚为止：老版 3.4+2.6＝六秒的纯黑开局，玩家还没进门就在
        // 等（2026-08-14 用户：「明明一转眼就可以解决的事情结果还在黑屏」）。
        // 收到 2.0+1.9，枪声跟着往前提——din 是跨拍连着爬的，曲线不受影响。
        { act: "", d: 2.0, cam: { kind: "dark" },
          on: (state) => {
            // 黑屏里先响起来：还在村外，狗先知道
            SetDin(state, 0.06, 0.55, 0.26);
            Cue(state, "gunshot", { gain: 0.18, rate: 0.75, delay: 1.15 });
          } },
        // 八稿：黑屏里那句喊——听得懂的就这一句，所以它自己占一行
        { who: "伪军", say: "出来！都出来！", d: 1.9, cam: { kind: "dark" },
          on: (state) => {
            SetDin(state, null, 0.72, 0.22);
            Cue(state, "shout", { gain: 0.7, rate: 0.98, delay: 0.1 });
          } },
        // ── 显影（2026-08-15 照 Notion《过场分镜》镜 01 重排）──────────────
        // 上一版是左右分屏，一格一个孩子。**分镜图上他们是挤在一起的**：
        // 哥哥搂着妹妹坐在屋角，妹妹两只手捂着耳朵；画左整整小半幅是**那扇门**
        // ——门闩、竖板缝，和门缝里透进来的一道白光。分屏把这张图最要紧的两件事
        // 都拆没了（"两个人在一起"和"他们盯着的那扇门"同框）。
        //
        // 门走**前景框景**（`doorSlab`）不走立面：过场里第四堵墙整个不画，
        // 给立面上那扇门正脸就是一个透出地平线的空门洞（镜头规范④）。
        // 前景板是"贴着镜头的一块门板"，不是世界里的门，所以不受这条限制。
        { act: "画面从黑暗里显出来。屋门关着，门闩没有插——外面每一声撞击，门板就轻轻震一下。柱子搂着妹妹缩在屋角，她两只手捂着耳朵。", d: 4.2,
          cam: {
            kind: "free",
            // 贴着两个孩子拍：分镜图里他们占了大半个画高。
            // **机距 1.9m 那一版把哥哥的天灵盖切在画框外**（2026-08-17 用户：
            // "室内镜头动画有遮挡和穿插"）——16:9 的画高只有机距的 0.56 倍，
            // 1.9m 机距＝画高 1.07m，而他站直了 1.27m。退到 2.4m、注视点抬到
            // 0.62：画高 1.35m，两颗脑袋都在框里，构图仍是"贴着他们拍"
            from: [31.76, 0.80, 2.46], to: [31.72, 0.79, 2.30],
            at: [31.22, 0.62], atTo: [31.22, 0.61],
            fg: [
              // 画左那扇门：占掉 44% 画宽，门缝落在它靠里那一侧
              // w 是**实拍量出来的**：画笔改成铺满整张画布之后，同一个 w 比原来
              // 宽了四成——0.95 那一版门板盖掉了大半个画框，两个孩子只从缝里
              // 露出一颗头。0.42 ＝ 占画框左边三分之一，跟分镜图对得上
              { art: "doorSlab", u: -0.70, v: 0, z: 1.05, w: 0.42, h: 1.34, dim: 1.78 },
              // 画框下沿压一道炕沿（分镜图里他们就坐在炕沿底下）
              // 炕沿只在画框下沿露一条：v −0.88 那一版从画面正中横过去，
              // 把两个孩子齐腰切断（实拍抓的）
              { art: "kangEdge", u: 0.30, v: -1.16, z: 1.35, w: 1.5, h: 0.26 },
            ],
          },
          on: (state) => {
            state.beat.indoorScene = true;
            // 屋里：柱子在屋当间（脸冲着门那头），妹妹缩在炕沿下捂着耳朵
            // **挤在一起**：0.52m ＝ 两颗脑袋分得开、又读得出"搂着"
            //（同「两个人要看得见是两个人」那条量出来的 0.59 上下）
            // 左右次序照分镜：**哥哥在左、妹妹在右**（他搂着她，脸冲着门那头）。
            // 0.52m ＝ 两颗脑袋分得开、又读得出"搂着"（同「两个人要看得见是
            // 两个人」量出来的 0.59 上下）
            const sis = FindActor(state, "sister");
            // 0.62m：0.52 那一版她整颗头缩在他那条搂过来的胳膊背后，画面上
            // 只剩一截粉衣裳（同「两个人要看得见是两个人」量出来的那条线）
            if (sis) { sis.visible = true; sis.level = "surface"; sis.x = 31.68; sis.heading = -1; sis.pose = null; sis.track = { name: "tremble", t: 0, ambient: true }; sis.trembleK = 0.45; sis.mood = "afraid"; }
            state.player.x = 30.90;
            state.player.heading = 1;
            state.player.pose = "shelter";      // 哥哥搂着她——分镜图上这一下是有的
            SetDin(state, null, 0.82, 0.16);
            Cue(state, "doorCreak", { gain: 0.25, rate: 1.4, delay: 1.1 });
            Cue(state, "doorCreak", { gain: 0.25, rate: 1.45, delay: 2.8 });
          } },
        // 蓝底白花那一眼：不切特写，跟着她冲进来这一下说完
        // 孩子视线的低机位：贴着炕沿的高度看她冲进来，注视点从门口摇回屋当间
        // ——镜头追人，不是人走进画框。前景压一道炕沿：她从画框深处冲到近前，
        // 那道横边就是"距离"的量尺
        { act: "一阵急促脚步冲进院子。门板猛地向里打开，撞在墙上——娘冲进来。蓝底白花的短褂被树枝扯开一道口，袖口沾着土。", d: 4.6,
          // 2026-08-15 照分镜镜 02 收紧：机距 3.2→2.35（图里娘冲进来时已经占了
          // 大半个画高），画左照旧留着那扇门——她就是从那儿撞进来的
          cam: { kind: "free", from: [30.86, 0.78, 2.38], to: [30.98, 0.76, 2.16], at: [32.20, 0.80], atTo: [31.72, 0.70],
            fg: [
              { art: "doorSlab", u: -0.80, v: 0.02, z: 1.10, w: 0.34, h: 1.34, dim: 1.86 },
              { art: "kangEdge", u: 0.10, v: -1.05, z: 1.55, w: 1.6, h: 0.32 },
            ] },
          on: (state) => {
            state.beat.indoorScene = true;
            const m = FindActor(state, "mother");
            if (m) { m.visible = true; m.level = "surface"; m.x = 38.6; m.heading = -1; m.cineTarget = { x: 31.6 }; m.cineSpeed = 3.4; }
            const sis = FindActor(state, "sister");
            if (sis) { sis.track = { name: "tremble", t: 0, ambient: true }; sis.trembleK = 1; }
            Cue(state, "doorCreak", { gain: 0.85, rate: 1.15 });
            Cue(state, "knock", { gain: 0.9, rate: 1.05, delay: 0.1 });
            // 门一开，外面那团东西整个灌进来
            SetDin(state, null, 1.0, 0.5);
          } },
        // 接触戏的老规矩：先站到一臂之内（上臂+小臂 ≈ 0.49m）。娘 31.45、
        // 妹妹 31.0 差 0.45m，手才够得着
        // 这一场最重的一下给一个不停的缓推：从半间屋慢慢压到怀抱上
        // 2026-08-15 照分镜镜 03 重摆：图里是**娘的背填满画框、妹妹的头埋在她
        // 臂弯里、柱子只在画右缘露半个身子**——不是一个"看着母女俩"的中景。
        // 所以：机距收到 1.55m（娘的实高 1.37m，正好顶天立地），注视点抬到
        // 她胸口那一带，柱子往画右挪进画框。
        { act: "院外又响一枪。娘猛地回头，把门推回去，却没顾上关严——转身冲到妹妹面前，一把将她拉进怀里，上下摸了一遍。", d: 5.2,
          cam: { kind: "free", from: [31.62, 1.02, 2.30], to: [31.55, 0.95, 1.58], at: [31.18, 0.86], atTo: [31.16, 0.80],
            // 推到头时房梁压下来盖住画框上沿：屋子越推越"低"，怀里那一下才闷得住
            fg: [{ art: "wallEdge", u: -0.82, v: 0, z: 1.30, w: 0.32, h: 0.75 }] },
          on: (state) => {
            state.beat.indoorScene = true;
            Cue(state, "gunshot", { gain: 0.3, rate: 0.8, delay: 0.2 });
            Cue(state, "doorCreak", { gain: 0.5, rate: 0.9, delay: 1.2 });
            const m = FindActor(state, "mother");
            // 2026-08-13：这一句原来借的是**拽水桶**那个 haulIn，还把 poseK 钉在
            // 0.55——画面上她伸着两条胳膊横在半空，一连 9 秒一格没变（实拍逐帧
            // 比对过，两张图像素相同）。「一把将她拉进怀里、上下摸了一遍」是这
            // 一场最重的一下，现在走真轨道：探手→攥住往回带→蹲下去围住她→
            // 两遍从肩到腿的上下摸→抬头找柱子
            if (m) { m.cineTarget = null; m.x = 31.45; m.heading = -1; m.pose = null; m.track = { name: "pullClose", t: 0 }; }
            const sis = FindActor(state, "sister");
            // 间距 0.59m。两头都量过：娘蹲到 hipY −0.28 时手落在身前 0.50m
            // （够得着她的背），而**她自己还往娘这边倾着**（pulledClose 的
            // hipX+躯干折，头会前移小 0.2m）——挤到 0.31/0.44m 时实拍出来
            // 两颗脑袋叠在一处、孩子整个被大襟长摆吞掉，画面上只剩一个蹲着的娘
            if (sis) { sis.pose = null; sis.cineTarget = null; sis.x = 30.86; sis.heading = 1; sis.track = { name: "pulledClose", t: 0 }; }
            // **柱子得让开妹妹那个点**（2026-08-17 用户："室内镜头动画有遮挡和
            // 穿插"）。上一镜把他钉在 30.90，这一镜又把妹妹拉到 30.86——两个人
            // 差 4 厘米站在同一处，他整个盖在她身上：分镜要的"妹妹的头埋在娘的
            // 臂弯里"一格都看不见，画面上只剩两具互相穿插的贴图。
            // 挪到 32.0：跟娘（31.45）隔开半米多，正好在画右缘露半个身子，
            // 也接得上下一镜他站在 32.45。
            state.player.x = 32.00;
            state.player.heading = -1;          // 转过来看着她们
            state.player.pose = null;
            Cue(state, "clothLift", { gain: 0.6, delay: 2.6 });
          } },
        // 她抬头找柱子。气还没有喘匀——所以这两句挂的是会喘的循环轨道，
        // 不是"pullClose 播完停在末帧"（停住就又是一张定格）
        // 正反打盖在她脸朝的那一侧（她 heading -1，机位在西），带一点偏航——
        // 纸戏台斜着看有厚度，正打永远是一张平贴
        { who: "娘", say: "柱子。", d: 1.8,
          cam: { kind: "free", from: [30.86, 0.90, 2.06], to: [30.88, 0.89, 1.96], at: [31.38, 0.82],
            // **画框右缘不许越过 x≈32.4**：屋子的东山墙到那儿就没了，过场里第四堵墙
            // 又整个不画，再往东就直接望见野地和炮楼（实拍抓的）。这一镜是反打
            // 她一个人，柱子（32.45）本来就该在画外
            fg: [
              { art: "wallEdge", u: -0.82, v: 0, z: 1.05, w: 0.30, h: 0.72 },
              // **挡东山墙那道口子的板要按世界坐标钉**，不能写 u/v：u/v 是按
              // 这一行**起手**那一格的机位折算的，镜头一推，它就跟着往画框外挪，
              // 而要挡的那道口子是钉在世界里的（实拍连错两轮）
              { art: "doorJamb", x: 31.45, y: 0.86, z: 1.05, w: 0.52, h: 1.6, flip: true },
            ] },
          on: (state) => {
            const m = FindActor(state, "mother");
            if (m) m.track = { name: "huddleBreath", t: 0 };
            const sis = FindActor(state, "sister");
            // heldTremble 而不是 tremble：她这会儿是**站着**被娘搂住的，
            // tremble 的底子是蹲成一团（那是窖底在哥哥怀里那一拍）
            if (sis) { sis.track = { name: "heldTremble", t: 0 }; sis.trembleK = 1; }
          } },
        // 「抱她。」＝**双人镜**：这句话是说给柱子的，命令和听命令的人得在同一格里。
        // 前一句「柱子。」是反打她一个人，这一句退开一档把他收进来——她跪着搂着
        // 妹妹在左，他站着在右，两个人之间那一米就是这句话要跨过去的距离。
        //
        // 这一镜 2026-08-14 曾被退成"跟上一句同机位"，原因不是构图而是穿帮：
        // 屋子后墙那片贴图按透视只铺到画框的一小截，他站在 32.45，任何装得下他的
        // 画框右边都直接望见野地和炮楼。**现在山墙内侧接上了**（Art.DrawRoomWing），
        // 往东到 34.8 都还是墙，双人镜才成立。
        { who: "娘", say: "抱她。", d: 2.0,
          cam: { kind: "free", from: [31.58, 0.88, 3.30], to: [31.62, 0.86, 3.10],
            at: [31.80, 0.80], atTo: [31.86, 0.80],
            // 房梁压着画框上沿：退开一档之后头顶空出来一片，这根梁把它吃掉，
            // 也是这一格里唯一真正黑的地方（过场框景那条）。
            // **h 要照"上边框到人头顶还剩多少"给，不是照梁该多粗给**：过场上下
            // 各压着一条黑边，v 一大梁身就整根缩进黑边里，屏幕上只剩底下那排椽头
            // ——读成一串挂在电线上的黑方块（实拍连错两轮，跟 DrawCineFore 里
            // beam 那条注释写的是同一个坑）。0.20/0.68：梁顶刚好啃进上边框，
            // 梁身占住上边框到头顶那一条，椽头收在头顶之上
            fg: [{ art: "beam", u: 0, v: 0.42, z: 1.35, w: 2.6, h: 0.20, dim: 2.09 }] },
          on: (state) => {
            state.beat.indoorScene = true;
            // 她叫了他一声，他这会儿是转过来的——上一句反打在她身上，这一下
            // 才第一次看见他的脸朝哪儿。不给 pose/track：站着那一支本来就带呼吸
            //（Rig 的「生命体征」那段），钉个静态姿势反而是一张两秒的定格
            state.player.x = 32.45;
            state.player.heading = -1;
            state.player.pose = null;
            state.player.track = null;
            // 娘和妹妹**故意不碰**：她们的 huddleBreath / heldTremble 是上一句起的
            // 循环轨道，在这儿重新赋值等于把 t 归零——那口没喘匀的气会在切镜
            // 这一下被掐断重来，正是这两句要连着演的东西
          } },
        // 换机位＝换一镜（每一行本来就是一个镜头），所以人直接摆到窖口，
        // 不在这一句里演走位——走位只留给"冲进屋"那一下，那是要看的
        // 俯角看翻板（滑开/蹭汗/再攥住/掀开都在手上），镜头缓缓沉下去凑近——
        // 俯的是这一小块窖口，不是全村（那条禁令管的是景别，不是角度）
        { act: "娘去拉菜窖翻板。手指第一次从铁环上滑开。她在衣襟上蹭了一把汗，第二次攥住铁环，将翻板猛地掀开。", d: 5.4,
          // 2026-08-17 重新框（用户：「地道口掀开盖这个镜头太丑了」）。老机位
          // [30.35,1.15,3.05]→at[29.78,0.52] 有三处不成立：
          //  ① **画宽 3.2m**（FOV 30° 下画宽≈机距），要把铰链 28.38 到娘 30.05
          //     整个装下，于是窖口挤在画框最左、还被切掉一半，中间半幅是空地板；
          //  ② 注视点 y 0.52→0.44 压得低，下半屏整个是地面；
          //  ③ 前景那块 `vat`（水瓮肩）是一大片没有内容的灰圆饼，**正压在窖口上**
          //     ——它要挡的是空地板，结果挡的是这一镜的主角。
          // 现在：**注视点往窖口挪** 29.78→29.40，于是板从左边升起来、窖口坐在画
          // 正中、她占右边三分之一；机距 3.07m 基本没动（她掀到最高那一下头到 1.25m，
          // 画高再收就切头——黑边先吃掉两成三画高，可用画高只有画宽的 0.43 倍）。
          // 前景换成注解里本来写的柴草，**挪到右下角**（窖口现在坐在正中，压左下就
          // 又挡住主角了），而且**必须给 dim**：老版那块 vat 没写 dim＝按原色画，
          // 所以才是一大片发白的灰饼——FG 那张表里每一块都带 dim，照它给
          // **俯角俯到 16°，不再往下压。** 老机位嘴上写着"俯角看翻板"，实际只有
          // 12°——地上那个洞在 12° 下投影剩 0.14m，等于没交代"掀开了什么"。
          // 中途试过 24.5°（规范给自由机位的上限是 25°），洞是看清了，可**地面
          // 当场占掉三分之二画幅**：碎点撤掉之后这片地就是一整块平色，俯得越狠
          // 空得越厉害。16° 是两头都还行的那一档，剩下的交给洞自己画大一点
          cam: { kind: "free", from: [30.15, 1.30, 2.80], to: [30.02, 1.16, 2.55], at: [29.40, 0.50], atTo: [29.32, 0.44],
            fg: [{ art: "strawEdge", u: 0.70, v: -0.92, z: 1.15, w: 1.0, h: 0.26, dim: 1.86 }] },
          on: (state) => {
            state.beat.indoorScene = true;
            const m = FindActor(state, "mother");
            // 2026-08-13：原来借掀苫草的 heaveMat 并把 poseU 钉在 0.7——字幕点了
            // 四件事（够环／滑开／蹭汗／再攥住掀开），画面上是同一个前倾造型挂
            // 5.4 秒。现在走 hatchHeave，四件事各占一段
            // **摆位也是这一轮修的**：翻板是块 1.25m 的板，铰链在西边 28.38、
            // 带铁环的活动边在 29.63，掀开时整块往**西**倒。老版把娘摆在 28.95
            // ——那正是洞口正中，而且脸朝东背对着板：她蹲在自家窖口里、对着
            // 空气够铁环，板在她身后自己立起来。现在站到活动边外侧 30.05、
            // 脸朝西（heading −1），手落在 29.63 的铁环上（0.42m，一伸手的事），
            // 板往西倒也不会砸着她
            if (m) { m.cineTarget = null; m.x = 30.05; m.heading = -1; m.pose = null; m.poseU = 0; m.track = { name: "hatchHeave", t: 0 }; }
            const sis = FindActor(state, "sister");
            if (sis) { sis.track = null; sis.trembleK = 0; sis.pose = "leanIn"; sis.cineTarget = null; sis.x = 31.0; sis.heading = -1; }
            // 第一次没攥住：铁环上滑一下（八稿）——对齐轨道 t=1.15 那一帧
            Cue(state, "crank", { gain: 0.32, rate: 1.6, delay: 1.15 });
            // 在衣襟上蹭一把汗
            Cue(state, "clothLift", { gain: 0.35, rate: 1.2, delay: 2.0 });
            // 板子真的绕铰链掀起来——**而且要等她第二次攥住之后才动**。
            // 老版 rate 1.5 从第 0 帧就转，0.67 秒就全开了：她还在够铁环，板子
            // 自己已经立起来（实拍 1.4s 那一格板已经全开）。delay 对齐轨道 t=2.5
            state.lid = { id: "cellarHatch", open: 0, to: 1, rate: 0.72, delay: 2.5 };
            Cue(state, "vault", { gain: 0.5, rate: 0.8, delay: 2.6 });
            Cue(state, "drop", { gain: 0.7, rate: 0.62, delay: 4.4 });
          } },
        // 收尾反打：贴着孩子那头的低机位仰看跪在窖口的娘，掀开的洞口
        // 黑在画框下沿——「快」字说给谁、往哪儿快，一目了然
        { who: "娘", say: "快。", d: 2.2,
          cam: { kind: "free", from: [31.10, 0.40, 2.55], to: [30.98, 0.42, 2.36], at: [30.15, 0.70],
            // 掀开的板沿黑在画框下沿：「快」字往哪儿快，一目了然
            fg: [{ art: "hatchLip", u: 0, v: -0.73, z: 1.0, w: 1.3, h: 0.36 }] },
          on: (state) => {
            state.beat.indoorScene = true;
            const m = FindActor(state, "mother");
            // 掀着板守在窖口、冲着孩子这头——摆位与下一拍 c1_descend 的 onStart
            // 对齐（她 28.4/kneel），切过去人不跳。
            // **别用 pointLow**：那是地道专用的"指着洞顶那处"，手抬到 1.15m 高、
            // 头跟着往上看，站在屋里用就成了指着房梁说话（首轮实拍退回）。
            // hatchGuard＝跪着压住板、探身催、中间回头瞟一眼院门（外面的脚步
            // 已经到院门口了）——静态 kneel 挂到这一拍结束等于一张定格
            // 掀完就跪在活动边这一侧（洞在她身前、孩子在她身后），转过来冲孩子催
            if (m) { m.cineTarget = null; m.x = 29.95; m.heading = 1; m.pose = null; m.poseU = 0; m.poseK = 0; m.track = { name: "hatchGuard", t: 0 }; }
            const sis = FindActor(state, "sister");
            if (sis) { sis.cineTarget = null; sis.x = 31.0; sis.heading = -1; }
            state.lid = { id: "cellarHatch", open: 1, to: 1, rate: 1.5 };
          } },
      ],
    },
    {
      // 序 · 玩家操作①②③（八稿）：抱起妹妹 → 带她到窖口 → 沿梯子下到窖底。
      // 娘掀着翻板守在窖口；玩家若往屋门走，她挡在门前朝菜窖指：「下去！」
      // 到了窖底她只探进半张脸：「搂紧她。」「不叫你们，别上来。」翻板合上——
      // 最后消失在板缝里的，是她那截蓝底白花的袖子。
      kind: "chain", id: "c1_descend", timeOfDay: "day", indoorScene: true, bgm: null,
      // 序这三拍是一段连着的戏，分级也不许中途换脸（玩法段默认不分级）
      grade: 0.82,
      objective: "带妹妹下窖", hint: "娘掀着翻板等着你们",
      onStart: (state) => {
        state.player.cineWalk = null;
        state.player.x = Math.min(state.player.x, 33.0);
        const m = FindActor(state, "mother");
        // 掀着板守在窖口的这一整拍（玩家自己走位，可能一分钟）——静态 kneel
        // 就是一尊像。hatchGuard 会喘、会催、会回头瞟院门
        // 摆在翻板活动边的外侧（洞口 28.38~29.63 在她身前）——老版 28.4 是
        // 铰链那一边，而板掀开正是往西倒过去的，人站在那儿等于站在板底下
        if (m) { m.visible = true; m.level = "surface"; m.cineTarget = null; m.x = 29.95; m.heading = 1; m.pose = null; m.track = { name: "hatchGuard", t: 0 }; }
        const sis = FindActor(state, "sister");
        if (sis) { sis.visible = true; sis.level = "surface"; sis.pose = null; sis.cineTarget = null; sis.following = false; sis.x = 30.9; sis.heading = 1; }
        // 娘掀着翻板等着——板子这一整拍都敞着（跳幕直落这儿也要敞）
        state.lid = { id: "cellarHatch", open: 1, to: 1, rate: 2.4 };
        // 外面还在闹。玩家操作的这一段动静不再往上爬，就压在头顶上
        SetDin(state, 0.95, 0.95, 0.2);
      },
      tick: (state, dt) => {
        const b = state.beat;
        // 抱着妹妹走：她贴在怀里（第 1 步抱起之后、放上梯子之前）。
        // 玩家这一头由 state.player.childArms 撑着：腿照常走、两臂兜住她——
        // 老版只在按下那一帧闪 0.8 秒 shelter，之后柱子甩着两条空胳膊走路，
        // 妹妹浮在他胸口跟着飘
        const sis = FindActor(state, "sister");
        // 抱起来之后**一路抱到窖底**（2026-08-15 用户报「没有抱着下地道的设计，
        // 妹妹直接瞬移到了地道下面」）：老版在走到窖口那一步就 carrying=false，
        // 顺手把她 `level="under"; x=30.7` ——一句话把人挪下去一层又挪开 1.4 米，
        // 那正是玩家看到的瞬移。现在她整段都钉在他怀里，连下梯子也是，
        // **一帧都没有"她自己出现在别处"**。
        if (b.carrying && sis) {
          sis.cineTarget = null;
          sis.following = false;
          // 贴着他：身前 0.20m。老版 0.26m 在实拍里两人之间留着一道缝——
          // 抱孩子是**贴在胸口**，有缝就读成"她浮在他前面"
          sis.x = state.player.x + state.player.heading * 0.20;
          // **脸朝着他**（不是跟他同向）：她两条胳膊是搂着他脖子的，
          // 同向的话那两只手就搂在空气里
          sis.heading = -state.player.heading;
          // 跟着他换层、跟着他下梯子：lift 叠在他的 lift 上，所以他一级一级往下，
          // 她就在怀里一级一级跟着下去
          sis.level = state.player.level;
          sis.lift = (state.player.lift || 0) + SEAT_LIFT;
          // leanIn 是**站姿**（腿几乎直）：被抱着的孩子腿要折起来搭在他小臂上
          sis.pose = "heldChild";
          // 她画在他之后（贴在他胸前那一侧）——见 World 的 DRAW_NUDGE_HELD
          sis.heldByPlayer = true;
          state.player.childArms = true;
        } else if (sis) sis.heldByPlayer = false;
        // 拦门那段过场演完，娘自己跑回窖口接着掀板（轨道在走位期间要撤掉，
        // 否则她指着手平移过去）
        const mm = FindActor(state, "mother");
        if (mm && !state.microCine) {
          if (mm.x > 30.8 && !mm.cineTarget) { mm.track = null; mm.cineTarget = { x: 29.95 }; mm.cineSpeed = 3.0; }
          else if (mm.x <= 30.8 && !mm.cineTarget && mm.track?.name !== "hatchGuard") {
            mm.heading = 1; mm.track = { name: "hatchGuard", t: 0 };
          }
        }
        // 玩家抱着她往屋门走：娘挡在门前，朝菜窖指——「下去！」
        b.blockCd = Math.max(0, (b.blockCd || 0) - dt);
        if (b.carrying && b.stepIndex === 1 && state.player.x > 33.3 && !state.microCine && b.blockCd <= 0) {
          b.blockCd = 6;
          state.player.x = 33.1;
          StartMicroCine(state, [
            { act: "娘挡在门前，朝菜窖指。", d: 1.8,
              cam: CINE(33.6, 0.55, 2.90, [FG.kangLow(1.82, 1.2, 0.22)]),
              on: (s) => {
                const m = FindActor(s, "mother");
                if (m) { m.pose = null; m.track = { name: "pointHard", t: 0 }; m.x = 34.2; m.heading = -1; }
              } },
            // 指着的那只手要一直指到话说完——所以这一句不清轨道也不走位。
            // 跑回窖口由下面 tick 里那段收尾（过场一结束才动身）
            { who: "娘", say: "下去！", d: 1.6,
              cam: CINE(34.0, 0.46, 2.90, [FG.jambR(1.83, 0.32, 1.0, 1.98)]) },
          ]);
        }
      },
      steps: [
        // ① 抱起妹妹：她两条胳膊立刻搂住脖子（此后 tick 把她贴在怀里）。
        // **四动词的第一课**（2026-08-16）：抱起来＝按住 E ＋ ↑ 把人兜起来。
        // 这一下往后要用五次（抱坛子、抱她够石笔、摇水、掀草苫、缝第一针），
        // 玩家学的是"往上使劲"，不是"按一下就有"
        // 使劲那 0.9 秒弯着腰（真正兜起来那一下是 effect 里的 scoopChild 轨道）
        { type: "use", zone: { x: 30.9, w: 2.4 }, hold: 0.9, stroke: "up", gestureY: 0.62,
          pose: "bow", prompt: "抱起妹妹",
          note: "妹妹两条胳膊立刻搂住他的脖子。",
          effect: (state) => {
            state.beat.carrying = true;
            const sis = FindActor(state, "sister");
            if (sis) { sis.following = false; sis.pose = "leanIn"; }
            Cue(state, "clothLift", { gain: 0.5 });
            // 蹲下去→兜到腋下→起身：有过程的动作不许只摆一个造型
            FlashTrack(state, "scoopChild", 1.1);
          } },
        // ② 抱到窖口：她一直在他怀里——**不放下、不换手、不挪位置**。
        // 老版这一步 `carrying=false` 之后顺手把她挪到 under/x=30.7，
        // 于是玩家还站在窖口上头，她已经在窖底站着了（用户报的瞬移）
        { type: "goto", zone: { x: 29.3, w: 1.8 },
          effect: (state) => {
            StartMicroCine(state, [
              { act: "柱子把她往上托了托，腾出一只手扒住梯子横档。", d: 3.4,
                cam: { kind: "free", from: [30.62, 0.86, 2.90], to: [30.55, 0.84, 2.70], at: [29.78, 0.46], atTo: [29.80, 0.42],
                  fg: [{ art: "vat", u: -0.72, v: -0.44, z: 1.40, w: 0.55, h: 0.55, dim: 2.02 }] },
                on: (s) => {
                  // 往上颠一下把她托稳（抱着人腾手之前都得先这么一下），
                  // 不再是"把她放上梯子"——她不下来
                  FlashTrack(s, "hoistChild", 1.4);
                  Cue(s, "clothLift", { gain: 0.4, rate: 0.9, delay: 0.5 });
                  Cue(s, "ladder", { gain: 0.4, rate: 1.1, delay: 1.2 });
                } },
            ]);
          } },
        // ③ 沿梯子下到窖底
        { type: "goto", zone: { x: 30.6, w: 2.6, level: "under" },
          effect: (state) => {
            // 旗标落在 effect 里（跳幕只跑 effect）：lidShut 一落，
            // 渲染层的盖板合上、板缝光条亮起来
            state.flags.lidShut = true;
            // 到窖底了才松手。**放下 ≠ 瞬移**：她落在他脚边（他这会儿站的地方），
            // 不是被搬到窖底另一头去——老版写死 x=30.9，玩家在 29 点几的地方
            // 松开手，她却出现在两米开外
            state.beat.carrying = false;
            const sis = FindActor(state, "sister");
            if (sis) {
              sis.heldByPlayer = false; sis.following = false;
              sis.level = "under"; sis.lift = 0;
              sis.x = (state.player.x || 30.9) + 0.35;
              sis.heading = -1; sis.pose = "leanIn";
            }
            StartMicroCine(state, [
              { act: "娘跪在窖口，一只手压着翻板。外面的脚步已经到了院门口。", d: 3.2,
                cam: { kind: "free", from: [30.98, 0.54, 3.02], to: [30.92, 0.52, 2.86], at: [29.95, 0.54], atTo: [29.95, 0.52],
                  // **机位不许沉到地平线以下**（2026-08-14 实拍抓的）：想从窖底仰头看
                  // 洞口的娘，机位得摆在窖顶与地表之间——那儿是**实心土**，近侧剖面
                  // （NEAR_Z 的那刀土）只在窖室那一块掏了洞。拍出来是满屏土，人不见了。
                  // 所以这三句改成贴着地面的平视 + 缓推；"从底下看"那股劲交给低机位。
                  fg: [{ art: "vat", u: -0.76, v: -0.52, z: 1.50, w: 0.55, h: 0.55, dim: 2.02 }] },
                on: (s) => {
                  const m = FindActor(s, "mother");
                  if (m) { m.x = 29.95; m.heading = -1; m.pose = null; m.track = { name: "hatchGuard", t: 0 }; }
                  Cue(s, "step", { gain: 0.4, rate: 1.2, delay: 1.6 });
                } },
              { who: "娘", say: "搂紧她。", d: 2.2,
                cam: { kind: "free", from: [30.98, 0.54, 3.02], to: [30.92, 0.52, 2.86], at: [29.95, 0.54], atTo: [29.95, 0.52],
                  fg: [{ art: "vat", u: -0.76, v: -0.52, z: 1.50, w: 0.55, h: 0.55, dim: 2.02 }] } },
              { who: "娘", say: "不叫你们，别上来。", d: 3.0,
                cam: { kind: "free", from: [30.98, 0.54, 3.02], to: [30.92, 0.52, 2.86], at: [29.95, 0.54], atTo: [29.95, 0.52],
                  fg: [{ art: "vat", u: -0.76, v: -0.52, z: 1.50, w: 0.55, h: 0.55, dim: 2.02 }] } },
              // 翻板合上。最后消失在板缝里的是娘那截蓝底白花的袖子——
              // **同一个仰角机位演完**（不切特写：那条规矩这一场通用），
              // 盖板真的绕铰链落回去，落到底才是那声闷响
              { act: "翻板合上。最后消失在板缝里的，是娘那截蓝底白花的袖子。", d: 4.0,
                cam: { kind: "free", from: [30.78, 0.46, 2.62], to: [30.74, 0.45, 2.48], at: [29.92, 0.44], atTo: [29.92, 0.42],
                  fg: [{ art: "vat", u: -0.78, v: -0.56, z: 1.35, w: 0.5, h: 0.5, dim: 2.02 }] },
                on: (s) => {
                  // rate 1.8 ＝ 0.56 秒就扣死，而 lidLower 那只手 t=0.9 才够到
                  // 地面那条缝、t=1.2 才抽回来——板在她手落下去之前就合上了，
                  // 「最后消失在板缝里的是那截袖子」于是无处可演。1.176 秒合完，
                  // 闷响跟着挪到落到底那一刻
                  s.lid = { id: "cellarHatch", open: 1, to: 0, rate: 0.85 };
                  Cue(s, "doorCreak", { gain: 0.5, rate: 0.75 });
                  Cue(s, "drop", { gain: 0.8, rate: 0.62, delay: 1.18 });
                  // 盖板一合，窖里就黑下来（World 的罩子按这个档走 2.6 秒的曲线，
                  // 板缝那几束光同时从"整格天光"收成三条）。旗标仍落在 effect 里，
                  // on() 只管画面——跳幕直落 c1_hide 时由它自己的 timeOfDay 接手
                  s.lightOverride = "dark";
                  // 老版在这一句就把她打发去 x=60：板还在往下落，人已经跑了——
                  // 而这一句要看的正是**板缝里最后那截袖子**。现在她跪在原地
                  // 按着板（lidLower：手跟着板一路压下去），跑是下一句的事
                  const m = FindActor(s, "mother");
                  if (m) { m.pose = null; m.cineTarget = null; m.x = 29.95; m.heading = -1; m.track = { name: "lidLower", t: 0 }; }
                } },
              // ── 第二处左右分屏：一格底下、一格头顶，同一刻。
              // 这一句剧本里本来就是**只有声音**的一行（〔音〕头顶传来娘急促的
              // 脚步）。整屏镜头只能二选一：拍窖底就听不见上头、拍上头就丢了
              // 两个孩子。分屏把「命藏在脚底下」这个题眼直接摆成一张画——
              // 左边黑的那一格里有两个人，右边亮的那一格里一个人也没有了。
              { act: "头顶传来娘急促的脚步。她从后门跑出去了。", d: 4.4,
                cam: {
                  kind: "split",
                  left: { from: [31.62, UNDER_Y + 0.98, 2.95], to: [31.56, UNDER_Y + 0.96, 2.72], at: [31.05, UNDER_Y + 0.58], atTo: [31.05, UNDER_Y + 0.56] },
                  right: { from: [31.18, 1.06, 3.20], to: [31.20, 1.05, 3.02], at: [30.25, 0.82], atTo: [30.25, 0.81] },
                  fg: [{ art: "ladder", side: "left", u: -0.86, v: 0, z: 1.30, w: 0.34, h: 1.0 }],
                },
                on: (s) => {
                  const m = FindActor(s, "mother");
                  if (m) { m.track = null; m.pose = null; m.cineTarget = { x: 60 }; m.cineSpeed = 3.0; m.heading = 1; m.cineVanish = true; }
                  Cue(s, "step", { gain: 0.7, rate: 0.95 });
                  Cue(s, "step", { gain: 0.55, rate: 0.9, delay: 1.2 });
                  Cue(s, "doorCreak", { gain: 0.4, delay: 2.2 });
                  Cue(s, "step", { gain: 0.35, rate: 0.85, delay: 3.0 });
                } },
            ]);
          } },
      ],
    },
    {
      // 序 · 玩家操作④（八稿）：长按搂紧她。松手写成了会被听见的事——
      // **松手她的呼吸立刻变响，头顶的脚步就停住**；重新按住，脚步才继续。
      // 头顶那场翻箱倒柜只在按住时往前走：前门被踹开、碗摔碎、木箱拖开、
      // 粮袋割破；靴子踩上翻板，灰从板缝落下来；屋外一声喊，靴子离开。
      // 光照走 dark 档（罩子 0.52、土黑）：盖板合上的窖底就该是黑的，
      // 「打进来的光」要有黑给它打进来才成立。
      kind: "hold", id: "c1_hide", timeOfDay: "dark", indoorScene: true, bgm: null, grade: 0.82,
      zone: { x: 31.0, w: 3.2, level: "under" }, holdTime: 15, sustain: true,
      // 按住的十五秒走循环轨道（呼吸＋每轮收紧一下），松手当帧撤掉；
      // holdPose 留着当兜底口径
      holdPose: "shelter", holdTrack: "hugTight",
      holdPrompt: "按住 E · 搂紧她",
      objective: "搂紧她，别出声", hint: "松手，她的呼吸就会传上去",
      note: "声音过去了。板缝里那几条光，从直的变成斜的。",
      onEnter: (state) => {
        const sis = FindActor(state, "sister");
        if (sis) {
          sis.visible = true; sis.level = "under"; sis.following = false;
          // 30.8 时两个人隔着 0.65m，胳膊够不着——搂紧那一拍搂的是空气
          sis.cineTarget = null; sis.x = 30.98; sis.heading = 1; sis.pose = "leanIn"; sis.lift = 0;
          sis.track = { name: "tremble", t: 0, ambient: true };
        }
        // **娘不在这儿收**（2026-08-14 实拍抓出来的老 bug）：上一拍的最后一步
        // 在 effect 里起了微过场，而它同时是链的**最后一步**——AdvanceBeat 当帧
        // 就把这一拍压上来（CLAUDE.md 那条"微过场起在最后一步要垫一步 goto"说的
        // 就是它），于是 onEnter 在微过场第 0 行还没播的时候先把她抹了。
        // 结果是：「搂紧她。」「不叫你们，别上来。」连同**最后消失在板缝里的
        // 那截蓝底白花袖子**，整段演给一个空画框看。
        // 收人的活挪进 tick，等微过场演完再收（她自己会跑出画外，见 cineVanish）。
        state.flags.lidShut = true;
        state.player.x = 31.45;
        state.player.heading = -1;
        state.lid = null;                    // 板已经合上了
        // 头顶那阵动静从最近处开始，整整 15 秒一路退远——「声音过去了」
        // 是这一拍要玩家**听出来**的东西，所以它是一条连着走的曲线，
        // 不是一张定时表
        SetDin(state, 1.0, 0, 0.08);
      },
      tick: (state, dt) => {
        const b = state.beat;
        // 微过场演完（或跳幕直落这儿压根没演）才把娘收走——她这会儿已经出了院
        if (!state.microCine) {
          const m = FindActor(state, "mother");
          if (m && m.visible) { m.cineTarget = null; m.visible = false; }
        }
        const holding = state.player.track?.name === "hugTight" || state.player.pose === "shelter";
        // 头顶那场翻箱倒柜只在按住时往前走：松手，脚步停住听你们（八稿）
        if (holding) b.hideT = (b.hideT || 0) + dt;
        // 快过去的时候来一阵风，把最后那点声音扫走
        if (!b.gusted && (b.hideT || 0) > 12.4) { b.gusted = true; Cue(state, "windGust", { gain: 0.4, rate: 0.9 }); }
        // 屋里那几下是有先后的（踹门→碗碎→拖箱→割粮袋→踩上翻板→喊→离开）：
        // 这条时刻表压在 SetDin 那条退远的曲线上头，一遍，不循环
        const CUES = [
          [2.4, "knock", 0.9, 0.7],       // 前门被一脚踹开
          [2.9, "doorCreak", 0.7, 0.6],
          [3.8, "step", 0.7, 0.8],        // 靴子踩进屋里
          [4.8, "stoneLand", 0.6, 1.5],   // 碗摔碎
          [5.8, "doorCreak", 0.5, 0.5],   // 木箱被拖开
          [6.9, "clothLift", 0.55, 0.6],  // 粮袋被割破，谷粒落了一地
          [7.4, "flutter", 0.4, 0.7],
          [8.6, "step", 0.65, 0.7],       // 靴子踩上菜窖翻板
          [9.3, "doorCreak", 0.35, 0.55],
          [11.6, "shout", 0.4, 0.9],      // 屋外有人喊了一声
          [12.2, "step", 0.5, 0.85],      // 靴子离开翻板
        ];
        b.hideFired = b.hideFired || new Set();
        for (let i = 0; i < CUES.length; i += 1) {
          const [t, name, gain, rate] = CUES[i];
          if ((b.hideT || 0) >= t && !b.hideFired.has(i)) {
            b.hideFired.add(i);
            Cue(state, name, { gain, rate });
          }
        }
        // 靴子踩上翻板那一段：灰从板缝里落下来
        if ((b.hideT || 0) > 8.6 && (b.hideT || 0) < 12.2) {
          b.dustT = (b.dustT || 0) + dt;
          if (b.dustT > 1.1) { b.dustT = 0; state.slatDust = { t: 0 }; }
        }
        // 妹妹在怀里抖：按住抖得轻；松手那阵抖从怀里传出去，呼吸立刻变响
        const sis = FindActor(state, "sister");
        if (sis && sis.track?.name === "tremble") sis.trembleK = holding ? 0.5 : 1;
        if (!holding) {
          b.sobT = (b.sobT || 0) + dt;
          if (b.sobT > 1.6) { b.sobT = 0; Cue(state, "sobBreath", { gain: 0.55, rate: 1.15 }); }
        } else b.sobT = 0;
        // 心跳：越到后头越沉（同 c2_hush）
        b.heartT = (b.heartT || 0) + dt;
        const beatEvery = 1.2 - 0.35 * (b.holdProgress / 15);
        if (b.heartT > beatEvery) {
          b.heartT = 0;
          Cue(state, "heartbeat", { gain: 0.3 + 0.18 * (b.holdProgress / 15) });
        }
      },
      onDone: (state) => {
        // 光从直的变成斜的：时间自己走过去了
        state.beamSlant = 0.4;
        StopDin(state);
        const sis = FindActor(state, "sister");
        if (sis && sis.track?.name === "tremble") { sis.track = null; sis.trembleK = 0; }
      },
    },
    {
      // §1 冷灶（八稿）：序的收尾——旁白「没人来叫」，**章名卡**「第一章 ·
      // 蓝底白花」，三天后。然后一声小孩那种咕噜噜的肚子叫，空镜把"安静"
      // 说完：冷灶、粮瓮底那薄薄一层糜子、缸底半瓢、塌了半边的牲口棚（橛子
      // 还钉在地上，缰绳没有断口——是解走的）、倒在墙边的空鸡笼、炕上蜷着的
      // 妹妹——镜头钉在她的手腕上：去年的褂子短了一截，袖口遮不住手腕。
      // 章目标落在收尾：天黑前，给妹妹弄一顿热饭。
      // 头一句还在合着盖板的窖底（接 c1_hide 的黑），所以这一拍从 dark 起，
      // 「三天后」那一句才翻回拂晓（lightOverride = "dawn"）
      //
      // **2026-08-16 改成 chain(1)**（Notion 第九稿的第 4 拍）：整场戏一个字没动，
      // 只把最后那下「替她把脚盖好」从演出改成玩家自己做——**「往下」这个动词
      // 第一次出现，是件温柔的事**。往后它要重用四次（刨灰堆、画正字、放桶下井、
      // 倒水进缸），先在安全的地方学会，再在要命的地方用。
      kind: "chain", id: "c1_open", timeOfDay: "dark",
      objective: "给妹妹盖上", hint: "她一只脚露在外面",
      onStart: (state) => StartMicroCine(state, [
        // 序的收尾：柱子仍然搂着妹妹。板缝里的光从直的变成斜的（beamSlant
        // 已由 c1_hide 落下），又一点点暗下去
        { act: "柱子仍然搂着妹妹。板缝里的光从直的变成斜的，又一点点暗下去。", d: 4.2,
          cam: { kind: "free", from: [31.62, UNDER_Y + 1.00, 3.05], to: [31.56, UNDER_Y + 0.97, 2.68], at: [31.10, UNDER_Y + 0.60],
            // 梯子帮竖在画框左缘：这一格里唯一的出路，也是他们不许上去的那条
            fg: [{ art: "ladder", u: -0.86, v: 0, z: 1.30, w: 0.34, h: 1.0 }] },
          on: (state) => {
            state.beat.indoorScene = true;
            state.beamSlant = 0.4;
            StopDin(state);
            StopDin(state);
            const sis = FindActor(state, "sister");
            if (sis) { sis.visible = true; sis.level = "under"; sis.x = 30.9; sis.heading = 1; sis.pose = "leanIn"; }
            state.player.x = 31.3;
            state.player.heading = -1;
            // 序的收尾还是搂着的——用会喘的循环轨道，不是一张 4 秒的定格
            state.player.pose = null;
            state.player.track = { name: "hugTight", t: 0 };
          } },
        // 序的收尾这一串黑屏原来是 2.8+3.6+3.0+2.6＝**十二秒**连着的黑：
        // 一句四个字的旁白、一张章名卡、一句"三天后"、一声肚子叫，全在黑里
        // 各占三秒（2026-08-14 用户退回）。四句都收到"说完就走"，章名卡只留
        // 它自己淡入淡出要的那点时间。
        // 全序场唯一一句真旁白，也是音乐**唯一**该进来的地方：前面十几分钟
        // 一个音符都没有，这一句才压得住（曲子见 Data_BgmConfig.EXTRA_BGM）
        { stage: "没人来叫。", d: 1.6, cam: { kind: "dark" },
          on: (state) => { state.bgmOverride = "thatDay"; } },
        // 章名卡：第一章 · 蓝底白花（八稿明令——章名出现在序的末尾，
        // 不在开局；state.titleCard 由 Main 画成居中的章名字样）
        { act: "", d: 2.7, cam: { kind: "dark" },
          on: (state) => { state.titleCard = { num: "第一章", title: "蓝底白花", t: 0, dur: 2.5 }; } },
        // 「三天后」是**字卡**不是旁白（剧本：〔字卡〕随后出现：三天后），
        // 所以跟章名卡、章末字样同一支笔走 titleCard，不走字幕通道。
        // 字卡的 dur 要比行的 d 短 0.2：SyncHud 拿末尾 0.6 秒淡出，卡得留得下
        { act: "", d: 2.2, cam: { kind: "dark" },
          on: (state) => {
            state.titleCard = { num: "", title: "三天后", t: 0, dur: 2.0 };
            // 时间翻页：兄妹回到地面，翻板重新敞着，光条收起，天亮回来
            state.flags.lidShut = false;
            state.beamSlant = 0;
            state.lightOverride = "dawn";
            const m = FindActor(state, "mother");
            if (m) { m.visible = false; m.cineTarget = null; }
            const sis = FindActor(state, "sister");
            if (sis) { sis.level = "surface"; sis.x = 30.75; sis.heading = -1; sis.pose = "sleep"; }
            state.player.level = "surface";
            state.player.x = 33.2;
          } },
        // 黑屏一声肚子叫——不是大人的，是小孩那种咕噜噜的空响
        { act: "", d: 1.4, cam: { kind: "dark" },
          on: (state) => { Cue(state, "bellyGrowl", { gain: 0.9, delay: 0.25 }); } },
        // ── §1 冷灶（2026-08-16 照 Notion《过场分镜》第一章 01~04 重排）──────
        // 老版这四镜全是裸的 `insert`/`shot`：侧视、机位对着人、**一块前景都没有**。
        // 而分镜图每一张都有一件压得很暗、被画框切掉的近景（灶台肩、瓮肚、缸沿、
        // 炕沿），画面里唯一真正黑的地方就是它。`insert` 走不了这条路——
        // `SetCineFore` 的 u/v 折算只在 `free`/`split` 那两档拿得到相机
        // （Main 的 `shot.free ? {left: shot.free} : null`），裸 insert 传进去的
        // u/v 会被 `ForePlace` 当成世界坐标，板子直接飞到村东头。
        // 所以这四镜连同全章的过场一律改走 `free`。
        // 换算口径见文件头 `CINE` 那段（黑边吃掉可见画高两成三，尺子是
        // 画宽 = 身高 / (占可见画高 × 0.432)）。
        // 分镜图 01：灶在画左，柱子蹲在灶右侧伸手进灶膛，蹲姿 0.66m 占可见
        // 画高约四成 ⇒ 画宽 4.2m；注视点压到灶膛口那一带，地面才进得来
        { act: "灶是冷的。柱子蹲在灶前，摸了一把锅底——干的。", d: 4.0,
          cam: CINE(27.98, 0.58, 4.20, [FG.vatL(2.65, 0.72, 0.66, 2.02)]),
          on: (state) => {
            state.beat.indoorScene = true;
            // 序的那首曲子托完四行黑屏就交班：画面一回来，第一章的底色接上
            state.bgmOverride = undefined;
            state.player.x = 28.4;
            state.player.heading = -1;
            FlashTrack(state, "panBottom", 3.2);
          } },
        // 粮瓮（八稿新增）：掀开，瓮底只剩薄薄一层糜子
        // 分镜图 02：人和瓮各占半幅、顶天立地（人占画高七成半），头顶只留一线墙。
        // 图上人在左瓮在右，游戏里瓮在西（画左）——**镜像等价就够了**，别翻世界
        //（面朝 +z 的立牌绕到背面会被单面材质剔掉）
        // 分镜图 02：人和瓮各占半幅、顶天立地。**画宽不能收到 2.5m**——
        // 那样他从大腿往下就被下黑边吃掉了（第二轮视觉审查抓的）。
        // 柱子站着 1.10m 占可见画高约七成 ⇒ 画宽 3.8m
        { act: "他掀开粮瓮。瓮底只剩薄薄一层糜子。", d: 3.8,
          // **梁的 v 不许给到 0.7 以上**：过场上下各压着一条黑边（可见画高的
          // 一成一），梁身会整根缩进上边框里，屏幕上只剩一排悬空的黑齿——读成
          // 「挂在电线上的黑方块」（CLAUDE.md 那条坑，第一版又踩了一次）
          cam: CINE(27.12, 0.60, 3.80, [{ art: "beam", u: 0, v: 0.32, z: 2.39, w: 1.9, h: 0.30, dim: 2.02 }]),
          on: (state) => {
            state.beat.indoorScene = true;
            state.player.x = 27.5;
            state.player.heading = -1;
            FlashTrack(state, "liftJarLid", 3.4);
            Cue(state, "stoneLand", { gain: 0.3, rate: 0.7, delay: 1.55 });   // 盖子落到一边
          } },
        // 分镜图 03：柱子在画左、缸在画右，瓢探进缸里。人占画高七成
        { act: "水缸见了底。瓢探下去，刮着缸底响。提上来，小半瓢——凑着瓢沿抿了一口，剩下的倒进锅里。", d: 5.6,
          // 这一镜在院子里，上半屏本来是天和地平线上那排炮楼——而分镜 03
          // 是贴着屋里那面平墙。压一根门框柱在画右把天际线吃掉
          cam: CINE(43.05, 0.56, 4.00, [
            { art: "doorJamb", u: 0.78, v: 0, z: 2.52, w: 0.82, h: 1.16, dim: 1.94, flip: true },
            { art: "kangEdge", u: -0.74, v: -0.72, z: 2.68, w: 0.80, h: 0.26, dim: 1.94 },
          ]),
          on: (state) => {
            // 字幕在摸瓢，画面里就得有人在缸边摸（首轮视觉审查退回的空缸镜）
            state.player.x = 42.7;
            state.player.heading = 1;
            FlashTrack(state, "scoopVat", 5.2);
            Cue(state, "bucketKnock", { gain: 0.4, rate: 0.8, delay: 1.2 });   // 瓢刮着缸底
            Cue(state, "waterDrip", { gain: 0.4, delay: 3.0 });
          } },
        // 这两镜（棚子/鸡笼）在锁定镜表上没有对应格——空镜留着，但照分镜图
        // 第二节那套语汇重排：塌下来的椽子压住上边框，画面里唯一的黑在前景上
        { act: "牲口棚塌了半边，棚里空着。拴牲口的橛子还钉在地上，缰绳没了——木桩上没有断口。不是断的，是解走的。", d: 5.6,
          cam: { kind: "free", from: [10.60, 1.02, 6.30], to: [10.52, 1.00, 6.00],
            at: [10.40, 0.95], atTo: [10.40, 0.94],
            fg: [
              { art: "beam", u: 0.05, v: 0.46, z: 3.9, w: 2.0, h: 0.22, dim: 2.09 },
              { art: "doorJamb", u: -0.88, v: 0, z: 3.6, w: 0.34, h: 1.05, dim: 1.94 },
            ] } },
        // 鸡笼（八稿新增）：倒在墙边。里面是空的
        { act: "鸡笼倒在墙边。里面是空的。", d: 3.0,
          cam: { kind: "free", from: [36.68, 0.58, 2.30], to: [36.66, 0.57, 2.18],
            at: [36.60, 0.52], atTo: [36.60, 0.51],
            fg: [{ art: "strawEdge", u: 0.10, v: -0.86, z: 1.35, w: 1.2, h: 0.26, dim: 1.86 }] } },
        // 分镜图 04 的前一格：他回到屋里，炕上那个人蜷着。双人镜，人占画高四成
        { act: "柱子回到屋里。妹妹蜷在炕上，头发贴着脸。破袄只盖住肚子，一只脚露在外面。", d: 4.6,
          cam: { kind: "free", from: [32.05, 1.02, 5.20], to: [31.98, 1.00, 4.95],
            at: [31.85, 0.92], atTo: [31.82, 0.90],
            fg: [
              // 他刚从门口进来：门框柱压住画右
              { art: "doorJamb", u: 0.86, v: 0, z: 3.5, w: 0.36, h: 1.05, dim: 1.86, flip: true },
              { art: "kangEdge", u: -0.42, v: -0.92, z: 3.8, w: 1.4, h: 0.22, dim: 1.78 },
            ] },
          on: (state) => {
            state.beat.indoorScene = true;
            // 说睡着就得真躺着：铺盖（beddingMat, 31.15）上侧躺蜷着
            const sis = FindActor(state, "sister");
            if (sis) { sis.visible = true; sis.level = "surface"; sis.x = 30.75; sis.heading = -1; sis.pose = "sleep"; }
            state.player.x = 33.2;
            state.player.heading = -1;
          } },
      ]),
      steps: [
        // 玩家自己蹲下去替她把脚盖好——**全作「往下」的第一课**。
        // 分镜 04 正格：炕在画左（她侧躺着），柱子跪在炕沿外侧掖被
        { type: "use", zone: { x: 31.9, w: 2.4 }, hold: 1.1, stroke: "down", gestureY: 0.45,
          pose: "bow", prompt: "给她盖上",
          effect: (state) => {
            FlashTrack(state, "tuckQuilt", 2.4);
            Cue(state, "clothLift", { gain: 0.5, delay: 0.2 });
            StartMicroCine(state, [
              // 分镜 04：炕在画左，柱子跪在炕沿外侧替她掖被。
              // **照站姿身高配机距会松一档**（跪着的柱子实测只有 0.59m）；注视点
              // 还要压到炕面高度，不然上半屏一片空墙、两人的小腿又被下黑边切掉
              { act: "柱子替她把脚盖好。", d: 2.4,
                cam: CINE(31.48, 0.40, 3.60, [
                  { art: "kangEdge", u: -0.34, v: -0.86, z: 2.27, w: 1.30, h: 0.26, dim: 1.86 },
                  { art: "doorJamb", u: 0.86, v: 0, z: 2.27, w: 0.50, h: 1.00, dim: 1.94, flip: true },
                ]),
                on: (s) => {
                  s.beat.indoorScene = true;
                  s.player.x = 32.2;
                  s.player.heading = -1;
                } },
              // 镜头停在她的手腕上：去年的褂子短了一截，袖口遮不住手腕。
              // ——章末那一针一针，就是缝给这截手腕的
              { act: "去年的褂子已经短了一截，袖口遮不住手腕。", d: 3.8,
                cam: WRIST_CAM,
                on: (s) => { s.beat.indoorScene = true; } },
              { stage: "第三天。还是没人来叫。", d: 3.2,
                cam: WRIST_CAM,
                on: (s) => {
                  // 章目标（八稿）：这一天全部的事，都归到这一句底下
                  s.toast = { text: "章目标：天黑前，给妹妹弄一顿热饭。", t: 5.5 };
                } },
            ]);
          } },
      ],
    },
    {
      // §2 牲口棚（八稿删繁就简：七道手收成**四道**，动词不重样）：
      //   ① **推焦木**（抓住焦木向旁边拖——机制同拖门板，画的是焦木檩；
      //      木头蹭地落一层黑灰，底下露出半袋粮食）→
      //   ② 解袋口（自动）——袋里全是谷种。**娘的声音**：「留种。谁也不能动。」
      //      → **扎回袋口**（拧紧、绕绳、压回砖下，苇席重新盖好）→
      //   ③ **刨开灰堆**（第一把浮灰是滑的、第二把硬土拖不快、第三把拽到
      //      半道手钉住——指甲碰上坛肩；换方向顺着肩抹三把，抹哪儿露哪儿）→
      //   ④ **抠开泥封＋揭碗片**（活卡照用）。碗片底下垫着一圈**蓝底白花
      //      碎布**——画面短暂切回娘跪在窖口的手臂，再切回坛子。
      // 路过三婶家的纺车、墙上的弹孔：**没有字幕，镜头不停**（八稿明令——
      // 七稿的两个停顿注视删了，看见就走）。
      kind: "chain", id: "c1_forage", timeOfDay: "day",
      objective: "棚里翻翻，看有没有能下锅的",
      hint: "西头那间棚。能翻的有三处：翻倒的食槽、压着苇席的那堆、墙根一片发白的烧土",
      // 三处的坐标（World 照这三个数把三件东西画出来）。**先翻哪处玩家自己挑**
      //
      // 2026-08-16（第九稿）：Notion 那版写的是"压成一条五步直链"，**没照做**——
      // 8-15 用户刚为「找东西不能排成一条直线」退回过一次（CLAUDE.md 有整节）。
      // 这一场因此只换**输入**：三处的动作全部改由「按住 E ＋ 方向」驱动
      // （掀席 E＋↑ / 扫槽底·刨灰堆 E＋↓ / 顺着坛肩抹 E＋←→ / 抠泥封 E＋↑），
      // 拟物的分量、脱手、卡口一条没动。要真收成直链，把这一步换掉即可。
      forage: { trough: 11.6, reed: 9.7, ash: 7.4 },
      onStart: (state) => {
        // 妹妹还在铺盖上睡（立面合着自然看不见她）；序里的人早收干净了
        const sis = FindActor(state, "sister");
        if (sis) { sis.visible = true; sis.level = "surface"; sis.following = false; sis.cineTarget = null; sis.pose = "sleep"; sis.x = 31.15; sis.heading = -1; }
        const m = FindActor(state, "mother");
        if (m) m.visible = false;
        state.flags.lidShut = false;
        state.player.level = "surface";
      },
      steps: [
        // 出门往西：纺车退回纯布景，弹孔墙给**一条手记、脚不停**
        //（2026-08-13 用户两轮退回：路过的注视不许接管镜头——弱提醒走链步骤的
        // note→toast；纺车连手记也砍了，它离弹孔墙才两米半，两句会互相顶掉）
        { type: "goto", zone: { x: 22.8, w: 2.2 },
          note: "贴告示那面墙上，一排弹孔。" },
        { type: "goto", zone: { x: 13.2, w: 2.8 },
          note: "棚顶塌了半边。地上的东西一样样都还在，就是都埋了半截。" },
        // ── 翻三处，顺序随玩家（2026-08-15 重做，解析见 Core 的 SearchSpotNow）──
        // 老版是「推焦木」：拖一根横在地上的烧焦檩条，用户退回——「太奇怪了
        // 解密也不算 也很不直观 我都不知道要操作这里 只有一个 hint」。
        // 病根不在那根木头，在**链是一条直线**：这一场叫"找吃的"，可玩家只能
        // 走到剧本指定的那一处、做剧本指定的那一下。现在三处各摆各的、各给
        // 各的，先翻哪处自己挑；三处都翻过了才走。
        { type: "searchAny",
          idleAfter: 9,
          idleNote: "过道当中的土是硬的。娘不会把东西埋在人走的地方——挨着墙根、压在东西底下找。",
          note: "棚里能翻的都翻遍了。",
          spots: [
            // ① 翻倒的食槽：槽底那层秕谷壳一把一把扫进兜里。**最好懂的一处**，
            // 也是从东边进棚第一眼就撞见的
            {
              key: "trough", x: 11.6, hintIcon: "dig",
              note: "槽底扫出一小把秕谷壳。不多，撒进锅里能顶点数。",
              effect: (state) => { state.flags.chaffGot = true; },
              steps: [
                { type: "scoopAsh", part: "trough", zone: { x: 11.6, w: 2.2 } },
              ],
            },
            // ② 压着苇席的那堆：掀开是娘留的谷种。**全章的题眼在这儿**——
            // 饿着的人把一袋能吃的谷种原样扎回去，道理由手做出来，不靠旁白
            {
              key: "reed", x: 9.7, hintIcon: "fold",
              note: "谷种原样扎回去，苇席重新盖上。",
              steps: [
                { type: "heaveMat", part: "reed", zone: { x: 9.7, w: 2.2 },
                  note: "席子底下压着半袋东西。",
                  effect: (state) => { Cue(state, "flutter", { gain: 0.4, rate: 0.8 }); } },
                // 解袋口看一眼：袋里全是谷种。娘的话在这儿响起来——不是回忆画面，
        // 是声音自己找上来的
                { type: "use", zone: { x: 9.7, w: 2.2 }, prompt: "E · 解开袋口",
          effect: (state) => {
            Cue(state, "clothLift", { gain: 0.5 });
            StartMicroCine(state, [
              { act: "柱子解开袋口。袋里全是谷种。", d: 3.2,
                cam: CINE(9.7, 0.36, 2.90, [FG.jambL(1.83, 0.34, 1.0, 2.02)]),
                on: (s) => { FlashPose(s, "kneel", 3.0); } },
              { who: "娘的声音", say: "留种。谁也不能动。", d: 3.0,
                cam: CINE(9.7, 0.36, 2.90, [FG.beamTop(1.82, 1.8, 0.28)]) },
              { act: "柱子捻起几粒谷种，看了一会。", d: 3.0,
                cam: CINE(9.7, 0.36, 2.90, [FG.jambL(1.82, 0.34, 1.0, 2.02)]),
                on: (s) => { FlashPose(s, "kneel", 2.8); } },
            ]);
          } },
                // 扎回袋口：拧紧、绕绳、压回砖下。这一下不靠旁白解释：饿着的人
                // 把一袋**能吃的**谷种原样扎回去——留种是明年的命，道理由手做出来
                { type: "use", zone: { x: 9.7, w: 2.2 }, hold: 1.6, stroke: "right", gestureY: 0.55,
          pose: "twistTie", cue: "clothFold",
          prompt: "拧紧袋口",
          effect: (state) => {
            state.flags.seedKept = true;
            StartMicroCine(state, [
              { act: "袋口拧紧，绕绳，再压回砖下。", d: 3.0,
                cam: CINE(9.7, 0.36, 2.90, [FG.beamTop(1.81, 1.8, 0.28)]),
                on: (s) => {
                  FlashPose(s, "kneel", 2.8);
                  Cue(s, "stoneLand", { gain: 0.35, delay: 1.6 });
                } },
              { act: "柱子把苇席重新盖在粮种上。", d: 2.8,
                cam: CINE(9.9, 0.52, 2.90, [FG.jambL(1.83, 0.34, 1.0, 2.02)]),
                on: (s) => {
                  FlashPose(s, "bow", 2.2);
                  Cue(s, "clothDrop", { gain: 0.5, delay: 0.8 });
                } },
            ]);
          } },
              ],
            },
            // ③ 墙根一片发白的烧土：分层挖掘那套原样留着（浮灰滑／硬土拖不快／
            // 第三把手钉住／顺着坛肩抹）——它本来就是这一处的内容
            {
              key: "ash", x: 7.4, hintIcon: "dig",
              note: "十来片红薯干。够熬一锅。",
              steps: [
                { type: "scoopAsh", zone: { x: 7.4, w: 2.2 },
          note: "扒开周围的土——一个小口坛。坛口糊着泥，上面压着半块碗底。",
          effect: (state) => { state.flags.jarDug = true; } },
                // 抠开泥封、揭碗片（活卡）。碗片底下垫着一圈碎布——蓝底白花。
                // 画面短暂切回娘跪在窖口的手臂（序里那半张脸的机位），再切回坛子
                { type: "unwrapJar", zone: { x: 7.4, w: 2.2 },
          effect: (state) => {
            StartMicroCine(state, [
              { act: "碗片下面垫着一圈蓝底白花的碎布。", d: 3.2,
                cam: CINE(7.4, 0.39, 2.90, [FG.beamTop(1.81, 1.8, 0.28)]) },
              // 闪回：娘跪在窖口的手臂（一秒出头，硬切）
              { act: "", d: 1.3,
                cam: CINE(29.6, UNDER_Y + 3.5 - 0.26, 2.99, [FG.kangLow(1.45, 1.2, 0.22)]),
                on: (s) => {
                  const m = FindActor(s, "mother");
                  if (m) { m.visible = true; m.level = "surface"; m.x = 29.95; m.heading = -1; m.pose = null; m.track = { name: "lidLower", t: 1.0 }; }
                } },
              // 再切回坛子
              { act: "柱子把碎布展开。布已经磨毛，只剩巴掌大。", d: 3.6,
                cam: CINE(7.4, 0.39, 2.90, [FG.beamTop(1.81, 1.8, 0.28)]),
                on: (s) => {
                  const m = FindActor(s, "mother");
                  if (m) { m.visible = false; m.pose = null; }
                } },
              { act: "他将碎布叠好，揣进怀里。", d: 2.6,
                cam: CINE(7.4, 0.39, 2.90, [FG.jambL(1.81, 0.34, 1.0, 2.02)]),
                on: (s) => { FlashPose(s, "bow", 1.4); } },
              { act: "坛里装着十来片红薯干。他数了一遍。又数了一遍。", d: 4.2,
                cam: CINE(7.4, 0.39, 2.90, [FG.beamTop(1.81, 1.8, 0.28)]) },
            ]);
          } },
              ],
            },
          ] },
        // ⑥ 抱起坛子｜按住 E ＋ ↑——**「抱起来」的第二次**（第一次是逃命那天
        // 抱起妹妹）。同一个动作，这回抱的是吃的。
        // worldDrawn：坛子由 DrawAshMound 画（挖到哪儿露哪儿），不许再预摆一份
        // 地面道具——那份从进拍第一帧就蹲在灰堆顶上，把"埋着"整个剧透掉
        { type: "use", zone: { x: 7.4, w: 2.2 }, hold: 0.8, stroke: "up", gestureY: 0.5,
          pose: "bow", prompt: "抱起坛子",
          note: "坛子夹在胳膊底下，往回走。",
          effect: (state) => {
            GiveItem(state, { id: "driedYams", label: "红薯干" });
            // 坛子抱走了：堆上只剩那个刨开的坑
            const a = state.forage?.ash;
            if (a) { a.jar = false; a.open = false; a.taken = true; }
          } },
        { type: "goto", zone: { x: 33.6, w: 2.6 } },
      ],
    },
    {
      // 第二场（玩法）：分食（第七稿改成玩家的手）。三下：
      //   ① **掰**——泡软的红薯干，捏住哪儿就从哪儿断，你掰出一长一短；
      //   ② **分**——两截、两只碗，随你放；
      //   （她醒了。不管长的那截在谁碗里，她都伸手把长的推到你这边来。）
      //   ③ **换回去**——把它捞出来，水沥了沥，搁回她碗里。按下去那一下，
      //      就是这句：「吃你的。」
      // 红薯干泡软了才 0.12m，玩法景别里不到 1% 画宽——同石笔/接绳，
      // 长在铺满画框的活卡上（SPLIT_CARD → Art.DrawSplitCard）。
      // 这一版的善意谎不靠旁白点破，全长在推来推去那几下手上。
      kind: "chain", id: "c1_meal", timeOfDay: "day",
      objective: "分红薯干", hint: "泡软了。掰开，分进两只碗",
      onStart: (state) => {
        const sis = FindActor(state, "sister");
        if (sis) { sis.visible = true; sis.level = "surface"; sis.following = false; sis.cineTarget = null; sis.pose = "sleep"; sis.x = 31.15; sis.heading = -1; sis.mood = "sleepy"; }
        state.player.level = "surface";
      },
      steps: [
        { type: "goto", zone: { x: 34.4, w: 2.4 },
          effect: (state) => {
            state.player.item = null;
            StartMicroCine(state, [
              { act: "柱子把两片红薯干泡进碗里。温水。泡了一会，软了点。", d: 4.0,
                cam: CINE(34.9, 0.53, 2.90, [FG.kangLow(1.82, 1.2, 0.22)]),
                on: (s) => {
                  s.beat.indoorScene = true;
                  FlashPose(s, "kneel", 3.8);
                  Cue(s, "waterSplash", { gain: 0.3 });
                } },
            ]);
          } },
        // ①② 掰 + 分（活卡）
        { type: "split", zone: { x: 34.6, w: 2.6 },
          effect: (state) => {
            StartMicroCine(state, [
              { act: "身后传来被褥摩擦声。", d: 2.0,
                cam: CINE(33.4, 0.61, 3.07, [FG.jambR(1.93, 0.32, 1.0, 1.98)]),
                on: (s) => {
                  s.beat.indoorScene = true;
                  Cue(s, "clothLift", { gain: 0.3, rate: 0.9 });
                  s.player.heading = -1;
                } },
              { who: "妹妹", say: "哥？", d: 1.8,
                cam: CINE(32.4, 0.58, 2.91, [FG.kangLow(1.83, 1.2, 0.22)]),
                on: (s) => {
                  const sis = FindActor(s, "sister");
                  if (sis) { sis.pose = "kneel"; sis.x = 31.6; sis.heading = 1; }
                } },
              { act: "柱子回头。妹妹坐在炕上，头发还贴着脸。", d: 2.8,
                cam: CINE(32.4, 0.58, 2.91, [FG.jambR(1.83, 0.32, 1.0, 1.98)]) },
              { who: "妹妹", say: "你上哪了？", d: 2.2,
                cam: CINE(31.8, 0.50, 2.90, [FG.kangLow(1.82, 1.2, 0.22)]) },
              { who: "柱子", say: "没上哪。", d: 2.0,
                cam: CINE(33.6, 0.58, 2.91, [FG.jambR(1.83, 0.32, 1.0, 1.98)]) },
              { act: "妹妹从炕上下来，走到桌边。她先看自己的碗，又看柱子的碗。", d: 3.8,
                cam: CINE(34.4, 0.51, 2.90, [FG.kangLow(1.84, 1.2, 0.22)]),
                on: (s) => {
                  const sis = FindActor(s, "sister");
                  if (sis) { sis.pose = null; sis.cineTarget = { x: 34.0 }; sis.cineSpeed = 1.8; }
                } },
              // 不管长的那截在谁碗里，她都做同一件事
              { act: "她伸手，把长的那截推到柱子面前。", d: 3.0,
                cam: CINE(34.5, 0.48, 2.90, [FG.jambR(1.82, 0.32, 1.0, 1.98)]),
                on: (s) => {
                  const sis = FindActor(s, "sister");
                  if (sis) { sis.cineTarget = null; sis.x = 34.0; sis.heading = 1; sis.pose = "bow"; }
                  Cue(s, "pickup", { gain: 0.5, rate: 0.8 });
                } },
              { act: "她低下头，不再看他。", d: 2.4,
                cam: CINE(34.0, 0.44, 2.90, [FG.kangLow(1.82, 1.2, 0.22)]) },
            ]);
          } },
        // ③ 换回去（活卡第二段）：捞出来，提在半空沥两滴，放回她碗里
        { type: "split", phase: "swap", zone: { x: 34.6, w: 2.6 },
          effect: (state) => {
            state.flags.mealSplit = true;
            StartMicroCine(state, [
              { who: "柱子", say: "吃你的。", d: 2.6,
                cam: CINE(34.4, 0.55, 2.90, [FG.jambR(1.82, 0.32, 1.0, 1.98)]),
                on: (s) => {
                  const sis = FindActor(s, "sister");
                  if (sis) { sis.pose = "kneel"; sis.heading = 1; sis.carry = "红薯干"; }
                  FlashPose(s, "bow", 1.6);
                } },
              { act: "妹妹没再推。拿起来咬了一口。还是有些硬。", d: 3.2,
                cam: CINE(34.1, 0.50, 2.90, [FG.kangLow(1.82, 1.2, 0.22)]) },
              { act: "她把红薯干重新泡回水里，等了一会，再拿起来咬。", d: 3.8,
                cam: CINE(34.1, 0.50, 2.90, [FG.jambR(1.82, 0.32, 1.0, 1.98)]),
                on: (s) => { Cue(s, "waterDrip", { gain: 0.3, rate: 1.2, delay: 0.6 }); } },
              { act: "柱子端起自己的碗，把带甜味的水喝下去。", d: 3.6,
                cam: CINE(34.7, 0.68, 3.4, [FG.kangLow(2.14, 1.2, 0.22)]),
                on: (s) => {
                  const sis = FindActor(s, "sister");
                  if (sis) sis.carry = null;
                } },
            ]);
          } },
      ],
    },
    {
      // §4 第三道线（八稿加了开场问答）：她吃完舔手指，走到门框边仰头看那
      // 两道线——「今天还画吗？」「画。」她踮脚去够窗台上的石笔，够不到。
      // 柱子蹲下把她抱起来，一只手托住她，另一只手从窗台拿过石笔塞进她手里。
      kind: "chain", id: "c1_tally", timeOfDay: "day",
      objective: "陪妹妹在门框上画正字", hint: "那个高度她够不着——抱她一把",
      onStart: (state) => {
        const sis = FindActor(state, "sister");
        if (sis) { sis.visible = true; sis.level = "surface"; sis.cineTarget = null; sis.x = 32.0; sis.heading = 1; sis.pose = null; sis.carry = null; }
        state.player.cineWalk = null;
        state.player.level = "surface";
        state.player.x = 34.4;
        state.player.heading = -1;
        // 开场问答（chain 的 onStart 可以直接起微过场；跳幕不结算 onStart，
        // 但这段只有走位和台词，没有旗标）
        StartMicroCine(state, [
          { act: "妹妹吃完，舔了舔手指。她走到门框边，仰头看着门框低处的两道横线。", d: 4.4,
            cam: CINE(33.4, 0.58, 2.91, [FG.jambR(1.83, 0.32, 1.0, 1.98)]),
            on: (s) => {
              s.beat.indoorScene = true;
              const k = FindActor(s, "sister");
              if (k) { k.cineTarget = { x: 33.4 }; k.cineSpeed = 1.5; }
            } },
          { who: "妹妹", say: "今天还画吗？", d: 2.4,
            cam: CINE(33.4, 0.46, 2.90, [FG.kangLow(1.83, 1.2, 0.22)]),
            on: (s) => {
              const k = FindActor(s, "sister");
              if (k) { k.cineTarget = null; k.x = 33.4; k.heading = -1; k.pose = "mark"; }
            } },
          { act: "柱子把碗放下。", d: 1.8,
            cam: CINE(34.3, 0.52, 2.90, [FG.jambR(1.83, 0.32, 1.0, 1.98)]),
            on: (s) => { Cue(s, "drop", { gain: 0.3, rate: 1.1 }); } },
          { who: "柱子", say: "画。", d: 1.6,
            cam: { kind: "close", on: "player", dist: 3.0, fg: [FG.jambL(1.6, 0.30, 0.94, 2.02)] } },
          { act: "妹妹踮脚去够窗台上的石笔。她够不到。", d: 3.2,
            cam: CINE(34.0, 0.52, 2.90, [FG.kangLow(1.83, 1.2, 0.22)]),
            on: (s) => {
              const k = FindActor(s, "sister");
              if (k) { k.x = 34.3; k.heading = 1; k.pose = null; k.track = { name: "reachJump", t: 0, ambient: true }; }
            } },
          { act: "", d: 1.2, cam: CINE(34.0, 0.52, 2.90, [FG.jambR(1.83, 0.32, 1.0, 1.98)]),
            on: (s) => {
              const k = FindActor(s, "sister");
              if (k) { k.track = null; k.x = 33.9; k.heading = 1; }
            } },
        ]);
      },
      steps: [
        { type: "use", zone: { x: 34.1, w: 2.6 }, hold: 0.9, stroke: "up", gestureY: 0.62,
          pose: "bow", prompt: "抱起妹妹",
          effect: (state) => {
            // 旗标在 effect 里落：跳幕结算只跑 effect、不跑台词行的 on()，
            // 落在 on() 里的话跳过这一拍正字就永远缺今天这道
            state.flags.tallied = true;
            StartMicroCine(state, [
              // 抱起来：她离地半米，前两天那两道的上头正好够得着。
              // 站位钉在**左立柱**（刻痕在 33.6-33.75）前——33.85 会把她按进
              // 黑门洞里，暗红衣裳当场隐形（实拍抓的）
              { act: "柱子蹲下，把妹妹抱起来，一只手托住她，另一只手从窗台拿过石笔。", d: 3.4,
                cam: CINE(34.0, 0.55, 2.90, [FG.kangLow(1.82, 1.2, 0.22)]),
                on: (s) => {
                  const k = FindActor(s, "sister");
                  // 她被托在半空：腿垂着、一只手够门框、一只手扒着他的肩
                  // （老版给的是站姿的 mark——两条腿笔直踩着空气）
                  if (k) { k.x = 33.62; k.heading = -1; k.pose = "heldUp"; k.lift = 0.52; k.track = null; }
                  s.player.x = 34.05; s.player.heading = -1;
                  // 蹲下→兜住→站起来托住（老版当帧弹进 shelter，而 shelter 是
                  // 蹲着围住她的姿势，托不起一个悬在 0.52m 的孩子）
                  FlashTrack(s, "scoopChild", 1.1);
                  // 轨道跑完（1.1s）自动收回，落到这个姿势上继续托着
                  s.player.pose = "liftChild";
                } },
              { act: "石笔是一截磨秃了的滑石。爹划线用的——木匠家里，比锥子还常使的东西。他把它塞进她手里。", d: 4.4,
                cam: CINE(33.9, 0.49, 2.90, [FG.jambR(1.81, 0.32, 1.0, 1.98)]) },
            ]);
          } },
        // 收尾步：micro-cine 是 effect 起的，链在同一帧就会走完——没有这一步，
        // 划线那拍的活卡会压在还没播完的过场上
        { type: "goto", zone: { x: 34.1, w: 3.2 } },
      ],
    },
    {
      // 第三场（玩法②·划）：贴着上一道底下，一道短横。歪歪扭扭，蹭了三下
      // 才画上去。石笔在她手里，抱着她的那双手是柱子的——活卡上那只小手
      // 是妹妹的（cardStyle: sisterTally）。scribe 机制与 c8_carve 同一套。
      kind: "scribe", id: "c1_draw", timeOfDay: "day",
      zone: { x: 34.0, w: 3.0 }, speed: 0.42,
      markY: 0.98, markX0: 33.55, markX1: 33.78,
      cardStyle: "sisterTally",
      objective: "画上今天这道",
      onStart: (state) => {
        const sis = FindActor(state, "sister");
        if (sis) { sis.visible = true; sis.level = "surface"; sis.cineTarget = null; sis.x = 33.62; sis.heading = -1; sis.pose = "heldUp"; sis.lift = 0.52; }
        state.player.level = "surface";
        state.player.x = 34.05;
        state.player.heading = -1;
        state.player.pose = "liftChild";
      },
      onDone: (state) => { state.flags.tallied = true; },
    },
    {
      // §4 收口（八稿）：她吹石粉、一道一道点着数——「一。」「二。」「三。」
      // 「爹上回出门，画到第四道就回来了。」「他们啥时候回来？」
      // 柱子没有回答。房间里只剩风吹窗纸的声音；水缸边的瓢轻轻滑了一下，
      // 磕在缸底。答那一个字是玩家自己按出来的（下一拍 c1_say1）。
      kind: "cinematic", id: "c1_count", timeOfDay: "day",
      lines: [
        { act: "妹妹吹掉石粉。她伸出手指，一道一道点。", d: 3.0,
          cam: CINE(33.72, 0.80, 3.55, [FG.jambL(1.85, 0.60, 1.05, 2.09)]),
          on: (state) => {
            state.beat.indoorScene = true;
            const sis = FindActor(state, "sister");
            // 一条 7.2 秒的轨道把这一拍的四件事全演掉（吹粉/点三下/看/回头），
            // 起点钉在第一行——后面十行不要再各推一次 t，轨道自己会走。
            // mark 是**站在地上伸手比划**的姿势，挂在被抱着的人身上就是
            // 「两条腿笔直踩着空气」；底子换成 heldUp
            if (sis) { sis.visible = true; sis.x = 33.62; sis.heading = -1; sis.pose = "heldUp"; sis.lift = 0.52; sis.track = { name: "tallyCount", t: 0 }; }
            state.player.x = 34.05;
            state.player.heading = -1;
            // 他这会儿正托着她（shelter 是蹲下去围住她，托不起半空里的孩子）
            state.player.pose = "liftChild";
          } },
        { who: "妹妹", say: "一。", d: 1.3,
          cam: CINE(33.72, 0.80, 3.55, [FG.jambL(1.85, 0.60, 1.05, 2.09)]),
          on: (state) => { Cue(state, "pickup", { gain: 0.25, rate: 1.3 }); } },
        { who: "妹妹", say: "二。", d: 1.3,
          cam: CINE(33.72, 0.80, 3.55, [FG.jambL(1.85, 0.60, 1.05, 2.09)]),
          on: (state) => { Cue(state, "pickup", { gain: 0.25, rate: 1.35 }); } },
        { who: "妹妹", say: "三。", d: 1.5,
          cam: CINE(33.72, 0.80, 3.55, [FG.jambL(1.85, 0.60, 1.05, 2.09)]),
          on: (state) => { Cue(state, "pickup", { gain: 0.25, rate: 1.4 }); } },
        { act: "她看了一会第三道线。", d: 2.6,
          cam: CINE(33.72, 0.39, 2.90, [FG.jambL(1.66, 0.36, 0.95, 2.09)]) },
        { who: "妹妹", say: "爹上回出门，画到第四道就回来了。", d: 3.8,
          cam: CINE(33.85, 0.66, 4.60, [{ art: "beam", u: 0, v: 0.41, z: 2.90, w: 2.2, h: 0.20, dim: 2.09 }]) },
        { act: "她回头看柱子。", d: 2.2,
          cam: CINE(33.86, 0.49, 2.90, [FG.jambL(1.67, 0.32, 1.0, 2.02)]) },
        { who: "妹妹", say: "他们啥时候回来？", d: 2.8,
          cam: CINE(33.70, 0.40, 2.90, [FG.jambL(1.68, 0.34, 0.95, 2.09)]) },
        { act: "柱子没有回答。", d: 2.4,
          cam: CINE(34.05, 0.36, 2.90, [FG.jambL(1.67, 0.30, 0.90, 2.09)]) },
        // 玩家控制还锁在过场里：房间只剩风吹窗纸的声音
        { act: "房间里只剩风吹窗纸的声音。", d: 3.0,
          cam: CINE(33.70, 0.80, 4.0, [FG.beamTop(2.54, 2.2, 0.32), FG.jambR(2.39, 0.34, 1.05)]),
          on: (state) => { Cue(state, "windGust", { gain: 0.3, rate: 1.2, delay: 0.5 }); } },
        { act: "水缸边的瓢轻轻滑了一下，磕在缸底。", d: 3.2,
          cam: CINE(43.30, 0.37, 2.90, [FG.kangLow(1.63, 0.55, 0.22, 1.94)]),
          on: (state) => { Cue(state, "bucketKnock", { gain: 0.4, rate: 0.85, delay: 1.0 }); } },
      ],
    },
    {
      // §4 玩家操作（八稿新增的一按）：说「快了」。
      // 答案还是护不住人的那一个字——只是这回，是玩家自己把它按出来的。
      kind: "chain", id: "c1_say1", timeOfDay: "day",
      objective: "答她一句", hint: "她还仰着头等着",
      onStart: (state) => {
        state.beat.indoorScene = true;
        const sis = FindActor(state, "sister");
        if (sis) { sis.visible = true; sis.level = "surface"; sis.cineTarget = null; sis.x = 33.62; sis.heading = -1; sis.pose = "heldUp"; sis.lift = 0.52; }
        state.player.level = "surface";
        state.player.x = 34.05;
        state.player.heading = -1;
        state.player.pose = "liftChild";
      },
      steps: [
        { type: "use", zone: { x: 34.05, w: 3.2 }, prompt: "E · 说「快了」",
          effect: (state) => {
            StartMicroCine(state, [
              { who: "柱子", say: "快了。", d: 2.2,
                cam: { kind: "close", on: "player", dist: 3.0, fg: [FG.jambR(1.6, 0.30, 0.94, 2.02)] } },
              { act: "柱子把妹妹放到地上。", d: 2.4,
                cam: CINE(34.0, 0.55, 2.90, [FG.kangLow(1.82, 1.2, 0.22)]),
                on: (s) => {
                  const k = FindActor(s, "sister");
                  if (k) { k.lift = 0; k.pose = null; k.x = 32.9; k.heading = -1; }
                  s.player.pose = null;
                } },
              { act: "他走到水缸边，把瓢往下压。瓢再次碰到缸底。", d: 4.0,
                cam: CINE(42.6, 0.68, 3.4, [FG.jambL(2.14, 0.34, 1.02, 2.02)]),
                on: (s) => {
                  s.player.cineWalk = { x: 42.8, speed: 2.0 };
                  Cue(s, "bucketKnock", { gain: 0.5, rate: 0.85, delay: 2.6 });
                } },
              { who: "柱子", say: "俺去打水。", d: 2.2,
                cam: { kind: "close", on: "player", dist: 3.0, fg: [FG.jambL(1.6, 0.30, 0.94, 2.02)] },
                on: (s) => { s.player.cineWalk = null; s.player.x = 42.8; s.player.heading = -1; } },
              { act: "他看向妹妹。", d: 1.6,
                cam: CINE(42.4, 0.61, 3.07, [FG.jambL(1.93, 0.34, 1.02, 2.02)]),
                on: (s) => { s.player.heading = -1; } },
              { who: "柱子", say: "你跟紧。", d: 2.0,
                cam: CINE(42.4, 0.61, 3.07, [FG.jambL(1.93, 0.34, 1.02, 2.02)]) },
            ]);
          } },
      ],
    },
    {
      // §5 去井台（八稿：地头一场整个删了——攥土、拉耧、东邻都不再演；
      // 耧还靠在垄埂上、地还荒着，只是没人再去碰它）。
      // 柱子拎着空桶出门，妹妹抓着他的褂子角跟在后面。路边两棵榆树的皮
      // 被一圈圈刮掉，只剩发白的树干——她没有停。走到田埂边她忽然蹲下，
      // 挖出一棵苦菜：「哥，大的。」「嗯。」「搁兜里。」苦菜进了桶边挂着的
      // 小布兜。
      kind: "chain", id: "c1_walk", timeOfDay: "day",
      objective: "去井台打水", hint: "桶在缸边上——捎上它",
      onStart: (state) => {
        const sis = FindActor(state, "sister");
        if (sis) { sis.visible = true; sis.level = "surface"; sis.cineTarget = null; sis.pose = null; sis.lift = 0; sis.following = true; }
        state.player.level = "surface";
        state.player.pose = null;
      },
      steps: [
        { type: "pickup", x: 43.0, item: { id: "bucket", label: "空水桶", big: true }, prompt: "E · 拎起空桶",
          note: "桶梁哗啦响了一声。妹妹抓住他的褂子角。" },
        // 路边那两棵榆树：树皮被一圈圈刮掉，只剩发白的树干。她没有停
        { type: "goto", zone: { x: 50.2, w: 2.6 },
          effect: (state) => {
            StartMicroCine(state, [
              { act: "路边有两棵榆树。树皮已经被一圈圈刮掉，只剩发白的树干。", d: 4.2,
                cam: CINE(50.1, 0.87, 4.37, [FG.jambL(2.75, 0.34, 1.02, 2.02)]) },
              { act: "妹妹没有停。", d: 2.2,
                cam: CINE(51.0, 0.65, 3.23, [FG.jambL(2.04, 0.34, 1.02, 2.02)]) },
            ]);
          } },
        // 田埂边：她忽然蹲下，用小棍刨土——苦菜连根挖出来
        { type: "goto", zone: { x: 54.8, w: 2.2 },
          effect: (state) => {
            state.flags.bitterHerb = true;
            // 苦菜进桶边的小布兜：手里的桶从此带着它（画笔认这个 label）
            if (state.player.item?.id === "bucket") state.player.item.label = "挂着布兜的空桶";
            const g = state.groundItems.find((it) => it.id === "bucket");
            if (g) g.label = "挂着布兜的空桶";
            StartMicroCine(state, [
              { act: "走到田埂边，妹妹忽然蹲下，用小棍刨土。", d: 3.2,
                cam: CINE(54.4, 0.58, 2.91, [FG.jambL(1.83, 0.34, 1.02, 2.02)]),
                on: (s) => {
                  const k = FindActor(s, "sister");
                  if (k) { k.following = false; k.cineTarget = null; k.x = 54.2; k.heading = -1; k.pose = "kneel"; }
                  Cue(s, "dig", { gain: 0.3, rate: 1.3, delay: 1.2 });
                } },
              { act: "她挖出一棵苦菜，抓着根抖掉泥。", d: 3.0,
                cam: CINE(54.3, 0.46, 2.90, [FG.jambL(1.83, 0.34, 1.02, 2.02)]),
                on: (s) => { Cue(s, "flutter", { gain: 0.25, rate: 1.4, delay: 0.8 }); } },
              { who: "妹妹", say: "哥，大的。", d: 2.2,
                cam: CINE(54.3, 0.43, 2.90, [FG.jambL(1.82, 0.34, 1.02, 2.02)]) },
              { act: "柱子回头看一眼。", d: 1.6,
                cam: { kind: "close", on: "player", dist: 3.2, fg: [FG.jambR(1.71, 0.30, 0.94, 2.02)] } },
              { who: "柱子", say: "嗯。", d: 1.4,
                cam: { kind: "close", on: "player", dist: 3.2, fg: [FG.jambL(1.71, 0.30, 0.94, 2.02)] } },
              { who: "柱子", say: "搁兜里。", d: 1.8,
                cam: { kind: "close", on: "player", dist: 3.2, fg: [FG.jambR(1.71, 0.30, 0.94, 2.02)] } },
              { act: "妹妹把苦菜放进桶边挂着的小布兜，追上柱子。", d: 3.2,
                cam: CINE(55.0, 0.61, 3.07, [FG.jambL(1.93, 0.34, 1.02, 2.02)]),
                on: (s) => {
                  const k = FindActor(s, "sister");
                  if (k) { k.pose = null; k.following = true; }
                  Cue(s, "clothLift", { gain: 0.3, rate: 1.1 });
                } },
            ]);
          } },
        // 到井台
        { type: "goto", zone: { x: 58.4, w: 2.6 } },
      ],
    },
    {
      // §6 井台（八稿）：井台边没有人。修井绳（接绳活卡，八稿明令续用；
      // 措辞对齐：磨细的一段折回、**从桶梁上解下一截短麻绳**、穿圈绕回拉紧、
      // 麻结勒死）+ 辘轳四道手（桶横漂、墩桶吃水、湿绳缠轴、滴着水上来——
      // 井底小窗照旧）。收尾一句：「走了。」
      kind: "chain", id: "c1_well", timeOfDay: "day",
      objective: "把这桶水打上来", hint: "井台边没有人",
      onStart: (state) => {
        // 妹妹站在井台西边一步等着（跳幕直落也得有人样）
        const sis = FindActor(state, "sister");
        if (sis && !sis.following) { sis.cineTarget = null; sis.heading = 1; }
      },
      tick: (state) => {
        const sis = FindActor(state, "sister");
        if (sis && !sis.following && Math.abs(sis.x - 57.2) > 4) {
          sis.cineTarget = null; sis.x = 57.2; sis.heading = 1;
        }
      },
      steps: [
        // 第九稿：**修井绳（查绳／折回／接绳活卡）整段下线**，井台压成两道手——
        // 挂上桶（E）→ 放桶下去（按住 E ＋ ↓）→ 摇上来（按住 E ＋ ↑）。
        // 「绳磨细了、拿短麻绳接一截」这条叙事没丢，改由挂桶那一句手记带过
        { type: "winch", zone: V.well, needs: "bucket", simple: true,
          hookPrompt: "E · 把桶挂上井绳",
          missPrompt: "手里缺一只桶——撂在半道上了吧",
          gives: { id: "fullBucket", label: "一桶水", big: true },
          note: "井绳有一段磨细了——柱子把桶梁上那截短麻绳绕上去压住，才敢挂桶。",
          onFilled: (state) => { state.flags.waterFilled = true; },
          effect: (state) => {
            const sis = FindActor(state, "sister");
            if (sis) { sis.track = null; sis.following = true; sis.cineTarget = null; }
            StartMicroCine(state, [
              { act: "柱子抓住桶梁，把满桶提到地面。他掂了一下重量。沉。", d: 3.8,
                cam: CINE(58.0, 0.48, 2.90, [FG.jambL(1.82, 0.34, 1.02, 2.02)]),
                on: (s) => { Cue(s, "waterDrip", { gain: 0.5, delay: 0.6 }); } },
              { who: "柱子", say: "走了。", d: 2.0,
                cam: CINE(57.4, 0.65, 3.23, [FG.jambL(2.04, 0.34, 1.02, 2.02)]) },
            ]);
          } },
      ],
    },
    {
      // §7 车铃（八稿·回程①）：柱子提着满桶走得很慢，水在桶沿晃。
      // 妹妹忽然站住——她先听见的：链条声，一下车铃，从北边土路接近。
      // 走到院墙后头，水桶是**自动**轻轻放下的（八稿明令——不再按键搁桶）。
      kind: "chain", id: "c1_return", timeOfDay: "day",
      objective: "把水带回家", hint: "妹妹跟在后头",
      onStart: (state) => {
        const sis = FindActor(state, "sister");
        if (sis) { sis.visible = true; sis.level = "surface"; sis.cineTarget = null; sis.pose = null; sis.following = true; }
        state.player.level = "surface";
      },
      steps: [
        { type: "goto", zone: { x: 48.6, w: 2.6 },
          effect: (state) => {
            StartMicroCine(state, [
              { act: "妹妹忽然站住。她抬起头。", d: 2.4,
                cam: CINE(48.0, 0.61, 3.07, [FG.jambL(1.93, 0.34, 1.02, 2.02)]),
                on: (s) => {
                  const sis = FindActor(s, "sister");
                  if (sis) { sis.following = false; sis.cineTarget = null; sis.x = s.player.x + 1.4; sis.heading = -1; }
                } },
              { act: "远处传来自行车链条声。一下车铃。", d: 2.8,
                cam: CINE(48.6, 0.44, 2.90, [FG.jambL(1.82, 0.34, 1.02, 2.02)]),
                on: (s) => {
                  Cue(s, "crank", { gain: 0.16, rate: 2.4, delay: 0.3 });
                  Cue(s, "bikeBell", { gain: 0.4, rate: 0.98, delay: 1.2 });
                } },
              { act: "声音从北边土路接近。", d: 2.4,
                cam: CINE(49.5, 0.74, 3.72, [FG.jambL(2.34, 0.34, 1.02, 2.02)]),
                on: (s) => { Cue(s, "crank", { gain: 0.2, rate: 2.5, delay: 0.9 }); } },
            ]);
          } },
        // 走到院墙后头：到达就自动把水桶轻轻放在地上（水面仍在晃）。
        // 落点在那堵前景院墙（courtWallLow 44.8~48.4）正后方——墙挡在人与
        // 镜头/村口之间，蹲下去就看不见了
        { type: "goto", zone: { x: 46.6, w: 2.2 },
          effect: (state) => {
            if (state.player.item?.id === "fullBucket") {
              const g = AddGroundItem(state, state.player.item, 47.15, "surface");
              state.flags.bucketAt = g ? g.x : 47.15;
              state.player.item = null;
            } else if (!state.groundItems.some((it) => it.id === "fullBucket")) {
              AddGroundItem(state, { id: "fullBucket", label: "一桶水", big: true }, 47.15, "surface");
              state.flags.bucketAt = 47.15;
            }
            const sis = FindActor(state, "sister");
            if (sis) { sis.following = false; sis.cineTarget = null; sis.x = 46.3; sis.heading = 1; sis.pose = "leanIn"; }
            state.player.x = 46.9;
            state.player.heading = -1;
            FlashPose(state, "bow", 0.8);
            Cue(state, "drop", { gain: 0.3, rate: 0.9 });
            Cue(state, "waterDrip", { gain: 0.4, delay: 0.5 });
            StartMicroCine(state, [
              { act: "拐到院墙后头。柱子把水桶轻轻放在地上。水面仍在晃。", d: 2.8,
                cam: CINE(46.9, 0.41, 2.90, [FG.jambL(1.83, 0.34, 1.02, 2.02)]) },
            ]);
          } },
      ],
    },
    {
      // §7 车铃（八稿·回程②）：按住她。序里那个动作，第二次——这一回在
      // 自家院墙根后头，大白天，而且**会失败**（全章唯一一处）：
      // 从墙后头出来、或松开互动键，前面的车闸一声响——「谁在那儿？」——
      // 画面收黑，回到车铃第一次响起时（RewindBeat 整拍回卷，不追责、不存档）。
      // 两辆自行车这回是**真进画面的**（rider1/rider2 演员：mount "bicycle"，
      // tick 驱动走位）：到了村口捏闸支腿，朝村东塌房张望，调头，
      // 车铃被土坑颠响一下。
      kind: "hold", id: "c1_bell", timeOfDay: "day",
      // 藏身处＝**画面上那堵前景院墙**（covers 的 courtWallLow，44.8~48.4，
      // clutter 带画在演员之前）。判定区就是它的足迹，一米不多一米不少。
      //
      // 2026-08-14 两轮退回都在这一句上：先是「哥哥和妹妹哪里有躲在墙/阴影的
      // 后面？这不就是站在伪军面前吗」（那会儿只有一堵 building 带的背景院墙，
      // 画在人**背后**），我改成画一片阴影，又被退回——「勇敢的心里面就是在
      // 前景加了一个可以遮挡的物体 比如墙 人操控躲在后面就可以 你他妈的画个
      // 阴影是什么意思啊」。**遮挡是几何，不是画法**：墙站在人前面，人矮过
      // 墙头就看不见了，就这么回事。
      zone: { x: 46.6, w: 3.4 }, holdTime: 13, sustain: true,
      // 按住的 13 秒是全章唯一会失败的一段，固定机位把两个人和村口的车框在
      // 一起——老版这 13 秒里两个人都是同一帧定格（序里同一场戏 c1_hide 给了
      // 妹妹 tremble，这儿一条都没抄）。holdPose 留着给失败判定读，
      // 画面走 holdTrack
      holdPose: "shelter", holdTrack: "shelterHold",
      holdPrompt: "按住 E · 按住妹妹",
      objective: "蹲住。等它过去", hint: "别从墙后头出来。别松手",
      // 固定机位：**前景一堵院墙横在下半幅，墙头后面两个孩子，墙那边村口的
      // 自行车**——"隔着一堵墙"是看出来的，不是读出来的。
      // dist 给 7.3 是因为 `HintShot` 会过一道 `TightenHw`（×0.71）：折完 5.18，
      // 才装得下 42.4~52.8 这一段（两辆车停在 50.3 / 51.6）。**这一拍不能再收**
      // ——收了就只剩墙和一颗脑袋，"他们就在墙那头"这句话没了主语
      // **这一拍是玩法段（hold），机位不许换成 `free`**：`free` 只走过场那条
      // 路（HintShot 的 free 分支把 hw 写死成 6、运动交给 ApplyCineCamera），
      // 玩法段的「跟随、永不旋转」一个字不动。框景改挂在节拍的 `fg` 上
      //（玩法段的框景只有这一个来源，而且只能写世界坐标——u/v 是按画框折算的，
      // 跟随镜头下画框一直在动，板子会跟着人漂）
      cam: { kind: "shot", x: 47.6, y: 1.2, dist: 7.3 },
      onEnter: (state) => {
        const sis = FindActor(state, "sister");
        if (sis) {
          sis.visible = true; sis.level = "surface"; sis.following = false; sis.cineTarget = null;
          sis.x = 46.3; sis.heading = 1; sis.pose = "leanIn";
          // 她也得抖——序里那一场就是这么演的（c1_hide）。**用 tremble 不是
          // heldTremble**：后者是"站着被娘搂住"（hipY −0.05，腿几乎是直的），
          // 挂在这儿画面上就是妹妹**站得笔直**杵在街边，哥哥一个人蹲着。
          // tremble 才是"蹲窝成一小团、在哥哥怀里"那条（hipY −0.30）
          sis.track = { name: "tremble", t: 0, ambient: true }; sis.trembleK = 0.45;
        }
        // 蹲在那堵前景院墙（44.8~48.4）正后头，离东头的门垛一步
        state.player.x = 46.9;
        state.player.heading = -1;
        // 回卷/直落都从头来：两辆车回到画外
        for (const id of ["rider1", "rider2"]) {
          const r = FindActor(state, id);
          if (r) { r.visible = false; r.cineTarget = null; r.x = 62 + (id === "rider2" ? 1.6 : 0); r.heading = -1; r.pose = "rideBike"; }
        }
        // 跳幕直落这一拍：脚边得有那桶水
        if (state.player.item?.id === "fullBucket") {
          AddGroundItem(state, state.player.item, 47.15, "surface");
          state.player.item = null;
          state.flags.bucketAt = 47.15;
        } else if (!state.groundItems.some((it) => it.id === "fullBucket")) {
          AddGroundItem(state, { id: "fullBucket", label: "一桶水", big: true }, 47.15, "surface");
          state.flags.bucketAt = 47.15;
        }
      },
      tick: (state, dt) => {
        const b = state.beat;
        b.bellT = (b.bellT || 0) + dt;
        // 车在跟前那一段她抖得厉害，车走远了就轻下来
        {
          const k = FindActor(state, "sister");
          if (k && k.track?.name === "tremble") k.trembleK = (b.bellT > 1.0 && b.bellT < 9.0) ? 1 : 0.45;
        }
        // 两辆自行车：进画（1.2s 起）→ 村口捏闸支腿张望 → 调头 → 出画。
        // 走位直接写 x（decor 演员没有别的驱动源）；后车吊在前车后头 1.4m
        {
          const t = b.bellT;
          const place = (r, stopX, lag) => {
            if (!r) return;
            const t0 = t - lag;
            if (t0 < 1.2 || t > 12.2) { r.visible = false; return; }
            r.visible = true;
            r.pose = "rideBike";
            if (t0 < 4.3) {
              // 骑进来：从东边土路口压到村口
              const k = (t0 - 1.2) / 3.1;
              r.x = 56.8 - k * (56.8 - stopX);
              r.heading = -1;
            } else if (t < 8.6) {
              // 支着腿张望：车头还朝西，人朝村东头那几间塌房望
              r.x = stopX;
              r.heading = -1;
            } else {
              // 调头，往北（东边出画）骑走
              const k = (t - 8.6) / 3.4;
              r.x = stopX + k * 8.0;
              r.heading = 1;
            }
          };
          place(FindActor(state, "rider1"), 50.3, 0);
          place(FindActor(state, "rider2"), 51.6, 0.55);
        }
        const CUES = [
          [0.6, "crank", 0.18, 2.5],       // 链条声近了
          [1.6, "bikeBell", 0.5, 1.0],
          [3.0, "crank", 0.22, 2.6],
          [4.3, "crank", 0.3, 1.4],        // 捏闸，一只脚点地
          [5.4, "step", 0.25, 0.9],
          [8.6, "step", 0.3, 1.0],         // 蹬上车，调头
          [9.4, "bikeBell", 0.3, 0.94],    // 过土坑，车铃被颠响一下
          [10.6, "crank", 0.18, 2.4],
          [11.8, "crank", 0.12, 2.3],      // 链条声远去
        ];
        b.bellFired = b.bellFired || new Set();
        for (let i = 0; i < CUES.length; i += 1) {
          const [t, name, gain, rate] = CUES[i];
          if (b.bellT >= t && !b.bellFired.has(i)) {
            b.bellFired.add(i);
            Cue(state, name, { gain, rate });
          }
        }
        // 失败判定（八稿）：车在近处的那一段（1.0s~11.5s），走出墙后或松手
        // 超过半秒多——被看见了。宽限那半秒是给"手指刚换个姿势"留的
        if (b.failing) return;
        const holding = state.player.pose === "shelter";
        // 「藏住了没有」这件事必须能在画面上指出来：这条线就是那堵前景院墙的
        // 两头（courtWallLow 46.6 ± 1.7 → 44.9~48.3）。走出墙的任一头，
        // 画面上人整个亮在墙外——判定和眼睛说的是同一句话
        const inZone = state.player.level === "surface" && Math.abs(state.player.x - 46.6) <= 1.7;
        if (b.bellT > 1.0 && b.bellT < 11.5 && (!holding || !inZone)) {
          b.relT = (b.relT || 0) + dt;
        } else b.relT = 0;
        if ((b.relT || 0) > 0.55) {
          b.failing = true;
          StartMicroCine(state, [
            { act: "前面的自行车捏了闸。", d: 1.6,
              cam: CINE(49.8, 0.74, 3.72, [FG.jambL(2.34, 0.34, 1.02, 2.02)]),
              on: (s) => { Cue(s, "crank", { gain: 0.4, rate: 1.2 }); } },
            { who: "伪军", say: "谁在那儿？", d: 2.0,
              cam: CINE(49.8, 0.68, 3.4, [FG.jambL(2.14, 0.34, 1.02, 2.02)]) },
            { act: "一个人影从墙外转向巷口。", d: 1.8,
              cam: CINE(48.6, 0.65, 3.23, [FG.jambL(2.04, 0.34, 1.02, 2.02)]),
              on: (s) => { Cue(s, "step", { gain: 0.5, rate: 1.1 }); } },
            // 画面迅速收黑，回到车铃第一次响起时。**"迅速"就得真的迅速**：
            // 这是重试路上的一格，玩家早知道自己被看见了，多黑一秒都是罚站
            { act: "", d: 0.9, cam: { kind: "dark" },
              on: (s) => { RewindBeat(s); } },
          ]);
        }
      },
      onDone: (state) => {
        for (const id of ["rider1", "rider2"]) {
          const r = FindActor(state, id);
          if (r) r.visible = false;
        }
      },
    },
    {
      // §7 车铃（八稿·收尾过场）：柱子仍然没有松手——等声音完全消失才放开。
      // 第一眼看的是水桶。然后七叔从墙那头扶着墙站起来：他也蹲着的。
      // 台词按八稿切成短句；两个骑车的这回演在世界里（上一拍），不再走插卡。
      kind: "cinematic", id: "c1_uncle", timeOfDay: "day",
      lines: [
        { act: "链条声逐渐远去。柱子仍然没有松手。", d: 3.4,
          cam: CINE(46.62, 0.70, 3.54, [FG.jambR(2.23, 0.40, 1.10, 2.09)]),
          on: (state) => {
            for (const id of ["rider1", "rider2"]) {
              const r = FindActor(state, id);
              if (r) r.visible = false;
            }
            const sis = FindActor(state, "sister");
            // `lift = 0` 不许省：§4 把她托起来画正字时立的 0.52 会一路挂到这儿，
            // 画面上她整个人浮在半空半米（实测脚底 0.582m）。清 lift 的地方在
            // c1_walk 的 onStart，跳幕回放到 §7 时它未必跑过
            if (sis) { sis.visible = true; sis.level = "surface"; sis.lift = 0; sis.x = 46.3; sis.heading = 1; sis.pose = "leanIn"; }
            state.player.x = 46.9;
            state.player.heading = -1;
            FlashPose(state, "shelter", 3.2);
            Cue(state, "crank", { gain: 0.08, rate: 2.3, delay: 0.4 });
          } },
        { act: "等声音完全消失，柱子放开妹妹。", d: 2.8,
          cam: CINE(46.58, 0.60, 3.0, [FG.jambR(1.89, 0.36, 1.05, 2.02)]),
          on: (state) => {
            state.player.pose = null;
            const sis = FindActor(state, "sister");
            // **ambient 轨道换幕不清**（SettleBeat 只清非 ambient 的那一路），
            // 所以"放开她"这一下必须亲手把 tremble 撤掉——不撤的话她会顶着
            // 蹲在怀里那个造型一路站起来走，脚离地半尺
            if (sis) { sis.pose = null; sis.track = null; sis.trembleK = 0; }
          } },
        { act: "他第一眼看向水桶。水还在。", d: 3.0,
          cam: CINE(47.15, 0.28, 2.90, [FG.strawLow(1.65, 0.9, 0.22)]) },
        // 七叔登场：他也蹲着的
        { act: "墙的另一头传来衣服摩擦声。七叔扶着墙站起来——他也蹲着的。一条腿蹲麻了，迈第一步时晃了一下。", d: 5.4,
          // 分镜 23：两个孩子蹲在墙这头（画一侧、很小）、七叔从墙那头站起来。
          // 三样缺一这一格就不成立，画宽给到 6.1m（七叔占可见画高五成二）
          cam: CINE(48.30, 0.72, 4.50, [FG.jambL(2.84, 0.80, 1.20, 2.02)]),
          on: (state) => {
            Cue(state, "clothLift", { gain: 0.4, rate: 0.8 });
            const q = FindActor(state, "qishu");
            if (q) { q.visible = true; q.level = "surface"; q.x = 52.2; q.heading = -1; q.pose = "kneel"; q.cineTarget = null; }
            state.player.pose = null;
          } },
        { act: "他快步走过来，先蹲下，捏捏妹妹的胳膊，又看看她的脸和脚。", d: 4.6,
          cam: CINE(45.95, 0.65, 3.23, [FG.jambR(2.04, 0.36, 1.05, 2.02)]),
          on: (state) => {
            const q = FindActor(state, "qishu");
            if (q) { q.pose = null; q.cineTarget = { x: 45.1 }; q.cineSpeed = 2.6; }
          } },
        { act: "", d: 2.4, cam: CINE(45.55, 0.40, 2.90, [FG.jambL(1.68, 0.32, 0.92, 2.09)]),
          on: (state) => {
            const q = FindActor(state, "qishu");
            if (q) { q.cineTarget = null; q.x = 45.1; q.heading = 1; q.pose = "kneel"; }
            const sis = FindActor(state, "sister");
            if (sis) { sis.pose = null; sis.heading = -1; }
          } },
        // 确认妹妹没事，站起来，照柱子后脑勺轻轻拍了一巴掌
        { act: "确认妹妹没事，他站起来，轻轻拍了一下柱子的后脑勺。", d: 3.0,
          // 分镜 25：他抬起来的那只手落在 1.55m 上——注视点给低了手就被上黑边切掉，
          // 而这一格演的就是「抬手」
          cam: CINE(46.66, 0.80, 3.40, [FG.jambL(2.14, 0.60, 1.02, 2.09)]),
          on: (state) => {
            const q = FindActor(state, "qishu");
            // 拍那一下要有抬臂（mark=抬臂点着，落在孩子后脑勺的高度上）；
            // 一臂出头（1.1m）——再近两个人在侧视里叠成一个人形（二轮审查）
            if (q) { q.pose = "mark"; q.x = 47.2; q.heading = -1; }
            state.player.x = 46.1;
            state.player.heading = 1;
            // 挨那一下：脑袋跟着缩一下，拍没拍上画面自己说
            FlashPose(state, "bow", 2.2);
            Cue(state, "pickup", { gain: 0.3, rate: 0.7, delay: 1.2 });
          } },
        { who: "七叔", say: "铃一响就躲。", d: 2.2,
          cam: CINE(46.68, 0.46, 2.90, [FG.jambL(1.66, 0.30, 0.96, 2.09)]),
          on: (state) => {
            const q = FindActor(state, "qishu");
            if (q) q.pose = null;
          } },
        { who: "七叔", say: "好小子。", d: 2.0,
          cam: CINE(46.68, 0.46, 2.90, [FG.jambL(1.66, 0.30, 0.96, 2.09)]) },
        { act: "他喘匀一口气，压低声音。", d: 2.4,
          cam: CINE(46.72, 0.49, 2.90, [FG.jambL(1.67, 0.30, 0.98, 2.09)]) },
        { who: "七叔", say: "这两天甭往北头去。听见没？", d: 3.2,
          cam: CINE(46.92, 0.45, 2.90, [FG.jambL(1.68, 0.30, 0.96, 2.09)]) },
        { act: "柱子点头。七叔看见水桶，又看见妹妹布兜里的苦菜。", d: 4.2,
          cam: CINE(46.95, 0.71, 3.54, [FG.jambR(2.23, 0.38, 1.08, 2.02)]),
          on: (state) => {
            const q = FindActor(state, "qishu");
            if (q) { q.cineTarget = { x: 52.6 }; q.cineSpeed = 2.2; q.heading = 1; }
          } },
        { act: "他转身进屋，很快又出来，手里攥着一把黑豆，往柱子怀里塞。喂牲口的那种。", d: 4.8,
          // 分镜 24：大人占可见画高九成 ⇒ 画宽 3.6m；两只手在画面正中交接
          cam: CINE(46.45, 0.62, 2.90, [FG.jambL(1.83, 0.52, 1.00, 2.02)]),
          on: (state) => {
            const q = FindActor(state, "qishu");
            if (q) { q.cineTarget = { x: 46.75 }; q.cineSpeed = 2.4; q.heading = -1; }
            // 站位次序照分镜 24：**七叔｜柱子｜妹妹**——她原来夹在两个人当中，
            // 正挡着"把黑豆塞过来"那一下
            const sis = FindActor(state, "sister");
            if (sis) { sis.cineTarget = null; sis.lift = 0; sis.x = 45.55; sis.heading = 1; }
            Cue(state, "drop", { gain: 0.3, rate: 1.2, delay: 2.2 });
          } },
        { act: "柱子往回推。七叔按住他的手，没松。", d: 3.2,
          // 分镜 25：注视点钉在两只手推来推去那个高度上，不是钉在脚下
          cam: CINE(46.62, 0.72, 3.50, [FG.jambL(2.21, 0.32, 0.98, 2.09)]),
          on: (state) => {
            const q = FindActor(state, "qishu");
            if (q) { q.cineTarget = null; q.x = 46.75; q.heading = -1; q.pose = "bow"; }
          } },
        { who: "七叔", say: "晚上过来吃。", d: 2.2,
          cam: CINE(46.70, 0.48, 2.90, [FG.jambL(1.69, 0.30, 0.96, 2.09)]),
          on: (state) => {
            const q = FindActor(state, "qishu");
            if (q) q.pose = null;
          } },
        { who: "七叔", say: "你婶子熬了糊糊。", d: 2.4,
          cam: CINE(46.70, 0.48, 2.90, [FG.jambL(1.69, 0.30, 0.96, 2.09)]) },
        { who: "柱子", say: "不了。", d: 1.8,
          cam: CINE(46.12, 0.36, 2.90, [FG.jambR(1.67, 0.28, 0.88, 2.09)]) },
        { act: "七叔看了柱子一会，没有再劝。他转身走出两步，又站住。", d: 4.0,
          cam: CINE(47.20, 0.71, 3.54, [FG.jambL(2.23, 0.38, 1.08, 2.02)]),
          on: (state) => {
            const q = FindActor(state, "qishu");
            if (q) { q.cineTarget = { x: 47.6 }; q.cineSpeed = 1.8; q.heading = 1; }
          } },
        { who: "七叔", say: "你家那二亩地，明儿我把牲口牵过来。", d: 3.8,
          cam: CINE(47.10, 0.52, 2.90, [FG.jambL(1.66, 0.32, 1.00, 2.02)]),
          on: (state) => {
            const q = FindActor(state, "qishu");
            if (q) { q.cineTarget = null; q.x = 47.6; q.heading = -1; }
          } },
        { who: "柱子", say: "七叔——", d: 1.8,
          cam: CINE(46.12, 0.36, 2.90, [FG.jambR(1.67, 0.28, 0.88, 2.09)]) },
        { who: "七叔", say: "你爹那年借我三斗谷子。", d: 2.8,
          cam: CINE(47.32, 0.40, 2.90, [FG.jambL(1.68, 0.30, 0.94, 2.09)]),
          on: (state) => {
            // 插入镜里必须有他本人（首轮视觉审查抓过空墙）：钉死站位朝向
            const q = FindActor(state, "qishu");
            if (q) { q.visible = true; q.cineTarget = null; q.x = 47.6; q.heading = -1; }
          } },
        { who: "柱子", say: "俺爹没——", d: 1.8,
          cam: CINE(46.12, 0.36, 2.90, [FG.jambR(1.67, 0.28, 0.88, 2.09)]) },
        { act: "七叔再次按住他的手。", d: 2.2,
          // 分镜 26：注视点钉在两只手扣在一起的那个点上（不是钉在人身上），
          // 画宽收到 2.6m ＝ 分镜上那种"三个人肩挨肩"的紧镜
          cam: CINE(46.62, 0.68, 2.60, [FG.jambL(1.64, 0.46, 0.94, 2.09)]),
          on: (state) => {
            const q = FindActor(state, "qishu");
            if (q) { q.x = 46.78; q.heading = -1; q.pose = "bow"; }
          } },
        { who: "七叔", say: "我说有。", d: 2.2,
          cam: CINE(47.32, 0.40, 2.90, [FG.jambL(1.68, 0.30, 0.94, 2.09)]),
          on: (state) => {
            const q = FindActor(state, "qishu");
            if (q) q.pose = null;
          } },
        { act: "", d: 1.4, cam: CINE(47.32, 0.40, 2.90, [FG.jambL(1.68, 0.30, 0.94, 2.09)]) },
        { who: "七叔", say: "就有。", d: 2.2,
          cam: CINE(47.32, 0.40, 2.90, [FG.jambL(1.68, 0.30, 0.94, 2.09)]) },
        { act: "他说完就走了。没等柱子再张嘴。", d: 3.2,
          cam: CINE(49.40, 0.83, 4.16, [FG.jambL(2.62, 0.40, 1.10, 2.02)]),
          on: (state) => {
            const q = FindActor(state, "qishu");
            if (q) { q.cineTarget = { x: 53.0 }; q.cineSpeed = 2.2; q.heading = 1; }
          } },
        { act: "柱子把黑豆揣好。妹妹重新抓住他的褂子角。", d: 3.6,
          cam: CINE(46.55, 0.55, 2.90, [FG.jambR(1.81, 0.34, 1.02, 2.02)]),
          on: (state) => {
            state.flags.beansGiven = true;
            const q = FindActor(state, "qishu");
            if (q) { q.cineTarget = null; q.x = 53.4; q.visible = false; }
            const sis = FindActor(state, "sister");
            if (sis) { sis.cineTarget = { x: 46.8 }; sis.cineSpeed = 1.6; }
          } },
      ],
    },
    {
      // §8 一顿热饭（八稿·倒水）：提起桶往回走。玩家把满桶放到缸边、提起
      // 桶底——水冲进缸里，咕咚咕咚砸在缸底，留下浅浅一层水线。
      kind: "chain", id: "c1_pour", timeOfDay: "day",
      objective: "把水倒进缸里", hint: "桶还搁在墙根脚边",
      onStart: (state) => {
        state.flags.beansGiven = true;
        for (const id of ["rider1", "rider2"]) {
          const r = FindActor(state, id);
          if (r) r.visible = false;
        }
        const q = FindActor(state, "qishu");
        if (q) q.visible = false;
        const sis = FindActor(state, "sister");
        if (sis) { sis.visible = true; sis.level = "surface"; sis.pose = null; sis.cineTarget = null; sis.following = true; }
        state.player.level = "surface";
        state.player.pose = null;
      },
      steps: [
        { type: "pickupGround", flagX: "bucketAt", item: { id: "fullBucket", label: "一桶水", big: true },
          prompt: "E · 拎起桶" },
        { type: "use", zone: { x: 43.4, w: 2.6 }, needs: "fullBucket", hold: 1.4, stroke: "down",
          gestureY: 0.75, pose: "pourBasket", cue: "waterSplash", prompt: "把水倒进缸里",
          effect: (state) => {
            state.player.item = null;
            state.flags.vatFilled = true;
            Cue(state, "waterSplash", { gain: 0.9 });
            FlashPose(state, "bow", 2.2);
            StartMicroCine(state, [
              { act: "柱子把满桶放到水缸边，提起桶底。水冲进缸里，咕咚咕咚砸在缸底。", d: 3.8,
                cam: CINE(43.4, 0.50, 2.90, [FG.jambL(1.82, 0.34, 1.02, 2.02)]),
                on: (s) => { Cue(s, "waterDrip", { gain: 0.6, delay: 1.2 }); } },
              { act: "水声停下来，缸里留下浅浅一层水线。", d: 2.8,
                cam: CINE(43.4, 0.46, 2.90, [FG.jambL(1.83, 0.34, 1.02, 2.02)]) },
              { act: "柱子舀一瓢水倒进锅里。", d: 2.8,
                cam: CINE(28.4, 0.55, 2.90, [FG.kangLow(1.82, 1.2, 0.22)]),
                on: (s) => {
                  s.beat.indoorScene = true;
                  s.player.x = 28.4;
                  s.player.heading = -1;
                  FlashPose(s, "bow", 2.4);
                  Cue(s, "waterSplash", { gain: 0.35, rate: 1.2, delay: 0.8 });
                } },
            ]);
          } },
      ],
    },
    {
      // §8 一顿热饭（八稿·做饭，新增的一拍）：灶边一按，做饭蒙太奇——
      // 最后一把糜子、红薯干掰成小块、妹妹递来的苦菜、七叔那把黑豆；
      // 最后两把谷秸塞进灶膛，火镰点着草绒，蹲下吹气；锅底传来细小的水响，
      // **画面外的天色从灰白变成暗黄**（timeOfDay 落 dusk，光自己走）；
      // 锅盖边冒出第一缕热气（state.stoveFire → World 画火苗与热气）。
      kind: "chain", id: "c1_cook", timeOfDay: "dusk",
      objective: "把饭做出来", hint: "灶膛里还堆着最后两把谷秸",
      onStart: (state) => {
        const sis = FindActor(state, "sister");
        if (sis) { sis.visible = true; sis.level = "surface"; sis.pose = null; sis.cineTarget = null; sis.following = false; sis.x = 30.6; sis.heading = -1; }
        state.player.level = "surface";
      },
      steps: [
        { type: "use", zone: { x: 27.6, w: 2.4 }, prompt: "E · 做饭",
          effect: (state) => {
            state.flags.mealCooked = true;
            state.stoveFire = true;   // 旗标在 effect 里落：跳幕过去灶也得是着过火的
            StartMicroCine(state, [
              // 秕谷壳只有在棚里扫过食槽才有（flags.chaffGot）：**玩家自己翻着的
              // 那一样，得在锅里看得见**——不然"三处各有各的东西"只是三条 toast
              { act: state.flags.chaffGot
                ? "柱子把最后一把糜子倒进锅里，又把兜里那点秕谷壳抖进去。"
                : "柱子把最后一把糜子倒进锅里。", d: 3.0,
                cam: CINE(27.6, 0.46, 2.90, [FG.jambR(1.83, 0.32, 1.0, 1.98)]),
                on: (s) => {
                  s.beat.indoorScene = true;
                  s.stoveFire = false;   // 画面顺序：点火那一行才见火
                  s.player.track = { name: "cookDrop", t: 0 };
                  Cue(s, "flutter", { gain: 0.3, rate: 1.2, delay: 0.7 });
                } },
              { act: "剩下的红薯干被掰成小块，落进水中。", d: 3.2,
                cam: CINE(27.6, 0.43, 2.90, [FG.kangLow(1.82, 1.2, 0.22)]),
                on: (s) => {
                  s.player.track = { name: "cookDrop", t: 0.9 };   // 错开相位，别跟上一行同步
                  Cue(s, "tenon", { gain: 0.3, rate: 1.6, delay: 0.5 });
                  Cue(s, "waterSplash", { gain: 0.25, rate: 1.4, delay: 1.4 });
                } },
              { act: "妹妹把苦菜递过来。柱子摘掉根，撕成几段，放进锅里。", d: 4.0,
                cam: CINE(28.6, 0.52, 2.90, [FG.jambR(1.83, 0.32, 1.0, 1.98)]),
                on: (s) => {
                  const k = FindActor(s, "sister");
                  if (k) { k.cineTarget = { x: 28.6 }; k.cineSpeed = 1.6; }
                  s.player.track = { name: "tearHerb", t: 0 };
                  Cue(s, "clothLift", { gain: 0.3, rate: 1.2, delay: 1.6 });
                } },
              { act: "七叔给的黑豆最后落进去。", d: 2.6,
                cam: CINE(27.6, 0.43, 2.90, [FG.kangLow(1.82, 1.2, 0.22)]),
                on: (s) => {
                  const k = FindActor(s, "sister");
                  if (k) { k.cineTarget = null; k.x = 28.9; k.heading = -1; }
                  s.player.track = { name: "cookDrop", t: 1.7 };
                  Cue(s, "drop", { gain: 0.3, rate: 1.4, delay: 0.6 });
                } },
              { act: "柱子将最后两把谷秸塞入灶膛，用火镰点着草绒。火苗从灶口亮起。", d: 4.4,
                cam: CINE(27.5, 0.34, 2.90, [FG.jambR(1.81, 0.32, 1.0, 1.98)]),
                on: (s) => {
                  s.player.track = { name: "stirPot", t: 0 };   // 塞谷秸、擦火镰：手上一直有活
                  Cue(s, "crank", { gain: 0.25, rate: 1.8, delay: 1.0 });   // 火镰擦石
                  Cue(s, "crackle", { gain: 0.5, delay: 2.0 });
                  s.stoveFire = true;
                } },
              { act: "柱子蹲下吹气。火苗先缩了一下，再沿着谷秸爬开。", d: 3.8,
                cam: CINE(27.5, 0.34, 2.90, [FG.kangLow(1.81, 1.2, 0.22)]),
                on: (s) => {
                  s.player.track = { name: "blowFire", t: 0 };
                  Cue(s, "windGust", { gain: 0.2, rate: 1.6, delay: 1.4 });   // 对齐轨道 t=1.5 那一口
                  Cue(s, "crackle", { gain: 0.55, delay: 1.9 });
                } },
              { act: "锅底逐渐传来细小的水响。画面外的天色从灰白变成暗黄。", d: 4.6,
                cam: CINE(30.5, 0.91, 4.53, [FG.jambR(2.85, 0.32, 1.0, 1.98)]),
                on: (s) => {
                  s.player.track = { name: "stirPot", t: 0 };
                  Cue(s, "waterDrip", { gain: 0.3, rate: 1.5, delay: 1.2 });
                } },
              { act: "锅盖边冒出第一缕热气。", d: 3.2,
                cam: CINE(27.6, 0.41, 2.90, [FG.kangLow(1.83, 1.2, 0.22)]),
                on: (s) => {
                  s.player.track = { name: "stirPot", t: 1.4 };
                  Cue(s, "crackle", { gain: 0.35, delay: 0.8 });
                } },
              // 屋内：饭桌。妹妹两碗，锅就见了底
              { act: "妹妹捧着碗喝完第一碗。柱子又给她盛了一碗。", d: 4.0,
                cam: CINE(32.8, 0.65, 3.23, [FG.jambR(2.04, 0.32, 1.0, 1.98)]),
                on: (s) => {
                  s.beat.indoorScene = true;
                  // 坐就得坐在凳子上：旧木凳在 32.0（Data_Scenes），人钉在凳上
                  const k = FindActor(s, "sister");
                  if (k) { k.cineTarget = null; k.x = 32.0; k.heading = 1; k.pose = "sitStool"; k.carry = "豁口碗"; }
                  s.player.x = 33.4;
                  s.player.heading = -1;
                } },
              { act: "第二碗喝完，锅底已经露出来。", d: 3.2,
                cam: CINE(32.2, 0.50, 2.90, [FG.kangLow(1.82, 1.2, 0.22)]),
                on: (s) => {
                  const k = FindActor(s, "sister");
                  if (k) k.carry = null;
                } },
              { act: "妹妹舔掉嘴角的一粒糜子，坐在炕边打盹。", d: 3.6,
                cam: CINE(32.1, 0.48, 2.90, [FG.jambR(1.82, 0.32, 1.0, 1.98)]) },
              { act: "柱子自己的碗里还剩一点稠渣。", d: 3.0,
                cam: CINE(33.2, 0.48, 2.90, [FG.kangLow(1.82, 1.2, 0.22)]) },
            ]);
          } },
      ],
    },
    {
      // §8 匀稠的（2026-08-14 重做）：把自己碗底那点稠渣拨进她的空碗——**一道手
      // 做完，中间不设门**。拨完她就醒了：按住两只碗把柱子的碗推回来，
      // 「哥，你也吃。」于是第二道手不是"再拨一次"，是**兑上水晃匀**再递过去，
      // 「涮锅水。」「别糟践了。」——这一章叫《善意的谎言》，戏眼在这句谎上，
      // 不在偷渡上。
      // 老版是趁她打盹偷着拨、被看见就清零重来（`st.gate`/`st.caught`，机制已
      // 从 StepChain 删掉，那儿留了病根说明）。用户退回的原话：「推来推去……
      // 我一点提示也没有，我都不知道要干什么」。两条教训：
      // ① **同一场戏一章只演一遍**。§3 分食（c1_meal）已经演过"她把长的推给你
      //    → 你换回去"；这儿再演一遍推让，第二遍就只剩机械。她推回来现在是
      //    **一次性的转折**（引出兑水那句谎），不是失败态。
      // ② 罚玩家的前提是他知道自己在干什么——见步骤①的 prompt。
      kind: "chain", id: "c1_share", timeOfDay: "dusk",
      objective: "把稠的匀给她", hint: "碗底那点稠的，拨到她碗里去",
      onStart: (state) => {
        state.beat.indoorScene = true;
        const sis = FindActor(state, "sister");
        if (sis) { sis.visible = true; sis.level = "surface"; sis.cineTarget = null; sis.following = false; sis.x = 32.0; sis.heading = 1; sis.pose = "sitStool"; sis.carry = null; }
        state.player.level = "surface";
        state.player.cineWalk = null;
        state.player.x = 33.4;
        state.player.heading = -1;
      },
      tick: (state) => {
        // 她坐在凳上打盹：**纯氛围**。dozeNod 是 6.2 秒的循环轨（点两下、抬头
        // 望一会儿、又耷拉下去），t 由 StepActors 自己走——这儿只负责挂上去，
        // 别再往它身上挂判定（老版把这条轨的相位当成偷渡窗口，玩家却看不出
        // 那和自己的手有关系）。推碗那一下由步骤①的过场接管，接管期间不抢轨。
        const sis = FindActor(state, "sister");
        if (sis && sis.pose === "sitStool" && sis.track?.name !== "dozeNod"
            && sis.track?.name !== "pushBowlBack") {
          sis.track = { name: "dozeNod", t: 0, ambient: true };
        }
      },
      steps: [
        // ① 拨稠渣：把自己碗底那点稠的拨进她的空碗。**一道手做完，不设门**——
        // 输入照全场的规矩写进 prompt（「按住 E · ……」），这一步以前是全作唯一
        // 一个不写输入方式的做功步。
        // 拨完她就醒了：按住两只碗把柱子的碗推回来，「哥，你也吃。」——这一下
        // 现在是**必然发生的转折**（引出步骤②那句谎），不再是撞见了才演、
        // 演完还要重来。
        { type: "use", zone: { x: 32.9, w: 2.4 }, hold: 1.8, stroke: "right", gestureY: 0.6,
          pose: "bow", cue: "waterDrip",
          prompt: "按住 E · 把稠的拨过去",
          effect: (state) => {
            Cue(state, "waterDrip", { gain: 0.4 });
            StartMicroCine(state, [
              // 先睁眼、先看碗——推那一下才不是凭空来的
              { act: "妹妹睁开眼。她先看柱子的碗，又看自己的。", d: 2.4,
                cam: CINE(32.4, 0.46, 2.90, [FG.jambR(1.83, 0.32, 1.0, 1.98)]),
                on: (s) => {
                  const k = FindActor(s, "sister");
                  if (k) { k.pose = "sitStool"; k.track = null; }   // 停掉打盹的点头
                  Cue(s, "clothLift", { gain: 0.2, rate: 1.25 });
                } },
              { act: "妹妹按住两只碗，把柱子的碗推回来。", d: 2.8,
                cam: CINE(32.6, 0.46, 2.90, [FG.kangLow(1.83, 1.2, 0.22)]),
                on: (s) => {
                  const k = FindActor(s, "sister");
                  // 老版给的是 bow（弯腰拾东西那个造型）挂 2.8 秒——推这一下
                  // 是她全章唯一一次跟哥哥较劲，不能只有字幕
                  if (k) { k.pose = "sitStool"; k.track = { name: "pushBowlBack", t: 0 }; }
                  Cue(s, "drop", { gain: 0.35, rate: 0.9, delay: 0.6 });
                } },
              { who: "妹妹", say: "哥，你也吃。", d: 2.6,
                cam: CINE(32.1, 0.44, 2.90, [FG.jambR(1.82, 0.32, 1.0, 1.98)]),
                on: (s) => {
                  const k = FindActor(s, "sister");
                  if (k) k.pose = "sitStool";
                } },
            ]);
          } },
        // ② 兑上水再递过去：她刚把碗推回来，所以这一下不是"再拨一次"，是把稠的
        // 搅得看不出来——「涮锅水。」这句谎就是这一章的章名。
        { type: "use", zone: { x: 32.9, w: 2.4 }, prompt: "E · 兑水再递过去",
          effect: (state) => {
            state.flags.shareDone = true;
            const sis = FindActor(state, "sister");
            if (sis) sis.track = null;
            StartMicroCine(state, [
              { act: "柱子舀一点水倒进碗里，轻轻晃匀。", d: 3.0,
                cam: CINE(33.1, 0.46, 2.90, [FG.kangLow(1.83, 1.2, 0.22)]),
                on: (s) => {
                  FlashPose(s, "bow", 2.8);
                  Cue(s, "waterSplash", { gain: 0.3, rate: 1.3, delay: 0.6 });
                } },
              { who: "柱子", say: "涮锅水。", d: 2.0,
                cam: CINE(32.8, 0.52, 2.90, [FG.jambR(1.83, 0.32, 1.0, 1.98)]),
                on: (s) => {
                  const k = FindActor(s, "sister");
                  if (k) { k.pose = "sitStool"; k.carry = "豁口碗"; }
                  FlashPose(s, "bow", 2.0);
                } },
              { who: "柱子", say: "别糟践了。", d: 2.2,
                cam: CINE(32.8, 0.52, 2.90, [FG.kangLow(1.83, 1.2, 0.22)]) },
              { act: "妹妹接过去，喝完。她把碗放下，眼皮已经睁不开。", d: 4.0,
                cam: CINE(32.1, 0.46, 2.90, [FG.jambR(1.83, 0.32, 1.0, 1.98)]),
                on: (s) => {
                  const k = FindActor(s, "sister");
                  // 捧起来→仰头两口→放下（老版只是把 carry 换掉，人没动过）
                  if (k) { k.pose = "sitStool"; k.track = { name: "sipBowl", t: 0 }; }
                  Cue(s, "drop", { gain: 0.25, rate: 1.2, delay: 2.6 });
                } },
              // 这一行原来连 on() 都没有：字幕在演"缩肩膀、拽袖子"，人坐着一动
              // 不动 3.8 秒——而这截袖口正是全章的题眼（章末缝的就是它）
              { act: "她缩了缩肩膀，往下拉自己的袖子。袖口仍停在手腕上面。", d: 3.8,
                cam: CINE(31.9, 0.39, 2.90, [FG.kangLow(1.81, 1.2, 0.22)]),
                on: (s) => {
                  const k = FindActor(s, "sister");
                  if (k) { k.carry = null; k.pose = "sitStool"; k.track = { name: "tugSleeve", t: 0 }; }
                  Cue(s, "clothLift", { gain: 0.3, rate: 1.15, delay: 1.5 });
                  Cue(s, "clothLift", { gain: 0.35, rate: 1.05, delay: 2.4 });
                } },
              { who: "妹妹", say: "哥……", d: 1.8,
                cam: CINE(32.0, 0.44, 2.90, [FG.jambR(1.82, 0.32, 1.0, 1.98)]) },
              { who: "妹妹", say: "冷。", d: 2.0,
                cam: CINE(32.0, 0.44, 2.90, [FG.kangLow(1.82, 1.2, 0.22)]) },
              { act: "柱子将破袄向上拉，盖住她的肩膀。妹妹躺下，很快睡着。", d: 4.4,
                cam: CINE(31.4, 0.58, 2.91, [FG.jambR(1.83, 0.32, 1.0, 1.98)]),
                on: (s) => {
                  const k = FindActor(s, "sister");
                  if (k) { k.x = 30.75; k.heading = -1; k.pose = "sleep"; k.track = null; }
                  s.player.x = 30.5;
                  s.player.heading = 1;
                  FlashPose(s, "kneel", 4.0);
                  Cue(s, "clothDrop", { gain: 0.4, delay: 1.6 });
                } },
              // 碎布贴上手腕：只够盖住一小块（这一下是下窖找布的全部理由）
              { act: "柱子从怀里取出坛口那块蓝底白花碎布。", d: 3.0,
                cam: CINE(31.6, 0.52, 2.90, [FG.kangLow(1.83, 1.2, 0.22)]),
                on: (s) => {
                  s.player.x = 31.9;
                  s.player.heading = -1;
                  s.player.carry = "碎布";
                  FlashPose(s, "kneel", 2.8);
                } },
              // 同一个机位：开场看过的那截手腕（首尾同框，接袖那一针的由头）
              { act: "他把碎布贴到妹妹露出的手腕旁。", d: 3.4,
                cam: WRIST_CAM,
                on: (s) => {
                  FlashPose(s, "kneel", 3.2);
                  Cue(s, "clothLift", { gain: 0.35, delay: 0.8 });
                } },
              { act: "碎布只够盖住一小块。", d: 3.0,
                cam: WRIST_CAM },
              { act: "他把碎布收回怀里。", d: 2.4,
                cam: CINE(31.8, 0.52, 2.90, [FG.jambR(1.83, 0.32, 1.0, 1.98)]),
                on: (s) => {
                  s.player.carry = null;
                  FlashPose(s, "kneel", 2.2);
                } },
              { act: "柱子看向院中的菜窖。", d: 3.0,
                cam: CINE(30.4, 0.65, 3.23, [FG.kangLow(2.04, 1.2, 0.22)]),
                on: (s) => {
                  s.player.pose = null;
                  s.player.heading = -1;
                  s.toast = { text: "目标：找块布，把她的袖口接长。", t: 4.5 };
                } },
            ]);
          } },
      ],
    },
    {
      // §9 菜窖（八稿：摸黑归置那三道手删了）。没有音乐。夜里下窖：
      // 摸到笸箩——妹妹穿小的旧褂叠在里面，最上面一件袖口磨飞了边、也短了
      // 一截；针别在衣领上，线还留着一段。把旧褂和笸箩**放到梯子旁**（缝那
      // 一场的伏笔）。掀开草苫：一块对折的布，蓝底白花，整块没下过剪子。
      // 取出怀里的碎布放在整布上——**两块布的花纹接在一起**（wholeCloth
      // 插卡第二段）。贴脸，很快，就一下。抱着布走向梯子——草苫下面动了
      // 一下，一只手从黑暗里抓住他的手腕：「水。」整块蓝布留在草苫旁。
      kind: "chain", id: "c1_cellar", timeOfDay: "night",
      objective: "找针线和旧衣裳", hint: "月亮不亮，可够看见窖口在哪儿",
      onStart: (state) => {
        // 妹妹在铺盖上（黄昏那拍哄睡的延续——她没睡实）
        const sis = FindActor(state, "sister");
        if (sis) { sis.visible = true; sis.level = "surface"; sis.cineTarget = null; sis.following = false; sis.x = 30.75; sis.heading = 1; sis.pose = "sleep"; }
        state.player.pose = null;
        state.stoveFire = false;   // 夜里灶熄了
        // 夜里窖口那几条月光（World 认这面旗；lidShut 的板缝光同一支画笔）
        state.hatchMoon = true;
        // 跳幕落回这一拍时（manFound 已经立着）：草苫底下那个人得还在，
        // 不然回头看一眼，说「水」的人凭空没了
        const w = FindActor(state, "wounded");
        if (w) {
          const found = !!state.flags.manFound;
          w.visible = found; w.level = "under"; w.x = 27.1; w.heading = -1;
          w.pose = "sleep"; w.track = null;
        }
      },
      steps: [
        // 下到底：板缝里漏下来几条光，打在土壁上。跟三天前一样——
        // 只是这回，是他自己从上面下来的（同一个机位，回的是序里那一镜）
        { type: "goto", zone: { x: 30.5, w: 3.0, level: "under" },
          effect: (state) => {
            StartMicroCine(state, [
              { act: "柱子掀开菜窖翻板。月光落进窖口——板缝里的光，与三天前一样。", d: 3.6,
                cam: CINE(29.6, UNDER_Y + 3.5 - 0.26, 2.99, [FG.jambR(1.45, 0.32, 1.0, 1.98)]),
                on: (s) => { Cue(s, "doorCreak", { gain: 0.4, rate: 0.75 }); } },
              { act: "", d: 2.4, cam: CINE(30.4, UNDER_Y + 1.1 - 0.34, 3.78, [FG.strawLow(1.83, 1.0, 0.24)]) },
            ]);
          } },
        // 笸箩：妹妹穿小了的旧褂子，一件摞一件，叠得整整齐齐。
        // 针别在最上面那件的领口上，线还留着一截。放到梯子旁
        { type: "use", zone: { x: 32.4, w: 2.2, level: "under" }, prompt: "E · 摸向笸箩",
          effect: (state) => {
            state.flags.basketMoved = true;
            Cue(state, "clothLift", { gain: 0.4, rate: 0.9 });
            StartMicroCine(state, [
              { act: "笸箩里叠着妹妹穿小的旧褂子。最上面一件袖口磨飞了边，也短了一截。", d: 4.2,
                cam: CINE(32.4, UNDER_Y + 0.55 - 0.26, 2.18, [FG.ladderL(1.05, 0.32, 0.96, 1.94)]),
                on: (s) => { FlashPose(s, "kneel", 4.0); } },
              { act: "针别在衣领上，线还留着一段。", d: 3.0,
                cam: CINE(32.4, UNDER_Y + 0.5 - 0.26, 1.72, [FG.strawLow(0.83, 1.0, 0.24)]) },
              { act: "柱子把旧褂和针线笸箩一起放到梯子旁。", d: 3.2,
                cam: CINE(31.0, UNDER_Y + 1.0 - 0.34, 3.36, [FG.ladderL(1.63, 0.32, 0.96, 1.94)]),
                on: (s) => {
                  FlashPose(s, "bow", 2.8);
                  Cue(s, "drop", { gain: 0.3, rate: 0.9, delay: 1.2 });
                } },
            ]);
          } },
        // 掀草苫：底下是一块对折的布。蓝底白花，整块没下过剪子。
        // 碎布放上去——两块布的花纹接在一起。贴脸一下。抱着走向梯子——
        // 一只手从黑暗里抓住他的手腕
        { type: "use", zone: { x: 27.6, w: 2.2, level: "under" }, hold: 1.3, stroke: "up",
          gestureY: 0.5, pose: "bow", prompt: "掀开草苫",
          effect: (state) => {
            // 旗标落 effect；carry 是画面，只在微过场行里挂/收——落在 effect 里
            // 的话跳幕结算会把一块"整布"永远糊在手上（二轮视觉审查的悬空蓝板）
            state.flags.clothOut = true;
            // manFound / manGrab 落在各自那一格里（放下布 / 手攥住），不再一开头
            // 就全立起来——旗标一立，画面上的东西就跟着现，早立就是穿帮
            Cue(state, "clothLift", { gain: 0.5, rate: 0.8 });
            StartMicroCine(state, [
              { act: "草苫底下，露出一块对折的布。", d: 2.8,
                cam: CINE(27.4, UNDER_Y + 0.5 - 0.26, 2.3, [FG.strawLow(1.12, 1.0, 0.24)]),
                on: (s) => { FlashPose(s, "kneel", 2.6); } },
              // 光底下看清了：蓝底白花，整块，没下过剪子（活动插卡）
              { act: "蓝底白花。整块布还没有下过剪子。", d: 3.8,
                cam: { kind: "insertCard", card: "wholeCloth", seg: 0 } },
              // 花纹比对（八稿新增）：碎布放在整布上，两块布的花纹接在一起
              { act: "柱子从怀里取出坛口的碎布，展开，放在整布上。", d: 3.4,
                cam: { kind: "insertCard", card: "wholeCloth", seg: 1 },
                on: (s) => { Cue(s, "clothLift", { gain: 0.3, rate: 1.1 }); } },
              { act: "两块布的花纹接在一起。", d: 3.4,
                cam: { kind: "insertCard", card: "wholeCloth", seg: 1 } },
              { act: "柱子把碎布收回怀里。", d: 2.4,
                cam: CINE(27.4, UNDER_Y + 0.5 - 0.26, 2.3, [FG.ladderL(1.12, 0.32, 0.96, 1.94)]),
                on: (s) => { Cue(s, "clothFold", { gain: 0.35, delay: 0.5 }); } },
              // 贴了一下。很快，就一下
              { act: "他抱起整布，低下头，将脸贴上去。只贴了一下。", d: 3.8,
                cam: CINE(27.7, UNDER_Y + 0.95 - 0.26, 2.18, [FG.strawLow(1.05, 1.0, 0.24)]),
                on: (s) => {
                  s.player.carry = "整布";
                  // leanIn 是妹妹「把额头抵在别人肩上」那支：下巴其实是抬着的，
                  // 两只手还蜷在身后——三行 8 秒里没有一帧是"把脸贴上去"
                  FlashTrack(s, "pressFace", 3.6);
                  Cue(s, "sobBreath", { gain: 0.18, rate: 0.7, delay: 1.6 });
                } },
              // 抱着布走向梯子——**只走一步**。老版走到 28.6（离草苫 1.3 米）
              // 才被"抓住手腕"，可躺在地上的人肩膀离地才 0.3 米，胳膊伸直也够
              // 不到那儿：画面上是一只趴在地上的手，和一米开外自己举着胳膊的
              // 柱子，中间空着。接触戏那条定式（先站到一臂之内）在这一拍是硬的
              { act: "他将布抱在胸前，转身走向梯子。", d: 2.6,
                cam: CINE(28.3, UNDER_Y + 1.05 - 0.34, 3.36, [FG.ladderL(1.63, 0.32, 0.96, 1.94)]),
                on: (s) => { s.player.cineWalk = { x: 28.6, speed: 1.0 }; } },
              // 草苫先动。人还没露出来——这一格里草堆是自己抖的（state.matStir，
              // World 把那一垛真晃 1.2 秒），光同时压到 tunnel 档：
              // 「从黑暗里伸出来」得先有黑
              { act: "草苫下面忽然动了一下。", d: 2.4,
                cam: CINE(27.5, UNDER_Y + 0.4 - 0.26, 2.07, [FG.strawLow(1.0, 1.0, 0.24)]),
                on: (s) => {
                  s.player.cineWalk = null;
                  s.player.x = 28.6;
                  s.player.heading = -1;         // 回过身，朝着草苫
                  s.lightOverride = "tunnel";
                  s.matStir = { t: 0 };
                  Cue(s, "flutter", { gain: 0.25, rate: 0.7 });
                } },
              // 柱子蹲下去看——蹲下这一下不是修饰：躺着的人只能够到这么高。
              // 站位是量出来的（World.LimbTipsOf）：伤员躺在 27.1、头落在 28.0、
              // 探出来的手够到 28.10/离地 0.53；柱子蹲在 28.6 时前手正落在
              // 28.10/离地 0.56——两只手在同一个点上，这一镜才是"攥住"
              { act: "柱子放下布，蹲下去。", d: 2.2,
                cam: CINE(28.3, UNDER_Y + 0.7 - 0.34, 2.73, [FG.ladderL(1.32, 0.32, 0.96, 1.94)]),
                on: (s) => {
                  s.player.carry = null;
                  // 整布这会儿才撂在草苫旁（wholeClothRest 认 manFound 这面旗）——
                  // 老版在 effect 开头就立了它：布还抱在怀里，地上已经躺着一块
                  s.flags.manFound = true;
                  FlashPose(s, "kneel", 2.2);
                  Cue(s, "clothDrop", { gain: 0.3, rate: 0.85, delay: 0.9 });
                } },
              // 一只手从黑暗里伸出来，抓住手腕：**伤员是真演员**（不再是地上
              // 一张静帧贴图）。他从草苫底下把胳膊探出来攥住柱子的手腕，
              // 柱子那条被攥住的胳膊被拽得往前一沉——两条轨道对在同一个落点上
              { act: "一只手从草苫底下伸出来，攥住柱子的手腕。柱子猛地僵住。", d: 3.2,
                cam: CINE(28.15, UNDER_Y + 0.5 - 0.26, 1.95, [FG.strawLow(0.95, 1.0, 0.24)]),
                on: (s) => {
                  const w = FindActor(s, "wounded");
                  if (w) {
                    w.visible = true; w.level = "under"; w.x = 27.1; w.heading = -1;
                    w.pose = "sleep";
                    w.track = { name: "strawReach", t: -0.12 };   // 负数起步＝等柱子蹲稳
                  }
                  s.player.pose = null;
                  s.player.track = { name: "wristSeized", t: 0 };
                  s.flags.manGrab = true;
                  Cue(s, "pickup", { gain: 0.6, rate: 0.5 });
                } },
              { act: "那只手攥得很紧。草底下传来一口短促的喘息。", d: 3.0,
                cam: CINE(28.1, UNDER_Y + 0.45 - 0.26, 1.84, [FG.ladderL(0.89, 0.32, 0.96, 1.94)]),
                on: (s) => { Cue(s, "sobBreath", { gain: 0.3, rate: 0.6, delay: 0.8 }); } },
              // 说话的人得在画面里。骨架在窖底给不出一张脸（整具转 90°、
              // 脑袋二十来个像素），所以这两行走手绘活卡——同"整幅蓝布"那一族
              { act: "草苫掀开一角。一张脸横在草里，仰着，胡子拉碴。", d: 3.2,
                cam: { kind: "insertCard", card: "strangerFace", seg: 0 } },
              { who: "陌生人", say: "水。", d: 3.0,
                cam: { kind: "insertCard", card: "strangerFace", seg: 1 } },
              // 慢慢抽回手：他的胳膊落回草里（strawSink），柱子才站起来
              { act: "那只手松开，落回草里。柱子慢慢站起来。整块蓝布留在草苫旁。", d: 3.4,
                cam: CINE(28.4, UNDER_Y + 0.95 - 0.34, 3.15, [FG.strawLow(1.52, 1.0, 0.24)]),
                on: (s) => {
                  s.player.track = null;
                  s.player.carry = null;
                  s.player.x = 28.75;
                  s.player.heading = 1;
                  const w = FindActor(s, "wounded");
                  if (w) w.track = { name: "strawSink", t: 0 };
                  Cue(s, "clothDrop", { gain: 0.35, rate: 0.8 });
                } },
            ]);
          } },
        // 往上爬（他向梯子走去）
        { type: "goto", zone: { x: 30.2, w: 2.6 } },
      ],
    },
    {
      // §10 我当你也走了（八稿）：他爬出来，没盖翻板。三步外站着妹妹——
      // 赤着脚，怀里抱着破袄，头发乱着，眼睛还没有完全睁开。
      // 「我喊你了。」「可大声了。」「我当你也走了。」
      // 柱子张了张嘴，没有立刻出声——那两个字是玩家自己按出来的（c1_say2）。
      kind: "cinematic", id: "c1_knows", timeOfDay: "night", indoorScene: true,
      lines: [
        { act: "柱子爬出菜窖，没有盖翻板。三步外站着妹妹。", d: 3.6,
          // 分镜 37：翻板撑起来立在画一侧、洞口黑在脚下，柱子从洞里出来、
          // 妹妹抱着破袄站在三步外。**窖口在 x=29.0**（Data_Scenes.json 的
          // `hatch`），老版这几镜一直照 29.4 拍，差着大半个板宽
          cam: CINE(28.70, 0.48, 4.30, [{ art: "hatchLip", u: 0.42, v: -0.90, z: 2.71, w: 1.7, h: 0.38, dim: 1.86 }]),
          on: (state) => {
            // 板得真的敞着——这一拍原来一句 state.lid 都没有，于是「没有盖翻板」
            // 只在字幕上成立
            state.flags.lidShut = false;
            state.lid = { id: "cellarHatch", open: 1, to: 1, rate: 1.5 };
            const sis = FindActor(state, "sister");
            // lift 归零：§4 托她画正字时立的 0.52 会一路挂到这儿（同 §7 那条）
            if (sis) { sis.visible = true; sis.level = "surface"; sis.lift = 0; sis.x = 28.2; sis.heading = 1; sis.pose = null; sis.carry = "破袄子"; }
            state.player.level = "surface";
            state.player.x = 29.8;
            state.player.heading = -1;
          } },
        // 机位抬到上身：骨架的鞋画不出赤脚，脚入画就跟字幕打架——
        // 「光着脚」交给句子，镜头看她抱着袄子的小身量（两轮视觉审查定的）
        { act: "她赤着脚，怀里抱着破袄。头发乱着，眼睛还没有完全睁开。", d: 4.0,
          cam: CINE(27.95, 0.56, 3.20, [FG.jambL(1.80, 0.58, 1.00, 2.09)]),
          on: (state) => {
            const sis = FindActor(state, "sister");
            if (sis) { sis.x = 27.9; sis.pose = "leanIn"; }
          } },
        { who: "妹妹", say: "哥。", d: 2.0,
          cam: CINE(27.95, 0.37, 2.90, [FG.jambL(1.66, 0.28, 0.90, 2.09)]) },
        { act: "柱子停住。", d: 2.0,
          cam: CINE(29.78, 0.39, 2.90, [{ art: "hatchLip", u: 0, v: -0.84, z: 1.68, w: 1.1, h: 0.30, dim: 1.94 }]) },
        { who: "妹妹", say: "我喊你了。", d: 2.4,
          cam: CINE(27.95, 0.56, 3.20, [FG.jambL(1.80, 0.58, 1.00, 2.09)]) },
        { act: "", d: 1.4, cam: CINE(27.95, 0.56, 3.20, [FG.jambL(1.80, 0.58, 1.00, 2.09)]) },
        { who: "妹妹", say: "可大声了。", d: 2.4,
          cam: CINE(27.95, 0.56, 3.20, [FG.jambL(1.80, 0.58, 1.00, 2.09)]) },
        { act: "她的脚趾在冷土里一下下抓紧。", d: 3.0,
          cam: CINE(27.95, 0.26, 2.90, [FG.jambL(1.66, 0.22, 0.70, 2.09)]) },
        // 双人镜别用过肩：窖口这一对离得近、又一高一矮，过肩的前景剪影
        // 立不住（二轮审查：柱子整个不在框里）——平拍双人，两人都在画里
        { who: "妹妹", say: "我当你也走了。", d: 3.2,
          cam: CINE(28.85, 0.62, 4.20, [{ art: "hatchLip", u: 0.40, v: -0.88, z: 2.65, w: 1.6, h: 0.34, dim: 1.86 }]),
          on: (state) => {
            // 分镜 39 两个人挨得很近（一臂之内）。老版隔着 1.6m，正中 40% 是空墙
            const sis = FindActor(state, "sister");
            if (sis) { sis.x = 28.55; sis.heading = 1; }
            state.player.x = 29.55;
          } },
        { act: "柱子张了张嘴，没有立刻出声。", d: 2.6,
          cam: CINE(29.76, 0.36, 2.90, [{ art: "hatchLip", u: 0, v: -0.84, z: 1.67, w: 1.1, h: 0.30, dim: 1.94 }]) },
      ],
    },
    {
      // §10 玩家操作（八稿新增的一按）：说「没走」。
      kind: "chain", id: "c1_say2", timeOfDay: "night", indoorScene: true,
      objective: "答她", hint: "她还站在冷土里",
      onStart: (state) => {
        const sis = FindActor(state, "sister");
        if (sis) { sis.visible = true; sis.level = "surface"; sis.cineTarget = null; sis.x = 27.9; sis.heading = 1; sis.pose = "leanIn"; sis.carry = "破袄子"; }
        state.player.level = "surface";
        state.player.x = 29.8;
        state.player.heading = -1;
        state.hatchMoon = true;
      },
      steps: [
        { type: "use", zone: { x: 29.6, w: 3.0 }, prompt: "E · 说「没走」",
          effect: (state) => {
            StartMicroCine(state, [
              { who: "柱子", say: "没走。", d: 2.2,
                cam: { kind: "close", on: "player", dist: 3.0, fg: [FG.jambL(1.6, 0.30, 0.94, 2.02)] } },
              { act: "柱子向妹妹走近一步。", d: 2.2,
                cam: CINE(29.0, 0.55, 2.90, [FG.jambR(1.82, 0.32, 1.0, 1.98)]),
                on: (s) => { s.player.cineWalk = { x: 29.0, speed: 1.2 }; } },
              { who: "柱子", say: "我去拿水。", d: 2.2,
                cam: CINE(28.8, 0.52, 2.90, [FG.kangLow(1.83, 1.2, 0.22)]),
                on: (s) => { s.player.cineWalk = null; s.player.x = 29.0; s.player.heading = -1; } },
              { who: "柱子", say: "你回屋。", d: 2.0,
                cam: CINE(28.8, 0.52, 2.90, [FG.jambR(1.83, 0.32, 1.0, 1.98)]) },
              { act: "妹妹看着他。", d: 2.2,
                cam: CINE(27.9, 0.44, 2.90, [FG.kangLow(1.82, 1.2, 0.22)]) },
              // 八稿新增的一下：柱子替她把破袄向上拉了拉
              { act: "柱子替她把破袄向上拉了拉。", d: 3.0,
                cam: CINE(28.5, 0.47, 2.90, [FG.jambR(1.83, 0.32, 1.0, 1.98)]),
                on: (s) => {
                  s.player.x = 28.6;
                  FlashPose(s, "kneel", 2.8);
                  Cue(s, "clothLift", { gain: 0.35, delay: 0.6 });
                } },
              { act: "妹妹转身进屋。走到门口时，她回头看了一眼。", d: 4.2,
                cam: CINE(29.6, 0.61, 3.07, [FG.kangLow(1.93, 1.2, 0.22)]),
                on: (s) => {
                  const k = FindActor(s, "sister");
                  if (k) { k.pose = null; k.carry = null; k.cineTarget = { x: 31.4 }; k.cineSpeed = 1.3; k.heading = 1; }
                } },
              { act: "她没有把门关严，留下了一条缝。", d: 3.2,
                cam: CINE(31.8, 0.58, 2.91, [FG.jambR(1.83, 0.32, 1.0, 1.98)]),
                on: (s) => { Cue(s, "doorCreak", { gain: 0.3, rate: 0.85, delay: 1.4 }); } },
            ]);
          } },
      ],
    },
    {
      // §11 半瓢水（八稿）：柱子先把翻板虚掩上，只留半尺宽的缝。
      // 缸里是下午刚打回来的水——瓢探进去，**水线随着瓢抬起而下降**
      // （state.vatScoop 交给渲染层演那一下）。端着半瓢水，从板缝下去。
      kind: "chain", id: "c1_water", timeOfDay: "night",
      objective: "给窖里的人拿水", hint: "翻板先虚掩上，只留半尺",
      onStart: (state) => {
        const sis = FindActor(state, "sister");
        if (sis) { sis.visible = true; sis.level = "surface"; sis.cineTarget = null; sis.following = false; sis.x = 30.75; sis.heading = -1; sis.pose = "sleep"; }
        state.player.level = "surface";
        state.hatchMoon = true;
      },
      steps: [
        { type: "use", zone: { x: 29.2, w: 2.2 }, prompt: "E · 把翻板虚掩上",
          effect: (state) => {
            state.flags.lidShut = true;
            Cue(state, "doorCreak", { gain: 0.5, rate: 0.8 });
          } },
        { type: "use", zone: { x: 43.4, w: 2.6 }, hold: 1.1, stroke: "up", gestureY: 0.7,
          pose: "bow", cue: "waterDrip", prompt: "舀半瓢水",
          effect: (state) => {
            GiveItem(state, { id: "ladleWater", label: "半瓢水" });
            // 水线随着瓢抬起而下降（渲染层照着这张小账演 1.6s）
            state.vatScoop = { t: 0 };
            Cue(state, "waterSplash", { gain: 0.5 });
            Cue(state, "waterDrip", { gain: 0.4, delay: 0.9 });
            FlashPose(state, "bow", 1.4);
          } },
        { type: "goto", zone: { x: 30.4, w: 2.6, level: "under" } },
      ],
    },
    {
      // §12 撕布（八稿改成**可玩**）：窖底。喂水（长按托稳——他喝得急，
      // 中途呛一下，手不能撤）；摸到血（月光下指尖一片暗色）；碎布按伤口，
      // 浸透，压不住；**撕开蓝布**（活卡 TEAR_CARD：抓住布角横向拖——
      // 第一下布只被拉紧，第二下布边裂开一道口，继续拉，一条长布撕下来）；
      // 包扎（穿肩下绕背拉回：第一圈松、拉紧、第二圈、末端压进布层）；
      // 按住他（长按：他挣动，力气逐渐松下来）。
      kind: "chain", id: "c1_rescue", timeOfDay: "night",
      objective: "救他", hint: "他在草苫底下等着那口水",
      onStart: (state) => {
        // 伤员现出来（草苫底下那只手的主人）；妹妹在楼上睡
        state.flags.manGrab = false;
        const w = FindActor(state, "wounded");
        // heading -1：躺倒往背后（东）倒，头/肩落在 27.5 一侧——
        // 柱子跪在 28.0 摸得着肩（27.4 的腌菜缸已挪去 28.3 让位）
        if (w) { w.visible = true; w.level = "under"; w.x = 27.1; w.heading = -1; w.pose = "sleep"; }
        const sis = FindActor(state, "sister");
        if (sis) { sis.visible = true; sis.level = "surface"; sis.x = 30.75; sis.heading = -1; sis.pose = "sleep"; }
        state.player.level = "under";
        state.hatchMoon = true;
        // 跳幕直落这一拍：手里得端着那半瓢水（喂水那一步 needs 它）
        if (state.player.item?.id !== "ladleWater") {
          GiveItem(state, { id: "ladleWater", label: "半瓢水" });
        }
      },
      tick: (state, dt) => {
        // 按住他那一步（steps[5]）：挣动渐松——伤员的抖跟着长按的进度往下走
        const b = state.beat;
        const w = FindActor(state, "wounded");
        if (!w) return;
        const st = b.stepIndex;
        if (st === 5) {
          const k = Math.max(0, 1 - (b.holdP || 0) / 5.0);
          w.track = { name: "tremble", t: (w.track?.t || 0) + dt, ambient: true };
          w.trembleK = 0.4 + 0.6 * k;
        } else if (w.track?.name === "tremble" && st > 5) {
          w.track = null; w.trembleK = 0;
        }
      },
      steps: [
        // 摸过去：端着瓢，蹲下，顺着墙根摸到那个人的肩膀
        { type: "goto", zone: { x: 28.3, w: 1.8, level: "under" },
          effect: (state) => {
            StartMicroCine(state, [
              { act: "柱子端着瓢摸到墙边。他蹲下，顺着墙根摸到那个人的肩膀。", d: 4.0,
                cam: CINE(27.6, UNDER_Y + 0.6 - 0.26, 2.53, [FG.strawLow(1.22, 1.0, 0.24)]),
                on: (s) => {
                  s.player.cineWalk = null;
                  s.player.x = 28.0;
                  s.player.heading = -1;
                  FlashPose(s, "kneel", 3.8);
                } },
            ]);
          } },
        // ① 喂水：把瓢托在他嘴边，保持稳定（长按托稳；中途他呛一下）
        { type: "use", zone: { x: 28.0, w: 2.2, level: "under" }, hold: 3.4, steady: true,
          pose: "ladleSteady", needs: "ladleWater", consume: false,
          prompt: "按住 E · 把瓢托稳",
          steadyCues: [
            [0.5, "waterDrip", 0.4, 1.0],       // 一只手扶住瓢沿
            [1.2, "waterSplash", 0.25, 1.3],    // 水响。喝得很急
            [1.9, "sobBreath", 0.45, 1.4],      // 中途呛了一下
            [2.4, "waterSplash", 0.2, 1.35],
          ],
          effect: (state) => {
            state.player.item = null;
            StartMicroCine(state, [
              { act: "瓢里的水喝完了，那只手仍抓着瓢沿。柱子慢慢把瓢抽出来。", d: 3.8,
                cam: CINE(27.7, UNDER_Y + 0.55 - 0.26, 2.18, [FG.ladderL(1.05, 0.32, 0.96, 1.94)]),
                on: (s) => {
                  FlashPose(s, "kneel", 3.6);
                  Cue(s, "drop", { gain: 0.25, rate: 0.8, delay: 1.8 });
                } },
              { act: "伤员倒回草苫上。他的呼吸又快又浅。", d: 3.4,
                cam: CINE(27.4, UNDER_Y + 0.5 - 0.26, 2.42, [FG.strawLow(1.17, 1.0, 0.24)]),
                on: (s) => { Cue(s, "sobBreath", { gain: 0.4, rate: 1.3, delay: 0.8 }); } },
              { act: "柱子伸手摸向他的肩膀。手指碰到一片湿黏。", d: 3.8,
                cam: CINE(27.6, UNDER_Y + 0.55 - 0.26, 2.07, [FG.ladderL(1.0, 0.32, 0.96, 1.94)]),
                on: (s) => { FlashPose(s, "kneel", 3.6); } },
              { act: "他抬起手。月光从板缝照下来——指尖是一片暗色。", d: 4.0,
                cam: CINE(27.9, UNDER_Y + 0.85 - 0.26, 1.84, [FG.strawLow(0.89, 1.0, 0.24)]) },
              { act: "柱子取出怀里的蓝花碎布，按在伤口上。", d: 3.4,
                cam: CINE(27.5, UNDER_Y + 0.55 - 0.26, 2.18, [FG.ladderL(1.05, 0.32, 0.96, 1.94)]),
                on: (s) => {
                  FlashPose(s, "kneel", 3.2);
                  Cue(s, "clothLift", { gain: 0.4, rate: 0.9, delay: 0.6 });
                } },
              { act: "暗色很快浸透碎布，沿着指缝继续渗出来。", d: 3.6,
                cam: CINE(27.5, UNDER_Y + 0.55 - 0.26, 1.95, [FG.strawLow(0.95, 1.0, 0.24)]) },
              { act: "柱子加重力气。仍然压不住。", d: 3.0,
                cam: CINE(27.9, UNDER_Y + 0.85 - 0.34, 2.84, [FG.ladderL(1.38, 0.32, 0.96, 1.94)]),
                on: (s) => { FlashPose(s, "kneel", 2.8); } },
              { act: "草苫旁放着那块完整的蓝底白花布。", d: 3.0,
                cam: CINE(27.9, UNDER_Y + 0.5 - 0.26, 2.3, [FG.strawLow(1.12, 1.0, 0.24)]) },
            ]);
          } },
        // ② 撕开蓝布（活卡）：抓住布的一角，沿横向拖动——
        // 第一下绷紧、第二下裂口、继续拉，一条长布分离下来
        { type: "tear", zone: { x: 27.9, w: 2.4, level: "under" },
          effect: (state) => {
            state.flags.clothTorn = true;
            StartMicroCine(state, [
              { act: "撕裂声在菜窖里响开。一条长布从整块布上分离下来。", d: 3.2,
                cam: CINE(28.0, UNDER_Y + 0.7 - 0.26, 2.3, [FG.ladderL(1.12, 0.32, 0.96, 1.94)]),
                on: (s) => { FlashPose(s, "bow", 3.0); } },
            ]);
          } },
        // ③ 包扎一：布条从伤员肩下穿过，绕到背后，再拉回胸前——第一圈很松
        { type: "use", zone: { x: 27.9, w: 2.2, level: "under" }, hold: 1.7, stroke: "right", gestureY: 0.55,
          pose: "bandageWrap", cue: "clothLift",
          prompt: "布条绕过肩",
          note: "第一圈很松。暗色继续向外扩。" },
        // ④ 包扎二：拉紧布条，再绕第二圈，末端压进缠好的布层
        { type: "use", zone: { x: 27.9, w: 2.2, level: "under" }, hold: 1.9, stroke: "right", gestureY: 0.55,
          pose: "bandageWrap", cue: "clothLift",
          prompt: "拉紧，再绕一圈",
          effect: (state) => {
            state.flags.manBound = true;
            const w = FindActor(state, "wounded");
            if (w) w.bandage = true;   // 肩上那圈蓝花布（渲染层认这面小旗）
            StartMicroCine(state, [
              { act: "伤员突然疼醒，肩膀猛地抬起，喉咙里挤出一声闷哼。", d: 3.2,
                cam: CINE(27.5, UNDER_Y + 0.55 - 0.26, 2.18, [FG.strawLow(1.05, 1.0, 0.24)]),
                on: (s) => {
                  Cue(s, "sobBreath", { gain: 0.55, rate: 0.7, delay: 0.4 });
                  const w2 = FindActor(s, "wounded");
                  if (w2) { w2.track = { name: "tremble", t: 0, ambient: true }; w2.trembleK = 1; }
                } },
            ]);
          } },
        // ⑤ 按住他：一只手压住肩膀，另一只手托住后颈。长按——挣动渐松
        { type: "use", zone: { x: 27.9, w: 2.2, level: "under" }, hold: 5.0, steady: true,
          pose: "pinDown",
          prompt: "按住 E · 别让他挣",
          steadyCues: [
            [0.8, "sobBreath", 0.45, 0.75],
            [2.2, "sobBreath", 0.35, 0.7],
            [3.8, "sobBreath", 0.25, 0.65],
          ],
          effect: (state) => {
            const w = FindActor(state, "wounded");
            if (w) { w.track = null; w.trembleK = 0; }
            StartMicroCine(state, [
              { act: "伤员的力气逐渐松下来。呼吸慢了一些。柱子没有立刻松手。", d: 4.4,
                cam: CINE(27.9, UNDER_Y + 0.85 - 0.34, 2.84, [FG.ladderL(1.38, 0.32, 0.96, 1.94)]),
                on: (s) => { FlashPose(s, "shelter", 4.2); } },
              { act: "等伤员彻底不再挣动，柱子靠墙坐下。", d: 3.6,
                cam: CINE(28.8, UNDER_Y + 0.95 - 0.34, 3.36, [FG.strawLow(1.63, 1.0, 0.24)]),
                on: (s) => {
                  s.player.x = 29.4;
                  s.player.heading = -1;
                  s.player.pose = "sitSide";
                } },
              { act: "他手里仍攥着撕剩的一小条蓝布。", d: 3.2,
                cam: CINE(29.3, UNDER_Y + 0.6 - 0.26, 1.95, [FG.ladderL(0.95, 0.32, 0.96, 1.94)]) },
              { act: "菜窖里只剩两个人的呼吸声。", d: 3.6,
                cam: CINE(28.6, UNDER_Y + 0.95 - 0.34, 3.57, [FG.strawLow(1.73, 1.0, 0.24)]),
                on: (s) => {
                  Cue(s, "sobBreath", { gain: 0.16, rate: 0.65, delay: 1.2 });
                } },
            ]);
          } },
        // 收尾步：⑤ 的微过场是 effect 起的（同 c1_tally 那条注释）
        { type: "goto", zone: { x: 28.6, w: 3.4, level: "under" } },
      ],
    },
    {
      // §13 缝（八稿·黎明过场半段）：板缝里的光从黑变成青灰。伤员肩上的
      // 蓝花布仍然扎着，胸口缓慢起伏。柱子拿起梯子旁的旧褂和针线，
      // 爬到窖口，坐在最上一级梯子上。
      kind: "cinematic", id: "c1_mend", timeOfDay: "dawn",
      lines: [
        { act: "板缝里的光从黑变成青灰。柱子睁开眼。", d: 4.6,
          // 分镜 46：坐着的柱子占可见画高七成半。坐高 0.78m ⇒ 画宽 2.55m
          cam: CINE(29.20, UNDER_Y + 0.40, 2.55, [FG.ladderL(1.60, 0.30, 0.92, 1.98)]),
          on: (state) => {
            // 布景（cinematic 不跑 onStart）：伤员裹着蓝花布睡在草苫上，
            // 妹妹在楼上睡；晨光走 hatchMoon 那几条
            const w = FindActor(state, "wounded");
            if (w) { w.visible = true; w.level = "under"; w.x = 27.1; w.heading = -1; w.pose = "sleep"; w.bandage = true; }
            const sis = FindActor(state, "sister");
            if (sis) { sis.visible = true; sis.level = "surface"; sis.x = 30.75; sis.heading = -1; sis.pose = "sleep"; }
            state.hatchMoon = true;
            state.player.level = "under";
            state.player.x = 29.4;
            state.player.heading = -1;
            state.player.pose = "sitSide";
          } },
        { act: "伤员躺在草苫上，肩上的蓝花布仍然扎着。胸口缓慢起伏。", d: 4.2,
          cam: CINE(27.40, UNDER_Y + 0.34, 2.90, [FG.strawLow(1.70, 1.0, 0.26)]) },
        { act: "柱子低头看向自己的手。手里还攥着最后一条蓝布。", d: 3.8,
          cam: CINE(29.32, UNDER_Y + 0.26, 2.90, [FG.ladderL(1.70, 0.22, 0.62, 2.02)]) },
        { act: "他拿起梯子旁妹妹去年的旧褂子和针线。", d: 3.6,
          cam: CINE(29.72, UNDER_Y + 0.30, 2.30, [FG.ladderL(1.40, 0.46, 0.86, 1.98)]),
          on: (state) => {
            state.player.pose = null;
            state.player.x = 29.8;
            state.player.carry = "小褂子";   // 手上得真有那件褂子（首轮抓过两手捧空）
            FlashPose(state, "kneel", 3.4);
            Cue(state, "clothLift", { gain: 0.4, rate: 0.9, delay: 1.0 });
          } },
        { act: "柱子爬到窖口，坐在最上一级梯子上。", d: 3.6,
          // 窖口在 x=29.0（Data_Scenes.json 的 hatch），这几镜一直照 29.4 拍
          cam: CINE(29.08, 0.46, 3.20, [{ art: "hatchLip", u: 0.12, v: -0.90, z: 2.01, w: 1.5, h: 0.34, dim: 1.86 }]),
          on: (state) => {
            state.player.level = "surface";
            state.player.x = 29.4;
            state.player.heading = -1;
            state.player.pose = "sitSide";
            Cue(state, "ladder", { gain: 0.4, rate: 0.9 });
          } },
      ],
    },
    {
      // §13 缝三针（八稿改成**可玩**，活卡 SEW_CARD）：蓝布贴在旧褂袖口。
      // 第一针从旧布背面穿出，位置偏高；第二针穿得偏低，两块布被拉出一道
      // 小褶；第三针穿过旧布、蓝布再折回去，线头绕过针脚，拉紧。
      // 接得歪，两只袖子不一样长——可蓝花布盖过了原来的袖口。
      kind: "chain", id: "c1_sew", timeOfDay: "dawn",
      objective: "把妹妹的袖口接长", hint: "针别在领口上，线还留着一段",
      onStart: (state) => {
        const w = FindActor(state, "wounded");
        if (w) { w.visible = true; w.level = "under"; w.x = 27.1; w.heading = -1; w.pose = "sleep"; w.bandage = true; }
        const sis = FindActor(state, "sister");
        if (sis) { sis.visible = true; sis.level = "surface"; sis.x = 30.75; sis.heading = -1; sis.pose = "sleep"; }
        state.hatchMoon = true;
        state.player.level = "surface";
        state.player.x = 29.4;
        state.player.heading = -1;
        state.player.pose = "sitSide";
        state.player.carry = "小褂子";
      },
      steps: [
        { type: "sew", zone: { x: 29.4, w: 2.6 },
          effect: (state) => {
            state.flags.mended = true;
            state.player.carry = null;
            StartMicroCine(state, [
              { act: "柱子把衣裳提起来。", d: 2.6,
                cam: CINE(29.4, 0.49, 2.90, [FG.jambR(1.81, 0.32, 1.0, 1.98)]),
                on: (s) => { s.player.carry = "小褂子"; } },
              // 接得歪。两只袖子不一样长。（活动插卡：举起来对着晨光看的
              // 那件小褂子——袖口接着一截蓝底白花）
              { act: "新接的袖口有些歪。两只袖子也不一样长。", d: 4.0,
                cam: { kind: "insertCard", card: "mendedSleeve", seg: 0 } },
              { act: "蓝花布已经盖过原来的袖口。", d: 3.4,
                cam: { kind: "insertCard", card: "mendedSleeve", seg: 1 } },
            ]);
          } },
      ],
    },
    {
      // §14 我在（八稿新结尾·上半）：清晨回屋。柱子坐到炕边，轻轻扶起
      // 妹妹的胳膊，把接了袖的旧褂套在她身上。蓝花袖口滑下来，盖住手腕。
      // 妹妹睁开眼：「哥？」
      kind: "cinematic", id: "c1_home", timeOfDay: "dawn",
      lines: [
        { act: "柱子走进屋。妹妹醒着，坐在炕上。", d: 3.6,
          cam: CINE(32.05, 0.42, 4.60, [FG.jambR(2.90, 0.82, 1.20, 1.94)]),
          on: (state) => {
            state.beat.indoorScene = true;
            const sis = FindActor(state, "sister");
            // **坐着，不是躺着**（Notion 镜 50「她醒着坐炕上」）。老版一路 sleep，
            // 于是 51/52 那两格「面对面把袄子递过去」在实机里成了「对着一个
            // 横躺的人比划」。lift 一并清掉（同 §7 那条）
            if (sis) { sis.visible = true; sis.level = "surface"; sis.lift = 0; sis.x = 31.05; sis.heading = 1; sis.pose = "kneel"; sis.track = null; }
            state.player.level = "surface";
            state.player.pose = null;
            state.player.carry = "小褂子";
            state.player.cineWalk = { x: 32.2, speed: 1.2 };
            Cue(state, "doorCreak", { gain: 0.3, rate: 0.9 });
          } },
        { act: "柱子坐到炕边，轻轻扶起她的胳膊，将旧褂套在她身上。", d: 4.4,
          // 分镜 51：两人面对面、不到一臂，褂子撑在两人正中
          cam: CINE(31.55, 0.44, 3.60, [FG.jambR(2.27, 0.66, 1.04, 1.98)]),
          on: (state) => {
            state.player.cineWalk = null;
            state.player.x = 31.95;
            state.player.heading = -1;
            FlashPose(state, "kneel", 4.2);
            Cue(state, "clothLift", { gain: 0.4, delay: 1.2 });
          } },
        { act: "妹妹迷迷糊糊地伸进一只手。", d: 3.0,
          cam: CINE(31.05, 0.32, 2.90, [FG.jambL(1.67, 0.24, 0.78, 2.02)]),
          on: (state) => { FlashPose(state, "kneel", 3.0); } },
        // 同一个机位第三次：那截手腕——这回被蓝花袖口盖住了。
        // jacketOn 落在这一行：袖口那块蓝花（World 的 cuffMesh）就是这句话的
        // 画面，落到下一拍才立的话，这一镜里手腕还是光的
        { act: "蓝花袖口滑下来，盖住她的手腕。", d: 3.8,
          cam: WRIST_CAM,
          on: (state) => {
            state.flags.jacketOn = true;
            state.player.carry = null;      // 褂子上了身，手里那件收掉
            FlashPose(state, "kneel", 3.6);
            Cue(state, "clothDrop", { gain: 0.3, rate: 1.1, delay: 0.8 });
          } },
        { act: "柱子又替她穿上另一边，把衣襟掖好。", d: 3.8,
          cam: CINE(31.55, 0.44, 3.40, [FG.jambR(2.14, 0.62, 1.02, 1.98)]),
          on: (state) => {
            state.player.carry = null;
            FlashPose(state, "kneel", 3.6);
          } },
        { act: "妹妹睁开眼。", d: 2.4,
          // 分镜 52：她坐着低头摸袖口，占可见画高六成 ⇒ 画宽 3.0m
          cam: CINE(31.32, 0.62, 3.40, [FG.jambL(1.92, 0.62, 1.05, 2.02)]),
          on: (state) => {
            const sis = FindActor(state, "sister");
            if (sis) { sis.pose = "kneel"; sis.x = 31.2; sis.heading = 1; }
          } },
        { who: "妹妹", say: "哥？", d: 2.2,
          cam: CINE(31.32, 0.62, 3.40, [FG.jambL(1.92, 0.62, 1.05, 2.02)]) },
      ],
    },
    {
      // §14 玩家操作（八稿收官的一按）：回答「我在」。
      // 全章三次一按（快了／没走／我在），最后一次落在这两个字上。
      kind: "chain", id: "c1_say3", timeOfDay: "dawn", indoorScene: true,
      objective: "答她", hint: "她刚睁开眼",
      onStart: (state) => {
        state.beat.indoorScene = true;
        const sis = FindActor(state, "sister");
        if (sis) { sis.visible = true; sis.level = "surface"; sis.cineTarget = null; sis.x = 31.2; sis.heading = 1; sis.pose = "kneel"; }
        state.player.level = "surface";
        state.player.x = 32.2;
        state.player.heading = -1;
      },
      steps: [
        { type: "use", zone: { x: 32.2, w: 3.0 }, prompt: "E · 回答「我在」",
          effect: (state) => {
            state.flags.jacketOn = true;
            StartMicroCine(state, [
              { who: "柱子", say: "我在。", d: 2.4,
                cam: { kind: "close", on: "player", dist: 3.0, fg: [FG.jambR(1.6, 0.30, 0.94, 2.02)] } },
              { act: "妹妹的手从被子里伸出来，攥住新接的蓝花袖口。", d: 4.0,
                cam: WRIST_CAM,
                on: (s) => { Cue(s, "clothLift", { gain: 0.3, rate: 1.05, delay: 1.0 }); } },
              { act: "柱子替她盖好破袄，起身走出屋门。", d: 3.8,
                cam: CINE(32.2, 0.58, 2.91, [FG.kangLow(1.83, 1.2, 0.22)]),
                on: (s) => {
                  const k = FindActor(s, "sister");
                  if (k) { k.pose = "sleep"; k.x = 30.75; k.heading = -1; }
                  FlashPose(s, "kneel", 2.0);
                  s.player.cineWalk = { x: 34.4, speed: 1.2 };
                  Cue(s, "doorCreak", { gain: 0.3, rate: 0.9, delay: 2.6 });
                } },
            ]);
          } },
      ],
    },
    {
      // §14 我在（八稿新结尾·下半）：妹妹侧过脸——从没有关严的屋门，
      // 可以看见柱子走到菜窖旁，掀开翻板，只留半尺宽的缝，重新下到窖里。
      // 镜头缓慢拉远：地上，妹妹的手腕被蓝花袖口盖住；地下，伤员肩上缠着
      // 同样的蓝花布。屋门和菜窖翻板都留着一道缝。没有音乐。风从村街上
      // 吹过。黑屏——第一章结束。
      kind: "cinematic", id: "c1_end", timeOfDay: "dawn",
      lines: [
        { act: "妹妹侧过脸。从没有关严的屋门，可以看见柱子走到菜窖旁。", d: 4.4,
          // 分镜 56：越过近处的妹妹看画那头的窖口——**那块板得在画里**，
          // 不然「看见柱子走到菜窖旁」这句话没有宾语
          cam: CINE(29.85, 0.40, 4.40, [FG.jambR(2.77, 0.80, 1.18, 2.02)]),
          on: (state) => {
            const sis = FindActor(state, "sister");
            // 章末她仍旧坐在炕上（同 §14 上半那条），lift 一并清掉
            if (sis) { sis.visible = true; sis.level = "surface"; sis.lift = 0; sis.x = 31.05; sis.heading = -1; sis.pose = "kneel"; sis.track = null; }
            const w = FindActor(state, "wounded");
            if (w) { w.visible = true; w.level = "under"; w.x = 27.1; w.heading = -1; w.pose = "sleep"; w.bandage = true; }
            state.player.level = "surface";
            state.player.pose = null;
            state.player.cineWalk = { x: 29.4, speed: 1.1 };
          } },
        { act: "柱子掀开翻板。他没有将翻板完全打开，只留下半尺宽的缝。", d: 4.2,
          // 注视点压到板面高度上：这一格看的是那道缝，不是人
          cam: CINE(29.10, 0.58, 3.40, [{ art: "hatchLip", u: 0.14, v: -0.92, z: 2.14, w: 1.6, h: 0.36, dim: 1.86 }]),
          on: (state) => {
            state.player.cineWalk = null;
            state.player.x = 29.65;
            // 板真的先掀起来、再落回半尺宽的一道缝（老版只拨旗标，画面上
            // 那块板从头到尾没动过）
            state.lid = { id: "cellarHatch", open: 1, to: 0.34, rate: 0.5, delay: 1.4 };
            state.player.heading = -1;
            state.flags.lidShut = true;
            state.hatchMoon = true;
            FlashPose(state, "kneel", 2.6);
            Cue(state, "doorCreak", { gain: 0.4, rate: 0.75, delay: 1.0 });
          } },
        { act: "柱子重新下到菜窖里，坐到伤员旁边。", d: 3.8,
          cam: CINE(28.70, UNDER_Y + 0.58, 2.93, [FG.ladderL(1.81, 0.34, 0.98, 1.94)]),
          on: (state) => {
            state.player.level = "under";
            state.player.x = 28.6;
            state.player.heading = -1;
            state.player.pose = "sitSide";
            Cue(state, "ladder", { gain: 0.35, rate: 0.85 });
          } },
        // 拉远镜：上下两层同框——地上妹妹、地下伤员，两截同一块布。
        // **indoorScene 必须开着**：不开的话立面盖着屋里，炕上那个人整个看不见
        // （八稿这一镜的题眼正是"同框"）
        { act: "地面上，妹妹的手腕被蓝花袖口盖住。", d: 3.4,
          cam: WRIST_CAM,
          on: (state) => { state.beat.indoorScene = true; } },
        { act: "地下，伤员肩上缠着同样的蓝花布。胸口仍在起伏。", d: 3.6,
          cam: CINE(27.40, UNDER_Y + 0.34, 2.90, [FG.strawLow(1.70, 1.0, 0.26)]),
          on: (state) => { state.beat.indoorScene = true; } },
        { act: "屋门和菜窖翻板，都留着一道缝。", d: 4.4,
          // **不许再退**：注视点一压低，近侧地道剖面就整个涨进画框，下四成糊成
          // 一片土（CLAUDE.md 那条）。画宽封在 6.6m、注视点抬到 0.85m
          cam: CINE(30.05, 0.55, 4.30, [FG.jambR(2.71, 0.78, 1.16, 2.02)]),
          on: (state) => { state.beat.indoorScene = true; } },
        { act: "没有音乐。风从村街上吹过。", d: 4.0,
          cam: CINE(30.05, 0.55, 4.60, [FG.jambR(2.90, 0.82, 1.20, 2.02)]),
          on: (state) => {
            state.beat.indoorScene = true;
            state.wind = { t: 0, dur: 3.4, x: 26, dir: 1 };
            Cue(state, "windGust", { gain: 0.45, rate: 0.85, delay: 0.5 });
          } },
        // 黑屏：第一章结束（章末字样走 titleCard，同章名卡一支笔）
        { act: "", d: 2.9, cam: { kind: "dark" },
          on: (state) => { state.titleCard = { num: "", title: "第一章结束", t: 0, dur: 2.7 }; } },
      ],
    },
  ];
}
