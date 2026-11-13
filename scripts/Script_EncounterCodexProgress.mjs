import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Older exec-based previews discard public progress events. Read only the
// matching rollout's bounded tail so those runs can still report commentary.
export function CreateLegacyProgressReader(sessionsRoot = path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "sessions")) {
  const cache = new Map();
  return function ReadProgress(session) {
    if (!/^[a-f0-9-]{36}$/.test(session.cliSessionId || "")) return null;
    let entry = cache.get(session.cliSessionId);
    try {
      if (!entry?.file && (!entry || Date.now() - entry.checkedAt > 30000)) {
        entry = { checkedAt: Date.now(), file: null };
        const date = new Date(session.createdAt);
        for (const offset of [0, 1, -1]) {
          const day = new Date(date.getTime() + offset * 86400000).toISOString().slice(0, 10).replaceAll("-", path.sep);
          const directory = path.join(sessionsRoot, day);
          if (!fs.existsSync(directory)) continue;
          const name = fs.readdirSync(directory).find(name => name.endsWith(`-${session.cliSessionId}.jsonl`));
          if (name) { entry.file = path.join(directory, name); break; }
        }
        cache.set(session.cliSessionId, entry);
      }
      if (!entry?.file) return null;
      const stat = fs.statSync(entry.file);
      if (entry.mtime === stat.mtimeMs && entry.size === stat.size) return entry.result;
      const bytes = Buffer.alloc(Math.min(stat.size, 256 * 1024));
      const descriptor = fs.openSync(entry.file, "r");
      try { fs.readSync(descriptor, bytes, 0, bytes.length, stat.size - bytes.length); }
      finally { fs.closeSync(descriptor); }
      const result = { ...entry.result };
      for (const line of bytes.toString("utf8").split("\n")) {
        let event;
        try { event = JSON.parse(line); } catch { continue; }
        const item = event.payload;
        if (event.type === "turn_context") {
          if (typeof item?.model === "string") result.model = item.model;
          if (typeof item?.effort === "string") result.effort = item.effort;
        }
        if (event.type === "response_item" && item?.type === "message" && item.role === "assistant" && item.phase === "commentary") {
          const text = (item.content || []).filter(part => part.type === "output_text").map(part => part.text).join("\n");
          if (text) result.progress = { activity: "旧版 CLI 正在执行", text: text.slice(-4000), updatedAt: event.timestamp };
        }
      }
      Object.assign(entry, { mtime: stat.mtimeMs, size: stat.size, result });
      return result;
    } catch { return null; }
  };
}
