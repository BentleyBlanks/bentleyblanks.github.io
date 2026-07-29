let threeModule;

try {
  threeModule = await import("https://cdn.jsdelivr.net/npm/three@0.185.1/build/three.module.js");
} catch {
  threeModule = await import("https://unpkg.com/three@0.185.1/build/three.module.js");
}

export default threeModule;
