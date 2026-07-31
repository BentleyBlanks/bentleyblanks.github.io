function Platform(id, x, y, w, h) {
  return { id, x, y, w, h };
}

function Dig(id, x, y, opts = {}) {
  return {
    id,
    x,
    y,
    tunnel: !!opts.tunnel,
    done: false,
    opensPassage: opts.opensPassage || null,
    reveals: opts.reveals || null,
    goal: opts.goal || null,
    hint: opts.hint || "按住挖掘",
    line: opts.line || "通了。",
  };
}

function BaseLevel(width = 2200) {
  const surfaceFloor = 520;
  const tunnelFloor = 820;
  return {
    width,
    viewWidth: 960,
    surfaceFloor,
    tunnelFloor,
    surfaceSolids: [
      Platform("ground", 0, surfaceFloor, width, 80),
      Platform("roof1", 260, 390, 160, 18),
      Platform("roof2", 720, 370, 180, 18),
      Platform("roof3", 1180, 400, 150, 18),
    ],
    tunnelSolids: [
      Platform("tground", 0, tunnelFloor, width, 80),
      Platform("tceil", 0, 620, width, 24),
      Platform("block_a", 520, 700, 70, 120),
      Platform("block_b", 980, 700, 70, 120),
    ],
    digSpots: [],
    entities: [],
    spawn: { x: 120, y: surfaceFloor },
    startInTunnel: false,
    decor: [],
  };
}

function BuildAct1() {
  const level = BaseLevel(2000);
  level.spawn = { x: 140, y: level.surfaceFloor };
  level.digSpots = [
    Dig("dig1", 420, level.surfaceFloor, {
      opensPassage: "block_a",
      goal: "dig_links",
      line: "西头两家通了。",
      hint: "按住挖掘 · 打通地窖",
    }),
    Dig("dig2", 900, level.tunnelFloor, {
      tunnel: true,
      opensPassage: "block_b",
      line: "东头也通了。",
      hint: "地道内挖掘",
    }),
    Dig("dig3", 1400, level.surfaceFloor, {
      line: "三家气口连上了。",
      hint: "最后一锨",
    }),
  ];
  // ensure dig_links completes after first two meaningful digs via entity tracker
  level.entities = [
    {
      id: "npc_laozhong",
      type: "talk",
      x: 240,
      y: level.surfaceFloor - 46,
      w: 30,
      h: 46,
      speaker: "高老忠",
      line: "先通三家。通了，人就有地方藏。",
      hint: "与高老忠交谈",
      goal: "talk_laozhong",
      done: false,
    },
    {
      id: "hatch1",
      type: "hatch",
      x: 400,
      y: level.surfaceFloor - 10,
      w: 36,
      h: 16,
      hint: "进入地道口",
      goal: "open_hatch",
      done: false,
    },
    {
      id: "hist1",
      type: "history",
      x: 1600,
      y: level.surfaceFloor - 40,
      w: 28,
      h: 28,
      cardId: "card_tunnel_origin",
      title: "地道从地窖长出来",
      hint: "拾取史实卡片",
      done: false,
    },
  ];
  level.decor = [
    { kind: "house", x: 220, y: level.surfaceFloor },
    { kind: "house", x: 680, y: level.surfaceFloor },
    { kind: "house", x: 1140, y: level.surfaceFloor },
    { kind: "tree", x: 1520, y: level.surfaceFloor },
  ];
  return level;
}

function BuildAct2() {
  const level = BaseLevel(2100);
  level.spawn = { x: 160, y: level.surfaceFloor };
  level.entities = [
    {
      id: "v1",
      type: "shelter",
      x: 320,
      y: level.surfaceFloor - 40,
      w: 28,
      h: 40,
      hint: "护送乡亲入洞",
      line: "孩子先进！",
      done: false,
    },
    {
      id: "v2",
      type: "shelter",
      x: 560,
      y: level.surfaceFloor - 40,
      w: 28,
      h: 40,
      hint: "护送乡亲入洞",
      line: "粮窖口在这边！",
      done: false,
    },
    {
      id: "v3",
      type: "shelter",
      x: 820,
      y: level.surfaceFloor - 40,
      w: 28,
      h: 40,
      hint: "护送乡亲入洞",
      line: "谢传宝叔！",
      done: false,
    },
    {
      id: "hatch2",
      type: "hatch",
      x: 700,
      y: level.surfaceFloor - 10,
      w: 36,
      h: 16,
      hint: "地道口",
      done: false,
    },
    {
      id: "bell",
      type: "bell",
      x: 1750,
      y: level.surfaceFloor - 90,
      w: 40,
      h: 90,
      radius: 64,
      hint: "敲响警钟",
      done: false,
      ringing: false,
    },
    {
      id: "hist2",
      type: "history",
      x: 1200,
      y: level.surfaceFloor - 40,
      w: 28,
      h: 28,
      cardId: "card_bell",
      title: "村口大钟",
      hint: "拾取史实卡片",
      done: false,
    },
    {
      id: "patrol1",
      type: "patrol",
      x: 1100,
      y: level.surfaceFloor,
      homeX: 1100,
      patrolAmp: 120,
      w: 30,
      h: 46,
      hits: 0,
      broken: false,
    },
  ];
  level.decor = [
    { kind: "house", x: 280, y: level.surfaceFloor },
    { kind: "house", x: 760, y: level.surfaceFloor },
    { kind: "tree", x: 1720, y: level.surfaceFloor },
    { kind: "bell", x: 1750, y: level.surfaceFloor },
  ];
  return level;
}

function BuildAct3() {
  const level = BaseLevel(1900);
  level.startInTunnel = true;
  level.spawn = { x: 160, y: level.tunnelFloor };
  level.entities = [
    {
      id: "flip_build",
      type: "flip_build",
      x: 480,
      y: level.tunnelFloor - 30,
      w: 40,
      h: 30,
      requiresTunnel: true,
      hint: "改建翻口",
      done: false,
    },
    {
      id: "spy_talk",
      type: "spy_talk",
      x: 260,
      y: level.surfaceFloor - 46,
      w: 30,
      h: 46,
      requiresTunnel: false,
      hint: "盘问来客",
      done: false,
    },
    {
      id: "hatch3",
      type: "hatch",
      x: 300,
      y: level.surfaceFloor - 10,
      w: 36,
      h: 16,
      hint: "上下地道",
      done: false,
    },
    {
      id: "spy",
      type: "spy",
      x: 700,
      y: level.surfaceFloor,
      w: 30,
      h: 46,
      exposed: false,
      trapped: false,
    },
    {
      id: "flip_trap",
      type: "flip_trap",
      x: 980,
      y: level.tunnelFloor - 20,
      w: 50,
      h: 20,
      requiresTunnel: true,
      armed: false,
      hint: "触发翻口",
      done: false,
    },
    {
      id: "hist3",
      type: "history",
      x: 1400,
      y: level.tunnelFloor - 40,
      w: 28,
      h: 28,
      requiresTunnel: true,
      cardId: "card_flip",
      title: "翻口与迷惑洞",
      hint: "拾取史实卡片",
      done: false,
    },
  ];
  level.decor = [
    { kind: "tunnel", x: 0, y: level.tunnelFloor },
    { kind: "house", x: 240, y: level.surfaceFloor },
  ];
  return level;
}

function BuildAct4() {
  const level = BaseLevel(2300);
  level.spawn = { x: 180, y: level.surfaceFloor };
  level.entities = [
    {
      id: "hatch4a",
      type: "hatch",
      x: 360,
      y: level.surfaceFloor - 10,
      w: 36,
      h: 16,
      hint: "地道口",
      done: false,
    },
    {
      id: "port1",
      type: "shot_port",
      x: 520,
      y: level.surfaceFloor - 20,
      w: 34,
      h: 24,
      hint: "出击开火",
      exitTo: 900,
      shots: 0,
      cooled: false,
      done: false,
    },
    {
      id: "port2",
      type: "shot_port",
      x: 980,
      y: level.surfaceFloor - 20,
      w: 34,
      h: 24,
      hint: "出击开火",
      exitTo: 1400,
      shots: 0,
      cooled: false,
      done: false,
    },
    {
      id: "port3",
      type: "shot_port",
      x: 1480,
      y: level.surfaceFloor - 20,
      w: 34,
      h: 24,
      hint: "出击开火",
      exitTo: 1800,
      shots: 0,
      cooled: false,
      done: false,
    },
    {
      id: "patrol2",
      type: "patrol",
      x: 1100,
      y: level.surfaceFloor,
      homeX: 1100,
      patrolAmp: 160,
      w: 30,
      h: 46,
      hits: 0,
      broken: false,
    },
    {
      id: "hatch4b",
      type: "hatch",
      x: 1700,
      y: level.surfaceFloor - 10,
      w: 36,
      h: 16,
      hint: "地道口",
      done: false,
    },
  ];
  level.decor = [
    { kind: "house", x: 300, y: level.surfaceFloor },
    { kind: "house", x: 900, y: level.surfaceFloor },
    { kind: "house", x: 1400, y: level.surfaceFloor },
    { kind: "well", x: 520, y: level.surfaceFloor },
  ];
  return level;
}

function BuildAct5() {
  const level = BaseLevel(2400);
  level.startInTunnel = true;
  level.spawn = { x: 140, y: level.tunnelFloor };
  level.digSpots = [
    Dig("under1", 900, level.tunnelFloor, {
      tunnel: true,
      opensPassage: "block_b",
      goal: "dig_under",
      line: "挖到炮楼根了。",
      hint: "向炮楼挖掘",
    }),
  ];
  level.entities = [
    {
      id: "dig_marker",
      type: "dig_marker",
      x: 900,
      y: level.tunnelFloor - 20,
      w: 20,
      h: 20,
      linkedDig: "under1",
      done: false,
      hidden: true,
    },
    {
      id: "charge",
      type: "charge",
      x: 1200,
      y: level.tunnelFloor - 28,
      w: 40,
      h: 28,
      requiresTunnel: true,
      hint: "安放炸药",
      done: false,
    },
    {
      id: "hatch5",
      type: "hatch",
      x: 1600,
      y: level.surfaceFloor - 10,
      w: 36,
      h: 16,
      hint: "爬上地表",
      done: false,
    },
    {
      id: "signal",
      type: "signal",
      x: 1900,
      y: level.surfaceFloor - 50,
      w: 40,
      h: 50,
      requiresTunnel: false,
      hint: "发出总攻信号",
      done: false,
    },
    {
      id: "hist5",
      type: "history",
      x: 600,
      y: level.tunnelFloor - 40,
      w: 28,
      h: 28,
      requiresTunnel: true,
      cardId: "card_heifengkou",
      title: "黑风口据点",
      hint: "拾取史实卡片",
      done: false,
    },
    {
      id: "patrol3",
      type: "patrol",
      x: 1750,
      y: level.surfaceFloor,
      homeX: 1750,
      patrolAmp: 80,
      w: 30,
      h: 46,
      hits: 0,
      broken: false,
    },
  ];
  level.decor = [
    { kind: "blockhouse", x: 2000, y: level.surfaceFloor },
    { kind: "tunnel", x: 0, y: level.tunnelFloor },
  ];
  return level;
}

const BUILDERS = {
  act1_connect: BuildAct1,
  act2_bell: BuildAct2,
  act3_combat_tunnel: BuildAct3,
  act4_ambush: BuildAct4,
  act5_heifengkou: BuildAct5,
};

export function BuildLevel(chapterId) {
  const builder = BUILDERS[chapterId] || BuildAct1;
  return builder();
}
