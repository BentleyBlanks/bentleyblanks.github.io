import { FormatFlowTime } from "./Script_LevelFlowModel.mjs";

// Preserve every character of the source while separating stage directions and dialogue.
export function FormatSourcePassage(element, source) {
  element.replaceChildren();
  let paragraph = "", quoteDepth = 0, bracketDepth = 0;
  const Flush = () => {
    if (!paragraph) return;
    const part = document.createElement("p");
    part.textContent = paragraph;
    if (paragraph.includes("「") || paragraph.includes("“")) part.className = "lfDialogue";
    element.append(part); paragraph = "";
  };
  for (const character of source) {
    if (!paragraph && element.lastElementChild && "。！？；，、".includes(character)) {
      element.lastElementChild.append(document.createTextNode(character));
      continue;
    }
    paragraph += character;
    if (character === "「" || character === "“") quoteDepth++;
    if (character === "」" || character === "”") quoteDepth = Math.max(0, quoteDepth - 1);
    if (character === "（" || character === "(") bracketDepth++;
    if (character === "）" || character === ")") bracketDepth = Math.max(0, bracketDepth - 1);
    if (quoteDepth || bracketDepth) continue;
    if (character === "\n" || "。；".includes(character) || character === "」" || character === "”") Flush();
    else if (character === "：" && /^第[一二三四五六七八九十]+回/.test(paragraph)) Flush();
  }
  Flush();
}

function RoundValues(value) {
  if (typeof value === "number") return Math.round(value * 1000) / 1000;
  if (Array.isArray(value)) return value.map(RoundValues);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, RoundValues(entry)]));
  return value;
}

export function CreateLocationText(frame, workspace, selection, document) {
  const Ground = (point) => workspace.mapData.terrain.heightAt(...point);
  const Position = (point, elevation = 0) => ({ x: point[0], y: Ground(point) + elevation, z: point[1] });
  const selectedObject = selection?.type === "group" ? document.groups.find(item => item.id === selection.id)
    : selection?.type === "trigger" ? document.triggers.find(item => item.id === selection.id) : null;
  const actor = frame.actors.find(item => selection?.type === "actor" && item.id === selection.id);
  const note = document.annotations.find(item => selection?.type === "annotation" && item.id === selection.id);
  const player = frame.actors.find(item => item.id === "player");
  const location = {
    scene: workspace.mapData.source.scene,
    timeline: {
      stage: frame.stage.id, stageTitle: frame.stage.title, beat: frame.beat.id.toUpperCase(), beatTitle: frame.beat.title,
      timeSeconds: frame.time, timecode: FormatFlowTime(frame.time),
      beatStartSeconds: frame.beat.start, beatEndSeconds: frame.beat.end, secondsIntoBeat: frame.time - frame.beat.start,
      stageStartSeconds: frame.stage.start, stageEndSeconds: frame.stage.end, secondsIntoStage: frame.time - frame.stage.start,
    },
    coordinates: { unit: "metres", axes: "X east, Y up, Z south", angles: "radians", position: "world coordinates, Y at actor base or terrain surface" },
    player: Position(frame.player, player?.elevation || 0),
    activeViewport: workspace.activeIndex + 1,
    viewports: workspace.Visible().map(entry => {
      const view = entry.map;
      const result = { viewport: entry.index + 1, projection: entry.type, mode: entry.mode, center: Position(view.center),
        sizePixels: [entry.canvas.clientWidth, entry.canvas.clientHeight], layers: { ...entry.layers } };
      const orthographic = !view.type || view.type === "oblique" && !view.freeCamera;
      if (orthographic) result.scalePixelsPerMetre = view.scale;
      if (view.eye) result.camera = { projection: orthographic ? "orthographic" : "perspective",
        eye: [...view.eye], aim: [...view.aim], forward: [...view.forward],
        yaw: Math.atan2(view.forward[0], view.forward[2]), pitch: Math.asin(view.forward[1]),
        ...(!orthographic ? { horizontalFovDegrees: view.fov } : {}), farMetres: view.far };
      else {
        const [minX, maxX, minZ, maxZ] = view.Bounds();
        result.bounds = { minX, maxX, minZ, maxZ };
      }
      return result;
    }),
  };
  if (selectedObject) location.selection = { type: selection.type, id: selectedObject.id, label: selectedObject.label,
    center: Position(selectedObject.area.center), area: selectedObject.area, route: selectedObject.route,
    startBeat: selectedObject.beat, endBeat: selectedObject.endBeat };
  if (selectedObject?.spawnOffsets) {
    location.selection.spawnPositions = selectedObject.spawnOffsets.map(offset => Position(offset.map((value, index) => value + selectedObject.area.center[index])));
    location.selection.deployDelaySeconds = selectedObject.deployDelay;
  }
  if (actor) location.selection = { type: "actor", id: actor.id, name: actor.name, position: Position(actor.p, actor.elevation || 0), heading: actor.heading, pose: actor.pose };
  if (note) location.selection = { type: "annotation", id: note.id, timeSeconds: note.time, a: Position(note.a), b: Position(note.b), text: note.text };
  return JSON.stringify(RoundValues(location), null, 2);
}
