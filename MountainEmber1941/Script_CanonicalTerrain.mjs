import { pathToFileURL } from "node:url";
import { createInterface } from "node:readline";
import { GetOperationLayout } from "./Data_Operations.mjs";
import { GetTerrainElevation } from "./Script_Rules.mjs";

export function GetCanonicalTerrainHeight(operationId, worldX, worldZ) {
  const operation = GetOperationLayout(operationId);
  if (!operation) throw new Error(`Unknown operation layout: ${operationId}`);
  const x = Number(worldX);
  const z = Number(worldZ);
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    throw new Error(`Canonical terrain coordinates must be finite: ${worldX}, ${worldZ}`);
  }
  return GetTerrainElevation({ x, z }, operation);
}

export function ResolveCanonicalTerrainQuery(query) {
  const operationId = String(query?.operationId ?? "");
  const x = Number(query?.x);
  const z = Number(query?.z);
  return {
    operationId,
    x,
    z,
    height: GetCanonicalTerrainHeight(operationId, x, z),
  };
}

async function RunServer() {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of lines) {
    try {
      process.stdout.write(`${JSON.stringify(ResolveCanonicalTerrainQuery(JSON.parse(line)))}\n`);
    } catch (error) {
      process.stdout.write(`${JSON.stringify({ error: error.message })}\n`);
    }
  }
}

async function RunCommandLine() {
  if (process.argv.includes("--server")) {
    await RunServer();
    return;
  }
  const [operationId, worldX, worldZ] = process.argv.slice(2);
  process.stdout.write(`${JSON.stringify(ResolveCanonicalTerrainQuery({ operationId, x: worldX, z: worldZ }))}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await RunCommandLine();
}
