import { BakeTextureJob } from "./Script_TextureBakeJob.mjs";

/** One sequential bake lane per loading pass; always release it in finally. */
export class TextureBaker {
  constructor() { this.worker = null; this.failed = typeof Worker === "undefined"; }

  async Bake(name, size) {
    if (!this.failed) {
      try {
        this.worker ??= new Worker(new URL("./Script_TextureBakeWorker.mjs?v=2026100401", import.meta.url), { type: "module" });
        return await new Promise((resolve, reject) => {
          const worker = this.worker;
          const Finish = (error, maps) => {
            clearTimeout(timer);
            worker.onmessage = worker.onerror = worker.onmessageerror = null;
            if (error) reject(error); else resolve(maps);
          };
          const timer = setTimeout(() => Finish(new Error("Texture bake worker timed out")), 30000);
          worker.onmessage = ({ data }) => Finish(data.error ? new Error(data.error) : null, data.maps);
          worker.onerror = event => { event.preventDefault(); Finish(new Error(event.message)); };
          worker.onmessageerror = () => Finish(new Error("Texture bake worker message failed"));
          try { worker.postMessage({ name, size }); } catch (error) { Finish(error); }
        });
      } catch (error) {
        this.Dispose();
        this.failed = true;
        console.warn("[TextureBaker] Worker unavailable; using synchronous recovery", error);
      }
    }
    return BakeTextureJob(name, size);
  }

  Dispose() { this.worker?.terminate(); this.worker = null; }
}
