// 白盒关卡编辑器的存取（docs/Data_EditorBlockout.md §7，客户端一侧）。
//
// 读：fetch("./Blockout/<Level>.json?t=…", { cache: "no-store" })，404 / 不是 JSON 都当「没有配置」。
//     读的时候按响应的**原始字节**算 sha1（工作区是 CRLF 也一样），这就是「我改的是哪一版」：
//     保存时原样带上，端点拿它和盘上的比，对不上回 409 —— 不能拿状态口当下的版本号，
//     那会把别人（或 AI）刚改的内容静默盖掉（§7）。
// 写：只有本机 LocalPreview 才开 /__blockout/status 与 /__blockout/save；
//     状态口 404、不是 JSON、writable:false（Pages、测试服、局域网、旧的预览进程）一律当不可写，
//     改存进本地草稿（localStorage 键 tengxian1938_blockout_<Level>）并给一份下载，界面写明原因。
// 这一份只碰网络与 localStorage，不碰 three。

export const BLOCKOUT_DRAFT_PREFIX = "tengxian1938_blockout_";

export function BlockoutDraftKey(level) { return `${BLOCKOUT_DRAFT_PREFIX}${level}`; }

/** 原始字节的 sha1（十六进制）。没有 crypto.subtle（非安全上下文：局域网 http）时给 undefined = 不知道。 */
export async function BlockoutRevisionOf(bytes) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle?.digest) return undefined;
  try {
    const digest = new Uint8Array(await subtle.digest("SHA-1", bytes));
    let hex = "";
    for (const byte of digest) hex += byte.toString(16).padStart(2, "0");
    return hex;
  } catch (error) {
    return undefined;
  }
}

export class BlockoutStore {
  constructor({ fetchImpl = null, storage = null, base = "./Blockout/", origin = null } = {}) {
    this.fetch = fetchImpl || ((...args) => globalThis.fetch(...args));
    this.storage = storage;
    this.base = base;
    this.origin = origin || globalThis.location?.origin || "";
  }

  _Storage() {
    if (this.storage) return this.storage;
    try { return globalThis.localStorage || null; } catch (error) { return null; }
  }

  /**
   * 读配置原文。→ { state: "ok"|"missing"|"invalid"|"error"|"same", text, doc, revision, message }
   * state 只描述「文件读没读到、是不是 JSON」；校验由调用方做。
   * revision：原始字节的 sha1；文件不存在时是 null；读失败或算不出来时是 undefined（不知道）。
   * knownText：和上次读到的原文一样就回 "same"，不解析、不算 sha1（每 2 s 轮询一次，这样最省）。
   */
  async Load(level, { knownText } = {}) {
    let response;
    try {
      response = await this.fetch(`${this.base}${level}.json?t=${Date.now()}`, { cache: "no-store" });
    } catch (error) {
      return { state: "error", text: null, doc: null, revision: undefined, message: `读不到配置：${error?.message || error}` };
    }
    if (response.status === 404) return { state: "missing", text: null, doc: null, revision: null, message: "这一关还没有配置文件" };
    if (!response.ok) return { state: "error", text: null, doc: null, revision: undefined, message: `读配置失败（HTTP ${response.status}）` };
    let bytes;
    try { bytes = await response.arrayBuffer(); }
    catch (error) { return { state: "error", text: null, doc: null, revision: undefined, message: `读配置中途断了：${error?.message || error}` }; }
    const text = new TextDecoder("utf-8").decode(bytes);
    if (knownText !== undefined && text === knownText) return { state: "same", text, doc: null, revision: undefined, message: "" };
    const revision = await BlockoutRevisionOf(bytes);
    try {
      return { state: "ok", text, doc: JSON.parse(text), revision, message: "" };
    } catch (error) {
      return { state: "invalid", text, doc: null, revision, message: `配置不是合法的 JSON：${String(error?.message || error).slice(0, 120)}` };
    }
  }

  /** → { writable, root, revisions, reason } */
  async Status() {
    const fail = (reason) => ({ writable: false, root: null, revisions: {}, reason });
    let response;
    try {
      response = await this.fetch(new URL("/__blockout/status", this.origin || "http://localhost").toString(), { cache: "no-store" });
    } catch (error) {
      return fail("连不上本机预览服务，只能存成本地草稿");
    }
    if (!response.ok) return fail("这个页面不是从本机预览服务打开的（或预览服务是旧版本），只能存成本地草稿");
    let body;
    try { body = await response.json(); } catch (error) { return fail("本机存档口没有回应，只能存成本地草稿"); }
    if (!body || body.writable !== true) return fail("只有在本机打开的预览页面才能直接写配置文件，这里先存成本地草稿");
    return { writable: true, root: body.root || null, revisions: body.revisions || {}, reason: "" };
  }

  /**
   * 保存。→ { ok, mode: "server"|"local", reason, revision?, conflict?, details? }
   * revision：调用方**读配置时**按原始字节算的 sha1（文件当时不存在才是 null）。原样发给端点；
   * 不知道版本号（undefined）时不发，按冲突处理（调用方重读一次再存）。
   * 可写时 POST /__blockout/save，成功后带回端点给的新版本号；不可写时存本地草稿（调用方再决定要不要下载）。
   */
  async Save(level, doc, revision) {
    const status = await this.Status();
    if (status.writable) {
      if (revision !== null && typeof revision !== "string") {
        return { ok: false, mode: "server", conflict: true, reason: "还不知道配置文件是哪一版，先重新读取" };
      }
      let response;
      try {
        response = await this.fetch(new URL("/__blockout/save", this.origin || "http://localhost").toString(), {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ level, doc, revision }),
        });
      } catch (error) {
        return { ...this.SaveDraft(level, doc), reason: "保存时连不上本机预览服务，先存成本地草稿" };
      }
      let body = null;
      try { body = await response.json(); } catch (error) { body = null; }
      if (response.ok && body?.ok !== false) {
        this.ClearDraft(level);
        return { ok: true, mode: "server", reason: "", file: body?.file || null,
          revision: typeof body?.revision === "string" ? body.revision : undefined, warnings: body?.warnings || [] };
      }
      if (response.status === 409) {
        return { ok: false, mode: "server", conflict: true, reason: "配置文件在外面被改过了",
          revision: typeof body?.revision === "string" || body?.revision === null ? body.revision : undefined };
      }
      if (response.status === 400) {
        const details = Array.isArray(body?.details) ? body.details : [];
        const first = details[0] || (typeof body?.error === "string" ? body.error : "");
        return { ok: false, mode: "server", reason: `存档口没收：${first || "配置没通过校验"}`, details };
      }
      return { ...this.SaveDraft(level, doc), reason: `存档口拒绝了（HTTP ${response.status}），先存成本地草稿` };
    }
    return { ...this.SaveDraft(level, doc), reason: status.reason };
  }

  SaveDraft(level, doc) {
    const storage = this._Storage();
    try {
      storage?.setItem(BlockoutDraftKey(level), JSON.stringify(doc, null, 2));
      return { ok: !!storage, mode: "local" };
    } catch (error) {
      return { ok: false, mode: "local", reason: "浏览器不让存本地草稿（无痕窗口？）" };
    }
  }

  LocalDraft(level) {
    try {
      const text = this._Storage()?.getItem(BlockoutDraftKey(level));
      return text ? JSON.parse(text) : null;
    } catch (error) { return null; }
  }

  ClearDraft(level) {
    try { this._Storage()?.removeItem(BlockoutDraftKey(level)); } catch (error) { /* 无痕窗口 */ }
  }

  /** 把配置作为文件给用户（浏览器下载）。 */
  Download(level, doc) {
    if (typeof document === "undefined") return false;
    const blob = new Blob([`${JSON.stringify(doc, null, 2)}\n`], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${level}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    return true;
  }
}
