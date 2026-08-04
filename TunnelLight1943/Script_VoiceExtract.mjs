// 抽台词：把八章剧本里的旁白（stage）与人物台词（say）导成一张配音清单。
//
// 这部剧本刻意几乎不写对白——117 条舞台提示、只有 18 句人物台词。所以配音的
// 主体是"旁白独白"，人物只在关键处开口，跟《勇敢的心》的处理是一路的。
//
// 行 id 用文本哈希：同一句话在别处复用就自然共用一个音频文件，行序调整
// 也不会让整批音频失效。
//
// 运行：node TunnelLight1943/Script_VoiceExtract.mjs [输出json]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SCRIPTS, VoiceLineId } from "./Script_Core.mjs";

const projectDir = path.dirname(fileURLToPath(import.meta.url));
const outPath = process.argv[2] || path.join(projectDir, "Audio", "Voice_Manifest.json");

// 声库只有三个中文声音（Kangkang 男 / Huihui 女 / Yaoyao 女），人物却更多，
// 所以靠音高与语速把角色区分开：爹压低放慢、柱子提高、妹妹又高又快。
const CAST = {
  "": { voice: "Kangkang", pitch: "-8%", rate: "-18%" },        // 旁白：沉一点、慢一点
  "爹": { voice: "Kangkang", pitch: "-22%", rate: "-22%" },
  "娘": { voice: "Huihui", pitch: "-6%", rate: "-14%" },
  "柱子": { voice: "Kangkang", pitch: "+16%", rate: "-4%" },
  "妹妹": { voice: "Yaoyao", pitch: "+30%", rate: "+6%" },
  "高传宝": { voice: "Kangkang", pitch: "-14%", rate: "-14%" },
  "交通员": { voice: "Kangkang", pitch: "+4%", rate: "+4%" },
  "民兵": { voice: "Kangkang", pitch: "+8%", rate: "+8%" },
  "年轻民兵": { voice: "Kangkang", pitch: "+14%", rate: "+10%" },
  "老人": { voice: "Kangkang", pitch: "-26%", rate: "-26%" },
};
const DEFAULT_CAST = { voice: "Kangkang", pitch: "0%", rate: "-8%" };

const seen = new Map();
for (const [key, beats] of Object.entries(SCRIPTS)) {
  for (const beat of beats) {
    for (const line of beat.lines || []) {
      const text = line.say || line.stage;
      if (!text) continue;
      const who = line.say ? (line.who || "") : "";
      const id = VoiceLineId(who, text);
      if (seen.has(id)) continue;
      const cast = CAST[who] ?? DEFAULT_CAST;
      seen.set(id, { id, who, text, chapter: key, ...cast });
    }
  }
}

const lines = [...seen.values()];
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify({ lines }, null, 2), "utf8");

const byWho = new Map();
for (const l of lines) byWho.set(l.who || "旁白", (byWho.get(l.who || "旁白") || 0) + 1);
const chars = lines.reduce((n, l) => n + l.text.length, 0);
console.log(`共 ${lines.length} 条，${chars} 字 → ${outPath}`);
console.log([...byWho.entries()].sort((a, b) => b[1] - a[1]).map((e) => `${e[0]}:${e[1]}`).join("  "));
