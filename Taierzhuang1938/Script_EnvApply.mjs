// 环境系统 → 渲染（docs/Data_Environment.md §6）。框架每帧拼出的环境参数与 SKY_PRESETS 同形，这里按「哪一组变了」交给现有系统：
//
//   天穹（美术层 uniform + 物理大气三张 LUT，实测 < 0.1 ms）  天 / 云 / 大气 / 太阳方向 / 雾（霾进大气透视）变了 → sky.Apply
//   平行光 + 天光探针 + 环境底色                               方向变了 → lights.ApplyPreset（级联阴影整体重烘）；
//                                                              只有色 / 强度变了 → lights.ApplyLevels（不重烘阴影）
//   探针体 GI 的增益                                            反射强度变了 → gi.ApplyPreset
//   环境反射贴图（PMREM，10–20 ms）                             天变了就记一笔，至少隔 ENV_RUNTIME.pmremIntervalS 才烘一次；
//                                                              变化停下来以后最后一次照样烘，不留旧天
//   雾、曝光、调色、泛光                                        不在这里：Script_Main 出画时把环境参数直接递给 post / vfx
//
// 组件声明了 Apply（直接作用，不走环境参数）的，每帧值变了就调它。

import { SKY_PRESETS } from "./Script_Sky.mjs";
import { ENV_RUNTIME } from "./Data_Tuning_Environment.mjs";
import { ENV_COMPONENT_LOGIC } from "./Script_EnvComponents.mjs";
import { ENV_COMPONENTS } from "./Data_EnvComponents.mjs";

const SKY_FIELDS = ["sunElevation", "sunAzimuth", "zenith", "horizon", "ground", "sunColor", "sunIntensity", "sunSize", "glow", "glowSpread",
  "smoke", "smokeColor", "smokeHeight", "cloudShape", "cloudDeck", "stars", "atmosphere", "fog", "lightIntensity", "envIntensity"];
const LIGHT_FIELDS = ["lightColor", "lightIntensity", "shProbeIntensity", "ambientColor", "ambientIntensity", "profile"];
const DIRECTION_FIELDS = ["sunElevation", "sunAzimuth"];

function Signature(preset, fields) {
  let text = "";
  for (const field of fields) text += `${field}=${JSON.stringify(preset[field] ?? null)};`;
  return text;
}

export class EnvRenderBridge {
  /**
   * @param {object} host { sky, lights, scene, gi: () => gi|null, giStrength: () => number, now?: () => ms }
   */
  constructor(host) {
    this.host = host;
    this.version = -1;
    this.skySig = null;
    this.lightSig = null;
    this.dirSig = null;
    this.envIntensity = null;
    this.envDirty = false;
    this.lastBakeMs = -Infinity;
    this.bakes = 0;
    this.preset = null;
    this.applyValues = new Map();
  }

  /** 下一次 Apply 当作全新（换关、整片重建之后：天穹与灯被别的路套过一遍）。 */
  Invalidate() { this.version = -1; this.skySig = null; this.lightSig = null; this.dirSig = null; this.envIntensity = null; }

  /**
   * @param {object} output EnvironmentSystem.Update 的输出
   * @param {{ force?: boolean }} options force：天变没变都立刻烘反射贴图（换关、刚载入）
   */
  Apply(output, { force = false } = {}) {
    if (!output) return false;
    const { sky, lights, scene } = this.host;
    const now = this.host.now ? this.host.now() : performance.now();
    if (output.version !== this.version || force) {
      this.version = output.version;
      const preset = output.preset;
      // 照明弹的昼夜口径是显式元数据（Script_Sky 末尾那一段），按后期档案取，不从亮度猜
      preset.flareSceneScale = SKY_PRESETS[preset.profile]?.flareSceneScale ?? 1;
      this.preset = preset;
      const skySig = Signature(preset, SKY_FIELDS);
      let lightPreset = preset;
      if (skySig !== this.skySig) {
        this.skySig = skySig;
        lightPreset = sky.Apply(preset);
        this.envDirty = true;
      }
      const dirSig = Signature(preset, DIRECTION_FIELDS);
      const lightSig = Signature(preset, LIGHT_FIELDS) + dirSig;
      if (dirSig !== this.dirSig) {
        this.dirSig = dirSig;
        this.lightSig = lightSig;
        lights.ApplyPreset(lightPreset, sky.sunDirection);
      } else if (lightSig !== this.lightSig) {
        this.lightSig = lightSig;
        lights.ApplyLevels(lightPreset);
      }
      if (preset.envIntensity !== this.envIntensity) {
        this.envIntensity = preset.envIntensity;
        if (scene) scene.environmentIntensity = preset.envIntensity ?? 1;
        const gi = this.host.gi?.();
        if (gi) gi.ApplyPreset(preset, this.host.giStrength?.() ?? 1);
      }
      for (const decl of ENV_COMPONENTS) {
        const apply = ENV_COMPONENT_LOGIC[decl.type]?.Apply;
        if (!apply) continue;
        const values = output.components[decl.type]?.values;
        if (values && values !== this.applyValues.get(decl.type)) { this.applyValues.set(decl.type, values); apply(decl, values, this.host); }
      }
    }
    if (this.envDirty && (force || now - this.lastBakeMs >= ENV_RUNTIME.pmremIntervalS * 1000)) {
      sky.BakeEnvironment(scene);
      if (scene) scene.environmentIntensity = this.preset?.envIntensity ?? 1;
      this.envDirty = false;
      this.lastBakeMs = now;
      this.bakes += 1;
    }
    return true;
  }

  State() {
    return { version: this.version, bakes: this.bakes, envDirty: this.envDirty, profile: this.preset?.profile ?? null };
  }
}
