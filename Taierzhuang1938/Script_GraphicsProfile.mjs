import {
  GRAPHICS_PROFILES, GRAPHICS_PROFILE_STORAGE_KEY, WHITEBOX_STORAGE_KEY,
  WHITEBOX_CONTROLS, WHITEBOX_DEFAULTS, NormalizeWhiteboxConfig, ResolveGraphicsProfile, WhiteboxPassPlan,
} from "./Data_Tuning_Whitebox.mjs";

function Read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function Write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

export function LoadGraphicsProfile(search = "") {
  return ResolveGraphicsProfile(new URLSearchParams(search).get("quality"), Read(GRAPHICS_PROFILE_STORAGE_KEY, null));
}
export function LoadWhiteboxConfig() {
  const saved = Read(WHITEBOX_STORAGE_KEY, null);
  // Old exports saved every default, including the former white surface colour.
  // Migrate only that old default; retain deliberately chosen custom colours.
  if (saved && !("grid" in saved) && saved.surfaceColor === "#d8dadd") {
    saved.surfaceColor = WHITEBOX_DEFAULTS.surfaceColor;
  }
  if (saved && saved.schema !== WHITEBOX_DEFAULTS.schema && saved.shadows === false) delete saved.shadows;
  return NormalizeWhiteboxConfig(saved);
}
export function SaveWhiteboxConfig(config) { return Write(WHITEBOX_STORAGE_KEY, NormalizeWhiteboxConfig(config)); }
export function SaveGraphicsProfile(profile) {
  if (!GRAPHICS_PROFILES.includes(profile)) throw new Error(`Unknown graphics profile: ${profile}`);
  return Write(GRAPHICS_PROFILE_STORAGE_KEY, profile);
}

export function CreateGraphicsProfileApi({ profile, config, post, renderer }) {
  return {
    Inspect() {
      return {
        profile, defaultProfile: "whitebox", whitebox: profile === "whitebox", tier: post.quality,
        config: { ...config }, defaults: { ...WHITEBOX_DEFAULTS },
        allowedPasses: profile === "whitebox" ? WhiteboxPassPlan(config) : post.passes.map((p) => p.name),
        renderedPasses: [...(post.lastRenderedPasses || [])],
        materials: { ...renderer?.stats },
        source: "Data_Tuning_Whitebox.mjs", documentation: "docs/Data_WhiteboxQuality.md",
        controls: WHITEBOX_CONTROLS.map(([key, label, group]) => ({ key, label, group })),
      };
    },
    ConfigureWhitebox(patch, { reload = false } = {}) {
      for (const key of Object.keys(patch || {})) {
        if (!(key in WHITEBOX_DEFAULTS)) throw new Error(`Unknown whitebox option: ${key}`);
        const valid = typeof patch[key] === typeof WHITEBOX_DEFAULTS[key]
          && (typeof patch[key] !== "number" || Number.isFinite(patch[key]));
        if (!valid) throw new Error(`Invalid whitebox option: ${key}`);
      }
      const next = NormalizeWhiteboxConfig({ ...LoadWhiteboxConfig(), ...patch });
      if (!SaveWhiteboxConfig(next)) throw new Error("Cannot save whitebox configuration");
      if (reload) this.Select("whitebox");
      return { config: next, applied: false, reloadRequired: true };
    },
    ResetWhitebox({ reload = false } = {}) {
      if (!SaveWhiteboxConfig(WHITEBOX_DEFAULTS)) throw new Error("Cannot save whitebox configuration");
      if (reload) this.Select("whitebox");
      return { ...WHITEBOX_DEFAULTS };
    },
    Select(next) {
      SaveGraphicsProfile(next);
      const url = new URL(location.href);
      url.searchParams.set("quality", next);
      location.href = url.href;
    },
    ExportWhitebox() { return JSON.stringify(LoadWhiteboxConfig(), null, 2); },
  };
}
