// Pure Node P012 fictional casting contract; no renderer or asset mutation.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { COMPANION_CAST } from "./Script_Companion.mjs";
import { P012_COMPANION_CAST, SelectP012CompanionCast } from "./Data_FirstLevelP012Cast.mjs";

const ids = ["luo", "yaowa", "heyoutian", "liuwencai", "zhaodegui", "xiaoqin"];
const manifest = JSON.parse(readFileSync(new URL("./Model/Character/Data_LugouCharacterManifest.json", import.meta.url), "utf8"));
assert.deepEqual(Object.keys(P012_COMPANION_CAST), ids);
assert.ok(Object.isFrozen(P012_COMPANION_CAST));
for (const castId of ids) {
  const spec = P012_COMPANION_CAST[castId];
  assert.ok(Object.isFrozen(spec));
  assert.equal(spec.name, COMPANION_CAST[castId].label);
  assert.ok(spec.fullName.trim().length >= 2, `${castId} has a complete established name or alias`);
  if (castId !== "luo") {
    assert.ok(spec.age >= 18 && spec.age <= 23 && spec.age < P012_COMPANION_CAST.luo.age);
    assert.ok([1, 3].includes(spec.modelVariant), "younger companions use NRA 02/04");
  }
  assert.ok(Number.isInteger(spec.modelVariant) && spec.modelVariant >= 0 && spec.modelVariant < 4,
    "ordinary soldiers cannot use officer model 05");
  const modelId = `LugouNra${String(spec.modelVariant + 1).padStart(2, "0")}`;
  assert.ok(manifest.models.some(model => model.id === modelId && model.faction === "nra"));
  const base = { name: "随机姓名", fullName: "错误姓名", age: 99, origin: "四川", weapon: "HanYang" };
  const selected = SelectP012CompanionCast(castId, base);
  assert.equal(selected.actorKind, "nra");
  assert.equal(selected.modelVariant, spec.modelVariant);
  assert.deepEqual(selected.identity, { ...base, castId, name: spec.name, fullName: spec.fullName, age: spec.age });
  assert.equal(base.age, 99, "selection does not mutate the caller's identity");
  selected.identity.age = 1;
  assert.equal(SelectP012CompanionCast(castId, { age: 80 }).identity.age, spec.age);
}
for (const unknown of ["shunzi", "paizhang", "toString", "__proto__", "", null]) {
  assert.equal(SelectP012CompanionCast(unknown), null, "non-P012-squad identities are not recast");
}
assert.equal(P012_COMPANION_CAST.luo.modelVariant, 0);
assert.ok(P012_COMPANION_CAST.yaowa.age < P012_COMPANION_CAST.xiaoqin.age);
console.log("FirstLevelP012CastTest: PASS (six stable identities, younger companion faces, NRA soldier roles, no random override)");
