// 过场分镜索引。画面文件与镜号以 Data_CutsceneShots.json 为准。
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const CutsceneStoryboard = JSON.parse(
  readFileSync(join(here, "Data_CutsceneShots.json"), "utf8"),
);
