// 把 Script_MixamoClipFix.py 的日志和改前 / 改后两份审查结果合成调整记录 <词干>.<主题>.fix.json（格式见 README.md）。
//   node Taierzhuang1938/_import/MixamoFixes/Script_MixamoClipFixRecords.mjs --log=<Blender 日志目录> --before=<改前 audit.jsonl> --after=<改后 audit.jsonl>
// 改前那份就是 Mixamo 原样的审查（Original/ 下那份 GLB 的数）；主题对应修法表 Data_MixamoClipFixOps.json 里 op 的 topic。
// 每个主题记它自己的数：Hands → 手 / 前臂进身体（端枪动作另记枪的数，确认没变坏）；Glitch → 抽搐最大角；Seam → 首尾差；
// Pose → 手里的道具进身体多深。--rifle-before=<jsonl> 可另给一份「新挂法下的原版」审查，端枪动作的枪数从它取（挂法改过之后旧审查的枪数不可比）。
import fs from "node:fs";
import path from "node:path";

const flags = Object.fromEntries(process.argv.slice(2).filter((a) => a.startsWith("--")).map((a) => { const [k, v] = a.slice(2).split("="); return [k, v ?? "1"]; }));
const HERE = import.meta.dirname;
const ops = JSON.parse(fs.readFileSync(path.join(HERE, "Data_MixamoClipFixOps.json"), "utf8")).clips;
const Rows = (file) => new Map(fs.readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l)).map((r) => [r.file, r]));
const before = Rows(flags.before), after = Rows(flags.after);
const rifleBefore = flags["rifle-before"] ? Rows(flags["rifle-before"]) : new Map();
const cm = (d) => (d ? +(d * 100).toFixed(1) : 0);
const today = new Date().toISOString().slice(0, 10);

function Hands(r) {
  const o = { handCm: {}, forearmCm: {} };
  for (const s of ["Right", "Left"]) { o.handCm[s] = cm(r.hands?.[s]?.depth); o.forearmCm[s] = cm(r.forearms?.[s]?.depth); }
  if (r.rifle) {
    o.rifleBodyCm = Math.max(0, ...Object.values(r.rifle.body || {}).map((v) => cm(v.depth)));
    o.rifleSnapDeg = r.rifle.snapDeg?.deg ?? 0;
    o.rifleLeftOn = r.rifle.leftOn;
  }
  return o;
}
function Glitch(r, bones) {
  const list = (r.glitches || []).filter((g) => !bones || bones.includes(g.bone));
  const top = list[0];
  // 审查只列 > 12° 的前 6 条，没上榜就记 ≤ 12
  return { glitchDeg: top ? top.deg : "≤12", worst: top ? `${top.bone}@${top.frame}` : null, over15: (r.glitches || []).filter((g) => g.deg > 15).length };
}
const Seam = (r) => ({ seamDeg: r.seam ?? null });
// Pose：手没穿、是手里的枪 / 刀穿进身体，记道具进各骨头多深（cm）和枪相对右手一帧拧的最大角
function Pose(r) {
  const o = {};
  for (const key of ["rifle", "dadao"]) {
    if (!r[key]) continue;
    o[`${key}BodyCm`] = Object.fromEntries(Object.entries(r[key].body || {}).map(([b, v]) => [b, cm(v.depth)]));
    o[`${key}SnapDeg`] = r[key].snapDeg?.deg ?? 0;
  }
  return o;
}
const METRIC = { Hands, Glitch, Seam, Pose };

function Summary(topic, b, a, entryOps) {
  const custom = entryOps.find((o) => (o.topic || o.op) === topic && o.summary);
  if (custom) return custom.summary;
  if (topic === "Hands") {
    const parts = [];
    for (const s of ["Right", "Left"]) {
      const side = s === "Right" ? "右" : "左";
      if (b.handCm[s] > 1.5) parts.push(`${side}手进身体 ${b.handCm[s]}→${a.handCm[s]} cm`);
      if (b.forearmCm[s] > 2) parts.push(`${side}前臂 ${b.forearmCm[s]}→${a.forearmCm[s]} cm`);
    }
    return `手 / 前臂陷进身体：先抬手指 / 手掌，不够再两节骨 IK 把整只手往外推到贴着（${parts.join("，")}）`;
  }
  if (topic === "Glitch") return `一帧抽搐（去了又回来）：坏帧换成前后好帧之间的插值（最大 ${b.glitchDeg}°→${a.glitchDeg}°）`;
  if (topic === "Seam") return `循环首尾不接：尾段渐变到首帧姿势（首尾差 ${b.seamDeg}°→${a.seamDeg}°）`;
  return topic;
}

let written = 0;
for (const name of fs.readdirSync(flags.log).filter((n) => n.endsWith(".json")).sort()) {
  const log = JSON.parse(fs.readFileSync(path.join(flags.log, name), "utf8"));
  if (!log.exported) continue;
  const file = `${log.stem}.glb`;
  let b = before.get(file);
  const a = after.get(file);
  const rb = rifleBefore.get(file);
  if (b && rb) b = { ...b, rifle: rb.rifle, dadao: rb.dadao };
  if (!b || !a) { console.warn(`[FixRecords] ${file}: 缺改前或改后审查，跳过`); continue; }
  const entryOps = ops[log.stem]?.ops || [];
  for (const [topic, lines] of Object.entries(log.topics)) {
    if (!lines.length) continue;
    const op = entryOps.find((o) => (o.topic || o.op) === topic);
    const metric = METRIC[topic] || (() => ({}));
    const mb = metric(b, op?.bones), ma = metric(a, op?.bones);
    const changes = [...lines];
    for (const u of log.unresolved || []) {
      const handLine = /^[左右]手/.test(u);
      if ((topic === "Hands" && handLine) || (topic === "Glitch" && !handLine)) changes.push(`未消掉：${u}`);
    }
    const record = {
      file, topic, kind: "anim", date: today, author: "Claude Opus 5.5",
      summary: Summary(topic, mb, ma, entryOps),
      changes, before: mb, after: ma,
      original: `Original/${file}`,
      sources: ["Taierzhuang1938/_import/MixamoFixes/Script_MixamoClipFix.py", "Taierzhuang1938/_import/MixamoFixes/Data_MixamoClipFixOps.json"],
    };
    fs.writeFileSync(path.join(HERE, `${log.stem}.${topic}.fix.json`), JSON.stringify(record, null, 2) + "\n");
    written += 1;
  }
}
console.log(`[FixRecords] wrote ${written} records`);
