// Data_BootPapers.mjs 的配套函数（2026-11-02 从数据模块搬出来：数据模块只放能导出成 JSON 的数据，见 docs/Data_DataSources.md「数据模块只放数据」）。

import { BOOT_PAPERS, BOOT_PAPER_DIR, BOOT_PAPER_PBR_STAMP, BOOT_PAPER_STAMP, BOOT_PAPER_TILT } from "./Data_BootPapers.mjs";

/** 随机抽一张，尽量不与 lastId 重复。rand 默认 Math.random，测试里可注入。 */
export function PickBootPaper(lastId = null, rand = Math.random) {
  const pool = BOOT_PAPERS.length > 1 ? BOOT_PAPERS.filter((paper) => paper.id !== lastId) : BOOT_PAPERS;
  return pool[Math.min(pool.length - 1, Math.floor(rand() * pool.length))];
}

export function BootPaperUrl(paper) {
  return `${BOOT_PAPER_DIR}${paper.file}?v=${BOOT_PAPER_STAMP}`;
}

export function BootPaperPbrUrls(paper) {
  const stem = `${BOOT_PAPER_DIR}Texture_BootPaper${paper.id}`;
  return {
    base: BootPaperUrl(paper),
    normal: `${stem}Normal.webp?v=${BOOT_PAPER_PBR_STAMP}`,
    roughness: `${stem}RoughnessMask.webp?v=${BOOT_PAPER_PBR_STAMP}`,
  };
}

/**
 * 一次拖拽位移加到当前倾角上，返回新倾角（度）。纯函数，测试直接断言上限。
 * 越接近上限衰减越多（橡皮筋手感），永远不会超过 max。
 */
export function ApplyTiltDrag(current, dx, dy, tuning = BOOT_PAPER_TILT) {
  const step = (value, delta, max) => {
    if (delta === 0) return value;
    const toward = Math.sign(delta) === Math.sign(value) || value === 0;
    const room = toward ? Math.max(0, 1 - Math.abs(value) / max) : 1;
    const gain = toward ? tuning.edgeSoftness + (1 - tuning.edgeSoftness) * room : 1;
    return Math.max(-max, Math.min(max, value + delta * gain));
  };
  return {
    yaw: step(current.yaw, dx * tuning.yawDegPerPx, tuning.maxYawDeg),
    pitch: step(current.pitch, -dy * tuning.pitchDegPerPx, tuning.maxPitchDeg),
  };
}
