import {
  GRAPHICS_PROFILES, GRAPHICS_PROFILE_STORAGE_KEY, DEFAULT_GRAPHICS_PROFILE, ResolveGraphicsProfile,
} from "./Data_Tuning_Graphics.mjs";

function Read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function Write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; }
}

/**
 * 这一局用哪一档：地址栏 `?quality=` 优先，其次玩家存的档，都不是画质档就是默认档。
 * 游戏与各个编辑器（含白盒编辑器）同一套规矩；存档里残留的旧值 "whitebox" 当没存。
 */
export function LoadGraphicsProfile(search = "") {
  const requested = new URLSearchParams(search).get("quality");
  return ResolveGraphicsProfile(requested, Read(GRAPHICS_PROFILE_STORAGE_KEY, null));
}
export function SaveGraphicsProfile(profile) {
  if (!GRAPHICS_PROFILES.includes(profile)) throw new Error(`Unknown graphics profile: ${profile}`);
  return Write(GRAPHICS_PROFILE_STORAGE_KEY, profile);
}

export function CreateGraphicsProfileApi({ profile, post }) {
  return {
    Inspect() {
      return {
        profile, defaultProfile: DEFAULT_GRAPHICS_PROFILE, tier: post.quality,
        allowedPasses: post.passes.map((p) => p.name),
        renderedPasses: [...(post.lastRenderedPasses || [])],
      };
    },
    Select(next) {
      SaveGraphicsProfile(next);
      const url = new URL(location.href);
      url.searchParams.set("quality", next);
      location.href = url.href;
    },
  };
}
