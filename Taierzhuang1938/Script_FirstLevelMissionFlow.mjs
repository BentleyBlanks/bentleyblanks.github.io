// Pure mission facts. No kill quota, remote trigger circle or scheduled auto-win.
import { MISSION_STAGES } from "./Data_FirstLevelMission.mjs";
import { FIRST_LEVEL_STAGES, FirstLevelStageForStep } from "./Data_FirstLevelMissionStages.mjs";
export class FirstLevelMissionFlow {
  constructor(host = {}) {
    this.host = host;
    this.index = 0;
    this.time = 0;
    this.stageTime = 0;
    this.facts = new Set();
    this.log = [];
    this.started = false;
  }
  get stage() {
    return MISSION_STAGES[this.index];
  }
  get completed() {
    return this.stage.id === "Complete";
  }
  get phase() { return FirstLevelStageForStep(this.stage.id); }
  Start() {
    if (this.started) return;
    this.started = true;
    this.Enter();
  }
  Enter() {
    this.stageTime = 0;
    this.log.push({ kind: "stage", id: this.stage.id, time: this.time });
    this.host.Enter?.(this.stage, this.index);
  }
  Record(id, detail = null) {
    if (this.facts.has(id)) return false;
    this.facts.add(id);
    this.log.push({ kind: "fact", id, time: this.time, detail });
    return true;
  }
  Has(id) {
    return this.facts.has(id);
  }
  Update(dt) {
    if (!this.started || this.completed) return;
    this.time += Math.max(0, dt);
    this.stageTime += Math.max(0, dt);
    if (this.stageTime < (this.stage.minimumSeconds || 0)) return;
    if (this.stage.requirements.every((id) => this.Has(id))) {
      this.index++;
      this.Enter();
    }
  }
  Snapshot() {
    return {
      version: 2,
      stageId: this.stage.id,
      index: this.index,
      time: this.time,
      stageTime: this.stageTime,
      facts: [...this.facts],
      log: this.log.map((entry) => ({ ...entry })),
    };
  }
  Restore(saved) {
    if (
      ![1,2].includes(saved?.version) ||
      !Number.isInteger(saved.index) ||
      saved.index < 0 ||
      saved.index >= MISSION_STAGES.length
    )
      throw new Error("Invalid first-level checkpoint");
    const legacySteps=MISSION_STAGES.filter(step=>!["TrenchEntry","Shelter"].includes(step.id));
    const stageId=saved.stageId||saved.log?.findLast(entry=>entry.kind==="stage")?.id||legacySteps[saved.index]?.id;
    this.index=MISSION_STAGES.findIndex(step=>step.id===stageId);
    if(this.index<0)throw new Error("Unknown first-level checkpoint stage");
    this.time = saved.time;
    this.stageTime = saved.stageTime;
    this.facts = new Set(saved.facts);
    this.log = saved.log.map((entry) => ({ ...entry }));
    this.started = true;
  }
  // Read the same gates as Update; never infer completion from UI counters.
  ObjectiveProgress() {
    const conditions = this.stage.requirements.map(id => ({ id, complete: this.Has(id) }));
    if (this.stage.minimumSeconds) conditions.push({
      id: "minimumSeconds", complete: this.stageTime >= this.stage.minimumSeconds,
      current: Math.min(this.stage.minimumSeconds, Math.floor(this.stageTime)),
      target: this.stage.minimumSeconds,
    });
    return { stageId: this.stage.id, complete: this.completed, conditions };
  }
  State() {
    return {
      ...this.Snapshot(),
      stage: this.stage.id,
      phaseNumber: this.phase.number,
      phaseId: this.phase.id,
      phaseTitle: this.phase.title,
      phaseCount: FIRST_LEVEL_STAGES.length,
      objective: this.stage.objective,
      complete: this.completed,
      remaining: this.stage.requirements.filter((id) => !this.Has(id)),
    };
  }
}
