/**
 * Generate NES-style upgrade card icons + plate textures for GravityTank.
 * Output: GravityTank/assets/Icon_Upgrade*.png, Texture_UpgradeCardPlate*.png
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "assets");

const C = {
  void: [0, 0, 0, 0],
  black: [0, 0, 0, 255],
  white: [248, 248, 248, 255],
  gray: [128, 128, 128, 255],
  dark: [48, 48, 48, 255],
  mid: [96, 96, 96, 255],
  steel: [176, 176, 176, 255],
  gold: [240, 208, 96, 255],
  goldDark: [160, 112, 24, 255],
  red: [200, 48, 24, 255],
  green: [112, 255, 152, 255],
  blue: [96, 160, 240, 255],
  blueDark: [24, 48, 80, 255],
  orange: [232, 120, 48, 255],
  cyan: [120, 220, 255, 255],
};

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function writePng(filePath, w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const o = y * (w * 4 + 1) + 1 + x * 4;
      raw[o] = rgba[i];
      raw[o + 1] = rgba[i + 1];
      raw[o + 2] = rgba[i + 2];
      raw[o + 3] = rgba[i + 3];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  fs.writeFileSync(filePath, png);
}

function makeCanvas(w, h, fill = C.black) {
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    rgba[i * 4] = fill[0];
    rgba[i * 4 + 1] = fill[1];
    rgba[i * 4 + 2] = fill[2];
    rgba[i * 4 + 3] = fill[3];
  }
  return { w, h, rgba };
}

function setPx(img, x, y, c) {
  if (x < 0 || y < 0 || x >= img.w || y >= img.h) return;
  const i = (y * img.w + x) * 4;
  img.rgba[i] = c[0];
  img.rgba[i + 1] = c[1];
  img.rgba[i + 2] = c[2];
  img.rgba[i + 3] = c[3];
}

function fillRect(img, x, y, w, h, c) {
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) setPx(img, x + i, y + j, c);
  }
}

function hLine(img, x, y, w, c) {
  fillRect(img, x, y, w, 1, c);
}

function vLine(img, x, y, h, c) {
  fillRect(img, x, y, 1, h, c);
}

function rectOutline(img, x, y, w, h, c) {
  hLine(img, x, y, w, c);
  hLine(img, x, y + h - 1, w, c);
  vLine(img, x, y, h, c);
  vLine(img, x + w - 1, y, h, c);
}

/** PowerToken-like double frame with corner tabs. */
function drawFrame(img, ink, tab) {
  const s = img.w;
  rectOutline(img, 0, 0, s, s, ink);
  rectOutline(img, 2, 2, s - 4, s - 4, ink);
  // corner tabs (3x3 L brackets)
  const tabs = [
    [3, 3], [s - 6, 3], [3, s - 6], [s - 6, s - 6],
  ];
  for (const [tx, ty] of tabs) {
    fillRect(img, tx, ty, 3, 1, tab);
    fillRect(img, tx, ty, 1, 3, tab);
    fillRect(img, tx + 2, ty, 1, 3, tab);
    fillRect(img, tx, ty + 2, 3, 1, tab);
  }
}

function stamp(img, ox, oy, rows, c) {
  for (let y = 0; y < rows.length; y++) {
    const row = rows[y];
    for (let x = 0; x < row.length; x++) {
      if (row[x] === "1" || row[x] === "#") setPx(img, ox + x, oy + y, c);
      else if (row[x] === "2") setPx(img, ox + x, oy + y, C.gray);
      else if (row[x] === "3") setPx(img, ox + x, oy + y, C.gold);
      else if (row[x] === "4") setPx(img, ox + x, oy + y, C.red);
      else if (row[x] === "5") setPx(img, ox + x, oy + y, C.cyan);
      else if (row[x] === "6") setPx(img, ox + x, oy + y, C.green);
      else if (row[x] === "7") setPx(img, ox + x, oy + y, C.orange);
      else if (row[x] === "8") setPx(img, ox + x, oy + y, C.blue);
    }
  }
}

/** 16x16 glyph patterns (strings of length 16). */
const GLYPHS = {
  noSelfHit: [
    "................",
    "....11111111....",
    "...1........1...",
    "..1..1111....1..",
    "..1.1....1...1..",
    "..1.1.11.1...1..",
    "..1.1....1...1..",
    "..1..1111....1..",
    "...1........1...",
    "....11111111....",
    ".......44.......",
    "......4..4......",
    ".....4....4.....",
    "....4......4....",
    "...4444444444...",
    "................",
  ],
  rapidFire: [
    "................",
    "..1....1....1...",
    "..11...11...11..",
    "..111..111..111.",
    "..1.1..1.1..1.1.",
    "..1..1.1..1.1..1",
    "................",
    ".777..777..777..",
    ".7.7..7.7..7.7..",
    ".777..777..777..",
    "................",
    "..1....1....1...",
    "..11...11...11..",
    "..111..111..111.",
    "................",
    "................",
  ],
  multiShot: [
    "................",
    "...1......1.....",
    "...11.....11....",
    "...111....111...",
    "...1.1....1.1...",
    "................",
    "......1.........",
    "......11........",
    "......111.......",
    "......1.1.......",
    "................",
    "...1......1.....",
    "...11.....11....",
    "...111....111...",
    "...1.1....1.1...",
    "................",
  ],
  bulletSpeed: [
    "................",
    "................",
    ".1..............",
    ".11....1111111..",
    ".111...1.....1..",
    ".1.11..1.111.1..",
    ".1..11.1.1.1.1..",
    ".1...111.111.1..",
    ".1....1......1..",
    ".1....1111111...",
    ".1..............",
    ".11.............",
    ".111............",
    "................",
    "................",
    "................",
  ],
  lightGravity: [
    "................",
    "......1111......",
    ".....1....1.....",
    "....1......1....",
    "...1...55...1...",
    "...1..5..5..1...",
    "...1...55...1...",
    "....1......1....",
    ".....1....1.....",
    "......1111......",
    ".......5........",
    "......5.5.......",
    ".....5...5......",
    "....5.....5.....",
    "...555555555....",
    "................",
  ],
  longerShield: [
    "................",
    ".....111111.....",
    "....1......1....",
    "...1..1111..1...",
    "...1.1....1.1...",
    "...1.1.66.1.1...",
    "...1.1....1.1...",
    "...1..1111..1...",
    "....1......1....",
    ".....1....1.....",
    "......1..1......",
    ".......11.......",
    "......2222......",
    ".....2....2.....",
    "......2222......",
    "................",
  ],
  doubleShield: [
    "................",
    "....1111.1111...",
    "...1....1....1..",
    "..1.111...111.1.",
    "..1.1.1...1.1.1.",
    "..1.111...111.1.",
    "...1....1....1..",
    "....1..1.1..1...",
    ".....11...11....",
    "......1...1.....",
    ".......1.1......",
    "........1.......",
    ".....666666.....",
    "....6......6....",
    ".....666666.....",
    "................",
  ],
  bounceShell: [
    "................",
    "........1.......",
    ".......11.......",
    "......111.......",
    ".....1..1.......",
    "....1...........",
    "...1............",
    "..1.....1111....",
    ".1.....1....1...",
    "1.....1......1..",
    ".....1...11...1.",
    "....1...1..1..1.",
    "...1.....11..1..",
    "..........11....",
    "................",
    "................",
  ],
  pierceShell: [
    "................",
    "................",
    "1...............",
    "11....2....2....",
    "111...22..22....",
    "1.11..2.22.2....",
    "1..1112..2.2....",
    "1...11222222....",
    "1..1112..2.2....",
    "1.11..2.22.2....",
    "111...22..22....",
    "11....2....2....",
    "1...............",
    "................",
    "................",
    "................",
  ],
  baseArmor: [
    "................",
    "...2222222222...",
    "...2........2...",
    "...2.111111.2...",
    "...2.1....1.2...",
    "...2.1.66.1.2...",
    "...2.1.66.1.2...",
    "...2.1....1.2...",
    "...2.111111.2...",
    "...2........2...",
    "...2222222222...",
    "......2..2......",
    ".....22..22.....",
    "....22222222....",
    "................",
    "................",
  ],
  // Boss / special
  mirrorShot: [
    "................",
    "...1........1...",
    "...11......11...",
    "...111....111...",
    "...1.1....1.1...",
    "................",
    "....333..333....",
    "...3....3....3..",
    "...3.33.3.33.3..",
    "...3....3....3..",
    "....333..333....",
    "................",
    "...1.1....1.1...",
    "...111....111...",
    "...11......11...",
    "...1........1...",
  ],
  meteorPulse: [
    "................",
    ".....3..........",
    "....373.........",
    "...37773........",
    "....373...3.....",
    ".....3...373....",
    "........37773...",
    "...3.....373....",
    "..373.....3.....",
    ".37773..........",
    "..373....3......",
    "...3....373.....",
    ".......37773....",
    "........373.....",
    ".........3......",
    "................",
  ],
  phaseGhost: [
    "................",
    "......5555......",
    ".....5....5.....",
    "....5.5..5.5....",
    "....5......5....",
    "....5.5555.5....",
    ".....5....5.....",
    "......5555......",
    ".....5.5.5.5....",
    "....5.......5...",
    "...5.........5..",
    "..5...........5.",
    ".5.....5.5....5.",
    "................",
    "..5...5...5...5.",
    "................",
  ],
  enemyAnchor: [
    "................",
    "......2222......",
    ".......22.......",
    ".......22.......",
    "......2222......",
    ".....2....2.....",
    "....2......2....",
    "...2...44...2...",
    "...2..4..4..2...",
    "...2...44...2...",
    "....2......2....",
    ".....222222.....",
    ".......22.......",
    "......2..2......",
    ".....2....2.....",
    "................",
  ],
  overloadFan: [
    "................",
    ".......1........",
    "......111.......",
    ".....11.11......",
    "....1..1..1.....",
    "...1...1...1....",
    "..1....1....1...",
    ".1.....1.....1..",
    ".......1........",
    "......333.......",
    ".....3...3......",
    "....3..3..3.....",
    "...3...3...3....",
    ".......3........",
    "......444.......",
    "................",
  ],
  fortressWill: [
    "................",
    ".22222222222222.",
    ".2............2.",
    ".2.3333333333.2.",
    ".2.3........3.2.",
    ".2.3.111111.3.2.",
    ".2.3.1....1.3.2.",
    ".2.3.1.66.1.3.2.",
    ".2.3.1.66.1.3.2.",
    ".2.3.1....1.3.2.",
    ".2.3.111111.3.2.",
    ".2.3........3.2.",
    ".2.3333333333.2.",
    ".2............2.",
    ".22222222222222.",
    "................",
  ],
  timeRift: [
    "................",
    "......5555......",
    ".....5.33.5.....",
    "....5..33..5....",
    "...5...33...5...",
    "...5.3.33.3.5...",
    "...5..3333..5...",
    "....5.3333.5....",
    ".....533335.....",
    "......5555......",
    ".....5....5.....",
    "....5......5....",
    "...5...33...5...",
    "....5......5....",
    ".....555555.....",
    "................",
  ],
  huntMark: [
    "................",
    "......4.........",
    ".....4.4........",
    "....4...4.......",
    "...4..1..4......",
    "..4..111..4.....",
    ".4..11.11..4....",
    "4..11...11..4...",
    ".4..11.11..4....",
    "..4..111..4.....",
    "...4..1..4......",
    "....4...4.......",
    ".....4.4....1...",
    "......4....11...",
    "..........111...",
    "................",
  ],
};

function makeIcon(id, special = false) {
  const img = makeCanvas(32, 32, C.black);
  const ink = special ? C.gold : C.white;
  const tab = special ? C.goldDark : C.gray;
  drawFrame(img, ink, tab);
  const glyph = GLYPHS[id];
  if (glyph) stamp(img, 8, 8, glyph, ink);
  return img;
}

function makePlate(kind) {
  // 64x32 tileable plate for card background
  const img = makeCanvas(64, 32, C.black);
  let rim; let hi; let lo; let rivet; let fill;
  if (kind === "special") {
    fill = [42, 24, 8, 255];
    rim = C.gold;
    hi = [255, 232, 140, 255];
    lo = C.goldDark;
    rivet = C.gold;
  } else if (kind === "tutorial") {
    fill = [16, 24, 32, 255];
    rim = C.blue;
    hi = [160, 200, 255, 255];
    lo = C.blueDark;
    rivet = C.steel;
  } else {
    fill = [20, 20, 20, 255];
    rim = C.steel;
    hi = C.white;
    lo = C.dark;
    rivet = C.gray;
  }
  fillRect(img, 0, 0, 64, 32, fill);
  // riveted bezel
  rectOutline(img, 0, 0, 64, 32, rim);
  rectOutline(img, 1, 1, 62, 30, lo);
  hLine(img, 2, 2, 60, hi);
  vLine(img, 2, 2, 28, hi);
  // corner rivets
  const rivets = [[3, 3], [60, 3], [3, 28], [60, 28], [31, 3], [31, 28]];
  for (const [x, y] of rivets) {
    setPx(img, x, y, rivet);
    setPx(img, x + 1, y, hi);
    setPx(img, x, y + 1, lo);
  }
  // scanline dither
  for (let y = 4; y < 28; y += 2) {
    for (let x = 4; x < 60; x += 2) {
      if ((x + y) % 4 === 0) setPx(img, x, y, lo);
    }
  }
  return img;
}

function save(img, name) {
  const file = path.join(OUT, name);
  writePng(file, img.w, img.h, img.rgba);
  console.log("wrote", name, img.w + "x" + img.h);
}

const stageIds = [
  "noSelfHit", "rapidFire", "multiShot", "bulletSpeed",
  "lightGravity", "longerShield", "bounceShell", "pierceShell",
  "doubleShield", "baseArmor",
];
const bossIds = [
  "mirrorShot", "meteorPulse", "phaseGhost", "enemyAnchor",
  "overloadFan", "fortressWill", "timeRift", "huntMark",
];

function toAssetName(id) {
  return "Icon_Upgrade" + id[0].toUpperCase() + id.slice(1) + ".png";
}

for (const id of stageIds) {
  save(makeIcon(id, false), toAssetName(id));
}
for (const id of bossIds) {
  save(makeIcon(id, true), toAssetName(id));
}

save(makePlate("stage"), "Texture_UpgradeCardPlate.png");
save(makePlate("special"), "Texture_UpgradeCardPlateSpecial.png");
save(makePlate("tutorial"), "Texture_UpgradeCardPlateTutorial.png");

console.log("done", stageIds.length + bossIds.length, "icons + 3 plates");
