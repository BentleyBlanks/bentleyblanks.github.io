// Bake 1024x1024 RGBA packed blade blood texture from photographic AI-generated sources.
// Output: Taierzhuang1938/Texture/Texture_BladeBloodDetail.webp (linear NoColorSpace RGBA)
//   R: Seamless-X blade smear & viscous wipe film optical coverage (bottom=cutting edge, top=spine)
//   G: Tileable fine arterial spatter & micro-droplet field (for flat splatter & guard flecks)
//   B: Liquid film thickness / meniscus heightmap (Beer-Lambert darkening + normal rim highlight)
//   A: Seamless-X gravity drip rivulets & teardrop-tipped runs (top=source, running downward)
//
// Source images remain outside Git in Taierzhuang1938/_shots/BladeBloodSource/.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.dirname(scriptDir);
const sourceDir = path.join(projectDir, "_shots", "BladeBloodSource");
const outPath = path.join(projectDir, "Texture", "Texture_BladeBloodDetail.webp");
const previewPath = path.join(sourceDir, "Preview_BladeBloodChannels.png");

const SIZE = 1024;
const Clamp01 = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x);
const Smooth = (x) => x * x * (3 - 2 * x);

/** Extract optical blood coverage and film thickness from blood on pure white background. */
function ExtractBloodDensity(rgb, w, h) {
  const n = w * h;
  const coverage = new Float32Array(n);
  const thickness = new Float32Array(n);
  for (let i = 0; i < n; i += 1) {
    const r = rgb[i * 3] / 255;
    const g = rgb[i * 3 + 1] / 255;
    const b = rgb[i * 3 + 2] / 255;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    const darkness = Clamp01(1 - luma);
    const redChroma = Clamp01(r - 0.5 * (g + b));
    const signal = Clamp01(darkness * 0.88 + redChroma * 0.82);
    const cov = Smooth(Clamp01((signal - 0.045) / (0.28 - 0.045)));
    coverage[i] = cov;
    const thick = Math.pow(Clamp01((darkness - 0.075) / 0.82), 1.12) * cov;
    thickness[i] = thick;
  }
  return { coverage, thickness };
}

/** Horizontally seamless field via half-shift cosine cross-fade (preserves crisp edges). */
function MakeSeamlessX(field, w, h, blendPx = 120) {
  const out = new Float32Array(w * h);
  const half = w >> 1;
  const weights = new Float32Array(w);
  for (let x = 0; x < w; x += 1) {
    const edgeDist = Math.min(x, w - 1 - x);
    const t = Clamp01(edgeDist / blendPx);
    weights[x] = 0.5 - 0.5 * Math.cos(t * Math.PI);
  }
  for (let y = 0; y < h; y += 1) {
    const row = y * w;
    for (let x = 0; x < w; x += 1) {
      const a = field[row + x];
      const b = field[row + ((x + half) % w)];
      const wt = weights[x];
      const lin = a * wt + b * (1 - wt);
      const peak = Math.max(a * Math.sqrt(wt), b * Math.sqrt(1 - wt));
      out[row + x] = Clamp01(0.65 * lin + 0.35 * peak);
    }
  }
  return out;
}

/** Seamlessly tileable in both X and Y (for fine arterial spray / spatter layer). */
function MakeSeamlessXY(field, w, h, blendPx = 96) {
  const sx = MakeSeamlessX(field, w, h, blendPx);
  const out = new Float32Array(w * h);
  const half = h >> 1;
  const weights = new Float32Array(h);
  for (let y = 0; y < h; y += 1) {
    const edgeDist = Math.min(y, h - 1 - y);
    const t = Clamp01(edgeDist / blendPx);
    weights[y] = 0.5 - 0.5 * Math.cos(t * Math.PI);
  }
  for (let y = 0; y < h; y += 1) {
    const wt = weights[y];
    const rowA = y * w;
    const rowB = ((y + half) % h) * w;
    for (let x = 0; x < w; x += 1) {
      const a = sx[rowA + x];
      const b = sx[rowB + x];
      const lin = a * wt + b * (1 - wt);
      const peak = Math.max(a * Math.sqrt(wt), b * Math.sqrt(1 - wt));
      out[rowA + x] = Clamp01(0.60 * lin + 0.40 * peak);
    }
  }
  return out;
}

/** Lightweight separable box-gaussian blur (2 passes) for smooth meniscus relief gradients. */
function BlurField(field, w, h, radius = 2) {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const pass = (src, dst, horizontal) => {
    const inv = 1 / (radius * 2 + 1);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        let sum = 0;
        for (let k = -radius; k <= radius; k += 1) {
          const sx = horizontal ? (x + k + w) % w : x;
          const sy = horizontal ? y : Math.max(0, Math.min(h - 1, y + k));
          sum += src[sy * w + sx];
        }
        dst[y * w + x] = sum * inv;
      }
    }
  };
  pass(field, tmp, true);
  pass(tmp, out, false);
  return out;
}

async function LoadRgbResized(filePath, crop = null, size = SIZE) {
  let pipe = sharp(filePath);
  if (crop) pipe = pipe.extract(crop);
  const { data } = await pipe.resize(size, size, { kernel: "lanczos3" }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return data;
}

async function main() {
  const smearPath = path.join(sourceDir, "Src_BladeBloodSmear.jpg");
  const rivuletsPath = path.join(sourceDir, "Src_BladeBloodRivulets.jpg");
  const smearMeta = await sharp(smearPath).metadata();
  const sw = smearMeta.width;
  const sh = smearMeta.height;

  // Crop outer white margins (left/right ~6.5%, bottom ~9%) so the dense smear spans wall-to-wall
  // seamlessly in X and uv.y=0 (cutting edge) starts directly inside rich blood film.
  const cropLeft = Math.round(sw * 0.065);
  const cropWidth = Math.round(sw * 0.87);
  const smearRgb = await LoadRgbResized(smearPath, { left: cropLeft, top: 0, width: cropWidth, height: Math.round(sh * 0.905) }, SIZE);
  const sprayRgb = await LoadRgbResized(smearPath, { left: cropLeft, top: Math.round(sh * 0.02), width: cropWidth, height: Math.round(sh * 0.40) }, SIZE);
  const rivRgb = await LoadRgbResized(rivuletsPath, null, SIZE);

  const { coverage: smearCov, thickness: smearThick } = ExtractBloodDensity(smearRgb, SIZE, SIZE);
  const { coverage: sprayCov } = ExtractBloodDensity(sprayRgb, SIZE, SIZE);
  const { coverage: rivCov, thickness: rivThick } = ExtractBloodDensity(rivRgb, SIZE, SIZE);

  // R: Seamless-X blade smear & wipe coverage; strengthen bottom 6% cutting bevel continuity.
  const chR = MakeSeamlessX(smearCov, SIZE, SIZE, 128);
  const rowMean = new Float32Array(SIZE);
  const r0 = Math.floor(SIZE * 0.84);
  const r1 = Math.floor(SIZE * 0.92);
  for (let x = 0; x < SIZE; x += 1) {
    let s = 0;
    for (let y = r0; y < r1; y += 1) s += chR[y * SIZE + x];
    rowMean[x] = s / (r1 - r0);
  }
  for (let y = Math.floor(SIZE * 0.92); y < SIZE; y += 1) {
    const band = Smooth(Clamp01((y / (SIZE - 1) - 0.92) / 0.08));
    for (let x = 0; x < SIZE; x += 1) {
      const ref = Clamp01(rowMean[(x + 41) % SIZE] * 1.15);
      const floor = Math.max(0.58, ref);
      chR[y * SIZE + x] = Clamp01(Math.max(chR[y * SIZE + x], band * floor));
    }
  }

  // G: Seamlessly tileable fine arterial spatter & micro-droplet field.
  const sprayCombined = new Float32Array(SIZE * SIZE);
  const shiftX = Math.floor(SIZE * 0.37);
  for (let y = 0; y < SIZE; y += 1) {
    const fy = SIZE - 1 - y;
    for (let x = 0; x < SIZE; x += 1) {
      const a = sprayCov[y * SIZE + x] * 1.28;
      const b = sprayCov[fy * SIZE + ((x + shiftX) % SIZE)] * 0.92;
      sprayCombined[y * SIZE + x] = Clamp01(Math.max(a, b));
    }
  }
  const chG = MakeSeamlessXY(sprayCombined, SIZE, SIZE, 96);

  // A: Seamless-X gravity drip rivulets & teardrop runs (top y=0 -> running downward).
  const rivMerged = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i += 1) {
    rivMerged[i] = Clamp01(rivCov[i] * 0.65 + rivThick[i] * 0.62);
  }
  const chA = MakeSeamlessX(rivMerged, SIZE, SIZE, 112);
  for (let y = Math.floor(SIZE * 0.93); y < SIZE; y += 1) {
    const fade = 1 - Smooth(Clamp01((y / (SIZE - 1) - 0.93) / 0.07));
    for (let x = 0; x < SIZE; x += 1) chA[y * SIZE + x] *= fade;
  }

  // B: Smooth liquid film thickness / meniscus heightmap (Beer-Lambert + GPU normal bump).
  const thickSeam = MakeSeamlessX(smearThick, SIZE, SIZE, 128);
  const thickMix = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i += 1) {
    thickMix[i] = Clamp01(thickSeam[i] * 0.85 + chR[i] * 0.24);
  }
  const thickBlur = BlurField(thickMix, SIZE, SIZE, 2);
  const chB = new Float32Array(SIZE * SIZE);
  for (let i = 0; i < SIZE * SIZE; i += 1) {
    chB[i] = Clamp01(thickBlur[i] * Clamp01(chR[i] * 1.55));
  }

  // Pack RGBA buffer.
  const rgba = Buffer.alloc(SIZE * SIZE * 4);
  let meanR = 0, meanG = 0, meanB = 0, meanA = 0;
  for (let i = 0; i < SIZE * SIZE; i += 1) {
    rgba[i * 4] = Math.round(chR[i] * 255);
    rgba[i * 4 + 1] = Math.round(chG[i] * 255);
    rgba[i * 4 + 2] = Math.round(chB[i] * 255);
    rgba[i * 4 + 3] = Math.round(chA[i] * 255);
    meanR += chR[i]; meanG += chG[i]; meanB += chB[i]; meanA += chA[i];
  }
  const invN = 1 / (SIZE * SIZE);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  await sharp(rgba, { raw: { width: SIZE, height: SIZE, channels: 4 } })
    .webp({ quality: 90, alphaQuality: 100, effort: 6 })
    .toFile(outPath);

  const bytes = fs.statSync(outPath).size;
  console.log(`Baked ${outPath} (${SIZE}x${SIZE}, ${(bytes / 1024).toFixed(1)} KiB)`);
  console.log(`Means: R=${(meanR * invN).toFixed(3)} G=${(meanG * invN).toFixed(3)} B=${(meanB * invN).toFixed(3)} A=${(meanA * invN).toFixed(3)}`);

  // Write 2x2 diagnostic preview image into _shots/BladeBloodSource (ignored by Git).
  const half = SIZE >> 1;
  const preview = Buffer.alloc(SIZE * SIZE * 3);
  const PaintQuad = (field, ox, oy, tint, bg) => {
    for (let y = 0; y < half; y += 1) {
      const sy = y * 2;
      for (let x = 0; x < half; x += 1) {
        const sx = x * 2;
        const v = 0.25 * (field[sy * SIZE + sx] + field[sy * SIZE + sx + 1] + field[(sy + 1) * SIZE + sx] + field[(sy + 1) * SIZE + sx + 1]);
        const idx = ((oy + y) * SIZE + (ox + x)) * 3;
        preview[idx] = Math.round(Clamp01(bg * (1 - v) + tint[0] * v) * 255);
        preview[idx + 1] = Math.round(Clamp01(bg * (1 - v) + tint[1] * v) * 255);
        preview[idx + 2] = Math.round(Clamp01(bg * (1 - v) + tint[2] * v) * 255);
      }
    }
  };
  PaintQuad(chR, 0, 0, [0.58, 0.06, 0.05], 0.62);
  PaintQuad(chG, half, 0, [0.68, 0.08, 0.06], 0.62);
  PaintQuad(chB, 0, half, [0.92, 0.92, 0.96], 0.05);
  PaintQuad(chA, half, half, [0.55, 0.05, 0.04], 0.62);
  await sharp(preview, { raw: { width: SIZE, height: SIZE, channels: 3 } }).png().toFile(previewPath);
  console.log(`Preview written: ${previewPath}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
