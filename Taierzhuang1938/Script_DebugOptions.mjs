// 《滕县 一九三八》调试选项：菜单与玩法共用的唯一真相。
//
// 选项独立于关内状态保存。这样换关、阵亡换人或回主菜单都不会把正在调试的
// 行为悄悄重置；读取失败（无痕窗口）则安静地退回全关。

export const DEBUG_OPTIONS_DEFAULTS = Object.freeze({
  noCollision: false,
  fastMove: false,
  invincible: false,
  infiniteAmmo: false,
  infiniteGrenades: false,
});

export const DEBUG_OPTION_KEYS = Object.freeze(Object.keys(DEBUG_OPTIONS_DEFAULTS));

const STORE_KEY = "tengxian1938_debug_options_v1";

export function NormalizeDebugOptions(value = null) {
  const source = value && typeof value === "object" ? value : {};
  const out = {};
  for (const key of DEBUG_OPTION_KEYS) out[key] = source[key] === true;
  return out;
}

export class DebugOptions {
  constructor(storage = globalThis.localStorage) {
    this.storage = storage;
    this.values = this.Read();
  }

  Read() {
    try {
      const raw = this.storage?.getItem?.(STORE_KEY);
      return NormalizeDebugOptions(raw ? JSON.parse(raw) : null);
    } catch (error) {
      return NormalizeDebugOptions();
    }
  }

  Get() { return { ...this.values }; }

  Enabled(key) { return this.values[key] === true; }

  Set(key, enabled) {
    if (!DEBUG_OPTION_KEYS.includes(key)) return this.Get();
    this.values[key] = enabled === true;
    try { this.storage?.setItem?.(STORE_KEY, JSON.stringify(this.values)); } catch (error) { /* 无痕窗口 */ }
    return this.Get();
  }

  Reset() {
    this.values = NormalizeDebugOptions();
    try { this.storage?.removeItem?.(STORE_KEY); } catch (error) { /* 无痕窗口 */ }
    return this.Get();
  }
}
