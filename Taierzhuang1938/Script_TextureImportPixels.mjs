// Import-time pixel operations. Data alpha never participates in RGB filtering.
const Clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const Byte = value => Math.round(Clamp(value, 0, 255));
export function TransformImportPixels(input, width, height, settings) {
  const data = new Uint8Array(input), index = { r: 0, g: 1, b: 2, a: 3 };
  for (let i = 0; i < data.length; i += 4) {
    const pixel = data.slice(i, i + 4);
    for (let c = 0; c < 4; c++) {
      const key = settings.swizzle[c];
      data[i + c] = key === "0" ? 0 : key === "1" ? 255 : key === key.toLowerCase() ? pixel[index[key]] : 255 - pixel[index[key.toLowerCase()]];
    }
    if (settings.alphaSource === "none") data[i + 3] = 255;
    if (settings.alphaSource === "grayscale") data[i + 3] = Byte((data[i] + data[i + 1] + data[i + 2]) / 3);
    if (settings.textureType === "single") { const value = data[i + index[settings.singleChannel]]; data[i] = data[i + 1] = data[i + 2] = value; data[i + 3] = 255; }
  }
  if (settings.textureType === "normal" && settings.normalFromHeight) {
    const source = new Uint8Array(data);
    const Height = (x, y) => { const i = (Clamp(y, 0, height - 1) * width + Clamp(x, 0, width - 1)) * 4; return (source[i] + source[i + 1] + source[i + 2]) / (3 * 255); };
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      let dx, dy;
      if (settings.normalFilter === "sharp") {
        dx = (Height(x + 1, y - 1) + 2 * Height(x + 1, y) + Height(x + 1, y + 1) - Height(x - 1, y - 1) - 2 * Height(x - 1, y) - Height(x - 1, y + 1)) / 4;
        dy = (Height(x - 1, y + 1) + 2 * Height(x, y + 1) + Height(x + 1, y + 1) - Height(x - 1, y - 1) - 2 * Height(x, y - 1) - Height(x + 1, y - 1)) / 4;
      } else { dx = Height(x + 1, y) - Height(x, y); dy = Height(x, y + 1) - Height(x, y); }
      const nx = -dx * settings.normalStrength, ny = -dy * settings.normalStrength, length = Math.hypot(nx, ny, 1), i = (y * width + x) * 4;
      data[i] = Byte((nx / length + 1) * 127.5); data[i + 1] = Byte((ny / length + 1) * 127.5); data[i + 2] = Byte((1 / length + 1) * 127.5);
    }
  }
  if (settings.flipGreen) for (let i = 1; i < data.length; i += 4) data[i] = 255 - data[i];
  if (settings.alphaTransparency) {
    const count = width * height, queue = new Uint32Array(count), known = new Uint8Array(count);
    let head = 0, tail = 0;
    for (let p = 0; p < count; p++) if (data[p * 4 + 3] > 0) { queue[tail++] = p; known[p] = 1; }
    while (head < tail) {
      const p = queue[head++], x = p % width, y = Math.floor(p / width);
      for (const q of [x > 0 ? p - 1 : -1, x + 1 < width ? p + 1 : -1, y > 0 ? p - width : -1, y + 1 < height ? p + width : -1]) {
        if (q < 0 || known[q]) continue;
        for (let c = 0; c < 3; c++) data[q * 4 + c] = data[p * 4 + c];
        known[q] = 1; queue[tail++] = q;
      }
    }
  }
  return data;
}
export function NormalizeImportNormals(data) {
  for (let i = 0; i < data.length; i += 4) {
    const x = data[i] / 127.5 - 1, y = data[i + 1] / 127.5 - 1, z = data[i + 2] / 127.5 - 1, length = Math.hypot(x, y, z) || 1;
    data[i] = Byte((x / length + 1) * 127.5); data[i + 1] = Byte((y / length + 1) * 127.5); data[i + 2] = Byte((z / length + 1) * 127.5);
  }
}
const Linear = value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
const Srgb = value => value <= 0.0031308 ? value * 12.92 : 1.055 * value ** (1 / 2.4) - 0.055;
function Bessel(x) { let sum = 1, term = 1; for (let k = 1; k < 12; k++) { term *= (x / (2 * k)) ** 2; sum += term; } return sum; }
function Weights(inputSize, outputSize, filter, clamp) {
  const scale = inputSize / outputSize, radius = filter === "box" ? scale / 2 : 3 * scale;
  return Array.from({ length: outputSize }, (_, x) => {
    const center = (x + 0.5) * scale - 0.5, taps = []; let total = 0;
    for (let i = Math.ceil(center - radius); i <= Math.floor(center + radius); i++) {
      const d = (i - center) / scale;
      const weight = filter === "box" ? 1 : (Math.abs(d) < 1e-8 ? 1 : Math.sin(Math.PI * d) / (Math.PI * d)) * Bessel(4 * Math.sqrt(Math.max(0, 1 - (d / 3) ** 2))) / Bessel(4);
      taps.push([clamp ? Clamp(i, 0, inputSize - 1) : (i % inputSize + inputSize) % inputSize, weight]); total += weight;
    }
    return taps.map(([i, weight]) => [i, weight / total]);
  });
}
export function BuildImportMipmaps(base, width, height, settings, colorSpace) {
  const levels = [{ data: base, width, height }];
  const cutoff = settings.alphaCutoff * 255;
  let covered = 0; for (let i = 3; i < base.length; i += 4) if (base[i] >= cutoff) covered++;
  const coverage = covered / (base.length / 4);
  while (width > 1 || height > 1) {
    const previous = levels.at(-1).data, nextWidth = Math.max(1, width >> 1), nextHeight = Math.max(1, height >> 1);
    const xWeights = Weights(width, nextWidth, settings.mipFilter, settings.mipBorder || settings.wrapU === "clamp");
    const yWeights = Weights(height, nextHeight, settings.mipFilter, settings.mipBorder || settings.wrapV === "clamp");
    const rows = new Float32Array(nextWidth * height * 4), data = new Uint8Array(nextWidth * nextHeight * 4);
    for (let y = 0; y < height; y++) for (let x = 0; x < nextWidth; x++) for (let c = 0; c < 4; c++) {
      let sum = 0; for (const [sx, weight] of xWeights[x]) { const value = previous[(y * width + sx) * 4 + c] / 255; sum += weight * (colorSpace === "srgb" && c < 3 ? Linear(value) : value); }
      rows[(y * nextWidth + x) * 4 + c] = sum;
    }
    for (let y = 0; y < nextHeight; y++) for (let x = 0; x < nextWidth; x++) for (let c = 0; c < 4; c++) {
      let sum = 0; for (const [sy, weight] of yWeights[y]) sum += weight * rows[(sy * nextWidth + x) * 4 + c];
      data[(y * nextWidth + x) * 4 + c] = Byte(255 * (colorSpace === "srgb" && c < 3 ? Srgb(Math.max(0, sum)) : sum));
    }
    if (settings.textureType === "normal") NormalizeImportNormals(data);
    if (settings.mipCoverage) {
      const histogram = new Uint32Array(256); for (let i = 3; i < data.length; i += 4) histogram[data[i]]++;
      let originalCovered = 0; for (let alpha = Math.ceil(cutoff); alpha < 256; alpha++) originalCovered += histogram[alpha];
      let lo = 0, hi = 256, best = 1, error = Math.abs(originalCovered / (data.length / 4) - coverage);
      for (let iteration = 0; iteration < 16; iteration++) {
        const scale = (lo + hi) / 2; let count = 0;
        for (let alpha = Math.max(1, Math.ceil(cutoff / scale)); alpha < 256; alpha++) count += histogram[alpha];
        const actual = count / (data.length / 4), difference = Math.abs(actual - coverage);
        if (difference < error || difference === error && Math.abs(scale - 1) < Math.abs(best - 1)) { error = difference; best = scale; }
        if (actual < coverage) lo = scale; else hi = scale;
      }
      for (let i = 3; i < data.length; i += 4) data[i] = Byte(data[i] * best);
    }
    if (settings.mipFade) {
      const fade = Clamp((levels.length - settings.mipFadeStart) / (settings.mipFadeEnd - settings.mipFadeStart), 0, 1);
      for (let i = 0; i < data.length; i += 4) for (let c = 0; c < 3; c++) data[i + c] = Byte(data[i + c] * (1 - fade) + 128 * fade);
    }
    levels.push({ data, width: nextWidth, height: nextHeight }); width = nextWidth; height = nextHeight;
  }
  return levels;
}
