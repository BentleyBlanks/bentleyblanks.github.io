import { NormalizeShortcuts } from "./Data_Shortcuts.mjs";

export const visualSettingDefaults = Object.freeze({
  muted: false,
  tutorialClosed: false,
  quality: "auto",
  uiScale: "normal",
  screenEffects: true,
  reducedMotion: false,
});

export function NormalizeVisualSettings(candidate = {}, prefersReducedMotion = false) {
  const quality = ["auto", "low", "high", "ultra"].includes(candidate.quality)
    ? candidate.quality
    : visualSettingDefaults.quality;
  const uiScale = ["compact", "normal", "large"].includes(candidate.uiScale)
    ? candidate.uiScale
    : visualSettingDefaults.uiScale;
  return {
    ...visualSettingDefaults,
    ...candidate,
    muted: Boolean(candidate.muted),
    tutorialClosed: Boolean(candidate.tutorialClosed),
    quality,
    uiScale,
    screenEffects: candidate.screenEffects !== false,
    shortcuts: NormalizeShortcuts(candidate.shortcuts),
    reducedMotion: candidate.reducedMotion === undefined
      ? Boolean(prefersReducedMotion)
      : Boolean(candidate.reducedMotion),
  };
}

export function GetTacticalReadout(state, selectedUnit, awarenessInvestigate = 58) {
  const currentEnemies = (state.enemies ?? []).filter(
    (enemy) => enemy.currentVisible && !enemy.disabled && enemy.health > 0,
  );
  const visibleAwareness = currentEnemies.reduce(
    (maximum, enemy) => Math.max(maximum, enemy.awareness ?? 0),
    0,
  );
  const concealment =
    state.alertLevel >= 3
      ? { key: "combat", glyph: "危", label: "交火暴露" }
      : selectedUnit.hidden
        ? { key: "hidden", glyph: "隐", label: "草木掩护" }
        : selectedUnit.inLight
          ? { key: "lit", glyph: "灯", label: "处于照明" }
          : selectedUnit.stance === "crouch"
            ? { key: "low", glyph: "低", label: "低姿移动" }
            : { key: "open", glyph: "露", label: "缺少遮蔽" };
  const awarenessLabel =
    currentEnemies.length === 0
      ? "未建立接触"
      : visibleAwareness >= 92
        ? "已识破"
        : visibleAwareness >= awarenessInvestigate
          ? "正在确认"
          : visibleAwareness >= 20
            ? "有所警觉"
            : "尚未起疑";
  return {
    concealment,
    visibleAwareness,
    awarenessLabel,
    currentEnemyCount: currentEnemies.length,
  };
}
