import type { SophiaCore } from "../GameCore";

const FIXED_DT_MS = 100;
const MAX_FRAME_MS = 1000;

export class GameLoop {
  private accumulatorMs = 0;

  constructor(private readonly core: SophiaCore) {}

  update(deltaMs: number): void {
    this.accumulatorMs += Math.min(deltaMs, MAX_FRAME_MS);

    while (this.accumulatorMs >= FIXED_DT_MS) {
      this.core.tick(FIXED_DT_MS);
      this.accumulatorMs -= FIXED_DT_MS;
    }
  }
}
