// 第八章节拍表（SCRIPTS.c8，2026-08-15 从 Script_Core.mjs 按章拆出）。
// 工厂而不是裸数组：节拍里用到的 Core 帮手由 Core 组装 SCRIPTS 时整包递进来
// （下面一行解构还原成裸名字，正文与拆前逐字相同），所以本文件不 import
// Script_Core、没有循环依赖。新用到 Core 的东西：解构清单加名字，Core 末尾的
// SCRIPT_KIT 也加一笔——漏了是当场的 ReferenceError，不会静默出错。
export function ChapterC8(K) {
  const {
    FindActor, SetupRuinedVillage, V,
  } = K;
  return [
    {
      kind: "cinematic", id: "c8_open",
      lines: [
        { stage: "一个月后。", d: 1.6, cam: { kind: "dark" } },
        { stage: "沙河庄的地道重新修整。被发现的口子封死了，新口挖在另一片庄稼地旁。", d: 4.6, cam: { kind: "wide", x: 90 } },
        { stage: "乡亲们把废弃的旧口填平。那块地方，正是当年柱子第一次找到妹妹的地方。", d: 4.8, cam: { kind: "wide", x: 130, pan: 5 } },
        { stage: "柱子带着妹妹，回了一趟梁家村。", d: 3.4, cam: { kind: "wide", x: 100, pan: -8 } },
      ],
      onDone: (state) => { SetupRuinedVillage(state); },
    },
    {
      kind: "escort", id: "c8_walk", follower: "sister", dest: V.homeYard, slow: true,
      objective: "和妹妹一起，走回家看看",
    },
    {
      kind: "cinematic", id: "c8_wall",
      lines: [
        { stage: "院子烧毁了。只剩一堵残墙。", d: 3.6, cam: { kind: "shot", x: 37, y: 1.6, dist: 11 } },
        { stage: "门框还在。", d: 3.0, cam: { kind: "shot", x: 34, y: 1.5, dist: 6.5 } },
        { stage: "妹妹走过去，伸手摸了一下爹刻的那道线。", d: 4.0, cam: { kind: "shot", x: 34, y: 1.5, dist: 6.5 },
          on: (state) => {
            const sister = FindActor(state, "sister");
            if (sister) { sister.following = false; sister.cineTarget = { x: 33.2 }; sister.cineSpeed = 1.1; }
          } },
        { stage: "她的手停了一会儿。", d: 3.2, cam: { kind: "shot", x: 34, y: 1.5, dist: 6.5 } },
      ],
    },
    {
      // 第一章他被爹按在门框上量；这一回轮到他量妹妹。
      // 两道线差多少，画面自己会说——不要旁白替观众念出来。
      kind: "actSeq", id: "c8_measure",
      objective: "门框还在", hint: "妹妹站在门框边上",
      steps: [
        { x: V.doorframe.x, r: 1.6, prompt: "E · 让她靠上",
          toast: "妹妹后背贴上门框，站直了。",
          on: (state) => {
            const sister = FindActor(state, "sister");
            if (sister) { sister.x = V.doorframe.x - 0.5; sister.heading = 1; sister.cineTarget = null; }
            state.player.heading = -1;
          } },
      ],
    },
    {
      // 第一章是爹的手，这一回是他自己的手——同一个动作，同一个景别。
      // 两道线之间隔着的东西，画面自己会说。
      kind: "scribe", id: "c8_carve", zone: V.doorframe, speed: 0.42, markY: 1.08, selfMark: true,
      markX0: 33.60, markX1: 33.75,
      cam: { kind: "shot", x: 34.0, y: 1.16, dist: 1.9 },
      objective: "在旧刻痕旁，刻下一道新的线", hint: "攥住石笔，贴着木头拉过去",
      note: "刻完，柱子用拇指抹平了木屑。",
      onDone: (state) => { state.flags.carved = true; },
    },
    {
      kind: "actSeq", id: "c8_stool",
      objective: "爹留下的旧木凳", hint: "凳腿松了",
      steps: [
        { x: 32, r: 1.8, prompt: "E · 敲紧凳腿",
          toast: "手艺是爹的，手是他自己的。" },
      ],
    },
    {
      kind: "cinematic", id: "c8_call",
      lines: [
        { stage: "院外传来民兵喊他的声音。", d: 3.0, cam: { kind: "shot", x: 40, y: 1.6, dist: 10 } },
        { who: "民兵", say: "柱子，地道那边还缺人。", d: 3.0, cam: { kind: "shot", x: 40, y: 1.6, dist: 10 } },
        { stage: "柱子放下工具，回头看了一眼妹妹。", d: 3.6, cam: { kind: "shot", x: 34, y: 1.4, dist: 7 } },
        { stage: "妹妹抱着爹留下的旧木凳，点了点头。", d: 3.8, cam: { kind: "shot", x: 32, y: 1.2, dist: 5 } },
      ],
    },
    {
      kind: "goto", id: "c8_leave", zone: V.courtGate, objective: "走到院门口去，民兵在村东头等",
    },
    {
      kind: "cinematic", id: "c8_end",
      lines: [
        { stage: "柱子走出院子。", d: 3.0, cam: { kind: "shot", x: 44, y: 1.6, dist: 9 },
          on: (state) => {
            // 柱子朝村东走远——镜头留在门框上
            state.player.cineWalk = { x: 70, speed: 1.6 };
          } },
        { stage: "门框上的两道刻痕，留在了身后。", d: 6.2, cam: { kind: "shot", x: 34, y: 1.4, dist: 6.5, pan: -0.5 } },
      ],
    },
  ];
}
