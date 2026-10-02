import { RECIPES, BakeDetailNormal, BakeSkinLut } from "./Script_TexBake.mjs";
self.onmessage = ({ data: { id, name, size } }) => {
  try {
    if (![128, 256, 512, 1024].includes(size)) throw new Error("Invalid preview size");
    let images;
    if (name === "DetailNormal") { const map = BakeDetailNormal(size); images = [{ name: "Normal", width: map.size, height: map.size, data: map.normal }]; }
    else if (name === "SkinLut") { const map = BakeSkinLut(); images = [{ name: "LUT", width: map.width, height: map.height, data: map.data }]; }
    else {
      if (!Object.hasOwn(RECIPES, name)) throw new Error("Unknown recipe");
      const maps = RECIPES[name](size);
      images = [["BaseColor", maps.albedo], ["Normal + Height(A)", maps.normal], ["ORM", maps.orm]]
        .map(([name, data]) => ({ name, data, width: maps.size, height: maps.size }));
    }
    self.postMessage({ id, images }, images.map(image => image.data.buffer));
  } catch (error) { self.postMessage({ id, error: error.message }); }
};
