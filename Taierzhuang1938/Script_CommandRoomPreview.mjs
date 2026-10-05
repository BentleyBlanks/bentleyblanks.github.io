import { COMMAND_ROOM_CAMPAIGN_IDS, CommandRoomPapers, CommandRoomPreviewStage } from "./Data_CommandRoomPapers.mjs";

/** Session-only artwork override. The save reader is deliberately read-only. */
export class CommandRoomPreview {
  constructor(room, readProgress, stage = null) {
    this.room = room;
    this.readProgress = readProgress;
    this.stage = this.appliedStage = CommandRoomPreviewStage(stage);
    this.request = 0;
  }
  Progress() {
    return this.stage === null ? this.readProgress() : { cleared: COMMAND_ROOM_CAMPAIGN_IDS.slice(0, this.stage) };
  }
  Load() { return this.room.Load(this.Progress()); }
  async SetStage(value) {
    const stage = CommandRoomPreviewStage(value), request = ++this.request;
    this.stage = stage;
    try {
      await this.Load();
      if (request !== this.request) return null;
      this.appliedStage = stage;
      return this.State();
    } catch (error) {
      if (request !== this.request) return null;
      this.stage = this.appliedStage;
      await this.Load();
      throw error;
    }
  }
  State() {
    return { active: this.stage !== null, stage: this.stage,
      savedStage: CommandRoomPapers(this.readProgress()).stage,
      papers: this.room.State().papers };
  }
}
