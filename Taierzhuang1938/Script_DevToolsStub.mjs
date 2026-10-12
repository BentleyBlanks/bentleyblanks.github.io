// Script_DevTools 的剔除版：打包剔除开发工具时由构建脚本替换进来（见 Data_DevTools.mjs）。
// 宿主拿到 null 就当没有开发工具：不建齿轮、不响应 ` 键、菜单不列「Debug工具」「高级工具」。

export function CreateDevTools() {
  return null;
}
