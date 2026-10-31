// node 里读场景文件（docs/Data_Scene.md）：生成器、CLI、纯 node 测试共用。浏览器走 fetch（Script_EditorBlockoutLevels.Prepare）。

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DecodeSceneHeights, SceneDir, SceneFileName } from "./Script_SceneDoc.mjs";
import { BLOCKOUT_LEVELS, BlockoutSliceDoc } from "./Script_EditorBlockoutLevels.mjs";

export const PROJECT_DIR = path.dirname(fileURLToPath(import.meta.url));

export function SceneFilePath(sceneId) {
  return path.join(PROJECT_DIR, SceneDir(sceneId), SceneFileName(sceneId));
}

/** 场景 id → { doc, heights }（heights 是整张高度图，米）。 */
export function ReadSceneSync(sceneId) {
  const file = SceneFilePath(sceneId);
  const doc = JSON.parse(fs.readFileSync(file, "utf8"));
  const heights = DecodeSceneHeights(fs.readFileSync(path.join(path.dirname(file), doc.terrain.file)), doc.terrain);
  return { doc, heights };
}

/**
 * 白盒关卡键 → 这一关的场景形状（tengxian-blockout-scene/1，同原来 Blockout/<Level>.scene.json；terrain 带解好的 heights）。
 * 还是旧式文件场景的关卡（SecondLevel）直接读那份文件；没有场景的（FirstLevel）返回 null。
 */
export function ReadBlockoutSceneDocSync(levelKey) {
  const level = BLOCKOUT_LEVELS.find(l => l.key === levelKey);
  if (!level) throw new Error(`没有这一关：${levelKey}`);
  if (level.scene.kind === "file") return JSON.parse(fs.readFileSync(path.join(PROJECT_DIR, level.scene.url), "utf8"));
  if (level.scene.kind !== "scene") return null;
  const sceneId = path.basename(path.dirname(level.scene.url));
  const { doc, heights } = ReadSceneSync(sceneId);
  return BlockoutSliceDoc(level, doc, heights);
}
