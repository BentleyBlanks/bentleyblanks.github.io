export const shortcutDefinitions = Object.freeze([
  Object.freeze({ id: "togglePause", label: "暂停 / 执行计划", description: "在规划暂停与行动之间切换", defaultCode: "Space" }),
  Object.freeze({ id: "selectUnit1", label: "选择 1 号队员", description: "Shift 可追加到当前选择", defaultCode: "F1" }),
  Object.freeze({ id: "selectUnit2", label: "选择 2 号队员", description: "Shift 可追加到当前选择", defaultCode: "F2" }),
  Object.freeze({ id: "selectUnit3", label: "选择 3 号队员", description: "Shift 可追加到当前选择", defaultCode: "F3" }),
  Object.freeze({ id: "selectUnit4", label: "选择 4 号队员", description: "Shift 可追加到当前选择", defaultCode: "F4" }),
  Object.freeze({ id: "cycleUnit", label: "切换队员", description: "Shift 反向切换", defaultCode: "Tab" }),
  Object.freeze({ id: "primaryAbility", label: "主能力", description: "使用所选队员的第一个能力", defaultCode: "Digit1" }),
  Object.freeze({ id: "secondaryAbility", label: "副能力", description: "使用所选队员的第二个能力", defaultCode: "Digit2" }),
  Object.freeze({ id: "interact", label: "互动", description: "对附近目标下达互动指令", defaultCode: "KeyF" }),
  Object.freeze({ id: "executePlan", label: "执行计划", description: "仅在规划暂停时恢复行动", defaultCode: "Enter" }),
]);

const supportedShortcutPattern = /^(?:Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-2])|Space|Tab|Enter|Backspace|Delete|Home|End|PageUp|PageDown|Arrow(?:Up|Down|Left|Right))$/;

const shortcutLabels = Object.freeze({
  Space: "空格",
  Tab: "Tab",
  Enter: "Enter",
  Backspace: "Backspace",
  Delete: "Delete",
  Home: "Home",
  End: "End",
  PageUp: "Page Up",
  PageDown: "Page Down",
  ArrowUp: "↑",
  ArrowDown: "↓",
  ArrowLeft: "←",
  ArrowRight: "→",
});

export function IsSupportedShortcutCode(code) {
  return supportedShortcutPattern.test(code ?? "");
}

export function NormalizeShortcuts(candidate = {}) {
  const normalized = {};
  for (const definition of shortcutDefinitions) {
    const value = candidate?.[definition.id];
    normalized[definition.id] = IsSupportedShortcutCode(value) ? value : definition.defaultCode;
  }
  return new Set(Object.values(normalized)).size === shortcutDefinitions.length
    ? normalized
    : Object.fromEntries(shortcutDefinitions.map((definition) => [definition.id, definition.defaultCode]));
}

export function FormatShortcut(code) {
  if (shortcutLabels[code]) return shortcutLabels[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  return code ?? "未设置";
}

export function GetShortcutDefinition(id) {
  return shortcutDefinitions.find((definition) => definition.id === id) ?? null;
}
