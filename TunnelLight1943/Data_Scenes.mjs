// 场景数据的加载器与解析器。
//
// 两份 JSON 各管一半，合起来才是一个物体的完整描述：
//   Data_Scenes.json    这个物体在哪（x / level / w / h / 旗标门）
//   Data_PropArt.json   这一类物体长什么样、埋多深（画笔 / 深度带 / 烘焙画布）
// 深度带的数值定义在 Data_DepthSpec.mjs。
//
// 这里做三件事：读进来、把带名解析成 z、**在加载时就把配错的地方抛出来**——
// 场景数据配错的代价是"某个东西在画面上不见了"，那是最难查的一类 bug，
// 所以宁可开局就崩，也不要静默地少画一个物体。
import { BAND } from "./Data_DepthSpec.mjs";

// 贴图像素 / 世界米。整套美术的尺寸标尺，渲染层也从这里取。
export const PPM = 48;
// 贴图超采样档（世界尺寸不变，只是贴图更密）
// hint 档 12：引导气泡/失败「！」总在 3.2m 过肩特写里出镜（密度 ~600px/米），
// 4x 顶不住——页内 A/B 实测 12 才不糊（边缘梯度 46→167）。贴图很小，代价可忽略。
// closeup 给会被推到 2m 以内特写的主角道具——门框在划线那一拍占了半个画面，
// prop 那一档在这个景别下就开始糊了
export const SS = { prop: 4, detail: 3, hint: 12, closeup: 8 };

// 本模块自己是带版本戳进来的（index.html 的 import map），把那个戳原样接到
// JSON 上——不然场景数据会独自留在手机缓存里：代码是新的、物体位置是旧的。
// Node 那边 import.meta.url 没有 query，天然是空串。
const DATA_VER = new URL(import.meta.url).search;

// 同构读取：Node 走 fs，浏览器走 fetch。两边都是 ESM 顶层 await，
// 调用方什么都不用改（模块图会等它加载完）。
async function LoadJson(name) {
  const isNode = typeof process !== "undefined" && !!process.versions?.node;
  // fs 读不了带 query 的 URL，所以版本戳只加在 fetch 这条路上
  const url = new URL(isNode ? name : name + DATA_VER, import.meta.url);
  const text = isNode
    ? await (await import("node:fs/promises")).readFile(url, "utf8")
    : await (await fetch(url)).text();
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`${name} 不是合法 JSON：${e.message}`);
  }
}

const [SCENE_DATA, ART_DATA] = await Promise.all([
  LoadJson("./Data_Scenes.json"),
  LoadJson("./Data_PropArt.json"),
]);

export const PROP_ART = ART_DATA.props;
export const COVER_ART = ART_DATA.covers;
export const COVER_BANDS = ART_DATA.coverBands;

// ---------------------------------------------------------------------------
// 校验：配错就抛，不静默少画
// ---------------------------------------------------------------------------
function CheckSpec(kind, spec, where) {
  if (spec.drawnBy) return;            // 有意不在 AddProp 里画的
  if (!spec.art) throw new Error(`${where} 的 ${kind} 没有 art（画笔函数名）`);
  if (!spec.sprite) throw new Error(`${where} 的 ${kind} 没有 sprite（烘焙画布）`);
  for (const s of [spec.sprite, spec.spriteBig]) {
    if (!s) continue;
    for (const axis of ["w", "h"]) {
      const v = s[axis];
      if (typeof v === "number") continue;
      if (v && typeof v.pad === "number" && typeof v.per === "string") continue;
      throw new Error(`${where} 的 ${kind}.sprite.${axis} 应是数字或 {pad, per}，实为 ${JSON.stringify(v)}`);
    }
    if (s.anchor !== "center" && typeof s.anchor !== "number") {
      throw new Error(`${where} 的 ${kind}.sprite.anchor 应是 "center" 或像素数`);
    }
    if (typeof s.baseline !== "number") throw new Error(`${where} 的 ${kind}.sprite.baseline 必须是数字`);
  }
}

for (const [kind, spec] of Object.entries(PROP_ART)) {
  if (spec.band !== undefined && BAND[spec.band] === undefined) {
    throw new Error(`Data_PropArt: ${kind}.band = "${spec.band}" 不在 Data_DepthSpec 的 BAND 表里`);
  }
  CheckSpec(kind, spec, "props");
}
for (const [kind, spec] of Object.entries(COVER_ART)) CheckSpec(kind, spec, "covers");
for (const b of [COVER_BANDS.low, ...COVER_BANDS.tallPick]) {
  if (BAND[b] === undefined) throw new Error(`Data_PropArt: coverBands 的 "${b}" 不在 BAND 表里`);
}

export const SCENES = SCENE_DATA.scenes;

// 场景里出现的每一种 kind 都必须在美术表里登记过——漏一个就是"这东西不见了"
for (const [key, scene] of Object.entries(SCENES)) {
  for (const p of scene.props || []) {
    if (!PROP_ART[p.kind]) throw new Error(`场景 ${key} 的 ${p.id} 用了没登记的 kind "${p.kind}"（补进 Data_PropArt.json 的 props）`);
  }
  for (const c of scene.covers || []) {
    if (!COVER_ART[c.kind]) throw new Error(`场景 ${key} 的掩体 ${c.id} 用了没登记的 kind "${c.kind}"（补进 Data_PropArt.json 的 covers）`);
  }
  // 行走线上的物体跑到行走范围外＝玩家永远走不到它跟前，多半是坐标打错了。
  // 背景带（远景建筑/院墙/炮楼/牢房）本来就在走不到的地方，不查。
  const surf = scene.walk?.surface;
  const REACHABLE = new Set(["walk", "nearBack", "loose", "clutter"]);
  for (const p of scene.props || []) {
    if (!surf || (p.level || "surface") !== "surface") continue;
    if (!REACHABLE.has(PROP_ART[p.kind].band)) continue;
    if (p.x < surf[0] - 4 || p.x > surf[1] + 4) {
      console.warn(`[scene] ${key}/${p.id}（${p.kind}）在 x=${p.x}，玩家走不到：地表行走范围只有 [${surf}]`);
    }
  }
}

// 冻结：场景数据是只读的事实，运行时状态一律进 state，别往这上面挂
const Freeze = (o) => {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) Freeze(v);
  }
  return o;
};
Freeze(SCENES);
Freeze(PROP_ART);
Freeze(COVER_ART);

// ---------------------------------------------------------------------------
// 解析：把 JSON 里的声明算成渲染层要的数字
// ---------------------------------------------------------------------------
function Axis(v, obj) {
  if (typeof v === "number") return v;
  const meters = obj[v.per] ?? v.default ?? 0;
  return v.pad + meters * PPM;
}

/**
 * 求一个物体的烘焙参数与落位。
 * @returns null 表示这一类不在 AddProp 里画（见 drawnBy）
 *   { w, h, ax, ay, ss, z, yOffset, placeAt, shadow, art }
 *   w/h 画布像素，ax/ay 贴图里对准世界锚点的那一点，z 深度带的值
 */
export function SpriteOf(kind, obj = {}, { cover = false } = {}) {
  const spec = (cover ? COVER_ART : PROP_ART)[kind];
  if (!spec) throw new Error(`没登记的 kind "${kind}"`);
  if (spec.drawnBy) return null;
  const s = (obj.big && spec.spriteBig) ? spec.spriteBig : spec.sprite;
  const w = Axis(s.w, obj);
  const h = Axis(s.h, obj);
  return {
    art: spec.art,
    w,
    h,
    ax: s.anchor === "center" ? w / 2 : s.anchor,
    ay: h - s.baseline,          // 脚踩地平线：底边往上数 baseline 像素
    ss: SS[spec.ss] ?? SS.prop,
    z: spec.band !== undefined ? BAND[spec.band] : undefined,
    yOffset: spec.yOffset || 0,
    placeAt: spec.placeAt || "center",
    shadow: spec.shadow,
    drawSize: spec.drawSize,
    drawHeightPx: spec.drawHeightPx,
    variants: spec.variants,
  };
}

/** 掩体的深度带：矮的进 clutter 挡人，高的退到后面（按 id 稳定二选一） */
export function CoverBandOf(c, hash01) {
  const tall = COVER_BANDS.alwaysTall.includes(c.kind) || (c.h || 0.9) > COVER_BANDS.lowMaxHeight;
  if (!tall) return BAND[COVER_BANDS.low];
  const pick = COVER_BANDS.tallPick;
  return BAND[hash01 < 0.5 ? pick[0] : pick[1]];
}
