// Data_FirstLevelP012Cast.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

import { P012_COMPANION_CAST } from "./Data_FirstLevelP012Cast.mjs";

/** Merge incidental identity fields first so random age/name cannot replace casting. */
export function SelectP012CompanionCast(castId, baseIdentity = {}) {
  const spec = Object.hasOwn(P012_COMPANION_CAST, castId) ? P012_COMPANION_CAST[castId] : null;
  if (!spec) return null;
  return {
    actorKind: "nra",
    modelVariant: spec.modelVariant,
    identity: { ...baseIdentity, castId, name: spec.name, fullName: spec.fullName, age: spec.age },
  };
}

/** Unnamed recruits in the same marching squad also use the younger cast pool. */
export function SelectP012RecruitCast(slot, baseIdentity = {}) {
  const index=Math.abs(Math.trunc(slot)||0);
  return {actorKind:"nra",modelVariant:1,identity:{...baseIdentity,age:18+index%6}};
}
