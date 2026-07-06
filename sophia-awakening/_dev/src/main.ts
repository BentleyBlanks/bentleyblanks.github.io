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

// v3（Cookie Clicker 式重构）已转正为默认主入口；旧版游戏保留在 #classic 路由（代码不删，随时可回）。
if (location.hash.toLowerCase().includes("classic")) {
  import("./presentation/App")
    .then(({ bootstrapSophia }) => bootstrapSophia(root))
    .catch(showFatal);
} else {
  import("./v3/app")
    .then(({ bootstrapV3 }) => bootstrapV3(root))
    .catch(showFatal);
}
