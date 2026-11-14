// Shared by the editor and its local chat bridge. Attachments are frozen snapshots.
export function CreateUnitsAttachment(frame, workspace, ids, document) {
  const selected = new Set(ids);
  return {
    schema: "EncounterUnits", version: 1,
    scene: workspace.mapData.source.scene,
    timeline: { stage: frame.stage.id, beat: frame.beat.id, timeSeconds: frame.time },
    coordinates: { unit: "metres", axes: "X east, Y up, Z south", angles: "radians" },
    units: frame.actors.filter(actor => selected.has(actor.id)).map(actor => ({
      ...structuredClone(actor),
      position: { x: actor.p[0], y: workspace.mapData.terrain.heightAt(...actor.p) + (actor.elevation || 0), z: actor.p[1] },
      group: structuredClone(document.groups.find(group => group.id === actor.groupId) || null),
    })),
  };
}

export function ReadUnitsAttachment(value) {
  const valid = value?.schema === "EncounterUnits" && value.version === 1
    && typeof value.scene === "string" && value.scene.length > 0
    && typeof value.timeline?.stage === "string" && typeof value.timeline?.beat === "string"
    && Number.isFinite(value.timeline?.timeSeconds) && value.timeline.timeSeconds >= 0
    && Array.isArray(value.units) && value.units.length > 0
    && value.units.every(unit => typeof unit?.id === "string" && unit.id.length > 0
      && typeof unit.name === "string" && typeof unit.side === "string" && typeof unit.pose === "string"
      && [unit.position?.x, unit.position?.y, unit.position?.z].every(Number.isFinite))
    && new Set(value.units.map(unit => unit.id)).size === value.units.length;
  if (!valid || JSON.stringify(value).length > 256000) throw new Error("单位附件无效");
  return structuredClone(value);
}

export function UnitsLabel(attachment) {
  return `单位 · ${attachment.units.length} 个 · ${attachment.timeline.beat.toUpperCase()} · ${attachment.timeline.timeSeconds.toFixed(2)} s`;
}
