import {
  AssetTypeLabels,
  BoardMeta,
  NarrationAssets,
  PromptAssets,
  ReferenceAssets,
  SourceTasks,
  StoryHierarchy,
  StyleLockPrompt,
  TransitionLabels,
  VideoGroups,
  VideoNodes,
} from "./Data_VideoNodes.mjs";

const surfaceWidth = 6160;
const surfaceHeight = 1040;
const groupSpacing = 550;
const nodeWidth = 290;
const nodeHeight = 184;
const canvasSizes = Object.freeze({
  sequence: { width: surfaceWidth, height: surfaceHeight },
  dependency: { width: 1640, height: 920 },
  versions: { width: 1640, height: 920 },
});

const elements = {};
for (const id of [
  "sceneCount", "nodeCount", "assetCount", "totalDuration", "canvasViewport", "canvasSurface", "edgeLayer", "groupLayer", "nodeLayer",
  "timelineTrack", "buttonPlayAll", "buttonPublish", "buttonExport", "buttonFit", "buttonZoomOut", "buttonZoomIn", "zoomValue",
  "buttonResetLayout", "selectedOrder", "inspectorTitle", "nodeStatus", "selectedVideo", "previewTimecode",
  "selectedImage", "selectedAudioPanel", "selectedAudio", "selectedAudioTitle", "selectedAudioText",
  "selectedPromptPanel", "selectedPromptTitle", "selectedPromptIdentity", "selectedPromptText",
  "buttonSequenceMode", "buttonDependencyMode", "buttonVersionMode", "candidateCount", "buttonAllGroups", "projectGroupList",
  "workingVersionLabel", "releaseVersionLabel", "canvasModeLabel", "toolHint",
  "buttonFocusShot", "buttonFocusImage", "buttonFocusPrompt", "buttonFocusVideo", "buttonFocusAudio", "assetStableId", "assetCurrentVersion", "assetConsumers",
  "assetOverviewSection", "assetOverviewTitle", "assetOverviewText", "assetRecipeEngine", "assetRecipeId", "assetRecipeStatus",
  "videoGenerationFields", "assetCapabilityNote", "promptSection", "sourcePromptSection", "referenceSection", "transitionSection", "generationSection",
  "fieldDuration", "fieldGenerationDuration", "fieldModel", "fieldResolution", "fieldWorkingPrompt", "promptDirtyState",
  "buttonSavePrompt", "buttonRestorePrompt", "buttonCopyCommand", "sourceTaskId", "sourceTaskKind", "sourcePrompt",
  "referenceStrip", "currentClip", "plannedOutput", "fieldTransitionType", "fieldTransitionDuration", "buttonMoveEarlier",
  "buttonMoveLater", "buttonPlayFromNode", "bridgeStatus", "bridgeHelp", "buttonRegenerate", "generationProgress",
  "promptHistory", "creditDialog", "confirmNode", "confirmModel", "confirmDuration", "buttonConfirmGenerate",
  "versionRail", "versionImpact",
  "sequenceDialog", "sequenceVideoA", "sequenceVideoB", "sequenceBlack", "sequenceCounter", "sequenceTitle",
  "sequenceTransition", "buttonSequencePause", "buttonSequenceNext", "buttonSequenceClose", "toast",
]) elements[id] = document.getElementById(id);

const defaultNodes = VideoNodes.map((node) => {
  const promptAsset = PromptAssets.find((asset) => asset.id === node.promptAssetId);
  const workingPrompt = promptAsset?.versions[0]?.prompt || `${StyleLockPrompt}\n\n${node.actionPrompt}`;
  return {
    ...node,
    referenceFiles: [...node.referenceFiles],
    transitionOut: { ...node.transitionOut },
    workingPrompt,
    promptHistory: [],
    promptVersions: promptAsset ? promptAsset.versions.map((version) => ({ ...version })) : [{ id: "v1", createdAt: "source", prompt: workingPrompt }],
    currentVersionId: "v1",
    versions: [{
      id: "v1",
      url: node.clip,
      file: node.clip,
      createdAt: "source",
      source: "原始拆分源片",
      command: node.command,
      sourceTaskId: node.sourceTaskId,
      promptAssetId: node.promptAssetId,
      promptVersion: "v1",
      prompt: workingPrompt,
      referenceFiles: [...node.referenceFiles],
      model: node.model,
      resolution: node.resolution,
      duration: node.generationDuration,
      timelineDuration: node.duration,
      media: { local: true, persisted: true, verified: true },
    }],
    candidates: [],
    candidateArchive: [],
    promptVersion: "v1",
    outputFile: `Animation_Regen${node.id.slice(3).toUpperCase()}.mp4`,
  };
});

const state = {
  nodes: defaultNodes,
  order: defaultNodes.map((node) => node.id),
  positions: BuildDefaultPositions(),
  selectedId: defaultNodes[0].id,
  selectedGroupId: "all",
  assetFocus: "video",
  selectedReferenceFile: defaultNodes[0].referenceFiles[0],
  referenceVersionIds: Object.fromEntries(ReferenceAssets.map((asset) => [asset.id, asset.currentVersionId || asset.version])),
  referenceReviewNodeIds: new Set(),
  viewMode: "sequence",
  panX: 26,
  panY: 42,
  zoom: 0.6,
  promptDirty: false,
  bridgeUrl: location.port === "47821" ? location.origin : BoardMeta.localBridgeUrl,
  bridgeOnline: false,
  activeJob: null,
  activeJobResumed: false,
  releases: [],
  workspaceDirty: true,
  sequenceIndex: 0,
  sequenceActiveSlot: 0,
  sequenceTransitionStarted: false,
  sequenceTimer: 0,
};

function BuildDefaultPositions() {
  const positions = {};
  for (let groupIndex = 0; groupIndex < VideoGroups.length; groupIndex += 1) {
    const group = VideoGroups[groupIndex];
    const groupNodes = VideoNodes.filter((node) => node.groupId === group.id);
    for (let nodeIndex = 0; nodeIndex < groupNodes.length; nodeIndex += 1) {
      positions[groupNodes[nodeIndex].id] = {
        x: 90 + groupIndex * groupSpacing,
        y: 158 + nodeIndex * 244,
      };
    }
  }
  return positions;
}

function LoadLocalState() {
  try {
    const releaseStore = JSON.parse(localStorage.getItem(BoardMeta.releaseStorageKey) || "null");
    if (Array.isArray(releaseStore)) state.releases = releaseStore;
    const currentSaved = JSON.parse(localStorage.getItem(BoardMeta.storageKey) || "null");
    const legacySaved = currentSaved ? null : JSON.parse(localStorage.getItem(BoardMeta.legacyStorageKey) || "null");
    const saved = currentSaved || legacySaved;
    if (!saved || (currentSaved && saved.version !== BoardMeta.version)) return;
    if (Array.isArray(saved.order) && saved.order.length === state.order.length) {
      const knownIds = new Set(state.order);
      if (saved.order.every((id) => knownIds.has(id))) state.order = [...saved.order];
    }
    if (saved.positions && typeof saved.positions === "object") {
      for (const id of state.order) {
        const position = saved.positions[id];
        if (Number.isFinite(position?.x) && Number.isFinite(position?.y)) state.positions[id] = { x: position.x, y: position.y };
      }
    }
    if (saved.referenceVersionIds && typeof saved.referenceVersionIds === "object") {
      for (const asset of ReferenceAssets) {
        const versionId = saved.referenceVersionIds[asset.id];
        if (asset.versions.some((version) => version.id === versionId)) state.referenceVersionIds[asset.id] = versionId;
      }
    }
    if (Array.isArray(saved.referenceReviewNodeIds)) {
      const knownIds = new Set(state.nodes.map((node) => node.id));
      state.referenceReviewNodeIds = new Set(saved.referenceReviewNodeIds.filter((id) => knownIds.has(id)));
    }
    if (Array.isArray(saved.nodes)) {
      const savedById = new Map(saved.nodes.map((node) => [node.id, node]));
      state.nodes = state.nodes.map((node) => {
        const previous = savedById.get(node.id);
        if (!previous) return node;
        return {
          ...node,
          duration: Number.isFinite(previous.duration) ? previous.duration : node.duration,
          generationDuration: Number.isFinite(previous.generationDuration) ? previous.generationDuration : node.generationDuration,
          model: previous.model || node.model,
          resolution: previous.resolution || node.resolution,
          workingPrompt: typeof previous.workingPrompt === "string" ? previous.workingPrompt : node.workingPrompt,
          promptHistory: Array.isArray(previous.promptHistory) ? previous.promptHistory.slice(-20) : [],
          promptVersions: Array.isArray(previous.promptVersions) && previous.promptVersions.length
            ? previous.promptVersions.filter((version) => typeof version?.id === "string" && typeof version?.prompt === "string")
            : node.promptVersions,
          currentVersionId: typeof previous.currentVersionId === "string" ? previous.currentVersionId : node.currentVersionId,
          versions: Array.isArray(previous.versions) && previous.versions.length
            ? previous.versions.filter((version) => typeof version?.id === "string" && typeof version?.url === "string")
            : typeof previous.replacementUrl === "string" && previous.replacementUrl
              ? [
                  ...node.versions,
                  { id: "v2", url: previous.replacementUrl, file: previous.outputFile || "本机替换版", createdAt: saved.savedAt || "legacy", source: "旧版导演台已采用" },
                ]
              : node.versions,
          candidates: Array.isArray(previous.candidates)
            ? previous.candidates.filter((candidate) => typeof candidate?.id === "string" && typeof candidate?.url === "string")
            : [],
          candidateArchive: Array.isArray(previous.candidateArchive)
            ? previous.candidateArchive.filter((candidate) => typeof candidate?.id === "string")
            : [],
          promptVersion: typeof previous.promptVersion === "string" ? previous.promptVersion : node.promptVersion,
          outputFile: previous.outputFile || node.outputFile,
          transitionOut: {
            type: previous.transitionOut?.type || node.transitionOut.type,
            duration: Number.isFinite(previous.transitionOut?.duration) ? previous.transitionOut.duration : node.transitionOut.duration,
          },
        };
      });
    }
    if (legacySaved) {
      for (const node of state.nodes) {
        if (node.versions.some((version) => version.id === "v2")) node.currentVersionId = "v2";
      }
    }
    for (const node of state.nodes) {
      if (!node.versions.some((version) => version.id === node.currentVersionId)) node.currentVersionId = node.versions[0]?.id || "v1";
      if (!node.promptVersions.some((version) => version.id === node.promptVersion)) {
        node.promptVersion = node.promptVersions.at(-1)?.id || "v1";
        node.workingPrompt = node.promptVersions.at(-1)?.prompt || node.workingPrompt;
      }
    }
    if (!state.releases.length && Array.isArray(saved.releases)) state.releases = saved.releases;
    if (saved.activeJob && typeof saved.activeJob.nodeId === "string" && typeof saved.activeJob.submitId === "string") {
      state.activeJob = { nodeId: saved.activeJob.nodeId, submitId: saved.activeJob.submitId };
    }
    if (typeof saved.workspaceDirty === "boolean") state.workspaceDirty = saved.workspaceDirty;
  } catch (error) {
    console.warn("AssetDirector local state ignored:", error);
  }
}

function SaveLocalState() {
  const payload = {
    version: BoardMeta.version,
    savedAt: new Date().toISOString(),
    order: state.order,
    positions: state.positions,
    referenceVersionIds: state.referenceVersionIds,
    referenceReviewNodeIds: [...state.referenceReviewNodeIds],
    nodes: state.nodes.map((node) => ({
      id: node.id,
      duration: node.duration,
      generationDuration: node.generationDuration,
      model: node.model,
      resolution: node.resolution,
      workingPrompt: node.workingPrompt,
      promptHistory: node.promptHistory,
      promptVersions: node.promptVersions,
      currentVersionId: node.currentVersionId,
      versions: node.versions,
      candidates: node.candidates,
      candidateArchive: node.candidateArchive,
      promptVersion: node.promptVersion,
      outputFile: node.outputFile,
      transitionOut: node.transitionOut,
    })),
    workspaceDirty: state.workspaceDirty,
    activeJob: state.activeJob,
  };
  localStorage.setItem(BoardMeta.storageKey, JSON.stringify(payload));
  localStorage.setItem(BoardMeta.releaseStorageKey, JSON.stringify(state.releases));
}

function GetNode(nodeId) {
  return state.nodes.find((node) => node.id === nodeId);
}

function GetCurrentVersion(node) {
  return node.versions.find((version) => version.id === node.currentVersionId) || node.versions[0];
}

function GetCurrentVideoUrl(node) {
  return GetCurrentVersion(node)?.url || node.clip;
}

function GetNarrationAsset(groupId) {
  return NarrationAssets.find((asset) => asset.groupId === groupId);
}

function GetReferenceAssets(node) {
  return node.referenceFiles.map((fileName) => ReferenceAssets.find((asset) => asset.fileName === fileName)).filter(Boolean);
}

function GetCurrentReferenceVersion(asset) {
  const versionId = state.referenceVersionIds[asset.id] || asset.currentVersionId || asset.version;
  return asset.versions.find((version) => version.id === versionId) || asset.versions.at(-1);
}

function GetTotalCandidateCount() {
  return state.nodes.reduce((sum, node) => sum + node.candidates.length, 0);
}

function MarkWorkspaceDirty() {
  state.workspaceDirty = true;
  elements.workingVersionLabel.textContent = "有未发布修改";
}

function GetOrderedNodes() {
  return state.order.map(GetNode).filter(Boolean);
}

function FormatTime(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const minutes = Math.floor(safeSeconds / 60);
  const wholeSeconds = Math.floor(safeSeconds % 60);
  const milliseconds = Math.round((safeSeconds - Math.floor(safeSeconds)) * 1000);
  return `${String(minutes).padStart(2, "0")}:${String(wholeSeconds).padStart(2, "0")}.${String(milliseconds).padStart(3, "0")}`;
}

function GetNodeStart(nodeId) {
  let elapsed = 0;
  for (const node of GetOrderedNodes()) {
    if (node.id === nodeId) return elapsed;
    elapsed += node.duration;
  }
  return elapsed;
}

function GetTotalDuration() {
  return GetOrderedNodes().reduce((sum, node) => sum + node.duration, 0);
}

function ApplyCanvasTransform() {
  state.zoom = Math.min(1.35, Math.max(0.1, state.zoom));
  elements.canvasSurface.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;
  elements.zoomValue.value = `${Math.round(state.zoom * 100)}%`;
}

function RenderProjectTree() {
  elements.projectGroupList.replaceChildren();
  for (const group of VideoGroups) {
    const groupNodes = state.nodes.filter((node) => node.groupId === group.id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = state.selectedGroupId === group.id ? "isActive" : "";
    const label = document.createElement("span");
    label.textContent = `${group.id} · ${group.title}`;
    const count = document.createElement("small");
    count.textContent = `${groupNodes.length} 镜`;
    button.append(label, count);
    button.addEventListener("click", () => {
      state.selectedGroupId = group.id;
      elements.buttonAllGroups.classList.remove("isActive");
      const firstNode = GetOrderedNodes().find((node) => node.groupId === group.id);
      if (firstNode) SelectNode(firstNode.id, state.viewMode === "sequence");
      RenderProjectTree();
    });
    elements.projectGroupList.append(button);
  }
  elements.buttonAllGroups.classList.toggle("isActive", state.selectedGroupId === "all");
}

function UpdateDirectorStatus() {
  elements.sceneCount.textContent = String(VideoGroups.length);
  elements.assetCount.textContent = String((state.nodes.length * 2) + ReferenceAssets.length + NarrationAssets.length);
  elements.candidateCount.textContent = String(GetTotalCandidateCount());
  elements.workingVersionLabel.textContent = state.workspaceDirty ? "有未发布修改" : "与发布清单一致";
  const latestRelease = state.releases.at(-1);
  elements.releaseVersionLabel.textContent = latestRelease ? latestRelease.id : "尚未创建";
}

function RenderGroups() {
  elements.groupLayer.replaceChildren();
  for (let index = 0; index < VideoGroups.length; index += 1) {
    const group = VideoGroups[index];
    const header = document.createElement("section");
    header.className = `groupHeader${state.selectedGroupId === group.id ? " isSelected" : ""}`;
    header.style.left = `${60 + index * groupSpacing}px`;
    header.style.top = "24px";
    const title = document.createElement("b");
    title.textContent = `${group.id} · ${group.title}`;
    const narration = document.createElement("span");
    narration.textContent = group.narration;
    header.append(title, narration);
    elements.groupLayer.append(header);
  }
}

function RenderNodes() {
  elements.nodeLayer.replaceChildren();
  const orderIndex = new Map(state.order.map((id, index) => [id, index]));
  for (const node of state.nodes) {
    const position = state.positions[node.id];
    const button = document.createElement("button");
    button.type = "button";
    button.className = `videoNode${node.id === state.selectedId ? " isSelected" : ""}`;
    button.dataset.nodeId = node.id;
    button.style.left = `${position.x}px`;
    button.style.top = `${position.y}px`;
    button.setAttribute("aria-label", `节点 ${String(orderIndex.get(node.id) + 1).padStart(2, "0")}，${node.title}，${node.duration} 秒`);

    const poster = document.createElement("img");
    poster.src = node.poster;
    poster.alt = "";
    poster.draggable = false;
    const indexLabel = document.createElement("span");
    indexLabel.className = "nodeIndex";
    indexLabel.textContent = String(orderIndex.get(node.id) + 1).padStart(2, "0");
    const duration = document.createElement("span");
    duration.className = "nodeDuration";
    duration.textContent = `${node.duration}s`;
    const text = document.createElement("span");
    text.className = "nodeText";
    const title = document.createElement("strong");
    title.textContent = node.title;
    const meta = document.createElement("small");
    const status = document.createElement("span");
    status.textContent = node.candidates.length
      ? `${node.currentVersionId} · ${node.candidates.length} 候选`
      : node.currentVersionId === "v1" ? "采用 v1" : `采用 ${node.currentVersionId}`;
    const transition = document.createElement("em");
    transition.textContent = TransitionLabels[node.transitionOut.type] || node.transitionOut.type;
    meta.append(status, transition);
    text.append(title, meta);
    button.append(poster, indexLabel, duration, text);
    button.addEventListener("pointerdown", BeginNodeDrag);
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") SelectNode(node.id, true);
    });
    elements.nodeLayer.append(button);
  }
}

function AppendSvgElement(parent, name, attributes = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  parent.append(element);
  return element;
}

function RenderEdges() {
  elements.edgeLayer.replaceChildren();
  const definitions = AppendSvgElement(elements.edgeLayer, "defs");
  const marker = AppendSvgElement(definitions, "marker", {
    id: "videoBoardArrow",
    markerWidth: 8,
    markerHeight: 8,
    refX: 7,
    refY: 4,
    orient: "auto",
    markerUnits: "strokeWidth",
  });
  AppendSvgElement(marker, "path", { d: "M0,0 L8,4 L0,8 z", class: "edgeArrow" });

  const orderedNodes = GetOrderedNodes();
  for (let index = 0; index < orderedNodes.length - 1; index += 1) {
    const node = orderedNodes[index];
    const nextNode = orderedNodes[index + 1];
    const from = state.positions[node.id];
    const to = state.positions[nextNode.id];
    const sameColumn = Math.abs(from.x - to.x) < 30;
    let startX;
    let startY;
    let endX;
    let endY;
    let pathData;
    let labelX;
    let labelY;
    if (sameColumn && to.y > from.y) {
      startX = from.x + nodeWidth / 2;
      startY = from.y + nodeHeight;
      endX = to.x + nodeWidth / 2;
      endY = to.y;
      const bend = Math.max(32, (endY - startY) * 0.5);
      pathData = `M ${startX} ${startY} C ${startX} ${startY + bend}, ${endX} ${endY - bend}, ${endX} ${endY}`;
      labelX = startX + 58;
      labelY = (startY + endY) / 2;
    } else {
      startX = from.x + nodeWidth;
      startY = from.y + nodeHeight / 2;
      endX = to.x;
      endY = to.y + nodeHeight / 2;
      const bend = Math.max(64, Math.abs(endX - startX) * 0.45);
      const direction = endX >= startX ? 1 : -1;
      pathData = `M ${startX} ${startY} C ${startX + bend * direction} ${startY}, ${endX - bend * direction} ${endY}, ${endX} ${endY}`;
      labelX = (startX + endX) / 2;
      labelY = (startY + endY) / 2 - 17;
    }
    AppendSvgElement(elements.edgeLayer, "path", {
      d: pathData,
      class: `edgePath${node.transitionOut.type !== "cut" ? " transition" : ""}`,
      "marker-end": "url(#videoBoardArrow)",
    });
    const labelText = `${TransitionLabels[node.transitionOut.type] || node.transitionOut.type}${node.transitionOut.duration ? ` ${node.transitionOut.duration.toFixed(2)}s` : ""}`;
    const labelWidth = Math.max(54, labelText.length * 12 + 14);
    AppendSvgElement(elements.edgeLayer, "rect", {
      x: labelX - labelWidth / 2,
      y: labelY - 11,
      width: labelWidth,
      height: 22,
      rx: 4,
      class: "edgeLabelBg",
    });
    const label = AppendSvgElement(elements.edgeLayer, "text", { x: labelX, y: labelY, class: "edgeLabel" });
    label.textContent = labelText;
    const order = AppendSvgElement(elements.edgeLayer, "text", { x: labelX, y: labelY + 25, class: "edgeOrder" });
    order.textContent = `${String(index + 1).padStart(2, "0")} → ${String(index + 2).padStart(2, "0")}`;
  }
}

function SetCanvasDimensions(mode = state.viewMode) {
  const size = canvasSizes[mode] || canvasSizes.sequence;
  elements.canvasSurface.style.width = `${size.width}px`;
  elements.canvasSurface.style.height = `${size.height}px`;
  elements.edgeLayer.setAttribute("width", String(size.width));
  elements.edgeLayer.setAttribute("height", String(size.height));
  elements.edgeLayer.setAttribute("viewBox", `0 0 ${size.width} ${size.height}`);
}

function AddLineageHeading(text, x) {
  const heading = document.createElement("span");
  heading.className = "lineageHeading";
  heading.style.left = `${x}px`;
  heading.style.top = "76px";
  heading.textContent = text;
  elements.groupLayer.append(heading);
}

function AddAssetNode({ type, assetId, title, detail, version = "", stale = false, x, y, onClick }) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `assetNode${state.assetFocus === type ? " isSelected" : ""}`;
  if (stale) button.classList.add("isStale");
  button.dataset.assetType = type;
  button.style.left = `${x}px`;
  button.style.top = `${y}px`;
  const id = document.createElement("small");
  id.textContent = assetId;
  const name = document.createElement("strong");
  name.textContent = title;
  const description = document.createElement("span");
  description.textContent = detail;
  button.append(id, name, description);
  if (version) {
    const tag = document.createElement("em");
    tag.textContent = version;
    button.append(tag);
  }
  button.addEventListener("click", onClick);
  elements.nodeLayer.append(button);
  return { x, y, width: 270, height: 132 };
}

function AddLineageEdge(from, to, label) {
  const startX = from.x + from.width;
  const startY = from.y + from.height / 2;
  const endX = to.x;
  const endY = to.y + to.height / 2;
  const bend = Math.max(52, (endX - startX) * 0.42);
  AppendSvgElement(elements.edgeLayer, "path", {
    d: `M ${startX} ${startY} C ${startX + bend} ${startY}, ${endX - bend} ${endY}, ${endX} ${endY}`,
    class: "edgePath transition",
    "marker-end": "url(#assetDirectorArrow)",
  });
  const text = AppendSvgElement(elements.edgeLayer, "text", {
    x: (startX + endX) / 2,
    y: (startY + endY) / 2 - 10,
    class: "edgeOrder",
  });
  text.textContent = label;
}

function RenderDependencyView() {
  elements.groupLayer.replaceChildren();
  elements.nodeLayer.replaceChildren();
  elements.edgeLayer.replaceChildren();
  const definitions = AppendSvgElement(elements.edgeLayer, "defs");
  const marker = AppendSvgElement(definitions, "marker", {
    id: "assetDirectorArrow", markerWidth: 8, markerHeight: 8, refX: 7, refY: 4, orient: "auto", markerUnits: "strokeWidth",
  });
  AppendSvgElement(marker, "path", { d: "M0,0 L8,4 L0,8 z", class: "edgeArrow" });

  const node = GetNode(state.selectedId);
  const group = VideoGroups.find((item) => item.id === node.groupId);
  const references = GetReferenceAssets(node);
  const narration = GetNarrationAsset(node.groupId);
  AddLineageHeading("剧情与镜头身份", 80);
  AddLineageHeading("参考输入", 430);
  AddLineageHeading("当前采用资产", 810);
  AddLineageHeading("下游消费者", 1190);

  const note = document.createElement("p");
  note.className = "lineageNote";
  note.style.left = "430px";
  note.style.top = "720px";
  note.textContent = "重新生成只会在对应资产节点下增加候选版本。图片被采用后，依赖它的视频会标记为待检查；视频或旁白只有在手动采用后才进入工作时间线。发布清单与工作版仍然分离。";
  elements.groupLayer.append(note);

  const shotNode = AddAssetNode({
    type: "shot",
    assetId: `SHOT.PRO.${node.id.slice(3).toUpperCase()}`,
    title: node.title,
    detail: group?.narration || "序章镜头",
    version: `${node.duration.toFixed(1)}s · ${TransitionLabels[node.transitionOut.type]}`,
    x: 80, y: 300,
    onClick: () => SetAssetFocus("shot"),
  });
  const referenceNodes = references.map((asset, index) => AddAssetNode({
    type: "image",
    assetId: asset.id,
    title: asset.fileName,
    detail: `被 ${asset.consumers.length} 个视频镜头引用${asset.consumers.some((id) => state.referenceReviewNodeIds.has(id)) ? " · 下游待检查" : ""}`,
    version: GetCurrentReferenceVersion(asset).id,
    stale: asset.consumers.some((id) => state.referenceReviewNodeIds.has(id)),
    x: 430, y: 190 + index * 180,
    onClick: () => {
      state.selectedReferenceFile = asset.fileName;
      SetAssetFocus("image");
    },
  }));
  const promptNode = AddAssetNode({
    type: "prompt",
    assetId: node.promptAssetId,
    title: "视频生成配方",
    detail: node.workingPrompt.length > 88 ? `${node.workingPrompt.slice(0, 88)}…` : node.workingPrompt,
    version: node.promptVersion,
    x: 430, y: 190 + references.length * 180,
    onClick: () => SetAssetFocus("prompt"),
  });
  const videoNode = AddAssetNode({
    type: "video",
    assetId: node.assetId,
    title: node.title,
    detail: `${node.model} · ${node.resolution} · ${node.candidates.length} 个候选`,
    version: `采用 ${node.currentVersionId}`,
    x: 810, y: 250,
    onClick: () => SetAssetFocus("video"),
  });
  const audioNode = AddAssetNode({
    type: "audio",
    assetId: narration.assetId,
    title: `${group.id} · 旁白`,
    detail: `${narration.engine} · ${narration.duration.toFixed(2)}s · ${narration.voice}`,
    version: narration.version,
    x: 810, y: 490,
    onClick: () => SetAssetFocus("audio"),
  });
  const consumerNode = AddAssetNode({
    type: "consumer",
    assetId: "CUT.PROLOGUE.WORKING",
    title: "序章工作时间线",
    detail: `${FormatTime(GetNodeStart(node.id))} — ${FormatTime(GetNodeStart(node.id) + node.duration)}；尚未写入发布清单`,
    version: state.workspaceDirty ? "工作版有修改" : "与发布清单一致",
    x: 1190, y: 340,
    onClick: () => SetViewMode("sequence"),
  });
  for (const referenceNode of referenceNodes) {
    AddLineageEdge(shotNode, referenceNode, "构图/身份");
    AddLineageEdge(referenceNode, videoNode, "生成输入");
  }
  AddLineageEdge(shotNode, promptNode, "动作要求");
  AddLineageEdge(promptNode, videoNode, "生成配方");
  AddLineageEdge(shotNode, audioNode, "旁白文本");
  AddLineageEdge(videoNode, consumerNode, "采用后引用");
  AddLineageEdge(audioNode, consumerNode, "声音轨");
}

function RenderVersionView() {
  elements.groupLayer.replaceChildren();
  elements.nodeLayer.replaceChildren();
  elements.edgeLayer.replaceChildren();
  const candidates = state.nodes.flatMap((node) => node.candidates.map((candidate) => ({ node, candidate })));
  const archivedCandidates = state.nodes.flatMap((node) => node.candidateArchive.map((candidate) => ({ node, candidate })));
  const versionItems = [
    ...candidates.map((item) => ({ ...item, archived: false })),
    ...archivedCandidates.map((item) => ({ ...item, archived: true })),
  ];
  const heading = document.createElement("p");
  heading.className = "lineageNote";
  heading.style.left = "70px";
  heading.style.top = "55px";
  heading.textContent = `${candidates.length} 个待处理候选，${archivedCandidates.length} 个已归档候选。这里的文件都不会被游戏或工作时间线引用，只有点“采用候选”后才会改变工作版。`;
  elements.groupLayer.append(heading);
  if (!versionItems.length) {
    const empty = document.createElement("div");
    empty.className = "candidateEmpty";
    empty.textContent = "当前没有待处理候选。选中一个视频资产，修改提示词后生成候选版；旧版本与当前采用版都不会被覆盖。";
    elements.nodeLayer.append(empty);
    return;
  }
  versionItems.forEach(({ node, candidate, archived }, index) => {
    const card = document.createElement("article");
    card.className = `candidateCanvasCard${archived ? " isArchived" : ""}`;
    card.style.left = `${70 + (index % 4) * 375}px`;
    card.style.top = `${155 + Math.floor(index / 4) * 260}px`;
    const video = document.createElement("video");
    video.src = candidate.url;
    video.muted = true;
    video.controls = true;
    video.playsInline = true;
    const title = document.createElement("strong");
    title.textContent = `${node.title} · ${candidate.id}${archived ? " · 已归档" : ""}`;
    const meta = document.createElement("small");
    meta.textContent = `${candidate.model || node.model} · ${candidate.createdAt}`;
    const adopt = document.createElement("button");
    adopt.type = "button";
    adopt.textContent = archived ? "恢复到候选" : "采用候选";
    adopt.addEventListener("click", () => archived
      ? RestoreArchivedCandidate(node.id, candidate.id)
      : AdoptCandidate(node.id, candidate.id));
    card.append(video, title, meta, adopt);
    elements.nodeLayer.append(card);
  });
}

function RenderTimeline() {
  elements.timelineTrack.replaceChildren();
  const orderedNodes = GetOrderedNodes();
  let elapsed = 0;
  for (let index = 0; index < orderedNodes.length; index += 1) {
    const node = orderedNodes[index];
    const button = document.createElement("button");
    button.type = "button";
    button.className = `timelineItem${node.id === state.selectedId ? " isSelected" : ""}`;
    button.style.width = `${Math.max(86, node.duration * 16)}px`;
    button.dataset.nodeId = node.id;
    const number = document.createElement("b");
    number.textContent = `${String(index + 1).padStart(2, "0")} · ${FormatTime(elapsed)}`;
    const title = document.createElement("span");
    title.textContent = node.title;
    const duration = document.createElement("i");
    duration.textContent = `${node.duration.toFixed(1)}s`;
    button.append(number, title, duration);
    button.addEventListener("click", () => SelectNode(node.id, true));
    elements.timelineTrack.append(button);
    elapsed += node.duration;
    if (index < orderedNodes.length - 1) {
      const transition = document.createElement("span");
      transition.className = "timelineTransition";
      transition.textContent = TransitionLabels[node.transitionOut.type] || node.transitionOut.type;
      elements.timelineTrack.append(transition);
    }
  }
  elements.nodeCount.textContent = String(orderedNodes.length);
  elements.totalDuration.textContent = FormatTime(elapsed);
}

function RenderAll() {
  SetCanvasDimensions();
  if (state.viewMode === "dependency") {
    RenderDependencyView();
  } else if (state.viewMode === "versions") {
    RenderVersionView();
  } else {
    RenderGroups();
    RenderNodes();
    RenderEdges();
  }
  RenderTimeline();
  RenderProjectTree();
  UpdateDirectorStatus();
  ApplyCanvasTransform();
}

function SetViewMode(mode) {
  if (!canvasSizes[mode]) return;
  state.viewMode = mode;
  for (const [button, value] of [
    [elements.buttonSequenceMode, "sequence"],
    [elements.buttonDependencyMode, "dependency"],
    [elements.buttonVersionMode, "versions"],
  ]) {
    const active = value === mode;
    button.classList.toggle("isActive", active);
    button.setAttribute("aria-pressed", String(active));
  }
  elements.canvasModeLabel.textContent = mode === "sequence"
    ? "序章全镜头 · 播放顺序"
    : mode === "dependency" ? "当前镜头 · 资产依赖关系" : "全部镜头 · 待采用候选";
  elements.toolHint.textContent = mode === "sequence"
    ? "拖空白处平移 · 滚轮缩放 · 拖镜头排版"
    : "拖空白处平移 · 滚轮缩放 · 点资产查看版本";
  RenderAll();
  FitCanvas();
}

function SelectNode(nodeId, centerNode = false) {
  if (!GetNode(nodeId)) return;
  if (state.promptDirty && state.selectedId !== nodeId) SavePrompt(false);
  state.selectedId = nodeId;
  const selectedNode = GetNode(nodeId);
  if (!selectedNode.referenceFiles.includes(state.selectedReferenceFile)) state.selectedReferenceFile = selectedNode.referenceFiles[0];
  state.promptDirty = false;
  RenderAll();
  UpdateInspector();
  if (centerNode && state.viewMode === "sequence") CenterOnNode(nodeId);
}

function ConfigureInspectorSections(focus) {
  const showVideo = focus === "video";
  const showPrompt = focus === "prompt";
  elements.videoGenerationFields.hidden = !showVideo;
  elements.assetCapabilityNote.hidden = !showVideo;
  elements.promptSection.hidden = !showVideo && !showPrompt;
  elements.sourcePromptSection.hidden = !showVideo && !showPrompt;
  elements.referenceSection.hidden = !showVideo;
  elements.transitionSection.hidden = !showVideo;
  elements.generationSection.hidden = !showVideo;
  elements.assetOverviewSection.hidden = showVideo;
}

function SetAssetFocus(type) {
  if (!AssetTypeLabels[type]) return;
  if (state.promptDirty && (state.assetFocus === "video" || state.assetFocus === "prompt")) SavePrompt(false);
  state.assetFocus = type;
  for (const button of [elements.buttonFocusShot, elements.buttonFocusImage, elements.buttonFocusPrompt, elements.buttonFocusVideo, elements.buttonFocusAudio]) {
    button.classList.toggle("isActive", button.dataset.assetFocus === type);
  }
  if (state.viewMode === "dependency") RenderAll();
  UpdateInspector();
}

function SetPreviewMode(mode) {
  elements.selectedVideo.hidden = mode !== "video";
  elements.selectedImage.hidden = mode !== "image";
  elements.selectedAudioPanel.hidden = mode !== "audio";
  elements.selectedPromptPanel.hidden = mode !== "prompt";
}

function RenderVersionRail(node) {
  elements.versionRail.replaceChildren();
  if (state.assetFocus === "image") {
    const asset = ReferenceAssets.find((item) => item.fileName === state.selectedReferenceFile) || GetReferenceAssets(node)[0];
    const currentVersion = GetCurrentReferenceVersion(asset);
    for (const version of asset.versions) {
      const card = document.createElement("article");
      card.className = `versionCard${version.id === currentVersion.id ? " isCurrent" : ""}`;
      const title = document.createElement("strong");
      title.textContent = `${version.id} · ${version.file}`;
      const meta = document.createElement("small");
      meta.textContent = version.id === currentVersion.id ? "当前参考图" : "历史图片版本 · 可回退";
      card.append(title, meta);
      if (version.id !== currentVersion.id) {
        const actions = document.createElement("div");
        actions.className = "versionActions";
        const adopt = document.createElement("button");
        adopt.type = "button";
        adopt.textContent = "采用此版本";
        adopt.addEventListener("click", () => AdoptReferenceVersion(asset.id, version.id));
        actions.append(adopt);
        card.append(actions);
      }
      elements.versionRail.append(card);
    }
    const reviewCount = asset.consumers.filter((id) => state.referenceReviewNodeIds.has(id)).length;
    elements.versionImpact.textContent = reviewCount
      ? `这张图的 ${reviewCount} 个下游视频已标记为待检查；不会自动重生成，也不会覆盖工作时间线。`
      : "采用新的参考图版本后，下游视频会进入待检查队列，不会自动重生成或覆盖。";
    elements.versionImpact.className = `versionImpact${reviewCount ? " isWarning" : ""}`;
    return;
  }
  if (state.assetFocus === "prompt") {
    for (const version of node.promptVersions) {
      const card = document.createElement("article");
      card.className = `versionCard${version.id === node.promptVersion ? " isCurrent" : ""}`;
      const title = document.createElement("strong");
      title.textContent = `${version.id} · ${node.promptAssetId}`;
      const meta = document.createElement("small");
      meta.textContent = version.id === node.promptVersion ? "当前工作配方" : "历史提示词版本 · 可回退";
      card.append(title, meta);
      if (version.id !== node.promptVersion) {
        const actions = document.createElement("div");
        actions.className = "versionActions";
        const adopt = document.createElement("button");
        adopt.type = "button";
        adopt.textContent = "回退采用";
        adopt.addEventListener("click", () => AdoptPromptVersion(node.id, version.id));
        actions.append(adopt);
        card.append(actions);
      }
      elements.versionRail.append(card);
    }
    elements.versionImpact.textContent = "提示词版本独立于视频版本；修改配方不会改当前成片，只有新生成的视频候选被手动采用后，工作时间线才会变化。";
    elements.versionImpact.className = "versionImpact";
    return;
  }
  if (state.assetFocus !== "video") {
    const card = document.createElement("article");
    card.className = "versionCard isCurrent";
    const title = document.createElement("strong");
    title.textContent = elements.assetCurrentVersion.textContent;
    const meta = document.createElement("small");
    meta.textContent = "当前采用 · 生成配方与文件身份保持独立";
    card.append(title, meta);
    elements.versionRail.append(card);
    elements.versionImpact.textContent = state.assetFocus === "image"
      ? "采用新的参考图后，依赖它的视频会进入待检查队列，不会自动重生成或覆盖。"
      : state.assetFocus === "audio"
        ? "旁白版本与视频版本分开管理；采用新旁白只改变工作版声音轨。"
        : "镜头身份固定引用图片、视频和旁白；发布清单记录当时各自采用的版本。";
    elements.versionImpact.className = "versionImpact";
    return;
  }

  for (const version of node.versions) {
    const card = document.createElement("article");
    card.className = `versionCard${version.id === node.currentVersionId ? " isCurrent" : ""}`;
    const title = document.createElement("strong");
    title.textContent = `${version.id} · ${version.file || version.url}`;
    const meta = document.createElement("small");
    meta.textContent = version.id === node.currentVersionId ? "当前采用" : "历史版本 · 可回退";
    card.append(title, meta);
    if (version.id !== node.currentVersionId) {
      const actions = document.createElement("div");
      actions.className = "versionActions";
      const adopt = document.createElement("button");
      adopt.type = "button";
      adopt.textContent = "回退采用";
      adopt.addEventListener("click", () => AdoptExistingVersion(node.id, version.id));
      actions.append(adopt);
      card.append(actions);
    }
    elements.versionRail.append(card);
  }
  for (const candidate of node.candidates) {
    const card = document.createElement("article");
    card.className = "versionCard isCandidate";
    const title = document.createElement("strong");
    title.textContent = `${candidate.id} · 候选`;
    const meta = document.createElement("small");
    meta.textContent = `${candidate.model || node.model} · 未影响工作时间线`;
    const actions = document.createElement("div");
    actions.className = "versionActions";
    const adopt = document.createElement("button");
    adopt.type = "button";
    adopt.textContent = "采用候选";
    adopt.addEventListener("click", () => AdoptCandidate(node.id, candidate.id));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "归档";
    remove.addEventListener("click", () => RemoveCandidate(node.id, candidate.id));
    actions.append(adopt, remove);
    card.append(title, meta, actions);
    elements.versionRail.append(card);
  }
  for (const archived of [...node.candidateArchive].reverse()) {
    const card = document.createElement("article");
    card.className = "versionCard isArchived";
    const title = document.createElement("strong");
    title.textContent = `${archived.id} · 已归档候选`;
    const meta = document.createElement("small");
    meta.textContent = `${archived.model || node.model} · 未采用，记录保留`;
    const actions = document.createElement("div");
    actions.className = "versionActions";
    const restore = document.createElement("button");
    restore.type = "button";
    restore.textContent = "恢复到候选";
    restore.addEventListener("click", () => RestoreArchivedCandidate(node.id, archived.id));
    actions.append(restore);
    card.append(title, meta, actions);
    elements.versionRail.append(card);
  }
  elements.versionImpact.textContent = node.candidates.length
    ? `${node.candidates.length} 个候选仍未被时间线引用。采用后，旧版继续保留，可随时回退。`
    : "重新生成只会增加候选版本；必须手动采用后，工作时间线才会引用它。";
  elements.versionImpact.className = `versionImpact${node.candidates.length ? " isWarning" : ""}`;
}

function UpdateInspector() {
  const node = GetNode(state.selectedId);
  const orderIndex = state.order.indexOf(node.id);
  const start = GetNodeStart(node.id);
  const end = start + node.duration;
  const sourceTask = SourceTasks[node.sourceTaskId];
  const currentVersion = GetCurrentVersion(node);
  const group = VideoGroups.find((item) => item.id === node.groupId);
  const narration = GetNarrationAsset(node.groupId);
  const reference = ReferenceAssets.find((asset) => asset.fileName === state.selectedReferenceFile) || GetReferenceAssets(node)[0];
  const referenceVersion = GetCurrentReferenceVersion(reference);

  elements.selectedOrder.textContent = `镜头 ${String(orderIndex + 1).padStart(2, "0")} / ${state.order.length} · ${AssetTypeLabels[state.assetFocus]}`;
  elements.inspectorTitle.textContent = node.title;
  elements.previewTimecode.textContent = `${FormatTime(start)} — ${FormatTime(end)}`;
  for (const button of [elements.buttonFocusShot, elements.buttonFocusImage, elements.buttonFocusPrompt, elements.buttonFocusVideo, elements.buttonFocusAudio]) {
    button.classList.toggle("isActive", button.dataset.assetFocus === state.assetFocus);
  }
  ConfigureInspectorSections(state.assetFocus);

  if (state.assetFocus === "video") {
    SetPreviewMode("video");
    elements.nodeStatus.textContent = node.candidates.length ? `${node.candidates.length} 个候选待处理` : `采用 ${node.currentVersionId}`;
    elements.nodeStatus.className = `statusPill${node.currentVersionId !== "v1" ? " generated" : ""}`;
    const previewUrl = GetCurrentVideoUrl(node);
    if (elements.selectedVideo.dataset.src !== previewUrl) {
      elements.selectedVideo.dataset.src = previewUrl;
      elements.selectedVideo.src = previewUrl;
      elements.selectedVideo.load();
    }
    elements.assetStableId.textContent = node.assetId;
    elements.assetCurrentVersion.textContent = node.currentVersionId;
    elements.assetConsumers.textContent = "序章工作时间线 · 发布清单";
    elements.fieldDuration.value = String(node.duration);
    elements.fieldGenerationDuration.value = String(node.generationDuration);
    elements.fieldModel.value = node.model;
    elements.fieldResolution.value = node.resolution;
    elements.fieldWorkingPrompt.value = node.workingPrompt;
    elements.promptDirtyState.textContent = "已保存";
    elements.promptDirtyState.className = "";
    elements.sourceTaskId.textContent = node.sourceTaskId;
    elements.sourceTaskKind.textContent = sourceTask?.kind || node.command;
    elements.sourcePrompt.textContent = sourceTask?.prompt || "未找到原始任务提示词";
    elements.referenceStrip.replaceChildren();
    for (const fileName of node.referenceFiles) {
      const figure = document.createElement("figure");
      const image = document.createElement("img");
      image.src = `./Reference/${fileName}`;
      image.alt = `${node.title} 参考帧`;
      const caption = document.createElement("figcaption");
      caption.textContent = fileName;
      figure.append(image, caption);
      figure.addEventListener("click", () => {
        state.selectedReferenceFile = fileName;
        SetAssetFocus("image");
      });
      elements.referenceStrip.append(figure);
    }
    elements.currentClip.textContent = currentVersion.url;
    elements.plannedOutput.textContent = node.outputFile;
    elements.fieldTransitionType.value = node.transitionOut.type;
    elements.fieldTransitionDuration.value = String(node.transitionOut.duration);
    elements.fieldTransitionDuration.disabled = node.transitionOut.type === "cut" || node.transitionOut.type === "match-cut";
    elements.buttonMoveEarlier.disabled = orderIndex === 0;
    elements.buttonMoveLater.disabled = orderIndex === state.order.length - 1;
    elements.buttonRegenerate.disabled = !state.bridgeOnline;
    elements.buttonRegenerate.textContent = "生成视频候选版";
    RenderPromptHistory(node);
  } else if (state.assetFocus === "prompt") {
    SetPreviewMode("prompt");
    elements.nodeStatus.className = "statusPill";
    elements.nodeStatus.textContent = "工作配方";
    elements.assetStableId.textContent = node.promptAssetId;
    elements.assetCurrentVersion.textContent = node.promptVersion;
    elements.assetConsumers.textContent = node.assetId;
    elements.selectedPromptTitle.textContent = `${node.title} · 视频生成配方`;
    elements.selectedPromptIdentity.textContent = `${node.promptAssetId} / ${node.promptVersion}`;
    elements.selectedPromptText.textContent = node.workingPrompt;
    elements.assetOverviewTitle.textContent = "提示词版本与生成边界";
    elements.assetOverviewText.textContent = "这是独立的生成配方资产。编辑并保存只会产生新的提示词版本，不会覆盖当前视频；付费生成仍需在视频资产页单独确认。";
    elements.assetRecipeEngine.textContent = `${node.command} · ${node.model}`;
    elements.assetRecipeId.textContent = node.sourceTaskId;
    elements.assetRecipeStatus.textContent = `${node.resolution} · 当前 ${node.promptVersion} · 固定机位锁定`;
    elements.fieldWorkingPrompt.value = node.workingPrompt;
    elements.promptDirtyState.textContent = "已保存";
    elements.promptDirtyState.className = "";
    elements.sourceTaskId.textContent = node.sourceTaskId;
    elements.sourceTaskKind.textContent = `${sourceTask?.kind || node.command} · 历史只读`;
    elements.sourcePrompt.textContent = sourceTask?.prompt || "未找到原始任务提示词";
    RenderPromptHistory(node);
  } else {
    elements.nodeStatus.className = "statusPill";
    if (state.assetFocus === "image") {
      SetPreviewMode("image");
      elements.selectedImage.src = referenceVersion.file;
      elements.selectedImage.alt = reference.fileName;
      elements.nodeStatus.textContent = reference.consumers.some((id) => state.referenceReviewNodeIds.has(id)) ? "下游待检查" : "参考输入";
      elements.assetStableId.textContent = reference.id;
      elements.assetCurrentVersion.textContent = referenceVersion.id;
      elements.assetConsumers.textContent = `${reference.consumers.length} 个视频镜头`;
      elements.assetOverviewTitle.textContent = "参考图片生成谱系";
      elements.assetOverviewText.textContent = `这张参考图被 ${reference.consumers.join("、")} 使用。重新生成图片必须先成为候选；采用后，下游视频只会标记为待检查。`;
      elements.assetRecipeEngine.textContent = reference.status === "generated-corrected" ? "Dreamina image2image" : "历史参考图（待补生成配方）";
      elements.assetRecipeId.textContent = reference.status === "generated-corrected" ? "5acd521b-e9c9-46a4-bcbb-5ca1b8c4f40c" : "未登记";
      elements.assetRecipeStatus.textContent = reference.status === "generated-corrected" ? `已保留原始任务 · 采用 ${referenceVersion.id}` : `文件可用，来源记录待补 · 采用 ${referenceVersion.id}`;
    } else if (state.assetFocus === "audio") {
      SetPreviewMode("audio");
      if (elements.selectedAudio.dataset.src !== narration.file) {
        elements.selectedAudio.dataset.src = narration.file;
        elements.selectedAudio.src = narration.file;
        elements.selectedAudio.load();
      }
      elements.selectedAudioTitle.textContent = `${group.id} · ${group.title} · 旁白`;
      elements.selectedAudioText.textContent = group.narration;
      elements.nodeStatus.textContent = "旁白采用版";
      elements.assetStableId.textContent = narration.assetId;
      elements.assetCurrentVersion.textContent = narration.version;
      elements.assetConsumers.textContent = "序章声音轨 · 字幕时长";
      elements.assetOverviewTitle.textContent = "AI 旁白生成谱系";
      elements.assetOverviewText.textContent = group.narration;
      elements.assetRecipeEngine.textContent = `${narration.engine} · ${narration.voice}`;
      elements.assetRecipeId.textContent = `${narration.release} / ${narration.id}`;
      elements.assetRecipeStatus.textContent = `${narration.sampleRate} Hz · ${narration.bitrateKbps} kbps · 声音身份已锁定`;
    } else {
      SetPreviewMode("video");
      const previewUrl = GetCurrentVideoUrl(node);
      if (elements.selectedVideo.dataset.src !== previewUrl) {
        elements.selectedVideo.dataset.src = previewUrl;
        elements.selectedVideo.src = previewUrl;
        elements.selectedVideo.load();
      }
      elements.nodeStatus.textContent = "镜头身份";
      elements.assetStableId.textContent = `SHOT.PRO.${node.id.slice(3).toUpperCase()}`;
      elements.assetCurrentVersion.textContent = "编排 v1";
      elements.assetConsumers.textContent = `${node.referenceFiles.length} 图 · 1 视频 · 1 旁白`;
      elements.assetOverviewTitle.textContent = "镜头身份与依赖";
      elements.assetOverviewText.textContent = `${group.narration} 本镜头当前引用 ${node.referenceFiles.length} 张参考图、视频 ${node.currentVersionId} 与场 ${group.id} 的旁白；稳定镜头 ID 不随文件版本变化。`;
      elements.assetRecipeEngine.textContent = "剧情资产导演台";
      elements.assetRecipeId.textContent = node.sourceTaskId;
      elements.assetRecipeStatus.textContent = `${node.duration.toFixed(1)} 秒 · ${TransitionLabels[node.transitionOut.type]}`;
    }
  }
  RenderVersionRail(node);
  UpdateDirectorStatus();
}

function AdoptCandidate(nodeId, candidateId) {
  const node = GetNode(nodeId);
  const candidateIndex = node.candidates.findIndex((candidate) => candidate.id === candidateId);
  if (candidateIndex < 0) return;
  const [candidate] = node.candidates.splice(candidateIndex, 1);
  node.versions.push({
    ...candidate,
    id: candidate.id,
    url: candidate.url,
    file: candidate.outputFile || candidate.url,
    createdAt: candidate.createdAt,
    source: `Dreamina ${candidate.submitId || "candidate"}`,
    status: "adopted",
  });
  node.currentVersionId = candidate.id;
  MarkWorkspaceDirty();
  SaveLocalState();
  state.selectedId = nodeId;
  state.assetFocus = "video";
  RenderAll();
  UpdateInspector();
  ShowToast(`已采用 ${candidate.id}；旧版本仍保留，发布清单尚未改变。`, false);
}

function AdoptExistingVersion(nodeId, versionId) {
  const node = GetNode(nodeId);
  if (!node.versions.some((version) => version.id === versionId)) return;
  node.currentVersionId = versionId;
  MarkWorkspaceDirty();
  SaveLocalState();
  RenderAll();
  UpdateInspector();
  ShowToast(`工作版已回退采用 ${versionId}；没有删除任何版本。`, false);
}

function AdoptPromptVersion(nodeId, versionId) {
  const node = GetNode(nodeId);
  const version = node.promptVersions.find((item) => item.id === versionId);
  if (!version) return;
  node.promptVersion = version.id;
  node.workingPrompt = version.prompt;
  state.promptDirty = false;
  MarkWorkspaceDirty();
  SaveLocalState();
  RenderAll();
  UpdateInspector();
  ShowToast(`提示词已回退采用 ${versionId}；现有视频与发布清单均未改变。`, false);
}

function AdoptReferenceVersion(assetId, versionId) {
  const asset = ReferenceAssets.find((item) => item.id === assetId);
  if (!asset?.versions.some((version) => version.id === versionId)) return;
  state.referenceVersionIds[asset.id] = versionId;
  for (const nodeId of asset.consumers) state.referenceReviewNodeIds.add(nodeId);
  MarkWorkspaceDirty();
  SaveLocalState();
  RenderAll();
  UpdateInspector();
  ShowToast(`已采用图片 ${asset.id} / ${versionId}；${asset.consumers.length} 个下游视频已标记待检查，当前成片未变。`, false);
}

function RemoveCandidate(nodeId, candidateId) {
  const node = GetNode(nodeId);
  const candidate = node.candidates.find((item) => item.id === candidateId);
  if (!candidate) return;
  node.candidates = node.candidates.filter((item) => item.id !== candidateId);
  node.candidateArchive.push({ ...candidate, status: "rejected", rejectedAt: new Date().toISOString() });
  SaveLocalState();
  RenderAll();
  UpdateInspector();
  ShowToast("候选已归档为未采用版本；当前采用版未改变，记录仍会随工程导出。", false);
}

function RestoreArchivedCandidate(nodeId, candidateId) {
  const node = GetNode(nodeId);
  const archivedIndex = node.candidateArchive.findIndex((item) => item.id === candidateId);
  if (archivedIndex < 0) return;
  const [archived] = node.candidateArchive.splice(archivedIndex, 1);
  node.candidates.push({ ...archived, status: "candidate", restoredAt: new Date().toISOString() });
  SaveLocalState();
  RenderAll();
  UpdateInspector();
  ShowToast(`${candidateId} 已恢复到待处理候选；当前采用版没有改变。`, false);
}

function NextCandidateVersionId(node) {
  const ids = [...node.versions, ...node.candidates, ...node.candidateArchive]
    .map((version) => Number(String(version.id).replace(/^v/, "")))
    .filter(Number.isFinite);
  return `v${Math.max(0, ...ids) + 1}`;
}

function NextPromptVersionId(node) {
  const ids = node.promptVersions
    .map((version) => Number(String(version.id).replace(/^v/, "")))
    .filter(Number.isFinite);
  return `v${Math.max(0, ...ids) + 1}`;
}

function RenderPromptHistory(node) {
  elements.promptHistory.replaceChildren();
  if (!node.promptVersions.length) {
    const item = document.createElement("li");
    item.textContent = "还没有修改记录。原始任务提示词始终单独保留，不会被覆盖。";
    elements.promptHistory.append(item);
    return;
  }
  for (const entry of [...node.promptVersions].reverse()) {
    const item = document.createElement("li");
    const time = document.createElement("time");
    const timestamp = entry.at || entry.createdAt;
    time.dateTime = timestamp === "source" ? "" : timestamp;
    time.textContent = timestamp === "source"
      ? `${entry.id} · 初始工作配方`
      : `${entry.id} · ${new Date(timestamp).toLocaleString("zh-CN", { hour12: false })}`;
    const content = document.createElement("span");
    content.textContent = entry.prompt.length > 150 ? `${entry.prompt.slice(0, 150)}…` : entry.prompt;
    item.append(time, content);
    elements.promptHistory.append(item);
  }
}

function SavePrompt(showToast = true) {
  const node = GetNode(state.selectedId);
  const nextPrompt = elements.fieldWorkingPrompt.value.trim();
  if (!nextPrompt) {
    ShowToast("提示词不能为空。", true);
    return false;
  }
  const changed = nextPrompt !== node.workingPrompt;
  if (changed) {
    node.promptHistory.push({ version: node.promptVersion, at: new Date().toISOString(), prompt: node.workingPrompt });
    node.workingPrompt = nextPrompt;
    node.promptVersion = NextPromptVersionId(node);
    node.promptVersions.push({ id: node.promptVersion, at: new Date().toISOString(), source: "manual-edit", prompt: nextPrompt });
    MarkWorkspaceDirty();
  }
  state.promptDirty = false;
  elements.promptDirtyState.textContent = "已保存";
  elements.promptDirtyState.className = "";
  SaveLocalState();
  if (changed) {
    RenderAll();
    UpdateInspector();
  } else {
    RenderPromptHistory(node);
  }
  if (showToast) ShowToast("当前节点提示词已保存。", false);
  return true;
}

function RestorePrompt() {
  const node = GetNode(state.selectedId);
  const defaultNode = VideoNodes.find((item) => item.id === node.id);
  elements.fieldWorkingPrompt.value = `${StyleLockPrompt}\n\n${defaultNode.actionPrompt}`;
  state.promptDirty = true;
  elements.promptDirtyState.textContent = "未保存";
  elements.promptDirtyState.className = "isDirty";
  SavePrompt(true);
}

function UpdateNodeFields() {
  if (state.promptDirty) SavePrompt(false);
  const node = GetNode(state.selectedId);
  const duration = Number(elements.fieldDuration.value);
  const generationDuration = Number(elements.fieldGenerationDuration.value);
  if (Number.isFinite(duration)) node.duration = Math.min(15, Math.max(0.5, duration));
  const minimumGenerationDuration = Math.max(4, Math.ceil(node.duration));
  if (Number.isFinite(generationDuration)) {
    node.generationDuration = Math.min(15, Math.max(minimumGenerationDuration, Math.round(generationDuration)));
  } else {
    node.generationDuration = Math.max(node.generationDuration, minimumGenerationDuration);
  }
  node.model = elements.fieldModel.value;
  node.resolution = elements.fieldResolution.value;
  node.transitionOut.type = elements.fieldTransitionType.value;
  const transitionDuration = Number(elements.fieldTransitionDuration.value);
  node.transitionOut.duration = node.transitionOut.type === "cut" || node.transitionOut.type === "match-cut"
    ? 0
    : Math.min(2, node.duration, Math.max(0.05, Number.isFinite(transitionDuration) ? transitionDuration : 0.35));
  MarkWorkspaceDirty();
  elements.fieldTransitionDuration.value = String(node.transitionOut.duration);
  elements.fieldTransitionDuration.disabled = node.transitionOut.duration === 0;
  SaveLocalState();
  RenderAll();
  UpdateInspector();
  if (Number.isFinite(generationDuration) && generationDuration < minimumGenerationDuration) {
    ShowToast(`生成时长已自动抬到 ${minimumGenerationDuration} 秒，不能短于 ${node.duration} 秒时间线片段。`, false);
  }
}

function MoveSelectedNode(delta) {
  const index = state.order.indexOf(state.selectedId);
  const target = index + delta;
  if (target < 0 || target >= state.order.length) return;
  [state.order[index], state.order[target]] = [state.order[target], state.order[index]];
  MarkWorkspaceDirty();
  SaveLocalState();
  RenderAll();
  UpdateInspector();
}

function CenterOnNode(nodeId) {
  const position = state.positions[nodeId];
  const viewport = elements.canvasViewport.getBoundingClientRect();
  state.panX = viewport.width / 2 - (position.x + nodeWidth / 2) * state.zoom;
  state.panY = viewport.height / 2 - (position.y + nodeHeight / 2) * state.zoom;
  ApplyCanvasTransform();
}

function FitCanvas() {
  const viewport = elements.canvasViewport.getBoundingClientRect();
  const size = canvasSizes[state.viewMode] || canvasSizes.sequence;
  state.zoom = Math.min(1, Math.max(0.1, Math.min((viewport.width - 34) / size.width, (viewport.height - 34) / size.height)));
  state.panX = (viewport.width - size.width * state.zoom) / 2;
  state.panY = (viewport.height - size.height * state.zoom) / 2;
  ApplyCanvasTransform();
}

function ZoomCanvas(factor, clientX = null, clientY = null) {
  const viewport = elements.canvasViewport.getBoundingClientRect();
  const anchorX = clientX === null ? viewport.width / 2 : clientX - viewport.left;
  const anchorY = clientY === null ? viewport.height / 2 : clientY - viewport.top;
  const worldX = (anchorX - state.panX) / state.zoom;
  const worldY = (anchorY - state.panY) / state.zoom;
  state.zoom = Math.min(1.35, Math.max(0.1, state.zoom * factor));
  state.panX = anchorX - worldX * state.zoom;
  state.panY = anchorY - worldY * state.zoom;
  ApplyCanvasTransform();
}

function BeginNodeDrag(event) {
  if (event.button !== 0 || state.viewMode !== "sequence") return;
  const button = event.currentTarget;
  const nodeId = button.dataset.nodeId;
  const startClientX = event.clientX;
  const startClientY = event.clientY;
  const startPosition = { ...state.positions[nodeId] };
  let moved = false;
  button.setPointerCapture(event.pointerId);
  const MoveNode = (moveEvent) => {
    const deltaX = (moveEvent.clientX - startClientX) / state.zoom;
    const deltaY = (moveEvent.clientY - startClientY) / state.zoom;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 4) moved = true;
    state.positions[nodeId] = {
      x: Math.min(surfaceWidth - nodeWidth - 20, Math.max(20, startPosition.x + deltaX)),
      y: Math.min(surfaceHeight - nodeHeight - 20, Math.max(120, startPosition.y + deltaY)),
    };
    button.style.left = `${state.positions[nodeId].x}px`;
    button.style.top = `${state.positions[nodeId].y}px`;
    RenderEdges();
  };
  const EndNodeDrag = () => {
    button.removeEventListener("pointermove", MoveNode);
    button.removeEventListener("pointerup", EndNodeDrag);
    button.removeEventListener("pointercancel", EndNodeDrag);
    SaveLocalState();
    SelectNode(nodeId, false);
    if (!moved) button.focus();
  };
  button.addEventListener("pointermove", MoveNode);
  button.addEventListener("pointerup", EndNodeDrag);
  button.addEventListener("pointercancel", EndNodeDrag);
}

function BeginCanvasPan(event) {
  if (event.button !== 0 || event.target.closest(".videoNode, .assetNode, .candidateCanvasCard button, video")) return;
  const startClientX = event.clientX;
  const startClientY = event.clientY;
  const startPanX = state.panX;
  const startPanY = state.panY;
  elements.canvasViewport.classList.add("isPanning");
  elements.canvasViewport.setPointerCapture(event.pointerId);
  const MoveCanvas = (moveEvent) => {
    state.panX = startPanX + moveEvent.clientX - startClientX;
    state.panY = startPanY + moveEvent.clientY - startClientY;
    ApplyCanvasTransform();
  };
  const EndCanvasPan = () => {
    elements.canvasViewport.classList.remove("isPanning");
    elements.canvasViewport.removeEventListener("pointermove", MoveCanvas);
    elements.canvasViewport.removeEventListener("pointerup", EndCanvasPan);
    elements.canvasViewport.removeEventListener("pointercancel", EndCanvasPan);
  };
  elements.canvasViewport.addEventListener("pointermove", MoveCanvas);
  elements.canvasViewport.addEventListener("pointerup", EndCanvasPan);
  elements.canvasViewport.addEventListener("pointercancel", EndCanvasPan);
}

function BuildCliCommand(node) {
  const prompt = node.workingPrompt.replaceAll("'", "''");
  const common = `--prompt='${prompt}' --duration=${node.generationDuration} --video_resolution=${node.resolution} --model_version=${node.model} --poll=0`;
  if (node.command === "frames2video") {
    return `dreamina frames2video --first='./Reference/${node.referenceFiles[0]}' --last='./Reference/${node.referenceFiles[1]}' ${common}`;
  }
  if (node.command === "multiframe2video") {
    const images = node.referenceFiles.map((fileName) => `./Reference/${fileName}`).join(",");
    return `dreamina multiframe2video --images='${images}' --prompt='${prompt}' --duration=${node.generationDuration} --poll=0`;
  }
  return `dreamina image2video --image='./Reference/${node.referenceFiles[0]}' ${common}`;
}

async function CopyCliCommand() {
  if (!SavePrompt(false)) return;
  const command = BuildCliCommand(GetNode(state.selectedId));
  try {
    await navigator.clipboard.writeText(command);
    ShowToast("当前节点的完整 Dreamina CLI 命令已复制。", false);
  } catch {
    window.prompt("复制这条命令：", command);
  }
}

function DownloadJson(payload, fileName) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function BuildReleaseManifest(releaseId, createdAt) {
  let elapsed = 0;
  return {
    schema: "tunnel-light-asset-release/v2",
    id: releaseId,
    createdAt,
    projectId: BoardMeta.projectId,
    chapterId: BoardMeta.chapterId,
    targetDuration: GetTotalDuration(),
    resolution: BoardMeta.resolution,
    frameRate: BoardMeta.frameRate,
    mediaContract: {
      codec: "h264",
      colorRange: "tv",
      colorSpace: "bt709",
      colorTransfer: "bt709",
      colorPrimaries: "bt709",
      displayTransform: "sRGB / no tone mapping / no CSS filter",
    },
    qualityGate: {
      readyForDeployment: state.referenceReviewNodeIds.size === 0
        && GetOrderedNodes().every((node) => GetCurrentVersion(node)?.media?.persisted === true),
      pendingReferenceReviewShotIds: [...state.referenceReviewNodeIds]
        .map((id) => GetNode(id)?.shotId)
        .filter(Boolean),
      unpersistedVideoAssetIds: GetOrderedNodes()
        .filter((node) => GetCurrentVersion(node)?.media?.persisted !== true)
        .map((node) => node.assetId),
    },
    shots: GetOrderedNodes().map((node, index) => {
      const currentVersion = GetCurrentVersion(node);
      const narration = GetNarrationAsset(node.groupId);
      const promptVersion = node.promptVersions.find((version) => version.id === node.promptVersion)
        || node.promptVersions.at(-1);
      const referenceAssets = GetReferenceAssets(node);
      const shot = {
        chapterId: node.chapterId,
        sceneId: node.sceneId,
        shotId: node.shotId,
        order: index + 1,
        timelineStart: elapsed,
        duration: node.duration,
        legacyReviewSource: { file: BoardMeta.legacyReviewVideo, start: elapsed, duration: node.duration },
        videoAssetId: node.assetId,
        videoVersionId: currentVersion.id,
        videoUrl: currentVersion.url,
        videoMedia: currentVersion.media || { local: false, persisted: false, verified: false },
        videoProvenance: {
          sourceTaskId: currentVersion.sourceTaskId || node.sourceTaskId,
          sourceTaskKind: SourceTasks[currentVersion.sourceTaskId || node.sourceTaskId]?.kind || currentVersion.command || node.command,
          submitId: currentVersion.source?.startsWith("Dreamina ") ? currentVersion.source.slice(9) : null,
          model: currentVersion.model || node.model,
          resolution: currentVersion.resolution || node.resolution,
          generatedDuration: currentVersion.duration || node.generationDuration,
          command: currentVersion.command || node.command,
          prompt: currentVersion.prompt || promptVersion?.prompt || node.workingPrompt,
          referenceFiles: [...(currentVersion.referenceFiles || node.referenceFiles)],
        },
        promptAssetId: node.promptAssetId,
        promptVersionId: currentVersion.promptVersion || promptVersion?.id || node.promptVersion,
        referenceAssets: referenceAssets.map((asset) => {
          const version = GetCurrentReferenceVersion(asset);
          return { assetId: asset.id, versionId: version.id, file: version.file };
        }),
        narrationAssetId: narration.assetId,
        narrationVersionId: narration.currentVersionId || narration.version,
        transitionOut: { ...node.transitionOut },
      };
      elapsed += node.duration;
      return Object.freeze(shot);
    }),
  };
}

function PublishWorkingManifest() {
  if (state.promptDirty) SavePrompt(false);
  const createdAt = new Date().toISOString();
  const releaseId = `REL.PROLOGUE.${createdAt.replace(/[-:.TZ]/g, "").slice(0, 14)}`;
  const manifest = BuildReleaseManifest(releaseId, createdAt);
  state.releases.push(JSON.parse(JSON.stringify(manifest)));
  state.workspaceDirty = false;
  SaveLocalState();
  RenderAll();
  UpdateInspector();
  DownloadJson(manifest, `Data_TunnelLightRelease_${releaseId.replaceAll(".", "_")}.json`);
  ShowToast(`${releaseId} 已冻结为发布清单；后续修改不会回写这份快照。`, false);
}

function ExportTaskJson() {
  if (state.promptDirty) SavePrompt(false);
  const nodes = GetOrderedNodes();
  let elapsed = 0;
  const payload = {
    schema: "tunnel-light-asset-director/v2",
    exportedAt: new Date().toISOString(),
    metadata: {
      ...BoardMeta,
      totalDuration: GetTotalDuration(),
      note: "Pro_All.mp4 仅为审片备份；工作工程保留图片、视频、旁白、生成配方、候选版本与独立发布清单。",
    },
    nodes: nodes.map((node, index) => {
      const exportedNode = {
        ...node,
        order: index + 1,
        timelineStart: elapsed,
        originalSourceTask: SourceTasks[node.sourceTaskId],
        cliCommand: BuildCliCommand(node),
      };
      elapsed += node.duration;
      return exportedNode;
    }),
    referenceAssets: ReferenceAssets.map((asset) => ({
      ...asset,
      currentVersionId: state.referenceVersionIds[asset.id] || asset.currentVersionId,
    })),
    referenceReviewNodeIds: [...state.referenceReviewNodeIds],
    narrationAssets: NarrationAssets,
    promptAssets: nodes.map((node) => ({
      assetId: node.promptAssetId,
      currentVersionId: node.promptVersion,
      consumers: [node.assetId],
      versions: node.promptVersions,
    })),
    hierarchy: StoryHierarchy,
    releases: state.releases,
    rejectedSourceTasks: Object.entries(SourceTasks)
      .filter(([, task]) => !task.accepted)
      .map(([submitId, task]) => ({ submitId, ...task })),
  };
  DownloadJson(payload, `Data_TunnelLightAssetDirector_${new Date().toISOString().slice(0, 10).replaceAll("-", "")}.json`);
  ShowToast("已导出章/场/镜头、图片、视频、旁白、候选、原始提示词和发布清单。", false);
}

async function CheckBridge() {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1800);
  try {
    const response = await fetch(`${state.bridgeUrl}/api/health`, { signal: controller.signal, cache: "no-store" });
    const payload = await response.json();
    state.bridgeOnline = response.ok && payload.ok === true;
  } catch {
    state.bridgeOnline = false;
  } finally {
    clearTimeout(timeout);
  }
  elements.bridgeStatus.textContent = state.bridgeOnline ? "本机生成器已连接" : "本机生成器未连接";
  elements.bridgeStatus.className = `bridgeStatus ${state.bridgeOnline ? "online" : "offline"}`;
  elements.bridgeHelp.textContent = state.bridgeOnline
    ? "只会提交当前节点。查询旧任务不耗积分；点击确认生成会消耗积分。"
    : "线上页面可编辑、保存和导出。要直接提交即梦，请在页面目录运行：node Script_VideoBoardServer.mjs。";
  elements.buttonRegenerate.disabled = !state.bridgeOnline || state.assetFocus !== "video";
  if (state.bridgeOnline && state.activeJob && !state.activeJobResumed) {
    state.activeJobResumed = true;
    const { submitId, nodeId } = state.activeJob;
    elements.generationProgress.hidden = false;
    elements.generationProgress.textContent = `正在恢复任务 ${submitId} 的查询……`;
    PollGeneration(submitId, nodeId, 0);
  }
}

function OpenCreditDialog() {
  if (state.assetFocus !== "video" || !state.bridgeOnline || !SavePrompt(false)) return;
  const node = GetNode(state.selectedId);
  elements.confirmNode.textContent = `${state.order.indexOf(node.id) + 1} · ${node.title}`;
  elements.confirmModel.textContent = node.model;
  elements.confirmDuration.textContent = `${node.generationDuration} 秒（时间线保留 ${node.duration} 秒）`;
  elements.creditDialog.showModal();
}

async function SubmitRegeneration() {
  const node = GetNode(state.selectedId);
  elements.buttonConfirmGenerate.disabled = true;
  elements.generationProgress.hidden = false;
  elements.generationProgress.textContent = "正在提交当前节点……";
  try {
    const response = await fetch(`${state.bridgeUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nodeId: node.id,
        command: node.command,
        model: node.model,
        resolution: node.resolution,
        duration: node.generationDuration,
        timelineDuration: node.duration,
        prompt: node.workingPrompt,
        references: [...node.referenceFiles],
        outputFile: node.outputFile,
        confirmCredits: true,
      }),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    if (!payload.submit_id || !["querying", "success"].includes(payload.gen_status)) throw new Error("提交结果没有有效 submit_id/gen_status。 ");
    state.activeJob = { nodeId: node.id, submitId: payload.submit_id };
    state.activeJobResumed = true;
    SaveLocalState();
    elements.generationProgress.textContent = `已提交：${payload.submit_id}。正在查询结果……`;
    elements.creditDialog.close();
    PollGeneration(payload.submit_id, node.id, 0);
  } catch (error) {
    elements.generationProgress.textContent = `提交失败：${error.message}`;
    ShowToast(`提交失败：${error.message}`, true);
  } finally {
    elements.buttonConfirmGenerate.disabled = false;
  }
}

function FindNestedMediaUrl(value, seen = new Set()) {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string") {
    const text = value.trim();
    if (/^(?:https?:|blob:|\/)/.test(text) && /(?:\.mp4|\.webm|\/video|media)/i.test(text)) return text;
    if ((text.startsWith("{") || text.startsWith("[")) && text.length < 2_000_000) {
      try { return FindNestedMediaUrl(JSON.parse(text), seen); } catch { return undefined; }
    }
    return undefined;
  }
  if (typeof value !== "object" || seen.has(value)) return undefined;
  seen.add(value);
  for (const key of ["local_url", "localUrl", "video_url", "videoUrl", "download_url", "downloadUrl", "file_url", "fileUrl", "url"]) {
    const nested = value[key];
    if (typeof nested === "string" && /^(?:https?:|blob:|\/)/.test(nested)) return nested;
  }
  for (const nested of Object.values(value)) {
    const found = FindNestedMediaUrl(nested, seen);
    if (found) return found;
  }
  return undefined;
}

async function PollGeneration(submitId, nodeId, attempt) {
  if (attempt > 180) {
    elements.generationProgress.textContent = `任务 ${submitId} 仍未完成，请稍后用任务 ID 查询。`;
    return;
  }
  try {
    const response = await fetch(`${state.bridgeUrl}/api/task/${encodeURIComponent(submitId)}?nodeId=${encodeURIComponent(nodeId)}`, { cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    if (payload.gen_status === "fail") throw new Error(payload.fail_reason || "即梦任务失败");
    const videoUrl = payload.local_url || payload.video_url || payload.media?.url || FindNestedMediaUrl(payload.result) || FindNestedMediaUrl(payload);
    if (payload.gen_status === "success" && videoUrl) {
      const node = GetNode(nodeId);
      if (!node.candidates.some((candidate) => candidate.submitId === submitId)) {
        node.candidates.push({
          id: NextCandidateVersionId(node),
          url: videoUrl,
          outputFile: payload.output_file || node.outputFile,
          createdAt: new Date().toISOString(),
          submitId,
          prompt: node.workingPrompt,
          promptAssetId: node.promptAssetId,
          promptVersion: node.promptVersion,
          model: node.model,
          resolution: node.resolution,
          duration: node.generationDuration,
          timelineDuration: node.duration,
          command: node.command,
          sourceTaskId: submitId,
          baseSourceTaskId: node.sourceTaskId,
          referenceFiles: [...node.referenceFiles],
          media: payload.media || { url: videoUrl, local: Boolean(payload.local_url), persisted: Boolean(payload.local_url), verified: false },
          status: "candidate",
        });
      }
      SaveLocalState();
      elements.generationProgress.textContent = `生成完成：${submitId}。候选已加入版本栏；当前采用版和工作时间线完全未变。`;
      state.activeJob = null;
      state.activeJobResumed = false;
      SaveLocalState();
      RenderAll();
      UpdateInspector();
      ShowToast("候选生成完成；需要你手动采用，当前剪辑没有改变。", false);
      return;
    }
    if (payload.gen_status === "success" && !videoUrl) throw new Error("任务已成功，但桥接未返回可播放的视频地址；任务 ID 已保留，可稍后继续查询。");
    elements.generationProgress.textContent = `任务 ${submitId}：${payload.gen_status || "querying"}（第 ${attempt + 1} 次查询）`;
  } catch (error) {
    elements.generationProgress.textContent = `查询失败：${error.message}`;
    ShowToast(`查询失败：${error.message}`, true);
    return;
  }
  setTimeout(() => PollGeneration(submitId, nodeId, attempt + 1), 5000);
}

function GetSequenceVideos() {
  return [elements.sequenceVideoA, elements.sequenceVideoB];
}

function ResetSequenceVisuals() {
  clearTimeout(state.sequenceTimer);
  state.sequenceTimer = 0;
  for (const video of GetSequenceVideos()) {
    video.pause();
    video.className = "";
    video.style.transitionDuration = "";
  }
  elements.sequenceBlack.classList.remove("isVisible");
  state.sequenceTransitionStarted = false;
}

function StartSequence(startIndex = 0) {
  const orderedNodes = GetOrderedNodes();
  if (!orderedNodes.length) return;
  ResetSequenceVisuals();
  state.sequenceIndex = Math.min(orderedNodes.length - 1, Math.max(0, startIndex));
  state.sequenceActiveSlot = 0;
  const activeVideo = GetSequenceVideos()[0];
  activeVideo.src = GetCurrentVideoUrl(orderedNodes[state.sequenceIndex]);
  activeVideo.className = "isActive";
  activeVideo.currentTime = 0;
  elements.sequenceDialog.showModal();
  UpdateSequenceInfo();
  activeVideo.play().catch(() => ShowToast("浏览器阻止了自动播放，请点一次画面后再继续。", true));
}

function UpdateSequenceInfo() {
  const node = GetOrderedNodes()[state.sequenceIndex];
  if (!node) return;
  elements.sequenceCounter.textContent = `${String(state.sequenceIndex + 1).padStart(2, "0")} / ${state.order.length} · ${FormatTime(GetNodeStart(node.id))}`;
  elements.sequenceTitle.textContent = node.title;
  elements.sequenceTransition.textContent = `下一转场：${TransitionLabels[node.transitionOut.type] || node.transitionOut.type}${node.transitionOut.duration ? ` ${node.transitionOut.duration.toFixed(2)}s` : ""}`;
  elements.buttonSequencePause.textContent = "暂停";
}

function CommitSequenceAdvance(nextVideo, previousVideo) {
  previousVideo.pause();
  previousVideo.className = "";
  nextVideo.className = "isActive";
  state.sequenceActiveSlot = state.sequenceActiveSlot === 0 ? 1 : 0;
  state.sequenceIndex += 1;
  state.sequenceTransitionStarted = false;
  UpdateSequenceInfo();
}

function BeginSequenceTransition() {
  const orderedNodes = GetOrderedNodes();
  const node = orderedNodes[state.sequenceIndex];
  const nextNode = orderedNodes[state.sequenceIndex + 1];
  if (!node || !nextNode || state.sequenceTransitionStarted) return;
  const activeVideo = GetSequenceVideos()[state.sequenceActiveSlot];
  const nextVideo = GetSequenceVideos()[state.sequenceActiveSlot === 0 ? 1 : 0];
  const duration = Math.max(0.05, node.transitionOut.duration || 0.35);
  state.sequenceTransitionStarted = true;

  if (node.transitionOut.type === "dissolve" || node.transitionOut.type === "vertical-down") {
    nextVideo.src = GetCurrentVideoUrl(nextNode);
    nextVideo.currentTime = 0;
    nextVideo.style.transitionDuration = `${duration}s`;
    activeVideo.style.transitionDuration = `${duration}s`;
    nextVideo.className = node.transitionOut.type === "vertical-down" ? "isIncoming wipeIncoming" : "isIncoming";
    nextVideo.play().catch(() => {});
    requestAnimationFrame(() => {
      nextVideo.classList.add("isBlending");
      if (node.transitionOut.type === "vertical-down") nextVideo.classList.add("isWiping");
      activeVideo.classList.add("isFading");
    });
    state.sequenceTimer = setTimeout(() => CommitSequenceAdvance(nextVideo, activeVideo), duration * 1000);
    return;
  }

  if (node.transitionOut.type === "fade-black") elements.sequenceBlack.classList.add("isVisible");
}

function AdvanceSequence(force = false) {
  const orderedNodes = GetOrderedNodes();
  if (state.sequenceIndex >= orderedNodes.length - 1) {
    ResetSequenceVisuals();
    elements.sequenceDialog.close();
    return;
  }
  const activeVideo = GetSequenceVideos()[state.sequenceActiveSlot];
  const nextVideo = GetSequenceVideos()[state.sequenceActiveSlot === 0 ? 1 : 0];
  const nextNode = orderedNodes[state.sequenceIndex + 1];
  clearTimeout(state.sequenceTimer);
  nextVideo.src = GetCurrentVideoUrl(nextNode);
  nextVideo.currentTime = 0;
  nextVideo.className = "isActive";
  activeVideo.pause();
  activeVideo.className = "";
  state.sequenceActiveSlot = state.sequenceActiveSlot === 0 ? 1 : 0;
  state.sequenceIndex += 1;
  state.sequenceTransitionStarted = false;
  UpdateSequenceInfo();
  nextVideo.play().catch(() => {});
  if (elements.sequenceBlack.classList.contains("isVisible")) {
    state.sequenceTimer = setTimeout(() => elements.sequenceBlack.classList.remove("isVisible"), force ? 0 : 120);
  }
}

function HandleSequenceTimeUpdate(event) {
  const activeVideo = GetSequenceVideos()[state.sequenceActiveSlot];
  if (event.currentTarget !== activeVideo || state.sequenceTransitionStarted) return;
  const node = GetOrderedNodes()[state.sequenceIndex];
  if (!node) return;
  const remaining = node.duration - activeVideo.currentTime;
  if (remaining <= 0) {
    AdvanceSequence(false);
    return;
  }
  if (state.sequenceIndex >= state.order.length - 1) return;
  if (node.transitionOut.duration > 0 && remaining <= node.transitionOut.duration) BeginSequenceTransition();
}

function ToggleSequencePause() {
  const activeVideo = GetSequenceVideos()[state.sequenceActiveSlot];
  if (activeVideo.paused) {
    activeVideo.play().catch(() => {});
    elements.buttonSequencePause.textContent = "暂停";
  } else {
    activeVideo.pause();
    elements.buttonSequencePause.textContent = "继续";
  }
}

function ShowToast(message, destructive) {
  clearTimeout(ShowToast.timer);
  elements.toast.textContent = message;
  elements.toast.style.borderColor = destructive ? "#8b4a40" : "";
  elements.toast.classList.add("isVisible");
  ShowToast.timer = setTimeout(() => elements.toast.classList.remove("isVisible"), 2800);
}

function BindEvents() {
  elements.canvasViewport.addEventListener("pointerdown", BeginCanvasPan);
  elements.canvasViewport.addEventListener("wheel", (event) => {
    event.preventDefault();
    ZoomCanvas(event.deltaY < 0 ? 1.12 : 0.89, event.clientX, event.clientY);
  }, { passive: false });
  elements.buttonFit.addEventListener("click", FitCanvas);
  elements.buttonZoomOut.addEventListener("click", () => ZoomCanvas(0.84));
  elements.buttonZoomIn.addEventListener("click", () => ZoomCanvas(1.18));
  elements.buttonResetLayout.addEventListener("click", () => {
    if (state.viewMode !== "sequence") {
      FitCanvas();
      return;
    }
    state.positions = BuildDefaultPositions();
    SaveLocalState();
    RenderAll();
    CenterOnNode(state.selectedId);
  });
  elements.buttonSequenceMode.addEventListener("click", () => SetViewMode("sequence"));
  elements.buttonDependencyMode.addEventListener("click", () => SetViewMode("dependency"));
  elements.buttonVersionMode.addEventListener("click", () => SetViewMode("versions"));
  elements.buttonAllGroups.addEventListener("click", () => {
    state.selectedGroupId = "all";
    RenderAll();
    FitCanvas();
  });
  for (const button of [elements.buttonFocusShot, elements.buttonFocusImage, elements.buttonFocusPrompt, elements.buttonFocusVideo, elements.buttonFocusAudio]) {
    button.addEventListener("click", () => SetAssetFocus(button.dataset.assetFocus));
  }
  elements.buttonPlayAll.addEventListener("click", () => StartSequence(0));
  elements.buttonPlayFromNode.addEventListener("click", () => StartSequence(state.order.indexOf(state.selectedId)));
  elements.buttonPublish.addEventListener("click", PublishWorkingManifest);
  elements.buttonExport.addEventListener("click", ExportTaskJson);
  elements.fieldWorkingPrompt.addEventListener("input", () => {
    state.promptDirty = true;
    elements.promptDirtyState.textContent = "未保存";
    elements.promptDirtyState.className = "isDirty";
  });
  elements.buttonSavePrompt.addEventListener("click", () => SavePrompt(true));
  elements.buttonRestorePrompt.addEventListener("click", RestorePrompt);
  elements.buttonCopyCommand.addEventListener("click", CopyCliCommand);
  for (const field of [elements.fieldDuration, elements.fieldGenerationDuration, elements.fieldModel, elements.fieldResolution, elements.fieldTransitionType, elements.fieldTransitionDuration]) {
    field.addEventListener("change", UpdateNodeFields);
  }
  elements.buttonMoveEarlier.addEventListener("click", () => MoveSelectedNode(-1));
  elements.buttonMoveLater.addEventListener("click", () => MoveSelectedNode(1));
  elements.buttonRegenerate.addEventListener("click", OpenCreditDialog);
  elements.buttonConfirmGenerate.addEventListener("click", SubmitRegeneration);
  elements.buttonSequencePause.addEventListener("click", ToggleSequencePause);
  elements.buttonSequenceNext.addEventListener("click", () => AdvanceSequence(true));
  elements.buttonSequenceClose.addEventListener("click", () => {
    ResetSequenceVisuals();
    elements.sequenceDialog.close();
  });
  for (const video of GetSequenceVideos()) {
    video.addEventListener("timeupdate", HandleSequenceTimeUpdate);
    video.addEventListener("ended", (event) => {
      if (event.currentTarget === GetSequenceVideos()[state.sequenceActiveSlot] && !state.sequenceTransitionStarted) AdvanceSequence(false);
      else if (event.currentTarget === GetSequenceVideos()[state.sequenceActiveSlot] && GetOrderedNodes()[state.sequenceIndex]?.transitionOut.type === "fade-black") AdvanceSequence(false);
    });
  }
  elements.sequenceDialog.addEventListener("cancel", ResetSequenceVisuals);
  window.addEventListener("beforeunload", () => {
    if (state.promptDirty) SavePrompt(false);
  });
}

LoadLocalState();
BindEvents();
RenderAll();
UpdateInspector();
CheckBridge();
setInterval(CheckBridge, 15000);
