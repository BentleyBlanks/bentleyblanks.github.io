/**
 * Generate Battle City–style upgrade card frames (9-slice) + icon wells.
 * Output under GravityTank/assets/
 */
import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(__dirname, "assets");

const C = {
  black: [0, 0, 0, 255],
  void: [0, 0, 0, 0],
  white: [240, 240, 240, 255],
  steelHi: [200, 200, 200, 255],
  steel: [144, 144, 144, 255],
  steelMid: [96, 96, 96, 255],
  steelLo: [48, 48, 48, 255],
  panel: [14, 14, 14, 255],
  panelDeep: [8, 8, 8, 255],
  gold: [240, 208, 96, 255],
  goldHi: [255, 236, 160, 255],
  goldLo: [140, 96, 24, 255],
  goldPanel: [26, 18, 8, 255],
  blue: [112, 176, 240, 255],
  blueHi: [176, 216, 255, 255],
  blueLo: [32, 64, 112, 255],
  bluePanel: [10, 18, 28, 255],
  green: [96, 220, 120, 255],
  greenLo: [24, 80, 40, 255],
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
  if (x < 0 || y < 0 || x >= img.w || y >= img.h || !c) return;
  const i = (y * img.w + x) * 4;
  img.rgba[i] = c[0];
  img.rgba[i + 1] = c[1];
  img.rgba[i + 2] = c[2];
  img.rgba[i + 3] = c[3];
}

function fillRect(img, x, y, w, h, c) {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) setPx(img, x + i, y + j, c);
}

function hLine(img, x, y, w, c) { fillRect(img, x, y, w, 1, c); }
function vLine(img, x, y, h, c) { fillRect(img, x, y, 1, h, c); }

function rivet(img, x, y, hi, mid, lo) {
  fillRect(img, x, y, 3, 3, mid);
  setPx(img, x, y, hi);
  setPx(img, x + 2, y + 2, lo);
  setPx(img, x + 1, y + 1, hi);
}

function cornerPlate(img, x, y, flipX, flipY, rim, hi, lo) {
  // 10x10 armored corner bracket
  for (let j = 0; j < 10; j++) {
    for (let i = 0; i < 10; i++) {
      const on = i < 4 || j < 4;
      if (!on) continue;
      const px = x + (flipX ? 9 - i : i);
      const py = y + (flipY ? 9 - j : j);
      const edge = i === 0 || j === 0 || i === 3 || j === 3;
      setPx(img, px, py, edge ? rim : (i + j < 4 ? hi : lo));
    }
  }
}

/** 48×48 nine-slice frame. Slice = 14. Center is solid readable panel. */
function makeNineSlice(kind) {
  const S = 48;
  const B = 14;
  const img = makeCanvas(S, S, C.panelDeep);

  let rim, hi, lo, mid, panel, accent, accentLo;
  if (kind === "special") {
    rim = C.gold; hi = C.goldHi; lo = C.goldLo; mid = C.gold;
    panel = C.goldPanel; accent = C.gold; accentLo = C.goldLo;
  } else if (kind === "tutorial") {
    rim = C.blue; hi = C.blueHi; lo = C.blueLo; mid = C.blue;
    panel = C.bluePanel; accent = C.blue; accentLo = C.blueLo;
  } else {
    rim = C.steel; hi = C.steelHi; lo = C.steelLo; mid = C.steelMid;
    panel = C.panel; accent = C.green; accentLo = C.greenLo;
  }

  // Outer bevel ring
  fillRect(img, 0, 0, S, S, lo);
  fillRect(img, 1, 1, S - 2, S - 2, mid);
  fillRect(img, 2, 2, S - 4, S - 4, rim);
  // Highlight top/left, shadow bottom/right
  hLine(img, 2, 2, S - 4, hi);
  vLine(img, 2, 2, S - 4, hi);
  hLine(img, 2, S - 3, S - 4, lo);
  vLine(img, S - 3, 2, S - 4, lo);

  // Inner dark channel
  fillRect(img, 4, 4, S - 8, S - 8, C.black);
  fillRect(img, 5, 5, S - 10, S - 10, panel);

  // Accent strip just inside top border (header cue)
  fillRect(img, B, 5, S - B * 2, 3, accent);
  hLine(img, B, 5, S - B * 2, hi);
  hLine(img, B, 7, S - B * 2, accentLo);

  // Corner armor plates
  cornerPlate(img, 1, 1, false, false, rim, hi, lo);
  cornerPlate(img, S - 11, 1, true, false, rim, hi, lo);
  cornerPlate(img, 1, S - 11, false, true, rim, hi, lo);
  cornerPlate(img, S - 11, S - 11, true, true, rim, hi, lo);

  // Rivets along edges (outside center slice)
  const rivetColor = kind === "special" ? C.goldHi : hi;
  for (const x of [6, 23, 39]) {
    rivet(img, x, 3, rivetColor, mid, lo);
    rivet(img, x, S - 6, rivetColor, mid, lo);
  }
  for (const y of [16, 30]) {
    rivet(img, 3, y, rivetColor, mid, lo);
    rivet(img, S - 6, y, rivetColor, mid, lo);
  }

  // Keep center of 9-slice a flat readable fill (no noise)
  fillRect(img, B, B, S - B * 2, S - B * 2, panel);

  // Tiny hatch only on border ring (not center) for metal feel
  for (let y = 3; y < S - 3; y++) {
    for (let x = 3; x < S - 3; x++) {
      const inCenter = x >= B && x < S - B && y >= B && y < S - B;
      if (inCenter) continue;
      if ((x + y) % 5 === 0 && x > 5 && y > 5 && x < S - 6 && y < S - 6) {
        setPx(img, x, y, lo);
      }
    }
  }

  return img;
}

/** Full card face preview texture (stretched as CSS bg optional). */
function makeCardFace(kind) {
  const W = 192;
  const H = 80;
  const img = makeCanvas(W, H, C.black);

  let rim, hi, lo, mid, panel, accent, accentLo;
  if (kind === "special") {
    rim = C.gold; hi = C.goldHi; lo = C.goldLo; mid = [180, 140, 40, 255];
    panel = C.goldPanel; accent = C.gold; accentLo = C.goldLo;
  } else if (kind === "tutorial") {
    rim = C.blue; hi = C.blueHi; lo = C.blueLo; mid = [60, 110, 170, 255];
    panel = C.bluePanel; accent = C.blue; accentLo = C.blueLo;
  } else {
    rim = C.steel; hi = C.steelHi; lo = C.steelLo; mid = C.steelMid;
    panel = C.panel; accent = C.green; accentLo = C.greenLo;
  }

  // Outer shell
  fillRect(img, 0, 0, W, H, lo);
  fillRect(img, 2, 2, W - 4, H - 4, mid);
  fillRect(img, 3, 3, W - 6, H - 6, rim);
  hLine(img, 3, 3, W - 6, hi);
  vLine(img, 3, 3, H - 6, hi);
  hLine(img, 3, H - 4, W - 6, lo);
  vLine(img, W - 4, 3, H - 6, lo);

  // Inner panel
  fillRect(img, 6, 6, W - 12, H - 12, C.black);
  fillRect(img, 7, 7, W - 14, H - 14, panel);

  // Top accent rail
  fillRect(img, 8, 8, W - 16, 5, accent);
  hLine(img, 8, 8, W - 16, hi);
  hLine(img, 8, 12, W - 16, accentLo);
  // Side ticks like title "BATTLE" flanks
  for (let i = 0; i < 3; i++) {
    fillRect(img, 10 + i * 4, 10, 3, 1, hi);
    fillRect(img, W - 22 - i * 4, 10, 3, 1, hi);
  }

  // Icon well (left socket)
  fillRect(img, 10, 18, 52, 52, C.black);
  fillRect(img, 11, 19, 50, 50, lo);
  fillRect(img, 13, 21, 46, 46, C.black);
  hLine(img, 13, 21, 46, hi);
  vLine(img, 13, 21, 46, hi);
  rivet(img, 12, 20, hi, mid, lo);
  rivet(img, 54, 20, hi, mid, lo);
  rivet(img, 12, 62, hi, mid, lo);
  rivet(img, 54, 62, hi, mid, lo);

  // Content well (right)
  fillRect(img, 68, 18, W - 78, 52, C.black);
  fillRect(img, 69, 19, W - 80, 50, panel);
  // Soft separator
  vLine(img, 66, 18, 52, lo);
  vLine(img, 67, 18, 52, hi);

  // Corner plates
  cornerPlate(img, 2, 2, false, false, rim, hi, lo);
  cornerPlate(img, W - 12, 2, true, false, rim, hi, lo);
  cornerPlate(img, 2, H - 12, false, true, rim, hi, lo);
  cornerPlate(img, W - 12, H - 12, true, true, rim, hi, lo);

  // Edge rivets
  for (const x of [24, 96, 160]) {
    rivet(img, x, 3, hi, mid, lo);
    rivet(img, x, H - 6, hi, mid, lo);
  }

  return img;
}

function save(img, name) {
  writePng(path.join(OUT, name), img.w, img.h, img.rgba);
  console.log("wrote", name, `${img.w}x${img.h}`);
}

for (const kind of ["stage", "special", "tutorial"]) {
  const name =
    kind === "stage" ? "Texture_UpgradeCardSlice.png" :
    kind === "special" ? "Texture_UpgradeCardSliceSpecial.png" :
    "Texture_UpgradeCardSliceTutorial.png";
  save(makeNineSlice(kind), name);
  const face =
    kind === "stage" ? "Texture_UpgradeCardFace.png" :
    kind === "special" ? "Texture_UpgradeCardFaceSpecial.png" :
    "Texture_UpgradeCardFaceTutorial.png";
  save(makeCardFace(kind), face);
  // Keep Plate_* aliases in sync for any leftover references.
  save(makeCardFace(kind), face.replace("Face", "Plate"));
}

console.log("card frames done");
