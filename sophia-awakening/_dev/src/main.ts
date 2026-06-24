import "./style.css";
import { bootstrapSophia } from "./presentation/App";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Missing #app root");
}

bootstrapSophia(root).catch((error) => {
  console.error(error);
  const fallback = document.createElement("pre");
  fallback.className = "fatal";
  fallback.textContent = `SOPHIA 启动失败\n${String(error)}`;
  document.body.appendChild(fallback);
});
