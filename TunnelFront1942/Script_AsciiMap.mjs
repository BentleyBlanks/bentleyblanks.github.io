const SurfaceSymbols = Object.freeze({
  field: ".",
  orchard: "o",
  village: "v",
  road: "=",
  ditch: "d",
  reed: "r",
});

const UnitSymbols = Object.freeze({
  Scout: "C",
  Digger: "D",
  Militia: "M",
  Guerrilla: "G",
});

function MapBounds(state) {
  const coordinates = Object.values(state.tiles).map((tile) => ({
    q: tile.q,
    r: tile.r,
  }));
  return {
    maxQ: Math.max(...coordinates.map(({ q }) => q)),
    maxR: Math.max(...coordinates.map(({ r }) => r)),
  };
}

function SurfaceSymbol(state, tileKey) {
  const unit = state.units.find((entry) => (
    entry.health > 0
    && entry.layer === "Surface"
    && entry.tileKey === tileKey
  ));
  if (unit) {
    return UnitSymbols[unit.role] ?? "P";
  }
  if (state.enemies.some((enemy) => enemy.health > 0 && enemy.tileKey === tileKey)) {
    return "E";
  }
  const tile = state.tiles[tileKey];
  if (tile.kind === "origin") {
    return "O";
  }
  if (tile.kind === "safeExit") {
    return "X";
  }
  if (tile.kind === "enemyPost") {
    return "!";
  }
  return SurfaceSymbols[tile.terrainId] ?? "?";
}

function TunnelSymbol(state, tileKey) {
  const node = state.tunnels[tileKey];
  if (!node) {
    return " ";
  }
  const unit = state.units.find((entry) => (
    entry.health > 0
    && entry.layer === "Tunnel"
    && entry.tileKey === tileKey
  ));
  if (unit) {
    return UnitSymbols[unit.role] ?? "P";
  }
  if (state.civilians.some((group) => (
    group.status === "Moving"
    && group.tileKey === tileKey
  ))) {
    return "c";
  }
  if (node.collapsed) {
    return "x";
  }
  if (node.sealed) {
    return "s";
  }
  if (node.smoke > 0) {
    return "~";
  }
  if (node.braced) {
    return "B";
  }
  if (node.cracked) {
    return "!";
  }
  return "#";
}

function RenderLayer(state, title, SymbolForTile) {
  const { maxQ, maxR } = MapBounds(state);
  const lines = [title, `     ${Array.from({ length: maxQ + 1 }, (_, q) => q).join("  ")}`];
  for (let r = 0; r <= maxR; r += 1) {
    const cells = [];
    for (let q = 0; q <= maxQ; q += 1) {
      const tileKey = `${q},${r}`;
      cells.push(state.tiles[tileKey] ? SymbolForTile(state, tileKey) : " ");
    }
    lines.push(`${String(r).padStart(2, " ")} | ${r % 2 ? " " : ""}${cells.join("  ")}`);
  }
  return lines.join("\n");
}

export function RenderAsciiMaps(state) {
  return [
    RenderLayer(state, "地面（坐标 q,r）", SurfaceSymbol),
    "图例：C交通员 D地道队 M民兵 G游击组 E敌军 O赵庄 X安全出口 !据点",
    "",
    RenderLayer(state, "地下（坐标 q,r）", TunnelSymbol),
    "图例：#地道 B已支护 !开裂 ~烟流 s封口 x塌方 c群众；空白=未挖",
  ].join("\n");
}
