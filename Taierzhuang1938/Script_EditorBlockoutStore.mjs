// 白盒关卡编辑器的存取（docs/Data_EditorBlockout.md §7，客户端一侧）。
//
// 读：fetch("./Blockout/<Level>.json?t=…", { cache: "no-store" })，404 / 不是 JSON 都当「没有配置」。
// 写：只有本机 LocalPreview 才开 /__blockout/status 与 /__blockout/save；
//     状态口 404、不是 JSON、writable:false（Pages、测试服、局域网、旧的预览进程）一律当不可写，
//     改存进本地草稿（localStorage 键 tengxian1938_blockout_<Level>）并给一份下载，界面写明原因。
// 这一份只碰网络与 localStorage，不碰 three。

export const BLOCKOUT_DRAFT_PREFIX = "tengxian1938_blockout_";

export function BlockoutDraftKey(level) { return `${BLOCKOUT_DRAFT_PREFIX}${level}`; }

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
   * 读配置原文。→ { state: "ok"|"missing"|"invalid"|"error", text, doc, message }
   * state 只描述「文件读没读到、是不是 JSON」；校验由调用方做。
   */
  async Load(level) {
    let response;
    try {
      response = await this.fetch(`${this.base}${level}.json?t=${Date.now()}`, { cache: "no-store" });
    } catch (error) {
      return { state: "error", text: null, doc: null, message: `读不到配置：${error?.message || error}` };
    }
    if (response.status === 404) return { state: "missing", text: null, doc: null, message: "这一关还没有配置文件" };
    if (!response.ok) return { state: "error", text: null, doc: null, message: `读配置失败（HTTP ${response.status}）` };
    const text = await response.text();
    try {
      return { state: "ok", text, doc: JSON.parse(text), message: "" };
    } catch (error) {
      return { state: "invalid", text, doc: null, message: `配置不是合法的 JSON：${String(error?.message || error).slice(0, 120)}` };
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
   * 保存。→ { ok, mode: "server"|"local", reason, conflict?, details? }
   * 可写时 POST /__blockout/save；不可写时存本地草稿（调用方再决定要不要下载）。
   */
  async Save(level, doc) {
    const status = await this.Status();
    if (status.writable) {
      let response;
      try {
        response = await this.fetch(new URL("/__blockout/save", this.origin || "http://localhost").toString(), {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ level, doc, revision: status.revisions?.[level] ?? null }),
        });
      } catch (error) {
        return { ...this.SaveDraft(level, doc), reason: "保存时连不上本机预览服务，先存成本地草稿" };
      }
      let body = null;
      try { body = await response.json(); } catch (error) { body = null; }
      if (response.ok && body?.ok !== false) {
        this.ClearDraft(level);
        return { ok: true, mode: "server", reason: "", file: body?.file || null };
      }
      if (response.status === 409) return { ok: false, mode: "server", conflict: true, reason: "配置文件在外面被改过了，先同步再记" };
      if (response.status === 400) return { ok: false, mode: "server", reason: "配置没通过校验", details: body?.details || [] };
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
