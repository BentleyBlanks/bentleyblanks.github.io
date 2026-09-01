// 卢沟桥角色清单（Data_LugouCharacterManifest.json）的 Python 风格序列化。
//
// 清单本来是 Script_BakeLugouCharacters.py 用 json.dumps(indent=2) 写的。直接
// JSON.stringify 会把每一个没动过的数也重排一遍：`0.0` 变 `0`、
// `3.528594970703125e-05` 变 `0.00003528594970703125` —— 两千行全是假 diff，
// 真正改了什么反而看不见了。所以照 Python 的 repr 规则序列化，并且**只有真正
// 是整数的那几个键**才写成整数。任何要写清单的离线脚本（RestoreLugouPelvisTracks /
// MocapRetargetClips）都从这里 import，改序列化规则只改这一处；写盘前必须先跑
// 往返自检（把没动过的清单序列化一遍与磁盘原文逐字节比）。

export const INTEGER_KEYS = new Set([
  "schema", "vertices", "triangles", "limitedWeightVertices", "bytes",
  "sourceFrames", "sourceBones", "armatures", "skinnedMeshes",
]);

export function PythonFloat(value) {
  if (!Number.isFinite(value)) throw new Error(`cannot serialize ${value}`);
  // `round(-1e-9, 6)` 在 Python 里是 -0.0，清单里真的有几个。别把负零抹平。
  if (value === 0) return Object.is(value, -0) ? "-0.0" : "0.0";
  const magnitude = Math.abs(value);
  if (magnitude >= 1e-4 && magnitude < 1e16) {
    let text = String(value);
    if (text.includes("e")) text = value.toFixed(20).replace(/0+$/, "");
    return text.includes(".") ? text : `${text}.0`;
  }
  const parts = value.toExponential().match(/^(-?)(\d(?:\.\d+)?)e([+-])(\d+)$/);
  if (!parts) throw new Error(`cannot serialize ${value}`);
  return `${parts[1]}${parts[2]}e${parts[3]}${parts[4].padStart(2, "0")}`;
}

export function PythonJson(value, key = null, depth = 0) {
  const pad = "  ".repeat(depth + 1);
  const close = "  ".repeat(depth);
  if (typeof value === "number") {
    return INTEGER_KEYS.has(key) && Number.isInteger(value) ? String(value) : PythonFloat(value);
  }
  if (value === null || typeof value === "boolean" || typeof value === "string") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (!value.length) return "[]";
    return `[\n${value.map((item) => pad + PythonJson(item, key, depth + 1)).join(",\n")}\n${close}]`;
  }
  const entries = Object.entries(value);
  if (!entries.length) return "{}";
  return `{\n${entries
    .map(([name, item]) => `${pad}${JSON.stringify(name)}: ${PythonJson(item, name, depth + 1)}`)
    .join(",\n")}\n${close}}`;
}
