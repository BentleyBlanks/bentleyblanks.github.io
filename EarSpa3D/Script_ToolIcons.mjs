// imagegen 生成的实物小图，工具栏与小铺共用。UI alpha 滤镜消除黑底。
const TOOL_ICONS = Object.freeze({
  scoop: 'EarScoop', tweezers: 'EarTweezers', drops: 'EarDrops',
  brush: 'SoftBrush', suction: 'MicroSuction', feather: 'FeatherDuster',
});

export function ToolIcon(id) {
  const name = TOOL_ICONS[id];
  const url = `./Textures/Ui/Icon_${name}.webp?v=ear014-ui-20260912`;
  return name ? `<img class="tool-icon" src="${url}" width="128" height="192" alt="" aria-hidden="true" draggable="false">` : '';
}
