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

// 切换 hash 路由时重载（否则在 / 上手动加 #whitebox 不会切场景）。
let lastHash = location.hash.toLowerCase();
window.addEventListener("hashchange", () => {
  if (location.hash.toLowerCase() !== lastHash) location.reload();
});

// 路由：#matrix=算力格子矩阵白盒；#v3=Cookie Clicker 式重构；#classic=旧 Pixi 版；默认=多阶段白盒方块地图。
const hash = location.hash.toLowerCase();
const path = location.pathname.toLowerCase();
if (hash.includes("tbs")) {
  import("./tbs/app")
    .then(({ bootstrapTbs }) => bootstrapTbs(root))
    .catch(showFatal);
} else if (hash.includes("kangri") || path.includes("/kangri")) {
  import("./kangri/app")
    .then(({ bootstrapKangri }) => bootstrapKangri(root))
    .catch(showFatal);
} else if (hash.includes("matrix")) {
  import("./matrix/app")
    .then(({ bootstrapMatrix }) => bootstrapMatrix(root))
    .catch(showFatal);
} else if (hash.includes("v3")) {
  import("./v3/app")
    .then(({ bootstrapV3 }) => bootstrapV3(root))
    .catch(showFatal);
} else if (hash.includes("classic")) {
  import("./presentation/App")
    .then(({ bootstrapSophia }) => bootstrapSophia(root))
    .catch(showFatal);
} else {
  import("./whitebox/app")
    .then(({ bootstrapWhitebox }) => bootstrapWhitebox(root))
    .catch(showFatal);
}
