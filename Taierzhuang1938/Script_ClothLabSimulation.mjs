// Wind is applied only to the lab's private grid. Surface density changes acceleration,
// never gravity; aerodynamic force follows the actual deformed surface normal.
import { CLOTH_LAB_SIM as S } from './Data_Tuning_ClothRange.mjs';
export function ApplyClothWind(cloth, cfg, time, dt, gust = 0) {
  const x = cloth.x, v = cloth.v, rows = cloth.rows, cols = cloth.cols;
  const speed = cfg.wind + gust;
  if (speed <= 0) return;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const i = r * cols + c, o = i * 3;
    if (!cloth.inv[i]) continue;
    const a = (r * cols + Math.max(0, c - 1)) * 3, b = (r * cols + Math.min(cols - 1, c + 1)) * 3;
    const d = (Math.max(0, r - 1) * cols + c) * 3, e = (Math.min(rows - 1, r + 1) * cols + c) * 3;
    const ax = x[b] - x[a], ay = x[b + 1] - x[a + 1], az = x[b + 2] - x[a + 2];
    const bx = x[e] - x[d], by = x[e + 1] - x[d + 1], bz = x[e + 2] - x[d + 2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
    const length = Math.hypot(nx, ny, nz);
    if (length < 1e-8) continue;
    nx /= length; ny /= length; nz /= length;
    const flutter = 0.75 + 0.25 * Math.sin(time * 2.8 + r * 0.43 + c * 0.21);
    const relative = (speed * 0.3 - v[o]) * nx + (speed * 0.12 - v[o + 1]) * ny + (speed * flutter - v[o + 2]) * nz;
    const force = Math.max(-S.windAccelerationMax, Math.min(S.windAccelerationMax,
      S.pressure * relative * Math.abs(relative) / Math.max(0.1, cfg.density)));
    v[o] += nx * force * dt; v[o + 1] += ny * force * dt; v[o + 2] += nz * force * dt;
  }
}
