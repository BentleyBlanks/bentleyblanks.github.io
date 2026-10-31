// Script_SceneEditModelTest.mjs —— 场景编辑器数据层（Script_SceneEditModel）的 node 回归
// 跑法：node Taierzhuang1938/Script_SceneEditModelTest.mjs
// 查：移动 / 转 / 改字段 / 落地开关记到厘米与 0.01°；加、复制插在同组后面、id 不重名；删、改名、撤销 / 重做把文件顺序原样放回；
// 「有没保存的改动」按步编号判（撤销再改不会误判成已保存）；在真场景 FirstLevelWhitebox 上走一圈改动后撤到底与原文逐字相同、仍过校验。

import assert from "node:assert/strict";
import { SceneEditModel } from "./Script_SceneEditModel.mjs";
import { ReadSceneSync } from "./Script_SceneNode.mjs";

let checks = 0;
const Check = (ok, what) => { assert.ok(ok, what); checks++; };
const J = (v) => JSON.stringify(v);

const base = {
  schema: "tengxian-scene/1", id: "T", title: "测试", bounds: { minX: -10, maxX: 10, minZ: -10, maxZ: 10 }, spawn: { x: 0, z: 0 },
  terrain: { file: "x.bin", encoding: "int16-cm-le", minX: -10, minZ: -10, cellM: 1, cols: 20, rows: 20 },
  objects: [
    { id: "A_01", asset: "Whitebox/Box", material: "Whitebox/Timber", pos: [0, null, 0], size: [1, 2, 3], group: "G1" },
    { id: "B", asset: "Whitebox/Box", material: "Whitebox/Plaster", pos: [5, 1, 5], yawDeg: 30, size: [2, 2, 2], group: "G2" },
    { id: "C", asset: "Whitebox/Box", material: "Whitebox/Roof", pos: [-5, null, -5], size: [1, 1, 1], group: "G1" },
  ],
};

const m = new SceneEditModel(base);
Check(!m.dirty && m.Validate().ok, "读进来：没改动、过校验");
Check(J([...m.Groups().keys()]) === J(["G1", "G2"]) && J(m.Groups().get("G1")) === J(["A_01", "C"]), "层级按组、组里按文件顺序");

// 移动：落地的竖直挪动要用 groundY，挪完就不落地
m.MoveBy(["A_01"], 1.234, 0, -0.5);
Check(J(m.Find("A_01").pos) === J([1.23, null, -0.5]), `水平移动记到厘米、y 还是 null：${J(m.Find("A_01").pos)}`);
m.MoveBy(["A_01"], 0, 0.3, 0, { groundY: () => 2 });
Check(m.Find("A_01").pos[1] === 2.3, "竖直挪落地的物件：从此刻的地面高算起");
Check(m.dirty && m.undo.length === 2, "两步改动");

// 旋转：单个绕自己，多个绕 pivot；转回 0 删掉 yawDeg
m.RotateBy(["B"], -30);
Check(m.Find("B").yawDeg === undefined, "转回 0°：不留 yawDeg 字段");
m.RotateBy(["B", "C"], 90, { x: 0, z: 0 });
Check(J(m.Find("B").pos) === J([5, 1, -5]) && m.Find("B").yawDeg === 90, `绕 pivot 转 90°（three rotation.y 的号）：${J(m.Find("B").pos)}`);

// 改字段
m.SetField(["C"], "size", [0.001, 1.2345, 3]);
Check(J(m.Find("C").size) === J([0.02, 1.23, 3]), "尺寸记到厘米、不小于 2 cm");
m.SetField(["C"], "yawDeg", 370);
Check(m.Find("C").yawDeg === 10, "朝向折回 −180…180");
m.SetField(["C"], "solid", false);
m.SetField(["C"], "solid", undefined);
Check(!("solid" in m.Find("C")), "值给 undefined = 删掉字段");
m.SetGrounded(["B"], true);
Check(m.Find("B").pos[1] === null, "落地开关：y 写 null");
m.SetGrounded(["B"], false, () => 0.456);
Check(m.Find("B").pos[1] === 0.46, "取消落地：y 写成此刻地面高");

// 加 / 复制：插在同组最后、id 不重名
const added = m.Add("Whitebox/Box", { pos: [1, null, 1], material: "Whitebox/Cover", group: "G1" });
Check(added === "Box" && m.objects.findIndex(o => o.id === "Box") === 3, `加的物件插在同组最后一个后面：${m.objects.map(o => o.id)}`);
const dup = m.Duplicate(["A_01"]);
Check(J(dup) === J(["A_02"]) && J(m.Find("A_02").pos) === J([2.23, 2.3, 0.5]), `复制：编号往上数、挪 (1,0,1)：${J(dup)} ${J(m.Find("A_02")?.pos)}`);
Check(J([...m.selection]) === J(["A_02"]), "复制完选中复制出来的");
Check(m.Validate().ok, "改了一圈仍过校验");

// 改名 / 删除 / 撤销顺序
const order = m.objects.map(o => o.id);
m.Rename("C", "Chimney");
Check(m.Find("Chimney") && !m.Find("C"), "改名");
assert.throws(() => m.Rename("Chimney", "B"), /已经有了/);
assert.throws(() => m.Rename("Chimney", "坏 名字"), /名字只能/);
m.Delete(["A_01", "B"]);
Check(!m.Find("A_01") && !m.Find("B"), "删两个");
m.Undo();
m.Undo();
Check(J(m.objects.map(o => o.id)) === J(order), `撤销删除与改名：顺序原样回来 ${m.objects.map(o => o.id)}`);
m.Redo();
Check(m.Find("Chimney"), "重做改名");

// 有没保存的改动：按步编号判
m.MarkSaved();
Check(!m.dirty, "存盘后没改动");
m.Undo();
Check(m.dirty, "撤销一步：和盘上不一样了");
m.SetField(["A_01"], "group", "G3");
Check(m.dirty && m.redo.length === 0, "撤销后再改：仍算没保存（不会撞上存盘时的编号），重做栈清空");

// 真场景：走一圈改动后撤到底与原文逐字相同
const { doc } = ReadSceneSync("FirstLevelWhitebox");
const real = new SceneEditModel(doc);
const ids = real.objects.slice(0, 40).map(o => o.id);
real.MoveBy(ids, 3, 0, -2);
real.RotateBy(ids.slice(0, 10), 45, { x: 0, z: 0 });
real.Duplicate(ids.slice(5, 9));
real.Delete(ids.slice(20, 30));
real.SetField(ids.slice(30), "group", "测试组");
real.Rename(ids[0], `${ids[0]}_Renamed`);
Check(real.Validate().ok, "真场景改一圈仍过校验");
while (real.Undo());
Check(J(real.ToDoc()) === J(doc) && !real.dirty, "真场景撤到底：和原文逐字相同、没改动");

console.log(`场景编辑数据层测试全过（${checks} 项）`);
