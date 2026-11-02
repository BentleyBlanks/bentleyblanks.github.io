// ===========================================================================
// Script_DeferredMaterialDispose.mjs —— 换关拆场地时，旧材质等新场地预热完再释放
//
// 由头（2026-11-02，第一关「阶段跳转」每次都要重新预热）：跳段走整关重建，拆旧场地时
// 材质一 dispose，three 按引用计数把没人用的着色器连源码缓存一起删掉；新场地的材质是新
// 对象、缓存键却与旧的一模一样，只能从头再编一遍。实测每次跳段删 41–45 个、重编 40–53 个，
// 其中八到九成是旧的同一份（docs/Data_TechRenderPipeline.md §18.10）。
//
// 做法：拆场地那几段**同步**代码里调用的 `material.dispose()` 先记下、不执行（只在 Collect
// 包着的那一次调用期间替换 Material.prototype.dispose，与 Script_ShadowDepth 的
// WithShadowDepthRekey 换原型钩子同一路子）；新场地预热完、同键的着色器已经被新材质接走，
// 再 Flush 真释放 —— 这时旧材质一放，引用数归不了零，着色器留给新材质接着用。
//
// Flush 跳过新场地还挂着的同一只材质：那是旧主人释放了、新场地又接着用的共享件，
// 现在才释放会让它丢掉着色器、在下一帧现编。
// ===========================================================================

import * as THREE from "three";

export class DeferredMaterialDispose {
  constructor() {
    /** @type {Set<THREE.Material>} 已经「释放」、还没真释放的旧材质 */
    this.pending = new Set();
  }

  /**
   * 跑 fn，期间调用的 material.dispose() 一律记下不执行。
   * **fn 必须是同步的**：替换只在这一次调用期间生效，跨 await 会截到不相干的释放。
   */
  Collect(fn) {
    const proto = THREE.Material.prototype;
    const descriptor = Object.getOwnPropertyDescriptor(proto, "dispose");
    const pending = this.pending;
    proto.dispose = function DeferredDispose() { pending.add(this); };
    try {
      return fn();
    } finally {
      Object.defineProperty(proto, "dispose", descriptor);
    }
  }

  /**
   * 真释放记下的旧材质。
   * @param {Set<THREE.Material>} inUse 新场地还挂着的材质（跳过）
   * @returns {{ disposed: number, kept: number }}
   */
  Flush(inUse = new Set()) {
    let disposed = 0, kept = 0;
    for (const material of this.pending) {
      if (inUse.has(material)) { kept += 1; continue; }
      material.dispose();
      disposed += 1;
    }
    this.pending.clear();
    return { disposed, kept };
  }
}
