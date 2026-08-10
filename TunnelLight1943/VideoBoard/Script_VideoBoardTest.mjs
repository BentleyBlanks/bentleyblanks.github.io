import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  BoardMeta,
  NarrationAssets,
  PromptAssets,
  ReferenceAssets,
  SourceTasks,
  StoryHierarchy,
  TransitionLabels,
  VideoGroups,
  VideoNodes,
} from "./Data_VideoNodes.mjs";

const boardRoot = path.dirname(fileURLToPath(import.meta.url));

function ReadText(fileName) {
  return fs.readFileSync(path.join(boardRoot, fileName), "utf8");
}

function ProbeVideo(filePath) {
  const result = spawnSync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration:stream=codec_type,codec_name,width,height,r_frame_rate,color_range,color_space,color_transfer,color_primaries",
    "-of", "json",
    filePath,
  ], { encoding: "utf8" });
  assert.equal(result.status, 0, `ffprobe failed for ${filePath}: ${result.stderr}`);
  return JSON.parse(result.stdout);
}

function TestDataContract() {
  assert.equal(VideoGroups.length, 11, "expected eleven narration groups");
  assert.equal(VideoNodes.length, 26, "the edit must be multi-node, not one video per narration line");
  assert.equal(NarrationAssets.length, 11, "every scene must keep its AI narration asset");
  assert.equal(ReferenceAssets.length, 15, "reference images must be first-class assets");
  assert.equal(PromptAssets.length, 26, "every video must have a first-class prompt asset");
  assert.equal(VideoNodes.length + PromptAssets.length + ReferenceAssets.length + NarrationAssets.length, 78, "director asset count changed");
  assert.equal(VideoNodes.reduce((sum, node) => sum + node.duration, 0), BoardMeta.targetDuration, "timeline must remain 120 seconds");
  assert.equal(new Set(VideoNodes.map((node) => node.id)).size, VideoNodes.length, "node ids must be unique");
  assert.equal(Object.keys(SourceTasks).length, 18, "all accepted and rejected original tasks must remain auditable");
  assert.equal(Object.values(SourceTasks).filter((task) => task.accepted).length, 15, "accepted task count changed");
  assert.equal(Object.values(SourceTasks).filter((task) => !task.accepted).length, 3, "rejected prompt history must remain visible");
  assert.ok(Object.values(SourceTasks).every((task) => task.prompt.length > 40), "an original prompt was lost");
  assert.ok(Object.entries(SourceTasks).every(([submitId, task]) => task.submitId === submitId && task.provider === "Dreamina" && task.status === "success"), "source task provenance wrapper is incomplete");
  assert.ok(VideoNodes.every((node) => TransitionLabels[node.transitionOut.type]), "unknown transition type");
  assert.ok(VideoNodes.every((node) => node.model === "seedance2.0_vip"), "default model must follow the documented fallback");
  assert.ok(VideoNodes.every((node) => node.resolution === "720p"), "all nodes must remain 720p");
  assert.equal(StoryHierarchy.chapters.length, 1, "the current director project must expose its chapter");
  assert.equal(StoryHierarchy.chapters[0].scenes.length, 11, "chapter must contain the eleven prologue scenes");
  assert.equal(StoryHierarchy.chapters[0].scenes.flatMap((scene) => scene.shotIds).length, 26, "scene hierarchy must close over all shots");
  assert.equal(new Set(VideoNodes.map((node) => node.assetId)).size, 26, "video asset ids must be stable and unique");
  assert.equal(new Set(VideoNodes.map((node) => node.shotId)).size, 26, "shot asset ids must be explicit and unique");
  assert.ok(VideoNodes.every((node) => node.chapterId === BoardMeta.chapterId && node.sceneId === `SCENE.PRO.${node.groupId}`), "node hierarchy ids must be explicit");
  assert.equal(new Set(PromptAssets.map((asset) => asset.id)).size, 26, "prompt asset ids must be stable and unique");
  assert.ok(PromptAssets.every((asset) => asset.versions[0].prompt.includes("默认单一固定机位")), "working prompt style lock changed");
  assert.equal(new Set([...ReferenceAssets.map((asset) => asset.id), ...NarrationAssets.map((asset) => asset.assetId)]).size, 26, "image/audio asset ids must be unique");
  assert.ok(ReferenceAssets.every((asset) => /^IMG\.PRO\./.test(asset.id) && asset.versions.length >= 1), "reference ids/versions must be explicit");
  assert.ok(ReferenceAssets.some((asset) => asset.versions.some((version) => version.file.endsWith("Texture_ReferencePro11A.png"))), "superseded Pro11A reference must remain traceable");
}

function TestMediaContract() {
  for (const node of VideoNodes) {
    const clipPath = path.resolve(boardRoot, node.clip);
    const posterPath = path.resolve(boardRoot, node.poster);
    assert.ok(fs.existsSync(clipPath), `missing clip ${clipPath}`);
    assert.ok(fs.existsSync(posterPath), `missing poster ${posterPath}`);
    for (const referenceFile of node.referenceFiles) {
      assert.ok(fs.existsSync(path.join(boardRoot, "Reference", referenceFile)), `missing reference ${referenceFile}`);
    }
    const probe = ProbeVideo(clipPath);
    const stream = probe.streams.find((item) => item.codec_type === "video");
    assert.equal(probe.streams.filter((item) => item.codec_type === "audio").length, 0, `${node.id} must not embed audio`);
    assert.equal(stream.codec_name, "h264", `${node.id} codec`);
    assert.equal(stream.width, 1280, `${node.id} width`);
    assert.equal(stream.height, 720, `${node.id} height`);
    assert.equal(stream.r_frame_rate, "30/1", `${node.id} fps`);
    assert.equal(stream.color_range, "tv", `${node.id} color range`);
    assert.equal(stream.color_space, "bt709", `${node.id} color space`);
    assert.equal(stream.color_transfer, "bt709", `${node.id} transfer`);
    assert.equal(stream.color_primaries, "bt709", `${node.id} primaries`);
    const actualDuration = Number(probe.format.duration);
    assert.ok(Math.abs(actualDuration - node.duration) <= 0.07, `${node.id} duration ${actualDuration} != ${node.duration}`);
  }
  for (const narration of NarrationAssets) {
    assert.ok(fs.existsSync(path.resolve(boardRoot, narration.file)), `missing narration ${narration.file}`);
  }
  for (const reference of ReferenceAssets) {
    for (const version of reference.versions) assert.ok(fs.existsSync(path.resolve(boardRoot, version.file)), `missing reference version ${version.file}`);
  }
}

function TestPageContract() {
  const html = ReadText("index.html");
  const css = ReadText("Style_VideoBoard.css");
  const script = ReadText("Script_VideoBoard.mjs");
  for (const id of [
    "canvasViewport", "edgeLayer", "nodeLayer", "timelineTrack", "fieldWorkingPrompt", "buttonRegenerate", "sequenceDialog",
    "buttonSequenceMode", "buttonDependencyMode", "buttonVersionMode", "buttonPublish", "versionRail", "selectedAudio", "buttonFocusPrompt", "selectedPromptPanel",
  ]) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `missing UI element ${id}`);
  }
  assert.match(css, /\.previewFrame video[^{]*\{[^}]*filter:\s*none\s*!important/s, "selected preview must not apply a color filter");
  assert.match(css, /\.sequenceScreen video[^{]*\{[^}]*filter:\s*none\s*!important/s, "sequence preview must not apply a color filter");
  assert.match(css, /@media \(max-width: 820px\)[\s\S]*\.editorShell\s*\{[^}]*grid-template-columns:\s*1fr/s, "mobile director layout must stack");
  assert.match(css, /@media \(max-width: 520px\)[\s\S]*\.fieldGrid\s*\{[^}]*grid-template-columns:\s*1fr/s, "mobile inspector fields must not overflow");
  assert.match(script, /confirmCredits:\s*true/, "paid generation must require explicit confirmation");
  assert.match(script, /localStorage/, "prompt edits must persist locally");
  assert.match(script, /ExportTaskJson/, "task JSON export missing");
  assert.match(script, /BuildCliCommand/, "CLI copy path missing");
  assert.match(script, /node\.candidates\.push\(/, "generation result must append a candidate");
  assert.doesNotMatch(script, /node\.replacementUrl\s*=/, "generation must not replace the adopted version directly");
  assert.match(script, /function AdoptCandidate/, "explicit candidate adoption is missing");
  assert.match(script, /function RestoreArchivedCandidate/, "archived candidates must be recoverable");
  assert.match(script, /function AdoptPromptVersion/, "prompt versions must be independently adoptable");
  assert.match(script, /function AdoptReferenceVersion/, "reference image versions must be independently adoptable");
  assert.match(script, /function PublishWorkingManifest/, "immutable release manifest path is missing");
  assert.match(script, /buttonPublish\.addEventListener\("click", PublishWorkingManifest\)/, "publish manifest control is not bound");
  assert.match(script, /GetCurrentVideoUrl\(orderedNodes\[state\.sequenceIndex\]\)/, "sequence preview must read the adopted version pointer");
  assert.match(script, /tunnel-light-asset-release\/v2/, "release schema missing");
  assert.match(script, /colorSpace:\s*"bt709"/, "release manifest must preserve the BT.709 contract");
  assert.match(script, /chapterId:\s*node\.chapterId/, "release must preserve chapter hierarchy");
  assert.match(script, /promptAssetId:\s*node\.promptAssetId/, "release must snapshot prompt identity");
  assert.match(script, /FindNestedMediaUrl\(payload\.result\)/, "nested Dreamina success payloads must resolve to candidates");
  assert.match(script, /activeJob:\s*state\.activeJob/, "active generation jobs must survive a reload");
  assert.doesNotMatch(script, /innerHTML\s*=/, "do not inject prompt text through innerHTML");
}

TestDataContract();
TestMediaContract();
TestPageContract();
console.log("AssetDirector PASS: hierarchy, 78 assets, 26 nodes, 120s timeline, BT.709 media, candidates, adoption, releases and credit gate.");
