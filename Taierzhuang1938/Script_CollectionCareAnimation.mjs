// 06 背坡伤员集结处的救护动作层与布条挂件（docs/Data_CollectionCare20260927.md）。
//
//   · 动作库：Animation/CollectionCare（_import/Script_CollectionCareBake.py 在 Blender 里烘，逐骨 glTF 节点局部
//     变换，stride 7）。只烘了 TengxianNra02 一具；所有国军身体都是同一副 TengxianHumanoidV1 骨架，同一份记录
//     按骨名（小写去标点）绑到任何一具 NRA 身上。开机不加载：集结处 02 摆位时才取。
//   · 播放层：CareClipLayer 挂在 rig.authoredPose 上。LugouCharacterRig.Update 开头 Restore（mixer 采样之前把上一帧
//     写过的骨头逐比特还原）、末尾 Apply（说话人头部层与面部之前 —— 老周说话时头照样转向玩家、嘴照样动）。
//     采样与交叉淡入借 Script_CutscenePerformance 的 CutscenePerformer：按 (clock − t0) 定位，不累计 dt。
//   · 布条挂件：绷带（白布带血迹）与红十字袖标是挂在肢体骨上的一圈开口圆筒，一张画布贴图、一只材质全场共用。
import * as THREE from "three";
import { CutscenePerformer } from "./Script_CutscenePerformance.mjs";
import { COLLECTION_CARE_ANIMATION as A } from "./Data_FirstLevelCollectionCare.mjs";

let library = null, pending = null;

async function FetchJson(file, version) {
  const response = await fetch(A.base + file + "?v=" + version);
  if (!response.ok) throw Error(`Collection care animation ${file}: ${response.status}`);
  return response.json();
}

/** 取清单与动作记录（一次，所有调用方共用一个 promise；失败可以重试）。 */
export function LoadCollectionCareAnimation(read = FetchJson) {
  return pending ||= (async () => {
    const config = await read(A.manifest, A.version);
    if (config.version !== A.version) console.warn(`[CollectionCare] manifest ${config.version} != ${A.version}`);
    const row = config.models?.[0];
    if (!row) throw Error("Collection care animation: no model row");
    const record = await read(row.file, row.sha256 || A.version);
    return library = { config, record };
  })().catch((error) => { pending = null; throw error; });
}

/** 已加载的库（没加载完是 null）。 */
export function CollectionCareLibrary() { return library; }

/** 这条动作的时长（秒）；库没到或没有这条返回 0。 */
export function CareClipDuration(clipId) { return library?.record.clips[clipId]?.duration || 0; }

/**
 * 一具人身上的作者动作层。clock 由调用方在 actor.Update 之前写（任务时间，秒）；Play 换动作时与上一条做
 * 清单给的 blendSeconds 交叉淡入。
 */
export class CareClipLayer {
  constructor(actor, record, config) {
    this.performer = new CutscenePerformer(actor, record, config);
    this.clip = null; this.t0 = 0; this.phase = 0; this.previous = null; this.clock = 0;
  }
  Play(clipId, time, phase = 0) {
    if (this.clip === clipId) return;
    this.previous = this.clip ? { clipId: this.clip, t0: this.t0, speed: 0, phase: this.phase } : null;
    this.clip = clipId; this.t0 = time; this.phase = phase;
  }
  /** 这条动作从起播到现在的秒数。 */
  Elapsed() { return this.clock - this.t0; }
  Restore() { this.performer.Restore(); }
  Apply() {
    if (!this.clip) return false;
    return this.performer.Apply({ clipId: this.clip, t0: this.t0, speed: 0, phase: this.phase, previous: this.previous }, this.clock);
  }
}

/** 给这具人装动作层（库没到返回 null，调用方先走原来的程序化姿态）。 */
export function InstallCareClips(actor) {
  const rig = actor?.characterRig;
  if (!rig || !library) return null;
  if (rig.authoredPose instanceof CareClipLayer) return rig.authoredPose;
  try {
    return rig.authoredPose = new CareClipLayer(actor, library.record, library.config);
  } catch (error) {
    console.warn(`[CollectionCare] cannot bind ${rig.modelId}: ${String(error).slice(0, 160)}`);
    return null;
  }
}

/** 卸下动作层（人要回到普通姿态时），把骨头还原。 */
export function RemoveCareClips(actor) {
  const rig = actor?.characterRig;
  if (!(rig?.authoredPose instanceof CareClipLayer)) return;
  rig.authoredPose.Restore();
  rig.authoredPose = null;
}

// ---------------------------------------------------------------------------
// 布条挂件
// ---------------------------------------------------------------------------
const clothMaterials = new Map();
function ClothTexture(kind) {
  const canvas = document.createElement("canvas");
  canvas.width = 128; canvas.height = 64;
  const g = canvas.getContext("2d");
  // 旧白布：米白底、几道织纹与脏印。
  g.fillStyle = kind === "armband" ? "#e4e0d4" : "#ddd6c4";
  g.fillRect(0, 0, 128, 64);
  g.globalAlpha = 0.18; g.fillStyle = "#6d5d45";
  for (let i = 0; i < 9; i++) g.fillRect(0, i * 7 + 2, 128, 1);
  g.globalAlpha = 1;
  if (kind === "armband") {
    // 红十字：圆筒一圈贴两次，外侧总能看到一个。
    g.fillStyle = "#b3161b";
    for (const cx of [32, 96]) { g.fillRect(cx - 5, 14, 10, 36); g.fillRect(cx - 18, 27, 36, 10); }
  } else {
    // 血渗出来的一片：深红心、褐边。
    const blot = (x, y, r) => {
      const grad = g.createRadialGradient(x, y, 2, x, y, r);
      grad.addColorStop(0, "rgba(96,10,12,0.95)"); grad.addColorStop(0.6, "rgba(122,24,20,0.75)");
      grad.addColorStop(1, "rgba(122,60,40,0)");
      g.fillStyle = grad; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    };
    blot(40, 34, 24); blot(58, 26, 14); blot(104, 40, 12);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}
function ClothMaterial(kind) {
  let material = clothMaterials.get(kind);
  if (!material) {
    material = new THREE.MeshStandardMaterial({ map: ClothTexture(kind), roughness: 0.95, metalness: 0 });
    material.name = kind === "armband" ? "CollectionCareArmband" : "CollectionCareBandage";
    clothMaterials.set(kind, material);
  }
  return material;
}
const clothGeometries = new Map();
/** 开口圆筒；+Y 端半径 radiusTop、−Y 端半径 radiusBottom（默认都是 1，由 mesh.scale 定粗细）。 */
function ClothGeometry(length, radiusTop = 1, radiusBottom = 1) {
  const key = [length, radiusTop, radiusBottom].map((n) => n.toFixed(4)).join("/");
  let geometry = clothGeometries.get(key);
  if (!geometry) clothGeometries.set(key, geometry = new THREE.CylinderGeometry(radiusTop, radiusBottom, length, 14, 1, true));
  return geometry;
}

/**
 * 这根肢体在几个位置 `ats`（沿骨的比例）处的袖筒横截面（骨局部单位、绑定姿态）：圈心（含沿骨的分量）与外接半径。
 * 骨轴是骨点到子骨点的连线，不一定穿过袖子的中心 —— 灰军装的袖筒是一只比手臂大一圈的宽袖，
 * 垂在骨轴下方 6–8 cm 且与骨轴斜着，袖标按骨轴居中就缩在袖子里、只露出一角。做法：用垂直骨轴、过 at 的平面去切
 * 权重主要落在这根骨上的三角形，切出的点就是袖面的一圈（顶点稀疏，直接取顶点会漏掉整圈）。
 * 离骨轴不到 LIMB_SECTION_CORE 的点是袖筒里贴着骨轴的细柱，不是袖面，丢掉。某个位置切不到就是 null。
 */
const LIMB_SECTION_CORE = 0.055;
function LimbSections(rig, bone, axis, lengthLocal, ats) {
  const root = rig?.root;
  if (!root) return ats.map(() => null);
  const matrix = new THREE.Matrix4(), point = new THREE.Vector3(), perpA = new THREE.Vector3(), perpB = new THREE.Vector3();
  perpA.set(1, 0, 0); if (Math.abs(axis.x) > 0.9) perpA.set(0, 0, 1);
  perpA.addScaledVector(axis, -perpA.dot(axis)).normalize();
  perpB.crossVectors(axis, perpA);
  const rings = ats.map(() => []);
  root.traverse((mesh) => {
    if (!mesh.isSkinnedMesh) return;
    const index = mesh.skeleton.bones.indexOf(bone);
    if (index < 0) return;
    matrix.multiplyMatrices(mesh.skeleton.boneInverses[index], mesh.bindMatrix);
    const { skinIndex, skinWeight, position } = mesh.geometry.attributes;
    const count = position.count, along = new Float32Array(count), sideA = new Float32Array(count),
      sideB = new Float32Array(count), weights = new Float32Array(count);
    let any = false;
    for (let i = 0; i < count; i++) {
      for (let k = 0; k < 4; k++) if (skinIndex.getComponent(i, k) === index) weights[i] += skinWeight.getComponent(i, k);
      if (weights[i] > 0) any = true;
      point.fromBufferAttribute(position, i).applyMatrix4(matrix);
      along[i] = point.dot(axis) / lengthLocal; sideA[i] = point.dot(perpA); sideB[i] = point.dot(perpB);
    }
    if (!any) return;
    const indices = mesh.geometry.index, triangles = (indices ? indices.count : count) / 3;
    for (let f = 0; f < triangles; f++) {
      const v = [0, 1, 2].map((k) => indices ? indices.getX(f * 3 + k) : f * 3 + k);
      if ((weights[v[0]] + weights[v[1]] + weights[v[2]]) / 3 < 0.5) continue;
      for (let e = 0; e < 3; e++) {
        const i = v[e], j = v[(e + 1) % 3];
        if (along[i] === along[j]) continue;
        for (const [n, at] of ats.entries()) {
          if ((along[i] - at) * (along[j] - at) >= 0) continue;
          const u = (at - along[i]) / (along[j] - along[i]);
          const a = sideA[i] + (sideA[j] - sideA[i]) * u, b = sideB[i] + (sideB[j] - sideB[i]) * u;
          if (Math.hypot(a, b) >= LIMB_SECTION_CORE) rings[n].push(a, b);
        }
      }
    }
  });
  return rings.map((ring, n) => {
    if (ring.length < 6) return null;
    let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
    for (let i = 0; i < ring.length; i += 2) {
      minA = Math.min(minA, ring[i]); maxA = Math.max(maxA, ring[i]);
      minB = Math.min(minB, ring[i + 1]); maxB = Math.max(maxB, ring[i + 1]);
    }
    const centreA = (minA + maxA) / 2, centreB = (minB + maxB) / 2;
    let radius = 0;
    for (let i = 0; i < ring.length; i += 2) radius = Math.max(radius, Math.hypot(ring[i] - centreA, ring[i + 1] - centreB));
    const centre = axis.clone().multiplyScalar(lengthLocal * ats[n]).addScaledVector(perpA, centreA).addScaledVector(perpB, centreB);
    return { centre, radius };
  });
}

/**
 * 在一根肢体骨上缠一圈布（绷带或袖标）。bone → child 是这根骨的方向；at 是沿骨的比例位置；
 * radiusM / lengthM 是世界米（按骨的世界缩放换成骨的局部单位）。返回挂上的网格。
 * 袖标（kind "armband"）贴着袖筒：取布圈两端的袖筒截面（LimbSections），圈轴顺着两端圈心的连线、
 * 两端半径各自取袖筒的粗细（袖口一头粗一头细，圆筒改成圆台）；两端任一切不到就退回按骨轴居中的 radiusM。
 * 绷带仍按骨轴居中（大腿/小腿没有这个问题的实测，不动）。
 */
export function WrapLimb(rig, boneRole, childRole, { kind = "bandage", at = 0.5, radiusM = 0.07, lengthM = 0.12 } = {}) {
  const bone = rig?.bones?.[boneRole], child = rig?.bones?.[childRole];
  if (!bone || !child || typeof document === "undefined") return null;
  bone.updateWorldMatrix(true, false);
  const scale = bone.getWorldScale(new THREE.Vector3()).x || 1;
  const axis = child.position.clone();
  const lengthLocal = axis.length();
  axis.normalize();
  const lengthLocalCloth = lengthM / scale, half = lengthLocalCloth / 2 / lengthLocal;
  const spread = [-0.04, 0, 0.04];
  const rings = kind === "armband" ? LimbSections(rig, bone, axis, lengthLocal, [at - half, at + half].flatMap((t) => spread.map((d) => t + d))) : null;
  // 每端取邻近三处截面里最粗的（袖筒是棱柱，顶点稀疏，一处截面会漏掉鼓出来的那几条棱）。
  const End = (from) => {
    const list = rings?.slice(from, from + spread.length);
    if (!list || list.some((ring) => !ring)) return null;
    return { centre: list[1].centre, radius: Math.max(...list.map((ring) => ring.radius)) };
  };
  const near = End(0), far = End(spread.length);
  const name = kind === "armband" ? "CollectionCareArmband" : "CollectionCareBandage";
  let mesh;
  if (near && far) {
    // 布要包住袖子：两端半径 = 截面最远点到圈心的距离 ×1.05 + 4 mm（袖面是折面，棱之间会比实测的点再鼓一点）。
    const margin = 0.004 / scale, direction = far.centre.clone().sub(near.centre);
    mesh = new THREE.Mesh(ClothGeometry(direction.length(), far.radius * 1.05 + margin, near.radius * 1.05 + margin), ClothMaterial(kind));
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    mesh.position.copy(near.centre).add(far.centre).multiplyScalar(0.5);
  } else {
    mesh = new THREE.Mesh(ClothGeometry(lengthLocalCloth), ClothMaterial(kind));
    mesh.scale.set(radiusM / scale, 1, radiusM / scale);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
    mesh.position.copy(axis).multiplyScalar(lengthLocal * at);
  }
  mesh.name = name;
  mesh.castShadow = false; mesh.receiveShadow = true;
  bone.add(mesh);
  return mesh;
}

let strawMaterial = null;
/**
 * 伤员身下的稻草垫：黄褐底上几百道细长的明暗草秆（沿贴图 v 方向），一张画布、一只材质。
 * 白盒场的「VillageStraw」是纯色语义材质，铺成一张平板看起来就是一块木板。
 */
export function StrawMaterial() {
  if (strawMaterial || typeof document === "undefined") return strawMaterial;
  const canvas = document.createElement("canvas");
  canvas.width = 128; canvas.height = 256;
  const g = canvas.getContext("2d");
  g.fillStyle = "#8f7443"; g.fillRect(0, 0, 128, 256);
  let seed = 7;
  const Random = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 520; i++) {
    const x = Random() * 128, y = Random() * 256, len = 40 + Random() * 140, tilt = (Random() - 0.5) * 10;
    const light = Random();
    g.strokeStyle = light > 0.55 ? `rgba(${196 + light * 40},${166 + light * 34},${104 + light * 20},0.75)` : `rgba(${88 + light * 50},${68 + light * 40},${38 + light * 20},0.7)`;
    g.lineWidth = 0.8 + Random() * 1.6;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + tilt, y + len); g.stroke();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  strawMaterial = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.97, metalness: 0 });
  strawMaterial.name = "CollectionCareStraw";
  return strawMaterial;
}

/** 医护：左上臂的红十字袖标。 */
export function DressMedic(rig) {
  return WrapLimb(rig, "upperArmL", "forearmL", { kind: "armband", at: 0.5, radiusM: 0.062, lengthM: 0.06 });
}
/** 伤员：一条腿缠绷带（side "L" / "R"，part "thigh" / "calf"）。 */
export function DressWound(rig, side = "L", part = "thigh") {
  const child = part === "thigh" ? "calf" + side : "foot" + side;
  return WrapLimb(rig, part + side, child, part === "thigh"
    ? { at: 0.55, radiusM: 0.088, lengthM: 0.16 } : { at: 0.5, radiusM: 0.066, lengthM: 0.18 });
}
