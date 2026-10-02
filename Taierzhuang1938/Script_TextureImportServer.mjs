import fs from "node:fs/promises";
import path from "node:path";
import { TextureCatalog, ValidateImportDocument } from "./Script_TextureImportRules.mjs";
import { EncodeTexture, TextureImportHash } from "./Script_TextureImportBuild.mjs";
const busy = new Set();
const Json = (res, status, data) => { res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" }); res.end(JSON.stringify(data)); };
function Local(req) {
  const remote = req.socket.remoteAddress;
  const loopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(remote);
  const host = (req.headers.host || "").split(":")[0];
  return loopback && ["localhost", "127.0.0.1"].includes(host);
}
async function Body(req) {
  if (!req.headers["content-type"]?.startsWith("application/json")) throw new Error("JSON required");
  if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) throw new Error("Same-origin request required");
  let size = 0, chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > 512 * 1024) throw new Error("Request too large"); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
export async function HandleTextureImportRequest(req, res, rootDir) {
  const route = new URL(req.url, "http://localhost").pathname;
  const projectDir = path.join(rootDir, "Taierzhuang1938"), settingsFile = path.join(projectDir, "Data_TextureImportSettings.json");
  const outputDir = path.join(rootDir, "tmp", "TextureImportPreview");
  try {
    if (route === "/__textures/status" && req.method === "GET") {
      const raw = await fs.readFile(settingsFile, "utf8");
      Json(res, 200, { writable: Local(req), root: rootDir, revision: TextureImportHash(raw), document: JSON.parse(raw) }); return;
    }
    if (!Local(req)) { Json(res, 403, { error: "Texture writes and encoding are available on localhost only" }); return; }
    if (route.startsWith("/__textures/result/") && req.method === "GET") {
      const name = route.slice("/__textures/result/".length);
      if (!/^[A-Za-z0-9_]+_Import[a-f0-9]{24}(?:_NoFlip)?\.(webp|png|jpe?g|ktx2)$/.test(name)) throw new Error("Invalid preview name");
      const data = await fs.readFile(path.join(outputDir, name));
      const mime = { ".ktx2": "image/ktx2", ".webp": "image/webp", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };
      res.writeHead(200, { "Content-Type": mime[path.extname(name)], "Cache-Control": "no-store", "Content-Length": data.length }); res.end(data); return;
    }
    if (req.method !== "POST") { Json(res, 405, { error: "POST required" }); return; }
    const body = await Body(req);
    if (busy.has(projectDir)) { Json(res, 409, { error: "另一个导入操作正在进行，请稍后重试" }); return; }
    busy.add(projectDir);
    try {
      if (route === "/__textures/save") {
        const document = ValidateImportDocument(body.document), raw = await fs.readFile(settingsFile, "utf8");
        if (body.revision !== TextureImportHash(raw)) { Json(res, 409, { error: "配置已被其他窗口修改。请先导出草稿，再重新读取配置。" }); return; }
        const next = JSON.stringify(document, null, 2) + "\n";
        await fs.writeFile(settingsFile + ".tmp", next);
        await fs.rename(settingsFile + ".tmp", settingsFile);
        Json(res, 200, { ok: true, revision: TextureImportHash(next), document }); return;
      }
      if (route === "/__textures/preview") {
        const item = TextureCatalog().find(item => item.file === body.file);
        if (!item) throw new Error("Unknown texture");
        const result = await EncodeTexture(projectDir, item, body.settings, outputDir);
        Json(res, 200, { ...result, url: `/__textures/result/${result.filename}`,
          unflippedUrl: result.unflipped && `/__textures/result/${result.unflipped}` }); return;
      }
      Json(res, 404, { error: "Unknown texture endpoint" });
    } finally { busy.delete(projectDir); }
  } catch (error) { Json(res, 400, { error: error.message }); }
}
