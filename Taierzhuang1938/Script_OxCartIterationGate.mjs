// A small cross-worktree gate for the scheduled ox-cart art sessions.
import { open, readFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { homedir, hostname } from "node:os";
import { join } from "node:path";

const lockPath = process.env.OX_CART_ITERATION_LOCK || join(
  homedir(), "OneDrive", "AI", "Models", "Blender", "Taierzhuang1938", "OxCart", "Iteration.lock");
const [command, suppliedToken] = process.argv.slice(2);

async function ReadLock() {
  try {
    const content = await readFile(lockPath, "utf8");
    if (!content.trim()) return { initializing: true };
    try { return JSON.parse(content); }
    catch { return { unreadable: true }; }
  }
  catch (error) { if (error.code === "ENOENT") return null; throw error; }
}

if (command === "acquire") {
  const lock = { token: randomUUID(), startedAt: new Date().toISOString(), host: hostname() };
  let handle;
  try {
    handle = await open(lockPath, "wx");
    await handle.writeFile(`${JSON.stringify(lock)}\n`);
    console.log(JSON.stringify({ state: "acquired", lockPath, ...lock }));
  } catch (error) {
    if (error.code !== "EEXIST") throw error;
    console.log(JSON.stringify({ state: "busy", lockPath, current: await ReadLock() }));
    process.exitCode = 3;
  } finally { await handle?.close(); }
} else if (command === "release") {
  if (!suppliedToken) throw new Error("release requires the acquire token");
  const current = await ReadLock();
  if (!current || current.token !== suppliedToken) throw new Error("Lock token mismatch; another session may own the gate");
  await unlink(lockPath);
  console.log(JSON.stringify({ state: "released", lockPath }));
} else if (command === "status") {
  const current = await ReadLock();
  console.log(JSON.stringify({ state: current ? "busy" : "free", lockPath, current }));
} else {
  console.error("Usage: node Script_OxCartIterationGate.mjs acquire | release <token> | status");
  process.exitCode = 2;
}
