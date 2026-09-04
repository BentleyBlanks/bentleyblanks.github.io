// P012-only temporary cast identification; these are not historical uniform colours.
// Clone only the GLB uniform material (hands, heads, badges and mounted weapons
// use separate materials). No source asset, shared material or geometry is edited.
// Main opts in after the real companion roster is created. Actor disposal owns
// the private clones; textures remain asset-library owned and are never disposed.
export const P012_CAST_CLOTH_COLORS = Object.freeze({
  luo: 0xe8bd38,
  yaowa: 0x39bb85,
  zhaodegui: 0xb376dc,
  heyoutian: 0xe88136,
  liuwencai: 0x9ae2e2,
});
export const P012_UNIFORM_MATERIAL_NAME = "Material #1721585337";

export function ApplyP012CastAppearance(soldier, materialLibrary) {
  const color = P012_CAST_CLOTH_COLORS[soldier?.castId];
  const actor = soldier?.actor;
  if (color === undefined || !actor?.characterRig?.root || actor.p012ClothColor !== undefined) return false;
  const clones = new Map();
  actor.characterRig.root.traverse((object) => {
    // Weapons are mounted below the rig too; only original GLB body surfaces qualify.
    if (!object.isMesh || !object.userData.characterPbrSurface) return;
    const Replace = (material) => {
      if (material?.name !== P012_UNIFORM_MATERIAL_NAME) return material;
      if (!clones.has(material)) {
        // Material.clone JSON-copies userData, which here contains live GI/SSAO
        // uniforms. Copy PBR properties without serializing those shared buffers;
        // the library below attaches the current lighting uniforms to this clone.
        const clone = new material.constructor().copy({ ...material, userData: {} });
        clone.name = `P012Cloth_${soldier.castId}`;
        // A plain colour is deliberate whitebox identification, not a dark tint
        // multiplied by the original blue albedo. Preserve normal/roughness relief.
        clone.map = null;
        clone.color.setHex(color);
        materialLibrary?.ConfigureExternalPbr?.(clone, { metalness: 0, minRoughness: 0.58 });
        clone.needsUpdate = true;
        clones.set(material, clone);
      }
      return clones.get(material);
    };
    object.material = Array.isArray(object.material) ? object.material.map(Replace) : Replace(object.material);
  });
  if (!clones.size) return false;
  actor.p012ClothColor = color;
  const dispose = actor.Dispose;
  actor.Dispose = function DisposeP012CastAppearance(...args) {
    for (const material of clones.values()) material.dispose();
    clones.clear();
    return dispose.apply(this, args);
  };
  return true;
}
