// ===========================================================================
// Script_OverrideVariants.mjs —— 覆盖材质（scene.overrideMaterial）按物体种类分份
//
// 由头（2026-10-14 第一关战斗帧 CPU 取证）：深度法线预通道与第一人称自阴影深度趟都是
// 「整趟共用一只覆盖材质」。three 的 `setProgram` 拿 `object.isSkinnedMesh` / `isInstancedMesh` /
// `isBatchedMesh` / 形变去比材质上记着的那几位，蒙皮、实例、批次、普通网格交替提交时，每换一次种类就
// 整个重走 `getProgram`（建参数对象 + 拼缓存键，约 30 µs）。预通道先按种类排序（`PrepassOpaqueSort`）
// 之后一趟仍要翻 4 次（普通 → 蒙皮 → 实例 → 批次 → 回到下一帧的普通），第一人称自阴影趟 2 次。
// 排序已经到底了：只要材质对象只有一个，翻转次数就压不到 0。
//
// 做法：每种「种类」一份自己的覆盖材质，**只有 renderBufferDirect 这一步换人**。three 在
// `renderObjects` 里照旧把 `scene.overrideMaterial`（基础材质）塞给对象的 onBeforeRender 钩子与
// `material.onBeforeRender`（破口裁切 / 速度矩阵 / 前景深度这些「只为这一 draw 打开」的钩子认的就是基础材质，
// 它们改的是共用的 uniform 对象，所以对每份变体都生效），临到提交才由本模块把材质换成这个对象种类的那一份。
// 每份变体只被同一种对象用，`setProgram` 比的那几位就不再翻，`getProgram` 只在第一次出现时走一回。
//
// **程序不会变多**：变体与基础材质的 shader 源码、defines 逐字相同，three 的 program 缓存按
// 「着色器源码 + 参数」找，不看材质对象，所以第一次出现某一种类时只是 `getProgram` 命中已有的 WebGLProgram，
// 不编译、不链接（`renderer.info.programs.length` 不涨；预热口径见 docs/Data_TechRenderPipeline.md §17.19）。
// 种类的划分和 three 的程序判定位对得上（批次 / 实例 / 蒙皮 / 实例颜色 / 形变），多出来的种类也只是多一份
// 变体对象，不会影响画面。
//
// 变体与基础材质共享什么由调用方的 `create` 决定：ShaderMaterial 要共享同一个 `uniforms` 对象，
// 并让 `uniformsNeedUpdate` 这一位指向基础材质（钩子写在基础材质上，three 在变体上读）。
// ===========================================================================

/**
 * 物体种类编号（与 `Script_PostPrepass.PrepassOpaqueSort` 的排序键同一口径）：
 * 0 普通 / 16 蒙皮 / 32 实例 / 48 批次，+8 带实例颜色，+4 带形变。
 * @param {import("three").Object3D} object
 * @param {import("three").BufferGeometry} geometry
 */
export function OverrideKind(object, geometry) {
  let kind = object.isBatchedMesh ? 48 : object.isInstancedMesh ? 32 : object.isSkinnedMesh ? 16 : 0;
  if ((object.isInstancedMesh && object.instanceColor) || (object.isBatchedMesh && object.colorTexture)) kind += 8;
  const morph = geometry.morphAttributes;
  if (morph.position || morph.normal || morph.color) kind += 4;
  return kind;
}

/**
 * 一只基础覆盖材质的各种类变体。普通网格（种类 0）直接用基础材质本身。
 */
export class OverrideVariants {
  /**
   * @param {import("three").Material} base  塞给 `scene.overrideMaterial` 的那只
   * @param {(base: import("three").Material, kind: number) => import("three").Material} create  造一份变体
   */
  constructor(base, create) {
    this.base = base;
    this.create = create;
    this.byKind = new Map([[0, base]]);
    this._renderer = null;
    this._previous = null;
    this._draw = (camera, scene, geometry, material, object, group) => this._previous.call(
      this._renderer, camera, scene, geometry, material === this.base ? this.For(object, geometry) : material, object, group);
  }

  /** 这只对象该用的变体（第一次遇到这个种类时现造，之后查表）。 */
  For(object, geometry) {
    const kind = OverrideKind(object, geometry);
    let variant = this.byKind.get(kind);
    if (!variant) { variant = this.create(this.base, kind); this.byKind.set(kind, variant); }
    return variant;
  }

  /** `fn` 执行期间 renderer.renderBufferDirect 换成「按种类换人」的包装；结束原样还原。 */
  Run(renderer, fn) {
    const previous = renderer.renderBufferDirect;
    this._renderer = renderer;
    this._previous = previous;
    renderer.renderBufferDirect = this._draw;
    try {
      return fn();
    } finally {
      renderer.renderBufferDirect = previous;
      this._previous = null;
      this._renderer = null;
    }
  }

  Dispose() {
    for (const material of this.byKind.values()) if (material !== this.base) material.dispose();
    this.byKind.clear();
    this.byKind.set(0, this.base);
  }
}
