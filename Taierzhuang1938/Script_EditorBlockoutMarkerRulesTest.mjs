// Script_EditorBlockoutMarkerRulesTest.mjs —— 白盒编辑器三层新标记的纯规则（docs/Data_EditorBlockout.md §5.5，2026-10-20）
// 跑法：node Taierzhuang1938/Script_EditorBlockoutMarkerRulesTest.mjs
// 查：无名单位的兜底文字（国军 / 日军 / 百姓 / 小孩 / 军官 / 伤员 / 担架 / 驴车 / 战车 / 机枪）、同类带 id 尾号、三档的差别；
//     地标校验正反例与归一化；地标几何（线框外扩、薄的撑到 0.3 m、窖的显式 y、片区虚线、光柱高过线框）；
//     站位标签「拍号 + 名字」；开关状态的归一化与 localStorage 读写（坏文字回缺省）；
//     提交的 0610 场景文件里的地标过校验、归一化后一个不丢。

import assert from "node:assert/strict";
import fs from "node:fs";
import { LandmarkIssues, NormalizeLandmarks, ValidateBlockoutScene, BLOCKOUT_LANDMARK_KINDS } from "./Script_EditorBlockoutConfig.mjs";
import {
  BLOCKOUT_LABEL_MODES, BLOCKOUT_LAYER_DEFAULTS, BLOCKOUT_LANDMARK_COLORS, BLOCKOUT_LANDMARK_DRAW, BLOCKOUT_STATION_DRAW,
  UnitFallbackText, UnitLabelTexts, IdTail, LabelMode, LandmarkGeometry, StationLabel, NormalizeLayers, ParseStoredLayers, SerializeLayers,
} from "./Script_EditorBlockoutMarkerRules.mjs";
import { BLOCKOUT_MARKER_COLORS } from "./Script_EditorBlockoutMarkers.mjs";

// --- 兜底文字 ---
assert.equal(UnitFallbackText({ side: "nra", kind: "soldier" }), "国军");
assert.equal(UnitFallbackText({ side: "ija", kind: "soldier" }), "日军");
assert.equal(UnitFallbackText({ side: "civ", kind: "civilian" }), "百姓");
assert.equal(UnitFallbackText({ side: "civ", kind: "child" }), "小孩");
assert.equal(UnitFallbackText({ side: "nra", kind: "officer" }), "军官");
assert.equal(UnitFallbackText({ side: "ija", kind: "officer" }), "日军军官");
assert.equal(UnitFallbackText({ side: "nra", kind: "soldier", state: "down" }), "伤员");
assert.equal(UnitFallbackText({ side: "ija", kind: "soldier", state: "down" }), "日军（倒地）");
assert.equal(UnitFallbackText({ side: "nra", kind: "litter" }), "担架");
assert.equal(UnitFallbackText({ side: "civ", kind: "cart" }), "驴车");
assert.equal(UnitFallbackText({ side: "ija", kind: "tank" }), "战车");
assert.equal(UnitFallbackText({ side: "ija", kind: "soldier", weapon: "Type11" }), "机枪");
assert.equal(IdTail("Walker04"), "04"); assert.equal(IdTail("EastIja5"), "5"); assert.equal(IdTail("Luo"), "");

const units = [
  { id: "Luo", side: "nra", name: "罗班长" },
  { id: "Walker01", side: "nra", kind: "soldier" }, { id: "Walker04", side: "nra", kind: "soldier" },
  { id: "EastIja5", side: "ija", kind: "soldier" },
  { id: "Mg", side: "ija", kind: "soldier", weapon: "Type11" },
  { id: "Litter01", side: "nra", kind: "litter" },
  { id: "Hidden", side: "ija", kind: "soldier", visible: false },
];
{
  const named = UnitLabelTexts(units, "named");
  assert.equal(named.get("Luo"), "罗班长"); assert.equal(named.get("Walker01"), ""); assert.equal(named.get("Mg"), "机枪"); assert.equal(named.get("Litter01"), "");
  const all = UnitLabelTexts(units, "all");
  assert.equal(all.get("Luo"), "罗班长");
  assert.equal(all.get("Walker01"), "国军 01", "同一帧两个无名国军：带 id 尾号"); assert.equal(all.get("Walker04"), "国军 04");
  assert.equal(all.get("EastIja5"), "日军", "只有一个无名日军：不带尾号");
  assert.equal(all.get("Mg"), "机枪"); assert.equal(all.get("Litter01"), "担架");
  const off = UnitLabelTexts(units, "off");
  assert.ok([...off.values()].every((t) => t === ""), "关：全空");
  assert.deepEqual(BLOCKOUT_LABEL_MODES, ["named", "all", "off"]);
  assert.equal(LabelMode(true), "named"); assert.equal(LabelMode(false), "off"); assert.equal(LabelMode("all"), "all"); assert.equal(LabelMode("nope", "all"), "all");
}

// --- 地标校验正反例 ---
{
  const ok = [{ id: "A", name: "狗洞", kind: "hole", x: 81.5, z: 488, w: 0.7, d: 0.45, h: 0.4 }, { id: "B", name: "主街", kind: "area", x: 100, z: 427, w: 6, d: 85 },
    { id: "C", name: "村南口", kind: "place", x: 98, z: 545, radiusM: 2.5, note: "出村" }];
  const errors = [];
  LandmarkIssues(ok, errors);
  assert.deepEqual(errors, []);
  const Bad = (list) => { const e = []; LandmarkIssues(list, e); return e; };
  assert.ok(Bad("x").length === 1, "不是数组");
  assert.ok(Bad([{ id: "A", name: "x", kind: "hole", x: 1, z: 2 }, { id: "A", name: "y", kind: "door", x: 1, z: 2 }]).some((e) => /重复/.test(e)), "id 重复");
  assert.ok(Bad([{ id: "A", name: "x", kind: "cave", x: 1, z: 2 }]).some((e) => /kind/.test(e)), "kind 不认识");
  assert.ok(Bad([{ id: "A", name: "", kind: "hole", x: 1, z: 2 }]).some((e) => /name/.test(e)), "name 空");
  assert.ok(Bad([{ id: "A", name: "x", kind: "hole", x: NaN, z: 2 }]).some((e) => /\.x/.test(e)), "x 不是数");
  assert.ok(Bad([{ id: "A", name: "x", kind: "hole", x: 1, z: 2, w: 1 }]).some((e) => /w \/ d/.test(e)), "w 没带 d");
  assert.ok(Bad([{ id: "A", name: "x", kind: "hole", x: 1, z: 2, w: 0, d: 1 }]).some((e) => /\.w/.test(e)), "w ≤ 0");
  assert.ok(Bad([{ id: "A", name: "x", kind: "hole", x: 1, z: 2, note: "n".repeat(100) }]).some((e) => /note/.test(e)), "note 太长");
  const n = NormalizeLandmarks([...ok, { id: "bad", kind: "hole" }, { id: "A", name: "重复的", kind: "door", x: 0, z: 0 }]);
  assert.equal(n.length, 3, "坏的 / 重复的跳过");
  assert.deepEqual(n[0], { id: "A", name: "狗洞", kind: "hole", x: 81.5, z: 488, y: null, w: 0.7, d: 0.45, h: 0.4, ry: 0, radiusM: null, note: "" });
  assert.equal(n[2].w, 0); assert.equal(n[2].radiusM, 2.5); assert.equal(n[2].note, "出村");
  // 场景校验器也认 landmarks
  const scene = JSON.parse(fs.readFileSync(new URL("./Blockout/FirstLevel0610.scene.json", import.meta.url), "utf8"));
  assert.ok(Array.isArray(scene.landmarks) && scene.landmarks.length >= 40, "0610 场景文件里有地标");
  assert.ok(ValidateBlockoutScene(scene).ok, "0610 场景文件过校验");
  assert.equal(NormalizeLandmarks(scene.landmarks).length, scene.landmarks.length, "0610 的地标归一化后一个不丢");
  assert.ok(!ValidateBlockoutScene({ ...scene, landmarks: [{ id: 1 }] }).ok, "坏地标让场景校验不过");
}

// --- 颜色不撞：七种地标色和敌 / 友 / 百姓 / 要点 / 下一步 / 危险都不一样 ---
{
  const taken = new Set(Object.values(BLOCKOUT_MARKER_COLORS).map((c) => c.toLowerCase()));
  for (const kind of BLOCKOUT_LANDMARK_KINDS) {
    const c = BLOCKOUT_LANDMARK_COLORS[kind];
    assert.ok(/^#[0-9a-f]{6}$/i.test(c), `${kind} 的颜色`);
    assert.ok(!taken.has(c.toLowerCase()), `${kind} 的颜色和人 / 要点的撞了`);
  }
  assert.ok(!taken.has(BLOCKOUT_STATION_DRAW.color.toLowerCase()) && !taken.has(BLOCKOUT_STATION_DRAW.currentColor.toLowerCase()), "站位的颜色不撞");
}

// --- 地标几何 ---
{
  const D = BLOCKOUT_LANDMARK_DRAW;
  const dog = LandmarkGeometry({ id: "A", name: "狗洞", kind: "hole", x: 81.5, z: 488, y: null, w: 0.7, d: 0.1, h: 0.4, ry: 0, radiusM: null }, 0.3);
  assert.ok(dog.box, "有尺寸就有线框");
  assert.ok(Math.abs(dog.box.w - (0.7 + 2 * D.padM)) < 1e-9, "线框比实物略大");
  assert.ok(Math.abs(dog.box.d - D.minSideM) < 1e-9, "0.1 m 的缝撑到最小厚度");
  assert.ok(dog.box.y0 < 0.3 && dog.box.y1 > 0.3 + 0.4, "线框从脚下包到顶");
  assert.ok(dog.pillarM >= D.pillarM && dog.labelY > 0.3 + dog.pillarM, "光柱高、标签挂在柱顶上");
  assert.equal(dog.color, BLOCKOUT_LANDMARK_COLORS.hole); assert.equal(dog.dashed, false);
  const xs = dog.box.corners.map((c) => c[0]), zs = dog.box.corners.map((c) => c[1]);
  assert.ok(Math.min(...xs) < 81.5 && Math.max(...xs) > 81.5 && Math.min(...zs) < 488 && Math.max(...zs) > 488, "角点围着中心");
  const pit = LandmarkGeometry({ id: "P", name: "窖", kind: "pit", x: 0, z: 0, y: -0.7, w: 1.6, d: 1.6, h: 2, ry: 0, radiusM: null }, 0.3);
  assert.ok(Math.abs(pit.box.y0 - (-1.7 - D.padM / 2)) < 1e-9, "显式 y：线框底 = y − h/2");
  assert.ok(pit.box.y1 > 0.3, "窖的线框顶出地面");
  const rot = LandmarkGeometry({ id: "R", name: "车", kind: "prop", x: 10, z: 10, y: null, w: 2, d: 1, h: 1, ry: Math.PI / 2, radiusM: null }, 0);
  const rx = rot.box.corners.map((c) => c[0]), rz = rot.box.corners.map((c) => c[1]);
  assert.ok(Math.max(...rz) - Math.min(...rz) > Math.max(...rx) - Math.min(...rx), "ry 转了 90°：长边沿 z");
  const area = LandmarkGeometry({ id: "S", name: "主街", kind: "area", x: 100, z: 427, y: null, w: 6, d: 85, h: 0, ry: 0, radiusM: null }, 0);
  assert.ok(area.dashed && area.box && area.pillarM === D.areaPillarM, "片区：虚线、光柱矮");
  const ring = LandmarkGeometry({ id: "G", name: "干沟", kind: "area", x: 56, z: 152, y: null, w: 0, d: 0, h: 0, ry: 0, radiusM: 9 }, 0);
  assert.ok(!ring.box && ring.ring && ring.ring.r === 9, "半径：地环、没有线框");
  const place = LandmarkGeometry({ id: "V", name: "村南口", kind: "place", x: 98, z: 545, y: null, w: 0, d: 0, h: 0, ry: 0, radiusM: null }, 0);
  assert.ok(place.ring && place.ring.r === D.placeRingM && !place.dashed, "地名：脚下一个小地环");
}

// --- 站位标签 ---
assert.equal(StationLabel({ id: "08-3", name: "压窗口" }), "08-3 压窗口");
assert.equal(StationLabel({ id: "08-3", name: "" }), "08-3");
assert.equal(StationLabel({ id: "08-3" }), "08-3");

// --- 开关状态 ---
{
  assert.deepEqual(BLOCKOUT_LAYER_DEFAULTS, { arcs: "default", intents: true, labels: "named", xray: true, landmarks: true, stations: true });
  assert.deepEqual(NormalizeLayers({ labels: "all", landmarks: 0, stations: "yes", arcs: true, bogus: 1 }), { arcs: "default", intents: true, labels: "all", xray: true, landmarks: false, stations: true });
  assert.deepEqual(NormalizeLayers({ labels: true }, { ...BLOCKOUT_LAYER_DEFAULTS, labels: "off" }).labels, "named");
  assert.deepEqual(NormalizeLayers({ labels: "nope" }, { ...BLOCKOUT_LAYER_DEFAULTS, labels: "off" }).labels, "off", "不认识的档位留原样");
  const text = SerializeLayers({ arcs: "all", intents: false, labels: "off", xray: false, landmarks: false, stations: true, extra: 1 });
  assert.deepEqual(JSON.parse(text), { arcs: "all", intents: false, labels: "off", xray: false, landmarks: false, stations: true });
  assert.deepEqual(ParseStoredLayers(text), { arcs: "all", intents: false, labels: "off", xray: false, landmarks: false, stations: true });
  assert.deepEqual(ParseStoredLayers(null), BLOCKOUT_LAYER_DEFAULTS);
  assert.deepEqual(ParseStoredLayers("{not json"), BLOCKOUT_LAYER_DEFAULTS);
  assert.deepEqual(ParseStoredLayers("[1,2]"), BLOCKOUT_LAYER_DEFAULTS);
  assert.deepEqual(ParseStoredLayers(JSON.stringify({ labels: true, landmarks: false })), { ...BLOCKOUT_LAYER_DEFAULTS, labels: "named", landmarks: false }, "旧格式的布尔标签也认");
}

console.log("ok：兜底文字 / 地标校验与几何 / 站位标签 / 开关状态");
