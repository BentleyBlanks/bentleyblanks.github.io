// P012 fictional whitebox casting, not historical-person age claims.
// Named companions keep a stable face independent of spawn order/random identity.
// NRA 02/04 are younger-looking source candidates; 01 retains the leader's beard.
// These are whole existing GLB variants, not age morphs or altered source assets.
// Only the P012 host should apply this selection; other chapters stay unchanged.

export const P012_COMPANION_CAST = Object.freeze({
  luo: Object.freeze({ name: "罗班长", fullName: "罗茂才", age: 32, modelVariant: 0 }),
  yaowa: Object.freeze({ name: "幺娃", fullName: "幺娃", age: 18, modelVariant: 1 }),
  heyoutian: Object.freeze({ name: "何有田", fullName: "何有田", age: 21, modelVariant: 3 }),
  liuwencai: Object.freeze({ name: "刘文财", fullName: "刘文财", age: 20, modelVariant: 1 }),
  zhaodegui: Object.freeze({ name: "赵德贵", fullName: "赵德贵", age: 23, modelVariant: 3 }),
  xiaoqin: Object.freeze({ name: "小秦", fullName: "小秦", age: 19, modelVariant: 1 }),
});

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
