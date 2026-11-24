// Scene-preview dressing. Positions and headings come from editable scene markers.
import * as THREE from "three";
import { CreateLugouCharacterRig, LoadLugouPoseAssets, ResolveLugouPlaybackClipId } from "./Script_CharacterModel.mjs";
import { CareClipLayer, LoadCollectionCareAnimation, WrapLimb } from "./Script_CollectionCareAnimation.mjs";
import { CloneShadedMaterial } from "./Script_Materials.mjs";
import { ApplyNraUniform } from "./Script_UniformColors.mjs";

const FIGURES = [
  { id: "WoundedPosition", variant: 1, height: 1.73, color: 0x585247, care: "CareLieTreated", time: .62 },
  { id: "AidPosition", variant: 4, height: 1.81, color: 0x625a4d, care: "CareMedicPress", time: .74 },
  { id: "ForwardLookout", variant: 1, height: 1.68, color: 0x635749, clip: "CrouchIdle", time: .16 },
  { id: "ForwardLookoutRight", variant: 4, height: 1.67, color: 0x504d46, clip: "CrouchIdle", time: .42 },
  { id: "FieldSoldierLeft", variant: 1, height: 1.66, color: 0x645a4d, clip: "CrouchIdle", time: .58 },
  { id: "FieldSoldierCenter", variant: 4, height: 1.69, color: 0x574f46, clip: "CrouchIdle", time: .14 },
  { id: "FieldSoldierRight", variant: 1, height: 1.70, color: 0x59534a, clip: "CrouchIdle", time: .32 },
];

function DressPatientHead(rig) {
  const { head, neck } = rig.bones;
  const center = rig.hitboxNodes.headCenter;
  if (!head || !neck || !center) return null;
  const towardNeck = head.worldToLocal(neck.getWorldPosition(new THREE.Vector3()));
  const wrap = WrapLimb({ bones: { head, wrapAxis: { position: towardNeck } } }, "head", "wrapAxis",
    { at: 0, radiusM: .103, lengthM: .052 });
  if (!wrap) return null;
  const scale = head.getWorldScale(new THREE.Vector3()).x;
  wrap.position.copy(head.worldToLocal(center.getWorldPosition(new THREE.Vector3())));
  wrap.position.addScaledVector(towardNeck.normalize(), -.026 / scale);
  return wrap;
}

export async function BuildEastTrackFigures(host, landmarks) {
  const staged = FIGURES.flatMap(figure => {
    const marker = landmarks?.find(entry => entry.id === figure.id);
    return marker ? [{ figure, marker }] : [];
  });
  const [bodies, care] = await Promise.all([
    LoadLugouPoseAssets("nra", staged.map(({ figure }) => figure.variant)),
    LoadCollectionCareAnimation(),
  ]);
  const root = new THREE.Group();
  root.name = "EastTrackFigures";
  const entries = [];
  const linenMaterials = new Map();
  function ShadeLinen(material) {
    if (material?.name !== "Material #1721585343") return material;
    if (!linenMaterials.has(material)) {
      const linen = CloneShadedMaterial(material);
      linen.color.multiply(new THREE.Color().setRGB(.57,.42,.29));
      linenMaterials.set(material, linen);
    }
    return linenMaterials.get(material);
  }
  function Dispose() {
    for (const { rig, layer, wrap } of entries) {
      wrap?.geometry.dispose();
      layer?.Restore();
      rig.Dispose();
    }
    for (const material of linenMaterials.values()) material.dispose();
    root.removeFromParent();
  }
  try {
    for (const { figure, marker } of staged) {
      const rig = CreateLugouCharacterRig(bodies, "nra",
        { modelVariant: figure.variant, facial: false, seed: figure.variant }, figure.height, host.library);
      if (!rig) throw new Error(`No body for ${figure.id}`);
      const holder = new THREE.Group();
      holder.name = figure.id;
      holder.position.set(marker.x, marker.y ?? host.battlefield.StaticGroundHeight(marker.x, marker.z), marker.z);
      holder.rotation.y = marker.ry || 0;
      holder.add(rig.root);
      root.add(holder);
      const entry = { id: figure.id, rig, layer: null };
      entries.push(entry);
      ApplyNraUniform(rig.root, figure.color);
      rig.root.traverse(node => {
        if (node.isMesh) node.material = Array.isArray(node.material)
          ? node.material.map(ShadeLinen) : ShadeLinen(node.material);
      });
      if (figure.care) {
        entry.layer = new CareClipLayer({ characterRig: rig }, care.record, care.config);
        entry.layer.Play(figure.care, 0, figure.time);
        if (!entry.layer.Apply()) throw new Error(`No care pose for ${figure.id}`);
      } else {
        if (!rig.clipById.has(ResolveLugouPlaybackClipId(figure.clip))) throw new Error(`No pose for ${figure.id}`);
        rig.Play(figure.clip, 0);
        rig.mixer.setTime(figure.time);
        const sole = new THREE.Box3().setFromObject(holder, true).min.y;
        if (Number.isFinite(sole)) holder.position.y += holder.position.y - sole;
      }
      if (figure.id === "WoundedPosition") entry.wrap = DressPatientHead(rig);
    }
  } catch (error) {
    Dispose();
    throw error;
  }
  root.updateMatrixWorld(true);
  return { ids: entries.map(entry => entry.id), root, Dispose };
}
