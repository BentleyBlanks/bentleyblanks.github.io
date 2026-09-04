/** Cosmetic preference is independent of campaign checkpoints and enemy palettes. */
export const playerPaintKey = "gravitytank_player_paint_v1";
export const playerPaints = [
  { id: "gold", label: "经典金", color: "#e8bc24", mid: [232, 188, 36], dark: [96, 64, 8], light: [255, 244, 170] },
  { id: "pink", label: "樱花粉", color: "#f283bc", mid: [242, 131, 188], dark: [112, 43, 80], light: [255, 222, 241] },
  { id: "blue", label: "冰川蓝", color: "#62baff", mid: [98, 186, 255], dark: [28, 65, 112], light: [212, 241, 255] },
  { id: "green", label: "薄荷绿", color: "#65d99b", mid: [101, 217, 155], dark: [28, 91, 62], light: [213, 255, 230] },
  { id: "purple", label: "星云紫", color: "#b393ef", mid: [179, 147, 239], dark: [69, 45, 113], light: [237, 223, 255] },
  { id: "white", label: "月光白", color: "#dae5ee", mid: [218, 229, 238], dark: [79, 96, 112], light: [255, 255, 255] },
];

export function GetPlayerPaint(id) {
  return playerPaints.find((paint) => paint.id === id) || playerPaints[0];
}

export function ReadPlayerPaint() {
  try { return GetPlayerPaint(localStorage.getItem(playerPaintKey)).id; }
  catch { return playerPaints[0].id; }
}

export function SavePlayerPaint(id) {
  try { localStorage.setItem(playerPaintKey, GetPlayerPaint(id).id); }
  catch { /* Paint selection still works when storage is unavailable. */ }
}
