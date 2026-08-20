import assert from "node:assert/strict";
import { CONTROL_GUIDE } from "./Script_Input.mjs";
import { ContextualActionPrompts } from "./Script_Hud.mjs";
import { InteractSystem } from "./Script_Interact.mjs";

const guideText = CONTROL_GUIDE.flatMap((group) => group.rows)
  .map((row) => `${row.keys} ${row.label}`).join("\n");
assert.match(guideText, /1 \/ 2 \/ 3 \/ 4/);
assert.match(guideText, /F 拾枪、换枪/);
assert.match(guideText, /B 有绷带且流血时包扎止血/);

assert.deepEqual(ContextualActionPrompts(), []);
assert.deepEqual(ContextualActionPrompts({ bleeding: 1, bandages: 0 }), []);
assert.deepEqual(ContextualActionPrompts({ bleeding: 0, bandages: 2 }), []);

const bandageOnly = ContextualActionPrompts({ bleeding: 0.2, bandages: 1 });
assert.deepEqual(bandageOnly.map((prompt) => prompt.kind), ["bandage"]);
assert.equal(bandageOnly[0].keys, "B");

const oneGun = ContextualActionPrompts({ slots: { primary: "HanYang", secondary: null } });
assert.equal(oneGun.some((prompt) => prompt.kind === "switchWeapon"), false);
const twoGuns = ContextualActionPrompts({
  slots: { primary: "HanYang", secondary: "Mauser96" },
});
assert.deepEqual(twoGuns[0], {
  keys: "1 / 2", label: "切换长枪 / 短枪", kind: "switchWeapon",
});

const soldier = {
  alive: false,
  position: { x: 1, z: 0 },
  drop: { weaponId: "Type38", clips: 0, taken: false },
};
const player = { Alive: true, position: { x: 0, z: 0 } };
const system = new InteractSystem({ ai: { soldiers: [soldier] } }, {
  HasPrimary: () => false,
});
assert.match(system.Query(player).label, /^拾起 /);
system.hooks.HasPrimary = () => true;
const swap = system.Query(player);
assert.match(swap.label, /^换上 /);

const stacked = ContextualActionPrompts({
  interaction: swap,
  bleeding: 0.5,
  bandages: 2,
  slots: { primary: "HanYang", secondary: "Mauser96" },
});
assert.deepEqual(stacked.map((prompt) => prompt.kind), ["pickup", "bandage", "switchWeapon"]);

console.log("ok  操作说明与情境 HUD 提示条件通过");
