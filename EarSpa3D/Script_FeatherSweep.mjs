export function FeatherCapacity(level = 1) {
  const index = Math.max(1, Math.min(5, Math.floor(Number(level) || 1))) - 1;
  return [1, 3, 6, 9, 12][index];
}
