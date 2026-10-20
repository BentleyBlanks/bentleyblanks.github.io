// 高级工具的独立音量（2026-10-20，用户：高级工具页面要有独立的音量调节）。
//
// 一份只属于高级工具的总音量：存在自己的 localStorage 键里（不碰游戏「声音」设置那份 tengxian1938_audio_v1），
// 高级工具开着时由 Script_Audio.SetToolsVolume 盖过玩家的总音量，退出高级工具清掉、回到玩家自己的音量。
// 第一次用（还没存过）时从玩家当前的总音量起步，进出高级工具不会突然变响。
// 界面：喇叭按钮（点一下静音 / 取消静音）+ 滑条 + 百分比，挂在高级工具菜单栏右侧。

import { El } from "./Script_EditorUi.mjs";

export const TOOLS_VOLUME_KEY = "tengxian1938_tools_volume_v1";

const Clamp01 = (v) => Math.min(1, Math.max(0, Number(v) || 0));

/** 读存下来的工具音量；没存过 → { volume: fallback, muted: false }。 */
export function LoadToolsVolume(fallback = 1) {
  try {
    const raw = JSON.parse(localStorage.getItem(TOOLS_VOLUME_KEY) || "null");
    if (raw && typeof raw.volume === "number") return { volume: Clamp01(raw.volume), muted: raw.muted === true };
  } catch (error) { /* 隐私模式 / 坏数据：用缺省 */ }
  return { volume: Clamp01(fallback), muted: false };
}

export function SaveToolsVolume(state) {
  try { localStorage.setItem(TOOLS_VOLUME_KEY, JSON.stringify({ volume: Clamp01(state.volume), muted: !!state.muted })); }
  catch (error) { /* 存不了就只在这次会话里有效 */ }
}

/** 真正出声的音量（静音 = 0）。 */
export const ToolsVolumeLevel = (state) => (state.muted ? 0 : Clamp01(state.volume));

const ICON_ON = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 7.5h3l4-3.5v12l-4-3.5H3z" fill="currentColor"/>'
  + '<path d="M13 7a4 4 0 0 1 0 6M15.2 4.8a7 7 0 0 1 0 10.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';
const ICON_OFF = '<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 7.5h3l4-3.5v12l-4-3.5H3z" fill="currentColor"/>'
  + '<path d="M13.2 7.6l4.6 4.8M17.8 7.6l-4.6 4.8" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>';

/**
 * 菜单栏上的音量条。state 是 LoadToolsVolume 的那个对象（就地改）；每次改完调 onChange(state) 并存盘。
 * → { root, Refresh() }
 */
export function ToolsVolumeControl(state, onChange) {
  const root = El("div", "edVolume");
  root.title = "高级工具音量（只在高级工具里生效，不改游戏里的「声音」设置）";
  const mute = El("button", "edVolumeMute");
  mute.type = "button";
  const range = El("input", "edVolumeRange");
  range.type = "range"; range.min = "0"; range.max = "100"; range.step = "1";
  range.setAttribute("aria-label", "高级工具音量");
  const value = El("output", "edVolumeValue");
  root.append(mute, range, value);
  const Changed = () => { SaveToolsVolume(state); Refresh(); onChange?.(state); };
  function Refresh() {
    const pct = Math.round(Clamp01(state.volume) * 100);
    range.value = String(pct);
    value.textContent = state.muted ? "静音" : `${pct}%`;
    mute.innerHTML = state.muted || pct === 0 ? ICON_OFF : ICON_ON;
    mute.setAttribute("aria-label", state.muted ? "取消静音" : "静音");
    mute.setAttribute("aria-pressed", String(!!state.muted));
    root.classList.toggle("muted", !!state.muted);
    range.style.setProperty("--fill", `${pct}%`);
  }
  mute.addEventListener("click", () => { state.muted = !state.muted; Changed(); });
  range.addEventListener("input", () => { state.volume = Number(range.value) / 100; state.muted = false; Changed(); });
  // 滑条上滚轮一格 5%（不往下传给视口去缩放镜头）
  root.addEventListener("wheel", (event) => {
    event.preventDefault(); event.stopPropagation();
    state.volume = Clamp01(state.volume + (event.deltaY < 0 ? 0.05 : -0.05)); state.muted = false; Changed();
  }, { passive: false });
  Refresh();
  return { root, Refresh };
}
