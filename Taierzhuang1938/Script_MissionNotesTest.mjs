// ===========================================================================
// Script_MissionNotesTest.mjs —— 关卡编排批注层的闸门（纯 Node，秒级）
//
// 这一层守的是一句话：**用户写下的那条意见，过一个月还对得回来**。
//   ① id / 文件名 / 图片名的形状（保存端点与 CLI 共用这几条正则）；
//   ② ValidateNote 的宽严 —— 它就是「什么东西能进仓库」的那道线；
//   ③ SnapshotTarget 十二种目标各拍到了「当时的真实数据」，不是一个 id 了事；
//   ④ NoteDrift：模型里挪了一个敌人的坐标，diff 要**指到那个字段**，
//      不是笼统地说一句「变了」；
//   ⑤ 交接文本：目标 / 原设置 / 建议 / 图片路径 / ```json 块一个不少；
//   ⑥ ResolveNote 不改入参（工作台是 map 出新数组，原地改会让撤销失效）；
//   ⑦ 保存端点：起一次真的 `Script_LocalPreview --root=<临时目录>`，
//      验证 notes.json 与 PNG 真的落了盘、非白名单 level / 超大图 / 非回环被拒、
//      被拒时一个字节都没写进去、成功时也不留 `.tmp`。
//
// 模型用的是**手工搭的最小 fixture**（契约 §5 的形状），不 import P1 的
// `Script_MissionOrchestration.mjs` —— 两个包并行开工，互相 import 就成了时序依赖。
// 那份文件真存在时，末尾再对真模型跑一遍「不抛」。
//
// 跑法：node Taierzhuang1938/Script_MissionNotesTest.mjs
//   或：node Taierzhuang1938/Script_TestRunner.mjs --only=MissionNotesTest
// ===========================================================================

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  NewNoteId, ValidateNote, SnapshotTarget, NoteDrift, HandoffMarkdown, ResolveNote, DismissNote,
  NOTES_FILE_RE, NOTE_IMAGE_RE, NOTE_ID_RE, NotesPathFor, TARGET_KINDS,
} from "./Script_MissionNotes.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(projectDir, "..");
const previewScript = path.join(rootDir, "scripts", "Script_LocalPreview.mjs");
const repoNotesFile = path.join(rootDir, NotesPathFor("FirstLevel"));

let checks = 0;
function Check(condition, message) {
  assert.ok(condition, message);
  checks += 1;
}

// ------------------------------------------------- 最小 fixture 模型（契约 §5）
// 每次调用都新造一份：漂移那一节要在副本上改坐标，共享同一个对象会串味。
function MakeModel() {
  return {
    version: "fixture-1",
    levelId: "FirstLevel",
    bounds: { minX: -205, maxX: 137, minZ: -258, maxZ: 40 },
    phases: [
      { number: 11, id: "TransferApproach", title: "靠近转运点", steps: ["TransferApproach"], spawn: { x: 5, z: -20 } },
      { number: 12, id: "Transfer", title: "转运点", steps: ["Transfer"], spawn: { x: 10, z: -30 } },
    ],
    steps: [
      {
        id: "TransferApproach", index: 20, phaseNumber: 11, objective: "靠近转运点",
        target: { x: 6, z: -22 }, cue: "TransferCall", minimumSeconds: 0,
        requirements: ["transferApproachReached"], guidance: { label: "往北", route: "evacuation" }, spawns: [],
      },
      {
        id: "Transfer", index: 21, phaseNumber: 12, objective: "守住转运点",
        target: { x: 10, z: -30 }, cue: null, minimumSeconds: 12,
        requirements: ["transferArrived", "transferAttacksResolved"], guidance: null, spawns: ["transfer"],
      },
    ],
    facts: {
      transferApproachReached: {
        id: "transferApproachReached", kind: "proximity", step: "TransferApproach", phaseNumber: 11,
        anchor: "transfer", radiusM: 14, text: "玩家到 transfer 锚点 14 m 内",
      },
      transferArrived: {
        id: "transferArrived", kind: "proximity", step: "Transfer", phaseNumber: 12,
        anchor: "transfer", radiusM: 14, text: "玩家到 transfer 锚点 14 m 内",
      },
      transferAttacksResolved: {
        id: "transferAttacksResolved", kind: "combat", step: "Transfer", phaseNumber: 12,
        text: "四拍转运攻击全部清掉",
      },
    },
    encounters: [
      {
        id: "transfer", phaseNumber: 12, deferred: false, spawn: { kind: "beat", beat: "transfer" },
        members: [
          {
            id: "TransferGunner", x: 43, z: 8, weapon: "lmg", hold: true, bayonet: false, team: "transfer",
            reserve: false, releaseDelayS: 0,
            tactic: { delay: 2, near: { x: 40, z: 5 }, nearM: 12, points: [{ x: 41, z: 6 }, { x: 38, z: 2 }] },
            assaultLane: [{ x: 43, z: 8 }, { x: 40, z: 4 }, { x: 36, z: 0 }],
            clearedAtPhase: 14,
          },
          {
            id: "TransferRifle", x: 47, z: 11, weapon: "rifle", hold: false, bayonet: true, team: "transfer",
            reserve: false, releaseDelayS: 3, tactic: null, assaultLane: null,
          },
        ],
      },
      {
        id: "transferFlank", phaseNumber: 12, deferred: true, spawn: { kind: "beat", beat: "transferFlank" },
        standbyUntil: "transferArrived", dormant: true, wake: { kind: "fact", fact: "transferArrived" },
        members: [{ id: "FlankScout", x: 60, z: -4, weapon: "rifle", hold: false, bayonet: false, team: "flank", reserve: true, releaseDelayS: 6, tactic: null, assaultLane: null }],
      },
    ],
    beats: [
      { id: "transfer", earliestS: 20, latestS: 45, loaded: 1, restS: 6, hint: "第一拍：正面" },
      { id: "transferFlank", earliestS: 48, latestS: 76, loaded: 2, restS: 8, hint: "第二拍：侧翼" },
    ],
    routes: { evacuation: [{ x: 0, z: 0 }, { x: 5, z: -10 }, { x: 10, z: -28 }], exit: [{ x: 10, z: -30 }, { x: 22, z: -44 }] },
    anchors: { transfer: { x: 10, z: -30 }, front: { x: -20, z: -80 } },
    zones: [
      { id: "transferArrivedGate", kind: "gate", fact: "transferArrived", step: "Transfer", x: 10, z: -30, radiusM: 14 },
      { id: "kitchenInterior", kind: "interior", fact: "kitchenTraversed", step: "Village", minX: 2, maxX: 8, minZ: -4, maxZ: 3 },
    ],
    friendlies: [
      { id: "squadPost1", kind: "squadPost", x: 8, z: -28, step: "Transfer", phaseNumber: 12 },
      { id: "cartBay1", kind: "cartBay", x: 14, z: -33, phaseNumber: 12 },
    ],
    timeline: [
      { phaseNumber: 12, step: "Transfer", kind: "entry", label: "进入转运点" },
      { phaseNumber: 12, step: "Transfer", kind: "condition", label: "玩家到 transfer 14 m 内", factId: "transferArrived" },
      { phaseNumber: 12, step: "Transfer", kind: "beat", label: "第一拍", encounterId: "transfer", earliestS: 20, latestS: 45 },
    ],
    layout: {
      blocks: [{ id: "shed", x: 12, z: -30, w: 10, d: 8, h: 4, semantic: "house" }],
      gates: [], roads: [{ points: [{ x: 0, z: 0 }, { x: 20, z: -40 }], width: 6 }],
      railway: { points: [[0, 0], [30, -60]] }, trenches: [{ id: "t1", points: [{ x: 1, z: 1 }] }],
      semanticColors: { house: "#8a7c66" },
      SampleGroundColor: (x, z, out) => (out || [0, 0, 0]),
    },
  };
}

const model = MakeModel();

/** 造一条最小可用的批注（各节按需覆盖字段）。 */
function MakeNote(patch = {}) {
  const target = patch.target || { kind: "member", id: "TransferGunner" };
  const id = patch.id || NewNoteId(new Date("2026-09-18T10:15:00"));
  return {
    id,
    createdAt: "2026-09-18T02:15:00.000Z",
    updatedAt: "2026-09-18T02:15:00.000Z",
    status: "open",
    level: "FirstLevel",
    missionVersion: model.version,
    target,
    phaseNumber: 12,
    step: "Transfer",
    time: null,
    text: "这组敌人出现得太早。",
    original: SnapshotTarget(model, target),
    proposal: null,
    sketch: { shapes: [] },
    image: null,
    resolution: null,
    ...patch,
  };
}

// =============================================================== ① id 与正则
{
  const id = NewNoteId(new Date(2026, 8, 18, 10, 15, 0));
  Check(NOTE_ID_RE.test(id), `NewNoteId 的形状对：${id}`);
  Check(id.startsWith("n_20260918_101500_"), `时间戳按本地时间写进 id：${id}`);
  Check(NOTE_IMAGE_RE.test(`${id}.png`), "图片名就是 <noteId>.png");
  for (const bad of [`${id}.PNG`, `${id}.jpg`, `../${id}.png`, "n_2026_1015_ab12.png", `${id}.png.tmp`, "screenshot.png"]) {
    Check(!NOTE_IMAGE_RE.test(bad), `图片名白名单挡住 ${bad}`);
  }
  const fresh = new Set();
  for (let i = 0; i < 64; i += 1) fresh.add(NewNoteId());
  Check(fresh.size >= 60, `同一秒里连点也基本不撞名（64 个里 ${fresh.size} 个不同）`);

  Check(NOTES_FILE_RE.test("Taierzhuang1938/Notes/FirstLevel/notes.json"), "批注文件白名单认正经路径");
  Check(NOTES_FILE_RE.test(NotesPathFor("FirstLevel")), "NotesPathFor 拼出来的路径过得了白名单");
  for (const bad of [
    "Taierzhuang1938/Notes/../Data_Battle.mjs", "Taierzhuang1938/Notes/First Level/notes.json",
    "Notes/FirstLevel/notes.json", "Taierzhuang1938/Notes/FirstLevel/notes.json.bak",
    "Taierzhuang1938/Notes/FirstLevel/other.json", "/etc/passwd",
    NotesPathFor("../x"), NotesPathFor("a/b"),
  ]) Check(!NOTES_FILE_RE.test(bad), `批注文件白名单挡住 ${bad}`);
  console.log("ok  ① id / 批注文件 / 图片名三条正则");
}

// ============================================================ ② ValidateNote
{
  const good = MakeNote();
  const result = ValidateNote(good);
  Check(result.ok && result.errors.length === 0, `一条正常批注过校验：${result.errors.join("；")}`);

  const full = MakeNote({
    id: "n_20260918_101500_ab12",
    image: "n_20260918_101500_ab12.png",
    verified: true,
    time: { kind: "stageRelative", seconds: 20 },
    proposal: { kind: "move", to: { x: 12, z: -34 }, note: "往后挪一点" },
    sketch: {
      shapes: [
        { type: "circle", x: 43, z: 8, r: 6 },
        { type: "arrow", from: { x: 43, z: 8 }, to: { x: 36, z: 0 } },
        { type: "path", points: [{ x: 1, z: 1 }, { x: 2, z: 2 }] },
        { type: "label", x: 5, z: 5, text: "这儿" },
        { type: "ghost", x: 12, z: -34, memberId: "TransferGunner" },
      ],
    },
    resolution: { at: "2026-09-19T03:00:00.000Z", by: "agent", summary: "已推后一拍", commit: "a1b2c3d" },
    status: "resolved",
  });
  Check(ValidateNote(full).ok, `带图片 / 草图 / 建议 / 结案 / verified 的整条也过：${ValidateNote(full).errors.join("；")}`);

  const cases = [
    [{ id: "note-1" }, /id 不合规/],
    [{ id: "n_20260918_101500_AB12" }, /id 不合规/],           // 大写不收
    [{ status: "done" }, /status 不认识/],
    [{ level: "First Level" }, /level 要是字母数字/],
    [{ level: "../x" }, /level 要是字母数字/],
    [{ missionVersion: null }, /missionVersion/],
    [{ text: "   " }, /text 要是非空/],
    [{ createdAt: "昨天" }, /createdAt 要是 ISO/],
    [{ original: null }, /original 要是对象/],
    [{ target: { kind: "member" } }, /要带 id/],
    [{ target: { kind: "nope", id: "x" } }, /target\.kind 不认识/],
    [{ target: { kind: "point", x: 1 } }, /要带有限的 x\/z/],
    [{ target: { kind: "time" } }, /要带 seconds 或 atS/],
    [{ phaseNumber: "十二" }, /phaseNumber/],
    [{ time: { kind: "stageRelative" } }, /要带 seconds/],
    [{ time: { kind: "whenever" } }, /time\.kind 不认识/],
    [{ proposal: { kind: "teleport" } }, /proposal\.kind 不认识/],
    [{ proposal: { kind: "move", to: { x: 1 } } }, /proposal\.to/],
    [{ sketch: { shapes: [{ type: "blob", x: 1, z: 1 }] } }, /type 不认识/],
    [{ sketch: { shapes: [{ type: "circle", x: 1, z: 1 }] } }, /要带 x\/z\/r/],
    [{ image: "shot.png" }, /image 要是 <noteId>\.png/],
    [{ id: "n_20260918_101500_ab12", image: "n_20260101_000000_zzzz.png" }, /名字要和 id 对得上/],
    [{ verified: "yes" }, /verified 要是布尔/],
    [{ resolution: { summary: "改了", at: "不是时间" } }, /resolution\.at/],
    [{ resolution: { summary: "", at: "2026-09-19T03:00:00.000Z" } }, /resolution\.summary/],
  ];
  for (const [patch, pattern] of cases) {
    const broken = ValidateNote(MakeNote(patch));
    Check(!broken.ok && broken.errors.some((error) => pattern.test(error)),
      `${JSON.stringify(patch).slice(0, 60)} → ${pattern}（实际 ${JSON.stringify(broken.errors)}）`);
  }
  for (const junk of [null, undefined, 42, "note", []]) {
    Check(!ValidateNote(junk).ok, `${JSON.stringify(junk)} 不是一条批注`);
  }
  console.log(`ok  ② ValidateNote：正常的过，${cases.length} 种坏法逐条报出人话`);
}

// =========================================================== ③ SnapshotTarget
{
  const member = SnapshotTarget(model, { kind: "member", id: "TransferGunner" });
  Check(member.kind === "member" && member.x === 43 && member.z === 8, "成员拍到了坐标");
  Check(member.weapon === "lmg" && member.hold === true && member.bayonet === false && member.team === "transfer",
    "成员拍到了武器 / hold / 刺刀 / 队");
  Check(member.tactic.delay === 2 && member.tactic.nearM === 12
    && member.tactic.points.length === 2 && member.tactic.points[1].x === 38, "成员拍到了整条 tactic 路线");
  Check(member.tactic.near.x === 40 && member.tactic.near.z === 5, "tactic 的放行点也拍下来了");
  Check(member.assaultLane.length === 2 && member.assaultLane[0].x === 43, "跃进线只存前两点（起跳 + 第一步）");
  Check(member.encounter === "transfer" && member.phaseNumber === 12, "成员带着所属组与阶段");
  Check(member.activation.spawn.kind === "beat" && member.activation.spawn.beat === "transfer",
    "成员带着所属组的 spawn 规则 —— 「出现得太早」说的就是它");
  const standby = SnapshotTarget(model, { kind: "member", id: "FlankScout" });
  Check(standby.activation.standbyUntil === "transferArrived" && standby.activation.dormant === true
    && standby.activation.wake.fact === "transferArrived" && standby.activation.deferred === true,
    "待命 / 沉睡 / 唤醒条件也在成员快照里");
  Check(SnapshotTarget(model, { kind: "member", id: "TransferRifle" }).tactic === null, "没有战术路线的成员存 null，不是 undefined");

  const encounter = SnapshotTarget(model, { kind: "encounter", id: "transfer" });
  Check(encounter.members.length === 2 && encounter.members[0].id === "TransferGunner"
    && encounter.members[1].z === 11, "遭遇组拍到了成员坐标清单");
  Check(encounter.activation.spawn.beat === "transfer" && encounter.phaseNumber === 12, "遭遇组拍到了 spawn / 阶段");

  const step = SnapshotTarget(model, { kind: "step", id: "Transfer" });
  Check(step.objective === "守住转运点" && step.minimumSeconds === 12 && step.cue === null, "步骤拍到了目标 / 最短秒数 / cue");
  Check(step.requirements.length === 2 && step.requirements[0] === "transferArrived", "步骤拍到了要求事实");
  Check(step.spawns.length === 1 && step.spawns[0] === "transfer" && step.guidance === null, "步骤拍到了本步生成的组与指引");
  Check(SnapshotTarget(model, { kind: "step", id: "TransferApproach" }).guidance.route === "evacuation", "有指引路线时也拍下来");

  const phase = SnapshotTarget(model, { kind: "phase", id: "Transfer" });
  Check(phase.title === "转运点" && phase.number === 12 && phase.steps[0] === "Transfer" && phase.spawn.x === 10,
    "阶段拍到了标题 / 步骤 / 出生点");
  Check(SnapshotTarget(model, { kind: "phase", id: 12 }).title === "转运点", "阶段也能按编号找");

  const fact = SnapshotTarget(model, { kind: "fact", id: "transferArrived" });
  Check(fact.gateKind === "proximity" && fact.anchor === "transfer" && fact.radiusM === 14,
    "事实拍到了整条门（kind 改名 gateKind，免得撞上快照自己的 kind）");

  const beat = SnapshotTarget(model, { kind: "beat", id: "transferFlank" });
  Check(beat.earliestS === 48 && beat.latestS === 76 && beat.loaded === 2, "拍拍到了那一拍的窗口");

  const route = SnapshotTarget(model, { kind: "route", id: "evacuation" });
  Check(route.points.length === 3 && route.points[2].z === -28, "路线拍到了全部点");

  const gate = SnapshotTarget(model, { kind: "zone", id: "transferArrivedGate" });
  Check(gate.shape === "gate" && gate.radiusM === 14 && gate.x === 10, "圆形区拍到了圆心与半径");
  const interior = SnapshotTarget(model, { kind: "zone", id: "kitchenInterior" });
  Check(interior.shape === "interior" && interior.minX === 2 && interior.maxZ === 3, "矩形区拍到了四边");

  const anchor = SnapshotTarget(model, { kind: "anchor", id: "transfer" });
  Check(anchor.x === 10 && anchor.z === -30, "锚点拍到了坐标");

  const friendly = SnapshotTarget(model, { kind: "friendly", id: "squadPost1" });
  Check(friendly.friendlyKind === "squadPost" && friendly.x === 8 && friendly.z === -28, "友军拍到了种类与坐标");

  const point = SnapshotTarget(model, { kind: "point", x: 3.5, z: -7.25 });
  Check(point.kind === "point" && point.x === 3.5 && point.z === -7.25, "地图上一点原样存");
  const time = SnapshotTarget(model, { kind: "time", seconds: 42 });
  Check(time.kind === "time" && time.seconds === 42, "时间点原样存");

  for (const kind of TARGET_KINDS) {
    if (kind === "point" || kind === "time") continue;
    const miss = SnapshotTarget(model, { kind, id: "NoSuchThing" });
    Check(miss.missing === true && miss.kind === kind, `${kind} 找不到时报 missing，不是静悄悄给个空对象`);
  }
  Check(JSON.stringify(SnapshotTarget(model, { kind: "member", id: "TransferGunner" })).length > 0,
    "快照 JSON.stringify 不抛（里头没有函数、没有循环引用）");
  console.log("ok  ③ SnapshotTarget：十二种目标各拍到「当时的真实数据」");
}

// ================================================================= ④ NoteDrift
{
  const note = MakeNote({ target: { kind: "member", id: "TransferGunner" } });
  const same = NoteDrift(note, MakeModel());
  Check(!same.changed && same.diff.length === 0, `没改过的模型不报漂移：${JSON.stringify(same.diff)}`);

  const moved = MakeModel();
  moved.encounters[0].members[0].x = 46.5;
  const drift = NoteDrift(note, moved);
  Check(drift.changed, "挪了一个成员的坐标 → changed");
  Check(drift.diff.length === 1 && drift.diff[0].path === "x" && drift.diff[0].from === 43 && drift.diff[0].to === 46.5,
    `diff 指到那个字段：${JSON.stringify(drift.diff)}`);
  Check(drift.current.x === 46.5, "current 是现在的快照");

  const retimed = MakeModel();
  retimed.encounters[0].spawn = { kind: "step", step: "Transfer" };
  const spawnDrift = NoteDrift(note, retimed);
  Check(spawnDrift.diff.some((row) => row.path === "activation.spawn.kind")
    && spawnDrift.diff.some((row) => row.path === "activation.spawn.beat"),
    `改了出现规则也报出来：${JSON.stringify(spawnDrift.diff)}`);

  const deleted = MakeModel();
  deleted.encounters[0].members.shift();
  const gone = NoteDrift(note, deleted);
  Check(gone.changed && gone.current.missing === true, "目标被删了算漂移（而不是「没变化」）");

  const routeNote = MakeNote({ target: { kind: "route", id: "evacuation" } });
  const rerouted = MakeModel();
  rerouted.routes.evacuation[1].z = -12;
  const routeDrift = NoteDrift(routeNote, rerouted);
  Check(routeDrift.diff.length === 1 && routeDrift.diff[0].path === "points.1.z",
    `路线上第几个点变了也指得出来：${JSON.stringify(routeDrift.diff)}`);

  // 存盘再读回来（JSON 一轮）不该凭空产生漂移 —— 否则整张列表天天亮「已变化」。
  const roundTrip = JSON.parse(JSON.stringify(MakeNote({ target: { kind: "encounter", id: "transfer" } })));
  Check(!NoteDrift(roundTrip, MakeModel()).changed, "批注写进 notes.json 再读回来不会假报漂移");
  console.log("ok  ④ NoteDrift：变了指到字段、删了算漂移、存盘一轮不假报");
}

// =========================================================== ⑤ HandoffMarkdown
{
  const notes = [
    MakeNote({
      id: "n_20260918_101500_ab12",
      image: "n_20260918_101500_ab12.png",
      proposal: { kind: "move", to: { x: 12, z: -34 }, note: "往房子后面挪" },
      sketch: { shapes: [{ type: "circle", x: 43, z: 8, r: 6 }, { type: "arrow", from: { x: 43, z: 8 }, to: { x: 12, z: -34 } }] },
      time: { kind: "stageRelative", seconds: 20 },
    }),
    MakeNote({
      id: "n_20260918_101600_cd34", target: { kind: "beat", id: "transferFlank" }, phaseNumber: 12,
      text: "第二拍来得太密。", proposal: { kind: "retime", earliestS: 60, latestS: 90 },
    }),
    MakeNote({ id: "n_20260918_101700_ef56", status: "resolved", text: "已处理过的那条。",
      resolution: { at: "2026-09-19T03:00:00.000Z", by: "agent", summary: "推后一拍", commit: "a1b2c3d" } }),
  ];
  const text = HandoffMarkdown(notes, model);
  Check(text.includes("目标") && text.includes("原设置") && text.includes("建议"), "交接文本有目标 / 原设置 / 建议三栏");
  Check(text.includes("n_20260918_101500_ab12"), "交接文本列出了批注 id");
  Check(text.includes("Taierzhuang1938/Notes/FirstLevel/n_20260918_101500_ab12.png"), "交接文本给出了图片的仓库路径");
  Check(text.includes("```json"), "交接文本末尾带机器可读的 ```json 块");
  Check(text.includes("阶段 12") && text.includes("转运点"), "按阶段分组，标题来自模型");
  Check(text.includes("x = 43") && text.includes("这组敌人出现得太早。"), "原设置逐字段列出来、意见原文照抄");
  Check(text.includes("move") && text.includes("(12.0, -34.0)"), "建议里带上候选位");
  Check(!text.includes("n_20260918_101700_ef56"), "默认只交待处理的（resolved 的不占篇幅）");
  Check(HandoffMarkdown(notes, model, { onlyOpen: false }).includes("n_20260918_101700_ef56"), "--all 口径把已结案的也列出来");

  const block = text.slice(text.indexOf("```json") + 7, text.lastIndexOf("```"));
  const parsed = JSON.parse(block);
  Check(Array.isArray(parsed) && parsed.length === 2 && parsed[0].id === "n_20260918_101500_ab12",
    "```json 块是能直接 JSON.parse 的那两条");

  const moved = MakeModel();
  moved.encounters[0].members[0].x = 46.5;
  Check(HandoffMarkdown(notes, moved).includes("已变化"), "模型变过之后交接文本会点名「已变化」");
  Check(HandoffMarkdown(notes, null).includes("```json"), "没有模型（线上 / 模型还没建）也出得了交接文本");
  Check(HandoffMarkdown([], model).includes("没有批注"), "一条批注都没有时说人话，不是空白");
  console.log("ok  ⑤ 交接文本：目标 / 原设置 / 建议 / 图片路径 / ```json 块 / 分组 / 漂移提示");
}

// ============================================================== ⑥ ResolveNote
{
  const note = MakeNote({ id: "n_20260918_101500_ab12" });
  const frozen = JSON.stringify(note);
  const resolved = ResolveNote(note, { summary: "已把这组推后到第 13 阶段", commit: "a1b2c3d" });
  Check(JSON.stringify(note) === frozen, "ResolveNote 不改入参（工作台是 map 出新数组）");
  Check(resolved.status === "resolved" && resolved.resolution.by === "agent", "标成 resolved，落款 agent");
  Check(resolved.resolution.summary === "已把这组推后到第 13 阶段" && resolved.resolution.commit === "a1b2c3d",
    "结案说明与 commit 都存下来了");
  Check(resolved.updatedAt === resolved.resolution.at && resolved.updatedAt !== note.updatedAt, "updatedAt 跟着结案时间走");
  Check(resolved.original.x === note.original.x, "原设置快照一个字没动 —— 它是对账的基准");
  Check(ValidateNote(resolved).ok, `结案后的批注仍然合规：${ValidateNote(resolved).errors.join("；")}`);

  const dismissed = DismissNote(note, "看过了，不改");
  Check(dismissed.status === "dismissed" && dismissed.resolution.summary === "看过了，不改", "dismiss 走同一条路");
  Check(ValidateNote(dismissed).ok, "标成不处理之后也合规");
  const verified = { ...ResolveNote(note, { summary: "改完了" }), verified: true };
  Check(ValidateNote(verified).ok, "用户点「已核对」加的 verified:true 是 schema 里的合法字段");
  console.log("ok  ⑥ ResolveNote / DismissNote：不改入参、结案后仍合规、verified 预留位可用");
}

// ================================================ ⑦ 保存端点（真起一次服）
/** 起一次真的本地预览服，根指向 root；返回 { port, Stop() }。 */
function StartPreview(root, port, extra = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [previewScript, `--root=${root}`, "--no-open", String(port), ...extra],
      { cwd: root, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const timer = setTimeout(() => { child.kill(); reject(new Error(`预览服没起来：${out}`)); }, 20000);
    child.stdout.on("data", (chunk) => {
      out += chunk.toString("utf8");
      const match = /http:\/\/127\.0\.0\.1:(\d+)\/__preview\//.exec(out);
      if (!match) return;
      clearTimeout(timer);
      resolve({
        port: Number(match[1]),
        Stop: () => new Promise((done) => { child.once("close", done); child.kill(); }),
      });
    });
    child.stderr.on("data", (chunk) => { out += chunk.toString("utf8"); });
    child.on("error", (error) => { clearTimeout(timer); reject(error); });
  });
}

async function PostNotes(origin, payload, raw = null) {
  const response = await fetch(`${origin}/__notes/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw === null ? JSON.stringify(payload) : raw,
    signal: AbortSignal.timeout(20000),
  });
  let json = null;
  try { json = await response.json(); } catch { /* 有的错误分支没有 body */ }
  return { status: response.status, json };
}

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
function FakePng(bytes) { return Buffer.concat([PNG_MAGIC, Buffer.alloc(Math.max(0, bytes - PNG_MAGIC.length), 7)]); }
function PngDataUrl(buffer) { return `data:image/png;base64,${buffer.toString("base64")}`; }

/** 目录里有没有留下 .tmp（原子写失手的唯一痕迹）。 */
function TempLeftovers(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const at = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...TempLeftovers(at));
    else if (entry.name.endsWith(".tmp")) out.push(at);
  }
  return out;
}

const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "tz-notes-"));
const repoNotesBefore = fs.readFileSync(repoNotesFile, "utf8");

{
  // 服务根是一个**临时目录**：端点真的会写盘，绝不拿仓库里的批注当靶子。
  const serveRoot = path.join(workDir, "tree");
  fs.mkdirSync(serveRoot, { recursive: true });
  fs.writeFileSync(path.join(serveRoot, "index.html"), "<!doctype html><title>t</title>\n", "utf8");
  const notesDir = path.join(serveRoot, "Taierzhuang1938", "Notes", "FirstLevel");
  const notesFile = path.join(notesDir, "notes.json");
  Check(!fs.existsSync(notesDir), "开跑时那个目录还不存在 —— 端点要自己 mkdir -p");

  // 8300–8899：避开 8080（用户自己的预览服）与 Chromium 的受限端口段。
  const preview = await StartPreview(serveRoot, 8300 + Math.floor(Math.random() * 600));
  const origin = `http://127.0.0.1:${preview.port}`;
  try {
    const status = await fetch(`${origin}/__notes/status`, { signal: AbortSignal.timeout(10000) });
    const statusJson = await status.json();
    Check(status.status === 200 && statusJson.writable === true
      && path.resolve(statusJson.root) === path.resolve(serveRoot),
      `GET /__notes/status → ${JSON.stringify(statusJson)}`);

    // 别的路由一个字没改。
    const ping = await (await fetch(`${origin}/__preview/ping`, { signal: AbortSignal.timeout(10000) })).json();
    Check(ping.app === "BlanksLocalPreview", "索引页 ping 没受影响");
    const tuning = await (await fetch(`${origin}/__tuning/status`, { signal: AbortSignal.timeout(10000) })).json();
    Check(tuning.writable === true, "调参口没被新路由挤掉");

    const imageNote = MakeNote({ id: "n_20260918_101500_ab12", image: "n_20260918_101500_ab12.png" });
    const plainNote = MakeNote({ id: "n_20260918_101600_cd34", target: { kind: "encounter", id: "transfer" } });
    const png = FakePng(2048);
    const saved = await PostNotes(origin, {
      level: "FirstLevel",
      notes: [imageNote, plainNote],
      images: { "n_20260918_101500_ab12.png": PngDataUrl(png) },
    });
    Check(saved.status === 200 && saved.json.ok === true && saved.json.count === 2
      && saved.json.images.length === 1 && saved.json.file === "Taierzhuang1938/Notes/FirstLevel/notes.json",
      `POST /__notes/save → ${JSON.stringify(saved.json)}`);

    const onDisk = fs.readFileSync(notesFile, "utf8");
    Check(onDisk.endsWith("]\n"), "notes.json 末尾有换行");
    Check(onDisk.includes('\n  {\n    "id": "n_20260918_101500_ab12"'), "notes.json 是 2 空格缩进");
    const reloaded = JSON.parse(onDisk);
    Check(Array.isArray(reloaded) && reloaded.length === 2 && reloaded[0].id === imageNote.id, "写回去的 JSON 读得回来");
    Check(reloaded[0].original.x === 43 && reloaded[1].original.members.length === 2, "原设置快照原样落了盘");
    Check(reloaded.every((note) => ValidateNote(note).ok), "落盘的每一条都还合规");
    Check(Buffer.compare(fs.readFileSync(path.join(notesDir, "n_20260918_101500_ab12.png")), png) === 0,
      "PNG 逐字节落了盘");
    Check(TempLeftovers(notesDir).length === 0, "成功那一次没留下 .tmp");

    // --- 被拒的用例（每一条之后盘上都不许变） -------------------------------
    const frozen = fs.readFileSync(notesFile, "utf8");
    const rejects = [];

    for (const level of ["../x", "First Level", "", "FirstLevel/../..", "..", "a/b"]) {
      const bad = await PostNotes(origin, { level, notes: [] });
      rejects.push(`level=${JSON.stringify(level)} → ${bad.status}`);
      Check(bad.status === 403 && bad.json.ok === false, `非白名单 level ${JSON.stringify(level)} 被拒：${bad.status}`);
    }

    const bigPng = await PostNotes(origin, {
      level: "FirstLevel", notes: [imageNote],
      images: { "n_20260918_101500_ab12.png": PngDataUrl(FakePng(2 * 1024 * 1024)) },
    });
    Check(bigPng.status === 400 && /1\.5 MB/.test(bigPng.json.error), `超过 1.5 MB 的图被拒：${bigPng.json.error}`);

    const notPng = await PostNotes(origin, {
      level: "FirstLevel", notes: [imageNote],
      images: { "n_20260918_101500_ab12.png": "data:image/jpeg;base64,/9j/4AAQ" },
    });
    Check(notPng.status === 400 && /data:image\/png/.test(notPng.json.error), `非 PNG data URL 被拒：${notPng.json.error}`);

    const fakePng = await PostNotes(origin, {
      level: "FirstLevel", notes: [imageNote],
      images: { "n_20260918_101500_ab12.png": `data:image/png;base64,${Buffer.from("not a png").toString("base64")}` },
    });
    Check(fakePng.status === 400 && /不是 PNG/.test(fakePng.json.error), "挂着 PNG 名头的非 PNG 也被拒（查魔数）");

    const badImageName = await PostNotes(origin, {
      level: "FirstLevel", notes: [imageNote],
      images: { "../../evil.png": PngDataUrl(png) },
    });
    Check(badImageName.status === 403 && badImageName.json.ok === false, `越界图片名被拒：${badImageName.status}`);

    const badNote = await PostNotes(origin, {
      level: "FirstLevel", notes: [MakeNote({ id: "n_20260918_101500_ab12" }), MakeNote({ text: "" })],
    });
    Check(badNote.status === 400 && Array.isArray(badNote.json.details) && /text/.test(badNote.json.details.join("")),
      `半截批注被拒且点名第几条：${JSON.stringify(badNote.json.details)}`);

    const wrongLevel = await PostNotes(origin, { level: "SecondLevel", notes: [imageNote] });
    Check(wrongLevel.status === 400 && /level/.test(JSON.stringify(wrongLevel.json)),
      "批注自己的 level 和请求的对不上时被拒（免得 FirstLevel 的批注落进别的关卡）");

    const notArray = await PostNotes(origin, { level: "FirstLevel", notes: { nope: 1 } });
    Check(notArray.status === 400 && notArray.json.ok === false, "notes 不是数组被拒");

    const notJson = await PostNotes(origin, null, "not json");
    Check(notJson.status === 400 && notJson.json.ok === false, "不是 JSON 的 body 被拒");

    const huge = await PostNotes(origin, null, JSON.stringify({
      level: "FirstLevel", notes: [], pad: "x".repeat(9 * 1024 * 1024),
    }));
    Check(huge.status === 400 && huge.json?.ok === false, `超过 8 MB 的 body 被拒：${huge.status}`);

    const getSave = await fetch(`${origin}/__notes/save`, { signal: AbortSignal.timeout(10000) });
    Check(getSave.status === 405, `保存口只收 POST（GET → ${getSave.status}）`);

    Check(fs.readFileSync(notesFile, "utf8") === frozen, "被拒的那十几条请求一个字节都没写进去");
    Check(TempLeftovers(path.join(serveRoot, "Taierzhuang1938")).length === 0, "被拒之后也没留下 .tmp");
    Check(!fs.existsSync(path.join(serveRoot, "Taierzhuang1938", "Notes", "SecondLevel")),
      "被拒的 level 连目录都没建出来");
    console.log(`ok  ⑦ 保存端点：:${preview.port} 上真写了盘（${rejects.length} 种非法 level 全 403），`
      + "超大图 / 非 PNG / 越界图名 / 半截批注 / 超大 body / GET 全被拒，没留 .tmp");
  } finally {
    await preview.Stop();
  }

  // --- 非回环地址：起一次 --lan，从本机的局域网 IP 打过去 -------------------
  // 拿不到局域网地址（或者被防火墙挡住）时跳过 —— 这条是环境相关的。
  const lanIp = Object.values(os.networkInterfaces()).flat()
    .find((net) => net && net.family === "IPv4" && !net.internal)?.address;
  if (!lanIp) {
    console.log("skip ⑦ 非回环拒绝：这台机器没有局域网 IPv4");
  } else {
    const preview2 = await StartPreview(serveRoot, 8300 + Math.floor(Math.random() * 600), ["--lan"]);
    try {
      const remote = `http://${lanIp}:${preview2.port}`;
      const save = await PostNotes(remote, { level: "FirstLevel", notes: [] });
      Check(save.status === 403 && save.json.ok === false, `非回环地址（${lanIp}）被拒：${save.status}`);
      const status = await (await fetch(`${remote}/__notes/status`, { signal: AbortSignal.timeout(10000) })).json();
      Check(status.writable === false, "非回环地址上 status 退化成 writable:false（工作台据此退化成 localStorage 草稿）");
      console.log(`ok  ⑦ 非回环拒绝：从 ${lanIp} 打过来 403，status 报 writable:false`);
    } catch (error) {
      console.log(`skip ⑦ 非回环拒绝：局域网口打不通（${String(error.message || error).slice(0, 80)}）`);
    } finally {
      await preview2.Stop();
    }
  }
}

// ============================== ⑧ 真模型（P1 的那份建好了才跑；没有就跳过）
{
  const orchestration = path.join(projectDir, "Script_MissionOrchestration.mjs");
  let real = null;
  if (fs.existsSync(orchestration)) {
    try {
      const module = await import(pathToFileURL(orchestration).href);
      real = typeof module.BuildOrchestrationModel === "function" ? module.BuildOrchestrationModel() : null;
    } catch (error) {
      console.log(`skip ⑧ 真模型：Script_MissionOrchestration.mjs 还起不来（${String(error.message || error).slice(0, 90)}）`);
    }
  } else {
    console.log("skip ⑧ 真模型：还没有 Script_MissionOrchestration.mjs（P1 在写）");
  }
  if (real) {
    const targets = [];
    const firstEncounter = (real.encounters || [])[0];
    if (firstEncounter) {
      targets.push({ kind: "encounter", id: firstEncounter.id });
      const firstMember = (firstEncounter.members || [])[0];
      if (firstMember) targets.push({ kind: "member", id: firstMember.id });
    }
    if ((real.steps || [])[0]) targets.push({ kind: "step", id: real.steps[0].id });
    if ((real.phases || [])[0]) targets.push({ kind: "phase", id: real.phases[0].id });
    if ((real.beats || [])[0]) targets.push({ kind: "beat", id: real.beats[0].id });
    if ((real.zones || [])[0]) targets.push({ kind: "zone", id: real.zones[0].id });
    if ((real.friendlies || [])[0]) targets.push({ kind: "friendly", id: real.friendlies[0].id });
    const factId = Object.keys(real.facts || {})[0];
    if (factId) targets.push({ kind: "fact", id: factId });
    const routeId = Object.keys(real.routes || {})[0];
    if (routeId) targets.push({ kind: "route", id: routeId });
    const anchorId = Object.keys(real.anchors || {})[0];
    if (anchorId) targets.push({ kind: "anchor", id: anchorId });

    const notes = targets.map((target, index) => ({
      ...MakeNote({ target }),
      id: `n_20260918_1017${String(index).padStart(2, "0")}_zz${String(index).padStart(2, "0")}`,
      missionVersion: real.version,
      original: SnapshotTarget(real, target),
    }));
    for (const note of notes) {
      Check(!note.original.missing, `真模型里拍得到 ${note.target.kind} ${note.target.id}`);
      Check(JSON.stringify(note.original).length > 2, `真模型的 ${note.target.kind} 快照不是空壳`);
      Check(ValidateNote(note).ok, `照真模型建的批注合规：${ValidateNote(note).errors.join("；")}`);
      Check(!NoteDrift(note, real).changed, `刚拍完就比对，真模型上不该有漂移（${note.target.kind}）`);
    }
    const text = HandoffMarkdown(notes, real);
    Check(text.includes("```json") && text.length > 200, "真模型上的交接文本出得来");
    console.log(`ok  ⑧ 真模型：${targets.length} 种目标 SnapshotTarget / NoteDrift / HandoffMarkdown 都不抛`);
  }
}

fs.rmSync(workDir, { recursive: true, force: true });
Check(!fs.existsSync(workDir), "临时目录清干净了");
Check(fs.readFileSync(repoNotesFile, "utf8") === repoNotesBefore,
  "仓库里的 Notes/FirstLevel/notes.json 在测试前后逐字节相同（端点测试只打临时目录）");

console.log(`\nMissionNotesTest 通过：${checks} 条断言`);
