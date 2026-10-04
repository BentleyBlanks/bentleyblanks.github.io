// Shared by the loading worker and its synchronous recovery path. No DOM / three.
import { RECIPES, BakeDetailNormal, BakeSkinLut } from "./Script_TexBake.mjs";

export function BakeTextureJob(name, size) {
  if (name === "DetailNormal") return BakeDetailNormal(size);
  if (name === "SkinLut") return BakeSkinLut();
  if (!Object.hasOwn(RECIPES, name)) throw new Error(`Unknown texture recipe: ${name}`);
  return RECIPES[name](size);
}
