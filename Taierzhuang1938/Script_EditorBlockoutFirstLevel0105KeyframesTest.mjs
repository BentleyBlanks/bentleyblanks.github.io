// Script_EditorBlockoutFirstLevel0105KeyframesTest.mjs —— 01–05 白盒关键帧生成器的 node 回归（只给关键帧包自验用）
// 跑法：node Taierzhuang1938/Script_EditorBlockoutFirstLevel0105KeyframesTest.mjs
// 查：生成两次除 generatedAt 外逐字相同、过 ValidateBlockout 且无警告、摆位 / 走位问题为零（有场景文件时连实心块与高差一起查）、
// 拍号齐全、玩家点在场地内、next 不出现「掩护 / 清理 / 护送」、命名人物 id 稳定、与 Blockout/FirstLevel0105.json 一致（没手改时）。

import assert from "node:assert/strict";
import fs from "node:fs";
import { ValidateBlockout } from "./Script_EditorBlockoutConfig.mjs";
import { BuildFirstLevel0105Config, TrenchRoute } from "./Script_EditorBlockoutFirstLevel0105Keyframes.mjs";
import { L0105_BOUNDS as B, L0105_PLACES as P } from "./Data_EditorBlockoutFirstLevel0105Space.mjs";

const issues = [];
const a = await BuildFirstLevel0105Config({ commit: "test", generatedAt: "A", issues });
const b = await BuildFirstLevel0105Config({ commit: "test", generatedAt: "B" });
const Strip = (doc) => JSON.stringify({ ...doc, source: { ...doc.source, generatedAt: "" } });
assert.equal(Strip(a), Strip(b), "生成两次（除 generatedAt）要逐字相同");

const check = ValidateBlockout(a);
assert.ok(check.ok, check.errors.join("; "));
assert.deepEqual(check.warnings, [], "不该有校验警告");
assert.deepEqual(issues, [], `摆位 / 走位问题：\n  ${issues.join("\n  ")}`);

const ids = a.keyframes.map((k) => k.id);
for (const id of ["01-1", "01-2", "01-3", "01-4", "02-1", "02-2", "02-3", "02-4", "02-5", "02-6", "02-7", "02E-1", "02E-2",
  "03-1", "03-2", "03-3", "03-4", "03-5", "04-1", "04-2", "04-3", "05-1", "05-2", "05-3", "05-4"]) assert.ok(ids.includes(id), `缺关键帧 ${id}`);
for (const kf of a.keyframes) {
  assert.ok(kf.player.x >= B.minX && kf.player.x <= B.maxX && kf.player.z >= B.minZ && kf.player.z <= B.maxZ, `${kf.id} 玩家出界`);
  assert.ok(!/掩护|清理|护送/.test(kf.next?.text || ""), `${kf.id} next 用了禁词：${kf.next?.text}`);
  if (kf.stageLabel) assert.equal(kf.stage, 2, "02末 的 stage 用 2");
}
const luo = a.keyframes.filter((k) => k.units.some((u) => u.id === "Luo")).length;
assert.ok(luo >= 23, `罗班长应当几乎每帧都在（现在 ${luo} 帧）`);
const blanket = a.keyframes.filter((k) => k.units.some((u) => u.id === "Blanket" && u.kind === "litter"));
assert.ok(blanket.length >= 7 && blanket.every((k) => k.units.some((u) => u.id === "Donggua" && u.state === "down")), "单被那几帧冬瓜都躺在上面");

// 壕沟网走位：洞口到坑必须经支沟口、沟口（不直线翻野地）
const route = TrenchRoute(P.dugoutMouth, P.pit);
assert.ok(route.some((p) => Math.hypot(p.x - P.branchMouth.x, p.z - P.branchMouth.z) < 0.5), "洞口→坑要经过支沟口");
assert.ok(route.some((p) => Math.hypot(p.x - P.mouth.x, p.z - P.mouth.z) < 0.5), "洞口→坑要经过沟口");

const file = new URL("./Blockout/FirstLevel0105.json", import.meta.url);
if (fs.existsSync(file)) {
  const onDisk = JSON.parse(fs.readFileSync(file, "utf8"));
  if (Strip({ ...onDisk, source: { ...onDisk.source, commit: "test" } }) !== Strip(a)) console.log("提示：Blockout/FirstLevel0105.json 与生成器输出不同（手改过，或没重新 export）");
}
console.log(`FirstLevel0105 关键帧：${a.keyframes.length} 帧、${a.keyframes.reduce((s, k) => s + k.units.length, 0)} 个单位位次，校验与摆位全过`);
