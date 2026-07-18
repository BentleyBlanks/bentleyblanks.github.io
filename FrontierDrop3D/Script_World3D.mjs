export const worldSize3D = 1000;
export const worldHalf3D = worldSize3D / 2;

export function Clamp3D(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

export function Lerp3D(start, end, amount) {
  return start + (end - start) * amount;
}

export function WorldToScene3D(worldX, worldY) {
  return { x: worldX - worldHalf3D, z: worldY - worldHalf3D };
}

export function SceneToWorld3D(sceneX, sceneZ) {
  return { x: sceneX + worldHalf3D, y: sceneZ + worldHalf3D };
}

export function TerrainHeightAt3D(worldX, worldY) {
  const broadRidge = Math.sin(worldX * 0.0107) * 2.4 + Math.cos(worldY * 0.0091) * 2.05;
  const crossFold = Math.sin((worldX + worldY) * 0.0047) * 1.6;
  const basin = -3.2 * Math.exp(-(((worldX - 510) ** 2) + ((worldY - 515) ** 2)) / 155000);
  const detail = Math.sin(worldX * 0.034 + worldY * 0.019) * 0.48;
  return broadRidge + crossFold + basin + detail;
}

export function DirectionFromYaw3D(yaw) {
  return { x: Math.sin(yaw), y: Math.cos(yaw) };
}

export function CameraRelativeMovement3D(sideAmount, forwardAmount, yaw) {
  const forward = DirectionFromYaw3D(yaw);
  const right = { x: forward.y, y: -forward.x };
  const worldX = forward.x * forwardAmount + right.x * sideAmount;
  const worldY = forward.y * forwardAmount + right.y * sideAmount;
  const length = Math.hypot(worldX, worldY);
  if (length <= 1 || length <= 0.0001) return { x: worldX, y: worldY };
  return { x: worldX / length, y: worldY / length };
}

export function HashColor3D(value) {
  let hash = 2166136261;
  const textValue = String(value);
  for (let index = 0; index < textValue.length; index += 1) {
    hash ^= textValue.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const hue = ((hash >>> 0) % 360) / 360;
  return { hue, hash: hash >>> 0 };
}
