import type { Text } from "pixi.js";

// §03 卡面视觉强调：内容里用 **关键信息** 标注，渲染成高亮加粗（如「明早那个会，**几点**来着？」）。
// 没有 ** 标注的标题仍用普通 Text（HTMLText 较重，只在需要强调时才用）。
export function hasEmphasis(text: string): boolean {
  return text.includes("**");
}
export function toEmphasisHTML(text: string): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return escaped.replace(/\*\*(.+?)\*\*/g, "<em>$1</em>");
}

export function fitTextToWidth(text: Text, maxWidth: number): void {
  if (maxWidth <= 0 || text.width <= maxWidth) {
    return;
  }
  const original = text.text;
  let next = original;
  while (next.length > 2 && text.width > maxWidth) {
    next = next.slice(0, -2).trimEnd();
    text.text = `${next}…`;
  }
}

export function fallbackHeaderTime(createdAtMs: number): string {
  const total = 23 * 60 + 38 + Math.floor(createdAtMs / 60000);
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
}
