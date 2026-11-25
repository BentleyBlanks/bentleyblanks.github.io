// 测试场插件共用小工具（零业务依赖，供各独立按需插件模块共用）。

/** 把一个测试场运行时包成统一接口；`hooks` 里给的才接，没给的装配层一律不调。 */
export function SandboxInstance(runtime, hooks = {}) {
  return {
    runtime,
    api: runtime?.api ?? null,
    debugName: null,
    updateSlot: null,
    ownsFrame: false,
    dropDebugOnDispose: false,
    Update(dt) { runtime?.Update?.(dt); },
    Dispose() { runtime?.Dispose?.(); },
    ...hooks,
  };
}

/** 炮击扬尘与人物反应两个场共用的构造参数。 */
export function FireRangeOptions(h) {
  return {
    battlefield: h.battlefield, combat: h.combat, player: h.player, camera: h.camera, scene: h.scene,
    library: h.library, vfx: h.vfx, audio: h.audio, hud: h.hud, canvas: h.canvas,
    CanUse: h.CanUse, Focus: h.Focus, SetViewmodelHidden: h.SetViewmodelHidden,
  };
}
