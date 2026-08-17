// 《地道里的光》 —— 动画索引：骨架里到底有哪些动作，各叫什么名、在哪一行、
// 谁在用。给动画工作台（Script_AnimLab，浏览器）和命令行（Script_Cli 的
// anims/anim）共用，所以**纯正则扫源码，不 import 任何游戏模块**（Rig 依赖
// three，node 里加载不起来；工作台在浏览器里另有 TRACKS 的运行时真相）。
//
// 三类东西：
//   · 轨道（TRACKS）：关键帧动画，dur/loop/keys 都是字面量，从源码就能读全；
//   · 姿势（PoseRig 里 `s.pose === "xxx"` 那一串分支）：静态或由进度 poseK 驱动；
//   · 步态/状态（同一串 if 链上不按名字、按状态字段分的那几支：走/跑/蹲/猫腰/
//     爬/爬梯/挖/提/扛/抱着孩子/站）——它们没有名字，这里给一个，好点得着。
//
// 用途只有一个：**让人按名字点名重做**（「scoopChild 抬人那一段太蠢」），
// 不再靠描述画面或贴截图。所以每条都带 文件:行 + 源码里的说明 + 用在哪一拍。
// 索引不是运行时真相：改了 Rig 就得重跑一遍（工作台每次打开现扫，CLI 每次现扫）。

export const ANIM_FILES = {
  rig: "Script_Rig.mjs",
  world: "Script_World.js",
  // 用法在哪儿找：执行器 + 八章剧本 + World（背景层干活的乡亲、坐骑那几处）
  usages: ["Script_Core.mjs", "Data_ScriptC1.mjs", "Data_ScriptC2.mjs", "Data_ScriptC3.mjs",
    "Data_ScriptC4.mjs", "Data_ScriptC5.mjs", "Data_ScriptC6.mjs", "Data_ScriptC7.mjs",
    "Data_ScriptC8.mjs", "Script_World.js"],
};

// 轨道/姿势里会出现的 14 个字段（Rig 的 TRACK_FIELDS 同一张表）
export const RIG_FIELDS = ["hipY", "hipX", "torso", "head", "thighB", "shinB", "footB", "thighF", "shinF", "footF", "armB", "foreB", "armF", "foreF"];
export const RIG_FIELD_LABEL = {
  hipY: "胯高", hipX: "胯前后", torso: "躯干", head: "头",
  thighB: "后大腿", shinB: "后小腿", footB: "后脚", thighF: "前大腿", shinF: "前小腿", footF: "前脚",
  armB: "后上臂", foreB: "后前臂", armF: "前上臂", foreF: "前前臂",
};

// 步态/状态那几支：PoseRig 的 if 链上按状态字段分的分支。cond 要跟源码里的
// 条件**逐字**相同（索引靠它对上行号）；state 是工作台喂给 PoseRig 的合成状态；
// 相位怎么走照抄 World.UpdateOne：走路 phase += 位移*3.4/体型(+位移*gait*0.7)，
// 爬梯 += 竖向位移*4.5，原地动作 += dt*2.2，呼吸 idleT += dt*1.4。
export const LOCOMOTION = [
  { id: "stand", label: "站立（呼吸）", cond: "else", state: {}, cycle: "breath",
    note: "常态。所有一次性戏剧姿势收回之后落到这儿。" },
  { id: "walk", label: "走路", cond: "s.moving", state: { moving: true }, cycle: "walk", speed: 1.4,
    note: "gait 由实测速度给（1.5→3.2m/s 从走到跑），步频按体型折算。" },
  { id: "run", label: "跑", cond: "s.moving", state: { moving: true }, cycle: "walk", speed: 3.2,
    note: "跑不是把走路放快：步幅张开、小腿后收、躯干压前、手臂抡开。" },
  { id: "crouchIdle", label: "半蹲·站住", cond: "s.crouch", state: { crouch: true }, cycle: "idle" },
  { id: "crouchMove", label: "半蹲·挪步", cond: "s.crouch", state: { crouch: true, moving: true }, cycle: "walk", speed: 1.0 },
  { id: "stoopIdle", label: "猫腰·站住", cond: 's.posture === "stoop"', state: { posture: "stoop" }, cycle: "breath",
    note: "地道走廊里的常态（净高不够）。" },
  { id: "stoopMove", label: "猫腰·走", cond: 's.posture === "stoop"', state: { posture: "stoop", moving: true }, cycle: "walk", speed: 1.2 },
  { id: "crawlIdle", label: "爬行·停住", cond: 's.posture === "crawl"', state: { posture: "crawl" }, cycle: "idle" },
  { id: "crawlMove", label: "爬行", cond: 's.posture === "crawl"', state: { posture: "crawl", moving: true }, cycle: "walk", speed: 0.7 },
  { id: "climb", label: "爬梯", cond: "s.climbing", state: { climbing: true }, cycle: "climb", speed: 1.0 },
  { id: "climbChild", label: "抱着孩子爬梯", cond: "s.climbing && s.childArms", state: { climbing: true, childArms: true }, cycle: "climb", speed: 0.8 },
  { id: "dig", label: "挖土 / 施工", cond: "s.digging", state: { digging: true }, cycle: "idle" },
  { id: "holdLight", label: "提·轻（石子）", cond: "s.hold", state: { hold: true, holdW: 0.15 }, cycle: "breath" },
  { id: "holdHeavy", label: "提·满桶 站住", cond: "s.hold", state: { hold: true, holdW: 1 }, cycle: "breath" },
  { id: "holdHeavyMove", label: "提·满桶 走", cond: "s.hold", state: { hold: true, holdW: 1, moving: true }, cycle: "walk", speed: 1.2 },
  { id: "childArmsIdle", label: "抱着孩子·站住", cond: "s.childArms", state: { childArms: true }, cycle: "breath",
    note: "这是走姿不是姿势（pose 会把走路顶掉）；站住时倒重心 / 隔一会儿颠一下。" },
  { id: "childArmsMove", label: "抱着孩子·走", cond: "s.childArms", state: { childArms: true, moving: true }, cycle: "walk", speed: 1.2 },
  { id: "carryIdle", label: "扛·站住", cond: "s.carry", state: { carry: true }, cycle: "breath" },
  { id: "carryMove", label: "扛·走", cond: "s.carry", state: { carry: true, moving: true }, cycle: "walk", speed: 1.3 },
];

// 工作台里能挑的人：骨架种类 + 体型（World 里柱子第一章 0.80、妹妹一二章 0.60，
// 都不是 BODY_SCALE 表上的默认值——预览得按戏里的尺寸看）
export const KIND_PRESETS = [
  { key: "player@0.80", kind: "player", scale: 0.80, label: "柱子 · 第一章（0.80）" },
  { key: "player@0.93", kind: "player", scale: 0.93, label: "柱子 · 抽条后（0.93）" },
  { key: "sister@0.60", kind: "sister", scale: 0.60, label: "妹妹 · 一二章（0.60）" },
  { key: "sister@0.68", kind: "sister", scale: 0.68, label: "妹妹 · 后续（0.68）" },
  { key: "family@0.90", kind: "family", scale: 0.90, label: "娘（family 0.90）" },
  { key: "father@1.00", kind: "father", scale: 1.0, label: "爹（father 1.00）" },
  { key: "villager@0.95", kind: "villager", scale: 0.95, label: "乡亲（villager 0.95）" },
  { key: "militia@0.98", kind: "militia", scale: 0.98, label: "民兵（militia 0.98）" },
  { key: "soldier@0.99", kind: "soldier", scale: 0.99, label: "日军（soldier 0.99）" },
  { key: "officer@0.98", kind: "officer", scale: 0.98, label: "军官（officer 0.98）" },
  { key: "puppet@0.97", kind: "puppet", scale: 0.97, label: "伪军（puppet 0.97）" },
];

// 用法那一行里"是谁在做"（sis.track = … / FlashTrack(state, "x", d, m)）→ 骨架种类。
// 只是猜：剧本里的局部变量名习惯很稳（sis / m / father / k），够用；猜不出就 null
const SUBJECT_KIND = [
  [/^(sis|sister|k|kid|girl|child)$/, "sister"],
  [/^(m|mm|mother|mom|ma|mo)$/, "family"],
  [/^(father|f|dad|pa|fa)$/, "father"],
  [/^(state\.player|s\.player|st\.player|player|p|me)$/, "player"],
  [/^(soldier|sold|jp|enemy|guard|g|s\d|jp\d|sentry)$/, "soldier"],
  [/^(officer|off|taijun)$/, "officer"],
  [/^(puppet|traitor|pup|pp)$/, "puppet"],
  [/^(militia|mil)$/, "militia"],
  [/^(villager|folk|uncle|neighbor|neighbour|v|vil|wounded|w|old)$/, "villager"],
];
export function GuessKind(subject) {
  if (!subject) return null;
  const s = String(subject).trim();
  for (const [re, kind] of SUBJECT_KIND) if (re.test(s)) return kind;
  if (/sis|sister/i.test(s)) return "sister";
  if (/mother|mom/i.test(s)) return "family";
  if (/father|dad/i.test(s)) return "father";
  if (/player/i.test(s)) return "player";
  if (/soldier|enemy|jp/i.test(s)) return "soldier";
  if (/officer/i.test(s)) return "officer";
  if (/puppet|traitor/i.test(s)) return "puppet";
  if (/militia/i.test(s)) return "militia";
  if (/villager|folk|uncle|wounded/i.test(s)) return "villager";
  return null;
}
export const KIND_LABEL = {
  player: "柱子", sister: "妹妹", family: "娘", father: "爹", villager: "乡亲",
  militia: "民兵", soldier: "日军", officer: "军官", puppet: "伪军",
};

const Lines = (text) => String(text || "").split(/\r?\n/);
const StripComment = (s) => s.replace(/\/\/.*$/, "");
const TrailingComment = (s) => { const m = /\/\/\s?(.*)$/.exec(s); return m ? m[1].trim() : ""; };

// 一段紧挨着的注释行（同一缩进的 `// …`），从 idx 往上收，遇到空行/非注释停
function CommentAbove(lines, idx, indent) {
  const out = [];
  const re = new RegExp(`^${" ".repeat(indent)}//\\s?(.*)$`);
  for (let i = idx - 1; i >= 0; i -= 1) {
    const m = re.exec(lines[i]);
    if (!m) break;
    out.unshift(m[1]);
  }
  return out.join("\n").trim();
}
// 分支体开头那一段注释（缩进 4）
function CommentAtStart(lines, from, to, indent = 4) {
  const out = [];
  const re = new RegExp(`^${" ".repeat(indent)}//\\s?(.*)$`);
  for (let i = from; i < to; i += 1) {
    const m = re.exec(lines[i]);
    if (!m) { if (out.length || lines[i].trim()) break; else continue; }
    out.push(m[1]);
  }
  return out.join("\n").trim();
}

// ── 轨道：TRACKS = { name: { dur, loop, keys: [ {…}, … ] }, … } ───────────
function ParseTracks(lines) {
  const tracks = {};
  let start = lines.findIndex((l) => /^export const TRACKS = \{/.test(l));
  if (start < 0) return tracks;
  let end = start + 1;
  while (end < lines.length && !/^\};/.test(lines[end])) end += 1;
  let i = start + 1;
  while (i < end) {
    const head = /^  ([A-Za-z][A-Za-z0-9]*): \{\s*$/.exec(lines[i]);
    if (!head) { i += 1; continue; }
    const name = head[1];
    const tr = { name, line: i + 1, comment: CommentAbove(lines, i, 2), dur: null, loop: null, keys: [], joints: [], warnings: [] };
    // 到这条轨道的收尾 `  },`
    let j = i + 1;
    while (j < end && !/^  \},?\s*$/.test(lines[j])) j += 1;
    const body = lines.slice(i + 1, j);
    for (const l of body) {
      const d = /^\s*dur:\s*([\d.]+)\s*,\s*loop:\s*(true|false)/.exec(l);
      if (d) { tr.dur = parseFloat(d[1]); tr.loop = d[2] === "true"; }
    }
    // keys: [ … ] 之间：去掉注释后按花括号切对象；每个对象带自己那行的尾注 +
    // 紧贴在上面的整行注释
    const k0 = body.findIndex((l) => /^\s*keys:\s*\[/.test(l));
    if (k0 >= 0) {
      let pendingNote = [];
      let cur = null;      // { text, note, startLine }
      for (let b = k0 + 1; b < body.length; b += 1) {
        const raw = body[b];
        if (/^\s*\],?\s*$/.test(raw)) break;
        const code = StripComment(raw);
        const tail = TrailingComment(raw);
        if (!code.trim()) {
          if (tail) (cur ? cur.noteAfter : pendingNote).push(tail);
          continue;
        }
        if (!cur) {
          if (!code.includes("{")) continue;
          cur = { text: "", noteAfter: [], noteBefore: pendingNote, startLine: i + 1 + 1 + b };
          pendingNote = [];
        }
        cur.text += " " + code;
        if (tail) cur.noteAfter.push(tail);
        if (code.includes("}")) {
          const values = {};
          for (const m of cur.text.matchAll(/([A-Za-z]+):\s*(-?[\d.]+)/g)) values[m[1]] = parseFloat(m[2]);
          const t = values.t;
          delete values.t;
          const note = [...cur.noteBefore, ...cur.noteAfter].join(" ").trim();
          tr.keys.push({ t: t ?? null, note, values, line: cur.startLine });
          cur = null;
        }
      }
    }
    const joints = new Set();
    for (const k of tr.keys) for (const f of Object.keys(k.values)) joints.add(f);
    tr.joints = RIG_FIELDS.filter((f) => joints.has(f));
    tr.notes = [];
    if (tr.dur === null) tr.warnings.push("没读到 dur/loop（源码格式变了？）");
    if (!tr.keys.length) tr.warnings.push("没读到关键帧（源码格式变了？）");
    if (tr.keys.length && tr.dur !== null && Math.abs(tr.keys[tr.keys.length - 1].t - tr.dur) > 1e-6) {
      tr.notes.push(tr.loop
        ? `循环轨末帧 t=${tr.keys[tr.keys.length - 1].t} 不在 dur ${tr.dur} 上：绕回去接的是首帧`
        : `末帧 t=${tr.keys[tr.keys.length - 1].t} 早于 dur ${tr.dur}：最后 ${(tr.dur - tr.keys[tr.keys.length - 1].t).toFixed(2)}s 停在末帧`);
    }
    tracks[name] = tr;
    i = j + 1;
  }
  return tracks;
}

// ── 姿势与步态：PoseRig 里那一串 if / else if 分支 ─────────────────────────
const INPUT_PROBES = [
  [/\bs\.poseK\b/, "poseK", "进度 0..1（World.PoseProgress 挑 vaultK/poseU/poseK）"],
  [/\bs\.poseStrain\b/, "poseStrain", "吃力程度 0..1（体力）"],
  [/\bs\.aimHand\b/, "aimHand", "手要落到的点（World 换算的骨架局部坐标；工作台里没有，走后备）"],
  [/\bs\.moving\b/, "moving", "在不在走"],
  [/\bs\.gait\b/, "gait", "走→跑 0..1"],
  [/\bs\.holdW\b/, "holdW", "提的东西多重 0..1"],
  [/\bs\.crouch\b/, "crouch", "蹲着"],
  [/\bs\.childArms\b/, "childArms", "怀里抱着孩子"],
  [/\bs\.breath\b|\bbr\b/, "breath", "呼吸相位（idleT，1.4/s）"],
  [/\bswing2?\b|\bMath\.sin\(p\b|\(p \*|\bp\)/, "phase", "步频相位（走路按位移、原地按 2.2/s）"],
];
function ParsePoseRig(lines) {
  const poses = {};
  const branches = [];    // { cond, from, to }
  const fnStart = lines.findIndex((l) => /^export function PoseRig\(/.test(l));
  if (fnStart < 0) return { poses, branches, sets: {} };
  let fnEnd = fnStart + 1;
  while (fnEnd < lines.length && !/^\}/.test(lines[fnEnd])) fnEnd += 1;
  // 找链：第一个 `  if (s.pose === …) {`，之后每个 `  } else if (…) {` / `  } else {`，
  // 直到单独一行的 `  }`
  let i = fnStart;
  while (i < fnEnd && !/^  if \(.*s\.pose ===.*\) \{\s*$/.test(lines[i])) i += 1;
  if (i >= fnEnd) return { poses, branches, sets: {} };
  let cur = { cond: /^  if \((.*)\) \{\s*$/.exec(lines[i])[1], from: i };
  for (let j = i + 1; j < fnEnd; j += 1) {
    const elif = /^  \} else if \((.*)\) \{\s*$/.exec(lines[j]);
    const els = /^  \} else \{\s*$/.test(lines[j]);
    const close = /^  \}\s*$/.test(lines[j]);
    if (elif || els || close) {
      cur.to = j;
      branches.push(cur);
      if (close) break;
      cur = { cond: elif ? elif[1] : "else", from: j };
    }
  }
  for (const b of branches) {
    const body = lines.slice(b.from + 1, b.to).join("\n");
    const inputs = [];
    for (const [re, key, label] of INPUT_PROBES) if (re.test(body)) inputs.push({ key, label });
    const info = {
      cond: b.cond, line: b.from + 1, endLine: b.to,
      comment: CommentAtStart(lines, b.from + 1, b.to),
      inputs,
      progress: /\bs\.poseK\b/.test(body),
      usesIK: /AimFrontHand\(/.test(body),
      customBlend: /ApplyPose\(/.test(body),
      lines: b.to - b.from - 1,
    };
    b.info = info;
    for (const m of b.cond.matchAll(/s\.pose === "([A-Za-z0-9]+)"/g)) poses[m[1]] = { name: m[1], ...info };
  }
  // 呼吸白名单 / 不动胯的名单（都在 PoseRig 里）
  const src = lines.slice(fnStart, fnEnd).join("\n");
  const setOf = (name) => {
    const m = new RegExp(`const ${name} = new Set\\(\\[([\\s\\S]*?)\\]\\)`).exec(src);
    return m ? [...m[1].matchAll(/"([A-Za-z0-9]+)"/g)].map((x) => x[1]) : [];
  };
  const sets = { CALM_BREATH: setOf("CALM_BREATH"), NO_HIP: setOf("NO_HIP") };
  for (const p of Object.values(poses)) {
    p.calmBreath = sets.CALM_BREATH.includes(p.name);
    p.noHip = sets.NO_HIP.includes(p.name);
  }
  return { poses, branches, sets };
}

// ── World：进度登记 / 躺姿 ───────────────────────────────────────────────
function ParseWorld(text) {
  const out = { POSE_PROGRESS: [], LIE_POSES: [] };
  if (!text) return out;
  const pp = /function PoseProgress\(o\) \{([\s\S]*?)\n\}/.exec(text);
  if (pp) out.POSE_PROGRESS = [...pp[1].matchAll(/o\.pose === "([A-Za-z0-9]+)"/g)].map((m) => m[1]);
  const lie = /const LIE_POSES = \{([^}]*)\}/.exec(text);
  if (lie) out.LIE_POSES = [...lie[1].matchAll(/([A-Za-z0-9]+):\s*true/g)].map((m) => m[1]);
  return out;
}

// ── 用法：谁在哪一行把哪个名字挂到谁身上 ───────────────────────────────────
// 按名字**前面紧挨着的那几个字**分类（一行里可能同时有 holdPose 与 holdTrack）
const USAGE_BEFORE = [
  [/FlashTrack\(([^()]*)$/, "FlashTrack"],
  [/FlashPose\(([^()]*)$/, "FlashPose"],
  [/holdTrack:\s*$/, "holdTrack"],
  [/holdPose:\s*$/, "holdPose"],
  [/([A-Za-z_][A-Za-z0-9_.]*)\.track\s*=\s*\{\s*name:\s*$/, "track="],
  [/\btrack:\s*\{\s*name:\s*$/, "track="],
  [/\btrack:\s*$/, "track:"],
  [/([A-Za-z_][A-Za-z0-9_.]*)\.pose\s*=\s*$/, "pose="],
  [/\bpose:\s*$/, "pose:"],
  [/[!=]==\s*$/, "check"],
];
function ScanUsages(files, names) {
  const usages = {};
  const nameRe = new RegExp(`"(${[...names].map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})"`, "g");
  for (const [file, text] of files) {
    if (!text) continue;
    const lines = Lines(text);
    let beat = null, fn = null;
    for (let i = 0; i < lines.length; i += 1) {
      const raw = lines[i];
      const b = /\bid:\s*"(c\d+_[A-Za-z0-9_]+)"/.exec(raw);
      if (b) beat = b[1];
      const f = /^\s*(?:export )?(?:async )?function ([A-Za-z0-9_]+)\s*\(/.exec(raw);
      if (f) { fn = f[1]; if (!/^Data_Script/.test(file)) beat = null; }
      const code = StripComment(raw);
      if (!/track|pose|Track|Pose/.test(code)) continue;
      const seen = new Set();
      for (const m of code.matchAll(nameRe)) {
        const name = m[1];
        if (seen.has(name)) continue;
        seen.add(name);
        const before = code.slice(Math.max(0, m.index - 80), m.index);
        let kind = "ref", subject = null;
        for (const [re, k] of USAGE_BEFORE) {
          const mm = re.exec(before);
          if (!mm) continue;
          kind = k;
          if (k === "FlashTrack" || k === "FlashPose") {
            // FlashTrack(state, "x", dur, who)：名字之前只有 state，谁在做要看名字**之后**
            const after = code.slice(m.index + m[0].length);
            const rest = /^\s*,\s*([^,()]+)(?:,\s*([^,()]+))?\s*\)/.exec(after);
            const who = rest && rest[2] ? rest[2].trim() : null;
            subject = who && who !== "null" && who !== "undefined" ? who : "player";
          } else if (k === "track=" || k === "pose=") subject = mm[1] || null;
          else if (k === "holdTrack" || k === "holdPose") subject = "player";
          else if (k === "check") {
            const dot = /([A-Za-z_][A-Za-z0-9_.]*)\.(?:track\?\.name|pose)\s*[!=]==\s*$/.exec(before);
            subject = dot ? dot[1] : null;
          }
          break;
        }
        (usages[name] ||= []).push({
          file, line: i + 1, kind, subject, kindGuess: GuessKind(subject),
          beat: /^Data_Script/.test(file) ? beat : null, fn,
          text: code.trim().slice(0, 160),
        });
      }
    }
  }
  return usages;
}

/**
 * 扫一遍源码建索引。read(file) → 文本（读不到给 null）。
 * 返回 { tracks, poses, locomotion, sets, usages, files }。
 */
export function ScanAnimIndex(read) {
  const rigText = read(ANIM_FILES.rig);
  const rigLines = Lines(rigText);
  const tracks = ParseTracks(rigLines);
  const { poses, branches, sets } = ParsePoseRig(rigLines);
  const world = ParseWorld(read(ANIM_FILES.world));
  const allSets = { ...sets, ...world };
  for (const p of Object.values(poses)) {
    p.registeredProgress = world.POSE_PROGRESS.includes(p.name);
    p.lie = world.LIE_POSES.includes(p.name);
    // 进度从哪儿来：World.PoseProgress 登记过的走 poseU（长按行程）/ vaultK（翻越），
    // 没登记的默认取 poseK（Core 直接写的量，投石拉弓那种）。**登没登记不是对错**——
    // 由 poseU 驱动的姿势漏登记才会冻在第一帧（CLAUDE.md 那条老坑），这里只把来源写明
    p.progressSource = !p.progress ? null
      : (p.name === "vault" || p.name === "clamber") ? "vaultK（翻越进度）"
        : p.registeredProgress ? "poseU（长按行程，World.PoseProgress 登记）" : "poseK（默认：Core 直接写的量）";
    p.warnings = [];
    p.notes = [];
    if (!p.progress && !p.calmBreath && !p.inputs.some((x) => x.key === "breath" || x.key === "phase")) {
      p.notes.push("静态死值：不在 CALM_BREATH 白名单、自己也不读呼吸/相位——摆上去就一动不动（闪 0.2s 的 FlashPose 无所谓，钉着几秒的就生硬）");
    }
  }
  // 步态：按 cond 对上分支拿行号与说明
  const locomotion = LOCOMOTION.map((L) => {
    const b = branches.find((x) => x.cond === L.cond);
    return { ...L, line: b ? b.from + 1 : null, comment: b ? b.info.comment : "", inputs: b ? b.info.inputs : [],
      warnings: b ? [] : [`源码里没找到条件 \`${L.cond}\` 的分支（Rig 改了？）`] };
  });
  const names = new Set([...Object.keys(tracks), ...Object.keys(poses)]);
  const files = ANIM_FILES.usages.map((f) => [f, read(f)]);
  const usages = ScanUsages(files, names);
  for (const t of Object.values(tracks)) t.usages = usages[t.name] || [];
  for (const p of Object.values(poses)) p.usages = usages[p.name] || [];
  return {
    tracks, poses, locomotion, sets: allSets, usages,
    files: [ANIM_FILES.rig, ANIM_FILES.world, ...ANIM_FILES.usages].filter((f, i, a) => a.indexOf(f) === i),
    counts: { tracks: Object.keys(tracks).length, poses: Object.keys(poses).length, locomotion: locomotion.length },
  };
}

// 用法里最常见的那个"谁"——默认拿它当预览的人
export function DominantKind(usages) {
  const tally = {};
  for (const u of usages || []) {
    if (!u.kindGuess || u.kind === "check" || u.kind === "ref") continue;
    tally[u.kindGuess] = (tally[u.kindGuess] || 0) + 1;
  }
  let best = null;
  for (const [k, n] of Object.entries(tally)) if (!best || n > tally[best]) best = k;
  return best;
}

// 一行可以直接贴进对话里的引用：「轨道 scoopChild —— Script_Rig.mjs:503 · 1.40s 单次 · 5 帧 · 用于 c1_descend（柱子）」
export function FormatRef(entry) {
  const parts = [];
  if (entry.type === "track") {
    parts.push(`轨道 ${entry.name}`);
    parts.push(`Script_Rig.mjs:${entry.line}`);
    if (entry.dur != null) parts.push(`${entry.dur.toFixed(2)}s ${entry.loop ? "循环" : "单次"}`);
    parts.push(`${entry.keys?.length ?? 0} 帧`);
  } else if (entry.type === "pose") {
    parts.push(`姿势 ${entry.name}`);
    parts.push(`Script_Rig.mjs:${entry.line}`);
    parts.push(entry.progress ? "进度驱动（poseK）" : entry.calmBreath ? "静态·有呼吸" : "静态");
  } else {
    parts.push(`步态 ${entry.id}（${entry.label}）`);
    if (entry.line) parts.push(`Script_Rig.mjs:${entry.line}`);
    parts.push(`分支 ${entry.cond}`);
  }
  const beats = [...new Set((entry.usages || []).filter((u) => u.kind !== "check").map((u) => u.beat || u.fn).filter(Boolean))];
  if (beats.length) parts.push(`用于 ${beats.slice(0, 4).join(" / ")}${beats.length > 4 ? ` 等 ${beats.length} 处` : ""}`);
  const who = DominantKind(entry.usages);
  if (who) parts.push(KIND_LABEL[who] || who);
  return parts.join(" · ");
}
