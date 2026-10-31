// Script_EditorBlockoutLayoutEditTest.mjs —— 白盒编辑器「编辑布设」的改动记录与导出（docs/Data_EditorBlockout.md §4.4，2026-10-21）
// 跑法：node Taierzhuang1938/Script_EditorBlockoutLayoutEditTest.mjs
// 查：挪动记 from / to、挪回原处就删、整组平移吸附的是挪动量（没挪的那根轴一位不变）、朝向；撤销 / 重做 / 拖动取消；
//     标记加改删、导出按顺序重新编号；已采纳的条目被 Reconcile 拿掉、数据挪过但没到位的更新 from；
//     导出对象的排序、文件归属、附近的东西按距离筛；文字里有人话行、末行「数据：」能原样解析回来。

import assert from "node:assert/strict";
import {
  LAYOUT_EDIT_SCHEMA, LAYOUT_EDIT_DATA_PREFIX, LAYOUT_EDIT_KINDS, LayoutEditKey, LayoutEditSession, SnapM,
  BuildLayoutEditExport, FormatLayoutEdit, ParseLayoutEdit,
} from "./Script_EditorBlockoutLayoutEdit.mjs";

const dog = { kind: "landmark", id: "LmDogHole", name: "狗洞", path: "landmarks[3]", x: 81.5, z: 488, ry: 0 };
const wallA = { kind: "block", id: "GengEastWall", x: 90.03, z: 470.27, ry: 0, meta: { semantic: "structure" } };
const wallB = { kind: "block", id: "GengSouthWall_1", x: 85.11, z: 476.66, ry: 1.5708 };
const luo = { kind: "unit", id: "Luo", keyframeId: "08-2", name: "罗班长", path: "keyframes[9].units[0]", meta: { side: "nra" }, x: 100, z: 430, yawDeg: 10 };
const st = { kind: "station", id: "08-2", keyframeId: "08-2", name: "压窗口", path: "keyframes[9].player", x: 98, z: 432, yawDeg: 0 };

// --- 键 ---
assert.equal(LayoutEditKey(dog), "landmark||LmDogHole");
assert.equal(LayoutEditKey(luo), "unit|08-2|Luo");
assert.notEqual(LayoutEditKey(luo), LayoutEditKey({ ...luo, keyframeId: "08-3" }), "人按关键帧分开记");
assert.throws(() => LayoutEditKey({ kind: "tree", id: "x" }));
assert.equal(SnapM(1.26), 1.3); assert.equal(SnapM(-0.04), -0); assert.equal(SnapM(0.25), 0.3);

// --- 挪动、挪回原处 ---
{
  const s = new LayoutEditSession("FirstLevel0610");
  assert.ok(s.empty);
  s.Step(() => s.Set(dog, { x: 82.3, z: 487.1 }));
  assert.equal(s.moveCount, 1);
  const m = s.MoveOf(dog);
  assert.deepEqual(m.from, { x: 81.5, z: 488, ry: 0 });
  assert.deepEqual(m.to, { x: 82.3, z: 487.1, ry: 0 });
  assert.deepEqual(s.Resolve(dog), { x: 82.3, z: 487.1, ry: 0 });
  // 再挪一次：from 不变
  s.Step(() => s.Set(dog, { x: 83 }));
  assert.deepEqual(s.MoveOf(dog).from, { x: 81.5, z: 488, ry: 0 });
  assert.equal(s.MoveOf(dog).to.z, 487.1, "只给 x：z 沿用");
  // 挪回原处 = 这条删掉
  s.Step(() => s.Set(dog, { x: 81.5, z: 488 }));
  assert.equal(s.moveCount, 0);
  assert.deepEqual(s.Resolve(dog), { x: 81.5, z: 488, ry: 0 });
  // 朝向
  s.Step(() => s.Set(luo, { yawDeg: 370 }));
  assert.equal(s.MoveOf(luo), null, "370° 等于 10°：没变 → 不记");
  assert.equal(s.moveCount, 0);
  s.Step(() => s.Set(luo, { yawDeg: -80 }));
  assert.equal(s.MoveOf(luo).to.yawDeg, -80);
  assert.equal(s.MoveOf(luo).to.x, 100);
  // 不认的 ref
  assert.equal(s.Set({ kind: "unit", id: "X" }, { x: 1 }), false, "没有原位置不记");
}

// --- 整组平移：吸附挪动量，不吸附坐标 ---
{
  const s = new LayoutEditSession("L");
  s.Begin();
  const refs = [wallA, wallB];
  const starts = refs.map(r => s.Resolve(r));
  s.Translate(refs, starts, 0.04, 2.07);   // x 不到半格 → 0；z → 2.1
  s.Commit();
  assert.equal(s.MoveOf(wallA).to.x, 90.03, "没往 x 挪：x 一位不变（不被吸到 90.0）");
  assert.equal(s.MoveOf(wallA).to.z, 472.37);
  assert.equal(s.MoveOf(wallB).to.z, 478.76);
  assert.equal(s.MoveOf(wallB).to.ry, 1.5708, "平移不碰转角");
  // 拖动途中多次 Translate 只算一步撤销
  assert.equal(s.undo.length, 1);
}

// --- 撤销 / 重做 / 取消 ---
{
  const s = new LayoutEditSession("L");
  s.Step(() => s.Set(dog, { x: 85 }));
  s.Step(() => s.Set(st, { z: 440 }));
  assert.equal(s.moveCount, 2);
  assert.ok(s.Undo()); assert.equal(s.moveCount, 1); assert.ok(!s.Moved(st));
  assert.ok(s.Redo()); assert.ok(s.Moved(st));
  assert.ok(s.Undo()); assert.ok(s.Undo()); assert.ok(s.empty); assert.ok(!s.Undo());
  s.Step(() => s.Set(dog, { x: 90 }));
  assert.ok(!s.canRedo, "新的一步清掉重做");
  // 拖动中 Esc：回到拖动前，不进撤销栈
  const undoLen = s.undo.length;
  s.Begin(); s.Set(dog, { x: 120 }); s.Cancel();
  assert.equal(s.MoveOf(dog).to.x, 90);
  assert.equal(s.undo.length, undoLen);
  // 没变化的一步不进栈
  s.Begin(); s.Commit();
  assert.equal(s.undo.length, undoLen);
}

// --- 标记 ---
{
  const s = new LayoutEditSession("L");
  const a = s.AddMarker({ x: 95.23, z: 470.08, text: "这里加一道矮墙" });
  const b = s.AddMarker({ x: 10, z: 20, radiusM: 6.04 });
  const c = s.AddMarker({ x: 30, z: 40, text: "第三个" });
  assert.equal(a.x, 95.2); assert.equal(a.z, 470.1); assert.equal(b.radiusM, 6);
  assert.equal(s.markerCount, 3);
  assert.ok(s.UpdateMarker(b.n, { text: "这一片空着", radiusM: 0 }));
  assert.equal(s.Marker(b.n).radiusM, 0);
  assert.ok(s.RemoveMarker(a.n));
  assert.equal(s.Marker(a.n), null);
  const exp = BuildLayoutEditExport(s, { level: { key: "L" } });
  assert.deepEqual(exp.markers.map(m => m.n), [1, 2], "导出时按现在的顺序重新编号");
  assert.equal(exp.markers[1].text, "第三个");
  assert.equal(c.n, 3, "会话里的号不重用");
  assert.equal(s.AddMarker({ x: NaN, z: 0 }), null);
}

// --- Reconcile：agent 改到位的拿掉；挪过但没到位的更新 from ---
{
  const s = new LayoutEditSession("L");
  s.Step(() => { s.Set(dog, { x: 82.3, z: 487.1 }); s.Set(luo, { x: 105 }); s.Set(st, { x: 99 }); });
  const now = {
    [LayoutEditKey(dog)]: { x: 82.32, z: 487.08, ry: 0 },     // 到位了（误差 < 6 cm）
    [LayoutEditKey(luo)]: { x: 102, z: 430, yawDeg: 10 },      // 挪了一半
    // st 找不到（null）：不动
  };
  const applied = s.Reconcile((m) => now[LayoutEditKey(m)] || null);
  assert.equal(applied, 1);
  assert.ok(!s.Moved(dog));
  assert.deepEqual(s.MoveOf(luo).from, { x: 102, z: 430, yawDeg: 10 });
  assert.equal(s.MoveOf(luo).to.x, 105);
  assert.ok(s.Moved(st));
  // 朝向没到位不算采纳
  s.Step(() => s.Set(luo, { yawDeg: 40 }));
  assert.equal(s.Reconcile(() => ({ x: 105, z: 430, yawDeg: 10 })), 0);
}

// --- 导出 ---
{
  const s = new LayoutEditSession("FirstLevel0610");
  s.Step(() => {
    s.Set(st, { x: 99.5 });
    s.Set(luo, { x: 101, z: 429, yawDeg: 25 });
    s.Set(dog, { x: 82.3, z: 487.1 });
    s.Translate([wallA, wallB], [wallA, wallB].map(r => s.Resolve(r)), 2, -1);
    s.Set({ ...wallB, id: "Rotated" }, { ry: 1.5708 + Math.PI / 12 });
  });
  s.AddMarker({ x: 83, z: 486, radiusM: 4, text: "狗洞再往东一点" });
  s.AddMarker({ x: 500, z: 500, text: "" });
  const exp = BuildLayoutEditExport(s, {
    level: { key: "FirstLevel0610", label: "06–10", configPath: "Taierzhuang1938/Blockout/FirstLevel0610.json", scenePath: "Taierzhuang1938/Blockout/FirstLevel0610.scene.json" },
    keyframe: { id: "08-2", index: 9 },
    near: () => [
      { kind: "landmark", id: "LmDogHole", name: "狗洞", x: 82.3, z: 487.1 },
      { kind: "landmark", id: "LmFar", name: "远处", x: 200, z: 487 },
      { kind: "block", id: "GengEastWall", name: "", x: 90, z: 480 },
    ],
    view: { cx: 90, cz: 480, spanM: 120.4 },
    url: "http://127.0.0.1:8080/Taierzhuang1938/index.html?editor=blockout&level=FirstLevel0610",
  });
  assert.equal(exp.schema, LAYOUT_EDIT_SCHEMA);
  assert.equal(exp.moves.length, 6);
  // 场景在前、配置在后；配置里按关键帧再按种类（人在站位前）
  assert.deepEqual(exp.moves.map(m => m.file), ["scene", "scene", "scene", "scene", "config", "config"]);
  assert.deepEqual(exp.moves.slice(4).map(m => m.kind), ["unit", "station"]);
  const unit = exp.moves.find(m => m.kind === "unit");
  assert.equal(unit.keyframe, "08-2"); assert.equal(unit.path, "keyframes[9].units[0]");
  assert.equal(unit.dx, 1); assert.equal(unit.dz, -1); assert.equal(unit.dYawDeg, 15);
  const rot = exp.moves.find(m => m.id === "Rotated");
  assert.equal(rot.dRyDeg, 15);
  assert.ok(!("keyframe" in exp.moves.find(m => m.kind === "landmark")), "地标不分关键帧");
  assert.equal(exp.markers[0].near.length, 2, "15 m 以外的不列");
  assert.equal(exp.markers[0].near[0].name, "狗洞");
  assert.equal(exp.markers[0].near[0].dir, "西南", "狗洞在标记的西南（z 正 = 南）");
  assert.equal(exp.markers[0].radiusM, 4);
  assert.ok(!("radiusM" in exp.markers[1]));
  for (const kind of Object.keys(LAYOUT_EDIT_KINDS)) assert.ok(["scene", "config"].includes(LAYOUT_EDIT_KINDS[kind].file));

  const text = FormatLayoutEdit(exp);
  const lines = text.split("\n");
  assert.equal(lines[0], "【滕县白盒编辑器 · 布设调整】");
  assert.ok(text.includes("地标「狗洞」 LmDogHole（场景 landmarks[3]）：(81.50, 488.00) → (82.30, 487.10)，往东 0.8 m、往北 0.9 m"), text);
  assert.ok(text.includes("体块 GengEastWall、GengSouthWall_1 一起往东 2 m、往北 1 m"), "同一挪动量的体块合成一行");
  assert.ok(text.includes("友方人「罗班长」 Luo（配置 keyframes[9].units[0]）"), text);
  assert.ok(text.includes("朝向 10.0° → 25.0°"));
  assert.ok(text.includes("关键帧 08-2 的玩家站位「压窗口」"));
  assert.ok(text.includes("① x 83.0  z 486.0，半径 4 m 这一片：「狗洞再往东一点」"));
  assert.ok(text.includes("② x 500.0  z 500.0：（没写字）"));
  // 2026-10-31：第一关新剧本的场景以 Scenes/FirstLevelWhitebox 为准，导出里叫 agent 直接改场景文件（docs/Data_Scene.md）
  assert.ok(text.includes("Scenes/FirstLevelWhitebox/Scene_FirstLevelWhitebox.json") && text.includes("objects[i]"), "导出说明指到场景文件");
  assert.ok(lines[lines.length - 1].startsWith(LAYOUT_EDIT_DATA_PREFIX));
  const back = ParseLayoutEdit(text);
  assert.deepEqual(back, JSON.parse(JSON.stringify(exp)));
  assert.equal(ParseLayoutEdit("随便一段"), null);
  assert.equal(ParseLayoutEdit(`${LAYOUT_EDIT_DATA_PREFIX}{"schema":"other"}`), null);
  assert.equal(ParseLayoutEdit(`${LAYOUT_EDIT_DATA_PREFIX}{坏的`), null);
}

// --- 清空能撤销 ---
{
  const s = new LayoutEditSession("L");
  s.Step(() => s.Set(dog, { x: 85 }));
  s.Step(() => s.AddMarker({ x: 1, z: 2, text: "a" }));
  s.Step(() => s.Clear());
  assert.ok(s.empty);
  s.Undo();
  assert.equal(s.moveCount, 1); assert.equal(s.markerCount, 1);
}

console.log("EditorBlockoutLayoutEditTest ok");
