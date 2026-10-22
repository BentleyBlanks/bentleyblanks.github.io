// Career values are independent of the renderer. A collection is one original
// deposit, even when its physical pieces were recovered separately.
export const CAREER_VERSION = 3;
export const TOOL_CATALOG = Object.freeze({
  scoop: {id: 'earPickBamboo', name: '基础耳勺', cost: 0, visits: 0, requires: [], detail: '浅层干片的起步器具；凹面贴住翘边，慢慢托起。'},
  feather: {id: 'gooseFeather', name: '鹅绒清屑掸', cost: 40, visits: 1, requires: [], detail: '带走实际碰到的微屑；升级增加每次携带容量。'},
  brush: {id: 'softBrush', name: '柔毛刷', cost: 56, visits: 2, requires: ['feather'], detail: '先把细屑扫拢，再用鹅绒掸带走。'},
  drops: {id: 'earDrops', name: '软化滴管', cost: 75, visits: 3, requires: [], detail: '软化牢固附着，为黏块与硬结处理做准备。'},
  tweezers: {id: 'earForceps', name: '精细耳镊', cost: 105, visits: 3, requires: ['drops'], detail: '夹取软化后的黏块，长工作端可处理弯道深部。'},
  suction: {id: 'microSuction', name: '微型吸引管', cost: 200, visits: 6, requires: ['drops', 'tweezers'], detail: '吸入软化碎片，滤芯回收按碎片完整度估价。'},
});
export const LAMP_LEVELS = Object.freeze([
  {level: 1, name: '旧式台灯', cost: 0, intensity: 55},
  {level: 2, name: '聚光台灯', cost: 28, intensity: 95},
  {level: 3, name: '明亮检查灯', cost: 110, intensity: 145},
]);
export const TOOL_LIGHT = Object.freeze({cost: 90, minLevel: 3, tools: ['scoop', 'tweezers', 'suction']});
export const COLLECTION_GRADES = Object.freeze([
  {grade: 1, name: '碎屑', multiplier: 1, color: '#aca18e'},
  {grade: 2, name: '完整', multiplier: 1.25, color: '#d7c6a2'},
  {grade: 3, name: '精良', multiplier: 1.7, color: '#9fc5b3'},
  {grade: 4, name: '珍品', multiplier: 2.3, color: '#c6acd9'},
  {grade: 5, name: '耀金', multiplier: 3.2, color: '#ffe1a0'},
]);
const Clamp = (value, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, Number.isFinite(value) ? value : lo));
export function CareerToolId(id) {
  return Object.hasOwn(TOOL_CATALOG, id) ? id : Object.keys(TOOL_CATALOG).find(key => TOOL_CATALOG[key].id === id) || id;
}
export function WaxSourceId(piece) { return String(piece?.sourceRoot ?? piece?.id ?? '').split('.')[0]; }
export function WaxDifficulty(source) {
  if (!source || source.fine) return .08;
  const material = {dry: .22, wet: .46, impacted: .78, oily: .5}[source.type] ?? .1;
  return Clamp(material + (source.depth >= 13 ? .32 : source.depth >= 8 ? .12 : 0));
}
export function CaptureWaxSources(items = []) {
  const result = {};
  for (const item of items) {
    const id = WaxSourceId(item);
    // The caller captures the untouched scene, never a descendant or remainder.
    if (!id || item.fragment || item.generation > 0 || String(item.id).includes('.') || !(item.mass > 0)) continue;
    if (Object.hasOwn(result, id)) continue;
    result[id] = {id, mass: item.mass, type: item.type, depth: Math.max(0, item.depth || 0), fine: !!item.fine, form: item.form || ''};
  }
  return result;
}
export function UniqueWaxPieces(items = []) {
  const seen = new Set(), result = [];
  // Parent and descendant receipts cannot both describe collected material.
  for (const item of items.filter(item => item && item.id != null && Number.isFinite(item.mass) && item.mass > 0)
    .slice().sort((a, b) => String(a.id).length - String(b.id).length)) {
    const id = String(item.id);
    if (seen.has(id) || result.some(parent => id.startsWith(String(parent.id) + '.'))) continue;
    seen.add(id); result.push(item);
  }
  return result;
}
export function ValueWax(pieceOrPieces, sources = {}) {
  const items = UniqueWaxPieces(Array.isArray(pieceOrPieces) ? pieceOrPieces : [pieceOrPieces]);
  const sourceId = WaxSourceId(items[0]), source = sources[sourceId];
  const pieces = items.filter(item => WaxSourceId(item) === sourceId);
  const sourceMass = source?.mass || 0;
  const collectedMass = Math.min(sourceMass, pieces.reduce((sum, item) => sum + item.mass, 0));
  const fragmented = pieces.length > 1 || pieces.some(item => item.fragment || item.generation > 0 || String(item.id).includes('.'));
  const largest = Math.max(0, ...pieces.map(item => Math.min(sourceMass, item.mass)));
  const generation = Math.max(0, ...pieces.map(item => item.generation || String(item.id).split('.').length - 1));
  const integrity = sourceMass > 0 ? Clamp(largest / sourceMass * (fragmented ? Math.max(.4, .82 - .08 * generation) : 1)) : 0;
  const difficulty = WaxDifficulty(source);
  let grade = 1;
  if (source && !source.fine && integrity >= .65 && difficulty >= .2) grade = 2;
  if (integrity >= .8 && difficulty >= .4) grade = 3;
  if (integrity >= .9 && difficulty >= .58) grade = 4;
  if (!fragmented && integrity >= .96 && difficulty >= .78 && collectedMass >= sourceMass * .98) grade = 5;
  const spec = COLLECTION_GRADES[grade - 1];
  // One rounding operation per original deposit. Splitting never creates coins.
  const value = collectedMass > 0 ? Math.max(1, Math.floor(collectedMass * (3 + difficulty * 9) * spec.multiplier * (.5 + integrity * .5) + 1e-8)) : 0;
  return {sourceId, sourceMass, collectedMass, difficulty, integrity, fragmented, pieces: pieces.length,
    grade, gradeName: spec.name, color: spec.color, sparkle: grade === 5, value};
}
export function AppraiseHarvest(harvest = [], sources = {}) {
  const groups = new Map();
  for (const piece of UniqueWaxPieces(harvest)) {
    const key = WaxSourceId(piece);
    if (!Object.hasOwn(sources, key)) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(piece);
  }
  return [...groups.values()].map(pieces => ({...ValueWax(pieces, sources), type: sources[WaxSourceId(pieces[0])].type,
    depth: sources[WaxSourceId(pieces[0])].depth,
    pieceIds: pieces.map(piece => String(piece.id))}));
}
