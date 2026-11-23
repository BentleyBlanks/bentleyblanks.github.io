// 体积噪声纹理（只引 three）：32³ 可平铺 FBM，体积雾与粒子密度场共用同一张。
//
// 以前住在 Script_PostVolumetrics（体积雾 pass）里：粒子为了这一张噪声图 import 了整个体积雾，
// 连带灯光装置、天空与级联阴影。现在挪到这里，Script_PostVolumetrics 照旧再导出 MakeVolumetricNoiseTexture。

import * as THREE from "three";

// ---------------------------------------------------------------------------
// 3D 噪声：32³ 的可平铺 FBM。上传一次，之后逐帧只动 uniform 里的漂移偏移。
// 决定论要求（不许 Math.random）：整数哈希驱动，逐轮截图才比得出「这一版更好」。
// ---------------------------------------------------------------------------
const NOISE_SIZE = 32;

function NoiseHash(x, y, z, seed) {
  // 三维整数哈希（Wang hash 变体）。周期 = NOISE_SIZE，保证 3D 纹理可无缝平铺。
  let h = (x & 1023) * 73856093 ^ (y & 1023) * 19349663 ^ (z & 1023) * 83492791 ^ seed * 2654435761;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

function NoiseValue3(x, y, z, cells, seed) {
  // 值噪声 + 三次平滑。cells 必须整除 NOISE_SIZE，否则接缝处会有一条硬边。
  const fx = x * cells / NOISE_SIZE;
  const fy = y * cells / NOISE_SIZE;
  const fz = z * cells / NOISE_SIZE;
  const ix = Math.floor(fx), iy = Math.floor(fy), iz = Math.floor(fz);
  const tx = fx - ix, ty = fy - iy, tz = fz - iz;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty), sz = tz * tz * (3 - 2 * tz);
  const W = (dx, dy, dz) => NoiseHash(
    (ix + dx + cells) % cells, (iy + dy + cells) % cells, (iz + dz + cells) % cells, seed);
  const x00 = W(0, 0, 0) + (W(1, 0, 0) - W(0, 0, 0)) * sx;
  const x10 = W(0, 1, 0) + (W(1, 1, 0) - W(0, 1, 0)) * sx;
  const x01 = W(0, 0, 1) + (W(1, 0, 1) - W(0, 0, 1)) * sx;
  const x11 = W(0, 1, 1) + (W(1, 1, 1) - W(0, 1, 1)) * sx;
  const y0 = x00 + (x10 - x00) * sy;
  const y1 = x01 + (x11 - x01) * sy;
  return y0 + (y1 - y0) * sz;
}

/**
 * 烟尘团噪声。R = 三个八度的 FBM（大团），G = 单个高频八度（边缘的碎絮）。
 * B/A 复制 R，个别驱动对 RGB=RGBA8 的 3D 纹理上传路径挑剔，四通道最稳。
 */
export function MakeVolumetricNoiseTexture() {
  const n = NOISE_SIZE;
  const data = new Uint8Array(n * n * n * 4);
  for (let z = 0; z < n; z += 1) {
    for (let y = 0; y < n; y += 1) {
      for (let x = 0; x < n; x += 1) {
        const fbm = NoiseValue3(x, y, z, 2, 17) * 0.54
          + NoiseValue3(x, y, z, 4, 91) * 0.30
          + NoiseValue3(x, y, z, 8, 233) * 0.16;
        const detail = NoiseValue3(x, y, z, 8, 613) * 0.62 + NoiseValue3(x, y, z, 16, 787) * 0.38;
        const i = ((z * n + y) * n + x) * 4;
        const a = Math.round(Math.max(0, Math.min(1, fbm)) * 255);
        data[i] = a;
        data[i + 1] = Math.round(Math.max(0, Math.min(1, detail)) * 255);
        data[i + 2] = a;
        data[i + 3] = 255;
      }
    }
  }
  const texture = new THREE.Data3DTexture(data, n, n, n);
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.wrapR = THREE.RepeatWrapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.generateMipmaps = false;
  texture.unpackAlignment = 1;
  texture.needsUpdate = true;
  return texture;
}
