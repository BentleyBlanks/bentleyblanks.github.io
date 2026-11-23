import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

export function buildRefinementPrompt(task, mocapRun, repoRoot) {
  const sourceVideo = task.selectedVideoPath || "(未指定原视频)";
  const files = mocapRun?.files || {};
  const glbPath = Object.values(files).find((f) => f.relPath.endsWith(".glb"))?.localPath || "";
  const fbxPath = Object.values(files).find((f) => f.relPath.endsWith(".fbx"))?.localPath || "";
  const bvhPath = Object.values(files).find((f) => f.relPath.endsWith(".bvh"))?.localPath || "";
  const overlayPath = files["render/overlay.mp4"]?.localPath || "";

  const mixamoPath = task.stage5?.mixamoGlb?.localPath || "";
  const openIssues = (task.stage6?.issues || task.stage5?.issues || []).filter((it) => it.status !== "done");
  const issuesMd = openIssues.length
    ? openIssues
        .map(
          (it, idx) =>
            `${idx + 1}. [帧段 ${it.frameRange || "全程"} | 部位: ${it.bodyPart || "全身"}] 问题：${it.description}；目标修缮：${it.targetFix || "对照原视频自然贴合，不穿模、不滑步"}`
        )
        .join("\n")
    : "1. 逐帧对照原始视频与 77 关节叠加视频，检查支撑脚接地、膝盖弯曲方向、双手十指抓握/指方向自然度与无穿模。";

  return `# 骨骼动画修缮任务单（BlenderMCP）

- **动作任务**：${task.title}（ID: \`${task.id}\`）
- **角色 / 关卡拍号**：${task.stage1?.character || "未填"} / ${task.stage1?.beat || "未填"}
- **目标角色模型 ID**：\`${task.stage5?.characterId || task.characterId || "xbot"}\`
- **动作要点**：${task.stage1?.description || "未填"}

## 输入素材路径
- **原始参考视频**：\`${sourceVideo}\`
- **77 关节叠加验收视频**：\`${overlayPath || "无"}\`
- **重定向 Mixamo X Bot GLB（优先在此基础上修）**：\`${mixamoPath || "无"}\`
- **原始 SOMA-77 恢复骨骼**：
  - GLB: \`${glbPath || "无"}\`
  - FBX: \`${fbxPath || "无"}\`
  - BVH: \`${bvhPath || "无"}\`

## 本次修缮清单
${issuesMd}

## 执行规范（严格遵守）
1. 使用仓库入口 \`node "${path.join(repoRoot, "scripts", "Script_BlenderMcp.mjs")}" start\` 启动 Blender 实例，并在本轮结束后必须执行 \`stop\` 清理进程。
2. 逐帧对照原视频修缮关键帧，保留 77 关节原始骨长与自然解剖范围，禁止通过强行拉直支撑膝或破坏手指层级来凑接地。
3. 另存新版 \`.blend\` 与导出修缮后的 \`.glb\` / \`.fbx\` 到本任务 \`refined/\` 目录，不要覆盖原始恢复件。
`;
}

export async function writeRefinementBrief(task, mocapRun, taskDir, repoRoot) {
  const refineDir = path.join(taskDir, "refined");
  await fs.mkdir(refineDir, { recursive: true });
  const briefText = buildRefinementPrompt(task, mocapRun, repoRoot);
  const briefPath = path.join(refineDir, "RefinementBrief.md");
  await fs.writeFile(briefPath, briefText, "utf-8");
  return { briefPath, briefText, refineDir };
}

export function launchRefinementCommand({ commandTemplate, briefPath, refineDir, cwd, onLog, onExit }) {
  const finalCmd = commandTemplate
    .replaceAll("{{BRIEF_FILE}}", briefPath)
    .replaceAll("{{OUTPUT_DIR}}", refineDir);

  onLog?.(`启动本地修缮命令: ${finalCmd}`);
  const child = spawn(finalCmd, {
    cwd,
    shell: true,
    windowsHide: true,
  });

  child.stdout?.on("data", (buf) => {
    for (const line of buf.toString("utf-8").split(/\r?\n/)) {
      if (line.trim()) onLog?.(line);
    }
  });
  child.stderr?.on("data", (buf) => {
    for (const line of buf.toString("utf-8").split(/\r?\n/)) {
      if (line.trim()) onLog?.(`[stderr] ${line}`);
    }
  });
  child.on("close", (code) => {
    onExit?.(code ?? 1);
  });
  child.on("error", (err) => {
    onLog?.(`[error] ${err.message}`);
    onExit?.(1);
  });
  return child;
}
