// 《台儿庄：血战滕县》室内天光遮蔽：屋里比屋外暗，光从门窗进来（2026-09-28，第一关）。
//
// 口径：docs/Data_TechRenderPipeline.md §5.11「室内天光遮蔽」；数值 Data_Tuning_Lights.INTERIOR_SKY；
// 屋子与口子 Data_FirstLevelInteriors（BuildInteriorVolumes 按布局自动找门窗缺口）。
//
// ## 做法
// 帧图里紧跟 `gtao` 的一趟半分辨率 blit：读 GTAO 的最终 AO 图（R = 可见度、GB = 弯曲法线、
// A = 线性视深），用 A 还原世界坐标，落在某间屋子内框里就把 R 再乘一个室内天光可见度，
// 写进自己的 `combined` 靶；`PostPipeline.AoTexture` 在有屋子时改指这张。材质端的 AO 补丁
// 原样把它乘进 indirectDiffuse / 镜面遮蔽 —— **只压间接光**（契约 6），直射光仍由阴影管，
// 马灯、火这些簇光是直接光，不受影响。
//
// ## 为什么不是材质补丁 / 不是探针 GI
//   · 材质补丁：每份材质多挂几十个 vec4 的 uniform 数组，three 对数组 uniform 不缓存，
//     每次换材质整组重传；第一关是 CPU 提交瓶颈（~21 µs/draw），不划算。
//   · 探针体 GI（Script_Gi）：出厂关（+1.4 ms），且代理体是碰撞盒 —— 第一关屋顶檐以上
//     是非实心的，探针照样看得见天，屋里暗不下来。
// 这一趟是全屏一次 blit + 每像素十来个盒子判定，零采样器（材质那边）、零材质改动。
//
// ## 接线
//   · `SetInteriorVolumes(volumes)`：关卡建好时由场地调一次（第一关 FirstLevelWhiteboxField），
//     拆关时传 null。没有屋子时 pass 不跑、AoTexture 退回 GTAO 原图 —— 别的关逐比特不变。
//   · low 档没有 GTAO（preset.ssao = false），这一趟也不跑。
import * as THREE from "three";
import { MakeFullscreenMaterial, MakeRenderTarget, GLSL_VIEW_POS } from "./Script_PostCommon.mjs";
import { INTERIOR_SKY } from "./Data_Tuning_Lights.mjs";
import { INTERIOR_LIMITS } from "./Data_FirstLevelInteriors.mjs";

const ROOMS = INTERIOR_LIMITS.rooms;
const PORTALS = INTERIOR_LIMITS.portals;

/** 全场唯一一份（场地在建关时写，pass 每帧读）。 */
const state = {
  roomCount: 0,
  portalCount: 0,
  roomMin: new Float32Array(ROOMS * 4),
  roomMax: new Float32Array(ROOMS * 4),
  portalA: new Float32Array(PORTALS * 4),
  portalB: new Float32Array(PORTALS * 4),
  volumes: [],
};

/**
 * 装一关的室内遮蔽体（`Data_FirstLevelInteriors.BuildInteriorVolumes` 的输出）；null / [] = 清空。
 * 超出上限的屋子 / 口子按表序截断并警告（表是手写的，超了说明该调 INTERIOR_LIMITS）。
 */
export function SetInteriorVolumes(volumes) {
  const list = Array.isArray(volumes) ? volumes : [];
  state.volumes = list;
  state.roomMin.fill(0); state.roomMax.fill(0); state.portalA.fill(0); state.portalB.fill(0);
  let rooms = 0, portals = 0;
  for (const room of list) {
    if (rooms >= ROOMS) { console.warn(`[InteriorSky] 屋子超过 ${ROOMS} 间，其余不画`); break; }
    state.roomMin.set([...room.min, room.dark], rooms * 4);
    state.roomMax.set([...room.max, 0], rooms * 4);
    for (const portal of room.portals) {
      if (portals >= PORTALS) { console.warn(`[InteriorSky] 口子超过 ${PORTALS} 个，其余不算`); break; }
      state.portalA.set([...portal.center, portal.area], portals * 4);
      state.portalB.set([...portal.normal, rooms], portals * 4);
      portals += 1;
    }
    rooms += 1;
  }
  state.roomCount = rooms;
  state.portalCount = portals;
  return rooms;
}

/** 取证：当前装了几间屋子、几个口子。 */
export function InteriorVolumeStats() {
  return { rooms: state.roomCount, portals: state.portalCount, ids: state.volumes.map((v) => v.id) };
}

// 与 Data_FirstLevelInteriors.InteriorSkyVisibility **逐项同式**（纯 Node 门禁拿那份量读数）。
const FRAG = /* glsl */`
uniform sampler2D uAo;
uniform mat4 uInvView;
uniform vec2 uProjScale;
uniform vec4 uRoomMin[${ROOMS}];     // xyz 内框最小角，w = 屋子最深处的可见度 dark
uniform vec4 uRoomMax[${ROOMS}];     // xyz 内框最大角
uniform vec4 uPortalA[${PORTALS}];   // xyz 口子中心，w = 面积
uniform vec4 uPortalB[${PORTALS}];   // xyz 朝屋里的法线，w = 所属屋子序号
uniform float uRoomCount;
uniform float uPortalCount;
uniform vec4 uTuning;                // x gain, y cosFloor, z soften, w strength
uniform vec2 uFeather;               // x 水平过渡带, y 顶棚之上过渡带
varying vec2 vUv;
${GLSL_VIEW_POS}

float InteriorSkyVisibility(vec3 p) {
  float vis = 1.0;
  for (int i = 0; i < ${ROOMS}; i++) {
    if (float(i) >= uRoomCount) break;
    vec3 lo = uRoomMin[i].xyz, hi = uRoomMax[i].xyz;
    vec3 q = max(lo - p, p - hi);
    float inside = (1.0 - smoothstep(0.02, uFeather.x, max(q.x, q.z)))
      * (1.0 - smoothstep(0.0, uFeather.y, q.y));
    if (inside <= 0.0) continue;
    float light = 0.0;
    for (int j = 0; j < ${PORTALS}; j++) {
      if (float(j) >= uPortalCount) break;
      if (abs(uPortalB[j].w - float(i)) > 0.5) continue;
      vec3 d = p - uPortalA[j].xyz;
      float d2 = dot(d, d);
      float cosT = d2 < 1.0e-6 ? 1.0 : dot(d, uPortalB[j].xyz) * inversesqrt(d2);
      float facing = max(0.0, cosT * (1.0 - uTuning.y) + uTuning.y);
      light += uTuning.x * uPortalA[j].w * facing / (3.14159265 * (d2 + uPortalA[j].w * uTuning.z));
    }
    float dark = uRoomMin[i].w;
    float roomVis = clamp(dark + light, dark, 1.0);
    vis = min(vis, mix(1.0, roomVis, inside));
  }
  return mix(1.0, vis, uTuning.w);
}

void main() {
  vec4 ao = texture2D(uAo, vUv);
  // A = 0：天空 / AO 没有数据（材质端的升采样同样跳过这种纹素），原样放过
  if (ao.a <= 0.0) { gl_FragColor = ao; return; }
  vec3 world = (uInvView * vec4(ViewPosFromDepth(vUv, ao.a, uProjScale), 1.0)).xyz;
  gl_FragColor = vec4(ao.r * InteriorSkyVisibility(world), ao.gba);
}
`;

/**
 * 帧图 pass（契约见 docs §1.3）。紧跟 `gtao`、排在 `main` 之前（材质要本帧的 AO）。
 */
export class InteriorSkyPass {
  constructor(pipeline) {
    this.name = "interiorSky";
    this.pipeline = pipeline;
    this.uniforms = {
      uAo: { value: null },
      uInvView: { value: new THREE.Matrix4() },
      uProjScale: { value: new THREE.Vector2(1, 1) },
      uRoomMin: { value: state.roomMin },
      uRoomMax: { value: state.roomMax },
      uPortalA: { value: state.portalA },
      uPortalB: { value: state.portalB },
      uRoomCount: { value: 0 },
      uPortalCount: { value: 0 },
      uTuning: { value: new THREE.Vector4() },
      uFeather: { value: new THREE.Vector2() },
    };
    this.material = MakeFullscreenMaterial(FRAG, this.uniforms);
    this.combined = null;
  }

  /** 有屋子、GTAO 在跑、靶建好了才跑。 */
  Enabled(ctx) {
    return state.roomCount > 0 && ctx.preset.ssao !== false && !!ctx.preset.gtao
      && !!this.combined && INTERIOR_SKY.strength > 0;
  }

  /**
   * 材质端该采的 AO 图：本关有屋子时是这张（每帧都会写），否则 null（调用方退回 GTAO 原图）。
   * 材质的 uniform 在 post.Render **之前**同步，所以这里只看「有没有屋子」，不看本帧跑没跑 ——
   * 屋子只在建关 / 拆关时变，那一帧的滞后看不出来。
   */
  get CombinedTexture() {
    const on = state.roomCount > 0 && INTERIOR_SKY.strength > 0 && this.combined
      && this.pipeline.preset.ssao !== false && !!this.pipeline.preset.gtao;
    return on ? this.combined.texture : null;
  }

  Resize() {
    if (this.combined) this.combined.dispose();
    this.combined = null;
    const ao = this.pipeline.targets.aoBlur;
    if (!ao) return;
    // 与 GTAO 最终靶同尺寸同格式（RGBA16F）：GB 的弯曲法线与 A 的视深原样带过去，
    // 材质端的联合双边升采样照旧按 A 挑纹素。
    this.combined = MakeRenderTarget(ao.width, ao.height, {
      type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
    });
    this.combined.texture.name = "gtaoInteriorSky";
  }

  Render(ctx) {
    const U = this.uniforms;
    U.uAo.value = ctx.targets.aoBlur.texture;
    U.uInvView.value.copy(ctx.invView);
    U.uProjScale.value.copy(ctx.projScale);
    U.uRoomCount.value = state.roomCount;
    U.uPortalCount.value = state.portalCount;
    U.uTuning.value.set(INTERIOR_SKY.gain, INTERIOR_SKY.cosFloor, INTERIOR_SKY.soften, INTERIOR_SKY.strength);
    U.uFeather.value.set(INTERIOR_SKY.featherH, INTERIOR_SKY.featherTop);
    ctx.blitter.Blit(this.material, this.combined);
  }

  Dispose() {
    if (this.combined) this.combined.dispose();
    this.combined = null;
    this.material.dispose();
  }
}
