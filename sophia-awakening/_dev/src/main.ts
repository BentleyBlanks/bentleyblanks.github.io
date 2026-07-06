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

// #v3 路由：启动 v3 重构竖切片（Cookie Clicker 式经济）；否则启动现行游戏。
// 旧游戏原样保留、默认入口——v3 验证成熟前不动线上主入口。
if (location.hash.toLowerCase().includes("v3")) {
  import("./v3/app")
    .then(({ bootstrapV3 }) => bootstrapV3(root))
    .catch(showFatal);
} else {
  import("./presentation/App")
    .then(({ bootstrapSophia }) => bootstrapSophia(root))
    .catch(showFatal);
}
