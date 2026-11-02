// 把 Script_MixamoLibraryAudit.mjs 的逐条结果按阈值归成问题清单（2026-11-02）。
//   node Taierzhuang1938/_import/Script_MixamoLibraryAuditReport.mjs <audit.jsonl> [--json] [--used]
// --used 只列白盒预演 / 试玩实际用到的动作（Data_BlockoutXBotClips.mjs 里的 + 全部派生动作）。
// 阈值（深度都是保守量法下的数，见审查脚本表头）：
//   手掌 / 指节进身体 > 3 cm、前臂进身体 > 3.5 cm；
//   枪身进躯干 / 头 / 腿 > 2 cm，进左右上臂、左前臂 > 3 cm，进右前臂 > 4.2 cm（握把一段本来就贴着右前臂内侧，标定那条就有 3.5 cm）；
//   大刀同枪；担架进腿 / 胯 > 1.5 cm；
//   枪 / 刀相对握它的手一帧拧 > 20°（11-02 起枪管按权重连续跟着左手转，左手动得快时十几度 / 帧是正常的；原来的开关会一下拧近 100°）、
//   相对胯一帧突刺 > 20°；
//   抽搐（某帧离前后两帧中间姿势）> 15°；可循环动作首尾差 > 8°。
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const asJson = args.includes("--json");
const rows = fs.readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
let used = null;
if (args.includes("--used")) {
  const m = await import(pathToFileURL(path.resolve(import.meta.dirname, "..", "Data_BlockoutXBotClips.mjs")).href);
  used = new Set();
  for (const table of [m.XBOT_DEATHS, m.XBOT_MELEE, m.XBOT_NATIVE, m.XBOT_PREVIZ_CLIPS]) for (const e of Object.values(table)) if (e?.file) used.add(e.file);
}

const T = { hand: 0.03, forearm: 0.035, propTrunk: 0.02, propArm: 0.03, propRightFore: 0.042, stretcher: 0.015, snap: 20, pop: 20, glitch: 15, seam: 8 };
const ARM = new Set(["LeftArm", "RightArm", "LeftForeArm", "LeftShoulder", "RightShoulder"]);
const cm = (d) => +(d * 100).toFixed(1);

function Issues(r) {
  const out = [];
  for (const s of ["Right", "Left"]) {
    const h = r.hands?.[s];
    if (h && h.depth > T.hand) out.push({ kind: "handBody", side: s, cm: cm(h.depth), frame: h.frame, detail: `${h.part}→${h.bone}` });
    const f = r.forearms?.[s];
    if (f && f.depth > T.forearm) out.push({ kind: "forearmBody", side: s, cm: cm(f.depth), frame: f.frame, detail: `→${f.bone}` });
  }
  for (const prop of ["rifle", "dadao"]) {
    const p = r[prop];
    if (!p) continue;
    for (const [bone, v] of Object.entries(p.body || {})) {
      const limit = bone === "RightForeArm" ? T.propRightFore : ARM.has(bone) ? T.propArm : T.propTrunk;
      if (v.depth > limit) out.push({ kind: `${prop}Body`, cm: cm(v.depth), frame: v.frame, detail: `${bone} z=${v.z}` });
    }
    if (p.snapDeg?.deg > T.snap) out.push({ kind: `${prop}Snap`, deg: p.snapDeg.deg, frame: p.snapDeg.frame, detail: `${p.snapsOver4} 帧 > 4°` });
    for (const pop of p.popDeg || []) if (pop.deg > T.pop) out.push({ kind: `${prop}Pop`, deg: pop.deg, frame: pop.frame });
  }
  for (const [bone, v] of Object.entries(r.stretcher?.body || {})) if (v.depth > T.stretcher) out.push({ kind: "stretcherBody", cm: cm(v.depth), frame: v.frame, detail: bone });
  // 抽搐只认「去了又回来」的一帧（glitches）；单看一帧转多快的 pops 会把跑步落脚、出手甩腕也算进来
  for (const g of r.glitches || []) if (g.deg > T.glitch) out.push({ kind: /Toe/.test(g.bone) ? "glitchToe" : /Hand.+\d$/.test(g.bone) ? "glitchFinger" : "glitch", deg: g.deg, frame: g.frame, detail: g.bone });
  for (const prop of ["rifle", "dadao"]) if (r[prop]?.glitchDeg?.deg > T.glitch) out.push({ kind: `${prop}Glitch`, deg: r[prop].glitchDeg.deg, frame: r[prop].glitchDeg.frame });
  if (r.loop && r.seam > T.seam) out.push({ kind: "seam", deg: r.seam });
  return out;
}

function Owner(f) {
  if (f.startsWith("Derived/")) return "derived";
  if (f.startsWith("Animation_Claude_")) return "authored";
  return "mixamo";
}

const report = rows.filter((r) => !used || used.has(r.file) || r.file.startsWith("Derived/")).map((r) => ({ file: r.file, owner: Owner(r.file), hold: r.hold, prop: r.prop, used: used ? true : undefined, issues: Issues(r) })).filter((r) => r.issues.length);
if (asJson) { console.log(JSON.stringify(report, null, 1)); process.exit(0); }
const count = {};
for (const r of report) for (const i of r.issues) count[i.kind] = (count[i.kind] || 0) + 1;
console.log(`# ${rows.length} 条里 ${report.length} 条有问题`, JSON.stringify(count));
for (const owner of ["mixamo", "authored", "derived"]) {
  const list = report.filter((r) => r.owner === owner);
  console.log(`\n## ${owner}（${list.length}）`);
  for (const r of list) console.log(`${r.file.replace(/^(Derived\/)?Animation_/, "$1").replace(".glb", "")} [${r.hold}${r.prop ? "·" + r.prop : ""}] ` +
    r.issues.map((i) => `${i.kind}${i.side ? ":" + i.side[0] : ""} ${i.cm ?? i.deg}${i.cm !== undefined ? "cm" : "°"}${i.frame !== undefined ? "@" + i.frame : ""}${i.detail ? " " + i.detail : ""}`).join(" | "));
}
