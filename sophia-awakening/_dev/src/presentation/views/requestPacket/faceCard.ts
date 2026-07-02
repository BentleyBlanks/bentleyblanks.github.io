import { Graphics, Text } from "pixi.js";
import { CARD_FONT } from "../../shared";

export type FaceChannel = "sms" | "notification";

// §09 短信/通知面卡的「消息气泡 + 输入禁用条」布局。
// 纯几何计算：给出线索块底沿 + 频道 + 卡宽，算出气泡下沿 / 禁用条 y / 卡高，并造好那条禁用提示文本。
// 由 RequestPacketView 负责把 cap 加进 container / clueTexts 并写回自身字段——保持原有副作用不变。
export function layoutFaceCard(
  clueBlockBottom: number,
  channel: FaceChannel,
  _cardW: number
): { faceBubbleBottom: number; faceBarY: number; cardH: number; cap: Text } {
  const faceBubbleBottom = clueBlockBottom + 6;
  const barY = faceBubbleBottom + 12;
  const label =
    channel === "notification" ? "🔕 通知 · 看过即消，无需处理" : "🚫 无法回复 · 这条你发不出去";
  const cap = new Text({
    text: label,
    style: { fill: 0x9aa7b0, fontSize: 12, fontWeight: "700", fontFamily: CARD_FONT }
  });
  cap.position.set(26, barY + 10);
  return { faceBubbleBottom, faceBarY: barY, cardH: barY + 42, cap };
}

// §09 短信/通知卡：把 title+线索包进一个消息气泡（短信带左下小尾巴），底部一条**禁用的回复输入条**，
// 一眼是「一条消息」而非需要处理的需求卡。绘制进传入的 bg，几何由参数给定。
export function drawFaceCard(
  bg: Graphics,
  opts: { W: number; channel: FaceChannel; accent: number; faceBubbleBottom: number; faceBarY: number }
): void {
  const { W, channel, accent: c, faceBubbleBottom, faceBarY } = opts;
  const bubbleTop = 28;
  const bw = W - 24;
  const bubbleH = Math.max(22, faceBubbleBottom - bubbleTop);
  const bubbleFill = channel === "notification" ? 0x231c10 : 0x0f1f2c;
  bg.roundRect(12, bubbleTop, bw, bubbleH, 12).fill({ color: bubbleFill, alpha: 0.95 });
  bg.roundRect(12, bubbleTop, bw, bubbleH, 12).stroke({ width: 1.2, color: c, alpha: 0.32 });
  if (channel !== "notification") {
    // 短信气泡左下小尾巴
    bg.moveTo(20, faceBubbleBottom - 3).lineTo(11, faceBubbleBottom + 8).lineTo(34, faceBubbleBottom - 3).closePath().fill({ color: bubbleFill, alpha: 0.95 });
  }
  // 禁用的回复输入条（灰、有禁用感）
  bg.roundRect(12, faceBarY, bw, 30, 8).fill({ color: 0x0b0f13, alpha: 0.9 });
  bg.roundRect(12, faceBarY, bw, 30, 8).stroke({ width: 1.2, color: 0x3a4650, alpha: 0.75 });
}
