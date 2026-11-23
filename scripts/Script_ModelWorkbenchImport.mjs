import fs from "node:fs";
import { ImportModelWorkbenchTask } from "./Script_ModelWorkbenchServer.mjs";

const input = process.argv[2];
if (!input) {
  console.error("用法：node scripts/Script_ModelWorkbenchImport.mjs <本机任务索引 JSON>");
  process.exitCode = 1;
} else {
  try {
    const records = JSON.parse(fs.readFileSync(input, "utf8").replace(/^\uFEFF/, ""));
    for (const record of Array.isArray(records) ? records : [records]) {
      const task = ImportModelWorkbenchTask(record);
      console.log(JSON.stringify({ id: task.id, title: task.title, state: task.state, workspace: task.workspace }));
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
