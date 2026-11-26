// 《台儿庄：血战滕县》地面脚印与痕迹：GPU 痕迹靶 + 落脚采集 + 地形着色。
//
// 口径：docs/Data_TerrainTrails.md。数值：Data_Tuning_TerrainTrails.mjs。规则：Script_TerrainTrailRules.mjs。
//
// 三块：
//   1. `TerrainTrailSystem`（单例）—— 收落脚：登记过的蒙皮人物（Script_CharacterModel 的
//      LugouCharacterRig）按真实脚骨判着地、第一人称玩家按步距交替左右脚、登记过的履带车辆
//      （`TrackVehicle`，八九式在 Script_FirstLevelMissionView.BuildTank 登记）按两条履带各自的轨迹
//      连续盖履带印；另有 `Stamp()` 给任何系统直接盖印（车轮、倒地的人……）。印章进 CPU 历史，等帧图那一趟画进靶。
//   2. `TerrainTrailsPass` —— 帧图 pass（排在 atmosphere 之后、terrainBlend 之前）：
//      环形窗口跟着相机滑、清新露出来的条带并从历史回填、整张按通道减淡、画这一帧的新印章。
//   3. `TerrainTrailGlsl()` + `TerrainTrailUniforms` —— 地形材质（表面补丁）读靶：
//      视差找坑底、高度差分出法线、坑里压暗压光、坑深参与积水判据。
//
// 靶的通道：R 坑深、G 泥边（被挤起的一圈）、B 踩乱（颜色与粗糙度的那一圈），A 不用。
// 世界 (x, z) → 靶坐标 (x, z) / 窗口边长，取模（RepeatWrapping）。窗口只决定哪些纹素有效。

import * as THREE from "three";
import {
  BuildStampAtlas, MakeStamp, SoleForKind, WindowIndex, WindowRange, ExposedRanges, TexelRects,
  WorldRectOf, StampCopies, StampRadius, TrailHistory, DecayClock, FootContact, StrideEmitter,
} from "./Script_TerrainTrailRules.mjs";
import {
  TerrainTrailTierOf, TERRAIN_TRAIL_WINDOW as WIN, TERRAIN_TRAIL_SURFACE as SURF,
  TERRAIN_TRAIL_STAMPS, TERRAIN_TRAIL_STRENGTH as STR, TERRAIN_TRAIL_CONTACT as CONTACT,
  TERRAIN_TRAIL_PLAYER as PLAYER, TERRAIN_TRAIL_ATLAS,
} from "./Data_Tuning_TerrainTrails.mjs";
import { VEHICLE_TRACK_SURFACE } from "./Data_VehicleTracks.mjs";
import { ResolveVehicleTrackProfile, CompileStaticVehicleTrack } from "./Script_VehicleTrackField.mjs";

// ===========================================================================
// 一、材质那一侧：共享 uniform + GLSL
// ===========================================================================

/**
 * 地形材质共用的 uniform（同一个对象挂进每个地形程序，pass 每帧改 value）。
 *   uTrailMap     痕迹靶；pass 没跑时为 null（three 绑一张空纹理），uTrailWindow.w = 0 整段跳过
 *   uTrailWindow  x, z 窗口中心（米）；z = 1 / 窗口边长；w = 有效（0/1）
 *   uTrailInfo    x 纹素米；y 窗口半边长 − 边缘淡出宽；z 边缘淡出宽
 * 其余是 Data_Tuning_TerrainTrails.TERRAIN_TRAIL_SURFACE 的着色旋钮（开机时抄一份；改 value 即时生效，
 * 取证 / 调参用 `ApplyTrailSurface()` 或直接改）：
 *   uTrailSoft    逐地形层软硬 [底土, 车道, 草茬, 翻土]
 *   uTrailShapeA  x 坑深米 y 泥边米 z 湿泥区倍率 w 坡度上限
 *   uTrailShapeB  x 坑底压暗 y 踩乱压暗 z 泥边提亮 w 粗糙度减量
 *   uTrailShapeC  x 细节压平 y 坑底 AO z,w 出印的几何法线 y [起, 满]
 *   uTrailFade    x,y 距离淡出 [起, 满]  z,w 视差 [全强度, 关]
 *   uTrailHard    x 硬地保底（坑浅了颜色也要读得出）y 坑壁侧光增益 z 坑里反照率压平
 */
export const TerrainTrailUniforms = {
  uTrailMap: { value: null },
  uTrailWindow: { value: new THREE.Vector4(0, 0, 1, 0) },
  uTrailInfo: { value: new THREE.Vector4(0.02, 1, 1, 0) },
  uTrailSoft: { value: new THREE.Vector4() },
  uTrailShapeA: { value: new THREE.Vector4() },
  uTrailShapeB: { value: new THREE.Vector4() },
  uTrailShapeC: { value: new THREE.Vector4() },
  uTrailFade: { value: new THREE.Vector4() },
  uTrailHard: { value: new THREE.Vector4() },
};

/** 把一张着色旋钮表（缺省 = Data_Tuning_TerrainTrails.TERRAIN_TRAIL_SURFACE）抄进共享 uniform。 */
export function ApplyTrailSurface(surface = SURF, win = WIN) {
  const U = TerrainTrailUniforms;
  U.uTrailSoft.value.set(...surface.soft);
  U.uTrailShapeA.value.set(surface.depthM, surface.rimM, surface.mudSoft, surface.maxSlope);
  U.uTrailShapeB.value.set(surface.printDarken, surface.disturbDarken, surface.rimLighten, surface.printRough);
  U.uTrailShapeC.value.set(surface.detailFlatten, surface.cavityAo, surface.slope[0], surface.slope[1]);
  U.uTrailFade.value.set(win.fadeM[0], win.fadeM[1], surface.parallaxM[0], surface.parallaxM[1]);
  U.uTrailHard.value.set(surface.hardFloor ?? 0, surface.wallLight ?? 0, surface.albedoFlatten ?? 0, 0);
}
ApplyTrailSurface();

/**
 * 地形表面补丁里的痕迹段。`steps` = 视差步数（按画质，编译期常量）。
 * 依赖地形 common 里的全局量：gTerrainNormalW / gTerrainRough / gMaterialAo / gTerrainPrint。
 * 所有取样都是 textureLod（非一致分支里没有导数可用）。
 */
export function TerrainTrailGlsl(steps) {
  return /* glsl */`
#define TERRAIN_TRAILS
uniform sampler2D uTrailMap;
uniform vec4 uTrailWindow;
uniform vec4 uTrailInfo;
uniform vec4 uTrailSoft;
uniform vec4 uTrailShapeA;
uniform vec4 uTrailShapeB;
uniform vec4 uTrailShapeC;
uniform vec4 uTrailFade;
uniform vec4 uTrailHard;
vec3 gTerrainTrailDebug = vec3(0.0);
vec4 TrailTap(vec2 xz) { return textureLod(uTrailMap, xz * uTrailWindow.z, 0.0); }
float TrailHeight(vec4 s, float depthM, float rimM) { return s.g * rimM - max(s.r, s.a * 0.35) * depthM; }
// albedo：线性反照率（积水之前）；weights：地形四层混合权重；mud：前沿湿泥区权重；
// pixelM：一个像素在地面上多少米（差分步长不小于它，远处不闪）；dist：到相机的距离。
void TerrainTrailApply(inout vec3 albedo, vec3 world, vec3 geomN, vec4 weights, float mud, float pixelM, float dist) {
  if (uTrailWindow.w < 0.5) return;
  vec2 rel = abs(world.xz - uTrailWindow.xy);
  float fade = (1.0 - smoothstep(uTrailFade.x, uTrailFade.y, dist))
    * (1.0 - smoothstep(uTrailInfo.y, uTrailInfo.y + uTrailInfo.z, max(rel.x, rel.y)))
    * smoothstep(uTrailShapeC.z, uTrailShapeC.w, geomN.y);
  if (fade < 0.002) return;
  float soft = dot(weights, uTrailSoft) * mix(1.0, uTrailShapeA.z, mud);
  float depthM = uTrailShapeA.x * soft, rimM = uTrailShapeA.y * soft;
  // 视线在地面上的水平偏移（每米高度）：真实高度 h 的点落在 xz + shift·h。
  vec3 toEye = normalize(cameraPosition - world);
  vec2 shift = toEye.xz / max(toEye.y, 0.22);
  vec2 p = world.xz;
  vec4 s0 = TrailTap(p);
  vec4 s1 = TrailTap(p - shift * depthM);
  if (max(max(s0.r, s0.g), max(s0.b, s0.a)) + max(max(s1.r, s1.g), max(s1.b, s1.a)) < 0.004) return;
  // 视差（POM）：从泥边顶往坑底走，找视线第一次落到高度场下面的地方，两步之间线性插值。
  float par = 1.0 - smoothstep(uTrailFade.z, uTrailFade.w, dist);
  if (par > 0.01 && depthM > 1e-4) {
    float dh = (rimM + depthM) / ${steps}.0;
    float h = rimM, hLast = rimM;
    float dLast = h - TrailHeight(TrailTap(p + shift * h), depthM, rimM);
    for (int i = 1; i <= ${steps}; i++) {
      h = rimM - dh * float(i);
      float d = h - TrailHeight(TrailTap(p + shift * h), depthM, rimM);
      if (d <= 0.0) { h = mix(hLast, h, dLast / max(dLast - d, 1e-6)); break; }
      hLast = h; dLast = d;
    }
    p += shift * h * par;
  }
  vec4 s = TrailTap(p);
  // 高度场的梯度 → 法线（y = H(x, z) 的法线 ∝ (−∂H/∂x, 1, −∂H/∂z)）。
  // 硬地上坑浅，按真实深度算出来的坡几乎是平的：坡度按 wallLight 放大一点（只影响光，不影响视差与积水）。
  float e = max(uTrailInfo.x, pixelM * 0.7);
  vec2 grad = vec2(
    TrailHeight(TrailTap(p + vec2(e, 0.0)), depthM, rimM) - TrailHeight(TrailTap(p - vec2(e, 0.0)), depthM, rimM),
    TrailHeight(TrailTap(p + vec2(0.0, e)), depthM, rimM) - TrailHeight(TrailTap(p - vec2(0.0, e)), depthM, rimM)) / (2.0 * e);
  grad *= 1.0 + uTrailHard.y * (1.0 - min(soft, 1.0));
  float gl = length(grad);
  if (gl > uTrailShapeA.w) grad *= uTrailShapeA.w / gl;
  // 颜色：硬地上坑浅，但鞋底与履带把土压实、压出纹路，颜色照样读得出 —— 保底 hardFloor
  float tone = max(min(soft, 1.0), uTrailHard.x);
  float macroRut = s.a * fade * tone;
  // 坑里：鞋底/车轮把土粒压平（贴图细节法线往几何法线收），再叠坑的微观法线
  vec3 n = normalize(mix(gTerrainNormalW, geomN, uTrailShapeC.x * max(s.r, s.a * 0.85) * fade));
  vec3 perturb = vec3(-grad.x, 0.0, -grad.y) * fade;
  perturb -= geomN * dot(geomN, perturb);
  gTerrainNormalW = normalize(n + perturb);
  // 鞋底/车轮把碎石土粒压平：坑里的反照率往这一处地层的均值收（gTerrainMeanOut）。
  float press = clamp(max(s.r * 1.6, s.a * 0.95), 0.0, 1.0);
  albedo = mix(albedo, gTerrainMeanOut, uTrailHard.z * press * fade * tone);
  albedo *= (1.0 - uTrailShapeB.x * s.r * fade * tone) * (1.0 - uTrailShapeB.y * s.b * fade)
    * (1.0 + uTrailShapeB.z * s.g * fade * tone) * (1.0 - 0.14 * macroRut);
  gTerrainRough *= (1.0 - uTrailShapeB.w * clamp(s.r * 0.7 + s.b * 0.3, 0.0, 1.0) * fade)
    * (1.0 - 0.18 * macroRut);
  gMaterialAo *= (1.0 - uTrailShapeC.y * s.r * fade * tone)
    * (1.0 - ${(VEHICLE_TRACK_SURFACE.cavityAo * 0.65).toFixed(3)} * macroRut);
  // 宏观深车辙（A 通道）同样灌进积水判据，泥地里战车/驴车深辙最先汪水
  gTerrainPrint = (s.r * depthM + s.a * ${(VEHICLE_TRACK_SURFACE.rutDepthM * 0.55).toFixed(4)} * min(soft, 1.35)) * fade;
  gTerrainTrailDebug = vec3(max(s.r, s.a * 0.85), s.g, s.b) * fade;
}`;
}

/** 坑深折成积水判据的高度单位（Script_TerrainMaterial.TerrainWater 用）。 */
export const TRAIL_WATER_PER_M = SURF.waterPerM;

// ===========================================================================
// 二、落脚采集（单例）
// ===========================================================================

const Scratch = { a: new THREE.Vector3(), b: new THREE.Vector3() };
const UrlOff = () => typeof location !== "undefined"
  && new URLSearchParams(location.search).get("trails") === "0";

function WorldPos(object, out) {
  const e = object.matrixWorld.elements;
  return out.set(e[12], e[13], e[14]);
}

/**
 * 采集落脚、存历史、排队等 pass 画。
 * 地面由关卡挂上（`AttachGround`），没有地面时只收 `Stamp()` 的直接调用、不判脚。
 */
export class TerrainTrails {
  constructor() {
    this.enabled = !UrlOff();
    this.time = 0;
    this.history = new TrailHistory(WIN.history.capacity);
    this.pending = [];
    this.decay = new DecayClock();
    this.decaySteps = [0, 0, 0];
    this.rigs = new Map();
    this.vehicles = new Map();
    this.ground = null;          // { heightAt(x, z), owner }
    this.displacementField = null;
    this.displacementView = null;
    this.displacementOwner = null;
    this.focus = new THREE.Vector3();
    this.hasFocus = false;
    this.generation = 0;         // 历史被整个清掉时 +1：pass 看到就整张重建
    this.stats = { stamps: 0, player: 0, rigs: 0, knees: 0, drags: 0, treads: 0, wheels: 0, hooves: 0, staticTracks: 0, dropped: 0 };
    this.recent = [];            // 最近几个印（取证用：落在哪、什么鞋、谁踩的）；玩家的单独一份
    this.recentPlayer = [];
    this.recentVehicle = [];
    this.source = "api";
    this.stride = new StrideEmitter();
    this.lastLandSerial = null;
    this.scene = null;
    this.frame = 0;
    // 没有 pass 在画（白盒默认关、low 档、别的关卡）就不采集：判脚、排队都是白花 CPU。
    // pass 每次 Render 记一下；超过 idleFrames 帧没人画就停采。测试里单独用系统时把 idleSkip 关掉。
    this.idleSkip = true;
    this.updates = 0;
    this.consumedAt = -Infinity;
  }

  /** 关卡把「地形高度」挂上来（脚离地多高按它算；楼板、踏板不算地形 → 踩上去不出印）。 */
  AttachGround(owner, heightAt) { this.ground = { owner, heightAt }; this.Reset(); }
  DetachGround(owner) { if (this.ground?.owner === owner) { this.ground = null; this.Reset(); } }
  /** 关卡挂上真 3D 几何车辙高度场与稀疏瓦片视图（VehicleTrackField / VehicleTrackView）。 */
  AttachDisplacement(owner, field, view = null) {
    this.displacementOwner = owner;
    this.displacementField = field || null;
    this.displacementView = view || null;
  }
  DetachDisplacement(owner) {
    if (this.displacementOwner === owner) {
      this.displacementOwner = null;
      this.displacementField = null;
      this.displacementView = null;
    }
  }
  SetDisplacementEnabled(on) {
    this.displacementView?.SetEnabled(on !== false);
    return this.displacementView?.enabled ?? false;
  }
  get active() { return this.enabled && !!this.ground; }

  /**
   * 烘焙一条静态预置车辙样条（来自场景 JSON `vehicleTracks` 或测试场预设）：
   * 同时写入 CPU 真 3D 高度场与 GPU 持久微观印章历史（不随时间衰减、不被动态脚印挤掉）。
   */
  AddStaticTrack(trackSpec) {
    const compiled = CompileStaticVehicleTrack(trackSpec);
    if (!compiled.segments.length && !compiled.hooves.length && !compiled.stamps.length) {
      return { segments: 0, hooves: 0, stamps: 0 };
    }
    if (this.displacementField) {
      for (const seg of compiled.segments) {
        this.displacementField.ImprintSegment(seg.p0, seg.p1, seg.contactor, {
          softness: seg.softness,
          depthScale: seg.depthScale,
          passes: seg.passes,
          phaseStartM: seg.phaseStartM,
        });
      }
      for (const h of compiled.hooves) {
        this.displacementField.ImprintHoof(h.x, h.z, h.contactor, {
          softness: h.softness,
          depthScale: h.depthScale,
        });
      }
    }
    for (const s of compiled.stamps) {
      const stamp = MakeStamp(s);
      this.history.AddStatic(stamp);
    }
    this.stats.staticTracks++;
    this.generation++;
    return { segments: compiled.segments.length, hooves: compiled.hooves.length, stamps: compiled.stamps.length };
  }

  AddStaticTracks(list) {
    let totalSegments = 0, totalHooves = 0, totalStamps = 0;
    for (const spec of list || []) {
      const r = this.AddStaticTrack(spec);
      totalSegments += r.segments; totalHooves += r.hooves; totalStamps += r.stamps;
    }
    return { tracks: (list || []).length, segments: totalSegments, hooves: totalHooves, stamps: totalStamps };
  }

  ClearStaticTracks() {
    this.history.ClearPersistent();
    this.stats.staticTracks = 0;
    this.generation++;
  }

  /** 换关 / 读档：历史与待画全清，下一帧整张重建。 */
  Reset({ keepStatic = false } = {}) {
    this.history.Clear({ keepPersistent: keepStatic });
    this.pending.length = 0; this.decay.Reset();
    this.decaySteps[0] = this.decaySteps[1] = this.decaySteps[2] = 0;
    this.stride.Reset(); this.lastLandSerial = null;
    this.recent.length = 0; this.recentPlayer.length = 0; this.recentVehicle.length = 0;
    for (const entry of this.rigs.values()) this._ResetRig(entry);
    for (const entry of this.vehicles.values()) {
      entry.seeded = false;
      entry.tracks = null;
      entry.contactors = null;
    }
    if (!keepStatic) {
      this.displacementField?.Clear();
      this.displacementView?.ResetVisuals();
      this.stats.staticTracks = 0;
    }
    this.generation++;
  }

  SetEnabled(on) { this.enabled = !!on; if (!on) this.pending.length = 0; }

  // --- 蒙皮人物登记（Script_CharacterModel.LugouCharacterRig 构造 / Dispose 时调） ---
  Register(rig) {
    if (!rig?.bones || this.rigs.has(rig)) return;
    const feet = ["L", "R"].map((side) => {
      const foot = rig.bones[`foot${side}`] || null;
      return {
        side: side === "R" ? 1 : -1, foot, toe: foot?.children.find((node) => /Toe0$/.test(node.name)) || null,
        calf: rig.bones[`calf${side}`] || null,
        contact: new FootContact(), knee: new FootContact({ absolute: true }),
        px: NaN, pz: NaN, kx: NaN, kz: NaN,
      };
    });
    this.rigs.set(rig, {
      // 鞋按人定（Actor 的 seed）；登记时 rig.actor 还没挂上，第一次落脚再定
      rig, feet, pelvis: rig.bones.pelvis || null, sole: null,
      rootX: NaN, rootZ: NaN, dragX: NaN, dragZ: NaN, inScene: false, sceneCheckAt: -1,
    });
  }
  Unregister(rig) { this.rigs.delete(rig); }

  /**
   * 登记一辆车（坦克 / 轻战车 / 驴车 / 牛马车 / 卡车；车体局部 −Z 车头、+X 右）。
   * 既支持新版 Data_VehicleTracks 车型 ID/配置对象，也 100% 兼容旧版 TERRAIN_TRAIL_VEHICLES.type89。
   * 行驶时同步写入 CPU 稀疏高密真 3D 凹陷高度场与 GPU 2 cm/纹素微观细节靶。
   */
  TrackVehicle(object, profileOrSpec, options = {}) {
    if (!object || this.vehicles.has(object)) return;
    const isLegacy = !!(profileOrSpec && typeof profileOrSpec === "object"
      && !Array.isArray(profileOrSpec.contactors) && Number.isFinite(profileOrSpec.trackWidthM));
    const profile = ResolveVehicleTrackProfile(profileOrSpec);
    if (!profile && !isLegacy) return;
    this.vehicles.set(object, {
      object,
      spec: isLegacy ? profileOrSpec : null,
      profile,
      legacyTracked: isLegacy,
      options: options || {},
      half: isLegacy ? (profileOrSpec.halfGaugeM || null) : null,
      seeded: false,
      tracks: null,
      contactors: null,
      inScene: false,
      sceneCheckAt: -1,
    });
  }
  UntrackVehicle(object) { this.vehicles.delete(object); }

  /** 半轨距：车体局部包围盒半宽 − 半履带宽（按模型量，不写死）。 */
  _MeasureGauge(entry, trackWidthM = null) {
    const object = entry.object, inverse = new THREE.Matrix4().copy(object.matrixWorld).invert();
    const box = new THREE.Box3(), local = new THREE.Box3(), m = new THREE.Matrix4();
    object.traverse((node) => {
      if (!node.isMesh || !node.geometry) return;
      node.geometry.boundingBox || node.geometry.computeBoundingBox();
      local.copy(node.geometry.boundingBox).applyMatrix4(m.multiplyMatrices(inverse, node.matrixWorld));
      box.union(local);
    });
    const halfWidth = box.isEmpty() ? 1.09 : (box.max.x - box.min.x) / 2;
    const widthM = trackWidthM ?? entry.spec?.trackWidthM ?? 0.32;
    return Math.min(1.5, Math.max(0.35, halfWidth - widthM / 2));
  }

  _Vehicles(gpuActive = true) {
    const heightAt = this.ground.heightAt;
    const field = this.displacementField;
    for (const [object, entry] of this.vehicles) {
      if (this.scene && (entry.sceneCheckAt < 0 || this.frame - entry.sceneCheckAt > 30)) {
        let top = object;
        while (top.parent) top = top.parent;
        entry.inScene = top === this.scene;
        entry.sceneCheckAt = this.frame;
      }
      if (!object.visible || (this.scene && !entry.inScene)) continue;
      const e = object.matrixWorld.elements;
      const originYOffset = entry.options.originHeightM || 0;
      const px = e[12], py = e[13] - originYOffset, pz = e[14];
      const onGroundM = entry.spec?.onGroundM ?? entry.profile?.onGroundM ?? 0.7;
      if (Math.abs(py - heightAt(px, pz)) > onGroundM) { entry.seeded = false; continue; }
      const recordWithinM = entry.spec?.recordWithinM ?? entry.profile?.recordWithinM ?? WIN.history.recordWithinM;
      if (this.hasFocus && Math.hypot(px - this.focus.x, pz - this.focus.z) > recordWithinM) continue;
      let fx = -e[8], fz = -e[10], rx = e[0], rz = e[2];
      const fl = Math.hypot(fx, fz) || 1, rl = Math.hypot(rx, rz) || 1;
      fx /= fl; fz /= fl; rx /= rl; rz /= rl;

      const softness = entry.options.softness ?? 1;
      const depthScale = entry.options.depthScale ?? 1;
      const rimScale = entry.options.rimScale ?? 1;

      if (entry.legacyTracked) {
        this._UpdateLegacyTrackedVehicle(entry, px, pz, fx, fz, rx, rz, { softness, depthScale, rimScale, field, gpuActive });
      } else {
        this._UpdateGenericVehicle(entry, px, pz, fx, fz, rx, rz, { softness, depthScale, rimScale, field, gpuActive });
      }
    }
  }

  _UpdateLegacyTrackedVehicle(entry, px, pz, fx, fz, rx, rz, { softness, depthScale, rimScale, field, gpuActive }) {
    entry.half ||= this._MeasureGauge(entry, entry.spec.trackWidthM);
    const spec = entry.spec, seg = TERRAIN_TRAIL_STAMPS.tread.lengthM;
    const reach = Math.max(0, spec.contactLengthM / 2 - seg / 2);
    const widthScale = spec.trackWidthM / TERRAIN_TRAIL_STAMPS.tread.widthM;
    const Put = (x, z) => {
      if (gpuActive) {
        this.Stamp({ x, z, dirX: fx, dirZ: fz, kind: "tread", strength: STR.tread, widthScale, recordWithinM: spec.recordWithinM });
      }
      this.stats.treads++;
    };
    if (!entry.tracks) {
      entry.tracks = [-1, 1].map((side, idx) => ({
        side,
        contactor: entry.profile?.contactors?.[idx] || null,
        front: { x: 0, z: 0 },
        rear: { x: 0, z: 0 },
        prevFront: { x: 0, z: 0 },
        prevRear: { x: 0, z: 0 },
        phaseM: 0,
      }));
    }
    for (const track of entry.tracks) {
      const cx = px + rx * track.side * entry.half, cz = pz + rz * track.side * entry.half;
      const front = { x: cx + fx * reach, z: cz + fz * reach }, rear = { x: cx - fx * reach, z: cz - fz * reach };
      const jumped = entry.seeded && Math.hypot(front.x - track.front.x, front.z - track.front.z) > 12;
      if (!entry.seeded || jumped) {
        if (field && track.contactor) {
          field.ImprintSegment(rear, front, track.contactor, { softness, depthScale, rimScale, phaseStartM: 0 });
        }
        const n = Math.max(1, Math.round(spec.contactLengthM / seg));
        for (let k = 0; k < n; k++) {
          const a = n === 1 ? 0.5 : k / (n - 1);
          Put(rear.x + (front.x - rear.x) * a, rear.z + (front.z - rear.z) * a);
        }
        track.front = front; track.rear = rear;
        track.prevFront = { ...front }; track.prevRear = { ...rear };
        track.phaseM = 0;
        continue;
      }
      if (field && track.contactor) {
        const dfx = front.x - track.prevFront.x, dfz = front.z - track.prevFront.z;
        const df = Math.hypot(dfx, dfz);
        if (df >= 0.03) {
          const lat = Math.abs(dfx * rx + dfz * rz);
          const churn = lat > 0.015 ? 1 + 0.45 * Math.min(1, lat / df) : 1;
          field.ImprintSegment(track.prevFront, front, track.contactor, {
            softness, depthScale: depthScale * churn, rimScale: rimScale * churn, phaseStartM: track.phaseM,
          });
          if (lat > 0.04) {
            field.ImprintSegment(rear, front, track.contactor, {
              softness, depthScale: depthScale * churn * 0.9, rimScale: rimScale * churn, phaseStartM: track.phaseM,
            });
          }
          track.phaseM += df;
          track.prevFront = { ...front };
          track.prevRear = { ...rear };
        }
      }
      for (const [key, point, sign] of [["front", front, 1], ["rear", rear, -1]]) {
        const cursor = track[key];
        for (let guard = 0; guard < 16; guard++) {
          const dx = point.x - cursor.x, dz = point.z - cursor.z, d = Math.hypot(dx, dz);
          if (d < seg) break;
          if ((dx * fx + dz * fz) * sign <= 0) { cursor.x = point.x; cursor.z = point.z; break; }
          cursor.x += dx / d * seg; cursor.z += dz / d * seg;
          Put(cursor.x, cursor.z);
        }
      }
    }
    entry.seeded = true;
  }

  _UpdateGenericVehicle(entry, px, pz, fx, fz, rx, rz, { softness, depthScale, rimScale, field, gpuActive }) {
    const profile = entry.profile;
    const object = entry.object;
    const recordWithinM = profile.recordWithinM ?? WIN.history.recordWithinM;
    if (!entry.contactors) {
      entry.contactors = profile.contactors.map((c) => ({
        spec: c,
        node: c.nodeName && entry.options.useNodes !== false ? object.getObjectByName(c.nodeName) || null : null,
        half: null,
        front: { x: 0, z: 0 },
        rear: { x: 0, z: 0 },
        prev: { x: 0, z: 0 },
        prevRear: { x: 0, z: 0 },
        cursor: { x: 0, z: 0 },
        phaseM: 0,
        travelM: 0,
        nextStepM: (c.strideM || 0.72) * (c.phase || 0),
        seeded: false,
      }));
    }

    for (const st of entry.contactors) {
      const c = st.spec;
      const stampSpec = TERRAIN_TRAIL_STAMPS[c.stampKind] || TERRAIN_TRAIL_STAMPS.tread;
      const widthScale = c.widthM / stampSpec.widthM;

      if (c.type === "track") {
        if (!st.half) {
          st.half = c.measureGauge && !entry.options.fixedGauge
            ? this._MeasureGauge(entry, c.widthM)
            : Math.abs(c.offsetX);
          if (entry.half === null) entry.half = st.half;
        }
        const cx = px + rx * c.side * st.half - fx * (c.offsetZ || 0);
        const cz = pz + rz * c.side * st.half - fz * (c.offsetZ || 0);
        const seg = Math.max(0.12, c.segmentStepM || stampSpec.lengthM);
        const reach = Math.max(0, c.contactLengthM * 0.5 - seg * 0.5);
        const front = { x: cx + fx * reach, z: cz + fz * reach };
        const rear = { x: cx - fx * reach, z: cz - fz * reach };
        const jumped = st.seeded && Math.hypot(front.x - st.prev.x, front.z - st.prev.z) > 12;
        const lengthScale = Math.min(1.25, Math.max(0.7, (seg * 1.18) / stampSpec.lengthM));

        const PutTread = (x, z, dx, dz, boost = 1) => {
          if (gpuActive) {
            const strength = boost === 1 ? c.strength : c.strength.map((v) => Math.min(1, v * boost));
            this.Stamp({ x, z, dirX: dx, dirZ: dz, kind: c.stampKind, side: c.side, strength, widthScale, lengthScale, recordWithinM });
          }
          this.stats.treads++;
        };

        if (!st.seeded || jumped) {
          if (field) {
            field.ImprintSegment(rear, front, c, { softness, depthScale, rimScale, phaseStartM: 0 });
          }
          const n = Math.max(1, Math.round(c.contactLengthM / seg));
          for (let k = 0; k < n; k++) {
            const a = n === 1 ? 0.5 : k / (n - 1);
            PutTread(rear.x + (front.x - rear.x) * a, rear.z + (front.z - rear.z) * a, fx, fz, 1);
          }
          st.front = { ...front }; st.rear = { ...rear };
          st.prev = { ...front }; st.prevRear = { ...rear };
          st.phaseM = 0;
          st.seeded = true;
          continue;
        }

        const dfx = front.x - st.prev.x, dfz = front.z - st.prev.z;
        const df = Math.hypot(dfx, dfz);
        const drx = rear.x - st.prevRear.x, drz = rear.z - st.prevRear.z;
        const dr = Math.hypot(drx, drz);
        if (df >= 0.03 || dr >= 0.03) {
          const lat = Math.abs(dfx * rx + dfz * rz);
          const churn = lat > 0.015 ? 1 + ((profile.skidChurnBoost || 1.3) - 1) * Math.min(1, lat / Math.max(df, 0.02)) : 1;
          if (field) {
            if (df >= 0.03) {
              field.ImprintSegment(st.prev, front, c, {
                softness, depthScale: depthScale * churn, rimScale: rimScale * churn, phaseStartM: st.phaseM,
              });
            }
            if (dr >= 0.03) {
              field.ImprintSegment(st.prevRear, rear, c, {
                softness, depthScale: depthScale * churn, rimScale: rimScale * churn, phaseStartM: st.phaseM,
              });
            }
            if (lat > 0.035) {
              field.ImprintSegment(rear, front, c, {
                softness, depthScale: depthScale * churn * 0.92, rimScale: rimScale * churn, phaseStartM: st.phaseM,
              });
            }
          }
          st.phaseM += Math.max(df, dr);
          st.prev = { ...front };
          st.prevRear = { ...rear };
        }

        for (const [key, point, sign] of [["front", front, 1], ["rear", rear, -1]]) {
          const cursor = st[key];
          for (let guard = 0; guard < 24; guard++) {
            const dx = point.x - cursor.x, dz = point.z - cursor.z, d = Math.hypot(dx, dz);
            if (d < seg) break;
            if ((dx * fx + dz * fz) * sign <= 0) { cursor.x = point.x; cursor.z = point.z; break; }
            const nx = dx / d, nz = dz / d;
            cursor.x += nx * seg; cursor.z += nz * seg;
            PutTread(cursor.x, cursor.z, nx, nz, 1);
          }
        }
        continue;
      }

      if (c.type === "wheel") {
        let wx, wz;
        if (st.node) {
          const wp = WorldPos(st.node, Scratch.a);
          wx = wp.x; wz = wp.z;
        } else {
          wx = px + rx * c.offsetX - fx * (c.offsetZ || 0);
          wz = pz + rz * c.offsetX - fz * (c.offsetZ || 0);
        }
        const seg = Math.max(0.1, c.segmentStepM || 0.16);
        const lengthScale = Math.max(0.75, (seg * 1.4) / stampSpec.lengthM);
        const jumped = st.seeded && Math.hypot(wx - st.prev.x, wz - st.prev.z) > 10;

        const PutWheel = (x, z, dx, dz) => {
          if (gpuActive) {
            this.Stamp({ x, z, dirX: dx, dirZ: dz, kind: c.stampKind, side: c.side, strength: c.strength, widthScale, lengthScale, recordWithinM });
          }
          this.stats.wheels++;
        };

        if (!st.seeded || jumped) {
          const halfC = (c.contactLengthM || 0.2) * 0.5;
          if (field) {
            field.ImprintSegment(
              { x: wx - fx * halfC, z: wz - fz * halfC },
              { x: wx + fx * halfC, z: wz + fz * halfC },
              c,
              { softness, depthScale, rimScale, phaseStartM: 0 },
            );
          }
          PutWheel(wx, wz, fx, fz);
          st.prev = { x: wx, z: wz };
          st.cursor = { x: wx, z: wz };
          st.phaseM = 0;
          st.seeded = true;
          continue;
        }

        const dx = wx - st.prev.x, dz = wz - st.prev.z, d = Math.hypot(dx, dz);
        if (d >= 0.025) {
          if (field) {
            field.ImprintSegment(st.prev, { x: wx, z: wz }, c, {
              softness, depthScale, rimScale, phaseStartM: st.phaseM,
            });
          }
          st.phaseM += d;
          st.prev = { x: wx, z: wz };
        }
        for (let guard = 0; guard < 32; guard++) {
          const sx = wx - st.cursor.x, sz = wz - st.cursor.z, sd = Math.hypot(sx, sz);
          if (sd < seg) break;
          const nx = sx / sd, nz = sz / sd;
          st.cursor.x += nx * seg; st.cursor.z += nz * seg;
          PutWheel(st.cursor.x, st.cursor.z, nx, nz);
        }
        continue;
      }

      if (c.type === "hoof") {
        const animalRoot = c.animalSpace ? entry.options.animalRoot : null;
        if (c.animalSpace && entry.options.animalRoot && !animalRoot.visible) { st.seeded = false; continue; }
        let hx, hz, hfx = fx, hfz = fz;
        if (animalRoot) {
          const ae = animalRoot.matrixWorld.elements;
          let afx = -ae[8], afz = -ae[10], arx = ae[0], arz = ae[2];
          const afl = Math.hypot(afx, afz) || 1, arl = Math.hypot(arx, arz) || 1;
          afx /= afl; afz /= afl; arx /= arl; arz /= arl;
          const localZ = c.animalOffsetZ ?? (c.offsetZ + 2.05);
          hx = ae[12] + arx * c.offsetX - afx * localZ;
          hz = ae[14] + arz * c.offsetX - afz * localZ;
          hfx = afx; hfz = afz;
        } else {
          hx = px + rx * c.offsetX - fx * (c.offsetZ || 0);
          hz = pz + rz * c.offsetX - fz * (c.offsetZ || 0);
        }
        const stride = Math.max(0.3, c.strideM || 0.72);
        const jumped = st.seeded && Math.hypot(hx - st.prev.x, hz - st.prev.z) > 10;
        if (!st.seeded || jumped) {
          st.prev = { x: hx, z: hz };
          st.travelM = 0;
          st.nextStepM = stride * (c.phase || 0);
          st.seeded = true;
          continue;
        }
        const dx = hx - st.prev.x, dz = hz - st.prev.z, d = Math.hypot(dx, dz);
        if (d < 0.01) continue;
        const nx = dx / d, nz = dz / d;
        st.travelM += d;
        while (st.travelM >= st.nextStepM) {
          const back = st.travelM - st.nextStepM;
          const sx = hx - nx * back, sz = hz - nz * back;
          if (field) {
            field.ImprintHoof(sx, sz, c, { softness, depthScale, rimScale });
          }
          if (gpuActive) {
            this.Stamp({
              x: sx, z: sz, dirX: nx || hfx, dirZ: nz || hfz, kind: c.stampKind || "hoof",
              side: c.side || 1, strength: c.strength, widthScale, recordWithinM,
            });
          }
          this.stats.hooves++;
          st.nextStepM += stride;
        }
        st.prev = { x: hx, z: hz };
      }
    }
    entry.seeded = true;
  }
  _ResetRig(entry) {
    for (const f of entry.feet) { f.contact = new FootContact(); f.knee = new FootContact({ absolute: true }); f.px = f.pz = f.kx = f.kz = NaN; }
    entry.rootX = entry.rootZ = entry.dragX = entry.dragZ = NaN;
  }

  /**
   * 直接盖一个印（给任何系统用：车轮、倒地、剧情布景）。参数同 Script_TerrainTrailRules.MakeStamp。
   * @returns {object|null} 印章记录（离相机太远不记、系统关着不记时返回 null）
   */
  Stamp(params) {
    if (!this.enabled) return null;
    if (this.hasFocus && Math.hypot(params.x - this.focus.x, params.z - this.focus.z) > (params.recordWithinM ?? WIN.history.recordWithinM)) {
      this.stats.dropped++;
      return null;
    }
    const stamp = MakeStamp(params);
    this.history.Add(stamp, this.time);
    const record = { x: +stamp.x.toFixed(3), z: +stamp.z.toFixed(3), kind: params.kind, side: params.side ?? 0,
      source: this.source, t: +this.time.toFixed(2), ...(this.source === "rig" ? { align: this.lastAlign } : {}) };
    const list = this.source === "player" ? this.recentPlayer : this.source === "vehicle" ? this.recentVehicle : this.recent;
    list.push(record);
    if (list.length > 24) list.shift();
    this.pending.push(stamp);
    // 一帧之内堆太多（测试或爆炸一口气盖一片）：老的留在历史里，靶上照样补得回来
    if (this.pending.length > 4096) this.pending.splice(0, this.pending.length - 4096);
    this.stats.stamps++;
    return stamp;
  }

  /** pass 取走这一帧要减淡的色阶（累计到现在的）。 */
  TakeDecay() {
    const s = this.decaySteps;
    if (!(s[0] || s[1] || s[2])) return null;
    const out = [s[0], s[1], s[2]];
    s[0] = s[1] = s[2] = 0;
    return out;
  }

  /**
   * 每帧一次（主循环，在渲染之前）。
   * @param {number} dt
   * @param {{ focus?: THREE.Vector3, player?: object }} ctx focus = 相机位置
   */
  Update(dt, { focus = null, player = null, scene = null } = {}) {
    const step = Math.max(0, Math.min(dt || 0, 0.25));
    this.time += step;
    const decay = this.decay.Advance(step, WIN.lifeS);
    if (decay) for (let c = 0; c < 3; c++) this.decaySteps[c] = Math.min(255, this.decaySteps[c] + decay[c]);
    if (focus) { this.focus.copy(focus); this.hasFocus = true; }
    if (scene !== this.scene) { this.scene = scene; for (const entry of this.rigs.values()) entry.sceneCheckAt = -1; }
    this.updates++;
    if (!this.active || step <= 0) return;
    // 首帧渲染前（consumedAt === -Infinity）放行前 160 次更新，确保测试场预推或开场车辆不会漏写 GPU 细部历史
    const gpuActive = !this.idleSkip
      || (this.consumedAt === -Infinity && this.updates <= 160)
      || (this.updates - this.consumedAt <= 60);
    if (!gpuActive && !this.displacementField) return;
    if (gpuActive) {
      this.source = "player";
      if (player) this._Player(player);
      this.source = "rig";
      this._Rigs(step);
    }
    this.source = "vehicle";
    if (this.vehicles.size) this._Vehicles(gpuActive);
    this.source = "api";
  }

  _Player(P) {
    const heightAt = this.ground.heightAt;
    const alive = P.Alive ?? P.alive;
    if (!alive || !P.position) { this.stride.Reset(); return; }
    const pos = P.position;
    const vx = P.velocity?.x || 0, vz = P.velocity?.z || 0, speed = Math.hypot(vx, vz);
    const onTerrain = Math.abs(pos.y - heightAt(pos.x, pos.z)) < PLAYER.onGroundM;
    // 落地：两只脚并排、压得最重
    const land = P.jump?.landSerial;
    if (this.lastLandSerial !== null && land !== undefined && land !== this.lastLandSerial && onTerrain) {
      const yaw = P.yaw ?? 0;
      const dx = speed > 0.3 ? vx / speed : -Math.sin(yaw), dz = speed > 0.3 ? vz / speed : -Math.cos(yaw);
      for (const side of [-1, 1]) {
        this.Stamp({ x: pos.x - dz * side * PLAYER.halfStanceM, z: pos.z + dx * side * PLAYER.halfStanceM,
          dirX: dx, dirZ: dz, kind: PLAYER.sole, side, strength: STR.land });
      }
      this.stats.player += 2;
    }
    if (land !== undefined) this.lastLandSerial = land;
    if (!P.grounded || !onTerrain || speed < PLAYER.minMps) return;
    const prone = P.stance === "prone";
    const running = !prone && (P.sprint || 0) > 0.5;
    const stride = prone ? PLAYER.strideM.prone : running ? PLAYER.strideM.run
      : P.stance === "crouch" ? PLAYER.strideM.crouch : PLAYER.strideM.walk;
    const side = this.stride.Step(P.stepDistance ?? 0, stride);
    if (!side) return;
    const dx = vx / speed, dz = vz / speed;
    // 右 = (−dz, dx)（面朝 −Z 时右手是 +X）
    const rx = -dz, rz = dx;
    if (prone) {
      // 趴着爬：身子底下一段拖痕 + 往前伸的那只手（左右交替）
      this.Stamp({ x: pos.x - dx * 0.2, z: pos.z - dz * 0.2, dirX: dx, dirZ: dz, kind: "drag", strength: STR.drag });
      this.Stamp({ x: pos.x + dx * 0.55 + rx * side * 0.22, z: pos.z + dz * 0.55 + rz * side * 0.22,
        dirX: dx, dirZ: dz, kind: "hand", side, strength: STR.hand });
      this.stats.drags++;
      return;
    }
    const strength = running ? STR.run : P.stance === "crouch" ? STR.crouch : STR.walk;
    this.Stamp({
      x: pos.x + dx * PLAYER.aheadM + rx * side * PLAYER.halfStanceM,
      z: pos.z + dz * PLAYER.aheadM + rz * side * PLAYER.halfStanceM,
      dirX: dx, dirZ: dz, kind: PLAYER.sole, side, strength,
      lengthScale: running ? STR.runLengthScale : 1,
    });
    this.stats.player++;
  }

  _Rigs(dt) {
    const heightAt = this.ground.heightAt;
    this.frame++;
    const fx = this.focus.x, fz = this.focus.z, within2 = CONTACT.withinM ** 2;
    for (const [rig, entry] of this.rigs) {
      const root = rig.root;
      if (rig.disposed || !root) { this.rigs.delete(rig); continue; }
      const actor = rig.actor;
      // 只认挂在人身上、在主场景里的骨架（编辑器预览、菜单小窗里的人不留印）。父链半秒查一次。
      if (!actor || !root.parent || !root.visible || actor.root?.visible === false || actor.ragdollState || actor.disposed) continue;
      if (this.scene && (entry.sceneCheckAt < 0 || this.frame - entry.sceneCheckAt > 30)) {
        let top = root;
        while (top.parent) top = top.parent;
        entry.inScene = top === this.scene;
        entry.sceneCheckAt = this.frame;
      }
      if (this.scene && !entry.inScene) continue;
      const rp = WorldPos(root, Scratch.a);
      if ((rp.x - fx) ** 2 + (rp.z - fz) ** 2 > within2) continue;
      const rootSpeed = Number.isFinite(entry.rootX) ? Math.hypot(rp.x - entry.rootX, rp.z - entry.rootZ) / dt : 0;
      const movedRoot = !Number.isFinite(entry.rootX) || rp.x !== entry.rootX || rp.z !== entry.rootZ;
      entry.prevRootX = entry.rootX; entry.prevRootZ = entry.rootZ;
      entry.rootX = rp.x; entry.rootZ = rp.z;
      const scale = Math.abs(root.matrixWorld.elements[5]) || 1;
      // 趴着：只出拖痕（骨盆每挪 dragEveryM 盖一段），不判脚
      if (entry.pelvis) {
        const pv = WorldPos(entry.pelvis, Scratch.b);
        if (pv.y - heightAt(pv.x, pv.z) < CONTACT.proneHipM * scale) {
          if (!Number.isFinite(entry.dragX)) { entry.dragX = pv.x; entry.dragZ = pv.z; continue; }
          const ddx = pv.x - entry.dragX, ddz = pv.z - entry.dragZ, moved = Math.hypot(ddx, ddz);
          if (moved >= CONTACT.dragEveryM) {
            this.Stamp({ x: (pv.x + entry.dragX) / 2, z: (pv.z + entry.dragZ) / 2, dirX: ddx, dirZ: ddz,
              kind: "drag", strength: STR.drag });
            entry.dragX = pv.x; entry.dragZ = pv.z;
            this.stats.drags++;
          }
          continue;
        }
        entry.dragX = entry.dragZ = NaN;
      }
      const running = rootSpeed > CONTACT.runMps;
      for (const f of entry.feet) {
        if (f.foot) {
          const a = WorldPos(f.foot, Scratch.b);
          // 这只人这一帧没重新摆姿势（动画降频 / 被剔掉）：骨头矩阵还是旧的，这一帧不判
          if (a.x !== f.px || a.z !== f.pz || movedRoot) {
            const speed = Number.isFinite(f.px) ? Math.hypot(a.x - f.px, a.z - f.pz) / dt : 0;
            f.px = a.x; f.pz = a.z;
            const h = (a.y - heightAt(a.x, a.z)) / scale;
            if (f.contact.Step(h, speed, dt, a.x, a.z)) this._FootPrint(entry, f, a, scale, running);
          }
        }
        if (f.calf) {
          const k = WorldPos(f.calf, Scratch.b);
          if (k.x !== f.kx || k.z !== f.kz || movedRoot) {
            const speed = Number.isFinite(f.kx) ? Math.hypot(k.x - f.kx, k.z - f.kz) / dt : 0;
            f.kx = k.x; f.kz = k.z;
            const h = (k.y - heightAt(k.x, k.z)) / scale;
            if (f.knee.Step(h, speed, dt, k.x, k.z, CONTACT, CONTACT.kneeEnterM, CONTACT.kneeExitM)) {
              const ax = f.foot ? f.px - k.x : 0, az = f.foot ? f.pz - k.z : 1;
              this.Stamp({ x: k.x, z: k.z, dirX: -ax, dirZ: -az, kind: "knee", side: f.side, strength: STR.knee,
                lengthScale: scale, widthScale: scale });
              this.stats.knees++;
            }
          }
        }
      }
    }
  }

  _FootPrint(entry, f, ankle, scale, running) {
    let dx = 0, dz = 0;
    if (f.toe) {
      const toe = WorldPos(f.toe, Scratch.a);
      dx = toe.x - ankle.x; dz = toe.z - ankle.z;
    }
    if (Math.hypot(dx, dz) < 0.02) {
      // 没有脚尖骨（或脚几乎竖着）：用人的朝向（人物正面 −Z）
      const e = entry.rig.root.matrixWorld.elements;
      dx = -e[8]; dz = -e[10];
    }
    const n = Math.hypot(dx, dz) || 1;
    dx /= n; dz /= n;
    // 取证：脚尖方向与人物这一帧实际移动方向的夹角（度；站着不动记 null）
    const mx = entry.rootX - entry.prevRootX, mz = entry.rootZ - entry.prevRootZ, ml = Math.hypot(mx, mz);
    this.lastAlign = ml > 1e-3 ? Math.round(Math.acos(Math.max(-1, Math.min(1, (mx * dx + mz * dz) / ml))) * 180 / Math.PI) : null;
    entry.sole ||= SoleForKind(entry.rig.kind, entry.rig.actor?.seed ?? entry.rig.modelId);
    const spec = TERRAIN_TRAIL_STAMPS[entry.sole];
    const along = (0.5 - CONTACT.ankleT) * spec.lengthM * scale;
    this.Stamp({
      x: ankle.x + dx * along, z: ankle.z + dz * along, dirX: dx, dirZ: dz, kind: entry.sole, side: f.side,
      strength: running ? STR.run : STR.walk, lengthScale: scale * (running ? STR.runLengthScale : 1), widthScale: scale,
    });
    this.stats.rigs++;
  }

  /** 取证 / 测试。 */
  Describe() {
    return {
      enabled: this.enabled, active: this.active, time: +this.time.toFixed(3),
      history: this.history.count, staticStamps: this.history.persistent.length,
      pending: this.pending.length, rigs: this.rigs.size, vehicles: this.vehicles.size,
      displacement: this.displacementView ? this.displacementView.Describe()
        : this.displacementField ? { enabled: true, field: this.displacementField.State() } : null,
      stats: { ...this.stats }, generation: this.generation, recent: this.recent.slice(-12), recentPlayer: this.recentPlayer.slice(-12),
      recentVehicle: this.recentVehicle.slice(-12),
    };
  }
}

export const TerrainTrailSystem = new TerrainTrails();

// ===========================================================================
// 三、帧图 pass
// ===========================================================================

const STAMP_VERT = /* glsl */`
attribute vec2 iCenter;   // 靶像素坐标
attribute vec2 iAxis;     // 脚跟 → 脚尖（单位向量，世界 xz = 靶 xy）
attribute vec2 iSize;     // 四边形 宽（带符号：负 = 左脚镜像）、长（像素）
attribute float iCell;
attribute vec4 iStrength;
attribute vec4 iFade;     // 从历史回填时已经退掉的量（新印为 0）；靶上的减淡是逐纹素减色阶，这里同口径
uniform vec2 uTarget;
varying vec2 vLocal;
varying float vCell;
varying vec4 vStrength;
varying vec4 vFade;
void main() {
  vec2 right = vec2(-iAxis.y, iAxis.x);
  vec2 p = iCenter + right * position.x * iSize.x + iAxis * position.y * iSize.y;
  vLocal = position.xy + 0.5;
  vCell = iCell;
  vStrength = iStrength;
  vFade = iFade;
  gl_Position = vec4(p / uTarget * 2.0 - 1.0, 0.0, 1.0);
}`;

const STAMP_FRAG = /* glsl */`
uniform sampler2D uAtlas;
uniform vec3 uAtlasInfo;  // x 格数 y 半纹素（格内 u）z 半纹素（v）
varying vec2 vLocal;
varying float vCell;
varying vec4 vStrength;
varying vec4 vFade;
void main() {
  vec2 local = clamp(vLocal, uAtlasInfo.yz, 1.0 - uAtlasInfo.yz);
  vec4 s = texture2D(uAtlas, vec2((vCell + local.x) / uAtlasInfo.x, local.y));
  gl_FragColor = max(s * vStrength - vFade, vec4(0.0));
}`;

const FULL_VERT = /* glsl */`void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const DECAY_FRAG = /* glsl */`uniform vec3 uDecay; void main() { gl_FragColor = vec4(uDecay, 0.0); }`;

const BATCH = 2048;

export class TerrainTrailsPass {
  constructor(pipeline, system = TerrainTrailSystem) {
    this.name = "terrainTrails";
    this.pipeline = pipeline;
    this.system = system;
    this.target = null;
    this.tier = null;
    this.index = null;          // 窗口中心纹素下标 {ix, iz}
    this.valid = false;         // 靶内容与历史一致（false → 下一次 Render 整张重建）
    this.generation = -1;
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    this.savedClear = new THREE.Color();
    this.stats = { rebuilds: 0, strips: 0, restamped: 0, drawn: 0, decays: 0 };

    const atlas = BuildStampAtlas();
    this.atlas = new THREE.DataTexture(atlas.data, atlas.width, atlas.height, THREE.RGBAFormat, THREE.UnsignedByteType);
    this.atlas.colorSpace = THREE.NoColorSpace;
    this.atlas.generateMipmaps = true;
    this.atlas.minFilter = THREE.LinearMipmapLinearFilter;
    this.atlas.magFilter = THREE.LinearFilter;
    this.atlas.wrapS = this.atlas.wrapT = THREE.ClampToEdgeWrapping;
    this.atlas.flipY = false;
    this.atlas.needsUpdate = true;

    // 印章：单位四边形 × 实例
    const quad = new THREE.InstancedBufferGeometry();
    quad.setAttribute("position", new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5, 0, -0.5, 0.5, 0], 3));
    quad.setIndex([0, 1, 2, 0, 2, 3]);
    this.inst = {
      center: new THREE.InstancedBufferAttribute(new Float32Array(BATCH * 2), 2),
      axis: new THREE.InstancedBufferAttribute(new Float32Array(BATCH * 2), 2),
      size: new THREE.InstancedBufferAttribute(new Float32Array(BATCH * 2), 2),
      cell: new THREE.InstancedBufferAttribute(new Float32Array(BATCH), 1),
      strength: new THREE.InstancedBufferAttribute(new Float32Array(BATCH * 4), 4),
      fade: new THREE.InstancedBufferAttribute(new Float32Array(BATCH * 4), 4),
    };
    for (const attr of Object.values(this.inst)) attr.setUsage(THREE.DynamicDrawUsage);
    quad.setAttribute("iCenter", this.inst.center);
    quad.setAttribute("iAxis", this.inst.axis);
    quad.setAttribute("iSize", this.inst.size);
    quad.setAttribute("iCell", this.inst.cell);
    quad.setAttribute("iStrength", this.inst.strength);
    quad.setAttribute("iFade", this.inst.fade);
    quad.instanceCount = 0;
    this.stampGeometry = quad;
    this.stampMaterial = new THREE.ShaderMaterial({
      vertexShader: STAMP_VERT, fragmentShader: STAMP_FRAG,
      uniforms: {
        uTarget: { value: new THREE.Vector2(1, 1) },
        uAtlas: { value: this.atlas },
        uAtlasInfo: { value: new THREE.Vector3(TERRAIN_TRAIL_ATLAS.cells, 0.5 / TERRAIN_TRAIL_ATLAS.cellW, 0.5 / TERRAIN_TRAIL_ATLAS.cellH) },
      },
      // 左脚是镜像（宽取负），三角形绕向跟着反：不双面的话有一只脚整个被背面剔掉
      depthTest: false, depthWrite: false, side: THREE.DoubleSide,
      // 同一处反复踩取 MAX：坑不会越踩越深，新的深印盖过旧的浅印
      blending: THREE.CustomBlending, blendEquation: THREE.MaxEquation,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    });
    const stampMesh = new THREE.Mesh(quad, this.stampMaterial);
    stampMesh.frustumCulled = false;
    this.stampScene = new THREE.Scene();
    this.stampScene.add(stampMesh);

    // 减淡：全屏一趟反向减法（dst − src）
    const full = new THREE.BufferGeometry();
    full.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    this.decayMaterial = new THREE.ShaderMaterial({
      vertexShader: FULL_VERT, fragmentShader: DECAY_FRAG,
      uniforms: { uDecay: { value: new THREE.Vector3() } },
      depthTest: false, depthWrite: false,
      blending: THREE.CustomBlending, blendEquation: THREE.ReverseSubtractEquation,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor,
    });
    const decayMesh = new THREE.Mesh(full, this.decayMaterial);
    decayMesh.frustumCulled = false;
    this.decayScene = new THREE.Scene();
    this.decayScene.add(decayMesh);
  }

  /** 这一帧的画质分档（preset.terrainTrails 是档位名或 false）。 */
  _Tier() {
    const value = this.pipeline.preset?.terrainTrails;
    if (!value) return null;
    return TerrainTrailTierOf(typeof value === "string" ? value : "high");
  }

  Enabled() { return !!(this._Tier() && this.system.active); }

  Idle() {
    TerrainTrailUniforms.uTrailWindow.value.w = 0;
    TerrainTrailUniforms.uTrailMap.value = null;
    this.valid = false;
    // 没人画：待画队列清掉（历史还在，再开时整张重建）
    this.system.pending.length = 0;
  }

  Resize() {}

  _EnsureTarget(tier) {
    if (this.target && this.tier && this.tier.size === tier.size && this.tier.texelM === tier.texelM) return;
    this.target?.dispose();
    this.target = new THREE.WebGLRenderTarget(tier.size, tier.size, {
      type: THREE.UnsignedByteType, format: THREE.RGBAFormat, depthBuffer: false, stencilBuffer: false,
      minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: false,
      wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping,
    });
    this.target.texture.name = "terrainTrails";
    this.target.texture.colorSpace = THREE.NoColorSpace;
    this.pipeline.targets && (this.pipeline.targets.terrainTrails = this.target);
    this.tier = tier;
    this.valid = false;
  }

  Render(ctx) {
    const renderer = ctx.renderer, system = this.system;
    system.consumedAt = system.updates;
    const tier = this._Tier();
    this._EnsureTarget(tier);
    const size = tier.size, texelM = tier.texelM;
    const camera = ctx.camera;
    camera.getWorldPosition(Scratch.a);
    const next = WindowIndex(this.index, Scratch.a.x, Scratch.a.z, texelM, WIN.recenterM);
    if (system.generation !== this.generation) { this.valid = false; this.generation = system.generation; }

    const previous = renderer.getRenderTarget(), alpha = renderer.getClearAlpha();
    renderer.getClearColor(this.savedClear);
    const autoClear = renderer.autoClear, shadowAuto = renderer.shadowMap.autoUpdate;
    this.stampMaterial.uniforms.uTarget.value.set(size, size);
    try {
      renderer.autoClear = false;
      renderer.shadowMap.autoUpdate = false;
      renderer.setClearColor(0x000000, 0);
      if (!this.valid) {
        // 整张重建：清空，历史里窗口内的印章按当下强度全部盖回去
        this._Scissor(renderer, null);
        renderer.clear(true, false, false);
        this.index = next;
        const range = WindowRange(next, size);
        this._DrawHistory(renderer, WorldRectOf(range, texelM), size, texelM);
        system.TakeDecay();          // 回填用的就是当下强度，攒着的减淡作废
        system.pending.length = 0;   // 新印已在历史里，刚才一起画过了
        this.valid = true;
        this.stats.rebuilds++;
      } else {
        // 先减淡已有内容，再清条带、回填、画新印（回填与新印都是当下强度）
        const decay = system.TakeDecay();
        if (decay) {
          this._Scissor(renderer, null);
          this.decayMaterial.uniforms.uDecay.value.set(decay[0] / 255, decay[1] / 255, decay[2] / 255);
          renderer.render(this.decayScene, this.camera);
          this.stats.decays++;
          // 静态场景预置车辙永不衰减：衰减步（每 ~1.5 s 一次）后用 MAX 混合补刷一次当前窗内静态印章
          if (system.history.persistent.length) {
            this._DrawPersistent(renderer, WorldRectOf(WindowRange(this.index, size), texelM), size, texelM);
          }
        }
        if (next !== this.index) {
          for (const range of ExposedRanges(this.index, next, size)) {
            const rect = WorldRectOf(range, texelM);
            for (const texel of TexelRects(range, size)) {
              this._Scissor(renderer, texel);
              renderer.clear(true, false, false);
              this._DrawHistory(renderer, rect, size, texelM);
              this.stats.strips++;
            }
          }
          this.index = next;
        }
        if (system.pending.length) {
          this._Scissor(renderer, null);
          const range = WindowRange(this.index, size);
          const rect = WorldRectOf(range, texelM);
          this._Begin();
          for (const stamp of system.pending) {
            const r = StampRadius(stamp);
            if (stamp.x + r < rect.minX || stamp.x - r > rect.maxX || stamp.z + r < rect.minZ || stamp.z - r > rect.maxZ) continue;
            this._Push(renderer, stamp, size, texelM);
          }
          this._Flush(renderer);
          system.pending.length = 0;
        }
      }
    } finally {
      this._Scissor(renderer, null, true);
      renderer.autoClear = autoClear;
      renderer.shadowMap.autoUpdate = shadowAuto;
      renderer.setClearColor(this.savedClear, alpha);
      renderer.setRenderTarget(previous);
    }
    const extent = size * texelM;
    const cx = (this.index.ix + 0.5) * texelM, cz = (this.index.iz + 0.5) * texelM;
    TerrainTrailUniforms.uTrailMap.value = this.target.texture;
    TerrainTrailUniforms.uTrailWindow.value.set(cx, cz, 1 / extent, 1);
    TerrainTrailUniforms.uTrailInfo.value.set(texelM, extent / 2 - WIN.edgeFadeM, WIN.edgeFadeM, 0);
    ctx.terrainTrails = this.target;
  }

  /**
   * 进关预热（Script_Main.WarmLevel）：印章与减淡这两只材质的程序只在第一枚脚印 / 第一次减淡那一帧才编
   * （2026-10-01 存档画质扔弹测试：减淡在出手后第 13 帧现编）。它们各在自己的小场景里、对着痕迹靶画，
   * 程序键里灯光数是 0、输出色彩空间与色调映射取的是这张靶 —— 并进主场景的代理组走 CompileAsRendered
   * 编出来的是带关卡灯光的孪生，用不上。所以照 Render 的状态各真画一次：一枚尺寸 0、强度 0 的印章
   * （MAX 混合，退化四边形不出片元）、一趟 0 减淡（反向减 0），靶上的内容一个纹素不变，历史与统计不碰。
   * 画质档不开痕迹（白盒 / low）时什么都不做。
   * @returns {boolean} 画了没有
   */
  Warm(renderer) {
    const tier = this._Tier();
    if (!renderer || !tier) return false;
    this._EnsureTarget(tier);
    const previous = renderer.getRenderTarget();
    const autoClear = renderer.autoClear, shadowAuto = renderer.shadowMap.autoUpdate;
    const I = this.inst;
    try {
      renderer.autoClear = false;
      renderer.shadowMap.autoUpdate = false;
      this._Scissor(renderer, null);
      this.stampMaterial.uniforms.uTarget.value.set(tier.size, tier.size);
      I.center.array.fill(0, 0, 2); I.axis.array[0] = 1; I.axis.array[1] = 0; I.size.array.fill(0, 0, 2);
      I.cell.array[0] = 0; I.strength.array.fill(0, 0, 4); I.fade.array.fill(0, 0, 4);
      for (const attr of Object.values(I)) {
        attr.clearUpdateRanges?.();
        attr.addUpdateRange?.(0, attr.itemSize);
        attr.needsUpdate = true;
      }
      this.stampGeometry.instanceCount = 1;
      renderer.render(this.stampScene, this.camera);
      this.decayMaterial.uniforms.uDecay.value.set(0, 0, 0);
      renderer.render(this.decayScene, this.camera);
    } finally {
      this.stampGeometry.instanceCount = 0;
      this._Scissor(renderer, null, true);
      renderer.autoClear = autoClear;
      renderer.shadowMap.autoUpdate = shadowAuto;
      renderer.setRenderTarget(previous);
    }
    return true;
  }

  /** texel = null：整张（关剪裁）。每次都重新 setRenderTarget，three 才把剪裁框下到 GL。 */
  _Scissor(renderer, texel, release = false) {
    const target = this.target;
    if (!target) return;
    if (texel) { target.scissor.set(texel.x, texel.y, texel.w, texel.h); target.scissorTest = true; }
    else { target.scissor.set(0, 0, target.width, target.height); target.scissorTest = false; }
    if (!release) renderer.setRenderTarget(target);
  }

  _DrawHistory(renderer, rect, size, texelM) {
    this._Begin();
    const n = this.system.history.Query(rect, this.system.time, WIN.lifeS, (stamp) => this._Push(renderer, stamp, size, texelM));
    this._Flush(renderer);
    this.stats.restamped += n;
  }

  _DrawPersistent(renderer, rect, size, texelM) {
    const list = this.system.history.persistent;
    if (!list.length) return;
    this._Begin();
    for (let k = 0; k < list.length; k++) {
      const p = list[k];
      const rad = StampRadius(p);
      if (rect && (p.x + rad < rect.minX || p.x - rad > rect.maxX || p.z + rad < rect.minZ || p.z - rad > rect.maxZ)) continue;
      this._Push(renderer, p, size, texelM);
    }
    this._Flush(renderer);
  }

  _Begin() { this.count = 0; }

  _Push(renderer, stamp, size, texelM) {
    for (const [px, pz] of StampCopies(stamp, texelM, size)) {
      if (this.count >= BATCH) this._Flush(renderer);
      const i = this.count++;
      const I = this.inst;
      I.center.array[i * 2] = px; I.center.array[i * 2 + 1] = pz;
      I.axis.array[i * 2] = stamp.dirX; I.axis.array[i * 2 + 1] = stamp.dirZ;
      I.size.array[i * 2] = stamp.quadW / texelM; I.size.array[i * 2 + 1] = stamp.quadL / texelM;
      I.cell.array[i] = stamp.cell;
      I.strength.array[i * 4] = stamp.r; I.strength.array[i * 4 + 1] = stamp.g;
      I.strength.array[i * 4 + 2] = stamp.b; I.strength.array[i * 4 + 3] = stamp.a || 0;
      I.fade.array[i * 4] = stamp.fr || 0; I.fade.array[i * 4 + 1] = stamp.fg || 0;
      I.fade.array[i * 4 + 2] = stamp.fb || 0; I.fade.array[i * 4 + 3] = stamp.fa || 0;
    }
  }

  _Flush(renderer) {
    if (!this.count) return;
    for (const attr of Object.values(this.inst)) {
      attr.clearUpdateRanges?.();
      attr.addUpdateRange?.(0, this.count * attr.itemSize);
      attr.needsUpdate = true;
    }
    this.stampGeometry.instanceCount = this.count;
    renderer.render(this.stampScene, this.camera);
    this.stats.drawn += this.count;
    this.count = 0;
  }

  /** 调试 / 测试：读靶上一个世界点的 [R, G, B]（0..255）。同步读回，别在帧循环里用。 */
  ReadTexel(renderer, x, z) {
    const rgba = this.ReadTexelRgba(renderer, x, z);
    return rgba ? [rgba[0], rgba[1], rgba[2]] : null;
  }

  /** 调试 / 测试：读靶上一个世界点的 [R, G, B, A]（0..255，A = 宏观深车辙）。 */
  ReadTexelRgba(renderer, x, z) {
    if (!this.target || !this.tier) return null;
    const { size, texelM } = this.tier;
    const px = ((Math.floor(x / texelM) % size) + size) % size, pz = ((Math.floor(z / texelM) % size) + size) % size;
    const out = new Uint8Array(4);
    renderer.readRenderTargetPixels(this.target, px, pz, 1, 1, out);
    return [out[0], out[1], out[2], out[3]];
  }

  /** 调试视图：把靶送屏（RGB = 坑深 / 泥边 / 踩乱）。 */
  GetDebugSource(view) {
    if (view !== "terrainTrails") return null;
    return this.target && this.valid ? { texture: this.target.texture, mode: "rgb" } : { texture: null, unavailable: true };
  }

  Describe() {
    return {
      tier: this.tier ? { size: this.tier.size, texelM: this.tier.texelM } : null,
      index: this.index, valid: this.valid, stats: { ...this.stats },
    };
  }

  Dispose() {
    this.Idle();
    this.target?.dispose(); this.target = null; this.tier = null; this.index = null;
    if (this.pipeline.targets?.terrainTrails) delete this.pipeline.targets.terrainTrails;
    this.atlas.dispose();
    this.stampGeometry.dispose(); this.stampMaterial.dispose();
    this.decayMaterial.dispose(); this.decayScene.children[0].geometry.dispose();
  }
}
