import { BakeTextureJob } from "./Script_TextureBakeJob.mjs";

self.onmessage = ({ data: { name, size } }) => {
  try {
    const maps = BakeTextureJob(name, size);
    const buffers = Object.values(maps).filter(ArrayBuffer.isView).map(array => array.buffer);
    self.postMessage({ maps }, [...new Set(buffers)]);
  } catch (error) { self.postMessage({ error: error.message }); }
};
