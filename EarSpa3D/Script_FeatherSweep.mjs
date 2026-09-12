export function FeatherCapacity(level = 1) {
  return Math.max(1, Math.min(5, Math.floor(Number(level) || 1)));
}
