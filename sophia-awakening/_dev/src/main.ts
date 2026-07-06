import "./style.css";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Missing #app root");
}

const showFatal = (error: unknown): void => {
  console.error(error);
  const fallback = document.createElement("pre");
  fallback.className = "fatal";
  fallback.textContent = `SOPHIA 启动失败\n${String(error)}`;
  document.body.appendChild(fallback);
};

// 路由：#whitebox=方块网格白盒测试原型；#classic=旧 Pixi 版；默认=v3（Cookie Clicker 式重构）。
const hash = location.hash.toLowerCase();
if (hash.includes("whitebox") || hash.includes("wb")) {
  import("./whitebox/app")
    .then(({ bootstrapWhitebox }) => bootstrapWhitebox(root))
    .catch(showFatal);
} else if (hash.includes("classic")) {
  import("./presentation/App")
    .then(({ bootstrapSophia }) => bootstrapSophia(root))
    .catch(showFatal);
} else {
  import("./v3/app")
    .then(({ bootstrapV3 }) => bootstrapV3(root))
    .catch(showFatal);
}
